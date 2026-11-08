# Autonomous Scheduling & Multi-Channel Webhooks

**Antigravity OpenClaw** includes a built-in background task scheduler and webhook dispatch engine designed for 24/7 unattended autonomous development operations.

---

## ⏱️ How the Autonomous Scheduler Works

The background scheduler (`backend/scheduler.py`) runs as an independent daemon loop inside the OpenClaw service:

1. **Persistent SQLite Store**: Schedules are stored in the `schedules` table with fields `name`, `cron_expr`, `prompt`, `model`, `notify`, `active`, `last_run`, and `next_run`.
2. **Cron Expression Parsing**: Supports standard 5-part cron syntax (e.g., `0 2 * * *` for 2 AM daily, `*/30 * * * *` for every 30 minutes) as well as human shortcuts (`@daily`, `@hourly`, `every 60 min`).
3. **Autonomous Execution**: When a schedule triggers, OpenClaw dispatches a new autonomous task (`--dangerously-skip-permissions`) to the Antigravity CLI without needing any active browser tabs or user interaction.
4. **Result Capture**: The full trajectory, tool calls, and output summary are saved to the database.

---

## 🔔 Multi-Channel Notification Webhooks

When a scheduled task completes (or fails), OpenClaw can instantly dispatch notifications to your preferred chat applications:

### 1. Telegram Bot Integration
- **Configuration**:
  - `TELEGRAM_BOT_TOKEN`: The bot token obtained from `@BotFather`.
  - `TELEGRAM_CHAT_ID`: Your personal chat ID or group/channel ID.
- **Message Format**: Clean Markdown message containing the task name, status (Success / Failed), total duration, token consumption, and completion summary.

### 2. Discord Webhooks
- **Configuration**:
  - `DISCORD_WEBHOOK_URL`: Webhook URL created in your Discord channel settings (`https://discord.com/api/webhooks/...`).
- **Message Format**: Rich Discord embed card with green/red status border, timestamp, model used, and task execution summary.

### 3. Slack Webhooks
- **Configuration**:
  - `SLACK_WEBHOOK_URL`: Incoming Webhook URL from Slack App integrations (`https://hooks.slack.com/services/...`).
- **Message Format**: Slack BlockKit formatted alert with action buttons.

### 4. Generic HTTP Webhooks
- **Configuration**:
  - `GENERIC_WEBHOOK_URL`: Any endpoint that accepts `POST` requests.
- **Payload Schema**:
  ```json
  {
    "event": "scheduled_task_completed",
    "schedule_id": 1,
    "schedule_name": "Nightly Regression Test",
    "task_id": "9b12a8...",
    "status": "COMPLETED",
    "prompt": "Run full test suite...",
    "duration_seconds": 45.2,
    "tokens": {
      "input_tokens": 1250,
      "output_tokens": 340,
      "total_tokens": 1590
    },
    "timestamp": "2026-11-08T05:00:00Z"
  }
  ```

---

## 🛠️ Configuring Schedules in OpenClaw UI

1. Open the left sidebar and select **`⏱️ Automations`**.
2. Click **`+ Create Scheduled Task`**.
3. Fill in:
   - **Task Name**: e.g., `Nightly Security Scan & Git Sync`.
   - **Cron Expression**: e.g., `0 3 * * *` (Runs every day at 3:00 AM UTC).
   - **Prompt**: e.g., `Check git status, pull latest main, run pip audit, fix any minor issues, and write a summary to docs/audit_report.md`.
   - **Send Webhook Notification**: Checked.
4. Click **Create Schedule**.
5. Your task is now active and will run automatically in the background 24/7!

