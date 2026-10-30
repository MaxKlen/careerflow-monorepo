#!/usr/bin/env bash
set -euo pipefail
[ -d apps/api ] || { echo "Run from careerflow-monorepo/ root."; exit 1; }

# M10 lesson: persist a copy of this script before doing anything else.
mkdir -p .m11-scripts
if [ ! -f .m11-scripts/apply-m11.sh ] && [ -f "$0" ]; then
  cp "$0" .m11-scripts/apply-m11.sh
  echo "  self-saved to .m11-scripts/apply-m11.sh"
fi

backup_once() {
  local f="$1"
  if [ -f "$f" ] && [ ! -f .m11-scripts/prechange-backups.done ]; then
    mkdir -p ".m11-backups/before/$(dirname "$f")"
    [ -f ".m11-backups/before/$f" ] || cp -p "$f" ".m11-backups/before/$f"
  fi
}

printf '%s\n' '== M11: safety preflight =='
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const appDir = path.join(process.cwd(), 'apps/api');
const dotenv = require(require.resolve('dotenv', { paths: [appDir] }));
const envFile = path.join(process.cwd(), '.env');
const fileEnv = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
const get = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;
const emailEnabled = /^(true|1|yes|on)$/i.test(String(get('EMAIL_ENABLED', 'false')).trim());
const paymentProvider = String(get('PAYMENT_PROVIDER', 'none')).trim().toLowerCase();
if (emailEnabled) throw new Error('M11 safety gate: EMAIL_ENABLED must remain false; no email will be sent.');
if (paymentProvider !== 'none') throw new Error(`M11 safety gate: PAYMENT_PROVIDER must remain none (got ${paymentProvider}).`);
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
for (const [key, fallback] of [
  ['DATABASE_URL', ''], ['API_URL', 'http://localhost:4000'],
  ['APP_URL', 'http://localhost:3000'], ['ADMIN_URL', 'http://localhost:3001'],
  ['EMPLOYER_URL', 'http://localhost:3002'],
]) {
  const raw = get(key, fallback);
  if (!raw) { if (key === 'DATABASE_URL') throw new Error('M11 safety gate: DATABASE_URL is required.'); continue; }
  let host;
  try { host = new URL(raw).hostname.replace(/^\[|\]$/g, ''); }
  catch { throw new Error(`M11 safety gate: ${key} is not a valid URL.`); }
  if (!localHosts.has(host)) throw new Error(`M11 safety gate: ${key} must target localhost; refusing remote access.`);
}
console.log('  PASS: email disabled; PAYMENT_PROVIDER=none; DB/API/UI targets are local only');
NODE

# Exact pre-change backups before package install, typechecks, or source edits.
for f in \
  apps/api/src/env.ts .env.example packages/db/src/schema.ts apps/api/src/server.ts \
  'apps/web/src/app/(app)/applications/[id]/page.tsx' package.json pnpm-lock.yaml pnpm-workspace.yaml; do
  backup_once "$f"
done
while IFS= read -r f; do backup_once "$f"; done < <(find apps packages -type f -name 'tsconfig.tsbuildinfo' -print)
# Preserve the first-run pre-change archive on verification reruns.
touch .m11-scripts/prechange-backups.done

write_file() {
  local f="$1" temp
  mkdir -p "$(dirname "$f")"
  backup_once "$f"
  temp=$(mktemp "${f}.m11.XXXXXX")
  cat > "$temp"
  if [ -f "$f" ]; then chmod --reference="$f" "$temp"; else chmod 0644 "$temp"; fi
  mv -f -- "$temp" "$f"
}

printf '%s\n' '== M11: discovery =='
node <<'NODE'
const fs = require('fs');
const checks = [
  ['packages/db/src/schema.ts', ['applications', 'documents', 'sourceType'], 'db schema'],
  ['apps/api/src/server.ts', ['app.listen'], 'api server'],
  ['apps/api/src/env.ts', ['z.object'], 'env'],
  ['apps/api/src/session.ts', ['createSession', 'hashToken'], 'candidate session helpers'],
  ['apps/api/src/password.ts', ['hashPassword'], 'password helpers'],
  ['apps/api/src/routes/applications.ts', ['registerApplications'], 'applications routes'],
  ['apps/web/src/app/(app)/applications/[id]/page.tsx', ['Timeline'], 'application detail'],
  ['package.json', ['"scripts"'], 'root package'],
];
let warn = 0;
for (const [file, probes, what] of checks) {
  if (!fs.existsSync(file)) { console.log(`  WARN missing: ${file} (${what})`); warn++; continue; }
  const src = fs.readFileSync(file, 'utf8');
  const missing = probes.filter(p => !src.includes(p));
  if (missing.length) { console.log(`  WARN ${file} lacks: ${missing.join(', ')}`); warn++; }
  else console.log(`  OK ${file}`);
}
if (warn > 0) { console.error(`\n${warn} discovery warning(s) — refusing to continue.`); process.exit(1); }
NODE

printf '\n%s\n' '== M11.1: env (EMPLOYER_URL) =='
backup_once apps/api/src/env.ts
node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/env.ts';
let s = fs.readFileSync(file, 'utf8');
if (s.includes('EMPLOYER_URL')) { console.log('  env: EMPLOYER_URL already present'); process.exit(0); }
const anchor = /(ADMIN_URL:\s*z\.string\(\)[^\n]*,\s*)/;
if (!anchor.test(s)) { console.log('  WARN env.ts: ADMIN_URL anchor missing'); process.exit(1); }
s = s.replace(anchor, `$1
  EMPLOYER_URL: z.string().url().default('http://localhost:3002'),`);
fs.writeFileSync(file, s);
console.log('  env: EMPLOYER_URL added');
NODE

backup_once .env.example
node <<'NODE'
const fs = require('fs');
const file = '.env.example';
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
if (s.includes('EMPLOYER_URL=')) { console.log('  .env.example: EMPLOYER_URL already documented'); process.exit(0); }
const updated = s.replace('ADMIN_URL=http://localhost:3001\n', 'ADMIN_URL=http://localhost:3001\nEMPLOYER_URL=http://localhost:3002\n');
if (updated === s) { console.error('  FAIL .env.example: ADMIN_URL anchor missing'); process.exit(1); }
fs.writeFileSync(file, updated);
console.log('  .env.example: EMPLOYER_URL added');
NODE

printf '\n%s\n' '== M11.2: schema (employer_action enum + 3 tables) =='
backup_once packages/db/src/schema.ts
node <<'NODE'
const fs = require('fs');
const file = 'packages/db/src/schema.ts';
let s = fs.readFileSync(file, 'utf8');
let changed = false;

// Extend source_type enum with 'employer_action' if not present
if (!/sourceType\s*=\s*pgEnum\('source_type',\s*\[[^\]]*'employer_action'/.test(s)) {
  const enumStart = s.indexOf('export const sourceType');
  const open = s.indexOf('[', enumStart);
  const close = s.indexOf(']', open);
  if (enumStart < 0 || open < 0 || close < 0) { console.error('  FAIL sourceType enum anchor missing'); process.exit(1); }
  const vals = s.slice(open + 1, close).split(',').map(v => v.trim()).filter(Boolean);
  if (!vals.includes("'employer_action'")) vals.push("'employer_action'");
  s = s.slice(0, open + 1) + vals.join(',') + s.slice(close);
  changed = true;
}

if (!s.includes("pgTable('employer_users'")) {
  s += `

// M11: employer workspace — separate auth domain.
export const employerUsers = pgTable('employer_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  companyName: text('company_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
});

export const employerSessions = pgTable('employer_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerUserId: uuid('employer_user_id').notNull().references(() => employerUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index('employer_sessions_user_idx').on(t.employerUserId) }));

export const employerInvitations = pgTable('employer_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  employerEmail: text('employer_email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  employerUserId: uuid('employer_user_id').references(() => employerUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  appIdx: index('employer_inv_app_idx').on(t.applicationId),
  empIdx: index('employer_inv_emp_idx').on(t.employerUserId),
}));
`;
  changed = true;
}

if (changed) { fs.writeFileSync(file, s); console.log('  schema: employer_action enum + 3 tables applied'); }
else console.log('  schema: no changes needed');
NODE

printf '\n%s\n' '== M11.3: employer auth helpers + plugin =='
write_file apps/api/src/employerSession.ts <<'EOF'
import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db.js';
import { employerSessions, employerUsers } from '@careerflow/db';

const COOKIE_NAME = 'cf_employer_session';
const TTL_MS = 8 * 60 * 60 * 1000;

export function hashEmployerToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function createEmployerSession(employerUserId: string, userAgent: string | null): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await db.insert(employerSessions).values({
    employerUserId,
    tokenHash: hashEmployerToken(raw),
    userAgent,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return raw;
}

export async function destroyEmployerSession(raw: string): Promise<void> {
  await db.delete(employerSessions).where(eq(employerSessions.tokenHash, hashEmployerToken(raw)));
}

export async function findEmployerSession(raw: string) {
  const rows = await db
    .select({
      sessionId: employerSessions.id,
      employerUserId: employerUsers.id,
      email: employerUsers.email,
      companyName: employerUsers.companyName,
    })
    .from(employerSessions)
    .innerJoin(employerUsers, eq(employerUsers.id, employerSessions.employerUserId))
    .where(and(eq(employerSessions.tokenHash, hashEmployerToken(raw)), gt(employerSessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export const EMPLOYER_COOKIE = {
  name: COOKIE_NAME,
  ttlMs: TTL_MS,
  options(secure: boolean) {
    return { httpOnly: true, sameSite: 'strict' as const, secure, path: '/', maxAge: Math.floor(TTL_MS / 1000) };
  },
};
EOF

write_file apps/api/src/plugins/currentEmployer.ts <<'EOF'
import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { EMPLOYER_COOKIE, findEmployerSession } from '../employerSession.js';
import { env } from '../env.js';

function trustedEmployerOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.EMPLOYER_URL).origin; }
  catch { return false; }
}

export interface EmployerAuth {
  id: string;
  email: string;
  companyName: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    employer: EmployerAuth | null;
  }
}

export default fp(async (app) => {
  app.decorateRequest('employer', null);
  app.addHook('preHandler', async (req: FastifyRequest, reply) => {
    // Employer APIs are same-origin to the dedicated employer app, even for reads.
    if (!req.url.startsWith('/employer/')) return;
    if (!trustedEmployerOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    // Only decorate employer for /employer/* routes — never for candidate routes.
    const raw = req.cookies[EMPLOYER_COOKIE.name];
    if (!raw) return;
    const found = await findEmployerSession(raw);
    if (!found) return;
    req.employer = { id: found.employerUserId, email: found.email, companyName: found.companyName };
  });
});
EOF

printf '\n%s\n' '== M11.4: employer auth routes =='
write_file apps/api/src/routes/employerAuth.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { employerUsers, employerInvitations } from '@careerflow/db';
import { hashPassword, verifyPassword } from '../password.js';
import { EMPLOYER_COOKIE, createEmployerSession, destroyEmployerSession } from '../employerSession.js';
import { env } from '../env.js';

function hashInvitationToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function trustedEmployerOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.EMPLOYER_URL).origin; }
  catch { return false; }
}

const SignupInput = z.object({
  email: z.string().email().toLowerCase().max(254),
  password: z.string().min(10).max(200),
  companyName: z.string().trim().min(1).max(200),
  invitationToken: z.string().min(20).max(200),
});

const SigninInput = z.object({
  email: z.string().email().toLowerCase().max(254),
  password: z.string().min(1).max(200),
});

export async function registerEmployerAuth(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'POST' && !trustedEmployerOrigin(req.headers.origin)) {
      return reply.code(403).send({ error: 'invalid_origin' });
    }
  });
  // POST /employer/auth/signup — requires a valid, unused, unexpired invitation token.
  app.post('/signup', async (req, reply) => {
    const body = SignupInput.parse(req.body);
    const tokenHash = hashInvitationToken(body.invitationToken);
    const invitation = (await db.select().from(employerInvitations)
      .where(and(
        eq(employerInvitations.tokenHash, tokenHash),
        isNull(employerInvitations.usedAt),
        isNull(employerInvitations.revokedAt),
        gt(employerInvitations.expiresAt, new Date()),
      )).limit(1))[0];
    if (!invitation) return reply.code(400).send({ error: 'invalid_invitation' });
    if (invitation.employerEmail.toLowerCase() !== body.email.toLowerCase()) {
      return reply.code(400).send({ error: 'email_mismatch', message: 'Use the email address this invitation was sent to.' });
    }

    // Atomic: create employer + mark invitation used, all in one transaction
    let employerRow: { id: string; email: string; companyName: string | null } | undefined;
    try {
      await db.transaction(async (tx) => {
        const inserted = await tx.insert(employerUsers).values({
          email: body.email,
          passwordHash: await hashPassword(body.password),
          companyName: body.companyName,
        }).returning({ id: employerUsers.id, email: employerUsers.email, companyName: employerUsers.companyName });
        employerRow = inserted[0];
        if (!employerRow) throw new Error('employer_insert_failed');

        const claimed = await tx.update(employerInvitations).set({
          usedAt: new Date(),
          employerUserId: employerRow.id,
        }).where(and(
          eq(employerInvitations.id, invitation.id),
          isNull(employerInvitations.usedAt),
          isNull(employerInvitations.revokedAt),
          gt(employerInvitations.expiresAt, new Date()),
        )).returning({ id: employerInvitations.id });
        if (!claimed.length) throw new Error('invitation_already_used');
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'invitation_already_used') return reply.code(409).send({ error: 'invitation_already_used' });
      if (msg.includes('duplicate') || msg.includes('unique')) return reply.code(409).send({ error: 'employer_email_taken' });
      throw e;
    }

    const raw = await createEmployerSession(employerRow!.id, req.headers['user-agent'] ?? null);
    reply.setCookie(EMPLOYER_COOKIE.name, raw, EMPLOYER_COOKIE.options(env.NODE_ENV === 'production'));
    return { employer: employerRow };
  });

  app.post('/signin', async (req, reply) => {
    const body = SigninInput.parse(req.body);
    const rows = await db.select().from(employerUsers).where(eq(employerUsers.email, body.email)).limit(1);
    if (!rows[0] || !(await verifyPassword(body.password, rows[0].passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    await db.update(employerUsers).set({ lastSignInAt: new Date() }).where(eq(employerUsers.id, rows[0].id));
    const raw = await createEmployerSession(rows[0].id, req.headers['user-agent'] ?? null);
    reply.setCookie(EMPLOYER_COOKIE.name, raw, EMPLOYER_COOKIE.options(env.NODE_ENV === 'production'));
    return { employer: { id: rows[0].id, email: rows[0].email, companyName: rows[0].companyName } };
  });

  app.post('/signout', async (req, reply) => {
    const raw = req.cookies[EMPLOYER_COOKIE.name];
    if (raw) await destroyEmployerSession(raw);
    reply.clearCookie(EMPLOYER_COOKIE.name, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req, reply) => {
    if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
    return { employer: req.employer };
  });
}
EOF

printf '\n%s\n' '== M11.5: invitation preview + accept routes =='
write_file apps/api/src/routes/employerInvitations.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { employerInvitations, applications, opportunities } from '@careerflow/db';
import { env } from '../env.js';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function trustedEmployerOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.EMPLOYER_URL).origin; }
  catch { return false; }
}

const TokenInput = z.object({ token: z.string().min(20).max(200) });

export async function registerEmployerInvitations(app: FastifyInstance): Promise<void> {
  // The bearer token is accepted only in POST JSON bodies, never in a URL/path.
  app.post('/preview', async (req, reply) => {
    const parsed = TokenInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_token' });
    const tokenHash = hashToken(parsed.data.token);
    const rows = await db.select({
      employerEmail: employerInvitations.employerEmail,
      expiresAt: employerInvitations.expiresAt,
      usedAt: employerInvitations.usedAt,
      revokedAt: employerInvitations.revokedAt,
      opportunityTitle: opportunities.title,
      opportunityCompany: opportunities.company,
    }).from(employerInvitations)
      .leftJoin(applications, eq(applications.id, employerInvitations.applicationId))
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(employerInvitations.tokenHash, tokenHash))
      .limit(1);
    const inv = rows[0];
    if (!inv) return reply.code(404).send({ error: 'not_found' });
    if (inv.revokedAt) return reply.code(410).send({ error: 'revoked' });
    if (inv.usedAt) return reply.code(410).send({ error: 'already_used' });
    if (inv.expiresAt.getTime() <= Date.now()) return reply.code(410).send({ error: 'expired' });
    return { invitation: {
      employerEmail: inv.employerEmail,
      expiresAt: inv.expiresAt,
      opportunityTitle: inv.opportunityTitle,
      opportunityCompany: inv.opportunityCompany,
    } };
  });

  app.post('/accept', async (req, reply) => {
    if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
    if (!trustedEmployerOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    const parsed = TokenInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_token' });
    const rows = await db.select().from(employerInvitations)
      .where(eq(employerInvitations.tokenHash, hashToken(parsed.data.token))).limit(1);
    const inv = rows[0];
    if (!inv) return reply.code(404).send({ error: 'not_found' });
    if (inv.revokedAt) return reply.code(410).send({ error: 'revoked' });
    if (inv.expiresAt.getTime() <= Date.now()) return reply.code(410).send({ error: 'expired' });
    if (inv.employerEmail.toLowerCase() !== req.employer.email.toLowerCase()) {
      return reply.code(403).send({ error: 'invited_email_mismatch' });
    }
    if (inv.employerUserId && inv.employerUserId !== req.employer.id) {
      return reply.code(409).send({ error: 'belongs_to_other_employer' });
    }
    if (!inv.employerUserId) {
      const claimed = await db.update(employerInvitations).set({
        employerUserId: req.employer.id,
        usedAt: inv.usedAt ?? new Date(),
      }).where(and(
        eq(employerInvitations.id, inv.id),
        isNull(employerInvitations.employerUserId),
        isNull(employerInvitations.usedAt),
        isNull(employerInvitations.revokedAt),
        gt(employerInvitations.expiresAt, new Date()),
      )).returning({ id: employerInvitations.id });
      if (!claimed.length) return reply.code(404).send({ error: 'not_found' });
    }
    return { ok: true, applicationId: inv.applicationId };
  });
}
EOF

printf '\n%s\n' '== M11.6: employer projection routes =='
write_file apps/api/src/routes/employerApplications.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, gt } from 'drizzle-orm';
import { db } from '../db.js';
import {
  employerInvitations, applications, opportunities,
  documents, documentVersions, applicationRequirements, requirementEvidenceLinks, applicationEvents,
} from '@careerflow/db';

function whitelistProvenance(value: unknown): { sourceType: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((claim): { sourceType: string }[] => {
    if (!claim || typeof claim !== 'object') return [];
    const sourceType = (claim as { sourceType?: unknown }).sourceType;
    return typeof sourceType === 'string' ? [{ sourceType }] : [];
  });
}

async function authorizedApplicationIds(employerId: string): Promise<string[]> {
  const rows = await db.select({ applicationId: employerInvitations.applicationId }).from(employerInvitations)
    .where(and(
      eq(employerInvitations.employerUserId, employerId),
      isNull(employerInvitations.revokedAt),
      gt(employerInvitations.expiresAt, new Date()),
    ));
  return [...new Set(rows.map(r => r.applicationId))];
}

export async function registerEmployerApplications(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req) => {
    const ids = await authorizedApplicationIds(req.employer!.id);
    if (!ids.length) return { applications: [] };
    const rows = await db.select({
      applicationId: applications.id,
      stage: applications.stage,
      opportunityTitle: opportunities.title,
      opportunityCompany: opportunities.company,
    }).from(applications)
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(inArray(applications.id, ids));
    return { applications: rows };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ids = await authorizedApplicationIds(req.employer!.id);
    if (!ids.includes(id)) return reply.code(404).send({ error: 'not_found' });

    const appRows = await db.select({
      id: applications.id,
      stage: applications.stage,
      submissionRecordedAt: applications.submissionRecordedAt,
      nextAction: applications.nextAction,
      dueDate: applications.dueDate,
      opportunityTitle: opportunities.title,
      opportunityCompany: opportunities.company,
      opportunityLocation: opportunities.location,
      opportunityArrangement: opportunities.arrangement,
    }).from(applications)
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(applications.id, id)).limit(1);
    const appRow = appRows[0];
    if (!appRow) return reply.code(404).send({ error: 'not_found' });

    // Only documents attached to this application; expose the latest version and approved fields.
    const docs = await db.select({
      id: documents.id,
      kind: documents.kind,
      title: documents.title,
    }).from(documents).where(eq(documents.applicationId, id));
    const docIds = docs.map(d => d.id);
    const versions = docIds.length
      ? await db.select({
          documentId: documentVersions.documentId,
          content: documentVersions.content,
          provenance: documentVersions.provenance,
          createdAt: documentVersions.createdAt,
        }).from(documentVersions)
          .where(inArray(documentVersions.documentId, docIds))
          .orderBy(desc(documentVersions.createdAt))
      : [];
    const latestByDocument = new Map<string, typeof versions[number]>();
    for (const version of versions) if (!latestByDocument.has(version.documentId)) latestByDocument.set(version.documentId, version);

    // Only requirements and evidence links explicitly confirmed as linked; never phrase matches/details.
    const appReqs = await db.select({
      text: applicationRequirements.text,
      position: applicationRequirements.position,
      id: applicationRequirements.id,
    }).from(applicationRequirements).where(eq(applicationRequirements.applicationId, id));
    const reqIds = appReqs.map(r => r.id);
    const links = reqIds.length
      ? await db.select({
          requirementId: requirementEvidenceLinks.requirementId,
          state: requirementEvidenceLinks.state,
          linkedAt: requirementEvidenceLinks.linkedAt,
          confirmedAt: requirementEvidenceLinks.confirmedAt,
        }).from(requirementEvidenceLinks).where(and(
          inArray(requirementEvidenceLinks.requirementId, reqIds),
          eq(requirementEvidenceLinks.state, 'linked'),
        ))
      : [];

    await db.insert(applicationEvents).values({
      applicationId: id,
      kind: 'note',
      occurredAt: new Date(),
      note: 'Employer viewed your application',
      sourceType: 'employer_action',
      createdBy: null,
    });

    return {
      application: appRow,
      documents: docs.map(d => {
        const latest = latestByDocument.get(d.id);
        return {
          kind: d.kind,
          title: d.title,
          content: latest?.content ?? null,
          provenance: whitelistProvenance(latest?.provenance),
        };
      }),
      requirements: appReqs.map(r => ({
        text: r.text,
        position: r.position,
        linkedEvidence: links.filter(l => l.requirementId === r.id).map(l => ({
          state: l.state,
          linkedAt: l.linkedAt,
          confirmedAt: l.confirmedAt,
        })),
      })),
    };
  });
}
EOF

printf '\n%s\n' '== M11.7: candidate invitation routes =='
write_file apps/api/src/routes/applicationInvitations.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull, desc } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { applications, workspaces, employerInvitations } from '@careerflow/db';
import { sendEmail, emailConfigured } from '../email.js';
import { env } from '../env.js';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function trustedCandidateOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.APP_URL).origin; }
  catch { return false; }
}

const CreateInput = z.object({
  employerEmail: z.string().email().toLowerCase().max(254),
});

async function ownsApplication(appId: string, userId: string) {
  const rows = await db.select({ id: applications.id, workspaceId: applications.workspaceId })
    .from(applications).where(eq(applications.id, appId)).limit(1);
  if (!rows[0]) return null;
  const ws = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, rows[0].workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return ws[0] ? rows[0] : null;
}

export async function registerApplicationInvitations(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/:applicationId/invitations', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    if (!(await ownsApplication(applicationId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select({
      id: employerInvitations.id,
      employerEmail: employerInvitations.employerEmail,
      expiresAt: employerInvitations.expiresAt,
      usedAt: employerInvitations.usedAt,
      revokedAt: employerInvitations.revokedAt,
      createdAt: employerInvitations.createdAt,
    }).from(employerInvitations)
      .where(eq(employerInvitations.applicationId, applicationId))
      .orderBy(desc(employerInvitations.createdAt));
    return { invitations: rows };
  });

  app.post('/:applicationId/invitations', async (req, reply) => {
    if (!trustedCandidateOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    const { applicationId } = req.params as { applicationId: string };
    if (!(await ownsApplication(applicationId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateInput.parse(req.body);

    // Only one active invitation per (application, email)
    const existing = await db.select({ id: employerInvitations.id }).from(employerInvitations)
      .where(and(
        eq(employerInvitations.applicationId, applicationId),
        eq(employerInvitations.employerEmail, body.employerEmail),
        isNull(employerInvitations.revokedAt),
        isNull(employerInvitations.usedAt),
        gt(employerInvitations.expiresAt, new Date()),
      )).limit(1);
    if (existing[0]) return reply.code(409).send({ error: 'invitation_already_pending' });

    const raw = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const row = (await db.insert(employerInvitations).values({
      applicationId,
      employerEmail: body.employerEmail,
      tokenHash,
      expiresAt,
    }).returning({ id: employerInvitations.id, expiresAt: employerInvitations.expiresAt }))[0]!;

    const acceptUrl = `${env.EMPLOYER_URL}/accept#token=${encodeURIComponent(raw)}`;
    let emailResult: { ok: boolean; error?: string } = { ok: false, error: 'email_not_configured' };
    if (emailConfigured()) {
      emailResult = await sendEmail(
        body.employerEmail,
        'A candidate has invited you to review their CareerFlow application',
        `A candidate has invited you to review their application materials.\n\nOpen: ${acceptUrl}\n\nThis link expires ${expiresAt.toUTCString()} and can be used once.`,
      );
    }

    return reply.code(201).send({
      invitation: row,
      // In dev without email, return the URL so the candidate can copy/share it.
      ...(emailConfigured() ? {} : { invitationUrl: acceptUrl }),
      emailResult,
    });
  });

  app.delete('/:applicationId/invitations/:invitationId', async (req, reply) => {
    if (!trustedCandidateOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    const { applicationId, invitationId } = req.params as { applicationId: string; invitationId: string };
    if (!(await ownsApplication(applicationId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.update(employerInvitations).set({ revokedAt: new Date() })
      .where(and(
        eq(employerInvitations.id, invitationId),
        eq(employerInvitations.applicationId, applicationId),
        isNull(employerInvitations.revokedAt),
      )).returning({ id: employerInvitations.id });
    if (!rows.length) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });
}
EOF

printf '\n%s\n' '== M11.8: register routes + CORS + currentEmployer plugin =='
backup_once apps/api/src/server.ts
node <<'NODE'
const fs = require('fs');
const file = 'apps/api/src/server.ts';
let s = fs.readFileSync(file, 'utf8');
if (s.includes('registerEmployerAuth')) { console.log('  server.ts: already has employer routes'); process.exit(0); }

// add imports
const lines = s.split('\n'); let last = -1;
for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
if (last < 0) { console.log('  WARN no import anchor'); process.exit(1); }
lines.splice(last + 1, 0,
  "import attachCurrentEmployer from './plugins/currentEmployer.js';",
  "import { registerEmployerAuth } from './routes/employerAuth.js';",
  "import { registerEmployerInvitations } from './routes/employerInvitations.js';",
  "import { registerEmployerApplications } from './routes/employerApplications.js';",
  "import { registerApplicationInvitations } from './routes/applicationInvitations.js';",
);
s = lines.join('\n');

// attach plugin (after attachCurrentUser)
const attachAnchor = 'await app.register(attachCurrentUser);';
if (!s.includes(attachAnchor)) { console.log('  WARN attachCurrentUser anchor missing'); process.exit(1); }
s = s.replace(attachAnchor, attachAnchor + '\nawait app.register(attachCurrentEmployer);');

// CORS: add EMPLOYER_URL, and fail if the expected candidate/admin origin list changed.
const corsAnchor = /origin:\s*\[env\.APP_URL,\s*env\.ADMIN_URL(?:,\s*env\.EMPLOYER_URL)?\]/;
if (!corsAnchor.test(s)) { console.error('  FAIL server.ts: CORS origin anchor missing'); process.exit(1); }
s = s.replace(corsAnchor, 'origin: [env.APP_URL, env.ADMIN_URL, env.EMPLOYER_URL]');

// register routes before listen
const pos = s.indexOf('await app.listen(');
if (pos < 0) { console.log('  WARN no app.listen anchor'); process.exit(1); }
const reg = `await app.register(registerEmployerAuth, { prefix: '/employer/auth' });
await app.register(registerEmployerInvitations, { prefix: '/employer/invitations' });
await app.register(registerEmployerApplications, { prefix: '/employer/applications' });
await app.register(registerApplicationInvitations, { prefix: '/applications' });
app.get('/employer/me', async (req, reply) => {
  if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
  return { employer: req.employer };
});

`;
s = s.slice(0, pos) + reg + s.slice(pos);
fs.writeFileSync(file, s);
console.log('  server.ts: employer routes + CORS updated');
NODE

printf '\n%s\n' '== M11.9: employer web app =='
mkdir -p apps/employer/src/lib apps/employer/src/app/login apps/employer/src/app/accept apps/employer/src/app/applications

write_file apps/employer/package.json <<'EOF'
{
  "name": "@careerflow/employer",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.9.3"
  }
}
EOF

write_file apps/employer/next.config.mjs <<'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'no-store' },
    ] }];
  },
};
export default nextConfig;
EOF

write_file apps/employer/tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false, "skipLibCheck": true, "strict": true, "noEmit": true,
    "esModuleInterop": true, "module": "esnext", "moduleResolution": "bundler",
    "resolveJsonModule": true, "isolatedModules": true, "jsx": "preserve",
    "incremental": true, "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
EOF

write_file apps/employer/next-env.d.ts <<'EOF'
/// <reference types="next" />
/// <reference types="next/image-types/global" />
EOF

write_file apps/employer/src/lib/api.ts <<'EOF'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
EOF

write_file apps/employer/src/app/layout.tsx <<'EOF'
export const metadata = { title: 'CareerFlow for Employers' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', background: '#0b1f3a', color: 'white', margin: 0, padding: 0, minHeight: '100vh' }}>
        <nav style={{ padding: '12px 24px', borderBottom: '1px solid #1e3a5f', display: 'flex', gap: 16, alignItems: 'center' }}>
          <strong>CareerFlow for Employers</strong>
          <a href="/login" style={{ color: '#94a3b8', textDecoration: 'none', marginInlineStart: 'auto' }}>Sign in</a>
        </nav>
        <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
EOF

write_file apps/employer/src/app/page.tsx <<'EOF'
export default function EmployerHome() {
  return (
    <div>
      <h1>CareerFlow for Employers</h1>
      <p style={{ color: '#94a3b8' }}>Employers receive applications by invitation from candidates. If you received an invitation link, use the link in that email to sign up and view the application.</p>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>There is no candidate search here, and no candidate data is visible unless the candidate invited you to review a specific application.</p>
      <a href="/login" style={{ color: '#3ddc97' }}>Sign in to your account</a>
    </div>
  );
}
EOF

write_file apps/employer/src/app/login/page.tsx <<'EOF'
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function EmployerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await apiFetch('/employer/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/applications');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign in failed');
    } finally { setBusy(false); }
  }

  return (
    <section style={{ maxWidth: 440, margin: '40px auto', background: '#1e3a5f', padding: 24, borderRadius: 8 }}>
      <h1 style={{ marginBlockStart: 0 }}>Employer sign in</h1>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>New here? You need an invitation link from a candidate to create an account. Check the email you received.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></label>
        <label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label>
        {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
        <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section>
  );
}
const inputStyle = { display: 'block', boxSizing: 'border-box' as const, width: '100%', padding: 10, marginBlockStart: 4, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' };
const buttonStyle = { background: '#3ddc97', color: '#0b1f3a', border: 0, padding: 10, borderRadius: 6, fontWeight: 700, cursor: 'pointer' };
EOF

write_file apps/employer/src/app/accept/page.tsx <<'EOF'
'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Preview {
  employerEmail: string;
  expiresAt: string;
  opportunityTitle: string | null;
  opportunityCompany: string | null;
}

export default function AcceptInvitation() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hasEmployerSession, setHasEmployerSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const storedTokenKey = 'cf_m11_invitation_token';
    const fragmentToken = fragment.get('token') ?? '';
    // React Strict Mode replays effects in development; retain the fragment only in same-tab storage.
    if (fragmentToken) window.sessionStorage.setItem(storedTokenKey, fragmentToken);
    const invitationToken = fragmentToken || window.sessionStorage.getItem(storedTokenKey) || '';
    // Fragments are excluded from HTTP requests/referrers; remove from history promptly after hydration.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setToken(invitationToken);
    if (!invitationToken) { setPreviewError('No invitation token provided.'); return; }
    (async () => {
      try {
        const res = await apiFetch<{ invitation: Preview }>('/employer/invitations/preview', {
          method: 'POST', body: JSON.stringify({ token: invitationToken }),
        });
        setPreview(res.invitation);
        try { await apiFetch('/employer/me'); setHasEmployerSession(true); }
        catch { setHasEmployerSession(false); }
        finally { setSessionChecked(true); }
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : 'This invitation link is invalid or expired.');
      }
    })();
  }, []);

  async function acceptAndOpen() {
    const accept = await apiFetch<{ applicationId: string }>('/employer/invitations/accept', {
      method: 'POST', body: JSON.stringify({ token }),
    });
    window.sessionStorage.removeItem('cf_m11_invitation_token');
    router.push(`/applications/${accept.applicationId}`);
  }

  async function signup(e: FormEvent) {
    e.preventDefault();
    if (!preview || !token) return;
    setBusy(true); setErr('');
    try {
      await apiFetch('/employer/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email: preview.employerEmail, password, companyName, invitationToken: token }),
      });
      await acceptAndOpen();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Signup failed');
    } finally { setBusy(false); }
  }

  async function acceptExisting() {
    if (!token) return;
    setBusy(true); setErr('');
    try { await acceptAndOpen(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Invitation acceptance failed'); }
    finally { setBusy(false); }
  }

  async function switchEmployerAccount() {
    setBusy(true); setErr('');
    try { await apiFetch('/employer/auth/signout', { method: 'POST' }); setHasEmployerSession(false); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Sign out failed'); }
    finally { setBusy(false); }
  }

  if (previewError) return <div style={{ background: '#7f1d1d', padding: 20, borderRadius: 8 }}><h2>Invitation unavailable</h2><p>{previewError}</p></div>;
  if (!preview || !sessionChecked) return <p>Loading invitation…</p>;

  return (
    <section style={{ maxWidth: 480, margin: '40px auto', background: '#1e3a5f', padding: 24, borderRadius: 8 }}>
      <h1 style={{ marginBlockStart: 0 }}>Accept invitation</h1>
      <p style={{ color: '#94a3b8', fontSize: 13 }}>
        You've been invited to review an application {preview.opportunityTitle ? `for ${preview.opportunityTitle}` : ''}
        {preview.opportunityCompany ? ` at ${preview.opportunityCompany}` : ''}.
        Expires {new Date(preview.expiresAt).toLocaleString()}.
      </p>
      {hasEmployerSession ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <p>You are signed in. Accept this invitation with the account matching <strong>{preview.employerEmail}</strong>.</p>
          {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
          <button type="button" onClick={acceptExisting} disabled={busy} style={buttonStyle}>{busy ? 'Accepting…' : 'Accept invitation'}</button>
          <button type="button" onClick={switchEmployerAccount} disabled={busy} style={{ ...buttonStyle, background: '#475569', color: 'white' }}>Signed in to a different account? Sign out</button>
        </div>
      ) : (
        <>
          <form onSubmit={signup} style={{ display: 'grid', gap: 12 }}>
            <label>Email<input type="email" value={preview.employerEmail} disabled style={inputStyle} /></label>
            <label>Company name<input value={companyName} onChange={e => setCompanyName(e.target.value)} required maxLength={200} style={inputStyle} /></label>
            <label>Password (min 10)<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} style={inputStyle} /></label>
            {err && <p role="alert" style={{ color: '#fca5a5' }}>{err}</p>}
            <button type="submit" disabled={busy} style={buttonStyle}>{busy ? 'Creating account…' : 'Create employer account'}</button>
          </form>
          <p style={{ color: '#94a3b8', fontSize: 12, marginBlockStart: 12 }}>Already have an employer account? <a href="/login" style={{ color: '#3ddc97' }}>Sign in first</a>, then reopen this invitation link.</p>
        </>
      )}
    </section>
  );
}
const inputStyle = { display: 'block', boxSizing: 'border-box' as const, width: '100%', padding: 10, marginBlockStart: 4, borderRadius: 6, border: '1px solid #475569', background: '#0b1f3a', color: 'white' };
const buttonStyle = { background: '#3ddc97', color: '#0b1f3a', border: 0, padding: 10, borderRadius: 6, fontWeight: 700, cursor: 'pointer' };
EOF

write_file apps/employer/src/app/applications/page.tsx <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Application {
  applicationId: string;
  stage: string;
  opportunityTitle: string | null;
  opportunityCompany: string | null;
}

export default function ApplicationsList() {
  const [apps, setApps] = useState<Application[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ applications: Application[] }>('/employer/applications');
        setApps(res.applications);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load applications');
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: '#fca5a5' }}>{err}</p>;
  if (!apps.length) return <p style={{ color: '#94a3b8' }}>No invitations yet. When a candidate invites you, the application will appear here.</p>;

  return (
    <div>
      <h1>Applications you're invited to review</h1>
      <div style={{ display: 'grid', gap: 10, marginBlockStart: 16 }}>
        {apps.map(a => (
          <div key={a.applicationId} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
            <strong>{a.opportunityTitle ?? 'Untitled role'}</strong>
            <div style={{ color: '#94a3b8', fontSize: 13 }}>{a.opportunityCompany ?? 'Unknown company'} · Stage: {a.stage}</div>
            <Link href={`/applications/${a.applicationId}`} style={{ color: '#3ddc97', fontSize: 13 }}>View application</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
EOF

write_file apps/employer/src/app/applications/[id]/page.tsx <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Projection {
  application: {
    id: string; stage: string; submissionRecordedAt: string | null;
    nextAction: string | null; dueDate: string | null;
    opportunityTitle: string | null; opportunityCompany: string | null;
    opportunityLocation: string | null; opportunityArrangement: string | null;
  };
  documents: { id: string; kind: string; title: string; createdAt: string; versions: { content: string; provenance: any[]; createdAt: string }[] }[];
  requirements: { id: string; text: string; position: number; linkedEvidence: { state: string; linkedAt: string; confirmedAt: string | null }[] }[];
}

export default function ProjectionView() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Projection | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<Projection>(`/employer/applications/${params.id}`);
        setData(res);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Application not accessible');
      } finally { setLoading(false); }
    })();
  }, [params.id]);

  if (loading) return <p>Loading…</p>;
  if (err) return <div style={{ background: '#7f1d1d', padding: 20, borderRadius: 8 }}><h2>Not accessible</h2><p>{err}</p></div>;
  if (!data) return null;

  return (
    <div>
      <h1>{data.application.opportunityTitle ?? 'Untitled role'}</h1>
      <p style={{ color: '#94a3b8' }}>{data.application.opportunityCompany} · Stage: {data.application.stage}
        {data.application.opportunityLocation ? ` · ${data.application.opportunityLocation}` : ''}
        {data.application.opportunityArrangement ? ` · ${data.application.opportunityArrangement}` : ''}</p>

      <h2>Documents</h2>
      {data.documents.length === 0 ? <p style={{ color: '#94a3b8' }}>No documents attached to this application.</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.documents.map(d => (
            <div key={d.id} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
              <strong>{d.title}</strong> <span style={{ color: '#94a3b8', fontSize: 12 }}>({d.kind})</span>
              {d.versions.slice(0, 1).map((v, i) => (
                <pre key={i} style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#0b1f3a', padding: 10, borderRadius: 4, marginBlockStart: 8, fontSize: 13 }}>{v.content}</pre>
              ))}
            </div>
          ))}
        </div>
      )}

      <h2>Requirements the candidate linked evidence to</h2>
      {data.requirements.filter(r => r.linkedEvidence.length).length === 0 ? <p style={{ color: '#94a3b8' }}>No requirement-to-evidence links confirmed by the candidate.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.requirements.filter(r => r.linkedEvidence.length).map(r => (
            <div key={r.id} style={{ background: '#1e3a5f', padding: 12, borderRadius: 6 }}>
              <div>{r.text}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBlockStart: 4 }}>Evidence linked {new Date(r.linkedEvidence[0]!.linkedAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
EOF

printf '\n%s\n' '== M11.10: candidate UI (invite button on application detail) =='
mkdir -p "apps/web/src/app/(app)/applications/[id]"
write_file "apps/web/src/app/(app)/applications/[id]/InviteEmployer.tsx" <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Invitation {
  id: string;
  employerEmail: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function InviteEmployer({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch<{ invitations: Invitation[] }>(`/applications/${applicationId}/invitations`);
      setInvitations(res.invitations);
    } catch {}
  }
  useEffect(() => { void load(); }, [applicationId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setMsg(''); setDevUrl(null);
    try {
      const res = await apiFetch<{ invitationUrl?: string }>(`/applications/${applicationId}/invitations`, {
        method: 'POST', body: JSON.stringify({ employerEmail: email }),
      });
      setMsg('Invitation created.'); setEmail('');
      if (res.invitationUrl) setDevUrl(res.invitationUrl);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Invite failed'); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    try {
      await apiFetch(`/applications/${applicationId}/invitations/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Revoke failed'); }
  }

  return (
    <div className="card">
      <h3 style={{ marginBlockStart: 0 }}>Invite employer to review this application</h3>
      <p className="muted" style={{ fontSize: 13 }}>The employer will see only this application's attached documents and the requirements where you have confirmed evidence. They will not see your profile, other applications, your evidence library, or your email address.</p>
      <form onSubmit={invite} style={{ display: 'flex', gap: 8, marginBlockEnd: 12 }}>
        <input type="email" required placeholder="employer@company.com" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        <button className="btn btn-mint" type="submit" disabled={busy || !email.trim()}>{busy ? 'Inviting…' : 'Invite'}</button>
      </form>
      {msg && <p role="status" style={{ color: 'green', fontSize: 13 }}>{msg}</p>}
      {devUrl && <p style={{ fontSize: 13, background: '#fef3c7', padding: 8, borderRadius: 6, wordBreak: 'break-all' }}><strong>Dev only</strong> (email disabled): copy this link and share it manually — <code>{devUrl}</code></p>}
      {err && <p className="err">{err}</p>}
      {invitations.length > 0 && (
        <div style={{ marginBlockStart: 12 }}>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Invitations for this application:</p>
          <ul style={{ paddingInlineStart: 20, fontSize: 13, margin: '4px 0 0' }}>
            {invitations.map(i => (
              <li key={i.id}>
                {i.employerEmail} — {i.revokedAt ? 'revoked' : i.usedAt ? 'accepted' : 'pending'}
                {!i.revokedAt && !i.usedAt && <> (<button onClick={() => revoke(i.id)} style={{ background: 'none', border: 0, color: 'var(--coral)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>revoke</button>)</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
EOF

backup_once "apps/web/src/app/(app)/applications/[id]/page.tsx"
node <<'NODE'
const fs = require('fs');
const file = 'apps/web/src/app/(app)/applications/[id]/page.tsx';
if (!fs.existsSync(file)) { console.log('  WARN application detail missing'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
if (s.includes('InviteEmployer')) { console.log('  application detail: already has InviteEmployer'); process.exit(0); }
const lines = s.split('\n'); let last = -1;
for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
if (last < 0) { console.log('  WARN no import anchor'); process.exit(0); }
lines.splice(last + 1, 0, "import InviteEmployer from './InviteEmployer';");
s = lines.join('\n');
// The current page has a section-based Timeline; fail if its known anchor changes.
const anchor = '<section className="card" aria-labelledby="timeline-heading"';
if (!s.includes(anchor)) { console.error('  FAIL application detail: timeline section anchor missing'); process.exit(1); }
s = s.replace(anchor, '<InviteEmployer applicationId={data.application.id} />\n      ' + anchor);
fs.writeFileSync(file, s);
console.log('  application detail: InviteEmployer mounted');
NODE

printf '\n%s\n' '== M11.11: root scripts + install =='
backup_once package.json
node <<'NODE'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts ||= {};
if (!pkg.scripts['dev:employer']) pkg.scripts['dev:employer'] = 'pnpm --filter @careerflow/employer dev';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('  root package.json: dev:employer added');
NODE

printf '\n%s\n' '== M11.12: offline install + typecheck =='
backup_once pnpm-lock.yaml
pnpm install --offline --ignore-scripts --lockfile=false
while IFS= read -r f; do backup_once "$f"; done < <(find apps packages -type f -name 'tsconfig.tsbuildinfo' -print)
pnpm -r typecheck
printf '  typecheck OK\n'

printf '\n%s\n' '== M11.13: database baseline (row counts only) =='
node <<'NODE'
const path = require('node:path');
const fs = require('node:fs');
const appDir = path.join(process.cwd(), 'apps/api');
const { Client } = require(require.resolve('pg', { paths: [appDir] }));
const dotenv = require(require.resolve('dotenv', { paths: [appDir] }));
const envFile = path.join(process.cwd(), '.env');
const envVars = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
const url = process.env.DATABASE_URL || envVars.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL unavailable; refusing to change database.');
(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const tables = await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const counts = {};
    for (const { tablename } of tables.rows) {
      const safe = tablename.replaceAll('"', '""');
      const r = await c.query(`SELECT count(*)::bigint AS n FROM public."${safe}"`);
      counts[tablename] = Number(r.rows[0].n);
    }
    fs.mkdirSync('.m11-backups', { recursive: true });
    fs.writeFileSync('.m11-backups/database-baseline.json', JSON.stringify({ capturedAt: new Date().toISOString(), counts }, null, 2) + '\n');
    console.log(`  PASS: baseline recorded for ${Object.keys(counts).length} existing public tables`);
  } finally { await c.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
NODE

printf '\n%s\n' '== M11.14: db:push (additive schema only) =='
pnpm db:push

printf '\n%s\n' '== M11.14: FK verification (raw SQL) =='
node <<'NODE'
const path = require('node:path');
const fs = require('node:fs');
const appDir = path.join(process.cwd(), 'apps/api');
const { Client } = require(require.resolve('pg', { paths: [appDir] }));
const dotenv = require(require.resolve('dotenv', { paths: [appDir] }));
const envFile = path.join(process.cwd(), '.env');
const envVars = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
const url = process.env.DATABASE_URL || envVars.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL unavailable; refusing to skip M11 verification.');
(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const checks = [
    ['employer_sessions', 'employer_users'],
    ['employer_invitations', 'applications'],
    ['employer_invitations', 'employer_users'],
  ];
  let failed = false;
  for (const [table, ref] of checks) {
    const r = await c.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE contype = 'f' AND conrelid = $1::regclass AND confrelid = $2::regclass
    `, [table, ref]);
    if (!r.rows[0]) { console.log(`  FAIL: ${table} has no FK to ${ref}`); failed = true; continue; }
    const t = r.rows[0].confdeltype;
    if (t !== 'c' && t !== 'n') { console.log(`  FAIL: ${table} → ${ref} confdeltype=${t}`); failed = true; }
    else console.log(`  PASS: ${table} → ${ref} (${t === 'c' ? 'cascade' : 'set null'})`);
  }
  // source_type enum has employer_action?
  const enumCheck = await c.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid = 'source_type'::regtype AND enumlabel = 'employer_action'`);
  if (!enumCheck.rows[0]) { console.log('  FAIL: source_type enum missing employer_action'); failed = true; }
  else console.log('  PASS: source_type includes employer_action');
  await c.end();
  if (failed) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
NODE

printf '\n%s\n' '== M11: start/check local API for the mandatory E2E gate =='
M11_API_URL="${API_URL:-http://localhost:4000}"
case "$M11_API_URL" in http://localhost:*|http://127.0.0.1:*|http://\[::1\]:*) ;; *) echo 'FAIL: M11 API URL must be local.'; exit 1 ;; esac
export API_URL="$M11_API_URL"
if curl -fsS "$M11_API_URL/health" >/dev/null 2>&1; then
  if [ ! -s .m11-scripts/api.pid ] || ! kill -0 "$(cat .m11-scripts/api.pid)" 2>/dev/null; then
    echo 'FAIL: an unverified API is already running; refusing to risk external email/provider calls.'
    exit 1
  fi
else
  EMAIL_ENABLED=false PAYMENT_PROVIDER=none API_URL="$M11_API_URL" nohup pnpm --filter @careerflow/api dev >/tmp/careerflow-m11-api.log 2>&1 </dev/null &
  echo "$!" > .m11-scripts/api.pid
  api_ready=0
  for _ in $(seq 1 60); do
    if curl -fsS "$M11_API_URL/health" >/dev/null 2>&1; then api_ready=1; break; fi
    sleep 1
  done
  if [ "$api_ready" -ne 1 ]; then
    echo 'FAIL: local API did not become healthy; details remain in /tmp/careerflow-m11-api.log.'
    exit 1
  fi
fi
printf '  PASS: local API health is ready at configured API URL\n'

printf '\n%s\n' '== M11.15: E2E isolation gate (7 checks) =='
E2E_STATUS=0
node <<'NODE' || E2E_STATUS=$?
const API = process.env.API_URL || 'http://localhost:4000';
const path = require('node:path');
const fs = require('node:fs');
const appDir = path.join(process.cwd(), 'apps/api');
const { Client } = require(require.resolve('pg', { paths: [appDir] }));
const dotenv = require(require.resolve('dotenv', { paths: [appDir] }));
const envFile = path.join(process.cwd(), '.env');
const envVars = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
const url = process.env.DATABASE_URL || envVars.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL unavailable; refusing to skip M11 verification.');
const assert = (c, m) => { if (!c) throw new Error(`FAIL ${m}`); console.log(`  PASS ${m}`); };

async function req(path, { method = 'GET', cookies = {}, body } = {}) {
  const employerOrigin = process.env.EMPLOYER_URL || envVars.EMPLOYER_URL || 'http://localhost:3002';
  const candidateOrigin = process.env.APP_URL || envVars.APP_URL || 'http://localhost:3000';
  const headers = {
    origin: new URL(path.startsWith('/employer') ? employerOrigin : candidateOrigin).origin,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const ck = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (ck) headers.cookie = ck;
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { res, json: async () => { try { return await res.json(); } catch { return {}; } } };
}
function pickCookie(res, name) {
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(new RegExp(`${name}=([^;]+)`));
  return m ? m[1] : '';
}

(async () => {
  try {
    const health = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`API health returned HTTP ${health.status}; E2E gate cannot be skipped.`);
  } catch (e) { throw new Error(`API unreachable; E2E gate cannot be skipped: ${e.message}`); }

  const accounts = [];
  let candidateUserId = null, employerAId = null, employerBId = null, applicationId = null, invitationId = null, invitationToken = null;
  let opportunitySourceIds = [], opportunityIds = [], applicationIds = [], workspaceIds = [];
  let documentIds = [], documentVersionIds = [], evidenceIds = [], requirementIds = [];
  let workspaceId = null;
  let candidateEmail = null, employerAEmail = null, employerBEmail = null;
  const db = new Client({ connectionString: url });
  await db.connect();
  let cleanupFailed = false;
  try {
    // Synthetic candidate and application fixture.
    candidateEmail = `m11-cand-${Date.now()}@test.local`;
    const candidatePw = 'candidate-m11-pass-12345';
    const c1 = await req('/auth/signup', { method: 'POST', body: { email: candidateEmail, password: candidatePw } });
    assert(c1.res.status === 200, 'candidate account created');
    const candidateCookie = pickCookie(c1.res, 'cf_session');
    candidateUserId = (await c1.json()).user.id;
    accounts.push({ type: 'candidate', email: candidateEmail, cookie: candidateCookie, password: candidatePw });

    // Create workspace
    const wsCreated = await req('/workspaces', { method: 'POST', cookies: { cf_session: candidateCookie }, body: { name: 'M11 Ws', kind: 'personal' } });
    assert(wsCreated.res.status === 201, 'synthetic workspace created');
    const ws = await req('/workspaces', { cookies: { cf_session: candidateCookie } });
    assert(ws.res.status === 200, 'synthetic workspace readable');
    workspaceId = (await ws.json()).workspaces[0].id;
    workspaceIds.push(workspaceId);
    const wsId = workspaceId;

    // Create opportunity, then application
    const op = await req('/opportunities', { method: 'POST', cookies: { cf_session: candidateCookie }, body: {
      title: 'M11 Senior Role', company: 'Test Co', description: 'Test', sourceKind: 'manual', requirementLines: ['Must have X'],
    }});
    assert(op.res.status === 201, 'opportunity created');
    const opportunity = (await op.json()).opportunity;
    const oppId = opportunity.id;
    opportunityIds.push(oppId);
    opportunitySourceIds.push(opportunity.sourceId);

    const appRes = await req(`/applications/by-workspace/${wsId}`, { method: 'POST', cookies: { cf_session: candidateCookie }, body: { opportunityId: oppId } });
    assert(appRes.res.status === 201, 'application created');
    applicationId = (await appRes.json()).application.id;
    applicationIds.push(applicationId);

    // Create a document attached to the application
    const docRes = await req(`/documents/by-workspace/${wsId}`, { method: 'POST', cookies: { cf_session: candidateCookie }, body: {
      kind: 'cv', title: 'M11 CV', content: 'M11 test content', applicationId, provenance: [{ text: 'private provenance text', sourceType: 'candidate_input', note: 'private provenance note' }],
    }});
    assert(docRes.res.status === 201, 'document attached');
    const docBody = await docRes.json();
    documentIds.push(docBody.document.id);
    documentVersionIds.push(docBody.version.id);

    // Link evidence to requirement (mark linked)
    const appDetail = await req(`/applications/${applicationId}`, { cookies: { cf_session: candidateCookie } });
    assert(appDetail.res.status === 200, 'synthetic application detail readable');
    const reqs = (await appDetail.json()).requirements;
    assert(reqs?.[0], 'synthetic requirement exists for whitelist test');
    if (reqs[0]) {
      requirementIds.push(reqs[0].id);
      // Create evidence first, then link
      const evRes = await req(`/evidence/${wsId}`, { method: 'POST', cookies: { cf_session: candidateCookie }, body: {
        title: 'M11 evidence', context: 'secret context', action: 'secret action', result: 'secret result', skills: [], tags: [], dates: {},
      }});
      assert(evRes.res.status === 201, 'synthetic evidence created');
      const evId = (await evRes.json()).item.id;
      evidenceIds.push(evId);
      const linked = await req(`/applications/${applicationId}/requirements/${reqs[0].id}/confirm`, {
        method: 'POST', cookies: { cf_session: candidateCookie }, body: { evidenceId: evId },
      });
      assert(linked.res.status === 201, 'synthetic evidence linked by candidate');
    }

    // Candidate invites employer A
    employerAEmail = `m11-emp-a-${Date.now()}@test.local`;
    const invRes = await req(`/applications/${applicationId}/invitations`, {
      method: 'POST', cookies: { cf_session: candidateCookie }, body: { employerEmail: employerAEmail },
    });
    assert(invRes.res.status === 201, 'invitation created');
    const invBody = await invRes.json();
    invitationId = invBody.invitation.id;
    if (!invBody.invitationUrl) throw new Error('FAIL invitation flow: no copyable invitation URL while email is disabled.');
    const invitationUrl = new URL(invBody.invitationUrl);
    invitationToken = new URLSearchParams(invitationUrl.hash.slice(1)).get('token');
    assert(invitationUrl.search === '' && invitationUrl.pathname === '/accept' && !!invitationToken, 'invitation token is fragment-only, not in path/query');

    // Preview is public; bearer token stays in the POST body, not the request URL.
    const preview = await req('/employer/invitations/preview', { method: 'POST', body: { token: invitationToken } });
    assert(preview.res.status === 200, 'invitation preview returns 200');
    const previewBody = await preview.json();
    assert(previewBody.invitation.employerEmail === employerAEmail, 'preview returns employerEmail');
    assert(!JSON.stringify(previewBody).includes(candidateEmail), 'preview does NOT leak candidate email');

    // Employer A signs up
    const eA = await req('/employer/auth/signup', { method: 'POST', body: {
      email: employerAEmail, password: process.env.M11_TEST_PASSWORD, companyName: 'Employer A Co', invitationToken,
    }});
    assert(eA.res.status === 200, 'employer A signup succeeded');
    const employerACookie = pickCookie(eA.res, 'cf_employer_session');
    employerAId = (await eA.json()).employer.id;
    accounts.push({ type: 'employer', email: employerAEmail, cookie: employerACookie, password: process.env.M11_TEST_PASSWORD });

    // Employer A accepts
    const acc = await req('/employer/invitations/accept', { method: 'POST', cookies: { cf_employer_session: employerACookie }, body: { token: invitationToken } });
    assert(acc.res.status === 200, 'employer A accepted invitation');

    // GATE 1: candidate cookie on the specified GET /employer/me → 401
    const g1 = await req('/employer/me', { cookies: { cf_session: candidateCookie } });
    assert(g1.res.status === 401, 'GATE 1: candidate cookie rejected on /employer/me (401)');

    // GATE 2: employer cookie on /auth/me → 401
    const g2 = await req('/auth/me', { cookies: { cf_employer_session: employerACookie } });
    assert(g2.res.status === 401, 'GATE 2: employer cookie rejected on /auth/me (401)');

    // GATE 3: candidate invite → preview → signup → accept → projection returns 200.
    const proj = await req(`/employer/applications/${applicationId}`, { cookies: { cf_employer_session: employerACookie } });
    assert(proj.res.status === 200, 'GATE 3: complete invitation flow reaches projection (200)');
    const projBody = await proj.json();

    // GATE 4: whitelist integrity
    const payload = JSON.stringify(projBody);
    const sameKeys = (obj, expected) => obj && Object.keys(obj).sort().join('|') === [...expected].sort().join('|');
    assert(sameKeys(projBody, ['application', 'documents', 'requirements']), 'GATE 4: only the three approved top-level collections');
    assert(sameKeys(projBody.application, ['id', 'stage', 'submissionRecordedAt', 'nextAction', 'dueDate', 'opportunityTitle', 'opportunityCompany', 'opportunityLocation', 'opportunityArrangement']), 'GATE 4: application has only approved fields');
    assert(projBody.documents.every(d => sameKeys(d, ['kind', 'title', 'content', 'provenance']) && d.provenance.every(p => sameKeys(p, ['sourceType']))), 'GATE 4: documents and nested provenance have only approved fields');
    assert(projBody.requirements.every(r => sameKeys(r, ['text', 'position', 'linkedEvidence']) && r.linkedEvidence.every(l => sameKeys(l, ['state', 'linkedAt', 'confirmedAt']))), 'GATE 4: requirements and linked evidence have only approved fields');
    const forbiddenKeys = new Set(['email', 'context', 'action', 'result', 'note', 'sourceId', 'evidenceItems', 'profileVersions']);
    const seenKeys = [];
    const scanKeys = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) { seenKeys.push(key); scanKeys(child); }
    };
    scanKeys(projBody);
    assert(!payload.includes(candidateEmail), 'GATE 4: candidate email absent');
    assert(!payload.includes('secret context') && !payload.includes('secret action') && !payload.includes('secret result'), 'GATE 4: evidence context/action/result values absent');
    assert(!payload.includes('private provenance text') && !payload.includes('private provenance note'), 'GATE 4: provenance text/note values are not exposed');
    assert(!seenKeys.some(key => forbiddenKeys.has(key)), 'GATE 4: evidenceItems/profileVersions and private evidence fields absent');
    console.log('  PASS GATE 4: projection contains only whitelisted data and no forbidden fields/values');

    // GATE 5: employer B cannot see A's application
    employerBEmail = `m11-emp-b-${Date.now()}@test.local`;
    const opB = await req('/opportunities', { method: 'POST', cookies: { cf_session: candidateCookie }, body: {
      title: 'M11 Separate Role', company: 'Other Test Co', description: 'Synthetic isolation fixture', sourceKind: 'manual', requirementLines: [],
    }});
    assert(opB.res.status === 201, 'second synthetic opportunity created');
    const opportunityB = (await opB.json()).opportunity;
    opportunityIds.push(opportunityB.id);
    opportunitySourceIds.push(opportunityB.sourceId);
    const appB = await req(`/applications/by-workspace/${wsId}`, { method: 'POST', cookies: { cf_session: candidateCookie }, body: { opportunityId: opportunityB.id } });
    assert(appB.res.status === 201, 'second synthetic application created');
    const appBId = (await appB.json()).application.id;
    applicationIds.push(appBId);
    const invBRes = await req(`/applications/${appBId}/invitations`, {
      method: 'POST', cookies: { cf_session: candidateCookie }, body: { employerEmail: employerBEmail },
    });
    assert(invBRes.res.status === 201, 'candidate created employer B invitation');
    const invBBody = await invBRes.json();
    const inviteBUrl = new URL(invBBody.invitationUrl);
    const inviteBToken = new URLSearchParams(inviteBUrl.hash.slice(1)).get('token');
    assert(inviteBUrl.search === '' && !!inviteBToken, 'employer B token remains fragment-only');
    const eB = await req('/employer/auth/signup', { method: 'POST', body: {
      email: employerBEmail, password: process.env.M11_TEST_PASSWORD, companyName: 'Employer B Co', invitationToken: inviteBToken,
    }});
    assert(eB.res.status === 200, 'employer B signup via invitation succeeded');
    employerBId = (await eB.json()).employer.id;
    const employerBCookie = pickCookie(eB.res, 'cf_employer_session');
    const accB = await req('/employer/invitations/accept', { method: 'POST', cookies: { cf_employer_session: employerBCookie }, body: { token: inviteBToken } });
    assert(accB.res.status === 200, 'employer B accepted their own invitation');

    const g5 = await req(`/employer/applications/${applicationId}`, { cookies: { cf_employer_session: employerBCookie } });
    assert(g5.res.status === 404, 'GATE 5: independently invited employer B gets 404 on A\'s application');

    // GATE 6: successful candidate revocation kills access on the very next GET.
    const revoke = await req(`/applications/${applicationId}/invitations/${invitationId}`, { method: 'DELETE', cookies: { cf_session: candidateCookie } });
    assert(revoke.res.status === 200, `candidate revocation succeeded (HTTP ${revoke.res.status})`);
    const g6 = await req(`/employer/applications/${applicationId}`, { cookies: { cf_employer_session: employerACookie } });
    assert(g6.res.status === 404, 'GATE 6: revoked invitation → employer A gets 404');

    // GATE 7: "Employer viewed" event exists (from GATE 3's GET)
    const events = await req(`/applications/${applicationId}/events`, { cookies: { cf_session: candidateCookie } });
    const eventsBody = await events.json();
    const viewEvents = (eventsBody.events ?? []).filter(e => e.sourceType === 'employer_action' && e.note === 'Employer viewed your application');
    assert(viewEvents.length === 1 && viewEvents[0].kind === 'note' && viewEvents[0].createdBy === null, 'GATE 7: exact employer-view event is visible in candidate timeline');

    console.log('\n  M11 E2E gate: PASS (all 7 checks)');
  } catch (e) {
    console.error(`\n  ${e.message}`);
    process.exitCode = 1;
  } finally {
    try {
      // Discover every row owned by this synthetic user's workspace(s) before deleting the user.
      if (candidateUserId) {
        const owned = await db.query('SELECT id FROM workspaces WHERE owner_id = $1', [candidateUserId]);
        workspaceIds.push(...owned.rows.map(r => r.id));
      }
      workspaceIds = [...new Set(workspaceIds.filter(Boolean))];
      if (workspaceIds.length || opportunityIds.length) {
        const rows = await db.query('SELECT id, source_id FROM opportunities WHERE workspace_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])', [workspaceIds, opportunityIds]);
        opportunityIds.push(...rows.rows.map(r => r.id));
        opportunitySourceIds.push(...rows.rows.map(r => r.source_id));
      }
      if (workspaceIds.length || applicationIds.length) {
        const rows = await db.query('SELECT id FROM applications WHERE workspace_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])', [workspaceIds, applicationIds]);
        applicationIds.push(...rows.rows.map(r => r.id));
      }
      if (workspaceIds.length || documentIds.length) {
        const rows = await db.query('SELECT id FROM documents WHERE workspace_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])', [workspaceIds, documentIds]);
        documentIds.push(...rows.rows.map(r => r.id));
      }
      if (workspaceIds.length) {
        const rows = await db.query('SELECT id FROM evidence_items WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
        evidenceIds.push(...rows.rows.map(r => r.id));
      }
      if (applicationIds.length) {
        const rows = await db.query('SELECT id FROM application_requirements WHERE application_id = ANY($1::uuid[])', [applicationIds]);
        requirementIds.push(...rows.rows.map(r => r.id));
      }
      opportunityIds = [...new Set(opportunityIds.filter(Boolean))];
      opportunitySourceIds = [...new Set(opportunitySourceIds.filter(Boolean))];
      applicationIds = [...new Set(applicationIds.filter(Boolean))];
      documentIds = [...new Set(documentIds.filter(Boolean))];
      evidenceIds = [...new Set(evidenceIds.filter(Boolean))];
      requirementIds = [...new Set(requirementIds.filter(Boolean))];

      // Delete only this run's synthetic accounts; FK cascades remove workspace/application children.
      for (const email of [employerAEmail, employerBEmail].filter(Boolean)) await db.query('DELETE FROM employer_users WHERE email = $1', [email]);
      if (candidateEmail) await db.query('DELETE FROM users WHERE email = $1', [candidateEmail]);
      // opportunity_sources do not cascade from opportunities in the existing schema.
      if (opportunitySourceIds.length) await db.query('DELETE FROM opportunity_sources WHERE id = ANY($1::uuid[])', [opportunitySourceIds]);

      const residuals = [];
      const check = async (label, sql, values) => {
        const r = await db.query(sql, values);
        if (Number(r.rows[0].n) > 0) residuals.push(`${label}=${r.rows[0].n}`);
      };
      if (candidateEmail) await check('candidate users', 'SELECT count(*)::int AS n FROM users WHERE email = $1', [candidateEmail]);
      for (const email of [employerAEmail, employerBEmail].filter(Boolean)) await check('employer users', 'SELECT count(*)::int AS n FROM employer_users WHERE email = $1', [email]);
      if (candidateUserId) {
        await check('candidate sessions', 'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [candidateUserId]);
        await check('workspaces', 'SELECT count(*)::int AS n FROM workspaces WHERE owner_id = $1 OR id = ANY($2::uuid[])', [candidateUserId, workspaceIds]);
      }
      if (workspaceIds.length) {
        await check('workspace opportunities', 'SELECT count(*)::int AS n FROM opportunities WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
        await check('workspace documents', 'SELECT count(*)::int AS n FROM documents WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
        await check('document versions', 'SELECT count(*)::int AS n FROM document_versions WHERE document_id = ANY($1::uuid[])', [documentIds]);
        await check('workspace evidence items', 'SELECT count(*)::int AS n FROM evidence_items WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
        await check('workspace profile versions', 'SELECT count(*)::int AS n FROM profile_versions WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      }
      if (applicationIds.length) {
        await check('applications', 'SELECT count(*)::int AS n FROM applications WHERE id = ANY($1::uuid[])', [applicationIds]);
        await check('application requirements', 'SELECT count(*)::int AS n FROM application_requirements WHERE application_id = ANY($1::uuid[])', [applicationIds]);
        await check('application events', 'SELECT count(*)::int AS n FROM application_events WHERE application_id = ANY($1::uuid[])', [applicationIds]);
        await check('application invitations', 'SELECT count(*)::int AS n FROM employer_invitations WHERE application_id = ANY($1::uuid[])', [applicationIds]);
        await check('application compensation notes', 'SELECT count(*)::int AS n FROM application_compensation_notes WHERE application_id = ANY($1::uuid[])', [applicationIds]);
        await check('interview preps', 'SELECT count(*)::int AS n FROM interview_preps WHERE application_id = ANY($1::uuid[])', [applicationIds]);
      }
      if (requirementIds.length || evidenceIds.length) await check('requirement evidence links', 'SELECT count(*)::int AS n FROM requirement_evidence_links WHERE requirement_id = ANY($1::uuid[]) OR evidence_id = ANY($2::uuid[])', [requirementIds, evidenceIds]);
      if (documentIds.length) await check('documents by ID', 'SELECT count(*)::int AS n FROM documents WHERE id = ANY($1::uuid[])', [documentIds]);
      if (opportunityIds.length) {
        await check('opportunities by ID', 'SELECT count(*)::int AS n FROM opportunities WHERE id = ANY($1::uuid[])', [opportunityIds]);
        await check('opportunity requirements', 'SELECT count(*)::int AS n FROM opportunity_requirements WHERE opportunity_id = ANY($1::uuid[])', [opportunityIds]);
      }
      if (opportunitySourceIds.length) await check('opportunity sources', 'SELECT count(*)::int AS n FROM opportunity_sources WHERE id = ANY($1::uuid[])', [opportunitySourceIds]);
      if (employerAId || employerBId) await check('employer sessions', 'SELECT count(*)::int AS n FROM employer_sessions WHERE employer_user_id = ANY($1::uuid[])', [[employerAId, employerBId].filter(Boolean)]);
      if (residuals.length) throw new Error(`synthetic cleanup left rows: ${residuals.join(', ')}`);
      console.log('  PASS cleanup: synthetic users, sessions, workspaces, opportunities, applications, documents, evidence, events, invitations, and orphan sources removed');
    } catch (e) {
      cleanupFailed = true;
      console.error(`  FAIL cleanup: ${e.message}`);
    }
    await db.end();
    if (cleanupFailed) process.exitCode = 1;
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
NODE

printf '\n%s\n' '== M11.16: preserve existing database row counts =='
node <<'NODE'
const path = require('node:path');
const fs = require('node:fs');
const appDir = path.join(process.cwd(), 'apps/api');
const { Client } = require(require.resolve('pg', { paths: [appDir] }));
const dotenv = require(require.resolve('dotenv', { paths: [appDir] }));
const envFile = path.join(process.cwd(), '.env');
const envVars = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
const url = process.env.DATABASE_URL || envVars.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL unavailable; cannot verify database preservation.');
(async () => {
  const baseline = JSON.parse(fs.readFileSync('.m11-backups/database-baseline.json', 'utf8'));
  const c = new Client({ connectionString: url });
  await c.connect();
  let failed = false;
  try {
    for (const [table, expected] of Object.entries(baseline.counts)) {
      const safe = table.replaceAll('"', '""');
      const r = await c.query(`SELECT count(*)::bigint AS n FROM public."${safe}"`);
      const actual = Number(r.rows[0].n);
      if (actual !== expected) { console.error(`  FAIL ${table}: baseline ${expected}, after ${actual}`); failed = true; }
    }
    if (failed) throw new Error('existing public table row counts differ from the pre-M11 baseline');
    console.log(`  PASS: all ${Object.keys(baseline.counts).length} pre-existing public table row counts preserved`);
  } finally { await c.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
NODE

if [ "$E2E_STATUS" -ne 0 ]; then
  echo "FAIL: M11 E2E gate returned $E2E_STATUS; report the first failing gate above."
  exit "$E2E_STATUS"
fi

printf '\n%s\n' '== M11 implementation and seven E2E gates completed =='
echo 'The E2E gate is not the manual browser gate. Do not claim full M11 green until the six-step browser walkthrough passes.'
echo 'Manual walkthrough: use the candidate app on :3000 and run pnpm dev:employer on :3002 if needed.'
