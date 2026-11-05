import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApplicationRecord,
  CareerState,
  LinkedInSections,
  MembershipTier,
  WorkspaceState,
  initialState,
  initialWorkspaceState,
} from './domain';
import { isApplicationRecord, normalizeApplicationFollowUpHistory } from './application';
import { isEvidenceRecord } from './evidence';
import { isValidOpportunityCollection, recoverOpportunityCollection } from './opportunities';
import {
  createLocalStorageRecord,
  LOCAL_STORAGE_RECORD_FORMAT,
  LOCAL_STORAGE_RECORD_VERSION,
  parseLocalBackup,
  replaceLocalBackupInStorage,
} from './localBackup';

const STORE_KEY = 'careerflow.mobile.record.v1';
const STORE_RECOVERY_KEY = `${STORE_KEY}.recovery`;
const CAREER_KEY = 'careerflow.mobile.state.v1';
const CAREER_RECOVERY_KEY = `${CAREER_KEY}.recovery`;
const WORKSPACE_KEY = 'careerflow.mobile.workspace.v1';
const WORKSPACE_RECOVERY_KEY = `${WORKSPACE_KEY}.recovery`;

type StoredState = ReturnType<typeof createLocalStorageRecord>;

type ValueGuard = (value: unknown) => boolean;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStrings(value: unknown, fields: string[]): boolean {
  return isRecord(value) && fields.every((field) => typeof value[field] === 'string');
}

function hasValidCollection(value: unknown, isValid: ValueGuard): boolean {
  // A valid empty collection is meaningful: it can represent an intentional clear.
  return Array.isArray(value) && (value.length === 0 || value.some(isValid));
}

function cloneInitialState(): CareerState {
  return {
    ...initialState,
    tasks: initialState.tasks.map((task) => ({ ...task })),
    projects: initialState.projects.map((project) => ({ ...project })),
    profile: { ...initialState.profile },
    milestones: initialState.milestones.map((milestone) => ({ ...milestone })),
    applications: initialState.applications.map((application) => ({ ...application })),
    evidenceItems: initialState.evidenceItems.map((item) => ({ ...item, skillTags: [...item.skillTags] })),
    opportunities: initialState.opportunities.map((opportunity) => ({ ...opportunity, keywords: [...opportunity.keywords] })),
  };
}

function cloneInitialWorkspaceState(): WorkspaceState {
  return {
    ...initialWorkspaceState,
    account: { ...initialWorkspaceState.account },
    linkedIn: { ...initialWorkspaceState.linkedIn },
  };
}

function isTask(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return hasStrings(value, ['id', 'title', 'createdAt', 'updatedAt'])
    && ['backlog', 'todo', 'inProgress', 'waiting', 'completed'].includes(value.status as string)
    && ['low', 'medium', 'high'].includes(value.priority as string)
    && ['notes', 'dueDate', 'projectId'].every((field) => !(field in value) || typeof value[field] === 'string');
}

function isProject(value: unknown): boolean {
  return hasStrings(value, ['id', 'name', 'description'])
    && isRecord(value)
    && typeof value.completed === 'boolean';
}

function isProfile(value: unknown): value is CareerState['profile'] {
  return hasStrings(value, ['name', 'headline', 'targetRole', 'targetIndustry', 'summary', 'skills', 'goals']);
}

function isMilestone(value: unknown): boolean {
  return hasStrings(value, ['id', 'name']) && isRecord(value) && typeof value.completed === 'boolean';
}

function isCareerState(value: unknown): value is CareerState {
  return isRecord(value)
    && value.version === 1
    && Array.isArray(value.tasks) && value.tasks.every(isTask)
    && Array.isArray(value.projects) && value.projects.every(isProject)
    && isProfile(value.profile)
    && Array.isArray(value.milestones) && value.milestones.every(isMilestone)
    && (!('applications' in value) || (Array.isArray(value.applications) && value.applications.every(isApplicationRecord)))
    && (!('evidenceItems' in value) || (Array.isArray(value.evidenceItems) && value.evidenceItems.every(isEvidenceRecord)))
    && (!('opportunities' in value) || isValidOpportunityCollection(value.opportunities));
}

function recoverCareerState(value: unknown): CareerState | null {
  if (!isRecord(value) || value.version !== 1) return null;

  const defaults = cloneInitialState();
  const recoverItems = <T>(items: unknown, fallback: T[], isValid: ValueGuard): T[] => (
    Array.isArray(items) ? items.filter(isValid) as T[] : fallback
  );
  const profile = isProfile(value.profile) ? value.profile : defaults.profile;

  return {
    version: 1,
    tasks: recoverItems(value.tasks, defaults.tasks, isTask),
    projects: recoverItems(value.projects, defaults.projects, isProject),
    profile: { ...profile },
    milestones: recoverItems(value.milestones, defaults.milestones, isMilestone),
    applications: recoverItems<ApplicationRecord>(value.applications, defaults.applications, isApplicationRecord)
      .map((application) => normalizeApplicationFollowUpHistory({
        ...application,
        requirements: application.requirements ?? [],
        requirementEvidenceLinks: application.requirementEvidenceLinks ?? [],
      })),
    evidenceItems: recoverItems(value.evidenceItems, defaults.evidenceItems, isEvidenceRecord),
    opportunities: recoverOpportunityCollection(value.opportunities),
  };
}

function hasSalvageableCareerData(value: unknown): boolean {
  if (!isRecord(value) || value.version !== 1) return false;

  return hasValidCollection(value.tasks, isTask)
    || hasValidCollection(value.projects, isProject)
    || isProfile(value.profile)
    || hasValidCollection(value.milestones, isMilestone)
    || hasValidCollection(value.applications, isApplicationRecord)
    || hasValidCollection(value.evidenceItems, isEvidenceRecord)
    || isValidOpportunityCollection(value.opportunities);
}

function isMembershipTier(value: unknown): value is MembershipTier {
  return value === 'Starter' || value === 'Plus' || value === 'Pro';
}

function isLinkedInSections(value: unknown): value is LinkedInSections {
  return hasStrings(value, ['headline', 'about', 'experience', 'skills', 'education']);
}

function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.account)) return false;
  return typeof value.account.demoActive === 'boolean'
    && typeof value.account.displayName === 'string'
    && isMembershipTier(value.account.tier)
    && typeof value.cvText === 'string'
    && typeof value.cvFileName === 'string'
    && isLinkedInSections(value.linkedIn)
    && typeof value.coverLetterText === 'string'
    && typeof value.otherDocumentTitle === 'string'
    && typeof value.otherDocumentText === 'string'
    && (typeof value.savedAt === 'string' || value.savedAt === null);
}

function hasSalvageableWorkspaceData(value: unknown): boolean {
  if (!isRecord(value) || value.version !== 1) return false;

  const account = isRecord(value.account) ? value.account : {};
  const linkedIn = isRecord(value.linkedIn) ? value.linkedIn : {};
  return typeof account.demoActive === 'boolean'
    || typeof account.displayName === 'string'
    || isMembershipTier(account.tier)
    || typeof value.cvText === 'string'
    || typeof value.cvFileName === 'string'
    || ['headline', 'about', 'experience', 'skills', 'education'].some((field) => typeof linkedIn[field] === 'string')
    || typeof value.coverLetterText === 'string'
    || typeof value.otherDocumentTitle === 'string'
    || typeof value.otherDocumentText === 'string'
    || typeof value.savedAt === 'string'
    || value.savedAt === null;
}

function recoverWorkspaceState(value: unknown): WorkspaceState | null {
  if (!isRecord(value) || value.version !== 1) return null;

  const defaults = cloneInitialWorkspaceState();
  const account = isRecord(value.account) ? value.account : {};
  const linkedIn = isRecord(value.linkedIn) ? value.linkedIn : {};
  const stringOrDefault = (candidate: unknown, fallback: string) => (
    typeof candidate === 'string' ? candidate : fallback
  );

  return {
    version: 1,
    account: {
      demoActive: typeof account.demoActive === 'boolean' ? account.demoActive : defaults.account.demoActive,
      displayName: stringOrDefault(account.displayName, defaults.account.displayName),
      tier: isMembershipTier(account.tier) ? account.tier : defaults.account.tier,
    },
    cvText: stringOrDefault(value.cvText, defaults.cvText),
    cvFileName: stringOrDefault(value.cvFileName, defaults.cvFileName),
    linkedIn: {
      headline: stringOrDefault(linkedIn.headline, defaults.linkedIn.headline),
      about: stringOrDefault(linkedIn.about, defaults.linkedIn.about),
      experience: stringOrDefault(linkedIn.experience, defaults.linkedIn.experience),
      skills: stringOrDefault(linkedIn.skills, defaults.linkedIn.skills),
      education: stringOrDefault(linkedIn.education, defaults.linkedIn.education),
    },
    coverLetterText: stringOrDefault(value.coverLetterText, defaults.coverLetterText),
    otherDocumentTitle: stringOrDefault(value.otherDocumentTitle, defaults.otherDocumentTitle),
    otherDocumentText: stringOrDefault(value.otherDocumentText, defaults.otherDocumentText),
    savedAt: typeof value.savedAt === 'string' || value.savedAt === null ? value.savedAt : defaults.savedAt,
  };
}

async function preserveSnapshot(recoveryKey: string, raw: string, recoverable: boolean) {
  try {
    if (recoverable || await AsyncStorage.getItem(recoveryKey) === null) {
      await AsyncStorage.setItem(recoveryKey, JSON.stringify({ capturedAt: new Date().toISOString(), raw }));
    }
  } catch {
    // Best effort: storage may be unavailable or full.
  }
}

let storageOperationTail: Promise<void> = Promise.resolve();
let activeStoredStateRead: Promise<StoredState> | null = null;

function serializeStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageOperationTail.then(operation);
  storageOperationTail = result.then(() => undefined, () => undefined);
  return result;
}

function isStoredState(value: unknown): value is StoredState {
  return isRecord(value)
    && value.format === LOCAL_STORAGE_RECORD_FORMAT
    && value.version === LOCAL_STORAGE_RECORD_VERSION
    && isCareerState(value.career)
    && isWorkspaceState(value.workspace);
}

async function recoverStoredState(raw: string): Promise<StoredState | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await preserveSnapshot(STORE_RECOVERY_KEY, raw, false);
    return null;
  }

  if (!isRecord(parsed)
    || parsed.format !== LOCAL_STORAGE_RECORD_FORMAT
    || parsed.version !== LOCAL_STORAGE_RECORD_VERSION) {
    await preserveSnapshot(STORE_RECOVERY_KEY, raw, false);
    return null;
  }

  const career = recoverCareerState(parsed.career);
  const workspace = recoverWorkspaceState(parsed.workspace);
  if (!career || !workspace) {
    await preserveSnapshot(STORE_RECOVERY_KEY, raw, false);
    return null;
  }
  if (!isStoredState(parsed)) {
    const recoverable = hasSalvageableCareerData(parsed.career) || hasSalvageableWorkspaceData(parsed.workspace);
    await preserveSnapshot(STORE_RECOVERY_KEY, raw, recoverable);
  }
  return createLocalStorageRecord(career, workspace);
}

async function recoverLegacyCareer(raw: string | null): Promise<CareerState> {
  if (raw === null) return cloneInitialState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await preserveSnapshot(CAREER_RECOVERY_KEY, raw, false);
    return cloneInitialState();
  }

  const recovered = recoverCareerState(parsed);
  if (!recovered) {
    await preserveSnapshot(CAREER_RECOVERY_KEY, raw, false);
    return cloneInitialState();
  }
  if (!isCareerState(parsed)) await preserveSnapshot(CAREER_RECOVERY_KEY, raw, hasSalvageableCareerData(parsed));
  return recovered;
}

async function recoverLegacyWorkspace(raw: string | null): Promise<WorkspaceState> {
  if (raw === null) return cloneInitialWorkspaceState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await preserveSnapshot(WORKSPACE_RECOVERY_KEY, raw, false);
    return cloneInitialWorkspaceState();
  }

  const recovered = recoverWorkspaceState(parsed);
  if (!recovered) {
    await preserveSnapshot(WORKSPACE_RECOVERY_KEY, raw, false);
    return cloneInitialWorkspaceState();
  }
  if (!isWorkspaceState(parsed)) await preserveSnapshot(WORKSPACE_RECOVERY_KEY, raw, hasSalvageableWorkspaceData(parsed));
  return recovered;
}

function canRemoveLegacyCareer(raw: string | null): boolean {
  if (raw === null) return true;
  try {
    return isCareerState(JSON.parse(raw));
  } catch {
    return false;
  }
}

function canRemoveLegacyWorkspace(raw: string | null): boolean {
  if (raw === null) return true;
  try {
    return isWorkspaceState(JSON.parse(raw));
  } catch {
    return false;
  }
}

async function verifyStoredState(expectedRaw: string): Promise<void> {
  const savedRaw = await AsyncStorage.getItem(STORE_KEY);
  let savedValue: unknown;
  try {
    savedValue = savedRaw === null ? null : JSON.parse(savedRaw);
  } catch {
    savedValue = null;
  }
  if (savedRaw !== expectedRaw || !isStoredState(savedValue)) {
    throw new Error('The local data record could not be verified. Existing legacy data was kept for retry.');
  }
}

async function restoreAndVerifyStoredState(previousRaw: string | null): Promise<void> {
  if (previousRaw === null) await AsyncStorage.removeItem(STORE_KEY);
  else await AsyncStorage.setItem(STORE_KEY, previousRaw);

  if (await AsyncStorage.getItem(STORE_KEY) !== previousRaw) {
    throw new Error('Rollback readback did not match the previous local record.');
  }
}

async function writeAndVerifyStoredState(state: StoredState): Promise<void> {
  const previousRaw = await AsyncStorage.getItem(STORE_KEY);
  const raw = JSON.stringify(state);
  try {
    await AsyncStorage.setItem(STORE_KEY, raw);
    await verifyStoredState(raw);
  } catch (error) {
    try {
      await restoreAndVerifyStoredState(previousRaw);
    } catch {
      if (previousRaw !== null) await preserveSnapshot(STORE_RECOVERY_KEY, previousRaw, true);
      throw new Error('The local record write failed and rollback could not be verified. The prior raw record was preserved for recovery when possible; keep any manual backup and retry only after checking device storage.');
    }
    throw error;
  }
}

async function removeLegacyKeys(careerRaw: string | null, workspaceRaw: string | null): Promise<void> {
  if (careerRaw !== null) await AsyncStorage.removeItem(CAREER_KEY);
  if (workspaceRaw !== null) await AsyncStorage.removeItem(WORKSPACE_KEY);
}

async function loadStoredState(): Promise<StoredState> {
  const [storedRaw, legacyCareerRaw, legacyWorkspaceRaw] = await Promise.all([
    AsyncStorage.getItem(STORE_KEY),
    AsyncStorage.getItem(CAREER_KEY),
    AsyncStorage.getItem(WORKSPACE_KEY),
  ]);
  const legacyCanBeRemoved = canRemoveLegacyCareer(legacyCareerRaw) && canRemoveLegacyWorkspace(legacyWorkspaceRaw);

  if (storedRaw !== null) {
    const storedState = await recoverStoredState(storedRaw);
    if (storedState) {
      if ((legacyCareerRaw !== null || legacyWorkspaceRaw !== null) && legacyCanBeRemoved) {
        await verifyStoredState(storedRaw);
        await removeLegacyKeys(legacyCareerRaw, legacyWorkspaceRaw);
      }
      return storedState;
    }
  }

  const [career, workspace] = await Promise.all([
    recoverLegacyCareer(legacyCareerRaw),
    recoverLegacyWorkspace(legacyWorkspaceRaw),
  ]);
  const migratedState = createLocalStorageRecord(career, workspace);
  if (legacyCareerRaw === null && legacyWorkspaceRaw === null) return migratedState;

  await writeAndVerifyStoredState(migratedState);
  if (legacyCanBeRemoved) await removeLegacyKeys(legacyCareerRaw, legacyWorkspaceRaw);
  return migratedState;
}

function readStoredState(): Promise<StoredState> {
  if (activeStoredStateRead) return activeStoredStateRead;
  const request = serializeStorageOperation(loadStoredState);
  const sharedRequest = request.finally(() => {
    if (activeStoredStateRead === sharedRequest) activeStoredStateRead = null;
  });
  activeStoredStateRead = sharedRequest;
  return sharedRequest;
}

export async function loadState(): Promise<CareerState> {
  return (await readStoredState()).career;
}

export async function saveLocalState(career: CareerState, workspace: WorkspaceState): Promise<void> {
  await serializeStorageOperation(async () => {
    await loadStoredState();
    await writeAndVerifyStoredState(createLocalStorageRecord(career, workspace));
  });
}

export async function saveState(state: CareerState): Promise<void> {
  await serializeStorageOperation(async () => {
    const current = await loadStoredState();
    await writeAndVerifyStoredState(createLocalStorageRecord(state, current.workspace));
  });
}

export async function clearState(): Promise<CareerState> {
  return serializeStorageOperation(async () => {
    const current = await loadStoredState();
    await writeAndVerifyStoredState(createLocalStorageRecord(cloneInitialState(), current.workspace));
    try {
      await AsyncStorage.removeItem(CAREER_RECOVERY_KEY);
    } catch {
      // Best effort: the primary record is already verified.
    }
    return cloneInitialState();
  });
}

export async function loadWorkspaceState(): Promise<WorkspaceState> {
  return (await readStoredState()).workspace;
}

export async function saveWorkspaceState(state: WorkspaceState): Promise<void> {
  await serializeStorageOperation(async () => {
    const current = await loadStoredState();
    await writeAndVerifyStoredState(createLocalStorageRecord(current.career, state));
  });
}

export async function restoreLocalBackup(raw: string) {
  const backup = parseLocalBackup(raw);
  return serializeStorageOperation(async () => {
    const [legacyCareerRaw, legacyWorkspaceRaw] = await Promise.all([
      AsyncStorage.getItem(CAREER_KEY),
      AsyncStorage.getItem(WORKSPACE_KEY),
    ]);
    await replaceLocalBackupInStorage(AsyncStorage, backup, STORE_KEY);
    if (canRemoveLegacyCareer(legacyCareerRaw) && canRemoveLegacyWorkspace(legacyWorkspaceRaw)) {
      await removeLegacyKeys(legacyCareerRaw, legacyWorkspaceRaw);
    }
    return backup;
  });
}
