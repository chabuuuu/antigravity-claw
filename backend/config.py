"""
Configuration loader for Antigravity OpenClaw.
Supports loading from .env files or OS environment variables.
"""

import os
import secrets
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Helper to load .env file manually without external dependencies
def load_dotenv_file(filepath: Path):
    if not filepath.exists():
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k not in os.environ:
                    os.environ[k] = v
    except Exception:
        pass

load_dotenv_file(BASE_DIR / ".env")

# Server Config
HOST = os.environ.get("OPENCLAW_HOST", "0.0.0.0")
PORT = int(os.environ.get("OPENCLAW_PORT", "8080"))
DEBUG = os.environ.get("OPENCLAW_DEBUG", "false").lower() in ("true", "1", "yes")

# Database
DB_PATH = Path(os.environ.get("OPENCLAW_DB_PATH", str(DATA_DIR / "openclaw.db")))

# Security & JWT
SECRET_KEY_FILE = DATA_DIR / ".jwt_secret"
if not SECRET_KEY_FILE.exists():
    generated_secret = secrets.token_hex(32)
    SECRET_KEY_FILE.write_text(generated_secret)
    os.chmod(SECRET_KEY_FILE, 0o600)
    JWT_SECRET = generated_secret
else:
    JWT_SECRET = os.environ.get("OPENCLAW_JWT_SECRET") or SECRET_KEY_FILE.read_text().strip()

JWT_EXPIRY_HOURS = int(os.environ.get("OPENCLAW_JWT_EXPIRY_HOURS", "72"))
COOKIE_NAME = "openclaw_session"

# Rate Limiting & Brute Force Defense
MAX_LOGIN_ATTEMPTS = int(os.environ.get("OPENCLAW_MAX_LOGIN_ATTEMPTS", "5"))
LOCKOUT_MINUTES = int(os.environ.get("OPENCLAW_LOCKOUT_MINUTES", "15"))

# Antigravity CLI Binary Path auto-detection
def find_agy_binary() -> str:
    # 1. Environment variable
    custom = os.environ.get("AGY_BIN_PATH")
    if custom and os.path.isfile(custom) and os.access(custom, os.X_OK):
        return custom
    
    # 2. Check in ~/.gemini/bin/agy
    home = Path.home()
    gemini_bin = home / ".gemini" / "bin" / "agy"
    if gemini_bin.is_file() and os.access(gemini_bin, os.X_OK):
        return str(gemini_bin)
        
    # 3. Check in standard system paths
    for p in os.environ.get("PATH", "").split(os.path.pathsep):
        candidate = Path(p) / "agy"
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
            
    # Default fallback
    return "agy"

AGY_BIN_PATH = find_agy_binary()

# Workspace Root
DEFAULT_WORKSPACE = Path(os.environ.get("OPENCLAW_WORKSPACE", str(BASE_DIR))).resolve()

# Webhook Notifications
TELEGRAM_BOT_TOKEN = os.environ.get("OPENCLAW_TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("OPENCLAW_TELEGRAM_CHAT_ID", "")
DISCORD_WEBHOOK_URL = os.environ.get("OPENCLAW_DISCORD_WEBHOOK_URL", "")
SLACK_WEBHOOK_URL = os.environ.get("OPENCLAW_SLACK_WEBHOOK_URL", "")
GENERIC_WEBHOOK_URL = os.environ.get("OPENCLAW_GENERIC_WEBHOOK_URL", "")

