#!/usr/bin/env bash
# Inserts the demo-N@example.com accounts (password "demopassword123").
# Safe to re-run: existing demo accounts are skipped.
. "$(dirname "$0")/_common.sh"

cd "$BACKEND_DIR"
node seed-demo-users.js
