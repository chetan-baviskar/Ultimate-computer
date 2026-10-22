#!/usr/bin/env node
/**
 * Browser-style ADMIN login flow, end-to-end through the Vite dev proxy.
 *
 * Reproduces exactly what src/pages/AdminLogin.jsx + src/context/AuthContext.jsx
 * do, against the real running stack (Vite :5173 -> API :5001 -> Firebase):
 *   1. Firebase Web SDK sign-in with the server/.env credentials
 *   2. POST /api/auth/login with the ID token  -> role must be 'admin'
 *   3. refresh: GET /api/auth/me with the same token -> session restores
 *   4. the dashboard's data polls all answer 200 arrays
 *   5. anonymous + forged callers are refused (401/403), never a session
 *   6. after sign-out (no token) /api/auth/me answers 401 NO_TOKEN
 *
 * Usage:  node test-admin-browser-flow.mjs   (API on :5001, Vite on :5173)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { signInWeb, check, info, report, waitForApi } from './test-support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const EMAIL = String(process.env.ADMIN_EMAIL || '').split(',')[0].trim().toLowerCase();
const PASSWORD = String(process.env.ADMIN_PASSWORD || '');

const proxied = async (method, route, token) => {
  try {
    const res = await fetch(`${ORIGIN}${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.message } };
  }
};

const run = async () => {
  console.log(`Browser-style admin flow via ${ORIGIN} proxy (password read from server/.env, not printed)`);

  if (!EMAIL || !PASSWORD) {
    console.log('FAIL  ADMIN_EMAIL / ADMIN_PASSWORD are not set in server/.env');
    return report();
  }

  const apiUp = await waitForApi();
  const webUp = (await proxied('GET', '/api/health')).status === 200;
  if (!apiUp || !webUp) {
    console.log(`FAIL  stack not reachable (api=${apiUp} viteProxy=${webUp})`);
    return report();
  }

  // 1. Firebase Web SDK sign-in — the exact AdminLogin.jsx step.
  const token = await signInWeb(EMAIL, PASSWORD);
  check('Admin Login: Firebase sign-in with the env credentials succeeds', Boolean(token));

  // 2. POST /api/auth/login — authService.login's API step.
  const login = await proxied('POST', '/api/auth/login', token);
  check('POST /api/auth/login -> 200 with role admin',
    login.status === 200 && login.data?.user?.role === 'admin',
    `status=${login.status} role=${login.data?.user?.role}`);

  // 3. Refresh: AuthContext re-reads the profile via GET /api/auth/me.
  const me = await proxied('GET', '/api/auth/me', token);
  check('dashboard session restore after refresh (GET /api/auth/me) -> 200 role admin',
    me.status === 200 && me.data?.role === 'admin',
    `status=${me.status} role=${me.data?.role}`);

  // 4. Dashboard data polls.
  for (const route of ['/api/users/students', '/api/applications', '/api/enquiries', '/api/courses']) {
    const res = await proxied('GET', route, token);
    check(`dashboard poll ${route} -> 200 array`,
      res.status === 200 && Array.isArray(res.data),
      `status=${res.status} count=${Array.isArray(res.data) ? res.data.length : 'n/a'}`);
  }

  // 5. Nobody else reaches the dashboard data.
  const anon = await proxied('GET', '/api/users/students');
  check('anonymous dashboard poll -> 401 NO_TOKEN',
    anon.status === 401 && anon.data?.code === 'NO_TOKEN', `status=${anon.status}`);

  const forged = await proxied('GET', '/api/users/students', 'forged.token.value');
  check('forged token dashboard poll -> 401 INVALID_TOKEN',
    forged.status === 401 && forged.data?.code === 'INVALID_TOKEN', `status=${forged.status}`);

  // 6. Sign-out: the token is gone, so the API refuses the old session.
  const afterLogout = await proxied('GET', '/api/auth/me');
  check('after sign-out (token cleared) GET /api/auth/me -> 401 NO_TOKEN',
    afterLogout.status === 401 && afterLogout.data?.code === 'NO_TOKEN', `status=${afterLogout.status}`);
  info('logout itself is client-side Firebase signOut + localStorage clear (no server call needed)');

  report();
};

run().catch((err) => {
  console.error('FAIL  admin browser-flow test crashed:', err?.message || err);
  process.exit(1);
});
