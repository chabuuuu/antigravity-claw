# Mobile Experience & Autonomous Tasks on the Go

One of the standout design goals of **Antigravity OpenClaw** is enabling developers to dispatch, monitor, and manage autonomous coding tasks directly from their mobile phones.

Whether you are away from your workstation, commuting, or relaxing, OpenClaw provides a native app-like mobile experience right in your smartphone browser (iOS Safari, Android Chrome, Firefox Mobile).

---

## 📱 Mobile Architecture Highlights

### 1. Slide-Over Navigation Drawer
- On desktop screens, OpenClaw displays a fixed 260px sidebar.
- On mobile devices (`<= 768px`), the navigation neatly collapses into a smooth off-canvas drawer:
  - Tap the **`☰` Hamburger Button** in the top-left header to slide in the sidebar menu.
  - Quick-switch between **Agent Workspace**, **Files & Editor**, **VPS Terminal**, **Usage & Quotas**, **Antigravity Config**, **Automations**, and **Security Audit**.
  - Tap anywhere outside the drawer (frosted backdrop) or tap **`✕`** to dismiss the menu.
  - Selecting any session or menu item automatically closes the drawer and brings you directly to the active view.

### 2. Thumb-Friendly Agent Workspace
- **Fixed Bottom Prompt Bar**: The prompt input box and execution buttons remain anchored to the bottom of the viewport with iOS safe-area inset support (`env(safe-area-inset-bottom)`).
- **Auto-Zoom Prevention**: The textarea font size is styled at 16px to prevent iOS Safari from automatically zooming into input fields.
- **Large CTA Run Button**: The `🚀 Run` button is enlarged for quick, one-handed thumb tapping.
- **Autonomous Mode**: Keep the `Autonomous` checkbox checked to allow Antigravity to run tools (`run_command`, `write_file`, `edit_file`) without pausing for interactive confirmation.

### 3. Mobile Workspace Tab Switcher
- On desktop, the Workspace view displays the **File Explorer** and **Code Editor** side-by-side.
- On mobile screens, OpenClaw introduces a segmented switcher:
  - `[📁 File Tree]` tab: Browse directory hierarchy and file sizes.
  - `[📝 Code Editor]` tab: Read and edit file contents.
  - Tapping any file in the File Tree automatically loads the file and switches the view to the Code Editor!

### 4. Interactive Live Streaming
- Streaming message deltas, reasoning accordions, and tool execution cards are styled with fluid widths (`100%`) and responsive font sizes.
- Monospace output boxes and code blocks feature horizontal scrolling with `-webkit-overflow-scrolling: touch;`, preventing long lines from breaking the mobile layout.

### 5. Header Quota Badge
- A compact quota badge is visible directly in the top header (`📊 Gemini: 85% · Claude: 100%`).
- Tap the quota badge anytime to jump directly to the **Usage & Quotas** dashboard.

---

## 💡 How to Prompt Autonomous Tasks from Mobile

Here are example autonomous prompt workflows designed for mobile dispatch:

### Example 1: Bug Fixing & Unit Testing
> *"Run git pull to get latest changes. Run pytest tests/ and if any test fails, inspect the stack trace, fix the bug in backend/ or static/, and re-run pytest until all tests pass."*

With **Autonomous** checked, Antigravity will:
1. Execute `git pull` via `run_command`.
2. Execute `pytest` and read the error logs.
3. Edit the relevant file using `edit_file`.
4. Re-run `pytest` to verify the fix.
5. Stream all tool outputs live to your phone screen!

### Example 2: Codebase Refactoring
> *"Review all files in backend/ and remove deprecated helper functions. Ensure all unit tests still pass."*

### Example 3: Checking Quota on the Go
Type `/usage` or `/quota` in the chat input to render real-time progress bars showing your weekly remaining limit and exact hours until reset.

---

## 📲 Adding OpenClaw to Your Home Screen (PWA Feel)

You can install OpenClaw as an app icon on your smartphone:

### On iOS (Safari):
1. Open your OpenClaw URL (e.g. `https://openclaw.yourdomain.com`).
2. Tap the **Share** button (box with an arrow pointing up) at the bottom of Safari.
3. Scroll down and tap **Add to Home Screen**.
4. Name it **OpenClaw** and tap **Add**.
5. Launching from your Home Screen runs OpenClaw in full-screen standalone mode without Safari address bars!

### On Android (Chrome):
1. Open your OpenClaw URL in Google Chrome.
2. Tap the **Three Dots Menu (`⋮`)** in the top-right corner.
3. Tap **Install app** or **Add to Home Screen**.
4. Launch OpenClaw directly from your app drawer!
