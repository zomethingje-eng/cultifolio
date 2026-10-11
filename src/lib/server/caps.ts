/**
 * The cap figures the Worker and the counter object both use, in one module (round sixty-two; the triage, 6). Before, each
 * file kept its own copy, since sync.ts cannot import counters.ts (which imports `cloudflare:workers`); a change to one
 * copy left the other counting by the old figure. This module imports nothing, so both can read it.
 */

/** The part of a service's share one address (an IPv4 address or an IPv6 /64) may take in a minute (round sixty-one). */
export const UPSTREAM_ADDRESS_PART = 0.1;

/**
 * An IPv6 /48 counts as this many addresses: in a bucket's requests, in a service's share and in the day's new vaults. A
 * /48 holds 65,536 /64s, so by /64s alone one host could rotate through a fresh allowance on every request (round
 * thirty-eight, R1-8; round fifty-eight).
 */
export const NET_FACTOR = 4;

/**
 * The part of each service's share kept, in every minute, for networks new to it (round sixty-three; S2): once the
 * rest is spent, a network (an IPv4 /24 or an IPv6 /48) that has made `UPSTREAM_RESERVE_EACH` calls to that service in
 * the minute is held back, and one that has made fewer may make up to that many. Ten addresses could spend a whole share
 * before; now it takes at least 77 different networks (two at the network limit for the open part, and 75 more at two
 * calls each for the reserve).
 */
export const UPSTREAM_RESERVE_PART = 0.25;
export const UPSTREAM_RESERVE_EACH = 2;

/**
 * Objects (log batches and photographs) one vault may store in an hour, counted in the vault's own counter object as
 * its bytes are taken (round sixty-nine; triage-68 W5, R46-24). Nothing counted a vault's writes: a batch of 16 KB or less
 * is free of the day's byte totals (round sixty-seven, S9), and a photograph of a few bytes spends almost none of them, so
 * the request windows alone bounded the R2 writes, per address and not per vault. One a second is far past a grower's
 * pushes; a first push of thousands of photographs is spread over a few hours.
 */
export const VAULT_WRITES_PER_HOUR = 3600;

/**
 * R2 list pages (of 1,000 keys) one walk of a vault's log may make (`walk` in sync.ts, where it is explained), and so what
 * a listing's ask reserves against the vault's hour of listings (round sixty-nine; triage-68 W2). Here, so the counter
 * object reserves the same figure the walk is bounded by.
 */
export const MAX_LIST_PAGES = 50;
