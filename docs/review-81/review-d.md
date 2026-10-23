# Review before round 81: reviewer D (the data)

**Verdict: works with faults.** The live reference (Worker `00830b85`, corpus `a27e34d376199544`, 48,361 pages) holds most of its data rules. I checked a stratified sample of 705 live pages against Kew's file, GBIF, iNaturalist and Wikidata, and the whole index besides. Names, ranges, records, licences and credits match their sources. Every "not checked" says why. No photograph is NC or ND. No two pages share a thumbnail. Search finds a page by its own name 80 times out of 80.

Three of round 80's fixes that work at serve time hold on the live pages:

- the cold floor set aside past 1,000 m;
- the tomato's floor;
- scientific names hidden as common names.

I also ran the code's own rules for what is not yet live, on copies of the live dossiers: the keyless pages' reasons, the Wikidata names, and the fill's cultivated and most-voted photographs. They give sourced, open-licensed, right-species answers, with one small display fault.

I found three major faults and three minor ones:

- **/about/how already describes round 80's repair as done.** It says records at dataset default points are left out, records are tested against region shapes, and Kew's older names are searchable. On about 29% of the sampled range-tested pages this is not yet true, and none of the Kew-name searches work.
- **The care-group line under the name is assigned genus-wide**, and is plainly wrong for hundreds of species. Groundsel shows as "a cactus or succulent".
- **All 485 hybrid species drop the hybrid sign** (×). Peppermint shows as "Mentha piperita".

## What I covered

- **Pages:**
  - 705 live dossiers (`/api/dossier/<id>`), drawn with seed 81 from the live index and Kew's lifeforms. Owner's groups: 82 cacti, 70 other succulents, 75 bulbs and other geophytes, 50 orchids, 18 carnivorous plants and 37 named collector plants. Other growers: 28 trees, 15 shrubs, 30 crops and herbs, 20 aquatics, 25 ferns, 25 foliage plants, 20 annuals, climbers and grasses, and 10 gymnosperms. By structure: 20 of the 21 `g` pages, 15 keyless pages with keys, 30 keyless "not checked" pages, 25 hybrids, 15 with 1 to 3 records, 10 with none, 10 of the most recorded, 10 without a photograph, 15 without a climate, 8 kept pages of the owner's merges, 9 of round 80's repair pages, plus continent top-ups and 40 at random.
  - The sample's native ranges cover every TDWG continent: Africa 188, South America 186, North America 160, temperate Asia 150, tropical Asia 105, Europe 71, Australasia 44, Pacific 16, Antarctic 2.
  - 272 species pages read as HTML, and the front page and both about pages.
- **Counted checks:**
  - 689 names, authors and ranges against Kew's WCVP (`/home/claude/r73data/bulk/`, extract of 2026-06-04, the build's own).
  - 122,456 map points.
  - 424 climates, 411 of them with extremes shown.
  - 19,275 photographs.
  - 552 iNaturalist ids checked with iNaturalist.
  - 205 searches.
  - The whole 48,361-entry index for duplicates, links between pages, credits, common names and counts.
- **Code runs on live copies** (scratch only, nothing written to the site):
  - the code's `fillKewWhy` and `fillWikidataNames` on the 79 sampled keyless dossiers;
  - `inatBatched` with `inat.photos` for 50 cultivated and 12 most-voted wild sets;
  - `archFor` over all 48,361 pages;
  - `outsideShapes` with the default-point list over the sample;
  - `openingGenera` over the live index.
- **Requests:**
  - cultifolio.com: 1,188 (706 dossiers, 272 pages, 205 searches, the index, the corpus, the front page and two about pages). Median gap 1.8 s, never under 0.75 s. No 429.
  - Third parties: 102. That is 51 to api.gbif.org, 33 to api.inaturalist.org (2.1 s apart), 14 to iNaturalist's open-data photo bucket, 1 to query.wikidata.org and 3 to upload.wikimedia.org (all answered 429).
  - All were sent as `cultifolio-review/81 (https://cultifolio.com)`.
- **Scratch:** `/tmp/claude-0/rev81r/D-s/`. The main outputs are `faults.json`, `html-parsed.json`, `search-results.json`, `inat-check.json`, `kewwhy-check.json`, `inat-rule.json`, `arch.json` and `fill/out/`; the photographs are in `img/`.

## Issues

### D1. Major: /about/how describes round 80's not-yet-run repair as the live state

- **What I did:**
  - Read `/about/how` live.
  - Ran the code's own tests over the 640 range-tested pages of the sample: `outsideShapes` with `scripts/tdwg3-shapes.json`, and the 18 points of `scripts/default-points.txt`.
  - Searched six of Kew's older names.
- **What I saw:**
  - **Default points.** The records paragraph (`src/routes/about/how/+page.svelte:51`) says: "A record at a dataset's default point is left out too, and counted … such as one in the middle of Mexico, on the maps of 180 species".
    - 58 of 640 pages (9%) still draw a record at a listed default point.
    - Among them are Mammillaria plumosa, Astrophytum asterias, Ariocarpus fissuratus, Lophophora williamsii and Opuntia lasiacantha, all at 23.874,−101.554. Pachypodium lamerei has one at −19.042,46.685, and Boophone disticha and Lachenalia aloides at −28.554,24.753 (`faults.json`, "map point at a listed default point", 60 lines).
  - **Shapes.** The same paragraph says a record "is inside a native region when it lies in the region's shape … for 243 of the 369 regions … and each page's record of its sources says which".
    - 153 of 640 pages (24%) show 1,072 records that the code's own shapes put outside every native region. Examples: Copiapoa cinerea 12 of 50, Cyclamen hederifolium 53 of 833, Dionaea muscipula 6 of 267.
    - No live page's sources say which test was used.
    - `/api/dossier/k525228` (Dracaena trifasciata) still has its marker at −1.253,36.81, which is Nairobi (`"the map marker … of the 44 in-range records"`). Its native range is Tanzania and West and Central Africa.
    - In all, 187 of 640 tested pages (29%) are not what this paragraph describes.
  - **Kew's older names.** The search paragraph (`:42`) says: "So are Kew's older names for the plant, once Kew's file has been read for the page … ("Echinocactus chrysacanthus" … is Ferocactus chrysacanthus …)". Every live page has had Kew's file read (`name.kew.file` 2026-06-04). Yet these searches answer nothing:
    - "Echinocactus chrysacanthus", "Aloe amoena", "Copiapoa columna-alba", "Haworthia arabesqua" and "Acrostichum bifurcatum" answer `{"hits":[]}`;
    - "Lavandula officinalis" answers only Salvia lavandulacea.
    - That is 0 of 6 (`srch/`).
- **Why:** DEPLOY's round eighty walk sends the shape and default-point re-derivation and the index with the Kew-name files up only at stop (d), about 28 October. The about page went live on 22 October with sentences in the present tense. The iNaturalist sentences carry a caveat ("one asked before the daily fill reaches its page may still say …"). These three do not.
- **What should happen:** these sentences should say "from the repair that reaches the site with the fill's upload" until then, as the iNaturalist sentence does, or be held back until (d). Rule 5 is broken on about three pages in ten until the repair is uploaded.

### D2. Major: the care-group line shown under the name is plainly wrong for hundreds of species

- **What I did:**
  - Ran the code's `archFor` (`src/lib/core/arch.ts:62-72`, table `src/lib/core/arch-tables.json`) over all 48,361 pages.
  - Compared each page's group with Kew's own lifeform for the species (`lifeform_description` in WCVP).
  - Read three live pages.
- **What I saw:**
  - 17,598 pages carry a group. The table assigns most of them by genus, so every species of a mixed genus takes the genus's group.
  - **"Cactus or succulent":** 907 pages whose Kew lifeform states no succulence, 105 of them annuals. Euphorbia accounts for 138 (E. peplus, an annual weed) and Senecio for 31. Commiphora 149, Cyphostemma 85 and Yucca 50 are arguable as caudiciforms; the annuals are not.
  - **"Bulb, tuber or caudex":** 215 pages, cycads aside, that Kew calls trees, shrubs, annuals or climbers. Phyllanthus 48 (including the Indian gooseberry tree, P. emblica), Momordica 26 (bitter melon, an annual vine) and Sisyrinchium 24.
  - **"Tropical foliage plant":** Ficus carica, a temperate tree.
  - **"Temperate garden plant":** 501 pages whose Kew climate is only tropical or subtropical, including Rhododendron 163 and Salvia 131.
  - The live wording:
    - `/species/senecio-vulgaris` (groundsel): "Asteraceae · Denmark, Finland +75 · listed by its genus as a cactus or succulent".
    - `/species/momordica-charantia`: "listed by its genus as a bulb, tuber or caudex".
    - `/species/ficus-carica`: "Grouped as a tropical foliage plant … the convention for tropical foliage plants grown indoors is 12 °C" (`html/arch-*.html`).
- **Why it matters:** this line sits in the page's headline (`src/lib/ui/ref/head.ts:178`), and the sheet repeats it (`+page.svelte:582`). It is a guess for every mixed genus, so it breaks rule 3, and it misleads growers outside the owner's groups. The queued round-81 removal of the four temperatures leaves the labels standing.
- **What should happen:** take a genus-level group only where Kew's lifeform agrees, or only for genera Kew lists as uniform. Otherwise state no group. Kew's lifeform is already in each dossier (`distribution.kew.lifeform`).

### D3. Major: every hybrid species is named without its hybrid sign, and some lose their Kew links

- **What I did:**
  - Mapped the 485 lines of `scripts/species-list.txt` whose Kew name carries "×" to the live index.
  - Read 25 hybrid pages as HTML.
  - Asked GBIF for peppermint's record.
- **What I saw:**
  - **The index:** all 485 names lack the ×. No name in the 48,361-entry index carries one. Examples:
    - Mentha piperita, "Peppermint" (Kew: Mentha × piperita);
    - Citrus limon (Citrus × limon);
    - Fragaria ananassa, "Garden strawberry";
    - Musa paradisiaca;
    - Lavandula intermedia;
    - 13 Sarracenia hybrids, 3 Nepenthes, 8 Opuntia, 4 Aloe and 4 Agave;
    - intergeneric hybrids such as "Astrolista bicarinata" (Kew: × Astrolista bicarinata).
  - **The pages:** 25 of 25 sampled hybrid pages show no × in the heading, title or JSON-LD. One example is `/species/mentha-piperita`, "Mentha piperita L.". Nothing on the page says the plant is a hybrid, except a quoted Wikipedia lead on some pages.
  - **GBIF's own record:** `api.gbif.org/v1/species/8707933` gives `scientificName` "Mentha ×piperita L.". Only its `canonicalName` drops the sign.
  - **Missing links:** 7 of the 25 sampled hybrids have no POWO or IPNI link, although Kew holds them. They are Fragaria × ananassa (IPNI 30117681-2), Sarracenia × farnhamii (77148221-1), Sarracenia × flavopurpurea, Spathoglottis × parsonsii, Utricularia × neglecta, Adiantum × tracyi and Drosera × hybrida. Of the other 664 Kew-compared pages, only 3 lack them: Datura innoxia (on the repair list), Arisaema exappendiculatum (among the build's 22 Wikidata timeouts) and Solidago lutea.
- **Where it comes from:**
  - The page name is GBIF's `canonicalName`.
  - For keyless pages, `canonicalOfKew` (`src/lib/dossier/kew-rows.ts:62`) removes "×" on purpose.
  - My reading of the code, not proved: the fallback link in `src/lib/dossier/build.ts:497-506` asks Kew's copy by the name without the sign (`gbif.kewIpni(f, scientific, …)`), so a hybrid finds no row.
- **What should happen:** show the name as Kew and GBIF write it, with ×. Keep the sign-less form for matching and addresses, which `/about/how` already describes ("Names are compared without the hybrid sign"). Find Kew's link by the page's Kew id, not by the name.

### D4. Minor: a page whose only Wikidata name is a generic noun will say its English names are Wikidata's, and show none (not yet live)

- **What I did:** ran the code's `fillWikidataNames` on copies of the 79 sampled keyless dossiers (one query, 61 items), then the page's own `namesSource` and `englishNames`.
- **What I saw:** Ferocactus tiburonensis (`k2808236`) takes only Wikidata's "Cactus".
  - `englishNames` gives `{}`, so no name is shown.
  - `namesSource` gives `{"item":"Q1407505"}`.
  - The page would print "English names from Wikidata, item Q1407505, read 2026-10-23 (CC0)." under a name with no English name. The PC's run says 6 such pages ("6 'Cactus' searched, not shown").
- **Where:** `src/lib/ui/ref/upstream.ts:85-95`. The test is only that a Wikidata row exists (`d.name.vernacular.some((v) => v.source === 'Wikidata')`), not that a name is shown.
- **What should happen:** print the line only when a Wikidata name is shown. Otherwise print nothing, or "Wikidata gives only a generic noun".

### D5. Minor: the queued "one-word group names" fault is wider than Wikidata, and is live now

- **What I saw:**
  - **On the live index:** "Cycad" is the headline common name of 39 keyed pages today: Ceratozamia (6), Cycas (18), Dioon (4), Encephalartos (3), Macrozamia (2) and Zamia (6). "Snowdrop" heads 7 Galanthus pages and "Fig" 4 pages.
  - **From Wikidata:** in my run, Rosa virginiana takes "Species Rose", a class of garden roses, not this plant's name.
  - **The cause:** `GENERIC_NOUNS` (`src/lib/core/search.ts:656`) holds 20 words, none of them "cycad".
- **Why separate:** round 81's queue names this fault for Wikidata's names on keyless pages ("Cycad" for Ceratozamia becerrae). The same rule lets GBIF's names through on live keyed pages, so the fix should cover both sources.

### D6. Minor: three of 205 searches got no answer within 60 seconds

- **What I saw:**
  - "Allium subhirsutum" hung 4.5 minutes before I stopped it.
  - "Sechium edule" and "Echinocactus chrysacanthus" each passed the 60 s limit, with the tunnel open and no response header.
  - Each answered in under 2 s when asked again, with a 200.
- **Status:** not proved to be the site. It may be the agent proxy here, so it is passed to C to check against the Worker's logs or the R2 read timeouts. I list it so it is not lost.

## Confirmed working

- **Names and Kew (689 pages):**
  - Name and author are Kew's entry, or GBIF's name for a Kew synonym, stated beside the map (via `synonym-of`, as `/about/how` says), on every page. The exceptions are the hybrids (D3), Crocus nudiflorus and round 80's repair pages.
  - Family differs on 11 pages, all GBIF's fern families, as documented.
  - The page id is the Kew entry on every `k` page.
- **Ranges:** native and introduced ranges equal Kew's distribution on 680 of 689. The 9 others are the known ones:
  - Crocus nudiflorus;
  - Echeveria peacockii (to be merged);
  - the seven list pages on A's repair list, which still show national-checklist presence. Sechium edule shows 26 strings such as "Amazonia colombiana: sur del departamento del Vichada…".
- **Records:**
  - 122,456 open points on 589 pages: none at 0,0, none a living specimen, every one under an open licence.
  - Every one of the 119,411 points on range-tested pages lies inside its range's boxes. The antimeridian is handled: Fiji's box runs 177.0 to −178.2.
- **Climate:**
  - 424 climates: 12 sane months, rain p10 ≤ p50 ≤ p90.
  - 411 show extremes. None has a lapse beyond 1,000 m, and none has a record low above the coldest month's mean low.
  - Extremes are set aside on 13 pages (9 lapse, 4 sea). Each of the 9 lapse pages says why in HTML.
  - Solanum lycopersicum now reads "Cold floor: none read … the correction for elevation, −1129 m, is beyond the 1,000 m … absolute minimum 17.1 °C, 1st-percentile night 18.9 °C" (round 80 D6 holds).
  - 408 of 412 climates agree with Kew's climate description. The 4 exceptions are plausible: Himalayan and Korean cells, and Clematis akoensis.
- **Photographs:**
  - 19,275 photographs, all CC0, public domain, CC BY or CC BY-SA. Every CC BY and CC BY-SA photograph names an author.
  - No photograph appears twice on a page or on two sampled pages, and no thumbnail sits on two pages in the whole index.
  - 9 lead photographs viewed show the right species (`img/leads.png`). Fritillaria involucrata's lead is a seed capsule and Capsicum annuum's is mostly a fence: right species, poor leads.
- **Common names (round 80 D7):**
  - Goeppertia kegeljanii, Veronica albicans and Leibnitzia anandria now show no English name on their pages.
  - The index, and so the tiles and search, still holds "Calathea musaica" and "Veronica recurva" until the plan's `--index`, as DEPLOY says.
- **Keyless pages, live (rule 2):**
  - 52 of 52 keyless "not checked" pages say "not checked", with the reason, on the map, records, climate and evidence ("Not a statement that no record exists").
  - 79 of 79 keyless pages say "English names not checked: Wikidata's common names were not read for this page".
- **Keyless reasons (R's fill, run here on 52 live copies):**
  - Every page gets its own reason: 37 lumped, 11 none, 3 other-type and 1 other-author.
  - I checked each against GBIF's live name match. All 49 lumped, none and other-author reasons agree: the named page's GBIF key is the key GBIF files the name under, or GBIF holds no species of that name. The 3 other-type reasons cannot be tested by a name match.
  - Examples: Echeveria potosina under Echeveria elegans; Ferocactus tiburonensis under F. wislizeni; Rosa virginiana Mill. under R. carolina.
- **Wikidata names (N's fill, run here):**
  - 10 of 61 items give names; 9 are shown, such as Allium porrum "Garden leek" and Pediocactus winkleri "Winkler's pincushion cactus".
  - Scientific names and genus words are refused. Every name is a CC0 Wikidata statement, most stated in USDA PLANTS.
- **The fill's photographs (I's and V's code, run here; 6 requests for 62 sets):**
  - 646 photographs: every observation's taxon is the page's species or below it, 646 of 646.
  - Every cultivated one is captive with an agreed community taxon (255 of 255). Every wild one is research grade (391 of 391), linked by uuid.
  - Licences are CC0, CC BY and CC BY-SA only. Every CC0 credit names the observer, as in "pmallard, no rights reserved (CC0)" (96 of 96; round 80 D8's fix).
  - API v2 honours `order_by=votes`. Scilla verna gives the same faved observations first as v1, with 22 of the same 24.
  - Six cultivated photographs viewed show the right plants (`img/cult-strip.png`).
- **Most grown:**
  - The file over the live index gives 118 genera and 8,278 species, the front page's chip.
  - All 118 iNaturalist genus ids are active Plantae genera of that name.
  - Aloe's and Opuntia's counts are within 0.04% of iNaturalist's today.
- **Corpus as a whole:**
  - No duplicate names, slugs or GBIF keys.
  - Every `near` id exists, is not the page itself, and has a climate.
  - Front page: 48,361 species, 37,788 with climate, Most grown 8,278, without climate 10,573. All equal the index (9,653 none plus 920 pending).
  - 60 genus rows' counts equal the index.
  - The only shared Kew entries in the sample are the owner's queued merges (Ceropegia cereiformis and C. nubica into Echidnopsis cereiformis; Echeveria peacockii) and the Crocus pair.
- **Search:**
  - Own name: 80 of 80 first.
  - GBIF older name: 50 of 50 first.
  - Common name: 39 of 40 first; "Bladderwort" puts Utricularia neglecta second.
  - A page's name that is also another page's older name: 20 of 20 first.
  - A hybrid typed with ×: 4 of 4.
  - "echeveria" says `x-search-total: 259`. "cape provinces" gives the region link and no hits, as DEPLOY expects before the index.
- **Round 80 fixes in my area, as live today:**
  - Holding live: W1 (Most grown recounted), W2 (true count), D6 and the 1,000 m rule, D7 on the pages.
  - Code verified, waiting on the fill: D2 (ids checked: 20 of 552 sampled ids are still inactive and 15 still say "none", among them Iris germanica 57097 and Mentha piperita 361371), D4 (reasons on iNaturalist rows: 372 rows with no detail live) and D8 (2,204 unnamed CC0 photographs live, 11% of the sample). Each carries `/about/how`'s caveat.
  - Waiting on (d), still wrong live, as expected: W3 (Xanthoceras sorbifolium still Poaceae, key 9479204), W5 (D1 above), D1 (Crocus nudiflorus still entry 327347, POWO 436635-1), D9 (D1 above) and the merges.

## Not checked, with why

- **Commons photographs:** upload.wikimedia.org answered 429 to the review's User-Agent three times out of three, so I viewed no Commons photograph.
- **CHELSA and NASA POWER figures:** I did not recompute them. There is no climate grid here, so I checked plausibility only.
- **The whole fill end to end, and its upload:** that is B's area. I ran the rules, not the plan.
- **Rule 6 (the log) and sync:** outside the data review.
- **The 12 keyless pages left to the general reason:** none was in my sample.
- **Rates:** these are from the 705-page sample unless stated; the index-wide checks are a census.

## Needs from the PC

1. From step (b)2's output (`--fill wikidata-names`), the lines ending "no name shown". These are the pages D4 would label with no name shown; the PC's state says 6.
2. One count over `static\s\v3\*.json`: `k` pages with `ids.gbif` set, no `links.powo`, and an `ids` entry Kew's file could supply. This gives D3's link loss at full size, hybrids and Wikidata timeouts separately.
3. At stop (d), the summary lines of `--list-range-shapes` and `--list-default-points`. The sample predicts 24% and 9% of range-tested pages; D1's proportion should match.
