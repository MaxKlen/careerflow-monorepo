import { randomUUID } from "node:crypto";
import type { BillingAccountKind, BillingPlan } from "./billingCatalog.js";
import { env } from "./env.js";
import { mockCheckoutIdentity } from "./billingIdentity.js";

export type BillingAccount =
  | { kind: "candidate"; workspaceId: string; ownerUserId: string }
  | { kind: "employer"; employerUserId: string };

export interface InternalPaymentEvent {
  provider: "mock";
  eventId: string;
  eventType: "checkout.succeeded";
  externalSubscriptionId: string;
  externalInvoiceId: string;
  accountKind: BillingAccountKind;
  accountId: string;
  plan: BillingPlan;
  amountCents: number;
  currency: "USD";
  occurredAt: Date;
}

export interface CheckoutResult {
  kind: "internal_event";
  demo: true;
  event: InternalPaymentEvent;
}

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  startCheckout(
    account: BillingAccount,
    plan: BillingPlan,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<CheckoutResult | null>;
}

class DisabledPaymentProvider implements PaymentProvider {
  constructor(readonly name: string) {}
  readonly configured = false;
  async startCheckout(): Promise<null> {
    return null;
  }
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly configured = true;

  async startCheckout(
    account: BillingAccount,
    plan: BillingPlan,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<CheckoutResult> {
    if (!env.DEMO_MODE || env.NODE_ENV === "production") {
      throw new Error("mock_payments_disabled");
    }
    const occurredAt = new Date();
    const accountId =
      account.kind === "candidate"
        ? account.workspaceId
        : account.employerUserId;
    const accountKind = account.kind;
    const identity = mockCheckoutIdentity(
      accountKind,
      accountId,
      plan,
      idempotencyKey,
    );
    const event: InternalPaymentEvent = {
      provider: "mock",
      eventId: identity.eventId,
      eventType: "checkout.succeeded",
      externalSubscriptionId: `mock-subscription:${accountKind}:${accountId}`,
      externalInvoiceId: identity.externalInvoiceId,
      accountKind,
      accountId,
      plan,
      amountCents,
      currency: "USD",
      occurredAt,
    };
    return { kind: "internal_event", demo: true, event };
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "mock") {
    if (!env.DEMO_MODE || env.NODE_ENV === "production") {
      return new DisabledPaymentProvider("mock-disabled");
    }
    return new MockPaymentProvider();
  }
  if (env.PAYMENT_PROVIDER === "none")
    return new DisabledPaymentProvider("none");
  // Real provider names are recognized for configuration clarity, not implemented here.
  return new DisabledPaymentProvider(`${env.PAYMENT_PROVIDER}-not-implemented`);
}

export function createTestPaymentEvent(input: {
  account: BillingAccount;
  plan: BillingPlan;
  amountCents: number;
  eventId?: string;
  at?: Date;
}): InternalPaymentEvent {
  const accountId =
    input.account.kind === "candidate"
      ? input.account.workspaceId
      : input.account.employerUserId;
  return {
    provider: "mock",
    eventId: input.eventId ?? `test-event:${randomUUID()}`,
    eventType: "checkout.succeeded",
    externalSubscriptionId: `mock-subscription:${input.account.kind}:${accountId}`,
    externalInvoiceId: `mock-invoice:${randomUUID()}`,
    accountKind: input.account.kind,
    accountId,
    plan: input.plan,
    amountCents: input.amountCents,
    currency: "USD",
    occurredAt: input.at ?? new Date(),
  };
}
