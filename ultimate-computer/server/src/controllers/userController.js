/**
 * Student profile controllers (Firestore-backed).
 *
 * Access rules enforced here:
 *  - The caller is identified ONLY by the verified Firebase ID token.
 *  - A student may read/update ONLY their own document (uid from the token
 *    must equal :uid). Any other uid is a 403 — even for a real uid of a
 *    different student.
 *  - Administrators may read any profile; their role comes from their stored
 *    Firestore profile, never from the request.
 *  - PATCH only ever writes the allow-listed editable fields (fullName,
 *    mobile). role, uid, email and status cannot change through this route.
 */

import { dataLayerUnavailable } from '../middleware/serviceUnavailable.js';
import { loadRole } from '../middleware/auth.js';
import { getProfile, updateProfile, listStudentProfiles } from '../services/profiles.js';

/** 401/403/503 helper: returns true when the response was already sent. */
const authorizeOwnerOrAdmin = async (req, res) => {
  const targetUid = req.params.uid;
  if (req.firebaseUser.uid === targetUid) return false; // own record — allowed

  let role = null;
  try {
    role = await loadRole(req.firebaseUser.uid, req.firebaseUser);
  } catch (err) {
    console.error('[Users] Failed to read role:', err?.message);
    dataLayerUnavailable(res);
    return true;
  }

  if (role !== 'admin') {
    res.status(403).json({
      error: 'You can only access your own student profile.',
      code: 'FORBIDDEN'
    });
    return true;
  }
  return false;
};

/**
 * GET /api/users/:uid  (requires a valid Firebase ID token)
 * Own profile, or any profile for an administrator.
 */
export const getProfileById = async (req, res) => {
  if (await authorizeOwnerOrAdmin(req, res)) return;

  try {
    const profile = await getProfile(req.params.uid);
    if (!profile) {
      return res.status(404).json({ error: 'No profile found for this account.', code: 'PROFILE_NOT_FOUND' });
    }
    return res.json(profile);
  } catch (err) {
    console.error('[Users] Profile read failed:', err?.message);
    return dataLayerUnavailable(res);
  }
};

/**
 * GET /api/users/students  (admin only)
 * Lists the registered student profiles shown in the Admin Dashboard.
 * The role is read from the caller's stored Firestore profile — a `role` in
 * the request can never grant access, and students are refused with 403.
 */
export const listStudents = async (req, res) => {
  let role = null;
  try {
    role = await loadRole(req.firebaseUser.uid, req.firebaseUser);
  } catch (err) {
    console.error('[Users] Failed to read role:', err?.message);
    return dataLayerUnavailable(res);
  }
  if (role !== 'admin') {
    return res.status(403).json({
      error: 'Administrative privileges are required for this operation.',
      code: 'ADMIN_REQUIRED'
    });
  }

  try {
    return res.json(await listStudentProfiles());
  } catch (err) {
    console.error('[Users] Student listing failed:', err?.message);
    return dataLayerUnavailable(res);
  }
};

/**
 * PATCH /api/users/:uid  (requires a valid Firebase ID token)
 * Updates fullName and mobile only — own profile, or any profile for an
 * administrator. role/uid/email/status are ignored if supplied.
 */
export const updateProfileById = async (req, res) => {
  if (await authorizeOwnerOrAdmin(req, res)) return;

  const body = req.body || {};
  const fields = {};

  if (body.fullName !== undefined) {
    const name = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Full name cannot be empty.', code: 'VALIDATION_ERROR' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Full name must be 100 characters or fewer.', code: 'VALIDATION_ERROR' });
    }
    fields.fullName = name;
  }

  if (body.mobile !== undefined) {
    const raw = typeof body.mobile === 'string' ? body.mobile.trim() : '';
    const digits = raw.replace(/\D/g, '');
    if (raw && digits.length !== 10) {
      return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.', code: 'VALIDATION_ERROR' });
    }
    fields.mobile = digits;
  }

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({
      error: 'No editable profile fields were supplied (fullName, mobile).',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    const before = await getProfile(req.params.uid);
    if (!before) {
      return res.status(404).json({ error: 'No profile found for this account.', code: 'PROFILE_NOT_FOUND' });
    }
    const profile = await updateProfile(req.params.uid, fields);
    return res.json(profile);
  } catch (err) {
    console.error('[Users] Profile update failed:', err?.message);
    if (err?.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'No profile found for this account.', code: 'PROFILE_NOT_FOUND' });
    }
    return dataLayerUnavailable(res);
  }
};
