import type { ParsedSection, SectionKey } from '@careerflow/shared';

const HEADERS: { key: SectionKey; re: RegExp }[] = [
  { key: 'contact', re: /^(contact|personal details|personal information)\s*$/i },
  { key: 'summary', re: /^(summary|profile|about|objective|professional summary)\s*$/i },
  { key: 'experience', re: /^(experience|work experience|employment|professional experience|employment history)\s*$/i },
  { key: 'education', re: /^(education|academic background|academic)\s*$/i },
  { key: 'skills', re: /^(skills|expertise|competencies|core skills|technical skills)\s*$/i },
  { key: 'certifications', re: /^(certifications?|licenses?|certifications? (and|&) licenses?)\s*$/i },
  { key: 'projects', re: /^(projects?|portfolio|selected projects)\s*$/i },
  { key: 'languages', re: /^(languages?)\s*$/i },
  { key: 'references', re: /^(references?)\s*$/i },
];

export function parseCv(text: string): ParsedSection[] {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd());
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  const preamble: string[] = [];
  for (const line of lines) {
    const h = HEADERS.find(h => h.re.test(line.trim()));
    if (h) { if (current) sections.push(current); current = { key: h.key, heading: line.trim(), rawText: '', lines: [] }; }
    else if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) sections.push(current);
  if (sections.length === 0 && preamble.filter(Boolean).length)
    sections.push({ key: 'other', heading: 'Imported text', rawText: preamble.join('\n').trim(), lines: preamble });
  for (const s of sections) s.rawText = s.lines.join('\n').trim();
  return sections;
}
