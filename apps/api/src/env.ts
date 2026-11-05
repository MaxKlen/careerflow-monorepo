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
const booleanEnv = (fallback: boolean) =>
  z
    .preprocess((value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "off", ""].includes(normalized)) return false;
      }
      return value;
    }, z.boolean())
    .default(fallback);
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
  S3_ENDPOINT: optionalEnvUrl,
  S3_REGION: z.string().trim().default("us-east-1"),
  S3_BUCKET: optionalEnvString,
  S3_ACCESS_KEY_ID: optionalEnvString,
  S3_SECRET_ACCESS_KEY: optionalEnvString,
  S3_FORCE_PATH_STYLE: booleanEnv(false),
  ADMIN_BOOTSTRAP_TOKEN: optionalEnvString,
  MEH_PROVIDER_URL: optionalEnvUrl,
  MEH_PROVIDER_KEY: optionalEnvString,
  MEH_PROVIDER_MODEL: optionalEnvString,
  MEH_SYSTEM_PROMPT: optionalEnvString,
  GEMINI_API_KEY: optionalEnvString,
  GEMINI_MODEL: z.string().trim().default("gemini-2.5-flash"),
  OPENAI_API_KEY: optionalEnvString,
  OPENAI_MODEL: z.string().trim().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  SMTP_HOST: optionalEnvString,
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: optionalEnvString,
  SMTP_PASS: optionalEnvString,
  SMTP_FROM: z.string().default("CareerFlow <noreply@careerflow.local>"),
  EMAIL_ENABLED: booleanEnv(false),
  RESEND_API_KEY: optionalEnvString,
  RESEND_FROM: optionalEnvString,
  DEMO_MODE: booleanEnv(false),
  PAYMENT_PROVIDER: z
    .enum(["none", "mock", "stripe", "paymob", "paystack", "paddle"])
    .default("none"),
  STRIPE_SECRET_KEY: optionalEnvString,
  STRIPE_WEBHOOK_SECRET: optionalEnvString,
  STRIPE_PRICE_STARTER: optionalEnvString,
  STRIPE_PRICE_PLUS: optionalEnvString,
  STRIPE_PRICE_GROWTH: optionalEnvString,
  PAYMOB_API_KEY: optionalEnvString,
  PAYMOB_INTEGRATION_ID: optionalEnvString,
  PAYMOB_IFRAME_ID: optionalEnvString,
  PAYMOB_HMAC_SECRET: optionalEnvString,
  PAYMOB_API_URL: z.string().url().default("https://accept.paymob.com/api"),
});
const parsedEnv = Schema.parse(process.env);
if (parsedEnv.PAYMENT_PROVIDER === "mock" && !parsedEnv.DEMO_MODE)
  throw new Error("PAYMENT_PROVIDER=mock requires DEMO_MODE=true");
if (parsedEnv.NODE_ENV === "production") {
  if (parsedEnv.DEMO_MODE || parsedEnv.PAYMENT_PROVIDER === "mock")
    throw new Error(
      "DEMO_MODE and the mock payment provider are disabled in production",
    );
  const localDefaults = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
  ]);
  if (
    parsedEnv.SESSION_SECRET === "dev-only-session-secret-replace-in-production"
  )
    throw new Error(
      "SESSION_SECRET must be explicitly configured in production",
    );
  if (
    [parsedEnv.APP_URL, parsedEnv.ADMIN_URL, parsedEnv.EMPLOYER_URL].some(
      (url) => localDefaults.has(url),
    )
  )
    throw new Error(
      "APP_URL, ADMIN_URL, and EMPLOYER_URL must be explicitly configured in production",
    );
  if (
    parsedEnv.PAYMENT_PROVIDER === "stripe" &&
    (!parsedEnv.STRIPE_SECRET_KEY || !parsedEnv.STRIPE_WEBHOOK_SECRET)
  )
    throw new Error(
      "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required when PAYMENT_PROVIDER=stripe",
    );
  if (
    parsedEnv.PAYMENT_PROVIDER === "paymob" &&
    (!parsedEnv.PAYMOB_API_KEY || !parsedEnv.PAYMOB_HMAC_SECRET)
  )
    throw new Error(
      "PAYMOB_API_KEY and PAYMOB_HMAC_SECRET are required when PAYMENT_PROVIDER=paymob",
    );
  if (
    parsedEnv.EMAIL_ENABLED &&
    !parsedEnv.RESEND_API_KEY &&
    (!parsedEnv.SMTP_HOST || !parsedEnv.SMTP_USER || !parsedEnv.SMTP_PASS)
  )
    throw new Error(
      "SMTP settings or RESEND_API_KEY are required when EMAIL_ENABLED=true in production",
    );
}
export const env = parsedEnv;
