# Round 79, agent P: iNaturalist's photographs (the owner's decision 3)

Branch `r79` in `/tmp/claude-0/rev79/P`, seven commits on `r79base` (5cbb4d6, d8afaa7, 077861d, f94f1a8, 62277a4, 3be1961, 14f2c79). The workspace restarted part way through. The first full read of the open data was killed at 15%; it was run again from the start and finished.

## Done

**The reader.** `src/lib/dossier/inat-open.ts` (pure) and `scripts/inat-open-load.ts` (its command). It reads four files of iNaturalist's open data from the bucket `inaturalist-open-data`: `taxa`, `observations`, `photos` and `observers` (`.csv.gz`, or `.csv` already unpacked). The two big files are read together in one pass. iNaturalist writes photographs nearly in the order of their observations. A window of half a million observations is held, and a photograph's observation was never more than 23,049 rows away. A photograph left unjoined at the end stops the script and nothing is written, so no set can lack a photograph. A missing column stops it and names the column. Per plant taxon at species rank or below, it writes the answer the builder's wild request (`inat.wildUrl`) would get, in the API's own shape, to `bulk/inat-wild.jsonl`. It keeps the builder's rule:
- research grade only;
- the taxon and every taxon below it at species rank or below (through `ancestry`);
- at least one CC0, CC BY or CC BY-SA photograph, and only those photographs are kept (rule 4);
- 24 observations a taxon;
- the author is iNaturalist's attribution as the API writes it: "(c) name, some rights reserved (CC BY)", the login where there is no name, "no rights reserved" for CC0;
- a photograph's page is its observation's address by uuid (`https://www.inaturalist.org/observations/<uuid>`). The export has no observation number.

The builder's own filters then run unchanged on that answer: licence, author, placeholder, and descendants Kew places elsewhere. One rule cannot be kept. The API orders by votes and the export holds no votes, so for a taxon with more than 24 observations the open data's 24 are the ones whose open photographs iNaturalist received last (the highest photograph id), newest first. The page's record says this in so many words.

**Captive or cultivated, from the files.** I read the headers and a sample of each file; the columns are in DEPLOY.md and at the top of `inat-open.ts`. No file has a captive or cultivated flag. `observations` has `quality_grade` (research, needs_id, casual), and iNaturalist never makes a captive observation research grade. So the wild set, which is research grade only, needs no flag, and nothing captive can enter it. In the proof, all 791 observations of the open data's wild sets that the API also answered for are `captive: false` by the API. The cultivated set cannot come from the files: casual mixes captive observations with ones lacking a date or place. So the cultivated set stays with the API.

**The builder and the fill** (`scripts/build-dossiers.ts`):
- `heldWild` answers the builder's wild request from the file wherever the file holds the taxon. It sits outside the day budget and the day cache, so it is never counted and never sent. Anything else goes to the API as before.
- The file is found by `--bulk <dir>` (`<dir>/inat-wild.jsonl`) or by `--inat-open <file>`. `--no-inat-open` turns it off.
- `--fill inat --wild` fills the wild set alone, for every page with an iNaturalist id the file holds, and asks iNaturalist nothing: its fetcher refuses anything the file does not answer.
- `--fill inat` then asks only for what the file cannot give: the cultivated set, the taxon of a page without one (that page's wild set then comes from the file), and the wild set of a taxon newer than the export. That last case keeps the old rule of fewer than six from GBIF (`wildToAsk`).
- With the open data, a "not asked: N already from the GBIF download" no longer stops the wild set: it costs nothing.
- **Pages without a GBIF key (K's).** Under `--wild`, such a page is taken only once its id has passed Kew's names (`inat.taxon` ok). An id its Wikidata item gave, not yet checked, waits for `--fill inat`, where K's `kewInatTaxon` checks it. I trial-merged K's branch: `build-dossiers.ts` merges cleanly and the merged `fillPhotos` reads correctly. `/about/how` conflicts on its one long sources line (see Needs).

**The proof** (`scripts/dev/scale/r79p-inat-open-proof.ts`, results in `scripts/dev/scale/results/r79p/`). It ran on 50 real species from the list (`sample-50.tsv`), one API request every 2.1 s with the project's User-Agent. The API's answers are kept in `api-answers.json`, so it can be run again without asking. The open data's answer came from the full read, with these 50 taxa kept to 200 observations each. The builder's real `inat.photos` ran on both answers. Results (`proof.json`):
- **The whole qualifying set** (species with at most 200 observations): the same for 37 of 42. Each of the other five is explained:
  - Discocactus catingicola, Albuca seineri and Geissorhiza tenella: an observation created 2026-10-05 to 10-14, after the export of 27 September.
  - Geissorhiza's second extra: identified again on 2026-10-08.
  - Crocosmia paniculata: the export holds one observation as research grade that is now needs_id, changed 2026-10-14.
  - Alstonia scholaris: the API has a CC0 observation from 2024 that is in neither of the export's files. The export holds only photographs under a CC licence (every observation in it has a photograph row: 0 without), so its photograph was most likely relicensed after the export. The API gives no date for a licence change, so this one is inferred, not proven.
- **The builder's photographs**, where a species has 24 observations or fewer: the same photographs for 29 of 30. The 30th (Discocactus) lacks the observation of 14 October.
- **Field by field**, on the 719 photographs both chose:
  - address, thumbnail, size, licence, date, captive flag and source: all equal;
  - page: equal in all 719 (the same observation, by uuid instead of number);
  - place name: absent from the open data's answer (701 had one from the API);
  - credit: one differs. The API's attribution says "(c) A4" (the photograph's own record) and the open data's says "(c) Yi-Zhang Wang" (the observer's account name).
- **Order within an observation**: for 54 of 427 observations with two or more photographs, the export's `position` disagrees with the API's. I checked two of them against the API's `observation_photos[].position`. The positions differ, and neither observation had changed since 2021 or 2025. So the export's order is not the API's: the same photographs, but sometimes another one first.
- **Species with more than 24** (20 of the 50): 209 of the API's 480 choices are among the open data's 24 newest. Only 78 of the API's 480 had any votes.

**The fill on today's corpus.** I made a copy of round 77's corpus, re-keyed to version 3 (8,947 pages, in `/tmp/claude-0/rev79/P-s/real`), removed every page's wild-set record, and ran `--fill inat --wild`. Results:
- 7,870 pages filled from the file in 216 seconds, with no request to iNaturalist. The other 1,077 have no iNaturalist id.
- Pages with wild iNaturalist photographs: 5,110 before, 5,549 after. The 439 that gain them mostly had "not asked" because GBIF gave six or more. No page lost all of them.
- 193,015 wild photographs against 186,756 before.
- 777 pages show ten or more fewer. They still have 24 observations, but the most-voted observations carry 2.6 photographs each and the newest 1.8.
- These figures are in `fill-wild-today.json`.

**Docs.**
- DEPLOY.md, under `### Round seventy-nine: iNaturalist's photographs`: what changes, the four files with sizes and columns, what a page shows differently (the proof's figures), and steps 1 to 4 with exact cmd commands, good output, times and disk. The commands match D's plan and `r79d-full-plan.test.ts`: `npx tsx scripts/inat-open-load.ts bulk\inat-open`, `--fill inat --wild --bulk bulk`, `--fill inat --bulk bulk`. The loader's "Next:" line now prints `--bulk <dir>`.
- The README's fills paragraph.
- `/about/how`: the photographs sentence (below).

**Tests.** `tests/unit/r79p-inat-open.test.ts`, 14 tests, with fixtures `tests/unit/fixtures/r79p-inat-open/` (real rows of the four files) and `r79p-inat-api.json` (the API's answers for the same taxa). They cover:
- the reader on real rows (taxa and descendants, the wild rule, `keep` and `only`, out-of-order joins and the unjoined count, a missing column);
- the same photographs as the API, field by field (the author, and a casual captive observation kept out);
- the store and `heldWild` (answers only a wild request it holds, uncounted, with the record's words; no file means the API unchanged);
- the fill (`wildToAsk`, the script's wiring, and `--fill inat --wild` run end to end on a page with a GBIF key, a page without one by its checked id, and one whose id is unchecked, which waits).

On `r79base` the whole file fails before any test runs: "Cannot find module '$dossier/inat-open'". The module and the loader do not exist there.

**Checks.** `tsc --noEmit -p .` clean; `svelte-check --threshold error` 0 errors. The whole unit suite once: 439 files passed, 1 skipped; 4,172 tests passed, 8 skipped; 340 s.

## Needs

- **The merge, `/about/how`.** K's branch and mine both change the one long "What comes from where" line, so git conflicts there. Take K's text and put my photographs sentence into it.
  - Base: "research-grade iNaturalist observations reach GBIF this way, and so do other observation datasets), then from <b>iNaturalist</b> directly for the cultivated set and for species the download gave few of (the wild set is research-grade observations not marked captive; the cultivated set is …"
  - Mine (checked against the code): "research-grade iNaturalist observations reach GBIF this way, unless the records came as GBIF's SQL download, when iNaturalist's come from its open data (below); other observation datasets reach it this way), then from <b>iNaturalist</b>: the wild set from iNaturalist's open data, the export it publishes each month on AWS, whatever the download gave (research-grade observations, which iNaturalist never marks captive, of the taxon or one below it, with a CC0, CC BY or CC BY-SA photograph; of a taxon with more than 24 such observations, the 24 whose photographs iNaturalist received last, since the export holds no votes; a photograph's page is its observation's, by the observation's uuid), or, for a taxon newer than the export, from iNaturalist directly for species the download gave few of (research-grade observations not marked captive, the 24 iNaturalist puts first by votes); and the cultivated set from iNaturalist directly (the cultivated set is …". The SQL clause is D's suggested wording; it is true of D's default `media.zip`, which leaves iNaturalist out.
- **The merge, `scripts/build-dossiers.ts`** (my lines on HEAD): the usage lines 20 to 25; the import at 121; `openWild`/`upstream`/`upstreamApi` at 182 to 204; `fillPhotos` at 542 to 552 (doc), 555 to 557, 572 to 590 and 623 to 644. They merge cleanly with K's.
- **D:** none. Your plan's three commands are the ones DEPLOY.md now gives. Your 606 SQL-route pages get iNaturalist's wild set from `--fill inat --wild`, which reads the file whatever the download gave.
- **F (review step), optional:** a review could count records whose detail starts "from iNaturalist's open data of" (`OPEN_WILD_RULE`), to say which export filled the wild sets.

## For the owner's PC

In the project folder, cmd (DEPLOY.md has the detail):

```
mkdir bulk\inat-open
curl -R -C - -o bulk\inat-open\taxa.csv.gz https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz
curl -R -C - -o bulk\inat-open\observers.csv.gz https://inaturalist-open-data.s3.amazonaws.com/observers.csv.gz
curl -R -C - -o bulk\inat-open\observations.csv.gz https://inaturalist-open-data.s3.amazonaws.com/observations.csv.gz
curl -R -C - -o bulk\inat-open\photos.csv.gz https://inaturalist-open-data.s3.amazonaws.com/photos.csv.gz
npx tsx scripts/inat-open-load.ts bulk\inat-open
npm run dossier -- --fill inat --wild --bulk bulk
npm run dossier -- --fill inat --bulk bulk
```

- **Download:** 34.1 GB (13.42 GB + 20.67 GB + 40 MB + 17 MB), about 45 minutes at 100 Mbit/s.
- **Disk:** keep about 36 GB free; the output file is 1.1 GB.
- **Read:** under an hour.
- **Wild fill:** about 20 minutes at 48,368 pages.
- **Cultivated fill:** the last command once a day for about six days (49,000 to 54,000 requests at 9,000 a day). It stops with exit 3 at the day's allowance.
- **Afterwards:** `rmdir /s /q bulk\inat-open`.

## Measured

- **Full read, here:** 2,942 s (49 minutes), streaming both big files straight from the bucket on the shared two-core machine. Peak memory 1.05 GB (VmHWM). 282,933,221 observations and 501,256,126 photographs. 64,366,921 research-grade plant observations, 10,789,509 of them with an open photograph. 115,849 taxa have a wild set out of 398,211 plant taxa written. 1,201,219 observations kept. Output 1,111 MB. Header and log in `results/r79p/full-wild-header.json` and `full-read.log`. The header's two big file sizes read 0 here because they were pipes; on the PC they are the files' sizes.
- **Proof:** 66 API requests in all (63 kept in `api-answers.json`, three by hand for the positions and the Alstonia observation), at least 2 s apart.
- **Wild fill:** 216 s for 8,947 pages.
- **Cultivated cost of a species without a GBIF key:** 1.8 requests (25 sampled, `inat-cost-no-gbif-25.json`).
- **Extra check:** a second stream of both files (19 minutes), only to read the rows of the 55 observations the proof questioned.

## Not done, with why

- **Not measured on the PC:** the read from local disk and the download time. Both are estimated from the measurement here, which was network-bound.
- **The Alstonia observation** is explained by inference only; no source dates a licence change.
- **The order within an observation** cannot be made the API's: the export has no other order column.
- **The place name** is lost for open-data photographs; the export has none.
- **No browser test:** nothing on the site's pages changed.
- **Scratch:** trimmed to 62 MB; the 1.1 GB output file is deleted (49 minutes to make again). `/tmp/claude-0/rev79/P-scratch/full-more.jsonl` (1.7 MB) is kept, so the proof can be rerun with no request.
