#!/usr/bin/env node
/**
 * Browser end-to-end test for the student authentication flow.
 *
 * Drives a real headless Chrome (Chrome DevTools Protocol, no extra npm
 * packages) through the actual React UI against the real API + Firebase:
 *
 *   register → dashboard shows the Firestore profile → browser refresh keeps
 *   the session → logout → wrong password rejected → login again → logout
 *
 * Usage:  node test-auth-ui.mjs [appUrl]
 *   e.g.  node test-auth-ui.mjs http://localhost:5173/
 *
 * Requires: the API (server/, port 5001) and the Vite dev server to be running.
 * The script only CREATES one test account; it never deletes existing records.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const APP_URL = process.argv[2] || process.env.APP_URL || 'http://localhost:5173/';
const CDP_PORT = Number(process.env.CDP_PORT || 9333);
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = path.join(os.tmpdir(), 'opencode', 'uc-ui-test-profile');

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
    throw new Error('page condition not met in ' + timeout + 'ms; text: ' + document.body.innerText.slice(0, 240).replace(/\\n+/g, ' | '));
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

  const version = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    if (!res.ok) throw new Error(`cdp ${res.status}`);
    return res.json();
  }, 25000, 500);
  return version;
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
const EMAIL = `browser.test.${stamp}@example.com`;
const PASSWORD = `Browser#Test${stamp}`;
const FULL_NAME = 'Browser Test Student';
const MOBILE = '9876543999';

const run = async () => {
  console.log(`Ultimate Computer — browser UI auth test against ${APP_URL}`);
  console.log(`Test account: ${EMAIL}\n`);

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
  check('app renders with the logged-out navigation', true);
  const proxied = await evaluate(`fetch('/api/health').then(r => r.json()).then(j => j.service)`);
  check('Vite dev server proxies /api to the Express API', proxied === 'ultimate-computer-api', String(proxied));

  console.log('\n=== 2. Register through the real form ===');
  await evaluate(`window.__uc.byText('nav button', 'Login').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Student Login'), 15000)`);
  check('Login page opens', true);

  await evaluate(`window.__uc.byText('button', 'Create Account').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Create Student Account'), 15000)`);
  check('Registration page opens', true);

  // The Course / Branch dropdown must be gone from account creation only.
  const courseFieldPresent = await evaluate(`
    Boolean(document.querySelector('select')) ||
    document.body.innerText.includes('Course / Branch')
  `);
  check('sign-up form has no Course / Branch selection', courseFieldPresent === false);

  await evaluate(`
    window.__uc.setValue('input[type=text]', ${JSON.stringify(FULL_NAME)});
    window.__uc.setValue('input[type=email]', ${JSON.stringify(EMAIL)});
    window.__uc.setValue('input[type=tel]', ${JSON.stringify(MOBILE)});
    const pw = document.querySelectorAll('input[type=password]');
    window.__uc.setValue('input[type=password]', ${JSON.stringify(PASSWORD)});
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(pw[1], ${JSON.stringify(PASSWORD)});
    pw[1].dispatchEvent(new Event('input', { bubbles: true }));
    true;
  `);
  await evaluate(`window.__uc.byText('button', 'Create Student Account').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Student account registered successfully'), 30000)`);
  check('form reports a successful registration', true);

  // The page then redirects itself to the Student Login portal.
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Student Login'), 15000)`);
  check('auto-redirect to the Student Login portal', true);

  console.log('\n=== 3. Login and see the real Firestore profile ===');
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('button', 'Sign In as Student')), 15000)`);
  await evaluate(`
    window.__uc.setValue('input[type=email]', ${JSON.stringify(EMAIL)});
    window.__uc.setValue('input[type=password]', ${JSON.stringify(PASSWORD)});
    true;
  `);
  await evaluate(`window.__uc.byText('button', 'Sign In as Student').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Welcome back,'), 30000)`);
  check('student dashboard opens after login', true);

  // Note: the role label is styled with CSS `uppercase`, and Chrome's
  // innerText returns the transformed text, so compare case-insensitively.
  const profileBits = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      name: t.includes(${JSON.stringify(FULL_NAME)}),
      email: t.includes(${JSON.stringify(EMAIL)}),
      // Account creation no longer asks for a course/branch, so a freshly
      // registered profile shows the dashboard's "no course" placeholder.
      noCourse: t.includes('Not Selected'),
      mobile: t.includes(${JSON.stringify(MOBILE)}),
      role: /role:\\s*student/i.test(t)
    };
  })()`);
  check('dashboard shows the Firestore profile name', profileBits.name);
  check('dashboard shows the registered email', profileBits.email);
  check('dashboard shows no course selected after sign-up', profileBits.noCourse);
  check('dashboard shows the registered mobile number', profileBits.mobile);
  check('dashboard shows the student role', profileBits.role);

  console.log('\n=== 4. Browser refresh keeps the session ===');
  await send('Page.reload', { ignoreCache: true });
  // A reload wipes the page context, so wait for the document and re-inject the helpers.
  await waitFor(async () => {
    try {
      return await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#root'))`);
    } catch {
      return false; // navigation in flight, context not ready yet
    }
  }, 40000);
  await evaluate(`${PRELUDE}`);
  // The app has no URL routing, so a reload lands on the home page — but the
  // auth session itself must survive (the nav switches to the logged-in state).
  await evaluate(`window.__uc.waitFor(() => Boolean(document.querySelector('button[title="Logout"]')), 30000)`);
  check('auth session survives a full page refresh', true);
  const navStillHasLogin = await evaluate(`Boolean(window.__uc.byText('nav button', 'Login'))`);
  check('logged-out Login button stays hidden after the refresh', navStillHasLogin === false);

  // Re-open the dashboard from the refreshed session and confirm the profile
  // is fetched again from Firestore.
  await evaluate(`(() => { const b = document.querySelector('nav button[title="Logout"]')?.previousElementSibling; if (b) b.click(); return true; })()`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Welcome back,'), 30000)`);
  check('dashboard re-opens from the restored session', true);
  const afterRefresh = await evaluate(`(() => {
    const t = document.body.innerText;
    return t.includes(${JSON.stringify(EMAIL)}) && t.includes(${JSON.stringify(FULL_NAME)});
  })()`);
  check('profile is re-fetched from Firestore after the refresh', afterRefresh === true);

  console.log('\n=== 5. Logout, wrong password, login again ===');
  await evaluate(`(() => { const b = document.querySelector('button[title="Logout"]'); if (!b) throw new Error('logout button missing'); b.click(); return true; })()`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 20000)`);
  check('logout returns the app to the logged-out state', true);

  await evaluate(`window.__uc.byText('nav button', 'Login').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Student Login'), 15000)`);
  await evaluate(`
    window.__uc.setValue('input[type=email]', ${JSON.stringify(EMAIL)});
    window.__uc.setValue('input[type=password]', 'definitely-wrong-password');
    true;
  `);
  await evaluate(`window.__uc.byText('button', 'Sign In as Student').click(); true`);
  await evaluate(`window.__uc.waitFor(() => /Invalid email or password|No sign-in account exists/.test(document.body.innerText), 30000)`);
  check('incorrect password is rejected with a clear message', true);
  const stillLoggedOut = await evaluate(`Boolean(window.__uc.byText('nav button', 'Login'))`);
  check('failed login leaves the user logged out', stillLoggedOut === true);

  await evaluate(`
    window.__uc.setValue('input[type=password]', ${JSON.stringify(PASSWORD)});
    true;
  `);
  await evaluate(`window.__uc.byText('button', 'Sign In as Student').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Welcome back,'), 30000)`);
  check('login works again with the correct password', true);

  await evaluate(`(() => { const b = document.querySelector('button[title="Logout"]'); if (!b) throw new Error('logout button missing'); b.click(); return true; })()`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 20000)`);
  check('final logout succeeds', true);

  if (pageErrors.length > 0) {
    info(`page exceptions observed: ${pageErrors.slice(0, 3).join(' | ')}`);
  }

  close();
  console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : `${failures} UI CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
  return failures;
};

run()
  .catch((err) => {
    console.error('FAIL  UI test crashed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    process.exit(process.exitCode ?? 0);
  });
