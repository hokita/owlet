# owlet MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve `list_notes`, `add_note` and `delete_note` over MCP at `/mcp` on the owlet backend, authenticated by the existing agent API token, so Muse can manage notes.

**Architecture:** Note input validation moves out of `routes/reviews.ts` into a shared module used by the REST routes and the MCP tools. A token-only auth middleware guards `/mcp`; tool calls take from the same rate limiter as the REST token route. The MCP SDK's stateless HTTP handler builds a fresh `McpServer` per request.

**Tech Stack:** Express 4.22, TypeScript 5.9 (CommonJS), Vitest 1.6, supertest. MCP TypeScript SDK v2: `@modelcontextprotocol/server@2.4.0`, `@modelcontextprotocol/node@2.1.2`, `zod@4.6.7`; dev: `@modelcontextprotocol/client@2.4.0` (all latest on npm as of 2026-11-15).

**Spec:** `docs/superpowers/specs/2026-11-15-mcp-server-design.md`

## Owner decisions (2026-11-15)

1. **SDK:** v2 (`@modelcontextprotocol/server` and friends), exact versions above. v2 calls itself the stable line that replaces `@modelcontextprotocol/sdk` 1.x; it serves the 2025-era protocol Muse most likely speaks and the 2026-07-28 revision.
2. **Rate limit:** count only tool calls (`tools/call` that reach a tool), not `initialize`, `tools/list` or other protocol requests. One limiter is shared with the REST token route, so REST token requests plus MCP tool calls are limited to 30/hour together. Over the limit, the tool call returns a tool error `Rate limit reached: try again in <N> seconds` (`isError: true`). A tool error is the SDK's own way to fail one tool call; an HTTP 429 would mean parsing JSON-RPC bodies in Express in front of the SDK (and differs between protocol eras), so the HTTP status stays 200 for that call.

## Global Constraints

- Red/green TDD for every task: failing test, run it red, minimal code, run it green.
- `/mcp` accepts only `Authorization: Bearer <OWLET_API_TOKEN>`; missing or wrong token → `401`; a Firebase ID token is never accepted there.
- REST token requests and MCP tool calls share one limit: 30 per rolling hour, per instance. REST over the limit → `429 { error: 'Too many requests' }` with `Retry-After` (unchanged); a tool call over the limit → tool error `Rate limit reached: try again in <N> seconds`. Protocol requests on `/mcp` (`initialize`, `tools/list`, notifications) are never counted.
- Validation exactly as the app: type `event|learn|next`; trimmed text 1–500 chars, no `\r`/`\n`; year integer 2000–2100; month integer 1–12.
- `delete_note` has `annotations: { destructiveHint: true }`; `list_notes` has `readOnlyHint: true`.
- REST behaviour and responses unchanged; existing tests stay green unchanged except the import paths they mock.
- Pin exact versions (`npm install --save-exact`). No OAuth, no new secrets, no workflow changes.
- Never print the API token (tests use fake tokens; prod checks read it into a variable).
- Don't run e2e while another worker uses port 8081 (Firestore emulator); e2e changes are none.

## Review Focus

1. A note id containing `/` passed to `delete_note` (REST can't send one; MCP can) → Firestore would resolve a different path. Expect a tool error "Invalid id" and no delete. Test in Task 1 and Task 3.
2. Firestore failure inside a tool → expect a tool error `Internal error` (no stack, no details) and a `console.error`, not a crash or a hung request. Test in Task 3.
3. `OWLET_API_TOKEN` unset → `/mcp` rejects even a well-formed bearer with `401`, never falls through to Firebase. Test in Task 4.
4. REST add-note and MCP tool calls drawing from the same limiter → 30 REST token requests make the next tool call fail with the rate-limit tool error, while `initialize`/`tools/list` still work. Test in Task 4.
5. `GET /mcp` (a 2025 client probing for an SSE stream) with a valid token → `405`, not `404` or a hang. Test in Task 4.

---

### Task 1: Shared note input validation

**Files:**
- Create: `backend/src/services/noteInput.ts`
- Test: `backend/src/services/noteInput.test.ts`
- Modify: `backend/src/routes/reviews.ts` (remove `MAX_TEXT_LENGTH`, `parseMonth`, `isNoteType`, `parseText`; use the new module)

**Interfaces:**
- Produces (all pure, no Firestore):
  - `parseYearMonth(year: unknown, month: unknown): { year: number; month: number } | null` — accepts numbers or numeric strings (REST passes route params, MCP passes numbers); `Number(x)` then the existing integer/range checks.
  - `parseNoteInput(input: { type?: unknown; text?: unknown }): { ok: true; type: NoteType; text: string } | { ok: false; error: 'Invalid type' | 'Invalid text' }` — type checked first, then text (same order and messages as today).
  - `parseNoteId(id: unknown): string | null` — non-empty string with no `/`.

- [ ] **Step 1: Write the failing tests** in `noteInput.test.ts`:
  - `parseYearMonth`: `(2026, 11)` and `('2026', '11')` → `{ year: 2026, month: 11 }`; each of `['1999','1'], ['2101','1'], ['2026','0'], ['2026','13'], ['abcd','1'], ['2026','1.5']` → `null`.
  - `parseNoteInput`: `{ type: 'event', text: '  Trip  ' }` → `{ ok: true, type: 'event', text: 'Trip' }`; the seven bad bodies from `routes/reviews.test.ts` (`idea`, missing type, blank, missing text, `42`, `'two\nlines'`, 501 chars) → `{ ok: false, error }` with the same `error` as that table; `'x'.repeat(500)` → ok.
  - `parseNoteId`: `'n1'` → `'n1'`; `''`, `'a/b'`, `42`, `undefined` → `null`.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/services/noteInput.test.ts` — Expected: FAIL, cannot resolve `./noteInput`.
- [ ] **Step 3: Implement** `noteInput.ts` by moving the existing functions from `routes/reviews.ts` (`MAX_TEXT_LENGTH = 500` moves with them; `NOTE_TYPES`/`NoteType` imported from `./reviews`). Make `routes/reviews.ts` call `parseYearMonth(req.params.year, req.params.month)` and `parseNoteInput(req.body ?? {})`, returning the same 400 bodies. The DELETE route doesn't call `parseNoteId` (REST behaviour unchanged).
- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass, including unchanged `routes/reviews.test.ts`. Note `routes/reviews.test.ts` mocks `../services/reviews` with `NOTE_TYPES`; `noteInput.ts` imports `NOTE_TYPES` from there, so the mock still supplies it.
- [ ] **Step 5: Commit** `git commit -m "Move note input validation into a shared module"`

### Task 2: Token-only auth middleware

**Files:**
- Modify: `backend/src/middleware/apiToken.ts`
- Test: `backend/src/middleware/apiToken.test.ts`

**Interfaces:**
- Consumes: `apiTokenMatcher` (existing).
- Produces: `apiTokenAuth({ matches }: { matches: ((token: string) => boolean) | null }): RequestHandler` — no token / wrong token / `matches === null` → `401 { error: 'Invalid token' }`; matching token → `res.locals.authSource = 'api'` and `next()`. No rate limiting here (tool calls are limited in Task 3). `userOrApiTokenAuth` is unchanged.

- [ ] **Step 1: Write failing tests** in a new `describe('apiTokenAuth')`:
  - `accepts the API token and marks the request as api` → `200`, `{ authSource: 'api' }`.
  - `rejects a missing Authorization header with 401` → `401`, `{ error: 'Invalid token' }`.
  - `rejects any other bearer value with 401` (`Bearer firebase-id-token`) → `401`.
  - `rejects everything when no token is configured` (`matches: apiTokenMatcher(undefined)`, bearer `TOKEN`) → `401`.
  - `does not rate limit`: 40 requests with the token → all `200`.
- [ ] **Step 2: Run** `npx vitest run src/middleware/apiToken.test.ts` — Expected: FAIL, `apiTokenAuth` is not exported.
- [ ] **Step 3: Implement** `apiTokenAuth` in `apiToken.ts`.
- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass (existing `userOrApiTokenAuth` tests unchanged).
- [ ] **Step 5: Commit** `git commit -m "Add a token-only auth middleware"`

### Task 3: MCP tools and handler

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json`
- Create: `backend/src/mcp/server.ts`
- Test: `backend/src/mcp/server.test.ts`

**Interfaces:**
- Consumes: `parseYearMonth`, `parseNoteInput`, `parseNoteId` (Task 1); `listNotes`, `addNote`, `deleteNote`, `NOTE_TYPES` from `services/reviews`; `RateLimiter` from `middleware/rateLimit`.
- Produces:
  - `createOwletMcpServer({ limiter }: { limiter: RateLimiter }): McpServer` — server info `{ name: 'owlet', version: '1.0.0' }`, registers the three tools. Every tool callback first calls `limiter.take()` (before validation, as the REST middleware does); refused → tool error `Rate limit reached: try again in <retryAfterSeconds> seconds`, service not called.
  - `createMcpRequestHandler({ limiter }: { limiter: RateLimiter }): RequestHandler` — `toNodeHandler(createMcpHandler(() => createOwletMcpServer({ limiter })))`, invoked as `(req, res) => handler(req, res, req.body)` because `express.json()` has already consumed the body stream.

Tool contract (`registerTool` with `z.object` input schemas, `description` on each field so Muse knows the rules):

| Tool | inputSchema | annotations | success result |
| --- | --- | --- | --- |
| `list_notes` | `year: z.number().int()`, `month: z.number().int()` | `readOnlyHint: true` | text = `JSON.stringify({ year, month, notes })` |
| `add_note` | + `type: z.enum(NOTE_TYPES)`, `text: z.string()` | `destructiveHint: false` | text = `JSON.stringify(note)` (note saved with `source: 'api'`) |
| `delete_note` | + `id: z.string()` | `destructiveHint: true`, `idempotentHint: true` | text = `Deleted note <id>` |

Range, trim, length and line checks are done by the shared module, not the zod schema. Errors are tool results `{ isError: true, content: [{ type: 'text', text }] }` with these exact texts: `Invalid month: year must be 2000–2100 and month 1–12`, `Invalid type: must be event, learn or next`, `Invalid text: must be one line of 1–500 characters`, `Invalid id`, `Rate limit reached: try again in <N> seconds`, `Internal error` (after `console.error('Failed to <list|add|delete> note(s)', err)`).

- [ ] **Step 1: Install pinned deps**
  `cd backend && npm install --save-exact @modelcontextprotocol/server@2.4.0 @modelcontextprotocol/node@2.1.2 zod@4.6.7 && npm install --save-exact --save-dev @modelcontextprotocol/client@2.4.0`
  Expected: `package.json` shows exact versions; `npx tsc --noEmit` still passes.
- [ ] **Step 2: Write failing tests** in `server.test.ts`. Mock `../services/reviews` as `app.test.ts` does. Test harness: an Express app `express().use(express.json()).all('/mcp', createMcpRequestHandler({ limiter }))` (limiter `createRateLimiter({ limit: 1000, windowMs: 3_600_000 })` unless a test says otherwise) listening on port 0 (`beforeAll`/`afterAll` close); a real `Client` from `@modelcontextprotocol/client` over `StreamableHTTPClientTransport(new URL(...))` (default 2025 handshake, like Muse). Tests:
  - `lists the three tools with their annotations`: `listTools()` names are `['add_note', 'delete_note', 'list_notes']` (sorted); `delete_note.annotations.destructiveHint === true`; `list_notes.annotations.readOnlyHint === true`; `add_note.inputSchema.properties.type.enum` equals `['event', 'learn', 'next']`.
  - `list_notes returns the month's notes`: `listNotes` resolves `[note]`; `callTool({ name: 'list_notes', arguments: { year: 2026, month: 11 } })` → not `isError`, `JSON.parse(content[0].text)` equals `{ year: 2026, month: 11, notes: [note] }`; `listNotes` called with `(2026, 11)`.
  - `add_note saves a trimmed note with source api`: arguments `{ year: 2026, month: 11, type: 'learn', text: '  From Muse  ' }` → `addNote` called with `(2026, 11, { type: 'learn', text: 'From Muse', source: 'api' })`; result text parses to the mocked note.
  - `delete_note deletes by id`: `{ year: 2026, month: 11, id: 'n1' }` → `deleteNote` called with `(2026, 11, 'n1')`; text `Deleted note n1`.
  - `it.each` validation → `isError: true`, exact text above, service not called: month 13 (each tool), year 1999, text `'   '`, `'two\nlines'`, `'x'.repeat(501)`, type `'idea'` (assert `isError: true` and text contains `type` — the zod enum may reject it before the shared check), id `'a/b'`.
  - `add_note accepts exactly 500 characters`.
  - `returns Internal error when Firestore fails`: `listNotes` rejects → `isError: true`, text `Internal error`, `console.error` called, no `boom` in the text.
  - `counts only tool calls against the limit`: limiter limit 3; connect three fresh clients and call `listTools()` 5 times (initialize + tools/list repeatedly) — none fail; then 3 `list_notes` calls succeed and the 4th returns `isError: true` with text matching `/^Rate limit reached: try again in \d+ seconds$/`, `listNotes` called 3 times.
  - `answers the 2026-07-28 revision too`: a second client with `versionNegotiation: { mode: 'auto' }` connects and `listTools()` returns three tools.
- [ ] **Step 3: Run** `npx vitest run src/mcp/server.test.ts` — Expected: FAIL, cannot resolve `./server`.
- [ ] **Step 4: Implement** `backend/src/mcp/server.ts` per the Interfaces and tool contract.
- [ ] **Step 5: Run** `npx vitest run && npx tsc --noEmit && npm run lint` — Expected: all pass.
- [ ] **Step 6: Commit** `git commit -m "Add owlet MCP tools for listing, adding and deleting notes"`

### Task 4: Wire `/mcp` into the app behind the token

**Files:**
- Modify: `backend/src/app.ts`, `backend/src/app.test.ts`, `README.md`

**Interfaces:**
- Consumes: `apiTokenAuth` (Task 2), `createMcpRequestHandler` (Task 3).
- Produces: in `createApp()`, one `const apiTokenLimiter = createRateLimiter({ limit: API_TOKEN_LIMIT_PER_HOUR, windowMs: 60 * 60 * 1000 })` and one `matches` passed to `userOrApiTokenAuth({ matches, limiter: apiTokenLimiter, userAuth })` and `app.all('/mcp', apiTokenAuth({ matches }), createMcpRequestHandler({ limiter: apiTokenLimiter }))`, mounted after `express.json()`. `all` so `GET`/`DELETE` reach the SDK, which answers `405` in stateless mode.

- [ ] **Step 1: Write failing tests** in `app.test.ts` (new `describe('/mcp')`; supertest for status codes, an `initialize` JSON-RPC body with `Accept: application/json, text/event-stream`):
  - `rejects /mcp without a token with 401` (token configured).
  - `rejects /mcp with a Firebase-style bearer with 401` — `Bearer firebase-id-token`; no Firebase call is made (status `401`, body `{ error: 'Invalid token' }`).
  - `rejects /mcp when OWLET_API_TOKEN is unset` → `401` with bearer `TOKEN`.
  - `initializes over /mcp with the token` → `200`, response contains `"serverInfo"` with `"name":"owlet"` (parse JSON or the SSE `data:` line).
  - `adds a note through a real MCP client`: `createApp().listen(0)`, `Client` with `requestInit: { headers: { Authorization: bearer } }`, `callTool add_note` → `addNote` called with `source: 'api'`.
  - `answers GET /mcp with 405` (token set).
  - `does not count initialize or tools/list`: 40 supertest `initialize` POSTs plus a client doing 10 `listTools()` → all succeed; then 30 `add_note` calls succeed and the 31st is the rate-limit tool error.
  - `shares the token rate limit between REST and MCP tool calls`: 20 REST token POSTs (`201`) + 10 `add_note` tool calls (ok) → the next tool call is the rate-limit tool error and the next REST token POST is `429` with `Retry-After`; `initialize` and `listTools()` still succeed.
  - `serves /mcp to callers without an Origin header` is covered by the cases above (supertest sends none); no CORS change.
- [ ] **Step 2: Run** `npx vitest run src/app.test.ts` — Expected: new tests FAIL (`404`).
- [ ] **Step 3: Implement** the wiring in `app.ts`.
- [ ] **Step 4: Run** `npx vitest run` — Expected: all pass, including the existing `rate limits API token requests after 30 an hour`.
- [ ] **Step 5: README:** add an "MCP (Muse)" section after "Agent notes (API)": URL `https://owlet-backend-185845390027.asia-northeast1.run.app/mcp`, Bearer header with the same token, the three tools, the 30/hour limit shared between REST token requests and MCP tool calls (protocol requests not counted; over the limit a tool returns a `Rate limit reached` error), and the Muse connector steps from the spec. Add `/mcp` to the token sentence ("The token only works for adding a note — …").
- [ ] **Step 6: Commit** `git commit -m "Serve the MCP tools at /mcp behind the API token"`

### Task 5: Full verification and PR

- [ ] **Step 1: Backend** `cd backend && npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build && npm run format:check` — Expected: all exit 0.
- [ ] **Step 2: Docker build** `docker build -t owlet-backend-mcp backend` — Expected: success (`npm ci --omit=dev` installs the SDK; `node dist/index.js` resolves the CJS builds). Then `docker run --rm -e PORT=8080 -p 18080:8080 owlet-backend-mcp` and `curl -s localhost:18080/health` → `{"ok":true}`; stop it.
- [ ] **Step 3: Frontend unchanged** `cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm test` — Expected: pass.
- [ ] **Step 4: E2E unchanged** — owner confirmed port 8081 is free: `lsof -i :8081` empty, then `cd e2e && npm ci && npm test && npm run test:servers-stopped`; afterwards `lsof -i :8081 -i :9099 -i :8090 -i :5174` empty (no emulator or server left running).
- [ ] **Step 5:** Owner OK'd: push the branch, open a PR to `main` (what changed, verification, Muse setup, header risk, Later follow-up, that a tool call over the limit returns a tool error not HTTP 429; ends with the attribution lines); CI Frontend, Backend and E2E jobs green. Never merge.

### Post-merge production verification (after the owner merges)

- [ ] `gh run list --workflow backend.yml --repo hokita/owlet --limit 1` → the run for the merge commit is `completed success`.
- [ ] `gcloud run revisions list --service owlet-backend --region asia-northeast1 --project owlet-c659da --limit 2` → a new revision created after the merge, serving 100%.
- [ ] `curl -sS https://owlet-backend-185845390027.asia-northeast1.run.app/health` → `{"ok":true}`.
- [ ] MCP smoke test without printing the token (no tool calls, so it uses none of the 30 hourly token requests):

```sh
BASE=https://owlet-backend-185845390027.asia-northeast1.run.app
TOKEN="$(gcloud secrets versions access latest --secret owlet-api-token --project owlet-c659da)"
H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
curl -sS -o /dev/null -w "no token: %{http_code}\n" -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{}'   # expect 401
curl -sS "${H[@]}" -X POST "$BASE/mcp" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'   # expect serverInfo name "owlet"
curl -sS "${H[@]}" -H "MCP-Protocol-Version: 2025-06-18" -X POST "$BASE/mcp" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'   # expect add_note, delete_note, list_notes
unset TOKEN H
```

- [ ] Owner, in Muse: add the custom connector (URL `$BASE/mcp`, Bearer header with the token), then try `list_notes`, `add_note` (note shows in the app with the "agent" badge) and `delete_note` (Muse asks first). If the connector can't send the header, stop and decide — no OAuth.
