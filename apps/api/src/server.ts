import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { env } from './env.js';
import attachCurrentUser from './plugins/current-user.js';
import { registerHealth } from './routes/health.js';
import { registerAuth } from './routes/auth.js';
import { registerWorkspaces } from './routes/workspaces.js';
import { registerMeh } from './routes/meh.js';
import { registerDirections } from './routes/directions.js';
import { registerProfiles } from './routes/profiles.js';
import { registerEvidence } from './routes/evidence.js';
import { registerOpportunities } from './routes/opportunities.js';
import { registerApplications } from './routes/applications.js';
import { registerDocuments } from './routes/documents.js';
import multipart from '@fastify/multipart';
import { registerCv } from './routes/cv.js';
import { registerLinkedIn } from './routes/linkedin.js';
import { configureProvider, createOpenAIProvider, MEH_SYSTEM_PROMPT } from '@careerflow/meh';
import { registerInterview } from './routes/interview.js';
import { registerOffers } from './routes/offers.js';
import { registerGrowth } from './routes/growth.js';
import { registerNotifications } from './routes/notifications.js';
import { registerCalendarExport } from './routes/calendarExport.js';
import { registerAdminAuth } from './routes/adminAuth.js';
import { registerAdminActions } from './routes/adminActions.js';
import { startNotificationsScheduler } from './notificationsScheduler.js';
import { registerSettings } from './routes/settings.js';
import { registerFeedback } from './routes/feedback.js';
import { registerMembership } from './routes/membership.js';
import { registerAdminFeedback } from './routes/adminFeedback.js';
import { registerPasswordReset } from './routes/passwordReset.js';
import attachCurrentEmployer from './plugins/currentEmployer.js';
import { registerEmployerAuth } from './routes/employerAuth.js';
import { registerEmployerInvitations } from './routes/employerInvitations.js';
import { registerEmployerApplications } from './routes/employerApplications.js';
import { registerApplicationInvitations } from './routes/applicationInvitations.js';

const app = Fastify({
  logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
});

if (env.MEH_PROVIDER_URL && env.MEH_PROVIDER_KEY && env.MEH_PROVIDER_MODEL) {
  configureProvider(createOpenAIProvider({
    baseUrl: env.MEH_PROVIDER_URL,
    apiKey: env.MEH_PROVIDER_KEY,
    model: env.MEH_PROVIDER_MODEL,
    systemPrompt: env.MEH_SYSTEM_PROMPT ?? MEH_SYSTEM_PROMPT,
  }));
  app.log.info('MEH connected provider configured');
} else {
  configureProvider(null);
  app.log.info('MEH connected provider NOT configured — offline mode only');
}

await app.register(cors, { origin: [env.APP_URL, env.ADMIN_URL, env.EMPLOYER_URL], credentials: true });
await app.register(cookie);
await app.register(attachCurrentUser);
await app.register(attachCurrentEmployer);

await app.register(registerHealth);
await app.register(registerAuth, { prefix: '/auth' });
await app.register(registerWorkspaces, { prefix: '/workspaces' });
await app.register(registerMeh, { prefix: '/meh' });
await app.register(registerDirections, { prefix: '/directions' });
await app.register(registerProfiles, { prefix: '/profiles' });
await app.register(registerEvidence, { prefix: '/evidence' });
await app.register(registerOpportunities, { prefix: '/opportunities' });
await app.register(registerApplications, { prefix: '/applications' });
await app.register(registerDocuments, { prefix: '/documents' });

await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await app.register(registerCv, { prefix: '/cv' });
await app.register(registerLinkedIn, { prefix: '/linkedin' });
await app.register(registerInterview, { prefix: '/interview' });
await app.register(registerOffers, { prefix: '/offers' });
await app.register(registerGrowth, { prefix: '/growth' });
await app.register(registerNotifications, { prefix: '/notifications' });
await app.register(registerCalendarExport, { prefix: '/calendar' });
await app.register(registerAdminAuth, { prefix: '/admin/auth' });
await app.register(registerAdminActions, { prefix: '/admin' });
startNotificationsScheduler(app);

await app.register(registerSettings, { prefix: '/settings' });
await app.register(registerFeedback, { prefix: '/feedback' });
await app.register(registerPasswordReset, { prefix: '/password-reset' });
await app.register(registerMembership, { prefix: '/membership' });
await app.register(registerAdminFeedback, { prefix: '/admin' });

await app.register(registerEmployerAuth, { prefix: '/employer/auth' });
await app.register(registerEmployerInvitations, { prefix: '/employer/invitations' });
await app.register(registerEmployerApplications, { prefix: '/employer/applications' });
await app.register(registerApplicationInvitations, { prefix: '/applications' });
app.get('/employer/me', async (req, reply) => {
  if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
  return { employer: req.employer };
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
