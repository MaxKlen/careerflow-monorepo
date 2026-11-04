import { describe, expect, it } from "vitest";
import { isAllowedDemoDatabase } from "./demoGuard.js";

describe("demo database guard", () => {
  it("accepts an explicitly demo-mode local demo database", () => {
    expect(
      isAllowedDemoDatabase({
        databaseUrl:
          "postgres://careerflow:local@localhost:5432/careerflow_demo",
        demoMode: true,
        nodeEnv: "development",
      }),
    ).toBe(true);
    expect(
      isAllowedDemoDatabase({
        databaseUrl:
          "postgres://careerflow:local@postgres:5432/careerflow_demo",
        demoMode: true,
        nodeEnv: "development",
      }),
    ).toBe(true);
    expect(
      isAllowedDemoDatabase({
        databaseUrl: "postgres://x@[::1]:5432/careerflow_demo",
        demoMode: true,
        nodeEnv: "development",
      }),
    ).toBe(true);
  });

  it("rejects production, disabled-demo, remote, and ordinary databases", () => {
    expect(
      isAllowedDemoDatabase({
        databaseUrl: "postgres://x@y.example.com:5432/careerflow_demo",
        demoMode: true,
        nodeEnv: "development",
      }),
    ).toBe(false);
    expect(
      isAllowedDemoDatabase({
        databaseUrl: "postgres://x@localhost:5432/careerflow",
        demoMode: true,
        nodeEnv: "development",
      }),
    ).toBe(false);
    expect(
      isAllowedDemoDatabase({
        databaseUrl: "postgres://x@localhost:5432/careerflow_demo",
        demoMode: false,
        nodeEnv: "development",
      }),
    ).toBe(false);
    expect(
      isAllowedDemoDatabase({
        databaseUrl: "postgres://x@localhost:5432/careerflow_demo",
        demoMode: true,
        nodeEnv: "production",
      }),
    ).toBe(false);
  });

  it("rejects malformed database URLs", () => {
    expect(
      isAllowedDemoDatabase({
        databaseUrl: "not-a-url",
        demoMode: true,
        nodeEnv: "development",
      }),
    ).toBe(false);
  });
});
