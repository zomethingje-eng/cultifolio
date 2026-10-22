# Round 80, agent S: search and the catalogue

Branch `r80f` in `/tmp/claude-0/rev80f/S/`, six commits on the tag `r80f` (3a83381 to f3818dc). Scratch: `/tmp/claude-0/rev80f/S-s/` (notes, the Kew-augmented live index `m/live-kew.json`, the two iNaturalist runs, logs). The 2 GB of full-size key files and the two workerd corpora were deleted after measuring.

## Done

**1. Kew's older names are found** (review-d 5). `scripts/build-dossiers.ts` (`indexEntry`, 3 lines) writes `kew` into each index entry: Kew's names (`name.kew.synonyms`) that `syn` and `older` do not hold (`kewOlderOf`, `src/lib/dossier/index-entry.ts`). GBIF's names and the merged pages' names already reach `syn`/`older` through `name.synonyms` (`extraNames`).

I first put them into the word trees, as `older` is. That grew the key files from 1,830 MB to 2,574 MB (+41%) and the largest file from 1.06 to 1.43 MB, so I took it out. Kew's names are now read only as a name typed: two words or more, the genus first and in full, the last word a prefix. They are never read by a similar spelling or by a word alone (`kewTyped`, `src/lib/core/search.ts`). They rank in the older names' group, so a page whose own name it is comes first. Each genus gets one small file, `@<genus>`, which the exact pass reads beside its own files (`src/lib/core/search-files.ts`). At the full size that adds 6,610 files and 8 MB (largest 51 KB): 1,839.4 MB in all. The word trees are byte-for-byte unchanged.

Nothing a page shows changes: the photograph rules, the addresses and the shown older names read `syn` and `older` only. The import check (`src/lib/import/check.ts`) reads `kew` too.

Results on the full key files: "Echinocactus chrysacanthus" → Ferocactus chrysacanthus, "Aloe amoena" → Aloe framesii, "Lavandula officinalis" → L. angustifolia first.

Tests: `tests/unit/r80s-search.test.ts` checks that whole index and key files give the same answers, and that the word files are unchanged. It fails on r80f at import (`kewOlderOf` does not exist). Safe mid-fill. It reaches the live site with the plan's own `--index`.

**2. The true count, and the rest** (review-w 2, review-p 3).
- Server: every pass ranks all its candidates and returns `total`. Heavy keys' answer files now store `n`, the whole index's count, and an answer says `kept: 100` where only the best hundred can be listed. `/api/search` takes `&at=` (at most 2,000) and sends `X-Search-Total`, `X-Search-Kept` and, with `shape=2`, `total`/`kept`/`at`. The search cache key includes `at`.
- Front page (`src/routes/+page.svelte`, `src/lib/ui/ref/searched.ts`): it says "30 of 259 matches". "Show 60 more" pages through. Where the server can list no more, it says "The first 100 of 3,402 are listed: type more…". A genus typed alone links to its row of the catalogue ("Every species of *Echeveria* is in its row of the catalogue").
- An old corpus has no `n`. On it, the page says "The first 30 matches" and pages up to the kept hundred.

Tests: unit test (whole index against files, page 2 equal); `tests/e2e/r80s-search.spec.ts` on desktop and phone (all 10 fail on r80f). Safe mid-fill. Deploy only; the counts of heavy words arrive with the next `--index`.

**3. Speed** (review-c 7, review-w 7 and 14, review-p). Where the time goes: the Worker waits on at most six reads at once (Cloudflare's limit, quoted in review-c's `C-s/cf/workers_platform_limits.md`).
- A cold search read its pieces one after another: `top`, then the word's directory, the key file, `tables.json`, `blocks.json`, the photograph blocks, and then **one show block per hit**. Sixty scattered hits made ten waves of reads; "x" and "rose" took 2.2 to 2.6 s live.
- Now the directories of the query's words, the tables, `blocks.json`, the genera and every photograph block are asked at once. The search route starts them before it waits on the address's allowance (`warmSearch`, `searchDirsOfQuery`).
- The front page asks for 30 hits, not 60 (`SEARCH_PAGE`).
- The species 404 asks its nearest names beside GBIF's name service instead of after it (`src/routes/species/[slug]/+page.server.ts`, 6 lines). That is in A/U's route, done because it was my item.
- CPU is unchanged within the profiler's noise (Measured).

Safe mid-fill. Deploy only.

**4. A region search** (review-w 6).
- A region of origin typed whole whose every word is heavy is answered from the build's own best hundred, with its count. There are 34 such regions at the full size: the `=<words>` keys. "cape provinces" now lists 30 of 4,787.
- Any query that names a region, in part or misspelt ("cape prov", "provinses", "madagascr"), is answered with "“Cape Provinces” is a region of origin; in the Origin grouping it is part of Southern Africa", linked to `/?by=origin&open=southern-africa`, beside the "too many" sentence where that stands (`regionsTyped`, `src/lib/core/regions.ts`; `X-Search-Regions`).
- The page does not claim the row lists only that region's species: species are grouped by where most of their regions fall.

Tests: unit and e2e. Safe mid-fill.

**5. Most grown** (review-w 1). I ran `scripts/most-grown-genera.ts` from here, at one request every 2 s (227 requests a run, two runs).
- The first run was over the live index's 6,529 genera.
- The final run was over the union of the live index and `scripts/species-list.txt`, 6,539 genera, because ten list genera are filed under other genera live, Eriobotrya and Lophocereus among them.
- Result: 6,449 counted, 0 not checked, 90 refused, day 2026-10-22.
- The chip goes from 95 genera and 6,853 species to 118 genera and 8,278 species. Quercus, Pinus, Phalaenopsis and Echeveria are now under it.
- `/about/how` now gives the day and says the count was made over "6,539 genera, every genus of the reference's 48,361 pages and of the species list they were built from, and 6,449 of them were counted". It also says a genus that joins the reference later is not counted until the count is made again.

Tests: `tests/unit/r75g-opening-rule.test.ts` (the sentence read from the file's `index` line), a full-list coverage test in r80s (fails on r80f: 5,217 genera missing), and `tests/e2e/r75g-most-grown.spec.ts`. The fixture's grown genus is now Hesperocyparis (16,980 captive observations), which the old file never counted. It is bundled into the Worker, so it is live at the deploy. Safe mid-fill.

**6. Letters, picker, tiles** (review-w 8, 10, 11).
- Letter index: wider than a phone, the letters share the line evenly. From 1000 px they sit on one line, and at 641 to 999 px in rows of thirteen. This works whatever the number of letters. The e2e test checks all 26 on one line at 1440 and 1280 px, each at least 24 px wide (fails on r80f).
- Picker: "Aloe × nobilis" (not in the reference) offered Margaritaria nobilis ("alte-" of an older name) and Alocasia sanderiana ("aloc-"), each one letter from "aloe". A word that is a genus of the reference, typed in full, is now matched as typed in the similar-spelling pass. The query then finds nothing as written, and is answered by its first parent, Aloe, with "Showing results for". `/about/how` says so.
- `tests/unit/postings.test.ts` now prepares its candidates with the whole index's genera, as the server has done since round seventy.
- Hybrid tiles and the picker's hint: these are U's code, so they are written up as needs below.

**About pages.** `/about/how` (my lines only):
- the search paragraph: Kew's names, a typed genus, regions, the count, Show more, the genus row;
- the search-files sentence: answers with counts, region answers, Kew files;
- the Most grown sentence: the day, the genera, the counted.

`/about/formats`: `&n=`, `&at=`, `X-Search-Total`/`Kept`/`Regions`, the shape-2 fields, and the index entry's `kew`.

DEPLOY.md: a new section, "### Round eighty: search and the catalogue (agent S)".

**Updated tests and why.**
- `r77k-search-files.test.ts`: "Cape Provinces" is now answered rather than narrow, so it moves out of the narrow list. `kept` is ignored when comparing with the whole index, because only the files path keeps a hundred.
- `r75g-*`: the new day and counts.
- `postings.test.ts`: as above.

**Runs.** Whole unit suite once, alone: 4,319 passed, 10 skipped, 0 failed. `tsc` and `svelte-check` are clean. E2e, desktop and phone:
- r80s, r77k-narrow, r75g, r61q: 21 passed;
- r73p-front, r63fv-front, r60-grow, r62bq/r62q-picker, r63v-visitor, r63h-phone, r62w-pages, r79k-no-gbif, r78i-ids, smoke-1, smoke-2: 112 passed.

## Repairs for the live site

None. No dossier changes. Kew's `@` files, the region answers and the heavy words' counts are written by the plan's own `--index` (step 12) and reach the site with its upload. Until then the new Worker reads today's corpus as before, plus the count, regions and paging it can give.

## Needs

- **U (tiles):** "Aloe × nobilis" shows as "Aloe nobilis · not in the reference" on the "your species" tiles. `speciesOf`/`speciesSlug` (`src/lib/core/names.ts`), as used by `mySpeciesOf` (`src/lib/db/species-list.ts`), drop the ×. The resulting slug is `aloe-nobilis`, where the reference's is `aloe-x-nobilis` (as `adenia-x-obcordellum`). Taxon record ids are these slugs, so a change needs a migration or a second lookup.
- **U (tiles):** a plant filed under a genus ("Echeveria 'Perle von Nurnberg'", GBIF 5362052) shows "Echeveria · not in the reference". It should be a genus tile linking to `/?by=genus&open=echeveria`, since the reference holds 220.
- **U (picker hint):** `src/lib/ui/SpeciesPicker.svelte:445` says "press Add to keep exactly what you typed", while /plants/new's button reads "Add as typed". The picker is also used on propagation/new and plants/[acc], where the button differs, so the hint should take the form's button text as a prop. `tests/e2e/helpers/smoke.ts:26` matches the current wording.
- **O:** none. The sentences I changed are listed above.

## For the owner's PC

Nothing to run before the deploy. Deliver with `npm run deploy` any time, the fill included.
- `scripts/corpus-plan-full.txt`, `corpus-step.mjs` and `src/lib/dossier/` (other than adding `kewOlderOf`) are unchanged.
- `build-dossiers.ts` changes only what `--index` writes.

The checks after the deploy and after the plan's upload are in the DEPLOY section: four curl lines.

## Measured

**Live, before** (14 requests to cultifolio.com, fresh `n` each, through the proxy):

| Query | First byte |
| --- | --- |
| rose | 2.23 s |
| cactus | 1.96 s |
| x | 2.59 s |
| red flowers | 3.21 s |
| haworthiaa | 1.77 s |
| lithops | 1.61 s |
| Echinocactus chrysacanthus (no hits) | 1.34 s |
| zzqqxw | 1.22 s |
| echeveria | 0.54 s |
| snake pl | 0.50 s |
| /species/no-such-plantus-s80 (404) | 3.62 s |

GBIF's match alone was 0.72 s from here. After-deploy live timings need the deploy.

**Simulated cold search** over the full key files (`scripts/dev/scale/r80s-search-time.ts`; 40 ms a read, six at once), base at 60 hits against new at 30:

| Query | Base | New |
| --- | --- | --- |
| rose | 691 ms | 410 ms |
| cactus | 641 ms | 355 ms |
| x | 745 ms | 402 ms |
| red flowers | 1,889 ms | 604 ms |
| haworthiaa | 672 ms | 392 ms |
| echeveria | 336 ms | 207 ms |
| Aloe amoena | 1,161 ms | 217 ms (now found) |
| Echinocactus chrysacanthus | 673 ms (none) | 208 ms (found) |
| a single letter or a nothing-matches query | about 4 waves | one more |

The extra wave for the last row is the prefetch of the twelve photograph blocks, paid once per copy.

**Worker CPU in workerd** (`page-cpu-workerd.mjs`, one warm copy; `results/r80s/workerd-cpu.txt`). Within the profiler's noise, about the same:

| Query | Base | New |
| --- | --- | --- |
| rose | 283 ms | 257 ms |
| x | 176 ms | 221 ms |
| red flowers | 280 ms | 173 ms |
| echeveria | 23 ms | 31 ms |
| Lavandula officinalis | 11 ms | 27 ms (reads `@lavandula`) |
| cape provinces | 14 ms (narrow) | 57 ms (answered) |

**Sizes at 48,361 species:**
- Key files: 1,829.8 → 1,839.4 MB. Kew in the word trees would have been 2,574 MB.
- `index.json`: 32.4 → 34.1 MB compact.
- Kew names: 71,424 on 10,673 pages, from Kew's file in `/home/claude/r73data/bulk`.

**Third-party requests:** api.inaturalist.org 454 at 2 s; api.gbif.org 1; developers.cloudflare.com 0.

## Not done, with why

- **Each hit shown is still one read.** To end that, the key files would have to carry thumbnails and counts, and a photograph refresh would then rewrite all 1.8 GB. I cut the page to 30 hits instead.
- **"rose" ranks genera beginning with "rose" before Rosa** (review-c 7). That is a ranking change I did not attempt.
- **GBIF's older names below species past the six shown** (17,941 on the 8,947 real pages) are still not searched. A label with a rank is answered by the retry on its first two words.
- **The hybrid tiles and the picker's wording** are U's code (Needs).
- **The new tests fail on r80f** as stated, but the unit file fails at import on r80f rather than by assertion.
