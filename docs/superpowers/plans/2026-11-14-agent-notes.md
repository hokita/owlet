# owlet Agent Notes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let terminal agents add notes through a CLI and an API token limited to the add-note route.

**Spec:** `docs/superpowers/specs/2026-11-14-agent-notes-design.md`

## Global Constraints

- Red/green TDD for every task.
- The API token must never authenticate anything but `POST /api/reviews/:year/:month/notes`.
- No production changes, no secrets created. Deploy keeps working without the secret.
- Prettier/ESLint conventions of the repo.

## Review Focus

1. API token on GET / DELETE → 401.
2. `OWLET_API_TOKEN` unset or too short → token rejected everywhere, app unaffected.
3. 31st token request in an hour → 429; Firebase-authenticated requests are never rate limited.
4. Existing notes without `source` render without a badge.
5. Deploy without `OWLET_API_TOKEN_SECRET` set → same `--set-secrets` as today.

---

### Task 1: Backend token auth + rate limit

**Files:** Create `backend/src/middleware/apiToken.ts`, `backend/src/middleware/rateLimit.ts` with tests

- [ ] `apiTokenMatcher(configured)`: null when unset/short (warns when short); constant-time match.
- [ ] `createRateLimiter({ limit, windowMs, now })`: rolling window, returns `{ ok, retryAfterSeconds }`.
- [ ] `userOrApiTokenAuth({ token, limiter, userAuth })`: matching token → rate limit → `res.locals.authSource = 'api'`; otherwise delegate to `userAuth`.

### Task 2: Source on notes

**Files:** Modify `backend/src/services/reviews.ts`, `backend/src/routes/reviews.ts`, `backend/src/app.ts` and tests

- [ ] Service stores `source`, defaults missing to `'app'`.
- [ ] Router takes `{ userAuth, noteAuth }`; POST uses `noteAuth` and passes `source`.
- [ ] `app.test.ts`: token accepted on POST, rejected on GET/DELETE, rejected everywhere when unset, 429 after the limit.

### Task 3: Frontend badge

- [ ] `Note.source`; NoteRow renders "agent" badge for `'api'` only.

### Task 4: CLI

**Files:** Create `cli/` (package.json, tsconfig, eslint, vitest, `src/{args,token,client,main,index}.ts` + tests)

- [ ] Args, Tokyo default month, token lookup (env → Keychain), client errors, `main` exit codes.

### Task 5: E2E, deploy, docs, CI

- [ ] `backend/.env.e2e` gets a test token; e2e: token POST appears with badge, token GET → 401.
- [ ] `backend.yml`: conditional `OWLET_API_TOKEN` secret via `vars.OWLET_API_TOKEN_SECRET`.
- [ ] CI job for `cli/`. README: CLI install + one-time setup.
- [ ] All tests, lint, typecheck, e2e; port 8081 free. Push, PR, CI green.
