"""
Analytics & Project Reporting Module for Antigravity OpenClaw.
Aggregates token consumption metrics, thinking ratios, project completion progress,
task velocity, and model distribution across SQLite database tables.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from backend.database import get_db_connection

logger = logging.getLogger("openclaw.analytics")

class AnalyticsManager:
    def __init__(self):
        pass

    def _ensure_schema(self, conn: sqlite3.Connection):
        """Ensures all necessary analytics columns exist on tasks and conversations."""
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(tasks);")
            task_cols = [r["name"] for r in cursor.fetchall()]
            for col, ctype, default in [
                ("project", "TEXT", "'Default'"),
                ("duration_seconds", "REAL", "0.0"),
                ("input_tokens", "INTEGER", "0"),
                ("output_tokens", "INTEGER", "0"),
                ("thinking_tokens", "INTEGER", "0"),
                ("total_tokens", "INTEGER", "0"),
            ]:
                if col not in task_cols:
                    cursor.execute(f"ALTER TABLE tasks ADD COLUMN {col} {ctype} DEFAULT {default};")
            
            cursor.execute("PRAGMA table_info(conversations);")
            conv_cols = [r["name"] for r in cursor.fetchall()]
            if "project" not in conv_cols:
                cursor.execute("ALTER TABLE conversations ADD COLUMN project TEXT DEFAULT 'Default';")
            conn.commit()
        except Exception as e:
            logger.debug("Schema ensure in analytics: %s", e)

    def _backfill_historical_tokens_if_needed(self, conn: sqlite3.Connection):
        """Backfills token metrics from conversation_messages into tasks if total_tokens is 0."""
        try:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT t.task_id, t.conversation_id
            FROM tasks t
            WHERE t.total_tokens = 0 OR t.total_tokens IS NULL;
            """)
            zero_tasks = cursor.fetchall()
            if not zero_tasks:
                return

            for row in zero_tasks:
                t_id = row["task_id"]
                c_id = row["conversation_id"]
                if not c_id:
                    continue
                cursor.execute("""
                SELECT metadata_json FROM conversation_messages
                WHERE conversation_id = ? AND role = 'assistant' AND metadata_json IS NOT NULL
                ORDER BY id DESC LIMIT 1;
                """, (c_id,))
                msg_row = cursor.fetchone()
                if msg_row and msg_row["metadata_json"]:
                    try:
                        meta = json.loads(msg_row["metadata_json"])
                        usage = meta.get("usage", {})
                        in_tok = int(usage.get("input_tokens") or 0)
                        out_tok = int(usage.get("output_tokens") or 0)
                        think_tok = int(usage.get("thinking_tokens") or 0)
                        tot_tok = int(usage.get("total_tokens") or (in_tok + out_tok + think_tok))
                        if tot_tok > 0:
                            cursor.execute("""
                            UPDATE tasks
                            SET input_tokens = ?, output_tokens = ?, thinking_tokens = ?, total_tokens = ?
                            WHERE task_id = ?;
                            """, (in_tok, out_tok, think_tok, tot_tok, t_id))
                    except Exception:
                        pass
            conn.commit()
        except Exception as e:
            logger.debug("Backfill token check: %s", e)

    def get_summary(self, project: Optional[str] = None, time_range: str = "7d") -> Dict[str, Any]:
        """
        Returns full analytics report including KPI metrics, timeline trends,
        model distribution, project progress breakdown, and execution logs.
        """
        now = datetime.now(timezone.utc)
        start_time_iso = None

        if time_range == "24h":
            start_time_iso = (now - timedelta(hours=24)).isoformat()
        elif time_range == "7d":
            start_time_iso = (now - timedelta(days=7)).isoformat()
        elif time_range == "30d":
            start_time_iso = (now - timedelta(days=30)).isoformat()
        elif time_range == "90d":
            start_time_iso = (now - timedelta(days=90)).isoformat()
        # time_range == "all" keeps start_time_iso = None

        with get_db_connection() as conn:
            self._ensure_schema(conn)
            self._backfill_historical_tokens_if_needed(conn)
            cursor = conn.cursor()

            # Base WHERE clauses
            where_clauses = []
            params = []

            if start_time_iso:
                where_clauses.append("t.created_at >= ?")
                params.append(start_time_iso)

            if project and project.lower() not in ("all", ""):
                where_clauses.append("LOWER(COALESCE(t.project, 'Default')) = ?")
                params.append(project.lower().strip())

            where_str = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

            # 1. KPI Totals
            cursor.execute(f"""
            SELECT
                COUNT(*) as total_tasks,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_tasks,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_tasks,
                SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END) as running_tasks,
                SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_tasks,
                COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                COALESCE(SUM(thinking_tokens), 0) as total_thinking_tokens,
                COALESCE(SUM(total_tokens), 0) as grand_total_tokens,
                COALESCE(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE NULL END), 0.0) as avg_duration,
                COUNT(DISTINCT COALESCE(project, 'Default')) as total_projects_count
            FROM tasks t
            {where_str};
            """, params)
            kpi_row = cursor.fetchone()

            tot_tasks = kpi_row["total_tasks"] or 0
            comp_tasks = kpi_row["completed_tasks"] or 0
            grand_tokens = kpi_row["grand_total_tokens"] or 0
            think_tokens = kpi_row["total_thinking_tokens"] or 0
            success_rate = round((comp_tasks / tot_tasks * 100), 1) if tot_tasks > 0 else 100.0
            thinking_ratio = round((think_tokens / grand_tokens * 100), 1) if grand_tokens > 0 else 0.0

            kpis = {
                "total_tasks": tot_tasks,
                "completed_tasks": comp_tasks,
                "failed_tasks": kpi_row["failed_tasks"] or 0,
                "running_tasks": kpi_row["running_tasks"] or 0,
                "cancelled_tasks": kpi_row["cancelled_tasks"] or 0,
                "success_rate": success_rate,
                "total_tokens": grand_tokens,
                "input_tokens": kpi_row["total_input_tokens"] or 0,
                "output_tokens": kpi_row["total_output_tokens"] or 0,
                "thinking_tokens": think_tokens,
                "thinking_ratio": thinking_ratio,
                "avg_duration_seconds": round(kpi_row["avg_duration"] or 0.0, 1),
                "total_projects": kpi_row["total_projects_count"] or 1
            }

            # 2. Token Timeline Trends (Grouped by Day or Hour)
            timeline_format = "%Y-%m-%d %H:00" if time_range == "24h" else "%Y-%m-%d"
            cursor.execute(f"""
            SELECT
                strftime('{timeline_format}', t.created_at) as time_bucket,
                COUNT(*) as bucket_tasks,
                SUM(COALESCE(input_tokens, 0)) as in_tok,
                SUM(COALESCE(output_tokens, 0)) as out_tok,
                SUM(COALESCE(thinking_tokens, 0)) as think_tok,
                SUM(COALESCE(total_tokens, 0)) as tot_tok
            FROM tasks t
            {where_str}
            GROUP BY time_bucket
            ORDER BY time_bucket ASC;
            """, params)
            timeline_rows = cursor.fetchall()

            timeline_labels = []
            timeline_in = []
            timeline_out = []
            timeline_think = []
            timeline_total = []
            timeline_tasks = []

            for r in timeline_rows:
                bucket = r["time_bucket"] or "Recent"
                # Prettify bucket label
                if len(bucket) == 10:  # YYYY-MM-DD
                    try:
                        dt = datetime.strptime(bucket, "%Y-%m-%d")
                        label = dt.strftime("%b %d")
                    except Exception:
                        label = bucket
                elif len(bucket) > 10:  # YYYY-MM-DD HH:00
                    try:
                        dt = datetime.strptime(bucket, "%Y-%m-%d %H:00")
                        label = dt.strftime("%H:%M")
                    except Exception:
                        label = bucket
                else:
                    label = bucket

                timeline_labels.append(label)
                timeline_in.append(r["in_tok"] or 0)
                timeline_out.append(r["out_tok"] or 0)
                timeline_think.append(r["think_tok"] or 0)
                timeline_total.append(r["tot_tok"] or 0)
                timeline_tasks.append(r["bucket_tasks"] or 0)

            # 3. Model Distribution
            cursor.execute(f"""
            SELECT
                COALESCE(c.model, 'gemini-3.8-flash') as model_name,
                COUNT(t.id) as task_count,
                SUM(COALESCE(t.total_tokens, 0)) as model_tokens
            FROM tasks t
            LEFT JOIN conversations c ON t.conversation_id = c.conversation_id
            {where_str}
            GROUP BY model_name
            ORDER BY model_tokens DESC;
            """, params)
            model_rows = cursor.fetchall()

            model_distribution = []
            for mr in model_rows:
                raw_name = mr["model_name"] or "default"
                clean_name = raw_name.split()[0].replace("-low", "").replace("-medium", "").replace("-high", "")
                if "gemini-4" in clean_name:
                    display_name = "Gemini 4 Argon"
                elif "gemini-3.8" in clean_name:
                    display_name = "Gemini 3.8 Flash"
                elif "opus" in clean_name:
                    display_name = "Claude Opus 5.5"
                elif "sonnet" in clean_name:
                    display_name = "Claude Sonnet 5.5"
                elif "gpt-oss" in clean_name:
                    display_name = "GPT-OSS 120B"
                else:
                    display_name = clean_name.capitalize()

                toks = mr["model_tokens"] or 0
                pct = round((toks / grand_tokens * 100), 1) if grand_tokens > 0 else 0.0
                model_distribution.append({
                    "model_id": raw_name,
                    "display_name": display_name,
                    "tasks": mr["task_count"] or 0,
                    "tokens": toks,
                    "percentage": pct
                })

            # 4. Projects Breakdown & Progress Matrix
            cursor.execute("""
            SELECT
                COALESCE(t.project, 'Default') as proj_name,
                COUNT(*) as total_tasks,
                SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_tasks,
                SUM(CASE WHEN t.status = 'FAILED' THEN 1 ELSE 0 END) as failed_tasks,
                SUM(CASE WHEN t.status = 'RUNNING' THEN 1 ELSE 0 END) as running_tasks,
                SUM(COALESCE(t.input_tokens, 0)) as in_tokens,
                SUM(COALESCE(t.output_tokens, 0)) as out_tokens,
                SUM(COALESCE(t.thinking_tokens, 0)) as think_tokens,
                SUM(COALESCE(t.total_tokens, 0)) as proj_tokens,
                COALESCE(AVG(CASE WHEN t.duration_seconds > 0 THEN t.duration_seconds ELSE NULL END), 0.0) as avg_dur,
                MAX(COALESCE(t.completed_at, t.created_at)) as last_activity
            FROM tasks t
            GROUP BY proj_name
            ORDER BY last_activity DESC;
            """)
            project_rows = cursor.fetchall()

            projects_list = []
            for pr in project_rows:
                p_name = pr["proj_name"]
                p_total = pr["total_tasks"] or 0
                p_comp = pr["completed_tasks"] or 0
                p_fail = pr["failed_tasks"] or 0
                p_running = pr["running_tasks"] or 0
                p_tokens = pr["proj_tokens"] or 0
                p_progress = round((p_comp / p_total * 100), 1) if p_total > 0 else 0.0

                if p_running > 0:
                    status_label = "Running"
                    status_class = "running"
                elif p_progress >= 100.0:
                    status_label = "Completed"
                    status_class = "completed"
                elif p_fail > 0 and p_comp == 0:
                    status_label = "Blocked"
                    status_class = "failed"
                else:
                    status_label = "In Progress"
                    status_class = "in-progress"

                # Fetch 3 recent task titles for this project
                cursor.execute("""
                SELECT title, status, created_at FROM tasks
                WHERE COALESCE(project, 'Default') = ?
                ORDER BY id DESC LIMIT 3;
                """, (p_name,))
                subtasks = [dict(r) for r in cursor.fetchall()]

                projects_list.append({
                    "name": p_name,
                    "total_tasks": p_total,
                    "completed_tasks": p_comp,
                    "failed_tasks": p_fail,
                    "running_tasks": p_running,
                    "progress_percent": p_progress,
                    "total_tokens": p_tokens,
                    "input_tokens": pr["in_tokens"] or 0,
                    "output_tokens": pr["out_tokens"] or 0,
                    "thinking_tokens": pr["think_tokens"] or 0,
                    "avg_duration": round(pr["avg_dur"] or 0.0, 1),
                    "last_activity": pr["last_activity"],
                    "status": status_label,
                    "status_class": status_class,
                    "recent_subtasks": subtasks
                })

            # List of all project names for selector
            all_project_names = [p["name"] for p in projects_list]
            if "Default" not in all_project_names:
                all_project_names.insert(0, "Default")

            # 5. Recent Task Executions
            cursor.execute(f"""
            SELECT
                t.task_id,
                t.title,
                COALESCE(t.project, 'Default') as project,
                t.status,
                COALESCE(t.duration_seconds, 0.0) as duration_seconds,
                COALESCE(t.total_tokens, 0) as total_tokens,
                COALESCE(t.thinking_tokens, 0) as thinking_tokens,
                t.created_at,
                t.completed_at
            FROM tasks t
            {where_str}
            ORDER BY t.id DESC LIMIT 25;
            """, params)
            recent_tasks = [dict(r) for r in cursor.fetchall()]

        return {
            "success": True,
            "filter": {
                "project": project or "all",
                "time_range": time_range
            },
            "kpis": kpis,
            "timeline": {
                "labels": timeline_labels,
                "input_tokens": timeline_in,
                "output_tokens": timeline_out,
                "thinking_tokens": timeline_think,
                "total_tokens": timeline_total,
                "tasks_count": timeline_tasks
            },
            "model_distribution": model_distribution,
            "projects": projects_list,
            "all_projects": all_project_names,
            "recent_tasks": recent_tasks
        }

analytics_manager_instance = AnalyticsManager()
