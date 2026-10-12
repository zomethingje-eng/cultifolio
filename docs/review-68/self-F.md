# Self-review of rounds 67 and 68: reviewer F (names and search; the harness)

Copy: `/tmp/rv68/F` at commit 1609c19. Node 22.22.2. The live index (`/api/index`, 8,947 species, 4.58 MB) and 300 live dossiers (`/api/dossier/<key>`: a random sample of 200 species with more than one English name, plus the ones named below) were read from cultifolio.com on 11 October and run through this checkout's own `search.ts` and `index-entry.ts` with tsx (scripts in `/tmp/rv68/F/zzF/`). Reproductions that need no network are in `/tmp/rv68/F/tests/unit/zz-rv-F-names.test.ts` (3 cases, all pass, which confirms the faults). Unit tests run: the round 67 and 68 files in my area (86 passed) and the mutation runs below. The whole suite and Playwright were not run.

## Findings

### F1. An older name of two species sends the reader to whichever comes first in the alphabet, and says GBIF accepts it as that one (launch; confirmed live)

- **Where:** `src/lib/server/dossiers.ts:411` (`indexMaps`, `bySynonym`: `if (!bySynonym.has(k))`, so the first entry in index order wins), used by `synonymInIndex` (`src/lib/server/synonyms.ts:48`), then `src/routes/species/[slug]/+page.server.ts:61` (302 with `?was=`) and the banner at `+page.svelte:349`.
- **What it does:** on the live index, 512 binomials are an older name (`syn` or `older`) of two or more species. Before round 67 it was 210 (`syn` only). An address under any of them redirects to the alphabetically first holder, with no word about the other. The page then says "*X* is a synonym: the GBIF backbone accepts this species as *Y*". Round 67's N1 also silently changed where 124 addresses that already redirected now land, because an `older` holder sorts before the `syn` holder.
- **Reproduction (live):**
  - `/species/cereus-undulatus` 302 goes to `/species/acanthocereus-tetragonus?was=Cereus%20undulatus`. The page says "Cereus undulatus is a synonym: the GBIF backbone accepts this species as Acanthocereus tetragonus". Before round 67 it went to Selenicereus undatus, the dragon fruit (the name is in its `syn`; it is in Acanthocereus's `older`).
  - `/species/cotyledon-mammillaris` goes to Adromischus filicaulis. Cotyledon mammillaris is the basionym of Adromischus mammillaris, which is in the reference, and the name is in the `syn` of both. GBIF's own match answers it at genus rank (`matchType: HIGHERRANK`), which means GBIF does not resolve it either.
  - `/species/acer-pulverulentum` goes to Acer campestre, but Acer palmatum holds the name too.
  - Offline: `zz-rv-F-names.test.ts`, case F1.
- **What it should do:** rule 3. A name the index gives to two species is not an unambiguous match, so the index should not answer it. Search already lists both species (as group "Older", in alphabetical order), which is acceptable.
- **Smallest fix:** in `indexMaps`, record a key seen twice as ambiguous (`null`, or the list), and have `synonymInIndex` return null for it. The route then asks GBIF's match service. For these names GBIF answers at a higher rank or not at all, so the page is the 404 whose suggestions come from the search, and those already list both species. Better still, say on the 404 that the name is an older name of two species of the reference, and name them.

### F2. A family typed in part finds nothing of it, or finds another plant by a similar spelling (should; confirmed live)

- **Where:** `src/lib/core/search.ts:423` (`if (p.familyWords.includes(q))`), round 68's whole-word rule.
- **What it does:** the front page searches as the grower types. Every prefix of a family short of the whole word now matches no family member. Counts on the live index, now / with the family matched from its start:

| Typed | Now | From its start |
|---|---|---|
| aizoac | 0 | 505 |
| asparagac | 0 | 1,146 |
| apocynac | 0 | 826 |
| amaryllidac | 0 | 255 |
| asphodelac | 0 | 294 |
| aizo | 5 | 509 |
| amaryllid | 2 | 256 |
| cactac | 1: Colchicum triphyllum, by a similar spelling of its older name "catacuzeni" | 813 |
| iridac | 1: Pseudopanax crassifolius, by a similar spelling | 407 |

- **Reproduction:** the live `/api/search?q=aizoac&shape=2` answers `{"hits":[]}`. `q=cactac` answers Colchicum triphyllum with `near: true`. Offline: case F2.
- **What still works:** "mex" still finds Mexico, the same 1,527 species under both rules. "crassul" finds Crassula through the genus, but not the other 456 Crassulaceae.
- **What it should do:** keep "plant" out of Plantaginaceae (the reason for the change) without breaking a family typed in part.
- **Smallest fix:** match a family from its start once the word typed reaches the family's stem, that is the family less "aceae": `p.familyWords.some((w) => w.startsWith(q) && q.length >= w.length - 5)`. With this rule:
  - "aizo", "crassul", "amaryllid" and "cactac" find their families;
  - "plant" (5 letters, against a stem of 9 in "plantaginaceae") still does not reach Plantaginaceae.
- **Wording to change with it:** `/about/how` ("a family is matched only by a whole word") and the `prepare` comment.

### F3. A standard English name ending in another genus is set back, and a misspelling or a non-grower name heads the page (should; confirmed on live dossiers)

- **Where:** `src/lib/dossier/index-entry.ts:89` (`ENGLISH_USE`, ten words) and `setBack` at lines 239-245.
- **What it does:** a name whose last word is another genus of the reference is set back, unless that genus is one of the ten. Pelargonium's "geranium", Polyscias's "aralia", Carpenteria's "anemone", Vachellia's "acacia", Aloysia's "verbena" and Ruellia's "petunia" are English nouns in the same way "aloe" and "iris" are, but they are not on the list. On the live corpus:
  - **Carpenteria californica** shows **"Tree-anomone"**, GRIN's misspelling. "tree anemone" and "tree-anemone" (two sources pooled) and "bush anemone" are all set back.
  - **Polyscias fruticosa** shows "Teatree" (2 sources) over "Ming aralia" (4 sources).
  - **Polyscias guilfoylei** shows "Coffeetree" over "Geranium aralia".
  - **Pelargonium graveolens** shows "Rose-scent Storksbill" over "Rose geranium", "Rose-scent geranium" and "Sweet scented geranium".
  - **Pelargonium peltatum** shows "Ivy-leaf pelargonium" over "Ivyleaf geranium".
  - **Vachellia farnesiana** shows "Ellington-curse" over "Sweet acacia".
- **Reproduction:** offline, case F3. On the corpus: 47 live dossiers carry such a name. Adding the eight words below to `ENGLISH_USE` changes 16 headlines (`zzF/a9.ts`). 14 of the 16 are what a grower would call the plant. Two are not: Leucanthemum maximum would become "Max chrysanthemum" (from "Shasta daisy"), and Robinia pseudoacacia "False acacia" (from "Black locust").
- **Rule or data:** the rule. The data has the right names, given by as many sources or more.
- **Smallest fix:** add geranium, aralia, anemone, acacia, verbena and petunia to `ENGLISH_USE` and to its list on `/about/how`. Leave out chrysanthemum and hibiscus. Run the audit before the upload.

### F4. `/about/how` describes two naming and search rules as more than they are (minor; confirmed)

- **"Then GBIF's own order" is the alphabet.** GBIF lists vernacular rows in code-point order: capitalised spellings first, then the alphabet.
  - In the sample of 200 live species with more than one English name, the headline was decided by that order alone (a tie on tier, sources and preferred) for 58 (29%), against 127 by sources and 11 by the preferred flag.
  - Examples a grower would question:
    - Kroenleinia grusonii is "Barrel cactus" over "Golden barrel cactus": five Catalogue of Life rows, one source, so a tie.
    - Crassula arborescens is "Jade Plant".
    - Tradescantia virginiana is "Spiderwort" over "Virginia spiderwort".
  - The same tie carries into search. "jade plant" answers Crassula arborescens before Crassula ovata, because both headlines are exactly the query and the alphabet decides. The index does not carry the source count that would tell them apart.
  - Fix: say "then the alphabet, as GBIF lists them". If the order should be better, carry each headline's source count in the index and order exact headline matches by it.
- **The example "Zebra plant" is not what the site shows.** A hyphen counts as "open" in `casedSpelling`, and the hyphens are then chosen by count. So Aphelandra squarrosa shows "Zebra-plant", and Agave americana "Century-plant" (where "Century plant" exists). The words should say "open or hyphenated".
- **The search order on `/about/how` leaves out one step.** Before the alphabet, a common-name hit whose headline holds every word comes first (`closeness` returns 3). It is a small gap, but the page claims to be exact.

### F5. Round 68's script wiring has no test: four reverts in `scripts/build-dossiers.ts` and one guard in `viaOlderNames` leave the suite green (should; confirmed by mutation)

Each revert below was made alone in my copy, and the named files were run.

| Revert | Test files run | Result |
|---|---|---|
| `mwWait.tries = MAXLAG_TRIES` → `1` (the script would never wait out a lag again) | r68-builder, r68c, r67n-builder, r68d (44 tests) | not caught |
| `prevIds: readPrev(j.key)?.ids` → `undefined` (the previous build's identifiers never kept) | r68-builder | not caught |
| the gbif-open loop's `if (askedOpen(d)) continue` removed (the fill no longer resumes) | r68b, r68d, r68-builder | not caught |
| the commons loop's `if (!wantsCommons(d)) … continue` removed (every dossier asked again) | r68d, r68b, r68-builder, r67n-builder | not caught |
| `viaOlderNames`: a homonym among the older names skipped (`continue`) instead of ending the lookup (`return null`) | r68b | not caught |

- **What the tests do instead:** they test the helpers (`mwGet` with `tries` set by the test's own `beforeEach`, `buildDossier` with `prevIds` passed in, `askedOpen` and `wantsCommons` called directly). The lines that put them to work are in the script, and no test imports them.
- **Why the last row matters:** `/about/how` says a range is taken only when the older names lead to exactly one accepted Kew entry. Skipping an unresolved homonym can turn two entries into one.
- **Smallest fix:** move the fill loops and the per-species build options into a function in `src/lib/dossier/` that the script calls and a test can drive with a fixture fetcher and two dossiers, as `fillCommons` already is. Add a guard case to r68b: one older name a homonym, another resolving, gives no range.

### F6. The Worker's search cache key was not moved for round 68's change of answers (minor; suspected, by reading)

- `src/routes/api/search/+server.ts:57` keys answers `search6?c=<corpus>&n&q`. The comment says `search6` was introduced so that answers kept before round 67's rules are not served.
- Round 68's family rule changed answers ("snake plant", "plant"), but the key stayed `search6`. The key holds no build, so a deploy that changes ranking under the same corpus id serves the old answers for up to a day.
- Round 68 seems to have gone up with a new corpus, so the live site is probably not affected. The step is manual and was missed once.
- **Fix:** put a constant search-rules version, or the build, in the key, and bump it with any change to `search.ts`.

## Mutation checks asked for (Part 2)

| Revert | Test file | Result |
|---|---|---|
| Extension tested on the raw address (`ii.url`) in `commonsPhotos` | r68d-commons | caught (5 fail) |
| P566: basionym's item not set aside | r68c-same-type | caught (1 fail) |
| `sameTypeNames` returns all rows; or every species-rank row | r68c-same-type | caught (3 fail each) |
| Family matched from its start in `rank()` | r68b, r67n-search, search, r63n-search-near | caught, by one case only ("snake plant") |
| `viaOlderNames` uniqueness (`size !== 1` → `< 1`) | r68b | caught (1 fail) |
| `viaOlderNames` homonym guard | r68b | **not caught** (F5) |
| `askedOpen` always false | r68b | caught (1 fail) |
| The script's use of `askedOpen` | r68b, r68d, r68-builder | **not caught** (F5) |
| `askedCommons` always false; or forgetting the "given photographs" case; or `wantsCommons` without it | r68d | caught (2, 1 and 1 fail) |
| The script's use of `wantsCommons` | r68d, r68b, r68-builder, r67n-builder | **not caught** (F5) |
| `mendCommonsThumb` without the width check; or mending an unknown width | r68d | caught (2 and 1 fail) |
| `CLOSED_HEADS`: every compound shown open | r67n-names | caught (the Milkweed and Nannyberry guard) |
| `mwGet` never waits | r68-builder | caught (2 fail) |
| The script's `mwWait.tries = MAXLAG_TRIES` | r68-builder, r68c, r67n-builder, r68d | **not caught** (F5) |
| `buildDossier` ignores `prevIds` | r68-builder | caught (1 fail) |
| The script passes no `prevIds` | r68-builder | **not caught** (F5) |

- **The Commons fill's output on the species page:** no unit test takes `commonsPhotos` or `fillCommons` output through the page's load and checks the credit shown (author, licence, "via Wikimedia Commons", the link to `page`) together with the address loaded. What exists is in pieces:
  - r68d checks the photo's shape and `showable`;
  - r63c checks `tileCreditOf` on a Commons attribution;
  - corpus-r60 loads a species page whose lead photograph is an 800-pixel Commons one of the old shape and checks the address of the lead;
  - r68d checks the mend in `safeUrls`.
  - The fixture corpus has no Commons photograph, so the e2e suite does not see one either.
- **`tests/e2e/r67h-budget.spec.ts`** (read, not run):
  - Every selector it uses exists in the code: `#try-sample` on /plants, `#water-now`, the `#imp-*` controls, `.seccount`, and "See them on My plants".
  - The example still has 12 plants (r60f-demo).
  - The budgets match `REVIEW-ROUND-67.md` section 6: 1,400, 60, 20, 70 a plant with 60 after, and 40.
  - One small slip: budget 5's comment calls its 45 rows "a note on each of 45 plants' logs". They are 15 water events of three fields each.

## Checked and found sound

- **Triage N1:** `older` is in the live index (15,791 names on 2,125 species), in the postings and in `bySynonym`. "Ferocactus glaucescens" answers Bisnaga glaucescens and "Neolloydia conoidea" answers Cochemiea conoidea first.
- **N2:** "snake plant" answers Dracaena trifasciata alone, "cape aloe" answers Aloe ferox first and "natal plum" answers Carissa macrocarpa first.
- **N3:** sources rank before preferred; generic nouns and the species' own binomial are set back.
- **N4:** the offline fetcher writes `skipped`, `indexDrops` exists, and so does `--keys`.
- **N5 to N7:** `nameKey`, the capitals rule (small words are not counted as lower case, as the round decided), and the comma inside brackets in `namesOf`.
- **N8:** exact, then whole words, then the alphabet; near hits by distance; the retry refuses to cut at a small word. "Lily of St. James" is not cut.
- **N9:** `nameFlags`.
- **N12:** the Ceropegia sentence is on `/about/how`.
- **N10 and N13:** not re-checked (N10 was kept as it was; N13 is CSS).
- **Round 68's open-compound narrowing:** on live dossiers, "Milkweed" stays whole, "Zebra-plant" and "Water-lily" open; "Eggplant" and "Leadplant" stay closed, since no source writes them open.
- **The documented search examples** all answer as `/about/how` says, on the live index: "fig", "cop", "Opuntia longispina", "Black eyed Susan", "onion", "Aloe Verra", "Echeveria Lola", "Lily of St. James" and "String of pearls.".
- **The cost of the 15,791 older names** (on the live index):
  - the index grows 8.6% (4.21 to 4.58 MB) and the postings 7% (3.41 to 3.65 MB);
  - `short.json` grows about 2%;
  - of the 1,332 one- and two-character keys, 151 change their 100-hit answer, 63 their first ten, and 16 that were empty now answer;
  - older-name hits rank in the last group with places, so they never displace a name;
  - two one-letter words charged as a whole-index search: 197 of 676 before, 226 after.
  - None of this is a problem.
- **The index's headline is the page's:** `nameEntries` and the species page use the same genera.
- **`/about/how`'s naming paragraph against `englishNames` and `casedSpelling`:** it matches the code apart from F3's list and F4.
