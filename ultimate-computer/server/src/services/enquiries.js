/**
 * Firestore persistence for contact-form enquiries.
 *
 * Document layout — one document per enquiry:
 *
 *   enquiries/{id} = {
 *     id,                 // document id
 *     name, email, phone, subject, message,
 *     status,             // 'Unread' | 'Read'  (admin dashboard counts 'Unread')
 *     submittedBy,        // Firebase UID of the sender, or 'anonymous'
 *     readAt,             // set when an administrator marks it read
 *     createdAt, updatedAt
 *   }
 *
 * Security rules for this file:
 *  - The public form can only ever CREATE an enquiry; every read, status
 *    change and delete happens behind `requireAdmin` in the controller.
 *  - `submittedBy` is written from the verified ID token (or the constant
 *    'anonymous') — the body cannot claim an identity, and the sender can
 *    never read stored enquiries back.
 *  - Single-field queries with in-memory sorting: no composite index needed.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore, runWithFreshChannel } from '../config/firebase.js';

export const ENQUIRIES_COLLECTION = 'enquiries';

/** Status values the admin dashboard understands. */
export const ENQUIRY_STATUSES = ['Unread', 'Read'];

const TEXT_LIMITS = { name: 100, email: 160, phone: 20, subject: 160, message: 2000 };
const DEFAULT_SUBJECT = 'General Inquiry';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const enquiries = () => getFirestore().collection(ENQUIRIES_COLLECTION);
const enquiryDoc = (id) => enquiries().doc(id);

/** Firestore Timestamp (or any {toDate}) -> ISO 8601 string for JSON. */
const toPlain = (value) =>
  value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;

/** Converts a snapshot into the plain JSON object the frontend expects. */
const snapshotToEnquiry = (snap) => {
  const data = snap.data() || {};
  const record = { id: snap.id };
  for (const [key, value] of Object.entries(data)) record[key] = toPlain(value);
  return record;
};

const newestFirst = (a, b) =>
  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();

const ValidationError = (message) => {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  return err;
};

const notFoundError = () => {
  const err = new Error('No enquiry exists with this id.');
  err.code = 'NOT_FOUND';
  return err;
};

/**
 * Extracts a validated enquiry payload from a request body.
 *
 * @throws {Error & {code: 'VALIDATION_ERROR'}} on invalid input
 */
export const buildEnquiryFields = (body = {}) => {
  const read = (field, { required = false, fallback = '' } = {}) => {
    const raw = body?.[field];
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text) {
      if (required) throw ValidationError(`${field} is required.`);
      return fallback;
    }
    const max = TEXT_LIMITS[field] || 300;
    if (text.length > max) throw ValidationError(`${field} must be ${max} characters or fewer.`);
    return text;
  };

  const name = read('name', { required: true });
  const phoneRaw = read('phone', { required: true }).replace(/\D/g, '');
  if (phoneRaw.length < 10 || phoneRaw.length > 15) {
    throw ValidationError('Enter a valid phone number.');
  }

  const email = read('email').toLowerCase();
  if (email && !EMAIL_PATTERN.test(email)) throw ValidationError('Enter a valid email address.');

  return {
    name,
    email,
    phone: phoneRaw,
    subject: read('subject', { fallback: DEFAULT_SUBJECT }),
    message: read('message')
  };
};

/* ------------------------------------------------------------------ reads */

// Every Firestore operation below runs inside `runWithFreshChannel`: when the
// Admin SDK's credential channel has gone stale (UNAUTHENTICATED /
// DEADLINE_EXCEEDED / UNAVAILABLE), the call rebuilds the channel and retries
// once instead of surfacing 503 DATA_LAYER_UNAVAILABLE. Application-level
// errors (NOT_FOUND, VALIDATION_ERROR, ...) pass through untouched.

/** Every enquiry, newest first (admin view). */
export const listEnquiries = async () =>
  runWithFreshChannel(async () => {
    const snap = await enquiries().limit(500).get();
    return snap.docs.map(snapshotToEnquiry).sort(newestFirst);
  });

/** One enquiry by document id, or null. */
export const getEnquiry = async (id) =>
  runWithFreshChannel(async () => {
    if (!id) return null;
    const snap = await enquiryDoc(id).get();
    return snap.exists ? snapshotToEnquiry(snap) : null;
  });

/* ----------------------------------------------------------------- writes */

/** Creates an enquiry. `submittedBy` is supplied by the controller. */
export const createEnquiry = async (fields, submittedBy) =>
  runWithFreshChannel(async () => {
    const record = {
      ...fields,
      status: 'Unread',
      submittedBy: submittedBy || 'anonymous',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const ref = await enquiries().add(record);
    const created = await ref.get();
    console.log(`[Enquiries] New enquiry from ${record.name} (${record.subject})`);
    return snapshotToEnquiry(created);
  });

/**
 * Marks an enquiry as read (admin only).
 *
 * @throws {Error & {code: 'NOT_FOUND'}}
 */
export const markEnquiryReadById = async (id) =>
  runWithFreshChannel(async () => {
    const ref = enquiryDoc(id);
    const snap = await ref.get();
    if (!snap.exists) throw notFoundError();

    await ref.update({
      status: 'Read',
      readAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    const updated = await ref.get();
    return snapshotToEnquiry(updated);
  });

/**
 * Deletes an enquiry (admin only).
 *
 * @throws {Error & {code: 'NOT_FOUND'}}
 */
export const deleteEnquiryById = async (id) =>
  runWithFreshChannel(async () => {
    const ref = enquiryDoc(id);
    const snap = await ref.get();
    if (!snap.exists) throw notFoundError();
    await ref.delete();
    return { id, deleted: true };
  });
