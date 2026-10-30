export interface EvidenceSnippet { id: string; title: string; text: string; skills: string[]; }

// Returns text cues, not a confidence or qualification score.
export function findPhraseMatches(requirementText: string, evidence: EvidenceSnippet[]): { evidenceId: string; phrase: string }[] {
  const words = requirementText.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  const out: { evidenceId: string; phrase: string }[] = [];
  for (const item of evidence) {
    const haystack = `${item.title} ${item.text} ${item.skills.join(' ')}`.toLowerCase();
    const hit = words.find(w => haystack.includes(w));
    if (hit) out.push({ evidenceId: item.id, phrase: hit });
  }
  return out.slice(0, 3);
}
