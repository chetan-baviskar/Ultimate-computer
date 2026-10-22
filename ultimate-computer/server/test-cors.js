// CORS + login verification for whatever dev port the frontend happens to use.
const API = process.env.API_BASE || 'http://localhost:5001';
const PROXY = process.env.PROXY_BASE || 'http://localhost:5175';

let failures = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  -> ' + detail}`);
  if (!cond) failures++;
};

const req = async (base, path, { origin, body, method = 'GET' } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data, acao: res.headers.get('access-control-allow-origin') };
};

console.log('--- dev-origin ports (Vite bumps 5173 -> 5174 -> 5175 ...) ---');
for (const origin of ['http://localhost:5173', 'http://localhost:5175', 'http://127.0.0.1:5174']) {
  const r = await req(API, '/api/health', { origin });
  check(`Origin ${origin} allowed`, r.status === 200 && r.acao === origin, JSON.stringify(r));
}

console.log('\n--- foreign origins must stay blocked ---');
const evil = await req(API, '/api/health', { origin: 'https://evil.example.com' });
check('foreign origin blocked', evil.status === 403 && evil.data?.code === 'CORS_BLOCKED', JSON.stringify(evil));

console.log('\n--- auth through the CORS path (Firebase ID-token model) ---');
// A password pair must never produce a session; the important part here is
// that the request REACHES the API (CORS allowed the localhost origin) and is
// answered with an honest 401 instead of a 403 CORS block.
const probe = await req(API, '/api/auth/login', {
  method: 'POST',
  origin: 'http://localhost:5175',
  body: { email: 'probe@example.com', password: 'probe1234' }
});
check('password login from a localhost origin -> 401 NO_TOKEN (CORS passed, no fake session)',
  probe.status === 401 && probe.data?.code === 'NO_TOKEN', JSON.stringify(probe));

const forged = await (async () => {
  const res = await fetch(`${API}/api/auth/me`, {
    headers: { Origin: 'http://localhost:5175', Authorization: 'Bearer forged.token.value' }
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
})();
check('forged token from a localhost origin -> 401 INVALID_TOKEN',
  forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', JSON.stringify(forged));

console.log('\n--- end-to-end through the Vite proxy the browser is actually using ---');
let proxyUp = false;
try {
  const healthProbe = await fetch(`${PROXY}/api/health`);
  proxyUp = healthProbe.ok;
} catch {
  proxyUp = false;
}

if (!proxyUp) {
  console.log(`SKIP  no dev server answering on ${PROXY} — start one with "npm run dev"`);
} else {
  const proxiedCatalogue = await req(PROXY, '/api/courses');
  check(`public catalogue via ${PROXY} -> 200 with courses`,
    proxiedCatalogue.status === 200 && Array.isArray(proxiedCatalogue.data) &&
    proxiedCatalogue.data.length > 0,
    Array.isArray(proxiedCatalogue.data) ? `${proxiedCatalogue.data.length} course(s)` : JSON.stringify(proxiedCatalogue.data));

  const proxiedLogin = await req(PROXY, '/api/auth/login', {
    method: 'POST',
    body: { email: 'probe@example.com', password: 'probe1234' }
  });
  check(`password login via ${PROXY} -> 401 NO_TOKEN`,
    proxiedLogin.status === 401 && proxiedLogin.data?.code === 'NO_TOKEN', JSON.stringify(proxiedLogin));

  const proxiedHealth = await req(PROXY, '/api/health');
  check(`health via ${PROXY} -> ok`, proxiedHealth.status === 200 && proxiedHealth.data?.status === 'ok', JSON.stringify(proxiedHealth));
}

console.log(`\n${failures === 0 ? 'ALL CORS/LOGIN TESTS PASSED' : failures + ' TEST(S) FAILED'}`);
// Let sockets close gracefully: process.exit() mid-close triggers a libuv
// assertion on Windows ("UV_HANDLE_CLOSING") that corrupts the exit code.
process.exitCode = failures === 0 ? 0 : 1;
setTimeout(() => process.exit(failures === 0 ? 0 : 1), 250).unref();
