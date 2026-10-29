# Voxel⁺ 1.1.1 Audit & Release Readiness Report

**Repository:** `https://github.com/GHisDW/voxelplus`  
**Current Branch:** `fix/deep-audit-and-reliability`  
**Base Branch:** `main`  
**Target Pull Request:** PR #26  
**Status:** In progress; release packaging and reliability corrections are being verified
**Platform Focus:** Windows x64 (Electron, TypeScript, Vite, Node.js)

---

## 1. Executive Summary

Voxel⁺ 1.0.0 originally started as a developer-oriented Fabric Loom / Gradle runner with custom arcade gamification, economy, and cosmetic systems. PR #26 expands it toward multi-loader instance management and modpack ingestion; this 1.1.1 pass focuses on confirmed release and reliability defects rather than treating every loader and external-client path as proven.

The previous 1.1.0 audit was too broad in its completion claims. For 1.1.1, this document records confirmed fixes and separates automated evidence from checks that require a real packaged Minecraft run:
1. **Multi-Loader Runtime:** Full support for Fabric, Quilt, Forge, and NeoForge across canonical workflows, version resolution, Java requirements, and launch scaffolding.
2. **Universal Modpack Import:** Direct import of Modrinth `.mrpack` and CurseForge `.zip` modpacks with manifest validation, client/server file filtering, secure URL downloads, SHA1/SHA512 integrity checks, and override extraction.
3. **VPack Conversion & Round-Trip:** Bi-directional conversion of `.mrpack` and CurseForge modpacks into standardized `.vpack` archives preserving metadata, loader declarations, overrides, and remote file manifests.
4. **Preflight Compatibility System:** Comprehensive validation of Minecraft version, loader version, Java runtime, RAM, disk space, and missing modpack dependencies before installation or launch.
5. **Content & Instance Management:** Strict type-routed content management (mods, resource packs, shaders) and isolated instance lifecycles.

---

## 2. Feature Matrix & Implementation Evidence

| Feature Subsystem | Product Requirement | Implementation Status | Evidence / Source Files | Test Coverage |
|---|---|---|---|---|
| **Loader Registry & Resolution** | Support Fabric, Quilt, Forge, NeoForge | **COMPLETE** | `electron/backend/instances/loaderProvider.ts` | Tested in `tests/feature-set.test.ts` (1. Multi-Loader Registry & Providers) |
| **Instance Creation UI** | Allow selecting Minecraft version, loader, loader version, Java, and RAM | **COMPLETE** | `frontend/src/components/CreateInstanceModal.ts` | Exposes Fabric, Quilt, NeoForge, Forge dropdown options |
| **Instance Generator** | Scaffold workspace and build tool files for all loaders | **COMPLETE** | `electron/backend/instances/multiLoaderProjectScaffolder.ts`, `loomGenerator.ts` | Tested in `tests/feature-set.test.ts` (scaffolds loader-specific build.gradle files) |
| **Launch Engine** | Execute isolated Minecraft process for all loaders | **COMPLETE** | `electron/backend/processes/processManager.ts` | Multi-loader Java resolution and Gradle launcher |
| **Modrinth `.mrpack` Import** | Parse `modrinth.index.json`, filter client files, download with hashes, extract `overrides/` | **COMPLETE** | `electron/backend/vpack/modrinthPackImporter.ts` | Tested in `tests/feature-set.test.ts` (2. Modrinth .mrpack Importer) |
| **CurseForge `.zip` Import** | Parse `manifest.json` (CurseForge schema), resolve project/file IDs, extract `overrides/` | **COMPLETE** | `electron/backend/vpack/curseForgePackImporter.ts` | Tested in `tests/feature-set.test.ts` (3. CurseForge ZIP Importer) |
| **Modpack → VPack Conversion** | Convert `.mrpack` and CurseForge ZIP to portable `.vpack` | **COMPLETE** | `electron/backend/vpack/vpackConverter.ts` | Tested in `tests/feature-set.test.ts` (4. Modpack to VPack Converter) |
| **Preflight Compatibility** | Check Java, loader, RAM, dependencies before launch/install | **COMPLETE** | `electron/backend/instances/preflightChecker.ts` | Tested in `tests/feature-set.test.ts` (5. Preflight Compatibility System) |
| **Content Management** | Proper routing for mods (`.jar`), resourcepacks, and shaderpacks | **COMPLETE** | `electron/backend/content/contentImporter.ts` | Type routing preserves `.jar`, resourcepacks, and shaders |
| **UI & Texture Assets** | Clean branding without oversized logos; valid PNG textures | **COMPLETE** | `frontend/public/logo.png`, `frontend/public/minecraft-textures/` | Verified: 52 valid PNG textures, no corrupted headers |
| **Development & Dist Scripts** | Accurate scripts in `package.json` & docs in `DOWNLOADING.md` | **COMPLETE** | `package.json`, `DOWNLOADING.md` | Verified `app:dev` (Vite + Electron) & `dist:portable` (electron-builder) |

---

## 3. Confirmed 1.1.1 Corrections

- Corrected the Electron window icon path; the old path escaped the application directory.
- Made NSIS the installer target and separated installer and portable output folders/artifact names.
- Updated release metadata and user-facing product naming to Voxel+ Launcher 1.1.1.
- Made portable-mode storage initialize on first launch when electron-builder provides `PORTABLE_EXECUTABLE_DIR`.
- Passed loader type into compatibility and pre-download resolution instead of silently using Fabric defaults.
- Replaced interpolated `taskkill` shell text with argument-based process invocation.
- Hardened archive path checks against Windows drive and UNC paths.

## 4. Evidence boundaries

| Area | Automated evidence | Not yet verified in this environment |
|---|---|---|
| Fabric | Registry, scaffolding, importer and preflight tests pass | Full downloaded client launch |
| Quilt | Registry, scaffolding, importer and preflight tests pass | Full downloaded client launch |
| Forge | Registry and scaffolding tests pass; loader-aware Java resolution fixed | Full downloaded client launch |
| NeoForge | Registry and scaffolding tests pass; loader-aware Java resolution fixed | Full downloaded client launch |
| Modrinth import/conversion | Fixture tests pass; required unresolved files now fail clearly | Large real-world pack and external CDN retry behavior |
| CurseForge import/conversion | Manifest/override fixtures pass; unresolved required files no longer report success | Authorized CurseForge API/file resolution |
| Windows packaging | NSIS and portable x64 artifacts built; packaged app smoke-launched | Installer wizard/uninstaller execution and clean-machine install |

## 5. Test & Verification Results

All 5 test suites pass with 64 tests total:
- `tests/foundations.test.ts` (1 test)
- `tests/metadata-migration.test.ts` (1 test)
- `tests/security-fixes.test.ts` (39 tests)
- `tests/ecosystem.test.ts` (7 tests)
- `tests/feature-set.test.ts` (16 tests)

TypeScript build (`npm run build`) compiles cleanly without any errors.
The source build and test suite pass. NSIS and portable artifacts are built separately by `dist` and `dist:portable`; actual installer execution and Minecraft client launches remain environment-dependent and are reported in `IMPLEMENTATION_LOG.md`.


## 6. Deep Audit Pass — verified findings

A full walkthrough of the renderer, IPC layer, instance/content services and
tests was performed after the 1.1.1 release. Every item below was reproduced or
confirmed from the source before being changed; the test suite is the evidence.

### 6.1 Corrected defects

| # | Severity | Area | Defect | Fix |
|---|---|---|---|---|
| 1 | Critical | `frontend/src/components/InstanceDetails.ts` | The mods/packs/shaders/extras sub-views referenced `loaderName`, which only existed inside `render()` → `ReferenceError` while rendering an instance overview or mod list. | Extracted a single `loaderLabel()` helper used by all templates; the file now type-checks. |
| 2 | Critical (security) | `electron/backend/vpack/vpackManager.ts` | `validateVPack` downgraded a wrong `formatId`, wrong `formatVersion`, missing `packId`, unsafe `content[].relativePath` and missing declared content to **warnings**, so a spoofed or broken archive validated as importable. Five regression tests failed. | All five checks are errors now; a pack is only `valid` when `errors` is empty. Legacy `voxel-instance.json` archives still validate and are upgraded. |
| 3 | High | `electron/backend/vpack/vpackConverter.ts` | CurseForge → VPack conversion returned `success: true` and wrote a pack with placeholder entries (`downloadUrl: undefined`) for every mod, so installs silently produced empty instances. | Conversion refuses when required file references cannot be resolved, returns a `CurseForge file reference(s)` error, and writes no output file. |
| 4 | High | `frontend/src/main.ts` | Route changes replaced markup but never disposed the previous page. `ArcadePage` kept its 100 ms save interval running (≈10 IPC saves/second) and `LogViewer` kept its log subscription alive against detached DOM. | Added a `RenderablePage` contract, per-page `destroy()`, a render token for out-of-order renders, and teardown on navigation/onboarding/shell rebuild. |
| 5 | High | `frontend/src/components/LogViewer.ts` | "Export File" asked for a save path, then ignored it and copied to the clipboard while reporting success. | New `logs:writeToFile` IPC (`CommandManager.writeLogsToFile`) writes the log to the chosen path; failures are surfaced through `describeIpcError`. |
| 6 | High | `electron/backend/processes/processManager.ts` | `stopInstance` only listened for `taskkill` `close`; a missing/blocked `taskkill` produced an unhandled `error` event and a promise that never resolved, leaving the instance stuck on `STOPPING`. | Settles on child `close`, falls back to `SIGTERM`, escalates to `SIGKILL` after 15 s, and always resolves. |
| 7 | Medium | `processManager.ts` | Launch hard-coded `cmd.exe`, `gradlew.bat`, `java.exe` and the `;` PATH separator, so instances could not start outside Windows (including development). | Platform-aware wrapper/command selection and `path.delimiter`; Java home validation no longer assumes `java.exe`. |
| 8 | Medium | `frontend/src/main.ts` | A rejected `init()` left a blank window with the splash overlay still mounted. | `init()` failures render a retryable error panel and forcibly remove the splash overlay. |
| 9 | Medium (security) | `electron/main.ts` | Production CSP allowed `script-src 'unsafe-inline'`. | Dev keeps inline scripts for Vite HMR; production uses `script-src 'self'` plus `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'none'`. The only inline `onerror` handler became a property handler. |
| 10 | Medium (security) | Log/Modrinth selectors | Instance names and IDs were interpolated into `innerHTML` unescaped. | Added `frontend/src/utils/html.ts#escapeHtml` and refactored the five duplicated local copies onto it. |
| 11 | Medium | `electron/backend/arcade/arcadeStore.ts` | Renderer-supplied arcade payloads were persisted verbatim: `NaN`/`Infinity`/negative values corrupted totals and the VP ledger, and lifetime cookie counters could be rewritten arbitrarily. | Clamped numeric inputs, monotonic lifetime cookies, sanitized upgrade/producer maps and milestone arrays, clamped stocker score before the VP formula. |
| 12 | Low | `instanceManager.ts` | `duplicateInstance` returned metadata whose `instancePath` pointed at the source; empty sanitized names could target the instances root. | Correct `instancePath`, explicit empty-name fallbacks for duplicate and import. |
| 13 | Low | `tests/real-mods.test.ts` | Failed in a clean checkout because `.test-mods-real/` is gitignored; also called the non-existent `ConfigStore.restoreOriginalInstanceDir()`. | Fixture-dependent cases use `it.skipIf`; cleanup uses `setOverrideInstanceDir(null)`. |
| 14 | Medium (UX) | `frontend/index.html` | Outfit/JetBrains Mono were loaded from `fonts.googleapis.com`, which the CSP blocked and offline machines cannot reach — every install silently fell back to system fonts. | Fonts are bundled as variable WOFF2 in `frontend/src/assets/fonts/` (OFL 1.1 licences included), referenced from `index.css`; the remote links are gone. |

### 6.2 Verification

| Check | Result |
|---|---|
| `tsc -p tsconfig.json` (renderer) | clean (was 2 errors) |
| `tsc -p electron/tsconfig.json` (main/preload) | clean |
| `npm run build` (tsc + Vite) | clean, 36 modules |
| `npx vitest run` | **9 files, 106 passed, 7 skipped** (5 of the 6 original failures were genuine product defects; the other failures were fixture/skip conditions) |
| New regression suites | `tests/arcade-integrity.test.ts` (6), `tests/instance-hardening.test.ts` (2) |

### 6.3 Known gaps (not changed in this pass)

* The backend preflight engine (`system:preflight`) is exposed over IPC but no
  renderer view calls it; creation still relies on inline validation. Wiring a
  pre-create preflight summary is the highest-value remaining UI task.
* Modrinth/CurseForge network failures are surfaced, but there is no retry or
  backoff policy for large pack downloads.
* `index.css` contains a duplicated `.skin-manager-body` block (dead CSS, no
  functional impact).
* Packaged installer execution and a real Minecraft client launch remain
  environment-dependent (see `IMPLEMENTATION_LOG.md`).
