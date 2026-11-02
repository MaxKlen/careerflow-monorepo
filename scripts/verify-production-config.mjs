#!/usr/bin/env node

const env = (name) => (process.env[name] ?? "").trim();
const problems = [];
const fail = (message) => problems.push(message);

if (env("NODE_ENV") !== "production") fail('NODE_ENV must be "production".');

const required = [
  "DATABASE_URL",
  "APP_URL",
  "ADMIN_URL",
  "EMPLOYER_URL",
  "NEXT_PUBLIC_API_URL",
  "SESSION_SECRET",
  "STORAGE_DIR",
];
for (const name of required) if (!env(name)) fail(`${name} is required.`);

const secret = env("SESSION_SECRET");
if (secret) {
  const devDefault = "dev-only-session-secret-replace-in-production";
  if (
    secret === devDefault ||
    /replace|changeme|example|secret$/i.test(secret)
  ) {
    fail("SESSION_SECRET looks like a placeholder or the development default.");
  }
  if (secret.length < 32)
    fail("SESSION_SECRET must be at least 32 characters.");
  if (new Set(secret).size < 10)
    fail("SESSION_SECRET has too little variety (use a random generator).");
}

const privateHost = (host) => {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  )
    return true;
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized === "::")
    return true;
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (match) {
    const [a, b] = [Number(match[1]), Number(match[2])];
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return false;
};

for (const name of [
  "APP_URL",
  "ADMIN_URL",
  "EMPLOYER_URL",
  "NEXT_PUBLIC_API_URL",
]) {
  const raw = env(name);
  if (!raw) continue;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") fail(`${name} must use HTTPS.`);
    if (privateHost(url.hostname))
      fail(`${name} must not point at a local or private host.`);
    if (url.username || url.password)
      fail(`${name} must not embed credentials.`);
  } catch {
    fail(`${name} is not a valid URL.`);
  }
}

const database = env("DATABASE_URL");
if (database) {
  try {
    const url = new URL(database);
    if (!/^postgres(?:ql)?:$/.test(url.protocol))
      fail("DATABASE_URL must be a postgres:// or postgresql:// URL.");
    const dbHost = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      dbHost === "localhost" ||
      dbHost.endsWith(".localhost") ||
      dbHost === "::1" ||
      /^127\./.test(dbHost) ||
      dbHost === "0.0.0.0"
    ) {
      fail("DATABASE_URL must not point at loopback in production.");
    }
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }
}

const storage = env("STORAGE_DIR");
if (storage) {
  if (!storage.startsWith("/"))
    fail("STORAGE_DIR must be an absolute path on durable storage.");
  if (/^\/(tmp|var\/tmp|dev\/shm)(\/|$)/.test(storage))
    fail("STORAGE_DIR must not be under a temporary directory.");
}

if (env("EMAIL_ENABLED").toLowerCase() === "true") {
  for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"])
    if (!env(name)) fail(`${name} is required when EMAIL_ENABLED=true.`);
  const port = env("SMTP_PORT");
  if (port && !/^\d{2,5}$/.test(port)) fail("SMTP_PORT must be a number.");
}

if (problems.length) {
  console.error("Production configuration check FAILED:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  "Production configuration checks passed (names and shapes only; this is not a security review).",
);
