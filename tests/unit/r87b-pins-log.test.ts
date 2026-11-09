/**
 * Round eighty-seven (browse, C6): pinned views in the collection's log, both ways between versions.
 *
 * 1. A log holding pins as this version writes them is read by round eighty-six's own log module (the live code, kept
 *    whole in tests/unit/r87b-old/log-r86.ts): no change of it refused or left out, the batch not refused whole, the
 *    plants beside it folded as before, the pins inert setting records that version reads nothing of (its numbering
 *    scheme and kept numbers are read by id, and are unchanged), and an unpin a removal it folds like any other.
 * 2. A log written by round eighty-six (no pins; its own setting records) read by this version: no pin, and its setting
 *    records read as before.
 * 3. A pin of another version's shape: a field this version does not know is passed over and the pin shown; a pin whose
 *    fields are not a pin's is not shown, and the others are; two records of one view are one pin; at most fifty.
 * 4. A pin's kind is `setting`, which every version knows: a kind round eighty-six does not know is refused whole by it,
 *    which is why pins are not a kind of their own.
 *
 * Fails on the base (r85m head): $lib/browse/pins does not exist.
 */
import { describe, it, expect } from 'vitest';
import * as old from './r87b-old/log-r86';
import { readChanges, materialise, live, FOLD_RULES, type Change, type Record_ } from '$core/log';
import { pinsOf, pinOf, pinIdOf, encodeKeys, PIN_PREFIX, PIN_MAX } from '$lib/browse/pins';
import { keptNumbers, NUMBERING_SETTING, KEPT_NUMBERS } from '$lib/db/types';

const W = 'aaaaaaaaaaaa';
let wall = 1789520000000;
const ch = (kind: string, id: string, field: string, value: unknown): Change => ({ t: `${wall++}-0000-${W}`, kind, id, field, value } as Change);
/** A pin's changes as $lib/browse/recent's `pin` writes them (collection.put: one change a field). */
const pinChanges = (view: string, label: string, keys: string[] | null, n = keys?.length ?? 4000): Change[] => {
  const id = pinIdOf(view);
  return Object.entries({ href: `/browse${view}`, view, label, made: '2026-11-09', seen: '2026-11-09', n, keys: keys ? encodeKeys(keys) : null }).map(([f, v]) => ch('setting', id, f, v));
};
const plant = (id: string, name: string): Change[] => [ch('accession', id, 'taxonName', name), ch('accession', id, 'status', 'growing'), ch('accession', id, 'acc', `2026-00${id.slice(-2)}`)];

describe('r87b pins in the log 1: read by round eighty-six', () => {
  const log = [
    ...plant('a01', 'Hoodia alstonii'),
    ch('setting', NUMBERING_SETTING, 'scheme', { mode: 'year', width: 4 }),
    ...pinChanges('?r=NAM&f=apocynaceae', 'Apocynaceae native to Namibia', ['k1', 'k22', 'g999']),
    ...pinChanges('?r=79', 'Species native to Mexico', null, 6605),
    ...plant('a02', 'Welwitschia mirabilis')
  ];
  it('no change refused or left out, and the batch is not refused whole', () => {
    for (const c of log) expect(old.changeError(c), JSON.stringify(c)).toBeNull();
    const { changes, dropped } = old.readChanges(log);
    expect(dropped).toEqual([]);
    expect(changes).toHaveLength(log.length);
    expect(() => old.validateChanges(log)).not.toThrow();
  });
  it('the plants fold as before; the pins are setting records it reads nothing of', () => {
    const { state } = old.materialise(old.readChanges(log).changes);
    expect(old.live(state, 'accession').map((r) => r.taxonName).sort()).toEqual(['Hoodia alstonii', 'Welwitschia mirabilis']);
    const settings = old.live(state, 'setting');
    expect(settings.map((r) => r.id).sort()).toEqual([NUMBERING_SETTING, pinIdOf('?r=79'), pinIdOf('?r=NAM&f=apocynaceae')].sort());
    // Its numbering scheme is read by id, and is the one written; kept numbers read by their prefix: none from a pin.
    expect(state.get(old.key('setting', NUMBERING_SETTING))!.scheme).toEqual({ mode: 'year', width: 4 });
    for (const r of settings) { expect(keptNumbers(r as never, 'accession')).toEqual([]); expect(r.id.startsWith(KEPT_NUMBERS)).toBe(false); }
    expect(old.incomplete(state)).toEqual([]);
  });
  it('an unpin is a removal it folds; a pin made again after it is back', () => {
    const id = pinIdOf('?r=79');
    const more = [...log, ch('setting', id, '_deleted', true)];
    expect(old.live(old.materialise(old.readChanges(more).changes).state, 'setting').some((r) => r.id === id)).toBe(false);
    const back = [...more, ch('setting', id, '_deleted', false), ch('setting', id, 'seen', '2026-11-20')];
    expect(old.live(old.materialise(old.readChanges(back).changes).state, 'setting').some((r) => r.id === id)).toBe(true);
  });
  it('folds the same in this version, and this version reads the pins from it', () => {
    const { changes, dropped } = readChanges(log);
    expect(dropped).toEqual([]);
    const now = materialise(changes).state, then = old.materialise(old.readChanges(log).changes).state;
    expect([...now.values()].map((r) => JSON.stringify(r)).sort()).toEqual([...then.values()].map((r) => JSON.stringify(r)).sort());
    const pins = pinsOf(live(now, 'setting'));
    expect(pins.map((p) => p.label).sort()).toEqual(['Apocynaceae native to Namibia', 'Species native to Mexico']);
    expect(pins.find((p) => p.view === '?r=79')!.keys).toBeNull();
    expect(FOLD_RULES).toBe(8); // no fold rule moved: a pin is records and fields every version folds
  });
});

describe('r87b pins in the log 2: a log of round eighty-six read here', () => {
  it('holds no pin; its own setting records are no pins', () => {
    const log = [...plant('a01', 'Aloe vera'), ch('setting', NUMBERING_SETTING, 'scheme', { mode: 'prefix', prefix: 'ACC' }), ch('setting', `${KEPT_NUMBERS}-abc`, 'accession', ['2026-0007'])];
    const { state } = materialise(readChanges(log).changes);
    expect(pinsOf(live(state, 'setting'))).toEqual([]);
    expect(live(state, 'setting')).toHaveLength(2);
  });
});

describe('r87b pins in the log 3: validated on read', () => {
  const rec = (o: Record<string, unknown>): Record_ => ({ id: pinIdOf(String(o.view ?? '?g=hoodia')), kind: 'setting', _t: '', href: '/genus/hoodia', view: '?g=hoodia', label: 'Hoodia', made: '2026-11-01', seen: '2026-11-05', n: 13, keys: encodeKeys(['k1']), ...o } as Record_);
  it('reads a pin, and one of a newer shape by the fields it knows', () => {
    expect(pinOf(rec({}))).toMatchObject({ href: '/genus/hoodia', view: '?g=hoodia', n: 13, seen: '2026-11-05' });
    expect(pinOf(rec({ v: 2, colour: 'green', note: { any: 1 } }))).toMatchObject({ label: 'Hoodia' });
  });
  it('shows no record whose fields are not a pin\'s, and every other', () => {
    const bad = [{ href: 'https://elsewhere.example/' }, { href: '/plants/2026-0001' }, { view: 'r=NAM' }, { view: '?r=<script>' }, { label: '' }, { label: 7 }, { made: 'yesterday' }, { seen: null }, { n: -1 }, { n: 1.5 }, { keys: 'not keys!' }, { keys: 12 }];
    for (const b of bad) expect(pinOf(rec(b)), JSON.stringify(b)).toBeNull();
    expect(pinOf({ ...rec({}), id: 'numbering' })).toBeNull();
    expect(pinOf({ ...rec({}), _deleted: true })).toBeNull();
    expect(pinOf({ ...rec({}), kind: 'taxon' } as Record_)).toBeNull();
    const list = pinsOf([rec({}), rec({ view: '?r=NAM', href: '/browse?r=NAM', label: 'Namibia', n: 'x' }), rec({ view: '?r=CPP', href: '/region/cape-provinces', label: 'Cape Provinces' })]);
    expect(list.map((p) => p.label)).toEqual(['Hoodia', 'Cape Provinces']);
  });
  it('one view is one pin, the earlier made; at most fifty, the latest first', () => {
    expect(pinsOf([rec({ made: '2026-11-03' }), { ...rec({ made: '2026-11-01', label: 'First' }), id: `${PIN_PREFIX}other` }]).map((p) => p.label)).toEqual(['First']);
    const many = Array.from({ length: PIN_MAX + 5 }, (_, i) => rec({ view: `?g=g${i}`, href: `/genus/g${i}`, label: `G${i}`, made: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}` }));
    const shown = pinsOf(many);
    expect(shown).toHaveLength(PIN_MAX);
    expect(shown[0].label).toBe(`G${PIN_MAX + 4}`);
  });
  it('one id a view, on every device', () => {
    expect(pinIdOf('?r=NAM')).toBe(pinIdOf('?r=NAM'));
    expect(pinIdOf('?r=NAM')).not.toBe(pinIdOf('?r=CPV,NAM'));
    expect(pinIdOf('?r=NAM')).toMatch(/^pin-[0-9a-f]{16}$/);
  });
});

describe('r87b pins in the log 4: why a pin is a setting record', () => {
  it('round eighty-six refuses a batch that holds a kind it does not know, whole', () => {
    const batch = [...plant('a01', 'Aloe vera'), ch('pin', 'p1', 'view', '?r=NAM')];
    expect(() => old.readChanges(batch)).toThrow(/unknown kind/);
    expect(old.KINDS).toContain('setting');
  });
});
