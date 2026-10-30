import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { EMPLOYER_COOKIE, findEmployerSession } from '../employerSession.js';
import { env } from '../env.js';

function trustedEmployerOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env.EMPLOYER_URL).origin; }
  catch { return false; }
}

export interface EmployerAuth {
  id: string;
  email: string;
  companyName: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    employer: EmployerAuth | null;
  }
}

export default fp(async (app) => {
  app.decorateRequest('employer', null);
  app.addHook('preHandler', async (req: FastifyRequest, reply) => {
    // Employer APIs are same-origin to the dedicated employer app, even for reads.
    if (!req.url.startsWith('/employer/')) return;
    if (!trustedEmployerOrigin(req.headers.origin)) return reply.code(403).send({ error: 'invalid_origin' });
    // Only decorate employer for /employer/* routes — never for candidate routes.
    const raw = req.cookies[EMPLOYER_COOKIE.name];
    if (!raw) return;
    const found = await findEmployerSession(raw);
    if (!found) return;
    req.employer = { id: found.employerUserId, email: found.email, companyName: found.companyName };
  });
});
