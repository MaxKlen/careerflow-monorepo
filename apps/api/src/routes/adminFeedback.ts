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
