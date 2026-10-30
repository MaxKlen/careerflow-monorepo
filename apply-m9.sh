#!/usr/bin/env bash
set -euo pipefail
[ -d apps/api ] || { echo "Run from careerflow-monorepo/ root."; exit 1; }

backup_once() { local f="$1"; if [ -f "$f" ]; then mkdir -p ".m9-backups/before/$(dirname "$f")"; [ -f ".m9-backups/before/$f" ] || cp -p "$f" ".m9-backups/before/$f"; fi }

write_file() {
  local f="$1" temp
  mkdir -p "$(dirname "$f")"
  backup_once "$f"
  temp=$(mktemp "${f}.m9.XXXXXX")
  cat > "$temp"
  if [ -f "$f" ]; then chmod --reference="$f" "$temp"; else chmod 0644 "$temp"; fi
  mv -f -- "$temp" "$f"
}

printf '%s\n' '== M9: dependency (nodemailer) =='
if pnpm --filter @careerflow/api list --depth 0 2>/dev/null | grep -q nodemailer; then
  echo '  nodemailer already present'
else
  pnpm --filter @careerflow/api add nodemailer@^6.9.15
  pnpm --filter @careerflow/api add -D @types/nodemailer@^6.4.16
fi

printf '\n%s\n' '== M9: discovery =='
node <<'NODE'
const fs = require('fs');
const checks = [
  ['packages/shared/src/index.ts', ['contracts/admin.js'], 'shared index'],
  ['packages/db/src/schema.ts', ['applications', 'mehConversations', 'adminUsers'], 'db schema'],
  ['apps/api/src/env.ts', ['z.object'], 'env'],
  ['apps/api/src/server.ts', ['app.listen'], 'api server'],
  ['apps/api/src/storage.ts', ['storagePath', 'putObject'], 'storage'],
  ['apps/web/src/app/(app)/layout.tsx', ['</nav>'], 'web layout'],
  ['apps/admin/src/components/AdminNav.tsx', ['Audit log'], 'admin nav'],
];
let warn = 0;
for (const [file, probes, what] of checks) {
  if (!fs.existsSync(file)) { console.log(`  WARN missing: ${file} (${what})`); warn++; continue; }
  const src = fs.readFileSync(file, 'utf8');
  const missing = probes.filter(p => !src.includes(p));
  if (missing.length) { console.log(`  WARN ${file} lacks: ${missing.join(', ')}`); warn++; }
  else console.log(`  OK ${file}`);
}
console.log(warn ? `\n${warn} warning(s) — affected patches will warn and skip.` : '\nAll discovery probes passed.');
NODE

printf '\n%s\n' '== M9: shared contracts =='
mkdir -p packages/shared/src/contracts
write_file packages/shared/src/contracts/settings.ts <<'EOF'
import { z } from 'zod';

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const DeleteAccountInput = z.object({
  password: z.string().min(1).max(200),
  confirmEmail: z.string().email().max(254).toLowerCase(),
  acknowledgeIrreversible: z.literal(true),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInput>;

export const UpdateProfileInput = z.object({
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;
EOF

write_file packages/shared/src/contracts/feedback.ts <<'EOF'
import { z } from 'zod';

export const FEEDBACK_KINDS = ['bug', 'suggestion', 'question', 'concern'] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number];

export const SubmitFeedbackInput = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(10000),
  contactOk: z.boolean().default(false),
  contextScreen: z.string().max(200).optional(),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInput>;

export const UpdateFeedbackStatusInput = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'closed']),
  adminNotes: z.string().max(5000).optional(),
});
export type UpdateFeedbackStatusInput = z.infer<typeof UpdateFeedbackStatusInput>;
EOF

write_file packages/shared/src/contracts/membership.ts <<'EOF'
import { z } from 'zod';

export const SUBSCRIPTION_PLANS = ['starter', 'plus', 'growth'] as const;
export type SubscriptionPlan = typeof SUBSCRIPTION_PLANS[number];

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled', 'trialing'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

export const StartCheckoutInput = z.object({
  workspaceId: z.string().uuid(),
  plan: z.enum(SUBSCRIPTION_PLANS),
});
export type StartCheckoutInput = z.infer<typeof StartCheckoutInput>;
EOF

backup_once packages/shared/src/index.ts
node <<'NODE'
const fs = require('fs');
const file = 'packages/shared/src/index.ts';
if (!fs.existsSync(file)) { console.log('  WARN shared index missing'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
for (const line of ["export * from './contracts/settings.js';", "export * from './contracts/feedback.js';", "export * from './contracts/membership.js';"]) {
  if (!s.includes(line.split("'")[1])) s = s.replace(/\s*$/, '') + '\n' + line + '\n';
}
fs.writeFileSync(file, s);
console.log('  settings/feedback/membership contracts exported');
NODE

printf '\n%s\n' '== M9: additive schema (data_exports, feedback_items, subscriptions) =='
backup_once packages/db/src/schema.ts
node <<'NODE'
const fs = require('fs');
const file = 'packages/db/src/schema.ts';
if (!fs.existsSync(file)) { console.log('  WARN schema missing'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes("pgTable('data_exports'")) { console.log('  M9 tables already present'); process.exit(0); }
s += `

// M9: settings, data export, feedback, subscriptions.
export const dataExports = pgTable('data_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  storageKey: text('storage_key'),
  error: text('error'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (t) => ({ userIdx: index('data_exports_user_idx').on(t.userId) }));

export const feedbackKindEnum = pgEnum('feedback_kind', ['bug', 'suggestion', 'question', 'concern']);
export const feedbackStatusEnum = pgEnum('feedback_status', ['open', 'acknowledged', 'resolved', 'closed']);

export const feedbackItems = pgTable('feedback_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  kind: feedbackKindEnum('kind').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  contactOk: boolean('contact_ok').notNull().default(false),
  contextScreen: text('context_screen'),
  status: feedbackStatusEnum('status').notNull().default('open'),
  adminNotes: text('admin_notes'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ statusIdx: index('feedback_status_created_idx').on(t.status, t.createdAt) }));

export const subscriptionPlanEnum = pgEnum('subscription_plan', ['starter', 'plus', 'growth']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled', 'trialing']);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  plan: subscriptionPlanEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  provider: text('provider'),
  externalId: text('external_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index('subscriptions_workspace_idx').on(t.workspaceId) }));
`;
fs.writeFileSync(file, s);
console.log('  data_exports, feedback_items, subscriptions added (idempotent)');
NODE

printf '\n%s\n' '== M9: env vars (SMTP, EMAIL_ENABLED, PAYMENT_PROVIDER) =='
write_file apps/api/src/env.ts <<'EOF'
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
for (const p of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '../../../.env'),
]) {
  if (existsSync(p)) { config({ path: p }); break; }
}
const optionalEnvString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().optional(),
);
const optionalEnvUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().url().optional(),
);
const emailEnabled = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean()).default(false);
const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  SESSION_SECRET: z.string().min(32).default('dev-only-session-secret-replace-in-production'),
  STORAGE_DIR: z.string().min(1).default('./data/uploads'),
  ADMIN_BOOTSTRAP_TOKEN: optionalEnvString,
  MEH_PROVIDER_URL: optionalEnvUrl,
  MEH_PROVIDER_KEY: optionalEnvString,
  MEH_PROVIDER_MODEL: optionalEnvString,
  MEH_SYSTEM_PROMPT: optionalEnvString,
  SMTP_HOST: optionalEnvString,
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: optionalEnvString,
  SMTP_PASS: optionalEnvString,
  SMTP_FROM: z.string().default('CareerFlow <noreply@careerflow.local>'),
  EMAIL_ENABLED: emailEnabled,
  PAYMENT_PROVIDER: z.enum(['none', 'stripe', 'paystack', 'paddle']).default('none'),
});
export const env = Schema.parse(process.env);
EOF
backup_once .env.example
node <<'NODE'
const fs = require('fs');
const file = '.env.example';
if (!fs.existsSync(file)) { console.log('  WARN .env.example missing'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes('SMTP_HOST=')) { console.log('  .env.example: SMTP vars already documented'); process.exit(0); }
s = s.replace(/\s*$/, '') + `

# Email (MailHog in dev = port 1025; production = Postmark/Resend/SES)
SMTP_HOST=
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=CareerFlow <noreply@careerflow.local>
EMAIL_ENABLED=false

# Payment provider: none|stripe|paystack|paddle. "none" disables checkout.
PAYMENT_PROVIDER=none
`;
fs.writeFileSync(file, s);
console.log('  .env.example: SMTP + payment vars documented');
NODE

printf '\n%s\n' '== M9: email adapter =='
write_file apps/api/src/email.ts <<'EOF'
import nodemailer from 'nodemailer';
import { env } from './env.js';

let transporter: nodemailer.Transporter | null = null;
if (env.EMAIL_ENABLED && env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.NODE_ENV === 'production' && env.SMTP_PORT !== 465,
    tls: { minVersion: 'TLSv1.2' },
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

export interface SendResult { ok: boolean; error?: string; messageId?: string; }
export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!transporter) return { ok: false, error: 'email_not_configured' };
  if (!to.includes('@') || !subject.trim() || !text.trim()) return { ok: false, error: 'invalid_email_message' };
  try {
    const info = await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text });
    return { ok: true, messageId: info.messageId };
  } catch {
    return { ok: false, error: 'email_send_failed' };
  }
}
export function emailConfigured(): boolean { return transporter !== null; }
EOF
echo '  email.ts: created (nodemailer, no-op when EMAIL_ENABLED=false)'

printf '\n%s\n' '== M9: payment abstraction (null provider default) =='
write_file apps/api/src/paymentProvider.ts <<'EOF'
export interface CheckoutSession {
  url: string;
  externalId: string;
  provider: string;
}
export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  startCheckout(workspaceId: string, plan: 'starter' | 'plus' | 'growth', successUrl: string, cancelUrl: string): Promise<CheckoutSession | null>;
}

/** M9 intentionally has no payment rail. Implement a real adapter here only after a rail is selected. */
class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'none';
  readonly configured = false;
  async startCheckout(): Promise<CheckoutSession | null> { return null; }
}

export function getPaymentProvider(): PaymentProvider {
  return new UnconfiguredPaymentProvider();
}
EOF
echo '  paymentProvider.ts: no checkout provider configured (deliberately no fake flow)'

printf '\n%s\n' '== M9: settings routes (profile, password, export, delete) =='
write_file apps/api/src/routes/settings.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, lte, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import {
  users, sessions, workspaces, careerDirections, goals, profileVersions, experiences, educations, skills, certifications,
  evidenceItems, applications, applicationRequirements, requirementEvidenceLinks, applicationEvents, applicationCompensationNotes,
  interviewPreps, documents, documentVersions, cvImportSessions, growthGoals, growthEntries, notifications, notificationPreferences,
  consents, mehConversations, mehMessages, opportunities, opportunitySources, opportunityRequirements, dataExports,
  feedbackItems, subscriptions,
} from '@careerflow/db';
import { ChangePasswordInput, DeleteAccountInput, UpdateProfileInput } from '@careerflow/shared';
import { hashPassword, verifyPassword } from '../password.js';
import { createSession, destroySession, COOKIE } from '../session.js';
import { sendEmail, emailConfigured } from '../email.js';
import { getPaymentProvider } from '../paymentProvider.js';
import { putObject, getObject, deleteObject } from '../storage.js';

const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXPORT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
function exportKey(id: string): string { return `exports/${id}.json`; }

async function collectForUser(userId: string): Promise<Record<string, unknown>> {
  const userRow = (await db.select({
    id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone,
    locale: users.locale, createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!userRow) throw new Error('user_not_found');
  const workspacesOwned = await db.select({
    id: workspaces.id, name: workspaces.name, kind: workspaces.kind, createdAt: workspaces.createdAt,
  }).from(workspaces).where(eq(workspaces.ownerId, userId));
  const wsIds = workspacesOwned.map(w => w.id);
  const emptySharedCatalog = {
    note: 'These are shared catalog entries referenced by your applications, not records exclusively owned by you. Account deletion does not remove shared catalog entries.',
    opportunities: [], opportunityRequirements: [], opportunitySources: [],
  };
  if (!wsIds.length) {
    const feedback = await db.select().from(feedbackItems).where(eq(feedbackItems.userId, userId));
    return {
      exportVersion: '1.0', generatedAt: new Date().toISOString(), user: userRow, workspaces: [],
      careerDirections: [], goals: [], profileVersions: [], experiences: [], educations: [], skills: [], certifications: [],
      evidenceItems: [], applications: [], applicationRequirements: [], requirementEvidenceLinks: [], applicationEvents: [],
      applicationCompensationNotes: [], interviewPreps: [], documents: [], documentVersions: [], cvImports: [], growthGoals: [],
      growthEntries: [], notifications: [], notificationPreferences: [], consents: [], mehConversations: [], mehMessages: [],
      subscriptions: [], feedbackItems: feedback, sharedCatalogEntries: emptySharedCatalog,
      notes: 'Raw uploaded CV files are not included; parsed CV text and reviewed sections are included under cvImports.',
    };
  }

  const [dirs, goalsR, pvs, apps, docs, cvImports, growthGoalsR, growthEntriesR, notificationsR, notifPrefsR, consentsR, convs, evidenceR, subscriptionRows, feedbackRows] = await Promise.all([
    db.select().from(careerDirections).where(inArray(careerDirections.workspaceId, wsIds)),
    db.select().from(goals).where(inArray(goals.workspaceId, wsIds)),
    db.select().from(profileVersions).where(inArray(profileVersions.workspaceId, wsIds)),
    db.select().from(applications).where(inArray(applications.workspaceId, wsIds)),
    db.select().from(documents).where(inArray(documents.workspaceId, wsIds)),
    db.select().from(cvImportSessions).where(inArray(cvImportSessions.workspaceId, wsIds)),
    db.select().from(growthGoals).where(inArray(growthGoals.workspaceId, wsIds)),
    db.select().from(growthEntries).where(inArray(growthEntries.workspaceId, wsIds)),
    db.select().from(notifications).where(inArray(notifications.workspaceId, wsIds)),
    db.select().from(notificationPreferences).where(inArray(notificationPreferences.workspaceId, wsIds)),
    db.select().from(consents).where(inArray(consents.workspaceId, wsIds)),
    db.select().from(mehConversations).where(inArray(mehConversations.workspaceId, wsIds)),
    db.select().from(evidenceItems).where(inArray(evidenceItems.workspaceId, wsIds)),
    db.select().from(subscriptions).where(inArray(subscriptions.workspaceId, wsIds)),
    db.select().from(feedbackItems).where(eq(feedbackItems.userId, userId)),
  ]);
  const pvIds = pvs.map(p => p.id);
  const appIds = apps.map(a => a.id);
  const docIds = docs.map(d => d.id);
  const convIds = convs.map(c => c.id);
  const [expR, eduR, skillR, certR, appReqR, appEvtR, appCompR, docVerR, mehMsgR] = await Promise.all([
    pvIds.length ? db.select().from(experiences).where(inArray(experiences.profileVersionId, pvIds)) : [],
    pvIds.length ? db.select().from(educations).where(inArray(educations.profileVersionId, pvIds)) : [],
    pvIds.length ? db.select().from(skills).where(inArray(skills.profileVersionId, pvIds)) : [],
    pvIds.length ? db.select().from(certifications).where(inArray(certifications.profileVersionId, pvIds)) : [],
    appIds.length ? db.select().from(applicationRequirements).where(inArray(applicationRequirements.applicationId, appIds)) : [],
    appIds.length ? db.select().from(applicationEvents).where(inArray(applicationEvents.applicationId, appIds)) : [],
    appIds.length ? db.select().from(applicationCompensationNotes).where(inArray(applicationCompensationNotes.applicationId, appIds)) : [],
    docIds.length ? db.select().from(documentVersions).where(inArray(documentVersions.documentId, docIds)) : [],
    convIds.length ? db.select().from(mehMessages).where(inArray(mehMessages.conversationId, convIds)) : [],
  ]);
  const reqIds = appReqR.map(r => r.id);
  const reqLinks = reqIds.length ? await db.select().from(requirementEvidenceLinks).where(inArray(requirementEvidenceLinks.requirementId, reqIds)) : [];
  const myPreps = appIds.length ? await db.select().from(interviewPreps).where(inArray(interviewPreps.applicationId, appIds)) : [];
  const oppIds = [...new Set(apps.map(a => a.opportunityId).filter((x): x is string => !!x))];
  const [oppRows, oppReqRows] = oppIds.length ? await Promise.all([
    db.select().from(opportunities).where(inArray(opportunities.id, oppIds)),
    db.select().from(opportunityRequirements).where(inArray(opportunityRequirements.opportunityId, oppIds)),
  ]) : [[], []];
  const sourceIds = [...new Set(oppRows.map(o => o.sourceId))];
  const sourceRows = sourceIds.length ? await db.select().from(opportunitySources).where(inArray(opportunitySources.id, sourceIds)) : [];

  return {
    exportVersion: '1.0', generatedAt: new Date().toISOString(), user: userRow, workspaces: workspacesOwned,
    careerDirections: dirs, goals: goalsR, profileVersions: pvs, experiences: expR, educations: eduR, skills: skillR, certifications: certR,
    evidenceItems: evidenceR, applications: apps, applicationRequirements: appReqR, requirementEvidenceLinks: reqLinks,
    applicationEvents: appEvtR, applicationCompensationNotes: appCompR, interviewPreps: myPreps,
    documents: docs, documentVersions: docVerR,
    cvImports: cvImports.map(c => ({ id: c.id, workspaceId: c.workspaceId, filename: c.filename, mime: c.mime, status: c.status, rawText: c.rawText, sections: c.sections, error: c.error, createdAt: c.createdAt, parsedAt: c.parsedAt })),
    growthGoals: growthGoalsR, growthEntries: growthEntriesR, notifications: notificationsR,
    notificationPreferences: notifPrefsR, consents: consentsR, mehConversations: convs, mehMessages: mehMsgR,
    subscriptions: subscriptionRows, feedbackItems: feedbackRows,
    sharedCatalogEntries: { ...emptySharedCatalog, opportunities: oppRows, opportunityRequirements: oppReqRows, opportunitySources: sourceRows },
    notes: 'Raw uploaded CV files are not included; parsed CV text and reviewed sections are included under cvImports. Opportunity/source records are shared catalog entries, not your exclusively owned records.',
  };
}

async function cleanupExpiredExports(userId?: string, logError?: (error: unknown) => void): Promise<void> {
  const where = userId
    ? and(eq(dataExports.userId, userId), eq(dataExports.status, 'ready'), lte(dataExports.expiresAt, new Date()))
    : and(eq(dataExports.status, 'ready'), lte(dataExports.expiresAt, new Date()));
  const expired = await db.select({ id: dataExports.id, storageKey: dataExports.storageKey })
    .from(dataExports).where(where);
  for (const row of expired) {
    try {
      const expectedKey = exportKey(row.id);
      if (row.storageKey && row.storageKey !== expectedKey) throw new Error('unexpected_export_storage_key');
      if (row.storageKey) await deleteObject(row.storageKey);
      await db.update(dataExports).set({ status: 'expired', storageKey: null })
        .where(and(eq(dataExports.id, row.id), eq(dataExports.status, 'ready')));
    } catch (error) {
      logError?.(error);
    }
  }
}

async function deleteUserCascade(userId: string): Promise<string[]> {
  const ownedWsIds = (await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId))).map(r => r.id);
  const uploadRows = ownedWsIds.length
    ? await db.select({ workspaceId: cvImportSessions.workspaceId, storageKey: cvImportSessions.storageKey })
      .from(cvImportSessions).where(inArray(cvImportSessions.workspaceId, ownedWsIds))
    : [];
  const exportRows = await db.select({ id: dataExports.id, storageKey: dataExports.storageKey })
    .from(dataExports).where(eq(dataExports.userId, userId));
  const objectKeys = new Set<string>();
  for (const row of uploadRows) {
    if (row.storageKey.startsWith(`cv-imports/${row.workspaceId}/`)) objectKeys.add(row.storageKey);
  }
  for (const row of exportRows) {
    if (!row.storageKey || row.storageKey === exportKey(row.id)) {
      if (row.storageKey) objectKeys.add(row.storageKey);
    }
  }

  await db.transaction(async (tx) => {
    const wsIds = (await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, userId))).map(r => r.id);
    if (wsIds.length > 0) {
      const convIds = (await tx.select({ id: mehConversations.id }).from(mehConversations).where(inArray(mehConversations.workspaceId, wsIds))).map(r => r.id);
      if (convIds.length) await tx.delete(mehMessages).where(inArray(mehMessages.conversationId, convIds));
      await tx.delete(mehConversations).where(inArray(mehConversations.workspaceId, wsIds));
      const appIds = (await tx.select({ id: applications.id }).from(applications).where(inArray(applications.workspaceId, wsIds))).map(r => r.id);
      if (appIds.length) {
        const reqIds = (await tx.select({ id: applicationRequirements.id }).from(applicationRequirements).where(inArray(applicationRequirements.applicationId, appIds))).map(r => r.id);
        if (reqIds.length) await tx.delete(requirementEvidenceLinks).where(inArray(requirementEvidenceLinks.requirementId, reqIds));
        await tx.delete(applicationRequirements).where(inArray(applicationRequirements.applicationId, appIds));
        await tx.delete(applicationEvents).where(inArray(applicationEvents.applicationId, appIds));
        await tx.delete(applicationCompensationNotes).where(inArray(applicationCompensationNotes.applicationId, appIds));
        await tx.delete(interviewPreps).where(inArray(interviewPreps.applicationId, appIds));
        await tx.delete(applications).where(inArray(applications.id, appIds));
      }
      const docIds = (await tx.select({ id: documents.id }).from(documents).where(inArray(documents.workspaceId, wsIds))).map(r => r.id);
      if (docIds.length) {
        await tx.delete(documentVersions).where(inArray(documentVersions.documentId, docIds));
        await tx.delete(documents).where(inArray(documents.id, docIds));
      }
      await tx.delete(cvImportSessions).where(inArray(cvImportSessions.workspaceId, wsIds));
      await tx.delete(evidenceItems).where(inArray(evidenceItems.workspaceId, wsIds));
      await tx.delete(notifications).where(inArray(notifications.workspaceId, wsIds));
      await tx.delete(notificationPreferences).where(inArray(notificationPreferences.workspaceId, wsIds));
      await tx.delete(consents).where(inArray(consents.workspaceId, wsIds));
      await tx.delete(growthEntries).where(inArray(growthEntries.workspaceId, wsIds));
      await tx.delete(growthGoals).where(inArray(growthGoals.workspaceId, wsIds));
      await tx.delete(subscriptions).where(inArray(subscriptions.workspaceId, wsIds));
      await tx.delete(goals).where(inArray(goals.workspaceId, wsIds));
      await tx.delete(careerDirections).where(inArray(careerDirections.workspaceId, wsIds));
      await tx.delete(profileVersions).where(inArray(profileVersions.workspaceId, wsIds));
      await tx.delete(workspaces).where(inArray(workspaces.id, wsIds));
    }
    await tx.update(feedbackItems).set({ userId: null, workspaceId: null }).where(eq(feedbackItems.userId, userId));
    await tx.delete(dataExports).where(eq(dataExports.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });

  const warnings: string[] = [];
  for (const key of objectKeys) {
    try { await deleteObject(key); }
    catch { warnings.push('storage_cleanup_failed'); }
  }
  return warnings;
}

export async function registerSettings(app: FastifyInstance): Promise<void> {
  const cleanupTimer = setInterval(() => {
    void cleanupExpiredExports(undefined, error => app.log.error({ err: error }, 'Expired export cleanup failed'));
  }, EXPORT_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req) => {
    const row = (await db.select({ id: users.id, email: users.email, displayName: users.displayName, timezone: users.timezone, locale: users.locale, createdAt: users.createdAt })
      .from(users).where(eq(users.id, req.user!.id)).limit(1))[0];
    return { user: row, emailConfigured: emailConfigured(), paymentProvider: getPaymentProvider().name };
  });

  app.patch('/', async (req) => {
    const body = UpdateProfileInput.parse(req.body);
    await db.update(users).set({
      ...(body.displayName !== undefined ? { displayName: body.displayName ?? null } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
    }).where(eq(users.id, req.user!.id));
    return { ok: true };
  });

  app.post('/password', async (req, reply) => {
    const body = ChangePasswordInput.parse(req.body);
    const row = (await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id)).limit(1))[0];
    if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) return reply.code(401).send({ error: 'invalid_password' });
    await db.update(users).set({ passwordHash: await hashPassword(body.newPassword) }).where(eq(users.id, req.user!.id));
    if (req.sessionId) await db.delete(sessions).where(and(eq(sessions.userId, req.user!.id), ne(sessions.id, req.sessionId)));
    return { ok: true };
  });

  app.post('/export', async (req, reply) => {
    const userId = req.user!.id;
    const id = randomUUID();
    const key = exportKey(id);
    await db.insert(dataExports).values({ id, userId, status: 'pending', expiresAt: new Date(Date.now() + EXPORT_TTL_MS) });
    try {
      const data = await collectForUser(userId);
      await putObject(key, Buffer.from(JSON.stringify(data, null, 2), 'utf8'), 'application/json');
      const updated = await db.update(dataExports).set({ status: 'ready', storageKey: key, readyAt: new Date() })
        .where(and(eq(dataExports.id, id), eq(dataExports.userId, userId))).returning({ id: dataExports.id });
      if (!updated.length) {
        await deleteObject(key);
        return reply.code(409).send({ error: 'export_cancelled' });
      }
      if (emailConfigured()) {
        await sendEmail(req.user!.email, 'Your CareerFlow data export is ready', 'Your requested export is ready in Settings and will expire in 7 days.')
          .catch(error => app.log.error({ err: error }, 'Transactional export email failed'));
      }
      return reply.code(201).send({ exportId: id, status: 'ready' });
    } catch (error) {
      await deleteObject(key).catch(() => undefined);
      await db.update(dataExports).set({ status: 'failed', error: 'export_failed' }).where(eq(dataExports.id, id));
      app.log.error({ err: error }, 'Data export generation failed');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  app.get('/exports', async (req) => {
    await cleanupExpiredExports(req.user!.id, error => app.log.error({ err: error }, 'User export cleanup failed'));
    const rows = await db.select({ id: dataExports.id, status: dataExports.status, requestedAt: dataExports.requestedAt, readyAt: dataExports.readyAt, downloadedAt: dataExports.downloadedAt, expiresAt: dataExports.expiresAt })
      .from(dataExports).where(eq(dataExports.userId, req.user!.id));
    return { exports: rows };
  });

  app.get('/export/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = (await db.select().from(dataExports).where(and(eq(dataExports.id, id), eq(dataExports.userId, req.user!.id))).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!row.expiresAt || row.expiresAt.getTime() <= Date.now()) {
      await cleanupExpiredExports(req.user!.id, error => app.log.error({ err: error }, 'Expired export cleanup failed'));
      return reply.code(410).send({ error: 'expired' });
    }
    if (row.status !== 'ready' || !row.storageKey) return reply.code(409).send({ error: 'not_ready' });
    if (row.storageKey !== exportKey(row.id)) return reply.code(404).send({ error: 'not_found' });
    try {
      const data = await getObject(row.storageKey);
      await db.update(dataExports).set({ downloadedAt: new Date() }).where(and(eq(dataExports.id, id), eq(dataExports.userId, req.user!.id)));
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="careerflow-export-${id}.json"`);
      return reply.send(data);
    } catch {
      return reply.code(410).send({ error: 'file_missing' });
    }
  });

  app.post('/delete', async (req, reply) => {
    const body = DeleteAccountInput.parse(req.body);
    const row = (await db.select({ email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.id, req.user!.id)).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!(await verifyPassword(body.password, row.passwordHash))) return reply.code(401).send({ error: 'invalid_password' });
    if (body.confirmEmail.toLowerCase() !== row.email.toLowerCase()) return reply.code(400).send({ error: 'confirm_mismatch' });
    const cleanupWarnings = await deleteUserCascade(req.user!.id);
    const raw = req.cookies[COOKIE.name];
    if (raw) await destroySession(raw).catch(() => undefined);
    reply.clearCookie(COOKIE.name, { path: '/' });
    return { ok: true, message: 'Account and associated records have been deleted.', cleanupWarnings };
  });
}
EOF
echo '  settings.ts: created (profile, password, export, delete-account with explicit ordered cascade)'

printf '\n%s\n' '== M9: feedback routes =='
write_file apps/api/src/routes/feedback.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { feedbackItems } from '@careerflow/db';
import { SubmitFeedbackInput } from '@careerflow/shared';

export async function registerFeedback(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.post('/', async (req, reply) => {
    const body = SubmitFeedbackInput.parse(req.body);
    const row = (await db.insert(feedbackItems).values({
      userId: req.user!.id,
      workspaceId: null,
      kind: body.kind,
      subject: body.subject,
      body: body.body,
      contactOk: body.contactOk,
      contextScreen: body.contextScreen ?? null,
    }).returning())[0]!;
    return reply.code(201).send({ feedback: { id: row.id, status: row.status, createdAt: row.createdAt } });
  });

  app.get('/', async (req) => {
    const rows = await db.select({
      id: feedbackItems.id, kind: feedbackItems.kind, subject: feedbackItems.subject,
      status: feedbackItems.status, createdAt: feedbackItems.createdAt, updatedAt: feedbackItems.updatedAt,
    }).from(feedbackItems).where(eq(feedbackItems.userId, req.user!.id)).orderBy(desc(feedbackItems.createdAt));
    return { items: rows };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = (await db.select().from(feedbackItems)
      .where(and(eq(feedbackItems.id, id), eq(feedbackItems.userId, req.user!.id))).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { item: row };
  });
}
EOF
echo '  feedback.ts: created'

printf '\n%s\n' '== M9: membership route (returns not-configured when PAYMENT_PROVIDER=none) =='
write_file apps/api/src/routes/membership.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { subscriptions, workspaces } from '@careerflow/db';
import { StartCheckoutInput } from '@careerflow/shared';
import { getPaymentProvider } from '../paymentProvider.js';

const PLAN_DESCRIPTIONS = {
  starter: { name: 'Starter', features: ['Profile versions', 'Evidence library', 'Basic applications', 'Offline MEH guidance'] },
  plus: { name: 'Plus', features: ['Everything in Starter', 'Advanced editor + version history', 'Interview prep', 'Defined MEH connected allowance'] },
  growth: { name: 'Growth', features: ['Everything in Plus', 'Post-hire growth tracker', 'Deeper connected AI', 'Priority support'] },
} as const;

export async function registerMembership(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/plans', async () => {
    const provider = getPaymentProvider();
    return {
      plans: Object.entries(PLAN_DESCRIPTIONS).map(([id, plan]) => ({ id, ...plan })),
      checkoutAvailable: provider.configured,
      provider: provider.name,
      message: provider.configured ? null : 'Billing is not configured in this deployment. No checkout is available.',
    };
  });

  app.get('/current', async (req) => {
    const owned = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, req.user!.id));
    const workspaceIds = owned.map(row => row.id);
    if (!workspaceIds.length) return { subscription: null, provider: 'none' };
    const rows = await db.select().from(subscriptions).where(inArray(subscriptions.workspaceId, workspaceIds));
    return { subscription: rows[0] ?? null, provider: getPaymentProvider().name };
  });

  app.post('/checkout', async (req, reply) => {
    const body = StartCheckoutInput.parse(req.body);
    const owned = (await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, body.workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1))[0];
    if (!owned) return reply.code(404).send({ error: 'workspace_not_found' });
    const provider = getPaymentProvider();
    if (!provider.configured) return reply.code(501).send({ error: 'payment_not_configured', message: 'No payment provider is configured in this deployment.' });
    const session = await provider.startCheckout(body.workspaceId, body.plan, '/membership/success', '/membership/cancel');
    if (!session) return reply.code(501).send({ error: 'checkout_not_implemented' });
    return { checkoutUrl: session.url };
  });
}
EOF
echo '  membership.ts: created (returns 501 cleanly when PAYMENT_PROVIDER=none)'

printf '\n%s\n' '== M9: admin feedback route =='
write_file apps/api/src/routes/adminFeedback.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { feedbackItems, users } from '@careerflow/db';
import { UpdateFeedbackStatusInput } from '@careerflow/shared';
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
function userAgent(req: { headers: Record<string, unknown> }): string | null {
  const value = req.headers['user-agent'];
  return typeof value === 'string' ? value : null;
}
function originAllowed(req: { headers: Record<string, unknown> }, reply: any): boolean {
  const origin = req.headers.origin;
  if (adminOriginAllowed(typeof origin === 'string' ? origin : undefined, env.ADMIN_URL)) return true;
  reply.code(403).send({ error: 'invalid_origin' });
  return false;
}

export async function registerAdminFeedback(app: FastifyInstance): Promise<void> {
  app.get('/feedback', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const rows = await db.select({
      id: feedbackItems.id, kind: feedbackItems.kind, subject: feedbackItems.subject, body: feedbackItems.body,
      contactOk: feedbackItems.contactOk, status: feedbackItems.status, adminNotes: feedbackItems.adminNotes,
      contextScreen: feedbackItems.contextScreen, createdAt: feedbackItems.createdAt, updatedAt: feedbackItems.updatedAt,
      userId: feedbackItems.userId, userEmail: users.email,
    }).from(feedbackItems).leftJoin(users, eq(users.id, feedbackItems.userId))
      .orderBy(desc(feedbackItems.createdAt)).limit(200);
    await audit(admin.adminUserId, 'admin.view_feedback', null, null, {}, req.ip, userAgent(req));
    return { items: rows.map(row => ({ ...row, userEmail: row.contactOk ? row.userEmail : null })) };
  });

  app.patch('/feedback/:id', async (req, reply) => {
    if (!originAllowed(req, reply)) return;
    const admin = await requireAdmin(req, reply, ['owner', 'support']);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const body = UpdateFeedbackStatusInput.parse(req.body);
    const now = new Date();
    const rows = await db.update(feedbackItems).set({
      status: body.status, adminNotes: body.adminNotes ?? null, updatedAt: now,
      ...(body.status === 'resolved' ? { resolvedAt: now } : {}),
    }).where(eq(feedbackItems.id, id)).returning({ id: feedbackItems.id });
    if (!rows.length) return reply.code(404).send({ error: 'not_found' });
    await audit(admin.adminUserId, 'admin.update_feedback', 'feedback', id, { status: body.status }, req.ip, userAgent(req));
    return { ok: true };
  });

  app.delete('/feedback/:id', async (req, reply) => {
    if (!originAllowed(req, reply)) return;
    const admin = await requireAdmin(req, reply, ['owner']);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const rows = await db.delete(feedbackItems).where(eq(feedbackItems.id, id)).returning({ id: feedbackItems.id });
    if (!rows.length) return reply.code(404).send({ error: 'not_found' });
    await audit(admin.adminUserId, 'admin.delete_feedback', 'feedback', id, {}, req.ip, userAgent(req));
    return { ok: true };
  });
}
EOF
echo '  adminFeedback.ts: created'

printf '\n%s\n' '== M9: register routes =='
backup_once apps/api/src/server.ts
node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/server.ts';
if (!fs.existsSync(file)) { console.log('  WARN server.ts missing'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes('registerSettings')) { console.log('  server.ts already has M9 routes'); process.exit(0); }
const lines = s.split('\n'); let last = -1;
for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
if (last < 0) { console.log('  WARN no import anchor'); process.exit(0); }
lines.splice(last + 1, 0,
  "import { registerSettings } from './routes/settings.js';",
  "import { registerFeedback } from './routes/feedback.js';",
  "import { registerMembership } from './routes/membership.js';",
  "import { registerAdminFeedback } from './routes/adminFeedback.js';",
);
s = lines.join('\n');
const pos = s.indexOf('await app.listen(');
if (pos < 0) { console.log('  WARN no app.listen anchor'); process.exit(0); }
const reg = `await app.register(registerSettings, { prefix: '/settings' });
await app.register(registerFeedback, { prefix: '/feedback' });
await app.register(registerMembership, { prefix: '/membership' });
await app.register(registerAdminFeedback, { prefix: '/admin' });

`;
s = s.slice(0, pos) + reg + s.slice(pos);
fs.writeFileSync(file, s);
console.log('  server.ts: 4 M9 routes registered');
NODE

printf '\n%s\n' '== M9: candidate UI (settings, help, feedback, membership) =='
mkdir -p "apps/web/src/app/(app)/settings" "apps/web/src/app/(app)/help" "apps/web/src/app/(app)/feedback" "apps/web/src/app/(app)/membership"

write_file "apps/web/src/app/(app)/settings/page.tsx" <<'EOF'
import { cookies } from 'next/headers';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const cookieHeader = (await cookies()).toString();
  const [data, exportsRes] = await Promise.all([
    apiFetch<any>('/settings', { cookies: cookieHeader }),
    apiFetch<{ exports: any[] }>('/settings/exports', { cookies: cookieHeader }).catch(() => ({ exports: [] })),
  ]);
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card"><h2 style={{ marginBlockStart: 0 }}>Settings</h2><p className="muted">Account, security, privacy, and data controls. <Link href="/help">Help</Link> · <Link href="/feedback">Report a problem</Link> · <Link href="/membership">Membership</Link></p></div>
    <SettingsClient initialUser={data.user} emailConfigured={data.emailConfigured} paymentProvider={data.paymentProvider} exports={exportsRes.exports} />
  </div>;
}
EOF

write_file "apps/web/src/app/(app)/settings/SettingsClient.tsx" <<'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface User { email: string; displayName: string | null; timezone: string; locale: string; createdAt: string; }
interface Export { id: string; status: string; requestedAt: string; readyAt: string | null; downloadedAt: string | null; expiresAt: string | null; }

export default function SettingsClient({ initialUser, emailConfigured, paymentProvider, exports }: { initialUser: User; emailConfigured: boolean; paymentProvider: string; exports: Export[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialUser.displayName ?? '');
  const [timezone, setTimezone] = useState(initialUser.timezone);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    try {
      await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify({ displayName: displayName.trim() || null, timezone }) });
      setMsg('Profile saved.'); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setPwdMsg('');
    try {
      await apiFetch('/settings/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      setPwdMsg('Password changed.'); setCurrentPassword(''); setNewPassword('');
    } catch (e) { setPwdMsg(e instanceof Error ? e.message : 'Change failed'); } finally { setBusy(false); }
  }

  async function requestExport() {
    setBusy(true); setErr('');
    try {
      await apiFetch('/settings/export', { method: 'POST', body: JSON.stringify({}) });
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(false); }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault(); setDeleteErr('');
    if (!deleteAck) { setDeleteErr('You must acknowledge that deletion is irreversible.'); return; }
    if (deleteConfirm.toLowerCase() !== initialUser.email.toLowerCase()) { setDeleteErr('Typed email does not match your account email.'); return; }
    setDeleteBusy(true);
    try {
      await apiFetch('/settings/delete', { method: 'POST', body: JSON.stringify({ password: deletePassword, confirmEmail: deleteConfirm, acknowledgeIrreversible: true }) });
      window.location.href = '/';
    } catch (e) { setDeleteErr(e instanceof Error ? e.message : 'Delete failed'); } finally { setDeleteBusy(false); }
  }

  return <>
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Account</h3>
      <form onSubmit={saveProfile}>
        <div className="form-field"><label>Email</label><input value={initialUser.email} disabled /></div>
        <div className="form-field"><label>Display name</label><input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={80} /></div>
        <div className="form-field"><label>Timezone</label><input value={timezone} onChange={e => setTimezone(e.target.value)} /></div>
        {msg && <p role="status" style={{ color: 'green', fontSize: 13 }}>{msg}</p>}
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" type="submit" disabled={busy}>Save</button>
      </form>
    </div>

    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Password</h3>
      <form onSubmit={changePassword}>
        <div className="form-field"><label>Current password</label><input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></div>
        <div className="form-field"><label>New password (min 10)</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={10} /></div>
        {pwdMsg && <p role="status" style={{ fontSize: 13 }}>{pwdMsg}</p>}
        <button className="btn btn-mint" type="submit" disabled={busy}>Change password</button>
      </form>
    </div>

    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Privacy & data</h3>
      <p className="muted">Export your CareerFlow records as one JSON file; exports expire after 7 days. Raw uploaded CV files are excluded, but parsed CV text is included. Shared opportunity catalog entries are labeled in the export.</p>
      {emailConfigured && <p className="muted" style={{ fontSize: 12 }}>Email notifications are enabled in this deployment — you will receive an email when the export is ready.</p>}
      <button className="btn btn-mint" onClick={requestExport} disabled={busy}>Request data export</button>
      {exports.length > 0 && (
        <div style={{ marginBlockStart: 12 }}>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Recent exports:</p>
          <ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: 13 }}>
            {exports.map(x => <li key={x.id}>
              {new Date(x.requestedAt).toLocaleString()} — {x.status}
              {x.status === 'ready' && !(x.expiresAt && new Date(x.expiresAt).getTime() < Date.now()) && <> (<a href={`/settings/export/${x.id}`} download>download</a>)</>}
            </li>)}
          </ul>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginBlockStart: 12 }}>Payment provider in this deployment: <strong>{paymentProvider}</strong>. Manage subscriptions in <a href="/membership">Membership</a>.</p>
    </div>

    <div className="card" style={{ borderInlineStart: '4px solid var(--coral)' }}>
      <h3 style={{ marginBlockStart: 0 }}>Delete account</h3>
      <p className="muted">This deletes your account, workspaces, profile versions, evidence, applications, documents, CV imports and their uploaded files, notifications, MEH conversations, growth records, subscriptions, and generated exports. <strong>It cannot be undone.</strong> Feedback you previously submitted remains with its account and workspace links removed; identifying details you wrote in its text may remain. Shared opportunity catalog entries are not deleted and may remain visible to other users.</p>
      <form onSubmit={deleteAccount}>
        <div className="form-field"><label>Your password</label><input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} required /></div>
        <div className="form-field"><label>Type your email to confirm: <code>{initialUser.email}</code></label><input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} required /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlockEnd: 12 }}>
          <input type="checkbox" checked={deleteAck} onChange={e => setDeleteAck(e.target.checked)} /> I understand this is irreversible.
        </label>
        {deleteErr && <p className="err">{deleteErr}</p>}
        <button className="btn" type="submit" disabled={deleteBusy} style={{ background: 'var(--coral)' }}>{deleteBusy ? 'Deleting…' : 'Delete account permanently'}</button>
      </form>
    </div>
  </>;
}
EOF

write_file "apps/web/src/app/(app)/help/page.tsx" <<'EOF'
import Link from 'next/link';

const TOPICS = [
  { title: 'Set my direction', body: 'Go to Direction → Start. You can pause anytime; nothing is final until you save a goal.' },
  { title: 'Import my CV', body: 'Go to Import CV. Supported: PDF (selectable text), TXT, MD. You review every section before anything enters your profile.' },
  { title: 'Link evidence to a role', body: 'Open an application, find a requirement, click "Link evidence…". Only same-workspace evidence is offered.' },
  { title: 'Prepare for an interview', body: 'Open an application → Prepare for interview. Questions are deterministic for your role; your evidence is selectable.' },
  { title: 'Download my data', body: 'Settings → Privacy & data → Request data export. A complete JSON snapshot is generated.' },
  { title: 'Delete my account', body: 'Settings → Delete account. Requires password and typed email confirmation.' },
];

export default function HelpPage() {
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card">
      <h2 style={{ marginBlockStart: 0 }}>Help</h2>
      <p className="muted">Common tasks. For anything else, <Link href="/feedback">report a problem or share feedback</Link>.</p>
    </div>
    {TOPICS.map(t => <div key={t.title} className="card"><h3 style={{ marginBlockStart: 0 }}>{t.title}</h3><p>{t.body}</p></div>)}
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>What CareerFlow is not</h3>
      <p>CareerFlow does not verify your experience, predict hiring outcomes, or replace professional career, legal, financial, or mental-health advice. For consequential decisions, consult a qualified professional.</p>
    </div>
  </div>;
}
EOF

write_file "apps/web/src/app/(app)/feedback/page.tsx" <<'EOF'
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import FeedbackClient from './FeedbackClient';

export default async function FeedbackPage() {
  const cookieHeader = (await cookies()).toString();
  const items = await apiFetch<{ items: any[] }>('/feedback', { cookies: cookieHeader }).catch(() => ({ items: [] }));
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card"><h2 style={{ marginBlockStart: 0 }}>Feedback</h2><p className="muted">Report a problem or share a suggestion. Only the fields below are sent. Support may contact you only if you allow it.</p></div>
    <FeedbackClient items={items.items} />
  </div>;
}
EOF

write_file "apps/web/src/app/(app)/feedback/FeedbackClient.tsx" <<'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

const KINDS = [['bug', 'Bug'], ['suggestion', 'Suggestion'], ['question', 'Question'], ['concern', 'Concern']] as const;

export default function FeedbackClient({ items }: { items: any[] }) {
  const router = useRouter();
  const [kind, setKind] = useState('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [contactOk, setContactOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    try {
      await apiFetch('/feedback', { method: 'POST', body: JSON.stringify({ kind, subject, body, contactOk }) });
      setMsg('Thank you — feedback submitted.'); setSubject(''); setBody(''); setContactOk(false);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Submit failed'); } finally { setBusy(false); }
  }

  return <>
    <div className="card">
      <form onSubmit={submit}>
        <div className="form-field"><label>Kind</label><select value={kind} onChange={e => setKind(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="form-field"><label>Subject</label><input required minLength={3} maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></div>
        <div className="form-field"><label>Details</label><textarea required minLength={10} maxLength={10000} rows={5} value={body} onChange={e => setBody(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit' }} /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBlockEnd: 12 }}><input type="checkbox" checked={contactOk} onChange={e => setContactOk(e.target.checked)} /> Support may contact me about this feedback</label>
        {msg && <p role="status" style={{ color: 'green', fontSize: 13 }}>{msg}</p>}
        {err && <p className="err">{err}</p>}
        <button className="btn btn-mint" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
      </form>
    </div>
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Your previous feedback</h3>
      {items.length === 0 ? <p className="muted">No submissions yet.</p> : <ul style={{ margin: 0, paddingInlineStart: 20 }}>{items.map(x => <li key={x.id}>{new Date(x.createdAt).toLocaleString()} — <strong>{x.kind}</strong>: {x.subject} <span className="muted">({x.status})</span></li>)}</ul>}
    </div>
  </>;
}
EOF

write_file "apps/web/src/app/(app)/membership/page.tsx" <<'EOF'
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export default async function MembershipPage() {
  const cookieHeader = (await cookies()).toString();
  const plans = await apiFetch<any>('/membership/plans', { cookies: cookieHeader });
  return <div style={{ display: 'grid', gap: 20 }}>
    <div className="card">
      <h2 style={{ marginBlockStart: 0 }}>Membership</h2>
      {plans.message ? <p className="muted">{plans.message}</p> : <p className="muted">Choose a plan below.</p>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      {plans.plans.map((p: any) => <div key={p.id} className="card">
        <h3 style={{ marginBlockStart: 0 }}>{p.name}</h3>
        <ul style={{ paddingInlineStart: 20, margin: 0, fontSize: 14 }}>{p.features.map((f: string) => <li key={f}>{f}</li>)}</ul>
        {!plans.checkoutAvailable && <p className="muted" style={{ fontSize: 12, marginBlockStart: 12 }}>Available at no cost in this deployment.</p>}
      </div>)}
    </div>
    <div className="card">
      <p className="muted" style={{ fontSize: 12 }}>Payment provider configured: <strong>{plans.provider}</strong>. When a provider is enabled, a checkout flow will be available on this page.</p>
    </div>
  </div>;
}
EOF

printf '\n%s\n' '== M9: admin feedback page + dashboard count =='
mkdir -p apps/admin/src/app/feedback
write_file apps/admin/src/app/feedback/page.tsx <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Item = { id: string; kind: string; subject: string; body: string; status: string; contactOk: boolean; contextScreen: string | null; createdAt: string; userEmail: string | null; adminNotes: string | null };
export default function FeedbackAdmin() {
  const [items, setItems] = useState<Item[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  async function load() { try { setItems((await apiFetch<{ items: Item[] }>('/admin/feedback')).items); } catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); } }
  useEffect(() => { void load(); }, []);
  async function setStatus(id: string, status: string, adminNotes?: string) {
    setBusy(id);
    try { await apiFetch(`/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status, adminNotes }) }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Update failed'); } finally { setBusy(''); }
  }
  return <div>
    <h1>Feedback</h1>
    <p style={{ color: '#94a3b8', fontSize: 14 }}>Candidate-submitted issues. Update status when triaged. Owner role can delete.</p>
    {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
    <div style={{ display: 'grid', gap: 10, marginBlockStart: 16 }}>
      {items.length === 0 ? <p style={{ color: '#94a3b8' }}>No feedback yet.</p> : items.map(it => <div key={it.id} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div>
            <strong>{it.subject}</strong>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>{it.kind} · {new Date(it.createdAt).toLocaleString()} · {it.userEmail ?? 'deleted user'} {it.contactOk ? '· may contact' : ''} {it.contextScreen ? `· ${it.contextScreen}` : ''}</div>
          </div>
          <select value={it.status} disabled={busy === it.id} onChange={e => void setStatus(it.id, e.target.value, it.adminNotes ?? undefined)} style={{ background: '#0b1f3a', color: 'white', border: '1px solid #475569', padding: '4px 8px', borderRadius: 4 }}>
            {['open','acknowledged','resolved','closed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{it.body}</p>
      </div>)}
    </div>
  </div>;
}
EOF

backup_once apps/admin/src/components/AdminNav.tsx
node <<'NODE'
const fs = require('fs');
const file = 'apps/admin/src/components/AdminNav.tsx';
if (!fs.existsSync(file)) { console.log('  WARN admin nav missing'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes('"/feedback"')) { console.log('  admin nav: already has feedback link'); process.exit(0); }
const anchors = ['<Link href="/audit">Audit log</Link>', '<Link href="/flags">Feature flags</Link>'];
for (const a of anchors) {
  if (s.includes(a)) { s = s.replace(a, a + '<Link href="/feedback">Feedback</Link>'); fs.writeFileSync(file, s); console.log('  admin nav: feedback link added'); process.exit(0); }
}
console.log('  WARN admin nav: no anchor for feedback link');
NODE

backup_once 'apps/web/src/app/(app)/layout.tsx'
node <<'NODE'
const fs = require('fs');
const file = 'apps/web/src/app/(app)/layout.tsx';
if (!fs.existsSync(file)) { console.log('  WARN web layout missing'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes('"/settings"')) { console.log('  layout: already has settings link'); process.exit(0); }
const anchor = /(<Link href="\/notifications"[^>]*>[\s\S]*?<\/Link>)/;
if (anchor.test(s)) {
  s = s.replace(anchor, '$1\n        <Link href="/settings">Settings</Link>\n        <Link href="/help">Help</Link>');
} else if (s.includes('</nav>')) {
  s = s.replace('</nav>', '        <Link href="/settings">Settings</Link>\n        <Link href="/help">Help</Link>\n      </nav>');
} else { console.log('  WARN no anchor for settings nav'); process.exit(0); }
fs.writeFileSync(file, s);
console.log('  web layout: settings + help nav links added');
NODE


# Path-safe cleanup and authenticated same-origin export download.
write_file apps/api/src/storage.ts <<'EOF'
import { lstatSync, mkdirSync, realpathSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { env } from './env.js';

const PROJECT_ROOT = realpathSync(process.cwd());
function within(root: string, candidate: string, allowRoot = false): boolean {
  const rel = relative(root, candidate);
  return (allowRoot && rel === '') || (rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function ensureDirectoryTree(root: string, target: string): string {
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`STORAGE_DIR must be a dedicated directory inside project root: ${target}`);
  let current = root;
  for (const part of rel.split(sep)) {
    if (!part || part === '.' || part === '..') throw new Error('Invalid storage directory component');
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Storage directory contains a symlink: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Storage path component is not a directory: ${current}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      mkdirSync(current, { mode: 0o700 });
    }
    if (!within(root, realpathSync(current))) throw new Error(`Storage directory escapes project root: ${current}`);
  }
  return realpathSync(target);
}
function resolveRoot(): string {
  const candidate = resolve(PROJECT_ROOT, env.STORAGE_DIR);
  const rel = relative(PROJECT_ROOT, candidate);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`STORAGE_DIR must be a dedicated subdirectory inside project root: ${candidate}`);
  return ensureDirectoryTree(PROJECT_ROOT, candidate);
}
const ROOT = resolveRoot();

export function storagePath(key: string): string {
  if (!key || key.indexOf(String.fromCharCode(0)) !== -1 || key.indexOf(String.fromCharCode(92)) !== -1 || isAbsolute(key) || key.startsWith('/')) throw new Error('Invalid storage key');
  const parts = key.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Invalid storage key component');
  const full = resolve(ROOT, ...parts);
  if (!within(ROOT, full)) throw new Error(`Storage key escapes root: ${key}`);
  return full;
}
function ensureSafeParent(full: string): void {
  const rel = relative(ROOT, dirname(full));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Storage parent escapes root');
  let current = ROOT;
  for (const part of rel ? rel.split(sep) : []) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Storage path contains a symlink: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Storage path component is not a directory: ${current}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      mkdirSync(current, { mode: 0o700 });
    }
    if (!within(ROOT, realpathSync(current), true)) throw new Error(`Storage path escapes root: ${current}`);
  }
  if (!within(ROOT, realpathSync(dirname(full)), true)) throw new Error('Storage parent escapes root');
}
export async function putObject(key: string, body: Buffer, _mime: string): Promise<void> {
  const full = storagePath(key);
  ensureSafeParent(full);
  writeFileSync(full, body, { flag: 'wx', mode: 0o600 });
}
export async function getObject(key: string): Promise<Buffer> {
  const full = storagePath(key);
  ensureSafeParent(full);
  const stat = lstatSync(full);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Invalid stored object');
  const real = realpathSync(full);
  if (!within(ROOT, real)) throw new Error('Stored object escapes root');
  return readFileSync(real);
}

export async function deleteObject(key: string): Promise<boolean> {
  const full = storagePath(key);
  const parentRel = relative(ROOT, dirname(full));
  if (parentRel === '..' || parentRel.startsWith(`..${sep}`) || isAbsolute(parentRel)) {
    throw new Error('Storage parent escapes root');
  }
  let current = ROOT;
  for (const part of parentRel ? parentRel.split(sep) : []) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Invalid storage parent');
    if (!within(ROOT, realpathSync(current), true)) throw new Error('Storage parent escapes root');
  }
  let stat;
  try { stat = lstatSync(full); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Invalid stored object');
  if (!within(ROOT, realpathSync(full))) throw new Error('Stored object escapes root');
  unlinkSync(full);
  return true;
}
EOF
write_file 'apps/web/src/app/(app)/settings/export/[id]/route.ts' <<'EOF'
import { cookies } from 'next/headers';
import { API_URL } from '@/lib/api';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'not_found' }, { status: 404 });
  const cookieHeader = (await cookies()).toString();
  const upstream = await fetch(`${API_URL}/settings/export/${encodeURIComponent(id)}`, {
    headers: { cookie: cookieHeader }, cache: 'no-store',
  });
  const headers = new Headers();
  for (const key of ['content-type', 'content-disposition']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers });
}
EOF
backup_once TESTING.md
node <<'M9_TESTING_NODE'
const fs = require('fs');
const file = 'TESTING.md';
const block = "<!-- M9 TESTING START -->\n## M9 \u2014 settings, privacy/data, deletion, help, feedback, and adapters\n\n### Run the single script\n\nRun `bash apply-m9.sh` from the repository root. PostgreSQL and the current API must be available (`API_URL` defaults to `http://localhost:4000`); use the API dev watcher or restart it after source changes. The runner applies the additive schema, runs recursive typechecks, and fails rather than skipping unavailable self-verification. It does not reset or seed the database. Existing source files have path-preserving backups under `.m9-backups/before/`.\n\nThe strict verifier creates two throwaway candidate accounts only. It checks profile persistence, password/session behavior, owner-scoped export and checkout authorization, JSON export contents and exclusions, expiry/file cleanup, uploaded-CV cleanup, account deletion, the same cookie returning 401 afterward, and restoration of baseline table counts. Never substitute a real user's account into the destructive checks.\n\n### Why deletion is explicit\n\nThe ordered relational delete is intentional: `application_events.created_by` and `document_versions.created_by` reference `users` without `onDelete: 'cascade'`. Deleting only the user would therefore fail when those rows exist. M9 explicitly removes dependent rows in the correct order, then deletes the user. M10 should review and migrate those two foreign keys to `ON DELETE CASCADE` before simplifying relational deletion to a single `DELETE FROM users WHERE id = ...`. Uploaded/generated file cleanup will still be required separately.\n\n### Honest retention boundaries\n\n- The opportunity catalog has no `owner_id` and is shared across candidates. A candidate-added entry can be visible to everyone. Exported entries are labeled `sharedCatalogEntries`, not the candidate's private records; account deletion leaves the catalog untouched. This is an unresolved candidate-control gap, not an ownership guarantee. Owner-scoping remains M10 work.\n- Feedback survives account deletion with its `user_id` and `workspace_id` removed. This does not guarantee anonymity of identifying details entered into its free text. The settings disclosure states this limitation.\n- Exports omit password hashes, session tokens, SMTP/payment secrets, and raw uploaded CV files. Parsed CV text is included. Export files expire after seven days; download/list handling and the running API's periodic cleanup remove expired artifacts.\n\n### No fake payment or email flow\n\n`PAYMENT_PROVIDER=none` is the default. No payment rail is integrated; membership reports not configured, and checkout returns HTTP 501 without calling a provider. Implement the selected real rail in `apps/api/src/paymentProvider.ts` only after the product decision. Merely changing the environment selection does not implement a rail.\n\n`EMAIL_ENABLED=false` is parsed as false. The adapter makes no send call unless email is explicitly enabled and SMTP is configured. Only transactional export-ready email is wired; inbound email, marketing, email-verification tokens, and password reset are not implemented. Actual SMTP delivery is not an M9 no-email test result.\n\n### Mandatory manual browser gates\n\n1. On `/settings`, change the display name, save, reload, and verify persistence. Change the password, sign out, and sign in with the new password.\n2. Request an export, reload to see `ready`, and download `careerflow-export-<uuid>.json` through the same-origin route. Open the JSON and verify `user`, `workspaces`, and the labeled shared catalog section.\n3. On `/help`, verify all six topics and the \u201cwhat this is not\u201d section.\n4. Submit `/feedback`, verify it in the candidate list and admin `/feedback` list, and verify `admin.view_feedback`/update audit records. The API is `/admin/feedback`; the separate admin UI is `http://localhost:3001/feedback`.\n5. On `/membership`, verify plans render \u201cAvailable at no cost in this deployment\u201d and no control initiates a provider checkout.\n6. Create a throwaway user and delete it through the visible settings form. Verify the old session gets 401 from `/auth/me`, its workspace is absent, and uploaded/generated files are removed. Do not test this with a real account.\n\nA passing API verifier is not a substitute for these browser gates. Do not call M9 fully green or start M10 on that basis alone.\n<!-- M9 TESTING END -->\n";
const start = '<!-- M9 TESTING START -->';
const end = '<!-- M9 TESTING END -->';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# CareerFlow testing\n';
const a = text.indexOf(start), b = text.indexOf(end);
if ((a >= 0) !== (b >= 0)) throw new Error('Incomplete M9 testing markers; refusing an ambiguous documentation patch');
if (a >= 0) text = text.slice(0, a) + block.trimEnd() + text.slice(b + end.length);
else text = text.trimEnd() + '\n\n' + block;
fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n');
console.log('  TESTING.md: M9 gates, cascade rationale, and retention limits recorded');
M9_TESTING_NODE
printf '\n%s\n' '== M9: additive database migration =='
pnpm db:push

printf '\n%s\n' '== M9: typecheck =='
pnpm -r --if-present typecheck

printf '\n%s\n' '== M9: strict synthetic self-verification (API and additive schema required) =='
node <<'NODE'
const API = process.env.API_URL || 'http://localhost:4000';
const fs = require('node:fs');
const path = require('node:path');
const assert = (condition, label) => {
  if (!condition) throw new Error(`FAIL ${label}`);
  console.log(`  PASS ${label}`);
};
const appDir = path.join(process.cwd(), 'apps/api');
const { Client } = require(require.resolve('pg', { paths: [appDir] }));
const dotenv = require(require.resolve('dotenv', { paths: [appDir] }));
const dotenvValues = fs.existsSync(path.join(process.cwd(), '.env'))
  ? dotenv.parse(fs.readFileSync(path.join(process.cwd(), '.env')))
  : {};
const databaseUrl = process.env.DATABASE_URL || dotenvValues.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is unavailable for synthetic-only verification');
const storageDir = process.env.STORAGE_DIR || dotenvValues.STORAGE_DIR || './data/uploads';
const storageRoot = path.resolve(appDir, storageDir);
const objectPath = key => path.resolve(storageRoot, ...key.split('/'));
if (!objectPath('x').startsWith(`${storageRoot}${path.sep}`)) throw new Error('Invalid storage root');
const db = new Client({ connectionString: databaseUrl });
const accounts = [];
async function request(route, { method = 'GET', cookie, body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (cookie) requestHeaders.set('cookie', cookie);
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set('content-type', 'application/json');
    payload = JSON.stringify(body);
  }
  return fetch(`${API}${route}`, { method, headers: requestHeaders, body: payload, signal: AbortSignal.timeout(15000) });
}
function sessionCookie(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  const found = setCookie.match(/cf_session=([^;]+)/);
  return found ? `cf_session=${found[1]}` : '';
}
async function createAccount(label) {
  const email = `m9-${label}-${Date.now()}-${Math.random().toString(36).slice(2,8)}@test.local`;
  const password = process.env.M9_TEST_PASSWORD;
  const response = await request('/auth/signup', { method: 'POST', body: { email, password, displayName: `M9 ${label}` } });
  assert(response.status === 200, `${label} synthetic signup (${response.status})`);
  const cookie = sessionCookie(response);
  assert(!!cookie, `${label} session cookie created`);
  const account = { email, password, cookie, newPassword: 'M9-throwaway-New-456!', activePassword: password };
  accounts.push(account);
  return account;
}
async function createWorkspace(account, name) {
  const response = await request('/workspaces', { method: 'POST', cookie: account.cookie, body: { name, kind: 'personal' } });
  assert(response.status === 201, `${name} workspace created (${response.status})`);
  return (await response.json()).workspace;
}
async function createAppAndPrep(account, workspaceId, marker) {
  const created = await request(`/applications/by-workspace/${workspaceId}`, { method: 'POST', cookie: account.cookie, body: {} });
  assert(created.status === 201, `${marker} application created (${created.status})`);
  const appId = (await created.json()).application.id;
  const prep = await request(`/interview/${appId}`, { method: 'PUT', cookie: account.cookie, body: { selectedQuestionIds: [], evidenceIds: [], notes: marker } });
  assert(prep.status === 201, `${marker} interview prep created (${prep.status})`);
  return { appId, marker };
}
async function deleteAccount(account, label) {
  const response = await request('/settings/delete', { method: 'POST', cookie: account.cookie, body: {
    password: account.activePassword || account.password,
    confirmEmail: account.email,
    acknowledgeIrreversible: true,
  } });
  if (response.status === 401) {
    const me = await request('/auth/me', { cookie: account.cookie });
    assert(me.status === 401, `${label} already deleted and session unauthorized`);
    return;
  }
  assert(response.status === 200, `${label} throwaway-only account deletion (${response.status})`);
  const result = await response.json();
  assert(Array.isArray(result.cleanupWarnings) && result.cleanupWarnings.length === 0, `${label} storage cleanup complete`);
  const after = await request('/auth/me', { cookie: account.cookie });
  assert(after.status === 401, `${label} same session unauthorized after deletion`);
}

(async () => {
  let failed = false;
  const baseline = {};
  try {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
    assert(health.status === 200, `API health (${health.status})`);
    await db.connect();
    for (const table of ['users', 'workspaces', 'applications', 'sessions', 'cv_import_sessions', 'data_exports']) {
      const result = await db.query(`SELECT count(*)::int AS count FROM ${table}`);
      baseline[table] = result.rows[0].count;
    }
    const checks = [['/settings',401],['/settings/exports',401],['/feedback',401],['/membership/current',401],['/membership/plans',401]];
    for (const [route, expected] of checks) {
      const response = await request(route);
      assert(response.status === expected, `unauthenticated/public ${route} (${response.status})`);
    }
    const owner = await createAccount('owner');
    const planResponse = await request('/membership/plans', { cookie: owner.cookie });
    const plans = await planResponse.json();
    assert(planResponse.status === 200 && plans.provider === 'none' && plans.checkoutAvailable === false && /not configured/i.test(plans.message), 'authenticated membership reports checkout not configured');
    const other = await createAccount('other');
    const ownerWs = await createWorkspace(owner, 'M9 synthetic owner workspace');
    const otherWs = await createWorkspace(other, 'M9 synthetic other workspace');
    const ownerFixture = await createAppAndPrep(owner, ownerWs.id, `owner-only-${Date.now()}`);
    const otherFixture = await createAppAndPrep(other, otherWs.id, `other-only-${Date.now()}`);

    const current = await request('/membership/current', { cookie: owner.cookie });
    assert(current.status === 200 && (await current.json()).subscription === null, 'membership current is workspace-scoped');
    const ownedCheckout = await request('/membership/checkout', { method: 'POST', cookie: owner.cookie, body: { workspaceId: ownerWs.id, plan: 'starter' } });
    assert(ownedCheckout.status === 501 && (await ownedCheckout.json()).error === 'payment_not_configured', 'owned checkout is disabled without provider call');
    const foreignCheckout = await request('/membership/checkout', { method: 'POST', cookie: owner.cookie, body: { workspaceId: otherWs.id, plan: 'starter' } });
    assert(foreignCheckout.status === 404, 'cross-user workspace checkout is denied before provider');

    const changed = await request('/settings', { method: 'PATCH', cookie: owner.cookie, body: { displayName: 'M9 persisted name', timezone: 'Africa/Cairo' } });
    assert(changed.status === 200, 'settings profile update accepted');
    const saved = await request('/settings', { cookie: owner.cookie });
    const savedData = await saved.json();
    const savedUser = savedData.user;
    assert(saved.status === 200 && savedUser.displayName === 'M9 persisted name' && savedUser.timezone === 'Africa/Cairo', 'settings profile persisted');
    assert(savedData.emailConfigured === false, 'transactional email remains disabled');

    const passwordChange = await request('/settings/password', { method: 'POST', cookie: owner.cookie, body: { currentPassword: owner.password, newPassword: owner.newPassword } });
    assert(passwordChange.status === 200, 'password change accepted');
    owner.activePassword = owner.newPassword;
    const oldSignin = await request('/auth/signin', { method: 'POST', body: { email: owner.email, password: owner.password } });
    assert(oldSignin.status === 401, 'old password no longer signs in');
    const newSignin = await request('/auth/signin', { method: 'POST', body: { email: owner.email, password: owner.newPassword } });
    assert(newSignin.status === 200, 'new password signs in');
    owner.cookie = sessionCookie(newSignin);
    assert(!!owner.cookie, 'new sign-in session obtained');

    const form = new FormData();
    form.append('file', new Blob(['M9 synthetic CV\nExperience: Test Engineer\nSkills: TypeScript, QA'], { type: 'text/plain' }), 'm9-synthetic-cv.txt');
    const upload = await request(`/cv/${ownerWs.id}/import`, { method: 'POST', cookie: owner.cookie, body: form });
    assert(upload.status === 201, `synthetic CV upload (${upload.status})`);
    const uploadData = await upload.json();
    const uploadSessionResponse = await request(`/cv/${ownerWs.id}/session/${uploadData.sessionId}`, { cookie: owner.cookie });
    assert(uploadSessionResponse.status === 200, 'synthetic upload session is readable by owner');
    const uploadSession = (await uploadSessionResponse.json()).session;
    const uploadFile = objectPath(uploadSession.storageKey);
    assert(fs.existsSync(uploadFile), 'synthetic uploaded CV artifact exists before deletion');

    const feedback = await request('/feedback', { method: 'GET', cookie: owner.cookie });
    assert(feedback.status === 200, 'authenticated feedback list');
    const exp = await request('/settings/export', { method: 'POST', cookie: owner.cookie, body: {} });
    assert(exp.status === 201, `data export created (${exp.status})`);
    const exportId = (await exp.json()).exportId;
    const exportFile = objectPath(`exports/${exportId}.json`);
    assert(fs.existsSync(exportFile), 'generated export JSON exists before expiry/deletion');
    const download = await request(`/settings/export/${exportId}`, { cookie: owner.cookie });
    assert(download.status === 200 && /attachment; filename="careerflow-export-/.test(download.headers.get('content-disposition') || ''), 'export download response is an attachment');
    const exported = await download.json();
    assert(exported.user.email === owner.email && exported.workspaces.some(item => item.id === ownerWs.id), 'export contains user and owned workspace');
    assert(exported.applications.some(item => item.id === ownerFixture.appId), 'export contains owned application');
    assert(exported.interviewPreps.some(item => item.notes === ownerFixture.marker) && !exported.interviewPreps.some(item => item.notes === otherFixture.marker), 'interview preparations are owner-scoped');
    assert(exported.sharedCatalogEntries && /shared catalog entries/i.test(exported.sharedCatalogEntries.note), 'export labels shared opportunity catalog entries');
    assert(!JSON.stringify(exported).includes('passwordHash'), 'export excludes password hashes');

    await db.query("UPDATE data_exports SET expires_at = now() - interval '1 second' WHERE id = $1 AND user_id = $2", [exportId, (await db.query('SELECT id FROM users WHERE email=$1', [owner.email])).rows[0].id]);
    const listed = await request('/settings/exports', { cookie: owner.cookie });
    assert(listed.status === 200, 'export list available');
    const listedExports = (await listed.json()).exports;
    assert(listedExports.some(item => item.id === exportId && item.status === 'expired'), 'expired export marked expired');
    assert(!fs.existsSync(exportFile), 'expired export file removed');

    const finalExport = await request('/settings/export', { method: 'POST', cookie: owner.cookie, body: {} });
    assert(finalExport.status === 201, 'second export created for deletion cleanup');
    const finalExportId = (await finalExport.json()).exportId;
    const finalExportFile = objectPath(`exports/${finalExportId}.json`);
    assert(fs.existsSync(finalExportFile), 'second export artifact exists before deletion');
    await deleteAccount(owner, 'owner');
    assert(!fs.existsSync(uploadFile), 'deleted owner uploaded CV file removed');
    assert(!fs.existsSync(finalExportFile), 'deleted owner generated export removed');
    await deleteAccount(other, 'other');

    for (const table of Object.keys(baseline)) {
      const result = await db.query(`SELECT count(*)::int AS count FROM ${table}`);
      assert(result.rows[0].count === baseline[table], `${table} baseline count restored`);
    }
    console.log('\n  M9 strict synthetic self-verification: PASS');
  } catch (error) {
    failed = true;
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    for (const account of accounts.slice().reverse()) {
      try {
        const me = await request('/auth/me', { cookie: account.cookie });
        if (me.status === 200) await deleteAccount(account, 'cleanup');
      } catch (error) {
        console.error(`  CLEANUP WARNING: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try { await db.end(); } catch {}
  }
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
NODE

printf '\n%s\n' '== M9 applied =='
echo 'M9 gates completed: additive db:push, recursive typecheck, and strict synthetic self-verification.'
echo '  pnpm --filter @careerflow/api dev &'
echo '  pnpm --filter @careerflow/web dev &    # :3000 → /settings, /help, /feedback, /membership'
echo '  pnpm --filter @careerflow/admin dev &  # :3001 → /feedback (admin list)'
echo ''
echo 'Email: EMAIL_ENABLED=false; SMTP adapter makes no call unless explicitly enabled.'
echo ''
echo 'Payment:'
echo '  PAYMENT_PROVIDER=none (default) → membership shows not configured; checkout returns 501 without a provider call.'
echo '  When a rail is selected, implement a real adapter in apps/api/src/paymentProvider.ts.'
