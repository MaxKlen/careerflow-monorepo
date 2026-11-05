import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/opportunities.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const {
  MAX_CANDIDATE_OPPORTUNITY_RECORDS,
  MAX_OPPORTUNITY_KEYWORDS,
  SAMPLE_OPPORTUNITIES,
  createCandidateOpportunity,
  createOpportunityApplicationDraft,
  filterSearchOpportunities,
  isOpportunityTracked,
  isValidCandidateOpportunity,
  isValidOpportunityCollection,
  matchOpportunityPhrases,
  recoverOpportunityCollection,
  removeCandidateOpportunity,
  toSearchOpportunities,
  updateCandidateOpportunity,
  validateOpportunityEntry,
} = helpers;

const timestamp = '2026-10-28T10:00:00.000Z';
const validInput = {
  company: ' Cedar & Finch Labs ',
  role: 'Product Designer',
  location: 'Harbor Glen',
  type: 'Hybrid',
  summary: 'A fictional role for testing.',
  keywords: ['User research', 'Design systems'],
};

function candidate(id = 'opportunity-1', changes = {}) {
  return {
    id,
    company: 'Cedar & Finch Labs',
    role: 'Product Designer',
    location: 'Harbor Glen',
    type: 'Hybrid',
    summary: 'A fictional role for testing.',
    keywords: ['User research', 'Design systems'],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...changes,
  };
}

test('shows a fixed set of explicitly fictional sample roles', () => {
  assert.equal(SAMPLE_OPPORTUNITIES.length, 6);
  assert.ok(SAMPLE_OPPORTUNITIES.every((role) => role.id && role.company && role.role && role.keywords.length));
  assert.ok(SAMPLE_OPPORTUNITIES.every((role) => /fictional/i.test(role.summary)));
});

test('validates required fields, field bounds, phrase count, and normalized duplicate phrases', () => {
  assert.deepEqual(validateOpportunityEntry(validInput), {});
  assert.match(validateOpportunityEntry({ ...validInput, role: ' ' }).role, /role title/i);
  assert.match(validateOpportunityEntry({ ...validInput, company: 'C'.repeat(101) }).company, /100 characters/i);
  assert.match(validateOpportunityEntry({ ...validInput, location: 'L'.repeat(101) }).location, /100 characters/i);
  assert.match(validateOpportunityEntry({ ...validInput, type: 'T'.repeat(61) }).type, /60 characters/i);
  assert.match(validateOpportunityEntry({ ...validInput, summary: 'S'.repeat(601) }).summary, /600 characters/i);
  assert.match(validateOpportunityEntry({ ...validInput, keywords: [] }).keywords, /at least one/i);
  assert.match(validateOpportunityEntry({ ...validInput, keywords: ['x'.repeat(81)] }).keywords, /80 characters/i);
  assert.match(validateOpportunityEntry({ ...validInput, keywords: ['SQL', ' sql. '] }).keywords, /duplicate/i);
  assert.equal(validateOpportunityEntry({ ...validInput, keywords: Array.from({ length: MAX_OPPORTUNITY_KEYWORDS + 1 }, (_, index) => `phrase ${index}`) }).keywords, `Use no more than ${MAX_OPPORTUNITY_KEYWORDS} phrases.`);
});

test('adds, edits, and removes a bounded candidate-entered opportunity without losing its identity', () => {
  const created = createCandidateOpportunity(validInput, [], 'opportunity-1', timestamp);
  assert.equal(created.ok, true);
  assert.equal(created.opportunity.company, 'Cedar & Finch Labs');
  assert.equal(created.opportunity.createdAt, timestamp);
  assert.equal(created.opportunity.updatedAt, timestamp);

  const updated = updateCandidateOpportunity(created.opportunity, {
    ...validInput,
    role: 'Senior Product Designer',
    keywords: ['User research', 'Accessible prototypes'],
  }, [created.opportunity], '2026-10-29T10:00:00.000Z');
  assert.equal(updated.ok, true);
  assert.equal(updated.opportunity.id, created.opportunity.id);
  assert.equal(updated.opportunity.createdAt, timestamp);
  assert.equal(updated.opportunity.updatedAt, '2026-10-29T10:00:00.000Z');
  assert.deepEqual(updated.opportunity.keywords, ['User research', 'Accessible prototypes']);

  assert.deepEqual(removeCandidateOpportunity([updated.opportunity], updated.opportunity.id), []);
});

test('rejects duplicates, sample-role collisions, over-cap additions, and malformed updates', () => {
  const created = createCandidateOpportunity(validInput, [], 'opportunity-1', timestamp);
  assert.equal(created.ok, true);
  const duplicate = createCandidateOpportunity({ ...validInput, company: 'cedar & finch labs', role: ' product designer ' }, [created.opportunity], 'opportunity-2', timestamp);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.form, /already in the local/i);

  const sample = SAMPLE_OPPORTUNITIES[0];
  const sampleCollision = createCandidateOpportunity({
    company: sample.company,
    role: sample.role,
    location: '',
    type: '',
    summary: '',
    keywords: ['SQL'],
  }, [], 'opportunity-3', timestamp);
  assert.equal(sampleCollision.ok, false);
  assert.match(sampleCollision.errors.form, /already in the local/i);

  const fullList = Array.from({ length: MAX_CANDIDATE_OPPORTUNITY_RECORDS }, (_, index) => candidate(`entry-${index}`, { company: `Fictional studio ${index}`, role: `Sample role ${index}` }));
  const atCap = createCandidateOpportunity(validInput, fullList, 'overflow', timestamp);
  assert.equal(atCap.ok, false);
  assert.match(atCap.errors.form, /up to 100/i);

  const malformed = updateCandidateOpportunity(created.opportunity, { ...validInput, company: null }, [created.opportunity], timestamp);
  assert.equal(malformed.ok, false);
  assert.match(malformed.errors.company, /organization/i);
});

test('validates and recovers only bounded unique opportunity records', () => {
  assert.equal(isValidCandidateOpportunity(candidate()), true);
  assert.equal(isValidCandidateOpportunity({ ...candidate(), unexpected: 'value' }), false);
  assert.equal(isValidCandidateOpportunity({ ...candidate(), createdAt: 'not-a-date' }), false);
  assert.equal(isValidOpportunityCollection([candidate()]), true);
  assert.equal(isValidOpportunityCollection([candidate(), candidate('opportunity-2')]), false);
  assert.equal(isValidOpportunityCollection([candidate(), candidate('opportunity-2', { company: 'cedar & finch labs' })]), false);
  assert.equal(isValidOpportunityCollection(Array.from({ length: MAX_CANDIDATE_OPPORTUNITY_RECORDS + 1 }, (_, index) => candidate(`entry-${index}`, { company: `Studio ${index}`, role: `Role ${index}` }))), false);
  assert.deepEqual(recoverOpportunityCollection(undefined), []);
  assert.deepEqual(recoverOpportunityCollection([candidate(), { ...candidate('bad'), keywords: [''] }, candidate('opportunity-2')]), [candidate()]);
});

test('filters fictional samples and local entries by query, source, and work type', () => {
  const local = candidate('local-1', { company: 'Made-up Place', role: 'Accessibility Writer', type: 'Remote' });
  const all = toSearchOpportunities([local]);
  assert.equal(all.length, SAMPLE_OPPORTUNITIES.length + 1);
  assert.deepEqual(filterSearchOpportunities(all, 'ACCESSIBILITY', 'candidate').map((item) => item.role), ['Accessibility Writer']);
  assert.deepEqual(filterSearchOpportunities(all, '', 'candidate', 'remote').map((item) => item.company), ['Made-up Place']);
  assert.equal(filterSearchOpportunities(all, '', 'sample').length, SAMPLE_OPPORTUNITIES.length);
});

test('compares complete listed phrases deterministically and treats punctuation as a boundary', () => {
  const comparison = matchOpportunityPhrases('SQL, project-coordination & React! JavaScript', [
    'SQL',
    'project coordination',
    'react',
    'React Native',
    'JavaScript',
  ]);
  assert.deepEqual(comparison.matchedPhrases, ['SQL', 'project coordination', 'react', 'JavaScript']);
  assert.deepEqual(comparison.missingPhrases, ['React Native']);
  assert.equal(comparison.overlapPercent, 80);
  assert.deepEqual(matchOpportunityPhrases('React Native', ['React']).matchedPhrases, ['React']);
  assert.deepEqual(matchOpportunityPhrases('ReactNative', ['React']).matchedPhrases, []);
  assert.deepEqual(matchOpportunityPhrases('JavaScript', ['Java']).matchedPhrases, []);
  assert.equal(matchOpportunityPhrases('anything', []).overlapPercent, 0);
});

test('keeps C, C++, and C# distinct while normalizing A/B testing punctuation', () => {
  const languagePhrases = ['C', 'C++', 'C#'];
  const plainC = matchOpportunityPhrases('Built tools in C.', languagePhrases);
  assert.deepEqual(plainC.matchedPhrases, ['C']);
  assert.deepEqual(plainC.missingPhrases, ['C++', 'C#']);

  const extendedLanguages = matchOpportunityPhrases('Built tools in C++ and C#.', languagePhrases);
  assert.deepEqual(extendedLanguages.matchedPhrases, ['C++', 'C#']);
  assert.deepEqual(extendedLanguages.missingPhrases, ['C']);

  assert.deepEqual(matchOpportunityPhrases('Experienced in A B testing.', ['A/B testing']).matchedPhrases, ['A/B testing']);
  assert.deepEqual(matchOpportunityPhrases('Experienced in A/B testing.', ['A/B testing']).matchedPhrases, ['A/B testing']);
});

test('tracks a role once into Applications with its exact listed phrases intact', () => {
  const created = createCandidateOpportunity(validInput, [], 'opportunity-1', timestamp);
  assert.equal(created.ok, true);
  const listed = toSearchOpportunities([created.opportunity]).find((item) => item.source === 'candidate');
  const application = createOpportunityApplicationDraft(listed);
  assert.equal(application.status, 'considering');
  assert.deepEqual(application.requirements, validInput.keywords);
  assert.match(application.nextStep, /fictional local opportunity/i);
  assert.equal(isOpportunityTracked(listed, []), false);
  assert.equal(isOpportunityTracked(listed, [{ organization: 'cedar & finch labs', role: 'PRODUCT DESIGNER' }]), true);
});

test('exposes an accessible native route with local-only search, create/edit/remove, and tracking controls', () => {
  const home = readFileSync(new URL('../src/app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../src/app/job-search.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../src/screens/OpportunitySearchScreen.tsx', import.meta.url), 'utf8');
  const context = readFileSync(new URL('../src/CareerContext.tsx', import.meta.url), 'utf8');
  assert.match(home, /router\.push\('\/job-search'\)/);
  assert.match(layout, /Stack\.Screen name="job-search"/);
  assert.match(route, /OpportunitySearchScreen/);
  assert.match(screen, /accessibilityLabel="Search opportunities"/);
  assert.match(screen, /Fictional roles · Local only/i);
  assert.match(screen, /Text overlap only/);
  assert.match(screen, /Nothing is sent to an employer/);
  assert.match(screen, /Edit local entry/);
  assert.match(screen, /Remove local entry/);
  assert.match(screen, /createOpportunityApplicationDraft\(opportunity\)/);
  assert.match(context, /state\.opportunities/);
  assert.match(context, /updateOpportunity/);
  assert.match(context, /removeOpportunity/);
});
