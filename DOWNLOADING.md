# Downloading & Installing Voxel⁺

Everything about downloading, system requirements, first launch, Java setup, creating instances, and troubleshooting lives here.

## Releases
Download official builds from the Releases page:
https://github.com/GHisDW/voxelplus/releases

Recommended release assets (examples):
- voxelplus-<version>-setup-win.exe  — Windows installer
- voxelplus-<version>-portable-win.zip — Portable Windows build (no install)
- voxelplus-<version>-mac.zip / voxelplus-<version>-linux.tar.gz — optional cross-platform builds
Pick the installer for a standard experience or the portable zip if you prefer not to install.

## System requirements
- OS: Windows 10 / 11 (64-bit recommended). Other platforms may be supported via community builds.
- Disk: 2+ GB free for a single instance; more for multiple instances/mods.
- CPU/RAM: Minecraft requirements apply; 8GB RAM recommended for modded instances.
- Java: Voxel⁺ manages Java per-instance, but recommended Java majors per Minecraft version:
  - 1.15.x, 1.16.x → Java 8
  - 1.17.x → Java 16
  - 1.18.x → 21 (or 17 where applicable)
  - 1.19.x → 17
  - 1.20.x → 17 / 21
  - 1.21.x → 21
  Voxel⁺ attempts to auto-detect installed JREs/JDKs and will warn if a required runtime is missing.

## First launch (user releases)
1. Download the installer or portable zip from Releases.
2. Installer:
   - Run the installer and follow prompts.
   - After install, launch Voxel⁺ from Start Menu / desktop shortcut.
3. Portable:
   - Extract the zip to a folder.
   - Run the provided executable in the extracted folder.

On first run Voxel⁺ will perform an initial setup which may:
- Download required Gradle/Fabric Loom artifacts for the chosen Minecraft version.
- Validate or locate installed Java runtimes.
This may take several minutes on the first setup.

## Quick start for developers / from source
If you want to run the app from source (development):
```bash
git clone https://github.com/GHisDW/voxelplus.git
cd voxelplus
npm install
npm run app:dev
```
This runs the Electron + frontend in development mode.

## Creating an instance & playing
1. Create → choose a Minecraft version.
2. Voxel⁺ sets up an isolated Loom/Gradle environment for that instance.
3. Add mods via the built-in Modrinth browser and press Run.

## Troubleshooting
- If a run fails with a mismatched Java version: check the instance settings and/or refer to the Java section above.
- If Gradle hangs: clear the instance’s Gradle cache and retry setup.
- Logs: Instance UI exposes live Minecraft + Gradle logs — attach them when opening issues.
- Known Loom change: Loom PR #1600 may alter behavior; if things break after Loom updates, open an issue.

## Getting help
- Discord: DisGamerWorld
- Open an issue: https://github.com/GHisDW/voxelplus/issues

(If a section above needs project-specific screenshots or installer flags, I can tailor it further.)
