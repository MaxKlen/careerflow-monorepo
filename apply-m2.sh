#!/usr/bin/env bash
set -euo pipefail

[ -d apps/api ] || { echo "Run from careerflow-monorepo/ root."; exit 1; }

echo "== M2 target safety preflight =="
targets=(
  "packages/shared/src/contracts/cv.ts"
  "packages/core/src/cvParse.ts"
  "packages/core/src/linkedinSuggestions.ts"
  "apps/api/src/storage.ts"
  "apps/api/src/extractText.ts"
  "apps/api/src/routes/cv.ts"
  "apps/api/src/routes/linkedin.ts"
  "apps/web/src/app/(app)/cv/import/page.tsx"
  "apps/web/src/app/(app)/cv/import/[id]/page.tsx"
  "apps/web/src/app/(app)/linkedin/page.tsx"
  "apps/web/src/app/(app)/applications/[id]/ConfirmRequirement.tsx"
  "scripts/reset.sh"
  "TESTING.md"
)
for target in "${targets[@]}"; do
  [ ! -e "$target" ] || { echo "Refusing to overwrite existing M2 target: $target"; exit 1; }
done
[ ! -e .m2-mode ] || { echo "Refusing to overwrite existing .m2-mode"; exit 1; }
echo ""
echo "== Discovery =="
node <<'NODE'
const fs = require('fs');
const path = require('path');

const checks = [
  { file: 'apps/api/src/server.ts',                      probes: ['app.listen', "from '@fastify/cookie'", 'registerWorkspaces'], what: 'api server bootstrap' },
  { file: 'apps/api/src/routes/applications.ts',         probes: ['export async function registerApplications', 'applicationRequirements', 'requirementEvidenceLinks', 'ownedApplication', 'return reply.code(201).send({ link });'], what: 'applications routes' },
  { file: 'apps/api/src/env.ts',                         probes: ['SESSION_SECRET: z.string().min(32)', 'z.object'], what: 'env schema' },
  { file: 'packages/db/src/schema.ts',                   probes: ['requirementEvidenceLinks', 'sourceChangedAt'], what: 'db schema' },
  { file: 'apps/web/src/app/(app)/layout.tsx',           probes: ['<Link href="/documents"', 'className="app-nav"'], what: 'web nav layout' },
  { file: 'apps/web/src/app/(app)/applications/[id]/page.tsx', probes: ['StagePicker', 'requirements.map', '<span className="pill">{r.state}</span>'], what: 'application detail page' },
  { file: 'apps/web/next.config.mjs',                     probes: ['transpilePackages'], what: 'next config' },
  { file: 'apps/web/src/lib/api.ts',                     probes: ['export async function apiFetch', 'API_URL'], what: 'web api client' },
];

let bad = 0;
for (const c of checks) {
  if (!fs.existsSync(c.file)) { console.log(`  MISSING FILE: ${c.file} (${c.what})`); bad++; continue; }
  const src = fs.readFileSync(c.file, 'utf8');
  const missing = c.probes.filter(p => !src.includes(p));
  if (missing.length) { console.log(`  INCOMPLETE: ${c.file} — missing probes: ${missing.join(', ')}`); bad++; }
  else console.log(`  OK: ${c.file}`);
}

// Determine API base for the CV upload page.
const apiSrc = fs.readFileSync('apps/web/src/lib/api.ts', 'utf8');
const nextSrc = fs.readFileSync('apps/web/next.config.mjs', 'utf8');
const hasRewrite = /destination:\s*[`'"][^`'"]*:\s*\/?path|destination:.*API_URL/.test(nextSrc) || /rewrites\s*\(/.test(nextSrc) && nextSrc.includes('destination');
const apiUsesApiPrefix = /['"]\/api['"]/.test(apiSrc) || /BASE\s*=\s*isBrowser\s*\?\s*['"]\/api['"]/.test(apiSrc);
const apiUsesAbsolute = /BASE\s*=\s*isBrowser\s*\?\s*`\$\{.*\}`|NEXT_PUBLIC_API_URL|API_URL/.test(apiSrc);

const mode = hasRewrite || apiUsesApiPrefix ? 'proxy' : (apiUsesAbsolute ? 'absolute' : 'unknown');
console.log(`\nAPI base detection: ${mode} (rewrite=${hasRewrite}, apiPrefix=${apiUsesApiPrefix}, absolute=${apiUsesAbsolute})`);
fs.writeFileSync('.m2-mode', mode);

if (bad > 0) { console.log(`\nDiscovery failed. ${bad} file(s) incomplete. Fix the missing probes above and rerun.`); process.exit(1); }
console.log('\nDiscovery: all probes matched.');
NODE

MODE=$(cat .m2-mode)
[ "$MODE" = "unknown" ] && { echo "Cannot determine API base for browser → API calls. Set NEXT_PUBLIC_API_URL in .env or add a verified rewrite, then rerun."; exit 1; }

echo ""
echo "== M2 dependency add (authorized package only; discovery passed) =="
pnpm --filter @careerflow/api add '@fastify/multipart@^9.0.1'
node -e "require.resolve('@fastify/multipart', { paths: ['./apps/api'] })"
echo "deps OK"

# ============================================================
# NEW FILES (safe — target absence verified above)
# ============================================================

mkdir -p packages/shared/src/contracts packages/core/src
cat > packages/shared/src/contracts/cv.ts <<'EOF'
import { z } from 'zod';

const SECTION_KEYS = ['contact','summary','experience','education','skills','certifications','projects','languages','references','other'] as const;
export const SectionKey = z.enum(SECTION_KEYS);
export type SectionKey = z.infer<typeof SectionKey>;

export const ParsedSection = z.object({
  key: SectionKey, heading: z.string(), rawText: z.string(), lines: z.array(z.string()),
});
export type ParsedSection = z.infer<typeof ParsedSection>;

export const ConfirmSectionsInput = z.object({
  sections: z.array(z.object({ key: SectionKey, include: z.boolean(), editedText: z.string().max(20000) })),
  profileLabel: z.string().min(1).max(80),
});
export type ConfirmSectionsInput = z.infer<typeof ConfirmSectionsInput>;
EOF

cat > packages/core/src/cvParse.ts <<'EOF'
import type { ParsedSection, SectionKey } from '@careerflow/shared';

const HEADERS: { key: SectionKey; re: RegExp }[] = [
  { key: 'contact', re: /^(contact|personal details|personal information)\s*$/i },
  { key: 'summary', re: /^(summary|profile|about|objective|professional summary)\s*$/i },
  { key: 'experience', re: /^(experience|work experience|employment|professional experience|employment history)\s*$/i },
  { key: 'education', re: /^(education|academic background|academic)\s*$/i },
  { key: 'skills', re: /^(skills|expertise|competencies|core skills|technical skills)\s*$/i },
  { key: 'certifications', re: /^(certifications?|licenses?|certifications? (and|&) licenses?)\s*$/i },
  { key: 'projects', re: /^(projects?|portfolio|selected projects)\s*$/i },
  { key: 'languages', re: /^(languages?)\s*$/i },
  { key: 'references', re: /^(references?)\s*$/i },
];

export function parseCv(text: string): ParsedSection[] {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd());
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  const preamble: string[] = [];
  for (const line of lines) {
    const h = HEADERS.find(h => h.re.test(line.trim()));
    if (h) { if (current) sections.push(current); current = { key: h.key, heading: line.trim(), rawText: '', lines: [] }; }
    else if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) sections.push(current);
  if (sections.length === 0 && preamble.filter(Boolean).length)
    sections.push({ key: 'other', heading: 'Imported text', rawText: preamble.join('\n').trim(), lines: preamble });
  for (const s of sections) s.rawText = s.lines.join('\n').trim();
  return sections;
}
EOF

cat > packages/core/src/linkedinSuggestions.ts <<'EOF'
export interface Suggestion { id: string; kind: 'clarity' | 'length' | 'structure' | 'verb'; message: string; original: string; proposed: string; }
export type LinkedInSection = 'headline' | 'about' | 'experience' | 'skills' | 'featured';

export function analyzeLinkedIn(section: LinkedInSection, text: string): Suggestion[] {
  const out: Suggestion[] = [];
  const t = text.trim();
  if (section === 'headline') {
    if (t.length < 30) out.push({ id: 'headline-short', kind: 'length', message: 'Headline is short. Up to 120 characters is available.', original: t, proposed: t });
    if (!/(engineer|manager|designer|analyst|developer|specialist|director|consultant|lead|architect|scientist)/i.test(t))
      out.push({ id: 'headline-role', kind: 'clarity', message: 'Consider naming a role and domain so a visitor understands what you do in one read.', original: t, proposed: t });
  }
  if (section === 'about') {
    if (t.length < 150) out.push({ id: 'about-short', kind: 'length', message: 'The About section has room to tell a story. Three to five sentences of context → action → result reads well.', original: t, proposed: t });
    if (t.length > 400 && !/\n\n/.test(t)) out.push({ id: 'about-paragraphs', kind: 'structure', message: 'Long single block. Split into two or three paragraphs for scanability.', original: t, proposed: t });
  }
  if (section === 'experience') {
    let n = 0;
    for (const line of t.split(/\n/)) if (/^\s*responsible for\b/i.test(line))
      out.push({ id: `exp-verb-${n++}`, kind: 'verb', message: '"Responsible for" is passive. Try a stronger verb.', original: line, proposed: line.replace(/^\s*responsible for/i, 'Led') });
  }
  if (section === 'skills') {
    const items = t.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    if (items.length > 30) out.push({ id: 'skills-too-many', kind: 'clarity', message: 'Over 30 skills dilutes focus. Keep the 15–20 most relevant.', original: t, proposed: t });
    if (new Set(items.map(i => i.toLowerCase())).size !== items.length)
      out.push({ id: 'skills-duplicates', kind: 'clarity', message: 'Some skills appear more than once.', original: t, proposed: t });
  }
  return out;
}
EOF

# --- storage with containment guard ---
cat > apps/api/src/storage.ts <<'EOF'
import { lstatSync, mkdirSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { env } from './env.js';

const PROJECT_ROOT = realpathSync(process.cwd());
function within(root: string, candidate: string, allowRoot = false): boolean {
  const rel = relative(root, candidate);
  return (allowRoot && rel === '') || (rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function ensureDirectoryTree(root: string, target: string): string {
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`STORAGE_DIR must be a dedicated directory inside project root: ${target}`);
  let current = root;
  for (const part of rel.split(sep)) {
    if (!part || part === '.' || part === '..') throw new Error('Invalid storage directory component');
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Storage directory contains a symlink: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Storage path component is not a directory: ${current}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      mkdirSync(current, { mode: 0o700 });
    }
    if (!within(root, realpathSync(current))) throw new Error(`Storage directory escapes project root: ${current}`);
  }
  return realpathSync(target);
}
function resolveRoot(): string {
  const candidate = resolve(PROJECT_ROOT, env.STORAGE_DIR);
  const rel = relative(PROJECT_ROOT, candidate);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`STORAGE_DIR must be a dedicated subdirectory inside project root: ${candidate}`);
  return ensureDirectoryTree(PROJECT_ROOT, candidate);
}
const ROOT = resolveRoot();

export function storagePath(key: string): string {
  if (!key || key.indexOf(String.fromCharCode(0)) !== -1 || key.indexOf(String.fromCharCode(92)) !== -1 || isAbsolute(key) || key.startsWith('/')) throw new Error('Invalid storage key');
  const parts = key.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Invalid storage key component');
  const full = resolve(ROOT, ...parts);
  if (!within(ROOT, full)) throw new Error(`Storage key escapes root: ${key}`);
  return full;
}
function ensureSafeParent(full: string): void {
  const rel = relative(ROOT, dirname(full));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Storage parent escapes root');
  let current = ROOT;
  for (const part of rel ? rel.split(sep) : []) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Storage path contains a symlink: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Storage path component is not a directory: ${current}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      mkdirSync(current, { mode: 0o700 });
    }
    if (!within(ROOT, realpathSync(current), true)) throw new Error(`Storage path escapes root: ${current}`);
  }
  if (!within(ROOT, realpathSync(dirname(full)), true)) throw new Error('Storage parent escapes root');
}
export async function putObject(key: string, body: Buffer, _mime: string): Promise<void> {
  const full = storagePath(key);
  ensureSafeParent(full);
  writeFileSync(full, body, { flag: 'wx', mode: 0o600 });
}
export async function getObject(key: string): Promise<Buffer> {
  const full = storagePath(key);
  ensureSafeParent(full);
  const stat = lstatSync(full);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Invalid stored object');
  const real = realpathSync(full);
  if (!within(ROOT, real)) throw new Error('Stored object escapes root');
  return readFileSync(real);
}
EOF

# --- text extraction (text only, no PDF yet) ---
cat > apps/api/src/extractText.ts <<'EOF'
export async function extractText(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') {
    throw new Error('PDF import is deferred to M3. Please upload .txt or .md for now.');
  }
  if (mime.startsWith('text/') || ['txt', 'md', 'markdown'].includes(ext)) {
    return buffer.toString('utf8');
  }
  throw new Error(`Unsupported file type: ${mime || ext || 'unknown'}. Use .txt or .md.`);
}
EOF

# --- cv route with containment via storage ---
cat > apps/api/src/routes/cv.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { workspaces, cvImportSessions, profileVersions, experiences, skills, educations } from '@careerflow/db';
import { ConfirmSectionsInput } from '@careerflow/shared';
import { parseCv } from '@careerflow/core';
import { putObject } from '../storage.js';
import { extractText } from '../extractText.js';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}

export async function registerCv(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.post('/:workspaceId/import', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'file_required' });
    const buffer = await file.toBuffer();
    if (buffer.length === 0) return reply.code(400).send({ error: 'empty_file' });
    if (buffer.length > 10 * 1024 * 1024) return reply.code(413).send({ error: 'file_too_large' });

    const storageKey = `cv-imports/${workspaceId}/${randomUUID()}-${file.filename.replace(/[^\w.\-]/g, '_')}`;
    await putObject(storageKey, buffer, file.mimetype);

    const sess = (await db.insert(cvImportSessions).values({ workspaceId, filename: file.filename, mime: file.mimetype, storageKey, status: 'pending' }).returning())[0]!;

    try {
      const text = await extractText(buffer, file.mimetype, file.filename);
      const sections = parseCv(text);
      await db.update(cvImportSessions).set({ status: 'parsed', rawText: text, sections, parsedAt: new Date() }).where(eq(cvImportSessions.id, sess.id));
      return reply.code(201).send({ sessionId: sess.id, status: 'parsed', sections });
    } catch (e) {
      await db.update(cvImportSessions).set({ status: 'failed', error: (e as Error).message }).where(eq(cvImportSessions.id, sess.id));
      return reply.code(422).send({ sessionId: sess.id, status: 'failed', error: (e as Error).message });
    }
  });

  app.get('/:workspaceId/session/:id', async (req, reply) => {
    const { workspaceId, id } = req.params as { workspaceId: string; id: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select().from(cvImportSessions).where(eq(cvImportSessions.id, id)).limit(1);
    if (!rows[0] || rows[0].workspaceId !== workspaceId) return reply.code(404).send({ error: 'not_found' });
    return { session: rows[0] };
  });

  app.post('/:workspaceId/session/:id/confirm', async (req, reply) => {
    const { workspaceId, id } = req.params as { workspaceId: string; id: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select().from(cvImportSessions).where(eq(cvImportSessions.id, id)).limit(1);
    if (!rows[0] || rows[0].workspaceId !== workspaceId) return reply.code(404).send({ error: 'not_found' });

    const body = ConfirmSectionsInput.parse(req.body);
    const version = (await db.insert(profileVersions).values({ workspaceId, label: body.profileLabel, targetRoles: [] }).returning())[0]!;

    for (const sec of body.sections) {
      if (!sec.include || !sec.editedText.trim()) continue;
      if (sec.key === 'summary')
        await db.update(profileVersions).set({ summary: sec.editedText }).where(eq(profileVersions.id, version.id));
      if (sec.key === 'skills') {
        const items = sec.editedText.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        if (items.length) await db.insert(skills).values(items.map(name => ({ profileVersionId: version.id, name })));
      }
      if (sec.key === 'experience') {
        const blocks = sec.editedText.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
        for (let i = 0; i < blocks.length; i++)
          await db.insert(experiences).values({ profileVersionId: version.id, company: 'Imported', role: (blocks[i]!.split(/\n/)[0] ?? '').slice(0, 200) || 'Imported role', bullets: [{ text: blocks[i]!, sourceType: 'candidate_input' }], position: i });
      }
      if (sec.key === 'education') {
        const blocks = sec.editedText.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
        for (const b of blocks) await db.insert(educations).values({ profileVersionId: version.id, institution: b.split(/\n/)[0] ?? 'Imported', credential: null, field: null });
      }
    }
    await db.update(cvImportSessions).set({ status: 'confirmed' }).where(eq(cvImportSessions.id, id));
    return reply.code(201).send({ profileVersionId: version.id });
  });
}
EOF

cat > apps/api/src/routes/linkedin.ts <<'EOF'
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { analyzeLinkedIn } from '@careerflow/core';

const Body = z.object({ section: z.enum(['headline', 'about', 'experience', 'skills', 'featured']), text: z.string().min(1).max(20000) });

export async function registerLinkedIn(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });
  app.post('/analyze', async (req) => {
    const body = Body.parse(req.body);
    return { suggestions: analyzeLinkedIn(body.section, body.text) };
  });
}
EOF

mkdir -p "apps/web/src/app/(app)/cv/import/[id]" "apps/web/src/app/(app)/linkedin" "apps/web/src/app/(app)/applications/[id]"

# --- CV upload page — imports the same API_URL as apiFetch ---

cat > "apps/web/src/app/(app)/cv/import/page.tsx" <<'EOF'
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, API_URL } from '@/lib/api';

const UPLOAD_BASE = API_URL;

export default function CvImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const wsRes = await apiFetch<{ workspaces: any[] }>('/workspaces');
      const wsId = wsRes.workspaces[0].id;
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${UPLOAD_BASE}/cv/${wsId}/import`, { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      router.push(`/cv/import/${data.sessionId}?ws=${wsId}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Import failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h2 style={{ marginBlockStart: 0 }}>Import your CV</h2>
      <p className="muted">Supported: .txt, .md (max 10 MB). PDF import arrives in M3. The file is stored in your workspace; you review every section before anything enters your profile.</p>
      <form onSubmit={onSubmit}>
        <div className="form-field"><input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        {err && <p className="err">{err}</p>}
        <button type="submit" className="btn btn-mint" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload & parse'}</button>
      </form>
    </div>
  );
}
EOF

echo "CV upload will reuse API_URL from the web API client (detected mode: $MODE)."

cat > "apps/web/src/app/(app)/cv/import/[id]/page.tsx" <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Section { key: string; heading: string; rawText: string; lines: string[]; }

export default function CvReviewPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const wsId = search.get('ws') ?? '';
  const [sections, setSections] = useState<(Section & { include: boolean; editedText: string })[]>([]);
  const [label, setLabel] = useState('Imported CV');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { session } = await apiFetch<{ session: any }>(`/cv/${wsId}/session/${params.id}`);
      const parsed: Section[] = session.sections ?? [];
      setSections(parsed.map(s => ({ ...s, include: s.key !== 'references', editedText: s.rawText })));
    })().catch(() => setErr('Could not load session'));
  }, [params.id, wsId]);

  async function onConfirm() {
    setBusy(true); setErr(null);
    try {
      const res = await apiFetch<{ profileVersionId: string }>(`/cv/${wsId}/session/${params.id}/confirm`, {
        method: 'POST', body: JSON.stringify({ profileLabel: label, sections: sections.map(s => ({ key: s.key, include: s.include, editedText: s.editedText })) }),
      });
      router.push(`/profile/${res.profileVersionId}`);
    } catch { setErr('Could not confirm'); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>Review extracted sections</h2>
        <p className="muted">Nothing enters your profile until you confirm. Uncheck a section to skip it. Edit any text.</p>
        <div className="form-field"><label>Profile version label</label><input value={label} onChange={e => setLabel(e.target.value)} /></div>
      </div>
      {sections.map((s, i) => (
        <div key={s.key + i} className="card">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
            <input type="checkbox" checked={s.include} onChange={e => { const copy = [...sections]; copy[i] = { ...s, include: e.target.checked }; setSections(copy); }} />
            {s.heading || s.key}
          </label>
          <textarea rows={Math.min(12, Math.max(3, s.editedText.split('\n').length))} value={s.editedText}
            onChange={e => { const copy = [...sections]; copy[i] = { ...s, editedText: e.target.value }; setSections(copy); }}
            style={{ width: '100%', marginBlockStart: 8, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
        </div>
      ))}
      {err && <p className="err">{err}</p>}
      <button className="btn btn-mint" onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : 'Create profile version'}</button>
    </div>
  );
}
EOF

cat > "apps/web/src/app/(app)/linkedin/page.tsx" <<'EOF'
'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

const SECTIONS = ['headline', 'about', 'experience', 'skills', 'featured'] as const;
type Section = typeof SECTIONS[number];

export default function LinkedInPage() {
  const [section, setSection] = useState<Section>('headline');
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setBusy(true);
    try {
      const res = await apiFetch<{ suggestions: any[] }>('/linkedin/analyze', { method: 'POST', body: JSON.stringify({ section, text }) });
      setSuggestions(res.suggestions);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card">
        <h2 style={{ marginBlockStart: 0 }}>LinkedIn section review</h2>
        <p className="muted">Paste a section. Suggestions are deterministic — no AI, no external call. CareerFlow never publishes to LinkedIn.</p>
        <div className="form-field"><label>Section</label>
          <select value={section} onChange={e => setSection(e.target.value as Section)} style={{ padding: 10, borderRadius: 8 }}>
            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-field"><label>Text</label>
          <textarea rows={6} value={text} onChange={e => setText(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }} />
        </div>
        <button className="btn btn-mint" onClick={analyze} disabled={busy || !text.trim()}>{busy ? 'Analyzing…' : 'Get suggestions'}</button>
      </div>
      {suggestions && (
        <div className="card">
          <h3 style={{ marginBlockStart: 0 }}>Suggestions ({suggestions.length})</h3>
          {suggestions.length === 0 ? <p className="muted">No issues flagged.</p> : (
            <div style={{ display: 'grid', gap: 12 }}>
              {suggestions.map(s => (
                <div key={s.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{s.message}</p>
                  {s.original && s.proposed && s.original !== s.proposed && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBlockStart: 8 }}>
                      <div><div className="muted" style={{ fontSize: 12 }}>Original</div><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{s.original}</pre></div>
                      <div><div className="muted" style={{ fontSize: 12 }}>Suggested</div><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{s.proposed}</pre></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
EOF

cat > "apps/web/src/app/(app)/applications/[id]/ConfirmRequirement.tsx" <<'EOF'
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function ConfirmRequirement({ applicationId, requirementId }: { applicationId: string; requirementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const wsRes = await apiFetch<{ workspaces: any[] }>('/workspaces');
      const { items } = await apiFetch<{ items: any[] }>(`/evidence/${wsRes.workspaces[0].id}`);
      setEvidence(items);
    })().catch(() => setErr('Could not load evidence'));
  }, [open]);

  async function confirm() {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      await apiFetch(`/applications/${applicationId}/requirements/${requirementId}/confirm`, { method: 'POST', body: JSON.stringify({ evidenceId: chosen }) });
      router.refresh();
      setOpen(false);
    } catch { setErr('Could not link'); } finally { setBusy(false); }
  }

  return (
    <div style={{ marginBlockStart: 8 }}>
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)} style={{ fontSize: 12, padding: '4px 10px' }}>Link evidence…</button>
      ) : (
        <div>
          <select value={chosen} onChange={e => setChosen(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
            <option value="">Select evidence…</option>
            {evidence.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button className="btn btn-mint" onClick={confirm} disabled={!chosen || busy} style={{ marginInlineStart: 8, fontSize: 12, padding: '4px 10px' }}>{busy ? '…' : 'Confirm'}</button>
          <button className="btn" onClick={() => setOpen(false)} style={{ marginInlineStart: 4, fontSize: 12, padding: '4px 10px' }}>Cancel</button>
          {err && <p className="err" style={{ fontSize: 12 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
EOF

cat > scripts/reset.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "DROPS all tables in careerflow database. Not docker volumes."
read -p "Type YES to continue: " ans
[ "$ans" = "YES" ] || exit 1
docker compose -f docker/compose.yml exec -T postgres psql -U careerflow -d careerflow -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
echo "Dropped. Run: pnpm db:push"
EOF
chmod +x scripts/reset.sh

cat > TESTING.md <<'EOF'
# M2 testing

## Apply
    pnpm db:push
    pnpm -r typecheck
    pnpm dev:api &
    pnpm dev:web

## Walkthrough
1. /signup → /home
2. Set direction
3. /cv/import → upload .txt or .md (PDF deferred to M3) → review → confirm
4. /profile → imported version
5. /linkedin → paste headline → suggestions
6. /opportunities/new → requirements
7. Start application workspace
8. On requirement, click "Link evidence…" → pick → Confirm → flips to ✓ Evidence linked
9. Verify: create a 2nd user, try to link their evidence ID into your application → expect 404 (BOLA guard)

## Storage
Files under ./data/uploads/. STORAGE_DIR in .env. Containment enforced: escape attempts throw at boot.

## Reset
    bash scripts/reset.sh && pnpm db:push
EOF

# gitignore / env additions
grep -q '^data/' .gitignore || echo 'data/' >> .gitignore
grep -q '^STORAGE_DIR=' .env.example || echo 'STORAGE_DIR=./data/uploads' >> .env.example

# ============================================================
# EDITS — tolerant, multi-anchor, backup-on-modify
# ============================================================

node <<'NODE'
const fs = require('fs');

function backup(file) {
  const bak = `${file}.m2.bak`;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
}

function patch(file, matchFns, insert) {
  backup(file);
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(insert.marker)) { console.log(`  ${file}: already patched`); return; }
  for (const fn of matchFns) {
    const result = fn(src);
    if (result) { fs.writeFileSync(file, result); console.log(`  ${file}: patched`); return; }
  }
  throw new Error(`${file}: NO ANCHOR MATCHED — refusing to claim M2 applied. File backed up.`);
}

// ---- shared/index.ts + core/index.ts: append exports ----
patch('packages/shared/src/index.ts',
  [(s) => s.includes('contracts/cv') ? null : s + "\nexport * from './contracts/cv.js';\n"],
  { marker: 'contracts/cv' });

patch('packages/core/src/index.ts',
  [(s) => s.includes('cvParse') ? null : s + "\nexport * from './cvParse.js';\nexport * from './linkedinSuggestions.js';\n"],
  { marker: 'cvParse' });

patch('apps/web/src/lib/api.ts', [
  (s) => {
    if (s.includes('export const API_URL')) return null;
    if (!s.includes('const API_URL = process.env.NEXT_PUBLIC_API_URL')) return null;
    return s.replace('const API_URL =', 'export const API_URL =');
  },
], { marker: 'export const API_URL' });

// ---- schema.ts: add confirmedAt column + cvImportSessions table ----
patch('packages/db/src/schema.ts', [
  (s) => {
    const anchor = "sourceChangedAt: timestamp('source_changed_at', { withTimezone: true }),";
    if (!s.includes(anchor)) return null;
    let out = s;
    if (!out.includes('confirmedAt')) out = out.replace(anchor, anchor + "\n  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),");
    if (!out.includes('cvImportSessions')) out += `

export const cvImportSessions = pgTable('cv_import_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  storageKey: text('storage_key').notNull(),
  status: text('status').notNull().default('pending'),
  rawText: text('raw_text'),
  sections: jsonb('sections').notNull().default([]),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  parsedAt: timestamp('parsed_at', { withTimezone: true }),
});
`;
    return out;
  },
], { marker: 'cvImportSessions' });

// ---- env.ts: add STORAGE_DIR ----
patch('apps/api/src/env.ts', [
  (s) => {
    const re = /(SESSION_SECRET:\s*z\.string\([^)]*\)[^\n]*,)/;
    if (!re.test(s)) return null;
    return s.replace(re, "$1\n  STORAGE_DIR: z.string().min(1).default('./data/uploads'),");
  },
], { marker: 'STORAGE_DIR' });

// ---- server.ts: register cv + linkedin ----
patch('apps/api/src/server.ts', [
  (s) => {
    if (s.includes('registerCv')) return null;
    const lines = s.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
    if (last === -1) return null;
    lines.splice(last + 1, 0,
      "import multipart from '@fastify/multipart';",
      "import { registerCv } from './routes/cv.js';",
      "import { registerLinkedIn } from './routes/linkedin.js';"
    );
    s = lines.join('\n');
    const m = s.match(/\n(await app\.listen)/);
    if (!m) return null;
    const reg = "\nawait app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });\nawait app.register(registerCv, { prefix: '/cv' });\nawait app.register(registerLinkedIn, { prefix: '/linkedin' });\n";
    return s.replace(m[0], reg + m[0].slice(1));
  },
], { marker: 'registerCv' });

// ---- applications.ts: add zod import + confirm route WITH same-workspace guard ----
patch('apps/api/src/routes/applications.ts', [
  (s) => {
    if (s.includes('/requirements/:reqId/confirm')) return null;
    if (!/from 'zod'/.test(s)) {
      const lines = s.split('\n');
      let last = -1;
      for (let i = 0; i < lines.length; i++) if (/^import /.test(lines[i])) last = i;
      lines.splice(last + 1, 0, "import { z } from 'zod';");
      s = lines.join('\n');
    }
    // find the last `});` before final `}` — anchor on the last known route
    const anchors = [
      "return reply.code(201).send({ link });\n  });",
      "return reply.code(201).send({ application: updated });\n  });",
    ];
    let target = null;
    for (const a of anchors) if (s.includes(a)) { target = a; break; }
    if (!target) return null;

    const route = `

  app.post('/:id/requirements/:reqId/confirm', async (req, reply) => {
    const { id, reqId } = req.params as { id: string; reqId: string };
    const appRow = await ownedApplication(id, req.user!.id);
    if (!appRow) return reply.code(404).send({ error: 'not_found' });
    const body = z.object({ evidenceId: z.string().uuid() }).parse(req.body);

    const reqRow = await db.select().from(applicationRequirements)
      .where(and(eq(applicationRequirements.id, reqId), eq(applicationRequirements.applicationId, id))).limit(1);
    if (!reqRow[0]) return reply.code(404).send({ error: 'requirement_not_found' });

    // BOLA guard: evidence must belong to the same workspace as the application.
    const evRow = await db.select({ id: evidenceItems.id }).from(evidenceItems)
      .where(and(eq(evidenceItems.id, body.evidenceId), eq(evidenceItems.workspaceId, appRow.workspaceId))).limit(1);
    if (!evRow[0]) return reply.code(404).send({ error: 'evidence_not_found' });

    const linkedAt = new Date();
    const prior = await db.select().from(requirementEvidenceLinks)
      .where(eq(requirementEvidenceLinks.requirementId, reqId)).limit(1);
    if (prior[0]) {
      await db.update(requirementEvidenceLinks).set({
        evidenceId: body.evidenceId, state: 'linked', phrase: null, linkedAt, confirmedAt: linkedAt,
      }).where(eq(requirementEvidenceLinks.id, prior[0].id));
    } else {
      await db.insert(requirementEvidenceLinks).values({
        requirementId: reqId, evidenceId: body.evidenceId, state: 'linked', linkedAt, confirmedAt: linkedAt,
      });
    }
    return reply.code(201).send({ ok: true, state: 'linked' });
  });`;
    return s.replace(target, target + route);
  },
], { marker: '/requirements/:reqId/confirm' });

// ---- web layout: add nav links ----
patch('apps/web/src/app/(app)/layout.tsx', [
  (s) => {
    if (s.includes('/cv/import')) return null;
    const anchors = ['<Link href="/documents">Documents</Link>', '<Link href="/documents"'];
    for (const a of anchors) if (s.includes(a)) {
      return s.replace(a, a + '\n        <Link href="/cv/import">Import CV</Link>\n        <Link href="/linkedin">LinkedIn</Link>');
    }
    return null;
  },
], { marker: '/cv/import' });

// ---- applications/[id]/page.tsx: import + render ConfirmRequirement ----
patch('apps/web/src/app/(app)/applications/[id]/page.tsx', [
  (s) => {
    if (s.includes('ConfirmRequirement')) return null;
    const impCandidates = [/import StagePicker from ['"]@\/components\/StagePicker['"];/, /import StageSelector from ['"]\.\/StageSelector['"];/, /import .* from ['"]\.\/StageSelector['"];/];
    let importLine = null;
    for (const re of impCandidates) { const m = s.match(re); if (m) { importLine = m[0]; break; } }
    if (!importLine) return null;
    s = s.replace(importLine, importLine + "\nimport ConfirmRequirement from './ConfirmRequirement';");

    // Insert the action into this M1 page's compact requirement row.
    const stateAnchor = '<span className="pill">{r.state}</span>';
    if (!s.includes(stateAnchor)) return null;
    s = s.replace(stateAnchor, stateAnchor + "{r.state !== 'linked' && <ConfirmRequirement applicationId={d.application.id} requirementId={r.id} />}");
    return s.replace('Read-only map in M1. Linked means you linked evidence; possible phrase match is only a text cue; none means no link.', 'Phrase match is a text cue; confirm evidence to mark it linked; none means no link.');
  },
], { marker: 'ConfirmRequirement' });

// Seeding is out of scope; no seed command or dependency is added.
NODE

echo ""
echo "== post-patch dependency verification =="
if node -e "require.resolve('@fastify/multipart', { paths: ['./apps/api'] })" >/dev/null 2>&1; then
  echo "authorized dependency already resolved; trailing pnpm install skipped"
else
  echo "multipart package missing after add; running the specified trailing pnpm install"
  pnpm install
  node -e "require.resolve('@fastify/multipart', { paths: ['./apps/api'] })"
fi
echo ""
echo "Manual steps remaining (if any above said 'NO ANCHOR MATCHED'):"
echo "  - Open that file, add the import/route by hand. Backups are *.m2.bak."
echo ""
echo "M2 applied. Next:"
echo "  pnpm db:push"
echo "  pnpm -r typecheck"
echo "  pnpm dev:api &"
echo "  pnpm smoke"
echo "  # separate terminal: pnpm dev:web"
echo "  # browser walkthrough per TESTING.md — the gate is: Link evidence… → ✓ Evidence linked"
echo ""
echo "Security verification:"
echo "  Create a second user, get an evidence ID from THEIR workspace, attempt:"
echo "    POST /applications/<your-app>/requirements/<your-req>/confirm  body: {\"evidenceId\":\"<their-evidence>\"}"
echo "  Expect: 404 evidence_not_found. If it returns 201, the BOLA guard is wrong — tell me."
