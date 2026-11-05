import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const rootRequire = createRequire(new URL('../package.json', import.meta.url));
const React = rootRequire('react');
const { createRoot } = rootRequire('react-dom/client');
const { act } = React;
const { JSDOM } = rootRequire('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function moduleUrl(source, options = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      ...options,
    },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

function compiledUrl(relativePath, replacements = [], options = {}) {
  let source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.split(from).join(to);
  return moduleUrl(source, options);
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
const opportunitiesUrl = compiledUrl('../src/opportunities.ts');
const backupUrl = compiledUrl('../src/localBackup.ts', [
  ["from './application'", `from '${applicationUrl}'`],
  ["from './evidence'", `from '${evidenceUrl}'`],
  ["from './opportunities'", `from '${opportunitiesUrl}'`],
]);
const storageValues = new Map();
const readFailures = new Map();
const writes = [];
globalThis.__careerFlowStorage = {
  async getItem(key) {
    const remaining = readFailures.get(key) ?? 0;
    if (remaining > 0) {
      readFailures.set(key, remaining - 1);
      throw new Error(`simulated read failure: ${key}`);
    }
    return storageValues.get(key) ?? null;
  },
  async setItem(key, value) {
    writes.push({ key, value });
    storageValues.set(key, value);
  },
  async removeItem(key) {
    storageValues.delete(key);
  },
};
const storageUrl = compiledUrl('../src/storage.ts', [
  [
    "import AsyncStorage from '@react-native-async-storage/async-storage';",
    'const AsyncStorage = globalThis.__careerFlowStorage;',
  ],
  ["from './domain'", `from '${domainUrl}'`],
  ["from './application'", `from '${applicationUrl}'`],
  ["from './evidence'", `from '${evidenceUrl}'`],
  ["from './localBackup'", `from '${backupUrl}'`],
  ["from './opportunities'", `from '${opportunitiesUrl}'`],
]);
const saveStatusUrl = compiledUrl('../src/careerSaveStatus.ts');
const apiUrl = moduleUrl(`
  export const apiConfigured = () => false;
  export const currentUser = async () => null;
  export const workspaces = async () => [];
  export const profileVersions = async () => [];
  export const applications = async () => [];
  export const signIn = async () => { throw new Error('API disabled in local hydration test'); };
  export const signUp = async () => { throw new Error('API disabled in local hydration test'); };
  export const signOut = async () => {};
  export const updateSettings = async () => {};
  export const createProfileVersion = async () => ({});
  export const createApplication = async () => ({});
  export const updateApplicationStage = async () => ({});
`);
const reactInteropUrl = moduleUrl(`
  import React from '${pathToFileURL(rootRequire.resolve('react')).href}';
  export default React;
  export const createContext = React.createContext;
  export const useCallback = React.useCallback;
  export const useContext = React.useContext;
  export const useEffect = React.useEffect;
  export const useRef = React.useRef;
  export const useState = React.useState;
`);
const contextUrl = compiledUrl(
  '../src/CareerContext.tsx',
  [
    ["from 'react'", `from '${reactInteropUrl}'`],
    ["from './domain'", `from '${domainUrl}'`],
    ["from './application'", `from '${applicationUrl}'`],
    ["from './opportunities'", `from '${opportunitiesUrl}'`],
    ["from './requirementCoverage'", `from '${requirementUrl}'`],
    ["from './storage'", `from '${storageUrl}'`],
    ["from './careerSaveStatus'", `from '${saveStatusUrl}'`],
    ["from './api'", `from '${apiUrl}'`],
  ],
  { jsx: ts.JsxEmit.React },
);

const domain = await import(domainUrl);
const storage = await import(storageUrl);
const career = await import(contextUrl);
const careerKey = 'careerflow.mobile.state.v1';
const careerRecoveryKey = `${careerKey}.recovery`;
const workspaceKey = 'careerflow.mobile.workspace.v1';
const workspaceRecoveryKey = `${workspaceKey}.recovery`;
const storeKey = 'careerflow.mobile.record.v1';
const storeRecoveryKey = `${storeKey}.recovery`;

function prepareSavedRecords() {
  storageValues.clear();
  readFailures.clear();
  writes.length = 0;
  const savedCareer = {
    ...domain.initialState,
    profile: {
      ...domain.initialState.profile,
      targetRole: 'Saved role from this phone',
    },
  };
  const savedWorkspace = {
    ...domain.initialWorkspaceState,
    cvFileName: 'saved-cv.txt',
  };
  storageValues.set(careerKey, JSON.stringify(savedCareer));
  storageValues.set(workspaceKey, JSON.stringify(savedWorkspace));
  return { savedCareer, savedWorkspace };
}

async function flushReact() {
  await new Promise(setImmediate);
}

test('both native loaders reject actual store read failures instead of returning defaults', async () => {
  prepareSavedRecords();
  readFailures.set(careerKey, 1);
  await assert.rejects(storage.loadState(), /simulated read failure/);
  readFailures.set(workspaceKey, 1);
  await assert.rejects(storage.loadWorkspaceState(), /simulated read failure/);
  assert.deepEqual(writes, []);
});

test('malformed saved records still return recovered defaults and preserve recovery snapshots', async () => {
  storageValues.clear();
  writes.length = 0;
  storageValues.set(careerKey, '{malformed career');
  storageValues.set(workspaceKey, '{malformed workspace');

  const recoveredCareer = await storage.loadState();
  const recoveredWorkspace = await storage.loadWorkspaceState();

  assert.deepEqual(recoveredCareer, domain.initialState);
  assert.deepEqual(recoveredWorkspace, domain.initialWorkspaceState);
  assert.equal(
    JSON.parse(storageValues.get(careerRecoveryKey)).raw,
    '{malformed career',
  );
  assert.equal(
    JSON.parse(storageValues.get(workspaceRecoveryKey)).raw,
    '{malformed workspace',
  );
});

test('combined-record recovery snapshots advance to salvageable values without losing them to later malformed data', async () => {
  storageValues.clear();
  writes.length = 0;
  storageValues.set(storeKey, '{first malformed record');
  await storage.loadState();
  await storage.loadWorkspaceState();

  const latestCareerTask = {
    id: 'latest-recoverable-task',
    title: 'Recoverable task',
    status: 'todo',
    priority: 'medium',
    createdAt: '2026-10-31T00:00:00.000Z',
    updatedAt: '2026-10-31T00:00:00.000Z',
  };
  const recoverableRecordRaw = JSON.stringify({
    format: 'careerflow-mobile-local-store',
    version: 1,
    career: {
      ...domain.initialState,
      tasks: [...domain.initialState.tasks, latestCareerTask],
      profile: { ...domain.initialState.profile, targetRole: null },
    },
    workspace: {
      ...domain.initialWorkspaceState,
      cvFileName: 'latest-recoverable-cv.txt',
      cvText: null,
    },
  });
  storageValues.set(storeKey, recoverableRecordRaw);

  const recoveredCareer = await storage.loadState();
  const recoveredWorkspace = await storage.loadWorkspaceState();
  assert.ok(
    recoveredCareer.tasks.some((task) => task.id === latestCareerTask.id),
  );
  assert.equal(recoveredWorkspace.cvFileName, 'latest-recoverable-cv.txt');
  assert.equal(
    JSON.parse(storageValues.get(storeRecoveryKey)).raw,
    recoverableRecordRaw,
  );

  storageValues.set(storeKey, '{later malformed record');
  await storage.loadState();
  assert.equal(
    JSON.parse(storageValues.get(storeRecoveryKey)).raw,
    recoverableRecordRaw,
  );
});

test('combined records with no salvageable fields preserve existing recovery snapshots', async () => {
  storageValues.clear();
  writes.length = 0;
  const previousSnapshot = JSON.stringify({
    capturedAt: '2026-10-30T12:00:00.000Z',
    raw: 'older combined snapshot',
  });
  storageValues.set(storeRecoveryKey, previousSnapshot);
  storageValues.set(
    storeKey,
    JSON.stringify({
      format: 'careerflow-mobile-local-store',
      version: 1,
      career: { version: 1, unknown: 'x' },
      workspace: { version: 1, unknown: 'x' },
    }),
  );

  const recoveredCareer = await storage.loadState();
  const recoveredWorkspace = await storage.loadWorkspaceState();

  assert.deepEqual(recoveredCareer, domain.initialState);
  assert.deepEqual(recoveredWorkspace, domain.initialWorkspaceState);
  assert.equal(storageValues.get(storeRecoveryKey), previousSnapshot);
  assert.deepEqual(writes, []);
});

test('an empty recognized career collection counts as meaningful salvageable data', async () => {
  storageValues.clear();
  writes.length = 0;
  const emptyRecordRaw = JSON.stringify({
    format: 'careerflow-mobile-local-store',
    version: 1,
    career: { version: 1, tasks: [] },
    workspace: domain.initialWorkspaceState,
  });
  storageValues.set(storeKey, emptyRecordRaw);

  const recoveredCareer = await storage.loadState();

  assert.deepEqual(recoveredCareer.tasks, []);
  assert.equal(
    JSON.parse(storageValues.get(storeRecoveryKey)).raw,
    emptyRecordRaw,
  );
});

test('empty persisted strings are preserved in legacy recovery snapshots without deleting either key', async () => {
  storageValues.clear();
  writes.length = 0;
  storageValues.set(careerKey, '');
  storageValues.set(workspaceKey, '');

  const recoveredCareer = await storage.loadState();
  const recoveredWorkspace = await storage.loadWorkspaceState();

  assert.deepEqual(recoveredCareer, domain.initialState);
  assert.deepEqual(recoveredWorkspace, domain.initialWorkspaceState);
  assert.equal(JSON.parse(storageValues.get(careerRecoveryKey)).raw, '');
  assert.equal(JSON.parse(storageValues.get(workspaceRecoveryKey)).raw, '');
  assert.equal(storageValues.has(careerKey), true);
  assert.equal(storageValues.has(workspaceKey), true);
  assert.equal(JSON.parse(storageValues.get(storeKey)).career.version, 1);
});

test('failed hydration in either store blocks saves and retry loads existing data before normal persistence resumes', async (t) => {
  for (const failedKey of [careerKey, workspaceKey]) {
    await t.test(`${failedKey} failure`, async () => {
      const { savedCareer, savedWorkspace } = prepareSavedRecords();
      readFailures.set(failedKey, 1);
      let observed;
      function Probe() {
        observed = career.useCareer();
        return React.createElement(
          'div',
          null,
          observed.loadFailed ? 'failed' : observed.ready ? 'ready' : 'loading',
        );
      }

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      try {
        await act(async () => {
          root.render(
            React.createElement(
              career.CareerProvider,
              null,
              React.createElement(Probe),
            ),
          );
          await flushReact();
        });

        assert.equal(observed.ready, false);
        assert.equal(observed.loadFailed, true);
        assert.deepEqual(writes, []);
        assert.equal(storageValues.get(careerKey), JSON.stringify(savedCareer));
        assert.equal(
          storageValues.get(workspaceKey),
          JSON.stringify(savedWorkspace),
        );

        const latestCareer = {
          ...savedCareer,
          profile: {
            ...savedCareer.profile,
            targetRole: 'Latest role saved during retry',
          },
        };
        const latestWorkspace = {
          ...savedWorkspace,
          cvFileName: 'latest-cv.txt',
        };
        storageValues.set(careerKey, JSON.stringify(latestCareer));
        storageValues.set(workspaceKey, JSON.stringify(latestWorkspace));

        await act(async () => {
          assert.equal(await observed.retryLoad(), true);
          await flushReact();
        });
        await act(async () => {
          await flushReact();
        });

        assert.equal(observed.ready, true);
        assert.equal(observed.loadFailed, false);
        assert.equal(
          observed.state.profile.targetRole,
          'Latest role saved during retry',
        );
        assert.equal(observed.workspace.cvFileName, 'latest-cv.txt');
        assert.deepEqual(
          new Set(writes.map((write) => write.key)),
          new Set([storeKey]),
        );
        assert.equal(
          JSON.parse(storageValues.get(storeKey)).career.profile.targetRole,
          'Latest role saved during retry',
        );
        assert.equal(
          JSON.parse(storageValues.get(storeKey)).workspace.cvFileName,
          'latest-cv.txt',
        );
      } finally {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      }
    });
  }
});

test('the root layout exposes an accessible blocking load message and explicit retry', () => {
  const layout = readFileSync(
    new URL('../src/app/_layout.tsx', import.meta.url),
    'utf8',
  );
  const ui = readFileSync(new URL('../src/ui.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<Stack[\s\S]*\{!ready \?/);
  assert.match(
    layout,
    /accessibilityElementsHidden=\{!ready\}[\s\S]*importantForAccessibility=\{ready \? 'auto' : 'no-hide-descendants'\}/,
  );
  assert.match(
    layout,
    /accessibilityViewIsModal[\s\S]*importantForAccessibility="yes"[\s\S]*pointerEvents="auto"/,
  );
  assert.match(
    layout,
    /accessibilityRole="alert"[\s\S]*accessibilityLiveRegion="assertive"/,
  );
  assert.match(
    layout,
    /<Button onPress=\{\(\) => \{ void retryLoad\(\); \}\}>Retry loading<\/Button>/,
  );
  assert.match(ui, /accessibilityRole="button"/);
});
