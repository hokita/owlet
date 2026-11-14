# owlet: Agent Notes — Design

## Overview

Let LLM agents running in a terminal (Muse, Claude Code, …) save notes to owlet on the owner's behalf, through a small CLI and a long-lived API token. Single user — the owner. The design was decided by the orchestrator; this document records it plus the calls made while building it.

## Goals

- `owlet add <event|learn|next> "text" [--month YYYY-MM]` from any terminal.
- Notes saved this way are marked and shown with a small badge in the month page.
- Shipping this must not break the deploy before the owner has created the token secret.

## Non-goals

- MCP server (may come later as a thin wrapper over the CLI).
- Listing, editing or deleting notes with the token.
- Multiple tokens, token rotation tooling, per-agent identity.

## Anti-goals

- The API token working on anything other than adding a note.
- Creating secrets or touching production from this change.

## Backend

**Auth.** `POST /api/reviews/:year/:month/notes` accepts either the existing Firebase ID token (allowlisted email) or `Authorization: Bearer <OWLET_API_TOKEN>`. Every other route keeps the Firebase-only middleware, where the API token fails verification → `401`.

- Comparison is constant-time (`crypto.timingSafeEqual` over SHA-256 digests, so lengths always match).
- `OWLET_API_TOKEN` unset → token auth is off; the route behaves exactly as before.
- `OWLET_API_TOKEN` shorter than 43 characters (32 bytes in base64url; `openssl rand -hex 32` gives 64) → treated as misconfigured: token auth stays off and a warning is logged. *(Claude's call: refuse a weak token rather than accept it.)*
- A bearer value that isn't the API token falls through to Firebase verification, so the app keeps working on the same route.

**Rate limit.** Token-authenticated requests: 30 per rolling hour, in memory per instance → `429 { error: 'Too many requests' }` with `Retry-After`. With Cloud Run's max of 2 instances the worst case is 60/hour, which is acceptable for a single owner.

**Validation.** Unchanged and shared with the app: type `event|learn|next`, trimmed text 1–500 chars with no line breaks, year 2000–2100, month 1–12.

**Source.** Notes get `source: 'app' | 'api'`. Token requests store `'api'`, the app stores `'app'`; notes without the field (all existing ones) read as `'app'`. The API returns `source` on every note.

## Frontend

API notes show a small grey "agent" badge after the text (`aria-label="Added by an agent"`). Nothing else changes.

## CLI (`cli/`)

Node 24 + TypeScript, built with `tsc`, installed with `npm link` (`owlet` on PATH).

```
owlet add <event|learn|next> "text" [--month YYYY-MM]
```

- Month defaults to the current month in Asia/Tokyo.
- Token: `OWLET_TOKEN`, else macOS Keychain `security find-generic-password -s owlet -w`. Missing → clear error explaining both options.
- Base URL: `OWLET_API_URL`, default the production backend.
- Success prints `Saved <type> to YYYY-MM: <text>`; failures print the server's `error` with the status and exit 1; usage errors exit 2.
- Client-side checks (type, non-empty text, month format) give fast feedback; the server stays the authority.

## Deploy

`backend.yml` adds `OWLET_API_TOKEN=<secret>:latest` to `--set-secrets` only when the repo variable `OWLET_API_TOKEN_SECRET` is set. Cloud Run fails a deploy that references a missing secret, and the deploy service account can't read Secret Manager to check, so an explicit switch the owner flips after creating the secret is the safe way. README documents the one-time setup; Claude runs none of it.

## Testing (red/green TDD)

- Backend: token comparison/config, rate limiter, combined auth middleware, route `source` handling, service `source` storage/defaulting, and app-level tests proving the token is rejected on GET/DELETE and accepted on POST.
- Frontend: badge shown only for `source: 'api'`.
- CLI: argument parsing (incl. Asia/Tokyo default month), token lookup order, HTTP client errors, end-to-end `main()` with fakes.
- E2E: a token POST shows up with the badge; the token is rejected on GET.

## Approaches considered (rate limit / deploy wiring)

- **Rate limit:** in-memory per instance (chosen, per the design) vs. Firestore-backed counter. A shared counter costs a read+write per request for little gain at one user.
- **Deploy wiring:** repo-variable switch (chosen) vs. always referencing the secret (breaks deploys until it exists) vs. probing Secret Manager in the workflow (needs a new IAM grant on the deploy account).

## Calls made by Claude

- Minimum token length 43 characters; shorter disables token auth with a warning.
- Badge text "agent"; CLI env names `OWLET_TOKEN` / `OWLET_API_URL`; repo variable `OWLET_API_TOKEN_SECRET`.
- No `--json` output flag yet.
