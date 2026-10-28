#!/usr/bin/env node
/**
 * Browser end-to-end test for the COURSE-ON-PROFILE flow.
 *
 * Drives a real headless Chrome (Chrome DevTools Protocol, no extra npm
 * packages) through the actual React UI against the real API + Firebase:
 *
 *   a logged-in student with no application sees "Not Selected" on the profile
 *   the student submits a real Admission application through the form
 *   the profile still has no course while the application is Pending
 *   an admin approves the application through the Admin Dashboard UI
 *   the server-side sync writes the approved course to users/{uid}.course
 *   the student's dashboard shows the course name (not "Not Selected")
 *   the course survives a browser refresh and a fresh logout/login cycle
 *
 * Usage (from the project root, with the API on :5001 AND `npm run dev`):
 *   node test-course-flow-ui.mjs [appUrl]
 *
 * The admin + student accounts are throwaways provisioned through the same
 * server-side mechanism as real accounts (server/test-support.mjs -> Admin SDK).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

import {
  adminResources,
  ensureAdminAccount,
  ensureStudentAccount
} from './server/test-support.mjs';

const APP_URL = process.argv[2] || process.env.APP_URL || 'http://localhost:5173/';
const CDP_PORT = Number(process.env.CDP_PORT || 9337);
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = path.join(os.tmpdir(), 'opencode', 'uc-course-flow-ui-test-profile');

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
    const proto =
      el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype :
      el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype :
      window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  byText(selector, text) {
    return [...document.querySelectorAll(selector)].find((el) => (el.textContent || '').includes(text)) || null;
  },
  /** Value shown next to the "Course:" label on the student profile card. */
  profileCourse() {
    const label = [...document.querySelectorAll('span')].find((el) => el.textContent.trim() === 'Course:');
    return label && label.nextElementSibling ? label.nextElementSibling.textContent.trim() : null;
  },
  /** Value shown next to a "Label:" on the admission review step. */
  reviewValue(label) {
    const el = [...document.querySelectorAll('span')].find((n) => n.textContent.trim() === label);
    return el && el.nextElementSibling ? el.nextElementSibling.textContent.trim() : null;
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
const ADMIN = { email: `admin.course.${stamp}@example.com`, password: `Admin#Course${stamp}` };
const STUDENT = { email: `student.course.${stamp}@example.com`, password: `Student#Course${stamp}` };

const run = async () => {
  console.log(`Ultimate Computer — course-on-profile UI test against ${APP_URL}`);
  console.log(`Accounts: admin=${ADMIN.email} student=${STUDENT.email}\n`);

  await ensureAdminAccount(ADMIN.email, ADMIN.password);
  const student = await ensureStudentAccount(STUDENT.email, STUDENT.password);
  info('admin + student accounts ensured via the Admin SDK');

  const profileCourseInDb = async () => {
    const { db } = adminResources();
    const snap = await db.collection('users').doc(student.uid).get();
    return snap.exists ? (snap.data()?.course ?? '') : null;
  };

  await startChrome();
  info('headless Chrome started');

  const { send, evaluate, pageErrors, close } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');

  const loadApp = async () => {
    await send('Page.navigate', { url: APP_URL });
    await waitFor(async () => {
      try {
        return await evaluate(`document.readyState === 'complete' && document.body.innerText.includes('ULTIMATE')`);
      } catch {
        return false; // navigation in flight, context not ready yet
      }
    }, 40000);
    await evaluate(`${PRELUDE}`);
  };

  const studentLogin = async () => {
    await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 15000)`);
    await evaluate(`window.__uc.byText('nav button', 'Login').click(); true`);
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
  };

  const studentLogout = async () => {
    await evaluate(`(() => { const b = document.querySelector('button[title="Logout"]'); if (!b) throw new Error('logout button missing'); b.click(); return true; })()`);
    await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 20000)`);
  };

  console.log('\n=== 1. Fresh student sees no course on the profile ===');
  await loadApp();
  await studentLogin();
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Student Dashboard')), 20000)`);
  await evaluate(`window.__uc.byText('nav button', 'Student Dashboard').click(); true`);
  await evaluate(`window.__uc.waitFor(() => window.__uc.profileCourse() !== null, 20000)`);
  const courseBefore = await evaluate(`window.__uc.profileCourse()`);
  check('profile shows "Not Selected" before any approval', courseBefore === 'Not Selected', courseBefore);
  const dbCourseBefore = await profileCourseInDb();
  check('Firestore users/{uid}.course is empty before any approval', !dbCourseBefore, `course=${JSON.stringify(dbCourseBefore)}`);

  console.log('\n=== 2. Student submits a real Admission application ===');
  await evaluate(`window.__uc.byText('nav button', 'Admission').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Apply For Admission'), 15000)`);
  // Wait for the live Firestore course list to fill the dropdown.
  await evaluate(`window.__uc.waitFor(() => {
    const sel = document.querySelector('form select');
    return Boolean(sel && sel.options.length > 0);
  }, 20000)`);
  await evaluate(`
    window.__uc.setValue('input[placeholder="e.g. Rahul Sharma"]', 'E2E Course Flow Student');
    window.__uc.setValue('input[type=tel]', '9876543210');
    window.__uc.setValue('input[type=email]', ${JSON.stringify(STUDENT.email)});
    window.__uc.setValue('input[type=date]', '2001-05-14');
    window.__uc.setValue('input[placeholder="e.g. City Name"]', 'Pune');
    window.__uc.setValue('textarea[placeholder="Enter street address, area, and pincode"]', '42, Test Lane, Kothrud, 411038');
    true;
  `);
  await evaluate(`window.__uc.byText('button', 'Proceed to Review Application').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Review & Confirm Application'), 20000)`);
  const appliedCourse = await evaluate(`window.__uc.reviewValue('Selected Program:')`);
  check('review step shows the selected program', Boolean(appliedCourse), appliedCourse);
  await evaluate(`window.__uc.byText('button', 'Confirm & Submit Application').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Application Submitted Successfully!'), 30000)`);
  const applicationId = await evaluate(`(() => {
    const m = document.body.innerText.match(/Official Reference ID:\\s*([^\\s]+)/);
    return m ? m[1] : null;
  })()`);
  check('application is submitted and a reference ID is issued', Boolean(applicationId), applicationId);
  const courseWhilePendingDb = await profileCourseInDb();
  check('Firestore course is still empty while the application is Pending', !courseWhilePendingDb, `course=${JSON.stringify(courseWhilePendingDb)}`);

  console.log('\n=== 3. Admin approves the application through the dashboard UI ===');
  await studentLogout();
  await evaluate(`window.__uc.byText('nav button', 'Login').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Student Login'), 15000)`);
  await evaluate(`window.__uc.byText('button', 'Admin Portal Login').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Admin Authentication'), 15000)`);
  await evaluate(`
    window.__uc.setValue('input[type=email]', ${JSON.stringify(ADMIN.email)});
    window.__uc.setValue('input[type=password]', ${JSON.stringify(ADMIN.password)});
    true;
  `);
  await evaluate(`window.__uc.byText('button', 'Authenticate Admin Session').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('ADMIN PORTAL'), 30000)`);

  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('aside button', 'Applications')), 15000)`);
  await evaluate(`window.__uc.byText('aside button', 'Applications').click(); true`);
  await evaluate(`window.__uc.waitFor(() => Boolean(document.querySelector('input[placeholder="Search name, ID, mobile, email..."]')), 20000)`);
  await evaluate(`window.__uc.setValue('input[placeholder="Search name, ID, mobile, email..."]', ${JSON.stringify(applicationId)}); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes(${JSON.stringify(applicationId || '')}), 20000)`);
  await evaluate(`window.__uc.waitFor(() => Boolean(document.querySelector('button[title="Approve Application"]')), 20000)`);
  await evaluate(`document.querySelector('button[title="Approve Application"]').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('Confirm Application Approval'), 15000)`);
  await evaluate(`window.__uc.byText('button', 'Confirm Approval').click(); true`);
  await evaluate(`window.__uc.waitFor(() => document.body.innerText.includes('approved successfully'), 20000)`);
  check('admin approval is confirmed in the UI', true, applicationId);

  // The server-side sync should land the course on the student profile.
  let syncedCourse = null;
  await waitFor(async () => {
    syncedCourse = await profileCourseInDb();
    return syncedCourse === appliedCourse;
  }, 20000, 500).catch(() => {});
  check(
    'server sync wrote the approved course to users/{uid}.course',
    syncedCourse === appliedCourse,
    `db=${JSON.stringify(syncedCourse)} expected=${JSON.stringify(appliedCourse)}`
  );

  console.log('\n=== 4. Student profile now shows the approved course ===');
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('button', 'Sign Out Admin')), 20000)`);
  await evaluate(`window.__uc.byText('button', 'Sign Out Admin').click(); true`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Login')), 20000)`);

  await studentLogin();
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Student Dashboard')), 20000)`);
  await evaluate(`window.__uc.byText('nav button', 'Student Dashboard').click(); true`);
  await evaluate(`window.__uc.waitFor(() => window.__uc.profileCourse() === ${JSON.stringify(appliedCourse)}, 20000)`);
  const courseAfterApproval = await evaluate(`window.__uc.profileCourse()`);
  check('dashboard shows the approved course (not "Not Selected")', courseAfterApproval === appliedCourse, courseAfterApproval);

  console.log('\n=== 5. The course survives refresh + fresh login ===');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(async () => {
    try {
      return await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('#root'))`);
    } catch {
      return false; // navigation in flight, context not ready yet
    }
  }, 40000);
  await evaluate(`${PRELUDE}`);
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Student Dashboard')), 30000)`);
  await evaluate(`window.__uc.byText('nav button', 'Student Dashboard').click(); true`);
  await evaluate(`window.__uc.waitFor(() => window.__uc.profileCourse() === ${JSON.stringify(appliedCourse)}, 20000)`);
  check('course is still shown after a full page refresh', true);

  await studentLogout();
  await studentLogin();
  await evaluate(`window.__uc.waitFor(() => Boolean(window.__uc.byText('nav button', 'Student Dashboard')), 20000)`);
  await evaluate(`window.__uc.byText('nav button', 'Student Dashboard').click(); true`);
  await evaluate(`window.__uc.waitFor(() => window.__uc.profileCourse() === ${JSON.stringify(appliedCourse)}, 20000)`);
  check('course is still shown after logging out and back in', true);
  await studentLogout();

  if (pageErrors.length > 0) {
    info(`page exceptions observed: ${pageErrors.slice(0, 3).join(' | ')}`);
  }

  close();
  console.log(`\n${failures === 0 ? 'ALL COURSE FLOW UI CHECKS PASSED' : `${failures} COURSE FLOW UI CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
  return failures;
};

run()
  .catch((err) => {
    console.error('FAIL  course flow UI test crashed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    process.exit(process.exitCode ?? 0);
  });
