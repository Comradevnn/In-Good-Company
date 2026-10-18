# Shared setup for the scripts/*.command helpers (macOS equivalents of the
# Windows setup scripts). Sourced, not run directly.
#
# Double-clicked .command files open a non-interactive shell that never reads
# ~/.zshrc, so nvm has to be loaded explicitly here.

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_DIR/backend"
MOBILE_DIR="$REPO_DIR/mobile"
# backend/package.json depends on "recryption": "file:../../Recryption".
RECRYPTION_DIR="$(cd "$REPO_DIR/.." && pwd)/Recryption"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install nvm, then run: nvm install 24"
  exit 1
fi

# Keep a double-clicked Terminal window open at the end, like `pause` in a .bat.
pause_on_exit() {
  status=$?
  echo
  if [ $status -ne 0 ]; then echo "Failed (exit code $status)."; fi
  if [ -t 0 ]; then read -r -p "Press Return to close..." _; fi
}
trap pause_on_exit EXIT
