import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source, nonce = '') {
  const compiled = ts.transpileModule(`${source}\n// ${nonce}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

function compiledUrl(relativePath, replacements = [], nonce = '') {
  let source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.replace(from, to);
  return moduleUrl(source, nonce);
}

const domainUrl = compiledUrl('../src/domain.ts');
const requirementUrl = compiledUrl('../src/requirementCoverage.ts');
const materialsUrl = compiledUrl('../src/applicationMaterials.ts', [
  ["from './requirementCoverage'", `from '${requirementUrl}'`],
]);
const applicationUrl = compiledUrl('../src/application.ts', [
  ["from './requirementCoverage'", `from '${requirementUrl}'`],
  ["from './applicationMaterials'", `from '${materialsUrl}'`],
]);
const evidenceUrl = compiledUrl('../src/evidence.ts');
const opportunitiesUrl = compiledUrl('../src/opportunities.ts', [
  ["from './requirementCoverage'", `from '${requirementUrl}'`],
]);
const backupUrl = compiledUrl('../src/localBackup.ts', [
  ["from './application'", `from '${applicationUrl}'`],
  ["from './evidence'", `from '${evidenceUrl}'`],
  ["from './opportunities'", `from '${opportunitiesUrl}'`],
]);

const STORE_KEY = 'careerflow.mobile.record.v1';
const CAREER_KEY = 'careerflow.mobile.state.v1';
const WORKSPACE_KEY = 'careerflow.mobile.workspace.v1';
const values = new Map();
const operations = [];
let failReadKey = null;
let failWriteKey = null;
let partialWriteValue = null;
let wrongReadbackCount = 0;
let failRemoveKey = null;
let delayStoreWrites = false;
let silentRollbackWriteKey = null;
let silentRollbackValue = null;
let silentRemoveKey = null;

globalThis.__careerFlowStorage = {
  async getItem(key) {
    operations.push({ operation: 'get', key });
    if (failReadKey === key) {
      failReadKey = null;
      throw new Error(`simulated read failure: ${key}`);
    }
    if (key === STORE_KEY && wrongReadbackCount > 0) {
      wrongReadbackCount -= 1;
      return 'mismatched readback';
    }
    return values.get(key) ?? null;
  },
  async setItem(key, value) {
    operations.push({ operation: 'set', key, value });
    if (delayStoreWrites && key === STORE_KEY) await new Promise((resolve) => setTimeout(resolve, 2));
    if (failWriteKey === key) {
      failWriteKey = null;
      if (partialWriteValue !== null) values.set(key, partialWriteValue);
      throw new Error(`simulated write failure: ${key}`);
    }
    if (silentRollbackWriteKey === key) {
      silentRollbackWriteKey = null;
      values.set(key, silentRollbackValue);
      return;
    }
    values.set(key, value);
    if (key === STORE_KEY && wrongReadbackCount === -1) wrongReadbackCount = 1;
  },
  async removeItem(key) {
    operations.push({ operation: 'remove', key });
    if (failRemoveKey === key) {
      failRemoveKey = null;
      throw new Error(`simulated cleanup failure: ${key}`);
    }
    if (silentRemoveKey === key) {
      silentRemoveKey = null;
      return;
    }
    values.delete(key);
  },
};

const domain = await import(domainUrl);
const backup = await import(backupUrl);
const saveCoordinator = await import(compiledUrl('../src/careerSaveStatus.ts'));
const createStorage = async (nonce = 'initial') => import(compiledUrl('../src/storage.ts', [
  ["import AsyncStorage from '@react-native-async-storage/async-storage';", 'const AsyncStorage = globalThis.__careerFlowStorage;'],
  ["from './domain'", `from '${domainUrl}'`],
  ["from './application'", `from '${applicationUrl}'`],
  ["from './evidence'", `from '${evidenceUrl}'`],
  ["from './localBackup'", `from '${backupUrl}'`],
  ["from './opportunities'", `from '${opportunitiesUrl}'`],
], nonce));
const storage = await createStorage();

function reset() {
  values.clear();
  operations.length = 0;
  failReadKey = null;
  failWriteKey = null;
  partialWriteValue = null;
  wrongReadbackCount = 0;
  failRemoveKey = null;
  delayStoreWrites = false;
  silentRollbackWriteKey = null;
  silentRollbackValue = null;
  silentRemoveKey = null;
}

function legacyCareer(targetRole = 'Legacy target role') {
  return {
    ...domain.initialState,
    profile: { ...domain.initialState.profile, targetRole },
    tasks: [...domain.initialState.tasks, {
      id: `legacy-task-${targetRole.replaceAll(' ', '-')}`,
      title: 'Fictional legacy task',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-10-30T09:00:00.000Z',
      updatedAt: '2026-10-30T09:00:00.000Z',
    }],
  };
}

function legacyWorkspace(cvText = 'Fictional legacy CV text') {
  return { ...domain.initialWorkspaceState, cvText, cvFileName: 'legacy.txt' };
}

function seedLegacy(career = legacyCareer(), workspace = legacyWorkspace()) {
  values.set(CAREER_KEY, JSON.stringify(career));
  values.set(WORKSPACE_KEY, JSON.stringify(workspace));
}

function seedCurrentRecord(career, workspace) {
  values.set(STORE_KEY, JSON.stringify({
    format: 'careerflow-mobile-local-store',
    version: 1,
    career,
    workspace,
  }));
}

function assertLegacyPresent() {
  assert.equal(values.has(CAREER_KEY), true);
  assert.equal(values.has(WORKSPACE_KEY), true);
}

function assertLegacyAbsent() {
  assert.equal(values.has(CAREER_KEY), false);
  assert.equal(values.has(WORKSPACE_KEY), false);
}

test('migrates both legacy keys into one verified record before deleting either legacy key', async () => {
  reset();
  const career = legacyCareer('Migrated role');
  const workspace = legacyWorkspace('Migrated CV text');
  seedLegacy(career, workspace);

  assert.deepEqual((await storage.loadState()).profile.targetRole, 'Migrated role');
  const record = JSON.parse(values.get(STORE_KEY));
  assert.equal(record.format, 'careerflow-mobile-local-store');
  assert.equal(record.version, 1);
  assert.deepEqual(record.career.tasks, career.tasks);
  assert.equal(record.workspace.cvText, workspace.cvText);
  assertLegacyAbsent();

  const newWrite = operations.findIndex((item) => item.operation === 'set' && item.key === STORE_KEY);
  const readback = operations.findIndex((item, index) => index > newWrite && item.operation === 'get' && item.key === STORE_KEY);
  const firstDelete = operations.findIndex((item) => item.operation === 'remove' && item.key === CAREER_KEY);
  const secondDelete = operations.findIndex((item) => item.operation === 'remove' && item.key === WORKSPACE_KEY);
  assert.ok(newWrite >= 0 && readback > newWrite && firstDelete > readback && secondDelete > readback);
  assert.deepEqual((await storage.loadWorkspaceState()).cvText, 'Migrated CV text');
});

test('a before-write failure keeps both legacy keys intact', async () => {
  reset();
  seedLegacy();
  failWriteKey = STORE_KEY;

  await assert.rejects(storage.loadState(), /simulated write failure/);
  assertLegacyPresent();
  assert.equal(values.has(STORE_KEY), false);
  assert.equal(operations.some((item) => item.operation === 'remove' && [CAREER_KEY, WORKSPACE_KEY].includes(item.key)), false);
});

test('a partial mid-write failure keeps both legacy keys for a later retry', async () => {
  reset();
  seedLegacy();
  failWriteKey = STORE_KEY;
  partialWriteValue = '{partial combined record';

  await assert.rejects(storage.loadState(), /simulated write failure/);
  assert.equal(values.has(STORE_KEY), false);
  assertLegacyPresent();
  assert.equal(operations.some((item) => item.operation === 'remove' && [CAREER_KEY, WORKSPACE_KEY].includes(item.key)), false);
});

test('a successful write with mismatched readback is not allowed to clean legacy data', async () => {
  reset();
  seedLegacy();
  wrongReadbackCount = -1;

  await assert.rejects(storage.loadState(), /could not be verified/i);
  assertLegacyPresent();
  assert.equal(values.has(STORE_KEY), false);
  assert.equal(operations.some((item) => item.operation === 'remove' && [CAREER_KEY, WORKSPACE_KEY].includes(item.key)), false);

  assert.equal((await storage.loadState()).profile.targetRole, 'Legacy target role');
  assertLegacyAbsent();
});

test('a legacy read interruption writes nothing and retry reads both original values', async () => {
  reset();
  const career = legacyCareer('Read-retry role');
  const workspace = legacyWorkspace('Read-retry CV');
  seedLegacy(career, workspace);
  failReadKey = WORKSPACE_KEY;

  await assert.rejects(storage.loadState(), /simulated read failure/);
  assertLegacyPresent();
  assert.equal(values.has(STORE_KEY), false);
  assert.equal(operations.some((item) => item.operation === 'set'), false);

  assert.equal((await storage.loadState()).profile.targetRole, 'Read-retry role');
  assert.equal(JSON.parse(values.get(STORE_KEY)).workspace.cvText, 'Read-retry CV');
  assertLegacyAbsent();
});

test('a malformed legacy source is preserved while the other valid source is merged', async () => {
  reset();
  values.set(CAREER_KEY, JSON.stringify(legacyCareer('Valid career source')));
  values.set(WORKSPACE_KEY, '{malformed workspace source');

  assert.equal((await storage.loadState()).profile.targetRole, 'Valid career source');
  assert.equal(JSON.parse(values.get(STORE_KEY)).workspace.cvText, domain.initialWorkspaceState.cvText);
  assert.equal(values.get(WORKSPACE_KEY), '{malformed workspace source');
  assert.ok(values.has(`${WORKSPACE_KEY}.recovery`));
  assert.equal(values.has(CAREER_KEY), true);
});

test('a single present legacy key merges with defaults and is deleted after verification', async () => {
  reset();
  values.set(CAREER_KEY, JSON.stringify(legacyCareer('Career-only source')));

  assert.equal((await storage.loadState()).profile.targetRole, 'Career-only source');
  assert.equal(JSON.parse(values.get(STORE_KEY)).workspace.cvText, domain.initialWorkspaceState.cvText);
  assert.equal(values.has(CAREER_KEY), false);
  assert.equal(values.has(WORKSPACE_KEY), false);
});

test('cleanup interrupted after the verified write is retried from the new record on next open', async () => {
  reset();
  seedLegacy();
  failRemoveKey = CAREER_KEY;

  await assert.rejects(storage.loadState(), /simulated cleanup failure/);
  assert.ok(values.has(STORE_KEY));
  assertLegacyPresent();
  const verifiedRecord = values.get(STORE_KEY);

  assert.equal((await storage.loadWorkspaceState()).cvText, 'Fictional legacy CV text');
  assert.equal(values.get(STORE_KEY), verifiedRecord);
  assertLegacyAbsent();
  const secondSet = operations.filter((item) => item.operation === 'set' && item.key === STORE_KEY);
  assert.equal(secondSet.length, 1);
});

test('cleanup retry removes only the remaining legacy key after a partial cleanup', async () => {
  reset();
  seedLegacy();
  failRemoveKey = WORKSPACE_KEY;

  await assert.rejects(storage.loadState(), /simulated cleanup failure/);
  assert.equal(values.has(CAREER_KEY), false);
  assert.equal(values.has(WORKSPACE_KEY), true);
  assert.ok(values.has(STORE_KEY));

  await storage.loadState();
  assert.equal(values.has(CAREER_KEY), false);
  assert.equal(values.has(WORKSPACE_KEY), false);
});

test('a fresh module instance can close-then-retry after a mid-write interruption', async () => {
  reset();
  seedLegacy(legacyCareer('Close-and-retry role'), legacyWorkspace('Close-and-retry CV'));
  failWriteKey = STORE_KEY;
  partialWriteValue = '{interrupted write';

  await assert.rejects(storage.loadState(), /simulated write failure/);
  assertLegacyPresent();

  const reopenedStorage = await createStorage('simulated-process-reopen');
  assert.equal((await reopenedStorage.loadState()).profile.targetRole, 'Close-and-retry role');
  assert.equal(JSON.parse(values.get(STORE_KEY)).workspace.cvText, 'Close-and-retry CV');
  assertLegacyAbsent();
});

test('concurrent direct career and workspace saves serialize without losing either update', async () => {
  reset();
  delayStoreWrites = true;
  const career = legacyCareer('Concurrent career save');
  const workspace = legacyWorkspace('Concurrent workspace save');

  await Promise.all([storage.saveState(career), storage.saveWorkspaceState(workspace)]);
  const record = JSON.parse(values.get(STORE_KEY));
  assert.equal(record.career.profile.targetRole, 'Concurrent career save');
  assert.equal(record.workspace.cvText, 'Concurrent workspace save');
});

test('a partial autosave failure rolls back the prior verified combined record', async () => {
  reset();
  const previousCareer = legacyCareer('Previously saved role');
  const previousWorkspace = legacyWorkspace('Previously saved CV');
  seedCurrentRecord(previousCareer, previousWorkspace);
  const previousRaw = values.get(STORE_KEY);
  failWriteKey = STORE_KEY;
  partialWriteValue = '{partial autosave';

  await assert.rejects(storage.saveState(legacyCareer('New role')), /simulated write failure/);
  assert.equal(values.get(STORE_KEY), previousRaw);
  assert.equal(JSON.parse(values.get(STORE_KEY)).career.profile.targetRole, 'Previously saved role');
});

test('a silent rollback write mismatch snapshots the previous raw record and reports failure', async () => {
  reset();
  seedCurrentRecord(legacyCareer('Prior raw career'), legacyWorkspace('Prior raw CV'));
  const previousRaw = values.get(STORE_KEY);
  failWriteKey = STORE_KEY;
  partialWriteValue = '{partial new record';
  silentRollbackWriteKey = STORE_KEY;
  silentRollbackValue = 'silently corrupted rollback';

  await assert.rejects(
    storage.saveLocalState(legacyCareer('New career'), legacyWorkspace('New CV')),
    /rollback could not be verified/i,
  );
  assert.equal(values.get(STORE_KEY), 'silently corrupted rollback');
  assert.equal(JSON.parse(values.get(`${STORE_KEY}.recovery`)).raw, previousRaw);
});

test('a no-op removal during rollback with no prior record is detected', async () => {
  reset();
  failWriteKey = STORE_KEY;
  partialWriteValue = '{partial first record';
  silentRemoveKey = STORE_KEY;

  await assert.rejects(
    storage.saveLocalState(legacyCareer('New career'), legacyWorkspace('New CV')),
    /rollback could not be verified/i,
  );
  assert.equal(values.get(STORE_KEY), '{partial first record');
  assert.equal(values.has(`${STORE_KEY}.recovery`), false);
});

test('coordinator failure preserves both prior values and retry commits the latest pair in one verified record', async () => {
  reset();
  const previousCareer = legacyCareer('Previous career');
  const previousWorkspace = legacyWorkspace('Previous workspace');
  seedCurrentRecord(previousCareer, previousWorkspace);
  const previousRaw = values.get(STORE_KEY);
  const statuses = [];
  const calls = [];
  const coordinator = saveCoordinator.createLocalSaveCoordinator(async (career, workspace) => {
    calls.push([career.profile.targetRole, workspace.cvText]);
    await storage.saveLocalState(career, workspace);
  }, (value) => statuses.push(value));
  failWriteKey = STORE_KEY;
  partialWriteValue = '{partial combined coordinator write';

  const failed = await coordinator.persist(legacyCareer('Failed career update'), legacyWorkspace('Failed workspace update'));
  assert.equal(failed, false);
  assert.equal(statuses.at(-1), 'failed');
  assert.equal(values.get(STORE_KEY), previousRaw);
  assert.equal(JSON.parse(values.get(STORE_KEY)).career.profile.targetRole, 'Previous career');
  assert.equal(JSON.parse(values.get(STORE_KEY)).workspace.cvText, 'Previous workspace');
  assert.deepEqual(calls, [['Failed career update', 'Failed workspace update']]);

  const saved = await coordinator.persist(legacyCareer('Latest career update'), legacyWorkspace('Latest workspace update'));
  assert.equal(saved, true);
  assert.equal(statuses.at(-1), 'saved');
  const finalRecord = JSON.parse(values.get(STORE_KEY));
  assert.equal(finalRecord.career.profile.targetRole, 'Latest career update');
  assert.equal(finalRecord.workspace.cvText, 'Latest workspace update');
  assert.deepEqual(calls, [
    ['Failed career update', 'Failed workspace update'],
    ['Latest career update', 'Latest workspace update'],
  ]);
  const recordWrites = operations.reduce((indexes, item, index) => {
    if (item.operation === 'set' && item.key === STORE_KEY) indexes.push(index);
    return indexes;
  }, []);
  assert.equal(recordWrites.length, 3); // failed attempt, rollback, then one retry write
  assert.ok(operations.slice(recordWrites.at(-1) + 1).some((item) => item.operation === 'get' && item.key === STORE_KEY));
});

test('manual backup restore verifies one record and preserves old data after a failed write', async () => {
  reset();
  const oldCareer = legacyCareer('Before restore');
  const oldWorkspace = legacyWorkspace('Before restore CV');
  seedCurrentRecord(oldCareer, oldWorkspace);
  seedLegacy(oldCareer, oldWorkspace);
  const restoredCareer = { ...domain.initialState, profile: { ...domain.initialState.profile, targetRole: 'Restored backup role' } };
  const restoredWorkspace = { ...domain.initialWorkspaceState, cvText: 'Restored backup CV', cvFileName: 'restored.txt' };
  const backupRaw = backup.createLocalBackup(restoredCareer, restoredWorkspace, '2026-10-31T12:00:00.000Z');
  const beforeRestore = values.get(STORE_KEY);
  failWriteKey = STORE_KEY;
  partialWriteValue = '{partial restore record';

  await assert.rejects(storage.restoreLocalBackup(backupRaw), /simulated write failure/);
  assert.equal(values.get(STORE_KEY), beforeRestore);
  assertLegacyPresent();

  const result = await storage.restoreLocalBackup(backupRaw);
  assert.equal(result.career.profile.targetRole, 'Restored backup role');
  const finalRecord = JSON.parse(values.get(STORE_KEY));
  assert.equal(finalRecord.career.profile.targetRole, 'Restored backup role');
  assert.equal(finalRecord.workspace.cvText, 'Restored backup CV');
  assertLegacyAbsent();
});
