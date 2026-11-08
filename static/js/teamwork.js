/**
 * Teamwork & Multi-Agent Swarm Studio Module
 * Orchestrates multi-agent teams (/teamwork, /boost, /goal, /plan).
 */
const Teamwork = {
  selectedStrategy: "teamwork",

  init() {
    this.bindEvents();
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

    // Launch button
    const launchBtn = document.getElementById("btn-launch-swarm");
    if (launchBtn) {
      launchBtn.addEventListener("click", () => this.launch());
    }

    // Return to chat button
    const toChatBtn = document.getElementById("btn-teamwork-to-chat");
    if (toChatBtn) {
      toChatBtn.addEventListener("click", () => {
        if (typeof App !== "undefined") App.switchView("chat");
      });
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
  }
};

