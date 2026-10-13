/**
 * Round seventy, the owner's run (2026-10-13): `--fill wikidata` read no item. Its first request was answered "maxlag:
 * Waiting for wdqs1016: 7.6 seconds lagged.", the five asks of one call ran out, and the fill stopped; the next step,
 * `--keys rebuild-wd.txt`, found no such file and printed the general usage line. The fill now waits for Wikidata in
 * rounds, as long as the builder's lag spell, and a run that does stop resumes where it stopped. Each case FAILED on m70
 * unless it says "guard".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as fills from '$dossier/corpus-fills';
import { fillWikidata, type WikidataProgress } from '$dossier/corpus-fills';
import { mwWait, MAXLAG_TRIES } from '$dossier/sources/wikimedia';
import type { JsonFetcher } from '$dossier/fetch';

const LAG = { error: { code: 'maxlag', info: 'Waiting for wdqs1016: 7.6 seconds lagged.' } };
/** Dossiers whose items carry their own GBIF key: the fill reads them, fifty a request, and changes nothing. */
function corpus(n: number) {
  const docs: Record<string, unknown> = {};
  for (let i = 1; i <= n; i++) docs[`${i}.json`] = { key: i, name: { scientific: `Aus s${i}` }, ids: { wikidata: `Q${i}` }, links: {}, upstream: { wikidata: { status: 'ok', at: 'x', detail: 'found by its GBIF key' } } };
  return docs;
}
const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });
/** Wikidata, lagged for the first `lagged` asks (or for every batch holding an item in `always`). */
function wikidata(lagged: number, asked: string[] = [], always?: (ids: string[]) => boolean): JsonFetcher {
  let n = 0;
  return (async (url: string) => {
    asked.push(url);
    const ids = /ids=([^&]+)/.exec(url)?.[1].split('|') ?? [];
    if (n++ < lagged || always?.(ids)) return { status: 'ok', data: LAG };
    return { status: 'ok', data: { entities: Object.fromEntries(ids.map((q) => [q, { claims: { P846: [{ mainsnak: { datavalue: { value: q.slice(1) } } }] } }])) } };
  }) as unknown as JsonFetcher;
}
const waited: number[] = [];
const before = { sleep: mwWait.sleep, tries: mwWait.tries };
beforeEach(() => { waited.length = 0; mwWait.sleep = async (s: number) => { waited.push(s); }; mwWait.tries = MAXLAG_TRIES; });
afterEach(() => { mwWait.sleep = before.sleep; mwWait.tries = before.tries; });

describe('--fill wikidata waits for Wikidata', () => {
  it('a lag longer than one call\'s asks is waited out, and the items are read', async () => {
    const c = await fillWikidata(store(corpus(3)), wikidata(MAXLAG_TRIES + 2));
    expect(c.failed).toBeUndefined(); // m70: "wikidata maxlag: Waiting for wdqs1016: 7.6 seconds lagged."
    expect(c).toMatchObject({ read: 3, byKey: 3 });
    expect(waited.filter((s) => s >= 60)).toEqual([60]); // one pause between rounds, after a round of asks
  });
  it('a lag that does not end stops the fill only after the lag spell\'s rounds, saying so', async () => {
    const asked: string[] = [];
    const c = await fillWikidata(store(corpus(3)), wikidata(Infinity, asked));
    expect(c.failed).toMatch(/maxlag/);
    expect(asked.length).toBeGreaterThan(MAXLAG_TRIES); // m70: five asks
  });
});

describe('a stopped --fill wikidata resumes', () => {
  it('what it read is kept, and the next run reads only the rest', async () => {
    let kept: Parameters<WikidataProgress['save']>[0] | undefined;
    let cleared = false;
    const progress = (from?: typeof kept): WikidataProgress => ({ ...from, save: (p) => { kept = p; }, clear: () => { cleared = true; } });
    const docs = corpus(60);
    // The first fifty answer; the batch of the last ten stays lagged.
    const first = await fillWikidata(store(docs), wikidata(0, [], (ids) => ids.includes('Q60')), undefined, progress());
    expect(first.failed).toMatch(/maxlag/);
    expect(first.read).toBe(50);
    expect(kept?.read).toHaveLength(50); // m70: nothing kept; the next run read all sixty again
    const asked: string[] = [];
    const second = await fillWikidata(store(docs), wikidata(0, asked), undefined, progress(kept));
    expect(second.failed).toBeUndefined();
    expect(second).toMatchObject({ read: 10, byKey: 60 });
    expect(asked).toHaveLength(1);
    expect(/ids=([^&]+)/.exec(asked[0])?.[1].split('|')).toHaveLength(10);
    expect(cleared).toBe(true); // a run that ends leaves nothing to resume
  });
  it('a change found before the stop is said again by the run that ends, so rebuild-wd.txt is whole', async () => {
    const kept = { read: [], changed: { '7:Q7': { line: 'Aus s7 [7]: Q7 → Q70 (found by its IPNI identifier)', rebuild: '7 Aus s7\tWikidata item Q7 → Q70' } } };
    const c = await fillWikidata(store(corpus(8)), wikidata(0), undefined, { ...kept, save: () => {}, clear: () => {} });
    expect(c.rebuild).toEqual(['7 Aus s7\tWikidata item Q7 → Q70']);
    expect(c.read).toBe(7); // the seventh is not asked again
  });
  it('the script keeps the progress beside the corpus, and writes rebuild-wd.txt only from a run that ended', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(src).toMatch(/const PROGRESS = 'fill-wikidata-progress\.json'/);
    expect(src).toMatch(/if \(c\.rebuild\.length && !c\.failed\) \{\s*writeFileSync\('rebuild-wd\.txt'/);
  });
});

describe('--keys with no such file says so', () => {
  it('rebuild-wd.txt: the file is missing, and what writes it', () => {
    expect(fills.keysMissing?.('rebuild-wd.txt')).toBe('rebuild-wd.txt is not there, which --fill wikidata writes when it runs to the end with species to rebuild: run it (again) first. Nothing was built.'); // m70: the usage line
    expect(fills.keysMissing?.('mine.txt')).toBe('mine.txt is not there. Nothing was built.');
  });
  it('the script says it before the usage line', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(src).toMatch(/if \(file && !existsSync\(file\)\) \{[^}]*console\.error\(keysMissing\(file\)\)/);
  });
});
