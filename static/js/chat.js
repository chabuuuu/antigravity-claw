/**
 * Chat & Agent Execution Workspace Module
 */
const Chat = {
  activeTaskId: null,
  activeConversationId: null,
  currentAssistantBubble: null,
  currentAssistantContent: null,
  currentThoughtBox: null,
  currentThoughtContent: null,
  activeToolCards: {},
  swarmChatPollTimer: null,
  commands: [],
  filteredCommands: [],
  selectedCommandIndex: 0,

  init() {
    this.bindEvents();
    this.loadConversations();
    this.loadAgentsList();
    this.loadCommands();
  },

  async loadCommands() {
    try {
      const res = await Auth.fetchWithAuth("/api/antigravity/commands");
      const data = await res.json();
      if (data && data.commands) {
        this.commands = data.commands;
      }
    } catch (e) {
      console.warn("Could not load Antigravity commands:", e);
    }
  },

  bindEvents() {
    const sendBtn = document.getElementById("btn-chat-send");
    const cancelBtn = document.getElementById("btn-chat-cancel");
    const textarea = document.getElementById("chat-textarea");
    const newSessionBtn = document.getElementById("btn-new-session");
    const toggleFlagsBtn = document.getElementById("btn-toggle-advanced-flags");

    sendBtn.addEventListener("click", () => this.sendPrompt());
    cancelBtn.addEventListener("click", () => this.cancelTask());
    newSessionBtn.addEventListener("click", () => this.startNewSession());

    if (toggleFlagsBtn) {
      toggleFlagsBtn.addEventListener("click", () => {
        const panel = document.getElementById("chat-advanced-flags-panel");
        if (panel) {
          const isShown = panel.style.display === "flex";
          panel.style.display = isShown ? "none" : "flex";
          toggleFlagsBtn.style.background = isShown ? "" : "rgba(56, 139, 253, 0.25)";
        }
      });
    }

    textarea.addEventListener("keydown", (e) => {
      const popup = document.getElementById("slash-commands-popup");
      const isPopupVisible = popup && popup.style.display !== "none";

      if (isPopupVisible) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (this.filteredCommands.length > 0) {
            this.selectedCommandIndex = (this.selectedCommandIndex + 1) % this.filteredCommands.length;
            this.updateSlashSelection();
          }
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (this.filteredCommands.length > 0) {
            this.selectedCommandIndex = (this.selectedCommandIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
            this.updateSlashSelection();
          }
          return;
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (this.filteredCommands[this.selectedCommandIndex]) {
            this.selectSlashCommand(this.filteredCommands[this.selectedCommandIndex]);
          }
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.hideSlashPopup();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendPrompt();
      }
    });

    // Slash command autocomplete input listener
    textarea.addEventListener("input", () => {
      this.handleSlashInput();
    });

    // Quick Action Chips
    const quickChips = document.querySelectorAll(".quick-chip");
    quickChips.forEach(chip => {
      chip.addEventListener("click", () => {
        const cmd = chip.dataset.cmd || "";
        textarea.value = cmd;
        textarea.focus();
        if (cmd.endsWith(" ")) {
          textarea.setSelectionRange(cmd.length, cmd.length);
        }
        this.handleSlashInput();
      });
    });

    // Close slash popup on click outside
    document.addEventListener("click", (e) => {
      const popup = document.getElementById("slash-commands-popup");
      if (popup && !popup.contains(e.target) && e.target !== textarea) {
        this.hideSlashPopup();
      }
    });

    // Auto-grow textarea
    textarea.addEventListener("input", function() {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 180) + "px";
    });

    // Antigravity CLI Google Auth Modal events
    const agyModalClose = document.getElementById("btn-agy-auth-close");
    const agySubmitBtn = document.getElementById("btn-agy-auth-submit");
    const agyCodeInput = document.getElementById("agy-auth-code-input");

    if (agyModalClose) {
      agyModalClose.addEventListener("click", () => {
        const modal = document.getElementById("agy-auth-modal");
        if (modal) {
          modal.style.display = "none";
          modal.classList.remove("active");
        }
      });
    }

    if (agySubmitBtn) {
      agySubmitBtn.addEventListener("click", () => this.submitAntigravityAuthCode());
    }

    if (agyCodeInput) {
      agyCodeInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submitAntigravityAuthCode();
        }
      });
    }

    // Sessions search filter
    const convSearch = document.getElementById("conv-search-input");
    if (convSearch) {
      convSearch.addEventListener("input", (e) => {
        this.filterConversations(e.target.value);
      });
    }
  },

  handleSlashInput() {
    const textarea = document.getElementById("chat-textarea");
    if (!textarea) return;
    const val = textarea.value;

    if (!val.startsWith("/")) {
      this.hideSlashPopup();
      return;
    }

    const match = val.match(/^\/([a-zA-Z0-9_\-:]*)/);
    if (!match) {
      this.hideSlashPopup();
      return;
    }

    const query = match[1].toLowerCase();
    this.filteredCommands = (this.commands || []).filter(c => {
      const name = c.name.toLowerCase().replace(/^\//, "");
      const desc = (c.description || "").toLowerCase();
      const cat = (c.category || "").toLowerCase();
      return name.includes(query) || desc.includes(query) || cat.includes(query);
    });

    if (this.filteredCommands.length === 0) {
      this.hideSlashPopup();
      return;
    }

    this.selectedCommandIndex = 0;
    this.renderSlashPopup();
  },

  renderSlashPopup() {
    const popup = document.getElementById("slash-commands-popup");
    const list = document.getElementById("slash-commands-list");
    if (!popup || !list) return;

    list.innerHTML = "";
    this.filteredCommands.slice(0, 20).forEach((cmd, idx) => {
      const item = document.createElement("div");
      item.className = "slash-item" + (idx === this.selectedCommandIndex ? " selected" : "");
      item.innerHTML = `
        <div class="slash-item-left">
          <span class="slash-item-icon">${cmd.icon || "⚡"}</span>
          <span class="slash-item-cmd">${cmd.name}</span>
          <span class="slash-item-desc">${this.escapeHtml(cmd.description || "")}</span>
        </div>
        <span class="slash-item-cat">${this.escapeHtml(cmd.category || "Builtin")}</span>
      `;
      item.addEventListener("click", () => {
        this.selectSlashCommand(cmd);
      });
      list.appendChild(item);
    });

    popup.style.display = "flex";
  },

  updateSlashSelection() {
    const list = document.getElementById("slash-commands-list");
    if (!list) return;
    const items = list.querySelectorAll(".slash-item");
    items.forEach((item, idx) => {
      if (idx === this.selectedCommandIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  },

  selectSlashCommand(cmd) {
    const textarea = document.getElementById("chat-textarea");
    if (!textarea) return;
    const cmdText = cmd.name + " ";
    textarea.value = cmdText;
    textarea.focus();
    textarea.setSelectionRange(cmdText.length, cmdText.length);
    this.hideSlashPopup();
  },

  hideSlashPopup() {
    const popup = document.getElementById("slash-commands-popup");
    if (popup) popup.style.display = "none";
  },

  async loadConversations() {
    try {
      const res = await fetch("/api/agent/conversations", {
        headers: Auth.getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      this.conversationsList = data.conversations || [];
      const convSearch = document.getElementById("conv-search-input");
      const query = convSearch ? convSearch.value : "";
      this.filterConversations(query);
    } catch (e) {
      console.warn("Failed to load conversations:", e);
    }
  },

  filterConversations(query) {
    const listContainer = document.getElementById("conversations-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const q = (query || "").toLowerCase().trim();
    const filtered = (this.conversationsList || []).filter(c => {
      if (!q) return true;
      const t = (c.title || "").toLowerCase();
      const m = (c.model || "").toLowerCase();
      return t.includes(q) || m.includes(q);
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 16px 8px; text-align: center; color: var(--text-muted); font-size: 11px;">
          ${q ? "No matching sessions" : "No recent sessions"}
        </div>
      `;
      return;
    }

    filtered.forEach(conv => {
      const item = document.createElement("div");
      const isActive = conv.conversation_id === this.activeConversationId;
      item.className = `conv-item ${isActive ? 'active' : ''}`;
      
      const timeAgo = this.formatTimeAgo(conv.updated_at || conv.created_at);
      const isTeam = (conv.title || "").startsWith("/teamwork") || (conv.title || "").startsWith("/boost");
      const icon = isTeam ? "👥" : "💬";

      item.innerHTML = `
        <div class="conv-item-main">
          <span class="conv-item-icon">${icon}</span>
          <div class="conv-item-text">
            <span class="conv-item-title">${this.escapeHtml(conv.title || "Untitled Session")}</span>
            <span class="conv-item-time">${timeAgo}</span>
          </div>
        </div>
        <button class="btn-conv-delete" title="Delete conversation">✕</button>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".btn-conv-delete")) return;
        this.loadConversation(conv.conversation_id);
        if (typeof App !== "undefined" && App.closeMobileSidebar) App.closeMobileSidebar();
      });

      const delBtn = item.querySelector(".btn-conv-delete");
      if (delBtn) {
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm(`Delete session "${conv.title || 'Untitled'}"?`)) {
            await this.deleteConversation(conv.conversation_id);
          }
        });
      }

      listContainer.appendChild(item);
    });
  },

  async deleteConversation(convId) {
    try {
      const res = await fetch(`/api/agent/conversations/${convId}`, {
        method: "DELETE",
        headers: Auth.getAuthHeaders()
      });
      if (res.ok) {
        if (this.activeConversationId === convId) {
          this.startNewSession();
        } else {
          this.loadConversations();
        }
      }
    } catch (e) {
      console.error("Failed to delete conversation:", e);
    }
  },

  formatTimeAgo(isoString) {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const diffSec = Math.floor((new Date() - date) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch (e) {
      return "";
    }
  },

  async loadAgentsList() {
    const select = document.getElementById("chat-agent-select");
    if (!select) return;
    try {
      const res = await fetch("/api/settings/agents", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      select.innerHTML = '<option value="">Default Agent</option>';
      (data.agents || []).forEach(ag => {
        const opt = document.createElement("option");
        opt.value = ag.name;
        opt.innerText = ag.name + (ag.description ? ` (${ag.description})` : "");
        select.appendChild(opt);
      });
    } catch (e) {
      console.warn("Failed to load agents list:", e);
    }
  },

  startNewSession() {
    this.stopSwarmPolling();
    this.activeConversationId = null;
    this.activeTaskId = null;
    if (typeof App !== "undefined" && App.closeMobileSidebar) App.closeMobileSidebar();
    const container = document.getElementById("chat-messages");
    container.innerHTML = `
      <div class="message-bubble assistant-message">
        <div class="message-avatar">🦅</div>
        <div class="message-body">
          <h3>New Session Started</h3>
          <p>I am ready for a new task. What would you like to build or inspect today?</p>
        </div>
      </div>
    `;
    this.loadConversations();
  },

  async loadConversation(convId) {
    try {
      this.stopSwarmPolling();
      const res = await fetch(`/api/agent/conversations/${convId}`, {
        headers: Auth.getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      this.activeConversationId = convId;

      const container = document.getElementById("chat-messages");
      container.innerHTML = "";

      (data.messages || []).forEach(msg => {
        if (msg.role === "user") {
          this.appendUserMessage(msg.content);
        } else {
          this.appendAssistantBubble(msg.content);
        }
      });

      // If there is an active running task for this conversation, restore live monitoring state
      if (data.active_task && data.active_task.status === "RUNNING") {
        this.activeTaskId = data.active_task.task_id;
        this.setExecutionState(true);
        this.prepareAssistantBubble();

        const promptText = data.active_task.prompt || "";
        const isSwarm = promptText.includes("/teamwork") || promptText.includes("/boost") || promptText.includes("/goal") || promptText.includes("/plan");

        if (isSwarm) {
          this.renderTeamworkActiveCard(data.active_task);
          this.startSwarmPolling(data.active_task.created_at);
        } else if (data.active_task.full_response) {
          this.currentAssistantContent.innerHTML = this.renderMarkdown(data.active_task.full_response);
        }

        // Re-subscribe on WebSocket
        if (window.AppWS && window.AppWS.readyState === WebSocket.OPEN) {
          window.AppWS.send(JSON.stringify({
            action: "subscribe_task",
            task_id: this.activeTaskId
          }));
        }
      } else {
        this.activeTaskId = null;
        this.setExecutionState(false);
      }

      this.loadConversations();
      this.scrollToBottom();
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
  },

  async sendPrompt() {
    const textarea = document.getElementById("chat-textarea");
    const prompt = textarea.value.trim();
    if (!prompt) return;

    textarea.value = "";
    textarea.style.height = "52px";

    const model = document.getElementById("chat-model-select").value;
    const effort = document.getElementById("chat-effort-select").value;
    const mode = document.getElementById("chat-mode-select").value;
    const agentSelect = document.getElementById("chat-agent-select");
    const agent = agentSelect ? agentSelect.value : "";
    const autoApprove = document.getElementById("chat-auto-approve").checked;
    const sandbox = document.getElementById("chat-sandbox").checked;
    const webhookNotify = document.getElementById("chat-webhook-notify") ? document.getElementById("chat-webhook-notify").checked : false;

    // Advanced Flags
    const continueSession = document.getElementById("chat-continue") ? document.getElementById("chat-continue").checked : false;
    const remoteAgent = document.getElementById("chat-remote-agent") ? document.getElementById("chat-remote-agent").checked : false;
    const projectSelect = document.getElementById("chat-project-select");
    let project = document.getElementById("chat-project") ? document.getElementById("chat-project").value.trim() : "";
    if (!project && projectSelect && projectSelect.value && projectSelect.value !== "Default" && projectSelect.value !== "__new__") {
      const pObj = (typeof Projects !== "undefined" && Projects.projects) ? Projects.projects.find(p => p.id === projectSelect.value || p.name === projectSelect.value) : null;
      project = pObj ? pObj.name : projectSelect.value;
    }
    const newProject = document.getElementById("chat-new-project") ? document.getElementById("chat-new-project").checked : false;
    const addDirs = document.getElementById("chat-add-dirs") ? document.getElementById("chat-add-dirs").value.split(",").map(s => s.trim()).filter(Boolean) : [];
    const disableSlashCommands = document.getElementById("chat-disable-slash-commands") ? document.getElementById("chat-disable-slash-commands").checked : false;
    const printTimeout = document.getElementById("chat-print-timeout") ? document.getElementById("chat-print-timeout").value.trim() : "";
    const jsonSchema = document.getElementById("chat-json-schema") ? document.getElementById("chat-json-schema").value.trim() : "";
    const sessionSettings = document.getElementById("chat-session-settings") ? document.getElementById("chat-session-settings").value.trim() : "";

    // Intercept /usage and /quota slash commands for instant interactive card
    if (prompt === "/usage" || prompt === "/quota") {
      this.appendUserMessage(prompt);
      this.setExecutionState(true);
      this.prepareAssistantBubble();
      try {
        const res = await fetch("/api/antigravity/usage", { headers: Auth.getAuthHeaders() });
        const data = await res.json();
        let quotaContent = `<h4 style="margin:0 0 6px; color:var(--accent-blue);">📊 Antigravity Models & Quota Usage</h4>`;
        quotaContent += `<p style="font-size:12px; color:#a5d6ff; margin:0 0 12px; font-family:var(--font-mono);">Account: <strong>${data.account_email || 'Google User'}</strong></p>`;
        (data.groups || []).forEach(g => {
          quotaContent += `<div style="margin-top:12px; font-weight:700; color:#7ee787; font-size:12px; letter-spacing:0.5px;">${g.name.toUpperCase()}</div>`;
          (g.buckets || []).forEach(b => {
            const pct = b.remaining_percent != null ? b.remaining_percent : 100;
            const barColor = pct <= 20 ? "var(--accent-red)" : (pct <= 50 ? "#d29922" : "#58a6ff");
            quotaContent += `
              <div style="margin: 8px 0 6px;">
                <div style="display:flex; justify-content:space-between; font-size:12px;">
                  <span style="color:var(--text-bright); font-weight:600;">${b.name}</span>
                  <span style="font-family:var(--font-mono); font-weight:700; color:${barColor};">${pct.toFixed(2)}%</span>
                </div>
                <div style="height:14px; background:#0b0e14; border-radius:4px; overflow:hidden; margin:4px 0; border:1px solid var(--border-color);">
                  <div style="width:${Math.max(pct,0)}%; height:100%; background:${barColor};"></div>
                </div>
                <div style="font-size:11px; color:var(--text-muted);">${b.countdown || 'Quota available'}</div>
              </div>
            `;
          });
        });
        this.currentAssistantContent.innerHTML = quotaContent;
        if (typeof Usage !== "undefined" && typeof Usage.render === "function") {
          Usage.data = data;
          Usage.updateHeaderBadge();
        }
      } catch (e) {
        this.appendErrorMessage("Failed to fetch quota: " + e.message);
      } finally {
        this.setExecutionState(false);
      }
      return;
    }

    // Intercept /help slash command for command cheat-sheet
    if (prompt === "/help") {
      this.appendUserMessage(prompt);
      this.setExecutionState(true);
      this.prepareAssistantBubble();
      let helpContent = `
        <h4 style="margin:0 0 8px; color:var(--accent-blue);">⚡ Antigravity CLI Slash Commands & Swarms</h4>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Type <code>/</code> in the input box anytime for interactive autocomplete.</p>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/teamwork &lt;goal&gt;</strong>: Autonomous team of agents (Coordinator, Researcher, Builder, QA) collaborating on complex missions.
          </div>
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/boost &lt;goal&gt;</strong>: Boost multi-agent orchestrator with deep reasoning, strategic planning, and multiple critical perspectives.
          </div>
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/plan &lt;goal&gt;</strong>: Plan step-by-step architecture and execution milestones before writing code.
          </div>
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/grill-me</strong>: Interactive interview mode to drill down into requirements, edge cases, and design choices.
          </div>
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/goal &lt;goal&gt;</strong>: Autonomous loop running until complete definition of done is achieved.
          </div>
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/learn</strong>: Reflect on recent successes or corrections to capture reusable skills or rules.
          </div>
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/usage (or /quota)</strong>: View real-time token quotas and rate limits across Gemini, Claude, and GPT models.
          </div>
          <div style="background:#0d1117; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <strong style="color:#79c0ff; font-family:var(--font-mono);">/skills</strong>: List and explore all 30+ installed Antigravity CLI skills.
          </div>
        </div>
      `;
      this.currentAssistantContent.innerHTML = helpContent;
      this.setExecutionState(false);
      return;
    }

    // Intercept /skills slash command for instant grid card
    if (prompt === "/skills") {
      this.appendUserMessage(prompt);
      this.setExecutionState(true);
      this.prepareAssistantBubble();
      try {
        const res = await fetch("/api/antigravity/skills", { headers: Auth.getAuthHeaders() });
        const data = await res.json();
        const skills = data.skills || [];
        let skillsHtml = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0; color:var(--accent-blue);">🧩 Antigravity Skills (${skills.length})</h4>
            <button type="button" class="btn-secondary" style="padding:4px 10px; font-size:11px;" onclick="App.switchView('skills')">Open Skills Catalog ➔</button>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px;">
        `;
        skills.forEach(s => {
          skillsHtml += `
            <div style="background:#0d1117; border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-family:var(--font-mono); font-size:11px; font-weight:700; color:#79c0ff;">/${s.name}</span>
                <span style="font-size:9px; padding:1px 5px; border-radius:6px; background:${s.builtin ? 'rgba(46,160,67,0.2)' : 'rgba(56,139,253,0.2)'}; color:${s.builtin ? '#7ee787' : '#a5d6ff'};">${s.plugin || 'builtin'}</span>
              </div>
              <p style="font-size:11px; color:var(--text-muted); margin:0; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.description || ''}</p>
            </div>
          `;
        });
        skillsHtml += `</div>`;
        this.currentAssistantContent.innerHTML = skillsHtml;
      } catch (e) {
        this.appendErrorMessage("Failed to load skills: " + e.message);
      } finally {
        this.setExecutionState(false);
      }
      return;
    }

    // Intercept /projects or /project slash command
    if (prompt === "/projects" || prompt === "/project") {
      this.appendUserMessage(prompt);
      this.setExecutionState(true);
      this.prepareAssistantBubble();
      try {
        const res = await Auth.fetchWithAuth("/api/projects");
        const data = await res.json();
        const projs = data.projects || [];
        let projsHtml = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="margin:0; color:#a371f7;">📁 Antigravity Projects (${projs.length})</h4>
            <button onclick="App.switchView('projects')" class="btn-primary" style="padding:4px 10px; font-size:11px; cursor:pointer;">Manage in Projects View ↗</button>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px;">
        `;
        projs.slice(0, 8).forEach(p => {
          const isActive = p.is_active;
          projsHtml += `
            <div style="background:#0d1117; border:1px solid ${isActive ? '#3fb950' : 'var(--border-color)'}; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:13px; font-weight:700; color:var(--text-bright);">${this.escapeHtml(p.name)}</span>
                ${isActive ? '<span style="font-size:9px; background:rgba(46,160,67,0.2); color:#7ee787; padding:2px 6px; border-radius:4px; font-weight:bold;">ACTIVE</span>' : ''}
              </div>
              <p style="font-size:11px; font-family:var(--font-mono); color:var(--text-muted); margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(p.path || 'No workspace directory')}</p>
              <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:4px;">
                <button onclick="Projects.setActiveProject('${this.escapeHtml(p.id)}')" class="btn-secondary" style="padding:3px 8px; font-size:11px; cursor:pointer;">${isActive ? 'Selected' : 'Switch Project'}</button>
              </div>
            </div>
          `;
        });
        projsHtml += `</div>`;
        this.currentAssistantContent.innerHTML = projsHtml;
      } catch (e) {
        this.appendErrorMessage("Failed to load projects: " + e.message);
      } finally {
        this.setExecutionState(false);
      }
      return;
    }

    // Display user message
    this.appendUserMessage(prompt);
    this.setExecutionState(true);

    // Prepare assistant response bubble
    this.prepareAssistantBubble();

    try {
      const payload = {
        prompt,
        conversation_id: this.activeConversationId,
        model,
        effort,
        mode,
        auto_approve: autoApprove,
        sandbox
      };
      if (agent) payload.agent = agent;
      if (continueSession) payload.continue = true;
      if (remoteAgent) payload.remote_agent = true;
      if (project) payload.project = project;
      if (newProject) payload.new_project = true;
      if (addDirs.length > 0) payload.add_dirs = addDirs;
      if (disableSlashCommands) payload.disable_slash_commands = true;
      if (printTimeout) payload.print_timeout = printTimeout;
      if (jsonSchema) payload.json_schema = jsonSchema;
      if (sessionSettings) payload.settings = sessionSettings;
      if (webhookNotify) payload.webhook_notify = true;

      const res = await fetch("/api/agent/prompt", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        this.appendErrorMessage(data.error || "Failed to start agent task.");
        this.setExecutionState(false);
        return;
      }

      this.activeTaskId = data.task_id;
      this.activeConversationId = data.conversation_id;

      // Detect swarm commands to activate live Swarm Activity Card in chat
      const isSwarm = prompt.includes("/teamwork") || prompt.includes("/boost") || prompt.includes("/goal") || prompt.includes("/plan");
      if (isSwarm) {
        this.renderTeamworkActiveCard({
          task_id: data.task_id,
          prompt: prompt,
          created_at: new Date().toISOString()
        });
        this.startSwarmPolling(new Date().toISOString());
      }

      // Subscribe on WebSocket
      if (window.AppWS && window.AppWS.readyState === WebSocket.OPEN) {
        window.AppWS.send(JSON.stringify({
          action: "subscribe_task",
          task_id: this.activeTaskId
        }));
      }
      this.loadConversations();
    } catch (e) {
      this.appendErrorMessage("Network error: " + e.message);
      this.setExecutionState(false);
    }
  },

  async cancelTask(taskIdOverride) {
    const targetTaskId = taskIdOverride || this.activeTaskId;
    try {
      this.stopSwarmPolling();
      if (targetTaskId) {
        await fetch("/api/agent/cancel", {
          method: "POST",
          headers: Auth.getAuthHeaders(),
          body: JSON.stringify({ task_id: targetTaskId })
        });
      }
      // Also stop multi-agent swarm processes if any were running
      await fetch("/api/teamwork/stop", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ task_id: targetTaskId || null })
      }).catch(() => {});

      this.appendSystemNotice("⚠️ Task cancellation requested by user.");
      this.setExecutionState(false);
    } catch (e) {
      console.error("Failed to cancel task:", e);
    }
  },

  setExecutionState(isRunning) {
    document.getElementById("btn-chat-send").style.display = isRunning ? "none" : "flex";
    document.getElementById("btn-chat-cancel").style.display = isRunning ? "flex" : "none";
  },

  appendUserMessage(text) {
    const container = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = "message-bubble user-message";
    bubble.innerHTML = `
      <div class="message-avatar">👤</div>
      <div class="message-body"><p>${this.escapeHtml(text).replace(/\n/g, '<br>')}</p></div>
    `;
    container.appendChild(bubble);
    this.scrollToBottom();
  },

  prepareAssistantBubble() {
    const container = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = "message-bubble assistant-message";
    
    bubble.innerHTML = `
      <div class="message-avatar">🦅</div>
      <div class="message-body">
        <div class="assistant-content"><span style="color: var(--text-muted);">Thinking...</span></div>
      </div>
    `;
    container.appendChild(bubble);
    this.currentAssistantBubble = bubble;
    this.currentAssistantContent = bubble.querySelector(".assistant-content");
    this.currentThoughtBox = null;
    this.currentThoughtContent = null;
    this.activeToolCards = {};
    this.scrollToBottom();
  },

  appendAssistantBubble(content) {
    const container = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = "message-bubble assistant-message";
    bubble.innerHTML = `
      <div class="message-avatar">🦅</div>
      <div class="message-body">
        <div class="assistant-content">${this.renderMarkdown(content)}</div>
      </div>
    `;
    container.appendChild(bubble);
    this.scrollToBottom();
  },

  appendErrorMessage(text) {
    const container = document.getElementById("chat-messages");
    const bubble = document.createElement("div");
    bubble.className = "message-bubble assistant-message";
    bubble.innerHTML = `
      <div class="message-avatar" style="background: var(--accent-red)">❌</div>
      <div class="message-body" style="border-color: var(--accent-red); color: #ff7b72;">
        <strong>Error:</strong> ${this.escapeHtml(text)}
      </div>
    `;
    container.appendChild(bubble);
    this.scrollToBottom();
  },

  appendSystemNotice(text) {
    const container = document.getElementById("chat-messages");
    const notice = document.createElement("div");
    notice.style.textAlign = "center";
    notice.style.fontSize = "12px";
    notice.style.color = "var(--text-muted)";
    notice.style.margin = "8px 0";
    notice.innerText = text;
    container.appendChild(notice);
    this.scrollToBottom();
  },

  handleStreamEvent(event) {
    if (event.task_id && event.task_id !== this.activeTaskId) return;

    if (event.type === "agent_init") {
      // Tools initialized
      if (this.currentAssistantContent && this.currentAssistantContent.innerText === "Thinking...") {
        this.currentAssistantContent.innerText = "";
      }
    } else if (event.type === "text_delta") {
      if (!this.currentAssistantContent) this.prepareAssistantBubble();
      if (this.currentAssistantContent.innerText === "Thinking...") {
        this.currentAssistantContent.innerText = "";
      }
      this.currentAssistantContent.innerHTML += this.escapeHtml(event.text_delta).replace(/\n/g, '<br>');
      this.scrollToBottom();
    } else if (event.type === "tool_call") {
      this.renderToolCard(event);
    } else if (event.type === "subagent_event") {
      this.renderSubagentCard(event);
    } else if (event.type === "antigravity_auth_required") {
      this.showAntigravityAuthModal(event);
    } else if (event.type === "agent_result") {
      this.renderTokenUsage(event.usage, event.duration_seconds);
    } else if (event.type === "task_completed") {
      this.stopSwarmPolling();
      this.setExecutionState(false);
      const modal = document.getElementById("agy-auth-modal");
      if (modal && modal.style.display === "flex") {
        modal.style.display = "none";
      }
      this.loadConversations();
    } else if (event.type === "error") {
      this.stopSwarmPolling();
      this.appendErrorMessage(event.message);
      this.setExecutionState(false);
    }
  },

  showAntigravityAuthModal(event) {
    const modal = document.getElementById("agy-auth-modal");
    const link = document.getElementById("agy-auth-url-link");
    const statusMsg = document.getElementById("agy-auth-status-msg");
    const input = document.getElementById("agy-auth-code-input");
    const submitBtn = document.getElementById("btn-agy-auth-submit");

    this.pendingAuthTaskId = event.task_id || this.activeTaskId;
    if (link && event.auth_url) {
      link.href = event.auth_url;
    }
    if (statusMsg) {
      statusMsg.innerText = "Follow Step 1 to open Google, then copy & paste the code into Step 2 below.";
      statusMsg.style.color = "var(--text-muted)";
    }
    if (input) {
      input.value = "";
    }
    if (submitBtn) {
      submitBtn.disabled = false;
    }
    if (modal) {
      modal.style.display = "flex";
      modal.classList.add("active");
      setTimeout(() => input && input.focus(), 150);
    }
  },

  async submitAntigravityAuthCode() {
    const input = document.getElementById("agy-auth-code-input");
    const statusMsg = document.getElementById("agy-auth-status-msg");
    const submitBtn = document.getElementById("btn-agy-auth-submit");
    let rawInput = input ? input.value.trim() : "";

    if (!rawInput) {
      if (statusMsg) {
        statusMsg.innerText = "Please paste the authorization code first.";
        statusMsg.style.color = "var(--accent-red)";
      }
      return;
    }

    // Smart extraction: if user pastes full callback URL, extract the code parameter
    let code = rawInput;
    if (rawInput.includes("code=")) {
      const match = rawInput.match(/[?&]code=([^&]+)/);
      if (match) {
        code = decodeURIComponent(match[1]);
      }
    }

    if (statusMsg) {
      statusMsg.innerText = "Submitting code to Antigravity CLI on VPS...";
      statusMsg.style.color = "var(--accent-blue)";
    }
    if (submitBtn) submitBtn.disabled = true;

    const taskId = this.pendingAuthTaskId || this.activeTaskId;

    // Send via WebSocket
    if (window.AppWS && window.AppWS.readyState === WebSocket.OPEN) {
      window.AppWS.send(JSON.stringify({
        action: "submit_antigravity_auth_code",
        task_id: taskId,
        code: code
      }));
    }

    // Also send via REST API as reliable fallback
    try {
      const res = await fetch("/api/antigravity/auth/submit", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ task_id: taskId, code: code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (statusMsg) {
          statusMsg.innerText = "✅ Authorization submitted! Antigravity is now logged in.";
          statusMsg.style.color = "#3fb950";
        }
        // Refresh auth status in settings if available
        if (typeof Settings !== "undefined" && typeof Settings.loadAuthStatus === "function") {
          Settings.loadAuthStatus();
        }
        setTimeout(() => {
          const modal = document.getElementById("agy-auth-modal");
          if (modal) {
            modal.style.display = "none";
            modal.classList.remove("active");
          }
          if (submitBtn) submitBtn.disabled = false;
        }, 1200);
      } else {
        if (statusMsg) {
          statusMsg.innerText = data.error || "Failed to submit code. Please try again.";
          statusMsg.style.color = "var(--accent-red)";
        }
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      console.error("Auth submit error:", err);
      if (statusMsg) {
        statusMsg.innerText = "Error submitting code: " + err.message;
        statusMsg.style.color = "var(--accent-red)";
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  },

  renderToolCard(event) {
    if (!this.currentAssistantBubble) return;
    const body = this.currentAssistantBubble.querySelector(".message-body");
    const stepIdx = event.step_index;
    
    let card = this.activeToolCards[stepIdx];
    if (!card) {
      card = document.createElement("div");
      card.className = "tool-card";
      card.innerHTML = `
        <div class="tool-header">
          <span>🛠️ <strong>${this.escapeHtml(event.tool_name || 'tool')}</strong></span>
          <span class="tool-badge badge-active">RUNNING</span>
        </div>
        <div class="tool-body">Loading parameters...</div>
      `;
      // Insert before assistant text content
      body.insertBefore(card, this.currentAssistantContent);
      this.activeToolCards[stepIdx] = card;
    }

    const badge = card.querySelector(".tool-badge");
    const toolBody = card.querySelector(".tool-body");

    if (event.state === "DONE") {
      badge.className = "tool-badge badge-done";
      badge.innerText = `DONE ${event.duration_seconds ? '(' + event.duration_seconds.toFixed(2) + 's)' : ''}`;
    }

    if (event.tool_info) {
      let displayContent = "";
      if (event.tool_info.parameters) {
        displayContent += "Input: " + JSON.stringify(event.tool_info.parameters, null, 2) + "\n\n";
      }
      if (event.tool_info.output) {
        displayContent += "Output:\n" + event.tool_info.output;
      }
      toolBody.innerText = displayContent || "Executed.";
    }
    this.scrollToBottom();
  },

  renderSubagentCard(event) {
    if (!this.currentAssistantBubble) return;
    const body = this.currentAssistantBubble.querySelector(".message-body");
    const stepIdx = event.step_index;

    let card = this.activeToolCards["subagent_" + stepIdx];
    if (!card) {
      card = document.createElement("div");
      card.className = "tool-card";
      card.style.borderColor = "rgba(56, 139, 253, 0.5)";
      card.innerHTML = `
        <div class="tool-header">
          <span>🤖 <strong>Subagent: ${this.escapeHtml(event.tool_name || 'Subagent')}</strong></span>
          <span class="tool-badge badge-active">RUNNING</span>
        </div>
        <div class="tool-body">Subagent task dispatched...</div>
      `;
      body.insertBefore(card, this.currentAssistantContent);
      this.activeToolCards["subagent_" + stepIdx] = card;
    }

    const badge = card.querySelector(".tool-badge");
    const toolBody = card.querySelector(".tool-body");

    if (event.state === "DONE") {
      badge.className = "tool-badge badge-done";
      badge.innerText = `COMPLETED ${event.duration_seconds ? '(' + event.duration_seconds.toFixed(2) + 's)' : ''}`;
    }

    if (event.subagent_info) {
      let displayContent = "";
      if (event.subagent_info.prompt) {
        displayContent += "Role Task: " + event.subagent_info.prompt + "\n";
      }
      if (event.subagent_info.result) {
        displayContent += "\nOutcome:\n" + event.subagent_info.result;
      }
      toolBody.innerText = displayContent || "Subagent executing workstream...";
    }
    this.scrollToBottom();
  },

  renderTeamworkActiveCard(task) {
    if (!this.currentAssistantContent) this.prepareAssistantBubble();
    const promptText = task.prompt || "";
    const isBoost = promptText.includes("/boost");
    const titleText = isBoost ? "🚀 Boost Multi-Agent Swarm In Progress" : "👥 Teamwork Multi-Agent Swarm In Progress";

    this.currentAssistantContent.innerHTML = `
      <div class="teamwork-active-card" id="chat-teamwork-card">
        <div class="teamwork-active-header">
          <div class="teamwork-pulse-indicator">
            <span class="pulse-dot"></span>
            <strong>${titleText}</strong>
          </div>
          <span class="swarm-timer" id="chat-swarm-timer">⏱️ 00:00</span>
        </div>
        <p class="teamwork-active-subtitle">Autonomous team coordinating explorers, spec creators, and builders for:<br><em style="color:var(--text-bright);">${this.escapeHtml(promptText)}</em></p>
        
        <div class="swarm-subagents-grid" id="chat-swarm-subagents">
          <div class="swarm-agent-pill active">👑 Coordinator Agent: Orchestrating</div>
          <div class="swarm-agent-pill running">🔍 Explorer Swarm: Initializing</div>
        </div>

        <div class="swarm-checklist-box">
          <div class="swarm-checklist-title">
            <span>Milestones & Progress</span>
            <span id="chat-swarm-iteration" style="font-family:var(--font-mono); color:var(--accent-blue);">Active</span>
          </div>
          <div class="swarm-checklist-items" id="chat-swarm-checklist">
            <div class="swarm-check-item pending"><span>⏳</span> <span>Decomposing mission into phased workstreams...</span></div>
          </div>
        </div>

        <div class="teamwork-active-footer">
          <button type="button" class="btn-secondary btn-sm" onclick="App.switchView('teamwork')">👥 Swarm Studio Details</button>
          <button type="button" class="btn-danger btn-sm" onclick="Chat.cancelTask()">🛑 Stop Swarm</button>
        </div>
      </div>
    `;
    this.scrollToBottom();
  },

  startSwarmPolling(startedAt) {
    this.stopSwarmPolling();
    const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();

    const updateTimer = () => {
      const timerEl = document.getElementById("chat-swarm-timer");
      if (!timerEl) return;
      const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
      const ss = String(elapsedSec % 60).padStart(2, "0");
      timerEl.innerText = `⏱️ ${mm}:${ss}`;
    };
    updateTimer();

    const pollStatus = async () => {
      updateTimer();
      try {
        const res = await Auth.fetchWithAuth("/api/teamwork/status");
        if (!res.ok) return;
        const data = await res.json();

        // Update iteration
        const iterEl = document.getElementById("chat-swarm-iteration");
        if (iterEl && data.iteration) {
          iterEl.innerText = data.iteration;
        }

        // Update subagents grid
        const subagentsEl = document.getElementById("chat-swarm-subagents");
        if (subagentsEl && data.subagents && data.subagents.length > 0) {
          subagentsEl.innerHTML = `<div class="swarm-agent-pill active">👑 Coordinator Agent: Orchestrating</div>`;
          data.subagents.forEach(s => {
            const isDone = s.status === "COMPLETED";
            const pillClass = isDone ? "completed" : "running";
            const icon = isDone ? "✅" : "⚡";
            const pill = document.createElement("div");
            pill.className = `swarm-agent-pill ${pillClass}`;
            pill.innerHTML = `<span>${icon}</span> <span>${this.escapeHtml(s.name)}</span> <small style="margin-left:auto; opacity:0.8;">${isDone ? 'Report Ready' : 'In Progress'}</small>`;
            subagentsEl.appendChild(pill);
          });
        }

        // Update checklist
        const checklistEl = document.getElementById("chat-swarm-checklist");
        if (checklistEl && data.checklist && data.checklist.length > 0) {
          checklistEl.innerHTML = "";
          data.checklist.forEach(item => {
            const el = document.createElement("div");
            el.className = `swarm-check-item ${item.done ? 'done' : 'pending'}`;
            el.innerHTML = `<span>${item.done ? '☑️' : '⏳'}</span> <span>${this.escapeHtml(item.task)}</span>`;
            checklistEl.appendChild(el);
          });
        }

        // If no longer active and task has finished
        if (!data.active && !this.activeTaskId) {
          this.stopSwarmPolling();
        }
      } catch (e) {
        console.warn("Chat swarm polling error:", e);
      }
    };

    pollStatus();
    this.swarmChatPollTimer = setInterval(pollStatus, 3000);
  },

  stopSwarmPolling() {
    if (this.swarmChatPollTimer) {
      clearInterval(this.swarmChatPollTimer);
      this.swarmChatPollTimer = null;
    }
  },

  renderTokenUsage(usage, duration) {
    if (!this.currentAssistantBubble || !usage) return;
    const body = this.currentAssistantBubble.querySelector(".message-body");
    const statsDiv = document.createElement("div");
    statsDiv.className = "message-stats";
    
    const inTokens = usage.input_tokens || 0;
    const outTokens = usage.output_tokens || 0;
    const thinkTokens = usage.thinking_tokens || 0;
    const durSec = duration ? `${duration.toFixed(2)}s` : "-";

    statsDiv.innerHTML = `
      <span>⚡ Duration: <strong>${durSec}</strong></span>
      <span>📥 In: <strong>${inTokens.toLocaleString()}</strong></span>
      <span>📤 Out: <strong>${outTokens.toLocaleString()}</strong></span>
      <span>🧠 Reasoning: <strong>${thinkTokens.toLocaleString()}</strong></span>
    `;
    body.appendChild(statsDiv);
    this.scrollToBottom();
  },

  renderMarkdown(text) {
    if (!text) return "";
    // Preserve code blocks before escaping
    const codeBlocks = [];
    let processed = text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang, code: this.escapeHtml(code.trim()) });
      return `__CODE_BLOCK_${idx}__`;
    });

    // Escape prose HTML
    processed = this.escapeHtml(processed);

    // Bold & Italics
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Inline code
    processed = processed.replace(/`([^`]+)`/g, '<code style="background: var(--bg-tertiary); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 13px; color: #79c0ff;">$1</code>');

    // Newlines to <br>
    processed = processed.replace(/\n/g, '<br>');

    // Restore code blocks with syntax styled box
    codeBlocks.forEach((item, idx) => {
      const blockHtml = `<pre style="background: #0b0e14; padding: 12px 14px; border-radius: 6px; overflow-x: auto; margin: 8px 0; font-family: var(--font-mono); font-size: 12px; border: 1px solid var(--border-color); color: #c9d1d9; line-height: 1.45;"><code>${item.code}</code></pre>`;
      processed = processed.replace(`__CODE_BLOCK_${idx}__`, blockHtml);
    });

    return processed;
  },

  escapeHtml(str) {
    if (!str) return "";
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  scrollToBottom() {
    const container = document.getElementById("chat-messages");
    container.scrollTop = container.scrollHeight;
  }
};

window.Chat = Chat;
window.showAntigravityAuthModal = (data) => Chat.showAntigravityAuthModal(data);

