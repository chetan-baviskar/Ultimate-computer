#!/usr/bin/env node
/**
 * Phase 1 integration tests: courses in Cloud Firestore.
 *
 * Drives the REAL Express API over HTTP and independently verifies the stored
 * documents in Cloud Firestore with the Admin SDK. Nothing is mocked.
 *
 * Covered:
 *   - public catalogue listing (and first-boot seeding of the bundled data)
 *   - idempotent seed (never overwrites stored courses)
 *   - admin-only create / update / delete, with Firestore verification
 *   - authorization: no token, forged token and STUDENT token are all refused
 *   - validation and honest 404s
 *
 * Usage:  node test-courses.mjs       (API must be running on :5001)
 *
 * The suite only creates its own test course and deletes exactly that record.
 * It never touches pre-existing courses, profiles or backups.
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
const ADMIN = {
  email: `admin.courses.${stamp}@example.com`,
  password: `Admin#Courses${stamp}`
};
const STUDENT = {
  email: `student.courses.${stamp}@example.com`,
  password: `Student#Courses${stamp}`
};

const run = async () => {
  console.log(`Ultimate Computer — Phase 1 (courses) tests against ${API}`);

  const up = await waitForApi();
  if (!up) {
    console.log(`FAIL  API is not answering at ${API}`);
    return report();
  }

  const { db } = adminResources();

  console.log('=== 1. Public catalogue ===');
  const seeded = await api('POST', '/api/courses/seed', { body: {} });
  check('POST /api/courses/seed → 200', seeded.status === 200, `status=${seeded.status}`);
  check('seed reports an honest result', typeof seeded.data?.seeded === 'boolean' &&
    typeof seeded.data?.count === 'number', JSON.stringify(seeded.data));

  const list = await api('GET', '/api/courses');
  check('GET /api/courses → 200', list.status === 200 && Array.isArray(list.data),
    `status=${list.status}`);
  const courses = Array.isArray(list.data) ? list.data : [];
  check('catalogue is not empty', courses.length > 0, `${courses.length} course(s)`);
  check('courses expose the documented fields',
    courses.every((c) => c.id && c.courseName && typeof c.status === 'string'),
    courses[0] ? `first=${courses[0].id}` : 'no courses');
  const sorted = courses.every((c, i) =>
    i === 0 || String(courses[i - 1].courseName).localeCompare(c.courseName) <= 0);
  check('catalogue is sorted by course name', sorted);

  const beforeCount = courses.length;
  const reseed = await api('POST', '/api/courses/seed', { body: {} });
  const afterList = await api('GET', '/api/courses');
  check('second seed is a no-op (seeded:false)', reseed.data?.seeded === false,
    JSON.stringify(reseed.data));
  check('second seed changed nothing', (afterList.data || []).length === beforeCount,
    `${(afterList.data || []).length} vs ${beforeCount}`);

  const storedDocs = await db.collection('courses').limit(5).get();
  check('courses really live in Cloud Firestore', !storedDocs.empty,
    `${storedDocs.size} doc(s) sampled`);

  console.log('\n=== 2. Course document is readable by id (public) ===');
  const anyCourse = courses[0];
  const byId = await api('GET', `/api/courses/${encodeURIComponent(anyCourse.id)}`);
  check('GET /api/courses/:id → 200 with the same course',
    byId.status === 200 && byId.data?.id === anyCourse.id, `status=${byId.status}`);
  const missing = await api('GET', '/api/courses/definitely-not-a-real-course');
  check('GET unknown course id → 404 COURSE_NOT_FOUND',
    missing.status === 404 && missing.data?.code === 'COURSE_NOT_FOUND',
    `status=${missing.status}`);

  console.log('\n=== 3. Accounts for the authorization checks ===');
  await ensureAdminAccount(ADMIN.email, ADMIN.password);
  await ensureStudentAccount(STUDENT.email, STUDENT.password);
  const adminToken = await signInWeb(ADMIN.email, ADMIN.password);
  const studentToken = await signInWeb(STUDENT.email, STUDENT.password);
  check('admin and student sessions issued', Boolean(adminToken && studentToken));

  const testCourseName = `ZTest Course ${stamp}`;
  const payload = {
    courseName: testCourseName,
    shortDescription: 'Automated Phase 1 test course.',
    duration: '1 Month',
    fee: 'Rs. 1000',
    registrationFee: 'Rs. 100',
    totalFee: 'Rs. 1100',
    eligibility: 'Open to all',
    level: 'Beginner',
    category: 'Certified Program',
    status: 'active',
    role: 'superuser' // must be ignored — not a course field
  };

  console.log('\n=== 4. Writes require a verified administrator ===');
  const anonCreate = await api('POST', '/api/courses', { body: payload });
  check('no token → 401 NO_TOKEN',
    anonCreate.status === 401 && anonCreate.data?.code === 'NO_TOKEN',
    `status=${anonCreate.status}`);

  const forged = await api('POST', '/api/courses', { token: 'forged.token.value', body: payload });
  check('forged ID token → 401 INVALID_TOKEN',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', `status=${forged.status}`);

  const studentCreate = await api('POST', '/api/courses', { token: studentToken, body: payload });
  check('STUDENT token → 403 ADMIN_REQUIRED',
    studentCreate.status === 403 && studentCreate.data?.code === 'ADMIN_REQUIRED',
    `status=${studentCreate.status} code=${studentCreate.data?.code}`);

  const studentUpdate = await api('PUT', `/api/courses/${encodeURIComponent(anyCourse.id)}`,
    { token: studentToken, body: { courseName: 'Hijacked' } });
  check('STUDENT cannot update a course → 403',
    studentUpdate.status === 403, `status=${studentUpdate.status}`);

  const studentDelete = await api('DELETE', `/api/courses/${encodeURIComponent(anyCourse.id)}`,
    { token: studentToken });
  check('STUDENT cannot delete a course → 403',
    studentDelete.status === 403, `status=${studentDelete.status}`);

  const stillThere = await api('GET', `/api/courses/${encodeURIComponent(anyCourse.id)}`);
  check('the real course survived every student attempt',
    stillThere.status === 200 && stillThere.data?.courseName === anyCourse.courseName,
    `status=${stillThere.status}`);

  console.log('\n=== 5. Validation ===');
  const noName = await api('POST', '/api/courses', { token: adminToken, body: { duration: '1 month' } });
  check('missing courseName → 400 VALIDATION_ERROR',
    noName.status === 400 && noName.data?.code === 'VALIDATION_ERROR', `status=${noName.status}`);
  const badStatus = await api('POST', '/api/courses',
    { token: adminToken, body: { courseName: 'Bad status', status: 'whatever' } });
  check('invalid status → 400 VALIDATION_ERROR',
    badStatus.status === 400 && badStatus.data?.code === 'VALIDATION_ERROR',
    `status=${badStatus.status}`);

  console.log('\n=== 6. Admin create → Firestore → update → delete ===');
  const created = await api('POST', '/api/courses', { token: adminToken, body: payload });
  check('admin creates a course → 201', created.status === 201 && created.data?.id,
    `status=${created.status} id=${created.data?.id}`);
  const createdId = created.data?.id;

  if (!createdId) {
    info('stopping here — later checks depend on a created course');
    return report();
  }

  check('created course is visible to the public list',
    (await api('GET', '/api/courses')).data?.some((c) => c.id === createdId));
  check('client-supplied role field was not stored',
    created.data?.role === undefined, `role=${created.data?.role}`);
  check('created course carries server timestamps',
    Boolean(created.data?.createdAt && created.data?.updatedAt),
    `createdAt=${created.data?.createdAt}`);

  const snap = await db.collection('courses').doc(createdId).get();
  check('the document really exists in Firestore', snap.exists, `courses/${createdId}`);
  check('Firestore copy matches the request',
    snap.data()?.courseName === testCourseName && snap.data()?.status === 'active');
  check('document id equals the returned id', snap.id === createdId);

  const updated = await api('PUT', `/api/courses/${encodeURIComponent(createdId)}`,
    { token: adminToken, body: { courseName: `${testCourseName} (Edited)`, status: 'inactive' } });
  check('admin updates a course → 200', updated.status === 200 &&
    updated.data?.courseName === `${testCourseName} (Edited)` &&
    updated.data?.status === 'inactive', `status=${updated.status}`);

  const snapAfter = await db.collection('courses').doc(createdId).get();
  check('the update really landed in Firestore',
    snapAfter.data()?.courseName === `${testCourseName} (Edited)` &&
    snapAfter.data()?.status === 'inactive');
  check('update preserved untouched fields',
    typeof snapAfter.data()?.duration === 'string' && snapAfter.data()?.duration === '1 Month',
    `duration=${snapAfter.data()?.duration}`);

  const partial = await api('PUT', `/api/courses/${encodeURIComponent(createdId)}`,
    { token: adminToken, body: { fee: 'Rs. 999', totalFee: 'Rs. 1099' } });
  check('partial (fee-only) update succeeds', partial.status === 200 &&
    partial.data?.fee === 'Rs. 999' && partial.data?.courseName === `${testCourseName} (Edited)`,
    `status=${partial.status}`);

  const updateMissing = await api('PUT', '/api/courses/no-such-course-id',
    { token: adminToken, body: { courseName: 'Ghost' } });
  check('updating a missing course → 404',
    updateMissing.status === 404, `status=${updateMissing.status}`);

  const removed = await api('DELETE', `/api/courses/${encodeURIComponent(createdId)}`,
    { token: adminToken });
  check('admin deletes a course → 200', removed.status === 200, `status=${removed.status}`);
  const goneSnap = await db.collection('courses').doc(createdId).get();
  check('the document is gone from Firestore', !goneSnap.exists);
  check('public GET of the deleted course → 404',
    (await api('GET', `/api/courses/${encodeURIComponent(createdId)}`)).status === 404);

  const deleteAgain = await api('DELETE', `/api/courses/${encodeURIComponent(createdId)}`,
    { token: adminToken });
  check('deleting it twice → 404 (no fake success)',
    deleteAgain.status === 404, `status=${deleteAgain.status}`);

  const finalList = await api('GET', '/api/courses');
  check('catalogue count is back to what it was',
    (finalList.data || []).length === beforeCount,
    `${(finalList.data || []).length} vs ${beforeCount}`);
  check('the seeded catalogue is intact after the test',
    (finalList.data || []).some((c) => c.id === anyCourse.id));

  info('test course created and removed; no pre-existing record was modified');
  report();
};

run().catch((err) => {
  console.error('FAIL  course test suite crashed:', err);
  process.exit(1);
});
