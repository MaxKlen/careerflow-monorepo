import fp from "fastify-plugin";
import type { FastifyRequest } from "fastify";
import { COOKIE, findSession } from "../session.js";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  isImpersonating: boolean;
  impersonatorAdminUserId: string | null;
  impersonationReason: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}

export default fp(async (app) => {
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  app.addHook("preHandler", async (req: FastifyRequest, reply) => {
    const raw = req.cookies[COOKIE.name];
    if (!raw) return;
    const found = await findSession(raw);
    if (!found) return;
    req.user = {
      id: found.userId,
      email: found.email,
      displayName: found.displayName,
      isImpersonating: found.isImpersonation,
      impersonatorAdminUserId: found.impersonatorAdminUserId,
      impersonationReason: found.impersonationReason,
    };
    req.sessionId = found.sessionId;
    if (
      found.isImpersonation &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.url.startsWith("/auth/impersonation/end") &&
      !req.url.startsWith("/auth/signout")
    ) {
      return reply.code(403).send({ error: "impersonation_read_only" });
    }
  });
});
