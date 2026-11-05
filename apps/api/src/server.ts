import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { env } from "./env.js";
import attachCurrentUser from "./plugins/current-user.js";
import { registerHealth } from "./routes/health.js";
import { registerAuth } from "./routes/auth.js";
import { registerWorkspaces } from "./routes/workspaces.js";
import { registerMeh } from "./routes/meh.js";
import { registerDirections } from "./routes/directions.js";
import { registerProfiles } from "./routes/profiles.js";
import { registerEvidence } from "./routes/evidence.js";
import { registerOpportunities } from "./routes/opportunities.js";
import { registerApplications } from "./routes/applications.js";
import { registerDocuments } from "./routes/documents.js";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import { registerCv } from "./routes/cv.js";
import { registerLinkedIn } from "./routes/linkedin.js";
import {
  configureProvider,
  createOpenAIProvider,
  createGeminiProvider,
  createFallbackProvider,
  MEH_SYSTEM_PROMPT,
} from "@careerflow/meh";
import { registerInterview } from "./routes/interview.js";
import { registerOffers } from "./routes/offers.js";
import { registerGrowth } from "./routes/growth.js";
import { registerNotifications } from "./routes/notifications.js";
import { registerCalendarExport } from "./routes/calendarExport.js";
import { registerAdminAuth } from "./routes/adminAuth.js";
import { registerAdminActions } from "./routes/adminActions.js";
import { registerOwnerActions } from "./routes/ownerActions.js";
import { startNotificationsScheduler } from "./notificationsScheduler.js";
import { startImpersonationReaper } from "./impersonationReaper.js";
import { registerSettings } from "./routes/settings.js";
import { registerFeedback } from "./routes/feedback.js";
import { registerMembership } from "./routes/membership.js";
import { registerEmployerMembership } from "./routes/employerMembership.js";
import { registerAdminFeedback } from "./routes/adminFeedback.js";
import { registerPasswordReset } from "./routes/passwordReset.js";
import attachCurrentEmployer from "./plugins/currentEmployer.js";
import { registerEmployerAuth } from "./routes/employerAuth.js";
import { registerEmployerInvitations } from "./routes/employerInvitations.js";
import { registerEmployerApplications } from "./routes/employerApplications.js";
import { registerApplicationInvitations } from "./routes/applicationInvitations.js";
import { registerPaymentWebhooks } from "./routes/paymentWebhooks.js";

const app = Fastify({
  logger: { level: env.NODE_ENV === "development" ? "info" : "warn" },
});

const systemPrompt = env.MEH_SYSTEM_PROMPT ?? MEH_SYSTEM_PROMPT;
if (env.GEMINI_API_KEY) {
  const gemini = createGeminiProvider({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    systemPrompt,
  });
  if (env.OPENAI_API_KEY) {
    configureProvider(
      createFallbackProvider(
        gemini,
        createOpenAIProvider({
          baseUrl: env.OPENAI_BASE_URL,
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL,
          systemPrompt,
        }),
      ),
    );
  } else {
    configureProvider(gemini);
  }
  app.log.info("MEH Gemini provider configured");
} else if (env.OPENAI_API_KEY) {
  configureProvider(
    createOpenAIProvider({
      baseUrl: env.OPENAI_BASE_URL,
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      systemPrompt,
    }),
  );
  app.log.info("MEH OpenAI provider configured");
} else if (
  env.MEH_PROVIDER_URL &&
  env.MEH_PROVIDER_KEY &&
  env.MEH_PROVIDER_MODEL
) {
  configureProvider(
    createOpenAIProvider({
      baseUrl: env.MEH_PROVIDER_URL,
      apiKey: env.MEH_PROVIDER_KEY,
      model: env.MEH_PROVIDER_MODEL,
      systemPrompt,
    }),
  );
  app.log.info("MEH connected provider configured");
} else {
  configureProvider(null);
  app.log.info("MEH connected provider NOT configured — offline mode only");
}

function originOf(value: string): string {
  return new URL(value).origin;
}

await app.register(cors, {
  origin: [
    ...new Set([env.APP_URL, env.ADMIN_URL, env.EMPLOYER_URL].map(originOf)),
  ],
  credentials: true,
});
await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});
await app.register(cookie);
await app.register(attachCurrentUser);
await app.register(attachCurrentEmployer);

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.addHook("onRequest", async (req, reply) => {
  if (!stateChangingMethods.has(req.method)) return;
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname.startsWith("/webhooks/")) return;
  const expectedUrl = pathname.startsWith("/admin/")
    ? env.ADMIN_URL
    : pathname.startsWith("/employer/")
      ? env.EMPLOYER_URL
      : env.APP_URL;
  const rawOrigin = req.headers.origin;
  let requestOrigin: string;
  try {
    if (!rawOrigin || rawOrigin === "null") throw new Error("missing_origin");
    requestOrigin = new URL(rawOrigin).origin;
  } catch {
    return reply.code(403).send({ error: "invalid_origin" });
  }
  if (requestOrigin !== originOf(expectedUrl)) {
    return reply.code(403).send({ error: "invalid_origin" });
  }
});

await app.register(registerHealth);
await app.register(registerAuth, { prefix: "/auth" });
await app.register(registerWorkspaces, { prefix: "/workspaces" });
await app.register(registerMeh, { prefix: "/meh" });
await app.register(registerDirections, { prefix: "/directions" });
await app.register(registerProfiles, { prefix: "/profiles" });
await app.register(registerEvidence, { prefix: "/evidence" });
await app.register(registerOpportunities, { prefix: "/opportunities" });
await app.register(registerApplications, { prefix: "/applications" });
await app.register(registerDocuments, { prefix: "/documents" });

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(registerCv, { prefix: "/cv" });
await app.register(registerLinkedIn, { prefix: "/linkedin" });
await app.register(registerInterview, { prefix: "/interview" });
await app.register(registerOffers, { prefix: "/offers" });
await app.register(registerGrowth, { prefix: "/growth" });
await app.register(registerNotifications, { prefix: "/notifications" });
await app.register(registerCalendarExport, { prefix: "/calendar" });
await app.register(registerAdminAuth, { prefix: "/admin/auth" });
await app.register(registerAdminActions, { prefix: "/admin" });
await app.register(registerOwnerActions, { prefix: "/admin" });
startNotificationsScheduler(app);
startImpersonationReaper(app);

await app.register(registerSettings, { prefix: "/settings" });
await app.register(registerFeedback, { prefix: "/feedback" });
await app.register(registerPasswordReset, { prefix: "/password-reset" });
await app.register(registerMembership, { prefix: "/membership" });
await app.register(registerAdminFeedback, { prefix: "/admin" });

await app.register(registerEmployerAuth, { prefix: "/employer/auth" });
await app.register(registerEmployerMembership, {
  prefix: "/employer/membership",
});
await app.register(registerEmployerInvitations, {
  prefix: "/employer/invitations",
});
await app.register(registerEmployerApplications, {
  prefix: "/employer/applications",
});
await app.register(registerApplicationInvitations, { prefix: "/applications" });
await app.register(registerPaymentWebhooks, { prefix: "/webhooks" });
app.get("/employer/me", async (req, reply) => {
  if (!req.employer) return reply.code(401).send({ error: "unauthenticated" });
  return { employer: req.employer };
});

await app.listen({ port: env.PORT, host: "0.0.0.0" });
