import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { COOKIE, findSession } from '../session.js';

export interface AuthUser { id: string; email: string; displayName: string | null; }

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}

export default fp(async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const raw = req.cookies[COOKIE.name];
    if (!raw) return;
    const found = await findSession(raw);
    if (!found) return;
    req.user = { id: found.userId, email: found.email, displayName: found.displayName };
    req.sessionId = found.sessionId;
  });
});
