# Round 60 self-review: server

Covered: `src/lib/server/sync.ts`, `counters.ts`, the load and refusal paths of `dossiers.ts`, `hooks.server.ts`, every `src/routes/api/**` route in the brief, `_headers`, the CSP in `svelte.config.js` and `src/service-worker.ts`, against the nine questions in the brief and section 3 of `REVIEW-PROMPT-60.md`.

How:
- **Code read.** Every line of the scope, plus the parts of `engine.svelte.ts` that answer the server (`push`, `dropRemoved`, `refusedBy`), `removedPhotos` in `collection.svelte.ts`, and the clock rules in `hlc.ts`.
- **Baseline.** The eleven server test files (server-r60, hooks-r60, counters, r60-review-server, r60-proposed-server, sync-accounting, sync-hardening, sync-server, hooks, names-api, forecast-api) pass: 144 tests, Node 22, in my copy `/tmp/r60rev/server`.
- **Mutations.** 18 single-line reverts of round-sixty fixes, each run against its test files. 14 were caught and 4 survived (item 10). All sources were restored and checked by md5.
- **Curl.** About 45 requests to the shared server on 127.0.0.1:4173, for headers, odd addresses, error bodies and redirects.
- **Browser.** One Playwright Chromium run to read the headers a same-origin sync request really carries.
- **New tests.** Five files under `/tmp/r60rev/out/tests/`: 30 tests in all. 9 are reproductions that FAIL on 21257b7 and 21 are guards that pass. There is also a prototype fix, `server--fix-photo-removal.diff`; with it applied, all four photo-removal tests pass.

The headline: the photograph removal's new "newer upload" rule is wrong in the commonest case it meets. When a photograph's first upload lands after another device already removed its record, the bytes stay for good: the server answers 409, and the engine takes a 409 as final. Everything else in the round's server work held up under test: leases, generations, fail-closed admission, holds, readBody, the origin rule, the 301s and the headers. A few smaller gaps are listed below.

## Findings

### 1. P1, confirmed. A photograph whose upload lands after its removal is never removed from the server

**Where:**
- `src/lib/server/sync.ts:74` and `:79` (`deleteCounted`): the claim check and the R2 `uploaded` check.
- `src/lib/server/sync.ts:629` (`storeOnce` records a claim).
- `src/lib/sync/engine.svelte.ts:1007` (a DELETE 409 is pushed onto `photosDropped`).

**What happens:** The rule says that an object whose R2 upload time, or last claim, is later than the removal's `X-Photo-Removed-At` is "a newer generation". It answers 409. That is true of a revival, but just as true of the photograph's one and only upload arriving late. And it arrives late as a matter of course: `push` sends every batch first and then the photographs one at a time, so on a phone's first sync of a few hundred photographs the photo record reaches other devices many minutes before its pixels do. A sequence with correct clocks:
1. Device A adds a photograph offline.
2. A comes online and pushes the batch. B pulls it.
3. The grower removes the still-blank photograph on B at time R.
4. A's upload of that photograph lands at U > R.

Ten minutes later B's DELETE carries R and gets 409. The engine marks the id dropped and never asks again. When A folds the removal, its DELETE carries the same R (the `_deleted` stamp's wall time) and also gets 409 and also marks it dropped.

No device ever removes those bytes. They stay counted against the vault for good, which breaks `/about/how`'s "A photograph you remove is removed from the server too". Even a device that did ask again is refused for ever, because R2's own upload time stays after R once the claim is swept.

The same thing happens in three other ways:
- **A slow PUT.** The hold is taken only after the body has been read (the route calls `readBody` before `storeOnce`). So a DELETE that arrives during a 90-second upload finds nothing, answers 404 (which the engine treats as done), and the upload lands afterwards.
- **A slightly slow device clock.** A device less than 30 s slow is never corrected (`TRUST_SERVER_PAST_MS`). If it removes a photograph within that skew of the photograph's upload, its R is before U.
- **Any honest re-PUT.** A re-PUT that answers "already there" (a lost reply) records a fresh claim.

**What it should do:** Only a revival (an upload that stores a name after a removal of it) should block an older removal. And a 409 should not be final on the device.

**Reproduction:** `server--photo-removal.test.ts`, "REPRO: a photograph whose first upload lands after another device removed its record is never removed". It fails today: the DELETE is `'newer'` at U+11 min, and still `'newer'` at U+3 days after the claims are swept.

**Smallest fix:** These three changes together are self-healing within two days. They are prototyped in `server--fix-photo-removal.diff`, and all four photo tests pass with it.
1. Drop the R2 `uploaded` comparison (sync.ts:79) and decide by claims alone.
2. In the engine, treat a DELETE 409 as "ask again on a later run" (do not push it onto `photosDropped`). A genuinely revived photograph is live, so the device stops asking. A late first upload is removed once its claim is swept after two days. The S agent asked for exactly this ("Needs from others", 4); the merge did the opposite.
3. Record a claim only for an upload that proves the key (finding 2).

The existing test "the DELETE route answers a newer upload with 409" (server-r60.test.ts:224) asserts the R2 check and must change with fix 1. A stricter variant: record `c:` only when an upload *stores* a name the vault object has a removal receipt (`g:`) for, so a first upload never claims at all.

### 2. P3, confirmed. The bearer token alone can make a removed photograph undeletable

**Where:** `sync.ts:618` and `:629`. `storeOnce` answers `'same'` by the sha alone, and `withHold` records a claim for any `'same'`, whatever `x-photo-drop` the request carried.

**What happens:** The token reads ciphertext. A holder of the token without the key can GET a photograph and PUT the same bytes back with any 64 hex digits as the proof. That is "already there", plus a claim at that moment. The owner's DELETE, which carries a removal time before that claim, gets 409, and the engine never asks again (finding 1). So "the bearer token alone, which can add to a vault, can never destroy in it" still holds, but the token can now veto a key-holder's removal.

**Reproduction:** `server--photo-removal.test.ts`, "REPRO: a holder of the bearer token alone…". The DELETE returns `'newer'`.

**Fix:** Claim on `'same'` only when the stored object's `drop` equals the request's (in the diff).

### 3. P3, confirmed. Without the proof, the 409/403 split tells when a photograph was uploaded

**Where:** `deleteCounted`, sync.ts:74 to 83. The `'newer'` tests run before the proof check.

**What happens:** A token-only caller sends a DELETE with a wrong proof and searches over `X-Photo-Removed-At`. A 409 means "uploaded or claimed after t"; a 403 means "before". A binary search found the upload's millisecond in 27 requests. Each probe also takes the photograph's hold, so it briefly makes the owner's PUTs answer busy.

**Reproduction:** `server--photo-removal.test.ts`, "REPRO: without the drop proof…".

**Fix:** Check the proof first (in the diff).

### 4. P2, confirmed. One host spends the site's whole minute of outside calls in a second, and every visitor is told the source "did not answer"

**Where:**
- `sync.ts:986` and `:1101` (`RATE.upstream`, `upstreamAllowed`).
- `api/names/+server.ts:48`, `api/forecast/+server.ts:129`, `synonyms.ts:68`.
- The wording at `species/[slug]/+page.server.ts:74`, `SpeciesPicker.svelte:233-234` and `weather/client.ts:141`.

**What happens:**
- **The cost.** Per ten-minute window, one IPv4 address may make 420 outside calls (names 300, forecast 60, match 60), and a /48 may make 1,680. Windows are fixed and aligned for every address, so all of it can go in the first second of a window. The site's cap is 600 a minute, or 6,000 per ten minutes, so 15 IPv4 addresses or 4 IPv6 /48s keep it shut continuously. One /48 shuts it for about three minutes in every ten. In the test, two /64s of one /48 spent all 600 in the first second.
- **What other visitors see.** While the cap is spent:
  - the frost watch gets a 502 "forecast source did not answer" and shows "the forecast could not be reached just now";
  - the picker says "The name service did not answer";
  - the species 404 says "GBIF's name service did not answer".

  None of these is true: the site refused itself and the source was never asked. Rule 2 asks that a refusal be said as a refusal. "Not checked" is the right category, but the stated cause is wrong. `/about/how` does not mention the cap at all.
- **Not really site-wide.** The cap is counted per isolate. Each isolate reads the KV window once, counts in memory and flushes once a second. KV reads are cached up to a minute per location, and KV takes one write a second per key, which every isolate's flush exceeds. The reproduction shows two isolates that open the minute before either flushes each allowing the full 600 (1,200 in all).

**Reproduction:** `server--upstream-cap.test.ts`. Two reproductions fail: the innocent visitor's forecast is a 502 "did not answer", and two isolates pass 1,200 calls. A guard spells out the arithmetic.

**Fix:**
- Answer a cap refusal as 503 with `Retry-After` to the next minute and a sentence that says the site held the call back ("not asked: this site's calls to MET Norway are used up for this minute; asked again shortly"). Have the frost line, the picker and the 404 say that.
- Count the cap in the existing counter object (one `upstream` object), not KV, if 600 is meant as a real ceiling.
- Lower the per-address share. For example, charge `names` against the cap only after a debounce, or cap one address's share of the minute at about 10%.

### 5. P3, confirmed. Two first uploads, one failing: `unadmit` gives the place back while the other is landing, and the vault then holds an object uncounted

**Where:** `sync.ts:924-939`. `unadmit`'s "does the vault hold anything?" listing is not atomic with a concurrent upload.

**What happens:**
1. A and B both read `filled:false`.
2. A's `fill` counts the vault. B's answers `'already'`.
3. A's R2 write fails. A's `unadmit` lists, finds nothing (B's write is in flight), calls `unfill` (`all` −1, `f:` deleted) and writes `filled:false`.
4. B lands, and its `flushMeta` writes `filled:true` back.

The vault holds an object, its place has been given back, and no later upload calls `fill` again. It needs an R2 error during a concurrent first upload, so it is rare and bounded (one place).

**Reproduction:** `server--admission.test.ts`, "REPRO: two first uploads at once, one fails…". It ends with `{ all: 0, f: false }`.

**Fix:** Either of these:
- `unadmit` asks the vault's byte object for live leases (`p:`) and keeps the place if any remain. A's own lease is already released by then, so any remaining lease is another upload's.
- A request whose `fill` answered `'already'` calls `fill` once more after its write lands (it answers `'already'` if the place stands, `'counted'` if it was given back).

### 6. P3, confirmed. A Worker stopped after admission and before the write keeps the place while the vault holds nothing

**Where:** `admitVault` (sync.ts:914-915) writes `filled:true` before the body is read. If the isolate dies there, the vault object holds `f:<id>` and the meta says filled. No later request ever calls `fill` or `unfill` for that vault again, so a vault that never stores anything holds a place for good. That contradicts "a vault made and never used takes neither".

**Reproduction:** `server--admission.test.ts`, "REPRO (P3): a Worker killed after admission…".

**Fix:** Write `filled:true` only after the first object lands (in `flushMeta`'s write), so a dead request leaves the meta unfilled. Or keep `f:` as `{ day, landed:false }` until a landing, and have the midnight sweep give back entries that are a day old and never landed.

### 7. P3, confirmed. The KV fallback (no Durable Object) counts one vault twice and does not give back the day

**Where:** `admitVault` KV branch, sync.ts:900-907, and `unadmit`, sync.ts:930-932.
- Two first uploads that read an unfilled meta both add one to `vaults:all`: there is no per-vault record, as `f:` is in the object.
- `unadmit` takes `vaults:all` back but leaves `vaults:all:<day>` at +1.

Production binds the object, so this matters only for a deploy without the migration.

**Reproduction:** `server--admission.test.ts`, the two "KV fallback" reproductions. They end with `'2'` and `['0','1']`.

### 8. P3, read. Under abuse by a token-holder, a vault's counter object grows past what its midnight sweep can list

**Where:** `counters.ts:296-310`. `sweep` calls `storage.list({ prefix })` with no limit, and loads every `c:` claim and every `g:` receipt into memory at once.

**What happens:** A holder of the token sets the proof on its own uploads, so it can PUT and DELETE tiny photographs. From one /48, `syncobj` allows 12,000 requests per ten minutes, which is about 864,000 claims plus 864,000 receipts a day, each kept up to 48 hours. That is roughly 3.5 million keys and around 450 MB in one object. The sweep's list then runs past an isolate's 128 MB, the alarm fails, the keys are never swept, and that vault's counter (and so its uploads, which fail closed) stops answering. The damage stays in the abuser's own vault; the cost lands on the operator.

**Fix:** Sweep in pages (`list({ prefix, limit: 1000, start })`) and re-arm if a page was full. Optionally cap claims per vault per day.

### 9. P3, confirmed by curl. The `/benches` and `/sowings` 301s carry none of the security headers

**Where:** `hooks.server.ts:115`. `redirect()` is thrown before `policy()` runs, so `curl -D - /benches/x?y=1` answers 301 `Location: /places/x?y=1` with no HSTS, nosniff, Referrer-Policy or X-Frame-Options. Every other answer checked carries them, including Kit's own 400 for `/species/%ff`.

**Fix:** `return policy(new Response(null, { status: 301, headers: { location } }))`.

### 10. P3, confirmed. Four round-sixty paths no test holds (mutation survivors)

Each line below was reverted and the round's server tests still passed (counts are tests run against that mutation):

| Mutation | What was reverted | Tests passed |
|---|---|---|
| M9 | `synonymOf` ignores the upstream cap | 39 |
| M10 | the names route ignores the cap | 41 |
| M13 | `c:` dropped from `SWEPT`, so a vault object holding only claims is never swept again | 53 |
| M15 | the KV `unadmit` does not give `vaults:all` back | 86 |

My guards catch the first three: `server--cap-guards.test.ts` (all pass on current code; re-run against each mutation, each caught). My KV reproduction in `server--admission.test.ts` covers the fourth once the day is given back too.

Harness note: under load, "every bucket that costs a call upstream … stops a /48 at four times one address" (server-r60.test.ts:362) took 26 to 52 s and failed on the 20 s test timeout twice during the mutation runs, both times for reasons unrelated to the mutation. It needs its own timeout, or fewer iterations.

## Checked and sound

**The removal-time header (question 1).**
- `removedAt` refuses non-digits and anything more than five minutes ahead.
- A key-holder can always remove: omitting the header bypasses the "newer" rule, which only protects honest devices, as intended.
- No value moves the byte counts: give-backs are once per R2 version receipt.
- A future value cannot remove a newer upload beyond what omitting the header already allows.

Guard: `server--photo-removal.test.ts`, the GUARD test.

**Admission (question 3).**
- Twenty concurrent first uploads count the vault once and the day once (guard).
- A first upload refused by `VaultFull` gives back the place, the day and `f:`, and writes `filled:false` (guard).
- `fill` before the body is read, `VaultUnchecked` on a throw or `unavailable`, `VaultsClosed('day')` with Retry-After to midnight: all hold, as do the route-level `unadmit` and storeCounted's own.
- A join while closed is told truly that the vault "holds nothing yet".

**Leases and recounts (question 4).**
- The lease and the hold are both taken after `readBody`, so a slow phone upload never holds a lease or a hold during its transfer. A lease spans only the R2 put of an in-memory body, so a ten-minute lapse would need a ten-minute R2 put. The flip side, an unheld name during the transfer, is part of finding 1.
- `gen` cannot livelock: the second try passes `gen = null` in both `vaultBytes` and `storeCountedNow`, so there are at most two listings.
- A lapsed lease drops its key and keeps its bytes in `v` until the next listing. That over-counts by one upload, bounded and safe.

**Durable Object and KV keys (question 5).**

Every key kind written and what sweeps it:
- `ip:`, `net:`, `day:`, `d:`, `g:`, `c:`: the midnight alarm, after at most 48 hours.
- `p:`: ten minutes, by `take`, `setBytes` and the sweep.
- `h:`: 60 s, or the sweep.
- `all`, `f:<vault>`, `v`, `gen`: kept for good (`f:` is disclosed on `/about/how`).
- KV `rl:`: 20 minutes. `ipbytes:` and `vaults:<ip>:<day>`: the end of the next day.

Every writer of a swept key reaches `wake` (`unhold` writes `c:` only after `hold` set the alarm). No address key outlives 48 hours. I found no address or vault id kept longer than `/about/how` says.

Creation itself no longer counts `day:`, so empty vaults (one `meta.json` each) are bounded only by 5 per address and 20 per /48 per day. That is a decision recorded in the S report, noted here because it leaves the number of empty vaults made per day uncapped across many addresses.

**The origin rule (question 6).** Chromium's same-origin fetch POST and DELETE, from a page under `no-referrer`, carry the real Origin and `Sec-Fetch-Site: same-origin`. The null-origin rule applies only to requests that are not CORS mode, so old Safari's fetch sends the real Origin too. Accepted or refused as they should be:
- **Accepted:** the installed app, Safari 15 without `Sec-Fetch-Site`, a form under `no-referrer`, curl with neither header, and `Sec-Fetch-Site: none`.
- **Refused:** cross-site with or without `Origin: null`, a same-site sibling, and `http:` to the `https:` site.

The service worker never touches a non-GET request. A page cannot set or strip `Sec-` headers. Guard: `server--origin.test.ts`, 14 cases.

**The species 301 (question 7).**
- `slugify` is idempotent, so there is no loop.
- The Location is always `/species/<[a-z0-9-]+>` plus the raw query: no open redirect, and `%2F%2Fevil.com` and `%5C%5C` both become `evil-com`.
- CR/LF stays percent-encoded in the query.
- `a%2Fb` gives `a-b`. `..%2F..%2Fplants` gives `/species/plants`. `%2E%2E` is resolved by the URL parser to `/` before routing.
- `%ff` is Kit's 400, with headers.
- Redirects and 404s are never stored in the page cache (only 200 HTML is), and the held key's inputs are bounded.

**Headers (question 8)**, by curl on 4173 and by the unit harness:
- CSP, HSTS, nosniff, Permissions-Policy and XFO are on rendered pages, API answers, 4xx and 5xx.
- The prerendered pages carry them from `_headers`, with the CSP as a meta tag.
- `X-Robots-Tag: noindex` is on `/plants`, `/plants/<n>` and its `__data.json`, `/sync/__data.json` and `/offline`, and is absent from species and the home page.
- 5xx answers are `no-store`. The page cache holds only 200 `text/html` with no Set-Cookie.
- `/maps/*` is a day's cache, and the img-src list matches the code.

**Question 9.**
- `readBody` grows from min(declared, 1 MB) by doubling, never past the declared length or the cap. Chunked bodies grow the same way. A longer-than-declared body is a 400. Admission runs before the body is read.
- HEAD hits answer headers only. A HEAD miss is rendered, counted under `render` and not stored.
- `/api/dossier`: 400 for a non-integer, 404 for an unlisted key, 503 with Retry-After for a listed key that cannot be read or an R2 throw, and always `no-store`.
- Error bodies are Kit's `{ message }`, with no stack seen.
- The corpus load keeps a held corpus on R2 errors, retries after 10 s, and answers 503 rather than the fixture with nothing held.

**Mutations of the round's server fixes.** 14 of 18 were caught (M1 to M8, M11, M12, M14, M16 to M18): claims, the R2 newer check, unadmit's listing, `removedAt`'s bound, 5xx no-store, hold expiry and tokens, a busy hold, the landing gen bump, private noindex, the claim sweep, the unfill day, HEAD, and readBody's growth.

## Not re-reported

`observability.enabled: true` in the sandbox's `wrangler.jsonc` was withdrawn in REVIEW-SELF-59 (the deployed copy differs). It is still in the sandbox's copy.
