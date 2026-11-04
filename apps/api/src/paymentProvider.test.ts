import { describe, expect, it } from "vitest";
import { mockCheckoutIdentity } from "./billingIdentity.js";

describe("mock checkout idempotency identity", () => {
  it("returns the same event and invoice for the same request key", () => {
    const first = mockCheckoutIdentity(
      "candidate",
      "workspace-123",
      "plus",
      "1f4f4b44-4123-4c85-a75f-4a971e84f098",
    );
    const retry = mockCheckoutIdentity(
      "candidate",
      "workspace-123",
      "plus",
      "1f4f4b44-4123-4c85-a75f-4a971e84f098",
    );
    expect(retry).toEqual(first);
  });

  it("uses a fresh identity for a separate checkout, including a later resubscription", () => {
    const first = mockCheckoutIdentity(
      "candidate",
      "workspace-123",
      "plus",
      "1f4f4b44-4123-4c85-a75f-4a971e84f098",
    );
    const newPurchase = mockCheckoutIdentity(
      "candidate",
      "workspace-123",
      "plus",
      "74e53d50-1a32-4113-8dbd-69ade44ff23d",
    );
    expect(newPurchase.eventId).not.toBe(first.eventId);
    expect(newPurchase.externalInvoiceId).not.toBe(first.externalInvoiceId);
  });
});
