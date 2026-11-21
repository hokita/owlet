# Remove Useless Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete every code comment that explains, restates or narrates, keeping only warnings about non-obvious traps and tool directives, with no change in behaviour.

**Architecture:** Comment-only edits, one commit per area (backend, frontend, e2e, config). Each task is proven comments-only by comparing the AST token stream and the build output against `origin/main`, then runs the area's full test, lint, typecheck, format and build.

**Tech Stack:** TypeScript (Express backend, React/Vite frontend, Playwright e2e), GitHub Actions YAML, Firestore rules, bash.

**Spec:** The approved brief of 2026-11-21 (no spec file). Its rules are copied into Global Constraints.

## Global Constraints

- Delete comments that explain what code does, restate a name, narrate history, or reference tasks/plans/PRs/reviews/specs. This includes test comments that describe the test.
- Keep only the comments in the Keep-list below, using the one-line wording given there. A kept comment marked "as is" stays unchanged.
- Never edit code. Never reformat, except to avoid a blank-line pileup (two blank lines in a row, or a blank line right after `{`) where a comment was removed.
- Don't touch: `docs/`, `README.md`, lockfiles, `frontend/public/*` (binary), `*.json` (no comments), `.env.e2e` files, ignore files and `.prettierrc` (no comments).
- Workflows, Dockerfile and config follow the same rule as code. `backend/Dockerfile` has no comments.

## Inventory

AST scan (TypeScript compiler, all tracked `.ts/.tsx/.js/.mjs`) cross-checked with grep: 217 comments, 219 lines. Plus 21 lines in config, YAML, shell and rules files. The repo has no generated or vendored source: `dist/` and `node_modules/` are untracked.

| Area | Comment lines now | Kept after (lines) |
|---|---|---|
| `backend/src` | 49 | 15 |
| `frontend/src` | 142 | 28 |
| `e2e/` | 28 | 9 |
| config: `.github/workflows`, `backend/.env.example`, `scripts/check-node-pins.sh`, `firestore.rules` | 21 | 4 |
| **Total** | **240** | **56** (**184 lines removed**) |

`frontend/index.html`, `frontend/src/index.css` and `backend/Dockerfile` have no comments.

## Keep-list

W = a warning about a non-obvious trap. T = a tool reads it. Line numbers are as on `origin/main`.

**backend**
- `src/app.ts:14-16` W, cors library trap → `// cors sends no CORS headers at all when origin is undefined, so default to '*'.`
- `src/app.ts:26` W, narrowing to POST would break the SDK's 405 replies. As is.
- `src/config/firebase.ts:3-5` W, platform trap → `// Local dev has no metadata server, so verifyIdToken() needs the project ID passed explicitly.`
- `src/mcp/server.ts:152-154` W, SDK oddity → `// The SDK answers rejected requests (406, 415, ...) itself and reports them only through onerror.`
- `src/mcp/server.ts:159-160` W → `// express.json() has already read the body, so it's passed in rather than re-read from the stream.`
- `src/mcp/server.ts:164` W, the second onerror looks redundant but isn't. As is.
- `src/middleware/apiToken.ts:4` W, explains the magic number 43. As is.
- `src/middleware/apiToken.ts:23` W, security: timingSafeEqual length. As is.
- `src/middleware/apiToken.ts:28-29` W, security, and the missing rate limit is deliberate → `// API token only, never a Firebase ID token. Not rate limited here: each MCP tool call is.`
- `src/middleware/rateLimit.ts:5-6` W, the limit is per instance → `// Kept in memory, so the limit is per Cloud Run instance.`
- `src/services/noteInput.ts:91` W, security: path traversal. As is.
- `src/services/reviews.ts:18` W, concurrency: the doc key prevents a race. As is.
- `src/services/reviews.ts:29` W, legacy data: the fallback looks removable. As is.
- `src/services/reviews.ts:83` W, Firestore rejects an empty update. As is.
- `src/services/reviews.ts:101` W, `create()` vs `set()` is the conflict check. As is.

**frontend/src**
- `components/Composer.tsx:15-16` W → `// localStorage can throw (private mode, blocked storage); fall back silently.`
- `components/Composer.tsx:22` and `:31` `// ignore` T: eslint `no-empty` (in `eslint.configs.recommended`) fails on an empty `catch {}`. As is.
- `components/Composer.tsx:108` W, IME. As is.
- `components/Composer.tsx:112` W, IME. As is.
- `components/Composer.tsx:132-133` W, race → `// Only clear what was sent: anything typed while sending is the next note.`
- `components/NoteRow.tsx:24-26` W, event order → `// The browser fires a click after touchend, so this is cleared by the next touchstart, not touchend.`
- `components/NoteRow.tsx:81-82` W → `// A canceled gesture (system interrupt, incoming call) never deletes.`
- `components/NoteRow.tsx:108-110` W, a11y: the button must not be hidden → `{/* Screen readers can't swipe, so the button stays in the accessibility tree (sr-only). */}`
- `month.ts:6` W, coupled to the backend's range. As is.
- `notes.ts:15-17` W, race → `// A note added before the month loads can arrive from both the POST and the GET, in either order.`
- `notes.ts:24-26` W, race → `// Local adds, deletes and edits made while a refresh was in flight win over its result.`
- `pages/MonthPage.test.tsx:507-508` W, the test's limit → `// React 18 doesn't warn on a late setState, so this can't catch a missing guard.`
- `pages/MonthPage.tsx:42-43` W, relies on the parent's `key` → ``// Remounted per month via `key`, so state starts fresh and a pending delete is sent.``
- `pages/MonthPage.tsx:138-139` W, race → `// The server may answer before a pending delete lands, so those notes count as deleted.`
- `pages/MonthPage.tsx:214-216` W, race with Muse edits → `// Diff against the copy the Composer opened with, so a refresh's newer fields aren't undone.`
- `pages/MonthPage.tsx:288-289` W, ordering → `// Send the delete while still signed in: the unmount flush runs after sign-out.`
- `pages/MonthPage.tsx:340` W, a11y: deliberately not `role="status"`. As is.
- `pages/MonthPage.tsx:412-415` W → `// Keep the copy it opened with: the Composer doesn't reload, so a refreshed copy would undo Muse's update.`
- `useAutoGrow.ts:10` W. As is.
- `useAutoGrow.ts:18` W, why not CSS `field-sizing`. As is.
- `useAutoGrow.ts:21` W, a deliberately unread parameter. As is.
- `useAutoGrow.ts:28-29` W, deliberately no dependency list → `// No dependency list: the same textarea can move between fields, leaving a stale height.`
- `useAutoGrow.ts:38-40` W, loop → `// Only a width change re-fits: fitting changes the height, which must not loop.`
- `useKeyboardInset.ts:3-5` W, iOS Safari → `// iOS Safari doesn't resize the layout viewport for the keyboard, so a fixed bottom bar needs this offset.`
- `usePullToRefresh.ts:31` W. As is.
- `usePullToRefresh.ts:87-88` W, iOS → `// Not passive: React's touch handlers are, and a passive listener can't stop the iOS bounce.`
- `vite-env.d.ts:1` T, `/// <reference types="vite/client" />`. As is.

**e2e**
- `fixtures/mcp.ts:3` W, security: a test value, not a leaked secret. As is.
- `global-setup.ts:15-18` W, emulator → `// accounts:signUp fails with EMAIL_EXISTS if a prior run created the user, who may not be verified yet.`
- `global-setup.ts:54-57` W, emulator → `// The emulator honors emailVerified only from a privileged caller (Bearer owner) by localId, else silently ignores it.`
- `playwright.config.ts:21-24` W, orphaned Java → `// SIGKILL would orphan the Firestore emulator (Java, own process group) on :8081; SIGTERM lets firebase stop it.`
- `tests/edit.spec.ts:5`, `tests/month.spec.ts:4-5`, `tests/multiline.spec.ts:4` W, emulator data persists → `// The emulator keeps data between tests, so note texts are made unique per run.`
- `tests/refresh.spec.ts:19` W, Chromium-only. As is.

**config**
- `.github/workflows/backend.yml:68-71` W, deploy trap → `# Cloud Run fails a deploy that references a missing secret, so it's only wired in once this variable is set.`
- `.github/workflows/frontend.yml:51-52` W, security: the key isn't a leak → `# Public by design: Firestore rules and the backend's auth enforce security, not these keys.`
- `scripts/check-node-pins.sh:1` T, the shebang. As is.
- `firestore.rules:3-11` W, security: why deny-all is safe → `// Deny all: only the backend's Admin SDK touches Firestore, and it bypasses these rules.`

Removed in config: `backend/.env.example:1` (README's env table documents `ALLOWED_EMAILS` the same way), and `scripts/check-node-pins.sh:2-4,12` (header, usage and signature comments).

## Review Focus

1. Empty `catch {}`: deleting `// ignore` breaks `npm run lint` (`no-empty`). It is on the keep-list, and lint runs after Task 2.
2. JSX comments: deleting a `{/* */}` must not leave `{}` or change significant JSX whitespace. The token check normalizes newline-only JsxText, and the Vite bundle diff catches what that misses.
3. Trailing comments in `backend/src/services/noteInput.test.ts:32-38`: delete only `// ...`, keep the comma and the line, and strip the trailing space.
4. Blank-line pileups and shortened lines over 100 columns: `npm run format:check` per package. Prettier doesn't wrap comments, so check the long kept lines by eye.
5. A merge to main redeploys the backend, the frontend and the Firestore rules (via the `paths` trigger on `firestore.rules`), all with identical code. Flag this when the PR is opened.

---

### Task 0: Baseline

- [ ] **Step 1: Export main and build it**

```bash
S=<scratchpad>; mkdir -p $S/base && git archive origin/main | tar -x -C $S/base
for p in backend frontend e2e; do ln -s $PWD/$p/node_modules $S/base/$p/node_modules; done
(cd $S/base/backend && npx tsc --removeComments --outDir $S/base-backend-js)
(cd $S/base/frontend && npx vite build --outDir $S/base-frontend-dist)
```
Expected: both builds succeed.

- [ ] **Step 2: Save the token-compare script to `$S/tokens.cjs`**

Usage: `node $S/tokens.cjs <typescript-dir> <baseRoot> <files...>`. For each file, parse the base and current versions with `ts.createSourceFile` (TSX for `.tsx`). Walk `node.getChildren(sf)` down to the leaves (`getChildCount() === 0`, skipping `EndOfFileToken`) and collect `kind:text`. For `JsxText`, replace `/\s*\n\s*/g` with a single space, trim it, and drop it if empty. Print each file whose sequences differ and exit 1 if any do.

- [ ] **Step 3: Run the suites on the untouched branch**

In `backend` and `frontend`: `npm test && npm run lint && npm run build && npm run format:check`. Then `scripts/check-node-pins.sh`. Expected: all pass. Record any failures that already exist on main, so later tasks aren't blamed for them.

### Per-task verification (V)

After each edit task, before committing:
1. `node $S/tokens.cjs backend/node_modules/typescript $S/base $(git diff --name-only origin/main -- '*.ts' '*.tsx' '*.js' '*.mjs')`. Expected: no output, exit 0.
2. `git diff -U0 origin/main | grep -E '^\+[^+]'` lists only kept comments in their new wording.
3. The area's `npm test`, `npm run lint`, `npm run build` (this is the typecheck: `tsc` / `tsc && vite build`) and `npm run format:check`. Expected: pass. For e2e, `npx tsc --noEmit -p e2e` won't work because e2e has no tsconfig, so step 1 is its check.

### Task 1: backend (`backend/src/**`, 34 comment lines removed)

- [ ] Delete every comment in `backend/src` except the backend keep-list, and rewrite the kept ones as listed.
- [ ] Run V. Also run `npx tsc --removeComments --outDir $S/new-backend-js` in `backend`, then `diff -r $S/base-backend-js $S/new-backend-js`. Expected: no difference.
- [ ] Commit: `chore(backend): remove comments that only restate the code`

### Task 2: frontend (`frontend/src/**`, 114 comment lines removed)

- [ ] Delete every comment in `frontend/src` except the frontend keep-list, and rewrite the kept ones as listed.
- [ ] Run V. Also run `npx vite build --outDir $S/new-frontend-dist` in `frontend`, then `diff -r -x '*.map' $S/base-frontend-dist $S/new-frontend-dist`. Expected: no difference (the minifier drops comments).
- [ ] Commit: `chore(frontend): remove comments that only restate the code`

### Task 3: e2e (`e2e/**`, 19 comment lines removed)

- [ ] Delete every comment in `e2e/` except the e2e keep-list (`scripts/assert-servers-stopped.mjs:1-3` goes), and rewrite the kept ones as listed.
- [ ] Run V steps 1 and 2.
- [ ] Commit: `chore(e2e): remove comments that only describe the tests`

### Task 4: config (17 comment lines removed)

- [ ] Edit `.github/workflows/backend.yml`, `.github/workflows/frontend.yml`, `backend/.env.example`, `scripts/check-node-pins.sh` and `firestore.rules` as the config keep-list says.
- [ ] Check that only comment lines changed. For each `f`, run `diff <(git show origin/main:$f | grep -vE '^\s*(#|//)') <(grep -vE '^\s*(#|//)' $f)`. Expected: no output. The shebang starts with `#!`, so the filter skips it, and V step 2 shows it unchanged.
- [ ] Run `scripts/check-node-pins.sh`. Then parse each workflow with `e2e/node_modules/yaml`: `node -e "require('./e2e/node_modules/yaml').parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`. Expected: no errors.
- [ ] Commit: `chore: remove narration comments from workflows, scripts and rules`

### Task 5: Final check

- [ ] Rerun all of V across the branch, plus both build diffs.
- [ ] Check that ports 5174, 8090, 9099 and 8081 are free (`lsof -nP -iTCP:<port> -sTCP:LISTEN`). If one is taken, report it and don't kill anything. Then run `cd e2e && npm test` once and `npm run test:servers-stopped`. Expected: all pass.
- [ ] Grep the branch for every comment left, and check that the list matches the Keep-list exactly (56 lines).
