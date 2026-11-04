import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { billingEvents, billingInvoices } from "@careerflow/db";
import { db, pool } from "./db.js";
import { completePaymentEvent } from "./billingService.js";
import type { InternalPaymentEvent } from "./paymentProvider.js";

const workspaceId = process.argv[2];
if (!workspaceId)
  throw new Error("Usage: tsx src/billingEventSmoke.ts <workspaceId>");
const suffix = randomUUID();
const event: InternalPaymentEvent = {
  provider: "mock",
  eventId: `billing-event-smoke:${suffix}`,
  eventType: "checkout.succeeded",
  externalSubscriptionId: `billing-subscription-smoke:${suffix}`,
  externalInvoiceId: `billing-invoice-smoke:${suffix}`,
  accountKind: "candidate",
  accountId: workspaceId,
  plan: "growth",
  amountCents: 2400,
  currency: "USD",
  occurredAt: new Date(),
};

try {
  const [one, two] = await Promise.all([
    completePaymentEvent(event, "upgrade"),
    completePaymentEvent(event, "upgrade"),
  ]);
  const first = one.duplicate ? two : one;
  const replay = one.duplicate ? one : two;
  if (first.duplicate || !first.invoice?.id)
    throw new Error("Concurrent initial payment event was not persisted once");
  if (!replay.duplicate || replay.invoice?.id !== first.invoice.id)
    throw new Error(
      "Concurrent event replay did not return the original invoice",
    );
  const sequentialReplay = await completePaymentEvent(event, "upgrade");
  if (
    !sequentialReplay.duplicate ||
    sequentialReplay.invoice?.id !== first.invoice.id
  )
    throw new Error(
      "Sequential event replay did not return the original invoice",
    );
  const events = await db
    .select({ id: billingEvents.id })
    .from(billingEvents)
    .where(
      and(
        eq(billingEvents.provider, event.provider),
        eq(billingEvents.eventId, event.eventId),
      ),
    );
  const invoices = await db
    .select({ id: billingInvoices.id })
    .from(billingInvoices)
    .where(eq(billingInvoices.externalInvoiceId, event.externalInvoiceId));
  if (events.length !== 1 || invoices.length !== 1)
    throw new Error("Idempotency ledger contains duplicate rows");
  console.log(
    "BILLING_EVENT_IDEMPOTENCY_PASS: concurrent and sequential replays yielded one event and one invoice",
  );
} finally {
  await pool.end();
}
