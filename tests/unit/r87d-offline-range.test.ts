/**
 * Round eighty-seven, the data agent: item 5. Conophytum tomasii [g3702919], whose name Kew's file holds no row of, takes
 * its range from Kew's entry under one of GBIF's older names for it, which only an online build asks; round eighty-six's
 * offline walk wrote its range row "none" and dropped the range (the walk's drop). Now the bulk path says the range was
 * not asked offline (rule 2: never "none"), the walk carries the range, records and climate the page had (`carriesCore`,
 * as one snapshot), its rows keep what the build before said, and the page is listed for an online build
 * (rebuild-offline.txt). As round eighty-six's D12 kept Kew's answer for Monsonia lheritieri (r86s-monsonia.test.ts, which
 * stands).
 *
 * On r86 (db5a68d) the first `it` FAILED: the answer was "none", "Kew's file holds no row of …, and GBIF's older names for
 * it were not read (skipped); GBIF's national checklists not asked (…)".
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, parseWcvpName, bulkFetcher, NOT_ASKED_OFFLINE, bulkWords } from '$dossier/bulk';
import { offlineFetcher } from '$dossier/rederive';
import { carriesCore } from '$dossier/carry-core';
import * as gbif from '$dossier/sources/gbif';
import type { JsonFetcher } from '$dossier/fetch';

const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
// Another Conophytum Kew holds, so the index is not empty; none of tomasii's own words.
const ROW = '1|1-1|Species|Accepted|Aizoaceae||Conophytum||bilobum||||(Marloth) N.E.Br.||||(1922)||Cape Prov.|succulent|desert|Conophytum bilobum|(Marloth) N.E.Br.|1||||||N';

describe("an offline derivation of a page Kew holds no row of: the range not asked, never none", () => {
  const w = new WcvpIndex();
  w.addName(parseWcvpName(NAMES_H, ROW), () => true);
  const net: JsonFetcher = (async () => { throw new Error('asked the network'); }) as never;
  const prev = (key: number) => (key === 3702919 ? { key, scientific: 'Conophytum tomasii', authorship: 'S.A.Hammer' } : null);

  it('Conophytum tomasii offline: "not asked: offline", status skipped (r86: none)', async () => {
    const stats = { wcvp: 0, occ: 0, media: 0, through: 0, occApi: 0, unasked: 0 };
    const r = await gbif.distributions(bulkFetcher(offlineFetcher(net, prev), { wcvp: w }, stats), 3702919);
    expect(r.status).toBe('skipped'); // r86: none
    expect((r as { detail?: string }).detail).toBe(`${NOT_ASKED_OFFLINE}: Kew's file holds no row of Conophytum tomasii S.A.Hammer, and GBIF's older names for it, by which an online build reads Kew's range, were not asked`);
    expect(stats.unasked).toBeGreaterThan(0);
  });

  it('online, GBIF\'s older names answered and none leading to Kew: "none", with why, as before (guard)', async () => {
    const online: JsonFetcher = (async (url: string) => (url.endsWith('/species/3702919') ? { status: 'ok', data: { key: 3702919, canonicalName: 'Conophytum tomasii', authorship: 'S.A.Hammer' } } : url.includes('/synonyms') ? { status: 'ok', data: { results: [], endOfRecords: true } } : { status: 'ok', data: { results: [] } })) as never;
    const r = await gbif.distributions(bulkFetcher(online, { wcvp: w }), 3702919);
    expect(r.status).toBe('none');
    expect((r as { detail?: string }).detail).toMatch(/holds no row of Conophytum tomasii S\.A\.Hammer, and GBIF lists no older name for it/);
  });

  it('the walk then carries the snapshot the page had: its range is kept', () => {
    const prevPage = { v: 3, ids: { gbif: 3702919 }, upstream: { 'gbif.occurrences': { status: 'ok' }, 'wcvp.distribution': { status: 'ok' } } };
    const now = { v: 3, ids: { gbif: 3702919 }, upstream: { 'gbif.occurrences': { status: 'ok' }, 'wcvp.distribution': { status: 'skipped' } } };
    expect(carriesCore(prevPage, now, true)).toBe(true);
    // r86's walk: "none" carried nothing, and the range went.
    expect(carriesCore(prevPage, { ...now, upstream: { ...now.upstream, 'wcvp.distribution': { status: 'none' } } }, true)).toBe(false);
  });
});

describe("the walk's last line says what the requests passed on were (item 7)", () => {
  it('occurrence searches answered, not asked, and the rest', () => {
    expect(bulkWords({ wcvp: 48000, occ: 47000, media: 30000, through: 56990, occApi: 1210, unasked: 3800 })).toBe("bulk: 48000 distributions, 47000 occurrence sets and 30000 photograph sets from the files; 56990 requests passed on: 1210 answered by GBIF's occurrence search (the species the download left to the API path, and keys it does not hold: their records are the ones --list-derived counts), 3800 not asked (offline), 51980 answered otherwise (a species' name from the previous dossier offline, Kew's names from Kew's file, GBIF's backbone online)");
  });
  it('an occurrence search the files do not hold is counted as GBIF\'s answer', async () => {
    const stats = { wcvp: 0, occ: 0, media: 0, through: 0, occApi: 0, unasked: 0 };
    const base: JsonFetcher = (async (url: string) => (url.includes('/occurrence/search') ? { status: 'ok', data: { results: [], endOfRecords: true, count: 0 } } : { status: 'skipped', detail: 'not asked: offline re-derivation' })) as never;
    await gbif.occurrences(bulkFetcher(base, { apiPath: new Set([9]) }, stats), 9);
    await gbif.synonyms(bulkFetcher(base, {}, stats), 9);
    expect(stats).toMatchObject({ through: 2, occApi: 1, unasked: 1 });
  });
});
