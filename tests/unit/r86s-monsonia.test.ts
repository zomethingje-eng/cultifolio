/**
 * Round eighty-six, the sources agent: review D's D12. Monsonia lheritieri (Sweet) Steud. (g8005942), whose name Kew holds
 * only under another author (Monsonia lheritieri DC., an illegitimate name, 2371982), lost round eighty-four's true line
 * "Kew holds Monsonia lheritieri only under another author" to the offline walk: the bulk path asks GBIF for the national
 * checklists after Kew's answer, the offline fetcher answered "not asked", and that took the whole range row with it
 * (`wcvp.distribution: skipped`, "api.gbif.org not asked: offline re-derivation"), so the climate read "pending" and the
 * front page counted it the one "pending" page. Now Kew's answer stands, offline, and only the checklists are said as not
 * asked; the climate is then "none", as for every page Kew holds no entry of (its records cannot be told from cultivation).
 *
 * The rows: Kew's wcvp_names.csv of 2026-06-04 (2371982 and 2588865); the page as the live corpus held it on 2026-11-05.
 *
 * On r86base (9cf3077) the first `it` FAILED: the answer was `skipped`, "api.gbif.org not asked: offline re-derivation".
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, parseWcvpName, bulkFetcher } from '$dossier/bulk';
import { offlineFetcher } from '$dossier/rederive';
import * as gbif from '$dossier/sources/gbif';
import type { JsonFetcher } from '$dossier/fetch';

const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const ROWS = [
  '2588865|377293-1|Species|Unplaced|Geraniaceae||Sarcocaulon||lheritieri||||Sweet||Hort. Brit.|: 73|(1826)|, nom. superfl.|N. Cape Prov.|succulent subshrub or shrub|desert or dry shrubland|Sarcocaulon lheritieri|Sweet||2371982|DC.||2588952|377293-1||N',
  "2371982|374530-1|Species|Illegitimate|Geraniaceae||Monsonia||lheritieri||||DC.||Prodr.| 1: 638|(1824)|, nom. illeg. superfl.||||Monsonia lheritieri|DC.|2588865|2372015|L'Hér.|T||374530-1||N"
];

describe('D12: an offline derivation keeps Kew\'s answer; only the checklists it did not ask are said as not asked', () => {
  const w = new WcvpIndex();
  for (const l of ROWS) w.addName(parseWcvpName(NAMES_H, l), () => true);
  const net: JsonFetcher = (async () => { throw new Error('asked the network'); }) as never;
  const prev = (key: number) => (key === 8005942 ? { key, scientific: 'Monsonia lheritieri', authorship: '(Sweet) Steud.' } : null);

  it('Monsonia lheritieri: "Kew holds it only under another author", the checklists not asked; never the whole row skipped', async () => {
    const f = bulkFetcher(offlineFetcher(net, prev), { wcvp: w });
    const r = await gbif.distributions(f, 8005942);
    expect(r.status).toBe('none'); // base: skipped
    expect((r as { detail?: string }).detail).toMatch(/^Kew holds Monsonia lheritieri only under another author \(Monsonia lheritieri DC\.[^)]*\), which is another name; GBIF's national checklists not asked \(api\.gbif\.org not asked: offline re-derivation\)$/);
  });

  it('online, GBIF\'s checklists answered: as before, Kew\'s words and no word of "not asked" (guard)', async () => {
    const online: JsonFetcher = (async (url: string) => (url.endsWith('/species/8005942') ? { status: 'ok', data: { key: 8005942, canonicalName: 'Monsonia lheritieri', authorship: '(Sweet) Steud.' } } : url.includes('/synonyms') ? { status: 'ok', data: { results: [], endOfRecords: true } } : { status: 'ok', data: { results: [] } })) as never;
    const r = await gbif.distributions(bulkFetcher(online, { wcvp: w }), 8005942);
    expect(r.status).toBe('none');
    expect((r as { detail?: string }).detail).toMatch(/^Kew holds Monsonia lheritieri only under another author/);
    expect((r as { detail?: string }).detail).not.toContain('not asked');
  });
});
