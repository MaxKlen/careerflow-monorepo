import type { BillingAccountKind, BillingPlan } from "./billingCatalog.js";

export function mockCheckoutIdentity(
  accountKind: BillingAccountKind,
  accountId: string,
  plan: BillingPlan,
  idempotencyKey: string,
): { eventId: string; externalInvoiceId: string } {
  const stableKey = `${accountKind}:${accountId}:${plan}:${encodeURIComponent(idempotencyKey)}`;
  return {
    eventId: `mock-event:${stableKey}`,
    externalInvoiceId: `mock-invoice:${stableKey}`,
  };
}
