#!/usr/bin/env bash
# Starts Metro for Expo Go. Scan the QR code with your phone (same Wi-Fi as
# this Mac). Defaults to port 8081; override with METRO_PORT=8090.
. "$(dirname "$0")/_common.sh"

cd "$MOBILE_DIR"
echo "== Starting Metro on port ${METRO_PORT:-8081} (Ctrl+C to stop)"
npx expo start --port "${METRO_PORT:-8081}"
