/**
 * Round seventy-eight (I): the order of the upload and the deploy, stated and enforced. The corpus of this round is version
 * 3, under `s/v3/`, which round seventy-seven's Worker never reads (every read it makes is under `s/v2/`); this round's
 * Worker reads only `s/v3/`. So the corpus step goes first, and:
 *   - the deploy command, `node scripts/corpus-ready.mjs && npm run deploy`, stops until the bucket holds a version 3
 *     manifest (package.json is unchanged, so the check is in the command the corpus step and DEPLOY.md give);
 *   - the Worker meeting a bucket of version 2 alone answers 503, never the fixture's species;
 *   - the corpus step writes `static/s/v3` from `static/s/v2`, which it never changes and keeps as the backup, uploads it
 *     to `s/v3`, and stops for the deploy before its live check; its review compares the dossiers across the ids.
 * Each case FAILED on the base (version 2 everywhere, no corpus-ready).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, readyWhy, dossierVersion } from '../../scripts/corpus-ready.mjs';
import { run, parsePlan, uploadCommands, facts, withoutIds, VERSION } from '../../scripts/corpus-step.mjs';
import { corpusNow, getCorpusId, _forgetIndex } from '$lib/server/dossiers';
import { manifestPath, productPath } from '$dossier/manifest';
import { dossierPath, genusPath, DOSSIER_V } from '$dossier/schema';

const ready = { v: 3, id: 'c0ffee00c0ffee00', built: 'x', species: 8945, buckets: 32, postings: 64, files: { 'index.json': 'a'.repeat(32), 'genera.json': 'b'.repeat(32), 'cards/0.json': 'c'.repeat(32) } };

describe('scripts/corpus-ready.mjs, the deploy\'s first step', () => {
  it('reads the version this checkout\'s Worker reads from the schema: 3', () => {
    expect(dossierVersion()).toBe(3);
    expect(DOSSIER_V).toBe(3);
    expect(VERSION).toBe(3);
  });
  it('stops the deploy while the bucket holds no version 3 manifest, and says to run the corpus step first', async () => {
    let said = '';
    const asked: string[] = [];
    expect(await check({ get: async (p: string) => { asked.push(p); return null; }, say: (s: string) => { said += s; } })).toBe(1);
    expect(asked).toEqual(['s/v3/manifest.json']);
    expect(said).toMatch(/holds no version 3 corpus \(s\/v3\/manifest\.json\)\. .*Nothing was deployed\. Run the corpus step first \(node scripts\/corpus-step\.mjs/);
  });
  it('stops it on a manifest of another version, one that is not JSON, or one naming none of the files this Worker reads', async () => {
    expect(readyWhy(JSON.stringify({ ...ready, v: 2 }), 3)).toBe('is of version 2, not 3');
    expect(readyWhy('{"cut', 3)).toBe('is not JSON');
    expect(readyWhy(JSON.stringify({ ...ready, files: { 'index.json': 'x' } }), 3)).toBe('names no genera.json');
    expect(await check({ get: async () => JSON.stringify({ ...ready, v: 2 }), say: () => {} })).toBe(1);
    expect(await check({ get: async () => { throw new Error('not logged in'); }, say: () => {} })).toBe(1);
  });
  it('lets it go on once the corpus is there, saying which', async () => {
    let said = '';
    expect(await check({ get: async () => JSON.stringify(ready), say: (s: string) => { said += s; } })).toBe(0);
    expect(said).toBe('corpus-ready: the bucket holds corpus c0ffee00c0ffee00 (8945 species) under s/v3/, the folder this Worker reads.\n');
  });
  it('is the deploy\'s first step in the command the corpus step and DEPLOY.md give (package.json is left as it was)', () => {
    const cmd = 'node scripts/corpus-ready.mjs && npm run deploy';
    const stop = parsePlan(readFileSync('scripts/corpus-plan.txt', 'utf8')).filter((s) => s.kind === 'review').map((s) => s.args.join(' ')).find((t) => /Deploy now/.test(t));
    expect(stop).toContain(cmd);
    const deploy = readFileSync('docs/DEPLOY.md', 'utf8');
    const step4 = deploy.slice(deploy.indexOf('**Step 4. The deploy.**'));
    expect(step4.slice(0, step4.indexOf('\n'))).toContain(`\`${cmd}\``);
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts.deploy).not.toMatch(/corpus-ready/);
  });
});

describe('the Worker reads version 3 alone', () => {
  beforeEach(() => _forgetIndex());
  it('every file it reads is under s/v3/, where round seventy-seven\'s Worker reads under s/v2/ only', () => {
    expect([manifestPath(), productPath('a'.repeat(32)), dossierPath('k1'), genusPath('aloe')].every((p) => p.startsWith('s/v3/'))).toBe(true);
    expect(uploadCommands().map(([, a]) => (a as string[]).find((x) => x.startsWith('r2:')))).toEqual(['r2:cultifolio/s/v3', 'r2:cultifolio/s/v3', 'r2:cultifolio/s/v3']);
  });
  it('a bucket holding round seventy-seven\'s corpus and no version 3 one is a 503 that says the reference could not be read, never the fixture', async () => {
    const m = new Map([['s/v2/manifest.json', '{}'], ['s/v2/index.json', '[]']]);
    const store = { get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: '"e"' } : null), head: async (k: string) => (m.has(k) ? { etag: '"e"' } : null) };
    const p = { env: { STORE: store } } as unknown as App.Platform;
    const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(corpusNow(p, noStatic)).rejects.toMatchObject({ status: 503 });
    // guard: a bucket with nothing at all (a dev server's empty local bucket) still falls to the fixture, as before
    _forgetIndex();
    const empty = { env: { STORE: { get: async () => null, head: async () => null } } } as unknown as App.Platform;
    expect(await getCorpusId(empty, noStatic)).toBe('fixture');
  });
});

describe('the corpus step of this round', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'r78i-step-'));
    mkdirSync(join(root, 'static/s/v2'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v2/manifest.json'), JSON.stringify({ v: 2, id: 'v2corpus0000aaaa' }));
    writeFileSync(join(root, 'static/s/v2/index.json'), JSON.stringify([{ key: 1 }, { key: 2 }]));
  });
  it('backs up nothing while static/s/v3 is not there: static/s/v2, read and never changed, is the backup, and its species are the count to keep', async () => {
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), 'backup\n');
    let out = '';
    expect(await run({ root, exec: async () => 0, fetchCorpus: async () => null, log: (s: string) => { out += s; }, waitMs: 0 })).toBe(0);
    expect(out).toContain('static/s/v3 is not there yet: it is written from static/s/v2 (corpus v2corpus0000aaaa), which is left as it is and is the backup.');
    const st = JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8'));
    expect(st).toMatchObject({ speciesBefore: 2, corpusBefore: 'v2corpus0000aaaa', backupDir: 'static/s/v2' });
  });
  it('the review compares each dossier with the version 2 one of its GBIF key, without the id fields', () => {
    const a = { v: 2, key: 5, ids: { gbif: 5 }, name: { scientific: 'Aloe vera' }, photos: [{ id: 'p', shared: [7] }], distribution: { via: { page: '7' } }, changed: { on: '2026-01-01', h: 'aa' } };
    const b = { ...a, v: 3, key: 'k9', photos: [{ id: 'p', shared: ['g7'] }], distribution: { via: { page: 'g7' } }, changed: { on: '2026-01-01', h: 'bb' } };
    mkdirSync(join(root, 'static/s/v3'));
    writeFileSync(join(root, 'static/s/v2/5.json'), JSON.stringify(a));
    writeFileSync(join(root, 'static/s/v3/k9.json'), JSON.stringify(b));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ id: 'v3corpus' }));
    writeFileSync(join(root, 'static/s/v3/index.json'), '[{}]');
    expect(facts(root, 'v2corpus0000aaaa', 'static/s/v2')).toBe(' (corpus on disk v3corpus, was v2corpus0000aaaa; 1 species; 0 dossiers differ from the backup of corpus v2corpus0000aaaa apart from their ids; drops.txt not there).');
    writeFileSync(join(root, 'static/s/v3/k9.json'), JSON.stringify({ ...b, name: { scientific: 'Aloe ferox' } }));
    expect(facts(root, 'v2corpus0000aaaa', 'static/s/v2')).toContain('1 dossier differs from the backup of corpus v2corpus0000aaaa apart from their ids (k9)');
    expect(withoutIds(a)).toEqual(withoutIds(b));
  });
  it('the plan of this round rekeys, reviews, uploads, then stops for the deploy before its live check', () => {
    const steps = parsePlan(readFileSync('scripts/corpus-plan.txt', 'utf8'));
    expect(steps.map((s) => s.kind)).toEqual(['backup', 'dossier', 'review', 'upload', 'review', 'live-check']);
    expect(steps[1].args).toEqual(['--rekey']);
    expect(steps[4].args[0]).toMatch(/^The corpus is in the bucket under s\/v3\/, which the site does not read yet.*Deploy now/);
  });
});
