import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { careerDirections, goals, workspaces } from '@careerflow/db';
import { CreateDirectionInput } from '@careerflow/shared';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}
export async function registerDirections(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => { if (!req.user) return reply.code(401).send({ error: 'unauthenticated' }); });
  app.get('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const [dirs, goalRows] = await Promise.all([
      db.select().from(careerDirections).where(eq(careerDirections.workspaceId, workspaceId)).orderBy(desc(careerDirections.createdAt)).limit(1),
      db.select().from(goals).where(eq(goals.workspaceId, workspaceId)),
    ]);
    return { direction: dirs[0] ?? null, goals: goalRows };
  });
  app.post('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateDirectionInput.parse(req.body);
    const dir = (await db.insert(careerDirections).values({ workspaceId, summaryInOwnWords: body.summaryInOwnWords, entryPoint: body.entryPoint, constraints: body.constraints }).returning())[0]!;
    const goal = (await db.insert(goals).values({ workspaceId, directionId: dir.id, title: body.firstGoalTitle, status: 'active' }).returning())[0]!;
    return reply.code(201).send({ direction: dir, goal });
  });
}
