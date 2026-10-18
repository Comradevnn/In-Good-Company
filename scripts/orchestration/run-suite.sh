#!/bin/bash
# Runs backend test suites one at a time. The HTTP suites start their own
# server on port 3050 (backend/test-helpers.js), so two can't run at once;
# this lock serialises them across agents, worktrees and terminals.
# Usage (from anywhere inside a checkout or worktree):
#   scripts/orchestration/run-suite.sh test-foo.js [test-bar.js ...]
#   scripts/orchestration/run-suite.sh run-tests.js        # the full suite
LOCK="${TMPDIR:-/tmp}/igc-port3050.lock"
until mkdir "$LOCK" 2>/dev/null; do
  holder=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  sleep 3
done
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
ROOT=$(git rev-parse --show-toplevel) || exit 2
cd "$ROOT/backend" || exit 2
rc=0
for s in "$@"; do
  echo "== $s"
  MATCHING_LOG=off node "$s" 2>&1 | grep -E "^FAIL|passed, .* failed|suites passed"
  [ "${PIPESTATUS[0]}" -eq 0 ] || rc=1
done
exit $rc
