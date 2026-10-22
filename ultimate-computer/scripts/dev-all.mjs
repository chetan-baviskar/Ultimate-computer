#!/usr/bin/env node
/**
 * ONE command for local development:  npm run dev:all
 *
 * It starts exactly what is missing and NOTHING that already exists:
 *
 *   - Express API  → http://localhost:5001
 *       Skipped when our API is already answering /api/health there. If the
 *       port is held by a FOREIGN backend, it refuses to start and says so,
 *       because on Windows two Node servers can share one port and the Vite
 *       proxy would then send every /api request to the wrong one.
 *
 *   - Vite dev server → http://localhost:5173  (+ /api proxy → :5001)
 *       Skipped when a dev server is already up on 5173/5174/5175/… .
 *       Started with --strictPort, so Vite FAILS instead of quietly moving to
 *       5174/5175 — the auto-increment is what used to leave three frontends
 *       running and made "which URL is the real one?" unanswerable.
 *
 * Ctrl+C stops everything this command started (child process trees).
 *
 * Flags / env:
 *   --no-api, --no-web      start only the frontend / only the API
 *   API_PORT=5001           must match server/.env PORT + vite proxy target
 *   WEB_PORT=5173           must match server/.env ALLOWED_ORIGINS
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = Number(process.env.API_PORT || 5001);
const WEB_PORT = Number(process.env.WEB_PORT || 5173);
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const OUR_API = 'ultimate-computer-api';

const args = process.argv.slice(2);
const wantApi = !args.includes('--no-api');
const wantWeb = !args.includes('--no-web');

const children = new Map(); // pid -> { label, child }
let shuttingDown = false;

const log = (msg) => console.log(`[dev:all] ${msg}`);
const warn = (msg) => console.warn(`[dev:all] ${msg}`);

/* --------------------------------------------------------------- probing */

const probeJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
};

/** Our API? Returns the health payload, or null when nothing answers. */
const probeOurApi = async () => {
  try {
    const body = await probeJson(`${API_ORIGIN}/api/health`);
    return body?.service === OUR_API ? body : body ? { foreign: body.service || 'unknown' } : null;
  } catch {
    return null;
  }
};

/** A Vite dev server answers /@vite/client with 200; nothing else does. */
const probeVite = async (port) => {
  try {
    const res = await fetch(`http://localhost:${port}/@vite/client`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
};

/** Any dev server already running on 5173..5179? Returns its port or null. */
const findRunningWeb = async () => {
  for (let port = WEB_PORT; port < WEB_PORT + 7; port += 1) {
    if (await probeVite(port)) return port;
  }
  return null;
};

/* -------------------------------------------------------------- spawning */

const isWindows = process.platform === 'win32';

const killTree = (pid) => {
  try {
    if (isWindows) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};

const start = (label, command, spawnArgs, cwd) => {
  log(`starting ${label} …`);
  const child = spawn(command, spawnArgs, {
    cwd,
    stdio: 'inherit',
    shell: isWindows, // npm.cmd resolution on Windows
    ...(isWindows ? {} : { detached: true })
  });
  children.set(child.pid, { label, child });

  child.on('exit', (code, signal) => {
    children.delete(child.pid);
    if (shuttingDown) return;
    warn(`${label} exited (${signal || `code ${code}`})`);
    if (code !== 0) {
      warn('stopping the remaining processes — fix the error above and run `npm run dev:all` again.');
      shutdown(code ?? 1);
    }
  });
  return child;
};

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { label, child } of [...children.values()]) {
    if (child.pid) {
      log(`stopping ${label} …`);
      killTree(child.pid);
    }
  }
  setTimeout(() => process.exit(code), 300).unref?.();
  process.exitCode = code;
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

const waitFor = async (fn, timeoutMs, intervalMs = 400) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
};

/* ------------------------------------------------------------------ main */

const api = wantApi ? await probeOurApi() : null;

if (wantApi) {
  if (api?.service === OUR_API) {
    log(`API already running on ${API_ORIGIN} — not starting a second one.`);
  } else if (api?.foreign) {
    warn(`PORT ${API_PORT} is held by ANOTHER backend ("${api.foreign}").`);
    warn('Two Node servers can share a port on Windows, and the proxy would then send');
    warn(`/api requests to the wrong one. Stop that process (netstat -ano | findstr :${API_PORT})`);
    warn(`or run this with API_PORT=<free port> together with server/.env PORT and`);
    warn('server.proxy.target in vite.config.js.');
    process.exit(1);
  } else {
    start('API', 'npm', ['--prefix', 'server', 'run', 'start'], PROJECT);
    const healthy = await waitFor(async () => (await probeOurApi())?.service === OUR_API, 45_000);
    if (!healthy) {
      warn(`API did not answer ${API_ORIGIN}/api/health within 45s.`);
      shutdown(1);
    } else {
      log(`API ready → ${API_ORIGIN}/api/health`);
    }
  }
}

const runningWeb = wantWeb ? await findRunningWeb() : null;

if (wantWeb) {
  if (runningWeb) {
    log(`Vite dev server already running on port ${runningWeb} — not starting a second one.`);
    log(`App URL → http://localhost:${runningWeb}/`);
  } else {
    start('Vite dev server', 'npm', ['run', 'dev', '--', '--port', String(WEB_PORT), '--strictPort'], PROJECT);
    const up = await waitFor(() => probeVite(WEB_PORT), 60_000);
    if (!up) {
      warn(`Vite did not answer on port ${WEB_PORT} within 60s.`);
      shutdown(1);
    } else {
      log(`Vite ready → http://localhost:${WEB_PORT}/  (proxy /api → ${API_ORIGIN})`);
      log('Open that URL — the ONLY frontend you should have open.');
    }
  }
}

if (children.size > 0) {
  log(`${children.size} process(es) under management. Press Ctrl+C to stop.`);
  // Keep the process alive while the children run.
  await new Promise(() => {});
}
