# Changelog

All notable changes to Voxelâº will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added


- Minecraft Skin Manager with persistent local skin library
- Minecraft skin PNG validation for supported formats and dimensions
- Minecraft player skin search and skin downloading
- Interactive 3D skin previews using `skinview3d`
- Active skin selection with persistence across restarts
- Skin library rename and delete functionality
- Click-to-open full 3D skin preview for search results
- Actionable validation and skin management error handling
- Dynamic compatibility resolution system for Minecraft versions
- Centralized Java runtime selection with deterministic preferences
- Automatic environment resolution for different Minecraft eras
- Verified support for Minecraft 1.15.2 through 1.21.4 and 26.1.1 through 26.2
- Minecraft version chooser aligned with verified compatibility profiles
- Integration with existing Fabric Loom and Gradle configurations
- Improved error messages with specific Java version requirements
- Consistent JAVA_HOME propagation across all processes

### Changed

- Refactored compatibility system to be data-driven
- Updated ProcessManager to use centralized resolver
- Enhanced LoomGenerator with improved environment handling
- Improved Java selection logic for better compatibility
- Removed unverified Minecraft versions from the Create Instance version chooser
- Updated documented Minecraft version support to match verified launcher profiles

### Fixed

- Java runtime selection for historical Minecraft versions
- Environment variable propagation to Gradle processes
- Version-specific project generation issues
- Mismatch between the Minecraft version chooser and backend compatibility profiles

## [1.0.0] - 2026-09-03

### Added

- Minecraft Skin Manager with persistent local skin library
- Minecraft skin PNG validation for supported formats and dimensions
- Minecraft player skin search and skin downloading
- Interactive 3D skin previews using `skinview3d`
- Active skin selection with persistence across restarts
- Skin library rename and delete functionality
- Click-to-open full 3D skin preview for search results
- Actionable validation and skin management error handling
- Initial release of Voxelâº
- Electron-based desktop application
- Automatic Java detection and validation
- Instance management system
- Fabric mod integration
- Modrinth integration for mod browsing
- Resource pack and shader support
- Real-time logging system
- Import/export functionality
- System scanner for environment checks
- Configurable settings
- Artwork presets and custom artwork support

## [0.1.0] - Development

### Added

- Minecraft Skin Manager with persistent local skin library
- Minecraft skin PNG validation for supported formats and dimensions
- Minecraft player skin search and skin downloading
- Interactive 3D skin previews using `skinview3d`
- Active skin selection with persistence across restarts
- Skin library rename and delete functionality
- Click-to-open full 3D skin preview for search results
- Actionable validation and skin management error handling
- Project structure and basic architecture
- TypeScript configuration
- Vite build system
- Electron main process setup
- IPC communication layer
- Basic UI framework

