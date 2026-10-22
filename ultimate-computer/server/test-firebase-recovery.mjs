#!/usr/bin/env node
/**
 * Firestore channel self-healing tests (server/src/config/firebase.js).
 *
 * Regression suite for the long-uptime failure where the Admin SDK's gRPC
 * channel went permanently stale (`16 UNAUTHENTICATED` on every Firestore
 * call, /api/health still "ok", only a process restart used to fix it).
 *
 * What it proves:
 *   1. classification   only CHANNEL-shaped errors (UNAUTHENTICATED /
 *                       UNAVAILABLE / DEADLINE_EXCEEDED, or a hung probe) are
 *                       treated as recoverable — application-level outcomes
 *                       (PERMISSION_DENIED, NOT_FOUND, VALIDATION_ERROR) are not
 *   2. real rebuild     restartFirebase() tears the Admin app down and comes
 *                       back with a working Firestore client + health probe
 *   3. watchdog policy  the tick rebuilds on channel errors and timeouts,
 *                       leaves everything else alone, and never runs when
 *                       Firebase is not configured
 *
 * Needs server/firebase-service-account.json. Does NOT need the API server:
 * it only exercises the config module, never an HTTP route.
 *
 * Usage:  node test-firebase-recovery.mjs
 */

import { check, info, report } from './test-support.mjs';
import {
  isFirebaseConfigured,
  isRecoverableChannelError,
  restartFirebase,
  runFirestoreWatchdogTick,
  startFirestoreWatchdog,
  checkFirestoreHealth,
  getFirestore
} from './src/config/firebase.js';

/* ------------------------------------------------------- 1. classification */

console.log('=== 1. Channel-error classification ===');

const channelErr = (code, message) => Object.assign(new Error(message || ''), { code });

check('gRPC 16 UNAUTHENTICATED is recoverable', isRecoverableChannelError(channelErr(16)) === true);
check('gRPC 14 UNAVAILABLE is recoverable', isRecoverableChannelError(channelErr(14)) === true);
check('gRPC 4 DEADLINE_EXCEEDED is recoverable', isRecoverableChannelError(channelErr(4)) === true);
check(
  'string code "UNAUTHENTICATED" is recoverable',
  isRecoverableChannelError(channelErr('UNAUTHENTICATED')) === true
);
check(
  'message-only "16 UNAUTHENTICATED: ..." is recoverable',
  isRecoverableChannelError(new Error('16 UNAUTHENTICATED: Request had invalid authentication credentials.')) === true
);

check(
  'gRPC 7 PERMISSION_DENIED is NOT recoverable (real authz outcome)',
  isRecoverableChannelError(channelErr(7, 'PERMISSION_DENIED: Missing or insufficient permissions.')) === false
);
check(
  'Firestore NOT_FOUND is NOT recoverable',
  isRecoverableChannelError(channelErr(5, 'NOT_FOUND: No document to update')) === false
);
check(
  'VALIDATION_ERROR is NOT recoverable',
  isRecoverableChannelError(Object.assign(new Error('Course name is required.'), { code: 'VALIDATION_ERROR' })) === false
);
check('null/undefined is NOT recoverable', isRecoverableChannelError(null) === false);

/* --------------------------------------------------------- 2. real rebuild */

console.log('\n=== 2. Real channel rebuild ===');

check('Firebase is configured for this test run', isFirebaseConfigured() === true);

const before = getFirestore();
const beforeList = await before.collection('courses').limit(1).get();
info(`read ${beforeList.size} course doc(s) on the OLD channel`);

const rebuilt = await restartFirebase();
check('restartFirebase() reports a successful rebuild', rebuilt === true);

const after = getFirestore();
check('getFirestore() returns a FRESH client after the rebuild', after !== null && after !== before);

const health = await checkFirestoreHealth();
check('Firestore health probe answers ok after the rebuild', health.status === 'ok', `status=${health.status} ${health.error || ''}`);

const afterList = await after.collection('courses').limit(1).get();
check('a real Firestore read works on the NEW channel', afterList.size >= 0, `read ${afterList.size} doc(s)`);

const tooSoon = await restartFirebase();
check(
  'a second rebuild inside the cooldown is refused (no rebuild storm)',
  tooSoon === false
);

/* ------------------------------------------------------ 3. watchdog policy */

console.log('\n=== 3. Watchdog tick policy ===');

{
  let restarts = 0;
  const deadChannel = await runFirestoreWatchdogTick({
    isConfigured: () => true,
    probe: async () => ({
      status: 'unavailable',
      code: 'FIRESTORE_UNAVAILABLE',
      error: '16 UNAUTHENTICATED: Request had invalid authentication credentials.'
    }),
    restart: async () => { restarts += 1; return true; }
  });
  check('dead channel (16 UNAUTHENTICATED) triggers a rebuild', deadChannel === 'rebuilt' && restarts === 1, `outcome=${deadChannel}`);
}

{
  let restarts = 0;
  const outcome = await runFirestoreWatchdogTick({
    isConfigured: () => true,
    probe: async () => ({ status: 'unavailable', code: 'FIRESTORE_UNAVAILABLE', error: '7 PERMISSION_DENIED: Missing or insufficient permissions.' }),
    restart: async () => { restarts += 1; return true; }
  });
  check(
    'an application-level failure does NOT trigger a rebuild',
    outcome === 'skipped' && restarts === 0,
    `outcome=${outcome} restarts=${restarts}`
  );
}

{
  let restarts = 0;
  const outcome = await runFirestoreWatchdogTick({
    isConfigured: () => true,
    probe: async () => ({ status: 'unavailable', code: 'FIRESTORE_UNAVAILABLE', error: 'Firestore did not answer within 8000ms' }),
    restart: async () => { restarts += 1; return true; }
  });
  check('a hung probe (dead channel symptom) triggers a rebuild', outcome === 'rebuilt' && restarts === 1, `outcome=${outcome}`);
}

{
  let restarts = 0;
  const outcome = await runFirestoreWatchdogTick({
    isConfigured: () => true,
    probe: async () => ({ status: 'ok', code: null, latencyMs: 5 }),
    restart: async () => { restarts += 1; return true; }
  });
  check('a healthy probe never rebuilds', outcome === 'ok' && restarts === 0, `outcome=${outcome}`);
}

{
  let restarts = 0;
  const outcome = await runFirestoreWatchdogTick({
    isConfigured: () => false,
    probe: async () => { throw new Error('probe must not run when Firebase is not configured'); },
    restart: async () => { restarts += 1; return true; }
  });
  check('no probe and no rebuild when Firebase is not configured', outcome === 'skipped' && restarts === 0, `outcome=${outcome}`);
}

{
  let restarts = 0;
  const outcome = await runFirestoreWatchdogTick({
    isConfigured: () => true,
    probe: async () => { throw new Error('network reset'); },
    restart: async () => { restarts += 1; return true; }
  });
  check(
    'an unclassifiable probe crash is not rebuilt (left to the next pass)',
    outcome === 'skipped' && restarts === 0,
    `outcome=${outcome} restarts=${restarts}`
  );
}

{
  const timer = startFirestoreWatchdog(60_000);
  check('watchdog timer is armed and unref\'d (never holds a process open)', Boolean(timer) && timer.hasRef?.() === false);
  if (timer) clearInterval(timer);
}

/* ------------------------------------------------------------------ report */

// report() prints the summary and schedules the process exit itself.
console.log('');
report();
