import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

function compiledUrl(relativePath, replacements = []) {
  let source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.replace(from, to);
  return moduleUrl(source);
}

const domainUrl = compiledUrl('../src/domain.ts');
const requirementsUrl = compiledUrl('../src/requirementCoverage.ts');
const materialsUrl = compiledUrl('../src/applicationMaterials.ts', [["from './requirementCoverage'", `from '${requirementsUrl}'`]]);
const applicationUrl = compiledUrl('../src/application.ts', [
  ["from './requirementCoverage'", `from '${requirementsUrl}'`],
  ["from './applicationMaterials'", `from '${materialsUrl}'`],
]);
const evidenceUrl = compiledUrl('../src/evidence.ts');
const opportunitiesUrl = compiledUrl('../src/opportunities.ts');
const backupUrl = compiledUrl('../src/localBackup.ts', [
  ["from './application'", `from '${applicationUrl}'`],
  ["from './evidence'", `from '${evidenceUrl}'`],
  ["from './opportunities'", `from '${opportunitiesUrl}'`],
]);
const storageUrl = compiledUrl('../src/storage.ts', [
  ["import AsyncStorage from '@react-native-async-storage/async-storage';", 'const AsyncStorage = globalThis.__careerFlowStorage;'],
  ["from './domain'", `from '${domainUrl}'`],
  ["from './application'", `from '${applicationUrl}'`],
  ["from './evidence'", `from '${evidenceUrl}'`],
  ["from './localBackup'", `from '${backupUrl}'`],
  ["from './opportunities'", `from '${opportunitiesUrl}'`],
]);

const values = new Map();
globalThis.__careerFlowStorage = {
  getItem: async (key) => values.get(key) ?? null,
  setItem: async (key, value) => { values.set(key, value); },
  removeItem: async (key) => { values.delete(key); },
};

const domain = await import(domainUrl);
const backupHelpers = await import(backupUrl);
const storage = await import(storageUrl);
const storeKey = 'careerflow.mobile.record.v1';
const careerKey = 'careerflow.mobile.state.v1';
const workspaceKey = 'careerflow.mobile.workspace.v1';
const opportunity = {
  id: 'opportunity-1',
  company: 'Fictional studio',
  role: 'Sample coordinator',
  location: 'Harbor Glen',
  type: 'Hybrid',
  summary: 'A made-up role for a local storage test.',
  keywords: ['Project coordination', 'clear writing'],
  createdAt: '2026-10-28T09:00:00.000Z',
  updatedAt: '2026-10-28T09:00:00.000Z',
};

test('persists and reloads candidate opportunities in the combined version-1 record', async () => {
  values.clear();
  const state = { ...domain.initialState, opportunities: [opportunity] };
  await storage.saveState(state);
  assert.deepEqual(JSON.parse(values.get(storeKey)).career.opportunities, [opportunity]);
  assert.deepEqual(Object.keys(JSON.parse(values.get(storeKey))).sort(), ['career', 'format', 'version', 'workspace']);
  assert.deepEqual((await storage.loadState()).opportunities, [opportunity]);
});

test('surfaces a failed career-state write instead of reporting a successful save', async () => {
  values.clear();
  const originalSetItem = globalThis.__careerFlowStorage.setItem;
  globalThis.__careerFlowStorage.setItem = async () => { throw new Error('simulated storage full'); };

  try {
    await assert.rejects(storage.saveState(domain.initialState), /simulated storage full/);
    assert.equal(values.has(storeKey), false);
  } finally {
    globalThis.__careerFlowStorage.setItem = originalSetItem;
  }
});

test('surfaces a failed workspace-state write instead of swallowing it', async () => {
  const originalSetItem = globalThis.__careerFlowStorage.setItem;
  globalThis.__careerFlowStorage.setItem = async (key, value) => {
    if (key === storeKey) throw new Error('simulated workspace storage failure');
    return originalSetItem(key, value);
  };

  try {
    await assert.rejects(storage.saveWorkspaceState(domain.initialWorkspaceState), /simulated workspace storage failure/);
  } finally {
    globalThis.__careerFlowStorage.setItem = originalSetItem;
  }
});

test('recovers version-1 saved state written before the opportunity collection existed', async () => {
  values.clear();
  const olderState = { ...domain.initialState };
  delete olderState.opportunities;
  values.set(careerKey, JSON.stringify(olderState));
  const recovered = await storage.loadState();
  assert.deepEqual(recovered.opportunities, []);
  assert.equal(recovered.version, 1);
});

test('restores opportunity-bearing backups and normalizes older version-1 backups in one record', async () => {
  values.clear();
  const currentCareer = { ...domain.initialState, opportunities: [opportunity] };
  const currentRaw = backupHelpers.createLocalBackup(currentCareer, domain.initialWorkspaceState, '2026-10-28T10:00:00.000Z');
  const restored = await storage.restoreLocalBackup(currentRaw);
  assert.deepEqual(restored.career.opportunities, [opportunity]);
  assert.deepEqual((await storage.loadState()).opportunities, [opportunity]);
  assert.deepEqual(JSON.parse(values.get(storeKey)).career.opportunities, [opportunity]);
  assert.equal(values.has(careerKey), false);
  assert.equal(values.has(workspaceKey), false);

  const legacy = JSON.parse(currentRaw);
  delete legacy.career.opportunities;
  const legacyRestored = await storage.restoreLocalBackup(JSON.stringify(legacy));
  assert.deepEqual(legacyRestored.career.opportunities, []);
  assert.deepEqual((await storage.loadState()).opportunities, []);
  assert.equal(values.has(storeKey), true);
  assert.equal(values.has(careerKey), false);
  assert.equal(values.has(workspaceKey), false);
});
