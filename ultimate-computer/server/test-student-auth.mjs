#!/usr/bin/env node
/**
 * Integration tests for Firebase Authentication + Cloud Firestore student auth.
 *
 * What makes these tests meaningful: they import the REAL frontend service
 * (src/services/authService.js) and drive it against the REAL Express API
 * (http://127.0.0.1:5001), then verify the results independently in Firebase
 * Authentication and Cloud Firestore with the Admin SDK. Nothing is mocked.
 *
 * Usage:
 *   node test-student-auth.mjs                  # full suite (API must be running)
 *   node test-student-auth.mjs --after-restart  # re-verify the saved session after
 *                                               # the backend was restarted
 *
 * The script only CREATES test accounts/requests; it never deletes or rewrites
 * any pre-existing record.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { initializeApp as initWebApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from 'firebase/auth';

import { firebaseConfig } from '../src/config/firebaseConfig.js';

import { initializeApp as initAdminApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.API_URL || 'http://127.0.0.1:5001';

// The frontend API wrapper needs an absolute base URL outside the browser
// (in Vite it comes from import.meta.env.VITE_API_URL). Set it BEFORE loading
// the service module — hence the dynamic import below.
process.env.VITE_API_URL = API;
const authService = await import('../src/services/authService.js');
const STATE_FILE = path.join(
  process.env.OPENCODE_TEMP_DIR || path.join(os.tmpdir(), 'opencode'),
  'ultimate-computer-auth-test-state.json'
);

/** Single Firebase app/auth instance for this process (same one the app uses). */
const webApp = initWebApp(firebaseConfig);
const auth = getAuth(webApp);

/** Passwords of the accounts created in this run, keyed by email. */
const PASSWORDS = {};

/* ------------------------------------------------------------------ utils */

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const info = (line) => console.log(`      ${line}`);

const api = async (method, pathname, { body, token } = {}) => {
  try {
    const res = await fetch(`${API}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.message } };
  }
};

const expectAuthError = async (name, fn, expectedCodes) => {
  try {
    await fn();
    check(name, false, 'no error was thrown');
  } catch (err) {
    const code = err.code || '';
    check(name, expectedCodes.includes(code), `code=${code}${err.status ? ` status=${err.status}` : ''}`);
  }
};

const currentIdToken = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);

/** Obtains a token for a specific test account (signs that account in). */
const tokenFor = async (email) => {
  const credential = await signInWithEmailAndPassword(auth, email, PASSWORDS[email]);
  return credential.user.getIdToken();
};

/** Independent Admin SDK handle — used to verify what really landed server-side. */
const adminResources = () => {
  const keyPath = path.resolve(__dirname, 'firebase-service-account.json');
  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const app = getApps().length
    ? getApps()[0]
    : initAdminApp({ credential: cert(sa), projectId: sa.project_id });
  return { adminAuth: getAdminAuth(app), db: getFirestore(app) };
};

const report = () => {
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

/* ------------------------------------------- phase 1: full end-to-end run */

const runFullSuite = async () => {
  const stamp = Date.now();
  const emailA = `student.a.${stamp}@example.com`;
  const emailB = `student.b.${stamp}@example.com`;
  const passwordA = `Test#Pass${stamp}`;
  const passwordB = `Test#PassB${stamp}`;
  const NEW_PASSWORD_A = `NewTest#Pass${stamp}`;
  PASSWORDS[emailA] = passwordA;
  PASSWORDS[emailB] = passwordB;

  const { adminAuth, db } = adminResources();

  console.log('=== 1. API health & untouched modules ===');
  const health = await api('GET', '/api/health');
  check('GET /api/health → 200', health.status === 200 && health.data?.status === 'ok');
  check('health reports Firebase connected', health.data?.firebase?.status === 'ok');
  check('health reports the firestore data layer',
    health.data?.dataLayer === 'firestore', String(health.data?.dataLayer));

  const fsHealth = await api('GET', '/api/health/firestore');
  check('GET /api/health/firestore → 200', fsHealth.status === 200 && fsHealth.data?.status === 'ok',
    `latency=${fsHealth.data?.latencyMs}ms`);

  const courses = await api('GET', '/api/courses');
  check('GET /api/courses serves the catalogue → 200', courses.status === 200 && Array.isArray(courses.data),
    `${courses.data?.length || 0} courses`);

  const students = await api('GET', '/api/users/students');
  check('admin-only route refuses an anonymous caller (no data leak)',
    students.status === 401 && students.data?.code === 'NO_TOKEN',
    `status=${students.status}`);

  console.log('\n=== 2. Unauthenticated / forged requests are rejected ===');
  const noToken = await api('GET', '/api/auth/me');
  check('GET /api/auth/me without token → 401 NO_TOKEN',
    noToken.status === 401 && noToken.data?.code === 'NO_TOKEN', `status=${noToken.status}`);
  const noTokenRegister = await api('POST', '/api/auth/register', { body: { fullName: 'Sneaky' } });
  check('POST /api/auth/register without token → 401', noTokenRegister.status === 401,
    `status=${noTokenRegister.status}`);
  const forged = await api('GET', '/api/auth/me', { token: 'not.a.real.id.token' });
  check('forged ID token → 401 INVALID_TOKEN',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', `status=${forged.status}`);

  console.log('\n=== 3. Registration (real Firebase Auth + Firestore profile) ===');
  let profileA = null;
  try {
    profileA = await authService.register({
      email: emailA,
      password: passwordA,
      fullName: 'Test Student A',
      mobile: '9876543210',
      course: 'ADCA (Advanced Diploma in Computer Applications)',
      role: 'admin' // must be IGNORED — public registration cannot grant roles
    });
    check('authService.register() succeeds', Boolean(profileA?.uid), `uid=${profileA?.uid}`);
  } catch (err) {
    check('authService.register() succeeds', false, `${err.code}: ${err.message}`);
  }

  if (profileA) {
    check('profile role is "student" (supplied role:"admin" ignored)',
      profileA.role === 'student', `role=${profileA.role}`);
    check('profile email matches the account', profileA.email === emailA, profileA.email);
    check('profile stores mobile number', profileA.mobile === '9876543210');
    check('profile stores selected course', /ADCA/.test(profileA.course || ''), profileA.course);
    check('profile has server timestamps', Boolean(profileA.createdAt && profileA.updatedAt),
      `createdAt=${profileA.createdAt}`);

    try {
      const user = await adminAuth.getUserByEmail(emailA);
      check('user exists in Firebase Authentication', user.uid === profileA.uid, `uid=${user.uid}`);
      check('email/password provider attached',
        (user.providerData || []).some((p) => p.providerId === 'password'));
    } catch (err) {
      check('user exists in Firebase Authentication', false, err.code);
    }

    const snap = await db.collection('users').doc(profileA.uid).get();
    check('profile document exists in Cloud Firestore at users/{uid}', snap.exists, `users/${profileA.uid}`);
    check('Firestore document id == Firebase Auth UID', snap.id === profileA.uid);
    const stored = snap.data() || {};
    check('Firestore doc holds name/email/mobile/course/role',
      stored.fullName === 'Test Student A' && stored.email === emailA &&
      stored.mobile === '9876543210' && /ADCA/.test(stored.course || '') && stored.role === 'student');
    check('Firestore doc holds server timestamps',
      Boolean(stored.createdAt?.toDate && stored.updatedAt?.toDate));

    const badName = await api('POST', '/api/auth/register', {
      token: await currentIdToken(),
      body: { fullName: '   ' }
    });
    check('register validation rejects empty fullName → 400 VALIDATION_ERROR',
      badName.status === 400 && badName.data?.code === 'VALIDATION_ERROR', `status=${badName.status}`);
  } else {
    // Everything below depends on a completed registration — stop honestly
    // instead of cascading confusing failures.
    check('registration completed — dependent checks can run', false, 'stopping suite here');
    return report();
  }

  console.log('\n=== 4. Login / wrong password / logout / re-login ===');
  await expectAuthError(
    'incorrect password is rejected',
    () => authService.login(emailA, 'definitely-the-wrong-password'),
    ['INVALID_CREDENTIALS', 'USER_NOT_FOUND']
  );
  check('no session is left behind after a failed login', auth.currentUser === null,
    auth.currentUser ? 'currentUser still set' : 'currentUser null');

  let sessionProfile = null;
  try {
    sessionProfile = await authService.login(emailA, passwordA);
    check('login with correct password succeeds', sessionProfile?.email === emailA);
  } catch (err) {
    check('login with correct password succeeds', false, `${err.code}: ${err.message}`);
  }

  const me = await api('GET', '/api/auth/me', { token: await currentIdToken() });
  check('GET /api/auth/me returns the profile (ID token sent by the client)',
    me.status === 200 && me.data?.uid === profileA?.uid, `status=${me.status}`);

  await authService.logout();
  check('logout clears the Firebase session', auth.currentUser === null);
  const afterLogout = await api('GET', '/api/auth/me');
  check('after logout the API rejects the request → 401', afterLogout.status === 401,
    `status=${afterLogout.status}`);

  try {
    const again = await authService.login(emailA, passwordA);
    check('re-login after logout succeeds', again?.uid === profileA?.uid);
  } catch (err) {
    check('re-login after logout succeeds', false, `${err.code}: ${err.message}`);
  }

  // This is the same callback the app uses to restore state when the browser
  // is refreshed.
  const restored = await new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      resolve(user);
    });
    setTimeout(() => resolve(null), 5000);
  });
  check('onAuthStateChanged reports the signed-in user (refresh/restore wiring)',
    restored?.uid === profileA?.uid, restored ? `uid=${restored.uid}` : 'no user delivered');

  console.log('\n=== 5. Student isolation: only your own profile ===');
  if (!profileA) {
    check('student A profile available for isolation tests', false, 'registration did not complete');
  } else {
    const own = await api('GET', `/api/users/${profileA.uid}`, { token: await currentIdToken() });
    check('student A can read own profile → 200', own.status === 200 && own.data?.uid === profileA.uid,
      `status=${own.status}`);
  }

  await authService.logout();
  let profileB = null;
  try {
    profileB = await authService.register({
      email: emailB,
      password: passwordB,
      fullName: 'Test Student B',
      mobile: '9876543211',
      course: 'DCA (Diploma in Computer Applications)'
    });
    check('second student registration succeeds', Boolean(profileB?.uid), `uid=${profileB?.uid}`);
  } catch (err) {
    check('second student registration succeeds', false, `${err.code}: ${err.message}`);
  }

  if (profileA && profileB) {
    const bFromA = await api('GET', `/api/users/${profileB.uid}`, { token: await tokenFor(emailA) });
    check('student A cannot read student B\'s profile → 403 FORBIDDEN',
      bFromA.status === 403 && bFromA.data?.code === 'FORBIDDEN', `status=${bFromA.status}`);

    const aFromB = await api('GET', `/api/users/${profileA.uid}`, { token: await tokenFor(emailB) });
    check('student B cannot read student A\'s profile → 403 FORBIDDEN',
      aFromB.status === 403 && aFromB.data?.code === 'FORBIDDEN', `status=${aFromB.status}`);

    const bOwn = await api('GET', `/api/users/${profileB.uid}`, { token: await currentIdToken() });
    check('student B can read own profile → 200', bOwn.status === 200 && bOwn.data?.uid === profileB.uid,
      `status=${bOwn.status}`);

    const ownWithoutToken = await api('GET', `/api/users/${profileA.uid}`);
    check('own profile without a token → 401', ownWithoutToken.status === 401, `status=${ownWithoutToken.status}`);
  }

  console.log('\n=== 6. Profile updates (editable fields only) ===');
  await authService.logout();
  await authService.login(emailA, passwordA);
  const tokenA = await currentIdToken();
  const patched = await api('PATCH', `/api/users/${profileA.uid}`, {
    token: tokenA,
    body: { fullName: 'Test Student A Updated', mobile: '9876540000', role: 'admin', uid: 'someone-else' }
  });
  check('own profile update succeeds → 200',
    patched.status === 200 && patched.data?.fullName === 'Test Student A Updated' &&
    patched.data?.mobile === '9876540000', `status=${patched.status}`);
  check('role cannot be escalated through PATCH', patched.data?.role === 'student', `role=${patched.data?.role}`);
  check('uid cannot be rewritten through PATCH', patched.data?.uid === profileA.uid, `uid=${patched.data?.uid}`);

  const missingName = await api('PATCH', `/api/users/${profileA.uid}`, { token: tokenA, body: { fullName: '  ' } });
  check('PATCH with empty name → 400 VALIDATION_ERROR',
    missingName.status === 400 && missingName.data?.code === 'VALIDATION_ERROR', `status=${missingName.status}`);

  console.log('\n=== 7. Duplicate registration ===');
  await expectAuthError(
    'registering the same email again is rejected',
    () => authService.register({ email: emailA, password: passwordA, fullName: 'Dup', course: 'DCA' }),
    ['EMAIL_EXISTS']
  );
  const dupSnapshot = await db.collection('users').doc(profileA.uid).get();
  check('no duplicate profile document was created', dupSnapshot.exists);
  const usersWithAEmail = await db.collection('users').where('email', '==', emailA).get();
  check('exactly one profile document holds this email', usersWithAEmail.size === 1,
    `docs=${usersWithAEmail.size}`);

  console.log('\n=== 8. Account recovery / migration path ===');
  const unknownEmail = `legacy.${stamp}@example.com`;
  const msUnknown = await api('POST', '/api/auth/migration-status', { body: { email: unknownEmail } });
  check('migration-status: address with no Firebase user → migrationNeeded=true',
    msUnknown.status === 200 && msUnknown.data?.migrationNeeded === true, JSON.stringify(msUnknown.data));

  const msKnown = await api('POST', '/api/auth/migration-status', { body: { email: emailA } });
  check('migration-status: registered address → migrationNeeded=false',
    msKnown.status === 200 && msKnown.data?.migrationNeeded === false, JSON.stringify(msKnown.data));

  const mr1 = await api('POST', '/api/auth/migration-requests', {
    body: { email: unknownEmail, fullName: 'Legacy Student', mobile: '9876543212' }
  });
  check('migration request accepted → 201', mr1.status === 201 && mr1.data?.status === 'pending',
    `status=${mr1.status}`);

  const mr2 = await api('POST', '/api/auth/migration-requests', {
    body: { email: unknownEmail, fullName: 'Legacy Student', mobile: '9876543212' }
  });
  check('repeat migration request is idempotent → 200 already-requested',
    mr2.status === 200 && mr2.data?.status === 'already-requested', `status=${mr2.status}`);

  const mrActive = await api('POST', '/api/auth/migration-requests', {
    body: { email: emailA, fullName: 'Active Student' }
  });
  check('migration request refused for an active account → 409 ACCOUNT_EXISTS',
    mrActive.status === 409 && mrActive.data?.code === 'ACCOUNT_EXISTS', `status=${mrActive.status}`);

  const mrInvalid = await api('POST', '/api/auth/migration-requests', { body: { email: 'not-an-email' } });
  check('migration request validates the email → 400 VALIDATION_ERROR',
    mrInvalid.status === 400 && mrInvalid.data?.code === 'VALIDATION_ERROR', `status=${mrInvalid.status}`);

  const mrDocs = await db.collection('account_migration_requests').where('email', '==', unknownEmail).get();
  check('exactly one migration request stored for the address', mrDocs.size === 1, `docs=${mrDocs.size}`);

  console.log('\n=== 9. Password change (Firebase re-verification) ===');
  await authService.logout();
  await authService.login(emailA, passwordA);

  await expectAuthError(
    'wrong current password is refused',
    () => authService.changePassword('not-the-current-password', NEW_PASSWORD_A),
    ['WRONG_CURRENT_PASSWORD']
  );

  try {
    await authService.changePassword(passwordA, NEW_PASSWORD_A);
    check('password change with the correct current password succeeds', true);
  } catch (err) {
    check('password change with the correct current password succeeds', false, `${err.code}: ${err.message}`);
  }
  PASSWORDS[emailA] = NEW_PASSWORD_A;

  await authService.logout();
  await expectAuthError(
    'old password no longer works after the change',
    () => authService.login(emailA, passwordA),
    ['INVALID_CREDENTIALS', 'USER_NOT_FOUND']
  );
  try {
    const relogged = await authService.login(emailA, NEW_PASSWORD_A);
    check('login with the new password succeeds', relogged?.email === emailA);
  } catch (err) {
    check('login with the new password succeeds', false, `${err.code}: ${err.message}`);
  }

  console.log('\n=== 10. Password reset email ===');
  try {
    await authService.sendPasswordReset(emailA);
    check('Firebase accepted the password-reset request for a real account', true);
  } catch (err) {
    check('Firebase accepted the password-reset request for a real account', false,
      `${err.code}: ${err.message}`);
  }

  // Firebase answers silently for unknown addresses (it does not reveal who
  // has an account), so the meaningful assertion is that a reset request can
  // never create an account on its own.
  const nobodyEmail = `nobody.${stamp}@example.com`;
  try {
    await authService.sendPasswordReset(nobodyEmail);
  } catch (err) {
    info(`reset for unknown address answered: ${err.code}`);
  }
  let nobodyExists = true;
  try {
    await adminAuth.getUserByEmail(nobodyEmail);
  } catch (err) {
    nobodyExists = err.code !== 'auth/user-not-found';
  }
  check('password reset never creates an account for an unknown address', nobodyExists === false);
  const nobodyProfile = await db.collection('users').where('email', '==', nobodyEmail).get();
  check('password reset never creates a profile for an unknown address', nobodyProfile.empty);

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    email: emailA,
    password: NEW_PASSWORD_A,
    uid: profileA?.uid,
    token: await currentIdToken(),
    savedAt: new Date().toISOString()
  }, null, 2));
  info(`session saved for --after-restart: ${STATE_FILE}`);

  report();
};

/* ------------------------------------------------- phase 2: after restart */

const runAfterRestart = async () => {
  console.log('\n=== PHASE 2: authenticated API after a full backend restart ===');

  if (!fs.existsSync(STATE_FILE)) {
    console.log('FAIL  no saved test session found — run the full suite first');
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  const health = await api('GET', '/api/health');
  check('backend is up after restart', health.status === 200 && health.data?.status === 'ok',
    `status=${health.status}`);

  const me = await api('GET', '/api/auth/me', { token: state.token });
  check('saved Firebase ID token still verifies after restart',
    me.status === 200 && me.data?.uid === state.uid, `status=${me.status}`);

  const profile = await api('GET', `/api/users/${state.uid}`, { token: state.token });
  check('own profile readable after restart',
    profile.status === 200 && profile.data?.email === state.email, `status=${profile.status}`);

  const foreign = await api('GET', `/api/users/some-other-student-uid`, { token: state.token });
  check('another student\'s profile still forbidden after restart',
    foreign.status === 403 || foreign.status === 404, `status=${foreign.status}`);

  const forged = await api('GET', '/api/auth/me', { token: 'forged-token-after-restart' });
  check('forged token still rejected after restart',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', `status=${forged.status}`);

  // Fresh process → fresh Firebase Auth instance, so this mirrors a browser
  // that was closed and reopened: sign in again with the stored credentials.
  try {
    await signInWithEmailAndPassword(auth, state.email, state.password);
    check('login works after restart', true);
  } catch (err) {
    check('login works after restart', false, err.code);
  }
  await expectAuthError(
    'wrong password rejected after restart',
    () => signInWithEmailAndPassword(auth, state.email, 'wrong-password-again'),
    ['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials']
  );

  report();
};

/* ------------------------------------------------------------------- main */

console.log(`Ultimate Computer — Firebase student auth tests against ${API}`);
(process.argv.includes('--after-restart') ? runAfterRestart : runFullSuite)().catch((err) => {
  console.error('FAIL  test suite crashed:', err);
  process.exit(1);
});
