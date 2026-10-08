#!/usr/bin/env bash
# Build the web app with the production GitHub Pages base path and serve it locally.
# Usage: scripts/preview.sh [--no-build] [--port N]
#   Serves http://127.0.0.1:${PORT:-4173}/analog-portfolio/ (bound to 127.0.0.1 only). Ctrl-C to stop.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${VITE_BASE:-/analog-portfolio/}"
PORT="${PORT:-4173}"
BUILD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) BUILD=0 ;;
    --port) PORT="$2"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done
cd "$ROOT/web"
if [[ $BUILD -eq 1 ]]; then
  [[ -d node_modules ]] || npm ci
  VITE_BASE="$BASE" npm run build
fi
echo "Preview: http://127.0.0.1:${PORT}${BASE}"
exec env VITE_BASE="$BASE" npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort
