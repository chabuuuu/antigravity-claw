/**
 * Antigravity OpenClaw - Main Frontend Orchestrator
 */
const App = {
  currentView: "chat",
  ws: null,
  reconnectInterval: null,

  async init() {
    this.bindNavigation();

    // Verify authentication
    const isAuthenticated = await Auth.checkStatus();
    if (!isAuthenticated) return;

    // Initialize subsystems
    this.initWebSocket();
    Chat.init();
    Explorer.init();
    Terminal.init();
    Usage.init();
    Settings.init();
    Scheduler.init();
    Audit.init();

    // Start polling system metrics
    this.pollSystemMetrics();
    setInterval(() => this.pollSystemMetrics(), 5000);
    // Refresh Quota every 2 minutes
    setInterval(() => Usage.loadUsage(), 120000);
  },

  bindNavigation() {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", () => {
        const targetView = item.getAttribute("data-view");
        this.switchView(targetView);
      });
    });
  },

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.toggle("active", item.getAttribute("data-view") === viewName);
    });
    document.querySelectorAll(".view-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `view-${viewName}`);
    });

    // Refresh view data when entered
    if (viewName === "workspace") Explorer.loadDirectory(Explorer.currentDirectory);
    if (viewName === "usage") Usage.loadUsage();
    if (viewName === "settings") Settings.loadAll();
    if (viewName === "schedules") Scheduler.loadSchedules();
    if (viewName === "audit") Audit.loadLogs();
  },

  initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.ws = new WebSocket(wsUrl);
    window.AppWS = this.ws;

    this.ws.onopen = () => {
      this.updateWsStatus(true);
      if (Auth.token) {
        this.ws.send(JSON.stringify({ action: "auth", token: Auth.token }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "auth_ok") {
          console.log("WebSocket authenticated as", data.username);
        } else if (data.type === "auth_required") {
          if (Auth.token) {
            this.ws.send(JSON.stringify({ action: "auth", token: Auth.token }));
          }
        } else if (data.type === "terminal_data" || data.type === "terminal_exit") {
          Terminal.handleStreamData(data);
        } else {
          Chat.handleStreamEvent(data);
        }
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    };

    this.ws.onclose = () => {
      this.updateWsStatus(false);
      setTimeout(() => this.initWebSocket(), 3000);
    };

    this.ws.onerror = (err) => {
      console.warn("WebSocket error:", err);
      this.updateWsStatus(false);
    };
  },

  updateWsStatus(isConnected) {
    const dot = document.getElementById("ws-dot");
    const text = document.getElementById("ws-status-text");
    if (isConnected) {
      dot.className = "status-dot";
      text.innerText = "Connected";
    } else {
      dot.className = "status-dot disconnected";
      text.innerText = "Reconnecting...";
    }
  },

  async pollSystemMetrics() {
    if (!Auth.token) return;
    try {
      const res = await fetch("/api/system/status", { headers: Auth.getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      
      document.getElementById("metric-cpu").innerText = `${data.cpu_percent}%`;
      document.getElementById("metric-ram").innerText = `${data.memory.percent}%`;
      document.getElementById("metric-disk").innerText = `${data.disk.percent}%`;
    } catch (e) {}
  }
};

window.addEventListener("DOMContentLoaded", () => App.init());

