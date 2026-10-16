# Round seventy-two: the deep review of round seventy-one, and the process changes

Round seventy-two acts on a self-review of the deployed round seventy-one (`c290e0f`, corpus `4c784c5dc7ca2448`). It differs from earlier reviews in one way: the live corpus and Kew's real files were copied into the workspace (checksums matched against the owner's PC), so the six reviewers audited every one of the 8,947 pages rather than samples of the live API.

- **The reviews:** `review-71/self-A.md` to `self-F.md`.
- **The decisions:** `REVIEW-TRIAGE-71.md`.
- **The fixes:** `review-72/A.md` to `F.md`; the merge is `review-72/merge.md`.

`FOLD_RULES` stays 8 and the device database stays at version 4.

## 1. Names, authors and identifiers (A)

- **A page cites the name it links.**
  - 227 pages cited GBIF's author beside IPNI and POWO links to Kew's entry of the same words by another author. Ixora coccinea showed "Comm. ex Lam." and linked Ixora coccinea L.
  - Wherever Kew's number the page links is the page's own words, the name is now cited as Kew cites it, and the page says that GBIF's key carries another author (`name.cited`).
  - Round 71's orphan rule never reached a key with any synonym of its own.
  - On the dry run, 722 pages cite Kew's author. Most of the change is one author spelt two ways (S.Mc Cabe and S.W.McCabe, a year left in a citation).
- **Kew's own names for each page (`name.kew`), read offline from Kew's file** by the new `--fill kew-names --bulk bulk`:
  - the entry the page reads;
  - Kew's synonyms of it;
  - the older names GBIF gives that Kew accepts as species of their own. 278 pages list these apart ("Kew accepts as species of their own": Allium porrum on Allium ampeloprasum).
- **Kew's links without a Wikidata number.** 139 pages that Kew holds by name and author now link POWO and IPNI.
- **IPNI.**
  - A Kew "-4" number is a POWO address only (Echinocereus marksianus's IPNI link was dead).
  - "Another name" is said only of a name that is plainly another. Cochemiea matehualensis's POWO link comes back.
- **Common names.** 31 common names that are scientific names (Babiana odorata on Babiana villosula) are dropped.
- **`spellingKey`.** A test pins the seven pairs it joins across all of Kew; none of them is in the reference.

## 2. Ranges, records and climate (B)

- **The day a page states is the source's day.**
  - Ranges said "WCVP via GBIF", "asked" on the build day. They are now "WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04", as of that day.
  - GBIF's records are dated by their download.
  - On the dry run this covers 8,935 ranges and 7,593 record sets.
- **Where a range comes from is a field (`distribution.via`), shown beside the map.**
  - The 476 range-source notes showed only in the folded record of sources. Six of them take another reference page's range, which is now linked.
  - A range of Kew's entry by another author than the page cites says so.
- **Doubtfully present regions.** Kew's doubtful regions are listed as such: 53 pages.
- **A name Kew spells otherwise.**
  - Where the author and the basionym's author are the same and there is no other candidate, the name is read so: Reicheocactus famatimensis, Weingartia fidaiana and Melocactus lemairei gain ranges.
  - Delphinium cultorum's artificial hybrid, Agave calodonta's nameless region and Aphelandra squarrosa's unplaced name are said truly.
- **The climate's reason.** It says "an in-range record placed to within 10 km" (912 pages said less than the truth).
- **One stray record** outside the range is no longer called a disagreement.
- **`--list-rebuild`** compares each page with the rule. It no longer lists finished work: 5 species on the dry run, against the 55 it listed every round.

## 3. Photographs (C)

- **iNaturalist's descendant taxa.** iNaturalist takes in subspecies that Kew accepts as other species.
  - With Kew's file, `--fill inat --bulk bulk` leaves out an observation of such a taxon.
  - On the dry run, 95 pages were asked again. Examples:

    | Page | iNaturalist photographs, before → after |
    |---|---|
    | Eriosyce crispa | 66 → 19 |
    | Copiapoa megarhiza | 68 → 26 |
    | Trichocereus macrogonus | 42 → 8 |
    | Epithelantha greggii | 38 → 25 |

- **One photograph on two species' pages** (one iNaturalist photograph on two observations, a survey plot filed under three species) is shown on neither. 138 photographs on 40 pages after the fills.
- **False hides from the title rules are fixed:** "Pariette Cactus", "Autumn Crocus", "Bahia" and a run-on genus.
- **The slip guard.** It reads GBIF's second spelling by the same author as the species', so Parodia lenninghausii's and Ceropegia barberae's files come back, and `commons-kind` asks such files again.
- **Kew's synonyms are the species' own names** for the Commons rules.
- **A museum specimen** is a herbarium sheet only with a pressed word.
- **Drops count the photographs a page shows.** Adenia tisserantii's alarm was two herbarium sheets never shown.
- **An e-mail address is never published as an author.**
- **iNaturalist's "processing" placeholder** is not a photograph.

## 4. The corpus step (D) and the owner's process changes

- **One command.**
  - `node scripts/corpus-step.mjs` runs the round's plan (`scripts/corpus-plan.txt`) in order and records each step in `corpus-step.json`.
  - It writes everything to `corpus-step.log` in the project folder and carries on where it stopped.
  - It stops, with one sentence and the command to type, at:
    - a source that did not answer (exit 3);
    - drops;
    - a dossier it cannot read;
    - each review point;
    - Ctrl-C.
  - The upload checks the bucket before the manifest goes, then waits for the site to serve the new corpus.
  - `--prune` makes the bucket's prune a dry run and a stop of its own.
  - A quiet step prints a line every two minutes.
- **Wikidata.**
  - Wikidata's item reads no longer send `maxlag`: the lag it reports is its query service's. Commons keeps it, and every 429 and 503 is still waited out.
  - `--fill wikidata` no longer writes an item's IPNI and POWO numbers over Kew's.
  - It asks again a row that did not answer. On the dry run, it found the nine changes round 71 left, and seven more: 16 in `rebuild-wd.txt`.
- **Safe writes.**
  - Dossiers, the index and the manifest are written then renamed.
  - A dossier cut off mid-write stops `--index` instead of silently leaving the index.
  - An unfinished fill exits 3.
  - `--fill kew-links` resumes, and `--fill gbif-open` no longer asks the same eight species every run.
- **The day's answers are cached** in `cache/upstream/<day>/`. Only answers and 404s are kept, only for the same day, and deleting the folder changes nothing but what the next run asks.
- **Tiered test runs.** `node scripts/predeploy.mjs --tier=corpus`, `--tier=app` or `--tier=launch`.
  - Chromium runs on four workers; WebKit is held to two.
  - Splitting `smoke.spec.ts` was tried and withdrawn: one photograph test failed beside the other parts. It is kept as a commit on F's branch for a later round.

## 5. The grower's data, sync and the server (E)

- **Import dates.**
  - A sheet of year-first short dates from 2013 on (19-05-23), or of day-first dates past the twelfth, was never asked about. It now is.
- **Photographs and sync.**
  - A photograph that times out no longer stops the device receiving.
  - The doubled photograph wait now holds the photographs alone; records still go.
  - A shorter refusal met under the day's refusal is kept, and small batches wait it out.
- **Dossiers.** `/api/dossier/<key>` answers 404 for a key the index does not list, whatever the bucket still holds.
- **Tests.** Three gap tests found by mutation.

## 6. Pages and the about pages (F)

- **Winter seasons.**
  - No winter growing season is read from a wet winter with nights below freezing (68 pages). Rubus parviflorus and Colchicum kurdicum read "the rainy season (no growing season read: nights below freezing)".
- **Register links.**
  - Where Wikidata did not answer, they say "not checked".
  - "Kew holds no entry" is said only where it is true.
- **Summaries.** A summary under one of the species' older names says that is its proof.
- **Search.** A generic noun alone ("Cactus") is no headline and does not outrank fuller names.
- **The 404.** It no longer reads "The reference has no Not".
- **The page reads structured fields** (`name.cited`, `distribution.via`, `name.kew`), and the old sentences only for a dossier built before.
- **The about pages** are written from every agent's sentences, each checked against the merged code.
  - The stapeliads sentence is true of Kew's present file.
  - The POWO sentence, the lag sentence and the formats of the new fields are new.
  - Five sentences describe what this round's fills write, and are true of the live corpus once the owner's corpus step has run.

## 7. The owner's decisions (recommendations)

- **Two pages for one plant.**
  - Recommendation: redirect the two homotypic pairs in round 73: Coryphantha macromeris to Pelecyphora macromeris, and Rebutia fidana to Weingartia fidaiana.
  - Keep the heterotypic pairs (Ceropegia melanops and C. nigra, and four more), whose range note is now shown beside the map.
- **Homonym keys (about 14).**
  - Keep every key and name; ranges, records and climate are already the familiar plant's.
  - Reading records from both GBIF keys is round 73 work, since each needs a rebuild.
- **New sync vaults.** The ceiling is 200 a day for the whole site by default; set `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX` before the launch.
- **First visit.** It costs 1 to 1.7 MB, half of it the service worker's cache. Recommendation: register the worker at the second page or the first plant, in round 73 with every engine.
- **The catalogue on a phone** opens on Abelia. Recommendation: open on the collector genera.
- **Worker CPU.** Measure a cold isolate with `wrangler tail` (about 0.4 s in node).

## 8. Not done

- Weak Commons leads (Heliamphora purpurascens, Boswellia papyrifera).
- The listing's 503 kept across reloads.
- The smoke split.
- Deleting the bucket's dossiers of species no longer listed: the corpus step reports them, and E4 stops them being served.

## 9. Runs

- **Unit:** 3,826 passed, 8 skipped; `tsc` and `svelte-check` clean.
- **Strict Chromium and the Chromium phone at four workers:** 474 passed, 5 skipped, every test first time, 12.0 minutes.
- **The owner's `--tier=app` run:** every engine; 1,320 passed, 17 skipped, one flaky in WebKit, 37.7 minutes. The flaky test was a round-61 guard racing the toast's 600 ms navigation rule; it now holds the clock still (`review-72/merge.md`).

## 10. The corpus step, dry-run on the real corpus

The whole plan was run here on a copy of the live corpus, with Kew's real files, in 87 minutes:

- every step except the two `--keys` rebuilds, which need `occurrence.zip` and the climate grid;
- not the upload.

| Step | What it did on the dry run | Time |
|---|---|---|
| `--fill wikidata` | 16 species to rebuild | 5 min |
| `--fill kew-links` | 139 pages linked by Kew's number | 38 min |
| `--fill kew-names --bulk bulk` | every page given `name.kew`; 722 cite Kew's author; 278 list Kew's accepted older names apart; 31 common names dropped | 1.5 min |
| `--list-rebuild --bulk bulk` | 5 species (the three spellings, Delphinium cultorum, Ceropegia hadramautica) | 1.5 min |
| `--fill range-source --bulk bulk` | 8,935 ranges say where they come from; 53 doubtful lists; 7,593 record sets dated | 2 min |
| `--fill inat --bulk bulk` | 95 pages asked again (1,717 asked of iNaturalist) | 35 min |
| `gbif-basis`, `gbif-open`, `commons`, `commons-kind`, `summaries` | 11, 2, 1 and 4 pages; nothing dropped | 4 min |
| `--index` | 8,947 species | under 1 min |

- **No drops.**
- **Every page changes** (`name.kew`), so the upload carries all 8,947 dossiers.
- **A second run of the offline fills changes nothing.**
- **On the owner's PC** the two `--keys` steps add the 16 and 5 species.
