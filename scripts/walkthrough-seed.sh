#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
CANDIDATE_ORIGIN="${APP_URL:-http://localhost:3000}"
STATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.m11-scripts" && pwd)"
mkdir -p "$STATE_DIR"
COOKIE_JAR="$STATE_DIR/candidate.cookies"
SEED_FILE="$STATE_DIR/seed.env"
rm -f "$COOKIE_JAR" "$SEED_FILE"

json_value() {
  local path="$1"
  python3 -c 'import json,sys
value=json.load(sys.stdin)
for part in sys.argv[1].split("."):
    value=value[part]
print(value)' "$path"
}

suffix="$(date +%Y%m%d%H%M%S)-$RANDOM"
candidate_email="walkthrough-candidate-${suffix}@test.local"
employer_email="walkthrough-employer-${suffix}@test.local"
candidate_password='Candidate-walkthrough-123!'

signup="$(curl -fsS -c "$COOKIE_JAR" -H 'content-type: application/json' -X POST "$API_URL/auth/signup" -d "{\"email\":\"$candidate_email\",\"password\":\"$candidate_password\",\"displayName\":\"Walkthrough Candidate\"}")"
workspace="$(curl -fsS -b "$COOKIE_JAR" -H 'content-type: application/json' -X POST "$API_URL/workspaces" -d '{"name":"Walkthrough Workspace","kind":"personal"}')"
workspace_id="$(printf '%s' "$workspace" | json_value workspace.id)"
opportunity="$(curl -fsS -b "$COOKIE_JAR" -H 'content-type: application/json' -X POST "$API_URL/opportunities" -d '{"title":"Walkthrough Product Role","company":"Walkthrough Test Co","description":"Synthetic owner walkthrough opportunity","requirementLines":["TypeScript","Evidence review"]}')"
opportunity_id="$(printf '%s' "$opportunity" | json_value opportunity.id)"
application="$(curl -fsS -b "$COOKIE_JAR" -H 'content-type: application/json' -X POST "$API_URL/applications/by-workspace/$workspace_id" -d "{\"opportunityId\":\"$opportunity_id\"}")"
application_id="$(printf '%s' "$application" | json_value application.id)"
invitation="$(curl -fsS -b "$COOKIE_JAR" -H "origin: $CANDIDATE_ORIGIN" -H 'content-type: application/json' -X POST "$API_URL/applications/$application_id/invitations" -d "{\"employerEmail\":\"$employer_email\"}")"
invitation_url="$(printf '%s' "$invitation" | json_value invitationUrl)"

cat > "$SEED_FILE" <<EOF
CANDIDATE_EMAIL=$candidate_email
CANDIDATE_PASSWORD=$candidate_password
EMPLOYER_EMAIL=$employer_email
APPLICATION_ID=$application_id
INVITATION_URL=$invitation_url
EOF

cat <<EOF
Synthetic walkthrough data created.
Candidate email:    $candidate_email
Candidate password: $candidate_password
Employer email:     $employer_email
Invitation URL:     $invitation_url

Credentials and identifiers are saved in $SEED_FILE for this local run only.
Open the invitation URL in the employer browser and follow docs/m11-owner-walkthrough/observation-checklist.md.
EOF
