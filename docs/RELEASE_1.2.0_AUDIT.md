# Voxel⁺ 1.2.0 — Release Readiness Audit

**Branch:** `cline/q449ek46` (based on `main` @ `52eaa45`, “feat(java): add multi-version Java support and instance launch prompts”)  
**Version:** `1.2.0` (unchanged)  
**Mode:** evidence-driven audit of the existing 1.2.0 implementation; no new features added.

---

## 1. Baseline

| Check | Result |
|---|---|
| Node / npm | Node 22.x, npm 10.x |
| `npm install` (no lockfile in repo — `package-lock.json` is gitignored) | pass, 447 packages |
| `npm test` before changes | 10 files / 122 tests passed, 7 skipped, 0 failed (after the Electron binary was installed; an `ELECTRON_SKIP_BINARY_DOWNLOAD` install fails 5 suites) |
| `npm run build` before changes | pass (tsc for electron + vite build) |

> `npm ci` cannot run in this repository because `package-lock.json` is explicitly gitignored. `npm install` is the supported path. Committing a lockfile is recommended for reproducible CI (not changed here to avoid an unrequested policy change).

---

## 2. Confirmed defects and fixes

### Security

| # | Defect (root cause) | Where | Fix |
|---|---|---|---|
| S1 | `COMMAND="${{ github.event.comment.body }}"` interpolated untrusted comment text into a shell script executed with repo secrets available (`GROQ_API_KEY`, `GH_TOKEN`). A body containing `"`/`$(...)` escapes the quotes. `workflow_dispatch` inputs were interpolated the same way. | `.github/workflows/ai-pr-review.yml` | Values now come from `env:`; PR number must match `^[0-9]{1,10}$`; mode is allow-listed. Shipped as `docs/patches/ai-pr-review-command-injection.patch` (see §7). |
| S2 | Renderer-supplied `filename` was joined into `mods/` without sanitisation → `../../..` path traversal writes/deletes outside the instance. | `electron/backend/modrinth/downloader.ts` | `sanitizeFilename(basename())` + containment re-check + 512 MB cap + partial cleanup. |
| S3 | IPC handlers passed raw renderer values (ids/filenames/paths/urls/versions) straight to filesystem code. | `electron/main.ts` | New `electron/backend/ipc/validate.ts` validates every argument at the IPC boundary. |

### Auto-updater

| # | Defect | Fix |
|---|---|---|
| U1 | Asset selection fell back to *any* `.exe`, so `VoxelPlus-Setup-*.exe` could be installed over the portable launcher. | `selectUpdateAsset` only accepts `portable`/`standalone` names and rejects installer patterns. |
| U2 | Missing SHA-256 silently passed (`fileMatches` returned `true` when the asset had no digest), so unverified code could be staged/installed. | Digest is mandatory for download; staged file is re-hashed + size-checked right before install. |
| U3 | No redirect limit or per-hop host validation; unbounded download size; no timeout; `.partial` files left behind; concurrent clicks could race the same staging file. | Bounded (5) redirects with per-hop validation, 512 MB cap, 30 s idle timeout, single in-flight download promise, `.partial` removed on every failure. |
| U4 | Swap helper deleted the `.old` backup immediately, so a build that failed to start could not be rolled back. | Helper verifies source exists/non-empty, verifies copied size, keeps the backup, and the launcher removes it after one clean start (`UpdateService.cleanupStaleBackup`). |
| U5 | Concurrent installs could start two helper processes. | `installInFlight` guard + target/source identity check. |

### Java

| # | Defect | Fix |
|---|---|---|
| J1 | `installJava` reported success on winget exit 0 and returned `runtimes[0]` when the requested major version was absent → false success + wrong runtime. | Re-scan (3 attempts), execute the candidate with `JavaTester`, require exact major version; otherwise fail with an actionable error. |
| J2 | No duplicate-install guard; `spawn('winget', …, { shell: true })`. | `inFlight` guard, `shell: false`. |
| J3 | Progress indicator was static/fake (10% → 40%, never updated). | Real milestones streamed over `event:javaInstallProgress`. |
| J4 | The “Install Java X” prompt only opened the manager without installing. | `JavaManagerModal.show(…, { installVersion })` auto-starts the requested install. |

### Launch lifecycle

| # | Defect | Fix |
|---|---|---|
| L1 | Launch aborted for missing Java returned without clearing `PREPARING` → instance stuck forever. | `updateStatus('ERROR')` + error log before returning. |
| L2 | Async `spawn` failure reported as success. | Waits for `spawn`/`error`, returns a real failure and persists `ERROR`. |
| L3 | Instance marked `RUNNING` as soon as Gradle started. | Stays `LAUNCHING` until the client is reported; metadata written on promotion. |
| L4 | Child Gradle/Minecraft process survived app quit. | `ProcessManager.shutdownAll()` on `before-quit`. |

### Content / UI robustness

| # | Defect | Fix |
|---|---|---|
| C1 | A stale Cookie Clicker save (missing `producers`/`upgrades`) blanked the whole Arcade page. | Save data is normalised with defaults before render. |
| C2 | Java Manager header wrapped into 4 lines at 1280 px. | `flex-wrap` + `nowrap` label. |

---

## 3. Light-mode overhaul

**Architecture:** extended the existing `:root` / `body.theme-light` token system (no parallel theme engine) with semantic tokens for surfaces (`--bg-elevated`, `--bg-elevated-soft`, `--bg-veil`, `--bg-row`, `--bg-terminal`), overlays (`--scrim`, `--modal-scrim`, `--modal-scrim-strong`), state colours (`--success`, `--warning`, `--danger`, `--info` + soft variants), rarity accents, `--focus-ring`, `--shadow-modal`, plus `color-scheme` per theme.

**Hardcoded colours replaced** in: `styles/splash.css`, `styles/index.css`, `styles/updates.css`, `styles/cards.css`, `components/LogViewer.ts`, `components/CreateInstanceModal.ts`, `components/JavaManagerModal.ts`, `components/InstanceDetails.ts`, `components/InstanceCard.ts`, `components/Sidebar.ts`, `components/NotificationToast.ts`, `pages/PlayerPage.ts`, `pages/ShopPage.ts`, `pages/SettingsPage.ts`, `pages/OnboardingPage.ts`, `pages/ArcadePage.ts`, `games/CookieClickerGame.ts`, `games/StockerGame.ts`. Terminals/canvases keep a dark identity by design.

**Accessibility:** `:focus-visible` ring on interactive elements, disabled-state styling, `::selection`, themed native inputs/selects, scrollbar contrast in light mode, and darkened light-mode text accents for contrast (≈WCAG AA on white).

**Theme service:** single `matchMedia` listener (guarded + `dispose()`), `system` resolved to an explicit class, `body.dataset.theme` + `color-scheme` set for native controls. The Electron window is created with the matching background colour to avoid a dark flash in light mode.

---

## 3b. Release-completion pass (this round)

### Preflight timeout — root cause and fix

The failing test `reports blocking error if memory allocation exceeds system RAM` (1 TB allocation) was not slow because of the memory comparison: `PreflightChecker.runPreflight` calls `JavaDetector.scanSystemJava()` on every invocation, and that scan (a) walked install directories synchronously, (b) then ran a PowerShell registry query with a 5 s timeout, and (c) then spawned one `java -version` process per candidate **sequentially**. On Windows that easily exceeds 5 s, so the vitest default timeout hit the second preflight call in the suite.

Fix (no timeout was raised):

* 30 s result cache plus a single shared in-flight promise, so preflight, launch, the Java Manager and list calls share one scan;
* the registry query starts before the filesystem walk and is skipped entirely off Windows;
* candidate probes run in parallel with a concurrency cap of 4;
* explicit `invalidateCache()` for the Java Manager "Rescan" action and for post-install verification.

Evidence: the packaged-code harness reports `preflight 1TB memory block | 0ms` (see §4), and `tests/java-detector-perf.test.ts` pins the caching and parallel behaviour (3 tests).

### Dependency audit

| Scope | Before | After |
|---|---|---|
| `npm audit --omit=dev` | 1 high (adm-zip <= 0.6.0, 8 advisories) | **0 vulnerabilities** |
| `npm audit` (incl. dev) | 29 (1 critical, 13 high, 15 moderate) | 29 (unchanged), all in the build toolchain |

* `adm-zip` upgraded 0.5.18 to **0.6.1**; the redundant `@types/adm-zip` dev dependency was removed (0.6.x ships its own types). TypeScript compiles clean and every archive test passes on the new version.
* The remaining dev-only advisories are not fixable without major upgrades of `electron` (33 to 45.x) and `electron-builder` (25 to 26.x), both of which require re-validating the whole runtime. They affect the build machine only and are documented rather than force-fixed. **Electron 33.4.11 runtime advisories remain a known risk for 1.2.0.**

### Shell execution removed

* `loomGenerator` (Gradle dependency pre-fetch) no longer uses `shell: true`; it runs `cmd.exe /d /c gradlew.bat dependencies --no-daemon` on Windows with arguments passed as an array, or the wrapper directly on POSIX, and it uses `path.delimiter`.
* `systemScanner` PowerShell probes use `execFile('powershell.exe', [...])`.
* A source-level regression test asserts that no `shell: true`, `exec(`, `execSync(` or `spawnSync(` remains anywhere under `electron/`.

### Archive hardening tests

`tests/archive-security.test.ts` builds hostile archives against the production validators: a traversal entry name patched into the raw ZIP bytes (adm-zip normalises names passed to `addFile`, so the bytes are patched to actually exercise the guard), absolute/UNC/drive-qualified paths, a spoofed `formatId`, unsafe manifest content paths, missing declared content, duplicate-entry behaviour, and a valid control case.

---

## 4. Verification performed

**Automated (this round, after all fixes):**

* `npm test` → **14 files / 164 tests passed, 7 skipped, 0 failed** (adds 24 tests: Java-detector performance, archive/process hardening, lifecycle/updater/Java guards on top of the 21 earlier 1.2.0 tests).
* `npm run build` → pass (`tsc -p electron/tsconfig.json` + `vite build`, exit 0).
* `npx tsc --noEmit -p tsconfig.json` (frontend) and `npx tsc -p electron/tsconfig.json --noEmit` → clean.
* `npm audit --omit=dev` → **0 vulnerabilities**.

**Windows packaging (cross-built here, electron-builder 25.1.8, electron 33.4.11):**

* `npm run dist` → exit 0, produced
  * `dist-portable/VoxelPlus-Portable-1.2.0.exe` — 73,200,262 bytes, sha256 `cd8e64c7d9157e074d29238b52295fe47b9650fa7bf35d31b81c2cc919054522`
  * `dist-portable/VoxelPlus-1.2.0-x64.zip` — 107,400,355 bytes, sha256 `d775615da216d2d055b472f68d1ad88764229cab6c363d149e541dbf35fb3bee`
* The portable artifact is a valid PE32 wrapper (`MZ`/`PE` headers, machine `0x14c`) whose embedded version resource contains the UTF-16 strings `Voxel` and `1.2.0`, i.e. the wrapper carries the Voxel+ name/version/icon.
* `resources/app.asar` (7,430,876 bytes) contains `dist/`, `dist-electron/` (including `backend/ipc/validate.js`), `vpacks/`, `templates/`, `logo.png` and `node_modules/adm-zip@0.6.1`; its `package.json` reports `version 1.2.0`, `main dist-electron/main.js`.
* `npm run dist:nsis` → **failed** (`wine is required`), so no installer was produced; the partial stub was deleted.

**Packaged-payload testing (packaged code, Linux Electron host):**

* The packaged `app.asar` boots as an app: onboarding renders, real IPC/config works (screenshot-verified).
* About page of the packaged app shows **"Version 1.2.0 - Installed"**, and a manual *Check for updates* performs a real GitHub API call and reports *"You are running the latest version (v1.2.0)."*
* Light theme persisted across launches in the packaged app (config-driven), no dark flash.
* Closing the main process terminates all child processes (no orphans).
* Harness running the **compiled modules from the shipped asar** against temp data dirs: 19/19 checks passed — instance creation for Fabric/Quilt/Forge/NeoForge with `build.gradle`/`gradlew.bat`/`settings.gradle`/metadata, duplicate, delete, export → validate → import round trip, hostile traversal archive rejected, `preflight 1TB memory block` returns `BLOCKING_ERROR` in **0 ms**, failed launch reports `success=false` and settles on `ERROR` (not `PREPARING`), updater selects `VoxelPlus-Portable-1.2.0.exe` and parses the real sha256, install guard refuses non-Windows.
* Real-network updater run with the packaged code against the published v1.1.1 asset: downloaded 74,933,782 bytes through GitHub redirects in ~2 s, SHA-256 matched the digest GitHub publishes, a re-request reused the verified file, a tampered digest was rejected with *"Update download failed its SHA-256 integrity check."* and left **no `.partial` files**, install guard refused non-Windows.

**Visual verification:** the built app (stubbed IPC) was screenshot-inspected in light and dark for splash, onboarding, instances, content, player, shop, arcade, logs, settings, create-instance modal, Java Manager, instance details and update prompt.

---

## 5. Not verified here (explicit)

1. **Executing the Windows `.exe`** on Windows (startup, self-extraction of the portable wrapper, SmartScreen behaviour) — this host is Linux.
2. **Real Minecraft/Gradle launch** for Fabric, Quilt, Forge and NeoForge — needs a Windows host with JDK, network and GPU. Loader scaffolding, arguments, Java selection and launch-failure handling are covered by tests and by the packaged harness, but client boot was not observed.
3. **Windows update swap/relaunch** (the detached `cmd` helper replacing `VoxelPlus.exe`). Download/verify/cancel were exercised for real; the swap itself requires Windows.
4. **winget Java installation** (Windows-only).
5. **NSIS installer** (`npm run dist:nsis` needs wine or Windows).
6. **Embedded icon/version resource inside `win-unpacked/VoxelPlus.exe`**: `build.win.signAndEditExecutable` must stay `false` for Linux cross-builds (rcedit needs wine); the portable wrapper does carry the branding. On a Windows build machine it can be enabled to embed the icon in the inner exe as well.

---

## 6. Release artefacts

Configured in `package.json`:

* portable: `VoxelPlus-Portable-${version}.exe` (name required by the updater's `VoxelPlus-Portable-*.exe` preference; verified in the harness against the real name)
* zip: `VoxelPlus-${version}-${arch}.zip`
* NSIS: `VoxelPlus-Setup-${version}.exe` (deliberately **not** auto-installable; not produced in this environment)

Version consistency: `package.json` 1.2.0 → `app.getVersion()` 1.2.0 (verified on the packaged About page) → update check reports v1.2.0.

Staging: `release/` (gitignored) holds the two verified artifacts plus `SHA256SUMS.txt` and `MANIFEST.txt` (sha256 + exact size + filename); `sha256sum -c SHA256SUMS.txt` reports `OK` for both.

GitHub metadata compatibility: the latest published release (v1.1.1) exposes `assets[0].digest = sha256:0ea3...` for `VoxelPlus-Portable-1.1.1.exe`, so GitHub populates the digest field the updater now requires — no extra `.sha256` file is needed. Upload the 1.2.0 portable exe **without renaming it**.

---

## 7. GitHub workflow security status

The command-injection fix is **verified and complete**, and is shipped in this branch as an applicable patch: `docs/patches/ai-pr-review-command-injection.patch` (71 lines). It:

* moves every untrusted value (`github.event.comment.body`, `github.event.issue.number`, `inputs.*`) out of `run:` blocks and into `env:` entries that are only ever read as shell variables;
* rejects non-numeric PR numbers (`^[0-9]{1,10}$`) and non-allow-listed dispatch modes;
* reduces the job token to `contents: read`, `pull-requests: read`, `issues: write` (it reads PR metadata and writes one issue comment).

Verification performed: the patched file parses as valid YAML (parsed with `js-yaml`), the job keeps its 8 steps, and a scan of every `run:` block finds **no** remaining `${{ github.event.comment… }}` / `${{ github.event.issue… }}` / `${{ inputs… }}` interpolation.

Why it is a patch rather than a commit in the branch: any push whose commits touch `.github/workflows/**` is rejected for the credential used in this environment:

```
! [remote rejected] cline/q449ek46 -> cline/q449ek46 (refusing to allow a GitHub App to
  create or update workflow `.github/workflows/ai-pr-review.yml` without `workflows` permission)
```

**Exact remaining step** (run with a token/account that has `workflow` scope):

```bash
git checkout cline/q449ek46
git apply docs/patches/ai-pr-review-command-injection.patch
git commit -am "ci(security): fix review-workflow command injection, least-privilege token"
git push
```

Alternatively paste the patched block into the file in the GitHub web UI. Until then, the workflow on `main` still contains the injection, although the `OWNER/MEMBER/COLLABORATOR` gate limits who can reach it.

