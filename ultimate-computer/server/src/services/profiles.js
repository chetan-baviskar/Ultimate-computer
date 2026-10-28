/**
 * Firestore persistence for student profiles.
 *
 * Document layout — one document per authenticated user, keyed by the Firebase
 * Auth UID (so a profile can never be created for an identity that does not
 * exist in Firebase Authentication):
 *
 *   users/{uid} = {
 *     uid,            // same as the document id / Firebase Auth UID
 *     email,          // lower-cased, from the VERIFIED ID token
 *     fullName,
 *     mobile,
 *     course,         // optional — no longer chosen during account creation
 *     role,           // ALWAYS written server-side; public registration => 'student'
 *     status,         // 'active' | 'disabled'
 *     authProvider,   // 'password' (Firebase Authentication)
 *     createdAt, updatedAt, lastLoginAt
 *   }
 *
 * Security rules for this file:
 *  - The role field is NEVER read from a request body; the controller passes
 *    the constant 'student' for public registration.
 *  - Timestamps come from the server clock (FieldValue.serverTimestamp()).
 *  - Nothing here deletes or rewrites pre-existing records.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore, runWithFreshChannel } from '../config/firebase.js';

export const USERS_COLLECTION = 'users';
export const MIGRATION_REQUESTS_COLLECTION = 'account_migration_requests';

const users = () => getFirestore().collection(USERS_COLLECTION);
const userDoc = (uid) => users().doc(uid);

/** Firestore Timestamp (or any {toDate}) -> ISO 8601 string for JSON responses. */
const toPlain = (value) =>
  value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;

/** Converts a Firestore snapshot into a plain JSON-safe profile object. */
const snapshotToProfile = (snap) => {
  const data = snap.data() || {};
  const profile = { uid: snap.id };
  for (const [key, value] of Object.entries(data)) profile[key] = toPlain(value);
  return profile;
};

/** Normalised comparison key for emails. */
export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * Reads a profile by UID. Returns null when it does not exist.
 *
 * Wrapped in `runWithFreshChannel`: this read sits directly behind student
 * login, admin login, GET /api/auth/me and every role check, so when the Admin
 * SDK's credential channel has gone stale the call rebuilds it and retries
 * instead of turning a working account into 503 DATA_LAYER_UNAVAILABLE.
 */
export const getProfile = async (uid) =>
  runWithFreshChannel(async () => {
    if (!uid) return null;
    const snap = await userDoc(uid).get();
    return snap.exists ? snapshotToProfile(snap) : null;
  });

/**
 * Finds a profile by its stored email (single-field query, no index needed).
 * Used for duplicate-registration guards and the account-migration check.
 */
export const findProfileByEmail = async (email) =>
  runWithFreshChannel(async () => {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const snap = await users().where('email', '==', normalized).limit(1).get();
    if (snap.empty) return null;
    return snapshotToProfile(snap.docs[0]);
  });

/**
 * Lists registered student profiles for the Admin Dashboard.
 *
 * Returns every profile that is NOT an administrator (administrator accounts
 * are staff, not students), sorted by name. This is only ever reached through
 * the admin-guarded controller — it is never exposed on a public route.
 */
export const listStudentProfiles = async ({ limit = 500 } = {}) =>
  runWithFreshChannel(async () => {
    const snap = await users().limit(limit).get();
    return snap.docs
      .map(snapshotToProfile)
      .filter((profile) => profile.role !== 'admin')
      .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
  });

/** True when a profile already exists for this UID. */
export const profileExists = async (uid) =>
  runWithFreshChannel(async () => {
    const snap = await userDoc(uid).get();
    return snap.exists;
  });

const ValidationError = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

/**
 * Creates the profile document for a freshly authenticated user.
 *
 * Guards (inside one transaction, so two concurrent requests cannot both win):
 *  - the profile for this UID must not already exist (idempotent resume), and
 *  - no OTHER profile may already hold this email address (duplicate guard).
 *
 * `role` is supplied by the caller as a CONSTANT — public registration passes
 * 'student'; it is never taken from a request body.
 *
 * @throws {Error & {code: 'EMAIL_EXISTS'}} when the email belongs to another uid
 * @throws {Error & {code: 'VALIDATION_ERROR'}} when required fields are missing
 */
export const createProfile = async ({ uid, email, fullName, mobile = '', course = '', role = 'student' }) => {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = String(fullName || '').trim();

  if (!uid) throw ValidationError('VALIDATION_ERROR', 'A Firebase UID is required to create a profile.');
  if (!normalizedEmail) throw ValidationError('VALIDATION_ERROR', 'An email address is required.');
  if (!trimmedName) throw ValidationError('VALIDATION_ERROR', 'Full name is required.');

  const record = {
    uid,
    email: normalizedEmail,
    fullName: trimmedName,
    mobile: String(mobile || '').trim(),
    course: String(course || '').trim(),
    role, // constant from the caller — never user input
    status: 'active',
    authProvider: 'password',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  // The Firestore client is resolved INSIDE the retry closure, so a channel
  // rebuild that happens mid-call is picked up by the single automatic retry
  // (a stale-channel failure must not surface as PROFILE_WRITE_FAILED).
  await runWithFreshChannel(() => getFirestore().runTransaction(async (tx) => {
    const [ownSnap, emailSnap] = await Promise.all([
      tx.get(userDoc(uid)),
      tx.get(users().where('email', '==', normalizedEmail).limit(1))
    ]);

    if (!emailSnap.empty && emailSnap.docs[0].id !== uid) {
      throw ValidationError('EMAIL_EXISTS', 'This email address is already registered.');
    }
    if (ownSnap.exists) return; // already created — resume without overwriting

    tx.set(userDoc(uid), record);
  }));

  return getProfile(uid);
};

/**
 * Updates the caller-owned editable fields only. Callers pass an explicit
 * allow-list — role, uid, email and status can never be changed from here.
 */
export const updateProfile = async (uid, fields) => {
  const allowed = {};
  if (fields.fullName !== undefined) allowed.fullName = String(fields.fullName).trim();
  if (fields.mobile !== undefined) allowed.mobile = String(fields.mobile).trim();
  if (Object.keys(allowed).length === 0) return getProfile(uid);

  await runWithFreshChannel(() => userDoc(uid).update({ ...allowed, updatedAt: FieldValue.serverTimestamp() }));
  return getProfile(uid);
};

/**
 * Writes ONLY the `course` field of a student profile (never any other
 * field), used to associate an APPROVED admission application with the
 * student who owns the profile. Passing '' clears the value.
 *
 * Not reachable from any route by itself — the applications controller calls
 * it server-side after an admin status change, so a client can never set a
 * course directly.
 *
 * @throws {Error} when the profile does not exist (Firestore update guard)
 */
export const setProfileCourse = async (uid, course) => {
  const value = String(course || '').trim();
  if (!uid) throw ValidationError('VALIDATION_ERROR', 'A Firebase UID is required to set a course.');

  await runWithFreshChannel(() =>
    userDoc(uid).update({ course: value, updatedAt: FieldValue.serverTimestamp() })
  );
  return getProfile(uid);
};

/** Records a successful sign-in (best effort — never fails a login). */
export const touchLastLogin = async (uid) => {
  try {
    await userDoc(uid).update({ lastLoginAt: FieldValue.serverTimestamp() });
  } catch (err) {
    console.warn(`[Profiles] Could not record lastLoginAt for ${uid}: ${err?.message}`);
  }
};

/**
 * Stores an account-migration request from a pre-upgrade student.
 * Returns { created: boolean, ...request } — an existing open request for the
 * same email is returned instead of duplicated (idempotent, no spam).
 */
export const saveMigrationRequest = async ({ email, fullName = '', mobile = '' }) => {
  const normalizedEmail = normalizeEmail(email);
  return runWithFreshChannel(async () => {
    const db = getFirestore();
    // Single-field query (no composite index required); the status filter is
    // applied in memory so this works on a brand-new collection.
    const prior = await db
      .collection(MIGRATION_REQUESTS_COLLECTION)
      .where('email', '==', normalizedEmail)
      .limit(10)
      .get();

    const open = prior.docs.find((snap) => (snap.data()?.status || 'pending') === 'pending');
    if (open) {
      return { created: false, request: { id: open.id, ...toPlainObject(open.data()) } };
    }

    const docRef = await db.collection(MIGRATION_REQUESTS_COLLECTION).add({
      email: normalizedEmail,
      fullName: String(fullName || '').trim(),
      mobile: String(mobile || '').trim(),
      status: 'pending',
      source: 'student-portal',
      createdAt: FieldValue.serverTimestamp()
    });

    return { created: true, request: { id: docRef.id, email: normalizedEmail, status: 'pending' } };
  });
};

/** Plain-object copy of a Firestore document with Timestamps as ISO strings. */
const toPlainObject = (data = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(data)) out[key] = toPlain(value);
  return out;
};
