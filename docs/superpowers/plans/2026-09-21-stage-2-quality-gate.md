# Wanderline Stage 2 Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible GitHub Actions quality gate that tests, scans, benchmarks, packages, and records one controlled real-Google smoke run for Wanderline.

**Architecture:** Keep deterministic validation in one automatic workflow and isolate paid, secret-bearing Google validation in a protected manual workflow. Reuse the existing H2 E2E profile, add one profile-scoped Routes test double, and use Node standard-library scripts for the small performance probe and secret preflight.

**Tech Stack:** GitHub Actions, Java 21, Maven Wrapper 3.9.16, Node.js 22.22.1, npm 10.9.9, Spring Boot 4.1, Playwright, Docker Compose, Trivy, Dependabot.

**Spec:** `docs/superpowers/specs/2026-09-21-stage-2-quality-gate-design.md`

## Global Constraints

- Automatic CI runs for pull requests to `main`, pushes to `main`, and tags matching `v*`.
- Automatic CI never reads real Google secrets, never uses the local PostgreSQL database, and never consumes Google quota.
- Real Google validation runs only by `workflow_dispatch` in the protected `google-smoke` environment.
- Java is 21, Maven is 3.9.16, Node is 22.22.1, and npm is 10.9.9.
- Actions use full commit SHAs with release-tag comments; container bases use exact tags plus manifest digests.
- `HIGH` and `CRITICAL` dependency, filesystem, and image vulnerabilities block the gate; do not use `npm audit fix --force` or blanket ignores.
- Performance limits are list/detail P95 ≤ 500 ms, write P95 ≤ 800 ms, route P95 ≤ 1500 ms, with zero unexpected errors.
- Release artifacts contain the full Git SHA, SHA-256 checksums, and CycloneDX SBOMs; no image push or deployment is part of this phase.

## Review Focus

1. Zero, negative, fractional, or non-numeric performance settings must fail before any request is sent; Task 3 pins this with `parsePositiveInteger` tests.
2. A hung endpoint must be aborted at the configured deadline and counted as a failure; Task 3 pins this with an abort-aware fetch stub.
3. HTTP 2xx with invalid JSON or `success: false` must count as failure; Task 3 tests both response classes.
4. The request pool must never exceed its configured concurrency; Task 3 records and asserts peak active work.
5. Missing Google secrets must list only missing variable names and never print present values; Task 4 tests the preflight error text.

---

## File Map

**Create**

- `.nvmrc` — exact local and CI Node version.
- `backend/mvnw`, `backend/mvnw.cmd`, `backend/.mvn/wrapper/maven-wrapper.properties` — Maven 3.9.16 wrapper.
- `backend/src/test/java/com/wanderline/navigation/E2eGoogleRoutesConfiguration.java` — deterministic Routes gateway active only in the `e2e` profile.
- `backend/src/test/java/com/wanderline/navigation/E2eGoogleRoutesConfigurationTest.java` — test-double contract.
- `backend/src/test/resources/application-google-smoke.yml` — isolated H2 data source for real-Google smoke.
- `scripts/performance-smoke.mjs`, `scripts/performance-smoke.test.mjs`, `scripts/run-performance-smoke.sh` — dependency-free benchmark and runner.
- `scripts/require-env.mjs`, `scripts/require-env.test.mjs` — secret-name-only preflight.
- `frontend/playwright.google.config.ts`, `frontend/google-smoke/google-services.spec.ts` — isolated real Google smoke suite.
- `.github/dependabot.yml` — weekly npm, Maven, Docker, and Actions updates.
- `.github/workflows/quality-gate.yml` — automatic deterministic gate.
- `.github/workflows/google-smoke.yml` — manual protected real-service smoke.

**Modify**

- `frontend/package.json`, `frontend/package-lock.json` — toolchain metadata, safe lock refresh, and test commands.
- `frontend/playwright.config.ts` — use Maven Wrapper and compile the E2E test gateway before startup.
- `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` — immutable base references.
- `README.md`, `TEST_ACCEPTANCE.md`, `temp/go-live-readiness.md` — exact commands and observed evidence.

---

### Task 1: Pin the language toolchain and clear the npm audit

**Files:**
- Create: `.nvmrc`
- Create: `backend/mvnw`
- Create: `backend/mvnw.cmd`
- Create: `backend/.mvn/wrapper/maven-wrapper.properties`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes: current `backend/pom.xml` Java 21 target and current npm lock.
- Produces: `./backend/mvnw` backed by Maven 3.9.16; package metadata `engines.node = "22.22.1"` and `packageManager = "npm@10.9.9"`.

- [ ] **Step 1: Record the failing baseline checks**

Run:

```bash
test "$(cat .nvmrc 2>/dev/null)" = "22.22.1"
test -x backend/mvnw
cd frontend
npm audit --audit-level=high
```

Expected: the first two checks fail; audit reports `browserslist`, `brace-expansion`, and `nanoid` as high severity plus two moderate packages.

- [ ] **Step 2: Generate the wrapper and pin npm metadata**

Run from `backend/`:

```bash
mvn org.apache.maven.plugins:maven-wrapper-plugin:3.3.4:wrapper -Dmaven=3.9.16
```

Set `.nvmrc` to exactly `22.22.1`. Update `frontend/package.json` with:

```json
"engines": { "node": "22.22.1" },
"packageManager": "npm@10.9.9"
```

- [ ] **Step 3: Refresh only safe compatible transitive packages**

Run:

```bash
cd frontend
npm update --package-lock-only
npm ci
npm audit --audit-level=high
```

Expected: audit exits 0. The lock resolves at least `baseline-browser-mapping >= 2.11.0`, `brace-expansion >= 5.0.9`, `browserslist >= 4.28.7`, `nanoid >= 3.3.18`, and `postcss >= 8.5.23`. If a parent range prevents one update, add only that package and fixed minimum to `overrides`, then repeat `npm ci` and audit.

- [ ] **Step 4: Verify pinned builds**

Run:

```bash
cd backend
./mvnw -version
./mvnw -B test
cd ../frontend
npm run lint
npm run build
```

Expected: Maven reports 3.9.16; backend tests, lint, and build pass.

- [ ] **Step 5: Commit**

```bash
git add .nvmrc backend/mvnw backend/mvnw.cmd backend/.mvn frontend/package.json frontend/package-lock.json
git commit -m "build: pin project toolchain"
```

---

### Task 2: Make three-pass E2E deterministic at the backend boundary

**Files:**
- Create: `backend/src/test/java/com/wanderline/navigation/E2eGoogleRoutesConfiguration.java`
- Create: `backend/src/test/java/com/wanderline/navigation/E2eGoogleRoutesConfigurationTest.java`
- Modify: `frontend/playwright.config.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: package-private `GoogleRoutesGateway.computeRoutes(NavigationRouteRequest)`.
- Produces: primary `GoogleRoutesGateway e2eGoogleRoutesGateway()` under profile `e2e`; npm command `test:e2e:stability`.

- [ ] **Step 1: Write the failing gateway contract test**

```java
@Test
void returnsADeterministicRouteWithoutAGoogleKey() {
    var gateway = new E2eGoogleRoutesConfiguration().e2eGoogleRoutesGateway();
    var request = new NavigationRouteRequest(
            "origin-place", "destination-place", TravelMode.WALK,
            OffsetDateTime.parse("2027-01-01T09:00:00+08:00"));

    var routes = gateway.computeRoutes(request);

    assertThat(routes).hasSize(1);
    assertThat(routes.getFirst().travelMode()).isEqualTo(TravelMode.WALK);
    assertThat(routes.getFirst().encodedPolyline()).isNotBlank();
}
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `cd backend && ./mvnw -Dtest=E2eGoogleRoutesConfigurationTest test`

Expected: compilation fails because `E2eGoogleRoutesConfiguration` does not exist.

- [ ] **Step 3: Add the profile-scoped minimal gateway**

Create a `@Configuration(proxyBeanMethods = false)` with `@Profile("e2e")`. Its `@Bean @Primary` method returns one `NavigationRouteResponse` using the request travel mode, 1000 meters, 600 seconds, non-empty localized labels, the valid test polyline `_p~iF~ps|U_ulLnnqC_mqNvxq`, one `NavigationStepResponse`, and an empty warning list. Do not change `GoogleRoutesClient` or production profiles.

- [ ] **Step 4: Wire the stability command**

Change the backend web-server command in `frontend/playwright.config.ts` from `mvn` to:

```text
./mvnw -q test-compile spring-boot:run -DskipTests -Dspring-boot.run.profiles=e2e -Dspring-boot.run.useTestClasspath=true -Dspring-boot.run.arguments=--server.port=8082
```

Add to `frontend/package.json`:

```json
"test:e2e:stability": "playwright test --repeat-each=3"
```

- [ ] **Step 5: Verify the fake and three complete runs**

Run:

```bash
cd backend
./mvnw -Dtest=E2eGoogleRoutesConfigurationTest test
cd ../frontend
npm run test:e2e:stability
```

Expected: the Java test passes and Playwright reports 30 passing cases.

- [ ] **Step 6: Commit**

```bash
git add backend/src/test frontend/package.json frontend/playwright.config.ts
git commit -m "test: add deterministic e2e stability run"
```

---

### Task 3: Add the dependency-free performance gate

**Files:**
- Create: `scripts/performance-smoke.mjs`
- Create: `scripts/performance-smoke.test.mjs`
- Create: `scripts/run-performance-smoke.sh`

**Interfaces:**
- Consumes: `GET /api/trip-plans`, `GET /api/trip-plans/{id}`, `POST /api/trip-plans/{id}/daily-routes/{id}/route-points`, `POST /api/routes/compute`.
- Produces: `percentile(samples, p)`, `parsePositiveInteger(name, value)`, `requestJson(url, init, fetchImpl, timeoutMs)`, `runPool(items, concurrency, operation)`, `assertThresholds(report, thresholds)` and JSON at `artifacts/performance/report.json`.

- [ ] **Step 1: Write standard-library unit tests first**

Use `node:test` and `node:assert/strict` to cover these exact expectations:

```javascript
assert.equal(percentile([40, 10, 30, 20], 0.95), 40)
assert.equal(percentile([7], 0.95), 7)
assert.throws(() => parsePositiveInteger('CONCURRENCY', '0'), /positive integer/)
assert.throws(() => parsePositiveInteger('CONCURRENCY', '1.5'), /positive integer/)
assert.throws(() => parsePositiveInteger('CONCURRENCY', 'many'), /positive integer/)
```

Add one abort-aware fetch stub whose promise rejects on `signal.abort`, two 200 stubs returning invalid JSON and `{ success: false }`, a pool test that records peak active callbacks, and a threshold test that expects an error naming the failed operation and P95.

- [ ] **Step 2: Confirm the tests fail**

Run: `node --test scripts/performance-smoke.test.mjs`

Expected: module-not-found for `performance-smoke.mjs`.

- [ ] **Step 3: Implement the exported primitives**

Use only `node:fs/promises`, `node:path`, `node:url`, global `fetch`, `AbortSignal.timeout`, and `performance.now`. `requestJson` returns `{ ok, durationMs, data, error }`; it treats non-2xx, invalid JSON, `success !== true`, null `data`, and timeouts as failures. `runPool` uses a shared next-index counter and exactly `Math.min(concurrency, items.length)` workers. `percentile` sorts a copy and selects index `Math.max(0, Math.ceil(p * length) - 1)`.

- [ ] **Step 4: Implement the benchmark scenario**

Defaults:

```javascript
const defaults = {
  baseUrl: 'http://127.0.0.1:8083',
  concurrency: 4,
  readRequests: 24,
  writeRequests: 8,
  routeRequests: 8,
  durationMs: 0,
  timeoutMs: 5000,
  reportPath: 'artifacts/performance/report.json',
}
```

Create one one-day `Asia/Shanghai` plan, generate its daily route, benchmark list and detail reads, add unique `perf-place-{index}` points, and compute `WALK` routes from `ChIJ4fRwZb25yhQRpHwVijb3LeU` to `ChIJJxwBkr65yhQRrk9EN29vbiM` with a departure one hour in the future. Delete the plan in `finally`. When `WANDERLINE_PERF_DURATION_MS > 0`, continue the same operation mix until the deadline instead of maintaining a second soak implementation.

The report contains `startedAt`, `finishedAt`, `baseUrl`, `concurrency`, and per-operation `requests`, `successes`, `failures`, `requestsPerSecond`, `averageMs`, and `p95Ms`. Exit non-zero when any failure exists or a threshold is exceeded.

- [ ] **Step 5: Add the service runner**

`scripts/run-performance-smoke.sh` must use `set -euo pipefail`, start `./mvnw -q test-compile spring-boot:run` with profile `e2e`, test classpath, and port 8083, wait at most 120 seconds for `/actuator/health`, print the backend log on startup failure, run the Node script, and kill/wait for the backend from an `EXIT` trap.

- [ ] **Step 6: Verify unit and integration behavior**

Run:

```bash
node --test scripts/performance-smoke.test.mjs
chmod +x scripts/run-performance-smoke.sh
scripts/run-performance-smoke.sh
```

Expected: unit tests pass; the script exits 0 and writes a report with all four operation groups and zero failures.

- [ ] **Step 7: Commit**

```bash
git add scripts/performance-smoke.mjs scripts/performance-smoke.test.mjs scripts/run-performance-smoke.sh
git commit -m "test: add performance quality gate"
```

---

### Task 4: Isolate the real Google smoke suite and secret preflight

**Files:**
- Create: `scripts/require-env.mjs`
- Create: `scripts/require-env.test.mjs`
- Create: `backend/src/test/resources/application-google-smoke.yml`
- Create: `frontend/playwright.google.config.ts`
- Create: `frontend/google-smoke/google-services.spec.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: `GOOGLE_MAPS_BROWSER_API_KEY`, `GOOGLE_MAPS_SERVER_API_KEY`, `GOOGLE_MAPS_MAP_ID`.
- Produces: `requireEnvironment(names, env)` and npm command `test:google-smoke`.

- [ ] **Step 1: Write the failing secret preflight test**

```javascript
assert.deepEqual(
  requireEnvironment(['A', 'B'], { A: 'present', B: 'also-present' }),
  { A: 'present', B: 'also-present' },
)
assert.throws(
  () => requireEnvironment(['A', 'B'], { A: 'super-secret', B: '' }),
  (error) => /B/.test(error.message) && !/super-secret/.test(error.message),
)
```

- [ ] **Step 2: Confirm failure, then implement the preflight**

Run: `node --test scripts/require-env.test.mjs`

Expected: module-not-found. Implement `requireEnvironment` by filtering missing or blank names and throwing `Missing required environment variables: ${missing.join(', ')}`. The CLI takes names from `process.argv.slice(2)` and prints only `Required environment variables are configured.` on success.

- [ ] **Step 3: Add the isolated backend profile**

`backend/src/test/resources/application-google-smoke.yml` uses H2 `jdbc:h2:mem:wanderline-google-smoke;MODE=PostgreSQL;DB_CLOSE_DELAY=-1`, username `sa`, `ddl-auto: create-drop`, and `flyway.enabled: false`. It must not activate the `e2e` Routes gateway.

- [ ] **Step 4: Add a secret-safe Playwright config**

Use `testDir: './google-smoke'`, one Chrome worker, list reporter only, `trace: 'off'`, `screenshot: 'off'`, and `video: 'off'`. Start the backend on 8084 with profile `google-smoke`, test classpath, and `GOOGLE_MAPS_SERVER_API_KEY`; start Vite on 5175 with proxy 8084 and the browser key/map ID. Do not embed any key in config source or command strings.

Add this exact command to `frontend/package.json`:

```json
"test:google-smoke": "playwright test --config playwright.google.config.ts"
```

- [ ] **Step 5: Add one real-service test**

The test must:

1. create a one-day plan through `/api/trip-plans` and clean it up in `finally`;
2. open `/`, wait for `.gm-style`, and assert the map rendered;
3. call `google.maps.importLibrary('places')` and `Place.searchByText` for `Sultan Ahmed Mosque Istanbul`, requesting only `id` and `displayName`, and assert a Place ID;
4. POST `/api/routes/compute` using the returned ID, Hagia Sophia Place ID `ChIJJxwBkr65yhQRrk9EN29vbiM`, `WALK`, and a future ISO departure; and
5. assert `success === true` and `data.options.length > 0`.

- [ ] **Step 6: Verify deterministic parts**

Run:

```bash
node --test scripts/require-env.test.mjs
cd frontend
npm run build
```

Expected: the preflight tests and TypeScript build pass. Do not run the real smoke without the three dedicated test secrets.

- [ ] **Step 7: Commit**

```bash
git add scripts/require-env.mjs scripts/require-env.test.mjs backend/src/test/resources frontend/google-smoke frontend/playwright.google.config.ts frontend/package.json
git commit -m "test: add protected Google smoke suite"
```

---

### Task 5: Pin container inputs and enable update discovery

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `frontend/Dockerfile`
- Modify: `docker-compose.yml`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: the Docker build contexts and Compose service names.
- Produces: immutable multi-platform base references and weekly update PR configuration.

- [ ] **Step 1: Prove floating tags are present**

Run: `rg '^(FROM|\s+image:).*[^@]$' backend/Dockerfile frontend/Dockerfile docker-compose.yml`

Expected: all five current bases are reported.

- [ ] **Step 2: Replace them with exact references**

```text
maven:3.9.16-eclipse-temurin-21@sha256:c2a2c58516d160f43b50f12baa427ca86989e0bc942609e04aff61da5d9a7d74
eclipse-temurin:21.0.12_8-jre-jammy@sha256:61d6c7b34d36aee3f45d043101259f97f3c6d428dc2a6f75513789983c5e254f
node:22.22.1-alpine3.22@sha256:9f96f09f127f06feaff1e7faa4a34a3020cf5c1138c988782e59959641facabe
nginx:1.28.3-alpine3.23@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
postgres:17.11-alpine3.24@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
```

- [ ] **Step 3: Add Dependabot**

Configure weekly Monday checks with open PR limit 3 for npm `/frontend`, Maven `/backend`, Docker `/`, `/backend`, `/frontend`, and GitHub Actions `/`. Use `Etc/UTC` and do not auto-merge.

- [ ] **Step 4: Verify Compose and images**

Run:

```bash
docker compose config --quiet
docker compose build backend frontend
```

Expected: configuration and both builds pass using the pinned manifests.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile frontend/Dockerfile docker-compose.yml .github/dependabot.yml
git commit -m "build: pin container supply chain"
```

---

### Task 6: Add the automatic GitHub Actions quality gate

**Files:**
- Create: `.github/workflows/quality-gate.yml`

**Interfaces:**
- Consumes: Tasks 1–5 commands and artifacts.
- Produces: jobs `verify`, `e2e-stability`, `performance`, `security`, and `release-artifacts`.

- [ ] **Step 1: Add the workflow contract check before the file exists**

Run: `test -f .github/workflows/quality-gate.yml`

Expected: failure.

- [ ] **Step 2: Create workflow metadata and least privilege**

Use PR/push/tag triggers from Global Constraints, `permissions: contents: read`, branch-scoped concurrency with cancellation, and explicit job timeouts. Pin actions exactly:

```text
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
actions/setup-java@de7274f081f381c8f8158605e0321c36c376e2e6 # v6.0.1
actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # v0.36.0
github/codeql-action/upload-sarif@1c5b675653bb5c22dbe9b12b556ec555138e09fd # v4
```

- [ ] **Step 3: Implement `verify`, `e2e-stability`, and `performance`**

Every Node job installs Node 22.22.1 then `npm@10.9.9`. `verify` runs `./mvnw -B test`, `npm ci`, lint, build, and `docker compose config --quiet`. `e2e-stability` depends on `verify`, installs Chrome with `npx playwright install --with-deps chrome`, and runs `npm run test:e2e:stability`. `performance` depends on `verify`, runs the Node unit test then `scripts/run-performance-smoke.sh`, and uploads `artifacts/performance/report.json`. Upload Surefire/Playwright/performance diagnostics with `if: always()` and finite retention.

- [ ] **Step 4: Implement `security`**

Run `npm ci` and `npm audit --audit-level=high`, build images tagged `wanderline-backend:${{ github.sha }}` and `wanderline-frontend:${{ github.sha }}`, then scan repository and both images with Trivy for `HIGH,CRITICAL`. Each SARIF-producing scan uses `continue-on-error: true`; upload all three SARIF files, generate CycloneDX SBOM for filesystem and both images, upload them as `security-sbom`, then fail one final shell step if any scan step outcome is `failure`. Give only this job `security-events: write` in addition to `contents: read`.

- [ ] **Step 5: Implement `release-artifacts`**

Depend on all four earlier jobs. Rebuild the JAR and frontend `dist`, download `security-sbom`, name files with `${GITHUB_SHA}`, create `SHA256SUMS` with `sha256sum`, and upload one `wanderline-${{ github.sha }}` artifact. Do not push images, create a release, or deploy.

- [ ] **Step 6: Validate workflow syntax and pinning**

Run:

```bash
ruby -e "require 'yaml'; YAML.parse_file('.github/workflows/quality-gate.yml')"
if rg 'uses: [^@]+@(v|main|master)' .github/workflows/quality-gate.yml; then exit 1; fi
```

Expected: YAML parses and the pin check prints nothing.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/quality-gate.yml
git commit -m "ci: add automatic quality gate"
```

---

### Task 7: Add the protected manual Google workflow

**Files:**
- Create: `.github/workflows/google-smoke.yml`

**Interfaces:**
- Consumes: Task 4 preflight and Playwright command, three environment secrets.
- Produces: manual `google-smoke` job bound to environment `google-smoke`.

- [ ] **Step 1: Add the workflow**

Use only `workflow_dispatch`, `permissions: contents: read`, one concurrency group with `cancel-in-progress: false`, `environment: google-smoke`, and a 15-minute timeout. Pin checkout/setup-java/setup-node to the SHAs in Task 6. Install npm 10.9.9, run `npm ci`, install Chrome, then run:

```bash
node scripts/require-env.mjs GOOGLE_MAPS_BROWSER_API_KEY GOOGLE_MAPS_SERVER_API_KEY GOOGLE_MAPS_MAP_ID
cd frontend
npm run test:google-smoke
```

Inject the three secrets only into the preflight and Playwright steps. Do not enable Playwright trace, screenshot, video, HTML report, or request logging in this workflow.

- [ ] **Step 2: Validate syntax and absence of literal keys**

Run:

```bash
ruby -e "require 'yaml'; YAML.parse_file('.github/workflows/google-smoke.yml')"
rg 'secrets\.(GOOGLE_MAPS_BROWSER_API_KEY|GOOGLE_MAPS_SERVER_API_KEY|GOOGLE_MAPS_MAP_ID)' .github/workflows/google-smoke.yml
if rg 'AIza[0-9A-Za-z_-]+' .github frontend backend scripts; then exit 1; fi
```

Expected: exactly the three secret references are present and no literal Google key is found.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/google-smoke.yml
git commit -m "ci: add protected Google smoke workflow"
```

---

### Task 8: Verify locally, activate GitHub Actions, and record evidence

**Files:**
- Modify: `README.md`
- Modify: `TEST_ACCEPTANCE.md`
- Modify: `temp/go-live-readiness.md`

**Interfaces:**
- Consumes: all commands, reports, workflow run URLs, conclusions, and head SHAs.
- Produces: operator documentation and auditable phase-two acceptance evidence.

- [ ] **Step 1: Run the clean local gate**

Run:

```bash
cd backend
./mvnw -B test
cd ../frontend
npm ci
npm audit --audit-level=high
npm run lint
npm run build
npm run test:e2e:stability
cd ..
node --test scripts/performance-smoke.test.mjs scripts/require-env.test.mjs
scripts/run-performance-smoke.sh
docker compose config --quiet
docker compose build backend frontend
```

Expected: every command passes; E2E has 30 passing cases; the performance report has zero failures and all P95 values below the thresholds.

- [ ] **Step 2: Document commands and truthful current status**

Update README requirements and verification commands to the pinned versions and new scripts. Add a Phase 2 section to `TEST_ACCEPTANCE.md` with exact local counts, audit result, performance values, image references, and the boundary that real Google evidence is pending until the protected workflow runs. Update `temp/go-live-readiness.md` checkboxes only for evidence that actually exists.

- [ ] **Step 3: Commit local acceptance documentation**

```bash
git add README.md TEST_ACCEPTANCE.md
git add -f temp/go-live-readiness.md
git commit -m "docs: record stage two local acceptance"
```

- [ ] **Step 4: Obtain explicit authorization, then push and observe the automatic gate**

After the user authorizes remote mutation, run:

```bash
git push origin main
gh run list --workflow quality-gate.yml --limit 1
gh run watch --exit-status
```

Expected: the run head SHA equals the pushed commit and all five jobs conclude `success`.

- [ ] **Step 5: Configure the protected environment without exposing values**

Create the `google-smoke` GitHub Environment with required reviewer protection. Set `GOOGLE_MAPS_BROWSER_API_KEY`, `GOOGLE_MAPS_SERVER_API_KEY`, and `GOOGLE_MAPS_MAP_ID` through GitHub Settings or interactive `gh secret set NAME --env google-smoke`; never place values in shell history, plan files, logs, or command arguments. If the server key requires fixed-IP restriction, use a self-hosted runner with that egress before running the workflow.

- [ ] **Step 6: Run the real smoke once and capture machine-readable evidence**

```bash
gh workflow run google-smoke.yml --ref main
gh run list --workflow google-smoke.yml --limit 1
gh run watch --exit-status
gh run view --json url,headSha,conclusion,createdAt,updatedAt
```

Expected: conclusion `success`, head SHA equal to current `main`, and one successful Maps render, Places lookup, and Routes response.

- [ ] **Step 7: Finalize the readiness record**

Replace the pending statements in `TEST_ACCEPTANCE.md` and `temp/go-live-readiness.md` with the actual automatic and Google workflow URLs, SHAs, conclusions, audit counts, performance P95 values, and artifact names. Mark Phase 2 complete only if every acceptance item in the spec has evidence.

- [ ] **Step 8: Commit and push the evidence-only update**

```bash
git add TEST_ACCEPTANCE.md
git add -f temp/go-live-readiness.md
git commit -m "docs: record stage two CI evidence"
git push origin main
```

Expected: the documentation-only commit triggers and passes the automatic quality gate. The earlier successful Google smoke remains the one required real-service evidence because application code did not change.

---

## Completion Check

- [ ] `git status --short` is empty.
- [ ] No workflow contains a floating action reference or literal secret.
- [ ] Maven, Node, npm, and five container bases match the fixed versions in this plan.
- [ ] Backend tests, lint/build, 30 E2E cases, performance gate, npm audit, Trivy scans, SBOM generation, and release packaging have successful evidence.
- [ ] The real Google workflow has one successful protected run.
- [ ] Phase 2 documentation contains observed values and URLs rather than claims about checks that were not run.
