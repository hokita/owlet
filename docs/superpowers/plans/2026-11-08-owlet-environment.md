# owlet Environment Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up owlet's frontend, API, Firestore and Auth on GCP with a signed-in hello-world page that proves Hosting → Auth → Cloud Run → Firestore.

**Architecture:** Copy of `../hamster`'s shape: React SPA on Firebase Hosting, Express API on Cloud Run as the sole Firestore client via the Admin SDK, Firebase Auth (Google) with an email allowlist, GitHub Actions deploying via Workload Identity Federation.

**Tech Stack:** Node 24.18.0, TypeScript 5, Express 4, firebase-admin 12, React 18, Vite 5, Tailwind v4, firebase (web) 10, Vitest 1.6, Supertest, Testing Library, Playwright, firebase-tools 15.22.1.

**Spec:** `docs/superpowers/specs/2026-11-08-owlet-environment-design.md`

**Reference implementation:** `../hamster` — when a step says "copy from hamster", copy the file and replace `hamster` with `owlet` and hamster-only content (bookmarks, Gemini, FontAwesome, router) is dropped.

## Global Constraints

- Region `asia-northeast1` for Cloud Run, Artifact Registry, Firestore.
- Cloud Run service `owlet-backend`, `--min-instances 0 --max-instances 2 --allow-unauthenticated`.
- Images built in GitHub Actions, never Cloud Build. Artifact Registry repo `owlet`, cleanup keeps 2 most recent.
- Firestore rules: `allow read, write: if false` for all documents.
- Emulator ports: Auth `9099`, Firestore `8081`. Local demo project `demo-owlet`, e2e project `demo-owlet-e2e`.
- Auth failures answer `401` with `{ error }` — `Missing token` / `Invalid token` / `Unauthorized` (hamster's contract).
- Prettier: no semicolons, single quotes, `trailingComma: es5`, `printWidth: 100` (hamster's `.prettierrc`).
- No static GCP credentials anywhere — WIF only.
- Budget alert ¥100.

## Review Focus

1. Signed-in Google account that is **not** on the allowlist → the page shows an error, not a blank screen or infinite spinner. (Task 4 test `shows an error when the API rejects the request`.)
2. Token with `email_verified: false` → 401. (Task 2 test.)
3. Two `/api/hello` calls racing → counter increments by exactly 2 (transaction, not read-then-write). (Task 3 uses `runTransaction`; test asserts the transaction API is used.)
4. Deployed frontend calling Cloud Run cross-origin → CORS allows `https://<project>.web.app`. (Task 7 verification step curls with `Origin` header.)
5. First-ever visit with no `meta/hello` doc → returns `visits: 1`, not an error. (Task 3 test.)

---

### Task 1: Repo root + backend skeleton with `/health`

**Files:**
- Create: `.gitignore`, `.prettierrc`, `.prettierignore`, `firebase.json`, `firestore.rules`, `firestore.indexes.json` (copy from hamster; `.firebaserc` is created in Task 6)
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/eslint.config.mjs`, `backend/.dockerignore`, `backend/Dockerfile` (copy from hamster; package name `owlet-backend`; drop `@google/genai`)
- Create: `backend/src/app.ts`, `backend/src/index.ts`, `backend/src/config/firebase.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Produces: `createApp(): express.Express`; `initFirebase(): void`.

- [ ] **Step 1: Copy root and backend config files from hamster, `npm install` in `backend/`**

- [ ] **Step 2: Write the failing test** `backend/src/app.test.ts`

```ts
it('GET /health returns ok', async () => {
  const res = await request(createApp()).get('/health')
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ ok: true })
})
```

- [ ] **Step 3: Run** `cd backend && npm test` — Expected: FAIL (cannot find `./app`)

- [ ] **Step 4: Implement `app.ts` (CORS with `FRONTEND_URL || '*'`, JSON, `/health`), `index.ts`, `config/firebase.ts`** — same as hamster minus bookmarks router.

- [ ] **Step 5: Run** `npm test && npm run lint && npm run build` — Expected: all pass

- [ ] **Step 6: Commit** `git commit -m "Add backend skeleton with health check."`

### Task 2: Auth middleware

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Test: `backend/src/middleware/auth.test.ts`

**Interfaces:**
- Produces: `authMiddleware(req, res, next): Promise<void>` — reads `ALLOWED_EMAILS` (comma-separated, case-insensitive) per request.

- [ ] **Step 1: Write failing tests** (mock `firebase-admin/auth` as hamster does): missing header → 401; verify rejects → 401; email not allowlisted → 401; no email claim → 401; `email_verified: false` → 401; allowlisted + verified (`OWNER@example.com` vs `owner@example.com`) → 200.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL (module not found)
- [ ] **Step 3: Implement** — hamster's `auth.ts` verbatim.
- [ ] **Step 4: Run** `npm test` — Expected: PASS
- [ ] **Step 5: Commit** `git commit -m "Add email allowlist auth middleware."`

### Task 3: `/api/hello` with Firestore visit counter

**Files:**
- Create: `backend/src/services/hello.ts`, `backend/src/routes/hello.ts`
- Modify: `backend/src/app.ts` (mount `app.use('/api/hello', authMiddleware, createHelloRouter())`)
- Create: `backend/.env.example`, `backend/.env.e2e` (hamster's, `demo-owlet` / `demo-owlet-e2e`, no Gemini lines)
- Test: `backend/src/services/hello.test.ts`, `backend/src/routes/hello.test.ts`

**Interfaces:**
- Produces: `recordVisit(): Promise<number>` — in a Firestore `runTransaction` on doc `meta/hello`: missing doc → set `{ visits: 1, updatedAt: serverTimestamp }`, return 1; else `visits + 1`.
- Produces: `createHelloRouter(): express.Router` — `GET /` → `200 { message: 'Hello, owlet', visits }`; `recordVisit` throws → `500 { error: 'Internal error' }`.
- HTTP: `GET /api/hello` → `{ "message": "Hello, owlet", "visits": number }`.

- [ ] **Step 1: Write failing service tests** (mock `firebase-admin/firestore` `getFirestore().runTransaction`, passing a fake `tx` with `get`/`set`): `returns 1 and creates the doc on first visit`; `increments an existing count` (`visits: 4` → returns 5, `tx.set` called with `visits: 5`); both assert the ref path is `meta/hello`.
- [ ] **Step 2: Write failing route tests** (mock `../services/hello` and bypass auth by mounting the router directly): `returns the message and visit count` → `{ message: 'Hello, owlet', visits: 3 }`; `returns 500 when Firestore fails`. Plus in `app.test.ts`: `GET /api/hello without a token returns 401`.
- [ ] **Step 3: Run** `npm test` — Expected: FAIL
- [ ] **Step 4: Implement** `services/hello.ts`, `routes/hello.ts`, mount in `app.ts`.
- [ ] **Step 5: Run** `npm test && npm run lint && npm run build` — Expected: PASS
- [ ] **Step 6: Manual check against emulators:** `firebase emulators:start --project demo-owlet --only auth,firestore` + `npm run dev`; `curl localhost:8080/health` → `{"ok":true}`; `curl localhost:8080/api/hello` → 401.
- [ ] **Step 7: Commit** `git commit -m "Add hello endpoint with Firestore visit counter."`

### Task 4: Frontend — login and hello page

**Files:**
- Create: `frontend/package.json` (hamster's minus FontAwesome, react-router-dom, react-markdown, remark-gfm; name `owlet-frontend`), `frontend/index.html` (title/app-title `owlet`, description `Monthly review`, icons `favicon.ico` + `apple-touch-icon.png` only), `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/eslint.config.js`, `frontend/.env.example`, `frontend/.env.e2e` (`demo-owlet*`), `frontend/src/{main.tsx,index.css,test-setup.ts,vite-env.d.ts,firebase.ts}` — copied from hamster
- Create: `frontend/public/favicon.ico`, `frontend/public/apple-touch-icon.png` — copied from `../owl/frontend/public/`
- Create: `frontend/src/api.ts`, `frontend/src/App.tsx`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/HelloPage.tsx`
- Test: `frontend/src/api.test.ts`, `frontend/src/App.test.tsx`, `frontend/src/pages/LoginPage.test.tsx`, `frontend/src/pages/HelloPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/hello` from Task 3.
- Produces: `api.getHello(): Promise<{ message: string; visits: number }>`; `request<T>` throws `Error('API error: <status>')` on non-OK (hamster's).
- UI copy pinned for e2e: button `Sign in with Google`, button `Sign out`, heading = API `message`, text `Visits: N`.

- [ ] **Step 1: Copy config and scaffold files, `npm install`**
- [ ] **Step 2: Write failing tests:**
  - `api.test.ts`: `getHello sends the bearer token to /api/hello`; `throws on a non-OK response` (`API error: 401`).
  - `LoginPage.test.tsx`: renders `Sign in with Google`; shows `Sign-in failed.` when `signInWithPopup` rejects.
  - `HelloPage.test.tsx`: shows heading `Hello, owlet` and `Visits: 3` when `api.getHello` resolves; `shows an error when the API rejects the request` (text `Could not load: API error: 401`); `Sign out` calls `signOut(auth)`.
  - `App.test.tsx`: renders nothing while auth state is unknown; LoginPage when signed out; HelloPage when signed in.
- [ ] **Step 3: Run** `cd frontend && npm test` — Expected: FAIL
- [ ] **Step 4: Implement** `api.ts` (hamster's `request` + `getHello`), `LoginPage.tsx` (hamster's, plain text button, tagline `Your monthly review`), `HelloPage.tsx` (loads once on mount; loading → `Loading…`), `App.tsx` (hamster's auth gate without router).
- [ ] **Step 5: Run** `npm test && npm run lint && npx tsc --noEmit && npm run build` — Expected: PASS
- [ ] **Step 6: Manual check:** emulators + backend + `npm run dev`, open `http://localhost:5173`, sign in with an emulator Google account whose email is in `backend/.env` `ALLOWED_EMAILS` → `Hello, owlet` / `Visits: 1`; reload → `Visits: 2`.
- [ ] **Step 7: Commit** `git commit -m "Add frontend with Google sign-in and hello page."`

### Task 5: E2E

**Files:**
- Create: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/fixtures/auth.ts` (hamster's; project `demo-owlet-e2e`; `signIn` waits for button `Sign out`), `e2e/tsconfig.json` if hamster has one
- Modify: `backend/package.json` add `start:e2e` (hamster's), `frontend/package.json` add `dev:e2e` (hamster's)
- Test: `e2e/tests/hello.spec.ts`

- [ ] **Step 1: Write the test:** `signs in and sees the hello message` — `signIn(page)`; expect heading `Hello, owlet` visible; expect text matching `/Visits: \d+/`.
- [ ] **Step 2: Run** `cd e2e && npm install && npx playwright install chromium && npm test` — Expected: PASS (all three servers start; if it fails, fix wiring, not the assertion).
- [ ] **Step 3: Commit** `git commit -m "Add end-to-end sign-in test."`

### Task 6: GCP provisioning (run with the user's `gcloud`/`firebase` login)

No code tests; each step's verification is the command output. Record the project ID, project number, web app config and Cloud Run URL in the commit message of Step 9 and in `README.md`.

- [ ] **Step 1:** `gcloud projects create owlet-<6 hex>` → `firebase projects:addfirebase <id>` → `gcloud billing projects link <id> --billing-account=015EF6-5B317F-011F7B`. Verify: `gcloud billing projects describe <id>` shows `billingEnabled: true`.
- [ ] **Step 2:** `gcloud services enable run.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com firebasehosting.googleapis.com identitytoolkit.googleapis.com --project <id>`.
- [ ] **Step 3:** `gcloud firestore databases create --location=asia-northeast1 --project <id>`.
- [ ] **Step 4:** Artifact Registry repo `owlet` (docker, asia-northeast1) + cleanup policy JSON: one `KEEP` rule `mostRecentVersions.keepCount: 2`, one `DELETE` rule `tagState: ANY`. Verify: `gcloud artifacts repositories describe owlet --location asia-northeast1` lists both policies.
- [ ] **Step 5:** `printf '%s' '<owner email>' | gcloud secrets create ALLOWED_EMAILS --data-file=- --project <id>`; grant default compute SA `roles/secretmanager.secretAccessor` and `roles/datastore.user`.
- [ ] **Step 6:** `firebase apps:create web owlet --project <id>` then `firebase apps:sdkconfig web <appId>` → note `apiKey`, `authDomain`.
- [ ] **Step 7:** WIF pool/provider/SA exactly as the spec's step 7 (attribute condition `attribute.repository == 'hokita/owlet'`), roles from the spec. `gh secret set WIF_PROVIDER` / `WIF_SERVICE_ACCOUNT` on `hokita/owlet`. Verify: `gh secret list -R hokita/owlet` shows both.
- [ ] **Step 8:** Budget: `gcloud billing budgets create --billing-account=015EF6-5B317F-011F7B --display-name=owlet --budget-amount=100JPY --filter-projects=projects/<id> --threshold-rule=percent=0.5 --threshold-rule=percent=1.0`. (Billing account currency must be JPY; if it isn't, use the equivalent amount in its currency and tell the user.)
- [ ] **Step 9:** Create `.firebaserc` (`default: <id>`), commit `git commit -m "Add Firebase project config."`
- [ ] **Step 10: Ask the user** to enable Google in Firebase console → Authentication → Sign-in method. Wait for confirmation.

### Task 7: CI/CD workflows + first deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `backend.yml`, `frontend.yml`, `firestore-rules.yml` — copied from hamster with `hamster-52b093` → `<id>`, `hamster` → `owlet`, `--set-secrets "ALLOWED_EMAILS=ALLOWED_EMAILS:latest"` only, `FRONTEND_URL=https://<id>.web.app`. Pin `google-github-actions/auth@v3` in all four.
- Create: `README.md` (stack table, local dev, tests, deploy, env vars — hamster's structure)

- [ ] **Step 1:** Write workflows + README; commit; push to `main`.
- [ ] **Step 2:** `gh run watch` each of backend / firestore-rules runs — Expected: success. Then get the Cloud Run URL (`gcloud run services describe owlet-backend --region asia-northeast1 --format='value(status.url)'`), put it in `frontend.yml` `VITE_API_URL` along with the Step 6 config, commit, push, watch the frontend run — Expected: success.
- [ ] **Step 3: Verify:** `curl <run-url>/health` → `{"ok":true}`; `curl -i -H 'Origin: https://<id>.web.app' <run-url>/health` shows `access-control-allow-origin: https://<id>.web.app`; `curl <run-url>/api/hello` → 401.
- [ ] **Step 4: Verify in browser:** open `https://<id>.web.app`, sign in with Google → `Hello, owlet`, `Visits: N`. Screenshot for the user.
- [ ] **Step 5:** Open a throwaway PR (README typo-level change) and confirm `ci.yml` runs green, then close it — or, if the user prefers, skip and let the next feature PR prove it.
