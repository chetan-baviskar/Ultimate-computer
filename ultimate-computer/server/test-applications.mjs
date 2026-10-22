#!/usr/bin/env node
/**
 * Phase 2 integration tests: admission applications in Cloud Firestore.
 *
 * Drives the REAL Express API over HTTP and independently verifies the stored
 * documents in Cloud Firestore with the Admin SDK. Nothing is mocked.
 *
 * Covered:
 *   - guest submission (no session) and student submission (ID token)
 *   - applications are LINKED to the verified Firebase UID; a uid supplied by
 *     the body can never claim another identity
 *   - duplicate check for both signed-in applicants and guests
 *   - data isolation: a student only ever reads their own applications, and
 *     query-string tampering changes nothing
 *   - admin status updates / deletion, with authorization checks
 *
 * Usage:  node test-applications.mjs     (API must be running on :5001)
 *
 * The suite only creates its own applications and deletes exactly those
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
  newId,
  waitForApi,
  API
} from './test-support.mjs';

const stamp = Date.now();
const ADMIN = { email: `admin.apps.${stamp}@example.com`, password: `Admin#Apps${stamp}` };
const STUDENT_A = { email: `student.a.apps.${stamp}@example.com`, password: `Student#AppsA${stamp}` };
const STUDENT_B = { email: `student.b.apps.${stamp}@example.com`, password: `Student#AppsB${stamp}` };

/** Every document id this run created — removed at the end (own records only). */
const createdDocIds = [];

const applicationBody = (overrides = {}) => ({
  applicationId: `UC-2026-TEST${String(stamp).slice(-5)}`,
  fullName: 'Phase Two Tester',
  email: `applicant.${stamp}@example.com`,
  mobile: '9876543210',
  dateOfBirth: '2004-01-01',
  gender: 'Male',
  address: '12, Test Lane',
  city: 'Pune',
  education: '12th Pass',
  courseId: 'web-development',
  courseName: 'Web Development',
  previousComputerKnowledge: 'Beginner',
  preferredContactMethod: 'Phone',
  additionalMessage: 'Phase 2 automated test.',
  courseFee: '[Fee Amount - Contact Office]',
  registrationFee: '[Included]',
  totalFee: '[Total Fee]',
  status: 'Approved', // must be ignored on submission
  adminRemarks: 'should be ignored', // must be ignored on submission
  ...overrides
});

const cleanup = async () => {
  const { db } = adminResources();
  await Promise.all(createdDocIds.map((id) => db.collection('admission_applications').doc(id).delete().catch(() => {})));
  info(`cleaned up ${createdDocIds.length} test application document(s)`);
};

const run = async () => {
  console.log(`Ultimate Computer — Phase 2 (applications) tests against ${API}`);

  const up = await waitForApi();
  if (!up) {
    console.log(`FAIL  API is not answering at ${API}`);
    return report();
  }

  const { db } = adminResources();

  await ensureAdminAccount(ADMIN.email, ADMIN.password);
  await ensureStudentAccount(STUDENT_A.email, STUDENT_A.password);
  await ensureStudentAccount(STUDENT_B.email, STUDENT_B.password);
  const adminToken = await signInWeb(ADMIN.email, ADMIN.password);
  const tokenA = await signInWeb(STUDENT_A.email, STUDENT_A.password);
  const tokenB = await signInWeb(STUDENT_B.email, STUDENT_B.password);
  const uidA = (await api('GET', '/api/auth/me', { token: tokenA })).data?.uid;
  const uidB = (await api('GET', '/api/auth/me', { token: tokenB })).data?.uid;
  check('student sessions and uids resolved', Boolean(uidA && uidB), `uidA=${uidA} uidB=${uidB}`);

  try {
    console.log('\n=== 1. Guest submission (no session) ===');
    const guestBody = applicationBody({ email: `guest.${stamp}@example.com`, studentUid: uidB });
    const guest = await api('POST', '/api/applications', { body: guestBody });
    check('guest application → 201', guest.status === 201 && guest.data?.id,
      `status=${guest.status} id=${guest.data?.id}`);
    if (guest.data?.id) createdDocIds.push(guest.data.id);

    check('guest application is linked to the guest placeholder uid',
      guest.data?.studentUid === 'guest-student', `studentUid=${guest.data?.studentUid}`);
    check('a body-supplied studentUid was NOT trusted for a guest',
      guest.data?.studentUid !== uidB);
    check('submittedByUid records an anonymous submission',
      guest.data?.submittedByUid === 'anonymous', `submittedByUid=${guest.data?.submittedByUid}`);
    check('a submitted application always starts Pending (body status ignored)',
      guest.data?.status === 'Pending', `status=${guest.data?.status}`);
    check('a submitted application never carries admin remarks',
      guest.data?.adminRemarks === '', `adminRemarks=${JSON.stringify(guest.data?.adminRemarks)}`);

    const guestSnap = await db.collection('admission_applications').doc(guest.data.id).get();
    check('the document really exists in Cloud Firestore', guestSnap.exists,
      `admission_applications/${guest.data?.id}`);
    check('applicationId follows the UC-YYYY-XXXXXX format',
      /^UC-\d{4}-[A-Z0-9]{4,}$/.test(guest.data?.applicationId || ''), guest.data?.applicationId);

    const invalidGuest = await api('POST', '/api/applications', { body: applicationBody({ email: 'not-an-email' }) });
    check('invalid e-mail → 400 VALIDATION_ERROR',
      invalidGuest.status === 400 && invalidGuest.data?.code === 'VALIDATION_ERROR',
      `status=${invalidGuest.status}`);
    const missingFields = await api('POST', '/api/applications', { body: { courseId: 'web-development' } });
    check('missing required fields → 400 VALIDATION_ERROR',
      missingFields.status === 400 && missingFields.data?.code === 'VALIDATION_ERROR',
      `status=${missingFields.status}`);

    console.log('\n=== 2. Duplicate check ===');
    const guestCheck = await api('GET',
      `/api/applications/check?courseId=web-development&email=${encodeURIComponent(guestBody.email)}`);
    check('guest duplicate check finds the application by e-mail',
      guestCheck.status === 200 && guestCheck.data?.applicationId === guest.data?.applicationId,
      `status=${guestCheck.status}`);
    const guestCheckOtherCourse = await api('GET',
      `/api/applications/check?courseId=graphic-design&email=${encodeURIComponent(guestBody.email)}`);
    check('no application for another course → null', guestCheckOtherCourse.data === null);
    const guestNoEmail = await api('GET', '/api/applications/check?courseId=web-development');
    check('guest check without an e-mail → 400 (honest, not a silent null)',
      guestNoEmail.status === 400, `status=${guestNoEmail.status}`);
    const noCourse = await api('GET', '/api/applications/check?email=a@b.com');
    check('check without courseId → 400', noCourse.status === 400, `status=${noCourse.status}`);

    console.log('\n=== 3. Student submission links the verified Firebase UID ===');
    const signedInBody = applicationBody({
      studentUid: uidB, // spoof attempt — must be ignored
      email: STUDENT_A.email,
      courseName: 'Advanced Computer Programming',
      courseId: 'advanced-programming'
    });
    const signedIn = await api('POST', '/api/applications', { token: tokenA, body: signedInBody });
    check('signed-in application → 201', signedIn.status === 201 && signedIn.data?.id,
      `status=${signedIn.status} id=${signedIn.data?.id}`);
    if (signedIn.data?.id) createdDocIds.push(signedIn.data.id);

    check('application is linked to the VERIFIED uid of student A',
      signedIn.data?.studentUid === uidA, `studentUid=${signedIn.data?.studentUid}`);
    check('a body-supplied studentUid cannot impersonate student B',
      signedIn.data?.studentUid !== uidB);
    check('submittedByUid equals the verified uid',
      signedIn.data?.submittedByUid === uidA, `submittedByUid=${signedIn.data?.submittedByUid}`);

    const forged = await api('POST', '/api/applications',
      { token: 'forged.token.value', body: applicationBody() });
    check('forged ID token → 401 (never silently treated as a guest)',
      forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', `status=${forged.status}`);

    const signedCheck = await api('GET', '/api/applications/check?courseId=advanced-programming',
      { token: tokenA });
    check('signed-in duplicate check finds their own application',
      signedCheck.data?.applicationId === signedIn.data?.applicationId, JSON.stringify(signedCheck.data?.applicationId));
    const signedCheckB = await api('GET', '/api/applications/check?courseId=advanced-programming',
      { token: tokenB });
    check('student B has no application for that course → null', signedCheckB.data === null);

    console.log('\n=== 4. Students only read their own applications ===');
    const listA = await api('GET', '/api/applications', { token: tokenA });
    check('student A listing → 200', listA.status === 200 && Array.isArray(listA.data),
      `status=${listA.status} count=${Array.isArray(listA.data) ? listA.data.length : 'n/a'}`);
    if (!Array.isArray(listA.data)) {
      info('stopping here — the listing endpoint is not answering');
      return;
    }
    check('student A sees their own application',
      (listA.data || []).some((a) => a.id === signedIn.data?.id));
    check('student A does NOT see the guest application',
      !(listA.data || []).some((a) => a.id === guest.data?.id));

    const listB = await api('GET', '/api/applications', { token: tokenB });
    check('student B sees nothing of A\'s',
      !(listB.data || []).some((a) => a.id === signedIn.data?.id || a.applicationId === signedIn.data?.applicationId));

    const tampered = await api('GET', `/api/applications?studentUid=${encodeURIComponent(uidA)}`,
      { token: tokenB });
    check('query-string tampering (asking for A\'s uid) still returns only B\'s data',
      Array.isArray(tampered.data) && tampered.data.every((a) => a.studentUid === uidB));

    const noToken = await api('GET', '/api/applications');
    check('listing without a token → 401 NO_TOKEN',
      noToken.status === 401 && noToken.data?.code === 'NO_TOKEN', `status=${noToken.status}`);

    const listAdmin = await api('GET', '/api/applications', { token: adminToken });
    check('admin sees every application',
      listAdmin.status === 200 && (listAdmin.data || []).length >= 2,
      `count=${listAdmin.data?.length}`);

    console.log('\n=== 5. Status management (admin only) ===');
    const anonPatch = await api('PATCH', `/api/applications/${encodeURIComponent(signedIn.data.id)}`,
      { body: { status: 'Approved' } });
    check('anonymous status update → 401', anonPatch.status === 401, `status=${anonPatch.status}`);

    const studentPatch = await api('PATCH', `/api/applications/${encodeURIComponent(signedIn.data.id)}`,
      { token: tokenA, body: { status: 'Approved' } });
    check('STUDENT status update → 403 ADMIN_REQUIRED',
      studentPatch.status === 403 && studentPatch.data?.code === 'ADMIN_REQUIRED',
      `status=${studentPatch.status}`);

    const studentDelete = await api('DELETE', `/api/applications/${encodeURIComponent(signedIn.data.id)}`,
      { token: tokenA });
    check('STUDENT cannot delete an application → 403',
      studentDelete.status === 403, `status=${studentDelete.status}`);

    const approve = await api('PATCH', `/api/applications/${encodeURIComponent(signedIn.data.id)}`,
      { token: adminToken, body: { status: 'Approved', adminRemarks: 'Phase 2 test approval' } });
    check('admin approves an application → 200', approve.status === 200 &&
      approve.data?.status === 'Approved', `status=${approve.status}`);
    check('admin remarks stored', approve.data?.adminRemarks === 'Phase 2 test approval');

    const approveSnap = await db.collection('admission_applications').doc(signedIn.data.id).get();
    check('the status change really landed in Firestore',
      approveSnap.data()?.status === 'Approved' &&
      approveSnap.data()?.adminRemarks === 'Phase 2 test approval');
    check('status change carries a server timestamp',
      Boolean(approveSnap.data()?.statusUpdatedAt?.toDate), 'statusUpdatedAt missing');

    const listAAfter = await api('GET', '/api/applications', { token: tokenA });
    const mine = (listAAfter.data || []).find((a) => a.id === signedIn.data.id);
    check('student A sees the updated status on their own dashboard',
      mine?.status === 'Approved' && mine?.adminRemarks === 'Phase 2 test approval');

    const badStatus = await api('PATCH', `/api/applications/${encodeURIComponent(signedIn.data.id)}`,
      { token: adminToken, body: { status: 'Totally Made Up' } });
    check('invalid status → 400 VALIDATION_ERROR',
      badStatus.status === 400 && badStatus.data?.code === 'VALIDATION_ERROR',
      `status=${badStatus.status}`);
    const missingApp = await api('PATCH', '/api/applications/no-such-application',
      { token: adminToken, body: { status: 'Approved' } });
    check('patching a missing application → 404',
      missingApp.status === 404, `status=${missingApp.status}`);

    const reject = await api('PATCH', `/api/applications/${encodeURIComponent(guest.data.id)}`,
      { token: adminToken, body: { status: 'Rejected', adminRemarks: 'Phase 2 test rejection' } });
    check('admin rejects an application → 200', reject.status === 200 &&
      reject.data?.status === 'Rejected', `status=${reject.status}`);

    const guestCheckAfter = await api('GET',
      `/api/applications/check?courseId=web-development&email=${encodeURIComponent(guestBody.email)}`);
    check('a REJECTED application no longer blocks a new application → null',
      guestCheckAfter.data === null, JSON.stringify(guestCheckAfter.data?.status));

    console.log('\n=== 6. Deletion (admin only) ===');
    const studentDeleteForbidden = await api('DELETE',
      `/api/applications/${encodeURIComponent(guest.data.id)}`, { token: tokenB });
    check('student B cannot delete the guest application → 403',
      studentDeleteForbidden.status === 403, `status=${studentDeleteForbidden.status}`);

    const deleted = await api('DELETE', `/api/applications/${encodeURIComponent(guest.data.id)}`,
      { token: adminToken });
    check('admin deletes an application → 200', deleted.status === 200, `status=${deleted.status}`);
    const gone = await db.collection('admission_applications').doc(guest.data.id).get();
    check('the document is gone from Firestore', !gone.exists);
    const deleteAgain = await api('DELETE', `/api/applications/${encodeURIComponent(guest.data.id)}`,
      { token: adminToken });
    check('deleting it twice → 404 (no fake success)', deleteAgain.status === 404,
      `status=${deleteAgain.status}`);
  } finally {
    await cleanup();
  }

  report();
};

run().catch(async (err) => {
  console.error('FAIL  application test suite crashed:', err);
  await cleanup().catch(() => {});
  process.exit(1);
});
