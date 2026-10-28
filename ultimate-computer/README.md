# Ultimate Computer — Website

React + Vite + Tailwind frontend with a Node/Express API.
**No database is connected yet** — the previous MongoDB/Mongoose integration
has been removed, and Firebase has not been added.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4 |
| API server | Express 5 (`server/`) |
| Data + Auth | **not wired up yet** — see "Data layer status" |

## Data layer status

The API runs in a transitional, database-free mode:

| Route | Behaviour |
|---|---|
| `GET /api/health` | `200 {"status":"ok","service":"ultimate-computer-api","dataLayer":"bundled"}` |
| `GET /api/courses` | serves the bundled catalogue (`server/src/data/coursesData.js`) |
| `POST /api/courses/seed` | honest no-op (`{"seeded":false,"bundled":true}`) |
| everything else (auth, users, enquiries, applications, course writes) | `503 {"code":"DATA_LAYER_UNAVAILABLE"}` |

Nothing is faked in the meantime: no password is accepted, no session token is
issued and no record is written. Login, registration, the admin dashboard and
the contact/admission forms simply report that the service is temporarily
unavailable until the next data store is connected.

The frontend keeps working for public pages: courses are rendered from
`src/data/coursesData.js` plus a `localStorage` cache, so Home/Courses/Fee
pages never go blank.

## Running locally

Terminal 1 — API server:

```bash
cd server
npm install
cp .env.example .env   # then fill in PORT, ALLOWED_ORIGINS (JWT_* / ADMIN_* reserved)
npm run dev            # http://localhost:5001
```

Terminal 2 — frontend:

```bash
npm install
npm run dev            # http://localhost:5173
```

In development the frontend proxies `/api/*` to `http://localhost:5001`
(see `server.proxy` in `vite.config.js`), so no `VITE_API_URL` is needed.

## Admin account

There is **no public way to create an admin** — not during registration
(`POST /api/auth/register` hard-codes `role: 'student'` server-side), not
through any profile update (`PATCH /api/users/:uid` only edits fullName and
mobile), and not through any frontend field.

Administrators are provisioned **server-side only**, by a local script that
requires `server/firebase-service-account.json` (the Firebase Admin SDK
credential) and is unreachable from a browser:

```bash
cd server
npm run provision:admin          # reads ADMIN_EMAIL / ADMIN_PASSWORD from server/.env
npm run provision:admin:check    # read-only verification
npm run provision:admin -- --email you@example.com   # a different address
npm run provision:admin -- --set-password            # rotate ADMIN_PASSWORD into Firebase Auth
```

The script (idempotent, never destructive) creates the Firebase Authentication
user when missing, writes the `users/{uid}` Firestore profile with
`role: 'admin'`, and sets the `admin: true` custom claim in the user's ID
tokens. It never deletes anything and never touches an existing password
unless you pass the explicit `--set-password` flag; an existing non-admin
profile is only promoted with the explicit `--grant-admin` flag. The initial
credentials live only in the git-ignored `server/.env` (`ADMIN_EMAIL` /
`ADMIN_PASSWORD`): the script reads them, passes the password straight to the
Firebase Admin SDK and never prints, stores, hard-codes or returns it — and no
public HTTP route can run the script.

Admin login itself uses the same Firebase email/password sign-in as students;
the API then verifies the ID token server-side and only grants access when the
stored profile role (or the Admin-SDK custom claim) says `admin`.

## Password resets

Self-service reset emails require an email delivery service (not configured).
The Forgot Password page directs students to the office; the admin reset route
(`PATCH /api/users/:uid/password`) is one of the routes waiting for a data
store.

## Environment variables

**Frontend (`.env`)** — see `.env.example`
- `VITE_API_URL` — leave empty in dev; in production set your deployed API base URL

**API server (`server/.env`)** — see `server/.env.example`
- `PORT` — API port (default 5001)
- `ALLOWED_ORIGINS` — comma-separated CORS origins (dev server + production
  frontend URL). **Any `localhost` / `127.0.0.1` port is always allowed**,
  because Vite bumps to 5174/5175/... when 5173 is busy.
- `JWT_SECRET` / `JWT_EXPIRES_IN` — reserved for the next auth integration
  (no route reads them yet). Generate a secret with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Administrator credentials are environment variables in `server/.env`
(`ADMIN_EMAIL`, `ADMIN_PASSWORD`) — that file is git-ignored and only empty
placeholders live in `server/.env.example`; the real values never appear in
committed files, in any route, or in the frontend bundle. They exist only so
the server-side provisioning script can create/verify the account — see
"Admin account" above.

> `server/.env` may still contain old `MONGODB_*` values. They are inert —
> nothing in the code reads them — and are left untouched so the connection
> string is not lost.

## Troubleshooting

### Every API call answering 503 after hours of uptime (Firestore channel rot)

Symptom: the API is running and `/api/health` says `ok`, but every Firestore-
backed route answers `503 DATA_LAYER_UNAVAILABLE` and the server log repeats
`16 UNAUTHENTICATED: Request had invalid authentication credentials...`.
This is the Admin SDK's gRPC/credential channel going permanently stale on
long-running Windows processes — it never recovers by itself; only re-creating
the Admin app does.

The server now heals itself: a watchdog (`server/src/config/firebase.js`)
probes Firestore every 5 minutes (`FIRESTORE_WATCHDOG_INTERVAL_MS` in
`server/.env`, `0` disables it) and, when the probe fails with a channel-level
error, deletes and re-initializes the Admin SDK app — exactly what a manual
restart used to do. Expect at most one watchdog interval of honest 503s while
it recovers; application-level failures (`PERMISSION_DENIED`, `NOT_FOUND`,
validation errors) never trigger a rebuild. Covered by
`server/test-firebase-recovery.mjs`.

### "Login service is temporarily unavailable" on both Student and Admin login

That message is shown when the login API returns a **5xx / unreachable
response**. The full chain is:

```
React form → apiFetch('/api/auth/login') → Vite proxy (/api → :5001)
          → Express
```

If the API process is not listening on `:5001`, Vite's proxy answers `500` and
the UI reports the service as unavailable — **the credentials are never even
checked.** So always start the API (`npm run server`) next to the frontend.

If the API *is* running, a login attempt answers
`503 DATA_LAYER_UNAVAILABLE` (expected until authentication is reconnected)
and the pages show their "temporarily unavailable" message.

### Port 5001 answers, but the *wrong* API (root cause of the 2026-10-15 outage)

The API was moved off the Express default `:5000` because another local project
(**Renuka Auto Parts**, `RenukaAutoParts/backend/src/server.js`) also runs on
`:5000`. On Windows this collision does **not** crash either server: Node sets
`SO_REUSEADDR`, so two (or five) Node servers can bind the same port and the OS
hands each incoming connection to one of them arbitrarily.

What happened: the Vite proxy forwarded every `/api/*` request to whichever
server won the socket — most often the *Renuka Auto Parts* API, which answered
in its own response shape. The login page maps any unrecognised 5xx to "Login
service is temporarily unavailable", while the real Ultimate Computer API
(which logged no requests at all) sat idle on the same port.

Quick check of who actually owns the port:

```bash
netstat -ano | findstr :5001            # should show OUR server
curl http://localhost:5001/api/health   # must return OUR payload ("service":"ultimate-computer-api")
```

If you ever see `{"status":"ok","service":"renuka-autoparts-api"}` or any other
foreign payload, another project grabbed the port — either stop it or pick a
free port and update `PORT` in `server/.env` **and** `server.proxy.target` in
`vite.config.js` together. The server performs this same self-check at boot and
exits with a `[FATAL]` message if it detects a foreign owner.

### Data layer: Cloud Firestore

Student profiles, the course catalogue, admission applications and contact
enquiries are served from Cloud Firestore (`GET /api/health` reports
`"dataLayer":"firestore"`). `GET /api/health/firestore` performs one read-only
probe and reports `200 {"status":"ok", ...}` when Firestore answers.

A small number of admin-only routes are **not** part of this migration and
still answer honestly with:

```json
{ "error": "This feature is temporarily unavailable while the backend data store is being migrated. Please try again later.", "code": "DATA_LAYER_UNAVAILABLE" }
```

Those routes are `POST /api/users`, `PATCH /api/users/:uid/password` and
`PATCH /api/auth/password`. Everything else either returns real data or a
real 400/401/403/404 — never a fake success.

### "Origin ... not allowed by CORS" on login

Vite takes the next free port when `5173` is already in use (5174, 5175, ...),
so the browser can be on a port that `ALLOWED_ORIGINS` never listed — the API
then rejects every POST with `403 CORS_BLOCKED`.

`server/src/index.js` therefore allows **any `localhost` / `127.0.0.1` port**
automatically (sessions are tokens in localStorage, not cookies) and only
non-local origins must be listed explicitly in `ALLOWED_ORIGINS`. If you do see
this error, restart the API so the running process picks up that rule.

### Smoke tests

```bash
cd server
npm test                         # every suite below, in order (skips the proxy/CORS ones)
node test-degraded.js            # health + Firestore catalogue + honest 401/503 codes
node test-firebase-recovery.mjs  # Firestore channel self-healing (watchdog + rebuild)
node test-courses.mjs            # Phase 1: courses in Firestore + admin-only CRUD
node test-applications.mjs       # Phase 2: applications, UID linking, isolation, RBAC
node test-enquiries.mjs          # Phase 3: enquiries + admin management
node test-admin-dashboard.mjs    # Phase 4: admin-only student listing + remaining 503s
node test-admin-auth.mjs         # admin provisioning state, login, invalid credentials,
                                 # admin-only authorization, student restrictions,
                                 # dashboard data loading
node test-profile-course.mjs     # approved applications sync the course to the profile
node test-student-auth.mjs       # Firebase Authentication regression suite
node test-login-flow.js          # health now, full auth flow once auth is back (skips otherwise)
node test-password-change.js     # same skip behaviour
node test-proxy-login.js         # through the Vite dev proxy (needs `npm run dev`)
node test-cors.js                # dev-port origins allowed, foreign origins blocked
```

The `.mjs` suites create their own throwaway accounts/records and delete them
again; they never modify pre-existing student data. `test-courses.mjs`,
`test-applications.mjs` and `test-enquiries.mjs` also need
`server/firebase-service-account.json` (used to verify what really landed in
Firestore).

Three browser end-to-end suites run from the project root against the live dev
server **and** the API (`npm run dev` + `npm run server`):

```bash
node test-auth-ui.mjs           # student auth: register/login/refresh/logout
node test-admin-ui.mjs          # admin login, dashboard data, logout, guards
node test-course-flow-ui.mjs    # apply -> admin approves -> course shown on profile
```

## API reference

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Health + data-layer state (`firestore`) |
| GET | `/api/health/firestore` | public | Read-only Firestore connectivity probe |
| POST | `/api/auth/register` | session | Create the Firestore profile for the verified session |
| POST | `/api/auth/login` | session | Return the profile of the verified session |
| GET | `/api/auth/me` | session | Current profile |
| POST | `/api/auth/migration-status` | public | Does this e-mail still need account migration? |
| POST | `/api/auth/migration-requests` | public | Account-recovery request for pre-upgrade accounts |
| PATCH | `/api/auth/password` | session | Change own password — *503 (passwords live in Firebase Auth)* |
| GET | `/api/users/students` | admin | Registered student profiles (admin dashboard) |
| GET | `/api/users/:uid` | own/admin | One profile |
| POST | `/api/users` | admin | Provision user with initial password — *503 (not migrated)* |
| PATCH | `/api/users/:uid` | own/admin | Update `fullName` / `mobile` only |
| PATCH | `/api/users/:uid/password` | admin | Reset a student's password — *503 (not migrated)* |
| GET | `/api/courses` | public | Course catalogue (Firestore; seeds itself once) |
| GET | `/api/courses/:id` | public | One course |
| POST | `/api/courses/seed` | public | Idempotent seed — only while the collection is empty |
| POST | `/api/courses` | admin | Create course |
| PUT | `/api/courses/:id` | admin | Update course (allow-listed fields) |
| DELETE | `/api/courses/:id` | admin | Delete course |
| POST | `/api/enquiries` | public | Submit contact form (linked to the session when signed in) |
| GET | `/api/enquiries` | admin | List enquiries, newest first |
| PATCH | `/api/enquiries/:id/read` | admin | Mark enquiry read |
| DELETE | `/api/enquiries/:id` | admin | Delete enquiry |
| POST | `/api/applications` | public | Submit admission application (guest or student) |
| GET | `/api/applications/check` | public | Duplicate active application check (uid/e-mail from the session, or e-mail for guests) |
| GET | `/api/applications` | session | Own applications (uid/e-mail from the verified token); admins get all |
| PATCH | `/api/applications/:id` | admin | Update status / admin remarks |
| DELETE | `/api/applications/:id` | admin | Delete application |

Collections used: `users`, `courses`, `admission_applications`, `enquiries`,
`account_migration_requests`.

## Notes

- Courses come from `server/src/data/coursesData.js` (bundled) and the frontend
  mirrors the same file in `src/data/coursesData.js` as an offline fallback.
- The old Firestore `onSnapshot` real-time listeners were replaced with REST
  polling (~10–15s) behind the same `subscribe*()` function signatures, so no
  page components needed changes.
- The route files under `server/src/routes/` keep their original URL contract,
  so the next data/auth integration only has to replace the handler bodies.
