# Security Policy

## Supported Versions

Currently, only the latest version of Voxel⁺ is supported with security updates.

| Version | Supported |
| ------- | ---------- |
| Latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in Voxel⁺, please report it responsibly.

### How to Report

**Do not** open a public issue for security vulnerabilities.

Instead, please:

1. **Discord the security team**: DisGamerWorld
2. **Include "Security Vulnerability"** in the subject line
3. **Provide details** about the vulnerability:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

### What to Expect

- **Acknowledgment** within 48 hours
- **Initial assessment** within 7 days
- **Regular updates** on the remediation progress
- **Coordinated disclosure** when a fix is ready

## Architecture & Security Model

Voxel⁺ is an Electron-based launcher designed for local Minecraft mod development using Fabric Loom and Gradle.

### Enforced Protections (Implemented)

- **Electron Security Boundary**:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - Preload script (`preload.ts`) exposes a controlled, typed IPC API via `contextBridge` (`window.voxelApi`).
  - The renderer process cannot require arbitrary Node.js native modules or access the underlying filesystem directly.

- **IPC Input Validation & Error Handling**:
  - Username inputs are validated using strict alphanumeric regex rules (`/^[a-zA-Z0-9_]{3,16}$/`) before persistence.
  - Skin imports perform PNG magic-number and dimension checks (`64x32` or `64x64`) before acceptance.
  - IPC handler exceptions are intercepted, categorized (`VoxelErrorPayload`), and sanitized before being serialized across the IPC boundary.

- **Controlled Process Execution**:
  - Minecraft client processes are spawned directly via the local Gradle wrapper (`gradlew.bat` / `gradlew`) within designated instance directories.
  - Program arguments and JVM environment variables are sanitized and constructed server-side in the main process.

### Executable Code Scope & Limitations

- **Minecraft Mods and Runtime Integration**:
  - Executable Java mods and Fabric Loom code run inside the JVM with standard user process permissions.
  - Minecraft mods are **not sandboxed** by Voxel⁺ or the Java runtime. Users should only install mods from trusted sources (such as Modrinth).

---

Thank you for helping keep Voxel⁺ secure! 🔒
