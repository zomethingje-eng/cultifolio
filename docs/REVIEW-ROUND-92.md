# Round 92: flowering by month from one GBIF download

The plan and its decisions are docs/PLAN-92.md (the owner asked Claude to decide; decided 14 November 2026). Built on
15 November 2026. This file is the record of what was built and how it was checked.

## What changed

1. **The download.** `npx tsx scripts/bulk-fetch.ts gbif-flowering --wait` asks GBIF for one SQL download
   (`FLOWERING_SQL`, `src/lib/dossier/flowering-gbif.ts`): iNaturalist's research-grade observations (GBIF's dataset
   50c9509d-…), Plantae, whose `reproductiveCondition` mentions flowers, counted by taxon key, accepted key, species key,
   month and annotation. GBIF's validation accepted the query on 15 November 2026 (HTTP 201). The request is written to
   `bulk/request-flowering.json` first; `gbif-flowering-status` fetches it into `bulk/flowering.zip` and
   `bulk/flowering-download.json` (key, DOI, the day GBIF made it, the row count).
2. **The fill.** `--fill flowering-gbif --bulk bulk [--dry-run]` counts every page from it, offline:
   - an observation counts when one of its annotations is exactly "flowers": never "flower buds", never "no flowers or
     fruits" (which the query's `LIKE` lets through and the reader leaves out); a row with no month is left out and
     counted in the line;
   - under the keys the build reads the page's records by: its own key (as taxon, accepted or species key, so its
     synonyms' and varieties' observations count, as GBIF's taxonKey search counts them), less the keys given to another
     page (round 86's infra keys); the other keys `scripts/extra-keys.txt` gives it, less each key's exceptions (read
     against the row's taxon key, as a record's are); for a page with no GBIF key, the keys Kew's synonymy gives it. A
     row is counted once on a page. The one rank not reached: a form under a variety under the page's key;
   - every page with a key is written (twelve zeros said as the download's none); a page with no key loses the API's
     count, so no page shows the two sources (decision 2); a page counted from the same download before is passed by;
   - every page the API read is compared with the download (`bulk/flowering-compare.tsv`), and the pages sharply apart
     (the API 30 or more, the download none or a cosine under 0.8) are listed in the log;
   - a download not read whole (no state, not fetched, no DOI or day, tar failing, a row count that is neither GBIF's
     rows nor its observations) writes nothing, exit 2.
3. **The record.** `flowering` is either form: the API's (`{ taxon, months?, read, unanswered? }`, as before) or the
   download's (`{ source: "gbif", key?, keys, months, doi, made, read }`). A build carries the download's while the page's
   own GBIF key is the one it was counted under.
4. **The page.** A page counted from the download says: "Flowering observations of wild plants on iNaturalist, as
   iNaturalist shares them with GBIF: GBIF.org (<day>) GBIF Occurrence Download https://doi.org/<doi>: N observations,
   research grade, openly licensed (CC0, CC BY or CC BY-NC), counted under the page's GBIF keys", the DOI the link (GBIF's
   citation form). None: "No research-grade observation of a wild plant that iNaturalist shares with GBIF is annotated
   flowering under this page's GBIF keys, in GBIF's download." Not asked: "this page has no GBIF key to count its observations under", or "this page
   has not been counted from GBIF's download yet". A page still on the API's count keeps its line until the fill runs.
5. **The about pages** (rule 5): /about/how's rules for flowering (the download, the keys, none, the monthly refresh, the
   API's count on a page not yet counted, which is higher because it holds observations iNaturalist does not share);
   /about/data's row; /about/formats' two forms. /about/data names no one DOI: each page cites the download it was counted
   from, and a monthly refresh makes a new one (a change from the plan, which said "/about/data's DOI").
6. **The plans.** `scripts/corpus-plan-r92-flowering.txt` (the first run): backup, the dry run, a review whose `expect`
   lines hold the plan's stop conditions, a second review that always stops (the pages sharply apart are read with Claude
   before any page is written), then the fill, the index, the upload, the live check. `scripts/corpus-plan-r92-monthly.txt`:
   the fill, a review on its own line, the index, the upload, the live check. The daily plan runs `--fill bhl` alone, and
   `--fill flowering` asks nothing and says why (exit 2), so nothing puts the API's count back.

The /changes line went in after the fill was uploaded (below), so it never said what a reader could not yet see.

## Tests

- `tests/unit/r92a-flowering-gbif.test.ts` (on 0509684: FAILED, no module): the query and the request body; the reader
  (annotations, months, columns by name, a file with no header); the keys (own key three ways, keys given away, another
  key's exceptions, each row once, a page with no key of its own); the fill (written, none, the API's count taken off,
  passed by, the dry run writing nothing, the comparison); the plans (the first review passing within its conditions and
  stopping outside each, the second always stopping, the monthly review, the daily plan without flowering); the words,
  the record, the carry, the old fill passing a counted page by; the loader on a real zip, and its four refusals.
- `tests/e2e/r92a-flowering-gbif.spec.ts` (on 0509684: FAILED): the fixture's Welwitschia mirabilis, counted from the
  download, cites GBIF.org, its day and its DOI as the link; Copiapoa cinerea keeps the API's line and its link.
- Updated: r87l-flowering (the "not asked" words), r87s2-species (Copiapoa humilis has a key: "not counted yet"),
  r87s2-integration, r89b-review-checks and r90a-daily-fills (the daily plan's one fill).

## The record

- 15 November 2026: GBIF's SQL description (`/v1/occurrence/download/describe/sql`) lists `reproductivecondition`
  (STRING), `specieskey`, `acceptedtaxonkey`, `taxonkey`, `month`, `datasetkey` and `kingdomkey`; GBIF's validation
  accepted `FLOWERING_SQL` (HTTP 201), and `gbif-flowering --dry-run` wrote the request and had it accepted again.
- `--fill flowering-gbif --dry-run` with no download: "not counted, nothing written: no bulk/flowering-download.json: ask
  GBIF for the download first", exit 2.
- svelte-check: 0 errors in 1,813 files. Unit tests: every file passed but two, which passed alone: /about/how went 21
  words over its 6,000-word ceiling (trimmed back) and a component mount could not fetch its module (Vite's cache, as on
  14 November). The new and changed browser tests: 10 passed in Chromium, desktop and phone.
- 15 November 2026, the method on real pages before GBIF is asked: a stand-in for the flowering download made from the
  occurrence download on disk (doi 10.15468/dl.hbdw64, 21 October 2026; a script outside the repo grouped its
  iNaturalist rows as `FLOWERING_SQL` does: 146,433,123 rows read whole, 4,990,943 with a flowers-like condition, 407,839
  groups), then `--fill flowering-gbif --dry-run` with `--bulk` on that stand-in. No dossier was written (the newest
  dossier's time the same before and after). The fill's lines: 407,839 rows read, 310,322 taken, 4,065,266 observations
  annotated flowers, 925,677 annotated otherwise; 48,375 pages: 31,104 counted, 16,672 none, 599 with no GBIF key (65 of
  them with the API's count, which the fill takes off). Against the API on its 10,720 pages: 7,329 with counts from both,
  median ratio 0.80; of the 2,996 with 30 or more from the API, the peak month within one month on 94.7%, the tenths the
  same on 71.6%; of the 1,819 over 100, 11.3% none in the download; 257 sharply apart.
  The 11.3% is the stand-in's, not the method's: the occurrence download left species with over 100,000 records to the
  API path (`bulk/api-path.txt`), so it holds none of their rows (Lamium purpureum, the API 31,147; Trifolium repens,
  22,996), and 228 of the 257 pages sharply apart are those. The flowering download has no species list and holds them.
  Without them: 1,623 over 100, 0.6% none in the download; 29 sharply apart, the cases decision 2 expects (Trichogalium
  boreale, Oxalis smalliana, Rhus copallinum, Valeriana locusta: names GBIF and iNaturalist file apart; Melaleuca citrina
  and Monardella odoratissima, the shape far apart, as lead 1 found). Every stop condition holds on the method's figures;
  on the stand-in as it is, the first review would stop on the 11.3%, which is what it is for.
- 15 November 2026, after 7897f2a was deployed: GBIF's first flowering download (0008674-261110092616502, DOI
  10.15468/dl.3wcta5) held no row. The plan's dry run read it, wrote nothing, and its review stopped (the median ratio, the
  peak month within one month on 0%, 100% of the pages over 100 from the API with none in the download). The cause: the
  query asked the plain key columns, which in GBIF's SQL table are the Catalogue of Life's (docs/COLXR-87.md, round
  seventy-nine's `sqlQuery`); `kingdomkey = 6` matched no record. A probe (0008696-261110092616502: Lamium purpureum's
  species key 2926682 in the plain `specieskey`, April 2024, every dataset) held no row either, where GBIF's search holds
  iNaturalist's flowering records of it. GBIF's validation checks a column's name, not what it holds, so it had accepted
  the query. Fixed: `FLOWERING_SQL` reads the backbone's keys, `occurrence.gbif_classification.taxonkey`,
  `.acceptedtaxonkey`, `.specieskey` and `.kingdomkey = '6'` (validated: HTTP 201; a column GBIF does not have, 400). And
  the loader now refuses a download with no observation annotated flowers ("an empty answer from GBIF, not a count of
  none"), exit 2: the monthly plan's review reads only the page counts, and would have let twelve zeros be written on
  every page with a key.
- 15 November 2026, the download on the fixed query: 0008715-261110092616502, DOI 10.15468/dl.y8zpkp, 672,819 rows, 16.3
  MB, its header beginning with a byte-order mark (read by name; a test now holds it). 7,727,578 observations, 6,364,287
  annotated exactly "flowers", 87,942 species keys, none without a month. Lamium purpureum 24,743 (the API 31,147; peak
  April), Trifolium repens 18,434 (the API 22,996): the species the stand-in lacked are there. The fill's dry run on it,
  nothing written (the newest dossier still of 14 November): 536,821 rows taken; 48,375 pages: 32,100 counted, 15,676
  none in the download, 599 with no GBIF key; against the API's 10,720 pages, median ratio 0.81, the peak month within one
  month on 95.4% of the 3,228 with 30 or more, the tenths the same on 74.4%, 0.4% of the 1,819 over 100 with none in the
  download; 25 sharply apart: names GBIF's backbone files apart from iNaturalist's (Oxalis smalliana, Rhus copallinum,
  Leucopogon parviflorus, Opuntia cespitosa, azurea and bonaerensis, Libanotis pyrenaica, Peucedanum palustre and
  alsaticum) and shapes far apart (Melaleuca citrina 0.18, Apocynum venetum 0.35, Monardella odoratissima 0.68), the
  cases decision 2 expects. Every stop condition holds.
- 15 November 2026, the first run (scripts/corpus-plan-r92-flowering.txt, the run on the empty download set aside by
  hand and noted in corpus-step.log): the first review passed by its 11 checks; the 25 pages sharply apart read with
  Claude, asking GBIF where iNaturalist's observations under each name are filed. Four kinds: the same plant under
  another GBIF key (Rhus copallinum, 32,285 as "Rhus copallina"; Libanotis pyrenaica as Seseli libanotis subsp.
  libanotis; Opuntia cespitosa, azurea and bonaerensis and Vaccinium fuscatum lumped by GBIF into another species);
  names GBIF matched only to a genus or a family (Peucedanum palustre and alsaticum to Apiaceae, Veronica umbrosa,
  Lespedeza frutescens, Varronia globosa, Apocynum venetum); another plant's observations under a page's key (Oxalis
  smalliana's 7,996 under Oxalis oregana, whose download count is 2,147 to the API's 1,167; Metrosideros angustifolia's
  under Melaleuca citrina's key; Leucopogon parviflorus's under Leptecophylla parvifolia); and names iNaturalist does not
  use (Nicoteba betonica, Morinda pubescens). The maps and ranges read the same keys, so none of this is new with
  flowering; the fill went on (--go-on): 32,100 pages counted, 15,676 none, 599 no key, the index, the upload (corpus
  3a670efa602351c1) and the live check, 23 of 23. Lamium purpureum live: 24,743 observations, citing
  10.15468/dl.y8zpkp.
- After it: the none sentence says "under this page's GBIF keys", since on the second kind the download holds the
  observations under the family (/about/how says the same); the /changes line. Left for a round of its own: the keys
  for the first kind (scripts/extra-keys.txt) and a rule for the third, which the `except` mechanism cannot split.
