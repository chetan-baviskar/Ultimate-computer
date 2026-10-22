#!/usr/bin/env node
/**
 * Phase 4 integration tests: the Admin Dashboard's data endpoints.
 *
 * Drives the REAL Express API over HTTP and independently verifies Cloud
 * Firestore with the Admin SDK. Nothing is mocked.
 *
 * Covered:
 *   - GET /api/users/students is live and administrator-only
 *   - students/anonymous callers are refused (no profile leak)
 *   - the list never exposes administrator accounts
 *   - the health endpoint reports the real data layer
 *   - routes that are NOT part of this migration keep their honest 503
 *
 * Usage:  node test-admin-dashboard.mjs   (API must be running on :5001)
 */

import {
  api,
  check,
  info,
  report,
  ensureAdminAccount,
  ensureStudentAccount,
  signInWeb,
  waitForApi,
  API
} from './test-support.mjs';

const stamp = Date.now();
const ADMIN = { email: `admin.dash.${stamp}@example.com`, password: `Admin#Dash${stamp}` };
const STUDENT = { email: `student.dash.${stamp}@example.com`, password: `Student#Dash${stamp}` };

const run = async () => {
  console.log(`Ultimate Computer — Phase 4 (admin dashboard) tests against ${API}`);

  const up = await waitForApi();
  if (!up) {
    console.log(`FAIL  API is not answering at ${API}`);
    return report();
  }

  const admin = await ensureAdminAccount(ADMIN.email, ADMIN.password);
  const student = await ensureStudentAccount(STUDENT.email, STUDENT.password);
  const adminToken = await signInWeb(ADMIN.email, ADMIN.password);
  const studentToken = await signInWeb(STUDENT.email, STUDENT.password);

  console.log('=== 1. Health reports the real data layer ===');
  const health = await api('GET', '/api/health');
  check('health → 200', health.status === 200 && health.data?.status === 'ok');
  check('dataLayer is "firestore"', health.data?.dataLayer === 'firestore',
    `dataLayer=${health.data?.dataLayer}`);

  console.log('\n=== 2. Student listing is live and administrator-only ===');
  const anon = await api('GET', '/api/users/students');
  check('anonymous → 401 NO_TOKEN', anon.status === 401 && anon.data?.code === 'NO_TOKEN',
    `status=${anon.status}`);
  const forged = await api('GET', '/api/users/students', { token: 'forged.token.value' });
  check('forged token → 401 INVALID_TOKEN',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', `status=${forged.status}`);
  const studentCall = await api('GET', '/api/users/students', { token: studentToken });
  check('STUDENT → 403 ADMIN_REQUIRED', studentCall.status === 403 &&
    studentCall.data?.code === 'ADMIN_REQUIRED', `status=${studentCall.status}`);

  const adminCall = await api('GET', '/api/users/students', { token: adminToken });
  check('admin → 200 with a list of profiles',
    adminCall.status === 200 && Array.isArray(adminCall.data),
    `status=${adminCall.status} count=${Array.isArray(adminCall.data) ? adminCall.data.length : 'n/a'}`);

  const students = Array.isArray(adminCall.data) ? adminCall.data : [];
  check('the real student profile is listed',
    students.some((s) => s.uid === student.uid && s.email === STUDENT.email.toLowerCase()),
    `looking for uid=${student.uid}`);
  check('administrator accounts are NOT listed as students',
    !students.some((s) => s.uid === admin.uid), `admin uid=${admin.uid} leaked`);
  check('listed profiles expose no credentials',
    students.every((s) => s.password === undefined && s.firebasePassword === undefined));
  info(`listing ${students.length} registered profile(s)`);

  console.log('\n=== 3. Still-un-migrated routes stay an honest 503 ===');
  const provision = await api('POST', '/api/users',
    { token: adminToken, body: { email: `new.${stamp}@example.com`, fullName: 'New', password: 'x' } });
  check('POST /api/users (admin provisioning) → 503 DATA_LAYER_UNAVAILABLE',
    provision.status === 503 && provision.data?.code === 'DATA_LAYER_UNAVAILABLE',
    `status=${provision.status}`);

  const adminReset = await api('PATCH', `/api/users/${encodeURIComponent(student.uid)}/password`,
    { token: adminToken, body: { newPassword: 'Whatever#123' } });
  check('PATCH /api/users/:uid/password (admin reset) → 503 DATA_LAYER_UNAVAILABLE',
    adminReset.status === 503 && adminReset.data?.code === 'DATA_LAYER_UNAVAILABLE',
    `status=${adminReset.status}`);

  const selfPassword = await api('PATCH', '/api/auth/password',
    { token: studentToken, body: { newPassword: 'Whatever#123' } });
  check('PATCH /api/auth/password → 503 DATA_LAYER_UNAVAILABLE',
    selfPassword.status === 503 && selfPassword.data?.code === 'DATA_LAYER_UNAVAILABLE',
    `status=${selfPassword.status}`);

  report();
};

run().catch((err) => {
  console.error('FAIL  admin dashboard test suite crashed:', err);
  process.exit(1);
});
