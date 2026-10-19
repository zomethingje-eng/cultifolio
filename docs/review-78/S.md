# Round seventy-eight, agent S: the species rule as a sourced, re-runnable list

Commits `41c8e32` and the owner's reference clause after it, on `r78`. The live corpus (8,945 species) and the live
`/about/how` are unchanged.

## Done

**The list.** `scripts/select-species.ts` writes `scripts/species-list.txt`: every species Kew
accepts with at least three cultivated records, iNaturalist's observations marked captive or cultivated and GBIF's
living-specimen records of counted datasets added together, plus every accepted species of the 173 collector genera of
`scripts/specialist-genera.txt` taken whole (hybrids aside, as `derive-names.ts` does), plus every species already in
the reference (the owner's clause of 2026-10-19). No family is excluded:
`excluded-families.txt` is not read. The file opens with `# Cultifolio species list, v1`, then a header (the day, the rule
in one sentence, the dataset rule, every source with its terms or licence, every count), then one tab-separated line a
species: Kew `plant_name_id`, name, author, family, reason (`inat N + gbif M`, `collector genus`, `already in the
reference`, every one that applies, joined by `; `), GBIF key or `-`. **48,368 species**; 46,041 with a GBIF key.

- **The reference clause.** `--reference` (default `static/s/v2`, the corpus on disk) less `scripts/merged-pages.txt`.
  - Each page's species is the Kew entry it cites (`name.kew.entry`), followed to its accepted species, else its name by
    the strict rule (`referenceSpecies()`).
  - A species held by one page keeps that page's own GBIF key, so today's page is built from the key it has.
  - **An entry with no Kew id:** `-` in the `plant_name_id` column, the page's name, author and family, the reason
    exactly `already in the reference`, and its GBIF key, which is then required. Its page id is `g<GBIF key>`
    (`ListEntry.pageId`). The parser refuses a `-` entry without a GBIF key or with another reason, and a GBIF key twice.
  - A rerun against round 79's corpus keeps every page of it by the same clause.

- The pure part is `scripts/select-species-lib.ts`; the polite, cached fetching is `scripts/select-species-sources.ts`
  (GBIF one request a second, iNaturalist one every two seconds, retries with growing pauses on 429, 5xx and dropped
  connections, the project's `USER_AGENT`; every answer kept under `bulk/select/` before it is read; `--offline` asks
  nothing and names what is missing). A rerun from the kept files takes about 70 s and up to 4 GB (Kew's 1.4 million
  names held at once), hence `--max-old-space-size=4096` in the npm script.
- Beside the list: `scripts/species-refused.txt`, every iNaturalist name (2,053) and GBIF key (4,437) refused, with
  its reason and records.

**The dataset rule (decision 1).** One sentence, `DATASET_RULE`: a dataset is excluded when its title, keywords,
publisher or description uses a genebank word (genebank, germplasm, seed bank or seed collection, plant genetic
resources, passport data, cryobank, DNA or tissue bank, and the Spanish, French and German forms; FAO Genebank Standards
2014); counted when it does not and its title, keywords or publisher names a living collection (botanic garden,
arboretum, garden, living collection, national plant collection; BGCI's definition); otherwise not decided and not
counted. Whole words, case, accents and markup aside. The dataset's type is recorded and not used (surveys and
collections share both types). Files: `scripts/excluded-datasets.txt`, `scripts/counted-datasets.txt`,
`scripts/undecided-datasets.txt` (key, title, publisher, records, licence, the rule's reason).

**Matching (rule 3 and decision 5).**

- **The strict rule:** every Kew row of the name's words, misapplied rows aside, leads to one accepted species.
- **GBIF:** the backbone's author first ("author").
- **iNaturalist:** for an active taxon under Tracheophyta whose strict match found two species, the one species Kew
  accepts of those words ("framework"). An inactive iNaturalist taxon gets the strict rule only.
- **Kew accepted only:** an artificial hybrid is refused, not taken.
- **The framework is sourced:** the Tracheophyta taxonomy details page, read 2026-10-19 through the ALA mirror: "sourced
  to Plants of the World Online", "Downstream coverage: rank subspecies", "Deviations: 4117", "Taxon Framework
  Relationships: 285352".
- **The deviations list could not be had.**
  - Every iNaturalist host answers HTML with a Cloudflare browser check (403 "Just a moment").
  - The controller's JSON form (`/taxon_framework_relationships.json`, in iNaturalist's source) answers 500.
  - The Wayback Machine resets the connection here.
  - `deviationsOf()` reads that JSON shape (relationship, taxa, external_taxa, from the model's `set_relationship`) and
    applies it: one-to-one and many-to-one are mapped to the POWO taxon, by POWO's IPNI number first; one-to-many,
    many-to-many and not_external are refused.
  - `--deviations <file>` uses it the day it is had. It is unit-tested on recorded rows. The header says the deviations
    are not applied.
- **GBIF key per species, only where unambiguous:**
  - the backbone's one accepted species of the words;
  - of several accepted, Kew's author;
  - with no accepted, the one doubtful.

**Wired in (task 4).** `scripts/build-dossiers.ts` detects a species list by its first line and reads it with
`parseSpeciesList`, never as `<key> <name>` lines. Its first column is a Kew id, which today's parser would have taken
for a GBIF key. `jobsFromList(list, 'gbif')` builds each species by its GBIF key, or by name where it has none. Agent I
switches the one argument to `'kew'` (a need below); each job carries `pageId` (the Kew id, or `g<GBIF key>`). The parser refuses a cut-off or hand-broken line and a repeated id,
so a list is never half read. Nothing in the corpus or the Worker changes.

**About page (task 5).** Live paragraph untouched. The round-79 replacement, checked claim by claim against the code, is
`docs/PENDING-ABOUT-HOW-R79.md`, quoted here:

> The species list was derived, not chosen by hand. It is the file `scripts/species-list.txt` in the source, written by
> `scripts/select-species.ts` on 19 October 2026. It holds every species Kew's World Checklist of Vascular Plants
> accepts with at least three records of cultivated plants, plus every species Kew accepts of 173 collector genera taken
> whole (the cacti, the mesembs, the stapeliads and caudiciforms, the winter-growing bulbs and their like, less their
> hybrids; the list is `scripts/specialist-genera.txt`), plus every species that was already in the reference, so that no
> page falls out: 48,368 species. Each page of the reference is the species of the Kew entry it cites, or of its name
> where Kew holds that name for one species alone; 26 species are here for that reason alone, and 15 pages whose names
> Kew's checklist does not place stay as they were, under their own names and GBIF's keys.
>
> The records are iNaturalist's observations marked captive or cultivated and GBIF's living-specimen records from
> living collections, counted together. GBIF's are counted only from datasets that a stated rule on each dataset's own
> description finds to be living collections:
>
> - a dataset whose title, keywords, publisher or description names a genebank (a genebank, germplasm, a seed bank or
>   seed collection, plant genetic resources or passport data, in the words of FAO's genebank standards) is left out;
> - one whose title, keywords or publisher names a botanic garden, an arboretum, a garden or a living collection is
>   counted;
> - any other, such as a register of street trees or a field survey, is not counted.
>
> The three lists are `scripts/counted-datasets.txt`, `scripts/excluded-datasets.txt` and
> `scripts/undecided-datasets.txt`. So the genebanks' 1.9 million records, most of them wheat, rice, barley and the
> other crops, count for nothing, and a crop is here by its growers' own records. No family is left out.
>
> Each name is matched to a species Kew accepts only where the match is unambiguous:
>
> - every name of Kew's of those words leads to the same species;
> - or GBIF's name and author lead to one;
> - or, for iNaturalist, whose names of vascular plants follow Kew's Plants of the World Online, Kew accepts exactly one
>   species of those words.
>
> iNaturalist lists where its names depart from Kew's, but that list could not be read, so those departures are not
> applied. Every name refused, and why, is in `scripts/species-refused.txt`, and each species' line in the list says
> why it is there: its two counts, or its collector genus.
>
> The very large genera are not taken whole, and their species are here by their own records: Aloe has 199 of the 593
> species Kew accepts, Euphorbia 401 of 2,077. So a species that is not here is not a statement about the species, only
> about the list.

The live sentences this makes untrue in round 79:

- the "Aloe (9 species …)" sentence;
- the Ceropegia sentences ("about 280 pages here carry a Ceropegia name"). The list names stapeliads under Kew's
  genera: Huernia 77, Orbea 60, Stapelia 31, Caralluma 30.

The pending file says what to do with each.

**Tests** (all new; on the base each file fails at import, the modules not existing):

- `tests/unit/r78s-datasets.test.ts`: the rule on recorded metadata of 14 real datasets, the borderline ones included.
- `tests/unit/r78s-matching.test.ts`: recorded WCVP rows, backbone lines and iNaturalist taxa.
  - Aloe vera, Acer palmatum and Crassula ovata refused strictly and taken by the framework.
  - An artificial hybrid refused; a moss outside the framework; an inactive taxon strict only.
  - The deviations; GBIF keys; the selection.
- `tests/unit/r78s-species-list.test.ts`:
  - the form, read back;
  - refusals of bad lines;
  - the jobs by Kew id or GBIF key;
  - the real list's every line, header counts adding up, and each dataset on one side once;
  - the build's route.
- `tests/unit/r78s-sources.test.ts`: kept answers, no second request, offline asks nothing, GBIF paced at a second, the
  header, nothing non-JSON kept.
- 34 tests, the reference clause and the `-` entry form among them.
- `tsc --noEmit -p .`: clean. `svelte-check --threshold error`: 0 errors. A scripts-only `tsc` over
  `build-dossiers.ts` and `select-species.ts` shows only the `judged` errors the base already has, nothing new.

## Needs

- **I (ids):**
  - In `scripts/build-dossiers.ts`, the line `jobsFromList(parseSpeciesList(text), 'gbif')` becomes `'kew'` when pages
    are keyed by `plant_name_id`. Each job carries `pageId`, `kewId` and `gbifKey` (null for 2,327 species); the build
    should use `gbifKey` for GBIF's records and photographs, and none where it is null. It must not guess one by name
    (rule 3).
  - Keyed by Kew, the 15 entries with no Kew id have no numeric key: `pageId` is `g<GBIF key>`, the form you give such
    pages, and they are built by `gbifKey`.
  - Today's pages behind those entries and pairs:
    - 15 pages whose name leads to no Kew species, listed as `-` entries: Aphelandra squarrosa, Bisnaga hamatacantha, Ceropegia
      ananthapuramensis, C. hadramautica, C. linophylla, C. macrocarpa, C. marnierana, Conophytum tomasii, Cyphostemma
      degraerii, Delphinium cultorum, Dorstenia poinsettifolia, Handroanthus impetiginosum, Harpephyllum caffrum,
      Monsonia lheritieri, Tylecodon cacaliodes.
      - Most are misspellings whose Kew species is also on the list: Handroanthus impetiginosus, Tylecodon cacalioides,
        Cyphostemma degraeri, Dorstenia poinsettiifolia, Ferocactus hamatacanthus, Monsonia emarginata.
    - 8 Kew species held by two pages each, one line each in the list (the reference clause takes the GBIF key by the
      rule for these, not a page's): Ceropegia cereiformis and C. nubica, C. melanops and C. nigra, Conophytum
      calculus twice, Copiapoa boliviana and C. calderana, Drosera paleacea and D. parvula, Dudleya pulverulenta and
      Echeveria peacockii, Echeveria pinetorum and E. sessiliflora, Weingartia canigueralii and W. pulchra.
- **B (sources):**
  - `scripts/bulk-fetch.ts keysFor(file)` should, when `isSpeciesList(text)`, take the GBIF keys from the list's last
    column (46,041) and match by name only the `-` ones, or none. It must not run 48,000 name matches.
  - Any batched source keyed by GBIF or POWO id can read the list the same way.
- **Merge:** `package.json` is left unchanged, so the script is run as `node --max-old-space-size=4096 --import tsx scripts/select-species.ts`, not `npm run select`. `/about/how` is unchanged; apply `docs/PENDING-ABOUT-HOW-R79.md` in round
  79, after the corpus is built from the list. `derive-names.ts` stays until then, since the live page describes it.

## For the owner's PC

Only to refresh the list (the committed one is complete):

```
npm run bulk -- wcvp                         # if bulk/wcvp_names.csv is not there
mkdir -p bulk/backbone
curl -o bulk/backbone/simple.txt.gz https://hosted-datasets.gbif.org/datasets/backbone/current/simple.txt.gz
node --max-old-space-size=4096 --import tsx scripts/select-species.ts   # first run: about 740 GBIF and 120 iNaturalist requests, about 20 minutes; then about a minute
```

Round 79, once I's key switch is in:

```
npm run dossier -- scripts/species-list.txt --grid climate --bulk bulk
```

## Measured

**Datasets** (GBIF, 2026-10-19): 245 datasets hold 4,370,881 living-specimen plant records.

| Side | Datasets | Records |
|---|---|---|
| Counted | 45 | 511,614 |
| Excluded | 52 | 1,872,568 |
| Not decided | 148 | 1,986,699 |

**How the rule decided the borderline datasets:**

- **Excluded:**
  - A botanic garden's seed bank: Barcelona's BGJBB (keyword "germoplasma"), the Australian National Botanic Gardens
    Seedbank, PlantBank, and WA's Seed Technology Centre (description "seed bank").
  - Field genebanks of clones grown outdoors (CNR's PPGR Citrus, Olive, Vitis), by "genetic resources" in the
    description.
  - "Threatened Tree Species in the Philippines", by "genetic resources" in its description.
  - A soil seed-bank survey (Biodiversity Exploratories), on the word. It would not be counted either way.
- **Counted:**
  - Stephen Barstow's private Edible Garden (18,847 records), on "garden".
  - SBT-Living, by its publisher, the Bergius Botanic Garden.
  - Algae culture collections published by Berlin's botanic garden. They match no Kew species.
  - Two herbaria under a garden's name (5 records).
- **Not decided:**
  - Berlin's street-tree register: 1,684,056 records, the largest dataset.
  - Biodiversity Exploratories' vegetation relevés, NZ's weed records, Tanzania's miombo tree surveys, Mexico's
    flora-rescue programme, Dutch monumental trees, culture collections and herbaria.

**iNaturalist** (round 75's 119 pages of 2026-10-17, reused, two days old):

- 59,214 taxa, 10,066,668 observations.
- Taken: 57,161 (53,869 strict, 3,292 framework), giving 56,194 Kew species.
- Refused: 2,053.

| Refusal reason | Taxa |
|---|---|
| No Kew row | 1,019 |
| Above species | 477 |
| Artificial hybrid | 306 |
| Two species | 171 |
| Only unplaced or misapplied | 80 |

**GBIF:**

- 63,654 species keys.
- Taken: 59,217 (53,485 by author, 5,732 strict).
- Refused: 4,437 (3,029 no Kew row).
- From the counted datasets: 43,819 Kew species, 449,962 records.

**The list: 48,368.** Without the reference clause it would be 48,342.

| How a species is in | Species |
|---|---|
| By its records | 43,545 |
| By its collector genus | 6,986 |
| Already in the reference | 8,937 |
| By records alone | 38,855 |
| By collector genus alone | 515 |
| Only by the reference | 26 (15 of them with no Kew id) |

- **Against the study:**
  - With every living dataset counted, the same code selects 54,438, against the study's 54,212. The study also kept
    artificial hybrids and today's corpus whole.
  - The study's 48,650 removed whole families; this rule removes genebank records instead. So 48,342 before the reference clause lands near it with
    every family open.
- **What the filter removed:**
  - The genebank side took 5,092 species under three: Fabaceae 1,378, Myrtaceae 586, Poaceae 529, Asteraceae 316,
    Brassicaceae 265, Proteaceae 246.
  - The undecided side took 1,004 more: wild trees and orchids of field surveys.
- **No major crop falls out:**
  - Wheat stays by 4,262 iNaturalist observations and 119 garden records; its 228,642 genebank records are not counted.
  - Rice stays by 2,717 + 74 (191,369 not counted), barley by 1,581 + 76 (154,709), maize by 12,573 + 80 (62,705).
  - All 40 crops checked stay, and 461 species with over 100 genebank records stay by their other records.
- **What falls under three:**
  - Minor crops and wild relatives held mostly in genebanks: fonio (Digitaria exilis: 2 + 0, 1,084 genebank), little
    millet (Panicum sumatrense), kodo millet (Paspalum scrobiculatum), West African okra (Abelmoschus × caillei) and
    African yam bean (Sphenostylis stenocarpa).
  - Oryza barthii, Solanum brevicaule.
  - Forage Medicago, Trifolium and Stylosanthes species.

**Today's 8,945 pages:**

- 8,945 pages make 8,922 Kew species: 15 pages match no Kew species, and 8 species have two pages each.
- **All kept.** 8,911 of the 8,922 species would be in by the other clauses (by records alone 2,501, by collector
  genus alone 4,282, by both 2,128). The 15 unmatched pages are in as `-` entries.
- **11 are in only by the reference clause**, each under three records and outside the collector genera as Kew names
  it:

| Kew species | Today's page |
|---|---|
| Boucerosia penduliflora | Ceropegia penduliflora |
| Caudanthera edulis | Ceropegia edulis |
| Glandularia racemosa | Verbena racemosa |
| Heliotropium velutinum | (same) |
| Ornithogalum thunbergii | (same) |
| Peperomia jalcaensis | (same) |
| Peperomia macrorhiza | (same) |
| Peperomia monticola | (same) |
| Peperomia pugnicaudex | (same) |
| Zanha golungensis | (same) |
| × Sorbaronia arsenii | Sorbaronia arsenii |

- **The list's GBIF key against today's page key:**
  - Same: 8,916 of the 8,922 species, since a species held by one page keeps that page's key.
  - The other 6 are among the 8 two-page species.
- 39,431 species are new beyond today: Asteraceae 2,976, Orchidaceae 2,636, Fabaceae 1,970, Rosaceae 1,099, Cactaceae
  697 and Bromeliaceae 668 among them.

**Requests made:** GBIF 580 (plus about 15 earlier probes), iNaturalist 3 (framework probes), all paced.

**Unit suite:** the whole suite, run again after the reference clause: 426 files passed and 1 skipped, 4,064 tests passed and 8 skipped (34 in the r78s files). `tsc` and `svelte-check` clean. A second `select-species.ts --offline` from the kept files rewrote all five files byte for byte the same (`git status` clean).

## Not done, with why

- **iNaturalist's deviations are not applied.**
  - The list cannot be fetched from here (Cloudflare check, JSON 500).
  - The code to apply it is in place and tested.
  - The exposure is at most the 3,292 names taken by the framework clause, plus any strict match of a deviating name.
- **The iNaturalist counts were not refreshed.** Round 75's pages are two days old and paged whole. The script fetches
  them afresh when `bulk/select/inat/` is empty.
- **No change to `bulk-fetch.ts`, to the build's keys or to page ids.** Those are B's and I's (needs above).
- **No live about-page change**, by the brief.
- **Scratch:**
  - Deleted: the probes, the duplicate iNaturalist pages and the comparison outputs.
  - Kept: the GBIF answers (about 10 MB) under `/tmp/claude-0/rev78/S-s/cache`, so the list reruns offline here.
  - The working copy's `bulk/` holds symlinks to it, to Kew's file and to round 75's backbone. It is gitignored.
