/**
 * Antigravity Projects Manager Module
 * Manages native Antigravity CLI projects, workspace directories, active context,
 * and 1-click workspace switching.
 */
const Projects = {
  projects: [],
  activeProject: null,
  defaultProjectId: "default-cli-project",
  currentFilter: "all",
  searchQuery: "",
  editingProjectId: null,

  init() {
    this.bindEvents();
    this.loadProjects();
  },

  bindEvents() {
    // Search input
    const searchInput = document.getElementById("projects-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderProjects();
      });
    }

    // Filter pills
    const filterPills = document.querySelectorAll("#projects-filter-pills .filter-pill");
    filterPills.forEach(pill => {
      pill.addEventListener("click", () => {
        filterPills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentFilter = pill.dataset.filter || "all";
        this.renderProjects();
      });
    });

    // Refresh button
    const refreshBtn = document.getElementById("btn-refresh-projects");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.loadProjects());
    }

    // New project button
    const createBtn = document.getElementById("btn-new-project");
    if (createBtn) {
      createBtn.addEventListener("click", () => this.openCreateModal());
    }

    // Modal close & save
    const modalClose = document.getElementById("btn-project-modal-close");
    const modalCancel = document.getElementById("btn-project-modal-cancel");
    const modalSave = document.getElementById("btn-project-modal-save");

    if (modalClose) modalClose.addEventListener("click", () => this.closeModal());
    if (modalCancel) modalCancel.addEventListener("click", () => this.closeModal());
    if (modalSave) modalSave.addEventListener("click", () => this.handleSaveProject());

    // Top Header Project Pill Click -> Switch to Projects view
    const projectPill = document.getElementById("current-project-pill");
    if (projectPill) {
      projectPill.addEventListener("click", () => {
        if (typeof App !== "undefined") App.switchView("projects");
      });
    }

    // Chat control bar project selector
    const chatProjSelect = document.getElementById("chat-project-select");
    if (chatProjSelect) {
      chatProjSelect.addEventListener("change", async (e) => {
        const val = e.target.value;
        if (val === "__new__") {
          this.openCreateModal();
          this.syncChatProjectSelect();
          return;
        }
        await this.setActiveProject(val);
      });
    }
  },

  async loadProjects() {
    try {
      const res = await Auth.fetchWithAuth("/api/projects");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.projects = data.projects || [];
      this.activeProject = data.active_project || null;
      this.defaultProjectId = data.default_project_id || "default-cli-project";

      this.updateKPIs();
      this.updateHeaderPill();
      this.syncChatProjectSelect();
      this.renderProjects();
    } catch (e) {
      console.error("Failed to load projects:", e);
      const grid = document.getElementById("projects-grid");
      if (grid) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--accent-red);">Failed to load projects: ${this.escapeHtml(e.message)}</div>`;
      }
    }
  },

  updateKPIs() {
    const totalEl = document.getElementById("kpi-total-projects");
    const activeEl = document.getElementById("kpi-active-project");
    const workspacesEl = document.getElementById("kpi-linked-workspaces");
    const sessionsEl = document.getElementById("kpi-total-project-sessions");

    if (totalEl) totalEl.innerText = this.projects.length;
    if (activeEl) activeEl.innerText = this.activeProject ? this.activeProject.name : "CLI Project";
    
    const linkedCount = this.projects.filter(p => !!p.path).length;
    if (workspacesEl) workspacesEl.innerText = linkedCount;

    const totalSessions = this.projects.reduce((acc, p) => acc + (p.conversations_count || 0), 0);
    if (sessionsEl) sessionsEl.innerText = totalSessions;
  },

  updateHeaderPill() {
    const pill = document.getElementById("current-project-pill");
    if (pill) {
      const name = this.activeProject ? this.activeProject.name : "Default";
      pill.innerText = `📁 Project: ${name}`;
      pill.title = `Current Antigravity Project: ${name}. Click to manage projects.`;
      pill.style.display = "inline-flex";
    }
  },

  syncChatProjectSelect() {
    const select = document.getElementById("chat-project-select");
    if (!select) return;

    const currentVal = this.activeProject ? (this.activeProject.id || this.activeProject.name) : "Default";
    select.innerHTML = "";

    // Default option
    const defOpt = document.createElement("option");
    defOpt.value = "Default";
    defOpt.innerText = "Default Project (CLI)";
    select.appendChild(defOpt);

    this.projects.forEach(p => {
      if (p.id === "default-cli-project" || p.name === "CLI Project") return;
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.innerText = p.name + (p.path ? ` (${this.shortenPath(p.path)})` : "");
      select.appendChild(opt);
    });

    const newOpt = document.createElement("option");
    newOpt.value = "__new__";
    newOpt.innerText = "➕ Create New Project...";
    select.appendChild(newOpt);

    select.value = currentVal;
    if (!select.value && select.options.length > 0) {
      select.selectedIndex = 0;
    }
  },

  renderProjects() {
    const grid = document.getElementById("projects-grid");
    if (!grid) return;

    const q = this.searchQuery;
    const filter = this.currentFilter;

    const filtered = this.projects.filter(p => {
      // Filter tab
      if (filter === "active" && !p.is_active) return false;
      if (filter === "workspace" && !p.path) return false;
      if (filter === "default" && !p.is_default) return false;

      // Search keyword
      if (q) {
        const name = (p.name || "").toLowerCase();
        const id = (p.id || "").toLowerCase();
        const path = (p.path || "").toLowerCase();
        return name.includes(q) || id.includes(q) || path.includes(q);
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px 20px; text-align: center; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="font-size: 32px; margin-bottom: 10px;">📁</div>
          <div style="color: var(--text-bright); font-weight: 600; font-size: 15px;">No projects found</div>
          <div style="color: var(--text-muted); font-size: 12px; margin-top: 6px;">Try adjusting your search query or click "➕ New Project" to create one.</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = "";
    filtered.forEach(p => {
      const card = document.createElement("div");
      card.className = `project-card ${p.is_active ? 'active-project-card' : ''}`;

      const activeBadge = p.is_active ? `<span class="badge badge-active" title="Active Project">ACTIVE</span>` : '';
      const defaultBadge = p.is_default ? `<span class="badge badge-default" title="Default CLI Project">DEFAULT</span>` : '';
      const pathDisplay = p.path ? this.escapeHtml(p.path) : `<span style="color: var(--text-muted); font-style: italic;">No directory linked</span>`;

      card.innerHTML = `
        <div class="project-card-header">
          <div class="project-card-title-group">
            <span class="project-icon">📁</span>
            <div>
              <div class="project-name">${this.escapeHtml(p.name)}</div>
              <div class="project-id">${this.escapeHtml(p.id)}</div>
            </div>
          </div>
          <div class="project-badges">
            ${activeBadge}
            ${defaultBadge}
          </div>
        </div>

        <div class="project-card-body">
          <div class="project-info-row">
            <span class="info-label">Workspace:</span>
            <span class="info-value project-path-val" title="${p.path ? this.escapeHtml(p.path) : ''}">${pathDisplay}</span>
          </div>
          <div class="project-stats-row">
            <div class="stat-bubble">
              <span class="stat-num">${p.conversations_count || 0}</span>
              <span class="stat-name">Sessions</span>
            </div>
            <div class="stat-bubble">
              <span class="stat-num">${p.tasks_count || 0}</span>
              <span class="stat-name">Tasks</span>
            </div>
            <div class="stat-bubble">
              <span class="stat-num">${p.last_activity ? this.formatDate(p.last_activity) : 'Never'}</span>
              <span class="stat-name">Last Active</span>
            </div>
          </div>
        </div>

        <div class="project-card-footer">
          <div class="footer-primary-actions">
            <button class="btn-primary btn-sm btn-proj-chat" title="Open and chat in this project">🚀 Chat</button>
            ${p.path ? `<button class="btn-secondary btn-sm btn-proj-files" title="Open directory in Files & Editor">📂 Files</button>` : ''}
            ${!p.is_active ? `<button class="btn-secondary btn-sm btn-proj-set-active" title="Set as current active project">⭐ Set Active</button>` : ''}
          </div>
          <div class="footer-secondary-actions">
            <button class="btn-icon btn-proj-edit" title="Edit project">✏️</button>
            ${p.id !== 'default-cli-project' ? `<button class="btn-icon btn-proj-delete" title="Delete project">🗑️</button>` : ''}
          </div>
        </div>
      `;

      // Event listeners
      card.querySelector(".btn-proj-chat").addEventListener("click", () => {
        this.openInChat(p);
      });

      const filesBtn = card.querySelector(".btn-proj-files");
      if (filesBtn && p.path) {
        filesBtn.addEventListener("click", () => {
          this.openInFiles(p.path);
        });
      }

      const setActiveBtn = card.querySelector(".btn-proj-set-active");
      if (setActiveBtn) {
        setActiveBtn.addEventListener("click", async () => {
          await this.setActiveProject(p.id);
        });
      }

      card.querySelector(".btn-proj-edit").addEventListener("click", () => {
        this.openEditModal(p);
      });

      const delBtn = card.querySelector(".btn-proj-delete");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (confirm(`Are you sure you want to delete project "${p.name}"?`)) {
            await this.deleteProject(p.id);
          }
        });
      }

      grid.appendChild(card);
    });
  },

  async openInChat(project) {
    await this.setActiveProject(project.id);
    if (typeof App !== "undefined") {
      App.switchView("chat");
    }
    const textarea = document.getElementById("chat-textarea");
    if (textarea) {
      textarea.focus();
    }
  },

  openInFiles(path) {
    if (typeof App !== "undefined") {
      App.switchView("workspace");
    }
    if (typeof Explorer !== "undefined" && typeof Explorer.loadDirectory === "function") {
      Explorer.loadDirectory(path);
    }
  },

  openCreateModal() {
    this.editingProjectId = null;
    document.getElementById("project-modal-title").innerText = "Create Antigravity Project";
    document.getElementById("project-name-input").value = "";
    document.getElementById("project-path-input").value = "";
    document.getElementById("project-set-active-check").checked = true;
    document.getElementById("project-set-default-check").checked = false;

    const modal = document.getElementById("project-modal");
    if (modal) {
      modal.classList.add("active");
      modal.style.display = "flex";
      setTimeout(() => document.getElementById("project-name-input").focus(), 50);
    }
  },

  openEditModal(project) {
    this.editingProjectId = project.id;
    document.getElementById("project-modal-title").innerText = `Edit Project: ${project.name}`;
    document.getElementById("project-name-input").value = project.name || "";
    document.getElementById("project-path-input").value = project.path || "";
    document.getElementById("project-set-active-check").checked = !!project.is_active;
    document.getElementById("project-set-default-check").checked = !!project.is_default;

    const modal = document.getElementById("project-modal");
    if (modal) {
      modal.classList.add("active");
      modal.style.display = "flex";
      setTimeout(() => document.getElementById("project-name-input").focus(), 50);
    }
  },

  closeModal() {
    const modal = document.getElementById("project-modal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
    this.editingProjectId = null;
  },

  async handleSaveProject() {
    const name = document.getElementById("project-name-input").value.trim();
    const path = document.getElementById("project-path-input").value.trim();
    const setActive = document.getElementById("project-set-active-check").checked;
    const setDefault = document.getElementById("project-set-default-check").checked;

    if (!name) {
      alert("Please enter a project name.");
      return;
    }

    try {
      let res;
      if (this.editingProjectId) {
        // Update
        res = await Auth.fetchWithAuth(`/api/projects/${encodeURIComponent(this.editingProjectId)}`, {
          method: "PUT",
          body: JSON.stringify({
            name,
            path,
            is_default: setDefault,
            set_active: setActive
          })
        });
      } else {
        // Create
        res = await Auth.fetchWithAuth("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            name,
            path,
            is_default: setDefault,
            set_active: setActive
          })
        });
      }

      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        data = { error: `Server error (${res.status} ${res.statusText || 'Error'})` };
      }
      if (!res.ok) throw new Error(data.error || "Failed to save project");

      this.closeModal();
      await this.loadProjects();
    } catch (e) {
      alert("Error saving project: " + e.message);
    }
  },

  async setActiveProject(projectId) {
    try {
      const res = await Auth.fetchWithAuth("/api/projects/active", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId })
      });
      if (res.ok) {
        await this.loadProjects();
      }
    } catch (e) {
      console.error("Failed to set active project:", e);
    }
  },

  async deleteProject(projectId) {
    try {
      const res = await Auth.fetchWithAuth(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE"
      });
      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        data = { error: `Server error (${res.status} ${res.statusText || 'Error'})` };
      }
      if (!res.ok) throw new Error(data.error || "Failed to delete project");
      await this.loadProjects();
    } catch (e) {
      alert("Error deleting project: " + e.message);
    }
  },

  shortenPath(p) {
    if (!p) return "";
    const parts = p.split("/").filter(Boolean);
    if (parts.length <= 2) return p;
    return ".../" + parts.slice(-2).join("/");
  },

  formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (e) {
      return "";
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
