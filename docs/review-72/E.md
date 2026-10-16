# Round seventy-two, fixes of reviewer E: the device, sync and the server

Working copy `/tmp/claude-0/rev72/E/`, branch `r72`, five commits on `r72base` (`c290e0f`):

- `fec0cad` E1
- `8fa4545` E2 and E3
- `0d156ad` E4
- the E5 commit
- the gaps commit (`git log r72base..r72`)

Port 4405. Scripts and logs are in `/tmp/claude-0/rev72/E-work/` (`mutate.mjs` with `specs*.json` and their `.out.txt`, `full-suite.log`, `e2e-r72e.log`).

## Done

### E1. The date question is put for short dates that read one way with the year last

- **Files.** `src/lib/import/csv.ts` (new `dateQuestion`) and `src/routes/plants/import/+page.svelte`.
- **What the code now does.**
  - The question is put when a date reads two ways with its year last, as before.
  - It is now also put when the sheet holds a short date that a choice would read and none does now. Examples: 19-05-23, 23-12-10, and LibreOffice's day-first 25/12/23.
  - In that second case the legend says the dates "could be written with its two-digit year first or last", and names the first such date.
  - The three answers name the day each reads, as round 71's do.
  - Nothing is chosen for the grower.
- **Tests.**
  - `tests/unit/r72e-import-dates.test.ts`: three cases fail on r72base, where `dateQuestion` is absent and the page's `amb.n` is 0. One guard passes on both.
  - `tests/e2e/r72e-import.spec.ts`: on r72base it fails with "element(s) not found, waiting for locator('#imp-dates')". With the fix it and the four tests of `r71d-import.spec.ts` pass in Chromium, strict.
  - The 29 unit files that import `lib/import` pass.

### E2. A photograph that times out no longer stops the pull

- **File.** `src/lib/sync/engine.svelte.ts`, `runNow`.
- **What the code now does.**
  - An error from `push` tagged `photoTimedOut` is held as a refusal's wait is held.
  - The pull runs, and the run then ends with that error, so the retry and the card's words are as before.
- **Test.** `tests/unit/r72e-sync.test.ts`, P1. Device B, whose photograph upload times out, runs once its wait is over. On r72base: `expected [ 'Haworthia' ] to include 'Aloe polyphylla'`. The guard with a link that carries the photograph passes on both.

### E3. The doubled photograph wait holds the photographs

- **File.** `engine.svelte.ts`.
- **What the code now does.**
  - The doubled wait (2, 4, 8, then 16 minutes) is also kept as `photoNotBefore`.
  - `push` returns before its photograph loop until then.
  - So the five-minute tick, a focus or an edit sends the records and pulls, and sends no photograph.
- **Round 71's E8 test.** It ran three times in a row with no time passing, so it now moves the clock past each wait. It passes on both.
- **Test.** `r72e-sync.test.ts`, P2: an edit a minute after the timeout. On r72base: `expected 2 to be 1`, the photograph sent again.

### E4. `/api/dossier/<key>` answers 404 for a key the index does not list

- **File.** `src/routes/api/dossier/[key]/+server.ts`.
- **What the code now does.** The key is checked against the index before any read. A key the index does not list is 404, without an R2 read. A listed key that cannot be read is 503, as before.
- **Test.** `tests/unit/corpus-r60.test.ts`, "round seventy-two (E)": a bucket holding a dossier under 424242, which the index does not list. On r72base the answer is 200. It also asserts that the object is not read.

### E5. A shorter refusal met under the day's refusal is kept, and small batches wait it out

- **Files.** `engine.svelte.ts` (`holdSmall`, `readRefusal`, `waitRefusal`) and `src/lib/ui/sync-words.ts` (`refusalKept`).
- **What the code now does.**
  - While the day's upload allowance is refused, a small batch may meet a 503 or a request window's 429 of a minute or more. That refusal is kept beside the day's, in the sync record, as `refusal.small: { text, until }`. It is capped at the day's end and at an hour ahead.
  - Until it ends, no batch is sent by any run, tab or reload. The run says the shorter refusal's own sentence and waits for it. Receiving goes on.
  - After it ends, small batches go again under the day's refusal, which still stands.
  - The sync page's line under the notice says "Your changes are kept here meanwhile, and changes from your other devices still come in" while it stands. It no longer says "smaller bundles of changes still go".
  - The page file itself is unchanged.
- **Tests.** `r72e-sync.test.ts`, E5:
  - Five minutes on, as the tick, with an edit. On r72base: `expected 2 to be 1`, the small batch sent into the 503 again.
  - The record keeps the wait. Past the half hour the batch goes, and the day's refusal still stands.
  - The words. On r72base they are "Photographs, and sync bundles of changes over 16 KB…".
- **Not covered.** The listing's 503 (`listingWait`) is still kept only in the run's timer; see "Not done".

### The three gap tests

Each passes on r72base and fails under the mutant that survived round 71 (`specs4.json`, `specs5.json`: all killed).

- **The 16-minute cap.** `r72e-sync.test.ts`. Six timeouts in a row ask 2, 4, 8, 16, 16 and 16 minutes; capped at eight, the fourth is eight.
- **The unsent list's deletion.** `tests/unit/r72e-gaps.test.ts`. A list whose stamps have all left the log is forgotten by `queueReadable`; the mutant kept it.
- **The free count under a whole line.** `r72e-gaps.test.ts`.
  - The case: two plants from two like lines; the new sheet keeps one plain line (found whole) and adds two told apart by a locality.
  - One plant is free for two lines, so neither line takes it: no `done`, no `matchedKeys`. The first may be flagged `changed` ("looks already imported"), which offers it as new with a word.
  - The mutant counted the plant the whole line took as free, and gave it to the first line: a guess, against rule 3.

### Guards from the self-review

`r72e-sync.test.ts` also holds two guards that pass on r72base and kill their mutants: `dayStands` without its comparison, and the photograph count not reset by an answer.

## Needs

### For F, /about/formats

1. **E1, the import paragraph.**
   - **Replace:** "A date like 09/03/2024 or 05/01/24 is read day first or month first only by one choice for the whole sheet, and left as written unless you make it;"
   - **With:** "A date like 09/03/2024, 05/01/24 or 19-05-23 is read only by one choice for the whole sheet (day first, month first, or year first where a date could be written so), asked whenever the sheet holds such a date, and left as written unless you make it;"
   - **Checked against `dateQuestion`.** It is put when a cell reads two ways with its year last (`n`), or when a short date could be read year first (`yearFirst.n`). Every short date left unread by its year's place is in one of the two. A cell like 31-12-23, which cannot be year first and reads one way with the year last, is read as before without a question.
2. **E4, the `/api/dossier` sentence.**
   - **Replace:** "a dossier the index lists but that cannot be read just now answers 503, never 404)"
   - **With:** "a dossier the index lists but that cannot be read just now answers 503, never 404, and a key the index does not list answers 404, whatever the bucket still holds)"
3. **E5, the kept 429.**
   - **Replace:** "a shorter refusal met by such a log batch (a 503, or a request window's 429) stops that sync but leaves the day's wait standing."
   - **With:** "a shorter refusal met by such a log batch (a 503, or a request window's 429) leaves the day's wait standing and is kept beside it, so no log batch is sent, by any tab or after a reload, until it ends."
4. **E2 and E3 (optional; no sentence of either about page is made untrue).** If F wants the rule said, after the kept 429's sentence: "A photograph that does not finish uploading within three minutes waits two minutes, then four, eight and sixteen at most after each such photograph in a row, while records still go and changes from other devices still come in."

### For F, /about/how

None. No request or host changes.

### For D

None from my fixes. The prune of dossiers of species no longer listed (the triage's D9/E-prune, D's) is safer after E4 is deployed: such a file is then no longer served, so deleting it later changes no answer.

## The corpus step

None. My changes read and write no dossier.

## Measured

- **Whole unit suite**, once, on the final tree: 383 files, 3,661 passed, 8 skipped, 0 failed (264 s).
- **Checks.** `npx tsc --noEmit -p .` is clean. `svelte-check --threshold error`: 1,142 files, 0 errors (run on the E1 page change; nothing Svelte changed since).
- **Chromium, strict.** `r72e-import.spec.ts` and `r71d-import.spec.ts`: 4 passed.
- **Mutation.** The mutants of the new code (the photograph gate, the slow catch, the index check, the question's second branch) and the four survivors now guarded are all killed.

## Facts for the owner (E6, E7)

- **E6, new vaults.**
  - Without `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX` (`wrangler.jsonc` sets neither), the site takes:
    - 200 new syncing vaults a day;
    - 2,000 in all;
    - 10 a day per IPv4 /24 or IPv6 /48;
    - 5 a day per address.
  - A place is taken at a vault's first upload, not at creation, and given back after 90 days without one.
  - Recommendation: set the two variables to the launch's expected numbers before the announcement, and watch `ops:vaults:<day>`.
- **E7, a cold isolate.**
  - About 0.4 s of CPU in node on this shared machine: the index parse 27 to 45 ms, `indexMaps` about 200 ms, `heldNamesOf` 150 to 230 ms. It follows a 5.8 MB R2 read.
  - Recommendation: confirm the Workers plan, and read `cpuTime` with `wrangler tail` on a cold deploy. If it is near a limit, write the synonym maps and the held names as build products.

## Not done or departed from

- **The listing's 503 is not kept.** "The vault's hour of listings" is held only in the run's timer, so the tick lists again every five minutes into it. Each try is one request and a counter-object call. Keeping it as E5 keeps the small batches' wait would add a record field the pull reads. Left for round 73 unless the triage wants it now.
- **The e2e test's place.** Round 71 put its import browser tests in `r71d-import.spec.ts`; per the brief, mine is a spec of its own (`r72e-import.spec.ts`), and `r71d-import.spec.ts` is unchanged.
- **Engines.** WebKit and Firefox were not run.
