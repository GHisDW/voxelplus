# Voxel⁺ 1.2.0 — Release Notes

**Release date:** 2026-10-31  
**Platform:** Windows x64 (portable + NSIS installer)  
**Upgrade path:** automatic in-place update from 1.1.x portable builds, or manual replacement of `VoxelPlus.exe`

## Highlights

### A complete light mode

Every screen now has a deliberately designed light theme: startup splash, onboarding, sidebar, instance grid, create-instance dialog, instance details, Modrinth content browser, player page, achievements, marketplace, cosmetics, arcade (Cookie Clicker + Stocker), logs, settings, Java Manager, update prompt, dialogs, dropdowns, tooltips, toasts and empty/loading/error states.

* One semantic token set drives both themes, so dark mode is unchanged in character.
* Light mode uses a soft paper-blue canvas, white surfaces, darker state colours and clearer borders — tuned for readable contrast instead of a plain white wash.
* Follows the Windows theme when `theme: system` is selected, and reacts to live OS changes.
* Terminals and game canvases stay dark on purpose; their surrounding chrome follows the theme.

### A trustworthy auto-updater

* Only the **portable** executable is ever installed automatically; installers (`.exe` setup packages) are refused, with a manual-download fallback.
* SHA-256 **and** file size are verified at download *and* again immediately before install. A release without a published digest cannot be auto-installed.
* Redirects are capped and re-validated per hop, downloads are size- and time-limited, and partial files are always cleaned up.
* The swap helper verifies the copy, keeps a `.old` rollback copy until the new build has started once, and never touches instances, config, worlds or the player profile.

### Java you can trust

* Installing a JDK now re-scans for the exact major version, executes it, and only then reports success.
* Real installation progress replaces the previously fixed percentage.
* The “Java X required” prompt installs that version directly.

### Launch lifecycle fixes

* Instances no longer get stuck on “Preparing…” when a required Java runtime is missing.
* Spawn failures are reported as failures instead of a fake “launched successfully”.
* Closing the launcher now stops the Minecraft/Gradle child process tree.

### Security

* All renderer → main IPC arguments are validated (ids, filenames, paths, URLs, Java versions, dialog filters).
* Content downloads can no longer escape the instance folder via `../` filenames.
* GitHub review-automation workflow input handling hardened (see `docs/patches/`).

## Compatibility

| Area | Status |
|---|---|
| Fabric / Quilt / Forge / NeoForge instance scaffolding | Unchanged, covered by automated tests |
| Minecraft version profiles (1.15.2 – 1.21.4, 26.x) | Unchanged |
| Instance import/export (`.voxelplus`, VPack, `.mrpack`, CurseForge) | Unchanged, covered by automated tests |
| Windows portable + NSIS packaging | Configured; see packaging section of the audit |

## Upgrade notes

* Existing instances, worlds, configuration and VP wallet are untouched by the update.
* If you update manually, replace only `VoxelPlus.exe` next to your `portable/` data folder.
* A `.old` file may appear next to the executable after an automatic update; it is deleted automatically on the next clean start.

## Known limitations

* A live Minecraft launch (Fabric/Quilt/Forge/NeoForge) was **not** executed during this release audit — it requires a Windows host with JDK and download access. Loader scaffolding, argument generation and metadata are covered by tests, and the launch code paths were reviewed and hardened, but end-to-end client boot is unverified here.
* Code signing is not configured; Windows SmartScreen may warn on first run of the portable executable.
