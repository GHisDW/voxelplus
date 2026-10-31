# Changelog

All notable changes to Voxel⁺ will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-29

### Added

* Minecraft Skin Manager with persistent local skin library
* Minecraft skin PNG validation for supported formats and dimensions
* Minecraft player skin search and skin downloading
* Interactive 3D skin previews using `skinview3d`
* Active skin selection with persistence across restarts
* Skin library rename and delete functionality
* Click-to-open full 3D skin preview for search results
* Actionable validation and skin management error handling
* Dynamic compatibility resolution system for Minecraft versions
* Centralized Java runtime selection with deterministic preferences
* Automatic environment resolution for different Minecraft eras
* Verified support for Minecraft 1.15.2 through 1.21.4 and 26.1.1 through 26.3
* Minecraft version chooser aligned with verified compatibility profiles
* Integration with existing Fabric Loom and Gradle configurations
* Improved error messages with specific Java version requirements
* Consistent `JAVA_HOME` propagation across all processes
* Discord-style startup splash with a blurred-grayscale to full-colour logo reveal and rotating funny splash texts (skipped on first-time setup)

### Added — Updates & Performance

* Automatic update check against the latest GitHub Release on every start (deferred until after the first paint), plus a manual **Settings → About → Check for updates** action
* In-app update prompt with release notes, download progress, `Later` for optional releases and a non-dismissible flow for mandatory releases
* Forced-update policy: `[mandatory]` / `[FORCE UPDATE]` / `<!-- voxelplus:mandatory -->` markers, an explicit `[min:x.y.z]` minimum version, or a major version bump
* SHA-256 (plus size) verification of downloaded release assets, restricted to HTTPS GitHub hosts
* Portable staged install: a detached helper waits for the launcher to exit, backs up the old `VoxelPlus.exe`, swaps in the new one and relaunches — user data is never touched
* Shared `escapeHtml` utility and self-hosted Outfit/JetBrains Mono fonts

### Performance

* Splash screen is mounted before the first IPC round-trip, and the boot flag lets warm launches skip straight to it
* Single settings read at startup (`ThemeService` no longer issues a second IPC call)
* Process-status listener and update check moved off the critical path (`requestIdleCallback`)
* Instance list status updates are coalesced (200 ms) instead of re-listing/re-rendering on every Gradle/JVM event
* Window is created hidden and shown on `ready-to-show` to eliminate the blank-frame flash
* Vite targets Chromium 130 with esbuild minification, no module-preload polyfill and no source maps
* Portable builds package only runtime assets (`dist`, `dist-electron`, `vpacks`, `templates`, `logo.png`), dropping TypeScript sources, tests and unused Electron locales (smaller, faster to unpack)
* `npm run dist` now emits both the single-file portable `.exe` and a pre-extracted `VoxelPlus-<version>-x64.zip`; the zip launches instantly because it is not re-unpacked on every start. Portable is the default target; the NSIS installer is opt-in via `npm run dist:nsis`

### Changed

* Refactored compatibility system to be data-driven
* Updated `ProcessManager` to use the centralized resolver
* Enhanced `LoomGenerator` with improved environment handling
* Improved Java selection logic for better compatibility
* Removed unverified Minecraft versions from the Create Instance version chooser
* Updated documented Minecraft version support to match verified launcher profiles

### Fixed

* Java runtime selection for historical Minecraft versions
* Environment variable propagation to Gradle processes
* Version-specific project generation issues
* Mismatch between the Minecraft version chooser and backend compatibility profiles
* Missing `loom.runs.client.runDir '.'` configuration in 26.x non-obfuscated build.gradle generation, which caused client data to be stored in the root loom output rather than instance root
* Stale derived fields (`instancePath`, `modCount`, `resourcePackCount`, `shaderCount`) erroneously saved into `voxel-instance.json` on disk
* Asynchronous race condition and missing lifecycle cleanup in `InstancesPage` during live status updates
* Gradle harmless stderr diagnostics (progress lines, task announcements) being incorrectly logged at `WARN` severity instead of `INFO`
* UTF-8 character encoding and mojibake corruption across UI templates (InstanceDetails, window title, CSS headers)
* Heuristic target folder override in `ContentImporter` when explicit resourcepack/shader targets were provided
* Target instance path verification in `InstanceManager.getInstanceDir` preventing phantom paths from being returned

### Fixed — Deep Audit Pass

* `InstanceDetails` overview/mods tabs threw `ReferenceError: loaderName is not defined` (the loader label lived only in `render()`), crashing the instance details view
* `VPackManager.validateVPack` treated a wrong `formatId`, wrong `formatVersion`, missing `packId`, unsafe content paths and missing declared content as warnings, so malformed/spoofed packs validated as importable (5 regression tests were failing)
* `VPackConverter.convertCurseForgeToVPack` reported success and wrote an archive whose every mod was a non-downloadable placeholder; it now refuses the conversion with an actionable `CurseForge file reference` error
* Pages were never disposed on navigation: the arcade save interval, the log-viewer IPC subscription and the Modrinth search debounce kept running against detached DOM, causing background saves and leaked listeners
* "Export File" in the log viewer ignored the chosen path and only copied text to the clipboard; a new `logs:writeToFile` IPC now writes the log to disk
* `ProcessManager.stopInstance` could hang forever or throw an unhandled `spawn` error when `taskkill` was unavailable/blocked; it now resolves on process exit, falls back to `SIGTERM`/`SIGKILL`, and never leaves the UI on `STOPPING`
* Instance launch hard-coded `gradlew.bat`, `cmd.exe`, `java.exe` and the `;` PATH separator; it is now platform-aware (POSIX `gradlew` + `path.delimiter`)
* Startup failures left a blank window with a stuck splash overlay; `init()` now renders a recoverable error screen
* Production CSP no longer allows inline scripts (`'unsafe-inline'`), adds `object-src 'none'`, `base-uri 'self'`, `form-action 'none'` and `frame-ancestors 'none'`; the one inline `onerror` handler was replaced with a CSP-safe listener
* Unescaped instance names in the log-viewer and Modrinth target selectors could inject markup; all views now share `utils/html.ts#escapeHtml`
* Arcade payloads from the renderer were trusted verbatim; `NaN`/`Infinity`/negative scores and cookie counters could permanently corrupt saves and the VP ledger. Inputs are now clamped, cookie lifetimes are monotonic, and unknown upgrade keys are dropped
* `duplicateInstance` returned metadata pointing at the source folder and could produce an empty folder name; `importInstance` could resolve its target to the instances root for names that sanitize to nothing
* `tests/real-mods.test.ts` failed in a clean checkout because `.test-mods-real/` is gitignored fixture data; it now skips those cases explicitly (and its broken `ConfigStore` cleanup call was fixed)
* Google Fonts were loaded over the network, which the production CSP blocked and offline installs could not reach, so the UI never used Outfit/JetBrains Mono; both variable fonts are now bundled (SIL OFL 1.1, licences included) and served from the app

### Verified Runtime Testing (1.18.2, 1.21.1, 26.1.2)

* **Minecraft 1.18.2 (Historical LTS Generation)**:
  * **Java Environment**: Resolved to Java 21 (Eclipse Temurin 21.0.11), meeting minimum Java 17 requirement.
  * **Mod Compatibility**: Verified with Fabric API 0.77.0+1.18.2, Sodium 0.4.1+build.15, and Xaero's Minimap 26.5.0.
  * **Filesystem & Loom Isolation**: `build.gradle` generated with `loom { runs { client { runDir '.' } } }`. Real files verified at instance root: `options.txt`, `saves/`, `config/`, `logs/`, `xaero/`.
  * **Play & World Launch**: Successfully initialized LWJGL 3.3.2-snapshot, OpenAL audio, sound engine, and resource reload.
* **Minecraft 1.21.1 (Standard LTS Generation)**:
  * **Java Environment**: Resolved to Java 21 (Eclipse Temurin 21.0.11), meeting Java 21 requirement.
  * **Mod Compatibility & Diagnostics**: Tested with Fabric API 0.116.17+1.21.1 and Xaero's Minimap 26.5.0. Diagnosed Sodium 0.8.13 mixin conflict (`getColorIndex` `@Overwrite` required on `BakedQuadMixin`) as a known upstream mod incompatibility on vanilla Fabric 0.16.10; cleanly resolved and verified by using compatible Sodium 0.6.13+mc1.21.1.
  * **Filesystem & Singleplayer World Launch**: `build.gradle` generated with `runDir '.'`. Verified singleplayer world (`saves/New World`) loading and instance root asset/config population.
  * **Play Launch**: Fully initialized LWJGL 3.3.3-snapshot, texture atlases, OpenAL audio, and Xaero's Minimap stage 2/2.
* **Minecraft 26.1.2 (New-Era Non-Obfuscated Generation)**:
  * **Java Environment**: Automatically resolved to Java 25 (Microsoft OpenJDK 25.0.4) using Java 24+ new-era requirements.
  * **Loom & Gradle**: Verified Gradle 9.4.0 + Loom 1.16.3 + Fabric Loader 0.19.5 with `runDir '.'`.
  * **Mod Compatibility**: Verified with Fabric API 0.155.3+26.1.2, Sodium 0.9.2-beta.1+mc26.1.2, and Xaero's Minimap 26.5.0.
  * **Play Launch**: OpenGL 3.3.0 initialized via NVIDIA GeForce RTX 5050 Laptop GPU, texture atlases baked, sound engine started, options saved directly to instance root (`options.txt`).

### Fixed — Release Hardening (verified for the 1.2.0 build)

**Security**

* `.github/workflows/ai-pr-review.yml` interpolated `github.event.comment.body` (and the `workflow_dispatch` inputs) directly into a `run:` block, so a crafted `/voxel-review` comment could break out of the quotes and execute arbitrary commands with repository secrets. Untrusted values are now passed through `env:` and validated (digits-only PR number, mode allow-list). *Applied as `docs/patches/ai-pr-review-command-injection.patch` because the automation token lacks `workflow` scope — see that file.*
* Every renderer → main IPC handler now validates its arguments (`electron/backend/ipc/validate.ts`): instance ids cannot contain path separators, content filenames must be a single path segment, import/export paths must be absolute, Java versions are restricted to 8/17/21/25, downloads must be HTTPS from Modrinth/GitHub hosts, dialog filters are sanitised and string lengths are capped.
* `DownloadManager.downloadToInstance` joined a renderer-supplied filename straight into `mods/`, allowing `../../` traversal outside the instance folder (and wrote arbitrary paths); it now sanitises the name, re-checks containment, enforces a 512 MB cap and removes partial files.

**Auto-updater**

* Asset selection could pick `VoxelPlus-Setup-*.exe` (an NSIS installer) as the "portable replacement" and copy an installer over the running launcher. Only a `portable`/`standalone` `.exe` is accepted now; a release that ships installers only falls back to the manual download path.
* SHA-256 verification is now mandatory: a release without a published digest cannot be auto-installed (previously the check silently passed), and the staged file is re-hashed and size-checked immediately before installation.
* Downloads follow at most 5 redirects (each hop re-validated against the GitHub host allow-list), enforce a 512 MB cap, time out after 30 s of inactivity, serialise concurrent requests and always delete `.partial` files on failure.
* The Windows swap helper no longer deletes the `.old` backup after a successful swap — it verifies the copied file size, keeps the rollback copy until the new build has started once, and refuses to run when the downloaded file is missing or empty.

**Java**

* `JavaInstaller` reported success whenever `winget` exited 0, even if no runtime of the requested major version existed (it could return an unrelated version). It now re-scans, executes the detected `java.exe` through `JavaTester`, and fails with an actionable error when the requested version is not present or not runnable.
* Concurrent installs are blocked, `winget` is spawned without a shell, and Java install progress is streamed to the UI over a new `event:javaInstallProgress` channel (the modal previously showed fixed fake 10 %/40 % values).
* The "Java Version Required → Install Java" prompt now actually installs the required version instead of only opening the Java Manager.

**Launch lifecycle**

* A launch aborted because no compatible Java runtime was found returned without clearing `PREPARING`, leaving the instance and its Play/Stop buttons stuck forever.
* `spawn()` failures were reported as a successful launch (the async `error` event arrived after the return). Launches now await the spawn result and surface a real failure.
* Instances were marked `RUNNING` as soon as Gradle started; they now stay `LAUNCHING` until the client is actually reported, and metadata is persisted accordingly.
* Quitting the launcher left the Minecraft/Gradle child process running; `ProcessManager.shutdownAll()` now terminates the process tree on `before-quit`.

**Light mode**

* Added semantic theme tokens (`--bg-elevated`, `--bg-elevated-soft`, `--bg-terminal`, `--scrim`, `--success/--warning/--danger/--info`, `--rarity-*`, `--focus-ring`, `--shadow-modal`, …) with a full `body.theme-light` override set, native `color-scheme`, focus-visible rings and disabled states.
* Replaced hardcoded dark surfaces and light text in the splash, log viewer, create-instance modal, player page, shop, arcade cookie clicker, Stocker overlay, Java manager, instance details, sidebar and settings.
* Darkened state/rarity accents in light mode for readable contrast (≈WCAG AA), and kept terminal/canvas areas intentionally dark on a light chrome.
* `ThemeService` registers its OS `prefers-color-scheme` listener exactly once (repeated initialisation no longer stacks listeners) and resolves `system` into an explicit `theme-dark`/`theme-light` class.
* The window is created with a background colour that matches the saved theme, so light-mode launches no longer flash a dark frame.
* A stale Cookie Clicker save (missing `producers`/`upgrades`) no longer blanks the arcade page.

## [1.0.0] - 2026-09-03

### Added

* Initial release of Voxel⁺
* Electron-based desktop application
* Automatic Java detection and validation
* Instance management system
* Fabric mod integration
* Modrinth integration for mod browsing
* Resource pack and shader support
* Real-time logging system
* Import/export functionality
* System scanner for environment checks
* Configurable settings
* Artwork presets and custom artwork support
* Minecraft Skin Manager with persistent local skin library
* Minecraft skin PNG validation for supported formats and dimensions
* Minecraft player skin search and skin downloading
* Interactive 3D skin previews using `skinview3d`
* Active skin selection with persistence across restarts
* Skin library rename and delete functionality
* Click-to-open full 3D skin preview for search results
* Actionable validation and skin management error handling

## [0.1.0] - Development

### Added

* Project structure and basic architecture
* TypeScript configuration
* Vite build system
* Electron main process setup
* IPC communication layer
* Basic UI framework
* Minecraft Skin Manager with persistent local skin library
* Minecraft skin PNG validation for supported formats and dimensions
* Minecraft player skin search and skin downloading
* Interactive 3D skin previews using `skinview3d`
* Active skin selection with persistence across restarts
* Skin library rename and delete functionality
* Click-to-open full 3D skin preview for search results
* Actionable validation and skin management error handling
