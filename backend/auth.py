"""
Authentication and Security Module for Antigravity OpenClaw.
Handles password hashing, JWT creation & validation, brute force rate-limiting,
and Tornado request authorization guards.
"""

import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
import jwt
import tornado.web

from backend.config import (
    JWT_SECRET, JWT_EXPIRY_HOURS, COOKIE_NAME,
    MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES
)
from backend.database import get_db_connection
from backend.audit import log_audit, AuditAction

logger = logging.getLogger("openclaw.auth")

# Try importing bcrypt, fallback to PBKDF2 if needed
try:
    import bcrypt
    HAS_BCRYPT = True
except ImportError:
    HAS_BCRYPT = False

def hash_password(password: str) -> Tuple[str, str]:
    """Hashes a password returning (password_hash, salt)."""
    salt = secrets.token_hex(16)
    if HAS_BCRYPT:
        # bcrypt handles its own salt in the hash
        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
        return hashed, "bcrypt"
    else:
        # PBKDF2-HMAC-SHA256 with 600,000 iterations
        hashed = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), 600000
        ).hex()
        return hashed, salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verifies a plain text password against the stored hash and salt."""
    try:
        if salt == "bcrypt" or stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"):
            return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
        else:
            computed = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), salt.encode("utf-8"), 600000
            ).hex()
            return hmac.compare_digest(computed, stored_hash)
    except Exception as e:
        logger.error("Password verification error: %s", e)
        return False

def check_ip_lockout(ip_address: str) -> Tuple[bool, int]:
    """
    Checks if an IP address is currently locked out due to excessive failed attempts.
    Returns (is_locked, seconds_remaining).
    """
    now = datetime.now(timezone.utc)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT attempts, locked_until FROM login_attempts WHERE ip_address = ?;", (ip_address,))
        row = cursor.fetchone()
        if not row:
            return False, 0
            
        locked_until_str = row["locked_until"]
        if locked_until_str:
            locked_until = datetime.fromisoformat(locked_until_str)
            if now < locked_until:
                remaining = int((locked_until - now).total_seconds())
                return True, remaining
            else:
                # Lock expired, reset attempts
                cursor.execute("UPDATE login_attempts SET attempts = 0, locked_until = NULL WHERE ip_address = ?;", (ip_address,))
                conn.commit()
                return False, 0
    return False, 0

def record_login_attempt(ip_address: str, success: bool):
    """Updates the login_attempts table based on success or failure."""
    now = datetime.now(timezone.utc)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if success:
            cursor.execute("DELETE FROM login_attempts WHERE ip_address = ?;", (ip_address,))
            conn.commit()
            return
            
        cursor.execute("SELECT attempts FROM login_attempts WHERE ip_address = ?;", (ip_address,))
        row = cursor.fetchone()
        attempts = (row["attempts"] + 1) if row else 1
        
        locked_until = None
        if attempts >= MAX_LOGIN_ATTEMPTS:
            locked_until = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            logger.warning("IP %s locked out until %s after %d failed attempts", ip_address, locked_until, attempts)
            
        cursor.execute("""
        INSERT INTO login_attempts (ip_address, attempts, last_attempt_at, locked_until)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ip_address) DO UPDATE SET
            attempts = excluded.attempts,
            last_attempt_at = excluded.last_attempt_at,
            locked_until = excluded.locked_until;
        """, (ip_address, attempts, now.isoformat(), locked_until))
        conn.commit()

def create_access_token(user_id: int, username: str, role: str, ip_address: str, user_agent: str) -> str:
    """Generates a cryptographically signed JWT token and persists a session record."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=JWT_EXPIRY_HOURS)
    token_id = secrets.token_hex(16)
    
    payload = {
        "jti": token_id,
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp())
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    
    # Store session in DB
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO sessions (token_id, user_id, created_at, expires_at, ip_address, user_agent, is_revoked)
        VALUES (?, ?, ?, ?, ?, ?, 0);
        """, (token_id, user_id, now.isoformat(), expires_at.isoformat(), ip_address, user_agent))
        conn.commit()
        
    return token

def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Validates JWT token and checks revocation in the sessions table."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        token_id = payload.get("jti")
        if not token_id:
            return None
            
        # Check revocation in DB
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT is_revoked FROM sessions WHERE token_id = ?;", (token_id,))
            row = cursor.fetchone()
            if not row or row["is_revoked"] == 1:
                return None
                
        return payload
    except Exception as e:
        return None

def revoke_token(token: str) -> bool:
    """Marks a session token as revoked."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"verify_exp": False})
        token_id = payload.get("jti")
        if token_id:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE sessions SET is_revoked = 1 WHERE token_id = ?;", (token_id,))
                conn.commit()
            return True
    except Exception:
        pass
    return False

def authenticate_user(username: str, password: str, ip_address: str, user_agent: str) -> Tuple[Optional[str], Optional[Dict[str, Any]], Optional[str]]:
    """
    Validates user credentials against database with lockout check.
    Returns (token, user_dict, error_message).
    """
    is_locked, remaining_seconds = check_ip_lockout(ip_address)
    if is_locked:
        log_audit(
            action=AuditAction.AUTH_RATE_LIMITED,
            status="DENIED",
            username=username,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"remaining_seconds": remaining_seconds}
        )
        return None, None, f"Too many failed login attempts. IP temporarily locked. Please try again in {remaining_seconds // 60 + 1} minutes."
        
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ? AND is_active = 1;", (username,))
        user = cursor.fetchone()
        
        if not user or not verify_password(password, user["password_hash"], user["salt"]):
            record_login_attempt(ip_address, success=False)
            log_audit(
                action=AuditAction.AUTH_LOGIN_FAILED,
                status="FAILURE",
                username=username,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "Invalid credentials"}
            )
            return None, None, "Invalid username or password."
            
        # Success
        record_login_attempt(ip_address, success=True)
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute("UPDATE users SET last_login_at = ? WHERE id = ?;", (now_iso, user["id"]))
        conn.commit()
        
        token = create_access_token(
            user_id=user["id"],
            username=user["username"],
            role=user["role"],
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        user_info = {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "created_at": user["created_at"],
            "last_login_at": now_iso
        }
        
        log_audit(
            action=AuditAction.AUTH_LOGIN_SUCCESS,
            status="SUCCESS",
            user_id=user["id"],
            username=user["username"],
            ip_address=ip_address,
            user_agent=user_agent
        )
        return token, user_info, None

def create_admin_user(username: str, password: str, ip_address: str = "127.0.0.1") -> Tuple[bool, str]:
    """Creates the initial or an additional administrator user."""
    if len(username.strip()) < 3:
        return False, "Username must be at least 3 characters long."
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
        
    password_hash, salt = hash_password(password)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO users (username, password_hash, salt, role, is_active, created_at)
            VALUES (?, ?, ?, 'admin', 1, ?);
            """, (username.strip(), password_hash, salt, now_iso))
            conn.commit()
            
            log_audit(
                action=AuditAction.AUTH_USER_CREATED,
                status="SUCCESS",
                username=username.strip(),
                ip_address=ip_address,
                details={"role": "admin"}
            )
            return True, "User created successfully."
    except Exception as e:
        logger.error("Failed to create user: %s", e)
        return False, f"Username '{username}' already exists or database error."

def require_auth(handler_func):
    """
    Decorator for Tornado RequestHandler methods that strictly enforces authentication.
    Extracts token from 'Authorization: Bearer <token>' header or session cookie.
    Rejects with 401 if missing, invalid, or revoked.
    """
    def wrapper(self, *args, **kwargs):
        auth_header = self.request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        else:
            token = self.get_cookie(COOKIE_NAME)
            
        if not token:
            self.set_status(401)
            self.finish({"error": "Unauthorized: Authentication required."})
            return
            
        payload = verify_token(token)
        if not payload:
            self.set_status(401)
            self.finish({"error": "Unauthorized: Invalid or expired session."})
            return
            
        self.current_user = payload
        return handler_func(self, *args, **kwargs)
    return wrapper
