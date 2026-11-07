#!/usr/bin/env bash
# Start Antigravity OpenClaw in foreground or background
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

mkdir -p data logs

if [ "$1" == "--daemon" ] || [ "$1" == "-d" ]; then
    nohup python3 -m backend.app > logs/app.log 2>&1 &
    PID=$!
    echo $PID > data/app.pid
    echo "🦅 Antigravity OpenClaw started in background (PID: $PID)"
    echo "Logs: tail -f logs/app.log"
else
    python3 -m backend.app
fi

