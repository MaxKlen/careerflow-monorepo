export const WORKSPACE_KINDS = ['personal', 'sample'] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const SOURCE_TYPES = [
  'candidate_input', 'opportunity_listing', 'evidence_item', 'profile_version', 'ai_generated_unverified',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const REQ_EVIDENCE_STATES = ['linked', 'phrase_match', 'none'] as const;
export type ReqEvidenceState = (typeof REQ_EVIDENCE_STATES)[number];

export const APP_STAGES = ['considering', 'preparing', 'applied', 'interviewing', 'offer', 'closed'] as const;
export type AppStage = (typeof APP_STAGES)[number];

export const CONSENT_FEATURES = [
  'ai_connected', 'calendar', 'linkedin_connection', 'analytics', 'profile_discovery',
] as const;
export type ConsentFeature = (typeof CONSENT_FEATURES)[number];

export const ARRANGEMENTS = ['remote', 'hybrid', 'onsite'] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];
