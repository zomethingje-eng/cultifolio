/**
 * Round sixty-nine, agent W (R46-31: a green revert in the server's area). A photograph's id is the time it was made and
 * then 16 random base-36 characters (round sixty-seven; triage-66 S10), so a holder of the vault's token cannot guess it
 * from the listing's hours and devices. The server's own test only checked that it accepts the shape; cutting the random
 * part, or going back to the counter and the device, stayed green. This mints ids through the store itself.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';

type Mem = {
  changes: Map<string, Change>;
  meta: Map<string, unknown>;
  photos: Map<string, unknown>;
  device: string;
  fail: string | null;
};
const newMem = (device: string): Mem => ({
  changes: new Map(),
  meta: new Map(),
  photos: new Map(),
  device,
  fail: null
});
/** Which device's vault the mock is talking to; switched before each call when two collections are in play. */
let mem: Mem = newMem('testdevice');
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
  allChanges: async () => [...mem.changes.values()],
  appendChanges: async (cs: Change[]) => {
    if (mem.fail) throw new Error(mem.fail);
    for (const c of cs) mem.changes.set(c.t, c);
    return { kept: cs, replaced: [], seq: 0 };
  },
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => mem.device,
  requestPersistence: async () => true
};
  // The claiming write of the real vault, over the same in-memory log: `build` sees the numbers the caller knows.
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  // No snapshot in memory: every load folds the whole log, as a first load does (the snapshot is tested on the real vault in fold-snapshot.test.ts).
  m.readFold = async () => undefined;
  m.writeFold = async () => false;
  m.foldGen = async () => 0;
  m.dropFold = async () => {};
  m.parkStamps = async (st: string[]) => { const had = (mem.meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem.meta.set('parked', out); return out; };
  m.lastArrival = async () => 0;
  m.arrivalsAfter = async () => ({ changes: [...mem.changes.values()], seq: 0, gen: 0 });
  m.changeKeys = async () => [...mem.changes.keys()];
  // The order of arrival on this device (round sixty-one): the in-memory log's insertion order, as the real vault's order store keeps it.
  m.arrivalsOf = async (ts: string[]) => { const keys = [...mem.changes.keys()]; return new Map(ts.filter((t) => mem.changes.has(t)).map((t) => [t, keys.indexOf(t) + 1])); };
  if (!m.changesByKeys) m.changesByKeys = async (ts: string[]) => ts.map((t) => mem.changes.get(t)).filter(Boolean);
  if (!m.updateMeta) m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  if (!m.changesOf) m.changesOf = async (kind: string, id: string) => ([...mem.changes.values()] as Change[]).filter((c) => c.kind === kind && c.id === id);
  m.holdVault = async (work: () => Promise<unknown>) => work();
  m.putPhotoBlobs = async (p: { id: string }) => void mem.photos.set(p.id, p);
  m.getPhotoBlobs = async (id: string) => mem.photos.get(id);
  m.deletePhotoBlobs = async (id: string) => void mem.photos.delete(id);
  m.announceSyncForgotten = () => {};
  return m;
});


describe('R46-31: a photograph\'s id carries 16 random characters', () => {
  it('each id is "p", the time in base 36, then 16 base-36 characters that differ between ids made in the same instant and never name the device', async () => {
    vi.resetModules();
    mem = newMem('devicezz');
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const a = await collection.addAccession({ taxonName: 'Aloe', acquired: '2026-03-01' });
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 1])]);
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 10, 12), toFake: ['Date'] });
    const ids: string[] = [];
    try {
      for (let i = 0; i < 40; i++) ids.push((await collection.addPhoto({ acc: a.id, d: '2026-10-10', dFrom: 'added', caption: null, w: 1, h: 1, bytes: 3, sha: null, blob, thumb: blob })).id);
    } finally {
      vi.useRealTimers();
    }
    const wall = Date.UTC(2026, 9, 10, 12).toString(36);
    const tails = new Set<string>();
    for (const id of ids) {
      expect(id.startsWith('p')).toBe(true);
      // The time first, as the stamp's wall: madeOn reads the day from it.
      const head = id.slice(1, id.length - 16);
      expect(parseInt(head, 36)).toBeGreaterThanOrEqual(parseInt(wall, 36));
      expect(head.length).toBe(wall.length);
      const tail = id.slice(-16);
      expect(tail).toMatch(/^[0-9a-z]{16}$/);
      expect(id).not.toContain('devicezz');
      tails.add(tail);
    }
    expect(ids.every((id) => id.length === 1 + wall.length + 16)).toBe(true);
    expect(tails.size).toBe(ids.length);
  });
});
