/**
 * Round-60 self-review, clock area: the convergence fuzz of r60-fuzz.test.ts, instrumented. PASSES (a measurement: it
 * asserts what r60-fuzz asserts and writes a classification of every diverged seed to FZ_LOG).
 *
 * For each diverged seed and key: EXPLAINED when some change to that record is parked on a peer and is the field's
 * current stamp on its writer (the writer-vs-peers parking), with the hours its stamp ran past its arrival and the
 * writer's skew, correction and confirmation when it was written; UNEXPLAINED with the record's changes otherwise. Then
 * every peer presses Apply on every parked record, all devices sync three times, and the folds are compared again.
 *
 * Run: FZ_LOG=/tmp/fz.log npx vitest run tests/unit/clock--fuzz-classify.test.ts -t "with clock skews"
 *      FZ_NO3D=1 ...   (the skews without +3 days)      FZ_SEEDS=1008,1012 ...   (chosen seeds)
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import type { Change } from '$core/log';
import { isParked, PARK_MS } from '$core/log';
import { appendFileSync } from 'node:fs';
const LOG = process.env.FZ_LOG ?? '/tmp/fuzz-classify.log';
const out = (s: string) => appendFileSync(LOG, s + '\n');

type Mem = { device: string; changes: Map<string, Change>; outbox: Set<string>; meta: Map<string, unknown> };
const G = globalThis as unknown as { __mem: Mem };
const newMem = (device: string): Mem => ({ device, changes: new Map(), outbox: new Set(), meta: new Map() });
G.__mem = newMem('xxxxxxxxxxxx');

vi.mock('$lib/db/vault', () => {
  const mem = () => (globalThis as unknown as { __mem: Mem }).__mem;
  class StoppedError extends Error {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    StoppedError,
    allChanges: async () => [...mem().changes.values()].map((c) => structuredClone(c)),
    appendChanges: async (cs: Change[], fromServer = false) => {
      const kept: Change[] = [];
      for (const c of cs) {
        const had = mem().changes.get(c.t);
        if (had && JSON.stringify(had) !== JSON.stringify(c)) throw new Error('two contents under one stamp ' + c.t);
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
    parkStamps: async (st: string[]) => { const had = (mem().meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem().meta.set('parked', out); return out; },
    lastArrival: async () => 0,
    arrivalsAfter: async () => ({ changes: [], seq: 0, gen: 0 }),
    changeKeys: async () => [...mem().changes.keys()]
  };
  m.appendChangesClaiming = async (kind: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => {
    const issued = new Set([...known, ...(((mem().meta.get('issued:' + kind) as string[]) ?? []))]);
    const b = build(issued);
    await m.appendChanges(b.changes);
    for (const c of b.changes) if ((c.kind === 'accession' && c.field === 'acc') || (c.kind === 'sowing' && c.field === 'no')) issued.add(String(c.value));
    mem().meta.set('issued:' + kind, [...issued]);
    return b.result;
  };
  return m;
});

/* ---- a tiny seeded PRNG ---- */
function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)] };
}

type Col = typeof import('$lib/db/collection.svelte')['collection'];
type Hlc = typeof import('$core/hlc');
interface Device { mem: Mem; col: Col; hlc: Hlc; skew: number }

const DAY = 86_400_000;
let trueNow = 0;
const server: Array<{ c: Change; arrival: number }> = [];
const madeAt = new Map<string, string>();

async function bootDevice(mem: Mem): Promise<{ col: Col; hlc: Hlc }> {
  G.__mem = mem;
  vi.resetModules();
  const hlc = await import('$core/hlc');
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return { col: collection, hlc };
}
const on = (d: Device) => { G.__mem = d.mem; vi.setSystemTime(trueNow + d.skew); };

async function syncRun(d: Device): Promise<void> {
  on(d);
  // push: the outbox, stamped with its arrival
  for (const t of [...d.mem.outbox]) {
    const c = d.mem.changes.get(t)!;
    if (!server.some((x) => x.c.t === t)) server.push({ c: structuredClone(c), arrival: trueNow });
    d.mem.outbox.delete(t);
  }
  // the server's Date header, as the pull reads it
  const wasOff = d.hlc.clockOffsetMs(), wasChecked = d.hlc.clockChecked();
  d.hlc.trustServerTime(trueNow, Date.now());
  if (d.hlc.clockOffsetMs() !== wasOff || (!wasChecked && d.hlc.clockChecked())) await d.col.rebuild();
  // pull: what this device lacks, as takeBatch judges it
  for (const { c, arrival } of server) {
    if (d.mem.changes.has(c.t)) continue;
    const hold = { now: d.hlc.nowMs(), except: d.col.device, arrival, parked: d.col.parkedStamps, clockChecked: d.hlc.clockChecked() };
    if (isParked(c.t, hold)) {
      G.__mem.changes.set(c.t, structuredClone(c));
      await d.col.markParked([c]);
    } else await d.col.ingest([structuredClone(c)], 'server');
  }
}

const visible = (col: Col) => {
  const out: Record<string, unknown> = {};
  for (const a of col.accessions) out['a:' + a.id] = { acc: a.acc, taxonName: a.taxonName, notes: a.notes ?? null, status: a.status, locationId: a.locationId ?? null, sourceFrom: a.sourceFrom ?? null };
  for (const l of col.locations) out['l:' + l.id] = { name: l.name, parentId: l.parentId ?? null };
  for (const a of col.accessions) out['e:' + a.id] = col.events(a.id).map((e) => e.id + ':' + e.t + ':' + (e.note ?? '')).sort();
  return out;
};

interface Tally { lost: Array<{ seed: number; step: number; what: string }>; diverged: Array<{ seed: number; keys: string[]; skews: string }>; ops: Record<string, number>; seeds: number }
const tally: Tally = { lost: [], diverged: [], ops: {}, seeds: 0 };

async function runSeed(seed: number, steps: number, opts: { skews: boolean }): Promise<void> {
  const r = rng(seed);
  server.length = 0;
  madeAt.clear();
  trueNow = Date.UTC(2026, 9, 4, 12, 0, 0);
  vi.setSystemTime(trueNow);
  const devs: Device[] = [];
  for (const id of ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc']) {
    const mem = newMem(id);
    const b = await bootDevice(mem);
    devs.push({ mem, col: b.col, hlc: b.hlc, skew: 0 });
  }
  const skewLog: string[] = [];
  const names = ['Copiapoa cinerea', 'Lithops lesliei', 'Welwitschia mirabilis', 'Aloe polyphylla'];
  for (let step = 0; step < steps; step++) {
    trueNow += 1000 + r.int(120_000);
    const d = r.pick(devs);
    on(d);
    const op = r.int(100);
    const plants = d.col.accessions;
    const removed = [...(d.col as unknown as { state: Map<string, { kind: string; _deleted?: boolean; id: string }> }).state.values()].filter((x) => x.kind === 'accession' && x._deleted);
    const count = (k: string) => (tally.ops[k] = (tally.ops[k] ?? 0) + 1);
    try {
      if (op < 14) {
        count('add');
        await d.col.addAccession({ taxonName: r.pick(names), notes: `n${step}` } as never);
      } else if (op < 40 && plants.length) {
        count('edit');
        const p = r.pick(plants);
        const field = r.pick(['notes', 'sourceFrom', 'taxonName']);
        const value = `${field}-${d.mem.device.slice(0, 1)}-${step}`;
        await d.col.put('accession', p.id, { [field]: value });
        const now = d.col.accession(p.id);
        if (now && (now as unknown as Record<string, unknown>)[field] !== value) tally.lost.push({ seed, step, what: `${d.mem.device.slice(0, 1)} edit ${field} of ${p.id} not shown (skew ${Math.round(d.skew / 3600_000)} h)` });
      } else if (op < 46 && plants.length) {
        count('remove');
        await d.col.remove('accession', r.pick(plants).id);
      } else if (op < 52 && removed.length) {
        count('restore');
        await d.col.restore('accession', r.pick(removed).id);
      } else if (op < 58 && plants.length) {
        count('event');
        await d.col.addEvent({ acc: r.pick(plants).id, d: '2026-10-04', t: 'water' } as never);
      } else if (op < 62 && plants.length) {
        const p = plants.find((a) => d.col.sharesNumber('accession', a.id).length);
        if (p) { count('renumber'); await d.col.repairNumbers({ kind: 'accession', no: String(p.acc) }); }
      } else if (op < 66 && opts.skews) {
        count('skew');
        d.skew = r.pick(process.env.FZ_NO3D ? [0, 0, 0, 10 * 60_000, 3 * 3600_000, 30 * 3600_000, -10 * 60_000, -30 * 3600_000, -3 * DAY] : [0, 0, 0, 10 * 60_000, 3 * 3600_000, 30 * 3600_000, 3 * DAY, -10 * 60_000, -30 * 3600_000, -3 * DAY]);
        skewLog.push(`${d.mem.device.slice(0, 1)}@${step}:${d.skew / 3600_000}h`);
      } else if (op < 72) {
        count('reload');
        const b = await bootDevice(d.mem);
        d.col = b.col; d.hlc = b.hlc;
      } else {
        count('sync');
        await syncRun(d);
      }
    } catch (e) {
      tally.lost.push({ seed, step, what: `threw: ${(e as Error).message}` });
    }
    for (const t of d.mem.changes.keys()) if (!madeAt.has(t)) madeAt.set(t, `skew ${Math.round(d.skew / 3600_000)}h offset ${Math.round(d.hlc.clockOffsetMs() / 3600_000)}h checked ${d.hlc.clockChecked()}`);
  }
  // settle: clocks right, three days on, everyone syncs twice (a minute apart) and reloads
  for (const d of devs) d.skew = 0;
  trueNow += 3 * DAY;
  for (let round = 0; round < 3; round++) { for (const d of devs) await syncRun(d); trueNow += 2 * 60_000; }
  for (const d of devs) { const b = await bootDevice(d.mem); d.col = b.col; d.hlc = b.hlc; }
  for (const d of devs) await syncRun(d);
  const states = devs.map((d) => { on(d); return visible(d.col); });
  const keys = new Set(states.flatMap((s) => Object.keys(s)));
  const bad: string[] = [];
  for (const k of keys) { const v = states.map((s) => JSON.stringify(s[k] ?? null)); if (new Set(v).size > 1) bad.push(`${k}: ${v.join(' | ')}`); }
  if (bad.length) {
    tally.diverged.push({ seed, keys: bad.slice(0, 4), skews: skewLog.join(' ') });
    const union = new Map<string, Change>();
    for (const d of devs) for (const c of d.mem.changes.values()) union.set(c.t, c);
    const writerOf = (t: string) => devs.find((d) => t.slice(t.lastIndexOf('-') + 1).startsWith(d.mem.device));
    const seenOf = (d: Device) => (d.col as unknown as { seen: Map<string, string> }).seen;
    const verdicts: string[] = [];
    let allExplained = true;
    for (const k of keys) {
      const v = states.map((s) => JSON.stringify(s[k] ?? null));
      if (new Set(v).size <= 1) continue;
      const id = k.slice(2);
      const kind = k[0] === 'l' ? 'location' : 'accession';
      const evIds = new Set([...union.values()].filter((c) => c.kind === 'event' && c.field === 'acc' && c.value === id).map((c) => c.id));
      const rel = [...union.values()].filter((c) => (c.kind === kind && c.id === id) || (kind === 'accession' && c.kind === 'event' && evIds.has(c.id)));
      const asym = rel.filter((c) => {
        const w = writerOf(c.t);
        if (!w || w.col.parkedStamps.has(c.t)) return false;
        const peersParked = devs.filter((d) => d !== w && d.col.parkedStamps.has(c.t));
        if (!peersParked.length) return false;
        // the writer folds it: the stamp is the field's current stamp on the writer
        return seenOf(w).get(c.kind + ':' + c.id + '\0' + c.field) === c.t;
      });
      const byArrival = asym.filter((c) => { const s = server.find((x) => x.c.t === c.t); return !!s && Number(c.t.slice(0, 13)) > s.arrival + PARK_MS; });
      const explained = asym.length > 0;
      if (!explained) allExplained = false;
      const parkInfo = (c: Change) => devs.map((d) => d.mem.device[0] + (d.col.parkedStamps.has(c.t) ? 'P' : d.col.heldList().includes(c.t) ? 'H' : d.mem.changes.has(c.t) ? (seenOf(d).get(c.kind + ':' + c.id + '\0' + c.field) === c.t ? 'W' : 'l') : '-')).join('');
      verdicts.push(`  ${explained ? 'EXPLAINED' : 'UNEXPLAINED'} ${k}: ${v.join(' | ')}` + (explained ? ` [writer-folded, peers-parked: ${asym.map((c) => c.field + '@' + c.t.slice(-16, -12) + (byArrival.includes(c) ? ' by-arrival' : ' NOT-by-arrival') + '(+' + (() => { const s = server.find((x) => x.c.t === c.t); return s ? Math.round((Number(c.t.slice(0, 13)) - s.arrival) / 3600_000) : '?'; })() + 'h, ' + madeAt.get(c.t) + ')').join(', ')}]` : '\n' + rel.map((c) => { const s = server.find((x) => x.c.t === c.t); return `     ${c.t} ${c.kind}.${c.field}=${JSON.stringify(c.value)} arr=${s ? Math.round((Number(c.t.slice(0, 13)) - s.arrival) / 3600_000) + 'h' : 'unpushed'} ${parkInfo(c)}`; }).join('\n')));
    }
    // Apply on every peer, then sync until quiet, and compare again
    for (const d of devs) { on(d); for (const p of d.col.parkedList()) { try { await d.col.applyParked(p.kind, p.id); } catch (e) { verdicts.push('  apply threw ' + (e as Error).message); } } }
    for (let round = 0; round < 3; round++) { for (const d of devs) await syncRun(d); trueNow += 2 * 60_000; }
    const st2 = devs.map((d) => { on(d); return visible(d.col); });
    const keys2 = new Set(st2.flatMap((s) => Object.keys(s)));
    const bad2: string[] = [];
    for (const k of keys2) { const v = st2.map((s) => JSON.stringify(s[k] ?? null)); if (new Set(v).size > 1) bad2.push(`${k}: ${v.join(' | ')}`); }
    out(`seed ${seed} diverged ${bad.length} keys; ${allExplained ? 'all explained' : 'SOME UNEXPLAINED'}; after Apply on every peer: ${bad2.length ? 'STILL DIVERGED ' + bad2.length + ': ' + bad2.slice(0, 3).join(' ;; ') : 'converged'}; skews ${skewLog.join(' ')}`);
    for (const x of verdicts) out(x);
  }
  tally.seeds++;
}

describe('convergence fuzz (classified)', () => {
  it('no clock skew: 120 seeds x 50 steps converge and lose nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const before = { lost: tally.lost.length, div: tally.diverged.length };
    for (let s = 1; s <= Number(process.env.FZ_N ?? 120); s++) await runSeed(s, 50, { skews: false });
    const lost = tally.lost.slice(before.lost), div = tally.diverged.slice(before.div);
    console.log('no skew', { lost: lost.length, diverged: div.length, firstLost: lost.slice(0, 5), firstDiv: div.slice(0, 3) });
    expect(div).toEqual([]);
    expect(lost).toEqual([]);
  }, 600_000);
  it('with clock skews (+-10 min, +-30 h, +-3 d): nothing is lost; divergence is reported (held and parked changes differ by device until they come due or are applied)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const before = { lost: tally.lost.length, div: tally.diverged.length };
    for (const s of process.env.FZ_SEEDS ? process.env.FZ_SEEDS.split(',').map(Number) : Array.from({ length: Number(process.env.FZ_N ?? 120) }, (_, i) => 1001 + i)) await runSeed(s, 60, { skews: true });
    const lost = tally.lost.slice(before.lost), div = tally.diverged.slice(before.div);
    console.log('skew', JSON.stringify({ seeds: 120, lost: lost.length, diverged: div.length, firstLost: lost.slice(0, 8), firstDiv: div.slice(0, 4) }, null, 1));
    expect(lost).toEqual([]); // round sixty: an edit always wins and nothing of this device's is parked by its own clock
  }, 900_000);
});
afterAll(() => { vi.useRealTimers(); console.log('ops', tally.ops); });
