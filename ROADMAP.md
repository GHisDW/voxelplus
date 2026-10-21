# Voxel⁺ 1.1.0 Implementation Roadmap & Architectural Plan

This document details the architecture and step-by-step implementation for delivering all requirements for Voxel⁺ 1.1.0 (PR #26).

---

## 1. Loader Architecture & Runtime Providers

### 1.1 Supported Loaders & Compatibility Matrix

| Loader | Supported MC Versions | Default Loader Version | Build Tool / Plugin | Java Requirement | Launch Mechanism |
|---|---|---|---|---|---|
| **Fabric** | 1.15.2 – 26.3 | 0.16.0 (1.21.x) / 0.19.5 (26.x) | `net.fabricmc.fabric-loom` | Java 8 (1.16-) / 17 (1.17-1.20.4) / 21 (1.20.5-1.21) / 25 (26.x) | Gradle Loom `runClient` or Java launcher |
| **Quilt** | 1.18.2 – 1.21.4 | 0.26.0 | `org.quiltmc.loom` | Same as Fabric (Java 17/21) | Gradle Loom `runClient` |
| **Forge** | 1.16.5 – 1.20.1 | 47.3.0 (1.20.1) / 36.2.39 (1.16.5) | `net.minecraftforge.gradle` | Java 8 (1.16.5) / 17 (1.20.1) | Gradle `runClient` |
| **NeoForge** | 1.20.4 – 1.21.4 | 21.1.72 (1.21.1) / 20.4.237 (1.20.4) | `net.neoforged.moddev` | Java 17 (1.20.4) / 21 (1.21.x) | Gradle `runClient` |

### 1.2 Loader Provider Implementations
- `FabricLoaderProvider`: delegates to `fabricVersions.ts`.
- `QuiltLoaderProvider`: handles Quilt mappings, Quilt loader versioning, and `org.quiltmc.loom`.
- `ForgeLoaderProvider`: configures MinecraftForge repositories, Forge versions, and ForgeGradle.
- `NeoForgeLoaderProvider`: configures NeoForge maven repositories and NeoForged ModDev Gradle plugin.

---

## 2. Universal Modpack Importers & Conversion

### 2.1 Modrinth Importer (`.mrpack`)
- File structure:
  - `modrinth.index.json` (formatVersion: 1)
  - `overrides/` (client files copied directly into instance root)
  - `client-overrides/` (optional client overrides)
- Content resolution:
  - Reads `files` array.
  - Filters by `env.client !== 'unsupported'`.
  - Downloads remote files if not embedded in archive.
  - Verifies hashes (`sha1`, `sha512`) and file length.
  - Extracts overrides securely without path traversal.

### 2.2 CurseForge Importer (`.zip`)
- File structure:
  - `manifest.json` (CurseForge manifest specification)
  - `overrides/`
- Content resolution:
  - Parses `minecraft.version` and `minecraft.modLoaders[0].id` (e.g., `forge-47.3.0`, `fabric-0.16.0`).
  - Identifies project IDs and file IDs.
  - Resolves download URLs via authorized Modrinth/CurseForge mirror endpoints.
  - Applies overrides.

### 2.3 Modpack to VPack Converter (`VPackConverter`)
- Converts `.mrpack` or CurseForge ZIP directly into `.vpack` format:
  - Retains Minecraft version and resolved loader information.
  - Retains manifest metadata (name, summary, author, artwork).
  - Embeds local override files directly into the archive.
  - Keeps remote downloadable mod dependencies as `VPackContentEntry` with `downloadUrl`, `sha1`, and `relativePath`.
  - Resulting `.vpack` is completely portable and installable anywhere.

---

## 3. Preflight & Compatibility System

### 3.1 Preflight Checker (`PreflightChecker`)
Runs before instance creation, modpack import, and game launch:
- **Checks:**
  1. Java runtime availability and major version match.
  2. Memory allocation vs available system RAM.
  3. Disk space on target drive.
  4. Loader and Minecraft version compatibility.
  5. Missing files / unverified downloads.
- **Reporting Levels:**
  - `BLOCKING_ERROR`: Prevents launch (e.g. incompatible Java, missing wrapper).
  - `WARNING`: Suboptimal (e.g. low memory, experimental loader build).
  - `INFO`: Informational (e.g. optimal Java 21 LTS detected).
  - `COMPATIBLE`: All checks passed.

---

## 4. Content & Instance Management

- Safe destination folder routing for `.jar` (mods), `.zip` (resourcepacks / shaders).
- Duplicate instance detection with unique folder suffixing.
- Atomic directory staging during extraction (`.temp-import-*`) with clean rollback on error.
