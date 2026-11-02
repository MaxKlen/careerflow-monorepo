import assert from "node:assert/strict";

const API = process.env.INTEGRATION_API_URL ?? "http://127.0.0.1:4000";
const candidateOrigin = process.env.APP_URL ?? "http://localhost:3000";
const employerOrigin = process.env.EMPLOYER_URL ?? "http://localhost:3002";
let passed = 0;

async function request(path, { cookie, origin, ...init } = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  if (
    init.body &&
    typeof init.body === "object" &&
    !(init.body instanceof FormData) &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookies
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  return { response, body, cookie: cookieHeader };
}

async function signup(prefix) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@test.local`;
  const password = "Synthetic-password-123!";
  const result = await request("/auth/signup", {
    method: "POST",
    body: { email, password, displayName: prefix },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return { email, password, cookie: result.cookie };
}

async function workspace(cookie, name) {
  const result = await request("/workspaces", {
    method: "POST",
    cookie,
    body: { name, kind: "personal" },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.workspace.id;
}

async function run(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await run("cross-workspace private opportunity is rejected", async () => {
  const owner = await signup("ownership-owner");
  const other = await signup("ownership-other");
  const ownerWorkspace = await workspace(owner.cookie, "Owner workspace");
  const otherWorkspace = await workspace(other.cookie, "Other workspace");
  const opportunity = await request("/opportunities", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      title: "Private role",
      company: "Owner Co",
      description: "Private synthetic opportunity",
      requirementLines: [],
    },
  });
  assert.equal(
    opportunity.response.status,
    201,
    JSON.stringify(opportunity.body),
  );
  const attempt = await request(
    `/applications/by-workspace/${otherWorkspace}`,
    {
      method: "POST",
      cookie: other.cookie,
      body: { opportunityId: opportunity.body.opportunity.id },
    },
  );
  assert.equal(attempt.response.status, 404);
  assert.equal(ownerWorkspace.length, 36);
});

await run("password reset revokes the old authenticated session", async () => {
  const user = await signup("reset");
  const requested = await request("/password-reset/request", {
    method: "POST",
    body: { email: user.email },
  });
  assert.equal(requested.response.status, 200, JSON.stringify(requested.body));
  assert.ok(
    requested.body.devToken,
    "development reset token should be available with email disabled",
  );
  const reset = await request("/password-reset/reset", {
    method: "POST",
    body: {
      token: requested.body.devToken,
      newPassword: "Synthetic-password-456!",
    },
  });
  assert.equal(reset.response.status, 200, JSON.stringify(reset.body));
  const oldSession = await request("/auth/me", { cookie: user.cookie });
  assert.equal(oldSession.response.status, 401);
});

await run("CV confirmation cannot be replayed", async () => {
  const user = await signup("cv-replay");
  const workspaceId = await workspace(user.cookie, "CV workspace");
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      ["Alex Example\n\nSUMMARY\nProduct engineer\n\nSKILLS\nTypeScript"],
      { type: "text/plain" },
    ),
    "cv.txt",
  );
  const imported = await request(`/cv/${workspaceId}/import`, {
    method: "POST",
    cookie: user.cookie,
    body: form,
  });
  assert.equal(imported.response.status, 201, JSON.stringify(imported.body));
  const sections = imported.body.sections.map((section) => ({
    key: section.key,
    include: true,
    editedText: section.rawText,
  }));
  const first = await request(
    `/cv/${workspaceId}/session/${imported.body.sessionId}/confirm`,
    {
      method: "POST",
      cookie: user.cookie,
      body: { profileLabel: "Imported profile", sections },
    },
  );
  assert.equal(first.response.status, 201, JSON.stringify(first.body));
  const replay = await request(
    `/cv/${workspaceId}/session/${imported.body.sessionId}/confirm`,
    {
      method: "POST",
      cookie: user.cookie,
      body: { profileLabel: "Replay profile", sections },
    },
  );
  assert.equal(replay.response.status, 409);
});

await run(
  "employer invitation projects only the authorized application",
  async () => {
    const candidate = await signup("employer-candidate");
    const workspaceId = await workspace(candidate.cookie, "Employer workspace");
    const opportunity = await request("/opportunities", {
      method: "POST",
      cookie: candidate.cookie,
      body: {
        title: "Invited role",
        company: "Projection Co",
        description: "Synthetic role",
        requirementLines: ["TypeScript"],
      },
    });
    assert.equal(
      opportunity.response.status,
      201,
      JSON.stringify(opportunity.body),
    );
    const application = await request(
      `/applications/by-workspace/${workspaceId}`,
      {
        method: "POST",
        cookie: candidate.cookie,
        body: { opportunityId: opportunity.body.opportunity.id },
      },
    );
    assert.equal(
      application.response.status,
      201,
      JSON.stringify(application.body),
    );
    const employerEmail = `employer-${Date.now()}@test.local`;
    const invitation = await request(
      `/applications/${application.body.application.id}/invitations`,
      {
        method: "POST",
        cookie: candidate.cookie,
        origin: candidateOrigin,
        body: { employerEmail },
      },
    );
    assert.equal(
      invitation.response.status,
      201,
      JSON.stringify(invitation.body),
    );
    const token = new URL(invitation.body.invitationUrl).hash.replace(
      /^#token=/,
      "",
    );
    const employerSignup = await request("/employer/auth/signup", {
      method: "POST",
      origin: employerOrigin,
      body: {
        email: employerEmail,
        password: "Employer-password-123!",
        companyName: "Projection Co",
        invitationToken: decodeURIComponent(token),
      },
    });
    assert.equal(
      employerSignup.response.status,
      200,
      JSON.stringify(employerSignup.body),
    );
    const list = await request("/employer/applications", {
      cookie: employerSignup.cookie,
    });
    assert.equal(list.response.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.applications.length, 1);
    assert.equal(
      list.body.applications[0].applicationId,
      application.body.application.id,
    );
    const detail = await request(
      `/employer/applications/${application.body.application.id}`,
      { cookie: employerSignup.cookie },
    );
    assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
  },
);

console.log(`API integration tests: ${passed} passed`);
