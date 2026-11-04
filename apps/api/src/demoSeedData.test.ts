import { describe, expect, it } from "vitest";
import { DEMO_COUNTS, generateDemoSeedData } from "./demoSeedData.js";

describe("synthetic investor demo seed", () => {
  const anchor = new Date("2026-11-04T12:00:00.000Z");

  it("uses one deterministic default anchor across separate seed runs", () => {
    expect(generateDemoSeedData()).toEqual(generateDemoSeedData());
  });

  it("generates exactly 500 accounts using reserved example.test addresses", () => {
    const data = generateDemoSeedData(anchor);
    expect(DEMO_COUNTS).toEqual({ candidates: 440, employers: 55, admins: 5 });
    expect(data.totals.accounts).toBe(500);
    const emails = [
      ...data.candidates.map((row) => row.email),
      ...data.employers.map((row) => row.email),
      ...data.admins.map((row) => row.email),
    ];
    expect(new Set(emails).size).toBe(500);
    expect(emails.every((email) => email.endsWith(".test"))).toBe(true);
  });

  it("generates applications plus active and canceled synthetic subscription invoices", () => {
    const data = generateDemoSeedData(anchor);
    expect(data.workspaces).toHaveLength(440);
    expect(data.applications).toHaveLength(400);
    expect(data.totals.activeSubscriptions).toBe(210);
    expect(data.totals.invoices).toBe(232);
    expect(
      data.candidateSubscriptions.every((row) =>
        row.externalInvoiceId.startsWith("seed-invoice:candidate:"),
      ),
    ).toBe(true);
    expect(
      data.employerSubscriptions.every((row) =>
        row.externalInvoiceId.startsWith("seed-invoice:employer:"),
      ),
    ).toBe(true);
  });

  it("is stable for the same fixed anchor and marks job listings as synthetic", () => {
    const first = generateDemoSeedData(anchor);
    const second = generateDemoSeedData(anchor);
    expect(
      first.candidates.map((row) => [row.id, row.email, row.name]),
    ).toEqual(second.candidates.map((row) => [row.id, row.email, row.name]));
    expect(first.applications.map((row) => row.id)).toEqual(
      second.applications.map((row) => row.id),
    );
    expect(
      first.opportunities.every((row) =>
        row.description.includes("Synthetic investor-demo vacancy"),
      ),
    ).toBe(true);
  });
});
