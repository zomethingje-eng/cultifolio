# Round 84, agent G: geography (the regions, the records and the maps)

Copy `/tmp/claude-0/rev84/G/`, branch `r84`, 10 commits on `r84base` (last `085924a`). Scratch `/tmp/claude-0/rev84/G-s/`: `shapes-report.json` (how every province and island was placed), `draw.json` (dissolved outlines), `src/tblGazetteer.txt`.

## Done

**D2, A2, W1: the shapes script** (`scripts/dev/r80a-tdwg-shapes.py`, `scripts/tdwg3-shapes.json`).
- **Result.** 366 of 369 regions now have a shape, against 244. Of the 125 box regions, 122 get one.
- **The three left, and why:**
  - Cocos (Keeling) Is. and Christmas I.: Natural Earth's admin-1 file draws neither.
  - South China Sea: TDWG gives its Spratly unit no country code.
- **How a whole province is placed.** The old rules come first, unchanged. Then, in order:
  - TDWG's own `tblGazetteer.txt` (one request to the same wgsrpd repository). It places Russia's oblasts, Jersey, Guernsey, the Isle of Man, Sint Maarten, Clipperton, Navassa, Palmyra, Rose Atoll and the Austral and Tuamotu-Gambier islands. Its region's box must hold the province (the gazetteer files Tula under South Russia, whose box ends 1.5° south of it).
  - The box holding the largest share of the province (Sussex to Cornwall in Great Britain, Taiwan's cities, Thrace, Sinai, Bursa in Asia).
  - Two small tables: New Zealand by Natural Earth's `region`, and Papua New Guinea by its Islands Region.
  - One polygon rule: Gallipoli and Imbros are Turkey-in-Europe.
- **ISO codes of 2001 corrected.** BU, TP, AN, SJ and BV. Belarus and Latvia were filed under Russia's code, so Latvia was in no shape at all.
- **Each polygon placed on its own.** A remote island no longer keeps a whole region out.
  - It moves to the box of its own country's region that holds it: Marion → MPE, Bonin → OGA, Socotra → SOC, Jan Mayen → SVA, Labrador → LAB, Easter I. → EAS, the Aleutians → ALU, Cyclades → GRC, Karpathos → KRI.
  - Where it reaches more than 1° beyond its box, it is cut to the box plus 0.1° (Western Sahara out of Morocco).
  - An island in no box stays with a province placed by name (Ebon, Palmyra, Rapa).
  - Anything else is left out. The report names all 23 left out.
- **Units excused.** Three units Natural Earth cannot stand for: Aves I., Malpelo I. and the Coco Is.
- **Round 83's 244 shapes.** They are unchanged except:
  - Argentina Northeast gains Santa Fe, which TDWG's table files under Argentina South;
  - Haiti gains Navassa;
  - four islets move (Seychelles ×2, Oregon→Washington, Scatarie Nova Scotia→Québec).
- **`--r83` mode** still writes round 83's file byte for byte (checked).
- **Tests:** `tests/unit/r84g-shapes.test.ts` has 51 tests: Belgium is out of FRA, Kenting is in TAI, Seoul is out of JAP, Windhoek is out of CPP, Riga is in BLT, Naxos is in GRC, Gallipoli is in TUE, and more. On base, 43 of its first 44 failed (checked in a worktree).
- **Step:** 2 (the walk).

**A2: the box buffer.**
- A region with no shape is tested by its box grown by 0.05° (`grownBox`, `tdwg-shapes.ts`). A code-less box is tested the same way in `build.ts` `rangeTest`.
- **Step:** 2.

**A1, B1, D6: every record tested, and the page says so.**
- **Already true at derive time.** `readRecords` already tested restricted records whenever the shapes were given. The faulty pages (Aloe vera and Ficus elastica, built 21 to 22 October) predate the shapes.
- **No build without the shapes.** A build (except `--fixtures`) now refuses to start without the shapes file.
- **The record of sources.** Its words read "records tested against the native regions' shapes, openly licensed and restricted alike (…; shapes rule r84)".
- **A new field.** The dossier carries `occurrences.rangeRule: "r84"`. This is an optional field in `schema.ts`.
- **Tests:** `r84g-records.test.ts` (8) uses the real coordinates:
  - Aloe vera: the three restricted Fujairah records at 25.437721, 56.168707 are out, the Oman records are in;
  - Ficus elastica: the Sundarbans record is out;
  - Galanthus nivalis and Melissa officinalis: the Belgian and Luxembourg records are out;
  - Indigofera taiwaniana: the Kenting records are in.
- **Step:** 2.

**W1: the maps.**
- **What they draw.** Both maps draw the regions' dissolved outlines from `static/app/maps/regions110.svg` (118 kB, 32 kB gzipped) and `regions50.svg` (436 kB, 143 kB gzipped). They use `<use href>` exactly as the coastline does, kept a day by `/maps/*` in `_headers`.
- **Where the outlines come from.** `r80a … --draw` removes the shared borders: Natural Earth's neighbouring provinces share their points exactly. `scripts/dev/r84g-region-maps.py` then writes the two files and `src/lib/map/regions-drawn.ts`.
- **How a page picks a region.** `still.ts` recognises a region from the box every dossier already holds. A box it does not know is still drawn as a rectangle.
- **"Inside …".** The close-up says "Inside <region>" when a rectangle wholly inside the region's shape holds the whole frame. These are precomputed on a quarter-degree grid, for 177 regions.
- **Tests:**
  - `r84g-maps.test.ts` (6; fails on base at import);
  - `tests/e2e/r84g-maps.spec.ts`: Namibia and Angola are drawn as shapes with a real bounding box, the close-up draws Chile North, and both files are served as `image/svg+xml` with `max-age=86400`. It fails on base (404, and `<rect>`s). 4 passed with `r77c-maps.spec.ts`, Chromium and phone.
- **Step:** 1. Over today's corpus, 5,680 of the 5,691 boxes on D's 617 live dossiers are recognised. The other 11 are the three regions with no shape, still drawn as boxes.

**D4: the carried snapshot.**
- `src/lib/dossier/carry-core.ts` and the carry block in `build-dossiers.ts`. The previous build's range and records are carried only when:
  - the page's GBIF key is the one they were read under; and
  - the page has some key to read records under.
- Xanthoceras is re-derived by the walk with no records, and says "not checked".
- **Tests:** in `r84g-records.test.ts`.
- **Step:** 2.

**A6f: counting records.**
- `readRecords` now counts records (`nInRangeRecords`), not three-decimal places.
- The reason reads, for example: "4 in-range records at 2 places, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or better, and none is a person's observation given to three decimals)". This is in `build.ts` and `build-kew.ts`.
- **Step:** 2.

**B11: unreadable dossiers.**
- `src/lib/dossier/listing-store.ts`. Every listing reads through a store that names each file it cannot read. The listing then stops (exit 2) before writing anything.
- The listings covered are `--list-default-points`, `-range-shapes`, `-r83-repair` (both folders), `-wikidata-retry`, `-no-reason`, `-rebuild`, `-extra-keys`, and the new `--list-walk`, `--walk` and `--check-ranges`.
- **Tests:** in `r84g-walk-check.test.ts`. They run the real builder in a temporary folder, with one broken dossier.

**A21: a stale index.**
- `npm run dossier -- --index-ready` exits 0 only when `index-stamp.ts`'s `upToDate` holds.
- `corpus-step.mjs`'s upload step asks it first. If it fails, the step stops with "blocked", uploads nothing, and the stop sentence names `--index`.
- `scripts/corpus-plan-upload.txt` is the upload alone. DEPLOY no longer has bare rclone lines.
- **Tests:** `r84g-walk-check.test.ts`. I updated `r72d-corpus-step.test.ts` for the extra call.

**Decision 2: the whole-corpus walk.**
- **The walk.** `npm run dossier -- --walk --offline --grid climate --bulk bulk` lists every page built before the walk began (`walk.json`) and derives it, exactly as `--keys` does. The same command resumes a walk that stops. `--list-walk` writes only the list; `--again` begins a new walk.
- **The check after it.** `--check-ranges` lists, in `check-ranges.txt`:
  - every page whose typical cell lies outside every native region (buffer plus half a grid cell's diagonal);
  - every page whose records were not tested by rule r84 (a page derived before the walk, or carried);
  - every page with an open record outside its native regions.

  It then prints the five named cases (Aloe vera, Ficus elastica, Galanthus nivalis, Melissa officinalis, Indigofera taiwaniana), each as `fixed:` or `NOT FIXED:`, and exits 2 unless all is clean.
- **The plan.** `scripts/corpus-plan-r84-walk.txt` runs backup → walk → index → check → review → upload → live-check.
- **Tests:** `r84g-walk-check.test.ts` (11). The live Aloe vera and Galanthus dossiers are listed and come out NOT FIXED; the fixed versions pass; resuming a walk and `--again` work. All 9 of the first version failed on base.
- **Where it is written down.** DEPLOY `### Round eighty-four: geography (agent G)`.

## Decisions I took

1. **The gazetteer, with the box as the arbiter.** I used TDWG's gazetteer, from the same repository and edition as the tables, as a source of names. Where the gazetteer and the box disagree (Tula), the box wins: the box comes from TDWG's own polygons, which WCVP coded against.
2. **The coast rule (new).** A record in no region's shape belongs to the region whose drawn coast is nearest, if that coast is within 0.15° (`COAST_DEG`, about 16 km). A record on any region's land never qualifies.
   - **Why:** Natural Earth's provinces do not draw small islands: the Îles d'Hyères, the Frioul islands, Finland's skerries. The new France and Britain shapes would otherwise drop real coastal records.
   - **On the sample:** it recovers 399 of the 1,432 open records the new shapes otherwise drop.
   - **Belgium and Fujairah stay out**, because they lie on another region's land.
   - **For A:** please state this rule on /about/how.
3. **Where a polygon goes.** A polygon whose middle lies strictly in another box of its own country moves there (Naxos to Greece), rather than staying inside its own box's 0.1° margin. A margin of 0.05° keeps Block Island in Rhode Island.
4. **Overlapping boxes.** Where boxes overlap, the share of the area each box holds decides; on a tie, the smallest box. This placed 51 provinces, all listed in the report; I read them all and they are right.
5. **The rule stamp.** `occurrences.rangeRule` is a string field rather than words parsed out of the record, so the check (and a later round) can tell an incomplete migration (B1's suggestion).
6. **Named cases by page id.** The five cases are named by id (`k298116` and so on), so N's Kew-name headings do not move them.
7. **Map file sizes.** The close-up file is simplified to 0.08° and drops islets under 0.06°; the world file is simplified to 0.3° and drops islets under 0.5°. A region whose only rings are islets keeps its largest. The file weights are above.
8. **The upload goes through corpus-step plans only**, so the index check always runs.

## Measured

- **Regions with a shape:** 244 → 366. Box-only regions: 125 → 3.
- **D's 617 live dossiers, typical cell outside every native region:**
  - by round 83's shapes, 1 (Aloe vera);
  - by this round's, 7. These are Aloe vera; Galanthus nivalis in Belgium; Bougainvillea glabra in Brasília, where Kew holds it native only in BZE, BZL and BZS; Camellia sinensis in Taiwan; Echeveria pinetorum in Veracruz; Acaena ovalifolia in Chilean Tierra del Fuego; and Allium microdictyon in Kemerovo.

  The walk re-derives all seven.
- **Open records outside their native regions on that sample:** 0 → 1,033 of 102,974 (1.0%), on 131 pages. The walk takes them out. Without the coast rule it would be 1,432.
- **Run times:**
  - shapes script: about 25 s, including `--draw`;
  - map generator: about 3 s;
  - range test over the sample: about 5 s.
- **Type checks:**
  - `npx tsc --noEmit -p .`: clean.
  - The builder under `tsconfig.scripts.json`: only the 8 errors base already has.
  - `svelte-check` was OOM-killed twice (six agents, 8 GB), so it was not run. I changed no `.svelte` file.
- **Unit tests:** mine, plus the files near them (`r80a-range-shapes`, `r83c-climate`, `r72d-*`, `r79m`, `r80o-build-corpus`, `r83w-weight`, `r77c-page-cpu`, `r82u-pages`, `r72d-index-unreadable`), all pass.

## For the owner's PC

These are in DEPLOY, step 2, after the deploy. Keep your `scripts\default-points.txt` (5,187 points). Then:

```
node scripts\corpus-step.mjs --plan scripts\corpus-plan-r84-walk.txt
```

- **Stops:** it stops at the review. Read the five `fixed:` lines, then run the same command with `--go-on`.
- **Time:** about an hour to read the download, 6 to 7 hours for the 48,357 pages, about 17 minutes for the index, a few minutes for the check, and 30 to 60 minutes for the upload.
- **If anything stops:** the same command resumes it.
- **If the check lists pages:** run
  ```
  npm run dossier -- --keys check-ranges.txt --offline --grid climate --bulk bulk
  ```
  then `--index`, then `--check-ranges`, then the plan again.
- **Paste back:** `check-ranges.txt` if it does not empty, and the five case lines.

## Touched outside my files

- **`src/lib/dossier/schema.ts`:** one optional field, `occurrences.rangeRule`.
- **`src/lib/dossier/build-kew.ts`:** the keyless pages' records part. It adds the `rangeRule` stamp and `noPlacedWords`.
- **`src/lib/dossier/corpus-fills.ts`:** `rebuildList` now takes `Pick<DossierStore,'files'|'read'>` (type only).
- **`scripts/build-dossiers.ts`** beyond the listings:
  - the header's usage lines;
  - the shapes-required check at the start of a build;
  - the carry condition (D4);
  - `--walk`, `--check-ranges`, `--index-ready`.
- **`scripts/corpus-step.mjs`:** the upload step's gate and its stop sentence.
- **New files:**
  - `scripts/corpus-plan-upload.txt`, `scripts/corpus-plan-r84-walk.txt`;
  - `static/app/maps/regions110.svg`, `regions50.svg` (U's `static/`);
  - `src/lib/map/regions-drawn.ts` (generated).
- **Tests edited:**
  - `tests/unit/r83c-climate.test.ts`: the count 244 becomes ≥244;
  - `tests/unit/r72d-corpus-step.test.ts`: the upload sequence.
- **`docs/DEPLOY.md`:** my section only.
- **For A (about pages), the facts:**
  - 366 of 369 regions are tested by shape; three by box (named above), with the same 0.05° margin;
  - the 16 km coast rule;
  - restricted records are tested too, and each page names its rule;
  - the maps draw shapes and say "Inside …";
  - /about/how's "Tanzania's box holds Nairobi" example is now one of only three box regions.
- **For E:** a new close-up label class, `mlab mlab-in`. It is positioned inline and needs no CSS; `still.ts` writes it.

## Not done, with why

- **Islands Natural Earth does not draw, more than 16 km from any drawn coast**, are outside their region. The 23 polygons left out are listed in the report: Rockall, Shag Rocks, remote Seychelles atolls, Minami-Iwo-jima, Europa and Bassas da India. Fixing this needs Natural Earth's minor-islands layer, which is not among the sources here.
- **The Kai and Aru Islands go to the Lesser Sunda Is. by their boxes.** TDWG's gazetteer files them under Maluku and New Guinea, but the polygons carry no names to test against.
- **Verified only by fixtures and the live sample.** I could not run the bulk download here. The real five cases are proven on their real coordinates and on D's live dossiers. The check after the walk is what proves them on the PC.
- **WebKit and Firefox** were not run here (Chromium and phone only).
