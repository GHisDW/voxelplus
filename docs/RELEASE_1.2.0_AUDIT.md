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
| `npm test` before changes | 10 files passed / 0 failed, 122 tests passed, 7 skipped (after the Electron binary was installed; a `ELECTRON_SKIP_BINARY_DOWNLOAD` install fails 5 suites) |
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

## 4. Verification performed

* `npm test` → **11 files / 143 tests passed, 7 skipped, 0 failed** (includes 21 new 1.2.0 regression tests).
* `npm run build` → pass (`tsc -p electron/tsconfig.json` + `vite build`).
* `npx tsc --noEmit -p tsconfig.json` (frontend) → clean.
* **Real screenshot verification:** the built app was launched under Electron 33 on Xvfb with a stubbed IPC bridge, and screenshots were captured and visually inspected for: splash, onboarding, instances, content, player, shop, arcade, logs, settings, create-instance modal, Java Manager, instance details and update prompt — in **both** light and dark themes.
* macOS/Linux packaging not attempted (Windows-only product); Windows packaging not run in this Linux sandbox.

---

## 5. Not verified here (explicit)

1. **Real Minecraft/Gradle launch** for Fabric, Quilt, Forge and NeoForge — needs a Windows host with JDK, network and Gradle distribution. Loader scaffolding/arguments are test-covered, the launch path was hardened, but client boot was not observed.
2. **Windows packaging output** (`electron-builder --win`), portable self-extraction and NSIS install/uninstall.
3. **Auto-update end-to-end** against a real GitHub release (asset download + swap + relaunch on Windows). The pure policy, digest and script logic are unit-tested; the network/swap path is not executed here.
4. **winget Java installation** (Windows-only).
5. **Embedded Windows icon/metadata**: `build.win.signAndEditExecutable` is `false`, which skips rcedit (icon + version metadata embedding). Recommend enabling it for the release build on Windows if rcedit is available; otherwise the `.exe` uses the default Electron icon.

---

## 6. Release artefacts

Configured in `package.json`:

* portable: `VoxelPlus-Portable-${version}.exe` (name required by the updater’s `^VoxelPlus-Portable-.*\.exe$` preference)
* zip: `VoxelPlus-${version}-${arch}.zip`
* NSIS: `VoxelPlus-Setup-${version}.exe` (deliberately **not** auto-installable)

Version consistency: `package.json` 1.2.0 → `app.getVersion()` 1.2.0 → update prompt/About show 1.2.0.

---

## 7. Outstanding action outside this branch

`.github/workflows/ai-pr-review.yml` could not be modified from this environment: pushing a workflow change is rejected because the GitHub App token used here has no `workflow` scope:

```
refusing to allow a GitHub App to create or update workflow `.github/workflows/ai-pr-review.yml` without `workflows` permission
```

The verified fix is stored at `docs/patches/ai-pr-review-command-injection.patch`. Apply with:

```bash
git apply docs/patches/ai-pr-review-command-injection.patch
```

and push from an account/token with `workflow` permission (or paste the change in the GitHub web UI). Until that patch lands on `main`, the review workflow remains exploitable by anyone who can comment on a PR **and** is matched by the `OWNER/MEMBER/COLLABORATOR` gate — the gate limits exposure to trusted commenters, but the injection itself is real.
