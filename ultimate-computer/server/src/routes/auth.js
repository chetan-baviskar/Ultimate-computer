import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { unavailable } from '../middleware/serviceUnavailable.js';
import {
  register,
  login,
  me,
  migrationStatus,
  createMigrationRequest
} from '../controllers/authController.js';

const router = Router();

/**
 * Authentication routes — Firebase Authentication + Cloud Firestore.
 *
 * The browser authenticates with the Firebase Web SDK (email/password) and
 * sends the resulting Firebase ID token in `Authorization: Bearer <token>`.
 * `requireAuth` verifies that token with the Firebase Admin SDK, so every
 * handler below only ever sees a server-verified identity.
 *
 * Nothing here issues its own session tokens and nothing here is faked: if
 * Firebase/Firestore cannot be reached the response is an honest 503.
 */

/**
 * POST /api/auth/register
 * Creates the Firestore profile for the ALREADY-AUTHENTICATED user
 * (uid/profile id = the verified Firebase Auth UID).
 * The role is fixed to 'student' server-side — a `role` in the body is ignored,
 * so public registration can never create Faculty/Admin accounts.
 */
router.post('/register', requireAuth, register);

/**
 * POST /api/auth/login
 * After the Firebase Web SDK signs the user in, returns that user's profile.
 */
router.post('/login', requireAuth, login);

/**
 * GET /api/auth/me
 * Returns the profile for the verified session.
 */
router.get('/me', requireAuth, me);

/**
 * POST /api/auth/migration-status
 * Public: reports whether an email has no Firebase Authentication user yet
 * (i.e. an account that still needs migrating after the database upgrade).
 */
router.post('/migration-status', migrationStatus);

/**
 * POST /api/auth/migration-requests
 * Public: account-recovery/migration request for pre-upgrade accounts.
 * A human verifies the request at the office — passwords are never reset and
 * accounts are never created automatically from here.
 */
router.post('/migration-requests', createMigrationRequest);

/**
 * PATCH /api/auth/password
 * Passwords now belong to Firebase Authentication and can only be changed
 * client-side, AFTER Firebase re-verifies the current password
 * (see src/services/authService.js changePassword). This server cannot verify
 * a "current password" without bypassing Firebase, so it does not pretend to:
 * the endpoint stays an explicit 503 instead of accepting an unverified change.
 */
router.patch('/password', unavailable);

export default router;
