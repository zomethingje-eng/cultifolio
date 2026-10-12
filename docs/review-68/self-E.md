# Self-review of rounds 67 and 68, reviewer E: the server, pages, privacy and the service worker

Copy: `/tmp/rv68/E` at 1609c19. Area: agent S (REVIEW-ROUND-67 section 3, REVIEW-PROMPT-68 section 6, triage S1 to S10) and agent P (section 5, the P items of section 1, REVIEW-PROMPT-68 section 7).

Reproductions are throwaway unit tests in my copy: `tests/unit/zz-rv-e-placenet.test.ts`, `zz-rv-e-listing.test.ts`, `zz-rv-e-searchcache.test.ts`, `zz-rv-e-photo.test.ts`. The area's own suites (`r67s-*`, `r67p-*`, `r63fs-*`, `r62bs-*`, `sync-*`, `counters`, `forecast-api`, `names-api`): 27 files, 246 tests, all pass.

## Findings

### E1. Every vault's place keeps the network of its first upload for as long as the vault is used (launch, confirmed)

- **Where:** `src/lib/server/counters.ts:336` (`fill` writes `n: net` into `f:<vault>`), kept by `touch` at `:415` (`{ ...p, w: day }`), swept only at the 90-day reclaim.
- **What it does:** S5 counts new places per network. To give a network's count back in `unfill`, the place record `f:<vaultId>` stores the uploading network: an IPv4 /24 or an IPv6 /48. That record lives as long as the vault keeps uploading. A /48 is commonly one customer's own delegation, so the server now holds a vault id beside its owner's network for good.
- **What the pages say:** `/about/how` line 90: "The server keeps short-lived rate counters by address, dropped within two days". Line 95: "The one thing the server keeps about a visitor is short-lived rate counters keyed by address … every address key is dropped within two days". The same line lists the place as "each such vault's id … and the day of its last upload", with no network. All three are false. This breaks rule 5.
- **Reproduction:** `zz-rv-e-placenet.test.ts`.
  - `admitVault` runs from `2001:db8:1234:5678:…`.
  - Three midnight sweeps follow.
  - The "vaults" object then holds `f:ABCD… = {"d":"2026-10-10","w":"2026-10-10","n":"2001:db8:1234::/48"}`. Every `pn:`, `ip:` and `day:` key is gone; this one stays.
- **Smallest fix:** `unfill` needs the network only on the day it was counted, since `pn:` keys go after two days. Two ways to do it:
  - keep it in a day-dated key (`fn:<vault>:<day>`, swept with `pn:`); or
  - have the sweep strip `n` from any place whose `d` is no longer kept.

  Add a test that no `f:` value holds an address-shaped string after the sweep.

### E2. The listing budget is checked before the walk and charged after it, so concurrent pulls are never refused (should, confirmed)

- **Where:** `src/lib/server/sync.ts:564-582` (`listAsk`, then `walk`, then `listed`) and `counters.ts:383-394`.
- **What it does:** `listAsk` only reads `l` and says yes while the hour's count is under 1,200. Pages are charged by `listed` after each walk finishes. Every pull that arrives while walks are in flight passes.
- **What it should do:** the claims are:
  - `/about/formats` line 52: "a listing past the vault's hour of listings (1,200 pages of a thousand log batches an hour…)";
  - the S6 comment in sync.ts: "about 29,000 list calls a day at most".

  The budget should hold under concurrency.
- **Reproduction:** `zz-rv-e-listing.test.ts`.
  - A vault of 49,000 batches, with a 1 ms list call.
  - 200 concurrent `listBatches` calls at 12:15, which is a third of one address's `sync` window.
  - Result: **9,800 R2 list calls, 0 refused**. The budget is 1,200.
- **What it costs:** one burst per vault per hour. Its size is bounded only by the request windows. A /48 alone sends 2,400 requests in the window, which is about 120,000 list calls. A handful of IPv4 addresses send more. The 50,000 tiny batches that make a vault expensive to list are now free of the daily byte totals (S9).
- **Smallest fix:** reserve in `listAsk` and settle in `listed`.
  - `listAsk` adds `MAX_LIST_PAGES`, or the vault's last walk's page count, to `l` in the same call.
  - `listed(pages, reserved)` gives back the difference.

  The object is single-threaded, so this is exact.

### E3. "An answer is cached only under its own build" holds for the adapter's cache only; the Worker's own caches ignore the build (should, confirmed)

- **Where:**
  - search: `src/routes/api/search/+server.ts:57` (`search6?c=&n=&q=`);
  - sheets: `api/sheets/+server.ts:43` (`keyOf`: `?b=&c=`);
  - names: `api/names/+server.ts:47` (`names2?q=`);
  - forecast: `api/forecast/+server.ts:63`;
  - the old-name check: `lib/server/synonyms.ts:76`.
- **What it does:** each of these is a day-long (forecast: an hour) Cache API entry keyed without the version.
  - A deploy that keeps the corpus id serves the old build's search ranking, sheet derivation and reduced forecast for up to a day.
  - An old isolate still running during the deploy writes old answers under the same keys.
  - The answer then goes out with `forBuild`'s `public, max-age=86400`, so the adapter keeps the old build's answer under the new build's `v=` URL for another day.
- **What the pages say:** `/about/how` line 90 and line 95: "the requests the app's pages make name the app's version in that address, so a new version is never answered from an old one's copies". Line 95 also describes the search copy as "keyed by the corpus, the number of answers asked for and the query", which is the Worker's key and holds no version.
- **Why it matters:** search ranking changed in this very round (round 68, second part: the family whole-word rule). The `search6` prefix is bumped by hand, and it was not bumped for that change.
- **Reproduction:** `zz-rv-e-searchcache.test.ts`.
  - An entry stands under `https://cache.cultifolio/search6?c=<corpus>&n=60&q=copiapoa`, as the previous build left it.
  - A request with `v=<this build>&c=<corpus>` is answered with that entry, `public, max-age=86400`.
- **Smallest fix:** put `version` into the five Worker cache keys, at least search, sheets and forecast. The names and match answers are GBIF's data, so the sentence on the page can say so instead. Then drop the hand-bumped `search6`.

### E4. A token-only PUT of the same bytes still takes the photograph's hold (minor, confirmed)

- **Where:** `src/lib/server/sync.ts:1034`.
- **What it does:** the S10 pre-check answers 409 without the hold only when the bytes differ. A holder of the token can GET the ciphertext with that same token and PUT it back with any proof. That request passes the pre-check, takes the hold, and holds the name for the whole run. A key-holder's removal meanwhile meets `PhotoBusy`.
- **Reproduction:** `zz-rv-e-photo.test.ts`.
  - A stranger's same-bytes PUT is stalled inside its run.
  - The counter object holds `h:<name>`, and the grower's DELETE with the right proof answers `PhotoBusy`.
  - The stranger is then answered `same`.
- **Reach:** this needs a photograph id. New ids are random, but old-shape ids (time plus device) are still on the server and can be guessed. If a dropped connection cancels the request after `hold` and before `unhold`, the hold stands for `HOLD_MS` (60 s) per request. This part is suspected; I did not run it.
- **Smallest fix:** a request whose proof does not match the stored one claims nothing, so answer it before the hold: `if (o && !(extra.drop && md.drop === extra.drop)) return md.sha === sha ? 'same' : 'different';`. The same applies to a token-only PUT on a removed name (`pre.key` null), which today takes the hold only to be told 403.

### E5. A server failure on the sheets and entries is said as a refusal (minor, confirmed by the project's own test)

- **Where:** `src/lib/ui/index.svelte.ts` (`refusalOf`: every non-ok status except 429 is `kind: 'refused'`) and `src/lib/ui/reach-words.ts`.
- **What it does:**
  - A 503 for a store read that failed ("The species sheets could not be read just now.") reads as "the server refused the species sheets just now (the species sheets could not all be read just now)". `tests/unit/r67p-reach.test.ts:94` asserts that sentence.
  - A Worker exception (500) or a Cloudflare 5xx reads the same way.
  - This is rule 2 turned round: a failure is presented as a deliberate refusal.
- **Smallest fix:** add `kind: 'failed'` for 5xx (and for the 503s whose body says "could not be read"), worded "the server could not read the species sheets just now; it can be asked again in 30 s". Keep `refused` for 4xx other than 409 and 429.

### E6. The sentence a vault refused a place is shown says "it will try again tomorrow"; the device tries every hour (minor, confirmed by reading)

- **Where:** `src/lib/server/sync.ts:1283` and `:1285` (the `VaultsClosed` sentences for `day` and `network`), against `engine.svelte.ts:653` and `:669` (a wait is capped at an hour).
- **The grower affected:** someone behind carrier NAT whose /24 has taken its 10 places is told "tomorrow". The device asks again within the hour. It is admitted as soon as the phone moves to another network, or at midnight UTC.
- **Fix:** "it tries again within the hour, and is let in after midnight UTC". `/about/formats` already says "or within the hour, whichever comes first".

### E7. NASA POWER's failure is still recorded as a refusal (minor, read)

- **Where:** `src/lib/climate/provider.ts:105` (`status: r.status === 'none' ? 'none' : 'refused'`) and `src/lib/dossier/build.ts:323`.
- **What it does:** S8 says "NASA POWER's wording matches its status". The words now say "did not answer (…)", but a timeout or a 5xx is still stored as `upstream['climate.extremes'].status = 'refused'`, beside a detail that says it did not answer.
- **Smallest fix:** keep `error` apart in `extremesStatus` (or at least in the upstream record, whose picklist already has `error`). The page's "not checked" stays as it is.

### E8. The removal proof is a static header sent with every upload of the photograph (minor, design; pre-existing)

- **What it does:** `X-Photo-Drop` is the HMAC of `drop:<id>`, the same on every PUT and every DELETE of that photograph. Anyone placed where request headers can be seen captures both the token and the proof of every photograph uploaded meanwhile. `/about/how` names that place itself: "visible wherever request headers are, the platform included".
- **The replay:** such an observer can later send a DELETE with a fresh `X-Photo-Removed-At`, and it removes a revived photograph too.
- **What the pages say:** "only a holder of the sync key can make" the proof. That is true of making it, not of using it.
- **Fix, for a wire round:** the PUT sends a hash of a per-generation secret, and the DELETE sends the secret.

### E9. "Keep data" for browsers that answer silently (minor, design pushback)

- **What the gate does:** the month in `keep-ask.ts` applies to Chrome and Safari as well as Firefox. Chrome and Safari answer `persist()` without a prompt, and their answer changes, for example once the app is installed or the site has more engagement.
- **The cost:** a first "no" leaves the grower unprotected for 30 days. In Safari that is a month of exposure to its seven-day deletion of a site's storage.
- **Paths checked:**
  - I found no path where a grower with records is never asked. The load asks when the fold holds anything, GrowLayer asks on the first plant, and a vault join or an import reaches GrowLayer.
  - Firefox is no longer asked on every load.
- **Fix:** apply the month only to an ask that did not settle within a second or two (a prompt). Re-ask silently-answering browsers on each load.

### E10. A tab still on build A after two deploys loses its lazy chunks (minor, suspected)

- **Where:** `src/service-worker.ts` (`activate` keeps this build and the newest older one).
- **What happens:**
  - A tab on build A with `reloadOnNext` set moves only at its next navigation. An installed app left on Today may not navigate for days.
  - After a second deploy, C's activation deletes A's cache. A's hashed files are no longer on the server either.
  - A dynamic import in that tab then fails: the spreadsheet, the share card, the example's seed.
- **Fix, either of:**
  - keep the cache of any build a client still runs, which the worker can ask with `clients.matchAll` and `version`;
  - or have a page with `reloadOnNext` reload when a dynamic import fails.

## /about/how and /about/formats: sentences that are not true

1. `/about/how` lines 90 and 95, on short-lived address counters, "every address key is dropped within two days", and the place record. The network stays on each vault's place (E1).
2. `/about/how` lines 90 and 95: "a new version is never answered from an old one's copies". False for the Worker's search, sheets, names, forecast and old-name copies (E3).
3. `/about/how` line 95: "Wikimedia Commons (upload.wikimedia.org, at the 960- and 500-pixel sizes)". A file narrower than 960 px is shown as its original upload, and a tile narrower than 500 px is the original (`sources/wikimedia.ts:209-212`). The host is right; the sizes are not.
4. `/about/how` line 95: the browser HTTP cache list ("a catalogue search … and a page as rendered for a minute") leaves out the sealed log batches and photographs, which the browser keeps for a year (`private, max-age=31536000, immutable` on `GET /api/sync/log/<key>` and `/api/sync/photo/<id>`; `syncFetch` uses the default cache mode).
5. `/about/formats` line 52: "a listing past the vault's hour of listings (1,200 pages … an hour)". This is not a bound (E2).
6. `/about/formats` line 52: "The generations are listed a thousand at a time to the end". One look lists at most five pages (`GEN_LIST_PAGES`); the mark keeps it for the next night.
7. `/about/formats` line 52: "after seven such nights its mark is dropped and its name written to the server's log". Workers Logs is off, so no log is kept. The line reaches only a live tail, and the event is counted as a `sweep` fault.
8. The account, not the pages: `REVIEW-ROUND-67.md` section 3 ("The repository's copy is stale on this line") and `REVIEW-PROMPT-68.md` ("The repository's `wrangler.jsonc` has `observability` on") are both wrong. The repository's `wrangler.jsonc:9` has `"observability": { "enabled": false }`. This is the safe direction, but the account should say so.

## The probes answered

- **Photographs.**
  - **Undeletable:** only probabilistically, through E4 (and E4's dropped-connection variant, suspected).
  - **Removing one it should not:** not with the token alone. A header observer can, through E8.
  - **Making the sweep delete a live generation:** I found no way.
    - The sweep and every Worker path hold the name.
    - `repoint` changes the pointer's etag before any delete, so a stalled `point` fails.
    - Generation keys are immutable, and nothing ever points back to an old unnamed generation.
    - A young generation (under 10 minutes) is left.
    - An unreadable pointer throws, so nothing goes on its word.
    - The paged listing compares each key to the pointer as read.
    - Ids: `p` plus the HLC wall in base 36 plus 16 characters from `getRandomValues`, about 82 bits.
- **Free small batches.**
  - **Storage:** not unbounded. Each vault's 2 GB is still taken exactly in its counter object (fail closed), and places are bounded.
  - **Bytes per address:** for batches of 16 KB or less, the bound per address is now only the fail-open request window. At 600 per 10 minutes that is about 1.4 GB a day per IPv4 address, below the old 3 GB.
  - **R2 operations:** these were never bounded by the byte totals. They are bounded by the windows, as before.
  - **What they do add:** they make E2's 50,000-batch vault free to build. Past 50,000 batches a token holder can also make a vault unlistable for every device (pre-existing).
- **The network place limit (10 a day per /24 or /48).**
  - **Bypass:** it takes 20 networks to spend a day, for example 40 IPv4 addresses on 20 /24s from any cloud provider. That is as designed, and DEPLOY covers it.
  - **Behind carrier NAT:** creation can already be refused at five vaults per shared address, worded "too many new vaults from this address today" to someone who made none (pre-existing). The 11th grower of a /24 that day is told E6's "tomorrow" sentence, and is let in hourly retries later or from another network.
  - **The listing budget** is per vault, so NAT plays no part in it.
- **`v=`.**
  - **Omitted:** answered and cached under the `v`-less URL as before. The app never omits it.
  - **Forged, or an old build's:** `no-store`, so nothing is stored at the adapter and nothing can be poisoned. Only `v === version` is kept, and an old isolate answers a new `v` with `no-store`. Each such request costs a Worker run, which the rate buckets count; a search hit in the Worker cache comes free, as designed.
  - **Crawlers:** `/api/` is disallowed in robots.txt.
  - **Bloat:** junk parameters next to the current `v` mint adapter entries, as they always could.
  - **The gap** is E3.
- **Refusals.**
  - MET's 429 and 403 reach Today as "MET Norway refused this site's request".
  - The NWS is split into `refused` and `unanswered`, with its own words on Today and five minutes kept for both.
  - GBIF's 429 and 403 are said as refusals at the picker and on the species 404, and held calls as "not asked".
  - Retry-After is passed on and waited out by "Check again".
  - The slips are E5 and E7.
- **The reload rule.**
  - I found no sequence that reloads over typed text:
    - `typed` is any `input` or `change` event, or a focused typing field;
    - writes in flight count;
    - the decision is taken after `buildOf` resolves.
  - In practice an install's precache takes longer than four seconds, so nearly every takeover is `next`. That is safe.
  - **An old build against new data** is the norm until the next move. Its requests carry the old `v`, and the new server answers them `no-store`.
  - **A tab that never moves** stays on the old build for good, and after two deploys it loses its lazy chunks (E10).
  - **One rough edge:** a dirty add form at the next move gets the page's own confirm and then the browser's beforeunload prompt. Nothing is lost, but the grower is asked twice.
- **Hover preloading on private pages:**
  - the body attribute is set to `off` on private routes, and the tray and pill carry it too;
  - Today embedded on the front page, the "Your species" grids and the own-plant search results are all `off`;
  - only the public catalogue rows preload. Sound.

## Triage items, as the account says them

- **S1:** done. The upload waits, and GET and HEAD answer 503 with Retry-After 10. A pointer that is unreadable for good blocks that photograph for good; no client can make one.
- **S2:** done, and more than the account says: the repository's `wrangler.jsonc` is off too. Faults are counted by kind, a week.
- **S3:** done. `repoint` runs before every delete (sweep and `dropStrays`), and the upload is fenced before its pointer write.
- **S4:** done. Five pages of a thousand per look; the mark stays until a complete, clean listing.
- **S5:** done (10 a network, the half-day record, `unfill` gives back), but it leaves the network on the place for good (E1).
- **S6:** in place, but not a bound under concurrency (E2). The engine reads the 503 as a wait.
- **S7:** done for the adapter's cache, the client's `v=` and the worker's corpus key. Not done for the Worker's own caches (E3).
- **S8:** MET, GBIF, the NWS, build-time timeouts and the client's Retry-After are done. Two slips: E5 and E7.
- **S9:** done. The /48 is worded "this network", every creation refusal waits to midnight, and batches of 16 KB or less are free of the daily totals on both paths.
- **S10:** done (random ids, the 409 before the hold for different bytes), with E4's gap.
- **P1:** done. One gate, the time written before the call, `askedHere`, the example excluded, no other `persist()` caller. `requestPersistence(…, ask = true)` in `vault.ts:689` is dead code that still calls `persist()`.
- **P2:** done as described (`take-over.ts`, the layout wiring, `oldCopy`). Caveat: E10.
- **P3:** done.
- **P4:** corrected in many places, but items 1 to 7 above remain.
- **P5 to P9:** spot-checked as present: the "Use my location" space, the full stop in `ended()`, the strip's `failedBeforeHydration`, `ownValue` and `reqGen` in the picker, Labels' `back_forward`, `aria-current` in the menu.
- **P10:** present (`reserve` on the picker); I did not measure it.

## Checked and sound, briefly

- The `pn:`, `o:` and `e:` sweeps and their KV mirrors' expiry.
- The `halfSpent` record (top 20 networks, kept two days).
- The fault kinds (a fixed word list, no address).
- `untilMidnight` on every creation refusal.
- `DayQuota` network wording.
- `ListingsSpent` wording and Retry-After.
- The KV fallback's small-batch path.
- The CSP `img-src` list against the four photograph hosts.
- Robots.
- `forBuild` on rows, entries, sheets, names, forecast and search.
- The SW's corpus cache stripping `v`.
- `oldCopy` never reading `cultifolio-corpus`.
- The picker's GBIF refusal.
- The species 404's three cases (held, refused, did not answer).
