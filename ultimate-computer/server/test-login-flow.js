// End-to-end smoke test of the session flow for BOTH roles (student + admin).
//
// Accounts are created with Firebase Authentication (the browser signs in with
// the Firebase Web SDK); the API only ever sees the resulting ID token. The
// API itself NEVER accepts an e-mail/password pair — a missing or forged token
// is a 401, never a session.
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
const STUDENT = { email: `student.flow.${stamp}@example.com`, password: `Student#Flow${stamp}` };
const ADMIN = { email: `admin.flow.${stamp}@example.com`, password: `Admin#Flow${stamp}` };

console.log(`Ultimate Computer — session flow tests against ${API}`);

if (!(await waitForApi())) {
  console.log(`FAIL  API is not answering at ${API}`);
  report();
} else {
  console.log('--- health ---');
  const health = await api('GET', '/api/health');
  check('health returns ok', health.status === 200 && health.data?.status === 'ok',
    JSON.stringify(health.data));
  info(`dataLayer=${health.data?.dataLayer}`);

  console.log('\n--- the API never accepts an e-mail/password pair ---');
  const passwordLogin = await api('POST', '/api/auth/login',
    { body: { email: STUDENT.email, password: STUDENT.password } });
  check('login with e-mail/password and no token -> 401 NO_TOKEN',
    passwordLogin.status === 401 && passwordLogin.data?.code === 'NO_TOKEN',
    JSON.stringify(passwordLogin));

  console.log('\n--- student session (Firebase ID token) ---');
  await ensureStudentAccount(STUDENT.email, STUDENT.password);
  const studentToken = await signInWeb(STUDENT.email, STUDENT.password);

  const sLogin = await api('POST', '/api/auth/login', { token: studentToken });
  check('login with a verified token -> 200 + student profile',
    sLogin.status === 200 && sLogin.data?.user?.role === 'student', JSON.stringify(sLogin.data));
  check('login response never exposes a credential field',
    !('password' in (sLogin.data?.user || {})) && !('passwordHash' in (sLogin.data?.user || {})),
    JSON.stringify(Object.keys(sLogin.data?.user || {})));

  const me = await api('GET', '/api/auth/me', { token: studentToken });
  check('/me with student token -> 200 + uid', me.status === 200 && Boolean(me.data?.uid),
    JSON.stringify(me.data?.uid));
  check('/me without token -> 401 NO_TOKEN',
    (await api('GET', '/api/auth/me')).data?.code === 'NO_TOKEN');
  const forged = await api('GET', '/api/auth/me', { token: 'forged.token.value' });
  check('/me with a forged token -> 401 INVALID_TOKEN',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', JSON.stringify(forged.data));

  console.log('\n--- own profile read (used by AuthContext.applySession) ---');
  const profile = await api('GET', `/api/users/${encodeURIComponent(me.data.uid)}`, { token: studentToken });
  check('GET /api/users/:uid -> 200 with the same account',
    profile.status === 200 && profile.data?.email === STUDENT.email, JSON.stringify(profile.data));

  console.log('\n--- admin session ---');
  await ensureAdminAccount(ADMIN.email, ADMIN.password);
  const adminToken = await signInWeb(ADMIN.email, ADMIN.password);
  const aLogin = await api('POST', '/api/auth/login', { token: adminToken });
  check('login with a verified admin token -> 200 + role admin',
    aLogin.status === 200 && aLogin.data?.user?.role === 'admin', JSON.stringify(aLogin.data));

  const aStudents = await api('GET', '/api/users/students', { token: adminToken });
  check('admin can list student profiles -> 200', aStudents.status === 200 && Array.isArray(aStudents.data),
    `count=${Array.isArray(aStudents.data) ? aStudents.data.length : 'n/a'}`);

  console.log('\n--- role escalation is impossible through the request ---');
  const escalate = await api('PATCH', `/api/users/${encodeURIComponent(me.data.uid)}`,
    { token: studentToken, body: { role: 'admin' } });
  // Either the field is rejected outright (400) or it is accepted and the role
  // stays 'student' — never both ignored AND escalated.
  check('a student cannot set role=admin on their own profile',
    (escalate.status === 400 && escalate.data?.code === 'VALIDATION_ERROR') ||
    (escalate.status === 200 && escalate.data?.role === 'student'),
    JSON.stringify(escalate.data));

  const sStudents = await api('GET', '/api/users/students', { token: studentToken });
  check('student still refused on the admin-only listing -> 403 ADMIN_REQUIRED',
    sStudents.status === 403 && sStudents.data?.code === 'ADMIN_REQUIRED', JSON.stringify(sStudents.data));

  report();
}
