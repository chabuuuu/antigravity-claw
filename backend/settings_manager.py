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

from backend.config import AGY_BIN_PATH, DEFAULT_WORKSPACE
from backend.audit import log_audit, AuditAction

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
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            return proc.returncode, stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace")
        except Exception as e:
            logger.error("Failed to execute agy subcommand %s: %s", args, e)
            return 1, "", str(e)

    async def get_models(self) -> List[Dict[str, str]]:
        """
        Retrieves available models by running `agy models` or falls back to known defaults.
        """
        code, out, err = await self._run_agy_subcommand(["models"])
        models = []
        if code == 0 and out.strip():
            for line in out.splitlines():
                line = re.sub(r"^[⠋⠙⠹⠸⠼⠴⠦⠧⠇]\s+Fetching available models\.\.\.", "", line).strip()
                if not line or "Fetching available models" in line:
                    continue
                parts = re.split(r"\s{2,}", line, maxsplit=1)
                if len(parts) == 2:
                    models.append({"id": parts[0].strip(), "name": parts[1].strip()})
                elif len(parts) == 1 and parts[0]:
                    models.append({"id": parts[0].strip(), "name": parts[0].strip()})
                    
        if not models:
            models = [
                {"id": "gemini-4-argon-medium", "name": "Gemini 4 Argon (Medium)"},
                {"id": "gemini-4-argon-high", "name": "Gemini 4 Argon (High)"},
                {"id": "gemini-4-argon-low", "name": "Gemini 4 Argon (Low)"},
                {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)"},
                {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium)"},
                {"id": "gemini-3.8-flash-low", "name": "Gemini 3.8 Flash (Low)"},
                {"id": "claude-opus-5-5-high", "name": "Claude Opus 5.5 (High)"},
                {"id": "claude-sonnet-5-5-high", "name": "Claude Sonnet 5.5 (High)"},
                {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium)"}
            ]
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

    async def modify_mcp(self, action: str, name: str, mcp_type: str = "stdio", command: str = "") -> Tuple[bool, str]:
        """Performs add, remove, enable, disable on MCP servers."""
        if action == "add":
            code, out, err = await self._run_agy_subcommand(["mcp", "add", name, "--type", mcp_type, "--command", command])
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
        """Parses `agy plugins list`."""
        code, out, err = await self._run_agy_subcommand(["plugins", "list"])
        plugins = []
        if code == 0 and out.strip():
            current_plugin = None
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("- "):
                    # e.g. - android-cli-plugin (enabled, 1.0.16625370)
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

settings_manager_instance = SettingsManager()

