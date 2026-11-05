import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guideSource = readFileSync(new URL('../src/guidance.ts', import.meta.url), 'utf8');
const guideScreenSource = readFileSync(new URL('../src/app/(tabs)/guide.tsx', import.meta.url), 'utf8');

test('exposes the mobile guide and its sections as screen-reader headings', () => {
  assert.match(guideScreenSource, /titleAccessibilityRole="header"/);
  assert.match(guideScreenSource, /<Notice title="START SAFELY" titleAccessibilityRole="header">/);
  assert.match(guideScreenSource, /<SectionTitle accessibilityRole="header">/);
});

test('starts with fictional, non-sensitive examples', () => {
  assert.match(guideSource, /fictional example projects and tasks/i);
  assert.match(guideSource, /profile starts blank/i);
  assert.match(guideSource, /avoid real or sensitive personal information/i);
});

test('documents only supported text CV import and manual LinkedIn capture', () => {
  assert.match(guideSource, /\.txt or Markdown \.md file/i);
  assert.match(guideSource, /PDF and Word text extraction.*not supported/i);
  assert.match(guideSource, /manually copy/i);
  assert.match(guideSource, /does not log in to, scrape, or send anything to LinkedIn/i);
});

test('documents candidate-edited materials drafts and their source/review boundaries', () => {
  assert.match(guideSource, /prepare and edit a local materials outline/i);
  assert.match(guideSource, /source IDs and dates visible/i);
  assert.match(guideSource, /Review every line/i);
  assert.match(guideSource, /does not invent facts, use live AI, score fit, or submit anything/i);
});

test('explains local storage, document export, and offline-only MEH', () => {
  assert.match(guideSource, /stored in this app on this phone/i);
  assert.match(guideSource, /Save\/share PDF opens the phone’s share sheet/i);
  assert.match(guideSource, /no network calls and does not use live AI/i);
  assert.match(guideSource, /not encrypted by CareerFlow, backed up, or synced/i);
});

test('explains supported preview paths and manual replacement-based recovery', () => {
  assert.match(guideSource, /targets iOS and Android through Expo Go, with Expo Web available as a browser preview/i);
  assert.match(guideSource, /owner-device acceptance is still outstanding/i);
  assert.match(guideSource, /replaces the current tracker and document workspace; it does not merge/i);
  assert.match(guideSource, /If local data is lost and no backup exists, CareerFlow cannot recover it/i);
  assert.match(guideScreenSource, /router\.push\('\/backup'\)/);
});

test('states unavailable product areas and keeps tutorials on the roadmap', () => {
  assert.match(guideSource, /no live AI, account sync, cloud backup, job search or matching, automatic applications, employer access, interview service, or payment feature/i);
  assert.match(guideSource, /Video tutorials are not included yet; they remain a roadmap item/i);
});
