# Round seventy-nine, the preparation: everything the full build needs but GBIF's records

Round 79 builds the reference at the size of `scripts/species-list.txt`: 48,368 species, 46,041 with a GBIF key. The build waits on one thing only, GBIF's occurrence records. On 2026-10-20 the owner asked GBIF's helpdesk to enable SQL downloads for his account; if they do, an SQL download of about 4.8 GB replaces the 65 GB Darwin Core Archive, which is the fallback. This round does everything else, so the build can start the day the data arrives, in whichever form. It has six parts, one agent each, and a merge:

- **D** reads GBIF's records in either form, moves the seven merges into the build and writes the full build's plan.
- **K** builds the 2,327 species without a GBIF key, from Kew's file, Wikidata by Kew's identifiers and iNaturalist by Kew's names.
- **P** takes iNaturalist's wild photographs from its open data in one pass, and leaves only the cultivated set to the budgeted API.
- **Q** cross-checks the occurrence cleaning against CoordinateCleaner and Kew's ranges against rWCVP, and adopts one rule: records at botanic gardens, herbaria and zoos are left out.
- **F** settles what round 78 left: the review's `shared` lists, the two WebKit flakes, the plant page with the reference's photographs on, `--fixtures`, the live check's pair, and the list's paragraph for `/about/how`.
- **Z** makes the index, the products, the search and the Worker work at the list's size.
- **M** merges them, in the order K, D, P, Q, Z, F, settles their needs, makes one plan and one walk for the owner, and proves the merged code.

Their reports are `review-79/D.md`, `K.md`, `P.md`, `Q.md`, `F.md` and `Z.md`. The dossier format stays version 3 (`s/v3/`): `ids.gbif` becomes optional, and nothing else in the shape changes. The device database and `FOLD_RULES` are unchanged. This round has no corpus step: the live corpus is not touched until the build.

## 1. The owner's decisions

Binding, from the brief (2026-10-20):

1. **The 2,327 listed species without a GBIF key are built**, from Kew's file and iNaturalist, with GBIF's records "not checked" (range map and habitat climate say so, with why). Never matched to GBIF by name.
2. **The seven merges** of `scripts/merged-pages-79.txt` are applied by this round's build.
3. **iNaturalist:** wild photographs from its open data on AWS, in one pass, with no daily limit; cultivated photographs (captive, at least two agreeing identifications, open licence) from the API under round 78's 9,000 requests a day, unattended over about six days.
4. **GBIF:** both the SQL route and the DWCA route are prepared; whichever arrives, the build reads it, and both give the same dossiers from the same records.
5. **Cross-checks, read-only:** the cleaning against CoordinateCleaner's tests, and Kew's ranges against rWCVP. Their code is GPL: run, compared, never copied.

What the round found for the owner to decide, and his answers of 2026-10-20 (section 7 has each in one line):

- **Deploy this round's Worker now, on round 78's corpus** (M). Yes. It serves that corpus as round 78's Worker does (measured, section 4), and it must be live before the full corpus is uploaded, since round 78's Worker answers 503 for every page without a GBIF key. The upload now refuses to run until it is.
- **The corpus goes live after the wild pass, before the six days of the cultivated fill** (M). D's plan uploaded after the fill. Uploading first puts the full reference live about a week sooner, with each page's cultivated set "not checked" until its turn; a second upload follows the fill. Yes.
- **1 km, not CoordinateCleaner's 100 m**, for the institution rule (Q). It removes 1.8% of the open points, of 2,651 species, among them some wild records at gardens inside a species' own habitat; `/about/how` says so. Yes.
- **K's offer: yes.** The species without a GBIF key take GBIF's records under the keys whose names Kew files as this plant (round 73's extra-keys rule, Kew's synonymy read, never a name match). Done after the merge (section 10): 1,415 of the 2,327 gain keys.
- **The SQL route's images' download without iNaturalist's dataset:** keep the default. **Common names for the keyless pages:** later, round 80; they stay "not asked, with why".

## 2. What changed

### For the reader

Nothing until the build is uploaded, and very little once this round's Worker is deployed on round 78's corpus: the same pages, data, addresses and search answers, and a species page that holds the room of "Your notes: none yet" while the collection opens, so the cultivation cards do not move under a press (F). After the build:

- **About 48,360 species**, among them the 2,327 without a GBIF key (K). Such a page has Kew's name, author, family, older names and range, Wikidata's item by Kew's IPNI or POWO identifier, Wikipedia through that item, iNaturalist's taxon only where its name is the species' own or one of Kew's, and Commons. Since the owner's answer on K's offer, 1,415 of them read GBIF's records under the keys of the names Kew's file holds as them (section 10): their map, marker, habitat climate and record counts are made from those records, each key named, and the page keeps no GBIF key of its own. On the other 912, the map, marker, habitat climate and nearest climates each say "not checked", with the reason: "GBIF's backbone holds no one accepted species of this name, and a name it holds only as another species' synonym is not taken for this one, so GBIF's records were not asked". No keyless page has GBIF photographs. It is found by its name and its older names; a plant of it files no GBIF key.
- **Wild iNaturalist photographs from the open data** (P): research grade, open licence, the 24 observations whose photographs iNaturalist received last, since the export holds no votes; a photograph's page is its observation's by uuid; no place name. On today's corpus 439 more pages show wild iNaturalist photographs (5,549 against 5,110) and 777 show ten or more fewer.
- **Records at botanic gardens, herbaria and zoos left out** (Q), within 1 km of a place on Wikidata's list (6,656 places, CC0, `scripts/institutions.txt`), each page counting what it left out.
- **The seven merged pairs are one page each** under Kew's accepted name (D).
- **On a plant page** with the reference's photographs on, the photograph's room is held while the sheet is asked, so neither the card nor the buttons move when it arrives (F).

### For the site

- **The schema (K):** `ids.gbif` optional; an index entry's, a card's and a sheet's `gbif` absent for such a page (`noGbif()`). The species page, the sheet, the care line, the front page's tiles, the catalogue (`notChecked`), the plant page, the add forms, the picker and the follow button each handle it (K's report lists them).
- **`/api/corpus` says `"keyless": true`** (M): the sign that this Worker reads a page without a GBIF key. The corpus step's upload reads it (below).
- **The held rooms (F):** `.notesline.hold` on the species page, `.hero.hold` on the plant page, each unseen, `aria-hidden` and inert.

### For the build

- **GBIF's records in either form (D):** `loadOccurrences` reads a DWCA, an SQL download (`<key>.csv`, the 15 columns of `SQL_SELECT`, with `bulk/media.zip` beside it for the photographs), or a download in parts. A list build refuses a download asked for fewer species, round 72's old one, and an images' download shorter than the records. The thirty GBIF photographs a page reads are now the first thirty by the record sample's own order, so both of GBIF's files give the same ones; this changes the DWCA route too, where a species has more than thirty open images among its forty sampled records.
- **The requests (D):** `gbif-sql`, `gbif-media`, `gbif-media-status`, `gbif-count`, `--parts`, `--dry-run`; GBIF's validation accepted the full 46,041-key SQL query (508,427 characters).
- **The merges (D):** the seven lines are in `scripts/merged-pages.txt`; `merged-pages-79.txt` is gone.
- **The species without a GBIF key (K):** `src/lib/dossier/build-kew.ts` and `scripts/kew-species-load.ts`, routed by the list build when given `--bulk`; the fills that judge by GBIF key pass them by and count them.
- **iNaturalist's open data (P):** `scripts/inat-open-load.ts` reads the four files in one pass (49 minutes here, 1.05 GB of memory) into `bulk/inat-wild.jsonl`; `--fill inat --wild` fills every page's wild set from it and asks iNaturalist nothing; `--fill inat` asks only the cultivated set, a missing taxon, and a taxon newer than the export.
- **The institution rule (Q):** `src/lib/dossier/clean.ts`, read on each record's own coordinates before rounding, so both routes answer the same; the build's log ends with a paragraph of what it left out and every species that lost its climate.
- **At full size (Z):** the nearest climates 41 s instead of 30 minutes; `--index` holds what each rule reads, not every dossier (1.8 GB of heap at 48,368); the prune gives rclone the files to delete (`prune.txt`, `--files-from-raw`), not 30,000 exclude rules, and needs rclone 1.65 or later.
- **The corpus step (M):** the upload of a corpus holding a page without a GBIF key stops, uploading nothing, unless the live `/api/corpus` says `"keyless": true`, and names the deploy to run first. The stop at iNaturalist's day allowance says to run the command again after midnight UTC, not "in an hour or so", when it would stop again at once. And every stop names its command with its `--plan`, and a run given no `--plan` carries on with the plan the last run left unfinished: before, the sentence after a stop of the full build's plan said `node scripts/corpus-step.mjs --go-on`, which ran round 78's plan (its backup, then `--rekey` over the new build) in its place.
- **The review (F):** a photograph's `shared` list is a set everywhere: in the fingerprint, in `markShared`, in the rekey and in the review, which now reads `shared` and `distribution.via.page` as GBIF keys and names a page shared with one page more or fewer.
- **`--fixtures` (F)** writes the committed ids; **the live check's pair (F)** is a module of its own, tested without the network; **`scripts/about-how-r79.mjs` (F)** writes the list's paragraph from the list and the corpus built, and refuses without them.

## 3. The merge

**Order and conflicts.** K, D, P, Q, Z, F. Every conflict was read on both sides:

- `scripts/build-dossiers.ts` (D after K): the imports, both sets kept. Every other shared line merged by itself: D's coverage check and SQL skip, K's routes and `heldFor`, P's `fillPhotos` and `openWild`, Q's places and `instEffect`, Z's `scanDossiers` and `markSharedPhotos`, F's `fixtureIds`, each where its report named it.
- `/about/how`, the long "What comes from where" line (D after K, then P): K added a paragraph after the line and changed nothing in it, so D's line was taken and K's `#no-gbif-key` paragraph put after it. P's change to the same line was merged with D's word by word: the combined photographs sentence is exactly the one P's report quotes, with D's SQL clause ("or, where the records came as GBIF's SQL download, which carries none, a download of the same records that carry images") and D's suggested words for iNaturalist on the SQL route.
- `/about/formats`, the dossier paragraph (F after K): merged word by word: K's sentence on an absent `ids.gbif` and the entry's `gbif`, and F's `shared` "(Kew's ids before GBIF's, each by number)" and "read as a set".
- `docs/DEPLOY.md` (each agent's new section) and `docs/PENDING-ABOUT-HOW-R79.md` (K's note and F's): both sides kept, then made one section (below).

**What the textual merge missed:**

- **F's about-how test counted the fixture corpus as three of the list's species;** with K's Hesperocyparis lusitanica it holds four. The expectation now says four.
- **K's branch broke three unit tests and five browser tests no one ran** (K's whole suite and browser run were FIXMEs). `r71m-merge` and `r72d-corpus-fills` used dossiers with no `ids.gbif`, which K's fills now pass by as pages without a key: each fixture now holds its GBIF key, as every keyed dossier does. `r69m-corpus` read the build's iNaturalist guard by its old line: now `heldFor(j)`, the same GBIF guard plus the names of the keyless pages. `smoke-1` (two tests), `smoke-3`'s window opened partway and `r75g-most-grown` (desktop and phone) counted the fixture corpus as three genera and four species; with K's Hesperocyparis lusitanica it is four and five, and since that page has no climate the "Without climate" chip shows three genera.
- **Z's slim pages** in `markSharedPhotos` added six errors to the scripts' own type check; they are typed as the rule reads them now, leaving only the base's.
- **K's DEPLOY text** held a vertical-tab character for `\v` in `static\s\v3\k<id>.json`; written out.
- **D's SQL refusal** named GBIF's helpdesk by its e-mail address; it now says "GBIF's helpdesk".
- **DEPLOY section 3** said `npm run deploy` runs `corpus-ready` first; package.json does not, so the command shown is `node scripts/corpus-ready.mjs && npm run deploy`, as round 78's section already said.

**The needs between the parts, settled:**

- **D and K.** The keyless species build in the plan's list step, given `--bulk bulk`: no step of their own (checked in K's end-to-end test, which runs the real `build-dossiers.ts` on a three-row Kew file). `downloadShortOf` counts only the list's GBIF keys. The readers that iterate by `ids.gbif` pass keyless pages by: `--list-extra-keys`, `fillGbifPhotos`, `markSharedPhotos`'s merge guard, the fills' counts.
- **D and P.** The three commands of the plan, DEPLOY and `r79d-full-plan.test.ts` are P's as its branch has them (`npx tsx scripts/inat-open-load.ts bulk\inat-open`, `--fill inat --wild --bulk bulk`, `--fill inat --bulk bulk`). The 606 pages that get iNaturalist's photographs only through GBIF today get their wild set from the open data on either route, since the wild pass reads the file whatever the download gave.
- **D and Q.** The institution rule reads only `decimalLatitude` and `decimalLongitude`, both in `OCC_TERMS` and `SQL_SELECT`; `institutionCode` and `locality` are not needed.
- **F and Z.** Z's `markSharedPhotos` calls F's `markShared` (a set) and `sharedPhotos` (sorted by id), so no page with a shared photograph is restamped; Z's `prune()` and F's review sit in different functions of `corpus-step.mjs` and both tests pass. The prune uses `--files-from-raw` alone, never with another filter.
- **F's review and Q's rule.** In the full build nearly every page differs from the backup anyway, being built anew; the first review stop now names Q's paragraph and its expected share (records left out on about a third of the species with records: 2,651 of 7,776 on round 77's corpus) and asks for the list of species that lost a climate to be read whole if it is more than a few dozen.
- **K's deploy order, verified.** Round 78's Worker answers 503 for a page without a GBIF key and for its `/api/dossier/<id>`, and everything else the same (section 4). This round's Worker serves round 78's corpus the same as round 78's Worker (section 4). So deploying first is safe, and it is enforced, not only stated: the upload stops unless the live Worker says `"keyless": true`. The plan's header, its second review and the walk in DEPLOY.md say so where the owner reads them.
- **SCALE-STUDY.md** section 4: the search key files at 50,000 were estimated at about 50,000 files and 1.47 GB; Z measured 63,791 files and 2.19 GB at 48,368, and the first upload at 4.45 GB in 117,232 objects. Both are now in the table, with a paragraph.

**One plan and one walk.** `scripts/corpus-plan-full.txt` now runs: backup, `--list-extra-keys`, the list's build, a review, `--prune-followed`, the wild pass, `--index`, a review (with F's paragraph script), the upload and the live check; then the cultivated fill over about six days, `--index`, a review, a second upload and the live check. DEPLOY.md's six round 79 sections are one, "Round seventy-nine: the full build of the species list": a walk of ten steps with each step's command, time and disk (the Worker first, the counts, either download, the open data, the backbone export, the plan, the paragraph's deploy, the fill, the cold-start check, the prune, the purge of `s/v2/`), a table of what the live site serves at each point, how to go back, and then each part's detail as its agent wrote it.

## 4. The proofs and measures, on the merged code

On a copy of `real-s/v2` (round 77's real corpus, 8,947 species) in the merge's scratch.

- **The rekey and index, base against merge.** Round 78's code (r79base) and the merged code each rekeyed the copy to version 3 and indexed it. The dossiers and the index entries are the same byte for byte but for the seven merges: their kept pages take Kew's id (8,923 Kew ids and 24 GBIF keys, against 8,916 and 31), and the 35 entries whose nearest climates name those pages, and the five leaving pages' `via.page`, name them by it. 13,669 of the 13,899 product files are the same file. The nearest climates took 0.6 s against 12.9 s.
- **This round's Worker over round 78's corpus** (`scripts/dev/scale/r79m-worker-proof.mjs`, `results/r79m-worker-proof.txt`). Both Workers built (`npm run build`), both answering the same 18,285 paths over the base's corpus: every species page's HTML and page data, every `/api/dossier/<id>`, 300 lookups by GBIF key (302 both), the front page and five other pages, the sitemaps, `robots.txt`, `/api/corpus`, 14 searches, all 32 entry and sheet buckets and the three catalogues. All 18,285 the same once the changes this round makes to every page on purpose are set aside: F's held notes line (8,947 pages) and the inlined styles that hold it, Svelte's hydration markers and class hashes, the empty places of K's not-checked lines, and `/api/corpus`'s `keyless`. 276 s.
- **Round 78's Worker over a corpus holding a page without a GBIF key** (the merged corpus with K's fixture added, indexed): of 79 paths (the page, its API, the front page, three searches that find it, every entry and sheet bucket, the genus catalogue, the sitemap, three other pages), two differ: the page and `/api/dossier/k457911`, 503 "This species page could not be read just now" from round 78's Worker, 200 from this round's.
- **The review's comparison** on the dry run (below): 13 dossiers differ from round 78's backup, the seven renamed kept pages, the five leaving pages and the one page the wild pass filled; in 0.4 s.
- **D's two-route proof**, run again on the merged code from D's kept records: 7 of 7 dossiers the same by the DWCA and by the SQL download with its images' download, at caps of 2,000 and 100; without iNaturalist's dataset in the images' download only the photographs differ, as D found.
- **P's 50-species proof**, run again on the merged code from P's kept answers of the API and its kept open-data file of those taxa (no request): every tally, field difference, order count and row the same as P's `proof.json`.
- **Q's institution measure** (`scripts/dev/r79q-measure.ts` on the points of round 77's corpus, 20 s): 20,701 points (1.83%) of 2,651 species within 1 km of 6,656 Wikidata places, 14,449 at botanic gardens, 4,554 at zoos and 1,698 at herbaria, as Q measured.
- **Not run again here:** K's thirteen live builds and Wikidata counts, P's 49-minute read, Q's CoordinateCleaner and rWCVP runs (R), Z's full-size corpus and workerd measures, D's GBIF counts (53 minutes of GBIF's API). Each stands as measured on its branch; each branch's tests pass on the merged code.

## 5. Runs

- **Types:** `tsc --noEmit -p .` 0 errors; `svelte-check --threshold error` 0 errors and 0 warnings. The scripts' own `tsc` shows the base's kinds only (the old `judged` errors and the `.mjs` imports' missing declarations, one more of each kind for each new test that imports a script).
- **Unit, the whole suite alone:** the first run after the merges, 450 files passed, 1 skipped and 4 failed (372 s): K's three regressions above and `sheets-api`'s exact `/api/corpus`, which now has `keyless`. All four put right, the second run: 454 files passed and 1 skipped, 4,262 tests passed and 8 skipped, 0 failed (360 s); after the last change to the corpus step, the third: 454 files passed and 1 skipped, 4,263 tests passed and 8 skipped, 0 failed (368 s).
- **Strict Chromium and the phone at four workers** (`CI_STRICT=1`, `--project chromium --project phone --workers=4`): the first run, 530 passed, 5 skipped and 5 failed (12.2 min), the five that counted the fixture corpus (above). Put right and the three specs run again, then the whole run again: 535 passed, 5 skipped, none failed or flaky (12.2 min).
- **The merge's own tests:** `tests/unit/r79m-corpus-step.test.ts` (7): `/api/corpus` says `keyless`; with round 78's Worker live the upload stops before rclone runs and names the deploy; the same when the live Worker cannot be asked; once this round's Worker is live the same command uploads; an all-keyed corpus uploads without asking; the day-allowance stop says tomorrow; a stop of the full plan names its `--plan`, and `--go-on` without it carries on with that plan. On r79base 6 of 7 failed (no `keyless`, rclone ran for the keyless corpus, "in an hour or so", and `--go-on` ran round 78's `--rekey`); the all-keyed guard passed. `r79d-full-plan.test.ts` gains a case for the merged plan, which failed on D's plan.

## 6. The dry run on the real corpus

Rekeyed by the merged code into the merge's scratch, then the plan's offline steps:

- `--rekey`: 56 s (69 s by the base's code), "8923 by Kew's plant_name_id, 24 by GBIF's key", 8,947 written under a new id, 1,321 genus records, 13,899 product files.
- `--prune-followed`: 57 s, 0 deleted, and it said why: the seven kept pages are not yet rebuilt with the keys they take, which the full build does. It never deletes a page whose keeper has not read its key.
- `--fill inat --wild`: P deleted its 1.1 GB open-data file to save the shared disk and kept only its proof's 50 taxa (`full-more.jsonl`); with it, 1 page of the corpus had a taxon it holds, and was filled from it, asking iNaturalist nothing. P's figures for the whole corpus (7,870 pages filled in 216 s) stand as measured on its branch.
- `--index`: 46 s, "index: 8947 species", unchanged products.
- The review's comparison: 13 differ (above). With K's fixture added, `--index` wrote 8,948 species and the keyless page's entry without `gbif`.

What changed and why: only the merges' ids (D's decision 2, applied by this round's code) and the one wild set. No page's fingerprint moved for the order of a `shared` list (F), and the index, the products and the nearest climates are otherwise the same bytes (Z).

## 7. What waits on GBIF, and the owner's decisions

**Waits on GBIF:** the records, by either route. Nothing else: the open data, the backbone export, Kew's files, the Worker's deploy and the counts can all be done before.

**To decide or confirm:**

The owner's answers, 2026-10-20:

1. Deploy this round's Worker now (walk step 0), on round 78's corpus: **yes**.
2. The corpus goes live after the wild pass, before the six-day fill (the plan as merged): **yes**.
3. On the SQL route, the images' download leaves iNaturalist's dataset out by default (1.5 GB; iNaturalist's photographs come from the open data instead; `--with-inat` makes it 18.3 GB): **keep the default**.
4. The institution rule at 1 km (Q): **yes**. GRSciColl stays unused (no stated licence).
5. K's offer: **yes**, done (section 10): GBIF's records under the keys whose names Kew's file holds as this plant, by round 73's rule.
6. Common names for the keyless pages: **later, round 80**; they stay "not asked, with why".

## 8. Round 79's build day

DEPLOY.md, "Round seventy-nine: the full build of the species list", is the walk. In short, on the PC:

0. Now: `node scripts/predeploy.mjs --tier=app`, then `node scripts/corpus-ready.mjs && npm run deploy`. The site shows the same pages.
1. Any day: `npm run bulk -- gbif-count scripts/species-list.txt` (about 45 minutes), and iNaturalist's four files with `npx tsx scripts/inat-open-load.ts bulk\inat-open` (34.1 GB, about 45 minutes to download at 100 Mbit/s, under an hour to read).
2. The day GBIF answers: `npm run bulk -- gbif-sql scripts/species-list.txt --wait` and `npm run bulk -- gbif-media scripts/species-list.txt --wait` (about 4.8 GB and 1.5 GB), or on a refusal `npm run bulk -- gbif scripts/species-list.txt --wait` (about 65 GB).
3. `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt`: about 20 to 32 hours of build (19 hours at 1.4 s a species, the download's read, up to 12 hours of POWER's new cells), a review, the wild pass (about 20 minutes), `--index` (10 to 30 minutes), a review with `node scripts/about-how-r79.mjs` and `--write`, the upload (about 117,000 objects and 4.4 GB, half an hour to an hour) and the live check.
4. Commit the about page and deploy it (`--tier=corpus`, then `node scripts/corpus-ready.mjs && npm run deploy`).
5. The same plan command once a day after midnight UTC for about six days (49,000 to 54,000 requests at 9,000 a day), then `--index`, a review, a small upload and the live check.
6. The cold-start check; a day later the prune (rclone 1.65 or later); on or after 26 October the purge of `s/v2/`.

Disk at the most: the SQL route about 6.3 GB of downloads, the DWCA route about 65 GB; iNaturalist's 35 GB until the fill is done; about 10 GB for everything else.

## 9. Not done

- **No real SQL download or DWCA** was made: that needs the owner's account, and the SQL route GBIF's consent (D).
- **The build, the fills, `--index` and the upload at full size** were not run on real data: no `occurrence.zip` or climate grid here. Every time and disk figure for them is an estimate from a measured rate, each saying whose.
- **The open data's whole-corpus fill** was not run again at the merge: P's 1.1 GB file was deleted for the disk, and making it again is a 49-minute stream of 34 GB.
- **The climate's loss to the institution rule** is measured only by the build's own paragraph, on the PC (Q).
- **The place name and votes** cannot come from iNaturalist's open data; within an observation its photograph order is the export's (P).
- **P's optional need of F** (a review count of records filled from the open data) is not added: each page's record already says which export filled it.
- **Firefox and WebKit** are not in this workspace; the owner's `--tier=app` run checks them, F's two flakes among them.

## 10. After the owner's decisions: GBIF's records for the species without a GBIF key

The owner took K's offer (2026-10-20): the species without a GBIF key take GBIF's records under the keys whose names Kew's file holds as this plant, by round 73's extra-keys rule, Kew's synonymy read and never a name matched. Done by M on the merge, after `d47d3e9`.

**The rule, for a page without a key.** `extraKeysFor` (`src/lib/dossier/extra-keys.ts`) runs for a page with no GBIF key of its own: the page is its Kew entry and its id, and every check is round 73's. A GBIF usage is taken when its name and author is one Kew's file holds as the plant, of the entry's own type: the entry itself, a spelling Kew files under it, a name it files under it and marks homotypic, or an autonym of one. And it must be a key no other page of the reference holds or is filed under, and not a pro parte synonym. `scripts/kew-extra-keys.ts` runs it offline from the list, Kew's file and GBIF's backbone export (132 s here) and writes `scripts/extra-keys-kew.txt`, committed: each line is the page's id, the key, GBIF's name and status, and Kew's reading of it.

**What it gives** (`scripts/dev/scale/results/r79m-kew-keys.txt`):

- **1,956 keys on 1,415 of the 2,327 pages.** No key is on two pages, and none is a list key.
  - Of the 1,758 species the backbone holds only as another species' synonym, 1,141 gain keys: 237 by GBIF's usage of their own name and author, 904 only by names Kew files under them.
  - Of the 564 it holds no name of, 270 gain keys.
  - Of the 5 doubtful, 4 gain keys.
- **912 pages read no key.**
  - 633 because GBIF files every usage of theirs under another page of the reference. Those records are that page's already, by GBIF's lumping, and the rule puts no record on two pages.
  - 42 because only heterotypic synonyms were left.
  - 17 for other refusals.
  - 220 because no usage of any of their names exists.

**Counted with GBIF's count API** (the download's filter, one request a second, about 70 minutes):

- 1,522 of the 1,956 keys hold records.
- 1,356 of the 1,415 pages get records (486 of them 1,000 or more). The other 59 read keys that hold none and say "none", having been asked.
- **The download grows a little.** 1,944 keys of at most 100,000 records each add 3.9 million records: about 1.8 GB more DWCA, or about 0.13 GB more SQL download. The request is 47,114 keys, still within one request.
- The 12 keys over 100,000 records each go to the API path, as the list's heaviest species do.
- The images' download gains at most 1.25 million records with images (fewer without iNaturalist's dataset).

**The download.** `keysFor` in `scripts/bulk-fetch.ts` adds the keys to every request (`gbif-count`, `gbif-sql`, `gbif-media`, `gbif` and their parts) and writes them into `bulk/keys.json` by page id. The build's check that the download was asked for the list counts them too (`downloadShortOf`).

**The build.** The records section of `buildDossier` is now `readRecords`, unchanged in what it does, and `buildKewDossier` calls it on the records of the page's keys (`extraOccurrences`). That gives the planted and institution records left out, the range test on Kew's range, the map, the marker, the habitat climate from the grid, and the counts. `gbif.occurrences` names each key with Kew's reading and the record count, and says the page has no GBIF key of its own. `ids.gbif` stays absent, and GBIF's photographs, species record, synonyms and common names stay not asked. A page whose keys change, or whose records under them were not read, is built again. The build's log says how many read keys.

**The site.** "Not checked" is now said by the records, not by the key's absence: `recordsUnchecked` (`$core/no-gbif`) is true for a page without a key that read none, and for a sheet or entry without a key while its climate is pending.

- The species page, the plant page, compare and the labels read it.
- A page with records says, under its maps, "This species has no GBIF key of its own. Its records are GBIF's under the key(s) of the name(s) Kew's World Checklist holds as this plant: … No name was matched to GBIF; the keys are read from Kew's synonymy." (`#kew-keys-records`).
- `/about/how`'s `#no-gbif-key` paragraph and `/about/formats` say the same, checked against the code.

**Tests.**

- **`tests/unit/r79m-kew-keys.test.ts` (10):**
  - the rule for a keyless page, a heterotypic name refused, and a key GBIF files under another page refused (guard);
  - the list file with page ids;
  - the committed file's counts;
  - the request's keys and the build's wiring;
  - the builder reading a key's records (map, counts, climate, provenance, no GBIF key);
  - a refusal said as one, and no key still "not checked";
  - sheets;
  - the pages' and `/about/how`'s words.
- **`r79k-list-route`** gains a run of the real `build-dossiers.ts`: a Kew file, the keys file and a download holding three records under GBIF's "Cupressus lusitanica Mill." (key 2684069). The page reads them, keeps no GBIF key, and is indexed without one.
- On `d47d3e9` the new file failed at collection (no `scripts/extra-keys-kew.txt`), and the real-build case failed: the build read no records.
- `r78m-list-build` and `r79d-full-plan` follow the changed source and plan.

**Runs after the change:** the whole unit suite alone, 455 files passed and 1 skipped, 4,274 tests passed and 8 skipped, 0 failed (437 s); `tsc` and `svelte-check` 0 errors; strict Chromium and the phone at four workers, 535 passed, 5 skipped, none failed or flaky (13.3 min).

**Left as decided:** common names for keyless pages wait for round 80 and stay "not asked, with why"; the SQL route's images' download keeps its default; the 633 pages whose records GBIF files under another page are not given those records (that page shows them, by GBIF's lumping). Reading them here would put one record on two pages, which round 73's rule refuses.
