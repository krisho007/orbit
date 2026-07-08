#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

FE_CMD="cd '$ROOT_DIR/apps/app' && bun run web:local"
BE_CMD="cd '$ROOT_DIR/apps/api' && bun run dev"

echo "Starting API + Web in separate terminals..."

# Open API server in a new Terminal.app tab
osascript <<EOF
tell application "Terminal"
    activate
    do script "$BE_CMD"
end tell
EOF

# Run frontend (web) in current terminal
eval "$FE_CMD"
