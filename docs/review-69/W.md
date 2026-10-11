# Round sixty-nine, agent W: the server

Copy: `/tmp/r69/W`. Base for the fail checks: a private extract of `/tmp/r69/base.tar` (1609c19) in my scratchpad, so the shared `/tmp/r69/base` was not touched.

## 1. The items

### W1. Each vault's place no longer keeps its owner's network (S-E1)

**Changes in `src/lib/server/counters.ts`:**
- `fill` writes the network to a day-dated key, `fn:<vault>:<day>`, beside `pn:`. The place `f:<vault>` is now `{ d, w }` only.
- `unfill` reads the network from `fn:<vault>:<counted day>`. A place written by rounds 67 and 68 still has `n`, and `unfill` falls back to it. The `fn:` key is deleted with the place.
- The sweep judges `fn:` as it judges `pn:`: it is kept for today and yesterday and goes at the midnight that ends the next day. `fn:` is added to `SWEPT`.
- The sweep also cleans the places written before this round. `mendable` and `mend` remove `n` from any place whose counted day is no longer kept. This uses the same in-transaction re-check as the existing "start the 90 days" mend. After one deploy and two midnights, no old place holds a network.
- `touch` writes `placed(d, w, n)`, so it no longer spreads `n: null` into every place.

**Every other long-lived key, checked:**
- `all`, `r:<vault>` (a day) and `e:<day>` (fault kinds) hold no address.
- `c:<name>` holds a photograph name and a day, and is swept after two days.
- `o:<day>` (the half-spent networks) and its KV mirror go after two days.
- `s:<prefix>` holds the last key read, only while a sweep run is cut short. It is deleted when the prefix ends.
- A vault object's `v`, `gen`, `l`, `w` and `u:` hold no address.
- An address object's `d:<day>` is swept.
- In KV: `vaultplace:<id>` holds a day. `ipbytes:`, `vaults:` and `rl:` carry expiries.

**Tests:** `tests/unit/r69w-server.test.ts`, describe "W1".
1. **No address left after the sweeps.** The test makes a creation from an IPv6 and an IPv4 address and admits three vaults by network, which spends half the day and writes `o:`. It also stores a photograph (address bytes), counts a fault, and plants a round-68 place that carries `n`. It then ticks every object at the midnight two days later. No key or value in any counter object matches an IPv4 or IPv6 shape, or contains the three networks used. The places stay as `{ d, w }`.
2. **`unfill` gives the place back to the network.** This is checked through `fn:` and through a round-68 place.
3. **A round-68 place keeps `n` while its day is kept, and loses it after.**

All three fail on the base.

### W2. The listing budget reserves a walk (S-E2, IND-10, R46-22)

**Changes:**
- **`counters.ts`, `listAsk(budget, now, reserve = MAX_LIST_PAGES)`.** It refuses when the hour's count is at the budget, as before. Otherwise it adds `reserve` to the hour's count in the same step and returns `{ ok, hour, reserved }`.
- **`counters.ts`, `listed(pages, now, reserved = MAX_LIST_PAGES, hour)`.** It settles `count - reserved + pages` against the hour the ask reserved in. A walk that ends in the next hour settles nothing there.
- **`caps.ts`.** `MAX_LIST_PAGES` (50) moved here so both ends use one figure; `sync.ts` re-exports it.
- **`sync.ts`, `listBatches`.** It passes the reservation and settles with the reservation's hour.
- **The bound.** A failed settle leaves the reservation counted, which errs towards the bound. Pages in an hour are now at most 1,200 plus 49.

**Tests:** describe "W2".
1. **IND's shape.** With 1,199 pages counted, 30 asks pass only once, and the hour ends under 1,250.
2. **R46's shape.** 100 concurrent `listBatches` on 49,000 batches, with 1 ms list calls, make fewer than 1,250 list calls, and more than 70 are refused. The base made 4,900.
3. **The give-back.** 1,000 sequential pulls of a small vault all pass, and the count is 1,000.
4. **The rollover.** A walk that crosses the hour does not take its reservation off the new hour.

All four fail on the base. The budget figures are written out in the test (1,200 and 50) rather than read from the constants.

### W3. The Worker's own caches are keyed by the build (S-E3, R46-8, S-F6)

**The new file, `src/lib/server/worker-cache.ts`.**
- `workerKey(name, params)` builds `https://cache.cultifolio/<name>?v=<version>&...`.
- `version` is `$app/environment`'s. That is the same id `forBuild` compares the client's `v=` with, and the one the page cache's key in `hooks.server.ts` already carries.

**The five keys that use it:**

| Route or module | New key |
|---|---|
| `routes/api/search/+server.ts` | `search` (the hand-bumped `search6` is gone) |
| `routes/api/sheets/+server.ts` | `sheets` |
| `routes/api/names/+server.ts` | `names` (`names2` is gone) |
| `routes/api/forecast/+server.ts` | `forecast` |
| `lib/server/synonyms.ts` | `match` |

The sheets key also moves off `${url.origin}/api/sheets?...`, which was a real address of the site, onto the private host the others use (round twenty-one, 5).

**Tests:** describe "W3".
1. All five routes are driven with a recording cache. Every key matched or put starts with the private host and carries `v=<version>`.
2. An entry under an older build's form of the same key is not served.

I updated the expected keys in `tests/unit/sheets-api.test.ts` and `tests/unit/names-api.test.ts`, which test my files. All of these fail on the base.

The cached 404 and 302 are P's file. Their sentences are in section 2.

### W4. A PUT whose proof does not match takes no hold (S-E4, R46-23)

**Changes in `sync.ts`, `storeOnce`.** The pre-check before `withHold` now answers any request whose proof does not match the stored one:
- the same bytes are answered `same`;
- other bytes are answered `different`.

A first store of a removed name without the removal's proof now throws `PhotoRemoved` (403) before the hold. Before, it took the hold first.

**Tests:** describe "W4".
1. The grower holds the name. A stranger's replay of the same bytes is answered `same` at once and leaves no `h:`. It makes no new claim, so a removal asked for earlier still removes the photograph. On the base it throws `PhotoBusy`.
2. While the name is held, a removed name with the wrong proof is answered 403, where the base answered `PhotoBusy`.

### W5. A vault's writes an hour (R46-24)

**The cap, in `caps.ts`.** `VAULT_WRITES_PER_HOUR = 3600`.

**The count, in `counters.ts`, `take('vault', …, writes = VAULT_WRITES_PER_HOUR)`.**
- The hour's count is kept in `w = { h, n }` and read first. At the limit, `take` returns `{ spent: true, retryAfter }`, with the seconds to the next hour, and takes nothing.
- The count goes up in the same `put` as the bytes and the lease.

**The refusal, in `sync.ts`.** A new `WritesSpent` is a 503 with Retry-After and is added to `refusal()`. Its sentence is: "Uploading is refused for now: this vault stored as many objects as the site takes in an hour (3,600). Nothing is lost: your changes stay on this device, which sends them again within the hour." `storeCountedNow` throws it from the vault step, and the address's and network's bytes go back.

**Where I departed from the triage.** The triage says "batches". I count every stored object, log batches and photographs alike. A photograph of a few bytes is the same R2 write, and it is bounded only by the `syncobj` window (3,000 per ten minutes per address), which is a wider hole than the batches. A first push of more than 3,600 photographs is spread over hours. The engine reads a 503 of a minute or more as uploads refused until then, and shows the sentence.

**Test:** describe "W5".
- Three stores count 3 in `w`.
- At 3,599, one more store passes. The next is `WritesSpent`: 503, Retry-After 2,400 s at 12:20, and the sentence.
- Nothing is stored, the address's bytes are given back, and the next hour stores again.

It fails on the base. I updated `tests/unit/counters.test.ts`, whose list of a vault object's keys after the sweep now includes `w`.

### W6. Wording (server parts)

- **S-E6, in `sync.ts`, `VaultsClosed`.** The `day` and `network` sentences now say "…which tries again within the hour; new vaults are let in again after midnight UTC" (for `network`, "this network is let in again…") instead of "it will try again tomorrow".
- **The creation route's day ceiling, `routes/api/sync/vault/+server.ts`.** It says "try again after midnight UTC" instead of "try again tomorrow". No client file says "tomorrow" for these.
- **R46-25.** The network sentence adds "Another network, such as home Wi-Fi, may be let in now." It still begins "Sync has taken all the new vaults it takes from this network today", which `/about/formats` quotes.
- **S-E7.** NASA POWER's failure is recorded as `error`. This is in `dossier/build.ts` (M's file), so it is a need with its own test (section 2).
- **Tests:** describe "W6" (two tests). Both fail on the base.

### R46-31: the green reverts in my area

Each was checked by applying the revert in my copy and restoring it. Every one now fails, and none hangs.

| Revert | Test that now fails |
|---|---|
| Photograph id: 16 random characters cut to 8, or the old shape (counter and device) | `tests/unit/r69w-photo-id.test.ts` (new) |
| `LIST_PAGES_PER_HOUR` raised to 5,000 | W2 tests; `r67s-server.test.ts` S6, now hard-coded to 1,200 + 50 |
| `SMALL_BATCH_BYTES` as `<` instead of `<=`, or 32 KB | "the 16 KB boundary" |
| The `repoint` in `dropStrays` removed | "the pointer written back before a photograph's unnamed generations go (dropStrays)" |
| S5 per-network limit set to `Infinity` (the constant), or the check in `fill` dropped | Fails in milliseconds |

Notes on the table:
- **The photograph id test** mints 40 ids through `collection.addPhoto` over the in-memory vault mock. It checks the shape "p", then the time in base 36, then 16 base-36 characters, and that every tail differs and never names the device. It passes on the base, as it should, and fails under both reverts.
- **The `dropStrays` test** is a revival whose pointer write stalls past its hold. Meanwhile the device asks again for the removal, and that request's touch removes the unnamed generation. With the re-put, the stalled write fails and the upload is told to wait. Without it, the pointer names bytes that are gone.
- **The S5 hang.** In `r67s-server.test.ts` S5, the loop now runs to 10 written out, after `expect(MAX_NEW_VAULTS_PER_NETWORK_PER_DAY).toBe(10)`, with a 10 s timeout. The first S5 test expects `10 * 10`. My own test of the same rule has a 10 s timeout too.

## 2. Needs

### For M (`src/lib/dossier/build.ts`): S-E7, NASA POWER's failure recorded as `error`

How it works:
- The provider keeps one `extremesStatus` (`refused`) for a failure and a refusal. The page says both as "not checked", and changing that union would touch the schema (K), `core/sheet.ts` and several pages.
- The provider's own words already tell the two apart. `src.extremes` begins "NASA POWER did not answer (…)" for a timeout or a 5xx, and "NASA POWER refused the request (…)" for a refusal.
- So the upstream record is read from those words. `error` is treated as `refused` by the rebuild selection (`build-dossiers.ts:245`) and by the drops audit, so nothing else changes.

```diff
--- a/src/lib/dossier/build.ts
+++ b/src/lib/dossier/build.ts
@@ -321,7 +321,10 @@
   if (climate.status === 'pending') upstream.climate = { status: 'skipped', at: now(), detail: climate.detail };
   else mark('climate', climate.status === 'ok' ? { status: 'ok' } : { status: climate.status, detail: climate.detail });
   // The daily extremes are their own upstream: a refusal here is a reason to build again, which `climate: ok` alone would hide (round sixteen, 7).
-  if (climate.status === 'ok' && climate.extremesStatus) upstream['climate.extremes'] = { status: climate.extremesStatus === 'refused' ? 'refused' : climate.extremesStatus === 'skipped' ? 'skipped' : climate.extremesStatus === 'none' ? 'none' : 'ok', at: now(), ...(climate.src.extremes ? { detail: climate.src.extremes } : {}) };
+  // A failure is recorded as `error`, not `refused` (round sixty-nine; triage-68 W6, S-E7): the climate keeps one status for
+  // both, which the page says as "not checked", and the provider's words say which it was ("did not answer" for a timeout
+  // or a 5xx, "refused the request" for a refusal), so the record is read from them.
+  if (climate.status === 'ok' && climate.extremesStatus) upstream['climate.extremes'] = { status: climate.extremesStatus === 'refused' ? (/^NASA POWER did not answer\b/.test(climate.src.extremes ?? '') ? 'error' : 'refused') : climate.extremesStatus === 'skipped' ? 'skipped' : climate.extremesStatus === 'none' ? 'none' : 'ok', at: now(), ...(climate.src.extremes ? { detail: climate.src.extremes } : {}) };

   /* ---- 5. Identifiers, summary ---- */
   const ids: Dossier['ids'] = { gbif: key };
```

**The test to add with it, `tests/unit/r69w-power.test.ts`.**
- It is not in my copy, since it fails without the patch.
- I checked it: it passes with the patch applied in my copy and fails without it.
- It builds Copiapoa cinerea from the fixtures with a climate provider over one grid cell, whose POWER call ends in `{ status: 'error', detail: 'timed out' }`. The upstream record is then `error`, with "NASA POWER did not answer (timed out)…". A `refused` POWER call still gives `refused`.

```ts
/**
 * Round sixty-nine, agent W, applied at the merge with its patch to src/lib/dossier/build.ts (triage-68 W6, S-E7): NASA
 * POWER that did not answer (a timeout, a 5xx) is recorded in the dossier's upstream as `error`, and a refusal still as
 * `refused`; both stay "not checked" on the page.
 */
import { describe, it, expect } from 'vitest';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
const lat = -24.877, lon = -70.504;
function cell(): Record<string, number> {
  const v: Record<string, number> = { elev: 620 };
  for (let m = 1; m <= 12; m++) {
    const s = Math.cos(((m - 1) / 12) * 2 * Math.PI), mm = String(m).padStart(2, '0');
    Object.assign(v, { [`tasmax_${mm}`]: 22 + 4 * s, [`tasmin_${mm}`]: 12 + 3 * s, [`tas_${mm}`]: 17 + 3.5 * s, [`pr_${mm}`]: 1, [`rsds_${mm}`]: 18 + 8 * s, [`hurs_${mm}`]: 78, [`vpd_${mm}`]: 500, [`sfcWind_${mm}`]: 3 });
  }
  return v;
}
/** A provider over one grid cell whose NASA POWER call ends as `power` says; every envelope is that cell. */
function provider(power: { status: 'error' | 'refused'; detail: string }) {
  const p = makeClimateProvider({ grid: memoryGridSource(h, new Map([[cellOf(h, lat, lon).id, encodeCell(h, cell())]])), fetcher: fixtureFetcher({}, power as never) });
  return { envelope: () => p.at(lat, lon), at: p.at };
}
const build = (power: { status: 'error' | 'refused'; detail: string }) => buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(copiapoa() as Record<string, unknown>), builtBy: 'node' as const, now: () => new Date('2026-10-11T12:00:00Z'), climate: provider(power) });

describe('W6 (S-E7): NASA POWER\'s failure is recorded as an error', () => {
  it('a timeout is `error` in the upstream record, with the words "did not answer"; a refusal is still `refused`', async () => {
    const failed = await build({ status: 'error', detail: 'timed out' });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.dossier.climate.status).toBe('ok');
    expect(failed.dossier.upstream['climate.extremes']).toMatchObject({ status: 'error', detail: expect.stringMatching(/^NASA POWER did not answer \(timed out\)/) });
    const refused = await build({ status: 'refused', detail: 'HTTP 429' });
    if (!refused.ok) return;
    expect(refused.dossier.upstream['climate.extremes']).toMatchObject({ status: 'refused', detail: expect.stringMatching(/^NASA POWER refused the request/) });
  });
});
```

### For P: sentences for `/about/how` and `/about/formats`

1. **`/about/how` line 90, the summary list (W3, and the cached 404 and 302).** Replace "Cloudflare's edge keeps copies of public answers, linked to no address, each under its full web address; the requests the app's pages make name the app's version in that address, so a new version is never answered from an old one's copies." with:

   > Cloudflare's edge keeps copies of public answers, linked to no address, each under its full web address, and the server keeps its own copies of searches, figure sheets, name lookups, forecasts and old-name checks under keys that name the app's version; the requests the app's pages make name the app's version in their address, so a new version is never answered from an old one's copies, except two answers to a species address, which names no version: an address the reference does not hold is answered "not found" from the edge's copy for five minutes, and an older name's redirect to its species for a day.

   And add to that line's list of what is kept: "a species address the reference does not hold, answered 'not found', for five minutes; the redirect from an older name to its species' page for a day".

2. **`/about/how` line 95, in "Cloudflare's edge, in front of the server, keeps copies…" (W3).**
   - Replace "so a new version is never answered from an old one's copies:" with:

     > and the server's own copies of a search, a name, a forecast, an old-name check and a hash group's figure sheets are kept under the app's version too, so a new version is never answered from an old one's copies, except the two answers to a species address below, whose address names no version:

   - Replace "keyed by the rounded coordinates and altitude it was asked for" with "keyed by the app's version and the rounded coordinates and altitude it was asked for".
   - Replace "keyed by the corpus, the number of answers asked for and the query, its case kept" with "keyed by the app's version, the corpus, the number of answers asked for and the query, its case kept".
   - Replace "keyed by the name in lower case, with GBIF's answer to it" with "keyed by the app's version and the name in lower case, with GBIF's answer to it".
   - Replace "a species address the backbone was asked about for a day" with "a species address the backbone was asked about for a day, keyed by the app's version and the name in lower case".
   - Replace "a hash group's figure sheets for a day, keyed by the group and the corpus" with "a hash group's figure sheets for a day, keyed by the app's version, the group and the corpus".
   - Add before "the sitemaps, robots.txt…":

     > a species address the reference does not hold, answered "not found" (with what the old-name check found), for five minutes (<code>public, max-age=300</code>), and the redirect from an older name to its species' page for a day (<code>public, max-age=86400</code>), each under the page's address alone, which names no version, so for that long a new version can give the answer the version before it gave;

3. **`/about/how` line 95, "The one thing the server keeps about a visitor…" (W1).** After "the networks that took the most of a day's new-vault places, recorded once half the day's places are taken, for the operator, in that object and in KV;" add:

   > for each vault that takes a place, the network (/24 or /48) it was counted to, beside the vault's id, kept with the day's counts, so a place given back on its day is given back to that network, and dropped with them;

   "every address key is dropped within two days" is then true again.

4. **`/about/how` line 95, "With sync on, the server also keeps each vault's stored size…" (W2, W5).** After "for the storage allowance," add:

   > and how many objects it stored and how many pages of its log were listed in the current hour (two numbers and the hour), for the hourly limits,

5. **`/about/formats` line 52, the listing budget (W2).** Replace "a listing past the vault's hour of listings (1,200 pages of a thousand log batches an hour, counted in the vault's counter object)" with:

   > a listing past the vault's hour of listings (1,200 pages of a thousand log batches an hour, counted in the vault's counter object, where each listing's most pages, 50, are counted when it is asked and what it did not use is given back, so listings under way at once count too)

6. **`/about/formats` line 52, after the listing sentence (W5).** Add:

   > A vault that has stored 3,600 log batches and photographs in an hour (counted in its counter object) has its next upload answered 503 with <code>Retry-After</code> to the end of the hour and "Uploading is refused for now: …"; the device keeps every change, sends it then, and keeps receiving meanwhile.

7. **`/about/formats` line 52, the photograph claims (W4).** After "and only an upload that carries the photograph's removal proof claims it, whatever it is answered (…)" add:

   > An upload whose proof does not match is answered at once (200 for the same bytes, 409 for others, 403 for a removed photograph) and holds the photograph's name for no time at all, so it cannot keep a removal waiting.

8. **`/about/formats` line 52, the network's places (W6, R46-25).** No change is needed. The quoted sentence "Sync has taken all the new vaults it takes from this network today…" is still its beginning. If P quotes more of it, the full text is in `sync.ts` `VaultsClosed`.

## 3. Not done, and why

- **W5 counts photographs as well as batches.** This goes past the triage's word "batches", for the reason given in W5.
- **S-E7 is a need, not done in my copy.** The fix is in M's file. I chose the narrow route, reading the provider's words, over adding `error` to `extremesStatus`. The wider route would touch K's schema and several pages for no change a reader sees.
- **`build.ts` (`forBuild`) is in no agent's list.** I did not edit it. The new `worker-cache.ts` imports `version` itself.

## 4. Corpus step

None from W.

## 5. Runs

- **Unit suite:** `npx vitest run` in `/tmp/r69/W` gives 276 files, 2,357 passed and 1 skipped. That count includes my two new files, `r69w-server.test.ts` (17 tests) and `r69w-photo-id.test.ts` (1 test).
- **svelte-check:** `npx svelte-check --threshold error` gives 1,004 files, 0 errors and 0 warnings.
- **Checked against the base:** every W1 to W6 test in `r69w-server.test.ts`, plus the updated key tests in `sheets-api.test.ts` and `names-api.test.ts`. That is 16 tests, and all fail on 1609c19.
- **The R46-31 tests:** these pass on the base, as they should. Each fails under its revert, as listed in section 1.
- **Playwright:** not run (P's).
