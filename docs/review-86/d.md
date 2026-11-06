# Deep review after round 85: reviewer D (the data)

**Verdict: works with faults.** I checked live corpus `48c27bf790016ccc` (Worker `ba32fc3e`) against Kew's file, GBIF, iNaturalist, Wikidata and Commons. Round 85's name work holds:

- Names are Kew's on every sampled page. Of 314,000 older and search names in the index, only 109 are names Kew places in another plant.
- Credits match their sources: 1,013 of 1,013 iNaturalist photographs and 50 of 50 Commons files.
- Every old address I tried lands on the right page.
- The border rule took the foreign-country cells out.

Six faults should be fixed before the public sees the site. Four come from round 85's own changes:

- **The data's worst wrong fact (D1).** 31 species that Kew lists only "as a cultigen" show a "habitat climate" and "Native to …" as if they grew wild. These include tomato (73 mm of rain a year, from Lima), saffron, peach, wheat, rice and dahlia.
- **A named "fixed" case still reads wrong (D2).** The Poor Knights lily's typical spot is Auckland. Its own quoted summary and Kew both say it grows only on the Poor Knights and Hen Islands.
- **Old addresses ignore Kew (D3).** Names round 85 removed from pages as "Kew's elsewhere" still redirect there through GBIF's name service: 10 of 11 tried, 4 of them species Kew accepts.
- **The border rule drops real native records (D4).** It does so wherever a simplified line puts them about 1 km into the neighbouring region of the same country. Two of the 7 lost-climate pages I traced lost their climate this way, among them the bulb *Albuca fastigiata*.
- **GBIF credits carry the wrong day (D5).** Their "read" day is the offline walk's date, not the day they were read.
- **San Pedro's records (D6).** About half of *Echinopsis macrogona*'s in-range records are San Pedro by Kew's synonymy. I argue the decision should be revisited.

## Scores

| Area | Score | Why | What makes it 10 |
|---|---|---|---|
| Data quality | **7.5/10** (round 84: 7) | Names, ranges, links, licences and captive marks measure 99.5 to 100%, and old addresses 100%. Held back by D1, D2, D4 and D6, which put wrong climates on grown plants. | Cultigens without a wild habitat climate; a same-country border allowance; San Pedro's records moved by Kew's synonymy. |
| Honesty of the data claims | **7/10** | "Not checked" and "not asked" are true wherever I looked, and the few-records place is named on 35 of 37 pages. | GBIF credit days true (D5); every credit and quote dated (D7); old addresses that obey Kew (D3); cultigens said as such. |

## What I covered

**Live dossiers.** 781 dossiers (`/api/dossier/<id>`), every one read field by field. The strata, sampled with seed 86:

- the 50 most grown;
- 46 named pages, the brief's and earlier rounds' cases;
- all 29 new or re-keyed pages: the 18 new ones and the 11 `g` pages re-keyed to Kew;
- 70 of the 508 renamed pages: 45 stapeliads and *Anacampseros*, 25 others;
- every page whose climate changed, 74 in all: 29 lost, 44 gained, 1 other;
- 299 pages by group:
  - succulents and cacti: cacti 45, stapeliads 20, Aizoaceae 20, Crassulaceae 20, aloes 15, succulent euphorbias 10, agaves 8, other succulents 12;
  - bulbs 30 and other geophytes 15;
  - orchids 25, carnivorous plants 15, trees 20, crops and herbs 20, aquatics 12, ferns 12;
- 8 per continent (Antarctica 4);
- 15 hybrids, all 5 `g` pages, 8 merged pages, 8 `hom` pages, 5 with spellings and 10 without a key;
- 30 border candidates and 25 island-only species;
- 40 random pages and 11 name checks.

**HTML.** 154 species pages, the front page, 8 old-address landings, and the saffron and tomato pages.

**Old addresses.** 87 old addresses: 11 re-keyed, 11 merged, 50 GBIF names of renamed pages, and 15 special cases (the four 404s round 85 reported, San Pedro's names, autonyms). Also 11 names Kew places in another plant.

**Whole corpus.**

- `/api/index` was fetched once and saved to `inputs/index.json` for S. I compared it entry by entry with round 84's index of 31 October.
- All 48,894 sheets (`/api/sheets`, 64 requests): 48,375 pages' own sheets and 519 copies.
- Kew's file (`r73data/bulk`, 2026-06-04) against all 314,000 older names in the index and against all 776 sampled `k` entries.

**Primary sources.**

- **iNaturalist:** 1,013 photographs on 557 pages against their observations; 30 iNaturalist photographs reached through GBIF; 10 open-photograph counts.
- **GBIF:** 2,599 + 762 records on 31 pages through the r85 `admit()`; San Pedro facets; 30 occurrences.
- **Commons:** 50 files.
- **Wikidata:** 60 of Kew's IPNI ids (statement search) and 13 items.

**Code run.** The code's own testers (`regionTester`, `checkPage`, `cellReached`) over all 110,838 open records on the 719 range-tested pages, every typical cell, and the GBIF records.

**Requests.**

- **cultifolio.com:** 1,182 requests, at least 0.82 s apart (median 1.23 s), with no 429.
- **Third parties:** 129 requests, as `cultifolio-review/86 (https://cultifolio.com)`:
  - GBIF 78;
  - iNaturalist 34, 2.1 s apart;
  - Wikidata 11, plus 1 SPARQL query (5 answered 429);
  - Commons 4 (3 answered 429);
  - Wikipedia 1 (429).

**Scratch.** `/tmp/claude-0/rev86r/D-s/`.

- **Scripts:** `analyse.py`, `htmlcheck.py`, `sheetcensus.py`, `kewelse.py`, `inatcheck.py`, `commons.py`, `ts/geo.mts`, `ts/border.mts`, `ts/isl.mts`.
- **Outputs:** `analyse.out`, `faults.json`, `htmlfaults.json`, `geo.json`, `border-out*.json`, `isl.json`, `climchange.json`, `redir.tsv`, `els-redir.tsv`, `inat-faults.json`, `wd-mismatch.json`.

## Issues

### D1. Major: 31 Kew cultigens show a "habitat climate" and "Native to …" as if wild (tomato, saffron, peach, wheat, rice, dahlia)

- **What I did.** For every `k` page I read Kew's `geographic_area` for its entry.
- **What I saw.**
  - 57 entries read "as a cultigen from …". 31 of them show a climate: 20 from 12 records or more, 11 marked "from few records".
  - By growers' count:
    - Solanum lycopersicum, "as a cultigen from Peru" (28,223 grown);
    - Dahlia pinnata (20,706);
    - Prunus persica (17,723);
    - Tropaeolum majus;
    - Alcea rosea;
    - Cucurbita pepo;
    - Triticum aestivum;
    - Prunus amygdalus;
    - Artocarpus altilis;
    - Brassica napus;
    - Oryza sativa;
    - Curcuma longa;
    - Crocus sativus;
    - Setaria italica.
  - `/species/solanum-lycopersicum` reads "Native to Peru · Habitat in short from 5 records … Rain 73 mm a year … The typical spot … is in Lima Province, Peru". The figures come from five garden or field records on the desert coast.
  - `/species/crocus-sativus` reads "Native to Greece … Cold floor 0.5 °C … Rain 441 mm … Wet winters". Saffron is a sterile cultigen with no wild habitat.
  - Neither page says "cultigen" anywhere (`raw/tomato.txt`, `raw/crocus.txt`).
- **What should happen.**
  - A page whose Kew entry says "as a cultigen" says so.
  - It shows no "habitat" climate. At most it shows the climate where the crop is grown in its region of origin, labelled that way.
  - It does not say "Native to" without "(as a cultigen)".
- **Where.** The range and the climate take Kew's distribution rows, which list a cultigen's region of origin as not introduced. Kew's `geographic_area` text is read (`distribution.kew`) but not used. This is my reading of `bulk.ts` and `range-via.ts`.
- **Smallest fix.**
  - A rule on Kew's text, `/^as a cultigen/`: `climate.status = 'none'` with the reason "Kew lists this plant only as a cultigen from Peru: it has no wild habitat to read".
  - The range line reads "cultigen, from Peru".
  - It is a test on Kew's own field, applied to all 57 pages.

### D2. Major: the Poor Knights lily (*Xeronema callistemon*), named "fixed" by the check, has its typical spot in Auckland, where it grows only in gardens

- **What I saw.**
  - The climate gained in round 85 rests on 5 records in 3 cells: the Poor Knights, Auckland city and Wellington.
  - The typical cell is −36.875, 174.725 (central Auckland, 35 m). The page says "The typical spot, where the cold figures are read, is in Auckland, New Zealand".
  - Two sentences earlier, on the same page, the quoted Wikipedia summary says it is "endemic to the Poor Knights Islands and Taranga Island". Kew's own `geographic_area` says "New Zealand (Poor Knights Is., Hen I.)".
  - The Auckland and Wellington records (−36.9 and −41.4) are inside TDWG's NZN region, the whole North Island, so the range rule cannot tell them from wild ones.
- **The class.**
  - *Aesculus hippocastanum*, gained in round 85, has its typical cell at Novi Sad (Južno-Bački, 103 m). Its records run Istanbul 182, Greece 130, Bulgaria 72, Croatia 24, Slovenia 21 and Serbia 20: planted trees inside YUG and TUR.
  - Of 106 few-records pages, I found one whose place contradicts Kew's narrower area text outright: this one.
- **What should happen.** On a page "from few records", a typical spot outside Kew's stated area text should not be the one the cold figures are read at. At the least, the page should not put "Auckland" beside a quote that says the plant lives only on two islands.
- **Smallest fix.**
  - The rule that already names the place could test the place against Kew's parenthesised area ("(Poor Knights Is., Hen I.)"). Where it is not one of them, say: "Kew gives its area as Poor Knights Is., Hen I.; the typical spot is not there".
  - Better, take the typical cell from the cells nearest Kew's stated localities when Kew names them.
  - Either is a rule. Not a hand edit.

### D3. Major: names Kew places in another plant still lead to the page, through GBIF's name service: 10 of 11 tried, cached a day

- **What I did.** I drew 11 names at random from sampled dossiers' `name.kew.elsewhere`, choosing names no page heads or holds, and opened `/species/<name>`.
- **What I saw.** 10 answered 302 to the page round 85 removed them from, with `?was=` and `cache-control: public, max-age=86400` (`els-redir.tsv`):

  | Address | Goes to | Kew holds the name as |
  |---|---|---|
  | `/species/juglans-hispanica` | Juglans regia | Accepted |
  | `/species/opuntia-jamaicensis` | Opuntia tuna | Accepted |
  | `/species/pandanus-papenooensis` | Pandanus tectorius | Accepted |
  | `/species/astilbe-taquetii` | Astilbe rubra | Accepted |
  | `/species/stapelia-brevirostris` | Orbea variegata | Kew: *Stapelia deflexa* |
  | `/species/stisseria-maculosa` | Orbea variegata | Kew: *Orbea × maculosa* |
  | `/species/peniocereus-haackeanus` | Acanthocereus oaxacensis | Kew: *Acanthocereus haackeanus* |

  The other three went to Dracocephalum officinale, Orbea carnosa subsp. keithii and Suaeda calceoliformis.
- **What the landing says.** "Juglans hispanica is an older name of this species in GBIF's backbone, which files it under Juglans regia. Kew's World Checklist does not list it among this species' synonyms." That omits that Kew accepts it as a species of its own (`raw/was-juglans.html`).
- **Rate.** In my sample, 84 of 334 elsewhere names (25%) are held by no page, and they fall to this path. At full size that is about 5,700 of the 22,718.
- **What should happen.** Round 85's claim is "a name Kew holds only in another plant leaves the page's older names, search names **and addresses**". The address should 404, saying where Kew places the name, or go to Kew's page where the reference has one.
- **Where.** `src/routes/species/[slug]/+page.server.ts` about lines 87 to 104: `synonymAsk` takes GBIF's accepted key and redirects with no Kew test.
- **Smallest fix.** Before the redirect, read the destination's dossier. Refuse when the asked name (binomial) is in its `name.kew.elsewhere`, and say Kew's verdict.

### D4. Major: the border rule excludes real native records that a simplified line puts about 1 km into a neighbouring region of the same country

- **What I did.**
  - I asked GBIF for each page's records in its native countries, with coordinates and no geospatial issue, at most 300 a page.
  - The pages: 24 border and other pages, then 7 of the 29 that lost their climate.
  - I ran the code's own `regionTester().admit()` (r85, `scripts/tdwg3-shapes.json`) on each record with its stated country.
- **What I saw.**
  - 3,361 records in all. 3,203 were admitted and 158 excluded: 148 on another region's land and 10 at sea. Every one of the 148 had GBIF's country agreeing with a native country, and 28 lay within 0.05° of a native shape (11 within 0.02°).
  - Three cases, proved by their own locality fields:
    - ***Albuca fastigiata*** (native CPP and OFS; a bulb). Nine iNaturalist and herbarium records at the Sentinel car park, the chain ladder and Witsieshoek (−28.73, 28.89; 1 to 224 m accuracy) are excluded as KwaZulu-Natal's, 0.005° to 0.011° inside NAT's simplified shape. Five of them state "Free State" or "Sentinel parking to Witches view point" (e.g. GBIF 6352279786, 4946391524, NH 4523495516). The page **lost its climate** in round 85: "only 2 distinct land cells".
    - ***Begonia faustinoi*** (native MXT). GBIF 4168528352, "Chiapas, Unión Juárez, Camino a la línea", 100 m accuracy, is excluded as Guatemala's, 0.005° over the line. The page **lost its climate** in round 85.
    - ***Hieracium bombycinum*** (native SPA). GBIF 357759129, "Navarra, Isaba, Larra-Anielarra", is excluded as France's, 0.007° inside.
  - The shapes are simplified by Douglas–Peucker at 0.02° (about 2 km, `meta.simplified`), so a strict 0 tolerance on borders is tighter than the drawing.
  - Rates: wrongful exclusions are about 0.3% of in-country records near borders. But on a thin page each one can flip the climate: 2 of the 7 lost pages I traced.
- **What should happen.** A record within the shapes' own simplification tolerance (0.02°) of a native shape, whose stated country is the native region's, should be admitted. For a border inside one country (OFS/NAT, CPP/NAT, US states, Mexican states), use the record's stated `stateProvince` when the download carries it.
- **Where.** `src/lib/dossier/tdwg-shapes.ts` lines 222 to 225: `if (landOf(lat, lon).length) return null` before any margin.
- **Smallest fix.** In `admit`, before step 2, admit a record within 0.02° of a native shape whose country is the region's. Tweed Heads stays out only because its stated state is NSW, so add `stateProvince` to `OCC_TERMS`. Then derive again the 29 lost pages and the near-border pages.

### D5. Major (rule 4): GBIF's photograph credits say "read from GBIF on 2026-11-01", the offline walk's day; they were read from the download of 2026-10-21 and not read again

- **What I saw.**
  - 4,432 of 4,869 GBIF photographs in my sample have no `read` day: 16% of all 27,100 photographs, on 272 of 781 pages (35%).
  - The credits line then takes the `gbif.media` row's `at`, for example "Credits as read from Wikimedia Commons on 2026-11-03 and from GBIF on 2026-11-01" (`/species/homoranthus-papillatus`; 12 of 154 HTML pages carry such a GBIF day).
  - That `at` is the offline re-derivation's timestamp (2026-11-01 on 194 pages, 2026-11-02 on 40), with an empty detail. In an offline build the photographs come from the download's media file (`build-dossiers.ts` lines 2743 to 2750, 2969; the row is marked by `mark('gbif.media', …)` at `build.ts:782` with the time of the build).
  - The credits fill reads only iNaturalist and Commons. 3,767 of the 4,869 GBIF photographs are iNaturalist's through GBIF and were not read again.
  - I checked 30 of them against iNaturalist today: all 30 have the same licence and none is marked captive. So the credits are right; the day is not.
- **What should happen.** A credit carries the day it was read. Here that is the download's day, or the fill should read GBIF's media again.
- **Smallest fix.** Write the `gbif.media` row from files with `asOf: <download day>` and detail "from the GBIF download … of 2026-10-21". Have `creditDays` prefer `asOf`. Optionally, have the credits fill read the iNaturalist-through-GBIF photographs by their photo id.

### D6. Major for cactus growers (argued against decision 1): about half of *Echinopsis macrogona*'s in-range records are San Pedro by Kew's synonymy

- **What I saw.**
  - GBIF facets for taxon 3952140 in Peru and Bolivia (E. macrogona's Kew range) give 317 records with coordinates.
  - 134 (42%) are under *Trichocereus macrogonus* var. *pachanoi*, which GBIF accepts as a variety with key 11093098 and Kew holds under *Echinopsis pachanoi*.
  - A further 43 are *T. schoenii*, a Kew synonym of *E. pachanoi*, and 11 + 2 are *chalaensis*, which Kew accepts apart.
  - Only about 169 (53%) are names Kew places in *E. macrogona* (var. *peruvianus* 163, *E. peruviana* 5, *E. macrogona* 1).
  - So the macrogona page's climate (typical spot Cusco, coldest month 4.8 °C, 778 mm) is roughly half San Pedro's. The San Pedro page has none ("not asked").
- **Why the decision should be revisited for this page at least.** Var. *pachanoi* is a GBIF key in its own right. Giving it to the page Kew's synonymy names is the same extra-key rule that already gave Ixia, Viola, Nymphaea and Acaena their records: matching by identifier, not by label. The "657 pages" concern applies to keyless species with no key of their own name; this one has one.
- **Smallest fix.** Treat GBIF infraspecific keys that Kew's synonymy places in a new page as that page's extra keys, and leave them out of the holder's. San Pedro gets a climate; macrogona's becomes its own.

### D7. Minor (rule 4, decision 8): 1,299 one-photograph pages and every genus quote carry no read day or revision

- **What I saw.**
  - `Photos.svelte` lines 41 to 47 draw the credits paragraph, with its day, only `{#if rest.length}`. A page with exactly one photograph (1,299 in the index) shows its credit with no read day: Haemanthus pumilio, Hydrangea strigosa, Huernia marnieriana.
  - "About the genus" quotes lack a revision and day on 110 of 110 sampled pages ("Quoted from Wikipedia, "Hoodia", CC BY-SA 4.0"). Genus records hold no revision (`+page.svelte:358`, `genusRev`).
- **Fix.** Draw the day under a lone hero's credit. Record the revision and day in the genus summary fill.

### D8. Minor: the island rule's box clause admits records in open sea as "on an island"

- **What I saw.**
  - Of 396 island admissions in the sample, 103 (26%) are on Natural Earth's minor islands and 293 are admitted by country and reach.
  - 161 lie more than 0.2° (22 km) from the native shape. Some are real islands: Isla de la Plata for Armatocereus, Macauley Island, Penghu.
  - Many are wrong coordinates at sea:
    - *Nymphaea amazonum* at −7.05, −34.14 (0.67° off Brazil);
    - *Ruellia geminiflora* 0.83° off Sergipe;
    - *Neptunia oleracea* 0.82° off KwaZulu-Natal;
    - *Acer palmatum* at 34.17, 140.59 (0.84° off Honshu);
    - *Salvia glabrescens* in the Sea of Japan;
    - *Patellifolia procumbens* at whole-degree points (37, −1; 38, 0).
  - They do not reach the climate (cells at sea are left out), but they are drawn as island rings and counted "on an island".
- **Fix.** Require the record within 0.05° of some land, Natural Earth land or minor islands, or drop "inside its box" from the reach.
- **The margin and coast reach are defensible.** Coast admissions max out at 0.148°, and both apply only on no region's land with the country agreeing.

### D9. Minor: 682 pages show a cold floor above the coldest month's mean nightly low, with no word

- **What I saw.**
  - The sheets census at full size (`sheetcensus.py`) finds 682 pages with `minP01` above the coldest month's mean low, and 2 where even the record low is above it (Aniba rosodora 21.8 against 21.7; Senna reticulata 22.6 against 22.3). Round 84 had 0.
  - This is decision 4's margin, but the shown pages say nothing. *Metrosideros vitiensis* reads "Cold floor 24.8 °C (1 night in 100 colder)" and "the coldest month's mean nightly low 24.3 °C" with no disagreement words (`html/k526013.txt`).
- **Fix.** Within the margin, add the two-sources sentence the set-aside case uses.

### D10. Minor: *Stapelia hirsuta*, now headed by the species, shows var. *hirsuta*'s range and records

- **What I saw.**
  - The range note reads "the range is Stapelia hirsuta var. hirsuta's", giving Cape Provinces only. Kew's species (512033) is CPP and NAM ("SW. Namibia to Cape Prov.").
  - The records are GBIF's *Ceropegia pulvinata*, which is var. *hirsuta*.
  - D7 of round 85 is half fixed: *Huernia barbata* matches Kew.

### D11. Minor: 86 of 87 sampled renamed pages link GBIF's name's Wikidata item, though Kew's name has its own (53 of 60 checked)

- **Examples.**
  - Huernia hallii links Q42559868, *Ceropegia hallii*, but quotes the enwiki article of Q5397594, *Huernia hallii*.
  - Larryleachia tirasmontana links Q42560572 against Q5426567.
  - Hoodia alstonii links Q42559312 (IPNI 77166268-1) while its IPNI link is Kew's 964729-1.
- The detail line says so ("the item's: IPNI 77166268-1"). These are the same plant, but a botanist expects the heading's item.
- **Fix.** For a Kew-headed page, the item carrying Kew's IPNI or POWO id wins over the GBIF key's item.

### D12. Minor: *Monsonia lheritieri* regressed to "not asked"

- **What I saw.**
  - The offline walk wrote `wcvp.distribution: skipped, "api.gbif.org not asked: offline re-derivation"` for a range read from Kew's file.
  - The climate is "the distribution source was not asked when this page was built", and the page is counted as the front page's one "pending".
  - Round 84 said truly "Kew holds Monsonia lheritieri only under another author".
  - Two other `g` pages (Albuca longifolia, Ceropegia macrocarpa) were carried "as one snapshot".

### D13. Minor: residue

- **Older names Kew places only in another plant.** 4 of 8,631 shown older names (0.05%) have Kew rows of that spelling only under another author, all in another plant:
  - *Iris nepalensis* Wall. on Iris × germanica (Kew: *Iris decora*);
  - *Coleus forskohlii* and *C. forskalaei* on Coleus hadiensis (Kew: *Coleus barbatus*);
  - *Hibiscus javanicus* on Hibiscus × rosa-sinensis.
- **Homonyms as plain older names.** 12 author-homonyms are still plain older names of a page while being another page's heading: Cordia collococca on Bourreria succulenta, Theobroma speciosum on T. grandiflorum, Saussurea japonica on Hosta plantaginea. They belong in `hom` with "under another author".
- **Common names.** "Beet" left *Patellifolia procumbens*, and "Cultivated beet" (Catalogue of Life) now heads it.
- **A contradictory landing.** `/species/erythrina-caffra` goes to Erythrina afra, whose banner says the name "names no one species here".
- **Two island few-records pages name no place.** Veronica bollonsii and Scaevola gracilis are off every drawn province, so "The typical spot … is in" is missing.
- **Photographs.** 56 of the 200 most-grown pages' lead photographs are by one observer, against 0 in round 84 (Nerium oleander: 36 of 110). This is for W's eye.

## The round-85 reviews' findings in my area

| Finding | Status | Evidence |
|---|---|---|
| D1 (and A8, B6): San Pedro; Kew-accepted names on other pages | **half** | *E. pachanoi* page live. Index names Kew places only elsewhere: 109 of 314,000 (round 84: accepted-name collisions 440, now 12, all homonyms). Addresses still redirect (D3). Records on macrogona (D6). |
| D2: "synonym of itself" | **fixed** | 0 of 154 pages; Hoodia alstonii reads "Kew holds Ceropegia alstonii … as a synonym of Hoodia alstonii". |
| D3: renamed pages re-asked | **fixed** | Renamed pages without a photo: 54% → 45%; stapeliads and Anacampseros: 74% → 60%. 10 of 10 remaining that I checked have 0 open research-grade photographs on iNaturalist, so it is honest. |
| D4, A5, A6, B1: border | **fixed for other countries, regressed within countries** | 0 `checkPage` faults on 719 pages; 1 of 499 typical cells on other land (Stellaria corei, within half a cell). Aloe vera now Al Buraymi, Oman; Dracaena trifasciata DRC. New: D4. |
| D5: 404 old addresses | **fixed** | dypsis-lutescens, erythrina-caffra, ceropegia-edulis and conophytum-calculus-vanzylii all 302. 50 of 50 GBIF names, 11 of 11 re-keyed and 11 of 11 merged right. |
| D6: `g` pages under Kew names | **fixed** | 11 re-keyed; 5 `g` left, each with no accepted Kew row; Delphinium × barlowii has its ×. |
| D7: autonyms | **half** | Stapelia hirsuta's range (D10). |
| D8: mixed hemispheres | **fixed** | 39 → 8 at full size, all at 10 to 18° N in monsoon climates; 0 south. |
| D9: coast reach | **holds** | Coast admissions max 0.148°. The island box is the weak part (D8). |
| D10: shapes metadata | **fixed** | "Natural Earth's provinces, placed in TDWG's regions; shapes rule r85" on 128 of 128. |
| D12, A9e: doubtful climates | **half** | Place named on 35 of 37 few-records pages; Hibiscus syriacus still 3 records in Hualien; Xeronema (D2). |
| D13: residue | **half** | Hereroa's genus fixed; captive marks 1,013 of 1,013 right; Beet became "Cultivated beet". |
| A3: Poor Knights lily | **regressed in kind** | D2. |
| A7: extremes margin | **fixed as decided** | Full size: 1,306 set aside, 744 sea. Side effect D9. |
| A9c: homonyms to `hom` | **half** | 12 left (D13). |
| A9d: Kalanchoe × houghtonii | **left** | Still 1 placed cell; honest. |
| B2: credit drift | **fixed** | iNaturalist 1,013 of 1,013 licence, captive and taxon; Commons 50 of 50. |

## Confirmed working

**Names (k pages, 776 sampled).** Heading, author and family equal Kew's entry on 776 of 776. The IPNI link is Kew's record or none on 776 of 776. The native range equals Kew's on 774 of 775.

**Index.** No duplicate names, slugs or GBIF keys. Every index key has its sheet, and the sheets agree with the index on all 48,375 statuses.

**Copies.** 508 `via: 'gbif'` copies plus 11 merged: each copy's key, GBIF key and page agree, and no copy's slug collides with a page's.

**Front page.** "48,375 species · 37,667 with habitat climate", "No climate, 9,773, 934 not asked" (title: "1 pending") and 6,493 genera all equal the index.

**Records.** 110,838 open records on 719 range-tested pages:

- 95.7% strictly inside a native shape, 3.4% by the margin, 0.6% off a coast, 0.36% on an island, 0 outside;
- every page carries r85 and its counts by reason;
- every page's text says "shapes rule r85".

**Climate.** Habitat climate agrees with Kew's climate class on 484 of 491 pages (98.6%). Every "none" or "pending" page gives its reason, and the reason is on the page (152 of 154). The few-records mark matches the counts on 37 of 37.

**Climate changes since round 84.** 29 pages lost a climate, 44 gained one, and 1 went from none to pending.

- **Lost:**
  - 26 fell under the three-cell floor;
  - 2 by the hemisphere split;
  - 1 has no record within 10 km;
  - the border rule rightly took Iraq, Russia and Colombia cells from Iris zagrica, Muscari dolichanthum and Drosera biflora;
  - it wrongly did so for Albuca fastigiata and Begonia faustinoi (D4).
- **Gained:**
  - mostly from cell-first sampling (Aesculus 0 → 469 open, Juglans regia 1 → 293, Lepidium didymum 0 → 387: right);
  - islands rightly regained Veronica bollonsii (Hen and Chickens), Scaevola gracilis (Macauley) and Nepenthes treubiana (Misool);
  - Xeronema regained one in the wrong place (D2).

**The 18 new pages.** Each takes Kew's name, author, family and range. The 14 lumped pages say why their records were not asked. Acaena, Ixia, Nymphaea and Viola have records.

**Licences.** Index credits are 25,569 CC BY, 9,837 CC BY-SA, 5,431 CC0 and 325 public domain. None lacks an author, and none is NC or ND (the one hit is "NC Wetlands", a name).

## Not checked, with why

- **Wikipedia revisions against today's articles.** en.wikipedia answered 429, and Wikimedia rate-limits this sandbox.
- **More than 50 Commons files.** The other 100 got 429.
- **Wikidata.** I could check only 60 of the 120 Kew IPNI ids, and SPARQL was refused with 429.
- **POWO.** Not asked; it refused last round.
- **CHELSA and NASA POWER values.** There is no grid here, so I checked plausibility only, against Kew's climate class.
- **Restricted records, and records the build excluded.** I tested only what GBIF's API returns: at most 300 a page.
- **Photographs viewed by eye.** That is W's area.
- **The about pages' counts.** S's area.

## Needs from the PC

1. **For D4.** Over the download, count the records strictly inside a non-native region whose stated country is a native region's and which lie within 0.02° of a native shape. Give pages and records. List the pages whose climate flips with them admitted, starting with the 29 lost.
2. **For D5.** Count the photographs with `src: 'gbif'`, no `read`, and a `gbif.media` row with an empty detail. Give the download day their media came from.
3. **For D6.** Over *Echinopsis macrogona*'s in-range download records, count them by GBIF `taxonKey` (11093098, 3951733, 5622352, 3952807 and the rest).
4. **For D1.** Confirm Kew's file of 2026-06-04 gives the same 57 "as a cultigen" entries, and list the 31 with a climate.
