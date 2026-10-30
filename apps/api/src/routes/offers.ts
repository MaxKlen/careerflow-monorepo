import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { applications, applicationCompensationNotes, workspaces, opportunities } from '@careerflow/db';

const Query = z.object({ workspaceId: z.string().uuid() });

export async function registerOffers(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req, reply) => {
    const { workspaceId } = Query.parse(req.query);
    const ws = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1);
    if (!ws[0]) return reply.code(404).send({ error: 'not_found' });

    const offers = await db.select({
      applicationId: applications.id,
      stage: applications.stage,
      opportunityId: applications.opportunityId,
      title: opportunities.title,
      company: opportunities.company,
    })
      .from(applications)
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(and(eq(applications.workspaceId, workspaceId), eq(applications.stage, 'offer')));

    const withComp = await Promise.all(offers.map(async o => {
      const notes = await db.select().from(applicationCompensationNotes).where(eq(applicationCompensationNotes.applicationId, o.applicationId));
      return { ...o, compensation: notes };
    }));
    return { offers: withComp };
  });

  app.post('/:applicationId/compensation', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!appRow[0]) return reply.code(404).send({ error: 'not_found' });
    const ws = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, appRow[0].workspaceId), eq(workspaces.ownerId, req.user!.id))).limit(1);
    if (!ws[0]) return reply.code(404).send({ error: 'not_found' });

    const body = z.object({
      currency: z.string().min(3).max(3),
      amountMin: z.number().int().nonnegative().optional(),
      amountMax: z.number().int().nonnegative().optional(),
      period: z.enum(['month', 'year']),
      isEstimate: z.boolean().default(true),
      note: z.string().max(500).optional(),
    }).parse(req.body);

    const row = (await db.insert(applicationCompensationNotes).values({
      applicationId, ...body, sourceType: 'candidate_input',
    }).returning())[0]!;
    return reply.code(201).send({ compensation: row });
  });
}
