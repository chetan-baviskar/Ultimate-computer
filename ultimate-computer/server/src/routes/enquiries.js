import { Router } from 'express';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import {
  submitEnquiry,
  listEnquiriesHandler,
  markEnquiryRead,
  removeEnquiry
} from '../controllers/enquiryController.js';

const router = Router();

/**
 * Enquiry routes (Contact page + Admin dashboard) — Cloud Firestore.
 *
 * Anyone may submit an enquiry; only an administrator whose stored Firestore
 * profile says role:'admin' can list, mark read, or delete them.
 */

/**
 * POST /api/enquiries
 * Submit a contact enquiry (public — Contact page). When an ID token is
 * presented it is verified, so the stored sender is the real account.
 */
router.post('/', optionalAuth, submitEnquiry);

/**
 * GET /api/enquiries
 * List all enquiries, newest first (admin only)
 */
router.get('/', requireAuth, listEnquiriesHandler);

/**
 * PATCH /api/enquiries/:id/read
 * Mark an enquiry as Read (admin only)
 */
router.patch('/:id/read', requireAdmin(markEnquiryRead));

/**
 * DELETE /api/enquiries/:id
 * Delete an enquiry (admin only)
 */
router.delete('/:id', requireAdmin(removeEnquiry));

export default router;
