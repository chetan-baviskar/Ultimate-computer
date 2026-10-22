/**
 * Firebase Web SDK bootstrap for the EXISTING project `ultimate-computer-e2a91`.
 *
 * The configuration itself lives in src/config/firebaseConfig.js (shared with
 * the Node integration tests) â€” no second Firebase project and no second web
 * app were created for this integration. This module only adds the optional
 * per-environment overrides and creates the SDK instances.
 *
 * `import.meta.env?.X` is optional-chained on purpose: the same module is
 * imported by Node-based tests (server/test-student-auth.mjs), where
 * `import.meta.env` does not exist. Inside Vite it behaves as usual.
 *
 * Initialize is guarded so hot module replacement or a double import cannot
 * create a second app/auth instance.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig as baseConfig } from './firebaseConfig.js';

const env = import.meta.env || {};

/** Base config + optional VITE_FIREBASE_* overrides from .env. */
export const firebaseConfig = {
  ...baseConfig,
  apiKey: env.VITE_FIREBASE_API_KEY || baseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || baseConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || baseConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || baseConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || baseConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || baseConfig.appId
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/** Firebase Authentication instance used for student sign-up/in/out/reset. */
export const auth = getAuth(firebaseApp);
