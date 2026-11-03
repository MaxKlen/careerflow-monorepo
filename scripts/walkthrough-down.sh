#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT/.m11-scripts"
PID_FILE="$STATE_DIR/pids"

if [ -f "$PID_FILE" ]; then
  while read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

docker compose -f "$ROOT/docker/compose.yml" down
rm -f "$STATE_DIR"/*.cookies "$STATE_DIR"/seed.env "$STATE_DIR"/*.log

echo "CareerFlow owner walkthrough services and synthetic runtime state stopped."
