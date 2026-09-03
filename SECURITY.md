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
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - No arbitrary shell command execution from renderer
  
- **Data Protection**:
  - No storage of sensitive credentials
  - Secure IPC communication
  - Input validation and sanitization
  
- **Dependencies**:
  - Regular dependency updates
  - Security audit of third-party packages
  - No unnecessary dependencies

## Security Features

Voxel⁺ includes several security features:

- **Sandboxed Renderer Process**: The frontend runs in a sandboxed environment
- **Typed IPC Bridge**: All communication between renderer and main process is type-safe
- **No Arbitrary Shell Execution**: Renderer cannot execute arbitrary commands
- **Input Validation**: All user inputs are validated before processing
- **Secure File Operations**: File operations are restricted to designated directories

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
- **Email**: mokshadshetty@gmail.com
- **GitHub**: [@GHisDW](https://github.com/GHisDW)

---

Thank you for helping keep Voxel⁺ secure! 🔒
