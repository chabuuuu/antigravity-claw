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
  },

  bindEvents() {
    const sendBtn = document.getElementById("btn-chat-send");
    const cancelBtn = document.getElementById("btn-chat-cancel");
    const textarea = document.getElementById("chat-textarea");
    const newSessionBtn = document.getElementById("btn-new-session");

    sendBtn.addEventListener("click", () => this.sendPrompt());
    cancelBtn.addEventListener("click", () => this.cancelTask());
    newSessionBtn.addEventListener("click", () => this.startNewSession());

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
        item.addEventListener("click", () => this.loadConversation(conv.conversation_id));
        listContainer.appendChild(item);
      });
    } catch (e) {
      console.warn("Failed to load conversations:", e);
    }
  },

  startNewSession() {
    this.activeConversationId = null;
    this.activeTaskId = null;
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
    const autoApprove = document.getElementById("chat-auto-approve").checked;
    const sandbox = document.getElementById("chat-sandbox").checked;

    // Display user message
    this.appendUserMessage(prompt);
    this.setExecutionState(true);

    // Prepare assistant response bubble
    this.prepareAssistantBubble();

    try {
      const res = await fetch("/api/agent/prompt", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({
          prompt,
          conversation_id: this.activeConversationId,
          model,
          effort,
          mode,
          auto_approve: autoApprove,
          sandbox
        })
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
    } else if (event.type === "agent_result") {
      this.renderTokenUsage(event.usage, event.duration_seconds);
    } else if (event.type === "task_completed") {
      this.setExecutionState(false);
      this.loadConversations();
    } else if (event.type === "error") {
      this.appendErrorMessage(event.message);
      this.setExecutionState(false);
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
