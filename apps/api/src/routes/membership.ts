import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { billingInvoices, subscriptions, workspaces } from "@careerflow/db";
import { db } from "../db.js";
import {
  getAccessSnapshot,
  getPlans,
  isUpgrade,
  type BillingPlan,
} from "../billingCatalog.js";
import {
  BillingTransitionError,
  cancelCandidateSubscription,
  completePaymentEvent,
} from "../billingService.js";
import { getPaymentProvider } from "../paymentProvider.js";
import { nextSubscriptionState } from "../billingRules.js";
import { env } from "../env.js";

const CheckoutInput = z.object({
  workspaceId: z.string().uuid(),
  plan: z.enum(["starter", "plus", "growth"]),
  idempotencyKey: z.string().uuid(),
});
const CancelInput = z.object({ workspaceId: z.string().uuid() });

function trustedCandidateOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(env.APP_URL).origin;
  } catch {
    return false;
  }
}

export async function registerMembership(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "unauthenticated" });
  });

  app.get("/plans", async () => {
    const provider = getPaymentProvider();
    return {
      audience: "candidate",
      plans: getPlans("candidate"),
      checkoutAvailable: provider.configured,
      provider: provider.name,
      demo: env.DEMO_MODE && provider.name === "mock",
      message: provider.configured
        ? "DEMO / SYNTHETIC: checkout records an invented transaction; no real money moves."
        : "Billing is disabled in this deployment. No checkout is available.",
    };
  });

  app.get("/current", async (req) => {
    const owned = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.ownerId, req.user!.id));
    if (!owned.length) {
      return {
        workspaces: [],
        subscriptions: [],
        subscription: null,
        invoices: [],
        accessByWorkspace: {},
      };
    }
    const ids = owned.map((workspace) => workspace.id);
    const rows = await db
      .select()
      .from(subscriptions)
      .where(inArray(subscriptions.workspaceId, ids))
      .orderBy(desc(subscriptions.updatedAt));
    const invoices = await db
      .select()
      .from(billingInvoices)
      .where(inArray(billingInvoices.workspaceId, ids))
      .orderBy(desc(billingInvoices.issuedAt))
      .limit(50);
    const accessByWorkspace = Object.fromEntries(
      owned.map((workspace) => [
        workspace.id,
        getAccessSnapshot(
          "candidate",
          rows.find((row) => row.workspaceId === workspace.id) ?? null,
        ),
      ]),
    );
    return {
      workspaces: owned,
      subscriptions: rows,
      subscription: rows[0] ?? null,
      invoices,
      accessByWorkspace,
    };
  });

  async function checkout(
    req: any,
    reply: any,
    action: "checkout" | "upgrade",
  ) {
    if (!trustedCandidateOrigin(req.headers.origin)) {
      return reply.code(403).send({ error: "invalid_origin" });
    }
    const parsedBody = CheckoutInput.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "invalid_request",
        issues: parsedBody.error.issues,
      });
    }
    const body = parsedBody.data;
    const owned = (
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, body.workspaceId),
            eq(workspaces.ownerId, req.user!.id),
          ),
        )
        .limit(1)
    )[0];
    if (!owned) return reply.code(404).send({ error: "workspace_not_found" });

    const current = (
      await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, body.workspaceId))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(1)
    )[0];
    const transition = nextSubscriptionState({
      currentPlan: current?.plan ?? null,
      currentStatus: current?.status ?? null,
      requestedPlan: body.plan,
      action,
    });
    if (!transition.allowed) {
      if (transition.reason === "already_on_plan") {
        return {
          subscription: current,
          invoice: null,
          duplicate: true,
          demo: true,
          access: getAccessSnapshot("candidate", current ?? null),
        };
      }
      return reply.code(409).send({ error: transition.reason });
    }
    if (
      current?.status &&
      current.status !== "canceled" &&
      !isUpgrade(current.plan, body.plan)
    ) {
      return reply.code(409).send({ error: "plan_downgrade_not_supported" });
    }

    const provider = getPaymentProvider();
    if (!provider.configured) {
      return reply.code(501).send({
        error: "payment_not_configured",
        message: "No checkout provider is enabled in this deployment.",
      });
    }
    const plan = getPlans("candidate").find((item) => item.id === body.plan)!;
    const result = await provider.startCheckout(
      {
        kind: "candidate",
        workspaceId: body.workspaceId,
        ownerUserId: req.user!.id,
      },
      body.plan as BillingPlan,
      plan.amountCents,
      body.idempotencyKey,
    );
    if (!result)
      return reply.code(501).send({ error: "checkout_not_implemented" });
    let recorded;
    try {
      recorded = await completePaymentEvent(result.event, action);
    } catch (error) {
      if (error instanceof BillingTransitionError) {
        return reply.code(409).send({ error: error.code });
      }
      throw error;
    }
    const updatedSubscription = recorded.subscription as {
      plan: BillingPlan;
      status: "active" | "past_due" | "canceled" | "trialing";
    } | null;
    return {
      demo: true,
      label: "DEMO / SYNTHETIC — no real payment was made",
      ...recorded,
      access: getAccessSnapshot(
        "candidate",
        updatedSubscription ?? current ?? null,
      ),
    };
  }

  app.post("/checkout", async (req, reply) => checkout(req, reply, "checkout"));
  app.post("/upgrade", async (req, reply) => checkout(req, reply, "upgrade"));

  app.post("/cancel", async (req, reply) => {
    if (!trustedCandidateOrigin(req.headers.origin)) {
      return reply.code(403).send({ error: "invalid_origin" });
    }
    const parsedBody = CancelInput.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "invalid_request",
        issues: parsedBody.error.issues,
      });
    }
    const body = parsedBody.data;
    const owned = (
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, body.workspaceId),
            eq(workspaces.ownerId, req.user!.id),
          ),
        )
        .limit(1)
    )[0];
    if (!owned) return reply.code(404).send({ error: "workspace_not_found" });
    const subscription = await cancelCandidateSubscription(body.workspaceId);
    if (!subscription)
      return reply.code(404).send({ error: "active_subscription_not_found" });
    return {
      subscription,
      demo: true,
      label:
        "DEMO / SYNTHETIC — subscription canceled in the local demo database",
      access: getAccessSnapshot("candidate", subscription),
    };
  });
}
