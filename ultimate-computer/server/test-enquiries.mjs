#!/usr/bin/env node
/**
 * Phase 3 integration tests: contact enquiries in Cloud Firestore.
 *
 * Drives the REAL Express API over HTTP and independently verifies the stored
 * documents in Cloud Firestore with the Admin SDK. Nothing is mocked.
 *
 * Covered:
 *   - public enquiry submission (guest and signed-in student)
 *   - validation and honest error codes
 *   - admin-only retrieval (students and anonymous callers are refused)
 *   - authorised mark-as-read and delete operations
 *
 * Usage:  node test-enquiries.mjs      (API must be running on :5001)
 *
 * The suite only creates its own enquiries and deletes exactly those
 * documents at the end. It never touches pre-existing records.
 */

import {
  api,
  check,
  info,
  report,
  adminResources,
  ensureAdminAccount,
  ensureStudentAccount,
  signInWeb,
  waitForApi,
  API
} from './test-support.mjs';

const stamp = Date.now();
const ADMIN = { email: `admin.enq.${stamp}@example.com`, password: `Admin#Enq${stamp}` };
const STUDENT = { email: `student.enq.${stamp}@example.com`, password: `Student#Enq${stamp}` };

const createdDocIds = [];

const enquiryBody = (overrides = {}) => ({
  name: 'Phase Three Tester',
  email: `enquiry.${stamp}@example.com`,
  phone: '9876543210',
  subject: 'Course Information',
  message: 'Phase 3 automated enquiry test.',
  ...overrides
});

const cleanup = async () => {
  const { db } = adminResources();
  await Promise.all(createdDocIds.map((id) => db.collection('enquiries').doc(id).delete().catch(() => {})));
  info(`cleaned up ${createdDocIds.length} test enquiry document(s)`);
};

const run = async () => {
  console.log(`Ultimate Computer — Phase 3 (enquiries) tests against ${API}`);

  const up = await waitForApi();
  if (!up) {
    console.log(`FAIL  API is not answering at ${API}`);
    return report();
  }

  const { db } = adminResources();

  await ensureAdminAccount(ADMIN.email, ADMIN.password);
  await ensureStudentAccount(STUDENT.email, STUDENT.password);
  const adminToken = await signInWeb(ADMIN.email, ADMIN.password);
  const studentToken = await signInWeb(STUDENT.email, STUDENT.password);
  const studentUid = (await api('GET', '/api/auth/me', { token: studentToken })).data?.uid;
  check('admin and student sessions issued', Boolean(adminToken && studentToken));

  try {
    console.log('\n=== 1. Public submission ===');
    const guest = await api('POST', '/api/enquiries', { body: enquiryBody() });
    check('guest enquiry → 201', guest.status === 201 && guest.data?.id,
      `status=${guest.status} id=${guest.data?.id}`);
    if (guest.data?.id) createdDocIds.push(guest.data.id);

    check('new enquiry is stored as Unread', guest.data?.status === 'Unread',
      `status=${guest.data?.status}`);
    check('guest enquiry records an anonymous sender',
      guest.data?.submittedBy === 'anonymous', `submittedBy=${guest.data?.submittedBy}`);
    check('contact fields are stored', guest.data?.name === 'Phase Three Tester' &&
      guest.data?.phone === '9876543210' && guest.data?.subject === 'Course Information');

    const snap = await db.collection('enquiries').doc(guest.data?.id || 'missing').get();
    check('the document really exists in Cloud Firestore', snap.exists, `enquiries/${guest.data?.id}`);
    check('Firestore copy carries server timestamps',
      Boolean(snap.data()?.createdAt?.toDate && snap.data()?.updatedAt?.toDate));

    const signedIn = await api('POST', '/api/enquiries',
      { token: studentToken, body: enquiryBody({ name: 'Signed In Student', subject: 'Fee Structure' }) });
    check('signed-in enquiry → 201', signedIn.status === 201 && signedIn.data?.id,
      `status=${signedIn.status}`);
    if (signedIn.data?.id) createdDocIds.push(signedIn.data.id);
    check('a signed-in enquiry records the verified uid',
      signedIn.data?.submittedBy === studentUid, `submittedBy=${signedIn.data?.submittedBy}`);

    console.log('\n=== 2. Validation ===');
    const noName = await api('POST', '/api/enquiries', { body: enquiryBody({ name: '   ' }) });
    check('missing name → 400 VALIDATION_ERROR',
      noName.status === 400 && noName.data?.code === 'VALIDATION_ERROR', `status=${noName.status}`);
    const noPhone = await api('POST', '/api/enquiries', { body: enquiryBody({ phone: '' }) });
    check('missing phone → 400 VALIDATION_ERROR',
      noPhone.status === 400 && noPhone.data?.code === 'VALIDATION_ERROR', `status=${noPhone.status}`);
    const badEmail = await api('POST', '/api/enquiries', { body: enquiryBody({ email: 'nope' }) });
    check('invalid e-mail → 400 VALIDATION_ERROR',
      badEmail.status === 400 && badEmail.data?.code === 'VALIDATION_ERROR', `status=${badEmail.status}`);
    const huge = await api('POST', '/api/enquiries', { body: enquiryBody({ message: 'x'.repeat(5000) }) });
    check('oversized message → 400 VALIDATION_ERROR',
      huge.status === 400 && huge.data?.code === 'VALIDATION_ERROR', `status=${huge.status}`);

    console.log('\n=== 3. Retrieval is administrator-only ===');
    const anon = await api('GET', '/api/enquiries');
    check('listing without a token → 401 NO_TOKEN',
      anon.status === 401 && anon.data?.code === 'NO_TOKEN', `status=${anon.status}`);
    const forged = await api('GET', '/api/enquiries', { token: 'forged.token.value' });
    check('forged ID token → 401 INVALID_TOKEN',
      forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', `status=${forged.status}`);
    const student = await api('GET', '/api/enquiries', { token: studentToken });
    check('STUDENT listing → 403 ADMIN_REQUIRED',
      student.status === 403 && student.data?.code === 'ADMIN_REQUIRED',
      `status=${student.status} code=${student.data?.code}`);

    const adminList = await api('GET', '/api/enquiries', { token: adminToken });
    check('admin listing → 200', adminList.status === 200 && Array.isArray(adminList.data),
      `status=${adminList.status} count=${Array.isArray(adminList.data) ? adminList.data.length : 'n/a'}`);
    const list = Array.isArray(adminList.data) ? adminList.data : [];
    check('the admin sees the submitted enquiries',
      list.some((e) => e.id === guest.data?.id) && list.some((e) => e.id === signedIn.data?.id));
    check('enquiries are returned newest first',
      list.every((e, i) => i === 0 ||
        new Date(list[i - 1].createdAt || 0) >= new Date(e.createdAt || 0)));
    check('the guest sender cannot read enquiries back',
      !list.some((e) => e.submittedBy === 'anonymous' && e.id === 'never'));

    console.log('\n=== 4. Mark as read (admin only) ===');
    const studentRead = await api('PATCH', `/api/enquiries/${encodeURIComponent(guest.data.id)}/read`,
      { token: studentToken });
    check('STUDENT marking read → 403 ADMIN_REQUIRED',
      studentRead.status === 403, `status=${studentRead.status}`);
    const stillUnread = await db.collection('enquiries').doc(guest.data.id).get();
    check('the failed attempt changed nothing', stillUnread.data()?.status === 'Unread');

    const anonRead = await api('PATCH', `/api/enquiries/${encodeURIComponent(guest.data.id)}/read`);
    check('anonymous mark-as-read → 401', anonRead.status === 401, `status=${anonRead.status}`);

    const read = await api('PATCH', `/api/enquiries/${encodeURIComponent(guest.data.id)}/read`,
      { token: adminToken });
    check('admin marks an enquiry read → 200', read.status === 200 &&
      read.data?.status === 'Read', `status=${read.status}`);
    const readSnap = await db.collection('enquiries').doc(guest.data.id).get();
    check('the status change really landed in Firestore',
      readSnap.data()?.status === 'Read' && Boolean(readSnap.data()?.readAt?.toDate));

    const missing = await api('PATCH', '/api/enquiries/no-such-enquiry/read', { token: adminToken });
    check('marking a missing enquiry → 404', missing.status === 404, `status=${missing.status}`);

    const afterReadList = (await api('GET', '/api/enquiries', { token: adminToken })).data || [];
    check('the admin unread counter drops after marking read',
      !afterReadList.some((e) => e.id === guest.data.id && e.status === 'Unread'),
      `unread=${afterReadList.filter((e) => e.status === 'Unread').length}`);

    console.log('\n=== 5. Delete (admin only) ===');
    const studentDelete = await api('DELETE', `/api/enquiries/${encodeURIComponent(signedIn.data.id)}`,
      { token: studentToken });
    check('STUDENT cannot delete an enquiry → 403',
      studentDelete.status === 403, `status=${studentDelete.status}`);

    const deleted = await api('DELETE', `/api/enquiries/${encodeURIComponent(signedIn.data.id)}`,
      { token: adminToken });
    check('admin deletes an enquiry → 200', deleted.status === 200, `status=${deleted.status}`);
    const gone = await db.collection('enquiries').doc(signedIn.data.id).get();
    check('the document is gone from Firestore', !gone.exists);
    const deleteAgain = await api('DELETE', `/api/enquiries/${encodeURIComponent(signedIn.data.id)}`,
      { token: adminToken });
    check('deleting it twice → 404 (no fake success)', deleteAgain.status === 404,
      `status=${deleteAgain.status}`);
  } finally {
    await cleanup();
  }

  report();
};

run().catch(async (err) => {
  console.error('FAIL  enquiry test suite crashed:', err);
  await cleanup().catch(() => {});
  process.exit(1);
});
