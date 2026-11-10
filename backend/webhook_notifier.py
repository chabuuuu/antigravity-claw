"""
Notification & Webhook Module for Antigravity OpenClaw.
Supports Telegram Bot, Discord, Slack, and Generic HTTP Webhooks
for autonomous task completion alerts, errors, and security events.
"""

import json
import logging
from typing import Optional, Dict, Any
import requests

from backend.config import (
    DATA_DIR,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL,
    GENERIC_WEBHOOK_URL
)

logger = logging.getLogger("openclaw.webhook_notifier")

CONFIG_FILE = DATA_DIR / "webhooks_config.json"

class WebhookNotifier:
    def __init__(self):
        self.telegram_token = TELEGRAM_BOT_TOKEN
        self.telegram_chat_id = TELEGRAM_CHAT_ID
        self.discord_url = DISCORD_WEBHOOK_URL
        self.slack_url = SLACK_WEBHOOK_URL
        self.generic_url = GENERIC_WEBHOOK_URL
        self.notify_swarms: bool = True
        self.notify_all_tasks: bool = False
        self.min_duration_seconds: int = 10

        self._load_saved_config()

    def _load_saved_config(self):
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                if "telegram_token" in saved and saved["telegram_token"]:
                    self.telegram_token = saved["telegram_token"]
                if "telegram_chat_id" in saved and saved["telegram_chat_id"]:
                    self.telegram_chat_id = saved["telegram_chat_id"]
                if "discord_url" in saved and saved["discord_url"]:
                    self.discord_url = saved["discord_url"]
                if "slack_url" in saved and saved["slack_url"]:
                    self.slack_url = saved["slack_url"]
                if "generic_url" in saved and saved["generic_url"]:
                    self.generic_url = saved["generic_url"]
                if "notify_swarms" in saved:
                    self.notify_swarms = bool(saved["notify_swarms"])
                if "notify_all_tasks" in saved:
                    self.notify_all_tasks = bool(saved["notify_all_tasks"])
                if "min_duration_seconds" in saved:
                    self.min_duration_seconds = int(saved["min_duration_seconds"])
            except Exception as e:
                logger.warning("Could not read webhooks config file: %s", e)

    def _save_config(self):
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            data = {
                "telegram_token": self.telegram_token,
                "telegram_chat_id": self.telegram_chat_id,
                "discord_url": self.discord_url,
                "slack_url": self.slack_url,
                "generic_url": self.generic_url,
                "notify_swarms": self.notify_swarms,
                "notify_all_tasks": self.notify_all_tasks,
                "min_duration_seconds": self.min_duration_seconds
            }
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error("Failed to save webhooks config: %s", e)

    def update_config(self, config: Dict[str, Any]):
        if "telegram_token" in config:
            self.telegram_token = config["telegram_token"]
        if "telegram_chat_id" in config:
            self.telegram_chat_id = config["telegram_chat_id"]
        if "discord_url" in config:
            self.discord_url = config["discord_url"]
        if "slack_url" in config:
            self.slack_url = config["slack_url"]
        if "generic_url" in config:
            self.generic_url = config["generic_url"]
        if "notify_swarms" in config:
            self.notify_swarms = bool(config["notify_swarms"])
        if "notify_all_tasks" in config:
            self.notify_all_tasks = bool(config["notify_all_tasks"])
        if "min_duration_seconds" in config:
            try:
                self.min_duration_seconds = max(0, int(config["min_duration_seconds"]))
            except (ValueError, TypeError):
                pass
        self._save_config()

    def has_any_channel_configured(self) -> bool:
        return bool(
            (self.telegram_token and self.telegram_chat_id) or
            self.discord_url or
            self.slack_url or
            self.generic_url
        )

    def should_notify_task(self, task) -> bool:
        if not self.has_any_channel_configured():
            return False

        # If user explicitly requested webhook notification for this prompt
        if getattr(task, "webhook_notify", False):
            return True

        prompt = (getattr(task, "prompt", "") or "").lower()
        is_swarm = any(cmd in prompt for cmd in ("/teamwork", "/boost", "/goal", "/plan"))

        # If notify_swarms is enabled and this is a swarm task
        if self.notify_swarms and is_swarm:
            return True

        # If notify_all_tasks is enabled and duration meets threshold
        duration = getattr(task, "duration_seconds", 0) or 0
        if self.notify_all_tasks and duration >= self.min_duration_seconds:
            return True

        return False

    def notify(self, title: str, message: str, event_type: str = "INFO", metadata: Optional[Dict[str, Any]] = None):
        """Dispatches notification to all configured webhooks asynchronously or synchronously."""
        import threading
        thread = threading.Thread(target=self._send_all, args=(title, message, event_type, metadata))
        thread.daemon = True
        thread.start()

    def _send_all(self, title: str, message: str, event_type: str, metadata: Optional[Dict[str, Any]]):
        if self.telegram_token and self.telegram_chat_id:
            self._send_telegram(title, message, event_type)
        if self.discord_url:
            self._send_discord(title, message, event_type, metadata)
        if self.slack_url:
            self._send_slack(title, message, event_type)
        if self.generic_url:
            self._send_generic(title, message, event_type, metadata)

    def _send_telegram(self, title: str, message: str, event_type: str):
        try:
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            icon = "✅" if event_type == "SUCCESS" else ("❌" if event_type in ("ERROR", "FAILED") else "ℹ️")
            text = f"{icon} *{title}*\n\n{message}"
            payload = {
                "chat_id": self.telegram_chat_id,
                "text": text,
                "parse_mode": "Markdown"
            }
            requests.post(url, json=payload, timeout=10)
        except Exception as e:
            logger.error("Failed to send Telegram notification: %s", e)

    def _send_discord(self, title: str, message: str, event_type: str, metadata: Optional[Dict[str, Any]]):
        try:
            color = 0x2ecc71 if event_type == "SUCCESS" else (0xe74c3c if event_type in ("ERROR", "FAILED") else 0x3498db)
            embed = {
                "title": title,
                "description": message[:2000],
                "color": color
            }
            if metadata:
                fields = []
                for k, v in list(metadata.items())[:10]:
                    fields.append({"name": str(k), "value": str(v)[:100], "inline": True})
                embed["fields"] = fields

            payload = {"embeds": [embed]}
            requests.post(self.discord_url, json=payload, timeout=10)
        except Exception as e:
            logger.error("Failed to send Discord notification: %s", e)

    def _send_slack(self, title: str, message: str, event_type: str):
        try:
            icon = ":white_check_mark:" if event_type == "SUCCESS" else (":x:" if event_type in ("ERROR", "FAILED") else ":information_source:")
            payload = {
                "text": f"{icon} *{title}*\n{message}"
            }
            requests.post(self.slack_url, json=payload, timeout=10)
        except Exception as e:
            logger.error("Failed to send Slack notification: %s", e)

    def _send_generic(self, title: str, message: str, event_type: str, metadata: Optional[Dict[str, Any]]):
        try:
            payload = {
                "title": title,
                "message": message,
                "event_type": event_type,
                "metadata": metadata or {}
            }
            requests.post(self.generic_url, json=payload, timeout=10)
        except Exception as e:
            logger.error("Failed to send Generic webhook notification: %s", e)

notifier_instance = WebhookNotifier()

