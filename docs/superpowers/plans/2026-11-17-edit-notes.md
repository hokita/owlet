# owlet Edit Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit a note's text, type and month — in the app (Composer "Editing" mode) and from Muse (MCP `update_note`) — without breaking delete/Undo or refresh.

**Architecture:** One backend service function `updateNote` (a Firestore transaction: in-place update, or same-id move that keeps `createdAt` and `source`), validated by a new `parseNoteUpdate` shared by a REST `PATCH` route and an MCP tool. On the client, `api.updateNote`, an `edited` set in `applyRefresh`, a tappable `NoteRow`, an edit mode in `Composer`, and optimistic save/revert in `MonthPage`.

**Tech Stack:** Express 4 + firebase-admin (Firestore), `@modelcontextprotocol/server` + zod, Vitest + supertest; React 18 + TypeScript + Tailwind 4, Vitest + Testing Library (jsdom); Playwright with the Firebase Auth/Firestore emulators. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-edit-notes-design.md`

## Global Constraints

- Red/green TDD for every task: failing test, run red, minimal code, run green, commit.
- No new dependencies. No schema change: no day/date field, no `updatedAt` on notes, no edit history, no "edited" marker.
- `source` is never read from client input anywhere (REST body, MCP args). A move copies the stored value (`'api'` stays `'api'`, anything else becomes `'app'`).
- `createdAt` and the note id never change, in place or on a move.
- Text rule unchanged: trimmed, 1–500 chars, no `\r`/`\n`. Month range 2000-01…2100-12.
- Error strings: REST `Invalid month`, `Invalid type`, `Invalid text`, `Invalid id`, `Nothing to update`, `Note not found` (404). MCP reuses `MONTH_ERROR`, `ERRORS[...]`, `Invalid id`, plus `Note not found` and `Nothing to update`.
- UI copy, exactly: `Editing`, `Save`, `Cancel`, input label `Edit note`, month label `Month`, row button label `Edit "<text>"`, notice `Saved and moved to <Mon YYYY>` (e.g. `Saved and moved to Sep 2001`), errors `Could not save: <message>` and `Could not save: the note no longer exists`.
- Only one `role="status"` on screen at a time (e2e and tests look it up by role).
- The REST DELETE route is out of scope (its missing `parseNoteId` stays as is).
- Existing tests stay green; change them only where an interface in this plan changes (the MCP tool count, `applyRefresh`'s `local` argument, mocks gaining `updateNote`).
- E2E uses the existing ports (Auth 9099, Firestore 8081, backend 8090, frontend 5174) and runs **once**, in Task 10. Don't run it while another worker uses those ports.
- Never print the API token; reuse the test token in `e2e/fixtures/mcp.ts`.
- Commit messages: one plain sentence in the repo's style, ending with the session's attribution line. Never merge, never open a PR, never push to `main`.

## Review Focus

1. **Editing a note whose delete is pending, or deleting a note while its save is in flight** → Undo restores the latest copy (server copy after success, previous copy after failure); a save never re-adds a deleted row. Tests in Task 9.
2. **A refresh during a save** (pull or return, started before or during the save; in place or a move) → the edit on screen wins, a moved note doesn't come back, a failed save during a refresh still reverts. Tests in Task 6 and Task 9.
3. **Moving to the same month** (app picks the month already on screen, or Muse passes `moveTo` equal to the source month) → plain in-place update: no delete/create, no "moved" notice, same place in the list. Tests in Task 2, Task 4 and Task 9.
4. **An id that no longer exists** (deleted or moved by Muse/another device, or a retried move) → REST 404 / MCP `Note not found`, nothing written in either month; the app removes the row and shows `Could not save: the note no longer exists`. Tests in Task 2, 3, 4 and 9.
5. **Muse (or a REST client) trying to set `source`** → ignored; the stored `source` survives an in-place edit and a move, and the "agent" badge stays. Tests in Task 2, 3 and 4; e2e in Task 10.

---

### Task 1: Update validation — `parseNoteUpdate`

**Files:**
- Modify: `backend/src/services/noteInput.ts`
- Test: `backend/src/services/noteInput.test.ts`

**Interfaces:**
- Produces, from `noteInput.ts`:
  ```ts
  export interface NoteUpdate { type?: NoteType; text?: string; moveTo?: { year: number; month: number } }
  export function parseNoteUpdate(input: { type?: unknown; text?: unknown; moveTo?: unknown }):
    | { ok: true; update: NoteUpdate }
    | { ok: false; error: 'Invalid type' | 'Invalid text' | 'Invalid month' | 'Nothing to update' }
  ```

- [ ] **Step 1: Write the failing tests** (`describe('parseNoteUpdate')`)
  - `accepts each field alone`: `{ text: ' Fixed ' }` → `{ ok: true, update: { text: 'Fixed' } }`; `{ type: 'next' }` → `{ update: { type: 'next' } }`; `{ moveTo: { year: 2001, month: 9 } }` → `{ update: { moveTo: { year: 2001, month: 9 } } }`.
  - `accepts all fields together`.
  - `rejects nothing to update`: `{}` and `{ source: 'app' }` → `{ ok: false, error: 'Nothing to update' }`.
  - `drops unknown fields`: `{ text: 'a', source: 'api' }` → `update` equals `{ text: 'a' }` exactly.
  - `rejects a present but invalid field`: `{ type: 'todo' }` → `Invalid type`; `{ text: '' }`, `{ text: '   ' }`, `{ text: 'a\nb' }`, `{ text: 'x'.repeat(501) }` → `Invalid text`; `{ moveTo: { year: 1999, month: 1 } }`, `{ moveTo: { year: 2026, month: 13 } }`, `{ moveTo: '2026-11' }`, `{ moveTo: null }` → `Invalid month`.
  - `accepts exactly 500 characters`.

- [ ] **Step 2: Run red** — `(cd backend && npx vitest run src/services/noteInput.test.ts)` → FAIL, `parseNoteUpdate` is not exported.

- [ ] **Step 3: Implement `parseNoteUpdate`** in `noteInput.ts`, reusing `isNoteType`, `parseText` and `parseYearMonth` (a key counts as present when `!== undefined`; `moveTo` must be a non-null object). Order of checks: type, text, month, then "Nothing to update".

- [ ] **Step 4: Run green** — same command → PASS.

- [ ] **Step 5: Commit** — `git add backend/src/services/noteInput.ts backend/src/services/noteInput.test.ts`

### Task 2: Service — `updateNote`

**Files:**
- Modify: `backend/src/services/reviews.ts`
- Test: `backend/src/services/reviews.test.ts` (extend the firestore mock with `runTransaction`)

**Interfaces:**
- Consumes: `NoteUpdate` (Task 1).
- Produces, from `reviews.ts`:
  ```ts
  export async function updateNote(year: number, month: number, id: string, update: NoteUpdate):
    Promise<{ year: number; month: number; note: Note } | null>   // null = not found
  ```
  The returned `year`/`month` is where the note now lives.

- [ ] **Step 1: Write the failing tests** — mock `getFirestore().runTransaction(fn)` calling `fn(tx)` with `tx = { get, update, delete, set, create }` spies; `tx.get` resolves `{ exists, data: () => stored }` per path. Stored note in `reviews/2026-11/notes/n1`: `{ type: 'event', text: 'Trip', source: 'api', createdAt: now }`.
  - `updates text and type in place`: `updateNote(2026, 11, 'n1', { text: 'Trip!', type: 'learn' })` → `tx.update('reviews/2026-11/notes/n1', { text: 'Trip!', type: 'learn' })` only (no delete/set/create); result `{ year: 2026, month: 11, note: { id: 'n1', type: 'learn', text: 'Trip!', source: 'api', createdAt: '2026-11-14T01:02:03.000Z' } }`.
  - `updates only the fields given`: `{ text: 'x' }` → `tx.update(..., { text: 'x' })`; result keeps `type: 'event'`.
  - `moves to another month with the same id, createdAt and source`: `{ moveTo: { year: 2026, month: 12 } }` → `tx.delete('reviews/2026-11/notes/n1')`, `tx.set('reviews/2026-12', { year: 2026, month: 12, updatedAt: serverTimestamp }, { merge: true })`, `tx.create('reviews/2026-12/notes/n1', { type: 'event', text: 'Trip', source: 'api', createdAt: now })`; result month 12.
  - `a move without stored source writes app` (legacy note).
  - `moving to the same month updates in place`: `{ moveTo: { year: 2026, month: 11 }, text: 'y' }` → only `tx.update(..., { text: 'y' })`.
  - `returns null and writes nothing when the note does not exist` (`exists: false`), for both in-place and move.

- [ ] **Step 2: Run red** — `(cd backend && npx vitest run src/services/reviews.test.ts)` → FAIL, `updateNote` not exported.

- [ ] **Step 3: Implement `updateNote`** with `getFirestore().runTransaction`: `tx.get` the note; `null` if missing; same month (or no `moveTo`) → `tx.update` with only the given `type`/`text`; other month → `tx.delete` + review `tx.set(..., { merge: true })` as `addNote` does + `tx.create` (fails if the id exists there). Build the returned `Note` like `listNotes` does. Never read `source` from `update`.

- [ ] **Step 4: Run green** — same command → PASS.

- [ ] **Step 5: Commit** — `git add backend/src/services/reviews.ts backend/src/services/reviews.test.ts`

### Task 3: REST — `PATCH /api/reviews/:year/:month/notes/:id`

**Files:**
- Modify: `backend/src/routes/reviews.ts`
- Test: `backend/src/routes/reviews.test.ts` (add `updateNote: vi.fn()` to the mock)

**Interfaces:**
- Consumes: `parseNoteUpdate` (Task 1), `parseNoteId`, `updateNote` (Task 2).
- Produces: `PATCH /api/reviews/:year/:month/notes/:id`, body `{ type?, text?, moveTo?: { year, month } }` → 200 with the `Note` JSON.

- [ ] **Step 1: Write the failing tests**
  - Extend `guards every route with userAuth` with `request(guarded).patch('/api/reviews/2026/11/notes/n1')` → `{ error: 'userAuth' }`.
  - `updates the note and returns 200`: body `{ text: ' Fixed ', type: 'learn' }` → 200, body = the note from the mocked `updateNote`, called with `(2026, 11, 'n1', { text: 'Fixed', type: 'learn' })`.
  - `passes moveTo through`: `{ moveTo: { year: 2026, month: 12 } }` → `updateNote(2026, 11, 'n1', { moveTo: { year: 2026, month: 12 } })`.
  - `ignores source`: `{ text: 'a', source: 'api' }` → called with `{ text: 'a' }`.
  - `returns 404 when the note does not exist`: `updateNote` resolves `null` → 404 `{ error: 'Note not found' }`.
  - `rejects an invalid month with 400` (path), `rejects an invalid id with 400`: path id `a%2Fb` → 400 `{ error: 'Invalid id' }`, `updateNote` not called.
  - `rejects invalid bodies with 400`: `{}` → `Nothing to update`; `{ text: '' }` → `Invalid text`; `{ type: 'x' }` → `Invalid type`; `{ moveTo: { year: 2026, month: 0 } }` → `Invalid month`.
  - `returns 500 when Firestore fails`.

- [ ] **Step 2: Run red** — `(cd backend && npx vitest run src/routes/reviews.test.ts)` → FAIL (404 from Express for PATCH).

- [ ] **Step 3: Add the route** in `createReviewsRouter`, guarded by `userAuth`, checking path month, then `parseNoteId(req.params.id)`, then `parseNoteUpdate(req.body ?? {})`; respond with `result.note`.

- [ ] **Step 4: Run green** — same command → PASS.

- [ ] **Step 5: Commit** — `git add backend/src/routes/reviews.ts backend/src/routes/reviews.test.ts`

### Task 4: MCP — `update_note`

**Files:**
- Modify: `backend/src/mcp/server.ts`
- Test: `backend/src/mcp/server.test.ts` (add `updateNote: vi.fn()` to the mock)

**Interfaces:**
- Consumes: `parseNoteUpdate`, `parseNoteId`, `updateNote`.
- Produces: tool `update_note`, input `{ year, month, id: string, type?: enum, text?: string, moveTo?: { year, month } }`, annotations `{ destructiveHint: true, idempotentHint: false }`, wrapped in `limited(limiter, 'Failed to update note', …)`. Success text: `JSON.stringify({ year, month, note })` from `updateNote`.

- [ ] **Step 1: Write the failing tests**
  - Rename/extend the tool-list test: names `['add_note', 'delete_note', 'list_notes', 'update_note']`; `update_note.annotations?.destructiveHint === true`.
  - `update_note updates the note and returns where it lives`: args `{ year: 2026, month: 11, id: 'n1', text: ' Fixed ' }` → `updateNote(2026, 11, 'n1', { text: 'Fixed' })`; parsed text equals `{ year: 2026, month: 11, note }`.
  - `update_note moves a note`: `moveTo: { year: 2026, month: 12 }` passed through.
  - `update_note ignores source`: args include `source: 'app'` → `updateNote` called without `source`, no tool error.
  - `update_note reports a missing note`: mock resolves `null` → `isError: true`, text `Note not found`.
  - `update_note validates like add_note`: `text: ''` → `ERRORS['Invalid text']`; `moveTo: { year: 1999, month: 1 }` → `MONTH_ERROR`; only `{ year, month, id }` → `Nothing to update`; `id: 'a/b'` → `Invalid id`; `updateNote` never called.
  - `update_note counts against the rate limit`: with a limit-1 limiter, a second call returns the `Rate limit reached` error.

- [ ] **Step 2: Run red** — `(cd backend && npx vitest run src/mcp/server.test.ts)` → FAIL.

- [ ] **Step 3: Register `update_note`** after `add_note`. Description: `"Change a note's text, type or month in owlet. Give only the fields to change; moveTo moves the note to another month."`; `moveTo` described as `'Month to move the note to'`; `id` as `'The note id from list_notes'`. Map `Invalid month` from the body to `MONTH_ERROR`.

- [ ] **Step 4: Run green**, then the whole backend: `(cd backend && npm test && npm run lint && npm run build)` → all PASS.

- [ ] **Step 5: Commit** — `git add backend/src/mcp/server.ts backend/src/mcp/server.test.ts`

### Task 5: Frontend API and month helpers

**Files:**
- Modify: `frontend/src/api.ts`, `frontend/src/month.ts`
- Test: `frontend/src/api.test.ts`, `frontend/src/month.test.ts`

**Interfaces:**
- Produces, from `api.ts`: `export interface NoteUpdate { type?: NoteType; text?: string; moveTo?: YearMonth }` and `api.updateNote(ym: YearMonth, id: string, update: NoteUpdate): Promise<Note>`; failures throw an `Error` whose message is `API error: <status>` (404 → `API error: 404`, as today).
- Produces, from `month.ts`: `toMonthInput(ym: YearMonth): string` (`'2001-09'`), `parseMonthInput(value: string): YearMonth | null` (range-checked like `parseMonthPath`, `''` → `null`), `formatShortMonth(ym: YearMonth): string` (`'Sep 2001'`), and `MONTH_INPUT_MIN = '2000-01'`, `MONTH_INPUT_MAX = '2100-12'`.

- [ ] **Step 1: Write the failing tests**
  - `api.updateNote sends PATCH with the body to the encoded note path`: `api.updateNote({ year: 2026, month: 11 }, 'n/1', { text: 'x', moveTo: { year: 2026, month: 12 } })` → fetch `'http://api.test/api/reviews/2026/11/notes/n%2F1'` with `method: 'PATCH'`, `body: JSON.stringify({ text: 'x', moveTo: { year: 2026, month: 12 } })`, bearer header; returns the JSON note.
  - `api.updateNote throws on 404`: rejects with `API error: 404`.
  - `toMonthInput` → `'2001-09'`, `'2026-11'`; `parseMonthInput('2001-09')` → `{ year: 2001, month: 9 }`; `''`, `'1999-12'`, `'2101-01'`, `'2026-13'`, `'2026-9'` → `null`; `formatShortMonth({ year: 2001, month: 9 })` → `'Sep 2001'`.

- [ ] **Step 2: Run red** — `(cd frontend && npx vitest run src/api.test.ts src/month.test.ts)` → FAIL.

- [ ] **Step 3: Implement** the method and helpers (`formatShortMonth` mirrors `formatMonth` with `month: 'short'`).

- [ ] **Step 4: Run green** — same command → PASS.

- [ ] **Step 5: Commit** — `git add frontend/src/api.ts frontend/src/api.test.ts frontend/src/month.ts frontend/src/month.test.ts`

### Task 6: Refresh merge keeps local edits

**Files:**
- Modify: `frontend/src/notes.ts`
- Test: `frontend/src/notes.test.ts`

**Interfaces:**
- Produces: `applyRefresh(current, server, local: { added: ReadonlySet<string>; deleted: ReadonlySet<string>; edited: ReadonlySet<string> })` — for an id in `edited` that is on screen, the current copy wins; `deleted` still wins over everything. Also `replaceNote(notes: Note[], note: Note): Note[]` — replaces by id, **never adds** a missing note.

- [ ] **Step 1: Write the failing tests** (update `none` to include `edited: new Set()`)
  - `keeps the local copy of a note edited during the refresh`: current `[a']` (a with text `'edited'`), server `[a, b]`, `edited = {a}` → `[a', b]`.
  - `an edited note that is no longer on screen is not brought back from current`: current `[]`, server `[b]`, `edited = {a}` → `[b]`.
  - `deleted wins over edited`: current `[a']`, server `[a]`, `edited = {a}`, `deleted = {a}` → `[]`.
  - `an edit that changes type keeps createdAt order`.
  - `replaceNote replaces in place and never adds`: `replaceNote([a, b], b')` → `[a, b']`; `replaceNote([a], b)` → `[a]`.

- [ ] **Step 2: Run red** — `(cd frontend && npx vitest run src/notes.test.ts)` → FAIL.

- [ ] **Step 3: Implement** both in `notes.ts`; update the `applyRefresh` comment to mention edits.

- [ ] **Step 4: Run green** — same command → PASS (`MonthPage.tsx` won't type-check until Task 9 passes `edited`; add `edited: new Set<string>()` at its one call site now so `npx tsc --noEmit` stays clean).

- [ ] **Step 5: Commit** — `git add frontend/src/notes.ts frontend/src/notes.test.ts frontend/src/pages/MonthPage.tsx`

### Task 7: `NoteRow` — tap to edit, never after a swipe

**Files:**
- Modify: `frontend/src/components/NoteRow.tsx`
- Test: `frontend/src/components/NoteRow.test.tsx`

**Interfaces:**
- Produces: `NoteRowProps = { note: Note; onDelete: () => void; onEdit: () => void; editing: boolean; editDisabled: boolean }`. The note text renders inside `<button type="button" aria-label={`Edit "${note.text}"`}>` (full width, left aligned, `wrap-anywhere` kept). `editing` sets `aria-current="true"` on the `<li>` and a highlight background (`bg-blue-50`) on the content. `editDisabled` disables the edit button.

- [ ] **Step 1: Write the failing tests**
  - `tapping the text edits`: click `Edit "Trip"` → `onEdit` once, `onDelete` not called.
  - `a swipe that ends on the text does not edit`: touchStart x=200, touchMove x=150 (horizontal, under the delete threshold), touchEnd, then click → `onEdit` not called.
  - `a full swipe deletes but does not edit`: swipe −120 px then click → `onDelete` once, `onEdit` 0.
  - `a vertical drag does not edit` (dy 40, then click).
  - `a plain tap after a swipe edits again` (new touchStart without movement, then click → `onEdit` once).
  - `highlights the note being edited`: `editing` → `listitem` has `aria-current="true"`.
  - `can't edit while its save is in flight`: `editDisabled` → button disabled.
  - Existing Delete and badge tests stay green.

- [ ] **Step 2: Run red** — `(cd frontend && npx vitest run src/components/NoteRow.test.tsx)` → FAIL.

- [ ] **Step 3: Implement** — a `moved` ref set when the direction lock decides (either direction), cleared on `touchstart`; the edit button's `onClick` returns early when `moved` is set.

- [ ] **Step 4: Run green** — same command → PASS.

- [ ] **Step 5: Commit** — `git add frontend/src/components/NoteRow.tsx frontend/src/components/NoteRow.test.tsx frontend/src/pages/MonthPage.tsx` (MonthPage passes the new props in Task 9; give `onEdit`/`editing`/`editDisabled` call-site values there; until then add `onEdit={() => {}} editing={false} editDisabled={false}` so the build stays clean).

### Task 8: `Composer` edit mode

**Files:**
- Modify: `frontend/src/components/Composer.tsx`
- Test: `frontend/src/components/Composer.test.tsx`

**Interfaces:**
- Consumes: `toMonthInput`, `parseMonthInput`, `MONTH_INPUT_MIN/MAX` (Task 5).
- Produces: `ComposerProps = { onAdd; editing: Note | null; month: YearMonth; onSave: (input: { type: NoteType; text: string; month: YearMonth }) => void; onCancel: () => void }`. `text` is trimmed. Edit mode is driven by `editing?.id`.

- [ ] **Step 1: Write the failing tests**
  - `shows the note to edit`: `editing = trip` (type `learn`), month Nov 2026 → visible text `Editing`; textbox `Edit note` has `'Trip'`; `learn` pressed; `Month` input value `'2026-11'` with `min="2000-01"`, `max="2100-12"`; buttons `Save` and `Cancel`; no `Add note` button.
  - `Save sends the trimmed text, type and month`: change text to `' Trip! '`, click `next`, set Month `'2026-12'`, click Save → `onSave({ type: 'next', text: 'Trip!', month: { year: 2026, month: 12 } })`.
  - `Enter saves`: submit the form from the textbox → `onSave` called.
  - `Escape and Cancel cancel`: → `onCancel`, `onSave` not called.
  - `can't save empty text or a cleared month`: text `'   '` → Save disabled and Enter calls nothing; month `''` → Save disabled.
  - `keeps the new-note draft for after editing`: type `'draft'` in add mode, rerender with `editing = trip`, rerender with `editing = null` → `New note` textbox has `'draft'`.
  - `switching to another note loads it`: rerender `editing = run` → textbox `'Run'`, type `event`.
  - `an edit doesn't change the remembered type`: save with `next` → `localStorage['owlet.lastNoteType']` unchanged.
  - Existing add-mode tests stay green (render with `editing={null}` and the new props).

- [ ] **Step 2: Run red** — `(cd frontend && npx vitest run src/components/Composer.test.tsx)` → FAIL.

- [ ] **Step 3: Implement** — separate edit state (text, type, month input string) loaded when `editing?.id` changes; add-mode `text`/`type` untouched while editing. Layout: an `Editing` line (`text-xs`) above the pills; the `Month` input to the right of the pills; `Cancel` and `Save` replace ➤. `onKeyDown` Escape → `onCancel`.

- [ ] **Step 4: Run green** — same command → PASS.

- [ ] **Step 5: Commit** — `git add frontend/src/components/Composer.tsx frontend/src/components/Composer.test.tsx frontend/src/pages/MonthPage.tsx` (MonthPage passes `editing={null}` and no-op handlers until Task 9).

### Task 9: `MonthPage` wiring

**Files:**
- Modify: `frontend/src/pages/MonthPage.tsx`
- Test: `frontend/src/pages/MonthPage.test.tsx` (add `updateNote: vi.fn()` to `mockApi`)

**Interfaces:**
- Consumes: everything above. New state/refs in `MonthPage`: `editing: Note | null`; `notice: string | null` (auto-cleared after `UNDO_MS`); `savingEdits = useRef(new Map<string, { previous: Note; moving: boolean }>())`; `localChanges` gains `edited: Set<string>`.
- Behaviour of `handleSave({ type, text, month: target })`:
  1. Unchanged (same text, type, month) → just `setEditing(null)`, no request.
  2. Build `NoteUpdate`: `type`/`text` only if changed; `moveTo` only if `target` differs from `month`.
  3. Optimistic: in place → `replaceNote` with the new fields and `localChanges.current?.edited.add(id)`; move → filter it out and `localChanges.current?.deleted.add(id)`. Record `savingEdits`. `setEditing(null)`.
  4. Success: in place → `replaceNote(prev, serverNote)`; if `pending.current?.note.id === id`, set `pending.current.note = serverNote`. Move → `setNotice(\`Saved and moved to ${formatShortMonth(target)}\`)`. `setError(null)`.
  5. Failure: restore `previous` (in place → `replaceNote`; move → `localChanges.current?.deleted.delete(id)` then `mergeNotes`, unless the id is the pending delete); if pending, `pending.current.note = previous`; `setError(\`Could not save: ${message}\`)`. On `API error: 404`: remove the row, `localChanges.current?.deleted.add(id)`, error `Could not save: the note no longer exists`.
  6. Always delete from `savingEdits`; ignore state updates after unmount (`mounted`).
- `refresh()` seeds `edited` with `savingEdits` ids whose `moving` is false and adds moving ids to `deleted`.
- `handleDelete(note)` ends edit mode when `editing?.id === note.id`. A new delete replaces the "moved" notice (the Undo toast wins; one `role="status"`).
- Toast offset: `7.5rem` → `9rem` while `editing` (the taller Composer).

- [ ] **Step 1: Write the failing tests** (`describe('editing')`)
  - `tapping a note opens it in the Composer and highlights it`: click `Edit "Trip"` → `Editing` visible, textbox `Edit note` = `'Trip'`, Trip's `listitem` has `aria-current="true"`.
  - `saving a text and type change updates the row in place`: change to `'Trip!'`, `learn`, Save → `updateNote(november, 'n1', { text: 'Trip!', type: 'learn' })`; row shows in Learns before the server answers; Composer back to `New note`.
  - `Enter saves`.
  - `saving nothing changed sends nothing`.
  - `moving shows the notice and removes the row`: Month `'2026-12'`, Save → `updateNote(november, 'n1', { moveTo: { year: 2026, month: 12 } })`; row gone; after resolve, `status` has `Saved and moved to Dec 2026`.
  - `moving to the same month is an in-place edit`: Month stays `'2026-11'`, text changed → no `moveTo` in the call, no notice.
  - `a failed save puts the note back and shows an error`: in place and move variants; `alert` contains `Could not save: API error: 500`; row text/section restored.
  - `a save of a deleted note removes it and says so`: rejects `API error: 404` → row gone, `Could not save: the note no longer exists`.
  - `the agent badge stays after an edit` (edit `muse`; server returns `source: 'api'`).
  - `a refresh during a save keeps the edit`: `updateNote` deferred, pull (deferred `getReview` resolves with the old text) → row keeps `'Trip!'`.
  - `a refresh started during a save keeps the edit`: save first, then pull, then resolve both in either order.
  - `a moved note doesn't come back on a refresh`: move with `updateNote` deferred; pull resolves with the note still in November → row stays gone.
  - `a failed save during a refresh still reverts`.
  - `deleting the note being edited ends edit mode`.
  - `Undo after a save restores the saved copy`: save `'Trip!'` (deferred), delete Trip, resolve the save with `'Trip!'`, Undo → row shows `'Trip!'`.
  - `Undo after a failed save restores the previous copy`: same, save rejects → Undo shows `'Trip'`; the row never reappears before Undo.
  - `a note can't be edited again while its save is in flight` (button disabled, then enabled after resolve).
  - `a swipe on a note doesn't open it` (touch swipe on `note-row-content`, then click).
  - `pull to refresh still works while editing` (Composer in edit mode, pull → `getReview` called, draft kept).
  - `the Undo toast replaces the moved notice` → exactly one `status`.

- [ ] **Step 2: Run red** — `(cd frontend && npx vitest run src/pages/MonthPage.test.tsx)` → FAIL.

- [ ] **Step 3: Implement** as described in Interfaces; pass `editing`, `month`, `onSave`, `onCancel` to `Composer` and `onEdit`, `editing`, `editDisabled` to `NoteRow`.

- [ ] **Step 4: Run green**, then the whole frontend: `(cd frontend && npm test && npm run lint && npm run build)` → all PASS.

- [ ] **Step 5: Commit** — `git add frontend/src/pages/MonthPage.tsx frontend/src/pages/MonthPage.test.tsx`

### Task 10: End-to-end tests and the one full run

**Files:**
- Modify: `e2e/fixtures/mcp.ts`
- Create: `e2e/tests/edit.spec.ts`

**Interfaces:**
- Produces, from `e2e/fixtures/mcp.ts`: `callMcpTool(request, name: string, args: Record<string, unknown>): Promise<string>` (raw body, asserts 200; `addNoteOverMcp` now uses it, unchanged signature) and `parseToolText(body: string): string` (the first content `text` of the JSON-RPC result, whether the body is JSON or an SSE `data:` line).

- [ ] **Step 1: Write the tests** in `edit.spec.ts` (unique texts with `run = Date.now()`; months not used by other specs):
  - `edits a note's text and type in the app`: `/2001/8`, add `edit ${run}` as event, click `Edit "edit ${run}"`, fill `Edit note` with `edited ${run}`, click `learn`, press Enter → Learns region contains `edited ${run}`; `page.reload()` → still there, `edit ${run}` gone.
  - `moves a note to another month`: `/2001/10`, add `move ${run}`, edit it, fill `Month` with `2001-11`, Save → `status` contains `Saved and moved to Nov 2001`, row gone; `goto('/2001/11')` → `move ${run}` visible; reload `/2001/10` → absent.
  - On a touch phone (`hasTouch`, `isMobile`, 390×844): `Muse update_note shows after pulling to refresh, with the agent badge`: `addNoteOverMcp` in `2001/12` (`muse edit ${run}`), read its id with `parseToolText`; sign in, `goto('/2001/12')`, see it; `callMcpTool(request, 'update_note', { year: 2001, month: 12, id, text: \`muse edited ${run}\`, source: 'app' })` → body has no `"isError":true`; pull with CDP touch events as in `refresh.spec.ts` → row `muse edited ${run}` has `img` `Added by an agent`.

- [ ] **Step 2: Run the backend and frontend suites** — `(cd backend && npm test) && (cd frontend && npm test)` → PASS.

- [ ] **Step 3: Run e2e once**, all specs — `(cd e2e && npm test)` → every test passes, including the existing `month`, `refresh` and `agent` specs. If this run started its own servers, then `(cd e2e && npm run test:servers-stopped)` → passes. On a failure, fix and rerun only the failing spec (`npx playwright test tests/<file>`), then the full run once more.

- [ ] **Step 4: Format check** — `(cd backend && npm run format:check) && (cd frontend && npm run format:check)` → clean.

- [ ] **Step 5: Commit** — `git add e2e/fixtures/mcp.ts e2e/tests/edit.spec.ts`
