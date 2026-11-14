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

## Environment variables (backend)

| Variable              | Description                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `ALLOWED_EMAILS`      | Comma-separated Google account emails allowed to use the app (from Secret Manager in production) |
| `FIREBASE_PROJECT_ID` | Firebase project ID (`demo-owlet` for local dev)                                                 |
| `FRONTEND_URL`        | Frontend origin for CORS                                                                         |
| `PORT`                | Port the backend listens on                                                                      |
