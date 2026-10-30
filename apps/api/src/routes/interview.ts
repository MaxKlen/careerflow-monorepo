import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { applications, workspaces, interviewPreps, opportunities, evidenceItems, applicationEvents } from '@careerflow/db';
import { UpsertInterviewPrepInput, InterviewReflectionInput } from '@careerflow/shared';
import { questionsForRole } from '@careerflow/core';

async function loadAppForUser(appId: string, userId: string) {
  const rows = await db.select().from(applications).where(eq(applications.id, appId)).limit(1);
  if (!rows[0]) return null;
  const ws = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, rows[0].workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  if (!ws[0]) return null;
  return rows[0];
}

export async function registerInterview(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/:applicationId', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await loadAppForUser(applicationId, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });

    let roleTitle = '';
    if (appRow.opportunityId) {
      const opp = await db.select().from(opportunities).where(eq(opportunities.id, appRow.opportunityId)).limit(1);
      roleTitle = opp[0]?.title ?? '';
    }
    const questions = questionsForRole(roleTitle);

    const prep = await db.select().from(interviewPreps).where(eq(interviewPreps.applicationId, applicationId)).limit(1);
    const evidence = await db.select().from(evidenceItems).where(eq(evidenceItems.workspaceId, appRow.workspaceId));

    return {
      prep: prep[0] ?? null,
      questions,
      availableEvidence: evidence.map(e => ({ id: e.id, title: e.title, skills: e.skills })),
    };
  });

  app.put('/:applicationId', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await loadAppForUser(applicationId, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });
    const body = UpsertInterviewPrepInput.parse(req.body);

    const existing = await db.select().from(interviewPreps).where(eq(interviewPreps.applicationId, applicationId)).limit(1);
    if (existing[0]) {
      const updated = (await db.update(interviewPreps)
        .set({ selectedQuestionIds: body.selectedQuestionIds, evidenceIds: body.evidenceIds, notes: body.notes ?? null, updatedAt: new Date() })
        .where(eq(interviewPreps.id, existing[0].id)).returning())[0];
      return { prep: updated };
    }
    const created = (await db.insert(interviewPreps).values({
      applicationId,
      selectedQuestionIds: body.selectedQuestionIds,
      evidenceIds: body.evidenceIds,
      notes: body.notes ?? null,
    }).returning())[0]!;
    return reply.code(201).send({ prep: created });
  });

  app.post('/:applicationId/reflection', async (req, reply) => {
    const { applicationId } = req.params as { applicationId: string };
    const appRow = await loadAppForUser(applicationId, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });
    const body = InterviewReflectionInput.parse(req.body);

    const evt = (await db.insert(applicationEvents).values({
      applicationId,
      kind: 'interview_completed',
      occurredAt: new Date(),
      note: `${body.learned}${body.followUp ? `\nFollow-up: ${body.followUp}` : ''}`,
      sourceType: 'candidate_input',
      createdBy: req.user!.id,
    }).returning())[0]!;
    return reply.code(201).send({ event: evt });
  });
}
