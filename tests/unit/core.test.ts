import { describe, it, expect } from 'vitest';
import { licenceTag, isOpen } from '$core/licence';
import { slugify, parseName, tidyName, nameParts, parents } from '$core/names';
import { Clock, hlcCompare, hlcDecode, hlcEncode, MAX_AHEAD_MS, hlcAfter } from '$core/hlc';
import { materialise, apply, live, diff, validateChanges, type Change } from '$core/log';
import { nextAccession } from '$core/accession';
import { densestCluster, habitatCluster, habitatCentre, haversineKm, inBox } from '$core/geo';
import { reduceExtremes, extremesUsable } from '$core/extremes';

describe('licence', () => {
  it('classifies the real-world forms', () => {
    expect(licenceTag('http://creativecommons.org/licenses/by-nc/4.0/legalcode')).toBe('nc');
    expect(licenceTag('http://creativecommons.org/licenses/by/4.0/legalcode')).toBe('by');
    // the enum forms a GBIF occurrence download writes
    expect(licenceTag('CC_BY_4_0')).toBe('by');
    expect(licenceTag('CC_BY_NC_4_0')).toBe('nc');
    expect(licenceTag('CC0_1_0')).toBe('cc0');
    expect(licenceTag('UNSPECIFIED')).toBe('other');
    expect(licenceTag('http://creativecommons.org/publicdomain/zero/1.0/legalcode')).toBe('cc0');
    expect(licenceTag('cc-by-nc')).toBe('nc');
    expect(licenceTag('cc-by-sa')).toBe('by-sa');
    expect(licenceTag('cc-by-nc-sa')).toBe('nc');
    expect(licenceTag('cc0')).toBe('cc0');
    expect(licenceTag('CC BY 4.0')).toBe('by');
    expect(licenceTag('Attribution-NoDerivs')).toBe('nd');
    expect(licenceTag('')).toBeNull();
    expect(licenceTag(undefined)).toBeNull();
    expect(licenceTag('All rights reserved')).toBe('other');
  });
  it('unknown is not open', () => {
    expect(isOpen(null)).toBe(false);
    expect(isOpen('other')).toBe(false);
    expect(isOpen('nc')).toBe(false);
    expect(isOpen('by')).toBe(true);
    expect(isOpen('by-sa', { allowShareAlike: false })).toBe(false);
  });
});

describe('names', () => {
  it('slugs and tidies', () => {
    expect(slugify('Copiapoa cinerea subsp. alboviridis')).toBe('copiapoa-cinerea-subsp-alboviridis');
    expect(tidyName('copiapoa   cinerea ssp alboviridis f longispina')).toBe('Copiapoa cinerea subsp. alboviridis f. longispina');
  });
  it('separates cultivar and aside from the backbone-matchable part', () => {
    const p = parseName(`Ariocarpus fissuratus 'intermedius'`);
    expect(p.scientific).toBe('Ariocarpus fissuratus');
    expect(p.cultivar).toBe('intermedius');
    const q = parseName('Drimia intricata (Schizobasis intricata)');
    expect(q.scientific).toBe('Drimia intricata');
    expect(q.aside).toBe('Schizobasis intricata');
    expect(parseName('tylcodon pearsonii').genus).toBe('Tylcodon');
  });
  it('italicises only the Latin', () => {
    const parts = nameParts('Copiapoa cinerea subsp. alboviridis');
    expect(parts.map((p) => p.italic)).toEqual([true, false, true]);
  });
});

describe('hlc', () => {
  it('is monotonic under a stepping clock', () => {
    let now = 1000;
    const c = new Clock('dev1', () => now);
    const a = c.tick();
    now = 900; // wall clock went backwards
    const b = c.tick();
    expect(hlcCompare(b, a)).toBe(1);
    expect(hlcDecode(b).wall).toBe(1000);
  });
  it('ticks after an observed remote timestamp', () => {
    const c = new Clock('dev1', () => 1000);
    const remote = new Clock('dev2', () => 5000).tick();
    c.observe(remote);
    expect(hlcCompare(c.tick(), remote)).toBe(1);
  });
  it('does not follow a peer whose clock is far ahead', () => {
    let now = 1_700_000_000_000;
    const c = new Clock('dev1', () => now);
    c.observe('1900000000000-0000-badclock'); // six years ahead
    c.observe(hlcEncode({ wall: now + MAX_AHEAD_MS - 1, count: 3, device: 'near' })); // within the allowance: followed
    now += 3600_000;
    expect(hlcDecode(c.tick()).wall).toBe(now);
  });
  it('does not follow its own stamps far ahead either: one fast edit must not keep every later stamp ahead (round eight, 4; the field itself is won by hlcAfter, tested on the store)', () => {
    let now = 1_700_000_000_000 + 86_400_000;
    const fast = new Clock('dev1', () => now);
    const stampedFast = fast.tick();
    now -= 86_400_000;
    const c = new Clock('dev1', () => now);
    c.observe(stampedFast);
    expect(hlcDecode(c.tick()).wall).toBe(now);
    expect(hlcCompare(hlcAfter(stampedFast, 'dev1'), stampedFast)).toBe(1);
  });
  it('the counter widens past ffff and still parses and orders; past six digits the wall takes a millisecond', () => {
    const c = new Clock('dev1', () => 1_700_000_000_000);
    let last = '';
    for (let i = 0; i <= 0xffff; i++) last = c.tick();
    const next = c.tick();
    expect(hlcDecode(next).count).toBe(0x10000);
    expect(hlcCompare(next, last)).toBe(1);
    expect(hlcCompare(last, next)).toBe(-1);
    for (let i = 0x10001; i <= 0xffffff; i++) c.tick();
    const rolled = hlcDecode(c.tick());
    expect(rolled).toMatchObject({ wall: 1_700_000_000_001, count: 0 });
    expect(hlcCompare('1700000000000-0001-a', '1700000000000-0000-b')).toBe(1); // then device breaks ties
    expect(hlcCompare('1700000000000-0000-a', '1700000000000-0000-b')).toBe(-1);
  });
});

describe('change validation', () => {
  it('names the first bad change and refuses the reserved and bookkeeping field names', () => {
    const ok = { t: '1700000000000-0000-x', kind: 'accession', id: 'r1', field: 'notes', value: 'x' };
    expect(validateChanges([ok])).toHaveLength(1);
    expect(() => validateChanges(null)).toThrow(/not a list/);
    expect(() => validateChanges([ok, { ...ok, t: '~' }])).toThrow(/change 1: bad timestamp/);
    expect(() => validateChanges([{ ...ok, kind: 'plant' }])).toThrow(/unknown kind/);
    expect(() => validateChanges([{ ...ok, value: undefined }])).toThrow(/no value/);
    for (const field of ['id', 'kind', '_t', '_deleted=', '*']) expect(() => validateChanges([{ ...ok, field }])).toThrow(/reserved/);
    // The fold refuses them too, so a record cannot be resurrected or made undeletable by a change to a bookkeeping name.
    expect(() => materialise([{ ...ok, field: '_deleted=' } as Change])).toThrow(/reserved/);
    expect(() => materialise([{ ...ok, field: '*' } as Change])).toThrow(/reserved/);
  });
  it('a known field with a value of the wrong type is refused; null and unknown fields pass (round twenty-eight, 0)', () => {
    const ok = { t: '1700000000000-0000-x', kind: 'sowing', id: 's1', field: 'sown', value: '2026-03-01' };
    expect(() => validateChanges([{ ...ok, value: 20260301 }])).toThrow(/change 0: sown of a sowing must be a string, not 20260301/);
    expect(() => validateChanges([{ ...ok, field: 'count', value: '12' }])).toThrow(/count of a sowing must be a number/);
    expect(() => validateChanges([{ ...ok, field: 'covered', value: 'yes' }])).toThrow(/must be a boolean/);
    expect(() => validateChanges([{ ...ok, kind: 'event', field: 'measures', value: [1, 2] }])).toThrow(/must be a object/);
    expect(() => validateChanges([{ ...ok, field: '_deleted', value: 'true' }])).toThrow(/_deleted of a sowing must be a boolean/);
    expect(() => validateChanges([{ ...ok, value: null }])).toThrow(/sown of a sowing cannot be null/); // a required field takes no null (round thirty-three, 1)
    expect(validateChanges([{ ...ok, field: 'medium', value: null }, { ...ok, field: 'count', value: 12 }, { ...ok, field: 'aFieldFromNextYear', value: 7 }, { ...ok, field: '_deleted', value: true }])).toHaveLength(4);
  });
});

describe('log', () => {
  const ch = (t: string, id: string, field: string, value: unknown): Change => ({
    t: `${String(t).padStart(13, '0')}-0000-d`,
    kind: 'location',
    id,
    field,
    value
  });
  it('folds field-level LWW regardless of order', () => {
    const a = [ch('1', 'x', 'name', 'A'), ch('3', 'x', 'name', 'C'), ch('2', 'x', 'name', 'B'), ch('2', 'x', 'pot', '7cm')];
    const s1 = materialise(a).state;
    const s2 = materialise([...a].reverse()).state;
    expect(s1.get('location:x')?.name).toBe('C');
    expect(s2.get('location:x')?.name).toBe('C');
    expect(s2.get('location:x')?.pot).toBe('7cm');
  });
  it('a record edited after its tombstone survives', () => {
    const s = materialise([ch('1', 'x', 'name', 'A'), ch('2', 'x', '_deleted', true)]).state;
    expect(live(s, 'location')).toHaveLength(0);
    const { state, seen } = materialise([ch('1', 'x', 'name', 'A'), ch('2', 'x', '_deleted', true)]);
    apply(state, [ch('3', 'x', 'name', 'B')], seen);
    expect(live(state, 'location')).toHaveLength(1);
    // but an older edit arriving late does not revive it
    apply(state, [ch('4', 'x', '_deleted', true), ch('1', 'x', 'pot', 'old')], seen);
    expect(live(state, 'location')).toHaveLength(0);
  });
  it('refuses to set reserved record fields', () => {
    expect(() => materialise([ch('1', 'x', 'kind', 'shelf')])).toThrow(/reserved/);
    expect(() => materialise([ch('1', 'x', 'id', 'y')])).toThrow(/reserved/);
  });
  it('diff emits only changed fields', () => {
    const { state } = materialise([ch('1', 'x', 'name', 'A'), ch('1', 'x', 'pot', '7cm'), ch('1', 'x', 'note', 'hi')]);
    let n = 10;
    const out = diff('location', 'x', { name: 'A', pot: '9cm', note: undefined }, state.get('location:x'), () => `${String(++n).padStart(13, '0')}-0000-d`);
    expect(out.map((c) => c.field)).toEqual(['pot', 'note']);
    expect(out[1].value).toBeNull();
  });
});

describe('accession numbers', () => {
  it('year scheme never reuses and skips taken numbers', () => {
    expect(nextAccession(['2026-0001', '2026-0003'], undefined, 2026)).toBe('2026-0004');
    expect(nextAccession(['2025-0010'], undefined, 2026)).toBe('2026-0001');
  });
  it('organisation prefix scheme', () => {
    expect(nextAccession(['PBG-00012'], { mode: 'prefix', prefix: 'PBG', width: 5 })).toBe('PBG-00013');
  });
});

describe('geo', () => {
  it('finds the dominant cluster and refuses when scattered', () => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 40; i++) pts.push([-25 + i * 0.01, -70 + i * 0.01]);
    for (let i = 0; i < 5; i++) pts.push([-33 + i * 0.1, -71]);
    const c = densestCluster(pts)!;
    expect(c.dominant).toBe(true);
    expect(c.lat).toBeCloseTo(-24.8, 0);
    const scattered: Array<[number, number]> = [
      [0, 0],
      [10, 10],
      [20, 20],
      [30, 30]
    ];
    expect(densestCluster(scattered)!.dominant).toBe(false);
    expect(habitatCluster(scattered)!.dominant).toBe(false);
  });
  it('a broad coherent range is not scattered', () => {
    // 144 points spread evenly over 7° × 7° (a Dioscorea elephantipes shape): no 1° window dominates
    const broad: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) broad.push([-34 + i * 0.6, 20 + j * 0.6]);
    expect(densestCluster(broad, 1)!.dominant).toBe(false);
    const c = habitatCluster(broad)!;
    expect(c.dominant).toBe(true);
    expect(c.cell).toBeGreaterThan(1);
    expect(Math.abs(c.lat + 30.7)).toBeLessThan(1.5);
  });
  it('the habitat centre is always a recorded point, in the densest local population', () => {
    // three populations 3° apart with nothing between them (a Bowiea shape): the median sits in a gap
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 20; i++) pts.push([-30 + (i % 5) * 0.05, 30 + Math.floor(i / 5) * 0.05]);
    for (let i = 0; i < 18; i++) pts.push([-27 + (i % 6) * 0.05, 30 + Math.floor(i / 6) * 0.05]);
    for (let i = 0; i < 16; i++) pts.push([-24 + (i % 4) * 0.05, 30 + Math.floor(i / 4) * 0.05]);
    const c = habitatCluster(pts)!;
    expect(c.cell).toBeGreaterThan(1);
    const at = habitatCentre(c, pts); // every point openly licensed
    expect(pts.some((p) => p[0] === at.lat && p[1] === at.lon)).toBe(true);
    expect(at.snapped).toBe('open-record');
    expect(at.lat).toBeLessThan(-29); // the 30-point population, not the gap
    expect(at.refined).toBe(true);
  });
  it('the centre is never a restricted record: with no open record in the cluster it is a tenth-degree grid point', () => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) pts.push([-30.123 + (i % 4) * 0.01, 30.456 + Math.floor(i / 4) * 0.01]);
    const c = habitatCluster(pts)!;
    const at = habitatCentre(c, []); // all restricted
    expect(at.snapped).toBe('cell-centre');
    expect(pts.some((p) => p[0] === at.lat && p[1] === at.lon)).toBe(false);
    // the centre of a tenth-degree cell: x.x5, a coordinate a 0.1°-precision record never has
    expect(Math.abs(at.lat * 100 - Math.round(at.lat * 100))).toBeLessThan(1e-6);
    expect(Math.round(Math.abs(at.lat) * 100) % 10).toBe(5);
    expect(Math.round(Math.abs(at.lon) * 100) % 10).toBe(5);
    // one open record in the cluster, and it is chosen even if a restricted one is nearer the middle
    const open: Array<[number, number]> = [pts[11]];
    const at2 = habitatCentre(c, open);
    expect([at2.lat, at2.lon]).toEqual(pts[11]);
    expect(at2.snapped).toBe('open-record');
  });
  it('distance and antimeridian boxes', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
    expect(inBox(0, 179.5, { s: -10, w: 170, n: 10, e: -170 })).toBe(true);
    expect(inBox(0, 0, { s: -10, w: 170, n: 10, e: -170 })).toBe(false);
  });
});

describe('extremes', () => {
  it('reduces and lapse-corrects', () => {
    const dates: string[] = [],
      tmin: number[] = [],
      tmax: number[] = [];
    for (let y = 1981; y <= 2024; y++)
      for (let d = 0; d < 365; d++) {
        dates.push(`${y}-01-01`);
        const s = Math.sin((d / 365) * 2 * Math.PI);
        tmin.push(5 + 8 * s);
        tmax.push(20 + 10 * s);
      }
    const e = reduceExtremes({ dates, tmin, tmax }, 1000);
    expect(e.years).toBe(44);
    expect(extremesUsable(e)).toBe(true);
    expect(e.minAbs).toBeCloseTo(5 - 8 - 6.5, 1);
    expect(e.frostDaysPerYear).toBeGreaterThan(0);
    expect(e.lapseAppliedM).toBe(1000);
  });
});

describe('cultivars and hybrids', () => {
  it('a cultivar of a known species keeps the species', () => {
    const p = parseName("Haworthia truncata 'Lime Green'");
    expect(p).toMatchObject({ scientific: 'Haworthia truncata', cultivar: 'Lime Green', kind: 'cultivar' });
  });
  it('a genus with a cultivar name and no species is a hybrid of unstated parentage', () => {
    const p = parseName("Echeveria 'Blue Curls'");
    expect(p).toMatchObject({ scientific: 'Echeveria', genus: 'Echeveria', cultivar: 'Blue Curls', kind: 'hybrid' });
    expect(p.epithet).toBeUndefined();
    expect(p.parentage).toBeUndefined();
  });
  it('a cross reads as a hybrid under the genus, with the parents expanded', () => {
    expect(parseName('Ariocarpus retusus x trigonus')).toMatchObject({ scientific: 'Ariocarpus', kind: 'hybrid', parentage: 'Ariocarpus retusus × Ariocarpus trigonus' });
    expect(parseName('Ariocarpus retusus × A. trigonus').parentage).toBe('Ariocarpus retusus × Ariocarpus trigonus');
    expect(parseName("Echeveria gibbiflora × Echeveria potosina 'Perle von Nürnberg'")).toMatchObject({ scientific: 'Echeveria', cultivar: 'Perle von Nürnberg', kind: 'hybrid', parentage: 'Echeveria gibbiflora × Echeveria potosina' });
    expect(parents('Echeveria gibbiflora × Echeveria potosina')).toEqual(['Echeveria gibbiflora', 'Echeveria potosina']);
  });
  it('a named nothospecies and a nothogenus are hybrids the backbone may know', () => {
    expect(parseName('Echeveria × imbricata')).toMatchObject({ scientific: 'Echeveria × imbricata', kind: 'hybrid', epithet: 'imbricata' });
    expect(parseName("x Graptoveria 'Fred Ives'")).toMatchObject({ scientific: 'Graptoveria', kind: 'hybrid', cultivar: 'Fred Ives' });
  });
  it('a plain species is still a species, ranks and all', () => {
    expect(parseName('Copiapoa cinerea ssp alboviridis f. longispina')).toMatchObject({ scientific: 'Copiapoa cinerea subsp. alboviridis f. longispina', kind: 'species' });
    expect(parseName('Welwitschia mirabilis').kind).toBe('species');
  });
});

describe('delete merging is order-independent', () => {
  const ch = (t: string, id: string, field: string, value: unknown): Change => ({ t: `170000000000${t}-0000-dev`, kind: 'location', id, field, value });
  it('an older delete and a newer edit leave the record live whichever arrives first', () => {
    const del = ch('2', 'x', '_deleted', true), edit = ch('3', 'x', 'name', 'B'), first = ch('1', 'x', 'name', 'A');
    const a = materialise([first, del, edit]).state;
    const b = materialise([first, edit, del]).state;
    expect(live(a, 'location')).toHaveLength(1);
    expect(live(b, 'location')).toHaveLength(1);
    expect(a.get('location:x')?.name).toBe('B');
  });
  it('a newer delete and an older edit leave the record deleted whichever arrives first', () => {
    const del = ch('5', 'x', '_deleted', true), edit = ch('3', 'x', 'name', 'B'), first = ch('1', 'x', 'name', 'A');
    expect(live(materialise([first, del, edit]).state, 'location')).toHaveLength(0);
    expect(live(materialise([first, edit, del]).state, 'location')).toHaveLength(0);
  });
  it('a restore (later _deleted=false) wins over an earlier delete in any order, and an even later delete wins again', () => {
    const first = ch('1', 'x', 'name', 'A'), del = ch('2', 'x', '_deleted', true), restore = ch('4', 'x', '_deleted', false), del2 = ch('6', 'x', '_deleted', true);
    expect(live(materialise([first, restore, del]).state, 'location')).toHaveLength(1);
    expect(live(materialise([first, del, restore]).state, 'location')).toHaveLength(1);
    expect(live(materialise([del2, first, restore, del]).state, 'location')).toHaveLength(0);
  });
  it('incremental apply with a shared seen map agrees with a fresh fold', () => {
    const first = ch('1', 'x', 'name', 'A'), del = ch('4', 'x', '_deleted', true), edit = ch('3', 'x', 'pot', '7');
    const { state, seen } = materialise([first, edit]);
    apply(state, [del], seen);
    expect(live(state, 'location')).toHaveLength(0);
    apply(state, [ch('5', 'x', 'pot', '9')], seen);
    expect(live(state, 'location')).toHaveLength(1);
    expect(state.get('location:x')?.pot).toBe('9');
  });
});

describe('a removal under a repeated stamp (round thirteen, 8)', () => {
  it('folds to "removed" whichever copy arrives first', () => {
    const t0 = hlcEncode({ wall: 1_700_000_000_000, count: 0, device: 'dev1' });
    const t1 = hlcEncode({ wall: 1_700_000_000_000, count: 1, device: 'dev1' });
    const base: Change = { t: t0, kind: 'accession', id: 'r1', field: 'taxonName', value: 'Aloe' };
    const gone: Change = { t: t1, kind: 'accession', id: 'r1', field: '_deleted', value: true };
    const kept: Change = { t: t1, kind: 'accession', id: 'r1', field: '_deleted', value: false };
    for (const order of [[base, gone, kept], [base, kept, gone]]) {
      const state = new Map();
      apply(state, order, new Map());
      expect(state.get('accession:r1')?._deleted).toBe(true);
    }
  });
});

describe('round twenty-nine: a value of the wrong type is left out, not the list', () => {
  const ok = { t: '1700000000000-0000-x', kind: 'accession', id: 'r1', field: 'price', value: 12 };
  it('a value of the wrong type is left out and named; the rest is kept (since round fifty-seven nothing is mended: a number in a text field is the wrong type too)', async () => {
    const { readChanges } = await import('$core/log');
    const r = readChanges([ok, { ...ok, field: 'notes', value: { a: 1 } }, { ...ok, field: 'taxonKey', value: 'x' }, { ...ok, field: 'notes', value: 'fine' }]);
    expect(r.changes.map((c) => c.value)).toEqual(['fine']);
    expect(r.dropped).toEqual(['change 0: price of a accession must be a string, not 12', 'change 1: notes of a accession must be a string, not {"a":1}', 'change 2: taxonKey of a accession must be a number, not "x"']);
    expect(() => readChanges(null)).toThrow(/not a list/);
    expect(() => readChanges([ok, { ...ok, t: '~' }])).toThrow(/change 1: bad timestamp/); // structure still refuses the list whole
    expect(() => readChanges([{ ...ok, field: '*' }])).toThrow(/reserved/);
  });
  it('a change that cannot be read is left out on its own, and the fold keeps a record whole only when its required fields are there (round thirty, 1; round thirty-three, 1)', async () => {
    const { readChanges, live, incomplete } = await import('$core/log');
    const t = (n: number) => `170000000000${n}-0000-x`;
    const r = readChanges([
      { t: t(0), kind: 'accession', id: 'r1', field: 'acc', value: '2026-0001' },
      { t: t(1), kind: 'accession', id: 'r1', field: 'taxonName', value: { bad: true } },
      { t: t(2), kind: 'accession', id: 'r1', field: 'status', value: 'growing' },
      { t: t(3), kind: 'accession', id: 'r2', field: 'taxonName', value: 'Aloe' },
      { t: t(4), kind: 'accession', id: 'r2', field: 'notes', value: 7.5 },
      { t: t(4), kind: 'accession', id: 'r2', field: 'status', value: 'growing' },
      { t: t(5), kind: 'sowing', id: 's1', field: 'count', value: '3' }
    ]);
    expect(r.changes.map((c) => `${c.id}.${c.field}`)).toEqual(['r1.acc', 'r1.status', 'r2.taxonName', 'r2.status']); // nothing is mended since round fifty-seven: a number in a text field and a count as text are left out
    expect(r.dropped).toEqual(['change 1: taxonName of a accession must be a string, not {"bad":true}', 'change 4: notes of a accession must be a string, not 7.5', 'change 6: count of a sowing must be a number, not "3"']);
    // r1 is in the fold but not live: it waits, counted, for a build that reads its name
    const { state } = materialise(r.changes);
    expect(live(state, 'accession').map((a) => a.id)).toEqual(['r2']);
    expect(incomplete(state).map((x) => `${x.kind}:${x.id}`)).toEqual(['accession:r1']);
    // a later readable name makes it whole, whichever list it arrives in (round twenty-two's reviewer: a corrected name was lost with the bad one)
    const { state: s2 } = materialise([...r.changes, { t: t(6), kind: 'accession', id: 'r1', field: 'taxonName', value: 'Aloe vera' }]);
    expect(live(s2, 'accession').map((a) => a.id).sort()).toEqual(['r1', 'r2']);
    // null in a required field is not a value a build writes: dropped, and the record stays as it was
    const n = readChanges([{ t: t(7), kind: 'accession', id: 'r2', field: 'taxonName', value: null }]);
    expect(n.changes).toEqual([]);
    expect(n.dropped).toEqual(['change 0: taxonName of a accession cannot be null']);
    // a set-aside batch that made r1, then a later batch that touches it: r1 is not live and the page cannot throw on it
    const { state: s3 } = materialise([{ t: t(8), kind: 'accession', id: 'r9', field: 'price', value: '5' }, { t: t(9), kind: 'event', id: 'e1', field: 'acc', value: 'r9' }, { t: t(9), kind: 'event', id: 'e1', field: 'd', value: '2026-09-29' }, { t: t(9), kind: 'event', id: 'e1', field: 't', value: 'water' }]);
    expect(live(s3, 'accession')).toEqual([]);
    expect(incomplete(s3)).toHaveLength(1);
  });
  it('every required field of every kind: a record missing it waits, and a later readable value makes it whole (round thirty-five, R2-1)', async () => {
    const { REQUIRED_FIELDS, readChanges, live, incomplete } = await import('$core/log');
    const whole: Record<string, Record<string, unknown>> = {
      accession: { taxonName: 'Aloe', status: 'growing', acc: '2026-0001' },
      sowing: { taxonName: 'Aloe', method: 'seed', sown: '2026-03-01', count: 10, status: 'active' },
      location: { name: 'Bench' },
      event: { acc: 'r1', d: '2026-03-01', t: 'water' },
      photo: { d: '2026-03-01', w: 1, h: 1, bytes: 3 },
      taxon: { name: 'Aloe' }
    };
    for (const [kind, fields] of Object.entries(whole)) {
      for (const f of REQUIRED_FIELDS[kind as keyof typeof REQUIRED_FIELDS]) {
        let n = 0;
        const t = () => `170000000000${n++}-0000-x`;
        const rows = Object.entries(fields).map(([field, value]) => ({ t: t(), kind, id: 'k1', field, value: field === f ? { bad: true } : value }));
        const r = readChanges(rows);
        expect(r.dropped, `${kind}.${f}`).toHaveLength(1);
        const { state } = materialise(r.changes);
        expect(live(state, kind as never), `${kind}.${f} live`).toHaveLength(0);
        expect(incomplete(state).map((x) => x.id), `${kind}.${f} waiting`).toEqual(r.changes.length ? ['k1'] : []); // a record with no readable change at all is not in the fold
        const later = readChanges([{ t: t(), kind, id: 'k1', field: f, value: fields[f] }]);
        const { state: s2 } = materialise([...r.changes, ...later.changes]);
        expect(live(s2, kind as never), `${kind}.${f} whole`).toHaveLength(1);
        expect(incomplete(s2)).toHaveLength(0);
      }
    }
    // a batch without its count is the case that walked past the pot guard: 10 > undefined is false
    const s = readChanges([{ t: '1700000000000-0000-x', kind: 'sowing', id: 's1', field: 'taxonName', value: 'Aloe' }, { t: '1700000000001-0000-x', kind: 'sowing', id: 's1', field: 'method', value: 'seed' }, { t: '1700000000002-0000-x', kind: 'sowing', id: 's1', field: 'sown', value: '2026-03-01' }, { t: '1700000000003-0000-x', kind: 'sowing', id: 's1', field: 'status', value: 'active' }, { t: '1700000000004-0000-x', kind: 'sowing', id: 's1', field: 'count', value: { bad: true } }]);
    expect(live(materialise(s.changes).state, 'sowing')).toHaveLength(0);
  });
  it('a word this build does not know is kept (round thirty, 1)', async () => {
    const { readChanges } = await import('$core/log');
    const c = (field: string, value: unknown, kind = 'sowing') => ({ t: '1700000000000-0000-x', kind, id: 's1', field, value }) as Change;
    expect(readChanges([c('status', 'banana', 'accession')]).changes[0].value).toBe('banana');
    expect(readChanges([c('method', 'tissue culture')]).changes[0].value).toBe('tissue culture');
  });
  it('a field named after Object.prototype is refused, whatever its value (round twenty-nine, 10)', async () => {
    const { validateChanges } = await import('$core/log');
    for (const field of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) expect(() => validateChanges([{ ...ok, field, value: null }])).toThrow(/not a field name/);
  });
});

describe('care groups (round fifty-eight)', () => {
  it('Welwitschia is not called a cactus or succulent: its family has no group, and the sheet says none', async () => {
    const { archFor } = await import('$core/arch');
    expect(archFor('Welwitschia mirabilis', 'Welwitschiaceae')).toBeNull();
    expect(archFor('Copiapoa cinerea', 'Cactaceae')?.arch.key).toBe('arid');
  });
});
