# Docker & Container Deployment Guide

Deploying **Antigravity OpenClaw** with Docker provides an isolated, reproducible environment on any Linux host or VPS.

---

## 🐳 Docker Architecture

The OpenClaw Docker container runs the Tornado asynchronous backend, mounts your host Antigravity CLI and Google OAuth tokens, and connects directly to your workspace.

```
+--------------------------------------------------------------------+
| Docker Container: antigravity_openclaw                             |
|                                                                    |
|  * Python 3.11 + Tornado Engine                                    |
|  * Static SPA Web Assets (/app/static)                             |
|  * Persistent SQLite DB (/app/data/openclaw.db)                    |
|  * Internal Port: 8080                                             |
|                                                                    |
|  Mounts from Host:                                                 |
|    ~/.gemini            <--->  /root/.gemini (rw)                  |
|    ~/.config/antigravity<--->  /root/.config/antigravity (rw)       |
|    ./workspace          <--->  /workspace (rw)                     |
|    ./data               <--->  /app/data (rw)                      |
|    /var/run/docker.sock <--->  /var/run/docker.sock (optional)     |
+--------------------------------------------------------------------+
```

---

## 🚀 Running with Docker Compose

A production-ready `docker-compose.yml` is provided in the repository:

```yaml
version: '3.8'

services:
  openclaw:
    image: ghcr.io/chabuuuu/antigravity-claw:latest
    build: .
    container_name: antigravity_openclaw
    restart: unless-stopped
    ports:
      - "${OPENCLAW_PORT:-8080}:8080"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./backend:/app/backend:ro
      - ./static:/app/static:ro
      - ~/.gemini:/root/.gemini:rw
      - ~/.config/antigravity:/root/.config/antigravity:rw
      - ${HOST_WORKSPACE:-./workspace}:/workspace
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - OPENCLAW_HOST=0.0.0.0
      - OPENCLAW_PORT=8080
      - OPENCLAW_WORKSPACE=/workspace
      - AGY_BIN_PATH=/root/.gemini/bin/agy
    dns:
      - 8.8.8.8
      - 1.1.1.1
```

### Important Volume Mounts:
1. `~/.gemini:/root/.gemini:rw`:
   Houses the `agy` CLI binary, credentials, and OAuth tokens (`antigravity-oauth-token`, `google_accounts.json`).
   *Note: Must be mounted with `:rw` permissions so Antigravity can refresh Google OAuth tokens and write execution logs.*
2. `~/.config/antigravity:/root/.config/antigravity:rw`:
   Houses MCP secrets and custom plugin configurations.
3. `./data:/app/data`:
   Houses the persistent SQLite database (`openclaw.db`) containing user accounts, sessions, tasks, schedules, and audit logs.
4. `dns: [8.8.8.8, 1.1.1.1]`:
   Ensures reliable external DNS resolution for Google OAuth endpoints (`oauth2.googleapis.com`) inside Docker bridge networks.

---

## 📦 Pulling Pre-Built Images from GHCR

Every GitHub release automatically builds and pushes multi-architecture images to GitHub Container Registry:

```bash
docker pull ghcr.io/chabuuuu/antigravity-claw:latest
```

You can pin specific versions:

```bash
docker pull ghcr.io/chabuuuu/antigravity-claw:v1.0.0
```

---

## 🛠️ Maintenance & Useful Commands

### Viewing Logs:
```bash
docker compose logs -f --tail=100
```

### Checking Container Health:
```bash
curl http://localhost:8080/api/health
```

### Accessing Container Shell:
```bash
docker exec -it antigravity_openclaw /bin/bash
```

### Recreating the Container after Git Pull:
```bash
git pull
docker compose down
docker compose up -d
```
