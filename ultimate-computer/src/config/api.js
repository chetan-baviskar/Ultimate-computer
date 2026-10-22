import { resolveAuthToken } from '../services/tokenStore.js';

/**
 * Base URL for the Ultimate Computer API server (Express).
 * Set VITE_API_URL in .env for production (e.g. https://your-api.onrender.com).
 * In development, requests to /api/* are proxied by Vite to http://localhost:5001
 * (see server.proxy in vite.config.js).
 *
 * Resolution order:
 *   1. Vite's import.meta.env (browser build)
 *   2. process.env.VITE_API_URL (Node — used by server/test-student-auth.mjs,
 *      which imports this same service directly against a live API)
 *   3. '' — relative /api paths, proxied by Vite in development
 */
const RAW_BASE =
  import.meta.env?.VITE_API_URL ||
  globalThis.process?.env?.VITE_API_URL ||
  '';

export const API_BASE = RAW_BASE.replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 12000;

/**
 * Thin fetch wrapper for the API server.
 * - Prefixes API_BASE (or relative /api in dev, proxied by Vite)
 * - Parses JSON errors into thrown Error objects
 * - Supports an AbortController timeout so the UI can fall back to localStorage
 *   if the API is unreachable
 *
 * @returns {Promise<any>} parsed JSON response
 * @throws {Error} on network failure, timeout, or non-2xx status
 */
export const apiFetch = async (path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Attach the current Firebase ID token (if signed in) so protected API
  // routes can verify the caller with the Firebase Admin SDK. The token is
  // resolved asynchronously: Firebase refreshes it when it has expired.
  const token = await resolveAuthToken();

  try {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {})
        },
        ...options,
        signal: options.signal || controller.signal
      });
    } catch (fetchError) {
      // Caller-initiated abort (component unmounted) â€” rethrow untouched
      if (options.signal?.aborted) throw fetchError;

      const timedOut = fetchError?.name === 'AbortError';
      const error = new Error(
        timedOut
          ? 'The request timed out. The API server may not be responding.'
          : 'Network request failed. Check your connection and that the API server is running.'
      );
      error.code = timedOut ? 'TIMEOUT' : 'NETWORK_ERROR';
      error.status = 0;
      throw error;
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error || `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      // Machine-readable code from the API (INVALID_CREDENTIALS,
      // DATA_LAYER_UNAVAILABLE, EMAIL_EXISTS, ...) â€” the pages switch on this
      // to pick their message.
      if (data?.code) error.code = data.code;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Convenience helpers matching REST semantics.
 */
export const api = {
  get: (path, options) => apiFetch(path, { ...options, method: 'GET' }),
  post: (path, body, options) =>
    apiFetch(path, { ...options, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (path, body, options) =>
    apiFetch(path, { ...options, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: (path, body, options) =>
    apiFetch(path, { ...options, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: (path, options) => apiFetch(path, { ...options, method: 'DELETE' })
};

/**
 * Polling-based subscription helper.
 * The data layer used to expose real-time listeners; the REST API
 * cannot push updates, so this simulates a subscription: fetch immediately, then
 * re-fetch on an interval, invoking the callback each time data changes.
 *
 * @param {() => Promise<any>} fetcher - async function returning the latest data
 * @param {(data: any) => void} callback - called with each fresh result
 * @param {object} options - { intervalMs = 10000, onError }
 * @returns {() => void} unsubscribe function (same contract as onSnapshot)
 */
export const subscribeWithPolling = (fetcher, callback, { intervalMs = 10000, onError } = {}) => {
  let cancelled = false;
  let lastJson = null;

  const tick = async () => {
    if (cancelled) return;
    try {
      const data = await fetcher();
      if (cancelled) return;

      // Only emit when the payload actually changed to avoid pointless re-renders
      const json = JSON.stringify(data);
      if (json !== lastJson) {
        lastJson = json;
        callback(data);
      }
    } catch (error) {
      if (cancelled) return;
      if (onError) onError(error);
      else console.warn('[api] subscription fetch error:', error.message);
    }
  };

  tick();
  const timer = setInterval(tick, intervalMs);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
};
