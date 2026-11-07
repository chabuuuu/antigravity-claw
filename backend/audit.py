"""
Audit Logging Module for Antigravity OpenClaw.
Provides persistent, tamper-evident recording of security, administrative,
and operational actions with full querying and export capabilities.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from backend.database import get_db_connection

logger = logging.getLogger("openclaw.audit")

class AuditAction:
    AUTH_LOGIN_SUCCESS = "AUTH_LOGIN_SUCCESS"
    AUTH_LOGIN_FAILED = "AUTH_LOGIN_FAILED"
    AUTH_LOGOUT = "AUTH_LOGOUT"
    AUTH_USER_CREATED = "AUTH_USER_CREATED"
    AUTH_PASSWORD_CHANGED = "AUTH_PASSWORD_CHANGED"
    AUTH_RATE_LIMITED = "AUTH_RATE_LIMITED"
    
    AGENT_TASK_START = "AGENT_TASK_START"
    AGENT_TASK_FINISH = "AGENT_TASK_FINISH"
    AGENT_TASK_CANCEL = "AGENT_TASK_CANCEL"
    AGENT_TASK_ERROR = "AGENT_TASK_ERROR"
    
    FILE_READ = "FILE_READ"
    FILE_WRITE = "FILE_WRITE"
    FILE_DELETE = "FILE_DELETE"
    FILE_UPLOAD = "FILE_UPLOAD"
    FILE_DOWNLOAD = "FILE_DOWNLOAD"
    
    TERMINAL_EXEC = "TERMINAL_EXEC"
    TERMINAL_KILL = "TERMINAL_KILL"
    
    SETTINGS_UPDATE = "SETTINGS_UPDATE"
    MCP_MODIFY = "MCP_MODIFY"
    PLUGIN_MODIFY = "PLUGIN_MODIFY"
    RULES_UPDATE = "RULES_UPDATE"
    
    SCHEDULE_CREATE = "SCHEDULE_CREATE"
    SCHEDULE_UPDATE = "SCHEDULE_UPDATE"
    SCHEDULE_DELETE = "SCHEDULE_DELETE"
    SCHEDULE_TRIGGER = "SCHEDULE_TRIGGER"

def log_audit(
    action: str,
    status: str,  # SUCCESS, FAILURE, DENIED, RUNNING
    resource: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """
    Persists an audit entry to the audit_logs SQLite table.
    Ensures safe formatting and handles exceptions gracefully without crashing caller.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    details_str = json.dumps(details, default=str) if details is not None else None
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO audit_logs (timestamp, user_id, username, ip_address, user_agent, action, resource, status, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                timestamp,
                user_id,
                username or "anonymous",
                ip_address or "unknown",
                user_agent or "unknown",
                action,
                resource,
                status,
                details_str
            ))
            conn.commit()
    except Exception as e:
        logger.error("Failed to write audit log: %s", e)

def query_audit_logs(
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    username: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Queries audit logs with pagination, filtering, and search options.
    """
    query = "SELECT * FROM audit_logs WHERE 1=1"
    params: List[Any] = []
    
    if action:
        query += " AND action = ?"
        params.append(action)
    if username:
        query += " AND username = ?"
        params.append(username)
    if status:
        query += " AND status = ?"
        params.append(status)
    if start_date:
        query += " AND timestamp >= ?"
        params.append(start_date)
    if end_date:
        query += " AND timestamp <= ?"
        params.append(end_date)
    if search:
        query += " AND (resource LIKE ? OR details LIKE ? OR ip_address LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s])
        
    count_query = query.replace("SELECT *", "SELECT COUNT(*) as total", 1)
    
    query += " ORDER BY id DESC LIMIT ? OFFSET ?;"
    params.extend([limit, offset])
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(count_query, params[:-2])
        total_count = cursor.fetchone()["total"]
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        logs = []
        for r in rows:
            parsed_details = None
            if r["details"]:
                try:
                    parsed_details = json.loads(r["details"])
                except Exception:
                    parsed_details = r["details"]
            logs.append({
                "id": r["id"],
                "timestamp": r["timestamp"],
                "user_id": r["user_id"],
                "username": r["username"],
                "ip_address": r["ip_address"],
                "user_agent": r["user_agent"],
                "action": r["action"],
                "resource": r["resource"],
                "status": r["status"],
                "details": parsed_details
            })
            
    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "logs": logs
    }

