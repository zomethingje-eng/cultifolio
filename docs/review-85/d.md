# Deep review after round 84: reviewer D (the data)

**Verdict: works with faults.** I checked live corpus `8520c2875b2699ba` (Worker `63ab1f88`) against Kew's file, iNaturalist, Wikidata and GBIF. The rules round 84 set out to enforce hold at the sizes I could measure:

- every `k` heading but one is Kew's accepted name;
- every sampled range equals Kew's;
- no open record lies outside its native regions;
- every range-tested page is stamped `r84`;
- every set-aside cold floor names its true cause;
- every photograph checked is the observation, licence and taxon it claims to be.

Four faults should be fixed before the public sees the site. Three of them come from round 84 itself:

- **The San Pedro fix runs against Kew (D1).** It sends Kew's own accepted *Echinopsis pachanoi* to *Echinopsis macrogona*. The same mechanism files 859 Kew-accepted species names under other species.
- **Every renamed page states a falsehood about Kew (D2).** About 500 pages, 280 of them stapeliads or Anacampseros, say "Kew holds *Hoodia alstonii* as a synonym of *Hoodia alstonii*".
- **Renamed pages keep answers asked under GBIF's old name (D3).** That is why 75% of the renamed stapeliads and Anacampseros have no photograph.
- **The 0.05° buffer still admits records from another country's land (D4).** This happens on about 1% of climates, Aloe vera's among them. The PC's check cannot see this by construction.

## Scores

- **Data quality: 7/10** (internal 7, outside 6 and 5 at round 83).
  - **Why 7.** Names, ranges, records, licences, photograph identity and the extremes' causes are right at measured rates of 99 to 100%.
  - **What holds it back.** D1, D3 and D4 are rule-level, each touching hundreds of pages, and fall on the owner's groups.
  - **What makes it 10.** The infra names filtered against Kew, a page for *Echinopsis pachanoi*, the renamed pages re-asked online, and the border rule.
- **Honesty of the data claims: 6.5/10.**
  - **What holds.** "Not checked", "from few records" and the extremes' causes are honest everywhere I looked.
  - **What does not.** The range note is false on about 500 pages (D2). The prompt's "Echinopsis macrogona, which is Kew's name for San Pedro" is false by Kew's own file. DEPLOY's claim that k2734813's old address still leads to the page is false (it answers 404). /about/how's "up to 900 records a key" is false of the walk (D11).
  - **What makes it 10.** D2 fixed and those three sentences corrected.

## What I covered

- **Dossiers:** 906 live dossiers (`/api/dossier/<id>`).
  - **Repeat sample:** 614 repeat the round-84 D sample (seed 84), compared field by field with the copies of 29 October in `rev84r/D-s/dos/`. That sample covers:
    - the 50 most grown and 44 named owner pages;
    - 45 cacti, 40 other succulents, 35 bulbs and 15 geophytes;
    - 25 orchids, 15 carnivorous, 20 trees, 22 crops and herbs, 12 aquatics, 12 ferns and 8 foliage plants;
    - 15 hybrids, all 14 `g` pages and the 10 kept merged pages;
    - every continent.
  - **New strata (seed 85):**
    - 67 pages whose heading changed (42 stapeliads, Anacampseros, Talinum, Drimia and Sarcocaulon; 25 others), plus 5 already in the repeat sample, so 72 in all;
    - all 101 pages whose climate changed (90 lost, 11 gained) and Xanthoceras;
    - 10 pages for each cause of extremes set aside, and 6 set aside for sea;
    - 10 more "from few records";
    - 30 border candidates (Oman, the Gulf States, Lesotho, Swaziland, Gambia, Belgium and others);
    - 30 island-only species;
    - 8 `hom` pages and 5 spellings;
    - 7 named extras.
- **HTML:** 176 species pages, the front page, 86 old addresses (75 old headings and the 11 merged names) and 2 further old addresses.
- **Whole corpus:**
  - `/api/index` once, saved to `inputs/index.json` for S;
  - all 48,357 sheets (`/api/sheets`, 64 requests);
  - both indexes (29 and 31 October) compared entry by entry.
- **Primary sources:**
  - **Kew's WCVP file** (`r73data/bulk`, of 2026-06-04, the build's) against all 48,343 `k` headings and against the 885 sampled pages' names, authors, families and ranges.
  - **iNaturalist:** 789 photographs on 622 pages against their observations, 247 taxa, and 13 taxon and observation look-ups.
  - **Wikidata:** 282 items, in one SPARQL query.
  - **GBIF:** the backbone and WCVP-on-GBIF for San Pedro, and 300 records of *Pelargonium rapaceum*.
  - **The range rules at full size of the sample:** the code's own `regionTester` and `cellTester` (`ts/geo.mts`), run over all 125,095 open records and 628 typical cells.
- **Requests:**
  - **cultifolio.com:** 1,241, at least 0.85 s apart (median 1.18 s), no 429.
  - **Third parties:** 55 — iNaturalist API 50 (2.1 s apart), GBIF 3, Wikidata 1, POWO 1 (answered 403 with a Cloudflare challenge).
  - **User agent:** every request went as `cultifolio-review/85 (https://cultifolio.com)`.
- **Scratch:** `/tmp/claude-0/rev85r/D-s/`.
  - **Scripts:** `analyse.py`, `htmlcheck.py`, `infracheck.py`, `inat.py`, `ts/geo.mts`, `sample.py`.
  - **Outputs:** `faults.json`, `htmlfaults.json`, `geo.json`, `infra-bad.json`, `infra-accepted.json`, `climchange.json`, `headchange.json`, `redir.tsv`.

## Issues

### D1. Major: the San Pedro fix sends Kew's accepted *Echinopsis pachanoi* to another species, and the same mechanism files 859 Kew-accepted species under other pages

- **What I did.** For every search-only name the index added in round 84 (`name.infra`, read from GBIF's 2023 backbone export: 6,112 names, 1,876 of them on 129 sampled dossiers), I looked up every Kew row of that name.
- **What I saw: San Pedro.**
  - Kew's file holds *Echinopsis pachanoi* (Britton & Rose) H.Friedrich & G.D.Rowley as **Accepted**: plant_name_id 2783547, native Ecuador and Peru. *Trichocereus pachanoi*, *Cereus pachanoi*, *Trichocereus macrogonus* var. *pachanoi* and subsp. *sanpedro* are all Kew synonyms **of it**.
  - WCVP's own checklist on GBIF (dataset f382f0ce) agrees: *Echinopsis pachanoi* ACCEPTED, *Trichocereus pachanoi* its SYNONYM.
  - *Echinopsis macrogona* (2783497) is another Kew species: "W. & S. Peru to Bolivia", with *Trichocereus peruvianus* among its synonyms.
  - **The reference has no page for *E. pachanoi*.** It is absent from `scripts/species-list.txt`.
  - Echinopsis macrogona's `name.infra` holds *Echinopsis pachanoi*, *Cereus pachanoi*, *Echinopsis santaensis*, *E. schoenii*, *Trichocereus schoenii* (all Kew synonyms of *E. pachanoi*) and *Echinopsis chalaensis* (Kew-accepted). So typing Kew's name for San Pedro leads to the Peruvian torch.
  - *Trichocereus pachanoi* itself is in no page's names in the live index; whatever finds it does so by another reading (S's area).
- **What I saw: the class, over the whole index.**
  - 859 Kew-accepted species names with no page here became search names of another species, on 607 pages. No Kew row of these names leads to those pages. Examples:
    - *Kalanchoe montana* → Kalanchoe luciae;
    - *Sempervivum guillemotii* → Sempervivum tectorum;
    - *Strophocactus brasiliensis* → Pilosocereus brasiliensis;
    - *Hoya lactea* → Hoya australis;
    - *Vigna stipulacea* → Pueraria montana.
  - 1,296 more are names Kew holds only under another page's species. 1,292 of those are also held by the Kew-right page, so the name now leads to two pages where Kew names one.
- **What should happen.** A name Kew's file accepts, or holds under another accepted taxon, is never a search name of this page (rule 3; Kew is the stated authority). *Echinopsis pachanoi* should have a page of its own. The reference holds 1,688 iNaturalist cultivated observations for *T. macrogonus*, most of them San Pedro.
- **Where.** `src/lib/dossier/infra-names.ts`. It drops only "another page's accepted name" (N's report); it should test against Kew's file.
- **Smallest fix.**
  - Filter `name.infra` by Kew's file: keep a name only when every Kew row of it leads to this page's entry, or when Kew has no row of it.
  - Add 2783547 to the species list and derive its page.
  - Correct the claim in the review prompt and DEPLOY.

### D2. Major: about 500 renamed pages say Kew holds the page's own name as a synonym of itself

- **What I did.** I read the "Range source" line on the 30 renamed pages among my HTML.
- **What I saw.**
  - 28 of 30 say, for example, "Kew holds Hoodia alstonii as a synonym of Hoodia alstonii (N.E.Br.) Plowes; the range is that entry's" (`/species/hoodia-alstonii`, `/species/caudanthera-edulis`, Orbea deflersiana, Huernia aspera, Stapelia surrecta, Scabiosa atropurpurea…).
  - The other two now say things that are untrue because the heading is Kew's own:
    - Clematis armandi: "Kew spells this name otherwise, by the same author";
    - Conophytum calculus subsp. vanzylii: "…by another author than the one this page cites".
  - **Rate.** 73 of 73 renamed dossiers in the sample carry a `distribution.via` of `synonym-of` (67), `spelling` (5) or `kew-entry` (1), derived under GBIF's name. So about all 500 renamed pages, 280 of them stapeliads or Anacampseros, carry a false sentence about Kew.
- **Where.** `src/lib/ui/ref/notes.ts:56-62`, `rangeNote`. It writes `name.scientific`, which round 84 made Kew's name, into a clause built for GBIF's.
- **What should happen and the smallest fix.** Write the name the range was reached by: `name.gbif.scientific` where present, else `v.name`. Drop the clause when `v.entry` begins with the heading. This is a Worker-only fix.

### D3. Major for the owner's groups: renamed pages keep iNaturalist, Wikipedia and Commons answers asked under GBIF's old name, so most renamed stapeliads show no photograph

- **What I saw.**
  - 276 of the 501 renamed pages have no photograph (55%, against 15% over the corpus). Among the 280 renamed stapeliads and Anacampseros, 210 have none (75%).
  - In the sample, 37 of 72 renamed dossiers have `inat.taxon: none`, "carried from build of 2026-10-22 … no iNaturalist taxon of exactly this name". The rate on other pages is 34 of 827 (4%). Wikipedia is "none" on 60 of 72.
  - iNaturalist holds 8 of 10 names I tried under Kew's name, all active:
    - Duvalia elegans: 40 observations;
    - Huernia transvaalensis: 39 observations, 7 of them openly licensed;
    - Hoodia flava: 23 observations;
    - also Orbea ciliata, Stapelia divaricata, Huernia humilis, Duvalia sulcata and Huernia hallii.
- **Why.** The walk was offline (`--offline`), so the taxon and photo lookups were carried. N's heading was put on after derivation, and nothing asked the sources again by the new name.
- **What should happen.** A page whose heading changed is asked again online by its new name.
- **Smallest fix.** Run `--keys` online (without `--skip inat`) over the 501 renamed pages, then `--index`.

### D4. Major: the 0.05° buffer admits records on another country's land; about 1% of climates have their typical cell there, and the walk's check cannot see it

- **What I did.** I used the code's own testers to class every open record and every typical cell:
  - strictly in a native shape;
  - only within the 0.05° buffer;
  - only by the coast rule.

  For each point not strictly inside, I found any region whose land strictly holds it. I also compared GBIF's country code with the native regions' countries (TDWG level 4).
- **What I saw.**
  - **Records.** Of 125,095 open records on 867 range-tested pages:
    - 116,925 (93.5%) are strictly inside;
    - 7,097 (5.7%) only by the buffer;
    - 1,073 (0.86%) only by the coast rule;
    - 0 outside.

    210 buffer-admitted records (0.17%) lie on a non-native region's land, on 82 pages (9.5%).
  - **Typical cells.** 6 of 628 pages with a climate (1.0%) have their cell's middle on a non-native region's land, all admitted by the buffer. In the repeat strata the rate is 5 of 466 (1.1%; 95% interval 0.35 to 2.5%, so roughly 130 to 940 pages at full size). The six:

    | Page | Typical cell | On the land of | Native | Proof |
    |---|---|---|---|---|
    | Aloe vera (top 50) | 25.325, 56.325 | Gulf States | OMA | the coordinator's (Sharjah) |
    | Drosera biflora | 3.725, −67.575 | Colombia | VEN | the open record in the cell is GBIF country CO |
    | Muscari dolichanthum | 43.525, 40.025 | North Caucasus | TCS | 2 of its 4 records are RU; a climate **gained** in round 84 |
    | Dracaena trifasciata (snake plant) | −2.475, 28.875 | Rwanda, 2 km from Bukavu | ZAI and others | records restricted |
    | Iris zagrica | 35.925, 45.575 | Iraq | IRN, TUR | records restricted |
    | Stellaria corei | 39.125, −84.825 | Indiana | OHI, KTY… | records restricted |

  - **Why the PC's check shows 0.** `cellTester` grows the buffer by 0.036°, so "0 typical cells outside a native region" is true by construction and measures nothing of this class.
- **What should happen.** The queued border rule: a record admitted only by the buffer or the coast reach, whose GBIF country is not a native region's, is left out.
- **Also.** `--check-ranges` should report cells whose middle lies on a non-native region's land, so the count is seen.

### D5. Minor: 14 of the 500 old headings' addresses answer 404, among them the areca palm's

- **What I saw.**
  - 73 of 75 sampled old addresses answer 302 to the right page with `?was=` (`redir.tsv`); the other two are ceropegia-edulis and conophytum-calculus-vanzylii, below.
  - From the index, 14 of 500 renamed old addresses no longer lead to their page:
    - 12 are held by two or three pages;
    - 1 by design (Ceropegia tanzaniensis);
    - 1 is k2734813's.
  - **Checked live:**
    - `/species/dypsis-lutescens` answers 404, "older name of two species". Kew holds *Dypsis lutescens* only under Chrysalidocarpus lutescens; the second holder, Hyophorbe indica, holds it only through GBIF's synonymy.
    - `/species/erythrina-caffra` answers 404 (three GBIF holders; Kew has no row of that name).
    - `/species/ceropegia-edulis` answers 404.
    - `/species/conophytum-calculus-vanzylii` answers 404 "No species page", although DEPLOY says the address "is moved by GBIF's name service".
- **Fix.** Where Kew's file leads the name to exactly one page, redirect there. Keep the 404 only when Kew itself is ambiguous (Ceropegia juttae). On a 404 for an address that was a page's own heading until 31 October, say so.

### D6. Minor: 11 of the 14 `g` pages keep GBIF's heading where their own Kew entry spells or places them otherwise; the Huernia row is still split

- **What I saw.**
  - Kew writes these names otherwise:
    - Tylecodon cacaliodes (Kew: cacalioides);
    - Ceropegia hadramautica (Kew: *Huernia hadhramautica*);
    - Ceropegia marnierana (Kew: *Huernia marnieriana*);
    - Harpephyllum caffrum (Kew: afrum);
    - Handroanthus impetiginosum (Kew: impetiginosus);
    - Cyphostemma degraerii and Dorstenia poinsettifolia (Kew: degraeri, poinsettiifolia);
    - Ceropegia linophylla and C. ananthapuramensis (Kew: linophyllum, ananthapuramense).
  - Decision 1 covered `k` pages only, so two Huernia stay under Ceropegia.
  - One `k` heading, Delphinium barlowii, lacks the × of Kew's artificial hybrid.
- **Fix.** Head a `g` page by the Kew entry its range note names, when the note is `spelling` or `synonym-of`.

### D7. Minor: autonym headings stand for species that have no page

- **What I saw.**
  - Five `k` pages are keyed on infraspecific entries, four of them stapeliads.
  - Two are autonyms built from GBIF's heterotypic synonyms:
    - Stapelia hirsuta var. hirsuta, from *Ceropegia pulvinata*;
    - Huernia barbata subsp. barbata, from *Ceropegia clavigera*.
  - *Stapelia hirsuta* and *Huernia barbata*, both widely grown, have no species page. Each page's records and photographs are of the narrower GBIF concept.
- **Fix.** Owner's decision: head these pages by the species, or say on the page that the records are those of the synonym.

### D8. Minor: 39 climates show months from one hemisphere and a typical spot in the other

- **What I saw.** In the sheets census, 26 pages have a spot south of 10° S with the coldest month December to March, and 13 have a spot north of 10° N with the coldest month June to September.
  - Physalis viscosa: spot 20.8 N, coldest month July, no `hemispheres` record.
  - Solanum schlechtendalianum: spot 17.8 S, coldest month January.
- **Where.** `src/lib/climate/provider.ts:191-197`. The split happens only when the smaller side has at least 3 cells and a fifth of them. Otherwise its cells stay in the median and can supply the typical cell, whose extremes are then checked against months of the other side.
- **Fix.** Draw the typical cell from the larger side, or always leave out the smaller side's poleward cells.

### D9. Minor: the coast rule is sound, but low-precision records are drawn at sea

- **What I saw.** 1,073 records (0.86%) on 178 of 867 pages are admitted only by the coast rule.
  - 1,071 carry a GBIF country of a native region.
  - None sets a typical cell.
  - Of the 11 climates gained, 8 come from islands (Juan Fernández, Chatham, Norfolk, Ogasawara, Coronado, Desertas…). All are plausible and marked "from few records".
  - **The weakness is the map.** Acanthocereus oaxacensis shows 172 of its 423 records 5 to 17 km off Huatulco, at obscured or rounded positions.
- **Verdict.** The rule is defensible. Optionally mark records at sea on the map.

### D10. Minor: every range-tested page now prints the shapes file's metadata

- **What I saw.** 162 of 162 such HTML pages print "…by TDWG's tblLevel3.txt, tblLevel4.txt and tblGazetteer.txt (WGSRPD second edition); Douglas-Peucker 0.02 degrees; coordinates in thousandths of a degree, [lon, lat]; shapes rule r84". The last clauses describe a file format, not the page.
- **Fix.** Use short words: "Natural Earth's provinces, placed in TDWG's regions (shapes rule r84)".

### D11. Minor: /about/how's record counts are untrue of the walk

- **What I saw.**
  - /about/how line 172 says extra keys are "asked of GBIF on the day of the build (up to 900 records a key)". In the sample, 47 of 83 extra-key reads came from the download, 12 above 900. Ferocactus hamatacanthus holds 2,000 of Bisnaga hamatacantha's.
  - The 2,000-record uniform sample per key (`bulk.ts:593`) is said nowhere.
- **Hand to S.**

### D12. Minor: doubtful climates remain, and decision 6's re-read gives this

- **Hibiscus syriacus (top 50).**
  - Its climate comes from 3 records in eastern Taiwan: coldest month low 15.3 °C, 1-in-100 night 11.4 °C, 3,294 mm.
  - Kew's own class for it is "temperate".
  - The page is marked "from few records". It was the same on 29 October.
- **Decision 6's three, after the walk:**
  - Haemanthus pumilio: unchanged (1,856 mm at 139 m).
  - Echinopsis cuzcoensis: unchanged.
  - Cedrus deodara: moved to 30.5 N 78.0 E, 1,715 m, extremes now set aside.
- **Agreement with Kew's climate class.** 604 of 610 pages (99.0%). The exceptions are Euphorbia milii, Echinopsis bruchii, Hibiscus syriacus, Vincetoxicum sui, Solanum lycopersicum and Blechnum fluviatile.

### D13. Minor: smaller data residue

- **Generic names (D9 of round 84, half fixed).** "Beet" still heads Patellifolia procumbens, and "Chestnut" heads Pochota fendleri. The genus rule cannot see names shared across genera. Pochota fendleri also carries the fragment "Guiana" as a common name.
- **Stale flags and credits.**
  - 3 of 789 checked photographs (0.4%) are now captive or casual on iNaturalist but shown as wild: Eucomis comosa 715055189, and Rosa chinensis 698300243 and 698250050.
  - 4 credits carry an observer's former display name.
- **A parse fault.** Hereroa incurva's `name.genus` is "Schwantes" (the author read as the genus). It is not shown.
- **Indigofera taiwaniana.** Its records are now in range (9 open, 10 restricted), but it still has no climate: only 1 cell is placed within 10 km. The page is honest. DEPLOY (e) promised "and a climate", and the check's "fixed:" counts only the range.

### The 79 pages that lost a climate

"79" is a net figure: 90 pages lost a climate, 11 gained one, and Xanthoceras went from none to pending. `climchange.json` lists all 101; the full table is in `analyse.out`.

- **Why each lost it:**
  - 79 fell under the three-cell floor ("only 1 or 2 distinct land cells … placed to within 10 km");
  - 9 now have no record placed within 10 km;
  - Echeveria canaliculata has no record in range;
  - Monsonia lheritieri lost its range by rule A6b.
- **What they have in common.** 84 of the 90 have a native region that was a box before round 84 (China's four regions, Japan, the Cape, Mexico). 80 of the 90 were already "from few records".
- **Is it right?** Yes, where I could test it:
  - Bambusa oldhamii's old climate (79 records at 23.3 N) came from Taiwan, which Kew holds as introduced;
  - Lonicera acuminata's came from Taiwan, which is not in Kew's range;
  - Ginkgo biloba's two lost cells lie outside Kew's single native region, CHS (its old cell at Shanghai remains, alone);
  - Pelargonium rapaceum's iNaturalist records all state about 29 km uncertainty (GBIF, 300 records), so the 10 km rule rightly refuses them.
- **The growers' cost.** It falls on grown plants: Ginkgo biloba (top 50), Rosa chinensis, Chrysanthemum × morifolium, Paeonia × suffruticosa, Saccharum officinarum, Setaria italica and Pelargonium rapaceum. Every page says why, truthfully, in the sampled HTML (25 of 25).

## The round-84 reviews' findings in my area

| Finding | Status | Evidence |
|---|---|---|
| D1 / S1 / A3 wrong extremes reason | **fixed** | 31 of 31 set-aside pages give the right tag. Full size: 1,052 elevation, 868 warm-night, 39 record-low (with warm night); 0 without a cause. |
| D2 / A2 / W1 box regions | **half** | Shapes 366 and 3 boxes; 0 open records outside; Galanthus and Melissa cells now inside. The buffer admits foreign land (D4). |
| A1 / B1 Aloe vera, Ficus elastica | **half** | Ficus elastica's cell is now in Java (native per Kew). Aloe vera's is at Madha/Sharjah by the buffer (D4; queued). |
| A2 Indigofera taiwaniana | **half** | Records in range; still no climate (10 km rule). |
| D3 Kew's names | **fixed for `k`, half overall** | 48,342 of 48,343 headings are Kew's (Delphinium barlowii lacks ×). `g` pages are not covered (D6). Display regression (D2) and stale sources (D3). |
| D4 Xanthoceras | **fixed** | Now "not checked", no carried records. |
| D5 hybrids' Kew links | **fixed** | 0 of 885 Kew-compared pages lack POWO or IPNI. |
| D6 untrue data sentences | **fixed** | 162 of 162 pages name rule r84; all 867 range-tested dossiers carry `rangeRule: r84`; Ferocactus hamatacanthus reads "the GBIF key of a page merged into this one". |
| D7 default points | **decided** | Not re-measured. |
| D8 weak leads | **half** | The size floor holds at display (Nepenthes thorelii shows the 1,621 px file). Content is not judged by any rule. Not viewed this round. |
| D9 generic names | **half** | Fig, Ginger and Tobacco fixed; Beet and Chestnut left (D13). |
| A4 summary cut | **fixed** | Euphorbia × martini ends "…" with `cut`; 0 of 497 summaries end mid-sentence unmarked. |
| A6a, A6c, A6e, A6f | **fixed** | Checked on Cylindropuntia fosbergii, Weingartia fidana, Ferocactus hamatacanthus and the record-count words. |
| A6b Monsonia lheritieri | **fixed as designed** | Range and climate gone. |
| A8 San Pedro | **regressed in kind** | See D1. |
| A10 "not checked" repeated | **fixed** | Abies marocana says it once per source (3); pending pages 1 to 2. |
| Doubtful climates (decision 6) | **left** | See D12. |

## Confirmed working

- **Names.**
  - 48,342 of 48,343 `k` headings equal Kew's name for the page's entry.
  - On 885 Kew-compared pages, the author equals Kew's on all 885, and the native and introduced ranges equal Kew's file on all 885.
  - The family differs only on 10 (GBIF's fern families, Stixaceae, Cordiaceae).
  - No duplicate names, slugs or GBIF keys.
  - All 25 `hom` targets without a page are the same names written without the × of a hybrid page.
- **Merges.** All 11 merged addresses answer 302 to the right kept page with `?was=`. 73 of 75 sampled old headings redirect rightly (the two others in D5).
- **Records.**
  - 125,095 open records: 0 outside, 0 living specimens, all open-licensed.
  - Every sampled dossier was built 30 or 31 October (904 of 904).
  - The sheets agree with the index on all 48,357 statuses.
- **Climate at full size.**
  - 37,648 ok, 4,819 from few records.
  - Of 34,950 pages showing extremes, 0 show a record low or 1-in-100 night above the coldest mean low, and 0 show a correction over 1,000 m.
  - The few-records mark matches the counts on 42 of 42 HTML pages.
  - Typical-cell elevation agrees with the quoted altitude on 8 of 9 pages that state one.
- **Photographs.**
  - 789 of 789 are the photograph of the cited observation, with the same licence and the page's taxon or below.
  - All 247 iNaturalist taxa are active.
  - Corpus credits are all CC0, public domain, CC BY or CC BY-SA, with an author.
- **Wikidata.** 279 of 282 items carry the heading or an older name; the other 3 carry the ×-form. None is a wrong item.
- **The front page.** The counts (48,357; 37,648; 9,789 and 920 not checked) equal the index. "Popular genera" 8,240 equals the rule recomputed (117 genera). All 58 genus rows match. The strip is now grown plants (Ficus carica, Aloe vera, Pelargonium inquinans, Lagerstroemia indica…).

## Not checked, with why

- **Commons photographs and POWO.** POWO answered a Cloudflare challenge; I made no Commons requests.
- **CHELSA and NASA POWER values.** There is no grid here; I checked plausibility only.
- **Restricted records' positions** (D4's three restricted cases).
- **Lead photographs viewed by eye.**
- **The maps' rendering, search ranking and the about pages line by line.** These are W, P and S's areas. D1 and D11 are handed to S.

## Needs from the PC

1. **For D4.** Over `static\s\v3\*.json`, count the pages whose `climate.at` lies strictly inside a non-native region's shape (`regionTester(file,0,0)` over all regions). Then count the pages whose climate cells hold records admitted only by the buffer or the coast reach with a GBIF `countryCode` that is not a native region's. The restricted records' countries are in the download.
2. **For D1.** Count the `name.infra` names that Kew's file holds as an accepted species, or under another accepted taxon. My index-side figures are 859 and 1,296. Paste the `species-refused.txt` or iNaturalist line for *Trichocereus macrogonus* var. *pachanoi* / *Echinopsis pachanoi*.
3. **For D3.** List the renamed `k` pages whose `inat.taxon`, `wikipedia` or `commons` detail says "carried from build of 2026-10-2x".
