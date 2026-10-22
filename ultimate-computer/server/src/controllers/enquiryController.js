/**
 * Enquiry controllers (Firestore-backed).
 *
 * Access rules enforced here:
 *  - POST is public (the Contact page works for guests) but still records the
 *    verified Firebase UID when the sender happens to be signed in. A sender
 *    can never read enquiries back.
 *  - GET / PATCH / DELETE are administrator-only: the role is read from the
 *    caller's stored Firestore profile, never from the request.
 *  - Missing store → 503, missing document → 404, bad input → 400. Nothing
 *    fakes success.
 */

import { isFirebaseConfigured, getFirestore } from '../config/firebase.js';
import { dataLayerUnavailable } from '../middleware/serviceUnavailable.js';
import { loadRole } from '../middleware/auth.js';
import {
  buildEnquiryFields,
  createEnquiry,
  listEnquiries,
  markEnquiryReadById,
  deleteEnquiryById
} from '../services/enquiries.js';

const ensureDataLayer = (res) => {
  if (isFirebaseConfigured() && getFirestore()) return true;
  dataLayerUnavailable(res);
  return false;
};

const sendServiceError = (res, err, context) => {
  if (err?.code === 'VALIDATION_ERROR') {
    res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    return true;
  }
  if (err?.code === 'NOT_FOUND') {
    res.status(404).json({ error: err.message, code: 'ENQUIRY_NOT_FOUND' });
    return true;
  }
  console.error(`[Enquiries] ${context} failed:`, err?.message);
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
    console.error('[Enquiries] Failed to read role:', err?.message);
    dataLayerUnavailable(res);
    return true;
  }
};

/**
 * POST /api/enquiries   (public — Contact page)
 */
export const submitEnquiry = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  try {
    const fields = buildEnquiryFields(req.body || {});
    const submittedBy = req.firebaseUser?.uid || 'anonymous';
    const saved = await createEnquiry(fields, submittedBy);
    return res.status(201).json(saved);
  } catch (err) {
    return sendServiceError(res, err, 'Create');
  }
};

/**
 * GET /api/enquiries   (admin only)
 */
export const listEnquiriesHandler = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  if (await ensureAdminRole(req, res)) return;
  try {
    return res.json(await listEnquiries());
  } catch (err) {
    return sendServiceError(res, err, 'List');
  }
};

/**
 * PATCH /api/enquiries/:id/read   (admin only)
 */
export const markEnquiryRead = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  if (await ensureAdminRole(req, res)) return;
  try {
    const updated = await markEnquiryReadById(req.params.id);
    console.log(`[Enquiries] Admin ${req.firebaseUser.uid} marked enquiry ${updated.id} as read`);
    return res.json(updated);
  } catch (err) {
    return sendServiceError(res, err, 'Mark read');
  }
};

/**
 * DELETE /api/enquiries/:id   (admin only)
 */
export const removeEnquiry = async (req, res) => {
  if (!ensureDataLayer(res)) return;
  if (await ensureAdminRole(req, res)) return;
  try {
    const result = await deleteEnquiryById(req.params.id);
    console.log(`[Enquiries] Admin ${req.firebaseUser.uid} deleted enquiry ${result.id}`);
    return res.json(result);
  } catch (err) {
    return sendServiceError(res, err, 'Delete');
  }
};
