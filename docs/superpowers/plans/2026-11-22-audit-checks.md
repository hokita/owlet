# Audit Checks (owlet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** owlet's PRs can't ship a known high/critical vulnerability, `main` is scanned nightly (deps, deployed image, Node runtime, Actions pins), and fixes arrive as Dependabot PRs.

**Architecture:** Four PRs in the spec's rollout order. A: the gates branch opens as a draft so Trivy runs in CI and reports what's in the image. B: fix prod findings. C: fix dev findings. D: finish the gates (SHA/digest pins, nightly, dependabot.yml) once B and C are merged, show the gate going red once, then merge. The orchestrator turns on the GitHub settings before B and after D.

**Tech Stack:** GitHub Actions, npm 11 `npm audit`, Trivy `aquasec/trivy:0.76.2` run with `docker run`, `node --test` for the two small scripts, gcloud (already on the runner), Dependabot.

**Spec:** `/Users/hokita/ghq/github.com/hokita/orch/docs/superpowers/specs/2026-11-22-audit-checks-design.md` (§5 layers, §6 grpc-js, §7 owlet row, §8, §9). owlet's survey section is in `/tmp/audit-survey/REPORT.md` under "## owlet" (the `owletRT.md` file named in the brief doesn't exist).

## Global Constraints

- "High+" = high or critical. Gate commands, verbatim: `npm audit --omit=dev --audit-level=high` (PR + nightly, `backend` and `frontend`); `npm audit --audit-level=high` (nightly, `backend`, `frontend`, `e2e`); `trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 <image>`.
- Never silence a gate: no `|| true`, `continue-on-error`, `--ignore-unfixed`, lowered `--audit-level`, or dropped directory. No audit exception file unless the user approves an entry (§6). None is planned.
- Trivy: not `trivy-action`/`setup-trivy`. Use `aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb` (released 2026-11-05, after GHSA-69fq-xp46-6x23, which affected only 0.69.4. Same digest on ghcr.io and Docker Hub on 2026-11-22). Check the digest again when you run Task A1.
- Every `uses:` is pinned to a 40-char SHA with no trailing comment. Resolve SHAs with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha` for the current major tag at execution time.
- Base image `node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5` in all three `FROM` lines (builder, deps, runtime). This replaces the tag-only rule from the 2026-11-14 plan, because the approved spec asks for digest pins.
- The nightly uses `permissions: contents: read, id-token: write` and the existing `WIF_PROVIDER`/`WIF_SERVICE_ACCOUNT` secrets. No new secrets and no new identifiers: reuse `owlet-backend`, `asia-northeast1` and `owlet-c659da`, which are already in `backend.yml`.
- No code comments, no lint/type ignores. Red/green TDD for scripts and for behaviour changes.
- Merging to `main` deploys. PR B deploys the frontend. PR C deploys the frontend and backend. PR D deploys all three, because the Dockerfile and three deploy workflows change. The orchestrator watches each deploy. Workers never merge or comment.
- Excluded: moderate/low (firebase-admin 12 `uuid`), the `npx firebase-tools@15.22.1` deploy steps, Playwright browsers, Hosting and rules, firebase 13, firebase-admin 14, Node 26.

## Findings today (2026-11-22, `npm audit --package-lock-only` on origin/main `dc08696`)

| Dir | Prod high+ | All high+ |
|---|---|---|
| backend | 0 | vitest 1.6.1 (crit GHSA-5xrq-8626-4rwp), tinypool (crit GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr), vite 5.4.21 (high ×8) |
| frontend | 5: firebase 10.14.1 → undici 6.19.7 (21 advisories), @grpc/grpc-js 1.9.16 (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4) | the same 5, plus vitest, tinypool and vite as in backend |
| e2e | 0 | 0 (14 moderate) |

I tried the fixes on scratch copies of the lockfiles. Each gives **0 high+, prod and dev**:
- frontend: `firebase ^12.19.0`, `overrides {"@grpc/grpc-js": "1.14.7"}`, `vite ^6.4.6`, `vitest ^4.1.12`, `@vitejs/plugin-react` stays `^4.7.0`. `npm ls` shows `@grpc/grpc-js@1.14.7 overridden` only.
- backend: `vitest ^4.1.12`, which pulls vite 8.3.8.
- **The spec's "vitest ≥3.2.6" is no longer enough.** GHSA-82fw-gwwq-j7x9 covers vitest `>=2.1.0 <4.1.11` (and 5 betas), and tinypool `<2.1.2` (GHSA-85c8-ppgw-ccpr) is critical. vitest 4.1.12 is outside both (no tinypool) and clears the audit in both dirs, same as corgi and aoharu (checked 2026-11-22, replacing the earlier vitest 5 choice).
- The frontend imports only `firebase/app` and `firebase/auth`, so Firestore and grpc-js are never in the bundle. No test loads grpc-js. PR B says so plainly.
- Still unknown: Trivy's findings on the backend image (Alpine packages, the npm bundled in `node:24.22.3-alpine`). PR A's draft run finds them.
- PR A draft run (2026-11-22, https://github.com/hokita/owlet/actions/runs/44985328559):
  - `Audit prod (frontend)` red (5 high, expected). `Audit prod (backend)` green. Frontend, Backend and E2E green.
  - `Image scan (backend)` red: Alpine 3.24.4 OS layer has 0 findings. All 6 high findings are in the npm bundled in the base image, `usr/local/lib/node_modules/npm/node_modules/`, and all have a fixed version:
    - brace-expansion 5.0.9 → 5.0.10, CVE-2026-102276
    - brace-expansion 5.0.9 → 5.0.11, CVE-2026-102278
    - undici 6.28.0 → 6.29.1, CVE-2026-109383
    - undici 6.28.0 → 6.29.1, CVE-2026-109869
    - undici 6.28.0 → 6.28.1, CVE-2026-19534
    - undici 6.28.0 → 6.29.1, CVE-2026-87018
  - Step 5 (prove Trivy can fail) is not needed: the scan is already red.

## Review Focus

1. **A gate looks green but checked nothing** (wrong `working-directory`, Trivy scanning an image tag that wasn't built, a matrix that skipped a dir). Expected: each job's log names the directory or image it scanned. Task D4's red demo proves the prod audit fails for real. Task A1 Step 5 proves Trivy fails for real.
2. **The image build differs from the deployed one** (PR scan builds `backend/` with another context or stage). Expected: the PR scan uses `docker build backend` with the same Dockerfile `backend.yml` uses. The nightly scans the serving revision's `imageDigest`, not `:latest`.
3. **vitest 4 / firebase 12 changes behaviour silently** (tests that stop running, auth flows that change). Expected: the test count after the change is at least the count before, and e2e sign-in passes. Tasks B1 and C1/C2 record both counts.
4. **Node runtime check compares the wrong things** (`v24.22.3` vs `24.22.3`, string order `24.22.10` < `24.22.9`, a newer *non-security* release, or a newer major). Expected: only a newer v24 release with `security: true` fails. Task D2's tests pin all four.
5. **The pin checker misses a form** (`uses: ./local`, `docker://`, quoted values, aliases, explicit keys, flow style). Expected: it is eagle's PyYAML checker copied from 837d219, local `./` paths pass, a `docker://` without a digest fails, and unsupported syntax fails closed. Its fixtures and tests pin these.

---

## PR A (draft first): gates on branch `chore/audit-checks` (step 1)

### Task A1: PR audit and image jobs in `ci.yml`

**Files:** Modify `.github/workflows/ci.yml`

**Interfaces:** Produces job names (required checks later): `Audit prod (backend)`, `Audit prod (frontend)` (one matrix job `audit-prod`, `name: Audit prod (${{ matrix.dir }})`), and `Image scan (backend)` (job `image-scan`).

- [x] Add `audit-prod`: checkout, setup-node `'24.22.3'`, `npm audit --omit=dev --audit-level=high` with `working-directory: ${{ matrix.dir }}`. No `npm ci`, because npm audit reads the lockfile.
- [x] Add `image-scan`: `docker build -t owlet-backend:ci backend`, then `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock <trivy pinned ref> image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 owlet-backend:ci`.
- [x] Commit, push, and open a **draft** PR against `main` (title "Audit gates (draft)"). The body only lists what the PR adds. No comments.
- [x] Record the results in this plan under "Findings today": `Audit prod (frontend)` is red (expected, the 5 above), `Audit prod (backend)` is green, and `Image scan (backend)` lists each high+ CVE with package, installed version, fixed version and layer (OS or `usr/local/lib/node_modules/npm`). If any finding has no fixed version, stop and report it to the user. Don't plan around it.
- [ ] Step 5: if the image scan is green today, prove that Trivy can fail. On a throwaway commit, set the runtime `FROM` to `node:24.16.0-alpine`. The job must go red. Then drop the commit (`git reset --hard HEAD~1`, force-push the draft branch). Not needed: the first scan was already red (6 HIGH in the bundled npm).

### Task A2: Actions pin check

**Files:** Create `.github/scripts/check_action_pins.py`, `.github/scripts/test_check_action_pins.py`, `.github/scripts/requirements-pins.txt`, `.github/scripts/fixtures/pins/{bad,good}/*`. Modify `.github/workflows/ci.yml`.

**Interfaces:** Copied as is from hokita/eagle 837d219 (PyYAML 6.0.3, hash-pinned, parser-based, fails closed on unsupported syntax). `check_action_pins.py <dir>` exits 0 when every `uses:` in `<dir>/*.yml` is `owner/repo[/path]@<40 hex>`, a local `./…` path, or `docker://…@sha256:<64 hex>`. Otherwise it exits 1 and prints `file:line: <value>`. Job `action-pins`, `name: Action pins`. It runs the Node runtime tests, installs PyYAML with `--require-hashes`, runs the checker's unit tests, then the check.

- [x] Copy the test, fixtures and requirements from eagle → tests FAIL (the checker is missing). Copy the checker → PASS, including the real-workflows test.
- [x] Add the `action-pins` job to `ci.yml` and `audit-nightly.yml`. Commit and push.

## PR B: `fix/audit-prod` from `main` (step 2)

### Task B1: firebase 12 and grpc-js override (frontend)

**Files:** Modify `frontend/package.json`, `frontend/package-lock.json`

- [x] Red: in `frontend/`, `npm audit --omit=dev --audit-level=high` → exit 1 (5 high). Record the baseline: `npm test` count, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- [x] Set `"firebase": "^12.19.0"` and `"overrides": { "@grpc/grpc-js": "1.14.7" }`. Run `npm install` in `frontend/`.
- [x] Green: run the same audit → exit 0. `npm ls @grpc/grpc-js` → only `1.14.7 overridden`. `npm ls undici` → empty.
- [x] Full verification: frontend test (count ≥ baseline), lint, tsc, build, and `prettier --check src`. Backend test, lint and tsc are unchanged. e2e: `cd e2e && npm test && npm run test:servers-stopped`. Then `grep -rl grpc frontend/dist` → no matches (record this).
- [x] If a firebase 12 API change breaks a test or the build, fix the call site test-first. If the cause is something the override doesn't explain, stop and report (spec §9 risk).
- [x] The PR body carries the §6 proof: suites, build, `npm ls` output, the grep result, and "frontend imports only firebase/app and firebase/auth; no test loads grpc-js".

### Task B2 (only if Task A1 found image highs): fix the backend image

**Files:** Modify `backend/Dockerfile`

- [x] Red: the draft PR's `Image scan (backend)` fails, or the same Trivy command run locally after the user approves pulling the Trivy image.
- [x] Fix by cause. For findings in the bundled npm, add a `deps` stage that runs `npm ci --omit=dev`. The runtime stage copies `node_modules` from it and removes `/usr/local/lib/node_modules/npm`, `/usr/local/bin/npm`, `/usr/local/bin/npx` and `corepack`. For Alpine packages with a fix, use a base whose digest carries the fixed package, or `apk upgrade --no-cache <pkg>` in the runtime stage. For findings with no fix, stop and report to the user.
- [x] Green: rebase the draft PR A on this branch. `Image scan (backend)` → green.
- [x] Smoke test: `docker build -t owlet-backend:local backend && docker run --rm -d -p 8080:8080 -e FIREBASE_PROJECT_ID=demo-owlet-e2e owlet-backend:local`, then `curl localhost:8080/health` → `{"ok":true}`. Stop that container (report its id). Backend tests, lint, tsc and build pass. e2e passes.

## PR C: `fix/audit-dev` from `main` (step 2b)

### Task C1: backend vitest 4.1.12

**Files:** Modify `backend/package.json`, `backend/package-lock.json`, and test files only if vitest 4 needs it

- [x] Red: in `backend/`, `npm audit --audit-level=high` → exit 1 (2 crit, 1 high). Record the test count.
- [x] Set `"vitest": "^4.1.12"` and run `npm install`.
- [x] Green: run the same audit → exit 0. `npm test` count = baseline, all pass. Lint, tsc and build pass. If the vitest 2/3/4 migration breaks a test, change the test API usage only. The assertions stay as they are.

### Task C2: frontend vite 6 and vitest 4.1.12

**Files:** Modify `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.ts` only if needed

- [x] Red: in `frontend/` (on top of `main`, or on top of B if it's merged), `npm audit --audit-level=high` → exit 1.
- [x] Set `"vite": "^6.4.6"` and `"vitest": "^4.1.12"`. `@vitejs/plugin-react` stays `^4.7.0` (plugin-react 6 needs vite 8 and fails ERESOLVE). Run `npm install`.
- [x] Green: run the same audit → exit 0 once B is in. Before that, only firebase's prod findings may remain. Tests (count = baseline), lint, tsc, build and `prettier --check src` pass. e2e passes. `e2e/`: `npm audit --audit-level=high` → exit 0 (no change needed today).

## PR D: finish `chore/audit-checks` (step 3), after B and C are merged

- [ ] Rebase on `main`. The draft PR's `Audit prod (*)` and `Image scan (backend)` go green.

### Task D1: SHA and digest pins

**Files:** Modify all four workflows, `backend/Dockerfile`, `scripts/check-node-pins.sh`

- [x] Red: `scripts/check-node-pins.sh` passes today. Pin all three `FROM` lines to the digest in Global Constraints → the script fails (`wrong Dockerfile FROM`).
- [x] Change its `good` regex to `^FROM node:${v}-alpine@sha256:[0-9a-f]{64}( AS [a-z]+)?$`, so it now requires the digest. Change the setup-node count from `5` to the new total (11 after D2: ci.yml 5, audit-nightly.yml 4 including its `Deployed image` job, backend.yml 1, frontend.yml 1). → green.
- [x] Pin every `uses:` to a SHA (checkout, setup-node, setup-java, upload-artifact, google-github-actions/auth v3, docker/setup-buildx-action, docker/build-push-action). `.github/scripts/check_action_pins.py .github/workflows` → exit 0. The `Action pins` job → green.

### Task D2: nightly workflow and Node runtime check

**Files:** Create `.github/workflows/audit-nightly.yml`, `scripts/check-node-runtime.mjs`, `scripts/check-node-runtime.test.mjs`

**Interfaces:** `node scripts/check-node-runtime.mjs <deployed>` reads `https://nodejs.org/dist/index.json` content from stdin. It exits 1 and prints `Node <deployed> is behind security release <newer>; redeploy backend` when a release with the same major, a numerically higher version and `security: true` exists. Otherwise it exits 0. It accepts `v24.22.3` and `24.22.3`.

- [x] Write tests: `passes when deployed is the newest security release`, `fails when a newer same-major security release exists`, `passes when the only newer release has security:false`, `ignores newer majors`, `compares numerically (24.22.10 > 24.22.9)`, `accepts with and without leading v`.
- [x] Run `node --test 'scripts/*.test.mjs'` → FAIL. Implement it. → PASS.
- [x] Write `audit-nightly.yml`: `on: schedule: cron '20 18 * * *'` plus `workflow_dispatch`, and the permissions above. Jobs: `Audit prod (${{ matrix.dir }})` (backend, frontend), `Audit dev (${{ matrix.dir }})` (backend, frontend, e2e, `npm audit --audit-level=high`), `Action pins`, and `Deployed image` (auth exactly as `backend.yml` does). That job then runs `gcloud run services describe owlet-backend --region asia-northeast1 --format='value(status.latestReadyRevisionName)'` → `gcloud run revisions describe … --format='value(status.imageDigest)'` → `gcloud auth configure-docker asia-northeast1-docker.pkg.dev --quiet` → `docker pull <image>@<digest>` → the Trivy command on it → `docker run --rm --entrypoint node <image>@<digest> --version`, piped with `curl -fsSL https://nodejs.org/dist/index.json` into the runtime check.
- [x] Verify: each workflow parses (`node -e` with `e2e/node_modules/yaml`, as in the 2026-11-21 plan). `scripts/check-node-pins.sh` → exit 0. The dispatch run is only possible after merge, because WIF requires `refs/heads/main`.

### Task D3: `dependabot.yml`

**Files:** Create `.github/dependabot.yml`

- [x] `version: 2`. npm `directories: ["/backend", "/frontend", "/e2e"]`, weekly, `open-pull-requests-limit: 0`. docker `directories: ["/backend"]`, weekly, `ignore: [{dependency-name: node, update-types: ["version-update:semver-major"]}]` (user policy 2026-11-22: the node base image gets patch, minor and digest updates within Node 24, because Node security fixes often ship as 24.x minors; major moves such as Node 26 are planned tasks; GitHub Actions majors are not blocked), `groups: docker: patterns: ["*"]`. github-actions `directories: ["/"]`, weekly, `groups: actions: patterns: ["*"]`.
- [x] Verify that the file parses. After merge, the orchestrator checks in step 4 that the Insights → Dependency graph → Dependabot tab shows three ecosystems with no errors.

### Task D4: red once, then ready

- [x] Branch `demo/audit-red` from the gates branch. In `backend/`, run `npm install lodash@4.17.20` (GHSA-35jh-r3h4-6jhm, high). Push it and open a draft PR. `Audit prod (backend)` → red. Record the run URL. Close the PR and delete the branch (`git push origin --delete demo/audit-red`). Never merge it.
- [x] The gates PR is green on every job: Frontend, Backend, E2E, Audit prod ×2, Image scan (backend), Action pins. Mark it ready. The body lists the jobs, the red demo run URL, and the deploys the merge triggers.
- [ ] After merge (orchestrator): `gh workflow run audit-nightly.yml --ref main`, then `gh run watch` → every job green. Watch the three deploys.

## GitHub settings (orchestrator, `gh api`)

| When | Setting | Command | Read back |
|---|---|---|---|
| Step 0, before PR B (today it's off: GET → 404) | Dependabot alerts | `gh api -X PUT repos/hokita/owlet/vulnerability-alerts` | GET → 204, and the alerts page shows the frontend firebase/grpc-js findings |
| Step 4, after D merges and the first nightly is green | Dependabot security updates | `gh api -X PUT repos/hokita/owlet/automated-security-fixes` | GET → `"enabled":true` |
| Step 4 | New ruleset "Protect main" (copied from corgi: deletion, non_fast_forward, pull_request with 0 approvals, no bypass, `~DEFAULT_BRANCH`), plus `required_status_checks` with contexts `Frontend`, `Backend`, `E2E`, `Audit prod (backend)`, `Audit prod (frontend)`, `Image scan (backend)`, `Action pins` | `gh api -X POST repos/hokita/owlet/rulesets --input <json>` | `gh api repos/hokita/owlet/rulesets/<id>`. The next PR shows those checks as "Required" |
| Nothing to change | Secret scanning and push protection | already enabled | `gh api repos/hokita/owlet --jq .security_and_analysis` |

## Outcome

- PR A/D: #13 (`chore/audit-checks`).
- PR B: #14, merged as 21a785e.
- PR C: #16, merged as 4bd3b18.
- Throwaway PRs, both closed and their branches deleted: #15 (image verification, run https://github.com/hokita/owlet/actions/runs/45016753029) and #17 (red demo, run https://github.com/hokita/owlet/actions/runs/45020886852).
