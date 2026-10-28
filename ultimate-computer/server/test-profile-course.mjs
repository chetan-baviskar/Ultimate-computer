#!/usr/bin/env node
/**
 * Approval → student profile course synchronisation tests.
 *
 * Drives the REAL Express API over HTTP and independently verifies the stored
 * `users/{uid}` documents in Cloud Firestore with the Admin SDK. Nothing is
 * mocked.
 *
 * Covered:
 *   - applying (Pending) never changes the student's profile course
 *   - admin approval writes the approved course onto the student's profile
 *     (matched by the VERIFIED Firebase UID, never by name) and it survives a
 *     re-read of the profile — the same read a refresh / new login performs
 *   - Pending / Rejected applications never contribute a course
 *   - multiple applications: the NEWEST Approved application's course wins
 *   - un-approving (Approved → Rejected) clears a course this application set
 *   - a guest application (no uid) is matched to a profile by e-mail
 *   - unrelated profile fields are never touched
 *
 * Usage:  node test-profile-course.mjs     (API must be running on :5001)
 *
 * The suite only creates its own applications and deletes exactly those
 * documents at the end. It restores the course value it found on every
 * profile it touches, so pre-existing user data is preserved.
 */

import {
  api,
  check,
  info,
  report,
  adminResources,
  ensureAdminAccount,
  ensureStudentAccount,
  signInWeb,
  waitForApi,
  API
} from './test-support.mjs';

const stamp = Date.now();
const ADMIN = { email: `admin.csync.${stamp}@example.com`, password: `Admin#Csync${stamp}` };
const STUDENT = { email: `student.csync.${stamp}@example.com`, password: `Student#Csync${stamp}` };
/** E-mail a GUEST application is submitted with — belongs to a second student. */
const GUEST_OWNER = { email: `guestowner.csync.${stamp}@example.com`, password: `Guest#Csync${stamp}` };

/** Every document id this run created — removed at the end (own records only). */
const createdDocIds = [];
/** { uid, original } of every profile this run modified — restored at the end. */
const touchedProfiles = [];

const applicationBody = (studentEmail, overrides = {}) => ({
  fullName: 'Course Sync Tester',
  email: studentEmail,
  mobile: '9876543210',
  dateOfBirth: '2004-01-01',
  gender: 'Male',
  address: '12, Test Lane',
  city: 'Pune',
  education: '12th Pass',
  courseId: 'web-development',
  courseName: 'Web Development',
  previousComputerKnowledge: 'Beginner',
  preferredContactMethod: 'Phone',
  additionalMessage: 'Profile course sync test.',
  courseFee: '[Fee Amount - Contact Office]',
  registrationFee: '[Included]',
  totalFee: '[Total Fee]',
  status: 'Approved', // must be ignored on submission
  ...overrides
});

/** Reads what REALLY is stored in Firestore for this profile. */
const storedProfile = async (uid) => {
  const { db } = adminResources();
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
};

/** Remembers the original course so cleanup can put it back. */
const rememberProfile = async (uid) => {
  if (touchedProfiles.some((p) => p.uid === uid)) return;
  const profile = await storedProfile(uid);
  touchedProfiles.push({ uid, original: profile?.course ?? '' });
};

const cleanup = async () => {
  const { db } = adminResources();
  await Promise.all(
    createdDocIds.map((id) => db.collection('admission_applications').doc(id).delete().catch(() => {}))
  );
  await Promise.all(
    touchedProfiles.map(({ uid, original }) =>
      db.collection('users').doc(uid).update({ course: original }).catch(() => {})
    )
  );
  info(`cleaned up ${createdDocIds.length} test application document(s)`);
  info(`restored course on ${touchedProfiles.length} test profile(s)`);
};

const run = async () => {
  console.log(`Ultimate Computer — profile course sync tests against ${API}`);

  const up = await waitForApi();
  if (!up) {
    console.log(`FAIL  API is not answering at ${API}`);
    return report();
  }

  await ensureAdminAccount(ADMIN.email, ADMIN.password);
  await ensureStudentAccount(STUDENT.email, STUDENT.password);
  await ensureStudentAccount(GUEST_OWNER.email, GUEST_OWNER.password);

  const adminToken = await signInWeb(ADMIN.email, ADMIN.password);
  const studentToken = await signInWeb(STUDENT.email, STUDENT.password);
  const guestOwnerToken = await signInWeb(GUEST_OWNER.email, GUEST_OWNER.password);

  const uidStudent = (await api('GET', '/api/auth/me', { token: studentToken })).data?.uid;
  const uidGuestOwner = (await api('GET', '/api/auth/me', { token: guestOwnerToken })).data?.uid;
  check('student sessions and uids resolved', Boolean(uidStudent && uidGuestOwner),
    `uidStudent=${uidStudent} uidGuestOwner=${uidGuestOwner}`);

  await rememberProfile(uidStudent);
  await rememberProfile(uidGuestOwner);

  /** Signs out the student, signs in again and re-reads the profile —
   *  exactly what a page refresh / new login performs. */
  const freshProfileAfterRelogin = async () => {
    const token = await signInWeb(STUDENT.email, STUDENT.password);
    const res = await api('GET', '/api/auth/me', { token });
    return res.data;
  };

  const submit = async (token, body) => {
    const res = await api('POST', '/api/applications', { body, token });
    if (res.data?.id) createdDocIds.push(res.data.id);
    return res;
  };

  try {
    /* ------------------------------------------------- 1. Pending is inert */
    const pending = await submit(studentToken, applicationBody(STUDENT.email));
    check('student application → 201', pending.status === 201 && Boolean(pending.data?.id),
      `status=${pending.status}`);

    const afterSubmit = await storedProfile(uidStudent);
    check('submitting (Pending) does NOT set the profile course',
      String(afterSubmit?.course || '') === '', `course="${afterSubmit?.course}"`);

    /* ------------------------------------------- 2. approval writes course */
    const approve = await api('PATCH', `/api/applications/${pending.data.id}`, {
      token: adminToken,
      body: { status: 'Approved', adminRemarks: 'Course sync test approval' }
    });
    check('admin approves the application → 200',
      approve.status === 200 && approve.data?.status === 'Approved',
      `status=${approve.status}`);

    const approvedProfile = await storedProfile(uidStudent);
    check('profile course now holds the approved course name',
      approvedProfile?.course === 'Web Development',
      `course="${approvedProfile?.course}"`);

    const reloaded = await freshProfileAfterRelogin();
    check('course survives a fresh login / profile reload (refresh case)',
      reloaded?.course === 'Web Development', `course="${reloaded?.course}"`);

    check('identity is matched by UID — other profile fields untouched',
      approvedProfile?.email === STUDENT.email.toLowerCase()
      && approvedProfile?.role === 'student'
      && approvedProfile?.uid === uidStudent,
      `email=${approvedProfile?.email} role=${approvedProfile?.role}`);

    /* ------------------------------------- 3. pending app never overwrites */
    const second = await submit(studentToken, applicationBody(STUDENT.email, {
      courseId: 'graphic-design',
      courseName: 'Graphic Design & Digital Skills'
    }));
    check('second (Pending) application → 201', second.status === 201, `status=${second.status}`);

    const afterSecondPending = await storedProfile(uidStudent);
    check('a NEW Pending application does not change the approved course',
      afterSecondPending?.course === 'Web Development',
      `course="${afterSecondPending?.course}"`);

    /* ---------------------------------- 4. newest submitted Approved wins
       Both dashboards order applications newest-first by createdAt, so the
       effective course is the course of the newest Approved application. */
    const tally = await submit(studentToken, applicationBody(STUDENT.email, {
      courseId: 'tally-prime',
      courseName: 'Tally Prime with GST Certification'
    }));
    const tallyApproved = await api('PATCH', `/api/applications/${tally.data.id}`, {
      token: adminToken,
      body: { status: 'Approved' }
    });
    check('approving a newer application moves the profile course to it',
      tallyApproved.status === 200
      && (await storedProfile(uidStudent))?.course === 'Tally Prime with GST Certification',
      `course="${(await storedProfile(uidStudent))?.course}"`);

    const python = await submit(studentToken, applicationBody(STUDENT.email, {
      courseId: 'python-data-science',
      courseName: 'Python Data Science & AI'
    }));
    const pythonApproved = await api('PATCH', `/api/applications/${python.data.id}`, {
      token: adminToken,
      body: { status: 'Approved' }
    });
    check('approving the NEWEST application moves the profile course to it',
      pythonApproved.status === 200
      && (await storedProfile(uidStudent))?.course === 'Python Data Science & AI',
      `course="${(await storedProfile(uidStudent))?.course}"`);

    /* ------------------------------- 5. rejection never sets a course */
    const rejected = await submit(studentToken, applicationBody(STUDENT.email, {
      courseId: 'computer-hardware',
      courseName: 'Computer Hardware & Networking'
    }));
    const rejectIt = await api('PATCH', `/api/applications/${rejected.data.id}`, {
      token: adminToken,
      body: { status: 'Rejected', adminRemarks: 'Course sync test rejection' }
    });
    check('a REJECTED application does not contribute a course',
      rejectIt.status === 200
      && (await storedProfile(uidStudent))?.course === 'Python Data Science & AI',
      `course="${(await storedProfile(uidStudent))?.course}"`);

    /* ------------------------------- 6. un-approval walks the course back */
    const unapprovePython = await api('PATCH', `/api/applications/${python.data.id}`, {
      token: adminToken,
      body: { status: 'Rejected', adminRemarks: 'Un-approved for sync test' }
    });
    const afterUnapprove = await storedProfile(uidStudent);
    check('un-approving the newest application falls back to the older approved one',
      unapprovePython.status === 200 && afterUnapprove?.course === 'Tally Prime with GST Certification',
      `course="${afterUnapprove?.course}"`);

    const unapproveTally = await api('PATCH', `/api/applications/${tally.data.id}`, {
      token: adminToken,
      body: { status: 'Rejected', adminRemarks: 'Un-approved for sync test' }
    });
    const afterSecondUnapprove = await storedProfile(uidStudent);
    check('the remaining approved application still provides its course',
      unapproveTally.status === 200 && afterSecondUnapprove?.course === 'Web Development',
      `course="${afterSecondUnapprove?.course}"`);

    const unapproveWebDev = await api('PATCH', `/api/applications/${pending.data.id}`, {
      token: adminToken,
      body: { status: 'Rejected', adminRemarks: 'Un-approved for sync test' }
    });
    const afterAllUnapproved = await storedProfile(uidStudent);
    check('with no approved application left the course is cleared (not stale)',
      unapproveWebDev.status === 200 && String(afterAllUnapproved?.course || '') === '',
      `course="${afterAllUnapproved?.course}"`);

    /* --------------------------------- 7. guest application via e-mail */
    const guestApp = await api('POST', '/api/applications', {
      body: applicationBody(GUEST_OWNER.email, {
        courseId: 'office-automation',
        courseName: 'Office Automation & CCC'
      })
    });
    if (guestApp.data?.id) createdDocIds.push(guestApp.data.id);
    check('guest application (no session) → 201', guestApp.status === 201, `status=${guestApp.status}`);

    const guestApprove = await api('PATCH', `/api/applications/${guestApp.data.id}`, {
      token: adminToken,
      body: { status: 'Approved' }
    });
    const guestProfile = await storedProfile(uidGuestOwner);
    check('a guest application is matched to its owner by E-MAIL (not name)',
      guestApprove.status === 200 && guestProfile?.course === 'Office Automation & CCC',
      `course="${guestProfile?.course}"`);

    /* --------------------------------- 8. student cannot trigger a write */
    const studentPatch = await api('PATCH', `/api/applications/${pending.data.id}`, {
      token: studentToken,
      body: { status: 'Approved' }
    });
    check('students still cannot approve (403) — sync stays admin-only',
      studentPatch.status === 403, `status=${studentPatch.status}`);

    const studentOwnProfile = (await api('GET', '/api/users/' + uidStudent, { token: studentToken })).data;
    check('failed student approval left the profile unchanged',
      String(studentOwnProfile?.course || '') === (await storedProfile(uidStudent))?.course,
      `course="${studentOwnProfile?.course}"`);
  } finally {
    await cleanup();
  }

  return report();
};

run().catch(async (err) => {
  console.error('Unexpected test failure:', err);
  await cleanup().catch(() => {});
  return report();
});
