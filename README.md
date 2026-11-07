# 🦅 Antigravity OpenClaw

<div align="center">

**Remote Autonomous Agent Studio for Google Antigravity (`agy`)**  
*Một phần mềm mã nguồn mở biến VPS Linux Ubuntu thành trạm điều khiển Agent Antigravity từ xa qua giao diện web hiện đại như OpenClaw.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Platform: Linux Ubuntu](https://img.shields.io/badge/platform-Ubuntu%20Linux-orange.svg)](https://ubuntu.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[English](#-english-overview) • [Tiếng Việt](#-tổng-quan-tiếng-việt) • [Documentation](./docs/ARCHITECTURE.md) • [VPS Deployment](./docs/DEPLOYMENT_VPS_UBUNTU.md)

</div>

---

## 🌟 Giới thiệu / Overview

**Antigravity OpenClaw** là nền tảng mã nguồn mở mang giao diện làm việc tự động (Autonomous Studio) chuẩn OpenClaw lên trên **Google Antigravity CLI (`agy`)**. 

Khi bạn cài đặt Antigravity lên VPS Linux Ubuntu riêng, **Antigravity OpenClaw** cung cấp cho bạn một giao diện web an toàn, phản hồi thời gian thực (real-time stream) để:
- Điều khiển Antigravity thực hiện các task lập trình, sửa lỗi, review code từ bất kỳ thiết bị nào qua trình duyệt.
- Tự động hóa tác vụ định kỳ (Cron / Scheduled Automations) khi bạn tắt máy.
- Quản lý đầy đủ 100% cấu hình Antigravity: Models (Gemini 4 Argon, Gemini 3.8 Flash, Claude Sonnet), MCP Servers, Plugins, Rules (`GEMINI.md`).
- Bảo mật nghiêm ngặt: Bắt buộc đăng nhập, chống tấn công brute-force, phân quyền và ghi vết kiểm toán (Audit Trail) bất biến.

---

## 🚀 Tính năng nổi bật / Key Features

### 1. 💬 Trạm làm việc Agent trực tiếp với Antigravity CLI
- Giao tiếp trực tiếp với `agy` bằng giao thức `--output-format stream-json`.
- Stream từng token, hiển thị cây suy luận (Thinking / Reasoning accordion), thẻ thực thi công cụ (Tool Execution Cards) thời gian thực.
- Đầy đủ thống kê Token: Input Tokens, Output Tokens, Thinking Tokens, thời gian xử lý.
- Hỗ trợ đa phiên trò chuyện (Multi-turn conversations), tạm dừng / hủy bỏ tác vụ (Kill/Cancel).

### 2. ⚙️ Hỗ trợ 100% cấu hình của Antigravity trên UI
- **Bộ chọn Models**: Tự động nhận diện danh sách model qua `agy models` (Gemini 4 Argon High/Med/Low, Gemini 3.8 Flash, Claude Opus/Sonnet 5.5).
- **Reasoning Effort & Execution Mode**: Low, Medium, High, Max; Auto, Accept-Edits, Plan.
- **Quản lý MCP Servers**: Liệt kê, thêm mới, gỡ bỏ, bật/tắt các công cụ MCP (`agy mcp list/add/remove`).
- **Quản lý Plugins**: Bật/tắt, cài đặt các plugin Antigravity (`agy plugins list/enable/disable`).
- **Chỉnh sửa Rules & Chỉ thị**: Trực tiếp biên tập `GEMINI.md` và `AGENTS.md` ngay trên web.
- **Trình sửa Raw JSON**: Xem và sửa an toàn `~/.gemini/settings.json` và `config.json`.

### 3. 📁 Quản lý File & Trình soạn thảo Code từ xa
- Duyệt cây thư mục VPS thời gian thực.
- Trình xem và soạn thảo code trực tiếp (Syntax-highlighted code editor) với tính năng lưu phím tắt `Ctrl + S`.
- Cơ chế tự động sao lưu `.bak` trước khi lưu file.
- Tích hợp Git: Hiển thị branch hiện tại và số file bị thay đổi (`git status`).

### 4. 💻 VPS Web Terminal
- Cửa sổ dòng lệnh Terminal trực tiếp trong trình duyệt để kiểm tra VPS.
- Hỗ trợ màu sắc ANSI, lịch sử lệnh (Arrow Up/Down), ngắt tiến trình (Kill).

### 5. ⏱️ Tác vụ Tự hành (Autonomous Scheduler & Cron)
- Lên lịch tác vụ định kỳ theo chuẩn Cron (vd: `*/30 * * * *`, `@daily`, `every 60 min`).
- Chạy ngầm 24/7 trên VPS độc lập, tự động dispatch Antigravity làm task khi đến giờ.
- Bắn thông báo Webhook về **Telegram**, **Discord**, **Slack**, hoặc Webhook tùy chỉnh khi hoàn thành hoặc có lỗi.

### 6. 🛡️ Cơ chế Bảo mật Mạnh & Audit Logging
- **Bắt buộc Đăng nhập**: Toàn bộ API và giao diện bị khóa nếu chưa chứng thực.
- **Thiết lập Quản trị viên ban đầu (First-Run Wizard)**: Khi mới khởi tạo hệ thống, bạn sẽ tự đặt mật khẩu Admin đầu tiên, tuyệt đối không có mật khẩu mặc định (hardcoded).
- **Mã hóa chuẩn công nghiệp**: Mật khẩu được băm bằng Bcrypt / PBKDF2 (600,000 vòng lặp) kết hợp Salt ngẫu nhiên. Token JWT có ký số mật mã HS256 và cơ chế thu hồi (Revocation).
- **Chống Brute-force & Rate Limiting**: Tự động khóa IP 15 phút nếu nhập sai mật khẩu quá 5 lần.
- **Chống Path Traversal**: Ngăn chặn tuyệt đối việc đọc/ghi các file nhạy cảm ngoài workspace (`/etc/passwd`, v.v.).
- **Audit Trail Bất Biến**: Ghi lại toàn bộ hành động (Đăng nhập, chạy task, mở/sửa/xóa file, chạy terminal, đổi cấu hình) kèm IP, thời gian UTC, User Agent. Hỗ trợ tra cứu, lọc và xuất ra file CSV/JSON.

---

## 🏗️ Kiến trúc Hệ thống / System Architecture

```
+-------------------------------------------------------------------------+
|                  Remote Web Browser (OpenClaw SPA)                     |
|  [💬 Chat]  [📁 Explorer]  [💻 Terminal]  [⚙️ Settings]  [📋 Audit]    |
+-------------------------------------------------------------------------+
                                   ▲
                                   │ WebSocket (/ws) & REST API
                                   ▼
+-------------------------------------------------------------------------+
|                    Ubuntu VPS: Nginx Reverse Proxy & SSL                |
+-------------------------------------------------------------------------+
                                   ▲
                                   ▼
+-------------------------------------------------------------------------+
|               Antigravity OpenClaw Engine (Python / Tornado)            |
|                                                                         |
|  * Auth & IP Rate Limiting        * Tamper-evident Audit Logger         |
|  * Path-traversal Guard           * Web Terminal Subprocess             |
|  * Autonomous Cron Scheduler      * Telegram / Discord Webhook Notifier |
|  * SQLite WAL DB (openclaw.db)                                          |
+-------------------------------------------------------------------------+
                                   ▲
                                   │ Async Subprocess (stdin/stdout NDJSON)
                                   ▼
+-------------------------------------------------------------------------+
|                   Google Antigravity CLI (`agy`) Engine                 |
|                                                                         |
|  * Gemini / Claude Engine         * Subagents (self, research, etc.)    |
|  * Plugins & Skills               * Model Context Protocol (MCP)        |
+-------------------------------------------------------------------------+
```

---

## ⚡ Cài đặt Nhanh trên VPS / Quickstart

### Cách 1: Sử dụng Script Cài đặt Tự động (Khuyên dùng)

Chạy 3 lệnh sau trên VPS Ubuntu:

```bash
# 1. Clone repository
git clone https://github.com/<your-username>/antigravity-openclaw.git
cd antigravity-openclaw

# 2. Chạy script cài đặt
chmod +x install.sh
./install.sh

# 3. Khởi động dịch vụ
sudo systemctl start antigravity-openclaw
```

Bây giờ bạn có thể truy cập `http://<IP_VPS_CỦA_BẠN>:8080`. Trình duyệt sẽ mở **Wizard Tạo Tài Khoản Admin** cho lần đầu tiên.

---

### Cách 2: Chạy Thủ Công Không Dùng Root

```bash
# Tạo môi trường ảo Python
python3 -m venv venv
source venv/bin/activate

# Cài đặt thư viện
pip install -r requirements.txt

# Khởi chạy server
./start.sh
```

Để dừng server:
```bash
./stop.sh
```

---

### Cách 3: Chạy bằng Docker

```bash
docker compose up -d
```

---

## 🌐 Thiết lập Tên miền & SSL HTTPS với Nginx

Để truy cập từ xa an toàn qua HTTPS:

1. Trỏ Domain về IP VPS của bạn.
2. Cài đặt Nginx & Certbot:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```
3. Áp dụng cấu hình Nginx mẫu:
   ```bash
   sudo cp nginx.conf.example /etc/nginx/sites-available/openclaw.conf
   sudo nano /etc/nginx/sites-available/openclaw.conf  # Điền domain của bạn
   sudo ln -s /etc/nginx/sites-available/openclaw.conf /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. Cấp chứng chỉ SSL miễn phí:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

---

## 📚 Tài liệu Chi tiết / Detailed Documentation

- [System Architecture & Internals](./docs/ARCHITECTURE.md): Kiến trúc chuyên sâu, cơ chế xử lý luồng dữ liệu.
- [Ubuntu VPS Deployment Guide](./docs/DEPLOYMENT_VPS_UBUNTU.md): Hướng dẫn cấu hình Firewall UFW, Let's Encrypt, Systemd 24/7.
- [Antigravity CLI Integration Guide](./docs/ANTIGRAVITY_INTEGRATION.md): Chi tiết giao thức `stream-json`, flags, MCP, Plugins.
- [REST & WebSocket API Reference](./docs/API_REFERENCE.md): Danh mục API và WebSocket schema đầy đủ.

---

## 🤝 Đóng góp cho Cộng đồng / Contributing

Dự án này hoàn toàn mã nguồn mở và hướng tới cộng đồng lập trình viên Antigravity toàn cầu. Mọi đóng góp (Báo lỗi, đề xuất tính năng, cải thiện UI, thêm plugin mới) đều được hoan nghênh nhiệt liệt!

Vui lòng xem:
- [Quy tắc Đóng góp (CONTRIBUTING.md)](./CONTRIBUTING.md)
- [Quy tắc Ứng xử (CODE_OF_CONDUCT.md)](./CODE_OF_CONDUCT.md)
- [Chính sách Bảo mật (SECURITY.md)](./SECURITY.md)

---

## 📄 Bản quyền / License

Dự án được phân phối dưới giấy phép **[MIT License](./LICENSE)**. Bạn hoàn toàn tự do sử dụng, chỉnh sửa, đóng góp và triển khai thương mại hoặc phi thương mại.
