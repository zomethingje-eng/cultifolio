/**
 * Round sixty-two (agent L), adopted from docs/review-61/tests/clock--marks.test.ts: what the mark (bit 0x800000) and the
 * in-memory clock parks do across devices, at collection level. The harness is r61l-clock-devices.test.ts's own
 * (in-memory vault per device, a server that stamps arrivals, the writer's own changes judged by arrival as judgeOwn
 * does, a pull judged as takeBatch judges it), with one change: the monotonic clock is true time (`performance.now` is
 * stubbed to it), as a browser's is, so a device whose clock is moved is seen to move (round sixty-two, decision 5).
 *
 *  - Finding 6 is not fixed (the triage: "none small"; /about/formats states it): its two tests are inverted into guards
 *    of the stated ordering, so the page's sentence stays true.
 *  - Findings 2, 7 and 8 failed on the round-sixty-one base and pass with the fixes (the backup lists the stored parks
 *    alone; "Renumber now" places its repair past a marked stamp with the mark; a stored park of a marked stamp is not
 *    read). The guards are as they were.
 * Run: npx vitest run tests/unit/r62l-clock-marks.test.ts --testTimeout=180000
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  vi.stubGlobal('performance', { now: () => trueNow }); // the monotonic clock: true time, whatever a device's clock says
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('clock review 61: the mark across devices', () => {
  it('GUARD (finding 6, as /about/formats states it): an edit made later by true time, on a device that has not yet seen the marked edit, loses to it for as long as the fast stamp is ahead, on every device alike', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made on A' } as never);
    await syncAll([A, B]);
    B.skew = YEAR; // B's clock a year fast, offline
    on(B);
    await B.col.put('accession', p.id, { notes: 'B while fast' });
    B.skew = 0; // put right by hand, still offline
    later(60_000);
    on(B);
    await B.col.put('accession', p.id, { notes: 'B at 12:01, clock right' }); // stamped past its own fast stamp: marked, a year ahead
    later(60 * 60_000);
    on(A);
    await A.col.put('accession', p.id, { notes: 'A at 13:01, clock right' }); // an hour later, true time, both clocks right
    await syncAll([A, B]);
    expect([notes(A, p.id), notes(B, p.id)]).toEqual(['B at 12:01, clock right', 'B at 12:01, clock right']);
  });

  it('GUARD (finding 6, removal, as /about/formats states it): a plant removed an hour after a marked edit made elsewhere is shown on every device alike, ordered by the far stamp', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made on A' } as never);
    await syncAll([A, B]);
    B.skew = YEAR;
    on(B);
    await B.col.put('accession', p.id, { notes: 'B while fast' });
    B.skew = 0;
    later(60_000);
    on(B);
    await B.col.put('accession', p.id, { notes: 'B, clock right' }); // marked, a year ahead
    later(60 * 60_000);
    on(A);
    await A.col.remove('accession', p.id); // an hour later by true time
    expect(A.col.accession(p.id)).toBeUndefined();
    await syncAll([A, B]);
    on(A);
    const onA = A.col.accession(p.id)?.notes ?? '(removed)';
    on(B);
    const onB = B.col.accession(p.id)?.notes ?? '(removed)';
    expect([onA, onB]).toEqual(['B, clock right', 'B, clock right']);
  });

  it('FIXED (finding 7): "Renumber now" on a plant whose last stamp is a marked far one writes a repair stamped a year ahead, unmarked, which the fold parks: the number stays shared and the note is dated a year ahead', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    on(B);
    await B.col.addAccession({ taxonName: 'Lithops lesliei', acc: '2026-0001' } as never); // made first: keeps the number
    later();
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0001' } as never);
    A.skew = YEAR;
    on(A);
    await A.col.put('accession', p.id, { notes: 'A while fast' });
    A.skew = 0;
    later();
    on(A);
    await A.col.put('accession', p.id, { notes: 'A, clock right' }); // marked, a year ahead
    await syncAll([A, B]);
    on(A);
    expect(notes(A, p.id)).toBe('A, clock right');
    expect(A.col.numberPlan('accession', p.id)?.renumbered).toEqual([p.id]);
    expect(await A.col.repairNumbers({ kind: 'accession', no: '2026-0001' })).toBe(true);
    on(A);
    // Round sixty-one stamped the repair and its note one millisecond past the record's last stamp, a year ahead and
    // unmarked: parked here by the confirmed clock, and by their arrival on every peer, the note dated a year ahead. Now
    // they are placed past it with the mark, and the note is dated by the record's latest stamp read from a clock.
    const rep = [...A.mem.changes.values()].filter((c) => c.t.split('-')[2].startsWith('zz'));
    expect(rep.length).toBeGreaterThan(0);
    expect(rep.every((c) => isPastStamp(c.t))).toBe(true);
    expect(A.col.accession(p.id)?.acc).not.toBe('2026-0001');
    expect(rep.find((c) => c.field === 'd')?.value).toBe(new Date(Date.now()).toISOString().slice(0, 10));
    await syncAll([A, B]);
    on(B);
    expect(B.col.accession(p.id)?.acc).toBe(A.col.accession(p.id)?.acc); // the peer folds the repair too
    expect(B.col.parkedRecords).toBe(0);
  });

  it('FIXED (finding 2): a park judged by the clock alone is not in the stored parks a backup lists', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
    A.hlc.trustServerTime(Date.now(), Date.now()); // a sync reading confirmed this clock
    expect(A.hlc.clockChecked()).toBe(true);
    const ahead = A.hlc.hlcEncode({ wall: Date.now() + 3 * DAY, count: 0, device: 'cccccccccccc0000' });
    await A.col.ingest([{ t: ahead, kind: 'accession', id: p.id, field: 'notes', value: 'from a file, three days ahead' }], 'import');
    expect(A.col.parkedStamps.has(ahead)).toBe(true); // parked for this load
    expect((A.mem.meta.get('parked') as string[] | undefined) ?? []).not.toContain(ahead); // not stored (rule 5)
    // io.ts prepareBackup passes `parked: collection.parkedStamps`; restoreBackup's merge stores every manifest stamp
    // (markParked) and a replace stores them as the new vault's parked set (stage.setParked).
    const { buildBackup, readBackup } = await import('$lib/backup/backup');
    expect(A.col.storedParks.has(ahead)).toBe(false);
    const built = await buildBackup({ changes: await A.col.exportChanges(), device: 'aaaaaaaaaaaa', app: 'test', parked: A.col.storedParks, readPhoto: async () => null }); // as io.ts prepareBackup passes it
    const file = await readBackup(built.bytes);
    expect(file.manifest.parked ?? []).not.toContain(ahead);
  });

  it('PASSES (guard): a flagged stamp keeps its mark through a backup round trip, the CSV aside', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made' } as never);
    A.skew = YEAR;
    on(A);
    await A.col.put('accession', p.id, { notes: 'fast' });
    A.skew = 0;
    later();
    on(A);
    await A.col.put('accession', p.id, { notes: 'right' });
    const marked = [...A.mem.changes.values()].find((c) => c.value === 'right')!;
    expect(isPastStamp(marked.t)).toBe(true);
    const { buildBackup, readBackup } = await import('$lib/backup/backup');
    const file = await readBackup((await buildBackup({ changes: await A.col.exportChanges(), readPhoto: async () => null })).bytes);
    const back = file.changes.find((c) => c.value === 'right')!;
    expect(back.t).toBe(marked.t);
    expect(isPastStamp(back.t)).toBe(true);
  });
  it('FIXED (finding 8): a marked stamp an older build parked by its arrival (and stored) stays parked after that device updates, while every updated device shows it', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    const B = await device('B', 'bbbbbbbbbbbb');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'made on A' } as never);
    await syncAll([A, B]);
    A.skew = YEAR;
    on(A);
    await A.col.put('accession', p.id, { notes: 'A while fast' });
    A.skew = 0;
    later();
    on(A);
    await A.col.put('accession', p.id, { notes: 'A, clock right' }); // marked, a year ahead
    const marked = [...A.mem.changes.values()].find((c) => c.value === 'A, clock right')!;
    expect(isPastStamp(marked.t)).toBe(true);
    later(); await syncRun(A);
    // B still runs round sixty's build during the deploy: it reads the mark as a large counter, parks the change by its
    // arrival as takeBatch did then, and stores the verdict. Emulated by storing the park as that build's takeBatch did.
    on(B);
    B.mem.changes.set(marked.t, structuredClone(marked));
    await B.col.markParked([structuredClone(marked)]);
    // B loads the new build (a reload) and syncs with everyone.
    const b = await boot(B); B.col = b.col; B.hlc = b.hlc;
    await syncAll([A, B]);
    expect([notes(A, p.id), notes(B, p.id)]).toEqual(['A, clock right', 'A, clock right']);
  });
});

describe('clock review 61: guards for fixes no test held', () => {
  it('PASSES (guard, M17): a rebuild after the clock stops counting as confirmed drops the parks it judged by that clock: the change is held again, not parked', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    on(A);
    const p = await A.col.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
    A.hlc.trustServerTime(Date.now(), Date.now());
    const ahead = A.hlc.hlcEncode({ wall: Date.now() + 3 * DAY, count: 0, device: 'cccccccccccc0000' });
    await A.col.ingest([{ t: ahead, kind: 'accession', id: p.id, field: 'notes', value: 'three days ahead' }], 'import');
    expect(A.col.parkedStamps.has(ahead)).toBe(true);
    A.hlc.trustServerTime(Date.now() - 3 * DAY, Date.now()); // a first reading three days off: no longer confirmed
    expect(A.hlc.clockChecked()).toBe(false);
    await A.col.rebuild(); // what the engine's clock listener does
    expect(A.col.parkedStamps.has(ahead)).toBe(false);
    expect(A.col.heldWaiting).toBe(1);
  });

  it('PASSES (guard, M23): an edit placed past this device\'s own year-ahead stamp does not raise the clock line once the fast stamps are parked', async () => {
    const A = await device('A', 'aaaaaaaaaaaa');
    A.skew = YEAR;
    on(A);
    const q = await A.col.addAccession({ taxonName: 'Lithops lesliei', notes: 'made fast' } as never);
    A.skew = 0;
    later();
    on(A);
    await A.col.put('accession', q.id, { notes: 'edited after' });
    const marked = [...A.mem.changes.values()].find((c) => c.value === 'edited after')!;
    expect(isPastStamp(marked.t)).toBe(true);
    await A.col.markParked([...A.mem.changes.values()].filter((c) => c.id === q.id && hlcWall(c.t) > trueNow + DAY && !isPastStamp(c.t))); // as judgeOwn parks them
    await A.col.rebuild();
    expect(A.col.clockBehindAt).toBeNull();
  });
});
