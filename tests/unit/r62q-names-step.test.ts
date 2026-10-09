/**
 * Round sixty-two, decision 3: the build's `--names` step (scripts/names-step.ts, run by `build-dossiers.ts --names`)
 * asks GBIF's vernacular names afresh for every stored dossier, rewrites only the vernacular block and its upstream
 * record, and is resumable. Against the fixture dossiers in a temporary folder, with a fetcher that answers from a table:
 * no network. New in this round (no base to fail on: the step did not exist).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refetchNames, NAMES_MARK } from '../../scripts/names-step';
import { parseDossier } from '$dossier/schema';
import { englishNames } from '$dossier/index-entry';

let dir: string;
const keys = () => readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => parseInt(f)).sort((a, b) => a - b);
const read = (k: number) => JSON.parse(readFileSync(join(dir, `${k}.json`), 'utf8'));
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'r62q-names-'));
  cpSync('fixtures/dossiers/s/v2', dir, { recursive: true });
});
const NOW = () => new Date('2026-10-08T12:00:00Z');
/** A fetcher answering every species' vernacularNames with `rows`, in pages of `size`, counting the requests. */
function gbif(rows: (key: number) => object[], size = 1000, refuseAfter = Infinity) {
  const asked: string[] = [];
  const f = (async (url: string) => {
    asked.push(url);
    if (asked.length > refuseAfter) return { status: 'refused', detail: 'api.gbif.org 429 again after a cooldown' };
    const u = new URL(url);
    const key = Number(/species\/(\d+)\/vernacularNames/.exec(u.pathname)![1]);
    const all = rows(key);
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const page = all.slice(offset, offset + size);
    return { status: 'ok', data: { results: page, endOfRecords: offset + page.length >= all.length } };
  }) as never;
  return { f, asked };
}
const ROWS = (key: number) => [
  { vernacularName: 'Money plant', language: 'eng', source: 'A', preferred: true },
  { vernacularName: 'money plant', language: 'eng', source: 'B' },
  { vernacularName: `Name ${key}`, language: 'eng', source: 'C' },
  { vernacularName: 'Geldboom', language: 'afr', source: 'D' }
];

describe('the --names step', () => {
  it('rewrites only the vernacular block and its upstream record, with preferred flags and sources', async () => {
    const before = keys().map((k) => read(k));
    const { f } = gbif(ROWS);
    const r = await refetchNames(dir, f, { now: NOW });
    expect(r).toMatchObject({ done: before.length, kept: 0, errors: 0, left: 0, truncated: 0 });
    for (const b of before) {
      const a = read(b.key);
      expect(a.name.vernacular).toEqual([
        { name: 'Money plant', lang: 'eng', source: 'A', preferred: true },
        { name: 'money plant', lang: 'eng', source: 'B' },
        { name: `Name ${b.key}`, lang: 'eng', source: 'C' },
        { name: 'Geldboom', lang: 'afr', source: 'D' }
      ]);
      expect(a.upstream['gbif.vernacular']).toEqual({ status: 'ok', at: '2026-10-08T12:00:00.000Z', detail: `${NAMES_MARK} 2026-10-08` });
      // everything else exactly as it was, in the same order
      const strip = (d: { name: Record<string, unknown>; upstream: Record<string, unknown> }) => ({ ...d, name: { ...d.name, vernacular: null }, upstream: { ...d.upstream, 'gbif.vernacular': null } });
      expect(JSON.stringify(strip(a))).toBe(JSON.stringify(strip(b)));
      expect(parseDossier(a)).not.toBeNull(); // still a dossier the Worker serves
      expect(englishNames(a.name.vernacular).common).toBe('Money plant'); // preferred, from two sources
    }
  });
  it('is resumable: a refusal stops the run, says how many are left, and the same command picks up there', async () => {
    const n = keys().length;
    const first = gbif(ROWS, 1000, 2);
    const r1 = await refetchNames(dir, first.f, { now: NOW });
    expect(r1).toMatchObject({ done: 2, left: n - 2, refused: expect.stringMatching(/429/) });
    const untouched = read(keys()[2]);
    expect(untouched.upstream?.['gbif.vernacular']?.detail ?? '').not.toMatch(NAMES_MARK);
    const second = gbif(ROWS);
    const r2 = await refetchNames(dir, second.f, { now: NOW });
    expect(r2).toMatchObject({ done: n - 2, kept: 2, left: 0 });
    expect(second.asked).toHaveLength(n - 2); // the two done are not asked again
    const third = gbif(ROWS);
    expect(await refetchNames(dir, third.f, { now: NOW })).toMatchObject({ done: 0, kept: n });
    expect(third.asked).toHaveLength(0);
  });
  it('pages to the end, and records a list longer than the pages it may ask as truncated', async () => {
    const many = (key: number) => Array.from({ length: key === 999 ? 4500 : 3 }, (_, i) => ({ vernacularName: `N${i}`, language: 'eng', source: `S${i}` }));
    const r = await refetchNames(dir, gbif(many, 1000).f, { now: NOW });
    expect(r.truncated).toBe(1);
    expect(read(999).upstream['gbif.vernacular'].detail).toBe(`${NAMES_MARK} 2026-10-08; truncated: the first 4000 rows only`);
    expect(read(999).name.vernacular).toHaveLength(4000);
    expect(read(keys().find((k) => k !== 999)!).name.vernacular).toHaveLength(3);
  });
  it('an error leaves the dossier as it was, to be asked next run', async () => {
    const k = keys()[0];
    const before = readFileSync(join(dir, `${k}.json`), 'utf8');
    const f = (async () => ({ status: 'error', detail: '502' })) as never;
    expect(await refetchNames(dir, f, { now: NOW })).toMatchObject({ done: 0, errors: keys().length });
    expect(readFileSync(join(dir, `${k}.json`), 'utf8')).toBe(before);
  });
});
