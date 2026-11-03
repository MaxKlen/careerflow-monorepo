import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
for (const p of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../../../.env"),
]) {
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}
const optionalEnvString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().optional(),
);
const optionalEnvUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().url().optional(),
);
const emailEnabled = z
  .preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off", ""].includes(normalized)) return false;
    }
    return value;
  }, z.boolean())
  .default(false);
const Schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_URL: z.string().url().default("http://localhost:3001"),

  EMPLOYER_URL: z.string().url().default("http://localhost:3002"),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("dev-only-session-secret-replace-in-production"),
  STORAGE_DIR: z.string().min(1).default("./data/uploads"),
  ADMIN_BOOTSTRAP_TOKEN: optionalEnvString,
  MEH_PROVIDER_URL: optionalEnvUrl,
  MEH_PROVIDER_KEY: optionalEnvString,
  MEH_PROVIDER_MODEL: optionalEnvString,
  MEH_SYSTEM_PROMPT: optionalEnvString,
  SMTP_HOST: optionalEnvString,
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: optionalEnvString,
  SMTP_PASS: optionalEnvString,
  SMTP_FROM: z.string().default("CareerFlow <noreply@careerflow.local>"),
  EMAIL_ENABLED: emailEnabled,
  PAYMENT_PROVIDER: z
    .enum(["none", "stripe", "paystack", "paddle"])
    .default("none"),
});
const parsedEnv = Schema.parse(process.env);
if (parsedEnv.NODE_ENV === "production") {
  const localDefaults = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ]);
  if (
    parsedEnv.SESSION_SECRET === "dev-only-session-secret-replace-in-production"
  ) {
    throw new Error(
      "SESSION_SECRET must be explicitly configured in production",
    );
  }
  if (
    [parsedEnv.APP_URL, parsedEnv.ADMIN_URL, parsedEnv.EMPLOYER_URL].some(
      (url) => localDefaults.has(url),
    )
  ) {
    throw new Error(
      "APP_URL, ADMIN_URL, and EMPLOYER_URL must be explicitly configured in production",
    );
  }
  if (
    parsedEnv.EMAIL_ENABLED &&
    (!parsedEnv.SMTP_HOST || !parsedEnv.SMTP_USER || !parsedEnv.SMTP_PASS)
  ) {
    throw new Error(
      "SMTP_HOST, SMTP_USER, and SMTP_PASS are required when EMAIL_ENABLED=true in production",
    );
  }
}
export const env = parsedEnv;
