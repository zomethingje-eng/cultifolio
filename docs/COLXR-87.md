# Round eighty-seven: GBIF's move from its Backbone to the Catalogue of Life

GBIF has moved its own taxonomy from the GBIF Backbone Taxonomy to the Catalogue of Life eXtended Release (COL XR). This record says what GBIF has done and when, what each of our uses of a GBIF key depends on, what this round's walk does, and the plan for moving later. Everything here was read on 8 November 2026 unless another day is given.

## 1. What GBIF is doing

The two taxonomies, by their GBIF dataset keys (the `checklistKey` GBIF's APIs take):

- the GBIF Backbone Taxonomy: `d7dddbf4-2cf0-4f39-9b2a-bb099caae36c`. Its keys are whole numbers (Mammillaria grahamii is 5384013).
- COL XR: `7ddf754f-d193-4cc9-b351-99906754a03b`. Its keys are letters and digits (Cochemiea grahamii is `5ZHP3`).

**The backbone is frozen.** It "was last updated in 2023, and will not be updated again" (GBIF's data blog, J. Waller, 23 June 2026, https://data-blog.gbif.org/post/catalogue-of-life-taxonomic-backbone/). "The build process has now been discontinued in favour of the eXtended release of the Catalogue of Life", and the backbone "will no longer be updated, but will remain available for backwards compatibility"; "All GBIF Backbone identifiers will be preserved and supported in the API" (https://techdocs.gbif.org/en/data-processing/taxonomy-interpretation). Its last build is of 28 August 2023: `hosted-datasets.gbif.org/datasets/backbone/current/` lists `2023-08-28`, and `current/simple.txt.gz` and `2023-08-28/simple.txt.gz` are one file (the same ETag, 488,591,022 bytes, last modified 28 August 2023).

**What each service answers by when no taxonomy is named:**

| Service | Default now | Source |
|---|---|---|
| GBIF.org, the website (search and downloads made there) | COL XR | the data blog, 23 June 2026: "GBIF.org has already switched to using the COL XR as the default"; estebanmhGBIF on GBIF's forum, 17 June 2026: "by default all downloads will be done with CoL" (https://discourse.gbif.org/t/getting-occurrence-downloads-interpreted-under-col-xr-instead-of-the-backbone/6385) |
| Occurrence search and count API (`/v1/occurrence/search`, `/v1/occurrence/count`) | the backbone | the data blog: "For occurrence search API, the GBIF backbone taxonomy is still the default"; GBIF's OpenAPI for `checklistKey`: "*Experimental.* … If this is not specified, the GBIF backbone taxonomy will be used" (https://techdocs.gbif.org/openapi/occurrence.json); asked: 5384013 gave 210 records and the same keys with and without the backbone's checklistKey, and 0 records with COL XR's |
| Occurrence download API, predicate downloads (DWCA, SIMPLE_CSV) | the backbone | "If no `checklistKey` is supplied the obsolete GBIF Backbone Taxonomy will be used" (https://techdocs.gbif.org/en/data-use/api-downloads); our DWCA of 21 October 2026 (10.15468/dl.hbdw64, 0038605-260928105237408, 146,433,123 records) named none and its keys are the backbone's |
| SQL downloads (SQL_TSV_ZIP) | COL XR in the table's own columns; the backbone in `occurrence.gbif_classification.*` | the SQL download page, as round seventy-nine read it on 20 October 2026 (`scripts/dev/scale/results/r79d-gbif-answers.txt`, 2); rgbif's SQL article: "GBIF SQL downloads use the Catalogue of Life Extended Release (COL XR) as the default taxonomy" (https://docs.ropensci.org/rgbif/articles/gbif_sql_downloads.html) |
| Species match, version 1 (`/v1/species/match`) | the backbone only | asked with COL XR's checklistKey, it answered the backbone's 5384013 as without it: version 1 does not take the parameter |
| Species match, version 2 (`/v2/species/match`) | the backbone | asked with no checklistKey, it answered `"key":"5384013"` (the backbone's, as a string); with COL XR's, `3XSBX` for the name |
| `/v1/species/{key}`, its synonyms, names and distributions, `/v1/species?datasetKey=`, `/v1/species/suggest` | the backbone's own API (or the dataset named) | the rgbif guide: `name_usage()`, `name_lookup()`, `name_suggest()` "work by default only with the GBIF Backbone"; markus on GBIF's forum, 23 June 2026: the v1 species API will stop indexing and become read-only at some point (https://discourse.gbif.org/t/api-changes-with-col-xr/6397) |
| Maps API | the backbone | the data blog: omitting `checklistKey` uses the backbone "to maintain backwards compatibility" |
| rgbif 3.9.0 (CRAN 5 October 2026) and pygbif 0.7.0, GBIF's clients | COL XR | https://docs.ropensci.org/rgbif/news/index.html; https://docs.ropensci.org/rgbif/articles/col_migration_guide.html (2 July 2026); https://data-blog.gbif.org/post/rgbif-colxr-preparation/ (20 August 2026) |

**When the API defaults change: no day is given.** None of GBIF's pages names a day for the occurrence search, the download API or the species match to change default, nor a day the backbone's keys stop being served. The one estimate is markus's on GBIF's forum, 23 June 2026 (the forum gives no role; he makes the GBIF to COL mapping file on ChecklistBank), asked how long the v1 APIs keep working with backbone keys: "I don't know, but expect at least one year and likely longer" (the forum thread above). GBIF's clients have changed theirs already, and the parameter is marked experimental. So the defaults can change without notice, and a request that names its taxonomy does not depend on them.

**Records' keys.** A record searched or downloaded with no checklistKey, or with the backbone's, carries the backbone's whole-number `taxonKey`, `speciesKey` and `acceptedTaxonKey` (asked: record 4872664595, 5384013, 3945144, 3945144, either way). Each record carries both classifications (`classifications`, keyed by checklistKey: both keys present on that record). GBIF gives no day after which a download stops carrying the backbone's keys; "preserved and supported" is its only word.

**What a download must send.**

- To stay on the backbone: name it for the output, at the top of the request (`"checklistKey": "d7dddbf4-…"`: "the taxonomy used for output, i.e. `species`, `scientificName`, `taxonKey` etc columns"), and for the filter, on each `in` or `equals` of `TAXON_KEY` (`"checklistKey"` on the predicate). Sending neither is the backbone today. GBIF's own conversion of a predicate to SQL (`POST /v1/occurrence/download/request/sql`, asked) gives `ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, …)` with no checklistKey, with the backbone's at the top, with it on the predicate, and with both; with COL XR's on both it gives `ARRAYS_OVERLAP(occurrence.taxonkeys, …)`. rgbif 3.9.0 puts the backbone's checklistKey on each predicate holding a number for the same reason.
- To move: COL XR's checklistKey in both places, and COL XR's keys as the values (`"value": "5WZLF"`). A backbone key under COL XR selects nothing: GBIF answers 200 with no records.
- An SQL download: `occurrence.gbif_classification.taxonkeys` and `.specieskey`, `.taxonkey`, `.acceptedtaxonkey` for the backbone (what we send since round seventy-nine); the bare columns for COL XR.

**From the backbone's keys to COL XR's.**

- GBIF's version 2 match by identifier: `/v2/species/match?scientificNameID=gbif:<key>&checklistKey=7ddf754f-…` answers COL XR's taxon, and its `diagnostics.matchedID` names the backbone's record it read (the data blog: `scientificNameID=gbif:1427067` "will return the corresponding COL XR taxonKey (`Q2M4`)"). rgbif's `gbif_to_col()` asks the same service.
- A synonym's key maps to COL XR's accepted taxon, not to a synonym of COL XR's: `gbif:5384013` (Mammillaria grahamii, the backbone's synonym) and `gbif:3945144` (Cochemiea grahamii) both answer `5ZHP3`, while the name Mammillaria grahamii matched by its words answers COL XR's synonym `3XSBX`. A map by identifier loses which name a record was filed under.
- ChecklistBank's mapping file of the backbone's keys to COL 26.5 XR (https://download.checklistbank.org/col/gbif/README.html, named by the data blog) was not read: the server answered a browser check. markus said on 23 June 2026 that its gaps were still being reviewed, and that the website's redirects from backbone pages are incomplete.

## 2. What our pipeline depends on

The keys we hold, all the backbone's, all whole numbers:

- 46,021 pages' own keys: `scripts/species-list.txt`'s last column, each dossier's `ids.gbif`, the index's `gbif` field (46,021 of 48,375 entries in the live index of 8 November), the cards' `@<key>` aliases.
- 5 page ids are GBIF keys (`g<key>`): g7570556 Albuca longifolia, g7263987 Aphelandra squarrosa, g9263110 Ceropegia macrocarpa, g3702919 Conophytum tomasii, g8005942 Monsonia lheritieri. The other 48,370 are Kew's plant_name_id.
- 3,729 other keys pages read records and photographs from: `scripts/extra-keys.txt` (1,340: 936 of them DOUBTFUL in the backbone), `extra-keys-kew.txt` (1,960), `extra-keys-infra.txt` (429), each with the keys under it not read, and the infra file the holder's key and the keys read with it; `extra-keys-kew-none.txt`'s reasons, read from the backbone's names.
- `scripts/merged-pages.txt`: 11 merges by key, and their `except:` keys.
- Every plant in the tracker records its GBIF key (`taxonKey`), chosen from GBIF's suggestions in the backbone (`/api/names`, `datasetKey=d7dddbf4-…`). That is the grower's own data, on their devices.

Each use, what it depends on, and what breaks if the keys change:

| Use | Where | Depends on | If GBIF's default changed under it |
|---|---|---|---|
| The download's request (records and the images' download) | `scripts/gbif-request-lib.ts` `dwcaRequest`, `mediaRequest` (`TAXON_KEY` `in`, no checklistKey) | the download API's default | Our keys read as COL XR's select no records, and the columns hold COL XR's keys. The reader stops: `scripts/bulk-load.ts` throws on a key that is not a whole number in the first 1,000 rows. Loud, and a lost download. |
| The SQL download | `sqlQuery` (`occurrence.gbif_classification.taxonkeys`), `SQL_SELECT` in `bulk.ts` | GBIF keeping the `gbif_classification` columns | Nothing while they are there; already explicit. |
| Counting records before the download | `countUrl` (gbif-request-lib.ts), `countsFor` (bulk-fetch.ts, `facet=speciesKey`) | the search's default | Silent: every count reads 0, no species goes to the API path, and the download is asked for the heaviest species too. |
| Choosing the species | `scripts/select-species-sources.ts` (`kingdomKey=6`, `facet=speciesKey`) | the search's default; 6 is the backbone's Plantae | Silent: the facet's keys would be COL XR's and match no Kew name by key. |
| The API path's records and photographs | `occurrences`, `media` in `src/lib/dossier/sources/gbif.ts` | the search's default, until this round | Records filed under COL XR's keys, which the page's keys and exceptions would never match. Now the backbone is named and a foreign key is refused (section 4). |
| Reading the download | `OCC_TERMS`, `parseOccRow`, `OccIndex` (bulk.ts): records indexed by `speciesKey`, `taxonKey`, `acceptedTaxonKey` | the download's keys being the backbone's | `Number("5ZHP3")` is NaN: the guard in bulk-load.ts stops the run. |
| The backbone's tree | `simple.txt.gz` from `hosted-datasets.gbif.org/datasets/backbone/current/`, read by `backbone-load.ts`, `select-species.ts`, `kew-extra-keys.ts`, `--list-extra-keys`, `infra-names.ts` | the file staying there | Frozen, so stable; `current/` is a pointer GBIF could move. The dated folder, `2023-08-28/`, is the same file. |
| The other keys' rules | `extra-keys.ts`, the D6 exclusions, `except:` keys, `under` (bulk.ts) | each record's `taxonKey` being the backbone's | A COL XR record would match no key and no exception: records lost, or kept that should be left out. |
| Names | `/v1/species/{key}`, `/synonyms`, `/vernacularNames`, `/distributions`; `usages`, `suggest` (`datasetKey` named) | the v1 species API | Stable while v1 is served; read-only later, by GBIF's word. |
| The backbone match | `matchName` (gbif.ts), `matchUrl` (batch.ts), photo-kind.ts, summary-proof.ts, inat.ts, derive-names.ts, `src/lib/server/synonyms.ts` | v1 being the backbone's alone | Stable while v1 is served. |
| Wikidata | `crossIds` (`haswbstatement:P846=<key>`) | Wikidata's GBIF taxon ID property holding the backbone's keys | Not GBIF's to change; watched, not pinned. |
| Page ids, the index, the tracker | `$core/page-id` (`g` and digits only), `gbifKeyOf` (digits only), `ids.gbif: number`, a plant's `taxonKey` | a GBIF key being a whole number | A COL XR key cannot be a page id, an alias or a plant's key without a new field. So a move is a map beside the old key, never a re-key in place. |

What else the freeze means even if nothing changes: a name published after August 2023, or one the backbone never held, has no species key in it, and the backbone match gives its genus. Asked: Tyrannosaurus mcraeensis (published 2024) is HIGHERRANK, the genus 4822631, in v1, and EXACT, `TPJ7G`, in v2 under COL XR (the example of https://github.com/cyanheads/gbif-biodiversity-mcp-server/issues/89, 5 November 2026). A page whose Kew name is of that kind cannot have a backbone key; how many of the 2,354 pages without one are of that kind was not counted.

## 3. The decision for this round's walk

Confirmed from the sources above, not assumed:

1. **Name the backbone wherever a request would otherwise take GBIF's default.** GBIF's defaults for the APIs we ask are still the backbone's, but GBIF names no day it keeps them, so a request that names nothing can change under us between two runs of one walk. Done in this round for the build's occurrence searches (section 4). The download's request and the counts belong to `scripts/gbif-request-lib.ts`, `scripts/bulk-fetch.ts` and `scripts/select-species-sources.ts`; the changes are given exactly in the report to the coordinator.
2. **Keep the download on the backbone's keys while GBIF serves them.** GBIF says they are preserved and supported, and markus expects at least a year from 23 June 2026. If the walk reads the download it has (10.15468/dl.hbdw64, of 21 October 2026), nothing changes. A new download names the backbone at the top and on its `TAXON_KEY` predicate.
3. **Read the backbone's export from its dated folder**, `2023-08-28/simple.txt.gz`, not `current/`.
4. **Do not move during this walk.** Section 5's sample shows the move is not one-to-one, so it needs its own map, count and dry run, then the owner's decision.

## 4. What was done in this round (src/lib/dossier/sources/gbif.ts, src/lib/dossier/fetch.ts)

- `occurrences` (each page of records and each native region's box) and `media` end their address with `&checklistKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c` (`ON_BACKBONE`). Last in the address, so the bulk path's and the offline fetcher's patterns (`RE_OCC`, `RE_MEDIA`, rederive.ts) and recorded test answers still match. The records are the same: asked both ways, 5384013 gave 210 records and the same keys.
- An answer whose records carry a `taxonKey`, `speciesKey` or `acceptedTaxonKey` that is not a whole number is an error, "did not answer", with GBIF's key quoted, never "none" and never read as a backbone key (`otherTaxonomyKey`, `otherTaxonomyWords`). The backbone match (`matchName`) refuses a key of another taxonomy the same way. Its address is unchanged, since v1 does not take the parameter and `matchUrl` in batch.ts holds answers under that exact address.
- The fetch layer counts each GBIF occurrence search it sends by the checklistKey it names ('' for none), a retry once (`gbifTaxonomyAsked`). `taxonomyLine` says it: "GBIF's taxonomy: 1204 occurrence searches, all on the GBIF Backbone (checklistKey d7dddbf4-…, its build of 2023-08-28)", or how many named none or another. The build prints it once the line is added to `scripts/build-dossiers.ts` (the report gives the exact line).
- Tests: `tests/unit/r87g-backbone.test.ts`, with stubbed fetchers.

Not changed: v1 species endpoints (the backbone's own API), `usages` and `suggest` (their dataset is named already), the SQL download (explicit already).

## 5. The move to COL XR, for a later round

**A sample, asked on 8 November 2026** (GBIF's v2 match, `scientificNameID=gbif:<key>&checklistKey=7ddf754f-…`, one request every 0.3 s; the script and its answers are not kept in the repository):

- 200 page keys drawn at random from the 46,021: 199 matched EXACT to a taxon COL XR accepts, 1 to nothing (Melaleuca linearifolia, 11178763); no two to one COL XR taxon. 5 of the 199 reached a COL XR taxon of another name: Ceropegia longidens to Orbea longidens, Ceropegia archeri to Huernia archeri, Agave paniculata to Manfreda paniculata, Quercus leucotrichophora to Quercus lanata subsp. lanata, and Populus tristis to Populus trichocarpa, another species.
- 100 other keys drawn at random from the 3,729: 80 matched (41 the backbone's accepted, 32 its synonyms, 7 provisionally accepted), each a different COL XR taxon; 20 matched nothing, 17 of them the backbone's DOUBTFUL keys of `extra-keys.txt`.

So about 1 page key in 200 has no COL XR taxon, about 1 in 40 reaches a taxon of another name (some another species, which may be another page's), and about 1 other key in 5 has none, most of `extra-keys.txt`'s DOUBTFUL keys among them. The synonyms' keys collapse onto accepted taxa.

**The plan.**

1. **The key map** (a script of its own, read-only): for each key we hold (the species list's, the four extra-keys files' with their exception and holder keys, the merges'), GBIF's v2 match by identifier under COL XR, and by the backbone's name and author under COL XR (which keeps a synonym's own COL XR taxon); ChecklistBank's mapping file beside them when it can be read. One row a key: the backbone's key, name and status; COL XR's id, name, status and match type, by each route; the day and the COL XR release. Written to `scripts/colxr-keymap-<day>.txt`, with its sources in the header (rule 1). A key with no answer, or two, is recorded as that (rules 2 and 3), never filled in by name.
2. **The dry-run count** (no page written): pages mapped one to one; pages with no COL XR taxon; pages reaching a taxon of another name; two pages or more reaching one COL XR taxon (each a merge decision); other keys collapsing onto their own page's taxon (then redundant), onto another page's (then a conflict) or onto nothing; and each page's records under both taxonomies by GBIF's count API (`taxonKey=<COL XR id>&checklistKey=7ddf754f-…` against today's), with the pages whose records fall or rise by more than a fifth listed. These counts go in the round's record before anything is built.
3. **The model.** `ids.col` (a string) beside `ids.gbif`, never in its place; the index's `col` beside `gbif`. Page ids stay Kew's; the five `g` pages keep their ids. The tracker's plants keep their `taxonKey`, and a backbone key reaches a page through the map. The other keys' rules are re-read from COL XR's own tree (its release export), not mapped key by key, since a map by identifier loses synonyms.
4. **A trial build** of a sample (the 200 above, the 5 that changed name, every pair the count finds) from a COL XR download, read beside the backbone build, each difference in records, regions and climate said in drops.txt.
5. **The owner's decision**, then the download, the build, and the about pages' sentences on the backbone.

Before mid-2027, by GBIF's one estimate.
