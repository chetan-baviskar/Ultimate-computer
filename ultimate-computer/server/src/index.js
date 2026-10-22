import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import coursesRouter from './routes/courses.js';
import enquiriesRouter from './routes/enquiries.js';
import applicationsRouter from './routes/applications.js';
import {
  FIREBASE_PROJECT_ID,
  getFirebaseStatus,
  checkFirestoreHealth,
  startFirestoreWatchdog,
  runFirestoreWatchdogTick
} from './config/firebase.js';

// `quiet` suppresses dotenv's "injected env …" banner so startup output stays
// clean; a genuine dotenv failure still throws and is reported below.
dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 5001;
/** Identifies this API in /api/health so a port collision can be detected. */
const SERVER_NAME = 'ultimate-computer-api';
/**
 * Identity of THIS process, published in /api/health.
 *
 * A service name alone cannot tell two copies of our OWN server apart — and on
 * Windows `listen()` succeeds even when the port is already taken, so a second
 * `npm run server` (or an idle `node --watch` waking up) happily shares :5001
 * with the first one and the OS splits /api requests between them at random.
 * A random per-process id makes that detectable: if the health payload comes
 * back with somebody ELSE's id, this instance exits instead of competing.
 */
const INSTANCE_ID = crypto.randomUUID();
/**
 * How the API currently serves data:
 *  - 'firestore'  sessions are Firebase Authentication ID tokens verified by
 *               the Admin SDK; student profiles, the course catalogue,
 *               admission applications and contact enquiries all live in
 *               Cloud Firestore.
 *               Only the routes that are NOT part of this migration still
 *               answer 503 DATA_LAYER_UNAVAILABLE: admin user provisioning
 *               (POST /api/users) and admin password resets
 *               (PATCH /api/users/:uid/password, PATCH /api/auth/password).
 */
const DATA_LAYER = 'firestore';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(o => o.trim());

/**
 * True for dev-server origins on this machine. Vite auto-increments its port
 * (5173 -> 5174 -> 5175 -> ...) whenever the previous one is already in use,
 * and a hardcoded ALLOWED_ORIGINS list then rejects login with CORS_BLOCKED.
 * Safe to allow: sessions are tokens in localStorage, not cookies, so a page on
 * another localhost port can never ride an existing authenticated session.
 */
const isLocalhostOrigin = (origin) => {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

app.use(cors({ origin: (origin, cb) => {
  // Allow requests with no origin (curl, server-to-server), the explicit
  // ALLOWED_ORIGINS whitelist, and any localhost dev server port.
  if (!origin || ALLOWED_ORIGINS.includes(origin) || isLocalhostOrigin(origin)) return cb(null, true);
  cb(new Error(`Origin ${origin} not allowed by CORS`));
} }));
app.use(express.json({ limit: '1mb' }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check — always answers, including while the API is booting.
// Reports Firebase configuration state only; it never touches the network, so
// it stays instant and cannot hang when Firestore is unreachable.
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: SERVER_NAME,
    // Per-process id: lets the single-instance guard tell TWO copies of our own
    // server apart (the service name alone is identical for both).
    instanceId: INSTANCE_ID,
    dataLayer: DATA_LAYER,
    firebase: getFirebaseStatus(),
    timestamp: new Date().toISOString()
  });
});

// Firestore health check — performs ONE read-only document GET against a
// marker path this server never writes to. It never returns document data and
// never mutates the database.
//   200 { status: 'ok', ... }           Firestore answered
//   503 { status: 'unavailable' | 'not-configured', ... }  honest failure
app.get('/api/health/firestore', async (_req, res) => {
  const result = await checkFirestoreHealth();
  res.status(result.status === 'ok' ? 200 : 503).json({
    status: result.status,
    service: SERVER_NAME,
    projectId: FIREBASE_PROJECT_ID,
    latencyMs: result.latencyMs,
    ...(result.code ? { code: result.code } : {}),
    ...(result.error ? { error: result.error } : {}),
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/enquiries', enquiriesRouter);
app.use('/api/applications', applicationsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON payload.', code: 'BAD_JSON' });
  }
  if (err && /not allowed by CORS/.test(err.message || '')) {
    return res.status(403).json({ error: 'Origin not allowed by CORS.', code: 'CORS_BLOCKED' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Port-collision guard. Windows is the reason this exists in two stages:
 *
 *  1. BEFORE binding: Node sets SO_REUSEADDR, so `listen()` SUCCEEDS even when
 *     another server already owns the port — both servers share it and the OS
 *     hands each incoming connection to one of them at random. That is exactly
 *     how every /api/login request was silently served by a DIFFERENT backend
 *     (wrong responses -> "Login is temporarily unavailable"). Probing BEFORE
 *     we bind can only ever reach the OTHER process, so the answer is
 *     unambiguous. (Probing after binding would sometimes hit ourselves.)
 *
 *  2. AFTER binding: re-probe to catch a process that claimed the port in the
 *     window between (1) and our own bind, and to log the instance id we now
 *     answer with.
 *
 * The payload carries a per-process `instanceId`. Two copies of OUR OWN server
 * report the same `service` but different ids — only the id can tell them apart.
 */
const verifyPortIsOurs = async ({ phase }) => {
  let body = null;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      signal: AbortSignal.timeout(3000)
    });
    body = await res.json();
  } catch {
    return; // Nothing answered — port free (before bind) or transient (after)
  }

  if (body?.instanceId === INSTANCE_ID) {
    // Our own process answered (only possible in the after-bind phase).
    if (phase === 'after-bind') {
      console.log(`[Server] Port ${PORT} verified: answering as instance ${INSTANCE_ID}.`);
    }
    return;
  }

  if (body?.service !== SERVER_NAME) {
    console.error(`\n[FATAL] Port ${PORT} is ALSO being served by ANOTHER process.`);
    console.error(`[FATAL] /api/health on :${PORT} answered ${JSON.stringify(body)} instead of "${SERVER_NAME}".`);
    console.error('[FATAL] On Windows two Node servers can bind the same port at once, and the frontend');
    console.error('[FATAL] would then send /api requests to the WRONG backend.');
    console.error(`[FATAL] Fix: stop the other process, or set a free PORT in server/.env (and the matching`);
    console.error(`[FATAL] server.proxy.target in vite.config.js).`);
    process.exit(1);
  }

  // Same service name, different process — a SECOND copy of this server.
  console.error(`\n[FATAL] Port ${PORT} is already served by ANOTHER INSTANCE of ${SERVER_NAME}.`);
  console.error(`[FATAL] Other instance: ${body?.instanceId || '(unknown id)'} — this instance: ${INSTANCE_ID}.`);
  console.error('[FATAL] Two copies of the API on one port split requests at random; each has its own');
  console.error('[FATAL] Firestore channel, so logins would fail intermittently. Stop the duplicate');
  console.error('[FATAL] (only ONE backend may run — use "npm run dev:all" from the project root).');
  process.exit(1);
};

const start = async () => {
  // Stage 1: refuse to even bind if something else already owns the port.
  await verifyPortIsOurs({ phase: 'before-bind' });

  const server = app.listen(PORT, () => {
    // Canonical, clean startup line. Everything that can go wrong is reported
    // below as an explicit error/warning — routine success stays quiet.
    console.log(`[Server] Ultimate Computer running at http://localhost:${PORT}`);

    // Self-healing Firestore channel: on this machine the Admin SDK's gRPC
    // channel can go permanently stale after long uptime (`16 UNAUTHENTICATED`
    // on every call, only a restart used to fix it). The watchdog probes
    // Firestore and rebuilds the Admin app when the channel dies.
    startFirestoreWatchdog();

    // ...and ONE pass right now. The interval only fires after the first
    // period, so without this a process that boots with a stale credential
    // would serve 503 DATA_LAYER_UNAVAILABLE ("Login is temporarily
    // unavailable") for a whole interval before anything noticed. Fire-and-
    // forget: the probe never blocks the port from accepting connections.
    runFirestoreWatchdogTick().catch((err) =>
      console.error(`[Firebase] Boot-time Firestore probe failed: ${err?.message || err}`)
    );

    verifyPortIsOurs({ phase: 'after-bind' }).catch(() => {});
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n[FATAL] Port ${PORT} is already in use by another process.`);
      console.error(`[FATAL] Stop it, or set a different PORT in server/.env (and update server.proxy.target in vite.config.js).`);
      process.exit(1);
    }
    throw error;
  });
};

start().catch((err) => {
  console.error(`[FATAL] Server failed to start: ${err?.message || err}`);
  process.exit(1);
});
