"""
Autonomous Scheduler Module for Antigravity OpenClaw.
Handles periodic background checks, cron schedule parsing,
and triggers autonomous tasks on Antigravity without human intervention.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import tornado.ioloop

from backend.database import get_db_connection
from backend.antigravity_runner import runner_instance, ActiveTask
from backend.webhook_notifier import notifier_instance
from backend.audit import log_audit, AuditAction

logger = logging.getLogger("openclaw.scheduler")

class AutonomousScheduler:
    def __init__(self):
        self.periodic_callback: Optional[tornado.ioloop.PeriodicCallback] = None
        self._is_running = False

    def start(self):
        """Starts the periodic check loop every 30 seconds."""
        if self._is_running:
            return
        self._is_running = True
        self.periodic_callback = tornado.ioloop.PeriodicCallback(self._check_schedules, 30000)
        self.periodic_callback.start()
        logger.info("Autonomous scheduler started.")

    def stop(self):
        if self.periodic_callback:
            self.periodic_callback.stop()
            self._is_running = False
            logger.info("Autonomous scheduler stopped.")

    async def _check_schedules(self):
        """Scans the schedules table and executes any tasks that are due."""
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM schedules WHERE is_active = 1;")
            schedules = cursor.fetchall()

            for item in schedules:
                next_run = item["next_run_at"]
                if not next_run or datetime.fromisoformat(next_run) <= now:
                    logger.info("Triggering scheduled task: %s (id=%d)", item["name"], item["id"])
                    
                    # Compute next run (e.g. parse minutes or daily)
                    new_next_run = self._compute_next_run(item["cron_expr"], now)
                    cursor.execute("""
                    UPDATE schedules
                    SET last_run_at = ?, next_run_at = ?
                    WHERE id = ?;
                    """, (now_iso, new_next_run.isoformat(), item["id"]))
                    conn.commit()

                    # Trigger task asynchronously
                    asyncio.create_task(self._execute_scheduled_task(item))

    def _compute_next_run(self, cron_expr: str, current_time: datetime) -> datetime:
        """
        Calculates the next run timestamp.
        Supports standard minutes interval like '*/15 * * * *' or '@hourly' or 'every N min'.
        """
        expr = cron_expr.strip().lower()
        if expr == "@hourly":
            return current_time + timedelta(hours=1)
        elif expr == "@daily":
            return current_time + timedelta(days=1)
        elif expr.startswith("*/"):
            try:
                mins = int(expr.split()[0].replace("*/", ""))
                return current_time + timedelta(minutes=mins)
            except Exception:
                return current_time + timedelta(hours=1)
        elif "min" in expr:
            try:
                import re
                m = re.search(r"(\d+)", expr)
                mins = int(m.group(1)) if m else 60
                return current_time + timedelta(minutes=mins)
            except Exception:
                return current_time + timedelta(hours=1)
        # Default fallback: 1 hour
        return current_time + timedelta(hours=1)

    async def _execute_scheduled_task(self, schedule_row: Any):
        schedule_id = schedule_row["id"]
        name = schedule_row["name"]
        prompt = schedule_row["prompt"]
        model = schedule_row["model"]
        effort = schedule_row["effort"]
        mode = schedule_row["mode"]
        should_notify = bool(schedule_row["webhook_notify"])

        log_audit(
            action=AuditAction.SCHEDULE_TRIGGER,
            status="RUNNING",
            resource=f"schedule:{schedule_id}",
            details={"name": name, "prompt": prompt[:100]}
        )

        try:
            task_id = await runner_instance.run_prompt(
                prompt=prompt,
                model=model,
                effort=effort,
                mode=mode,
                auto_approve=True,  # Autonomous mode always auto-proceeds
                username=f"cron:{name}"
            )
            logger.info("Autonomous schedule '%s' launched task %s", name, task_id)
            
            # Setup notification on task completion
            if should_notify:
                def on_finished(task: ActiveTask):
                    if task.task_id == task_id:
                        status = "SUCCESS" if task.status == "COMPLETED" else "FAILED"
                        notifier_instance.notify(
                            title=f"Autonomous Schedule: {name}",
                            message=f"Task completed with status: {task.status}\n\nPrompt: {prompt[:150]}...\n\nResult:\n{task.full_response[:500]}",
                            event_type=status,
                            metadata={"task_id": task_id, "schedule_id": schedule_id}
                        )
                runner_instance.register_on_finished(on_finished)

        except Exception as e:
            logger.error("Failed to execute schedule %s: %s", name, e)

    def create_schedule(self, name: str, cron_expr: str, prompt: str, model: str = "", effort: str = "medium", mode: str = "auto", notify: bool = True) -> int:
        now = datetime.now(timezone.utc)
        next_run = self._compute_next_run(cron_expr, now).isoformat()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO schedules (name, cron_expr, prompt, model, effort, mode, is_active, next_run_at, webhook_notify, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?);
            """, (name, cron_expr, prompt, model, effort, mode, next_run, 1 if notify else 0, now.isoformat()))
            conn.commit()
            return cursor.lastrowid

    def list_schedules(self) -> List[Dict[str, Any]]:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM schedules ORDER BY id DESC;")
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def delete_schedule(self, schedule_id: int) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM schedules WHERE id = ?;", (schedule_id,))
            conn.commit()
            return cursor.rowcount > 0

    def toggle_schedule(self, schedule_id: int, active: bool) -> bool:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE schedules SET is_active = ? WHERE id = ?;", (1 if active else 0, schedule_id))
            conn.commit()
            return cursor.rowcount > 0

scheduler_instance = AutonomousScheduler()
