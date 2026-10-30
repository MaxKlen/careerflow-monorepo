#!/usr/bin/env bash
set -euo pipefail
[ -d apps/api ] || { echo "Run from careerflow-monorepo/ root."; exit 1; }

backup_once() {
  local f="$1"
  if [ -f "$f" ]; then
    mkdir -p .m8-backups
    [ -f ".m8-backups/$(basename "$f")" ] || cp "$f" ".m8-backups/$(basename "$f")"
  fi
}

printf '%s\n' '== M8: discovery (warn-only) =='
node <<'NODE'
const fs = require('fs');
const checks = [
  ['packages/shared/src/index.ts', ['contracts/applicationEvent.js'], 'shared index'],
  ['packages/db/src/schema.ts', ['applications', 'applicationEvents', 'workspaces'], 'db schema'],
  ['apps/api/src/server.ts', ['app.listen'], 'api server'],
  ['apps/api/src/env.ts', ['z.object'], 'env'],
  ['apps/api/src/session.ts', ['createSession', 'hashToken'], 'session helpers'],
  ['apps/api/src/password.ts', ['hashPassword', 'verifyPassword'], 'password helpers'],
  ['apps/web/src/app/(app)/layout.tsx', ['</nav>'], 'web layout'],
  ['apps/web/src/app/(app)/applications/[id]/page.tsx', ['Timeline'], 'application detail'],
  ['package.json', ['"scripts"'], 'root package'],
];
let warnings = 0;
for (const [file, probes, what] of checks) {
  if (!fs.existsSync(file)) { console.log(`  WARN missing: ${file} (${what})`); warnings++; continue; }
  const source = fs.readFileSync(file, 'utf8');
  const missing = probes.filter(p => !source.includes(p));
  if (missing.length) { console.log(`  WARN ${file} lacks: ${missing.join(', ')}`); warnings++; }
  else console.log(`  OK ${file}`);
}
console.log(warnings ? `\n${warnings} warning(s) — optional integration patches will warn and skip.` : '\nAll discovery probes passed.');
NODE

printf '\n%s\n' '== M8: shared contracts =='
mkdir -p packages/shared/src/contracts
cat > packages/shared/src/contracts/notifications.ts <<'EOF'
import { z } from 'zod';

export const NOTIFICATION_KINDS = [
  'application_deadline', 'follow_up_due', 'interview_scheduled',
  'goal_reminder', 'weekly_digest',
] as const;
export type NotificationKind = typeof NOTIFICATION_KINDS[number];

const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const NotificationPreferencesInput = z.object({
  prefs: z.array(z.object({
    kind: z.enum(NOTIFICATION_KINDS),
    enabled: z.boolean(),
    quietHoursStart: clockTime.nullable().optional(),
    quietHoursEnd: clockTime.nullable().optional(),
  }).superRefine((pref, ctx) => {
    const hasStart = pref.quietHoursStart != null && pref.quietHoursStart !== '';
    const hasEnd = pref.quietHoursEnd != null && pref.quietHoursEnd !== '';
    if (hasStart !== hasEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Set both quiet-hour times or neither.' });
  })),
});
export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesInput>;
EOF

cat > packages/shared/src/contracts/admin.ts <<'EOF'
import { z } from 'zod';

export const AdminRole = z.enum(['owner', 'support', 'viewer']);
export type AdminRole = z.infer<typeof AdminRole>;

export const AdminSignupInput = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(12).max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
  bootstrapToken: z.string().min(1).max(200).optional(),
});
export const AdminSigninInput = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(1).max(200),
});
export const FeatureFlagInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
  enabled: z.boolean(),
  description: z.string().max(500).optional(),
});
export type FeatureFlagInput = z.infer<typeof FeatureFlagInput>;
EOF

backup_once packages/shared/src/index.ts
node <<'NODE'
const fs = require('fs');
const f = 'packages/shared/src/index.ts';
if (!fs.existsSync(f)) { console.log('  WARN shared index missing — exports skipped'); process.exit(0); }
let s = fs.readFileSync(f, 'utf8');
for (const line of ["export * from './contracts/notifications.js';", "export * from './contracts/admin.js';"]) {
  if (!s.includes(line)) s = s.replace(/\s*$/, '') + '\n' + line + '\n';
}
fs.writeFileSync(f, s);
console.log('  shared contracts exported');
NODE

printf '\n%s\n' '== M8: additive database schema =='
backup_once packages/db/src/schema.ts
node <<'NODE'
const fs = require('fs');
const f = 'packages/db/src/schema.ts';
if (!fs.existsSync(f)) { console.log('  WARN schema missing — M8 tables skipped'); process.exit(0); }
let s = fs.readFileSync(f, 'utf8');
const importRe = /import \{([^}]*)\} from 'drizzle-orm\/pg-core';/;
const match = s.match(importRe);
if (!match) { console.log('  WARN no pg-core import anchor — uniqueIndex export skipped'); }
else if (!match[1].split(',').map(x => x.trim()).includes('uniqueIndex')) {
  s = s.replace(importRe, `import {${match[1]}, uniqueIndex} from 'drizzle-orm/pg-core';`);
}
if (!s.includes("export const notifications = pgTable('notifications'")) {
s += `

// M8: notifications, isolated admin identity, audit, and feature flags.
export const notificationKindEnum = pgEnum('notification_kind', [
  'application_deadline', 'follow_up_due', 'interview_scheduled',
  'goal_reminder', 'weekly_digest',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: notificationKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  dedupeKey: text('dedupe_key').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  wsIdx: index('notifications_workspace_read_idx').on(t.workspaceId, t.readAt),
  dedupeUniq: uniqueIndex('notif_ws_dedupe').on(t.workspaceId, t.dedupeKey),
}));

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: notificationKindEnum('kind').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  quietHoursStart: text('quiet_hours_start'),
  quietHoursEnd: text('quiet_hours_end'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('notif_pref_ws_kind').on(t.workspaceId, t.kind),
}));

export const adminRoleEnum = pgEnum('admin_role', ['owner', 'support', 'viewer']);
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: adminRoleEnum('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
});

export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index('admin_sessions_user_idx').on(t.adminUserId) }));

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorAdminUserId: uuid('actor_admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: jsonb('metadata').notNull().default({}),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index('audit_actor_created_idx').on(t.actorAdminUserId, t.createdAt),
  actionIdx: index('audit_action_created_idx').on(t.action, t.createdAt),
}));

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  updatedByAdminUserId: uuid('updated_by_admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
`;
}
fs.writeFileSync(f, s);
console.log('  M8 tables added idempotently; existing tables are untouched');
NODE

printf '\n%s\n' '== M8: production bootstrap-token configuration =='
backup_once apps/api/src/env.ts
node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/env.ts';
let s = fs.readFileSync(file, 'utf8');
const anchor = '  MEH_PROVIDER_URL: optionalEnvUrl,';
if (!s.includes('ADMIN_BOOTSTRAP_TOKEN')) {
  if (!s.includes(anchor)) { console.log('  WARN env.ts bootstrap-token anchor missing; production setup remains disabled'); process.exit(0); }
  s = s.replace(anchor, `  ADMIN_BOOTSTRAP_TOKEN: optionalEnvString,\n${anchor}`);
  fs.writeFileSync(file, s);
}
console.log('  env.ts: optional ADMIN_BOOTSTRAP_TOKEN configured');
NODE
backup_once .env.example
node <<'NODE'
const fs = require('fs');
const file = '.env.example';
if (!fs.existsSync(file)) { console.log('  WARN .env.example missing; bootstrap token is not documented there'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (!s.includes('ADMIN_BOOTSTRAP_TOKEN=')) {
  s = s.replace('ADMIN_URL=http://localhost:3001\n', 'ADMIN_URL=http://localhost:3001\n# Production only: configure a unique one-time token before first-admin setup.\nADMIN_BOOTSTRAP_TOKEN=\n');
  fs.writeFileSync(file, s);
}
console.log('  .env.example documents the production-only bootstrap token');
NODE

printf '\n%s\n' '== M8: admin sessions =='
cat > apps/api/src/adminSession.ts <<'EOF'
import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db.js';
import { adminSessions, adminUsers, auditLog } from '@careerflow/db';
import { hashToken } from './session.js';

const TTL_MS = 8 * 60 * 60 * 1000;
export const ADMIN_COOKIE = {
  name: 'cf_admin_session',
  ttlMs: TTL_MS,
  options(secure: boolean) {
    return { httpOnly: true, sameSite: 'strict' as const, secure, path: '/', maxAge: Math.floor(TTL_MS / 1000) };
  },
};

export async function createAdminSession(adminUserId: string, userAgent: string | null): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await db.insert(adminSessions).values({
    adminUserId, tokenHash: hashToken(raw), userAgent,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return raw;
}

export async function destroyAdminSession(raw: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(raw)));
}

export async function findAdminSession(raw: string) {
  const rows = await db.select({
    sessionId: adminSessions.id,
    adminUserId: adminUsers.id,
    email: adminUsers.email,
    displayName: adminUsers.displayName,
    role: adminUsers.role,
  }).from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(and(eq(adminSessions.tokenHash, hashToken(raw)), gt(adminSessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function audit(
  actorAdminUserId: string | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown>,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  await db.insert(auditLog).values({ actorAdminUserId, action, targetType, targetId, metadata, ipAddress: ip, userAgent });
}

export function adminOriginAllowed(origin: string | undefined, adminUrl: string): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(adminUrl).origin; }
  catch { return false; }
}
EOF

printf '\n%s\n' '== M8: deterministic notification scheduler =='
cat > apps/api/src/notificationsScheduler.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, count, eq, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import { db } from './db.js';
import { applicationEvents, applications, goals, notifications, notificationPreferences, users, workspaces } from '@careerflow/db';

const TICK_MS = 5 * 60 * 1000;
type NotificationKind = 'application_deadline' | 'follow_up_due' | 'interview_scheduled' | 'goal_reminder' | 'weekly_digest';

function partsAt(date: Date, timeZone: string): { hour: number; minute: number; day: string; weekday: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(date);
  }
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { hour: Number(value('hour')), minute: Number(value('minute')), day: `${value('year')}-${value('month')}-${value('day')}`, weekday: value('weekday') };
}

function withinQuietHours(start: string | null, end: string | null, now: Date, timezone: string): boolean {
  if (!start || !end) return false;
  const { hour, minute } = partsAt(now, timezone);
  const nowMin = hour * 60 + minute;
  const [sh = 0, sm = 0] = start.split(':').map(Number);
  const [eh = 0, em = 0] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return startMin <= endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin;
}

async function createIfAllowed(
  workspaceId: string,
  kind: NotificationKind,
  title: string,
  body: string,
  dueAt: Date | null,
  dedupeKey: string,
  payload: Record<string, unknown>,
  now: Date,
): Promise<boolean> {
  const [pref] = await db.select().from(notificationPreferences)
    .where(and(eq(notificationPreferences.workspaceId, workspaceId), eq(notificationPreferences.kind, kind))).limit(1);
  if (pref && !pref.enabled) return false;
  const [context] = await db.select({ timezone: users.timezone }).from(workspaces)
    .innerJoin(users, eq(users.id, workspaces.ownerId)).where(eq(workspaces.id, workspaceId)).limit(1);
  const timezone = context?.timezone || 'UTC';
  if (pref && withinQuietHours(pref.quietHoursStart, pref.quietHoursEnd, now, timezone)) return false;
  const inserted = await db.insert(notifications).values({ workspaceId, kind, title, body, dueAt, dedupeKey, payload })
    .onConflictDoNothing().returning({ id: notifications.id });
  return inserted.length > 0;
}

function mondayOfLocalWeek(localDay: string): string {
  const [y = 1970, m = 1, d = 1] = localDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export async function runNotificationsSchedulerTick(): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const weekSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const dueApps = await db.select({ id: applications.id, workspaceId: applications.workspaceId, dueDate: applications.dueDate, nextAction: applications.nextAction })
    .from(applications).where(and(isNotNull(applications.dueDate), gte(applications.dueDate, now), lte(applications.dueDate, soon), ne(applications.stage, 'closed')));
  for (const a of dueApps) {
    if (!a.dueDate) continue;
    await createIfAllowed(a.workspaceId, 'application_deadline', 'Application deadline approaching', a.nextAction ?? 'An application deadline is within the next 48 hours.', a.dueDate, `app_deadline:${a.id}:${a.dueDate.toISOString()}`, { applicationId: a.id }, now);
  }

  const events = await db.select({ id: applicationEvents.id, applicationId: applicationEvents.applicationId, workspaceId: applications.workspaceId, stage: applications.stage, kind: applicationEvents.kind, occurredAt: applicationEvents.occurredAt, note: applicationEvents.note })
    .from(applicationEvents).innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
    .where(and(inArray(applicationEvents.kind, ['interview_scheduled', 'follow_up']), gte(applicationEvents.occurredAt, now), lte(applicationEvents.occurredAt, soon), ne(applications.stage, 'closed')));
  for (const e of events) {
    const kind: NotificationKind = e.kind === 'follow_up' ? 'follow_up_due' : 'interview_scheduled';
    await createIfAllowed(e.workspaceId, kind, kind === 'follow_up_due' ? 'Follow-up coming up' : 'Interview coming up', e.note ?? (kind === 'follow_up_due' ? 'A follow-up is scheduled in the next 48 hours.' : 'You have an interview in the next 48 hours.'), e.occurredAt, `${kind}:${e.id}`, { applicationId: e.applicationId, eventId: e.id }, now);
  }

  const dueGoals = await db.select({ id: goals.id, workspaceId: goals.workspaceId, title: goals.title, targetDate: goals.targetDate })
    .from(goals).where(and(eq(goals.status, 'active'), isNotNull(goals.targetDate), gte(goals.targetDate, now), lte(goals.targetDate, soon)));
  for (const g of dueGoals) {
    if (!g.targetDate) continue;
    await createIfAllowed(g.workspaceId, 'goal_reminder', 'Goal coming up', g.title, g.targetDate, `goal:${g.id}:${g.targetDate.toISOString()}`, { goalId: g.id }, now);
  }

  const allWorkspaces = await db.select({ id: workspaces.id, timezone: users.timezone }).from(workspaces)
    .innerJoin(users, eq(users.id, workspaces.ownerId));
  for (const ws of allWorkspaces) {
    const local = partsAt(now, ws.timezone || 'UTC');
    if (local.weekday !== 'Mon' || local.hour < 9) continue;
    const weekStart = mondayOfLocalWeek(local.day);
    const [activeApps] = await db.select({ value: count() }).from(applications)
      .where(and(eq(applications.workspaceId, ws.id), ne(applications.stage, 'closed')));
    const [interviews] = await db.select({ value: count() }).from(applicationEvents)
      .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
      .where(and(eq(applications.workspaceId, ws.id), eq(applicationEvents.kind, 'interview_scheduled'), gte(applicationEvents.occurredAt, now), lte(applicationEvents.occurredAt, weekSoon)));
    const body = `You have ${Number(activeApps?.value ?? 0)} active applications and ${Number(interviews?.value ?? 0)} interviews scheduled in the next 7 days.`;
    await createIfAllowed(ws.id, 'weekly_digest', 'Your weekly career check-in', body, now, `weekly_digest:${weekStart}`, {}, now);
  }
}

export function startNotificationsScheduler(app: FastifyInstance): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runNotificationsSchedulerTick();
      app.log.info('notifications scheduler tick complete');
    } catch (error) {
      app.log.error({ err: error instanceof Error ? error.message : String(error) }, 'notifications scheduler tick failed');
    } finally { running = false; }
  };
  void tick();
  const handle = setInterval(() => { void tick(); }, TICK_MS);
  app.addHook('onClose', async () => clearInterval(handle));
}
EOF

printf '\n%s\n' '== M8: notification API =='
mkdir -p apps/api/src/routes
cat > apps/api/src/routes/notifications.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { notifications, notificationPreferences, workspaces } from '@careerflow/db';
import { NOTIFICATION_KINDS, NotificationPreferencesInput } from '@careerflow/shared';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}

export async function registerNotifications(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const unreadOnly = (req.query as { unread?: string }).unread === '1';
    const where = unreadOnly ? and(eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)) : eq(notifications.workspaceId, workspaceId);
    const [rows, totals] = await Promise.all([
      db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(200),
      db.select({ value: count() }).from(notifications).where(and(eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt))),
    ]);
    return { notifications: rows, unreadCount: Number(totals[0]?.value ?? 0) };
  });

  app.post('/:workspaceId/:id/read', async (req, reply) => {
    const { workspaceId, id } = req.params as { workspaceId: string; id: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (!rows.length) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.post('/:workspaceId/read-all', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return { marked: rows.length };
  });

  app.get('/:workspaceId/preferences', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.workspaceId, workspaceId));
    const preferences: Record<string, { enabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null }> = {};
    for (const kind of NOTIFICATION_KINDS) {
      const row = rows.find(r => r.kind === kind);
      preferences[kind] = { enabled: row?.enabled ?? true, quietHoursStart: row?.quietHoursStart ?? null, quietHoursEnd: row?.quietHoursEnd ?? null };
    }
    return { preferences };
  });

  app.put('/:workspaceId/preferences', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = NotificationPreferencesInput.parse(req.body);
    await db.transaction(async tx => {
      for (const pref of body.prefs) {
        await tx.insert(notificationPreferences).values({
          workspaceId, kind: pref.kind, enabled: pref.enabled,
          quietHoursStart: pref.quietHoursStart ?? null, quietHoursEnd: pref.quietHoursEnd ?? null,
        }).onConflictDoUpdate({
          target: [notificationPreferences.workspaceId, notificationPreferences.kind],
          set: { enabled: pref.enabled, quietHoursStart: pref.quietHoursStart ?? null, quietHoursEnd: pref.quietHoursEnd ?? null, updatedAt: new Date() },
        });
      }
    });
    return { ok: true };
  });
}
EOF

printf '\n%s\n' '== M8: authenticated calendar export =='
cat > apps/api/src/routes/calendarExport.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { applications, applicationEvents, workspaces } from '@careerflow/db';

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function foldLine(line: string): string {
  let result = '';
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
    result += character;
    bytes += size;
  }
  return result;
}
function toIcsDate(value: Date): string { return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
const TITLES: Record<string, string> = {
  note: 'Application note', submission_recorded: 'Application submitted', submission_confirmed: 'Submission confirmed',
  interview_scheduled: 'Interview scheduled', interview_completed: 'Interview completed', follow_up: 'Follow-up',
  offer_received: 'Offer received', offer_declined: 'Offer declined', closed: 'Application closed',
};

export async function registerCalendarExport(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/applications/:id.ics', async (req, reply) => {
    const parsed = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_application_id' });
    const id = parsed.data;
    const rows = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
    const application = rows[0];
    if (!application) return reply.code(404).send({ error: 'not_found' });
    const owned = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, application.workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1);
    if (!owned[0]) return reply.code(404).send({ error: 'not_found' });
    const events = await db.select({ id: applicationEvents.id, kind: applicationEvents.kind, occurredAt: applicationEvents.occurredAt, note: applicationEvents.note })
      .from(applicationEvents).where(eq(applicationEvents.applicationId, id)).orderBy(asc(applicationEvents.occurredAt));
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerFlow//Application Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const event of events) {
      lines.push('BEGIN:VEVENT', `UID:${event.id}@careerflow.local`, `DTSTAMP:${toIcsDate(new Date())}`, `DTSTART:${toIcsDate(new Date(event.occurredAt))}`, `SUMMARY:${icsEscape(TITLES[event.kind] ?? 'Application event')}`, `DESCRIPTION:${icsEscape(event.note ?? '')}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    reply.header('content-type', 'text/calendar; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="application-${id}.ics"`);
    return lines.map(foldLine).join('\r\n') + '\r\n';
  });
}
EOF

printf '\n%s\n' '== M8: isolated admin authentication =='
cat > apps/api/src/routes/adminAuth.ts <<'EOF'
import { sql } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { adminUsers } from '@careerflow/db';
import { AdminSigninInput, AdminSignupInput } from '@careerflow/shared';
import { hashPassword, verifyPassword } from '../password.js';
import { ADMIN_COOKIE, adminOriginAllowed, audit, createAdminSession, destroyAdminSession, findAdminSession } from '../adminSession.js';
import { env } from '../env.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const signInAttempts = new Map<string, { count: number; resetAt: number }>();
const signUpAttempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(map: Map<string, { count: number; resetAt: number }>, key: string): boolean {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt <= now) { map.delete(key); return false; }
  return current.count >= MAX_FAILURES;
}
function recordFailure(map: Map<string, { count: number; resetAt: number }>, key: string): void {
  const now = Date.now();
  const current = map.get(key);
  if (!current || current.resetAt <= now) map.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else current.count++;
  if (map.size > 5000) for (const [entry, value] of map) if (value.resetAt <= now) map.delete(entry);
}
function userAgent(req: { headers: Record<string, unknown> }): string | null {
  const value = req.headers['user-agent'];
  return typeof value === 'string' ? value : null;
}

export async function registerAdminAuth(app: FastifyInstance): Promise<void> {
  app.post('/signup', async (req, reply) => {
    if (!adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return reply.code(403).send({ error: 'invalid_origin' });
    const ip = req.ip;
    if (rateLimited(signUpAttempts, ip)) return reply.code(429).send({ error: 'rate_limited' });
    const body = AdminSignupInput.parse(req.body);
    if (env.NODE_ENV === 'production') {
      const expected = env.ADMIN_BOOTSTRAP_TOKEN;
      if (!expected) return reply.code(403).send({ error: 'admin_bootstrap_disabled' });
      const suppliedBytes = Buffer.from(body.bootstrapToken ?? '');
      const expectedBytes = Buffer.from(expected);
      if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
        recordFailure(signUpAttempts, ip);
        return reply.code(rateLimited(signUpAttempts, ip) ? 429 : 403).send({ error: 'admin_bootstrap_failed' });
      }
    }
    let created: { id: string; email: string; role: 'owner' } | undefined;
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('careerflow-admin-bootstrap'))`);
      const existing = await tx.select({ id: adminUsers.id }).from(adminUsers).limit(1);
      if (existing.length) return;
      const inserted = await tx.insert(adminUsers).values({ email: body.email, passwordHash: await hashPassword(body.password), displayName: body.displayName ?? null, role: 'owner' })
        .returning({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role });
      created = inserted[0] as { id: string; email: string; role: 'owner' } | undefined;
    });
    if (!created) {
      recordFailure(signUpAttempts, ip);
      return reply.code(403).send({ error: 'admin_signup_closed' });
    }
    signUpAttempts.delete(ip);
    const raw = await createAdminSession(created.id, userAgent(req));
    reply.setCookie(ADMIN_COOKIE.name, raw, ADMIN_COOKIE.options(env.NODE_ENV === 'production'));
    await audit(created.id, 'admin.signup', 'admin_user', created.id, {}, req.ip, userAgent(req));
    return { admin: created };
  });

  app.post('/signin', async (req, reply) => {
    if (!adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return reply.code(403).send({ error: 'invalid_origin' });
    const ip = req.ip;
    if (rateLimited(signInAttempts, ip)) return reply.code(429).send({ error: 'rate_limited' });
    const body = AdminSigninInput.parse(req.body);
    const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, body.email)).limit(1);
    const passwordOk = rows[0] ? await verifyPassword(body.password, rows[0].passwordHash) : await verifyPassword(body.password, await hashPassword('careerflow-nonexistent-admin-dummy-password'));
    if (!rows[0] || !passwordOk) {
      recordFailure(signInAttempts, ip);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    signInAttempts.delete(ip);
    await db.update(adminUsers).set({ lastSignInAt: new Date() }).where(eq(adminUsers.id, rows[0].id));
    const raw = await createAdminSession(rows[0].id, userAgent(req));
    reply.setCookie(ADMIN_COOKIE.name, raw, ADMIN_COOKIE.options(env.NODE_ENV === 'production'));
    await audit(rows[0].id, 'admin.signin', 'admin_user', rows[0].id, {}, req.ip, userAgent(req));
    return { admin: { id: rows[0].id, email: rows[0].email, role: rows[0].role, displayName: rows[0].displayName } };
  });

  app.post('/signout', async (req, reply) => {
    if (!adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return reply.code(403).send({ error: 'invalid_origin' });
    const raw = req.cookies[ADMIN_COOKIE.name];
    if (raw) await destroyAdminSession(raw);
    reply.clearCookie(ADMIN_COOKIE.name, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req, reply) => {
    const raw = req.cookies[ADMIN_COOKIE.name];
    if (!raw) return reply.code(401).send({ error: 'unauthenticated' });
    const found = await findAdminSession(raw);
    if (!found) return reply.code(401).send({ error: 'unauthenticated' });
    return { admin: { id: found.adminUserId, email: found.email, role: found.role, displayName: found.displayName } };
  });
}
EOF

printf '\n%s\n' '== M8: admin dashboard, metadata lookup, audit, flags =='
cat > apps/api/src/routes/adminActions.ts <<'EOF'
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, gte, ilike } from 'drizzle-orm';
import { db } from '../db.js';
import { adminUsers, applications, auditLog, featureFlags, sessions, users, workspaces } from '@careerflow/db';
import { FeatureFlagInput } from '@careerflow/shared';
import { ADMIN_COOKIE, adminOriginAllowed, audit, findAdminSession } from '../adminSession.js';
import { env } from '../env.js';

async function requireAdmin(req: any, reply: any, roles: string[] = ['owner', 'support', 'viewer']) {
  const raw = req.cookies[ADMIN_COOKIE.name];
  if (!raw) { reply.code(401).send({ error: 'unauthenticated' }); return null; }
  const found = await findAdminSession(raw);
  if (!found) { reply.code(401).send({ error: 'unauthenticated' }); return null; }
  if (!roles.includes(found.role)) { reply.code(403).send({ error: 'forbidden' }); return null; }
  return found;
}
function agentUserAgent(req: any): string | null { return typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null; }

export async function registerAdminActions(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [u, w, a, s] = await Promise.all([
      db.select({ value: count() }).from(users), db.select({ value: count() }).from(workspaces),
      db.select({ value: count() }).from(applications), db.select({ value: count() }).from(sessions).where(gte(sessions.createdAt, since)),
    ]);
    await audit(admin.adminUserId, 'admin.view_dashboard', null, null, {}, req.ip, agentUserAgent(req));
    return {
      totals: { users: Number(u[0]?.value ?? 0), workspaces: Number(w[0]?.value ?? 0), applications: Number(a[0]?.value ?? 0), sessionsLast24h: Number(s[0]?.value ?? 0) },
      definitions: { users: 'Rows in users table (authenticated candidate accounts)', workspaces: 'Rows in workspaces table', applications: 'Rows in applications table', sessionsLast24h: 'Candidate sessions created in the last 24 hours' },
      generatedAt: new Date().toISOString(),
    };
  });

  app.get('/users', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const rawQuery = (req.query as { q?: unknown }).q;
    const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
    if (query.length < 3 || query.length > 254) return reply.code(400).send({ error: 'invalid_query', message: 'Provide an email search of 3–254 characters.' });
    const safeQuery = query.replace(/[\\%_]/g, '\\$&');
    const rows = await db.select({ id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone, createdAt: users.createdAt })
      .from(users).where(ilike(users.email, `%${safeQuery}%`)).limit(20);
    const queryHash = createHash('sha256').update(query.toLowerCase()).digest('hex');
    await audit(admin.adminUserId, 'admin.lookup_user', 'user_search', null, { queryHash, resultCount: rows.length }, req.ip, agentUserAgent(req));
    return { users: rows };
  });

  app.get('/audit-log', async (req, reply) => {
    const admin = await requireAdmin(req, reply, ['owner', 'support']);
    if (!admin) return;
    const rows = await db.select({ id: auditLog.id, actorAdminUserId: auditLog.actorAdminUserId, action: auditLog.action, targetType: auditLog.targetType, targetId: auditLog.targetId, metadata: auditLog.metadata, ipAddress: auditLog.ipAddress, userAgent: auditLog.userAgent, createdAt: auditLog.createdAt })
      .from(auditLog).orderBy(desc(auditLog.createdAt)).limit(100);
    return { entries: rows };
  });

  app.get('/feature-flags', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return { flags: await db.select().from(featureFlags).orderBy(featureFlags.key) };
  });

  app.put('/feature-flags', async (req, reply) => {
    if (!adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return reply.code(403).send({ error: 'invalid_origin' });
    const admin = await requireAdmin(req, reply, ['owner']);
    if (!admin) return;
    const body = FeatureFlagInput.parse(req.body);
    await db.insert(featureFlags).values({ key: body.key, enabled: body.enabled, description: body.description ?? null, updatedByAdminUserId: admin.adminUserId })
      .onConflictDoUpdate({ target: featureFlags.key, set: { enabled: body.enabled, description: body.description ?? null, updatedByAdminUserId: admin.adminUserId, updatedAt: new Date() } });
    await audit(admin.adminUserId, 'admin.update_flag', 'feature_flag', body.key, { enabled: body.enabled }, req.ip, agentUserAgent(req));
    return { ok: true };
  });
}
EOF

printf '\n%s\n' '== M8: register routes and scheduler =='
backup_once apps/api/src/server.ts
node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/server.ts';
if (!fs.existsSync(file)) { console.log('  WARN server missing — route registration skipped'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
const imports = [
  "import { registerNotifications } from './routes/notifications.js';",
  "import { registerCalendarExport } from './routes/calendarExport.js';",
  "import { registerAdminAuth } from './routes/adminAuth.js';",
  "import { registerAdminActions } from './routes/adminActions.js';",
  "import { startNotificationsScheduler } from './notificationsScheduler.js';",
];
if (!s.includes(imports[0])) {
  const lines = s.split('\n'); let last = -1;
  for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
  if (last < 0) { console.log('  WARN no import anchor — route registration skipped'); process.exit(0); }
  lines.splice(last + 1, 0, ...imports.filter(line => !s.includes(line)));
  s = lines.join('\n');
}
const registration = `await app.register(registerNotifications, { prefix: '/notifications' });
await app.register(registerCalendarExport, { prefix: '/calendar' });
await app.register(registerAdminAuth, { prefix: '/admin/auth' });
await app.register(registerAdminActions, { prefix: '/admin' });
startNotificationsScheduler(app);

`;
if (!s.includes("app.register(registerNotifications")) {
  const pos = s.indexOf('await app.listen(');
  if (pos < 0) { console.log('  WARN no app.listen anchor — route registration skipped'); process.exit(0); }
  s = s.slice(0, pos) + registration + s.slice(pos);
}
fs.writeFileSync(file, s);
console.log('  API routes and scheduler registered');
NODE

printf '\n%s\n' '== M8: in-app notification UI =='
mkdir -p apps/web/src/components "apps/web/src/app/(app)/notifications"
cat > apps/web/src/components/NotificationBell.tsx <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { workspaces } = await apiFetch<{ workspaces: { id: string }[] }>('/workspaces');
        const workspaceId = workspaces[0]?.id;
        if (!workspaceId) { if (!cancelled) setCount(0); return; }
        const result = await apiFetch<{ unreadCount: number }>(`/notifications/${workspaceId}?unread=1`);
        if (!cancelled) setCount(result.unreadCount);
      } catch { /* The bell is non-critical when the API is unavailable. */ }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  return <Link href="/notifications" style={{ position: 'relative', marginInlineEnd: 8 }} aria-label={`Notifications${count ? `, ${count} unread` : ''}`}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
    {count > 0 && <span style={{ marginInlineStart: 5, background: 'var(--coral)', color: 'white', fontSize: 10, padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>{count > 99 ? '99+' : count}</span>}
  </Link>;
}
EOF

cat > "apps/web/src/app/(app)/notifications/page.tsx" <<'EOF'
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { ensureFirstWorkspace } from '@/lib/workspace';
import NotificationList from './NotificationList';
import NotificationPrefs from './NotificationPrefs';

export default async function NotificationsPage() {
  const cookieHeader = (await cookies()).toString();
  const workspace = await ensureFirstWorkspace(cookieHeader);
  const [list, prefRes] = await Promise.all([
    apiFetch<{ notifications: any[]; unreadCount: number }>(`/notifications/${workspace.id}`, { cookies: cookieHeader }),
    apiFetch<{ preferences: Record<string, any> }>(`/notifications/${workspace.id}/preferences`, { cookies: cookieHeader }),
  ]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card"><h2 style={{ marginBlockStart: 0 }}>Notifications</h2><p className="muted">In-app reminders only. No email or third-party delivery is enabled.</p></div>
    <NotificationList workspaceId={workspace.id} initial={list} />
    <NotificationPrefs workspaceId={workspace.id} initial={prefRes.preferences} />
  </div>;
}
EOF

cat > "apps/web/src/app/(app)/notifications/NotificationList.tsx" <<'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type Item = { id: string; kind: string; title: string; body: string; createdAt: string; readAt: string | null };
export default function NotificationList({ workspaceId, initial }: { workspaceId: string; initial: { notifications: Item[]; unreadCount: number } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function markRead(id: string) { await apiFetch(`/notifications/${workspaceId}/${id}/read`, { method: 'POST', body: JSON.stringify({}) }); router.refresh(); }
  async function markAll() { setBusy(true); try { await apiFetch(`/notifications/${workspaceId}/read-all`, { method: 'POST', body: JSON.stringify({}) }); router.refresh(); } finally { setBusy(false); } }
  if (initial.notifications.length === 0) return <div className="card"><p className="muted">No notifications yet.</p></div>;
  return <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 12 }}><span className="muted">{initial.unreadCount} unread</span>{initial.unreadCount > 0 && <button className="btn" onClick={markAll} disabled={busy}>Mark all read</button>}</div>
    <div style={{ display: 'grid', gap: 8 }}>{initial.notifications.map(item => <div key={item.id} style={{ padding: 12, borderRadius: 8, background: item.readAt ? '#f8fafc' : '#f0fdf4', borderInlineStart: item.readAt ? '3px solid transparent' : '3px solid var(--mint)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}><div><strong>{item.title}</strong><p style={{ margin: '4px 0 0', fontSize: 14 }}>{item.body}</p><p className="muted" style={{ margin: '4px 0 0', fontSize: 11 }}>{item.kind} · {new Date(item.createdAt).toLocaleString()}</p></div>{!item.readAt && <button className="btn" onClick={() => void markRead(item.id)} style={{ fontSize: 11, padding: '2px 8px' }}>Mark read</button>}</div>
    </div>)}</div>
  </div>;
}
EOF

cat > "apps/web/src/app/(app)/notifications/NotificationPrefs.tsx" <<'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const LABELS: Record<string, string> = {
  application_deadline: 'Application deadlines', follow_up_due: 'Follow-up reminders', interview_scheduled: 'Interview reminders', goal_reminder: 'Goal reminders', weekly_digest: 'Weekly check-in',
};
type Pref = { enabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null };
export default function NotificationPrefs({ workspaceId, initial }: { workspaceId: string; initial: Record<string, Pref> }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setMessage('');
    try {
      await apiFetch(`/notifications/${workspaceId}/preferences`, { method: 'PUT', body: JSON.stringify({ prefs: Object.entries(prefs).map(([kind, pref]) => ({ kind, ...pref })) }) });
      setMessage('Preferences saved.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save preferences.'); }
    finally { setBusy(false); }
  }
  return <div className="card"><h3 style={{ marginBlockStart: 0 }}>Preferences</h3><p className="muted">Quiet hours use your account timezone.</p>
    <div style={{ display: 'grid', gap: 10 }}>{Object.entries(LABELS).map(([kind, label]) => {
      const pref = prefs[kind] ?? { enabled: true, quietHoursStart: null, quietHoursEnd: null };
      return <div key={kind} style={{ padding: 8, background: '#f8fafc', borderRadius: 6 }}><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={pref.enabled} onChange={e => setPrefs({ ...prefs, [kind]: { ...pref, enabled: e.target.checked } })} /><span>{label}</span></label>
        {pref.enabled && <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBlockStart: 6, fontSize: 12 }}><span className="muted">Quiet hours:</span><input aria-label={`${label} quiet-hours start`} type="time" value={pref.quietHoursStart ?? ''} onChange={e => setPrefs({ ...prefs, [kind]: { ...pref, quietHoursStart: e.target.value || null } })} /><span>to</span><input aria-label={`${label} quiet-hours end`} type="time" value={pref.quietHoursEnd ?? ''} onChange={e => setPrefs({ ...prefs, [kind]: { ...pref, quietHoursEnd: e.target.value || null } })} /></div>}
      </div>;
    })}</div>
    <button className="btn btn-mint" onClick={() => void save()} disabled={busy} style={{ marginBlockStart: 12 }}>{busy ? 'Saving…' : 'Save preferences'}</button>{message && <p role="status" className="muted">{message}</p>}
  </div>;
}
EOF

backup_once 'apps/web/src/app/(app)/layout.tsx'
node <<'NODE'
const fs = require('fs');
const file = 'apps/web/src/app/(app)/layout.tsx';
if (!fs.existsSync(file)) { console.log('  WARN web layout missing — bell mount skipped'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (!s.includes("from '@/components/NotificationBell'")) {
  const lines = s.split('\n'); let last = -1;
  for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
  if (last < 0) { console.log('  WARN no import anchor — bell mount skipped'); process.exit(0); }
  lines.splice(last + 1, 0, "import NotificationBell from '@/components/NotificationBell';"); s = lines.join('\n');
}
if (!s.includes('<NotificationBell />')) {
  if (!s.includes('</nav>')) { console.log('  WARN no closing nav — bell not mounted'); process.exit(0); }
  s = s.replace('</nav>', '<NotificationBell /></nav>');
}
fs.writeFileSync(file, s);
console.log('  notification bell mounted');
NODE

printf '\n%s\n' '== M8: application calendar link =='
backup_once 'apps/web/src/app/(app)/applications/[id]/page.tsx'
node <<'NODE'
const fs = require('fs');
const file = 'apps/web/src/app/(app)/applications/[id]/page.tsx';
if (!fs.existsSync(file)) { console.log('  WARN application detail missing — calendar link skipped'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (!s.includes("import { API_URL } from '@/lib/api';")) {
  const anchor = "import { apiFetch } from '@/lib/api';";
  if (!s.includes(anchor)) { console.log('  WARN API import anchor missing — calendar link skipped'); process.exit(0); }
  s = s.replace(anchor, `${anchor}\nimport { API_URL } from '@/lib/api';`);
}
if (!s.includes('Add application events to calendar')) {
  const anchor = '<Timeline applicationId={data.application.id} events={eventData.events} />';
  if (!s.includes(anchor)) { console.log('  WARN Timeline anchor missing — calendar API remains available directly'); process.exit(0); }
  s = s.replace(anchor, `${anchor}\n        <p style={{ marginBlockStart: 8 }}><a href={\`${'${API_URL}'}/calendar/applications/${'${data.application.id}'}.ics\`} download>Add application events to calendar (.ics)</a></p>`);
}
fs.writeFileSync(file, s);
console.log('  per-application .ics download link added');
NODE

printf '\n%s\n' '== M8: separate admin web app =='
mkdir -p apps/admin/src/lib apps/admin/src/components apps/admin/src/app/login apps/admin/src/app/users apps/admin/src/app/flags apps/admin/src/app/audit
cat > apps/admin/package.json <<'EOF'
{
  "name": "@careerflow/admin",
  "private": true,
  "scripts": { "dev": "next dev -p 3001", "build": "next build", "start": "next start -p 3001", "typecheck": "tsc --noEmit" },
  "dependencies": { "next": "^15.0.0", "react": "^19.0.0", "react-dom": "^19.0.0" },
  "devDependencies": { "@types/node": "^22.0.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0", "typescript": "^5.9.3" }
}
EOF
cat > apps/admin/next.config.mjs <<'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
EOF
cat > apps/admin/tsconfig.json <<'EOF'
{
  "compilerOptions": { "target": "ES2022", "lib": ["dom", "dom.iterable", "es2022"], "allowJs": false, "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true, "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true, "isolatedModules": true, "jsx": "preserve", "incremental": true, "plugins": [{ "name": "next" }], "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
EOF
cat > apps/admin/next-env.d.ts <<'EOF'
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited.
EOF
cat > apps/admin/src/lib/api.ts <<'EOF'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
EOF
cat > apps/admin/src/components/AdminNav.tsx <<'EOF'
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
export default function AdminNav() {
  const router = useRouter();
  async function signout() {
    try { await apiFetch('/admin/auth/signout', { method: 'POST', body: JSON.stringify({}) }); } finally { router.push('/login'); router.refresh(); }
  }
  return <nav style={{ padding: '12px 24px', borderBottom: '1px solid #1e3a5f', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
    <strong>CareerFlow Admin</strong><Link href="/">Dashboard</Link><Link href="/users">User lookup</Link><Link href="/flags">Feature flags</Link><Link href="/audit">Audit log</Link><Link href="/login" style={{ marginInlineStart: 'auto' }}>Sign in</Link><button onClick={() => void signout()} style={{ background: 'transparent', border: '1px solid #475569', color: 'white', padding: '5px 10px', borderRadius: 6 }}>Sign out</button>
  </nav>;
}
EOF
cat > apps/admin/src/app/layout.tsx <<'EOF'
import type { ReactNode } from 'react';
import AdminNav from '@/components/AdminNav';
export const metadata = { title: 'CareerFlow Admin' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: 'system-ui', padding: 0, margin: 0, background: '#0b1f3a', color: 'white', minHeight: '100vh' }}>
    <AdminNav /><main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>{children}</main>
  </body></html>;
}
EOF
cat > apps/admin/src/app/page.tsx <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Dashboard = { totals: Record<string, number>; definitions: Record<string, string>; generatedAt: string };
export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void apiFetch<Dashboard>('/admin/dashboard').then(setData).catch(e => setError(e instanceof Error ? e.message : 'Request failed')); }, []);
  if (error) return <div style={{ background: '#7f1d1d', padding: 20, borderRadius: 8 }}><h2>Not signed in</h2><p>{error}</p><a href="/login" style={{ color: 'white' }}>Sign in or complete first-admin setup</a></div>;
  if (!data) return <p>Loading live counts…</p>;
  return <div><h1>Operations dashboard</h1><p style={{ color: '#94a3b8', fontSize: 14 }}>Counts are read from live tables; definitions are shown beneath each number.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBlockStart: 20 }}>{Object.entries(data.totals).map(([key, value]) => <div key={key} style={{ background: '#1e3a5f', padding: 16, borderRadius: 8 }}><div style={{ fontSize: 32, fontWeight: 700 }}>{value}</div><div>{key}</div><div style={{ color: '#94a3b8', fontSize: 11, marginBlockStart: 6 }}>{data.definitions[key]}</div></div>)}</div>
    <p style={{ color: '#64748b', fontSize: 12, marginBlockStart: 20 }}>Generated {new Date(data.generatedAt).toLocaleString()}</p>
  </div>;
}
EOF
cat > apps/admin/src/app/login/page.tsx <<'EOF'
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
export default function AdminLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [displayName, setDisplayName] = useState(''); const [bootstrapToken, setBootstrapToken] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await apiFetch(`/admin/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password, ...(mode === 'signup' ? { displayName: displayName || undefined, bootstrapToken: bootstrapToken || undefined } : {}) }) }); router.push('/'); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <section style={{ maxWidth: 440, margin: '40px auto', background: '#1e3a5f', padding: 24, borderRadius: 8 }}>
    <h1 style={{ marginBlockStart: 0 }}>{mode === 'signin' ? 'Admin sign in' : 'First-admin setup'}</h1>
    {mode === 'signup' && <p style={{ color: '#cbd5e1', fontSize: 13 }}>Available only until the first admin account is created. Use a unique, strong password.</p>}
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      {mode === 'signup' && <label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} style={inputStyle} /></label>}
      <label>Email<input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></label>
      <label>Password<input type="password" required minLength={mode === 'signup' ? 12 : 1} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label>
      {mode === 'signup' && <label>Bootstrap token (required in production)<input type="password" value={bootstrapToken} onChange={e => setBootstrapToken(e.target.value)} maxLength={200} autoComplete="off" style={inputStyle} /></label>}
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      <button type="submit" disabled={busy} style={{ background: '#3ddc97', color: '#0b1f3a', border: 0, padding: 10, borderRadius: 6, fontWeight: 700 }}>{busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create first admin'}</button>
    </form>
    <p style={{ fontSize: 12, textAlign: 'center', color: '#cbd5e1' }}><button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} style={{ background: 'transparent', border: 0, color: '#3ddc97', cursor: 'pointer' }}>{mode === 'signin' ? 'First-time setup' : 'Back to sign in'}</button></p>
  </section>;
}
const inputStyle = { display: 'block', boxSizing: 'border-box' as const, width: '100%', padding: 10, marginBlockStart: 4, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' };
EOF
cat > apps/admin/src/app/users/page.tsx <<'EOF'
'use client';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
type Candidate = { id: string; email: string; displayName: string | null; timezone: string; createdAt: string };
export default function UsersPage() {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Candidate[] | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function search(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await apiFetch<{ users: Candidate[] }>(`/admin/users?q=${encodeURIComponent(query)}`); setResults(result.users); } catch (e) { setError(e instanceof Error ? e.message : 'Lookup failed'); } finally { setBusy(false); } }
  return <div><h1>User lookup</h1><p style={{ color: '#94a3b8' }}>Searches by email. Results contain account metadata only; each lookup is audit-logged.</p>
    <form onSubmit={search} style={{ display: 'flex', gap: 8, marginBlockStart: 16 }}><input aria-label="Email search" value={query} onChange={e => setQuery(e.target.value)} minLength={3} maxLength={254} placeholder="Email contains…" style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' }} /><button disabled={busy} style={{ background: '#3ddc97', color: '#0b1f3a', border: 0, padding: '10px 16px', borderRadius: 6 }}>{busy ? 'Searching…' : 'Search'}</button></form>
    {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}{results && !results.length && <p>No matches.</p>}
    {!!results?.length && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', marginBlockStart: 16, borderCollapse: 'collapse' }}><thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #1e3a5f' }}><th>Email</th><th>Name</th><th>Timezone</th><th>Created</th></tr></thead><tbody>{results.map(user => <tr key={user.id} style={{ borderBottom: '1px solid #1e3a5f' }}><td>{user.email}</td><td>{user.displayName ?? '—'}</td><td>{user.timezone}</td><td>{new Date(user.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
  </div>;
}
EOF
cat > apps/admin/src/app/flags/page.tsx <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Flag = { key: string; enabled: boolean; description: string | null };
export default function FlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]); const [key, setKey] = useState(''); const [description, setDescription] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { try { setFlags((await apiFetch<{ flags: Flag[] }>('/admin/feature-flags')).flags); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load flags'); } }
  useEffect(() => { void load(); }, []);
  async function save(flag: { key: string; enabled: boolean; description?: string | null }) { setBusy(true); setError(''); try { await apiFetch('/admin/feature-flags', { method: 'PUT', body: JSON.stringify(flag) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save flag'); } finally { setBusy(false); } }
  return <div><h1>Feature flags</h1><p style={{ color: '#94a3b8' }}>Only owners can change flags. Changes are audit-logged; M8 does not yet use flags to gate candidate features.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBlockStart: 16 }}><input value={key} onChange={e => setKey(e.target.value)} placeholder="flag_key" maxLength={100} style={{ flex: 1, minWidth: 180, padding: 10, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' }} /><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" maxLength={500} style={{ flex: 2, minWidth: 220, padding: 10, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' }} /><button disabled={busy || !key.trim()} onClick={() => void save({ key, enabled: false, description: description || undefined })} style={{ background: '#3ddc97', color: '#0b1f3a', border: 0, padding: '10px 16px', borderRadius: 6 }}>Add flag</button></div>
    {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}<div style={{ display: 'grid', gap: 8, marginBlockStart: 16 }}>{flags.length ? flags.map(flag => <div key={flag.key} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><strong>{flag.key}</strong>{flag.description && <span style={{ color: '#94a3b8', marginInlineStart: 8, fontSize: 13 }}>{flag.description}</span>}</div><button disabled={busy} onClick={() => void save({ ...flag, enabled: !flag.enabled })} style={{ background: flag.enabled ? '#3ddc97' : '#475569', color: flag.enabled ? '#0b1f3a' : 'white', border: 0, padding: '6px 14px', borderRadius: 6 }}>{flag.enabled ? 'ON' : 'OFF'}</button></div>) : <p style={{ color: '#94a3b8' }}>No flags yet.</p>}</div>
  </div>;
}
EOF
cat > apps/admin/src/app/audit/page.tsx <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Entry = { id: string; actorAdminUserId: string | null; action: string; targetType: string | null; metadata: Record<string, unknown>; createdAt: string };
export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[]>([]); const [error, setError] = useState('');
  useEffect(() => { void apiFetch<{ entries: Entry[] }>('/admin/audit-log').then(result => setEntries(result.entries)).catch(e => setError(e instanceof Error ? e.message : 'Could not load audit log')); }, []);
  return <div><h1>Audit log</h1><p style={{ color: '#94a3b8' }}>Recent admin sign-ins, dashboard views, lookups, and feature-flag changes.</p>{error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ textAlign: 'left' }}><th>When</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} style={{ borderTop: '1px solid #1e3a5f' }}><td>{new Date(entry.createdAt).toLocaleString()}</td><td>{entry.action}</td><td>{entry.targetType ?? '—'}</td><td><code>{JSON.stringify(entry.metadata)}</code></td></tr>)}</tbody></table></div>
  </div>;
}
EOF

backup_once package.json
node <<'NODE'
const fs = require('fs');
const file = 'package.json';
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.scripts ||= {};
if (!pkg.scripts['dev:admin']) pkg.scripts['dev:admin'] = 'pnpm --filter @careerflow/admin dev';
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log('  root dev:admin script ready');
NODE

printf '\n%s\n' '== M8: isolated verification harness =='
mkdir -p apps/api/scripts
cat > apps/api/scripts/m8-verify.ts <<'EOF'
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db.js';
import { hashPassword } from '../src/password.js';
import { createSession } from '../src/session.js';
import { createAdminSession } from '../src/adminSession.js';
import { runNotificationsSchedulerTick } from '../src/notificationsScheduler.js';
import { env } from '../src/env.js';
import { adminSessions, adminUsers, applicationEvents, applications, featureFlags, notificationPreferences, notifications, sessions, users, workspaces } from '@careerflow/db';

const API = process.env.API_URL || `http://localhost:${env.PORT}`;
const ADMIN_ORIGIN = new URL(env.ADMIN_URL).origin;
type Call = { status: number; text: string; headers: Headers };
async function call(path: string, options: { method?: string; cookie?: string; origin?: string; body?: unknown } = {}): Promise<Call> {
  const headers = new Headers();
  if (options.cookie) headers.set('cookie', options.cookie);
  if (options.origin) headers.set('origin', options.origin);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${API}${path}`, { method: options.method ?? 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, text: await response.text(), headers: response.headers };
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function json(response: Call): any { try { return JSON.parse(response.text); } catch { return {}; } }
function cookieFrom(response: Call, name: string): string {
  const value = response.headers.get('set-cookie') ?? '';
  const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
  assert(match, `missing ${name} Set-Cookie`);
  return `${name}=${match[1]}`;
}
function tomorrow(): Date { return new Date(Date.now() + 24 * 60 * 60 * 1000); }

async function main() {
  try {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`health HTTP ${health.status}`);
  } catch {
    console.log(`SKIP M8 authenticated verification: API unavailable at ${API}`);
    await pool.end();
    return;
  }
  const suffix = randomUUID();
  const candidateEmail = `m8-candidate-${suffix}@test.local`;
  const otherEmail = `m8-other-${suffix}@test.local`;
  const adminEmail = `m8-admin-${suffix}@test.local`;
  const contenderEmail = `m8-admin-contender-${suffix}@test.local`;
  const supportEmail = `m8-support-${suffix}@test.local`;
  const adminPassword = `A-${randomUUID()}-${randomUUID()}!`;
  const contenderPassword = `B-${randomUUID()}-${randomUUID()}!`;
  const candidateId = randomUUID(); const otherId = randomUUID();
  const candidateWorkspaceId = randomUUID(); const otherWorkspaceId = randomUUID();
  const applicationId = randomUUID(); const suppressedApplicationId = randomUUID();
  const firstEventId = randomUUID(); const suppressedEventId = randomUUID();
  const featureKey = `m8_test_${suffix.replaceAll('-', '_')}`;
  let adminId: string | null = null; let supportId: string | null = null;
  let adminCookie = ''; let candidateCookie = ''; let otherCookie = '';
  let supportCookie = '';
  const checks: string[] = [];
  try {
    const adminCheck = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    assert(adminCheck.length === 0, 'Existing admin account found; preserving it and skipping bootstrap test.');

    const candidateHash = await hashPassword(`synthetic-${randomUUID()}-not-used`);
    const otherHash = await hashPassword(`synthetic-${randomUUID()}-not-used`);
    await db.insert(users).values([
      { id: candidateId, email: candidateEmail, passwordHash: candidateHash, displayName: 'M8 Synthetic Candidate', timezone: 'UTC' },
      { id: otherId, email: otherEmail, passwordHash: otherHash, displayName: 'M8 Other Synthetic', timezone: 'UTC' },
    ]);
    await db.insert(workspaces).values([
      { id: candidateWorkspaceId, ownerId: candidateId, name: 'M8 Synthetic Workspace', kind: 'personal' },
      { id: otherWorkspaceId, ownerId: otherId, name: 'M8 Other Workspace', kind: 'personal' },
    ]);
    const candidateRaw = await createSession(candidateId, 'M8 verification');
    const otherRaw = await createSession(otherId, 'M8 verification');
    candidateCookie = `cf_session=${candidateRaw}`; otherCookie = `cf_session=${otherRaw}`;
    checks.push('synthetic candidate and separate sessions created');

    await db.insert(applications).values([
      { id: applicationId, workspaceId: candidateWorkspaceId, stage: 'interviewing', nextAction: 'M8 synthetic interview' },
      { id: suppressedApplicationId, workspaceId: candidateWorkspaceId, stage: 'interviewing', nextAction: 'M8 preference suppression test' },
    ]);
    const eventAt = tomorrow();
    await db.insert(applicationEvents).values([
      { id: firstEventId, applicationId, kind: 'interview_scheduled', occurredAt: eventAt, note: 'M8 Synthetic Interview Title', createdBy: candidateId },
    ]);
    await db.insert(notificationPreferences).values({ workspaceId: candidateWorkspaceId, kind: 'interview_scheduled', enabled: true });
    await db.insert(notificationPreferences).values({ workspaceId: candidateWorkspaceId, kind: 'application_deadline', enabled: false });
    await runNotificationsSchedulerTick();
    await runNotificationsSchedulerTick();
    let matching = await db.select().from(notifications).where(and(eq(notifications.workspaceId, candidateWorkspaceId), eq(notifications.dedupeKey, `interview_scheduled:${firstEventId}`)));
    assert(matching.length === 1, `expected one deduplicated interview notification, found ${matching.length}`);
    checks.push('scheduler creates one deduplicated notification for tomorrow’s interview');

    const disabledPref = await call(`/notifications/${candidateWorkspaceId}/preferences`, { method: 'PUT', cookie: candidateCookie, body: { prefs: [{ kind: 'interview_scheduled', enabled: false }] } });
    assert(disabledPref.status === 200, `preference save returned ${disabledPref.status}`);
    await db.insert(applicationEvents).values({ id: suppressedEventId, applicationId: suppressedApplicationId, kind: 'interview_scheduled', occurredAt: new Date(eventAt.getTime() + 60_000), note: 'M8 Suppressed Interview', createdBy: candidateId });
    await runNotificationsSchedulerTick();
    matching = await db.select().from(notifications).where(and(eq(notifications.workspaceId, candidateWorkspaceId), eq(notifications.dedupeKey, `interview_scheduled:${suppressedEventId}`)));
    assert(matching.length === 0, 'disabled notification preference was not respected');
    const savedPrefs = await call(`/notifications/${candidateWorkspaceId}/preferences`, { cookie: candidateCookie });
    assert(json(savedPrefs).preferences?.interview_scheduled?.enabled === false, 'saved preferences did not round-trip');
    checks.push('preference save/load works and disabled reminders are suppressed');

    const list = await call(`/notifications/${candidateWorkspaceId}?unread=1`, { cookie: candidateCookie });
    assert(list.status === 200 && json(list).notifications?.length === 1, `notification list returned ${list.status}`);
    const notificationId = json(list).notifications[0].id;
    const marked = await call(`/notifications/${candidateWorkspaceId}/${notificationId}/read`, { method: 'POST', cookie: candidateCookie, body: {} });
    assert(marked.status === 200, `mark read returned ${marked.status}`);
    const readRow = await db.select().from(notifications).where(eq(notifications.id, notificationId));
    assert(!!readRow[0]?.readAt, 'mark read did not persist');
    checks.push('authenticated notification list and mark-read work');

    const crossWorkspace = await call(`/notifications/${candidateWorkspaceId}`, { cookie: otherCookie });
    assert(crossWorkspace.status === 404, `other user read workspace notifications (${crossWorkspace.status})`);
    const crossPrefs = await call(`/notifications/${candidateWorkspaceId}/preferences`, { cookie: otherCookie });
    assert(crossPrefs.status === 404, `other user read workspace preferences (${crossPrefs.status})`);
    const crossRead = await call(`/notifications/${candidateWorkspaceId}/${notificationId}/read`, { method: 'POST', cookie: otherCookie, body: {} });
    assert(crossRead.status === 404, `other user marked notification read (${crossRead.status})`);
    checks.push('notification workspace isolation blocks another candidate');

    const calendar = await call(`/calendar/applications/${applicationId}.ics`, { cookie: candidateCookie });
    assert(calendar.status === 200, `calendar export returned ${calendar.status}: ${calendar.text.slice(0, 160)}`);
    assert((calendar.headers.get('content-type') ?? '').includes('text/calendar'), 'calendar response content type is not text/calendar');
    const dtstart = eventAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    assert(calendar.text.includes(`DTSTART:${dtstart}`), 'calendar export has the wrong event date');
    assert(calendar.text.includes('SUMMARY:Interview scheduled'), 'calendar export has the wrong event title');
    assert(calendar.text.endsWith('\r\n'), 'calendar file is missing final CRLF');
    const crossCalendar = await call(`/calendar/applications/${applicationId}.ics`, { cookie: otherCookie });
    assert(crossCalendar.status === 404, 'another candidate downloaded an application calendar');
    checks.push('authenticated per-application ICS has correct date/title and ownership guard');

    const bootstrapResults = await Promise.all([
      call('/admin/auth/signup', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: adminEmail, password: adminPassword, displayName: 'M8 Synthetic Admin' } }),
      call('/admin/auth/signup', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: contenderEmail, password: contenderPassword, displayName: 'M8 Synthetic Contender' } }),
    ]);
    const winnerIndex = bootstrapResults.findIndex(result => result.status === 200);
    assert(winnerIndex >= 0 && bootstrapResults.filter(result => result.status === 403).length === 1, `concurrent admin bootstrap results were ${bootstrapResults.map(result => result.status).join(',')}`);
    const winningEmail = winnerIndex === 0 ? adminEmail : contenderEmail;
    const winningPassword = winnerIndex === 0 ? adminPassword : contenderPassword;
    const signup = bootstrapResults[winnerIndex];
    adminId = json(signup).admin?.id;
    assert(adminId, 'bootstrap response omitted admin id');
    adminCookie = cookieFrom(signup, 'cf_admin_session');
    const signin = await call('/admin/auth/signin', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: winningEmail, password: winningPassword } });
    assert(signin.status === 200, `admin signin returned ${signin.status}`);
    adminCookie = cookieFrom(signin, 'cf_admin_session');
    const dashboard = await call('/admin/dashboard', { cookie: adminCookie });
    assert(dashboard.status === 200 && Number(json(dashboard).totals?.users) >= 2, `admin dashboard failed (${dashboard.status})`);
    const candidateIntoAdmin = await call('/admin/dashboard', { cookie: candidateCookie });
    const adminIntoCandidate = await call('/auth/me', { cookie: adminCookie });
    assert(candidateIntoAdmin.status === 401 && adminIntoCandidate.status === 401, 'candidate/admin cookies crossed identity domains');
    checks.push('concurrent first-admin bootstrap creates one owner; scrypt signin, live dashboard, and distinct identity cookies work');

    const lookup = await call(`/admin/users?q=${encodeURIComponent(candidateEmail)}`, { cookie: adminCookie });
    assert(lookup.status === 200, `metadata lookup returned ${lookup.status}`);
    const found = json(lookup).users?.[0];
    assert(found?.email === candidateEmail, 'synthetic candidate was not found');
    const allowedKeys = ['createdAt', 'displayName', 'email', 'id', 'timezone'].sort();
    assert(JSON.stringify(Object.keys(found).sort()) === JSON.stringify(allowedKeys), `lookup exposed unexpected fields: ${Object.keys(found).join(',')}`);
    const auditResponse = await call('/admin/audit-log', { cookie: adminCookie });
    const entries = json(auditResponse).entries ?? [];
    for (const action of ['admin.signup', 'admin.signin', 'admin.view_dashboard', 'admin.lookup_user']) assert(entries.some((entry: any) => entry.action === action), `missing audit action ${action}`);
    assert(!entries.some((entry: any) => JSON.stringify(entry.metadata).includes(candidateEmail)), 'audit log retained the raw candidate email search');
    checks.push('user lookup is metadata-only and every lookup is audit-logged without raw query text');

    const flag = await call('/admin/feature-flags', { method: 'PUT', cookie: adminCookie, origin: ADMIN_ORIGIN, body: { key: featureKey, enabled: true, description: 'temporary M8 verification flag' } });
    assert(flag.status === 200, `owner feature flag update returned ${flag.status}`);
    const csrf = await call('/admin/feature-flags', { method: 'PUT', cookie: adminCookie, origin: new URL(env.APP_URL).origin, body: { key: `${featureKey}_csrf`, enabled: true } });
    assert(csrf.status === 403, `cross-origin admin mutation was not blocked (${csrf.status})`);
    const supportHash = await hashPassword(`synthetic-${randomUUID()}-not-used`);
    const insertedSupport = await db.insert(adminUsers).values({ email: supportEmail, passwordHash: supportHash, displayName: 'M8 Temporary Support', role: 'support' }).returning({ id: adminUsers.id });
    supportId = insertedSupport[0]!.id;
    const supportRaw = await createAdminSession(supportId, 'M8 verification'); supportCookie = `cf_admin_session=${supportRaw}`;
    const deniedFlag = await call('/admin/feature-flags', { method: 'PUT', cookie: supportCookie, origin: ADMIN_ORIGIN, body: { key: featureKey, enabled: false } });
    assert(deniedFlag.status === 403, `non-owner changed feature flag (${deniedFlag.status})`);
    checks.push('owner-only flag mutation and admin-origin boundary are enforced');

    const wrongStatuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await call('/admin/auth/signin', { method: 'POST', origin: ADMIN_ORIGIN, body: { email: adminEmail, password: process.env.M8_WRONG_PASSWORD } });
      wrongStatuses.push(response.status);
    }
    assert(wrongStatuses.slice(0, 5).every(status => status === 401) && wrongStatuses[5] === 429, `admin signin rate limit unexpected: ${wrongStatuses.join(',')}`);
    checks.push('admin signin rate-limits repeated failures');

    const signout = await call('/admin/auth/signout', { method: 'POST', cookie: adminCookie, origin: ADMIN_ORIGIN, body: {} });
    assert(signout.status === 200, `admin signout returned ${signout.status}`);
    const afterSignout = await call('/admin/auth/me', { cookie: adminCookie });
    assert(afterSignout.status === 401, 'admin session survived signout');
    checks.push('admin signout revokes its session');

    for (const check of checks) console.log(`  PASS ${check}`);
    console.log('\nM8 authenticated verification: PASS');
  } finally {
    // Preserve audit entries as evidence; remove only M8-created principals, sessions, flags, and candidate data.
    if (featureKey) await db.delete(featureFlags).where(eq(featureFlags.key, featureKey)).catch(() => undefined);
    if (supportId) {
      await db.delete(adminSessions).where(eq(adminSessions.adminUserId, supportId)).catch(() => undefined);
      await db.delete(adminUsers).where(eq(adminUsers.id, supportId)).catch(() => undefined);
    }
    if (adminId) {
      await db.delete(adminSessions).where(eq(adminSessions.adminUserId, adminId)).catch(() => undefined);
      await db.delete(adminUsers).where(eq(adminUsers.id, adminId)).catch(() => undefined);
    }
    await db.delete(workspaces).where(and(eq(workspaces.id, candidateWorkspaceId), eq(workspaces.ownerId, candidateId))).catch(() => undefined);
    await db.delete(workspaces).where(and(eq(workspaces.id, otherWorkspaceId), eq(workspaces.ownerId, otherId))).catch(() => undefined);
    await db.delete(sessions).where(eq(sessions.userId, candidateId)).catch(() => undefined);
    await db.delete(sessions).where(eq(sessions.userId, otherId)).catch(() => undefined);
    await db.delete(users).where(eq(users.id, candidateId)).catch(() => undefined);
    await db.delete(users).where(eq(users.id, otherId)).catch(() => undefined);
    await pool.end();
  }
}

main().catch(error => { console.error(`M8 verification failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
EOF

printf '\n%s\n' '== M8: admin workspace registration =='
if pnpm install --offline --ignore-scripts; then
  echo '  workspace links refreshed from the existing lockfile/cache (no new package versions requested)'
else
  echo '  WARN offline workspace linking failed; admin app typecheck/dev may require a later install using the unchanged dependency set'
fi

printf '\n%s\n' '== M8: typecheck (report-only in script) =='
if pnpm -r typecheck; then echo '  typecheck OK'; else echo '  typecheck FAILED — preserve output and fix the listed source files.'; fi

printf '\n%s\n' '== M8: self-verification (skip only if API is unavailable) =='
node <<'NODE'
const API = process.env.API_URL || 'http://localhost:4000';
(async () => {
  try {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2500) });
    if (health.status !== 200) { console.log(`  SKIP self-verification (health HTTP ${health.status})`); return; }
  } catch {
    console.log(`  SKIP self-verification — API unavailable at ${API}`);
    return;
  }
  const checks = [
    ['/notifications/00000000-0000-0000-0000-000000000000', 'notifications auth gate'],
    ['/calendar/applications/00000000-0000-0000-0000-000000000000.ics', 'calendar auth gate'],
    ['/admin/dashboard', 'admin dashboard auth gate'],
  ];
  let failed = false;
  for (const [path, label] of checks) {
    const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 401) console.log(`  PASS ${label}`);
    else { console.log(`  FAIL ${label}: HTTP ${response.status}`); failed = true; }
  }
  if (failed) process.exitCode = 1;
  else console.log('  Route probes passed; these are not the authenticated M8 acceptance gates.');
})().catch(error => { console.error(`  FAIL self-verification: ${error.message}`); process.exitCode = 1; });
NODE

printf '\n%s\n' '== M8 script finished =='
printf '%s\n' 'Next: review/apply additive schema with pnpm db:push, then run:'
printf '%s\n' '  pnpm --filter @careerflow/api exec tsx scripts/m8-verify.ts'
printf '%s\n' 'Start the candidate web app with pnpm dev:web and the separate admin app with pnpm dev:admin.'
