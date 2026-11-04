import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminUsers,
  applications as applicationsTable,
  auditLog,
  billingEvents,
  billingInvoices,
  employerSubscriptions as employerSubscriptionsTable,
  employerUsers,
  opportunitySources,
  opportunities,
  subscriptions,
  users,
  workspaces as workspacesTable,
} from "@careerflow/db";
import { createDb } from "@careerflow/db";
import { hashPassword } from "./password.js";
import { isAllowedDemoDatabase } from "./demoGuard.js";
import { DEMO_PASSWORD, generateDemoSeedData } from "./demoSeedData.js";

const root = resolve(process.cwd(), "../..");
config({ path: resolve(root, ".env"), override: false });
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgres://careerflow:careerflow@localhost:5434/careerflow_demo";
}
if (!process.env.DEMO_MODE) process.env.DEMO_MODE = "true";
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";

const mode = process.argv[2] ?? "seed";
if (mode !== "seed" && mode !== "reset") {
  throw new Error("Usage: pnpm demo:seed | pnpm demo:reset");
}
const databaseUrl = process.env.DATABASE_URL;
if (
  !isAllowedDemoDatabase({
    databaseUrl,
    demoMode: process.env.DEMO_MODE === "true",
    nodeEnv: process.env.NODE_ENV,
  })
) {
  throw new Error(
    "Refusing demo seed/reset: requires DEMO_MODE=true, non-production NODE_ENV, and a local *_demo or *_test database.",
  );
}

// Schema changes are applied only after the explicit local-demo target guard.
execFileSync("pnpm", ["--filter", "@careerflow/db", "push"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

const { db, pool } = createDb(databaseUrl);
const data = generateDemoSeedData();
const demoPasswordHash = await hashPassword(DEMO_PASSWORD);

async function resetDemoData() {
  const candidateIds = data.candidates.map((row) => row.id);
  const employerIds = data.employers.map((row) => row.id);
  const adminIds = data.admins.map((row) => row.id);
  const subscriptionIds = data.candidateSubscriptions.map((row) => row.id);
  const employerSubscriptionIds = data.employerSubscriptions.map(
    (row) => row.id,
  );
  const applicationIds = data.applications.map((row) => row.id);
  const opportunityIds = data.opportunities.map((row) => row.id);
  const sourceIds = data.opportunities.map((row) => row.sourceId);
  const workspaceIds = data.workspaces.map((row) => row.id);
  const eventIds = [
    ...data.candidateSubscriptions.map((row) => row.eventId),
    ...data.employerSubscriptions.map((row) => row.eventId),
  ];
  const externalInvoiceIds = [
    ...data.candidateSubscriptions.map((row) => row.externalInvoiceId),
    ...data.employerSubscriptions.map((row) => row.externalInvoiceId),
  ];

  await db.transaction(async (tx) => {
    await tx
      .delete(billingEvents)
      .where(
        and(
          eq(billingEvents.provider, "mock"),
          inArray(billingEvents.eventId, eventIds),
        ),
      );
    await tx
      .delete(billingInvoices)
      .where(inArray(billingInvoices.externalInvoiceId, externalInvoiceIds));
    await tx
      .delete(subscriptions)
      .where(inArray(subscriptions.id, subscriptionIds));
    await tx
      .delete(employerSubscriptionsTable)
      .where(inArray(employerSubscriptionsTable.id, employerSubscriptionIds));
    await tx
      .delete(applicationsTable)
      .where(inArray(applicationsTable.id, applicationIds));
    await tx
      .delete(opportunities)
      .where(inArray(opportunities.id, opportunityIds));
    await tx
      .delete(opportunitySources)
      .where(inArray(opportunitySources.id, sourceIds));
    await tx
      .delete(workspacesTable)
      .where(inArray(workspacesTable.id, workspaceIds));
    await tx
      .delete(auditLog)
      .where(inArray(auditLog.actorAdminUserId, adminIds));
    await tx
      .delete(employerUsers)
      .where(inArray(employerUsers.id, employerIds));
    await tx.delete(users).where(inArray(users.id, candidateIds));
    await tx.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
  });
}

async function seedDemoData() {
  await db.transaction(async (tx) => {
    await tx
      .insert(adminUsers)
      .values(
        data.admins.map((row) => ({
          id: row.id,
          email: row.email,
          passwordHash: demoPasswordHash,
          displayName: row.name,
          role: row.role,
          createdAt: row.createdAt,
        })),
      )
      .onConflictDoUpdate({
        target: adminUsers.id,
        set: { passwordHash: demoPasswordHash },
      });

    await tx
      .insert(users)
      .values(
        data.candidates.map((row) => ({
          id: row.id,
          email: row.email,
          passwordHash: demoPasswordHash,
          displayName: row.name,
          locale: "en",
          timezone: "UTC",
          emailVerifiedAt: row.createdAt,
          createdAt: row.createdAt,
        })),
      )
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: users.email,
          passwordHash: demoPasswordHash,
          displayName: users.displayName,
          locale: users.locale,
          timezone: users.timezone,
          emailVerifiedAt: users.emailVerifiedAt,
          createdAt: users.createdAt,
        },
      });

    await tx
      .insert(employerUsers)
      .values(
        data.employers.map((row) => ({
          id: row.id,
          email: row.email,
          passwordHash: demoPasswordHash,
          companyName: row.companyName,
          createdAt: row.createdAt,
        })),
      )
      .onConflictDoUpdate({
        target: employerUsers.id,
        set: {
          email: employerUsers.email,
          passwordHash: demoPasswordHash,
          companyName: employerUsers.companyName,
          createdAt: employerUsers.createdAt,
        },
      });

    await tx
      .insert(workspacesTable)
      .values(data.workspaces)
      .onConflictDoUpdate({
        target: workspacesTable.id,
        set: {
          ownerId: workspacesTable.ownerId,
          kind: workspacesTable.kind,
          name: workspacesTable.name,
          createdAt: workspacesTable.createdAt,
        },
      });

    const sourceRows = data.opportunities.map((row, index) => ({
      id: row.sourceId,
      sourceKind: "synthetic_demo",
      url: `https://example.test/demo/job/${index + 1}`,
      fetchedAt: row.createdAt,
      raw: { synthetic: true, notice: "DEMO / SYNTHETIC; not a real listing" },
    }));
    await tx
      .insert(opportunitySources)
      .values(sourceRows)
      .onConflictDoUpdate({
        target: opportunitySources.id,
        set: {
          sourceKind: opportunitySources.sourceKind,
          url: opportunitySources.url,
          fetchedAt: opportunitySources.fetchedAt,
          raw: opportunitySources.raw,
        },
      });

    const opportunityRows = data.opportunities.map((row) => ({
      ...row,
      workspaceId: null,
      lastCheckedAt: row.createdAt,
    }));
    await tx
      .insert(opportunities)
      .values(opportunityRows)
      .onConflictDoUpdate({
        target: opportunities.id,
        set: {
          sourceId: opportunities.sourceId,
          title: opportunities.title,
          company: opportunities.company,
          location: opportunities.location,
          arrangement: opportunities.arrangement,
          compensation: opportunities.compensation,
          description: opportunities.description,
          lastCheckedAt: opportunities.lastCheckedAt,
        },
      });

    await tx
      .insert(applicationsTable)
      .values(data.applications)
      .onConflictDoUpdate({
        target: applicationsTable.id,
        set: {
          workspaceId: applicationsTable.workspaceId,
          opportunityId: applicationsTable.opportunityId,
          stage: applicationsTable.stage,
          nextAction: applicationsTable.nextAction,
          dueDate: applicationsTable.dueDate,
          notes: applicationsTable.notes,
          submissionRecordedAt: applicationsTable.submissionRecordedAt,
          submissionConfirmedAt: applicationsTable.submissionConfirmedAt,
          createdAt: applicationsTable.createdAt,
          updatedAt: applicationsTable.updatedAt,
        },
      });

    await tx
      .insert(subscriptions)
      .values(
        data.candidateSubscriptions.map(
          ({ amountCents, invoiceId, externalInvoiceId, eventId, ...row }) =>
            row,
        ),
      )
      .onConflictDoUpdate({
        target: subscriptions.id,
        set: {
          workspaceId: subscriptions.workspaceId,
          plan: subscriptions.plan,
          status: subscriptions.status,
          provider: subscriptions.provider,
          externalId: subscriptions.externalId,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          canceledAt: subscriptions.canceledAt,
          updatedAt: subscriptions.updatedAt,
        },
      });

    await tx
      .insert(employerSubscriptionsTable)
      .values(
        data.employerSubscriptions.map(
          ({ amountCents, invoiceId, externalInvoiceId, eventId, ...row }) =>
            row,
        ),
      )
      .onConflictDoUpdate({
        target: employerSubscriptionsTable.id,
        set: {
          employerUserId: employerSubscriptionsTable.employerUserId,
          plan: employerSubscriptionsTable.plan,
          status: employerSubscriptionsTable.status,
          provider: employerSubscriptionsTable.provider,
          externalId: employerSubscriptionsTable.externalId,
          currentPeriodStart: employerSubscriptionsTable.currentPeriodStart,
          currentPeriodEnd: employerSubscriptionsTable.currentPeriodEnd,
          canceledAt: employerSubscriptionsTable.canceledAt,
          updatedAt: employerSubscriptionsTable.updatedAt,
        },
      });

    const invoiceRows = [
      ...data.candidateSubscriptions.map((row) => ({
        id: row.invoiceId,
        workspaceId: row.workspaceId,
        employerUserId: null,
        subscriptionId: row.id,
        employerSubscriptionId: null,
        amountCents: row.amountCents,
        currency: "USD",
        status: "paid" as const,
        provider: "mock",
        externalInvoiceId: row.externalInvoiceId,
        description: `${row.plan} subscription · DEMO / SYNTHETIC`,
        isSynthetic: true,
        periodStart: row.currentPeriodStart,
        periodEnd: row.currentPeriodEnd,
        issuedAt: row.createdAt,
        paidAt: row.createdAt,
        createdAt: row.createdAt,
      })),
      ...data.employerSubscriptions.map((row) => ({
        id: row.invoiceId,
        workspaceId: null,
        employerUserId: row.employerUserId,
        subscriptionId: null,
        employerSubscriptionId: row.id,
        amountCents: row.amountCents,
        currency: "USD",
        status: "paid" as const,
        provider: "mock",
        externalInvoiceId: row.externalInvoiceId,
        description: `${row.plan} employer subscription · DEMO / SYNTHETIC`,
        isSynthetic: true,
        periodStart: row.currentPeriodStart,
        periodEnd: row.currentPeriodEnd,
        issuedAt: row.createdAt,
        paidAt: row.createdAt,
        createdAt: row.createdAt,
      })),
    ];
    await tx
      .insert(billingInvoices)
      .values(invoiceRows)
      .onConflictDoUpdate({
        target: billingInvoices.externalInvoiceId,
        set: {
          amountCents: billingInvoices.amountCents,
          status: billingInvoices.status,
          description: billingInvoices.description,
          periodStart: billingInvoices.periodStart,
          periodEnd: billingInvoices.periodEnd,
          issuedAt: billingInvoices.issuedAt,
          paidAt: billingInvoices.paidAt,
        },
      });

    const eventRows = [
      ...data.candidateSubscriptions.map((row) => ({
        provider: "mock",
        eventId: row.eventId,
        eventType: "checkout.succeeded",
        invoiceId: row.invoiceId,
        payload: {
          seeded: true,
          accountKind: "candidate",
          plan: row.plan,
          amountCents: row.amountCents,
        },
        processedAt: row.createdAt,
        createdAt: row.createdAt,
      })),
      ...data.employerSubscriptions.map((row) => ({
        provider: "mock",
        eventId: row.eventId,
        eventType: "checkout.succeeded",
        invoiceId: row.invoiceId,
        payload: {
          seeded: true,
          accountKind: "employer",
          plan: row.plan,
          amountCents: row.amountCents,
        },
        processedAt: row.createdAt,
        createdAt: row.createdAt,
      })),
    ];
    await tx
      .insert(billingEvents)
      .values(eventRows)
      .onConflictDoUpdate({
        target: [billingEvents.provider, billingEvents.eventId],
        set: {
          invoiceId: billingEvents.invoiceId,
          payload: billingEvents.payload,
          processedAt: billingEvents.processedAt,
        },
      });
  });
}

try {
  if (mode === "reset") await resetDemoData();
  await seedDemoData();
  console.log(
    JSON.stringify(
      {
        mode,
        ...data.totals,
        accounts: data.totals.accounts,
        demo: true,
        label: "DEMO / SYNTHETIC",
      },
      null,
      2,
    ),
  );
  console.log(`Demo owner: owner@demo.example.test / ${DEMO_PASSWORD}`);
  console.log(`Demo candidate: candidate-001@example.test / ${DEMO_PASSWORD}`);
  console.log(`Demo employer: employer-001@example.test / ${DEMO_PASSWORD}`);
} finally {
  await pool.end();
}
