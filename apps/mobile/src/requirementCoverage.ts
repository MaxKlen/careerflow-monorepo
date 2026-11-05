import type { EvidenceRecord, RequirementEvidenceLink } from './domain';

export const MAX_APPLICATION_REQUIREMENTS = 20;
export const MAX_REQUIREMENT_LENGTH = 80;
export const MAX_EVIDENCE_LINKS_PER_REQUIREMENT = 5;
export const MAX_REQUIREMENT_EVIDENCE_LINKS = 100;

export interface RequirementCoverage {
  requirement: string;
  profileSkill: string | null;
  evidenceTags: { evidenceId: string; evidenceTitle: string; tag: string }[];
}

export function normalizeRequirementPhrase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '').toLocaleLowerCase();
}

export function parseApplicationRequirements(text: string): string[] {
  return text.split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•▪]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

export function isValidApplicationRequirements(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_APPLICATION_REQUIREMENTS
    && value.every((requirement) => typeof requirement === 'string'
      && requirement.trim().length > 0
      && requirement.trim().length <= MAX_REQUIREMENT_LENGTH
      && normalizeRequirementPhrase(requirement).length > 0)
    && new Set(value.map((requirement) => normalizeRequirementPhrase(requirement))).size === value.length;
}

export function isValidRequirementEvidenceLinks(value: unknown, requirements: unknown): value is RequirementEvidenceLink[] {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > MAX_REQUIREMENT_EVIDENCE_LINKS || !isValidApplicationRequirements(requirements)) return false;

  const validRequirements = new Set(requirements.map(normalizeRequirementPhrase));
  const linkedPairs = new Set<string>();
  const linksPerRequirement = new Map<string, number>();

  return value.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const link = item as Record<string, unknown>;
    if (typeof link.requirement !== 'string' || link.requirement.trim().length === 0
      || link.requirement.length > MAX_REQUIREMENT_LENGTH
      || !validRequirements.has(normalizeRequirementPhrase(link.requirement))
      || typeof link.evidenceId !== 'string' || link.evidenceId.trim().length === 0 || link.evidenceId.length > 160
      || typeof link.linkedAt !== 'string' || link.linkedAt.trim().length === 0
      || typeof link.snapshot !== 'object' || link.snapshot === null || Array.isArray(link.snapshot)) return false;

    const snapshot = link.snapshot as Record<string, unknown>;
    if (typeof snapshot.title !== 'string' || snapshot.title.trim().length === 0 || snapshot.title.length > 100
      || typeof snapshot.context !== 'string' || snapshot.context.trim().length === 0 || snapshot.context.length > 500
      || typeof snapshot.action !== 'string' || snapshot.action.trim().length === 0 || snapshot.action.length > 500
      || typeof snapshot.result !== 'string' || snapshot.result.trim().length === 0 || snapshot.result.length > 500
      || typeof snapshot.updatedAt !== 'string' || snapshot.updatedAt.trim().length === 0
      || !Array.isArray(snapshot.skillTags) || snapshot.skillTags.length > 8
      || !snapshot.skillTags.every((tag) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 40)) return false;

    const normalizedRequirement = normalizeRequirementPhrase(link.requirement);
    const pair = `${normalizedRequirement}\u0000${link.evidenceId}`;
    const linkCount = (linksPerRequirement.get(normalizedRequirement) ?? 0) + 1;
    if (linkedPairs.has(pair) || linkCount > MAX_EVIDENCE_LINKS_PER_REQUIREMENT) return false;
    linkedPairs.add(pair);
    linksPerRequirement.set(normalizedRequirement, linkCount);
    return true;
  });
}

export function retainRequirementEvidenceLinks(
  requirements: string[],
  links: RequirementEvidenceLink[] | undefined,
): RequirementEvidenceLink[] {
  if (!links?.length) return [];
  const currentPhrases = new Map(requirements.map((requirement) => [normalizeRequirementPhrase(requirement), requirement]));
  return links.flatMap((link) => {
    const requirement = currentPhrases.get(normalizeRequirementPhrase(link.requirement));
    return requirement ? [{ ...link, requirement }] : [];
  });
}

export function calculateRequirementCoverage(
  requirements: string[],
  profileSkills: string[],
  evidenceItems: EvidenceRecord[],
): RequirementCoverage[] {
  return requirements.map((requirement) => {
    const normalized = normalizeRequirementPhrase(requirement);
    const profileSkill = profileSkills.find((skill) => normalizeRequirementPhrase(skill) === normalized) ?? null;
    const evidenceTags = evidenceItems.flatMap((evidence) => evidence.skillTags
      .filter((tag) => normalizeRequirementPhrase(tag) === normalized)
      .map((tag) => ({ evidenceId: evidence.id, evidenceTitle: evidence.title, tag })));
    return { requirement, profileSkill, evidenceTags };
  });
}
