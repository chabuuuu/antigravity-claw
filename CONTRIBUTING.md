# Contributing to Antigravity OpenClaw

Thank you for your interest in contributing to **Antigravity OpenClaw**! We welcome contributions from developers, researchers, and AI enthusiasts worldwide.

---

## 🛠️ How to Contribute

### 1. Reporting Bugs
- Search existing issues to verify the bug hasn't already been reported.
- Open a new Issue detailing:
  - Operating system & Python version
  - Exact command or action taken
  - Expected vs. actual behavior
  - Relevant logs from `logs/app.log` or audit logs

### 2. Suggesting Enhancements
- Open a Feature Request issue describing your use case, proposal, and API/UI impact.
- Discuss with maintainers before starting large implementations.

### 3. Code Contributions
1. **Fork the repository** on GitHub.
2. **Clone your fork**:
   ```bash
   git clone https://github.com/<your-username>/antigravity-openclaw.git
   cd antigravity-openclaw
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-awesome-feature
   ```
4. **Setup development environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
5. **Run the server locally**:
   ```bash
   ./start.sh
   ```
6. **Commit your changes**:
   - Write clear, descriptive commit messages.
   - Maintain documentation integrity and add comments where necessary.
7. **Submit a Pull Request** against the `main` branch.

---

## 🎨 Code Style Guidelines

- **Python**: PEP 8 compliance, explicit type annotations, and clean async patterns.
- **Frontend**: Clean vanilla JavaScript / modern standards, no unnecessary bloated dependencies.
- **Security**: Never bypass authentication or path traversal checks. Always record sensitive actions in the audit logger.

---

## 📜 Code of Conduct

All contributors are expected to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md).

