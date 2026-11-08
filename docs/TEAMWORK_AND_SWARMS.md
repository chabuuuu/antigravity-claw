# 👥 Antigravity Teamwork, Swarms & Slash Commands

Antigravity OpenClaw provides first-class support for multi-agent swarms, autonomous team collaboration, and the complete Antigravity CLI interactive slash command ecosystem.

---

## ⚡ Interactive Slash Commands System

Antigravity CLI provides 38+ built-in slash commands and skill extensions that can be triggered dynamically from the chat input.

### Autocomplete & Keyboard Navigation
When you type `/` in the chat input:
- A floating popup menu appears displaying matching commands with syntax examples and descriptions.
- **`↑` / `↓` Arrow Keys**: Navigate through the command list.
- **`Enter` or `Tab`**: Select and insert the command into the input box.
- **`Esc`**: Dismiss the autocomplete popup.

### Quick Actions Bar
Above the chat prompt, the **Quick Actions Bar** provides 1-click access to the most vital Antigravity workflows:
- `👥 Teamwork`: Autonomous multi-agent swarm for complex projects (`/teamwork`).
- `🚀 Boost`: High-power multi-perspective multi-agent orchestrator (`/boost`).
- `📋 Plan`: Step-by-step architectural planning before code generation (`/plan`).
- `💬 Grill-Me`: Interactive interview mode to clarify requirements and edge cases (`/grill-me`).
- `🎯 Goal`: Persistent autonomous loop running until definition of done is achieved (`/goal`).
- `🧠 Learn`: Extract reusable skills and rules from recent tasks (`/learn`).
- `🌐 Browser`: Browse the web and automate browser actions with Chrome DevTools (`/browser`).
- `📊 Usage`: View live model quotas across Gemini, Claude, and GPT (`/usage` or `/quota`).
- `🧩 Skills`: Open the complete Antigravity skills catalog (`/skills`).
- `❓ Help`: Open the command cheat-sheet card (`/help`).

---

## 👥 Teamwork & Multi-Agent Swarm Studio

The dedicated **Teamwork & Swarm** view (`#view-teamwork`) allows users to design, configure, and launch multi-agent projects with visual role tracking.

### Multi-Agent Orchestration Strategies

| Strategy | Command | Purpose |
| :--- | :--- | :--- |
| **Swarm Teamwork** | `/teamwork <mission>` | Spawns a coordinated team of specialized agents running in parallel and phased stages. |
| **Boost Orchestrator** | `/boost <mission>` | Applies deep reasoning, strategic multi-angle planning, and rigorous verification. |
| **Autonomous Goal Loop** | `/goal <mission>` | Executes continuously until all acceptance criteria are verified and achieved. |
| **Plan & Align** | `/plan` & `/grill-me` | Two-phase discovery: maps milestones, then conducts an interactive interview to eliminate ambiguity. |

### Swarm Team Roles
1. **👑 Coordinator Agent (Lead)**:
   - Analyzes project mission and deliverables.
   - Decomposes the overarching goal into subagent tasks and milestones.
   - Manages inter-agent communication and aggregates final output.
2. **🔍 Research Agent (Analysis)**:
   - Deep codebase exploration and dependency analysis.
   - Official documentation lookup and web search verification.
   - Identifies architectural patterns and potential breaking changes.
3. **🛠️ Builder Agent (Execution)**:
   - Implements new features, refactors code, and updates configuration.
   - Applies precise atomic file modifications.
   - Manages package dependencies and database migrations.
4. **🧪 QA & Verification Agent (Quality)**:
   - Executes unit and integration test suites.
   - Runs linters and checks code style conformance.
   - Verifies edge cases and certifies production readiness.

---

## 🧩 Skills Catalog & Explorer

Antigravity CLI ships with a rich library of skills and tool extensions that extend agent capabilities for specialized domains.

### Features
- **Dynamic Skill Discovery**: Fetches all installed and builtin skills via `agy -p "/skills" --output-format json`.
- **Search & Filter**: Filter by categories (`Builtin`, `Chrome DevTools`, `Web Guidance`, `Android`) or free-text keywords.
- **In-Browser Markdown Viewer**: Read full `SKILL.md` instructions, parameter schemas, and best practice rules.
- **1-Click Run in Chat**: Pre-fills `/<skill-name> ` and transitions to the workspace.

---

## 🔌 Backend API Reference

### `GET /api/antigravity/commands`
Returns all available built-in slash commands and skill commands formatted for autocomplete.

**Response:**
```json
{
  "commands": [
    {
      "name": "/teamwork",
      "description": "Invoke a team of agents to autonomously tackle large projects.",
      "category": "Multi-Agent Swarm",
      "example": "/teamwork Build a fullstack authentication flow with JWT and audit logs",
      "icon": "👥"
    },
    {
      "name": "/boost",
      "description": "Invoke the Boost multi-agent orchestrator for complex tasks.",
      "category": "Multi-Agent Swarm",
      "example": "/boost Refactor database layer for connection pooling and high concurrency",
      "icon": "🚀"
    }
  ]
}
```

### `GET /api/antigravity/skills`
Returns the structured list of installed skills discovered from the Antigravity CLI engine.

### `GET /api/antigravity/skills/{skill_name}`
Returns the full documentation (`SKILL.md` markdown content) and metadata for the specified skill.

