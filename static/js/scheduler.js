/**
 * Autonomous Schedules & Background Automations Module
 */
const Scheduler = {
  init() {
    this.bindEvents();
    this.loadSchedules();
  },

  bindEvents() {
    const modal = document.getElementById("schedule-modal");
    document.getElementById("btn-add-schedule-modal").addEventListener("click", () => {
      modal.classList.add("active");
    });
    modal.querySelector(".modal-close").addEventListener("click", () => {
      modal.classList.remove("active");
    });
    document.getElementById("btn-save-schedule").addEventListener("click", () => this.createSchedule());
  },

  async loadSchedules() {
    try {
      const res = await fetch("/api/schedules", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const table = document.getElementById("schedules-table");
      table.innerHTML = "";

      (data.schedules || []).forEach(s => {
        const tr = document.createElement("tr");
        const isActive = s.is_active === 1;
        tr.innerHTML = `
          <td><strong>${s.name}</strong></td>
          <td><code>${s.cron_expr}</code></td>
          <td><span style="font-size:12px; color:var(--text-muted);">${s.next_run_at || '-'}</span></td>
          <td><span class="tool-badge ${isActive ? 'badge-done' : 'badge-failed'}">${isActive ? 'ACTIVE' : 'PAUSED'}</span></td>
          <td><span style="font-size:12px; color:var(--text-muted);">${(s.prompt || '').substring(0, 40)}...</span></td>
          <td>
            <button class="btn-icon btn-toggle-sched" data-id="${s.id}" data-active="${isActive ? '0' : '1'}">
              ${isActive ? 'Pause' : 'Resume'}
            </button>
            <button class="btn-icon btn-del-sched" data-id="${s.id}" style="color:var(--accent-red)">Delete</button>
          </td>
        `;
        table.appendChild(tr);
      });

      table.querySelectorAll(".btn-toggle-sched").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          const active = btn.getAttribute("data-active") === "1";
          await fetch(`/api/schedules/${id}/toggle`, {
            method: "POST",
            headers: Auth.getAuthHeaders(),
            body: JSON.stringify({ active })
          });
          this.loadSchedules();
        });
      });

      table.querySelectorAll(".btn-del-sched").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          if (!confirm("Delete this scheduled task?")) return;
          await fetch(`/api/schedules/${id}`, {
            method: "DELETE",
            headers: Auth.getAuthHeaders()
          });
          this.loadSchedules();
        });
      });
    } catch (e) {
      console.warn("Error loading schedules:", e);
    }
  },

  async createSchedule() {
    const name = document.getElementById("sched-name").value.trim();
    const cron_expr = document.getElementById("sched-cron").value.trim();
    const prompt = document.getElementById("sched-prompt").value.trim();
    const notify = document.getElementById("sched-notify").checked;

    if (!name || !cron_expr || !prompt) {
      alert("Name, cron expression, and prompt are required.");
      return;
    }

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({
          name,
          cron_expr,
          prompt,
          webhook_notify: notify
        })
      });
      if (res.ok) {
        document.getElementById("schedule-modal").classList.remove("active");
        this.loadSchedules();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create schedule.");
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  }
};

