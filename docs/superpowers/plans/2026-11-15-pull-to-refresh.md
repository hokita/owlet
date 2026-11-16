# owlet Pull to Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the month screen, pull down at the top of the page to refetch the month's notes, and refetch automatically when the user comes back to the app, without ever clearing the notes on screen.

**Architecture:** Pure pull maths in `pullToRefresh.ts`; a `usePullToRefresh` hook with native touch listeners on `<main>`; a `useRefreshOnReturn` hook on `visibilitychange`. `MonthPage` owns one `refresh()` that reuses `api.getReview`, guards against overlap (and a 30 s minimum interval for auto-refresh), and applies the result with a pure `applyRefresh` that keeps the user's in-flight adds and deletes.

**Tech Stack:** React 18.3, TypeScript 5.4, Vite 5, Tailwind 4, Vitest 1.6 + Testing Library (jsdom), Playwright 1.48 with the Firebase Auth/Firestore emulators. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-pull-to-refresh-design.md`

## Global Constraints

- Red/green TDD for every task: write the failing test, run it red, minimal code, run it green, commit.
- No new dependencies, no backend change, no polling, no live listeners, no push.
- Constants: `RESISTANCE = 0.5`, `MAX_PULL = 120` (px), `THRESHOLD = 70` (px), direction lock `8` px (same as `NoteRow`), `AUTO_REFRESH_MIN_MS = 30_000`, `REFRESHING_HEIGHT = 48` (px, indicator height while the spinner shows).
- Copy, exactly: `Pull to refresh`, `Release to refresh`, `Refreshing…`, `Couldn't refresh. Pull to try again.`
- The pull label/spinner region uses `aria-live="polite"`, never `role="status"` (the Undo toast owns that role; tests and e2e query it).
- The refresh failure banner is its own `role="alert"` element; the load error, add/delete error and their tests are unchanged.
- A refresh never clears `notes`, never sets `loaded` or `loadError`.
- "At the top" means `window.scrollY <= 0`.
- Existing frontend, backend and e2e tests stay green and unchanged, except `e2e/tests/agent.spec.ts` switching to the shared MCP helper (Task 6).
- E2E uses the existing ports: Auth 9099, Firestore 8081, backend 8090, frontend 5174. Don't run e2e while another worker is using them.
- Never print the API token. The e2e test token in `e2e/tests/agent.spec.ts` is a test value; reuse it, don't add a new one.
- Commit messages: one plain sentence in the repo's style, ending with the attribution line from the session.
- Docs-only branch until the owner approves this plan; never merge, never open a PR without being told.

## Review Focus

1. **A horizontal swipe on a note row at the top of the page** → only the row swipe moves; no pull, no fetch, no `preventDefault`. Test in Task 2 (hook) and Task 4 (`MonthPage`, swipe on a `note-row-content`).
2. **Pulling while a refresh is already running** (e.g. auto-refresh on return just fired) → the pull doesn't start, the spinner stays, `getReview` is called once. Test in Task 2 and Task 4.
3. **A long list scrolled down** (`scrollY > 0`), including scrolling back up to 0 mid-gesture → normal scrolling, no pull, no `preventDefault`; a pull needs a new touch that starts at the top. Test in Task 2.
4. **Desktop mouse/trackpad** → mouse events never start a pull, nothing breaks; return auto-refresh still works. Test in Task 2 (mouse events do nothing) and the existing desktop e2e tests stay green (Task 6).
5. **Tab hidden and shown quickly** (several `visibilitychange` cycles inside 30 s, or while a load is still in flight) → at most one refetch. Test in Task 5.

---

### Task 1: Pull maths and `applyRefresh`

**Files:**
- Create: `frontend/src/pullToRefresh.ts`, `frontend/src/pullToRefresh.test.ts`
- Modify: `frontend/src/notes.ts` (move `mergeNotes` here from `MonthPage.tsx`, add `applyRefresh`)
- Modify: `frontend/src/pages/MonthPage.tsx` (import `mergeNotes` from `../notes`; behaviour unchanged)
- Create: `frontend/src/notes.test.ts`

**Interfaces:**
- Produces: `RESISTANCE`, `MAX_PULL`, `THRESHOLD` constants; `pullDistance(dy: number): number`; `isArmed(distance: number): boolean` from `pullToRefresh.ts`.
- Produces: `mergeNotes(current: Note[], incoming: Note[]): Note[]` (moved, unchanged, keeps its comment) and `applyRefresh(current: Note[], server: Note[], local: { added: ReadonlySet<string>; deleted: ReadonlySet<string> }): Note[]` from `notes.ts`.

- [ ] **Step 1: Write the failing tests**

`pullToRefresh.test.ts`:
- `pullDistance follows the finger at half speed`: `pullDistance(100)` → `50`.
- `pullDistance is capped`: `pullDistance(1000)` → `120`.
- `pullDistance is zero for an upward drag`: `pullDistance(-40)` → `0`.
- `isArmed at and past the threshold`: `isArmed(69)` → `false`, `isArmed(70)` → `true`.

`notes.test.ts` (notes `a`, `b`, `c` with increasing `createdAt`):
- `applyRefresh takes the server list`: current `[a, b]`, server `[a, c]`, empty sets → `[a, c]` (a Muse delete of `b` disappears, Muse add `c` appears).
- `applyRefresh keeps a note added during the refresh`: current `[a, b]`, server `[a]`, `added = {b}` → `[a, b]`.
- `applyRefresh hides a note deleted locally`: current `[a]`, server `[a, b]`, `deleted = {b}` → `[a]`.
- `applyRefresh sorts by createdAt`: server `[c, a]` → `[a, c]`.
- `applyRefresh keeps the server's source`: server note with `source: 'api'` comes back with `source: 'api'`.

- [ ] **Step 2: Run red**

Run: `(cd frontend && npx vitest run src/pullToRefresh.test.ts src/notes.test.ts)`
Expected: FAIL — modules/exports not found.

- [ ] **Step 3: Implement**

`pullDistance` = `min(max(dy, 0) * RESISTANCE, MAX_PULL)`. `applyRefresh` = `mergeNotes(server without deleted ids, current notes whose id is in added)`. Move `mergeNotes` to `notes.ts` verbatim and import it in `MonthPage.tsx`.

- [ ] **Step 4: Run green**

Run: `(cd frontend && npm test && npm run lint && npx tsc --noEmit)`
Expected: all PASS, including the unchanged `MonthPage.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pullToRefresh.ts frontend/src/pullToRefresh.test.ts frontend/src/notes.ts frontend/src/notes.test.ts frontend/src/pages/MonthPage.tsx
git commit -m "Add the pull-to-refresh distance maths and a refresh merge that keeps local edits"
```

---

### Task 2: `usePullToRefresh` hook

**Files:**
- Create: `frontend/src/usePullToRefresh.ts`, `frontend/src/usePullToRefresh.test.tsx`

**Interfaces:**
- Consumes: `pullDistance`, `isArmed` from Task 1.
- Produces: `export type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing'` and
  `usePullToRefresh(ref: RefObject<HTMLElement>, options: { onRefresh: () => void; enabled: boolean; refreshing: boolean }): { distance: number; state: PullState }`.
  `refreshing` is owned by the caller; when it's true the hook returns `{ distance: 0, state: 'refreshing' }` and ignores new touches.

- [ ] **Step 1: Write the failing tests**

Test harness: a tiny component that renders `<main data-testid="area">` with the hook attached and prints `state` and `distance`. Touches via `fireEvent.touchStart/touchMove/touchEnd/touchCancel(area, { touches: [{ clientX, clientY }] })`. Scroll via `Object.defineProperty(window, 'scrollY', { value, configurable: true })`, reset to `0` in `afterEach`. `fireEvent.touchMove` returns `false` when the hook called `preventDefault()`.

- `follows the finger at half speed`: start (100, 100), move to (100, 200) → `state` `pulling`, `distance` `50`.
- `says armed past the threshold`: move to (100, 260) → `armed`, `distance` `80`.
- `release past the threshold refreshes`: then `touchEnd` → `onRefresh` called once, `distance` `0`.
- `release under the threshold snaps back without refreshing`: move to (100, 200), end → `onRefresh` not called, `state` `idle`, `distance` `0`.
- `doesn't start when scrolled down`: `scrollY = 300`, move down 200 → `idle`, `touchMove` returns `true` (not prevented), end → no `onRefresh`. *(Review Focus 3)*
- `a touch that starts scrolled down never pulls, even after reaching the top`: start with `scrollY = 300`, set `scrollY = 0`, keep moving down → `idle`. *(Review Focus 3)*
- `cancels if the page scrolls mid-pull`: pulling, then `scrollY = 5` and move → `idle`, end → no `onRefresh`.
- `ignores a horizontal swipe`: start (200, 100), move to (100, 110) then (60, 200) → `idle`, every `touchMove` returns `true`. *(Review Focus 1)*
- `ignores an upward drag`: start (100, 300), move to (100, 200) → `idle`, not prevented.
- `doesn't prevent default before the 8px lock`: move by 5px → returns `true`; once pulling, `touchMove` returns `false`.
- `touchcancel ends without refreshing`: armed, then `touchCancel` → no `onRefresh`, `idle`.
- `a second finger ends the pull`: armed, then a `touchMove` with two touches → `idle`, end → no `onRefresh`.
- `doesn't start while refreshing`: `refreshing: true`, pull 200 → `state` `refreshing`, `distance` `0`, end → no `onRefresh`. *(Review Focus 2)*
- `doesn't start while disabled`: `enabled: false` → `idle`, no `onRefresh`.
- `mouse events do nothing`: `fireEvent.mouseDown/mouseMove/mouseUp` with a 200px downward drag → `idle`, no `onRefresh`. *(Review Focus 4)*
- `removes its listeners on unmount`: unmount, then touch sequence on the detached element → no `onRefresh`.

- [ ] **Step 2: Run red**

Run: `(cd frontend && npx vitest run src/usePullToRefresh.test.tsx)`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `usePullToRefresh` in `frontend/src/usePullToRefresh.ts`**

Add native listeners to `ref.current` in one `useEffect`: `touchstart`, `touchend`, `touchcancel` passive; `touchmove` with `{ passive: false }` (React's touch handlers are passive, so they can't stop the iOS bounce). Keep the gesture (start point, direction, `startedAtTop`) and the latest `options` in refs so the effect subscribes once. Direction is decided after 8px as in `NoteRow`; only `vertical` with `dy > 0`, `startedAtTop` and `scrollY <= 0` now pulls, and only then call `preventDefault()`. Use the same comment density as `NoteRow`.

- [ ] **Step 4: Run green**

Run: `(cd frontend && npm test && npm run lint && npx tsc --noEmit)`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/usePullToRefresh.ts frontend/src/usePullToRefresh.test.tsx
git commit -m "Add a top-only pull-to-refresh touch hook"
```

---

### Task 3: `useRefreshOnReturn` hook

**Files:**
- Create: `frontend/src/useRefreshOnReturn.ts`, `frontend/src/useRefreshOnReturn.test.ts`

**Interfaces:**
- Produces: `useRefreshOnReturn(onReturn: () => void): void` — calls the latest `onReturn` whenever `document.visibilityState` becomes `'visible'`. No guard here; the caller guards (Task 5).

- [ ] **Step 1: Write the failing tests**

Use `renderHook`. Set visibility with `Object.defineProperty(document, 'visibilityState', { value, configurable: true })` and `document.dispatchEvent(new Event('visibilitychange'))`; restore `'visible'` in `afterEach`.
- `calls back when the page becomes visible`: hidden → visible → called once.
- `doesn't call back when the page is hidden`: dispatch with `'hidden'` → not called.
- `doesn't call back on mount`: render → not called.
- `uses the latest callback`: `rerender` with a new fn, become visible → only the new fn is called.
- `stops listening on unmount`.

- [ ] **Step 2: Run red**

Run: `(cd frontend && npx vitest run src/useRefreshOnReturn.test.ts)`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — a `useEffect` subscribing once, latest callback kept in a ref.

- [ ] **Step 4: Run green**

Run: `(cd frontend && npm test && npm run lint && npx tsc --noEmit)`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/useRefreshOnReturn.ts frontend/src/useRefreshOnReturn.test.ts
git commit -m "Add a hook that runs when the app becomes visible again"
```

---

### Task 4: Pull to refresh on `MonthPage`

**Files:**
- Modify: `frontend/src/pages/MonthPage.tsx`
- Modify: `frontend/src/pages/MonthPage.test.tsx` (new `describe('pull to refresh')`; existing tests unchanged)

**Interfaces:**
- Consumes: `usePullToRefresh`, `PullState` (Task 2); `applyRefresh` (Task 1); `api.getReview` (existing).
- Produces (inside `MonthPage`, used by Task 5): `refresh(): void`, a `refreshing` state, an `inFlight` ref (`useRef(false)`), a `lastLoadStartedAt` ref (`useRef(0)`, set to `Date.now()` when the initial load or any refresh starts).

- [ ] **Step 1: Write the failing tests**

Helper `pull(dy)` = touchStart/touchMove/touchEnd on `screen.getByRole('main')` from y 100 to `100 + dy` (window `scrollY` is 0 in jsdom). `getReview` is first resolved by `renderLoaded`, then set per test with `mockResolvedValueOnce` / `mockRejectedValueOnce` / a deferred promise.

- `shows Pull to refresh, then Release to refresh, while pulling`: move 100 → text `Pull to refresh`; move 200 → `Release to refresh`.
- `a pull past the threshold refetches and shows a new note with its agent badge`: server returns `[trip, firestore, run, muse]` where `muse.source = 'api'` → `getReview` called twice with `november`; `muse` row shows `getByRole('img', { name: 'Added by an agent' })`.
- `shows Refreshing… while refetching`: deferred `getReview` → `Refreshing…` visible until resolved, then gone.
- `a short pull doesn't refetch`: pull 100 → `getReview` called once.
- `a refresh drops a note deleted elsewhere`: server returns `[trip, run]` → `Firestore` gone.
- `a failed refresh keeps the notes and says so`: reject → alert `Couldn't refresh. Pull to try again.`; `Trip`, `Firestore`, `Run` still shown; the load error text is absent.
- `the next successful refresh clears the failure`: reject, then resolve → no `Couldn't refresh` alert.
- `a note added during a refresh stays`: deferred `getReview`; add `Read` (resolved `addNote`); resolve server without it → `Read` still shown.
- `a note deleted during a refresh stays gone`: deferred `getReview`; delete `Trip` via its Delete button; resolve server with `Trip` → `Trip` not shown, Undo toast still there; Undo → `Trip` back.
- `a delete that fails during a refresh brings the note back`: deferred `getReview`; delete `Trip`, `deleteNote` rejects, flush with the Undo timer (fake timers `UNDO_MS`); resolve server with `Trip` → `Trip` shown.
- `pulling during a refresh doesn't start another`: deferred `getReview`; pull 200 twice → `getReview` called twice in total (initial + one). *(Review Focus 2)*
- `a horizontal swipe on a note doesn't refresh`: swipe `getAllByTestId('note-row-content')[0]` left 150px → `getReview` called once. *(Review Focus 1)*
- `a refresh after the month changes is ignored`: deferred `getReview`; unmount; resolve → no React warning, no throw.
- `no pull before the month has loaded`: `getReview` pending from the start; pull 200 → `getReview` called once.
- The live region: `screen.getByRole('status')` still resolves to the Undo toast only while a delete is pending (the existing tests already assert this; don't add another `role="status"`).

- [ ] **Step 2: Run red**

Run: `(cd frontend && npx vitest run src/pages/MonthPage.test.tsx)`
Expected: new tests FAIL (no `Pull to refresh` text, `getReview` called once); existing tests PASS.

- [ ] **Step 3: Implement in `MonthPage.tsx`**

- State `refreshing`, `refreshError: string | null`; refs `inFlight`, `lastLoadStartedAt`, `localChanges: { added: Set<string>; deleted: Set<string> } | null`, `mounted` (for ignoring a late result).
- `refresh()`: return if `inFlight.current`; set `inFlight`, `refreshing`, `lastLoadStartedAt = Date.now()`, fresh `localChanges`; on success `setNotes(prev => applyRefresh(prev, review.notes, { added, deleted }))` plus the pending note's id in `deleted`, clear `refreshError`; on failure set `Couldn't refresh. Pull to try again.`; finally reset `inFlight`, `refreshing`, `localChanges`.
- `handleAdd` adds the new id to `localChanges.current?.added`; `handleDelete` adds to `deleted`; `handleUndo` and the `sendPendingDelete` failure path remove it again.
- `<main ref={mainRef}>`; `usePullToRefresh(mainRef, { onRefresh: refresh, enabled: loaded, refreshing })`.
- Indicator as the first child of `<main>`: `aria-live="polite"`, height `distance` px (`REFRESHING_HEIGHT` while refreshing, with a Tailwind `animate-spin` spinner and `Refreshing…`), label from `state`, `overflow-hidden`, a height transition only when not pulling (as `NoteRow` does for its offset).
- Failure banner: `role="alert"` paragraph styled like the existing `error` one, below the load error.

- [ ] **Step 4: Run green**

Run: `(cd frontend && npm test && npm run lint && npx tsc --noEmit)`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MonthPage.tsx frontend/src/pages/MonthPage.test.tsx
git commit -m "Pull down on the month to refetch its notes"
```

---

### Task 5: Auto-refresh on return, with its guard

**Files:**
- Modify: `frontend/src/pages/MonthPage.tsx`, `frontend/src/pages/MonthPage.test.tsx`

**Interfaces:**
- Consumes: `useRefreshOnReturn` (Task 3); `refresh`, `inFlight`, `lastLoadStartedAt`, `loaded` (Task 4).
- Produces: `AUTO_REFRESH_MIN_MS = 30_000` in `MonthPage.tsx`.

- [ ] **Step 1: Write the failing tests**

`describe('refresh on return')`, with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime` so promises and `findBy` keep working; helper `returnToApp()` = hidden → visible as in Task 3.

- `refreshes when coming back after 30 seconds`: load, advance 30 000 ms, `returnToApp()` → `getReview` called twice; a new note from the server shows.
- `skips a return within 30 seconds of the load`: advance 29 999 ms → called once.
- `hidden and shown quickly several times refreshes once`: advance 31 s, `returnToApp()` ×3 → called twice in total. *(Review Focus 5)*
- `skips a return while a refresh is running`: deferred refresh in flight, advance 31 s, `returnToApp()` → no extra call. *(Review Focus 5)*
- `a pull right after an auto-refresh still works`: auto-refresh resolves, pull 200 immediately → called three times (the interval doesn't apply to a pull).
- `does nothing before the month has loaded`: initial `getReview` pending, advance 31 s, `returnToApp()` → called once.
- `a failed auto-refresh keeps the notes and shows the message`: reject → `Couldn't refresh. Pull to try again.`, notes still shown.

- [ ] **Step 2: Run red**

Run: `(cd frontend && npx vitest run src/pages/MonthPage.test.tsx)`
Expected: new tests FAIL (`getReview` called once).

- [ ] **Step 3: Implement**

Set `lastLoadStartedAt.current = Date.now()` when the initial load effect starts (if Task 4 didn't). `useRefreshOnReturn(() => { if (!loaded || inFlight.current || Date.now() - lastLoadStartedAt.current < AUTO_REFRESH_MIN_MS) return; refresh() })`, with a one-line comment on why the guard exists.

- [ ] **Step 4: Run green**

Run: `(cd frontend && npm test && npm run lint && npx tsc --noEmit)`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MonthPage.tsx frontend/src/pages/MonthPage.test.tsx
git commit -m "Refresh the month when coming back to the app, at most every 30 seconds"
```

---

### Task 6: E2E — a note added over MCP appears after a pull

**Files:**
- Create: `e2e/fixtures/mcp.ts`
- Create: `e2e/tests/refresh.spec.ts`
- Modify: `e2e/tests/agent.spec.ts` (use the helper; assertions unchanged)

**Interfaces:**
- Produces: `API_TOKEN`, `API_URL` and `addNoteOverMcp(request: APIRequestContext, args: { year: number; month: number; type: 'event' | 'learn' | 'next'; text: string }): Promise<string>` (POSTs the `tools/call` `add_note` JSON-RPC exactly as `agent.spec.ts` does today, asserts status 200, returns the body text) in `e2e/fixtures/mcp.ts`. Move the token and its "test value, not a secret" comment there.

- [ ] **Step 1: Write the failing test**

`refresh.spec.ts`, `test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })`:
`test('a note added over MCP shows after pulling to refresh', …)`:
1. `signIn(page)`, `page.goto('/2001/7')` (month not used by other specs), wait for region `Events`.
2. `addNoteOverMcp(request, { year: 2001, month: 7, type: 'event', text: \`muse ${run}\` })`.
3. `expect(page.getByText(\`muse ${run}\`)).toHaveCount(0)` — proves the refresh, not the load, shows it.
4. Pull with real touch events through CDP (`page.context().newCDPSession(page)`, `Input.dispatchTouchEvent`): `touchStart` at (195, 200), `touchMove` to y 260, 320, 380, 420, `touchEnd`.
5. Row `getByRole('listitem').filter({ hasText: \`muse ${run}\` })` shows `getByRole('img', { name: 'Added by an agent' })`.

- [ ] **Step 2: Run red against `main`'s behaviour**

Don't use `git stash` (the stash is shared between worktrees). Temporarily comment out the `usePullToRefresh(...)` call in `MonthPage.tsx`, run
`(cd e2e && npx playwright test tests/refresh.spec.ts)`
Expected: FAIL at step 5 (note never appears). Restore the line (`git diff frontend` must be empty afterwards).

- [ ] **Step 3: Refactor `agent.spec.ts` to use `addNoteOverMcp`**

- [ ] **Step 4: Run green — whole e2e suite**

Run: `(cd e2e && CI=1 npm test && npm run test:servers-stopped)`
Expected: all specs PASS (including the desktop `month.spec.ts` tests — Review Focus 4), then `All e2e servers stopped.`

- [ ] **Step 5: Final check of every suite**

Run: `(cd frontend && npm test && npm run lint && npx tsc --noEmit && npm run format:check) && (cd backend && npm test)`
Expected: all PASS; backend untouched.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures/mcp.ts e2e/tests/refresh.spec.ts e2e/tests/agent.spec.ts
git commit -m "Check end to end that a note added over MCP appears after pulling to refresh"
```

---

## After merge (manual, by the owner)

On the iPhone Home Screen app: pull at the top (label, spinner, new Muse note with its badge), pull while scrolled down (just scrolls), swipe a row (deletes, no refresh), add a note with Muse, switch away for over 30 s and come back (it appears).
