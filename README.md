# 🦅 Antigravity OpenClaw

<div align="center">

**Remote Autonomous Agent Studio for Google Antigravity (`agy`)**  
*An open-source, web-based control center transforming your Linux Ubuntu VPS into a 24/7 autonomous Antigravity agent studio with OpenClaw-grade UI, multi-layer security, and background automations.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docs: GitHub Pages](https://img.shields.io/badge/Docs-GitHub%20Pages-blue.svg)](https://chabuuuu.github.io/antigravity_open_claw/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Docker GHCR](https://img.shields.io/badge/Docker-GHCR-2496ED.svg)](https://github.com/chabuuuu/antigravity_open_claw/pkgs/container/antigravity-claw)
[![Mobile: Responsive](https://img.shields.io/badge/Mobile-Responsive-success.svg)](#-mobile-responsive-experience)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Documentation](https://chabuuuu.github.io/antigravity_open_claw/) • [Overview](#-overview) • [Mobile Experience](#-mobile-responsive-experience) • [Key Features](#-key-features) • [Architecture](#-architecture) • [Quickstart](#-quickstart) • [VPS Deployment](#-production-deployment-on-ubuntu-vps) • [Contributing](#-contributing)

</div>

---

## 🌟 Overview

**Antigravity OpenClaw** bridges the power of the **Google Antigravity CLI (`agy`)** with an intuitive, modern, dark-themed web dashboard inspired by OpenClaw.

When installed on a self-hosted Ubuntu Linux VPS, it allows developers to:
- **Dispatch coding tasks remotely** to Google Antigravity from any browser, tablet, or mobile phone.
- **Stream reasoning and tool executions in real time** over WebSockets with zero lag.
- **Automate routine workflows** (code reviews, testing, git synchronizations) using background cron schedules while you sleep.
- **Inspect and edit remote files** directly in the browser with syntax highlighting, automatic backups, and Git diff tracking.
- **Control 100% of Antigravity options**: Models (Gemini 4 Argon, Gemini 3.8 Flash, Claude Sonnet), MCP servers, plugins, and project rules (`GEMINI.md`).
- **Enforce strict enterprise security**: Mandatory authentication, brute-force defense, and a tamper-evident audit trail recording all actions.

---

## 🚀 Key Features

### 1. 💬 Real-Time Agent Workspace
- **Direct CLI Communication**: Interfaces with `agy` using the native `--output-format stream-json` protocol.
- **Live Token Streaming**: Token-by-token real-time output via WebSockets.
- **Interactive Slash Commands Autocomplete (`/`)**: Floating popup with keyboard navigation (`↑`/`↓`, `Enter`/`Tab`, `Esc`) and instant filtering across 38+ commands and skills.
- **Quick Action Workflow Chips**: 1-click chips above prompt (`👥 Teamwork`, `🚀 Boost`, `📋 Plan`, `💬 Grill-Me`, `🎯 Goal`, `🧠 Learn`, `🌐 Browser`, `📊 Usage`, `🧩 Skills`, `❓ Help`).
- **Interactive In-Chat Cards**: Instant rich response cards for `/usage` (quota bars), `/skills` (extension grid), and `/help` (command cheat-sheet).
- **Reasoning Process Accordion**: Collapsible thought blocks showing agent planning and thinking tokens.
- **Tool Execution Cards**: Real-time visualization of tool calls (`run_command`, `edit_file`, MCP tools) showing parameters, status badges, and standard output.
- **Token Telemetry**: Complete breakdown of input, output, and thinking tokens along with turn execution duration.
- **Multi-Turn Sessions**: Conversation history persistence in SQLite; resume or stop running sessions anytime.

### 2. 👥 Teamwork & Multi-Agent Swarm Studio
- **Multi-Agent Orchestration Strategies**:
  - **`/teamwork` (Autonomous Swarm)**: Coordinates specialized agents (Coordinator, Researcher, Builder, Reviewer) across parallel and phased workstreams.
  - **`/boost` (Multi-Perspective Orchestrator)**: High-horsepower multi-agent problem solver with deep reasoning, strategic planning, and multiple critical verification angles.
  - **`/goal` (Autonomous Goal Loop)**: Persistent loop that continues working until an explicit definition of done is achieved.
  - **`/plan` & `/grill-me` (Plan & Align)**: Step-by-step architectural planning followed by an interactive interview mode to resolve requirements and edge cases.
- **Role Composition**: Real-time visual cards for Lead Coordinator, Research Analyst, Builder Developer, and QA Reviewer.
- **Mission Templates & 1-Click Swarm Launch**: Pre-built mission templates for fullstack authentication, security audits, mobile modernization, and test suite generation.

### 3. 🧩 Skills Catalog & Explorer
- **Complete Skill Discovery**: Dynamic integration with `agy -p "/skills"` listing all builtin and installed plugin skills (Chrome DevTools, Modern Web Guidance, Android CLI, Compose Preview, Automation, etc.).
- **Category Filter Pills**: Quick filtering by Builtin, Chrome DevTools, Web Guidance, and Android.
- **Real-Time Search**: Instant search by skill name, description, and source plugin.
- **Interactive Documentation Modal**: In-browser rendering of `SKILL.md` instructions, parameter guides, and best practices.
- **1-Click Chat Invocation**: Pre-fills `/<skill-name>` into the chat input and transitions to the workspace.

### 4. ⚙️ Complete Antigravity Configuration & CLI Suite (100% Feature Parity)
- **All Session Execution Flags**:
  - `--model`: Real-time discovery via `agy models` (Gemini 4 Argon, Gemini 3.8 Flash, Claude Opus/Sonnet 5.5, GPT-OSS).
  - `--effort`: All 5 reasoning effort tiers (`low`, `medium`, `high`, `xhigh`, `max`).
  - `--mode`: Full execution mode control (`auto`, `accept-edits`, `plan`).
  - `--agent`: Built-in and custom subagent selection (`agy agents`).
  - `--dangerously-skip-permissions`: Autonomous auto-approval mode.
  - `--sandbox`: Restricted terminal sandbox isolation.
  - `--remote-agent`: Direct execution on Google Antigravity remote agents.
  - `--project` & `--new-project`: Remote/local project selection and on-demand project creation.
  - `--continue` (`-c`): Seamless resumption of the most recent conversation.
  - `--add-dir`: Attach extra workspace directories dynamically.
  - `--disable-slash-commands`: Disable print-mode slash command & skill expansion.
  - `--json-schema`: Enforce structured JSON schema outputs.
  - `--print-timeout`: Configurable execution deadlines.
  - `--settings`: Ephemeral session-only settings overrides.
- **Model Context Protocol (MCP) Manager**:
  - Full CLI flag support for `agy mcp add`: `--type` (stdio/http), `--env` (`KEY=val`), `--header` (`Header: Value`), command arguments.
  - List, enable, disable, and remove MCP tool servers.
- **Plugin Lifecycle & Validation Suite**:
  - `agy plugin list`: High-fidelity JSON plugin status, version, and component discovery.
  - `agy plugin install`: Install official or custom plugins (`plugin[@marketplace]`).
  - `agy plugin import`: Import compatible plugins from `gemini` or `claude`.
  - `agy plugin validate`: Run validator with optional `--strict` mode.
  - `agy plugin link`: Generate marketplace links.
- **Remote Control & Service Daemons**:
  - `agy remote-control`: Start, stop, and inspect the remote control daemon (`--name`, `--session`).
  - `agy acp`: Information and command generator for the Agent Client Protocol (ACP) stdio server (VS Code, JetBrains, Zed, Neovim).
  - `agy mic-serve`: Start and monitor remote microphone audio dictation services.
- **System Maintenance & Updates**:
  - `agy update`: In-place CLI binary updater with live execution output.
  - `agy install`: Configure shell profiles and environment PATHs.
  - `agy changelog`: Full interactive, searchable release notes and version changelog viewer.
- **Usage & Model Quotas Dashboard**:
  - Real-time quota tracking via `agy -p "/usage"` and `/quota`.
  - Live progress bars, percentages, and countdown timers for:
    - **Gemini Models** (Weekly Limit & 5-Hour Limit).
    - **Claude & GPT Models** (Weekly Limit & 5-Hour Limit).
    - **Gemini 4 Argon** (Dedicated Pro/Ultra tier limits).
  - Account email display (`id_token_email`) and quota consumption explanations.
  - Interactive in-chat `/usage` or `/quota` slash commands that render graphical quota bars.
  - Header quota badge and total task token analytics (prompt, completion, and thinking tokens).
- **Project Rules & Guidelines**: Directly view and edit `GEMINI.md` and `AGENTS.md` in the browser.
- **Raw Configuration Editor**: Safe editor for `~/.gemini/settings.json` and `~/.gemini/config/config.json`.

### 5. 📁 Workspace Explorer & In-Browser Code Editor
- **Tree Navigation**: Browse remote project directories with MIME-type icons and modification dates.
- **Code Editor**: Edit and save files with `Ctrl + S`, featuring automatic `.bak` backup generation.
- **File Transfer**: Upload files from your local machine to the VPS or download files from the VPS.
- **Git Integration**: View active branch, uncommitted modifications count, and side-by-side `git diff` outputs.

### 6. 💻 VPS Web Terminal
- **Integrated Bash Session**: Execute Linux shell commands remotely without opening an SSH client.
- **Terminal Capabilities**: Monospace ANSI color rendering, command history (Arrow Up/Down), clear screen, and interactive process termination (Kill switch).

### 7. ⏱️ Autonomous Scheduling & Multi-Channel Webhooks
- **Cron Automations**: Define recurring jobs using standard cron syntax (e.g., `*/30 * * * *`, `@daily`, `every 60 min`).
- **Unattended 24/7 Execution**: Evaluates schedules in a background daemon loop, launching Antigravity without requiring human interaction.
- **Instant Webhooks**: Receive completion summaries, token metrics, or failure alerts via:
  - **Telegram Bot** (`sendMessage` with Markdown formatting)
  - **Discord Webhook** (rich embeds with task metadata)
  - **Slack Webhook**
  - **Generic HTTP Webhook** (JSON payload)

### 8. 🛡️ Enterprise Security & Tamper-Evident Audit Trail
- **Mandatory Authentication**: All REST API endpoints and WebSockets strictly reject unauthenticated requests.
- **First-Run Master Setup Wizard**: On initial startup, the user sets their administrator credentials; no hardcoded default passwords exist.
- **Cryptographic Hashing**: Passwords hashed with high-iteration Bcrypt or PBKDF2-HMAC-SHA256 (600,000 rounds) and unique salts.
- **Cryptographic Session Tokens**: HS256-signed JWT tokens with server-side session revocation.
- **Brute-Force & Rate Limiting**: 5 consecutive failed attempts locks out the client IP address for 15 minutes.
- **Path Traversal Defense**: All file queries are validated against the canonical workspace boundary using `Path.relative_to()`.
- **Append-Only Audit Log**: Every login, task dispatch, file edit, terminal command, and configuration change is recorded in an SQLite database with timestamp (UTC), username, client IP, action, resource, status, and details. Logs can be exported to **CSV** or **JSON**.

### 9. 📱 Mobile-First Responsive Experience
- **Slide-Over Off-Canvas Navigation**: Touch hamburger drawer (`☰`) with smooth sliding animations and frosted backdrop dismiss.
- **On-the-Go Autonomous Tasks**: Prompt AI from your smartphone with thumb-friendly controls, enlarged `🚀 Run` button, and auto-zoom prevention (16px base input).
- **Segmented Mobile Workspace Switcher**: Easily toggle between `📁 File Tree` and `📝 Code Editor` tabs on narrow screens; opening a file automatically transitions to the code editor.
- **Fluid Output Streaming**: Reasoning process accordions and tool execution cards scale to mobile viewports without horizontal page distortion.
- **Mobile Header Badges**: Tap the compact quota pill directly on mobile to inspect remaining capacity.

---

## 🏗️ Architecture

```
+-------------------------------------------------------------------------+
|                  Remote Web Browser (OpenClaw SPA)                     |
|  [💬 Chat]  [📁 Explorer]  [💻 Terminal]  [⚙️ Settings]  [📋 Audit]    |
+-------------------------------------------------------------------------+
                                   ▲
                                   │ WebSocket (/ws) & HTTPS REST API
                                   ▼
+-------------------------------------------------------------------------+
|                    Ubuntu VPS: Nginx Reverse Proxy & SSL                |
+-------------------------------------------------------------------------+
                                   ▲
                                   │ Local Proxy
                                   ▼
+-------------------------------------------------------------------------+
|               Antigravity OpenClaw Engine (Python / Tornado)            |
|                                                                         |
|  * Auth & IP Rate Limiting        * Tamper-evident Audit Logger         |
|  * Path-traversal Guard           * Web Terminal Subprocess             |
|  * Autonomous Cron Scheduler      * Telegram / Discord Webhook Notifier |
|  * SQLite WAL DB (openclaw.db)                                          |
+-------------------------------------------------------------------------+
                                   ▲
                                   │ Async Subprocess (stdin/stdout NDJSON)
                                   ▼
+-------------------------------------------------------------------------+
|                   Google Antigravity CLI (`agy`) Engine                 |
|                                                                         |
|  * Gemini / Claude Engine         * Subagents (self, research, etc.)    |
|  * Plugins & Skills               * Model Context Protocol (MCP)        |
+-------------------------------------------------------------------------+
```

---

## ⚡ Quickstart

### Option 1: Automated 1-Click Installer (Recommended for Ubuntu VPS)

Run the following commands on your Ubuntu VPS:

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/antigravity-openclaw.git
cd antigravity-openclaw

# 2. Run the automated installer
chmod +x install.sh
./install.sh

# 3. Start the systemd service
sudo systemctl start antigravity-openclaw
```

Open your browser and navigate to `http://<YOUR_VPS_IP>:8080`. On your first visit, the **Master Administrator Setup Wizard** will prompt you to create your credentials.

---

### Option 2: Manual Setup (No Root Required)

```bash
# Create and activate Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the application
./start.sh
```

To stop the daemon:
```bash
./stop.sh
```

---

### Option 3: Docker Deployment (GHCR or Local Build)

Pull and run the prebuilt multi-arch image directly from GitHub Container Registry (GHCR):

```bash
docker compose up -d
```

Or run via Docker CLI:
```bash
docker run -d \
  --name antigravity_openclaw \
  -p 8080:8080 \
  -v ./data:/app/data \
  -v ~/.gemini:/root/.gemini:ro \
  -v $(pwd):/workspace \
  ghcr.io/<your-username>/antigravity-openclaw:latest
```

---

## 🌐 Production Deployment on Ubuntu VPS

For production environments, serve OpenClaw behind **Nginx** with **HTTPS (Let's Encrypt SSL)**:

### 1. Configure UFW Firewall
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (SSL challenges)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. Configure Nginx Reverse Proxy
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp nginx.conf.example /etc/nginx/sites-available/openclaw.conf
sudo nano /etc/nginx/sites-available/openclaw.conf  # Replace your-domain.com with your domain
sudo ln -s /etc/nginx/sites-available/openclaw.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Generate Free SSL Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

### 4. Background Service Management (Systemd)
```bash
# Check service status
sudo systemctl status antigravity-openclaw

# Restart service
sudo systemctl restart antigravity-openclaw

# View live application logs
journalctl -u antigravity-openclaw -f
```

---

## 📚 Documentation & GitHub Pages

Full documentation is hosted on GitHub Pages: **[https://chabuuuu.github.io/antigravity_open_claw/](https://chabuuuu.github.io/antigravity_open_claw/)**

Detailed guides are also available in the [`docs/`](./docs) directory:

- [Documentation Portal & Overview](./docs/README.md) - The complete documentation home.
- [Getting Started Guide](./docs/GETTING_STARTED.md) - Rapid installation and first-run guide.
- [Mobile Experience Guide](./docs/MOBILE_GUIDE.md) - How to prompt and control autonomous tasks from your smartphone.
- [Usage & Model Quotas Guide](./docs/USAGE_QUOTAS.md) - Real-time tracking of Gemini, Claude, and Argon quotas.
- [Autonomous Scheduling & Webhooks](./docs/AUTONOMOUS_WORKFLOWS.md) - 24/7 background cron jobs with Telegram and Discord alerts.
- [System Architecture & Internals](./docs/ARCHITECTURE.md) - Deep dive into core subsystems, security design, and data flows.
- [Security Architecture & Audit Logging](./docs/SECURITY_AUDIT.md) - Authentication, rate limiting, and tamper-evident audit trails.
- [Docker & Container Deployment](./docs/DOCKER_DEPLOYMENT.md) - Container orchestration, volume mounts, and GHCR images.
- [Ubuntu VPS Deployment Guide](./docs/DEPLOYMENT_VPS_UBUNTU.md) - Step-by-step instructions for Nginx, SSL, UFW, and systemd.
- [Antigravity CLI Integration Guide](./docs/ANTIGRAVITY_INTEGRATION.md) - Protocol analysis of `stream-json`, flags, tools, and subagents.
- [Studio Features & Developer Tools](./docs/FEATURES.md) - Workspace file explorer, in-browser editor, and VPS terminal.
- [REST & WebSocket API Reference](./docs/API_REFERENCE.md) - Complete endpoints specification and WebSocket event schemas.
- [Contributing Guidelines](./docs/CONTRIBUTING_GUIDE.md) - How to build, test, and contribute to OpenClaw.

---

## 🧪 Testing

Run the automated test suite to verify authentication, audit logging, path traversal guards, and Antigravity model querying:

```bash
python3 tests/test_backend.py
```

---

## 🤝 Contributing

We welcome contributions from developers worldwide! Whether you want to improve UI components, add integrations, or fix bugs:

1. Review our [Contributing Guidelines](CONTRIBUTING.md).
2. Adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).
3. Report any security concerns according to our [Security Policy](SECURITY.md).

---

## 📄 License

This project is licensed under the **[MIT License](LICENSE)**. You are free to use, modify, distribute, and integrate it into commercial or private workflows.
# antigravity-claw
