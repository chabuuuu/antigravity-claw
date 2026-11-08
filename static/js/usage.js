/**
 * Antigravity Usage & Quota Dashboard Module
 * Displays real-time model quotas (Gemini, Claude, GPT, Argon),
 * rate limit reset countdowns, account email, and token metrics.
 */
const Usage = {
  data: null,
  isLoading: false,

  init() {
    this.bindEvents();
    this.loadUsage();
  },

  bindEvents() {
    const refreshBtn = document.getElementById("btn-refresh-usage");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.loadUsage(true));
    }

    const headerQuotaPill = document.getElementById("header-quota-pill");
    if (headerQuotaPill) {
      headerQuotaPill.addEventListener("click", () => {
        if (typeof App !== "undefined" && typeof App.switchView === "function") {
          App.switchView("usage");
        }
      });
    }
  },

  async loadUsage(showToast = false) {
    if (this.isLoading) return;
    this.isLoading = true;

    const refreshBtn = document.getElementById("btn-refresh-usage");
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerText = "⏳ Loading Quotas...";
    }

    try {
      const res = await fetch("/api/antigravity/usage", {
        headers: Auth.getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      this.data = data;
      this.render();

      if (showToast) {
        alert("Usage & Quotas updated in real time!");
      }
    } catch (e) {
      console.warn("Failed to load Antigravity usage:", e);
      const container = document.getElementById("usage-groups-container");
      if (container) {
        container.innerHTML = `
          <div style="padding: 20px; background: rgba(248, 81, 73, 0.1); border: 1px solid var(--accent-red); border-radius: 6px; color: #ff7b72;">
            Failed to query Antigravity quota: ${e.message}. Ensure your Google account is authenticated in Antigravity Config.
          </div>
        `;
      }
    } finally {
      this.isLoading = false;
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerText = "🔄 Refresh Quotas";
      }
    }
  },

  render() {
    if (!this.data) return;

    // 1. Account info
    const emailEl = document.getElementById("usage-account-email");
    if (emailEl) {
      emailEl.innerText = this.data.account_email || "Active Google Session";
    }

    // 2. Policy description
    const policyEl = document.getElementById("usage-policy-desc");
    if (policyEl && this.data.policy_description) {
      policyEl.innerText = this.data.policy_description;
    }

    // 3. Render Quota Groups (Gemini, Claude/GPT, Argon)
    const container = document.getElementById("usage-groups-container");
    if (container) {
      container.innerHTML = "";

      const groups = this.data.groups || [];
      if (groups.length === 0) {
        container.innerHTML = `
          <div style="padding: 16px; color: var(--text-muted); font-size: 13px;">
            No model quota data returned. If you just logged in, please wait a moment and click Refresh.
          </div>
        `;
      } else {
        groups.forEach(g => {
          const card = document.createElement("div");
          card.className = "quota-group-card";

          let bucketsHtml = "";
          (g.buckets || []).forEach(b => {
            const pct = b.remaining_percent != null ? b.remaining_percent : 100;
            
            // Determine progress bar color based on remaining quota
            let barColor = "var(--accent-blue)";
            if (pct <= 20) {
              barColor = "var(--accent-red)";
            } else if (pct <= 50) {
              barColor = "#d29922"; // yellow/warning
            } else {
              barColor = "#58a6ff"; // blue
            }

            bucketsHtml += `
              <div class="quota-bucket-item">
                <div class="quota-bucket-header">
                  <span class="quota-bucket-name">${this.escapeHtml(b.name || "Limit")}</span>
                  <span class="quota-bucket-pct" style="color: ${barColor};">${pct.toFixed(2)}%</span>
                </div>
                <div class="quota-progress-track">
                  <div class="quota-progress-fill" style="width: ${Math.max(pct, 0)}%; background-color: ${barColor};"></div>
                </div>
                <div class="quota-bucket-subtext">
                  <span class="quota-countdown-badge ${pct >= 100 ? 'status-ok' : 'status-refreshing'}">
                    ${pct >= 100 ? '✓ Quota available' : (b.countdown || 'Refreshes soon')}
                  </span>
                  ${b.description ? `<span class="quota-desc-muted">${this.escapeHtml(b.description)}</span>` : ''}
                </div>
              </div>
            `;
          });

          card.innerHTML = `
            <div class="quota-group-header">
              <h4 class="quota-group-title">${this.escapeHtml(g.name.toUpperCase())}</h4>
              <p class="quota-group-desc">${this.escapeHtml(g.description || "")}</p>
            </div>
            <div class="quota-buckets-list">
              ${bucketsHtml}
            </div>
          `;
          container.appendChild(card);
        });
      }
    }

    // 4. Update Header Badge
    this.updateHeaderBadge();

    // 5. Render Token Analytics
    this.renderTokenAnalytics();
  },

  updateHeaderBadge() {
    const pill = document.getElementById("header-quota-pill");
    if (!pill || !this.data || !this.data.groups) return;

    // Find Gemini Weekly and Claude Weekly
    let geminiPct = null;
    let claudePct = null;

    this.data.groups.forEach(g => {
      const gName = (g.name || "").toLowerCase();
      (g.buckets || []).forEach(b => {
        const bName = (b.name || "").toLowerCase();
        if (gName.includes("gemini") && bName.includes("weekly") && geminiPct === null) {
          geminiPct = b.remaining_percent;
        }
        if (gName.includes("claude") && bName.includes("weekly") && claudePct === null) {
          claudePct = b.remaining_percent;
        }
      });
    });

    if (geminiPct !== null) {
      let label = `📊 Gemini: ${geminiPct.toFixed(0)}%`;
      if (claudePct !== null) {
        label += ` · Claude: ${claudePct.toFixed(0)}%`;
      }
      pill.innerText = label;
      pill.style.display = "inline-flex";
      pill.style.color = geminiPct < 30 ? "var(--accent-red)" : "var(--accent-blue)";
    }
  },

  renderTokenAnalytics() {
    const analytics = (this.data && this.data.token_analytics) ? this.data.token_analytics : {};

    const elTotalTasks = document.getElementById("usage-total-tasks");
    const elTotalTokens = document.getElementById("usage-total-tokens");
    const elPromptTokens = document.getElementById("usage-prompt-tokens");
    const elOutputTokens = document.getElementById("usage-output-tokens");

    if (elTotalTasks) elTotalTasks.innerText = (analytics.total_tasks || 0).toLocaleString();
    if (elTotalTokens) elTotalTokens.innerText = (analytics.total_tokens || 0).toLocaleString();
    if (elPromptTokens) elPromptTokens.innerText = (analytics.prompt_tokens || 0).toLocaleString();
    if (elOutputTokens) elOutputTokens.innerText = ((analytics.output_tokens || 0) + (analytics.thinking_tokens || 0)).toLocaleString();
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

window.Usage = Usage;

