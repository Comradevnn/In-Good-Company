#!/usr/bin/env bash
# Removes ONLY the demo rows created by seed-demo.command: the
# demo-N@example.com volunteers (plus their pairings, bookings, Deeds,
# chat, ratings, document claims and badges), then the demo-org-N@example.com
# orgs and their shifts. Nothing else is touched; each step refuses to run
# if a non-demo account is involved.
. "$(dirname "$0")/_common.sh"

cd "$BACKEND_DIR"
node clear-demo-users.js
node clear-demo-orgs.js
