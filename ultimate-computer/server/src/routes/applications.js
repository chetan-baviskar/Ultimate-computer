import { Router } from 'express';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import {
  submitApplication,
  checkDuplicate,
  listApplications,
  updateApplication,
  removeApplication
} from '../controllers/applicationController.js';

const router = Router();

/**
 * Admission application routes — Cloud Firestore.
 *
 * Identity always comes from the verified Firebase ID token (Admin SDK), never
 * from the request body or query string. Students only ever read their own
 * applications; status changes and deletions require the stored role 'admin'.
 */

/**
 * POST /api/applications
 * Submit an admission application (public — the Admission form also works for
 * guests who are not signed in). When an ID token is presented it is verified,
 * and the application is linked to that verified Firebase UID.
 */
router.post('/', optionalAuth, submitApplication);

/**
 * GET /api/applications/check?courseId=&email=
 * Returns the first active (non-rejected) application for a course, or null.
 * Signed-in applicants are matched on their verified uid/e-mail; guests are
 * matched on the e-mail they are about to submit with.
 */
router.get('/check', optionalAuth, checkDuplicate);

/**
 * GET /api/applications
 * Students get their own applications (resolved server-side from the token);
 * administrators get everything.
 */
router.get('/', requireAuth, listApplications);

/**
 * PATCH /api/applications/:id
 * Update application status + admin remarks (admin only)
 */
router.patch('/:id', requireAdmin(updateApplication));

/**
 * DELETE /api/applications/:id
 * Delete an application (admin only)
 */
router.delete('/:id', requireAdmin(removeApplication));

export default router;
