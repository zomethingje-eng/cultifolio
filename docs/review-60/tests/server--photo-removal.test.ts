/**
 * Review of round sixty, server area: the photograph removal's "newer upload" rule (X-Photo-Removed-At, the claim `c:`).
 *
 * FAILS on 21257b7 (three reproductions, marked REPRO) and PASSES (guards, marked GUARD).
 * Run: npx vitest run tests/unit/server--photo-removal.test.ts   (lives in tests/unit/, uses helpers/fake-sync.ts)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush } from '$lib/server/sync';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64); // the drop proof a key-holder's device makes for this photograph
const STRANGER = 'a'.repeat(64); // any 64 hex digits: what a holder of the bearer token alone can send
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const MIN = 60_000;
const meta0 = () => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, filled: true });
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
/** The fake bucket's own clock (its `uploaded` times): the server's "now" in these tests, so a claim and an upload agree. */
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };

describe('the newer-upload rule (round sixty, A12/B5) judged against real sequences', () => {
  it('REPRO: a photograph whose first upload lands after another device removed its record is never removed (correct clocks)', async () => {
    // Device A added the photograph offline; online, it pushes its batches first and its photographs after (engine `push`),
    // one at a time, which on a phone's first sync of a few hundred photographs takes many minutes. Device B pulls the
    // batch, the grower removes the (still blank) photograph on B at R, and A's upload of it lands at U > R. This upload
    // is the photograph's only generation, not a revival.
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const bytes = new Uint8Array(400).fill(1);
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), bytes, { drop: OWNER }, q(counters, await clockOf(r2)));
    const U = r2.objs.get(photo(1))!.uploaded.getTime();
    const R = U - 20_000; // removed on B twenty seconds before A's upload landed
    // Ten minutes later (DROP_AFTER_MS), B (and later A, once it folds the removal) asks for the bytes to go, with R.
    const first = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(counters, U + 11 * MIN), OWNER, R);
    // Today: 'newer' (409), and the engine takes a 409 as done (`photosDropped`), so no device asks again. Even a device
    // that did ask again, days later, after the claim is swept, is refused for good: R2's own upload time is after R.
    await counters.raw(`bytes:${ID}`).c.sweep(U + 3 * 86_400_000);
    const later = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(counters, U + 3 * 86_400_000), OWNER, R);
    // Expected: removed, at the latest once the two days of a claim are over (with the engine asking again after a 409).
    // The bytes otherwise stay in the vault, counted, for good, against "A photograph you remove is removed from the
    // server too" (/about/how).
    expect({ first, later, held: r2.objs.has(photo(1)) }).toEqual({ first: expect.anything(), later: true, held: false });
  });

  it('REPRO: a holder of the bearer token alone (no key, no drop proof) makes a removed photograph undeletable', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const bytes = new Uint8Array(400).fill(2);
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), bytes, { drop: OWNER }, q(counters, T0));
    const R = T0 + MIN; // the grower removes it
    // The token-holder GETs the ciphertext (the token reads) and PUTs the same bytes back with any proof: "already there",
    // which records a claim on the name at the PUT's time, though the proof does not match the one the object holds.
    expect(await storeOnce(r2 as never, ID, await meta(r2), photo(2), bytes, { drop: STRANGER }, q(counters, T0 + 5 * MIN))).toBe('same');
    // The owner's device asks for the removal past the Undo window, with R: 409, which the engine takes as final.
    const gone = await deleteCounted(r2 as never, ID, await meta(r2), photo(2), q(counters, T0 + 11 * MIN), OWNER, R);
    expect(gone).toBe(true); // today 'newer': the token alone has stopped a key-holder's removal
  });

  it('REPRO: without the drop proof, the 409/403 split is an oracle for when a photograph was uploaded (to the ms)', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    await storeOnce(r2 as never, ID, await meta(r2), photo(3), new Uint8Array(10), { drop: OWNER }, q(counters, await clockOf(r2)));
    const truth = r2.objs.get(photo(3))!.uploaded.getTime();
    // A token-holder with no proof: the 'newer' test runs before the proof is checked, so 'newer' (409) vs 'noproof' (403)
    // says whether X-Photo-Removed-At is before the upload.
    let lo = truth - 86_400_000, hi = truth + 1, asks = 0;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const r = await deleteCounted(r2 as never, ID, await meta(r2), photo(3), q(counters, truth + 11 * MIN), STRANGER, mid);
      asks++;
      if (r === 'newer') lo = mid; else hi = mid;
    }
    // Today the search lands on the upload's own millisecond in about 27 asks. A request without the proof should learn
    // nothing but "no proof": the answer should not depend on the time it sends.
    const answers = new Set<unknown>();
    for (const t of [truth - 1000, truth + 1000]) answers.add(await deleteCounted(r2 as never, ID, await meta(r2), photo(3), q(counters, truth + 11 * MIN), STRANGER, t));
    // (On 21257b7 the search above ends with `lo` within a millisecond of `truth`, in 27 asks.)
    expect({ asks, answers: [...answers] }).toEqual({ asks, answers: ['noproof'] });
  });

  it('GUARD: a key-holder can always remove (header omitted, or a time up to five minutes ahead): the rule protects honest devices only, by design', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(4), new Uint8Array(10), { drop: OWNER }, q(counters, T0));
    // a claim far after any removal time the device could send
    await storeOnce(r2 as never, ID, await meta(r2), photo(4), new Uint8Array(10), { drop: OWNER }, q(counters, T0 + 9 * MIN));
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(4), q(counters, T0 + 10 * MIN), OWNER, null)).toBe(true);
    // and the byte count is not moved by any removal-time value: given back once, by receipt
    expect(((counters.objects.get(`bytes:${ID}`)!.m.get('v')) as { bytes: number }).bytes).toBe(0);
  });
});
