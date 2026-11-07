"""
Main Web Server & REST/WebSocket API Application for Antigravity OpenClaw.
Built with Tornado for ultra-fast async execution, WebSockets, and zero bloat.
"""

import asyncio
import csv
import io
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

import psutil
import tornado.web
import tornado.websocket
import tornado.ioloop

from backend.config import (
    HOST, PORT, DEBUG, BASE_DIR, COOKIE_NAME, DEFAULT_WORKSPACE, AGY_BIN_PATH
)
from backend.database import init_db, has_any_users, get_db_connection
from backend.auth import (
    authenticate_user, create_admin_user, revoke_token, verify_token, require_auth
)
from backend.audit import log_audit, query_audit_logs, AuditAction
from backend.antigravity_runner import runner_instance
from backend.settings_manager import settings_manager_instance
from backend.workspace_manager import workspace_manager_instance
from backend.terminal_manager import terminal_manager_instance
from backend.scheduler import scheduler_instance
from backend.webhook_notifier import notifier_instance

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("openclaw.server")

class BaseHandler(tornado.web.RequestHandler):
    """Base handler with JSON helpers, CORS, and request security context."""
    def set_default_headers(self):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.set_header("X-Content-Type-Options", "nosniff")
        self.set_header("X-Frame-Options", "DENY")
        self.set_header("X-XSS-Protection", "1; mode=block")

    def options(self, *args, **kwargs):
        self.set_status(204)
        self.finish()

    def get_client_ip(self) -> str:
        x_forwarded = self.request.headers.get("X-Forwarded-For")
        if x_forwarded:
            return x_forwarded.split(",")[0].strip()
        return self.request.remote_ip or "127.0.0.1"

    def get_user_agent(self) -> str:
        return self.request.headers.get("User-Agent", "Unknown")

    def json_body(self) -> Dict[str, Any]:
        try:
            if self.request.body:
                return json.loads(self.request.body.decode("utf-8"))
        except Exception:
            pass
        return {}

    def get_current_user_payload(self) -> Optional[Dict[str, Any]]:
        auth_header = self.request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        else:
            token = self.get_cookie(COOKIE_NAME)
        if token:
            return verify_token(token)
        return None

class AppPageHandler(BaseHandler):
    def get(self):
        index_file = BASE_DIR / "static" / "index.html"
        self.set_header("Content-Type", "text/html; charset=UTF-8")
        self.write(index_file.read_bytes())

class FaviconHandler(BaseHandler):
    def get(self):
        self.set_header("Content-Type", "image/svg+xml")
        self.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🦅</text></svg>')

# ================= AUTH CONTROLLERS =================

class AuthStatusHandler(BaseHandler):
    def get(self):
        has_admin = has_any_users()
        user_payload = self.get_current_user_payload()
        self.write({
            "setup_required": not has_admin,
            "authenticated": user_payload is not None,
            "user": {
                "id": user_payload["sub"],
                "username": user_payload["username"],
                "role": user_payload["role"]
            } if user_payload else None
        })

class AuthInitialSetupHandler(BaseHandler):
    def post(self):
        if has_any_users():
            self.set_status(400)
            self.finish({"error": "Administrator already configured. Initial setup is closed."})
            return
            
        data = self.json_body()
        username = data.get("username", "").strip()
        password = data.get("password", "")
        
        success, msg = create_admin_user(username, password, self.get_client_ip())
        if not success:
            self.set_status(400)
            self.finish({"error": msg})
            return
            
        token, user_dict, err = authenticate_user(username, password, self.get_client_ip(), self.get_user_agent())
        self.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Strict", expires_days=3)
        self.write({"success": True, "token": token, "user": user_dict})

class AuthLoginHandler(BaseHandler):
    def post(self):
        data = self.json_body()
        username = data.get("username", "").strip()
        password = data.get("password", "")
        
        token, user_dict, error_msg = authenticate_user(
            username, password, self.get_client_ip(), self.get_user_agent()
        )
        if error_msg:
            self.set_status(401 if "attempts" not in error_msg else 429)
            self.finish({"error": error_msg})
            return
            
        self.set_cookie(COOKIE_NAME, token, httponly=True, samesite="Strict", expires_days=3)
        self.write({"success": True, "token": token, "user": user_dict})

class AuthLogoutHandler(BaseHandler):
    @require_auth
    def post(self):
        token = self.get_cookie(COOKIE_NAME)
        if not token:
            auth_header = self.request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
        if token:
            revoke_token(token)
            
        self.clear_cookie(COOKIE_NAME)
        log_audit(
            action=AuditAction.AUTH_LOGOUT,
            status="SUCCESS",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            user_agent=self.get_user_agent()
        )
        self.write({"success": True, "message": "Logged out successfully."})

class AuthMeHandler(BaseHandler):
    @require_auth
    def get(self):
        self.write({"user": self.current_user})

# ================= AGENT CONTROLLERS =================

class AgentPromptHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        prompt = data.get("prompt", "").strip()
        if not prompt:
            self.set_status(400)
            self.finish({"error": "Prompt cannot be empty."})
            return
            
        conv_id = data.get("conversation_id")
        model = data.get("model")
        effort = data.get("effort", "medium")
        mode = data.get("mode", "auto")
        auto_approve = bool(data.get("auto_approve", True))
        sandbox = bool(data.get("sandbox", False))
        agent = data.get("agent")
        continue_session = bool(data.get("continue", False))
        remote_agent = bool(data.get("remote_agent", False))
        project = data.get("project")
        new_project = bool(data.get("new_project", False))
        add_dirs = data.get("add_dirs")
        disable_slash_commands = bool(data.get("disable_slash_commands", False))
        json_schema = data.get("json_schema")
        print_timeout = data.get("print_timeout")
        session_settings = data.get("settings")
        
        user_id = int(self.current_user["sub"])
        username = self.current_user["username"]
        
        task_id = await runner_instance.run_prompt(
            prompt=prompt,
            conversation_id=conv_id,
            model=model,
            effort=effort,
            mode=mode,
            auto_approve=auto_approve,
            sandbox=sandbox,
            agent=agent,
            continue_session=continue_session,
            remote_agent=remote_agent,
            project=project,
            new_project=new_project,
            add_dirs=add_dirs,
            disable_slash_commands=disable_slash_commands,
            json_schema=json_schema,
            print_timeout=print_timeout,
            session_settings=session_settings,
            user_id=user_id,
            username=username,
            ip_address=self.get_client_ip()
        )
        
        self.write({
            "task_id": task_id,
            "status": "RUNNING",
            "conversation_id": conv_id or task_id
        })

class AgentCancelHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        task_id = data.get("task_id", "")
        success = await runner_instance.cancel_task(
            task_id,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write({"success": success})

class AntigravityAuthStatusHandler(BaseHandler):
    @require_auth
    async def get(self):
        status = await runner_instance.check_auth_status()
        self.write(status)

class AntigravityAuthStartHandler(BaseHandler):
    @require_auth
    async def post(self):
        result = await runner_instance.start_auth_flow(
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write(result)

class AntigravityAuthSubmitHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        task_id = data.get("task_id", "")
        code = data.get("code", "").strip()
        if not code:
            self.set_status(400)
            self.finish({"error": "Authorization code cannot be empty."})
            return
        success = await runner_instance.submit_auth_code(task_id, code)
        self.write({"success": success})

class AgentTasksHandler(BaseHandler):
    @require_auth
    def get(self):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tasks ORDER BY id DESC LIMIT 50;")
            tasks = [dict(r) for r in cursor.fetchall()]
        self.write({"tasks": tasks})

class AgentConversationsHandler(BaseHandler):
    @require_auth
    def get(self):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50;")
            convs = [dict(r) for r in cursor.fetchall()]
        self.write({"conversations": convs})

class AgentConversationDetailHandler(BaseHandler):
    @require_auth
    def get(self, conv_id: str):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM conversations WHERE conversation_id = ?;", (conv_id,))
            conv = cursor.fetchone()
            if not conv:
                self.set_status(404)
                self.finish({"error": "Conversation not found."})
                return
                
            cursor.execute("SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC;", (conv_id,))
            messages = [dict(r) for r in cursor.fetchall()]
            
        self.write({
            "conversation": dict(conv),
            "messages": messages
        })

# ================= SETTINGS CONTROLLERS =================

class SettingsModelsHandler(BaseHandler):
    @require_auth
    async def get(self):
        models = await settings_manager_instance.get_models()
        self.write({"models": models})

class SettingsAgentsHandler(BaseHandler):
    @require_auth
    async def get(self):
        agents = await settings_manager_instance.get_agents()
        self.write({"agents": agents})

class SettingsMcpHandler(BaseHandler):
    @require_auth
    async def get(self):
        servers = await settings_manager_instance.get_mcp_servers()
        self.write({"mcp_servers": servers})

    @require_auth
    async def post(self):
        data = self.json_body()
        action = data.get("action", "")
        name = data.get("name", "")
        mcp_type = data.get("type", "stdio")
        cmd = data.get("command", "")
        args = data.get("args")
        env_vars = data.get("env_vars")
        headers = data.get("headers")
        
        success, msg = await settings_manager_instance.modify_mcp(
            action=action,
            name=name,
            mcp_type=mcp_type,
            command=cmd,
            args=args,
            env_vars=env_vars,
            headers=headers
        )
        log_audit(
            action=AuditAction.MCP_MODIFY,
            status="SUCCESS" if success else "FAILURE",
            resource=f"mcp:{name}",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            details={"action": action, "output": msg}
        )
        self.write({"success": success, "message": msg})

class SettingsPluginsHandler(BaseHandler):
    @require_auth
    async def get(self):
        plugins = await settings_manager_instance.get_plugins()
        self.write({"plugins": plugins})

    @require_auth
    async def post(self):
        data = self.json_body()
        action = data.get("action", "")
        name = data.get("name", "")
        
        success, msg = await settings_manager_instance.modify_plugin(action, name)
        log_audit(
            action=AuditAction.PLUGIN_MODIFY,
            status="SUCCESS" if success else "FAILURE",
            resource=f"plugin:{name}",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            details={"action": action, "output": msg}
        )
        self.write({"success": success, "message": msg})

class SettingsPluginsImportHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        source = data.get("source", "gemini")
        success, msg = await settings_manager_instance.import_plugin(source)
        log_audit(
            action=AuditAction.PLUGIN_MODIFY,
            status="SUCCESS" if success else "FAILURE",
            resource=f"plugin_import:{source}",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            details={"output": msg}
        )
        self.write({"success": success, "message": msg})

class SettingsPluginsValidateHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        path = data.get("path", ".")
        strict = bool(data.get("strict", False))
        success, msg = await settings_manager_instance.validate_plugin(path, strict)
        self.write({"success": success, "report": msg})

class SettingsPluginsLinkHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        marketplace = data.get("marketplace", "")
        target = data.get("target", "")
        success, msg = await settings_manager_instance.link_plugin(marketplace, target)
        self.write({"success": success, "message": msg})

class SettingsRemoteControlHandler(BaseHandler):
    @require_auth
    async def get(self):
        status = await settings_manager_instance.get_remote_control_status()
        self.write(status)

    @require_auth
    async def post(self):
        data = self.json_body()
        action = data.get("action", "")
        if action == "start":
            name = data.get("name")
            session = bool(data.get("session", False))
            success, msg = await settings_manager_instance.start_remote_control(name=name, session=session)
        elif action == "stop":
            success, msg = await settings_manager_instance.stop_remote_control()
        else:
            self.set_status(400)
            self.finish({"error": f"Unknown remote-control action: {action}"})
            return

        log_audit(
            action=AuditAction.SETTINGS_UPDATE,
            status="SUCCESS" if success else "FAILURE",
            resource="remote_control_daemon",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            details={"action": action, "output": msg}
        )
        self.write({"success": success, "message": msg})

class SettingsChangelogHandler(BaseHandler):
    @require_auth
    async def get(self):
        success, text = await settings_manager_instance.get_changelog()
        self.write({"success": success, "changelog": text})

class SettingsCliUpdateHandler(BaseHandler):
    @require_auth
    async def post(self):
        success, msg = await settings_manager_instance.update_cli()
        log_audit(
            action=AuditAction.SETTINGS_UPDATE,
            status="SUCCESS" if success else "FAILURE",
            resource="cli_update",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            details={"output": msg}
        )
        self.write({"success": success, "message": msg})

class SettingsCliInstallHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        dir_path = data.get("dir")
        success, msg = await settings_manager_instance.run_install(dir_path)
        log_audit(
            action=AuditAction.SETTINGS_UPDATE,
            status="SUCCESS" if success else "FAILURE",
            resource="cli_install",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            details={"output": msg}
        )
        self.write({"success": success, "message": msg})

class SettingsRulesHandler(BaseHandler):
    @require_auth
    def get(self):
        rules = settings_manager_instance.get_rules()
        self.write({"rules": rules})

    @require_auth
    def post(self):
        data = self.json_body()
        filename = data.get("filename", "")
        content = data.get("content", "")
        success, msg = settings_manager_instance.save_rules(filename, content)
        log_audit(
            action=AuditAction.RULES_UPDATE,
            status="SUCCESS" if success else "FAILURE",
            resource=filename,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write({"success": success, "message": msg})

class SettingsRawHandler(BaseHandler):
    @require_auth
    def get(self):
        data = settings_manager_instance.get_raw_settings()
        self.write(data)

    @require_auth
    def post(self):
        data = self.json_body()
        settings = data.get("settings")
        config = data.get("config")
        success, msg = settings_manager_instance.save_raw_settings(settings, config)
        log_audit(
            action=AuditAction.SETTINGS_UPDATE,
            status="SUCCESS" if success else "FAILURE",
            resource="raw_settings",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write({"success": success, "message": msg})

# ================= WORKSPACE CONTROLLERS =================

class WorkspaceFilesHandler(BaseHandler):
    @require_auth
    def get(self):
        path = self.get_argument("path", "")
        success, result = workspace_manager_instance.list_directory(path)
        if not success:
            self.set_status(400)
            self.finish({"error": result})
            return
        self.write(result)

class WorkspaceFileContentHandler(BaseHandler):
    @require_auth
    def get(self):
        path = self.get_argument("path", "")
        success, result = workspace_manager_instance.read_file(path)
        if not success:
            self.set_status(400)
            self.finish({"error": result})
            return
        log_audit(
            action=AuditAction.FILE_READ,
            status="SUCCESS",
            resource=path,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write(result)

    @require_auth
    def post(self):
        data = self.json_body()
        path = data.get("path", "")
        content = data.get("content", "")
        success, msg = workspace_manager_instance.write_file(
            path, content,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        if not success:
            self.set_status(400)
            self.finish({"error": msg})
            return
        self.write({"success": True, "message": msg})

    @require_auth
    def delete(self):
        data = self.json_body()
        path = data.get("path", "")
        success, msg = workspace_manager_instance.delete_item(
            path,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        if not success:
            self.set_status(400)
            self.finish({"error": msg})
            return
        self.write({"success": True, "message": msg})

class WorkspaceGitHandler(BaseHandler):
    @require_auth
    def get(self):
        status = workspace_manager_instance.get_git_status()
        self.write(status)

class WorkspaceGitDiffHandler(BaseHandler):
    @require_auth
    def get(self):
        data = workspace_manager_instance.get_git_diff()
        self.write(data)

class WorkspaceUploadHandler(BaseHandler):
    @require_auth
    def post(self):
        rel_dir = self.get_argument("path", "")
        if "file" not in self.request.files:
            self.set_status(400)
            self.finish({"error": "No file uploaded in multipart form."})
            return
            
        file_info = self.request.files["file"][0]
        filename = file_info["filename"]
        body = file_info["body"]

        success, msg = workspace_manager_instance.save_uploaded_file(
            rel_dir, filename, body,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        if not success:
            self.set_status(400)
            self.finish({"error": msg})
            return
        self.write({"success": True, "message": msg, "filename": filename})

class WorkspaceDownloadHandler(BaseHandler):
    @require_auth
    def get(self):
        path = self.get_argument("path", "")
        file_path = workspace_manager_instance.get_safe_file_path_for_download(path)
        if not file_path:
            self.set_status(404)
            self.finish({"error": "File not found or access denied."})
            return
            
        log_audit(
            action=AuditAction.FILE_DOWNLOAD,
            status="SUCCESS",
            resource=path,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.set_header("Content-Type", "application/octet-stream")
        self.set_header("Content-Disposition", f'attachment; filename="{file_path.name}"')
        self.write(file_path.read_bytes())

class SettingsWebhooksHandler(BaseHandler):
    @require_auth
    def get(self):
        self.write({
            "telegram_token_configured": bool(notifier_instance.telegram_token),
            "telegram_chat_id": notifier_instance.telegram_chat_id,
            "discord_url_configured": bool(notifier_instance.discord_url),
            "slack_url_configured": bool(notifier_instance.slack_url),
            "generic_url": notifier_instance.generic_url
        })

    @require_auth
    def post(self):
        data = self.json_body()
        notifier_instance.update_config(data)
        self.write({"success": True, "message": "Webhook settings updated."})

class SettingsWebhookTestHandler(BaseHandler):
    @require_auth
    def post(self):
        notifier_instance.notify(
            title="Antigravity OpenClaw Test",
            message="This is a test notification from your Antigravity OpenClaw instance on VPS.",
            event_type="SUCCESS",
            metadata={"user": self.current_user["username"]}
        )
        self.write({"success": True, "message": "Test notification dispatched."})

class HealthCheckHandler(BaseHandler):
    def get(self):
        self.write({
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "uptime_seconds": int(time.time() - psutil.boot_time())
        })


# ================= TERMINAL CONTROLLERS =================

class TerminalExecuteHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        command = data.get("command", "").strip()
        cwd = data.get("cwd")
        if not command:
            self.set_status(400)
            self.finish({"error": "Command cannot be empty."})
            return
            
        command_id = await terminal_manager_instance.execute_command(
            command, cwd=cwd,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write({"command_id": command_id, "status": "RUNNING"})

class TerminalKillHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        cmd_id = data.get("command_id", "")
        success = await terminal_manager_instance.kill_command(
            cmd_id,
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write({"success": success})

class TerminalInputHandler(BaseHandler):
    @require_auth
    async def post(self):
        data = self.json_body()
        cmd_id = data.get("command_id", "")
        input_data = data.get("data", "")
        success = await terminal_manager_instance.send_input(cmd_id, input_data)
        self.write({"success": success})

class TerminalHistoryHandler(BaseHandler):
    @require_auth
    def get(self):
        self.write({"history": terminal_manager_instance.command_history})

# ================= SCHEDULES CONTROLLERS =================

class SchedulesHandler(BaseHandler):
    @require_auth
    def get(self):
        schedules = scheduler_instance.list_schedules()
        self.write({"schedules": schedules})

    @require_auth
    def post(self):
        data = self.json_body()
        name = data.get("name", "").strip()
        cron_expr = data.get("cron_expr", "").strip()
        prompt = data.get("prompt", "").strip()
        model = data.get("model", "")
        effort = data.get("effort", "medium")
        mode = data.get("mode", "auto")
        notify = bool(data.get("webhook_notify", True))
        
        if not name or not cron_expr or not prompt:
            self.set_status(400)
            self.finish({"error": "Name, cron expression, and prompt are required."})
            return
            
        schedule_id = scheduler_instance.create_schedule(name, cron_expr, prompt, model, effort, mode, notify)
        log_audit(
            action=AuditAction.SCHEDULE_CREATE,
            status="SUCCESS",
            resource=f"schedule:{schedule_id}",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip(),
            details={"name": name, "cron": cron_expr}
        )
        self.write({"success": True, "id": schedule_id})

class ScheduleDetailHandler(BaseHandler):
    @require_auth
    def delete(self, schedule_id: str):
        success = scheduler_instance.delete_schedule(int(schedule_id))
        log_audit(
            action=AuditAction.SCHEDULE_DELETE,
            status="SUCCESS" if success else "FAILURE",
            resource=f"schedule:{schedule_id}",
            user_id=int(self.current_user["sub"]),
            username=self.current_user["username"],
            ip_address=self.get_client_ip()
        )
        self.write({"success": success})

class ScheduleToggleHandler(BaseHandler):
    @require_auth
    def post(self, schedule_id: str):
        data = self.json_body()
        active = bool(data.get("active", True))
        success = scheduler_instance.toggle_schedule(int(schedule_id), active)
        self.write({"success": success})

# ================= AUDIT LOGS CONTROLLERS =================

class AuditLogsHandler(BaseHandler):
    @require_auth
    def get(self):
        limit = min(int(self.get_argument("limit", 100)), 500)
        offset = int(self.get_argument("offset", 0))
        action = self.get_argument("action", None)
        username = self.get_argument("username", None)
        status = self.get_argument("status", None)
        search = self.get_argument("search", None)
        
        results = query_audit_logs(
            limit=limit, offset=offset, action=action,
            username=username, status=status, search=search
        )
        self.write(results)

class AuditExportHandler(BaseHandler):
    @require_auth
    def get(self):
        export_format = self.get_argument("format", "csv").lower()
        results = query_audit_logs(limit=2000, offset=0)
        logs = results.get("logs", [])
        
        if export_format == "json":
            self.set_header("Content-Type", "application/json")
            self.set_header("Content-Disposition", f"attachment; filename=openclaw_audit_{int(time.time())}.json")
            self.write(json.dumps(logs, indent=2))
        else:
            self.set_header("Content-Type", "text/csv")
            self.set_header("Content-Disposition", f"attachment; filename=openclaw_audit_{int(time.time())}.csv")
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["ID", "Timestamp (UTC)", "Username", "IP Address", "Action", "Resource", "Status", "Details"])
            for row in logs:
                writer.writerow([
                    row["id"], row["timestamp"], row["username"], row["ip_address"],
                    row["action"], row["resource"], row["status"], json.dumps(row["details"])
                ])
            self.write(output.getvalue())

# ================= SYSTEM STATUS CONTROLLER =================

class SystemStatusHandler(BaseHandler):
    @require_auth
    def get(self):
        cpu_pct = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        boot_time = datetime.fromtimestamp(psutil.boot_time(), timezone.utc).isoformat()
        
        self.write({
            "cpu_percent": cpu_pct,
            "memory": {
                "total_mb": round(mem.total / (1024 * 1024)),
                "used_mb": round(mem.used / (1024 * 1024)),
                "percent": mem.percent
            },
            "disk": {
                "total_gb": round(disk.total / (1024 * 1024 * 1024), 1),
                "used_gb": round(disk.used / (1024 * 1024 * 1024), 1),
                "free_gb": round(disk.free / (1024 * 1024 * 1024), 1),
                "percent": disk.percent
            },
            "boot_time": boot_time,
            "agy_binary": AGY_BIN_PATH,
            "workspace_root": str(DEFAULT_WORKSPACE)
        })

# ================= WEBSOCKET STREAMING CONTROLLER =================

class StreamWebSocketHandler(tornado.websocket.WebSocketHandler):
    def check_origin(self, origin):
        return True

    def open(self):
        self.authenticated = False
        self.user_payload = None
        self.subscribed_tasks = set()
        self.subscribed_commands = set()
        
        # Authenticate via cookie or initial token query param
        token = self.get_cookie(COOKIE_NAME) or self.get_argument("token", None)
        if token:
            payload = verify_token(token)
            if payload:
                self.authenticated = True
                self.user_payload = payload
                self.write_message(json.dumps({"type": "auth_ok", "username": payload["username"]}))
                return

        # If not authenticated yet, wait for 'auth' message
        self.write_message(json.dumps({"type": "auth_required"}))

    async def on_message(self, message):
        try:
            data = json.loads(message)
            msg_type = data.get("action") or data.get("type")

            if msg_type == "auth":
                token = data.get("token")
                payload = verify_token(token) if token else None
                if payload:
                    self.authenticated = True
                    self.user_payload = payload
                    self.write_message(json.dumps({"type": "auth_ok", "username": payload["username"]}))
                else:
                    self.write_message(json.dumps({"type": "auth_failed", "error": "Invalid token."}))
                    self.close(1008, "Unauthorized")
                return

            if not self.authenticated:
                self.write_message(json.dumps({"type": "error", "message": "Authentication required."}))
                return

            if msg_type == "subscribe_task":
                task_id = data.get("task_id")
                if task_id:
                    self.subscribed_tasks.add(task_id)
                    runner_instance.subscribe(task_id, self._send_task_event)
                    self.write_message(json.dumps({"type": "subscribed", "task_id": task_id}))

            elif msg_type == "unsubscribe_task":
                task_id = data.get("task_id")
                if task_id in self.subscribed_tasks:
                    self.subscribed_tasks.discard(task_id)
                    runner_instance.unsubscribe(task_id, self._send_task_event)

            elif msg_type == "subscribe_terminal":
                command_id = data.get("command_id")
                if command_id:
                    self.subscribed_commands.add(command_id)
                    terminal_manager_instance.subscribe(command_id, self._send_terminal_event)
                    self.write_message(json.dumps({"type": "subscribed_terminal", "command_id": command_id}))

            elif msg_type == "submit_antigravity_auth_code":
                task_id = data.get("task_id") or data.get("conversation_id", "")
                code = data.get("code", "")
                await runner_instance.submit_auth_code(task_id, code)

            elif msg_type == "terminal_input":
                command_id = data.get("command_id", "")
                input_data = data.get("data", "")
                await terminal_manager_instance.send_input(command_id, input_data)

        except Exception as e:
            logger.error("WebSocket message handling error: %s", e)

    def _send_task_event(self, event: Dict[str, Any]):
        try:
            self.write_message(json.dumps(event))
        except Exception:
            pass

    def _send_terminal_event(self, event: Dict[str, Any]):
        try:
            self.write_message(json.dumps(event))
        except Exception:
            pass

    def on_close(self):
        for task_id in self.subscribed_tasks:
            runner_instance.unsubscribe(task_id, self._send_task_event)
        for cmd_id in self.subscribed_commands:
            terminal_manager_instance.unsubscribe(cmd_id, self._send_terminal_event)

def make_app():
    static_path = BASE_DIR / "static"
    return tornado.web.Application([
        # Frontend Entry
        (r"/", AppPageHandler),
        (r"/app", AppPageHandler),
        (r"/favicon.ico", FaviconHandler),
        (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": str(static_path)}),
        
        # Health Check
        (r"/api/health", HealthCheckHandler),

        # Auth Routes
        (r"/api/auth/status", AuthStatusHandler),
        (r"/api/auth/initial-setup", AuthInitialSetupHandler),
        (r"/api/auth/login", AuthLoginHandler),
        (r"/api/auth/logout", AuthLogoutHandler),
        (r"/api/auth/me", AuthMeHandler),
        
        # Agent Task Routes
        (r"/api/agent/prompt", AgentPromptHandler),
        (r"/api/agent/cancel", AgentCancelHandler),
        (r"/api/agent/tasks", AgentTasksHandler),
        (r"/api/agent/conversations", AgentConversationsHandler),
        (r"/api/agent/conversations/([^/]+)", AgentConversationDetailHandler),
        (r"/api/antigravity/auth/status", AntigravityAuthStatusHandler),
        (r"/api/antigravity/auth/start", AntigravityAuthStartHandler),
        (r"/api/antigravity/auth/submit", AntigravityAuthSubmitHandler),
        
        # Antigravity Settings Routes
        (r"/api/settings/models", SettingsModelsHandler),
        (r"/api/settings/agents", SettingsAgentsHandler),
        (r"/api/settings/mcp", SettingsMcpHandler),
        (r"/api/settings/plugins", SettingsPluginsHandler),
        (r"/api/settings/plugins/import", SettingsPluginsImportHandler),
        (r"/api/settings/plugins/validate", SettingsPluginsValidateHandler),
        (r"/api/settings/plugins/link", SettingsPluginsLinkHandler),
        (r"/api/settings/remote-control", SettingsRemoteControlHandler),
        (r"/api/settings/changelog", SettingsChangelogHandler),
        (r"/api/settings/update", SettingsCliUpdateHandler),
        (r"/api/settings/install", SettingsCliInstallHandler),
        (r"/api/settings/rules", SettingsRulesHandler),
        (r"/api/settings/raw", SettingsRawHandler),
        (r"/api/settings/webhooks", SettingsWebhooksHandler),
        (r"/api/settings/webhooks/test", SettingsWebhookTestHandler),
        
        # Workspace Routes
        (r"/api/workspace/files", WorkspaceFilesHandler),
        (r"/api/workspace/file", WorkspaceFileContentHandler),
        (r"/api/workspace/git", WorkspaceGitHandler),
        (r"/api/workspace/git/diff", WorkspaceGitDiffHandler),
        (r"/api/workspace/upload", WorkspaceUploadHandler),
        (r"/api/workspace/download", WorkspaceDownloadHandler),
        
        # Terminal Routes
        (r"/api/terminal/execute", TerminalExecuteHandler),
        (r"/api/terminal/kill", TerminalKillHandler),
        (r"/api/terminal/history", TerminalHistoryHandler),
        (r"/api/terminal/input", TerminalInputHandler),
        
        # Schedules Routes
        (r"/api/schedules", SchedulesHandler),
        (r"/api/schedules/([^/]+)", ScheduleDetailHandler),
        (r"/api/schedules/([^/]+)/toggle", ScheduleToggleHandler),
        
        # Security Audit Routes
        (r"/api/audit/logs", AuditLogsHandler),
        (r"/api/audit/export", AuditExportHandler),
        
        # System Metrics
        (r"/api/system/status", SystemStatusHandler),
        
        # WebSocket Streaming
        (r"/ws", StreamWebSocketHandler),
    ], debug=DEBUG, cookie_secret=os.urandom(32))

def main():
    init_db()
    scheduler_instance.start()
    
    app = make_app()
    app.listen(PORT, address=HOST)
    logger.info("=================================================================")
    logger.info("🚀 Antigravity OpenClaw Server started on http://%s:%d", HOST, PORT)
    logger.info("📁 Workspace Root: %s", DEFAULT_WORKSPACE)
    logger.info("🤖 Antigravity CLI binary: %s", AGY_BIN_PATH)
    logger.info("🛡️ Mandatory Authentication & Security Audit: ENABLED")
    logger.info("=================================================================")
    
    try:
        tornado.ioloop.IOLoop.current().start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down Antigravity OpenClaw...")
        scheduler_instance.stop()

if __name__ == "__main__":
    main()
