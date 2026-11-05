import { createHmac, randomUUID } from "node:crypto";
import Stripe from "stripe";
import type { BillingAccountKind, BillingPlan } from "./billingCatalog.js";
import { env } from "./env.js";
import { mockCheckoutIdentity } from "./billingIdentity.js";

export type BillingAccount =
  | { kind: "candidate"; workspaceId: string; ownerUserId: string }
  | { kind: "employer"; employerUserId: string };
export interface InternalPaymentEvent {
  provider: "mock" | "stripe" | "paymob";
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
export type CheckoutResult =
  | { kind: "internal_event"; demo: boolean; event: InternalPaymentEvent }
  | { kind: "hosted_checkout"; demo: false; url: string; externalId: string };
export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  startCheckout(
    account: BillingAccount,
    plan: BillingPlan,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<CheckoutResult | null>;
  cancelSubscription(externalSubscriptionId: string): Promise<void>;
  parseWebhook(
    rawBody: string,
    signature?: string,
  ): Promise<InternalPaymentEvent | null>;
}
class DisabledPaymentProvider implements PaymentProvider {
  constructor(readonly name: string) {}
  readonly configured = false;
  async startCheckout(): Promise<null> {
    return null;
  }
  async cancelSubscription(): Promise<void> {}
  async parseWebhook(): Promise<null> {
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
    if (!env.DEMO_MODE || env.NODE_ENV === "production")
      throw new Error("mock_payments_disabled");
    const accountId =
      account.kind === "candidate"
        ? account.workspaceId
        : account.employerUserId;
    const identity = mockCheckoutIdentity(
      account.kind,
      accountId,
      plan,
      idempotencyKey,
    );
    return {
      kind: "internal_event",
      demo: true,
      event: {
        provider: "mock",
        eventId: identity.eventId,
        eventType: "checkout.succeeded",
        externalSubscriptionId: `mock-subscription:${account.kind}:${accountId}`,
        externalInvoiceId: identity.externalInvoiceId,
        accountKind: account.kind,
        accountId,
        plan,
        amountCents,
        currency: "USD",
        occurredAt: new Date(),
      },
    };
  }
  async cancelSubscription(): Promise<void> {}
  async parseWebhook(): Promise<null> {
    return null;
  }
}
function planPriceId(plan: BillingPlan): string | undefined {
  return plan === "starter"
    ? env.STRIPE_PRICE_STARTER
    : plan === "plus"
      ? env.STRIPE_PRICE_PLUS
      : env.STRIPE_PRICE_GROWTH;
}
class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly configured = true;
  private readonly client = new Stripe(env.STRIPE_SECRET_KEY!);
  async startCheckout(
    account: BillingAccount,
    plan: BillingPlan,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<CheckoutResult> {
    const accountId =
      account.kind === "candidate"
        ? account.workspaceId
        : account.employerUserId;
    const price = planPriceId(plan);
    const session = await this.client.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [
          {
            price_data: price
              ? undefined
              : {
                  currency: "usd",
                  product_data: { name: `CareerFlow ${plan}` },
                  recurring: { interval: "month" },
                  unit_amount: amountCents,
                },
            price,
            quantity: 1,
          },
        ],
        success_url: `${account.kind === "employer" ? env.EMPLOYER_URL : env.APP_URL}/billing?checkout=success`,
        cancel_url: `${account.kind === "employer" ? env.EMPLOYER_URL : env.APP_URL}/billing?checkout=cancelled`,
        metadata: {
          accountKind: account.kind,
          accountId,
          plan,
          amountCents: String(amountCents),
          idempotencyKey,
        },
        subscription_data: {
          metadata: {
            accountKind: account.kind,
            accountId,
            plan,
            amountCents: String(amountCents),
          },
        },
      },
      { idempotencyKey },
    );
    if (!session.url) throw new Error("stripe_checkout_url_missing");
    return {
      kind: "hosted_checkout",
      demo: false,
      url: session.url,
      externalId: String(session.id),
    };
  }
  async cancelSubscription(externalSubscriptionId: string): Promise<void> {
    await this.client.subscriptions.cancel(externalSubscriptionId);
  }
  async parseWebhook(
    rawBody: string,
    signature?: string,
  ): Promise<InternalPaymentEvent | null> {
    if (!signature || !env.STRIPE_WEBHOOK_SECRET)
      throw new Error("stripe_webhook_signature_required");
    const event = this.client.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
    if (event.type !== "checkout.session.completed") return null;
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata ?? {};
    if (!metadata.accountKind || !metadata.accountId || !metadata.plan)
      throw new Error("stripe_webhook_metadata_missing");
    return {
      provider: "stripe",
      eventId: event.id,
      eventType: "checkout.succeeded",
      externalSubscriptionId: String(session.subscription ?? session.id),
      externalInvoiceId: String(
        session.invoice ?? `stripe-invoice:${event.id}`,
      ),
      accountKind: metadata.accountKind as BillingAccountKind,
      accountId: metadata.accountId,
      plan: metadata.plan as BillingPlan,
      amountCents: Number(metadata.amountCents ?? 0),
      currency: "USD",
      occurredAt: new Date(event.created * 1000),
    };
  }
}
class PaymobPaymentProvider implements PaymentProvider {
  readonly name = "paymob";
  readonly configured = true;
  private async post<T>(
    path: string,
    body: unknown,
    token?: string,
  ): Promise<T> {
    const response = await fetch(`${env.PAYMOB_API_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`paymob_http_${response.status}`);
    return (await response.json()) as T;
  }
  async startCheckout(
    account: BillingAccount,
    plan: BillingPlan,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<CheckoutResult> {
    const accountId =
      account.kind === "candidate"
        ? account.workspaceId
        : account.employerUserId;
    const auth = await this.post<{ token: string }>("/auth/tokens", {
      api_key: env.PAYMOB_API_KEY,
    });
    const order = await this.post<{ id: number }>("/ecommerce/orders", {
      auth_token: auth.token,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: "USD",
      items: [],
      merchant_order_id: idempotencyKey,
    });
    const paymentKey = await this.post<{ token: string }>(
      "/acceptance/payment_keys",
      {
        auth_token: auth.token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: order.id,
        currency: "USD",
        integration_id: Number(env.PAYMOB_INTEGRATION_ID),
        billing_data: {
          first_name: "CareerFlow",
          last_name: "Customer",
          email: "billing@careerflow.local",
          phone_number: "+201000000000",
          apartment: "NA",
          floor: "NA",
          street: "NA",
          building: "NA",
          shipping_method: "PKG",
          postal_code: "NA",
          city: "NA",
          state: "NA",
          country: "US",
        },
        item: [],
      },
    );
    return {
      kind: "hosted_checkout",
      demo: false,
      url: `https://accept.paymob.com/api/acceptance/iframes/${env.PAYMOB_IFRAME_ID}?payment_token=${encodeURIComponent(paymentKey.token)}`,
      externalId: String(order.id),
    };
  }
  async cancelSubscription(): Promise<void> {
    /* Paymob recurring cancellation is merchant-dashboard/API-product specific; local access is still revoked by the route. */
  }
  async parseWebhook(
    rawBody: string,
    signature?: string,
  ): Promise<InternalPaymentEvent | null> {
    if (!signature || !env.PAYMOB_HMAC_SECRET)
      throw new Error("paymob_webhook_signature_required");
    const expected = createHmac("sha512", env.PAYMOB_HMAC_SECRET)
      .update(rawBody)
      .digest("hex");
    if (signature !== expected) throw new Error("paymob_invalid_signature");
    const payload = JSON.parse(rawBody) as {
      id?: number;
      success?: boolean;
      order?: { id?: number };
      amount_cents?: number;
      merchant_order_id?: string;
      created_at?: string;
      accountKind?: BillingAccountKind;
      accountId?: string;
      plan?: BillingPlan;
    };
    if (
      !payload.success ||
      !payload.accountKind ||
      !payload.accountId ||
      !payload.plan
    )
      return null;
    return {
      provider: "paymob",
      eventId: String(payload.id ?? randomUUID()),
      eventType: "checkout.succeeded",
      externalSubscriptionId: `paymob-order:${payload.order?.id ?? payload.id}`,
      externalInvoiceId: `paymob-invoice:${payload.id ?? randomUUID()}`,
      accountKind: payload.accountKind,
      accountId: payload.accountId,
      plan: payload.plan,
      amountCents: payload.amount_cents ?? 0,
      currency: "USD",
      occurredAt: payload.created_at
        ? new Date(payload.created_at)
        : new Date(),
    };
  }
}
export function getPaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "stripe" && env.STRIPE_SECRET_KEY)
    return new StripePaymentProvider();
  if (
    env.PAYMENT_PROVIDER === "paymob" &&
    env.PAYMOB_API_KEY &&
    env.PAYMOB_INTEGRATION_ID &&
    env.PAYMOB_IFRAME_ID
  )
    return new PaymobPaymentProvider();
  if (
    env.PAYMENT_PROVIDER === "mock" &&
    env.DEMO_MODE &&
    env.NODE_ENV !== "production"
  )
    return new MockPaymentProvider();
  if (env.PAYMENT_PROVIDER === "none")
    return new DisabledPaymentProvider("none");
  return new DisabledPaymentProvider(`${env.PAYMENT_PROVIDER}-not-configured`);
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
