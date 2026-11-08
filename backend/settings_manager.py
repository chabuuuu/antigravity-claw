"""
Antigravity Settings & Configuration Manager.
Exposes full configuration and control over Antigravity CLI:
- Models list discovery & selection
- Subagents listing & inspection
- MCP Server lifecycle (list, add, remove, enable, disable)
- Plugins lifecycle (list, install, uninstall, enable, disable)
- Custom Rules & Instructions (GEMINI.md, AGENTS.md)
- Raw config files (~/.gemini/settings.json, ~/.gemini/config/config.json)
"""

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from backend.config import AGY_BIN_PATH, DEFAULT_WORKSPACE
from backend.audit import log_audit, AuditAction
from backend.database import get_db_connection

logger = logging.getLogger("openclaw.settings_manager")

class SettingsManager:
    def __init__(self):
        self.home_dir = Path.home()
        self.gemini_dir = self.home_dir / ".gemini"
        self.settings_file = self.gemini_dir / "settings.json"
        self.config_file = self.gemini_dir / "config" / "config.json"

    async def _run_agy_subcommand(self, args: List[str]) -> Tuple[int, str, str]:
        """Runs an agy subcommand and returns (exit_code, stdout, stderr)."""
        cmd = [AGY_BIN_PATH] + args
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20.0)
            return proc.returncode, stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace")
        except Exception as e:
            logger.error("Failed to execute agy subcommand %s: %s", args, e)
            return 1, "", str(e)

    async def get_models(self) -> List[Dict[str, str]]:
        """
        Retrieves available models by running `agy models` or falls back to known defaults.
        Extracts base model families to match Antigravity CLI's interactive model switcher.
        """
        code, out, err = await self._run_agy_subcommand(["models"])
        models = []
        seen_base_ids = set()
        
        # Canonical base models matching Antigravity CLI interactive switcher
        canonical_base = [
            {"id": "gemini-4-argon", "name": "Gemini 4 Argon"},
            {"id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash"},
            {"id": "claude-opus-5-5", "name": "Claude Opus 5.5"},
            {"id": "claude-sonnet-5-5", "name": "Claude Sonnet 5.5"},
            {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium)"}
        ]

        if code == 0 and out.strip():
            for line in out.splitlines():
                line = re.sub(r"^[⠋⠙⠹⠸⠼⠴⠦⠧⠇]\s+Fetching available models\.\.\.", "", line).strip()
                if not line or "Fetching available models" in line:
                    continue
                # Split by tab or 2+ spaces
                parts = [p.strip() for p in re.split(r"\t+|\s{2,}", line) if p.strip()]
                if len(parts) >= 2:
                    raw_id = parts[0]
                    raw_name = parts[1]
                elif len(parts) == 1:
                    raw_id = parts[0]
                    raw_name = parts[0]
                else:
                    continue

                # Strip baked-in effort suffix to extract clean base model ID & display name
                base_id = re.sub(r"-(low|medium|high|xhigh|max)$", "", raw_id)
                base_name = re.sub(r"\s*\((Low|Medium|High|X-High|Max)\)\s*$", "", raw_name, flags=re.IGNORECASE)

                if "gpt-oss" in raw_id:
                    base_id = "gpt-oss-120b-medium"
                    base_name = "GPT-OSS 120B (Medium)"

                if base_id not in seen_base_ids:
                    seen_base_ids.add(base_id)
                    models.append({"id": base_id, "name": base_name})

        if not models:
            models = canonical_base

        return models

    async def get_agents(self) -> List[Dict[str, str]]:
        """Retrieves available agents by running `agy agents`."""
        code, out, err = await self._run_agy_subcommand(["agents"])
        agents = []
        if code == 0 and out.strip():
            for line in out.splitlines():
                line = line.strip()
                if not line or line.startswith("Available"):
                    continue
                parts = re.split(r"\s{2,}", line, maxsplit=1)
                agents.append({
                    "name": parts[0],
                    "description": parts[1] if len(parts) > 1 else ""
                })
        if not agents:
            agents = [
                {"name": "default", "description": "Standard autonomous developer agent"},
                {"name": "research", "description": "Codebase & documentation research agent"},
                {"name": "self", "description": "Subagent inheriting parent agent configuration"}
            ]
        return agents

    async def get_mcp_servers(self) -> List[Dict[str, str]]:
        """Parses `agy mcp list`."""
        code, out, err = await self._run_agy_subcommand(["mcp", "list"])
        servers = []
        if code == 0 and out.strip():
            lines = out.strip().splitlines()
            for line in lines:
                if line.startswith("NAME") or not line.strip():
                    continue
                parts = re.split(r"\s{2,}", line.strip())
                if len(parts) >= 4:
                    servers.append({
                        "name": parts[0],
                        "type": parts[1],
                        "status": parts[2],
                        "command": parts[3]
                    })
                elif len(parts) >= 1:
                    servers.append({
                        "name": parts[0],
                        "type": parts[1] if len(parts) > 1 else "stdio",
                        "status": parts[2] if len(parts) > 2 else "enabled",
                        "command": parts[3] if len(parts) > 3 else ""
                    })
        return servers

    async def modify_mcp(
        self,
        action: str,
        name: str,
        mcp_type: str = "stdio",
        command: str = "",
        args: Optional[List[str]] = None,
        env_vars: Optional[List[str]] = None,
        headers: Optional[List[str]] = None
    ) -> Tuple[bool, str]:
        """Performs add, remove, enable, disable on MCP servers."""
        if action == "add":
            cmd = ["mcp", "add"]
            if mcp_type:
                cmd.extend(["--type", mcp_type])
            if env_vars:
                for ev in env_vars:
                    if ev and ev.strip():
                        cmd.extend(["--env", ev.strip()])
            if headers:
                for h in headers:
                    if h and h.strip():
                        cmd.extend(["--header", h.strip()])
            cmd.append(name)
            cmd.append(command)
            if args:
                cmd.extend([a for a in args if a])
            code, out, err = await self._run_agy_subcommand(cmd)
        elif action == "remove":
            code, out, err = await self._run_agy_subcommand(["mcp", "remove", name])
        elif action == "enable":
            code, out, err = await self._run_agy_subcommand(["mcp", "enable", name])
        elif action == "disable":
            code, out, err = await self._run_agy_subcommand(["mcp", "disable", name])
        else:
            return False, f"Unknown MCP action: {action}"
            
        success = (code == 0)
        msg = out.strip() if success else (err.strip() or out.strip())
        return success, msg

    async def get_plugins(self) -> List[Dict[str, Any]]:
        """Parses `agy plugins list --json` or falls back to text parsing."""
        code, out, err = await self._run_agy_subcommand(["plugins", "list", "--json"])
        if code == 0 and out.strip():
            try:
                data = json.loads(out)
                if isinstance(data, list):
                    plugins = []
                    for item in data:
                        skills = item.get("skills", [])
                        plugins.append({
                            "name": item.get("name", "unknown"),
                            "status": "enabled" if item.get("enabled", True) else "disabled",
                            "version": item.get("version", "latest"),
                            "source": item.get("source", ""),
                            "path": item.get("path", ""),
                            "components": ", ".join(skills) if isinstance(skills, list) else str(skills)
                        })
                    return plugins
            except Exception as e:
                logger.debug("Failed to parse plugins JSON: %s", e)

        # Fallback to plain text parsing
        code, out, err = await self._run_agy_subcommand(["plugins", "list"])
        plugins = []
        if code == 0 and out.strip():
            current_plugin = None
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("- "):
                    m = re.match(r"-\s+([^\s]+)\s+\(([^,]+),\s*([^)]+)\)", line)
                    if m:
                        current_plugin = {
                            "name": m.group(1),
                            "status": m.group(2).strip(),
                            "version": m.group(3).strip(),
                            "source": "",
                            "components": ""
                        }
                        plugins.append(current_plugin)
                    else:
                        parts = line[2:].split()
                        current_plugin = {
                            "name": parts[0] if parts else line[2:],
                            "status": "enabled",
                            "version": "latest",
                            "source": "",
                            "components": ""
                        }
                        plugins.append(current_plugin)
                elif current_plugin and line.startswith("Source:"):
                    current_plugin["source"] = line.replace("Source:", "").strip()
                elif current_plugin and line.startswith("Components:"):
                    current_plugin["components"] = line.replace("Components:", "").strip()
        return plugins

    async def modify_plugin(self, action: str, name: str) -> Tuple[bool, str]:
        """Toggles or installs/uninstalls plugins via agy."""
        if action in ("enable", "disable", "install", "uninstall"):
            code, out, err = await self._run_agy_subcommand(["plugin", action, name])
            success = (code == 0)
            return success, out.strip() if success else (err.strip() or out.strip())
        return False, f"Unknown plugin action: {action}"

    async def import_plugin(self, source: str) -> Tuple[bool, str]:
        """Imports plugins from gemini or claude via `agy plugin import <source>`."""
        code, out, err = await self._run_agy_subcommand(["plugin", "import", source])
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    async def validate_plugin(self, path: str = ".", strict: bool = False) -> Tuple[bool, str]:
        """Validates a plugin manifest and files via `agy plugin validate`."""
        cmd = ["plugin", "validate"]
        if path:
            cmd.append(path)
        if strict:
            cmd.append("--strict")
        code, out, err = await self._run_agy_subcommand(cmd)
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    async def link_plugin(self, marketplace: str, target: str) -> Tuple[bool, str]:
        """Generates marketplace link via `agy plugin link <mp> <target>`."""
        code, out, err = await self._run_agy_subcommand(["plugin", "link", marketplace, target])
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    async def get_remote_control_status(self) -> Dict[str, Any]:
        """Retrieves daemon status via `agy remote-control status`."""
        code, out, err = await self._run_agy_subcommand(["remote-control", "status"])
        full_text = out.strip() if code == 0 else (err.strip() or out.strip())
        is_active = "active" in full_text.lower() and "inactive" not in full_text.lower()
        instance_name = ""
        for line in full_text.splitlines():
            if "instance name:" in line.lower():
                instance_name = line.split(":", 1)[1].strip()
        return {
            "status": "active" if is_active else "inactive",
            "instance_name": instance_name,
            "raw_output": full_text
        }

    async def start_remote_control(self, name: Optional[str] = None, session: bool = False) -> Tuple[bool, str]:
        """Starts the remote control daemon via `agy remote-control start`."""
        cmd = ["remote-control", "start"]
        if name and name.strip():
            cmd.extend(["--name", name.strip()])
        if session:
            cmd.append("--session")
        code, out, err = await self._run_agy_subcommand(cmd)
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    async def stop_remote_control(self) -> Tuple[bool, str]:
        """Stops the remote control daemon via `agy remote-control stop`."""
        code, out, err = await self._run_agy_subcommand(["remote-control", "stop"])
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    async def get_changelog(self) -> Tuple[bool, str]:
        """Returns changelog via `agy changelog`."""
        code, out, err = await self._run_agy_subcommand(["changelog"])
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    async def update_cli(self) -> Tuple[bool, str]:
        """Updates CLI binary via `agy update`."""
        code, out, err = await self._run_agy_subcommand(["update"])
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    async def run_install(self, dir_path: Optional[str] = None) -> Tuple[bool, str]:
        """Configures environment paths and shell settings via `agy install`."""
        cmd = ["install"]
        if dir_path:
            cmd.extend(["--dir", dir_path])
        code, out, err = await self._run_agy_subcommand(cmd)
        success = (code == 0)
        return success, out.strip() if success else (err.strip() or out.strip())

    def get_raw_settings(self) -> Dict[str, Any]:
        """Reads ~/.gemini/settings.json and ~/.gemini/config/config.json."""
        settings_data = {}
        config_data = {}
        if self.settings_file.exists():
            try:
                settings_data = json.loads(self.settings_file.read_text(encoding="utf-8"))
            except Exception as e:
                logger.error("Failed to read settings.json: %s", e)

        if self.config_file.exists():
            try:
                config_data = json.loads(self.config_file.read_text(encoding="utf-8"))
            except Exception as e:
                logger.error("Failed to read config.json: %s", e)

        return {
            "settings": settings_data,
            "config": config_data
        }

    def save_raw_settings(self, settings: Optional[Dict[str, Any]] = None, config: Optional[Dict[str, Any]] = None) -> Tuple[bool, str]:
        """Writes updated settings.json and config.json safely."""
        try:
            if settings is not None:
                self.settings_file.parent.mkdir(parents=True, exist_ok=True)
                self.settings_file.write_text(json.dumps(settings, indent=2), encoding="utf-8")
            if config is not None:
                self.config_file.parent.mkdir(parents=True, exist_ok=True)
                self.config_file.write_text(json.dumps(config, indent=2), encoding="utf-8")
            return True, "Settings saved successfully."
        except Exception as e:
            return False, str(e)

    def get_rules(self, workspace_path: Optional[str] = None) -> Dict[str, str]:
        """Reads GEMINI.md or AGENTS.md rules files."""
        ws = Path(workspace_path) if workspace_path else DEFAULT_WORKSPACE
        gemini_md = ws / "GEMINI.md"
        agents_md = ws / "AGENTS.md"
        
        return {
            "GEMINI.md": gemini_md.read_text(encoding="utf-8") if gemini_md.exists() else "",
            "AGENTS.md": agents_md.read_text(encoding="utf-8") if agents_md.exists() else ""
        }

    def save_rules(self, filename: str, content: str, workspace_path: Optional[str] = None) -> Tuple[bool, str]:
        """Saves GEMINI.md or AGENTS.md rules file."""
        if filename not in ("GEMINI.md", "AGENTS.md"):
            return False, "Invalid rules file name."
        ws = Path(workspace_path) if workspace_path else DEFAULT_WORKSPACE
        target = ws / filename
        try:
            target.write_text(content, encoding="utf-8")
            return True, f"Saved {filename} successfully."
        except Exception as e:
            return False, str(e)

    async def get_usage_and_quota(self) -> Dict[str, Any]:
        """
        Retrieves real-time model quota and usage breakdown from Antigravity CLI (/usage).
        Also extracts account email and aggregates task token consumption analytics.
        """
        # 1. Fetch account email from token or google_accounts.json
        account_email = "Not signed in"
        token_path = self.gemini_dir / "antigravity-cli" / "antigravity-oauth-token"
        if token_path.exists():
            try:
                tok_data = json.loads(token_path.read_text(encoding="utf-8"))
                if tok_data.get("id_token_email"):
                    account_email = tok_data["id_token_email"]
            except Exception:
                pass

        if account_email == "Not signed in":
            accounts_file = self.gemini_dir / "google_accounts.json"
            if accounts_file.exists():
                try:
                    acc_data = json.loads(accounts_file.read_text(encoding="utf-8"))
                    if acc_data.get("active"):
                        account_email = acc_data["active"]
                    elif acc_data.get("old") and len(acc_data["old"]) > 0:
                        account_email = acc_data["old"][0]
                except Exception:
                    pass

        # 2. Run agy -p "/usage" --output-format json
        code, out, err = await self._run_agy_subcommand(["-p", "/usage", "--output-format", "json"])
        groups = []
        policy_desc = ""
        raw_text = ""

        if code == 0 and out.strip():
            try:
                resp_json = json.loads(out)
                raw_text = resp_json.get("response", "")
                cmd_data = resp_json.get("command", {}).get("data", {})
                policy_desc = cmd_data.get("description", "")
                raw_groups = cmd_data.get("groups", [])
                
                now = datetime.now(timezone.utc)
                for g in raw_groups:
                    group_item = {
                        "name": g.get("name", "Unknown Group"),
                        "description": g.get("description", ""),
                        "buckets": []
                    }
                    for b in g.get("buckets", []):
                        frac = float(b.get("remaining_fraction", 1.0))
                        percent = round(frac * 100, 2)
                        reset_iso = b.get("reset_time", "")
                        
                        # Calculate human-readable countdown
                        countdown_str = "Quota available"
                        if frac < 1.0 and reset_iso:
                            try:
                                reset_dt = datetime.fromisoformat(reset_iso.replace("Z", "+00:00"))
                                diff = reset_dt - now
                                if diff.total_seconds() > 0:
                                    total_hours = int(diff.total_seconds() // 3600)
                                    mins = int((diff.total_seconds() % 3600) // 60)
                                    countdown_str = f"Refreshes in {total_hours}h {mins}m"
                                else:
                                    countdown_str = "Refreshed"
                            except Exception:
                                countdown_str = f"Resets at {reset_iso}"
                                
                        group_item["buckets"].append({
                            "id": b.get("id"),
                            "name": b.get("name"),
                            "description": b.get("description") or (countdown_str if frac < 1.0 else "Quota available"),
                            "window": b.get("window"),
                            "remaining_fraction": frac,
                            "remaining_percent": percent,
                            "reset_time": reset_iso,
                            "countdown": countdown_str
                        })
                    groups.append(group_item)
            except Exception as e:
                logger.error("Failed to parse /usage output: %s", e)

        # 3. Aggregate token analytics from SQLite
        token_analytics = {
            "total_tasks": 0,
            "total_tokens": 0,
            "prompt_tokens": 0,
            "output_tokens": 0,
            "thinking_tokens": 0,
            "recent_tasks": []
        }
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                SELECT task_id, title, status, prompt, completed_at
                FROM tasks ORDER BY id DESC LIMIT 20;
                """)
                rows = cursor.fetchall()
                token_analytics["total_tasks"] = len(rows)

                cursor.execute("""
                SELECT metadata_json FROM conversation_messages WHERE role = 'assistant' AND metadata_json IS NOT NULL;
                """)
                msg_rows = cursor.fetchall()
                for (meta_str,) in msg_rows:
                    if meta_str:
                        try:
                            meta = json.loads(meta_str)
                            usage = meta.get("usage", {})
                            token_analytics["prompt_tokens"] += usage.get("input_tokens", 0)
                            token_analytics["output_tokens"] += usage.get("output_tokens", 0)
                            token_analytics["thinking_tokens"] += usage.get("thinking_tokens", 0)
                            token_analytics["total_tokens"] += usage.get("total_tokens", 0)
                        except Exception:
                            pass
        except Exception as e:
            logger.error("Error aggregating token metrics: %s", e)

        return {
            "success": True,
            "account_email": account_email,
            "policy_description": policy_desc,
            "raw_response": raw_text,
            "groups": groups,
            "token_analytics": token_analytics
        }

settings_manager_instance = SettingsManager()

