import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { workspaces } from '@careerflow/db';
import { planWorkspace } from '@careerflow/core';

const CreateSchema = z.object({ name: z.string().min(1).max(120), kind: z.enum(['personal', 'sample']).default('personal') });

export async function registerWorkspaces(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req) => {
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, req.user!.id))
      .orderBy(desc(workspaces.createdAt));
    return { workspaces: rows };
  });

  app.post('/', async (req, reply) => {
    const parsed = CreateSchema.parse(req.body);
    const plan = planWorkspace(parsed);
    const inserted = await db
      .insert(workspaces)
      .values({ ownerId: req.user!.id, name: plan.name, kind: plan.kind })
      .returning();
    return reply.code(201).send({ workspace: inserted[0] });
  });
}
