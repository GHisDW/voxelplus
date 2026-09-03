# Downloading & Installing Voxel⁺

Voxel⁺ is a Windows-first, single-player Minecraft helper that sets up isolated Loom/Gradle instances per world. This document explains how to get a working copy today and clearly separates:

1. Downloading a published release (if/when a Release is published)
2. Running from source (developer workflow)
3. Building a packaged copy locally (Windows-first)

Do not follow the developer instructions unless you are comfortable running Node.js/npm commands.

---

## 1) Published releases

Check the Releases page for official packaged builds:

- Releases: [/GHisDW/voxelplus/releases](/GHisDW/voxelplus/releases)

If a release is available, download the asset for Windows and follow the included instructions. Currently there are no official releases published in this repository; if you need an installer and none is available, use one of the options below.

---

## 2) Running from source (Developers)

This is the fastest way to try Voxel⁺ if you have Node.js installed. This runs the app in development mode and is intended for contributors and testers.

Requirements
- Node.js (18+ recommended)
- npm (bundled with Node.js)

Commands
```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```

Notes
- `npm run app:dev` runs the Electron + frontend in development mode using the repo's existing scripts.
- This is not a packaged installer — expect developer console output and a live dev server for the UI.

---

## 3) Building a packaged copy locally (Windows-first)

If you prefer a packaged, distributable folder (portable app) for Windows you can produce one locally. This guide uses `electron-packager` via `npx` so you don't need to permanently add packaging tools to the repo.

1. Build the project (compile TypeScript and frontend assets):
```bash
npm install
npm run build
```

2. Package for Windows (example, Windows x64):
```bash
# from the repo root
npx electron-packager . VoxelPlus --platform=win32 --arch=x64 --out=release --overwrite --prune=true
```

3. The packaged folder will be in `release/VoxelPlus-win32-x64/`. You can zip that folder and distribute the zip — the result is a portable app, not a signed installer.

Important
- The repository does not currently include official installer scripts or signed binaries. The steps above create an unsigned portable app for local testing and distribution.
- Building installers (MSI/NSIS/etc.) requires additional tooling (e.g., `electron-builder`) and configuration which are not present in this repository.
- The project is Windows-first; do not assume Linux/macOS builds are officially supported unless you add platform-specific CI and packaging.

---

## First run notes and troubleshooting

- On first launch Voxel⁺ will download Gradle/Fabric Loom artifacts for the selected Minecraft version and try to auto-detect installed Java runtimes. This may take several minutes.
- If a run fails due to a Java mismatch, open the instance settings in the app and select a compatible JRE/JDK.
- If Gradle hangs, clear the instance Gradle cache from the instance UI and retry setup.
- For runtime issues, attach the instance logs when opening an issue — the app exposes live Minecraft + Gradle logs.

---

## Getting help

- Discord: DisGamerWorld
- Open an issue: [/GHisDW/voxelplus/issues](/GHisDW/voxelplus/issues)

---

If you want, I can:
- add a brief RELEASE_NOTES.md and prepare a draft release entry (no assets) so a Release body exists for future uploads, or
- add a minimal GitHub Actions workflow to build and attach artifacts on tag pushes (you must opt in before I add CI). 

Tell me if you want RELEASE_NOTES.md committed and whether to draft a release (no assets) for now.