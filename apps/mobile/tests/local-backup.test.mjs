import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function compiledUrl(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const requirementUrl = compiledUrl('../src/requirementCoverage.ts');
let materialsSource = readFileSync(new URL('../src/applicationMaterials.ts', import.meta.url), 'utf8');
materialsSource = materialsSource.replace("from './requirementCoverage'", `from '${requirementUrl}'`);
const materialsCompiled = ts.transpileModule(materialsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const materialsUrl = `data:text/javascript;base64,${Buffer.from(materialsCompiled).toString('base64')}`;
let applicationSource = readFileSync(new URL('../src/application.ts', import.meta.url), 'utf8');
applicationSource = applicationSource.replace("from './requirementCoverage'", `from '${requirementUrl}'`);
applicationSource = applicationSource.replace("from './applicationMaterials'", `from '${materialsUrl}'`);
const applicationCompiled = ts.transpileModule(applicationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const applicationUrl = `data:text/javascript;base64,${Buffer.from(applicationCompiled).toString('base64')}`;
const evidenceUrl = compiledUrl('../src/evidence.ts');
let opportunitySource = readFileSync(new URL('../src/opportunities.ts', import.meta.url), 'utf8')
  .replace("from './requirementCoverage'", `from '${requirementUrl}'`);
const opportunityCompiled = ts.transpileModule(opportunitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const opportunityUrl = `data:text/javascript;base64,${Buffer.from(opportunityCompiled).toString('base64')}`;
let source = readFileSync(new URL('../src/localBackup.ts', import.meta.url), 'utf8');
source = source.replace("from './application'", `from '${applicationUrl}'`);
source = source.replace("from './evidence'", `from '${evidenceUrl}'`);
source = source.replace("from './opportunities'", `from '${opportunityUrl}'`);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const backupModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { createLocalBackup, parseLocalBackup, replaceLocalBackupInStorage, MAX_LOCAL_BACKUP_BYTES } = backupModule;

const career = {
  version: 1,
  tasks: [{ id: 'task-1', title: 'Fictional task', status: 'todo', priority: 'medium', createdAt: '2026-10-01', updatedAt: '2026-10-02' }],
  projects: [{ id: 'project-1', name: 'Sample project', description: 'Fictional work', completed: false }],
  profile: { name: '', headline: '', targetRole: 'Sample role', targetIndustry: '', summary: '', skills: '', goals: 'Explore a made-up role' },
  milestones: [{ id: 'milestone-1', name: 'Sample milestone', completed: false }],
  applications: [{
    id: 'application-1', organization: 'Fictional company', role: 'Sample role', status: 'considering',
    nextStep: 'Review the fictional posting', requirements: ['planning'],
    requirementEvidenceLinks: [{
      requirement: 'planning', evidenceId: 'evidence-1', linkedAt: '2026-10-28T09:30:00.000Z',
      snapshot: {
        title: 'Sample outcome', context: 'A fictional team faced a challenge.',
        action: 'I would describe a made-up action.', result: 'The sample exercise reached a result.',
        skillTags: ['planning'], updatedAt: '2026-10-02',
      },
    }],
    createdAt: '2026-10-01', updatedAt: '2026-10-02',
    followUpHistory: [{ id: 'follow-up-1', date: '2026-10-28', type: 'email', note: 'Fictional backup follow-up note.', createdAt: '2026-10-28T10:00:00.000Z' }],
  }],
  evidenceItems: [{ id: 'evidence-1', title: 'Sample outcome', context: 'A fictional team faced a challenge.', action: 'I would describe a made-up action.', result: 'The sample exercise reached a result.', skillTags: ['planning'], createdAt: '2026-10-01', updatedAt: '2026-10-02' }],
  opportunities: [{ id: 'opportunity-1', company: 'Fictional studio', role: 'Sample coordinator', location: 'Harbor Glen', type: 'Hybrid', summary: 'A made-up role for backup testing.', keywords: ['project coordination', 'clear writing'], createdAt: '2026-10-28T09:00:00.000Z', updatedAt: '2026-10-28T09:00:00.000Z' }],
};
career.applications[0].materialsDraft = {
  body: 'Editable fictional outline with candidate-authored text.',
  sources: career.applications[0].requirementEvidenceLinks.map((link) => ({ ...link, snapshot: { ...link.snapshot, skillTags: [...link.snapshot.skillTags] } })),
  createdAt: '2026-10-28T09:45:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
};
const workspace = {
  version: 1,
  account: { demoActive: false, displayName: '', tier: 'Starter' },
  cvText: 'Fictional CV text',
  cvFileName: 'sample.txt',
  linkedIn: { headline: '', about: '', experience: '', skills: '', education: '' },
  coverLetterText: 'Fictional letter',
  otherDocumentTitle: 'Sample notes',
  otherDocumentText: 'Fictional notes',
  savedAt: null,
};

const exportedAt = '2026-10-28T10:00:00.000Z';

test('round-trips tracker, application, evidence, and document state in one backup', () => {
  const raw = createLocalBackup(career, workspace, exportedAt);
  const restored = parseLocalBackup(raw);
  assert.equal(restored.format, 'careerflow-mobile-local-backup');
  assert.equal(restored.exportedAt, exportedAt);
  assert.deepEqual(restored.career, career);
  assert.deepEqual(restored.workspace, workspace);
});

test('rejects malformed JSON, wrong format/version, and invalid nested records', () => {
  assert.throws(() => parseLocalBackup('{'), /not valid JSON/i);
  const valid = JSON.parse(createLocalBackup(career, workspace, exportedAt));
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, format: 'other' })), /compatible/i);
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, formatVersion: 2 })), /compatible/i);
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, career: { ...career, tasks: [{ ...career.tasks[0], status: 'auto-applied' }] } })), /compatible/i);
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, career: { ...career, applications: [{ ...career.applications[0], appliedOn: '2026-02-30' }] } })), /compatible/i);
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, career: { ...career, applications: [{ ...career.applications[0], requirementEvidenceLinks: [{ ...career.applications[0].requirementEvidenceLinks[0], requirement: 'unrelated phrase' }] }] } })), /compatible/i);
  const invalidMaterialsDraft = {
    ...career.applications[0].materialsDraft,
    sources: [{ ...career.applications[0].materialsDraft.sources[0], snapshot: { ...career.applications[0].materialsDraft.sources[0].snapshot, action: '' } }],
  };
  const malformedMaterialsDraft = {
    ...valid,
    career: { ...career, applications: [{ ...career.applications[0], materialsDraft: invalidMaterialsDraft }] },
  };
  assert.throws(() => parseLocalBackup(JSON.stringify(malformedMaterialsDraft)), /compatible/i);
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, career: { ...career, evidenceItems: [{ ...career.evidenceItems[0], result: '' }] } })), /compatible/i);
  assert.throws(() => createLocalBackup({ ...career, evidenceItems: 'bad' }, workspace, exportedAt), /could not be validated/i);
});

test('round-trips immutable evidence snapshots and fills absent feature fields in legacy backups', () => {
  const valid = JSON.parse(createLocalBackup(career, workspace, exportedAt));
  assert.deepEqual(parseLocalBackup(JSON.stringify(valid)).career.applications[0].requirementEvidenceLinks, career.applications[0].requirementEvidenceLinks);
  const legacyApplication = { ...career.applications[0] };
  delete legacyApplication.requirements;
  delete legacyApplication.requirementEvidenceLinks;
  delete legacyApplication.materialsDraft;
  delete legacyApplication.followUpHistory;
  const legacy = { ...valid, career: { ...career, applications: [legacyApplication] } };
  const restored = parseLocalBackup(JSON.stringify(legacy));
  assert.deepEqual(restored.career.applications[0].requirements, []);
  assert.deepEqual(restored.career.applications[0].requirementEvidenceLinks, []);
  assert.deepEqual(restored.career.applications[0].followUpHistory, []);
  const legacyWithoutOpportunities = { ...valid, career: { ...career } };
  delete legacyWithoutOpportunities.career.opportunities;
  assert.deepEqual(parseLocalBackup(JSON.stringify(legacyWithoutOpportunities)).career.opportunities, []);
});

test('rejects malformed or duplicate local opportunities in validated backups', () => {
  const valid = JSON.parse(createLocalBackup(career, workspace, exportedAt));
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, career: { ...career, opportunities: [{ ...career.opportunities[0], keywords: [''] }] } })), /compatible/i);
  assert.throws(() => parseLocalBackup(JSON.stringify({ ...valid, career: { ...career, opportunities: [career.opportunities[0], { ...career.opportunities[0], id: 'opportunity-2' }] } })), /compatible/i);
  assert.throws(() => createLocalBackup({ ...career, opportunities: 'invalid' }, workspace, exportedAt), /could not be validated/i);
});

test('enforces a strict 5 MiB UTF-8 size limit', () => {
  assert.throws(() => parseLocalBackup('x'.repeat(MAX_LOCAL_BACKUP_BYTES + 1)), /5 MiB/i);
  const multibyte = '🙂'.repeat(Math.floor(MAX_LOCAL_BACKUP_BYTES / 4) + 1);
  assert.throws(() => parseLocalBackup(multibyte), /5 MiB/i);
});

test('restores the previous single record if backup replacement write fails', async () => {
  const backup = parseLocalBackup(createLocalBackup(career, workspace, exportedAt));
  const values = new Map([['store-key', 'old-record']]);
  let failStoreWrite = true;
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (key === 'store-key' && failStoreWrite) {
        failStoreWrite = false;
        throw new Error('simulated storage full');
      }
      values.set(key, value);
    },
    removeItem: async (key) => { values.delete(key); },
  };

  await assert.rejects(
    replaceLocalBackupInStorage(storage, backup, 'store-key'),
    /simulated storage full/,
  );
  assert.equal(values.get('store-key'), 'old-record');
});

test('removes a partial new record during rollback when there was no previous data', async () => {
  const backup = parseLocalBackup(createLocalBackup(career, workspace, exportedAt));
  const values = new Map();
  let failStoreWrite = true;
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (key === 'store-key' && failStoreWrite) {
        failStoreWrite = false;
        values.set(key, '{partial record');
        throw new Error('simulated storage full');
      }
      values.set(key, value);
    },
    removeItem: async (key) => { values.delete(key); },
  };

  await assert.rejects(
    replaceLocalBackupInStorage(storage, backup, 'store-key'),
    /simulated storage full/,
  );
  assert.equal(values.has('store-key'), false);
});

test('rolls back a single-record restore when readback does not match the written backup', async () => {
  const backup = parseLocalBackup(createLocalBackup(career, workspace, exportedAt));
  const values = new Map([['store-key', 'old-record']]);
  let returnWrongReadback = false;
  const storage = {
    getItem: async (key) => {
      if (returnWrongReadback && key === 'store-key') {
        returnWrongReadback = false;
        return 'different record';
      }
      return values.get(key) ?? null;
    },
    setItem: async (key, value) => {
      values.set(key, value);
      if (key === 'store-key' && value !== 'old-record') returnWrongReadback = true;
    },
    removeItem: async (key) => { values.delete(key); },
  };

  await assert.rejects(
    replaceLocalBackupInStorage(storage, backup, 'store-key'),
    /could not be verified/i,
  );
  assert.equal(values.get('store-key'), 'old-record');
});

test('preserves the prior raw record when restore rollback silently writes a different value', async () => {
  const backup = parseLocalBackup(createLocalBackup(career, workspace, exportedAt));
  const values = new Map([['store-key', 'old-raw-record']]);
  let failRestoreWrite = true;
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (key === 'store-key' && failRestoreWrite) {
        failRestoreWrite = false;
        values.set(key, '{partial restore record');
        throw new Error('simulated initial restore failure');
      }
      if (key === 'store-key' && value === 'old-raw-record') {
        values.set(key, 'silently corrupted rollback');
        return;
      }
      values.set(key, value);
    },
    removeItem: async (key) => { values.delete(key); },
  };

  await assert.rejects(
    replaceLocalBackupInStorage(storage, backup, 'store-key'),
    /rollback could not be verified/i,
  );
  assert.equal(values.get('store-key'), 'silently corrupted rollback');
  assert.equal(JSON.parse(values.get('store-key.recovery')).raw, 'old-raw-record');
});

test('does not overwrite an existing recovery snapshot when restore rollback fails', async () => {
  const backup = parseLocalBackup(createLocalBackup(career, workspace, exportedAt));
  const previousRecord = '{malformed prior primary record';
  const existingRecovery = JSON.stringify({ capturedAt: '2026-10-31T12:00:00.000Z', raw: 'useful previously salvaged record' });
  const values = new Map([
    ['store-key', previousRecord],
    ['store-key.recovery', existingRecovery],
  ]);
  let failRestoreWrite = true;
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (key === 'store-key' && failRestoreWrite) {
        failRestoreWrite = false;
        values.set(key, '{partial restore record');
        throw new Error('simulated initial restore failure');
      }
      if (key === 'store-key' && value === previousRecord) {
        values.set(key, 'silently corrupted rollback');
        return;
      }
      values.set(key, value);
    },
    removeItem: async (key) => { values.delete(key); },
  };

  await assert.rejects(
    replaceLocalBackupInStorage(storage, backup, 'store-key'),
    /rollback could not be verified/i,
  );
  assert.equal(values.get('store-key'), 'silently corrupted rollback');
  assert.equal(values.get('store-key.recovery'), existingRecovery);
});

test('detects a no-op removal when rollback had no prior record', async () => {
  const backup = parseLocalBackup(createLocalBackup(career, workspace, exportedAt));
  const values = new Map();
  let failRestoreWrite = true;
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (key === 'store-key' && failRestoreWrite) {
        failRestoreWrite = false;
        values.set(key, '{partial restore record');
        throw new Error('simulated initial restore failure');
      }
      values.set(key, value);
    },
    removeItem: async () => {},
  };

  await assert.rejects(
    replaceLocalBackupInStorage(storage, backup, 'store-key'),
    /rollback could not be verified/i,
  );
  assert.equal(values.get('store-key'), '{partial restore record');
  assert.equal(values.has('store-key.recovery'), false);
});

test('wires an explicit import confirmation and guarded single-record restore without network APIs', () => {
  const screen = readFileSync(new URL('../src/screens/LocalBackupScreen.tsx', import.meta.url), 'utf8');
  const storage = readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../src/app/(tabs)/guide.tsx', import.meta.url), 'utf8');
  assert.match(screen, /DocumentPicker\.getDocumentAsync/);
  assert.match(screen, /Sharing\.shareAsync/);
  assert.match(screen, /Replace local workspace\?/);
  assert.match(screen, /style: 'destructive'/);
  assert.match(storage, /replaceLocalBackupInStorage\(AsyncStorage, backup, STORE_KEY\)/);
  assert.match(storage, /parseLocalBackup\(raw\)/);
  assert.match(source, /previousRecord/);
  assert.match(source, /rollback could not be verified/);
  assert.match(guide, /router\.push\('\/backup'\)/);
});

test('rejects malformed and over-cap follow-up histories instead of truncating them', () => {
  const valid = JSON.parse(createLocalBackup(career, workspace, exportedAt));
  const baseEvent = { id: 'follow-up-1', date: '2026-10-28', type: 'email', note: 'Fictional note', createdAt: '2026-10-28T10:00:00.000Z' };
  const malformed = { ...valid, career: { ...career, applications: [{ ...career.applications[0], followUpHistory: [{ ...baseEvent, note: '   ' }] }] } };
  const overCap = { ...valid, career: { ...career, applications: [{ ...career.applications[0], followUpHistory: Array.from({ length: 51 }, (_, index) => ({ ...baseEvent, id: `follow-up-${index}` })) }] } };
  assert.throws(() => parseLocalBackup(JSON.stringify(malformed)), /compatible/i);
  assert.throws(() => parseLocalBackup(JSON.stringify(overCap)), /compatible/i);
  const legacy = { ...valid, career: { ...career, applications: [{ ...career.applications[0], followUpHistory: undefined }] } };
  delete legacy.career.applications[0].followUpHistory;
  assert.deepEqual(parseLocalBackup(JSON.stringify(legacy)).career.applications[0].followUpHistory, []);
});
