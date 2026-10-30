import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../db.js';
import { opportunityRequirements, opportunitySources, opportunities, workspaces } from '@careerflow/db';
import { CreateOpportunityInput } from '@careerflow/shared';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function registerOpportunities(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req) => {
    const userWorkspaces = await db.select({ id: workspaces.id }).from(workspaces)
      .where(eq(workspaces.ownerId, req.user!.id));
    const workspaceIds = userWorkspaces.map((workspace) => workspace.id);
    // Transitional M10 behavior: NULL workspaceId rows remain the shared catalog for every candidate.
    const visible = workspaceIds.length > 0
      ? or(isNull(opportunities.workspaceId), ...workspaceIds.map((id) => eq(opportunities.workspaceId, id)))
      : isNull(opportunities.workspaceId);
    const rows = await db.select().from(opportunities)
      .where(visible)
      .orderBy(desc(opportunities.createdAt))
      .limit(100);
    return { opportunities: rows };
  });

  app.post('/', async (req, reply) => {
    const body = CreateOpportunityInput.parse(req.body);
    const ownedWorkspaces = await db.select({ id: workspaces.id }).from(workspaces)
      .where(eq(workspaces.ownerId, req.user!.id))
      .orderBy(desc(workspaces.createdAt))
      .limit(1);
    const workspaceId = ownedWorkspaces[0]?.id;
    if (!workspaceId) {
      return reply.code(400).send({
        error: 'workspace_required',
        message: 'Create a workspace before adding opportunities.',
      });
    }

    const source = (await db.insert(opportunitySources).values({
      url: body.sourceUrl,
      sourceKind: body.sourceKind,
    }).returning())[0]!;
    const opportunity = (await db.insert(opportunities).values({
      workspaceId,
      sourceId: source.id,
      title: body.title,
      company: body.company,
      location: body.location,
      arrangement: body.arrangement,
      compensation: body.compensation ?? {},
      description: body.description,
    }).returning())[0]!;
    if (body.requirementLines.length) {
      await db.insert(opportunityRequirements).values(
        body.requirementLines.map((text, position) => ({ opportunityId: opportunity.id, text, position })),
      );
    }
    return reply.code(201).send({ opportunity });
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    const opportunity = rows[0];
    if (!opportunity) return reply.code(404).send({ error: 'not_found' });
    if (opportunity.workspaceId && !(await ownsWorkspace(opportunity.workspaceId, req.user!.id))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const requirements = await db.select().from(opportunityRequirements)
      .where(eq(opportunityRequirements.opportunityId, id));
    return { opportunity, requirements };
  });
}
