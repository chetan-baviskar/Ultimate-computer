/**
 * Authentication controllers — Firebase Authentication + Cloud Firestore.
 *
 * How registration works (and why it is safe):
 *   1. The browser creates the account with the Firebase Web SDK
 *      (POST firebase `accounts:signUp`) — the password never travels through
 *      this server.
 *   2. The browser then calls POST /api/auth/register with the freshly issued
 *      Firebase ID token. This controller verifies that token with the Admin
 *      SDK and creates the Firestore profile at users/{uid}, where uid is the
 *      VERIFIED Firebase Auth UID.
 *   3. If the profile write fails, the browser deletes the just-created
 *      Authentication user (rollback). If even that fails, a retry of the same
 *      registration resumes and completes the profile — no orphan accounts are
 *      silently left behind and no success is ever faked.
 *
 * Security rules for this file:
 *  - Identity comes from the verified ID token only (req.firebaseUser).
 *  - The role is a CONSTANT ('student') here. A `role` field in the request
 *    body is ignored, so public registration can never create Faculty/Admin
 *    accounts.
 *  - Nothing in this file deletes or rewrites pre-existing records.
 */

import {
  isFirebaseConfigured,
  getFirebaseAuth,
  runWithFreshChannel
} from '../config/firebase.js';
import { dataLayerUnavailable } from '../middleware/serviceUnavailable.js';
import {
  createProfile,
  getProfile,
  findProfileByEmail,
  profileExists,
  touchLastLogin,
  saveMigrationRequest,
  normalizeEmail
} from '../services/profiles.js';

/** Responses for a data layer that is not connected yet (honest 503). */
const ensureDataLayer = (res) => {
  if (isFirebaseConfigured()) return true;
  dataLayerUnavailable(res);
  return false;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns a normalised field or a {field, message} validation error. */
const readText = (value, { field, required = false, max = 200 }) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    if (required) return { error: `${field} is required.` };
    return { value: '' };
  }
  if (text.length > max) return { error: `${field} must be ${max} characters or fewer.` };
  return { value: text };
};

const readMobile = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { value: '' };
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) return { error: 'Enter a valid 10-digit mobile number.' };
  return { value: digits };
};

/**
 * POST /api/auth/register   (requires a valid Firebase ID token)
 * Creates the Firestore profile for the authenticated user.
 */
export const register = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  const { uid, email } = req.firebaseUser;
  if (!email) {
    return res.status(401).json({
      error: 'The authenticated account has no email address.',
      code: 'EMAIL_REQUIRED'
    });
  }

  // NOTE: req.body.role is deliberately NEVER read. Public registration can
  // only ever produce role: 'student'.
  const body = req.body || {};
  const fullName = readText(body.fullName, { field: 'Full name', required: true, max: 100 });
  if (fullName.error) return res.status(400).json({ error: fullName.error, code: 'VALIDATION_ERROR' });

  const mobile = readMobile(body.mobile);
  if (mobile.error) return res.status(400).json({ error: mobile.error, code: 'VALIDATION_ERROR' });

  const course = readText(body.course, { field: 'Course', max: 160 });
  if (course.error) return res.status(400).json({ error: course.error, code: 'VALIDATION_ERROR' });

  try {
    const existed = await profileExists(uid);
    const profile = await createProfile({
      uid,
      email: normalizeEmail(email),
      fullName: fullName.value,
      mobile: mobile.value,
      course: course.value,
      role: 'student' // constant — not derived from the request
    });

    console.log(`[Auth] ${existed ? 'Recovered' : 'Created'} student profile for uid=${uid} (${profile.email})`);
    return res.status(existed ? 200 : 201).json({ user: profile });
  } catch (err) {
    if (err?.code === 'EMAIL_EXISTS') {
      return res.status(409).json({
        error: 'This email address is already registered to another account.',
        code: 'EMAIL_EXISTS'
      });
    }
    console.error(`[Auth] Profile write failed for uid=${uid}:`, err?.message);
    return res.status(500).json({
      error:
        'Your sign-in account was created, but the student profile could not be saved. Please try registering again — your details will be completed, not duplicated.',
      code: 'PROFILE_WRITE_FAILED'
    });
  }
};

/**
 * POST /api/auth/login   (requires a valid Firebase ID token)
 * Returns the profile that belongs to the verified identity.
 */
export const login = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  const { uid, email } = req.firebaseUser;
  try {
    const profile = await getProfile(uid);
    if (!profile) {
      return res.status(409).json({
        error:
          'This email can sign in to Firebase, but no student profile exists yet. Please complete registration or contact the office.',
        code: 'PROFILE_MISSING'
      });
    }
    await touchLastLogin(uid);
    console.log(`[Auth] Student sign-in uid=${uid} (${email})`);
    return res.json({ user: profile });
  } catch (err) {
    console.error(`[Auth] Login failed for uid=${uid}:`, err?.message);
    return dataLayerUnavailable(res);
  }
};

/**
 * GET /api/auth/me   (requires a valid Firebase ID token)
 * Returns the caller's own profile — the only profile the token can address.
 */
export const me = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  try {
    const profile = await getProfile(req.firebaseUser.uid);
    if (!profile) {
      return res.status(409).json({
        error: 'No profile exists for this account yet.',
        code: 'PROFILE_MISSING'
      });
    }
    return res.json(profile);
  } catch (err) {
    console.error(`[Auth] Profile read failed for uid=${req.firebaseUser.uid}:`, err?.message);
    return dataLayerUnavailable(res);
  }
};

/**
 * POST /api/auth/migration-status   (public)
 * Tells the login/reset screens whether the submitted email has NO Firebase
 * Authentication user yet — i.e. whether it is likely an account created before
 * the upgrade that still needs migrating. It never reveals credentials and
 * never changes any account.
 */
export const migrationStatus = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  const email = normalizeEmail(req.body?.email);
  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.', code: 'VALIDATION_ERROR' });
  }

  try {
    let authUserExists = true;
    try {
      // Channel self-heal: this call needs a Google OAuth access token, which
      // is exactly what goes stale — rebuild + retry once instead of answering
      // 503 while the address is perfectly healthy.
      await runWithFreshChannel(() => getFirebaseAuth().getUserByEmail(email));
    } catch (err) {
      if (err?.code === 'auth/user-not-found') authUserExists = false;
      else throw err;
    }

    const profile = await findProfileByEmail(email);
    return res.json({
      email,
      // True => this address has no sign-in account in the new system yet.
      migrationNeeded: !authUserExists,
      hasStoredProfile: Boolean(profile)
    });
  } catch (err) {
    console.error('[Auth] migration-status failed:', err?.message);
    return dataLayerUnavailable(res);
  }
};

/**
 * POST /api/auth/migration-requests   (public)
 * Account-recovery path for students whose account predates the Firebase
 * upgrade: they record a request, the office verifies identity and migrates
 * the account. Passwords are NEVER reset and accounts are NEVER fabricated
 * automatically — a human verifies the request first.
 */
export const createMigrationRequest = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  const body = req.body || {};
  const email = normalizeEmail(body.email);
  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.', code: 'VALIDATION_ERROR' });
  }

  const fullName = readText(body.fullName, { field: 'Full name', max: 100 });
  if (fullName.error) return res.status(400).json({ error: fullName.error, code: 'VALIDATION_ERROR' });

  const mobile = readMobile(body.mobile);
  if (mobile.error) return res.status(400).json({ error: mobile.error, code: 'VALIDATION_ERROR' });

  try {
    // Already migrated (or never existed as a legacy record)? Answer honestly.
    let authUserExists = false;
    try {
      await getFirebaseAuth().getUserByEmail(email);
      authUserExists = true;
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }

    if (authUserExists) {
      return res.status(409).json({
        error: 'This email already has a working sign-in account. Please sign in or reset your password instead.',
        code: 'ACCOUNT_EXISTS'
      });
    }

    const result = await saveMigrationRequest({ email, fullName: fullName.value, mobile: mobile.value });
    console.log(
      `[Auth] Migration request ${result.created ? 'created' : 'already open'} for ${email}`
    );
    return res.status(result.created ? 201 : 200).json({
      status: result.created ? 'pending' : 'already-requested',
      request: result.request
    });
  } catch (err) {
    console.error('[Auth] migration request failed:', err?.message);
    return dataLayerUnavailable(res);
  }
};
