# Welcome to Antigravity OpenClaw

**Antigravity OpenClaw** is an open-source, web-based autonomous developer agent studio built specifically to interface directly with the **Google Antigravity CLI** (`agy`). It transforms any Ubuntu or Linux VPS into an always-on, autonomous pair-programming and operations center that you can access seamlessly from both your desktop browser and your smartphone.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Docker Image](https://img.shields.io/badge/Docker-GHCR-2496ED.svg)](https://github.com/chabuuuu/antigravity_open_claw/pkgs/container/antigravity-claw)
[![Antigravity CLI](https://img.shields.io/badge/Antigravity-v1.5+-purple.svg)](https://cloud.google.com)
[![Mobile Optimized](https://img.shields.io/badge/Mobile-Responsive-success.svg)](#mobile-first-experience)

---

## 🌟 Key Highlights

### 📱 Mobile & Desktop Responsive
Control and dispatch autonomous agent tasks on the go. Whether on an iPhone, iPad, or Android phone, OpenClaw features an off-canvas drawer, thumb-friendly execution controls, auto-zoom prevention, and a segmented workspace switcher.

### 💬 Real-Time Streaming Agent Studio
Experience live streaming output directly from `agy`:
- **Reasoning Accordions**: Collapsible thinking blocks that display the agent's chain-of-thought.
- **Tool Execution Cards**: Real-time visual cards for tool calls (`run_command`, `edit_file`, `write_file`, MCP tools) with stdout/stderr, durations, and status badges.
- **Antigravity CLI Flags**: Full interactive control over `--model`, `--effort`, `--mode`, `--project`, `--new-project`, `--remote-agent`, and ephemeral session overrides.

### 📊 Real-Time Usage & Model Quotas
Monitor your Google Antigravity quotas directly from the web interface:
- **Gemini Models** (Gemini Flash, Gemini Pro): Weekly limit remaining with live reset countdown timers and 5-hour burst limits.
- **Claude & GPT Models** (Opus, Sonnet, GPT-OSS): Weekly and 5-hour limits.
- **Gemini 4 Argon**: Dedicated Pro/Ultra tier quota buckets.
- **In-Chat Commands**: Type `/usage` or `/quota` in chat for instantaneous graphical quota bars.
- **Token Analytics**: Aggregate token metrics (Prompt, Completion, Thinking tokens).

### 📁 Workspace Explorer & In-Browser Editor
- Browse remote files with tree view and MIME icons.
- View and edit files with syntax styling and `Ctrl+S` auto-backup (`.bak`).
- Upload files from local device to VPS or download remote files with a click.
- Inspect `git diff` and recent commits directly in the browser.

### 💻 Integrated VPS Web Terminal
- Full interactive Bash terminal session connected directly to your VPS.
- Monospace ANSI colors, command history navigation (Up/Down arrow), and process termination kill switch.

### ⏱️ Autonomous Scheduling & Multi-Channel Webhooks
- Define recurring background tasks using cron expressions (e.g. `*/30 * * * *`, `@daily`).
- Runs unattended in the background 24/7 without requiring an open browser tab.
- Instant webhook alerts on completion or failure via **Telegram Bot**, **Discord**, **Slack**, or **Generic HTTP Webhooks**.

### 🛡️ Enterprise Security & Tamper-Evident Audit Trail
- Mandatory authentication on all REST APIs and WebSockets.
- First-run Master Setup Wizard to initialize administrator credentials.
- Salted password hashing (Bcrypt / PBKDF2 with 600,000 iterations).
- HS256 JWT tokens with server-side session revocation.
- IP rate-limiting defense against brute-force attacks.
- Strict canonical workspace boundary validation against path traversal.
- Append-only SQLite audit log recording every login, task, file edit, and shell command. Exportable to CSV/JSON.

---

## 🧭 Navigation & Documentation Guide

- [🚀 Getting Started Guide](GETTING_STARTED.md): How to install and launch OpenClaw using Docker Compose or standalone installer.
- [📱 Mobile Experience Guide](MOBILE_GUIDE.md): How to prompt and monitor tasks on smartphones.
- [🏗️ System Architecture](ARCHITECTURE.md): Deep-dive into internal modules, the `stream-json` protocol, and process isolation.
- [🔌 Antigravity CLI Integration](ANTIGRAVITY_INTEGRATION.md): How OpenClaw connects to `agy` and mounts plugins/MCP servers.
- [📊 Usage & Quotas](USAGE_QUOTAS.md): Detailed breakdown of quota groups, reset time calculations, and token counting.
- [⏱️ Autonomous Workflows](AUTONOMOUS_WORKFLOWS.md): Scheduling cron tasks, background loops, and configuring notification webhooks.
- [🛡️ Security & Auditing](SECURITY_AUDIT.md): Defense-in-depth security model and audit logging specifications.
- [🐳 Docker Deployment](DOCKER_DEPLOYMENT.md): Container configuration, volume mounts, DNS settings, and GHCR registry.
- [🖥️ Ubuntu VPS Deployment](DEPLOYMENT_VPS_UBUNTU.md): Production Nginx reverse proxy, SSL with Let's Encrypt, and systemd services.
- [📖 REST & WebSocket API](API_REFERENCE.md): Complete API endpoint and WebSocket schema specifications.

