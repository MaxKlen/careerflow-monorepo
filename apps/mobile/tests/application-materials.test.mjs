import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function compiledUrl(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const requirementSource = readFileSync(new URL('../src/requirementCoverage.ts', import.meta.url), 'utf8');
const requirementUrl = compiledUrl(requirementSource);
let materialsSource = readFileSync(new URL('../src/applicationMaterials.ts', import.meta.url), 'utf8');
materialsSource = materialsSource.replace("from './requirementCoverage'", `from '${requirementUrl}'`);
const materialsUrl = compiledUrl(materialsSource);
const { createApplicationMaterialsExportFilename, createApplicationMaterialsScaffold, isValidApplicationMaterialsDraft, MAX_APPLICATION_MATERIALS_DRAFT_LENGTH } = await import(materialsUrl);

const source = {
  requirement: 'Stakeholder interviews',
  evidenceId: 'evidence-synthetic-01',
  linkedAt: '2026-10-28T09:00:00.000Z',
  snapshot: {
    title: 'Fictional listening session',
    context: 'A fictional team wanted clearer onboarding feedback.',
    action: 'I mapped three made-up interview themes.',
    result: 'The sample team reviewed a revised flow.',
    skillTags: ['Interviewing'],
    updatedAt: '2026-10-28T08:45:00.000Z',
  },
};
const application = {
  organization: 'Cedar & Finch Labs',
  role: 'Research Designer',
  requirements: ['Stakeholder interviews', 'Fictional service planning'],
  requirementEvidenceLinks: [source],
};
const timestamp = '2026-10-28T10:00:00.000Z';

test('creates a path-safe, timestamped plain-text export filename from the fictional role', () => {
  const filename = createApplicationMaterialsExportFilename('../Café & Finch', 'Research/Designer', new Date(timestamp));
  assert.equal(filename, 'careerflow-cafe-finch-research-designer-materials-2026-10-28T10-00-00-000Z.txt');
  assert.doesNotMatch(filename, /[\\/]/);
});

test('builds the same source-attributed, candidate-editable scaffold without adding qualifications or claims', () => {
  const draft = createApplicationMaterialsScaffold(application, timestamp);
  assert.match(draft.body, /Requirement phrase \(saved verbatim\): Stakeholder interviews/);
  assert.match(draft.body, /Candidate-selected Evidence Library source: Fictional listening session/);
  assert.match(draft.body, /Source record: evidence-synthetic-01 · linked 2026-10-28T09:00:00\.000Z · source updated 2026-10-28T08:45:00\.000Z/);
  assert.match(draft.body, /Context \(saved snapshot, verbatim\): A fictional team wanted clearer onboarding feedback\./);
  assert.match(draft.body, /Action \(saved snapshot, verbatim\): I mapped three made-up interview themes\./);
  assert.match(draft.body, /Result \(saved snapshot, verbatim\): The sample team reviewed a revised flow\./);
  assert.match(draft.body, /\[No Evidence Library source was selected for this requirement\.\]/);
  assert.doesNotMatch(draft.body, /is qualified/i);
  assert.equal(draft.createdAt, timestamp);
  assert.equal(draft.updatedAt, timestamp);
  assert.deepEqual(draft.sources, [source]);
  assert.equal(isValidApplicationMaterialsDraft(draft), true);
});

test('keeps an independent valid provenance snapshot after a draft is edited and rejects malformed or oversized drafts', () => {
  const draft = createApplicationMaterialsScaffold(application, timestamp);
  draft.body += '\nCandidate-edited fictional note.';
  draft.sources[0].snapshot.skillTags.push('Changed after build');
  assert.deepEqual(source.snapshot.skillTags, ['Interviewing']);
  assert.equal(isValidApplicationMaterialsDraft(draft), true);
  assert.equal(isValidApplicationMaterialsDraft({ ...draft, body: 'x'.repeat(MAX_APPLICATION_MATERIALS_DRAFT_LENGTH + 1) }), false);
  assert.equal(isValidApplicationMaterialsDraft({ ...draft, sources: [{ ...source, snapshot: { ...source.snapshot, context: '' } }] }), false);
  assert.equal(isValidApplicationMaterialsDraft({ ...draft, createdAt: 'not-a-date' }), false);
});

test('builds a useful honest outline when no requirements or selected sources are saved', () => {
  const draft = createApplicationMaterialsScaffold({ ...application, requirements: [], requirementEvidenceLinks: [] }, timestamp);
  assert.match(draft.body, /No role requirements are saved yet/);
  assert.deepEqual(draft.sources, []);
  assert.equal(isValidApplicationMaterialsDraft(draft), true);
});
