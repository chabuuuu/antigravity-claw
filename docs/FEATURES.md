# Studio Features & Developer Tools

**Antigravity OpenClaw** provides a comprehensive suite of remote developer tools alongside its autonomous agent core.

---

## 📁 1. Workspace File Explorer & In-Browser Code Editor

The **Files & Editor** view (`#view-workspace`) turns your remote VPS workspace into an interactive IDE experience:

### Tree Navigation
- Explore nested directories in your workspace without opening an SSH terminal.
- Visual indicators for folders (`📁`) and files (`📄`).
- Top action bar:
  - 🔄 **Refresh**: Reload directory contents.
  - 📄+ **New File**: Create a new file in the active folder.
  - 📁+ **New Folder**: Create a subfolder.
  - 📤 **Upload**: Upload local files directly from your computer or phone to the VPS.
  - 🗑️ **Delete**: Safely delete files or empty folders.

### Code Editor & Automatic Backups
- Click any file to open it in the editor pane.
- Edit files directly in the browser with `Ctrl + S` or the **💾 Save** button.
- **Safety First**: Every file save automatically generates a `.bak` timestamped backup copy on the VPS before writing changes.
- **File Download**: Download any workspace file directly to your local device.

### Git Status & Diff Inspector
- Top header indicates the active git branch (e.g. `Git: main`).
- Click the git pill to view uncommitted diffs and recent commit history without running terminal commands.

---

## 💻 2. VPS Web Terminal

The **VPS Terminal** view (`#view-terminal`) provides an interactive remote Bash shell:

- **Direct Subprocess Execution**: Run Linux shell commands (`ls -la`, `docker ps`, `git pull`, `curl`, `htop`, etc.) directly on the VPS.
- **Monospace ANSI Color Support**: Clean dark terminal aesthetic with color rendering.
- **Command History**: Navigate previous commands using Up/Down arrow keys.
- **Process Kill Switch**: Terminate hanging processes safely with the **Kill Process** button.
- **Audit Logging**: Every command executed via the web terminal is automatically logged in the Security Audit trail.

---

## ⚙️ 3. Antigravity Configuration & Plugin Manager

The **Antigravity Config** view (`#view-settings`) exposes full control over Antigravity CLI's configuration:

### A. MCP Servers (`agy mcp`)
- List all registered Model Context Protocol (MCP) tool servers.
- Inspect server configurations (stdio vs http, commands, args, environment variables).
- Add new MCP servers via modal:
  - Name, Type (`stdio` / `http`), Command/URL, Arguments, Environment Variables, and Headers.
- Enable, disable, or delete MCP servers with one click.

### B. Plugin Lifecycle (`agy plugin`)
- View installed plugins with versions, sources, and enabled skills.
- Install official or marketplace plugins (`agy plugin install <target>`).
- Import plugins from Gemini or Claude CLI environments (`agy plugin import`).
- Validate plugin manifests with optional `--strict` mode.
- Generate marketplace links (`agy plugin link`).

### C. Antigravity System Services
- **Remote Control Daemon**: Start, stop, or inspect `agy remote-control` daemons.
- **Agent Client Protocol (ACP)**: Connect to VS Code, JetBrains, Zed, and Neovim stdio servers.
- **Microphone Dictation Service**: Inspect `agy mic-serve` voice dictation listeners.
- **CLI In-Place Updater**: Run `agy update` to upgrade the Antigravity binary to the latest version.
- **Changelog Viewer**: View official Antigravity release notes and changelog history.

### D. Rules & Raw JSON Editors
- Edit project behavior guidelines directly in the browser: `GEMINI.md` and `AGENTS.md`.
- Safe raw JSON editor for `~/.gemini/settings.json` and `~/.gemini/config/config.json`.
