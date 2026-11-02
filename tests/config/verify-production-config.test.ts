import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = new URL(
  "../../scripts/verify-production-config.mjs",
  import.meta.url,
).pathname;
const good: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.example.com/careerflow",
  APP_URL: "https://app.example.com",
  ADMIN_URL: "https://admin.example.com",
  EMPLOYER_URL: "https://employer.example.com",
  NEXT_PUBLIC_API_URL: "https://api.example.com",
  STORAGE_DIR: "/data/uploads",
  SESSION_SECRET: "Qx7vT2mK9pLr4WzB8nYc1dFh6JsA3eGu0o",
};

const run = (overrides: Record<string, string> = {}) =>
  spawnSync(process.execPath, [script], {
    env: { PATH: process.env.PATH ?? "", ...overrides },
    encoding: "utf8",
  });

describe("verify-production-config", () => {
  it("passes a complete HTTPS production config", () => {
    expect(run(good).status).toBe(0);
  });

  it("accepts a private-network database host", () => {
    expect(
      run({ ...good, DATABASE_URL: "postgresql://u:p@10.0.3.5/x" }).status,
    ).toBe(0);
  });

  it("fails an empty environment and lists every missing name", () => {
    const result = run();
    expect(result.status).toBe(1);
    for (const name of [
      "DATABASE_URL",
      "APP_URL",
      "ADMIN_URL",
      "EMPLOYER_URL",
      "NEXT_PUBLIC_API_URL",
      "SESSION_SECRET",
      "STORAGE_DIR",
    ]) {
      expect(result.stderr).toContain(name);
    }
  });

  it("rejects weak secrets and malformed production URLs", () => {
    expect(
      run({
        ...good,
        SESSION_SECRET: "dev-only-session-secret-replace-in-production",
      }).status,
    ).toBe(1);
    expect(run({ ...good, SESSION_SECRET: "short" }).status).toBe(1);
    expect(run({ ...good, SESSION_SECRET: "a".repeat(40) }).status).toBe(1);
    expect(run({ ...good, APP_URL: "http://app.example.com" }).status).toBe(1);
    expect(run({ ...good, ADMIN_URL: "https://localhost:3001" }).status).toBe(
      1,
    );
    expect(run({ ...good, EMPLOYER_URL: "https://192.168.1.5" }).status).toBe(
      1,
    );
    expect(
      run({ ...good, NEXT_PUBLIC_API_URL: "https://user:pass@api.example.com" })
        .status,
    ).toBe(1);
  });

  it("rejects loopback databases and temporary or relative storage", () => {
    expect(
      run({ ...good, DATABASE_URL: "postgresql://u:p@localhost/x" }).status,
    ).toBe(1);
    expect(run({ ...good, STORAGE_DIR: "/tmp/uploads" }).status).toBe(1);
    expect(run({ ...good, STORAGE_DIR: "relative/path" }).status).toBe(1);
  });

  it("requires SMTP settings only when email is enabled", () => {
    expect(run({ ...good, EMAIL_ENABLED: "true" }).status).toBe(1);
    expect(
      run({
        ...good,
        EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "u",
        SMTP_PASS: "p",
      }).status,
    ).toBe(0);
  });

  it("never prints secret values", () => {
    const secret = "short-secret-value-123";
    const result = run({ ...good, SESSION_SECRET: secret });
    expect(`${result.stderr}${result.stdout}`).not.toContain(secret);
  });
});
