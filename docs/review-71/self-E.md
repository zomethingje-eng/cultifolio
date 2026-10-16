# Round seventy-two, reviewer E: the grower's data, sync and the server

Working copy `/tmp/claude-0/rev72/E/` at `c290e0f` (r72base), port 4405. Trial fixes with their tests: `/tmp/claude-0/rev72/E-fix.diff` (applies cleanly to r72base; every new test named below fails there). Scripts and logs: `/tmp/claude-0/rev72/E-work/` (`mutate.mjs` with `specs1.json`, `specs2.json`, `specs3.json` and their `.out.txt`; `stale-dossiers.py`; `cold.txt`; `e2e-fix.log`, `e2e-base.log`).

Nothing in my area writes a figure on a species page, so I have no wrong-fact finding with a corpus count. The findings start with what a visitor meets.

## Findings

### 1. A sheet of year-first dates from 2013 on is never asked about, and none of its dates is read (confirmed)

- **Where.** `src/lib/import/csv.ts`, `ambiguousDates`, and `src/routes/plants/import/+page.svelte`, `{#if amb.n}`.
- **What the code does.** Round 71 (D4) offers "Year first" only inside the date question. The question is put only when `n > 0`, and `n` counts only a cell that reads two ways with its year last. A year-first date whose first number is over 12 reads one way only with the year last. So 19-05-23, 21-08-14 and 23-12-10 give `n = 0` and no question. Every year from 2013 to 2026 is in this class. With no question, `readDate` leaves each cell ("could be written year first or year last") and the date goes to the notes. The grower is offered no way to read them. The same holds for LibreOffice's day-first short dates past the twelfth (25/12/23, 17/03/24) in a sheet that has no date such as 05/01/24.
- **Reproduction.**
  - Paste `species,acquired / Aloe vera,19-05-23 / Aloe ferox,21-08-14` on /plants/import.
  - On r72base there is no `#imp-dates`: the Chromium test "r72e (dates)" fails with "element(s) not found, waiting for locator('#imp-dates')" (`E-work/e2e-base.log`).
  - Unit: `ambiguousDates(...).n` is 0, and `readDate('19-05-23')` is null with `yearLast: ['2023-05-19']`.
  - D4's own tests use 10-04-15 and 11-06-20 only (years 2010 and 2011), which is why they pass.
- **What it should do.** Put the question whenever a short date is left that some choice would read.
- **Smallest fix (in the diff).**
  - `dateQuestion(amb)` in `csv.ts`: the question is about `n` dates when `n > 0`; otherwise about `yearFirst.n` dates.
  - The page shows the fieldset on `dateQuestion`. For the second case the legend says the dates "could be written with its two-digit year first or last".
  - `ambWords` takes its example from either list.
- **Tests.**
  - `tests/unit/r72e-import-dates.test.ts`: three cases fail on r72base.
  - The browser test is appended to `tests/e2e/r71d-import.spec.ts`. All four tests of that spec pass with the fix (`e2e-fix.log`).
  - All 29 unit files that import `lib/import` pass (472 tests). `svelte-check`: 0 errors.
- **For F, /about/formats.** Replace "A date like 09/03/2024 or 05/01/24 is read day first or month first only by one choice for the whole sheet, and left as written unless you make it;" with "A date like 09/03/2024, 05/01/24 or 19-05-23 is read only by one choice for the whole sheet (day first, month first, or year first where a date could be written so), asked whenever the sheet holds such a date, and left as written unless you make it;".

### 2. A photograph that times out stops the pull, so the device stops receiving (confirmed)

- **Where.** `src/lib/sync/engine.svelte.ts`, `runNow`.
- **What the code does.**
  - `runNow` catches only errors that carry `retryAfterMs` from `push`.
  - A photograph that does not finish within `PHOTO_MS` (180 s) throws a `TypeError` tagged `photoTimedOut`. It leaves `push` and the run before `pull()` is called.
  - On a link too slow for one photograph, every run sends the records, times out on the same photograph and ends. No change from another device ever arrives.
  - The sync page says "Server not reached". The refusal notice's promise that "changes from your other devices still come in" is broken in exactly the case round 71's E8 was written for.
- **Reproduction.** `tests/unit/r72e-sync.test.ts`, "P1":
  - Device A syncs a plant.
  - Device B joins, holding a photograph whose upload times out, and runs once its wait is over.
  - On r72base: `expected [ 'Haworthia' ] to include 'Aloe polyphylla'`.
  - The guard (a link that carries the photograph) passes on both.
- **What it should do.** Treat a timed-out photograph as `wait` is treated: pull, then end the run with the error so its retry is scheduled.
- **Fix (in the diff).** `slow` is caught beside `wait`, the second push is skipped, and the error is thrown after the pull.

### 3. Round 71's doubled photograph wait does not hold, and the card says a longer wait than happens (confirmed)

- **Where.** `engine.svelte.ts`: the E8 block in `runNow`, and `schedule()`.
- **What the code does.**
  - E8 doubles the run's retry to 2, 4, 8 and 16 minutes, and the card says "again in about 16 minutes".
  - `schedule()` replaces any pending timer. Three things call it with 1 s or 2.5 s:
    - the five-minute tick (`IDLE_PULL_MS`) and focus, through `schedule(1000)`;
    - any edit.
  - Each such run sends the same photograph again, up to 180 s of upload each time.
  - So in view the photograph is retried at least every five minutes (and at every focus or edit), whatever the card says. E8's saving of mobile data mostly does not happen.
- **Reproduction.** `r72e-sync.test.ts`, "P2": an edit a minute after the timeout runs sync. On r72base the photograph is sent again (`expected 2 to be 1`).
- **What it should do.** The wait should hold the photographs alone. Records and the pull should still go on every run.
- **Fix (in the diff).** `photoNotBefore`, set from the same doubled wait. The photograph loop in `push` returns early before it, so the tick, a focus or an edit sends records and pulls but no photograph.
- **Tests.**
  - E8's own test now moves the clock past each wait between its runs; it passes on both.
  - The 25 unit files that import the engine pass (257 tests).
  - `fold-rules` is untouched, since `runNow` and `push` are not hashed blocks.

### 4. `/api/dossier/<key>` serves whatever the bucket holds under a key the index no longer lists (confirmed in code; whether such files exist is unverified)

- **Where.** `src/routes/api/dossier/[key]/+server.ts`.
- **What the code does.**
  - The route reads `s/v2/<key>.json` from R2 and answers 200 if it parses. The index is consulted only after a miss.
  - The upload (`docs/DEPLOY.md` §5) is `rclone copy`, which never deletes. The documented prune covers `p/` only.
  - So the dossier of a species dropped from the corpus stays in the bucket and is served at the documented data API as a current page, with no sign it was withdrawn. Examples: 811 synonym pages followed and deleted by `--prune-followed`, a duplicate merged, a homonym key replaced.
  - Every unknown key also costs an R2 read.
- **Reproduction.**
  - Unit (`tests/unit/corpus-r60.test.ts`, the "round seventy-two (E)" case): a bucket holding a dossier under 424242, which the index does not list. On r72base the answer is 200.
  - The owner's disk is clean: 8,947 files, 8,947 index keys (`stale-dossiers.py`).
  - I could not list the bucket. The one dropped key I could find (7280275) answers 404 live.
- **Fix (in the diff).** A key `indexMaps(c.idx).byKey` lacks is a 404 before any read. The 503 for a listed key that cannot be read stands.
- **For F (optional).** Add to the /about/formats sentence on `/api/dossier`: "a key the index does not list answers 404, whatever the bucket still holds".

### 5. Under the day's refusal, a shorter refusal is no longer kept, and the tick sends again into it (suspected, low)

- **Where.** `engine.svelte.ts`, `refusedBy` and `uploadLimited` (E7).
- **What happens.**
  - When the day's refusal stands, a 503 or a 429 met by a small batch is not recorded (by design).
  - The run is rescheduled for its Retry-After, but the five-minute tick or a focus replaces that timer (finding 3).
  - So small batches go again every five minutes and are refused each time.
  - The same is true of a listing's 503 (`listingWait`), which is never recorded.
- **Cost.** Small: one request and a counter-object call each time.
- **Fix.** Keep `notBefore` for the run in the sync record when a wait is not recorded as a refusal, and have `schedule()` not shorten it. Not in the diff.

### 6. The launch's ceilings on new vaults (facts for the owner)

These are not bugs.

- **Defaults.** With no `SYNC_VAULTS_PER_DAY` or `SYNC_VAULTS_MAX` set, and `wrangler.jsonc` sets neither:
  - 200 new vaults a day for the whole site;
  - 2,000 in all;
  - 10 a day per IPv4 /24 or IPv6 /48;
  - 5 a day per address.
- **Effects.**
  - The 201st grower of a launch day is told "Sync has taken all the new vaults it can today" until midnight UTC.
  - Twenty networks with a cheap script can take a day's 200.
  - A carrier's /48, or an office's /24, gives ten.
- **Recommendation.** Decide the launch's numbers and set the two variables before the announcement. Watch `ops:vaults:<day>` (DEPLOY.md) on the day.

### 7. What a cold isolate costs before its first answer (measured, for the owner)

- **Measured.** The live index is 5.8 MB. On this machine (two cores shared by six reviewers), in node's V8:
  - `JSON.parse` takes 27 to 45 ms;
  - `indexMaps` takes 191 to 230 ms;
  - `heldNamesOf` (first dossier read) takes 153 to 229 ms.
- **Effect.** About 0.4 s of CPU before a cold isolate's first species page. During a burst every new isolate in every colo pays it, after one 5.8 MB R2 read. That is within the Workers Paid default (30 s). On the free plan's 10 ms it would fail outright.
- **Recommendation.**
  - Confirm the plan, and measure `cpuTime` with `wrangler tail` on a cold deploy.
  - If it is near a limit, have the build write the synonym maps and the held names as products, as it does the postings.

## Round 71's changes in my area: tried and mutation-tested

`mutate.mjs` applies one change and runs the named test files. Results:

- **Counters (E3).**
  - Killed: `>=` to `>`; the 61-minute keep; Retry-After's span minus one; the old `{h,n}` row read at its hour's start; the old row ignored.
  - Survived, both equivalent:
    - `left < limit` to `<=`: the total can never exceed the limit, so both stop at the same minute;
    - the sort removed: minutes are always appended in order.
  - Sound: one storage write per upload, as before. The busiest sixty minutes hold 3,600 (E's own test).
- **The listing under `waitUntil` (E2).** Removing the hand-over is killed. Sound.
- **NWS (E1).**
  - Both box mutants are killed.
  - I checked the boxes against US places at their edges: Key West, the Dry Tortugas, Cape Flattery, Point Roberts, the Northwest Angle, Eastport, Hyder, Metlakatla, Amatignak, Attu, St Matthew, Gambell, St Paul, St Croix, Mona, Farallon de Pajaros and Pago Pago. All are inside, and Chukotka east of 180° is answered "out of bounds" as said.
  - Midway and the Northwestern Hawaiian Islands are outside. They are nearly uninhabited, so I left them.
- **The sync page's words (E6) and the minute's retry (E8).**
  - Killed: the words' kinds; `mins <= 1`; the hidden-tab check; `retryAt` not cleared.
  - Survived, test gaps:
    - the 16-minute cap (`min(…, 4)` to `3`);
    - the reset after an answered photograph.
  - The diff adds a guard for the reset, which kills that mutant.
- **The day's refusal standing (E7).**
  - Killed: both "always replace" mutants.
  - Survived:
    - `dayStands` without its comparison (a day ending sooner than a new 503 still standing): a gap. The diff adds a guard, which kills it.
    - Reading `this.refusal` before `m.refusal`: equivalent, since `readRefusal` keeps them one.
- **Restored changes queued for sync (D3).**
  - Killed: a missing stamp kept waiting; the staging check dropped.
  - Survived: the meta key not deleted once every stamp in it is gone. Harmless (a stale list read at each load), but D's report counts "forgets any stamp no longer in the log" as tested, and that half is not.
  - Rule 6 holds: `queueReadable` writes the outbox and a meta key, never the log, once per load.
  - `unsentUnreadable` is sync bookkeeping like the outbox, not a reading. It cannot be dropped without losing what it would send, as the outbox cannot. That is worth a clause in /about/formats if the rule's wording is meant to cover it.
- **Import (D1, D2, D5).**
  - Killed: the bare-key filter, the numbering after plain lines, the `enough` rule, `>=` to `>`, and the hashes of the `others` alternatives.
  - Survived: counting free plants without excluding those already taken by lines found whole. That mutant lets a line take a plant when fewer are free than lines need: a guess, against rule 3. No test has a plant under the shared hash taken by a whole line. A test is worth adding.
- **Year first (D4).**
  - Killed: the `ymd` reading; its count; `ymd` leaving other dates; the year-first key.
  - The gap in finding 1 is in the condition no mutant touched.
- **The new code of the diff.** Each fix's mutant is killed (`specs3.out.txt`): the photograph gate, the slow catch, the index check and the question's second branch.

## Data loss (item 2 of the brief)

- **Two tabs.** One run per vault by Web Lock. The other tab retries in 5 s. A tab hidden at a timeout does not hammer. Sound, by reading and by the existing `r70w` tests, which pass.
- **Offline then online.** The `online` event schedules a run. The outbox survives reloads. Sound.
- **Restore over a newer log.** Replace is a stop and restage, and the server's newer changes come back on rejoining the same vault. A Merge appends. An unreadable change is kept apart (D3) and is not lost. Sound.
- **A sync refused mid-batch.**
  - Batches acknowledged before the refusal leave the outbox; the rest stay.
  - Under the day's refusal, batches over 16 KB are held while later small batches go. The fold is order-free, and `cutBefore` keeps notes and base together, so nothing is lost.
  - Receiving stops only in finding 2.
- **Quota exceeded.** `commit` applies nothing the vault refused, and says so. A pulled batch that cannot be stored stops the run with the cursor before it. Sound.
- **An old version reading a newer log.**
  - The snapshot is keyed by `FOLD_RULES`.
  - The old version skips and counts what it cannot read, and does not push it (round 69).
  - A batch from a newer device with such a change is set aside whole and read again later.
  - Rule 6 holds.

## The server under a launch (item 3)

- **Per request.**
  - Every counted request is one KV read when an isolate first sees the address in a window. After that, about one KV read and one write per request spaced over 5 s. IPv6 doubles both (address and /48).
  - At low per-visitor rates this is close to one KV write per counted request: about $5 a million on Paid. On the free plan's 1,000 writes a day, flushes fail open (caught), so nothing breaks, but the limits then count per isolate only.
- **Per first visit.**
  - The service worker's install fetches eleven Worker-rendered pages: ten shells and `/`.
  - Only `/` and species pages are held, 60 s per colo per corpus, build, units and hemisphere.
  - A species page that misses is not rate-counted (by design), so a crawler can make at most one render per page per variant per minute per colo.
  - Outside calls go through one site-wide counter object (`upstream`). That object is a single point every uncached forecast, name suggestion and species-address match passes through. It is fine at 600 calls a minute; it adds the object's round trip to visitors far from it.
- **The manifest changing mid-session.**
  - A device on the old id gets `no-store` answers from the new corpus for entries and sheets; it never caches them.
  - Products are hashed. The local `--index` keeps two manifests. The documented bucket prune keeps the live manifest's files and anything under a day old.
  - Sound, apart from dossiers (finding 4).
- **404 and error paths.**
  - Unknown keys and slugs are 404, and a listed but unreadable dossier is 503 no-store.
  - A held-back GBIF call is "not asked", no-store. A 5xx is never kept.
  - Sound.

## Security (item 4)

- **Headers.**
  - `_headers` is copied into `.svelte-kit/cloudflare/_headers`; checked in the build: no-referrer, DENY, nosniff, the Permissions-Policy and HSTS on static files.
  - The hook sets the same on rendered responses.
  - CSP comes from `svelte.config.js` (hash mode; `img-src` names this site and the four photograph hosts /about/how lists, plus GBIF's image cache, which it also lists).
- **Writes from another site.** Refused on every path (`_foreignWrite`).
- **Sync input.**
  - Vault ids, batch names, photograph ids, the fingerprint and device headers, and the drop proof are each matched by a regex before use.
  - Bodies are read through `readBody`, capped and growing.
  - Creation checks that the id derives from the token. Every other call compares the token's hash.
- **One vault affecting another.** None found: every key is prefixed by a validated id, each vault has its own counter object, and only the site-wide ceilings (finding 6) and upstream shares are shared.
- **Rule 5.**
  - The server asks only MET Norway, the NWS and GBIF, under a User-Agent with no personal address (the build's `USER_AGENT` names the project's own address).
  - The visitor's address is never forwarded.
  - /about/how says each.

## Open issues from corpus-step-71 in my area

- **11, the R2 prune.**
  - The procedure in DEPLOY.md §5 is sound for `p/`: `--keep-list` from the live manifest plus this checkout's two, then `rclone delete --min-age 24h --use-server-modtime`, dry run first. Run it a day after round 72's upload, in one sitting, as written.
  - It never touches top-level dossiers or `g/` genus files, and `rclone copy` never deletes them. Of the "about 3,000 files replaced" by round 71, the dossiers were overwritten in place and need no prune.
  - What does need one is any dossier of a species no longer in the index. With the fix of finding 4 such a file is no longer served, so it is only bytes.
  - **Recommendation.**
    - Add to the one-command corpus step (process change 2) a review point that lists the bucket's top-level `*.json` against the index (`rclone lsf r2:cultifolio/s/v2 --max-depth 1 --include "*.json"`), and offers to delete those not listed after a day.
    - Deploy finding 4's fix before deleting anything, so that no page between the two reads a half state.

## Checked and sound (briefly)

Round 71's changes as above, by mutation and by trying their edges; the writes counter's reading of an old row (placed conservatively in its hour's last minute); `queueReadable`'s one notice per load; `fold-rules` untouched by the diff.

## Not done

- WebKit and Firefox were not run. The whole unit suite was not run: I ran the 29 import files, the 25 engine files, `corpus-r60`, the r71d/r71e files and my own, and all pass with the diff.
- The clock correction across tabs was taken from D's guards, not attacked anew.
- The live bucket was not listed (no credentials), so finding 4's count is unknown.
- Worker CPU was measured in node, not on the platform.
- The guards for the remaining test gaps (the 16-minute cap, the unsent list's deletion, the free count under a whole line) are recommended, not written.
