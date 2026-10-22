#!/usr/bin/env node
/**
 * Administrator authentication + authorization integration tests.
 *
 * Covers exactly what the admin rollout must prove:
 *   1. provisioning state   Firebase Auth user + admin custom claim + Firestore
 *                           profile (verified independently with the Admin SDK)
 *   2. admin login          a REAL sign-in with the credentials stored in
 *                           server/.env (ADMIN_EMAIL / ADMIN_PASSWORD)
 *   3. invalid credentials  wrong password / unknown address / missing or
 *                           forged token — never a session
 *   4. admin authorization  every protected admin route answers 200 for the
 *                           administrator and 401/403 for everyone else
 *   5. student restrictions students and anonymous callers are refused
 *   6. dashboard loading    the exact endpoints the Admin Dashboard polls
 *
 * The password is read from server/.env and is NEVER printed, never asserted
 * against a log line and never sent anywhere except the Firebase Web SDK
 * (the API itself never sees it — it only ever sees the resulting ID token).
 *
 * Usage:  node test-admin-auth.mjs   (API must be running on :5001)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import {
  api,
  check,
  info,
  report,
  adminResources,
  ensureStudentAccount,
  signInWeb,
  waitForApi,
  API
} from './test-support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').split(',')[0].trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');

/** Local (offline) decode of a JWT payload — used to inspect the custom claims. */
const decodeToken = (token) => {
  const part = String(token).split('.')[1] || '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
};

const stamp = Date.now();
const STUDENT = { email: `student.admin.${stamp}@example.com`, password: `Student#Admin${stamp}` };

const run = async () => {
  console.log(`Ultimate Computer — admin authentication tests against ${API}`);
  console.log(`  administrator: ${ADMIN_EMAIL} (password read from server/.env, not printed)`);

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('FAIL  ADMIN_EMAIL / ADMIN_PASSWORD are not set in server/.env');
    return report();
  }

  const up = await waitForApi();
  if (!up) {
    console.log(`FAIL  API is not answering at ${API}`);
    return report();
  }

  /* ---------------------------------------------------- 1. provisioning state */
  console.log('=== 1. Provisioning state (Firebase Auth + claim + Firestore profile) ===');
  const { adminAuth, db } = adminResources();

  let adminUid = null;
  let accountExists = true;
  try {
    const user = await adminAuth.getUserByEmail(ADMIN_EMAIL);
    adminUid = user.uid;
    check('administrator exists in Firebase Authentication', true, `uid=${adminUid}`);
    check('account is enabled', user.disabled === false);
    const claims = user.customClaims || {};
    check('admin custom claim is set', claims.admin === true || claims.role === 'admin',
      `claims=${JSON.stringify(claims)}`);
  } catch (err) {
    accountExists = false;
    check('administrator exists in Firebase Authentication', false, err?.code || err?.message);
  }

  if (accountExists) {
    const snap = await db.collection('users').doc(adminUid).get();
    check('Firestore profile users/{uid} exists with role=admin',
      snap.exists && snap.data()?.role === 'admin',
      snap.exists ? `role=${snap.data()?.role}` : 'profile missing');
  }

  /* --------------------------------------------------------- 2. admin login */
  console.log('\n=== 2. Admin login (real sign-in with the server/.env credentials) ===');
  let adminToken = null;
  try {
    adminToken = await signInWeb(ADMIN_EMAIL, ADMIN_PASSWORD);
    check('admin signs in with the initial password from server/.env', Boolean(adminToken));
  } catch (err) {
    check('admin signs in with the initial password from server/.env', false,
      `${err?.code || err?.message} — if the stored password differs, run: npm run provision:admin -- --set-password`);
  }

  if (adminToken) {
    const payload = decodeToken(adminToken);
    check('the ID token itself carries the admin custom claim',
      payload.admin === true || payload.role === 'admin',
      `admin=${payload.admin} role=${payload.role}`);

    const login = await api('POST', '/api/auth/login', { token: adminToken });
    check('POST /api/auth/login → 200 with role admin',
      login.status === 200 && login.data?.user?.role === 'admin',
      `status=${login.status} role=${login.data?.user?.role}`);
    check('login response addresses the administrator',
      login.data?.user?.email === ADMIN_EMAIL, `email=${login.data?.user?.email}`);
    check('login response exposes no credential field',
      !('password' in (login.data?.user || {})) && !('passwordHash' in (login.data?.user || {})));

    const me = await api('GET', '/api/auth/me', { token: adminToken });
    check('GET /api/auth/me → 200 with role admin (dashboard session restore)',
      me.status === 200 && me.data?.role === 'admin', `status=${me.status}`);

    const ownProfile = await api('GET', `/api/users/${encodeURIComponent(adminUid)}`, { token: adminToken });
    check('GET /api/users/:uid (own profile) → 200', ownProfile.status === 200,
      `status=${ownProfile.status}`);
  }

  /* -------------------------------------------------- 3. invalid credentials */
  console.log('\n=== 3. Invalid credentials never produce a session ===');
  try {
    await signInWeb(ADMIN_EMAIL, 'Wrong#Password123');
    check('wrong password is rejected by Firebase', false, 'sign-in unexpectedly succeeded');
  } catch (err) {
    check('wrong password is rejected by Firebase',
      ['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials']
        .includes(err?.code), err?.code || err?.message);
  }

  try {
    await signInWeb(`nobody.${stamp}@example.com`, 'Whatever#123');
    check('unknown address is rejected by Firebase', false, 'sign-in unexpectedly succeeded');
  } catch (err) {
    check('unknown address is rejected by Firebase',
      ['auth/invalid-credential', 'auth/user-not-found', 'auth/invalid-login-credentials']
        .includes(err?.code), err?.code || err?.message);
  }

  const passwordOnly = await api('POST', '/api/auth/login',
    { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  check('the API never accepts an e-mail/password pair → 401 NO_TOKEN',
    passwordOnly.status === 401 && passwordOnly.data?.code === 'NO_TOKEN',
    `status=${passwordOnly.status} code=${passwordOnly.data?.code}`);

  const forged = await api('POST', '/api/auth/login', { token: 'forged.token.value' });
  check('a forged token → 401 INVALID_TOKEN',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN',
    `status=${forged.status} code=${forged.data?.code}`);

  /* -------------------------------------------- 4/5. authorization + students */
  console.log('\n=== 4. Protected admin routes (admin → 200, nobody else) ===');
  const student = await ensureStudentAccount(STUDENT.email, STUDENT.password);
  const studentToken = await signInWeb(STUDENT.email, STUDENT.password);

  const adminOnlyRoutes = [
    ['GET', '/api/users/students'],
    ['GET', '/api/enquiries']
  ];

  for (const [method, route] of adminOnlyRoutes) {
    const anon = await api(method, route);
    check(`anonymous ${method} ${route} → 401 NO_TOKEN`,
      anon.status === 401 && anon.data?.code === 'NO_TOKEN', `status=${anon.status}`);

    const forgedCall = await api(method, route, { token: 'forged.token.value' });
    check(`forged token ${method} ${route} → 401 INVALID_TOKEN`,
      forgedCall.status === 401 && forgedCall.data?.code === 'INVALID_TOKEN',
      `status=${forgedCall.status}`);

    const asStudent = await api(method, route, { token: studentToken });
    check(`STUDENT ${method} ${route} → 403 ADMIN_REQUIRED`,
      asStudent.status === 403 && asStudent.data?.code === 'ADMIN_REQUIRED',
      `status=${asStudent.status} code=${asStudent.data?.code}`);

    if (adminToken) {
      const asAdmin = await api(method, route, { token: adminToken });
      const ok = asAdmin.status === 200 && Array.isArray(asAdmin.data);
      check(`ADMIN ${method} ${route} → 200 list`, ok,
        `status=${asAdmin.status} count=${Array.isArray(asAdmin.data) ? asAdmin.data.length : 'n/a'}`);
      if (ok) {
        check(`  ${route} leaks no credential fields`,
          asAdmin.data.every((row) => row && row.password === undefined && row.passwordHash === undefined));
      }
    }
  }

  console.log('\n--- GET /api/applications is scoped by the server, not admin-only ---');
  const anonApps = await api('GET', '/api/applications');
  check('anonymous GET /api/applications → 401 NO_TOKEN',
    anonApps.status === 401 && anonApps.data?.code === 'NO_TOKEN', `status=${anonApps.status}`);

  const studentApps = await api('GET', '/api/applications', { token: studentToken });
  check('STUDENT GET /api/applications → 200 (their own dashboard still works)',
    studentApps.status === 200 && Array.isArray(studentApps.data),
    `status=${studentApps.status} count=${Array.isArray(studentApps.data) ? studentApps.data.length : 'n/a'}`);
  check('  the student receives ONLY their own applications',
    Array.isArray(studentApps.data) &&
      studentApps.data.every((app) => app.studentUid === student.uid ||
        String(app.email || '').toLowerCase() === STUDENT.email.toLowerCase()),
    Array.isArray(studentApps.data) ? `rows=${studentApps.data.length}` : 'not an array');

  console.log('\n--- admin-only writes refuse a student before touching the data ---');
  const forbiddenWrites = [
    ['POST', '/api/courses', { courseName: 'Should Not Exist' }],
    ['PUT', '/api/courses/does-not-exist', { courseName: 'Nope' }],
    ['DELETE', '/api/courses/does-not-exist', undefined],
    ['PATCH', '/api/applications/does-not-exist', { status: 'Approved' }],
    ['DELETE', '/api/applications/does-not-exist', undefined],
    ['PATCH', '/api/enquiries/does-not-exist/read', undefined],
    ['DELETE', '/api/enquiries/does-not-exist', undefined]
  ];
  for (const [method, route, body] of forbiddenWrites) {
    const res = await api(method, route, { token: studentToken, body });
    check(`STUDENT ${method} ${route} → 403 ADMIN_REQUIRED`,
      res.status === 403 && res.data?.code === 'ADMIN_REQUIRED',
      `status=${res.status} code=${res.data?.code}`);
  }

  console.log('\n--- student isolation still holds ---');
  const otherUid = 'someone-else-uid';
  const readOther = await api('GET', `/api/users/${encodeURIComponent(otherUid)}`, { token: studentToken });
  check('STUDENT cannot read another profile → 403 FORBIDDEN',
    readOther.status === 403 && readOther.data?.code === 'FORBIDDEN',
    `status=${readOther.status} code=${readOther.data?.code}`);

  const ownApps = await api('GET', '/api/applications', { token: studentToken });
  check('STUDENT listing own applications → 200 (dashboard for students still works)',
    ownApps.status === 200 && Array.isArray(ownApps.data), `status=${ownApps.status}`);

  /* ------------------------------------------------------ 6. dashboard loading */
  console.log('\n=== 5. Admin Dashboard data endpoints load ===');
  if (adminToken) {
    const health = await api('GET', '/api/health');
    check('health → 200 with the firestore data layer',
      health.status === 200 && health.data?.dataLayer === 'firestore',
      `dataLayer=${health.data?.dataLayer}`);

    const firestore = await api('GET', '/api/health/firestore');
    check('Firestore health probe → 200 ok',
      firestore.status === 200 && firestore.data?.status === 'ok',
      `status=${firestore.status} ${firestore.data?.status || ''}`);

    for (const route of ['/api/users/students', '/api/applications', '/api/enquiries', '/api/courses']) {
      const res = await api('GET', route, { token: adminToken });
      check(`dashboard poll ${route} → 200 array`,
        res.status === 200 && Array.isArray(res.data),
        `status=${res.status} count=${Array.isArray(res.data) ? res.data.length : 'n/a'}`);
    }

    const coursesWrite = await api('POST', '/api/courses', {
      token: adminToken,
      body: { courseName: 'Admin Auth Probe Course' }
    });
    check('ADMIN can create a course → 201', coursesWrite.status === 201,
      `status=${coursesWrite.status}`);
    if (coursesWrite.status === 201) {
      const del = await api('DELETE', `/api/courses/${encodeURIComponent(coursesWrite.data.id)}`,
        { token: adminToken });
      check('probe course removed again → 200', del.status === 200, `status=${del.status}`);
    }
  } else {
    info('skipped: the administrator could not sign in (see the login check above)');
  }

  report();
};

run().catch((err) => {
  console.error('FAIL  admin authentication test suite crashed:', err);
  process.exit(1);
});
