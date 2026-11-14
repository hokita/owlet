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
├── cli/        # `owlet` CLI for agents to add notes
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
(cd cli && npm test)
(cd cli && npm install && npm run build)  # e2e runs the built CLI
(cd e2e && npm install && npx playwright install --with-deps chromium && npm test)
(cd e2e && npm run test:servers-stopped)  # after a run that started its own servers: fails if any were left running
```

## Deploy

Pushing to `main` triggers GitHub Actions, which deploys the backend, frontend, and Firestore rules.

- Frontend: https://owlet-c659da.web.app
- Backend: https://owlet-backend-185845390027.asia-northeast1.run.app
- GCP project: `owlet-c659da`, region `asia-northeast1`

## Agent notes (CLI)

LLM agents running in a terminal (Muse, Claude Code, …) can add notes with the `owlet` CLI. It authenticates with an API token that only works for adding a note — listing and deleting still need the signed-in app. Token requests are limited to 30 an hour, and their notes show an "agent" badge in the app.

```sh
owlet add <event|learn|next> "text" [--month YYYY-MM]   # month defaults to now in Asia/Tokyo
owlet add learn "Firestore batches commit atomically"
owlet add next "Write the June review" --month 2027-06
```

The CLI reads the token from `OWLET_TOKEN`, otherwise from the macOS Keychain (`security find-generic-password -s owlet -w`). `OWLET_API_URL` overrides the backend URL (default: production).

**Install**

```sh
cd cli
npm install
npm run build
npm link          # puts `owlet` on your PATH; `npm unlink -g owlet-cli` removes it
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

# 5. Keep a copy in the macOS Keychain for the CLI, then drop it from the shell
security add-generic-password -s owlet -a "$USER" -w "$TOKEN"
unset TOKEN

# 6. Check it works
owlet add event "owlet CLI set up"
```

Until step 4, deploys run without the token and token auth stays off. To rotate, add a new secret version (`gcloud secrets versions add owlet-api-token --data-file=-`), redeploy, and update the Keychain item (`security add-generic-password -U -s owlet -a "$USER" -w "$NEW_TOKEN"`).

## Environment variables (backend)

| Variable              | Description                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `ALLOWED_EMAILS`      | Comma-separated Google account emails allowed to use the app (from Secret Manager in production) |
| `FIREBASE_PROJECT_ID` | Firebase project ID (`demo-owlet` for local dev)                                                 |
| `FRONTEND_URL`        | Frontend origin for CORS                                                                         |
| `PORT`                | Port the backend listens on                                                                      |
| `OWLET_API_TOKEN`     | Optional. Token that agents may use to add notes (≥ 43 chars); unset disables token auth         |
