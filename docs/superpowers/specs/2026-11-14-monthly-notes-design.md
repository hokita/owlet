# owlet: Monthly Notes — Design

## Overview

The first real feature of owlet: the monthly review page from `hokita/owl`, rebuilt iPhone-first on the environment from `2026-11-08-owlet-environment-design.md`. One page per month holds short notes tagged `event`, `learn` or `next`.

The user will use owlet mainly on iPhone. They approved a sketch of the layout; the scope of this slice was set by the orchestrator after the user asked to start implementing (the open questions — when notes get written, whether old nexts are revisited — are still unanswered and feed later slices).

## Goals

- One review per year/month, with notes `{ type: event | learn | next, text (one line), createdAt }`, stored in Firestore through the backend API only.
- Month page at `/:year/:month`; `/` (and any unknown path) redirects to the current month.
- iPhone-first layout, same single column on desktop, just wider.

## Non-goals (later slices)

- Carrying last month's nexts forward.
- Editing notes.
- A cross-month view.
- PWA / home-screen install, and replacing `signInWithPopup` (unreliable in iOS standalone mode).
- Migrating data from owl's MySQL.

## Anti-goals

- A swipe that deletes a note with no way back.
- A composer hidden behind the iPhone keyboard or home indicator.

## Page

```
┌─────────────────────────────┐
│  ‹      November 2026     › │  sticky header
├─────────────────────────────┤
│ EVENTS                      │
│  Moved to the new team      │  rows ≥ 44pt, swipe left to delete
│ LEARNS                      │
│  Firestore transactions     │
│ NEXTS                       │
│  Nothing yet                │
│                  Sign out   │
├─────────────────────────────┤
│ [event][learn][next]        │  fixed composer
│ [ one-line note…      ] [➤] │
└─────────────────────────────┘
        ┌──────────────────┐
        │ Deleted   Undo   │    toast, ~5 s
        └──────────────────┘
```

- **Header:** month name (`November 2026`), ‹ › buttons go to the previous/next month and push a history entry.
- **Sections:** Events, Learns, Nexts, each in creation order. Empty sections show "Nothing yet".
- **Rows:** at least 44pt tall. Swiping left past a threshold deletes the note; a shorter swipe snaps back. On devices with a hover pointer (desktop), a Delete button appears on hover instead, since there's no swipe.
- **Undo:** deleting removes the row and shows "Deleted · Undo" for 5 s. The API delete is sent only when the toast expires (or sooner, if another note is deleted or the month changes). Undo puts the row back. If the delete fails, the row is restored and an error shown.
- **Composer:** fixed at the bottom; three type chips, a one-line input, a send button. Enter submits. The input keeps focus after sending so the keyboard stays up. The last-used type is remembered on this device (`localStorage`, failures ignored). Padding respects `env(safe-area-inset-bottom)` (`viewport-fit=cover`), and the composer is lifted above the on-screen keyboard using `visualViewport`.
- **Sign out:** a small text button at the end of the page.
- The hello-world page, its API route and its e2e test are removed.

## API

All routes need the existing auth middleware. Errors answer `{ error }`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/reviews/:year/:month` | `200 { year, month, notes: Note[] }`, notes ordered by `createdAt`. A month with no review returns `notes: []`. |
| POST | `/api/reviews/:year/:month/notes` | Body `{ type, text }`. Creates the review if needed, adds the note. `201 Note`. |
| DELETE | `/api/reviews/:year/:month/notes/:id` | `204`. Idempotent. |

`Note = { id, type, text, createdAt (ISO string) }`.

Validation (`400`): year an integer 2000–2100, month 1–12, type one of the three, text a string that is non-empty after trimming, at most 500 characters, no line breaks.

## Data

- `reviews/{YYYY-MM}` — `{ year, month, updatedAt }`. A deterministic id makes "one review per month" structural, with no race.
- `reviews/{YYYY-MM}/notes/{autoId}` — `{ type, text, createdAt (Timestamp) }`.

Adding a note writes the review doc (`merge`) and the note in one batch. The `meta/hello` doc from the hello-world slice stays in production Firestore; it's harmless and can be deleted by hand.

## Testing (red/green TDD)

- Backend: services against a mocked Firestore (as `services/hello.test.ts` did); routes with Supertest and mocked services, covering validation.
- Frontend: month helpers, API client, App routing, MonthPage (load, add, delete + undo, month navigation, errors), NoteRow swipe, Composer, keyboard inset hook.
- E2E: sign in → lands on current month → add a note of each type → delete one → navigate months.

## Approaches considered

- **Undo:** delayed delete (chosen) vs. delete immediately and re-create on Undo. Re-creating loses the note's id and `createdAt` and needs a restore endpoint; delayed delete needs nothing new on the server. Its cost: closing the app within 5 s of a delete keeps the note, which is the safe direction.
- **Routing:** a ~20-line `history` helper (chosen) vs. adding react-router. Only one route shape exists; a router can come later if more pages arrive.
- **Swipe:** touch events with a threshold (chosen) vs. CSS scroll-snap revealing a Delete button. Scroll-snap is a two-step delete (swipe, then tap); with Undo available, one swipe is enough.

## Calls made by Claude

- API shape, path names, validation limits (500 chars, years 2000–2100).
- Firestore layout with `YYYY-MM` doc ids.
- Undo window of 5 s; hover Delete button on desktop.
- Sign out moved to the bottom of the page.
- English month names (the existing UI is English).
