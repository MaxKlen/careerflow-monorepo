export interface NextStepInput {
  goals: { id: string; title: string; status: string; targetDate: Date | null }[];
  applications: { id: string; stage: string; nextAction: string | null; dueDate: Date | null }[];
  direction: { summaryInOwnWords: string } | null;
  evidenceCount: number;
  profileVersionCount: number;
}
export interface NextStep {
  kind: 'direction' | 'goal' | 'application_followup' | 'evidence' | 'profile' | 'opportunity';
  title: string;
  reason: string;
  actionLabel: string;
  actionHref: string;
}

export function nextStep(input: NextStepInput): NextStep {
  if (!input.direction) return { kind: 'direction', title: 'Set your career direction', reason: 'Everything starts here. It takes about 5 minutes and can be paused.', actionLabel: 'Set direction', actionHref: '/direction/setup' };
  if (input.profileVersionCount === 0) return { kind: 'profile', title: 'Create your first profile version', reason: "You'll need this before drafting any application material.", actionLabel: 'Create profile', actionHref: '/profile/new' };
  const soon = Date.now() + 3 * 24 * 60 * 60 * 1000;
  const upcoming = input.applications.filter(a => a.dueDate && a.dueDate.getTime() < soon && a.stage !== 'closed').sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];
  if (upcoming) return { kind: 'application_followup', title: 'Follow up on an application', reason: `Due ${upcoming.dueDate!.toLocaleDateString()}.`, actionLabel: 'Open application', actionHref: `/applications/${upcoming.id}` };
  if (input.evidenceCount === 0) return { kind: 'evidence', title: 'Add your first evidence story', reason: 'Evidence makes application materials traceable to your real work.', actionLabel: 'Add evidence', actionHref: '/evidence/new' };
  const active = input.goals.find(g => g.status === 'active');
  if (active) return { kind: 'goal', title: active.title, reason: 'An active goal you chose.', actionLabel: 'Open goals', actionHref: '/direction' };
  return { kind: 'opportunity', title: 'Find one opportunity to consider', reason: 'Browsing with a clear goal is more useful than browsing broadly.', actionLabel: 'Browse opportunities', actionHref: '/opportunities' };
}
