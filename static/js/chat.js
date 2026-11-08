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

  init() {
    this.bindEvents();
    this.loadConversations();
    this.loadAgentsList();
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
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendPrompt();
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
  },

  async loadConversations() {
    try {
      const res = await fetch("/api/agent/conversations", {
        headers: Auth.getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      const listContainer = document.getElementById("conversations-list");
      listContainer.innerHTML = "";

      (data.conversations || []).forEach(conv => {
        const item = document.createElement("div");
        item.className = `conv-item ${conv.conversation_id === this.activeConversationId ? 'active' : ''}`;
        item.innerText = conv.title || "Untitled Session";
        item.title = conv.title;
        item.addEventListener("click", () => {
          this.loadConversation(conv.conversation_id);
          if (typeof App !== "undefined" && App.closeMobileSidebar) App.closeMobileSidebar();
        });
        listContainer.appendChild(item);
      });
    } catch (e) {
      console.warn("Failed to load conversations:", e);
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

    // Advanced Flags
    const continueSession = document.getElementById("chat-continue") ? document.getElementById("chat-continue").checked : false;
    const remoteAgent = document.getElementById("chat-remote-agent") ? document.getElementById("chat-remote-agent").checked : false;
    const project = document.getElementById("chat-project") ? document.getElementById("chat-project").value.trim() : "";
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

  async cancelTask() {
    if (!this.activeTaskId) return;
    try {
      await fetch("/api/agent/cancel", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ task_id: this.activeTaskId })
      });
      this.appendSystemNotice("⚠️ Task cancellation requested by user.");
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
    } else if (event.type === "antigravity_auth_required") {
      this.showAntigravityAuthModal(event);
    } else if (event.type === "agent_result") {
      this.renderTokenUsage(event.usage, event.duration_seconds);
    } else if (event.type === "task_completed") {
      this.setExecutionState(false);
      const modal = document.getElementById("agy-auth-modal");
      if (modal && modal.style.display === "flex") {
        modal.style.display = "none";
      }
      this.loadConversations();
    } else if (event.type === "error") {
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
    let html = this.escapeHtml(text);
    // Simple inline backticks
    html = html.replace(/`([^`]+)`/g, '<code style="background: var(--bg-tertiary); padding: 2px 4px; border-radius: 4px; font-family: var(--font-mono);">$1</code>');
    // Triple backtick blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre style="background: #0b0e14; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; font-family: var(--font-mono); font-size: 12px; border: 1px solid var(--border-color);"><code>$1</code></pre>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return html.replace(/\n/g, '<br>');
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

