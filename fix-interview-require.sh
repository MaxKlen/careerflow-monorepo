#!/usr/bin/env bash
set -euo pipefail
[ -f apps/api/src/routes/interview.ts ] || { echo "Apply apply-m6-m7.sh first."; exit 1; }

node <<'NODE'
const fs = require('fs');
const f = 'apps/api/src/routes/interview.ts';
let s = fs.readFileSync(f, 'utf8');
const before = s;

// 1. import applicationEvents directly
s = s.replace(
  "import { applications, workspaces, interviewPreps, opportunities, evidenceItems } from '@careerflow/db';",
  "import { applications, workspaces, interviewPreps, opportunities, evidenceItems, applicationEvents } from '@careerflow/db';"
);

// 2. remove the lazy-require helper block
s = s.replace(/\n\/\/ lazy import[^\n]*\n(?:[^\n]*\n)*?function applicationEventsTable\(\) \{\n[\s\S]*?\n\}\n/, '\n');

// 3. change call site
s = s.replace(/applicationEventsTable\(\)/g, 'applicationEvents');

if (s === before) { console.log('  no change — check file manually'); process.exit(1); }
fs.writeFileSync(f, s);
console.log('interview.ts: applicationEvents now imported directly; helper removed');
NODE
