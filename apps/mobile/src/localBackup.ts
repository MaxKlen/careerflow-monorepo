import type { CareerState, WorkspaceState } from './domain';
import { isApplicationRecord, normalizeApplicationFollowUpHistory } from './application';
import { isEvidenceRecord } from './evidence';
import { isValidOpportunityCollection } from './opportunities';

export const LOCAL_BACKUP_FORMAT = 'careerflow-mobile-local-backup';
export const LOCAL_BACKUP_VERSION = 1;
export const MAX_LOCAL_BACKUP_BYTES = 5 * 1024 * 1024;
export const LOCAL_STORAGE_RECORD_FORMAT = 'careerflow-mobile-local-store';
export const LOCAL_STORAGE_RECORD_VERSION = 1;

export type LocalBackup = {
  format: typeof LOCAL_BACKUP_FORMAT;
  formatVersion: typeof LOCAL_BACKUP_VERSION;
  exportedAt: string;
  career: CareerState;
  workspace: WorkspaceState;
};

export type LocalStorageRecord = {
  format: typeof LOCAL_STORAGE_RECORD_FORMAT;
  version: typeof LOCAL_STORAGE_RECORD_VERSION;
  career: CareerState;
  workspace: WorkspaceState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStrings(value: unknown, fields: string[]): boolean {
  return isRecord(value) && fields.every((field) => typeof value[field] === 'string');
}

function isTask(value: unknown): boolean {
  return isRecord(value)
    && hasStrings(value, ['id', 'title', 'createdAt', 'updatedAt'])
    && ['backlog', 'todo', 'inProgress', 'waiting', 'completed'].includes(value.status as string)
    && ['low', 'medium', 'high'].includes(value.priority as string)
    && ['notes', 'dueDate', 'projectId'].every((field) => !(field in value) || typeof value[field] === 'string');
}

function isProject(value: unknown): boolean {
  return isRecord(value)
    && hasStrings(value, ['id', 'name', 'description'])
    && typeof value.completed === 'boolean';
}

function isProfile(value: unknown): boolean {
  return hasStrings(value, ['name', 'headline', 'targetRole', 'targetIndustry', 'summary', 'skills', 'goals']);
}

function isMilestone(value: unknown): boolean {
  return isRecord(value)
    && hasStrings(value, ['id', 'name'])
    && typeof value.completed === 'boolean';
}

function isCareerState(value: unknown): value is CareerState {
  return isRecord(value)
    && value.version === 1
    && Array.isArray(value.tasks) && value.tasks.every(isTask)
    && Array.isArray(value.projects) && value.projects.every(isProject)
    && isProfile(value.profile)
    && Array.isArray(value.milestones) && value.milestones.every(isMilestone)
    && Array.isArray(value.applications) && value.applications.every(isApplicationRecord)
    && Array.isArray(value.evidenceItems) && value.evidenceItems.every(isEvidenceRecord)
    && (!('opportunities' in value) || isValidOpportunityCollection(value.opportunities));
}

function isLinkedInSections(value: unknown): boolean {
  return hasStrings(value, ['headline', 'about', 'experience', 'skills', 'education']);
}

function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.account)) return false;
  return typeof value.account.demoActive === 'boolean'
    && typeof value.account.displayName === 'string'
    && ['Starter', 'Plus', 'Pro'].includes(value.account.tier as string)
    && typeof value.cvText === 'string'
    && typeof value.cvFileName === 'string'
    && isLinkedInSections(value.linkedIn)
    && typeof value.coverLetterText === 'string'
    && typeof value.otherDocumentTitle === 'string'
    && typeof value.otherDocumentText === 'string'
    && (typeof value.savedAt === 'string' || value.savedAt === null);
}

function utf8ByteLength(value: string): number {
  return encodeURIComponent(value).replace(/%[\da-f]{2}/gi, 'U').length;
}

export function createLocalBackup(career: CareerState, workspace: WorkspaceState, exportedAt = new Date().toISOString()): string {
  if (!Array.isArray(career.opportunities) || !isCareerState(career) || !isWorkspaceState(workspace)) {
    throw new Error('The current local data could not be validated for backup.');
  }

  const backup: LocalBackup = {
    format: LOCAL_BACKUP_FORMAT,
    formatVersion: LOCAL_BACKUP_VERSION,
    exportedAt,
    career,
    workspace,
  };
  const raw = JSON.stringify(backup, null, 2);
  if (utf8ByteLength(raw) > MAX_LOCAL_BACKUP_BYTES) {
    throw new Error('The local data is larger than the 5 MiB backup limit.');
  }
  return raw;
}

export function parseLocalBackup(raw: string): LocalBackup {
  if (utf8ByteLength(raw) > MAX_LOCAL_BACKUP_BYTES) {
    throw new Error('This backup is larger than the 5 MiB limit.');
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON. Choose a CareerFlow mobile backup.');
  }

  if (!isRecord(value)
    || value.format !== LOCAL_BACKUP_FORMAT
    || value.formatVersion !== LOCAL_BACKUP_VERSION
    || typeof value.exportedAt !== 'string'
    || Number.isNaN(Date.parse(value.exportedAt))
    || !isCareerState(value.career)
    || !isWorkspaceState(value.workspace)) {
    throw new Error('This is not a compatible CareerFlow mobile backup. Choose a valid backup exported from this app.');
  }

  const backup = value as LocalBackup;
  return {
    ...backup,
    career: {
      ...backup.career,
      opportunities: Array.isArray(backup.career.opportunities) ? backup.career.opportunities : [],
      applications: backup.career.applications.map((application) => normalizeApplicationFollowUpHistory({
        ...application,
        requirements: application.requirements ?? [],
        requirementEvidenceLinks: application.requirementEvidenceLinks ?? [],
      })),
    },
  };
}

export function createLocalStorageRecord(career: CareerState, workspace: WorkspaceState): LocalStorageRecord {
  return {
    format: LOCAL_STORAGE_RECORD_FORMAT,
    version: LOCAL_STORAGE_RECORD_VERSION,
    career,
    workspace,
  };
}

export type LocalBackupStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

async function preservePreviousRecordForRecovery(storage: LocalBackupStorage, storeKey: string, previousRecord: string | null): Promise<void> {
  if (previousRecord === null) return;
  try {
    const recoveryKey = `${storeKey}.recovery`;
    if (await storage.getItem(recoveryKey) !== null) return;
    await storage.setItem(recoveryKey, JSON.stringify({ capturedAt: new Date().toISOString(), raw: previousRecord }));
  } catch {
    // Best effort: retain the original restore failure even if recovery storage is unavailable.
  }
}

export async function replaceLocalBackupInStorage(
  storage: LocalBackupStorage,
  backup: LocalBackup,
  storeKey: string,
): Promise<void> {
  const previousRecord = await storage.getItem(storeKey);
  const nextRecord = JSON.stringify(createLocalStorageRecord(backup.career, backup.workspace));

  try {
    await storage.setItem(storeKey, nextRecord);
    if (await storage.getItem(storeKey) !== nextRecord) {
      throw new Error('The restored local record could not be verified.');
    }
  } catch (error) {
    try {
      if (previousRecord === null) await storage.removeItem(storeKey);
      else await storage.setItem(storeKey, previousRecord);
      if (await storage.getItem(storeKey) !== previousRecord) {
        throw new Error('Rollback readback did not match the previous local record.');
      }
    } catch {
      await preservePreviousRecordForRecovery(storage, storeKey, previousRecord);
      throw new Error('Restore failed and rollback could not be verified. The prior raw record was preserved for recovery when possible; keep the backup file and avoid further changes until device storage is available.');
    }
    throw error;
  }
}
