# owlet Monthly Notes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hello-world slice with an iPhone-first monthly review page backed by Firestore.

**Spec:** `docs/superpowers/specs/2026-11-14-monthly-notes-design.md`

**Architecture:** Unchanged — React SPA talks only to Firebase Auth and the Express API; the API is the only Firestore client.

## Global Constraints

- Red/green TDD: every step writes a failing test, runs it, then the code.
- Prettier: no semicolons, single quotes, `trailingComma: es5`, `printWidth: 100`.
- No new runtime dependencies.
- Errors answer `{ error }`; auth contract unchanged.

## Review Focus

1. Swipe-delete then Undo → the API delete is never sent.
2. Delete then switch month before 5 s → the delete is still sent.
3. Invalid `year`/`month`/`type`/`text` → 400, nothing written.
4. Fast month switching → a stale response never replaces the current month's notes.
5. Composer stays above the iPhone keyboard and home indicator.

---

### Task 1: Backend notes service

**Files:** Create `backend/src/services/reviews.ts`, `backend/src/services/reviews.test.ts`

**Interfaces:** `NOTE_TYPES`, `NoteType`, `Note`; `listNotes(year, month): Promise<Note[]>`; `addNote(year, month, { type, text }): Promise<Note>`; `deleteNote(year, month, id): Promise<void>`.

- [ ] Failing tests: list orders by `createdAt` from `reviews/YYYY-MM/notes` and maps Timestamps to ISO strings; add batches a merged review doc and the note; delete removes `reviews/YYYY-MM/notes/{id}`.
- [ ] Implement; `npm test` green.

### Task 2: Backend routes + validation

**Files:** Create `backend/src/routes/reviews.ts`, `backend/src/routes/reviews.test.ts`; modify `backend/src/app.ts`, `backend/src/app.test.ts`

- [ ] Failing tests: GET/POST/DELETE happy paths; 400 for bad year, month, type, empty/long/multi-line text; 500 on service failure; app returns 401 without a token for `/api/reviews/...`.
- [ ] Implement and mount at `/api/reviews`.

### Task 3: Remove hello-world (backend)

- [ ] Delete `routes/hello*`, `services/hello*`, unmount from `app.ts`, drop the hello test in `app.test.ts`.

### Task 4: Frontend month helpers + API client

**Files:** Create `frontend/src/month.ts`, `frontend/src/month.test.ts`; modify `frontend/src/api.ts`, `frontend/src/api.test.ts`

- [ ] Failing tests: `parseMonthPath`, `monthPath`, `shiftMonth` (year rollover), `formatMonth`, `currentMonth`; `api.getReview`, `api.addNote`, `api.deleteNote` (204 has no body).
- [ ] Implement.

### Task 5: Composer, NoteRow, keyboard inset

**Files:** Create `frontend/src/components/Composer.tsx`, `NoteRow.tsx`, `frontend/src/useKeyboardInset.ts` with tests

- [ ] Composer: chips select type, last-used type persisted, Enter submits trimmed text, blank text ignored, input cleared and refocused after success, kept on failure.
- [ ] NoteRow: swipe past threshold calls `onDelete`; short swipe doesn't; hover Delete button calls `onDelete`.
- [ ] useKeyboardInset: returns the keyboard height from `visualViewport`, updates on resize, 0 without `visualViewport`.

### Task 6: MonthPage + App routing

**Files:** Create `frontend/src/pages/MonthPage.tsx`, test; modify `App.tsx`, `App.test.tsx`; delete `HelloPage*`

- [ ] MonthPage: loads and groups notes; adds; delete → toast → API after 5 s; Undo cancels; month change flushes; delete failure restores; stale loads ignored; prev/next call `onNavigate`.
- [ ] App: `/` redirects to the current month via `replaceState`; prev/next `pushState`; `popstate` updates the month.
- [ ] `index.html`: `viewport-fit=cover`.

### Task 7: E2E

**Files:** Replace `e2e/tests/hello.spec.ts` with `e2e/tests/month.spec.ts`

- [ ] Sign in → current month heading; add event/learn/next notes; delete one via the hover Delete button and wait for the API call; reload shows the result; ‹ › navigate.

### Task 8: Verify and ship

- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` in backend and frontend; `npm test` in e2e; `prettier --check`.
- [ ] Push branch, open PR (do not merge).
