/**
 * Antigravity Settings & Integration Dashboard Module
 */
const Settings = {
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
        document.getElementById(tabId).classList.add("active");
      });
    });

    // MCP Modal
    const mcpModal = document.getElementById("mcp-modal");
    document.getElementById("btn-add-mcp-modal").addEventListener("click", () => {
      mcpModal.classList.add("active");
    });
    mcpModal.querySelector(".modal-close").addEventListener("click", () => {
      mcpModal.classList.remove("active");
    });
    document.getElementById("btn-save-mcp").addEventListener("click", () => this.addMcpServer());

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

  async loadAll() {
    await Promise.all([
      this.loadAuthStatus(),
      this.loadModels(),
      this.loadAgents(),
      this.loadMcpServers(),
      this.loadPlugins(),
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
        // Open in-app modal with authorization instructions and code submit button
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
      const chatSelect = document.getElementById("chat-model-select");
      
      table.innerHTML = "";
      chatSelect.innerHTML = "";

      (data.models || []).forEach(m => {
        // Table row
        const tr = document.createElement("tr");
        tr.innerHTML = `<td><code>${m.id}</code></td><td>${m.name}</td>`;
        table.appendChild(tr);

        // Chat dropdown option
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.innerText = m.name;
        if (m.id.includes("3.8-flash-high") || m.id.includes("flash")) opt.selected = true;
        chatSelect.appendChild(opt);
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
        tr.innerHTML = `<td><strong>${a.name}</strong></td><td>${a.description || '-'}</td>`;
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

      // Bind toggle & remove
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
    if (!name || !command) {
      alert("Name and command/URL are required.");
      return;
    }

    try {
      const res = await fetch("/api/settings/mcp", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ action: "add", name, type, command })
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
          <td>${p.components || '-'}</td>
          <td>
            <button class="btn-icon btn-toggle-plugin" data-name="${p.name}" data-action="${isEnabled ? 'disable' : 'enable'}">
              ${isEnabled ? 'Disable' : 'Enable'}
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
    } catch (e) {
      console.warn("Error loading plugins:", e);
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

    const payload = {};
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

