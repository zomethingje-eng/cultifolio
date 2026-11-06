# Review after round 85: reviewer P (the phone grower; mobile against PC)

Reviewer P, 2026-11-05, 18:22 to about 21:00 UTC. Live site https://cultifolio.com: Worker `ba32fc3e`, corpus `48c27bf790016ccc` (48,375 species).

**How I ran it.** Playwright 1.63 with Chromium 141 and its device descriptors (`isMobile`, `hasTouch`, real taps, keystrokes); iOS safe areas through CDP. Scratch `/tmp/claude-0/rev86r/P-s/` (harness `lib.mjs`, scripts `NN-*.mjs`/`q*.mjs`, results `r-*.json`, screenshots `shots/`). Every screenshot cited I looked at. No WebKit here: the walk is for the PC.

## Verdict

**Works with faults; ready to show the public on phones.** On every size from 320 px to the iPad, both ways, a grower can browse, search (old names, merged names, "San Pedro", "Hibiscus acetosella"), come Back to the same place, read every kind of species page, add plants by link, by typing and offline, re-file a plant typed under GBIF's name, make spaces, water and Undo, propagate, print labels at true size, back up, refuse a damaged file, restore, try and leave the example, install the app and use it with no signal. Round 85's two major phone faults are fixed on the live site: the old address now says whose verdict each name is, and an accepted name typed on the add form ("Echeveria elegans", "Galanthus plicatus", "Crassula ovata") adds at one press with no false "An older name of" line. Nine of round 85's ten phone repairs hold.

What is left is one misleading map label on the owner's own plants (P1), and polish: the new first screen is not whole at 320 × 568 on few-records pages and on any arrival by an older name (P2), the habitat line's two links overlap at 320 px (P3), long authors run out of the name card (P4), a five-second "Checking the name…" when the name service fails (P5), and smaller items. Nothing loses data.

### Scores (phone)

| Area | Score | Why | What would make it a 10 |
|---|---|---|---|
| Mobile | 8.5 | 16 journeys complete at 390 px, the main ones at 360 and 320; no sideways scroll at normal text on any of 13 sizes; the notch cleared in landscape; the race holds (13 presses, none lost) | P2 and P3 at 320 px; P4; P7 at 200 % text |
| UX on a phone | 8.5 | The re-file, the verdict line, the about folds by link and the damaged-backup refusal are clear; Back holds everywhere I tried | P2 (old-name arrivals), P5, W1's one word for one state (P10) |
| Performance, throttled phone | 7 | Front cold FCP 2.6 s, LCP 3.2 s; My plants at 400: CLS 0 twice; a rich page cold LCP 6.3 s (the photograph host) with 127 kB of coastline fetched eagerly | P9: the close-up's coastline when the map nears view; the hero first |
| Accessibility under a finger | 8.5 | 44 px on the fold, "Figures ›" and the few-records mark (by an invisible margin); maps tied to captions; dark mode right | P3's overlap; P8's unmarked folds |
| Appearance on a phone | 8 | The first screen reads well at 390; the close-ups draw true shapes; dark mode clean; the lead band tidy | P1's label, P4's author, P8's folds |

### What I covered

- **Sizes (14):** iPhone SE 1st gen (320 × 568), SE 3rd gen (375 × 667), 320 × 700, iPhone 13 (390), 15 Pro Max (430), both iPhones in landscape, Pixel 7 (412), Galaxy S8 (360) also dark and at 130 % and 200 % text, iPad 7th gen both ways, 640 × 400 (a laptop at 200 %). 5 to 11 pages each with 30 plants on the device (`20-devices.mjs`, `r-dev-*.json`).
- **The first screen:** 15 species pages of every kind (rich, few records, no climate, not asked, new, same-type, two old addresses) at five sizes, the fold opened on each (`12-first.mjs`, `r-first-*.json`, `shots/first-*`).
- **Journeys:** all 14 agreed steps at iPhone 13 (`10-journeys.mjs`, `11-collection.mjs`); 1, 3, 4 and 13 also at 360 and 320; 6 and 9 also at 320; 13 and 14 also in dark mode.
- **The picker and the race** (`30-picker.mjs`): 3 leave-the-field cases, a typed name and the next field, 9 Add-at-once cases with `/api/search` 1.6 s late and `/api/names` failing; the name check timed three ways (`q9.mjs`).
- **Round 85's phone changes one by one** (`13-misc.mjs`, `q3.mjs`–`q8.mjs`); the close-up maps of 13 species (`q6.mjs`).
- **Install and offline** (`60-offline.mjs`); **print** and **labels** (`50-misc.mjs`); **throttled loads**, 10 (`40-slow.mjs`).
- **The WebKit walk** updated for round 85 and tested here in Chromium.
- **Requests to cultifolio.com: about 1,460 by my counts, an upper bound** (`P-s/budget.json`): 925 by the harness, then the walk's three test runs 286 + 97 + 154 (its worker estimate is an upper bound). My harness counts every routed fetch exactly (it caches the build's hashed files, the maps and, for these scripts, species HTML and API answers by URL and cookie, so a page read twice costs once). The throttled runs go unrouted and counted every request event, memory-cache hits included: 766 counted, about 270 real by transfer size; the file holds both figures. **Third-party: 141**, only the 500 px lead photographs and those the throttled and offline loads asked for; about 1,400 refused before they were sent. No sync, no POST. `/api/index` not fetched (D's copy read).

## Issues

Ranked as the review prompt ranks them.

### P1. Major (a wrong-looking map on the owner's plants): the close-up's region names are placed at the middle of each region's box, so "Cape Provinces" is written across southern Namibia on Hoodia alstonii

**What I did.** Opened the close-up map ("Openly licensed records inside the range") on Hoodia alstonii and on eight other southern African succulents at 390 px (`13-misc.mjs`, `q6.mjs`).

**What I saw.** On Hoodia alstonii (`shots/m86-map-hoodia-alstonii-1.png`) both names, "Namibia" and "Cape Provinces", sit north of the Orange River and west of 20° E, inside one outline: Namibia's. The Cape Provinces' land in the frame is the strip south of the river and the sliver east of 20° E; neither carries its name. A grower reads the map as "the plant grows in the Cape Provinces, here", pointing at Namibia. The other close-ups I looked at (`shots/cu-grid.png`: Aloidendron dichotomum, Fenestraria rhopalophylla, Hoodia gordonii, Euphorbia virosa) happen to land inside their regions.

**Where.** `src/lib/map/still.ts:150`: `cx`/`cy` is the middle of the region's bounding box clipped to the frame, never tested against the region's shape. An L-shaped region (the Cape Provinces, Chile, Mexico, Indonesia's islands) has its box middle outside itself whenever the frame cuts it. My reading, not counted across the corpus.

**What should happen.** A name is drawn only on its own region's land, or not drawn (the regions are listed beside the map already).

**Smallest fix.** Store one label point per region and scale (a pole of inaccessibility, computed when `r-<code>.svg` is made), clip it to the frame, and test it with the same shape before drawing; else leave the name out. A test on Hoodia alstonii's frame.

### P2. Minor: the phone's new first screen is not whole at 320 × 568 on few-records pages, and on no phone when the page is reached by an older name

**What I did.** Measured the habitat line (`.hline`) against the tab bar's top on 15 pages at five sizes (`12-first.mjs`, `r-first-se1.json`, `r-first-se3_i13_s8_w320x700.json`).

**What I saw.** On plain pages it is whole everywhere, as round 85 promised (Echeveria elegans at 320 × 568: 285 to 470 against a bar at 511). It is not whole:

| Page | 320 × 568 | 375 × 667 | 390 × 664 | 360 × 740 |
|---|---|---|---|---|
| Echinopsis thelegona (few records) | 321–527, bar 511: **16 px under** | whole | whole | whole |
| Sabdariffa acetosella (few records) | 321–555: **44 px under** | whole | whole | whole |
| `/species/ceropegia-alstonii` → Hoodia alstonii | 481–679: **line starts under the bar** | whole (601 vs 610) | 430–601 vs 573: **cut** | whole |
| `/species/hibiscus-acetosella` → Sabdariffa | 509–743: **all under the bar** | 487–693: **cut** | 487–672: **cut** | 487–693 vs 683: **cut** |

Two causes:
- On a few-records page the head line "HABITAT IN SHORT · from 3 records · Figures ›" wraps to two lines at 320 px (`shots/first-se1-echinopsis-thelegona.png`).
- An arrival by an older name puts round 85's verdict notice, three to four lines, above the photograph (`shots/first-i13-ceropegia-alstonii.png`). Every search hit for an older name links `?was=`, so every grower who searches the name on their label lands this way.

**What should happen.** The name, Add and the habitat's four figures on the first screen in every case the round promised, including the arrival by an old name.

**Smallest fix.** On phones, put the verdict notice under the name card (after the habitat line), or show its first sentence with the rest behind "Why", as the not-asked notice does. Keep the head line to one line at 320 px: "Figures ›" as "›" with its label for screen readers, or the few-records mark moved into the cold figure's own line.

### P3. Minor: at 320 px the habitat line's two links overlap, so a tap on the lower half of "from 3 records" opens "Figures"

**What I did.** At 320 × 568 on Echinopsis thelegona and Sabdariffa acetosella, sampled every 3 × 6 px point of the few-records mark's box and the 12 px below it with `elementFromPoint` (`13-misc.mjs` step `overlap320`, `r-misc86.json`).

**What I saw.** The head line wraps (the mark at y 329–348, "Figures ›" at 350–369 under its right half). Each link's invisible 44 px margin is centred on it, so they overlap: 32 points inside the mark's own box (its lower right) reach "Figures ›"; in all, 64 of 160 points under a fingertip go to "Figures". The walk's T01 found the mark's own middle point goes to "Figures" too, and a touch tap on its lower right went to `#s-glance`. In journey 13 at 320 px the tap on the mark did not reach `#few-records` (`r-j-se1-1_3_4_13.json`), where at 390 and 360 it did. So at 320 px the few-records mark is, in effect, not tappable.

**Where.** `src/lib/ui/ref/HabitatLine.svelte`, `.hhead a::after` under `pointer: coarse`; its comment says "the two sit at either end of the line, so the margins do not meet", which is untrue when the line wraps.

**Smallest fix.** P2's one-line head fixes this too; otherwise clip each `::after` to its own line (`height: max(100%, 32px)` once the line has wrapped), or `flex-wrap: nowrap` with the label allowed to shrink.

### P4. Minor (appearance): a long author runs out of the name card at 320 px

**What I saw.** At 320 px the author is one unbreakable line: "(Welw. ex Hiern) M.M.Hanes & R.L.Barrett" ends at x 304, the card at 289 and its content at 273 (`q3.mjs`; `shots/first-se1-sabdariffa-acetosella.png`, `shots/card-iPhoneSE-sabdariffa-acetosella.png`). The same on Echinopsis thelegona ("H.Friedrich & G.D.Rowley", to 290) and Echinopsis pachanoi. The text sits on the grey page beyond the white card. No page scrolls sideways.

**Where.** `src/lib/ui/theme.css:272`, `h1.sci .auth { … white-space: nowrap; }`. W5 sees the other side of it on the desktop (the binomial split to keep the author whole).

**Smallest fix.** `white-space: normal` on `.auth`, with the non-breaking space between the epithet and "(" that `SpeciesName` already writes, so the author wraps within itself.

### P5. Minor: with the name service failing, Add stays "Checking the name…" for five seconds after the line under the field already says the service did not answer

**What I did.** `/plants/new`, typed "Aloe nonexistens", pressed Add at once, three ways (`q9.mjs`), and the same in the race (`30-picker.mjs` B3).

**What I saw.**

| Condition | Line under the field | Button disabled "Checking the name…" until |
|---|---|---|
| nothing failing | — | 1,565 ms, then "Add as typed" |
| `/api/names` failing (aborted at once) | "The name service did not answer…" at 7 ms | **5,216 ms** |
| names failing, search 1.6 s late | the same at 112 ms | **5,627 ms** |

So for five seconds the page says two things: the service has failed, and it is checking. A grower in a greenhouse with one bar presses again on a disabled button. The plant is then filed correctly, at the second press ("Name not checked").

**Where.** `src/lib/ui/SpeciesPicker.svelte` (the check before a plant is filed). I did not find the five seconds by reading; the cause is not proved.

**Smallest fix.** Settle the check when the name service's promise rejects, not on a timer; a test with `/api/names` aborted that expects "Add as typed" within the reference search's own time.

### P6. Minor: the plant page's "found by" line runs into its button

**What I saw.** A plant typed "Ceropegia alstonii" and kept: "Filed under GBIF's name for its key; the reference heads its page *Hoodia alstonii*File it under *Hoodia alstonii*" (`shots/J9-i13-c-ceropegia-plant.png`): no space between the link and the button, both underlined green, so a phone reader sees one run-on line with two links in it. The button is 171 × 21 px. W4 reports the same on the desktop. Pressed, it works: "Now filed under Hoodia alstonii; the old name is kept as received.", a log line "Renamed from Ceropegia alstonii to Hoodia alstonii (…)", and the card "Hoodia alstonii, received as Ceropegia alstonii" (`shots/J9-i13-d-ceropegia-refiled.png`).

**Where.** `src/routes/plants/[acc]/+page.svelte:781`.

**Smallest fix.** The button on its own line under the sentence, as a 44 px button ("File it under Hoodia alstonii"), not a link-styled word.

### P7. Minor: at 200 % text the record of sources' rows run out of the page

**What I did.** Galaxy S8 with the root font at 200 % (Android's largest text), Echeveria elegans, "Where this page came from" opened (`q7.mjs`).

**What I saw.** Each row ("GBIF species record `gbif.species` answered …") is wider than the screen; the document's scroll width became 495 px at 360, and the row's words are cut at the card's edge (`shots/tx86-row.png`). With every fold opened at 100 % and 130 % text, nothing overflows (`q8.mjs`).

**What should happen.** The rows wrap.

**Smallest fix.** Let the row's key (`code.faint`) wrap (`overflow-wrap: anywhere`) and the row stack under 30 em.

### P8. Minor (appearance, accessibility): "The rules in full" folds have no mark that they open

**What I saw.** On `/about/how` and `/about/formats` each fold's summary is bold body text with no triangle or chevron (`shots/m86-how-fold-closed2.png`): `display: flex` on the summary removes Chromium's marker. "The rules in full" and "How a name is matched to Kew's entry" read as small headings. The page's first list says the rules are "one tap away, under 'The rules in full'", which is the only hint. On a species page the same kind of control ("› Why") has its chevron.

**Where.** `src/routes/about/how/+page.svelte:1107` (and `formats` the same).

**Smallest fix.** The species page's chevron (`::before` "›", turned when open) on `.more > summary, .full > summary`. W15 asks for distinct names for the 36 folds; both in one change.

### P9. Minor (performance): a species page fetches its close-up's coastline at once, 127 kB compressed, before the lead photograph

**What I measured** (iPhone 13, CPU × 4, slow 4G: 150 ms, 1.6 Mbps down; `40-slow.mjs`, `r-slow-*.json`; one load each on a shared two-core machine):

| Page | FCP | LCP (element) | CLS | TBT (longest) | Map files |
|---|---|---|---|---|---|
| `/` cold | 2,616 ms | 3,220 ms (a strip photograph) | 0 | 491 ms (568) | — |
| `/` warm | 412 | 412 | 0 | 352 | — |
| Sempervivum tectorum, second page | 1,156 | 4,020 (iNaturalist) | 0.0027 (crumb) | 398 | 18 files, 145 kB |
| Echeveria elegans, cold from a search engine | 3,104 | **6,300** (iNaturalist) | 0.0029 | 726 (571) | 8 files, 133 kB |
| Aloe framesii (not asked), next page | 664 | 2,252 | 0.0027 | 58 | 2 files |
| Hoodia alstonii, next page | 732 | 1,648 | 0.0027 | 246 | 2 files |
| Galanthus nivalis (18 regions), next page | 824 | 1,968 | 0.0027 | 196 | **36 files**, 41 kB |
| My plants, 400 plants, two loads | 584 | 1,196–1,592 | **0** | 339–628 | — |
| Today, 400 plants | 840 | 840 | 0 | 0 | — |

The per-region files work (0.2 to 16 kB a region). But a first species page also fetches `land110.svg` (27 kB sent) and `land50.svg` (100 kB sent, 260 kB decoded) eagerly at 1.25 s, with the close-up three screens down: 127 kB ahead of the lead photograph on slow 4G. The cold LCP (6.3 s) is the third-party photograph, as in round 85. The only layout shift left is the crumb's 0.0027 on every species page.

**The front page's TBT is not a launch blocker:** 491 ms here (282 in round 85) on a machine shared with four reviewers' browsers; next round's work.

**Smallest fix.** Load the close-up's `land50` when its figure is within a screen of view (the `<use>` written on intersection), and the world map's `land110` the same; one sprite per page for a page with many regions (Galanthus's 36 requests) if HTTP/2's multiplexing proves not enough on a real phone.

### P10. Minor (W1's case, on the phone): GBIF's name for a renamed page is "An older name of" on the add form only

Typed "Hibiscus acetosella" or "Ceropegia alstonii": "GBIF 7802717 · An older name of *Sabdariffa acetosella*, which has a species page: pick it, or press "Add as typed"…" (`shots/J-i13-asked-Ceropegia_alstonii.png`), while the plant page says "Filed under GBIF's name for its key" and the species page "…is GBIF's name for this plant, and GBIF's backbone accepts it". The merge's "one behaviour each" says the three agree. W1 has the rate; confirmed at 390 and 320.

### P11. Minor: the extremes and few-records notices do not link to their rules

Echinopsis thelegona's extremes notice and few-records notice have no "how" link; the page links `/about/how#floor`, `#year`, `#regions`, `#records`, `#no-gbif-key` and others, not `#set-aside` or `#few`, which exist (journey 14). Only `#regions` of the nine is inside a fold; it opens at 121 px under a 49 px bar, and Back returns to the same scroll (3,623 → 3,623). **Fix:** a "How" link after each notice, as the not-asked notice has.

### P12. Minor (for S): the same-type summary's line calls GBIF's accepted name an "older name"

Sabdariffa acetosella: "Quoted from Wikipedia, "Hibiscus acetosella", revision 1359991754, … its title is one of this species' older names (GBIF Backbone), which is the proof that the article is this species'." The verdict line on the same page says GBIF's backbone accepts Hibiscus acetosella; the proof the build used is the same-type rule by Kew's identifiers, which the page does not say.

### P13. Minor (W6 on the desktop): San Pedro's page sends the grower to Echinopsis macrogona, which never says San Pedro

"San Pedro" and "Trichocereus pachanoi" find Echinopsis pachanoi first; its notice links Echinopsis macrogona "where its records are" (a 141 × 16 px link in a sentence). Macrogona's page has no "pachanoi" or "San Pedro" (`r-j-i13-3.json`). The decision stands (§4, 1); the receiving page should say why the grower is there.

## The round-85 reviews' findings in my area

| Finding | Status | Evidence |
|---|---|---|
| P1 / W1 / C1 / A1 verdict line on an old address | **Fixed** | `/species/ceropegia-alstonii` → 302 → "…is GBIF's name for this plant, and GBIF's backbone accepts it. Kew's World Checklist holds it as a synonym of *Hoodia alstonii*…" at 390, 360 and 320; Hibiscus acetosella the same way |
| P2 / S1 accepted name "An older name of" another; first press lost | **Fixed** | "Echeveria elegans" (search 1.6 s late), "Galanthus plicatus", "Crassula ovata": added at one press, no line (B6–B8) |
| P3 / B3 habitat line on the first screen | **Half** | Whole on plain pages at every size; not on few-records pages at 320 × 568 nor after an old-name arrival (P2) |
| P4 / B4 / A16g 44 px for "Figures ›" and the mark | **Fixed, one new fault** | `::after` 51 × 44 and 95 × 44; the mark is a link to `#few-records` and lands there at 390 and 360; at 320 the margins overlap (P3) |
| P5 / A16b list and the next field | **Fixed** | "Crassula ovata" typed in full: 3 rows (266–431), the date field (511) reached by a tap; with the keyboard (viewport 364 px) the list fits in 268–358; the pinned bar joins the flow |
| P6 chart at 200 % text | **Fixed** (ticks); new P7 | Drawn at 260 for 320 shown; ticks apart (`shots/tx86-chart.png`); the register overflows (P7) |
| P7 / W14 crumb without ellipsis | **Fixed** | "ECHINOPS…", "SPECIES ›…" in landscape; W: not drawn at 640 |
| P8 units in the extremes notice | **Fixed** | "…4,124 ft higher than the typical spot's, more than the 3,281 ft (1,000 m) over which a correction for height is applied" |
| P9 iPad placeholder under the card | **Fixed** | "photograph did not load" in the band's top half, clear of the card (`shots/dev-ipad-_species_echeveria_elegans.png`) |
| P10 cold page shifts its actions | **Fixed** | CLS 0.0029, all of it the crumb (0.0027); no `DIV.acts` shift |
| A16f My plants shift as fonts arrive | **Fixed** | CLS 0 on both throttled loads at 400 plants |
| The phone's folded names (B3) | **Works** | One English name; "Crassulaceae · Mexico Northeast +2 MORE" a 44 px summary; opens to "Also called", "Family", "Native to", the group (15 pages × 5 sizes) |
| Performance: per-region maps (round 84's P5) | **Half** | Region files 0.2–16 kB; the land files 127 kB still eager (P9) |
| C2/C3/A13 the race | **Holds** | 13 presses right after typing or leaving the field; none lost; "Checking the name…" or "Adding…" within 2–21 ms; P5 is the failing-service case |
| W12 `/labels` shift | not measured on the phone (W: 0.035 at 376 plants) | |
| C6 a species page read before a deploy, offline after | **Not tested** (C's) | |

## Confirmed working

- **Back** after a catalogue tile (165 → 163 px at 390; 227 → 228 at 360; 69 → 68 at 320), after "Show more" (151 → 151, query and "90 of 256" kept), from compare, from an about page (same scroll), from the Record form (draft kept, "Open it" restores it, Cancel drops it).
- **Search** at 390, 360 and 320: snake plant, Sansevieria trifasciata ("older name"), Echeveria peacockii ("merged into this page", old address 302 and the line), Ceropegia alstonii, Hibiscus acetosella, "San Pedro" (Echinopsis pachanoi first of 4).
- **The add form:** ‘Lola’ and “Buddha’s Temple” "cultivar, species not stated" at one press; Hibiscus acetosella by its row filed on Sabdariffa acetosella; kept as typed, its page finds Sabdariffa and offers the re-file. With the page 300 px shorter (the keyboard), the focused field stays in view and the bar joins the flow.
- **Collection:** Water all, the toast above the tab bar, Undo 56 × 44; propagation 1 of 6 = 17 %, linked both ways; labels 2.625 × 1.000 in with QR codes; a species page prints its five sheets open.
- **Backup:** the half file refused in words with 234 changes before and after; restore in a new context brings 8 plants, 1 space, 1 batch, 13 entries; Today "backup today, not synced".
- **Example collection:** 12 plants; Leave → `/`, 0 plants, 0 changes.
- **Offline:** the worker controls after two pages; 154 files at install, 170 after reading; with no signal every collection page, `/`, `/?q=aloe`, a species read in full (both maps draw from cached `w-`/`r-` files) and one read only by a tile open; unread pages, `/compare` and `/about/how` say "No connection. Your collection is on this device and works without one."; a watering survives a reload; an add files "Name not checked"; with the signal back an unread page opens.
- **Install:** standalone manifest, 192/512/maskable icons, `apple-mobile-web-app-capable`, viewport with `viewport-fit=cover` and pinch zoom allowed; `persisted` false.
- **Credits' days and revisions** on every page read ("Credits as read from iNaturalist on 2026-11-04"; "revision 1354845691, read 2026-11-03").
- **Bars:** top bar and section row sticky, tab bar fixed with the home-indicator inset; landscape controls clear 47/59 px insets; the menu fits, scrolls, and Back closes it.
- **No sideways scroll** on any page at any size at 100 % and 130 % text. **Dark mode** right at 360 and 390.

## Mobile against PC: the shared journeys

Desktop is W's at 1280 × 800 (`review-w.md`); phone is mine at iPhone 13, with 360 and 320 where noted.

| # | Journey | Desktop (W) | Phone (P) | What differs | Right? |
|---|---|---|---|---|---|
| 1 | Front, by genus, H, Haworthia, a species, Back | Works; Back 237 → 234 px | Works; ready 1.0 s (360: 2.0, 320: 1.7); Back 165 → 163 (360: 227 → 228; 320: 69 → 68) | Tab bar against top segment | Deliberate |
| 2 | "echeveria", Show more, open, Back | Works; 30 → 90 of 256, place kept | Works; 30 → 90 of 256; place 151 → 151, query kept | — | — |
| 3 | Common, older, merged, renamed names; old addresses; Hibiscus acetosella; San Pedro | Works; W1 on the rows | Works at 390, 360, 320; the same rows and verdict lines. The verdict notice pushes the habitat line off the first screen (P2) | Where the notice sits | Gap on the phone (P2); W1 on both |
| 4 | Keyless Aloe framesii | Works: "not asked", no "not checked" | Works at three sizes: 3 "not asked", 0 "not checked"; the notice on the first screen | — | — |
| 5 | Compare | Works: tray → `/compare`, 2 columns | Works: pill "Compare 1, pick one more ›" → picker → 2 columns; Back → `/compare` | Tray against pill | Deliberate |
| 6 | Add from page; ‘Lola’; Hibiscus acetosella by its row | Works; W3 (no "received as") | Works at 390 and 320; P adds “Buddha’s Temple”; Hibiscus filed under Sabdariffa, no "received as" | Plant numbers one higher | Deliberate; W3 on both |
| 7 | Space, Water all, Undo | Works | Works; Undo 56 × 44 above the tab bar | — | — |
| 8 | Propagation | Works | Works: S2026-001, 17 %, linked | — | — |
| 9 | Typed adds; Ceropegia alstonii kept and re-filed; labels | Works; "Add as typed"; re-filed; labels true size | Works: Haworthia, Lithops at one press; Ceropegia two presses (asked), re-filed, "received as" kept; by its row, one press; labels 2.625 × 1.000 in | The found-by line's run-in reads worse in a 230 px column (P6) | W4/P6 on both |
| 10 | Backup, damaged, restore | Works | Works; damaged refused, nothing changed | — | — |
| 11 | Units, photographs | Works | Works: °F from en-US; the switch toggles | — | — |
| 12 | Example collection | Works | Works: 12 plants, Leave → `/`, empty | — | — |
| 13 | Thelegona, winter decision | Works (four cards) | Works: habitat line "from 3 records · Coldest month 46.4 °F mean nightly low, not a floor"; cold card names the cause; at 320 the line is 16 px under the bar (P2) and the mark's tap is caught by "Figures" (P3) | Short line against cards | Line deliberate; P2, P3 gaps |
| 14 | About folds by link | Works: `#coast-reach`, `#islands`, `#sample`, `#merged`, `#regions` at 121 px under a 45 px bar | Works: `#islands` cold and `#regions` by a tap open their folds at 121 px under a 49 px bar; Back to the same place; dark mode right | — | — (P8 on both: no fold marker) |

**Differences outside the journeys:**
- The habitat line and the folded names are phone-only (under 641 px): deliberate and right.
- The verdict notice above the photograph costs a phone its first screen, not a desktop (P2): a gap.
- The author line: nowrap overflows the card on a phone (P4), splits the binomial on a desktop (W5): one rule wrong both ways.
- The close-up's label (P1), the add form's "older name" (P10/W1), the run-in button (P6/W4) and the unmarked folds (P8/W15) are the same on both.

## The WebKit walk for the owner's PC

**File:** `/tmp/claude-0/rev86r/P-s/round86-webkit-walk.mjs`. Plain ESM; the project's own `@playwright/test`; no proxy of its own; iPhone 13, then the worker and offline, then the iPad both ways, landscape and 640 × 400; read-only on the live site (no vault, no POST); `--budget 260` by default, counted by Resource Timing as it reaches the network (the worker's install estimated from its caches, an upper bound); a step the budget cannot take is skipped and said so. Output `webkit-walk-<date>\`: a PNG a step, `webkit-walk.json`, one printed line a step.

**Steps (31 in two runs).** Round 85's kept: A01, A02, A04, A05 (now also "San Pedro" and "Hibiscus acetosella"), K01, R01 to R04, K02, M01, G01, A08, A09 (two 12 MP orientation-6 JPEGs and a HEIC), D01, A13, P01, B01, B02, A17, F01, C01, C03 to C05. Changed: **M03** checks round 85's verdict line ("GBIF's name for this plant … Kew's World Checklist holds it as a synonym of Hoodia alstonii") and flags round 84's sentence as UNTRUE if it returns; **K03** now expects no "An older name of" line and one press. New: **F02** the first screen at 390 and 320 × 568 (Echeveria elegans, Echinopsis thelegona, `/species/ceropegia-alstonii`; the habitat line against the tab bar; the author inside the card), **N01** the folded names, **T01** the two overlapping links at 320 px, **M04** `/species/hibiscus-acetosella` and San Pedro's page, **G02** the per-region files fetched by each page (`w-`/`r-`, no `regions50.svg`) and every region drawn, **CR1** the credits' days and the summary's revision, **AB1** `/about/how` folded on arrival, `#islands` by address and `#regions` by a species page's link opened and below the bar, Back to the same place, **K04** "Hibiscus acetosella" by its row and "Ceropegia alstonii" kept then re-filed. Dropped for the 260 budget (each held in rounds 82 to 85): A05b, A06, A10, A16, M02, H01. C03 to C05 now skip, said so, when C01 did not run (round 85's walk reported a false "OFFLINE NOT HELD" then).

**Run on the PC in two runs, each within 260:** `node <path>\round86-webkit-walk.mjs`, then `node <path>\round86-webkit-walk.mjs --only C01,C03,C04,C05 --out <another folder>`.

**Tested here in Chromium** (`--engine chromium`, photographs loaded as a grower's would):
- **Run 1, the whole walk, cold** (`P-s/walk86.out`, `walk86/`): 32 of 38 steps ok; C01 skipped for the budget, so C03/C04 reported a false offline failure (fixed since by the guard above); B01, B02, A17, F01 skipped. 286 counted. Verdicts: the race R01 to R04 all "added"; M03 "the line names GBIF's name and Kew's verdict"; M04 "both as round 85 says"; K03 one press each; K02 both "cultivar, species not stated"; **F02 "habitat line NOT WHOLE above the bar: 320x568 echinopsis-thelegona; 320x568 ceropegia-alstonii"** (P2); **T01 "a tap on the few-records mark reaches Figures"** (the mark's middle and its lower right both: P3); CR1 every page dated; AB1 folded on arrival, both folds opened in view, Back to the same place; K04 "Hibiscus acetosella filed on its page; Ceropegia alstonii offered and re-filed"; A09 stored upright (1200 × 1600, 132 kB blobs), dated 2026-10-20, the HEIC refused in words; P01 5 of 5 sheets open, 11 labels at 2.625 × 1.000 in. Two script faults found and fixed: N01 opened Galanthus nivalis (37 requests for its 36 map files; now Echeveria elegans), and G02 read every map file the document had loaded since its first page (now only those after its own navigation).
- **Run 2, the fixed steps** (`--only N01,G02,B01,B02,A17,F01`, `walk86b/`): all 6 ok, 97 counted; G02 lists Hoodia alstonii's own four files.
- **Run 3, the worker and offline alone** (`--only C01,C03,C04,C05`, `walk86c/`): all 4 ok; 170 files cached; "offline held (an unread page says No connection)"; the coastline draws offline; a watering survives a reload; 154 counted (113 of them the worker-install estimate, an upper bound).
- The main run, with the three steps dropped and N01 fixed, comes to about 250 by these counts.

## Not checked, with why

- **A real iPhone and WebKit.** Not on this machine: the real keyboard and its pinned bar, Add to Home Screen, the date and select pickers, momentum scroll, bfcache, Safari's details marker (P8). The walk covers what an engine can.
- **Camera photographs** here only through the walk's A09 in Chromium (a synthetic 12 MP JPEG with EXIF orientation 6, and a HEIC header): stored upright and dated; the HEIC refused in words. A real iPhone's HEIC through Photos is the PC's.
- **The service-worker update from round 84's worker** (C's area).
- **Sync.** By the rules.
- **Medians of the throttled loads.** One load each; the machine was shared by five reviewers.
- **P1's rate.** Box-middle labels outside their shape across the corpus: only by reading `still.ts` and looking at 9 close-ups.

## Needs from the PC

1. **Run the walk.** From the project's folder: `node <path>\round86-webkit-walk.mjs`. Send back the printed lines, `webkit-walk-2026-11-xx\webkit-walk.json` and the PNGs. What matters most: F02 (the first screen at 390 and 320 in Safari), T01 (the overlapping links), M03 and M04 (the verdict lines), K03 (one press for "Echeveria elegans"), K04 (Hibiscus acetosella and the re-file), R01 to R04 and K02 (if any says LOST, `--only A01,R01,R02,R03,R04,K02` three more times), AB1 (Safari's marker on "The rules in full", and the fold by address), G02, C03.
2. **On the iPhone (Safari, not installed):** search "Ceropegia alstonii" and open the hit: is "Habitat in short" on the first screen? (P2). On Echinopsis thelegona, tap the right half of "from 3 records" with a thumb: where does it go? (P3; on an SE or with Display Zoom.)
3. **On the iPhone, installed to the Home Screen:** in landscape on a species page, are the top bar's "‹" and "+" clear of the notch?
