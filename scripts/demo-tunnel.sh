#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

case "$mode" in
  prepare)
    public_url="https://pending.trycloudflare.com"
    build_flag="--build"
    ;;
  start)
    public_url="${2:-}"
    if [[ ! "$public_url" =~ ^https://[A-Za-z0-9-]+\.trycloudflare\.com$ ]]; then
      echo "Usage: pnpm demo:tunnel-up https://<temporary-host>.trycloudflare.com" >&2
      exit 2
    fi
    build_flag=""
    ;;
  *)
    echo "Usage: bash scripts/demo-tunnel.sh prepare | start https://<temporary-host>.trycloudflare.com" >&2
    exit 2
    ;;
esac

export CAREERFLOW_DEMO_PUBLIC_URL="$public_url"
export CAREERFLOW_DEMO_APP_URL="$public_url/candidate"
export CAREERFLOW_DEMO_EMPLOYER_URL="$public_url/employer"
export CAREERFLOW_DEMO_ADMIN_URL="$public_url/admin"
export CAREERFLOW_DEMO_NEXT_PUBLIC_API_URL="$public_url/api"
export CAREERFLOW_DEMO_CANDIDATE_BASE_PATH=/candidate
export CAREERFLOW_DEMO_EMPLOYER_BASE_PATH=/employer
export CAREERFLOW_DEMO_ADMIN_BASE_PATH=/admin

if [[ "$mode" == "prepare" ]]; then
  echo "Starting only the local single-origin gateway with placeholder origins; no public tunnel is started."
  bash scripts/demo-docker.sh --profile gateway up $build_flag -d --force-recreate
else
  echo "Applying the temporary demo origin and restarting local containers; no public tunnel is started."
  bash scripts/demo-docker.sh --profile gateway up -d --force-recreate
fi
