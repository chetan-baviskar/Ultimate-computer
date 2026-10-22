/**
 * Firestore persistence for the course catalogue.
 *
 * Document layout — one document per course:
 *
 *   courses/{courseId} = {
 *     id,                 // same as the document id (stable, human-readable)
 *     courseName, shortDescription, detailedDescription,
 *     duration, fee, registrationFee, totalFee,
 *     eligibility, level, category, imageUrl,
 *     status,             // 'active' | 'inactive'
 *     modules[], practicalTraining[], skillsCovered[],
 *     careerOpportunities[], courseHighlights[],
 *     admissionInfo,
 *     createdAt, updatedAt  // server clock (FieldValue.serverTimestamp())
 *   }
 *
 * The fields are exactly the ones the bundled catalogue already exposed, so
 * the public pages (Home / Courses / Course Details / Fees) keep working
 * unchanged.
 *
 * Security rules for this file:
 *  - Writing is only ever reached through the admin-guarded controller; this
 *    module never reads a role or an identity from a request.
 *  - Only the allow-listed fields above can be written; anything else in a
 *    request body is dropped.
 *  - Timestamps come from the server clock, never from the client.
 *  - Seeding only ever runs while the collection is completely empty, and it
 *    uses the bundled ids as document ids, so it is idempotent and can never
 *    resurrect a course an administrator deleted.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase.js';
import { coursesData } from '../data/coursesData.js';

export const COURSES_COLLECTION = 'courses';

/** Course status values the UI knows about. */
const STATUSES = ['active', 'inactive'];

/** Fields an admin may write, with their max length (strings). */
const TEXT_FIELDS = {
  courseName: 160,
  shortDescription: 600,
  detailedDescription: 4000,
  duration: 80,
  fee: 80,
  registrationFee: 80,
  totalFee: 80,
  eligibility: 300,
  level: 60,
  category: 80,
  imageUrl: 400,
  admissionInfo: 600
};

/** Array fields an admin may write (structure is validated shallowly). */
const ARRAY_FIELDS = ['modules', 'practicalTraining', 'skillsCovered', 'careerOpportunities', 'courseHighlights'];

const courses = () => getFirestore().collection(COURSES_COLLECTION);
const courseDoc = (id) => courses().doc(id);

/** Firestore Timestamp (or any {toDate}) -> ISO 8601 string for JSON. */
const toPlain = (value) =>
  value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;

/** Converts a snapshot into the plain JSON object the frontend expects. */
export const snapshotToCourse = (snap) => {
  const data = snap.data() || {};
  const course = { id: snap.id };
  for (const [key, value] of Object.entries(data)) course[key] = toPlain(value);
  return course;
};

/** Validation error carrying a machine-readable code. */
const ValidationError = (message) => {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  return err;
};

/** Not-found error raised by create/update/delete of a missing document. */
const notFoundError = () => {
  const err = new Error('No course exists with this id.');
  err.code = 'NOT_FOUND';
  return err;
};

/** Sort comparator matching the bundled catalogue order (by name). */
const byName = (a, b) => String(a.courseName || '').localeCompare(String(b.courseName || ''));

/** Stable, URL-friendly id fragment for a course name. */
const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'course';

/**
 * Extracts only the allow-listed fields from a request body.
 * Unknown fields (id, role, createdAt, ...) are silently dropped so a client
 * can never overwrite server-owned data.
 *
 * @throws {Error & {code: 'VALIDATION_ERROR'}} when a supplied value is invalid
 */
export const sanitizeCourseFields = (body = {}) => {
  const out = {};

  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (body[field] === undefined) continue;
    const text = typeof body[field] === 'string' ? body[field].trim() : '';
    if (text.length > max) throw ValidationError(`${field} must be ${max} characters or fewer.`);
    out[field] = text;
  }

  if (body.status !== undefined) {
    const status = String(body.status || '').trim().toLowerCase();
    if (!STATUSES.includes(status)) {
      throw ValidationError(`Status must be one of: ${STATUSES.join(', ')}.`);
    }
    out.status = status;
  }

  for (const field of ARRAY_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (!Array.isArray(value)) throw ValidationError(`${field} must be a list.`);
    // Deep-copy to plain JSON so nothing non-serialisable (functions, class
    // instances) can ever reach Firestore.
    out[field] = JSON.parse(JSON.stringify(value));
  }

  return out;
};

/** Applies the required create-time fields on top of sanitized input. */
const buildCreateRecord = (fields) => ({
  ...fields,
  courseName: fields.courseName,
  status: fields.status || 'active',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp()
});

/* ------------------------------------------------------------------ reads */

/** All courses, sorted by name (the public catalogue). */
export const listCourses = async () => {
  const snap = await courses().get();
  return snap.docs.map(snapshotToCourse).sort(byName);
};

/** One course by document id, or null when it does not exist. */
export const getCourse = async (id) => {
  if (!id) return null;
  const snap = await courseDoc(id).get();
  return snap.exists ? snapshotToCourse(snap) : null;
};

/* ----------------------------------------------------------------- writes */

/**
 * Creates a course. The document id is derived from the course name (so ids
 * stay readable and stable in URLs) with a numeric suffix on collision.
 *
 * @throws {Error & {code: 'VALIDATION_ERROR'}} when courseName is missing
 */
export const createCourse = async (fields) => {
  if (!fields.courseName) throw ValidationError('Course name is required.');

  const base = slugify(fields.courseName);
  let lastError = null;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const id = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      const ref = courseDoc(id);
      await ref.create(buildCreateRecord({ ...fields, id }));
      const created = await ref.get();
      return snapshotToCourse(created);
    } catch (err) {
      // ALREADY_EXISTS => another course holds this id — try the next suffix.
      if (err?.code !== 6 && err?.code !== 'already-exists') throw err;
      lastError = err;
    }
  }
  throw lastError || ValidationError('Could not allocate a unique course id.');
};

/**
 * Updates the allow-listed fields of an existing course (partial update —
 * fields absent from `fields` keep their current value).
 *
 * @throws {Error & {code: 'NOT_FOUND'}} when the course does not exist
 */
export const updateCourse = async (id, fields) => {
  const ref = courseDoc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFoundError();

  await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
  const updated = await ref.get();
  return snapshotToCourse(updated);
};

/**
 * Deletes a course.
 *
 * @throws {Error & {code: 'NOT_FOUND'}} when the course does not exist
 */
export const deleteCourse = async (id) => {
  const ref = courseDoc(id);
  const snap = await ref.get();
  if (!snap.exists) throw notFoundError();
  await ref.delete();
  return { id, deleted: true };
};

/* ----------------------------------------------------------------- seeding */

/**
 * Writes the bundled catalogue into Firestore, but ONLY while the collection
 * is completely empty. Uses the bundled ids as document ids, so running it
 * twice can never create duplicates and a deleted course is never restored.
 *
 * @returns {Promise<{seeded: boolean, count: number}>}
 */
export const seedCoursesIfEmpty = async () => {
  const snapshot = await courses().limit(1).get();
  if (!snapshot.empty) return { seeded: false, count: (await courses().count().get()).data().count };

  const batch = getFirestore().batch();
  for (const course of coursesData) {
    const { id, ...rest } = course;
    batch.set(courseDoc(id), {
      id,
      ...rest,
      status: course.status || 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
  console.log(`[Courses] Seeded ${coursesData.length} bundled course(s) into Firestore.`);
  return { seeded: true, count: coursesData.length };
};

/**
 * Guarantees a catalogue is present before a public read: seeds on first ever
 * request, otherwise simply returns what is stored. Never resurrects data.
 */
export const listCoursesWithLazySeed = async () => {
  const snapshot = await courses().limit(1).get();
  if (snapshot.empty) await seedCoursesIfEmpty();
  return listCourses();
};
