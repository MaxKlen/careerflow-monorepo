import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { billingInvoices, employerSubscriptions } from "@careerflow/db";
import { db } from "../db.js";
import {
  getAccessSnapshot,
  getPlans,
  isUpgrade,
  type BillingPlan,
} from "../billingCatalog.js";
import {
  BillingTransitionError,
  cancelEmployerSubscription,
  completePaymentEvent,
} from "../billingService.js";
import { getPaymentProvider } from "../paymentProvider.js";
import { nextSubscriptionState } from "../billingRules.js";

const PlanInput = z.object({
  plan: z.enum(["starter", "plus", "growth"]),
  idempotencyKey: z.string().uuid(),
});

export async function registerEmployerMembership(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("preHandler", async (req, reply) => {
    if (!req.employer)
      return reply.code(401).send({ error: "unauthenticated" });
  });

  app.get("/plans", async () => {
    const provider = getPaymentProvider();
    return {
      audience: "employer",
      plans: getPlans("employer"),
      checkoutAvailable: provider.configured,
      provider: provider.name,
      demo: provider.name === "mock",
      message: provider.configured
        ? "DEMO / SYNTHETIC: checkout records an invented transaction; no real money moves."
        : "Billing is disabled in this deployment. No checkout is available.",
    };
  });

  app.get("/current", async (req) => {
    const subscription =
      (
        await db
          .select()
          .from(employerSubscriptions)
          .where(eq(employerSubscriptions.employerUserId, req.employer!.id))
          .orderBy(desc(employerSubscriptions.updatedAt))
          .limit(1)
      )[0] ?? null;
    const invoices = await db
      .select()
      .from(billingInvoices)
      .where(eq(billingInvoices.employerUserId, req.employer!.id))
      .orderBy(desc(billingInvoices.issuedAt))
      .limit(50);
    return {
      subscription,
      invoices,
      access: getAccessSnapshot("employer", subscription),
    };
  });

  async function checkout(
    req: any,
    reply: any,
    action: "checkout" | "upgrade",
  ) {
    const parsedBody = PlanInput.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "invalid_request",
        issues: parsedBody.error.issues,
      });
    }
    const body = parsedBody.data;
    const current = (
      await db
        .select()
        .from(employerSubscriptions)
        .where(eq(employerSubscriptions.employerUserId, req.employer!.id))
        .orderBy(desc(employerSubscriptions.updatedAt))
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
          access: getAccessSnapshot("employer", current ?? null),
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
      return reply.code(501).send({ error: "payment_not_configured" });
    }
    const plan = getPlans("employer").find((item) => item.id === body.plan)!;
    const result = await provider.startCheckout(
      { kind: "employer", employerUserId: req.employer!.id },
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
        "employer",
        updatedSubscription ?? current ?? null,
      ),
    };
  }

  app.post("/checkout", async (req, reply) => checkout(req, reply, "checkout"));
  app.post("/upgrade", async (req, reply) => checkout(req, reply, "upgrade"));

  app.post("/cancel", async (req, reply) => {
    const subscription = await cancelEmployerSubscription(req.employer!.id);
    if (!subscription)
      return reply.code(404).send({ error: "active_subscription_not_found" });
    return {
      subscription,
      demo: true,
      label:
        "DEMO / SYNTHETIC — subscription canceled in the local demo database",
      access: getAccessSnapshot("employer", subscription),
    };
  });

  app.get("/invoices", async (req) => ({
    invoices: await db
      .select()
      .from(billingInvoices)
      .where(eq(billingInvoices.employerUserId, req.employer!.id))
      .orderBy(desc(billingInvoices.issuedAt))
      .limit(50),
    label: "DEMO / SYNTHETIC",
  }));
}
