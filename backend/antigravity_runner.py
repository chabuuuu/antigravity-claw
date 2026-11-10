"""
Antigravity Process Runner Module.
Spawns and orchestrates Antigravity CLI (`agy`) processes using `--output-format stream-json`,
parses NDJSON events in real-time, broadcasts deltas to WebSocket clients,
records execution steps in SQLite, and provides process lifecycle management (cancellation/kill).
"""

import asyncio
import json
import logging
import os
import re
import signal
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Set, Callable, List
from pathlib import Path

from backend.config import AGY_BIN_PATH, DEFAULT_WORKSPACE
from backend.database import get_db_connection
from backend.audit import log_audit, AuditAction
from backend.webhook_notifier import notifier_instance

logger = logging.getLogger("openclaw.antigravity_runner")

class ActiveTask:
    def __init__(self, task_id: str, conversation_id: str, prompt: str, user_id: Optional[int], username: Optional[str]):
        self.task_id = task_id
        self.conversation_id = conversation_id  # OpenClaw session conversation ID
        self.agy_conversation_id: Optional[str] = None  # Underlying Antigravity CLI conversation ID
        self.prompt = prompt
        self.user_id = user_id
        self.username = username
        self.project = "Default"
        self.process: Optional[asyncio.subprocess.Process] = None
        self.status = "RUNNING"  # RUNNING, COMPLETED, FAILED, CANCELLED
        self.listeners: Set[Callable[[Dict[str, Any]], None]] = set()
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.completed_at: Optional[str] = None
        self.exit_code: Optional[int] = None
        self.duration_seconds: float = 0.0
        self.full_response = ""
        self.total_usage: Dict[str, Any] = {}
        self.steps: List[Dict[str, Any]] = []
        self.auth_required = False
        self.auth_url: Optional[str] = None
        self.stderr_buffer = ""
        self.pty_master_fd: Optional[int] = None
        self.webhook_notify: bool = False

class AntigravityRunner:
    def __init__(self):
        self.active_tasks: Dict[str, ActiveTask] = {}
        self.task_history: Dict[str, Dict[str, Any]] = {}
        self.on_task_finished_callbacks: List[Callable[[ActiveTask], None]] = []

    def register_on_finished(self, cb: Callable[[ActiveTask], None]):
        self.on_task_finished_callbacks.append(cb)

    async def run_prompt(
        self,
        prompt: str,
        conversation_id: Optional[str] = None,
        model: Optional[str] = None,
        effort: Optional[str] = "medium",
        mode: Optional[str] = "auto",
        auto_approve: bool = True,
        sandbox: bool = False,
        agent: Optional[str] = None,
        workspace_dir: Optional[str] = None,
        continue_session: bool = False,
        remote_agent: bool = False,
        project: Optional[str] = None,
        new_project: bool = False,
        add_dirs: Optional[List[str]] = None,
        disable_slash_commands: bool = False,
        json_schema: Optional[str] = None,
        print_timeout: Optional[str] = None,
        session_settings: Optional[Any] = None,
        webhook_notify: bool = False,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> str:
        """
        Launches an Antigravity task in the background and returns task_id.
        Streams NDJSON output in real-time.
        """
        task_id = str(uuid.uuid4())
        conv_id = conversation_id or str(uuid.uuid4())
        
        clean_project = (project or "Default").strip() or "Default"
        task = ActiveTask(task_id, conv_id, prompt, user_id, username)
        task.project = clean_project
        task.webhook_notify = webhook_notify
        self.active_tasks[task_id] = task

        # Check for existing agy_conversation_id if continuing an existing session
        existing_agy_conv_id = None
        if conversation_id:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT agy_conversation_id FROM conversations WHERE conversation_id = ?;", (conversation_id,))
                row = cursor.fetchone()
                if row and row["agy_conversation_id"]:
                    existing_agy_conv_id = row["agy_conversation_id"]

        # Ensure conversation exists in DB
        with get_db_connection() as conn:
            cursor = conn.cursor()
            now_iso = datetime.now(timezone.utc).isoformat()
            cursor.execute("""
            INSERT INTO conversations (conversation_id, title, model, effort, mode, created_at, updated_at, user_id, project)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conversation_id) DO UPDATE SET updated_at = excluded.updated_at, project = excluded.project;
            """, (
                conv_id,
                prompt[:60].replace("\n", " "),
                model or "default",
                effort or "medium",
                mode or "auto",
                now_iso,
                now_iso,
                user_id,
                clean_project
            ))
            
            # Record user message
            cursor.execute("""
            INSERT INTO conversation_messages (conversation_id, role, content, step_index, created_at)
            VALUES (?, 'user', ?, 0, ?);
            """, (conv_id, prompt, now_iso))

            # Record task
            cursor.execute("""
            INSERT INTO tasks (task_id, title, prompt, status, created_at, conversation_id, user_id, project)
            VALUES (?, ?, ?, 'RUNNING', ?, ?, ?, ?);
            """, (task_id, prompt[:60], prompt, now_iso, conv_id, user_id, clean_project))
            conn.commit()

        log_audit(
            action=AuditAction.AGENT_TASK_START,
            status="RUNNING",
            resource=f"task:{task_id}",
            user_id=user_id,
            username=username,
            ip_address=ip_address,
            details={
                "conversation_id": conv_id,
                "model": model,
                "effort": effort,
                "mode": mode,
                "agent": agent,
                "remote_agent": remote_agent,
                "project": project,
                "prompt": prompt[:200]
            }
        )

        # Build CLI command arguments
        cwd = workspace_dir
        if not cwd and clean_project:
            try:
                from backend.projects_manager import projects_manager_instance
                p_obj = projects_manager_instance.get_project(clean_project)
                if p_obj and p_obj.get("path") and os.path.isdir(p_obj["path"]):
                    cwd = p_obj["path"]
            except Exception:
                pass
        if not cwd:
            cwd = str(DEFAULT_WORKSPACE)

        cmd = [
            AGY_BIN_PATH,
            "--output-format", "stream-json"
        ]
        
        if auto_approve:
            cmd.append("--dangerously-skip-permissions")

        clean_model = None
        if model:
            # Strip any trailing tabs, display names or whitespace
            clean_model = model.split("\t")[0].split()[0].strip()

            # Normalize baked-in effort suffix if present (e.g. gemini-3.8-flash-low -> gemini-3.8-flash)
            m = re.match(r"^(gemini-4-argon|gemini-3.8-flash|claude-opus-5-5|claude-sonnet-5-5)-(low|medium|high|xhigh|max)$", clean_model)
            if m:
                base_name = m.group(1)
                if effort:
                    clean_model = base_name
                else:
                    effort = m.group(2)
                    clean_model = base_name

            cmd.extend(["--model", clean_model])

        if effort:
            # gpt-oss models only support medium effort; omit --effort flag to prevent conflict errors
            if not (clean_model and "gpt-oss" in clean_model):
                cmd.extend(["--effort", effort])
        if mode and mode not in ("auto", "default", ""):
            cmd.extend(["--mode", mode])
        if sandbox:
            cmd.append("--sandbox")
        if agent:
            cmd.extend(["--agent", agent])
        if continue_session:
            cmd.append("--continue")
        elif existing_agy_conv_id:
            cmd.extend(["--conversation", existing_agy_conv_id])
        if remote_agent:
            cmd.append("--remote-agent")
        if project and project.strip():
            cmd.extend(["--project", project.strip()])
        if new_project:
            cmd.append("--new-project")
        if add_dirs:
            for d in add_dirs:
                if d and d.strip():
                    cmd.extend(["--add-dir", d.strip()])
        if disable_slash_commands:
            cmd.append("--disable-slash-commands")
        if json_schema and json_schema.strip():
            cmd.extend(["--json-schema", json_schema.strip()])
        if print_timeout and print_timeout.strip():
            cmd.extend(["--print-timeout", print_timeout.strip()])
        if session_settings:
            if isinstance(session_settings, dict):
                cmd.extend(["--settings", json.dumps(session_settings)])
            elif isinstance(session_settings, str) and session_settings.strip():
                cmd.extend(["--settings", session_settings.strip()])
            
        cmd.extend(["--print", prompt])

        # Start execution in async background task
        asyncio.create_task(self._execute_process(task, cmd, cwd, ip_address))
        return task_id

    def _check_for_auth_prompt(self, task: ActiveTask, line: str):
        """Scans process output line for Google OAuth authorization URLs."""
        match = re.search(r'(https://accounts\.google\.com/o/oauth2/auth[^\s\x1b\r\n\t]+)', line)
        if match and not task.auth_required:
            auth_url = match.group(1).rstrip('.')
            task.auth_required = True
            task.auth_url = auth_url
            logger.info("Detected Antigravity OAuth prompt for task %s: %s", task.task_id, auth_url)
            self._broadcast(task, {
                "type": "antigravity_auth_required",
                "task_id": task.task_id,
                "conversation_id": task.conversation_id,
                "auth_url": auth_url,
                "message": "Antigravity CLI requires Google Authorization. Please visit the link to sign in, then paste your authorization code."
            })

    async def _execute_process(self, task: ActiveTask, cmd: List[str], cwd: str, ip_address: Optional[str]):
        logger.info("Executing agy command: %s (cwd=%s)", " ".join(cmd), cwd)
        env = os.environ.copy()

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                env=env,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            task.process = process

            # Update PID in DB
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE tasks SET pid = ? WHERE task_id = ?;", (process.pid, task.task_id))
                conn.commit()

            async def _read_stdout():
                async for raw_line in process.stdout:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue
                    self._check_for_auth_prompt(task, line)
                    try:
                        event_data = json.loads(line)
                        self._handle_stream_event(task, event_data)
                    except json.JSONDecodeError:
                        self._broadcast(task, {
                            "type": "cli_output",
                            "task_id": task.task_id,
                            "text": line
                        })

            async def _read_stderr():
                async for raw_line in process.stderr:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue
                    self._check_for_auth_prompt(task, line)
                    task.stderr_buffer += line + "\n"

            # Stream both stdout and stderr concurrently without deadlock
            await asyncio.gather(_read_stdout(), _read_stderr())
            await process.wait()
            task.exit_code = process.returncode

            if task.stderr_buffer and task.exit_code != 0:
                err_msg = task.stderr_buffer.strip()
                if task.auth_required and ("timed out" in err_msg.lower() or "not authenticated" in err_msg.lower()):
                    err_msg = "Antigravity CLI authentication timed out. Please sign in via Antigravity Config."
                self._broadcast(task, {
                    "type": "error",
                    "task_id": task.task_id,
                    "message": err_msg
                })

            if task.status == "RUNNING":
                task.status = "COMPLETED" if task.exit_code == 0 else "FAILED"

        except asyncio.CancelledError:
            task.status = "CANCELLED"
            if task.process and task.process.returncode is None:
                task.process.terminate()
        except Exception as e:
            logger.error("Error executing agy task %s: %s", task.task_id, e)
            task.status = "FAILED"
            self._broadcast(task, {
                "type": "error",
                "task_id": task.task_id,
                "message": str(e)
            })
        finally:
            task.completed_at = datetime.now(timezone.utc).isoformat()
            input_tok = int(task.total_usage.get("input_tokens") or 0)
            output_tok = int(task.total_usage.get("output_tokens") or 0)
            thinking_tok = int(task.total_usage.get("thinking_tokens") or 0)
            total_tok = int(task.total_usage.get("total_tokens") or (input_tok + output_tok + thinking_tok))
            duration_sec = float(getattr(task, "duration_seconds", 0.0) or 0.0)
            
            # Persist completion in DB
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                UPDATE tasks
                SET status = ?, completed_at = ?, exit_code = ?, duration_seconds = ?, input_tokens = ?, output_tokens = ?, thinking_tokens = ?, total_tokens = ?
                WHERE task_id = ?;
                """, (task.status, task.completed_at, task.exit_code, duration_sec, input_tok, output_tok, thinking_tok, total_tok, task.task_id))

                if task.agy_conversation_id:
                    cursor.execute("""
                    UPDATE conversations
                    SET agy_conversation_id = ?, updated_at = ?
                    WHERE conversation_id = ?;
                    """, (task.agy_conversation_id, task.completed_at, task.conversation_id))

                # Determine assistant content to persist
                assistant_content = task.full_response.strip()
                if not assistant_content:
                    if task.status == "FAILED" or (task.exit_code is not None and task.exit_code != 0):
                        err = task.stderr_buffer.strip() or "Task execution failed."
                        assistant_content = f"❌ Error: {err}"
                    elif task.status == "CANCELLED":
                        assistant_content = "⚠️ Task was cancelled by user."
                    elif task.steps:
                        tool_names = [s.get("tool_name") for s in task.steps if s.get("tool_name")]
                        if tool_names:
                            assistant_content = f"Executed tools: {', '.join(tool_names)}."

                if assistant_content:
                    cursor.execute("""
                    INSERT INTO conversation_messages (conversation_id, role, content, metadata_json, created_at)
                    VALUES (?, 'assistant', ?, ?, ?);
                    """, (
                        task.conversation_id,
                        assistant_content,
                        json.dumps({"usage": task.total_usage, "steps": len(task.steps)}),
                        task.completed_at
                    ))
                conn.commit()

            self._broadcast(task, {
                "type": "task_completed",
                "task_id": task.task_id,
                "conversation_id": task.conversation_id,
                "status": task.status,
                "exit_code": task.exit_code,
                "full_response": assistant_content or task.full_response,
                "usage": task.total_usage
            })

            log_audit(
                action=AuditAction.AGENT_TASK_FINISH if task.status == "COMPLETED" else AuditAction.AGENT_TASK_ERROR,
                status="SUCCESS" if task.status == "COMPLETED" else "FAILURE",
                resource=f"task:{task.task_id}",
                user_id=task.user_id,
                username=task.username,
                ip_address=ip_address,
                details={
                    "status": task.status,
                    "exit_code": task.exit_code,
                    "conversation_id": task.conversation_id,
                    "usage": task.total_usage
                }
            )

            # Webhook notification trigger
            try:
                if notifier_instance.should_notify_task(task):
                    status = "SUCCESS" if task.status == "COMPLETED" else "FAILED"
                    prompt = task.prompt or ""
                    is_swarm = any(cmd in prompt.lower() for cmd in ("/teamwork", "/boost", "/goal", "/plan"))
                    task_type = "Multi-Agent Swarm" if is_swarm else "Agent Task"
                    title = f"Antigravity {task_type}: {task.status}"

                    clean_res = (assistant_content or task.full_response or "").strip()
                    if len(clean_res) > 600:
                        clean_res = clean_res[:600] + "..."

                    duration_str = f"{task.duration_seconds:.1f}s" if task.duration_seconds else "N/A"
                    msg = (
                        f"Task: {task_type}\n"
                        f"Status: {task.status} (Duration: {duration_str})\n"
                        f"Prompt: {prompt[:140]}...\n\n"
                        f"Outcome:\n{clean_res or 'Completed.'}"
                    )
                    notifier_instance.notify(
                        title=title,
                        message=msg,
                        event_type=status,
                        metadata={
                            "task_id": task.task_id,
                            "conversation_id": task.conversation_id,
                            "status": task.status,
                            "project": task.project,
                            "duration": duration_str
                        }
                    )
            except Exception as notify_err:
                logger.error("Failed to trigger webhook notification for task %s: %s", task.task_id, notify_err)

            # Trigger callbacks (such as notifications)
            for cb in self.on_task_finished_callbacks:
                try:
                    cb(task)
                except Exception as cb_err:
                    logger.error("Task finished callback error: %s", cb_err)

    def _handle_stream_event(self, task: ActiveTask, data: Dict[str, Any]):
        """Parses Antigravity stream-json event and dispatches to listeners."""
        event_type = data.get("event")
        
        # Track agy's internal conversation ID without overwriting OpenClaw's session conversation ID
        agy_cid = data.get("conversation_id")
        if not agy_cid and "init" in data:
            agy_cid = data["init"].get("conversation_id")
        elif not agy_cid and "step_update" in data:
            agy_cid = data["step_update"].get("conversation_id")
        elif not agy_cid and "result" in data:
            agy_cid = data["result"].get("conversation_id")
        if agy_cid:
            task.agy_conversation_id = agy_cid

        if event_type == "init":
            init_payload = data.get("init", {})
            self._broadcast(task, {
                "type": "agent_init",
                "task_id": task.task_id,
                "conversation_id": task.conversation_id,
                "tools": init_payload.get("tools", []),
                "permission_mode": init_payload.get("permission_mode")
            })

        elif event_type == "step_update":
            step = data.get("step_update", {})
            step_type = step.get("step_type")
            state = step.get("state")
            
            task.steps.append(step)

            if step_type == "agent_response":
                text_delta = step.get("text_delta", "")
                if text_delta:
                    task.full_response += text_delta
                
                self._broadcast(task, {
                    "type": "text_delta",
                    "task_id": task.task_id,
                    "conversation_id": task.conversation_id,
                    "step_index": step.get("step_index"),
                    "state": state,
                    "text_delta": text_delta,
                    "usage": step.get("usage")
                })

            elif step_type == "tool":
                self._broadcast(task, {
                    "type": "tool_call",
                    "task_id": task.task_id,
                    "conversation_id": task.conversation_id,
                    "step_index": step.get("step_index"),
                    "state": state,
                    "tool_name": step.get("tool_name"),
                    "tool_info": step.get("tool_info"),
                    "duration_seconds": step.get("duration_seconds")
                })
            elif step_type == "subagent":
                self._broadcast(task, {
                    "type": "subagent_event",
                    "task_id": task.task_id,
                    "conversation_id": task.conversation_id,
                    "step_index": step.get("step_index"),
                    "state": state,
                    "tool_name": step.get("tool_name"),
                    "subagent_info": step.get("subagent_info"),
                    "duration_seconds": step.get("duration_seconds")
                })
            else:
                self._broadcast(task, {
                    "type": "step_raw",
                    "task_id": task.task_id,
                    "data": step
                })

        elif event_type == "result":
            res = data.get("result", {})
            task.total_usage = res.get("usage", {})
            task.duration_seconds = float(res.get("duration_seconds") or 0.0)
            final_res = res.get("response", "")
            if final_res and (not task.full_response or len(final_res) > len(task.full_response)):
                task.full_response = final_res

            self._broadcast(task, {
                "type": "agent_result",
                "task_id": task.task_id,
                "conversation_id": task.conversation_id,
                "status": res.get("status"),
                "duration_seconds": res.get("duration_seconds"),
                "usage": task.total_usage
            })

    def _broadcast(self, task: ActiveTask, message: Dict[str, Any]):
        for listener in list(task.listeners):
            try:
                listener(message)
            except Exception as e:
                logger.error("Error broadcasting to listener: %s", e)

    def subscribe(self, task_id: str, listener: Callable[[Dict[str, Any]], None]):
        if task_id in self.active_tasks:
            self.active_tasks[task_id].listeners.add(listener)

    def unsubscribe(self, task_id: str, listener: Callable[[Dict[str, Any]], None]):
        if task_id in self.active_tasks:
            self.active_tasks[task_id].listeners.discard(listener)

    async def cancel_task(self, task_id: str, user_id: Optional[int] = None, username: Optional[str] = None, ip_address: Optional[str] = None) -> bool:
        """Sends SIGINT / SIGTERM to abort a running task."""
        if task_id not in self.active_tasks:
            return False
            
        task = self.active_tasks[task_id]
        if task.status != "RUNNING" or not task.process:
            return False
            
        task.status = "CANCELLED"
        try:
            task.process.send_signal(signal.SIGINT)
            await asyncio.sleep(1.0)
            if task.process.returncode is None:
                task.process.terminate()
                await asyncio.sleep(1.0)
                if task.process.returncode is None:
                    task.process.kill()
        except Exception as e:
            logger.error("Error cancelling task %s: %s", task_id, e)

        log_audit(
            action=AuditAction.AGENT_TASK_CANCEL,
            status="SUCCESS",
            resource=f"task:{task_id}",
            user_id=user_id,
            username=username,
            ip_address=ip_address
        )
        return True

    async def check_auth_status(self) -> Dict[str, Any]:
        """Checks if agy binary is currently authenticated with Google."""
        try:
            proc = await asyncio.create_subprocess_exec(
                AGY_BIN_PATH,
                "models",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            out_text = (stdout + stderr).decode("utf-8", errors="replace")
            is_auth = (proc.returncode == 0) and ("Error: Please sign in" not in out_text) and ("You are not logged into Antigravity" not in out_text)
            return {
                "authenticated": is_auth,
                "output": out_text[:300]
            }
        except Exception as e:
            return {"authenticated": False, "error": str(e)}

    async def submit_auth_code(self, identifier: str, code: str) -> bool:
        """Submits an OAuth authorization code to a running agy process waiting for auth."""
        clean_code = code.strip()
        if not clean_code:
            return False

        target_task = None
        for t in self.active_tasks.values():
            if t.task_id == identifier or t.conversation_id == identifier:
                if t.status == "RUNNING":
                    target_task = t
                    break

        if not target_task:
            for t in reversed(list(self.active_tasks.values())):
                if t.status == "RUNNING" and t.auth_required:
                    target_task = t
                    break

        if not target_task:
            logger.warning("No running task found waiting for auth code (identifier: %s)", identifier)
            return False

        # If process was spawned with PTY:
        if target_task.pty_master_fd is not None:
            try:
                os.write(target_task.pty_master_fd, (clean_code + "\n").encode("utf-8"))
                logger.info("Submitted auth code via PTY to agy task %s", target_task.task_id)
                return True
            except Exception as e:
                logger.error("Error writing auth code to PTY: %s", e)
                return False

        # Otherwise via stdin pipe:
        if target_task.process and target_task.process.stdin:
            try:
                target_task.process.stdin.write(f"{clean_code}\n".encode("utf-8"))
                try:
                    json_payload = json.dumps({"event": "auth_code", "authCode": clean_code, "code": clean_code}) + "\n"
                    target_task.process.stdin.write(json_payload.encode("utf-8"))
                except Exception:
                    pass
                await target_task.process.stdin.drain()
                logger.info("Submitted auth code via stdin to agy task %s", target_task.task_id)
                return True
            except Exception as e:
                logger.error("Failed to write auth code to stdin: %s", e)
                return False

        return False

    async def _execute_pty_auth_process(self, task: ActiveTask, cmd: List[str], cwd: str, ip_address: Optional[str]):
        """Runs agy inside a pseudo-terminal (PTY) to satisfy controlling terminal check for OAuth."""
        import pty
        master, slave = pty.openpty()
        task.pty_master_fd = master

        try:
            logger.info("Executing agy auth in PTY: %s (cwd=%s)", " ".join(cmd), cwd)
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdin=slave,
                stdout=slave,
                stderr=slave,
                close_fds=True
            )
            task.process = process
            os.close(slave)  # Close child end in parent

            loop = asyncio.get_running_loop()

            def _read_from_pty():
                try:
                    data = os.read(master, 1024)
                    if data:
                        text = data.decode("utf-8", errors="replace")
                        self._check_for_auth_prompt(task, text)
                        self._broadcast(task, {
                            "type": "cli_output",
                            "task_id": task.task_id,
                            "text": text
                        })
                except OSError:
                    pass

            loop.add_reader(master, _read_from_pty)
            await process.wait()
            task.exit_code = process.returncode

            try:
                loop.remove_reader(master)
            except Exception:
                pass

            if task.exit_code == 0:
                task.status = "COMPLETED"
                logger.info("Antigravity OAuth process exited successfully.")
            else:
                task.status = "FAILED"

        except Exception as e:
            logger.error("Error in PTY auth execution: %s", e)
            task.status = "FAILED"
        finally:
            if task.pty_master_fd is not None:
                try:
                    os.close(task.pty_master_fd)
                except Exception:
                    pass
                task.pty_master_fd = None

    async def start_auth_flow(self, user_id: Optional[int] = None, username: Optional[str] = None, ip_address: Optional[str] = None) -> Dict[str, Any]:
        """Launches an agy process with PTY to trigger Google OAuth and returns the generated URL."""
        status = await self.check_auth_status()
        if status.get("authenticated"):
            return {"authenticated": True, "message": "Antigravity CLI is already authenticated."}

        task_id = str(uuid.uuid4())
        conv_id = f"auth-{task_id[:8]}"
        task = ActiveTask(task_id, conv_id, "Sign in to Antigravity CLI", user_id, username)
        self.active_tasks[task_id] = task

        cmd = [AGY_BIN_PATH, "-p", "Authentication probe"]
        cwd = str(DEFAULT_WORKSPACE)

        auth_event = asyncio.Event()

        def _on_evt(evt):
            if evt.get("type") == "antigravity_auth_required":
                auth_event.set()

        self.subscribe(task_id, _on_evt)
        asyncio.create_task(self._execute_pty_auth_process(task, cmd, cwd, ip_address))

        try:
            await asyncio.wait_for(auth_event.wait(), timeout=10.0)
            return {
                "authenticated": False,
                "task_id": task_id,
                "conversation_id": conv_id,
                "auth_url": task.auth_url
            }
        except asyncio.TimeoutError:
            return {
                "authenticated": False,
                "task_id": task_id,
                "auth_url": task.auth_url,
                "message": "Waiting for OAuth URL timed out. Please check logs."
            }

# Global singleton runner
runner_instance = AntigravityRunner()

