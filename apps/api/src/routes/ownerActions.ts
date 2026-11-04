import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  and,
  count,
  desc,
  eq,
  gte,
  gt,
  ilike,
  inArray,
  isNull,
} from "drizzle-orm";
import { z } from "zod";
import {
  adminSessions,
  adminUsers,
  auditLog,
  billingInvoices,
  employerSessions,
  employerSubscriptions,
  employerUsers,
  sessions,
  subscriptions,
  users,
  workspaces,
} from "@careerflow/db";
import { db } from "../db.js";
import { env } from "../env.js";
import {
  ADMIN_COOKIE,
  adminOriginAllowed,
  findAdminSession,
} from "../adminSession.js";
import { COOKIE, hashToken, IMPERSONATION_TTL_MS } from "../session.js";
import {
  EMPLOYER_COOKIE,
  EMPLOYER_IMPERSONATION_TTL_MS,
  hashEmployerToken,
} from "../employerSession.js";
import { getPlan } from "../billingCatalog.js";

const ManagedKind = z.enum(["candidate", "employer", "admin"]);
const StatusAction = z.object({
  action: z.enum(["suspend", "reactivate"]),
  reason: z.string().trim().min(8).max(500),
});
const ImpersonationReason = z.object({
  reason: z.string().trim().min(10).max(500),
});

async function requireAdmin(
  req: any,
  reply: any,
  roles: string[] = ["owner", "support", "viewer"],
) {
  const raw = req.cookies[ADMIN_COOKIE.name];
  if (!raw) {
    reply.code(401).send({ error: "unauthenticated" });
    return null;
  }
  const found = await findAdminSession(raw);
  if (!found) {
    reply.code(401).send({ error: "unauthenticated" });
    return null;
  }
  if (!roles.includes(found.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return found;
}

function userAgent(req: any): string | null {
  return typeof req.headers["user-agent"] === "string"
    ? req.headers["user-agent"]
    : null;
}

function appRoute(baseUrl: string, route: string): string {
  const base = new URL(baseUrl);
  const prefix = base.pathname.replace(/\/$/, "");
  return new URL(
    `${prefix}${route.startsWith("/") ? route : `/${route}`}`,
    base.origin,
  ).toString();
}

function requireAdminOrigin(req: any, reply: any): boolean {
  if (adminOriginAllowed(req.headers.origin, env.ADMIN_URL)) return true;
  reply.code(403).send({ error: "invalid_origin" });
  return false;
}

export async function registerOwnerActions(
  app: FastifyInstance,
): Promise<void> {
  app.get("/managed-users", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor) return;
    const raw = (req.query as { q?: unknown }).q;
    const query = typeof raw === "string" ? raw.trim() : "";
    if (query && (query.length < 2 || query.length > 254)) {
      return reply.code(400).send({ error: "invalid_query" });
    }
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const [candidateRows, employerRows, adminRows] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.displayName,
          createdAt: users.createdAt,
          suspendedAt: users.suspendedAt,
        })
        .from(users)
        .where(query ? ilike(users.email, pattern) : undefined)
        .orderBy(desc(users.createdAt))
        .limit(500),
      db
        .select({
          id: employerUsers.id,
          email: employerUsers.email,
          name: employerUsers.companyName,
          createdAt: employerUsers.createdAt,
          suspendedAt: employerUsers.suspendedAt,
        })
        .from(employerUsers)
        .where(query ? ilike(employerUsers.email, pattern) : undefined)
        .orderBy(desc(employerUsers.createdAt))
        .limit(500),
      db
        .select({
          id: adminUsers.id,
          email: adminUsers.email,
          name: adminUsers.displayName,
          createdAt: adminUsers.createdAt,
          suspendedAt: adminUsers.suspendedAt,
          role: adminUsers.role,
        })
        .from(adminUsers)
        .where(query ? ilike(adminUsers.email, pattern) : undefined)
        .orderBy(desc(adminUsers.createdAt))
        .limit(500),
    ]);
    const all = [
      ...candidateRows.map((row) => ({
        ...row,
        kind: "candidate" as const,
        role: null,
        status: row.suspendedAt ? "suspended" : "active",
      })),
      ...employerRows.map((row) => ({
        ...row,
        kind: "employer" as const,
        role: null,
        status: row.suspendedAt ? "suspended" : "active",
      })),
      ...adminRows.map((row) => ({
        ...row,
        kind: "admin" as const,
        status: row.suspendedAt ? "suspended" : "active",
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    await db.insert(auditLog).values({
      actorAdminUserId: actor.adminUserId,
      action: "admin.list_managed_users",
      targetType: "managed_users",
      metadata: { queryPresent: Boolean(query), resultCount: all.length },
      ipAddress: req.ip,
      userAgent: userAgent(req),
    });
    return { users: all, total: all.length, demo: env.DEMO_MODE };
  });

  app.get("/revenue", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor) return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      candidateActive,
      employerActive,
      candidateCanceled,
      employerCanceled,
    ] = await Promise.all([
      db
        .select()
        .from(subscriptions)
        .where(inArray(subscriptions.status, ["active", "trialing"])),
      db
        .select()
        .from(employerSubscriptions)
        .where(inArray(employerSubscriptions.status, ["active", "trialing"])),
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, "canceled"),
            gte(subscriptions.canceledAt, cutoff),
          ),
        ),
      db
        .select({ id: employerSubscriptions.id })
        .from(employerSubscriptions)
        .where(
          and(
            eq(employerSubscriptions.status, "canceled"),
            gte(employerSubscriptions.canceledAt, cutoff),
          ),
        ),
    ]);
    const mrrCents =
      candidateActive.reduce(
        (sum, row) => sum + getPlan("candidate", row.plan).amountCents,
        0,
      ) +
      employerActive.reduce(
        (sum, row) => sum + getPlan("employer", row.plan).amountCents,
        0,
      );
    const activeSubscriptions = candidateActive.length + employerActive.length;
    const canceledLast30Days =
      candidateCanceled.length + employerCanceled.length;
    const denominator = activeSubscriptions + canceledLast30Days;
    const churnRatePercent = denominator
      ? Math.round((canceledLast30Days / denominator) * 10_000) / 100
      : 0;
    await db.insert(auditLog).values({
      actorAdminUserId: actor.adminUserId,
      action: "admin.view_revenue",
      targetType: "billing_metrics",
      metadata: {},
      ipAddress: req.ip,
      userAgent: userAgent(req),
    });
    return {
      label:
        "DEMO / SYNTHETIC — invented records, not real revenue or payments",
      currency: "USD",
      mrrCents,
      activeSubscriptions,
      canceledLast30Days,
      churnRatePercent,
      generatedAt: new Date().toISOString(),
    };
  });

  app.get("/invoices", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor) return;
    const [candidateRows, employerRows] = await Promise.all([
      db
        .select({
          invoice: billingInvoices,
          email: users.email,
          name: users.displayName,
        })
        .from(billingInvoices)
        .innerJoin(workspaces, eq(workspaces.id, billingInvoices.workspaceId))
        .innerJoin(users, eq(users.id, workspaces.ownerId))
        .orderBy(desc(billingInvoices.issuedAt))
        .limit(100),
      db
        .select({
          invoice: billingInvoices,
          email: employerUsers.email,
          name: employerUsers.companyName,
        })
        .from(billingInvoices)
        .innerJoin(
          employerUsers,
          eq(employerUsers.id, billingInvoices.employerUserId),
        )
        .orderBy(desc(billingInvoices.issuedAt))
        .limit(100),
    ]);
    const invoices = [
      ...candidateRows.map((row) => ({
        ...row.invoice,
        accountKind: "candidate" as const,
        accountEmail: row.email,
        accountName: row.name,
      })),
      ...employerRows.map((row) => ({
        ...row.invoice,
        accountKind: "employer" as const,
        accountEmail: row.email,
        accountName: row.name,
      })),
    ]
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
      .slice(0, 100);
    await db.insert(auditLog).values({
      actorAdminUserId: actor.adminUserId,
      action: "admin.view_invoices",
      targetType: "billing_invoices",
      metadata: { resultCount: invoices.length },
      ipAddress: req.ip,
      userAgent: userAgent(req),
    });
    return { invoices, label: "DEMO / SYNTHETIC" };
  });

  app.post("/managed-users/:kind/:id/status", async (req, reply) => {
    if (!requireAdminOrigin(req, reply)) return;
    const actor = await requireAdmin(req, reply, ["owner"]);
    if (!actor) return;
    const params = z
      .object({ kind: ManagedKind, id: z.string().uuid() })
      .parse(req.params);
    const body = StatusAction.parse(req.body);
    if (
      params.kind === "admin" &&
      params.id === actor.adminUserId &&
      body.action === "suspend"
    ) {
      return reply.code(409).send({ error: "cannot_suspend_self" });
    }
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      let found = false;
      if (params.kind === "candidate") {
        const [target] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, params.id))
          .limit(1);
        if (target) {
          found = true;
          await tx
            .update(users)
            .set({ suspendedAt: body.action === "suspend" ? now : null })
            .where(eq(users.id, params.id));
          if (body.action === "suspend") {
            const impersonations = await tx
              .select({
                impersonatorAdminUserId: sessions.impersonatorAdminUserId,
                reason: sessions.impersonationReason,
                sessionId: sessions.id,
              })
              .from(sessions)
              .where(
                and(
                  eq(sessions.userId, params.id),
                  eq(sessions.isImpersonation, true),
                  gt(sessions.expiresAt, now),
                ),
              );
            for (const session of impersonations) {
              if (!session.impersonatorAdminUserId) continue;
              await tx.insert(auditLog).values({
                actorAdminUserId: actor.adminUserId,
                action: "admin.impersonation.revoked_by_suspension",
                targetType: "candidate",
                targetId: params.id,
                metadata: {
                  sessionId: session.sessionId,
                  impersonatorAdminUserId: session.impersonatorAdminUserId,
                  reason: session.reason,
                },
                ipAddress: req.ip,
                userAgent: userAgent(req),
              });
            }
            await tx.delete(sessions).where(eq(sessions.userId, params.id));
          }
        }
      } else if (params.kind === "employer") {
        const [target] = await tx
          .select({ id: employerUsers.id })
          .from(employerUsers)
          .where(eq(employerUsers.id, params.id))
          .limit(1);
        if (target) {
          found = true;
          await tx
            .update(employerUsers)
            .set({ suspendedAt: body.action === "suspend" ? now : null })
            .where(eq(employerUsers.id, params.id));
          if (body.action === "suspend") {
            const impersonations = await tx
              .select({
                impersonatorAdminUserId:
                  employerSessions.impersonatorAdminUserId,
                reason: employerSessions.impersonationReason,
                sessionId: employerSessions.id,
              })
              .from(employerSessions)
              .where(
                and(
                  eq(employerSessions.employerUserId, params.id),
                  eq(employerSessions.isImpersonation, true),
                  gt(employerSessions.expiresAt, now),
                ),
              );
            for (const session of impersonations) {
              if (!session.impersonatorAdminUserId) continue;
              await tx.insert(auditLog).values({
                actorAdminUserId: actor.adminUserId,
                action: "admin.impersonation.revoked_by_suspension",
                targetType: "employer",
                targetId: params.id,
                metadata: {
                  sessionId: session.sessionId,
                  impersonatorAdminUserId: session.impersonatorAdminUserId,
                  reason: session.reason,
                },
                ipAddress: req.ip,
                userAgent: userAgent(req),
              });
            }
            await tx
              .delete(employerSessions)
              .where(eq(employerSessions.employerUserId, params.id));
          }
        }
      } else {
        const [target] = await tx
          .select({ id: adminUsers.id, role: adminUsers.role })
          .from(adminUsers)
          .where(eq(adminUsers.id, params.id))
          .limit(1);
        if (target) {
          found = true;
          if (body.action === "suspend" && target.role === "owner") {
            const owners = await tx
              .select({ id: adminUsers.id })
              .from(adminUsers)
              .where(
                and(
                  eq(adminUsers.role, "owner"),
                  isNull(adminUsers.suspendedAt),
                ),
              )
              .limit(2);
            if (owners.length <= 1)
              return { found, error: "cannot_suspend_last_owner" };
          }
          await tx
            .update(adminUsers)
            .set({ suspendedAt: body.action === "suspend" ? now : null })
            .where(eq(adminUsers.id, params.id));
          if (body.action === "suspend") {
            const candidateImpersonations = await tx
              .select({
                targetId: sessions.userId,
                reason: sessions.impersonationReason,
                sessionId: sessions.id,
              })
              .from(sessions)
              .where(
                and(
                  eq(sessions.impersonatorAdminUserId, params.id),
                  eq(sessions.isImpersonation, true),
                  gt(sessions.expiresAt, now),
                ),
              );
            for (const session of candidateImpersonations) {
              await tx.insert(auditLog).values({
                actorAdminUserId: actor.adminUserId,
                action: "admin.impersonation.revoked_by_suspension",
                targetType: "candidate",
                targetId: session.targetId,
                metadata: {
                  sessionId: session.sessionId,
                  impersonatorAdminUserId: params.id,
                  reason: session.reason,
                },
                ipAddress: req.ip,
                userAgent: userAgent(req),
              });
            }
            const employerImpersonations = await tx
              .select({
                targetId: employerSessions.employerUserId,
                reason: employerSessions.impersonationReason,
                sessionId: employerSessions.id,
              })
              .from(employerSessions)
              .where(
                and(
                  eq(employerSessions.impersonatorAdminUserId, params.id),
                  eq(employerSessions.isImpersonation, true),
                  gt(employerSessions.expiresAt, now),
                ),
              );
            for (const session of employerImpersonations) {
              await tx.insert(auditLog).values({
                actorAdminUserId: actor.adminUserId,
                action: "admin.impersonation.revoked_by_suspension",
                targetType: "employer",
                targetId: session.targetId,
                metadata: {
                  sessionId: session.sessionId,
                  impersonatorAdminUserId: params.id,
                  reason: session.reason,
                },
                ipAddress: req.ip,
                userAgent: userAgent(req),
              });
            }
            await tx
              .delete(adminSessions)
              .where(eq(adminSessions.adminUserId, params.id));
            await tx
              .delete(sessions)
              .where(eq(sessions.impersonatorAdminUserId, params.id));
            await tx
              .delete(employerSessions)
              .where(eq(employerSessions.impersonatorAdminUserId, params.id));
          }
        }
      }
      if (!found) return { found: false as const };
      await tx.insert(auditLog).values({
        actorAdminUserId: actor.adminUserId,
        action:
          body.action === "suspend"
            ? "admin.suspend_user"
            : "admin.reactivate_user",
        targetType: params.kind,
        targetId: params.id,
        metadata: { reason: body.reason },
        ipAddress: req.ip,
        userAgent: userAgent(req),
      });
      return { found: true as const };
    });
    if ("error" in result && result.error)
      return reply.code(409).send({ error: result.error });
    if (!result.found) return reply.code(404).send({ error: "user_not_found" });
    return {
      ok: true,
      status: body.action === "suspend" ? "suspended" : "active",
    };
  });

  app.post("/managed-users/:kind/:id/impersonate", async (req, reply) => {
    if (!requireAdminOrigin(req, reply)) return;
    const actor = await requireAdmin(req, reply, ["owner"]);
    if (!actor) return;
    const params = z
      .object({ kind: ManagedKind, id: z.string().uuid() })
      .parse(req.params);
    const body = ImpersonationReason.parse(req.body);
    if (params.kind === "admin")
      return reply.code(400).send({ error: "admin_impersonation_not_allowed" });
    const ttl =
      params.kind === "candidate"
        ? IMPERSONATION_TTL_MS
        : EMPLOYER_IMPERSONATION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);
    const raw = randomBytes(32).toString("base64url");
    const tokenHash =
      params.kind === "candidate" ? hashToken(raw) : hashEmployerToken(raw);
    const target = await db.transaction(async (tx) => {
      if (params.kind === "candidate") {
        const [user] = await tx
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(and(eq(users.id, params.id), isNull(users.suspendedAt)))
          .limit(1);
        if (!user) return null;
        await tx.insert(sessions).values({
          userId: user.id,
          tokenHash,
          userAgent: userAgent(req),
          expiresAt,
          isImpersonation: true,
          impersonatorAdminUserId: actor.adminUserId,
          impersonationReason: body.reason,
        });
        await tx.insert(auditLog).values({
          actorAdminUserId: actor.adminUserId,
          action: "admin.impersonation.started",
          targetType: "candidate",
          targetId: user.id,
          metadata: {
            reason: body.reason,
            expiresAt: expiresAt.toISOString(),
            readOnly: true,
          },
          ipAddress: req.ip,
          userAgent: userAgent(req),
        });
        return { kind: "candidate" as const, email: user.email };
      }
      const [user] = await tx
        .select({ id: employerUsers.id, email: employerUsers.email })
        .from(employerUsers)
        .where(
          and(
            eq(employerUsers.id, params.id),
            isNull(employerUsers.suspendedAt),
          ),
        )
        .limit(1);
      if (!user) return null;
      await tx.insert(employerSessions).values({
        employerUserId: user.id,
        tokenHash,
        userAgent: userAgent(req),
        expiresAt,
        isImpersonation: true,
        impersonatorAdminUserId: actor.adminUserId,
        impersonationReason: body.reason,
      });
      await tx.insert(auditLog).values({
        actorAdminUserId: actor.adminUserId,
        action: "admin.impersonation.started",
        targetType: "employer",
        targetId: user.id,
        metadata: {
          reason: body.reason,
          expiresAt: expiresAt.toISOString(),
          readOnly: true,
        },
        ipAddress: req.ip,
        userAgent: userAgent(req),
      });
      return { kind: "employer" as const, email: user.email };
    });
    if (!target)
      return reply.code(404).send({ error: "active_user_not_found" });
    if (target.kind === "candidate") {
      reply.setCookie(COOKIE.name, raw, {
        ...COOKIE.options(env.NODE_ENV === "production"),
        maxAge: Math.floor(ttl / 1000),
      });
      return {
        redirectUrl: appRoute(env.APP_URL, "/home"),
        expiresAt: expiresAt.toISOString(),
        readOnly: true,
        email: target.email,
      };
    }
    reply.setCookie(EMPLOYER_COOKIE.name, raw, {
      ...EMPLOYER_COOKIE.options(env.NODE_ENV === "production"),
      maxAge: Math.floor(ttl / 1000),
    });
    return {
      redirectUrl: appRoute(env.EMPLOYER_URL, "/applications"),
      expiresAt: expiresAt.toISOString(),
      readOnly: true,
      email: target.email,
    };
  });
}
