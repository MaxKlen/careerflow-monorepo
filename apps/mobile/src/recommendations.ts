export type WritingSection = 'headline' | 'summary' | 'skills' | 'goals' | 'cv' | 'linkedinHeadline' | 'linkedinAbout' | 'experience' | 'education' | 'coverLetter' | 'other';

/** Deterministic suggestions only: no model, network request, or external service is used. */
export function getRecommendations(section: WritingSection, value: string): string[] {
  const text = value.trim();
  if (!text) {
    const emptyHints: Record<WritingSection, string> = {
      headline: 'Add a focused headline naming your role or specialty.',
      summary: 'Add a short professional summary with your experience and direction.',
      skills: 'List a small set of relevant skills, grouped by theme.',
      goals: 'State the role or outcome you are working toward.',
      cv: 'Add or import CV text to receive an offline checklist.',
      linkedinHeadline: 'Add a headline that says what you do and the value you bring.',
      linkedinAbout: 'Write a short About section with your focus, strengths, and next goal.',
      experience: 'Describe a role, what you did, and the result.',
      education: 'Add relevant education, training, or credentials.',
      coverLetter: 'Add a role-specific opening, evidence, and a clear close.',
      other: 'Add a title and text to save or export this document.',
    };
    return [emptyHints[section]];
  }

  const notes: string[] = [];
  const hasMeasure = /\b\d+([.,]\d+)?\s?(%|x|k|m|million|thousand)?\b/i.test(text) || /\$|€|£/.test(text);
  const lower = text.toLowerCase();

  if (['headline', 'linkedinHeadline'].includes(section) && text.length > 180) {
    notes.push('Shorten the headline so the role and strongest value are visible at a glance.');
  }
  if (['summary', 'linkedinAbout'].includes(section) && text.length < 140) {
    notes.push('Add one or two concrete examples of your work, then name the kind of opportunity you want.');
  }
  if (['summary', 'linkedinAbout', 'experience', 'cv', 'coverLetter'].includes(section) && !hasMeasure) {
    notes.push('Where accurate, add a measurable result such as time saved, revenue, quality, reach, or delivery speed.');
  }
  if (['experience', 'cv'].includes(section) && !/\b(led|built|launched|improved|created|managed|designed|delivered|reduced|increased|supported|analyzed|analysed)\b/i.test(text)) {
    notes.push('Start experience bullets with specific action verbs and describe your contribution.');
  }
  if (section === 'skills' && text.split(/[,\n;]/).filter(Boolean).length > 18) {
    notes.push('Prioritize the most relevant skills instead of listing everything in one block.');
  }
  if (section === 'goals' && text.length < 40) {
    notes.push('Make the goal more actionable by naming a role, industry, or next milestone.');
  }
  if (section === 'coverLetter') {
    if (!/dear|hello|hiring team/i.test(lower)) notes.push('Consider a brief, role-specific opening addressed to the hiring team.');
    if (!/thank|sincerely|regards|best/i.test(lower)) notes.push('Add a courteous closing and a simple next step.');
  }
  if (section === 'education' && !/\b(20\d\d|19\d\d|certif|degree|diploma|course|training)\b/i.test(text)) {
    notes.push('Include relevant credentials, training, or dates only when they strengthen the application.');
  }
  if (notes.length === 0) notes.push('Good starting point. Check that the wording is accurate, specific, and tailored to the role.');
  return notes.slice(0, 3);
}
