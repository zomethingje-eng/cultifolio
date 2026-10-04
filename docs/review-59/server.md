# Round 59 review: server (sync accounting, counters, hook, public API)

> **Withdrawn after verification (REVIEW-SELF-59):** the logging finding below read the sandbox's stale copy of `wrangler.jsonc`. The deployer's file on the PC, which is the one deployed, has `"observability": { "enabled": false }`. `/about/how`'s "the server does not log paths" holds for the deployed Worker.


Copy: /tmp/cf-r59-server. New tests: tests/unit/zz-review-server.test.ts (13 tests) and tests/unit/zz-review-engine.test.ts (1 test; the sync-engine harness with one new case). Copies in /tmp/review59/server/. All 14 pass on Node 22.22.2 and Node 24.21.0, so each one demonstrates its finding. With the existing sync-accounting, sync-hardening, sync-server, counters and hooks tests that makes 7 files and 86 tests, all passing on Node 22. Browser probe: /tmp/review59/server/origin.mjs (Chromium 1194 against the shared server on :4180). The live site was not reachable, so each claim about production is labelled as reasoning from the repo.

## Findings

### 1. P1: Request logging is on, but /about/how says "The server does not log paths" (confirmed in the repo, not checked live)
- `wrangler.jsonc:9` has `"observability": { "enabled": true }`. Workers Logs keeps an invocation record for every request, including its URL. That means `/plants/2026-0001`, `/api/search?q=…`, `/api/names?q=…`, `/api/forecast?lat=…&lon=…` and every `?vault=<id>` are kept, for days.
- `src/routes/about/how/+page.svelte:90` says: "The one thing the server keeps about a visitor is short-lived rate counters … The server does not log paths."
- This was reported in round 28 (REVIEW-ROUND-28.md:36) and again in round 29 (REVIEW-ROUND-29.md:26, "Request logging was still on"). It is still on at this commit. `tests/qa/round5-sync.probe.test.ts:287` even mentions it ("so in the Worker's request logs (observability is on in wrangler.jsonc)").
- Fix: set `"observability": { "enabled": false }`, or add the log and its retention to /about/how. Add a unit test that reads wrangler.jsonc and fails while observability is on and the page says it is off.

### 2. P1: A vault refused at the ceiling shows "push failed: 503", re-sends the batch every five minutes, and the server's sentence can be false (confirmed)
- Steps (zz-review-engine.test.ts): create a vault with nothing to push (meta `filled:false`), set `vaults:all` to 2000, add a plant, then `sync.run()`.
  - `sync.lastError` is `push failed: 503`. The sync page shows "Not synced / push failed: 503", not the server's sentence.
  - A second `run()` POSTs the batch again.
- Causes:
  - `engine.svelte.ts:682` (and `:627` for photographs) handles 400/409/413/429/507 but not 503. It throws a bare status, sets no `retryAfterMs` and ignores `Retry-After: 86400`.
  - The engine runs on every focus and every 5 minutes (`IDLE_PULL_MS`, line 127), so the device retries forever.
  - Each retry uploads the whole body: `routes/api/sync/log/+server.ts:38` and `photo/[id]/+server.ts:32` call `readBody` before `storeOnce` → `admitVault`. A first sync from an imported backup can be a batch of up to 16 MB, sent again every five minutes on mobile data.
- The `VaultsClosed` doc comment (`sync.ts:718`) says "Answered 503 with the sentence the sync page shows". The page does not show it.
- The sentence itself is wrong in one case (zz-review-server.test.ts, "a vault whose first count failed"):
  - If `fill` throws on the first uploads, they are stored anyway: five objects stored, `all` still 0 (`sync.ts:759-762`).
  - Once the ceiling is met, the next upload is refused with "this vault holds nothing yet", although it holds five photographs.
- /about/formats documents the 503 for creation only. It does not mention that a joined but empty vault's first push is refused.
- Fix:
  - In the engine, treat 503 like 429: read the JSON `error`, honour `Retry-After`, and show the sentence.
  - Run `admitVault` before `readBody`. It needs only the meta.
  - Word the refusal "this vault has not been counted yet". Or count a vault whose `fill` failed at its next upload even past the ceiling, since it already holds objects.

### 3. P1: About 200 POSTs a day block every new grower's sync; ten days of that close it for good (confirmed with the real counter class)
- 40 IPv4 addresses × 5 creations spend the day's 200 (`counters.ts:43-61`). A real grower then gets `day` until UTC midnight.
- The same works from 10 IPv6 /48s × 20. A free tunnel-broker account gives a /48. Test: "the day's ceiling (200) is spent by 40 addresses…".
- Empty creations spend the day ceiling because `day:` counts every creation. Round 58 moved only `all` to first-object time.
- One ~100-byte upload per vault takes its place in `all`. `all` never goes down: log batches cannot be removed and abandoned vaults are never reclaimed. 2,000 places are therefore gone in 10 days of the same script, and sync is closed to new growers until the operator raises `SYNC_VAULTS_MAX`.
- On launch day this costs a hostile reader 200 tiny requests.
- Fix:
  - Count `day:` at first object too, as `all` is.
  - Give back a creation's day slot if the vault is still empty after N hours.
  - Consider a far larger `all`, or reclaiming vaults with no request in 90 days.

### 4. P2: Opening a vault re-lists all of it on every request, and the `sync` bucket has no /48 window (confirmed)
- `routes/api/sync/vault/+server.ts:65` calls `vaultBytes(…, force=true)` on every join or open, which runs `recount`: up to 50 list pages for `log/` and 50 for `photo/`.
- `GET /api/sync/log` walks the whole `log/` prefix on every pull (`listBatches`, `sync.ts:243-259`).
- `sync` is not in `UPSTREAM` (`sync.ts:911`), so it is counted per /64 only.
- Test "opening a vault walks its whole listing": a vault of 20,000 batches costs 21 R2 list calls per POST. Twenty POSTs from twenty /64s of one /48 all answered 200, for 420 list calls.
- Cost at 50,000 batches:
  - About 100 class-A operations per 200-byte request.
  - From one IPv4 address at 600 per 10 minutes, about 8.6M list operations a day, roughly $39/day at $4.50 per million.
  - From rotating /64s the only bound is the attacker's request rate.
- Building such a vault takes about 14 hours of 600-per-10-minute pushes from one address, or less with rotation.
- Fix:
  - Do not force a recount on open if the counter object recounted within the last hour (store the time in the vault object).
  - Add `sync` to the /48 windows.
  - Longer term, the arrival-named listing already noted in the code (round 12, 10).

### 5. P2: In-flight bytes (`p`) that are never released inflate the vault's count for good (confirmed)
- Only `release` lowers `p` (`counters.ts:114-122`). Each day's first recount then adds the stale `p` back:
  - `setBytes` (`:124-127`)
  - `take` with a base (`:77`, `base + pending`)
- `storeCounted` swallows a failed release (`sync.ts:443`, `.catch(() => {})`). A Worker killed between `take` and `release` (deploy, eviction, client disconnect) also skips it.
- Test "a release that throws once…": one 1 MB upload whose release threw left `p = 1,000,000`. On the next three days `v` exceeded the bytes in R2 by exactly 1,000,000 each day.
- Test "enough stuck reservations…": nine stuck 10-byte takes under a 100-byte limit refuse a 20-byte upload weeks later, with the bucket empty (`{ ok:false, before: 90 }`, so a 507 "vault full").
- Fix: hold each reservation as its own key with its time, e.g. `p:<uuid> → { n, at }`. Count only those younger than the longest upload (180 s client timeout plus slack), and delete older ones at the daily sweep.

### 6. P2: HEAD, `?was=` and `__data.json` render species and home pages with no cache and no limit (confirmed)
- `hooks.server.ts:105` uses the page cache only for `GET`. `HEAD /` and `HEAD /species/welwitschia-mirabilis` answer with no `x-cultifolio-page` header; `GET` answers `held`.
- Timing, 40-request runs on the fixture corpus (on this loaded machine):

  | Request | Run 1 | Run 2 |
  |---|---|---|
  | `GET`, held | 61 ms average | 43 ms average |
  | `HEAD` | 471 ms average | 133 ms average |

- `?was=<anything>` is deliberately not held (line 24). `/species/<slug>/__data.json` is never held. Both re-render on every request; curl confirmed neither carries the header.
- Each species render reads the dossier and the genus record from R2 (`species/[slug]/+page.server.ts:66,86`). None of these paths is rate-limited.
- A HEAD request also lets the sender skip downloading the body, so it is cheap to send and costly to answer.
- Fix:
  - Serve HEAD from the held copy, matching under the GET key and returning headers only.
  - Rate-limit uncached renders and data requests under `reference`, or hold `?was=` pages keyed by the validated old name.

### 7. P2: An R2 error at the minute's check makes every page and API fail, even though the isolate holds a good corpus (confirmed)
- `dossiers.ts:122`: when the minute is up, `store.head(watched)` throws and `loadIndexNow` rejects without touching `cached`.
- Every request retries the head and fails. The hook catches it (`hooks.server.ts:117`), but the page load then calls `corpusNow` again and gets a 500.
- Pages already in the Worker's cache are not served either, because the cache key needs the corpus id.
- Test "the corpus when R2 blips": after a good load, a throwing head 61 s later makes `corpusNow` reject with "R2 internal error".
- Fix: on a failed head (or a failed get after a changed etag), keep serving `cached`, set `cached.at = Date.now() - CACHE_MS + 10_000` to retry in ten seconds, and log once.

### 8. P2: `readBody` still holds the full declared length after one byte (confirmed)
- Round 59 says "readBody allocates on the first chunk, not before a byte arrives". One byte is the first chunk.
- Test: `Content-Length: 12 MB`, one byte sent, then the stream stalls. `process.memoryUsage().arrayBuffers` grows by more than 11 MB while the read waits.
- A token-holder (anyone can make a vault) can hold 12 or 16 MB per stalled connection with one byte each. A few such connections press an isolate's 128 MB that other users' requests share.
- Fix: grow the buffer as bytes arrive (doubling, capped at the declared length). Or gather chunks and join once, which costs at most twice the bytes actually received.

### 9. P3: `/api/index` and three other buckets have no /48 window (confirmed)
- `UPSTREAM` (`sync.ts:911`) leaves out `index`, `sync`, `syncobj` and `sheets`.
- Test: 200 `/api/index` calls from 200 /64s of one /48 in one window were all allowed. One /64 is allowed 6.
- Each answer is `JSON.stringify` of the whole index: measured 1.9 MB and 18 ms per call at 8,947 entries of the fixture's shape, and about 4 MB per the docs.
- Fix: add `index` and `sheets` (and `sync`, see 4) to the /48 set.

### 10. P3: Two removals on a day with no row yet give one object's bytes back twice (confirmed)
- `deleteCounted` (`sync.ts:85`): the first DELETE of the day finds no row and recounts (`force`) without recording a `g:` token. A second DELETE of the same object that looked before the first deleted then finds today's row and gives the bytes back again.
- Test: `v = 0` while R2 holds 1,000 bytes. The vault is under-counted until the next day's recount, which is bounded but contradicts "given back once".
- Fix: record the token on the recount path too, e.g. `give(…, 0, day, token)` after `setBytes`.

### 11. P3: A DELETE racing a PUT of one photograph name answers the PUT from an object that is then removed (confirmed at `storeOnce` level)
- DELETE heads the object, PUT heads it too and returns `same` ("already there", 200), then the DELETE removes it (`r2.delete` is unconditional, `sync.ts:71`).
- The device marks the photograph pushed while the server holds nothing. A third device then never gets the pixels.
- This needs a removal and a revival (`noteRevived`) of one photograph at once on two devices.
- Fix: after the delete, head again and give nothing back if an object with a different `uploaded` is there. Or have the engine re-verify (HEAD) photographs it revived.

### 12. P3: `/api/names` and `/api/forecast` 500 when the Cache API throws (confirmed for names)
- `names/+server.ts:42` and `forecast/+server.ts:43` call `cache.match` with no `.catch`. The hook already guards its own match (round 49, 2). Test: a throwing `match` rejects the handler.
- Fix: `.catch(() => undefined)` on both.

### 13. P3: A same-origin form POST is refused by `_foreignWrite` (confirmed in Chromium)
- Under `Referrer-Policy: no-referrer`, Chromium sends `Origin: null` with `Sec-Fetch-Site: same-origin` for a navigation POST. The probe's form post to `/api/sync/vault` got 403.
- `fetch` (cors and no-cors), `sendBeacon` and a `referrerPolicy:'no-referrer'` fetch all send the real origin and pass.
- No form posts exist today, so nothing breaks now. Any future form action would fail.
- Fix: in `hooks.server.ts:84-87`, return `false` when `Sec-Fetch-Site` is `same-origin` or `none`, and fall back to `Origin` only when the header is absent.

### 14. P3: Missing security headers, and a CSP image rule wider than the privacy page (confirmed on :4180)
- No `Strict-Transport-Security`, `X-Content-Type-Options: nosniff` or `Permissions-Policy` on any response: dynamic pages, `_headers` pages, API.
- HSTS may be set at the Cloudflare zone; that cannot be checked from here.
- The app needs `geolocation=(self)` (Today, settings, place page) and `camera=(self)` (sync key scanner). Everything else can be `()`.
- CSP `img-src 'self' data: blob: https:` allows any https host, while /about/how lists three image hosts. Naming `inaturalist-open-data.s3.amazonaws.com upload.wikimedia.org api.gbif.org` would make the browser enforce rule 4.
- frame-ancestors, X-Frame-Options and Referrer-Policy are present everywhere, including prerendered pages (meta CSP plus `_headers`).

### 15. P3: Comments say the edge caches reference answers that Workers do not cache (suspected)
- These comments claim edge caching:
  - `entries/+server.ts:16` and `dossier/[key]/+server.ts:8`: "An answer the edge holds never reaches here".
  - `search/+server.ts`: "cached at the edge, so only unique queries reach here".
- A Worker's own response is not cached by Cloudflare's CDN. `sheets/+server.ts:14` says so itself and uses the Cache API for that reason. So every entries, dossier, search, rows and index request runs the Worker and counts against its bucket.
- The bucket sizes were reasoned on the opposite assumption.
- Fix: correct the comments, or put these through `caches.default` the way sheets does.

### 16. P3: No global cap on calls to MET Norway and GBIF (suspected)
- `forecast` is 60 per 10 minutes per /64 and 240 per /48. Each new 0.01° cell is one MET call under the site's User-Agent.
- About 1,000 rotating IPv4 addresses (a proxy pool) give about 100 calls a second. MET's terms allow 20 a second per application, so the likely result is the User-Agent being blocked: the frost watch then says "not checked" for everyone.
- Fix: a per-isolate or Durable Object token bucket on upstream calls in all.

## Checked and sound
- Twenty concurrent first uploads count one vault (existing test). `f:` keys stop at the ceiling, so the "vaults" object's storage is bounded by `SYNC_VAULTS_MAX`; test: 50 fills under max 10 leave 10 `f:` keys. The vault ids it keeps are no more than R2 already holds.
- The give token: remove and re-upload of identical bytes gets a new token because `uploaded` differs (test with MD5 etags and per-put times; both removals gave back, `v` equals the R2 bytes). Ten concurrent DELETEs with a row present give back once (existing test).
- Retention in code:
  - `ip:`, `net:`, `day:`, `d:` and `g:` keys are swept at UTC midnight, keeping today and yesterday (at most 48 h).
  - KV `rl:` keys live 20 minutes; `vaults:`/`ipbytes:` KV keys expire at `endOfNextDay`.
  - Logs (finding 1) are the exception.
  - Suspected: emptied `ipbytes:<address>` objects are not `deleteAll()`ed. They hold nothing, but `deleteAll()` would end them outright.
- Rate-limit paths: an encoded path routes to the same handler and the same bucket; the hook's decoded page-cache key shares the canonical copy (`/species/%77elwitschia-mirabilis` and `%2d` are `held`, uppercase is a 301, bad escapes are 400 or 404 and never stored). `q`, `b` and `after` are bounded before use. The client address comes from `cf-connecting-ip`.
- Error answers: API refusals are JSON `{message}` or `{error}` with no stack. Only 200 HTML (hook), a successful names or forecast answer, or a sheet bucket built under the current corpus id are ever put in `caches.default`, so no 500 can be held. Kit 4xx and 5xx carry no `cache-control`, but Worker responses are not edge-cached and these statuses are not heuristically cached by browsers.
- Creation: the 503 sentences reach the sync page; `onlyIf` makes two concurrent creations answer `created` once; a counter object that does not answer is `unavailable`, never a count of zero.
- `_foreignWrite` covers every path and method except GET, HEAD and OPTIONS; `/api/%73ync/vault` is covered by the existing test.
