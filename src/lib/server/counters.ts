/**
 * The vault-creation counters as one Durable Object, so a burst of creations is counted exactly: every check is a
 * read, a decision and a write inside one object, and Durable Objects deliver one request at a time, so two creations
 * in the same second cannot both read the same count (round twenty-one, 1). KV cannot do this: it takes one write a
 * second per key and caches reads for a minute per location, so under KV a burst was either refused for a write it
 * could not make or, once that was made non-fatal, not counted at all.
 *
 * One object, named "vaults", holds every counter; creations are rare (thousands in all, by design) so one is enough.
 * Keys: `ip:<address>:<day>` (5 a day), `net:<prefix>:<day>` (an IPv6 /48, 20 a day), `day:<day>` (the shared day ceiling,
 * counted at a vault's first object since round sixty), `all` (the ceiling in all). A daily alarm
 * deletes every `ip:` and `day:` key older than two days, so an address is kept for at most that long (round
 * twenty-two, 6); `all` is seeded once from the KV count that ran before the object existed, so the ceiling in all counts
 * every vault, not only those made since the migration. A creation counted and then not made (the vault write failed) is
 * refunded (round twenty-two, 1). Since round fifty-eight `all` counts the vaults that hold something: a vault takes its
 * place there at its first stored object (`fill`), so creations that are never used cannot spend the ceiling in all.
 *
 * The stored bytes too (round fifty-eight; the server review): an object of this class per vault (`bytes:<vault id>`)
 * holds the vault's running total, and one per address (`ipbytes:<address>`) the day's bytes from that address, each
 * checked and taken in one step, where KV's read-then-write let two uploads in the same instant each read the same
 * starting figure. A vault's total is put right from an R2 listing once a day and on every vault open, as before.
 *
 * Round fifty-nine (three reviews): a vault's object also holds what is in flight (`p`), taken with the bytes and released
 * when the upload lands or fails, so a recount (which cannot list an upload not yet written) adds it back instead of
 * erasing it, and a day's first uploads count against the day's row, not each against its own listing; a removed
 * object's bytes are given back once under its key and etag (`g:<token>`, swept with the day keys); and the "vaults"
 * object records each vault it has counted (`f:<vault id>`), so the ceiling in all counts a vault once and refuses a
 * new one past it.
 *
 * Round sixty (three reviews): what is in flight is held as leases, one key per upload (`p:<id>` → `{ n, at }`), each
 * dropped ten minutes after it was taken whatever became of its upload, so a release that never came (a Worker killed
 * mid-upload, a release that threw) no longer counts bytes for good. A generation (`gen`), bumped by every landing and
 * every removal, lets a recount refuse to commit a listing that one of them crossed. A photograph's name is held for a
 * short while (`h:<key>`) by its removal and by its upload, so the two cannot interleave, and an upload's claim on the
 * name is kept for two days (`c:<key>`), so a removal asked for before a newer upload of it leaves that upload alone. The
 * day's ceiling of new vaults (`day:`) is counted at a vault's first stored object, as the ceiling in all is, not at its
 * creation. A place under the ceiling in all is given back only when the vault's first object did not land (`unfill`):
 * a vault that has stored anything never becomes empty again, since its log batches are never removed (only its
 * photographs are), so there is no later moment at which it holds nothing. Round sixty-one: a vault with no upload for
 * 90 days gives its place back at the midnight sweep, and its next upload takes one again (`touch`); `f:<vault>` keeps
 * the day of its last upload for that. The site's own calls to other services are counted here too, in the object named
 * "upstream" (`upstream`), so the cap on them is one for the whole site.
 *
 * Round sixty-three: a vault's object also keeps the photographs a removal or a store of a removed photograph has marked
 * (`u:<name>`), and its alarm removes their generations that nothing names (`photoSweep`), so such bytes no longer wait
 * for that photograph's next touch. The shares of outside calls keep a reserve for networks new to the minute (`upstream`).
 *
 * Attached to the Worker by scripts/attach-do.mjs after the SvelteKit build (the adapter's worker exports only the app),
 * and bound as COUNTERS in wrangler.jsonc with a `new_sqlite_classes` migration. Without the binding the KV path in
 * `allowCreation` is used, which is bounding, not accounting.
 */
import { DurableObject } from 'cloudflare:workers';
import { NET_FACTOR, UPSTREAM_ADDRESS_PART, UPSTREAM_RESERVE_PART, UPSTREAM_RESERVE_EACH } from './caps';
import { unnamedGenerations, receipt, STRAY_MS, PointerUnreadable } from './photogen';

export type Creation = 'ok' | 'address' | 'day' | 'total' | 'unavailable';
const DAY_MS = 86_400_000;
/** The next UTC midnight after `now`: the alarm runs there, so "older than two days" is counted in whole UTC days from a fixed point (round twenty-three, 8). */
/** A /48's allowance of new vaults a day, as a multiple of one address's (caps.ts since round sixty-two). */
export { NET_FACTOR, UPSTREAM_ADDRESS_PART };
export const nextMidnight = (now: number) => Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;

export class Counters extends DurableObject {
  /**
   * Decide and count one creation. `address` is already keyed (an IPv4 address or an IPv6 /64); `day` is YYYY-MM-DD; `seed` is the count of vaults made before this object existed.
   * The address's and the /48's counts are taken here; the day's ceiling and the ceiling in all are only read, and are
   * counted at the vault's first stored object (`fill`): about two hundred empty creations a day spent the day's ceiling
   * and refused every new grower until midnight (round sixty; the self-review, 12).
   */
  async create(address: string, day: string, perAddress: number, perDay: number, max: number, seed: number | null = 0, now = Date.now(), net: string | null = null): Promise<Creation> {
    // `net` is the wider network an IPv6 address sits in (its /48), counted at four times the address's allowance: a /48
    // holds 65,536 /64s, so by /64s alone forty of them could spend the day's shared ceiling (round thirty-eight, R1-8).
    const kIp = `ip:${address}:${day}`, kDay = `day:${day}`, kNet = net ? `net:${net}:${day}` : null;
    const got = await this.ctx.storage.get<number>([kIp, kDay, 'all', ...(kNet ? [kNet] : [])]);
    const nIp = got.get(kIp) ?? 0, nDay = got.get(kDay) ?? 0, nNet = kNet ? (got.get(kNet) ?? 0) : 0;
    if (got.get('all') == null && seed == null) return 'unavailable'; // not yet seeded and the count before this object could not be read: wait, do not start from zero
    const nAll = got.get('all') ?? seed ?? 0;
    if (nIp >= perAddress) return 'address';
    if (kNet && nNet >= perAddress * NET_FACTOR) return 'address';
    if (nAll >= max) return 'total';
    if (nDay >= perDay) return 'day';
    await this.ctx.storage.put({ [kIp]: nIp + 1, all: nAll, ...(kNet ? { [kNet]: nNet + 1 } : {}) });
    await this.wake(now);
    return 'ok';
  }
  /**
   * Take `n` bytes against a total, if they fit under `limit`. A vault's object keeps one total (`v`), put right by an
   * R2 listing each day: past the day it was put right, or never set, the answer is `recount` until the caller passes
   * the listing's figure as `base` (and, from round sixty, the generation it read before listing: a listing that a
   * landing or a removal crossed is refused, and the caller lists again). A vault's take holds a lease (`p:<id>`), which
   * the caller gives back with `release`. An address's object keeps one total per UTC day (`d:<day>`) and sweeps the
   * others at midnight, as the creation counts are swept.
   */
  async take(kind: 'vault' | 'address', n: number, limit: number, day: string, base: number | null = null, now = Date.now(), gen: number | null = null): Promise<{ ok: boolean; before: number; lease?: string } | { recount: true }> {
    if (kind === 'vault') {
      // The leases first: one that lapsed marks the row stale, and the row is read after (round sixty-one; B14).
      const leases = await this.leases(now);
      const got = await this.ctx.storage.get<unknown>(['v', 'gen']);
      const row = got.get('v') as Row | undefined;
      // Today's row stands over a caller's listing: the day's first uploads each listed R2 and passed what they found,
      // and each such base wrote over the takes before it, so ten at once were counted as two (round fifty-nine; two
      // reviews). A listing is the starting figure only for a day with no row yet, and then with what is still in flight.
      const today = row && row.day === day;
      if (!today && base != null && gen != null && gen !== ((got.get('gen') as number | undefined) ?? 0)) return { recount: true };
      // A listing made while an upload was between its R2 put and its release, or a removal between its R2 delete and its
      // give-back, may or may not have seen it, so it is not believed while either is live: the caller lists again (round
      // sixty-two; A24: an upload's bytes were counted twice, and a removal's taken off twice).
      if (!today && base != null && gen != null && leases.live.size) return { recount: true };
      const before = today ? row.bytes : base == null ? null : base + leases.total;
      if (before == null) return { recount: true };
      const rc = today ? row.rc : now;
      if (before + n > limit) { if (!today) await this.ctx.storage.put({ v: { bytes: before, day, rc } satisfies Row }); return { ok: false, before }; }
      // The reservation is counted in the total at once and held as a lease of its own until the upload lands or fails,
      // or ten minutes pass: a listing made meanwhile cannot see it, and a recount adds the live leases to what it lists.
      const lease = `${now.toString(36)}-${crypto.randomUUID()}`;
      await this.ctx.storage.put({ v: { bytes: before + n, day, rc } satisfies Row, [`p:${lease}`]: { n, at: now } satisfies Lease });
      await this.wake(now);
      return { ok: true, before, lease };
    }
    const k = `d:${day}`;
    const before = (await this.ctx.storage.get<number>([k])).get(k) ?? 0;
    if (before + n > limit) return { ok: false, before };
    await this.ctx.storage.put({ [k]: before + n });
    await this.wake(now);
    return { ok: true, before };
  }
  /**
   * The live leases, and their bytes. A lease older than `LEASE_MS` is dropped here, whatever became of its upload: if it
   * landed, the next listing counts it; if not, the total over-counts it only until that listing (round sixty; the
   * self-review, P2; two reviews: a release that threw, or a Worker killed between take and release, counted for good).
   * Since round sixty-one a lapsed lease also marks the vault's total stale, so the next request lists rather than keep
   * the lapsed bytes counted for up to an hour (the second outside review, B14).
   */
  private async leases(now: number): Promise<{ total: number; live: Map<string, Lease> }> {
    const all = await this.ctx.storage.list<Lease>({ prefix: 'p:' });
    const live = new Map<string, Lease>();
    const stale: string[] = [];
    let total = 0;
    for (const [k, l] of all) {
      if (!l || typeof l !== 'object' || !(now - l.at < LEASE_MS)) stale.push(k);
      else { live.set(k, l); total += l.n; }
    }
    // The lapsed leases go and the total is marked stale in one step: a failure between the two dropped the leases and
    // kept the total believed, lapsed bytes and all (round sixty-two; B10).
    if (stale.length) await this.atomic(async (s) => {
      for (let i = 0; i < stale.length; i += BATCH) await s.delete(stale.slice(i, i + BATCH));
      await markStale(s);
    });
    return { total, live };
  }
  /**
   * Run `fn` as one storage transaction: every write in it lands, or none does (round sixty-two; B10). A storage without
   * transactions (a test's stand-in) runs it as it is.
   */
  private atomic<T>(fn: (s: Store) => Promise<T>): Promise<T> {
    const st = this.ctx.storage as unknown as Store & { transaction?: (f: (txn: Store) => Promise<T>) => Promise<T> };
    return typeof st.transaction === 'function' ? st.transaction(fn) : fn(st);
  }
  /**
   * How many uploads of this vault are in flight (live leases): a first upload that failed keeps the vault's place while
   * another is still landing (round sixty-one; the server review, 5).
   */
  async inFlight(now = Date.now()): Promise<number> {
    return (await this.leases(now)).live.size;
  }
  /**
   * Give `n` bytes back, never below zero; an address's on its day only. For a vault, `token` names a removed object (its
   * key and R2's version of it): a second give under the same token is nothing, so ten removals of one photograph at once give its
   * bytes back once, not ten times (round fifty-nine; the server reviews). Tokens are swept after two days. A vault's
   * removal bumps the generation, and its token is kept even when the vault has no row yet, so a removal that recounts
   * and one that gives back cannot both take the same object off (round sixty; the server review, 10).
   */
  async give(kind: 'vault' | 'address', n: number, day: string, token: string | null = null): Promise<number> {
    const k = kind === 'vault' ? 'v' : `d:${day}`;
    const gk = token ? `g:${token}` : null;
    const got = await this.ctx.storage.get<unknown>([k, 'gen', ...(gk ? [gk] : [])]);
    const had = got.get(k) as number | Row | undefined;
    if (kind === 'address') {
      if (typeof had !== 'number') return 0;
      const v = Math.max(0, had - n);
      await this.ctx.storage.put({ [k]: v });
      return v;
    }
    // The removal's lease (`removing`) goes with its give-back, in one step (round sixty-two; A24).
    const kr = token ? `p:rm:${token}` : null;
    if (gk && got.get(gk) != null) { if (kr) await this.ctx.storage.delete([kr]); return typeof had === 'object' && had ? had.bytes : 0; }
    const gen = ((got.get('gen') as number | undefined) ?? 0) + 1;
    const out: Record<string, unknown> = { gen, ...(gk ? { [gk]: day } : {}) };
    let v = 0;
    if (had && typeof had === 'object') { v = Math.max(0, had.bytes - n); out.v = { ...had, bytes: v } satisfies Row; }
    await this.atomic(async (s) => { await s.put(out); if (kr) await s.delete([kr]); });
    if (gk) await this.wake(Date.now());
    return v;
  }
  /**
   * An upload taken with `take` has finished: its lease goes. `landed` false gives its bytes back too (the write failed or
   * the name was taken); true bumps the generation, since a listing made before it cannot have seen it. A lease already
   * gone that did not land is nothing, so a failed upload's bytes cannot be given back twice. One that landed after its
   * lease lapsed still bumps the generation and marks the total stale: a listing committed meanwhile could not see it, and
   * its bytes went uncounted until the next day's listing (round sixty-two; the server review, 4).
   */
  async release(lease: string, landed: boolean): Promise<void> {
    const k = `p:${lease}`;
    await this.atomic(async (s) => {
      const got = await s.get<unknown>(['v', 'gen', k]);
      const l = got.get(k) as Lease | undefined;
      const row = got.get('v') as Row | undefined;
      const out: Record<string, unknown> = {};
      if (landed) out.gen = ((got.get('gen') as number | undefined) ?? 0) + 1;
      if (!l) {
        if (!landed) return;
        if (row && row.day !== STALE_DAY) out.v = { ...row, day: STALE_DAY } satisfies Row;
        await s.put(out);
        return;
      }
      if (!landed && row) out.v = { ...row, bytes: Math.max(0, row.bytes - l.n) } satisfies Row;
      await s.delete([k]);
      if (Object.keys(out).length) await s.put(out);
    });
  }
  /**
   * A removal is about to delete an object from R2 (round sixty-two; A24): held as a lease of no bytes until its give-back
   * (`give` with its token) or ten minutes, so a listing made meanwhile is not believed. A listing between the delete and
   * the give-back left the object out, and the give-back then took its bytes off again, so a holder of the token could
   * store past the allowance by removing and listing. A removal whose Worker stopped before its give-back marks the total
   * stale when its lease lapses, as an upload's does.
   */
  async removing(token: string, now = Date.now()): Promise<void> {
    await this.ctx.storage.put({ [`p:rm:${token}`]: { n: 0, at: now } satisfies Lease });
    await this.wake(now);
  }
  /**
   * A vault's total from an R2 listing, with the live leases added (the listing cannot see them), kept for the day. With
   * `gen`, the generation the caller read before it listed: when a landing or a removal came since, the listing may not
   * have seen it, and nothing is written (null; the caller lists again). Otherwise the total written.
   */
  async setBytes(bytes: number, day: string, gen: number | null = null, now = Date.now()): Promise<number | null> {
    if (gen != null && gen !== ((await this.ctx.storage.get<number>(['gen'])).get('gen') ?? 0)) return null;
    const { total, live } = await this.leases(now);
    // Not while an upload or a removal is live: the listing may or may not have seen it (round sixty-two; A24).
    if (gen != null && live.size) return null;
    await this.ctx.storage.put({ v: { bytes: bytes + total, day, rc: now } satisfies Row });
    return bytes + total;
  }
  /** A vault's total if it was put right today, else null. */
  async bytesToday(day: string): Promise<number | null> {
    const row = (await this.ctx.storage.get<Row>(['v'])).get('v');
    return row && row.day === day ? row.bytes : null;
  }
  /** The generation (read before a listing, passed back with its figure), when the vault was last put right from a listing (ms, or null), and whether a listing could be kept now. */
  async generation(now = Date.now()): Promise<{ gen: number; at: number | null; busy: boolean }> {
    const got = await this.ctx.storage.get<unknown>(['gen', 'v']);
    const row = got.get('v') as Row | undefined;
    // `busy`: an upload or a removal is live, so a listing made now would be refused (`setBytes`, `take` with a base): the
    // caller makes none. A refused request listed the whole vault twice and threw both listings away (round sixty-two; the
    // server review, 5). Read only: a lapsed lease is dropped by the next `take` or `setBytes`, as before.
    let busy = false;
    for (const l of (await this.ctx.storage.list<Lease>({ prefix: 'p:' })).values()) if (l && typeof l === 'object' && now - l.at < LEASE_MS) { busy = true; break; }
    return { gen: (got.get('gen') as number | undefined) ?? 0, at: typeof row?.rc === 'number' ? row.rc : null, busy };
  }
  /**
   * Hold a name (a photograph's key) for a short while, or say how long until it is free: a removal and an upload of one
   * photograph are serialised through here, so a removal that looked at one upload cannot delete the next (round sixty;
   * the self-review, P3; two reviews). A hold lasts at most `HOLD_MS`, so one whose holder died frees itself. The answer
   * carries when an upload last claimed the name (stored it, or found it already there), so a removal asked for before
   * that claim can leave the newer generation alone.
   */
  async hold(name: string, now = Date.now()): Promise<{ ok: true; token: string; claimed: number | null } | { ok: false; retryAfter: number }> {
    const k = `h:${name}`, kc = `c:${name}`;
    const got = await this.ctx.storage.get<unknown>([k, kc]);
    const had = got.get(k) as Hold | undefined;
    if (had && now - had.at < HOLD_MS) return { ok: false, retryAfter: Math.max(1, Math.ceil((had.at + HOLD_MS - now) / 1000)) };
    const token = crypto.randomUUID();
    await this.ctx.storage.put({ [k]: { token, at: now } satisfies Hold });
    await this.wake(now);
    const c = got.get(kc) as Claim | undefined;
    return { ok: true, token, claimed: c && typeof c.at === 'number' ? c.at : null };
  }
  /**
   * Renew a hold just before the step it guards (a removal's R2 delete): true, and held for another `HOLD_MS`, only while
   * the name is still held under this token. A hold that lapsed and was taken by another request, or freed by it, is not
   * renewed, and the removal skips (round sixty-one; the second outside review, B10). It narrows the window to the R2 call
   * itself; generation-addressed photo objects close it, in the round after this one.
   */
  async renew(name: string, token: string, now = Date.now()): Promise<boolean> {
    const k = `h:${name}`;
    const had = (await this.ctx.storage.get<Hold>([k])).get(k);
    if (had?.token !== token) return false;
    await this.ctx.storage.put({ [k]: { token, at: now } satisfies Hold });
    return true;
  }
  /**
   * Free a name held with `hold`; only its own holder's token frees it. `claimed` (an upload that stored the name or found
   * it there) records when, kept for two days with the day keys, for a removal that comes after (`hold`'s `claimed`).
   */
  async unhold(name: string, token: string, claimed = false, now = Date.now()): Promise<void> {
    const k = `h:${name}`;
    const had = (await this.ctx.storage.get<Hold>([k])).get(k);
    if (had?.token !== token) return;
    await this.ctx.storage.delete([k]);
    if (claimed) await this.ctx.storage.put({ [`c:${name}`]: { at: now, day: new Date(now).toISOString().slice(0, 10) } satisfies Claim });
  }

  /** A creation that was counted and then not made: the address's counts go back by one, never below zero (the day's is counted at a vault's first object now). */
  async refund(address: string, day: string, net: string | null = null): Promise<void> {
    const kIp = `ip:${address}:${day}`, kNet = net ? `net:${net}:${day}` : null;
    const got = await this.ctx.storage.get<number>([kIp, ...(kNet ? [kNet] : [])]);
    const dec = (k: string) => Math.max(0, (got.get(k) ?? 0) - 1);
    await this.ctx.storage.put({ [kIp]: dec(kIp), ...(kNet ? { [kNet]: dec(kNet) } : {}) });
  }
  /**
   * A vault's first stored object: it takes a place under the ceiling in all, once, and under the day's ceiling of new
   * vaults (round sixty: counted here, not at creation). The object keeps which vaults it has counted (`f:<vault>` → the
   * day it was counted on, never swept), so a vault is counted exactly once however many first uploads race and whatever meta a request read, and a count that failed is tried again by the next upload (round
   * fifty-nine; two reviews: twenty concurrent first uploads counted one vault twenty times, which could close sync to
   * everyone). Past `max` the vault is refused, as a creation is; past `perDay`, until midnight. `seed` as for `create`.
   */
  async fill(vault: string, max: number, seed: number | null = 0, day: string | null = null, perDay = Infinity, now = Date.now()): Promise<'counted' | 'already' | 'total' | 'day' | 'unavailable'> {
    const k = `f:${vault}`, kDay = day ? `day:${day}` : null;
    const got = await this.ctx.storage.get<unknown>([k, 'all', ...(kDay ? [kDay] : [])]);
    if (got.get(k) != null) return 'already';
    if (got.get('all') == null && seed == null) return 'unavailable';
    const n = (got.get('all') as number | undefined) ?? seed ?? 0;
    if (n >= max) return 'total';
    const nDay = kDay ? ((got.get(kDay) as number | undefined) ?? 0) : 0;
    if (kDay && nDay >= perDay) return 'day';
    // `w`: the day of the vault's last upload, for the 90-day reclaim (round sixty-one).
    await this.ctx.storage.put({ all: n + 1, [k]: { d: day, w: day ?? dayOf(now) } satisfies Place, ...(kDay ? { [kDay]: nDay + 1 } : {}) });
    await this.wake(now);
    return 'counted';
  }
  /**
   * A vault that already took a place uploads again (asked once a day per isolate): its last upload's day is kept, and a
   * vault whose place was reclaimed after 90 days without an upload takes one again, under the ceiling in all (not the
   * day's ceiling of new vaults: it is not new).
   *
   * Reclaimed only on evidence (round sixty-two; the triage, 6; A24): the sweep's own note (`r:<vault>`, written in the
   * step that gave the place back) or the vault's meta (`reclaimed`, its `reclaimedAt`). A vault with no place entry and
   * neither is adopted: recorded, not counted again. That is a vault counted at its creation before round fifty-eight (in
   * the seeded total already) or first filled under round fifty-eight (whose count kept no entry). Before, a missing
   * entry was read as a reclaim, so the second were counted twice (5 → 6), and the first, adopted again after every real
   * reclaim, were never counted again (5 → 4 → 3). Every write here wakes the object, so a place's 90 days start even on
   * an object that had no alarm (round sixty-two; the server review, 11).
   */
  async touch(vault: string, day: string, max: number, seed: number | null = 0, reclaimed = false, now = Date.now()): Promise<'already' | 'adopted' | 'counted' | 'total' | 'unavailable'> {
    const k = `f:${vault}`, kr = `r:${vault}`;
    const got = await this.ctx.storage.get<unknown>([k, 'all', kr]);
    const had = got.get(k);
    if (had != null) {
      const p = place(had);
      if (p.w !== day) {
        await this.ctx.storage.put({ [k]: { ...p, w: day } satisfies Place });
        await this.wake(now);
      }
      return 'already';
    }
    if (got.get('all') == null && seed == null) return 'unavailable';
    const n = (got.get('all') as number | undefined) ?? seed ?? 0;
    if (!reclaimed && got.get(kr) == null) {
      await this.ctx.storage.put({ all: n, [k]: { d: null, w: day } satisfies Place });
      await this.wake(now);
      return 'adopted';
    }
    if (n >= max) return 'total';
    await this.atomic(async (s) => {
      await s.put({ all: n + 1, [k]: { d: null, w: day } satisfies Place });
      await s.delete([kr]);
    });
    await this.wake(now);
    return 'counted';
  }
  /**
   * A vault counted by `fill` whose first object then did not land, and which holds nothing else: its place goes back,
   * under the ceiling in all and under the day it was counted on (round sixty; the second outside review, B8: an admitted
   * vault whose first write failed held its place for good). False when the vault was not counted here.
   */
  async unfill(vault: string): Promise<boolean> {
    const k = `f:${vault}`;
    const got = await this.ctx.storage.get<unknown>([k, 'all']);
    const was = got.get(k);
    if (was == null) return false;
    const counted = place(was).d;
    const kDay = counted ? `day:${counted}` : null;
    const nDay = kDay ? ((await this.ctx.storage.get<number>([kDay])).get(kDay) ?? 0) : 0;
    await this.ctx.storage.delete([k]);
    await this.ctx.storage.put({ all: Math.max(0, ((got.get('all') as number | undefined) ?? 0) - 1), ...(kDay && nDay > 0 ? { [kDay]: nDay - 1 } : {}) });
    return true;
  }
  /** The running totals, for a look from the outside. */
  async totals(day: string): Promise<{ day: number; all: number; addresses: number }> {
    const got = await this.ctx.storage.get<number>([`day:${day}`, 'all']);
    const ips = await this.ctx.storage.list<number>({ prefix: 'ip:' });
    let addresses = 0;
    for (const n of ips.values()) if (n > 0) addresses++; // a refunded address at zero is not an address that made a vault (round twenty-four, 6)
    return { day: got.get(`day:${day}`) ?? 0, all: got.get('all') ?? 0, addresses };
  }
  /** The midnight alarm, set when something sweepable was written and none is set. */
  private async wake(now: number): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(nextMidnight(now));
  }
  /**
   * At every UTC midnight: every per-address and per-day key not dated today or yesterday goes. A key dated the 25th is
   * written between 00:00 and 23:59 on the 25th and deleted at the midnight that starts the 27th, so no address key is
   * kept longer than 48 hours, which is what /about/how says (round twenty-three, 8).
   */
  async alarm(): Promise<void> {
    await this.tick(Date.now());
  }
  async tick(now: number): Promise<void> {
    // A sweep that read its page budget and stopped short runs again in a second, from where it stopped (round sixty-one;
    // the server review, 8: an object grown past what one listing can hold failed its alarm and was never swept).
    if ((await this.sweepRun(now)).more) { await this.ctx.storage.setAlarm(now + SWEEP_AGAIN_MS); return; }
    // Then the photographs marked as possibly holding unnamed bytes, a page at a time (round sixty-three; S1).
    if ((await this.photoSweep(now)).more) { await this.ctx.storage.setAlarm(now + SWEEP_AGAIN_MS); return; }
    // Woken again only while something sweepable remains: a vault's object always keeps its total and its generation, and
    // the vaults object its `all`, so "anything stored" woke every one of them at every midnight for good (round sixty;
    // the first outside review, A22). The next write of a sweepable key sets the alarm again. A vault's place (`f:`) is
    // sweepable since round sixty-one: it is reclaimed after 90 days without an upload.
    for (const prefix of SWEPT) if ((await this.ctx.storage.list({ prefix, limit: 1 })).size) { await this.ctx.storage.setAlarm(nextMidnight(now)); return; }
  }
  /** One run of the sweep: the keys it deleted. */
  async sweep(now = Date.now()): Promise<string[]> {
    return (await this.sweepRun(now)).stale;
  }
  /**
   * The sweep, a page of a thousand keys at a time and at most `SWEEP_PAGES` pages a run; where a run stopped is kept
   * (`s:<prefix>`, the last key read) and the next run starts there (round sixty-one; the server review, 8). A place
   * (`f:<vault>`) whose vault had no upload for `RECLAIM_DAYS` is given back under the ceiling in all; a place recorded
   * before its last upload's day was kept starts its count at this sweep.
   *
   * Round sixty-two (B10; the triage, 6): each page is one storage transaction, with its deletions, the places it gives
   * back off `all`, a note of each (`r:<vault>`), the stale mark for lapsed leases and the cursor; a run that failed
   * between them deleted places and never lowered `all`, and nothing could find them again. A place is given back only
   * once its vault's meta says so (`reclaimedAt`, written first, in R2): the evidence a later write to the vault is
   * judged on. One whose meta could not be written keeps its place until the next sweep.
   */
  private async sweepRun(now: number): Promise<{ stale: string[]; more: boolean }> {
    const today = dayOf(now);
    const keep = new Set([today, dayOf(now - DAY_MS)]);
    const reclaimBefore = dayOf(now - RECLAIM_DAYS * DAY_MS); // last upload strictly before this day: 90 whole days without one
    const judge: Record<string, (k: string, v: unknown) => boolean> = {
      'ip:': (k) => !keep.has(k.slice(k.lastIndexOf(':') + 1)),
      'net:': (k) => !keep.has(k.slice(k.lastIndexOf(':') + 1)),
      'day:': (k) => !keep.has(k.slice(4)),
      'd:': (k) => !keep.has(k.slice(2)),
      'g:': (_, d) => !keep.has(d as string),
      'c:': (_, c) => !c || !keep.has((c as Claim).day),
      // Leases and holds past their time (round sixty): what a dead Worker left behind.
      'p:': (_, l) => !(l && now - (l as Lease).at < LEASE_MS),
      'h:': (_, h) => !(h && now - (h as Hold).at < HOLD_MS),
      'f:': (_, f) => { const w = place(f).w; return w != null && w < reclaimBefore; }
    };
    const stale: string[] = [];
    let pages = 0;
    for (const prefix of Object.keys(judge)) {
      const kc = `s:${prefix}`;
      let after = (await this.ctx.storage.get<string>([kc])).get(kc);
      for (;;) {
        if (pages >= SWEEP_PAGES) return { stale, more: true }; // the cursor was kept with the last page
        pages++;
        const page = await this.ctx.storage.list<unknown>({ prefix, limit: SWEEP_PAGE, ...(after ? { startAfter: after } : {}) });
        let gone: string[] = [];
        const started: Record<string, Place> = {};
        let last: string | undefined;
        for (const [k, v] of page) {
          last = k;
          if (judge[prefix](k, v)) gone.push(k);
          else if (prefix === 'f:' && place(v).w == null) started[k] = { ...place(v), w: today };
        }
        if (prefix === 'f:' && gone.length) gone = await this.marked(gone, now);
        // A short page is the prefix's end; a stand-in that ignores `startAfter` hands back the same page, which ends it too.
        const end = page.size < SWEEP_PAGE || !last || last === after;
        await this.atomic(async (s) => {
          // Judged again inside the transaction (round sixty-two; the server review, 3): `marked()` awaits R2, and the object
          // delivers other requests meanwhile, so an upload's `touch` can have kept today as a judged vault's last upload.
          // Its place is kept (and a started place is not written over); its meta's `reclaimedAt` is cleared by its next write.
          if (prefix === 'f:' && (gone.length || Object.keys(started).length)) {
            const keys = [...gone, ...Object.keys(started)];
            const now2 = new Map<string, unknown>();
            for (let i = 0; i < keys.length; i += BATCH) for (const [k, v] of await s.get<unknown>(keys.slice(i, i + BATCH))) now2.set(k, v);
            gone = gone.filter((k) => now2.has(k) && judge[prefix](k, now2.get(k)));
            for (const k of Object.keys(started)) if (!now2.has(k) || place(now2.get(k)).w != null) delete started[k];
          }
          for (let i = 0; i < gone.length; i += BATCH) await s.delete(gone.slice(i, i + BATCH));
          const out: Record<string, unknown> = { ...started };
          if (prefix === 'f:' && gone.length) {
            out.all = Math.max(0, ((await s.get<number>(['all'])).get('all') ?? 0) - gone.length);
            for (const k of gone) out[`r:${k.slice(2)}`] = today;
          }
          if (!end && last) out[kc] = last;
          const entries = Object.entries(out);
          for (let i = 0; i < entries.length; i += BATCH) await s.put(Object.fromEntries(entries.slice(i, i + BATCH)));
          if (end) await s.delete([kc]);
          if (prefix === 'p:' && gone.length) await markStale(s);
        });
        stale.push(...gone);
        if (end) break;
        after = last;
      }
    }
    return { stale, more: false };
  }
  /**
   * The places of `keys` (`f:<vault>`) whose vault's meta now says it was reclaimed (round sixty-two; the triage, 6),
   * written in R2 before the place is given back, under R2's condition that the meta is still the one read, so a request
   * writing it at the same moment is not overwritten. A vault with no meta (none to mark) is given back too. Without
   * the bucket bound (a test's object) the sweep's own note decides alone.
   */
  private async marked(keys: string[], now: number): Promise<string[]> {
    const r2 = (this.env as { STORE?: R2Bucket } | undefined)?.STORE;
    if (!r2) return keys;
    const out: string[] = [];
    for (const k of keys) {
      const key = `vault/${k.slice(2)}/meta.json`;
      try {
        for (let tries = 0; tries < 2; tries++) {
          const o = await r2.get(key);
          if (!o) { out.push(k); break; }
          const meta = (await o.json()) as Record<string, unknown>;
          if (typeof meta.reclaimedAt === 'number') { out.push(k); break; }
          meta.reclaimedAt = now;
          if ((await r2.put(key, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' }, onlyIf: { etagMatches: o.etag } })) !== null) { out.push(k); break; }
        }
      } catch (e) {
        console.error("counters: a vault's meta could not be marked reclaimed; its place is kept until the next sweep", e);
      }
    }
    return out;
  }

  /**
   * A photograph is about to be given a step that can leave bytes nothing names (round sixty-three; S1): a removal about
   * to move its pointer to a receipt (its bytes are deleted after), or an upload about to store a new generation of a
   * removed photograph (its pointer is moved after). Either can be cut off between its two writes. The mark is written
   * first, while the caller holds the name, so a step cut off anywhere after it is known to this object, whose alarm then
   * removes what is unnamed (`photoSweep`). Before, such bytes went only at the photograph's next touch, and a photograph
   * never touched again kept them, counted against the vault's 2 GB, for good.
   */
  async markUnnamed(name: string, now = Date.now()): Promise<void> {
    await this.ctx.storage.put({ [`u:${name}`]: { at: now } satisfies Mark });
    await this.wake(now);
  }
  /**
   * The sweep of unnamed photograph bytes (round sixty-three; S1), run by this vault's own alarm after the key sweep. It
   * reads only the photographs marked (`u:<name>`), so a vault with no removal and no re-store costs nothing, and at most
   * `PHOTO_SWEEP_PAGE` of them a run, from a cursor (`s:u:`), the rest a second later. A mark is looked at once it is
   * `STRAY_MS` old: the photograph's pointer is read and its generations listed (one read and one listing), and each
   * generation the pointer does not name and that is at least `STRAY_MS` old is removed as a removal removes (`strayOff`).
   * A photograph whose name is held (an upload or a removal of it is under way) is left, and so is one with an unnamed
   * generation younger than that (an upload may be between writing its bytes and naming them); the mark stays for the
   * next run. A mark goes only when its photograph has nothing unnamed left. Without the bucket bound (a test's object)
   * nothing is read.
   *
   * A photograph that could not be read (its pointer could not be read, or the bucket failed) keeps its mark and loses
   * nothing; a mark kept that way on `MARK_FAULT_NIGHTS` nights, with no new mark between, is dropped at the next, its
   * photograph's name logged once, so one photograph the bucket cannot read does not wake the vault's object every
   * midnight for good (round sixty-three; R3 8). Its bytes, if any are unnamed, then go at the photograph's next touch, as
   * before this round. A night the name was held or a generation was too young to judge is not counted: the sweep did
   * not fail to read then. Each hold is dated by the time it is taken, not the run's start, so a slow page does not write
   * holds that have already lapsed (R3 6); the age of a generation is still judged from the run's start, which only
   * leaves more.
   */
  private async photoSweep(now: number): Promise<{ more: boolean }> {
    const r2 = (this.env as { STORE?: R2Bucket } | undefined)?.STORE;
    if (!r2) return { more: false };
    const started = Date.now();
    const clock = () => now + Math.max(0, Date.now() - started);
    const kc = 's:u:';
    const after = (await this.ctx.storage.get<string>([kc])).get(kc);
    const page = await this.ctx.storage.list<Mark>({ prefix: 'u:', limit: PHOTO_SWEEP_PAGE, ...(after ? { startAfter: after } : {}) });
    let last: string | undefined;
    for (const [k, m] of page) {
      last = k;
      const at = m && typeof m === 'object' && typeof m.at === 'number' ? m.at : 0;
      if (now - at < STRAY_MS) continue;
      const r = await this.sweepPhoto(r2, k.slice(2), now, clock);
      if (r === 'keep') continue;
      // Changed only if no newer mark came while the bucket was read (a mark is written by a holder of the name, which
      // the sweep was, so none should; the check costs nothing).
      const still = (await this.ctx.storage.get<Mark>([k])).get(k);
      if (!still || still.at !== at) continue;
      if (r === 'done') { await this.ctx.storage.delete([k]); continue; }
      const day = dayOf(now), nights = typeof still.n === 'number' ? still.n : 0;
      if (still.d === day) continue; // this night is counted already (a run again a second later)
      if (nights >= MARK_FAULT_NIGHTS) {
        console.error(`counters: the photograph ${k.slice(2)} could not be read by the sweep on ${nights} nights; its mark is dropped, and anything unnamed goes at its next touch`);
        await this.ctx.storage.delete([k]);
      } else await this.ctx.storage.put({ [k]: { at, n: nights + 1, d: day } satisfies Mark });
    }
    // A short page is the end; a stand-in that ignores `startAfter` hands back the same page, which ends it too.
    const end = page.size < PHOTO_SWEEP_PAGE || !last || last === after;
    if (end) await this.ctx.storage.delete([kc]);
    else await this.ctx.storage.put({ [kc]: last! });
    return { more: !end };
  }
  /**
   * One marked photograph: 'done' when nothing unnamed is left, 'keep' when the mark must stay for a later run, 'fault'
   * when it must stay because the photograph could not be read (counted towards `MARK_FAULT_NIGHTS`). `clock` dates the
   * holds; `now`, the run's start, judges the generations' age.
   */
  private async sweepPhoto(r2: R2Bucket, name: string, now: number, clock: () => number = () => now): Promise<'done' | 'keep' | 'fault'> {
    // Held as an upload or a removal holds it, so neither runs while the sweep reads and deletes (they are asked to wait
    // ten seconds, as for any busy photograph).
    const h = await this.hold(name, clock());
    if (!h.ok) return 'keep';
    try {
      // A pointer that cannot be read throws (round sixty-three; R3 2): it is not known what it names, so nothing goes.
      const found = await unnamedGenerations(r2, name, now);
      if (!found) return 'done'; // no pointer: the first generation is the photograph, and nothing else was ever stored
      for (const key of found.old) {
        if (!(await this.renew(name, h.token, clock()))) return 'keep';
        await this.strayOff(r2, key, now);
      }
      return found.young ? 'keep' : 'done';
    } catch (e) {
      if (e instanceof PointerUnreadable) console.error("counters: a photograph's pointer could not be read; nothing of it is removed, and its mark is kept for the next run", e);
      else console.error("counters: a photograph's unnamed generations could not be swept; its mark is kept for the next run", e);
      return 'fault';
    } finally {
      await this.unhold(name, h.token);
    }
  }
  /**
   * Remove one unnamed generation and give its bytes back, crash-consistent as a removal is (round sixty-two; A24): a
   * removal lease of no bytes before the delete, so a listing made meanwhile is not believed; the give-back once, under
   * the object's receipt, with the lease, in one step. A run stopped between the delete and the give-back leaves the
   * lease, which lapses in ten minutes and marks the total stale, so the next upload lists the vault again; and the mark,
   * so the next run finds nothing left and ends it. The meta's snapshot of the bytes is not written here: it lags by
   * design (`flushMeta`) and is put right by the next listing.
   */
  private async strayOff(r2: R2Bucket, key: string, now: number): Promise<void> {
    const o = await r2.head(key);
    if (!o) return;
    const token = receipt(key, o);
    await this.removing(token, now);
    await r2.delete(key);
    await this.give('vault', o.size, dayOf(now), token);
  }

  /**
   * The site's own calls to other services, one share a minute for each (MET Norway, the NWS, GBIF), for every address
   * together, and one address (an IPv4 address or an IPv6 /64) at most `UPSTREAM_ADDRESS_PART` of a share, an IPv6 /48 four
   * times that. All of `services` are taken or none (a US forecast is two calls). Counted in this object's memory, in
   * the one object named "upstream", so it is site-wide, which KV counted per isolate was not (round sixty-one; the
   * server review, 4; B13): a restart of the object (a deploy) forgets at most the current minute.
   *
   * Round sixty-three (S2; deferred in the triage of round sixty-one: ten addresses could spend a share): `net` is the
   * network around the address, an IPv4 /24 as well as an IPv6 /48, and the last `UPSTREAM_RESERVE_PART` of each share is
   * kept for networks new to the minute. Past the rest, a network (or, with none, the address) that has already made
   * `UPSTREAM_RESERVE_EACH` calls to that service in the minute is held back as `reserve`, said as the rest being kept
   * for others (the server review of the round, R3 1: it was said as the site's calls used up, while up to a quarter of
   * them were still open); one that has made fewer may make up to that many. A call with no address counts the share alone.
   */
  async upstream(services: string[], share: number, address: string | null = null, net: string | null = null, now = Date.now()): Promise<{ ok: true } | { ok: false; who: 'site' | 'address' | 'network' | 'reserve'; service: string; retryAfter: number }> {
    const minute = Math.floor(now / 60_000);
    if (minute !== this.minute) { this.minute = minute; this.calls = new Map(); }
    const n = (k: string) => this.calls.get(k) ?? 0;
    const part = Math.max(1, Math.floor(share * UPSTREAM_ADDRESS_PART));
    const retryAfter = Math.max(1, Math.ceil(((minute + 1) * 60_000 - now) / 1000));
    const open = share - Math.floor(share * UPSTREAM_RESERVE_PART);
    const who = net ?? address;
    for (const s of services) {
      if (address && n(`${s} ${address}`) >= part) return { ok: false, who: 'address', service: s, retryAfter };
      if (net && n(`${s} ${net}`) >= part * NET_FACTOR) return { ok: false, who: 'network', service: s, retryAfter };
      if (n(s) >= share) return { ok: false, who: 'site', service: s, retryAfter };
      if (who && n(s) >= open && n(`${s} ${who}`) >= UPSTREAM_RESERVE_EACH) return { ok: false, who: 'reserve', service: s, retryAfter };
    }
    for (const s of services) for (const k of [s, address && `${s} ${address}`, net && `${s} ${net}`]) if (k) this.calls.set(k, n(k) + 1);
    return { ok: true };
  }
  private minute = -1;
  private calls = new Map<string, number>();
}

/** What a storage call and a transaction's both give (round sixty-two). */
type Store = Pick<DurableObjectStorage, 'get' | 'put' | 'delete' | 'list'>;
/** Keys one storage call may take. */
const BATCH = 128;
/** The vault's total is no longer believed: the next take or read lists the bucket again (round sixty-one; B14). */
async function markStale(s: Store): Promise<void> {
  const row = (await s.get<Row>(['v'])).get('v');
  if (row && row.day !== STALE_DAY) await s.put({ v: { ...row, day: STALE_DAY } satisfies Row });
}
/** A vault's running total: its bytes, the UTC day it was last put right from a listing, and when (ms; absent on a row from before round sixty). */
type Row = { bytes: number; day: string; rc?: number };
/** An upload in flight: its bytes and when it was taken. */
type Lease = { n: number; at: number };
/** A name held by a removal or an upload. */
type Hold = { token: string; at: number };
/**
 * A photograph that may hold bytes nothing names, and when it was marked (round sixty-three; S1); `n`, the nights the
 * sweep could not read it since, and `d`, the last such night's UTC day (R3 8).
 */
type Mark = { at: number; n?: number; d?: string };
/** When an upload last claimed a photograph's name, and the UTC day (for the sweep). */
type Claim = { at: number; day: string };
/**
 * A vault's place under the ceiling in all: the day it was counted under the day's ceiling (null when it was not, as a
 * place taken again after a reclaim) and the day of its last upload (round sixty-one). Before, the value was the counted
 * day alone, or 1; `place` reads all three.
 */
type Place = { d: string | null; w: string | null };
const place = (v: unknown): Place => (v && typeof v === 'object' ? { d: (v as Place).d ?? null, w: (v as Place).w ?? null } : { d: typeof v === 'string' ? v : null, w: null });
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** A row's day when it is no longer believed: never today, so the next take lists (round sixty-one). */
const STALE_DAY = 'stale';
/** A vault's place is given back after this many whole days without an upload (round sixty-one; the triage, 3). */
export const RECLAIM_DAYS = 90;
/** The sweep reads keys a page at a time, and at most this many pages a run (round sixty-one; the server review, 8). */
export const SWEEP_PAGE = 1000;
export const SWEEP_PAGES = 100;
/** Marked photographs one run of the sweep of unnamed bytes looks at (round sixty-three; S1). */
export const PHOTO_SWEEP_PAGE = 100;
/** Nights a mark is kept while its photograph cannot be read; at the next, it is dropped (round sixty-three; R3 8). */
export const MARK_FAULT_NIGHTS = 7;
/** How soon a sweep that stopped short runs again. */
const SWEEP_AGAIN_MS = 1000;
/** How long a lease counts: past the longest upload (the device gives up after three minutes) with room to spare. */
export const LEASE_MS = 10 * 60_000;
/** How long a photograph's name may be held: far past a head, a delete and a give. */
export const HOLD_MS = 60_000;
/** The keys the midnight sweep looks at; the alarm is set again only while one of them remains (`u:`, the photographs marked for the sweep of unnamed bytes, since round sixty-three). */
const SWEPT = ['ip:', 'net:', 'day:', 'd:', 'g:', 'p:', 'h:', 'c:', 'f:', 'u:'];
