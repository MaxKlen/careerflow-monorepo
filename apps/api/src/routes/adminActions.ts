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
