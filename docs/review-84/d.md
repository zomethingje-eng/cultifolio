# Deep review after round 83: reviewer D (the data)

**Verdict: works with faults.** I checked the live reference against its primary sources: Worker `ba78fb9`, corpus `e8885155673882ba`, 48,357 pages. Most of the data rules hold at full size.

- **Names and ranges:** every sampled range equals Kew's file.
- **Records:** no open record lies outside its native regions.
- **Licences and credits:** every photograph is open-licensed and credited.
- **Photographs checked against iNaturalist:** all 1,714 are the observation, taxon, licence and observer they claim to be.
- **Merged addresses:** all eleven old addresses redirect to the right page.
- **Round 83's 1-in-100 rule:** no page that shows extremes breaks it, out of 35,023.

There are three faults to fix before the public sees the site:

- **D1. The wrong reason for a missing cold floor.** On every page whose extremes the new 1-in-100 rule set aside, the headline card says "the weather cell's ground is too far off". That is untrue, and the page's own Climate section contradicts it. About 30% of the 1,968 pages with extremes set aside are affected.
- **D2. Box-tested regions let in introduced records.** 125 regions are still tested by their bounding box, among them France, Great Britain, Turkey, Greece, Japan and the Cape Provinces. Their boxes admit records from countries where Kew says the plant is introduced. On some pages those records decide the habitat climate. The snowdrop's typical spot is in Belgium.
- **D3. The headline name is not Kew's accepted name on 500 pages.** These are concentrated in the owner's stapeliads and Anacampseros. 76 of Kew's genera are split across two or more genus names in the catalogue. A few of these names are malformed.

## Scores

- **Data quality: 7/10.** Names, ranges, records, licences and photograph identity are right at measured rates of 99 to 100%. The three faults above are rule-level, not page-level, so each one affects hundreds of pages.
- **Honesty of the data claims: 7/10.** "Not checked" and "from few records" are honest everywhere I looked. But the reason card for extremes set aside (D1) and one /about/how sentence ("each page's record of its sources says which") are false on many pages.

## What I covered

**Pages.** I read 617 live dossiers (`/api/dossier/<id>`), drawn with seed 84 from the live index:

- **Most grown:** the 50 most grown (round 83 C's list).
- **Named:** 44 named owner and review pages.
- **Plant groups:**
  - 45 cacti, 40 other succulents, 35 bulbs and 15 other geophytes;
  - 25 orchids and 15 carnivorous plants;
  - 20 trees, 22 crops and herbs, 12 aquatics, 12 ferns and 8 foliage plants.
- **Page structures:**
  - 15 hybrids, all 14 `g` pages and all 10 kept pages of the 11 merged names;
  - 20 pages "from few records";
  - 30 random pages with extremes set aside for elevation or warm nights, and 6 set aside for sea;
  - 33 of the 34 pages that regained a climate;
  - 42 near the rebuilt shapes (Yugoslavia, Somalia, Sudan, Palestine, Cyprus, Sierra Leone) and 15 on islands;
  - 15 keyless "not checked" pages, 8 keyless pages with a climate, 12 with no climate and 8 with no photograph;
  - 20 to fill the Antarctic continent, 15 at random and 13 follow-ups of round 81.
- **By continent:**
  - Africa 194, temperate Asia 165, South America 130, tropical Asia 103;
  - Europe 93, North America 89, Australasia 44, Pacific 23, Antarctic 20.

**HTML pages.** I read 189 species pages, plus the two merged pages with `?was=`, the front page and both about pages.

**Census of the whole corpus.**

- The index, once, from S's copy at `inputs/index.json`.
- Every species' sheet (`/api/sheets`, 64 requests, 48,357 sheets). This gives each page's climate counts, extremes and "none" reasons in full.

**Checks against primary sources.**

- **Kew:** 600 names, authors and ranges against Kew's WCVP file of 2026-06-04, the build's own copy (`/home/claude/r73data/bulk/`).
- **Records:** 101,130 open records tested with the code's own `regionTester`, and against the record's country by TDWG's level-4 table.
- **iNaturalist photographs:** 1,714 photographs on 444 pages, checked against iNaturalist's observations.
- **iNaturalist taxa:** 573 taxa.
- **Wikidata:** 593 items, in one SPARQL query.
- **GBIF:** 24 "not checked" reasons against GBIF's name match, and 47 dropped default points looked up on GBIF.
- **Photographs viewed:** 69 lead photographs.
- **Code runs:** the shapes script re-run into scratch.

**Requests.**

- **cultifolio.com:** 885 requests, never closer than 0.75 s apart, with no 429.
- **Third parties:** 246 requests.
  - 93 to api.inaturalist.org, 2.1 s apart.
  - 63 to api.gbif.org and 67 to the iNaturalist open-data bucket, 1.1 s apart.
  - 13 to Wikidata. 12 of these were API calls that answered 429; I stopped and sent one SPARQL query instead.
  - 5 to upload.wikimedia.org, all answered 429.
- **User agent:** every request went as `cultifolio-review/84 (https://cultifolio.com)`.

**Scratch.** Everything is in `/tmp/claude-0/rev84r/D-s/`:

- the scripts `analyse.py`, `htmlcheck.py`, `sheetcensus.py`, `dp.py`, `inatan.py` and `ts/*.mts`;
- the outputs `faults.json`, `htmlfaults.json`, `sheetcensus.json`, `gbif-dp.json` and `shapes-out.json`;
- the contact sheets `img/leads*.png`.

## Issues

### D1. Major: every page whose extremes the 1-in-100 rule set aside gives the wrong reason in its headline card

- **What I did.** I read the 18 sampled HTML pages whose extremes are set aside (`extremesStatus: "lapse"`). For each, I classified the cause from the dossier's `extremesLapse` against the coldest month's mean nightly low.
- **What I saw.** Six of those pages were set aside by round 83's rule: the 1-in-100 night is warmer than the coldest month's mean low. On all 6, the "Habitat figures" card says *"…not a floor; extremes not used (the weather cell's ground is too far off)"*. The "Warmth and air" paragraph says *"The daily extremes were read at a weather cell whose ground is too far above or below the typical spot to correct for"*. Yet the elevation corrections were small:

  | Page | Elevation correction |
  |---|---|
  | `/species/nephelium-lappaceum` | +8 m |
  | Costus stenophyllus | −28 m |
  | Hakea salicifolia | −135 m |
  | Lachenalia haarlemensis | +319 m |
  | Eulychnia acida (round 83's own example) | −432 m |
  | Geranium polyanthes | −510 m |

  - **The page contradicts itself.** Further down, the Climate section and the record of sources give the true reason: *"the 1-in-100 night, 22.3 °C, is warmer than the coldest month's mean nightly low across the range, 22 °C"*.
  - **How many pages.** Of 30 lapse pages drawn at random, 9 (30%) are this case and 21 are the elevation case; none is the record-low case. The sheets census counts 1,968 lapse pages, so about 590 pages are affected (95% interval roughly 300 to 960; the PC's repair counted 422 at build time).
  - **The plant page too.** My reading of the code: a grower's plant page for any of these species says the same wrong thing.
- **Where.** `src/lib/core/sheet.ts` lines 266–278 (`extremesWhy`, `extremesWhyTag`, `extremesWhyShort`) and `src/routes/plants/[acc]/+page.svelte:201`. All of them key on `extremesStatus === 'lapse'` alone. That status covers three causes (more than 1,000 m, a record low, or a 1-in-100 night above the mean low), but the wording describes only the first. The schema comment (`schema.ts`: "'lapse' is read at a cell whose correction is beyond `MAX_LAPSE_M`, or impossible") predates rules 2 and 3.
- **What should happen.** The card and the paragraph should name the cause the Climate section names.
- **Smallest fix.** Derive the cause from `extremesLapse` where these sentences are built: `|lapseAppliedM| > 1000`, then `minAbs > coldest`, then `minP01 > coldest`. Give each cause its own words. Or use the neutral tag "extremes not used (see Climate)". Add a test with Nephelium lappaceum's figures.

### D2. Major: the 125 regions still tested by their bounding box let in records from countries where Kew says the plant is introduced, and these sometimes set the habitat climate

- **What I did.**
  - I tested each sampled page's open records with the code's `regionTester`.
  - I checked each record's country against the countries of its native regions, using TDWG's level-4 table with today's ISO codes added.
  - I asked Kew's file about the countries the records came from.
  - I re-ran `scripts/dev/r80a-tdwg-shapes.py` read-only into scratch, on round 83 C's source files. It gives the same 244 shapes and 125 boxes.
- **What I saw.**
  - **Rates:**
    - 431 of 101,130 tested open records (0.43%) lie in a country that holds none of the species' native regions. 366 of them came in through a box-only region and 65 through a shape's 5 km margin.
    - On 7 of 550 range-tested pages, such records are 10% or more of the page's open records.
    - On 5 of 518 pages, the map marker (the densest population) lies in such a country.
  - **Galanthus nivalis.** The typical spot is cell 50.875 N, 5.475 E, at 56 m: Belgian Limburg. Kew's file holds the species as **introduced** in Belgium (BGM), the Netherlands and Great Britain. The cold floor (−8.7 °C) and extremes are read there. The map marker is also in Belgium (50.586, 4.53; 39% of in-range records). France is native and box-only, and its box (41–51.1 N) takes in Belgium and southern England.
  - **Melissa officinalis (lemon balm).**
    - 32 of its 38 open in-range records are from Switzerland, Britain, Belgium, Luxembourg and Germany (16, 10, 2, 2 and 2). Kew holds it as introduced in all five.
    - The marker is in Belgium (50.809, 3.695), where 64% of its 369 in-range records cluster.
    - Its 233-cell climate therefore leans on garden escapes.
  - **Punica granatum.** The marker is on Samos (37.689, 26.94). Kew records the East Aegean Islands as introduced; they enter through Turkey's box.
  - **Other cases:**
    - Conophytum bilobum and Roepera foetida take Namibian records through the Cape Provinces' box.
    - Rhododendron indicum takes Korean records through Japan's box.
    - Drosera biflora takes 9 of its 20 records from Colombia through Venezuela's box.
  - **Exposure, from Kew's file over the index:**
    - 32,161 of 48,248 pages (67%) have at least one native region tested by box; 9,718 (20%) have only boxes.
    - The Cape Provinces alone covers 4,745 species, the owner's core group.
    - Among the box-only regions: Japan 2,349 species, France 3,321, Turkey 3,201, Greece 2,756, Mexico Southwest 3,655 and Mexico Northwest 2,925.
- **Why (from the re-run).** A region gets a shape only when every province of each of its countries is placed and the shape fits its box. Many large regions fail for one remote ring or one unplaced province:
  - **Cape Provinces:** "shape outside its box (-47.0,16.5 to -24.8,38.0)", because Marion and Prince Edward Islands belong to the Western Cape's province.
  - **Japan:** the shape reaches 24.7 N (the Bonin Islands, part of Tokyo).
  - **Mexico Northwest and Southwest, Norway, the Netherlands, Pakistan, Yemen, Morocco:** the same "outside its box" failure.
  - **France, Great Britain and Ireland:** a GB-coded province is unplaced.
  - **Greece and its East Aegean and Cretan regions, and Turkey:** one unplaced province each.
  - Round 83 changed none of these.
- **What should happen.** These regions should be tested by their shapes. /about/how's one example of a box ("Tanzania's holds Nairobi") understates which regions are boxes.
- **Smallest fix.** In `r80a-tdwg-shapes.py`:
  - drop or reassign an out-of-box ring one ring at a time, instead of rejecting the region;
  - place Natural Earth's GB, IM, JE and GG provinces.
  Then list and re-derive the affected pages, as round 83 did. Until then, /about/how should name the big box-only regions.

### D3. Major for the owner's groups: on 500 pages the headline name is not Kew's accepted name for the page's own entry, and 76 of Kew's genera are split across two or more genus names in the catalogue

- **What I did.** I compared every `k` page's index name with Kew's file for its own `plant_name_id`.
- **What I saw.**
  - **Counts:**
    - 47,842 pages match exactly.
    - 354 show a name in another genus. 471 of these 500 are Kew synonyms of the page's own entry: GBIF's name for its key.
    - 146 differ otherwise: 28 names Kew does not hold at all, and 1 held for another plant.
  - **Split genera.** In the catalogue a genus row splits:

    | Kew's genus | Shown under | Pages |
    |---|---|---|
    | Huernia | Ceropegia | 50 |
    | Huernia | Huernia | 25 |
    | Orbea | Ceropegia | 53 |
    | Orbea | Orbea | 7 |
    | Echidnopsis | Ceropegia | 26 |
    | Echidnopsis | Echidnopsis | 10 |
    | Stapelia | Ceropegia | 26 |
    | Stapelia | Stapelia | 5 |
    | Caralluma | Ceropegia | 22 |
    | Caralluma | Caralluma | 8 |
    | Anacampseros | Anacampseros | 40 |
    | Anacampseros | Avonia | 15 |
    | Anacampseros | Grahamia | 4 |
    | Manfreda | Agave | 37 |
    | Manfreda | Manfreda | 1 |

    76 Kew genera split this way. So the "Huernia" row lists 25 of Kew's 75 Huernia.
  - **The merge is inconsistent with the rest.** Echidnopsis cereiformis shows under Kew's name (round 82's merge), while 26 of its congeners show as Ceropegia.
  - **What the page says.** `/species/ceropegia-alstonii` heads with "Ceropegia alstonii (N.E.Br.) Bruyns". Only at the range source, far down, does it say "Kew holds Ceropegia alstonii as a synonym of Hoodia alstonii".
  - **Wrong or malformed names among them:**
    - `k3313620` is Kew's Ceropegia dodomaensis Heiduk & D.Styles. Its heading is "Ceropegia tanzaniensis" with the author **"(Peckover)"**, which is truncated. Kew's file holds Ceropegia tanzaniensis Peckover as a synonym of **Ceropegia cordiloba**, another plant.
    - `k2734813` is Kew's subspecies Conophytum calculus subsp. vanzylii. It is titled "Conophytum calculus vanzylii", with no rank. Five pages are keyed on infraspecific entries.
    - `k2916959`, the common dandelion, is titled "Taraxacum sect. Taraxacum". It has no common name, no photograph and no records: "not checked", because GBIF's Taraxacum officinale is by another author.
    - GBIF spellings Kew corrects: Cyphostemma congoensis and 6 more "-ensis" forms where Kew writes "-ense", Psidium cattleianum, Melocactus lemairei, Weingartia fidaiana (Kew: fidana) and Handroanthus impetiginosum.
- **What should happen.** At least, a genus row and a heading should follow the Kew entry the page is keyed on. The about page says Kew's names are the reference. Malformed names should not reach a heading at all.
- **Where.** The page's name is GBIF's `canonicalName` for its key, as /about/how describes. This is a decision, not a bug, but I argue it matters before launch for the owner's own groups.
- **Smallest fix.**
  - Show Kew's accepted name as the heading on `k` pages, with GBIF's name among the older names.
  - Or, at least, put the catalogue's genus row under Kew's genus.
  - Separately, refuse a heading whose author has no closing combination author or whose name lacks a rank marker for an infraspecific entry.

### D4. Minor: Xanthoceras sorbifolium says its records were "not checked" and its map is empty, while it carries records read under a wrong GBIF key

- **What I saw.** `/species/xanthoceras-sorbifolium` (`k2467608`) is now keyless. Its page says "GBIF's records not checked … so this page has no points on its map".
  - **The page contradicts itself.** In the same section it says "3 in-range records are placed to worse than 10 km".
  - **The records' source.** The dossier keeps 2 open points and `gbif.occurrences: ok`, "carried from build of 2026-10-22 as one snapshot". That build read GBIF's key 9479204. GBIF today: 9479204 is "Xanthoceras sorbifolium (A.Braun) Holub" filed under **Poaceae**, the key round 81 found wrong.
  - **Not "none".** The index gives this page climate "none" and open 2, not "pending".
  - **Only page.** It is the only keyless page in the index with records and no keys.
- **Fix.** Drop the carried occurrences when a page loses its key: re-derive this one page by the rule.

### D5. Minor: one hybrid in five still has no Kew links (round 81 D3, half fixed)

- **What I saw.**
  - **Fixed:** the hybrid sign is now in the index (485 names) and in every sampled hybrid heading (12 of 12).
  - **Still broken:**
    - 4 of 22 sampled hybrids have no POWO or IPNI link although Kew's file has their IPNI id: Aesculus × woerlitzensis (430902-1), Mentha × suavis (451192-1), Sarracenia × formosa (790138-1) and Rhododendron × sochadzeae (333372-1).
    - Only 1 of 578 non-hybrids lacks the link (Malva acerifolia).
- **Fix.** Take the link from the page's Kew entry, not from a name lookup. My reading of round 81's code is that the fallback asks by the sign-less name.

### D6. Minor: three data sentences are untrue of the live site

- **"Each page's record of its sources says which"** (shape or box). It does not on 289 of 587 range-tested sampled pages (49%). All of them were built on 21–22 October and not re-derived in round 83; their `gbif.occurrences` detail names neither test.
- **"About 4,400 of the 37,788 pages with a climate on the live corpus of 23 October 2026."** The live corpus marks 4,839 of 37,727 (12.8%), by the sheets census.
- **Ferocactus hamatacanthus says "the key of the name Kew's World Checklist holds as this plant: 7281739 (Bisnaga hamatacantha …)… the keys are read from Kew's synonymy".** Kew's file holds no row of that name; two lines later the same page rightly calls it the owner's merge. Round 83 A also flagged this.

### D7. Minor: the default-point rule still drops about one named locality in four that it drops

- **What I did.**
  - I compared the 77 sampled pages that have round 81's copy (23 October, before any default-point rule) with today. That found 35 dropped points inside today's shapes on 15 pages.
  - I added 12 points from two pages whose climate the rule touches.
  - I looked up 47 points on GBIF: the records at each, and how many plant species sit at the point.
- **What I saw.**
  - **What the dropped points are:**
    - 25 country or territory middles, all rightly dropped: Mexico 23.874,−101.554; Madagascar; South Africa; India; Thailand; and Kunming's checklist at nine national centroids.
    - 11 coarse or unnamed placements: 21–56 km stated, local floras and unnamed material samples.
    - **11 named localities whose datasets state no accuracy:**
      - La Coca, Alfiletero and Nepomuceno in Havana: 5 of Melocactus matanzanus's 9 in-range records;
      - Berriozar, Navarra (Laurus nobilis);
      - La Guacamaya, Oaxaca (Capsicum, Ipomoea);
      - Finca Monteverde (Capsicum);
      - Sauzal, Orán and Villa Luján (Handroanthus);
      - Ejido Sabana Grande (Lophophora williamsii).
  - **Size:** the rule removes 2,444 of 219,393 in-range records (1.1%), on 196 of 614 pages (32%).
  - **Effect on the climate.** Small: a record with no stated accuracy rarely qualifies for the climate anyway. The effect is mostly on the maps.
- **Fix (owner's decision).** Keep a record at a default point whose locality text names a place smaller than a province. Otherwise, accept the loss and say on /about/how that named localities without a stated accuracy can be dropped.

### D8. Minor: weak lead photographs

I viewed 69 lead photographs (`D-s/img/leads0-2.png`). All of them show the right species as far as a photograph can tell. Six show little of the plant:

- Mammillaria plumosa's lead is a UV-fluorescence shot, glowing blue (`img/two.png`).
- Haemanthus coccineus's lead is a label in bare soil, with the plant dormant.
- Cedrus deodara's is a lakeside landscape.
- Acer rubrum's is fallen leaves.
- Platycladus orientalis's is a trunk.
- Brunsvigia josephinae's is one leaf.

The lead rule ("the cultivated set's first") takes these as they come.

### D9. Minor: generic nouns still head some pages (round 81 D5, partly fixed)

"Cycad" is gone (39 pages, now 0). Still in place:

- "Fig" on Ficus nymphaeifolia, F. prolixa and F. tinctoria;
- "Ginger" on Zingiber collinsii and Z. gramineum;
- "Tobacco" on Nicotiana glutinosa and N. tomentosa;
- "Beet" on Patellifolia procumbens;
- "Chestnut" on Pochota fendleri and Aesculus × mutabilis;
- "Bamboo" on 2 Phyllostachys;
- "Airplant" on 3 Tillandsia.

## Confirmed working

- **The corpus as a whole:**
  - No duplicate names, slugs or GBIF keys.
  - No thumbnail on two pages.
  - Every `near` id exists, is not the page itself and has a climate.
  - All 41,099 index credits are CC0, public domain, CC BY or CC BY-SA, with an author. "NC Wetlands" is an author, not a licence.
- **Front page against the index:** 48,357 species and 37,727 with climate both match; "No climate" 9,711 plus 919 not checked matches the index (9,711 none and 919 pending). Popular genera 8,277, recomputed from `most-grown-genera.txt`. All 60 genus rows on the page equal the index.
- **The sheets:** they agree with the index on all 48,357 climate statuses.
- **Index against dossiers:** consistent on 614 of 614 pages (climate, open, photographs, GBIF key, slug and thumbnail).
- **Merges:**
  - All 11 old addresses answer 302 to the right kept page with `?was=`.
  - 10 kept pages carry the 11 names in `merged`.
  - `?was=Echeveria peacockii` shows the round 83 line naming Dudleya pulverulenta "by another author"; `?was=Bisnaga hamatacantha` shows "is the name of a page merged into this one".
  - Every old name is a Kew synonym of its kept page, except Bisnaga (no Kew row, as documented).
- **Names and ranges.** Native and introduced ranges equal Kew's file on 600 of 600 Kew-compared pages. Family differs only on 8 pages: GBIF's fern families, Stixaceae and Cordiaceae.
- **Records:**
  - 0 of 101,130 open records lie outside every native region (round 81 D1 is fixed).
  - None at 0,0, no living specimens, all under an open licence.
- **The rebuilt shapes let in what they should.** 155 points on 41 pages are new since the morning's pre-repair copies: Slovenia 65, Somaliland 49, Bosnia 21, Montenegro 11, Serbia 1, South Sudan 1, and 7 islets (Vanuatu, the Northern Territory, Isla Mujeres, North Carolina, the Florida Keys, Wangerooge). All lie in Kew's native regions.
- **The 34 pages that regained a climate** are plausible. Their typical cells lie in the new shapes, and 28 of them are marked "from few records". Picea omorika's cell (43.925 N, 19.375 E, 984 m) is inside Wikipedia's quoted 800–1,600 m on its own page.
- **Climate at full size (sheets census):**
  - Of the 35,023 pages that show extremes, 0 show a record low or 1-in-100 night above the coldest month's mean low, and 0 show a correction beyond 1,000 m.
  - The few-records mark agrees with the counts on 186 of 186 HTML pages.
  - The climate agrees with Kew's climate class on 449 of 454 pages. The exceptions:
    - Euphorbia milii, 1,564 mm, "desert";
    - Echinopsis bruchii, 1,611 mm, "desert";
    - Hibiscus syriacus, coldest low 15.3 °C, "temperate";
    - Solanum lycopersicum, 73 mm, "wet tropical";
    - Blechnum fluviatile, coldest low 1.7 °C, "wet tropical".
- **iNaturalist photographs (1,714 on 444 pages, checked against iNaturalist):**
  - 1,714 of 1,714 are the photo in the cited observation, the page's taxon or below, and the same licence.
  - The credit names the photo's attribution or the observer on 1,714.
  - One wild photograph's observation (Eucomis comosa, 715055189) has since become captive or casual on iNaturalist.
- **Photograph addresses.** The 21 extensionless iNaturalist addresses in the sample (`…/large.`) load (200, image/jpeg). The round 83 fix holds.
- **Other identifiers:**
  - 573 iNaturalist taxa are all active; 18 are named by iNaturalist synonyms, such as Sansevieria for Dracaena.
  - 593 Wikidata items: 589 carry the page's or Kew's name, 2 an older name, and 2 Kew's spelling. None is a wrong item.
- **Rule 2 ("not checked" and "none"):**
  - "Not checked" appears on 12 of 12 pending HTML pages.
  - 22 of 24 reasons agree with GBIF's name match. Eriosyce choapensis cannot be tested that way. Huernia collenetteae's reason names "Huernia lodarensis, a species with its own page here", but that page is titled Ceropegia lodarensis (D3).
- **Round 81 follow-ups:**
  - D1 fixed.
  - D2 fixed: groundsel has no group line.
  - D3 display fixed; links in D5.
  - D4 fixed: Ferocactus tiburonensis says Wikidata's "Cactus" is not shown.
  - D5 partly fixed (D9).
  - W3: Xanthoceras is now Sapindaceae (but see D4).
  - Crocus nudiflorus is now on Kew entry 327378.

## Not checked, with why

- **Commons photographs.** upload.wikimedia.org answered 429 to 5 of 5 requests.
- **Wikidata's API.** It answered 429 to 12 requests sent 1.5 s apart. I stopped, and one SPARQL query did the job.
- **CHELSA and NASA POWER figures.** There is no grid here; I checked plausibility only.
- **Restricted records' positions.** They are not published, so the box effect (D2) is measured on open records and markers. It is a lower bound.
- **The PC's 5,187 default points.** I could not reach them, so the D7 sample is drawn from round 81's copies.
- **Areas of other reviewers:** search (S), chart and map rendering (W and P), and the code's tests (C).

## Needs from the PC

1. **Sizes D1.** Over `static\s\v3\*.json`, count the pages with `climate.extremesStatus = "lapse"` by cause:
   - `|extremesLapse.lapseAppliedM| > 1000`;
   - `extremesLapse.minAbs >` the coldest `months[].tmin`;
   - `extremesLapse.minP01 >` the coldest `months[].tmin`.
2. **Sizes D5.** Count the `k` pages whose name holds "×", whose `links.powo` is empty, and whose Kew entry has an `ipni_id`.
3. **Sizes the /about/how fix in D6.** Count the range-tested pages whose `upstream["gbif.occurrences"].detail` names neither "shapes" nor "box".
