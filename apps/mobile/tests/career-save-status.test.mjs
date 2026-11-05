import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const helperSource = readFileSync(new URL('../src/careerSaveStatus.ts', import.meta.url), 'utf8');
const helperCompiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const status = await import(`data:text/javascript;base64,${Buffer.from(helperCompiled).toString('base64')}`);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('shows success text only after persistence succeeds and explicit failure text when it does not', () => {
  assert.equal(status.careerSaveNotice('saving', 'Local opportunity saved.'), 'Saving changes to this phone…');
  assert.match(status.careerSaveNotice('failed', 'Local opportunity saved.'), /^Not saved to this phone\./);
  assert.equal(status.careerSaveNotice('saved', 'Local opportunity saved.'), 'Local opportunity saved.');

  const context = readFileSync(new URL('../src/CareerContext.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../src/screens/OpportunitySearchScreen.tsx', import.meta.url), 'utf8');
  const banner = readFileSync(new URL('../src/CareerSaveBanner.tsx', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
  assert.match(context, /createLocalSaveCoordinator\(saveLocalState, setCareerSaveStatus\)/);
  assert.match(context, /persistLocalState\(state, workspace\)/);
  assert.match(context, /saveCoordinator\.markPending\(\);\s*setStateValue\(nextState\)/);
  assert.match(context, /saveCoordinator\.markPending\(\);\s*setWorkspaceValue\(nextWorkspace\)/);
  assert.match(helperSource, /saveLocalState\(career, workspace\)/);
  assert.doesNotMatch(helperSource, /Promise\.allSettled/);
  assert.match(helperSource, /if \(request !== generation\) return false/);
  assert.match(layout, /<CareerProvider>[\s\S]*<CareerAppShell \/>/);
  assert.match(layout, /function CareerAppShell\(\)[\s\S]*<CareerSaveBanner \/>[\s\S]*<Stack/);
  assert.match(banner, /careerSaveNotice\(careerSaveStatus\)/);
  assert.match(banner, /careerSaveStatus === 'failed'/);
  assert.match(banner, /void retryCareerSave\(\)/);
  assert.match(banner, /if \(!message\) return null/);
  assert.match(screen, /careerSaveStatus === 'saved' \? notice : ''/);
  assert.doesNotMatch(screen, /Not saved to this phone|Retry save/);
  assert.doesNotMatch(screen, /candidate-entered entries saved on this phone/);
});

function assertStatusGatedSuccessNotice(source, messages) {
  assert.match(source, /const successToast = careerSaveStatus === 'saved' \? notice : '';/);
  assert.match(source, /\{successToast \? <Text accessibilityLiveRegion="polite"/);
  assert.match(source, />\{successToast\}<\/Text> : null\}/);
  for (const message of messages) {
    assert.ok(source.includes(`setNotice('${message}`), `expected the status-gated notice to cover: ${message}`);
    assert.ok(!source.includes(`Alert.alert('${message}`), `success notice must not alert before persistence: ${message}`);
  }
}

test('ProfileWorkspaceScreen gates local-save and CV-import success notices on committed persistence', () => {
  const screen = readFileSync(new URL('../src/screens/ProfileWorkspaceScreen.tsx', import.meta.url), 'utf8');
  assertStatusGatedSuccessNotice(screen, ['Saved on this phone.', 'CV text imported.']);
});

test('ApplicationsScreen gates save, delete, evidence-link, and draft success notices on committed persistence', () => {
  const screen = readFileSync(new URL('../src/screens/ApplicationsScreen.tsx', import.meta.url), 'utf8');
  assertStatusGatedSuccessNotice(screen, ['Saved on this phone.', 'Record deleted.', 'Evidence linked.', 'Draft saved on this phone.']);
});

test('EvidenceScreen gates evidence-save success notices on committed persistence', () => {
  const screen = readFileSync(new URL('../src/screens/EvidenceScreen.tsx', import.meta.url), 'utf8');
  assertStatusGatedSuccessNotice(screen, ['Saved on this phone.']);
});

test('TasksScreen gates create and update success notices on committed persistence', () => {
  const screen = readFileSync(new URL('../src/app/(tabs)/tasks.tsx', import.meta.url), 'utf8');
  assert.match(screen, /const successToast = careerSaveStatus === 'saved' \? notice : '';/);
  assert.match(screen, /\{successToast \? <Text accessibilityLiveRegion="polite"[\s\S]*?\{successToast\}<\/Text> : null\}/);
  assert.match(screen, /addTask\(title\);[\s\S]*?setNotice\('Task saved on this phone\.'\);/);
  assert.match(screen, /const updateTaskAndNotify = \(id: string, patch: Parameters<typeof updateTask>\[1\]\) => \{\s*updateTask\(id, patch\);\s*setNotice\('Task updated and saved on this phone\.'\);/);
  assert.equal((screen.match(/updateTaskAndNotify\(task\.id, \{ status:/g) ?? []).length, 2);
});

test('reports failed atomic persistence and retries both latest career and workspace snapshots', async () => {
  const statuses = [];
  const writes = [];
  let persisted = {
    career: { revision: 'previous-career' },
    workspace: { revision: 'previous-workspace' },
  };
  let failOnce = true;
  const coordinator = status.createLocalSaveCoordinator(
    async (career, workspace) => {
      writes.push([career.revision, workspace.revision]);
      if (failOnce) {
        failOnce = false;
        throw new Error('combined storage write unavailable');
      }
      persisted = { career, workspace };
    },
    (value) => statuses.push(value),
  );

  const firstSucceeded = await coordinator.persist({ revision: 'old-career' }, { revision: 'old-workspace' });
  assert.equal(firstSucceeded, false);
  assert.equal(statuses.at(-1), 'failed');
  assert.match(status.careerSaveNotice(statuses.at(-1)), /^Not saved to this phone\./);
  assert.deepEqual(persisted, {
    career: { revision: 'previous-career' },
    workspace: { revision: 'previous-workspace' },
  });

  const retrySucceeded = await coordinator.persist({ revision: 'latest-career' }, { revision: 'latest-workspace' });
  assert.equal(retrySucceeded, true);
  assert.deepEqual(writes, [
    ['old-career', 'old-workspace'],
    ['latest-career', 'latest-workspace'],
  ]);
  assert.deepEqual(persisted, {
    career: { revision: 'latest-career' },
    workspace: { revision: 'latest-workspace' },
  });
  assert.equal(statuses.at(-1), 'saved');
});

test('reports failure when the combined local write rejects', async () => {
  const statuses = [];
  const coordinator = status.createLocalSaveCoordinator(
    async () => { throw new Error('combined storage unavailable'); },
    (value) => statuses.push(value),
  );

  assert.equal(await coordinator.persist({ revision: 'career' }, { revision: 'workspace' }), false);
  assert.equal(statuses.at(-1), 'failed');
  assert.match(status.careerSaveNotice(statuses.at(-1)), /^Not saved to this phone\./);
});

test('a newer save supersedes an in-flight save without allowing the old completion to mark state saved', async () => {
  const statuses = [];
  const writesStarted = [];
  const oldWrite = deferred();
  const newWrite = deferred();
  const coordinator = status.createLocalSaveCoordinator(
    (career, workspace) => {
      writesStarted.push(`${career.revision}:${workspace.revision}`);
      return career.revision === 'old' ? oldWrite.promise : newWrite.promise;
    },
    (value) => statuses.push(value),
  );

  const oldSave = coordinator.persist({ revision: 'old' }, { revision: 'old' });
  await new Promise(setImmediate);
  assert.deepEqual(writesStarted, ['old:old']);
  coordinator.markPending();
  const newSave = coordinator.persist({ revision: 'new' }, { revision: 'new' });
  await new Promise(setImmediate);
  assert.deepEqual(writesStarted, ['old:old']);

  oldWrite.resolve();
  assert.equal(await oldSave, false);
  assert.equal(statuses.at(-1), 'saving');
  await new Promise(setImmediate);
  assert.deepEqual(writesStarted, ['old:old', 'new:new']);

  newWrite.resolve();
  assert.equal(await newSave, true);
  assert.equal(statuses.at(-1), 'saved');
});
