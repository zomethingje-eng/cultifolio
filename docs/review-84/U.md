# Round 84, agent U: the collection, the app's frame and operations

Copy `/tmp/claude-0/rev84/U/`, branch `r84`, 14 commits on `r84base`. All of it reaches the site at **step 1** of the owner's order (the Worker deploy). Nothing is derive-time or index-time, and none of it needs the new corpus.

Tests: 7 new unit files (`tests/unit/r84u-*.test.ts`, 18 tests) and one browser spec (`tests/e2e/r84u-frame.spec.ts`, 12 tests in Chromium and the phone).

- **The browser spec on the base.** It was run against a build of `r84base` on port 4845. All 11 tests then in it failed, each on the line its comment names. The 568 x 320 case was added after that run.
- **The unit tests on the base.** Each was failed by stashing the fix (B5, A16) or by a missing export (A14, W13, B12, B9). The rule each tests is stated in the file's header.
- **Checks.** `tsc` and `svelte-check --threshold error` report nothing. The nearby unit files (93 that reference my files) pass. These browser specs pass in Chromium and the phone: r82d-record, r81u-compare, r67p-pages, r63v-visitor, r81u-phone, r61a-a11y, r62ba-interface and r80u-layout (111 tests).

## Done

- **A14: one rule for an instant against a local day.**
  - `src/lib/core/dates.ts` gains `localDateOf(instant)` and `daysSince(instant, day)`.
  - Today's "backup / synced N d ago" reads through them. So does the backup page's "today / yesterday / N days ago", which counted 24-hour spans, and the file's "taken" date.
  - A grep test fails on any `slice(0, 10)` or `substring(0, 10)` in the device's code that is not on a named list. The list has six entries, each with its reason: the repair note's UTC day (kept so every device derives the same note), the forecast's solar day, the CSV day number and three reference build stamps.
  - Tests: `r84u-instants.test.ts` (New York and Auckland), and the browser test "at 9.30 pm in Pittsburgh… today". The base said "backup -1 d ago".
- **W8: a restore counts as a backup at once.**
  - `restoreBackup` returns `countedAsBackup`, and the page reads `lastBackup` again.
  - `countedAsBackup`'s silent catch now warns.
  - Browser test: the base still said "never".
- **A13: the restore sentence.**
  - Svelte drops whitespace at the start of a block, so "removed.The file's…" lost its space. Four such spaces are now explicit, and the list reads "site and units" (`listWords`).
  - The catalogue's four chips each have one accessible name: "No climate: 9,711 species, 919 of them not checked". The base read it in pieces.
  - Both have browser tests.
- **B5: the number ledger.**
  - A Replace writes one `setting` record into the replacement's log, id `numbers-kept-<id>`, with fields `accession` and `sowing`. It holds the numbers this device has given (the ledger, the records' own `acc`/`no`, earlier kept numbers) that the file does not carry.
  - `takenNumbers` reads these records with the ledger. The repair's log-only reading does not, so every device and version repairs alike.
  - The merge preview names the record apart from the numbering scheme.
  - Test `r84u-ledger.test.ts` runs B's reproduction through the backup page's own calls, on a real vault. The base offered 2026-0002 again.
  - `r60-review-backup.test.ts` now expects the file's log plus this one record.
- **A16, the sync and frame points.**
  - `NotReached` (exported from `engine.svelte.ts`) is the only error read as "not reached". It covers fetch's own failure, a timeout, and an answer cut off mid-read (syncFetch now reads the body inside its limit). Any other error is a failure, not retried every minute.
  - A photograph answered with a 5xx waits for the next run. The run goes on to the others and to `dropRemoved`. `sync.photosLater` counts these.
  - The frost bar's 72 hours count from now (`nowMs`), not from the forecast's reading.
  - `siteName()` in `site.svelte.ts` cuts a name to 120 characters at a word and removes control characters. It applies to a name from a file and to one already stored.
  - The rebuild and catch-up after another tab's notice no longer fail silently. `collection.readBehind` is shown in the layout with a Reload button.
  - Tests: `r84u-sync.test.ts` (base: offline true, and "photo …: 500" ended the run), `r84u-frame-notes.test.ts`, and a from-now case in `r82d-frost-bar.test.ts`.
- **P2, A12, B4: My plants holds its layout.**
  - A new `src/lib/ui/frame.svelte.ts` lets a page hold the footer. /plants holds it until its list is drawn, and /today until its stops are.
  - The backup line is decided in GrowLayer but drawn by /plants in its notices' place, under the search, with the list. Before, it was above the title, a moment late.
  - /plants draws its list, search, count and notices together once `persisted`, the last backup and sync's key are read (at most 400 ms).
  - The line is now on My plants only, not on a plant's page or the add form.
  - Tests: the position recorder in every engine (base: the title moved 93 px), and a layout-shift reading at CPU x4 with 400 plants (base 0.105, now 0.0000).
- **A17 and P3: the top bar.**
  - Under 960 px the five places are set closer.
  - When short and narrow (≤700 px wide and ≤480 px tall) they are shown in the top bar. Below 600 px they are closer still.
  - Tests: 640 x 400 and 568 x 320 (base: hidden). At 750 x 342 with 47 px insets set through CDP, every control ends inside the inset (base 729.7, limit 703).
- **P4: the compare tray and pill are on species pages only.** The Compare page already showed its picks itself. Browser test: the base had the pill on /plants. `r81u-compare` and `r67p-pages` were updated to follow.
- **P8: inline link buttons.**
  - Under a coarse pointer, `.linkish` takes 44 px as an invisible `::after` margin, as the number chips do, instead of a min-height. /plants' own scoped min-height went too.
  - Browser test: the base made a 44 px line.
  - `r81u-phone` 5 now reads "Show all"'s finger target instead of its box.
- **W13: the icons.**
  - The PNGs' `caBX` chunk (C2PA) is removed. IHDR and IDAT are byte-identical, so the pixels are unchanged, and the test checks this against `r84base`.
  - `favicon.svg` is only its drawing, with a stated size: 7,997 B became 246 B.
  - The manifest now names only the three PNGs, which removes the SVG that Chromium reported.
  - Test: `r84u-icons.test.ts`.
- **B12: predeploy's last line.** A new `scripts/predeploy-scope.mjs` decides the line from what was run. Only the whole suite in every engine says "the deploy may go ahead". A Chromium-only run is named as the corpus tier's gate. A spec, a filter, a repeat, a shard, another config or a subset of projects says what it proved and names `--tier=app`. Test: runs the real script over a one-test config, plus each scope's words.
- **B9: the live check.** `scripts/live-check-cache.mjs` reads the `cache-control` of the check's GET of `/api/index`. Anything over 300 s fails, with a message that names the zone setting and says that no rollback is needed. `LIVE_CHECK_SKIP=index` leaves the check out.
  - Run against the local server it passed ("ok index: cached as the route says (public, max-age=300)").
  - Through a proxy that set `max-age=14400` it failed with that message.
- **DEPLOY.md.** A new section "Round eighty-four: the collection, the frame and operations (agent U)".

## Decisions I took

1. **B5's record is one per Replace** (`numbers-kept-…`), not one shared record. Two Replaces on two devices then never overwrite each other's numbers. The record is read with the ledger, never by the number repair, which reads the log's own numbers so mixed versions repair alike. Old-shape records (number as id) are not copied, since the file carries them whole or not at all.
2. **The backup line is on My plants only.** Drawn above every `/plants/*` page's title, it could not avoid pushing the page. A plant's page and the add form keep their first screen for the plant.
3. **The compare tray and pill are on species pages only, on desktop too.** The desktop tray covered the same lines. Picks stay in the tray and reach Compare from the menu and the footer.
4. **The manifest drops the SVG icon** rather than keeping it with a size. The PNGs cover every install surface, the tab keeps the SVG through `<link rel="icon">`, and the console error cannot come back.
5. **`syncFetch` reads each answer whole**, so a connection dropped mid-body counts as "not reached", as it did when every TypeError counted. Every caller already read the whole body.
6. **P5: no cut.** See Measured and Not done.

## Measured

- **My plants, 400 plants, 390 x 664 phone, CPU x4, 1.6 Mbps and 150 ms, cold fold.** CLS was 0.1049 on all four loads on the base (the header pushed 93 px by the backup line). After: 0.0000, 0.0004, 0.0004 and 0.0004. The browser test reads 0.0000.
- **Front page, cold, CPU x4.**
  - **Local fixture:** blocking time 148 to 215 ms, 47 JS files, 426 kB decoded.
  - **Live page** (a trace of 2 loads, then one HAR replayed offline): the largest single cost on the main thread is the **first layout of the server's HTML, 250 ms of a 369 ms task**. Hydration (`RunMicrotasks`) is about 250 ms, and script evaluation is under 100 ms.
  - **What changes the first layout.** It costs about the same on the local 239-object page (192 ms). It does not drop with system fonts, without the strip, or without the catalogue rows. So most of it is this container's first-layout setup, not the page.
  - **`content-visibility` on the rows.** In 6 locked runs the minimum first layout went from 181 to 89 ms, but the medians did not move (343 and 371 ms).
- **Live requests:** about 220 (traces and one HAR), at the review user agent, third parties refused. `/api/index` was not fetched live.
- **Icons:** 192 px 9,723 → 3,953 B; 512 px 17,563 → 11,793 B; maskable 15,917 → 10,147 B; favicon 7,997 → 246 B. The pixels are identical.

## For the owner's PC

Nothing to run beyond the round's `npm run deploy`. If its live check stops at `/api/index's cache lifetime: it says max-age=14400`, do not roll back:

1. In the Cloudflare dashboard, open zone cultifolio.com, then Caching, Configuration, Browser Cache TTL, and choose **Respect Existing Headers**.
2. Purge `https://cultifolio.com/api/index`.
3. Run `npm run live-check` again.

DEPLOY's new section says this.

## Touched outside my files

- `src/lib/core/dates.ts`: two exports added.
- `src/lib/ui/frost.svelte.ts`: `hoursTo` measures from now.
- `src/lib/ui/site.svelte.ts`: `siteName`.
- `src/lib/ui/backup-reminder.svelte.ts`: `known`, `hidden`, `hideNudge`.
- `src/lib/ui/grow/GrowLayer.svelte`: decides the line but no longer draws it.
- New `src/lib/ui/frame.svelte.ts`.
- `src/lib/ui/theme.css`: the two `.linkish` rules (lines ~478 and ~524).
- `src/routes/today/+page.svelte`: the footer hold, 5 lines.
- Tests:
  - `fold-rules.test.ts`: the hash re-recorded under 8, because `load()` and `pull` changed. No fold changes.
  - `r60-review-backup.test.ts`, `r82d-frost-bar.test.ts`, `r81u-compare.spec.ts`, `r67p-pages.spec.ts` and `r81u-phone.spec.ts`, as above.
  - New fixture `tests/unit/fixtures/r84u-pw/`.
- **For A (the about pages), these sentences are now untrue:**
  - /about/how: "within 72 hours of the forecast" should read "within 72 hours".
  - /about/how: the privacy passage's "the compare tray" on private pages. The tray is on species pages only.
  - /about/formats: the `setting` kind should add `numbers-kept-…` (`accession`, `sowing`: numbers a Replace kept).
  - Where described: the backup line is on My plants only, under the search; sync's "offline" is only a request that failed on the way; a site name is at most 120 characters.

## Not done, with why

- **P5's cut.** The largest cost measured is the first layout. On this container it is roughly constant whatever the page holds, so I could not show a page-side cause.
  - **The one candidate:** `content-visibility: auto` on the catalogue's genus rows. It halved the best first layout but not the median, and it would change the row geometry that Back's position restore and the letter jump depend on.
  - **Making the layout's collection and sync chunks lazy** (131 of 426 kB) would touch every page that imports them. Neither is safe without a measurement on a real iPhone.
  - **Recommendation:** a Safari Web Inspector timeline of a cold front page on the owner's iPhone before any cut.
- **WebKit and Firefox** were not run here. The PC's predeploy runs the new spec there. The CLS and landscape-inset tests are tagged `@chromium`, and the position recorder covers P2 in every engine.
