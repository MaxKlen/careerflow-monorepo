import type { InterviewQuestion } from '@careerflow/shared';

const COMMON: InterviewQuestion[] = [
  { id: 'beh-1', category: 'behavioral', text: 'Tell me about a time you had to influence without authority. What was the outcome?' },
  { id: 'beh-2', category: 'behavioral', text: 'Describe a project that failed or missed its goals. What did you learn?' },
  { id: 'beh-3', category: 'behavioral', text: 'Tell me about the most complex problem you have solved end to end.' },
  { id: 'beh-4', category: 'behavioral', text: 'Give an example of a time you disagreed with a decision. How did you handle it?' },
  { id: 'sit-1', category: 'situational', text: 'Two stakeholders each need something urgent and both are right. How would you decide what to do first?' },
  { id: 'sit-2', category: 'situational', text: 'You inherit a team with low morale and unclear priorities. What would you do in your first 30 days?' },
  { id: 'q-1', category: 'candidate_questions', text: 'What does success look like in this role in the first six months?' },
  { id: 'q-2', category: 'candidate_questions', text: 'How does this team decide what to work on when priorities conflict?' },
];

const BY_KEYWORD: { re: RegExp; qs: InterviewQuestion[] }[] = [
  {
    re: /(product\s+manager|\bpm\b|product\s+lead)/i,
    qs: [
      { id: 'pm-1', category: 'role', text: 'Walk me through how you prioritize a backlog when everything is "P0".' },
      { id: 'pm-2', category: 'role', text: 'Tell me about a product decision you regret. What would you do differently?' },
      { id: 'pm-3', category: 'role', text: 'How do you measure success for a feature after launch?' },
    ],
  },
  {
    re: /(engineer|developer|swe|sre|devops|backend|frontend)/i,
    qs: [
      { id: 'eng-1', category: 'role', text: 'Describe a system you designed. What trade-offs did you make and why?' },
      { id: 'eng-2', category: 'role', text: 'Tell me about the hardest bug you have debugged. Walk me through your process.' },
      { id: 'eng-3', category: 'role', text: 'How do you decide between adding a dependency and writing it yourself?' },
    ],
  },
  {
    re: /(designer|ux|ui)/i,
    qs: [
      { id: 'des-1', category: 'role', text: 'Walk me through a design you are proud of and one you would redo.' },
      { id: 'des-2', category: 'role', text: 'How do you incorporate user research into a shipping decision?' },
    ],
  },
  {
    re: /(analyst|data|analytics)/i,
    qs: [
      { id: 'an-1', category: 'role', text: 'Describe an analysis that changed a business decision.' },
      { id: 'an-2', category: 'role', text: 'How do you communicate uncertainty in your findings?' },
    ],
  },
];

export function questionsForRole(roleTitle: string): InterviewQuestion[] {
  const out = [...COMMON];
  for (const { re, qs } of BY_KEYWORD) if (re.test(roleTitle)) out.push(...qs);
  return out;
}
