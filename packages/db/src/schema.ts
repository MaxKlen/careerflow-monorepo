import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, pgEnum, index , uniqueIndex} from 'drizzle-orm/pg-core';

export const workspaceKind    = pgEnum('workspace_kind', ['personal', 'sample']);
export const sourceType       = pgEnum('source_type', ['candidate_input','opportunity_listing','evidence_item','profile_version','ai_generated_unverified','employer_action']);
export const reqEvidenceState = pgEnum('req_evidence_state', ['linked','phrase_match','none']);
export const appStage         = pgEnum('app_stage', ['considering','preparing','applied','interviewing','offer','closed']);
export const consentFeature   = pgEnum('consent_feature', ['ai_connected','calendar','linkedin_connection','analytics','profile_discovery']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  locale: text('locale').notNull().default('en'),
  timezone: text('timezone').notNull().default('UTC'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index().on(t.userId) }));

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: workspaceKind('kind').notNull().default('personal'),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index().on(t.ownerId) }));

export const careerDirections = pgTable('career_directions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  summaryInOwnWords: text('summary_in_own_words').notNull(),
  entryPoint: text('entry_point').notNull(),
  constraints: jsonb('constraints').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revisedAt: timestamp('revised_at', { withTimezone: true }),
});

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  directionId: uuid('direction_id').references(() => careerDirections.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  status: text('status').notNull().default('active'),
  targetDate: timestamp('target_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const profileVersions = pgTable('profile_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  targetRoles: jsonb('target_roles').notNull().default([]),
  headline: text('headline'),
  summary: text('summary'),
  preferences: jsonb('preferences').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const experiences = pgTable('experiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileVersionId: uuid('profile_version_id').notNull().references(() => profileVersions.id, { onDelete: 'cascade' }),
  company: text('company').notNull(),
  role: text('role').notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  bullets: jsonb('bullets').notNull().default([]),
  position: integer('position').notNull().default(0),
});

export const educations = pgTable('educations', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileVersionId: uuid('profile_version_id').notNull().references(() => profileVersions.id, { onDelete: 'cascade' }),
  institution: text('institution').notNull(),
  credential: text('credential'),
  field: text('field'),
  startDate: text('start_date'),
  endDate: text('end_date'),
});

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileVersionId: uuid('profile_version_id').notNull().references(() => profileVersions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sourceType: sourceType('source_type').notNull().default('candidate_input'),
});

export const certifications = pgTable('certifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileVersionId: uuid('profile_version_id').notNull().references(() => profileVersions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  issuer: text('issuer'),
  issuedAt: text('issued_at'),
  expiresAt: text('expires_at'),
});

export const evidenceItems = pgTable('evidence_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  context: text('context').notNull(),
  action: text('action').notNull(),
  result: text('result'),
  dates: jsonb('dates').notNull().default({}),
  skills: jsonb('skills').notNull().default([]),
  tags: jsonb('tags').notNull().default([]),
  sourceType: sourceType('source_type').notNull().default('candidate_input'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opportunitySources = pgTable('opportunity_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url'),
  sourceKind: text('source_kind').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  raw: jsonb('raw').notNull().default({}),
});

export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  sourceId: uuid('source_id').notNull().references(() => opportunitySources.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location'),
  arrangement: text('arrangement'),
  compensation: jsonb('compensation').notNull().default({}),
  description: text('description').notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opportunityRequirements = pgTable('opportunity_requirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  position: integer('position').notNull().default(0),
});

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
  stage: appStage('stage').notNull().default('considering'),
  nextAction: text('next_action'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  notes: text('notes'),
  submissionRecordedAt: timestamp('submission_recorded_at', { withTimezone: true }),
  submissionConfirmedAt: timestamp('submission_confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const applicationRequirements = pgTable('application_requirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  sourceRequirementId: uuid('source_requirement_id').references(() => opportunityRequirements.id, { onDelete: 'set null' }),
  position: integer('position').notNull().default(0),
});

export const requirementEvidenceLinks = pgTable('requirement_evidence_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  requirementId: uuid('requirement_id').notNull().references(() => applicationRequirements.id, { onDelete: 'cascade' }),
  evidenceId: uuid('evidence_id').references(() => evidenceItems.id, { onDelete: 'set null' }),
  state: reqEvidenceState('state').notNull(),
  phrase: text('phrase'),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  sourceChangedAt: timestamp('source_changed_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export const applicationCompensationNotes = pgTable('application_compensation_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  currency: text('currency').notNull(),
  amountMin: integer('amount_min'),
  amountMax: integer('amount_max'),
  period: text('period').notNull(),
  isEstimate: boolean('is_estimate').notNull().default(true),
  sourceType: sourceType('source_type').notNull(),
  note: text('note'),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documentVersions = pgTable('document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  provenance: jsonb('provenance').notNull().default([]),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  feature: consentFeature('feature').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  evidence: jsonb('evidence').notNull().default({}),
}, (t) => ({ lookup: index().on(t.workspaceId, t.feature) }));


export const cvImportSessions = pgTable('cv_import_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  storageKey: text('storage_key').notNull(),
  status: text('status').notNull().default('pending'),
  rawText: text('raw_text'),
  sections: jsonb('sections').notNull().default([]),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  parsedAt: timestamp('parsed_at', { withTimezone: true }),
});

export const applicationEventKind = pgEnum('application_event_kind', [
  'note',
  'submission_recorded',
  'submission_confirmed',
  'interview_scheduled',
  'interview_completed',
  'follow_up',
  'offer_received',
  'offer_declined',
  'closed',
]);

export const applicationEvents = pgTable('application_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  kind: applicationEventKind('kind').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  note: text('note'),
  sourceType: sourceType('source_type').notNull().default('candidate_input'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ appIdx: index().on(t.applicationId, t.occurredAt) }));


export const mehRole = pgEnum('meh_role', ['user', 'assistant', 'system']);
export const mehModeKind = pgEnum('meh_mode_kind', ['offline', 'connected']);

export const mehConversations = pgTable('meh_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index().on(t.workspaceId) }));

export const mehMessages = pgTable('meh_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => mehConversations.id, { onDelete: 'cascade' }),
  role: mehRole('role').notNull(),
  content: text('content').notNull(),
  modeKind: mehModeKind('mode_kind').notNull(),
  sourceType: sourceType('source_type').notNull(),
  provenance: jsonb('provenance').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ convIdx: index().on(t.conversationId, t.createdAt) }));


export const interviewPreps = pgTable('interview_preps', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }).unique(),
  selectedQuestionIds: jsonb('selected_question_ids').notNull().default([]),
  evidenceIds: jsonb('evidence_ids').notNull().default([]),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const growthGoalStatus = pgEnum('growth_goal_status', ['active', 'done', 'dropped']);

export const growthGoals = pgTable('growth_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  status: growthGoalStatus('status').notNull().default('active'),
  targetDate: timestamp('target_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index().on(t.workspaceId) }));

export const growthEntryKind = pgEnum('growth_entry_kind', ['achievement', 'reflection', 'conversation', 'learning']);

export const growthEntries = pgTable('growth_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  goalId: uuid('goal_id').references(() => growthGoals.id, { onDelete: 'set null' }),
  kind: growthEntryKind('kind').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index().on(t.workspaceId, t.occurredAt) }));


// M8: notifications, isolated admin identity, audit, and feature flags.
export const notificationKindEnum = pgEnum('notification_kind', [
  'application_deadline', 'follow_up_due', 'interview_scheduled',
  'goal_reminder', 'weekly_digest',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: notificationKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  dedupeKey: text('dedupe_key').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  wsIdx: index('notifications_workspace_read_idx').on(t.workspaceId, t.readAt),
  dedupeUniq: uniqueIndex('notif_ws_dedupe').on(t.workspaceId, t.dedupeKey),
}));

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: notificationKindEnum('kind').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  quietHoursStart: text('quiet_hours_start'),
  quietHoursEnd: text('quiet_hours_end'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex('notif_pref_ws_kind').on(t.workspaceId, t.kind),
}));

export const adminRoleEnum = pgEnum('admin_role', ['owner', 'support', 'viewer']);
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: adminRoleEnum('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
});

export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index('admin_sessions_user_idx').on(t.adminUserId) }));

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorAdminUserId: uuid('actor_admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: jsonb('metadata').notNull().default({}),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index('audit_actor_created_idx').on(t.actorAdminUserId, t.createdAt),
  actionIdx: index('audit_action_created_idx').on(t.action, t.createdAt),
}));

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  updatedByAdminUserId: uuid('updated_by_admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// M9: settings, data export, feedback, subscriptions.
export const dataExports = pgTable('data_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  storageKey: text('storage_key'),
  error: text('error'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (t) => ({ userIdx: index('data_exports_user_idx').on(t.userId) }));

export const feedbackKindEnum = pgEnum('feedback_kind', ['bug', 'suggestion', 'question', 'concern']);
export const feedbackStatusEnum = pgEnum('feedback_status', ['open', 'acknowledged', 'resolved', 'closed']);

export const feedbackItems = pgTable('feedback_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  kind: feedbackKindEnum('kind').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  contactOk: boolean('contact_ok').notNull().default(false),
  contextScreen: text('context_screen'),
  status: feedbackStatusEnum('status').notNull().default('open'),
  adminNotes: text('admin_notes'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ statusIdx: index('feedback_status_created_idx').on(t.status, t.createdAt) }));

// M10: hashed, single-use, expiring password-reset tokens.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  requestedIp: text('requested_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index('prt_user_idx').on(t.userId) }));

export const subscriptionPlanEnum = pgEnum('subscription_plan', ['starter', 'plus', 'growth']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled', 'trialing']);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  plan: subscriptionPlanEnum('plan').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  provider: text('provider'),
  externalId: text('external_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ wsIdx: index('subscriptions_workspace_idx').on(t.workspaceId) }));


// M11: employer workspace — separate auth domain.
export const employerUsers = pgTable('employer_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  companyName: text('company_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
});

export const employerSessions = pgTable('employer_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerUserId: uuid('employer_user_id').notNull().references(() => employerUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index('employer_sessions_user_idx').on(t.employerUserId) }));

export const employerInvitations = pgTable('employer_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  employerEmail: text('employer_email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  employerUserId: uuid('employer_user_id').references(() => employerUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  appIdx: index('employer_inv_app_idx').on(t.applicationId),
  empIdx: index('employer_inv_emp_idx').on(t.employerUserId),
}));
