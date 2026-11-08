# Contributing to Antigravity OpenClaw

Thank you for your interest in contributing to **Antigravity OpenClaw**! OpenClaw is an open-source project designed for the developer community.

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- Python 3.10+
- Google Antigravity CLI (`agy`) installed and authorized
- Git and Docker

### 2. Setting Up Virtual Environment

```bash
git clone https://github.com/chabuuuu/antigravity_open_claw.git
cd antigravity_open_claw

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pytest
```

### 3. Running Unit Tests

OpenClaw includes a comprehensive test suite in `tests/test_backend.py`:

```bash
pytest -v
```

All 5 test suites verify:
- Administrator user initialization, password hashing, and JWT revocation.
- Tamper-evident append-only audit logging.
- Path traversal defense and workspace security boundaries.
- Settings manager models and subcommands.
- Health and REST endpoint responses.

---

## 🎨 Coding Standards & Guidelines

1. **All Documentation in English**: As an open-source project for the global developer community, all docs, commit messages, and docstrings must be written in English.
2. **Security by Default**: Never bypass authentication or authorization checks. All new endpoints must enforce `@require_auth` and record sensitive actions in the audit log.
3. **Responsive Mobile-First**: Any UI changes in `static/` must support both mobile smartphone viewports (`<= 768px`) and desktop screens.
4. **No External CDN Dependencies in Backend**: Keep the backend lightweight and self-contained using Python's standard library and Tornado.

---

## 🚀 Submitting Pull Requests

1. Fork the repository on GitHub.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Commit your changes: `git commit -m "feat: add amazing feature"`.
4. Ensure all unit tests pass: `pytest -v`.
5. Push to your branch: `git push origin feature/amazing-feature`.
6. Open a Pull Request on GitHub with a clear description of your changes.

