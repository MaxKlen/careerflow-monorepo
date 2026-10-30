import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { evidenceItems, workspaces } from '@careerflow/db';
import { CreateEvidenceInput } from '@careerflow/shared';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}
export async function registerEvidence(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => { if (!req.user) return reply.code(401).send({ error: 'unauthenticated' }); });
  app.get('/items/:id', async (req, reply) => {
    const rows = await db.select().from(evidenceItems).where(eq(evidenceItems.id, (req.params as { id: string }).id)).limit(1);
    if (!rows[0] || !(await ownsWorkspace(rows[0].workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    return { item: rows[0] };
  });
  app.get('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    return { items: await db.select().from(evidenceItems).where(and(eq(evidenceItems.workspaceId, workspaceId), isNull(evidenceItems.archivedAt))).orderBy(desc(evidenceItems.updatedAt)) };
  });
  app.post('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateEvidenceInput.parse(req.body);
    const row = (await db.insert(evidenceItems).values({ workspaceId, title: body.title, context: body.context, action: body.action, result: body.result, dates: body.dates, skills: body.skills, tags: body.tags }).returning())[0]!;
    return reply.code(201).send({ item: row });
  });
}
