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
