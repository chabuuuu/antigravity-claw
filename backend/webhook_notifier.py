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
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL,
    GENERIC_WEBHOOK_URL
)

logger = logging.getLogger("openclaw.webhook_notifier")

class WebhookNotifier:
    def __init__(self):
        self.telegram_token = TELEGRAM_BOT_TOKEN
        self.telegram_chat_id = TELEGRAM_CHAT_ID
        self.discord_url = DISCORD_WEBHOOK_URL
        self.slack_url = SLACK_WEBHOOK_URL
        self.generic_url = GENERIC_WEBHOOK_URL

    def update_config(self, config: Dict[str, str]):
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
