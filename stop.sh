#!/usr/bin/env bash
# Stop Antigravity OpenClaw daemon
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -f "data/app.pid" ]; then
    PID=$(cat data/app.pid)
    if ps -p $PID > /dev/null 2>&1; then
        kill $PID
        echo "🛑 Stopped Antigravity OpenClaw (PID: $PID)"
        rm -f data/app.pid
        exit 0
    fi
fi

# Fallback kill by process pattern
PIDS=$(pgrep -f "python3 -m backend.app" || true)
if [ -n "$PIDS" ]; then
    kill $PIDS
    echo "🛑 Stopped Antigravity OpenClaw processes: $PIDS"
else
    echo "ℹ️ No running Antigravity OpenClaw process found."
fi
