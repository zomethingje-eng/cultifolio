/**
 * Round-59 review, data area: notes replaced unseen on the species' own notes (myNotes / myNotesBase), real vault.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { vault, c: store.collection };
}
beforeEach(async () => {
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});

describe('species notes', () => {
  it('two devices blind: the text replaced unseen is listed on both sides of the merge; an edit in sight lists nothing', async () => {
    const b = await boot();
    await b.c.load();
    await b.c.put('taxon', 'aloe-vera', { name: 'Aloe vera', myNotes: 'mine, first', myNotesBase: null });
    const base = b.c.notesStamp('taxon', 'aloe-vera');
    const w = Date.now() + 1000; // the peer's blind edit, a second later, real time
    const peer: Change[] = [
      { t: hlcEncode({ wall: w, count: 0, device: PEER }), kind: 'taxon', id: 'aloe-vera', field: 'myNotes', value: 'theirs, blind' },
      { t: hlcEncode({ wall: w, count: 1, device: PEER }), kind: 'taxon', id: 'aloe-vera', field: 'myNotesBase', value: null }
    ];
    await b.c.ingest(peer, 'server');
    expect(b.c.taxon('aloe-vera')?.myNotes).toBe('theirs, blind');
    expect((await b.c.replacedNotes('taxon', 'aloe-vera')).map((r) => r.text)).toEqual(['mine, first']);
    // an edit in sight of the peer's text: nothing more listed
    await b.c.put('taxon', 'aloe-vera', { myNotes: 'merged by hand', myNotesBase: b.c.notesStamp('taxon', 'aloe-vera') });
    expect((await b.c.replacedNotes('taxon', 'aloe-vera')).map((r) => r.text)).toEqual(['mine, first']);
    void base;
  });

  it('a peer\'s change parked over the text on screen is not listed as replaced; Apply is made in sight of the text on screen, so it lists nothing as replaced unseen (round sixty)', async () => {
    const T0 = Date.now();
    const b = await boot();
    const hlc = await import('$core/hlc');
    hlc.trustServerTime(T0);
    await b.c.load();
    await b.c.put('taxon', 'aloe-vera', { name: 'Aloe vera', myNotes: 'on screen', myNotesBase: null });
    const far = T0 + 400 * 86_400_000;
    const parked: Change[] = [
      { t: hlcEncode({ wall: far, count: 0, device: PEER }), kind: 'taxon', id: 'aloe-vera', field: 'myNotes', value: 'from a broken clock' },
      { t: hlcEncode({ wall: far, count: 1, device: PEER }), kind: 'taxon', id: 'aloe-vera', field: 'myNotesBase', value: null }
    ];
    await b.c.ingest(parked, 'server');
    expect(b.c.parkedRecords).toBe(1);
    expect(await b.c.replacedNotes('taxon', 'aloe-vera')).toEqual([]);
    await b.c.applyParked('taxon', 'aloe-vera');
    const after = (await b.c.replacedNotes('taxon', 'aloe-vera')).map((r) => r.text);
    expect(after).toEqual([]);
    expect(b.c.taxon('aloe-vera')?.myNotes).toBe('from a broken clock');
  });
});
