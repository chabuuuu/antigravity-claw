/**
 * Teamwork & Multi-Agent Swarm Studio Module
 * Orchestrates multi-agent teams (/teamwork, /boost, /goal, /plan),
 * tracks live swarm progress, active subagents, and milestones.
 */
const Teamwork = {
  selectedStrategy: "teamwork",
  swarmPollTimer: null,
  currentStatus: null,

  init() {
    this.bindEvents();
    this.pollSwarmStatus();
    this.swarmPollTimer = setInterval(() => this.pollSwarmStatus(), 3500);
  },

  bindEvents() {
    // Strategy selection cards
    const strategyCards = document.querySelectorAll(".strategy-card");
    strategyCards.forEach(card => {
      card.addEventListener("click", () => {
        const strat = card.dataset.strategy;
        if (strat) {
          this.selectStrategy(strat);
        }
      });
    });

    // Launch buttons (both bottom and top)
    const launchBtn = document.getElementById("btn-launch-swarm");
    if (launchBtn) {
      launchBtn.addEventListener("click", () => this.launch());
    }

    const launchTopBtn = document.getElementById("btn-launch-swarm-top");
    if (launchTopBtn) {
      launchTopBtn.addEventListener("click", () => this.launch());
    }

    // Return to chat button
    const toChatBtn = document.getElementById("btn-teamwork-to-chat");
    if (toChatBtn) {
      toChatBtn.addEventListener("click", () => {
        if (typeof App !== "undefined") App.switchView("chat");
      });
    }

    // Monitor actions
    const monitorChatBtn = document.getElementById("btn-monitor-to-chat");
    if (monitorChatBtn) {
      monitorChatBtn.addEventListener("click", () => {
        if (typeof App !== "undefined") App.switchView("chat");
      });
    }

    const monitorStopBtn = document.getElementById("btn-monitor-stop");
    if (monitorStopBtn) {
      monitorStopBtn.addEventListener("click", () => this.stopSwarm());
    }

    const topStopBtn = document.getElementById("btn-teamwork-stop-top");
    if (topStopBtn) {
      topStopBtn.addEventListener("click", () => this.stopSwarm());
    }

    // Mission template chips
    const templateItems = document.querySelectorAll(".template-item");
    templateItems.forEach(item => {
      item.addEventListener("click", () => {
        const text = item.dataset.template || "";
        const input = document.getElementById("teamwork-mission-input");
        if (input) {
          input.value = text;
          input.focus();
        }
      });
    });
  },

  selectStrategy(strategy) {
    this.selectedStrategy = strategy;
    const cards = document.querySelectorAll(".strategy-card");
    cards.forEach(c => {
      if (c.dataset.strategy === strategy) {
        c.classList.add("active");
      } else {
        c.classList.remove("active");
      }
    });
  },

  launch() {
    const input = document.getElementById("teamwork-mission-input");
    const mission = input ? input.value.trim() : "";
    if (!mission) {
      alert("Please provide project mission & deliverables before launching the agent swarm.");
      if (input) input.focus();
      return;
    }

    let cmdPrefix = "/teamwork ";
    if (this.selectedStrategy === "boost") {
      cmdPrefix = "/boost ";
    } else if (this.selectedStrategy === "goal") {
      cmdPrefix = "/goal ";
    } else if (this.selectedStrategy === "plan") {
      cmdPrefix = "/plan ";
    }

    const fullPrompt = `${cmdPrefix}${mission}`;

    // Switch to Chat Workspace
    if (typeof App !== "undefined") {
      App.switchView("chat");
    }

    // Populate Chat textarea and execute
    const textarea = document.getElementById("chat-textarea");
    if (textarea && typeof Chat !== "undefined") {
      textarea.value = fullPrompt;
      // Start a fresh session if needed
      Chat.startNewSession();
      // Send prompt
      setTimeout(() => {
        Chat.sendPrompt();
      }, 100);
    }
  },

  async stopSwarm() {
    if (!confirm("Are you sure you want to stop the active Multi-Agent Swarm mission?")) {
      return;
    }
    const taskId = this.currentStatus?.running_task?.task_id;
    try {
      const res = await Auth.fetchWithAuth("/api/teamwork/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId || null })
      });
      const data = await res.json();
      if (typeof Chat !== "undefined") {
        Chat.appendSystemNotice("🛑 Multi-Agent Swarm stopped by user.");
        Chat.setExecutionState(false);
        Chat.stopSwarmPolling();
      }
      await this.pollSwarmStatus();
    } catch (e) {
      console.error("Failed to stop swarm:", e);
      alert("Error stopping swarm: " + e.message);
    }
  },

  async pollSwarmStatus() {
    try {
      const res = await Auth.fetchWithAuth("/api/teamwork/status");
      if (!res.ok) return;
      const data = await res.json();
      this.currentStatus = data;

      const banner = document.getElementById("teamwork-live-monitor-banner");
      const topStopBtn = document.getElementById("btn-teamwork-stop-top");
      if (topStopBtn) {
        topStopBtn.style.display = data.active ? "inline-flex" : "none";
      }
      if (!banner) return;

      if (data.active) {
        banner.style.display = "flex";

        // Update mission
        const missionEl = document.getElementById("monitor-mission-text");
        if (missionEl) {
          missionEl.innerText = data.mission || "Autonomous multi-agent mission in progress...";
        }

        // Update badges
        const iterBadge = document.getElementById("monitor-iteration-badge");
        if (iterBadge) {
          iterBadge.innerText = data.iteration || "Iteration Active";
        }

        const phaseBadge = document.getElementById("monitor-phase-badge");
        if (phaseBadge) {
          let phaseName = "Survey Phase";
          if (data.checklist && data.checklist.some(c => c.done && c.task.includes("Explorers"))) {
            phaseName = "Implementation Phase";
          }
          phaseBadge.innerText = phaseName;
        }

        // Render subagents
        const subagentsContainer = document.getElementById("monitor-subagents-container");
        if (subagentsContainer) {
          if (!data.subagents || data.subagents.length === 0) {
            subagentsContainer.innerHTML = `
              <div class="swarm-agent-pill active">👑 Coordinator Agent: Orchestrating</div>
              <div class="swarm-agent-pill running">🔍 Explorer Swarm: Initializing</div>
            `;
          } else {
            subagentsContainer.innerHTML = `
              <div class="swarm-agent-pill active">👑 Coordinator Agent: Orchestrating</div>
            `;
            data.subagents.forEach(s => {
              const isDone = s.status === "COMPLETED";
              const pillClass = isDone ? "completed" : "running";
              const icon = isDone ? "✅" : "⚡";
              const pill = document.createElement("div");
              pill.className = `swarm-agent-pill ${pillClass}`;
              pill.innerHTML = `<span>${icon}</span> <span>${this.escapeHtml(s.name)}</span> <small style="margin-left:auto; opacity:0.8;">${isDone ? 'Report Ready' : 'In Progress'}</small>`;
              subagentsContainer.appendChild(pill);
            });
          }
        }

        // Render checklist
        const checklistGrid = document.getElementById("monitor-checklist-list");
        if (checklistGrid) {
          if (!data.checklist || data.checklist.length === 0) {
            checklistGrid.innerHTML = `<div style="color:var(--text-muted); font-size:12px;">Decomposing mission into phased deliverables...</div>`;
          } else {
            checklistGrid.innerHTML = "";
            data.checklist.forEach(item => {
              const el = document.createElement("div");
              el.className = `swarm-check-item ${item.done ? 'done' : 'pending'}`;
              el.innerHTML = `<span>${item.done ? '☑️' : '⏳'}</span> <span>${this.escapeHtml(item.task)}</span>`;
              checklistGrid.appendChild(el);
            });
          }
        }

        // Highlight sidebar nav item
        const navItem = document.querySelector('.nav-item[data-view="teamwork"]');
        if (navItem && !navItem.querySelector(".pulse-dot")) {
          const dot = document.createElement("span");
          dot.className = "pulse-dot";
          dot.style.marginLeft = "auto";
          navItem.appendChild(dot);
        }
      } else {
        banner.style.display = "none";
        const navItem = document.querySelector('.nav-item[data-view="teamwork"]');
        if (navItem) {
          const dot = navItem.querySelector(".pulse-dot");
          if (dot) dot.remove();
        }
      }
    } catch (e) {
      console.warn("Failed to poll teamwork status:", e);
    }
  },

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};
