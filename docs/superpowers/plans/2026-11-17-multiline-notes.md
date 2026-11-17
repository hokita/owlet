# Multi-line Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notes can have several lines: a growing textarea in the Composer, line breaks stored by REST
and MCP, and shown in the list.

**Architecture:** The server normalizes and validates text in one place (`noteInput.ts`), used by REST and
MCP. The Composer swaps its two `<input>`s for auto-growing `<textarea>`s and reports its own height,
and `MonthPage` places the toast and the list's bottom padding from that height instead of fixed
rem values. `NoteRow` renders `pre-wrap`.

**Tech Stack:** Node/Express + `@modelcontextprotocol/server` + zod (backend, vitest); React + Vite +
Tailwind 4 (frontend, vitest + Testing Library); Playwright + Firebase emulators (e2e).

**Spec:** `docs/superpowers/specs/2026-11-17-multiline-notes-design.md`

## Global Constraints

- Red/green TDD for every task: write the failing test, see it fail, make it pass.
- Text limit: 500 characters **after** normalization; a line break counts as 1.
- Normalization: `\r\n` and lone `\r` → `\n`; trim the whole text; a run of 2+ blank lines (lines
  empty or only spaces/tabs) → one blank line (`\n\n`). Empty after this → `Invalid text`.
- Box: 1 → 5 lines, then scrolls inside. Text stays `text-base` (16px).
- Return inserts a line break. ➤ / Save and ⌘/Ctrl+Return submit. Never submit while an IME is
  composing (`isComposing` or `keyCode === 229`).
- Counter `N/500` shown only when the value is over 400 characters.
- MCP error copy: `Invalid text: must be 1–500 characters`. Schema copy for `text`:
  `1–500 characters; line breaks allowed`.
- No data model change, no markdown rendering, no change to existing notes.
- Never merge; merging to main deploys to production.

## Review Focus

1. **Japanese IME Enter.** Return that confirms a conversion must neither submit nor be swallowed;
   ⌘/Ctrl+Return during composition does nothing. Pinned in Task 3 (`isComposing` and `keyCode 229`).
2. **Paste from Windows or a long doc** (`\r\n`, 4+ blank lines, trailing blank lines) is stored as
   `\n` with at most one blank line. Pinned in Task 1 (unit) and Task 2 (REST `POST` stores normalized).
3. **500 characters including line breaks** is accepted end to end; raw text over 500 that normalizes
   to ≤ 500 is accepted; 501 after normalization is rejected. Pinned in Task 1 and Task 3 (`maxLength`).
4. **Editing an old one-line note** opens at one line (auto-grow runs on load), saving it unchanged
   sends nothing, and adding a line break saves it. Pinned in Task 3 (grow on load) and Task 6
   (MonthPage sends `text` with `\n`).
5. **iPhone keyboard open with a 5-line box:** the toast sits above the Composer, and the list's last
   note can scroll above it. Pinned in Task 6 (toast and padding follow the measured height + keyboard
   inset) and Task 7 (iPhone-width e2e: last note's bottom ≤ Composer's top after scrolling).

---

### Task 1: Normalize and validate multi-line text on the server

**Files:**
- Modify: `backend/src/services/noteInput.ts` (`parseText`)
- Test: `backend/src/services/noteInput.test.ts`

**Interfaces:**
- Produces: `export function normalizeNoteText(value: string): string` in `noteInput.ts`.
  `parseNoteInput` / `parseNoteUpdate` keep their signatures and error strings; `text` in their result is
  normalized.

- [ ] **Step 1: Write the failing tests** in `noteInput.test.ts`:

```ts
describe('normalizeNoteText', () => {
  it.each([
    ['a\r\nb', 'a\nb'],
    ['a\rb', 'a\nb'],
    ['  \n a\nb \n\n', 'a\nb'],          // whole-text trim (leading spaces of line 1 too)
    ['a\n\n\nb', 'a\n\nb'],
    ['a\n\n\n\n\nb', 'a\n\nb'],
    ['a\n \n\t\n  \nb', 'a\n\nb'],       // whitespace-only lines count as blank
    ['a\r\n\r\n\r\nb', 'a\n\nb'],
    ['a\n\nb', 'a\n\nb'],                // one blank line is kept
    ['head\n  - sub', 'head\n  - sub'],  // indentation kept
  ])('%j → %j', (input, expected) => {
    expect(normalizeNoteText(input)).toBe(expected)
  })
})
```

In `parseNoteInput`: replace the `two\nlines` rejection with
`it('keeps line breaks', …)` → `{ ok: true, type: 'event', text: 'two\nlines' }`; add rejects for
`'\n \r\n\t'` (`Invalid text`); add
`it('counts a line break as one character', …)`: `'x'.repeat(250) + '\n' + 'x'.repeat(249)` is ok,
`'x'.repeat(250) + '\n' + 'x'.repeat(250)` is `Invalid text`;
`it('checks the length after normalizing', …)`: `'x'.repeat(249) + '\r\n\r\n\r\n\r\n' + 'x'.repeat(249)`
(raw 506) is ok with text `'x'.repeat(249) + '\n\n' + 'x'.repeat(249)`.
In `parseNoteUpdate`: replace the `a\nb` rejection with an accept case
`parseNoteUpdate({ text: 'a\r\nb' })` → `{ ok: true, update: { text: 'a\nb' } }`.

- [ ] **Step 2: Run and see them fail**

Run: `cd backend && npx vitest run src/services/noteInput.test.ts`
Expected: FAIL (`normalizeNoteText` is not exported; line-break cases rejected).

- [ ] **Step 3: Implement `normalizeNoteText(value: string): string`** and make `parseText` call it, then
check only empty / `> MAX_TEXT_LENGTH` (drop the `/[\r\n]/` test). Algorithm:

```ts
value
  .replace(/\r\n?/g, '\n')
  .trim()
  .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
```

Update the file's comments where they say "one line".

- [ ] **Step 4: Run and see them pass**

Run: `cd backend && npx vitest run src/services/noteInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/noteInput.ts backend/src/services/noteInput.test.ts
git commit -m "Allow line breaks in note text, normalized on the server"
```

### Task 2: REST and MCP accept multi-line notes; MCP copy says so

**Files:**
- Modify: `backend/src/mcp/server.ts` (`ERRORS['Invalid text']`, `add_note` / `update_note` descriptions
  and `text` schema descriptions)
- Test: `backend/src/routes/reviews.test.ts`, `backend/src/mcp/server.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parseNoteInput` / `parseNoteUpdate` return normalized text).

- [ ] **Step 1: Write the failing tests**
  - `reviews.test.ts` POST: remove the `two\nlines` row from the 400 table; add
    `it('stores line breaks, normalized', …)`: body `{ type: 'event', text: 'Trip\r\n\r\n\r\n- day 1\r\n' }`
    → 201 and `addNote` called with `text: 'Trip\n\n- day 1'`.
  - `reviews.test.ts` PATCH: `it('updates text with line breaks', …)`: `{ text: 'a\nb' }` → 200 and
    `updateNote` called with `{ text: 'a\nb' }`. Remove any `\n` rejection row in the PATCH table.
  - `server.test.ts`: `TEXT = 'Invalid text: must be 1–500 characters'`; remove the
    `two\nlines` tool-error row; add `it('add_note keeps line breaks', …)` (`text: 'a\r\nb'` → `addNote`
    called with `text: 'a\nb'`, `source: 'api'`) and the same for `update_note` (`{ text: 'a\nb' }`).
  - `server.test.ts`: `it('says line breaks are allowed', …)`: from `listTools()`, the `text` property
    description of `add_note` and `update_note` is `'1–500 characters; line breaks allowed'`.

- [ ] **Step 2: Run and see them fail**

Run: `cd backend && npx vitest run src/routes/reviews.test.ts src/mcp/server.test.ts`
Expected: FAIL only on the MCP copy (the routes already pass after Task 1; that is fine, they are
regression pins).

- [ ] **Step 3: Update the copy in `server.ts`**: the error string and both `text` descriptions from
Global Constraints; `add_note` description → `'Add a note to a month in owlet. The text may have
several lines.'`.

- [ ] **Step 4: Run the whole backend suite and lint**

Run: `cd backend && npm test && npm run lint && npm run build`
Expected: all PASS, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "Accept multi-line notes over REST and MCP; tell Muse line breaks are allowed"
```

### Task 3: Composer textareas that grow, with the new keys

**Files:**
- Create: `frontend/src/useAutoGrow.ts`, `frontend/src/useAutoGrow.test.ts`
- Modify: `frontend/src/components/Composer.tsx`
- Test: `frontend/src/components/Composer.test.tsx`

**Interfaces:**
- Produces: `export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxLines = 5): void`.
  Composer keeps its props and accessible names (`textbox` "New note" / "Edit note", buttons
  "Add note", "Save", "Cancel").

- [ ] **Step 1: Write the failing tests**
  - `useAutoGrow.test.ts` (render a small test component with a textarea; set inline
    `lineHeight: '24px'`, `paddingTop/Bottom: '8px'`, border 1px, and stub `scrollHeight` with
    `Object.defineProperty`):
    - `it('grows to fit the text', …)`: scrollHeight 88 → `style.height === '90px'` (plus borders),
      `style.overflowY === 'hidden'`.
    - `it('stops at 5 lines and scrolls', …)`: scrollHeight 400 → height `'138px'` (24×5 + 16 + 2),
      `overflowY === 'auto'`.
    - `it('shrinks when text is removed', …)`: rerender with a smaller scrollHeight → smaller height.
  - `Composer.test.tsx`:
    - `it('uses a textarea for new notes', …)`: the "New note" textbox is a `TEXTAREA` with
      `rows=1`, `maxLength=500`, `enterKeyHint="enter"`, placeholder `"Note…"`, class `text-base`.
    - `it('Return inserts a line break, it does not submit', …)`: `keyDown Enter` → `onAdd` not called.
    - `it('submits multi-line text', …)`: value `'  Trip\n- day 1  '`, click Add note → `onAdd`
      with `text: 'Trip\n- day 1'`.
    - `it.each(['metaKey', 'ctrlKey'])('%s+Return submits', …)` → `onAdd` called once.
    - `it('⌘+Return during an IME composition does not submit', …)`: once with `isComposing: true`,
      once with `keyCode: 229` → `onAdd` not called.
    - Edit mode: rename `'Enter saves'` → `'⌘+Return saves'`; add `it('Edit note is a textarea with the
      note's line breaks', …)` (editing `{ ...trip, text: 'a\nb' }` → value `'a\nb'`), and
      `it('Return in Edit note does not save', …)`.
    - `it('Save, Cancel and ➤ stay at the bottom of the box', …)`: the row holding the textarea has
      class `items-end`.

- [ ] **Step 2: Run and see them fail**

Run: `cd frontend && npx vitest run src/useAutoGrow.test.ts src/components/Composer.test.tsx`
Expected: FAIL (no hook; inputs are `INPUT`).

- [ ] **Step 3: Implement**
  - `useAutoGrow`: in a `useLayoutEffect` on `[value, maxLines]`, set `height = 'auto'`, read the computed
    `lineHeight`, vertical padding and borders, set `height` to
    `min(scrollHeight + borders, lineHeight × maxLines + padding + borders)` px, and `overflowY` to
    `'auto'` when capped, `'hidden'` otherwise. Do not use `field-sizing` (spec call 4).
  - Composer: both fields become `<textarea rows={1}>` with `resize-none`, `py-2`, `leading-6`,
    `text-base`, the same `maxLength`/labels; `enterKeyHint="enter"`; placeholder `Note…`; call
    `useAutoGrow` for each ref with its value. Change the refs to `HTMLTextAreaElement`. The text row
    gets `items-end`.
  - Add `handleTextKeyDown(e: KeyboardEvent<HTMLTextAreaElement>)` on both textareas: on
    `Enter` with `metaKey || ctrlKey`, and not `e.nativeEvent.isComposing` and not `e.keyCode === 229`,
    `preventDefault()` and `e.currentTarget.form?.requestSubmit()`. No handler for plain Enter.
    The form's Escape handler stays as is.

- [ ] **Step 4: Run and see them pass, then the whole frontend suite**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS. `MonthPage.test.tsx` still passes (it finds the fields by role and name).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/useAutoGrow.ts frontend/src/useAutoGrow.test.ts frontend/src/components
git commit -m "Composer: a growing note box where Return adds a line, ⌘/Ctrl+Return sends"
```

### Task 4: Character counter past 400

**Files:**
- Modify: `frontend/src/components/Composer.tsx`
- Test: `frontend/src/components/Composer.test.tsx`

**Interfaces:**
- Consumes: Task 3's textareas.

- [ ] **Step 1: Write the failing tests**
  - `it('shows no counter up to 400 characters', …)`: value `'x'.repeat(400)` → `queryByText('400/500')`
    is null.
  - `it('shows the counter past 400, counting line breaks', …)`: `'x'.repeat(400) + '\n'` →
    `getByText('401/500')`, and the "New note" textbox has `aria-describedby` equal to the counter's id.
  - `it('shows the counter in Edit mode', …)`: editing a note with `'y'.repeat(450)` → `'450/500'`.
  - `it('the counter is not a live region', …)`: the counter element has no `aria-live` and no
    `role="status"`.

- [ ] **Step 2: Run and see them fail**

Run: `cd frontend && npx vitest run src/components/Composer.test.tsx`
Expected: FAIL (no counter).

- [ ] **Step 3: Implement** a counter `<p id={…} className="text-right text-xs text-gray-500">{length}/500</p>`
under the text row, rendered when the active value's `length > 400`; set the active textarea's
`aria-describedby` to its id only while shown. Use a `COUNTER_FROM = 400` constant next to the 500.

- [ ] **Step 4: Run and see them pass**

Run: `cd frontend && npx vitest run src/components/Composer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components
git commit -m "Composer: show a character counter past 400"
```

### Task 5: Show line breaks in the list

**Files:**
- Modify: `frontend/src/components/NoteRow.tsx`
- Test: `frontend/src/components/NoteRow.test.tsx`

- [ ] **Step 1: Write the failing tests**
  - `it('keeps the note's line breaks', …)`: note text `'Trip\n- day 1'` → the button named
    `Edit "Trip\n- day 1"` has text content `'Trip\n- day 1'` and class `whitespace-pre-wrap` and
    still `wrap-anywhere`.
  - `it('lines the badge and Delete up with the first line', …)`: `note-row-content` has class
    `items-start`, not `items-center`.
  - `it('a multi-line note still deletes on a long swipe and opens on tap', …)`: reuse the existing
    swipe helper on a multi-line note → `onDelete` called; a plain click → `onEdit` called.

- [ ] **Step 2: Run and see them fail**

Run: `cd frontend && npx vitest run src/components/NoteRow.test.tsx`
Expected: FAIL on the class assertions.

- [ ] **Step 3: Implement**: add `whitespace-pre-wrap` to the edit button; `items-center` →
`items-start` on the row content. Keep `min-h-11`.

- [ ] **Step 4: Run and see them pass**

Run: `cd frontend && npx vitest run src/components/NoteRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NoteRow.tsx frontend/src/components/NoteRow.test.tsx
git commit -m "Show note line breaks in the list"
```

### Task 6: Toast and list padding follow the Composer's height

**Files:**
- Modify: `frontend/src/components/Composer.tsx`, `frontend/src/pages/MonthPage.tsx`
- Test: `frontend/src/components/Composer.test.tsx`, `frontend/src/pages/MonthPage.test.tsx`

**Interfaces:**
- Produces: Composer prop `onHeightChange?: (height: number) => void`, called with the form's
  `offsetHeight` on mount and on every `ResizeObserver` callback; no-op when `ResizeObserver` is
  undefined. MonthPage constant `DEFAULT_COMPOSER_HEIGHT = 112` (px, today's one-line height) until
  the first report.

- [ ] **Step 1: Write the failing tests**
  - Test helper (in each test file that needs it): a fake `ResizeObserver` installed on `globalThis`
    that records callbacks so the test can trigger them, with `offsetHeight` stubbed on the form.
  - `Composer.test.tsx`: `it('reports its height as it grows', …)`: offsetHeight 112 → `onHeightChange(112)`;
    change to 208 and trigger the observer → `onHeightChange(208)`; unmount disconnects.
  - `MonthPage.test.tsx`:
    - `it('places the toast above the Composer it measured', …)`: report 208, delete a note →
      the `status` element's `--composer-height` is `'208px'` and its class contains
      `bottom-[calc(var(--composer-height)+0.5rem+var(--keyboard-inset))]`.
    - Keep `'lifts the Undo toast above the on-screen keyboard'` (`--keyboard-inset: 300px`).
    - Rewrite `'lifts the toast above the taller Composer while editing'` (it pins `7.5rem`/`9rem`):
      the Composer reports 112, then opening edit mode reports 144 → `--composer-height` goes
      `'112px'` → `'144px'`.
    - `it('pads the list so the last note can scroll above the Composer', …)`: report 208 → `<main>`'s
      `style.paddingBottom` is `'calc(208px + 4rem)'`.
    - `it('uses the default height before the Composer reports one', …)` → `'calc(112px + 4rem)'`.
    - `it('saves an old one-line note with a new line break', …)`: edit a `'Trip'` note to
      `'Trip\nday 1'`, Save → `api.updateNote` called with `{ text: 'Trip\nday 1' }`.

- [ ] **Step 2: Run and see them fail**

Run: `cd frontend && npx vitest run src/components/Composer.test.tsx src/pages/MonthPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - Composer: a form ref and a `useEffect` that reports `offsetHeight` and observes the form.
    The height includes the safe-area padding.
  - MonthPage: `const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT)`; pass
    `onHeightChange={setComposerHeight}`. Toast: set `--composer-height` next to `--keyboard-inset`,
    one class `bottom-[calc(var(--composer-height)+0.5rem+var(--keyboard-inset))]` (drop the
    `editing` branch and the separate `env(safe-area-inset-bottom)`, since the measured height
    includes it). `<main>`: drop `pb-44`, set `style={{ paddingBottom: \`calc(${composerHeight}px + 4rem)\` }}`.
    Update the toast comment.

- [ ] **Step 4: Run the whole frontend suite, lint and build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "Place the toast and list padding from the Composer's measured height"
```

### Task 7: End-to-end tests, run once

**Files:**
- Modify: `e2e/tests/month.spec.ts`, `e2e/tests/edit.spec.ts` (the 8 `press('Enter')` submits)
- Modify: `e2e/tests/agent.spec.ts`
- Create: `e2e/tests/multiline.spec.ts`

**Interfaces:**
- Consumes: `signIn` (`e2e/fixtures/auth.ts`), `addNoteOverMcp` (`e2e/fixtures/mcp.ts`), the accessible
  names from Task 3.

- [ ] **Step 1: Replace Enter-to-submit** in `month.spec.ts` and `edit.spec.ts`: each
`input.press('Enter')` becomes a click on `Add note` (or `Save` in edit mode). Enter now inserts a line.

- [ ] **Step 2: Write the new tests**
  - `multiline.spec.ts` `'adds a multi-line note and keeps its lines after a reload'`: `/2001/7`, fill
    `"Trip ${run}\n- day 1\n\n\n\n- day 2"` with `keyboard.press('Enter')` between typed lines (so Return
    is exercised), click Add note, reload; the row's edit button has `innerText`
    `"Trip ${run}\n- day 1\n\n- day 2"` (blank lines collapsed) and is taller than a one-line row.
  - `multiline.spec.ts` `'⌘/Ctrl+Return sends'`: type, press `ControlOrMeta+Enter` → the note appears.
  - `multiline.spec.ts` `'the box stops growing at 5 lines'`: type 8 lines → the textarea's height is
    the same as with 5 lines, and `scrollHeight > clientHeight`.
  - `multiline.spec.ts` at iPhone width (`viewport 390×844`) `'with a 5-line draft the last note
    scrolls above the Composer'`: add 6 notes, type a 5-line draft, scroll to the bottom → the last
    row's bottom ≤ the Composer form's top; delete it → the `status` toast's bottom ≤ the form's top.
  - `agent.spec.ts` `'Muse adds a multi-line note over MCP and the app shows its lines'`:
    `addNoteOverMcp` with `text: "agent ${run}\r\nline 2"` → body has no `"isError":true`; in the
    app at that month the row's text has `innerText` `"agent ${run}\nline 2"` with the agent badge.

- [ ] **Step 3: Run the whole e2e suite once**

Run: `(cd e2e && npm test) ; (cd e2e && npm run test:servers-stopped)`
Expected: all tests PASS; the servers-stopped check passes. If a test fails, debug, fix it, and rerun
just that file; then rerun the full suite once more at the end.

- [ ] **Step 4: Final checks**

Run: `(cd backend && npm test && npm run lint && npm run build) && (cd frontend && npm test && npm run lint && npm run build)`
Expected: all PASS.

- [ ] **Step 5: Commit and push (no PR)**

```bash
git add e2e
git commit -m "E2E: multi-line notes from the app and from Muse; submit by button"
git push
```
