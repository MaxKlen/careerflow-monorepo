export interface Suggestion { id: string; kind: 'clarity' | 'length' | 'structure' | 'verb'; message: string; original: string; proposed: string; }
export type LinkedInSection = 'headline' | 'about' | 'experience' | 'skills' | 'featured';

export function analyzeLinkedIn(section: LinkedInSection, text: string): Suggestion[] {
  const out: Suggestion[] = [];
  const t = text.trim();
  if (section === 'headline') {
    if (t.length < 30) out.push({ id: 'headline-short', kind: 'length', message: 'Headline is short. Up to 120 characters is available.', original: t, proposed: t });
    if (!/(engineer|manager|designer|analyst|developer|specialist|director|consultant|lead|architect|scientist)/i.test(t))
      out.push({ id: 'headline-role', kind: 'clarity', message: 'Consider naming a role and domain so a visitor understands what you do in one read.', original: t, proposed: t });
  }
  if (section === 'about') {
    if (t.length < 150) out.push({ id: 'about-short', kind: 'length', message: 'The About section has room to tell a story. Three to five sentences of context → action → result reads well.', original: t, proposed: t });
    if (t.length > 400 && !/\n\n/.test(t)) out.push({ id: 'about-paragraphs', kind: 'structure', message: 'Long single block. Split into two or three paragraphs for scanability.', original: t, proposed: t });
  }
  if (section === 'experience') {
    let n = 0;
    for (const line of t.split(/\n/)) if (/^\s*responsible for\b/i.test(line))
      out.push({ id: `exp-verb-${n++}`, kind: 'verb', message: '"Responsible for" is passive. Try a stronger verb.', original: line, proposed: line.replace(/^\s*responsible for/i, 'Led') });
  }
  if (section === 'skills') {
    const items = t.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    if (items.length > 30) out.push({ id: 'skills-too-many', kind: 'clarity', message: 'Over 30 skills dilutes focus. Keep the 15–20 most relevant.', original: t, proposed: t });
    if (new Set(items.map(i => i.toLowerCase())).size !== items.length)
      out.push({ id: 'skills-duplicates', kind: 'clarity', message: 'Some skills appear more than once.', original: t, proposed: t });
  }
  return out;
}
