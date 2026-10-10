# Reviewer D, round sixty-six: the server

Working copy `/tmp/rev66/D`. Probes are in `tests/unit/r66d-probes.test.ts`. Run it with `npx vitest run tests/unit/r66d-probes.test.ts`. Six tests: five FAIL on this commit, each stating the behaviour it expects, and D5 PASSES because it only demonstrates the attack. The curl transcripts were taken against the shared `wrangler dev` server on :4173. No app code was changed.

Ranking: security and data loss first, then cost and availability, then words and claims.

---

## 1. A bearer token alone can replace a live photograph when its pointer body fails to read once (CONFIRMED in the fakes)

- **Where:** `src/lib/server/sync.ts:871-893` (`runPhoto`) and `src/lib/server/photogen.ts:49-50`.
- **What happens:**
  - `photoRef` reads a pointer whose body does not parse, including a transient stream failure, as `{ key: null, removed: { drop: '' }, unreadable: true }`.
  - `deleteCounted` honours `unreadable`. It returns `PhotoBusy` (line 119), which was round sixty-three's R3 2 fix.
  - `runPhoto` ignores it. `existing` is null. The A23 guard at line 881 is skipped because `drop` is `''`. Then `ref.exists`, so a new generation is stored with whatever proof the request carries. Finally `point()` moves the pointer from the live generation to the new one; its etag condition still matches, since nothing changed the pointer.
  - The live generation is then unnamed. `dropStrays` at the next touch, or the vault's sweep, deletes it.
  - The request answers `stored`. A device that lacks the pixels fetches the stranger's bytes, fails to open them and quarantines the photograph. The real bytes are gone from the server.
- **Who is exposed:** every photograph that has a pointer. That is any photograph removed and revived, and also any photograph re-PUT with its proof (a retry after a lost reply writes `{ g: 'bin' }`).
- **What it needs:** the bearer token, the photograph's id (see finding 10: ids are guessable, not random), and one transient R2 body-read failure while the PUT is in flight. The holder can retry at `syncobj` rates (3,000 per 10 minutes per address) until one lands.
- **Why it matters:** it breaks the stated rule that the token "can add to a vault, never destroy in it". The odds are low, but the fix is one line.
- **Should:** an unreadable pointer is never a removed one for a store either. The upload waits, as the removal does.
- **Repro:** `r66d-probes` › D7. One `json()` failure on the pointer, then a PUT with proof `e…e` and 5 bytes. Expected `different` with the pointer unchanged; got `stored` with the pointer moved to the stranger's generation. FAILS now.
- **Related, benign:** GET and HEAD of a photograph read the same pointer through `photoObjectKey` (`photo/[id]/+server.ts:13,61`), so a read failure answers 404 "no such photo". The engine's `verifyPhotos` takes a HEAD 404 as "dropped" and pushes again. That is an absence said for a failure (rule 2), and it costs one re-upload.
- **Smallest fix:** at the top of `runPhoto`, add `if (ref.unreadable) throw new PhotoBusy(PHOTO_BUSY_S);`. In `photoObjectKey`'s callers, answer 503 with Retry-After when the pointer is unreadable.

## 2. The unnamed-bytes sweep deletes a generation that a stalled revival then names (CONFIRMED in the fakes; needs a stall of 10 minutes or more)

- **Where:** `sync.ts:887-893`; `counters.ts:600-613` (`sweepPhoto`); `photogen.ts` `unnamedGenerations`.
- **What happens:**
  - The upload path is not fenced. A revival does `markUnnamed`, then stores generation `gk`, then calls `point()`, with no `fence()` (hold renewal) before the pointer write. The removal path has one; the upload path does not.
  - If `point()` stalls past the 60-second hold and past `STRAY_MS` (10 minutes), the vault's alarm takes the hold. It reads the pointer, still the receipt, and finds `gk` unnamed and old enough, so it deletes `gk` and gives its bytes back.
  - The stalled `point()` then lands, because its etag condition still matches.
  - Result: the pointer names a generation that no longer exists. The device was told `stored`, adds the photograph to `photosPushed` and never sends it again. Every other device gets 404, read as "not uploaded yet", for good.
- **Likelihood:** low. It needs an R2 conditional put that commits about 10 minutes late. The client gives up at `PHOTO_MS` (3 minutes), but nothing guarantees the R2 write was abandoned.
- **Repro:** `r66d-probes` › D1. The pointer write is held on a gate, then `tick(A + 12 min)` runs, then the gate opens. `storeOnce` answers `stored`, `photoObjectKey` names `…/p000001.g…`, and that key is gone from the bucket. FAILS now.
- **Smallest fix:** in `sweepPhoto`, before deleting anything, re-write the pointer with its own body under `etagMatches: ref.etag`. Any stalled `point()` that read the old etag then fails, and the upload's existing fallback (lines 894-901) takes off its own generation and answers busy. Also pass `fence` to `runPhoto` and call it before `point`, as the removal does.

## 3. One actor can close sync to every new grower cheaply, and keep it closed (CONFIRMED)

- **Where:** `counters.ts:69-84` (`create`), `:317-330` (`fill`), `:344-370` (`touch`); `sync.ts:1020-1022`.
- **What happens:**
  - The day's new-vault ceiling (200, counted at the first object) and the ceiling in all (2,000) are global. A place costs one vault creation plus one stored object of any size: a batch of a few bytes is enough.
  - Vault creation is limited to 5 per address a day, and 20 per IPv6 /48. IPv4 has no /24 grouping for creation.
  - So 40 IPv4 addresses, which can all sit in one /26, or 10 IPv6 /48s, spend the day's 200 places. Every honest grower's first upload that day is refused with "Sync has taken all the new vaults it can today".
  - Ten days of this fill the 2,000. After that every new grower, and every returning vault whose place was reclaimed, is refused "for now".
  - The 90-day reclaim does not help: one upload per vault before day 90 moves `w` on (`touch`). That is 2,000 tiny POSTs a quarter.
  - Raising `SYNC_VAULTS_MAX` only buys time, since the new places go the same way at the same price.
- **Repro:** `r66d-probes` › D5 (PASSES; it demonstrates the attack):
  - Ten /48s × four /64s × five creations a day each give 2,000 places in 10 days.
  - An honest first upload on day 1 gets `fill` → `'day'`.
  - On day 11 it gets `'total'`.
  - A `touch` on day 89 answers `'already'` and keeps the place.
- **Should:** the ceilings exist to bound spend, but as built they are also a cheap global off switch. Options, smallest first:
  - count the day's ceiling per /24 or /48 as well (no network more than a few places a day);
  - require some bytes, or a minimum age with real use, before a vault holds a place against `all`;
  - have the operator alerted (the counter object can log or notify) when `day:` crosses half its ceiling;
  - document the switch in DEPLOY as a known attack, with what to do.

## 4. Cost the owner cannot bound: R2 list operations per pull, and other per-request costs with no global cap (CONFIRMED for listing; arithmetic for the rest)

- **Where:** `sync.ts:463-498` (`walk` and `listBatches`); `routes/api/sync/log/+server.ts:12-21`; `hooks.server.ts:179`.
- **What happens:**
  - **Listing.** Every `GET /api/sync/log` walks the vault's whole log prefix, whatever `since` or `after` say: one R2 list (a Class A operation) per 1,000 batches, up to 50.
    - A token holder can grow their own vault to 49,000 tiny batches, at 600 POSTs per 10 minutes per address; a few hours from a handful of addresses.
    - After that each pull costs 49 Class A operations. At the `sync` rate (600 per 10 minutes per address) that is about 4.2 million a day, about **$19 a day per IPv4 address** at $4.50 per million.
    - An IPv6 /48 gets four times the requests, so about $76 a day.
    - Nothing caps the number of addresses, vaults or total listings.
  - **Other paths, smaller per request:**
    - Each photo PUT is one Class A put plus two Class B reads. Tiny photos at the `syncobj` rate (3,000 per 10 minutes) cost about $2 a day per address in puts. Total bytes are bounded (2 GB × 2,000 vaults), but the object count is not.
    - A held page's cache miss is deliberately not metered (`hooks.server.ts:179`: "A GET that misses is held once rendered, so it is not counted"). Every `/species/<slug>` × units × hemisphere variant renders and reads R2 twice, once per minute per location. That is about 54,000 renders a minute per location from one client that cycles the keys, limited only by Cloudflare's own DDoS protection.
  - DEPLOY.md:19 rightly says to set a billing alert, but an alert is not a cap. The backlog's trigger for arrival-ordered naming ("R2 list operations show on the bill") is a trigger an attacker controls.
- **Repro:** `r66d-probes` › D2. A paged fake bucket of 49,000 batch keys; `listBatches(…, since: now)` returns nothing new and still makes 49 list calls. FAILS now (expects 1).
- **Smallest fix:**
  - A per-vault listing budget in the vault's counter object (for example, at most N whole-prefix walks an hour per vault, then 503 with Retry-After), so cost is bounded per vault and therefore by the 2,000 places.
  - Cloudflare rate-limiting rules on `/api/sync/*` and on uncached page renders.
  - Later, the arrival-ordered naming the backlog already describes.

## 5. The adapter's own cache answers every "public" GET before any of the Worker's code runs; the about page and the comments say otherwise, and old builds' answers outlive a deploy (CONFIRMED)

- **Where:** `node_modules/@sveltejs/adapter-cloudflare/files/worker.js` (7.2.9). Lines 63-65 do `caches.default.match(req)` first; line 121 does `c(req, res, ctx)`, which puts every GET with a `cache-control` not containing private, no-cache or no-store, and status 200 or 404, under the full request URL.
- **What this means:**
  1. The comments "every request reaches the Worker, counted" (the sitemap routes, `/api/index`, `RATE.reference`) are false for any repeated URL. `/about/how`'s list of what "Cloudflare's edge keeps" leaves out the `/api/rows` windows (a day), `/api/entries` bucket sets (a day), `/sitemap*.xml` and `robots.txt` (a day), `/api/index` (5 minutes), and species 404 pages (5 minutes).
  2. **Deploy staleness.** The adapter's key is the URL, never the build. After a code-only deploy, which keeps the corpus id, the old build's `/api/search?…&c=<id>` answers are served for up to a day per location. The same holds for `/api/names` (a day), `/api/rows` and `/api/entries` (a day; a row or entry shape change reaches new clients late), `/api/forecast` (an hour, with the old `risk.text` wording), and 404 species pages (5 minutes, naming the old build's chunks).
     - Round sixty-three's "the cache key moves from search4 to search5", so answers ranked by the old typo rule are not served, only covered the route's own key. It worked that time because the corpus id changed in the same deploy.
  3. Nothing here leaks private data. Sync GETs are `private` or `no-store`, and statuses without `cache-control` are not stored.
- **Repro (curl, same URL against varying query; `RATE.index` is 6 per 10 minutes):**
  ```
  $ for i in 1..9: curl -H 'cf-connecting-ip: 203.0.113.77' /api/index
  200 200 200 200 200 200 200 200 200          <- never limited: answered from the adapter's cache
  $ for i in 1..9: curl -H 'cf-connecting-ip: 203.0.113.78' "/api/index?x=$i"
  200 200 200 200 200 200 429 429 429
  ```
- **Smallest fix:**
  - Put the build `version` into the URLs the client asks under (`&v=`), or have the routes send `cache-control: private` or `s-maxage=0` to the adapter and keep their own Cache API copies (which already carry a corpus key and can carry the build).
  - Correct `/about/how` to list every copy kept.

## 6. A sheets request this site refused (429) is said as "the species sheets did not answer" (CONFIRMED; rule 2)

- **Where:** `src/lib/ui/index.svelte.ts:199,206` (`sheetsFor`: `r?.ok ? … : null`, and every failure is the same `null`); `src/lib/ui/Today.svelte:164`; `src/routes/today/+page.svelte:388`; the plant page's "Reference not reached" (`plants/[acc]/+page.svelte:806`) through `sheetForName`.
- **What happens:**
  - `/api/sheets` answers 429 "too many requests from this address" from `limited(…,'sheets')`: 200 uncached buckets per 10 minutes per address, 800 per /48, which an office or a carrier NAT can reach.
  - The client folds it into `null`, the same as a dropped connection. Today then says "resting months not checked: the species sheets did not answer".
  - `entriesFor` does the same with a 429 from `/api/entries`.
  - `searchCatalogue` already gets this right: it returns `{ limited }`.
- **Repro:** `r66d-probes` › D4. A fetch stub answers 429; `sheetsFor` returns `null`. FAILS now.
- **Smallest fix:**
  - Return `{ limited: retryAfter }` from `sheetsFor` and `entriesFor` on a 429, as `searchCatalogue` does.
  - Today and the plant page then say "not asked: this site asked this device to wait".
  - The 503 `SheetsUnreadable` ("could not all be read") is the server's own failure, and "did not answer" is acceptable there.

## 7. A /48's creation limit is said as "this address", with an hour's Retry-After on a limit that lasts to UTC midnight (CONFIRMED)

- **Where:** `counters.ts:77-78`, where both the /64's own 5 and the /48's 20 return `'address'`; `routes/api/sync/vault/+server.ts:48`, which answers "too many new vaults from this address today" with `retry-after: 3600`.
- **What happens:** a grower whose /64 made no vault, in a /48 that made 20 (a large ISP's or a mobile carrier's /48, see 9), is told their address made too many. The counts are keyed by day, so a retry after the hour is refused again until midnight. The route's `'day'` refusal also says 3600, while `VaultsClosed('day')` uses `untilMidnight`.
- **Repro:** `r66d-probes` › D3. Twenty /64s of one /48 create one vault each; the 21st, a fresh /64, gets `'address'`. FAILS now (expects a distinct `'network'`).
- **Smallest fix:** return `'network'` from line 78 and word it "from this network". Use `untilMidnight(now)` for both the 429 and the `'day'` 503.

## 8. The reserved quarter gives each other network two calls a minute; practical denial of the name picker takes about 15 addresses, not 77 networks (CONFIRMED by the existing test and arithmetic)

- **Where:** `counters.ts:653-669`; `caps.ts`; `/about/how:91` ("it takes at least 77 different networks").
- **What happens:**
  - The 77 is the cost of spending every call in a minute. Once the open three-quarters (450) is spent, every network that has made 2 calls that minute is refused as `reserve`.
  - So two networks at their parts (240 + 210) put GBIF into reserve mode. Every other network, including a whole carrier-NAT /24, then gets 2 uncached name lookups a minute. The picker asks on each keystroke from the third character, so it fails on the third uncached keystroke.
  - Sustained, the `names` window (300 per 10 minutes per address, 1,200 per /48) is the bound. About 15 IPv4 addresses spread over two or more /24s, or 4 IPv6 /48s, keep GBIF in reserve mode continuously. The species-404 path's `match` bucket adds its own share.
  - `r63s-shares.test.ts` "past three quarters…" shows the mechanism: 8 networks, then a network that has called gets `reserve`, and a new one gets exactly 2.
- **Should:** say on `/about/how` what a visitor sees under that pressure ("two lookups a minute per network"), or size the reserve per network by the time since the network's last call. The words are honest ("not asked", with reasons), so this is a claim and design issue, not a rule-2 fault.

## 9. "A /48 is one host" does not hold for large ISPs and mobile carriers; their subscribers share the /48's quadruple allowance (SUSPECTED: depends on carrier allocation)

- **Where:** `caps.ts` `NET_FACTOR = 4`; `sync.ts` `networkKey`, `limited`, the 12 GB /48 upload total; `counters.ts` creation per /48.
- **What happens:**
  - Mobile carriers hand each device a /64 from pools that are usually far larger than one subscriber, and cable ISPs delegate /60s or /64s out of shared /48s. Many unrelated growers can therefore share one /48.
  - They share 20 new vaults a day, 12 GB of uploads a day ("the upload allowance for this network is used up"), 2,400 sync and 12,000 object requests per 10 minutes, and 240 GBIF or MET calls a minute.
  - Any one subscriber, possibly an attacker, can spend those for everyone in it. Rotating /64s within the /48 makes that easy.
  - Carrier NAT on IPv4 is the same story at the address and /24 level, which `/about/how` does say.
- **Should:** keep the /48 counts, but say on `/about/how` that a /48 can be a whole ISP's neighbourhood, and consider a higher factor for uploads.
- **Related DEPLOY note:** keep Cloudflare's "Pseudo IPv4: Overwrite Headers" off. It replaces `CF-Connecting-IP` for IPv6 visitors with a class-E IPv4, which destroys the /64 and /48 grouping and lumps unrelated visitors into /24s.

## 10. Photograph ids are clock-and-device stamps, and the token holder sees both parts (SUSPECTED: makes 1 and a removal-hold grief practical)

- **Where:** `src/lib/db/collection.svelte.ts:1205` (`'p' + eventId().slice(1)`) and `:1387-1389` (`wall` in base 36, a 2-digit counter, the device id).
- **What happens:**
  - `GET /api/sync/log` gives a token holder every batch's device id, hour, and arrival time.
  - A photograph's id is its creation time in milliseconds plus that device id, usually with counter `00`. The search space is the milliseconds before a batch's arrival: tens to hundreds of thousands of HEADs, which is feasible from a few hundred addresses.
  - Round sixty-one's "that needs the photograph id, which a holder of the token alone cannot read" is true for reading, but not for guessing.
- **What knowing an id enables:**
  - (a) Finding 1.
  - (b) Keeping the name held by streaming PUTs of different bytes. Each takes `h:<name>` for its own R2 reads. At about 25 requests a second (5 to 10 addresses), the owner's DELETE always gets `PhotoBusy` and the bytes never go, which is "undeletable" for as long as the stream lasts.
- **Smallest fix:** give new photographs a random id (`'p' + 20 random base-36 characters`), and keep accepting old ones. A PUT that answers `different` should not need to hold the name at all; judge it after a head, before `withHold`.

---

## What I checked and found sound

- **Proof-first removal.** A DELETE without the matching proof gets 403 before any hold, and a wrong proof gets 403 on a live object (curl: 403, then 200 with the right proof). A re-store of a removed name without the receipt's proof gets 403 "This photograph was removed…" (curl). The token alone cannot plant a claim (`c:` only when `proved`). The `left` path finishes a cut-off removal only with the receipt's proof.
- **The sweep with a readable pointer.**
  - It deletes only what the pointer read under its own hold does not name, renews the hold before each delete, and gives back once (`g:<receipt>`).
  - An unreadable pointer is a `fault` and nothing is removed (`PointerUnreadable`).
  - The 7-night drop counts only nights with a fault, once per UTC day (`still.d === day`), and does not count held or young nights.
  - Age is judged from R2's `uploaded`, from the run's start, which only leaves more.
  - The only way I found for the sweep to delete a live generation is the stalled `point` in finding 2.
- **Cross-vault isolation.** Every sync route validates `vault` and `params` by regex, and keys are built from the authed id only. Counter objects are per vault (`bytes:<id>`), and holds and marks are per name inside them. No route returns another vault's keys or metadata. Proofs and `customMetadata` are never echoed.
- **Caching of private data.** Batch and photo GETs are `private, max-age=31536000, immutable`, and the URL carries the vault id. Listings, status and every refusal are `no-store`, or carry no `cache-control`, so the adapter does not store them. The service worker skips `/api/sync`. Species and home pages are `private` with `Vary`, and the hook's own cache key carries the build, corpus, units and hemisphere. The CSP uses hashes, not nonces, so a cached page is not a nonce leak.
- **Origin.** POSTs from `Origin: https://evil.example`, `Sec-Fetch-Site: same-site` or `cross-site`, `Origin: null` without the mark, and the encoded path `/api/%73ync/vault` are all 403 (curl). A form content type with no Origin is 403 from Kit's own check. There are no CORS headers anywhere, and no page actions.
- **Client address.** Only `CF-Connecting-IP` is used, through the adapter's `getClientAddress`. `X-Forwarded-For`, `X-Real-IP` and `True-Client-IP` are never read (grep). Under `wrangler dev` the header is client-set, as expected; in production Cloudflare overwrites it. IPv4-mapped (`::ffff:a.b.c.d`, any case) folds to IPv4. IPv6 is grouped to /64 and /48 with `::` expanded and leading zeros stripped.
- **Counting crash-consistency.**
  - Leases lapse and mark the total stale in one transaction.
  - `release` of a lapsed landed lease bumps `gen` and marks stale.
  - A removal holds a zero-byte lease from before its delete to its give-back.
  - `setBytes` and a base-carrying `take` refuse while any lease is live.
  - Address bytes go back on every failure path; a Worker killed between steps over-counts only until midnight or the next listing.
  - I found no path that under-counts permanently.
- **Reclaimed-vault admission.**
  - The sweep's `r:` note is written in the same transaction as the place's deletion and the decrement of `all`. A stale meta written back by a concurrent request (`writeMeta` is unconditional) loses `reclaimedAt`, but `r:` still forces a counted re-admission.
  - A place touched between `marked()` and the transaction is kept (it is re-judged inside).
  - Minor: a vault reclaimed while its meta still said `filled: false` comes back through `fill`, counted against that day's new-vault ceiling, and its `reclaimedAt` is cleared only at the next upload. This is harmless.
- **Upload limits.** `readBody` refuses an oversized declared length before reading, stops a chunked body at the cap, refuses a body longer than its declaration, and grows its buffer only as bytes arrive. The limits are 12 MB per photo, 16 MB per batch, and 1 KB per creation body. The per-vault 2 GB and per-address 3 GB a day are checked in the counter objects before the put, and the /48's 12 GB is checked too. Storage is bounded overall at about 2,000 × 2 GB.
- **Refusal words elsewhere.**
  - Forecast: `forecastRefusal` words a 429 (held or not) and a held 503 as "not asked", and reserve has its own sentence.
  - Picker: a 400, a 429 and a held 503 are "was not asked".
  - Search: a 429 is `{ limited }`.
  - Species 404: a held GBIF call is "this site held its call to GBIF back".
  - Import: `entriesFor` `null` falls back to search, and a search 429 is "unchecked".
  - Sheets under a manifest: a missing bucket file is a 503 refusal, never a derived empty bucket, and is kept refused for exactly the Retry-After (`REFUSED_S` 30, with the product miss at 30 s too).
  - The dossier route: a listed key that cannot be read is a 503.
- **Expensive requests.** A search is charged once per request as a whole-index search past 2,000 candidates, across the exact, near and retry passes. A missing posting file falls to `searchmiss` (60 per 10 minutes). Entries are at most 4 buckets, `reference`-limited. The sitemap is built once per index and cached a day by the adapter. `/api/rows` is unmetered but cheap: a slice of a per-index precomputed array, at most 200 rows. Outside calls go through one site-wide counter object, with address, network and reserve parts.
- **Not reproduced:** the "two concurrent DELETEs undercount" (the r63s test holds); a token-only claim or removal; any refusal of a sync write said as success.
