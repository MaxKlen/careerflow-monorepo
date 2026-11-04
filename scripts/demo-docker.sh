#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
compose_file="$root/docker/compose.demo.yml"

if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
  docker_cmd=(docker)
elif command -v sudo >/dev/null 2>&1 && sudo -n docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
  preserved_env=()
  for name in \
    CAREERFLOW_DEMO_PUBLIC_URL \
    CAREERFLOW_DEMO_APP_URL \
    CAREERFLOW_DEMO_EMPLOYER_URL \
    CAREERFLOW_DEMO_ADMIN_URL \
    CAREERFLOW_DEMO_NEXT_PUBLIC_API_URL \
    CAREERFLOW_DEMO_CANDIDATE_BASE_PATH \
    CAREERFLOW_DEMO_EMPLOYER_BASE_PATH \
    CAREERFLOW_DEMO_ADMIN_BASE_PATH; do
    if [[ -v $name ]]; then
      preserved_env+=("$name=${!name}")
    fi
  done
  docker_cmd=(sudo -n env "${preserved_env[@]}" docker)
else
  echo "Docker daemon is unavailable or requires interactive permission; start Docker and grant non-interactive access." >&2
  exit 1
fi

exec "${docker_cmd[@]}" compose -f "$compose_file" "$@"
