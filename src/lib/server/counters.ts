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
 * photographs are), so there is no later moment at which it holds nothing. A vault left unused for good keeps its place;
 * the operator raises `SYNC_VAULTS_MAX` when the places run short (docs/DEPLOY.md).
 *
 * Attached to the Worker by scripts/attach-do.mjs after the SvelteKit build (the adapter's worker exports only the app),
 * and bound as COUNTERS in wrangler.jsonc with a `new_sqlite_classes` migration. Without the binding the KV path in
 * `allowCreation` is used, which is bounding, not accounting.
 */
import { DurableObject } from 'cloudflare:workers';

export type Creation = 'ok' | 'address' | 'day' | 'total' | 'unavailable';
const DAY_MS = 86_400_000;
/** The next UTC midnight after `now`: the alarm runs there, so "older than two days" is counted in whole UTC days from a fixed point (round twenty-three, 8). */
/** A /48's allowance of new vaults a day, as a multiple of one address's. */
export const NET_FACTOR = 4;
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
      const got = await this.ctx.storage.get<unknown>(['v', 'gen']);
      const row = got.get('v') as Row | undefined;
      const leases = await this.leases(now);
      // Today's row stands over a caller's listing: the day's first uploads each listed R2 and passed what they found,
      // and each such base wrote over the takes before it, so ten at once were counted as two (round fifty-nine; two
      // reviews). A listing is the starting figure only for a day with no row yet, and then with what is still in flight.
      const today = row && row.day === day;
      if (!today && base != null && gen != null && gen !== ((got.get('gen') as number | undefined) ?? 0)) return { recount: true };
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
    if (stale.length) await this.ctx.storage.delete(stale);
    return { total, live };
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
    if (gk && got.get(gk) != null) return typeof had === 'object' && had ? had.bytes : 0;
    const gen = ((got.get('gen') as number | undefined) ?? 0) + 1;
    const out: Record<string, unknown> = { gen, ...(gk ? { [gk]: day } : {}) };
    let v = 0;
    if (had && typeof had === 'object') { v = Math.max(0, had.bytes - n); out.v = { ...had, bytes: v } satisfies Row; }
    await this.ctx.storage.put(out);
    if (gk) await this.wake(Date.now());
    return v;
  }
  /**
   * An upload taken with `take` has finished: its lease goes. `landed` false gives its bytes back too (the write failed or
   * the name was taken); true bumps the generation, since a listing made before it cannot have seen it. A lease already
   * gone (released, or dropped after ten minutes) is nothing, so a release cannot run twice.
   */
  async release(lease: string, landed: boolean): Promise<void> {
    const k = `p:${lease}`;
    const got = await this.ctx.storage.get<unknown>(['v', 'gen', k]);
    const l = got.get(k) as Lease | undefined;
    if (!l) return;
    const row = got.get('v') as Row | undefined;
    const out: Record<string, unknown> = {};
    if (landed) out.gen = ((got.get('gen') as number | undefined) ?? 0) + 1;
    else if (row) out.v = { ...row, bytes: Math.max(0, row.bytes - l.n) } satisfies Row;
    await this.ctx.storage.delete([k]);
    if (Object.keys(out).length) await this.ctx.storage.put(out);
  }
  /**
   * A vault's total from an R2 listing, with the live leases added (the listing cannot see them), kept for the day. With
   * `gen`, the generation the caller read before it listed: when a landing or a removal came since, the listing may not
   * have seen it, and nothing is written (null; the caller lists again). Otherwise the total written.
   */
  async setBytes(bytes: number, day: string, gen: number | null = null, now = Date.now()): Promise<number | null> {
    if (gen != null && gen !== ((await this.ctx.storage.get<number>(['gen'])).get('gen') ?? 0)) return null;
    const { total } = await this.leases(now);
    await this.ctx.storage.put({ v: { bytes: bytes + total, day, rc: now } satisfies Row });
    return bytes + total;
  }
  /** A vault's total if it was put right today, else null. */
  async bytesToday(day: string): Promise<number | null> {
    const row = (await this.ctx.storage.get<Row>(['v'])).get('v');
    return row && row.day === day ? row.bytes : null;
  }
  /** The generation (read before a listing, passed back with its figure) and when the vault was last put right from a listing (ms, or null). */
  async generation(): Promise<{ gen: number; at: number | null }> {
    const got = await this.ctx.storage.get<unknown>(['gen', 'v']);
    const row = got.get('v') as Row | undefined;
    return { gen: (got.get('gen') as number | undefined) ?? 0, at: typeof row?.rc === 'number' ? row.rc : null };
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
    await this.ctx.storage.put({ all: n + 1, [k]: day ?? 1, ...(kDay ? { [kDay]: nDay + 1 } : {}) });
    if (kDay) await this.wake(now);
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
    const kDay = typeof was === 'string' ? `day:${was}` : null;
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
    await this.sweep(now);
    // Woken again only while something sweepable remains: a vault's object always keeps its total and its generation, and
    // the vaults object its `all`, so "anything stored" woke every one of them at every midnight for good (round sixty;
    // the first outside review, A22). The next write of a sweepable key sets the alarm again.
    for (const prefix of SWEPT) if ((await this.ctx.storage.list({ prefix, limit: 1 })).size) { await this.ctx.storage.setAlarm(nextMidnight(now)); return; }
  }
  async sweep(now = Date.now()): Promise<string[]> {
    const keep = new Set([new Date(now).toISOString().slice(0, 10), new Date(now - DAY_MS).toISOString().slice(0, 10)]);
    const stale: string[] = [];
    for (const k of (await this.ctx.storage.list({ prefix: 'ip:' })).keys()) if (!keep.has(k.slice(k.lastIndexOf(':') + 1))) stale.push(k);
    for (const k of (await this.ctx.storage.list({ prefix: 'net:' })).keys()) if (!keep.has(k.slice(k.lastIndexOf(':') + 1))) stale.push(k);
    for (const k of (await this.ctx.storage.list({ prefix: 'day:' })).keys()) if (!keep.has(k.slice(4))) stale.push(k);
    for (const k of (await this.ctx.storage.list({ prefix: 'd:' })).keys()) if (!keep.has(k.slice(2))) stale.push(k);
    for (const [k, d] of await this.ctx.storage.list<string>({ prefix: 'g:' })) if (!keep.has(d)) stale.push(k);
    for (const [k, c] of await this.ctx.storage.list<Claim>({ prefix: 'c:' })) if (!c || !keep.has(c.day)) stale.push(k);
    // Leases and holds past their time (round sixty): what a dead Worker left behind.
    for (const [k, l] of await this.ctx.storage.list<Lease>({ prefix: 'p:' })) if (!(l && now - l.at < LEASE_MS)) stale.push(k);
    for (const [k, h] of await this.ctx.storage.list<Hold>({ prefix: 'h:' })) if (!(h && now - h.at < HOLD_MS)) stale.push(k);
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));
    return stale;
  }
}

/** A vault's running total: its bytes, the UTC day it was last put right from a listing, and when (ms; absent on a row from before round sixty). */
type Row = { bytes: number; day: string; rc?: number };
/** An upload in flight: its bytes and when it was taken. */
type Lease = { n: number; at: number };
/** A name held by a removal or an upload. */
type Hold = { token: string; at: number };
/** When an upload last claimed a photograph's name, and the UTC day (for the sweep). */
type Claim = { at: number; day: string };
/** How long a lease counts: past the longest upload (the device gives up after three minutes) with room to spare. */
export const LEASE_MS = 10 * 60_000;
/** How long a photograph's name may be held: far past a head, a delete and a give. */
export const HOLD_MS = 60_000;
/** The keys the midnight sweep looks at; the alarm is set again only while one of them remains. */
const SWEPT = ['ip:', 'net:', 'day:', 'd:', 'g:', 'p:', 'h:', 'c:'];
