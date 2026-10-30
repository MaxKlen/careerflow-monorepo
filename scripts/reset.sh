#!/usr/bin/env bash
set -euo pipefail
echo "DROPS all tables in careerflow database. Not docker volumes."
read -p "Type YES to continue: " ans
[ "$ans" = "YES" ] || exit 1
docker compose -f docker/compose.yml exec -T postgres psql -U careerflow -d careerflow -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
echo "Dropped. Run: pnpm db:push"
