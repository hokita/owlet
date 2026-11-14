# Dependency Security (Node 24.22.3 pin + library re-check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin every Node version owlet uses (prod image, CI, deploy, Volta) to the fixed Node 24.22.3 from the 2026-11-11 security release. Then confirm against the current lockfiles that no production library advisory can be fixed by a patch or minor update.

**Architecture:** This is config only, with no app code changes. Today's prod backend (Cloud Run revision `owlet-backend-00004-s58`) already runs 24.22.3, but only because the floating `node:24-alpine` tag happened to resolve to it. This plan makes that deliberate: an exact image tag in both Dockerfile stages, exact `node-version` in all three workflows, and exact Volta pins. The library half is a re-verification with a written outcome. Nothing in it is fixable without a major upgrade, so it makes no dependency changes.

**Tech Stack:** Docker (`node:*-alpine`), GitHub Actions `actions/setup-node@v4`, Volta, npm 11 (`npm audit`), Cloud Run (`gcloud`).

**Spec:** No design doc exists. The inputs are the request plus these investigation notes:
- `/private/tmp/claude-501/-Users-hokita-ghq-github-com-hokita-orch/f7be1767-ea7c-4ee6-b96d-13a1a4575d88/scratchpad/node-runtime.md` (owlet rows in sections 2–4)
- `/private/tmp/claude-501/-Users-hokita-ghq-github-com-hokita-orch/f7be1767-ea7c-4ee6-b96d-13a1a4575d88/scratchpad/node-audit.md` (owlet rows)
- `/private/tmp/claude-501/-Users-hokita-ghq-github-com-hokita-orch/f7be1767-ea7c-4ee6-b96d-13a1a4575d88/scratchpad/node-audit-libs.md` (sections "owlet/backend" and "owlet/frontend")

## Global Constraints

- Target Node version: **`24.22.3`** exactly, everywhere. No `24`, no `24.x`, no `lts/*`.
- Docker base image: **`node:24.22.3-alpine`** in **both** `FROM` lines of `backend/Dockerfile`. Use a tag, not a digest (that was the request). For reference, the Docker Hub digest on 2026-11-14 was `sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5`, last updated 2026-11-11T23:39Z.
- Library changes: **patch/minor only**. No major bumps, no `overrides` that force a transitive package across a major (for example `uuid` 9/10 → 11). No downgrades: npm's suggested `firebase@9.14.0` is one.
- Leave `package-lock.json` files alone unless a patch/minor fix actually exists (Task 2 shows none does).
- Do not touch the pinned `npx firebase-tools@15.22.1` in the deploy workflows. It is outside this scope.
- Branch `fix/dependency-security`, off `origin/main` @ `050459f`. Do not commit or push until the human approves execution.

**Out of scope (excluded on purpose):**
- firebase-admin 12 → 14 (major): tracked as "later" in Task 2.
- Frontend `firebase` grpc-js/undici advisories: no fix exists, and the code isn't in the browser bundle. Recorded as a note in Task 2.
- Dev-only advisories (vitest/vite/esbuild/tinypool, typescript-eslint chain, e2e `firebase-tools` chain): these need majors or don't ship.
- The local Mac's Volta default (24.16.0) and the other repos (hamster, corgi, aoharu, eagle, mouse2).
- Adding `.nvmrc`/`engines`. The repo has neither today, and Volta plus setup-node are the existing mechanisms.

## Review Focus

1. **A Node pin is missed** (a fourth workflow, or a `FROM` line only one stage changed). Expected: no `24.18.0`, `24.17.0`, `'24'` or `node:24-alpine` left anywhere in the repo. Task 1 Step 1 adds a check script that fails while any of them remain.
2. **The builder and runtime stages disagree.** Expected: both stages run 24.22.3, because `dist/` is compiled in one and run in the other. Task 1 Step 6 checks `node -v` in the final image, and the check script asserts that both `FROM` lines match.
3. **Volta can't fetch 24.22.3 locally**, so `npm` would silently run another version. Expected: `node -v` inside `backend/`, `frontend/` and `e2e/` prints `v24.22.3`. Task 1 Step 5 checks this.
4. **The deploy rebuilds but Cloud Run keeps serving an old revision**, or the image resolves to another Node. Expected: the new ready revision's image has `NODE_VERSION=24.22.3`. Task 3 Step 4 checks this.
5. **"No fixable library issues" goes stale between planning and execution** (a new patch release lands). Expected: Task 2 re-runs the audit and the registry checks at execution time, and applies any new patch/minor fix instead of trusting this plan's snapshot.

---

### Task 1: Pin Node 24.22.3 in Dockerfile, workflows and Volta

**Files:**
- Create: `scripts/check-node-pins.sh` (a check that fails while any old pin remains; kept so later bumps can reuse it)
- Modify: `backend/Dockerfile:1` and `backend/Dockerfile:9` (`FROM node:24-alpine` → `FROM node:24.22.3-alpine`; keep `AS builder` on line 1)
- Modify: `.github/workflows/ci.yml:16,45,79` (`'24.18.0'` → `'24.22.3'`)
- Modify: `.github/workflows/frontend.yml:32` (`'24.18.0'` → `'24.22.3'`)
- Modify: `.github/workflows/backend.yml:29` (`'24'` → `'24.22.3'`)
- Modify: `backend/package.json:36`, `frontend/package.json:43`, `e2e/package.json:16` (`"node": "24.17.0"` → `"node": "24.22.3"`)

**Interfaces:**
- Produces: `scripts/check-node-pins.sh [expected-version]` (default `24.22.3`). It exits 0 only when all of the following hold:
  - every `FROM` line in `backend/Dockerfile` is `node:<v>-alpine`
  - every `node-version:` in `.github/workflows/*.yml` is `'<v>'`
  - every Volta `"node"` in `backend|frontend|e2e/package.json` is `"<v>"`
  - the counts are exactly 2 `FROM` lines, 5 `node-version` lines and 3 Volta pins, so a newly added file is noticed

  Otherwise it prints each offending `file:line` and exits 1. It uses `grep`/`awk` only, with no Node dependency, so it runs before Volta has fetched anything.

- [ ] **Step 1: Write the failing check** `scripts/check-node-pins.sh` as specified in Interfaces (`#!/usr/bin/env bash`, `set -euo pipefail`, `chmod +x`).

- [ ] **Step 2: Run it to verify it fails**

Run: `scripts/check-node-pins.sh`
Expected: exit 1, listing 10 offending lines: `backend/Dockerfile:1`, `:9`, `ci.yml:16,45,79`, `frontend.yml:32`, `backend.yml:29`, and the three `package.json` Volta lines.

- [ ] **Step 3: Make the 10 edits listed under Files.** Change only the version strings. Keep the quoting style (`'…'` in YAML) and `AS builder`.

- [ ] **Step 4: Run the check to verify it passes**

Run: `scripts/check-node-pins.sh && git grep -nE "24\.18\.0|24\.17\.0|node:24-alpine|node-version: '24'$"`
Expected: the script exits 0, and `git grep` prints nothing (exit 1) apart from this plan document. If the plan shows up, add `-- ':!docs'`.

- [ ] **Step 5: Confirm Volta resolves 24.22.3 in each package**

Run: `for d in backend frontend e2e; do (cd $d && node -v); done`
Expected: `v24.22.3` three times. On first use Volta downloads 24.22.3, which is expected.

- [ ] **Step 6: Build the backend image and check its Node**

Run: `docker build -t owlet-backend:node-pin backend && docker run --rm owlet-backend:node-pin node -v && docker run --rm owlet-backend:node-pin sh -c 'echo $NODE_VERSION; id -un'`
Expected: the build succeeds, then `v24.22.3`, `24.22.3`, `node`. The last value shows the `USER node` line still applies.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-node-pins.sh backend/Dockerfile .github/workflows/ci.yml .github/workflows/frontend.yml .github/workflows/backend.yml backend/package.json frontend/package.json e2e/package.json
git commit -m "Pin Node 24.22.3 (Nov 2026 security release) in Docker, CI and Volta"
```

---

### Task 2: Re-verify production library advisories (expected outcome: no change)

**Files:**
- Modify: none expected. If Step 3 finds a real patch/minor fix, modify only that package's `package-lock.json` (and `package.json` only if the fix is outside the current `^` range, which a patch/minor fix won't be).
- Create (scratch, not committed): `audit-before-{backend,frontend,e2e}.json` in the executor's scratchpad.

**Interfaces:**
- Consumes: Task 1's Volta pin (run the audits under 24.22.3 / its bundled npm).
- Produces: one paragraph headed "Library advisories" for the PR body in Task 3, using the outcome text from Step 4.

**Snapshot at planning time (2026-11-14, lockfiles at `050459f`; `npm audit --omit=dev --package-lock-only`):**

| Package | Prod findings | Root | In-major fix? |
|---|---|---|---|
| backend | 8 moderate, 0 high/critical | `uuid <11.1.1` (GHSA-w5hq-g745-h8pq) via firebase-admin 12.7.0 → @google-cloud/storage 7.22.0 / @google-cloud/firestore 7.11.6 → google-gax 4.6.1 / gaxios 6.7.1 / teeny-request 9.0.0 / retry-request 7.0.2; also `firebase-admin > uuid@10.0.0` | **No.** firebase-admin 12.7.0, @google-cloud/storage 7.22.0, google-gax 4.6.1 and gaxios 6.7.1 are each the newest release in their major. npm's only fix is `firebase-admin@14.5.1` (`isSemVerMajor: true`). |
| frontend | 11 (5 high, 6 moderate) | `@grpc/grpc-js` 1.9.16 and `undici` 6.19.7 inside `firebase` 10.14.1 | **No.** firebase 10.14.1 is the newest 10.x, and every @firebase/firestore (including the latest) pins `@grpc/grpc-js ~1.9.0`. @firebase/auth 1.7.9 pins `undici` exactly `6.19.7`. npm's "fix" `firebase@9.14.0` is a downgrade. |
| e2e | 0 | — | — |

- [ ] **Step 1: Record the "before" production audit**

Run, from the repo root, with `SCRATCH` set to the executor's scratchpad directory: `for d in backend frontend e2e; do (cd $d && npm audit --omit=dev --package-lock-only --json > "$SCRATCH/audit-before-$d.json"; jq -c .metadata.vulnerabilities "$SCRATCH/audit-before-$d.json"); done`
Expected: backend `moderate:8,total:8`, frontend `high:5,moderate:6,total:11`, e2e `total:0`. If a count differs, stop and tell the human before going on, because the snapshot is stale.

- [ ] **Step 2: Check whether a non-major fix exists for each advisory root**

Run: `npm view firebase-admin@12 version | tail -1; npm view @google-cloud/storage@7 version | tail -1; npm view @google-cloud/firestore@7 version | tail -1; npm view google-gax@4 version | tail -1; npm view gaxios@6 version | tail -1; npm view firebase@10 version | tail -1`
Expected: `12.7.0`, `7.22.0`, `7.11.6`, `4.6.1`, `6.7.1`, `10.14.1`. Every one equals the installed lockfile version, so there is no patch/minor fix. Also run `cd backend && npm audit fix --omit=dev --package-lock-only --dry-run`. Expected: it changes nothing without `--force`.

- [ ] **Step 3: Apply any fix that turned out to exist**

Do this only if Step 2 printed a newer in-major version. Run `npm update <pkg> --package-lock-only` in that package, then repeat Step 1 into `audit-after-<d>.json`. The count must go down, and no `isSemVerMajor` package may change. If Step 2 matched the snapshot, skip this step and write "skipped: no patch/minor fix exists".

- [ ] **Step 4: Write the outcome** for the PR body. If Step 3 was skipped, use this text as is:

> **Library advisories:** nothing in production is fixable without a major upgrade.
>
> - **backend (8 moderate):** a single `uuid <11.1.1` chain (GHSA-w5hq-g745-h8pq) under firebase-admin 12. The vulnerable `buf` argument isn't used by owlet. The only fix is firebase-admin 12 → 14.5.1, a major upgrade, so it is deferred to a separate change: **later**.
> - **frontend (5 high, 6 moderate):** `@grpc/grpc-js` and `undici` inside the `firebase` SDK. **Note:** both are only used by the SDK's Node build and don't ship in the Vite browser bundle (verified in Task 3 Step 2). No firebase release clears it.
> - **e2e:** 0 production findings.
>
> No lockfile changes in this PR.

(No commit in this task unless Step 3 changed a lockfile. In that case commit `"Update <pkg> to <ver> (patch) for <GHSA>"`.)

---

### Task 3: Full verification, PR, and post-deploy Node check

**Files:**
- Modify: none (verification and integration only)

**Interfaces:**
- Consumes: Task 1's commit and `scripts/check-node-pins.sh`; Task 2's "Library advisories" paragraph and `audit-before-*.json`.

- [ ] **Step 1: Run the whole local suite under the pinned Node.** This mirrors `ci.yml` plus the deploy workflows.

Run:
```bash
scripts/check-node-pins.sh
(cd backend  && npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build)
(cd frontend && npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build)
(cd e2e && npm ci && npx playwright install --with-deps chromium && npm test && npm run test:servers-stopped)
```
Expected: every command exits 0, and Vitest and Playwright report 0 failed. If anything fails, stop and use superpowers:systematic-debugging. Don't mark the task done.

- [ ] **Step 2: Confirm grpc-js and undici are not in the frontend bundle**

Run: `grep -rlE "grpc-js|@grpc|undici" frontend/dist || echo "not in bundle"`
Expected: `not in bundle`. If either matches, the "note" classification in Task 2 is wrong. Stop and tell the human.

- [ ] **Step 3: Record the "after" production audit and compare**

Run the Task 2 Step 1 loop again, writing to `audit-after-$d.json`, then `diff <(jq -S .metadata.vulnerabilities $SCRATCH/audit-before-$d.json) <(jq -S .metadata.vulnerabilities $SCRATCH/audit-after-$d.json)` for each package.
Expected: no diff (8 / 11 / 0). Changing the Node pin doesn't change lockfile findings. If Task 2 Step 3 applied a fix, the counts must be lower and nothing higher.

- [ ] **Step 4: After approval, push, open the PR, merge, then verify the deployed revision.** Ask the human first. The PR body has three parts: the Node pin summary, the Task 2 paragraph, and the before/after audit counts. CI (`ci.yml`) must be green before merging.

Merging to `main` changes `backend/**` and `.github/workflows/backend.yml`, which triggers **Deploy Backend**. It also changes `frontend/package.json` and `frontend.yml`, which triggers the frontend Hosting deploy. Once Deploy Backend succeeds, run:
```bash
REV=$(gcloud run services describe owlet-backend --region asia-northeast1 --project owlet-c659da --format='value(status.latestReadyRevisionName)')
IMG=$(gcloud run revisions describe "$REV" --region asia-northeast1 --project owlet-c659da --format='value(status.imageDigest)')
echo "$REV $IMG"
docker buildx imagetools inspect "$IMG" --format '{{json .Image.Config.Env}}'
```
Expected:
- `$REV` is newer than `owlet-backend-00004-s58`
- its creation time is after the merge
- the env list contains `"NODE_VERSION=24.22.3"`
- `gcloud run services describe … --format='value(status.traffic)'` shows 100% on `$REV`

---

## Self-review notes

- **Coverage:** Every input requirement maps to a task:
  - Node pins (Dockerfile ×2, ci.yml ×3, frontend.yml, backend.yml, Volta ×3): Task 1
  - library re-verification and outcome text: Task 2
  - production audit before/after: Task 2 Step 1 and Task 3 Step 3
  - tests/lint/typecheck/build/e2e: Task 3 Step 1
  - Docker build: Task 1 Step 6
  - post-deploy `NODE_VERSION`: Task 3 Step 4
- **What this plan does not cover:**
  - the firebase-admin 14 migration, which needs its own plan
  - dev-only advisories
  - the local Volta default
  - the other five repos
  - Node patch releases after 24.22.3: the exact pin means the next security release needs another bump, which is the intended trade-off against floating
