#!/usr/bin/env bash
set -euo pipefail
[ -d apps/api ] || { echo "Run from careerflow-monorepo/ root."; exit 1; }

echo "== M4: dependency (before any code) =="
pnpm --filter @careerflow/api add unpdf
echo "deps OK"

echo ""
echo "== M4: discovery =="
node <<'NODE'
const fs = require('fs');
const checks = [
  { file: 'apps/api/src/extractText.ts',                       probes: ['extractText', 'Unsupported file type'], what: 'text extraction' },
  { file: 'apps/web/src/app/(app)/cv/import/page.tsx',         probes: ['accept=', 'CvImportPage'],             what: 'cv import page' },
];
let bad = 0;
for (const c of checks) {
  if (!fs.existsSync(c.file)) { console.log(`  MISSING FILE: ${c.file} (${c.what})`); bad++; continue; }
  const src = fs.readFileSync(c.file, 'utf8');
  const missing = c.probes.filter(p => !src.includes(p));
  if (missing.length) { console.log(`  INCOMPLETE: ${c.file} — missing: ${missing.join(', ')}`); bad++; }
  else console.log(`  OK: ${c.file}`);
}
if (bad) { console.log('\nDiscovery failed.'); process.exit(1); }
console.log('\nDiscovery: all probes matched.');
NODE

echo ""
echo "== M4: patches =="
node <<'NODE'
const fs = require('fs');

function backup(file) {
  const bak = `${file}.m4.bak`;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
}

// 1. extractText.ts — PDF support via unpdf, hard-fail with clear message
backup('apps/api/src/extractText.ts');
fs.writeFileSync('apps/api/src/extractText.ts', `import { extractText as unpdfExtract } from 'unpdf';

export async function extractText(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'pdf') {
    try {
      const { text } = await unpdfExtract(new Uint8Array(buffer), { mergePages: true });
      if (!text || !text.trim()) {
        throw new Error('No selectable text found. The PDF may be a scanned image.');
      }
      return text;
    } catch (e) {
      const msg = (e as Error).message ?? 'unknown';
      throw new Error(\`PDF extraction failed: \${msg}\`);
    }
  }

  if (mime.startsWith('text/') || ['txt', 'md', 'markdown'].includes(ext)) {
    return buffer.toString('utf8');
  }

  throw new Error(\`Unsupported file type: \${mime || ext || 'unknown'}. Use .pdf, .txt, or .md.\`);
}
`);
console.log('  apps/api/src/extractText.ts: rewritten with PDF support');

// 2. cv/import/page.tsx — accept PDF, correct copy
(() => {
  const file = 'apps/web/src/app/(app)/cv/import/page.tsx';
  backup(file);
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  src = src.replace(/accept="([^"]*)"/, (_m, attrs) => {
    if (attrs.includes('.pdf')) return _m;
    return `accept="${attrs},.pdf,application/pdf"`;
  });

  // copy: "PDF import arrives in M4" becomes "PDF is supported"
  src = src.replace(/PDF import arrives in M4/g, 'PDF is supported');
  // fallback if wording differs
  src = src.replace(/PDF[^.]*arrives in M4/gi, 'PDF is supported');

  if (src === before) { console.log(`  ${file}: no matching accept/copy pattern — inspect manually`); return; }
  fs.writeFileSync(file, src);
  console.log(`  ${file}: PDF accepted in file picker`);
})();

// 3. TESTING.md — append M4 section
(() => {
  if (!fs.existsSync('TESTING.md')) return;
  const src = fs.readFileSync('TESTING.md', 'utf8');
  if (src.includes('## M4')) { console.log('  TESTING.md: already has M4 section'); return; }
  fs.appendFileSync('TESTING.md', `

## M4 — PDF import

### What changed
- \`apps/api/src/extractText.ts\` handles PDF via \`unpdf\` (which wraps \`pdfjs-dist\`)
- \`apps/web/src/app/(app)/cv/import/page.tsx\` accepts .pdf in the file picker
- No new routes, no schema changes, no other files

### Gate
1. Obtain a text-based PDF (any PDF with selectable text; NOT a scanned image)
2. \`/cv/import\` → upload → expect sections parsed
3. Confirm sections → profile version created and persisted
4. Reload → profile version still there
5. Regression: .txt and .md still parse as before

### Failure modes (all correct behavior, not bugs)
- **Scanned/image PDF** → 422 with \`PDF extraction failed: No selectable text found\`. We do not OCR.
- **Encrypted PDF** → 422 with \`PDF extraction failed: <unpdf error>\`. We do not prompt for passwords.
- **Multi-column layout** → text order may jumble. Documented limitation.

### If unpdf fails at install or run
- Drop it: \`pnpm --filter @careerflow/api remove unpdf\`
- Replace with \`pdfjs-dist/legacy/build/pdf.mjs\` (documented in conversation)
- Report the error verbatim
`);
  console.log('  TESTING.md: M4 section appended');
})();
NODE

echo ""
echo "== post-patch verification =="
pnpm -r typecheck
echo "typecheck OK"
echo ""
echo "M4 applied. Next:"
echo "  pnpm dev:api &"
echo "  sleep 2"
echo "  pnpm smoke"
echo "  # separate terminal: pnpm dev:web"
echo "  # /cv/import → upload a text-based PDF"
