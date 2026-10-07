#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
PROJECT_DIR="/Users/yuvi/.gemini/antigravity-ide/scratch/whatsapp-scheduler"

cd "$PROJECT_DIR" || exit 1

clear
echo "=========================================================="
echo "          📱 WhatsApp Message Scheduler"
echo "=========================================================="
echo ""

# Check if server is already running on port 3030
if lsof -i :3030 >/dev/null 2>&1; then
    echo " [✓] Scheduler server is already active on http://localhost:3030"
    echo " [✓] Opening dashboard in your default browser..."
    open "http://localhost:3030"
    echo ""
    echo " Dashboard opened! Press Enter to close this window..."
    read -r
    exit 0
fi

echo " [→] Starting WhatsApp Scheduler server with sleep prevention (caffeinate)..."
caffeinate -s -i node server.js &
SERVER_PID=$!

# Wait for server to become responsive
for i in {1..15}; do
    if curl -s http://localhost:3030/api/status >/dev/null 2>&1; then
        echo " [✓] Server is active and listening!"
        break
    fi
    sleep 1
done

echo " [✓] Opening WhatsApp Scheduler dashboard in your browser..."
open "http://localhost:3030"
echo ""
echo "=========================================================="
echo " Dashboard is live at: http://localhost:3030"
echo " Process ID: $SERVER_PID"
echo " Press Ctrl+C in this terminal to stop the server anytime."
echo "=========================================================="
echo ""

wait $SERVER_PID
