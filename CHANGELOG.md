# Changelog

All notable changes to Voxel⁺ will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
* Verified support for Minecraft 1.15.2 through 1.21.4 and 26.1.1 through 26.2
* Minecraft version chooser aligned with verified compatibility profiles
* Integration with existing Fabric Loom and Gradle configurations
* Improved error messages with specific Java version requirements
* Consistent `JAVA_HOME` propagation across all processes

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
