# 📈 Analytics, Token Telemetry & Project Progress Reports

Antigravity OpenClaw features a high-performance **Analytics & Reporting Studio** powered by Chart.js 4.4 and SQLite aggregation pipelines. It gives developers and engineering teams deep visibility into token burn rates, deep thinking effort ratios, model distribution, and individual project milestones.

---

## 🌟 Key Features

### 1. Token Telemetry & Deep Reasoning Ratio
- **Granular Token Metrics**: Automatically tracks prompt input tokens, completion output tokens, and deep thinking / reasoning tokens on every turn.
- **Deep Reasoning Ratio**: Calculates the percentage of total tokens dedicated to planning and internal chain-of-thought versus generation (`thinking_tokens / total_tokens * 100`).
- **Real-Time Area Timeline**: Interactive area spline chart visualizing token burn trends across hours (`24h`) or days (`7d`, `30d`, `all`) with smooth cubic bezier curves and glowing dark-mode gradients.

### 2. Project Progress & Milestone Tracking Matrix
- **Per-Project Isolation**: Organizes tasks, subagent swarms, and sessions by project name (using the `--project <name>` CLI parameter).
- **Dynamic Completion Gauges**: Tracks task completion percentages (e.g., `14 / 16 tasks (87.5%)`) with animated progress bars.
- **Project Telemetry Cards**:
  - Project Title & Avatar icon.
  - Status Tag (`Completed`, `In Progress`, `Running`, `Blocked`).
  - Total token consumption and deep thinking tokens burned.
  - Average execution turnaround speed in seconds.
  - Recent turn and subtask previews.
  - 1-Click `🚀 Open in Workspace` action to resume development in the active project context.

### 3. Model Distribution & Quota Utilization
- **Multi-Model Donut Chart**: Visualizes token share across:
  - **Gemini 4 Argon** (Google's flagship reasoning model)
  - **Gemini 3.8 Flash** (High-throughput agent runner)
  - **Claude Opus 5.5 & Sonnet 5.5** (Deep analysis & coding)
  - **GPT-OSS 120B** (Open-weights reasoning)
- **Custom Interactive Legends**: Shows exact token numbers and percentages with quick visual indicators.

### 4. Task Execution Velocity & Success Rates
- **Velocity Metrics**: Average turnaround time in seconds per completed agent turn.
- **Status Breakdown**: Bar chart displaying Completed, Failed, Running, and Cancelled task counts.

### 5. Multi-Format Report Export
- **One-Click CSV Export**: Downloads a formatted `.csv` spreadsheet containing the KPI summary, project progress matrix, and detailed task execution records.
- **One-Click JSON Export**: Downloads the raw telemetry JSON payload for integration with external dashboards, Prometheus, Grafana, or BI tools.

---

## 🔌 API Reference

### `GET /api/analytics/summary`
Returns the aggregated analytics report.

**Query Parameters:**
- `project` *(optional)*: Project name filter (default: `"all"`).
- `range` *(optional)*: Time range (`"24h"`, `"7d"`, `"30d"`, `"all"`, default: `"7d"`).

**Response Structure:**
```json
{
  "success": true,
  "filter": {
    "project": "all",
    "time_range": "7d"
  },
  "kpis": {
    "total_tasks": 24,
    "completed_tasks": 21,
    "failed_tasks": 3,
    "running_tasks": 0,
    "cancelled_tasks": 0,
    "success_rate": 87.5,
    "total_tokens": 145820,
    "input_tokens": 82400,
    "output_tokens": 28620,
    "thinking_tokens": 34800,
    "thinking_ratio": 23.9,
    "avg_duration_seconds": 4.8,
    "total_projects": 3
  },
  "timeline": {
    "labels": ["Nov 02", "Nov 03", "Nov 04", "Nov 05", "Nov 06", "Nov 07", "Nov 08"],
    "input_tokens": [12000, 15000, 18000, 14000, 9000, 7000, 7400],
    "output_tokens": [4000, 5200, 6100, 4800, 3100, 2400, 3020],
    "thinking_tokens": [5000, 6200, 7500, 5900, 3900, 2800, 3500],
    "total_tokens": [21000, 26400, 31600, 24700, 16000, 12200, 13920],
    "tasks_count": [3, 4, 5, 4, 3, 2, 3]
  },
  "model_distribution": [
    {
      "model_id": "gemini-3.8-flash",
      "display_name": "Gemini 3.8 Flash",
      "tasks": 16,
      "tokens": 84500,
      "percentage": 58.0
    },
    {
      "model_id": "gemini-4-argon",
      "display_name": "Gemini 4 Argon",
      "tasks": 8,
      "tokens": 61320,
      "percentage": 42.0
    }
  ],
  "projects": [
    {
      "name": "Auth System",
      "total_tasks": 12,
      "completed_tasks": 11,
      "failed_tasks": 1,
      "running_tasks": 0,
      "progress_percent": 91.7,
      "total_tokens": 78200,
      "thinking_tokens": 18400,
      "avg_duration": 4.2,
      "last_activity": "2026-11-08T10:15:00Z",
      "status": "In Progress",
      "status_class": "in-progress"
    }
  ],
  "all_projects": ["Default", "Auth System", "Mobile App"],
  "recent_tasks": [...]
}
```

### `GET /api/analytics/export`
Exports the report as a downloadable file.

**Query Parameters:**
- `format`: `"csv"` or `"json"` (default: `"csv"`).
- `project`: Project filter (default: `"all"`).
- `range`: Time range (default: `"30d"`).

