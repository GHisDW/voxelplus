# Downloading & Installing Voxel⁺

Everything about downloading, system requirements, first launch, Java setup, creating instances, and troubleshooting lives here.

## Releases (recommended)
Official builds are published on the Releases page: https://github.com/GHisDW/voxelplus/releases

- If you see a release (for example `v1.0.0`) download the platform asset (installer or portable zip) for your OS and run it.
- If there are no published platform assets yet, you have two easy options below: download the source ZIP (quick, but requires a local build or dev run) or produce a portable build locally with a single command (no installer required).

## Quick download options

Option A — Easiest: download a published release (if available)
1. Open: https://github.com/GHisDW/voxelplus/releases/latest
2. Download the asset that matches your platform (e.g. `voxelplus-1.0.0-portable-win.zip`).
3. Extract and run the executable.

Option B — If no release assets: download the source ZIP and run the app in development mode
1. Download source ZIP: https://github.com/GHisDW/voxelplus/archive/refs/heads/main.zip
2. Extract and open a terminal in the extracted folder.
3. Install Node (>=18 recommended) and npm.
4. Run:
```bash
npm install
npm run app:dev
```
This starts the Electron app in development mode (fast to try, not a packaged installer).

Option C — Produce a quick portable (Windows) without changing the repo
This creates a portable application using npx (uses locally installed tools, no global modifications). This is a simple way to produce a runnable build you can distribute.

Requirements:
- Node.js and npm installed
- Windows 10/11 for the example below (Linux/macOS variations shown after)

Steps (PowerShell):
```powershell
# 1. Clone and install
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run build

# 2. Pack a portable app using electron-packager
# This uses npx so you don't need to modify package.json
npx electron-packager . VoxelPlus --platform=win32 --arch=x64 --out=release --overwrite --prune=true

# 3. Zip the result (optional)
Compress-Archive -Path .\release\VoxelPlus-win32-x64\* -DestinationPath voxelplus-quick-win-x64.zip
```
Result: `voxelplus-quick-win-x64.zip` in the repo folder.

Linux / macOS (example using electron-packager):
```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run build
npx electron-packager . VoxelPlus --platform=linux --arch=x64 --out=release --overwrite --prune=true
# or for mac: --platform=darwin
```

Notes about quick-packaging
- These produced artifacts are "portable" and not signed installers. They are suitable for testing and local use.
- Packaging options can be tuned; for production-grade installers see the "Automating releases" section below.

## System requirements
- OS: Windows 10 / 11 (64-bit recommended). Linux/macOS supported with community builds.
- Disk: 2+ GB free per instance; more for mods/worlds.
- CPU/RAM: Minecraft requirements apply; 8GB RAM recommended for modded instances.
- Java: Voxel⁺ manages Java per-instance, but recommended Java majors per Minecraft version are in the README.

## First launch (packaged release)
1. Run the downloaded installer or extract the portable zip.
2. Launch Voxel⁺.
3. On first run Voxel⁺ will download Gradle/Loom artifacts and validate Java — this may take a few minutes.

## Running from source (developer quick start)
```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```

## Automating releases (recommended for maintainers)
If you'd like Releases to contain ready-to-download installers and zips automatically, add a CI workflow that builds and publishes artifacts on tag push. The simplest approach:

1. Add `electron-builder` or `electron-packager` to devDependencies and configure a `build` section in package.json.
2. Add a GitHub Actions workflow that runs on `push` of tags like `v*`, builds artifacts for target platforms, and uses a release action to publish them.

Example GH Actions flow (high level):
- Trigger: push tag `v*`
- Steps: checkout, setup node, npm ci, npm run build, npx electron-builder (or electron-packager), create GitHub release, upload artifacts.

If you'd like, I can add a starter `.github/workflows/release.yml` that builds for Windows x64 and drafts/releases artifacts automatically — you will need to configure repository secrets (GITHUB_TOKEN is available by default, additional signing keys only if you want signed installers).

## Troubleshooting
- If a run fails with a mismatched Java version: check instance settings inside the app and ensure a compatible JRE is installed.
- If Gradle hangs: clear instance Gradle cache and re-run setup from the instance UI.
- Logs: Instance UI exposes live Minecraft + Gradle logs — attach them to issues.

## Getting help
- Discord: DisGamerWorld
- Open an issue: https://github.com/GHisDW/voxelplus/issues

---

If you'd like, I will:
- add RELEASE_NOTES.md and draft release notes for `v1.0.0`, and/or
- add a GitHub Actions workflow to automatically build & publish release assets on tag creation.

Tell me which and I will commit them.