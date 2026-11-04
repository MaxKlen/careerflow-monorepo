import { describe, expect, it } from "vitest";
import {
  canAccessSubscription,
  nextPeriodEnd,
  nextSubscriptionState,
} from "./billingRules.js";

describe("billing state transitions", () => {
  it("grants access only to active and trialing subscriptions", () => {
    expect(canAccessSubscription("active")).toBe(true);
    expect(canAccessSubscription("trialing")).toBe(true);
    expect(canAccessSubscription("past_due")).toBe(false);
    expect(canAccessSubscription("canceled")).toBe(false);
  });

  it("allows checkout for a new plan and requires upgrade for an active plan change", () => {
    expect(
      nextSubscriptionState({
        currentPlan: null,
        currentStatus: null,
        requestedPlan: "plus",
        action: "checkout",
      }),
    ).toEqual({ allowed: true, plan: "plus" });
    expect(
      nextSubscriptionState({
        currentPlan: "plus",
        currentStatus: "active",
        requestedPlan: "growth",
        action: "checkout",
      }),
    ).toEqual({ allowed: false, reason: "use_upgrade_action" });
    expect(
      nextSubscriptionState({
        currentPlan: "plus",
        currentStatus: "active",
        requestedPlan: "growth",
        action: "upgrade",
      }),
    ).toEqual({ allowed: true, plan: "growth" });
  });

  it("rejects duplicate plan selection and downgrades without mutating state", () => {
    expect(
      nextSubscriptionState({
        currentPlan: "plus",
        currentStatus: "active",
        requestedPlan: "plus",
        action: "upgrade",
      }),
    ).toEqual({ allowed: false, reason: "already_on_plan" });
    expect(
      nextSubscriptionState({
        currentPlan: "growth",
        currentStatus: "active",
        requestedPlan: "plus",
        action: "upgrade",
      }),
    ).toEqual({ allowed: false, reason: "plan_downgrade_not_supported" });
  });

  it("allows a canceled account to subscribe again", () => {
    expect(
      nextSubscriptionState({
        currentPlan: "plus",
        currentStatus: "canceled",
        requestedPlan: "starter",
        action: "checkout",
      }),
    ).toEqual({ allowed: true, plan: "starter" });
  });

  it("advances invoice periods by one UTC month", () => {
    expect(
      nextPeriodEnd(new Date("2026-11-04T12:00:00.000Z")).toISOString(),
    ).toBe("2026-12-04T12:00:00.000Z");
  });
});
