# Antigravity OpenClaw - System Architecture

## 1. High-Level Overview

**Antigravity OpenClaw** is a web-based autonomous developer agent studio built specifically to interface directly with the Google Antigravity CLI (`agy`). It gives developers a remote browser control center on an Ubuntu VPS, featuring real-time streaming agent interactions, workspace file explorer, integrated web terminal, cron automation, webhook alerts, full Antigravity configuration, and enterprise-grade security auditing.

```
+-----------------------------------------------------------------------+
|                         Remote Web Browser                           |
|      (OpenClaw Dashboard: Chat, Files, Terminal, Settings, Audit)     |
+-----------------------------------------------------------------------+
                                   ▲
                                   │ HTTP/REST & WebSocket (/ws)
                                   ▼
+-----------------------------------------------------------------------+
|                    Nginx Reverse Proxy & SSL (443)                    |
+-----------------------------------------------------------------------+
                                   ▲
                                   │ Local Socket / Proxy
                                   ▼
+-----------------------------------------------------------------------+
|                  Antigravity OpenClaw Backend Engine                  |
|                                                                       |
|  +-------------------+  +-------------------+  +-------------------+  |
|  |   Auth & RBAC     |  |   Audit Logger    |  |  Workspace Mgr    |  |
|  | (JWT, Rate-Limit) |  | (Tamper-evident)  |  | (Safe Traversal)  |  |
|  +-------------------+  +-------------------+  +-------------------+  |
|  +-------------------+  +-------------------+  +-------------------+  |
|  | Antigravity Runner|  | Terminal Manager  |  | Auto Scheduler    |  |
|  |  (stream-json)    |  |  (Bash PTY/Exec)  |  |  (Cron & Timers)  |  |
|  +-------------------+  +-------------------+  +-------------------+  |
|                                                                       |
|  SQLite Database (WAL Mode): openclaw.db                              |
+-----------------------------------------------------------------------+
                                   ▲
                                   │ Async Subprocess (stdin/stdout NDJSON)
                                   ▼
+-----------------------------------------------------------------------+
|                       Google Antigravity CLI (`agy`)                  |
|                                                                       |
|  * Gemini 4 Argon / 3.8 Flash / Claude Models                         |
|  * Subagents & Tools (run_command, edit_file, write_file)             |
|  * MCP Tool Servers (github-mcp, custom stdio/sse)                    |
|  * Installed Plugins & Skills                                         |
+-----------------------------------------------------------------------+
```

---

## 2. Core Subsystems

### A. Antigravity Runner (`backend/antigravity_runner.py`)
- Spawns `agy` with `--output-format stream-json --dangerously-skip-permissions` (configurable).
- Parses NDJSON lines asynchronously in real time:
  - `init`: extracts conversation ID, mounted tools, and permission modes.
  - `step_update`: parses text deltas, token usage, tool calls, parameters, and output results.
  - `result`: captures final completion status and token statistics.
- Broadcasts deltas to WebSocket clients subscribed to the active `task_id`.
- Manages cancellation and graceful shutdown via POSIX signals (SIGINT, SIGTERM, SIGKILL).

### B. Security & Authentication (`backend/auth.py`)
- **Mandatory Login**: All API endpoints and WebSockets reject unauthenticated access.
- **Initial Setup Wizard**: On first run, user creates an administrator account; subsequent setups are blocked.
- **Password Protection**: Salted Bcrypt or PBKDF2-HMAC-SHA256 (600,000 iterations).
- **Session Tokens**: Cryptographically signed JWT tokens with expiration and instant server-side revocation.
- **Rate-Limiting & Brute Force Defense**: Tracks failed login attempts per client IP. 5 consecutive failures trigger a 15-minute lockout.

### C. Audit Logger (`backend/audit.py`)
- Append-only, structured audit trail stored in SQLite table `audit_logs`.
- Records: `timestamp`, `user_id`, `username`, `ip_address`, `user_agent`, `action`, `resource`, `status`, `details`.
- Comprehensive coverage:
  - `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`, `AUTH_RATE_LIMITED`
  - `AGENT_TASK_START`, `AGENT_TASK_FINISH`, `AGENT_TASK_CANCEL`, `AGENT_TASK_ERROR`
  - `FILE_READ`, `FILE_WRITE`, `FILE_DELETE`
  - `TERMINAL_EXEC`, `TERMINAL_KILL`
  - `SETTINGS_UPDATE`, `MCP_MODIFY`, `PLUGIN_MODIFY`, `RULES_UPDATE`
  - `SCHEDULE_CREATE`, `SCHEDULE_TRIGGER`

### D. Workspace Manager (`backend/workspace_manager.py`)
- Traversal protection: validates all file paths against canonical workspace root using `Path.relative_to()`.
- Supports reading, editing with automated `.bak` backups, deleting, folder creation, and Git repository status monitoring (`git status --porcelain`, `git branch`).

### E. Web Terminal (`backend/terminal_manager.py`)
- Executes shell commands directly on the host VPS.
- Streams stdout and stderr chunks in real time to the browser.
- Supports interactive process termination (`kill`).

### F. Autonomous Scheduler & Webhooks (`backend/scheduler.py` & `backend/webhook_notifier.py`)
- Periodic evaluation loop every 30 seconds.
- Triggers autonomous Antigravity tasks without human intervention.
- Sends instant notifications on completion or errors to:
  - Telegram Bots
  - Discord Webhooks
  - Slack Webhooks
  - Custom HTTP Endpoints

