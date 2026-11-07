/**
 * Security & Audit Logs Module
 */
const Audit = {
  init() {
    this.bindEvents();
    this.loadLogs();
  },

  bindEvents() {
    document.getElementById("btn-audit-refresh").addEventListener("click", () => this.loadLogs());
    document.getElementById("btn-export-audit-csv").addEventListener("click", () => this.exportLogs("csv"));
    document.getElementById("btn-export-audit-json").addEventListener("click", () => this.exportLogs("json"));
    
    document.getElementById("audit-search-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.loadLogs();
    });
  },

  async loadLogs() {
    const search = document.getElementById("audit-search-input").value.trim();
    const action = document.getElementById("audit-action-filter").value;
    
    let url = "/api/audit/logs?limit=100";
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;

    try {
      const res = await fetch(url, { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const table = document.getElementById("audit-logs-table");
      table.innerHTML = "";

      (data.logs || []).forEach(log => {
        const tr = document.createElement("tr");
        const isSuccess = log.status === "SUCCESS";
        const isDenied = log.status === "DENIED" || log.status === "FAILURE";
        const badgeClass = isSuccess ? 'badge-done' : (isDenied ? 'badge-failed' : 'badge-active');
        
        tr.innerHTML = `
          <td><span style="font-family:var(--font-mono); font-size:11px;">${log.timestamp.replace("T", " ").substring(0, 19)}</span></td>
          <td><strong>${this.escapeHtml(log.username)}</strong></td>
          <td><code>${this.escapeHtml(log.ip_address)}</code></td>
          <td><span class="tool-badge badge-active">${log.action}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${this.escapeHtml(log.resource || '-')}</span></td>
          <td><span class="tool-badge ${badgeClass}">${log.status}</span></td>
        `;
        table.appendChild(tr);
      });
    } catch (e) {
      console.warn("Error loading audit logs:", e);
    }
  },

  exportLogs(format = "csv") {
    const token = Auth.token;
    window.open(`/api/audit/export?format=${format}&token=${token}`, "_blank");
  },

  escapeHtml(str) {
    if (!str) return "";
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
};
