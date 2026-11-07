/**
 * VPS Web Terminal Module
 */
const Terminal = {
  activeCommandId: null,
  history: [],
  historyIndex: -1,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const input = document.getElementById("terminal-cmd-input");
    const runBtn = document.getElementById("btn-terminal-run");
    const clearBtn = document.getElementById("btn-terminal-clear");
    const killBtn = document.getElementById("btn-terminal-kill");

    runBtn.addEventListener("click", () => this.execute());
    clearBtn.addEventListener("click", () => this.clear());
    killBtn.addEventListener("click", () => this.kill());

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.execute();
      } else if (e.key === "ArrowUp") {
        if (this.history.length > 0 && this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          input.value = this.history[this.history.length - 1 - this.historyIndex];
        }
      } else if (e.key === "ArrowDown") {
        if (this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.history[this.history.length - 1 - this.historyIndex];
        } else if (this.historyIndex === 0) {
          this.historyIndex = -1;
          input.value = "";
        }
      }
    });
  },

  async execute() {
    const input = document.getElementById("terminal-cmd-input");
    const cmd = input.value.trim();
    if (!cmd) return;

    this.history.push(cmd);
    this.historyIndex = -1;
    input.value = "";

    this.appendOutput(`\nuser@vps:~$ ${cmd}\n`);

    try {
      const res = await fetch("/api/terminal/execute", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      if (!res.ok) {
        this.appendOutput(`[Error: ${data.error || "Failed to execute"}]\n`);
        return;
      }

      this.activeCommandId = data.command_id;
      if (window.AppWS && window.AppWS.readyState === WebSocket.OPEN) {
        window.AppWS.send(JSON.stringify({
          action: "subscribe_terminal",
          command_id: this.activeCommandId
        }));
      }
    } catch (e) {
      this.appendOutput(`[Network Error: ${e.message}]\n`);
    }
  },

  async kill() {
    if (!this.activeCommandId) return;
    try {
      await fetch("/api/terminal/kill", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ command_id: this.activeCommandId })
      });
      this.appendOutput("\n[Process terminated by user]\n");
    } catch (e) {
      console.error("Kill command failed:", e);
    }
  },

  handleStreamData(event) {
    if (event.command_id !== this.activeCommandId) return;
    if (event.type === "terminal_data") {
      this.appendOutput(event.data);
    } else if (event.type === "terminal_exit") {
      this.appendOutput(`\n[Process exited with code ${event.exit_code}]\n`);
      this.activeCommandId = null;
    }
  },

  appendOutput(text) {
    const out = document.getElementById("terminal-output");
    out.innerText += text;
    out.scrollTop = out.scrollHeight;
  },

  clear() {
    const out = document.getElementById("terminal-output");
    out.innerText = "VPS Terminal Session\nReady.\n";
  }
};
