/**
 * Firebase Admin SDK bootstrap.
 *
 * Responsibilities:
 *  - Initialize the Admin SDK exactly ONCE per process (guarded by
 *    `getApps().length`, so a hot-reloader or a second import cannot create a
 *    second app instance).
 *  - Connect to the Firebase project `ultimate-computer-e2a91` and expose the
 *    Cloud Firestore client.
 *  - Fail SOFT: if the service-account file is missing or malformed the server
 *    still boots, and callers (health endpoints) report an explicit status
 *    instead of crashing or silently pretending to be connected.
 *
 * Security rules for this file:
 *  - NEVER log the private key, client secret or the full service-account JSON.
 *  - Every error string that can reach a response or a log line goes through
 *    `toSafeMessage()` first, which strips PEM blocks and truncates the text.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps, getApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore as getFirestoreClient } from 'firebase-admin/firestore';
import { getAuth as getAuthClient } from 'firebase-admin/auth';

/** The Firebase project this backend is wired to. */
export const FIREBASE_PROJECT_ID = 'ultimate-computer-e2a91';

/**
 * Location of the service-account key file. The path is resolved relative to
 * `server/` (two levels up from `server/src/config/`), NOT relative to the
 * process working directory, so `npm run dev` and `npm start` behave the same.
 */
const SERVICE_ACCOUNT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../firebase-service-account.json'
);

/**
 * How long a health-check probe may take before it is reported as a failure.
 * Read lazily (not at module load) so values from server/.env are picked up
 * even though ES module imports run before `dotenv.config()`.
 */
const healthCheckTimeoutMs = () => Number(process.env.FIRESTORE_HEALTH_TIMEOUT_MS) || 8000;

/** Fields a Firebase service-account key file must contain to be usable. */
const REQUIRED_FIELDS = [
  'type',
  'project_id',
  'private_key_id',
  'private_key',
  'client_email',
  'client_id',
  'client_x509_cert_url',
  'token_uri'
];

/**
 * Removes anything credential-shaped from a message before it can be logged or
 * returned, then truncates it. Defensive: even if a library error message ever
 * embeds key material, it cannot leave the process.
 */
const toSafeMessage = (err) => {
  const raw = typeof err === 'string' ? err : (err?.message || 'Unknown error');
  return raw
    .replace(/-----BEGIN[\s\S]*?-----END[\s\S]*?-----/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
};

/**
 * Initialization state.
 *  - `status`: 'ok' | 'not-configured'
 *  - `code`:   machine-readable reason when not configured (never any secret)
 */
let firebaseState = { status: 'not-configured', code: 'NOT_INITIALIZED', db: null, auth: null };

const initFirebase = () => {
  // Guard 1: never initialize twice in one process.
  if (getApps().length > 0) {
    const app = getApp();
    firebaseState = { status: 'ok', code: null, db: getFirestoreClient(app), auth: getAuthClient(app) };
    return firebaseState;
  }

  // Guard 2: the key file must exist.
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.warn(`[Firebase] Service-account file not found at server/${path.basename(SERVICE_ACCOUNT_PATH)} — Firestore stays disabled.`);
    firebaseState = { status: 'not-configured', code: 'SERVICE_ACCOUNT_MISSING', db: null };
    return firebaseState;
  }

  // Guard 3: it must parse and contain every required field.
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  } catch {
    console.warn('[Firebase] Service-account file is not valid JSON — Firestore stays disabled.');
    firebaseState = { status: 'not-configured', code: 'SERVICE_ACCOUNT_INVALID_JSON', db: null };
    return firebaseState;
  }

  const missing = REQUIRED_FIELDS.filter((field) => !serviceAccount[field]);
  if (missing.length > 0) {
    console.warn(`[Firebase] Service-account file is missing required fields (${missing.join(', ')}) — Firestore stays disabled.`);
    firebaseState = { status: 'not-configured', code: 'SERVICE_ACCOUNT_INCOMPLETE', db: null };
    return firebaseState;
  }

  // Guard 4: the key must belong to the project this backend is committed to.
  if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) {
    console.warn(`[Firebase] Service-account key belongs to project "${serviceAccount.project_id}", expected "${FIREBASE_PROJECT_ID}" — Firestore stays disabled.`);
    firebaseState = { status: 'not-configured', code: 'PROJECT_ID_MISMATCH', db: null };
    return firebaseState;
  }

  // Guard 5: single initialization for the whole process lifetime.
  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: FIREBASE_PROJECT_ID
  });

  firebaseState = { status: 'ok', code: null, db: getFirestoreClient(app), auth: getAuthClient(app) };
  // Clean, canonical startup lines (no secrets, no credential details).
  console.log('[Firebase] Firestore connected.');
  console.log(`[Firebase] Project: ${FIREBASE_PROJECT_ID}`);
  console.log('[Firebase] Database: (default)');
  return firebaseState;
};

initFirebase();

/** True when the Admin SDK booted and a Firestore client is available. */
export const isFirebaseConfigured = () => firebaseState.status === 'ok';

/** Firestore client instance, or null when Firebase is not configured. */
export const getFirestore = () => firebaseState.db;

/**
 * Firebase Auth (Admin SDK) instance used to VERIFY Firebase ID tokens.
 * Returns null when the Admin SDK is not configured — callers must answer an
 * explicit 503 instead of accepting an unverified request.
 */
export const getFirebaseAuth = () => firebaseState.auth || null;

/** Machine-readable configuration status — safe to expose, never a secret. */
export const getFirebaseStatus = () => ({
  status: firebaseState.status,
  code: firebaseState.code,
  projectId: FIREBASE_PROJECT_ID
});

/** Rejects after `ms` so a hung gRPC call cannot pin a health request open. */
const withTimeout = (promise, ms, message) => {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
      timer.unref?.();
    })
  ]);
};

/**
 * Read-only Firestore probe.
 *
 * Performs a single document GET on a marker path that this server never
 * writes to. It returns only a boolean `exists` flag — no document data ever
 * leaves this function — so the endpoint can be exposed publicly without
 * leaking user records and without mutating the database.
 *
 * @returns {Promise<{status: 'ok'|'unavailable'|'not-configured', code: string|null, latencyMs: number|null, error?: string}>}
 */
export const checkFirestoreHealth = async () => {
  if (!firebaseState.db) {
    return { status: 'not-configured', code: firebaseState.code || 'NOT_INITIALIZED', latencyMs: null };
  }

  const startedAt = Date.now();
  const timeoutMs = healthCheckTimeoutMs();
  try {
    const snapshot = await withTimeout(
      firebaseState.db.doc('_healthcheck/ping').get(),
      timeoutMs,
      `Firestore did not answer within ${timeoutMs}ms`
    );
    return {
      status: 'ok',
      code: null,
      latencyMs: Date.now() - startedAt,
      // Reported for transparency only; the marker doc normally does not exist.
      markerExists: Boolean(snapshot.exists)
    };
  } catch (err) {
    return {
      status: 'unavailable',
      code: 'FIRESTORE_UNAVAILABLE',
      latencyMs: Date.now() - startedAt,
      error: toSafeMessage(err)
    };
  }
};

/* ------------------------------------------- self-healing gRPC channel */

/**
 * WHY THIS EXISTS
 *
 * On some Windows machines the Admin SDK's credential channel goes permanently
 * stale after a while: every Firestore call starts answering
 * `16 UNAUTHENTICATED: Request had invalid authentication credentials...`
 * (the OAuth access token behind the service-account credential stops being
 * refreshed/re-accepted) and the client NEVER recovers on its own — the same
 * process serves 503s forever while `/api/health` still claims "ok". Only a
 * process restart fixes it, because restart re-creates the app and its channel.
 *
 * So this module now does exactly what a restart does, automatically:
 *  1. a watchdog probes Firestore with the same read-only health probe;
 *  2. when the probe fails with a CHANNEL-level error, it tears the Admin app
 *     down (`deleteApp`) and re-initializes it (`initFirebase`), which forces a
 *     fresh credential + gRPC channel;
 *  3. the probe runs again and logs the outcome.
 *
 * Only channel-level error codes trigger a rebuild. Application-level
 * outcomes (PERMISSION_DENIED for a real authorization failure, NOT_FOUND,
 * VALIDATION_ERROR, ...) must NEVER trigger it — rebuilding the channel would
 * not change them and would only add latency.
 *
 * Every service already resolves the client through `getFirestore()` per
 * operation, so after a rebuild the very next request uses the new channel.
 * Requests that were in flight when the channel died still fail honestly with
 * 503 DATA_LAYER_UNAVAILABLE (never a fake success) — the rebuild simply makes
 * that window last minutes instead of forever.
 */

/** gRPC status codes / names that indicate a broken transport, not app logic. */
const CHANNEL_ERROR_CODES = new Set([
  4, 'deadline-exceeded',
  14, 'unavailable',
  16, 'unauthenticated'
]);

/** Message shapes gRPC uses when the numeric code is not attached. */
const CHANNEL_ERROR_MESSAGE = /^\s*(\d+\s+)?(UNAUTHENTICATED|UNAVAILABLE|DEADLINE_EXCEEDED)\b/;

/**
 * True when an error means "the transport/credential channel is broken" and a
 * channel rebuild can fix it. False for application-level outcomes, which must
 * surface to the caller untouched.
 */
export const isRecoverableChannelError = (err) => {
  if (!err) return false;
  const code = typeof err.code === 'string' ? err.code.trim().toLowerCase().replace(/_/g, '-') : err.code;
  if (CHANNEL_ERROR_CODES.has(code)) return true;
  return CHANNEL_ERROR_MESSAGE.test(String(err.message || ''));
};

/** Never rebuild more often than this, even if probes keep failing. */
const MIN_RESTART_INTERVAL_MS = Number(process.env.FIRESTORE_RESTART_MIN_INTERVAL_MS) || 30_000;

let restartInFlight = null;
let lastRestartAt = 0;

/**
 * Tears the current Admin app down and initializes a fresh one, returning
 * `true` when the new instance passes a Firestore probe.
 *
 * Concurrent callers share one rebuild (the promise is de-duplicated), and the
 * cooldown prevents a hard-broken credential from causing a rebuild storm.
 */
export const restartFirebase = async () => {
  if (restartInFlight) return restartInFlight;

  const sinceLast = Date.now() - lastRestartAt;
  if (lastRestartAt && sinceLast < MIN_RESTART_INTERVAL_MS) {
    console.warn(`[Firebase] Channel rebuild skipped — last attempt was ${Math.round(sinceLast / 1000)}s ago.`);
    return false;
  }

  restartInFlight = (async () => {
    lastRestartAt = Date.now();

    // deleteApp() closes the stale channel; initFirebase() then creates a new
    // credential + Firestore client exactly like a process restart would.
    if (getApps().length > 0) {
      try {
        await deleteApp(getApp());
      } catch (err) {
        console.warn(`[Firebase] deleteApp() during rebuild: ${toSafeMessage(err)}`);
      }
    }
    firebaseState = { status: 'not-configured', code: 'RESTARTING', db: null, auth: null };

    const next = initFirebase();
    if (next.status !== 'ok') return false;

    const probe = await checkFirestoreHealth();
    if (probe.status === 'ok') {
      console.log(`[Firebase] Admin SDK channel rebuilt — Firestore reachable again (${probe.latencyMs}ms).`);
      return true;
    }
    console.error(`[Firebase] Channel rebuild did not restore Firestore: ${probe.error || probe.code}`);
    return false;
  })().finally(() => {
    restartInFlight = null;
  });

  return restartInFlight;
};

/**
 * Runs `fn`; when it fails with a CHANNEL-level error, rebuilds the Admin
 * channel immediately and runs `fn` ONE more time.
 *
 * WHY: the watchdog only notices a dead channel on its next tick, but the user
 * is looking at a login form RIGHT NOW. Doing the rebuild inside the failing
 * request means the FIRST submit already succeeds instead of showing an honest
 * 503 ("Login is temporarily unavailable") for the next minute or five.
 *
 * `fn` must resolve the Firestore/Auth client itself — through `getFirestore()`
 * / `getFirebaseAuth()` — on every call, so the retry picks up the rebuilt
 * channel. Application-level errors (PERMISSION_DENIED, NOT_FOUND,
 * VALIDATION_ERROR, a missing profile, ...) are re-thrown untouched: retrying
 * them would be pointless and would blur a real error into a second attempt.
 *
 * The retry runs even when `restartFirebase()` refuses because of the cooldown
 * — another caller may have rebuilt the channel in the meantime, and if nothing
 * changed the original error simply propagates again (honest 503, no fake ok).
 */
export const runWithFreshChannel = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    if (!isRecoverableChannelError(err)) throw err;
    console.warn(`[Firebase] ${toSafeMessage(err)} — rebuilding the Admin SDK channel and retrying once.`);
    await restartFirebase();
    return fn();
  }
};

/**
 * One watchdog pass: probe Firestore, rebuild the channel when — and only
 * when — the probe fails with a channel-level error.
 *
 * Dependencies are injectable so the logic is testable without provably
 * breaking a real connection.
 *
 * @returns {Promise<'ok'|'skipped'|'rebuilt'|'failed'|'rebuild-failed'>}
 */
export const runFirestoreWatchdogTick = async ({
  probe = checkFirestoreHealth,
  restart = restartFirebase,
  isConfigured = isFirebaseConfigured
} = {}) => {
  if (!isConfigured()) return 'skipped';

  let result;
  try {
    result = await probe();
  } catch (err) {
    result = { status: 'unavailable', code: 'FIRESTORE_UNAVAILABLE', error: toSafeMessage(err) };
  }
  if (result.status === 'ok') return 'ok';

  // Not every failure is this bug: a genuine Firestore outage would also fail
  // the probe. Only CHANNEL-shaped errors — and hung probes, which are the
  // same dead-channel symptom expressed as a timeout — are rebuilt; anything
  // else is left for the next pass (and for the honest 503s in the meantime).
  const timedOut = /did not answer within/.test(String(result.error || ''));
  if (!timedOut && (!result.error || !CHANNEL_ERROR_MESSAGE.test(String(result.error)))) {
    console.warn(`[Firebase] Firestore probe failed (${result.code || 'unknown'}) — not a channel error, will re-probe. ${result.error || ''}`);
    return 'skipped';
  }

  console.warn(`[Firebase] Firestore channel looks dead (${toSafeMessage(result.error)}) — rebuilding the Admin SDK channel.`);
  const rebuilt = await restart();
  return rebuilt ? 'rebuilt' : 'rebuild-failed';
};

let watchdogTimer = null;

/**
 * Starts the periodic watchdog (default every 60 seconds, or
 * FIRESTORE_WATCHDOG_INTERVAL_MS from server/.env). The timer is `unref`'d, so
 * it never keeps a test process — or a shutting-down server — alive.
 * Pass FIRESTORE_WATCHDOG_INTERVAL_MS=0 to disable it entirely.
 */
export const startFirestoreWatchdog = (intervalMs) => {
  if (watchdogTimer) return watchdogTimer;

  const configured = intervalMs ?? Number(process.env.FIRESTORE_WATCHDOG_INTERVAL_MS);
  // 60s, not minutes: this is the backstop for the routes that do not retry
  // inline (courses/enquiries/applications), so it has to notice a dead
  // channel while the person waiting for the page is still waiting.
  const period = Number.isFinite(configured) ? configured : 60_000;
  if (period <= 0) {
    console.warn('[Firebase] Firestore watchdog is DISABLED (FIRESTORE_WATCHDOG_INTERVAL_MS<=0).');
    return null;
  }

  let running = false;
  watchdogTimer = setInterval(async () => {
    if (running) return; // previous pass still in flight — never overlap
    running = true;
    try {
      await runFirestoreWatchdogTick();
    } catch (err) {
      console.error(`[Firebase] Watchdog pass failed: ${toSafeMessage(err)}`);
    } finally {
      running = false;
    }
  }, period);
  watchdogTimer.unref?.();

  console.log(`[Firebase] Firestore watchdog armed (every ${Math.round(period / 1000)}s).`);
  return watchdogTimer;
};
