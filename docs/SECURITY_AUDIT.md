# Security Architecture & Audit Logging

Security is a primary pillar of **Antigravity OpenClaw**. Because the agent has root/developer capabilities on your VPS (reading files, writing code, executing bash commands), robust defense-in-depth protections are enforced across every endpoint.

---

## 🛡️ Multi-Layer Security Architecture

### 1. Mandatory Authentication on All Surface Areas
- Every REST endpoint (under `/api/...`) and WebSocket connection (`/ws`) requires cryptographic authentication.
- Unauthenticated requests are rejected immediately with HTTP 401 Unauthorized.
- No public anonymous endpoints exist except `/api/auth/login` and `/api/health`.

### 2. First-Run Master Setup Wizard
- OpenClaw does not ship with hardcoded default passwords.
- On the very first launch, the server detects that the `users` table is empty and allows the creation of the master administrator account.
- Once created, all subsequent initial setup requests are permanently blocked.

### 3. Password Hashing Standards
- Passwords are never stored in plaintext.
- Supported algorithms:
  - **Bcrypt**: Salted with work factor 12.
  - **PBKDF2-HMAC-SHA256**: 600,000 rounds with cryptographically secure random per-user salt (NIST SP 800-63B compliant).

### 4. Cryptographic JWT Session Tokens & Revocation
- Authentication produces an HS256-signed JSON Web Token with a configurable expiration (default 24 hours).
- **Server-Side Session Store**: Tokens are tracked in the database (`user_sessions`).
- **Instant Revocation**: Clicking "Logout" instantly marks the token revoked in SQLite; revoked tokens are immediately rejected by all endpoints.

### 5. Brute-Force Rate Limiting & Lockout
- Tracks failed login attempts per client IP address.
- 5 consecutive failed attempts trigger an automatic 15-minute lockout for that IP.
- Reset occurs upon successful authentication or lockout expiration.

### 6. Canonical Workspace Boundary Enforcement
- All file queries (`/api/workspace/files`, `/api/workspace/file`, download/upload) resolve paths using `Path.resolve()` and verify that the target starts with the canonical workspace root using `Path.relative_to()`.
- Attempts to use directory traversal (`../..`, symlink attacks) trigger an immediate HTTP 403 Forbidden and generate a security alert in the audit log.

---

## 📋 Tamper-Evident Audit Trail

Every sensitive action performed on OpenClaw is recorded in an append-only SQLite audit log (`audit_logs` table):

### Logged Event Types (`AuditAction`)
- `AUTH_LOGIN_SUCCESS`: Successful authentication.
- `AUTH_LOGIN_FAILED`: Failed login attempt (with IP and username).
- `AUTH_LOGOUT`: Session revocation.
- `AGENT_TASK_START`: Task initiated with prompt parameters and model.
- `AGENT_TASK_CANCEL`: Task aborted by user.
- `FILE_READ` / `FILE_WRITE` / `FILE_DELETE`: File modifications and downloads.
- `TERMINAL_EXEC`: Interactive bash command executed in web terminal.
- `SETTINGS_UPDATE`: MCP server changes, plugin installs, or rule edits.
- `SCHEDULE_CREATE` / `SCHEDULE_DELETE`: Automation changes.
- `USAGE_VIEW`: Quota inspection.

### Inspecting and Exporting Audit Logs
1. Open the left sidebar and select **`📋 Security Audit`**.
2. Filter logs by action type, username, or IP address.
3. Export audit logs for compliance or external SIEM analysis:
   - Click **Export CSV** for spreadsheet analysis.
   - Click **Export JSON** for programmatic ingestion.

