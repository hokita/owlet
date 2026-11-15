# owlet: Pull to Refresh — Design

## Why

The owner runs owlet as an iPhone Home Screen app (standalone). There Safari has no built-in pull-to-refresh, so notes added elsewhere — mainly by Muse over `/mcp` — don't show until the app is closed and reopened. The owner approved the design below; this document records it, plus the calls left open, each marked **(my call)**.

## Goals

- Pull down on the month screen, at the top of the page, to refetch the month's notes.
- Coming back to owlet from another app refreshes it automatically, through the same refetch.
- Notes already on screen are never cleared by a refresh, even one that fails.

## Non-goals

Live updates (Firestore listeners), push notifications, polling, a new library, any backend change.

## Anti-goals

Breaking normal scrolling, the iOS bounce when not pulling, the row swipe-to-delete, or desktop use.

## Screens covered

Only `MonthPage` (`frontend/src/pages/MonthPage.tsx`) lists notes; `LoginPage` doesn't. So pull-to-refresh goes on `MonthPage`, which is every screen that lists notes. **(my call: the default, nothing excluded)**

## How the app fetches today

No React Query or SWR. `MonthPage` calls `api.getReview(month)` in a `useEffect` keyed on `[month, loadAttempt]` and merges the result into `notes` with `mergeNotes` (by id). The month is remounted on navigation (`key = month`). The "agent" badge comes from `note.source === 'api'` in `NoteRow`, so refreshed notes from Muse get it with no extra work.

## Approaches

1. **A small `usePullToRefresh` hook with plain touch listeners + a `refresh()` in `MonthPage` that reuses `api.getReview`** — chosen by the owner. No dependency, ~60 lines, fits the existing hand-written touch code in `NoteRow`.
2. A pull-to-refresh library — rejected by the owner: a new dependency for one gesture.
3. Moving data fetching to React Query/SWR to get `refetchOnWindowFocus` — not considered further: the design says reuse what's there, not add a parallel mechanism.

## Behaviour (as approved)

- The pull starts only when the page is scrolled to the top. The content follows the finger at 0.5× the drag, capped at 120px.
- Under 70px the label says "Pull to refresh"; at or past 70px, "Release to refresh". Releasing past it shows a spinner while refetching; releasing under it snaps back with no fetch.
- Success: the list updates in place; Muse's notes keep the "agent" badge.
- Failure: "Couldn't refresh. Pull to try again." The notes on screen stay.
- Returning to the app (`visibilitychange` → `visible`) refreshes automatically through the same path.

## Calls the design left open (my calls)

1. **What a refresh does to the list.** The server's list wins, so a note Muse deleted also disappears. Two exceptions, so the user's own actions are never undone by a refresh: a note added in the app while the refresh was in flight is kept, and a note deleted in the app (pending Undo, or its delete sent during the refresh) stays hidden. `mergeNotes` alone can't do this (it never removes), so the refresh result is applied with a small `applyRefresh` function.
2. **Scroll container.** The page scrolls on `window` (sticky header, `min-h-dvh`), so "at the top" means `window.scrollY <= 0`, checked at touch start and on every move. If the page scrolls during the gesture, the pull is cancelled.
3. **Where the gesture listens.** On `<main>` only, not the header or the fixed Composer, so typing or dragging in the Composer never pulls.
4. **Direction lock.** Same rule as `NoteRow`: nothing happens until the finger moves 8px; then a mostly-horizontal drag is left to the row swipe and a mostly-vertical drag upward is normal scrolling. Only a downward drag at the top pulls. A second finger or `touchcancel` ends the pull with no fetch.
5. **Stopping the iOS bounce only while pulling.** React's touch handlers are passive, so the hook adds a native `touchmove` listener with `{ passive: false }` and calls `preventDefault()` only once a pull has engaged. Every other touch is untouched.
6. **No overlapping refreshes.** One refresh at a time, for pull and return alike. A pull while one runs doesn't start (the spinner stays); an auto-refresh while one runs is skipped.
7. **Minimum interval for auto-refresh: 30 seconds** since the last load or refresh started (the initial load counts). Quick hide/show cycles don't refetch. A pull ignores the interval: the user asked explicitly.
8. **Auto-refresh only after the month has loaded.** Before that, the existing load / Retry flow is in charge; a refresh never sets `loaded` or `loadError`.
9. **Failure message applies to auto-refresh too**, shown as its own `role="alert"` banner (separate from the load and add/delete errors), cleared by the next successful refresh.
10. **Accessibility.** The pull label and spinner sit in an `aria-live="polite"` region, not `role="status"`, which the "Deleted / Undo" toast already uses (tests and e2e look it up by that role).
11. **Desktop.** Mouse and trackpad don't fire touch events, so the gesture never starts there; the return auto-refresh still works. Desktop has no manual refresh beyond reloading the page, which is fine.
12. **Stale results.** A refresh that resolves after the month changed (unmount) is ignored, the same `cancelled` pattern as the initial load.

## Shape

- `frontend/src/pullToRefresh.ts` — pure numbers: `pullDistance(dy)`, `isArmed(distance)`, constants (`RESISTANCE = 0.5`, `MAX_PULL = 120`, `THRESHOLD = 70`).
- `frontend/src/usePullToRefresh.ts` — the touch hook: takes the element ref, `onRefresh(): Promise<void>` and whether it's enabled; returns `{ distance, state }` (`idle | pulling | armed | refreshing`).
- `frontend/src/useRefreshOnReturn.ts` — `visibilitychange` listener calling a function.
- `MonthPage` — `refresh()` with the in-flight and 30-second guards, `applyRefresh`, the indicator above the sections, and the failure banner.

## Testing (red/green TDD)

- Unit (Vitest + Testing Library, jsdom): pull distance and cap, threshold label, release under/over the threshold, top-only, horizontal swipe ignored, upward drag ignored, `touchcancel`, no `preventDefault` before engaging, refresh failure keeps notes and shows the message, success adds a new note with its badge and drops a server-deleted one, local add/delete during a refresh survives, no overlap, auto-refresh on return and its 30-second guard, nothing before the first load.
- E2E (existing Playwright + emulators on 9099/8081, backend 8090, frontend 5174): load `/2001/7`, add a note through `/mcp` with the test API token, pull down with real touch events, see the note with the "agent" badge.
- Existing frontend, backend and e2e suites stay green.
