import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { parsePlaces, PlaceIndex, institutionWords, institutionsLeftOut, InstitutionEffect, INSTITUTION_RADIUS_M, type Place } from '$dossier/clean';
import { haversineKm } from '$core/geo';
import { welwitschia } from '../../fixtures/upstream';

const opts = (table: Record<string, unknown>, places?: PlaceIndex) => ({ fetcher: fixtureFetcher(table), builtBy: 'node' as const, now: () => new Date('2026-10-20T12:00:00Z'), ...(places ? { places } : {}) });

describe('round 79 (Q): records at a botanic garden, herbarium or zoo are left out', () => {
  it('reads the places file: its header, its kinds, nothing malformed', () => {
    const got = parsePlaces(['# a header', '# item\tkind\tlatitude\tlongitude', 'Q1\tbotanic garden\t-33.98750\t18.43270', 'Q2\therbarium\t38.6141\t-90.2589', 'Q3\tzoo\t51.5353\t-0.1534', 'Q4\tmuseum\t1\t1', 'Q5\tzoo\t95\t0', 'Q6\tzoo\tx\t0', ''].join('\n'));
    expect(got.map((p) => p.id)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(got[0]).toEqual({ id: 'Q1', kind: 'botanic garden', lat: -33.9875, lon: 18.4327 });
  });

  it('finds the nearest place within the radius, and none beyond it, across the antimeridian and near a pole', () => {
    const places: Place[] = [
      { id: 'kirstenbosch', kind: 'botanic garden', lat: -33.9875, lon: 18.4327 },
      { id: 'fiji', kind: 'botanic garden', lat: -17.0, lon: 179.999 },
      { id: 'north', kind: 'herbarium', lat: 78.22, lon: 15.65 }
    ];
    const ix = new PlaceIndex(places, 1000);
    expect(ix.near(-33.9875, 18.4327)?.id).toBe('kirstenbosch');
    expect(ix.near(-33.9875 + 0.008, 18.4327)?.id).toBe('kirstenbosch'); // about 890 m north
    expect(ix.near(-33.9875 + 0.01, 18.4327)).toBeUndefined(); // about 1.1 km
    expect(ix.near(-17.0, -179.996)?.id).toBe('fiji'); // 0.005 degrees across the antimeridian
    expect(ix.near(78.22, 15.69)?.id).toBe('north'); // 0.04 degrees of longitude at 78 degrees north is under a kilometre
    expect(ix.near(Number.NaN, 0)).toBeUndefined();
    expect(new PlaceIndex(places, 100).near(-33.9875 + 0.002, 18.4327)).toBeUndefined();
    expect(INSTITUTION_RADIUS_M).toBe(1000);
  });

  it('the build leaves a record at a place out of the map, the counts and the climate, and its record says so', async () => {
    const before = await buildDossier('Welwitschia', opts(welwitschia(), new PlaceIndex([])));
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const p = before.dossier.occurrences.open[0];
    const garden: Place = { id: 'Q-test', kind: 'botanic garden', lat: p[0], lon: p[1] };
    const within = before.dossier.occurrences.open.filter((q) => haversineKm(q[0], q[1], p[0], p[1]) <= 1).length;
    expect(within).toBeGreaterThanOrEqual(1);
    const after = await buildDossier('Welwitschia', opts(welwitschia(), new PlaceIndex([garden])));
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.dossier.occurrences.nOpenInRange).toBe(before.dossier.occurrences.nOpenInRange - within);
    expect(after.dossier.occurrences.open.some((q) => haversineKm(q[0], q[1], p[0], p[1]) <= 1)).toBe(false);
    expect(after.dossier.upstream['gbif.occurrences'].detail).toContain(`${within} record${within === 1 ? '' : 's'} within 1 km of a botanic garden, herbarium or zoo left out (${within} at a botanic garden or arboretum; Wikidata's list)`);
    // None at a place: nothing said.
    expect(before.dossier.upstream['gbif.occurrences'].detail ?? '').not.toMatch(/botanic garden/);
  });

  it('a build given no places says its records were not tested, never that none lay at one (rule 2)', async () => {
    const r = await buildDossier('Welwitschia', opts(welwitschia()));
    expect(r.ok && r.dossier.upstream['gbif.occurrences'].detail).toMatch(/records not tested against botanic gardens, herbaria and zoos: no list of them was given to this build/);
  });

  it('the fetch reads Earth\'s coordinates only, and asks each kind by its classes and identifiers', async () => {
    const { pointOf, queryFor } = await import('../../scripts/institutions-fetch');
    expect(pointOf('Point(18.4325 -33.9875)')).toEqual([-33.9875, 18.4325]);
    expect(pointOf('<http://www.wikidata.org/entity/Q111> Point(10 20)')).toBeNull(); // Mars's
    expect(pointOf('Point(200 10)')).toBeNull();
    expect(queryFor('herbarium')).toContain('wd:Q181916');
    expect(queryFor('herbarium')).toContain('wdt:P5858');
    expect(queryFor('botanic garden')).toContain('wd:Q167346');
    expect(queryFor('botanic garden')).toContain('wdt:P5818');
    expect(queryFor('zoo')).toContain('wd:Q43501');
  });

  it('words each kind of place', () => {
    expect(institutionWords(0, new Map())).toBe('');
    expect(institutionWords(3, new Map([['herbarium', 2], ['zoo', 1]]))).toBe("3 records within 1 km of a botanic garden, herbarium or zoo left out (2 at a herbarium, 1 at a zoo; Wikidata's list)");
    expect(institutionWords(1, new Map([['botanic garden', 1]]), 100)).toBe("1 record within 100 m of a botanic garden, herbarium or zoo left out (1 at a botanic garden or arboretum; Wikidata's list)");
  });

  it('the build\'s log counts what the rule left out, and the climate beside the page the build before wrote without it', () => {
    const said = institutionWords(3, new Map([['herbarium', 2], ['zoo', 1]]));
    expect(institutionsLeftOut(`GBIF occurrence download 0001; ${said}`)).toBe(3);
    expect(institutionsLeftOut(institutionWords(1, new Map([['zoo', 1]]), 100))).toBe(1);
    expect(institutionsLeftOut('records not tested against botanic gardens, herbaria and zoos: no list of them was given to this build')).toBe(0);
    expect(institutionsLeftOut(undefined)).toBe(0);
    const page = (key: string, detail: string | undefined, climate: { status: string; cells?: number }) => ({ key, name: { scientific: key }, upstream: { 'gbif.occurrences': { detail } }, climate });
    const e = new InstitutionEffect();
    e.add(page('a', said, { status: 'ok', cells: 8 }), page('a', 'GBIF occurrence download', { status: 'ok', cells: 10 }));
    e.add(page('b', institutionWords(2, new Map([['botanic garden', 2]])), { status: 'none' }), page('b', 'GBIF occurrence download', { status: 'ok', cells: 2 }));
    // The page before had the rule already: not compared. One with nothing left out: not counted.
    e.add(page('c', institutionWords(1, new Map([['zoo', 1]])), { status: 'ok', cells: 5 }), page('c', institutionWords(1, new Map([['zoo', 1]])), { status: 'ok', cells: 5 }));
    e.add(page('d', 'GBIF occurrence download', { status: 'ok', cells: 5 }), null);
    expect([e.records, e.species, e.withClimate, e.compared, e.cellsBefore, e.cellsNow]).toEqual([6, 3, 2, 1, 10, 8]);
    expect(e.words(6656)).toBe("  Institution rule (Wikidata's 6656 botanic gardens, herbaria and zoos, 1 km): 6 records of 3 species left out; 2 of those species have a habitat climate; beside the pages the build before wrote without the rule (whose records may differ for other reasons too), 1 kept a habitat climate, on 8 grid cells where they had 10, and 1 lost it:\n    b [b]: 2 records left out; climate none, 2 cells before");
    expect(new InstitutionEffect().words(6656)).toBe('');
  });

  it('the committed places are Wikidata\'s, CC0, and every line parses', () => {
    const text = readFileSync('scripts/institutions.txt', 'utf8');
    expect(text).toMatch(/^# .*\n# Source: Wikidata \(CC0, https:\/\/www\.wikidata\.org\/wiki\/Wikidata:Licensing\)/);
    const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
    const places = parsePlaces(text);
    expect(places.length).toBe(lines.length);
    expect(places.length).toBeGreaterThan(6000);
    for (const k of ['botanic garden', 'herbarium', 'zoo']) expect(places.some((p) => p.kind === k)).toBe(true);
    // Kirstenbosch is in it.
    const ix = new PlaceIndex(places);
    expect(ix.near(-33.9875, 18.4327)?.kind).toBe('botanic garden');
  });
});
