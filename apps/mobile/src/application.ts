import type { ApplicationRecord, ApplicationStatus, FollowUpEvent, FollowUpEventType } from './domain';
import { isValidApplicationRequirements, isValidRequirementEvidenceLinks } from './requirementCoverage';
import { isValidApplicationMaterialsDraft } from './applicationMaterials';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'considering',
  'preparing',
  'applied',
  'interviewing',
  'offer',
  'closed',
];
export const FOLLOW_UP_EVENT_TYPES: FollowUpEventType[] = ['email', 'phone', 'interview', 'message', 'other'];
export const MAX_FOLLOW_UP_EVENTS = 50;

export type ApplicationDraft = Pick<
  ApplicationRecord,
  'organization' | 'role' | 'status' | 'appliedOn' | 'nextStep' | 'nextStepDueDate'
> & { requirements?: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value;
}

export function isValidFollowUpDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isFollowUpEvent(value: unknown): value is FollowUpEvent {
  if (!isRecord(value)) return false;
  return Object.keys(value).sort().join(',') === 'createdAt,date,id,note,type'
    && typeof value.id === 'string' && value.id.trim().length > 0 && value.id.length <= 120
    && isValidFollowUpDate(value.date)
    && FOLLOW_UP_EVENT_TYPES.includes(value.type as FollowUpEventType)
    && typeof value.note === 'string' && value.note.trim().length > 0 && value.note.trim().length <= 500
    && isValidIsoTimestamp(value.createdAt);
}

export function isValidFollowUpHistory(value: unknown): value is FollowUpEvent[] {
  if (!Array.isArray(value) || value.length > MAX_FOLLOW_UP_EVENTS) return false;
  const ids = new Set<string>();
  return value.every((event) => isFollowUpEvent(event) && !ids.has(event.id) && (ids.add(event.id), true));
}

export function sortFollowUpEvents(events: FollowUpEvent[]): FollowUpEvent[] {
  return events.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export type FollowUpHistoryMutation =
  | { ok: true; history: FollowUpEvent[] }
  | { ok: false; reason: 'invalid' | 'limit' | 'duplicate' | 'missing' };

export function addFollowUpHistoryEvent(history: readonly FollowUpEvent[], event: FollowUpEvent): FollowUpHistoryMutation {
  if (!isValidFollowUpHistory(history) || !isFollowUpEvent(event)) return { ok: false, reason: 'invalid' };
  if (history.length >= MAX_FOLLOW_UP_EVENTS) return { ok: false, reason: 'limit' };
  if (history.some((item) => item.id === event.id)) return { ok: false, reason: 'duplicate' };
  return { ok: true, history: [...history, event] };
}

export function updateFollowUpHistoryEvent(history: readonly FollowUpEvent[], event: FollowUpEvent): FollowUpHistoryMutation {
  if (!isValidFollowUpHistory(history) || !isFollowUpEvent(event)) return { ok: false, reason: 'invalid' };
  if (!history.some((item) => item.id === event.id)) return { ok: false, reason: 'missing' };
  return { ok: true, history: history.map((item) => item.id === event.id ? event : item) };
}

export function removeFollowUpHistoryEvent(history: readonly FollowUpEvent[], id: string): FollowUpHistoryMutation {
  if (!isValidFollowUpHistory(history)) return { ok: false, reason: 'invalid' };
  if (!history.some((item) => item.id === id)) return { ok: false, reason: 'missing' };
  return { ok: true, history: history.filter((item) => item.id !== id) };
}

export function isValidOptionalDate(value: unknown): value is string | undefined {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateApplicationDraft(input: ApplicationDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.organization.trim()) errors.organization = 'Add an organization name.';
  else if (input.organization.trim().length > 120) errors.organization = 'Organization must be 120 characters or fewer.';
  if (!input.role.trim()) errors.role = 'Add a role name.';
  else if (input.role.trim().length > 100) errors.role = 'Role must be 100 characters or fewer.';
  if (!APPLICATION_STATUSES.includes(input.status)) errors.status = 'Choose a supported status.';
  if (!isValidOptionalDate(input.appliedOn)) errors.appliedOn = 'Enter an applied date in YYYY-MM-DD format.';
  if (input.nextStep.length > 280) errors.nextStep = 'Next step must be 280 characters or fewer.';
  if (input.status !== 'closed' && !input.nextStep.trim()) errors.nextStep = 'Add a next step, or close this record.';
  if (!isValidOptionalDate(input.nextStepDueDate)) errors.nextStepDueDate = 'Enter a next-step date in YYYY-MM-DD format.';
  if (input.nextStepDueDate && !input.nextStep.trim()) errors.nextStep = 'Add a next step before setting its date.';
  const requirements: unknown = input.requirements;
  if (requirements !== undefined && !isValidApplicationRequirements(requirements)) {
    if (!Array.isArray(requirements)) errors.requirements = 'Check the requirement list.';
    else if (requirements.length > 20) errors.requirements = 'Use 20 requirements or fewer.';
    else if (requirements.some((requirement: unknown) => typeof requirement !== 'string' || !requirement.trim() || requirement.trim().length > 80)) {
      errors.requirements = 'Each requirement must contain 1–80 characters.';
    } else errors.requirements = 'Remove duplicate requirements.';
  }
  return errors;
}

export function isApplicationRecord(value: unknown): value is ApplicationRecord {
  if (!isRecord(value)) return false;
  const requiredStrings = ['id', 'organization', 'role', 'nextStep', 'createdAt', 'updatedAt'];
  return requiredStrings.every((key) => typeof value[key] === 'string')
    && APPLICATION_STATUSES.includes(value.status as ApplicationStatus)
    && isValidOptionalDate(value.appliedOn)
    && isValidOptionalDate(value.nextStepDueDate)
    && (value.requirements === undefined || isValidApplicationRequirements(value.requirements))
    && isValidRequirementEvidenceLinks(value.requirementEvidenceLinks, value.requirements ?? [])
    && (value.materialsDraft === undefined || isValidApplicationMaterialsDraft(value.materialsDraft))
    && (value.followUpHistory === undefined || isValidFollowUpHistory(value.followUpHistory));
}

export function normalizeApplicationFollowUpHistory(application: ApplicationRecord): ApplicationRecord {
  return { ...application, followUpHistory: application.followUpHistory ?? [] };
}

export function sortApplicationRecords(applications: ApplicationRecord[]): ApplicationRecord[] {
  return applications.slice().sort((a, b) => (
    (a.nextStepDueDate || '9999-12-31').localeCompare(b.nextStepDueDate || '9999-12-31')
      || b.updatedAt.localeCompare(a.updatedAt)
  ));
}
