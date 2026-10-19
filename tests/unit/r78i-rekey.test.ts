/**
 * Round seventy-eight (I): the corpus under the ids the rule gives (src/lib/dossier/rekey.ts). `--rekey` writes a version 2
 * corpus (`<GBIF key>.json`) as version 3 (`<id>.json`); `--index` rekeys in place, so ids follow the rule as Kew's entries
 * and merges change, and a second run changes nothing. Nothing but the id fields changes, and the day the page last
 * changed stays. Each case FAILED on the base (no rekey there).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rekey, idsGbifLines, DOSSIER_FILE, V2_FILE, type RekeyStore } from '$dossier/rekey';
import { substanceHash } from '$dossier/changed';
import { parseDossier } from '$dossier/schema';

const template = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
/** A version 2 dossier, as round seventy-seven's corpus holds it. */
const v2 = (key: number, scientific: string, entry: string | undefined, more: Record<string, unknown> = {}) => {
  const d = { ...JSON.parse(JSON.stringify(template)), v: 2, key, slug: scientific.toLowerCase().replace(/ /g, '-'), ids: { ...template.ids, gbif: key }, ...more };
  d.name = { ...d.name, scientific };
  if (entry === undefined) delete d.name.kew; else d.name.kew = { entry, synonyms: [], acceptedElsewhere: [], file: '2026-06-04' };
  d.changed = { on: '2026-09-20', h: substanceHash(d) };
  return d;
};
function store(files: Record<string, unknown> = {}): RekeyStore & { files(): string[]; m: Map<string, string>; writes: string[]; removes: string[] } {
  const m = new Map(Object.entries(files).map(([k, v]) => [k, JSON.stringify(v)]));
  const writes: string[] = [], removes: string[] = [];
  return {
    m, writes, removes,
    files: () => [...m.keys()],
    read: (f) => { if (!m.has(f)) throw new Error(`no ${f}`); return JSON.parse(m.get(f)!); },
    write: (f, d) => { writes.push(f); m.set(f, JSON.stringify(d)); },
    remove: (f) => { removes.push(f); m.delete(f); }
  };
}
const doc = (s: ReturnType<typeof store>, f: string) => JSON.parse(s.m.get(f)!);

describe('--rekey: version 2 written as version 3', () => {
  const pair = { '3574291.json': v2(3574291, 'Ceropegia melanops', '502875', { distribution: { ...template.distribution, via: { kind: 'synonym-of', entry: 'Ceropegia nigra N.E.Br.', page: '3574112' } } }), '3574112.json': v2(3574112, 'Ceropegia nigra', '502875') };
  const one = v2(2746231, 'Babiana geniculata', '326701', { photos: [{ ...template.photos[0], shared: [3574112] }, ...template.photos.slice(1)] });
  const from = () => store({ '2746231.json': one, ...pair, '7410371.json': v2(7410371, 'Harpephyllum caffrum', ''), '42.json': v2(42, 'Aloe vera', undefined), 'index.json': [], 'manifest.json': {} });
  it('each dossier under its id: Kew\'s where the entry is the page\'s alone, GBIF\'s otherwise; the version 2 folder is only read', () => {
    const src = from(), to = store();
    const r = rekey({ from: src, to });
    expect(r.unreadable).toEqual([]);
    expect([...to.m.keys()].sort()).toEqual(['g3574112.json', 'g3574291.json', 'g42.json', 'g7410371.json', 'k326701.json']);
    expect(src.writes).toEqual([]);
    expect(src.removes).toEqual([]);
    expect(r).toMatchObject({ pages: 5, renamed: 5, followed: 0, kew: 1 });
    expect(idsGbifLines(r)).toEqual([
      "g3574112\tCeropegia nigra\tKew's entry 502875 is also the entry of GBIF's 3574291: a merge decides which page is Kew's",
      "g3574291\tCeropegia melanops\tKew's entry 502875 is also the entry of GBIF's 3574112: a merge decides which page is Kew's",
      "g42\tAloe vera\tKew's file not read for this page (--fill kew-names)",
      "g7410371\tHarpephyllum caffrum\tKew's rows do not decide which taxon this page is"
    ]);
  });
  it('nothing changes but the id fields: the version, `key`, the other pages named by id; the day of the stamp stays, its fingerprint current', () => {
    const to = store();
    rekey({ from: from(), to });
    const d = doc(to, 'k326701.json');
    expect(d.v).toBe(3);
    expect(d.key).toBe('k326701');
    expect(d.ids.gbif).toBe(2746231);
    expect(d.photos[0].shared).toEqual(['g3574112']);
    expect(doc(to, 'g3574291.json').distribution.via.page).toBe('g3574112');
    expect(d.changed).toEqual({ on: '2026-09-20', h: substanceHash(d) });
    const strip = (x: Record<string, unknown> & { photos: Array<Record<string, unknown>>; changed: object }) => { const { v: _v, key: _k, changed: _c, ...rest } = x; return { ...rest, photos: x.photos.map(({ shared: _s, ...p }) => p) }; };
    expect(strip(d)).toEqual(strip(JSON.parse(JSON.stringify(one))));
    expect(() => parseDossier(d)).not.toThrow();
  });
  it('a stamp that was not current before stays not current, so `--index` restamps it as it would have', () => {
    const stale = v2(5, 'Aloe ferox', '9');
    stale.changed = { on: '2026-01-01', h: 'not the fingerprint' };
    const to = store();
    rekey({ from: store({ '5.json': stale }), to });
    expect(doc(to, 'k9.json').changed).toEqual({ on: '2026-01-01', h: 'not the fingerprint' });
  });
});

describe('--index: in place, by the rule', () => {
  const v3 = (d: ReturnType<typeof v2>, id: string) => ({ ...d, v: 3, key: id });
  it('a second run changes nothing', () => {
    const to = store();
    rekey({ from: store({ '2746231.json': v2(2746231, 'Babiana geniculata', '326701'), '7.json': v2(7, 'Aloe vera', '') }), to });
    to.writes.length = 0;
    const r = rekey({ to });
    expect(to.writes).toEqual([]);
    expect(to.removes).toEqual([]);
    expect(r).toMatchObject({ renamed: 0, followed: 0, kew: 1 });
  });
  it('a merge moves the kept page from GBIF\'s key to Kew\'s id, and the pages that name it follow; the merged page keeps its GBIF key', () => {
    const kept = v3(v2(11798439, 'Pelecyphora macromeris', '3294939'), 'g11798439');
    const away = v3(v2(3084426, 'Coryphantha macromeris', '3294939'), 'g3084426');
    const other = v3(v2(1, 'Aloe vera', '5', { photos: [{ ...template.photos[0], shared: ['g11798439'] }] }), 'k5');
    const s = store({ 'g11798439.json': kept, 'g3084426.json': away, 'k5.json': other });
    const r = rekey({ to: s, merges: [{ from: 3084426, into: 11798439 }] });
    expect([...s.m.keys()].sort()).toEqual(['g3084426.json', 'k3294939.json', 'k5.json']);
    expect(s.removes).toEqual(['g11798439.json']);
    expect(doc(s, 'k5.json').photos[0].shared).toEqual(['k3294939']);
    expect(r).toMatchObject({ renamed: 1, followed: 1 });
    expect(idsGbifLines(r)).toEqual(["g3084426\tCoryphantha macromeris\tmerged into GBIF's 11798439 (scripts/merged-pages.txt), which takes the Kew id"]);
  });
  it('a page that takes the file another page leaves reads nothing it wrote (two ids swapped)', () => {
    // A holds k1 by its entry 1, B k2 by 2; Kew's entries change: A's is now 2, B's 1.
    const a = v3(v2(100, 'Aloe a', '2'), 'k1'), b = v3(v2(200, 'Aloe b', '1'), 'k2');
    const s = store({ 'k1.json': a, 'k2.json': b });
    rekey({ to: s });
    expect(doc(s, 'k2.json').ids.gbif).toBe(100);
    expect(doc(s, 'k1.json').ids.gbif).toBe(200);
    expect(s.removes).toEqual([]);
  });
  it('a file that cannot be read, or two files of one GBIF key, stop it: no id is changed', () => {
    const s = store({ 'g1.json': v3(v2(1, 'Aloe vera', '5'), 'g1') });
    s.m.set('k9.json', '{"cut');
    const r = rekey({ to: s });
    expect(r.unreadable).toEqual(['k9.json']);
    expect(s.writes).toEqual([]);
    const t = store({ 'g1.json': v3(v2(1, 'Aloe vera', '5'), 'g1'), 'k5.json': v3(v2(1, 'Aloe vera', '5'), 'k5') });
    const r2 = rekey({ to: t });
    expect(r2.twice[0]).toMatch(/GBIF key 1, which .* holds too/);
    expect(t.writes).toEqual([]);
  });
  it('only dossier files are read: an id\'s file in version 3, a GBIF key\'s in version 2', () => {
    expect(['k1.json', 'g22.json'].every((f) => DOSSIER_FILE.test(f))).toBe(true);
    expect(['1.json', 'index.json', 'k1.json.tmp', 'manifest.json'].some((f) => DOSSIER_FILE.test(f))).toBe(false);
    expect(V2_FILE.test('2746231.json') && !V2_FILE.test('k1.json')).toBe(true);
  });
});
