/**
 * Session token storage (localStorage) + the async token resolver used by the
 * API wrapper.
 *
 * Two token kinds can exist here:
 *  - a Firebase Authentication ID token (students â€” the live session, always
 *    preferred and refreshed on demand by `resolveAuthToken`), and
 *  - a token handed back by the API for older/legacy flows.
 *
 * Shared by src/config/api.js and src/services/authService.js â€”
 * kept in its own module to avoid circular imports.
 */
import { auth } from '../config/firebase.js';

const TOKEN_KEY = 'uc_auth_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode etc.) â€” session just won't persist
  }
};

export const clearToken = () => setToken(null);

/**
 * Token that should be attached to the next API request.
 *
 * Prefers the LIVE Firebase ID token of the signed-in user (Firebase refreshes
 * it automatically when it is about to expire), and falls back to the stored
 * token for flows where the API itself handed one out.
 *
 * @returns {Promise<string|null>}
 */
export const resolveAuthToken = async () => {
  try {
    const user = auth.currentUser;
    if (user) {
      // getIdToken() returns the cached token while it is still valid and
      // refreshes it transparently once it has expired (1h lifetime).
      return await user.getIdToken();
    }
  } catch (error) {
    console.warn('[auth] Could not resolve Firebase ID token:', error?.message);
  }
  return getToken();
};
