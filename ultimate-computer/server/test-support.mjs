/**
 * Shared helpers for the phase integration tests (courses / enquiries /
 * applications).
 *
 * Every test built on this harness talks to the REAL Express API over HTTP
 * and verifies results independently in Firebase Authentication and Cloud
 * Firestore with the Admin SDK — nothing is mocked.
 *
 * Usage from a test file:
 *   import { api, check, info, report, adminResources, ensureAdminAccount,
 *            signInWeb, newId } from './test-support.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp as initWebApp, getApps as getWebApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

import { firebaseConfig } from '../src/config/firebaseConfig.js';
import { initializeApp as initAdminApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Base URL of the API under test. */
export const API = process.env.API_URL || 'http://127.0.0.1:5001';

/* ------------------------------------------------------------------ report */

let failures = 0;

/** Records a single assertion. */
export const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

export const info = (line) => console.log(`      ${line}`);

/**
 * Prints the summary and exits. `process.exit()` inside a pending socket
 * close triggers a libuv assertion on Windows, so the exit is deferred to the
 * next tick (same pattern as test-degraded.js).
 */
export const report = () => {
  const failed = failures;
  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 50).unref();
};

/* -------------------------------------------------------------------- http */

/** fetch + JSON helper returning {status, data}. */
export const api = async (method, pathname, { body, token } = {}) => {
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

/* ---------------------------------------------------------------- accounts */

/** Independent Admin SDK handle — verifies what really landed server-side. */
export const adminResources = () => {
  const keyPath = path.resolve(__dirname, 'firebase-service-account.json');
  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const app = getApps().length
    ? getApps()[0]
    : initAdminApp({ credential: cert(sa), projectId: sa.project_id });
  return {
    adminAuth: getAdminAuth(app),
    db: getFirestore(app),
    projectId: sa.project_id
  };
};

/** Single Firebase Web SDK instance (same config the browser uses). */
let webAuth = null;
const getWebAuth = () => {
  if (!webAuth) {
    const app = getWebApps().length ? null : initWebApp(firebaseConfig);
    webAuth = getAuth(app || getWebApps()[0]);
  }
  return webAuth;
};

/**
 * Signs an account in with the Firebase Web SDK and returns its ID token —
 * the exact token a browser would send.
 */
export const signInWeb = async (email, password) => {
  const auth = getWebAuth();
  await signOut(auth).catch(() => {});
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
};

/** Unique suffix so every run creates fresh, isolated records. */
export const newId = (label = 'x') =>
  `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;

/**
 * Guarantees an administrator test account exists and returns its credentials.
 *
 * Creates the Firebase Authentication user and the users/{uid} profile with
 * role 'admin' directly with the Admin SDK (server-side provisioning — the
 * public API can never mint admin accounts). Safe to call repeatedly: an
 * existing account is reused and its stored profile is only ever written by
 * this harness for the account it just created.
 *
 * @returns {Promise<{email: string, password: string, uid: string}>}
 */
export const ensureAdminAccount = async (email, password) => {
  const { adminAuth, db } = adminResources();

  let uid;
  try {
    const existing = await adminAuth.getUserByEmail(email);
    uid = existing.uid;
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
    const created = await adminAuth.createUser({ email, password, displayName: 'Test Administrator' });
    uid = created.uid;
  }

  const profileRef = db.collection('users').doc(uid);
  const snap = await profileRef.get();
  if (!snap.exists) {
    await profileRef.set({
      uid,
      email: email.toLowerCase(),
      fullName: 'Test Administrator',
      mobile: '',
      course: '',
      role: 'admin',
      status: 'active',
      authProvider: 'password',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } else if (snap.data()?.role !== 'admin') {
    await profileRef.update({ role: 'admin', updatedAt: new Date() });
  }

  return { email, password, uid };
};

/**
 * Ensures a plain student test account exists (profile role 'student') and
 * returns its credentials — used to prove admin-only routes refuse students.
 */
export const ensureStudentAccount = async (email, password) => {
  const { adminAuth, db } = adminResources();

  let uid;
  try {
    const existing = await adminAuth.getUserByEmail(email);
    uid = existing.uid;
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
    const created = await adminAuth.createUser({ email, password, displayName: 'Test Student' });
    uid = created.uid;
  }

  const profileRef = db.collection('users').doc(uid);
  const snap = await profileRef.get();
  if (!snap.exists) {
    await profileRef.set({
      uid,
      email: email.toLowerCase(),
      fullName: 'Test Student',
      mobile: '',
      course: '',
      role: 'student',
      status: 'active',
      authProvider: 'password',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  return { email, password, uid };
};

/** Waits for the API to answer (used when the test starts the server). */
export const waitForApi = async (timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};
