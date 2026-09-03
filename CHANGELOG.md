# Changelog

All notable changes to Voxel⁺ will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Dynamic compatibility resolution system for Minecraft versions
- Centralized Java runtime selection with deterministic preferences
- Automatic environment resolution for different Minecraft eras
- Support for Minecraft 1.15.x through 1.21.x
- Integration with existing Fabric Loom and Gradle configurations
- Improved error messages with specific Java version requirements
- Consistent JAVA_HOME propagation across all processes

### Changed
- Refactored compatibility system to be data-driven
- Updated ProcessManager to use centralized resolver
- Enhanced LoomGenerator with improved environment handling
- Improved Java selection logic for better compatibility

### Fixed
- Java runtime selection for historical Minecraft versions
- Environment variable propagation to Gradle processes
- Version-specific project generation issues

## [1.0.0] - 2026-09-03

### Added
- Initial release of Voxel⁺
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
- Project structure and basic architecture
- TypeScript configuration
- Vite build system
- Electron main process setup
- IPC communication layer
- Basic UI framework
