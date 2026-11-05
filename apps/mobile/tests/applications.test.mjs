import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const requirementSource = readFileSync(new URL('../src/requirementCoverage.ts', import.meta.url), 'utf8');
const requirementCompiled = ts.transpileModule(requirementSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const requirementUrl = `data:text/javascript;base64,${Buffer.from(requirementCompiled).toString('base64')}`;
let materialsSource = readFileSync(new URL('../src/applicationMaterials.ts', import.meta.url), 'utf8')
  .replace("from './requirementCoverage'", `from '${requirementUrl}'`);
const materialsCompiled = ts.transpileModule(materialsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const materialsUrl = `data:text/javascript;base64,${Buffer.from(materialsCompiled).toString('base64')}`;
const source = readFileSync(new URL('../src/application.ts', import.meta.url), 'utf8')
  .replace("from './requirementCoverage'", `from '${requirementUrl}'`)
  .replace("from './applicationMaterials'", `from '${materialsUrl}'`);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { addFollowUpHistoryEvent, isApplicationRecord, isFollowUpEvent, isValidFollowUpHistory, normalizeApplicationFollowUpHistory, removeFollowUpHistoryEvent, sortFollowUpEvents, sortApplicationRecords, updateFollowUpHistoryEvent, validateApplicationDraft } = helpers;

const validDraft = {
  organization: 'Cedar & Finch Labs',
  role: 'Product Designer',
  status: 'applied',
  appliedOn: '2026-10-28',
  nextStep: 'Prepare a fictional portfolio example',
  nextStepDueDate: '2026-11-02',
};

const validRecord = {
  id: 'application-example',
  ...validDraft,
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
};

test('accepts a complete synthetic follow-through record and closed records without a next step', () => {
  assert.deepEqual(validateApplicationDraft(validDraft), {});
  assert.deepEqual(validateApplicationDraft({ ...validDraft, status: 'closed', nextStep: '', nextStepDueDate: undefined }), {});
  assert.equal(isApplicationRecord(validRecord), true);
});

test('rejects missing fields, invalid statuses and impossible dates', () => {
  assert.match(validateApplicationDraft({ ...validDraft, organization: ' ', role: '' }).organization, /organization/i);
  assert.match(validateApplicationDraft({ ...validDraft, status: 'automated' }).status, /status/i);
  assert.match(validateApplicationDraft({ ...validDraft, appliedOn: '2026-02-30' }).appliedOn, /date/i);
  assert.match(validateApplicationDraft({ ...validDraft, nextStepDueDate: 'tomorrow' }).nextStepDueDate, /date/i);
  assert.match(validateApplicationDraft({ ...validDraft, nextStep: '', nextStepDueDate: '2026-11-02' }).nextStep, /next step/i);
  assert.equal(isApplicationRecord({ ...validRecord, status: 'submitted-automatically' }), false);
  assert.equal(isApplicationRecord({ ...validRecord, nextStepDueDate: 'not-a-date' }), false);
});

test('bounds user-entered organization, role and next-step text', () => {
  assert.match(validateApplicationDraft({ ...validDraft, organization: 'O'.repeat(121) }).organization, /120 characters/i);
  assert.match(validateApplicationDraft({ ...validDraft, role: 'R'.repeat(101) }).role, /100 characters/i);
  assert.match(validateApplicationDraft({ ...validDraft, nextStep: 'x'.repeat(281) }).nextStep, /280 characters/i);
});

test('validates optional requirement phrases and materials drafts while preserving legacy application records', () => {
  assert.equal(isApplicationRecord(validRecord), true);
  assert.match(validateApplicationDraft({ ...validDraft, requirements: ['User research', ' user   research. '] }).requirements, /duplicate/i);
  assert.match(validateApplicationDraft({ ...validDraft, requirements: ['x'.repeat(81)] }).requirements, /1–80/i);
  assert.equal(isApplicationRecord({ ...validRecord, requirements: ['User research'], requirementEvidenceLinks: [{ requirement: 'Other phrase' }] }), false);
  const materialsDraft = { body: 'Editable fictional outline', sources: [], createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:30:00.000Z' };
  assert.equal(isApplicationRecord({ ...validRecord, materialsDraft }), true);
  assert.equal(isApplicationRecord({ ...validRecord, materialsDraft: { ...materialsDraft, sources: [{ requirement: 'Planning', evidenceId: 'e-1', linkedAt: '2026-10-28', snapshot: { title: 'Source', context: '', action: 'Action', result: 'Result', skillTags: [], updatedAt: '2026-10-28' } }] } }), false);
});

test('sorts dated next steps first and leaves records without dates at the end', () => {
  const later = { ...validRecord, id: 'later', nextStepDueDate: '2026-11-12' };
  const earlier = { ...validRecord, id: 'earlier', nextStepDueDate: '2026-11-02' };
  const undated = { ...validRecord, id: 'undated', nextStepDueDate: undefined };
  assert.deepEqual(sortApplicationRecords([undated, later, earlier]).map((item) => item.id), ['earlier', 'later', 'undated']);
});

test('recovers older version-1 state without application data and skips malformed records', () => {
  const storage = readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8');
  assert.match(storage, /!\('applications' in value\)/);
  assert.match(storage, /recoverItems<ApplicationRecord>\(value\.applications, defaults\.applications, isApplicationRecord\)/);
});

test('Home exposes the route and the screen explains local-only limits', () => {
  const home = readFileSync(new URL('../src/app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../src/screens/ApplicationsScreen.tsx', import.meta.url), 'utf8');
  assert.match(home, /router\.push\('\/applications'\)/);
  assert.match(screen, /FICTIONAL DATA · LOCAL ONLY/);
  assert.match(screen, /No jobs are sourced or submitted/);
  assert.match(screen, /Edit \/ update status/);
  assert.match(screen, /Delete record/);
  assert.match(screen, /Role requirements/);
  assert.match(screen, /calculateRequirementCoverage/);
  assert.match(screen, /remains unmatched/);
  assert.match(screen, /Link an Evidence Library example manually/);
  assert.match(screen, /original snapshot above is preserved/);
  assert.match(screen, /This manual source link is separate from the exact phrase check/);
  assert.match(screen, /accessibilityLabel="Follow-up date"/);
  assert.match(screen, /accessibilityLabel="Follow-up note"/);
  assert.match(screen, /Platform\.OS === 'web'/);
  assert.match(screen, /globalThis\.confirm/);
});

test('strictly validates and deterministically orders follow-up history at its 50-event cap', () => {
  const events = Array.from({ length: 50 }, (_, index) => ({
    id: `event-${index}`,
    date: index === 0 ? '2026-11-02' : '2026-11-01',
    type: 'email',
    note: `Fictional note ${index}`,
    createdAt: `2026-10-28T10:${String(index).padStart(2, '0')}:00.000Z`,
  }));
  assert.equal(isValidFollowUpHistory(events), true);
  assert.equal(isValidFollowUpHistory([...events, { ...events[0], id: 'event-50' }]), false);
  assert.equal(isValidFollowUpHistory(events.map((event, index) => index === 1 ? { ...event, id: 'event-0' } : event)), false);
  assert.equal(isValidFollowUpHistory(events.map((event, index) => index === 1 ? { ...event, note: '   ' } : event)), false);
  assert.deepEqual(sortFollowUpEvents([events[1], events[0], { ...events[0], id: 'event-a' }]).map((event) => event.id), ['event-0', 'event-a', 'event-1']);
  assert.equal(isApplicationRecord({ ...validRecord, followUpHistory: events }), true);
  assert.equal(isFollowUpEvent({ ...events[0], date: '' }), false);
  assert.equal(isFollowUpEvent({ ...events[0], createdAt: '2026-10-28T10:00:00Z' }), false);
  assert.equal(isFollowUpEvent({ ...events[0], id: 'x'.repeat(121) }), false);
  assert.equal(isFollowUpEvent({ ...events[0], unexpected: true }), false);
});

test('creates, edits, and deletes follow-up history entries without altering other entries', () => {
  const first = { id: 'follow-up-1', date: '2026-10-26', type: 'email', note: 'Earlier fictional note', createdAt: '2026-10-28T10:00:00.000Z' };
  const second = { id: 'follow-up-2', date: '2026-10-27', type: 'phone', note: 'Later fictional note', createdAt: '2026-10-28T11:00:00.000Z' };
  const created = addFollowUpHistoryEvent([], first);
  assert.equal(created.ok, true);
  assert.deepEqual(created.history, [first]);
  const withSecond = addFollowUpHistoryEvent(created.history, second);
  assert.equal(withSecond.ok, true);
  const edited = updateFollowUpHistoryEvent(withSecond.history, { ...first, date: '2026-10-29', type: 'interview', note: 'Edited fictional note' });
  assert.equal(edited.ok, true);
  assert.deepEqual(edited.history, [{ ...first, date: '2026-10-29', type: 'interview', note: 'Edited fictional note' }, second]);
  const deleted = removeFollowUpHistoryEvent(edited.history, first.id);
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.history, [second]);
});

test('rejects event 51 without dropping any of the 50 existing entries', () => {
  const history = Array.from({ length: 50 }, (_, index) => ({
    id: `follow-up-${index + 1}`, date: '2026-10-28', type: 'email', note: `Fictional note ${index + 1}`, createdAt: '2026-10-28T10:00:00.000Z',
  }));
  const overflow = addFollowUpHistoryEvent(history, { id: 'follow-up-51', date: '2026-10-28', type: 'email', note: 'Fictional overflow', createdAt: '2026-10-28T11:00:00.000Z' });
  assert.deepEqual(overflow, { ok: false, reason: 'limit' });
  assert.equal(history.length, 50);
  assert.equal(history[0].id, 'follow-up-1');
  assert.equal(history[49].id, 'follow-up-50');
});

test('legacy version-1 application records remain valid when follow-up history is absent', () => {
  const legacy = { ...validRecord };
  delete legacy.followUpHistory;
  assert.equal(isApplicationRecord(legacy), true);
  assert.deepEqual(normalizeApplicationFollowUpHistory(legacy).followUpHistory, []);
});
