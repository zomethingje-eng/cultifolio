/**
 * Round eighty-nine: GBIF's occurrence search asked once for a download (src/lib/dossier/api-answers.ts,
 * scripts/api-answers-store.ts). The fetcher reads a kept answer in place of asking, keeps what it asks (a dry run keeps
 * none), and passes every other address through; the store belongs to one download and clears for another; and on twelve
 * pages, two of them on the API path, a pass reading the kept answers writes the pages the pass that asked wrote, asking
 * nothing, while a build asking GBIF as before differs only in the record's words of the day.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { keptAnswers, answeredWords, answerLine, type AnswerStore } from '../../src/lib/dossier/api-answers';
import { answerStore } from '../../scripts/api-answers-store';
import type { JsonFetcher } from '../../src/lib/dossier/fetch';
import { folder, N, sp, ROOT } from './helpers/r88-pages';

const SEARCH = (k: number, more = '') => `https://api.gbif.org/v1/occurrence/search?taxonKey=${k}&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=300&offset=0${more}`;
const memory = (): AnswerStore & { m: Map<string, { day: string; data: unknown }> } => { const m = new Map<string, { day: string; data: unknown }>(); return { m, get: (u) => m.get(u) ?? null, set: (u, day, data) => void m.set(u, { day, data }) }; };
const net = (asked: string[], status: 'ok' | 'refused' = 'ok') => (async (url: string) => { asked.push(url); return status === 'ok' ? { status, data: { results: [{ key: 1, taxonKey: 5 }], endOfRecords: true, count: 1 } } : { status, detail: '429' }; }) as unknown as JsonFetcher;

describe('r89a 1: the fetcher', () => {
  it('asks once, keeps the answer, and reads it the next time, each record with the day GBIF gave it', async () => {
    const asked: string[] = [], store = memory();
    const a = keptAnswers(net(asked), store, { write: true, today: () => '2026-11-12' });
    const first = await a(SEARCH(5));
    expect(asked).toEqual([SEARCH(5)]);
    expect(first).toEqual({ status: 'ok', data: { results: [{ key: 1, taxonKey: 5, answeredDay: '2026-11-12' }], endOfRecords: true, count: 1 } });
    // The next pass, on another day: the answer kept, GBIF not asked, the day it answered kept.
    const b = keptAnswers(net(asked), store, { write: true, today: () => '2026-11-14' });
    expect(await b(SEARCH(5))).toEqual(first);
    expect(asked).toHaveLength(1);
    expect(answerLine(a.stats)).toBe("GBIF's occurrence search (the API path): 0 answers read as kept, 1 asked (2026-11-12)");
    expect(answerLine(b.stats)).toBe("GBIF's occurrence search (the API path): 1 answer read as kept (2026-11-12)");
  });
  it('a dry run keeps nothing; a refusal is not kept; any other address is passed through untouched', async () => {
    const asked: string[] = [], store = memory();
    const dry = keptAnswers(net(asked), store, { write: false, today: () => '2026-11-12' });
    expect((await dry(SEARCH(5))).status).toBe('ok');
    expect(store.m.size).toBe(0);
    const refusing = keptAnswers(net(asked, 'refused'), store, { write: true, today: () => '2026-11-12' });
    expect(await refusing(SEARCH(6))).toEqual({ status: 'refused', detail: '429' });
    expect(store.m.size).toBe(0);
    const media = 'https://api.gbif.org/v1/occurrence/search?taxonKey=5&mediaType=StillImage&limit=100';
    const other = await keptAnswers(net(asked), store, { write: true, today: () => '2026-11-12' })(media);
    expect(other).toEqual({ status: 'ok', data: { results: [{ key: 1, taxonKey: 5 }], endOfRecords: true, count: 1 } });
    expect(store.m.size).toBe(0);
  });
  it('the words: one day, two days, and a day as of only where every record is of it', () => {
    expect(answeredWords([{ key: 1 }])).toEqual({});
    expect(answeredWords([{ key: 1, answeredDay: '2026-11-12' }, { key: 2, answeredDay: '2026-11-12' }])).toEqual({ words: "GBIF's occurrence search as it answered on 2026-11-12", asOf: '2026-11-12' });
    expect(answeredWords([{ key: 1, answeredDay: '2026-11-13' }, { key: 2, answeredDay: '2026-11-12' }])).toEqual({ words: "GBIF's occurrence search as it answered between 2026-11-12 and 2026-11-13" });
    expect(answeredWords([{ key: 1, answeredDay: '2026-11-12' }, { key: 2, downloadDay: '2026-10-21' }])).toEqual({ words: "GBIF's occurrence search as it answered on 2026-11-12" });
  });
});

describe('r89a 2: the store, one download\'s', () => {
  const bulk = () => { const d = mkdtempSync(join(tmpdir(), 'r89a-')); writeFileSync(join(d, 'download.json'), JSON.stringify({ key: 'A' })); writeFileSync(join(d, 'api-path.txt'), '5\t9000\n'); return d; };
  it('keeps answers whole, reads them back, and passes over one that cannot be read', () => {
    const d = bulk();
    const { store, note } = answerStore(d, true);
    expect(note).toMatch(/kept from here on in .*api-answers, for the download A/);
    store.set(SEARCH(5), '2026-11-12', { results: [{ key: 1 }] });
    expect(answerStore(d, true).store.get(SEARCH(5))).toEqual({ day: '2026-11-12', data: { results: [{ key: 1 }] } });
    expect(answerStore(d, false).note).toMatch(/^1 answers of GBIF's occurrence search kept for the download A/);
    const file = readdirSync(join(d, 'api-answers')).find((f) => f.endsWith('.json.gz'))!;
    writeFileSync(join(d, 'api-answers', file), 'not gzip');
    expect(answerStore(d, true).store.get(SEARCH(5))).toBeNull();
  });
  it('another download or another api-path.txt: cleared by a build, passed over by a dry run', () => {
    const d = bulk();
    answerStore(d, true).store.set(SEARCH(5), '2026-11-12', { results: [] });
    writeFileSync(join(d, 'download.json'), JSON.stringify({ key: 'B' }));
    const dry = answerStore(d, false);
    expect(dry.note).toMatch(/are of another download \(A\) or another api-path\.txt: none read/);
    expect(dry.store.get(SEARCH(5))).toBeNull();
    expect(readdirSync(join(d, 'api-answers')).filter((f) => f.endsWith('.gz'))).toHaveLength(1);
    const built = answerStore(d, true);
    expect(built.note).toMatch(/the 1 answers kept in .* were of another download \(A\).*cleared/);
    expect(built.store.get(SEARCH(5))).toBeNull();
    expect(readdirSync(join(d, 'api-answers')).filter((f) => f.endsWith('.gz'))).toHaveLength(0);
    // The same download, another list of the species left to the API path: another set of answers too.
    built.store.set(SEARCH(5), '2026-11-12', { results: [] });
    writeFileSync(join(d, 'api-path.txt'), '5\t9000\n6\t8000\n');
    expect(answerStore(d, true).store.get(SEARCH(5))).toBeNull();
  });
});

const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, '--import', pathToFileURL(resolve('tests/unit/helpers/r89-gbif.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const asked = (dir: string) => (existsSync(join(dir, 'r89-asked.txt')) ? readFileSync(join(dir, 'r89-asked.txt'), 'utf8').trim().split('\n').filter(Boolean) : []);
const ON_API = (i: number) => i === 1 || i === 2;
const ASKED = 5;
/** Each page whole, the build's own times (`built`, `at`) out; `less` takes the record's words of GBIF's search out too. */
const pagesOf = (dir: string, less = false) => Object.fromEntries(readdirSync(join(dir, 'static/s/v3')).filter((f) => /^k\d+\.json$/.test(f)).sort().map((f) => {
  const d = JSON.parse(readFileSync(join(dir, 'static/s/v3', f), 'utf8'), (k, v) => (k === 'built' || k === 'at' ? undefined : v));
  if (less && d.upstream?.['gbif.occurrences']) { d.upstream['gbif.occurrences'].detail = String(d.upstream['gbif.occurrences'].detail ?? '').replace(/; GBIF's occurrence search as it answered on \d{4}-\d\d-\d\d/, ''); delete d.upstream['gbif.occurrences'].asOf; }
  return [f, JSON.stringify(d)];
}));

describe('r89a 3: twelve pages, two on the API path', () => {
  it('the next pass reads the answers the first kept, asks nothing, and writes the same pages', () => {
    const a = folder(undefined, { apiPath: ON_API }), b = join(tmpdir(), `r89a-b-${process.pid}`), c = join(tmpdir(), `r89a-c-${process.pid}`);
    cpSync(a, b, { recursive: true });
    cpSync(a, c, { recursive: true });
    const first = run(a, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(first.status, first.stderr + first.stdout).toBe(0);
    // The two on the API path, and the three the download holds no record of (0, 5 and 10), which fall through to GBIF's
    // search as they always have.
    expect(asked(a)).toHaveLength(ASKED);
    expect(first.stdout).toMatch(new RegExp(`GBIF's occurrence search \\(the API path\\): 0 answers read as kept, ${ASKED} asked \\(\\d{4}-\\d\\d-\\d\\d\\)`));
    const day = new RegExp(`${ASKED} asked \\((\\d{4}-\\d\\d-\\d\\d)\\)`).exec(first.stdout)![1];
    // The two pages say the day GBIF answered, and keep it as of; the others say nothing of it.
    for (let i = 0; i < N; i++) {
      const d = JSON.parse(readFileSync(join(a, `static/s/v3/k${sp(i).id}.json`), 'utf8'));
      const occ = d.upstream['gbif.occurrences'];
      if (ON_API(i)) { expect(occ.detail).toContain(`GBIF occurrence search API; GBIF's occurrence search as it answered on ${day}`); expect(occ.asOf).toBe(day); expect(d.occurrences.open.length).toBeGreaterThan(0); }
      else expect(occ?.detail ?? '').not.toContain('as it answered');
      expect(JSON.stringify(d)).not.toContain('answeredDay');
    }
    // The next pass: the answers kept with the download.
    cpSync(join(a, 'bulk/api-answers'), join(b, 'bulk/api-answers'), { recursive: true });
    const second = run(b, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(second.status, second.stderr + second.stdout).toBe(0);
    expect(second.stdout).toContain(`${ASKED} answers of GBIF's occurrence search kept for the download`);
    expect(second.stdout).toContain(`GBIF's occurrence search (the API path): ${ASKED} answers read as kept (${day})`);
    expect(asked(b)).toHaveLength(0);
    expect(pagesOf(b)).toEqual(pagesOf(a));
    // Asked as before (--no-api-answers): the same pages but for the record's words of the day.
    const before = run(c, '--keys', 'list.txt', '--offline', '--bulk', 'bulk', '--no-api-answers');
    expect(before.status, before.stderr + before.stdout).toBe(0);
    expect(asked(c)).toHaveLength(ASKED);
    expect(existsSync(join(c, 'bulk/api-answers'))).toBe(false);
    expect(pagesOf(c)).not.toEqual(pagesOf(a));
    expect(pagesOf(c, true)).toEqual(pagesOf(a, true));
  }, 300_000);

  it('a dry run reads the kept answers and keeps none; with none kept it asks and keeps nothing', () => {
    const a = folder(undefined, { apiPath: ON_API }), b = join(tmpdir(), `r89a-d-${process.pid}`);
    cpSync(a, b, { recursive: true });
    const dryNone = run(a, '--dry-run', '--offline', '--bulk', 'bulk', '--keys', 'list.txt', '--policy-before', 'r85');
    expect(dryNone.status, dryNone.stderr + dryNone.stdout).toBe(0);
    expect(asked(a)).toHaveLength(ASKED);
    expect(existsSync(join(a, 'bulk/api-answers'))).toBe(false);
    const kept = run(b, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(kept.status, kept.stderr + kept.stdout).toBe(0);
    const files = readdirSync(join(b, 'bulk/api-answers')).sort();
    cpSync(join(b, 'bulk/api-answers'), join(a, 'bulk/api-answers'), { recursive: true });
    const dry = run(a, '--dry-run', '--offline', '--bulk', 'bulk', '--keys', 'list.txt', '--policy-before', 'r85');
    expect(dry.status, dry.stderr + dry.stdout).toBe(0);
    expect(asked(a)).toHaveLength(ASKED);
    expect(dry.stdout).toContain(`${ASKED} answers read as kept`);
    expect(readdirSync(join(a, 'bulk/api-answers')).sort()).toEqual(files);
  }, 300_000);

  it('a new download clears the answers kept for the old one, and GBIF is asked again', () => {
    const a = folder(undefined, { apiPath: ON_API });
    expect(run(a, '--keys', 'list.txt', '--offline', '--bulk', 'bulk').status).toBe(0);
    const dl = JSON.parse(readFileSync(join(a, 'bulk/download.json'), 'utf8'));
    writeFileSync(join(a, 'bulk/download.json'), JSON.stringify({ ...dl, key: '0099999-260928105237408' }));
    const again = run(a, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(again.status, again.stderr + again.stdout).toBe(0);
    expect(again.stdout).toMatch(new RegExp(`the ${ASKED} answers kept in .* were of another download \\(0038605-260928105237408\\).*cleared`));
    // Asked again by this build (the day's own cache of GBIF's answers, cache/upstream/<day>, may answer it without GBIF).
    expect(again.stdout).toContain(`GBIF's occurrence search (the API path): 0 answers read as kept, ${ASKED} asked`);
  }, 300_000);
});
