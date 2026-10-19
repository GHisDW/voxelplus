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

### Security Best Practices

The Voxel⁺ team follows these security practices:

- **Electron Security**: 
  - `contextIsolation: true` - Renderer process is isolated from Node.js
  - `nodeIntegration: false` - Renderer cannot access Node.js APIs directly
  - `sandbox: true` - Renderer process runs in a sandboxed environment
  - No arbitrary shell command execution from renderer
  - Restrictive Content Security Policy (CSP) to prevent XSS
  - Navigation restrictions to prevent loading untrusted content
  - New window creation blocked except for devtools
  
- **Data Protection**:
  - No storage of sensitive credentials
  - Secure IPC communication with type-safe bridge
  - Input validation and sanitization
  - HTML escaping for all user-controlled content
  - Path validation for file operations
  
- **Dependencies**:
  - Regular dependency updates
  - Security audit of third-party packages
  - No unnecessary dependencies

## Security Features

Voxel⁺ includes several security features:

- **Sandboxed Renderer Process**: The frontend runs in a sandboxed environment with `sandbox: true`
- **Context Isolation**: Renderer and main process are isolated with `contextIsolation: true`
- **No Node Integration**: Renderer cannot access Node.js APIs directly (`nodeIntegration: false`)
- **Typed IPC Bridge**: All communication between renderer and main process is type-safe
- **Restrictive CSP**: Content Security Policy limits script sources to self and prevents unsafe eval
- **Navigation Controls**: External navigation and new window creation are restricted
- **No Arbitrary Shell Execution**: Renderer cannot execute arbitrary commands
- **Input Validation**: All user inputs are validated before processing
- **HTML Escaping**: All user-controlled content is escaped before insertion into DOM
- **Secure File Operations**: File operations are restricted to designated directories with path validation
- **Atomic Imports**: VPack imports use temporary staging to prevent partial installations
- **Price Validation**: VPack purchases use backend-determined prices from manifests, not renderer values

## Responsible Disclosure

We appreciate responsible disclosure and will:

- **Work with you** to understand and resolve the issue
- **Give credit** for the discovery (if desired)
- **Maintain confidentiality** during the fix process
- **Coordinate public disclosure** when appropriate

## Non-Security Issues

For general bugs, feature requests, or non-security issues, please use the normal [issue tracker](https://github.com/GHisDW/voxelplus/issues).

## Contact

For security-related questions:
- **Discord dm**: DisGamerWorld
- **GitHub**: [@GHisDW](https://github.com/GHisDW)
- **Discord Server**: https://discord.gg/msYWkqa4k

---

Thank you for helping keep Voxel⁺ secure! 🔒
