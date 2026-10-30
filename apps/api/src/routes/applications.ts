import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { applicationEvents, applicationRequirements, applications, evidenceItems, opportunityRequirements, opportunities, requirementEvidenceLinks, workspaces } from '@careerflow/db';
import { CreateApplicationEventInput, CreateApplicationInput, LinkEvidenceInput, UpdateApplicationStageInput } from '@careerflow/shared';
import { findPhraseMatches } from '@careerflow/core';
import { z } from 'zod';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}
async function ownedApplication(id: string, userId: string) {
  const rows = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  return rows[0] && await ownsWorkspace(rows[0].workspaceId, userId) ? rows[0] : null;
}
async function evidenceInOwnedWorkspace(evidenceId: string, workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: evidenceItems.id }).from(evidenceItems)
    .innerJoin(workspaces, eq(evidenceItems.workspaceId, workspaces.id))
    .where(and(
      eq(evidenceItems.id, evidenceId),
      eq(evidenceItems.workspaceId, workspaceId),
      eq(workspaces.ownerId, userId),
    )).limit(1);
  return !!rows[0];
}
export async function registerApplications(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => { if (!req.user) return reply.code(401).send({ error: 'unauthenticated' }); });
  app.get('/by-workspace/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    return { applications: await db.select().from(applications).where(eq(applications.workspaceId, workspaceId)).orderBy(desc(applications.updatedAt)) };
  });
  app.post('/by-workspace/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateApplicationInput.parse(req.body);
    let opportunityId: string | null = null;
    let sourceRequirements: typeof opportunityRequirements.$inferSelect[] = [];
    if (body.opportunityId) {
      const opportunity = (await db.select().from(opportunities).where(eq(opportunities.id, body.opportunityId)).limit(1))[0];
      if (!opportunity) return reply.code(404).send({ error: 'opportunity_not_found' });
      opportunityId = opportunity.id;
      sourceRequirements = await db.select().from(opportunityRequirements).where(eq(opportunityRequirements.opportunityId, opportunity.id));
    }
    const application = (await db.insert(applications).values({ workspaceId, opportunityId, stage: 'considering' }).returning())[0]!;
    if (sourceRequirements.length) {
      await db.insert(applicationRequirements).values(sourceRequirements.map(r => ({ applicationId: application.id, text: r.text, sourceRequirementId: r.id, position: r.position })));
      const evidence = await db.select().from(evidenceItems).where(eq(evidenceItems.workspaceId, workspaceId));
      const snippets = evidence.map(e => ({ id: e.id, title: e.title, text: `${e.context} ${e.action} ${e.result ?? ''}`, skills: (e.skills as string[]) ?? [] }));
      const reqs = await db.select().from(applicationRequirements).where(eq(applicationRequirements.applicationId, application.id));
      for (const requirement of reqs) {
        const match = findPhraseMatches(requirement.text, snippets)[0];
        if (match) await db.insert(requirementEvidenceLinks).values({ requirementId: requirement.id, evidenceId: null, state: 'phrase_match', phrase: match.phrase });
      }
    }
    return reply.code(201).send({ application });
  });
  app.get('/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const application = await ownedApplication(id, req.user!.id);
    if (!application) return reply.code(404).send({ error: 'not_found' });
    const reqs = await db.select().from(applicationRequirements).where(eq(applicationRequirements.applicationId, id));
    const requirements = await Promise.all(reqs.map(async requirement => {
      const links = await db.select().from(requirementEvidenceLinks).where(eq(requirementEvidenceLinks.requirementId, requirement.id));
      return { ...requirement, state: links[0]?.state ?? 'none', links };
    }));
    return { application, requirements };
  });
  app.patch('/:id/stage', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!await ownedApplication(id, req.user!.id)) return reply.code(404).send({ error: 'not_found' });
    const body = UpdateApplicationStageInput.parse(req.body);
    const application = (await db.update(applications).set({ stage: body.stage, updatedAt: new Date() }).where(eq(applications.id, id)).returning())[0]!;
    return { application };
  });
  app.post('/:id/requirements/link', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const application = await ownedApplication(id, req.user!.id);
    if (!application) return reply.code(404).send({ error: 'not_found' });
    const body = LinkEvidenceInput.parse(req.body);
    const requirement = (await db.select().from(applicationRequirements).where(and(eq(applicationRequirements.id, body.requirementId), eq(applicationRequirements.applicationId, id))).limit(1))[0];
    if (!requirement) return reply.code(404).send({ error: 'requirement_not_found' });
    if (body.state === 'linked' && !body.evidenceId) return reply.code(400).send({ error: 'evidence_required' });
    if (body.evidenceId && !(await evidenceInOwnedWorkspace(body.evidenceId, application.workspaceId, req.user!.id))) return reply.code(404).send({ error: 'evidence_not_found' });
    const confirmedAt = body.state === 'linked' ? new Date() : null;
    const values = { evidenceId: body.evidenceId ?? null, state: body.state, phrase: body.phrase ?? null, linkedAt: new Date(), confirmedAt };
    const prior = await db.select({ id: requirementEvidenceLinks.id }).from(requirementEvidenceLinks)
      .where(eq(requirementEvidenceLinks.requirementId, requirement.id)).limit(1);
    const link = prior[0]
      ? (await db.update(requirementEvidenceLinks).set(values).where(eq(requirementEvidenceLinks.id, prior[0].id)).returning())[0]!
      : (await db.insert(requirementEvidenceLinks).values({ requirementId: requirement.id, ...values }).returning())[0]!;
    return reply.code(201).send({ link });
  });

  app.post('/:id/requirements/:reqId/confirm', async (req, reply) => {
    const { id, reqId } = req.params as { id: string; reqId: string };
    const appRow = await ownedApplication(id, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });
    const body = z.object({ evidenceId: z.string().uuid() }).parse(req.body);

    const reqRow = await db.select().from(applicationRequirements)
      .where(and(eq(applicationRequirements.id, reqId), eq(applicationRequirements.applicationId, id))).limit(1);
    if (!reqRow[0]) return reply.code(404).send({ error: 'requirement_not_found' });

    // BOLA guard: evidence must belong to the same workspace as the application.
    if (!(await evidenceInOwnedWorkspace(body.evidenceId, appRow.workspaceId, req.user!.id))) return reply.code(404).send({ error: 'evidence_not_found' });

    const linkedAt = new Date();
    const prior = await db.select().from(requirementEvidenceLinks)
      .where(eq(requirementEvidenceLinks.requirementId, reqId)).limit(1);
    if (prior[0]) {
      await db.update(requirementEvidenceLinks).set({
        evidenceId: body.evidenceId, state: 'linked', phrase: null, linkedAt, confirmedAt: linkedAt,
      }).where(eq(requirementEvidenceLinks.id, prior[0].id));
    } else {
      await db.insert(requirementEvidenceLinks).values({
        requirementId: reqId, evidenceId: body.evidenceId, state: 'linked', linkedAt, confirmedAt: linkedAt,
      });
    }
    return reply.code(201).send({ ok: true, state: 'linked' });
  });

  app.get('/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedApplication(id, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const events = await db.select().from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.occurredAt));
    return { events };
  });

  app.post('/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownedApplication(id, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateApplicationEventInput.parse(req.body);
    const occurredAt = new Date(`${body.occurredAt}T00:00:00.000Z`);
    const event = (await db.insert(applicationEvents).values({
      applicationId: id,
      kind: body.kind,
      occurredAt,
      note: body.note ?? null,
      sourceType: 'candidate_input',
      createdBy: req.user!.id,
    }).returning())[0]!;
    return reply.code(201).send({ event });
  });

  app.delete('/:id/events/:eventId', async (req, reply) => {
    const { id, eventId } = req.params as { id: string; eventId: string };
    if (!(await ownedApplication(id, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const parsedEventId = z.string().uuid().safeParse(eventId);
    if (!parsedEventId.success) return reply.code(400).send({ error: 'invalid_event_id' });
    await db.delete(applicationEvents).where(and(
      eq(applicationEvents.id, parsedEventId.data),
      eq(applicationEvents.applicationId, id),
    ));
    return { ok: true };
  });
}
