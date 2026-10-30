import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function registerHealth(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true, service: 'careerflow-api' };
    } catch {
      return reply.code(503).send({ ok: false, service: 'careerflow-api' });
    }
  });
}
