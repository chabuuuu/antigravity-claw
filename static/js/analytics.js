/**
 * Antigravity OpenClaw - Analytics & Project Reporting Module
 * Powered by Chart.js for real-time token burn telemetry and project milestone tracking.
 */
const Analytics = {
  chartTimeline: null,
  chartModels: null,
  chartStatus: null,
  currentRange: "7d",
  currentProject: "all",
  data: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Time Range Selector Pills
    const rangePills = document.querySelectorAll("#analytics-range-pills .range-pill");
    rangePills.forEach(pill => {
      pill.addEventListener("click", () => {
        rangePills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentRange = pill.dataset.range || "7d";
        this.loadAnalytics();
      });
    });

    // Project Filter Dropdown
    const projectFilter = document.getElementById("analytics-project-filter");
    if (projectFilter) {
      projectFilter.addEventListener("change", (e) => {
        this.currentProject = e.target.value;
        this.loadAnalytics();
      });
    }

    // Refresh Button
    const refreshBtn = document.getElementById("btn-refresh-analytics");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.loadAnalytics());
    }

    // Export Buttons
    const exportCsvBtn = document.getElementById("btn-export-analytics-csv");
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => this.exportReport("csv"));
    }

    const exportJsonBtn = document.getElementById("btn-export-analytics-json");
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener("click", () => this.exportReport("json"));
    }

    // New Task for Project Button
    const newProjTaskBtn = document.getElementById("btn-create-project-task");
    if (newProjTaskBtn) {
      newProjTaskBtn.addEventListener("click", () => {
        const proj = this.currentProject !== "all" ? this.currentProject : "Default";
        this.openProjectInChat(proj);
      });
    }
  },

  async loadAnalytics() {
    try {
      const url = `/api/analytics/summary?project=${encodeURIComponent(this.currentProject)}&range=${this.currentRange}`;
      const res = await Auth.fetchWithAuth(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.data = data;

      this.updateProjectSelector(data.all_projects || []);
      this.renderKPIs(data.kpis || {});
      this.renderTimelineChart(data.timeline || {});
      this.renderModelsChart(data.model_distribution || []);
      this.renderStatusChart(data.kpis || {});
      this.renderProjectsMatrix(data.projects || []);
      this.renderRecentTasks(data.recent_tasks || []);
    } catch (e) {
      console.error("Failed to load analytics summary:", e);
    }
  },

  updateProjectSelector(projects) {
    const select = document.getElementById("analytics-project-filter");
    if (!select) return;

    const currentVal = this.currentProject;
    select.innerHTML = `<option value="all">All Projects</option>`;
    
    projects.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.innerText = p;
      if (p === currentVal) opt.selected = true;
      select.appendChild(opt);
    });
  },

  renderKPIs(kpis) {
    // Total Tokens
    const totalTokensEl = document.getElementById("kpi-total-tokens");
    if (totalTokensEl) totalTokensEl.innerText = this.formatNumber(kpis.total_tokens || 0);

    const inTokEl = document.getElementById("kpi-in-tokens");
    if (inTokEl) inTokEl.innerText = this.formatNumber(kpis.input_tokens || 0);

    const outTokEl = document.getElementById("kpi-out-tokens");
    if (outTokEl) outTokEl.innerText = this.formatNumber(kpis.output_tokens || 0);

    const thinkTokEl = document.getElementById("kpi-think-tokens");
    if (thinkTokEl) thinkTokEl.innerText = this.formatNumber(kpis.thinking_tokens || 0);

    // Deep Reasoning Ratio
    const thinkRatioEl = document.getElementById("kpi-thinking-ratio");
    if (thinkRatioEl) thinkRatioEl.innerText = `${(kpis.thinking_ratio || 0).toFixed(1)}%`;

    // Completion Rate
    const compRateEl = document.getElementById("kpi-completion-rate");
    if (compRateEl) compRateEl.innerText = `${(kpis.success_rate || 0).toFixed(1)}%`;

    const compProgEl = document.getElementById("kpi-completion-progress");
    if (compProgEl) compProgEl.style.width = `${Math.min(kpis.success_rate || 0, 100)}%`;

    const compTasksEl = document.getElementById("kpi-completed-tasks");
    if (compTasksEl) compTasksEl.innerText = kpis.completed_tasks || 0;

    const totTasksEl = document.getElementById("kpi-total-tasks");
    if (totTasksEl) totTasksEl.innerText = kpis.total_tasks || 0;

    // Turnaround Velocity
    const avgDurEl = document.getElementById("kpi-avg-duration");
    if (avgDurEl) avgDurEl.innerText = `${(kpis.avg_duration_seconds || 0).toFixed(1)}s`;

    const activeProjEl = document.getElementById("kpi-active-projects");
    if (activeProjEl) activeProjEl.innerText = kpis.total_projects || 1;
  },

  renderTimelineChart(timeline) {
    const canvas = document.getElementById("chart-tokens-timeline");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = timeline.labels || [];
    const inTokens = timeline.input_tokens || [];
    const outTokens = timeline.output_tokens || [];
    const thinkTokens = timeline.thinking_tokens || [];

    if (this.chartTimeline) {
      this.chartTimeline.destroy();
    }

    const ctx = canvas.getContext("2d");
    
    // Gradients
    const gradInput = ctx.createLinearGradient(0, 0, 0, 300);
    gradInput.addColorStop(0, "rgba(88, 166, 255, 0.45)");
    gradInput.addColorStop(1, "rgba(88, 166, 255, 0.02)");

    const gradOutput = ctx.createLinearGradient(0, 0, 0, 300);
    gradOutput.addColorStop(0, "rgba(63, 185, 80, 0.45)");
    gradOutput.addColorStop(1, "rgba(63, 185, 80, 0.02)");

    const gradThinking = ctx.createLinearGradient(0, 0, 0, 300);
    gradThinking.addColorStop(0, "rgba(188, 140, 255, 0.5)");
    gradThinking.addColorStop(1, "rgba(188, 140, 255, 0.02)");

    this.chartTimeline = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels.length > 0 ? labels : ["No Tasks Yet"],
        datasets: [
          {
            label: "Thinking Tokens",
            data: thinkTokens.length > 0 ? thinkTokens : [0],
            borderColor: "#bc8cff",
            backgroundColor: gradThinking,
            fill: true,
            tension: 0.38,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "#bc8cff"
          },
          {
            label: "Output Tokens",
            data: outTokens.length > 0 ? outTokens : [0],
            borderColor: "#3fb950",
            backgroundColor: gradOutput,
            fill: true,
            tension: 0.38,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "#3fb950"
          },
          {
            label: "Input Tokens",
            data: inTokens.length > 0 ? inTokens : [0],
            borderColor: "#58a6ff",
            backgroundColor: gradInput,
            fill: true,
            tension: 0.38,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "#58a6ff"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: "#161b22",
            titleColor: "#c9d1d9",
            bodyColor: "#8b949e",
            borderColor: "rgba(56, 139, 253, 0.4)",
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            callbacks: {
              label: (context) => {
                return ` ${context.dataset.label}: ${context.parsed.y.toLocaleString()} tokens`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: "rgba(255, 255, 255, 0.05)"
            },
            ticks: {
              color: "#8b949e",
              font: { size: 11, family: "inherit" }
            }
          },
          y: {
            grid: {
              color: "rgba(255, 255, 255, 0.05)"
            },
            ticks: {
              color: "#8b949e",
              font: { size: 11, family: "monospace" },
              callback: (val) => Analytics.formatNumber(val)
            }
          }
        }
      }
    });
  },

  renderModelsChart(models) {
    const canvas = document.getElementById("chart-models-distribution");
    const legendEl = document.getElementById("chart-models-custom-legend");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.chartModels) {
      this.chartModels.destroy();
    }

    const labels = [];
    const dataVals = [];
    const colors = ["#58a6ff", "#3fb950", "#bc8cff", "#f0883e", "#e3b341", "#79c0ff"];

    models.forEach((m, idx) => {
      labels.push(m.display_name);
      dataVals.push(m.tokens || 0);
    });

    if (models.length === 0) {
      labels.push("Gemini 3.8 Flash");
      dataVals.push(1);
    }

    const ctx = canvas.getContext("2d");
    this.chartModels = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: dataVals,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: "#0d1117",
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: "#161b22",
            borderColor: "rgba(56, 139, 253, 0.4)",
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${context.parsed.toLocaleString()} tokens (${pct}%)`;
              }
            }
          }
        },
        cutout: "68%"
      }
    });

    // Custom Legend
    if (legendEl) {
      legendEl.innerHTML = "";
      models.forEach((m, idx) => {
        const item = document.createElement("div");
        item.className = "model-legend-item";
        item.style.borderLeft = `3px solid ${colors[idx % colors.length]}`;
        item.innerHTML = `
          <div class="model-legend-name">${this.escapeHtml(m.display_name)}</div>
          <div class="model-legend-val">${this.formatNumber(m.tokens)} (${m.percentage}%)</div>
        `;
        legendEl.appendChild(item);
      });
    }
  },

  renderStatusChart(kpis) {
    const canvas = document.getElementById("chart-tasks-status");
    const summaryEl = document.getElementById("chart-status-summary");
    if (!canvas || typeof Chart === "undefined") return;

    if (this.chartStatus) {
      this.chartStatus.destroy();
    }

    const completed = kpis.completed_tasks || 0;
    const failed = kpis.failed_tasks || 0;
    const running = kpis.running_tasks || 0;
    const cancelled = kpis.cancelled_tasks || 0;

    const ctx = canvas.getContext("2d");
    this.chartStatus = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Completed", "Failed", "Running", "Cancelled"],
        datasets: [{
          label: "Tasks Count",
          data: [completed, failed, running, cancelled],
          backgroundColor: [
            "rgba(46, 160, 67, 0.8)",
            "rgba(248, 81, 73, 0.8)",
            "rgba(56, 139, 253, 0.8)",
            "rgba(139, 148, 158, 0.8)"
          ],
          borderColor: [
            "#2ea043",
            "#f85149",
            "#388bfd",
            "#8b949e"
          ],
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#161b22",
            borderColor: "rgba(56, 139, 253, 0.4)",
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#8b949e", font: { size: 11 } }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#8b949e", stepSize: 1, font: { size: 11, family: "monospace" } }
          }
        }
      }
    });

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="status-pill-stat" style="border-top: 2px solid #2ea043;">
          <div class="status-pill-label">Completed</div>
          <div class="status-pill-val" style="color: #7ee787;">${completed}</div>
        </div>
        <div class="status-pill-stat" style="border-top: 2px solid #f85149;">
          <div class="status-pill-label">Failed</div>
          <div class="status-pill-val" style="color: #ff7b72;">${failed}</div>
        </div>
        <div class="status-pill-stat" style="border-top: 2px solid #388bfd;">
          <div class="status-pill-label">Running</div>
          <div class="status-pill-val" style="color: #79c0ff;">${running}</div>
        </div>
      `;
    }
  },

  renderProjectsMatrix(projects) {
    const grid = document.getElementById("projects-grid");
    if (!grid) return;

    if (projects.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--text-muted);">
          No projects recorded yet. Run a prompt with <code>--project &lt;name&gt;</code> or execute tasks to see them tracked here.
        </div>
      `;
      return;
    }

    grid.innerHTML = "";
    projects.forEach(p => {
      const card = document.createElement("div");
      card.className = "project-card";

      const subtasksHtml = (p.recent_subtasks || []).map(st => `
        <div class="subtask-preview-item" title="${this.escapeHtml(st.title)}">
          ${st.status === 'COMPLETED' ? '✅' : (st.status === 'RUNNING' ? '⚡' : '⚠️')} ${this.escapeHtml(st.title)}
        </div>
      `).join("") || `<div style="font-size:10px; color:var(--text-muted);">No subtasks recorded.</div>`;

      card.innerHTML = `
        <div class="project-card-header">
          <div class="project-card-title-group">
            <span class="project-icon-badge">📁</span>
            <span class="project-name" title="${this.escapeHtml(p.name)}">${this.escapeHtml(p.name)}</span>
          </div>
          <span class="project-status-tag ${p.status_class}">${p.status}</span>
        </div>

        <div class="project-progress-wrap">
          <div class="project-progress-info">
            <span style="color: var(--text-muted);">Progress (${p.completed_tasks}/${p.total_tasks} tasks)</span>
            <strong style="color: #7ee787;">${p.progress_percent}%</strong>
          </div>
          <div class="project-progress-bar-bg">
            <div class="project-progress-fill" style="width: ${Math.min(p.progress_percent, 100)}%;"></div>
          </div>
        </div>

        <div class="project-metrics-row">
          <div class="proj-metric-item">
            <span class="proj-metric-lbl">Tokens</span>
            <span class="proj-metric-val">${this.formatNumber(p.total_tokens)}</span>
          </div>
          <div class="proj-metric-item">
            <span class="proj-metric-lbl">Thinking</span>
            <span class="proj-metric-val">${this.formatNumber(p.thinking_tokens)}</span>
          </div>
          <div class="proj-metric-item">
            <span class="proj-metric-lbl">Avg Time</span>
            <span class="proj-metric-val">${p.avg_duration}s</span>
          </div>
        </div>

        <div class="project-subtasks-preview">
          <div style="font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Recent Turns:</div>
          ${subtasksHtml}
        </div>

        <div class="project-card-footer">
          <span class="project-last-time">Last active: ${this.formatTimeAgo(p.last_activity)}</span>
          <button type="button" class="btn-primary btn-open-project">🚀 Open in Chat</button>
        </div>
      `;

      card.querySelector(".btn-open-project").addEventListener("click", () => {
        this.openProjectInChat(p.name);
      });

      grid.appendChild(card);
    });
  },

  renderRecentTasks(tasks) {
    const tbody = document.getElementById("analytics-tasks-table");
    if (!tbody) return;

    if (tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:16px; color:var(--text-muted);">No task records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    tasks.forEach(t => {
      const tr = document.createElement("tr");
      const statusBadge = `<span class="badge ${t.status === 'COMPLETED' ? 'badge-success' : (t.status === 'RUNNING' ? 'badge-info' : 'badge-danger')}">${t.status}</span>`;
      
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--accent-blue);">${t.task_id.substring(0, 8)}...</td>
        <td><span class="badge" style="background:#161b22; color:#a5d6ff;">${this.escapeHtml(t.project)}</span></td>
        <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(t.title)}">${this.escapeHtml(t.title)}</td>
        <td>${statusBadge}</td>
        <td style="font-family: var(--font-mono);">${(t.duration_seconds || 0).toFixed(1)}s</td>
        <td style="font-family: var(--font-mono); color: #79c0ff; font-weight: 600;">${this.formatNumber(t.total_tokens)}</td>
        <td style="font-family: var(--font-mono); color: #bc8cff;">${this.formatNumber(t.thinking_tokens)}</td>
        <td style="font-size: 11px; color: var(--text-muted);">${this.formatTimeAgo(t.completed_at || t.created_at)}</td>
      `;
      tbody.appendChild(tr);
    });
  },

  openProjectInChat(projectName) {
    if (typeof App !== "undefined") {
      App.switchView("chat");
    }
    const projectInput = document.getElementById("chat-project");
    if (projectInput) {
      projectInput.value = projectName;
    }
    const textarea = document.getElementById("chat-textarea");
    if (textarea) {
      textarea.focus();
    }
  },

  exportReport(format) {
    const url = `/api/analytics/export?format=${format}&project=${encodeURIComponent(this.currentProject)}&range=${this.currentRange}`;
    window.open(url, "_blank");
  },

  formatNumber(num) {
    if (num == null) return "0";
    const n = Number(num);
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(1) + "M";
    }
    if (n >= 1_000) {
      return (n / 1_000).toFixed(1) + "K";
    }
    return n.toLocaleString();
  },

  formatTimeAgo(isoString) {
    if (!isoString) return "Never";
    try {
      const date = new Date(isoString);
      const diffSec = Math.floor((new Date() - date) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch (e) {
      return isoString;
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

