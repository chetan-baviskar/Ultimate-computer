/** Reproduces the exact Firestore failure outside the running server. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const here = path.dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(fs.readFileSync(path.resolve(here, '../server/firebase-service-account.json'), 'utf8'));

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore(app);
const auth = getAuth(app);

// 1) plain read
try {
  const t0 = Date.now();
  const snap = await db.doc('_healthcheck/ping').get();
  console.log('FIRESTORE READ OK  exists=' + snap.exists + ' in ' + (Date.now() - t0) + 'ms');
} catch (e) {
  console.log('FIRESTORE READ FAILED:', e.code, '|', String(e.message).slice(0, 240));
}

// 2) listing users (the query login/admin flows use)
try {
  const snap = await db.collection('users').limit(3).get();
  console.log('FIRESTORE QUERY OK  docs=' + snap.size);
} catch (e) {
  console.log('FIRESTORE QUERY FAILED:', e.code, '|', String(e.message).slice(0, 240));
}

// 3) a second Admin SDK surface (Firebase Auth API) to see if ALL Google APIs
//    reject these credentials or only Firestore.
try {
  const user = await auth.getUserByEmail(sa.client_email).catch(() => null);
  console.log('AUTH API reachable, lookup result:', user ? 'user found' : 'no firebase user for admin sdk email (expected)');
} catch (e) {
  console.log('AUTH API FAILED:', e.code, '|', String(e.message).slice(0, 240));
}
process.exit(0);
