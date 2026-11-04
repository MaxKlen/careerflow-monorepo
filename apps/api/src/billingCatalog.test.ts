import { describe, expect, it } from "vitest";
import { getAccessSnapshot } from "./billingCatalog.js";

describe("billing access snapshot", () => {
  it("grants the active candidate plan's feature set", () => {
    const access = getAccessSnapshot("candidate", {
      plan: "plus",
      status: "active",
    });
    expect(access.effectivePlan).toBe("plus");
    expect(access.hasSubscriptionAccess).toBe(true);
    expect(access.hasPaidAccess).toBe(true);
    expect(access.features).toContain("Advanced editor");
  });

  it("returns free Starter access after cancellation", () => {
    const access = getAccessSnapshot("employer", {
      plan: "growth",
      status: "canceled",
    });
    expect(access.effectivePlan).toBe("starter");
    expect(access.hasSubscriptionAccess).toBe(false);
    expect(access.hasPaidAccess).toBe(false);
    expect(access.features).toContain("Basic collaboration");
  });

  it("provides the free Starter feature set when there is no subscription", () => {
    const access = getAccessSnapshot("candidate", null);
    expect(access.effectivePlan).toBe("starter");
    expect(access.features).toContain("Offline guidance");
  });
});
