#!/usr/bin/env bash
# Starts the whole app in one window: the backend in the background (its log
# goes to backend/data/backend.log) and Metro for Expo Go in the foreground,
# so the QR code and Metro's keys work as usual. Ctrl+C or closing the window
# stops both. Defaults to ports 3000 and 8081; override with
# PORT=3050 METRO_PORT=8090 ./scripts/start-all.command.
. "$(dirname "$0")/_common.sh"

export PORT="${PORT:-3000}"
METRO_PORT="${METRO_PORT:-8081}"
# The app finds the backend on the same address as Metro, on this port.
export EXPO_PUBLIC_BACKEND_PORT="$PORT"
LOG="$BACKEND_DIR/data/backend.log"

for p in "$PORT" "$METRO_PORT"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $p is already in use, so the app may already be running."
    echo "Close the other window running it (or stop that process), then try again."
    exit 1
  fi
done

mkdir -p "$BACKEND_DIR/data"
echo "== Starting backend on port $PORT (log: backend/data/backend.log)"
(cd "$BACKEND_DIR" && exec node index.js) >"$LOG" 2>&1 &
BACKEND_PID=$!
stop_backend() { kill "$BACKEND_PID" 2>/dev/null; }
# Keep the exit status for pause_on_exit (from _common.sh), which reports it.
trap 'status=$?; stop_backend; (exit $status); pause_on_exit' EXIT
trap 'exit 130' INT HUP TERM

# Wait for the backend to answer before starting Metro.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$PORT/"; then break; fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "The backend stopped while starting. Last lines of its log:"
    tail -20 "$LOG"
    exit 1
  fi
  sleep 1
done
grep -m1 "reachable at" "$LOG" || true

echo "== Starting Metro on port $METRO_PORT (Ctrl+C or close this window to stop everything)"
cd "$MOBILE_DIR"
npx expo start --port "$METRO_PORT"
