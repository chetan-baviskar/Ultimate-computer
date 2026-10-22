// Password-change contract under Firebase Authentication.
//
// The API does NOT change passwords: passwords belong to Firebase
// Authentication, and the browser changes them only AFTER Firebase re-verifies
// the current password (src/services/authService.js changePassword). This
// server cannot verify a "current password" without bypassing Firebase, so the
// endpoint stays an honest 503 instead of accepting an unverified change.
// The real end-to-end password change is covered by test-student-auth.mjs
// (section 9) against the live Firebase SDK.
import {
  api,
  check,
  info,
  report,
  ensureStudentAccount,
  signInWeb,
  waitForApi,
  API
} from './test-support.mjs';

const stamp = Date.now();
const STUDENT = { email: `student.pw.${stamp}@example.com`, password: `Student#Pw${stamp}` };

console.log(`Ultimate Computer — password-change contract tests against ${API}`);

if (!(await waitForApi())) {
  console.log(`FAIL  API is not answering at ${API}`);
  report();
} else {
  await ensureStudentAccount(STUDENT.email, STUDENT.password);
  const token = await signInWeb(STUDENT.email, STUDENT.password);

  console.log('--- the API never verifies or stores a password itself ---');
  const passwordLogin = await api('POST', '/api/auth/login',
    { body: { email: STUDENT.email, password: STUDENT.password } });
  check('POST /api/auth/login with e-mail/password -> 401 (no server-side password check)',
    passwordLogin.status === 401 && passwordLogin.data?.code === 'NO_TOKEN', JSON.stringify(passwordLogin.data));

  const legacyRoute = await api('PATCH', '/api/auth/password',
    { token, body: { currentPassword: STUDENT.password, newPassword: 'Another#Pass123' } });
  check('PATCH /api/auth/password -> 503 DATA_LAYER_UNAVAILABLE (honest, never a fake change)',
    legacyRoute.status === 503 && legacyRoute.data?.code === 'DATA_LAYER_UNAVAILABLE',
    JSON.stringify(legacyRoute.data));

  console.log('\n--- the session itself keeps working after the refused change ---');
  const me = await api('GET', '/api/auth/me', { token });
  check('the caller is still signed in -> 200', me.status === 200 && me.data?.email === STUDENT.email,
    JSON.stringify(me.data?.email));

  const relogin = await signInWeb(STUDENT.email, STUDENT.password);
  check('the original password still signs in (nothing changed server-side)', Boolean(relogin));
  info('the real password change lives in Firebase Auth — see test-student-auth.mjs section 9');

  report();
}
