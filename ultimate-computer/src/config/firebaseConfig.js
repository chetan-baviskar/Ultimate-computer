/**
 * Firebase Web SDK configuration — single source of truth.
 *
 * EXISTING project configuration for `ultimate-computer-e2a91` (web app
 * `ultimate-computer-web`). It was read back from the Firebase Management API
 * rather than re-created, so the app keeps using the project's own web app and
 * API key.
 *
 * This file is intentionally free of Vite-only syntax (`import.meta.env`) so it
 * can also be imported by Node-based integration tests
 * (see server/test-student-auth.mjs). Runtime overrides live in
 * src/config/firebase.js.
 *
 * A Firebase API key is PUBLIC by design: it only identifies the project and
 * grants no data access — Firebase Authentication, the server's ID-token
 * verification and Firestore access rules are what protect the data.
 * https://firebase.google.com/docs/projects/api-keys
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBrt5JPAupB4NITG4z_y82AQKlIuFn6rhA',
  authDomain: 'ultimate-computer-e2a91.firebaseapp.com',
  projectId: 'ultimate-computer-e2a91',
  storageBucket: 'ultimate-computer-e2a91.firebasestorage.app',
  messagingSenderId: '553442012494',
  appId: '1:553442012494:web:1a89fa4b2e090bd444421f'
};

export default firebaseConfig;
