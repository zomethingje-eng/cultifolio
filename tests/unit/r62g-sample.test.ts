/**
 * Round sixty-two, agent G: the sample collection's Leave (docs/REVIEW-TRIAGE-61.md, decision 1; A9; the triage's 4 and
 * 11). Leave navigates first and the tab leaves the sample only as its page goes, so a "Leave site?" answered Cancel
 * keeps a working tab; Leave counts what the visitor added or changed; a blocked delete is said, not taken as done; "the
 * sample was closed in another tab" is one function; the compare tray chosen in the sample stays in the sample.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mk = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() } }; };
const session = mk(), local = mk();
const loc = { href: 'http://x/plants/r1', reload: () => {} };
const listeners = new Map<string, Array<(e: Event) => void>>();
const had = { ss: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), ls: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), loc: Object.getOwnPropertyDescriptor(globalThis, 'location'), add: Object.getOwnPropertyDescriptor(globalThis, 'addEventListener'), win: Object.getOwnPropertyDescriptor(globalThis, 'window') };
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
beforeEach(() => {
  session.m.clear(); local.m.clear(); listeners.clear(); loc.href = 'http://x/plants/r1';
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session.s });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local.s });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: loc });
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: (t: string, f: (e: Event) => void) => { listeners.set(t, [...(listeners.get(t) ?? []), f]); } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: () => {} } });
});
afterEach(() => {
  for (const [k, d] of [['sessionStorage', had.ss], ['localStorage', had.ls], ['location', had.loc], ['addEventListener', had.add], ['window', had.win]] as const) { if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});
const names = async () => (await indexedDB.databases()).map((d) => d.name);
const fire = (t: string) => { for (const f of listeners.get(t) ?? []) f(new Event(t)); listeners.delete(t); };

describe('Leave (A9)', () => {
  it('navigates first: until the page goes, the tab is still the sample\'s, its database and flag in place', async () => {
    session.m.set('cultifolio.demo', '1');
    session.m.set('cultifolio.demo.units', 'us');
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await vault.setMeta('device', 'demodemodemo');
    const { leaveDemo, inDemo, finishLeaving } = await import('$lib/db/demo');
    leaveDemo('/');
    expect(loc.href).toBe('/?left=sample'); // the address says it, for the next page's first script (round sixty-two, the first deploy)
    // Until the page goes the database is in place and open; the flag is already off and the next page told, so the next
    // page cannot read them late (the first deploy's race); a Leave called off puts them back (r62bg-sample).
    expect([inDemo(), session.m.get('cultifolio.sampleLeft'), session.m.get('cultifolio.demo.units')]).toEqual([false, '1', 'us']);
    expect(await vault.getMeta('device')).toBe('demodemodemo'); // base: the database closed before the navigation was even asked
    expect(await names()).toContain('cultifolio-demo');
    // The page goes: the flag and the tab's copies go with it, and the next page deletes the sample.
    fire('pagehide');
    expect([inDemo(), session.m.has('cultifolio.demo.units'), session.m.get('cultifolio.sampleLeft')]).toEqual([false, false, '1']);
    (await vault.openVault()).close();
    expect(await finishLeaving()).toBeNull(); // the example's own page deletes nothing: its collection was read as it loaded (round sixty-seven)
    vi.resetModules(); // the next page, outside the example
    const next = await import('$lib/db/demo');
    expect(await next.finishLeaving()).toBe('deleted');
    expect(await names()).not.toContain('cultifolio-demo');
    expect(await next.finishLeaving()).toBeNull(); // once
  });
  it('a delete held up by an open connection is said as held up, never as done', async () => {
    session.m.set('cultifolio.demo', '1');
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    await vault.setMeta('device', 'demodemodemo');
    (await vault.openVault()).close();
    const open = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio-demo'); r.onsuccess = () => res(r.result); }); // another tab still holds it, and does not let go
    session.m.delete('cultifolio.demo');
    session.m.set('cultifolio.sampleLeft', '1');
    vi.resetModules(); // the next page, outside the example
    const { finishLeaving } = await import('$lib/db/demo');
    expect(await finishLeaving(50)).toBe('blocked'); // base: onblocked resolved as if deleted
    open.close();
  });
  it('counts the records the visitor added or changed after the sample was set out', async () => {
    session.m.set('cultifolio.demo', '1');
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    const { sampleEdits, SEED_MARK } = await import('$lib/db/demo');
    const put = async (t: string, kind: string, id: string, field: string, value: unknown) => vault.appendChanges([{ t, kind, id, field, value } as never]);
    await put('1790000000000-0000-aaaaaaaaaaaa0000', 'accession', 'r1sampleseeds0', 'taxonName', 'Aloe vera');
    await vault.setMeta(SEED_MARK, await vault.lastArrival()); // the seed's own last arrival number (round sixty-seven; triage-66 V5)
    expect(await sampleEdits()).toBe(0);
    await put('1790000000001-0000-aaaaaaaaaaaa0000', 'accession', 'r1sampleseeds0', 'price', '£4');
    await put('1790000000002-0000-aaaaaaaaaaaa0000', 'accession', 'r9', 'taxonName', 'Lithops lesliei');
    await put('1790000000003-0000-aaaaaaaaaaaa0000', 'accession', 'r9', 'status', 'growing');
    expect(await sampleEdits()).toBe(2);
    // An edit that arrived after the seed counts whatever its stamp: one stamped before the seed's last (a tab whose
    // clock is behind, IND-6's edit made while the seed landed) was folded into a boundary read from the stamps.
    await put('1789999999999-0000-bbbbbbbbbbbb0000', 'location', 'l9', 'name', 'Shelf');
    expect(await sampleEdits()).toBe(3);
  });
  it('a Leave pressed before the seed\'s stamp is written counts none of the seed\'s timeline lines (round sixty-six; r64f 5)', async () => {
    session.m.set('cultifolio.demo', '1');
    const { IDBFactory } = await import('fake-indexeddb');
    globalThis.indexedDB = new IDBFactory(); // a sample of its own, not the one the test above wrote
    vi.resetModules();
    const vault = await import('$lib/db/vault');
    const { sampleEdits } = await import('$lib/db/demo');
    const put = async (t: string, kind: string, id: string, field: string, value: unknown) => vault.appendChanges([{ t, kind, id, field, value } as never]);
    // The seed's one commit: a plant, a place, a taxon and two lines on the plant's and the batch's timelines; no stamp yet.
    await put('1790000000000-0000-aaaaaaaaaaaa0000', 'accession', 'r1sampleseeds0', 'taxonName', 'Aloe vera');
    await put('1790000000000-0001-aaaaaaaaaaaa0000', 'location', 'l1sampleseeds0', 'name', 'Bench 1');
    await put('1790000000000-0002-aaaaaaaaaaaa0000', 'taxon', 'aloe-vera', 'name', 'Aloe vera');
    await put('1790000000000-0003-aaaaaaaaaaaa0000', 'event', 'e1', 'acc', 'r1sampleseeds0');
    await put('1790000000000-0004-aaaaaaaaaaaa0000', 'event', 'e1', 't', 'water');
    await put('1790000000000-0005-aaaaaaaaaaaa0000', 'event', 'e2', 'acc', 's1sampleseeds0');
    await put('1790000000000-0006-aaaaaaaaaaaa0000', 'event', 'e2', 't', 'germinate');
    // The seed's last line, as it always ends: the pot-up of its seed batch, whose plants carry the seed's tag (round sixty-seven).
    await put('1790000000000-0007-aaaaaaaaaaaa0000', 'event', 'e3', 'acc', 's1sampleseeds0');
    await put('1790000000000-0008-aaaaaaaaaaaa0000', 'event', 'e3', 't', 'potup');
    await put('1790000000000-0009-aaaaaaaaaaaa0000', 'event', 'e3', 'plants', ['r2sampleseeds0', 'r3sampleseeds0']);
    expect(await sampleEdits()).toBe(0); // base: 2, and "Leave the example? The 2 records you added…" to a visitor who added none
    // The visitor's own plant and its first line are still theirs.
    await put('1790000000001-0000-aaaaaaaaaaaa0000', 'accession', 'r9', 'taxonName', 'Lithops lesliei');
    await put('1790000000001-0001-aaaaaaaaaaaa0000', 'event', 'e9', 'acc', 'r9');
    expect(await sampleEdits()).toBe(2);
  });
  it('"closed in another tab" is one function: the flag and the tab\'s copies go, the next page says why', async () => {
    session.m.set('cultifolio.demo', '1');
    session.m.set('cultifolio.demo.labels', '{}');
    vi.resetModules();
    const { sampleClosedHere, CLOSED_NOTE, exampleClosed } = await import('$lib/db/demo');
    sampleClosedHere();
    // The page goes into the closed state at once; the flag and the tab's copies go only when the page really goes, so a
    // "Leave site?" answered Cancel leaves the page the example's, closed, and nothing of it the grower's (round sixty-seven; IND-1).
    expect([exampleClosed(), session.m.has('cultifolio.demo'), session.m.has('cultifolio.demo.labels'), session.m.get(CLOSED_NOTE), loc.href]).toEqual([true, true, true, '1', '/?left=sample']);
    fire('pagehide');
    expect([session.m.has('cultifolio.demo'), session.m.has('cultifolio.demo.labels')]).toEqual([false, false]);
  });
});

describe('the compare tray chosen in the sample stays in the sample (A9; the grower review, 11)', () => {
  it('a pick in the sample is the tab\'s own; the grower\'s tray is neither read nor written', async () => {
    local.m.set('cultifolio.compare', JSON.stringify([{ slug: 'aloe-vera', name: 'Aloe vera' }]));
    session.m.set('cultifolio.demo', '1');
    vi.resetModules();
    const { compare } = await import('$lib/ui/compare.svelte');
    compare.load();
    expect(compare.picks).toEqual([]);
    compare.toggle({ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' });
    expect(local.m.get('cultifolio.compare')).toBe(JSON.stringify([{ slug: 'aloe-vera', name: 'Aloe vera' }])); // base: overwritten with the sample's pick
    expect(JSON.parse(session.m.get('cultifolio.demo.compare') ?? '[]')).toEqual([{ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' }]);
  });
  it('the labels page\'s picks are this tab\'s, and the sample tab\'s own', async () => {
    vi.resetModules();
    const { readSetting, writeSetting } = await import('$lib/ui/stored');
    writeSetting('cultifolio.labelsPicked', 'tab', '["r1"]');
    expect([session.m.get('cultifolio.labelsPicked'), local.m.has('cultifolio.labelsPicked')]).toEqual(['["r1"]', false]);
    session.m.set('cultifolio.demo', '1');
    vi.resetModules(); // a page loaded in the example
    const inSample = await import('$lib/ui/stored');
    expect(inSample.readSetting('cultifolio.labelsPicked', 'tab')).toBeNull();
    inSample.writeSetting('cultifolio.labelsPicked', 'tab', '["s1"]');
    expect(session.m.get('cultifolio.demo.labelsPicked')).toBe('["s1"]');
  });
});
