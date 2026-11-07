# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## 🛡️ Security Architecture & Principles

Antigravity OpenClaw was architected with remote VPS access in mind. Because autonomous agents possess shell and file-editing capabilities, strong defenses are strictly enforced:

1. **Mandatory Login**:
   - Zero anonymous endpoints for operational or administrative actions.
   - Initial setup wizard locks down the first administrator account immediately.
2. **Brute-Force & Rate Limiting**:
   - Consecutive failed authentication attempts trigger automatic IP lockout (15 minutes).
3. **Password Security**:
   - High-iteration PBKDF2 (600,000 rounds) or Bcrypt with unique salts.
4. **Path Traversal Defenses**:
   - All workspace file queries verify that canonical paths remain strictly inside the configured workspace boundary.
5. **Tamper-Evident Audit Logging**:
   - All administrative actions, authentication attempts, file mutations, and shell executions are logged to an append-only SQLite table with client IP, timestamp, and metadata.

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability in Antigravity OpenClaw, please **do not open a public issue**. Instead, follow responsible disclosure:

1. Send an email to the project maintainers with subject `[SECURITY] Vulnerability Report in OpenClaw`.
2. Include detailed steps to reproduce the issue and potential impact.
3. We will acknowledge receipt within 48 hours and work with you on a patch before public disclosure.
