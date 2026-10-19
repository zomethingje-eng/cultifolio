#!/usr/bin/env node
// The deploy's first step (round seventy-eight): the Worker this checkout builds reads its corpus under `s/v<N>/`, N being
// the dossier version in src/lib/dossier/schema.ts, and nothing under another version. A deploy before that corpus is in
// the bucket would leave the live site unable to read its reference (every species page a 503) until the upload. So the
// deploy is `node scripts/corpus-ready.mjs && npm run deploy` (docs/DEPLOY.md and the corpus step's stop message say so),
// and this stops it unless the bucket holds a manifest of that version:
//
//   node scripts/corpus-ready.mjs           asks the bucket `cultifolio` (wrangler's --remote) for s/v<N>/manifest.json
//
// The corpus step (`node scripts/corpus-step.mjs`) uploads it; a Worker deployed before it keeps reading its own version's
// folder, which the upload does not touch. Exits 0 when the manifest is there and is of version N; 1 otherwise, with one
// sentence saying what to do.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The dossier version this checkout's Worker reads, from the schema's source. */
export function dossierVersion(root = process.cwd()) {
  const m = /export const DOSSIER_V = (\d+) as const/.exec(readFileSync(`${root}/src/lib/dossier/schema.ts`, 'utf8'));
  if (!m) throw new Error('src/lib/dossier/schema.ts names no DOSSIER_V');
  return Number(m[1]);
}

/**
 * Whether the bucket's manifest text is one this Worker reads: JSON, of version `v`, with an id, a species count and
 * the files a Worker of round seventy-six or later is read through (the index, the genera, the first card file).
 */
export function readyWhy(text, v) {
  let m;
  try { m = JSON.parse(String(text ?? '').replace(/^﻿/, '')); } catch { return 'is not JSON'; }
  if (!m || typeof m !== 'object') return 'is not a manifest';
  if (m.v !== v) return `is of version ${m.v}, not ${v}`;
  if (typeof m.id !== 'string' || !Number.isInteger(m.species) || m.species < 1) return 'names no corpus id or species count';
  const files = m.files && typeof m.files === 'object' ? m.files : {};
  for (const name of ['index.json', 'genera.json', 'cards/0.json']) if (typeof files[name] !== 'string') return `names no ${name}`;
  return null;
}

/**
 * The check. `get(path)` resolves to the object's text, or null when the bucket does not hold it (a test gives one);
 * the real one asks wrangler.
 */
/** @param {{ root?: string, get?: (path: string) => Promise<string | null>, say?: (s: string) => void }} [o] */
export async function check({ root = process.cwd(), get = wranglerGet, say = (s) => { process.stdout.write(s); } } = {}) {
  const v = dossierVersion(root);
  const path = `s/v${v}/manifest.json`;
  let text;
  try { text = await get(path); } catch (e) { say(`corpus-ready: the bucket could not be asked for ${path} (${e.message}). Nothing was deployed. Check that wrangler is logged in (npx wrangler whoami), then run node scripts/corpus-ready.mjs && npm run deploy again.\n`); return 1; }
  if (text == null) {
    say(`corpus-ready: the bucket holds no version ${v} corpus (${path}). This Worker reads only that folder, so deploying now would leave every species page unreadable. Nothing was deployed. Run the corpus step first (node scripts/corpus-step.mjs, docs/DEPLOY.md section 5), which uploads it while the site keeps serving the corpus before, then node scripts/corpus-ready.mjs && npm run deploy.\n`);
    return 1;
  }
  const why = readyWhy(text, v);
  if (why) { say(`corpus-ready: the bucket's ${path} ${why}. Nothing was deployed. Run the corpus step again (node scripts/corpus-step.mjs), then node scripts/corpus-ready.mjs && npm run deploy.\n`); return 1; }
  const m = JSON.parse(String(text).replace(/^﻿/, ''));
  say(`corpus-ready: the bucket holds corpus ${m.id} (${m.species} species) under s/v${v}/, the folder this Worker reads.\n`);
  return 0;
}

/** The object's text through wrangler (the remote bucket `cultifolio`), or null when wrangler says it is not there. */
function wranglerGet(path) {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    let out = '', err = '';
    let child;
    try { child = spawn(cmd, ['wrangler', 'r2', 'object', 'get', `cultifolio/${path}`, '--remote', '--pipe'], { shell: process.platform === 'win32' }); } catch (e) { reject(e); return; }
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (s) => { out += s; });
    child.stderr.on('data', (s) => { err += s; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else if (/not found|does not exist|NoSuchKey|10007/i.test(err + out)) resolve(null);
      else reject(new Error(`wrangler exit ${code}: ${(err || out).trim().split('\n').pop()}`));
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  check().then((code) => process.exit(code));
}
