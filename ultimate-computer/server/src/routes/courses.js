import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  listCoursesHandler,
  getCourseHandler,
  createCourseHandler,
  updateCourseHandler,
  deleteCourseHandler,
  seedCoursesHandler
} from '../controllers/courseController.js';

const router = Router();

/**
 * Course catalogue routes — Cloud Firestore.
 *
 * Reads are public (Home / Courses / Course Details / Fee pages) and every
 * write runs behind `requireAdmin`: the Firebase ID token is verified with the
 * Admin SDK and the caller's role is read from their stored Firestore profile,
 * so a `role` supplied by the client can never grant access.
 */

/**
 * GET /api/courses
 * List all courses sorted by name (public — home/courses/fee pages).
 * Seeds the bundled catalogue on the first-ever request, then always answers
 * from Firestore.
 */
router.get('/', listCoursesHandler);

/**
 * POST /api/courses/seed
 * Idempotent: writes the bundled catalogue only while the collection is empty,
 * otherwise reports `seeded:false`. It never overwrites stored courses.
 */
router.post('/seed', seedCoursesHandler);

/**
 * GET /api/courses/:id
 * One course (public).
 */
router.get('/:id', getCourseHandler);

/**
 * POST /api/courses
 * Create a course (admin only).
 */
router.post('/', requireAdmin(createCourseHandler));

/**
 * PUT /api/courses/:id
 * Update a course (admin only) — allow-listed fields only.
 */
router.put('/:id', requireAdmin(updateCourseHandler));

/**
 * DELETE /api/courses/:id
 * Delete a course (admin only).
 */
router.delete('/:id', requireAdmin(deleteCourseHandler));

export default router;
