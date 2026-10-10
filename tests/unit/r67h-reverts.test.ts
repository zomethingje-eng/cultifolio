/**
 * Round sixty-seven, the harness (triage-66 H4, R45-26): of the outside review's seventy reverts of rounds sixty-two to
 * sixty-six, seven stayed green. Each case here is red on the base with its fix reverted, and says which.
 *   1. `adoptStored` does not re-measure (hlc.ts; revert: `follow()` first): the clock moves between one tab's write and
 *      another's storage event; the other tab is told once.
 *   2. `observe` follows an unmarked counter one short of the flag from the next millisecond (hlc.ts; revert: the guard
 *      at `PAST_BIT` instead of `PAST_BIT - 1`): `bump` is never handed that counter.
 *   3. `bump` never lands on the flag (hlc.ts; revert: the `count + 1 >= PAST_BIT` arm dropped): a clock at one short of
 *      it ticks to the next millisecond, unmarked.
 *   4. `plan.mixed` only when a number is renumbered (number-order.ts; revert: the condition dropped): a mixed sheet with
 *      no repeats is not called mixed.
 *   5. The sweep's hold is dated by the counter's clock (counters.ts; revert: `hold(name, now)`): an upload's hold is
 *      refused before the renew.
 * The places' two (one write per new place; `settlePlaces` on every form) are browser tests:
 * tests/e2e/r67h-places.spec.ts.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const MIN = 60_000;
const HOUR = 3_600_000;
const store = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const hadAdd = (globalThis as { addEventListener?: unknown }).addEventListener;
type Tab = { h: typeof import('$core/hlc'); onStorage: (e: { key: string }) => void };

describe('1. a tab takes another tab\'s correction as written, without measuring the clock itself (R45-26; round sixty-two, second pass)', () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } });
  });
  afterEach(() => {
    vi.useRealTimers();
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { addEventListener?: unknown }).addEventListener = hadAdd;
  });
  async function openTab(): Promise<Tab> {
    vi.resetModules();
    let onStorage: (e: { key: string }) => void = () => {};
    (globalThis as { addEventListener?: unknown }).addEventListener = (type: string, fn: (e: { key: string }) => void) => { if (type === 'storage') onStorage = fn; };
    const h = await import('$core/hlc');
    return { h, onStorage: (e) => onStorage(e) };
  }
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('the device clock moves between tab A\'s write and tab B\'s storage event: B is told once, of what A wrote', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 - HOUR }); // an hour slow
    const A = await openTab();
    A.h.trustServerTime(T0, Date.now());
    const B = await openTab(); // loads the hour
    expect(B.h.clockOffsetMs()).toBe(HOUR);
    const toldB: number[] = [];
    B.h.onClockOffsetChange((o) => toldB.push(o));
    vi.advanceTimersByTime(2 * MIN);
    A.h.trustServerTime(Date.now() + 2 * HOUR, Date.now()); // tab A reads the server: two hours now, stored
    const written = A.h.clockOffsetMs();
    expect(written).not.toBe(HOUR);
    vi.setSystemTime(Date.now() + HOUR); // and before tab B hears of it, the device clock is moved forward an hour
    B.onStorage({ key: 'cultifolio.clockOffsetMs' });
    await settle();
    expect(toldB).toEqual([written]); // reverted: [0] or [0, 0], B measures the move itself, stores its own reading over A's and is told of that
  });
});

describe('2 and 3. a clock\'s own stamp never carries the flag of a stamp made past another (R45-26; round sixty-two, the harness review\'s 7)', () => {
  // Each guard alone keeps the stamps right, so a revert of one was masked by the other: each is tested on its own here.
  it('observe: an unmarked counter one short of the flag is followed from the next millisecond, never bumped from', async () => {
    const { Clock, PAST_BIT, hlcEncode } = await import('$core/hlc');
    const W = Date.UTC(2026, 9, 4, 12, 0, 0);
    const c = new Clock('aaaaaaaaaaaa0000', () => W);
    const bumped: number[] = [];
    const proto = Clock.prototype as unknown as { bump: (wall: number, count: number) => unknown };
    const real = proto.bump;
    const spy = vi.spyOn(proto, 'bump').mockImplementation(function (this: unknown, wall: number, count: number) { bumped.push(count); return real.call(this, wall, count); });
    try {
      c.observe(hlcEncode({ wall: W, count: PAST_BIT - 1, device: 'bbbbbbbbbbbb0000' }));
    } finally {
      spy.mockRestore();
    }
    expect(bumped.filter((n) => n >= PAST_BIT - 1)).toEqual([]); // reverted: [0x7fffff], left to bump's own guard
  });
  it('bump: a clock one short of the flag ticks to the next millisecond, unmarked', async () => {
    const { Clock, PAST_BIT, hlcEncode, hlcDecode, isPastStamp } = await import('$core/hlc');
    const W = Date.UTC(2026, 9, 4, 12, 0, 0);
    const c = new Clock('aaaaaaaaaaaa0000', () => W);
    // Two short: observe's own guard does not touch it, and the observe's bump takes the clock to one short.
    c.observe(hlcEncode({ wall: W, count: PAST_BIT - 2, device: 'bbbbbbbbbbbb0000' }));
    const t = c.tick();
    expect(isPastStamp(t)).toBe(false); // reverted: true, the clock's own stamp marked as made past another
    expect(hlcDecode(t)).toMatchObject({ wall: W + 1, count: 0 });
  });
});

describe('4. a sheet is called mixed only when a line of it was renumbered (R45-26; round sixty-three, the fix pass R2)', () => {
  it('a sheet whose numbers follow no one pattern, none in use and none repeated: nothing renumbered, nothing said', async () => {
    const { parsePaste } = await import('$lib/import/paste');
    const { rowsFromPaste } = await import('$lib/import/rows');
    const { planNumbers } = await import('$lib/import/plan');
    const rows = rowsFromPaste(parsePaste('Copiapoa cinerea; ; 0007\nLithops lesliei; ; X12\nAloe vera; ; 2019-0147'), { placeId: null, acquired: null, source: null });
    const plan = planNumbers(rows, ['2026-0001'], { mode: 'year', width: 4 }, 2026);
    expect(rows.map((r) => plan.byRow.get(r.key)!.numbers[0])).toEqual(['0007', 'X12', '2019-0147']);
    expect(plan.renumbered).toEqual([]);
    expect(plan.mixed).toBe(false); // reverted: true, though no line took this collection's next number
  });
});

describe('5. each hold of the photograph sweep is dated by when it is taken (R45-26; round sixty-three, R3 6)', () => {
  // r63fs-sweep's case asked for the upload's hold just before the delete, after the renew had dated the hold afresh; a
  // revert to the run's start was masked by it. Here the upload asks before the renew: during the second photograph's
  // listing, two minutes into the run, the first photograph's listing having taken them.
  it('a run two minutes in: the next photograph\'s hold still holds its name against an upload, before any renew', async () => {
    const { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush } = await import('$lib/server/sync');
    const { HOLD_MS } = await import('$lib/server/counters');
    const { fakeKV } = await import('./helpers/fake-sync');
    const { casR2 } = await import('./helpers/r62s-fake');
    const { countersWithStore } = await import('./helpers/r63s-fake');
    resetRateLimits(); resetMetaFlush();
    const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346', OWNER = 'd'.repeat(64);
    const name = (n: number) => `vault/${ID}/photo/p00000${n}.bin`;
    const ref = (n: number) => `vault/${ID}/photoref/p00000${n}.json`;
    const r2 = casR2(); const ns = countersWithStore(r2);
    const q = (now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters: ns, now });
    const meta = async () => (await readMeta(r2 as never, ID))!;
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    await r2.put('probe', 'x'); const T0 = r2.objs.get('probe')!.uploaded.getTime() + 1; r2.objs.delete('probe');
    // Two photographs, each stored, removed, and stored again with its pointer write cut off: an unnamed generation each, marked.
    const A = T0 + 11 * MIN;
    for (const n of [1, 2]) {
      await storeOnce(r2 as never, ID, await meta(), name(n), new Uint8Array(1000).fill(n), { drop: OWNER }, q(T0));
      expect(await deleteCounted(r2 as never, ID, await meta(), name(n), q(A), OWNER, A - MIN)).toBe(true);
      let cut = true;
      r2.cas.before = async (k) => { if (k === ref(n) && cut) { cut = false; throw new Error('the Worker stopped'); } };
      await expect(storeOnce(r2 as never, ID, await meta(), name(n), new Uint8Array(700).fill(n + 2), { drop: OWNER }, q(A + MIN))).rejects.toThrow(/stopped/);
      r2.cas.before = undefined;
    }
    const run = A + 12 * MIN;
    const real = Date.now();
    let lists = 0;
    let asked: { ok: boolean } | null = null;
    const list = r2.list.bind(r2);
    (r2 as unknown as { list: unknown }).list = async (o: { prefix?: string }) => {
      if (o?.prefix?.includes('p000001')) vi.spyOn(Date, 'now').mockReturnValue(real + 2 * MIN); // the first photograph's listing takes two minutes
      else if (o?.prefix?.includes('p000002') && !asked) asked = await ns.raw(`bytes:${ID}`).c.hold(name(2), run + 2 * MIN + 1000);
      lists++;
      return list(o as never);
    };
    try {
      await ns.raw(`bytes:${ID}`).c.tick(run);
    } finally {
      vi.restoreAllMocks();
    }
    expect(lists).toBeGreaterThanOrEqual(2);
    expect(2 * MIN + 1000).toBeGreaterThan(HOLD_MS); // dated by the run's start, the second hold had lapsed before it was written
    expect(asked).toMatchObject({ ok: false }); // reverted: { ok: true }, an upload let in beside the sweep's reading
  });
});
