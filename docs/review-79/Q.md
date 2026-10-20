# Round 79, agent Q: the cleaning rules and the read-only cross-checks

Branch `r79` in `/tmp/claude-0/rev79/Q/`, five commits on `r79base`: 46c291e, ca6e29f, 3058798, 92d13b5, 2cc210e. The workspace restarted mid-task. The CoordinateCleaner run and the rWCVP run on WCVP version 13 were killed with it, and both were run again from the start.

## Done

**A rule of our own: records at botanic gardens, herbaria and zoos are left out** (`src/lib/dossier/clean.ts`, `src/lib/dossier/build.ts`).

- Every build leaves out a GBIF record that lies within 1 km of a place on Wikidata's list of botanic gardens (arboreta among them), herbaria and zoos. The record is out of the map, the marker and the habitat climate, and is counted.
- The places are `scripts/institutions.txt`: 6,656 lines (3,650 botanic gardens, 293 herbaria, 2,713 zoos), CC0. They were written on 2026-10-20 by `scripts/institutions-fetch.ts`, which asks Wikidata's query service three times with the project's `USER_AGENT`. It takes items of each class or a subclass (Q167346, Q181916, Q43501), or items with an Index Herbariorum code (P5858) or a BGCI garden id (P5818), each with every coordinate it states on Earth. Nothing is matched by name.
- The test runs on the record's own coordinates, before rounding and before the range test. It reads only the coordinates, so the SQL and DWCA routes give the same answer (D's need).
- A page's `gbif.occurrences` detail says, for example, "3 records within 1 km of a botanic garden, herbarium or zoo left out (2 at a herbarium, 1 at a zoo; Wikidata's list)".
- A build with no places file says "records not tested against botanic gardens, herbaria and zoos: no list of them was given to this build" (rule 2). `--institutions <file>` names another file.
- The rule is CoordinateCleaner's institution test in substance. None of that package's code or data is used: its institutions are not our list.
- **Why 1 km, not CoordinateCleaner's 100 m.** A garden's Wikidata point is one point of grounds that run to a kilometre, and the corpus writes points to three decimals. At Kirstenbosch, 28 kept points lay within 100 m and 305 within 1 km, among them Encephalartos villosus and Afrocarpus falcatus, whose wild stands are far to the east. At the Missouri Botanical Garden the counts were 8 and 83, nearly all sheets placed at the herbarium.

**The build's log reports the rule's effect, which is the climate measure for the owner's PC** (`InstitutionEffect` in `clean.ts`; `scripts/build-dossiers.ts`).

- The build ends with one paragraph: "Institution rule (Wikidata's 6656 botanic gardens, herbaria and zoos, 1 km): N records of S species left out; A of those species have a habitat climate".
- For each page whose previous file was built without the rule, it adds a comparison: how many kept a climate, on how many grid cells now against before, and every species that lost its climate, by name.
- With no places file, it prints "Institution rule not applied: … not found".
- The lines in `scripts/build-dossiers.ts` (shared with D, K and Z):
  - the import, line 150;
  - `INSTITUTIONS` and `places`, lines 457 to 463;
  - `places` passed to `buildDossier`, lines 1582 to 1584;
  - `instEffect`, lines 1543 to 1544 and 1701;
  - the two log lines, 1736 to 1737.

**`/about/how`, "Which records count"** now says the rule. It also says what the rule costs: "since such a record is most often a planted plant or a specimen placed at the herbarium that keeps it, whatever the record says; a wild plant within that kilometre, as at a garden in the plant's own habitat, is left out with them, and the page's sources count every record left out this way". I checked this against the code. The sentence before it ("drops living specimens…") was untrue of the code until this change.

**`docs/DEPLOY.md`:** a new section, "### Round seventy-nine: the cleaning of the records (botanic gardens, herbaria and zoos)".

**Dev scripts** (`scripts/dev/r79q-*`, each saying at its top that it is a dev tool; only the `.R` ones need R): the corpus's points and ranges exported, CoordinateCleaner's tests, rWCVP's answers, the comparison sorted by kind, and the rule's measure.

**Tests:** `tests/unit/r79q-institutions.test.ts`, 8 tests: the places file, the nearest place (across the antimeridian and near a pole), the builder leaving a record out and saying so, "not tested" without a list, the fetch's parsing and queries, the wording, the log's paragraph and the committed file. On a clean `r79base` the file fails at import ("Cannot find module '$dossier/clean'"). With only `clean.ts` copied onto the base, 4 of the 8 still fail: the builder kept 210 records where the test expects 209, gave no "not tested" words, had no fetch script and no effect tally. `tests/unit/r73k-extra-keys.test.ts` and `tests/unit/r72b-ranges.test.ts` each have one expectation extended by the "not tested" clause, since they build with no list. The rule's words say "Wikidata's list", never "places", so `r74-spaces` (a grower's space is never a "place") holds.

## Needs

- **D:** nothing. The rule reads only `decimalLatitude` and `decimalLongitude`, which are in both `OCC_TERMS` and `SQL_SELECT`. `institutionCode` and `locality` are not needed.
- **K:** nothing. A page without a GBIF key has `occ.status` other than `ok`, and the rule's words are added only inside `if (occ.status === 'ok')`. `gbif.occurrences: skipped` stays as it is.
- **F (the review):** a corpus built with the rule differs from round 78's in records, marker and climate on about a third of pages (2,651 of 7,776 species with points on round 77's corpus). The review's diff should expect that. The build's own paragraph says how many.

## For the owner's PC

**Nothing new to run.** `scripts/institutions.txt` is committed, and every build reads it, through `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt` or `npm run dossier -- …`.

**Good output:** near the end of the build's log, the paragraph "Institution rule (Wikidata's 6656 botanic gardens, herbaria and zoos, 1 km): … records of … species left out; … have a habitat climate; beside the pages the build before wrote without the rule …, … kept a habitat climate, on … grid cells where they had …, and … lost it:", followed by each species that lost its climate.

- If more than a few dozen species lost it, read the list before the upload.
- If the log says "Institution rule not applied", run `git checkout scripts/institutions.txt` and build again.

**Optional refresh** (one to two minutes, three Wikidata queries): `npx tsx scripts\institutions-fetch.ts`, then commit the file.

## Measured

**The points:** round 77's real corpus (`/tmp/claude-0/rev78/real-s/v2`), 1,128,880 openly licensed in-range points (`occurrences.open`) of 7,776 species. Restricted records are in no dossier, so no check here sees them.

**CoordinateCleaner 3.0.1 on R 4.3.3**, each test at its documented default unless noted. The run took 31 minutes on the shared two cores; about 16 of them were the two sea tests, and 4.5 the outlier test. In the table, "flagged" counts the points each test flags that our rules kept, and "not near Wikidata" counts those of them not within 1 km of a Wikidata place.

| Test | Points flagged | Species | Not near Wikidata |
|---|---|---|---|
| valid coordinates | 0 | 0 | 0 |
| equal latitude and longitude | 260 | 156 | 260 |
| zero (lat or lon 0, 0.5° around 0,0) | 59 | 49 | 59 |
| capitals, 10 km | 16,257 | 2,057 | 13,381 |
| country and province centroids, 1 km | 2,371 | 1,032 | 2,156 |
| institutions, 100 m | 1,751 | 1,012 | 740 |
| institutions, 1 km | 22,276 | 2,913 | 12,514 |
| GBIF's headquarters | 1 | 1 | 1 |
| sea (Natural Earth land 1:110m) | 95,071 | 3,355 | 93,463 |
| sea, land buffered by a degree | 184 | 95 | 184 |
| outliers (quantile, 5 × IQR, 7+ places) | 21,615 | 2,432 | 21,134 |
| duplicates | 0 | 0 | 0 |

**Which are real faults for a wild habitat envelope.**

- **Institutions: real, and adopted.** Our Wikidata rule at 1 km removes 20,701 points (1.83%) of 2,651 species: 14,449 at botanic gardens, 4,554 at zoos and 1,698 at herbaria, at 3,159 of the 6,656 places. CoordinateCleaner's 1 km test flags 22,276; the two share 9,762, so each catches about 11,000 the other does not.
  - CoordinateCleaner's extra places are mostly university herbaria and institutes that Wikidata holds as universities, not herbaria: Nanjing (100 species at one point), Guangzhou (92), Fukuoka, Campinas, Vadodara, Yale.
  - GBIF's GRSciColl would add 10,898 points of 2,345 species, but neither its FAQ nor its "about" page states a licence for its data, so it is not used (rule 4).
  - What the rule removes: five species lose every point. These are four Gasterias whose only kept points were samples and sheets of 2010 placed 310 m from Kirstenbosch, and Prunus laurocerasus, one point 98 m from a botanic garden in Ljubljana. Six fall under three points, for example Phyllanthus myrtifolius (two of four points at Peradeniya's herbarium) and Lachenalia arbuthnotiae (a 1991 sheet at Kirstenbosch).
  - Among the larger shares removed: Hyophorbe lagenicaulis 2 of 5 points and Wollemia nobilis 2 of 6, both planted far from their only wild sites; Franklinia alatamaha 16 of 39.
  - **Its cost.** Gardens inside a species' own habitat lose wild records too:
    - a botanic garden at Zapotitlán Salinas in the Tehuacán valley (Wikidata's Q136309755): 174 points of 28 species, mostly observations of cacti where they grow wild;
    - Kirstenbosch's slopes: Leucadendron argenteum, 41 of 246 points;
    - Haemanthus pumilio: a 2025 observation 1,000 m from Stellenbosch University's garden, with its other two points 2 and 13 km away.
  - None of these species loses more than a part of its records. `/about/how` now says so.
- **Centroids: a fault on the map, mostly not in the climate.** 2,156 points remain after our rule, at country defaults: French Guiana's (84 species at one point), Angola's (82), Mexico's (59 and 40), Martinique's (53), Paraguay's, Monaco's, Singapore's.
  - Two live samples from GBIF: the records at French Guiana's centroid state an uncertainty of 201,367 m, and Martinique's 26,983 m. Over 10 km, the build's precision rule keeps such records out of the climate already. They stay on the map and count towards the marker.
  - No openly licensed list of province centroids was found that would make a rule our own, so none is added. GBIF has no centroid flag: its 2026 list of occurrence issues was read.
  - GBIF's API then reset every connection, so no more coordinates were sampled.
- **Equal coordinates (260) and the commonest "sea" and outlier points are South Africa's quarter-degree-square centres**: herbarium sheets placed at the centre of a 15′ square, such as −30.375, 30.375.
  - 30,902 kept points of 2,019 species lie on such centres, 30,831 of them herbarium sheets.
  - On the 31 species whose points are all such centres, the dossiers count 164 vague records against 156 open points. So the build's precision rule already keeps them out of the climate; the climates those species have rest on other records. Not a new rule.
- **Capitals, 10 km: mostly not a fault.** 9,195 of the 13,381 left are human observations in cities, inside the species' WCVP native range (Wellington's Myoporum laetum, Rabat's Narcissus papyraceus).
  - The real faults among them are city defaults: Tokyo (108 species at one point), Brasília (46, 41 and 39), Bangkok. The precision rule keeps these out of the climate when their coordinates are written to fewer than three decimals or their uncertainty is over 10 km.
  - A 10 km disc around every capital would remove far more wild records than faults, so it is not adopted.
- **Sea: not a fault the build needs to test.** At 1:110m the coast is too coarse: 93,463 points, mostly coastal (Protea cynaroides on the Cape Peninsula).
  - The 184 points more than a degree from buffered land are small islands missing from the map: Torres Strait, Mokil, Europa. There is one real fault, Pachyphytum kimnachii at 21.7, −108.083 (1962).
  - The climate grid already leaves sea cells out (`seaCells`), so a record at sea adds nothing to the climate.
- **Zero (59):** latitude exactly 0 in Ecuador, Indonesia and Brazil, longitude 0 in Burkina Faso, none near 0,0: places on the equator and meridian, not faults.
- **Outliers (21,134):** statistical range edges, such as Lonicera caerulea in Kamchatka and Dionaea muscipula in North Carolina. The WCVP native-range test is the sourced filter for this job, and a statistical cut would be a guess (rule 3). Not adopted.
- **Duplicates (0), GBIF's headquarters (1):** nothing to do.

**Gap measured, not ruled on:** 1,218 coordinates are shared by 20 or more species (45,591 points of 4,244 species), mostly quarter-degree centres and dataset defaults such as 23.874, −101.554 (180 species). Only a corpus-wide rule with no external source could catch those; that would be a guess, so none was added.

**The climate effect, estimated from the open points only.** Of the 2,651 species the rule touches, 2,594 have a climate now. 2,384 lose at least one 0.05° cell of open points, and 3 would fall under three cells. The restricted records may hold them up, and the grid is on the PC only. The build's paragraph is the measure.

**rWCVP 1.2.4.** Our Kew native, introduced, doubtful and extinct regions were compared with `wcvp_distribution()`'s for the name of Kew's entry each page reads (`distribution.via.name`), at species rank.

- **Same WCVP version (Kew's files the build reads, version 16, extracted 4 June 2026)**, 31 minutes. Of 8,947 pages:
  - 7 hold no Kew range to compare: 2 via GBIF, 3 not available, 2 unresolved homonyms.
  - 8,940 were compared, and 8,939 agree in all four sets. That count includes Delphinium cultorum, whose Kew entry is an artificial hybrid with no range on either side.
  - The 2 differences are explained, not faults:
    - Agave calodonta: Kew gives "Mexico" at level 2 only, with no level-3 area. The page names it, and rWCVP, which maps level-3 areas, leaves it out.
    - Commiphora mollis: Kew holds two entries of those words, the accepted (Oliv.) Engl. and an unplaced F.Hoffm. with Uganda. rWCVP joins them by name, and the build takes the accepted entry by its author (rule 3).
- **rWCVPdata 0.5.0 (WCVP version 13, 21 May 2024)**, 9 minutes: 7,614 agree and 1,326 differ. Since rWCVP on version 16 agrees with ours, every one of these differences is a change in Kew's data between the versions:
  - 141 names Kew did not then accept (99 then synonyms, 39 absent, 2 illegitimate, 1 unplaced);
  - 968 that only gained regions since (2,975 introduced and 392 native region entries added in all);
  - 64 that only lost regions;
  - 119 both gained and lost;
  - 29 whose regions only changed status.

**Checks:**

- `npx tsc --noEmit -p .`: no errors.
- `npx svelte-check --threshold error`: 0 errors.
- `tsconfig.scripts.json`: the same 980 errors as before my changes, none in my lines.
- The whole unit suite, once, took 557 s: 4,164 passed and 2 failed, both from my words (r72b-ranges' exact detail, and r74-spaces finding "places" in the rule's strings). Both are fixed in 2cc210e, and those four files then passed (62 tests). The whole suite was not run again.

## Not done, with why

- **The climate effect itself** was not measured: the CHELSA grid is on the owner's PC. The build's log now reports it there.
- **University herbaria that Wikidata holds only as universities**, about 11,000 points, are not caught. GRSciColl, which has them, states no licence, and taking a university's coordinates for its herbarium would be an inference that Wikidata's own data do not make.
- **No rule for centroids, capitals, sea, outliers or shared coordinates:** reasons above. Each is either already kept out of the climate by the existing rules, or would need a reference that is not openly licensed, or a guess.
- **More GBIF samples** of uncertainty at flagged coordinates: GBIF's API reset every connection after the first two.
