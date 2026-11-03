import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
};

describe("repository launch readiness", () => {
  it("exposes reproducible validation commands", () => {
    expect(packageJson.scripts).toMatchObject({
      lint: expect.any(String),
      typecheck: expect.any(String),
      test: expect.any(String),
      "test:e2e": expect.any(String),
      build: expect.any(String),
      "verify:production-config": expect.any(String),
    });
  });

  it("keeps environment files and production runbooks explicit", () => {
    expect(existsSync(resolve(root, ".env"))).toBe(false);
    expect(existsSync(resolve(root, ".env.example"))).toBe(true);
    expect(existsSync(resolve(root, "docs/production-runbook.md"))).toBe(true);
    expect(
      existsSync(resolve(root, "docs/privacy-and-retention-draft.md")),
    ).toBe(true);
  });
});
