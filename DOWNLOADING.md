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

Voxel⁺ ships as a **portable Windows x64 executable** only. The NSIS installer is kept as an optional legacy target.

### Portable `.exe` (default, the only shipped target)

```bash
npm install
npm run dist
```

This produces two unsigned, portable artifacts in `dist-portable/`:

| Artifact | Startup | Use it when |
|---|---|---|
| `VoxelPlus-Portable-<version>.exe` | Unpacks the bundled app to `%TEMP%` on every launch (single-file convenience) | You want one file to move around |
| `VoxelPlus-<version>-x64.zip` | **Instant** — extract once, then double-click `VoxelPlus.exe` | You want the fastest possible startup |

The single-file portable is an NSIS wrapper: it has to decompress the Electron runtime each time it is launched, which is inherent to the format. The zip contains the already-extracted portable folder, so subsequent launches only pay a normal Electron start. There is no installer and no setup wizard either way.

- User data (instances, worlds, settings, VPacks, player profile) lives in a `portable/` folder next to `VoxelPlus.exe`, so moving or updating the app never moves the data.
- Both artifacts are produced by the same `npm run dist` run.

### Optional: NSIS installer (Windows)

```bash
npm install
npm run dist:nsis
```

This produces `dist-installer/VoxelPlus-Setup-<version>.exe` for anyone who explicitly wants an installer.

**Important notes**
- Both commands compile TypeScript and build the Vite frontend before packaging.
- Builds are unsigned. Windows Defender or SmartScreen may warn on first launch of unsigned executables.
- The packaged app contains only `dist/`, `dist-electron/`, `vpacks/`, `templates/` and `logo.png` (no TypeScript sources or tests), which keeps the portable bundle smaller and faster to unpack.
- The project is Windows-first. Linux/macOS builds are not officially supported unless you add platform-specific CI and packaging configuration.
- Do not use `electron-packager` — the repository uses `electron-builder` for all packaging.

---

## Automatic updates

On every start (about 1.5 seconds after the UI is ready) the launcher asks the
GitHub Releases API for the latest published release and compares it with the
running version.

- **Optional updates** show a dismissible prompt with release notes, a download
  progress bar and a *Later* button.
- **Mandatory (forced) updates** are used only when a release is marked
  `[mandatory]` / `[FORCE UPDATE]` / `<!-- voxelplus:mandatory -->`, when its
  notes declare a `[min:1.2.0]` minimum version above the running build, or when
  the release bumps the major version. The prompt cannot be dismissed, but you
  can still quit or open the release page if a download fails.
- Downloads come only from `github.com` / GitHub's release CDN over HTTPS and
  are verified against the release asset's size and SHA-256 digest.
- Installing replaces **only** `VoxelPlus.exe` (a `.old` backup is kept during
  the swap). The `portable/` data folder, `instances/`, saved worlds, settings,
  VPacks and the player profile are never read, moved or deleted by an update.

You can also trigger a check manually from **Settings → About → Check for updates**.

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
