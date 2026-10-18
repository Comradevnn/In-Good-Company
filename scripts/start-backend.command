#!/usr/bin/env bash
# Starts the Express backend. Defaults to port 3000 (what mobile/config/api.js
# expects); override with PORT=3050 ./scripts/start-backend.command.
. "$(dirname "$0")/_common.sh"

cd "$BACKEND_DIR"
export PORT="${PORT:-3000}"
echo "== Starting backend on port $PORT (Ctrl+C to stop)"
node index.js
