/**
 * Round seventy, the owner's run (2026-10-13): the rebuild of 118 species changed or lost Wikidata items (drops.txt).
 * Read against Wikidata, three changes were right (Sorbaronia arsenii's Q15527618 carries its own GBIF key; Ceropegia
 * tanzaniensis's and Ceropegia penduliflora's old items carry the IPNI of another author's name) and three wrong:
 *   - Scilla siberica Andrews went from Q158944 to Q80686427, Othocallis siberica's item: Q158944, labelled "Siberian
 *     squill", carries Kew's 927545-1 for Scilla siberica Andrews, but the older names were asked before IPNI. Kew's
 *     identifier is now asked first;
 *   - Hibiscus acetosella Welw. ex Ficalho lost Q5750828: Kew writes the name "Welw. ex Hiern", and its identifier was
 *     read as another author's name's. A name with the same author before "ex" is one manuscript name, not a homonym;
 *   - Parrycactus flavovirens (Scheidw.) Doweld lost Q309595: the older names' search found Q309595, Ferocactus
 *     flavovirens, and Q109398281, Bisnaga flavovirens, which states no basionym; two items, no answer. Kew holds
 *     Parrycactus flavovirens as a synonym of Ferocactus flavovirens, and Q309595 carries that entry's IPNI 103628-2.
 * The answers are GBIF's, Kew's and Wikidata's of 2026-10-13, trimmed to what is read (fixtures/r70b-wikidata-items.json);
 * the older names' search for Scilla siberica is as the owner's rebuild found it, Wikidata's API having refused this
 * probe. An answer not held is a refusal. Each case FAILED on m70 unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { crossIds } from '$dossier/sources/wikimedia';
import * as gbif from '$dossier/sources/gbif';
import type { JsonFetcher } from '$dossier/fetch';

const ANSWERS: Record<string, unknown> = JSON.parse(readFileSync('tests/unit/fixtures/r70b-wikidata-items.json', 'utf8'));
const f = (async (url: string) => ANSWERS[url] ?? { status: 'refused', detail: `no fixture: ${url}` }) as unknown as JsonFetcher;

/** crossIds as the build asks it: the species' GBIF key, its same-type older names, the backbone's authorship. */
async function item(key: number) {
  const sp = await gbif.species(f, key);
  const syn = await gbif.synonyms(f, key);
  if (sp.status !== 'ok' || syn.status !== 'ok') throw new Error('no GBIF answer');
  const older = gbif.sameTypeNames({ key, basionymKey: sp.data.basionymKey }, syn.rows ?? []).map((r) => ({ key: r.key, name: r.name }));
  return crossIds(f, sp.data.canonicalName ?? '', key, older, { authorship: sp.data.authorship });
}

describe('the items the rebuild changed wrongly, found again', () => {
  it('Scilla siberica Andrews: Q158944, by Kew\'s IPNI identifier, before the older names', async () => {
    const r = await item(8080743);
    // Round seventy, the owner's second run: Q158944 gives the name as an alias, and is proved there by Kew's identifier.
    expect(r).toMatchObject({ status: 'ok', detail: "found by its alias; its IPNI identifier 927545-1 is Kew's for Scilla siberica Andrews", data: { wikidata: 'Q158944', ipni: '927545-1', inat: 862704 } }); // m70: Q80686427, Othocallis siberica
  });
  it('Hibiscus acetosella Welw. ex Ficalho: Q5750828, whose IPNI is Kew\'s "Welw. ex Hiern", the one name', async () => {
    const r = await item(7802717);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q5750828' } }); // m70: refused, "another author's name"
  });
  it('Parrycactus flavovirens: Q309595, the item of Ferocactus flavovirens, the name Kew accepts for it', async () => {
    const r = await item(3946677);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q309595' } }); // m70: ambiguous, Q309595 and Q109398281
  });
  it('Parrycactus flavovirens, by the older names alone: Kew\'s accepted entry tells the two items apart', async () => {
    const g = (async (u: string) => (u.includes('action=wbsearchentities') ? { status: 'ok', data: { search: [] } } : f(u))) as unknown as JsonFetcher;
    const sp = await gbif.species(g, 3946677);
    const syn = await gbif.synonyms(g, 3946677);
    if (sp.status !== 'ok' || syn.status !== 'ok') throw new Error('no GBIF answer');
    const older = gbif.sameTypeNames({ key: 3946677, basionymKey: sp.data.basionymKey }, syn.rows ?? []).map((x) => ({ key: x.key, name: x.name }));
    const r = await crossIds(g, 'Parrycactus flavovirens', 3946677, older, { authorship: sp.data.authorship });
    expect(r).toMatchObject({ status: 'ok', detail: 'found by the GBIF record of Ferocactus flavovirens, an older name with the same type, the item of Ferocactus flavovirens (Scheidw.) Britton & Rose, the name Kew accepts for it', data: { wikidata: 'Q309595' } });
  });
});

describe('the reading under them (guards)', () => {
  it('Kew\'s rows: Parrycactus flavovirens is a synonym, and its entry\'s key is read', async () => {
    const k = await gbif.kewIpni(f, 'Parrycactus flavovirens', '(Scheidw.) Doweld');
    expect(k.status === 'ok' && k.data.ids).toEqual(['1014461-1']);
  });
  it('two items left by the older names and neither Kew\'s accepted entry\'s are still no answer', async () => {
    const strip = (u: string) => (u.includes('action=wbsearchentities') ? { status: 'ok', data: { search: [] } } : u.includes('ids=Q14943408|Q309595|Q109398281&props=claims') ? { status: 'ok', data: { entities: { Q14943408: { claims: {} }, Q309595: { claims: {} }, Q109398281: { claims: {} } } } } : ANSWERS[u] ?? { status: 'refused', detail: 'no fixture' });
    const g = (async (u: string) => strip(u)) as unknown as JsonFetcher;
    const sp = await gbif.species(g, 3946677);
    const syn = await gbif.synonyms(g, 3946677);
    if (sp.status !== 'ok' || syn.status !== 'ok') throw new Error('no GBIF answer');
    const older = gbif.sameTypeNames({ key: 3946677, basionymKey: sp.data.basionymKey }, syn.rows ?? []).map((r) => ({ key: r.key, name: r.name }));
    expect((await crossIds(g, 'Parrycactus flavovirens', 3946677, older, { authorship: sp.data.authorship })).status).toBe('ambiguous');
  });
});
