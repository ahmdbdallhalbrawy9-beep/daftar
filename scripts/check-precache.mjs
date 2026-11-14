#!/usr/bin/env node
// Fails if any file under src/ or styles/ is missing from sw.js's FILES
// array, so a forgotten precache entry is caught before it ships (instead of
// relying on remembering rule 1/2 in AGENTS.md by hand). Plain Node, no deps.
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function listFiles(dir) {
  const out = [];
  async function walk(d) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  await walk(dir);
  return out;
}

function extractFilesArray(swSource) {
  const m = swSource.match(/var FILES=\[([\s\S]*?)\];/);
  if (!m) throw new Error('could not find `var FILES=[...]` in sw.js');
  return m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.slice(1, -1));
}

async function main() {
  const swSource = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const files = new Set(extractFilesArray(swSource));

  const onDisk = [
    ...(await listFiles(path.join(ROOT, 'src'))),
    ...(await listFiles(path.join(ROOT, 'styles'))),
  ];

  const missing = onDisk.filter((f) => !files.has(f));
  if (missing.length) {
    console.error('check-precache: these files exist but are missing from sw.js\'s FILES array:');
    missing.forEach((f) => console.error('  - ' + f));
    console.error('\nAdd them to FILES in sw.js and bump CACHE (AGENTS.md hard rules 1-2).');
    process.exit(1);
  }
  console.log('check-precache: every file under src/ and styles/ (' + onDisk.length + ' files) is listed in sw.js.');
}

main().catch((e) => { console.error(e); process.exit(1); });
