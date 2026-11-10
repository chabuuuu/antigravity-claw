/**
 * Antigravity Settings & Integration Dashboard Module
 */
const Settings = {
  rawChangelogText: "",

  init() {
    this.bindEvents();
    this.loadAll();
  },

  bindEvents() {
    // Tab switching
    document.querySelectorAll(".settings-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".settings-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".settings-tab-pane").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        const pane = document.getElementById(tabId);
        if (pane) pane.classList.add("active");
      });
    });

    // MCP Modal
    const mcpModal = document.getElementById("mcp-modal");
    if (mcpModal) {
      document.getElementById("btn-add-mcp-modal").addEventListener("click", () => {
        mcpModal.classList.add("active");
      });
      mcpModal.querySelector(".modal-close").addEventListener("click", () => {
        mcpModal.classList.remove("active");
      });
      document.getElementById("btn-save-mcp").addEventListener("click", () => this.addMcpServer());
    }

    // Plugin Modals
    this.bindModal("plugin-install-modal", "btn-plugin-install-modal", "btn-submit-plugin-install", () => this.installPlugin());
    this.bindModal("plugin-import-modal", "btn-plugin-import-modal", "btn-submit-plugin-import", () => this.importPlugins());
    this.bindModal("plugin-validate-modal", "btn-plugin-validate-modal", "btn-submit-plugin-validate", () => this.validatePlugin());
    this.bindModal("plugin-link-modal", "btn-plugin-link-modal", "btn-submit-plugin-link", () => this.linkPlugin());

    // Remote Control Daemon buttons
    const btnRcStart = document.getElementById("btn-rc-start");
    const btnRcStop = document.getElementById("btn-rc-stop");
    const btnRcRefresh = document.getElementById("btn-refresh-remote-control");
    if (btnRcStart) btnRcStart.addEventListener("click", () => this.startRemoteControl());
    if (btnRcStop) btnRcStop.addEventListener("click", () => this.stopRemoteControl());
    if (btnRcRefresh) btnRcRefresh.addEventListener("click", () => this.loadRemoteControl());

    // Maintenance & Changelog
    const btnAgyUpdate = document.getElementById("btn-agy-update");
    const btnAgyInstall = document.getElementById("btn-agy-install");
    const btnReloadChangelog = document.getElementById("btn-reload-changelog");
    const searchChangelog = document.getElementById("changelog-search-input");
    if (btnAgyUpdate) btnAgyUpdate.addEventListener("click", () => this.updateCli());
    if (btnAgyInstall) btnAgyInstall.addEventListener("click", () => this.installCli());
    if (btnReloadChangelog) btnReloadChangelog.addEventListener("click", () => this.loadChangelog());
    if (searchChangelog) searchChangelog.addEventListener("input", (e) => this.filterChangelog(e.target.value));

    // Rules save
    document.getElementById("btn-save-rules").addEventListener("click", () => this.saveRules());

    // Raw config save
    document.getElementById("btn-save-raw-config").addEventListener("click", () => this.saveRawConfig());

    // Webhooks save & test
    document.getElementById("btn-save-webhooks").addEventListener("click", () => this.saveWebhooks());
    document.getElementById("btn-test-webhooks").addEventListener("click", () => this.testWebhooks());

    // Antigravity CLI Login
    const agyLoginBtn = document.getElementById("btn-settings-agy-login");
    if (agyLoginBtn) {
      agyLoginBtn.addEventListener("click", () => this.startAuthFlow());
    }
  },

  bindModal(modalId, triggerBtnId, submitBtnId, submitCallback) {
    const modal = document.getElementById(modalId);
    const trigger = document.getElementById(triggerBtnId);
    const submit = document.getElementById(submitBtnId);
    if (!modal) return;

    if (trigger) {
      trigger.addEventListener("click", () => {
        modal.classList.add("active");
      });
    }

    const closeBtn = modal.querySelector(".modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.classList.remove("active");
      });
    }

    if (submit && submitCallback) {
      submit.addEventListener("click", submitCallback);
    }
  },

  async loadAll() {
    await Promise.all([
      this.loadAuthStatus(),
      this.loadModels(),
      this.loadAgents(),
      this.loadMcpServers(),
      this.loadPlugins(),
      this.loadRemoteControl(),
      this.loadChangelog(),
      this.loadRules(),
      this.loadRawConfig(),
      this.loadWebhooks()
    ]);
  },

  async loadAuthStatus() {
    try {
      const res = await fetch("/api/antigravity/auth/status", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const badge = document.getElementById("agy-auth-status-badge");
      const btn = document.getElementById("btn-settings-agy-login");
      const notice = document.getElementById("agy-auth-notice");

      if (data.authenticated) {
        if (badge) {
          badge.innerText = "● Authenticated";
          badge.style.background = "rgba(46, 160, 67, 0.2)";
          badge.style.color = "#3fb950";
        }
        if (btn) {
          btn.innerText = "Re-authenticate Google";
          btn.className = "btn-secondary";
        }
        if (notice) {
          notice.innerText = "✅ Antigravity CLI is authenticated with Google and ready to run autonomous agents.";
          notice.style.color = "#3fb950";
        }
      } else {
        if (badge) {
          badge.innerText = "○ Login Required";
          badge.style.background = "rgba(248, 81, 73, 0.2)";
          badge.style.color = "#ff7b72";
        }
        if (btn) {
          btn.innerText = "Sign In with Google";
          btn.className = "btn-primary";
        }
        if (notice) {
          notice.innerText = "⚠️ Antigravity CLI is not logged into Google yet. Click 'Sign In with Google' to authorize.";
          notice.style.color = "var(--text-muted)";
        }
      }
    } catch (e) {
      console.error("Failed to load Antigravity auth status:", e);
    }
  },

  async startAuthFlow() {
    const btn = document.getElementById("btn-settings-agy-login");
    if (btn) {
      btn.disabled = true;
      btn.innerText = "Starting OAuth...";
    }
    try {
      const res = await fetch("/api/antigravity/auth/start", {
        method: "POST",
        headers: Auth.getAuthHeaders()
      });
      const data = await res.json();
      if (btn) {
        btn.disabled = false;
        btn.innerText = "Sign In with Google";
      }

      if (data.authenticated) {
        alert("Antigravity CLI is already authenticated!");
        this.loadAuthStatus();
        return;
      }

      if (data.auth_url) {
        if (typeof window.showAntigravityAuthModal === "function") {
          window.showAntigravityAuthModal(data);
        } else if (typeof Chat !== "undefined" && typeof Chat.showAntigravityAuthModal === "function") {
          Chat.showAntigravityAuthModal(data);
        } else {
          window.open(data.auth_url, "_blank");
        }
      } else {
        alert(data.message || "Failed to retrieve Google OAuth URL. Please check VPS logs.");
      }
    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.innerText = "Sign In with Google";
      }
      alert("Failed to initiate auth flow: " + e.message);
    }
  },

  async loadModels() {
    try {
      const res = await fetch("/api/settings/models", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const table = document.getElementById("settings-models-table");
      table.innerHTML = "";

      const chatModelSelect = document.getElementById("chat-model-select");
      if (chatModelSelect && (data.models || []).length > 0) {
        chatModelSelect.innerHTML = "";
      }

      (data.models || []).forEach(m => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><code>${m.id}</code></td>
          <td><strong>${m.name}</strong></td>
        `;
        table.appendChild(tr);

        if (chatModelSelect) {
          const opt = document.createElement("option");
          opt.value = m.id;
          opt.innerText = m.name;
          if (m.id === "gemini-3.8-flash") {
            opt.selected = true;
          }
          chatModelSelect.appendChild(opt);
        }
      });
    } catch (e) {
      console.warn("Error loading models:", e);
    }
  },

  async loadAgents() {
    try {
      const res = await fetch("/api/settings/agents", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const table = document.getElementById("settings-agents-table");
      table.innerHTML = "";

      (data.agents || []).forEach(a => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><code>${a.name}</code></td>
          <td>${a.description || '-'}</td>
        `;
        table.appendChild(tr);
      });
    } catch (e) {
      console.warn("Error loading agents:", e);
    }
  },

  async loadMcpServers() {
    try {
      const res = await fetch("/api/settings/mcp", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const table = document.getElementById("settings-mcp-table");
      table.innerHTML = "";

      (data.mcp_servers || []).forEach(s => {
        const tr = document.createElement("tr");
        const isEnabled = s.status === "enabled";
        tr.innerHTML = `
          <td><strong>${s.name}</strong></td>
          <td><code>${s.type}</code></td>
          <td><span class="tool-badge ${isEnabled ? 'badge-done' : 'badge-failed'}">${s.status}</span></td>
          <td><code style="font-size:11px;">${s.command || '-'}</code></td>
          <td>
            <button class="btn-icon btn-toggle-mcp" data-name="${s.name}" data-action="${isEnabled ? 'disable' : 'enable'}">
              ${isEnabled ? 'Disable' : 'Enable'}
            </button>
            <button class="btn-icon btn-remove-mcp" data-name="${s.name}" style="color: var(--accent-red)">Remove</button>
          </td>
        `;
        table.appendChild(tr);
      });

      table.querySelectorAll(".btn-toggle-mcp").forEach(btn => {
        btn.addEventListener("click", async () => {
          const name = btn.getAttribute("data-name");
          const action = btn.getAttribute("data-action");
          await fetch("/api/settings/mcp", {
            method: "POST",
            headers: Auth.getAuthHeaders(),
            body: JSON.stringify({ action, name })
          });
          this.loadMcpServers();
        });
      });

      table.querySelectorAll(".btn-remove-mcp").forEach(btn => {
        btn.addEventListener("click", async () => {
          const name = btn.getAttribute("data-name");
          if (!confirm(`Remove MCP server ${name}?`)) return;
          await fetch("/api/settings/mcp", {
            method: "POST",
            headers: Auth.getAuthHeaders(),
            body: JSON.stringify({ action: "remove", name })
          });
          this.loadMcpServers();
        });
      });
    } catch (e) {
      console.warn("Error loading MCP servers:", e);
    }
  },

  async addMcpServer() {
    const name = document.getElementById("mcp-name").value.trim();
    const type = document.getElementById("mcp-type").value;
    const command = document.getElementById("mcp-command").value.trim();
    const argsRaw = document.getElementById("mcp-args") ? document.getElementById("mcp-args").value.trim() : "";
    const envRaw = document.getElementById("mcp-env-vars") ? document.getElementById("mcp-env-vars").value.trim() : "";
    const headersRaw = document.getElementById("mcp-headers") ? document.getElementById("mcp-headers").value.trim() : "";

    if (!name || !command) {
      alert("Server name and command/URL are required.");
      return;
    }

    const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];
    const env_vars = envRaw ? envRaw.split("\n").map(s => s.trim()).filter(Boolean) : [];
    const headers = headersRaw ? headersRaw.split("\n").map(s => s.trim()).filter(Boolean) : [];

    try {
      const res = await fetch("/api/settings/mcp", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({
          action: "add",
          name,
          type,
          command,
          args,
          env_vars,
          headers
        })
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Failed to add MCP server");
      document.getElementById("mcp-modal").classList.remove("active");
      this.loadMcpServers();
    } catch (e) {
      alert("Error: " + e.message);
    }
  },

  async loadPlugins() {
    try {
      const res = await fetch("/api/settings/plugins", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const table = document.getElementById("settings-plugins-table");
      table.innerHTML = "";

      (data.plugins || []).forEach(p => {
        const tr = document.createElement("tr");
        const isEnabled = p.status === "enabled";
        tr.innerHTML = `
          <td><strong>${p.name}</strong></td>
          <td><span class="tool-badge ${isEnabled ? 'badge-done' : 'badge-failed'}">${p.status}</span></td>
          <td>${p.version || '-'}</td>
          <td><code style="font-size:11px;">${p.components || '-'}</code></td>
          <td>
            <button class="btn-icon btn-toggle-plugin" data-name="${p.name}" data-action="${isEnabled ? 'disable' : 'enable'}">
              ${isEnabled ? 'Disable' : 'Enable'}
            </button>
            <button class="btn-icon btn-uninstall-plugin" data-name="${p.name}" style="color: var(--accent-red)">
              Uninstall
            </button>
          </td>
        `;
        table.appendChild(tr);
      });

      table.querySelectorAll(".btn-toggle-plugin").forEach(btn => {
        btn.addEventListener("click", async () => {
          const name = btn.getAttribute("data-name");
          const action = btn.getAttribute("data-action");
          await fetch("/api/settings/plugins", {
            method: "POST",
            headers: Auth.getAuthHeaders(),
            body: JSON.stringify({ action, name })
          });
          this.loadPlugins();
        });
      });

      table.querySelectorAll(".btn-uninstall-plugin").forEach(btn => {
        btn.addEventListener("click", async () => {
          const name = btn.getAttribute("data-name");
          if (!confirm(`Uninstall plugin ${name}?`)) return;
          await fetch("/api/settings/plugins", {
            method: "POST",
            headers: Auth.getAuthHeaders(),
            body: JSON.stringify({ action: "uninstall", name })
          });
          this.loadPlugins();
        });
      });
    } catch (e) {
      console.warn("Error loading plugins:", e);
    }
  },

  async installPlugin() {
    const input = document.getElementById("plugin-install-target");
    const target = input ? input.value.trim() : "";
    if (!target) return alert("Please enter a plugin target or name.");

    try {
      const res = await fetch("/api/settings/plugins", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ action: "install", name: target })
      });
      const data = await res.json();
      alert(data.message || (data.success ? "Plugin installed!" : "Failed to install plugin."));
      document.getElementById("plugin-install-modal").classList.remove("active");
      this.loadPlugins();
    } catch (e) {
      alert("Error: " + e.message);
    }
  },

  async importPlugins() {
    const source = document.getElementById("plugin-import-source").value;
    try {
      const res = await fetch("/api/settings/plugins/import", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ source })
      });
      const data = await res.json();
      alert(data.message || (data.success ? "Plugins imported!" : "Import finished."));
      document.getElementById("plugin-import-modal").classList.remove("active");
      this.loadPlugins();
    } catch (e) {
      alert("Error importing plugins: " + e.message);
    }
  },

  async validatePlugin() {
    const path = document.getElementById("plugin-validate-path").value.trim() || ".";
    const strict = document.getElementById("plugin-validate-strict").checked;
    const outputBox = document.getElementById("plugin-validate-output");
    outputBox.style.display = "block";
    outputBox.innerText = "Running validation...";

    try {
      const res = await fetch("/api/settings/plugins/validate", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ path, strict })
      });
      const data = await res.json();
      outputBox.innerText = data.report || (data.success ? "Validation passed with 0 findings." : "Validation failed.");
    } catch (e) {
      outputBox.innerText = "Error: " + e.message;
    }
  },

  async linkPlugin() {
    const mp = document.getElementById("plugin-link-mp").value.trim();
    const target = document.getElementById("plugin-link-target").value.trim();
    if (!mp || !target) return alert("Marketplace and target link URI are required.");

    try {
      const res = await fetch("/api/settings/plugins/link", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ marketplace: mp, target })
      });
      const data = await res.json();
      alert(data.message || (data.success ? "Link created!" : "Failed to link marketplace."));
      document.getElementById("plugin-link-modal").classList.remove("active");
    } catch (e) {
      alert("Error: " + e.message);
    }
  },

  async loadRemoteControl() {
    try {
      const res = await fetch("/api/settings/remote-control", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const badge = document.getElementById("remote-control-status-badge");
      const nameInput = document.getElementById("rc-instance-name");
      const output = document.getElementById("rc-status-output");

      if (badge) {
        if (data.status === "active") {
          badge.innerText = "● Active";
          badge.style.background = "rgba(46, 160, 67, 0.2)";
          badge.style.color = "#3fb950";
        } else {
          badge.innerText = "○ Inactive";
          badge.style.background = "rgba(139, 148, 158, 0.2)";
          badge.style.color = "var(--text-muted)";
        }
      }
      if (nameInput && data.instance_name) {
        nameInput.value = data.instance_name;
      }
      if (output) {
        output.innerText = data.raw_output || `Daemon status: ${data.status}`;
      }
    } catch (e) {
      console.warn("Failed to load remote-control status:", e);
    }
  },

  async startRemoteControl() {
    const name = document.getElementById("rc-instance-name").value.trim();
    const session = document.getElementById("rc-session-scope").checked;
    try {
      const res = await fetch("/api/settings/remote-control", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ action: "start", name, session })
      });
      const data = await res.json();
      alert(data.message || (data.success ? "Remote control daemon started!" : "Failed to start daemon."));
      this.loadRemoteControl();
    } catch (e) {
      alert("Error starting daemon: " + e.message);
    }
  },

  async stopRemoteControl() {
    try {
      const res = await fetch("/api/settings/remote-control", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ action: "stop" })
      });
      const data = await res.json();
      alert(data.message || "Daemon stopped.");
      this.loadRemoteControl();
    } catch (e) {
      alert("Error stopping daemon: " + e.message);
    }
  },

  async loadChangelog() {
    const viewer = document.getElementById("changelog-viewer");
    if (!viewer) return;
    try {
      const res = await fetch("/api/settings/changelog", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      this.rawChangelogText = data.changelog || "No changelog available.";
      viewer.innerText = this.rawChangelogText;
    } catch (e) {
      viewer.innerText = "Failed to load changelog: " + e.message;
    }
  },

  filterChangelog(query) {
    const viewer = document.getElementById("changelog-viewer");
    if (!viewer || !this.rawChangelogText) return;
    if (!query.trim()) {
      viewer.innerText = this.rawChangelogText;
      return;
    }

    const lines = this.rawChangelogText.split("\n");
    const matching = [];
    let currentVersion = "";
    lines.forEach(line => {
      if (/^\d+\.\d+\.\d+/.test(line)) {
        currentVersion = line;
      }
      if (line.toLowerCase().includes(query.toLowerCase())) {
        if (currentVersion && !matching.includes(currentVersion)) {
          matching.push(currentVersion);
        }
        matching.push(line);
      }
    });

    viewer.innerText = matching.length > 0 ? matching.join("\n") : `No release notes found matching "${query}".`;
  },

  async updateCli() {
    const output = document.getElementById("agy-maintenance-output");
    output.style.display = "block";
    output.innerText = "Executing `agy update` on VPS/container...\nPlease wait...";

    try {
      const res = await fetch("/api/settings/update", {
        method: "POST",
        headers: Auth.getAuthHeaders()
      });
      const data = await res.json();
      output.innerText = data.message || (data.success ? "Antigravity CLI updated successfully!" : "Update failed.");
      this.loadChangelog();
    } catch (e) {
      output.innerText = "Error updating CLI: " + e.message;
    }
  },

  async installCli() {
    const output = document.getElementById("agy-maintenance-output");
    output.style.display = "block";
    output.innerText = "Running `agy install` to configure environment paths and shell profiles...";

    try {
      const res = await fetch("/api/settings/install", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({})
      });
      const data = await res.json();
      output.innerText = data.message || "Shell environment configured successfully.";
    } catch (e) {
      output.innerText = "Error running agy install: " + e.message;
    }
  },

  async loadRules() {
    try {
      const res = await fetch("/api/settings/rules", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const content = data.rules["GEMINI.md"] || data.rules["AGENTS.md"] || "";
      document.getElementById("rules-textarea").value = content;
    } catch (e) {
      console.warn("Error loading rules:", e);
    }
  },

  async saveRules() {
    const content = document.getElementById("rules-textarea").value;
    try {
      const res = await fetch("/api/settings/rules", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ filename: "GEMINI.md", content })
      });
      if (res.ok) alert("GEMINI.md rules saved successfully!");
    } catch (e) {
      alert("Failed to save rules: " + e.message);
    }
  },

  async loadRawConfig() {
    try {
      const res = await fetch("/api/settings/raw", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      document.getElementById("raw-config-textarea").value = JSON.stringify(data, null, 2);
    } catch (e) {
      console.warn("Error loading raw config:", e);
    }
  },

  async saveRawConfig() {
    const rawText = document.getElementById("raw-config-textarea").value;
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      alert("Invalid JSON format: " + err.message);
      return;
    }

    try {
      const res = await fetch("/api/settings/raw", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({
          settings: parsed.settings,
          config: parsed.config
        })
      });
      if (res.ok) alert("Raw Antigravity configuration updated!");
    } catch (e) {
      alert("Failed to save raw config: " + e.message);
    }
  },

  async loadWebhooks() {
    try {
      const res = await fetch("/api/settings/webhooks", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.telegram_token_configured) {
        document.getElementById("webhook-tg-token").placeholder = "•••••••••••• (Configured)";
      }
      document.getElementById("webhook-tg-chat").value = data.telegram_chat_id || "";
      if (data.discord_url_configured) {
        document.getElementById("webhook-discord-url").placeholder = "•••••••••••• (Configured)";
      }
      if (data.slack_url_configured) {
        document.getElementById("webhook-slack-url").placeholder = "•••••••••••• (Configured)";
      }
      document.getElementById("webhook-generic-url").value = data.generic_url || "";
      if (document.getElementById("webhook-notify-swarms") && data.notify_swarms !== undefined) {
        document.getElementById("webhook-notify-swarms").checked = Boolean(data.notify_swarms);
      }
      if (document.getElementById("webhook-notify-all-tasks") && data.notify_all_tasks !== undefined) {
        document.getElementById("webhook-notify-all-tasks").checked = Boolean(data.notify_all_tasks);
      }
      if (document.getElementById("webhook-min-duration") && data.min_duration_seconds !== undefined) {
        document.getElementById("webhook-min-duration").value = data.min_duration_seconds;
      }
    } catch (e) {
      console.warn("Error loading webhooks:", e);
    }
  },

  async saveWebhooks() {
    const tgToken = document.getElementById("webhook-tg-token").value.trim();
    const tgChat = document.getElementById("webhook-tg-chat").value.trim();
    const discordUrl = document.getElementById("webhook-discord-url").value.trim();
    const slackUrl = document.getElementById("webhook-slack-url").value.trim();
    const genericUrl = document.getElementById("webhook-generic-url").value.trim();
    const notifySwarms = document.getElementById("webhook-notify-swarms") ? document.getElementById("webhook-notify-swarms").checked : true;
    const notifyAllTasks = document.getElementById("webhook-notify-all-tasks") ? document.getElementById("webhook-notify-all-tasks").checked : false;
    const minDuration = document.getElementById("webhook-min-duration") ? parseInt(document.getElementById("webhook-min-duration").value, 10) : 10;

    const payload = {
      notify_swarms: notifySwarms,
      notify_all_tasks: notifyAllTasks,
      min_duration_seconds: isNaN(minDuration) ? 10 : minDuration
    };
    if (tgToken) payload.telegram_token = tgToken;
    if (tgChat) payload.telegram_chat_id = tgChat;
    if (discordUrl) payload.discord_url = discordUrl;
    if (slackUrl) payload.slack_url = slackUrl;
    if (genericUrl) payload.generic_url = genericUrl;

    try {
      const res = await fetch("/api/settings/webhooks", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("Webhook channels updated successfully!");
        this.loadWebhooks();
      }
    } catch (e) {
      alert("Error saving webhooks: " + e.message);
    }
  },

  async testWebhooks() {
    try {
      const res = await fetch("/api/settings/webhooks/test", {
        method: "POST",
        headers: Auth.getAuthHeaders()
      });
      if (res.ok) {
        alert("Test notification sent! Check your Telegram/Discord/Slack channel.");
      } else {
        alert("Failed to send test notification.");
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  }
};
