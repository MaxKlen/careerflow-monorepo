import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { auditLog, sessions, users } from "@careerflow/db";
import { hashPassword, verifyPassword } from "../password.js";
import { COOKIE, createSession, destroySession } from "../session.js";
import { env } from "../env.js";

const SignupSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(10).max(200),
  displayName: z.string().min(1).max(80).optional(),
});

const SigninSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

function trustedCandidateOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(env.APP_URL).origin;
  } catch {
    return false;
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.post("/signup", async (req, reply) => {
    const body = SignupSchema.parse(req.body);
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    if (existing[0]) return reply.code(409).send({ error: "email_taken" });

    const passwordHash = await hashPassword(body.password);
    const inserted = await db
      .insert(users)
      .values({
        email: body.email,
        passwordHash,
        displayName: body.displayName ?? null,
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      });
    const user = inserted[0]!;

    const raw = await createSession(user.id, req.headers["user-agent"] ?? null);
    reply.setCookie(
      COOKIE.name,
      raw,
      COOKIE.options(env.NODE_ENV === "production"),
    );
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  });

  app.post("/signin", async (req, reply) => {
    const body = SigninSchema.parse(req.body);
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        passwordHash: users.passwordHash,
        suspendedAt: users.suspendedAt,
      })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    const user = rows[0];
    if (
      !user ||
      user.suspendedAt ||
      !(await verifyPassword(body.password, user.passwordHash))
    ) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const raw = await createSession(user.id, req.headers["user-agent"] ?? null);
    reply.setCookie(
      COOKIE.name,
      raw,
      COOKIE.options(env.NODE_ENV === "production"),
    );
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  });

  app.post("/signout", async (req, reply) => {
    const raw = req.cookies[COOKIE.name];
    if (raw && req.user?.isImpersonating && req.user.impersonatorAdminUserId) {
      await db.transaction(async (tx) => {
        await tx.delete(sessions).where(eq(sessions.id, req.sessionId!));
        await tx.insert(auditLog).values({
          actorAdminUserId: req.user!.impersonatorAdminUserId,
          action: "admin.impersonation.ended",
          targetType: "candidate",
          targetId: req.user!.id,
          metadata: { reason: "signout" },
          ipAddress: req.ip,
          userAgent:
            typeof req.headers["user-agent"] === "string"
              ? req.headers["user-agent"]
              : null,
        });
      });
    } else if (raw) await destroySession(raw);
    reply.clearCookie(COOKIE.name, { path: "/" });
    return { ok: true };
  });

  app.post("/impersonation/end", async (req, reply) => {
    if (
      !req.user?.isImpersonating ||
      !req.sessionId ||
      !req.user.impersonatorAdminUserId
    ) {
      return reply.code(403).send({ error: "not_impersonating" });
    }
    if (!trustedCandidateOrigin(req.headers.origin)) {
      return reply.code(403).send({ error: "invalid_origin" });
    }
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.id, req.sessionId!));
      await tx.insert(auditLog).values({
        actorAdminUserId: req.user!.impersonatorAdminUserId,
        action: "admin.impersonation.ended",
        targetType: "candidate",
        targetId: req.user!.id,
        metadata: { reason: "owner_exit" },
        ipAddress: req.ip,
        userAgent:
          typeof req.headers["user-agent"] === "string"
            ? req.headers["user-agent"]
            : null,
      });
    });
    reply.clearCookie(COOKIE.name, { path: "/" });
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthenticated" });
    return { user: req.user };
  });
}
