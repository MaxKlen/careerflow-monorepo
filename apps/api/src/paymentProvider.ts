export interface CheckoutSession {
  url: string;
  externalId: string;
  provider: string;
}
export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  startCheckout(workspaceId: string, plan: 'starter' | 'plus' | 'growth', successUrl: string, cancelUrl: string): Promise<CheckoutSession | null>;
}

/** M9 intentionally has no payment rail. Implement a real adapter here only after a rail is selected. */
class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'none';
  readonly configured = false;
  async startCheckout(): Promise<CheckoutSession | null> { return null; }
}

export function getPaymentProvider(): PaymentProvider {
  return new UnconfiguredPaymentProvider();
}
