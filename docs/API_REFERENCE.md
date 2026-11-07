# Antigravity OpenClaw - API Reference

All requests must include an authentication cookie `openclaw_session` or an HTTP header:
```http
Authorization: Bearer <jwt_token>
```

---

## 1. Authentication Endpoints

### `GET /api/auth/status`
Checks if administrator setup is required and whether the current session is authenticated.
- **Response**:
  ```json
  {
    "setup_required": false,
    "authenticated": true,
    "user": { "id": "1", "username": "admin", "role": "admin" }
  }
  ```

### `POST /api/auth/initial-setup`
Initializes master admin credentials. Only available when no users exist.
- **Payload**:
  ```json
  { "username": "admin", "password": "SuperSecretPassword123" }
  ```

### `POST /api/auth/login`
Authenticates user and returns JWT access token.
- **Payload**:
  ```json
  { "username": "admin", "password": "SuperSecretPassword123" }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOi...",
    "user": { "id": 1, "username": "admin", "role": "admin" }
  }
  ```

### `POST /api/auth/logout`
Revokes active session token and clears cookie.

---

## 2. Agent Execution Endpoints

### `POST /api/agent/prompt`
Dispatches a new task to Antigravity CLI.
- **Payload**:
  ```json
  {
    "prompt": "Inspect codebase and fix unit tests",
    "conversation_id": "optional-uuid-to-continue",
    "model": "gemini-3.8-flash-high",
    "effort": "medium",
    "mode": "auto",
    "auto_approve": true,
    "sandbox": false
  }
  ```
- **Response**:
  ```json
  { "task_id": "4b63ff3a-...", "status": "RUNNING", "conversation_id": "..." }
  ```

### `POST /api/agent/cancel`
Terminates a running agent process.
- **Payload**:
  ```json
  { "task_id": "4b63ff3a-..." }
  ```

### `GET /api/agent/conversations`
Retrieves list of past conversations and titles.

### `GET /api/agent/conversations/:id`
Retrieves full message turn history for a conversation.

---

## 3. Workspace Endpoints

### `GET /api/workspace/files?path=<rel_path>`
Lists files and folders inside requested path.

### `GET /api/workspace/file?path=<rel_path>`
Reads file content (text mode, up to 5MB).

### `POST /api/workspace/file`
Writes or creates a file (with automatic `.bak` backup).
- **Payload**:
  ```json
  { "path": "src/main.py", "content": "print('hello')" }
  ```

### `DELETE /api/workspace/file`
Deletes file or folder inside workspace.

### `GET /api/workspace/git`
Queries current Git branch and uncommitted modifications.

---

## 4. Web Terminal Endpoints

### `POST /api/terminal/execute`
Executes bash command on VPS.
- **Payload**:
  ```json
  { "command": "git pull origin main" }
  ```
- **Response**:
  ```json
  { "command_id": "uuid-...", "status": "RUNNING" }
  ```

### `POST /api/terminal/kill`
Terminates running terminal process.

---

## 5. Antigravity Configuration Endpoints

- `GET /api/settings/models`: Available models.
- `GET /api/settings/agents`: Available subagents.
- `GET /api/settings/mcp`: Active MCP servers.
- `POST /api/settings/mcp`: Add, remove, enable, disable MCP servers.
- `GET /api/settings/plugins`: Installed plugins and statuses.
- `POST /api/settings/plugins`: Enable, disable, install plugins.
- `GET /api/settings/rules` & `POST /api/settings/rules`: Manage `GEMINI.md`.
- `GET /api/settings/raw` & `POST /api/settings/raw`: Raw `settings.json` and `config.json`.

---

## 6. Autonomous Schedules Endpoints

- `GET /api/schedules`: List recurring schedules.
- `POST /api/schedules`: Create schedule (`name`, `cron_expr`, `prompt`, `webhook_notify`).
- `DELETE /api/schedules/:id`: Delete schedule.
- `POST /api/schedules/:id/toggle`: Pause or activate schedule.

---

## 7. Security Audit Endpoints

- `GET /api/audit/logs?limit=100&offset=0&action=...&status=...`: Query audit log entries.
- `GET /api/audit/export?format=csv|json`: Download complete audit log.

---

## 8. WebSocket Protocol (`/ws`)

Connect to `/ws` over WebSocket or WSS:

### Subscribe to Agent Task:
```json
{ "action": "subscribe_task", "task_id": "4b63ff3a-..." }
```

### Incoming Task Events:
- `text_delta`: streamed text token.
- `tool_call`: tool started or finished with parameters/output.
- `agent_result`: turn finished with token usage and duration.
- `task_completed`: overall process completed.
