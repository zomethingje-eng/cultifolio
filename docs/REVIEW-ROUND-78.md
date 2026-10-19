# Round seventy-eight: the species list, pages keyed by Kew's id, and the build's sources

Round 78 is round 78 of `SCALE-STUDY.md`'s plan: what round 79 needs to build about 48,000 species on the owner's PC. It has three parts, one agent each, and a merge:

- **S** writes the species rule the owner chose as a re-runnable, sourced list.
- **I** keys every page by Kew's `plant_name_id` instead of GBIF's backbone key.
- **B** moves the build to bulk and batched sources, and switches literature off.
- **M** merges them, in the order I, B, S, and proves the merged code.

Their reports are `review-78/S.md`, `I.md` and `B.md`. The dossier format moves to version 3 (`s/v3/`), `FOLD_RULES` stays 8 and the device database stays at version 4. This round has a corpus step, which asks nothing of any source and changes no page's content: it writes every dossier again under its page's id.

## 1. The owner's decisions

Binding, from the brief (2026-10-19):

1. **The species rule.** Every species Kew accepts with at least three cultivated records, plus every accepted species of the collector genera kept whole. Cultivated records are iNaturalist observations marked captive or cultivated and GBIF living-specimen records from living collections. Genebank and germplasm datasets are not counted, by a stated, sourced rule on each dataset, every excluded dataset listed. No family is excluded.
2. **Literature (OpenAlex) is dropped from the build for now.** Pages say "not checked", never "none".
3. **GBIF's occurrences:** the standard download stays the path.
4. **Page ids by Kew's `plant_name_id`;** addresses do not change.
5. **Name matching** also accepts iNaturalist's published mapping to Kew's taxonomy, every refusal listed.

And three since, during the round:

- **Cultivated photographs** are taken from captive observations whose identifications agree (B).
- **The seven pairs** of pages that Kew holds as one taxon are all merged, in round 79 (I).
- **"And every species already in the reference"** is part of the rule, so no page falls out (S).

## 2. What changed

### For the reader

Nothing, once the corpus step and the deploy are done. Every page, address, search answer and name lookup is the same (section 4). Two things differ at the edges:

- `/api/dossier/<id>` takes the page's id (`k2735933`, or `g<GBIF key>`); a GBIF key there moves to the id with a 302 that no cache keeps, and is a 404 where no page's own key it is.
- A page built from now on says its papers are "Not checked. Papers are not yet asked for this reference; a later fill takes them from OpenAlex's free snapshot." No page is built this round, so no live page shows it yet.

### For the site (I)

- **The id.** `k<plant_name_id>` where Kew's file gives the page one accepted taxon that no other page holds, else `g<GBIF key>` (`src/lib/core/page-id.ts`, the rule in `src/lib/dossier/page-ids.ts`). On the live corpus 8,916 pages take Kew's id and 29 keep their GBIF key: 15 whose Kew rows do not decide, and the seven pairs (14 pages) awaiting their merge.
- **The corpus is version 3**, under `s/v3/`. Index entries, cards and sheets carry `key` (the id) and `gbif`; `near` lists ids; each card file holds `@<gbif>` → id, so a plant's `taxonKey`, an older name GBIF resolves and a GBIF key in an address all find their page.
- **Device records are unchanged:** a plant's `taxonKey` and a followed species' `gbifKey` stay GBIF keys, compared with a page's `gbif`.
- **The order is checked.** The deploy command is `node scripts/corpus-ready.mjs && npm run deploy`: `scripts/corpus-ready.mjs` stops it unless the bucket holds `s/v3/manifest.json`. `package.json` is unchanged, so a plain `npm run deploy` does not check; the new Worker over `s/v2/` alone answers 503, never the fixture.

### For the build

- **The species list (S).** `scripts/species-list.txt`, from `scripts/select-species.ts` (with `select-species-lib.ts`, `select-species-sources.ts`): 48,368 species by Kew's id, each with its reason and its GBIF key (46,041 have one). Beside it `counted-datasets.txt` (45 datasets, 511,614 records), `excluded-datasets.txt` (52, 1,872,568) and `undecided-datasets.txt` (148, 1,986,699), and `species-refused.txt` (2,053 iNaturalist names and 4,437 GBIF keys refused, each with why). iNaturalist's list of departures from POWO could not be read from here, so it is not applied; the code to apply it is in place and tested.
- **Literature off (B).** The build asks OpenAlex nothing and records `openalex` as `skipped`; `--fill openalex` says why and exits 2.
- **Wikidata and Wikipedia batched (B):** one SPARQL query for 200 GBIF keys, one item read of 50, one lead read of 20, ahead of each 500 species, each answer held under the address the builder asks, so the builder runs unchanged. Wikimedia's sites are paced as one, 0.35 s.
- **Kew's names from Kew's file (B)** with `--bulk`, in place of GBIF's copy.
- **iNaturalist budgeted (B):** every run of a UTC day together asks it at most 9,000 times, then stops with exit 3, and the same command the next day goes on.
- **Cultivated photographs by the owner's rule (B):** captive observations with open-licence photographs, taken only when at least two current identifications agree with the community taxon and none disagrees.
- **The seven merges, ready (I):** `scripts/merged-pages-79.txt`, read by no build this round; an owner's merge key is read whatever its type (`extraKeysFor`'s `into`).

## 3. The merge

**Textual conflicts**, each resolved keeping both sides' intent:

- `fixtures/dossiers/s/v2/5384999.json`: I moved the fixture to `s/v3/k2735990.json`, B changed its OpenAlex record to the literature-off one. B's change is applied to the version 3 file and the old file is gone.
- `scripts/build-dossiers.ts`, with B: `fillLiterature` is B's (literature off), in I's file.
- `scripts/build-dossiers.ts`, with S: S's species-list route and I's id-aware line parser, together (below).

**What the textual merge missed, and the cross-agent needs:**

- **The list's route (S's need of I).** S wrote `jobsFromList(…, 'gbif')` for I to switch to `'kew'`. In the merged code the build is by GBIF key and `--index` names every page by I's rule, so a Kew id must never be the build's key: `'kew'` would have built species by a Kew number read as a GBIF key. `jobsFromList` now takes no mode: each species is built by the GBIF key on its line; where the list gives none, by the GBIF key of the page on disk under its id; else it is left out and counted, never matched by its name (rule 3, as S asked). A key the owner merged into another page is built as that page (I's need of S). The list's `pageId` is now I's form, `k<plant_name_id>`, typed `PageId`.
- **The bulk fetch (S's need of B).** `scripts/bulk-fetch.ts keysFor` reads a species list's GBIF keys (`downloadKeysOf`) and matches no name: 46,041 keys, the 2,327 without one written to `bulk/unresolved.txt`.
- **B's batch layer against I's ids (B's need of I).** The build's job key stays the GBIF key, which is what `batch.prefetch` and P846 ask by. Nothing to change.
- **B's dossier fields against I's renames.** B adds no field that names a page; the cultivated photographs carry `captive` as before, and `distribution.via.page` and `photos[].shared` are I's alone. B's equality tests pass on the merged code.
- **B's fill against I's ids.** `--fill inat` lists files by `DOSSIER_FILE` and judges iNaturalist's answers by `ids.gbif` (I's need of B, met by the textual merge). One type error B's branch added in `fillPhotos` (a `never` in the cultivated record's detail) is put right.
- **The plans.** `scripts/corpus-plan.txt` is I's `s/v3/` plan for this round. B's `corpus-plan-full.txt` now names the list, runs `--list-extra-keys` before the build and `--prune-followed` after it (I's round-79 need), and says round 79 first moves `merged-pages-79.txt` into `merged-pages.txt`.
- **`scripts/live-check.mjs`** read a search hit's key as `"key":(\d+)`: with ids it found none and skipped the dossier check silently. It now reads `"key":"k…"`, fails when there is none, checks `/api/dossier/<id>` (200, `no-store`) and that the page's GBIF key moves to it (302, `no-store`). `corpus-step.mjs`'s wait for the site reads `static/s/v3/manifest.json`, the version the Worker reads.
- **S's selection against a version 3 corpus.** `select-species.ts` read the reference's index `key` as a GBIF key and its files as `<key>.json`; on round 79's corpus it would have written `k…` in the GBIF column. It now reads `gbif` and the file by its id, and defaults to `static/s/v3` once it is there.
- **B's two proofs** (`r78b-batch-proof.ts`, `r78b-kew-proof.ts`) read an index of version 3 too.
- **DEPLOY.md:** B's section said this round needs no corpus step and either order is safe; it now says the step above builds nothing. The full build's section is for the list's 48,368 species, with B's measures multiplied out to it. The round's step has a table of what the live site serves at each point. The merges are decided, not "yours to decide". The 50,000 memory test's paths are `s/v3` and its dossier address an id.
- **The about pages:** `/about/formats` now says a page built since round 78 has empty literature with `upstream.openalex` `skipped`, not checked, and that an `upstream` row may be "not asked". S's round-79 paragraph stays pending (`docs/PENDING-ABOUT-HOW-R79.md`), with a merge note: the build's route leaves the 2,327 species without a GBIF key out unless round 79 makes `ids.gbif` optional, and how a page's name follows its GBIF key.
- **README:** the species list, page ids, literature off, the iNaturalist day, and `static/s/v3`.

## 4. The proofs and measures, on the merged code

All on a copy of `real-s/v2` (round 72's corpus re-indexed by round 77, 8,947 dossiers, corpus `a98be27f26a097fe`), rekeyed by the merged corpus step to `s/v3` (corpus `bfb1edeee7862289`, the same id I's branch gave). Results are in `scripts/dev/scale/results/r78m-*.txt`.

- **Dossiers** (`r78-dossiers.ts`): 8,947 of 8,947 the same apart from their id fields; 8,916 `k`, 31 `g` (29 once round 73's two merged pages are pruned, as they are live); the index's 8,947 entries and every `near` the same.
- **Lookups** (`r78-lookups.ts`, round 77's code over `s/v2` against the merged code over `s/v3`): 864,824 answers, 864,824 the same (251,026 slugs, accepted and older names each, 85,363 addresses, 9,280 GBIF keys, 1,564 rows, 6,244 opened rows, 9,280 API answers, the catalogue, the strip, the sitemap).
- **The search** (`r77-proof.ts`, 69,021 queries, through the key files of `s/v3`, the index read 0 times and the postings and `short.json` 0 times, 570 s): against round 77's whole-index run, 68,921 the same and 100 "type another letter", exactly round 77's list, 0 other differences; against round 77's own key-file run, all 69,021 the same, every field but the read counts and times. A query read a median of 11 files (most 122) and 147 KB (most 2.1 MB).
- **Pages** (`r78-page-proof.mjs`, round 77's build over `s/v2` against the merged build over `s/v3`): 9,010 pages (every species page, the front page, two groupings and 60 opened genus rows), all 200 in both, the HTML the same on all 9,010 (a species page's `data-key` read as its GBIF key) and the page data the same on all 9,010 with ids read as GBIF keys. B's literature sentence shows on no live page, since no page there was built with literature off.
- **Round 76's proof** (`r76-proof.ts` over `s/v3`): 31 tallies, each 0 different, with and without round 73's merges.
- **The real corpus step, dry run** (rclone and the live check said, not run): the backup step names `static/s/v2` as the backup; `--rekey` says "8916 by Kew's plant_name_id, 31 by GBIF's key", "8947 dossiers written under a new id", "1321 genus records copied", "13899 files written"; the review says "0 dossiers differ from the backup … apart from their ids"; the upload's three rclone lines name `static/s/v3` and `r2:cultifolio/s/v3`; the live check's wait finds the corpus on disk. `static/s/v3` holds 24,169 files, 670 MB: 365 MB of products, 294 MB of dossiers, 5 MB of genus records. A second `--index` wrote 0 files ("unchanged"), every one of the 24,169 files the same by md5, and `static/s/v2` the same as the source, file for file.
- **The list, again** (`select-species.ts --offline` from a copy of S's kept answers, about 65 s each): over the version 2 reference, the five files the same as the committed ones but for the three header lines that name the folders given; over the version 3 reference the merged code wrote, the same, and the reference's line names `static/s/v3` and its corpus. Every species line the same both times: 48,368, 46,041 with a GBIF key.
- **B's equality tests** (`r78b-batch`, `r78b-kew-rows`, `r78b-inat-cultivated`, `r78b-inat-day`, `r78b-literature`) and **S's list tests** (`r78s-*`) pass on the merged code, with I's (`r78i-*`) and the merge's own (`r78m-list-build`): 177 tests in 19 files with the corpus-step, corpus and builder tests.

B's measures stand as measured on its branch (requests, the 50-species batch proof, Kew's file against GBIF's copy, the 100-species cultivated fill), as do S's counts.

## 5. Runs

- **Types:** `tsc --noEmit -p .` and `svelte-check --threshold error`, 0 errors and 0 warnings. A scripts-only `tsc` over `build-dossiers.ts`, `select-species.ts`, `bulk-fetch.ts`, `kew-rows-load.ts`, `extra-keys-list.ts` and B's two proofs shows exactly r78base's 11 kinds of error (the old `judged` and null-check ones), nothing new; B's branch alone had added one, put right here.
- **Unit:** the whole suite once, alone: 438 files passed and 1 skipped, 4,155 tests passed and 8 skipped, 0 failed (395 s).
- **`check-bundle`:** the layout's 26 chunks and 46 modules hold nothing under `src/lib/backup/` or `src/lib/ui/grow/` but the 6 named modules.
- **Strict Chromium and the Chromium phone at four workers** (`CI_STRICT=1`, `--fail-on-flaky-tests`), once: 524 passed, 5 skipped, none failed or flaky (12.9 min). Nothing needed fixing.
- **The live check against a local `wrangler dev`** of the merged build over the fixture corpus (`LIVE_CHECK_SKIP=names,forecast,thumbs,weight`, `LIVE_CHECK_FIXTURE_OK=1`): 11 checks passed, among them "dossier no-store under its id (k2735933), its GBIF key moved to it"; `/api/dossier/5384013` answered 302 to `/api/dossier/k2735933`, `no-store`.
- **The owner's strict run, all engines (2026-10-19):** unit 4,154 passed and 9 skipped; the browser suite 1,456 passed, 17 skipped and 1 flaky, so it failed. The flaky one was Firefox's smoke-3 "a grower's home says what needs them": a press of Record… on a plant page opened nothing. Its trace showed why. The species' sheet answered between the press's mouse down and mouse up, and the reference-photograph line ("Show the reference's photograph of this species") arrived above the verb bar and moved it down, 8.4 px on a desktop and 46.5 px on a phone. A click whose down and up land on different elements is no click, and a grower's tap meets the same. Fixed in the app: while the sheet is asked, the plant page holds that line's room, unseen and out of the accessibility tree (`RefPhotoOffer`'s `hold`), so the line's arrival moves nothing. A species with no photograph gives the room back, which is the rarer move. `r78m-verbs-steady.spec.ts` holds the sheet back and measures the bar at both widths; it failed on the merge's commit. With the reference's photographs switched on, the hero still arrives above the card: left for round 79. After the fix, strict Chromium and the phone: 526 passed, 5 skipped, none flaky (12.9 min).
- **The branches' own runs** stand beside these: S's 34 unit tests, I's 44 unit tests and 3 e2e cases and its whole strict run (518 passed, 5 skipped), B's 35 unit tests and 6 e2e cases, each failing on r78base where they test new behaviour.

## 6. The owner's steps

This round renames every dossier and writes `s/v3/`, so **the corpus step comes first, then the deploy**. `node scripts/corpus-ready.mjs && npm run deploy` stops until the bucket holds `s/v3/` (DEPLOY.md, "Round seventy-eight's corpus step").

1. `node scripts/corpus-step.mjs`: the backup step says `static\s\v2` is the backup, then `--rekey` (offline, a few minutes), then a review stop. Read it: "page ids: 8916 by Kew's plant_name_id, 29 by GBIF's key", "8945 dossiers written under a new id", "index: 8945 species", about 13,900 product files, and "0 dossiers differ from the backup … apart from their ids". The live site serves round 77's `s/v2/` throughout.
2. `node scripts/corpus-step.mjs --go-on`: the upload to `s/v3/`, about 24,000 files and 660 MB this once. The live site still serves `s/v2/`: round 77's Worker never reads `s/v3/`. It stops and says to deploy.
3. `node scripts/predeploy.mjs --tier=app`, then `node scripts/corpus-ready.mjs && npm run deploy`. Its first line must say "corpus-ready: the bucket holds corpus … under s/v3/". From here the site serves the same pages from `s/v3/`.
4. `node scripts/corpus-step.mjs --go-on`: the live check, which now checks a dossier under its id and its GBIF key's move to it.
5. **Later, not before a week:** `rclone purge r2:cultifolio/s/v2`. Until then `npx wrangler rollback` brings back round 77's Worker, which reads `s/v2/` as before; the purge ends that way back.

Nothing for the list or the build's sources: they change no page until round 79 builds.

## 7. What round 79 does

1. **Its first change** moves the seven lines of `scripts/merged-pages-79.txt` into `scripts/merged-pages.txt` and removes the file (the owner's seven merges).
2. **Decide the 2,327 species without a GBIF key.** Today every page needs `ids.gbif`; the build leaves them out. Either `ids.gbif` is made optional (the alias, the build's fetches and a plant's `taxonKey` rely on it), or round 79 builds about 46,000 and says so on `/about/how`.
3. **GBIF's download:** `npm run bulk -- gbif scripts/species-list.txt --wait`, for the list's 46,041 keys, no name matched. The scaling study estimates about 69 GB at 54,212 species (12.7 GB today took GBIF 67 minutes to prepare); the list's size was not measured. Hours to prepare and to fetch.
4. **The full build:** `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt`. `--list-extra-keys` (about five minutes), then the build: about 1.4 s a species by B's measure, so about 19 hours at 48,368, plus about 70 minutes reading `occurrence.zip`. Wikidata and Wikipedia about 13,500 requests (1.3 hours of the pacing), Kew from its file, OpenAlex nothing. Then `--prune-followed` for the seven merges.
5. **The iNaturalist fill over days:** about 2 requests a species, about 97,000, so about 11 days at 9,000 a day and about 3 hours a day; the cultivated set alone about 49,000 requests, 6 days. On B's 100 species a third gained cultivated photographs.
6. **`--index`, the upload** (not measured at this size: the 50,000 made-up corpus of the memory test was 2.5 GB of products; at about 32 KB a dossier, 48,000 dossiers add about 1.5 GB) **and the live check.**
7. **Put S's pending `/about/how` paragraph live**, with the count the build reached, and rewrite the Aloe and Ceropegia sentences it names.

## 8. Not done

- **iNaturalist's list of departures from POWO is not applied** (S): every iNaturalist host answers a browser check here and the JSON form answers 500. At most the 3,292 names taken by the framework clause are exposed.
- **The 2,327 species without a GBIF key are not built by the merged route** (above): left for round 79 to decide, rather than matched by name.
- **The seven merges** are applied by round 79's full build, not this round's corpus step (I's reasons: the data they need is on the owner's PC, round 79 re-derives every page anyway, and the step's "0 dossiers differ" proof holds only while no content changes).
- **`--fixtures` regenerates `g` ids** (it reads no Kew file); the committed fixtures were rekeyed by hand.
- **Common names stay a GBIF request a species**: the backbone archive would lose names (B).
- **Commons is not batched** (B): a page's files need its category's members first.
- **The full build, the download and the fills were not run here:** GBIF's `occurrence.zip` and the climate grid are on the owner's PC only.
- **Firefox and WebKit** are not in this workspace; the owner's predeploy run checks them.
