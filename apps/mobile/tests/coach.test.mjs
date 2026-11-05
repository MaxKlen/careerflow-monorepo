import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const coachSource = readFileSync(new URL('../src/coach.ts', import.meta.url), 'utf8');
const coachUrl = `data:text/javascript;base64,${Buffer.from(ts.transpileModule(coachSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const { connectedCoach, offlineCoach } = await import(coachUrl);
const coachScreenSource = readFileSync(new URL('../src/app/(tabs)/coach.tsx', import.meta.url), 'utf8');

const syntheticState = {
  version: 1,
  profile: {
    name: 'Synthetic Candidate',
    headline: 'Synthetic headline',
    targetRole: 'Synthetic role',
    targetIndustry: 'Synthetic industry',
    summary: 'Synthetic summary',
    skills: 'Synthetic skills',
    goals: 'Synthetic goal',
  },
  tasks: [{
    id: 'synthetic-task',
    title: 'Synthetic task',
    notes: 'Synthetic task note',
    status: 'todo',
    priority: 'medium',
    dueDate: '2030-01-01',
    createdAt: '2030-01-01',
    updatedAt: '2030-01-01',
  }],
  milestones: [{ id: 'synthetic-milestone', name: 'Synthetic milestone', completed: false }],
  projects: [{ id: 'synthetic-project', name: 'NEVER_SEND_PROJECT', description: 'NEVER_SEND_PROJECT' }],
  applications: [{ id: 'synthetic-application', organization: 'NEVER_SEND_APPLICATION' }],
  evidenceItems: [{ id: 'synthetic-evidence', title: 'NEVER_SEND_EVIDENCE' }],
  opportunities: [{ id: 'synthetic-opportunity', summary: 'NEVER_SEND_OPPORTUNITY' }],
  workspace: { cvText: 'NEVER_SEND_CV', linkedIn: { about: 'NEVER_SEND_LINKEDIN' } },
};

function restoreEnvironment(previousEndpoint, previousFetch) {
  if (previousEndpoint === undefined) delete process.env.EXPO_PUBLIC_COACH_ENDPOINT;
  else process.env.EXPO_PUBLIC_COACH_ENDPOINT = previousEndpoint;
  globalThis.fetch = previousFetch;
}

test('an unset Coach endpoint makes no request and leaves the built-in result offline', async () => {
  const previousEndpoint = process.env.EXPO_PUBLIC_COACH_ENDPOINT;
  const previousFetch = globalThis.fetch;
  const calls = [];
  delete process.env.EXPO_PUBLIC_COACH_ENDPOINT;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error('unexpected network request');
  };

  try {
    assert.equal(await connectedCoach(syntheticState), null);
    assert.equal(offlineCoach(syntheticState).source, 'offline');
    assert.equal(calls.length, 0);
  } finally {
    restoreEnvironment(previousEndpoint, previousFetch);
  }
});

test('a configured Coach endpoint receives exactly profile, tasks, and milestones', async () => {
  const previousEndpoint = process.env.EXPO_PUBLIC_COACH_ENDPOINT;
  const previousFetch = globalThis.fetch;
  const endpoint = 'https://coach.example.test/v1/note';
  let request;
  process.env.EXPO_PUBLIC_COACH_ENDPOINT = endpoint;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return {
      ok: true,
      json: async () => ({ title: 'Synthetic note', body: 'Synthetic response', actions: ['Synthetic action'] }),
    };
  };

  try {
    const result = await connectedCoach(syntheticState);
    assert.equal(result?.source, 'connected');
    assert.equal(request.url, endpoint);
    assert.equal(request.options.method, 'POST');
    const payload = JSON.parse(request.options.body);
    assert.deepEqual(Object.keys(payload).sort(), ['milestones', 'profile', 'tasks']);
    assert.deepEqual(payload, {
      profile: syntheticState.profile,
      tasks: syntheticState.tasks,
      milestones: syntheticState.milestones,
    });
    assert.doesNotMatch(JSON.stringify(payload), /NEVER_SEND_/);
  } finally {
    restoreEnvironment(previousEndpoint, previousFetch);
  }
});

test('a configured Coach asks again on each button request before sharing once', () => {
  const handlerStart = coachScreenSource.indexOf('const requestCoachingNote = () => {');
  const handlerEnd = coachScreenSource.indexOf('\n  };', handlerStart);
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  const handler = coachScreenSource.slice(handlerStart, handlerEnd);

  assert.match(handler, /if \(offline\) \{\s*void run\(false\);\s*return;\s*\}\s*Alert\.alert\(/);
  assert.match(handler, /text: 'Use offline',[\s\S]*?onPress: \(\) => void run\(false\)/);
  assert.match(handler, /text: 'Share once',[\s\S]*?onPress: \(\) => void run\(true\)/);
  assert.match(coachScreenSource, /<Button onPress=\{requestCoachingNote\}/);
  assert.match(coachScreenSource, /Choosing “Share once” sends your career profile, task records[\s\S]*This choice applies only to this request\./);
});
