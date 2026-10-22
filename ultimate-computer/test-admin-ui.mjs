#!/usr/bin/env node
/**
 * Browser end-to-end test for the ADMIN authentication flow and dashboard.
 *
 * Drives a real headless Chrome (Chrome DevTools Protocol, no extra npm
 * packages) through the actual React UI against the real API + Firebase:
 *
 *   wrong admin password rejected with a safe message
 *   valid provisioned admin signs in -> Admin Dashboard opens
 *   dashboard panels load real Firestore data (students, courses, stats)
 *   admin session survives a browser refresh
 *   a STUDENT account is refused on the Admin Portal (and by admin APIs)
 *   logout works and protected routes/APIs become inaccessible again
 *
 * Usage (from the project root, with the API on :5001 AND `npm run dev`):
 *   node test-admin-ui.mjs [appUrl]
 *
 * The admin account is a throwaway provisioned through the same server-side
 * mechanism as a real admin (server/test-support.mjs -> Admin SDK). To test an
 * EXISTING provisioned admin instead, pass its credentials through the
 * environment (they are never written to any file):
 *   UC_ADMIN_UI_EMAIL=... UC_ADMIN_UI_PASSWORD=... node test-admin-ui.mjs
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

import { ensureAdminAccount, ensureStudentAccount } from './server/test-support.mjs';

const APP_URL = process.argv[2] || process.env.APP_URL || 'http://localhost:5173/';
const CDP_PORT = Number(process.env.CDP_PORT || 9334);
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = path.join(os.tmpdir(), 'opencode', 'uc-admin-ui-test-profile');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const info = (line) => console.log(`      ${line}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitFor = async (fn, timeout = 30000, interval = 250) => {
  const end = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await sleep(interval);
  }
  throw new Error(`timeout after ${timeout}ms${lastError ? ` (last error: ${lastError.message})` : ''}`);
};

/** Page-context helpers injected once after navigation. */
const PRELUDE = `
window.__uc = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  setValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) throw new Error('missing field: ' + selector);
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  byText(selector, text) {
    return [...document.querySelectorAll(selector)].find((el) => (el.textContent || '').includes(text)) || null;
  },
  async waitFor(predicate, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { if (predicate()) return true; } catch (e) { /* keep polling */ }
      await window.__uc.sleep(150);
    }
    throw new Error('page condition not met in ' + timeout + 'ms; text: ' + document.body.innerText.slice(0, 900).replace(/\\n+/g, ' | '));
  }
};
true;`;

/* ------------------------------------------------------------ chrome + cdp */

let chromeProcess = null;
const cleanup = () => {
  if (chromeProcess?.pid) {
    try {
      spawn('taskkill', ['/PID', String(chromeProcess.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  }
};
process.on('exit', cleanup);

const startChrome = async () => {
  chromeProcess = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--no-first-run',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,1000',
      'about:blank'
    ],
    { detached: true, stdio: 'ignore' }
  );
  chromeProcess.unref();

  await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    if (!res.ok) throw new Error(`cdp ${res.status}`);
    return res.json();
  }, 25000, 500);
};

const connect = async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  if (!target) throw new Error('no page target exposed by Chrome');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const pageErrors = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params?.exceptionDetails?.text || 'exception');
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      const desc =
        result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluate failed';
      throw new Error(desc.split('\n')[0]);
    }
    return result.result?.value;
  };

  return { send, evaluate, pageErrors, close: () => ws.close() };
};

/* ------------------------------------------------------------------- test */

const stamp = Date.now();
const THROWN_ADMIN = { email: `admin.ui.${stamp}@example.com`, password: `Admin#Ui${stamp}` };
const STUDENT = { email: `student.ui.${stamp}@example.com`, password: `Student#Ui${stamp}` };

const run = async () => {
  const envAdmin =
    process.env.UC_ADMIN_UI_EMAIL && process.env.UC_ADMIN_UI_PASSWORD
      ? { email: process.env.UC_ADMIN_UI_EMAIL, password: process.env.UC_ADMIN_UI_PASSWORD, real: true }
      : null;
  const ADMIN = envAdmin || { ...THROWN_ADMIN, real: false };

  console.log(`Ultimate Computer — admin UI test against ${APP_URL}`);
  console.log(`Admin account under test: ${ADMIN.email}${ADMIN.real ? ' (pre-provisioned, via UC_ADMIN_UI_* env)' : ' (throwaway, provisioned server-side)'}\n`);

  await ensureAdminAccount(ADMIN.email, ADMIN.password);
  await ensureStudentAccount(STUDENT.email, STUDENT.password);
  info('admin + student accounts ensured via the Admin SDK');

  await startChrome();
  info('headless Chrome started');

  const { send, evaluate, pageErrors, close } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('=== 1. App loads ===');
  await send('Page.navigate', { url: APP_URL });
  await waitFor(async () => {
    try {
      return await evaluate(`document.readyState === 'complete' && document.body.innerText.includes('ULTIMATE')`);
    } catch {
      return false; // navigation in flight, context not ready yet
    }
  }, 40000);
  await evaluate(`${PRELUDE}`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 20000)`);
  check('app renders logged-out', true);
  const proxied = await evaluate(`fetch('/api/health').then(r => r.json()).then(j => j.service)`);
  check('Vite dev server proxies /api to the Express API', proxied === 'ultimate-computer-api', String(proxied));

  const openAdminTab = async () => {
    await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 15000)`);
    await evaluate(`window.__uc.byText('nav button', 'Login').click(); true`);
    await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Student Login'), 15000)`);
    await evaluate(`window.__uc.byText('button', 'Admin Portal Login').click(); true`);
    await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Admin Authentication'), 15000)`);
  };

  const fillAdminForm = async (email, password) => {
    await evaluate(`
      window.__uc.setValue('input[type=email]', ${JSON.stringify(email)});
      window.__uc.setValue('input[type=password]', ${JSON.stringify(password)});
      true;
    `);
  };

  console.log('\n=== 2. Incorrect admin credentials are rejected ===');
  await openAdminTab();
  await fillAdminForm(ADMIN.email, 'definitely-the-wrong-password');
  await evaluate(`window.__uc.byText('button', 'Authenticate Admin Session').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Incorrect administrative email or password'), 30000)`);
  check('wrong password shows a clear, safe error', true);
  const stillLoggedOut = await evaluate(`Boolean(window.__uc.byText('nav button', 'Login'))`);
  check('failed admin login leaves the app logged out', stillLoggedOut === true);

  console.log('\n=== 3. Valid administrator signs in and the dashboard opens ===');
  await fillAdminForm(ADMIN.email, ADMIN.password);
  await evaluate(`window.__uc.byText('button', 'Authenticate Admin Session').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('ADMIN PORTAL'), 30000)`);
  check('Admin Dashboard opens after a valid admin sign-in', true);
  const emailShown = await evaluate(`document.body.innerText.includes(${JSON.stringify(ADMIN.email)})`);
  check('dashboard shows the signed-in administrator email', emailShown === true);
  const statsVisible = await evaluate(`(() => {
    const t = document.body.innerText;
    return t.includes('Total Applications') && t.includes('Registered Students');
  })()`);
  check('dashboard overview renders the live statistics cards', statsVisible === true);

  console.log('\n=== 4. Dashboard panels load real Firestore data ===');
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('aside button', 'Students')), 15000)`);
  await evaluate(`window.__uc.byText('aside button', 'Students').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Registered Student Profiles'), 20000)`);
  // The count fills in once the Firestore subscription delivers — wait for it.
  await evaluate(`window.__uc.waitFor(() => {
    const m = document.body.innerText.match(/Registered Student Profiles \\((\\d+)\\)/);
    return Boolean(m && Number(m[1]) > 0);
  }, 20000)`);
  const studentCount = await evaluate(`(() => {
    const m = document.body.innerText.match(/Registered Student Profiles \\((\\d+)\\)/);
    return m ? Number(m[1]) : -1;
  })()`);
  check('students panel lists profiles from Firestore', studentCount > 0, `count=${studentCount}`);

  await evaluate(`window.__uc.byText('aside button', 'Course Management').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Course Management Directory'), 20000)`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Live Database Connected'), 20000)`);
  const dbBadge = await evaluate(`document.body.innerText.includes('Live Database Connected')`);
  check('courses panel loads and the header reports the live database', dbBadge === true);

  // The app attaches the Firebase ID token itself (src/config/api.js); repeat
  // the same call here with that token to prove the signed-in browser session
  // is authorised, and without it to prove the API still demands one.
  const adminApi = await evaluate(`(async () => {
    const token = localStorage.getItem('uc_auth_token');
    if (!token) return 'no-token';
    return await fetch('/api/users/students', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.status);
  })()`);
  check('admin-only API answers 200 from the signed-in browser session', adminApi === 200, `status=${adminApi}`);

  console.log('\n=== 5. Browser refresh keeps the admin session ===');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(async () => {
    try {
      return await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#root'))`);
    } catch {
      return false; // navigation in flight, context not ready yet
    }
  }, 40000);
  await evaluate(`${PRELUDE}`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Admin Dashboard')), 30000)`);
  check('admin session survives a full page refresh', true);
  const studentLinkHidden = await evaluate(`Boolean(window.__uc.byText('nav button', 'Student Dashboard'))`);
  check('restored admin session shows the Admin link (not the Student one)', studentLinkHidden === false);
  await evaluate(`window.__uc.byText('nav button', 'Admin Dashboard').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('ADMIN PORTAL'), 30000)`);
  check('dashboard re-opens from the restored session', true);

  console.log('\n=== 6. A student account cannot use the Admin Portal ===');
  // Sign out first (from the dashboard sidebar), then try the student's
  // credentials on the admin form.
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('button', 'Sign Out Admin')), 20000)`);
  await evaluate(`window.__uc.byText('button', 'Sign Out Admin').click(); true`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 20000)`);
  check('admin logout returns the app to the logged-out state', true);

  await openAdminTab();
  await fillAdminForm(STUDENT.email, STUDENT.password);
  await evaluate(`window.__uc.byText('button', 'Authenticate Admin Session').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('does not have administrative privileges'), 30000)`);
  check('student credentials are refused on the Admin Portal', true);
  const studentStillLoggedOut = await evaluate(`Boolean(window.__uc.byText('nav button', 'Login'))`);
  check('the refused student is left logged out', studentStillLoggedOut === true);

  const studentApiCall = await evaluate(`fetch('/api/users/students').then(r => r.status)`);
  check('admin-only API refuses the anonymous browser session → 401', studentApiCall === 401, `status=${studentApiCall}`);

  console.log('\n=== 7. Logout protects the dashboard ===');
  // Sign the student in normally, confirm the guard never shows an admin
  // dashboard, then finish logged out.
  await evaluate(`window.__uc.byText('button', 'Student Portal Login').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Student Login'), 15000)`);
  await evaluate(`
    window.__uc.setValue('input[type=email]', ${JSON.stringify(STUDENT.email)});
    window.__uc.setValue('input[type=password]', ${JSON.stringify(STUDENT.password)});
    true;
  `);
  await evaluate(`(() => {
    const btn = window.__uc.byText('button', 'Sign In as Student');
    if (!btn) throw new Error('student sign-in button missing');
    btn.click();
    return true;
  })()`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Welcome back,'), 30000)`);
  check('student authentication still works after the admin changes', true);
  const studentApiAsStudent = await evaluate(`(async () => {
    const token = localStorage.getItem('uc_auth_token');
    if (!token) return 'no-token';
    return await fetch('/api/users/students', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.status);
  })()`);
  check('signed-in student is refused by the admin-only API → 403', studentApiAsStudent === 403, `status=${studentApiAsStudent}`);
  const adminLinkForStudent = await evaluate(`Boolean(window.__uc.byText('nav button', 'Admin Dashboard'))`);
  check('a student never sees the Admin Dashboard link', adminLinkForStudent === false);

  await evaluate(`(() => { const b = document.querySelector('button[title="Logout"]'); if (!b) throw new Error('logout button missing'); b.click(); return true; })()`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 20000)`);
  check('final logout succeeds', true);

  if (pageErrors.length > 0) {
    info(`page exceptions observed: ${pageErrors.slice(0, 3).join(' | ')}`);
  }

  close();
  console.log(`\n${failures === 0 ? 'ALL ADMIN UI CHECKS PASSED' : `${failures} ADMIN UI CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
  return failures;
};

run()
  .catch((err) => {
    console.error('FAIL  admin UI test crashed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    process.exit(process.exitCode ?? 0);
  });
