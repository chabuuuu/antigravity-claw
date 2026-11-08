"""
Antigravity Projects Manager
Handles native Antigravity CLI projects, workspace directory mappings,
active project contexts, and project lifecycle management.
"""

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime

from backend.database import get_db_connection

logger = logging.getLogger("openclaw.projects_manager")

class ProjectsManager:
    def __init__(self, gemini_dir: Optional[Path] = None):
        self.gemini_dir = gemini_dir or (Path.home() / ".gemini")
        self.config_projects_dir = self.gemini_dir / "config" / "projects"
        self.projects_json_path = self.gemini_dir / "projects.json"
        self.cache_dir = self.gemini_dir / "antigravity-cli" / "cache"
        self.cache_projects_json_path = self.cache_dir / "projects.json"
        self.default_project_id_path = self.cache_dir / "default_project_id.txt"
        self.active_project_path = self.gemini_dir / "active_project.json"

        # Ensure directory structures exist
        self.config_projects_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self._ensure_default_project()

    def _ensure_default_project(self):
        """Ensures at least default-cli-project exists."""
        default_file = self.config_projects_dir / "default-cli-project.json"
        if not default_file.exists():
            try:
                data = {
                    "id": "default-cli-project",
                    "name": "CLI Project",
                    "projectResources": {
                        "resources": []
                    },
                    "settings": {},
                    "isWorkspaceOnly": False
                }
                with open(default_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
            except Exception as e:
                logger.warning("Could not create default-cli-project.json: %s", e)

        if not self.default_project_id_path.exists():
            try:
                with open(self.default_project_id_path, "w", encoding="utf-8") as f:
                    f.write("default-cli-project")
            except Exception as e:
                logger.warning("Could not write default_project_id.txt: %s", e)

    def get_default_project_id(self) -> str:
        if self.default_project_id_path.exists():
            try:
                with open(self.default_project_id_path, "r", encoding="utf-8") as f:
                    val = f.read().strip()
                    if val:
                        return val
            except Exception:
                pass
        return "default-cli-project"

    def set_default_project_id(self, project_id: str):
        try:
            with open(self.default_project_id_path, "w", encoding="utf-8") as f:
                f.write(project_id)
        except Exception as e:
            logger.error("Failed to write default_project_id: %s", e)

    def get_active_project(self) -> Dict[str, Any]:
        """Returns the currently active project details."""
        active_id = None
        if self.active_project_path.exists():
            try:
                with open(self.active_project_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    active_id = data.get("active_id")
            except Exception:
                pass

        if not active_id:
            active_id = self.get_default_project_id()

        proj = self.get_project(active_id)
        if proj:
            return proj
        
        # Fallback to first available or default
        all_projs = self.list_projects()
        if all_projs:
            return all_projs[0]

        return {
            "id": "default-cli-project",
            "name": "CLI Project",
            "path": "",
            "is_default": True,
            "is_active": True,
            "tasks_count": 0,
            "conversations_count": 0
        }

    def set_active_project(self, project_id_or_name: str) -> Optional[Dict[str, Any]]:
        """Sets the active project by ID or Name."""
        target = self.get_project(project_id_or_name)
        if not target:
            # Look up by name
            for p in self.list_projects():
                if p["name"].lower() == project_id_or_name.lower():
                    target = p
                    break

        if not target:
            return None

        try:
            with open(self.active_project_path, "w", encoding="utf-8") as f:
                json.dump({"active_id": target["id"], "updated_at": datetime.utcnow().isoformat()}, f, indent=2)
        except Exception as e:
            logger.error("Failed to save active project: %s", e)

        target["is_active"] = True
        return target

    def get_project(self, project_id_or_name: str) -> Optional[Dict[str, Any]]:
        """Finds a project by ID or exact Name."""
        for p in self.list_projects():
            if p["id"] == project_id_or_name or p["name"] == project_id_or_name:
                return p
        return None

    def list_projects(self) -> List[Dict[str, Any]]:
        """
        Lists all projects from config/projects/*.json, enriched with
        directory mappings and DB execution statistics.
        """
        default_id = self.get_default_project_id()
        active_info = {}
        if self.active_project_path.exists():
            try:
                with open(self.active_project_path, "r", encoding="utf-8") as f:
                    active_info = json.load(f)
            except Exception:
                pass
        active_id = active_info.get("active_id") or default_id

        # 1. Fetch DB stats per project
        db_stats: Dict[str, Dict[str, Any]] = {}
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT 
                        COALESCE(project, 'Default') as proj,
                        COUNT(task_id) as tasks_cnt,
                        MAX(created_at) as last_act
                    FROM tasks
                    GROUP BY COALESCE(project, 'Default');
                """)
                for row in cursor.fetchall():
                    key = str(row["proj"]).strip()
                    db_stats[key] = {
                        "tasks_count": row["tasks_cnt"] or 0,
                        "last_activity": row["last_act"] or ""
                    }

                cursor.execute("""
                    SELECT 
                        COALESCE(project, 'Default') as proj,
                        COUNT(conversation_id) as convs_cnt
                    FROM conversations
                    GROUP BY COALESCE(project, 'Default');
                """)
                for row in cursor.fetchall():
                    key = str(row["proj"]).strip()
                    if key not in db_stats:
                        db_stats[key] = {"tasks_count": 0, "last_activity": ""}
                    db_stats[key]["conversations_count"] = row["convs_cnt"] or 0
        except Exception as e:
            logger.warning("Failed to query DB project stats: %s", e)

        # 2. Read directory mappings from projects.json
        dir_to_name: Dict[str, str] = {}
        if self.projects_json_path.exists():
            try:
                with open(self.projects_json_path, "r", encoding="utf-8") as f:
                    d = json.load(f)
                    dir_to_name = d.get("projects", {})
            except Exception:
                pass

        # 3. Read config/projects/*.json files
        projects_map: Dict[str, Dict[str, Any]] = {}

        if self.config_projects_dir.exists():
            for f in self.config_projects_dir.glob("*.json"):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        raw = json.load(fp)
                        pid = raw.get("id") or f.stem
                        name = raw.get("name") or pid
                        
                        # Extract folderUri
                        path = ""
                        res = raw.get("projectResources", {}).get("resources", [])
                        if isinstance(res, list) and res:
                            uri = res[0].get("folderUri", "")
                            if uri.startswith("file://"):
                                path = uri[len("file://"):]
                            else:
                                path = uri

                        # If path not in json, check dir_to_name
                        if not path:
                            for d_path, d_name in dir_to_name.items():
                                if d_name == name or d_path.endswith(f"/{name}"):
                                    path = d_path
                                    break

                        # Pull stats
                        stat = db_stats.get(name) or db_stats.get(pid) or {}

                        projects_map[pid] = {
                            "id": pid,
                            "name": name,
                            "path": path,
                            "is_default": (pid == default_id or name == "CLI Project"),
                            "is_active": (pid == active_id or name == active_id),
                            "tasks_count": stat.get("tasks_count", 0),
                            "conversations_count": stat.get("conversations_count", 0),
                            "last_activity": stat.get("last_activity", ""),
                            "settings": raw.get("settings", {})
                        }
                except Exception as e:
                    logger.warning("Error parsing project file %s: %s", f, e)

        # 4. Also check projects in projects.json that might not have a separate config file
        for d_path, d_name in dir_to_name.items():
            existing = any(p["name"] == d_name or p["path"] == d_path for p in projects_map.values())
            if not existing:
                pid = str(uuid.uuid4())
                stat = db_stats.get(d_name) or {}
                projects_map[pid] = {
                    "id": pid,
                    "name": d_name,
                    "path": d_path,
                    "is_default": False,
                    "is_active": (d_name == active_id),
                    "tasks_count": stat.get("tasks_count", 0),
                    "conversations_count": stat.get("conversations_count", 0),
                    "last_activity": stat.get("last_activity", ""),
                    "settings": {}
                }

        # 5. Convert to sorted list
        res_list = list(projects_map.values())
        res_list.sort(key=lambda x: (not x["is_active"], not x["is_default"], -(x["tasks_count"] or 0), x["name"].lower()))
        return res_list

    def create_project(
        self,
        name: str,
        path: str = "",
        is_default: bool = False,
        set_active: bool = True
    ) -> Dict[str, Any]:
        """Creates a new Antigravity project configuration."""
        clean_name = (name or "").strip()
        if not clean_name:
            raise ValueError("Project name is required.")

        clean_path = (path or "").strip()
        if clean_path and clean_path.startswith("file://"):
            clean_path = clean_path[len("file://"):]

        project_id = str(uuid.uuid4())

        # Config json data
        config_data = {
            "id": project_id,
            "name": clean_name,
            "projectResources": {
                "resources": [
                    {"folderUri": f"file://{clean_path}"} if clean_path else {}
                ]
            },
            "permissionGrants": {
                "v2Migrated": True
            },
            "settings": {},
            "isWorkspaceOnly": False
        }

        # 1. Write ~/.gemini/config/projects/<id>.json
        conf_file = self.config_projects_dir / f"{project_id}.json"
        with open(conf_file, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2)

        # 2. Update ~/.gemini/projects.json if path provided
        if clean_path:
            self._update_projects_json_mapping(clean_path, clean_name)
            self._update_cache_projects_json_mapping(clean_path, project_id)

        # 3. Update default project
        if is_default:
            self.set_default_project_id(project_id)

        # 4. Update active project
        if set_active:
            self.set_active_project(project_id)

        logger.info("Created Antigravity project %s (%s) at path %s", clean_name, project_id, clean_path)

        return {
            "id": project_id,
            "name": clean_name,
            "path": clean_path,
            "is_default": is_default,
            "is_active": set_active,
            "tasks_count": 0,
            "conversations_count": 0,
            "last_activity": datetime.utcnow().isoformat()
        }

    def update_project(
        self,
        project_id: str,
        name: Optional[str] = None,
        path: Optional[str] = None,
        is_default: Optional[bool] = None,
        set_active: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Updates an existing project's metadata, directory path, or defaults."""
        conf_file = self.config_projects_dir / f"{project_id}.json"
        
        # If file doesn't exist by id, check if it's default-cli-project
        if not conf_file.exists() and project_id == "default-cli-project":
            self._ensure_default_project()

        raw = {}
        if conf_file.exists():
            with open(conf_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
        else:
            raw = {
                "id": project_id,
                "name": name or project_id,
                "projectResources": {"resources": []},
                "settings": {},
                "isWorkspaceOnly": False
            }

        old_name = raw.get("name", project_id)
        if name and name.strip():
            raw["name"] = name.strip()

        if path is not None:
            clean_path = path.strip()
            if clean_path.startswith("file://"):
                clean_path = clean_path[len("file://"):]
            raw["projectResources"] = {
                "resources": [{"folderUri": f"file://{clean_path}"}] if clean_path else []
            }
            if clean_path:
                self._update_projects_json_mapping(clean_path, raw["name"])
                self._update_cache_projects_json_mapping(clean_path, project_id)

        with open(conf_file, "w", encoding="utf-8") as f:
            json.dump(raw, f, indent=2)

        if is_default:
            self.set_default_project_id(project_id)

        if set_active:
            self.set_active_project(project_id)

        logger.info("Updated project %s (%s)", raw["name"], project_id)
        return self.get_project(project_id) or {
            "id": project_id,
            "name": raw["name"],
            "path": path or "",
            "is_default": bool(is_default),
            "is_active": bool(set_active)
        }

    def delete_project(self, project_id: str) -> bool:
        """Deletes a project file and cleans up mappings."""
        if project_id == "default-cli-project":
            raise ValueError("Cannot delete default CLI project.")

        conf_file = self.config_projects_dir / f"{project_id}.json"
        deleted = False
        if conf_file.exists():
            conf_file.unlink()
            deleted = True

        # Clean mappings in projects.json
        try:
            if self.projects_json_path.exists():
                with open(self.projects_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                projs = data.get("projects", {})
                new_projs = {k: v for k, v in projs.items() if v != project_id}
                if len(new_projs) != len(projs):
                    data["projects"] = new_projs
                    with open(self.projects_json_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning("Failed to clean projects.json for %s: %s", project_id, e)

        # Reset active project if deleted
        active = self.get_active_project()
        if active and active.get("id") == project_id:
            self.set_active_project("default-cli-project")

        return deleted

    def _update_projects_json_mapping(self, path: str, name: str):
        try:
            data = {"projects": {}}
            if self.projects_json_path.exists():
                with open(self.projects_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            data.setdefault("projects", {})[path] = name
            with open(self.projects_json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning("Could not update ~/.gemini/projects.json: %s", e)

    def _update_cache_projects_json_mapping(self, path: str, project_id: str):
        try:
            data = {}
            if self.cache_projects_json_path.exists():
                with open(self.cache_projects_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            data[path] = project_id
            with open(self.cache_projects_json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning("Could not update cache projects.json: %s", e)

# Global singleton instance
projects_manager_instance = ProjectsManager()
