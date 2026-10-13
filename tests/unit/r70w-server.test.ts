/**
 * Round seventy, W (triage-69 W3 and W4): the server's half.
 *
 * W3 (S-E3): a DELETE without the removal's proof, on a photograph already removed, took the name's hold, listed the
 * generations under it, and the grower's own revival meanwhile was told "busy". FAILED on the base: one hold given to the
 * stranger's DELETE, and the revival a `PhotoBusy`.
 *
 * W4 (S-E7): the listing budget was the clock hour's, and started again at its turn: 30 asks in the last tenth of a
 * second of one hour and 30 in the first of the next let 48 walks (2,400 pages) start. FAILED on the base: 48 walks.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, PhotoBusy } from '$lib/server/sync';
import { refKey } from '$lib/server/photogen';
import { Counters } from '$lib/server/counters';
import { fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';
import { pagedStorage } from './helpers/r61s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const STRANGER = 'e'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const MIN = 60_000;
const meta = async (r2: FakeR2, id = ID) => (await readMeta(r2 as never, id))!;
const q = (counters: unknown, now: number, ip = '1.2.3.4') => ({ kv: fakeKV() as never, ip, counters: counters as never, now });
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

/** A vault with one photograph stored by its owner and then removed by the owner's device; every hold given is recorded. */
async function removed() {
  const r2 = casR2();
  const ns = countersNs();
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  const T0 = await clockOf(r2);
  await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(1), { drop: OWNER }, q(ns, T0));
  expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 11 * MIN), OWNER, T0 + 10 * MIN)).toBe(true);
  const o = ns.raw(`bytes:${ID}`).c as unknown as { hold: (n: string, now?: number) => Promise<unknown> };
  const real = o.hold.bind(o);
  const holds: unknown[] = [];
  o.hold = async (n: string, now?: number) => { const h = await real(n, now); holds.push(h); return h; };
  return { r2, ns, T0, holds };
}

describe('W3: a DELETE takes a removed photograph\'s hold only with the proof (S-E3)', () => {
  it('a stranger\'s DELETE, with a wrong proof or none, is answered at once and holds nothing; the grower\'s revival is stored', async () => {
    const { r2, ns, T0, holds } = await removed();
    // Each stranger's request stalled inside any listing it makes, as the reviewer's reproduction did.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const list = r2.list.bind(r2);
    (r2 as unknown as { list: typeof r2.list }).list = (async (o: never) => { if (holds.length) await gate; return list(o); }) as typeof r2.list;
    const wrong = deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 12 * MIN, '203.0.113.9'), STRANGER, null);
    const none = deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 12 * MIN, '203.0.113.9'), null, null);
    const soon = <T,>(p: Promise<T>) => Promise.race([p, new Promise<'stalled'>((r) => setTimeout(() => r('stalled'), 300))]);
    const answers = [await soon(wrong), await soon(none)];
    const held = [...holds];
    (r2 as unknown as { list: typeof r2.list }).list = list;
    release();
    await Promise.all([wrong, none]);
    expect(held).toHaveLength(0); // base: 1, { ok: true }
    expect(answers).toEqual([false, false]); // base: the first stalled in its listing, under the hold
    // The owner's device brings the photograph back meanwhile (an Undo past the ten minutes): stored, never "busy".
    const revive = await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(3), { drop: OWNER }, q(ns, T0 + 12 * MIN));
    expect(revive).not.toBeInstanceOf(PhotoBusy);
  });
  it('guard: the owner\'s own DELETE again, with the receipt\'s proof, still takes the hold and is answered as done', async () => {
    const { r2, ns, T0, holds } = await removed();
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 12 * MIN), OWNER, T0 + 10 * MIN)).toBe(false);
    expect(holds).toHaveLength(1);
  });
  it('a pointer that cannot be read is still a wait, never "nothing there", and no hold is taken for it', async () => {
    const { r2, ns, T0, holds } = await removed();
    await r2.put(refKey(NAME), 'not a pointer');
    const got = await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, T0 + 12 * MIN), STRANGER, null);
    expect(got).toBeInstanceOf(PhotoBusy);
    expect(holds).toHaveLength(0);
  });
});

describe('W4: the listing budget holds over any sixty minutes, not the clock hour (S-E7)', () => {
  // The hour's pages and one walk's, written out (R46-31: a test that reads the constant stays green when it is raised).
  const BUDGET = 1200, WALK = 50;
  const turn = Date.UTC(2026, 9, 10, 13);
  it('the reviewer\'s shape: 30 asks in the last tenth of a second of an hour and 30 in the first of the next start at most the budget and one walk', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    let ok = 0;
    for (let i = 0; i < 30; i++) if ((await c.listAsk(BUDGET, turn - 100, WALK)).ok) ok++;
    for (let i = 0; i < 30; i++) if ((await c.listAsk(BUDGET, turn + 100, WALK)).ok) ok++;
    expect(ok * WALK).toBeLessThan(BUDGET + WALK); // base: 48 walks, 2,400 pages
    expect(ok).toBe(24);
  });
  it('no sixty minutes hold more: walks every minute for three hours never pass the budget and one walk in any window', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    const start = turn - 90 * MIN;
    const asked: number[] = [];
    // An ask every 20 seconds, each walk using its whole reservation.
    for (let t = start; t < start + 180 * MIN; t += 20_000) {
      const a = await c.listAsk(BUDGET, t, WALK);
      if (a.ok) { asked.push(t); await c.listed(WALK, t + 500, a.reserved, a.minute); }
    }
    let worst = 0;
    for (const t of asked) worst = Math.max(worst, asked.filter((u) => u >= t && u < t + 60 * MIN).length * WALK);
    expect(worst).toBeLessThan(BUDGET + WALK);
    // and the budget is used: a window is not starved to nothing
    expect(worst).toBeGreaterThanOrEqual(BUDGET);
  });
  it('a refusal says when the count falls under the budget again: when the oldest counted minute leaves the sixty', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    const t0 = Date.UTC(2026, 9, 10, 12, 10, 30);
    // Each walk uses its whole reservation and settles a second on.
    const walk = async (t: number) => { const a = await c.listAsk(BUDGET, t, WALK); expect(a.ok).toBe(true); if (a.ok) await c.listed(WALK, t + 1000, a.reserved, a.minute, a.id); };
    for (let i = 0; i < 12; i++) await walk(t0); // 600 pages at 12:10
    for (let i = 0; i < 12; i++) await walk(t0 + 20 * MIN); // 600 at 12:30
    const no = await c.listAsk(BUDGET, t0 + 40 * MIN, WALK); // 12:50:30
    expect(no.ok).toBe(false);
    // 12:10's minute is counted until 13:11:00, 20 min 30 s on
    if (!no.ok) expect(no.retryAfter).toBe(20 * 60 + 30);
    expect((await c.listAsk(BUDGET, Date.UTC(2026, 9, 10, 13, 11), WALK)).ok).toBe(true);
  });
  it('guard: a walk gives back what it did not use, so a small vault is listed a thousand times in an hour', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    let ok = 0;
    for (let i = 0; i < 1000; i++) {
      const a = await c.listAsk(BUDGET, turn - 30 * MIN + i * 3000, WALK);
      if (a.ok) { ok++; await c.listed(1, turn - 30 * MIN + i * 3000 + 10, a.reserved, a.minute); }
    }
    expect(ok).toBe(1000);
  });
  it('the clock hour\'s count stored by round sixty-nine stays counted after the deploy, into the next hour', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    s.m.set('l', { h: Math.floor((turn - MIN) / 3_600_000), n: BUDGET }); // 12:00 to 13:00, the budget spent
    expect((await c.listAsk(BUDGET, turn - 30_000, WALK)).ok).toBe(false);
    expect((await c.listAsk(BUDGET, turn + 30_000, WALK)).ok).toBe(false); // base: the turn emptied it
    expect((await c.listAsk(BUDGET, turn + 60 * MIN, WALK)).ok).toBe(true); // read as asked at 12:59, counted until 14:00
  });
});

/**
 * Second pass (triage-69 W6, R47-18). FAILED on the base and on the first pass: a reservation never settled was counted
 * for the hour; photographs and log batches shared one hour of 3,600 writes; the upstream object kept a minute's
 * addresses in memory until its next call.
 */
import { storeCounted, WritesSpent, refusal } from '$lib/server/sync';
import { fakeR2 } from './helpers/fake-sync';
describe('W6: a reservation never settled lapses after a minute (R47-18)', () => {
  const BUDGET = 1200, WALK = 50;
  it('24 pulls cancelled mid-walk refuse the vault\'s listings for a minute, not for the hour', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    const t = Date.UTC(2026, 9, 10, 12, 10);
    for (let i = 0; i < 24; i++) expect((await c.listAsk(BUDGET, t, WALK)).ok).toBe(true); // none of them settles
    const no = await c.listAsk(BUDGET, t + 30_000, WALK);
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.retryAfter).toBe(30);
    expect((await c.listAsk(BUDGET, t + 61_000, WALK)).ok).toBe(true); // base: refused until 13:00
  });
  it('a walk that settles after its reservation lapsed is still counted, in the minute it was asked', async () => {
    const s = pagedStorage();
    const c = new Counters({ storage: s } as never, {} as never);
    const t = Date.UTC(2026, 9, 10, 12, 10);
    const a = await c.listAsk(BUDGET, t, WALK);
    if (!a.ok) throw new Error('refused');
    await c.listed(40, t + 90_000, a.reserved, a.minute, a.id);
    const l = s.m.get('l') as { m: Array<[number, number]> };
    expect(l.m).toEqual([[a.minute, 40]]);
  });
});

describe('W6: photographs and log batches each have an hour of writes (R47-18)', () => {
  const VID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
  const batch = (i: number) => `vault/${VID}/log/1760097600000-0000-dev-${i.toString(16).padStart(12, '0')}.bin`;
  const photo = (i: number) => `vault/${VID}/photo/p${String(i).padStart(6, '0')}.bin`;
  const now = Date.UTC(2026, 9, 10, 12, 20);
  const hour = Math.floor(now / 3_600_000);
  it('a vault whose photographs spent the hour still stores log batches, and the refusal names photographs', async () => {
    const r2 = fakeR2(); const ns = countersNs();
    await writeMeta(r2 as never, VID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    expect(await storeCounted(r2 as never, VID, await meta(r2 as never, VID), photo(0), new Uint8Array(10), undefined, { drop: OWNER }, q(ns, now), true)).toBe(true);
    ns.raw(`bytes:${VID}`).m.set('wp', { h: hour, n: 3600 }); // the hour's photographs
    const e = await storeCounted(r2 as never, VID, await meta(r2 as never, VID), photo(1), new Uint8Array(10), undefined, { drop: OWNER }, q(ns, now), true).catch((x) => x);
    expect(e).toBeInstanceOf(WritesSpent);
    const body = (await refusal(e)!.json()) as { error: string; what: string };
    expect(body.what).toBe('photo');
    expect(body.error).toMatch(/^Uploading photographs is refused for now: .*3,600.*changes to your records still go\.$/);
    expect(await storeCounted(r2 as never, VID, await meta(r2 as never, VID), batch(0), new Uint8Array(10), undefined, {}, q(ns, now), true)).toBe(true); // base: refused, one hour for both
  });
  it('a vault whose log batches spent the hour still stores photographs', async () => {
    const r2 = fakeR2(); const ns = countersNs();
    await writeMeta(r2 as never, VID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    expect(await storeCounted(r2 as never, VID, await meta(r2 as never, VID), batch(0), new Uint8Array(10), undefined, {}, q(ns, now), true)).toBe(true);
    ns.raw(`bytes:${VID}`).m.set('w', { h: hour, n: 3600 });
    expect(await storeCounted(r2 as never, VID, await meta(r2 as never, VID), batch(1), new Uint8Array(10), undefined, {}, q(ns, now), true).catch((x) => x)).toBeInstanceOf(WritesSpent);
    expect(await storeCounted(r2 as never, VID, await meta(r2 as never, VID), photo(0), new Uint8Array(10), undefined, { drop: OWNER }, q(ns, now), true)).toBe(true); // base: refused
  });
});

describe('W6: the upstream object forgets a minute\'s addresses when the minute ends (R47-18, W1 note)', () => {
  it('the counts kept in memory are gone shortly after the minute, with no further call', async () => {
    const c = new Counters({ storage: pagedStorage() } as never, {} as never);
    const now = Date.now();
    const end = (Math.floor(now / 60_000) + 1) * 60_000;
    await c.upstream(['met'], 60, '203.0.113.7', '203.0.113.0/24', end - 20); // 20 ms before its minute ends
    const calls = () => (c as unknown as { calls: Map<string, number> }).calls;
    expect([...calls().keys()].some((k) => k.includes('203.0.113.7'))).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(calls().size).toBe(0); // base: kept until the next call
  });
});
