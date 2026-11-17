# owlet: Multi-line Notes — Design

## Why

"The input form of owlet is too narrow to input. Users input a few lines of notes." The owner's notes
have structure (a heading line, a few "- " points), and today's one-line field can neither show nor
store that. The owner saw interactive samples (today / A / B) and approved option B on 2026-11-17.
This short design records it; calls the owner left to me are marked **(my call)**.

## Goals

- A note box that grows from 1 to 5 lines as you type, then scrolls inside, in both add and Editing
  mode.
- Line breaks are kept: from the app (add + edit) and from Muse (MCP `add_note` / `update_note`), and
  shown in the list.

## Non-goals

Rich text or markdown rendering ("-" stays a plain character), migrating existing notes, any data model
change, changing type buttons, swipe to delete or tap to edit.

## Anti-goals

Japanese IME input submitting or losing text; the Composer or the Undo toast covering the list's last
note when the box is tall or the iPhone keyboard is open; a font size under 16px (iOS zooms on focus).

## How it works today

- `backend/src/services/noteInput.ts` `parseText` trims and rejects empty, > 500 chars, and any `\r`/`\n`.
  REST `POST`/`PATCH` and MCP `add_note`/`update_note` all go through it. MCP says "One line, 1–500
  characters" in both tool schemas and in `ERRORS['Invalid text']`.
- `Composer.tsx` is a fixed bottom form with `<input type="text" maxLength={500}>` (separate inputs for
  add and Editing mode); Enter submits the form; Escape cancels editing unless an IME is composing.
- `MonthPage.tsx` hardcodes the Composer height twice: the toast sits at `7.5rem` (`9rem` while
  editing) above the keyboard inset, and `<main>` has `pb-44`. A 5-line box adds about 6rem, so both
  would end up behind it.
- `NoteRow.tsx` renders the text in a button with `wrap-anywhere`, but has no `white-space`
  handling, so `\n` would show as a space. The row uses `items-center`.

## Approaches

- **A. Taller box, still one line of text (rejected by the owner).** Uses a wrapping textarea but
  turns Return into submit and keeps the server's one-line rule. Smaller change, but the owner's notes
  have structure, and A flattens it.
- **B. Taller box + line breaks (chosen).** The textarea grows, Return inserts a line break, and line
  breaks are stored and shown. It touches the server rule, MCP wording, the Composer, the row and the
  page layout, but it is the only option that keeps the structure.

## Behaviour (as approved)

- **Box:** one `<textarea rows=1>` for adding and one in Editing mode, growing 1 → 5 lines, then
  scrolling inside. 16px text. The fixed Composer, keyboard inset and toast keep working as it grows.
- **Keys:** Return inserts a line break. ➤ (Save in Editing mode) submits. ⌘/Ctrl+Return also submits
  **(owner's call)**. An IME composition never submits and is never interrupted by key handling.
- **List:** line breaks are shown (`white-space: pre-wrap`), long words still wrap
  (`wrap-anywhere` stays). Swipe to delete and tap to edit still work on multi-line rows.
- **Server + Muse:** line breaks are accepted in REST add/edit and MCP `add_note`/`update_note`; the MCP
  descriptions say line breaks are allowed.
- **Normalization, shared in `noteInput.ts` (owner's call):** `\r\n` and lone `\r` → `\n`; trim the
  whole text; 3+ consecutive newlines → `\n\n` (at most one blank line). Empty after this → rejected.
- **Limit:** 500 characters after normalization, line breaks count as 1. A counter shows past 400.

## Calls the design left open (my calls)

1. **Order of checks.** Normalize first, then check 1–500, so pasted `\r\n` text is counted the way
   it is stored. All other characters are accepted, as today.
2. **Whitespace-only lines count as blank.** A run of newlines with only spaces/tabs between them
   (`"a\n \n\t\nb"`) collapses to one blank line too. Leading indentation of a line with text
   (`"  - sub point"`) and spaces inside lines are kept.
3. **The server is the one place that normalizes.** The app keeps trimming as today and shows the
   note the server returns (add already does; a text edit already replaces the row with the saved
   copy). No client copy of the rules to keep in sync. Cost: an edit that only adds extra blank
   lines sends a request that changes nothing visible, which is harmless.
4. **Growing the box.** A small `useAutoGrow` hook sets `height: auto`, then `scrollHeight`,
   capped at 5 lines (`max-height` from line height × 5 + padding) with `overflow-y: auto` beyond that.
   Runs on every value change, including when Editing loads a note. I'm not using CSS
   `field-sizing: content`, because iOS Safari support for it isn't reliable yet.
5. **⌘/Ctrl+Return** calls `form.requestSubmit()`. It is skipped when `isComposing` is true or
   `keyCode === 229` (Safari reports some IME Enters only that way). Plain Return has no handler at
   all: the textarea inserts the line break natively, so IME conversion can't be affected.
6. **Mobile keyboard key:** `enterKeyHint` changes from `send`/`done` to `enter`, since Return now
   inserts a line break. The placeholder "One-line note…" becomes "Note…".
7. **Counter:** `N/500` under the box once the value is over 400 characters, in both modes. It is
   linked with `aria-describedby` and is not a live region, so it isn't announced on every keystroke.
   `maxLength={500}` stays on the textarea (it counts a line break as 1, matching the server). A paste
   past 500 is cut by the browser, and the counter showing 500/500 makes that visible.
8. **Layout follows the measured Composer height.** The Composer reports its height (`ResizeObserver`)
   to `MonthPage`. The toast sits at `keyboard inset + Composer height + gap`, and `<main>`'s bottom
   padding is `Composer height + room for the toast`. This replaces the `7.5rem`/`9rem`/`pb-44`
   constants, so the Editing line, a 5-line box and the counter are all covered.
9. **Editing mode alignment:** Cancel/Save (and ➤) sit at the bottom of the box (`items-end`), so
   they stay in place as it grows.
10. **Row alignment:** the row switches from `items-center` to `items-start`, so the "agent" badge and
    the Delete button line up with the first line, not the middle of a tall note. The Edit/Delete
    accessible names keep the full text.

## Testing (red/green TDD)

- Backend unit: normalization and validation cases in `noteInput.test.ts`; REST `POST`/`PATCH` and MCP
  `add_note`/`update_note` accept and store multi-line text; MCP descriptions and the error message.
- Frontend unit: Composer textarea (Return inserts, ⌘/Ctrl+Return submits, IME never submits,
  counter, grow cap, Editing mode), NoteRow `pre-wrap`, MonthPage toast/padding from the Composer
  height.
- E2E (existing Playwright + emulators): add a multi-line note in the app and see its lines after a
  reload; Muse adds a multi-line note over MCP and the app shows it. Run once, at the end.
