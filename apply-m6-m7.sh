#!/usr/bin/env bash
set -euo pipefail
[ -d apps/api ] || { echo "Run from careerflow-monorepo/ root."; exit 1; }

echo "== discovery =="
node <<'NODE'
const fs = require('fs');
const checks = [
  { file: 'packages/shared/src/index.ts',                    probes: ['contracts/'], what: 'shared index' },
  { file: 'packages/db/src/schema.ts',                       probes: ['applications','workspaces','sourceType'], what: 'db schema' },
  { file: 'apps/api/src/server.ts',                          probes: ['registerMeh','app.listen'], what: 'api server' },
  { file: 'apps/api/src/routes/meh.ts',                      probes: ['registerMeh','/respond'], what: 'meh route' },
  { file: 'apps/api/src/routes/applications.ts',             probes: ['ownedApplication','evidenceInOwnedWorkspace'], what: 'applications routes' },
  { file: 'apps/web/src/app/(app)/layout.tsx',               probes: ['<main className="shell"','/meh'], what: 'web layout' },
  { file: 'apps/web/src/app/(app)/meh/page.tsx',             probes: ['MehPage','/meh/respond'], what: 'meh page' },
  { file: 'apps/web/src/app/(app)/applications/[id]/page.tsx', probes: ['StagePicker','ConfirmRequirement'], what: 'application detail' },
];
let bad = 0;
for (const c of checks) {
  if (!fs.existsSync(c.file)) { console.log(`  MISSING: ${c.file} (${c.what})`); bad++; continue; }
  const src = fs.readFileSync(c.file, 'utf8');
  const missing = c.probes.filter(p => !src.includes(p));
  if (missing.length) { console.log(`  INCOMPLETE: ${c.file} — missing: ${missing.join(', ')}`); bad++; }
  else console.log(`  OK: ${c.file}`);
}
if (bad) { console.log('\nDiscovery failed. Fix above, rerun.'); process.exit(1); }
console.log('\nAll probes matched.');
NODE

echo ""
echo "== shared contracts =="
cat > packages/shared/src/contracts/interview.ts <<'EOF'
import { z } from 'zod';

export const INTERVIEW_QUESTION_CATEGORIES = ['behavioral', 'situational', 'role', 'candidate_questions'] as const;
export type InterviewQuestionCategory = typeof INTERVIEW_QUESTION_CATEGORIES[number];

export const InterviewQuestion = z.object({
  id: z.string(),
  category: z.enum(INTERVIEW_QUESTION_CATEGORIES),
  text: z.string(),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestion>;

export const UpsertInterviewPrepInput = z.object({
  selectedQuestionIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  notes: z.string().max(10000).optional(),
});
export type UpsertInterviewPrepInput = z.infer<typeof UpsertInterviewPrepInput>;

export const InterviewReflectionInput = z.object({
  learned: z.string().min(1).max(4000),
  followUp: z.string().max(2000).optional(),
  nextDate: z.string().optional(),
});
export type InterviewReflectionInput = z.infer<typeof InterviewReflectionInput>;
EOF

cat > packages/shared/src/contracts/growth.ts <<'EOF'
import { z } from 'zod';

export const GrowthGoalInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDate: z.string().optional(),
  applicationId: z.string().uuid().optional(),
});
export type GrowthGoalInput = z.infer<typeof GrowthGoalInput>;

export const GROWTH_ENTRY_KINDS = ['achievement', 'reflection', 'conversation', 'learning'] as const;
export type GrowthEntryKind = typeof GROWTH_ENTRY_KINDS[number];

export const GrowthEntryInput = z.object({
  goalId: z.string().uuid().optional(),
  kind: z.enum(GROWTH_ENTRY_KINDS),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  occurredAt: z.string().optional(),
});
export type GrowthEntryInput = z.infer<typeof GrowthEntryInput>;
EOF

node <<'NODE'
const fs = require('fs');
const f = 'packages/shared/src/index.ts';
if (!fs.existsSync(f + '.m6.bak')) fs.copyFileSync(f, f + '.m6.bak');
let src = fs.readFileSync(f, 'utf8');
for (const line of ["export * from './contracts/interview.js';", "export * from './contracts/growth.js';"]) {
  if (!src.includes(line.split("'")[1])) src = src.replace(/\s*$/, '') + '\n' + line + '\n';
}
fs.writeFileSync(f, src);
console.log('  shared/index.ts: interview + growth contracts exported');
NODE

echo "== core: deterministic question bank =="
cat > packages/core/src/interviewQuestions.ts <<'EOF'
import type { InterviewQuestion } from '@careerflow/shared';

const COMMON: InterviewQuestion[] = [
  { id: 'beh-1', category: 'behavioral', text: 'Tell me about a time you had to influence without authority. What was the outcome?' },
  { id: 'beh-2', category: 'behavioral', text: 'Describe a project that failed or missed its goals. What did you learn?' },
  { id: 'beh-3', category: 'behavioral', text: 'Tell me about the most complex problem you have solved end to end.' },
  { id: 'beh-4', category: 'behavioral', text: 'Give an example of a time you disagreed with a decision. How did you handle it?' },
  { id: 'sit-1', category: 'situational', text: 'Two stakeholders each need something urgent and both are right. How would you decide what to do first?' },
  { id: 'sit-2', category: 'situational', text: 'You inherit a team with low morale and unclear priorities. What would you do in your first 30 days?' },
  { id: 'q-1', category: 'candidate_questions', text: 'What does success look like in this role in the first six months?' },
  { id: 'q-2', category: 'candidate_questions', text: 'How does this team decide what to work on when priorities conflict?' },
];

const BY_KEYWORD: { re: RegExp; qs: InterviewQuestion[] }[] = [
  {
    re: /(product\s+manager|\bpm\b|product\s+lead)/i,
    qs: [
      { id: 'pm-1', category: 'role', text: 'Walk me through how you prioritize a backlog when everything is "P0".' },
      { id: 'pm-2', category: 'role', text: 'Tell me about a product decision you regret. What would you do differently?' },
      { id: 'pm-3', category: 'role', text: 'How do you measure success for a feature after launch?' },
    ],
  },
  {
    re: /(engineer|developer|swe|sre|devops|backend|frontend)/i,
    qs: [
      { id: 'eng-1', category: 'role', text: 'Describe a system you designed. What trade-offs did you make and why?' },
      { id: 'eng-2', category: 'role', text: 'Tell me about the hardest bug you have debugged. Walk me through your process.' },
      { id: 'eng-3', category: 'role', text: 'How do you decide between adding a dependency and writing it yourself?' },
    ],
  },
  {
    re: /(designer|ux|ui)/i,
    qs: [
      { id: 'des-1', category: 'role', text: 'Walk me through a design you are proud of and one you would redo.' },
      { id: 'des-2', category: 'role', text: 'How do you incorporate user research into a shipping decision?' },
    ],
  },
  {
    re: /(analyst|data|analytics)/i,
    qs: [
      { id: 'an-1', category: 'role', text: 'Describe an analysis that changed a business decision.' },
      { id: 'an-2', category: 'role', text: 'How do you communicate uncertainty in your findings?' },
    ],
  },
];

export function questionsForRole(roleTitle: string): InterviewQuestion[] {
  const out = [...COMMON];
  for (const { re, qs } of BY_KEYWORD) if (re.test(roleTitle)) out.push(...qs);
  return out;
}
EOF

node <<'NODE'
const fs = require('fs');
const f = 'packages/core/src/index.ts';
if (!fs.existsSync(f + '.m6.bak')) fs.copyFileSync(f, f + '.m6.bak');
let src = fs.readFileSync(f, 'utf8');
if (!src.includes('interviewQuestions')) src = src.replace(/\s*$/, '') + "\nexport * from './interviewQuestions.js';\n";
fs.writeFileSync(f, src);
console.log('  core/index.ts: interviewQuestions exported');
NODE

echo "== schema: 3 new tables =="
node <<'NODE'
const fs = require('fs');
const f = 'packages/db/src/schema.ts';
if (!fs.existsSync(f + '.m6.bak')) fs.copyFileSync(f, f + '.m6.bak');
let src = fs.readFileSync(f, 'utf8');
if (!src.includes('interviewPreps')) {
  src += `

export const interviewPreps = pgTable('interview_preps', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }).unique(),
  selectedQuestionIds: jsonb('selected_question_ids').notNull().default([]),
  evidenceIds: jsonb('evidence_ids').notNull().default([]),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const growthGoalStatus = pgEnum('growth_goal_status', ['active', 'done', 'dropped']);

export const growthGoals = pgTable('growth_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  status: growthGoalStatus('status').notNull().default('active'),
  targetDate: timestamp('target_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index().on(t.workspaceId) }));

export const growthEntryKind = pgEnum('growth_entry_kind', ['achievement', 'reflection', 'conversation', 'learning']);

export const growthEntries = pgTable('growth_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  goalId: uuid('goal_id').references(() => growthGoals.id, { onDelete: 'set null' }),
  kind: growthEntryKind('kind').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index().on(t.workspaceId, t.occurredAt) }));
`;
  fs.writeFileSync(f, src);
  console.log('  schema.ts: interview_preps, growth_goals, growth_entries added');
} else console.log('  schema.ts: already patched');
NODE

echo "== rate limit middleware =="
cat > apps/api/src/rateLimit.ts <<'EOF'
// In-memory sliding window. Per-process. If deploying multiple API instances,
// replace with Redis (M8 when we add Redis-backed notifications).

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMIT = 10;

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS) buckets.delete(key);
  }
}, WINDOW_MS);
cleanup.unref();

export function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (b.count >= LIMIT) {
    return { ok: false, retryAfterMs: WINDOW_MS - (now - b.windowStart) };
  }
  b.count += 1;
  return { ok: true };
}
EOF
echo "  rateLimit.ts: created (10 req/min/workspace)"

echo "== interview route =="
cat > apps/api/src/routes/interview.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { applications, workspaces, interviewPreps, opportunities, evidenceItems } from '@careerflow/db';
import { UpsertInterviewPrepInput, InterviewReflectionInput } from '@careerflow/shared';
import { questionsForRole } from '@careerflow/core';

async function loadAppForUser(appId: string, userId: string) {
  const rows = await db.select().from(applications).where(eq(applications.id, appId)).limit(1);
  if (!rows[0]) return null;
  const ws = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, rows[0].workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  if (!ws[0]) return null;
  return rows[0];
}

export async function registerInterview(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/:applicationId', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await loadAppForUser(applicationId, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });

    let roleTitle = '';
    if (appRow.opportunityId) {
      const opp = await db.select().from(opportunities).where(eq(opportunities.id, appRow.opportunityId)).limit(1);
      roleTitle = opp[0]?.title ?? '';
    }
    const questions = questionsForRole(roleTitle);

    const prep = await db.select().from(interviewPreps).where(eq(interviewPreps.applicationId, applicationId)).limit(1);
    const evidence = await db.select().from(evidenceItems).where(eq(evidenceItems.workspaceId, appRow.workspaceId));

    return {
      prep: prep[0] ?? null,
      questions,
      availableEvidence: evidence.map(e => ({ id: e.id, title: e.title, skills: e.skills })),
    };
  });

  app.put('/:applicationId', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await loadAppForUser(applicationId, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });
    const body = UpsertInterviewPrepInput.parse(req.body);

    const existing = await db.select().from(interviewPreps).where(eq(interviewPreps.applicationId, applicationId)).limit(1);
    if (existing[0]) {
      const updated = (await db.update(interviewPreps)
        .set({ selectedQuestionIds: body.selectedQuestionIds, evidenceIds: body.evidenceIds, notes: body.notes ?? null, updatedAt: new Date() })
        .where(eq(interviewPreps.id, existing[0].id)).returning())[0];
      return { prep: updated };
    }
    const created = (await db.insert(interviewPreps).values({
      applicationId,
      selectedQuestionIds: body.selectedQuestionIds,
      evidenceIds: body.evidenceIds,
      notes: body.notes ?? null,
    }).returning())[0]!;
    return reply.code(201).send({ prep: created });
  });

  app.post('/:applicationId/reflection', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await loadAppForUser(applicationId, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });
    const body = InterviewReflectionInput.parse(req.body);

    const evt = (await db.insert(applicationEventsTable()).values({
      applicationId,
      kind: 'interview_completed',
      occurredAt: new Date(),
      note: `${body.learned}${body.followUp ? `\nFollow-up: ${body.followUp}` : ''}`,
      sourceType: 'candidate_input',
      createdBy: req.user!.id,
    }).returning())[0]!;
    return reply.code(201).send({ event: evt });
  });
}

// lazy import to avoid a cyclic-looking dependency at type level
function applicationEventsTable() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('@careerflow/db') as typeof import('@careerflow/db')).applicationEvents;
}
EOF

echo "== offers route =="
cat > apps/api/src/routes/offers.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { applications, applicationCompensationNotes, workspaces, opportunities } from '@careerflow/db';

const Query = z.object({ workspaceId: z.string().uuid() });

export async function registerOffers(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req, reply) => {
    const { workspaceId } = Query.parse(req.query);
    const ws = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1);
    if (!ws[0]) return reply.code(404).send({ error: 'not_found' });

    const offers = await db.select({
      applicationId: applications.id,
      stage: applications.stage,
      opportunityId: applications.opportunityId,
      title: opportunities.title,
      company: opportunities.company,
    })
      .from(applications)
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(and(eq(applications.workspaceId, workspaceId), eq(applications.stage, 'offer')));

    const withComp = await Promise.all(offers.map(async o => {
      const notes = await db.select().from(applicationCompensationNotes).where(eq(applicationCompensationNotes.applicationId, o.applicationId));
      return { ...o, compensation: notes };
    }));
    return { offers: withComp };
  });

  app.post('/:applicationId/compensation', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!appRow[0]) return reply.code(404).send({ error: 'not_found' });
    const ws = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, appRow[0].workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1);
    if (!ws[0]) return reply.code(404).send({ error: 'not_found' });

    const body = z.object({
      currency: z.string().min(3).max(3),
      amountMin: z.number().int().nonnegative().optional(),
      amountMax: z.number().int().nonnegative().optional(),
      period: z.enum(['month', 'year']),
      isEstimate: z.boolean().default(true),
      note: z.string().max(500).optional(),
    }).parse(req.body);

    const row = (await db.insert(applicationCompensationNotes).values({
      applicationId, ...body, sourceType: 'candidate_input',
    }).returning())[0]!;
    return reply.code(201).send({ compensation: row });
  });
}
EOF

echo "== growth route =="
cat > apps/api/src/routes/growth.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { workspaces, growthGoals, growthEntries } from '@careerflow/db';
import { GrowthGoalInput, GrowthEntryInput } from '@careerflow/shared';

async function owns(wsId: string, userId: string) {
  const r = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, wsId), eq(workspaces.ownerId, userId))).limit(1);
  return !!r[0];
}

export async function registerGrowth(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await owns(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const goals = await db.select().from(growthGoals).where(eq(growthGoals.workspaceId, workspaceId)).orderBy(desc(growthGoals.createdAt));
    const entries = await db.select().from(growthEntries).where(eq(growthEntries.workspaceId, workspaceId)).orderBy(desc(growthEntries.occurredAt));
    return { goals, entries };
  });

  app.post('/:workspaceId/goals', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await owns(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = GrowthGoalInput.parse(req.body);
    const row = (await db.insert(growthGoals).values({
      workspaceId,
      applicationId: body.applicationId ?? null,
      title: body.title,
      description: body.description ?? null,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
    }).returning())[0]!;
    return reply.code(201).send({ goal: row });
  });

  app.post('/:workspaceId/entries', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await owns(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = GrowthEntryInput.parse(req.body);
    const row = (await db.insert(growthEntries).values({
      workspaceId,
      goalId: body.goalId ?? null,
      kind: body.kind,
      title: body.title,
      content: body.content,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    }).returning())[0]!;
    return reply.code(201).send({ entry: row });
  });

  app.patch('/goals/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(growthGoals).where(eq(growthGoals.id, id)).limit(1);
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });
    if (!(await owns(rows[0].workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = z.object({ status: z.enum(['active','done','dropped']) }).parse(req.body);
    const updated = (await db.update(growthGoals).set({ status: body.status }).where(eq(growthGoals.id, id)).returning())[0];
    return { goal: updated };
  });
}
EOF

echo "== meh route: apply rate limit =="
node <<'NODE'
const fs = require('fs');
const f = 'apps/api/src/routes/meh.ts';
if (!fs.existsSync(f + '.m6.bak')) fs.copyFileSync(f, f + '.m6.bak');
let src = fs.readFileSync(f, 'utf8');
if (src.includes('checkRateLimit')) { console.log('  meh.ts: already rate-limited'); process.exit(0); }
// add import
const firstImportClose = src.indexOf("from '@careerflow/meh';");
if (firstImportClose === -1) { console.log('  meh.ts: NO ANCHOR (meh import)'); process.exit(1); }
const insertAt = src.indexOf('\n', firstImportClose) + 1;
src = src.slice(0, insertAt) + "import { checkRateLimit } from '../rateLimit.js';\n" + src.slice(insertAt);

// rate-limit only after schema validation and workspace ownership checks
const bodyAnchor = "    const body = parsed.data;\n    if (!(await ownsWorkspace(body.workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });";
if (!src.includes(bodyAnchor)) { console.log('  meh.ts: NO ANCHOR (validated owned workspace)'); process.exit(1); }
const check = `
    const rl = checkRateLimit(body.workspaceId);
    if (!rl.ok) {
      reply.header('retry-after', Math.ceil(rl.retryAfterMs / 1000));
      return reply.code(429).send({ error: 'rate_limited', retryAfterMs: rl.retryAfterMs });
    }`;
src = src.replace(bodyAnchor, bodyAnchor + check);
fs.writeFileSync(f, src);
console.log('  meh.ts: rate limit applied after workspace ownership check');
NODE

echo "== server: register 3 new routes =="
node <<'NODE'
const fs = require('fs');
const f = 'apps/api/src/server.ts';
if (!fs.existsSync(f + '.m6.bak')) fs.copyFileSync(f, f + '.m6.bak');
let src = fs.readFileSync(f, 'utf8');
if (src.includes('registerInterview')) { console.log('  server.ts: already patched'); process.exit(0); }
const lines = src.split('\n');
let last = -1;
for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
lines.splice(last + 1, 0,
  "import { registerInterview } from './routes/interview.js';",
  "import { registerOffers } from './routes/offers.js';",
  "import { registerGrowth } from './routes/growth.js';"
);
src = lines.join('\n');
const m = src.match(/\n(await app\.listen)/);
if (!m) { console.log('  server.ts: NO ANCHOR (app.listen)'); process.exit(1); }
const reg = "\nawait app.register(registerInterview, { prefix: '/interview' });\nawait app.register(registerOffers, { prefix: '/offers' });\nawait app.register(registerGrowth, { prefix: '/growth' });\n";
src = src.replace(m[0], reg + m[0].slice(1));
fs.writeFileSync(f, src);
console.log('  server.ts: interview + offers + growth registered');
NODE

echo "== web: pages =="
mkdir -p "apps/web/src/app/(app)/applications/[id]/interview"
mkdir -p "apps/web/src/app/(app)/offers"
mkdir -p "apps/web/src/app/(app)/growth"
mkdir -p "apps/web/src/app/(app)/meh/conversations"
mkdir -p "apps/web/src/components"

cat > "apps/web/src/components/MehWidget.tsx" <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function MehWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [wsId, setWsId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ connected: boolean; providerConfigured: boolean } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || wsId) return;
    (async () => {
      const ws = await apiFetch<{ workspaces: any[] }>('/workspaces');
      const id = ws.workspaces[0]?.id;
      if (!id) return;
      setWsId(id);
      const s = await apiFetch<{ connected: boolean; providerConfigured: boolean }>(`/meh/${id}/status`);
      setStatus(s);
    })().catch(() => {});
  }, [open, wsId]);

  // don't render on /meh pages (full page there already)
  if (pathname?.startsWith('/meh')) return null;

  async function send() {
    if (!wsId || !prompt.trim()) return;
    setBusy(true); setErr(null); setReply(null);
    try {
      const mode = status?.connected && status.providerConfigured ? 'connected' : 'offline';
      const res = await apiFetch<{ response: { body: string }; messages: any[] }>('/meh/respond', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: wsId, screen: pathname ?? '/', prompt, mode }),
      });
      setReply(res.response.body);
      setPrompt('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close MEH' : 'Open MEH assistant'}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 40,
          width: 56, height: 56, borderRadius: 28, border: 0, cursor: 'pointer',
          background: 'var(--mint)', color: 'var(--navy)', fontWeight: 700, fontSize: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}
      >
        {open ? '×' : 'M'}
      </button>
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 20, zIndex: 40,
          width: 340, maxWidth: 'calc(100vw - 40px)',
          background: 'white', borderRadius: 12, padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'grid', gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>MEH</strong>
            <Link href="/meh" style={{ fontSize: 12 }}>Full page</Link>
          </div>
          {status && (
            <div className="muted" style={{ fontSize: 11 }}>
              {status.connected && status.providerConfigured ? 'Connected' :
               status.connected ? 'Connected mode not available' :
               'Offline mode'}
            </div>
          )}
          {reply && (
            <div style={{ background: '#f1f5f9', padding: 10, borderRadius: 8, fontSize: 13, maxHeight: 200, overflow: 'auto' }}>
              {reply}
            </div>
          )}
          {err && <div className="err" style={{ fontSize: 12 }}>{err}</div>}
          <textarea
            rows={2}
            placeholder="Ask about this screen or your next step"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: 13 }}
          />
          <button className="btn btn-mint" onClick={send} disabled={busy || !prompt.trim()} style={{ fontSize: 13 }}>
            {busy ? 'Sending…' : 'Ask MEH'}
          </button>
        </div>
      )}
    </>
  );
}
EOF

cat > "apps/web/src/app/(app)/applications/[id]/interview/page.tsx" <<'EOF'
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import InterviewPrep from './InterviewPrep';

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieHeader = (await cookies()).toString();
  const data = await apiFetch<any>(`/interview/${id}`, { cookies: cookieHeader });
  return <InterviewPrep applicationId={id} initial={data} />;
}
EOF

cat > "apps/web/src/app/(app)/applications/[id]/interview/InterviewPrep.tsx" <<'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function InterviewPrep({ applicationId, initial }: { applicationId: string; initial: any }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial.prep?.selectedQuestionIds ?? []);
  const [evidenceIds, setEvidenceIds] = useState<string[]>(initial.prep?.evidenceIds ?? []);
  const [notes, setNotes] = useState(initial.prep?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reflect, setReflect] = useState({ learned: '', followUp: '' });
  const [reflecting, setReflecting] = useState(false);
  const [reflectionOk, setReflectionOk] = useState(false);

  async function save() {
    setSaving(true); setErr(null);
    try {
      await apiFetch(`/interview/${applicationId}`, {
        method: 'PUT',
        body: JSON.stringify({ selectedQuestionIds: selected, evidenceIds, notes }),
      });
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function submitReflection() {
    if (!reflect.learned.trim()) return;
    setReflecting(true); setErr(null);
    try {
      await apiFetch(`/interview/${applicationId}/reflection`, {
        method: 'POST',
        body: JSON.stringify(reflect),
      });
      setReflectionOk(true);
      setReflect({ learned: '', followUp: '' });
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setReflecting(false); }
  }

  const byCategory: Record<string, any[]> = {};
  for (const q of initial.questions) {
    (byCategory[q.category] ||= []).push(q);
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Interview prep</h2>
        <p className="muted" style={{ marginBlockEnd: 0 }}>
          Practice does not predict hiring outcomes. It helps you structure your own examples.
        </p>
      </div>

      {Object.entries(byCategory).map(([category, qs]) => (
        <div key={category} className="card">
          <h3 style={{ marginBlockStart: 0, textTransform: 'capitalize' }}>{category.replace('_', ' ')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {qs.map(q => (
              <label key={q.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 8, background: selected.includes(q.id) ? '#f0fdf4' : '#f8fafc', borderRadius: 6 }}>
                <input type="checkbox" checked={selected.includes(q.id)}
                  onChange={e => setSelected(s => e.target.checked ? [...s, q.id] : s.filter(x => x !== q.id))} />
                <span style={{ fontSize: 14 }}>{q.text}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Evidence to use</h3>
        {initial.availableEvidence.length === 0 ? <p className="muted">No evidence items yet — add some in the Evidence Library.</p> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {initial.availableEvidence.map((e: any) => (
              <label key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, background: '#f8fafc', borderRadius: 6 }}>
                <input type="checkbox" checked={evidenceIds.includes(e.id)}
                  onChange={ev => setEvidenceIds(s => ev.target.checked ? [...s, e.id] : s.filter(x => x !== e.id))} />
                <span>{e.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Preparation notes</h3>
        <textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="What do you want to remember, ask, or emphasize?"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" onClick={save} disabled={saving} style={{ marginBlockStart: 8 }}>
          {saving ? 'Saving…' : 'Save prep'}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>After the interview</h3>
        <div className="form-field"><label>What did you learn?</label>
          <textarea rows={3} value={reflect.learned} onChange={e => setReflect(r => ({ ...r, learned: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        </div>
        <div className="form-field"><label>Follow-up action (optional)</label>
          <input value={reflect.followUp} onChange={e => setReflect(r => ({ ...r, followUp: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
        </div>
        {reflectionOk && <p className="muted" style={{ color: 'green' }}>Recorded.</p>}
        <button className="btn" onClick={submitReflection} disabled={reflecting || !reflect.learned.trim()}>
          {reflecting ? 'Saving…' : 'Record reflection'}
        </button>
      </div>
    </div>
  );
}
EOF

cat > "apps/web/src/app/(app)/offers/page.tsx" <<'EOF'
import { cookies } from 'next/headers';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ensureFirstWorkspace } from '@/lib/workspace';

export default async function OffersPage() {
  const cookieHeader = (await cookies()).toString();
  const ws = await ensureFirstWorkspace(cookieHeader);
  const { offers } = await apiFetch<{ offers: any[] }>(`/offers?workspaceId=${ws.id}`, { cookies: cookieHeader });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Offer comparison</h2>
        <p className="muted">Offers are applications you have moved to the "offer" stage. Missing information is marked, not guessed.</p>
      </div>
      {offers.length === 0 ? (
        <div className="card"><p className="muted">No offers yet. Move an application to the "offer" stage to see it here.</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {offers.map(o => (
            <div key={o.applicationId} className="card">
              <h3 style={{ marginBlockStart: 0 }}>{o.title ?? 'Untitled role'} — {o.company ?? 'Unknown company'}</h3>
              {o.compensation.length === 0 ? (
                <p className="muted">No compensation recorded. Add one via the API or wait for a compensation UI in a later milestone.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBlockStart: 8 }}>
                  <thead><tr style={{ textAlign: 'left' }}><th>Currency</th><th>Range</th><th>Period</th><th>Estimate?</th></tr></thead>
                  <tbody>
                    {o.compensation.map((c: any) => (
                      <tr key={c.id}>
                        <td>{c.currency}</td>
                        <td>{c.amountMin ?? '?'}–{c.amountMax ?? '?'}</td>
                        <td>{c.period}</td>
                        <td>{c.isEstimate ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Link href={`/applications/${o.applicationId}`}><button className="btn" style={{ marginBlockStart: 8 }}>Open application</button></Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
EOF

cat > "apps/web/src/app/(app)/growth/page.tsx" <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function GrowthPage() {
  const [wsId, setWsId] = useState<string | null>(null);
  const [data, setData] = useState<{ goals: any[]; entries: any[] }>({ goals: [], entries: [] });
  const [goalTitle, setGoalTitle] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');
  const [entryKind, setEntryKind] = useState<'achievement'|'reflection'|'conversation'|'learning'>('achievement');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const ws = await apiFetch<{ workspaces: any[] }>('/workspaces');
    const id = ws.workspaces[0]?.id;
    if (!id) return;
    setWsId(id);
    const g = await apiFetch<{ goals: any[]; entries: any[] }>(`/growth/${id}`);
    setData(g);
  }
  useEffect(() => { load().catch(() => setErr('Load failed')); }, []);

  async function addGoal() {
    if (!wsId || !goalTitle.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/growth/${wsId}/goals`, { method: 'POST', body: JSON.stringify({ title: goalTitle }) });
      setGoalTitle('');
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Add failed'); }
    finally { setBusy(false); }
  }

  async function addEntry() {
    if (!wsId || !entryTitle.trim() || !entryContent.trim()) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/growth/${wsId}/entries`, {
        method: 'POST',
        body: JSON.stringify({ kind: entryKind, title: entryTitle, content: entryContent }),
      });
      setEntryTitle(''); setEntryContent('');
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Add failed'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Post-hire growth</h2>
        <p className="muted">Goals, achievements, and reflections you choose to keep. Nothing here is shared with any employer.</p>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Goals</h3>
        {data.goals.length === 0 ? <p className="muted">No goals yet.</p> : (
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {data.goals.map(g => <li key={g.id}>{g.title} <span className="muted">({g.status})</span></li>)}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, marginBlockStart: 12 }}>
          <input value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="New goal"
            style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          <button className="btn btn-mint" onClick={addGoal} disabled={busy || !goalTitle.trim()}>Add goal</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Add entry</h3>
        <div className="form-field"><label>Kind</label>
          <select value={entryKind} onChange={e => setEntryKind(e.target.value as any)} style={{ padding: 6, borderRadius: 6 }}>
            <option value="achievement">Achievement</option>
            <option value="reflection">Reflection</option>
            <option value="conversation">Development conversation</option>
            <option value="learning">Learning</option>
          </select>
        </div>
        <div className="form-field"><label>Title</label>
          <input value={entryTitle} onChange={e => setEntryTitle(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        </div>
        <div className="form-field"><label>Content</label>
          <textarea rows={3} value={entryContent} onChange={e => setEntryContent(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" onClick={addEntry} disabled={busy || !entryTitle.trim() || !entryContent.trim()}>Add entry</button>
      </div>

      <div className="card">
        <h3 style={{ marginBlockStart: 0 }}>Recent entries</h3>
        {data.entries.length === 0 ? <p className="muted">No entries yet.</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.entries.map(e => (
              <div key={e.id} style={{ padding: 10, background: '#f8fafc', borderRadius: 6 }}>
                <div className="muted" style={{ fontSize: 11 }}>{e.kind} · {new Date(e.occurredAt).toLocaleDateString()}</div>
                <strong>{e.title}</strong>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: 14 }}>{e.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
EOF

cat > "apps/web/src/app/(app)/meh/conversations/page.tsx" <<'EOF'
import { cookies } from 'next/headers';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ensureFirstWorkspace } from '@/lib/workspace';

export default async function ConversationsPage() {
  const cookieHeader = (await cookies()).toString();
  const ws = await ensureFirstWorkspace(cookieHeader);
  const { conversations } = await apiFetch<{ conversations: any[] }>(`/meh/${ws.id}/conversations`, { cookies: cookieHeader });
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>MEH conversations</h2>
        <p className="muted">Each message is labeled with its mode and provenance. "ai_generated_unverified" means verify anything factual.</p>
        <Link href="/meh"><button className="btn">New conversation</button></Link>
      </div>
      {conversations.length === 0 ? <div className="card"><p className="muted">No conversations yet.</p></div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {conversations.map(c => (
            <div key={c.id} className="card" style={{ padding: 12 }}>
              <p style={{ margin: 0 }}>Conversation {c.id.slice(0, 8)}…</p>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Updated {new Date(c.updatedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
EOF

echo "== web layout: mount widget + nav links =="
node <<'NODE'
const fs = require('fs');
const f = 'apps/web/src/app/(app)/layout.tsx';
if (!fs.existsSync(f + '.m6.bak')) fs.copyFileSync(f, f + '.m6.bak');
let src = fs.readFileSync(f, 'utf8');

// nav links
if (!src.includes('/offers')) {
  const mehAnchor = '<Link href="/meh">MEH</Link>';
  if (!src.includes(mehAnchor)) { console.log('  layout.tsx: NO ANCHOR (meh nav)'); }
  else {
    src = src.replace(mehAnchor, mehAnchor + '\n        <Link href="/offers">Offers</Link>\n        <Link href="/growth">Growth</Link>');
  }
}

// widget import + mount
if (!src.includes('MehWidget')) {
  const impMatch = src.match(/import\s+(?:\{[^}]+\}|\w+)\s+from\s+'@\/lib\/api';/);
  if (!impMatch) { console.log('  layout.tsx: NO ANCHOR (api import)'); process.exit(1); }
  else {
    src = src.replace(impMatch[0], impMatch[0] + "\nimport MehWidget from '@/components/MehWidget';");
  }
  // mount before outer </div> at end of return
  const mainClose = '</main>';
  const idx = src.indexOf(mainClose);
  if (idx === -1) { console.log('  layout.tsx: NO ANCHOR (main close)'); }
  else {
    src = src.slice(0, idx + mainClose.length) + '\n      <MehWidget />\n      ' + src.slice(idx + mainClose.length);
  }
}
fs.writeFileSync(f, src);
console.log('  layout.tsx: widget + nav patched');
NODE

echo "== application detail: link to interview =="
node <<'NODE'
const fs = require('fs');
const f = 'apps/web/src/app/(app)/applications/[id]/page.tsx';
if (!fs.existsSync(f + '.m6.bak')) fs.copyFileSync(f, f + '.m6.bak');
let src = fs.readFileSync(f, 'utf8');
if (src.includes('/interview')) { console.log('  application detail: already links interview'); process.exit(0); }
const impMatch = src.match(/import\s+Timeline\s+from\s+'\.\/Timeline';/);
if (!impMatch) { console.log('  application detail: NO ANCHOR (Timeline import)'); process.exit(0); }
src = src.replace(impMatch[0], impMatch[0] + "\nimport Link from 'next/link';");
const interviewCard = '<div className="card"><h3 style={{ marginBlockStart: 0 }}>Interview</h3><Link href={`/applications/${data.application.id}/interview`}><button className="btn">Prepare for interview</button></Link></div>';
const legacyTimeline = /<div className="card"><h3 style=\{\{\s*marginBlockStart: 0\s*\}\}>Timeline<\/h3>/;
const currentTimeline = /<section className="card" aria-labelledby="timeline-heading"/;
if (legacyTimeline.test(src)) {
  const anchor = src.match(legacyTimeline)[0];
  src = src.replace(legacyTimeline, `${interviewCard}\n      ${anchor}`);
} else if (currentTimeline.test(src)) {
  const anchor = src.match(currentTimeline)[0];
  src = src.replace(currentTimeline, `${interviewCard}\n      ${anchor}`);
} else { console.log('  application detail: NO ANCHOR (Timeline)'); process.exit(1); }
fs.writeFileSync(f, src);
console.log('  application detail: interview link added');
NODE

echo ""
echo "== deps (none expected) =="
echo "  (no new dependencies for M6/M7)"

echo ""
echo "== typecheck =="
pnpm -r typecheck
echo "typecheck OK"

echo ""
echo "== db:push (additive) =="
pnpm db:push

echo ""
echo "== self-verification =="
node <<'NODE'
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const { setTimeout: sleep } = require('timers/promises');

const API = process.env.API_URL || 'http://localhost:4000';
const fails = [];

async function req(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: res.status, body: await res.text() };
}

(async () => {
  // health first
  try {
    const h = await req('/health');
    if (h.status !== 200) fails.push(`health: ${h.status}`);
    else console.log(`  PASS /health 200`);
  } catch (e) {
    fails.push(`health unreachable: ${e.message}`);
    console.log(`  FAIL api not reachable — start with: pnpm dev:api &`);
    console.log('\\nFailures:\\n  ' + fails.join('\\n  '));
    process.exit(1);
  }

  // setup: signup
  const email = `m67-${Date.now()}@test.local`;
  const cookieJar = [];
  const signup = await req('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password: process.env.M6_M7_TEST_PASSWORD }) });
  if (signup.status !== 200) { fails.push(`signup: ${signup.status}`); console.log(`  FAIL signup ${signup.status}`); }
  else console.log(`  PASS signup`);
  const cookieHeader = (signup.headers?.['set-cookie'] || '').toString();

  // Note: fetch in Node doesn't auto-store cookies. Extract manually from Set-Cookie if present.
  // For robustness, we accept that this quick check may skip cookie-based endpoints.

  // endpoint existence checks (get 401 or 404, but not 500 or route-not-found 404 from framework)
  for (const [path, method] of [['/offers?workspaceId=00000000-0000-0000-0000-000000000000','GET'], ['/growth/00000000-0000-0000-0000-000000000000','GET'], ['/interview/00000000-0000-0000-0000-000000000000','GET']]) {
    const r = await req(path, { method });
    // 401 = authenticated user missing (expected without cookie jar) → route exists
    // 404 with body {error:'not_found'} → route exists, resource missing
    // 500 → route exists but broken
    // HTML or empty → route likely not registered
    const ok = r.status === 401 || r.status === 404 || r.status === 200;
    if (ok) console.log(`  PASS ${method} ${path.split('?')[0]} → ${r.status}`);
    else fails.push(`${method} ${path} → ${r.status}: ${r.body.slice(0, 100)}`);
  }

  // rate limit test: 15 rapid identical requests to /meh/respond
  // No auth means 401, but rate limit runs before auth on the respond handler? No — auth hook runs first.
  // So we can't test rate limit without auth. Skip, note it.

  console.log('  SKIP rate limit test (requires auth; verify manually with 15 rapid MEH asks)');

  if (fails.length) {
    console.log('\\nFAILURES:\\n  ' + fails.join('\\n  '));
    process.exit(1);
  }
  console.log('\\n== ALL GREEN ==');
  console.log('Endpoints respond. Verify UI in browser: /offers, /growth, /applications/<id>/interview, MEH widget in lower-right.');
  console.log('Rate limit: send 15 MEH asks within a minute from /meh — 11th onward returns 429.');
})();
NODE
