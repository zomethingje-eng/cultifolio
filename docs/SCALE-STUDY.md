# Scaling Cultifolio to 50,000 and 100,000 species

Round seventy-five, agent S. A measured study, not a change: no production code is touched. The scripts are under
`scripts/dev/scale/` and their outputs under `scripts/dev/scale/results/`. Section 8 says how to run each one.

## Conclusions

1. **Which species.** A sourced rule exists for 50,000 and nearly reaches 100,000, but cultivation evidence alone does not.
   - iNaturalist's API is not capped for this query: all 59,214 cultivated plant taxa page out. They match 56,497 species Kew accepts.
   - Adding GBIF's living-specimen records (botanic gardens and other living collections) raises the evidence to 81,848 species. That is the most any open, re-runnable cultivation measure gives today.
   - **For about 50,000, recommended:** every species Kew accepts with at least 3 cultivated records, counting iNaturalist observations marked captive or cultivated and GBIF living-specimen records together, plus every accepted species of the collector genera. That is 54,212 species.
   - **For about 100,000, recommended:** every species Kew accepts with at least one cultivated record, plus every accepted species of a genus in which at least half the accepted species have one, plus the collector genera. That is 97,184 species.
   - Today's 8,945 are all kept only because the collector genera are named whole. Without that clause, about half of them (4,273) have fewer than 3 cultivated records.
2. **The Worker.** Today's design does not reach 50,000.
   - A cold isolate parses the whole index and builds name maps over it: 43 MB of heap and 0.5 s at 8,947 species, measured in node.
   - The same code at 50,000 synthetic species needs 221 MB, and at 100,000 needs 446 MB and 5.8 s. Cloudflare's limit is 128 MB an isolate.
   - By linear scaling it stops fitting somewhere between 25,000 and 40,000 species. The range allows for V8's pointer compression in Workers, which node lacks.
   - **Recommended:** the Worker holds no whole-index structure. Names resolve through 1,024 small hashed shards in R2, one read a page: at most 37 KB, under 1 ms to parse, 0.2 MB.
   - The search reads one small posting file per query word, each carrying its candidates' search fields: 2.3 KB median, 2.4 MB at worst at 100,000.
   - The photograph judgement that now needs every name in the reference moves to the build. A cold start then costs the same at 100,000 as at 9,000.
3. **The corpus build.** Today's per-species design is bounded by two daily allowances, not by the PC.
   - It makes about 14 requests a species. At 100,000 species, that is 283,000 iNaturalist requests: 28 days at iNaturalist's 10,000 a day.
   - It also makes 100,000 OpenAlex searches: $100, or 100 days on the free key's $1 a day.
   - Most of the rest has a bulk or batched replacement that exists today: Kew's files, GBIF's backbone export, GBIF's downloads, iNaturalist's open data on AWS, batched Wikidata SPARQL and batched Wikipedia extracts.
   - GBIF's `occurrence.zip` grows from 12.7 GB today to about 69 GB at 54,000 species and 75 GB at 97,000. The build uses at most 2,000 records a species, which is under a third of what it downloads.
   - An SQL download of only the columns the build reads would be about 3 to 7 GB at 100,000. It is experimental and needs GBIF's permission.
4. **Storage and serving are cheap at 100,000.**
   - About 5.6 GB in R2, inside the free 10 GB.
   - About 169,000 objects for a full upload, inside the free million Class A operations a month.
   - The client's first visit does not grow with the corpus. The catalogue's genus file grows from 315 KB to about 2.1 MB, read by the Worker, never sent whole.
5. **Formats.** Key pages by Kew's `plant_name_id` instead of GBIF's backbone key. GBIF itself now calls that backbone "obsolete" and has moved to the Catalogue of Life. Replace the index's positional coupling with the products above. Leave the dossier as one JSON per species.
6. **Plan.** Five rounds, each shippable. Round 76 moves the Worker off the whole index at today's 8,945 species, proved by identical answers on the real corpus. The owner's decisions are listed in section 7.

Every figure below says where it comes from. Where a figure is an estimate, its inputs and arithmetic are shown.

## 1. Which species

### 1.1 What was measured

**iNaturalist, cultivated.** The data is `/v1/observations/species_counts?captive=true&iconic_taxa=Plantae&per_page=500`, paged, fetched on 2026-10-17 (`inat-captive-fetch.sh`) at one request every 2.2 s.

- **Paging is not capped.** `scripts/derive-names.ts` says "per_page × page is capped at 10,000". That is true of `/v1/observations`, not of `species_counts`.
  - All 119 pages answered: 59,214 taxa, the last page ending on taxa with one observation.
  - The cross-check: the global list holds 1,359 Cactaceae, 4,196 Orchidaceae and 4,345 Asteraceae taxa, and separate queries with `taxon_id=47903`, `47217` and `47604` answered exactly those totals.
  - So no split by family was needed. A future run should keep the cross-check.
- **`species_counts` rolls observations below species up to their species.** A query restricted to varieties and subspecies (`lrank=form&hrank=subspecies`) returns species-rank taxa, such as Dracaena reflexa with 5,054.
  - Observations identified only to a genus that has an observed species are not counted anywhere. That is iNaturalist's leaf rule, and it only lowers counts.
- **The totals.** 15,991,181 plant observations are marked captive or cultivated (`/v1/observations?captive=true&iconic_taxa=Plantae&per_page=0`). The leaf taxa count 10,066,668 of them.
- **The taxa.** Of the 59,214, 57,539 are species and 1,198 hybrids. The other 477 are genera and higher ranks, which are dropped.

**GBIF, living specimens.** One facet request: `occurrence/search?kingdomKey=6&basisOfRecord=LIVING_SPECIMEN&facet=speciesKey&facetLimit=100000` gives 63,654 species keys with a count each (`gbif-facets.sh`).

- These are botanic-garden and other living-collection records, and also genebank accessions, which is why wheat and rice rank high.
- The same facet with the `occurrence.zip` filters (coordinates, no geospatial issue, present), paged by `facetOffset`, gives 355,133 species keys. Section 3.3 uses those.

**The match to Kew (rule 3).** `select_species.py` matches every name to Kew's `wcvp_names.csv` of 2026-06-04, offline. Kew holds 367,476 accepted species, Artificial Hybrids included.

- **The rule.** A source name is compared with Kew's rows of species rank of the same words. The hybrid sign, spacing and case are set aside, and misapplied rows are left out. Each row leads to its accepted species, and an accepted variety or subspecies leads to its parent species. The name is taken only when every row leads to the same species.
- **iNaturalist's names have a sourced way past "two species".** iNaturalist's taxonomy for vascular plants is a taxon framework sourced to Plants of the World Online (Kew's data) down to subspecies, with 4,117 deviations listed ([iNaturalist, Tracheophyta taxonomy details](https://inaturalist.ala.org.au/taxa/211194-Tracheophyta/taxonomy_details)).
  - So a name of which Kew accepts exactly one species is that species. This is "framework" in the tables.
  - The listed deviations are not yet applied. The production rule must read them and refuse those names, which affects at most 4,117.
- **GBIF's names are matched by name and author**, since the backbone file gives each key's authorship. The strict rule is the fallback.

| | Names | Taken (strict) | Two or more species | No Kew row | Only unplaced or misapplied | Kew species |
|---|---|---|---|---|---|---|
| iNaturalist, cultivated | 58,737 | 54,175 | 3,463 | 1,019 | 80 | 53,263 strict; **56,497 framework** |
| GBIF living specimens | 63,654 keys | 59,387 | 800 | 3,084 | 383 | **57,856** |
| GBIF with coordinates | 355,133 keys | 309,954 | 3,067 | 37,986 | 4,126 | 296,402 |

The strict rule alone refuses the head of the list, which is why the framework rule matters:

- Acer palmatum (54,118 observations), Aloe vera (40,042), Cordyline fruticosa, Ixora coccinea, Crassula ovata and Lavandula angustifolia are each refused.
- Kew holds a later homonym of the same words by another author, filed under another species.
- `results/examples.txt` lists the 60 most observed names the strict rule refuses.

**Today's corpus.** Of the 8,947 dossiers in round 72's copy, 8,923 match a Kew species, through their `name.kew.entry` and then the name. The rest are 14 names that do not match and the two pages merged since.

### 1.2 The thresholds

The species with at least k records. "Today kept" counts how many of today's 8,923 matched species are in the set.

| k | iNaturalist framework | today kept | GBIF living | today kept | Sum of both | today kept |
|---|---|---|---|---|---|---|
| 1 | 56,497 | 5,017 | 57,856 | 4,711 | 81,848 | 5,653 |
| 2 | 40,402 | 4,369 | 40,144 | 4,035 | 60,174 | 4,989 |
| 3 | 33,401 | 4,073 | 31,999 | 3,672 | **49,939** | 4,650 |
| 5 | 26,381 | 3,718 | 23,507 | 3,202 | 39,276 | 4,203 |
| 10 | 18,938 | 3,359 | 14,417 | 2,548 | 27,432 | 3,721 |
| 100 | 6,085 | 2,734 | 1,655 | 525 | 7,405 | 2,773 |
| 1,000 | 1,677 | 1,421 | 233 | 92 | 1,882 | 1,504 |

- **iNaturalist alone** gives about 50,000 at k = 1: 56,497 by the framework rule, 53,263 strict. It cannot give 100,000; its whole list is 56,497.
- **The sum** gives about 50,000 at k = 3: 49,939, of which 4,650 (52%) of today's.
- **Nothing reaches 100,000 on evidence alone.** The ceiling of both sources together is 81,848.

**Whole genera.** The rule adds every accepted species (hybrids aside) of a genus in which at least a share s of the accepted species have one cultivated record or more.

| Share s | Species | Added by the genus rule | With today's corpus |
|---|---|---|---|
| 0.67 | 84,901 | 3,053 | 87,945 |
| **0.5** | **94,798** | **12,950** | **97,184** |
| 0.33 | 119,843 | 37,995 | 121,894 |
| 0.25 | 150,934 | 69,086 | 152,374 |

### 1.3 The recommended rules

Each can be said in a sentence and re-run with four commands (section 8).

In the counts below, today's corpus stands in for "the collector genera". It holds every accepted species of the collector genera, which `derive-names.ts` takes whole, plus about 2,500 of the most observed cultivated species, which meet the evidence rule anyway.

- **About 50,000: "Every species Kew accepts with at least three cultivated records (iNaturalist observations marked captive or cultivated, and GBIF living-specimen records, counted together), and every accepted species of the collector genera."** That gives **54,212** species: 49,939 by evidence, and 4,273 of today's added by their genus.
  - With the project's excluded families (`scripts/excluded-families.txt`: grasses, brassicas, conifers, street trees and the like) left out, it gives 48,650.
- **About 100,000: "Every species Kew accepts with at least one cultivated record, every accepted species of a genus in which at least half the accepted species have one, and every accepted species of the collector genera."** That gives **97,184** species, or 87,417 without the excluded families.
  - Lowering the share to a third gives 121,894, or 109,004 without the excluded families.

**What comes in.** Under the 50,000 rule, 45,289 species are added. By family: Fabaceae 3,447, Asteraceae 3,310, Orchidaceae 3,030, Poaceae 1,565, Myrtaceae 1,395, Lamiaceae 1,192, Rosaceae 1,170, Ericaceae 1,116, Bromeliaceae 672, Araceae 579 and Cactaceae 595.

- **The most recorded:** Hibiscus × rosa-sinensis (63,298 cultivated observations), Picea pungens, Liquidambar styraciflua, Pelargonium × hybridum, Brassica oleracea and Quercus robur.
- **Near the threshold:** Sternbergia candida (1 observation, 9 living records), Phlox adsurgens, Hedychium boloveniorum and Specklinia microphylla.
- **The GBIF genebank effect:** Triticum aestivum has 228,774 living-specimen records. The excluded families take most of these out.
- `results/rule-examples.txt` lists more.

**What falls out without the collector-genus clause.** 4,273 of today's species have fewer than 3 cultivated records. By family: Asparagaceae 743, Apocynaceae 626, Crassulaceae 342, Iridaceae 332, Aizoaceae 317, Cactaceae 238, Vitaceae 218 and Asphodelaceae 181.

- Examples: Agave grisea (0 and 0), Albuca hallii (1 observation), Echeveria helmutiana, Ceropegia robivelonae, Drosera intricata, Romulea petraea and Sclerocactus brevispinus.
- These are the collector's rarities. `derive-names.ts` already argues they belong ("a Namaqualand bulb will never out-observe a pothos").
- So the recommendation keeps the collector genera whole.

**Other measures, weighed:**

- **GBIF living specimens:** taken, as above.
- **Wikidata:** no property records cultivation. Sitelinks or article counts measure fame, not growing, so they were not used.
- **RHS Plant Finder and BGCI PlantSearch:** these are the measures a horticulturist would name, but neither is open for re-use, so neither can source a page.

### 1.4 What the measures cannot say

- **Captive is the observer's flag.** Some is planted street trees and restoration plantings, which are not hobby plants, and some is a slip. Examples are Zostera marina and Castilleja coccinea, with 42 cultivated observations each.
  - k = 3 on the sum removes most single slips. It does not make a street tree a hobby plant; the excluded families do that, and they are the owner's call.
- **Both sources lean to North America and Europe.**
- **The 100,000 rule fills genera.** It adds 12,950 species with no cultivation record of their own because their genus is mostly grown. That is a stated rule, not evidence of each species, and the about page must say so.

## 2. The Worker

### 2.1 What a cold isolate does today

`src/lib/server/dossiers.ts` `loadIndex` reads the manifest and `index.json` from R2 and parses it whole. `adopt` then builds:

- the slug map;
- `indexMaps`: by key, by lower-case name, by genus, and the older-name maps for redirects and the ambiguous-name 404.

The first dossier read builds `heldNamesOf(idx)` (`photo-kind.ts`), every genus and epithet the reference holds. `parseDossier` judges Commons titles against it.

The first search builds the search genera. The home page derives its items from the whole index. Under a manifest, the search reads posting files from R2, but their entries are positions in the whole index, so the whole index must be held.

### 2.2 Measured

`cold.mjs` bundles `cold-entry.ts` with these production functions and runs them in a fresh node 22 process, three times, taking the median.

- **The inputs.** The real index (round 72's copy, 8,947 entries, byte-identical) and synthetic indexes of 50,000 and 100,000 entries from `synth-index.ts`.
  - Each synthetic entry is a real entry with a new epithet: the first half of one real epithet and the second half of another. Older names are remapped the same way, and one word of each common name is swapped.
  - The synthetic files are written as the build writes the index (indented by one).
  - At 8,947, the products built from the file are the real corpus's to the byte in size: index 5,822,704, entries 4,682,236, postings 3,709,166, `short.json` 115,130 and catalogue 1,208,841 bytes. Section 4 has their sizes at scale.
- **What is reported:** wall time with `--single-threaded`, and the heap held after a full GC. The index text is released after the parse, as in the Worker.

| Step | 8,947 ms | heap MB | 50,000 ms | heap MB | 100,000 ms | heap MB |
|---|---|---|---|---|---|---|
| decode the text (`obj.text()`) | 22 | 11.2 | 118 | 62.3 | 239 | 126.1 |
| `JSON.parse`, text then released | 42 | 9.3 | 226 | 50.7 | 469 | 102.6 |
| slug map | 3 | 9.8 | 15 | 52.5 | 31 | 106.1 |
| `indexMaps` | 200 | 21.5 | 951 | 109.3 | 2,459 | 220.7 |
| `heldNamesOf` (first dossier read) | 227 | 41.6 | 1,123 | 214.1 | 2,388 | 432.6 |
| search genera, catalogue items | 14 | 42.8 | 45 | 220.7 | 106 | 445.7 |
| **cold total** | **522** | **42.8** | **2,504** | **220.7** | **5,776** | **445.7** |
| whole-index search preparation (a posting file missing) | 324 | +31 | 1,230 | +173 | 2,997 | +352 |

**Peak memory.** During the parse the text and the parsed index are both alive. At 100,000 that is 126 MB plus 103 MB, so 229 MB before any map is built.

**Today's figure agrees.** DEPLOY.md's "about 0.4 s of CPU in node" matches the 0.52 s here.

### 2.3 Cloudflare's limits

From [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), read 2026-10-17:

- **Memory:** 128 MB an isolate, "including the JavaScript heap and WebAssembly allocations".
- **CPU:** 30 s a request by default on Workers Paid, raisable to 5 minutes. On Free it is 10 ms.
- **Startup:** 1 s for the global scope.
- **Script size:** 64 MiB uncompressed. The corpus is never in the script.
- **Subrequests:** 10,000 a request on Paid.

From [R2 pricing](https://developers.cloudflare.com/r2/pricing/):

- Class A (put, list): $4.50 a million.
- Class B (get, head): $0.36 a million.
- Storage: $0.015 per GB-month.
- Free each month: 10 GB, 1 million Class A and 10 million Class B. Egress is free.

**CPU is not the binding limit; memory is.**

- 5.8 s at 100,000 is inside 30 s, although every cold page would wait that long.
- 446 MB is three and a half times the isolate.
- Even the parse's peak at 50,000 (62 MB of text and 51 MB of index) leaves almost nothing.

**Where today's design stops fitting.** The steady heap is about 4.6 KB a species (42.8 MB / 8,947 = 4.8 KB; 445.7 MB / 100,000 = 4.5 KB). So 128 MB is reached near 28,000 species, or about 25,000 once the runtime's own memory is counted.

- **The caveat:** node 22 runs V8 without pointer compression, which halves each pointer. If Workers' V8 uses it (not checked here), its figure could be up to about a third lower.
- That would move the limit to about 40,000.
- **The honest range is 25,000 to 40,000.** It has not been measured on Cloudflare: section 6, round 76, says how.

### 2.4 The design: nothing whole in the isolate

The build already makes hashed products (`products.ts`). The proposal makes every whole-index structure a product read by key. Each was built from the synthetic indexes and measured (`design-products.ts`, `design-cold.mjs`, `search-sqlite.ts`, `prefix_candidates.py`).

1. **Name shards, `names/<h>.json`.**
   - **What they hold.** Every key a request now resolves from the whole index maps to its holder, or to every holder of an ambiguous older name. The keys are a slug, an accepted name in lower case, and each older name in lower case and as a slug. That is what `indexMaps` and the slug map hold.
   - **How they are split.** By an FNV hash, about 100 species a shard.
   - **At 100,000:** 1,153,924 keys in 1,024 shards, 34.4 MB in all. The largest shard is 37 KB, parses in 0.7 ms and holds 0.2 MB.
   - A species page reads one shard, then the dossier.
   - **Round 77 split them in two** (`docs/review-77/C.md`): `cards/` for a species page (each address to its key, and each species' card; 256 files of about 13 KB at 8,947 species), and `older/` for the rest (accepted and older names, 128 files of about 85 KB), read only for an address that is no page's and for `?was=`.
2. **The photograph judgement at build time.**
   - `heldNamesOf` exists so that a Commons title naming another species of the reference is read as that species.
   - The build already has every name. It writes the judgement into the dossier, so the Worker's `parseDossier` needs no names.
   - The rule is unchanged, only where it runs. That removes the largest single cost: 2.4 s and 212 MB at 100,000.
3. **Search: posting files that carry their candidates.**
   - **Today's keys are too coarse at 100,000.** They are 3-character prefixes, and the exact pass's candidates grow with the corpus: "cactus" has 15,953 candidates, "rose" 8,869 and "echeveria" 7,169 on the synthetic 100,000 (`search-sqlite.ts`). Today's charge threshold is 2,000.
   - **Keys of up to 5 characters** cut most multi-word queries to a handful (`prefix_candidates.py`, exact keys only): "aloe vera" 180 → 6, "monstera deliciosa" 784 → 4, "string of pearls" 44 → 1.
   - **Each key of 3 to 5 characters with at most 2,000 candidates is one file** holding its candidates' search fields: the name, common names, spellings, family, origins, older names and photographs.
     - A query reads one file per word. Usually that is one file: the rarest word's candidates are then checked against the other words.
     - At 100,000: 65,684 such files, 2.11 GB in all. Median 2.3 KB, 99th percentile 665 KB, largest 2.4 MB.
     - Parsing JSON ran at 7 to 33 ms a MB on this shared machine, so the worst file is 17 to 80 ms.
   - **The 1,014 keys that are shorter or heavier** (one or two characters, or over 2,000 candidates) carry the whole index's best 100 answers, as `short.json` does today: about 1 MB in all.
   - **The near pass** (one typing error) reads the near keys' files, at most four a long word.
   - **What is held per isolate** is the genus list the ranking reads, about 100 KB.
   - **What this changes.** A query of two or more words, all of them heavy ("red rose"), no longer has a whole-index answer. Today it is charged as a whole-index search. Under the proposal it needs another letter, or the fallback below. This is an owner decision.
4. **Display blocks, `show/<n>.json`.**
   - **What they hold.** A result tile's fields (key, slug, name, common name, thumbnail, credit, photographs, climate), 256 entries a block.
   - **At 100,000:** 391 blocks, 15 MB, largest 46 KB. A page of ten results reads at most ten blocks, usually fewer.
   - The search file could carry these instead. They are kept apart because the thumbnail changes on every photograph fill, which would rewrite the search files.
5. **The rest as small products:**
   - the home page's featured pool;
   - the sitemap's pages;
   - the genus list;
   - `near` resolved to names at build time, since six keys a page would otherwise need the whole index.
   - `/api/index` streams the stored file without parsing it, or is retired.

**The cold start under the design (node, median of three):**

| | 8,947 | 50,000 | 100,000 |
|---|---|---|---|
| A species page: one name shard | 0.9 ms, 0.2 MB | 0.6 ms, 0.2 MB | 0.7 ms, 0.2 MB |
| A search: the worst key file | | | 2.4 MB: 17 to 80 ms |
| Held per isolate | genus list, products cache (bounded at 24 MB of text today) | the same | the same |

**Considered and not chosen:**

- **Keep a compact search core in memory.** That means the ranking fields only, with families and origins as numbers. It measured 1.9 MB on disk and 5.5 MB of heap at 8,947, 10.3 MB and 29.8 MB at 50,000, and 21 MB and 60.3 MB (0.5 s to parse) at 100,000.
  - It would carry 50,000, but at 100,000 it is half the isolate, and it grows without bound.
  - It is a fallback if the posting files prove awkward.
- **D1 (SQLite at Cloudflare).** The same postings as a table, measured with node's SQLite on the synthetic 100,000.
  - **Size:** 9,359,027 posting rows, 142 MB.
  - **Rows read, which is what D1 bills:** 350 for "hoya" up to 31,906 for "cactus" on 3-character keys. Fewer with 5-character keys.
  - **Cost:** D1 includes 25 billion rows read a month on Paid ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)), so the cost is nil. The database limit is 10 GB ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).
  - **Against it:** it adds a service, a write of nine million rows a full rebuild, and a network hop to one region for every search.
  - It is the right next step only if all-heavy multi-word queries must keep a full answer.

## 3. The corpus build

### 3.1 Every per-species request today

**The sources of the figures:**

- the build code (`src/lib/dossier/build.ts` and `sources/`);
- the last corpus log (`corpus-step.log`, 2026-10-16), whose two online rebuilds made 219 requests for 16 species and 71 for 5 (13.8 a species), at 2.3 to 9.3 s a species, mean 4.18 s (21 species);
- a build of 12 species picked at random from the index, run here on 2026-10-17 with Kew's files and no `occurrence.zip`, with every request counted by `count-fetch.mjs`: 163 requests, 13.6 a species (`results/build-sample-requests.json`).

The table's rates are the sample's; the counts at 8,945 are rate × 8,945. Time is count × the build's own gap for the host (`fetch.ts` `MIN_GAP_MS`), which bounds a serial build, with the measured wire time beside it.

| Request | Host | Per species | At 8,945 | Wire ms (mean) | Pacing | Bound at 8,945 |
|---|---|---|---|---|---|---|
| name match `/species/match` | GBIF | 1 | 8,945 | 472 | 0.25 s | 37 min |
| backbone record `/species/{key}` | GBIF | 1 | 8,945 | 132 | 0.25 s | 37 min |
| synonyms | GBIF | 1 | 8,945 | 204 | 0.25 s | 37 min |
| vernacular names | GBIF | 1 | 8,945 | 131 | 0.25 s | 37 min |
| Kew's entry via GBIF's copy of WCVP (`/species?datasetKey=…&name=`) | GBIF | 1 | 8,945 | 172 | 0.25 s | 37 min |
| occurrence search (records) | GBIF | 1.9 without the download; with it only 233 heavy species and 332 other keys | about 1,700 | 745 | 0.25 s | 7 min |
| occurrence search (photographs) | GBIF | 0.33 without the download | 0 with it | 828 | | |
| photographs, wild and cultivated | iNaturalist | 1.83 | 16,400 | 338 | 1.1 s | 5.0 h |
| taxon by id, taxon search | iNaturalist | 1.0 | 8,945 | 360 | 1.1 s | 2.7 h |
| item search, then item read | Wikidata | 2 | 17,890 | 155 and 81 | 0.25 s | 75 min |
| page summary | Wikipedia | 1 | 8,945 | 389 | 0.25 s | 37 min |
| file information (only under six photographs) | Commons | 0.33 | 2,950 | 248 | 0.25 s | 12 min |
| literature search | OpenAlex | 1 | 8,945 | 363 | 1.1 s | 2.7 h |
| IPNI record | IPNI | only in the Wikidata proof; none in the sample | tens | | 1.1 s | |
| POWO | | none: links are built from Kew's numbers | 0 | | | |
| daily series per 0.5° × 0.625° cell, cached for ever | NASA POWER | 2,595 cells for the 5,567 species with extremes (counted in the dossiers) | 2,595 once | | 2.1 s | 1.5 h once |

Each species' requests run in order. The log's 4.18 s a species is close to the sum of the pacing (about 2.8 iNaturalist requests at 1.1 s is 3.1 s alone). So a full online build of today's corpus takes about 8,945 × 4.18 s = 10.4 hours, before the daily allowances below.

### 3.2 At 50,000 and 100,000

| | 8,945 | 54,212 (50k rule) | 97,184 (100k rule) |
|---|---|---|---|
| Requests, at 13.6 a species | 122,000 | 737,000 | 1,322,000 |
| Serial time, at 4.18 s a species | 10.4 h | 63 h | 113 h |
| iNaturalist requests (2.83 a species) | 25,300 | 153,400 | 275,000 |
| **…at iNaturalist's 10,000 a day** | **2.5 days** | **15 days** | **28 days** |
| OpenAlex searches | 8,945 | 54,212 | 97,184 |
| **…at $1 per 1,000, $1 a day free with a key** | $9, or 9 days | $54, or 54 days | $97, or 97 days |
| GBIF API requests (5 a species, names and Kew's entry) | 44,700 | 271,000 | 486,000 |
| NASA POWER new cells (at most 0.47 a species, today's ratio) | 2,595 | at most 25,500 | at most 45,700 |

**The allowances:**

- iNaturalist asks for "about 1 per second, and around 10k API requests a day", and media downloads under 24 GB a day ([API recommended practices](https://www.inaturalist.org/pages/api+recommended+practices)).
- OpenAlex charges $1 per 1,000 searches, with a free key giving $1 a day ([OpenAlex authentication](https://developers.openalex.org/api-reference/authentication)). The build's header says the same: "free keys: 1,000 species a day".

**POWER's cells** are an upper bound: species of one region share cells, and the land surface holds about 60,000 cells at this size (207,360 cells × about 29% land).

### 3.3 The bulk or offline replacement for each

| Today | Replacement | Exists? Cost to fetch |
|---|---|---|
| GBIF name match, backbone record, synonyms | Kew's `wcvp_names.csv` for names and synonyms (already offline). GBIF's backbone export `simple.txt.gz` for the GBIF key where one is still wanted. | Yes. The backbone is 488,591,022 bytes, last modified 2023-08-28 (fetched here in one request, [hosted-datasets.gbif.org](https://hosted-datasets.gbif.org/datasets/backbone/current/)). GBIF calls it "the obsolete GBIF Backbone Taxonomy" ([download API](https://techdocs.gbif.org/en/data-use/api-downloads)), last updated in 2023 and "will not be updated again" ([GBIF data blog, 2026-06-23](https://data-blog.gbif.org/post/catalogue-of-life-taxonomic-backbone/)). |
| GBIF vernacular names | The backbone's Darwin Core archive `backbone.zip`, with its vernacular extension. | Yes, 971,465,842 bytes (HEAD, same folder). |
| Kew's entry through GBIF's copy of WCVP | `wcvp_names.csv` directly (`plant_name_id`, `ipni_id`, `powo_id`). | Already on the PC. |
| GBIF occurrences and photographs | `occurrence.zip`, as now (section 3.4). An SQL download for the records. | See 3.4. |
| iNaturalist photographs | iNaturalist's open data on AWS: `photos.csv.gz` 20,668,099,997 bytes, `observations.csv.gz` 13,420,521,411, `taxa.csv.gz` 39,999,332 and `observers.csv.gz` 17,423,152 (HEAD, 2026-09-27; monthly; [the dataset's README](https://github.com/inaturalist/inaturalist-open-data/tree/main/Metadata)). Every photo there has an open licence or none, with the licence per photo. | Yes, about 34 GB a refresh. **But** it has no captive flag: "Observations flagged as not wild are also considered Casual", beside casual ones missing a date or place. So wild photographs (Research or Needs ID grade) can come from it, and cultivated ones cannot be told apart without guessing. Cultivated photographs stay an API fill, one request a species, run daily within the allowance: 10 days at 100,000. |
| Wikidata search and read | Batched SPARQL by GBIF or POWO identifier, 500 values a query, or `wbgetentities` 50 a call (as `--fill wikidata` does). The full JSON dump is 103,409,622,204 bytes bz2 ([dumps](https://dumps.wikimedia.org/wikidatawiki/entities/)), too large to use. | Yes. SPARQL allows 60 s a query and 60 s of processing a minute for each client ([Query Service manual](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)). 100,000 / 500 = 200 queries. |
| Wikipedia summary | The API's `prop=extracts&exintro`, 20 titles a request. | Yes. 100,000 / 20 = 5,000 requests, 21 minutes at 0.25 s. |
| Commons file information | Batched `imageinfo`, 50 titles a request. The structured-data dump (`latest-mediainfo.json.bz2`, 61,334,464,200 bytes, [dumps](https://dumps.wikimedia.org/commonswiki/entities/)) is too large for one fill. | Batching: yes. |
| OpenAlex literature | A prepaid balance (about $100 at 100,000), the free snapshot ("totally free for bulk download"), or no literature: it is not load-bearing. | Owner's choice. |
| IPNI, POWO | Kew's file has both identifiers. | Already offline. |
| NASA POWER | Cached for ever per cell. The same data as Zarr on AWS ([Registry of Open Data](https://registry.opendata.aws/nasa-power/), bucket `nasa-power`). | Yes. Only new cells are asked, so the API is enough. |

### 3.4 `occurrence.zip`

**How it is requested** (`scripts/bulk-fetch.ts`):

- **The keys.** GBIF species keys for every name are counted with a facet. Species over 100,000 records go to the API path.
- **The download.** The rest go in one DWCA download, filtered to coordinates, no geospatial issue and present.
- **How the build reads it.** It streams the archive with `tar` and keeps at most 2,000 records a species, a uniform sample by a hash of the record id (`OccIndex`, `bulk.ts`).

**Its size is not in DEPLOY.md.** It is in GBIF's record of the download (`0006100-260916113435855`, from `bulk/download.json`):

- 12,749,146,096 bytes;
- 27,941,930 records;
- 8,561 datasets;
- prepared in 67 minutes;
- licence CC BY-NC as a whole. The build keeps open records only, by each record's licence.

That is 456 bytes a record, compressed, with the photographs' `multimedia.txt` (22,408,094 rows) included. The log shows the build reading it in about 11 minutes on the owner's PC.

**The estimate at scale.** The coordinate facet, matched to Kew, gives each selected species' record count.

- **The check:** for today's species it gives 28,004,239 records in species under the 100,000 cap and 239 species over it. The real download held 27,941,930 records, with 233 species over. So the estimate is within 0.3%.
- **The arithmetic:** records under the cap × 456 bytes.

| | Species | Genera | Records in the download | Over the cap (API path) | `occurrence.zip` | Records the build keeps (≤ 2,000 each) |
|---|---|---|---|---|---|---|
| Today | 8,923 | 1,308 | 28.0 M (27.9 M real) | 239 | 12.7 GB (real) | 5.1 M |
| 50k rule | 54,212 | 6,906 | 152.3 M | 882 | **69 GB** | 40.4 M |
| 100k rule | 97,184 | 8,779 | 165.0 M | 883 | **75 GB** | 50.0 M |
| Upper bracket: the 100,000 most recorded | 100,000 | 10,174 | 179.1 M | 883 | 82 GB | 62.5 M |

**The growth is mostly the new common species.** Every species with tens of thousands of records under the cap is in the download whole, while the build keeps 2,000.

**An SQL download** ([GBIF SQL downloads](https://techdocs.gbif.org/en/data-use/api-sql-downloads)):

- **The terms.** It is "an experimental feature", needs GBIF's helpdesk to enable it, and runs `SELECT` with `GROUP BY` on the one `occurrence` table. There are no sub-queries, `HAVING` or `QUALIFY`, so it cannot take a per-species sample. Its format is `SQL_TSV_ZIP`.
- **What it would return.** Only the 13 columns the build reads: id, species key, latitude, longitude, year, country, basis, licence, dataset, establishment, degree of establishment, uncertainty and precision.
- **Its size, estimated.** A sample of 600 real records (two species, `occurrence/search`) is 165 bytes a row as TSV and 20 bytes gzipped. 165 M rows × 20 to 40 bytes is **3.3 to 6.6 GB** at 100,000. That is about a tenth to a twentieth of the DWCA. The 20 bytes is a small sample's ratio, hence the range.
  - Grouping by the 3-decimal coordinate, as the build does, removed 16% in the same sample.
- **What it lacks: photographs.** The `occurrence` table does not carry them. They would come from iNaturalist's open data (most of GBIF's photographs are iNaturalist observations) or from a small DWCA restricted to records with images.

**Today's other costs at 100,000:**

- **Disk:** 75 GB.
- **Transfer:** 75 GB at 100 Mbit/s is 1.7 hours; at 20 Mbit/s, 8.3 hours.
- **Reading:** at the log's 12 GB in about 11 minutes, 75 GB takes about 70 minutes.

### 3.5 A full build, before and after

| | Today's design at 97,184 | Bulk design at 97,184 |
|---|---|---|
| Names, synonyms, Kew's links | 486,000 GBIF requests (34 h at 0.25 s) | offline, minutes |
| Occurrences | 75 GB download, about 70 min to read | the same, or a 3 to 7 GB SQL download |
| Wild photographs | 275,000 iNaturalist requests: 28 days | 34 GB open data, one pass (about 30 min at the zip's rate) |
| Cultivated photographs | in the above | 97,000 requests as a daily fill: 10 days, not blocking |
| Wikidata | 194,000 requests (13.5 h) | 200 SPARQL queries |
| Wikipedia | 97,000 (6.7 h) | 4,900 batched requests (20 min) |
| Commons | 32,000 (2.2 h) | 650 batched requests |
| Literature | 97 days free, or $97 | the same, or the snapshot, or none |
| Climate extremes | up to 45,700 new cells once (27 h) | the same, cached for ever |
| Derivation per species | 4.18 s a species online (113 h) | about 0.4 s offline (11 h; DEPLOY's "an hour rather than a day" for today's corpus) |
| **Wall time** | **about 4 weeks**, bounded by iNaturalist | **about 2 days** on the PC, with the cultivated-photograph fill running on for 10 days |

## 4. Storage and serving

These are measured where a synthetic index can show them (`products-size.ts`, `design-products.ts`), and scaled from today's mean otherwise.

| | Today (8,947) | 50,000 | 100,000 | Source |
|---|---|---|---|---|
| Dossiers | 8,947, 289.3 MB, median 19 KB, largest 169 KB | 1.6 GB | 3.2 GB | today's mean 32.3 KB × n |
| `index.json` | 5.8 MB (1.1 MB gz) | 32.6 MB | 66.1 MB | measured |
| Entries buckets | 32, 4.7 MB | 256, 26.3 MB | 512, 53.4 MB | measured |
| Sheet buckets | 32, 11.75 MB | 256, 66 MB | 512, 131 MB | today's 1.31 KB × n |
| Postings (today's) | 64, 3.7 MB | 512, 26.5 MB | 1,024, 55.3 MB | measured |
| Catalogue | 9, 1.2 MB | genus file about 1.6 MB | genus file about 2.1 MB | 238 bytes a genus row × 6,906 or 8,779 genera |
| Name shards (proposed) | 128, 2.9 MB | 512, 16.9 MB | 1,024, 34.4 MB | measured |
| Search key files (proposed) | | about 50,000, 1.47 GB; measured at 48,368 in round seventy-nine: 63,791, 2.19 GB | 65,684, 2.11 GB | measured |
| Display blocks (proposed) | 35, 1.3 MB | 196, 7.5 MB | 391, 15 MB | measured |
| **Total in R2 (proposed)** | about 0.3 GB | **about 3.2 GB**; measured at 48,368 in round seventy-nine: 4.45 GB in 117,232 objects | **about 5.6 GB** | sum |

**Round seventy-nine's measure** (agent Z, `scripts/dev/scale/results/r79-index.txt`), on a corpus made to the list's size (48,368 dossiers from real ones of the same genus): the search key files were the estimate's one large miss, 63,791 files and 2,191 MB where this table said about 50,000 and 1.47 GB; the 100,000 column's figure is the synthetic index's, as the 50,000 one was. The dossiers were 1.9 GB (a mean of 40 KB, high, since the copies took well-recorded pages as templates), and the first upload is 4.45 GB in 117,232 objects. R2's free 10 GB still holds two corpora around a refresh once `s/v2/` is purged.

The catalogue estimate takes today's genus rows (238 bytes) times the genera of the selected species (section 3.4's table); the synthetic index keeps today's genera, so it cannot show this.

**R2 costs:**

- **Storage:** 5.6 GB is under the free 10 GB, so nothing. Beyond it, $0.015 a GB-month.
- **A full upload at 100,000:** about 100,000 dossiers, 65,700 key files and 2,500 other products, about 169,000 Class A operations. That is $0.76 at list price, inside the free million a month.
- **Reads:** a species page is a name shard (often already held) and a dossier, two Class B at most. A search is one to four key files and up to ten display blocks.
  - A million page views and a million searches a month is 4 to 16 million Class B before any cache: 2 million for the pages, and 2 to 14 million for the searches.
  - That costs nothing up to the free 10 million, and at most $2.16 a month beyond it (6 million × $0.36 a million).
  - The isolate's product cache and the page cache cut it further.

**Content-hash naming keeps refreshes small.** A file's name is its hash, so a refresh uploads only what changed.

- **Search files.** One species' search fields sit in about 27 key files (2,683,820 file entries for 100,000 species). A refresh that changes only photographs rewrites them only if the photograph count is in the doc.
- **The fix.** Rank on a coarse photograph band (none, few, many) so photograph fills leave the search files alone.

**Upload time with rclone: an estimate, never measured on the owner's link.**

- **For 169,000 objects:** with `--transfers 32` and about 150 ms a put, that is about 210 a second, or 13 minutes.
- **For 5.6 GB:** 15 minutes at 50 Mbit/s, 37 minutes at 20 Mbit/s.
- **A typical refresh** carries only changed files, as today. The last log's whole upload step, with 10,413 files checked, took 2 minutes 16 seconds.

**The client.**

- **The first visit does not grow with the corpus.** The front page is 14,352 bytes and the first visit 365 kB (round 74). Rows and species come in windows: 60 rows and 240 species a row (`HOME_WINDOW`, `HOME_ITEMS`).
- **The catalogue.** It has 8,779 genus rows at 100,000 against 1,321 now. The Worker reads the 2.1 MB file per isolate, and the phone receives 60 rows at a time.
- **A grower's own species** come by bucket. A bucket stays about 195 to 320 species at any size (`bucketsFor`), so the files a device asks for stay the same size: about 104 KB of entries and 255 KB of sheets a bucket at 100,000, against 146 KB and 367 KB today.

**The service worker's corpus cache.** It drops every answer under an old corpus id when the first under a new one is kept (`service-worker.ts`).

- A grower with 50 species spread over 50 buckets fetches about 18 MB raw (about 4.5 MB compressed) again after each corpus refresh, against at most 16 MB today. That is no worse.
- **But a daily refresh at 100,000 changes nearly every bucket.** If 2% of species change, a bucket of 195 is unchanged with probability 0.98^195 = 2%. Keying the cache by each file's hash would save little.
- **The saving is in refreshing less often:** weekly rather than daily once the corpus is large.

## 5. Formats

Nothing need be kept, so change only what pays:

1. **Page ids: Kew's `plant_name_id`, not GBIF's backbone key.**
   - The selection is made in Kew's ids already. The pages cite Kew's names.
   - GBIF's backbone is frozen at 2023 and its occurrence search needs a `checklistKey` for the Catalogue of Life's new alphanumeric ids. The GBIF key becomes one identifier among several in `ids`.
   - **Slugs stay names.** Two species with one slug (homonyms by different authors) already exist as a rule-3 case. The name shard handles them as it handles ambiguous older names today.
   - **Merges, as in round 73, follow Kew's accepted id.**
2. **The index stops being a format the Worker reads.**
   - It stays the build's record and the scripts' input.
   - The Worker reads name shards, search key files, display blocks, buckets and catalogue files, all keyed by name or hash, none by position.
   - Postings by position are what tie the Worker to the whole index today.
3. **The dossier stays one JSON per species.**
   - At a mean of 32 KB it is one R2 read and a small parse.
   - Splitting it (photographs apart, say) would add a read to every page to save upload bytes the hash naming already saves.
   - **Two changes inside it pay:**
     - the photograph judgement stored at build time (section 2.4);
     - `near` stored with names and slugs, not keys alone.
4. **Search fields** use numbers for families and origins in the key files: 333 bytes a doc today. The origin names are about 31% of the search text.
5. **Buckets, sheets and the manifest stay as they are.** They already scale by rule (`bucketsFor`, `postingFilesFor`).

## 6. The plan

Each round ships on its own, keeps the six rules, and is proved by a test that fails on the round before.

**Round 76: the Worker without the whole index, at today's corpus.** Start here.

- **The build writes four new products:**
  - `names/<h>.json` (the shard function and keys exactly as `design-products.ts`);
  - `featured.json`;
  - `sitemap/<n>.json`;
  - the genus list.
- **The build stores the photograph judgement** in each dossier: the kinds `parseDossier` derives with `heldNamesOf`, written at `--index`.
- **The Worker's lookups move to the shards:**
  - `resolveSlug`, the older-name redirect, `ambiguousSynonym` and `sharedOlderName`;
  - `parseDossier` stops taking names;
  - the home page reads `featured.json` and the catalogue files.
- **The search stays on today's postings** for this round, so the index is still held for it alone.
- **Proof:**
  - A test that every slug, every lower-case name and every older name of the real index resolves to the same answer through the shards as through `indexMaps`. Run it on the real index in this workspace.
  - A test that every dossier parses to the same shown photographs with the stored judgement as with `heldNamesOf`.
- **Then measure on Cloudflare** with `wrangler tail` (DEPLOY.md, "A cold start's CPU"), and add a first measure of memory: deploy a build with a 50,000 synthetic corpus to a preview bucket and read the outcome ("exceededMemory" or "ok").

**Round 77: the search from key files.**

- **Done in round 77** (`docs/REVIEW-ROUND-77.md`, `docs/review-77/K.md`), with two changes to the plan: a key is a word's beginning one character a level, with a file at 2,000 species or fewer and children past 200; and a key file holds only the fields the ranking reads, the entries and photograph counts being in blocks by position, so a photograph fill rewrites no key file. The proof: 69,021 queries, 68,921 the same and 100 `narrow`.

- **The build:** 5-character keys, the key files with inline search fields, and the heavy keys' best answers.
- **The Worker** drops the index.
- **Proof:** for a fixed list of queries, the same ranked answers as today's whole-index search on the real corpus. Every heavy multi-word query is listed with what it now says.

**Round 78: the selection and the ids.**

- **Selection:** `derive-names.ts` is rewritten on this study's scripts, with the owner's chosen rule, iNaturalist's listed deviations applied, and a report of every refusal.
- **Ids:** pages keyed by Kew's `plant_name_id`.
- **Build sources:** names, synonyms and Kew's links offline; vernacular names from `backbone.zip`; Wikidata by batched SPARQL; Wikipedia by batched extracts.

**Round 79: 50,000 on the owner's PC.**

- **The occurrences:** the GBIF download, as a DWCA of about 69 GB or as SQL if GBIF grants it.
- **Photographs:** iNaturalist's wild photographs from the open data; the cultivated-photograph fill daily.
- **Literature:** OpenAlex by the owner's choice.
- **Proof:** the drops and the about pages.

**Round 80: 100,000**, the same steps with the larger rule.

**The risks:**

- **Memory is measured in node, not in workerd.** The plan measures it on Cloudflare in round 76 before anything depends on it.
- **GBIF's SQL downloads** are experimental and need permission. The DWCA path works without them, at 75 GB.
- **iNaturalist's open data has no captive flag.** Cultivated photographs stay an API fill (rule 3: a casual observation is not taken as cultivated).
- **Licences (rule 4).**
  - The GBIF download as a whole is CC BY-NC, and iNaturalist's open data includes CC BY-NC photographs. Both must stay filtered per record or per photograph, as the build does now.
  - Wikipedia extracts are CC BY-SA and need their attribution.
- **Living-specimen records include genebanks,** so crops count as cultivated. The excluded families and the k threshold handle most of it. The rest is visible in the report.
- **The 100,000 rule's genus fill** puts in species with no cultivation record of their own. `/about/how` must say so (rule 5), and each page must not imply a record it lacks (rule 2).
- **More pages mean more pages with nothing.** At 100,000, up to 7,170 selected species have no GBIF record with coordinates (`occ_rule100`, `species_with_none`; an upper bound, since a GBIF key that did not match Kew counts as none). They would have no climate. Their pages say "none" only where the sources answered.

**The owner's decisions:**

1. **The rule, and its size.**
   - The recommendation is the 50,000 rule now and the 100,000 rule later.
   - The collector genera stay whole.
   - The excluded families should be reviewed for "every home grower": conifers, brassicas and Fagaceae are patio and garden plants.
2. **Accept the framework rule for iNaturalist names.** It is sourced to iNaturalist's POWO framework. The strict rule loses Acer palmatum, Aloe vera and Crassula ovata.
3. **Page ids by Kew's `plant_name_id`.** Recommended.
4. **Ask GBIF's helpdesk for SQL downloads**, or accept 69 to 75 GB downloads.
5. **Literature:** pay about $54 to $97 once, use the snapshot, or drop it. Recommended: drop it from the first build and fill later.
6. **Search:** accept "type another letter" for multi-word queries whose every word is common. Recommended over adding D1.
7. **Refresh cadence:** weekly rather than daily once past 50,000.

## 7. The six rules, step by step

| Rule | Where the plan touches it |
|---|---|
| 1. Every figure sourced | Unchanged. The selection adds a sourced reason for each species' presence (its counts, or its genus's share), which `/about/how` states. |
| 2. "Not checked" is never "none" | The cultivated-photograph fill keeps "not checked" until asked. A source dropped (literature) is "not checked", not "none". |
| 3. No guessing | Name matching uses the strict rule, plus two sourced extensions (iNaturalist's framework, GBIF's authorship), with every refusal counted. A casual iNaturalist observation is never read as cultivated. |
| 4. Licences | Per-record and per-photograph licence filters stay. The CC BY-NC aggregates (GBIF download, iNaturalist open data) are filtered, not adopted. |
| 5. The about pages | `/about/how`'s account of the species list, the Worker's reads and the photograph judgement change in rounds 76 to 78. Each round's sentences are checked against its code. |
| 6. The log is the record | The new products (shards, key files, blocks) are derived and droppable, like today's. |

## 8. Running the measurements

From the project folder. The scratch directory is anything outside the corpus. Kew's files and the corpus are read, never written.

```
scripts/dev/scale/inat-captive-fetch.sh <scratch>/inat               # 119 requests at 2.2 s; slow answers made it about 40 minutes
scripts/dev/scale/gbif-facets.sh <scratch>/gbif                      # 5 requests
curl -o <scratch>/backbone/simple.txt.gz https://hosted-datasets.gbif.org/datasets/backbone/current/simple.txt.gz
python3 -I scripts/dev/scale/select_species.py --inat <scratch>/inat --gbif <scratch>/gbif \
  --wcvp bulk/wcvp_names.csv --backbone <scratch>/backbone/simple.txt.gz --dossiers static/s/v2 --out <scratch>/select
npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/synth-index.ts static/s/v2/index.json 100000 <scratch>/index-100000.json
SCALE_TMP=<scratch> node scripts/dev/scale/cold.mjs <scratch>/index-*.json
npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/products-size.ts <scratch>/index-*.json
npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/design-products.ts <scratch>/index-100000.json <scratch>/design-100000
node scripts/dev/scale/design-cold.mjs <scratch>/design-100000
node --experimental-sqlite --import tsx scripts/dev/scale/search-sqlite.ts <scratch>/index-100000.json <scratch>/search.db
python3 -I scripts/dev/scale/prefix_candidates.py <scratch>/index-100000.json
# the per-species request count: a small online build, every request counted and paced at one a second (iNaturalist 2.1 s)
COUNT_OUT=<scratch>/counts.json node --import ./scripts/dev/scale/count-fetch.mjs --import tsx scripts/build-dossiers.ts names.txt --bulk <dir with Kew's files>
```

**What the outputs are and where they came from:**

- The outputs of 2026-10-17 are in `scripts/dev/scale/results/`.
- The machine is two shared cores: its times are relative, and Cloudflare's CPU is not this one.
- The 12-species build's OpenAlex calls were refused after the first (no key here), so its OpenAlex rate is the code's (one a species), not the sample's.
