export type TaskStatus = 'backlog' | 'todo' | 'inProgress' | 'waiting' | 'completed';
export type Priority = 'low' | 'medium' | 'high';
export type Screen = 'home' | 'tasks' | 'profile' | 'milestones' | 'coach';
export type Task = {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
};
export type Project = { id: string; name: string; description: string; completed: boolean };
export type Profile = {
  name: string;
  headline: string;
  targetRole: string;
  targetIndustry: string;
  summary: string;
  skills: string;
  goals: string;
};
export type Milestone = { id: string; name: string; completed: boolean };
export type ApplicationStatus = 'considering' | 'preparing' | 'applied' | 'interviewing' | 'offer' | 'closed';
export type FollowUpEventType = 'email' | 'phone' | 'interview' | 'message' | 'other';
export type FollowUpEvent = { id: string; date: string; type: FollowUpEventType; note: string; createdAt: string };
export type RequirementEvidenceSnapshot = { title: string; context: string; action: string; result: string; skillTags: string[]; updatedAt: string };
export type RequirementEvidenceLink = { requirement: string; evidenceId: string; linkedAt: string; snapshot: RequirementEvidenceSnapshot };
export type ApplicationMaterialsDraft = { body: string; sources: RequirementEvidenceLink[]; createdAt: string; updatedAt: string };
export type ApplicationRecord = {
  id: string;
  organization: string;
  role: string;
  status: ApplicationStatus;
  appliedOn?: string;
  nextStep: string;
  nextStepDueDate?: string;
  requirements?: string[];
  requirementEvidenceLinks?: RequirementEvidenceLink[];
  materialsDraft?: ApplicationMaterialsDraft;
  followUpHistory?: FollowUpEvent[];
  createdAt: string;
  updatedAt: string;
};
export type CandidateOpportunity = {
  id: string;
  company: string;
  role: string;
  location: string;
  type: string;
  summary: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
};
export type EvidenceRecord = { id: string; title: string; context: string; action: string; result: string; skillTags: string[]; createdAt: string; updatedAt: string };
export type CareerState = { version: 1; tasks: Task[]; projects: Project[]; profile: Profile; milestones: Milestone[]; applications: ApplicationRecord[]; evidenceItems: EvidenceRecord[]; opportunities: CandidateOpportunity[] };

export type MembershipTier = 'Starter' | 'Plus' | 'Pro';
export type LinkedInSections = {
  headline: string;
  about: string;
  experience: string;
  skills: string;
  education: string;
};
export type WorkspaceState = {
  version: 1;
  account: { demoActive: boolean; displayName: string; tier: MembershipTier };
  cvText: string;
  cvFileName: string;
  linkedIn: LinkedInSections;
  coverLetterText: string;
  otherDocumentTitle: string;
  otherDocumentText: string;
  savedAt: string | null;
};

export const DEFAULT_MILESTONES: Milestone[] = [
  { id: 'profile', name: 'Career Profile Ready', completed: false },
  { id: 'resume', name: 'Resume Complete', completed: false },
  { id: 'portfolio', name: 'Portfolio Complete', completed: false },
  { id: 'application', name: 'First Application Submitted', completed: false },
  { id: 'networking', name: 'Networking Started', completed: false },
  { id: 'interview', name: 'First Interview Scheduled', completed: false },
  { id: 'process', name: 'Interview Process Complete', completed: false },
  { id: 'offer', name: 'Offer Received', completed: false },
  { id: 'accepted', name: 'Contract Accepted', completed: false },
  { id: 'signed', name: 'Contract Signed', completed: false },
];

export const initialState: CareerState = {
  version: 1,
  projects: [
    { id: 'resume', name: 'Resume Optimization', description: 'Make the next application easier to say yes to.', completed: false },
    { id: 'network', name: 'Warm Networking', description: 'Build a small, thoughtful network.', completed: false },
  ],
  tasks: [
    { id: 'resume-task', title: 'Update resume headline', notes: 'Align the first three lines with the target role.', status: 'inProgress', priority: 'high', dueDate: '2026-11-02', projectId: 'resume', createdAt: '2026-10-20', updatedAt: '2026-10-24' },
    { id: 'network-task', title: 'Send one thoughtful networking note', notes: 'Ask for perspective, not a referral.', status: 'todo', priority: 'medium', projectId: 'network', createdAt: '2026-10-20', updatedAt: '2026-10-24' },
    { id: 'portfolio-task', title: 'Choose three portfolio examples', notes: 'Prefer outcomes and evidence over a long list.', status: 'backlog', priority: 'medium', createdAt: '2026-10-20', updatedAt: '2026-10-24' },
  ],
  profile: { name: '', headline: '', targetRole: '', targetIndustry: '', summary: '', skills: '', goals: '' },
  milestones: DEFAULT_MILESTONES,
  applications: [],
  evidenceItems: [],
  opportunities: [],
};

export const initialWorkspaceState: WorkspaceState = {
  version: 1,
  account: { demoActive: false, displayName: '', tier: 'Starter' },
  cvText: '',
  cvFileName: '',
  linkedIn: { headline: '', about: '', experience: '', skills: '', education: '' },
  coverLetterText: '',
  otherDocumentTitle: '',
  otherDocumentText: '',
  savedAt: null,
};

export function journeyProgress(state: CareerState) {
  const taskTotal = state.tasks.length;
  const completedTasks = state.tasks.filter((task) => task.status === 'completed').length;
  const completedMilestones = state.milestones.filter((milestone) => milestone.completed).length;
  return Math.round(((completedTasks / (taskTotal || 1)) + (completedMilestones / state.milestones.length)) / 2 * 100);
}

export function taskStatusLabel(status: TaskStatus) {
  return { backlog: 'Backlog', todo: 'To do', inProgress: 'In progress', waiting: 'Waiting', completed: 'Completed' }[status];
}
