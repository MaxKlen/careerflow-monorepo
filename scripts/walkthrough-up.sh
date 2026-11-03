#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT/.m11-scripts"
PID_FILE="$STATE_DIR/pids"
mkdir -p "$STATE_DIR"
: > "$PID_FILE"

export NODE_ENV=development
export DATABASE_URL="${DATABASE_URL:-postgresql://careerflow:careerflow@127.0.0.1:5432/careerflow}"
export APP_URL="${APP_URL:-http://localhost:3000}"
export ADMIN_URL="${ADMIN_URL:-http://localhost:3001}"
export EMPLOYER_URL="${EMPLOYER_URL:-http://localhost:3002}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"
export SESSION_SECRET="${SESSION_SECRET:-owner-walkthrough-session-secret-012345678901234567890123}"
export STORAGE_DIR="${STORAGE_DIR:-./data/uploads}"
export EMAIL_ENABLED=false

cd "$ROOT"
docker compose -f docker/compose.yml up -d
for attempt in $(seq 1 30); do
  if docker compose -f docker/compose.yml exec -T postgres pg_isready -U careerflow -d careerflow >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "PostgreSQL did not become ready within 90 seconds." >&2
    exit 1
  fi
  sleep 3
done

mkdir -p apps/api/data/uploads
pnpm db:push

start_service() {
  local name="$1"
  shift
  ( "$@" >"$STATE_DIR/$name.log" 2>&1 & echo "$!" >> "$PID_FILE" )
}

start_service api env NODE_ENV="$NODE_ENV" DATABASE_URL="$DATABASE_URL" APP_URL="$APP_URL" ADMIN_URL="$ADMIN_URL" EMPLOYER_URL="$EMPLOYER_URL" NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" SESSION_SECRET="$SESSION_SECRET" STORAGE_DIR="$STORAGE_DIR" EMAIL_ENABLED=false pnpm dev:api
start_service web env NODE_ENV="$NODE_ENV" NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" pnpm dev:web
start_service employer env NODE_ENV="$NODE_ENV" NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" pnpm dev:employer
start_service admin env NODE_ENV="$NODE_ENV" NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" pnpm dev:admin

cat <<'EOF'
CareerFlow owner walkthrough services started.
  Candidate: http://localhost:3000
  Admin:     http://localhost:3001
  Employer:  http://localhost:3002
  API:       http://localhost:4000

Run `pnpm walkthrough:seed` to create synthetic walkthrough data.
Run `pnpm walkthrough:down` when finished.
EOF
