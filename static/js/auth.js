/**
 * Authentication & Session Management Module
 */
const Auth = {
  token: localStorage.getItem("openclaw_token") || null,
  currentUser: null,
  isSetupRequired: false,

  async checkStatus() {
    try {
      const res = await fetch("/api/auth/status", {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      
      this.isSetupRequired = data.setup_required;
      if (this.isSetupRequired) {
        this.showSetupModal();
        return false;
      }
      
      if (!data.authenticated) {
        this.showLoginModal();
        return false;
      }
      
      this.currentUser = data.user;
      this.updateUserUI();
      this.hideModal();
      return true;
    } catch (e) {
      console.error("Auth status check failed:", e);
      this.showLoginModal();
      return false;
    }
  },

  getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  },

  showLoginModal() {
    const modal = document.getElementById("auth-modal");
    document.getElementById("auth-modal-title").innerText = "Sign In to OpenClaw";
    document.getElementById("setup-banner").style.display = "none";
    document.getElementById("setup-confirm-group").style.display = "none";
    document.getElementById("btn-auth-submit").innerText = "Sign In";
    modal.classList.add("active");
  },

  showSetupModal() {
    const modal = document.getElementById("auth-modal");
    document.getElementById("auth-modal-title").innerText = "Initialize Administrator Account";
    document.getElementById("setup-banner").style.display = "block";
    document.getElementById("setup-confirm-group").style.display = "flex";
    document.getElementById("btn-auth-submit").innerText = "Create Administrator";
    modal.classList.add("active");
  },

  hideModal() {
    document.getElementById("auth-modal").classList.remove("active");
    this.clearAlert();
  },

  showAlert(message, isError = true) {
    const alertBox = document.getElementById("auth-alert");
    alertBox.className = `alert-box ${isError ? 'alert-error' : 'alert-success'}`;
    alertBox.innerText = message;
    alertBox.style.display = "block";
  },

  clearAlert() {
    const alertBox = document.getElementById("auth-alert");
    alertBox.style.display = "none";
    alertBox.innerText = "";
  },

  async handleSubmit() {
    const username = document.getElementById("auth-username").value.trim();
    const password = document.getElementById("auth-password").value;

    if (!username || !password) {
      this.showAlert("Please enter both username and password.");
      return;
    }

    if (this.isSetupRequired) {
      const confirm = document.getElementById("auth-password-confirm").value;
      if (password !== confirm) {
        this.showAlert("Passwords do not match.");
        return;
      }
      if (password.length < 8) {
        this.showAlert("Password must be at least 8 characters long.");
        return;
      }

      try {
        const res = await fetch("/api/auth/initial-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || "Setup failed.");
          return;
        }
        this.token = data.token;
        localStorage.setItem("openclaw_token", data.token);
        this.currentUser = data.user;
        this.updateUserUI();
        this.hideModal();
        window.location.reload();
      } catch (e) {
        this.showAlert("Network error during setup: " + e.message);
      }
    } else {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
          this.showAlert(data.error || "Invalid username or password.");
          return;
        }
        this.token = data.token;
        localStorage.setItem("openclaw_token", data.token);
        this.currentUser = data.user;
        this.updateUserUI();
        this.hideModal();
        window.location.reload();
      } catch (e) {
        this.showAlert("Network error during login: " + e.message);
      }
    }
  },

  async logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: this.getAuthHeaders()
      });
    } catch (e) {
      console.warn("Logout request failed:", e);
    }
    this.token = null;
    localStorage.removeItem("openclaw_token");
    this.currentUser = null;
    window.location.reload();
  },

  updateUserUI() {
    if (this.currentUser) {
      document.getElementById("user-display-name").innerText = this.currentUser.username;
      document.getElementById("user-avatar").innerText = this.currentUser.username.charAt(0).toUpperCase();
    }
  }
};

document.getElementById("btn-auth-submit").addEventListener("click", () => Auth.handleSubmit());
document.getElementById("auth-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") Auth.handleSubmit();
});
document.getElementById("btn-logout").addEventListener("click", () => Auth.logout());
