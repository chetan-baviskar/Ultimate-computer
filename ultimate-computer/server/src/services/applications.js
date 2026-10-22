/**
 * Firestore persistence for admission applications.
 *
 * Document layout — one document per submitted application:
 *
 *   admission_applications/{id} = {
 *     id,                    // document id (used by the admin dashboard)
 *     applicationId,         // human-readable UC-2026-XXXXXX reference
 *     studentUid,            // Firebase Auth UID of the authenticated applicant
 *                            //   ('guest-student' for applicants who signed out)
 *     submittedByUid,        // the VERIFIED uid that created it, or 'anonymous'
 *     fullName, email, mobile, dateOfBirth, gender, address, city, education,
 *     courseId, courseName,
 *     previousComputerKnowledge, preferredContactMethod, additionalMessage,
 *     courseFee, registrationFee, totalFee,
 *     status,                // 'Pending' | 'Approved' | 'Rejected'
 *     adminRemarks,
 *     createdAt, updatedAt   // server clock
 *   }
 *
 * Security rules for this file:
 *  - `studentUid` / `submittedByUid` are written from the VERIFIED ID token
 *    when the applicant is signed in; a uid supplied by the body is never
 *    trusted for an authenticated request, and an unauthenticated applicant is
 *    recorded as the constant 'guest-student'.
 *  - Reads are only reachable through the controller, which scopes a student
 *    to their OWN documents (uid + verified e-mail from the token) and lets
 *    administrators read everything.
 *  - All queries below are single-field queries with in-memory sorting, so
 *    they work on this collection without requiring composite indexes.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.js';

export const APPLICATIONS_COLLECTION = 'admission_applications';

/** Statuses the admin dashboard and student dashboard understand. */
export const APPLICATION_STATUSES = ['Pending', 'Approved', 'Rejected'];

/** Value stored for applicants who submitted the form while signed out. */
export const GUEST_UID = 'guest-student';

const TEXT_LIMITS = {
  applicationId: 40,
  fullName: 100,
  email: 160,
  mobile: 20,
  dateOfBirth: 40,
  gender: 30,
  address: 300,
  city: 80,
  education: 160,
  courseId: 80,
  courseName: 160,
  previousComputerKnowledge: 60,
  preferredContactMethod: 40,
  additionalMessage: 600,
  courseFee: 80,
  registrationFee: 80,
  totalFee: 80,
  adminRemarks: 600
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const APPLICATION_ID_PATTERN = /^UC-\d{4}-[A-Z0-9]{4,12}$/;

const applications = () => getFirestore().collection(APPLICATIONS_COLLECTION);
const applicationDoc = (id) => applications().doc(id);

/** Firestore Timestamp (or any {toDate}) -> ISO 8601 string for JSON. */
const toPlain = (value) =>
  value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;

/** Converts a snapshot into the plain JSON object the frontend expects. */
const snapshotToApplication = (snap) => {
  const data = snap.data() || {};
  const record = { id: snap.id };
  for (const [key, value] of Object.entries(data)) record[key] = toPlain(value);
  return record;
};

/** Newest first — matches what both dashboards display. */
const newestFirst = (a, b) =>
  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();

const ValidationError = (message) => {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  return err;
};

const notFoundError = () => {
  const err = new Error('No application exists with this id.');
  err.code = 'NOT_FOUND';
  return err;
};

/** Reads an allow-listed string field from a body. */
const readText = (body, field, { required = false } = {}) => {
  const raw = body?.[field];
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    if (required) throw ValidationError(`${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is required.`);
    return '';
  }
  const max = TEXT_LIMITS[field] || 300;
  if (text.length > max) throw ValidationError(`${field} must be ${max} characters or fewer.`);
  return text;
};

/**
 * Normalises an application payload out of a request body.
 * Only allow-listed fields survive; identity fields come from the caller
 * (see the controller).
 *
 * @throws {Error & {code: 'VALIDATION_ERROR'}} on missing/invalid input
 */
export const buildApplicationFields = (body = {}) => {
  const fullName = readText(body, 'fullName', { required: true });
  const email = readText(body, 'email', { required: true }).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw ValidationError('Enter a valid email address.');

  const mobileRaw = readText(body, 'mobile', { required: true }).replace(/\D/g, '');
  if (mobileRaw.length !== 10) throw ValidationError('Enter a valid 10-digit mobile number.');

  const courseId = readText(body, 'courseId', { required: true });
  const courseName = readText(body, 'courseName', { required: true });

  // status / adminRemarks changes are admin-only and happen through PATCH:
  // on submission a record always starts as 'Pending' with no remarks, so a
  // `status` field in the body is ignored.
  return {
    applicationId: readText(body, 'applicationId'),
    fullName,
    email,
    mobile: mobileRaw,
    dateOfBirth: readText(body, 'dateOfBirth'),
    gender: readText(body, 'gender'),
    address: readText(body, 'address'),
    city: readText(body, 'city'),
    education: readText(body, 'education'),
    courseId,
    courseName,
    previousComputerKnowledge: readText(body, 'previousComputerKnowledge'),
    preferredContactMethod: readText(body, 'preferredContactMethod'),
    additionalMessage: readText(body, 'additionalMessage'),
    courseFee: readText(body, 'courseFee'),
    registrationFee: readText(body, 'registrationFee'),
    totalFee: readText(body, 'totalFee'),
    status: 'Pending',
    adminRemarks: ''
  };
};

/** Generates the UC-2026-XXXXXX reference the UI displays. */
const generateApplicationId = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
  return `UC-${new Date().getFullYear()}-${random}`;
};

/** Picks an applicationId that no stored document already uses. */
const allocateApplicationId = async (preferred) => {
  let candidate = APPLICATION_ID_PATTERN.test(String(preferred || '')) ? preferred : null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!candidate) candidate = generateApplicationId();
    const clash = await applications().where('applicationId', '==', candidate).limit(1).get();
    if (clash.empty) return candidate;
    candidate = null;
  }
  return generateApplicationId();
};

/* ------------------------------------------------------------------ reads */

/**
 * Applications owned by one applicant: everything stored under their uid OR
 * their verified e-mail (covers applications submitted before signing in).
 * Two single-field queries, merged and de-duplicated.
 */
export const listApplicationsForApplicant = async ({ uid, email }) => {
  const queries = [];
  if (uid) queries.push(applications().where('studentUid', '==', uid).limit(100).get());
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail) queries.push(applications().where('email', '==', normalizedEmail).limit(100).get());

  const snapshots = await Promise.all(queries);
  const seen = new Set();
  const merged = [];
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      merged.push(snapshotToApplication(doc));
    }
  }
  return merged.sort(newestFirst);
};

/** Every application (admin view). */
export const listAllApplications = async () => {
  const snap = await applications().limit(500).get();
  return snap.docs.map(snapshotToApplication).sort(newestFirst);
};

/**
 * The first ACTIVE (not rejected) application an applicant holds for a course.
 * The caller decides which identity (uid / e-mail) is being looked up — the
 * controller only ever passes identities it verified itself.
 */
export const findActiveApplication = async ({ uid, email, courseId }) => {
  const candidates = [];
  if (uid) {
    const snap = await applications().where('studentUid', '==', uid).limit(50).get();
    candidates.push(...snap.docs);
  }
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail) {
    const snap = await applications().where('email', '==', normalizedEmail).limit(50).get();
    candidates.push(...snap.docs);
  }

  const active = candidates
    .map(snapshotToApplication)
    .filter((app) => app.courseId === courseId && app.status !== 'Rejected')
    .sort(newestFirst);
  return active[0] || null;
};

/** One application by document id, or null. */
export const getApplication = async (id) => {
  if (!id) return null;
  const snap = await applicationDoc(id).get();
  return snap.exists ? snapshotToApplication(snap) : null;
};

/* ----------------------------------------------------------------- writes */

/**
 * Creates an application.
 *
 * @param {object} fields  allow-listed payload from buildApplicationFields
 * @param {object} owner   { studentUid, submittedByUid } taken from the
 *                         verified identity by the controller
 */
export const createApplication = async (fields, { studentUid, submittedByUid }) => {
  const rest = { ...fields };
  const applicationId = await allocateApplicationId(rest.applicationId);
  delete rest.applicationId;
  const record = {
    ...rest,
    applicationId,
    studentUid: studentUid || GUEST_UID,
    submittedByUid: submittedByUid || 'anonymous',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  const ref = await applications().add(record);
  const created = await ref.get();
  console.log(
    `[Applications] Created ${applicationId} (studentUid=${record.studentUid}, course=${record.courseId})`
  );
  return snapshotToApplication(created);
};

/**
 * Updates status / admin remarks (admin only).
 *
 * @throws {Error & {code: 'NOT_FOUND'}} when the application is gone
 */
export const updateApplicationById = async (id, { status, adminRemarks }) => {
  const ref = applicationDoc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFoundError();

  const patch = { updatedAt: FieldValue.serverTimestamp() };
  if (status !== undefined) {
    if (!APPLICATION_STATUSES.includes(status)) {
      throw ValidationError(`Status must be one of: ${APPLICATION_STATUSES.join(', ')}.`);
    }
    patch.status = status;
    patch.statusUpdatedAt = FieldValue.serverTimestamp();
  }
  if (adminRemarks !== undefined) {
    const text = String(adminRemarks).slice(0, TEXT_LIMITS.adminRemarks);
    patch.adminRemarks = text;
  }

  await ref.update(patch);
  const updated = await ref.get();
  return snapshotToApplication(updated);
};

/**
 * Deletes an application (admin only).
 *
 * @throws {Error & {code: 'NOT_FOUND'}}
 */
export const deleteApplicationById = async (id) => {
  const ref = applicationDoc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFoundError();
  await ref.delete();
  return { id, deleted: true };
};
