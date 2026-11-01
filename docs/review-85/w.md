# Review after round 84: reviewer W (the desktop grower and the appearance)

Live site https://cultifolio.com, Worker `63ab1f88`, corpus `8520c2875b2699ba` (`/api/counts`: 48,357 species, 6,493 genera, 37,648 with a habitat climate), 2026-10-31 13:38 to 14:12 UTC. I used Playwright 1.63 with Chromium 141.0.7390.37 (`/opt/pw-browsers/chromium`), headless, with a mouse and a keyboard, `en-US`, `America/New_York`. The scripts, every screenshot, the PDFs and the JSON results are in `/tmp/claude-0/rev85r/W-s/`. The harness is `h.mjs`. The journeys are `j1`, `j23`, `coll2`, `kb`, `j12` and `big`; the page and map checks are `pages`, `mapdom2`, `shapes.py`, `mapzoom` and `look`; the spot checks are `t3` to `t8` (all `.mjs`). I wrote the shared journeys file (`/tmp/claude-0/rev85r/journeys.md`) first, and P has added notes to it. No code was changed and nothing was posted to the site.

## Verdict

**Works with faults.** On a desktop, every central path works end to end:

- the front page, the catalogue and the letter index, with Back keeping the place;
- search, including a reloaded search, older names and the merged name;
- species pages of every kind;
- Compare;
- adding plants from a species page and by typing (a cultivar in curly quotes is now a cultivar);
- spaces, Water all with Undo, a propagation batch, and labels at true size;
- backup, a damaged file refused, and restore;
- units, the reference's photographs on and off, frost with a site, Today, and the example collection, then leaving it;
- 30 and 374 plants, with collection pages ready in 0.23 to 0.53 s.

The site answered no request with an error, and no page logged a console error. No page scrolled sideways at 640, 1024, 1280 or 1920 px, in light or dark.

Round 84 fixed most of what the last review found in my area: 11 of 13 W findings are fixed or half fixed, and 9 of the outside reviews' findings in my area are fixed. What still stops this being a 10:

- **Round 84's own heading change left a false sentence on its 501 changed pages.** Reached by the old name, each page says "the GBIF backbone accepts this species as" Kew's name. GBIF's backbone accepts the old name.
- **San Pedro still falls through on the collection side.** A plant filed as "Trichocereus pachanoi" is told the name is neither a species page nor an older name of one. Yet the search, the picker and the old address all lead to Echinopsis macrogona.
- **The new region shapes are drawn too faintly to read on the world map.** The fill is 1.16:1 against land.

### Scores (desktop)

| Area | Score | Why | What would make it a 10 |
|---|---|---|---|
| User experience | 8 | Every journey completes, and round 84's add-form changes hold (press after typing: added in 104 to 221 ms; curly quotes are a cultivar) | W2, W7 and W9 put right |
| Appearance | 7.5 | Cards now fill their row, the type is calm, dark mode is right and the maps are shapes, not boxes | Readable range fills (W3), decent island close-ups (W4), the lead photograph (W6), and W11's remainder |
| Accessibility | 8.5 | A visible 2 px ring on all 38 Tab stops I checked; maps and the chart are named and described; the picker has `aria-activedescendant`; reduced motion turns every transition off | The range fill passing 3:1 (W3); the front search's arrow keys (queued) |
| Performance (desktop) | 8.5 | Cold front page LCP 988 ms (photographs off). A species page's HTML cold, with the shell cached: LCP 396 to 572 ms. 374 plants: pages ready in 0.23 to 0.31 s | `/labels` shifts by CLS 0.081 (W12); the hero photograph is 480 px shown at 400 CSS px (soft at 2×) |
| Honesty of what pages say (my area) | 7 | "Not checked" is said once per source and never as "none" in a figure | W1's false sentence on 501 pages, W2's false "nor is it an older name", and W9 and W13's wording |

### What I covered

- **Journeys:** all 13 at 1280×800, with round 85's two additions (Ceropegia alstonii by search and by its old address; Echeveria ‘Lola’ typed with U+2018/U+2019).
  - At 1024×768 and 1920×1080: journeys 1, 4 and 13, the add form and Compare.
  - At 640×400 (a 1280 laptop at 200% zoom): the front page, a species page and the add form.
  - In dark mode: journeys 1, 3, 4 and 13, My plants, a plant page, `/about/how`, the maps and the monthly table.
  - With reduced motion: the front page and Today.
- **Species pages, 26 read.** They cover every kind:
  - rich: Echeveria elegans, Sempervivum tectorum, Haworthia cooperi, Galanthus nivalis;
  - keyless "not checked": Aloe framesii, Abies marocana;
  - merged, with its old address: Echeveria desmetiana from peacockii;
  - heading changed to Kew's, with its old address: Hoodia alstonii from Ceropegia alstonii, Anacampseros quinaria from Avonia quinaria;
  - a `g` page: Tylecodon cacaliodes;
  - a hybrid: Kalanchoe × houghtonii;
  - no photograph: Antimima alborubra;
  - no climate: Lithops lesliei, Anacampseros quinaria;
  - from few records: Echinopsis thelegona, Antimima alborubra, Lachenalia haarlemensis, Aloe vera;
  - each cause of extremes set aside:
    - elevation: Echinopsis thelegona, Oreocereus trollii;
    - a 1-in-100 night warmer than the coldest month's mean low: Lachenalia haarlemensis, Eulychnia acida, Aloe vera;
    - a sea cell: Opuntia galapageia;
    - a record low the monthly lows contradict: none found in the sample, so it was not seen live;
  - others: Echinopsis macrogona, Aeonium arboreum, Aloe perryi, Monstera deliciosa, Picea omorika.
- **Maps:** 16 close-ups tested dot by dot against the drawn shapes (`shapes.py`, `mapdom2.json`).
- **Printing:** Sempervivum printed to A4 (`print-sempervivum.pdf`, 6 pages), and labels to Letter (`c2-1280-labels.pdf`).
- **Collections:**
  - 4 plants by hand, then backed up, wiped and restored;
  - 30, then 374 plants by import: 370 pasted lines over 37 names (cacti, stapeliads, bulbs, older names, cultivars in three quote styles, a nothogenus, "sp.", "cf." and a name the reference lacks);
  - the example collection of 12 plants.
- **Requests:**
  - **To cultifolio.com:** 1,368 that reached the network. From the sixth run on I counted these by Resource Timing (`transferSize > 0`). The first five runs are estimates from the measured cache ratio: a second full load fetched 2 of 54 resources from the network. Every request event, cache hits included, totals 6,561.
  - **To third parties:** 386, under the 400 allowed. That includes 186 from one run in which my photographs-off rule did not hold, because Chromium took the environment's proxy; I counted them all. Of the rest, 107 went to iNaturalist and 24 to Wikimedia on the front page, and 14 to iNaturalist for two leads, plus 3 to GBIF's API.
  - upload.wikimedia.org answered **429** to this machine all session, so Commons photographs show their failure state.
  - The log is `W-s/requests.log` and `W-s/count.json`.

## Issues

### W1. Major: 501 pages whose heading became Kew's name say that GBIF's backbone accepts Kew's name, which is false

- **What I did.** I searched "Ceropegia alstonii" and opened the hit. I then opened `/species/ceropegia-alstonii` and `/species/avonia-quinaria` in fresh tabs.
- **What I saw.** Both old addresses answer 302 (`public, max-age=86400`) to `?was=<old name>`. The notice at the top of the page reads:

  > **Ceropegia alstonii** is a synonym: the GBIF backbone accepts this species as *Hoodia alstonii*, and the reference files it under that name.

  Screenshot: `W-s/j23-1280-ceropegiaAddr.png`. Anacampseros quinaria says the same of Avonia quinaria.
- **What GBIF says.** `api.gbif.org/v1/species/9269454` gives Ceropegia alstonii (N.E.Br.) Bruyns as `ACCEPTED`, and `…/5646643` gives Avonia quinaria as `ACCEPTED`. The sentence inverts the sources, on the very pages round 84 changed.
- **How many pages.** Against the live index of 29 October, 501 headings changed, all on pages with a GBIF key. On 416 of them the old heading is now listed in "Also known as … (GBIF Backbone)", which files GBIF's own accepted name as a GBIF synonym.
- **Where it comes from.** `src/routes/species/[slug]/+page.svelte:473`, the last `{:else}` branch, assumes the heading is GBIF's accepted name. That was true before decision 1. Proved by the page and by GBIF's answer.
- **What should happen.** When `was` is GBIF's accepted name for the page's key and Kew's name heads the page, the notice should say: "*Ceropegia alstonii* is GBIF's name for this plant; the reference heads its pages by Kew's World Checklist, which accepts *Hoodia alstonii*." The synonym list should name that line "GBIF's accepted name", not a backbone synonym.
- **Smallest fix.** A fourth branch, keyed on `was` equal to the dossier's GBIF accepted name (or on the index's record of the former heading), with a test over the 501 pages.

### W2. Major (for the owner's own genus): a plant filed as "Trichocereus pachanoi" is told it is neither a species page nor an older name, though every other path finds San Pedro

- **What I did.** I imported "Trichocereus pachanoi" with my 37 names, then opened plant 2026-0010 and pressed "Is it an older name?".
- **What I saw.**
  - The import's review said "not in the reference; added as typed".
  - The plant page answered "No species page under this name, nor is it an older name of one" (`W-s/t6-look-older.png`).
  - The front page's "You grow" tile says "not in the reference".
- **The other paths.**
  - The front search for "Trichocereus pachanoi" and `/species/trichocereus-pachanoi` both reach Echinopsis macrogona.
  - On `/plants/new` the picker's first row is "Echinopsis macrogona · has a species page; older name: Trichocereus pachanoi f. peruvianus" (`t6-Trichocereus_pachanoi.png`).
  - Leaving that field with Tab leaves only "GBIF 7282455" under it: GBIF's own key, not the page.
- **Where it comes from** (my reading of the code). `lookOlder` in `src/routes/plants/[acc]/+page.svelte:157` accepts only `r.why === 'older name'`. A hit found by a variety's binomial (round 84's `name.infra`) has another reason, so it falls to "none". The import's check reads the search the same way.
- **What should happen.** The plant page and the import offer "filed in GBIF under a variety of *Echinopsis macrogona*: file it there?", as the picker does.
- **Smallest fix.** Accept the infra reason in `lookOlder` and in the import's `readSearch` use, with words for it. A test should cover "Trichocereus pachanoi" on the plant page and in the import.

### W3. Major (appearance and accessibility): the region shapes are drawn at 1.16:1 against land, so on the world map a small range is a smudge

- **What I saw.**
  - On Aloe framesii (`W-s/pg-1280-aloe_framesii-map0.png`) the Cape Provinces are a faint green patch, hard to find at all. The page has no marker, because it is keyless.
  - Hoodia alstonii's and Echinopsis thelegona's world maps (`pg-1280-echinopsis_thelegona-map1.png`) are found by their orange marker, not by the range.
  - In dark mode the range is darker green on dark grey (`t4-maps-dark.png`).
- **The figures.** `.map .range` (`src/lib/ui/theme.css:218`) fills `--accent` at `fill-opacity: 0.12`:
  - light: #cdd5c5 on land #e7e2d4, a contrast of **1.16:1**;
  - dark: 1.23:1.

  WCAG 1.4.11 asks 3:1 for a graphic that carries meaning. The dashed outline at 0.6 opacity is the only cue, and at world scale it is a few pixels.
- **What should happen.** At a glance the world map shows where the plant lives.
- **Smallest fix.** At least `fill-opacity: 0.4` on the world map (or a darker tint token) and a solid stroke there. Keep the close-up lighter, so the record dots read over it.

### W4. Minor: island close-ups are coarse and do not register with the coastline, and region names collide

- **What I saw.**
  - **Opuntia galapageia** (`W-s/mz-opuntia-galapageia.png`, at 2×):
    - Isabela is drawn as a few straight segments, and Fernandina as a triangle, offset from the beige land outline.
    - Genovesa is in neither layer.
    - 98 of the 150 "openly licensed records inside the range" lie outside the drawn region shape, up to 0.46°, where the coast rule allows 0.15°.
    - The orange "densest records" marker sits on the sea.
  - **Other pages:**
    - Canary Islands (Aeonium arboreum): acceptable.
    - Northern-hemisphere pages: every drawn dot is inside the drawn shapes, give or take 0.054° (Galanthus 0 of 32 outside; Sempervivum 8 of 1,037 within 0.015°).
  - **Labels:**
    - "Italy" and "Yugoslavia" run into each other on Sempervivum's close-up.
    - "Spain" is printed over the "200 km" scale bar on Galanthus nivalis.
    - "Argentina Northwest" covers one of Echinopsis thelegona's three record dots.

  Montage: `W-s/mont-maps1.png`.
- **Where it comes from** (my reading). `static/app/maps/regions50.svg` is simplified past an island's own size, while the range test uses `scripts/tdwg3-shapes.json`.
- **Smallest fix.**
  - Keep every ring of an island region at the land layer's resolution.
  - Draw the region over the land's own outline where they coincide.
  - Drop or nudge a label that overlaps another label, the scale bar or a dot.

### W5. Minor: the monthly figures table loses July to December in print, and hides September to December on a desktop screen

- **What I saw.**
  - **In print.** Sempervivum's printed A4, page 3 (`W-s/prs3-crop.png`), shows "Figures by month" for January to June, and the July column is cut at the page edge.
  - **On screen.** The table is 1,430 px wide in a 980 px scroll box (`.scroll-x`). At 1280 and 1920 px, four months are off to the right, with no visible cue (`t4-table-dark.png`).
- **Smallest fix.**
  - In print: months as rows (12 short rows), or two half-year tables.
  - On screen: the same, or a fade at the right edge with "scroll for Sep–Dec".

### W6. Minor: the flagship lead photograph is unchanged, so round 84's rule did not reach the case that prompted it

- **What I saw.**
  - **Echeveria elegans** (photographs on, `W-s/t8-echeveria-elegans.png`) still leads with pmallard's planter: a hand holding a black plastic label, grass blades, and rosettes half under flower stalks. The strip right under it holds a clean rosette (the 4th tile).
  - **Echinopsis thelegona** leads with a desert-garden shot with a label stake (`crop-thel-top.png`).
  - **What improved.** The first row is now spread across six different observers on both rich pages.
  - **What remains.** Each lead is iNaturalist's 480 px "medium", shown at 400 CSS px, so it is soft on a 2× screen.
- **What should happen.** A lead that shows the plant.
- **Smallest fix** (a rule, not a hand edit).
  - Prefer, among the cultivated set, the photograph with the most iNaturalist favourites, or one whose observation is research grade and has a single subject.
  - Load the `large` size when `devicePixelRatio > 1`.

### W7. Minor (desktop against phone): with one species picked, the desktop tray has no way to the compare page, and the species page's "In compare ✓" removes it when pressed

- **What I saw.**
  - After Compare on Echeveria elegans, the desktop tray reads "COMPARE Echeveria elegans × pick one more clear". "pick one more" is plain text (`W-s/kb-j5-pill.png`).
  - The action under the name becomes "In compare ✓", styled like the "Sow seed" and "Follow" links. Pressing it took the species out, and `/compare` then held one column: the second species only.
  - The phone pill does link to `/compare` with one pick (`CompareBar.svelte:26`). The desktop line `CompareBar.svelte:20` renders `<span class="hint">pick one more</span>`.
- **Effect.** Journey 5 as written (compare from the species page, then add the second through the compare page's own picker) cannot be done on a desktop without the footer link.
- **Smallest fix.** Make "pick one more" a link to `/compare`, and word the species page's toggle "Remove from compare" once a species is in it.

### W8. Minor: the "You grow" tile of a plant filed under a genus shows "loading…" for ever

- **What I saw.** The front page with Echeveria ‘Lola’ (a cultivar, species not stated) and × Graptoveria ‘Fred Ives’ shows a grey tile reading "loading…". It still read so after 8 s (`W-s/t3-front-8s.png`, `t5-front-tiles.png`).
- **Where it comes from.** `src/routes/+page.svelte:774`: a genus tile has no `thumb`, `thumbOff`, `climate` or `missing`, so it falls to the last `{:else}`, "loading…". Proved by the DOM (`t3.mjs` output).
- **Smallest fix.** A `{:else if c.genus}` branch with the Placeholder captioned "genus".

### W9. Minor: a plant filed by an older name says "not in the reference" and "No species page under this name"

- **What I saw.**
  - After an import that kept the names as typed, the tiles read "Aloe aristata · not in the reference", "Avonia quinaria · not in the reference" and "Ceropegia alstonii · not in the reference" (`t5-front-tiles.png`).
  - The plant pages read "No species page under this name · Is it an older name?" (2026-0017, 2026-0023).
  - Yet the reference holds all three as older names, and their addresses redirect to Aristaloe aristata, Anacampseros quinaria and Hoodia alstonii.
- **What works.** The import did offer "an older name: the reference has this species as … Use it · on all 10 lines of this name", and the picker says so on `/plants/new`. Round 84's W6 is therefore half done.
- **Smallest fix.** On tiles and the plant page, say "filed by a name the reference does not head" until it is asked. Better: run `lookOlder` when the page opens, since it is one cached search.

### W10. Minor: a second pasted list leaves out new plants as "imported before"

- **What I did.** I pasted 26 lines and added them. Later I pasted 370 different lines that used the same 37 names, in another order.
- **What I saw.** "26 lines were imported before (every plant they make is here), so they are left out". 344 plants were added, not 370.
- **Where it comes from.** A pasted line's key is its name, cultivar, number, source and notes plus an occurrence index (`src/lib/import/rows.ts:26-27`). The first "Haworthia truncata" of any later paste is therefore "the same plant" as the first of an earlier one. The date acquired is not in the key.
- **Who it hits.** A grower who pastes this month's purchases loses the ones whose name they already imported. It is said, but in words that say they were duplicates.
- **Smallest fix.** Put the date acquired (or the paste's own date) into a paste's key, or ask "These 26 names were imported before: add them again as new plants?".

### W11. Minor: round 83's polish, still left (W11 of the last review)

- **Counts written with ×.** "× 10" chips on every "You grow" tile (`src/routes/+page.svelte:773`, `` `× ${own.length}` ``), beside "× Graptoveria", "Aloe × nobilis" and "Kalanchoe × houghtonii". Better: "10 plants".
- **The plant page's name card is inset.** It spans x 165 to 1101, while the buttons and cards below span 143 to 1123 at 1280 px (`c2-1280-02-j6-cultivar-curly.png`).
- **The caps line under a tile's name** is the common name on some tiles (SPIRAL ALOE, CHAUTLE-LIVING ROCK) and the family on others (ANACAMPSEROTACEAE, AIZOACEAE), in one style (`t5-front-tiles.png`, `j1-1280-haworthia-open.png`).
- **Compare's photograph cards** are 360 px tall: 1024 px is a screen of two blank grey slabs with no words when the photographs fail, and the first figure sits at y 1,075 (`lk-1024x768_compare_…png`).
- **Three failure looks for a photograph:**
  - the hero's "photograph did not load";
  - the strip's blank squares, with no words (light and dark);
  - the catalogue's "photograph did not load" tile.
- **The open catalogue row's own thumbnail** is an empty grey square (`j1-1280-haworthia-open.png`).

### W12. Minor: words and numbers a careful reader trips on

- **The elevation correction.** It reads "-1257 m" (a hyphen, no thousands separator) beside "4,124 ft (1,257 m)" in the same sentence, and in metres first when °F is set (Echinopsis thelegona's climate notice).
- **The label care line** breaks inside "(1 in 100": "floor 32.5 °F (1 / in 100, NASA POWER)" (`lbpdf-crop.png`). A non-breaking space after "1" would keep it together.
- **The hero credit** breaks a date across lines, "2024-05- / 25" (Haworthia cooperi, `t8-haworthia-cooperi.png`).
- **Today's frost line** reads "Cold night ahead: 35.2 °F around 07:00 Monday", for a night 9 days away (2026-11-09). The front bar adds the date; Today should too.
- **"Gymnocalycium sp."** sets "sp." in italic on My plants (`big-400-plants.png`). Botanical convention keeps it roman.
- **The rain bar** reads "bar 0 to 47.2 in" (1,200 mm converted). "0 to 48 in" would read as a scale.
- **The add form's status under a picked name** shows "GBIF 8315197": a database key, not words.
- **`/labels` shifts by CLS 0.081** on every load, with 30 or 374 plants (`big-R.json`).

### W13. Minor: rule 2's wording on keyless pages, and one author-facing line left

- **Wording on keyless pages.**
  - Aloe framesii's and Abies marocana's record reads "RECORDS none read · see under the name".
  - "Related" reads "Similar habitat climate None to compare: this page has no habitat climate".
  - The records were not checked, so "not checked · see under the name" says it truly. The "None" sits where a reader scans for a figure.
- **The author-facing line.** Abies marocana's English-names notice reads "English names not checked: carried from build of 2026-10-22 (rederive); that build: not asked: two items …". It is still the builder's own words.

### W14. Minor: the top bar at 640×400 (200% zoom on a laptop)

- **What works.** Round 84's fix holds: the five places show.
- **What does not.**
  - The breadcrumb is cut to "SPECIE" under the navigation pill, with no ellipsis (`lk-640x400_species_echeveria_elegans.png`).
  - The add form's held status room leaves an empty band of about 80 px under the Species field before "How to write cultivars and hybrids" (`lk-640x400_plants_new.png`).

## The round-84 reviews' findings in my area

| Finding | Status | What I saw |
|---|---|---|
| W1 regions as rectangles | **Fixed** | Shapes on both maps (`regions110/50.svg#CPP` …) |
| W1, readability of the shapes | New | W3 |
| W2 lead and first row | **Half** | The first row is spread across observers; Echeveria elegans' lead is unchanged (W6) |
| W3 glance grid | **Fixed** | Four cards of 236 px fill the row at 1024, 1280 and 1920 |
| W4 older name on a search hit | **Fixed** | "Dracaena trifasciata · older name: Sansevieria trifasciata" with `?was=` |
| W5 cultivar as hybrid | **Fixed** | Echeveria ‘Lola’ (curly) is "CULTIVAR, species not stated" in the picker, the plant page and My plants |
| W6 older name leaves a plant without a page | **Half** | The picker and the import offer the page; the plant page asks; San Pedro is answered wrongly (W2); tiles say "not in the reference" (W9) |
| W7 provenance card | **Fixed** | "›" and "OPEN" |
| W8 restore says "never" | **Fixed** | "last today, restored from a file" at once |
| W9 field number "none" | **Fixed** | No "none" on the plant page |
| W10 print | **Fixed** | Sheets open, buttons and tabs hidden; new: the monthly table is clipped (W5) |
| W11 inconsistencies | **Half** | The rain bar (0 to 78.7 in on Sempervivum) and the floor nudge are fixed; the rest is W11 above |
| W12 author sentence in the name card | **Fixed** | Moved to "Names & registers" (thelegona's "Cactus") |
| W13 console error, C2PA | **Fixed** | No console error in any run; no C2PA or "anthropic" bytes in `static/app/*.png` or `favicon.svg` |
| A6a "another author" with no author | **Fixed** | Sempervivum: "Same spelling, another plant …" |
| A6e repository path | **Fixed** | Echeveria desmetiana: "the key of a page merged into this one". Ferocactus not opened |
| A7 author wording | **Half** | Mostly gone; Abies marocana's "(rederive)" line is left (W13) |
| A9 cultivar as hybrid | **Fixed** | As W5; × Graptoveria ‘Fred Ives’ is rightly "hybrid" |
| A10 "not checked" eight times | **Fixed** | Abies marocana: once per source (records, photographs, English names) |
| A11 print | **Fixed** | As W10 |
| A13 smaller trips | **Mostly fixed** | Fixed: the licence said once ("CC0 · pmallard · in cultivation · date"), the bar, the nudge, the restore sentence. Left: the search box's ArrowDown (no `aria-activedescendant`; queued) |
| A17 navigation at 640×400 | **Fixed** | With W14's clipping |
| A, the front strip | **Fixed** | Ficus carica, Aloe vera, Pelargonium inquinans, Lagerstroemia indica, Citrus maxima, Picea pungens. The fig's photograph has an animal in front of the leaves |
| B8 maps' captions | **Fixed** | Both maps `aria-describedby` their captions; the chart is named and described |
| P4 compare pill everywhere | **Fixed** | Not on `/plants/new` or collection pages |
| P9 few records only in a title | **Fixed** | "from few records: 3 in 3 cells" in visible text, linked |

## Confirmed working

- **Search.**
  - "echeveria": "30 of 256", then "90 of 256" after Show more. It settles 596 ms after the last key. Back keeps the query, the 90 and the place (top 329 before and after). A reload keeps it.
  - "snake plant": Dracaena trifasciata.
  - "Echeveria peacockii": Echeveria desmetiana first, "merged into this page", then Dudleya pulverulenta "older name".
- **The catalogue.** By genus, H, Haworthia (59 species, 20 with climate), a species, Back: the tile was 237 px from the top before and 234 after.
- **The add form.** Add pressed right after typing added Echeveria ‘Lola’, Haworthia cooperi and Lithops lesliei in 104 to 221 ms, never lost. After Tab the species list was closed. Keyboard: "Huernia zeb", ArrowDown, Enter took "Huernia zebrina".
- **Spaces, watering and propagation.**
  - A new space from the plant page: "Moved to Windowsill · Undo".
  - Water all: "Watered 1 plant. Undo", then "Undone: the 1 watering line removed.".
  - Leaf cuttings, 6: "S2026-001 … STRUCK 1 / 6 17%", linked from the plant.
- **Labels.** Avery 5160 cells of 252×96 CSS px (2⅝ × 1 in), QR codes, and the care line from NASA POWER.
- **Backup and restore.**
  - Backup: 3,454 B for 4 plants. The half file was refused: "That file is not a readable zip … Nothing on this device was changed."
  - Restore after a wipe: "Merged: 4 plants, 1 space, 1 propagation batch and 8 timeline entries added. 137 changes taken in", and the IndexedDB counts were equal.
  - 374 plants backed up in 0.39 s (69,591 B).
- **Units.** °C and °F switch every species card and the plant page. The set-aside cause follows the units ("weather cell 1,257 m higher" and "4,124 ft higher").
- **Frost.** With a Pittsburgh site: a 10-night table, MET Norway and NOAA credited, the fetch time stated, and the front bar's date given.
- **The example collection.** 12 plants. Leave returns to `/`, `/plants` is empty, and IndexedDB holds 0 changes.
- **Dark mode.** Body #121614 on #e8eeeb. The cards, the chart and the notices read well.
- **Reduced motion.** Every transition and animation is `0s`.
- **Keyboard.** The front page (14 stops) and a species page (24 stops) each showed a 2 px #12795a ring on every stop, in a sensible order.
- **The accessibility tree** of Hoodia alstonii:
  - h1, then h2 sections and h3 cards;
  - the maps named "Native range of …" and "Openly licensed records of …", described by their captions;
  - the chart titled and described.
- **Timings.**
  - **Cold front page (fresh profile):** TTFB 456, FCP and LCP 988 ms, CLS 0, 16.6 kB of HTML.
  - **A species page's HTML cold, the shell cached:** Sempervivum TTFB 235, LCP 396 (40.0 kB); Abies marocana LCP 572.
  - **Warm species pages:** LCP 360 to 1,060 ms.
  - **30 plants:** `/plants` 249 ms to every row, `/today` 229, `/` 528, `/places` 247, `/labels` 235.
  - **374 plants:** 308, 264, 227, 236 and 308 ms.
  - **Imports:** checking 26 lines took 3.5 s, and 344 lines 5.0 s; adding 344 took 2.0 s.

## Mobile against PC (the thirteen journeys)

These are the desktop results at 1280×800. The phone column is P's (iPhone 13; see `review-p.md` and P's notes in `journeys.md`). Where I know the phone build's difference from the code or from P's notes, I say so.

| # | Journey | Desktop (1280) | Phone | What differs | Right? |
|---|---|---|---|---|---|
| 1 | Front page, by genus, H, Haworthia, a species, Back | Works. 48,357 · 37,648; Back held (237 → 234 px). Cold LCP 988 ms | P | The phone's tab bar against the desktop's top segment | Deliberate |
| 2 | "echeveria", Show more, open, Back, reload | Works: 30 → 90 of 256, query and place kept, reload kept | P | — | — |
| 3 | snake plant; Sansevieria trifasciata; Echeveria peacockii and its address; **Ceropegia alstonii** and `/species/ceropegia-alstonii` | Works, with W1's false sentence: Hoodia alstonii "older name: Ceropegia alstonii" first; the address 302s to `?was=`; the notice says GBIF accepts Hoodia | P | Same words on both | Gap on both (W1) |
| 4 | Keyless Aloe framesii | Works: "GBIF's records not checked" once, the range drawn, "none read" in The record (W13) | P | — | — |
| 5 | Compare from the species page, the second through the compare page | **With faults:** no link to `/compare` with one pick; "In compare ✓" removes it (W7). Through the footer link: two columns, figures below 360 px photographs | P | The phone pill links to `/compare` with one pick; the desktop tray does not | Gap (W7) |
| 6 | Add from the species page; **Echeveria ‘Lola’ typed** | Works: 2026-0001 "plant from Seed swap", 216 ms; ‘Lola’ is "CULTIVAR, species not stated" (2026-0002) | P (adds Crassula “Buddha’s Temple”) | P's numbers after it are one higher | Deliberate |
| 7 | Space, Water all, Undo, water | Works (toast and Undo) | P | — | — |
| 8 | Leaf cuttings 6, one struck | Works, linked both ways | P | — | — |
| 9 | Two typed adds (Add at once), labels, print | Works: added in 126 and 221 ms; labels at true size; care line splits "(1 / in 100" (W12) | P | — | — |
| 10 | Back up, damaged file, wipe, restore | Works; the header says "last today, restored from a file" at once | P | — | — |
| 11 | Units, reference photographs on and off | Works: °C/°F everywhere; 0 third-party requests with photographs off on the plant page | P | — | — |
| 12 | Example collection, leave | Works: 12 plants, opens on Today; Leave → `/`, 0 changes left | P | — | — |
| 13 | Echinopsis thelegona, a winter decision | Works in under a minute. The cold card reads "46.4 °F Jul at the habitat, not a floor; extremes set aside: weather cell 4,124 ft higher"; "from few records: 3 in 3 cells"; the notice gives the set-aside figures (27.5 °F lowest night, 41.9 °F 1-in-100); "-1257 m" (W12) | P (with "Habitat in short") | The phone has the "Habitat in short" line above the photographs; the desktop shows the four cards instead | Deliberate (decision 3) |

## Not checked, with why

- **Commons photographs** (Wikimedia answered 429 all session), and most leads: the third-party budget ran out at 386 of 400. I judged two leads with photographs on (Echeveria elegans and Haworthia cooperi), plus the front strip, Hoodia alstonii, Aloe framesii and Echinopsis thelegona.
- **The service worker, offline and sync:** P's and C's; the brief forbids vaults.
- **A record-low extremes cause on a live page:** none was in my sample. The words come from `lapseCause` and were checked in code only.
- **The about pages sentence by sentence:** S's. I opened `/about/how` in dark mode only.
- **400 exactly:** the import's key rule (W10) left 26 lines out, so the large collection was 374 plants.
- **A real 2× screen, Firefox and WebKit:** not available here.

## Needs from the PC

None.
