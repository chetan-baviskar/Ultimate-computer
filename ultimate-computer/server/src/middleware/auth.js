/**
 * Firebase ID-token verification middleware.
 *
 * The browser signs in with the Firebase Web SDK (email/password) and sends the
 * resulting Firebase ID token on every protected request as
 * `Authorization: Bearer <token>`. This middleware verifies that token with the
 * Firebase Admin SDK, so `req.firebaseUser` is ALWAYS a server-verified identity
 * (uid + email issued by Firebase) — never something the client merely claims.
 *
 * Security rules for this file:
 *  - Never accept a uid/email/role from the request body or query string as
 *    proof of identity. Identity comes ONLY from the verified ID token.
 *  - Role is never taken from the client. It comes from server-written records
 *    only: the Firestore profile document (see services/profiles.js) and/or
 *    the `admin` custom claim, which ONLY the Firebase Admin SDK can set
 *    (scripts/provision-admin.mjs) — a browser can never mint either one.
 *  - If Firebase is not configured, answer 503 — never fall through as
 *    authenticated.
 */

import { getFirebaseAuth, isFirebaseConfigured } from '../config/firebase.js';
import { dataLayerUnavailable } from './serviceUnavailable.js';
import { getProfile } from '../services/profiles.js';

/** Reads and validates the `Authorization: Bearer <token>` header. */
const readBearerToken = (req) => {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
};

/**
 * OPTIONAL session: verifies the ID token when one is presented, and treats
 * the request as anonymous when there is none.
 *
 * Used by routes that serve both guests and signed-in users (e.g. submitting
 * an admission application). A PRESENTED token is still fully verified — an
 * invalid or expired one answers 401 instead of silently downgrading the
 * request to a guest.
 */
export const optionalAuth = async (req, res, next) => {
  if (!isFirebaseConfigured() || !getFirebaseAuth()) return dataLayerUnavailable(res);

  const token = readBearerToken(req);
  if (!token) {
    req.firebaseUser = null;
    return next();
  }

  try {
    req.firebaseUser = await getFirebaseAuth().verifyIdToken(token);
  } catch (err) {
    console.warn(`[Auth] Rejected ID token on optional-auth route: ${err?.code || 'invalid'}`);
    return res.status(401).json({
      error: 'Your session could not be verified. Please sign in again.',
      code: 'INVALID_TOKEN'
    });
  }
  return next();
};

/**
 * Requires a valid Firebase ID token.
 * On success attaches `req.firebaseUser` (decoded token: uid, email, ...) and
 * calls next() OUTSIDE the try/catch, so an error thrown by the route handler
 * can never be misreported as an authentication failure.
 *
 * Failure responses (honest, never a bypass):
 *   503 DATA_LAYER_UNAVAILABLE          Firebase Admin SDK not configured
 *   401 NO_TOKEN                        no Authorization header
 *   401 TOKEN_EXPIRED / INVALID_TOKEN   token rejected by Firebase
 */
export const requireAuth = async (req, res, next) => {
  if (!isFirebaseConfigured() || !getFirebaseAuth()) return dataLayerUnavailable(res);

  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in and try again.',
      code: 'NO_TOKEN'
    });
  }

  let decoded = null;
  try {
    // Checks signature, expiry and audience against this Firebase project.
    decoded = await getFirebaseAuth().verifyIdToken(token);
  } catch (err) {
    const expired = err?.code === 'auth/id-token-expired';
    console.warn(`[Auth] Rejected ID token: ${expired ? 'expired' : err?.code || 'invalid'}`);
    return res.status(401).json({
      error: expired
        ? 'Your session has expired. Please sign in again.'
        : 'Your session could not be verified. Please sign in again.',
      code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
    });
  }

  req.firebaseUser = decoded;
  return next();
};

/**
 * Requires a verified session AND an existing Firestore profile for that user.
 * Attaches `req.firebaseUser` and `req.profile`.
 * Responds itself (503) when the profile store cannot be read.
 */
export const requireAuthWithProfile = [
  requireAuth,
  async (req, res, next) => {
    try {
      const profile = await getProfile(req.firebaseUser.uid);
      if (!profile) {
        return res.status(409).json({
          error:
            'Your sign-in was verified, but no student profile exists for this account yet. Please complete registration or contact the office.',
          code: 'PROFILE_MISSING'
        });
      }
      req.profile = profile;
      return next();
    } catch (err) {
      console.error('[Auth] Failed to read profile:', err?.message);
      return dataLayerUnavailable(res);
    }
  }
];

/**
 * Loads the caller's role from server-written records (never from the request).
 *
 * Resolution order:
 *   1. The Firestore profile at users/{uid} — authoritative and revocable
 *      instantly: when it exists, it decides ('student' | 'admin').
 *   2. The custom claims inside the VERIFIED ID token — `admin: true` or
 *      `role: 'admin'` — used when the profile document is missing. Claims
 *      are set exclusively by the Admin SDK (scripts/provision-admin.mjs);
 *      a client cannot forge one.
 *   3. null — no server record at all (never treated as admin).
 */
export const loadRole = async (uid, decodedToken = null) => {
  const profile = await getProfile(uid);
  if (profile) return profile.role === 'admin' ? 'admin' : 'student';
  if (decodedToken && (decodedToken.admin === true || decodedToken.role === 'admin')) return 'admin';
  return null;
};

/**
 * Wraps a handler so it only runs for a verified session whose role — read
 * server-side from the Firestore profile / Admin-SDK custom claim — is
 * 'admin'. Nothing from the request can influence it.
 */
export const requireAdmin = (handler) => async (req, res, next) => {
  await requireAuth(req, res, async () => {
    let role = null;
    try {
      role = await loadRole(req.firebaseUser.uid, req.firebaseUser);
    } catch (err) {
      console.error('[Auth] Failed to read role:', err?.message);
      return dataLayerUnavailable(res);
    }
    if (role !== 'admin') {
      return res.status(403).json({
        error: 'Administrative privileges are required for this operation.',
        code: 'ADMIN_REQUIRED'
      });
    }
    return handler(req, res, next);
  });
};
