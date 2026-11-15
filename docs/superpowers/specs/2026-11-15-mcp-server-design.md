# owlet: MCP Server — Design

## Overview

Let Muse (Meta's iPhone AI assistant, which runs in Meta's cloud and can add custom connectors) list, add and delete owlet notes through MCP, using the existing agent API token. No OAuth. Single user — the owner. The owner approved this design; this document records it.

## Goals

- Muse can `list_notes`, `add_note` and `delete_note` through a custom MCP connector.
- Same token, same validation, same note code as the REST API. One backend, one deploy.

## Non-goals

- OAuth, per-token permissions, undo/trash.
- Changing the REST API: `GET` and `DELETE` stay sign-in only; `POST notes` keeps accepting the token for now.

## Backend

**Route.** `/mcp` on the existing Express app (`backend/src/app.ts`, Cloud Run service `owlet-backend`), served by the official MCP TypeScript SDK's streamable HTTP support in **stateless** mode (a fresh server per request, no sessions). Exact SDK version pinned.

**Auth.** `Authorization: Bearer <owlet token>`, checked with the existing `apiTokenMatcher`. Missing or wrong token → `401`. `/mcp` accepts only the token, never a Firebase ID token. With `OWLET_API_TOKEN` unset, `/mcp` rejects everything.

**Rate limit** *(owner decision, 2026-11-15)*. Only tool calls count, not `initialize`, `tools/list` or other protocol requests. They share one 30-per-hour limiter with the REST token route. Over the limit, the tool call returns a tool error `Rate limit reached: try again in <N> seconds` (HTTP 200); REST keeps its `429` with `Retry-After`.

**Tools.**

| Tool | Input | Notes |
| --- | --- | --- |
| `list_notes` | `year`, `month` | Read-only. Returns the month's notes. |
| `add_note` | `year`, `month`, `type`, `text` | Exactly the app's validation: type `event` \| `learn` \| `next`; trimmed text 1–500 chars, single line; year 2000–2100, month 1–12. Saved with `source: 'api'`. |
| `delete_note` | `year`, `month`, `id` | Annotated `destructiveHint: true` so Muse asks before running it. |

Tools reuse the existing note code: the validation now inside `backend/src/routes/reviews.ts` moves to a shared module used by both the REST routes and the tools (no copy-paste); Firestore access stays in `backend/src/services/reviews.ts`. Invalid input comes back as a tool error (`isError: true`) with a clear message, not a protocol error.

**Express details.**

- `express.json()` already parses bodies app-wide; the MCP handler receives `req.body` as the pre-parsed body.
- CORS is restricted to `FRONTEND_URL`. Muse calls server-to-server (no browser, no `Origin` preflight), so CORS doesn't affect it; no CORS change.

## Testing (red/green TDD)

- Each tool exercised through a real MCP SDK client against the app running in-process.
- Missing or wrong token → `401`; Firebase-style bearer → `401`; tool calls are rate limited, protocol requests are not.
- Validation errors come back as clear tool errors.
- Existing backend, frontend and e2e suites stay green and unchanged.

## After deploy (manual, by the owner)

1. Merge; the backend workflow deploys a new Cloud Run revision.
2. In Muse, add a custom connector: URL `https://owlet-backend-185845390027.asia-northeast1.run.app/mcp`, auth as a Bearer header with the owlet token.
3. Try each tool: list this month's notes; add a note (check it appears in the app with the "agent" badge); delete that note (Muse should ask first).

## Risk

If Muse's connector cannot send a custom `Authorization` header (for example it only supports OAuth for MCP), it can't connect. Then stop and ask the owner — don't build OAuth.

## Later (not now)

Once MCP works from Muse, remove token auth from the REST add-note route in a follow-up PR.

## Approaches considered

1. **MCP inside the existing backend** — picked. Reuses the token check, note code and deploy.
2. **Separate MCP service calling owlet's API** — dropped. A second deploy, and the API would need changes for list/delete anyway.
