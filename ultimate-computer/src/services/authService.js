/**
 * Student authentication â€” Firebase Authentication (email/password) plus the
 * Ultimate Computer API for everything that needs the server.
 *
 * Responsibilities:
 *  - register / login / logout / password reset  â†’ Firebase Web SDK
 *    (the password NEVER travels through our Express server)
 *  - profile reads/writes                        â†’ Express API, authenticated
 *    with the Firebase ID token that `src/config/api.js` attaches automatically
 *
 * Every error is normalised by `toAuthError()` into `{ message, code, status }`
 * so the pages can show a precise, honest message. Nothing here ever reports a
 * success that did not happen.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider
} from 'firebase/auth';
import { auth } from '../config/firebase.js';
import { api } from '../config/api.js';
import { getToken, setToken, clearToken } from './tokenStore.js';

export { getToken, clearToken };

/** Firebase SDK error codes â†’ the app's own {code, status, message}. */
const FIREBASE_AUTH_ERRORS = {
  'auth/email-already-in-use': {
    code: 'EMAIL_EXISTS',
    status: 409,
    message: 'This email address is already registered. Please sign in instead.'
  },
  'auth/invalid-email': {
    code: 'INVALID_EMAIL',
    status: 400,
    message: 'Enter a valid email address.'
  },
  'auth/weak-password': {
    code: 'WEAK_PASSWORD',
    status: 400,
    message: 'Password should be at least 6 characters long.'
  },
  'auth/invalid-credential': {
    code: 'INVALID_CREDENTIALS',
    status: 401,
    message: 'Invalid email or password. Please verify your login credentials.'
  },
  'auth/invalid-login-credentials': {
    code: 'INVALID_CREDENTIALS',
    status: 401,
    message: 'Invalid email or password. Please verify your login credentials.'
  },
  'auth/wrong-password': {
    code: 'INVALID_CREDENTIALS',
    status: 401,
    message: 'Invalid email or password. Please verify your login credentials.'
  },
  'auth/user-not-found': {
    code: 'USER_NOT_FOUND',
    status: 401,
    message: 'No sign-in account exists for this email address.'
  },
  'auth/user-disabled': {
    code: 'USER_DISABLED',
    status: 403,
    message: 'This account has been disabled. Please contact the office.'
  },
  'auth/too-many-requests': {
    code: 'TOO_MANY_REQUESTS',
    status: 429,
    message: 'Too many attempts. Please wait a minute and try again.'
  },
  'auth/network-request-failed': {
    code: 'NETWORK_ERROR',
    status: 0,
    message: 'Network connection error. Please check your internet connection.'
  },
  'auth/requires-recent-login': {
    code: 'RECENT_LOGIN_REQUIRED',
    status: 401,
    message: 'For security, please sign in again before changing your password.'
  },
  'auth/operation-not-allowed': {
    code: 'AUTH_PROVIDER_DISABLED',
    status: 503,
    message: 'Email/password sign-in is disabled for this project. Please contact the office.'
  },
  'auth/internal-error': {
    code: 'AUTH_INTERNAL_ERROR',
    status: 500,
    message: 'The sign-in service could not complete the request. Please try again.'
  }
};

const isFirebaseAuthError = (error) => String(error?.code || '').startsWith('auth/');

/**
 * Normalises Firebase SDK errors and passes API/network errors through
 * untouched, so callers always get `{ message, code, status }`.
 */
export const toAuthError = (error) => {
  if (!error) return new Error('An unexpected authentication error occurred.');

  if (isFirebaseAuthError(error)) {
    const mapped = FIREBASE_AUTH_ERRORS[error.code];
    const normalised = new Error(
      mapped?.message || error.message || 'Authentication failed. Please try again.'
    );
    normalised.code = mapped?.code || 'AUTH_ERROR';
    normalised.status = mapped?.status ?? 0;
    return normalised;
  }

  // API errors already carry message/code/status
  if (typeof error.message === 'string') return error;
  const fallback = new Error('Authentication failed. Please try again.');
  fallback.code = 'AUTH_ERROR';
  fallback.status = error.status ?? 0;
  return fallback;
};

/**
 * Registers a new STUDENT account.
 *
 * Step 1 â€” Firebase Authentication creates the user (email/password).
 * Step 2 â€” the API creates the Firestore profile at users/{uid}, using the
 *          verified Firebase UID from the ID token. The role is fixed to
 *          'student' by the server; nothing here can request another role.
 * Step 3 â€” if step 2 fails, the user created in step 1 is rolled back so no
 *          half-registered account is left behind. If even the rollback fails,
 *          registering again with the same credentials RESUMES and completes
 *          the profile instead of duplicating anything.
 *
 * @returns {Promise<object>} the created profile
 */
export const register = async ({ email, password, fullName, mobile, course = '' }) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  let credential = null;
  let createdFresh = false;

  try {
    credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    createdFresh = true;
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') throw toAuthError(error);

    // The address already has a sign-in account. It is either a duplicate
    // registration, or an earlier attempt whose profile write failed.
    // Prove which by signing in with the SAME password just entered â€” only the
    // legitimate owner of that account can do that.
    try {
      credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch {
      throw toAuthError(error); // wrong password on an existing account â†’ EMAIL_EXISTS
    }

    const existingProfile = await fetchCurrentUser().catch(() => null);
    if (existingProfile) {
      // Fully registered already â€” a genuine duplicate.
      await signOut(auth).catch(() => {});
      clearToken();
      throw toAuthError({ code: 'auth/email-already-in-use' });
    }
    // Profile missing â†’ resume the interrupted registration below.
    console.warn('[auth] Resuming an interrupted registration for', cleanEmail);
  }

  try {
    const data = await api.post('/api/auth/register', { fullName, mobile, course });
    setToken(await credential.user.getIdToken());
    return data.user;
  } catch (error) {
    // Partial failure: remove ONLY the account this attempt just created (it
    // has no profile and no data yet) so the email is free to retry.
    if (createdFresh) {
      try {
        await credential.user.delete();
      } catch (rollbackError) {
        console.warn(
          '[auth] Registration rollback failed (retry will resume):',
          rollbackError?.message
        );
      }
      clearToken();
    }
    throw toAuthError(error);
  }
};

/**
 * Logs in with email + password.
 * The session is a Firebase Authentication session; the returned profile comes
 * from the API after the ID token has been verified server-side.
 *
 * A failed login leaves NO session behind (the Firebase user is signed out
 * again if the API could not complete the login).
 */
export const login = async (email, password) => {
  const cleanEmail = String(email || '').trim().toLowerCase();

  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  } catch (error) {
    // A rejected attempt must never leave an older session behind.
    if (auth.currentUser) await signOut(auth).catch(() => {});
    clearToken();
    throw toAuthError(error);
  }

  try {
    const data = await api.post('/api/auth/login', {});
    setToken(await credential.user.getIdToken());
    return data.user;
  } catch (error) {
    await signOut(auth).catch(() => {});
    clearToken();
    throw toAuthError(error);
  }
};

/**
 * Fetches the profile for the current Firebase session.
 * Returns null when there is no session, when the session is no longer valid
 * (401), or when the account has no profile yet (409). Network/server errors
 * are re-thrown so callers can distinguish "logged out" from "backend down".
 */
export const fetchCurrentUser = async () => {
  if (!auth.currentUser && !getToken()) return null;
  try {
    return await api.get('/api/auth/me');
  } catch (error) {
    if (error.status === 401) {
      clearToken();
      if (auth.currentUser) await signOut(auth).catch(() => {});
      return null;
    }
    if (error.status === 409) return null; // authenticated, but profile missing
    throw error;
  }
};

/**
 * Signs out of Firebase Authentication (the ID token is revoked on the client
 * immediately and expires server-side) and clears the stored token.
 */
export const logout = async () => {
  clearToken();
  try {
    await signOut(auth);
  } catch (error) {
    console.warn('[auth] Sign-out failed:', error?.message);
  }
  return true;
};

/**
 * Sends a Firebase password-reset email to the given address.
 * Firebase answers with an error when no account exists for the address â€”
 * callers use that to offer the account-migration path instead of pretending
 * an email was sent.
 */
export const sendPasswordReset = async (email) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw toAuthError({ code: 'auth/invalid-email' });
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return true;
  } catch (error) {
    throw toAuthError(error);
  }
};

/**
 * Changes the current user's password.
 * Firebase RE-verifies the current password first (re-authentication), then
 * applies the new one â€” the server is never asked to trust an unverified
 * password change.
 */
export const changePassword = async (currentPassword, newPassword) => {
  const user = auth.currentUser;
  if (!user) {
    const error = new Error('You are no longer signed in. Please sign in again.');
    error.code = 'NOT_AUTHENTICATED';
    error.status = 401;
    throw error;
  }
  if (!currentPassword) {
    const error = new Error('Enter your current password to verify the change.');
    error.code = 'WRONG_CURRENT_PASSWORD';
    error.status = 401;
    throw error;
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  } catch (error) {
    const normalised = toAuthError(error);
    if (['INVALID_CREDENTIALS', 'USER_NOT_FOUND'].includes(normalised.code)) {
      normalised.code = 'WRONG_CURRENT_PASSWORD';
      normalised.message = 'Current password is incorrect.';
    }
    throw normalised;
  }

  try {
    await updatePassword(user, newPassword);
    return true;
  } catch (error) {
    throw toAuthError(error);
  }
};

/**
 * Asks the API whether an email has NO Firebase Authentication user yet â€”
 * i.e. whether it is likely an account created before the upgrade that still
 * needs migrating. Read-only; changes nothing.
 */
export const getMigrationStatus = async (email) => {
  return api.post('/api/auth/migration-status', { email });
};

/**
 * Files an account-migration request for a pre-upgrade account.
 * The office verifies the request manually â€” no password is reset and no
 * account is created automatically.
 */
export const requestAccountMigration = async ({ email, fullName, mobile }) => {
  return api.post('/api/auth/migration-requests', { email, fullName, mobile });
};
