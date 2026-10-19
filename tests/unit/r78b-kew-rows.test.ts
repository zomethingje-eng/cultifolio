/**
 * Round seventy-eight, agent B: Kew's names from Kew's file in place of GBIF's copy of them (`kew-rows.ts`), on
 * recorded answers: GBIF's answers of 2026-10-19 to `/species?datasetKey=<WCVP>&name=` for six names, and the lines of
 * Kew's wcvp_names.csv (2026-06-04) under them (`fixtures/r78b-kew-recorded.json`).
 *
 *   - Every row's fields, as the build reads them, are the same, a synonym's family its accepted entry's (Ixora coccinea
 *     Comm. ex Lam. is Proteaceae in GBIF's copy, where Kew's file says Rubiaceae, and `kewIpni` reads it so).
 *   - `kewIpni`, the numbers a page links and the name it cites, answers the same; Rubus parviflorus's rows by other
 *     authors come in Kew's order, not GBIF's (the one difference the live comparison of 50 species found).
 *   - The keys made here answer their own requests (an accepted entry's record; a genus's accepted species) and never
 *     a GBIF key's; a name of a genus not loaded goes to GBIF (rule 2: never read as "none").
 * Each case FAILED on r78base (no `kew-rows.ts`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import * as gbif from '$dossier/sources/gbif';
import { wcvpRow } from '$dossier/bulk';
import { genusCount } from '$dossier/summary-proof';

const mod = await import('$dossier/kew-rows').catch(() => null);
const need = () => { if (!mod) throw new Error('src/lib/dossier/kew-rows.ts is missing'); return mod; };

const rec = JSON.parse(readFileSync('tests/unit/fixtures/r78b-kew-recorded.json', 'utf8')) as { gbif: Record<string, { results: Array<Record<string, unknown>> }>; kew: string[] };
const URL = (n: string) => `https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&name=${encodeURIComponent(n)}&limit=50`;
const NAMES = ['Ixora coccinea', 'Rubus parviflorus', 'Agave variegata', 'Aloe vera', 'Welwitschia', 'Lonicera minutiflora'];
const replay = (asked?: string[]): JsonFetcher => (async <T>(url: string): Promise<FetchResult<T>> => { asked?.push(url); return url in rec.gbif ? { status: 'ok', data: rec.gbif[url] as T } : { status: 'refused', detail: `not recorded: ${url}` }; }) as JsonFetcher;
function kewOf() {
  const { KewRows } = need();
  const k = new KewRows(['Ixora', 'Rubus', 'Agave', 'Aloe', 'Welwitschia', 'Lonicera']);
  const h = rec.kew[0].split('|');
  for (const line of rec.kew.slice(1)) {
    const r = wcvpRow(h, line);
    k.add({ id: r.plant_name_id, name: r.taxon_name, authors: r.taxon_authors, status: r.taxon_status, rank: r.taxon_rank, family: r.family, acceptedId: r.accepted_plant_name_id, parentId: r.parent_plant_name_id, powoId: r.powo_id });
  }
  return k;
}
const FIELDS = ['taxonID', 'scientificName', 'canonicalName', 'authorship', 'taxonomicStatus', 'accepted', 'references', 'rank', 'family'];
const proj = (rows: Array<Record<string, unknown>>) => rows.map((r) => Object.fromEntries(FIELDS.map((f) => [f, r[f] == null || r[f] === '' ? null : String(r[f])]))).sort((a, b) => Number(a.taxonID) - Number(b.taxonID));

describe("Kew's names from Kew's file, as GBIF's copy answers them", () => {
  for (const name of NAMES) {
    it(`${name}: every row, field for field`, async () => {
      const { kewRowsFetcher } = need();
      const f = kewRowsFetcher(replay(), kewOf());
      const r = await f<{ results: Array<Record<string, unknown>> }>(URL(name));
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(proj(r.data.results)).toEqual(proj(rec.gbif[URL(name)].results));
    });
  }
  it('kewIpni answers the same, but for the order of Rubus parviflorus\'s other authors', async () => {
    const { kewRowsFetcher } = need();
    const f = kewRowsFetcher(replay(), kewOf());
    const cases: Array<[string, string, string]> = [['Ixora coccinea', 'Comm. ex Lam.', 'Rubiaceae'], ['Agave variegata', 'Jacobi', 'Asparagaceae'], ['Aloe vera', '(L.) Burm.f.', 'Asphodelaceae'], ['Rubus parviflorus', 'Nutt.', 'Rosaceae'], ['Lonicera minutiflora', 'Zabel', 'Caprifoliaceae']];
    for (const [n, a, fam] of cases) {
      const want = await gbif.kewIpni(replay(), n, a, fam);
      const got = await gbif.kewIpni(f, n, a, fam);
      const norm = (x: typeof want) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'acceptedKeys' ? undefined : k === 'others' ? [...v].sort((p: { id: string }, q: { id: string }) => p.id.localeCompare(q.id)) : v)));
      expect(norm(got), n).toEqual(norm(want));
    }
    // Ixora coccinea Comm. ex Lam. is in Proteaceae as GBIF writes it, so Kew's row for Linnaeus's name is the one linked.
    const ix = await gbif.kewIpni(f, 'Ixora coccinea', 'Comm. ex Lam.', 'Rubiaceae');
    expect(ix).toMatchObject({ status: 'ok', data: { ids: ['753844-1'], label: 'Ixora coccinea L.' } });
  });
  it('its keys answer their own requests: an accepted entry, a genus\'s accepted species; a genus not loaded goes to GBIF', async () => {
    const { kewRowsFetcher, KEW_KEY } = need();
    const asked: string[] = [];
    const f = kewRowsFetcher(replay(asked), kewOf());
    // Agave variegata Jacobi is Kew's synonym of Manfreda variegata: the entry's number, read back by the key made here.
    const av = await gbif.kewIpni(f, 'Agave variegata', 'Jacobi', 'Asparagaceae');
    expect(av.status).toBe('ok');
    if (av.status !== 'ok') return;
    const acc = av.data.acceptedKeys ?? [];
    expect(acc).toEqual([KEW_KEY + 281412]);
    expect(await gbif.kewEntryIpni(f, acc)).toEqual({ status: 'ok', data: [{ id: '152327-2', label: 'Manfreda variegata (Jacobi) Rose' }] });
    // A genus's accepted species, for the proof of a genus's article (`genusCount`): Kew accepts one Welwitschia.
    expect(await genusCount(f, 'Welwitschia')).toEqual({ status: 'ok', data: { name: 'Welwitschia', accepted: 1, only: 'Welwitschia mirabilis' } });
    const before = asked.length;
    // A name of a genus not loaded is asked of GBIF's copy: here, not recorded, so refused, never "none".
    expect((await f(URL('Quercus robur'))).status).toBe('refused');
    expect(asked.length).toBe(before + 1);
  });
});
