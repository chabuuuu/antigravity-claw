#!/usr/bin/env bash
# ==============================================================================
# One-Click Installer for Antigravity OpenClaw on Ubuntu / Debian VPS
# ==============================================================================
set -e

echo "=========================================================="
echo "🦅 Installing Antigravity OpenClaw on Ubuntu VPS"
echo "=========================================================="

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# 1. Check for Python 3 and basic build tools
echo "📦 [1/5] Checking and installing system dependencies..."
if [ -x "$(command -v apt-get)" ]; then
    sudo apt-get update -y
    sudo apt-get install -y python3 python3-venv python3-pip curl git sqlite3
fi

# 2. Check Antigravity CLI binary
echo "🤖 [2/5] Checking for Antigravity CLI (agy)..."
if command -v agy >/dev/null 2>&1; then
    echo "✓ Found agy in PATH: $(command -v agy)"
elif [ -f "$HOME/.gemini/bin/agy" ]; then
    echo "✓ Found agy at: $HOME/.gemini/bin/agy"
else
    echo "⚠️ Warning: 'agy' CLI binary not found in standard paths."
    echo "  Please make sure Antigravity is installed and accessible."
    echo "  See: https://antigravity.google/docs/cli/reference"
fi

# 3. Setup Python Virtual Environment
echo "🐍 [3/5] Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 4. Prepare Directories and .env configuration
echo "⚙️ [4/5] Preparing environment and database directories..."
mkdir -p data static/css static/js
if [ ! -f ".env" ]; then
    cp .env.example .env
    # Auto configure workspace path to user's home or current dir
    sed -i "s|OPENCLAW_WORKSPACE=.*|OPENCLAW_WORKSPACE=$HOME|" .env
    echo "✓ Created default .env file"
fi

# 5. Setup Systemd Service (Optional automated background service)
echo "🔧 [5/5] Configuring systemd service..."
CURRENT_USER=$(whoami)
SERVICE_FILE="/etc/systemd/system/antigravity-openclaw.service"

if [ -w "/etc/systemd/system" ] || sudo -n true 2>/dev/null; then
    sudo bash -c "cat <<EOF > $SERVICE_FILE
[Unit]
Description=Antigravity OpenClaw - Autonomous Remote Studio
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/venv/bin/python3 -m backend.app
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF"
    sudo systemctl daemon-reload
    sudo systemctl enable antigravity-openclaw.service
    echo "✓ Systemd service installed: antigravity-openclaw.service"
    echo "  You can start it with: sudo systemctl start antigravity-openclaw"
else
    echo "ℹ️ Note: Skipped automatic systemd service creation (root/sudo needed)."
    echo "  You can manually run ./start.sh or copy antigravity-openclaw.service to /etc/systemd/system/"
fi

# Make scripts executable
chmod +x start.sh stop.sh 2>/dev/null || true

echo ""
echo "=========================================================="
echo "🎉 Installation Complete!"
echo "=========================================================="
echo "To start OpenClaw immediately:"
echo "  ./start.sh"
echo ""
echo "Or with systemd:"
echo "  sudo systemctl start antigravity-openclaw"
echo "  sudo systemctl status antigravity-openclaw"
echo ""
echo "Access the dashboard in your browser:"
echo "  http://<YOUR_VPS_IP>:8080"
echo "On your first visit, you will be prompted to create your Admin credentials."
echo "=========================================================="
