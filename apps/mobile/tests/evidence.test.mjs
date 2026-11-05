import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/evidence.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { isEvidenceRecord, sortEvidenceRecords, validateEvidenceDraft } = helpers;

const validDraft = {
  title: 'Fictional onboarding improvement',
  context: 'A made-up product team exercise had an unclear first-run flow.',
  action: 'Mapped three fictional user paths and proposed clearer labels.',
  result: 'The exercise produced a simpler draft flow for review.',
  skillTags: ['research', 'writing'],
};
const validRecord = {
  id: 'evidence-sample',
  ...validDraft,
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
};

test('accepts a complete fictional context-action-result example', () => {
  assert.deepEqual(validateEvidenceDraft(validDraft), {});
  assert.equal(isEvidenceRecord(validRecord), true);
});

test('rejects missing story sections, overlong fields, duplicate or excessive tags', () => {
  assert.match(validateEvidenceDraft({ ...validDraft, title: ' ' }).title, /title is required/i);
  assert.match(validateEvidenceDraft({ ...validDraft, context: 'x'.repeat(501) }).context, /500 characters/i);
  assert.match(validateEvidenceDraft({ ...validDraft, skillTags: ['research', 'Research'] }).skillTags, /duplicate/i);
  assert.match(validateEvidenceDraft({ ...validDraft, skillTags: Array.from({ length: 9 }, (_, index) => `skill-${index}`) }).skillTags, /8 skill tags/i);
  assert.equal(isEvidenceRecord({ ...validRecord, result: '' }), false);
});

test('searches all story fields and orders examples by most recent update', () => {
  const older = { ...validRecord, id: 'older', updatedAt: '2026-10-27T10:00:00.000Z' };
  const newer = { ...validRecord, id: 'newer', title: 'Workshop facilitation', updatedAt: '2026-10-28T10:00:00.000Z' };
  assert.deepEqual(sortEvidenceRecords([older, newer], 'facilitation').map((item) => item.id), ['newer']);
  assert.deepEqual(sortEvidenceRecords([older, newer]).map((item) => item.id), ['newer', 'older']);
});

test('legacy native career state defaults evidence to empty and the screen stays local-only', () => {
  const storage = readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../src/screens/EvidenceScreen.tsx', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../src/guidance.ts', import.meta.url), 'utf8');
  const guideScreen = readFileSync(new URL('../src/app/(tabs)/guide.tsx', import.meta.url), 'utf8');
  assert.match(storage, /!\('evidenceItems' in value\)/);
  assert.match(storage, /recoverItems\(value\.evidenceItems, defaults\.evidenceItems, isEvidenceRecord\)/);
  assert.match(home, /router\.push\('\/evidence'\)/);
  assert.match(screen, /FICTIONAL DATA · LOCAL ONLY/);
  assert.match(screen, /Tags can appear in an exact phrase check/);
  assert.match(screen, /neither action verifies experience or proves qualification/);
  assert.match(guide, /context, action, result, and optional skill tags/i);
  assert.match(guideScreen, /router\.push\('\/evidence'\)/);
});
