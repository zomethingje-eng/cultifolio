/**
 * Round-60 self-review, clock area: one field across two devices, and the edit's rebase when the vault refuses the write.
 * The harness of r60-fuzz.test.ts (in-memory vault per device, a server that stamps arrivals, a pull judged as
 * takeBatch judges it, trustServerTime on every run and a rebuild when the clock in force changes or is first confirmed).
 *
 * Adopted in round sixty-one (agent L) from docs/review-60/tests/clock--devices.test.ts. The harness's sync run now also
 * does what the engine does since this round (decision 1): the listing gives the arrival of the batches this device
 * pushed, and its own changes stamped more than two days past it are parked here too (`judgeOwn` in the engine; the real
 * engine is tested end to end in r61l-own-arrival.test.ts). The five reproductions failed on the round-sixty base and
 * pass now; the expectations that described the old divergence ("own: folded on B") now say what both devices show.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';
import { isParked, hlcWall } from '$core/log';
import { isPastStamp } from '$core/hlc';

// Two devices, many syncs each: slow on a loaded machine, and a test that times out keeps running into the next one's devices.
vi.setConfig({ testTimeout: 180_000 });

type Mem = { device: string; changes: Map<string, Change>; outbox: Set<string>; meta: Map<string, unknown>; fail: string | null };
const G = globalThis as unknown as { __mem: Mem };
const newMem = (device: string): Mem => ({ device, changes: new Map(), outbox: new Set(), meta: new Map(), fail: null });
G.__mem = newMem('xxxxxxxxxxxx');

vi.mock('$lib/db/vault', () => {
  const mem = () => (globalThis as unknown as { __mem: Mem }).__mem;
  class StoppedError extends Error {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    StoppedError,
    allChanges: async () => [...mem().changes.values()].map((c) => structuredClone(c)),
    appendChanges: async (cs: Change[], fromServer = false) => {
      if (mem().fail) throw new Error(mem().fail!);
      const kept: Change[] = [];
      for (const c of cs) {
        mem().changes.set(c.t, structuredClone(c));
        if (!fromServer) mem().outbox.add(c.t);
        kept.push(c);
      }
      return { kept, replaced: [], seq: 0, first: 0 };
    },
    changesByKeys: async (ts: string[]) => ts.map((t) => mem().changes.get(t)).filter(Boolean).map((c) => structuredClone(c)),
    changesOf: async (kind: string, id: string) => [...mem().changes.values()].filter((c) => c.kind === kind && c.id === id),
    getMeta: async (k: string) => structuredClone(mem().meta.get(k)),
    setMeta: async (k: string, v: unknown) => void mem().meta.set(k, structuredClone(v)),
    updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(structuredClone(mem().meta.get(k))); mem().meta.set(k, structuredClone(next)); return next; },
    deviceId: async () => mem().device,
    requestPersistence: async () => true,
    putPhotoBlobs: async () => {},
    getPhotoBlobs: async () => undefined,
    deletePhotoBlobs: async () => {},
    photoBlobIds: async () => [],
    holdVault: async (w: () => Promise<unknown>) => w(),
    onOtherTabWrite: () => () => {},
    readFold: async () => undefined,
    writeFold: async () => false,
    touchFold: async () => {},
    foldGen: async () => 0,
    dropFold: async () => {},
    // parkStamps is its own transaction in the real vault (vault.ts parkStamps), separate from appendChanges
    parkStamps: async (st: string[]) => { const had = (mem().meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem().meta.set('parked', out); return out; },
    lastArrival: async () => 0,
    arrivalsAfter: async () => ({ changes: [], seq: 0, gen: 0 }),
    changeKeys: async () => [...mem().changes.keys()]
  };
  m.appendChangesClaiming = async (kind: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => {
    const b = build(new Set(known));
    await m.appendChanges(b.changes);
    return b.result;
  };
  return m;
});

type Col = typeof import('$lib/db/collection.svelte')['collection'];
type Hlc = typeof import('$core/hlc');
interface Device { name: string; mem: Mem; col: Col; hlc: Hlc; skew: number }

const DAY = 86_400_000;
const YEAR = 365 * DAY;
let trueNow = 0;
const server: Array<{ c: Change; arrival: number; by: string }> = [];

async function boot(d: { mem: Mem }): Promise<{ col: Col; hlc: Hlc }> {
  G.__mem = d.mem;
  vi.resetModules();
  const hlc = await import('$core/hlc');
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return { col: collection, hlc };
}
async function device(name: string, id: string): Promise<Device> {
  const mem = newMem(id);
  const b = await boot({ mem });
  return { name, mem, col: b.col, hlc: b.hlc, skew: 0 };
}
const on = (d: Device) => { G.__mem = d.mem; vi.setSystemTime(trueNow + d.skew); };
const later = (ms = 90_000) => { trueNow += ms; };

async function syncRun(d: Device): Promise<void> {
  on(d);
  for (const t of [...d.mem.outbox]) {
    const c = d.mem.changes.get(t)!;
    if (!server.some((x) => x.c.t === t)) server.push({ c: structuredClone(c), arrival: trueNow, by: d.mem.device });
    d.mem.outbox.delete(t);
  }
  const wasOff = d.hlc.clockOffsetMs(), wasChecked = d.hlc.clockChecked();
  d.hlc.trustServerTime(trueNow, Date.now());
  if (d.hlc.clockOffsetMs() !== wasOff || (!wasChecked && d.hlc.clockChecked())) await d.col.rebuild();
  // The listing: this device's own pushed changes, judged by their arrival as a peer judges them (round sixty-one).
  let own = false;
  for (const { c, arrival, by } of server) {
    if (by !== d.mem.device || d.col.parkedStamps.has(c.t)) continue;
    if (isParked(c.t, { now: d.hlc.nowMs(), except: d.col.device, arrival, parked: d.col.parkedStamps, clockChecked: d.hlc.clockChecked() })) { await d.col.markParked([structuredClone(c)]); own = true; }
  }
  if (own) await d.col.rebuild();
  for (const { c, arrival } of server) {
    if (d.mem.changes.has(c.t)) continue;
    const hold = { now: d.hlc.nowMs(), except: d.col.device, arrival, parked: d.col.parkedStamps, clockChecked: d.hlc.clockChecked() };
    if (isParked(c.t, hold)) {
      G.__mem.changes.set(c.t, structuredClone(c));
      await d.col.markParked([c]);
    } else await d.col.ingest([structuredClone(c)], 'server');
  }
}
async function syncAll(devs: Device[]) { for (let i = 0; i < 2; i++) { for (const d of devs) { later(); await syncRun(d); } } }
const notes = (d: Device, id: string) => { on(d); return (d.col.accession(id) as { notes?: string } | undefined)?.notes ?? '(not shown)'; };

beforeEach(() => {
  server.length = 0;
  trueNow = Date.UTC(2026, 9, 4, 12, 0, 0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(trueNow);
});

/** A plant both devices hold, made at true time; B's clock then jumps `skew` ahead, B edits its notes, syncs once (a large correction is pending), and is put right; both devices then sync (B's clock confirmed). */
async function setup(skew: number, fastEdits = 1) {
  const A = await device('A', 'aaaaaaaaaaaa');
  const B = await device('B', 'bbbbbbbbbbbb');
  on(A);
  const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made on A' } as never);
  await syncAll([A, B]);
  B.skew = skew;
  on(B);
  for (let i = 0; i < fastEdits; i++) await B.col.put('accession', p.id, { notes: `B while fast ${i}` });
  later(); await syncRun(B); // pushed: A parks it by arrival
  later(); await syncRun(A);
  B.skew = 0; // B's clock put right
  await syncAll([A, B]);
  return { A, B, p };
}

describe('one field, two devices, five rounds: a stamp a year ahead on the field', () => {
  it('a correct device\'s edits show on the formerly fast device (round 60: B kept showing its own year-ahead text, whatever A wrote, for a year)', async () => {
    const { A, B, p } = await setup(YEAR);
    expect(notes(B, p.id)).toBe('made on A'); // parked by its arrival on B too (round 60: folded on B, the known divergence)
    expect(notes(A, p.id)).toBe('made on A'); // parked by arrival on A
    const rows: string[] = [];
    for (let i = 1; i <= 5; i++) {
      on(A);
      await A.col.put('accession', p.id, { notes: `A round ${i}` });
      await syncAll([A, B]);
      rows.push(`${i}: A=${notes(A, p.id)} B=${notes(B, p.id)}`);
    }
    // A's own stamps stay at true time: the far stamp did not move A's clock
    on(A);
    const aStamps = [...A.mem.changes.values()].filter((c) => c.value === 'A round 5').map((c) => hlcWall(c.t));
    expect(aStamps[0] - trueNow).toBeLessThan(10 * 60_000);
    expect(rows).toEqual([1, 2, 3, 4, 5].map((i) => `${i}: A=A round ${i} B=A round ${i}`)); // on 21257b7: B='B while fast 0' every round
  });

  it('pressing Apply on the peer converges them for good (round 60: after Apply, A\'s next edit was again invisible on B)', async () => {
    const { A, B, p } = await setup(YEAR);
    on(A);
    expect(A.col.parkedList().map((x) => x.id)).toContain(p.id);
    await A.col.applyParked('accession', p.id); // the grower presses Apply on every peer (A is the only one)
    await syncAll([A, B]);
    expect(notes(A, p.id)).toBe('B while fast 0');
    expect(notes(B, p.id)).toBe('B while fast 0'); // converged for now
    on(A);
    await A.col.put('accession', p.id, { notes: 'A after Apply' });
    await syncAll([A, B]);
    expect(notes(A, p.id)).toBe('A after Apply');
    expect(notes(B, p.id)).toBe('A after Apply'); // on 21257b7: 'B while fast 0'
  });

  it('GUARD: once B itself edits the field after its clock is confirmed, both converge (one stale stamp on the field)', async () => {
    // Round 61: B's stale stamp is parked on B by its arrival before B edits, so B's edit is an ordinary one.
    const { A, B, p } = await setup(YEAR);
    on(B);
    await B.col.put('accession', p.id, { notes: 'B after the clock was put right' });
    await syncAll([A, B]);
    expect(notes(A, p.id)).toBe('B after the clock was put right');
    expect(notes(B, p.id)).toBe('B after the clock was put right');
    on(A);
    await A.col.put('accession', p.id, { notes: 'A then' });
    await syncAll([A, B]);
    expect(notes(B, p.id)).toBe('A then');
  });

  it('two edits while fast: B\'s first edit after the correction shows on both (round 60: lost on B and shown on A)', async () => {
    const { A, B, p } = await setup(YEAR, 2);
    on(B);
    await B.col.put('accession', p.id, { notes: 'B after the clock was put right' });
    expect(notes(B, p.id)).toBe('B after the clock was put right'); // on 21257b7: 'B while fast 0'
    await syncAll([A, B]);
    expect(notes(A, p.id)).toBe(notes(B, p.id));
  });
});

describe('the rebase and a refused write', () => {
  it('an edit the vault refuses parks nothing (round 60: the plant made while fast lost its name and left the list at the next load)', async () => {
    const B = await device('B', 'bbbbbbbbbbbb');
    B.skew = YEAR;
    on(B);
    const p = await B.col.addAccession({ taxonName: 'Copiapoa cinerea' } as never);
    B.skew = 0;
    on(B);
    let b = await boot(B); B.col = b.col; B.hlc = b.hlc;
    // A sync reading confirms the corrected clock (and rebuilds, as the engine's listener does). Round 61: before the plant
    // is pushed, since the listing that follows a push parks a plant made a year fast, on B as on every peer (next test).
    later(); on(B); B.hlc.trustServerTime(trueNow, Date.now()); await B.col.rebuild();
    expect(B.hlc.clockChecked()).toBe(true);
    expect(B.col.accession(p.id)?.taxonName).toBe('Copiapoa cinerea');
    B.mem.fail = 'QuotaExceededError: the disk is full';
    await expect(B.col.put('accession', p.id, { taxonName: 'Copiapoa humilis' })).rejects.toThrow(/Quota/);
    expect(B.col.lastWriteError).toBeTruthy();
    B.mem.fail = null;
    expect.soft((B.mem.meta.get('parked') as string[] | undefined) ?? []).toEqual([]); // on 21257b7: the old name's stamp is stored as parked
    b = await boot(B); B.col = b.col; B.hlc = b.hlc;
    expect(B.col.accession(p.id)?.taxonName).toBe('Copiapoa cinerea'); // on 21257b7: undefined (the plant is incomplete and not listed)
  });
});

describe('round 61: a plant made a year fast is parked on its writer by the listing, as on every peer', () => {
  it('the plant leaves both lists at the next sync, is listed with Apply on both, and Apply on either brings it back everywhere', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    B.skew = YEAR;
    on(B);
    const p = await B.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made a year fast' } as never);
    expect(notes(B, p.id)).toBe('made a year fast'); // shown on its writer until the listing
    later(); await syncRun(B);
    later(); await syncRun(A);
    expect(notes(B, p.id)).toBe('(not shown)');
    expect(notes(A, p.id)).toBe('(not shown)');
    on(B); expect(B.col.parkedList().map((x) => x.id)).toEqual([p.id]);
    on(A); expect(A.col.parkedList().map((x) => x.id)).toEqual([p.id]);
    B.skew = 0;
    on(A);
    await A.col.applyParked('accession', p.id);
    await syncAll([A, B]);
    expect(notes(A, p.id)).toBe('made a year fast');
    expect(notes(B, p.id)).toBe('made a year fast');
  });
});

describe('round 61: the edit stamped past a far stamp, made after the clock was put right, shows on both devices', () => {
  it('B edits a field it wrote a year fast, before its first listing: the edit is placed past the old stamp, flagged, shown on B at once, and on A after the sync; the old stamp is parked on both', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made on A' } as never);
    await syncAll([A, B]);
    B.skew = YEAR;
    on(B);
    await B.col.put('accession', p.id, { notes: 'B while fast' });
    B.skew = 0; // put right by hand, offline: no reading, no listing yet
    on(B);
    await B.col.put('accession', p.id, { notes: 'B after the clock was put right' });
    expect(notes(B, p.id)).toBe('B after the clock was put right'); // shows on its writer at once
    const edit = [...B.mem.changes.values()].find((c) => c.value === 'B after the clock was put right')!;
    expect(hlcWall(edit.t) - trueNow).toBeGreaterThan(YEAR - DAY); // as far ahead as the stamp it was placed after
    expect(isPastStamp(edit.t)).toBe(true);
    await syncAll([A, B]);
    expect(notes(B, p.id)).toBe('B after the clock was put right');
    expect(notes(A, p.id)).toBe('B after the clock was put right');
    const fast = [...B.mem.changes.values()].find((c) => c.value === 'B while fast')!;
    on(A); expect(A.col.parkedStamps.has(fast.t)).toBe(true);
    on(B); expect(B.col.parkedStamps.has(fast.t)).toBe(true);
    expect(B.col.parkedFor('accession', p.id)).toEqual([]); // the replaced fast text is not offered back on either
    on(A); expect(A.col.parkedFor('accession', p.id)).toEqual([]);
    // and a correct device's later edit is placed past the flagged one in turn, and shows on both
    for (let i = 1; i <= 3; i++) {
      on(A);
      await A.col.put('accession', p.id, { notes: `A round ${i}` });
      await syncAll([A, B]);
      expect([notes(A, p.id), notes(B, p.id)]).toEqual([`A round ${i}`, `A round ${i}`]);
      on(B);
      await B.col.put('accession', p.id, { notes: `B round ${i}` });
      await syncAll([A, B]);
      expect([notes(A, p.id), notes(B, p.id)]).toEqual([`B round ${i}`, `B round ${i}`]);
    }
  });

  it('the same once B\'s clock is confirmed before the edit (a reading, no listing yet): the same outcome', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made on A' } as never);
    await syncAll([A, B]);
    B.skew = YEAR;
    on(B);
    await B.col.put('accession', p.id, { notes: 'B while fast' });
    B.skew = 0;
    later(); on(B); B.hlc.trustServerTime(trueNow, Date.now()); await B.col.rebuild();
    expect(B.hlc.clockChecked()).toBe(true);
    await B.col.put('accession', p.id, { notes: 'B on a confirmed clock' });
    expect(notes(B, p.id)).toBe('B on a confirmed clock');
    await syncAll([A, B]);
    expect([notes(A, p.id), notes(B, p.id)]).toEqual(['B on a confirmed clock', 'B on a confirmed clock']);
  });

  it('a removal of a plant made a year fast, after the clock was put right: removed on both', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    B.skew = YEAR;
    on(B);
    const p = await B.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made a year fast' } as never);
    B.skew = 0;
    on(B);
    await B.col.remove('accession', p.id);
    expect(notes(B, p.id)).toBe('(not shown)');
    await syncAll([A, B]);
    expect([notes(A, p.id), notes(B, p.id)]).toEqual(['(not shown)', '(not shown)']);
  });
});

describe('Apply on a parked restore', () => {
  it('brings the plant back on the peer (round 60: applyParked wrote nothing for a parked `_deleted: false` and dismissed it; fuzz seed 1012)', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made on A' } as never);
    await syncAll([A, B]);
    on(A);
    await A.col.remove('accession', p.id);
    await syncAll([A, B]);
    expect(notes(B, p.id)).toBe('(not shown)');
    A.skew = 3 * DAY; // A's clock jumps three days ahead (its last confirmation is still inside the week)
    on(A);
    await A.col.restore('accession', p.id); // the grower brings the plant back
    later(); await syncRun(A); // round 61: A's listing parks its own restore by the same arrival
    later(); await syncRun(B); // B parks the restore by its arrival
    expect(notes(A, p.id)).toBe('(not shown)'); // round 60: 'made on A' on its writer, removed on every peer
    on(B);
    expect(B.col.parkedFor('accession', p.id).map((c) => `${c.field}=${c.value}`)).toEqual(['_deleted=false']); // the notice reads "(…: restore) was not applied. Apply it now"
    await B.col.applyParked('accession', p.id);
    expect(B.col.parkedFor('accession', p.id)).toEqual([]); // dismissed
    expect(notes(B, p.id)).toBe('made on A'); // on 21257b7: '(not shown)': Apply wrote nothing
    A.skew = 0;
    await syncAll([A, B]);
    expect(notes(A, p.id)).toBe('made on A'); // the restore Apply wrote, at true time, reaches the writer too
  });
});
