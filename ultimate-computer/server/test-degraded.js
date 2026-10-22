// Data-layer honesty check.
//
// The website modules migrated to Cloud Firestore (courses, applications,
// enquiries, student profiles) must answer with REAL data, while the routes
// that are still un-migrated (admin user provisioning, admin password resets)
// must keep answering the explicit 503 DATA_LAYER_UNAVAILABLE — never a fake
// success. /api/health must always stay 200.
const BASE = process.env.TEST_BASE || 'http://localhost:5001';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. Health always answers and reports the live Firestore data layer.
const healthRes = await fetch(`${BASE}/api/health`);
const health = await healthRes.json();
check('GET /api/health → 200 ok + data layer', healthRes.status === 200 && health.status === 'ok' && health.dataLayer,
  `dataLayer=${health.dataLayer}`);

// 2. Public course catalogue comes from Cloud Firestore (not a 503).
const coursesRes = await fetch(`${BASE}/api/courses`);
const courses = await coursesRes.json();
check('GET /api/courses serves the catalogue → 200',
  coursesRes.status === 200 && Array.isArray(courses) && courses.length > 0,
  Array.isArray(courses) ? `${courses.length} course(s)` : JSON.stringify(courses));

// 3. Protected routes refuse an anonymous caller instead of inventing data.
const meRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'a@b.com', password: 'x' })
});
const meBody = await meRes.json();
check('POST /api/auth/login without a token → 401 (never a fake session)',
  meRes.status === 401 && meBody.code === 'NO_TOKEN', `status=${meRes.status} code=${meBody.code}`);

// 4. Still-un-migrated admin routes stay an explicit, honest 503.
const provisionRes = await fetch(`${BASE}/api/users`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'a@b.com' })
});
const provisionBody = await provisionRes.json();
check('POST /api/users (not migrated yet) → 503 DATA_LAYER_UNAVAILABLE',
  provisionRes.status === 503 && provisionBody.code === 'DATA_LAYER_UNAVAILABLE',
  `status=${provisionRes.status}`);

// Let sockets close gracefully: process.exit() mid-close triggers a libuv
// assertion on Windows ("UV_HANDLE_CLOSING") that corrupts the exit code.
const allOk = failures === 0;
console.log(allOk ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
setTimeout(() => process.exit(allOk ? 0 : 1), 250).unref();
