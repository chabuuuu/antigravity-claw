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
  },

  async loadAll() {
    await Promise.all([
      this.loadModels(),
      this.loadAgents(),
      this.loadMcpServers(),
      this.loadPlugins(),
      this.loadRules(),
      this.loadRawConfig()
    ]);
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
  }
};
