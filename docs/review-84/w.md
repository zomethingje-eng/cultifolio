# Review before round 84: reviewer W (the desktop grower and the appearance)

Live site https://cultifolio.com, Worker from `ba78fb9`, corpus `e8885155673882ba`, 2026-10-29 21:25 to 22:40 UTC. Playwright with Chromium 141.0.7390.37 (`/opt/pw-browsers/chromium`), headless, mouse and keyboard. The journeys ran at 1280×800. I also checked 1024×768, 1920×1080, 640×400 (the 1280 layout at 200% zoom), dark mode and print. Scratch, scripts and every screenshot are in `/tmp/claude-0/rev84r/W-s/`. The harness is `h.mjs` and `run.mjs`, from round 81. The scripts are `j1`–`j12`, `pages`, `photos`, `look`, `kb`, `add`, `big1`/`big2`/`big5`, `tim2` and `nojs` (`.mjs`). The shared journeys are in `/tmp/claude-0/rev84r/journeys.md`. I wrote it first, and P has added notes to it.

## Verdict

**Works with faults; ready to show the public once two appearance faults are fixed.** On a desktop, every central thing works end to end:

- browse, search (including a reloaded or shared search, which was broken in round 81) and compare;
- read species pages of every kind: rich, keyless "not checked", merged and its old address, `g`, hybrid, no photograph, no climate, "from few records" with extremes set aside;
- add plants from a species page, typed, as a cultivar, a hybrid, a name the reference lacks, and 400 at once by import;
- give plants spaces, water, Undo, propagate, print labels at true size, back up, wipe, refuse a damaged file and restore;
- change units, try the example collection and leave it.

No page scrolled sideways at any width. Focus was visible on every Tab stop I met (66). The console showed nothing but the harness's own service-worker warning, plus one manifest-icon error. No request to the site failed. The Add press during the name check was not lost in Chromium.

What a design-minded grower notices first:

- The habitat figure cards are squeezed into two thirds of the row on every species page with a climate.
- Kew's regions are drawn as dashed rectangles labelled with region names, over sea and over neighbours, on both maps of every page.
- The lead photograph of Echeveria elegans, the flagship succulent, is a cluttered shot with a hand and a plastic label.

Nothing I found loses data or breaks a rule outright. Five of round 81's nine issues in my area are fixed, two only partly (W5, W4); one I did not recheck (W7), and one was a symptom of my blocked images (W9).

**Scores (desktop).**

- **User experience 8:** every journey completes. The leftovers are older names (search row, add form) and a cultivar called a hybrid.
- **Appearance 7:** clean type and a calm palette, but cramped figure cards, rectangle "ranges", weak leads and three different photograph placeholders.
- **Accessibility 8.5:** visible focus, named maps and charts, a proper combobox. Tile link names start with placeholder text.
- **Performance (desktop) 8:** a warm species page paints in 140–212 ms. Cold species pages have an LCP of 496–1,412 ms. With 400 plants, collection pages are ready in 0.3–0.8 s.
- **Honesty of what pages say (my area) 8:** "not checked" never reads as "none", with one exception: a blank field number reads "none". The few-records and set-aside notices are clear.

**What I covered.**

- **Journeys:** all 13 at 1280. Journeys 1, 2, 4, 6 and 13 were also at 1024 and 1920, and 1, 3, 4 and 13 in dark mode.
- **Species pages:** 18 read, 7 of them full length (Echeveria desmetiana, Aloe framesii, Echinopsis thelegona, Tylecodon cacaliodes (a `g` page), Mentha × piperita, Antimima hantamensis, Lithops lesliei). Three were read with photographs on (Echeveria elegans, Haworthia cooperi, Lithops lesliei). Sempervivum tectorum was read with scripts off and printed to A4.
- **Collections:** one of 10 plants (made by hand, 6 typed name kinds, 2 races) and one of 400 plants (imported: 120 names, older names, cultivars, crosses, "sp.", "cf.", names not held).
- **Searches:** 6 on the front page, plus 120 distinct names through the import's check.
- **Requests:**
  - About **1,590 to cultifolio.com**, over the brief's 1,500. 263 went to the import check (it asks `/api/search` once per distinct name: 111 searches and 22 `/api/entries` for 120 names), and 153 to a last run whose request routing turned the browser cache off.
  - **293 to third parties**, of which 221 were journey 1's front page with photographs.
  - upload.wikimedia.org answered **429** to this machine all evening, so Commons images show the "did not load" state.
  - No sync, no POST.

## Issues

### W1. Major: the maps draw Kew's regions as labelled rectangles, so the "native range" covers sea and neighbouring countries

- **What I did.** I read the Natural habitat section of 5 pages in full-page screenshots.
- **What I saw.**
  - **Aloe framesii:** "Cape Provinces" is a dashed box from the Atlantic to the Karoo, half of it sea, on both the world map and the close-up (`W-s/pg-aloe_framesii-0.png`, `-1.png`).
  - **Echeveria desmetiana:** the close-up is one flat green field with a dashed corner. The "Mexico Central" box fills the frame at a 50 km scale, so the map shows no land, coast or shape, only a big marker (`W-s/j3d-1.png`).
  - **Echinopsis thelegona:** a featureless green field labelled "Argentina Northwest" with 3 dots (`W-s/pg-echinopsis_thelegona-1.png`).
  - **Sempervivum tectorum (printed):** overlapping rectangles labelled France, Austria, Germany and Spain over Europe (`W-s/prs-3.png`).
  - The caption says "Native range as published by WCVP". A grower reads the box as the range.
- **Where it comes from.**
  - `src/lib/map/still.ts:19-26`: `boxRects` draws each region's bounding box as a `<rect class="range">`, in both `worldSvg` and the regional map.
  - Round 82's fix (names, scale bar, graticule) put names on the boxes, which makes the rectangles look more like a claim.
  - The real shapes exist: `scripts/tdwg3-shapes.json` was rebuilt in round 83 for the climate rule.
- **What should happen.** The world map draws the regions' simplified shapes. The close-up does the same, clipped to the frame. Where a region contains the whole frame, the map says "inside Mexico Central" rather than painting the frame green.
- **Smallest fix.** A static `regions110.svg` of the level-3 shapes (simplified like `land110.svg`), `<use>`d per region id like the coastline, so page weight barely moves. Failing that, draw the boxes without fill and caption them "bounding boxes of Kew's regions".

### W2. Minor: the lead photograph and the first gallery row are chosen mechanically, and a flagship page leads with a poor shot

- **What I saw** (photographs on, `W-s/ph-echeveria-elegans.png`, `-gallery.png`):
  - **The lead.** Echeveria elegans leads with a cultivated photograph of a planter. A hand, a black plastic label and grass blades cover a third of it, and the rosettes are half hidden by flower stalks (pmallard, CC0). The strip right under it holds better rosette shots.
  - **The gallery's first six.** They are three photographs from each of two observers. Jordi Martínez Martínez's three are near duplicates of one clump, shot through a round, vignetted lens.
  - **Other pages.** Lithops lesliei's and Haworthia cooperi's leads are fine (`ph-lithops-lesliei.png`).
  - **The credit over the hero** says the licence twice: "CC0 · pmallard, no rights reserved (CC0)" and "CC BY · (c) Oleksandr Shynder, some rights reserved (CC BY)".
- **Where it comes from.** `heroOf` (round 82, U 5) takes the cultivated set's first photograph that is not upright. Nothing looks at the content, and the gallery does not spread across observers.
- **What should happen.** A lead the owner would choose. A fixed rule can at least prefer a cultivated photograph whose observation has more than one photograph. Spread the gallery's first row across observers. State the licence once in the overlay.

### W3. Minor (the first thing to fix on desktop): the four habitat figure cards fill only four of six columns

- **What I saw.** On every species page with a climate, at 1024, 1280 and 1920, the four cards (cold floor, warmest month, rain, light) are 153 px wide. They leave a third of the row empty on the right, and their text wraps to 5–7 short lines ("Record low 18.3 / °F in 44 years, at / a typical spot in / the range"). Screenshots: `W-s/ph-echeveria-elegans.png`, `lk-_species_echeveria_elegans-1920.png`, `pg-echinopsis_thelegona-0.png`. This is the page's first block of figures, the one a grower reads in ten seconds.
- **Where it comes from** (proved from the DOM). `.gcards` has 5 children: 4 cards and the season card, which spans `1 / -1` (`src/lib/ui/ref/Glance.svelte:136`, `repeat(auto-fit, minmax(min(100%,150px),1fr))`). A full-width item keeps every auto-fit track. At 980 px that makes six 153 px tracks, and two of them stay empty.
- **Smallest fix.** Move the season card out of the grid, or use `repeat(auto-fit, minmax(200px, 1fr))` for the cards in their own wrapper.

### W4. Minor: a search hit found by an older name still does not say so, on round 81's own example

- **What I saw.**
  - Typing "Sansevieria trifasciata" lists "Dracaena trifasciata · Snake plant · Asparagaceae · climate known", with no "older name" and no `?was=` on the link. The opened page therefore says nothing about the name typed (`W-s/j2.mjs` output).
  - "Echeveria peacockii" does say "Echeveria peacockii is merged into this page" (round 83: works).
- **Where it comes from** (read and proved from the index entry). `olderNameOf` in `src/lib/ui/ref/searched.ts:115-131` returns null when a common name's words plus the hit's own words cover the query. Dracaena trifasciata's common names include "Snake Sansevieria", and "trifasciata" is its own epithet, so the query counts as matched by its own names.
- **Smallest fix.** Test the common names against the query alone, without `own`, or try the older names first when the query is two words spelt as a binomial.

### W5. Minor: a cultivar written under a genus is filed and shown as a hybrid

- **What I did.** I added "Echeveria 'Lola'" on `/plants/new`, and imported "Philodendron 'Pink Princess'" and "Haworthia 'Kintaro'".
- **What I saw.**
  - The picker says "hybrid, parentage not stated".
  - The plant page heads "HYBRID · Added" and "A hybrid; parentage not stated. Add it if you know it" (`/plants/2026-0004`, and 2026-0364 and 2026-0395 in the 400 collection).
  - The import counted 8 such lines as "crosses, filed under the genus". The grower said only "a cultivar". Philodendron 'Pink Princess' is usually given as a cultivar of P. erubescens.
- **Where it comes from.** `src/lib/core/names.ts:153`: `kind = … epithet ? … : cultivar ? 'hybrid' : 'species'`, and `src/lib/import/commit.ts:41` does the same.
- **What should happen.** "A cultivar filed under its genus (species not stated)". Call it a hybrid only for a ×, a formula or the grower's own choice.

### W6. Minor: an older name typed or imported leaves the plant with no species page

- **What I saw.**
  - On `/plants/new`, "Aloe aristata" lists "Aristaloe aristata · has a species page, under another genus" first. Pressing Add with what was typed gives plant 2026-0007 "Aloe aristata", with no "Species page" button and no word about Aristaloe.
  - In the 400 import, the plants filed without "Use the reference's name on all 33 lines" say "Aloe aristata · Added · No species page under this name" (`big5.mjs` output).
  - Meanwhile `/species/aloe-aristata` answers 302 to Aristaloe aristata.
  - Round 81's W4 bulk button is fixed ("Use it · on all 11 lines of this name"). This tail of it is not.
- **What should happen.** The plant page says "an older name of Aristaloe aristata", links the page, and offers to file it there, as the species address already does.

### W7. Minor: "Where this page came from" looks like an empty card, with nothing showing that it opens

- **What I saw.** At the foot of every species page there is a white card holding one line, "WHERE THIS PAGE CAME FROM built 2026-10-28", with no triangle, chevron or "+" (`W-s/j3d-3.png`, `pg-aloe_framesii-1.png`). It is the record of sources, the page's trust story, and it reads as an unfinished box.
- **Where it comes from.** `src/lib/ui/Provenance.svelte:17` and its `summary { display: flex }` (style block, same file). A flex `summary` loses its disclosure marker in Chromium. The page's other `<details>` (`details.why`) draw their own "›".
- **Smallest fix.** Give `.prov > summary` the same drawn "›" or "+" as `details.why` and the cultivation rows.

### W8. Minor: right after a restore, /backup still says the last backup was "never"

- **What I saw.** I cleared the site's data, restored the 3,305-byte backup ("Merged: 3 plants, 1 space, 1 propagation batch and 7 timeline entries added"), and the header above still said "TAKE A BACKUP · never" (`W-s/j10-restored.png`). Reloading shows "last today, restored from a file" (`chk.mjs`), so round 82's fix (15) holds in the data.
- **Where it comes from.** `src/routes/backup/+page.svelte:14-20` reads `lastBackup` once on load. The restore path's `countedAsBackup()` (`src/lib/backup/io.ts:226`) never updates the page's state.
- **Smallest fix.** Re-read `lastBackup` and `lastFrom` when a restore reports success.

### W9. Minor: a field number left blank reads "none" (rule 2's spirit)

- **What I saw.** On plant 2026-0001 (added from a species page with only a source), Provenance says "FIELD NUMBER none" (`j67`/`j8b` output). Round 81's W8 fixed the batch page's "Pre-treatment" ("not stated" now). The plant page still says "none" for a field the grower never filled.
- **Smallest fix.** "not stated", as the batch page and "provenance not stated" already say.

### W10. Minor: the printed species page carries the screen's buttons and leaves out the cultivation sheet

- **What I did.** I printed `/species/sempervivum-tectorum` to A4 (`W-s/print-sempervivum.pdf`, 5 pages; `prs-1.png` to `prs-4.png`).
- **What I saw.**
  - The climograph and both maps print well, in the light theme.
  - Page 1 carries "Add one to my plants", "Sow seed · Follow · Compare · Share card", the °C/°F switch, an empty photo strip, the section tabs and the "None of your spaces has a floor set" callout.
  - Page 2 prints Seasons, Rain, Light and Warmth and air as closed rows with "+", so the cultivation figures a grower would print for the greenhouse are missing, and then half a page is blank.
- **Smallest fix.** In `@media print` (`theme.css:549`), hide `.acts`, the unit switch, the tabs and the strip, and show the closed `details` bodies (`details > * { display: block }` under print, or open them on `beforeprint`).

### W11. Minor: small inconsistencies a designer would see

- **Photograph placeholders.** There are three treatments for "no photograph":
  - a tinted letter with "no open photograph on file" (catalogue);
  - a grey "did not load" box (failed tiles);
  - a white card with no image area at all (species without a photograph in "Other Echeveria", `j3d-2.png`).
  - Compare shows a blank 360 px grey slab, with no words, for a failed photograph (`j5-compare2.png`).
- **Compare at 1280.** The two photograph cards are 360 px tall, so not one figure is on the first screen (`j5-compare2.png`).
- **Counts written with ×.** The "You grow" tiles show plant counts as "× 2" and "× 9" (`big-.png`). On a botanical site, × is the hybrid sign, and it sits right next to "× Graptoveria".
- **The plant page's name card** is inset about 22 px on each side from the buttons and cards below it, so the left edges do not line up (`j7-plant-after.png`). I did not trace the cause.
- **The catalogue's caps line under a name** is the family on some tiles and the common name on others ("ASPHODELACEAE", "COBWEB-ALOE", "UNIONDALE HAWORTHIA"), in the same style (`j1-haworthia-open.png`).

### W12. Minor: a sentence for the author sits in the name card

- **What I saw.** Echinopsis thelegona's name card reads "Wikidata's item Q1280651 gives "Cactus", read 2026-10-22 (CC0), which the search finds and this page does not show as the species' English name" (`pg-echinopsis_thelegona-0.png`). It is the second paragraph a visitor reads.
- **How many pages.** In the live index, 2,904 pages carry such hidden spellings, including "Cycad" on 64 pages, "Cactus" on 9, "Snowdrop" on 10 and "Orchid" on 5. That probably also puts these 9 cacti in the search for "cactus" (for S).
- **Where it comes from.** `src/routes/species/[slug]/+page.svelte:481`.
- **What should happen.** Move it to the record of sources, or drop a one-word generic name from search and page alike.

### W13. Minor: the console's one error, and what the app's icons carry

- **The error.** With 400 plants, the front page logged `error: Error while trying to use the following icon from the Manifest: https://cultifolio.com/favicon.svg (Download error or resource isn't a valid image)` (once, in `big5.mjs`).
- **What the icons carry.**
  - `static/app/favicon.svg` (7,997 B, served as is) is 2,218 B of drawing and a 5.8 kB base64 C2PA manifest whose claim reads "com.anthropic.claude.provided … Claude provided this file at the request of a user and may have created or modified the file contents".
  - `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` carry C2PA too. `og.png` does not.
- **What I could not prove.** Whether the metadata causes Chromium's error.
- **What I would do.** For a site whose pages promise "no AI images", the owner may want to know this. Stripping the `<metadata>` takes the favicon to about 300 B.

## Journey 13, as a grower deciding on winter (Echinopsis thelegona)

The page answers in under a minute:

- **The first card:** "COLDEST MONTH, MEAN NIGHTLY LOW 46.4 °F, Jul at the habitat, not a floor; extremes not used (the weather cell's ground is too far off)", beside a dashed "from few records" mark.
- **Under the figures:** "From few records: 3 records in 3 grid cells."
- **The climate section's notice:** "The daily extremes were not used: the correction for elevation, -1257 m, is beyond the 1,000 m … What that cell gave, so corrected, over 44 years: absolute minimum 27.5 °F, 1st-percentile night 41.9 °F."

It is clear that the cold floor was set aside, not missing, and the 27.5 °F gives a cautious grower a figure. Two rough edges:

- "the weather cell's ground is too far off" is jargon on the card.
- With °F and inches set, the correction still reads in metres.

## Mobile against PC (the thirteen journeys)

Desktop at 1280×800, fresh context unless "continue". The phone column is P's (iPhone 13; see P's report and `journeys.md`, P's notes).

| # | Journey | Desktop (1280) | Phone | What differs | Right? |
|---|---|---|---|---|---|
| 1 | First visit, by genus, H, Haworthia, Back | Works. 48,357 / 37,727. Back puts the tile 234 px from the top (235 before). Cold: TTFB 1,500 ms, LCP 3,484 ms (iNaturalist thumbnails) | P | — | — |
| 2 | "echeveria", Show more, open, Back | Works. "30 of 256", then 90. Back keeps the query and the 90. Settles 1.7 s after the last key. A reloaded or shared `/?q=` works (round 81's W1 fixed) | P | — | — |
| 3 | "snake plant", "Sansevieria trifasciata", "Echeveria peacockii", `/species/echeveria-peacockii` | Works. Dracaena trifasciata first both times, but the older name is not said (W4). The merged name is first, with "merged into this page". The old address answers 302 (`public, max-age=86400`) with a notice naming Dudleya's homonym | P | — | — |
| 4 | Keyless page (aloe-framesii) | Works. "GBIF's records not checked" under the name, with Aloe microstigma's lumping explained, and every section refers to it. Never "none". Range drawn as a box half over sea (W1) | P | — | — |
| 5 | Compare from the tray, add through the picker | Works: `?s=echeveria-elegans,echeveria-agavoides` (round 81's W2 fixed). Figures below the fold (W11) | P | — | — |
| 6 | Add from a species page | Works: 2026-0001, source kept, 2.2 s Add to the plant page | P | — | — |
| 7 | Space, Water all, Undo, water | Works: toast, "Undone: the 1 watering line removed" | P | — | — |
| 8 | 6 leaf cuttings, one struck | Works, linked both ways. "Pre-treatment not stated" | P | — | — |
| 9 | Labels for three, print | Works. Avery 5160 cells 252×96 px. Care line whole: "summer rain Jun–Oct · floor 31.5 °F (1 in 100, NASA POWER)" (round 81's W6 fixed) | P | — | — |
| 10 | Back up, clear, damaged, restore | Works. Damaged file refused, "Nothing on this device was changed". Restore complete. Header says "never" until reload (W8) | P | — | — |
| 11 | Units, reference photographs on/off | Works. 0 third-party requests with photographs off on plants, plant, Today and batch | P | — | — |
| 12 | Example collection, leave | Works. 3.3 s to open, 12 plants. Leave returns to `/`, `/plants` empty | P | — | — |
| 13 | Few records, extremes set aside (thelegona) | Works (section above) | P | — | — |

Outside the table:

- The Add press during the name check, in Chromium at 1280: the button turned to "Checking the name…" and the plant page came in 845 ms and 275 ms. Not lost.
- Desktop-only behaviour seen: the front page's search takes focus on load, so the first Tab goes to "Your species". That is right on a desktop.

## Confirmed working

**Round 81 (mine):**

- **W1 (reload or shared search):** fixed.
- **W2 (Compare drops the tray):** fixed.
- **W3 (hybrids without ×):** fixed. The index holds 485 names with "×", and the page heading reads "Mentha × piperita L.".
- **W4 (import of older names):** fixed in its bulk half; the plant-page half is W6.
- **W5 (older name on a search hit):** fixed in code, but not on the reported example (W4 above).
- **W6 (label care line):** fixed.
- **W8 (pre-treatment "none"):** fixed on the batch page.
- **W9:** placeholders now say "photograph did not load" across the frame (see W11 for consistency).

**Round 82 (in my area):**

- The few-records mark, its line and its notice (Antimima hantamensis: 6 records in 6 cells; Echinopsis thelegona).
- "Not checked" said once under the name, with the sections referring to it (Aloe framesii, Acharagma galeanense).
- "No climate 9,711 / 919 not checked" and "Popular genera 8,277" on the chips.
- The close-up map's names and scale bar.
- 15 px desktop text.
- A restore counted as a backup (after a reload).
- Compare's "+1" and its two rain figures.
- The batch's first line.
- "Author not stated" not met: every hero credit I saw named its author.

**Round 83:**

- **Merged pages:** search first with the reason; the 302 and the notice with its homonym link.
- **The set-aside extremes:** said on the card and in the climate notice.
- **The lighter page:**
  - Species HTML arrives as 16–39 kB (compressed) on 9 pages.
  - With scripts off, Sempervivum shows the climograph, both named maps (`Native range of Sempervivum tectorum`; `Openly licensed records …`) and 1,050 record dots.
  - It prints (W10 aside) and dark mode is correct.
  - I did not check every chart's description.
- **iNaturalist's photograph addresses:** all 36 images on three pages loaded.

**The rest:**

- **Timings.**
  - Cold species pages (fresh context, 7 pages): TTFB 362–1,009 ms, load 433–1,453 ms, LCP 496–1,412 ms, CLS 0.001.
  - Warm: FCP and LCP 140–212 ms.
  - With 400 plants: `/plants` ready in 316–625 ms, `/today` 406, `/places` 319, `/labels` 281, `/` 637–836 with every "You grow" tile filled at 857 ms.
  - Own search 1.16 s. Backup of 400 in 1.0 s. Import added 400 in 1.6 s.
  - The check of 400 lines took 74 s under my 0.55 s pacing, for 133 API requests.
- **Layout.** No sideways scroll at 1024, 1280, 1920 or 640 (200%), light or dark. Dark-mode tokens pass contrast: ink3 on the background 6.2:1; accent 7.6:1. In light mode the lowest text pair is ink3 on the sunk background, 4.55:1.
- **Reduced motion.** From code only: `theme.css:246` turns off all animation and transition.
- **Keyboard.** A skip link, a ring on every stop, and a combobox with `aria-activedescendant`. Tile link names still start with the placeholder's letter and caption ("R photograph did not load Rosa mollis …"). The top bar has two consecutive "Add a plant" links.

## Not checked, with why

- **The service worker and offline use:** blocked in every run, to keep the request budget (C's and P's).
- **Sync:** the brief forbids it.
- **Frost with a site set:** budget; round 81 confirmed it.
- **The about pages sentence by sentence:** S's. I only opened `/about/how` (18,329 words, 16 sections).
- **A separate 30-plant timing:** I had a 10-plant and a 400-plant collection; timings did not differ materially between them.
- **Real 2× pixel density:** the hero is a 480 px iNaturalist "medium" shown at 400 CSS px, so it will look soft on a Retina screen. Not measured.
- **Firefox and WebKit:** not here.
- **Wikimedia photographs:** refused (429) to this machine all evening, so Commons-led pages were judged on their failure state.

## Needs from the PC

None.
