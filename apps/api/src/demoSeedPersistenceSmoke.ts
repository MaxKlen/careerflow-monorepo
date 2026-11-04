import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminUsers,
  applications,
  billingEvents,
  billingInvoices,
  createDb,
  employerSubscriptions,
  employerUsers,
  subscriptions,
  users,
  workspaces,
} from "@careerflow/db";
import { isAllowedDemoDatabase } from "./demoGuard.js";
import { generateDemoSeedData } from "./demoSeedData.js";

const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !isAllowedDemoDatabase({
    databaseUrl,
    demoMode: process.env.DEMO_MODE === "true",
    nodeEnv: process.env.NODE_ENV ?? "",
  })
) {
  throw new Error(
    "Refusing seed persistence smoke test: requires an explicit local *_demo or *_test database, DEMO_MODE=true and non-production NODE_ENV.",
  );
}

const root = resolve(process.cwd(), "../..");
const data = generateDemoSeedData();
const { db, pool } = createDb(databaseUrl);
const suffix = randomUUID();
const now = new Date();
const sentinel = {
  userId: randomUUID(),
  workspaceId: randomUUID(),
  subscriptionId: randomUUID(),
  invoiceId: randomUUID(),
  eventId: `seed-event:unrelated-smoke:${suffix}`,
  externalInvoiceId: `seed-invoice:unrelated-smoke:${suffix}`,
  email: `reset-scope-${suffix}@example.test`,
};

function runSeedCommand(script: "demo:seed" | "demo:reset"): void {
  try {
    execFileSync("pnpm", [script], {
      cwd: root,
      env: process.env,
      stdio: "pipe",
    });
  } catch (error) {
    const details = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `${script} failed:\n${details.stdout?.toString() ?? ""}\n${details.stderr?.toString() ?? ""}`,
    );
  }
}

async function countSeedRows() {
  const candidateIds = data.candidates.map((row) => row.id);
  const employerIds = data.employers.map((row) => row.id);
  const adminIds = data.admins.map((row) => row.id);
  const invoiceIds = [
    ...data.candidateSubscriptions.map((row) => row.externalInvoiceId),
    ...data.employerSubscriptions.map((row) => row.externalInvoiceId),
  ];
  const eventIds = [
    ...data.candidateSubscriptions.map((row) => row.eventId),
    ...data.employerSubscriptions.map((row) => row.eventId),
  ];
  const [candidateCount, employerCount, adminCount] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, candidateIds))
      .then((rows) => rows.length),
    db
      .select({ id: employerUsers.id })
      .from(employerUsers)
      .where(inArray(employerUsers.id, employerIds))
      .then((rows) => rows.length),
    db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(inArray(adminUsers.id, adminIds))
      .then((rows) => rows.length),
  ]);
  const [workspaceCount, applicationCount, candidateSubscriptionCount] =
    await Promise.all([
      db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          inArray(
            workspaces.id,
            data.workspaces.map((row) => row.id),
          ),
        )
        .then((rows) => rows.length),
      db
        .select({ id: applications.id })
        .from(applications)
        .where(
          inArray(
            applications.id,
            data.applications.map((row) => row.id),
          ),
        )
        .then((rows) => rows.length),
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          inArray(
            subscriptions.id,
            data.candidateSubscriptions.map((row) => row.id),
          ),
        )
        .then((rows) => rows.length),
    ]);
  const [employerSubscriptionCount, invoiceCount, eventCount] =
    await Promise.all([
      db
        .select({ id: employerSubscriptions.id })
        .from(employerSubscriptions)
        .where(
          inArray(
            employerSubscriptions.id,
            data.employerSubscriptions.map((row) => row.id),
          ),
        )
        .then((rows) => rows.length),
      db
        .select({ id: billingInvoices.id })
        .from(billingInvoices)
        .where(inArray(billingInvoices.externalInvoiceId, invoiceIds))
        .then((rows) => rows.length),
      db
        .select({ id: billingEvents.id })
        .from(billingEvents)
        .where(
          and(
            eq(billingEvents.provider, "mock"),
            inArray(billingEvents.eventId, eventIds),
          ),
        )
        .then((rows) => rows.length),
    ]);
  return {
    candidates: candidateCount,
    employers: employerCount,
    admins: adminCount,
    workspaces: workspaceCount,
    applications: applicationCount,
    candidateSubscriptions: candidateSubscriptionCount,
    employerSubscriptions: employerSubscriptionCount,
    invoices: invoiceCount,
    events: eventCount,
  };
}

const expectedCounts = {
  candidates: 440,
  employers: 55,
  admins: 5,
  workspaces: 440,
  applications: 400,
  candidateSubscriptions: 198,
  employerSubscriptions: 34,
  invoices: 232,
  events: 232,
};

try {
  await db.insert(users).values({
    id: sentinel.userId,
    email: sentinel.email,
    passwordHash: "not-a-login-credential",
    displayName: "Unrelated reset-scope sentinel",
    createdAt: now,
  });
  await db.insert(workspaces).values({
    id: sentinel.workspaceId,
    ownerId: sentinel.userId,
    kind: "personal",
    name: "Unrelated reset-scope sentinel workspace",
    createdAt: now,
  });
  await db.insert(subscriptions).values({
    id: sentinel.subscriptionId,
    workspaceId: sentinel.workspaceId,
    plan: "plus",
    status: "active",
    provider: "mock",
    externalId: `sentinel-subscription:${suffix}`,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(billingInvoices).values({
    id: sentinel.invoiceId,
    workspaceId: sentinel.workspaceId,
    employerUserId: null,
    subscriptionId: sentinel.subscriptionId,
    employerSubscriptionId: null,
    amountCents: 1,
    currency: "USD",
    status: "paid",
    provider: "mock",
    externalInvoiceId: sentinel.externalInvoiceId,
    description: "Synthetic reset-scope integration sentinel",
    isSynthetic: true,
    periodStart: now,
    periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    issuedAt: now,
    paidAt: now,
    createdAt: now,
  });
  await db.insert(billingEvents).values({
    provider: "mock",
    eventId: sentinel.eventId,
    eventType: "checkout.succeeded",
    invoiceId: sentinel.invoiceId,
    payload: { synthetic: true, purpose: "reset-scope-test" },
    processedAt: now,
    createdAt: now,
  });

  runSeedCommand("demo:reset");
  const preservedSentinel = await db
    .select({ eventId: billingEvents.eventId })
    .from(billingEvents)
    .where(eq(billingEvents.eventId, sentinel.eventId));
  const preservedInvoice = await db
    .select({ externalInvoiceId: billingInvoices.externalInvoiceId })
    .from(billingInvoices)
    .where(eq(billingInvoices.externalInvoiceId, sentinel.externalInvoiceId));
  if (preservedSentinel.length !== 1 || preservedInvoice.length !== 1) {
    throw new Error("Demo reset deleted an unrelated synthetic sentinel row");
  }

  const firstCounts = await countSeedRows();
  if (JSON.stringify(firstCounts) !== JSON.stringify(expectedCounts)) {
    throw new Error(
      `Unexpected seeded row counts: ${JSON.stringify(firstCounts)}`,
    );
  }
  runSeedCommand("demo:seed");
  runSeedCommand("demo:seed");
  const secondCounts = await countSeedRows();
  if (JSON.stringify(secondCounts) !== JSON.stringify(expectedCounts)) {
    throw new Error(
      `Repeated seed changed row counts: ${JSON.stringify(secondCounts)}`,
    );
  }
  console.log(
    `DEMO_SEED_PERSISTENCE_PASS: reset preserved unrelated sentinel; repeated seed remained exact: ${JSON.stringify(secondCounts)}`,
  );
} finally {
  await db.transaction(async (tx) => {
    await tx
      .delete(billingEvents)
      .where(eq(billingEvents.eventId, sentinel.eventId));
    await tx
      .delete(billingInvoices)
      .where(eq(billingInvoices.id, sentinel.invoiceId));
    await tx
      .delete(subscriptions)
      .where(eq(subscriptions.id, sentinel.subscriptionId));
    await tx.delete(workspaces).where(eq(workspaces.id, sentinel.workspaceId));
    await tx.delete(users).where(eq(users.id, sentinel.userId));
  });
  await pool.end();
}
