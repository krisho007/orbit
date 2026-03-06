#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Select platform:"
echo "  1) Android"
echo "  2) Web"
printf "> "
read -r choice

case $choice in
  1|android|a)
    FE_CMD="cd '$ROOT_DIR/apps/mobile' && bun run android:local"
    PLATFORM="Android"
    ;;
  2|web|w)
    FE_CMD="cd '$ROOT_DIR/apps/mobile' && bun run web:local"
    PLATFORM="Web"
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

BE_CMD="cd '$ROOT_DIR/apps/api' && bun run dev"

echo "Starting API + $PLATFORM in separate terminals..."

# Open API server in a new Terminal.app tab
osascript <<EOF
tell application "Terminal"
    activate
    do script "$BE_CMD"
end tell
EOF

# Run frontend in current terminal
eval "$FE_CMD"
