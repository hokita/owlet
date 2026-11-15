# Remove token auth from the REST add-note route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/reviews/:year/:month/notes` accepts only the Firebase sign-in, like GET and DELETE. The agent API token works only on `/mcp`.

**Architecture:** Muse now uses `/mcp` (PR #7), and the owner removed the old REST connector. The router's POST route switches from `noteAuth` to `userAuth`. That leaves `userOrApiTokenAuth`, the `noteAuth` option, and `res.locals.authSource` with no users, so they go too. `/mcp` keeps `apiTokenAuth` and the 30/hour limiter. MCP `add_note` already passes `source: 'api'` itself, so the "agent" badge still works.

**Tech Stack:** Express 5, Vitest + supertest, `@modelcontextprotocol/*` (unchanged), Playwright `request`, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-15-mcp-server-design.md`, section "Later": "Once MCP works from Muse, remove token auth from the REST add-note route in a follow-up PR."

## Global Constraints

- Branch `chore/remove-rest-token` (this worktree, from `origin/main`). One commit per task. Never push, merge, deploy or post on GitHub. Never print the real token. Do not touch `~/ghq/github.com/hokita/owlet`.
- Red/green TDD: the new 401 test must fail first (today it gets `201`).
- Stays unchanged: `apiTokenMatcher`, `apiTokenAuth` (except for no longer setting `authSource`), `createRateLimiter` and `rateLimit.ts`, `API_TOKEN_LIMIT_PER_HOUR = 30` with its one limiter now passed only to `createMcpRequestHandler`, MCP tool `add_note`'s `source: 'api'`, `NoteSource = 'app' | 'api'` (backend and frontend), `listNotes`'s source mapping, `NoteRow`'s "agent" badge, `backend/.env.e2e`'s `OWLET_API_TOKEN`, `.github/workflows/backend.yml`, `OWLET_API_TOKEN` itself.
- No dependency, frontend source or workflow changes.
- After any local e2e run: `cd e2e && npm run test:servers-stopped` prints `All e2e servers stopped.`

### Removed vs. stays (exact)

| Item | Where | Decision |
| --- | --- | --- |
| `userOrApiTokenAuth` (and its 429 + `Retry-After` response) | `backend/src/middleware/apiToken.ts:29-55` | **Remove.** Only REST POST used it |
| `describe('userOrApiTokenAuth')` (4 tests) | `backend/src/middleware/apiToken.test.ts:33-85` | **Remove** |
| `noteAuth` option of `createReviewsRouter` | `backend/src/routes/reviews.ts:15-22,40` | **Remove.** POST uses `userAuth` |
| `res.locals.authSource` read in the route (`source = ... ? 'api' : 'app'`) | `routes/reviews.ts:52` | **Remove.** REST passes `source: 'app'` |
| `res.locals.authSource = 'api'` in `apiTokenAuth` | `apiToken.ts:66` | **Remove.** Nothing reads it after this change (MCP hardcodes `'api'`) |
| Route test "saves notes from API token requests with source api" | `routes/reviews.test.ts:93-107` | **Remove** |
| App tests: REST "adds a note with the API token", "rate limits API token requests after 30 an hour", "rejects the API token everywhere when OWLET_API_TOKEN is unset", "shares the token rate limit between REST and MCP tool calls" | `backend/src/app.test.ts:46-57,75-85,87-95,200-221` | **Remove.** The new 401 test replaces the first and third. MCP's limit stays covered by "does not count initialize or tools/list" |
| README REST request/response/curl block and the REST check in setup step 5 | `README.md:70-88,108-113` | **Rewrite** for `/mcp` |
| `apiTokenMatcher`, `apiTokenAuth` (401 behaviour), limiter, `source: 'api'` on MCP, badge, NoteSource | — | **Stay** |

## Review Focus

1. A request with a **Firebase ID token** to POST notes must still work after the auth swap. That path is `authMiddleware`, the same as GET/DELETE. Task 1's updated router guard test pins POST to `userAuth`, and the e2e UI add flow (`month.spec.ts`) must stay green.
2. Notes added through MCP must still be saved with `source: 'api'` and show the badge once `authSource` is gone. Task 1 keeps the app test "adds a note through a real MCP client" (`source: 'api'`). Task 2 moves the e2e badge test onto `/mcp`.
3. REST notes must never be saved as `'api'`. Task 1 keeps "adds a trimmed note and returns 201" (`source: 'app'`).
4. The token's 401 on POST must not depend on the token being configured. The new app test runs with `OWLET_API_TOKEN` set, which is the dangerous case.
5. `/mcp` must keep rejecting a missing token, a wrong token and a Firebase bearer, and must keep its 30/hour limit, even though the limiter no longer has a REST user. The existing `/mcp` app tests and the `apiTokenAuth` tests stay, minus their `authSource` assertion.

---

### Task 1: REST POST notes accepts only the Firebase sign-in

**Files:**
- Modify: `backend/src/app.test.ts`, `backend/src/app.ts`
- Modify: `backend/src/routes/reviews.ts`, `backend/src/routes/reviews.test.ts`
- Modify: `backend/src/middleware/apiToken.ts`, `backend/src/middleware/apiToken.test.ts`

**Interfaces:**
- Produces: `createReviewsRouter({ userAuth }: { userAuth: RequestHandler }): Router`. `apiTokenAuth({ matches })` is unchanged in signature and still returns 401 `{ error: 'Invalid token' }`. `createApp()` is unchanged.

- [ ] **Step 1: Write the failing test** in `app.test.ts`, inside `describe('with OWLET_API_TOKEN set')` (REST block):

```ts
it('rejects the API token for adding notes over REST', async () => {
  const res = await request(createApp())
    .post('/api/reviews/2026/11/notes')
    .set('Authorization', bearer)
    .send({ type: 'learn', text: 'From an agent' })
  expect(res.status).toBe(401)
  expect(addNote).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd backend && npx vitest run src/app.test.ts -t "rejects the API token for adding notes over REST"`
Expected: FAIL, `expected 201 to be 401`.

- [ ] **Step 3: Make it pass**
  - `routes/reviews.ts`: drop `noteAuth` from the options and the type. The POST route uses `userAuth`. Pass `source: 'app'` to `addNote`. Update the header comment to "userAuth (the Firebase sign-in) guards every route."
  - `app.ts`: `createReviewsRouter({ userAuth: authMiddleware })`. Import only `apiTokenAuth, apiTokenMatcher`. Change the limiter comment to "Agents using the API token may make this many MCP tool calls per hour (per instance)."
  - `apiToken.ts`: delete `userOrApiTokenAuth` and the now-unused `RateLimiter` import. In `apiTokenAuth`, delete `res.locals.authSource = 'api'`. Keep its comment as it is.
  - `mcp/server.ts:28`: change the comment "shared with the REST token route" to "Each tool call takes from the API token limiter". No code change.

- [ ] **Step 4: Remove and adjust the tests that covered the removed code** (see the table above)
  - `app.test.ts`: remove the 4 REST/shared-limit tests listed. Keep "rejects the API token for listing/deleting notes" and every other `/mcp` test.
  - `routes/reviews.test.ts`: `createReviewsRouter({ userAuth: pass })`. Rename the guard test to `'guards every route with userAuth'`, using `createReviewsRouter({ userAuth: deny('userAuth') })`, with the POST assertion `{ error: 'userAuth' }`. Remove "saves notes from API token requests with source api".
  - `apiToken.test.ts`: remove `describe('userOrApiTokenAuth')` and the `createRateLimiter`/`RequestHandler` imports if they become unused. In `apiTokenAuth`'s `appWith`, use `.post('/', (_req, res) => res.json({ ok: true }))`. Rename the first test to `'accepts the API token'` and change its assertion to `expect(res.body).toEqual({ ok: true })`.

- [ ] **Step 5: Run the whole backend suite, typecheck and lint**

Run: `cd backend && npm test && npx tsc --noEmit && npm run lint`
Expected: all pass. `git grep -n -E "userOrApiTokenAuth|noteAuth|authSource" backend/` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "Accept only the Firebase sign-in on the REST add-note route"
```

### Task 2: e2e — the badge comes from MCP, and REST rejects the token on POST

**Files:**
- Modify: `e2e/tests/agent.spec.ts`

**Interfaces:**
- Consumes: `POST ${API_URL}/mcp` with headers `Authorization: Bearer ${API_TOKEN}`, `Accept: application/json, text/event-stream` and `Content-Type: application/json`. The body is a single JSON-RPC `tools/call` (stateless server, so no session). The response is 200, and its text (JSON or SSE `data:` line) contains the tool result.

- [ ] **Step 1: Rewrite the badge test.** Name it `'an agent adds a note over MCP with the API token, shown with the agent badge'`. Send `{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_note', arguments: { year: 2001, month: 6, type: 'learn', text: \`agent ${run}\` } } }`. Assert `res.status() === 200`, `await res.text()` contains `agent ${run}` and `\"source\":\"api\"`, and does not contain `"isError":true`. Keep the sign-in and badge assertions as they are.
- [ ] **Step 2: Extend the REST rejection test.** Rename it to `'the API token cannot use the REST API'` and add `request.post(\`${API_URL}/api/reviews/2001/6/notes\`, { headers, data: { type: 'learn', text: \`rest token ${run}\` } })` → expect status `401`. Keep "a wrong token cannot add a note" unchanged.
- [ ] **Step 3: Run e2e.** Run `cd e2e && npm test`, then `npm run test:servers-stopped`. Expected: all specs pass (including `month.spec.ts`), and `All e2e servers stopped.` If the stateless SDK rejects `tools/call` without `initialize`, stop and report. Don't add session handling.
- [ ] **Step 4: Commit** — `git add e2e/tests/agent.spec.ts && git commit -m "e2e: add agent notes over MCP; REST rejects the token"`

### Task 3: Docs

**Files:**
- Modify: `README.md` (sections "Agent notes (API)", "MCP (Muse)", env table)
- Modify: `docs/superpowers/specs/2026-11-15-mcp-server-design.md` ("Later")

- [ ] **Step 1: README**
  - Rename "Agent notes (API)" to "Agent notes (API token)", keeping the "Agent notes" prefix that `backend.yml`'s comment points to. Intro: "Agents (e.g. Muse) use the API token only with the [MCP server](#mcp-muse), which can list, add and delete notes. The REST API accepts only the signed-in app. Tool calls are limited to 30 an hour, and agent notes show an 'agent' badge in the app."
  - Delete the REST **Request**/**Responses**/curl block.
  - Setup step 5: check with an `initialize` POST to `/mcp` expecting `200`, using the same JSON-RPC body as `app.test.ts`'s `initialize` and an `Accept: application/json, text/event-stream` header. It must not write a note.
  - MCP "Rate limit" line: "MCP tool calls are limited to 30 an hour", with no mention of REST sharing.
  - Env table `OWLET_API_TOKEN`: "Optional. Token agents use for `/mcp` (≥ 43 chars); unset disables `/mcp`".
- [ ] **Step 2: Spec.** Under "Later", add "Done 2026-11-15: REST add-note accepts only the sign-in (plan `2026-11-15-remove-rest-token.md`)." Leave older specs and plans as historical records.
- [ ] **Step 3: Verify.** Run `git grep -n -E "REST token|api/reviews/.*/notes" README.md`. Expected: no REST token usage remains. Run `npx prettier --check README.md docs` from the repo root and expect it to pass.
- [ ] **Step 4: Commit** — `git add README.md docs/superpowers/specs && git commit -m "Docs: the API token works only on /mcp"`

## Out of scope

Removing `OWLET_API_TOKEN`, changing the limiter or `/mcp` behaviour, rotating the token, deployment, and the Muse connector. The frontend needs no change: it always sends the Firebase token, and its badge reads `source` from GET. Older plans and specs stay untouched.
