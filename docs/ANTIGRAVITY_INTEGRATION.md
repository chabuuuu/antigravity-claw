# Antigravity CLI Integration Guide

This document explains how **Antigravity OpenClaw** interfaces directly with the official Google Antigravity CLI (`agy`), parses its streaming protocol, and surfaces all agent features to the web interface.

---

## 1. CLI Execution Protocol

When a user submits a prompt, OpenClaw spawns `agy` in non-interactive streaming mode:

```bash
agy --output-format stream-json \
    --dangerously-skip-permissions \
    --model <model_id> \
    --effort <low|medium|high|xhigh|max> \
    --mode <auto|accept-edits|plan> \
    [--sandbox] \
    [--conversation <conv_id>] \
    --print "<prompt>"
```

### Command Flags Breakdown:
- `--output-format stream-json`: Emits one newline-delimited JSON (NDJSON) event per turn/delta on standard output.
- `--dangerously-skip-permissions`: Automatically approves tool actions (e.g., executing commands, writing files) for uninterrupted remote autonomy.
- `--model <model>`: Selects the reasoning model (e.g. `gemini-4-argon-high`, `gemini-3.8-flash-high`, `claude-opus-5-5-high`).
- `--effort <level>`: Controls reasoning depth (`low`, `medium`, `high`, `xhigh`, `max`).
- `--mode <mode>`: Sets agent persona and behavior (`auto`, `accept-edits`, `plan`).
- `--conversation <id>`: Resumes multi-turn conversation context.
- `--sandbox`: Enables terminal sandbox restrictions.

---

## 2. Stream-JSON Event Schema

The `agy` CLI emits structured JSON lines during execution:

### A. Initialization Event (`init`)
Emitted immediately when session starts:
```json
{
  "event": "init",
  "conversation_id": "2d0038bb-d84f-4455-a6bd-4e52221396bd",
  "init": {
    "cwd": "/path/to/workspace",
    "tools": ["run_command", "edit_file", "write_file", "read_file", "grep_search", "call_mcp_tool"],
    "permission_mode": "always-proceed"
  }
}
```

### B. Agent Response Stream (`step_update: agent_response`)
Streams raw tokens as the model generates text:
```json
{
  "event": "step_update",
  "step_update": {
    "conversation_id": "2d0038bb-d84f-4455-a6bd-4e52221396bd",
    "step_index": 1,
    "state": "ACTIVE",
    "step_type": "agent_response",
    "text_delta": "Checking file structure..."
  }
}
```

### C. Tool Execution Event (`step_update: tool`)
Emitted when the agent calls a tool (start & completion):
```json
{
  "event": "step_update",
  "step_update": {
    "conversation_id": "2d0038bb-d84f-4455-a6bd-4e52221396bd",
    "step_index": 2,
    "state": "DONE",
    "step_type": "tool",
    "tool_name": "run_command",
    "duration_seconds": 0.03,
    "tool_info": {
      "name": "run_command",
      "parameters": { "CommandLine": "ls -la" },
      "output": "total 8\ndrwxr-xr-x 2 user user 4096 ..."
    }
  }
}
```

### D. Final Result Event (`result`)
Emitted when the turn finishes:
```json
{
  "event": "result",
  "result": {
    "conversation_id": "2d0038bb-d84f-4455-a6bd-4e52221396bd",
    "status": "SUCCESS",
    "response": "Done! Files inspected successfully.\n",
    "duration_seconds": 3.45,
    "num_turns": 1,
    "usage": {
      "input_tokens": 9023,
      "output_tokens": 189,
      "thinking_tokens": 74,
      "total_tokens": 9212
    }
  }
}
```

---

## 3. Subcommands Integration

OpenClaw queries and manipulates Antigravity via subcommands:

| Feature | CLI Subcommand | Purpose |
| :--- | :--- | :--- |
| **Models** | `agy models` | Queries list of available Google & Claude models |
| **Agents** | `agy agents` | Lists built-in and project subagents |
| **MCP List** | `agy mcp list` | Inspects configured Model Context Protocol tool servers |
| **MCP Add** | `agy mcp add <name> --type <type> --command <cmd>` | Attaches external tool servers |
| **MCP Remove**| `agy mcp remove <name>` | Unregisters MCP server |
| **Plugins** | `agy plugins list` | Discovers installed plugins & skills |
| **Plugin Toggle** | `agy plugin enable/disable <name>` | Toggles plugin activity |
