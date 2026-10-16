# Round seventy-two: the merge

The six branches were merged in the order D, A, B, C, E, F, then F's pass over the about pages on the merged tree.

## Conflicts and how they were settled

- **`scripts/build-dossiers.ts`, the imports (A against D).** Both lists kept: D's `rmSync`, `renameSync`, A's `loadKewNames`, `kewFileDay`, `fillKewNames`.
- **`scripts/build-dossiers.ts` (C against D).** C's imports beside D's; `--fill inat`'s fetcher is D's `upstream()`, not a new `makeFetcher()`, as the day-cache seam test requires.
- **`src/lib/dossier/schema.ts` (C against A).** One copy of `name.kew`, with A's `name.cited` beside it.
- **`src/routes/species/[slug]/+page.svelte` (F against B).**
  - The range note is F's, from `ui/ref/notes.ts`, which links the entry's page by the index's slug.
  - B's "Doubtfully present in" row is kept.
  - B's `rangeNote` in `range-via.ts` is removed, so the page has one note and one test of it (`r72b-ranges` now tests `notes.ts`).
  - An Unplaced name's own range (B8) gets its clause in `notes.ts` (`Via.unplaced`).

## Needs applied at the merge

- **D's needs of C.**
  - `fillInatDescendants` and `markSharedPhotos` write through `writeAtomic`.
  - `--fill inat --bulk` marks the run unfinished (exit 3) when iNaturalist refuses or a page is not answered.
- **One day for Kew's files.** `kewFileDay` (A) and C's loader read B's `wcvpFileDay`, which is README_WCVP's "Extracted" day, else the file's own date. On the owner's files it is 2026-06-04.
- **The plan's order (`scripts/corpus-plan.txt`).** `--fill kew-names` runs after `--fill kew-links`: a page cites the name whose number it links. It runs before `--fill range-source`, which settles the range note against the cited name.
- **`docs/DEPLOY.md`.** The browser suite's four workers (WebKit held to two) and the three tiers.
- **No real person's address** in a test or a comment: C10's fixtures use example.org and example.net. Its review report names the two pages without the addresses.

## Added after the dry run

- **The corpus step says a quiet step is still working.** `--fill kew-links` printed nothing for 38 minutes of the dry run. A line every two quiet minutes ("… still working: N min on this step so far. Leave it running.") now goes to the screen and the log. Tested in `r72d-corpus-step`.

- **A WebKit race in a round-61 guard.** The owner's `--tier=app` run (1,320 passed, 17 skipped, 37.7 minutes) had one flaky test: `r61l-records` "Undo of a removal, pressed after opening another plant". A toast goes at a navigation more than 600 ms after it was raised, so the guard passed only when both navigations landed inside 600 ms. In WebKit under four workers they took 1.3 s (the trace), and the Undo was gone. The guard is about which plant the Undo brings back, so it now holds `Date.now()` still (`page.clock.setFixedTime`; the timers run). With an 800 ms pause added before the second navigation, the old guard fails as on the PC and the new one passes.

## Runs on the merged tree

- **Unit:** 3,826 passed, 8 skipped; `tsc` and `svelte-check` clean.
- **Strict Chromium and the Chromium phone at four workers:** 474 passed, 5 skipped, none flaky, 12.0 minutes.
- **About pages (F, after the pass):** 30 unit and seam files (395 tests), and 54 browser tests in strict Chromium.
