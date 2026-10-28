/**
 * Admission application controllers (Firestore-backed).
 *
 * Access rules enforced here:
 *  - POST /api/applications accepts both guests and signed-in students, but a
 *    PRESENTED ID token is always verified: an invalid token is a 401, never a
 *    silent downgrade. The stored `studentUid` comes from that verified token —
 *    the body cannot claim another student's identity.
 *  - GET /api/applications is scoped by the SERVER: a student only ever
 *    receives their own documents (verified uid + verified e-mail); the
 *    `studentUid`/`email` query parameters can influence nothing but an
 *    administrator's view. Roles are read from Firestore, never from the
 *    request.
 *  - PATCH / DELETE run only behind `requireAdmin`.
 *  - Nothing here fakes success: a missing store is a 503, a missing document
 *    is a 404, invalid input is a 400.
 */

import { isFirebaseConfigured, getFirestore } from '../config/firebase.js';
import { dataLayerUnavailable } from '../middleware/serviceUnavailable.js';
import { loadRole } from '../middleware/auth.js';
import { getProfile, findProfileByEmail, setProfileCourse } from '../services/profiles.js';
import {
  APPLICATION_STATUSES,
  GUEST_UID,
  buildApplicationFields,
  createApplication,
  listAllApplications,
  listApplicationsForApplicant,
  findActiveApplication,
  getApplication,
  updateApplicationById,
  deleteApplicationById
} from '../services/applications.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ensureDataLayer = (res) => {
  if (isFirebaseConfigured() && getFirestore()) return true;
  dataLayerUnavailable(res);
  return false;
};

/** Maps service errors onto HTTP responses. Returns true when handled. */
const sendServiceError = (res, err, context) => {
  if (err?.code === 'VALIDATION_ERROR') {
    res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    return true;
  }
  if (err?.code === 'NOT_FOUND') {
    res.status(404).json({ error: err.message, code: 'APPLICATION_NOT_FOUND' });
    return true;
  }
  console.error(`[Applications] ${context} failed:`, err?.message);
  dataLayerUnavailable(res);
  return true;
};

/** 401/403/503 helper: true when a response was already sent. */
const ensureAdminRole = async (req, res) => {
  try {
    const role = await loadRole(req.firebaseUser.uid, req.firebaseUser);
    if (role === 'admin') return false;
    res.status(403).json({
      error: 'Administrative privileges are required for this operation.',
      code: 'ADMIN_REQUIRED'
    });
    return true;
  } catch (err) {
    console.error('[Applications] Failed to read role:', err?.message);
    dataLayerUnavailable(res);
    return true;
  }
};

/**
 * Associates an application's course with the owning student profile after a
 * status change. Runs server-side only, never fails the admin's request
 * (the status update itself is the primary operation).
 *
 * Identity: the profile is resolved by the application's stored `studentUid`
 * (written from the VERIFIED ID token at submission) first, then by the
 * application's e-mail — never by name.
 *
 * Rules:
 *  - the effective course of a student is the course of their NEWEST
 *    Approved application (applications are stored newest-first, the same
 *    ordering both dashboards use);
 *  - Pending / Rejected applications never contribute a course;
 *  - the profile's course is only rewritten when it actually changes, and is
 *    cleared only when it came from an application that just left Approved
 *    state (so a registration-time course from another source is preserved);
 *  - failures are logged, never surfaced as a failed approval.
 */
const syncProfileCourse = async (before, after) => {
  try {
    const wasApproved = before?.status === 'Approved';
    const isApproved = after?.status === 'Approved';
    if (!wasApproved && !isApproved) return; // Pending/Rejected never set a course

    // Resolve the profile of the applicant: verified uid first, e-mail second.
    const uid = String(after.studentUid || '').trim();
    const isOwnUid = uid && uid !== GUEST_UID && uid !== 'anonymous';
    const profile = (isOwnUid ? await getProfile(uid) : null)
      || (String(after.email || '').trim() ? await findProfileByEmail(after.email) : null);
    if (!profile) {
      console.warn(`[Applications] No profile found to sync course for ${after.applicationId} (uid=${uid || 'none'})`);
      return;
    }

    // Effective course: newest Approved application of THIS student (uid + e-mail).
    const own = await listApplicationsForApplicant({ uid: profile.uid, email: profile.email });
    const newestApproved = (own || [])
      .filter((app) => app.status === 'Approved' && String(app.courseName || '').trim())
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;

    const currentCourse = String(profile.course || '').trim();
    const desiredCourse = newestApproved ? String(newestApproved.courseName).trim() : '';

    if (desiredCourse) {
      if (currentCourse !== desiredCourse) {
        await setProfileCourse(profile.uid, desiredCourse);
        console.log(`[Applications] Profile ${profile.uid} course → "${desiredCourse}" (approved ${after.applicationId})`);
      }
      return;
    }

    // No approved application remains: only clear a course that this very
    // application could have written (it left Approved state just now).
    const courseFromThisApp = String(after.courseName || '').trim();
    if (wasApproved && courseFromThisApp && currentCourse === courseFromThisApp) {
      await setProfileCourse(profile.uid, '');
      console.log(`[Applications] Profile ${profile.uid} course cleared (application ${after.applicationId} un-approved)`);
    }
  } catch (err) {
    console.warn(`[Applications] Profile course sync failed for ${after?.applicationId}:`, err?.message);
  }
};

/**
 * POST /api/applications   (public — guests and students)
 */
export const submitApplication = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  try {
    const body = { ...(req.body || {}) };
    const verified = req.firebaseUser || null;

    // A signed-in applicant always has a verified address available: use it
    // when the form did not supply one (identity fields come from the token).
    if (verified && !String(body.email || '').trim()) body.email = verified.email || '';

    const fields = buildApplicationFields(body);
    const owner = verified
      ? { studentUid: verified.uid, submittedByUid: verified.uid }
      : { studentUid: GUEST_UID, submittedByUid: 'anonymous' };

    const saved = await createApplication(fields, owner);
    return res.status(201).json(saved);
  } catch (err) {
    return sendServiceError(res, err, 'Create');
  }
};

/**
 * GET /api/applications/check?courseId=&email=
 * Public duplicate check:
 *  - signed-in applicant → matched on their VERIFIED uid + e-mail
 *  - guest               → matched on the e-mail they will submit with
 * Responds with the first active (non-rejected) application or `null`.
 */
export const checkDuplicate = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  const courseId = String(req.query?.courseId || '').trim();
  if (!courseId) {
    return res.status(400).json({ error: 'courseId is required.', code: 'VALIDATION_ERROR' });
  }

  try {
    let uid = null;
    let email = String(req.query?.email || '').trim().toLowerCase();

    if (req.firebaseUser) {
      uid = req.firebaseUser.uid;
      email = String(req.firebaseUser.email || '').toLowerCase();
    } else if (!email || !EMAIL_PATTERN.test(email)) {
      // Guests have no token, so the e-mail they will submit with is the only
      // identity that can be checked — and it must be well formed.
      return res.status(400).json({
        error: 'A valid email address is required to check an application as a guest.',
        code: 'VALIDATION_ERROR'
      });
    }

    const existing = await findActiveApplication({ uid, email, courseId });
    return res.json(existing || null);
  } catch (err) {
    return sendServiceError(res, err, 'Duplicate check');
  }
};

/**
 * GET /api/applications   (verified session)
 * Administrator → every application (optionally narrowed by the query string).
 * Student       → ONLY their own, resolved server-side from the ID token.
 */
export const listApplications = async (req, res) => {
  if (!ensureDataLayer(res)) return;

  let role = null;
  try {
    role = await loadRole(req.firebaseUser.uid, req.firebaseUser);
  } catch (err) {
    console.error('[Applications] Failed to read role:', err?.message);
    return dataLayerUnavailable(res);
  }

  try {
    if (role === 'admin') {
      const filterUid = String(req.query?.studentUid || '').trim();
      const filterEmail = String(req.query?.email || '').trim().toLowerCase();
      if (filterUid || filterEmail) {
        const filtered = await listApplicationsForApplicant({
          uid: filterUid || null,
          email: filterEmail || null
        });
        return res.json(filtered);
      }
      return res.json(await listAllApplications());
    }

    // Student scope: the uid AND e-mail come from the verified token. Query
    // parameters supplied by the client are deliberately ignored.
    const own = await listApplicationsForApplicant({
      uid: req.firebaseUser.uid,
      email: req.firebaseUser.email
    });
    return res.json(own);
  } catch (err) {
    return sendServiceError(res, err, 'List');
  }
};

/**
 * PATCH /api/applications/:id   (admin only)
 * Updates the status and/or admin remarks of one application.
 */
export const updateApplication = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  if (await ensureAdminRole(req, res)) return;

  const body = req.body || {};
  const patch = {};

  if (body.status !== undefined) {
    const status = String(body.status || '').trim();
    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${APPLICATION_STATUSES.join(', ')}.`,
        code: 'VALIDATION_ERROR'
      });
    }
    patch.status = status;
  }
  if (body.adminRemarks !== undefined) {
    patch.adminRemarks = typeof body.adminRemarks === 'string' ? body.adminRemarks : '';
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({
      error: 'No updatable fields were supplied (status, adminRemarks).',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    const before = await getApplication(req.params.id);
    const updated = await updateApplicationById(req.params.id, patch);
    if (patch.status !== undefined) {
      // Keep the student's profile course in sync with the approval decision.
      await syncProfileCourse(before, updated);
    }
    console.log(`[Applications] Admin ${req.firebaseUser.uid} set ${updated.applicationId} → ${updated.status}`);
    return res.json(updated);
  } catch (err) {
    return sendServiceError(res, err, 'Update');
  }
};

/**
 * DELETE /api/applications/:id   (admin only)
 */
export const removeApplication = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  if (await ensureAdminRole(req, res)) return;

  try {
    const result = await deleteApplicationById(req.params.id);
    console.log(`[Applications] Admin ${req.firebaseUser.uid} deleted application doc ${result.id}`);
    return res.json(result);
  } catch (err) {
    return sendServiceError(res, err, 'Delete');
  }
};
