import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { feedbackItems } from '@careerflow/db';
import { SubmitFeedbackInput } from '@careerflow/shared';

export async function registerFeedback(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.post('/', async (req, reply) => {
    const body = SubmitFeedbackInput.parse(req.body);
    const row = (await db.insert(feedbackItems).values({
      userId: req.user!.id,
      workspaceId: null,
      kind: body.kind,
      subject: body.subject,
      body: body.body,
      contactOk: body.contactOk,
      contextScreen: body.contextScreen ?? null,
    }).returning())[0]!;
    return reply.code(201).send({ feedback: { id: row.id, status: row.status, createdAt: row.createdAt } });
  });

  app.get('/', async (req) => {
    const rows = await db.select({
      id: feedbackItems.id, kind: feedbackItems.kind, subject: feedbackItems.subject,
      status: feedbackItems.status, createdAt: feedbackItems.createdAt, updatedAt: feedbackItems.updatedAt,
    }).from(feedbackItems).where(eq(feedbackItems.userId, req.user!.id)).orderBy(desc(feedbackItems.createdAt));
    return { items: rows };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = (await db.select().from(feedbackItems)
      .where(and(eq(feedbackItems.id, id), eq(feedbackItems.userId, req.user!.id))).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { item: row };
  });
}
