import type { EvidenceRecord } from './domain';

export type EvidenceDraft = Omit<EvidenceRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type EvidenceErrors = Partial<Record<keyof EvidenceDraft, string>>;

export function validateEvidenceDraft(input: EvidenceDraft): EvidenceErrors {
  const errors: EvidenceErrors = {};
  const limits = { title: 100, context: 500, action: 500, result: 500 } as const;
  for (const field of ['title', 'context', 'action', 'result'] as const) {
    const value = input[field].trim();
    if (!value) errors[field] = `${field[0].toUpperCase()}${field.slice(1)} is required.`;
    else if (value.length > limits[field]) errors[field] = `Use ${limits[field]} characters or fewer.`;
  }
  if (input.skillTags.length > 8) errors.skillTags = 'Use 8 skill tags or fewer.';
  else if (input.skillTags.some((tag) => !tag.trim() || tag.trim().length > 40)) errors.skillTags = 'Each skill tag must contain 1–40 characters.';
  else if (new Set(input.skillTags.map((tag) => tag.trim().toLocaleLowerCase())).size !== input.skillTags.length) errors.skillTags = 'Remove duplicate skill tags.';
  return errors;
}

export function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ['id', 'title', 'context', 'action', 'result', 'createdAt', 'updatedAt'].every((field) => typeof item[field] === 'string')
    && (item.id as string).length > 0
    && (item.title as string).trim().length > 0 && (item.title as string).length <= 100
    && (item.context as string).trim().length > 0 && (item.context as string).length <= 500
    && (item.action as string).trim().length > 0 && (item.action as string).length <= 500
    && (item.result as string).trim().length > 0 && (item.result as string).length <= 500
    && Array.isArray(item.skillTags) && item.skillTags.length <= 8
    && item.skillTags.every((tag) => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 40)
    && new Set((item.skillTags as string[]).map((tag) => tag.trim().toLocaleLowerCase())).size === item.skillTags.length;
}

export function sortEvidenceRecords(items: EvidenceRecord[], query = ''): EvidenceRecord[] {
  const normalized = query.trim().toLocaleLowerCase();
  return items
    .filter((item) => !normalized || `${item.title} ${item.context} ${item.action} ${item.result} ${item.skillTags.join(' ')}`.toLocaleLowerCase().includes(normalized))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
