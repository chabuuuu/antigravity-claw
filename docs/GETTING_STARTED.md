# Getting Started with Antigravity OpenClaw

This guide walks you through setting up and running **Antigravity OpenClaw** on your machine or VPS in under 5 minutes.

---

## 📋 Prerequisites

1. **Linux VPS or Host**: Ubuntu 22.04 / 24.04 LTS (or any Linux distribution with Docker).
2. **Google Antigravity CLI (`agy`)**: Installed on your host machine or mounted into Docker.
3. **Docker & Docker Compose**: (Recommended) Docker Engine v24+ and Docker Compose v2+.
4. **Google Account Authorization**: Connected to `agy` for access to Gemini, Claude, and Argon models.

---

## 🐳 Quick Start with Docker Compose (Recommended)

The easiest and most reliable way to run OpenClaw is using the official Docker image from GitHub Container Registry (GHCR).

### Step 1: Clone the Repository

```bash
git clone https://github.com/chabuuuu/antigravity_open_claw.git
cd antigravity_open_claw
```

### Step 2: Configure Environment

Copy the example environment configuration:

```bash
cp .env.example .env
```

Review the `.env` settings:

```ini
OPENCLAW_HOST=0.0.0.0
OPENCLAW_PORT=8080
OPENCLAW_WORKSPACE=/workspace
AGY_BIN_PATH=/root/.gemini/bin/agy
HOST_WORKSPACE=./workspace
```

### Step 3: Launch OpenClaw Container

```bash
docker compose up -d
```

Check container status and logs:

```bash
docker compose ps
docker compose logs -f
```

OpenClaw is now live at `http://<YOUR_IP_OR_DOMAIN>:8080`!

---

## 🛠️ First-Run Master Setup Wizard

When you open `http://<YOUR_IP_OR_DOMAIN>:8080` for the first time:

1. **Setup Screen**: Because no administrator credentials exist out of the box, OpenClaw automatically displays the initial setup prompt:
   - Enter your desired **Username** (e.g. `admin`).
   - Enter your **Password** and **Confirm Password**.
2. **Account Creation**: The server hashes your password with salted Bcrypt / PBKDF2 (600,000 rounds) and registers the primary administrator.
3. **Session Token**: You are automatically authenticated with an HS256 JWT session token and directed into the Studio dashboard.

---

## 🔐 Authorizing Google Antigravity CLI

If your Antigravity CLI on the VPS has not been authorized yet:

1. In OpenClaw, click **Antigravity Config** in the left sidebar (or the authorization banner if prompted).
2. Click **Open Google Authorization Page**.
3. Sign in to your Google Account and approve the Antigravity OAuth permissions.
4. Copy the authorization code (starts with `4/0A...`).
5. Paste it into the OpenClaw modal and click **Submit Code & Authorize**.
6. OpenClaw connects your credentials and enables Gemini, Claude, and Argon model execution.

---

## 🛑 Stopping & Restarting OpenClaw

To stop the container:

```bash
docker compose down
```

To update to the latest version:

```bash
docker compose pull
docker compose up -d
```
