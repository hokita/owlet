# owlet: Environment Setup — Design

## Overview

owlet is the successor to `hokita/owl`, a personal monthly review app (Go + GraphQL + MySQL + Vue, self-hosted on a home Kubernetes cluster). owlet rebuilds it on GCP using the same stack and deployment pattern as `hokita/hamster`.

This first pass stands up the full environment — frontend, API, database, auth, local dev, CI/CD — and proves the wiring with a hello-world page. No review/note features yet; those come in a later spec.

## Goals

- Frontend, API, Firestore and Firebase Auth wired together and deployed on GCP.
- A hello-world page that exercises every hop: Hosting → Auth → Cloud Run → Firestore.
- Local dev with Firebase emulators, and CI/CD with hamster parity.
- **$0/month** in practice (see Cost).

## Non-goals (this pass)

- Monthly reviews, notes, or any owl feature.
- Migrating data from owl's MySQL.
- Custom domain, staging environment, PR preview channels.
- Multi-user support — single owner, gated by an email allowlist.

## Architecture

```
owlet/
├── frontend/   # React 18 + Vite + TS + Tailwind v4, Firebase Auth → Firebase Hosting
├── backend/    # Node 24 + Express + TS, Firebase Admin SDK → Cloud Run (asia-northeast1)
└── e2e/        # Playwright, against emulators
```

Mirrors hamster exactly in shape:

- The frontend talks only to Firebase Auth and the backend API, never to Firestore.
- The backend is the only Firestore client (Admin SDK).
- `firestore.rules` denies all direct client access (`allow read, write: if false`).
- `authMiddleware` verifies the Firebase ID token and checks its email against `ALLOWED_EMAILS` (comma-separated).

## Hello world slice

**API**

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/health` | none | `{ "ok": true }` |
| GET | `/api/hello` | required | Increments `visits` on Firestore doc `meta/hello` (creating it with `visits: 1` if missing, in a transaction) and returns `{ "message": "Hello, owlet", "visits": N }` |

**Frontend**

- Signed out: a "Sign in with Google" button.
- Signed in: shows the API's message and visit count, plus a sign-out button.
- API error (e.g. 401 for a non-allowlisted email, matching hamster): shows the error message.

## Local development

- Firebase emulators: Auth `:9099`, Firestore `:8081` (hamster's ports).
- `backend/.env.example`: `ALLOWED_EMAILS`, `FIREBASE_PROJECT_ID`, `FRONTEND_URL`, `PORT`.
- `frontend/.env.example`: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_API_URL`.
- `npm run dev` in each of `frontend/` and `backend/`.

## Testing (red/green TDD)

- Backend: Vitest + Supertest — `/health`, auth middleware (missing token, bad token, non-allowlisted email, allowed email), `/api/hello` (first visit creates doc, later visits increment).
- Frontend: Vitest + Testing Library — signed-out, signed-in success, API error states.
- E2E: Playwright — sign in via Auth emulator → see "Hello, owlet".

## GCP setup (run by Claude with the user's gcloud/firebase login)

1. Create GCP project `owlet-<suffix>`, add Firebase, link billing account `015EF6-5B317F-011F7B`.
2. Enable APIs: Cloud Run, Artifact Registry, Firestore, Secret Manager, IAM Credentials.
3. Firestore (native mode) in `asia-northeast1`.
4. Artifact Registry repo `owlet` (Docker, `asia-northeast1`) with a cleanup policy keeping the 2 most recent images.
5. Secret `ALLOWED_EMAILS` = the owner's email.
6. Firebase web app registration (for client config).
7. Workload Identity Federation: pool `github-pool`, provider `github-provider` restricted to `hokita/owlet`, service account `github-actions-deploy` with `roles/run.admin`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser`, `roles/firebasehosting.admin` (hamster's set) plus `roles/firebaserules.admin` and `roles/datastore.indexAdmin` for the Firestore rules/indexes deploy.
   Cloud Run runtime service account (default compute SA): `roles/secretmanager.secretAccessor`, `roles/datastore.user`.
8. GitHub secrets `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` on `hokita/owlet`.
9. Budget alert at ¥100 on the billing account, scoped to the project.

**Manual step for the user:** enable the Google sign-in provider in the Firebase console (Authentication → Sign-in method), and add the Hosting domain to authorized domains if not automatic.

## CI/CD (hamster parity)

- `ci.yml` on PRs: lint, type-check, test for frontend and backend; e2e job.
- `backend.yml` on push to `main` (`backend/**`): lint, test, build, docker build/push in GitHub Actions (not Cloud Build), `gcloud run deploy owlet-backend --min-instances 0 --max-instances 2 --allow-unauthenticated`, secrets from Secret Manager.
- `frontend.yml` on push to `main` (`frontend/**`, `firebase.json`, `.firebaserc`): lint, test, build with public Firebase config, `firebase deploy --only hosting`.
- `firestore-rules.yml` on push to `main` (rules/indexes): `firebase deploy --only firestore`.

## Cost

Billing must be linked for Cloud Run, but usage stays within free tiers:

| Service | Free tier | Expected |
|---|---|---|
| Cloud Run | 2M req, 180k vCPU-s / month | hundreds of requests |
| Firestore | 1 GB, 50k reads / 20k writes per day | KB |
| Firebase Hosting | 10 GB storage, 360 MB/day | small SPA |
| Firebase Auth | 50k MAU | 1 |
| Secret Manager | 6 versions, 10k accesses | 1 secret |
| Artifact Registry | 0.5 GB | ≤ 2 images via cleanup policy |

Guards: cleanup policy, max 2 instances, scale to zero, no Cloud Build, ¥100 budget alert.

## Left to the builder

- Exact package versions (match hamster where possible: Node `24.18.0`, `firebase-tools@15.22.1`).
- Visual styling of the hello page (plain Tailwind, minimal).
- Additional IAM roles, only if a deploy fails on permissions — never fall back to a static key.

## Calls made by Claude (not explicitly discussed)

- Repo layout `frontend/`, `backend/`, `e2e/`, matching hamster.
- Hello doc at `meta/hello` with a transactional visit counter.
- Firestore rules/index deploy roles beyond hamster's set.
- Initial commits go to `main` (empty repo); later work uses feature branches + PRs.
