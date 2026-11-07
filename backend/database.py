"""
SQLite Database interface for Antigravity OpenClaw.
Handles schema initialization, WAL mode configuration, connection helpers, and migrations.
"""

import sqlite3
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from backend.config import DB_PATH

logger = logging.getLogger("openclaw.database")

def get_db_connection() -> sqlite3.Connection:
    """Returns a SQLite connection configured with WAL mode and row factory."""
    conn = sqlite3.connect(str(DB_PATH), timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initializes all necessary database tables and indices."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Users table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT DEFAULT 'admin',
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            last_login_at TEXT
        );
        """)

        # 2. Sessions table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            is_revoked INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
        """)

        # 3. Security Audit Logs table (Tamper-evident log of all system & user events)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user_id INTEGER,
            username TEXT,
            ip_address TEXT,
            user_agent TEXT,
            action TEXT NOT NULL,
            resource TEXT,
            status TEXT NOT NULL,
            details TEXT
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(username);")

        # 4. Conversations table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            model TEXT,
            effort TEXT,
            mode TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);")

        # 5. Conversation messages & steps table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversation_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT,
            step_index INTEGER DEFAULT 0,
            metadata_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations (conversation_id) ON DELETE CASCADE
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON conversation_messages(conversation_id);")

        # 6. Background tasks table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            status TEXT NOT NULL, -- PENDING, RUNNING, COMPLETED, FAILED, CANCELLED
            pid INTEGER,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            exit_code INTEGER,
            log_file TEXT,
            conversation_id TEXT,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);")

        # 7. Autonomous Schedules & Cron table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cron_expr TEXT NOT NULL,
            prompt TEXT NOT NULL,
            model TEXT,
            effort TEXT,
            mode TEXT,
            is_active INTEGER DEFAULT 1,
            last_run_at TEXT,
            next_run_at TEXT,
            webhook_notify INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        );
        """)

        # 8. Brute force defense & rate limiting table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS login_attempts (
            ip_address TEXT PRIMARY KEY,
            attempts INTEGER DEFAULT 0,
            last_attempt_at TEXT NOT NULL,
            locked_until TEXT
        );
        """)

        # 9. Key-value System settings
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)

        conn.commit()
        logger.info("Database initialized successfully at %s", DB_PATH)

def has_any_users() -> bool:
    """Checks whether at least one user exists in the database."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM users;")
        row = cursor.fetchone()
        return row["cnt"] > 0
