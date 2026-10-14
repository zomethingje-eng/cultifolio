/**
 * Round seventy, the owner's second run: `--fill wikidata` listed 86 species for a rebuild (run3-rebuild-wd.txt). Run
 * again by the fixed rule over all 86 with Wikidata's, GBIF's, Kew's and IPNI's answers of 2026-10-14, most keep their
 * item. These are the cases that each turned on one reading; their answers are recorded in
 * fixtures/r70c-wikidata-86.json, trimmed to what is read. Each case FAILED on m70b unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as wm from '$dossier/sources/wikimedia';
import { crossIds } from '$dossier/sources/wikimedia';
import * as gbif from '$dossier/sources/gbif';
import { fillWikidata } from '$dossier/corpus-fills';
import type { JsonFetcher } from '$dossier/fetch';

const W: { answers: Record<string, unknown> } = JSON.parse(readFileSync('tests/unit/fixtures/r70c-wikidata-86.json', 'utf8'));
const f = (async (url: string) => W.answers[url] ?? { status: 'refused', detail: `no fixture: ${url}` }) as unknown as JsonFetcher;
async function item(key: number) {
  const sp = await gbif.species(f, key);
  const syn = await gbif.synonyms(f, key);
  if (sp.status !== 'ok' || syn.status !== 'ok') throw new Error('no GBIF answer');
  const older = gbif.sameTypeNames({ key, basionymKey: sp.data.basionymKey }, syn.rows ?? []).map((r) => ({ key: r.key, name: r.name }));
  return crossIds(f, sp.data.canonicalName ?? '', key, older, { authorship: sp.data.authorship, family: sp.data.family });
}

describe('the species\' own items, kept', () => {
  it.each([
    [10719858, 'Gymnocalycium hossei', 'Q1341344', /IPNI's record of Gymnocalycium hossei A\.Berger, the same name/], // Kew's "(F.Haage) A.Berger"; the backbone "(F.Haage ex A.Berger) A.W.Hill"
    [10485981, 'Dudleya gnoma', 'Q5312056', /Dudleya gnoma S\.McCabe, the same name/], // "S.Mc Cabe" and "S.W.McCabe": initials in a row
    [10852101, 'Mammillaria pennispinosa', 'Q290325', /Mammillaria pennispinosa Krainz, the same name/], // "Krainz ex Shurly" cited as "Krainz"
    [11065948, 'Ipomoea lobata', 'Q159207', /269217-1 is IPNI's record of Ipomoea lobata Thell\., the same name/], // IPNI's duplicate of Kew's 129456-2
    [7537473, 'Agave applanata', 'Q391637', /an isonym of Kew's Agave applanata K\.Koch/], // "Lem. ex Jacobi", IPNI's isonym
    [8414451, 'Begonia grandis', 'Q1037925', /Begonia grandes Dryand\., the same name/], // IPNI spells it "grandes"
    [7579806, 'Castanospermum australe', 'Q783001', /found by its label/], // "A.Cunn. ex Mudie" and "A.Cunn. & C.Fraser": one person
    [3702155, 'Nepenthes burbidgei', 'Q4912319', /the epithet spelt otherwise/], // labelled "Nepenthes burbidgeae"
    [7344766, 'Rudbeckia fulgida', 'Q450250', /the same name/] // m70b moved it to Q109610929
  ])('%s %s: %s', async (key, _name, q, detail) => {
    const r = await item(key);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: q } }); // m70b: none, or another item
    expect(r.status === 'ok' && r.detail).toMatch(detail);
  });
  it('Weingartia glomeriseta: not Sulcorebutia arenacea\'s item, which gives the name as an alias, but the same type\'s (guard)', async () => {
    const r = await item(3948045);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q15313619' } });
  });
  it('Hibbertia scandens keeps Q5750660, proved by a synonym\'s GBIF key (m70b moved it to Q38825578)', async () => {
    expect(await item(8129928)).toMatchObject({ status: 'ok', data: { wikidata: 'Q5750660' } });
  });
});

describe('what stays refused', () => {
  it('Raphionacme linearis K.Schum.: its item\'s GBIF record is N.E.Brown\'s name', async () => {
    const r = await item(7438714);
    expect(r).toMatchObject({ status: 'none', detail: expect.stringMatching(/GBIF's record of Raphionacme linearis N\.E\.Br\., 1902, another author's name/) });
  });
  it('Cyphostemma calcarium: the earlier item was the paper describing it; no taxon item exists (guard)', async () => {
    expect((await item(11120031)).status).toBe('none');
  });
});

describe('--fill wikidata gives each "no item" a reason', () => {
  it('a bare none is said as what was looked for', async () => {
    const docs: Record<string, unknown> = { a: { key: 11120031, name: { scientific: 'Cyphostemma calcarium', authorship: 'Rabarij. & L.M.Lu', family: 'Vitaceae' }, ids: { wikidata: 'Q110694306' }, links: {}, upstream: { wikidata: { status: 'ok', at: 'x', detail: 'found by its label' } } } };
    const g = (async (u: string) => (u.includes('action=wbgetentities') && u.includes('Q110694306&props=claims&') ? { status: 'ok', data: { entities: { Q110694306: { claims: {} } } } } : f(u))) as unknown as JsonFetcher;
    const c = await fillWikidata({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } }, g);
    expect(c.lines).toEqual([`Cyphostemma calcarium [11120031]: Q110694306 → no item (none: ${wm.NO_ITEM})`]); // m70b: "no item (none)"
  });
});
