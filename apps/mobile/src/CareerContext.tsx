import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ApplicationMaterialsDraft,
  ApplicationRecord,
  CareerState,
  EvidenceRecord,
  FollowUpEvent,
  MembershipTier,
  Profile,
  Task,
  WorkspaceState,
  initialState,
  initialWorkspaceState,
  journeyProgress,
} from './domain';
import type { ApplicationDraft } from './application';
import {
  addFollowUpHistoryEvent,
  removeFollowUpHistoryEvent,
  updateFollowUpHistoryEvent,
} from './application';
import type { EvidenceDraft } from './evidence';
import type {
  CandidateOpportunityInput,
  CandidateOpportunityMutation,
} from './opportunities';
import {
  createCandidateOpportunity,
  removeCandidateOpportunity as removeOpportunityRecord,
  updateCandidateOpportunity as updateOpportunityRecord,
} from './opportunities';
import {
  MAX_EVIDENCE_LINKS_PER_REQUIREMENT,
  normalizeRequirementPhrase,
  retainRequirementEvidenceLinks,
} from './requirementCoverage';
import { loadState, loadWorkspaceState, saveLocalState } from './storage';
import { createLocalSaveCoordinator } from './careerSaveStatus';
import type {
  CareerSaveStatus,
  LocalSaveCoordinator,
} from './careerSaveStatus';
import {
  apiConfigured,
  applications as fetchApplications,
  createApplication as createRemoteApplication,
  createProfileVersion,
  currentUser,
  profileVersions,
  signIn as signInApi,
  signOut as signOutApi,
  signUp as signUpApi,
  updateApplicationStage,
  updateSettings,
  workspaces as fetchWorkspaces,
} from './api';
import type { ApiUser } from './api';

type EvidenceLinkResult =
  | 'linked'
  | 'missing-application'
  | 'missing-requirement'
  | 'missing-evidence'
  | 'duplicate'
  | 'limit';
type FollowUpResult =
  | 'added'
  | 'updated'
  | 'missing-application'
  | 'missing-event'
  | 'limit'
  | 'invalid';

type CareerContextValue = {
  ready: boolean;
  loadFailed: boolean;
  retryLoad: () => Promise<boolean>;
  state: CareerState;
  workspace: WorkspaceState;
  careerSaveStatus: CareerSaveStatus;
  retryCareerSave: () => Promise<boolean>;
  progress: number;
  updateProfile: (key: keyof Profile, value: string) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  addTask: (title: string) => void;
  addApplication: (draft: ApplicationDraft) => void;
  addOpportunity: (
    input: CandidateOpportunityInput,
  ) => CandidateOpportunityMutation;
  updateOpportunity: (
    id: string,
    input: CandidateOpportunityInput,
  ) => CandidateOpportunityMutation;
  removeOpportunity: (id: string) => void;
  updateApplication: (id: string, draft: ApplicationDraft) => void;
  saveApplicationMaterialsDraft: (
    id: string,
    draft: ApplicationMaterialsDraft,
  ) => void;
  removeApplication: (id: string) => void;
  addFollowUpEvent: (
    applicationId: string,
    event: FollowUpEvent,
  ) => FollowUpResult;
  updateFollowUpEvent: (
    applicationId: string,
    event: FollowUpEvent,
  ) => FollowUpResult;
  removeFollowUpEvent: (
    applicationId: string,
    eventId: string,
  ) => FollowUpResult;
  linkEvidenceToRequirement: (
    applicationId: string,
    requirement: string,
    evidenceId: string,
  ) => EvidenceLinkResult;
  unlinkEvidenceFromRequirement: (
    applicationId: string,
    requirement: string,
    evidenceId: string,
  ) => void;
  addEvidence: (draft: EvidenceDraft) => void;
  updateEvidence: (id: string, draft: EvidenceDraft) => void;
  removeEvidence: (id: string) => void;
  toggleMilestone: (id: string) => void;
  updateWorkspace: (patch: Partial<WorkspaceState>) => void;
  replaceLocalData: (career: CareerState, workspace: WorkspaceState) => void;
  setDemoAccount: (displayName: string, tier?: MembershipTier) => void;
  clearDemoSession: () => void;
  authenticatedUser: ApiUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const CareerContext = createContext<CareerContextValue | null>(null);

export function CareerProvider({ children }: { children: ReactNode }) {
  const [state, setStateValue] = useState<CareerState>(initialState);
  const [workspace, setWorkspaceValue] = useState<WorkspaceState>(
    initialWorkspaceState,
  );
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const hydrationGenerationRef = useRef(0);
  const [careerSaveStatus, setCareerSaveStatus] =
    useState<CareerSaveStatus>('saved');
  const [authenticatedUser, setAuthenticatedUser] = useState<ApiUser | null>(
    null,
  );
  const [remoteWorkspaceId, setRemoteWorkspaceId] = useState<string | null>(
    null,
  );
  const saveCoordinatorRef = useRef<LocalSaveCoordinator<
    CareerState,
    WorkspaceState
  > | null>(null);
  if (!saveCoordinatorRef.current) {
    // createLocalSaveCoordinator(saveLocalState, setCareerSaveStatus)
    saveCoordinatorRef.current = createLocalSaveCoordinator(
      saveLocalState,
      setCareerSaveStatus,
    );
  }
  const saveCoordinator = saveCoordinatorRef.current;

  const setState = (nextState: React.SetStateAction<CareerState>) => {
    saveCoordinator.markPending();
    setStateValue(nextState);
  };
  const setWorkspace = (
    nextWorkspace: React.SetStateAction<WorkspaceState>,
  ) => {
    saveCoordinator.markPending();
    setWorkspaceValue(nextWorkspace);
  };

  const hydrateLocalState = useCallback(async () => {
    const request = ++hydrationGenerationRef.current;
    setLoadFailed(false);
    try {
      const [career, localWorkspace] = await Promise.all([
        loadState(),
        loadWorkspaceState(),
      ]);
      if (request !== hydrationGenerationRef.current) return false;
      setStateValue(career);
      setWorkspaceValue(localWorkspace);
      if (apiConfigured()) {
        const user = await currentUser();
        setAuthenticatedUser(user);
        if (user) {
          try {
            const ownedWorkspaces = await fetchWorkspaces();
            const workspaceId = ownedWorkspaces[0]?.id;
            if (workspaceId) {
              setRemoteWorkspaceId(workspaceId);
              const [remoteVersions, remoteApplications] = await Promise.all([
                profileVersions(workspaceId),
                fetchApplications(workspaceId),
              ]);
              const latest = remoteVersions[0];
              const roles =
                latest && Array.isArray(latest.targetRoles)
                  ? latest.targetRoles.map(String)
                  : [];
              const stageMap: Record<string, ApplicationRecord['status']> = {
                considering: 'considering',
                preparing: 'preparing',
                applied: 'applied',
                interviewing: 'interviewing',
                offer: 'offer',
                closed: 'closed',
              };
              setStateValue((current) => ({
                ...current,
                profile: latest
                  ? {
                      ...current.profile,
                      name: user.displayName ?? current.profile.name,
                      headline: latest.headline ?? '',
                      summary: latest.summary ?? '',
                      targetRole: roles[0] ?? '',
                    }
                  : {
                      ...current.profile,
                      name: user.displayName ?? current.profile.name,
                    },
                applications: remoteApplications.map((item) => ({
                  id: item.id,
                  organization: 'CareerFlow workspace',
                  role: 'Application',
                  status: stageMap[item.stage] ?? 'considering',
                  nextStep: '',
                  createdAt: item.createdAt,
                  updatedAt: item.updatedAt,
                })),
              }));
            }
            setWorkspaceValue((current) => ({
              ...current,
              account: {
                ...current.account,
                demoActive: false,
                displayName: user.displayName ?? user.email,
              },
            }));
          } catch {
            // Local state remains usable when the API is temporarily unavailable.
          }
        }
      }
      setReady(true);
      return true;
    } catch {
      if (request === hydrationGenerationRef.current) setLoadFailed(true);
      return false;
    }
  }, []);

  useEffect(() => {
    void hydrateLocalState();
    return () => {
      hydrationGenerationRef.current += 1;
    };
  }, [hydrateLocalState]);

  const persistLocalState = useCallback(
    (career: CareerState, localWorkspace: WorkspaceState) =>
      saveCoordinator.persist(career, localWorkspace),
    [saveCoordinator],
  );

  useEffect(() => {
    if (ready) void persistLocalState(state, workspace);
  }, [state, workspace, ready, persistLocalState]);

  const retryCareerSave = useCallback(
    () => persistLocalState(state, workspace),
    [persistLocalState, state, workspace],
  );

  const updateProfile = (key: keyof Profile, value: string) => {
    setState((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));
    if (authenticatedUser && key === 'name')
      void updateSettings({ displayName: value });
    if (
      authenticatedUser &&
      remoteWorkspaceId &&
      (key === 'headline' || key === 'summary' || key === 'targetRole')
    ) {
      const next = { ...state.profile, [key]: value };
      void createProfileVersion(remoteWorkspaceId, {
        label: 'Mobile profile',
        headline: next.headline,
        summary: next.summary,
        targetRoles: next.targetRole ? [next.targetRole] : [],
      }).catch(() => undefined);
    }
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id
          ? { ...task, ...patch, updatedAt: new Date().toISOString() }
          : task,
      ),
    }));
  };

  const addTask = (title: string) => {
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) return;
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          id: `task-${Date.now()}`,
          title: cleanTitle,
          status: 'todo',
          priority: 'medium',
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
  };

  const addApplication = (draft: ApplicationDraft) => {
    const now = new Date().toISOString();
    const record: ApplicationRecord = {
      id: `application-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...draft,
      requirements: [...(draft.requirements ?? [])],
      requirementEvidenceLinks: [],
      createdAt: now,
      updatedAt: now,
    };
    setState((current) => ({
      ...current,
      applications: [...current.applications, record],
    }));
    if (authenticatedUser && remoteWorkspaceId) {
      void createRemoteApplication(remoteWorkspaceId).catch(() => undefined);
    }
  };

  const addOpportunity = (input: CandidateOpportunityInput) => {
    const now = new Date().toISOString();
    const result = createCandidateOpportunity(
      input,
      state.opportunities,
      `opportunity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      now,
    );
    if (result.ok) {
      setState((current) => ({
        ...current,
        opportunities: [...current.opportunities, result.opportunity],
      }));
    }
    return result;
  };

  const updateOpportunity = (id: string, input: CandidateOpportunityInput) => {
    const existing = state.opportunities.find((item) => item.id === id);
    if (!existing)
      return {
        ok: false as const,
        errors: {
          form: 'This local opportunity is no longer available. Reopen the list and try again.',
        },
      };
    const previousUpdatedAt = Date.parse(existing.updatedAt);
    const updatedAt = new Date(
      Math.max(
        Date.now(),
        Number.isNaN(previousUpdatedAt) ? Date.now() : previousUpdatedAt + 1,
      ),
    ).toISOString();
    const result = updateOpportunityRecord(
      existing,
      input,
      state.opportunities,
      updatedAt,
    );
    if (result.ok) {
      setState((current) => ({
        ...current,
        opportunities: current.opportunities.map((item) =>
          item.id === id ? result.opportunity : item,
        ),
      }));
    }
    return result;
  };

  const removeOpportunity = (id: string) => {
    setState((current) => ({
      ...current,
      opportunities: removeOpportunityRecord(current.opportunities, id),
    }));
  };

  const updateApplication = (id: string, draft: ApplicationDraft) => {
    setState((current) => ({
      ...current,
      applications: current.applications.map((item) =>
        item.id === id
          ? {
              ...item,
              ...draft,
              requirements: [
                ...(draft.requirements ?? item.requirements ?? []),
              ],
              requirementEvidenceLinks: retainRequirementEvidenceLinks(
                draft.requirements ?? item.requirements ?? [],
                item.requirementEvidenceLinks,
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
    if (authenticatedUser)
      void updateApplicationStage(id, draft.status).catch(() => undefined);
  };

  const saveApplicationMaterialsDraft = (
    id: string,
    draft: ApplicationMaterialsDraft,
  ) => {
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      applications: current.applications.map((item) =>
        item.id === id
          ? {
              ...item,
              materialsDraft: {
                ...draft,
                sources: draft.sources.map((source) => ({
                  ...source,
                  snapshot: {
                    ...source.snapshot,
                    skillTags: [...source.snapshot.skillTags],
                  },
                })),
                updatedAt: now,
              },
              updatedAt: now,
            }
          : item,
      ),
    }));
  };

  const removeApplication = (id: string) => {
    setState((current) => ({
      ...current,
      applications: current.applications.filter((item) => item.id !== id),
    }));
  };

  const changeFollowUp = (
    applicationId: string,
    event: FollowUpEvent,
    mode: 'add' | 'update',
  ): FollowUpResult => {
    const application = state.applications.find(
      (item) => item.id === applicationId,
    );
    if (!application) return 'missing-application';
    const history = application.followUpHistory ?? [];
    const mutation =
      mode === 'add'
        ? addFollowUpHistoryEvent(history, event)
        : updateFollowUpHistoryEvent(history, event);
    if (!mutation.ok) {
      if (mutation.reason === 'limit') return 'limit';
      if (mutation.reason === 'missing') return 'missing-event';
      return 'invalid';
    }
    setState((current) => ({
      ...current,
      applications: current.applications.map((item) =>
        item.id === applicationId
          ? {
              ...item,
              followUpHistory: mutation.history,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
    return mode === 'add' ? 'added' : 'updated';
  };

  const addFollowUpEvent = (applicationId: string, event: FollowUpEvent) =>
    changeFollowUp(applicationId, event, 'add');
  const updateFollowUpEvent = (applicationId: string, event: FollowUpEvent) =>
    changeFollowUp(applicationId, event, 'update');
  const removeFollowUpEvent = (
    applicationId: string,
    eventId: string,
  ): FollowUpResult => {
    const application = state.applications.find(
      (item) => item.id === applicationId,
    );
    if (!application) return 'missing-application';
    const mutation = removeFollowUpHistoryEvent(
      application.followUpHistory ?? [],
      eventId,
    );
    if (!mutation.ok)
      return mutation.reason === 'missing' ? 'missing-event' : 'invalid';
    setState((current) => ({
      ...current,
      applications: current.applications.map((item) =>
        item.id === applicationId
          ? {
              ...item,
              followUpHistory: mutation.history,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
    return 'updated';
  };

  const linkEvidenceToRequirement = (
    applicationId: string,
    requirement: string,
    evidenceId: string,
  ): EvidenceLinkResult => {
    const application = state.applications.find(
      (item) => item.id === applicationId,
    );
    if (!application) return 'missing-application';
    const normalizedRequirement = normalizeRequirementPhrase(requirement);
    const currentRequirement = application.requirements?.find(
      (item) => normalizeRequirementPhrase(item) === normalizedRequirement,
    );
    if (!currentRequirement) return 'missing-requirement';
    const evidence = state.evidenceItems.find((item) => item.id === evidenceId);
    if (!evidence) return 'missing-evidence';
    const currentLinks = application.requirementEvidenceLinks ?? [];
    const requirementLinks = currentLinks.filter(
      (link) =>
        normalizeRequirementPhrase(link.requirement) === normalizedRequirement,
    );
    if (requirementLinks.some((link) => link.evidenceId === evidenceId))
      return 'duplicate';
    if (requirementLinks.length >= MAX_EVIDENCE_LINKS_PER_REQUIREMENT)
      return 'limit';
    const now = new Date().toISOString();
    const link = {
      requirement: currentRequirement,
      evidenceId,
      linkedAt: now,
      snapshot: {
        title: evidence.title,
        context: evidence.context,
        action: evidence.action,
        result: evidence.result,
        skillTags: [...evidence.skillTags],
        updatedAt: evidence.updatedAt,
      },
    };
    setState((current) => ({
      ...current,
      applications: current.applications.map((item) =>
        item.id === applicationId
          ? {
              ...item,
              requirementEvidenceLinks: [
                ...(item.requirementEvidenceLinks ?? []),
                link,
              ],
              updatedAt: now,
            }
          : item,
      ),
    }));
    return 'linked';
  };

  const unlinkEvidenceFromRequirement = (
    applicationId: string,
    requirement: string,
    evidenceId: string,
  ) => {
    const normalizedRequirement = normalizeRequirementPhrase(requirement);
    setState((current) => ({
      ...current,
      applications: current.applications.map((item) =>
        item.id === applicationId
          ? {
              ...item,
              requirementEvidenceLinks: (
                item.requirementEvidenceLinks ?? []
              ).filter(
                (link) =>
                  normalizeRequirementPhrase(link.requirement) !==
                    normalizedRequirement || link.evidenceId !== evidenceId,
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
  };

  const addEvidence = (draft: EvidenceDraft) => {
    const now = new Date().toISOString();
    const record: EvidenceRecord = {
      id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...draft,
      skillTags: [...draft.skillTags],
      createdAt: now,
      updatedAt: now,
    };
    setState((current) => ({
      ...current,
      evidenceItems: [...current.evidenceItems, record],
    }));
  };

  const updateEvidence = (id: string, draft: EvidenceDraft) => {
    setState((current) => ({
      ...current,
      evidenceItems: current.evidenceItems.map((item) =>
        item.id === id
          ? {
              ...item,
              ...draft,
              skillTags: [...draft.skillTags],
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
  };

  const removeEvidence = (id: string) => {
    setState((current) => ({
      ...current,
      evidenceItems: current.evidenceItems.filter((item) => item.id !== id),
    }));
  };

  const toggleMilestone = (id: string) => {
    setState((current) => ({
      ...current,
      milestones: current.milestones.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    }));
  };

  const updateWorkspace = (patch: Partial<WorkspaceState>) => {
    setWorkspace((current) => ({
      ...current,
      ...patch,
      savedAt: new Date().toISOString(),
    }));
  };

  const replaceLocalData = (
    career: CareerState,
    localWorkspace: WorkspaceState,
  ) => {
    setState(career);
    setWorkspace(localWorkspace);
  };

  const setDemoAccount = (
    displayName: string,
    tier: MembershipTier = 'Starter',
  ) => {
    updateWorkspace({
      account: {
        demoActive: true,
        displayName: displayName.trim() || 'Sample member',
        tier,
      },
    });
  };

  const clearDemoSession = () => {
    updateWorkspace({
      account: { demoActive: false, displayName: '', tier: 'Starter' },
    });
  };
  const signIn = async (email: string, password: string) => {
    const user = await signInApi(email, password);
    setAuthenticatedUser(user);
    await hydrateLocalState();
  };
  const signUp = async (
    email: string,
    password: string,
    displayName: string,
  ) => {
    const user = await signUpApi(email, password, displayName);
    setAuthenticatedUser(user);
    await hydrateLocalState();
  };
  const signOut = async () => {
    await signOutApi();
    setAuthenticatedUser(null);
    await hydrateLocalState();
  };

  const value: CareerContextValue = {
    ready,
    loadFailed,
    retryLoad: hydrateLocalState,
    state,
    workspace,
    careerSaveStatus,
    retryCareerSave,
    progress: journeyProgress(state),
    updateProfile,
    updateTask,
    addTask,
    addApplication,
    addOpportunity,
    updateOpportunity,
    removeOpportunity,
    updateApplication,
    saveApplicationMaterialsDraft,
    removeApplication,
    addFollowUpEvent,
    updateFollowUpEvent,
    removeFollowUpEvent,
    linkEvidenceToRequirement,
    unlinkEvidenceFromRequirement,
    addEvidence,
    updateEvidence,
    removeEvidence,
    toggleMilestone,
    updateWorkspace,
    replaceLocalData,
    setDemoAccount,
    clearDemoSession,
    authenticatedUser,
    signIn,
    signUp,
    signOut,
  };

  return (
    <CareerContext.Provider value={value}>{children}</CareerContext.Provider>
  );
}

export function useCareer() {
  const value = useContext(CareerContext);
  if (!value) throw new Error('useCareer must be used inside CareerProvider');
  return value;
}
