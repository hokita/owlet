# Remove the owlet CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused `owlet` CLI and everything that builds, tests or documents it, while keeping agents' API-token access to adding notes exactly as it is.

**Architecture:** The CLI was only a thin client for `POST /api/reviews/:year/:month/notes` with the API token. The owner's agent client (Muse, Meta's iPhone app) calls that endpoint directly through a custom connector, so the CLI is dead weight. The backend, frontend and deploy are unchanged; only `cli/`, its CI wiring, the CLI-based e2e test and the docs change.

**Tech Stack:** Playwright (`request` fixture), GitHub Actions YAML, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-14-agent-notes-design.md` (Task 3 amends it), plus the owner's request: "remove the CLI; Muse calls the API directly; no useless features".

## Global Constraints

- Branch `chore/remove-cli` from `origin/main`; one commit per task; no merge.
- Keep unchanged: API token auth on POST notes only (add-only), the 30/hour rate limit, `source: 'app' | 'api'` and the "agent" badge, `backend.yml` deploy wiring (`vars.OWLET_API_TOKEN_SECRET`), `backend/.env.e2e`'s `OWLET_API_TOKEN`.
- No files under `backend/src/`, `frontend/src/` or `.github/workflows/backend.yml` change.
- E2E test token stays `` `e2e-api-token-${'x'.repeat(50)}` `` (matches `backend/.env.e2e`); e2e backend URL `http://localhost:8090`.
- After any local e2e run: `cd e2e && npm run test:servers-stopped` prints `All e2e servers stopped.` and `lsof -nP -iTCP:8081 -sTCP:LISTEN` prints nothing.
- Out of scope: CORS (the backend only allows `FRONTEND_URL`). Whether Muse's connector calls from a server or a browser context is unknown; don't change CORS for it without asking the owner.

## Review Focus

1. CI's e2e job still lists `cli/package-lock.json` in `cache-dependency-path` after `cli/` is gone → `actions/setup-node` cache fails or warns. Task 2 removes it, and its verification greps for any `cli/` reference.
2. A wrong bearer token on POST must still be 401, not silently accepted, now that no CLI is in front of it. Task 1 adds `a wrong token cannot add a note`.
3. The new API-level test must actually be able to fail (it starts green because the behavior exists). Task 1 proves this with a one-off mutation run.
4. The README's API example must match the real route and body, or Muse's connector setup will be wrong. Task 3 checks it by running the documented `curl` against the e2e backend.
5. Token rejection on GET/DELETE must keep being exercised end to end after the CLI test file is rewritten. Task 1 keeps `the API token cannot list or delete notes` unchanged.

---

### Task 1: API-level e2e coverage replaces the CLI test

**Files:**
- Modify: `e2e/tests/agent.spec.ts` (replace the CLI test and its `execFileSync`/`existsSync`/`path`/`CLI` code; keep `API_TOKEN`, `API_URL`, `run` and the GET/DELETE test as they are)

**Interfaces:**
- Consumes: `signIn(page)` from `e2e/fixtures/auth.ts`; backend `POST ${API_URL}/api/reviews/2001/6/notes` → `201` with `{ id, type, text, source, createdAt }`.
- Produces: nothing used by later tasks. After this task, `e2e/` no longer references `cli/`.

- [ ] **Step 1: Replace the CLI test with these two tests**

```ts
test('an agent adds a note with the API token, shown with the agent badge', async ({ page, request }) => {
  const res = await request.post(`${API_URL}/api/reviews/2001/6/notes`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    data: { type: 'learn', text: `agent ${run}` },
  })
  expect(res.status()).toBe(201)
  expect(await res.json()).toMatchObject({ type: 'learn', text: `agent ${run}`, source: 'api' })

  await signIn(page)
  await page.goto('/2001/6')
  const row = page.getByRole('listitem').filter({ hasText: `agent ${run}` })
  await expect(row.getByRole('img', { name: 'Added by an agent' })).toBeVisible()
})

test('a wrong token cannot add a note', async ({ request }) => {
  const res = await request.post(`${API_URL}/api/reviews/2001/6/notes`, {
    headers: { Authorization: `Bearer ${'y'.repeat(64)}` },
    data: { type: 'learn', text: `wrong token ${run}` },
  })
  expect(res.status()).toBe(401)
})
```

- [ ] **Step 2: Run it**

Run: `cd e2e && CI=1 npx playwright test tests/agent.spec.ts`
Expected: `3 passed`. (It can't start red: the behavior already exists and only the test's client changes.)

- [ ] **Step 3: Prove the badge test can fail**

Temporarily change `API_TOKEN` to `` `e2e-api-token-${'z'.repeat(50)}` `` and rerun the command from Step 2.
Expected: `an agent adds a note…` FAILS with `Expected: 201 / Received: 401`. Revert the change; `git diff e2e/tests/agent.spec.ts` shows only the Step 1 edit.

- [ ] **Step 4: Check that servers stopped**

Run: `cd e2e && npm run test:servers-stopped && lsof -nP -iTCP:8081 -sTCP:LISTEN`
Expected: `All e2e servers stopped.` and no `lsof` output.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/agent.spec.ts
git commit -m "Cover agent notes at the API level instead of through the CLI."
```

### Task 2: Delete the CLI and its CI wiring

**Files:**
- Delete: `cli/` (all 14 tracked files)
- Modify: `.github/workflows/ci.yml`: remove the whole `cli:` job (lines 65–92), the `cli/package-lock.json` line from the e2e job's `cache-dependency-path` (line 113), and the `Build CLI` step (lines 124–126)
- Modify: `README.md`: remove the `├── cli/` line from Project structure (line 20) and both `(cd cli …)` lines from Tests (lines 57–58)

**Interfaces:**
- Consumes: Task 1 (e2e no longer needs a built CLI).
- Produces: a repo with no `cli/` references outside the docs that Task 3 rewrites.

- [ ] **Step 1: Delete and edit**

Run `git rm -r -q cli` and make the `ci.yml` and README edits listed above.

- [ ] **Step 2: Verify that nothing still points at the CLI**

Run: `git grep -n -E "cli/|Build CLI|name: CLI" -- . ':!docs'`
Expected: no output.
Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(list(d['jobs']))"`
Expected: `['frontend', 'backend', 'e2e']`

- [ ] **Step 3: Run the full suites**

Run: `(cd backend && npm test && npm run lint && npx tsc --noEmit)`, then the same in `frontend/`, then `(cd e2e && CI=1 npm test && npm run test:servers-stopped)`.
Expected: backend 49 passed, frontend 68 passed, e2e 9 passed (6 month + 3 agent), `All e2e servers stopped.`, nothing on :8081.

- [ ] **Step 4: Commit**

```bash
git add -A cli .github/workflows/ci.yml README.md
git commit -m "Remove the unused owlet CLI."
```

### Task 3: Docs: call the API directly; record why the CLI went

**Files:**
- Modify: `README.md` "Agent notes (CLI)" section (lines 71–119)
- Modify: `docs/superpowers/specs/2026-11-14-agent-notes-design.md` (Overview line 5, Non-goals line 15, `## CLI` section lines 43–56, Testing line 65, Calls line 76)
- Modify: `docs/superpowers/plans/2026-11-14-agent-notes.md` (top of file)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond `cli/` being gone.
- Produces: final docs.

- [ ] **Step 1: Rewrite the README section**

- Heading: `## Agent notes (API)`.
- Intro: agents (e.g. Muse via a custom connector) add notes by calling the API with the API token. It only works for adding a note, is limited to 30 requests an hour, and the notes show an "agent" badge.
- Request reference: `POST https://owlet-backend-185845390027.asia-northeast1.run.app/api/reviews/{year}/{month}/notes`, headers `Authorization: Bearer <token>` and `Content-Type: application/json`, body `{"type": "event" | "learn" | "next", "text": "<one line, ≤ 500 chars>"}`. Responses: `201` with the note (`source: "api"`); `400 {error}` for invalid input; `401` for a bad token; `429` with `Retry-After` when rate limited.
- One `curl` example using `$OWLET_TOKEN`.
- One-time setup: keep steps 1–4 (generate, `gcloud secrets create`, `add-iam-policy-binding`, `gh variable set` + `gh workflow run`). Replace steps 5–6 (Keychain, `owlet add`) with "paste the token into the Muse connector's Bearer token field, then `unset TOKEN`" and a `curl` check.
- Rotation line: drop the Keychain part; say to update the token in the connector.
- Remove the Install block, `OWLET_TOKEN`/`OWLET_API_URL`/Keychain text, and every `owlet add` example.

- [ ] **Step 2: Check the README example against the real API**

Start the e2e servers (`cd e2e && CI=1 npx playwright test tests/agent.spec.ts` brings them up), or run the backend with `npm run start:e2e` plus the emulators. Run the README `curl` with `http://localhost:8090` and the e2e token.
Expected: `201` and JSON with `"source":"api"`. Afterwards, `npm run test:servers-stopped` passes.

- [ ] **Step 3: Update the spec and plan**

- Spec: add under Overview a dated note, `**2026-11-14 update:** the CLI was removed. The owner's client, Muse (Meta's iPhone app), calls the API directly through a custom connector, so a CLI was an unused feature.` Replace the `## CLI (cli/)` section with `## API for agents` (the request reference from Step 1). Delete the CLI testing bullet. In Calls, drop the CLI env names. Change the MCP non-goal to stop mentioning the CLI.
- Agent-notes plan: add one line under the title, `> Task 4 (CLI) was reverted later; see 2026-11-14-remove-cli.md.`

- [ ] **Step 4: Verify the docs no longer describe the CLI as current**

Run: `git grep -n -i -E "owlet add|keychain|OWLET_TOKEN|npm link" -- README.md docs/superpowers/specs/2026-11-14-agent-notes-design.md`
Expected: no output.

- [ ] **Step 5: Commit, push, open the PR**

```bash
git add README.md docs/superpowers
git commit -m "Document calling the agent notes API directly; note the CLI removal."
git push -u origin chore/remove-cli
gh pr create --base main --title "Remove the unused owlet CLI"   # body: what was removed, what is kept, why (Muse connector)
gh pr checks <n> --watch
```
Expected: Backend, Frontend and E2E pass (no CLI job). Do not merge, and post no GitHub comments.
