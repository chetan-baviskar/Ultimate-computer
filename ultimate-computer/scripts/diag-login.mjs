/** Diagnostic probe: hits the REAL API (via the Vite proxy) and prints status + JSON. */
const BASE = process.env.PROBE_BASE || 'http://localhost:5173';

async function probe(label, path, opts = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    let body = null;
    try { body = await res.json(); } catch { body = '<non-json>'; }
    console.log(`\n[${label}] ${opts.method || 'GET'} ${path} -> HTTP ${res.status}`);
    console.log(JSON.stringify(body, null, 2));
    return { status: res.status, body };
  } catch (err) {
    console.log(`\n[${label}] ${path} -> NETWORK ERROR: ${err.message}`);
    return { status: 0, body: null };
  }
}

await probe('health', '/api/health');
await probe('firestore', '/api/health/firestore');
await probe('login-no-token', '/api/auth/login', { method: 'POST', body: '{}' });
await probe('courses', '/api/courses');
