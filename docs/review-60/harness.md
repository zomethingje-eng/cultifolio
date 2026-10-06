# Round sixty self-review: the harness

Reviewer: harness. Copy: `/tmp/r60rev/harness` (mutations; src md5-checked pristine at the end) and a second pristine copy `/tmp/r60rev/harness-e2e` (identical src, md5-checked against the main checkout) for the build, the e2e server on port 4181, the UI mutations and the confirmation of new tests, so a build never ran against a mutated file. Logs, scripts and raw results: `/tmp/r60rev/out/harness-logs/` (`mutation-results.jsonl`, `verify.log`, `pw-*.json`, `clock-*.log`).

What I ran:

- **Mutation testing:** 129 single-line mutations of round sixty's fixes, each run against the unit files that should catch it (`--bail=1`), restored and md5-checked; 12 more UI mutations built into the e2e copy in two batches and run against their e2e tests by `file:line`. A first pass under a machine load of 13 to 18 reported three mutations as caught when only an unrelated test had timed out, so every "caught" was run again at load 1 to 5. Final result: 99 of 129 caught, 30 survived. Of the 30, 23 are real gaps, now covered by 13 new test files, each confirmed to fail on its mutation and pass on the real code. The other 7 are equivalent or redundant (finding 19). All 12 UI mutations were caught except `batchHref`, which no e2e test reaches.
- **Unit suite, twice:**
  - Node 22.22.2 with TZ=Pacific/Auckland, started 11:50 NZDT, so the local date differed from UTC: 83 files, 770 of 770 passed, 297 s.
  - Node 24.21.0 with TZ=America/Los_Angeles: 770 of 770 passed, 571 s (load 13 to 18).
  - The brief's two time-zone runs were folded into the two Node runs to keep to two full suites.
- **Clock-shifted runs:** the 22 date-sensitive files (330 tests), with the process clock shifted by an `--import` preload (`clockshift.mjs`) to 30 s before:
  - New Year in Auckland: all pass;
  - UTC midnight in Los Angeles: all pass;
  - the end of US daylight saving: all pass;
  - the end of NZ daylight saving (April 2027): 1 failure (finding 1).
  - A sixth run, 20 files with the clock in mid-2027, shows the same single failure.
- **E2E:**
  - One full run of `smoke.spec.ts` and `r60-grow.spec.ts` (134 tests, retries 0, own server on port 4181, load 15 to 18): 127 passed, 7 failed.
  - Three runs of the round-sixty set (`-g "round sixty|r60 "`, 32 tests, since the r60-grow titles do not contain "round sixty"), each on a server restarted with fresh state: 31, 31 and 32 passed.
  - A fourth run with traces: 31 passed.
  - Single tests were repeated to separate load from flakes.

Survivors and vacuous tests come first (findings 4 to 17), after three findings that touch the release itself.

## Findings

### 1. P2, confirmed: the unit suite fails from 1 January 2027, and `npm run deploy` runs it first

`tests/unit/collection-store.test.ts:549-550`, the test "several plants at once are one commit…".

- **What happens:** the test adds plants with `acquired: '2026-09-01'` and expects `` `${new Date().getFullYear()}-0001` ``. Numbers follow the acquisition year, so in any year but 2026 it gets `2026-0001` against `2027-0001`.
- **Why it matters:** the `deploy` script is `npm run check && npm run test && …`, so the first deploy of 2027 stops here.
- **Reproduction:**

  ```
  cd <copy> && TZ=UTC CLOCK_AT=2027-06-15T12:00:00 NODE_OPTIONS="--import /tmp/r60rev/out/harness-logs/clockshift.mjs" npx vitest run tests/unit/collection-store.test.ts
  ```

  Result: `expected [ '2026-0001', … ] to deeply equal [ '2027-0001', … ]`. The same failure appeared in the NZ daylight-saving run (2027-04-04).
- **No other unit test depends on the year:** 20 files that mix fixed 2026 dates with the clock were run in mid-2027; this was the only failure.
- **Smallest fix:** write `acquired: \`${y}-09-01\`` with `y = new Date().getFullYear()`, as the round-twenty-eight test below it already does.

### 2. P2, confirmed: the e2e suites fail from 1 January 2027

**Where the year is hard-coded:**

- `r60-grow.spec.ts` "r60 1" (lines 113 and 116) and "r60 3" (line 149) expect plants added today to be `2026-NNNN`.
- `smoke.spec.ts` does the same at lines 650, 1990, 2028-2032, 2090-2093, 2157-2161, 2610, 2624, 2654, 2665 and 2933 (`/plants/2026-0001` after an add).

**Reproduction:** `out/tests/harness--year.spec.ts` runs "r60 1" verbatim with `page.clock.install({ time: 2027-01-02 })`. It FAILS with "Received: … (2026-0001 → 2027-0003)".

**Fix:** read the year as "r60 8" already does (`localDay(0).slice(0, 4)`), or install a fixed clock in a fixture.

### 3. P2, confirmed: "Also today" hides Firsts and the watering calendar whenever Today itself has no line

`src/routes/today/+page.svelte:364-368` has two rules:

- `#rest:not(:has(> :global(:not(.secrule))))` hides the section when only its heading is inside. This one is right.
- `:global(#rest:not(:has(.today))) { display: none; }` hides it whenever the `Today` component draws no line, even when Firsts or the calendar is under it.

**When a grower meets it:** they hide the backup reminder ("Hide") and nothing is due. "First flowers on …" and "Watering in your phone's calendar" then vanish.

**Reproduction:** `out/tests/harness--also-today.spec.ts` (FAILS). It adds a plant, records a flower, hides the reminder, then checks that `.today` count is 0 and that `#firsts` is visible: "Received: hidden".

**Fix checked:** I built a copy with the second rule deleted. My test then passed, and the round's own 3752 ("only when something is under it") still passed. Delete that one line.

**Vacuous test:** the round's own "r60 7" checks `#firsts` with `toContainText`, which passes on an element that is `display:none`, so it could not see this. Use `toBeVisible()` before reading text.

### 4. P2, confirmed (survivors): the engine's 503 refusal is tested for what it stops, not for what it allows

The adopted test (`r60-review-server-engine.test.ts:284`) has three gaps:

- It asserts `refusal.until >= t0 + 1h`, while its comment says "held to the engine's hour at most".
- It never checks that the device keeps receiving while refused, which REVIEW-ROUND-60 §4 and `/about/formats` promise.
- It never checks that uploads resume once the time has passed.

**Survivors** (`src/lib/sync/engine.svelte.ts`):

- `Math.min(3600,` changed to `86400`;
- `waitRefusal` never lapsing (`if (left <= 0)` line removed);
- `retryAfterMs` dropped in `waitRefusal`: every refused run throws before the pull, so nothing is received;
- `retryAfterMs` dropped in `refusedBy`: the same, for the first run;
- photo PUT `503` not routed to `refusedBy`: a photograph held by another device for a moment is then "photo push failed: 503", raw, and the pull is skipped.

**Test written:** `out/tests/harness--engine-refusal.test.ts`. It has two tests: an hour at most, receives while refused, resumes after the hour; and a photo 503 with Retry-After 5. It PASSES on real code and FAILS under each of the five mutations.

### 5. P2, confirmed (survivors): the import's commit has no unit test

`src/lib/import/commit.ts` is not imported by any unit test. The e2e tests take the happy path only. Three mutations survived:

- `break` after a failed row changed to `continue`: rows after a failure are written, and the page's "the rest is kept for a second try" would add them twice;
- the "taken since the review list was drawn" fallback removed: the import stops on a number another tab just took;
- places made whether or not "Make these places" is ticked.

**Test written:** `out/tests/harness--import-commit.test.ts`. It PASSES and FAILS under each mutation.

**A related P3, confirmed:** the fallback path relies on `addAccessions` throwing.
- `vault.ts appendChangesClaiming` (lines 410-428) calls `tx.abort()`, and nothing awaits that transaction's `done`.
- So every refused claim, the add form's included, leaves an unhandled `AbortError`. Vitest reports it as an error, and a browser logs it as an unhandled rejection.
- The test contains it so as to judge the import alone.
- Fix: `tx.done.catch(() => {})` before `tx.abort()`.

### 6. P2, confirmed (survivors and a vacuous claim): the search's Worker cache

The round's test is named "…answered from the cache: no posting read, no count against the address". It passes with the cache never read: postings are memoised in the isolate, so "no posting read" holds anyway, and the rate limit is never examined. Survivors in `src/routes/api/search/+server.ts`:

- the cache never read (`hit = undefined`);
- the rate limit moved before the cache read;
- the cache storing `{ hits }` only. The second person to type "Copiapoa cinerea var. columna-alba" then gets the retry's hits with no `x-search-relaxed`. The front page shows them as an exact match, a different name presented as the one typed, against the spirit of rule 2.

**Test written:** `out/tests/harness--search-cache.test.ts`. It checks that a retried answer stays retried from the cache, in both shapes, and that a cached query is answered to an address whose allowance is spent while an uncached one gets 429. It PASSES and FAILS under all three mutations.

### 7. P3, confirmed (survivors): the site-wide cap on outside calls is tested on the forecast only

Removing the cap check in the names route (`api/names/+server.ts:48`) or in `synonymOf` (`server/synonyms.ts:68`) passed the suite. The cap is shared by every visitor, so a missed call site lets one client spend the whole site's GBIF allowance through that route.

**Test written:** `out/tests/harness--upstream-cap.test.ts`. Past the cap, the names route answers 502 and asks nothing, and `synonymOf` answers 'unchecked' and asks nothing. It PASSES and FAILS under both mutations.

### 8. P3, confirmed (survivors): no unit test reaches the sample collection's isolation

`r60f-demo.test.ts` mocks the whole vault. So nothing in the unit suite reaches:
- `vault.ts:35` DB_NAME (mutated to the same name for both);
- `demo.ts leaveDemo` deleting `cultifolio-demo` (mutated to another name).

e2e "r60 11" and "r60 12" catch the first (confirmed by a UI build).

**Test written:** `out/tests/harness--demo-isolation.test.ts`. It uses fake-indexeddb with sessionStorage and location stand-ins, PASSES, and FAILS under both mutations.

### 9. P3, confirmed (survivor): the snapshot's `checked` key is tested in one direction only

`r60-clock-review` B4 shows that a snapshot taken under an unchecked clock is not read under a confirmed one. Writing `checked: false` always passed the suite. In the first pass it looked caught, but only an unrelated timeout had fired. The effect: every synced device folds its whole log at every load, and the snapshot is never used.

**Test written:** `out/tests/harness--snapshot-checked.test.ts`. Under a confirmed clock the next load reads the snapshot. It PASSES and FAILS under the mutation.

### 10. P3, confirmed (survivor): `batchHref` has no test anywhere

`links.ts:12` mutated to link by number always:
- passed the unit suite;
- passed all 9 e2e tests that touch batches (UI batch 2).

**Test written:** `out/tests/harness--batch-href.test.ts`. It PASSES and FAILS under the mutation.

### 11. P3, confirmed (survivors): two of the backup's number rules are untested

**Survivors** (`backup.ts`):
- `csvCell`'s sixteen-digits clause (`/^\d{16,}$/`);
- `sharedNumbers` counting removed records (`r._deleted ||` dropped).

Both were reported as caught in the first pass, only by zip-bomb tests timing out under load.

**Test written:** `out/tests/harness--backup-numbers.test.ts`. It PASSES and FAILS under each.

### 12. P3, confirmed (survivor): the clock's five minutes of slack has no unit test at its edge

`trustedAge` narrowed to one minute (`hlc.ts:138`) passed every unit test. REVIEW-ROUND-60 1.3 says only the e2e clock test needed more than a minute.

**Test written:** `out/tests/harness--clock-slack.test.ts`:
- confirmed at minus 2 min and minus 4:59;
- not confirmed at minus 5:01;
- a stored correction dated after the clock is dropped at load.

It PASSES and FAILS under the slack and the stored-correction mutations.

### 13. P3, confirmed (survivor): an "ex" citation is untested

Dropping `ex$` from `AUTHOR` (`search.ts:81`) passed the suite: the round's citations use brackets, "&" or dotted abbreviations.

**Test written:** `out/tests/harness--search-citation.test.ts`, using "Gasteria carinata ex Haw.". It PASSES and FAILS under the mutation.

### 14. P3, confirmed (survivor): "months said once" is tested on one of the sheet's two lines

The guard `reader !== at` in `yours` (`sheet.ts:299`) feeds the card's `plain.lead`, which the round's test does not read.

**Test written:** `out/tests/harness--sheet-lead.test.ts`. It PASSES and FAILS under the mutation.

### 15. P3, confirmed (survivor): nothing ties app.html's inline script to its CSP hash

The script was changed this round and the hash in `svelte.config.js:43` updated by hand. A drift would block the script silently: no theme before paint, and the tab bar flips again.

**Test written:** `out/tests/harness--csp-hash.test.ts`. It PASSES and FAILS when one space is added to the script.

### 16. P3, confirmed: the archetype table says two things about Oxalis

Oxalis is in `none` and in `genus.geophyte`. `archFor` reads `none` first, so the geophyte entry is dead. Agent X's report says Oxalis moved out of tropical into `none`; a bulb grower would expect it among the geophytes.

**Test written:** `out/tests/harness--arch-table.test.ts` (FAILS on round-sixty code). Choose one list and remove Oxalis from the other.

Apart from Oxalis, the `none` list only repeats what the tables already give: no other `none` genus, and no `none` genus's family, is in any table. So the mutations `arch-ungrouped-ignored` and "Puya removed from none" are equivalent, and no behavioural test can see them.

### 17. P3, confirmed: tests whose names claim more than they assert

- `r60-corpus-fuzz.test.ts:102`, "the near pass is never charged…":
  - It computes `charged` per query and asserts only `WHOLE_LIKE === 2000`.
  - Its title also states the opposite of the round's rule (corpus-r60 tests "…is charged, once").
  - Replacement: `out/tests/harness--near-charge.test.ts` asserts at most one charge, none under WHOLE_LIKE, and one when exact plus near candidates pass it. It FAILS with the near pass's charge removed.
- `r60-fuzz.test.ts:219`, "…divergence is reported": the divergence is printed and not bounded (26 of 120 seeds, as the round says). A regression to 120 passes. Add `expect(div.length).toBeLessThanOrEqual(26)`; the seeds are fixed.
- `r60-review-server-engine.test.ts:284`: the "at most an hour" comment, as in finding 4.
- `corpus-r60.test.ts:464`: the "no count against the address" title, as in finding 6.
- `r60-notes-review.test.ts:46`, "an edit made while a peer's change is parked: its base is the text on screen…": no edit is made while the change is parked. The test puts the text before the ingest and then applies. The assertions hold; the first clause of the name is not tested.
- `server-r60.test.ts:387`: covers the forecast only, as in finding 7.
- e2e "r60 7": checks a hidden element's text, as in finding 3.
- No unit test has zero assertions.
  - `fold-rules.test.ts` fails through `expect.fail`. It is a tripwire on a hash, not a behavioural test: any edit to `log.ts`, `hlc.ts` or `vault.ts` trips it. I left it out of the mutation targets, so those mutations were judged by behavioural tests only.
  - None of the r60 tests relies on localStorage without installing a stand-in: the clock tests install one, the rest keep the clock in memory.

### 18. P3, confirmed: suite stability

**e2e full run, 7 failures, and their causes:**

- **smoke 1257, "talks to no third-party host":** it hard-codes `127.0.0.1:4173` as the own host (line 1259), so it fails on any other port. Every request it lists is the site's own. Use `new URL(baseURL).host`.
- **r60 14, "persist once":** a real race in the product. It failed in 3 of the 4 round-sixty runs and in the full run, and passed 9 of 9 alone or in small groups.
  - The trace shows the "This browser has not promised…" toast shown on `/plants/new` at t=95495 ms and the navigation to the plant page at about 96221 ms.
  - `toast.onNavigate()` hides any toast shown more than 600 ms before a navigation completes (`toast.svelte.ts:71-72`).
  - GrowLayer sets `cultifolio.persistAfterFirst` before the grower has seen anything, so on a slow phone the answer is said to no one, and never again.
  - Fix: show the answer after the navigation settles, or set the flag only once the toast has been on screen.
- **r60 4 and r60 5:** timed out at the default 30 s under load. They take 8 s and 7 s at load 2 (3 of 3 passed when rerun). They are multi-page tests with about 3.7 times headroom; give them `test.setTimeout(90_000)` as r60 11 and r60 12 have.
- **smoke 1637, "welwit mirab" showed 2 hit rows for 5 s:** the previous query's rows, under load. It passed 3 of 3 when rerun.
- **smoke 1192 and 1810, "Target crashed" and "Page crashed":** Chromium killed by memory pressure. The sandbox has 8 GB, no swap and nine reviewers; my first build was also OOM-killed. This is the environment, not a test fault.

**Unit tests that time out under load:**
- `backup.test.ts:251` "not inflated" and the "table of contents whose entries all point at one stored block" test take 5.6 s and 4.9 s at load 1, but 20 to 31 s at load 15, past the 20 s `testTimeout`. They produced every false "caught" in the first mutation pass.
- Give them an explicit 60 s timeout, like the fuzz tests.

### 19. Survivors judged equivalent or redundant (no test written)

- **`coll-staleOwn-not-own-only`** (dropping `isOwnStamp` in `stampPast`): with a confirmed clock, the fold parks any peer stamp more than two days ahead, so `seen` cannot hold one when an edit is stamped. The guard is defensive.
- **`home-feature-other-corpus`:** `getDossier` reads the dossier by key from its mutable path whatever corpus is passed (as `r60-corpus-mixed` pins), so dropping `c` only adds an index load. `home-feature-never` is caught by e2e 3731.
- **`arch-ungrouped-ignored` and Puya removed from `none`:** finding 16.
- **`demo-seed-guard-line43` and `line45`:** two `inDemo()` checks guard the same path, so each alone is redundant. Removing both is caught (agent F's report).

## Coverage: round-sixty sources with no test of their new behaviour

**Covered now by the new tests:**
- `src/lib/import/commit.ts`
- `src/lib/db/demo.ts`
- `src/lib/db/links.ts` (`batchHref`)
- the `app.html` script and its CSP hash
- the names and synonyms cap call sites

**Still untested:**
- `GrowLayer.svelte`'s fifth-plant backup nudge (`#backup-nudge`): no test at all.
- `FollowButton.svelte`'s "On your Wanted list ›" link: no test.
- `ui/ref/failed.ts` (`failedBeforeHydration`): no test of the before-hydration path.
- `db/storage-error.ts`: the new wording is not tested.
- `export/save.ts`: only through e2e downloads.
- The layout's once-per-load service-worker update check: no test.

**Tested by e2e only** (each caught its UI mutation, confirmed):
- `routes/+page.server.ts` `feature`;
- `weather/client.ts` forecast wording;
- `species/[slug]/+page.svelte` `markerHow`;
- the labels page's shared-number refusal;
- `HeldNote` on the plants list;
- `searchCatalogue`'s relaxed flag in the page;
- the QR fragment on labels.

## Checked and sound

Each fix below had a mutation that its tests caught (or that is equivalent, as noted).

- **Clock:**
  - `trustedAge` negative age and a slack of days;
  - `isParked` own-exemption and unchecked gate;
  - `stampPast` (old one-day rule);
  - `staleOwn` (unchecked, never, park dropped);
  - the snapshot key on read;
  - `heldWaiting`.
- **Numbers:**
  - restore born-after;
  - `plantHref`;
  - the `="…"` wrap, its zero, date and exponent clauses;
  - `sharedNumbers` threshold and "here";
  - import `cellText` unwrap and guard apostrophe;
  - plan renumbering and order.
- **Engine:** the 503 refusal (no refusal, no wait, no `waitRefusal` in push, log 503, own words); `X-Photo-Removed-At`; DELETE 503 and 409 (both forms).
- **Server:**
  - claims (header ignored, R2 time, store claim, unhold claim, hold claimed), the hold (busy ignored, never lapsing);
  - leases (lapse, sweep) and gen (`setBytes`, release, give, take);
  - admission (unavailable, catch, seed), `unadmit` (not called, ignoring objects), `unfill` day, the fill day ceiling;
  - `readBody` (whole declared length, longer than declared), the upstream cap itself and the forecast's use of it;
  - `Sec-Fetch-Site` (both directions), noindex (off, missing backup), nosniff, CSP `img-src` (host dropped, any https).
- **Corpus:** the odd-address 301, the unreadable species 503, refused index to the fixture, R2 error keeps the corpus, retry every request, refusal forever, relaxed off and unflagged, the single charge, near-pass charge.
- **Search:**
  - markers (subsp, x), lower-case capital citation;
  - commons (prepare, postings, build);
  - the cache key's corpus, the `x-search-relaxed` header, `searchCatalogue`.
- **Credibility:** the floor raised by the convention, "no source" dropped, `aLabel`, the "no short rainy season" wording.
- **Notes:** the chain through a skipped base, skipped notes paired, `applyParked`'s base.
- **ICS:** folding continuation, EXDATE, UNTIL, comma escaping, CRLF.
- **QR:** slug characters, control characters, hybrid slug, encoding.
- **The server fixes the S and T-server reports say were mutation-checked** held under my own mutations of the same lines (not their exact edits).
- **The 32 round-sixty e2e tests:** apart from r60 14 (finding 18), every one passed 4 of 4.
- **Time-of-day dependence:** the only date-of-day exposure in the unit suite is the year bomb (finding 1).
  - The remaining `new Date().toISOString().slice(0, 10)` uses in the server tests compare two reads a few milliseconds apart, so they fail only if UTC midnight falls between them.
  - The four boundary scenarios, a run whose UTC midnight passed mid-run, and the Node 22 run, where the local date differed from UTC, all passed.
  - The r60f tests inject their clock.

## New tests (in `/tmp/r60rev/out/tests/`)

Each header says PASSES or FAILS and how to run it.

| File | Status | Catches |
|---|---|---|
| `harness--engine-refusal.test.ts` | PASSES | 5 survivors (finding 4) |
| `harness--import-commit.test.ts` | PASSES | 3 survivors (finding 5) |
| `harness--search-cache.test.ts` | PASSES | 3 survivors (finding 6) |
| `harness--upstream-cap.test.ts` | PASSES | 2 survivors (finding 7) |
| `harness--demo-isolation.test.ts` | PASSES | 2 survivors (finding 8) |
| `harness--snapshot-checked.test.ts` | PASSES | finding 9 |
| `harness--batch-href.test.ts` | PASSES | finding 10 |
| `harness--backup-numbers.test.ts` | PASSES | 2 survivors (finding 11) |
| `harness--clock-slack.test.ts` | PASSES | finding 12 |
| `harness--search-citation.test.ts` | PASSES | finding 13 |
| `harness--sheet-lead.test.ts` | PASSES | finding 14 |
| `harness--csp-hash.test.ts` | PASSES | finding 15 |
| `harness--near-charge.test.ts` | PASSES | replaces the vacuous fuzz test (finding 17) |
| `harness--arch-table.test.ts` | FAILS | reproduction (finding 16) |
| `harness--also-today.spec.ts` | FAILS | reproduction (finding 3); passes with the fix |
| `harness--year.spec.ts` | FAILS | reproduction (finding 2) |

All the unit files together on pristine source: 21 passed, 1 failed (arch-table, by design), with no unhandled errors.
