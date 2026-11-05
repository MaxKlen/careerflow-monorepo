import type { ApplicationDraft } from './application';
import type { CandidateOpportunity } from './domain';

export interface SampleOpportunity {
  id: string;
  company: string;
  role: string;
  location: string;
  type: string;
  category: string;
  summary: string;
  keywords: string[];
}

export type CandidateOpportunityInput = Pick<CandidateOpportunity, 'company' | 'role' | 'location' | 'type' | 'summary' | 'keywords'>;
export type OpportunitySourceFilter = 'all' | 'sample' | 'candidate';
export type SearchOpportunity = (SampleOpportunity & { source: 'sample' })
  | (CandidateOpportunity & { category: 'Your entries'; source: 'candidate' });

export interface OpportunityEntryErrors {
  company?: string;
  role?: string;
  location?: string;
  type?: string;
  summary?: string;
  keywords?: string;
  form?: string;
}

export type CandidateOpportunityMutation =
  | { ok: true; opportunity: CandidateOpportunity }
  | { ok: false; errors: OpportunityEntryErrors };

export interface OpportunityPhraseMatch {
  matchedPhrases: string[];
  missingPhrases: string[];
  overlapPercent: number;
}

export const MAX_CANDIDATE_OPPORTUNITY_RECORDS = 100;
export const MAX_OPPORTUNITY_KEYWORDS = 20;
export const MAX_OPPORTUNITY_KEYWORD_LENGTH = 80;

export const SAMPLE_OPPORTUNITIES: SampleOpportunity[] = [
  {
    id: 'lumenforge-product-analyst',
    company: 'LumenForge Labs',
    role: 'Product Analyst',
    location: 'Northstar City',
    type: 'Hybrid',
    category: 'Analytics',
    summary: 'Explore fictional product data and turn customer signals into clear product insights.',
    keywords: ['SQL', 'product analytics', 'A/B testing', 'data visualization'],
  },
  {
    id: 'cloudberry-frontend-engineer',
    company: 'Cloudberry Works',
    role: 'Frontend Engineer',
    location: 'Remote',
    type: 'Full-time',
    category: 'Engineering',
    summary: 'Build friendly fictional web experiences for a collaborative digital tools studio.',
    keywords: ['TypeScript', 'React', 'accessibility', 'responsive design', 'unit testing'],
  },
  {
    id: 'orbitpine-operations-coordinator',
    company: 'OrbitPine Systems',
    role: 'Operations Coordinator',
    location: 'Harbor Glen',
    type: 'On-site',
    category: 'Operations',
    summary: 'Coordinate fictional internal workflows and help a small systems team stay organized.',
    keywords: ['process improvement', 'project coordination', 'stakeholder communication', 'documentation'],
  },
  {
    id: 'mossline-content-designer',
    company: 'Mossline Studio',
    role: 'Content Designer',
    location: 'Remote',
    type: 'Contract',
    category: 'Design',
    summary: 'Shape fictional product language that makes complex tools easier to understand.',
    keywords: ['UX writing', 'content strategy', 'user research', 'design systems'],
  },
  {
    id: 'quillstar-security-associate',
    company: 'Quillstar Circuitry',
    role: 'Security Associate',
    location: 'Pineglass',
    type: 'Full-time',
    category: 'Security',
    summary: 'Support fictional security reviews and practical risk awareness across a growing team.',
    keywords: ['threat modeling', 'security awareness', 'incident response', 'risk assessment'],
  },
  {
    id: 'sunward-community-manager',
    company: 'Sunward Commons',
    role: 'Community Manager',
    location: 'Remote',
    type: 'Part-time',
    category: 'Community',
    summary: 'Help a fictional member community connect through thoughtful programs and communication.',
    keywords: ['community engagement', 'event planning', 'social media', 'member support'],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number, required = false): value is string {
  return typeof value === 'string' && value.length <= maxLength && (!required || value.trim().length > 0);
}

function identity(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeOpportunityPhrase(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\bc\+\+/g, 'cplusplus')
    .replace(/\bc#/g, 'csharp')
    .replace(/[\u2010-\u2015\u2212-]/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function validateOpportunityEntry(input: CandidateOpportunityInput): OpportunityEntryErrors {
  const errors: OpportunityEntryErrors = {};
  if (!isBoundedString(input.company, 100, true)) errors.company = 'Enter an organization name (up to 100 characters).';
  if (!isBoundedString(input.role, 100, true)) errors.role = 'Enter a role title (up to 100 characters).';
  if (!isBoundedString(input.location, 100)) errors.location = 'Use 100 characters or fewer.';
  if (!isBoundedString(input.type, 60)) errors.type = 'Use 60 characters or fewer.';
  if (!isBoundedString(input.summary, 600)) errors.summary = 'Use 600 characters or fewer.';

  if (!Array.isArray(input.keywords) || input.keywords.length < 1) {
    errors.keywords = 'Add at least one exact phrase, one per line.';
  } else if (input.keywords.length > MAX_OPPORTUNITY_KEYWORDS) {
    errors.keywords = `Use no more than ${MAX_OPPORTUNITY_KEYWORDS} phrases.`;
  } else if (input.keywords.some((keyword) => !isBoundedString(keyword, MAX_OPPORTUNITY_KEYWORD_LENGTH, true))) {
    errors.keywords = `Each phrase must be nonempty and ${MAX_OPPORTUNITY_KEYWORD_LENGTH} characters or fewer.`;
  } else if (new Set(input.keywords.map(normalizeOpportunityPhrase)).size !== input.keywords.length) {
    errors.keywords = 'Remove duplicate phrases; comparison uses normalized exact phrases.';
  }
  return errors;
}

function hasDuplicateIdentity(input: CandidateOpportunityInput, candidates: CandidateOpportunity[], excludedId?: string): boolean {
  return [
    ...SAMPLE_OPPORTUNITIES,
    ...candidates.filter((candidate) => candidate.id !== excludedId),
  ].some((item) => identity(item.company) === identity(input.company)
    && identity(item.role) === identity(input.role));
}

export function createCandidateOpportunity(
  input: CandidateOpportunityInput,
  candidates: CandidateOpportunity[],
  id: string,
  createdAt: string,
): CandidateOpportunityMutation {
  const errors = validateOpportunityEntry(input);
  if (candidates.length >= MAX_CANDIDATE_OPPORTUNITY_RECORDS) {
    errors.form = `This preview stores up to ${MAX_CANDIDATE_OPPORTUNITY_RECORDS} local opportunity entries.`;
  }
  if (typeof input.company === 'string' && typeof input.role === 'string'
    && hasDuplicateIdentity(input, candidates)) {
    errors.form = 'That organization and role are already in the local opportunity list.';
  }
  if (!isBoundedString(id, 120, true) || !isBoundedString(createdAt, 40, true) || Number.isNaN(Date.parse(createdAt))) {
    errors.form = 'A valid local record ID and creation time are required.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    opportunity: {
      id,
      company: input.company.trim(),
      role: input.role.trim(),
      location: input.location.trim(),
      type: input.type.trim(),
      summary: input.summary.trim(),
      keywords: input.keywords.map((phrase) => phrase.trim()),
      createdAt,
      updatedAt: createdAt,
    },
  };
}

export function updateCandidateOpportunity(
  existing: CandidateOpportunity,
  input: CandidateOpportunityInput,
  candidates: CandidateOpportunity[],
  updatedAt: string,
): CandidateOpportunityMutation {
  const errors = validateOpportunityEntry(input);
  if (typeof input.company === 'string' && typeof input.role === 'string'
    && hasDuplicateIdentity(input, candidates, existing.id)) {
    errors.form = 'That organization and role are already in the local opportunity list.';
  }
  if (!isBoundedString(updatedAt, 40, true) || Number.isNaN(Date.parse(updatedAt))) {
    errors.form = 'A valid update time is required.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    opportunity: {
      ...existing,
      company: input.company.trim(),
      role: input.role.trim(),
      location: input.location.trim(),
      type: input.type.trim(),
      summary: input.summary.trim(),
      keywords: input.keywords.map((phrase) => phrase.trim()),
      updatedAt,
    },
  };
}

export function removeCandidateOpportunity(candidates: CandidateOpportunity[], id: string): CandidateOpportunity[] {
  return candidates.filter((candidate) => candidate.id !== id);
}

export function isValidCandidateOpportunity(value: unknown): value is CandidateOpportunity {
  if (!isRecord(value)) return false;
  const expectedKeys = ['company', 'createdAt', 'id', 'keywords', 'location', 'role', 'summary', 'type', 'updatedAt'];
  if (Object.keys(value).sort().join('\u0000') !== expectedKeys.join('\u0000')) return false;
  if (!isBoundedString(value.id, 120, true)
    || !isBoundedString(value.createdAt, 40, true)
    || Number.isNaN(Date.parse(value.createdAt))
    || !isBoundedString(value.updatedAt, 40, true)
    || Number.isNaN(Date.parse(value.updatedAt))
    || !Array.isArray(value.keywords)) return false;

  return Object.keys(validateOpportunityEntry({
    company: value.company as string,
    role: value.role as string,
    location: value.location as string,
    type: value.type as string,
    summary: value.summary as string,
    keywords: value.keywords as string[],
  })).length === 0;
}

export function isValidOpportunityCollection(value: unknown): value is CandidateOpportunity[] {
  if (!Array.isArray(value) || value.length > MAX_CANDIDATE_OPPORTUNITY_RECORDS || !value.every(isValidCandidateOpportunity)) return false;
  const ids = new Set<string>();
  const identities = new Set(SAMPLE_OPPORTUNITIES.map((opportunity) => `${identity(opportunity.company)}\u0000${identity(opportunity.role)}`));
  for (const opportunity of value) {
    const normalizedIdentity = `${identity(opportunity.company)}\u0000${identity(opportunity.role)}`;
    if (ids.has(opportunity.id) || identities.has(normalizedIdentity)) return false;
    ids.add(opportunity.id);
    identities.add(normalizedIdentity);
  }
  return true;
}

export function recoverOpportunityCollection(value: unknown): CandidateOpportunity[] {
  if (!Array.isArray(value)) return [];
  const recovered: CandidateOpportunity[] = [];
  const ids = new Set<string>();
  const identities = new Set(SAMPLE_OPPORTUNITIES.map((opportunity) => `${identity(opportunity.company)}\u0000${identity(opportunity.role)}`));
  for (const candidate of value) {
    if (recovered.length >= MAX_CANDIDATE_OPPORTUNITY_RECORDS || !isValidCandidateOpportunity(candidate)) continue;
    const normalizedIdentity = `${identity(candidate.company)}\u0000${identity(candidate.role)}`;
    if (ids.has(candidate.id) || identities.has(normalizedIdentity)) continue;
    ids.add(candidate.id);
    identities.add(normalizedIdentity);
    recovered.push({ ...candidate, keywords: [...candidate.keywords] });
  }
  return recovered;
}

export function toSearchOpportunities(candidates: CandidateOpportunity[]): SearchOpportunity[] {
  return [
    ...SAMPLE_OPPORTUNITIES.map((opportunity) => ({ ...opportunity, source: 'sample' as const })),
    ...candidates.map((opportunity) => ({ ...opportunity, category: 'Your entries' as const, source: 'candidate' as const })),
  ];
}

export function filterSearchOpportunities(
  opportunities: SearchOpportunity[],
  query: string,
  source: OpportunitySourceFilter = 'all',
  workType = '',
): SearchOpportunity[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedType = workType.trim().toLowerCase();
  return opportunities.filter((opportunity) => {
    const searchableText = [opportunity.role, opportunity.company, opportunity.location, opportunity.category, opportunity.summary, ...opportunity.keywords]
      .join(' ')
      .toLowerCase();
    return (!normalizedQuery || searchableText.includes(normalizedQuery))
      && (source === 'all' || opportunity.source === source)
      && (!normalizedType || opportunity.type.toLocaleLowerCase().includes(normalizedType));
  });
}

export function matchOpportunityPhrases(cvText: string, phrases: string[]): OpportunityPhraseMatch {
  const normalizedCv = normalizeOpportunityPhrase(cvText);
  const matchedPhrases: string[] = [];
  const missingPhrases: string[] = [];
  for (const phrase of phrases) {
    const normalizedPhrase = normalizeOpportunityPhrase(phrase);
    if (normalizedPhrase && ` ${normalizedCv} `.includes(` ${normalizedPhrase} `)) matchedPhrases.push(phrase);
    else missingPhrases.push(phrase);
  }
  return {
    matchedPhrases,
    missingPhrases,
    overlapPercent: phrases.length ? Math.round((matchedPhrases.length / phrases.length) * 100) : 0,
  };
}

export function isOpportunityTracked(
  opportunity: Pick<SearchOpportunity, 'company' | 'role'>,
  applications: { organization: string; role: string }[],
): boolean {
  return applications.some((application) => identity(application.organization) === identity(opportunity.company)
    && identity(application.role) === identity(opportunity.role));
}

export function createOpportunityApplicationDraft(opportunity: SearchOpportunity): ApplicationDraft {
  return {
    organization: opportunity.company,
    role: opportunity.role,
    status: 'considering',
    nextStep: opportunity.source === 'sample'
      ? 'Review this fictional sample role and decide whether to apply.'
      : 'Review this fictional local opportunity and decide whether to apply.',
    requirements: [...opportunity.keywords],
  };
}
