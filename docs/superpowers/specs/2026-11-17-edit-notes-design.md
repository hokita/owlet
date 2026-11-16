# owlet: Edit Notes — Design

## Why

Notes can only be added or deleted today, so fixing a typo, a wrong type or a note filed under the
wrong month means delete and retype. Muse (the owner's agent, over `/mcp`) has the same gap. The owner
approved the design below on 2026-11-17; this document records it, plus the calls left open, each
marked **(my call)**.

## Goals

- In the app, edit a note's text, type and month. Changing the month moves it to that month.
- Muse can do the same with a new MCP tool, `update_note`.
- An edit never loses data: a refresh never overwrites a save in flight, a moved note never comes
  back, a failed save puts the note back as it was.

## Non-goals

Days or dates (notes stay month-only), an "edited" marker, `updatedAt` on notes, edit history,
changing `source`.

## Anti-goals

Breaking swipe-to-delete, Undo, pull-to-refresh or refresh-on-return; letting any client change
`source`; a note that silently changes its place in the list on a text or type edit.

## How it works today

Notes live at `reviews/{YYYY-MM}/notes/{autoId}` with `{ type, text, source, createdAt }`; the month
is only the parent path. The backend has `listNotes`, `addNote` (batch: review doc upsert + note),
`deleteNote`; REST (Firebase sign-in) and MCP (API token, 30 tool calls/hour) both validate through
`noteInput.ts`. No update path exists anywhere. On the client, `MonthPage` owns the list, a single
pending delete with Undo, and `refresh()`, whose `applyRefresh` only knows local adds and deletes.

## Approaches

- **A. Edit in the bottom bar (chosen by the owner).** Tapping a note puts the existing Composer into
  an "Editing" mode. Reuses the pills, the text input and the keyboard-inset handling; the row only
  gains a tap.
- **B. Inline in the row.** Cramped on a phone, and an input inside a row that also owns
  swipe-to-delete fights the gesture.
- **C. Full-screen form.** Clear, but heavy for the common case: fixing a typo.

## Behaviour (as approved)

- Tapping a note switches the Composer to "Editing": that note's text, type pills and month, with
  Save and Cancel. Enter saves. The note being edited is highlighted in the list.
- Month uses the native `<input type="month">`, limited to 2000-01…2100-12.
- Saving to another month removes the note from the page and shows "Saved and moved to <Mon YYYY>".
- A tap at the end of a swipe never starts editing; editing doesn't break pull-to-refresh.
- Text and type edits keep the note's place (`createdAt` untouched). A move keeps the same id and the
  original `createdAt`: delete in the old month, create in the new one, plus the target review doc
  upsert, committed together.
- `source` is never changed by any client; Muse's notes keep the "agent" badge after any edit.
- REST update route under `userAuth`, using `parseNoteId`; 404 when the note doesn't exist.
- MCP `update_note` changes text, type and month with the same validation and the same rate limit.
- Empty text is rejected (the existing 1–500 chars, one line). A failed save puts the note back and
  shows an error.

## Calls the design left open (my calls)

1. **A transaction, not a plain batch.** The move needs the stored `createdAt` and `source`, and a 404
   must be decided on the same read, so `updateNote` runs in `runTransaction`: read the note, then
   commit the delete + review upsert + `create` (fails if the id somehow exists there) together. A
   read-then-batch could resurrect a note deleted in between.
2. **Partial updates.** `type`, `text` and `moveTo: { year, month }` are each optional; at least one is
   required ("Nothing to update" otherwise). A field that is present is validated like `add_note`.
   Muse can fix one field without resending the rest; the app always sends `type` and `text`.
3. **API shape.** REST: `PATCH /api/reviews/:year/:month/notes/:id`, body `{ type?, text?, moveTo? }`,
   200 with the note. MCP: `update_note { year, month, id, type?, text?, moveTo? }`, returns
   `{ year, month, note }` for the month the note is now in. Errors reuse the existing messages plus
   `Note not found` and `Nothing to update`.
4. **`source` and unknown fields are ignored**, as `POST` already ignores extra fields. The service
   takes no `source` input at all; a move copies the stored value (legacy notes without it stay
   `app`).
5. **Moving to the same month** is a plain in-place update: no delete/create, no "moved" message.
6. **No `updatedAt`.** Refresh safety is handled by tracking local edits on the client, the same way
   adds and deletes are; nothing reads an `updatedAt`.
7. **Optimistic save.** Save ends edit mode at once and shows the new text/type (or removes a moved
   note); the request runs behind. On failure the previous copy comes back and an error shows
   ("Could not save: …"). On 404 the note is removed and the error says it no longer exists.
8. **Refresh safety.** `applyRefresh` gains an `edited` set: for those ids the copy on screen wins over
   the server's. A refresh seeds `edited` with saves in flight and `deleted` with moves in flight
   (like `sendingDeletes`); saves started during a refresh add to them.
9. **One save per note at a time.** While a note's save is in flight its row can't be tapped to edit,
   so two saves of one note never race.
10. **Pending delete.** Deleting the note being edited ends edit mode. If a note is deleted while its
    save is in flight, the save result updates the copy Undo holds (server copy on success, previous
    copy on failure), so Undo never restores a stale version, and a save never re-adds a deleted row.
11. **Composer details.** The unsent new-note text is kept and comes back after editing. Save is
    disabled while the text is empty or the month is cleared. Saving with nothing changed just closes
    edit mode, with no request. Escape cancels. Tapping another note switches to it; the last-used
    type isn't updated by an edit.
12. **Tap target.** The note text becomes a full-width button labelled `Edit "<text>"`, so it works
    with keyboard and screen readers. A gesture that moved past the 8px direction lock (swipe or
    scroll) suppresses the click that may follow.
13. **Layout.** Edit mode adds a small "Editing" line above the pills; the month input sits beside the
    pills; Cancel and Save replace ➤. The Undo/"moved" toast is lifted by the extra height while
    editing. The "moved" message uses the toast slot (`role="status"`) for 5 s; a delete's Undo toast
    replaces it, so only one `status` shows at a time.
14. **Excluded:** the REST DELETE route's missing `parseNoteId` (recon item 9) is left as is; it is a
    separate hardening fix.

## Testing (red/green TDD)

- Backend unit: update validation, `updateNote` (in place, move, same month, not found, `source`
  kept), REST `PATCH` (404, 400s, `parseNoteId`, `userAuth`), MCP `update_note` (validation, not
  found, rate limit, `source` ignored).
- Frontend unit: `api.updateNote`, `applyRefresh` with `edited`, `NoteRow` tap vs swipe, Composer edit
  mode, `MonthPage` save / move / failure / refresh / pending-delete cases.
- E2E (existing Playwright + emulators): edit in the app; move to another month; Muse `update_note`
  shown after a pull to refresh. Run once, at the end.
