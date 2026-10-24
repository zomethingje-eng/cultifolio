# Round 82, agent U: the pages

Copy `/tmp/claude-0/rev82/U/`, branch `r82` from `r82base`, 10 commits, last `4508612`. Scratch `/tmp/claude-0/rev82/U-s/` (screenshots in `shots/`; the base build's worktree, used for the base runs, is removed).

Everything is the app's (pages, CSS, two small UI modules) and its tests. Two rules the index also reads changed: the lead photograph (`heroOf`, `src/lib/dossier/dedupe.ts`) and a CC0 tile's credit (`tileCreditOf`, `src/lib/ui/ref/head.ts`). No change to `scripts/`, `scripts/build-dossiers.ts`, the plan, the schema, `package*.json`, `wrangler.jsonc` or `static/s/`. **All of it is safe mid-fill**: no dossier is touched; the pages arrive with `npm run deploy`; the two index-read rules reach the live index at step 12's `--index` if delivered before about 2026-10-26.

## Done

Tests: `tests/unit/r82u-pages.test.ts` (17) and `tests/e2e/r82u-pages.spec.ts` (15 tests, `chromium` and `phone`). On a build of `r82base`: the unit file fails to load (no `$core/few-records`); the spec gave 27 failed, 1 passed (test 15, the width guard, by design). Log: `U-s/base-run.log`. Every spec blocks the worker, answers or refuses photographs itself, uses `window.scrollBy`, and puts missing fields into `__data.json` on a client-side visit (r73p's pattern), so nothing leans on Chromium's timing.

1. **"Not checked" said once (review 1's 10).** `species/[slug]/+page.svelte`: a notice `#records-unchecked` under the name card gives the page's own reason (`uncheckedSentence`) and what follows from it. The Cultivation, Climate, close-up map caption, Evidence line and Related now say "not checked" and link to it. The duplicate Climate pill is gone. Echeveria alpina printed the sentence five times; Hesperocyparis now prints it once outside the record of sources (e2e 1).
2. **No empty Papers section (23).** No section and no tab while `literatureOff`. A source that refused is still said. `/about/how` says so, and that the record of sources says why (e2e 2).
3. **Climate chip (11).** `+page.server.ts` sums the rows' `notChecked`/`pending` (from the `noclimate` rows under the other chips). The chip reads "No climate, 9,653" with "920 not checked" on a second line. The line under the chips says "without habitat climate: N with none derived, N not checked, N pending". The chip was renamed from "Without climate" to keep the desktop toolbar on one line at 1024 px (e2e 3; smoke-1/3 follow).
4. **Close-up map (12).** `src/lib/map/still.ts`: a dashed graticule at a round step, a scale bar in km at the frame's foot (measured at that latitude), and the page's own native regions named at their boxes. Names are HTML laid over the SVG, so they stay 11 px at every width. Largest box first, at most eight, no overlap, none outside the frame. Styles in `theme.css` (e2e 4, unit).
5. **Lead photograph (13).** `heroOf`: iNaturalist's cultivated set first, in its own order, then the old order. Of those, it takes the first that is not upright by its stated shape; unknown shapes (GBIF) keep their place. Compare uses `heroOf` too. On 604 live pages with photographs, the lead changes on 247, and upright leads fall from 276 to 29. None of these pages has a cultivated photograph yet (the fill is still adding them). Echeveria elegans now leads with Kurt Stüber's 640×480 file. `r69k`/`r70c` tests follow (e2e 5, unit).
6. **Scroll-spy (19).** Headings landed 176 to 181 px down: the page's `scroll-padding-top` and the 120 px margin both counted the top bar. The margin is now 64 px, and the spy's line is padding + margin + 8 (e2e 6: `#s-climate` marked Cultivation on the base).
7. **Compare (20, review 2's 5).** Regions show "+N", using Kew's names (`unitName`). The "Rain a year" figure says it is the median of the cells' yearly totals. Under "Rain", each column says its figure is the twelve monthly medians added, and that the two need not agree (e2e 7).
8. **Range heading (21) and units note (22).** New `src/lib/ui/ref/range-words.ts`: the world map's caption depends on what the page has: Kew's range, a checklist's unverified one, regions only reported present, no range with its reason, or not checked. The Native cell adds "regions are the level-3 units of the WGSRPD, as Kew records ranges, some under historical names", linking to a new `/about/how#regions` sentence (e2e 8).
9. **Desktop text (24).** `theme.css`: `--fs-md` is 15 px at 701 px and wider (it was 13.5). Phones are unchanged (e2e 9).
10. **First screen (review 2's 7) and 44 px (6).** On a phone the welcome's first sentence is "A reference to N species, every figure sourced, and a record of your own plants, kept on this device." The feature list waits; the pitch already waited. "See the example collection" is a 44 px button on a phone or any coarse pointer. On a desktop it is the theme's 36 px mouse target, and the old welcome sentence stays beside the pitch (e2e 10). It still fits r63v V4's phone budgets and r62bw's desktop first screen.
11. **"Popular genera".** The chip, its title, the line under it, `/about/how` (twice, adding "a measure of genera and not of species or of growers") and the code comments. r75g's specs and test follow (e2e 11).
12. **Thin climate (40).** New `src/lib/core/few-records.ts`: under 12 records or under 5 cells. The mark sits beside "Habitat figures" (counts in its title), a line under the figures gives the counts, and a notice heads the climate section. Nothing is removed; the old "under a dozen" line is replaced. `/about/how` gives the line and the count (e2e 12). Figures under Measured.
13. **"author not stated".** `head.ts` `shownAttribution`: iNaturalist's bare "no rights reserved", a line that is only a licence, or one starting with its comma all read "author not stated, …". It applies to the hero, gallery, strip, compare, alt text and `photoCredit`. A tile reads "Photo: CC0, author not stated": `tileCreditOf` writes it for the next index, and `tileCredit` reads a bare-licence credit in today's index the same way (live: 5,461 tiles) (e2e 13, unit).
14. **TypeError (review 2's lead): found and fixed.** Compare's `use:loaded={key}` returned `failedBeforeHydration`'s `{update}`. When the columns were drawn again (the hemisphere read once the site loaded), Svelte passed the key string to `update`, which replaced the failure callback. The next image error then threw. Reproduced on the base: e2e 14 got `["n is not a function", "n is not a function"]`, and the failed photographs kept their credits. Fixed twice over: compare's action has its own `update`, and `failed.ts` ignores anything that is not a function (unit, e2e 14).
15. **320/375/430 and desktop.** e2e 15 checks the front page, the noclimate chip, an unchecked species page, a full one and compare for no horizontal scroll at each width. I took screenshots of each change at 320, 375, 430 and 1024/1280 and looked at them (`U-s/shots/`).

## Repairs for the live site

None. The app applies everything on deploy. Tile thumbnails follow at the next `--index`; tile credits read right at once.

## Needs

- **F / S (shared `+page.svelte`, species page, `/about/how`)**. My edits:
  - **species page**: imports; `few`, `litOff`, regionMap labels; the `#records-unchecked` block after `.top`; pills condition; Cultivation, Climate, mapcap, evidence and Related wording; Papers block; spy line; `h2.sec` scroll margin; hero/strip credits; `#range-caption`; `#units-note`.
  - **`+page.svelte`**: the welcome `<p id="welcome">` and its CSS; the noclimate and grown chips; `noneN`; seccount; chip CSS.
  - **`+page.server.ts`**: the `without` sum and two return fields.
  - **`/about/how`**: the Popular genera sentence and the rows sentence (line 40, 78); the papers sentence; the few-records sentence (51); the `<span id="regions">` before "Regions where WCVP records…".
- **F**: if the index or dossier should carry the few-records counts for tiles, that is yours; the pages need nothing more.
- **Coordinator**: `tests/unit/r70b2-follow-42.test.ts` fails 32 of 86 on `r82base` too ("no fixture: api.gbif.org/v1/species?…Othonna linearifolia"). This is not mine; most likely the FUZZY hotfix asks GBIF something its recorded fixture lacks.

## For the owner's PC

1. Predeploy runs `r82u-pages.spec.ts` and the edited specs (r75g, r76p, r78b, r79k, smoke-1, smoke-3) in WebKit, the WebKit phone and Firefox; they have not run there. Edited unit tests: r62bw-words, r69k-sizes-lead, r70c-photo-kind, r71f-page-words, r74-growers, r75g-opening-rule, r78b-literature, r79m-kew-keys, r80r-no-key.
2. Deliver before the fill's last day so step 12's `--index` writes the new lead thumbnails and "CC0, author not stated" credits. After that, the next `--index`.

## Measured

- **The few-records line**, on 504 live dossiers with a climate from the reviewers' copies, weighted by the live index's `open` count. `open` equals each sampled dossier's `nOpenInRange`, 504 of 504. Pages marked, of 37,788:

  | Line | Pages marked |
  |---|---|
  | fewer than 5 records | ~1,290 |
  | fewer than 10 records | ~3,890 |
  | fewer than 12 records | ~4,820 |
  | fewer than 20 records | ~6,830 |
  | fewer than 5 cells | ~1,500 |
  | fewer than 10 cells | ~4,810 |
  | **12 records or 5 cells (chosen)** | **~4,880** |
  | 20 records or 10 cells | ~7,030 |

  The fewest cells seen is 3. Peperomia graveolens (live: 4 records, 4 cells) is marked.
- **Index climate**: 37,788 ok, 9,653 none, 920 pending. All 920 pending pages have no GBIF key, so they are the "not checked" ones.
- **Unit suite**, once, alone: 4,565 passed, 36 failed, 10 skipped. Of the 36, 32 were r70b2 (fails on the base too) and 4 were source-string tests of lines I changed; all four were updated and pass (112/112 in those files). `tsc --noEmit` exit 0; `svelte-check --threshold error` 0 errors, 0 warnings.
- **Browser**: affected older specs, 135 + 83 runs. Final failures found in r62bw, r76p and r63v were fixed (r76p's "desktop unchanged" figures updated on purpose, with the old ones kept in a comment). The new spec: 34/34 with r76p.
- **Full browser run** (`chromium` and `phone`, under the lock, port 4804, CI_STRICT): 658 passed, 1 failed, 5 skipped (18.0 min). The failure was smoke-3's preload test, which expected the fixture's wild first (900); the cultivated set's first (1000) now leads, by design. I updated the test, and it and the new spec then passed under the lock (29/29).
- **Live requests**: 9 (7 dossiers, a species page, a compare page).

## Not done, with why

- **Coastline detail** on the close-up (review 1's 12, first half): the 1:50m Natural Earth file is all the app serves; a finer one is a new static asset and page weight (round 83's).
- **Few-records mark on catalogue tiles**: the index carries no record counts; the decision named the card and the climate section.
- **WebKit and Firefox**: not available here.
