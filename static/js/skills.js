/**
 * Antigravity Skills Catalog & Explorer Module
 * Lists, searches, and provides interactive documentation and 1-click invocation for all installed skills.
 */
const Skills = {
  skills: [],
  filteredSkills: [],
  currentCategory: "all",
  activeSkill: null,

  init() {
    this.bindEvents();
    this.loadSkills();
  },

  bindEvents() {
    const searchInput = document.getElementById("skills-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", () => this.filterSkills());
    }

    const filterPills = document.querySelectorAll("#skills-filter-pills .filter-pill");
    filterPills.forEach(pill => {
      pill.addEventListener("click", () => {
        filterPills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentCategory = pill.dataset.category || "all";
        this.filterSkills();
      });
    });

    const refreshBtn = document.getElementById("btn-refresh-skills");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.loadSkills());
    }

    const toChatBtn = document.getElementById("btn-skills-to-chat");
    if (toChatBtn) {
      toChatBtn.addEventListener("click", () => {
        if (typeof App !== "undefined") App.switchView("chat");
      });
    }

    // Modal Events
    const modal = document.getElementById("skill-doc-modal");
    const closeBtn = document.getElementById("btn-skill-doc-close");
    const invokeBtn = document.getElementById("btn-skill-doc-invoke");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.closeSkillModal());
    }

    const modalFooterClose = modal ? modal.querySelector(".modal-footer .modal-close") : null;
    if (modalFooterClose) {
      modalFooterClose.addEventListener("click", () => this.closeSkillModal());
    }

    if (invokeBtn) {
      invokeBtn.addEventListener("click", () => {
        if (this.activeSkill) {
          this.invokeSkill(this.activeSkill.name);
          this.closeSkillModal();
        }
      });
    }
  },

  async loadSkills() {
    const grid = document.getElementById("skills-grid");
    if (grid) {
      grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--text-muted);">Fetching Antigravity skills...</div>`;
    }

    try {
      const res = await Auth.fetchWithAuth("/api/antigravity/skills");
      const data = await res.json();
      this.skills = data.skills || [];
      this.filterSkills();
    } catch (e) {
      console.error("Failed to load skills:", e);
      if (grid) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--accent-red);">Failed to load skills: ${e.message}</div>`;
      }
    }
  },

  filterSkills() {
    const searchInput = document.getElementById("skills-search-input");
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";

    this.filteredSkills = this.skills.filter(s => {
      // Category filter
      if (this.currentCategory === "builtin" && !s.builtin) return false;
      if (this.currentCategory === "chrome-devtools" && !(s.plugin && s.plugin.includes("chrome-devtools"))) return false;
      if (this.currentCategory === "modern-web" && !(s.plugin && s.plugin.includes("modern-web"))) return false;
      if (this.currentCategory === "android" && !(s.plugin && s.plugin.includes("android"))) return false;

      // Search query
      if (query) {
        const name = (s.name || "").toLowerCase();
        const desc = (s.description || "").toLowerCase();
        const plugin = (s.plugin || "").toLowerCase();
        return name.includes(query) || desc.includes(query) || plugin.includes(query);
      }
      return true;
    });

    this.renderSkills();
  },

  renderSkills() {
    const grid = document.getElementById("skills-grid");
    if (!grid) return;

    if (this.filteredSkills.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
          <div style="color: var(--text-bright); font-weight: 600;">No skills found</div>
          <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">Try refining your search keyword or selecting 'All Skills'.</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = "";
    this.filteredSkills.forEach(s => {
      const card = document.createElement("div");
      card.className = "skill-card";
      const isBuiltin = s.builtin || !s.plugin;
      const pluginLabel = s.plugin || "builtin";

      card.innerHTML = `
        <div class="skill-card-header">
          <span class="skill-card-title">/${this.escapeHtml(s.name)}</span>
          <span class="skill-plugin-badge ${isBuiltin ? 'builtin' : ''}">${this.escapeHtml(pluginLabel)}</span>
        </div>
        <p class="skill-card-desc" title="${this.escapeHtml(s.description || '')}">${this.escapeHtml(s.description || 'No description provided.')}</p>
        <div class="skill-card-actions">
          <button type="button" class="btn-primary btn-invoke">🚀 Run in Chat</button>
          <button type="button" class="btn-secondary btn-docs">📖 Docs</button>
        </div>
      `;

      card.querySelector(".btn-invoke").addEventListener("click", () => {
        this.invokeSkill(s.name);
      });

      card.querySelector(".btn-docs").addEventListener("click", () => {
        this.openSkillDoc(s.name);
      });

      grid.appendChild(card);
    });
  },

  async openSkillDoc(name) {
    const modal = document.getElementById("skill-doc-modal");
    const titleEl = document.getElementById("skill-doc-modal-title");
    const metaEl = document.getElementById("skill-doc-modal-meta");
    const bodyEl = document.getElementById("skill-doc-modal-body");

    if (!modal) return;
    this.activeSkill = { name };

    if (titleEl) titleEl.innerText = `/${name} Documentation`;
    if (metaEl) metaEl.innerHTML = `<span style="color: var(--text-muted);">Loading skill documentation...</span>`;
    if (bodyEl) bodyEl.innerHTML = `<div style="text-align: center; padding: 20px;">Fetching SKILL.md...</div>`;
    modal.classList.add("active");
    modal.style.display = "flex";

    try {
      const res = await Auth.fetchWithAuth(`/api/antigravity/skills/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const s = data.skill;
      this.activeSkill = s;

      if (metaEl) {
        metaEl.innerHTML = `
          <span class="badge" style="background: rgba(56,139,253,0.2); color: #79c0ff; font-family: var(--font-mono);">/${this.escapeHtml(s.name)}</span>
          <span class="badge" style="background: rgba(46,160,67,0.2); color: #7ee787;">${this.escapeHtml(s.plugin || 'builtin')}</span>
          ${s.path ? `<span class="badge" style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">${this.escapeHtml(s.path)}</span>` : ''}
        `;
      }

      if (bodyEl) {
        if (s.content) {
          // Render markdown or preformatted text
          if (typeof Chat !== "undefined" && typeof Chat.renderMarkdown === "function") {
            bodyEl.innerHTML = Chat.renderMarkdown(s.content);
          } else {
            bodyEl.innerHTML = `<pre style="white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px;">${this.escapeHtml(s.content)}</pre>`;
          }
        } else {
          bodyEl.innerHTML = `<p>${this.escapeHtml(s.description || 'No detailed documentation available.')}</p>`;
        }
      }
    } catch (e) {
      if (bodyEl) {
        bodyEl.innerHTML = `<div style="color: var(--accent-red); padding: 12px;">Failed to load documentation: ${this.escapeHtml(e.message)}</div>`;
      }
    }
  },

  closeSkillModal() {
    const modal = document.getElementById("skill-doc-modal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  invokeSkill(name) {
    if (typeof App !== "undefined") {
      App.switchView("chat");
    }
    const textarea = document.getElementById("chat-textarea");
    if (textarea) {
      textarea.value = `/${name} `;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
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

