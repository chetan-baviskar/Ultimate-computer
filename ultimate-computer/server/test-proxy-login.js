// Simulates exactly what the browser does: requests through the Vite dev proxy.
//
// The browser never learns the API's address — it calls /api/* on its own
// origin and Vite forwards those to http://localhost:5001. This test proves
// that path carries the Firebase ID token and the API's real auth/role codes.
//
// Needs a running dev server (`npm run dev`); skips honestly when the origin
// does not answer.
import {
  api,
  check,
  info,
  report,
  ensureStudentAccount,
  signInWeb,
  API
} from './test-support.mjs';

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

const proxyCall = async (method, path, { body, token } = {}) => {
  const res = await fetch(`${ORIGIN}${path}`, {
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
    /* html error page from the proxy */
  }
  return { status: res.status, data };
};

console.log(`Requests go to ${ORIGIN}/api/* (Vite proxy -> ${API})\n`);

let originUp = false;
try {
  const probe = await fetch(`${ORIGIN}/api/health`);
  originUp = probe.ok;
} catch {
  originUp = false;
}

if (!originUp) {
  console.log(`SKIP  no dev server answering on ${ORIGIN} — start one with "npm run dev"`);
  report();
} else {
  const health = await proxyCall('GET', '/api/health');
  check('proxied health check -> 200 ok',
    health.status === 200 && health.data?.status === 'ok', JSON.stringify(health.data));
  info(`dataLayer=${health.data?.dataLayer}`);

  const courses = await proxyCall('GET', '/api/courses');
  check('proxied public catalogue -> 200 with courses',
    courses.status === 200 && Array.isArray(courses.data) && courses.data.length > 0,
    Array.isArray(courses.data) ? `${courses.data.length} course(s)` : JSON.stringify(courses.data));

  const noToken = await proxyCall('POST', '/api/auth/login', { body: { email: 'a@b.com', password: 'x' } });
  check('password login via proxy -> 401 NO_TOKEN (never a session)',
    noToken.status === 401 && noToken.data?.code === 'NO_TOKEN', JSON.stringify(noToken.data));

  const forged = await proxyCall('GET', '/api/auth/me', { token: 'forged.token.value' });
  check('forged token via proxy -> 401 INVALID_TOKEN',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', JSON.stringify(forged.data));

  const stamp = Date.now();
  const STUDENT = { email: `student.proxy.${stamp}@example.com`, password: `Student#Proxy${stamp}` };
  await ensureStudentAccount(STUDENT.email, STUDENT.password);
  const token = await signInWeb(STUDENT.email, STUDENT.password);

  const me = await proxyCall('GET', '/api/auth/me', { token });
  check('real Firebase ID token via proxy -> 200 + own profile',
    me.status === 200 && me.data?.email === STUDENT.email, JSON.stringify(me.data));

  const students = await proxyCall('GET', '/api/users/students', { token });
  check('STUDENT on the admin-only listing via proxy -> 403 ADMIN_REQUIRED',
    students.status === 403 && students.data?.code === 'ADMIN_REQUIRED', JSON.stringify(students.data));

  report();
}
