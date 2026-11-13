# Round 88: the speed round

The owner asked, on 11 November 2026, for the corpus steps to run faster, as long as each change is safe. The measure is
round 87's stage 2: two days for a dry run and a walk of 48,375 pages. Where the time went, from that run's log:

- **GBIF's throttle.** About 1,700 species the download left to the API path (`bulk/api-path.txt`: more records than its
  cut) are asked of GBIF's occurrence search, up to eight requests each. At a fixed 250 ms GBIF answered 3,663 requests
  with a 429 and a Retry-After of 3 s: about three hours of waiting in one pass, and the pass waits for each.
- **The bulk files read again by each step.** About 75 minutes a step to stream the 62 GB occurrence download down to the
  35 M rows kept, and the photographs' 85 M rows, before the first page.
- **Every page derived twice.** The dry run derives all 48,375 pages and keeps nothing; the walk derives them again.
- **One page at a time.** The loop awaits each page in turn, so a page waiting on GBIF holds up every page after it, and
  the build uses one of the PC's sixteen threads.

## The rule for every change

Each change is proved by the pages it writes: the same species built the slow way and the fast way give byte-for-byte the
same dossiers (the build's timestamps aside, which the comparison reads as equal by name). A difference is a bug, never a
trade-off. Nothing here changes what a page says.

## The changes, as made

1. **GBIF's gap follows its throttle** (`src/lib/dossier/fetch.ts`, `ADAPTIVE`). A 429 on a first try doubles the gap to
   api.gbif.org (500 ms, then 1, 2 and at most 4 s) and says so in the log ("asked too fast; one request every N ms from
   here"); twenty answers in a row on a first try ease it back by a fifth, never below its 250 ms. Other hosts keep their
   fixed gap. Timing only: what is asked, and what an answer gives, are unchanged. Test: tests/unit/r88s-pacing.test.ts.
2. **The walk reports what the dry run reports** (`scripts/build-dossiers.ts`). As each page of an offline `--walk` is
   written, its change against the dossier it replaces is kept, a line a page, in `walk-changes.jsonl`; at the walk's end
   the totals of every page of this walk (the parts before a stop too, the last line of each page) are printed as the dry
   run prints them ("The walk, rule … against the dossiers before it"), with the habitat figures, and the pages that change
   are written one a line to `walk-ranges.txt`, as the dry run writes `dry-run-ranges.txt`. The walk writes to the local
   corpus as before, and nothing reaches the site before the upload step, so the review of the walk is still read before
   anything goes live. A plan may therefore leave the dry run out and read the walk's report in its place; the dry run
   stays, for a run that wants one. Tests: tests/unit/r88s-walk-report.test.ts 1 and 2 (the walk's totals and list are the
   dry run's, in one run and over a stop).
   (Planned at first as a staging folder and a promote step. Not needed: the local corpus is already the staging folder,
   since the upload is the step that publishes.)
3. **The bulk files read once** (`scripts/bulk-cache.ts`, `scripts/bulk-load.ts`, `OccIndex.dump`/`restore` and
   `MediaIndex.dump`/`restore` in `src/lib/dossier/bulk.ts`). After the occurrence download and the photographs are read,
   the sampled index is kept in `bulk/.cache/occ-<key>/` (about 3 GB for the whole corpus), and the next build with the
   same key reads it back in place of the 62 GB. The key is everything that decides what is kept: each file read (path,
   size, modified time, md5 of its first and last 64 MB), download.json and media-download.json, the cap, the keys wanted
   and those read under others, and the code that reads them (bulk.ts, bulk-load.ts, bulk-cache.ts). Anything different
   and the files are read, as before; only the newest cache is kept; a cache that cannot be read whole is passed over and
   the files read. A dry run reads a cache and writes none. `--no-bulk-cache` reads the files whatever is cached.
   With it, a walk resumed after a stop keeps the keys of the whole walk, the pages derived before the stop too, as the
   walk begun kept them. That also mends a fault found on the way: which page a photograph of a subspecies goes to depends
   on whether its species' key is kept, so a page derived after a resume could have been given photographs an unbroken
   walk would have given its species. Tests: tests/unit/r79d-gbif-forms.test.ts ("r88s 3", each download form read off,
   written and read back the same; a changed download or other species read afresh; a dry run writes nothing; a cut
   cache passed over), r88s-pages 3 (pages built with and without the cache), r88s-walk-report 3 (a resumed walk reads
   the cache the walk begun wrote and writes what an unbroken walk writes).
   Not Kew's names: loading them is a minute, not an hour.
4. **Pages in parallel** within one process (`scripts/build-dossiers.ts`, `--pages N`). An offline build derives up to
   eight pages at once (1 to 32 with `--pages`, `--pages 1` as before); everything after the derivation (the tallies,
   the log, the write) is done in the list's order, so the log and the files are as one at a time gives them. An online
   build stays one page at a time: Wikidata's lag and the sources' pacing are read page by page. The climate cache is
   written whole and then renamed, so two pages asking for one cell never read half a file. Tests: r88s-pages 1 and 2
   (twelve pages at 1 and at 8 in flight: the same pages, the same page lines, the same dry-run totals and records; the
   trace shows the pages overlapping at 8 and not at 1).

Left out: rebuilding only the pages a change touches. A page whose inputs changed in a way the shortcut did not foresee
would keep old figures and nothing would say so.

Deferred: more than one process (worker threads). Each would need the bulk index, about 3 GB, in its own memory, on a
PC of 16 GB whose build already runs with an 11 GB heap. With the cache it becomes possible to read the index once per
worker in a minute; it waits for a measure of what 8 pages in one process gives.

## Proving it on the owner's PC

The tests prove the rule on twelve pages. On the PC, before a round relies on it, `node scripts/dev/r88-prove.mjs`
builds 200 real pages (spread over the index; none on the API path, whose answers GBIF may change between two builds)
three ways: A `--pages 1 --no-bulk-cache` (as round eighty-seven built), B `--pages 8` (the files read, the cache
written), C `--pages 8` (the cache read). It compares A with B and B with C page by page, the build's times taken out,
and says "the same" or names each page that differs and where (r88-prove/result.txt). After each build it puts back
everything the build wrote (the sample's pages, the corpus folder's index.json and report.txt, the project folder's
lists), and stops if a build changed a page outside the sample. About three hours, mostly the two reads of the 62 GB.
It takes corpus-step.lock, so it never runs beside a corpus step. A difference stops the round, and the plan runs with
`--pages 1 --no-bulk-cache`, as round eighty-seven did. Test: tests/unit/r88s-prove.test.ts.

## What a round saves

Measured on round eighty-seven's stage 2, estimated: the 429 waits (about three hours a pass) mostly go; the second
75-minute read of the bulk files goes for a resumed walk and for a build of the same pages again; the dry run (about a
day) can be left out of a plan; the walk itself, with eight pages in flight, is bounded by the PC's one thread for the
rest of each page, and its time is to be measured, not promised.

## Round 89: the round's own steps

Asked on 12 November 2026 ("any other ways to increase the speed and efficiency regarding all of the actions we repeatedly
do for each round"; the owner took all four of the proposals, and option 1 of the API path's three):

1. **GBIF's occurrence search asked once for a download** (`src/lib/dossier/api-answers.ts`, `scripts/api-answers-store.ts`).
   About 13,600 requests and GBIF's throttle on every offline pass. An offline build keeps each answer of the species the
   download left to the API path in `bulk/api-answers/` (gzipped, one an address), and every offline pass after reads it in
   place of asking. The answers belong to the download: a new download.json key or api-path.txt clears them. A dry run reads
   them and keeps none; `--no-api-answers` asks as before. The page derived from a kept answer is the page derived when GBIF
   gave it; its record says the day GBIF's search answered ("GBIF's occurrence search as it answered on …", and `asOf`),
   which /about/formats now says. Online builds ask GBIF as before. Test: r89a.
2. **A review stop that checks its own figures** (`scripts/review-checks.mjs`, `expect` lines in a plan). Every condition of
   a review that is a figure becomes a check of the builder's output since the review before; all holding, the run carries
   on, saying each figure; any not, a stop as always. A review with a judgement no check can make keeps no `expect` lines and
   stops for the owner. The daily plan's review is given its figures. Each step's output is kept with the run
   (corpus-step.out-<n>.txt), so a review after a restart still checks it. Test: r89b.
3. **The deploy leaves out what the predeploy just passed** (`scripts/deploy-stamp.mjs`, `node scripts/deploy.mjs`). A
   predeploy with a tier, passing, stamps the code it ran on (the commit and every changed file by content);
   `node scripts/deploy.mjs` leaves out the unit tests (and svelte-check, after `--tier=launch`) for exactly that code, and
   always builds, deploys and runs the live check. `npm run deploy` is unchanged. Test: r89c.
4. **Pages with no GBIF key are not offline gaps** (`offline-list.ts`, `derived-dataset.ts`): not listed for an online build
   (599 of stage 2's 600), and counted as holding no record through GBIF's search rather than as unknown. Test: r89d.
5. **Delivery by git bundle**: a round's commits fetched onto a local branch, the predeploy run there, `main` moved and pushed
   only after it passes. The owner's choice, which relaxes "commit only after a clean predeploy" to "nothing reaches main or
   GitHub before a clean predeploy".

Also in this round: round 87's stage-2 fix (a summary that is another plant's article taken off by the check's own rule) is
carried, as committed on the owner's PC (0f02f73).

## Record

- 11 November 2026: asked by the owner during round eighty-seven's stage 2 dry run ("as long as all of them are safe to
  pursue, lets do them all at the same time"). Rebuilding only the pages a change touches was left out as unsafe.
- Items 1, 4 and 2 made and tested in that order; item 3 made with the whole walk's keys for a resumed walk, which also
  mends the photographs a resumed walk could give a subspecies' page (found while making it). Whether an earlier walk
  was resumed is in corpus-step.log ("the walk began …: N pages derived since"); a page it touched is set right by the
  next walk, which derives every page.
- Not yet run on the PC: delivered after round eighty-seven's stage 2 is uploaded and its live check passes, then proved
  with r88-prove.mjs before a plan relies on it.
