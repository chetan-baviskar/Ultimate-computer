/**
 * Course controllers (Firestore-backed).
 *
 * Access rules enforced here:
 *  - GET routes are public: the catalogue is what the Home, Courses, Course
 *    Details and Fee pages show to visitors.
 *  - POST / PUT / DELETE run only behind `requireAdmin`, which verifies the
 *    Firebase ID token AND reads the caller's role from their stored Firestore
 *    profile. A role claimed by the request is never trusted.
 *  - Only allow-listed course fields are written; `id`, `createdAt` and
 *    `updatedAt` are server-owned.
 *  - A missing store is an honest 503, a missing course is an honest 404 —
 *    nothing here fakes success.
 */

import { isFirebaseConfigured, getFirestore } from '../config/firebase.js';
import { dataLayerUnavailable } from '../middleware/serviceUnavailable.js';
import {
  listCourses,
  listCoursesWithLazySeed,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  seedCoursesIfEmpty,
  sanitizeCourseFields
} from '../services/courses.js';

/** 503 when Firestore is not connected — never an unbacked success. */
const ensureDataLayer = (res) => {
  if (isFirebaseConfigured() && getFirestore()) return true;
  dataLayerUnavailable(res);
  return false;
};

/** Maps a service error onto its HTTP response. Returns true when handled. */
const sendServiceError = (res, err, context) => {
  if (err?.code === 'VALIDATION_ERROR') {
    res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    return true;
  }
  if (err?.code === 'NOT_FOUND') {
    res.status(404).json({ error: err.message, code: 'COURSE_NOT_FOUND' });
    return true;
  }
  console.error(`[Courses] ${context} failed:`, err?.message);
  dataLayerUnavailable(res);
  return true;
};

/**
 * GET /api/courses  (public)
 * The catalogue, sorted by name. Seeds the bundled catalogue on the very
 * first request so the public pages always have data.
 */
export const listCoursesHandler = async (_req, res) => {
  if (!ensureDataLayer(res)) return;
  try {
    const courses = await listCoursesWithLazySeed();
    return res.json(courses);
  } catch (err) {
    return sendServiceError(res, err, 'List');
  }
};

/**
 * GET /api/courses/:id  (public)
 */
export const getCourseHandler = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  try {
    const course = await getCourse(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'No course exists with this id.', code: 'COURSE_NOT_FOUND' });
    }
    return res.json(course);
  } catch (err) {
    return sendServiceError(res, err, 'Read');
  }
};

/**
 * POST /api/courses  (admin only)
 */
export const createCourseHandler = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  try {
    const fields = sanitizeCourseFields(req.body || {});
    if (!fields.courseName) {
      return res.status(400).json({ error: 'Course name is required.', code: 'VALIDATION_ERROR' });
    }
    const course = await createCourse(fields);
    console.log(`[Courses] Admin ${req.firebaseUser?.uid} created course ${course.id}`);
    return res.status(201).json(course);
  } catch (err) {
    return sendServiceError(res, err, 'Create');
  }
};

/**
 * PUT /api/courses/:id  (admin only)
 */
export const updateCourseHandler = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  try {
    const fields = sanitizeCourseFields(req.body || {});
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({
        error: 'No editable course fields were supplied.',
        code: 'VALIDATION_ERROR'
      });
    }
    const course = await updateCourse(req.params.id, fields);
    console.log(`[Courses] Admin ${req.firebaseUser?.uid} updated course ${course.id}`);
    return res.json(course);
  } catch (err) {
    return sendServiceError(res, err, 'Update');
  }
};

/**
 * DELETE /api/courses/:id  (admin only)
 */
export const deleteCourseHandler = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  try {
    const result = await deleteCourse(req.params.id);
    console.log(`[Courses] Admin ${req.firebaseUser?.uid} deleted course ${result.id}`);
    return res.json(result);
  } catch (err) {
    return sendServiceError(res, err, 'Delete');
  }
};

/**
 * POST /api/courses/seed  (public, idempotent)
 * Writes the bundled catalogue into Firestore the first time the collection is
 * empty. Repeated calls are honest no-ops (`seeded:false`) — they can never
 * overwrite or resurrect anything.
 */
export const seedCoursesHandler = async (_req, res) => {
  if (!ensureDataLayer(res)) return;
  try {
    const result = await seedCoursesIfEmpty();
    const count = result.count ?? (await listCourses()).length;
    return res.json({
      seeded: result.seeded,
      count,
      message: result.seeded
        ? `Seeded ${count} course(s) into Cloud Firestore.`
        : 'Courses already exist in Cloud Firestore — nothing was overwritten.'
    });
  } catch (err) {
    return sendServiceError(res, err, 'Seed');
  }
};
