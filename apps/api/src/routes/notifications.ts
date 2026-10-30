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
