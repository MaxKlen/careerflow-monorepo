import { and, desc, eq, sql } from "drizzle-orm";
import {
  billingEvents,
  billingInvoices,
  employerSubscriptions,
  employerUsers,
  subscriptions,
  workspaces,
} from "@careerflow/db";
import { db } from "./db.js";
import { nextPeriodEnd, nextSubscriptionState } from "./billingRules.js";
import type { InternalPaymentEvent } from "./paymentProvider.js";
import { env } from "./env.js";

export interface PaymentEventResult {
  duplicate: boolean;
  subscription: Record<string, unknown> | null;
  invoice: Record<string, unknown> | null;
}

export type BillingAction = "checkout" | "upgrade";

export class BillingTransitionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BillingTransitionError";
  }
}

function assertPaymentEvent(event: InternalPaymentEvent): void {
  if (event.eventType !== "checkout.succeeded") {
    throw new Error("unsupported_payment_event");
  }
  if (
    event.provider === "mock" &&
    (!env.DEMO_MODE ||
      env.PAYMENT_PROVIDER !== "mock" ||
      env.NODE_ENV === "production")
  ) {
    throw new Error("mock_payment_event_not_allowed");
  }
}

async function loadInvoiceForEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  event: InternalPaymentEvent,
) {
  const [existing] = await tx
    .select({ invoiceId: billingEvents.invoiceId })
    .from(billingEvents)
    .where(
      and(
        eq(billingEvents.provider, event.provider),
        eq(billingEvents.eventId, event.eventId),
      ),
    )
    .limit(1);
  if (!existing?.invoiceId) return null;
  return (
    (
      await tx
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.id, existing.invoiceId))
        .limit(1)
    )[0] ?? null
  );
}

export async function completePaymentEvent(
  event: InternalPaymentEvent,
  action: BillingAction = "checkout",
): Promise<PaymentEventResult> {
  assertPaymentEvent(event);
  if (!Number.isInteger(event.amountCents) || event.amountCents < 0) {
    throw new Error("invalid_payment_amount");
  }

  return db.transaction(async (tx) => {
    const accountLockKey = `careerflow:billing:${event.accountKind}:${event.accountId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${accountLockKey}, 0))`,
    );

    const priorEvent = await loadInvoiceForEvent(tx, event);
    if (
      priorEvent !== null ||
      (
        await tx
          .select({ id: billingEvents.id })
          .from(billingEvents)
          .where(
            and(
              eq(billingEvents.provider, event.provider),
              eq(billingEvents.eventId, event.eventId),
            ),
          )
          .limit(1)
      ).length > 0
    ) {
      return { duplicate: true, subscription: null, invoice: priorEvent };
    }

    const periodStart = event.occurredAt;
    const periodEnd = nextPeriodEnd(periodStart);
    let existingSubscription:
      | typeof subscriptions.$inferSelect
      | typeof employerSubscriptions.$inferSelect
      | null = null;
    let invoiceOwner: {
      workspaceId: string | null;
      employerUserId: string | null;
    };
    let invoiceSub: {
      subscriptionId: string | null;
      employerSubscriptionId: string | null;
    };

    if (event.accountKind === "candidate") {
      const [workspace] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, event.accountId))
        .limit(1);
      if (!workspace) throw new Error("workspace_not_found");

      existingSubscription =
        (
          await tx
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.workspaceId, event.accountId))
            .orderBy(desc(subscriptions.updatedAt))
            .limit(1)
        )[0] ?? null;
      const transition = nextSubscriptionState({
        currentPlan: existingSubscription?.plan ?? null,
        currentStatus: existingSubscription?.status ?? null,
        requestedPlan: event.plan,
        action,
      });
      if (!transition.allowed) {
        if (transition.reason === "already_on_plan") {
          return {
            duplicate: true,
            subscription: existingSubscription,
            invoice: null,
          };
        }
        throw new BillingTransitionError(transition.reason);
      }
      invoiceOwner = { workspaceId: event.accountId, employerUserId: null };
      invoiceSub = { subscriptionId: null, employerSubscriptionId: null };
    } else {
      const [employer] = await tx
        .select({ id: employerUsers.id })
        .from(employerUsers)
        .where(eq(employerUsers.id, event.accountId))
        .limit(1);
      if (!employer) throw new Error("employer_not_found");

      existingSubscription =
        (
          await tx
            .select()
            .from(employerSubscriptions)
            .where(eq(employerSubscriptions.employerUserId, event.accountId))
            .orderBy(desc(employerSubscriptions.updatedAt))
            .limit(1)
        )[0] ?? null;
      const transition = nextSubscriptionState({
        currentPlan: existingSubscription?.plan ?? null,
        currentStatus: existingSubscription?.status ?? null,
        requestedPlan: event.plan,
        action,
      });
      if (!transition.allowed) {
        if (transition.reason === "already_on_plan") {
          return {
            duplicate: true,
            subscription: existingSubscription,
            invoice: null,
          };
        }
        throw new BillingTransitionError(transition.reason);
      }
      invoiceOwner = { workspaceId: null, employerUserId: event.accountId };
      invoiceSub = { subscriptionId: null, employerSubscriptionId: null };
    }

    const insertedEvent = await tx
      .insert(billingEvents)
      .values({
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.eventType,
        payload: {
          accountKind: event.accountKind,
          accountId: event.accountId,
          plan: event.plan,
          amountCents: event.amountCents,
          currency: event.currency,
        },
      })
      .onConflictDoNothing({
        target: [billingEvents.provider, billingEvents.eventId],
      })
      .returning({ id: billingEvents.id });

    if (!insertedEvent.length) {
      return {
        duplicate: true,
        subscription: null,
        invoice: await loadInvoiceForEvent(tx, event),
      };
    }

    const values = {
      plan: event.plan,
      status: "active" as const,
      provider: event.provider,
      externalId: event.externalSubscriptionId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      canceledAt: null,
      updatedAt: periodStart,
    };
    let subscription: Record<string, unknown>;
    if (event.accountKind === "candidate") {
      if (existingSubscription && existingSubscription.status !== "canceled") {
        subscription = (
          await tx
            .update(subscriptions)
            .set(values)
            .where(eq(subscriptions.id, existingSubscription.id))
            .returning()
        )[0] as unknown as Record<string, unknown>;
      } else {
        subscription = (
          await tx
            .insert(subscriptions)
            .values({ workspaceId: event.accountId, ...values })
            .returning()
        )[0] as unknown as Record<string, unknown>;
      }
      invoiceSub = {
        subscriptionId: subscription.id as string,
        employerSubscriptionId: null,
      };
    } else {
      if (existingSubscription && existingSubscription.status !== "canceled") {
        subscription = (
          await tx
            .update(employerSubscriptions)
            .set(values)
            .where(eq(employerSubscriptions.id, existingSubscription.id))
            .returning()
        )[0] as unknown as Record<string, unknown>;
      } else {
        subscription = (
          await tx
            .insert(employerSubscriptions)
            .values({ employerUserId: event.accountId, ...values })
            .returning()
        )[0] as unknown as Record<string, unknown>;
      }
      invoiceSub = {
        subscriptionId: null,
        employerSubscriptionId: subscription.id as string,
      };
    }

    const invoice = (
      await tx
        .insert(billingInvoices)
        .values({
          ...invoiceOwner,
          ...invoiceSub,
          amountCents: event.amountCents,
          currency: event.currency,
          status: "paid",
          provider: event.provider,
          externalInvoiceId: event.externalInvoiceId,
          description: `${event.plan} monthly subscription — ${event.provider}`,
          isSynthetic: event.provider === "mock",
          periodStart,
          periodEnd,
          issuedAt: periodStart,
          paidAt: periodStart,
        })
        .returning()
    )[0]!;

    await tx
      .update(billingEvents)
      .set({ invoiceId: invoice.id, processedAt: periodStart })
      .where(
        and(
          eq(billingEvents.provider, event.provider),
          eq(billingEvents.eventId, event.eventId),
        ),
      );

    return {
      duplicate: false,
      subscription,
      invoice: invoice as Record<string, unknown>,
    };
  });
}

export async function cancelCandidateSubscription(workspaceId: string) {
  return db.transaction(async (tx) => {
    const accountLockKey = `careerflow:billing:candidate:${workspaceId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${accountLockKey}, 0))`,
    );
    const current = (
      await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(1)
    )[0];
    if (!current || current.status === "canceled") return null;
    const now = new Date();
    return (
      (
        await tx
          .update(subscriptions)
          .set({ status: "canceled", canceledAt: now, updatedAt: now })
          .where(eq(subscriptions.id, current.id))
          .returning()
      )[0] ?? null
    );
  });
}

export async function cancelEmployerSubscription(employerUserId: string) {
  return db.transaction(async (tx) => {
    const accountLockKey = `careerflow:billing:employer:${employerUserId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${accountLockKey}, 0))`,
    );
    const current = (
      await tx
        .select()
        .from(employerSubscriptions)
        .where(eq(employerSubscriptions.employerUserId, employerUserId))
        .orderBy(desc(employerSubscriptions.updatedAt))
        .limit(1)
    )[0];
    if (!current || current.status === "canceled") return null;
    const now = new Date();
    return (
      (
        await tx
          .update(employerSubscriptions)
          .set({ status: "canceled", canceledAt: now, updatedAt: now })
          .where(eq(employerSubscriptions.id, current.id))
          .returning()
      )[0] ?? null
    );
  });
}
