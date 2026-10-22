import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { unavailable } from '../middleware/serviceUnavailable.js';
import { getProfileById, updateProfileById, listStudents } from '../controllers/userController.js';

const router = Router();

/**
 * User/profile routes.
 *
 * Profiles live in Cloud Firestore (`users/{uid}`, uid = Firebase Auth UID).
 * Every route below requires a verified Firebase ID token, and a student can
 * only ever reach their OWN document — any other uid answers 403 unless the
 * caller's stored profile role is 'admin'.
 */

/**
 * GET /api/users/students
 * List registered student profiles (admin only — the role is read from the
 * caller's stored Firestore profile, never from the request).
 */
router.get('/students', requireAuth, listStudents);

/**
 * GET /api/users/:uid
 * Fetch a profile — own profile (verified by ID token) or admin only
 */
router.get('/:uid', requireAuth, getProfileById);

/**
 * POST /api/users
 * Provision a user with an initial password (admin only —
 * public registration lives at POST /api/auth/register).
 * Not part of this phase: stays an explicit 503.
 */
router.post('/', unavailable);

/**
 * PATCH /api/users/:uid/password
 * Admin reset of a student's password. Passwords are owned by Firebase
 * Authentication; admin resets are handled with the Admin SDK in the admin
 * phase, so this stays an explicit 503 (never a fake success).
 */
router.patch('/:uid/password', unavailable);

/**
 * PATCH /api/users/:uid
 * Update editable profile fields only: fullName, mobile
 * (role, uid, email and status can NEVER change through this route)
 */
router.patch('/:uid', requireAuth, updateProfileById);

export default router;
