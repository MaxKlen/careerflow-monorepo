import type { ApplicationMaterialsDraft, ApplicationRecord, RequirementEvidenceLink } from './domain';
import {
  isValidApplicationRequirements,
  isValidRequirementEvidenceLinks,
  normalizeRequirementPhrase,
} from './requirementCoverage';

export const MAX_APPLICATION_MATERIALS_DRAFT_LENGTH = 200_000;

function safeFilePart(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/g, '') || 'application';
}

/** Build a path-safe, timestamped filename for a candidate-requested local text export. */
export function createApplicationMaterialsExportFilename(organization: string, role: string, now = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `careerflow-${safeFilePart(organization)}-${safeFilePart(role)}-materials-${timestamp}.txt`;
}

function copySourceLink(link: RequirementEvidenceLink): RequirementEvidenceLink {
  return {
    requirement: link.requirement,
    evidenceId: link.evidenceId,
    linkedAt: link.linkedAt,
    snapshot: { ...link.snapshot, skillTags: [...link.snapshot.skillTags] },
  };
}

/** Build a plain-text outline from saved requirements and only the evidence snapshots the candidate selected. */
export function createApplicationMaterialsScaffold(
  application: Pick<ApplicationRecord, 'organization' | 'role' | 'requirements' | 'requirementEvidenceLinks'>,
  now = new Date().toISOString(),
): ApplicationMaterialsDraft {
  const requirements = application.requirements ?? [];
  const sources = (application.requirementEvidenceLinks ?? []).map(copySourceLink);
  const lines = [
    'APPLICATION MATERIALS — EDITABLE STARTING OUTLINE',
    `Organization: ${application.organization}`,
    `Role: ${application.role}`,
    '',
    'Review note: This outline copies only the saved requirement phrases and candidate-selected Evidence Library snapshots shown below. Bracketed text is an instruction, not a fact. Check every detail and rewrite in your own words before using it.',
    'Nothing here verifies a qualification, scores job fit, finds a job, or sends or submits anything.',
    '',
    'OPENING',
    '[Write an opening in your own words. Add only details you can confirm.]',
    '',
    'SAVED ROLE REQUIREMENTS AND SELECTED SOURCE NOTES',
  ];

  if (requirements.length === 0) {
    lines.push('[No role requirements are saved yet. Add phrases to this application, then build a fresh outline if useful.]');
  }

  for (const requirement of requirements) {
    lines.push('', `Requirement phrase (saved verbatim): ${requirement}`);
    const matchingSources = sources.filter((source) => normalizeRequirementPhrase(source.requirement) === normalizeRequirementPhrase(requirement));
    if (matchingSources.length === 0) {
      lines.push('[No Evidence Library source was selected for this requirement.]');
      continue;
    }

    for (const source of matchingSources) {
      lines.push(
        `Candidate-selected Evidence Library source: ${source.snapshot.title}`,
        `Source record: ${source.evidenceId} · linked ${source.linkedAt} · source updated ${source.snapshot.updatedAt}`,
        `Context (saved snapshot, verbatim): ${source.snapshot.context}`,
        `Action (saved snapshot, verbatim): ${source.snapshot.action}`,
        `Result (saved snapshot, verbatim): ${source.snapshot.result}`,
        '[Review for accuracy and choose what, if anything, belongs in your materials.]',
      );
    }
  }

  lines.push(
    '',
    'CANDIDATE-WRITTEN DRAFT',
    '[Use this space to write or adapt material. Do not treat a selected source as verified; include only accurate details you are comfortable sharing.]',
    '',
    'CLOSING',
    '[Write your own closing.]',
  );

  const body = lines.join('\n');
  if (body.length > MAX_APPLICATION_MATERIALS_DRAFT_LENGTH) {
    throw new Error('This outline is too long to prepare at once. Use fewer selected evidence links or shorter source notes.');
  }

  return { body, sources, createdAt: now, updatedAt: now };
}

/** Validate a stored draft's independent source snapshots, including snapshots retained after application links change. */
export function isValidApplicationMaterialsDraft(value: unknown): value is ApplicationMaterialsDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  if (typeof draft.body !== 'string' || draft.body.length > MAX_APPLICATION_MATERIALS_DRAFT_LENGTH
    || typeof draft.createdAt !== 'string' || !draft.createdAt.trim() || Number.isNaN(Date.parse(draft.createdAt))
    || typeof draft.updatedAt !== 'string' || !draft.updatedAt.trim() || Number.isNaN(Date.parse(draft.updatedAt))
    || !Array.isArray(draft.sources) || draft.sources.length > 100) return false;

  const requirements: string[] = [];
  const seen = new Set<string>();
  for (const source of draft.sources) {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return false;
    const requirement = (source as Record<string, unknown>).requirement;
    if (typeof requirement !== 'string') return false;
    const normalized = normalizeRequirementPhrase(requirement);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      requirements.push(requirement);
    }
  }

  return isValidApplicationRequirements(requirements)
    && isValidRequirementEvidenceLinks(draft.sources, requirements);
}
