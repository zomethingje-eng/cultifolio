/**
 * Round sixty-nine, triage-68 M2 (S-A1, IND-9, R46-11) with M4's reuse of the builder's synonyms and M11's guards: Kew's
 * range under an older name gave Lantana ×strigocamara the native range of Lantana camara subsp. aculeata. The WCVP rows
 * are Kew's as GBIF republishes them (dataset f382f0ce, read 2026-10-11), the synonyms GBIF's own. Each case FAILED on
 * 1609c19 unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { WcvpIndex, bulkFetcher, authorsAgree, type WcvpName, type WcvpDist } from '$dossier/bulk';
import { distributions } from '$dossier/sources/gbif';
import { rangeSource } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher, type FetchResult } from '$dossier/fetch';

const GBIF = 'https://api.gbif.org/v1';
const nm = (id: string, name: string, status: string, acceptedId: string, authors: string, rank = 'Species'): WcvpName => ({ id, name, status, acceptedId, rank, authors });
const ds = (id: string, l3: string, area: string, introduced = false): WcvpDist => ({ id, l3, area, introduced, extinct: false, doubtful: false });
const all = () => true;

/** Kew's Lantana rows that matter here, by plant_name_id. */
const LANTANA = [
  nm('347186', 'Lantana × strigocamara', 'Accepted', '347186', 'R.W.Sanders'),
  nm('108188', 'Lantana × mutabilis', 'Synonym', '347186', 'Lippold ex Otto & Dietr.'),
  nm('108189', 'Lantana × mutabilis', 'Accepted', '108189', 'Weigel'),
  nm('108190', 'Lantana mutabilis', 'Synonym', '347184', 'Salisb.'),
  nm('347184', 'Lantana camara subsp. aculeata', 'Accepted', '347184', '(L.) R.W.Sanders', 'Subspecies')
];
/** GBIF's synonyms of Lantana strigocamara (4084229). */
const LANTANA_SYN = [
  { key: 7940972, scientificName: 'Lantana crocea var. superba H.Williams', canonicalName: 'Lantana crocea superba', authorship: 'H.Williams', rank: 'VARIETY', taxonomicStatus: 'SYNONYM' },
  { key: 8574203, scientificName: 'Lantana ×mutabilis Lippold', canonicalName: 'Lantana mutabilis', authorship: 'Lippold', rank: 'SPECIES', taxonomicStatus: 'HOMOTYPIC_SYNONYM' },
  { key: 8068687, scientificName: 'Lantana ×mutabilis Lippold ex Otto & Dietr.', canonicalName: 'Lantana mutabilis', authorship: 'Lippold ex Otto & Dietr.', rank: 'SPECIES', taxonomicStatus: 'HETEROTYPIC_SYNONYM' }
];
const older = (rows: typeof LANTANA_SYN) => rows.map((r) => ({ name: r.canonicalName, authorship: r.authorship, status: r.taxonomicStatus }));

function lantana(rows = LANTANA, dist: WcvpDist[] = [ds('347184', 'MXS', 'Mexico Southwest'), ds('347184', 'BAH', 'Bahamas')]): WcvpIndex {
  const k = new WcvpIndex();
  for (const r of rows) k.addName(r, all);
  for (const d of dist) k.addDist(d);
  return k;
}

/** A base fetcher that answers the backbone and the synonyms, and records what it was asked. */
function backbone(key: number, sp: Record<string, unknown>, syn: unknown[], asked: string[] = []): JsonFetcher {
  const t = fixtureFetcher({ [`${GBIF}/species/${key}/synonyms`]: { results: syn, endOfRecords: true }, [`${GBIF}/species/${key}`]: sp }, { status: 'none' } as never);
  return (async (url: string) => { asked.push(url); return t(url); }) as JsonFetcher;
}

describe('the hybrid sign: Kew\'s own entry for a nothospecies', () => {
  it('is found under GBIF\'s name, which writes no "×"', () => {
    const got = lantana().distributions('Lantana strigocamara', 'R.W.Sanders');
    expect(got && got !== 'ambiguous' ? got.entry.id : got).toBe('347186'); // base: null, and the older names were asked
  });
  it('held with no range, is Kew\'s answer, and the older names are never asked', async () => {
    const asked: string[] = [];
    const f = bulkFetcher(backbone(4084229, { key: 4084229, canonicalName: 'Lantana strigocamara', authorship: 'R.W.Sanders' }, LANTANA_SYN, asked), { wcvp: lantana() });
    const r = await distributions(f as JsonFetcher, 4084229);
    expect(r).toMatchObject({ status: 'ok', data: { rows: [], wcvp: true, held: 'Lantana × strigocamara R.W.Sanders' } }); // base: Lantana camara subsp. aculeata's range
    expect(asked.some((u) => u.includes('/synonyms'))).toBe(false);
    expect(rangeSource(r)).toBe('WCVP (Govaerts, RBG Kew): Kew holds Lantana × strigocamara R.W.Sanders, with no native range');
  });
  it('held with introduced rows only, gives those rows and still no fallback (guard)', () => {
    const got = lantana(LANTANA, [ds('347186', 'FLA', 'Florida', true)]).distributions('Lantana strigocamara', 'R.W.Sanders');
    expect(got && got !== 'ambiguous' ? got.rows.map((r) => r.establishmentMeans) : got).toEqual(['INTRODUCED']);
  });
});

describe('an older name counts only where its author agrees', () => {
  // Kew without its own Lantana × strigocamara rows: the path the owner's run took.
  const without = () => lantana(LANTANA.filter((r) => !/strigocamara|× mutabilis/.test(r.name)));
  it('a single WCVP row by another author is not the older name: no single-row bypass', () => {
    expect(without().viaOlderNames(older(LANTANA_SYN))).toBeNull(); // base: Lantana camara subsp. aculeata
  });
  it('authors agree read loosely, and with or without an ex-author (guard)', () => {
    expect(authorsAgree('(Phil.) Britton & Rose', '(Phil.)Britton&Rose')).toBe(true);
    expect(authorsAgree('Lippold ex Otto & Dietr.', 'Otto & Dietr.')).toBe(true);
    expect(authorsAgree('Lippold', 'Salisb.')).toBe(false);
    expect(authorsAgree('Lippold', 'Lippold ex Otto & Dietr.')).toBe(false); // the ex-author is not the author
    expect(authorsAgree(undefined, 'Salisb.')).toBe(false);
  });
  it('an entry reached below species rank is not taken', () => {
    const k = lantana([nm('108190', 'Lantana mutabilis', 'Synonym', '347184', 'Salisb.'), LANTANA[4]]);
    expect(k.viaOlderNames([{ name: 'Lantana mutabilis', authorship: 'Salisb.' }])).toBeNull(); // base: the subspecies' range
  });
  it('a pro parte synonym is skipped', () => {
    const k = new WcvpIndex();
    k.addName(nm('1', 'Oenothera biennis', 'Accepted', '1', 'L.'), all);
    k.addName(nm('2', 'Oenothera leptocarpa', 'Synonym', '1', 'Greene'), all);
    k.addDist(ds('1', 'NEB', 'Nebraska'));
    expect(k.viaOlderNames([{ name: 'Oenothera leptocarpa', authorship: 'Greene', status: 'PROPARTE_SYNONYM' }])).toBeNull(); // base: Oenothera biennis's range
    expect(k.viaOlderNames([{ name: 'Oenothera leptocarpa', authorship: 'Greene', status: 'SYNONYM' }])).not.toBeNull(); // guard
  });
});

describe('Erythrina caffra still reaches Kew\'s Erythrina afra through heterotypic names (guard, S-A1)', () => {
  const k = new WcvpIndex();
  for (const r of [nm('2800800', 'Erythrina afra', 'Accepted', '2800800', 'Thunb.'), nm('2800802', 'Erythrina afra', 'Synonym', '2800803x', 'Blanco'), nm('2800854', 'Erythrina fissa', 'Synonym', '2800800', 'C.Presl'), nm('2800900', 'Erythrina insignis', 'Synonym', '2800800', 'Tod.'), nm('2801061', 'Erythrina viarum', 'Synonym', '2800800', 'Tod.'), nm('2800817', 'Erythrina constantiana', 'Synonym', '2800800', 'Micheli'), nm('2718713', 'Chirocalyx pubescens', 'Synonym', '2800800', 'Walp.'), nm('2778863', 'Duchassaingia afra', 'Synonym', '2800800', '(Thunb.) Walp.')]) k.addName(r, all);
  k.addDist(ds('2800800', 'CPP', 'Cape Provinces'));
  // GBIF's synonyms of Erythrina caffra Thunb. (5349557), in GBIF's order.
  const syn = [['Chirocalyx pubescens', 'Walp.'], ['Corallodendron caffrum', '(Thunb.) Kuntze'], ['Duchassaingia caffra', '(Thunb.) Walp.'], ['Erythrina constantiana', 'Micheli'], ['Erythrina fissa', 'C.Presl'], ['Erythrina insignis', 'Tod.'], ['Erythrina viarum', 'Tod.']].map(([name, authorship]) => ({ name, authorship, status: 'SYNONYM' }));
  it('one entry, at species rank, named with the older name it was reached by', () => {
    expect(k.holds('Erythrina caffra')).toBe(false);
    const got = k.viaOlderNames(syn);
    expect(got && 'via' in got ? [got.entry.name, got.entry.authors, got.via, got.rows.length] : got).toEqual(['Erythrina afra', 'Thunb.', 'Chirocalyx pubescens Walp.', 1]);
  });
});

describe('the "exactly one" rule counts every entry reached (M11 guards)', () => {
  it('an accepted entry with no range counts: one with and one without is no answer', () => {
    const k = new WcvpIndex();
    k.addName(nm('a', 'Aus one', 'Accepted', 'a', 'X.'), all);
    k.addName(nm('b', 'Bus two', 'Accepted', 'b', 'Y.'), all);
    k.addDist(ds('a', 'MXC', 'Mexico Central'));
    expect(k.viaOlderNames([{ name: 'Aus one', authorship: 'X.' }, { name: 'Bus two', authorship: 'Y.' }])).toMatchObject({ ambiguous: expect.stringMatching(/2 Kew entries/) }); // base: Aus one's range
  });
  it('one older name Kew holds twice under two entries ends the lookup, whatever another name finds', () => {
    const k = new WcvpIndex();
    k.addName(nm('h1', 'Homo nym', 'Synonym', 'a', 'Z.'), all);
    k.addName(nm('h2', 'Homo nym', 'Synonym', 'b', 'Z.'), all);
    k.addName(nm('a', 'Aus one', 'Accepted', 'a', 'X.'), all);
    k.addName(nm('b', 'Bus two', 'Accepted', 'b', 'Y.'), all);
    k.addDist(ds('a', 'MXC', 'Mexico Central'));
    k.addDist(ds('b', 'MXN', 'Mexico Northwest'));
    expect(k.viaOlderNames([{ name: 'Aus one', authorship: 'X.' }, { name: 'Homo nym', authorship: 'Z.' }])).toMatchObject({ ambiguous: expect.stringMatching(/under 2 entries/) });
  });
  it('the entry resolved by its author is the one whose range is read (IND-9)', () => {
    const k = new WcvpIndex();
    k.addName(nm('a', 'Aloe alba', 'Accepted', 'a', 'Alpha'), all);
    k.addName(nm('b', 'Aloe alba', 'Accepted', 'b', 'Beta'), all);
    k.addDist(ds('a', 'MXC', 'Mexico Central'));
    k.addDist(ds('b', 'CPP', 'Cape Provinces'));
    const got = k.viaOlderNames([{ name: 'Aloe alba', authorship: 'Beta' }]);
    expect(got && 'rows' in got ? got.rows.map((r) => r.locationId) : got).toEqual(['TDWG:CPP']); // base: null, looked up again without its author
  });
});

describe('the bulk fetcher reads the builder\'s own synonyms (M4)', () => {
  const k = new WcvpIndex();
  k.addName(nm('fg', 'Ferocactus glaucescens', 'Accepted', 'fg', '(DC.) Britton & Rose'), all);
  k.addDist(ds('fg', 'MXE', 'Mexico Northeast'));
  const sp = { key: 11098779, canonicalName: 'Bisnaga glaucescens', authorship: '(DC.) Doweld' };
  const syn = [{ key: 3959669, scientificName: 'Ferocactus glaucescens (DC.) Britton & Rose', canonicalName: 'Ferocactus glaucescens', authorship: '(DC.) Britton & Rose', rank: 'SPECIES', taxonomicStatus: 'HOMOTYPIC_SYNONYM' }];
  it('GBIF is asked for them once, by the builder, and the fallback reads that answer', async () => {
    const asked: string[] = [];
    const f = bulkFetcher(backbone(11098779, sp, syn, asked), { wcvp: k }) as JsonFetcher;
    await f(`${GBIF}/species/11098779/synonyms?limit=100&offset=0`); // the builder's ask
    const r = await distributions(f, 11098779);
    expect(r).toMatchObject({ status: 'ok', data: { entry: 'Ferocactus glaucescens (DC.) Britton & Rose', via: 'Ferocactus glaucescens (DC.) Britton & Rose' } });
    expect(asked.filter((u) => u.includes('/synonyms'))).toHaveLength(1); // base: a second ask, limit=50
  });
  it('a list GBIF cut short, or refused, gives no range under an older name', async () => {
    const big = Array.from({ length: 1100 }, (_, i) => ({ ...syn[0], key: i + 1 }));
    const pageOf = (url: string) => { const o = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0), l = Number(/limit=(\d+)/.exec(url)?.[1] ?? 50); return { results: big.slice(o, o + l), endOfRecords: o + l >= big.length }; };
    const base = (async (url: string) => (url.includes('/synonyms') ? { status: 'ok', data: pageOf(url) } : url.includes('/distributions') ? { status: 'none' } : { status: 'ok', data: sp })) as unknown as JsonFetcher;
    expect((await distributions(bulkFetcher(base, { wcvp: k }) as JsonFetcher, 11098779)).status).not.toBe('ok'); // base: the first 50 read as the whole list
    const refused = (async (url: string) => (url.includes('/synonyms') ? { status: 'refused', detail: 'api.gbif.org 429' } : url.includes('/distributions') ? { status: 'none' } : { status: 'ok', data: sp })) as unknown as JsonFetcher;
    const r: FetchResult<unknown> = await (bulkFetcher(refused, { wcvp: k }) as JsonFetcher)(`${GBIF}/species/11098779/distributions?limit=200`);
    expect(r.status === 'ok' && (r.data as { via?: string }).via).toBeFalsy(); // guard
  });
});
