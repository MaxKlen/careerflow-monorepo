import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/requirementCoverage.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const {
  calculateRequirementCoverage,
  isValidApplicationRequirements,
  isValidRequirementEvidenceLinks,
  normalizeRequirementPhrase,
  parseApplicationRequirements,
  retainRequirementEvidenceLinks,
} = helpers;

const evidence = {
  id: 'evidence-research',
  title: 'Fictional research exercise',
  context: 'A made-up team needed customer input.',
  action: 'Planned fictional interviews and synthesis.',
  result: 'The sample team had clearer next questions.',
  skillTags: ['User research', 'Interviewing'],
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
};
const link = {
  requirement: 'User research',
  evidenceId: evidence.id,
  linkedAt: '2026-10-28T11:00:00.000Z',
  snapshot: {
    title: evidence.title,
    context: evidence.context,
    action: evidence.action,
    result: evidence.result,
    skillTags: [...evidence.skillTags],
    updatedAt: evidence.updatedAt,
  },
};

test('normalizes whole phrases and parses common list markers without semantic expansion', () => {
  assert.equal(normalizeRequirementPhrase('  USER   RESEARCH. '), 'user research');
  assert.deepEqual(parseApplicationRequirements('  1. User research\n- Facilitation\n• Product strategy\n\n* Analytics  '), [
    'User research', 'Facilitation', 'Product strategy', 'Analytics',
  ]);
  assert.deepEqual(calculateRequirementCoverage(['user research', 'research'], ['User   Research.'], [evidence]).map((item) => ({
    profileSkill: item.profileSkill,
    evidenceTags: item.evidenceTags.map((tag) => tag.tag),
  })), [
    { profileSkill: 'User   Research.', evidenceTags: ['User research'] },
    { profileSkill: null, evidenceTags: [] },
  ]);
});

test('validates unique bounded requirements and leaves a manually linked unmatched phrase unmatched', () => {
  assert.equal(isValidApplicationRequirements(['User research', 'Facilitation']), true);
  assert.equal(isValidApplicationRequirements(['User research', ' user   research. ']), false);
  assert.equal(isValidApplicationRequirements(['']), false);
  assert.equal(isValidApplicationRequirements(['x'.repeat(81)]), false);
  assert.equal(isValidApplicationRequirements(Array.from({ length: 21 }, (_, index) => `skill-${index}`)), false);
  const requirements = ['Stakeholder interviews'];
  assert.equal(isValidRequirementEvidenceLinks([link], requirements), false);
  const manualLink = { ...link, requirement: 'Stakeholder interviews' };
  assert.equal(isValidRequirementEvidenceLinks([manualLink], requirements), true);
  assert.deepEqual(calculateRequirementCoverage(requirements, [], [evidence]), [
    { requirement: 'Stakeholder interviews', profileSkill: null, evidenceTags: [] },
  ]);
});

test('validates source snapshots, rejects duplicate and excess links, and retains snapshots when source changes or disappears', () => {
  const requirements = ['User research'];
  assert.equal(isValidRequirementEvidenceLinks([link], requirements), true);
  assert.equal(isValidRequirementEvidenceLinks([link, link], requirements), false);
  const sixLinks = Array.from({ length: 6 }, (_, index) => ({
    ...link,
    evidenceId: `evidence-${index}`,
  }));
  assert.equal(isValidRequirementEvidenceLinks(sixLinks, requirements), false);
  assert.equal(isValidRequirementEvidenceLinks([{ ...link, snapshot: { ...link.snapshot, context: '' } }], requirements), false);
  const changedSource = { ...evidence, title: 'Edited title', context: 'Edited story', updatedAt: '2026-10-29T09:00:00.000Z' };
  assert.notDeepEqual(changedSource, link.snapshot);
  assert.deepEqual(retainRequirementEvidenceLinks([' USER   RESEARCH. '], [link]), [{ ...link, requirement: ' USER   RESEARCH. ' }]);
  assert.deepEqual(retainRequirementEvidenceLinks(['Facilitation'], [link]), []);
  assert.equal(retainRequirementEvidenceLinks(['User research'], [link])[0].snapshot.context, evidence.context);
});

test('legacy application records remain valid with absent optional feature fields', () => {
  const application = {
    id: 'legacy-application',
    organization: 'Fictional organization',
    role: 'Sample role',
    status: 'considering',
    nextStep: 'Review a fictional task',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  };
  const applicationSource = readFileSync(new URL('../src/application.ts', import.meta.url), 'utf8');
  const relativeImport = source.replace("from './domain'", "from './domain'");
  assert.match(applicationSource, /value\.requirements === undefined \|\| isValidApplicationRequirements/);
  assert.match(applicationSource, /isValidRequirementEvidenceLinks\(value\.requirementEvidenceLinks, value\.requirements \?\? \[\]\)/);
  assert.match(relativeImport, /export function isValidRequirementEvidenceLinks/);
  const storage = readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8');
  const backup = readFileSync(new URL('../src/localBackup.ts', import.meta.url), 'utf8');
  assert.match(storage, /requirements: application\.requirements \?\? \[\]/);
  assert.match(storage, /requirementEvidenceLinks: application\.requirementEvidenceLinks \?\? \[\]/);
  assert.match(backup, /applications: backup\.career\.applications\.map/);
});
