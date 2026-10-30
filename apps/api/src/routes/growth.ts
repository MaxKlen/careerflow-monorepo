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
