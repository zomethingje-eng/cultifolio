/**
 * The vault-creation counters as one Durable Object, so a burst of creations is counted exactly: every check is a
 * read, a decision and a write inside one object, and Durable Objects deliver one request at a time, so two creations
 * in the same second cannot both read the same count (round twenty-one, 1). KV cannot do this: it takes one write a
 * second per key and caches reads for a minute per location, so under KV a burst was either refused for a write it
 * could not make or, once that was made non-fatal, not counted at all.
 *
 * One object, named "vaults", holds every counter; creations are rare (thousands in all, by design) so one is enough.
 * Keys: `ip:<address>:<day>` (5 a day), `day:<day>` (the shared day ceiling), `all` (the ceiling in all). A daily alarm
 * deletes every `ip:` and `day:` key older than two days, so an address is kept for at most that long (round
 * twenty-two, 6); `all` is seeded once from the KV count that ran before the object existed, so the ceiling in all counts
 * every vault, not only those made since the migration. A creation counted and then not made (the vault write failed) is
 * refunded (round twenty-two, 1).
 *
 * Attached to the Worker by scripts/attach-do.mjs after the SvelteKit build (the adapter's worker exports only the app),
 * and bound as COUNTERS in wrangler.jsonc with a `new_sqlite_classes` migration. Without the binding the KV path in
 * `allowCreation` is used, which is bounding, not accounting.
 */
import { DurableObject } from 'cloudflare:workers';

export type Creation = 'ok' | 'address' | 'day' | 'total';
const DAY_MS = 86_400_000;

export class Counters extends DurableObject {
  /** Decide and count one creation. `address` is already keyed (an IPv4 address or an IPv6 /64); `day` is YYYY-MM-DD; `seed` is the count of vaults made before this object existed. */
  async create(address: string, day: string, perAddress: number, perDay: number, max: number, seed = 0): Promise<Creation> {
    const kIp = `ip:${address}:${day}`, kDay = `day:${day}`;
    const got = await this.ctx.storage.get<number>([kIp, kDay, 'all']);
    const nIp = got.get(kIp) ?? 0, nDay = got.get(kDay) ?? 0;
    const nAll = got.get('all') ?? seed;
    if (nIp >= perAddress) return 'address';
    if (nAll >= max) return 'total';
    if (nDay >= perDay) return 'day';
    await this.ctx.storage.put({ [kIp]: nIp + 1, [kDay]: nDay + 1, all: nAll + 1 });
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
    return 'ok';
  }
  /** A creation that was counted and then not made: the counts go back by one, never below zero. */
  async refund(address: string, day: string): Promise<void> {
    const kIp = `ip:${address}:${day}`, kDay = `day:${day}`;
    const got = await this.ctx.storage.get<number>([kIp, kDay, 'all']);
    const dec = (k: string) => Math.max(0, (got.get(k) ?? 0) - 1);
    await this.ctx.storage.put({ [kIp]: dec(kIp), [kDay]: dec(kDay), all: dec('all') });
  }
  /** The running totals, for a look from the outside. */
  async totals(day: string): Promise<{ day: number; all: number; addresses: number }> {
    const got = await this.ctx.storage.get<number>([`day:${day}`, 'all']);
    const ips = await this.ctx.storage.list({ prefix: 'ip:' });
    return { day: got.get(`day:${day}`) ?? 0, all: got.get('all') ?? 0, addresses: ips.size };
  }
  /** Once a day: every per-address and per-day key older than two days goes, so nothing about an address outlives the site's "within two days". */
  async alarm(): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * DAY_MS).toISOString().slice(0, 10);
    const stale: string[] = [];
    for (const k of (await this.ctx.storage.list({ prefix: 'ip:' })).keys()) if (k.slice(k.lastIndexOf(':') + 1) < cutoff) stale.push(k);
    for (const k of (await this.ctx.storage.list({ prefix: 'day:' })).keys()) if (k.slice(4) < cutoff) stale.push(k);
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128));
    await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }
}
