/**
 * The vault-creation counters as one Durable Object, so a burst of creations is counted exactly: every check is a
 * read, a decision and a write inside one object, and Durable Objects deliver one request at a time, so two creations
 * in the same second cannot both read the same count (round twenty-one, 1). KV cannot do this: it takes one write a
 * second per key and caches reads for a minute per location, so under KV a burst was either refused for a write it
 * could not make or, once that was made non-fatal, not counted at all.
 *
 * One object, named "vaults", holds every counter; creations are rare (thousands in all, by design) so one is enough.
 * Keys: `ip:<address>:<day>` (5 a day), `net:<prefix>:<day>` (an IPv6 /48, 20 a day), `day:<day>` (the shared day ceiling), `all` (the ceiling in all). A daily alarm
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
  /** Decide and count one creation. `address` is already keyed (an IPv4 address or an IPv6 /64); `day` is YYYY-MM-DD; `seed` is the count of vaults made before this object existed. */
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
    // `all` counts vaults that hold something, taken by `fill` at a vault's first stored object, not here: a vault made
    // and never used held a place under the ceiling in all for good, so empty creations could spend it (round
    // fifty-eight; the server review). The day's and the address's ceilings still count every creation.
    await this.ctx.storage.put({ [kIp]: nIp + 1, [kDay]: nDay + 1, all: nAll, ...(kNet ? { [kNet]: nNet + 1 } : {}) });
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(nextMidnight(now));
    return 'ok';
  }
  /**
   * Take `n` bytes against a total, if they fit under `limit`. A vault's object keeps one total (`v`), put right by an
   * R2 listing each day: past the day it was put right, or never set, the answer is `recount` until the caller passes
   * the listing's figure as `base`. An address's object keeps one total per UTC day (`d:<day>`) and sweeps the others
   * at midnight, as the creation counts are swept.
   */
  async take(kind: 'vault' | 'address', n: number, limit: number, day: string, base: number | null = null, now = Date.now()): Promise<{ ok: boolean; before: number } | { recount: true }> {
    if (kind === 'vault') {
      const row = (await this.ctx.storage.get<{ bytes: number; day: string }>(['v'])).get('v');
      const before = base ?? (row && row.day === day ? row.bytes : null);
      if (before == null) return { recount: true };
      if (before + n > limit) { if (base != null) await this.ctx.storage.put({ v: { bytes: base, day } }); return { ok: false, before }; }
      await this.ctx.storage.put({ v: { bytes: before + n, day } });
      return { ok: true, before };
    }
    const k = `d:${day}`;
    const before = (await this.ctx.storage.get<number>([k])).get(k) ?? 0;
    if (before + n > limit) return { ok: false, before };
    await this.ctx.storage.put({ [k]: before + n });
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(nextMidnight(now));
    return { ok: true, before };
  }
  /** Give `n` bytes back (an upload that did not land, a removal), never below zero; an address's on its day only. */
  async give(kind: 'vault' | 'address', n: number, day: string): Promise<number> {
    const k = kind === 'vault' ? 'v' : `d:${day}`;
    const got = (await this.ctx.storage.get<number | { bytes: number; day: string }>([k])).get(k);
    if (got == null) return 0;
    if (typeof got === 'number') { const v = Math.max(0, got - n); await this.ctx.storage.put({ [k]: v }); return v; }
    const v = Math.max(0, got.bytes - n);
    await this.ctx.storage.put({ [k]: { bytes: v, day: got.day } });
    return v;
  }
  /** A vault's total from an R2 listing: the authoritative figure, kept for the day. */
  async setBytes(bytes: number, day: string): Promise<void> {
    await this.ctx.storage.put({ v: { bytes, day } });
  }
  /** A vault's total if it was put right today, else null. */
  async bytesToday(day: string): Promise<number | null> {
    const row = (await this.ctx.storage.get<{ bytes: number; day: string }>(['v'])).get('v');
    return row && row.day === day ? row.bytes : null;
  }

  /** A creation that was counted and then not made: the counts go back by one, never below zero. */
  async refund(address: string, day: string, net: string | null = null): Promise<void> {
    const kIp = `ip:${address}:${day}`, kDay = `day:${day}`, kNet = net ? `net:${net}:${day}` : null;
    const got = await this.ctx.storage.get<number>([kIp, kDay, 'all', ...(kNet ? [kNet] : [])]);
    const dec = (k: string) => Math.max(0, (got.get(k) ?? 0) - 1);
    await this.ctx.storage.put({ [kIp]: dec(kIp), [kDay]: dec(kDay), ...(kNet ? { [kNet]: dec(kNet) } : {}) });
  }
  /** A vault's first stored object: it now holds a place under the ceiling in all. `seed` as for `create`, for an object not yet seeded. */
  async fill(seed: number | null = 0): Promise<number> {
    const got = (await this.ctx.storage.get<number>(['all'])).get('all');
    if (got == null && seed == null) return -1;
    const n = (got ?? seed ?? 0) + 1;
    await this.ctx.storage.put({ all: n });
    return n;
  }
  /** The running totals, for a look from the outside. */
  async totals(day: string): Promise<{ day: number; all: number; addresses: number }> {
    const got = await this.ctx.storage.get<number>([`day:${day}`, 'all']);
    const ips = await this.ctx.storage.list<number>({ prefix: 'ip:' });
    let addresses = 0;
    for (const n of ips.values()) if (n > 0) addresses++; // a refunded address at zero is not an address that made a vault (round twenty-four, 6)
    return { day: got.get(`day:${day}`) ?? 0, all: got.get('all') ?? 0, addresses };
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
    // An address's byte object with nothing left to sweep sleeps for good; the creation object keeps its total, so wakes.
    if ((await this.ctx.storage.list({ limit: 1 })).size) await this.ctx.storage.setAlarm(nextMidnight(now));
  }
  async sweep(now = Date.now()): Promise<string[]> {
    const keep = new Set([new Date(now).toISOString().slice(0, 10), new Date(now - DAY_MS).toISOString().slice(0, 10)]);
    const stale: string[] = [];
    for (const k of (await this.ctx.storage.list({ prefix: 'ip:' })).keys()) if (!keep.has(k.slice(k.lastIndexOf(':') + 1))) stale.push(k);
    for (const k of (await this.ctx.storage.list({ prefix: 'net:' })).keys()) if (!keep.has(k.slice(k.lastIndexOf(':') + 1))) stale.push(k);
    for (const k of (await this.ctx.storage.list({ prefix: 'day:' })).keys()) if (!keep.has(k.slice(4))) stale.push(k);
    for (const k of (await this.ctx.storage.list({ prefix: 'd:' })).keys()) if (!keep.has(k.slice(2))) stale.push(k);
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));
    return stale;
  }
}
