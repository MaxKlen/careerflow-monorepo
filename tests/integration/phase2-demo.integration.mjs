import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const API = process.env.PHASE2_API_URL ?? "http://localhost:4000";
const CANDIDATE_APP =
  process.env.PHASE2_CANDIDATE_URL ?? "http://localhost:3000";
const EMPLOYER_APP = process.env.PHASE2_EMPLOYER_URL ?? "http://localhost:3002";
const ADMIN_APP = process.env.PHASE2_ADMIN_URL ?? "http://localhost:3001";
const REQUEST_ORIGIN = process.env.PHASE2_ORIGIN;
const DEMO_DATABASE_URL =
  process.env.PHASE2_DATABASE_URL ??
  "postgres://careerflow:careerflow@localhost:5434/careerflow_demo";
const PASSWORD = "DemoOnly-2026!";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(
  path,
  { method = "GET", body, cookie, origin, originHeader } = {},
) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const requestOrigin =
    originHeader ??
    (origin ? (REQUEST_ORIGIN ?? new URL(origin).origin) : null);
  if (requestOrigin) headers.origin = requestOrigin;
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

function cookieFrom(response, name) {
  const headers = response.headers.getSetCookie?.() ?? [
    response.headers.get("set-cookie") ?? "",
  ];
  const line = headers.find((value) => value.startsWith(`${name}=`));
  assert.ok(line, `Response did not set ${name}`);
  return line.split(";", 1)[0];
}

async function expectStatus(path, options, status = 200) {
  const result = await request(path, options);
  assert.equal(
    result.response.status,
    status,
    `${options?.method ?? "GET"} ${path}: ${JSON.stringify(result.data)}`,
  );
  return result;
}

async function signIn(path, email, origin, cookieName) {
  const { response, data } = await expectStatus(path, {
    method: "POST",
    origin,
    body: { email, password: PASSWORD },
  });
  return { cookie: cookieFrom(response, cookieName), data };
}

async function waitFor(url, label) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
      lastError = new Error(`${label}: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000);
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

async function html(url, cookie) {
  const response = await fetch(url, {
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  assert.equal(
    response.status,
    200,
    `UI route ${url} returned ${response.status}`,
  );
  return text;
}

async function main() {
  await waitFor(`${API}/ready`, "CareerFlow API");
  await waitFor(CANDIDATE_APP, "Candidate app");
  await waitFor(EMPLOYER_APP, "Employer app");
  await waitFor(ADMIN_APP, "Admin app");

  const missingOrigin = await request("/auth/signin", {
    method: "POST",
    body: { email: "candidate-001@example.test", password: PASSWORD },
  });
  assert.equal(missingOrigin.response.status, 403);
  assert.equal(missingOrigin.data.error, "invalid_origin");
  const untrustedOrigin = await request("/auth/signin", {
    method: "POST",
    originHeader: "https://attacker.example",
    body: { email: "candidate-001@example.test", password: PASSWORD },
  });
  assert.equal(untrustedOrigin.response.status, 403);
  assert.equal(untrustedOrigin.data.error, "invalid_origin");
  console.log(
    "PASS API write boundary: missing and untrusted origins are rejected",
  );

  const owner = await signIn(
    "/admin/auth/signin",
    "owner@demo.example.test",
    ADMIN_APP,
    "cf_admin_session",
  );
  const adminCookie = owner.cookie;
  const { data: managed } = await expectStatus("/admin/managed-users", {
    cookie: adminCookie,
    origin: ADMIN_APP,
  });
  assert.equal(
    managed.total,
    500,
    "Expected 500 seeded accounts across all app types",
  );
  assert.equal(managed.demo, true);
  const { data: dashboard } = await expectStatus("/admin/dashboard", {
    cookie: adminCookie,
    origin: ADMIN_APP,
  });
  assert.equal(dashboard.totals.users, 500);
  assert.ok(dashboard.totals.activeSubscriptions >= 210);
  assert.ok(dashboard.totals.simulatedMrrCents >= 456_200);
  const { data: revenueBefore } = await expectStatus("/admin/revenue", {
    cookie: adminCookie,
    origin: ADMIN_APP,
  });
  assert.match(revenueBefore.label, /DEMO \/ SYNTHETIC/);
  assert.ok(revenueBefore.mrrCents >= 456_200);
  const { data: invoiceReport } = await expectStatus("/admin/invoices", {
    cookie: adminCookie,
    origin: ADMIN_APP,
  });
  assert.match(invoiceReport.label, /DEMO \/ SYNTHETIC/);
  assert.ok(invoiceReport.invoices.length <= 100);
  console.log(
    "PASS admin: all 500 accounts, seeded MRR, subscriptions and synthetic invoice reporting",
  );

  let candidateSession;
  let candidateEmail;
  let candidateSnapshot;
  for (let index = 250; index <= 440; index += 1) {
    const email = `candidate-${String(index).padStart(3, "0")}@example.test`;
    const session = await signIn(
      "/auth/signin",
      email,
      CANDIDATE_APP,
      "cf_session",
    );
    const { data } = await expectStatus("/membership/current", {
      cookie: session.cookie,
      origin: CANDIDATE_APP,
    });
    const latest = data.subscriptions?.[0];
    if (!latest || latest.status === "canceled") {
      candidateSession = session.cookie;
      candidateEmail = email;
      candidateSnapshot = data;
      break;
    }
    await expectStatus("/auth/signout", {
      method: "POST",
      cookie: session.cookie,
      origin: CANDIDATE_APP,
    });
  }
  assert.ok(
    candidateSession && candidateEmail && candidateSnapshot,
    "No unbilled seeded candidate remained; reset the demo database before this integration test.",
  );
  const workspaceId = candidateSnapshot.workspaces[0]?.id;
  assert.ok(workspaceId, "Seeded candidate must have a personal workspace");
  const initialInvoiceCount = candidateSnapshot.invoices.length;
  const candidateKey = () => crypto.randomUUID();

  const otherCandidate = await signIn(
    "/auth/signin",
    "candidate-260@example.test",
    CANDIDATE_APP,
    "cf_session",
  );
  const { data: otherCandidateState } = await expectStatus(
    "/membership/current",
    {
      cookie: otherCandidate.cookie,
      origin: CANDIDATE_APP,
    },
  );
  const foreignWorkspaceId = otherCandidateState.workspaces[0]?.id;
  assert.ok(foreignWorkspaceId && foreignWorkspaceId !== workspaceId);
  const crossTenantCheckout = await expectStatus(
    "/membership/checkout",
    {
      method: "POST",
      cookie: candidateSession,
      origin: CANDIDATE_APP,
      body: {
        workspaceId: foreignWorkspaceId,
        plan: "plus",
        idempotencyKey: candidateKey(),
      },
    },
    404,
  );
  assert.equal(crossTenantCheckout.data.error, "workspace_not_found");
  await expectStatus("/auth/signout", {
    method: "POST",
    cookie: otherCandidate.cookie,
    origin: CANDIDATE_APP,
  });

  const raceCandidate = await signIn(
    "/auth/signin",
    "candidate-251@example.test",
    CANDIDATE_APP,
    "cf_session",
  );
  const { data: raceBefore } = await expectStatus("/membership/current", {
    cookie: raceCandidate.cookie,
    origin: CANDIDATE_APP,
  });
  const raceWorkspaceId = raceBefore.workspaces[0]?.id;
  assert.ok(raceWorkspaceId);
  const priorActive = raceBefore.subscriptions.find(
    (row) => row.workspaceId === raceWorkspaceId && row.status !== "canceled",
  );
  if (priorActive) {
    await expectStatus("/membership/cancel", {
      method: "POST",
      cookie: raceCandidate.cookie,
      origin: CANDIDATE_APP,
      body: { workspaceId: raceWorkspaceId },
    });
  }
  const raceResults = await Promise.all([
    request("/membership/checkout", {
      method: "POST",
      cookie: raceCandidate.cookie,
      origin: CANDIDATE_APP,
      body: {
        workspaceId: raceWorkspaceId,
        plan: "plus",
        idempotencyKey: candidateKey(),
      },
    }),
    request("/membership/checkout", {
      method: "POST",
      cookie: raceCandidate.cookie,
      origin: CANDIDATE_APP,
      body: {
        workspaceId: raceWorkspaceId,
        plan: "growth",
        idempotencyKey: candidateKey(),
      },
    }),
  ]);
  assert.equal(
    raceResults.filter((row) => row.response.status === 200).length,
    1,
  );
  assert.equal(
    raceResults.filter((row) => row.response.status === 409).length,
    1,
  );
  const { data: raceAfter } = await expectStatus("/membership/current", {
    cookie: raceCandidate.cookie,
    origin: CANDIDATE_APP,
  });
  assert.equal(
    raceAfter.subscriptions.filter(
      (row) =>
        row.workspaceId === raceWorkspaceId &&
        ["active", "trialing", "past_due"].includes(row.status),
    ).length,
    1,
  );
  await expectStatus("/membership/cancel", {
    method: "POST",
    cookie: raceCandidate.cookie,
    origin: CANDIDATE_APP,
    body: { workspaceId: raceWorkspaceId },
  });
  await expectStatus("/auth/signout", {
    method: "POST",
    cookie: raceCandidate.cookie,
    origin: CANDIDATE_APP,
  });
  console.log(
    "PASS concurrent candidate checkouts: one request wins and only one current subscription is persisted",
  );

  const missingCandidateKey = await expectStatus(
    "/membership/checkout",
    {
      method: "POST",
      cookie: candidateSession,
      origin: CANDIDATE_APP,
      body: { workspaceId, plan: "plus" },
    },
    400,
  );
  assert.ok(missingCandidateKey.data.error || missingCandidateKey.data.message);

  const firstCheckout = await expectStatus("/membership/checkout", {
    method: "POST",
    cookie: candidateSession,
    origin: CANDIDATE_APP,
    body: { workspaceId, plan: "plus", idempotencyKey: candidateKey() },
  });
  assert.equal(firstCheckout.data.duplicate, false);
  assert.equal(firstCheckout.data.subscription.plan, "plus");
  assert.equal(firstCheckout.data.invoice.isSynthetic, true);
  assert.equal(firstCheckout.data.access.hasPaidAccess, true);
  assert.equal(firstCheckout.data.access.effectivePlan, "plus");
  const { data: candidatePageState } = await expectStatus(
    "/membership/current",
    { cookie: candidateSession, origin: CANDIDATE_APP },
  );
  assert.equal(candidatePageState.invoices.length, initialInvoiceCount + 1);
  assert.equal(
    candidatePageState.accessByWorkspace[workspaceId].hasPaidAccess,
    true,
  );

  const duplicateCheckout = await expectStatus("/membership/checkout", {
    method: "POST",
    cookie: candidateSession,
    origin: CANDIDATE_APP,
    body: { workspaceId, plan: "plus", idempotencyKey: candidateKey() },
  });
  assert.equal(duplicateCheckout.data.duplicate, true);
  const upgrade = await expectStatus("/membership/upgrade", {
    method: "POST",
    cookie: candidateSession,
    origin: CANDIDATE_APP,
    body: { workspaceId, plan: "growth", idempotencyKey: candidateKey() },
  });
  assert.equal(upgrade.data.subscription.plan, "growth");
  const canceled = await expectStatus("/membership/cancel", {
    method: "POST",
    cookie: candidateSession,
    origin: CANDIDATE_APP,
    body: { workspaceId },
  });
  assert.equal(canceled.data.subscription.status, "canceled");
  assert.equal(canceled.data.access.effectivePlan, "starter");
  assert.equal(canceled.data.access.hasPaidAccess, false);
  const resubscribe = await expectStatus("/membership/checkout", {
    method: "POST",
    cookie: candidateSession,
    origin: CANDIDATE_APP,
    body: { workspaceId, plan: "plus", idempotencyKey: candidateKey() },
  });
  assert.equal(resubscribe.data.subscription.status, "active");
  assert.ok(resubscribe.data.invoice.isSynthetic);
  const database = new URL(DEMO_DATABASE_URL);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
    "Billing-event smoke test requires a local database host",
  );
  assert.ok(
    /_(demo|test)$/.test(database.pathname.slice(1)),
    "Billing-event smoke test requires a *_demo or *_test database",
  );
  const eventSmoke = spawnSync(
    "pnpm",
    [
      "--filter",
      "@careerflow/api",
      "exec",
      "tsx",
      "src/billingEventSmoke.ts",
      workspaceId,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: DEMO_DATABASE_URL,
        DEMO_MODE: "true",
        PAYMENT_PROVIDER: "mock",
        NODE_ENV: "development",
      },
    },
  );
  assert.equal(
    eventSmoke.status,
    0,
    `${eventSmoke.stdout}\n${eventSmoke.stderr}`,
  );
  assert.match(eventSmoke.stdout, /BILLING_EVENT_IDEMPOTENCY_PASS/);
  const candidateMembershipHtml = await html(
    `${CANDIDATE_APP}/membership`,
    candidateSession,
  );
  assert.match(candidateMembershipHtml, /Membership/);
  assert.match(candidateMembershipHtml, /Access granted/);
  assert.match(candidateMembershipHtml, /DEMO \/ SYNTHETIC/);
  await expectStatus("/membership/cancel", {
    method: "POST",
    cookie: candidateSession,
    origin: CANDIDATE_APP,
    body: { workspaceId },
  });
  console.log(
    `PASS candidate: checkout, same-plan duplicate, upgrade, cancel, free fallback, resubscribe and membership UI (${candidateEmail})`,
  );

  let employerSession;
  let employerEmail;
  let employerSnapshot;
  for (let index = 35; index <= 55; index += 1) {
    const email = `employer-${String(index).padStart(3, "0")}@example.test`;
    const session = await signIn(
      "/employer/auth/signin",
      email,
      EMPLOYER_APP,
      "cf_employer_session",
    );
    const { data } = await expectStatus("/employer/membership/current", {
      cookie: session.cookie,
      origin: EMPLOYER_APP,
    });
    if (!data.subscription || data.subscription.status === "canceled") {
      employerSession = session.cookie;
      employerEmail = email;
      employerSnapshot = data;
      break;
    }
    await expectStatus("/employer/auth/signout", {
      method: "POST",
      cookie: session.cookie,
      origin: EMPLOYER_APP,
    });
  }
  assert.ok(
    employerSession && employerEmail && employerSnapshot,
    "No unbilled seeded employer remained; reset the demo database before this integration test.",
  );
  const missingEmployerKey = await expectStatus(
    "/employer/membership/checkout",
    {
      method: "POST",
      cookie: employerSession,
      origin: EMPLOYER_APP,
      body: { plan: "plus" },
    },
    400,
  );
  assert.ok(missingEmployerKey.data.error || missingEmployerKey.data.message);
  const employerCheckout = await expectStatus("/employer/membership/checkout", {
    method: "POST",
    cookie: employerSession,
    origin: EMPLOYER_APP,
    body: { plan: "plus", idempotencyKey: candidateKey() },
  });
  assert.equal(employerCheckout.data.subscription.plan, "plus");
  assert.equal(employerCheckout.data.access.hasPaidAccess, true);
  const employerUpgrade = await expectStatus("/employer/membership/upgrade", {
    method: "POST",
    cookie: employerSession,
    origin: EMPLOYER_APP,
    body: { plan: "growth", idempotencyKey: candidateKey() },
  });
  assert.equal(employerUpgrade.data.subscription.plan, "growth");
  const employerCanceled = await expectStatus("/employer/membership/cancel", {
    method: "POST",
    cookie: employerSession,
    origin: EMPLOYER_APP,
    body: {},
  });
  assert.equal(employerCanceled.data.access.hasPaidAccess, false);
  const employerHtml = await html(`${EMPLOYER_APP}/billing`, employerSession);
  assert.match(employerHtml, /Loading demo billing|Employer billing/);
  await expectStatus("/employer/auth/signout", {
    method: "POST",
    cookie: employerSession,
    origin: EMPLOYER_APP,
  });
  console.log(
    `PASS employer: checkout, upgrade, cancel, access fallback and billing UI (${employerEmail})`,
  );

  const support = await signIn(
    "/admin/auth/signin",
    "support-1@demo.example.test",
    ADMIN_APP,
    "cf_admin_session",
  );
  const protectedCandidate = managed.users.find(
    (row) =>
      row.kind === "candidate" && row.email === "candidate-302@example.test",
  );
  assert.ok(protectedCandidate);
  const supportAttempt = await expectStatus(
    `/admin/managed-users/candidate/${protectedCandidate.id}/status`,
    {
      method: "POST",
      cookie: support.cookie,
      origin: ADMIN_APP,
      body: { action: "suspend", reason: "Integration role restriction check" },
    },
    403,
  );
  assert.equal(supportAttempt.data.error, "forbidden");
  await expectStatus("/admin/auth/signout", {
    method: "POST",
    cookie: support.cookie,
    origin: ADMIN_APP,
  });

  const impersonationTarget = managed.users.find(
    (row) =>
      row.kind === "candidate" && row.email === "candidate-260@example.test",
  );
  assert.ok(impersonationTarget);
  const impersonation = await expectStatus(
    `/admin/managed-users/candidate/${impersonationTarget.id}/impersonate`,
    {
      method: "POST",
      cookie: adminCookie,
      origin: ADMIN_APP,
      body: { reason: "Integration verification of read-only support session" },
    },
  );
  assert.equal(impersonation.data.readOnly, true);
  assert.match(impersonation.data.redirectUrl, /\/home$/);
  const impersonationCookie = cookieFrom(impersonation.response, "cf_session");
  const impersonatedMe = await expectStatus("/auth/me", {
    cookie: impersonationCookie,
    origin: CANDIDATE_APP,
  });
  assert.equal(impersonatedMe.data.user.isImpersonating, true);
  const blockedWrite = await expectStatus(
    "/membership/cancel",
    {
      method: "POST",
      cookie: impersonationCookie,
      origin: CANDIDATE_APP,
      body: { workspaceId: candidateSnapshot.workspaces[0].id },
    },
    403,
  );
  assert.equal(blockedWrite.data.error, "impersonation_read_only");
  await expectStatus("/auth/impersonation/end", {
    method: "POST",
    cookie: impersonationCookie,
    origin: CANDIDATE_APP,
  });
  await expectStatus(
    "/auth/me",
    { cookie: impersonationCookie, origin: CANDIDATE_APP },
    401,
  );

  const ownerIdentity = managed.users.find(
    (row) => row.kind === "admin" && row.email === "owner@demo.example.test",
  );
  assert.ok(ownerIdentity);
  const expirySmoke = spawnSync(
    "pnpm",
    [
      "--filter",
      "@careerflow/api",
      "exec",
      "tsx",
      "src/impersonationExpirySmoke.ts",
      ownerIdentity.id,
      impersonationTarget.id,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: DEMO_DATABASE_URL,
        DEMO_MODE: "true",
        PAYMENT_PROVIDER: "mock",
        NODE_ENV: "development",
      },
    },
  );
  assert.equal(
    expirySmoke.status,
    0,
    `${expirySmoke.stdout}\n${expirySmoke.stderr}`,
  );
  assert.match(expirySmoke.stdout, /IMPERSONATION_EXPIRY_AUDIT_PASS/);

  const suspensionTarget = managed.users.find(
    (row) =>
      row.kind === "candidate" && row.email === "candidate-301@example.test",
  );
  assert.ok(suspensionTarget);
  const suspendedLogin = await signIn(
    "/auth/signin",
    suspensionTarget.email,
    CANDIDATE_APP,
    "cf_session",
  );
  const suspensionImpersonation = await expectStatus(
    `/admin/managed-users/candidate/${suspensionTarget.id}/impersonate`,
    {
      method: "POST",
      cookie: adminCookie,
      origin: ADMIN_APP,
      body: { reason: "Integration verification of suspension revocation" },
    },
  );
  const revokedImpersonationCookie = cookieFrom(
    suspensionImpersonation.response,
    "cf_session",
  );
  await expectStatus(
    `/admin/managed-users/candidate/${suspensionTarget.id}/status`,
    {
      method: "POST",
      cookie: adminCookie,
      origin: ADMIN_APP,
      body: {
        action: "suspend",
        reason: "Integration test suspends this seeded account",
      },
    },
  );
  await expectStatus(
    "/auth/me",
    { cookie: suspendedLogin.cookie, origin: CANDIDATE_APP },
    401,
  );
  await expectStatus(
    "/auth/me",
    { cookie: revokedImpersonationCookie, origin: CANDIDATE_APP },
    401,
  );
  await expectStatus(
    "/auth/signin",
    {
      method: "POST",
      origin: CANDIDATE_APP,
      body: { email: suspensionTarget.email, password: PASSWORD },
    },
    401,
  );
  await expectStatus(
    `/admin/managed-users/candidate/${suspensionTarget.id}/status`,
    {
      method: "POST",
      cookie: adminCookie,
      origin: ADMIN_APP,
      body: {
        action: "reactivate",
        reason: "Integration test restores this seeded account",
      },
    },
  );
  const restored = await signIn(
    "/auth/signin",
    suspensionTarget.email,
    CANDIDATE_APP,
    "cf_session",
  );
  await expectStatus("/auth/signout", {
    method: "POST",
    cookie: restored.cookie,
    origin: CANDIDATE_APP,
  });
  const { data: audit } = await expectStatus("/admin/audit-log", {
    cookie: adminCookie,
    origin: ADMIN_APP,
  });
  const actions = new Set(audit.entries.map((entry) => entry.action));
  for (const action of [
    "admin.impersonation.started",
    "admin.impersonation.ended",
    "admin.impersonation.expired",
    "admin.impersonation.revoked_by_suspension",
    "admin.suspend_user",
    "admin.reactivate_user",
  ]) {
    assert.ok(actions.has(action), `Expected audit action ${action}`);
  }
  const adminRevenueHtml = await html(`${ADMIN_APP}/revenue`, adminCookie);
  assert.match(adminRevenueHtml, /Loading revenue|DEMO|revenue/i);
  const adminUsersHtml = await html(`${ADMIN_APP}/users`, adminCookie);
  assert.match(adminUsersHtml, /Loading accounts|users|accounts/i);
  await expectStatus("/admin/auth/signout", {
    method: "POST",
    cookie: adminCookie,
    origin: ADMIN_APP,
  });
  await expectStatus("/auth/signout", {
    method: "POST",
    cookie: candidateSession,
    origin: CANDIDATE_APP,
  });
  console.log(
    "PASS owner admin: least-privilege roles, read-only impersonation, suspension/session revocation, audit trail, and admin UI routes",
  );
  console.log("PHASE2_DEMO_INTEGRATION_PASS");
}

main().catch((error) => {
  console.error("PHASE2_DEMO_INTEGRATION_FAIL");
  console.error(error);
  process.exitCode = 1;
});
