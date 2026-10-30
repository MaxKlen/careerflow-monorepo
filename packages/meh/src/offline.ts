import type { MehResponse, MehRequest } from './types.js';

const GUIDANCE: Record<string, string> = {
  '/welcome': 'Start by choosing whether you want to explore a direction or target a specific role. Both are reversible.',
  '/direction': 'Describe your goal in your own words. You can pause here and come back — nothing is final until you choose a next step.',
  '/home': "Check the \"Today's next step\" card. It is chosen from your own goals, not invented.",
  '/profile': 'Each section is editable. You can keep more than one version for different career directions.',
  '/evidence': 'Capture examples as context -> action -> result. A saved story is your own record; CareerFlow does not verify it.',
};

export function offlineGuidance(req: MehRequest): MehResponse {
  const body = GUIDANCE[req.screen] ?? 'I can help you navigate. Ask about your next step, or open the Help screen.';
  return { kind: 'navigation', body, sources: [], modeKind: 'offline' };
}
