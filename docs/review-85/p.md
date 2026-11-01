# Review P (the phone grower; mobile against PC), after round 84

Reviewer P, 2026-10-31, 13:37 to 15:05 UTC. Live site https://cultifolio.com: Worker `63ab1f88`, corpus `8520c2875b2699ba`.

**How I ran it**
- Playwright 1.63 with Chromium 141 (`/opt/pw-browsers/chromium`), using its device descriptors with `isMobile`, `hasTouch` and real taps.
- iOS safe areas were emulated through CDP (`Emulation.setSafeAreaInsetsOverride`): 47/34 px in portrait, 47/47/21 px in landscape (59 on the 15 Pro Max).
- Scratch is `/tmp/claude-0/rev85r/P-s/`. The harness is `lib.mjs`; the scripts are `NN-*.mjs`. Results are in `r-*.json`; screenshots are in `shots/` (237 files).
- Every screenshot cited below I looked at.

## Verdict

**Works with faults. Ready to show the public on phones once two sentences are put right.**

On every phone size from 320 px to the iPad, a grower can do all of these:
- browse, search and come Back to the same place;
- read every kind of species page;
- add plants by link, by typing and offline;
- photograph them;
- make spaces, water, Undo, propagate and print labels at true size;
- back up and restore;
- try the example and leave it;
- install the app and use it with no signal.

Nine of round 84's ten phone repairs hold on the live site: the chart at 360 and 320 px, My plants' shift, the landscape notch, the compare pill, the Record draft, the gaps around 44 px buttons, the list after the field is left, the Add press, and curly-quoted cultivars. The tenth (the "from few records" mark) is half done.

Two faults are new, and both put a false sentence in front of a grower:
- **P1 (major), shared with W1.** Every one of the 501 pages whose heading became Kew's name says, when reached by its old name, that "the GBIF backbone accepts this species as" Kew's name. GBIF accepts the old name. On a phone this notice heads the page, above the photograph.
- **P2 (major), new.** On the add form, typing an accepted name that is also another page's homonym or older name says it is "An older name of" that other species. Examples: "Echeveria elegans" says "An older name of Echeveria harmsii"; "Galanthus plicatus" says "An older name of Galanthus nivalis". The first press on Add then does not add. This affects 2,728 accepted names, 347 of them in the cactus, succulent and bulb families. It comes from round 84's own W6 change.

The rest is minor.

### Scores (phone)

| Area | Score | Reason | What would make it a 10 |
|---|---|---|---|
| Mobile | 8.5 | Every flow completes at 11 sizes. The chart is readable at 320 px. The notch is cleared in landscape. | P1 and P2 put right; P3's first screen |
| UX on a phone | 8 | Back, offline, the race and the draft all hold. P2 makes the commonest Echeveria take two presses, with a wrong species named. | P2; the habitat line's mark linked (P4) |
| Performance on a throttled phone | 7 | Cold front page: FCP 2.48 s, TBT 282 ms. My plants with 400 plants: CLS 0.000 three times. A rich species page's LCP is 4.8 to 5.6 s, which is the photograph host. | A first-visit script set cut for the front page; a photograph size and preconnect for the hero |
| Accessibility under a finger | 8.5 | 44 px targets everywhere but one new link. Maps are tied to their captions. | "Figures ›" at 44 px (P5); the chart at 200% text (P6) |
| Appearance on a phone | 8 | The chart is readable at every width. The region shapes look right close up. The habitat line is tidy, and dark mode is right. | P7's crumb; the placeholder under the card on the iPad |

### What I covered

- **Sizes (11):**
  - iPhone SE 1st gen (320×568), SE 3rd gen (375), 13 (390), 15 Pro Max (430);
  - 13 and 15 Pro Max in landscape;
  - Pixel 7 (412), Galaxy S8 (360), also in dark mode and at 200% text;
  - iPad 7th gen both ways;
  - 640×400 (a laptop at 200%).
  - Five to eleven pages each, plus the menu (`20-devices.mjs`, `r-dev-*.json`).
- **Journeys:** all 13 at iPhone 13 (`10-journeys.mjs`, `11-collection.mjs`). Journeys 1, 3, 4 and 13 also at 360 and 320 px.
- **Picker and race:** 3 leave-the-field cases and 6 Add-at-once cases, with `/api/search` delayed 1.6 s and `/api/names` failing (`30-picker.mjs`). Also 10 accepted names that collide with a homonym (`31-hom.mjs`).
- **Round 84's phone fixes, one by one** (`50-misc.mjs`, `51-maps.mjs`).
- **Install and offline** (`60-offline.mjs`).
- **Throttled loads:** 11, at CPU ×4 on slow 4G (`40-slow.mjs`).
- **The WebKit walk:** updated, then tested in Chromium in three runs.
- **Requests to cultifolio.com:**
  - **My estimate of real network requests: about 1,420.**
  - My harness counts every fetch it routes, and those counts are exact. They come to 954 before the slow runs.
  - The slow runs went unrouted so that the HTTP cache and the throttle act. Their counter took memory-cache hits on reloads as requests: it says 645, and about 213 were real.
  - The walk's three runs: 210 + 47 (the worker estimate, an upper bound), 55 + 64 (upper bound), and 96.
  - The raw upper bound for everything is 1,916.
  - The third walk run (96) was my mistake: a new output folder made it cold.
  - Details are in `P-s/budget.json`.
- **Third-party hosts:** 280 fetched, each cached and paced at one a second. 1,289 were refused before they were sent.
- No sync and no POST. `/api/index` was not fetched (I read D's copy).

## Issues

Ranked as the review prompt ranks them. I found no wrong figure on a species page in my sample. P1 is a wrong statement about a name source.

### P1. Major: the old address of each of the 501 pages that took Kew's heading says GBIF's backbone accepts Kew's name (W1 found the same on desktop)

**What I did.** Journey 3 at three sizes:
- searched "Ceropegia alstonii";
- opened `/species/ceropegia-alstonii` in a fresh tab;
- then fetched `/species/avonia-papyracea` and `/species/aeonium-tabulaeforme` (`q2.mjs`).

**What I saw.** Each one answers 302 to `…?was=<old name>`. The page then opens with this notice above the photograph (`shots/J3-i13-f-ceropegia-old.png`, and the same at 360 and 320):

> **Ceropegia alstonii** is a synonym: the GBIF backbone accepts this species as *Hoodia alstonii*, and the reference files it under that name.

The page's own record says the opposite (`/api/dossier/k506502`):
- `name.gbif.scientific` is "Ceropegia alstonii";
- `upstream.kew.names.detail` reads "GBIF names its key Ceropegia alstonii (N.E.Br.) Bruyns, an older name of the page here".

The same sentence appears:
- for Avonia papyracea, about Anacampseros papyracea;
- for Aeonium tabulaeforme, about Aeonium tabuliforme. That one is a spelling, not a synonym.

All 501 headings that changed (index of 29 October against today's; 325 of them in Apocynaceae, Anacampserotaceae, Cactaceae, Aizoaceae, Crassulaceae and Asphodelaceae) reach this branch whenever they are arrived at by the old name. That includes every search hit for the old name, because the search links `?was=`.

**What should happen.** It should say what is true: "Kew's World Checklist holds Ceropegia alstonii as a synonym of Hoodia alstonii, and the reference files it under Kew's name; GBIF's backbone still accepts Ceropegia alstonii."

**Where.** `src/routes/species/[slug]/+page.svelte:473`, the last `{:else}` of the `was-synonym` notices. It was written when every heading was GBIF's name.

**Smallest fix.** When `was` equals `d.name.gbif.scientific` (or the record's `upstream['kew.names']` names it as GBIF's name for the key), use the Kew wording above. When the two names differ only in spelling, say "an older spelling". Add a test on one renamed page.

### P2. Major (new in round 84): the add form tells a grower that an accepted name is "An older name of" another species, and the first press on Add does nothing

**What I did.** On `/plants/new` at iPhone 13 I typed 10 accepted names that another page lists as a homonym or older name (`31-hom.mjs`, `r-hom.json`, `r-hom2.json`). In the walk's step K03 I typed two of them, left the field and pressed Add. In `30-picker.mjs` case B6 I typed "Crassula ovata" and pressed Add at once.

**What I saw.** Every one of the 10 says it is an older name of another species. It says so under a GBIF pill for its own key, and while the list's first row is the name itself, marked "has a species page":

| Typed (an accepted name with its own page) | The line under the field |
|---|---|
| Echeveria elegans | An older name of *Echeveria harmsii*, which has a species page: pick it, or Add keeps exactly what you typed. |
| Crassula ovata (the jade plant) | An older name of *Crassula sarmentosa* … |
| Galanthus plicatus | An older name of *Galanthus nivalis* … (`shots/hom-Galanthus_plicatus.png`) |
| Crocus vernus | … of *Crocus angustifolius* |
| Cotyledon orbiculata | … of *Cotyledon velutina* |
| Amaryllis belladonna | … of *Hippeastrum puniceum* |
| Sempervivum globiferum | … of *Sempervivum grandiflorum* |
| Euphorbia lathyris | … of *Euphorbia fischeriana* |
| Sarracenia flava | … of *Sarracenia alata* |
| Asclepias curassavica | … of *Asclepias mellodora* |

The line arms the button:
- In the walk (K03), "Echeveria elegans" and "Crassula ovata" each took **two presses** to add, after the field was left.
- With Add pressed right after typing (B6), the button turned to "Add as typed" and a second press added.

The plant was then filed correctly, with its own species page (`/species/crassula-ovata`, `/species/galanthus-plicatus`). But a grower who does what the line says ("pick it") files a jade plant as Crassula sarmentosa, or *G. plicatus* as *G. nivalis*.

**Rate.** In today's index, 2,728 accepted page names appear in another entry's `hom` (2,499) or `older` (239) list. 347 of them are in the cactus, succulent and bulb families, and Echeveria elegans is one.

**Where.** `src/lib/ui/SpeciesPicker.svelte:430-434`. `olderOfTyped` takes any local row whose `older` or `hom.name` equals the typed name. `olderRow` then excludes only the row named exactly so. It never asks whether the typed name is itself a page's accepted name. A homonym (the same spelling by another author) is not an older name of the typed species at all.

**Smallest fix.**
1. No `olderRow` when a local suggestion's own name equals the typed name.
2. Read `hom` as "the same spelling by another author is an older name of X", and only when no page heads the name.
3. Add a test with "Echeveria elegans", "Crassula ovata" and "Galanthus plicatus".

### P3. Minor: "Habitat in short" is below the first screen on a 320 px phone, and only half on it at 375 to 430 px

**What I saw.** The top of `.hline` on Echeveria elegans, against the screen and the tab bar:

| Phone | Top of the line | Screen height | Tab bar |
|---|---|---|---|
| iPhone SE 1st gen | 572 | 568 | |
| iPhone 13 | 453 | 664 | from about 573 |
| 15 Pro Max | 453 | 739 | |
| Galaxy S8 | 518 | 740 | |

So at 390 px only the heading and the first row (cold floor and rain) show above the tab bar (`shots/dev-i13-_species_echeveria_elegans.png`). At 320 px none of it does (`shots/J13-se1-a-top.png`). What sits above it:
- the grey photograph band, about 120 px over the name card;
- the name card, with its four links on their own row.

Decision 3 asked for the figures on the first screen.

**Smallest fix.** Shorten the photograph band above the card on phones under 700 px tall, or let the card's link row share a line with Add. Either moves the line up about 100 px.

### P4. Minor (round 84's P9, half done): the habitat line's "from 3 records" is not a link, and "Figures ›" is 51×19 px

**What I saw.** On Echinopsis thelegona:
- the glance card's `#few-records-mark` links to `#few-records`, whose notice reads "From few records: this habitat climate is read from 3 records in 3 grid cells…". That is right.
- the phone's own line, the one a phone grower sees first, has the same mark as a plain `<span class="few">`. A tap does nothing.
- its "Figures ›" link measures 51×19 px. It is a control on its own line, not a word in a sentence, and it has no invisible 44 px margin. Compare `.linkish::after` in `theme.css:530`.

**Where.** `src/lib/ui/ref/HabitatLine.svelte:41`.

**Smallest fix.** Make the chip `<a href="#few-records">`, and give `.hhead a` the 44 px `::after` margin.

### P5. Minor: an accepted name typed while the list is open cannot reach the next field without first closing the list

**What I saw.** After typing "Crassula ovata" (the list open, the field focused), a tap on "Acquired" lands on the list's fourth row (`species-menu-c1-3`), because the list (max 18 rem) covers the next three fields. Playwright refused the tap for that reason.

This is the list behaving as a list, not round 84's C1 (with the field left, it never reopened: A1 to A3, K01). But on a phone the grower's way out is to tap empty space, or the keyboard's Done.

**Smallest fix.** Shorten the list to about 5 rows under 700 px tall, or close it when the typed name exactly matches its first row.

### P6. Minor: at 200% text the climate chart's ticks overlap and its temperature labels are cut at the left

**What I did.** The Galaxy S8 with the root font at 200% (`20-devices.mjs` s8tx, `21-tx.mjs`). That emulates Android's text scaling. Safari's own text size is a page zoom and should not do this.

**What I saw.**
- The chart is drawn at 308 for 320 shown, with its labels at 45.7 px.
- The rain ticks 0 to 6 overlap each other, and "IN RAIN" sits on the 6 (`shots/tx-s8-chart.png`).
- The temperature labels 20° to 100° are cut at the left edge.
- No page scrolls sideways.

**Where.** `Climograph.svelte`: the chart's margins are computed for 11 px labels, while its text takes `rem` sizes.

**Smallest fix.** Pass the computed label size into `climograph()` for its left margin and tick spacing, or fix the SVG text in px.

### P7. Minor: the top bar's crumb is cut without an ellipsis at 640×400 and at 320 px

**What I saw.**
- At 640×400 the crumb reads "SPECIE", cut under the navigation pill (`shots/dev-z640-_species_echeveria_elegans.png`; the walk's F01 `crumbCut: true`). W14 saw the same.
- At 320 px it reads "SPECIES ›…", with the species name gone (`shots/J13-se1-a-top.png`).

**Smallest fix.** Hide the crumb below about 700 px when the five places are shown, or truncate the species part with an ellipsis and keep "Species" whole.

### P8. Minor: the extremes notice mixes units and number formats in °F

**What I saw.** On Echinopsis thelegona in °F:

> the correction for elevation, -1257 m, is beyond the 1,000 m either way that a lapse rate is applied over: the weather cell's ground is 4,124 ft (1,257 m) higher

So two forms of the same figure appear in one sentence ("-1257 m" and "1,257 m"), metres in a feet page, and "lapse rate" is jargon. The cold card's short form ("extremes set aside: weather cell 4,124 ft higher") is clear. W12 found the same.

**Smallest fix.** Say it once, in the reader's units: "the weather cell's ground is 4,124 ft higher than the typical spot, more than the 3,281 ft (1,000 m) over which a height correction is applied".

### P9. Minor: on a tablet, the photograph placeholder's words sit under the name card

**What I saw.** On the iPad (810 px) with a photograph that did not load, "photograph did not load" is half hidden by the card that overlaps the photograph band (`shots/dev-ipad-_species_echeveria_elegans.png`). It only happens when the photograph fails.

**Smallest fix.** On wide layouts, put the placeholder's label in the band's top half.

### P10. Minor: a cold species page shifts its actions row once

**What I measured.** On Echeveria elegans, cold, throttled: CLS 0.026, of which 0.023 is `DIV.acts` at 3.46 s (`r-slow-species.json`). Every species page also shifts the crumb by 0.0027. The total is inside Google's "good", but the row moves just as a finger could reach Add.

**Cause.** My reading, not proved: the row's last links (Share card) arrive with hydration.

**Smallest fix.** Render the row's links on the server, or reserve their line.

### Performance on a throttled phone (round 84's P5, left by decision)

Measured at iPhone 13, CPU ×4, 150 ms, 1.6 Mbps down and 750 kbps up, the worker blocked. One load each, on a shared two-core machine (`40-slow.mjs`, `r-slow-*.json`).

| Page | Load | FCP | LCP (element) | CLS | TBT (longest) | HTML decoded / sent |
|---|---|---|---|---|---|---|
| `/` cold | 3.9 s | 2,480 ms | 2,604 ms (strip photograph) | 0 | 282 ms (446) | 103 / 16 kB |
| `/` warm | 0.8 s | 648 ms | 648 ms | 0 | 153 ms | same |
| Sempervivum tectorum, second page | 4.8 s | 1,024 ms | 4,832 ms (iNaturalist) | 0.003 | 421 ms (359) | 182 / 40 kB |
| Echeveria elegans, cold from a search engine | 6.3 s | 1,716 ms | 5,556 ms (iNaturalist) | 0.026 (P10) | 540 ms (495) | 140 / 30 kB |
| Aloe framesii ("not checked"), next page | 2.0 s | 448 ms | 2,000 ms | 0.003 | 135 ms | 102 / 20 kB |
| Hoodia alstonii, next page | 1.8 s | 748 ms | 1,836 ms | 0.003 | 237 ms | 115 / 26 kB |
| My plants, 400 plants, ×3 | 0.3 to 0.5 s | 440 to 540 ms | 1,152 to 1,248 ms | **0.000** ×3 | 287 to 429 ms | 17 / 5 kB |
| Today, 400 plants | 0.4 s | 808 ms | 808 ms | 0 | 51 ms | 16 / 5 kB |

**Against round 84's review:**
- The cold front page's TBT (282 ms) is well under round 84's 1,264 ms. The machine and load differ, so this is not a proved gain.
- Sempervivum's HTML has grown from 175 to 182 kB.
- What costs most on a species page is still the third-party hero photograph (LCP 4.8 to 5.6 s).

**What would help most:**
1. a smaller first-visit script set (55 files on a cold front page);
2. `fetchpriority=high` and a sized `srcset` on the hero.

## The round-84 reviews' findings in my area

| Finding | Status | Evidence |
|---|---|---|
| P1 chart at 360/320 px | **Fixed** | Drawn 338/308/268 for 350/320/280 shown; smallest label 11.4 to 11.5 px; none cut (walk G01, `r-dev-*.json`). At 200% text: P6 |
| P2 My plants shift (with A12, B4) | **Fixed** | CLS 0.000 on three throttled loads with 400 plants; Today 0 |
| P3 notch in landscape | **Fixed** (insets emulated) | Last control at 703 of 750 with 47 px insets, 755 of 814 with 59, on species, plant and Compare pages |
| P4 compare pill everywhere | **Fixed** | Shown on 2 species pages; hidden on `/plants`, a plant, Today, spaces, `/`, `/compare` |
| P5 cold front page | **Left** (decision) | Measured above |
| P6 Record draft dropped on Back | **Fixed** | Back stays; "What you typed is kept: 'Record…' opens it again. Open it" restores "top dressed with grit"; Cancel drops it (walk D01) |
| P7 author sentences on the first screen | **Fixed** | Aloe framesii's reason is 4 lines plus "Why"; Echinopsis thelegona's Wikidata line is gone |
| P8 gaps around 44 px buttons | **Fixed** | Line tops 21.6 px apart around "Write what you know" |
| P9 few-records only in a title | **Half** | The glance mark is linked; the habitat line's chip is not (P4) |
| C1, C2, A22 the list and the Add press | **Fixed on a phone** | List never opened without focus (A1 to A3, K01). Add right after typing: 10 presses added at one, including with the search 1.6 s late and names failing. An unknown name with names failing was asked as it should be. P2 is a different cause |
| W5, A9 cultivar under a genus | **Fixed** | ‘Lola’ and “Buddha’s Temple” are "CULTIVAR, species not stated", at one press |
| S3 curly quotes | **Fixed** | As above; “…” is stored as ‘…’ |
| W6 older name typed | **Regressed side effect** | P2 |
| W8 restore counted as a backup | **Fixed** | Today: "backup today, not synced" right after a restore |
| A14 "backup −1 d" after 8 pm | **Not run at 8 pm** | Read only at about 10 am New York time |
| A17 navigation at 640×400 | **Fixed**, crumb cut (P7) | The five places show, none cut (walk F01) |
| B3 habitat line on the first screen | **Done, half on screen** | P3 |
| B7 touch targets | **Fixed**, one new exception | "Figures ›" (P4) |
| B8 maps tied to captions | **Fixed** | `aria-describedby` = `range-caption` / `records-caption`, both present (walk G02) |
| W1 regions as rectangles | **Fixed** | Close-ups of Hoodia alstonii, Galanthus nivalis and Aloe vera draw the shapes (`shots/map-iPhone13-*`) |
| Round 81's P1 to P10 | **Hold** | Search Back kept 90 of 256 at 151 px; catalogue Back within 1 px; menu fits and scrolls in landscape; Back closes viewer and menu; HEIC refused in words |

## Confirmed working

- **The race (Chromium, touch).**
  - 16 presses right after typing or leaving the field (picker B1 to B6, walk R01 to R03, K02 ×2, C04 offline, journey 9 ×2): none lost.
  - Under the finger was always the Add button, never the list.
  - "Checking the name…" or "Adding…" showed within 3 to 23 ms.
- **Offline.** 153 files were cached at install (165 after reading).
  - These open with no signal: `/`, a species page read in full, one read only by a catalogue tile, `/plants`, a plant, spaces, Today, Propagation, Labels, Backup, Settings and `/?q=aloe`.
  - Unread pages, `/compare` and `/about/how` say "No connection. Your collection is on this device and works without one."
  - The maps draw offline (`<use>` of `land50`/`regions50`).
  - A watering survived a reload. An add offline asked once, then filed "Name not checked".
  - With the signal back, an unread page opens.
- **Install.**
  - The manifest is standalone, with 192 and 512 icons (one maskable).
  - `apple-mobile-web-app-capable` "yes".
  - The viewport is `width=device-width, initial-scale=1, viewport-fit=cover`, so pinch zoom is allowed.
  - `persisted` is false, and the backup nudge says so in a grower's words.
- **Camera.** Two 12 MP orientation-6 JPEGs are stored upright at 1200×1600 (Blobs of 132 kB) and dated 2026-10-20. A HEIC is refused in words.
- **The keyboard.** With the page 300 px shorter, the focused field stays in view. The bar joins the flow at 455 px, deliberately.
- **The example collection.** 12 plants; "Leave" goes to `/`, with 0 plants and 0 changes left.
- **Labels.** 2.625×1.000 in printed, with QR codes; the bars are hidden in print.
- **Print of a species page.** The five cultivation sheets open; "How this section is made" stays closed.
- **Dark mode at 360.** Right on 5 pages.
- **Sideways scroll.** None on any page at any size.

## Mobile against PC: the thirteen journeys

Desktop is W's, at 1280 (`review-w.md`). Phone is mine, at iPhone 13. Journeys 1, 3, 4 and 13 were also run at 360 and 320.

| # | Journey | Desktop (W) | Phone (P) | What differs | Right? |
|---|---|---|---|---|---|
| 1 | Front, by genus, H, Haworthia, a species, Back | Works; Back held | Works: ready 1.10 s (360: 1.05; 320: 1.49); tile 166→165 px, 228→229 at 360, 69→68 at 320; strip from Popular genera (Ficus carica, Aloe vera, Pelargonium inquinans…) | Tab bar against top segment | Yes |
| 2 | "echeveria", Show more, open, Back | Works; 30→90 of 256, kept | Works: 30→90 of 256; Back kept query, list and place (151→151) | None | Yes |
| 3 | Snake plant; Sansevieria; peacockii and its address; Ceropegia alstonii and its address | Works, with W1's false sentence | Works, with the same sentence (P1); the notice heads the page above the photograph at every size | Where the notice sits | Gap on both (P1/W1) |
| 4 | Keyless Aloe framesii | Works | Works: "not checked" once, "not asked" 0, every "none" qualified; no habitat line (no climate) | None | Yes |
| 5 | Compare two | With faults: no way to `/compare` from one pick (W7) | Works: pill "Compare 1, pick one more ›" → picker → two columns; Back → `/compare` | The pill leads on; the desktop tray does not | Gap on desktop (W7) |
| 6 | Add from species page; ‘Lola’ (P adds “Buddha’s Temple”) | Works | Works: 2026-0001 "plant from Seed swap"; both cultivars "species not stated" at one press | P's numbers are one higher after it | Deliberate |
| 7 | Space, Water all, Undo, water | Works | Works: toast at y 502 above the tab bar, Undo 56×44, "Undone: the 1 watering line removed." | None | Yes |
| 8 | Leaf cuttings ×6, one struck | Works | Works: S2026-001, 17%, linked both ways | None | Yes |
| 9 | Two typed adds, labels, print | Works | Works: one press each; 2.625×1.000 in printed; the screen preview scrolls in its 358 px box | Preview scrolls on a phone | Deliberate |
| 10 | Back up, clear, restore | Works | Works: 3.7 kB zip; 159 changes before and after; "backup today" | None | Yes |
| 11 | Units, reference photographs | Works | Works: en-US opens in °F; the switch toggles | None | Yes |
| 12 | Example, leave | Works | Works: 12 plants; the example bar is 44 px; Leave → `/`, empty | None | Yes |
| 13 | Few records, extremes set aside | Works | Works: habitat line "from 3 records · Coldest month 46.4 °F mean nightly low, not a floor"; cold card names the cause; chart readable at 390, 360 and 320 | Phone-only habitat line; its chip unlinked (P4); at 320 below the fold (P3) | Deliberate; P3 and P4 are gaps |

**Differences outside the journeys:**
- The add form's false older-name line (P2) is the same on both; W's typed names did not meet it.
- The first press on Add arms rather than adds on both.

**Deliberate and right:**
- the tab bar and the pinned bars under 700 px;
- the menu as a sheet;
- the pinned bar joining the flow under 480 px tall;
- the habitat line only under 641 px.

## The WebKit walk for the owner's PC

**File:** `/tmp/claude-0/rev85r/P-s/round85-webkit-walk.mjs`. It is plain ESM, uses the project's own `@playwright/test` and has no local proxy. It runs iPhone 13, then the worker and offline, then the iPad both ways, landscape, and 640×400. It is read-only on the live site. The budget is `--budget 320` by default (a cold run here cost 257 up to C04). Its output is `webkit-walk-<date>\` (a PNG a step, `webkit-walk.json`, and one printed line a step).

**Steps (34).**

Round 84's walk:
- A01, A02, A04, A05, A05b, A06;
- R01 to R04, the race;
- M01, M02;
- A08 to A10, A16, A13;
- C01, C03 to C05;
- B01, B02, A17.

New for round 84:
- **M03:** `/species/ceropegia-alstonii`. It flags P1's sentence as UNTRUE.
- **K01:** the list after the field is left (C1).
- **K03:** the accepted-homonym line and the presses it takes (P2).
- **K02:** ‘Lola’ and “Buddha’s Temple” at one press, filed "species not stated".
- **H01:** the habitat line on three page kinds and whether it is on the first screen.
- **G01:** the chart at 390, 360 and 320 px.
- **G02:** the region maps and their captions.
- **D01:** the Record draft through Back.
- **P01:** a species page's sheets open in print, and labels at 2.625×1.000 in.
- **F01:** the five places at 640×400.
- **A09:** now also hands over a HEIC.
- **C03's control:** an unread page, `/species/agave-parryi`, so that H01's visit to Aloe framesii cannot mask a failed offline switch.

**Tested here in Chromium** (photograph hosts refused by a local CONNECT filter, `P-s/tools/onlysite-proxy.mjs`):
- **Run 1, cold** (`walk1.out`): A01 to C04 passed. All four races were "added". K01 held, M03 flagged UNTRUE, K03 gave two presses each, K02 filed as cultivars, G01 had labels of 10 px or more, D01 was kept, and C03 was "offline held". It then ran out of the 260 budget before C05, B01, B02, A17 and F01. The default is now 320.
- **Run 2, warm** (`--reuse --only A01,A08,P01,C05,B01,B02,A17,F01`): all 8 passed. P01's numbers were right (5 of 5 sheets open, 2.625×1.000 in), but its verdict line misread them. That is fixed, and the expression was checked against the recorded values.
- **Run 3:** only the cold A08, by my mistake.

## Not checked, with why

- **A real iPhone and WebKit.** Not on this machine: the safe-area insets, the real keyboard, Add to Home Screen, the date and select pickers, momentum scroll, bfcache.
- **A14 at 8 pm local time.** The runs fell in the morning.
- **Sync.** By the rules.
- **The service-worker update from round 83's worker.** That is C's area.
- **Photographs on most throttled loads, medians, and further sizes.** My request budget is spent. Every throttled figure is one load.
- **The iPad's and landscape's full page sets.** Five pages each.

## Needs from the PC

1. **Run the walk.** From the project's folder: `node <path>\round85-webkit-walk.mjs`. Send back the printed lines, `webkit-walk-2026-11-xx\webkit-walk.json` and the PNGs. The steps that matter most:
   - R01 to R04 and K02. If any says LOST, run `--only A01,R01,R02,R03,R04,K02` three more times.
   - K03, P2's two presses in Safari.
   - M03, K01, G01, P01, D01 and F01.
2. **On the iPhone:**
   - on `/plants/new`, type "Echeveria elegans" and tap Add once: does it add, or does the button turn to "Add as typed" under "An older name of Echeveria harmsii" (P2)?
   - in landscape on a species page, is "+" clear of the notch?
3. **On an Android at its largest font setting:** Echeveria elegans's climate chart (P6).

