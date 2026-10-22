/**
 * Read-only credential diagnostic.
 * Prints NO key material — only structural facts and error codes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, '../server/firebase-service-account.json');

console.log('key file exists:', fs.existsSync(file), '->', file);
if (!fs.existsSync(file)) process.exit(0);

let sa;
try {
  sa = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.log('JSON parse FAILED:', e.message);
  process.exit(0);
}

console.log('type:', sa.type);
console.log('project_id:', sa.project_id);
console.log('private_key_id:', sa.private_key_id);
console.log('client_email:', sa.client_email);
console.log('client_id:', sa.client_id);
console.log('has token_uri:', Boolean(sa.token_uri), sa.token_uri);
console.log('auth_uri:', sa.auth_uri);
console.log('private_key length:', sa.private_key?.length);
console.log('private_key has literal backslash-n:', sa.private_key?.includes('\\n'));
console.log('private_key has real newlines:', /\n/.test(sa.private_key || ''));

try {
  const key = crypto.createPrivateKey(sa.private_key);
  console.log('private key PARSES OK; type:', key.asymmetricKeyType, 'bits:', key.asymmetricKeyDetails?.modulusLength);
  const pub = crypto.createPublicKey(key);
  const spki = pub.export({ type: 'spki', format: 'der' }).toString('base64url');
  console.log('public key fingerprint (sha256 of SPKI):', crypto.createHash('sha256').update(spki).digest('hex').slice(0, 32));
} catch (e) {
  console.log('private key PARSE FAILED:', e.message);
}

console.log('--- env ---');
for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_CONFIG', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE']) {
  console.log(k + '=', process.env[k] ?? '(unset)');
}
console.log('local clock:', new Date().toISOString());
