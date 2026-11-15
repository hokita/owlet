# owlet

Personal monthly review app — successor to hokita/owl.

## Stack

| Layer    | Tech                                                                             |
| -------- | -------------------------------------------------------------------------------- |
| Frontend | React, Vite, TypeScript, Tailwind CSS, Firebase Auth                             |
| Backend  | Node.js 24, Express, TypeScript                                                  |
| Storage  | Firestore (via the backend only — the frontend never touches Firestore directly) |
| Hosting  | Firebase Hosting (frontend) + Cloud Run (backend)                                |

## Project structure

```
owlet/
├── frontend/   # React app
├── backend/    # Express API
└── e2e/        # Playwright end-to-end tests
```

## Local development

**1. Start the Firebase emulators (Auth + Firestore)**

```sh
firebase emulators:start --project demo-owlet --only auth,firestore
```

**2. Backend** (in a second terminal)

```sh
cd backend
cp .env.example .env
npm install
npm run dev
```

**3. Frontend** (in a third terminal)

```sh
cd frontend
cp .env.example .env
npm install
npm run dev
```

Locally, sign-in goes through the Auth emulator's fake identity picker, so use the email listed in `ALLOWED_EMAILS`.

## Tests

```sh
(cd backend && npm test)
(cd frontend && npm test)
(cd e2e && npm install && npx playwright install --with-deps chromium && npm test)
(cd e2e && npm run test:servers-stopped)  # after a run that started its own servers: fails if any were left running
```

## Deploy

Pushing to `main` triggers GitHub Actions, which deploys the backend, frontend, and Firestore rules.

- Frontend: https://owlet-c659da.web.app
- Backend: https://owlet-backend-185845390027.asia-northeast1.run.app
- GCP project: `owlet-c659da`, region `asia-northeast1`

## Agent notes (API)

Agents (e.g. Muse via a custom connector) add notes by calling the API with the API token. On the REST API the token only works for adding a note — listing and deleting there still need the signed-in app; the [MCP server](#mcp-muse) can list, add and delete with the token. Token requests are limited to 30 an hour, and their notes show an "agent" badge in the app.

**Request**

```
POST https://owlet-backend-185845390027.asia-northeast1.run.app/api/reviews/{year}/{month}/notes
Authorization: Bearer <token>
Content-Type: application/json

{"type": "event" | "learn" | "next", "text": "<one line, ≤ 500 chars>"}
```

**Responses:** `201` with the saved note (`"source": "api"`); `400 {"error": "..."}` for invalid input; `401` for a missing or wrong token; `429` with `Retry-After` (seconds) when rate limited.

```sh
curl -sS -X POST "https://owlet-backend-185845390027.asia-northeast1.run.app/api/reviews/2026/11/notes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type": "learn", "text": "Firestore batches commit atomically"}'
```

**One-time setup** (owner, once; nothing here is automated)

```sh
# 1. Generate a token: 32 random bytes, kept only in this shell for now
TOKEN="$(openssl rand -hex 32)"

# 2. Store it in Secret Manager
printf %s "$TOKEN" | gcloud secrets create owlet-api-token \
  --project owlet-c659da --replication-policy automatic --data-file=-

# 3. Let the Cloud Run runtime service account read it
gcloud secrets add-iam-policy-binding owlet-api-token --project owlet-c659da \
  --member serviceAccount:185845390027-compute@developer.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

# 4. Wire it into backend deploys, then redeploy
gh variable set OWLET_API_TOKEN_SECRET --repo hokita/owlet --body owlet-api-token
gh workflow run backend.yml --repo hokita/owlet --ref main

# 5. Check it works (after the redeploy finishes): expect HTTP 201
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  "https://owlet-backend-185845390027.asia-northeast1.run.app/api/reviews/$(TZ=Asia/Tokyo date +%Y/%-m)/notes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type": "event", "text": "owlet agent token set up"}'

# 6. Paste the token into the Muse connector's Bearer token field, then drop it from the shell
unset TOKEN
```

Until step 4, deploys run without the token and token auth stays off. To rotate, add a new secret version (`gcloud secrets versions add owlet-api-token --data-file=-`), redeploy, and update the token in the Muse connector.

## MCP (Muse)

The backend serves an MCP server (streamable HTTP, stateless) at:

```
https://owlet-backend-185845390027.asia-northeast1.run.app/mcp
Authorization: Bearer <token>
```

It uses the same API token as above and accepts nothing else (no Firebase sign-in); a missing or wrong token gets `401`.

| Tool          | Arguments                                                                              | Notes                                              |
| ------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `list_notes`  | `year`, `month`                                                                        | Read-only                                          |
| `add_note`    | `year`, `month`, `type` (`event` \| `learn` \| `next`), `text` (one line, ≤ 500 chars) | Same validation as the app; saved as an agent note |
| `delete_note` | `year`, `month`, `id`                                                                  | Marked destructive, so the client asks first       |

**Rate limit:** REST token requests and MCP tool calls share the 30-an-hour limit. Protocol requests (`initialize`, `tools/list`) aren't counted. Over the limit, a tool call returns a tool error `Rate limit reached: try again in <N> seconds` (HTTP status stays 200).

**Muse setup** (after a deploy): add a custom connector with the URL above and the token as a Bearer header, then try each tool: list this month's notes, add one (it shows in the app with the "agent" badge), delete it (Muse should ask first). If the connector can't send a custom `Authorization` header, it can't connect — OAuth isn't supported.

## Environment variables (backend)

| Variable              | Description                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `ALLOWED_EMAILS`      | Comma-separated Google account emails allowed to use the app (from Secret Manager in production) |
| `FIREBASE_PROJECT_ID` | Firebase project ID (`demo-owlet` for local dev)                                                 |
| `FRONTEND_URL`        | Frontend origin for CORS                                                                         |
| `PORT`                | Port the backend listens on                                                                      |
| `OWLET_API_TOKEN`     | Optional. Token that agents may use to add notes (≥ 43 chars); unset disables token auth         |
