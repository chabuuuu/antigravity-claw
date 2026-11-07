/**
 * Workspace Files & Code Editor Module
 */
const Explorer = {
  currentFilePath: null,
  currentDirectory: "",

  init() {
    this.bindEvents();
    this.loadDirectory("");
    this.checkGitStatus();
  },

  bindEvents() {
    document.getElementById("btn-tree-refresh").addEventListener("click", () => this.loadDirectory(this.currentDirectory));
    document.getElementById("btn-tree-new-file").addEventListener("click", () => this.promptCreateFile());
    document.getElementById("btn-tree-new-folder").addEventListener("click", () => this.promptCreateFolder());
    document.getElementById("btn-tree-delete").addEventListener("click", () => this.deleteCurrentFile());
    document.getElementById("btn-editor-save").addEventListener("click", () => this.saveCurrentFile());

    // Ctrl+S keyboard shortcut inside editor
    document.getElementById("code-editor").addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        this.saveCurrentFile();
      }
    });
  },

  async loadDirectory(relPath = "") {
    try {
      const res = await fetch(`/api/workspace/files?path=${encodeURIComponent(relPath)}`, {
        headers: Auth.getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      this.currentDirectory = data.current_path;
      document.getElementById("current-workspace-pill").innerText = `Workspace: /${data.current_path}`;

      const listContainer = document.getElementById("tree-list");
      listContainer.innerHTML = "";

      // Back button if not at root
      if (this.currentDirectory) {
        const upNode = document.createElement("div");
        upNode.className = "tree-node";
        upNode.innerHTML = `<span>📁 .. (Up)</span>`;
        upNode.addEventListener("click", () => {
          const parts = this.currentDirectory.split("/");
          parts.pop();
          this.loadDirectory(parts.join("/"));
        });
        listContainer.appendChild(upNode);
      }

      (data.items || []).forEach(item => {
        const node = document.createElement("div");
        node.className = `tree-node ${item.rel_path === this.currentFilePath ? 'active' : ''}`;
        const icon = item.is_dir ? "📁" : "📄";
        node.innerHTML = `<span>${icon}</span><span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${this.escapeHtml(item.name)}</span>`;
        
        node.addEventListener("click", () => {
          if (item.is_dir) {
            this.loadDirectory(item.rel_path);
          } else {
            this.loadFile(item.rel_path);
          }
        });
        listContainer.appendChild(node);
      });
    } catch (e) {
      console.error("Failed to load directory:", e);
    }
  },

  async loadFile(relPath) {
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(relPath)}`, {
        headers: Auth.getAuthHeaders()
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to load file.");
        return;
      }
      const data = await res.json();
      this.currentFilePath = relPath;

      const editor = document.getElementById("code-editor");
      const filenameLabel = document.getElementById("editor-filename");
      const saveBtn = document.getElementById("btn-editor-save");

      editor.value = data.content;
      editor.removeAttribute("readonly");
      filenameLabel.innerText = `${relPath} (${(data.size / 1024).toFixed(1)} KB)`;
      saveBtn.style.display = "block";

      this.loadDirectory(this.currentDirectory);
    } catch (e) {
      console.error("Failed to read file:", e);
    }
  },

  async saveCurrentFile() {
    if (!this.currentFilePath) return;
    const content = document.getElementById("code-editor").value;
    const saveBtn = document.getElementById("btn-editor-save");
    saveBtn.innerText = "Saving...";

    try {
      const res = await fetch("/api/workspace/file", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({
          path: this.currentFilePath,
          content: content
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save file.");
      } else {
        saveBtn.innerText = "Saved! ✓";
        setTimeout(() => { saveBtn.innerText = "💾 Save (Ctrl+S)"; }, 1500);
      }
    } catch (e) {
      alert("Error saving file: " + e.message);
    } finally {
      saveBtn.innerText = "💾 Save (Ctrl+S)";
    }
  },

  async promptCreateFile() {
    const filename = prompt("Enter new file name (relative to current folder):");
    if (!filename) return;
    const fullPath = this.currentDirectory ? `${this.currentDirectory}/${filename}` : filename;
    try {
      const res = await fetch("/api/workspace/file", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ path: fullPath, content: "" })
      });
      if (res.ok) {
        this.loadDirectory(this.currentDirectory);
        this.loadFile(fullPath);
      }
    } catch (e) {
      alert("Failed to create file: " + e.message);
    }
  },

  async promptCreateFolder() {
    const foldername = prompt("Enter new folder name:");
    if (!foldername) return;
    const fullPath = this.currentDirectory ? `${this.currentDirectory}/${foldername}` : foldername;
    try {
      const res = await fetch("/api/workspace/file", {
        method: "POST",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ path: fullPath, is_directory: true })
      });
      this.loadDirectory(this.currentDirectory);
    } catch (e) {
      alert("Failed to create folder: " + e.message);
    }
  },

  async deleteCurrentFile() {
    if (!this.currentFilePath) {
      alert("Please select a file to delete first.");
      return;
    }
    if (!confirm(`Are you sure you want to delete ${this.currentFilePath}?`)) return;

    try {
      const res = await fetch("/api/workspace/file", {
        method: "DELETE",
        headers: Auth.getAuthHeaders(),
        body: JSON.stringify({ path: this.currentFilePath })
      });
      if (res.ok) {
        this.currentFilePath = null;
        document.getElementById("code-editor").value = "";
        document.getElementById("editor-filename").innerText = "Select a file to view or edit";
        document.getElementById("btn-editor-save").style.display = "none";
        this.loadDirectory(this.currentDirectory);
      }
    } catch (e) {
      alert("Failed to delete file: " + e.message);
    }
  },

  async checkGitStatus() {
    try {
      const res = await fetch("/api/workspace/git", {
        headers: Auth.getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      const pill = document.getElementById("git-status-pill");
      if (data.is_git && data.branch) {
        pill.innerText = `Git: ${data.branch}${data.modified_count ? ` (*${data.modified_count})` : ''}`;
        pill.style.display = "inline-block";
      } else {
        pill.style.display = "none";
      }
    } catch (e) {}
  },

  escapeHtml(str) {
    if (!str) return "";
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
};
