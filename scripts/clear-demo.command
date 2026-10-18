#!/usr/bin/env bash
# Removes ONLY the demo-N@example.com accounts created by seed-demo.command
# (plus their pairings, document claims, and badges). Nothing else is touched.
. "$(dirname "$0")/_common.sh"

cd "$BACKEND_DIR"
node clear-demo-users.js
