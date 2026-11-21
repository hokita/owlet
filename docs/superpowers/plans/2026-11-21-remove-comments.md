# Remove All Code Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete every code comment, keeping only directives that a tool actually reads, with no change in behaviour.

**Architecture:** Comment-only edits, one commit per area (backend, frontend, e2e, config). Each task is proven comments-only by comparing the AST token stream and the build output against `origin/main`, then runs the area's tests, lint, typecheck/build and Prettier check.

**Tech Stack:** TypeScript (Express backend, React/Vite frontend, Playwright e2e), GitHub Actions YAML, Firestore rules, bash.

**Spec:** The user's instruction of 2026-11-21 (strictest cut, no spec file). It supersedes the earlier warning keep-list. Its rules are copied into Global Constraints.

## Global Constraints

- Delete every comment, including warnings about traps, races and SDK bugs.
- Keep only directives that a tool actually reads: eslint-disable*, @ts-expect-error/@ts-ignore, biome-ignore, prettier-ignore, //go:build, //go:embed, `/// <reference`, shebangs and license headers.
- If deleting a comment breaks a tool, keep the minimum the tool needs and list it in the PR body.
- Never ignore lint or type errors. Remove every lint/type ignore (eslint-disable*, biome-ignore, @ts-ignore, @ts-expect-error, //nolint, and any comment kept only to satisfy `no-empty`), and fix the code so that lint and typecheck pass without it. Do it in separate code commits after the comment removal, with a failing test first where behaviour is involved. List each fix in the PR body under "Lint ignores removed". Only build-needed directives stay: //go:build, //go:embed, `/// <reference`, shebangs.
- Don't add code to make up for a removed warning. The PR body lists each one under "Traps that lost their comment".
- Never edit code. Never reformat, except to avoid a blank-line pileup (two blank lines in a row, or a blank line right after `{` or before `}`) where a comment was removed.
- Don't touch: `docs/`, `README.md`, lockfiles, `frontend/public/*`, `*.json`, `.env.e2e` files, ignore files and `.prettierrc`.

## Inventory

AST scan (TypeScript compiler, all tracked `.ts/.tsx/.js/.mjs`) cross-checked with grep: 217 comments, 219 lines. Plus 21 lines in config, YAML, shell and rules files. The repo has no generated or vendored source: `dist/` and `node_modules/` are untracked. The codebase has no eslint/ts/prettier ignore directives.

| Area | Comment lines now | Kept |
|---|---|---|
| `backend/src` | 49 | 0 |
| `frontend/src` | 142 | 3 after Task 2, 1 after Task 5 |
| `e2e/` | 28 | 0 |
| config: `.github/workflows`, `backend/.env.example`, `scripts/check-node-pins.sh`, `firestore.rules` | 21 | 1 |
| **Total** | **240** | **2** after Task 5 (**238 lines removed**) |

## Keep-list

- `frontend/src/vite-env.d.ts:1`: `/// <reference types="vite/client" />`. TypeScript reads it.
- `scripts/check-node-pins.sh:1`: `#!/usr/bin/env bash`. The shebang.
- `frontend/src/components/Composer.tsx:22` and `:31`: `// ignore` inside an empty `catch {}`. A third one is the submit handler's `catch {}` (main `:136-137`), whose only content is a comment. ESLint's `no-empty`, part of `eslint.configs.recommended`, fails on an empty block without a comment. Task 2 keeps them so that its commit stays comments-only. Task 5 removes them by fixing the code. The repo has no other lint/type ignore directives (`git grep` for eslint-disable, ts-ignore, ts-expect-error, biome-ignore, nolint, prettier-ignore and c8/istanbul finds none).

## Traps that lose their comment (for the PR body)

Backend
- `backend/src/app.ts`: cors sends no CORS headers when `origin` is undefined, hence the explicit `'*'` default.
- `backend/src/app.ts`: `/mcp` is mounted for all methods, so that the SDK can answer GET/DELETE with 405.
- `backend/src/config/firebase.ts`: local dev has no metadata server, so `verifyIdToken()` needs the project ID passed explicitly.
- `backend/src/mcp/server.ts`: the SDK rejects bad requests itself and reports them only through `onerror`. `onerror` is set both on the server instance and on the handler, and neither is redundant.
- `backend/src/mcp/server.ts`: `express.json()` has already read the body, so it is passed in rather than read again.
- `backend/src/middleware/apiToken.ts`: digests are compared so that both sides have the length `timingSafeEqual` requires. The minimum length of 43 is 32 random bytes in base64url.
- `backend/src/middleware/apiToken.ts`: `/mcp` accepts only the API token, never a Firebase ID token. It isn't rate limited there because each MCP tool call is.
- `backend/src/middleware/rateLimit.ts`: the limiter lives in memory, so the limit applies per Cloud Run instance.
- `backend/src/services/noteInput.ts`: a `/` in a note id would point a delete at a different Firestore path.
- `backend/src/services/reviews.ts`: the review doc is keyed `YYYY-MM` so that "one review per month" can't race.
- `backend/src/services/reviews.ts`: notes saved before `source` existed fall back to `'app'`.
- `backend/src/services/reviews.ts`: Firestore rejects an empty update, so a no-op edit writes nothing.
- `backend/src/services/reviews.ts`: `create()` rather than `set()` is the check that a note being moved doesn't collide.

Frontend
- `frontend/src/components/Composer.tsx`: `localStorage` can throw (private mode, blocked storage), hence the empty catches.
- `frontend/src/components/Composer.tsx`: Escape and Return are ignored while an IME is composing.
- `frontend/src/components/Composer.tsx`: only the text that was sent is cleared, so anything typed while sending survives.
- `frontend/src/components/NoteRow.tsx`: the browser fires a click after touchend, so the swipe flag is cleared on the next touchstart, not on touchend.
- `frontend/src/components/NoteRow.tsx`: a cancelled touch (system interrupt) never deletes.
- `frontend/src/components/NoteRow.tsx`: the delete button stays sr-only rather than hidden, because screen readers can't swipe.
- `frontend/src/month.ts`: the year range must match the backend's.
- `frontend/src/notes.ts`: a note added before the month loads can arrive from both the POST and the GET, in either order.
- `frontend/src/notes.ts`: local adds, deletes and edits made during a refresh win over its result.
- `frontend/src/pages/MonthPage.tsx`: the page relies on being remounted per month via `key`.
- `frontend/src/pages/MonthPage.tsx`: the server may answer before a pending delete lands, so pending notes count as deleted.
- `frontend/src/pages/MonthPage.tsx`: edits are diffed against the copy the Composer opened with, so that a refresh's newer fields from Muse aren't undone. The same applies when the open note is tapped again.
- `frontend/src/pages/MonthPage.tsx`: the delete must be sent before sign-out, because the unmount flush runs after it.
- `frontend/src/pages/MonthPage.tsx`: the moved notice deliberately isn't `role="status"`, because the Undo toast owns that role.
- `frontend/src/pages/MonthPage.test.tsx`: React 18 doesn't warn on a late setState, so the late-result test can't catch a missing guard.
- `frontend/src/useAutoGrow.ts`: the height is reset first so that scrollHeight can shrink. CSS `field-sizing` isn't used because iOS Safari support is too recent. The `text` parameter is deliberately unread. The effect has deliberately no dependency list. Only a width change re-fits, to avoid a resize loop.
- `frontend/src/useKeyboardInset.ts`: iOS Safari doesn't resize the layout viewport for the keyboard.
- `frontend/src/usePullToRefresh.ts`: the ref must point at an always-mounted element. The listener is non-passive so that it can stop the iOS bounce.

e2e
- `e2e/fixtures/mcp.ts`: the API token is a test value, not a secret.
- `e2e/global-setup.ts`: the Auth emulator returns EMAIL_EXISTS for an existing user. It honors `emailVerified` only from a privileged caller (Bearer owner) identified by `localId`.
- `e2e/playwright.config.ts`: SIGKILL would orphan the Firestore emulator (Java) on :8081, hence SIGTERM.
- `e2e/tests/{edit,month,multiline}.spec.ts`: the emulator keeps data between tests, so note texts are made unique per run.
- `e2e/tests/refresh.spec.ts`: `newCDPSession` makes the test Chromium-only.

Config
- `.github/workflows/backend.yml`: Cloud Run fails a deploy that references a missing secret, so the API token is wired in only when `OWLET_API_TOKEN_SECRET` is set.
- `.github/workflows/frontend.yml`: the Firebase API key is public by design.
- `firestore.rules`: deny-all is safe because only the backend's Admin SDK, which bypasses rules, touches Firestore.

## Review Focus

1. Empty `catch {}`: deleting `// ignore` breaks `npm run lint`. Both stay through Task 2, and Task 5 replaces them with real code.
2. JSX comments (`NoteRow.tsx`, `MonthPage.tsx`): deleting a `{/* */}` must leave no `{}` and no significant JSX whitespace change. The token check normalizes newline-only JsxText, and the Vite bundle diff catches the rest.
3. Trailing comments in `backend/src/services/noteInput.test.ts:32-38`: delete only `// ...` and the space before it, and keep the comma.
4. Blank-line pileups: `npx prettier --check src` per package (Prettier collapses multiple blank lines). `npm run format:check` already fails on main, because it scans the untracked `dist/`.
5. A merge to main redeploys the backend, the frontend and the Firestore rules (the `paths` trigger on `firestore.rules`), all with identical code. The PR body says so.

---

### Task 0: Baseline (controller, done)

Done by the controller:
- Exported `origin/main` to `$S/base`, with `node_modules` symlinked in.
- Built `$S/base-backend-js` (`tsc --removeComments`) and `$S/base-frontend-dist` (`vite build`). Both builds are reproducible.
- Wrote `$S/tokens.cjs` (usage: `node $S/tokens.cjs <typescript-dir> <baseRoot> <files...>`). It compares AST leaf tokens and exits 1 on any difference.
- Ran the baseline: tests, lint, build and `prettier --check src` pass on main, and so does `scripts/check-node-pins.sh`.
- Found in Task 2: Tailwind scans source text, so the word "inline" in a deleted comment had generated an unused `.inline{display:inline}` rule. Removing the comment removes that rule from the CSS. The JS bundle stays byte-identical. Expected CSS diff: exactly that rule.

`$S` is the controller's scratchpad, and its path is given in each brief.

### Per-task verification (V)

After each edit task, before committing:
1. `node $S/tokens.cjs $PWD/backend/node_modules/typescript $S/base <changed .ts/.tsx/.js/.mjs files>`. Expected: no output, exit 0.
2. `git diff -U0 origin/main -- <area> | grep -E '^\+[^+]'`. Expected: no output (only deletions), apart from lines that only lost a trailing comment.
3. In each package the task touched: `npm test`, `npm run lint`, `npm run build` (this is the typecheck) and `npx prettier --check src`. Expected: pass. e2e has no tsconfig or lint, so check it with step 1 and `npx --prefix backend prettier --check e2e`.

### Task 1: backend (`backend/src/**`, 49 comment lines removed)

- [ ] Delete every comment in `backend/src`, test files included.
- [ ] Run V. Also run `npx tsc --removeComments --outDir $S/new-backend-js` in `backend`, then `diff -r $S/base-backend-js $S/new-backend-js`. Expected: no difference.
- [ ] Commit, including this updated plan file: `chore(backend): remove code comments`

### Task 2: frontend (`frontend/src/**`, 139 comment lines removed)

- [ ] Delete every comment in `frontend/src` except the three frontend lines in the Keep-list.
- [ ] Run V. Also run `npx vite build --outDir $S/new-frontend-dist` in `frontend`, then `diff -r -x '*.map' $S/base-frontend-dist $S/new-frontend-dist`. Expected: no difference.
- [ ] Commit, including the updated plan file: `chore(frontend): remove code comments`

### Task 3: e2e (`e2e/**`, 28 comment lines removed)

- [ ] Delete every comment in `e2e/`.
- [ ] Commit the updated plan file along with it.
- [ ] Run V steps 1, 2 and the e2e Prettier check.
- [ ] Commit: `chore(e2e): remove code comments`

### Task 4: config (20 comment lines removed)

- [ ] Delete the comments in `.github/workflows/backend.yml`, `.github/workflows/frontend.yml`, `backend/.env.example`, `scripts/check-node-pins.sh` (keep the shebang) and `firestore.rules`.
- [ ] Check that only comment lines changed. For each `f`, run `diff <(git show origin/main:$f | grep -vE '^\s*(#|//)') <(grep -vE '^\s*(#|//)' $f)`. Expected: no output. Then run V step 2.
- [ ] Run `scripts/check-node-pins.sh`. Then parse each workflow: `node -e "require('./e2e/node_modules/yaml').parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`. Expected: no errors.
- [ ] Commit: `chore: remove comments from workflows, scripts and rules`

### Task 5: Remove the `no-empty` workaround in `frontend/src/components/Composer.tsx` (code change)

**Files:** Modify `frontend/src/components/Composer.tsx` (`loadLastType`, `saveLastType`, and the submit handler's `try/catch/finally` around `onAdd`). Test: `frontend/src/components/Composer.test.tsx`.

- [ ] **Step 1: Pin the fallback behaviour with tests, then delete both `// ignore` lines to get the red.** Add two tests to `Composer.test.tsx`:
  - `starts on event when localStorage.getItem throws`: `vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })`, render, and expect the `event` button to have `aria-pressed="true"`.
  - `still adds the note when localStorage.setItem throws`: spy on `setItem` the same way, pick `next`, type, and click Add. Expect `onAdd` to have been called and no error to be thrown.

  Restore the spies in `afterEach`. These tests pass on the current code, because the behaviour already exists. Then delete the two `// ignore` lines and run `npm run lint`. Expected: FAIL, `no-empty` at both catches. That lint failure is the red.
- [ ] **Step 1b: The submit catch.** `keeps the text when adding fails` already covers it. Delete its comment as well, and lint fails on the empty catch.
- [ ] **Step 2: Make the catches non-empty with real code.** Submit: `const added = await onAdd({ type, text: trimmed }).then(() => true, () => false)`, then clear the text and save the type only `if (added)`. Keep the `finally` work (`setSending(false)`, focus) after it, unconditionally, so no try/catch is needed. `loadLastType(): NoteType` reads the key through `readStoredType(): string | null`, which is `try { return localStorage.getItem(LAST_TYPE_KEY) } catch { return null }`. `saveLastType(type: NoteType): boolean` is `try { localStorage.setItem(...); return true } catch { return false }`. No behaviour change. No new comments.
- [ ] **Step 3: Green.** `npm test`, `npm run lint`, `npm run build` and `npx prettier --check src` in `frontend`. Expected: all pass. `git grep -n '// ignore'` finds nothing.
- [ ] **Step 4: Commit:** `fix(frontend): handle storage errors without empty catch blocks`

### Task 6: Final check

- [ ] Rerun all of V across the branch, plus both build diffs.
- [ ] Check that ports 5174, 8090, 9099 and 8081 are free (`lsof -nP -iTCP:<port> -sTCP:LISTEN`). If one is taken, report it and don't kill anything. Then run `cd e2e && npm test` once and `npm run test:servers-stopped`. Expected: all pass.
- [ ] Rescan every tracked file for comments. Expected: only `frontend/src/vite-env.d.ts:1` and the shebang `scripts/check-node-pins.sh:1` remain.
