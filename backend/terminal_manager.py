"""
Web Terminal & VPS Command Runner Module for Antigravity OpenClaw.
Executes shell commands on the VPS with real-time streaming to WebSockets,
cancellation support, execution history, and mandatory security audit logging.
"""

import asyncio
import logging
import os
import signal
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Set, Callable, List
from pathlib import Path

from backend.config import DEFAULT_WORKSPACE
from backend.audit import log_audit, AuditAction

logger = logging.getLogger("openclaw.terminal_manager")

class ActiveCommand:
    def __init__(self, command_id: str, command_line: str, cwd: str, user_id: Optional[int], username: Optional[str]):
        self.command_id = command_id
        self.command_line = command_line
        self.cwd = cwd
        self.user_id = user_id
        self.username = username
        self.process: Optional[asyncio.subprocess.Process] = None
        self.status = "RUNNING"  # RUNNING, COMPLETED, FAILED, TERMINATED
        self.exit_code: Optional[int] = None
        self.output_buffer = ""
        self.listeners: Set[Callable[[Dict[str, Any]], None]] = set()
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.finished_at: Optional[str] = None

class TerminalManager:
    def __init__(self):
        self.active_commands: Dict[str, ActiveCommand] = {}
        self.command_history: List[Dict[str, Any]] = []

    async def execute_command(
        self,
        command_line: str,
        cwd: Optional[str] = None,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> str:
        """Starts asynchronous execution of a shell command and returns command_id."""
        command_id = str(uuid.uuid4())
        work_dir = cwd or str(DEFAULT_WORKSPACE)
        
        cmd_obj = ActiveCommand(command_id, command_line, work_dir, user_id, username)
        self.active_commands[command_id] = cmd_obj

        log_audit(
            action=AuditAction.TERMINAL_EXEC,
            status="RUNNING",
            resource=command_line[:100],
            user_id=user_id,
            username=username,
            ip_address=ip_address,
            details={"cwd": work_dir, "command": command_line}
        )

        asyncio.create_task(self._run_process(cmd_obj, ip_address))
        return command_id

    async def _run_process(self, cmd_obj: ActiveCommand, ip_address: Optional[str]):
        try:
            process = await asyncio.create_subprocess_shell(
                cmd_obj.command_line,
                cwd=cmd_obj.cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            cmd_obj.process = process

            # Stream output
            while True:
                chunk = await process.stdout.read(1024)
                if not chunk:
                    break
                text = chunk.decode("utf-8", errors="replace")
                cmd_obj.output_buffer += text
                self._broadcast(cmd_obj, {
                    "type": "terminal_data",
                    "command_id": cmd_obj.command_id,
                    "data": text
                })

            await process.wait()
            cmd_obj.exit_code = process.returncode
            cmd_obj.status = "COMPLETED" if cmd_obj.exit_code == 0 else "FAILED"

        except asyncio.CancelledError:
            cmd_obj.status = "TERMINATED"
            if cmd_obj.process and cmd_obj.process.returncode is None:
                cmd_obj.process.terminate()
        except Exception as e:
            logger.error("Error running terminal command: %s", e)
            cmd_obj.status = "FAILED"
            cmd_obj.output_buffer += f"\n[Error: {e}]"
            self._broadcast(cmd_obj, {
                "type": "terminal_data",
                "command_id": cmd_obj.command_id,
                "data": f"\n[Error: {e}]\n"
            })
        finally:
            cmd_obj.finished_at = datetime.now(timezone.utc).isoformat()
            
            self._broadcast(cmd_obj, {
                "type": "terminal_exit",
                "command_id": cmd_obj.command_id,
                "status": cmd_obj.status,
                "exit_code": cmd_obj.exit_code
            })

            # Record in history
            self.command_history.append({
                "command_id": cmd_obj.command_id,
                "command": cmd_obj.command_line,
                "cwd": cmd_obj.cwd,
                "username": cmd_obj.username,
                "status": cmd_obj.status,
                "exit_code": cmd_obj.exit_code,
                "started_at": cmd_obj.started_at,
                "finished_at": cmd_obj.finished_at
            })
            if len(self.command_history) > 100:
                self.command_history.pop(0)

            log_audit(
                action=AuditAction.TERMINAL_EXEC,
                status="SUCCESS" if cmd_obj.status == "COMPLETED" else "FAILURE",
                resource=cmd_obj.command_line[:100],
                user_id=cmd_obj.user_id,
                username=cmd_obj.username,
                ip_address=ip_address,
                details={
                    "status": cmd_obj.status,
                    "exit_code": cmd_obj.exit_code,
                    "command_id": cmd_obj.command_id
                }
            )

    def _broadcast(self, cmd_obj: ActiveCommand, message: Dict[str, Any]):
        for listener in list(cmd_obj.listeners):
            try:
                listener(message)
            except Exception as e:
                logger.error("Error broadcasting terminal data: %s", e)

    def subscribe(self, command_id: str, listener: Callable[[Dict[str, Any]], None]):
        if command_id in self.active_commands:
            self.active_commands[command_id].listeners.add(listener)

    def unsubscribe(self, command_id: str, listener: Callable[[Dict[str, Any]], None]):
        if command_id in self.active_commands:
            self.active_commands[command_id].listeners.discard(listener)

    async def kill_command(self, command_id: str, user_id: Optional[int] = None, username: Optional[str] = None, ip_address: Optional[str] = None) -> bool:
        """Terminates a running terminal process."""
        if command_id not in self.active_commands:
            return False
        cmd_obj = self.active_commands[command_id]
        if cmd_obj.status != "RUNNING" or not cmd_obj.process:
            return False

        try:
            cmd_obj.status = "TERMINATED"
            cmd_obj.process.terminate()
            await asyncio.sleep(0.5)
            if cmd_obj.process.returncode is None:
                cmd_obj.process.kill()
                
            log_audit(
                action=AuditAction.TERMINAL_KILL,
                status="SUCCESS",
                resource=f"cmd:{command_id}",
                user_id=user_id,
                username=username,
                ip_address=ip_address
            )
            return True
        except Exception as e:
            logger.error("Error killing command %s: %s", command_id, e)
            return False

terminal_manager_instance = TerminalManager()
