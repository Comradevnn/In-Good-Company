#!/bin/bash
# Prepares a git worktree of this repo for running the app and tests:
# symlinks node_modules from the main checkout, creates backend/data, and
# copies the gitignored backend/.env (never print or commit it).
# Usage: scripts/orchestration/wt-setup.sh <worktree-path>
WT="${1:?worktree path}"
MAIN=$(cd "$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir)/.." && pwd) || exit 2
[ "$(cd "$WT" && pwd)" = "$MAIN" ] && { echo "not a worktree; nothing to do"; exit 0; }
for d in backend mobile; do
  [ -e "$WT/$d/node_modules" ] || ln -s "$MAIN/$d/node_modules" "$WT/$d/node_modules"
done
mkdir -p "$WT/backend/data"
[ -f "$WT/backend/.env" ] || cp "$MAIN/backend/.env" "$WT/backend/.env"
echo "worktree ready: $WT (note: agent worktrees start from main; check out the working branch tip first)"
