# Round 79, agent D: GBIF's records in either form, and the full build's plan

Branch `r79` in `/tmp/claude-0/rev79/D`, eight commits on `r79base`.

## Done

**1. The merges.** The seven lines of `scripts/merged-pages-79.txt` are now in `scripts/merged-pages.txt`, after round 73's two. Its header says what each group is. The old file is gone. Changed to match: `tests/unit/r78i-merges.test.ts` (reads the one file; it now checks that `merged-pages-79.txt` is gone), `tests/unit/r78m-list-build.test.ts` (the nine leaving keys from the one file), `scripts/dev/scale/r78-merge-proof.mjs`, and DEPLOY.md's round 78 sentence. On the base, the r78i cases failed: the file held two merges and `merged-pages-79.txt` existed.

**2. The SQL route.**
- **The reader** (`src/lib/dossier/bulk.ts`, `scripts/bulk-load.ts`). `occHeader` reads a header without regard to case against `OCC_TERMS`, the 16 DWCA names the reader uses. So the SQL download's lower-case aliases (`gbifid`, `specieskey`, …) give the same row as occurrence.txt.
- **`SQL_SELECT`.** The 15 columns the SQL download selects: every term except `mediaType`. The three keys come from `occurrence.gbif_classification.*`. GBIF's docs say the table's plain `specieskey`/`taxonkey` now hold Catalogue of Life's keys, and a public cube download shows "CVW5J". The build works by backbone key. If a download holds a non-numeric key, the reader stops with a sentence.
- **`loadOccurrences` handles:**
  - a DWCA;
  - an SQL download (`<key>.csv`), with the images' download beside it (`bulk/media.zip`, read through `OccIndex.addMedia` and then its `multimedia.txt`);
  - a download in parts (`download.json` `parts`, each part its own zip, each record citing its own part's DOI; a record that two parts both hold is kept once).
- **What the loader refuses:** a download that was asked for but not yet fetched (the old `occurrence.zip` would be read instead).
- **`downloadShortOf`.** A species-list build stops in three cases: the download was asked for fewer species; it is round 72's download, which records no count; or, beside an SQL download, the images' download covers fewer species than the records.
- **`MediaIndex`'s thirty per page** used to be the first thirty in file order. They are now the first thirty by the record sample's own rank, with each record's images in their file order. GBIF's two files hold the same records in different orders, and this rule makes them give the same photographs. **This also changes the DWCA route** wherever a species has more than thirty open images among its forty sampled records.
- **The requests** (`scripts/gbif-request-lib.ts`, pure): `dwcaRequest` (round 78's body, unchanged), `sqlQuery`/`sqlRequest`, `mediaRequest`, `predicateItems`, `splitKeys`, `partsNeeded`, `countUrl`, `sizes`.
- **The SQL**, exactly:
  `SELECT gbifid, occurrence.gbif_classification.specieskey AS specieskey, occurrence.gbif_classification.taxonkey AS taxonkey, occurrence.gbif_classification.acceptedtaxonkey AS acceptedtaxonkey, decimallatitude, decimallongitude, coordinateuncertaintyinmeters, coordinateprecision, "year", countrycode, basisofrecord, license, datasetkey, establishmentmeans.concept AS establishmentmeans, degreeofestablishment.concept AS degreeofestablishment FROM occurrence WHERE occurrence.hascoordinate = TRUE AND occurrence.hasgeospatialissues = FALSE AND occurrence.occurrencestatus = 'PRESENT' AND ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, ARRAY('<key>', …))`
- **Where that WHERE comes from.** It is GBIF's own translation of the DWCA predicate: `POST /v1/occurrence/download/request/sql` gave exactly these four clauses.
- **Why the SQL applies no other filter.** The build keeps a uniform hash sample of 2,000 records per species and only then judges each record, so a record GBIF left out would change the sample. SQL cannot take the sample itself: no sub-queries, `HAVING` or `QUALIFY`.
- **Commands** (`scripts/bulk-fetch.ts`, through `npm run bulk --`):
  - `gbif-sql <list> [--wait] [--parts N] [--dry-run]`. It writes `bulk/request-sql.json` and has GBIF validate the SQL before sending. A 403 gets a sentence pointing to the DWCA route.
  - `gbif-media <list> [--wait] [--with-inat] [--dry-run]`: `bulk/media.zip` and `media-download.json`.
  - `gbif-media-status [--wait]`.
  - `gbif-count <list>`: no account needed.
  - `gbif` now also takes `--dry-run` and `--parts`, and writes `bulk/request-dwca.json`. `gbif-status` handles both formats and parts. A 429 waits a minute and asks again.
- **Does one query hold 46,041 keys?** For predicates, GBIF's Occurrence API reference, "Occurrence Download Limits" (https://techdocs.gbif.org/en/openapi/v1/occurrence#limits), says: "A download predicate may contain a maximum of 101,000 items". The SQL page (https://techdocs.gbif.org/en/data-use/api-sql-downloads) states no limit. GBIF's validation (`/occurrence/download/request/validate`) accepted the full 46,041-key query: 508,427 characters, HTTP 201, 2.5 s. Validation is not a run. If the run fails, the answer is `--parts 4` (the build reads the parts), and after that the DWCA route.
- **What the SQL route lacks: GBIF's photographs.** The SQL table has no image address with its licence. The build builder marks GBIF's photographs as not asked when an SQL download has no `media.zip` beside it (it never writes "none"), and `--fill gbif --bulk bulk` takes them in later.
- **Today's GBIF photographs** (counted on `/tmp/claude-0/rev78/real-s/v2`):
  - 61,190 photographs on 5,158 pages.
  - iNaturalist Research-grade Observations: 54,833 (90%) on 5,021 pages. iNaturalist's open data covers these (agent P). 23,489 of them are also on their page as iNaturalist's own photographs. On 606 pages (8,891 photographs), GBIF is the only way iNaturalist's photographs reach the page today.
  - The rest, 6,357 photographs on 1,316 pages: Pl@ntNet 5,669; ALA 363; the Norwegian Species Observation Service 150; Meise Herbarium 68; Observation.org 37; then eight more (`results/r79d-photographs.txt`).
- **The images' download for those other datasets.** By default it leaves iNaturalist's dataset out: 3,240,364 records with images, about 1.5 GB (an estimate). With `--with-inat` it is 40,240,751 records, about 18.3 GB, and gives the DWCA route's photographs exactly.

**The proof** (`scripts/dev/scale/r79d-sql-proof.ts`, `results/r79d-sql-proof.txt`):
- **The sample.** 1,108 real records of seven species from GBIF's search, written in both shapes:
  - the DWCA with GBIF's 230 interpreted columns in GBIF's order;
  - the SQL download in the form a public SQL download shows (empty nulls, Java's doubles, licence codes, rows in another order), with `media.zip` in a third order.
- **The run.** Each was read by `loadOccurrences` and built by `buildDossier`.
- **The result.** 7 of 7 dossiers were equal field for field, at the cap of 2,000 and at a cap of 100.
- **Without iNaturalist's dataset** in `media.zip`, only `photos` (and `upstream.gbif.media` on two species) differ, as expected.

**3. The DWCA route at full size.** `npm run bulk -- gbif scripts/species-list.txt --wait` asks for 45,170 keys: the list's 46,041 less 871 species with more than 100,000 records each, which go to the API path. That is 45,173 predicate items of 101,000, so one request with no split. The tests check that body against round 78's body. `gbif-count` was run here (GBIF's count API, about 53 minutes):
- 142,294,279 records in the download, by the facet;
- the 871 heavy species hold 307.4 million;
- the DWCA would be about 64.9 GB (an estimate at 456 bytes per record);
- the SQL download about 4.8 GB (an estimate, 3.6 to 5.7).

**4. The plan** (`scripts/corpus-plan-full.txt`). Before it come the counts, either route's download, P's open-data load, and the backbone export. Its steps:
1. backup;
2. `--list-extra-keys` (reads the seven merges);
3. the build of the list with `--bulk bulk --skip inat`. K's 2,327 species without a GBIF key are built in this step;
4. review (which download was read, and where the photographs came from);
5. `--prune-followed` (7 leave);
6. `--fill inat --wild --bulk bulk` (P's open data);
7. `--fill inat --bulk bulk` (the cultivated photographs under 9,000 a day, about six days);
8. `--index`;
9. review;
10. upload;
11. live-check.

`corpus-step.mjs` is unchanged, with its review stops kept. Times and disk are in the plan and in DEPLOY, each estimate saying whose rate it rests on.

**5. DEPLOY.md.** "### Round seventy-nine: GBIF's records and the full build" replaces round 78's "A full build from the species list" section and keeps B's table. It covers the account, the counts, both routes, every answer GBIF may give, the old download being refused, the photographs, the proof, the plan table, and both reviews.

**Tests**, each failing on r79base:
- `r79d-gbif-forms.test.ts` (15): on the base it failed at collection, with `SQL_SELECT` undefined.
- `r79d-gbif-requests.test.ts` (10): failed at import, because `gbif-request-lib` was not there.
- `r79d-full-plan.test.ts` (3): 3 of 3 failed. The base plan had no `--wild` pass, still named `merged-pages-79`, and its review said nothing of the download.
- `r78i-merges` (changed): 4 failed.

**About pages.** Changed in `/about/how`, both checked against the code:
- "A heterotypic synonym's key is not read." is now "… is not read, unless the page it names was merged into this one (below)."
- "Two pages that were one plant, … (Coryphantha macromeris and Pelecyphora macromeris; Rebutia fidana and Weingartia fidaiana), are one page under the name Kew accepts: the other's key is read as above," now names the two homotypic pairs and the seven pairs merged by the reference's decision, lists them with `scripts/merged-pages.txt`, and adds "whatever its type". `extraKeysFor` reads a merged key whatever its type.
- "Photographs come first from the media that GBIF's occurrence download carries (" now adds: "or, where the records came as GBIF's SQL download, which carries none, a download of the same records that carry images (".

## Needs

- **P (about page):** in that same parenthetical, "research-grade iNaturalist observations reach GBIF this way" is untrue on the SQL route's default, where the images' download leaves iNaturalist out. Suggested replacement: "research-grade iNaturalist observations reach GBIF this way, unless the records came as GBIF's SQL download, when iNaturalist's come from its open data; other observation datasets reach it this way". Check it against your pass.
- **P (pass size):** on the SQL route, 606 of today's pages get iNaturalist photographs only through GBIF. Your pass must give them their set.
- **P (plan steps):** the plan and `r79d-full-plan.test.ts` name `npx tsx scripts/inat-open-load.ts bulk\inat-open`, `dossier --fill inat --wild --bulk bulk` and `dossier --fill inat --bulk bulk` as your branch has them. If the names change at the merge, change both.
- **K:** the plan assumes your species without a GBIF key build in the list step (`scripts/species-list.txt --grid climate --bulk bulk --skip inat`). If your route needs its own step, add it after that step in `corpus-plan-full.txt` and in the test's list. `downloadShortOf` counts only the list's GBIF keys, so your species never trip it.
- **Q:** any column your cleaning reads from a record must go into both `OCC_TERMS` and `SQL_SELECT` (the SQL download holds only those 15), and must be read the same in both routes. Coordinates are already there. `institutionCode` and `locality` are not.
- **Merge, `scripts/build-dossiers.ts`, my lines only:**
  - imports at 134 and 137;
  - `fillGbifPhotos` messages at 1022, 1025, 1028 and 1046;
  - the coverage check after "Loading bulk files from" (four lines at 1484);
  - the SQL-without-photographs skip after "no occurrence.zip" (four lines at 1508).

## For the owner's PC

```
set GBIF_USER=yourname
set GBIF_PASSWORD=...
set GBIF_EMAIL=you@example.org
npm run bulk -- gbif-count scripts/species-list.txt
npm run bulk -- gbif-sql scripts/species-list.txt --wait        (SQL route)
npm run bulk -- gbif-media scripts/species-list.txt --wait      (beside it)
npm run bulk -- gbif scripts/species-list.txt --wait            (DWCA route, if GBIF refuses or is slow)
node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt
```

On a 403, take the DWCA route. If the download is FAILED, run `gbif-sql … --parts 4 --wait`. If a window closes, run `gbif-status --wait` or `gbif-media-status --wait`. DEPLOY.md gives what good output looks like.

## Measured

- **GBIF's counts.** As above. Records with images: 37,000,387 iNaturalist's and 3,240,364 from other datasets.
- **The proof.** 7 of 7 equal, at both caps.
- **SQL download size.** 25.3 bytes per row, zipped, on the sample. A public SQL download measures 39.8 bytes per row. The estimate uses 34.
- **The reader's parse rate here.** DWCA 8,600 rows per second (230 columns); SQL 48,800 (15 columns): 5.7 times as fast. At the owner's rate (42,000 per second for the DWCA), the SQL download reads in about 10 minutes and the DWCA in about an hour (both estimates).
- **GBIF's validation.** HTTP 201 for the full query. The conversion, the limits page and the public SQL file's format are all in `results/r79d-gbif-answers.txt`.
- **Runs:**
  - `tsc -p .` 0 errors.
  - `svelte-check` 0 errors and 0 warnings.
  - The scripts-only `tsc` shows the base's kinds, plus one more TS7016 line of the same kind for the new test's `corpus-step.mjs` import.
  - The whole unit suite, run once: 2,473 s at a load average of about 11 on two cores. 438 files passed, 1 skipped, 3 failed; 4,183 tests passed, 8 skipped, 3 failed. All three failures were timing cases under that load, in files that touch nothing of mine: `r61g-label-code` (a 200 ms budget), `short-path` (a 20 s timeout) and `search-generations` (a 90 s timeout). Run again alone, `r61g-label-code` and `short-path` passed, and `search-generations` timed out in another case ("wider", 97 s).

## Not done, with why

- **No real SQL download or DWCA was made.** That needs the owner's account; an SQL download also needs GBIF to enable it. The SQL file's form is taken from a public download, and the DWCA's columns from GBIF's describe service. Two equal-form assumptions remain: Java's doubles in both, and vocabulary concepts in both.
- **The build, the fills, `--index` and the upload were not run at this size.** There is no `occurrence.zip` or climate grid here. Every time and disk figure for them is an estimate. POWER's cells are an upper bound.
- **The images' download size** uses the DWCA's average of 456 bytes per record. Image-bearing records carry more images, so it may be larger.
- **The DWCA reader still builds a record of all 230 columns per row.** Indexing only the 16 it reads would cut the read from about an hour to about 15 minutes. Left alone: it is not needed for either route to work.
