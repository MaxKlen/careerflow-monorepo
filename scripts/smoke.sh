#!/usr/bin/env bash
set -euo pipefail
API="${API_URL:-http://localhost:4000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
EMAIL="smoke-$(date +%s%N)@test.local"
PASSWORD=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("base64url"))')
JAR="$(mktemp)"
SIGNUP_ATTEMPTED=0

cleanup() {
  local exit_status=$?
  trap - EXIT
  if [ "$SIGNUP_ATTEMPTED" -eq 1 ]; then
    local signin_status delete_status verify_status
    signin_status="$(curl -sS -o /dev/null -w '%{http_code}' -c "$JAR" -X POST "$API/auth/signin" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null)" || signin_status=000
    if [ "$signin_status" = "200" ]; then
      delete_status="$(curl -sS -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$API/settings/delete" \
        -H 'content-type: application/json' \
        -d "{\"password\":\"$PASSWORD\",\"confirmEmail\":\"$EMAIL\",\"acknowledgeIrreversible\":true}" 2>/dev/null)" || delete_status=000
      if [ "$delete_status" = "200" ]; then
        verify_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API/auth/signin" \
          -H 'content-type: application/json' \
          -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null)" || verify_status=000
        if [ "$verify_status" = "401" ]; then
          echo "  synthetic smoke account cleanup verified"
        else
          echo "FAIL: smoke account still authenticates after deletion (HTTP $verify_status)" >&2
          exit_status=1
        fi
      else
        echo "FAIL: smoke account deletion API returned HTTP $delete_status" >&2
        exit_status=1
      fi
    elif [ "$signin_status" = "401" ]; then
      echo "  synthetic smoke account absent; cleanup verified"
    else
      echo "FAIL: could not verify smoke account cleanup (signin HTTP $signin_status)" >&2
      exit_status=1
    fi
  fi
  rm -f "$JAR"
  exit "$exit_status"
}
trap cleanup EXIT

# M10 regression gate: unauthenticated visitors must see the welcome page.
ROOT_STATUS="000"
if ! ROOT_STATUS="$(curl -sSI -o /dev/null -w '%{http_code}' "$WEB_URL/")"; then ROOT_STATUS=000; fi
if [ "$ROOT_STATUS" != "200" ]; then
  echo "FAIL: / returned $ROOT_STATUS (expected 200 for an unauthenticated visitor)."
  exit 1
fi
echo "→ M10: welcome page regression check"
echo "  / → $ROOT_STATUS"

echo "→ health"
curl -fsS "$API/health" | grep -q '"ok":true'

echo "→ signup"
SIGNUP_ATTEMPTED=1
curl -fsS -c "$JAR" -X POST "$API/auth/signup" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Smoke\"}" | grep -q '"user"'

echo "→ me"
curl -fsS -b "$JAR" "$API/auth/me" | grep -q '"user"'

echo "→ create workspace"
curl -fsS -b "$JAR" -X POST "$API/workspaces" \
  -H 'content-type: application/json' \
  -d '{"name":"Personal","kind":"personal"}' | grep -q '"workspace"'

echo "→ list workspaces"
WS=$(curl -fsS -b "$JAR" "$API/workspaces" | sed -E 's/.*"id":"([^"]+)".*/\1/')

echo "→ meh offline respond"
curl -fsS -b "$JAR" -X POST "$API/meh/respond" \
  -H 'content-type: application/json' \
  -d "{\"workspaceId\":\"$WS\",\"screen\":\"/home\",\"prompt\":\"what next?\"}" | grep -q '"modeKind":"offline"'

echo "→ signout"
curl -fsS -b "$JAR" -X POST "$API/auth/signout" | grep -q '"ok":true'

echo "M0 smoke: OK"
