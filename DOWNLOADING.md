# Downloading & Installing Voxel⁺

Voxel⁺ is a Windows-first, single-player Minecraft launcher that sets up isolated instances for Fabric, Quilt, Forge, and NeoForge. This document explains how to get a working copy today and clearly separates:

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

**Requirements**
- Node.js 18+ (recommended: LTS)
- npm (bundled with Node.js)

**Commands**
```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```

**Notes**
- `npm run app:dev` compiles the Electron TypeScript backend first, then starts the Vite dev server and Electron together using `concurrently`.
- Electron loads the frontend from the Vite dev server (`http://localhost:5173`) during development.
- This is not a packaged installer — expect developer console output and a live dev server for the UI.
- The `dev` script (`npm run dev`) only starts Vite and **does not** launch Electron. Use `app:dev` to run the full application.

---

## 3) Building a packaged copy locally (Windows-first)

The repository uses **electron-builder** to produce a Windows installer and a Windows portable executable.

### Portable `.exe` (no installer)

```bash
npm install
npm run dist:portable
```

The packaged `.exe` will be placed in `dist-portable/`. This produces an unsigned, portable Windows x64 executable — no installer, no setup wizard. Portable user data is stored in a `portable/` folder next to the executable when the portable runtime exposes its executable directory.

### NSIS installer (Windows)

```bash
npm install
npm run dist
```

This produces `dist-installer/VoxelPlus-Setup-1.1.1.exe`, a standard Windows NSIS installer.

**Important notes**
- Both commands compile TypeScript and build the Vite frontend before packaging.
- Builds are unsigned. Windows Defender or SmartScreen may warn on first launch of unsigned executables.
- The project is Windows-first. Linux/macOS builds are not officially supported unless you add platform-specific CI and packaging configuration.
- Do not use `electron-packager` — the repository uses `electron-builder` for all packaging.

---

## First run notes and troubleshooting

- On first launch Voxel⁺ will download the Gradle and selected loader artifacts for the chosen Minecraft version and try to auto-detect installed Java runtimes. This may take several minutes.
- If a run fails due to a Java mismatch, open the instance settings in the app and select a compatible JRE/JDK.
- If Gradle hangs, clear the instance Gradle cache from the instance UI and retry setup.
- For runtime issues, attach the instance logs when opening an issue — the app exposes live Minecraft + Gradle logs.

## Importing and converting modpacks

You can import a Modrinth `.mrpack` directly from **Instances → Import VPack / Modpack**. Voxel⁺ reads the pack manifest, preserves client-side files and overrides, and stages the instance atomically.

To create a reusable `.vpack` file instead:

1. Open **Instances** and choose **Convert Modpack to VPack**.
2. Select the `.mrpack` (or a supported CurseForge modpack ZIP).
3. Choose an output filename ending in `.vpack`.
4. Import the resulting file with **Import VPack / Modpack**.

The converter keeps authorized remote download references in the VPack manifest. It does not bypass CurseForge restrictions; a pack with unresolved required CurseForge files must be downloaded through an authorized source before it can be converted successfully.

Loader instance creation is version-aware. The create dialog filters Minecraft versions to those supported by the selected loader, and the backend rejects unsupported combinations with a clear error instead of writing incomplete metadata.

---

## Getting help

- Discord: DisGamerWorld
- Open an issue: [/GHisDW/voxelplus/issues](/GHisDW/voxelplus/issues)

---
