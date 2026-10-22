#!/usr/bin/env node
/**
 * Secure, SERVER-SIDE provisioning of an administrator account.
 *
 * This is the ONLY supported way to create an administrator. It is a local
 * Node script, not an HTTP endpoint:
 *   - it runs only on the machine that holds `server/firebase-service-account.json`
 *     (the Firebase Admin SDK credential), so it is unreachable from a browser;
 *   - no public registration route, request body, query string or frontend
 *     field can ever produce role 'admin' — `POST /api/auth/register` hard-codes
 *     role 'student' server-side and `PATCH /api/users/:uid` only edits
 *     fullName/mobile.
 *
 * Credentials come from `server/.env` (see .env.example):
 *   ADMIN_EMAIL     administrator address (first entry of a comma-separated list)
 *   ADMIN_PASSWORD  INITIAL password for the account. It is read from the file,
 *                   never hard-coded in this source, never printed, never
 *                   logged and never sent to the frontend — it only ever
 *                   travels to the Firebase Admin SDK.
 *
 * What it does (idempotent, never destructive):
 *   1. Ensures the address has a Firebase Authentication user; the initial
 *      password is taken from server/.env (ADMIN_PASSWORD).
 *   2. Ensures the Firestore profile `users/{uid}` exists with role 'admin'
 *      (the record the API reads on every protected request).
 *   3. Sets the Firebase custom claim `{ admin: true, role: 'admin' }` inside
 *      the user's ID tokens (only the Admin SDK can set claims; clients cannot
 *      forge them).
 *
 * What it NEVER does:
 *   - never prints or stores a password anywhere but Firebase Authentication,
 *   - never deletes any user or document,
 *   - never changes an existing account's password unless you pass the
 *     explicit `--set-password` flag,
 *   - never overwrites an existing profile's other fields,
 *   - never escalates an existing profile to admin unless you pass the
 *     explicit `--grant-admin` flag.
 *
 * Usage (from server/):
 *   npm run provision:admin                                   address + password from server/.env
 *   npm run provision:admin -- --check                        read-only verification
 *   npm run provision:admin -- --set-password                 rotate ADMIN_PASSWORD into Firebase Auth
 *   node scripts/provision-admin.mjs --email you@example.com  provision a different address (password still from server/.env)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import {
  isFirebaseConfigured,
  getFirebaseAuth,
  getFirestore,
  getFirebaseStatus,
  FIREBASE_PROJECT_ID
} from '../src/config/firebase.js';

/* ----------------------------------------------------------- server/.env */

// Loaded from this file's own directory (server/.env), never from wherever
// the shell happens to be. `quiet` keeps dotenv's banner out of the output.
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

/** First address of the comma-separated ADMIN_EMAIL list in server/.env. */
const envAdminEmail = String(process.env.ADMIN_EMAIL || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)[0] || '';

/** Initial password from server/.env — never logged, never echoed. */
const envAdminPassword = String(process.env.ADMIN_PASSWORD || '');

/* ------------------------------------------------------------------ args */

const parseArgs = (argv) => {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args.flags.add(key);
    }
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));

const fail = (message, code = 1) => {
  console.error(`\nERROR  ${message}`);
  process.exit(code);
};

if (args.flags.has('help')) {
  console.log(`
Secure administrator provisioning (server-side only, no HTTP endpoint)

  npm run provision:admin                provision using ADMIN_EMAIL / ADMIN_PASSWORD from server/.env
  npm run provision:admin -- --check     read-only: report auth user, profile and custom claim
  npm run provision:admin -- --set-password            align the Firebase password with server/.env
  npm run provision:admin -- --grant-admin             promote an EXISTING profile to role=admin
  node scripts/provision-admin.mjs --email you@example.com   provision another address
                                         (password still comes from server/.env)
`);
  process.exit(0);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const email = String(args.email || envAdminEmail).trim().toLowerCase();
if (!email || !EMAIL_PATTERN.test(email)) {
  fail(
    'No administrator address. Set ADMIN_EMAIL in server/.env (or pass --email you@example.com). Nothing was changed.'
  );
}

const isCheckOnly = args.flags.has('check');
const wantsSetPassword = args.flags.has('set-password');
const wantsGrantAdmin = args.flags.has('grant-admin');

// Resolution order: server/.env (the documented initial password) first,
// then an explicit override. The VALUE is only ever passed to Firebase.
const suppliedPassword = envAdminPassword || String(args.password || process.env.UC_ADMIN_PASSWORD || '').trim();
const passwordSource = envAdminPassword ? 'server/.env (ADMIN_PASSWORD)'
  : (args.password || process.env.UC_ADMIN_PASSWORD) ? 'the value supplied to this command'
    : '';
const explicitFlagPassword = Boolean(args.password || process.env.UC_ADMIN_PASSWORD);

if (!isCheckOnly && !suppliedPassword) {
  fail(
    'ADMIN_PASSWORD is not set in server/.env — refusing to invent a credential. Nothing was changed.'
  );
}
if (!isCheckOnly && suppliedPassword.length < 8) {
  fail('The initial password is shorter than 8 characters — nothing was changed.');
}

const displayName = String(args.name || args['full-name'] || 'Ultimate Computer Administrator').trim();

/* ------------------------------------------------------------- firebase */

if (!isFirebaseConfigured()) {
  fail(
    `Firebase Admin SDK is not configured (${getFirebaseStatus().code}). ` +
      'server/firebase-service-account.json must exist and belong to ' +
      `${FIREBASE_PROJECT_ID}. Nothing was changed.`
  );
}

const auth = getFirebaseAuth();
const db = getFirestore();

/* --------------------------------------------------------------- helpers */

const describeProfile = (profile) =>
  profile
    ? `role=${profile.role} status=${profile.status || 'active'} fullName=${profile.fullName || '-'}`
    : 'profile missing';

/** Claims the API understands: `admin === true` and/or `role === 'admin'`. */
const ADMIN_CLAIMS = { admin: true, role: 'admin' };
const hasAdminClaim = (claims = {}) => claims.admin === true || claims.role === 'admin';

/* ------------------------------------------------------------------ run */

const run = async () => {
  console.log(`Provisioning administrator  email=${email}  project=${FIREBASE_PROJECT_ID}`);
  console.log(`  mode         : ${isCheckOnly ? 'check only (nothing will be written)' : 'provision (idempotent, non-destructive)'}`);

  // 1. Firebase Authentication user -------------------------------------------------
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`  auth account : exists (uid=${user.uid}, disabled=${user.disabled})`);
    if (user.disabled && !isCheckOnly) {
      fail('The account exists but is DISABLED in Firebase Authentication. Re-enable it in the Firebase Console first. Nothing was changed.');
    }
    if (isCheckOnly) {
      console.log(`  custom claim : admin=${hasAdminClaim(user.customClaims || {})}`);
    }
    if (explicitFlagPassword && !wantsSetPassword) {
      fail(
        'This account already exists, so its password was NOT touched. ' +
          'To rotate it deliberately, re-run with --set-password.',
        2
      );
    }
    if (wantsSetPassword) {
      await auth.updateUser(user.uid, { password: suppliedPassword });
      console.log(`  password     : updated from ${passwordSource} (explicit --set-password)`);
    } else {
      console.log('  password     : left unchanged (server/.env value applies to newly created accounts only)');
    }
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') {
      fail(`Firebase Authentication lookup failed: ${err?.code || err?.message}. Nothing was changed.`);
    }

    if (isCheckOnly) {
      console.log('  auth account : NOT FOUND (no Firebase sign-in user for this address)');
    } else {
      // Creating a NEW account only — an existing account can never land here.
      const created = await auth.createUser({
        email,
        displayName,
        password: suppliedPassword,
        emailVerified: false,
        disabled: false
      });
      user = created;
      console.log(`  auth account : CREATED (uid=${user.uid})`);
      // The value itself is deliberately NOT printed: it lives in server/.env.
      console.log(`  password     : initial password taken from ${passwordSource}`);
    }
  }

  // 2. Firestore profile (the role record the API trusts) ----------------------------
  if (isCheckOnly) {
    if (!user) {
      console.log('\nCheck only — the administrator does not exist yet. Run without --check to provision.');
      return;
    }
    const snap = await db.collection('users').doc(user.uid).get();
    console.log(
      `  profile      : ${snap.exists ? describeProfile(snap.data()) : 'profile missing at users/' + user.uid}`
    );
    const ok = hasAdminClaim(user.customClaims || {}) && snap.exists && snap.data()?.role === 'admin';
    console.log(`\nCheck ${ok ? 'PASSED' : 'FAILED'} — nothing was changed.`);
    if (!ok) process.exitCode = 1;
    return;
  }

  const profileRef = db.collection('users').doc(user.uid);
  const profileSnap = await profileRef.get();

  if (!profileSnap.exists) {
    const now = new Date();
    await profileRef.set({
      uid: user.uid,
      email,
      fullName: displayName,
      mobile: '',
      course: '',
      role: 'admin',
      status: 'active',
      authProvider: 'password',
      provisionedBy: 'scripts/provision-admin.mjs',
      createdAt: now,
      updatedAt: now
    });
    console.log('  profile      : CREATED at users/' + user.uid + ' with role=admin');
  } else {
    const profile = profileSnap.data() || {};
    if (profile.role === 'admin') {
      console.log('  profile      : already role=admin (left untouched)');
    } else if (wantsGrantAdmin) {
      // Only the role field changes — every other stored field is preserved.
      await profileRef.update({ role: 'admin', updatedAt: new Date() });
      console.log(`  profile      : role ${profile.role || '(none)'} -> admin (explicit --grant-admin)`);
    } else {
      fail(
        `A profile already exists for this address with role="${profile.role}". ` +
          'To promote it deliberately, re-run with --grant-admin. Nothing was changed.',
        2
      );
    }
  }

  // 3. Custom claim (cryptographically bound into every ID token) --------------------
  await auth.setCustomUserClaims(user.uid, ADMIN_CLAIMS);
  // Read the claims back — never report a success we did not verify.
  const readBack = (await auth.getUser(user.uid)).customClaims || {};
  if (!hasAdminClaim(readBack)) fail('The custom claim could not be verified after it was written.');
  console.log('  custom claim : admin=true (role=admin) verified — effective on the next sign-in/token refresh');

  console.log('\nDONE  Administrator ready. They can now sign in on the Admin Portal.');
  console.log('      Sign out/in (or wait for the token refresh) if an older session is still open.');
};

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    // Never echo an error object that could carry the credential.
    console.error(`\nERROR  ${err?.code ? `${err.code}: ` : ''}${err?.message || err}`);
    process.exit(1);
  });
