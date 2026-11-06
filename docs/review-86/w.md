# Review after round 85: reviewer W (the desktop grower and the appearance)

Live site https://cultifolio.com, Worker `ba32fc3e`, corpus `48c27bf790016ccc`. `/api/counts` gave 48,375 species, 6,493 genera and 37,667 with a habitat climate. Run on 2026-11-05, 18:22 to 18:55 UTC, with Playwright and Chromium (`/opt/pw-browsers/chromium`), headless, `en-US`, `America/New_York`, mouse and keyboard.

- **Scripts, screenshots, PDFs and JSON:** `/tmp/claude-0/rev86r/W-s/`. The harness is `h.mjs`. The journeys are `j1`, `j23`, `coll3`, `coll4`, `kb`, `j12`, `big` and `imp2`. The looks are `pages`, `look2`, `ph`, `t9`, `fs` and `chip` (all `.mjs`).
- **The shared journeys file:** I wrote `/tmp/claude-0/rev86r/journeys.md` first, and P has added notes to it.
- I changed no code and posted nothing to the site.

## Verdict

**Works with faults.** On a desktop every central path works end to end:

- the front page, the catalogue and the letter index, with Back keeping the place;
- search, including a reloaded search, older names, the merged name and the round-85 names ("Hibiscus acetosella", "San Pedro", "Trichocereus pachanoi");
- species pages of every kind, including the old addresses and their verdict lines;
- Compare, which a desktop can now reach with one species picked;
- adding plants from a species page, typed, under a cultivar, under an older name, and re-filed;
- spaces, Water all with Undo, a propagation batch, and labels at true size;
- backup, a damaged file refused, and restore;
- units, Today and the example collection;
- 30 and 376 plants, each collection page ready in 0.19 to 0.35 s;
- the about pages' folded rules, opened by a link.

No request to the site failed, no page logged a console error, and no page scrolled sideways at 640, 1024, 1280 or 1920 px, in light or dark.

Round 85 fixed most of what the last review found in my area. What still stops a 10:

- **The words for a renamed plant's old name disagree between surfaces.** The species page says "Ceropegia alstonii is GBIF's name for this plant … Kew's World Checklist holds it as a synonym". The search row, the add form and an imported plant's page call the same name "an older name". For the stapeliads it is the newer combination.
- **The front page's "You grow" tiles still say "not in the reference"** for plants filed under an older name, while each plant's own page says "An older name of …".
- **A run of polish:**
  - a binomial split across two lines because the author is glued to the epithet;
  - "Hoodia alstoniiFile it under Hoodia alstonii", with no space;
  - map labels printed over the marker;
  - record dots below 3:1 against the range;
  - the chart's "IN RAIN".

### Scores (desktop)

| Area | Score | Why | What would make it a 10 |
|---|---|---|---|
| User experience | 8 | All fourteen journeys complete. The re-file and the old-name searches work, and the import now finds San Pedro | W1, W2 and W3: one word for one state of a name, everywhere |
| Appearance | 7.5 | Calm type, good dark mode. The world map's range now reads (3.1:1), the month table fits, and the island close-ups are real coastlines | W5, W7, W8, W9 and W14 |
| Accessibility | 8.5 | 2 px ring on every Tab stop checked (front page 18, species page 24); arrow keys reach the search's matches; no transition or animation under reduced motion; maps and the chart are named and described | Record dots at 3:1 (W7); distinct names for the 36 "The rules in full" folds (W15) |
| Performance (desktop) | 9 | Cold front page (fresh profile, photographs off): TTFB 185 ms, LCP 604 ms, CLS 0.0001, 16.7 kB of HTML. Species pages with a cold HTML: LCP 292 to 420 ms. With 376 plants every collection page is ready in 0.19 to 0.35 s; backup in 0.2 s | `/labels` CLS 0.035 at 376 plants (W12) |
| Honesty of what pages say (my area) | 7.5 | The verdict lines on old addresses are now true; "not asked" and "not checked" are kept apart on every page read; credits carry their day | W1, W2 and W16 |

To score 9 on performance I tried cold and warm loads of 26 species pages, the front page cold, and 30 and 376 plants. I found no figure over 1.13 s (a redirect page's LCP), and only the `/labels` shift.

### What I covered

- **Journeys.** All fourteen at 1280×800.
  - Spot checks at 1024×768 and 1920×1080: the front page, a species page, the add form, Compare and a renamed page.
  - At 640×400 (200% zoom): the front page, a species page, the add form, Compare and a renamed page.
  - Dark mode: eleven pages.
  - Reduced motion: the front page.
- **Species pages: 26 read in full, 11 with photographs on.**
  - **Rich:** Echeveria elegans, Haworthia cooperi, Sempervivum tectorum, Galanthus nivalis and Monstera deliciosa.
  - **Keyless, "not asked":** Aloe framesii, Abies marocana and Echinopsis pachanoi.
  - **Merged:** Echeveria desmetiana and its old address.
  - **Renamed:**
    - Hoodia alstonii, by `ceropegia-alstonii`;
    - Anacampseros quinaria, by `avonia-quinaria`;
    - Sabdariffa acetosella, by `hibiscus-acetosella`;
    - Echinopsis pachanoi, by `trichocereus-pachanoi`.
  - **A `g` page:** Tylecodon cacalioides, by its old spelling.
  - **A hybrid:** Kalanchoe × houghtonii.
  - **No photograph:** Antimima alborubra.
  - **No climate:** Lithops lesliei.
  - **From few records:** Echinopsis thelegona, Antimima alborubra, Lachenalia haarlemensis, Aloe vera and Sabdariffa acetosella.
  - **Extremes set aside:** by elevation (Echinopsis thelegona, Oreocereus trollii), and by a sea cell (Opuntia galapageia).
  - **Stapeliads:** Stapelia gigantea and Huernia zebrina.
  - **Others:** Echinopsis macrogona.
- **Printing.** Sempervivum to A4 (`print-sempervivum.pdf`, 6 pages) and labels to Letter (`c3-1280-labels.pdf`).
- **Collections.**
  - **By hand:** 6 plants (one from a species page; Echeveria ‘Lola’; Hibiscus acetosella by its row; Haworthia cooperi; Lithops lesliei; Ceropegia alstonii kept as typed, then re-filed). Then backed up, damaged, wiped and restored.
  - **By import:** 26 lines, then 344, to 376 plants over the 37 names round 85 used.
  - **The example collection.**
- **Requests.**
  - **To cultifolio.com:** 867 by Resource Timing (`transferSize > 0`), plus 3 by curl. Pages opened in second tabs (old addresses, about-page fragments) were not counted that way; I estimate them at 40 or fewer. That makes at most about 910. Every response event, cache hits included, totals 7,899.
  - **To third parties:** 287, which is 271 to iNaturalist's bucket, 15 to upload.wikimedia.org and 1 to GBIF's API (a page's own load). upload.wikimedia.org failed 4 of the 6 Commons tiles on Echinopsis pachanoi, as it did to this machine last round.
  - **The log:** `W-s/requests.log` and `W-s/count.json`.

## Issues

Ranked as the review prompt ranks them.

### W1. Major: GBIF's name for a renamed page is "GBIF's name" on the species page but "an older name" in the search, the add form and an imported plant's page; for the stapeliads that is false

**What I did.**

- I searched "Ceropegia alstonii" and opened `/species/ceropegia-alstonii`.
- I typed the name in `/plants/new`.
- I imported it in a pasted list.
- I opened both plants' pages.

**What I saw.**

- **The species page** (`j23-1280-ceropegiaAddr.png`): "Ceropegia alstonii is GBIF's name for this plant, and GBIF's backbone accepts it. Kew's World Checklist holds it as a synonym of *Hoodia alstonii*, which heads this page". This is round 85's fix, and it holds.
- **The search row** (`j23-1280-j3-ceropegia.png`): "Hoodia alstonii · older name: Ceropegia alstonii". "Hibiscus acetosella" gives the same pattern.
- **The add form** (`c3-1280-ceropegia-plant.png`): "GBIF 9269454 · An older name of *Hoodia alstonii*, which has a species page: pick it, or press "Add as typed"". The first Add press did not add; it turned the button into "Add as typed".
- **Two plants of one name, said two ways:**
  - Plant 2026-0006, typed in the form: "Filed under GBIF's name for its key; the reference heads its page Hoodia alstonii" (`crop-c4-typed.png`).
  - Plant 2026-0369, the same name imported: "An older name of Hoodia alstonii" (`imp2-Ceropegia_alstonii.png`).

**Why it matters.** Ceropegia alstonii (N.E.Br.) Bruyns is Bruyns's 2017 combination, which sank Hoodia into Ceropegia. It is newer than Hoodia alstonii (N.E.Br.) Plowes. Over most of the renamed stapeliad pages, "older name" tells a grower the wrong history of their own plant's name. Round 85's merge said "only a name no page heads is called an older name": the rule keys the word on whether a page heads the name, not on whether the name is older. `/about/how` glosses "older names (synonyms)", but the species page itself avoids the word here.

**What should happen.** One set of words wherever the name is shown: "GBIF's name for *Hoodia alstonii*" on the search row, the form and the plant page; "older name" only for a name Kew holds as a synonym that is not GBIF's accepted name for the key.

**Where it comes from** (my reading of the code). The words come from `src/lib/ui/picker-rows.ts` and the search row's reason. On the plant page, `foundBy.how === 'gbif'` is set only when the form found the page; an imported plant goes through `lookOlder`'s older-name branch (`src/routes/plants/[acc]/+page.svelte:781-782`).

**Smallest fix.**

- Carry a `via: 'gbif'` reason from the index's GBIF-name copies (the sheets already hold `via: 'gbif'`) into the search row, the picker line and `lookOlder`.
- Use `wasLine`'s words in all four places.
- Add a test on Ceropegia alstonii through all four paths.

### W2. Major: the "You grow" tiles say "not in the reference" for plants whose own pages say "An older name of …" (W9 of round 85, left)

**What I did.** I imported 370 lines that include Aloe aristata, Avonia quinaria and Ceropegia alstonii, kept as typed. This is a common case: the import offers "Use the reference's name", and a grower may not press it.

**What I saw.**

- **The front page** (`big-400-front.png`): "Aloe aristata · no page under this name · not in the reference", 10 plants. The same holds for Avonia quinaria and Ceropegia alstonii (`big-R.json`, `frontTiles`).
- **Each plant's own page** (`imp2-*.png`): "An older name of Aristaloe aristata · File it under Aristaloe aristata", and likewise "… of Anacampseros quinaria" and "… of Hoodia alstonii".
- **The search:** `/species/aloe-aristata` and the search both lead to the page.

**What should happen.** The tile says what the plant page says ("an older name of *Aristaloe aristata*"), or at least nothing false.

**Where it comes from.** `src/routes/+page.svelte` (the "You grow" tile's `missing` branch) does not run the plant page's older-name look, though that is one cached search per name.

**Smallest fix.** Run the same `lookOlder` result for each distinct missing name on the front page, or caption the tile "filed by a name no page heads" until it is known.

### W3. Minor: picking the page's row for a typed older name keeps nothing of what the grower typed

**What I did.** In `/plants/new` I typed "Hibiscus acetosella", picked the row "Sabdariffa acetosella … older name: Hibiscus acetosella" and pressed Add (`coll4.mjs`). P saw the same on the phone (`r-c-i13.json`, `hib`).

**What I saw.** Plant 2026-0005 reads "Sabdariffa acetosella · Added 2026-11-05", with no "received as Hibiscus acetosella". Re-filing a plant ("File it under Hoodia alstonii") does keep it ("Hoodia alstonii received as Ceropegia alstonii", with a log note). The two paths to the same end record different things.

**Where it comes from.** `SpeciesPicker.svelte:322`: `received = droppedByPick(value, written)` keeps the typed text only when the pick "left some of it out", not when the pick replaced the name with another.

**Smallest fix.** When the picked row's reason is an older name or GBIF's name, set `received` to the typed name, as `fileUnderOlder` does.

### W4. Minor: the plant page's found-by line runs into its button, and reads awkwardly

**What I saw** (`crop-c4-typed.png`, `imp2-Aloe_aristata.png):

- "…the reference heads its page *Hoodia alstonii*File it under *Hoodia alstonii*", with no space between the link and the button.
- "the reference heads its page Hoodia alstonii" lacks a word ("under", or "as").
- An imported plant with no date reads "Added · An older name of …", a dangling "Added".

**Where it comes from.** `theme.css:258`: `button.tap { margin: -8px -2px }` eats the single space in `+page.svelte:781-782`'s `</span> <button`.

**Smallest fix.**

- `margin-inline-start: 0.35em` on `#file-under-older`, or put the button on its own line.
- "Filed under GBIF's name for this plant's key; the reference heads the page as *Hoodia alstonii*."
- Omit "Added" when no date is known.

### W5. Minor (appearance): a long author splits the binomial across two lines on the species page

**What I saw.** At 1280 px:

- Sabdariffa acetosella breaks as "Sabdariffa / acetosella (Welw. ex Hiern) M.M.Hanes & R.L.Barrett" (`j23-1280-hibiscusAddr.png`).
- Echinopsis pachanoi, macrogona and thelegona break the same way (`j23-1280-trichAddr.png`, `ph-mont.png`).
- There is room for the whole binomial on the first line.

**Where it comes from.** `src/lib/ui/SpeciesName.svelte:7` joins the name and the author with `&nbsp;`, so the epithet travels with the author's first word.

**What should happen.** The binomial stays whole and the author wraps.

**Smallest fix.** A normal space before `.auth`, with `white-space: nowrap` on the name part (or `&nbsp;` between genus and epithet).

### W6. Minor (UX; arguing with decision 1): San Pedro's page is a dead end for the grower who searches "San Pedro"

**What I saw.**

- "San Pedro" opens Echinopsis pachanoi first, as decided.
- Its page has no climate, no record map and no cultivation sheet. It says GBIF files its names under Echinopsis macrogona, "where its records are" (`j23-1280-trichAddr.png`).
- Its lead photograph is a roadside landscape with the cacti small at one side (Forest & Kim Starr, Commons, `ph-mont.png`).
- The owner's genus is where a grower most wants the cold floor.

**What I would change, inside the rules.** Section 4 of `REVIEW-ROUND-85.md` gives GBIF's own count: 410 of macrogona's 639 records are under San Pedro's names. Let the notice say so, with that source: "Echinopsis macrogona's climate is read from 639 records, 410 of them filed by GBIF under this species' names (GBIF, 31 October)". The figures stay on their page, nothing is guessed, and the grower knows the figures there are mostly San Pedro's.

### W7. Minor (appearance, accessibility): record dots on the close-up are below 3:1 against the range fill

**The figures.**

- Light: a dot's centre #3c8d71 on the range fill #bbc9b7 is **2.3:1**.
- Dark: #559e7f on #345042 is **2.8:1** (`crop-ee-habitat.png`, `crop-dk-maps.png`).

Round 85's W3 raised the world map's range to 3.1:1, which holds. On the close-up, the dots that carry the page's evidence are now the faint layer. WCAG 1.4.11 asks 3:1 for a meaningful graphic.

**Smallest fix.** Darken the dots' fill (light), or lighten it (dark), or give each dot a 1 px card-coloured ring.

### W8. Minor (appearance): map labels over the marker and the records; island ranges invisible on the world map; a 3-record close-up with no context

**What I saw** (`mont-maps.png`, `crop-maps-labels.png`):

- On Sabdariffa acetosella, "Zambia" is printed over the orange marker.
- On Stapelia gigantea, "Northern Provinces" is printed across a cluster of record dots and a border.
- Opuntia galapageia's world map shows no range at all, only the marker in the ocean: the Galápagos are smaller than a pixel at world scale.
- Echinopsis thelegona's close-up (3 records) is a 100 km field of flat green, with one border and no coast or place to anchor it.

**What works.** The Galápagos close-up now has real coastlines and its rings, and Galanthus, Sempervivum and Echeveria read well.

**Smallest fix.**

- Test labels against the marker and dot boxes, as against each other.
- Draw a range whose world-scale extent is under 3 px as a ring at least 6 px across.
- Frame a close-up at no less than about 400 km.

### W9. Minor (appearance): the chart's words

**What I saw** (`crop-ee-chart.png`):

- The rain panel's unit label, uppercased by CSS, reads "IN RAIN", which a reader takes as the word "in".
- The hot-day marker says "99th-percentile day, NASA POWER". The legend calls it "1-in-100 hot day", and the narrow drawing "hot day, 1 in 100": three names on one chart (`climograph.ts:169`, `Climograph.svelte:131`).
- The cold floor in the first card (31.5 °F, 1 night in 100) is not on the chart, which shows the record low and the frost line. A grower looks for the headline figure there.
- The rain threshold reads "0.98 in (25 mm)" on every card in °F.

**Smallest fix.**

- "Rain, in" (or "Rain (in)").
- One name for the hot day.
- A tick for the cold floor at the right edge, beside the record low.
- "1 in (25 mm)".

### W10. Minor: the add form still shows a database key, and a 100 px hole

**What I saw** (`c3-1280-look-hibiscus.png`, `c3-1280-ceropegia-plant.png`, `sz-640-new.png`):

- Under a typed or picked name the form shows a pill "GBIF 7802717" or "GBIF 9269454". It explains itself only in its `title` (round 85's W12 answer), so it is half done.
- The reserved status room leaves about 100 px of blank between the Species field and "How to write cultivars and hybrids" when nothing is said, at 1280 and at 640×400 (round 85's W14, second point, left).

**Smallest fix.** Word the pill ("GBIF's record") or drop it when a page is found; reserve one line, not three.

### W11. Minor: the photographs

**What I saw** (`ph-mont.png`, `crop-ee-lead.png`, `crop-ph-front.png`):

- **Echeveria elegans' lead** changed to a botanic-garden bed with a large white name label and a metal planter edge across the lower third. The fourth strip tile (a clean rosette) is still the better lead. W6 is half done.
- **The hero caption's date** ("· 2022-04-06") is the observation's, while the credits line ends "Credits as read from iNaturalist on 2026-11-04". The two dates sit unlabelled, one above the other. "observed 2022-04-06" would part them.
- **The front strip today:**
  - 4 of its 6 photographs are by one photographer (zebedeugalinha);
  - none is a cactus, succulent or bulb;
  - Nerium oleander is a flowerless green bush;
  - Coleus has a garden label in frame.

  It is a rule (`/about/how#feature`). On a site for succulent and bulb growers, the first picture should look like one: prefer one photographer per strip, and a grown-genus mix.

### W12. Minor: `/labels` shifts with a large collection

`/labels` measured CLS 0.0349 with 376 plants and 0 with 32 (`big-R.json`, `t400.labels`). Round 85 brought it to 0.000006 at 30. I measured once, and it was the only shift over 0.003 in my runs.

### W13. Minor (console): Svelte's `derived_inert` warning in the add-a-plant journey

- **What I saw.** `warning: https://svelte.dev/e/derived_inert` on `/plants/2026-0002` and `/plants/new`, during journey 6's typed add of Echeveria ‘Lola’ (pressed at once) and the move to the next form (`c3.out`). It was the only console message besides the service-worker notices that my harness's blocking causes.
- **What it means.** A derived value was read in an effect that had been destroyed, likely the picker's async continuation after the form navigated. It is not proved harmful, but it is the class of race C2 and C3 were about.
- **Smallest fix.** Find the derived read after `goto` in the picker or the form; C may trace it.

### W14. Minor (appearance): unfinished corners

- **Print, with a photograph that failed** (`prsH-1top.png`). Page 1 prints a green "photograph did not load" box with the screen-only chip "The photograph's own page", and the name card overlaps it. Print should drop a failed hero and the chip.
- **Today in the example collection** (`j12-example.png`). The first space card ("Bench 2") is inset 14 px from the second ("Kitchen windowsill"). There is an 80 px gap under the subtitle.
- **Compare's failed photograph at 1024** (`sz-1024-compare.png`). The placeholder fills 200 of the box's 240 px, leaving a two-tone grey band.
- **Two names for one country on one page.** Sabdariffa acetosella's range says "Zaïre" (TDWG). Its few-records notice says the typical spot "is in Sud-Kivu, Congo - Kinshasa", with a spaced hyphen. Say "Sud-Kivu, Democratic Republic of the Congo", or name the TDWG region.
- **The add form's "New…" button** sits shorter than the Space select beside it (`c3-1280-look-hibiscus.png`).
- **At 1920 px** the crumb and the logo sit at the window's edge, 350 px left of the 980 px content column (`sz-1920-ee.png`). A bar aligned to the column would read as one page.

### W15. Minor (accessibility): 36 folds named "The rules in full"

`/about/how` has 44 disclosures, and 36 of them are labelled "The rules in full" (`look2-R.json`). A screen-reader user tabbing or listing controls hears the same name 36 times.

**Fix.** "The rules in full: the name", "… English names", and so on (visually hidden suffixes keep the look).

### W16. Minor (honesty; for S and D): credits read on 2 November where the brief says 3 to 5

On 5 of the 11 pages I read with photographs on, the credits line reads "Credits as read from iNaturalist on 2026-11-02": Hoodia alstonii, Sabdariffa acetosella, Stapelia gigantea, Huernia zebrina and Echinopsis macrogona (`ph-R.json`). The review prompt and pc-state say every credit was read again "between 3 and 5 November".

My reading is that these are photographs dated on 2 November by the walk's `--keys` step, which the credits fill passes by (decision 8, "photographs read before"). If so, the page is right and the sentence about the round is not. `/about/how` should not say "3 to 5" if it does.

## The round-85 reviews' findings in my area

| Finding | Status | What I saw |
|---|---|---|
| W1 verdict line on old addresses | **Fixed** | "…is GBIF's name for this plant … Kew's World Checklist holds it as a synonym of *Hoodia alstonii*". Avonia and Hibiscus are said the same way. New: W1 above, the other surfaces |
| W2 Trichocereus pachanoi | **Fixed** | The search gives Echinopsis pachanoi first; the import offers it; the plant page says "An older name of Echinopsis pachanoi · File it under…" |
| W3 range fill 1.16:1 | **Fixed** (world map 3.1:1) | New: W7, the close-up's dots at 2.3:1 |
| W4 island close-ups, labels | **Half** | Galápagos drawn true; labels still collide (W8) |
| W5 month table | **Fixed** | Months as rows on screen; whole on A4 |
| W6 lead photograph | **Half** | The rule now prefers sized leads (`srcset` large on 2×); Echeveria elegans' lead is still a labelled bed (W11) |
| W7 desktop compare tray | **Fixed** | "pick one more ›" links to `/compare`; "Remove from compare" |
| W8 genus tile "loading…" | **Fixed** | "genus: its row of the catalogue" |
| W9 "not in the reference" for an older name | **Half** | The plant page is right; the tiles are not (W2) |
| W10 second paste | **Fixed** | "They are new plants: add all 26" offered (I did not press it) |
| W11 round 83's polish | **Mostly fixed** | Counts read "10 plants"; the name card is full width; the family is in small capitals and the English name is set as a name; compare's failed photograph says so. Left: W14 |
| W12 words and numbers | **Mostly fixed** | Fixed: one unit in the elevation cause; "(1 in 100" whole on labels; "sp." roman; "bar 0 to 48 in". Half: the key pill (W10). `/labels` CLS back at 0.035 with 376 plants (W12). Today's frost date not checked (no site set) |
| W13 keyless wording, author line | **Fixed** | "GBIF's records not asked", "Not compared: … not asked"; Abies marocana's line is a reader's sentence now |
| W14 640×400 crumb; form band | **Half** | The crumb is not drawn at 640; the form's blank band is left (W10) |
| A16e month table | **Fixed** | As W5 |
| A16h arrow keys | **Fixed** | ArrowDown moves into the results; Up returns to the box |
| A20 islands, labels; scripts-off chart | **Half** | As W4; the scripts-off chart was not checked |
| A9g / A16c lead | **Half** | As W6 |
| A22 about pages long | **Fixed** | `/about/how` 4,208 visible words, 0 of 44 folds open; `/about/formats` 765 words |
| Fragment into a fold (journey 14) | **Fixed** | `#coast-reach`, `#islands`, `#sample`, `#merged` and `#regions` open their fold and land at 121 px, under a 45 px bar |
| The chip's "not asked" | **Fixed** | "No climate 9,773 · 934 not asked" (the one pending page, Monsonia lheritieri, is in neither) |
| A9d Kalanchoe × houghtonii's Madagascar records | **Left** (D's area) | `/api/dossier/k2336677`: 0 open and 1 restricted record in range, 1,860 outside; no climate ("only 1 distinct land cell"). Round 85 said the sample by cell would bring four |

## Confirmed working

- **Search.**
  - "echeveria": 30, then 90 of 256; Back keeps the query, the 90 and the place (329 px both); a reload keeps it.
  - "snake plant" gives Dracaena trifasciata; "Echeveria peacockii" gives desmetiana ("merged into this page"); "Hibiscus acetosella" gives Sabdariffa acetosella.
  - "San Pedro" gives Echinopsis pachanoi first; "Trichocereus pachanoi" gives pachanoi first, then macrogona (by its form).
  - Old addresses 302 (`max-age=86400`) to `?was=`, each with a true line. `tylecodon-cacaliodes` says "GBIF's spelling".
- **The catalogue.** By genus, H, Haworthia (59 species, 20 with climate), a species, Back: 237 → 234 px.
- **Adding plants.**
  - From a species page: 493 ms.
  - Typed with Add pressed at once: ‘Lola’ in 100 ms (a cultivar, species not stated), Haworthia cooperi in 259 ms, Lithops lesliei in 738 ms.
  - Re-file: "Renamed from Ceropegia alstonii to Hoodia alstonii (the reference's name; …)" in the log.
- **Spaces, water and propagation.**
  - "Moved to Windowsill · Undo".
  - "Watered 1 plant. Undo", then "Undone: the 1 watering line removed.".
  - S2026-001, "STRUCK 1 / 6 17%", linked both ways.
- **Labels and backup.**
  - Labels: Avery 5160 at 252×96 CSS px, QR codes, the care line from NASA POWER.
  - Backup: 3,450 B; the half file refused with "Nothing on this device was changed".
  - Restore: "Merged: 4 plants, 1 space, 1 propagation batch and 8 timeline entries added", with the IndexedDB counts equal.
  - 376 plants backed up in 0.2 s (71,768 B).
- **Imports.** Checking 26 lines took 3.5 s, and 344 lines 5.2 s; adding 344 took 1.9 s.
- **Units.** °C and °F switch every card ("weather cell 1,257 m higher" and "4,124 ft higher").
- **The example collection.** 12 plants, opening on Today; Leave goes to `/` and leaves 0 changes.
- **Dark mode.** Body #121614 on #e8eeeb; cards, the chart, the maps and notices read well.
- **Keyboard and accessibility.**
  - The skip link comes first; every stop has a ring.
  - In the add form's picker, ArrowDown and Enter took "Huernia zebrina" and Tab closed the list.
  - Hoodia alstonii's accessibility tree: h1, then h2 sections and h3 cards; the chart titled and described; both maps named and described.
- **Journey 13.** The thelegona card reads "46.4 °F Jul at the habitat, not a floor; extremes set aside: weather cell 4,124 ft higher". The few-records notice names Tucumán. The set-aside notice gives the lowest night and the 1-in-100 night. A decision takes under a minute.

## Mobile against PC

The desktop column is mine, at 1280×800. The phone column is P's iPhone 13, from `P-s/r-j-i13-*.json` and `r-c-i13.json` at 18:55 UTC; P's own report is final.

| # | Journey | Desktop | Phone (P) | What differs | Right? |
|---|---|---|---|---|---|
| 1 | Front, by genus, H, Haworthia, a species, Back | Works; Back held (237 → 234 px); cold LCP 604 ms | Works; ready 1,010 ms | Tab bar against the top segment | Deliberate |
| 2 | "echeveria", Show more, open, Back, reload | Works; 30 → 90 of 256, place kept | Works; place kept (151 → 151) | — | — |
| 3 | Common, older, merged and renamed names, old addresses, Hibiscus acetosella, San Pedro | Works, with W1's "older name" on the rows | Works, with the same rows and verdict lines | None | Gap on both (W1) |
| 4 | Keyless Aloe framesii | Works: "not asked", no "not checked" | Works: 3 "not asked", 0 "not checked" | — | — |
| 5 | Compare from the species page | Works: tray link to `/compare`, 2 columns | Works: pill link, 2 columns | Tray against pill | Deliberate |
| 6 | Add from page; ‘Lola’; Hibiscus acetosella by its row | Works; ‘Lola’ a cultivar; Hibiscus files under Sabdariffa without "received as" (W3) | Works, the same (P adds Crassula “Buddha’s Temple”) | Plant numbers one higher on the phone | Deliberate; W3 on both |
| 7 | Space, Water all, Undo | Works | Works; Undo 44 px | — | — |
| 8 | Propagation | Works | Works | — | — |
| 9 | Typed adds; Ceropegia alstonii kept and re-filed; labels | Works; "Add" became "Add as typed"; re-file kept "received as"; labels true size | P's report | — | — |
| 10 | Backup, damaged, restore | Works | P's report | — | — |
| 11 | Units, photographs | Works | P's report | — | — |
| 12 | Example collection | Works | P's report | — | — |
| 13 | Thelegona, winter decision | Works (four cards) | Works ("Habitat in short", "from 3 records") | Short habitat line against the cards | Deliberate |
| 14 | About folds by a link | Works: target at 121 px under a 45 px bar | Works: targets found, folds open | — | — |

## Not checked, with why

- **Commons photographs.** upload.wikimedia.org failed 4 of 6 tiles on Echinopsis pachanoi, so I judged 2 of San Pedro's 12.
- **Today's frost line with a site.** Setting one asks a geocoder and MET Norway, which I left for P, C and S.
- **The scripts-off chart, a real 2× screen, Firefox and WebKit:** not available, or P's.
- **The service worker, offline and sync:** P's and C's. The brief forbids vaults.
- **Exactly 400 plants.** I did not press "add all 26", so the large collection was 376.
- **The about pages sentence by sentence:** S's. I read the fold mechanics and the counts.

## Needs from the PC

None.
