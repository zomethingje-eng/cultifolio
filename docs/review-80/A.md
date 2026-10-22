# Round 80, agent A: the reference's data

Branch `r80f` in `/tmp/claude-0/rev80f/A`, 12 commits after `2781df6`. Scratch: `/tmp/claude-0/rev80f/A-s/` (notes, measures, the live dossiers read, the shape builder's inputs). The whole unit suite ran once, alone: 472 files and 4,344 tests passed, 10 skipped. Four older tests then needed round eighty's rules and now pass. `svelte-check --threshold error`: 0 errors. `tsc --noEmit -p .`: clean. `tsconfig.scripts.json`: no new errors (only the `judged` and DOM errors already there).

## Done

Each test is `tests/unit/r80a-*.test.ts`. Each failed on `r80f`: the module or function it tests did not exist, or the rule gave the old answer.

1. **A list key from another species (Xanthoceras sorbifolium, 9479204).**
   - Cause: GBIF's backbone holds the plant only as "Xanthoceras sorbifolia Bunge". The words "sorbifolium" give one accepted usage, "(A.Braun) Holub", which GBIF files under a doubtful genus Xanthoceras in Poaceae. Kew holds no row of that author, so X's check read nothing.
   - Rule: `familyRefuses` in `scripts/select-species-lib.ts`. A usage is refused when GBIF files it in another order than the one GBIF gives Kew's family, while GBIF's accepted genus of that name is in Kew's order. The rule reads the backbone export's own family and genus lines (`backboneHigher`, `backboneTaxa`). `gbifKeyFor` takes it, `select-species.ts` passes it, and `scripts/dev/r80x-list-rules.ts --families` applies it to a list with the export.
   - Segregate families of one order are not refused (Thesiaceae for Santalaceae). Nor is Bdallophytum, whose genus GBIF also files in Rafflesiaceae.
   - `scripts/species-list.txt`: the Xanthoceras line now reads "-", with a header note. That leaves 46,021 lines with a key and 2,336 without.
   - `--keys` reads a new line form, `k<id> -`: build this page from Kew's file whatever key its dossier has.
   - Test: `r80a-list-families`. Five older tests now use the new counts.
   - Safe mid-fill: the list is read only by builds.
2. **Crocus nudiflorus took Crocus mazziaricus's entry.**
   - Cause: Kew holds "Crocus nudiflorus Sm." twice: 327378, accepted, and 327379, illegitimate, under C. mazziaricus. `kewLinks` took the number Wikidata's item carried (436635-1) before Kew's accepted one, and `kewEntry` then read that row's entry.
   - Rule: `kewIpni` now names such numbers (`elsewhere`), and `kewLinks` never picks one. `kewEntry` reads the accepted row of the same words and author, so a page linked before the fix also gets its own entry.
   - Others alike: Kew's file has 160 such names, 21 of them species on the list. I read all 21 live dossiers, and only Crocus nudiflorus links the wrong number.
   - Test: `r80a-kew-entry`. Safe mid-fill.
3. **Range by bounding box (Dracaena trifasciata and Nairobi).**
   - Cause: `readRecords` tested each record against the WGSRPD regions' rectangles, and Tanzania's rectangle holds Nairobi.
   - Licence: TDWG's level-3 polygons on GitHub carry no licence file. Their metadata says the boundaries are "the intellectual property of ESRI … All Rights Reserved", so they are not used.
   - Source: `scripts/dev/r80a-tdwg-shapes.py` builds the shapes from Natural Earth's 1:10m states and provinces, which are public domain.
     - Each province goes to a TDWG region by TDWG's own second-edition tables: by its country, then by its name, then by the one region box that holds it. Two ISO slips in TDWG's tables are corrected: UK for GB, and ZA for Namibia.
     - A region gets a shape only when every province of its countries was placed and the shape lies inside the region's box. That is 243 of 369 regions; the other 126 keep their box.
     - Rings are simplified to 0.02°. The result is `scripts/tdwg3-shapes.json`, 2.2 MB, read by the builder only.
   - Test: `tdwg-shapes.ts` counts a record as inside a region when it is in the shape or within 0.05° of its edge. `rangeTest` and `readRecords(…, inside)` apply it on both build paths (`build.ts`, `build-kew.ts`). Each page's record says which of its regions were tested by shape and which by box.
   - `/about/how` says all this.
   - Test: `r80a-range-shapes`. Safe mid-fill: only builds read it.
4. **The tomato's cold floor of 18.9 °C.**
   - Cause: the extremes were read at POWER cell -12.00_-76.875. Its ground averages about 1,195 m of Andean slope, while the typical cell is 66 m on Lima's coast. The correction of -1,129 m warmed every night by 7.3 °C.
   - Guard: `$core/lapse` (`MAX_LAPSE_M = 1000`, `lapseSetAside`). Extremes are refused when the correction is beyond 1,000 m either way, or when the record low is warmer than the coldest month's mean night. They are never applied.
   - Where it applies: the parser (`setAsideExtremes`, beside the sea rule, as status `lapse`), the build's record, and the species, plant, compare and label wording. The species page has a notice that says why.
   - Live pages are mended when they are read once this round's Worker is deployed. Sheets are mended at the next `--index`. No rebuild is needed.
   - Test: `r80a-lapse`. One older test (`md5`) has a plausible record low now. Safe mid-fill.
5. **"GBIF's records were not asked" on Echinopsis crassicaulis's plant page.**
   - Rule: `keylessPlantNotice` in `$core/no-gbif` says what the species page did, and whether the plant's own key is one of the keys the page reads. A keyless page's sheet now carries those keys (`Sheet.keys`).
   - The fix is in the plant page's notice (`src/routes/plants/[acc]/+page.svelte`, the notice with id `key-no-page`).
   - Test: `r80a-keyless-plant`. Safe mid-fill. The sheets gain the field at `--index`.
6. **Pages without their Kew range.**
   - Rule: `bulkFetcher` takes `entryOf`: the list's plant_name_id for the key, else the `k` id of the page on disk. `WcvpIndex.rangeById` reads that entry's range, unless GBIF's name already reaches that entry or one below it (Orbea maculata subsp. rangeana keeps its narrower range).
   - Pages: 7 live pages, the five named plus Ceropegia angustilobulata and C. juttae.
   - Test: `r80a-range-by-entry`.
   - Also in `/about/how`. Safe mid-fill.
7. **Datura innoxia lost its identifiers.**
   - Rule: `crossIds` takes `kewPage`, which the build sets for `k` pages and pages whose Kew entry the list gives, and `--fill wikidata` sets for `k` pages. Such a page is matched by its identifiers only:
     - of two items carrying its GBIF key, the one with Kew's IPNI or POWO number;
     - with none, the one item carrying either number;
     - otherwise no item, said as `NO_ITEM_BY_IDS`.
     - The label is never read.
   - The build links Kew's IPNI and POWO numbers from Kew's file whatever Wikidata answered, "ambiguous" included.
   - Test: `r80a-wikidata-ids`. The 456 older Wikidata and build tests pass unchanged. Safe mid-fill.
8. **Scientific names as common names, and the shared default map point.**
   - Common names: `englishNames` reads the page's own older names, GBIF's and Kew's (`NameScope.older`). A common name that is the species' own name or one of its older names, even one letter off (`oneLetterApart`), is not shown, even when it is the only English name. The index and the species page read the same rule.
     - Live: 13 such names on 13 pages, 3 of them shown as the common name.
     - Fixed at the next `--index`, and on the species page once the Worker is deployed.
     - Test: `r80a-common-scientific`. Two older tests now expect the own binomial to be left out.
   - Default points: `default-points.ts` defines a default point as a coordinate where the open in-range records of 20 species or more lie, 95% or more of them with no year. It is read from the reference's own records, so no outside list is needed. Such records are left out of the map, the marker and the climate, and counted.
     - `--list-default-points` writes `scripts/default-points.txt`; a point once listed stays listed.
     - The committed file is round seventy-seven's: 18 points, Mexico's among them (180 species).
     - Test: `r80a-default-points`. Safe mid-fill.
9. **The duplicate pages.**
   - `scripts/merged-pages.txt` now joins Ceropegia cereiformis (9574874) and Ceropegia nubica (9592399) to `k505095`. Echeveria peacockii stays into 2985894. An `except:` column lists the keys GBIF files under the leaving key that Kew holds as other plants, which I checked against GBIF's species API and Kew's file.
   - Rule:
     - `parseMerges` reads a page without a GBIF key as a target (`intoPage`).
     - `mergeKeys` gives every merge a line wherever the extra keys' rule gave none. The build and `--list-extra-keys` both use it (X's need).
     - `mergedToPrune` and `pageIds` find a keyless target by its id.
     - The build skips a key merged into a keyless page, and reads it there.
     - `extraWhy` says "the key of a page merged here by the owner's decision".
   - Others: of the 21 `g` pages in the live index, read against Kew's synonymy and the extra keys, these three are the only plants held by two pages.
   - Test: `r80a-merges`. Two older tests are updated.
   - Safe mid-fill: `--index` then gives the leaving pages `merged-away` ids, which they have already.
10. **Wikidata batches that timed out.**
    - Rule: a batched query of GBIF keys that does not answer is asked again as two halves, down to 25 keys (`RETRY_KEYS`). A part that still fails is held as not answered (rule 2).
    - `--list-wikidata-retry` lists every page Wikidata did not answer, and every `k` page whose item a label refused.
    - Test: `r80a-wikidata-retry`. Safe mid-fill.

## Repairs for the live site

When: after the cultivated fill finishes, before the full plan's own `--index`. Then carry on with the full plan (`node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt`): its `--index`, review, upload and live check take the pages to the site.

```
npm run dossier -- --list-default-points
npm run dossier -- --list-range-shapes
npm run dossier -- --list-wikidata-retry
npm run dossier -- --keys scripts/r80-repair-keys.txt --grid climate --bulk bulk --skip inat
npm run dossier -- --keys rebuild-wd-retry.txt --grid climate --bulk bulk --skip inat
npm run dossier -- --keys rebuild-shapes.txt --offline --grid climate --bulk bulk
npm run dossier -- --prune-followed
```

If the full plan has already finished, `node scripts/corpus-step.mjs --plan scripts/corpus-plan-r80-repair.txt` runs the same lines, then the index, a review stop, the upload and the live check. Never run it while the full plan is unfinished (see Needs).

- **Pages:**
  - `scripts/r80-repair-keys.txt`, 13 pages: Xanthoceras sorbifolium, built from Kew's file; Crocus nudiflorus; the 7 range pages; Datura innoxia; and the merge targets k505095 and k2778991.
  - `rebuild-wd-retry.txt`: the full build's 22 pages, and the `k` pages a label refused.
  - `rebuild-shapes.txt`: every page with an open in-range record outside its regions' shapes or at a default point. Round seventy-seven's corpus has 2,300 of 8,947, so expect about 12,000.
  - `--prune-followed`: deletes `g9574874`, `g9592399` and `g7530398`. The corpus step expects the index to hold three species fewer.
- **What each step asks of which source:**
  - The listings ask nothing; a minute or two each.
  - The online `--keys` runs ask GBIF's species API, Wikidata, Wikipedia, Commons, and GBIF's occurrence API for the extra keys that are not in the download (for example 9592399). About 2 s a page.
  - The `--offline` run asks nothing but NASA POWER, for a cell not yet cached: about 0.4 s a page (round seventy-seven's re-derivation rate), so about 80 minutes.
- **Total time:**
  - Each build reads the download: ten minutes for the SQL download, about an hour for the DWCA.
  - Each build also writes the index at its end: about 17 minutes.
  - So about 3 to 5 hours in all, on a fill-free evening.
- **Without any rebuild:** the lapse rule and the common-name rule reach the live pages when this round's Worker is deployed and at the next `--index`.

## Needs

- **O (`scripts/corpus-step.mjs`).** The corpus step keeps one plan's record (`corpus-step.json`). Running `corpus-plan-r80-repair.txt` while the full plan is unfinished would put the full plan's record aside, and the next full-plan run would start again from its backup. Please key the state by the plan file, or refuse a second plan while one is unfinished. Until then, the repair is typed by hand, as above.
- **O (docs).** `src/lib/core/no-gbif.ts`'s comment and `REVIEW-ROUND-79.md` give 2,327 keyless pages and 912 not checked (review-d 10). The list now says 2,336 keyless, Xanthoceras included.
- **U.** On the add-plant picker, mark GBIF's name-service row, or leave it out, when the reference already holds that name (review-w 4, second half). Also Portulaca oleracea's "Pakistan· introduced" spacing (review-p).
- **O and X.** `--list-default-points` rewrites a committed file (`scripts/default-points.txt`) on the PC, as `--list-extra-keys` does `scripts/extra-keys.txt`. A later `git pull` may need the PC's copy kept. I did not touch `scripts/extra-keys.txt`, since the PC regenerated it. The build adds the merges' lines to it in memory.

## For the owner's PC

- Take this round's code any day: nothing changes `scripts/corpus-plan-full.txt`, and the fill reads none of the changed lists.
- After the fill finishes, type the repair lines above, then carry on with the plan. DEPLOY.md's new section, "Round eighty: the reference's data (agent A)", says what good output looks like.

## Measured

- **Requests:** 27 to the live API, plus the live index, which reviewer C had already saved. About 510 to GBIF's API, one a second: the 437 families, 61 genera and 8 species. Wikidata answered 429 to this machine, so it was not asked again.
- **Families:** all 46,022 keyed lines were compared with the live index's GBIF families. 621 differ, 24 of them in rare families. Only 2 differ in order once each family's order is GBIF's, and only Xanthoceras is outside its own genus's order.
- **Shapes on round seventy-seven's corpus:**
  - 13,490 of 1,125,954 open in-range records fall outside every native region's shape (1.2%), on 1,953 of 7,760 pages.
  - 26 pages are left with no open record.
  - The densest population moves more than half a degree on 171 pages.
  - 2,881 pages have every native region shaped, and 2,638 some.
- **Lapse:** on round seventy-seven's corpus, 82 of 5,454 pages with extremes are corrected by more than 1,000 m, and 1 more has an impossible record low (Ruellia simplex). Live, at that rate, about 570 pages.
- **Others:**
  - Default points: 18 points on 593 of 8,947 pages.
  - Common names: 13 live names.
  - Kew range: 7 live pages.
  - Duplicate plants: 3 live pages.
  - Crocus-like Kew pairs: 21 on the list, 1 linked wrongly live.

## Not done, with why

- TDWG's own polygons, because of their licence. 126 regions still test by their box: those whose provinces could not all be placed (Russia, China, Brazil's regions, Mexico's, Pacific islands). A better assignment table would give them shapes.
- The live counts for shapes, lapse and default points are estimates from round seventy-seven's corpus. Restricted records are in no dossier, so `--list-range-shapes` misses a page whose only out-of-shape records are restricted. The next full build reads them all.
- The Wikidata identifier rule is tested on recorded answers only, since Wikidata refused this machine. The repair's run on Datura innoxia proves it live.
- No browser test was added. The two page changes are notices worded from tested functions.
- Review-d 10: the `g` pages that Kew places by spelling still link no Kew number. That was not in my list, and is left for a later round.
