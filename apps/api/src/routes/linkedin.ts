import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { analyzeLinkedIn } from '@careerflow/core';

const Body = z.object({ section: z.enum(['headline', 'about', 'experience', 'skills', 'featured']), text: z.string().min(1).max(20000) });

export async function registerLinkedIn(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });
  app.post('/analyze', async (req) => {
    const body = Body.parse(req.body);
    return { suggestions: analyzeLinkedIn(body.section, body.text) };
  });
}
