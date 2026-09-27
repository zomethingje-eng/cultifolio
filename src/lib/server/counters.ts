/**
 * The vault-creation counters as one Durable Object, so a burst of creations is counted exactly: every check is a
 * read, a decision and a write inside one object, and Durable Objects deliver one request at a time, so two creations
 * in the same second cannot both read the same count (round twenty-one, 1). KV cannot do this: it takes one write a
 * second per key and caches reads for a minute per location, so under KV a burst was either refused for a write it
 * could not make or, once that was made non-fatal, not counted at all.
 *
 * One object, named "vaults", holds every counter; creations are rare (thousands in all, by design) so one is enough.
 * Keys: `ip:<address>:<day>` (5 a day), `day:<day>` (the shared day ceiling), `all` (the ceiling in all). Old day keys
 * are dropped as they are met.
 *
 * Attached to the Worker by scripts/attach-do.mjs after the SvelteKit build (the adapter's worker exports only the app),
 * and bound as COUNTERS in wrangler.jsonc with a `new_sqlite_classes` migration. Without the binding the KV path in
 * `allowCreation` is used, which is bounding, not accounting.
 */
import { DurableObject } from 'cloudflare:workers';

export type Creation = 'ok' | 'address' | 'day' | 'total';

export class Counters extends DurableObject {
  /** Decide and count one creation. `address` is already keyed (an IPv4 address or an IPv6 /64); `day` is YYYY-MM-DD. */
  async create(address: string, day: string, perAddress: number, perDay: number, max: number): Promise<Creation> {
    const kIp = `ip:${address}:${day}`, kDay = `day:${day}`;
    const got = await this.ctx.storage.get<number>([kIp, kDay, 'all']);
    const nIp = got.get(kIp) ?? 0, nDay = got.get(kDay) ?? 0, nAll = got.get('all') ?? 0;
    if (nIp >= perAddress) return 'address';
    if (nAll >= max) return 'total';
    if (nDay >= perDay) return 'day';
    await this.ctx.storage.put({ [kIp]: nIp + 1, [kDay]: nDay + 1, all: nAll + 1 });
    // Yesterday's per-address keys are of no further use; a sweep now and then keeps the object small.
    if (nDay === 0) {
      const old = await this.ctx.storage.list<number>({ prefix: 'ip:' });
      const stale = [...old.keys()].filter((k) => !k.endsWith(':' + day));
      if (stale.length) await this.ctx.storage.delete(stale.slice(0, 128));
    }
    return 'ok';
  }
  /** The running totals, for a look from the outside (`wrangler` or a future admin page). */
  async totals(day: string): Promise<{ day: number; all: number }> {
    const got = await this.ctx.storage.get<number>([`day:${day}`, 'all']);
    return { day: got.get(`day:${day}`) ?? 0, all: got.get('all') ?? 0 };
  }
}
