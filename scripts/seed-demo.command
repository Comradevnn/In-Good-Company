#!/usr/bin/env bash
# Inserts the demo orgs + their upcoming shifts (demo-org-N@example.com) and
# the demo volunteers (demo-N@example.com). All passwords: "demopassword123".
# Safe to re-run: existing demo rows are skipped; shifts are topped up.
# Pass --searching to also open a match search for each demo volunteer.
. "$(dirname "$0")/_common.sh"

cd "$BACKEND_DIR"
node seed-demo-orgs.js
node seed-demo-users.js "$@"
