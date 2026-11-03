import { expect, test } from "@playwright/test";

const API = process.env.INTEGRATION_API_URL ?? "http://127.0.0.1:4000";
const candidateOrigin = process.env.APP_URL ?? "http://localhost:3000";
const employerOrigin = process.env.EMPLOYER_URL ?? "http://localhost:3002";

test("M11 automated invitation and employer projection flow (not the visible walkthrough)", async ({
  page,
}) => {
  test.skip(
    !process.env.M11_E2E,
    "M11 automated flow runs only in the database-backed CI job.",
  );

  async function api(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ) {
    const headers = new Headers(init.headers);
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(init.json);
      delete init.json;
    }
    const response = await fetch(`${API}${path}`, { ...init, headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    const cookie =
      response.headers
        .getSetCookie?.()
        .map((value) => value.split(";", 1)[0])
        .join("; ") ?? "";
    return { response, body, cookie };
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const candidateEmail = `m11-candidate-${suffix}@test.local`;
  const employerEmail = `m11-employer-${suffix}@test.local`;
  const candidatePassword = "Candidate-password-123!";
  const employerPassword = "Employer-password-123!";
  let employerCookie = "";

  const signup = await api("/auth/signup", {
    method: "POST",
    json: {
      email: candidateEmail,
      password: candidatePassword,
      displayName: "M11 Candidate",
    },
  });
  expect(signup.response.status).toBe(200);
  const candidateCookie = signup.cookie;
  const candidateSession = candidateCookie.replace(/^cf_session=/, "");
  const candidateUrl = new URL(candidateOrigin);
  await page.context().addCookies([
    {
      name: "cf_session",
      value: candidateSession,
      domain: candidateUrl.hostname,
      path: "/",
    },
  ]);

  const workspace = await api("/workspaces", {
    method: "POST",
    headers: { cookie: candidateCookie },
    json: { name: "M11 Workspace", kind: "personal" },
  });
  expect(workspace.response.status).toBe(201);
  const workspaceId = workspace.body.workspace.id;

  const opportunity = await api("/opportunities", {
    method: "POST",
    headers: { cookie: candidateCookie },
    json: {
      title: "M11 Product Role",
      company: "CareerFlow Test Co",
      description: "Synthetic employer projection role",
      requirementLines: ["TypeScript"],
    },
  });
  expect(opportunity.response.status).toBe(201);

  const application = await api(`/applications/by-workspace/${workspaceId}`, {
    method: "POST",
    headers: { cookie: candidateCookie },
    json: { opportunityId: opportunity.body.opportunity.id },
  });
  expect(application.response.status).toBe(201);
  const applicationId = application.body.application.id;

  const invitation = await api(`/applications/${applicationId}/invitations`, {
    method: "POST",
    headers: { cookie: candidateCookie, origin: candidateOrigin },
    json: { employerEmail },
  });
  expect(invitation.response.status).toBe(201);
  const invitationUrl = invitation.body.invitationUrl as string;

  await test.step("1. Open the invitation acceptance surface", async () => {
    await page.goto(invitationUrl);
    await expect(
      page.getByRole("heading", { name: "Accept invitation" }),
    ).toBeVisible();
  });

  await test.step("2. Verify the invitation preview", async () => {
    await expect(page.getByText("M11 Product Role")).toBeVisible();
    await expect(page.getByText("CareerFlow Test Co")).toBeVisible();
  });

  await test.step("3. Fill the employer registration form", async () => {
    await page.getByLabel("Company name").fill("CareerFlow Test Co");
    await page.getByLabel(/Password/).fill(employerPassword);
  });

  await test.step("4. Create the invited employer account", async () => {
    await page.getByRole("button", { name: "Create employer account" }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+/);
    employerCookie = (await page.context().cookies(employerOrigin))
      .filter((cookie) => cookie.name === "cf_employer_session")
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    expect(employerCookie).not.toBe("");
  });

  await test.step("5. Verify the employer projection page", async () => {
    await expect(
      page.getByRole("heading", { name: "M11 Product Role" }),
    ).toBeVisible();
    await expect(page.getByText("M11 Product Role")).toBeVisible();
  });

  await test.step("6. Verify the projected application remains scoped", async () => {
    await expect(page.getByText("CareerFlow Test Co")).toBeVisible();
    await expect(page.getByText(/Requirements|Evidence/)).toBeVisible();
    const projection = await api(`/employer/applications/${applicationId}`, {
      headers: { cookie: employerCookie, origin: employerOrigin },
    });
    expect(projection.response.status).toBe(200);
    expect(projection.body).not.toHaveProperty("profile");
    expect(projection.body).not.toHaveProperty("evidenceLibrary");
    expect(projection.body).not.toHaveProperty("applications");
    expect(projection.body.application).not.toHaveProperty("email");
  });

  await test.step("7. Candidate revokes accepted employer access", async () => {
    const candidatePage = await page.context().newPage();
    await candidatePage.goto(
      `${candidateOrigin}/applications/${applicationId}`,
    );
    const revokeButton = candidatePage.getByRole("button", {
      name: "Revoke employer access",
    });
    await expect(revokeButton).toBeVisible();
    await revokeButton.click();
    await expect(candidatePage.getByText(/revoked/)).toBeVisible();

    const projectionAfterRevoke = await api(
      `/employer/applications/${applicationId}`,
      { headers: { cookie: employerCookie, origin: employerOrigin } },
    );
    expect(projectionAfterRevoke.response.status).toBe(404);
    await candidatePage.close();
  });
});
