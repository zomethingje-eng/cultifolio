# Round 73, L: photographs

Branch `r73` in `/tmp/claude-0/rev73/L`, four commits on `r73base` (1b3ff50, 48adfde, 77a5325, a1b8dd8). Scripts and outputs are in `/tmp/claude-0/rev73/L-work/`; the dry-run copy is `/tmp/claude-0/rev73/L-s/`. Every count reads the corpus as the page does: `parseDossier(json, heldNamesOf(index))`, `showable`, `heroOf` (`L-work/audit.mts`; the index's tile agrees on all 8,947 pages).

## Done

**L1. A bare epithet of a sister species, as the only name in a title, reads as that species** (`photo-kind.ts`, `sisterEpithetOnly`). Where a title reads no binomial and holds none of the species' own epithets (`epithetRank` 2), a word that is the epithet of another species the reference accepts in one of the species' own genera makes the file "named as another species". Over the whole corpus this catches one file: "Heterodoxa pt12", Heliamphora purpurascens' only photograph and lead. A sweep of every shown Commons file for such words (`L-work/bare.mts`) found no other such title. Guards: "Benstonei domei" on Nepenthes domei, "Nbenstonei", Gardenology numbers, and no reference names known.

**The description outweighs the title (a1b8dd8, the coordinator's refinement).** "Heterodoxa pt12"'s own Commons description reads "Heliamphora heterodoxa 'Ptari Tepui' (now known as Heliamphora purpurascens)". The rule no longer hides a file whose description names the species under one of its own names (`describesSpecies`, read with the title rules). The answer is stored as `Photo.described`, true or false. The build reads it from the answer it already has. `--fill commons-kind` reads it once, only for files the rule would hide (`descriptionToRead`). Until it is read, the file stays out. I left out an exception by category on purpose: every file the build takes sits in the species' own category, so a category exception would void the rule. After the fill the rule hides 0 files in the corpus, and Heliamphora purpurascens leads with "Heterodoxa pt12", as it does live.

**L2. A title naming no plant, filed by Commons as a place, is a photograph of the place** (`PLACE_CATEGORIES`: Rivers, Streams, Valleys, Canyons, Gorges, Mountains, Lakes, Waterfalls, Landscapes, Plantations "of/in"). Read only when the title holds no binomial and none of the species' epithets. It catches exactly two files in the corpus, both leads and both the page's only photograph:
- Boswellia papyrifera, "Giba near Gabat outlet" (Rivers of Ethiopia): viewed, a river valley.
- Commiphora myrrha, "Mirra nos Olivais de Quelemem" (Plantations in Brazil): viewed, a shrub with lilac flower spikes in grass. It is not a Commiphora; it looks like Tetradenia riparia, called "mirra" in Brazil.

Lead ranking could not help: neither page holds another photograph (Commons' categories hold only a map, sheets and resin besides). Guards: "HK Plants Shatin Shing Mun River White Flowers" (category "Shing Mun River"), and a habitat photograph whose title names the plant.

**L3. A map of a place, and an information board** (found in the same sweep, not leads). `CATEGORY_KINDS` reads "Maps of …" (a category of a place's maps; "Pages with maps" still hides nothing), and "information board" joins the title's "not the plant" words. Both files are on Rhododendron kanehirae, and I viewed both: "烏來杜鵑分布圖", a display board's distribution map, and "Information board of Ernest Henry Wilson…".

**L4. Kew's accepted species outrank GBIF's older name of the same words in the iNaturalist filter** (`kew-infra.ts`, `mine`; `inat-kew-fill.ts`). GBIF lists "Crassula cooperi Schönl." among Crassula exilis's names. That is a later homonym of Kew's Crassula cooperi Regel, so the Kew fill rightly does not list it as accepted apart. `mine()` compared binomials only, so it read "Crassula cooperi" as exilis's own. iNaturalist's "Crassula exilis cooperi" (Kew: C. cooperi) stayed on exilis, the live run never found exilis to be a candidate, and C5 then hid all seven of Crassula cooperi's photographs on both pages. Now, where Kew's entry is known, a GBIF older name whose two words Kew accepts as another species is not the page's own. `KewInfra.widened(own)` tells the fill which pages read under the old reading it must ask once more: 55 pages with iNaturalist photographs, 6 of them never marked. Those pages are marked "Kew's accepted species read over GBIF's older names"; the old mark is replaced, not repeated. The round-72 pin in `r72c-fixes.test.ts` that expected the homonym to count is changed, and a guard is kept: without Kew's entry, GBIF's older name still counts.

**L5. An observation GBIF misfiled goes to the page Kew names** (`sharedPhotos`). Take one iNaturalist photograph held by exactly two pages: A has it from iNaturalist, B only through GBIF, and B's `name.kew.acceptedElsewhere` holds A's accepted name. That photograph is A's: it is marked, and hidden, on B only. This gives Adenia gummifera back seven photographs (iNaturalist's "Adenia gummifera gummifera", Kew's var. gummifera), which GBIF files under A. cissampeloides through its synonym "Adenia gummifera (Harv.) Harms". Two observations sharing one photograph (Sassafras and Cornus) are still hidden on both. `build-dossiers.ts` passes `name: d.name` (one line).

**Tests:** `tests/unit/r73l-photographs.test.ts`, 15 tests. On `r73base` 9 fail and 6 guards pass (run in a base worktree). They cover Heterodoxa, Giba, Mirra, the map, the board, Crassula exilis's reading, the fill end to end (re-asked though marked, cooperi left out, a rerun passes it by) and Adenia. Two older pins of the old readings were changed:
- `r72c-fixes.test.ts`: the Crassula exilis homonym now goes to C. cooperi; a guard without Kew's entry is kept.
- `r71c-mutants.test.ts`: the mutant case "ALOE arborescens" now names a sister species, so the capitals case reads "ALOE ferox" instead, which still kills the mutant.

**Runs:**
- The whole unit suite: 402 files, 3,840 passed, 8 skipped and 1 failed, the r71c pin; that file passes after the change (30 of 30).
- `tsc --noEmit -p .`: clean. `tsc` on `build-dossiers.ts` with the scripts config: clean.
- `svelte-check --threshold error`: 0 errors.
- After a1b8dd8: the 8 related files pass (228 tests). L-6's three tests fail without the exception. The full suite: 402 files, 3,844 passed, 8 skipped, none failing. `tsc` clean.
- No browser test was run, since nothing in a page's code changed.

## Needs

- **K, `scripts/build-dossiers.ts` `markSharedPhotos`:** keep my one-line hunk, `sharedPhotos(all.map(({ d }) => ({ key: d.key, name: d.name, photos: … })))`.
- **Schema (A or K, `schema.ts`):** keep `described: v.optional(v.boolean())` on `Photo` (my hunk).
- **K, merged pages:** `markSharedPhotos` must leave out a dossier whose key leaves by `scripts/merged-pages.txt`, so `all` holds only kept pages. Until `--prune-followed` deletes the leaving dossier, its copies still mark the kept page's photographs. Weingartia fidaiana shows 5 of its 20 (15 shared with Rebutia fidana), and Pelecyphora macromeris loses one to Coryphantha macromeris. Without this, the merge leaves Weingartia fidaiana with a quarter of its photographs.
- **The corpus step:** no new step. The existing plan line `dossier --fill commons-kind` now reads the one description (Heterodoxa pt12). Step 10 (`--fill inat --bulk bulk`) now asks about 60 pages once (about two minutes), and `--index` writes the shared marks with L5.
- **About pages** (`/about/how`, Photographs), for the merge:
  - "a map (in any language: "Areale", "mapa", "carte", "ареал")" becomes "a map (in any language: "Areale", "mapa", "carte", "ареал", or filed under a place's maps)".
  - "seeds (a pod on the plant is the plant), resin, a stamp, a book or a label;" becomes "seeds (a pod on the plant is the plant), resin, a stamp, a book, a label or an information board; a photograph whose name names no plant and which Commons files as a place (a river, a valley, a landscape, a plantation);".
  - After "("Pariette Cactus", "Autumn Crocus" name no other plant).", add: "A name that holds no two-word name and none of the species' epithets, but holds the epithet of another species the reference accepts in its genus ("Heterodoxa pt12"), names that species, unless the file's description on Commons names the species itself."
  - `/about/formats`, after "`sourceRead` (set once the fill has read them)", add: "; `described`, for a file whose name holds only another species' epithet, whether its description names the species (true keeps it)"
  - "…is shown on neither." becomes "…is shown on neither, except one iNaturalist observation that GBIF files under the other page by an older name Kew accepts as the first page's species, which is shown on the first page only."
  - After "leaving out an observation of a taxon below the species that Kew's file places under another species", add: "(an older name GBIF gives the species counts as Kew's species of the same words where Kew accepts one)".

## The corpus step

Run on `/tmp/claude-0/rev73/L-s/static/s/v2`, a copy of the live corpus, from `/tmp/claude-0/rev73/L-s` (with `bulk` linking Kew's files):

`TSX_TSCONFIG_PATH=/tmp/claude-0/rev73/L/tsconfig.scripts.json npx tsx /tmp/claude-0/rev73/L/scripts/build-dossiers.ts --fill inat --bulk bulk` (runs `--index` at its end)

- **First run:** 1,974 candidate pages (was 2,004; the old reading counted names under GBIF's homonyms that cannot be descendants). 60 asked iNaturalist, 1,913 read before, 5 took in such a taxon and were asked again (`L-s/inat-descendants.txt`). 63 files changed, the index included. Shared photographs went from 138 on 40 pages to 117 on 37 pages.
- **Five examples:**
  - Crassula exilis: 19 iNaturalist photographs become 10. Nine "Crassula exilis cooperi" observations are left out; I checked two on iNaturalist (151579624, 248881288, research grade).
  - Crassula cooperi: 0 shown becomes 7, and its lead returns.
  - Adenia gummifera: 51 becomes 58.
  - Opuntia ficus-indica: "amyclaea" (Kew: O. maxima) is left out; 77 becomes 75.
  - Boswellia papyrifera and Commiphora myrrha: no photograph. Heliamphora purpurascens keeps its lead once `--fill commons-kind` has run.
- **`--fill commons-kind` on the same copy:** first run, 2 files asked in 1 request (Heterodoxa pt12 and Boswellia's sheet, which is asked every run); 1 dossier written; "now shown: File:Heterodoxa pt12.JPG". Second run, 1 file asked (the sheet) and 0 written; every md5 identical.
- **Confirming run:** the same command again changed nothing: md5 of every dossier and posting file identical, with 0 asked and 0 marked anew. My second run started while the first was still writing its index, so the clean comparison is between runs 2 and 3.

## Measured

Live corpus as the page reads it, `r73base` code, then the dry run's copy with this branch:

- Shown photographs: 228,195 become 228,200 after the iNaturalist fill.
- Shown photographs: 228,201 after `--fill commons-kind`.
- Pages with a lead: 6,321 become 6,320 (GBIF 640 to 641, Commons 572 to 570).
- Pages with none: 2,626 become 2,627.
- Leads changed: 3. Boswellia papyrifera and Commiphora myrrha go to none; Crassula cooperi goes from none to a GBIF copy of iNaturalist's 16012044.
- Newly hidden: 12 on 5 pages. Newly shown: 18 on 3 pages.
- Commons leads whose title holds neither the species' epithet nor an older name's: 20 become 17. I viewed six of the other seventeen (Stephania kaweesakii, Agave cocui, Hesperaloe nocturna, Ledebouria undulata, Nepenthes attenboroughii, N. hurrelliana); all show the plant, so no wider rule for such titles is warranted.

**2. Pl@ntNet leads (57).** All 57 are GBIF media from Pl@ntNet's human-validated observations dataset (7a3679ef…), basis HUMAN_OBSERVATION, CC BY-SA, no establishment flag (I fetched all 57 records). None comes from the automatically identified dataset. I viewed all 57: each is a photograph of a plant consistent with its name. A few are weak: Commiphora samharensis, a seedling on bare ground; Commiphora baluensis, a distant shrub; Agave caribaeicola, a hillside of agaves. Many are pot plants, captioned with no wild or cultivated claim, which is true. None of the 57 pages holds an iNaturalist photograph, so none outranks one. No rule is needed. 15 of them lead over 10 to 12 Commons files that name the species, which is round 69's order of sources (GBIF over Commons), a choice and not a fault.

**3. Kew's synonyms (C4).** On the live corpus, all six pages show their files: Pelecyphora missouriensis 7, Aeonium dodrantale 12, Musella lasiocarpa 12, Cheiridopsis angustifolia 2, Ceropegia spathulata 2 and Chamaecereus silvestrii 12 Commons files, all shown. Of the 83 Commons files still hidden as "named as another species", one holds a Kew synonym of its page: "Nepenthes albomarginata and Nepenthes tenuis" on N. dubia, rightly hidden for albomarginata.

**4. The 469 common names with no source.** All 469 (361 pages) are Norwegian (`nno` 416, `nob` 53). The page shows English names only (`englishNames`, `lang === 'eng'`), and so do the JSON-LD `alternateName` and search (`indexNames`, `pooledSpellings`). None is shown or searched. They are visible only in `/api/dossier/<key>` and the export, under the `gbif.vernacular` row. Rule 1 holds, and no need is given; K may drop them at the fetch if wanted.

**5. The shared-photograph rule, all 40 pages** (`L-work/out/shared.json`; I viewed the 29 iNaturalist photographs outside the two merged pairs).
- **Right:** 30 pages where one photograph sits on two observations of different plants (23 pages), or a survey plot sits on two or three (7 pages). Each viewed photograph shows both plants or several, for example Sassafras with Cornus twigs, Monanthes pallens with M. polyphylla, Rhipsalis with Crassula globularioides. Sassafras albidum's lead changes, rightly. The hides on Adenia cissampeloides and Conophytum jucundum are right too, since those photographs are other species by Kew; jucundum's lead was one of them.
- **Wrong, fixed:** Crassula cooperi was left with none (L4), and Adenia gummifera lost seven of its own (L5).
- **Wrong, not fixed:** Conophytum wettsteinii loses five of its own (13 to 8). iNaturalist files them as "Conophytum jucundum fragile", and Kew holds "fragile" only under C. wettsteinii; with no Kew row of that name, nothing decides by rule, so they stay hidden on both pages.
- **The merged pairs:** see the need above.

## Not done

- Eleven of the seventeen other rank-2 Commons leads were not viewed: upload.wikimedia.org answered 429, often with a ten-minute Retry-After, for most of the session, and I stopped asking rather than press it.
- Non-lead files that show no plant, or a crowd, were left: Agave amica's "Pilgrims on the Vesak Day 2011" and "School Students Planting…", Dracaena trifasciata's greenhouse interior with radiators. A rule for them would rest on one or two files each.
