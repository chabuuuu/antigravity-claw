"""
Workspace & File Manager Module for Antigravity OpenClaw.
Provides secure remote workspace navigation, file editing, creation, deletion,
upload, download, and Git status queries with strict path traversal defenses.
"""

import os
import shutil
import mimetypes
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from backend.config import DEFAULT_WORKSPACE
from backend.audit import log_audit, AuditAction

logger = logging.getLogger("openclaw.workspace_manager")

class WorkspaceManager:
    def __init__(self, root_dir: Optional[Path] = None):
        self.root_dir = (root_dir or DEFAULT_WORKSPACE).resolve()

    def _resolve_safe_path(self, relative_path: str) -> Optional[Path]:
        """
        Resolves a user-provided path relative to root_dir.
        Blocks path traversal attacks (e.g. ../../etc/passwd).
        """
        if not relative_path or relative_path.strip() in ("", ".", "/"):
            return self.root_dir
            
        clean_rel = relative_path.lstrip("/\\")
        target = (self.root_dir / clean_rel).resolve()
        
        try:
            # Check if target is inside self.root_dir
            target.relative_to(self.root_dir)
            return target
        except ValueError:
            logger.warning("Path traversal attempt detected: %s", relative_path)
            return None

    def list_directory(self, rel_path: str = "") -> Tuple[bool, Any]:
        """Lists files and folders inside the requested directory."""
        target = self._resolve_safe_path(rel_path)
        if not target:
            return False, "Access denied: Path is outside workspace."
        if not target.exists():
            return False, "Directory does not exist."
        if not target.is_dir():
            return False, "Path is not a directory."

        items = []
        try:
            for entry in os.scandir(target):
                try:
                    stat = entry.stat()
                    is_dir = entry.is_dir()
                    mime_type, _ = mimetypes.guess_type(entry.path)
                    
                    items.append({
                        "name": entry.name,
                        "rel_path": str(Path(entry.path).relative_to(self.root_dir)),
                        "is_dir": is_dir,
                        "size": stat.st_size if not is_dir else 0,
                        "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                        "mime_type": mime_type or ("inode/directory" if is_dir else "application/octet-stream")
                    })
                except Exception as item_err:
                    logger.debug("Error stating entry %s: %s", entry.name, item_err)
                    
            # Sort: directories first, then alphabetical
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            
            curr_rel = str(target.relative_to(self.root_dir))
            return True, {
                "current_path": "" if curr_rel == "." else curr_rel,
                "workspace_root": str(self.root_dir),
                "items": items
            }
        except Exception as e:
            logger.error("Failed to list directory %s: %s", target, e)
            return False, str(e)

    def read_file(self, rel_path: str, max_bytes: int = 5 * 1024 * 1024) -> Tuple[bool, Any]:
        """Reads content of a file within the workspace."""
        target = self._resolve_safe_path(rel_path)
        if not target:
            return False, "Access denied: Path is outside workspace."
        if not target.exists() or not target.is_file():
            return False, "File does not exist."

        stat = target.stat()
        if stat.st_size > max_bytes:
            return False, f"File is too large to display directly ({stat.st_size / (1024*1024):.2f} MB > {max_bytes / (1024*1024)} MB)."

        try:
            content = target.read_text(encoding="utf-8", errors="replace")
            mime_type, _ = mimetypes.guess_type(str(target))
            return True, {
                "rel_path": str(target.relative_to(self.root_dir)),
                "content": content,
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                "mime_type": mime_type or "text/plain"
            }
        except Exception as e:
            return False, str(e)

    def write_file(self, rel_path: str, content: str, user_id: Optional[int] = None, username: Optional[str] = None, ip_address: Optional[str] = None) -> Tuple[bool, str]:
        """Writes content to a file, creating parent directories and keeping backup."""
        target = self._resolve_safe_path(rel_path)
        if not target:
            return False, "Access denied: Path is outside workspace."

        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            # Create backup if file already exists
            if target.exists():
                backup_path = target.with_suffix(target.suffix + ".bak")
                shutil.copy2(target, backup_path)
                
            target.write_text(content, encoding="utf-8")
            
            log_audit(
                action=AuditAction.FILE_WRITE,
                status="SUCCESS",
                resource=str(target.relative_to(self.root_dir)),
                user_id=user_id,
                username=username,
                ip_address=ip_address,
                details={"size": len(content)}
            )
            return True, "File saved successfully."
        except Exception as e:
            logger.error("Failed to write file %s: %s", rel_path, e)
            return False, str(e)

    def delete_item(self, rel_path: str, user_id: Optional[int] = None, username: Optional[str] = None, ip_address: Optional[str] = None) -> Tuple[bool, str]:
        """Deletes a file or directory within the workspace."""
        target = self._resolve_safe_path(rel_path)
        if not target or target == self.root_dir:
            return False, "Access denied: Cannot delete root workspace."
        if not target.exists():
            return False, "Item does not exist."

        try:
            is_dir = target.is_dir()
            if is_dir:
                shutil.rmtree(target)
            else:
                target.unlink()
                
            log_audit(
                action=AuditAction.FILE_DELETE,
                status="SUCCESS",
                resource=str(target.relative_to(self.root_dir)),
                user_id=user_id,
                username=username,
                ip_address=ip_address,
                details={"is_directory": is_dir}
            )
            return True, "Item deleted successfully."
        except Exception as e:
            return False, str(e)

    def create_directory(self, rel_path: str, user_id: Optional[int] = None, username: Optional[str] = None, ip_address: Optional[str] = None) -> Tuple[bool, str]:
        """Creates a new directory inside workspace."""
        target = self._resolve_safe_path(rel_path)
        if not target:
            return False, "Access denied: Path is outside workspace."
            
        try:
            target.mkdir(parents=True, exist_ok=True)
            return True, "Directory created successfully."
        except Exception as e:
            return False, str(e)

    def get_git_status(self) -> Dict[str, Any]:
        """Checks git branch and modified files if root_dir is a git repository."""
        import subprocess
        git_dir = self.root_dir / ".git"
        if not git_dir.exists():
            return {"is_git": False}
            
        try:
            branch = subprocess.check_output(
                ["git", "branch", "--show-current"],
                cwd=str(self.root_dir),
                stderr=subprocess.DEVNULL
            ).decode("utf-8").strip()

            status_out = subprocess.check_output(
                ["git", "status", "--porcelain"],
                cwd=str(self.root_dir),
                stderr=subprocess.DEVNULL
            ).decode("utf-8").strip()

            changes = []
            if status_out:
                for line in status_out.splitlines():
                    if line.strip():
                        changes.append(line.strip())

            return {
                "is_git": True,
                "branch": branch or "HEAD detached",
                "modified_count": len(changes),
                "changes": changes[:50]
            }
        except Exception as e:
            return {"is_git": True, "error": str(e)}

    def get_git_diff(self) -> Dict[str, Any]:
        """Queries git diff and recent commit logs."""
        import subprocess
        git_dir = self.root_dir / ".git"
        if not git_dir.exists():
            return {"is_git": False, "diff": "", "log": ""}

        try:
            diff_out = subprocess.check_output(
                ["git", "diff"],
                cwd=str(self.root_dir),
                stderr=subprocess.DEVNULL
            ).decode("utf-8", errors="replace").strip()

            log_out = subprocess.check_output(
                ["git", "log", "-n", "5", "--oneline"],
                cwd=str(self.root_dir),
                stderr=subprocess.DEVNULL
            ).decode("utf-8", errors="replace").strip()

            return {
                "is_git": True,
                "diff": diff_out or "(No uncommitted differences)",
                "recent_commits": log_out.splitlines() if log_out else []
            }
        except Exception as e:
            return {"is_git": True, "error": str(e)}

    def save_uploaded_file(self, rel_dir: str, filename: str, content_bytes: bytes, user_id: Optional[int] = None, username: Optional[str] = None, ip_address: Optional[str] = None) -> Tuple[bool, str]:
        """Saves an uploaded file safely within the workspace."""
        clean_filename = Path(filename).name
        target_dir = self._resolve_safe_path(rel_dir)
        if not target_dir or not target_dir.is_dir():
            return False, "Target directory invalid or outside workspace."

        target_file = target_dir / clean_filename
        try:
            target_file.write_bytes(content_bytes)
            log_audit(
                action=AuditAction.FILE_UPLOAD,
                status="SUCCESS",
                resource=str(target_file.relative_to(self.root_dir)),
                user_id=user_id,
                username=username,
                ip_address=ip_address,
                details={"size_bytes": len(content_bytes)}
            )
            return True, "File uploaded successfully."
        except Exception as e:
            return False, str(e)

    def get_safe_file_path_for_download(self, rel_path: str) -> Optional[Path]:
        """Validates and returns absolute Path for safe download."""
        target = self._resolve_safe_path(rel_path)
        if target and target.is_file():
            return target
        return None

workspace_manager_instance = WorkspaceManager()


