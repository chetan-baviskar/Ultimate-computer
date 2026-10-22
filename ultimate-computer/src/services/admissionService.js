import { api, subscribeWithPolling } from '../config/api';

const POLL_INTERVAL_MS = 15000;

/**
 * Generates a unique Application ID in format: UC-2026-XXXXXX
 * (kept client-side so the user sees the ID immediately;
 *  the API accepts it and only generates one if missing)
 */
export const generateApplicationId = () => {
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `UC-2026-${randomChars}`;
};

/**
 * Checks if a student already has an active (non-rejected) application
 * for a specific course (GET /api/applications/check)
 */
export const checkDuplicateApplication = async (studentUid, courseId, email = '') => {
  if (!courseId || (!studentUid && !email)) return null;
  try {
    // The API decides the identity: a signed-in applicant is matched on the
    // Firebase UID + e-mail of the VERIFIED session (the studentUid argument
    // is then ignored server-side), while a guest is matched on the e-mail
    // they are about to submit with.
    const params = new URLSearchParams({ courseId });
    if (studentUid) params.set('studentUid', studentUid);
    if (email) params.set('email', email);
    const activeApp = await api.get(`/api/applications/check?${params.toString()}`);
    return activeApp || null;
  } catch (error) {
    console.warn("Check duplicate application notice:", error);
    return null;
  }
};

/**
 * Submits a new admission application (POST /api/applications)
 */
export const submitAdmissionApplication = async (studentUid, formData, courseObj) => {
  const appId = generateApplicationId();

  const payload = {
    applicationId: appId,
    studentUid: studentUid || 'guest-applicant',
    fullName: formData.fullName,
    email: formData.email,
    mobile: formData.mobile,
    dateOfBirth: formData.dateOfBirth || '',
    gender: formData.gender || 'Male',
    address: formData.address,
    city: formData.city || '',
    education: formData.education || '',
    courseId: courseObj.id,
    courseName: courseObj.courseName || courseObj.title,
    previousComputerKnowledge: formData.previousComputerKnowledge || 'Beginner',
    preferredContactMethod: formData.preferredContactMethod || 'Phone',
    additionalMessage: formData.additionalMessage || '',
    courseFee: courseObj.fee || '[Fee Placeholder]',
    registrationFee: courseObj.registrationFee || '[Registration Placeholder]',
    totalFee: courseObj.totalFee || '[Total Fee Placeholder]',
    status: 'Pending',
    adminRemarks: ''
  };

  console.log("[AdmissionService] Submitting application:", {
    appId,
    studentUid,
    email: formData.email,
    courseName: payload.courseName
  });

  let saved;
  try {
    saved = await api.post('/api/applications', payload);
    console.log("[AdmissionService] Successfully saved. Application ID:", saved.applicationId);
  } catch (error) {
    console.error("[AdmissionService] API submission error:", error);
    throw error;
  }

  // Backup cache in localStorage for offline fallback
  try {
    const existing = JSON.parse(localStorage.getItem('uc_applications') || '[]');
    const filtered = existing.filter(a => a.applicationId !== saved.applicationId);
    filtered.push(saved);
    localStorage.setItem('uc_applications', JSON.stringify(filtered));
  } catch (e) {
    console.warn("LocalStorage cache error:", e);
  }

  return saved;
};

/**
 * Live-updating list of a student's own applications
 * (Student Dashboard). Matches by studentUid OR email, merged and
 * de-duplicated, newest first. Returns an unsubscribe function.
 */
export const subscribeUserApplications = (studentUid, studentEmail, callback) => {
  if (!studentUid && !studentEmail) {
    callback([]);
    return () => { };
  }

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (studentUid) params.set('studentUid', studentUid);
    if (studentEmail) params.set('email', studentEmail);
    return params.toString();
  };

  return subscribeWithPolling(
    async () => {
      const apps = await api.get(`/api/applications?${buildQueryString()}`);

      // De-duplicate by document id and applicationId
      const seen = new Set();
      const merged = [];
      (apps || []).forEach(app => {
        const key = app.id || app.applicationId;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(app);
        }
      });

      merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return merged;
    },
    callback,
    {
      intervalMs: POLL_INTERVAL_MS,
      onError: (error) => {
        console.error('[AdmissionService] Applications listener error:', error);
      }
    }
  );
};

/**
 * One-time fetch for student's own applications (kept for backward-compat)
 */
export const getUserApplications = async (studentUid, studentEmail = '') => {
  console.log("[AdmissionService] Fetching applications for UID:", studentUid, "Email:", studentEmail);
  if (!studentUid && !studentEmail) return [];

  let apps = [];

  try {
    const params = new URLSearchParams();
    if (studentUid) params.set('studentUid', studentUid);
    if (studentEmail) params.set('email', studentEmail);
    apps = await api.get(`/api/applications?${params.toString()}`);
  } catch (error) {
    console.error("[AdmissionService] Error fetching applications from API:", error);
  }

  // If the API returned 0 or is unreachable, check localStorage cache
  if (!apps || apps.length === 0) {
    try {
      const local = JSON.parse(localStorage.getItem('uc_applications') || '[]');
      apps = local.filter(a =>
        (studentUid && a.studentUid === studentUid) ||
        (studentEmail && a.email === studentEmail)
      );
    } catch (e) {
      console.warn("LocalStorage fetch error:", e);
    }
  }

  console.log("[AdmissionService] Total applications retrieved:", apps.length);
  return (apps || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

/**
 * Live-updating list of ALL applications (Admin Dashboard).
 * `onError` (optional) is invoked whenever a poll fails, so the dashboard can
 * say the data is unavailable instead of silently showing an empty list.
 */
export const subscribeApplications = (callback, onError) => {
  return subscribeWithPolling(
    async () => {
      const apps = await api.get('/api/applications');
      return [...(apps || [])].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
    },
    callback,
    {
      intervalMs: POLL_INTERVAL_MS,
      onError: (error) => {
        console.warn("Real-time applications listener notice:", error);
        if (onError) onError(error);
      }
    }
  );
};

/**
 * Live-updating list of registered student profiles (Admin Dashboard).
 * `onError` (optional) surfaces fetch failures to the dashboard UI.
 */
export const subscribeStudentUsers = (callback, onError) => {
  return subscribeWithPolling(
    async () => {
      const students = await api.get('/api/users/students');
      return students || [];
    },
    callback,
    {
      intervalMs: POLL_INTERVAL_MS,
      onError: (error) => {
        console.warn("Real-time student users listener notice:", error);
        callback([]);
        if (onError) onError(error);
      }
    }
  );
};

/**
 * Updates application status and admin remarks (Admin only)
 */
export const updateApplicationStatus = async (docId, status, adminRemarks = '') => {
  if (!docId) return false;
  try {
    await api.patch(`/api/applications/${encodeURIComponent(docId)}`, { status, adminRemarks });
    return true;
  } catch (error) {
    console.error("updateApplicationStatus error:", error);
    throw error;
  }
};

/**
 * Deletes an application (Admin only)
 */
export const deleteApplication = async (docId) => {
  if (!docId) return false;
  try {
    await api.delete(`/api/applications/${encodeURIComponent(docId)}`);
    return true;
  } catch (error) {
    console.error("deleteApplication error:", error);
    throw error;
  }
};
