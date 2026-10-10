# Round sixty-seven, agent S: report

Working copy `/tmp/r67/S`. Items S1 to S10 of `REVIEW-TRIAGE-66.md`, all done on the server side. The client and about-page halves are written as needs in `/tmp/r67/S-needs.md`, each a unified diff against `/tmp/r67base`, or an exact sentence change. That file opens with the server's answer shapes, for P's S8 work on sheets and entries.

## Files changed (mine)

- `wrangler.jsonc`: only `"observability": { "enabled": false }`.
- `src/lib/server/sync.ts`, `src/lib/server/counters.ts`, `src/lib/server/photogen.ts`, `src/lib/server/synonyms.ts`
- `src/lib/server/build.ts` (new)
- `src/lib/sync/engine.svelte.ts`: two lines plus one method.
- Routes:
  - `src/routes/api/sync/{photo/[id],log,vault}/+server.ts`
  - `src/routes/api/{forecast,names,search,rows,entries,sheets,index}/+server.ts`
- `docs/DEPLOY.md`: three new subsections at the end of section 3.
- Tests:
  - New: `tests/unit/r67s-server.test.ts` (23 tests) and `tests/unit/r67s-engine.test.ts` (2 tests).
  - Changed: the shared stand-in `tests/unit/helpers/fake-sync.ts`.
  - Updated to the new behaviour (my code's tests): `counters.test.ts`, `forecast-api.test.ts`, `r60-review-server.test.ts`, `r62bs-forecast.test.ts`, `sync-server.test.ts`.

## How "fails on the base" was shown

I copied `/tmp/r67base` (src, tests, configs) to a scratch directory, with `node_modules` linked, added my two test files to that copy, and ran them there.

- `r67s-server`: **21 of 23 FAIL on the base**. The two that pass are guards: a counter object that cannot be asked lets a listing go, and old photograph ids are accepted.
  - That run used the version of the file that imported the routes inside the tests.
  - The final file imports them at the top, so that a loaded machine does not time out the first import. Against the base it therefore fails to load at all, because the base has no `src/lib/server/build.ts`.
- `r67s-engine`: **2 of 2 FAIL on the base**:
  - "pull failed: 503" in place of the server's sentence;
  - "photo …: 503" stopping the run.

## Per item

**S1. An unreadable pointer (S-D1, R45-21).**
- What changed:
  - `runPhoto` throws `PhotoBusy` when the pointer is unreadable, so the upload waits as a removal does.
  - New `photoObjectAt` and `pointerUnread`: GET and HEAD answer 503 with `Retry-After: 10` and a sentence, never 404.
  - The engine skips a photograph GET answered 503 for this run; it used to throw and stop the run. Its HEAD check already asked again.
- Tests: D7 turned round (a token-only PUT after one failed pointer read gives `PhotoBusy`, and nothing is stored or moved); GET and HEAD give 503; the engine test for a photograph answered 503. All FAIL on the base.

**S2. Workers Logs (S-F1).**
- What changed:
  - Observability is off. A seam test parses `wrangler.jsonc` as JSONC and fails while `observability.enabled`, `logs.enabled` or `logs.invocation_logs` is true.
  - The error signal is kept as counts. `Counters.fault(kind)` keeps `e:<day>` → `{ kind: n }` in the "vaults" object for a week, mirrored to KV as `ops:faults:<day>`.
  - The kinds are a fixed list (`FAULTS` in sync.ts). They carry no address, path or id.
  - `noteFault` is called beside every `console.error` that matters in sync.ts. The counter object counts its own reclaim and sweep faults.
  - DEPLOY says how to read the counts.
- Tests: the seam test, the counting and its week, and `noteFault`. All FAIL on the base.

**S3. The stalled revival (S-D2, R45-21).**
- What changed:
  - New `photogen.repoint()` writes the pointer back with a fresh `n`, under `etagMatches`. The fresh `n` matters: R2's etag is the MD5 of the body.
  - Both the sweep (`sweepPhoto`) and the Worker's `dropStrays` call it before deleting any unnamed generation.
  - A stalled `point()` therefore fails its condition. The upload's existing fallback takes off its generation and answers busy.
  - `runPhoto` now gets `fence` and calls it just before its pointer write. If the hold is lost, it takes its own generation off and answers busy.
  - After `dropStrays` writes the pointer back, `runPhoto` reads it again, so its own conditional write is not refused.
- Tests: D1 adopted (the alarm runs while the pointer write hangs; the device is told busy, and the pointer never names missing bytes); the fence test. Both FAIL on the base.

**S4. A paged generation listing (IND-8).**
- What changed:
  - `unnamedGenerations` lists 1,000 at a time following R2's cursor, for at most 5 pages, and returns `complete`.
  - The sweep keeps the mark unless a listing that reached the end is clean.
  - The shared stand-in `fakeR2().list` now reports `truncated` and a cursor, with R2's default limit of 1,000.
- Tests: the stand-in; IND-8's 102 generations; a listing that cannot be followed keeps the mark. All FAIL on the base.

**S5. New vault places (S-D3).**
- What changed:
  - `fill()` also counts the uploading network (an IPv4 /24 or IPv6 /48, via `upstreamNetwork`) per day (`pn:<net>:<day>`), at most `MAX_NEW_VAULTS_PER_NETWORK_PER_DAY` = 10.
  - Past that it answers `'network'`, which becomes a 503 until midnight UTC with "Sync has taken all the new vaults it takes from this network today…".
  - `unfill` gives the network's count back (the place records `n`).
  - At half the day's ceiling, `o:<day>` records `{ at, count, perDay, networks (top 20) }`, mirrored to KV as `ops:vaults:<day>`. Both go with the address keys at the end of the next day.
  - DEPLOY has a new section on the attack and the remedy:
    - read the record;
    - tell an attack from real growers;
    - WAF rules on `/api/sync/*`;
    - raise `SYNC_VAULTS_PER_DAY` or `SYNC_VAULTS_MAX`;
    - keep Pseudo IPv4 off;
    - what is still open: tiny uploads keep places alive, and the next step would be a minimum of stored bytes.
- Tests: D5 adapted (ten /48s now take 100 places, not the day; an honest grower still gets one; the record holds the networks; it is swept); the route's 503 and its Retry-After. Both FAIL on the base.
- With 10 a network it takes 20 networks to spend a day. The triage chose "count per /24 and /48", and I picked the figure 10. Raising it is one constant.

**S6. A listing budget (S-D4).**
- What changed:
  - `Counters.listAsk` and `listed` keep one key per vault (`l`: the hour and its pages).
  - `listBatches` asks before the walk and charges the real page count after it, at `LIST_PAGES_PER_HOUR` = 1,200 a vault.
  - Past that it throws `ListingsSpent`: 503 with Retry-After to the end of the hour and "Receiving is refused for now: …".
  - A counter object that cannot be asked lets the listing go and counts a `listing` fault.
  - The engine reads that 503 as a wait in the server's own words (`listingWait`, Retry-After of at most an hour). It is not kept as a refusal of uploads.
- Why the walk cannot stop at the cursor (documented in sync.ts and DEPLOY): R2 lists in key order, and a batch's key starts with the hour of its last change, not of its arrival. An offline device's batches arrive late under old hours, so any page can hold a new arrival. Only naming batches by arrival time fixes that, and that is a change to the wire.
- Tests: D2 turned round (49,000 batches; refused 503 with Retry-After 45 minutes at :15; list calls at most 1,200 + 50; no list call while refused; the next hour lists again); the counter fault guard; the engine's wait. The main test and the engine test FAIL on the base.

**S7. The build in the URL (S-D5).**
- Server:
  - `src/lib/server/build.ts` `forBuild(url, cc)`: an answer is `no-store` when `v` names another build.
  - Used by search, names (the Worker's cached hit too), rows, entries, sheets and forecast.
  - `v` is otherwise ignored; no route validates it.
  - The comments that said "every request reaches the Worker" are corrected (entries, `RATE.reference`, search, index).
- **The parameter is `v=`, not `b=`:** `b` already names the buckets of `/api/sheets` and `/api/entries`.
- Client needs (in S-needs.md):
  - `index.svelte.ts` (both helpers);
  - `SpeciesPicker.svelte`;
  - `weather/client.ts` (no owner; given to P);
  - `service-worker.ts`: its corpus cache is keyed without `v`, so a deploy does not empty the greenhouse cache.
  - Two test updates: P's `corpus-client.test.ts` and H's `smoke.spec.ts`.
- The full list of copies Cloudflare keeps is a sentence need for P's `/about/how`.
  - D said species 404 pages are kept 5 minutes. They are not: the adapter caches only answers below 400. So they are left off the list.
- Test: `forBuild`, plus the forecast and names routes under the current build, another build, and none. FAILS on the base.

**S8. Refusals said as refusals (S-D6, IND-7, R45-11).**
- Server:
  - MET's 429 or 403 gives 502 `{ error: "MET Norway refused this site's request", refused: true, status, retryAfter? }`, passing on its Retry-After.
  - GBIF's 429 or 403 at `/api/names` gives the same shape. New `synonymAsk` returns `'refused'`; `synonymOf` is unchanged, so P's page compiles either way.
  - The NWS's `alertsStatus` is `refused` only for its 429 or 403, and `unanswered` for a failure, a timeout or no answer. Both are kept five minutes.
  - Sheets and entries 503s carry `retryAfter` in the body. A store failure there is a 503 with Retry-After 30, where it was a bare 500.
  - 429s already carried `{ error, retryAfter }` and the header.
- Needs:
  - P: Today's NWS line; frost's five minutes for `unanswered`; the picker's and the 404's GBIF wording; the forecast client's MET wording.
  - P owns the sheets and entries clients and "Check again": the answer shapes are at the top of S-needs.md.
  - N: build-time `fetch.ts` records a timeout as `error`; `provider.ts` words NASA POWER by its status. This needs N's `climate.test.ts:113` changed; the exact change is in the need.
- Tests: MET, NWS and GBIF (routes and `synonymAsk`). All FAIL on the base.

**S9. Limits and their words (S-D7, R45-24).**
- What changed:
  - `create()` answers `'network'` for the /48's twenty. The vault route says "too many new vaults from this network today".
  - The address, network and day refusals all have Retry-After `untilMidnight`.
  - A log batch of 16 KB or less (`SMALL_BATCH_BYTES`) is not counted against the address's or the /48's day totals, on both the counter-object path and the KV path. It still counts against its vault. Photographs are counted whatever their size.
  - The figures for "what a visitor sees under pressure" are a sentence need for P's `/about/how`.
  - I left the `HELD_BACK_RESERVE` wording alone: it is copied in `weather/client.ts` and quoted in `/about/how`.
- Tests: D3 turned round; the route's words and its midnight Retry-After; small against large batches and photographs. All FAIL on the base.

**S10. New photographs get ids that cannot be guessed (S-D10).**
- Need for R in `collection.svelte.ts`. **A deviation from "20 random characters":** the id is `'p'` + the 8-digit time + 16 random base-36 characters (25 in all).
  - `madeOn()` (`src/lib/core/dates.ts`) reads a record's day from the 8 characters after the prefix.
  - A wholly random id would parse as a date in about two cases of three, and give photographs wrong days.
  - The 16 random characters (about 82 bits) make guessing hopeless, and the device id no longer appears.
- The server accepts both shapes, unchanged.
- Server, as D suggested: a PUT of other bytes **without** the proof is answered 409 before taking the hold. A token holder streaming such PUTs can no longer keep the name held and the removal waiting.
- Tests: the hold test (FAILS on the base); both id shapes accepted (a guard).
- A format sentence for `/about/formats` is in the needs. FOLD_RULES is not touched by it.

**Not done, and why.**
- No e2e was run. Every change is covered by unit tests that drive the real routes and counter objects; the server e2e specs are H's.
- The smoke spec's two expectations that change are written as needs for H: the `3600` Retry-After and the sheets URLs.

## Needs (all in `/tmp/r67/S-needs.md`)

- **R:** the photograph id.
- **P:**
  - `index.svelte.ts`, `SpeciesPicker.svelte`, `service-worker.ts`, `frost.svelte.ts`, `today/+page.svelte`, `species/[slug]/+page.server.ts`, `weather/client.ts` (no owner; given to P);
  - `tests/unit/corpus-client.test.ts`;
  - nine about-page sentence changes:
    - `/about/how`: the copies Cloudflare keeps, the reserve under pressure, the network place counts, and the fault counts;
    - `/about/formats`: the /48's words and the midnight waits, small batches, the network's places, the listing budget, the unreadable pointer, the sweep's write-back and paging, and photograph ids.
- **N:** `dossier/fetch.ts`, `climate/provider.ts`, and the test change in `climate.test.ts`.
- **H:**
  - `fold-rules.test.ts`: re-record the source hash under 7. My one line in the engine's `pull()` moves it; no fold changes, and the behaviour hash passes.
  - `smoke.spec.ts`: two places.

I applied every code need to a scratch copy of my tree. svelte-check there gives 0 errors apart from a file the scratch copy lacked, and the affected unit tests pass there, apart from N's `climate.test.ts`, as predicted.

## Unit runs (one file at a time) and svelte-check

All pass in `/tmp/r67/S`:

- My two files:
  - `r67s-server.test.ts` (23)
  - `r67s-engine.test.ts` (2)
- The tests I updated:
  - `counters.test.ts` (17)
  - `forecast-api.test.ts` (3)
  - `r60-review-server.test.ts` (14)
  - `r62bs-forecast.test.ts` (4)
  - `sync-server.test.ts` (32)
- The remaining 61 files of the 66-file server and sync set:
  - `formats-doc`, `hooks`, `hooks-r60`, `index-cache`, `manifest-refused`, `names-api`
  - `r60-proposed-server`, `r60-review-server-engine`
  - `r61h-engine-refusal`, `r61h-near-charge`, `r61h-search-cache`, `r61h-upstream-cap`, `r61l-engine`
  - `r61q-refusal-walk`, `r62h-refusal-walk-known`
  - all of `r61s-*`, `r62s-*`, `r62bs-*`, `r63fs-*` and `r63s-*`
  - `r62bl-newvault-parks`, `r62l-batch-version`, `r62q-names-route`, `r63fd-removal`
  - `search-api`, `server-r60`, `sheets-api`
  - `sync-accounting`, `sync-crypto`, `sync-engine`, `sync-hardening`, `synonyms`
- Also run:
  - `r61w-about-seams` (9)
  - `r62w-about-seams` (32)
  - `r62bw-pages-true`, `r62q-synonym-cap`, `r60-guards-client`, `r62l-clock-engine`, `r62bs-nws-held-unreachable`
- `fold-rules.test.ts` (H's) fails only its source-hash test, as expected; the need is written. Its behaviour test passes.

`npx svelte-check --threshold error` in `/tmp/r67/S`: **954 files, 0 errors, 0 warnings.**

## For the main session's memory (if worth keeping)

Cultifolio's server routes behind `@sveltejs/adapter-cloudflare` are answered from the adapter's own URL-keyed cache before any app code runs. That covers public answers below status 400 only.
