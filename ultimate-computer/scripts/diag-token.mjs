/** Attempts to mint a Google OAuth access token with the local service-account key.
 *  Prints only status / error codes — never credentials. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../server/firebase-service-account.json');
const sa = JSON.parse(fs.readFileSync(file, 'utf8'));

const scope = 'https://www.googleapis.com/auth/datastore';
const assertion = (() => {
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: sa.client_email, scope, aud: sa.token_uri, iat: now, exp: now + 3600 };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  return `${unsigned}.${sig}`;
})();

try {
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const text = await res.text();
  console.log('token endpoint HTTP', res.status);
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (json?.access_token) {
    console.log('ACCESS TOKEN OK — length', json.access_token.length, 'expires_in', json.expires_in);
    console.log('token_type', json.token_type, 'scope present:', Boolean(json.scope));
  } else {
    console.log('error body:', JSON.stringify(json || text.slice(0, 400)));
  }
} catch (e) {
  console.log('request failed:', e.message);
}
