# Round 85, agent G: geography, records and climate (derive time), and the maps

Copy `/tmp/claude-0/rev85/G/`, branch `r85` on `r85base`, 11 commits, `e296304` to `a6b3234`. Scratch `/tmp/claude-0/rev85/G-s/`:
- `src/`: the sources (TDWG's tables, the gazetteer, and Natural Earth's minor islands 5.1.1, fetched once);
- `r85-report.json`: how every province, split, island and orphan polygon was placed;
- `r85-draw.json`: the outlines;
- `m/`: the measuring scripts.

## Done

**Decision 1, D4, A5, A6, B1: the border rule** (`src/lib/dossier/tdwg-shapes.ts`, `build.ts` `rangeTest` and `readRecords`).
- `admit(lat, lon, codes, country)` decides each record and returns why it is in: `strict`, `buffer`, `coast` or `island`.
- A record strictly inside any region's shape, or on another region's minor island, is that region's.
- The margin, the coast reach and the islands take a record only when it is on no region's land, and only when its stated GBIF country is the admitting region's.
- The regions' countries are in the shapes file (`countries`). They come from TDWG's units and from every Natural Earth province placed in the region (JE, GG, AX, SX and so on).
- `rangeTest` passes each record's `countryCode`. The words add "a record within the margin or off a coast counted only on no other region's land and in the region's own country".
- Out by this rule:
  - Khor Fakkan (AE, inside the Gulf States);
  - Tweed Heads (inside NSW);
  - Ixora's Vientiane record (inside Laos);
  - Bukavu's cell (inside Rwanda);
  - Fujairah.
- Restricted records are tested by the same call.
- Tests: `tests/unit/r85g-border.test.ts` (37) uses the reviews' coordinates.
- Step 2.

**Decision 2, A3: islands.**
- `scripts/dev/r80a-tdwg-shapes.py --islands` adds Natural Earth's 10m minor islands, 2,760 placed, each in the region of the nearest shape (or the box of a shapeless region).
- A point beyond every drawn coast's reach counts as `island` when it lies:
  - on such an island; or
  - with the region's stated country, within `ISLAND_DEG` (0.5°) of its shape or inside its box.
- Results:
  - Aorangi (Poor Knights, 21 km off): in with NZ, out with no country or AU;
  - Tawhiti Rahi: in by the coast;
  - Macauley I.: in by the KER box;
  - Ile du Levant: in as France's island.
- The layer holds neither the Poor Knights nor the outer Kermadecs, so the country clause carries A3.
- `NAMED_CASES` gains Xeronema callistemon and Veronica bollonsii with `needs: 'climate'`, so the check prints NOT FIXED unless their climates return.
- Step 2.

**Decision 3, A4: the shapes** (`r80a-tdwg-shapes.py`, `scripts/tdwg3-shapes.json`, rule `r85`).
- `SPLIT_L3` parts Morocco's provinces at 27.667° N (TDWG's own WSA north edge). Tarfaya and Tan-Tan go to MOR; Laâyoune, Smara, Boujdour, Dakhla and Aousserd go to WSA.
- West Bengal's Darjeeling and Kalimpong go to EHM. Natural Earth draws no districts, so the part is "north of 26.45°, west of the Teesta 88.45°", plus "north of 26.92° between 88.45° and the Jaldhaka 88.93°" (Jalpaiguri stays India's).
- `POLY_L3` (gazetteer) places three groups:
  - the Aru Is. → NWG;
  - Costa Rica's Cocos I. → CPI (TDWG files it under CPI-CO, not COS);
  - the Federal Dependencies east of 68° W → VNA, so Los Roques is in (TDWG's own VNA box excludes most of it).
- `place_orphans`: 17 polygons that were dropped for lying in no box now go to their own province's region within 2°, else to the nearest shape of their country. Examples: Minami-Iwo-jima → KZN, Mopelia → SCI, Banaba → GIL, the South Sandwich Is. → SSA, Cosmoledo → ALD. Only the Iles Eparses' four, in another country's box, stay out.
- `places`: each polygon's province and country, for decision A5 below.
- `--r84` still writes round 84's file byte for byte (checked).
- Tests: in `r85g-border`.
- Step 2.
- **A4, answered with evidence.**
  - The Snares: TDWG's gazetteer (ID 2000, "Snares I.") files them under NZS-OO, not ATP. They stay NZS.
  - Kenting: the records lie off Natural Earth's own unsimplified coast (Pingtung ends at 21.9046° N), so the margin is the right reason.

**Decision 4, A7, A8, S8: the extremes.**
- `src/lib/core/lapse.ts`: `DISAGREE_MARGIN_C = 1.5`. The record-low and warm-night causes need a gap of more than 1.5 °C.
- The sentence adds "by more than the 1.5 °C (2.7 °F) a correction can be out by".
- `schema.ts` `setAsideExtremes` (step 1) restores extremes set aside on a gap within the margin. `safeUrls` then sets their `climate.extremes` record to `ok` and drops "; not used: …".
- `build.ts` `extremesUpstream`, used by both builders, records set aside (lapse or sea) as `ok` with "; read, and set aside: <why>", never `none` (step 2).
- Tests: `r85g-climate.test.ts` covers the margins (0.7, 1.0, 1.2, 1.5 stand; 1.6 set aside) and the live Cedrus deodara and Aloe vera dossiers. In those dossiers `climate.extremes` was `none`, and is `ok` at read. `extremesUpstream` is tested in `r85g-border`.

**Decision 5, S3, D11: the sample.**
- `OccIndex.trim` (`bulk.ts`) keeps every distinct 0.05° cell (`SAMPLE_CELL_DEG`) first, each cell by its smallest id-hash. Second records rank +1, rows without coordinates +2.
- A row is admitted by its bare hash and every cut is made in `trim`. The kept set is the one the whole file would give, and does not depend on order (tested).
- `sources/gbif.ts` `occurrences`: past the pages read, one page from anywhere, then up to five native-region boxes (largest first), each asked for its own 300.
- Tests: `r85g-records.test.ts`. 2,000 records at one place plus 50 sparse cells, with a cap of 60, keep all 51 cells. The search asks region by region.
- Step 2 (download), and the online build for the search.
- Words for /about/how, for A: "From GBIF's download, at most 2,000 records a species, one of every 0.05° cell (about 5.5 km) before a second record of any, chosen by a fixed hash of the record's id; a species read through GBIF's search takes its first 300, then up to 300 from each of its five largest native regions."

**D8: hemispheres** (`src/lib/climate/provider.ts`).
- The cause: the split needed 3 cells and a fifth on the smaller side. Below that, its cells stayed in the median and could be the typical cell.
- Now any poleward cell on the smaller side is left out and said. With fewer than three cells left, the reason says so.
- `tests/unit/climate.test.ts` is updated (two southern cells now split). New tests are in `r85g-climate`.
- Step 2.

**A23: reasons counted, and the check reads every contributing cell.**
- New dossier fields (optional, in `schema.ts`):
  - `occurrences.admitted` (per record, all licences);
  - `occurrences.edge` (open indices by reason);
  - `climate.admitted` (per cell, by the best record's reason);
  - `climate.edge` ([lat, lon, reason] of each cell off the shapes).
- `range-check.ts` `checkPage` reads them for an r85 page:
  - the typical cell and every `edge` cell, each within its reason's reach (`REACH_DEG`: strict 0.036, buffer 0.086, coast 0.186, island 0.536 or the box);
  - every open record again by the border rule with its country, its reason compared with the dossier's (`reasonDiffers`);
  - counts present and summing (`uncounted`).
- D4: `cellOnOtherLand` is listed in `check-ranges-cells.txt` with a count. It is not a fault.
- The output adds two count lines: records and cells by reason.
- `NAMED_CASES` adds Dracaena trifasciata, Cordyline fruticosa, Xeronema and Veronica bollonsii (nine in all).
- `--walk` begins anew when `walk.json`'s rule differs from `RANGE_RULE`, so one plan line begins and resumes.
- Tests: `r85g-records`, and `r84g-walk-check` updated.
- Step 2.

**A23: the basionym rule's narrow path** (`bulk.ts` `viaOlderNames`).
- Kew's other record of the basionym takes the range away only when its native regions differ from the entry's. Monsonia lheritieri's still differ.
- A basionym whose entry's range is not read (unplaced) stays refused.
- Tests: `r85g-records`.
- Step 2.

**A5: the typical cell's locality.**
- `withPlace` (`build.ts`) writes `climate.place` ("São Paulo, Brazil"; "Sharjah, United Arab Emirates") from the shapes file's `places`.
- `$core/few-records.ts` adds "The typical spot, where the cold figures are read, is in …" to the few-records notice on thin pages.
- Tests: `r85g-border`, `r85g-climate`.
- The data comes with step 2; the words with step 1.

**D9, A20, W3, W4, performance: the maps** (`src/lib/map/still.ts`, `scripts/dev/r84g-region-maps.py`, `static/app/maps/`).
- **Files.** One file a region and scale: `/maps/w/<code>.svg` (world), `/maps/r/<code>.svg` (close-up), each `<path id="r">`.
  - The world map of a page with more than 30 regions uses the combined `regions110.svg` (kept).
  - The close-up asks only for regions its frame shows.
  - `regions50.svg` (436 kB) is gone.
- **Close-up detail** (`--draw` now 0.005°).
  - Tolerance is the region's extent ÷ 800, clamped to 0.005–0.08°, and islets are kept.
  - The Galápagos file is 2.5 kB, and Isabela has over 60 points.
  - The minor islands are drawn too.
- **Labels.** Each name is tested where it is drawn, after the clamp (round 84 tested it unclamped: "ItalyYugoslavia"). The scale bar's box is avoided.
  - With 40 records or fewer, a name over a dot is moved one or two lines; if no place is free, it is left out.
  - A name over another name, or over another name's home, is left out.
- **Rings.** `mapPoints(occurrences)` flags coast and island records, which are drawn as rings. The key "○ N records off the drawn coast" is shown, with data from step 2.
- **W3** (`theme.css` map passage). `--map-range` is #4a8a6c in light and #449473 in dark: 3.16:1 and 3.4:1 against land, 3.05:1 and 4.55:1 against sea. The edge is the accent, at 4.15:1 and 5.2:1.
  - The world fill is solid. The close-up fill is at 0.28 under a 1.5 px edge, so dots read.
  - The print media query keeps the light fill.
- **Tests.**
  - `r85g-maps.test.ts` (unit).
  - `tests/e2e/r85g-maps.spec.ts`: the page requests only `/maps/{w,r}/{NAM,ANG}.svg`, and the contrast is at least 3:1 in light and dark, read from computed styles.
  - `r84g-maps` (unit and e2e) updated to the new hrefs.
  - `r82u-pages` still passes.
- Step 1.

**Plan with N:** `scripts/corpus-plan-r85.txt`, agreed in `/tmp/claude-0/rev85/plan-r85.md`.
- The order: backup → walk → gbif-infra → kew-names → N's lines (new pages; `--list-renamed`; `if-exists rebuild-renamed.txt --keys …`; `--fill summary-revisions`; `--fill credits`) → index → check-ranges → review (my nine lines and two counts, N's two index lines) → upload → live-check.
- `parsePlan` reads all 14 steps.
- The test is in `r85g-records`.

**How each test was shown to fail on r85base.** I ran the four new unit files in a worktree at `r85base`: 49 failed, and only guards passed. The e2e asserts per-region requests, which do not exist on base (on base the page fetches `regions50.svg`).

## Decisions I took

1. **The border rule tests the admitting region's country.** It is the region whose margin, coast or island takes the record, not any native region's. This is stricter, and Cordyline's case (AU on both sides) is caught by its strict NSW shape anyway.
2. **Records on a native minor island count as `island`** even within the coast reach. The decision's island clause is for records beyond the reach, but a drawn island is land.
3. **For the islands, the box counts as well as 0.5°, when the country matches.** Without it the outer Kermadecs, 1° from Raoul, are not covered. TDWG's box is the scheme's own extent.
4. **Darjeeling's edge is two lines.** No public-domain district boundary exists in the sources, so the edge is accurate to about 10 km in the plains. Jalpaiguri stays India's.
5. **Polygons in no box (17 of them) are placed by nearest shape.** Each goes to its own country's nearest shape, or its province's region within 2°. This is decision 2's rule applied to admin-1 islands.
6. **A cell takes its best record's reason.** The typical cell's reach in the check is that reason's plus half a cell. A cell on another region's land is reported, not failed: a strict record near a border can have its 5 km cell's middle across it.
7. **The hemisphere rule is always on.** Any minor-side poleward cell is left out.
8. **The basionym rule compares native region sets.**
9. **Maps: per-region files.** There is an exception for the world map past 30 regions, and the close-up is filtered by frame.

## Measured

On the reviewers' 906 live dossiers of 31 October (`/tmp/claude-0/rev85r/D-s/dos`; scripts in `G-s/m/`):

- **Open records under the new rule.** 874 range-tested pages hold 126,986 open records.
  - 126,711 stay in: 118,771 strict, 6,805 margin, 966 coast, 169 island.
  - 275 (0.22%) on 97 pages are refused: 216 inside another region's shape, 59 off any shape in the wrong country.
  - Most refused: Nigella arvensis 28, Pisonia subcordata 13, Laurus nobilis 12, Begonia strigillosa 9.
  - D counted 210 buffer records on non-native land.
- **Typical cells on another region's land** (D4).
  - 6 of 634: Aloe vera (GST), Dracaena trifasciata (RWA), Drosera biflora (CLM), Muscari dolichanthum (NCS), Iris zagrica (IRQ), Stellaria corei (INI).
  - These are D's six, all margin cases. The walk refuses their records; the check lists any that remain.
- **Extremes.**
  - 84 set aside; 24 restored by the 1.5 °C margin at read (step 1).
  - All 84 records read "nothing to report" (`none`). Read now: the 24 restored are `ok`. After the walk, all are `ok` with "read, and set aside".
- **D8.** In this sample, 5 climates have a typical spot whose coldest month is the other hemisphere's. By construction the walk leaves none.
- **Map bytes a page** (both scales, raw).
  - Before: 554,098 on every page.
  - After: median 10,230 and p90 88,710. Pages with more than 30 regions use the 118 kB world file plus only their framed close-up regions.
- **Files.**
  - `maps/r/`: 1.33 MB in 366 files, the largest 32.6 kB.
  - `maps/w/`: 134 kB.
  - The shapes file: 3.63 MB → 4.15 MB (builder only).
- **Shapes script.** 19 s with islands.

## For the owner's PC

None for the shapes or maps: both come in the delivery. The walk is in DEPLOY `### Round eighty-five: geography, records and climate (agent G)`:

```
node scripts\corpus-step.mjs --plan scripts\corpus-plan-r85.txt
```

Paste back:
- the nine `fixed:`/`NOT FIXED:` lines;
- the two count lines;
- `check-ranges-cells.txt` if written.

## Touched outside my files

- **`src/lib/dossier/schema.ts`:**
  - optional `occurrences.admitted` and `edge`, and `climate.admitted`, `edge` and `place`;
  - `setAsideExtremes` restores extremes within the margin;
  - `safeUrls` mends the restored extremes' record.
- **`src/lib/dossier/build-kew.ts`** (N's):
  - `readRecords` gets `inside.admit`;
  - `admissionRecord`, `withPlace` and `extremesUpstream` replace the inline extremes record.
- **`src/lib/dossier/sources/gbif.ts`:** `occurrences` with regions.
- **`src/routes/species/[slug]/+page.server.ts`** (E's): one line, `const points = mapPoints(d.occurrences)`.
- **`src/lib/ui/theme.css`:** the species maps passage only (`--map-range`, `.range`, `.occ-sea`, `.mkey`).
- **`src/lib/core/few-records.ts`:** `place`.
- **`scripts/build-dossiers.ts`:**
  - the check's output and `check-ranges-cells.txt`;
  - `listWalk`, which begins anew on a new rule.
- **Existing tests** (Q's), updated for this round's intended behaviour:
  - `tests/unit/r84g-walk-check.test.ts` (rule and the nine cases);
  - `r84g-maps.test.ts` and `tests/e2e/r84g-maps.spec.ts` (hrefs);
  - `climate.test.ts` (two southern cells now split);
  - `r83c-climate.test.ts` and `r80a-lapse.test.ts` (gaps within 1.5 °C stand).
- **`docs/DEPLOY.md`:** my section only.

**Runs.**
- Unit: every new file, and the files near the change in three batches (one worker each, on a loaded machine). The batches were bulk, climate, the r69 to r84 range, shapes, walk, maps, lapse, names-index, corpus-step and build-corpus files, `r82u-pages`, `r83w-weight`, `r77c-page-cpu` and `r84e-species-words`. All pass.
- Browser: `r85g-maps`, `r84g-maps`, `r77c-maps`, `r83w-weight` and `r84e-species`, Chromium and phone: 23 passed.
- `npx tsc --noEmit -p .`: clean.
- `svelte-check` (3 GB heap): 0 errors, 0 warnings.
- `tsconfig.scripts.json`: only the errors base already has (`build-dossiers.ts` lines with `judged`, `merged` and `Upstream`, none of mine).

## Not done, with why

Nothing. Two things are for the others:
- **E:** the `climate.place` field can also go beside the habitat line's "from N records" if E wants it there. The few-records notice already says it.
- **A:** /about/how needs words for every rule above: the border rule, the islands, the shapes, the margin, the sample, the hemisphere rule, the reasons and the check. The sample's words are given above.
