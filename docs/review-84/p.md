# Review P (the phone grower; mobile against PC), before round 84

Reviewer P, 2026-10-29, 21:25 to 23:10 UTC. Live site https://cultifolio.com: the Worker from `ba78fb9`, corpus `e8885155673882ba`.

**How I ran it**
- Playwright 1.63 with Chromium 141 (`/opt/pw-browsers/chromium`), using its device descriptors with `isMobile`, `hasTouch` and real taps.
- iOS safe areas were emulated through CDP: 34 px at the bottom in portrait; 47/47/21 px in landscape (59 on the 15 Pro Max).
- Scratch is `/tmp/claude-0/rev84r/P-s/`. The harness is `lib.mjs`; the scripts are `NN-*.mjs`. Results are in `r-*.json`, logs in `log-*.json` and the `run-*.out` files.
- There are 201 screenshots in `shots/`. Every screenshot cited below I looked at.

## Verdict

**Works with faults. Ready to show the public on phones once the climate chart is fixed at 360 px.**

On every phone size a grower can browse, search and come Back to the same place; read every kind of species page, the merged page and its old address included; add plants by link, by typing and offline; photograph them from the camera; make spaces, water, Undo, propagate and print labels at true size; back up, wipe and restore; enter and leave the example; and install the app and use the collection and the pages already read with no signal.

Round 81's ten phone faults (P1 to P10) are fixed on the live site. One is fixed only in part: P7, the notch in landscape on three page types.

The Add press during the name check was never lost in Chromium. I pressed it 11 times right after typing or leaving the field, plus 2 control presses after the check. Every press reached the form, and wherever it was timed, "Checking the name…" showed within 22 to 110 ms.

What a phone grower trips on now:
- **P1 (major).** On a 360 px Android and on the 320 px floor, the climate chart is drawn for a 720 px desktop and shrunk. Its labels are 4.3 to 4.9 px tall, which no one can read. 360 px is the commonest Android width.
- **P2 and P3 (minor).** My plants with 400 plants reopens round 60's layout shift (CLS 0.28 to 0.30). Landscape top bars still run into the notch on species, plant and Compare pages.
- **The rest (minor):** polish.

**Scores (phone).**

| Area | Score | Reason |
|---|---|---|
| Mobile | 8 | Every flow completes at 11 sizes. One chart breaks at the commonest Android width. |
| UX on a phone | 8 | Back, the pill, offline and the compare picker are all mended. Long "not checked" reasons and a sentence written for the author fill the first screen. |
| Performance on a throttled phone | 6.5 | Cold front page: FCP 2.1 s, TBT 1.26 s. A rich species page's LCP is 5.8 s, which is the photograph host. Warm pages are fast. |
| Accessibility under a finger | 8.5 | 44 px targets everywhere except inline links. The 200% text check found only P1's tiny chart labels. |
| Appearance on a phone | 7 | Calm and consistent, but P1's chart, the persistent tray pill, and gaps in sentences around 44 px inline buttons. |

**What I covered.**
- **11 sizes:** iPhone SE 1st gen (320×568, the floor), SE 2/3 (375×667), 13 (390×664) and landscape (750×342), 15 Pro Max (430×739) and landscape (814×380), Pixel 7 (412×839), Galaxy S8 (360×740) and landscape, iPad 7th gen both ways. Each audited on 6 pages plus the menu (`14-devices.mjs`, `r-dev-*.json`); the 360 Android also in dark mode and at 200% text (`22-dark200.mjs`).
- **Journeys:** all 13 at iPhone 13.
- **Flows:** Back in 7 flows; 8 keyboard cases (page 300 px shorter); offline (16 addresses, two adds, a watering, coming back); 6 throttled page loads; camera files (12 MP orientation 6, 48 MP, HEIC); the chart's drawing width at 5 widths; a CPU profile of the front page.
- **The WebKit walk:** 24 steps, tested in three Chromium runs (two full, one of five steps).
- **Requests:**
  - **cultifolio.com:** about 1,528 by my counters. This is an upper bound: the first run's counter took memory-cache hits as requests. It includes 366 for the walk's three test runs, the first of which ran with the HTTP cache off because of a route; that is fixed in the walk. This is at the brief's 1,500.
  - **Third-party hosts:** 264 (upper bound). 243 of them came on journey 1's front page with photographs on. After that, photographs were refused.
  - No sync, no POST.

## Issues

Ranked as the review prompt ranks them: what a first-time grower on a phone trips on, then data loss, then mobile against desktop, then the rest. I found no wrong fact on a species page.

### P1. Major: at 360 px and 320 px the climate chart is a shrunken desktop chart, with labels about 4.5 px tall

**What I did.** I opened `/species/echeveria-elegans` at five widths and measured the climograph (`23-chartw.mjs`, `r-chartw.json`). The page came from the worker's copy, so no request was made.

**What I saw:**

| Width | Figure width | Drawn at | Scale | Label height |
|---|---|---|---|---|
| 320 | 288 | 720 | 0.39 | 4.3 px |
| 360 | 328 | 720 | 0.44 | 4.9 px |
| 375 | 343 | 323 | 1.04 | 11.4 px |
| 390 | 358 | 338 | 1.04 | 11.4 px |
| 412 | 380 | 360 | 1.03 | 11.4 px |

Screenshots: `shots/chartw-s8.png` (360) and `shots/chartw-se1.png` (320) against `shots/chartw-i13.png`; in dark, `shots/dk-s8-_species_echeveria_elegans-climate.png`.

At 360 px, the ticks, "cold quarter", "frost", the 99th-percentile day and the lowest night are unreadable. Those are the figures a grower comes for. The chart is the habitat's year on every page with a climate, so this affects most Android phones (360 px is their commonest width) and the iPhone SE 1st generation.

**Where:** `src/lib/ui/Climograph.svelte:30`:
`climograph(climate, shown >= 340 ? Math.min(shown - 20, 960) : 720, …)`.
- Below 340 px of figure width, the chart falls back to 720.
- On a 360 px phone the figure is 328 px wide.

**Smallest fix:** draw at the shown width down to about 260 px (`shown >= 260`), and keep 720 only before the width is known (`shown === 0`). Then check that the extremes' labels still fit at 288 px.

### P2. Minor (reopens a fixed fault): My plants with 400 plants shifts its layout on every load (CLS 0.28 to 0.30)

**What I did.**
- I restored W's 400-plant backup (`img/bk-400.zip`).
- I loaded `/plants` on a throttled iPhone 13 (CPU ×4, slow 4G) three times (`20-slow.mjs`, `r-slow-slowA.json`).
- I recorded the layout shifts with their sources (`20d-cls.mjs`).

**What I saw:**
- CLS was 0.298, 0.298 and 0.285. That is "poor" by Google's measure.
- The source was `FOOTER.credits` ("Sources: GBIF Backbone, WCVP…"). It was drawn in view at y 458 to 664, then pushed off by the list, 2.3 s after the start. There was also a 0.014 shift at 1.3 to 1.6 s.
- The frames (`shots/cls-plants-strip.png`) show "Opening your collection…", then the list.

**Where:** `src/routes/+layout.svelte:468`, `{#if !privateRoute || collection.ready}`. This is round 60's fix for the same shift. With 400 plants, `collection.ready` is true before the 200 rows are drawn, so the footer shows mid-screen for a moment.

**Smallest fix:** hold the footer until the page's list has rendered (a flag that `/plants` and `/today` set after their first rows), or give the list a `min-height` of one screen while it fills.

### P3. Minor (round 81's P7, partly fixed): in landscape, the top bar's "Add a plant" sits in the notch side on species, plant and Compare pages

**What I saw:**
- In the iPhone 13 in landscape (750 px wide, 47 px insets emulated), the top bar is padded by the inset (`padL 47px`).
- On `/`, `/plants` and `/settings`, its last button ends at 703, which is right.
- On `/species/echeveria-elegans`, `/plants/2026-0001` and `/compare?s=…` it ends at 730: 27 px into the right inset (`r-dev-i13L.json`, field `unsafe`; `shots/dev-i13L-_species_echeveria_elegans.png`).
- These pages add the ‹ (Back) button. The five-section segmented bar then no longer fits, and the bar's contents overflow past its padding.
- At 814 px (15 Pro Max) everything fits.

**Where:** `src/routes/+layout.svelte:528` (the padding is right) and `:543` (`#topbar .topseg > a { padding: 5px 12px }`).

**Smallest fix:** let `.topseg` shrink (`min-width: 0; overflow: hidden`) or tighten its links' padding under 800 px. The safe-area insets are emulated, so confirm on a real iPhone.

### P4. Minor: the compare tray's pill stays on every page, over the grower's own content

**What I saw:**
- After one Compare, the pill "Compare 1, pick one more ›" stands at the foot of every page until it is cleared: the plant page, a space, Today.
- On the plant page it covers the "Since watered" card's line (`shots/J9-i13-form-Haworthia.png`).
- On a space it sits beside the toast (`shots/J7-i13-d-toast.png`).
- Round 82 made it step aside for pinned bars (checked, below), but not for content.

**Where:** `src/lib/ui/CompareBar.svelte:25` and `:43`.

**Smallest fix:** show the pill on reference pages only (species, catalogue, Compare), or let the page's foot padding include it on collection pages, as the footer already does (`+layout.svelte:598`).

### P5. Minor: a cold front page is busy for over a second on a throttled phone

**What I measured** (iPhone 13 viewport, CPU ×4, 150 ms latency, 1.6 Mbps down and 750 kbps up, worker blocked, one load each; `20-slow.mjs`, `r-slow-slowA.json`, `r-slow-slowB.json`):

| Page | Load | FCP | LCP (element) | CLS | TBT (longest task) | HTML decoded / sent |
|---|---|---|---|---|---|---|
| `/` cold | 3.0 s | 2,132 ms | 2,132 ms (text) | 0 | 1,264 ms (924) | 103 / 16 kB |
| `/` warm | 0.5 s | 364 ms | 364 ms | 0 | 170 ms (223) | same |
| Sempervivum tectorum, cold, photographs on | 5.9 s | 2,060 ms | 5,832 ms (iNaturalist image) | 0.004 | 817 ms (446) | 175 / 39 kB |
| Aloe framesii ("not checked"), second page | 2.8 s | 760 ms | 760 ms (p) | 0.003 | 81 ms | 97 / 19 kB |
| Echeveria elegans, third page | 2.3 s | 1,272 ms | 1,888 ms (image) | 0.003 | 200 ms | 131 / 28 kB |
| `/plants`, 400 plants (200 rows) | 0.3 to 0.6 s | 624 to 696 ms | 816 to 1,204 ms | **0.298** (P2) | 190 to 449 ms | 16 / 5 kB |

**Where the time goes.** A CPU profile of the front page at ×4 (`24-prof.mjs`, `r-prof_.json`) shows "(program)" at 935 ms against 238 ms in the app's main chunk. So on a first visit the cost is mostly parsing and compiling the 45 script chunks, not the page's own code.

**On round 83's lighter page:**
- Sempervivum's HTML is 175 kB. Round 83 predicted 162 kB; the fill added photographs.
- Its phone TBT matches round 83's 996 → 817 ms.
- I found no regression on the phone.

**What would help most:** a smaller first-visit script set. For example, the front page's own chunk and the shared runtime only, with the species, compare and collection code loaded on demand. The species page's LCP is the third-party photograph and moves with its host.

### P6. Minor: Back with the Record form open closes it and silently drops what was typed

**What I did.** On a plant page I tapped "Record…", typed "top dressed" into the note, and pressed the browser's Back (`16-flows.mjs`, `r-flows-i13.json`).

**What I saw.** The form closed and the page stayed: round 81's P8 is fixed. But the note was gone, with no question asked. On Android, Back is the gesture a grower uses to close the keyboard or the sheet.

**Smallest fix:** keep the form's draft (in memory is enough) and reopen it with the text on the next "Record…". Or, when the note is not empty, let Back close only the keyboard and the sheet's focus.

### P7. Minor: on a phone, the first screen of some species pages is taken by text written for the author or the reviewer

**What I saw:**
- **Aloe framesii** (journey 4, `shots/J4-i13-a-top.png`, `-b-scroll1.png`): the "GBIF's records not checked" box runs to about 1.3 screens (some 120 words on Aloe microstigma's lumping) before the photograph strip and the section tabs.
- **Echinopsis thelegona** (`shots/J13-i13-a-top.png`): the name card's second paragraph is "Wikidata's item Q1280651 gives "Cactus", read 2026-10-22 (CC0), which the search finds and this page does not show as the species' English name". This is W12. On a phone it pushes "Add one to my plants" to the bottom of the first screen.

**Smallest fix:**
- The first sentence of the reason ("GBIF's records not checked: GBIF files this name under Aloe microstigma"), with the rest behind "why".
- W12's move of the Wikidata sentence to the record of sources.

### P8. Minor: the 44 px finger rule opens gaps in running text

**What I saw.** "Your notes: none yet. Write what you know · yours alone, / on this device." breaks with a 20 px gap (`shots/J4-i13-b-scroll2.png`). The inline `button.linkish` takes `min-height: 44px` under a coarse pointer, which makes its line 44 px tall. The same happens on every species page and on the iPad.

**Where:** `src/lib/ui/theme.css:524` (`.linkish` in the `pointer: coarse` block).

**Smallest fix:** give inline `.linkish` the invisible `::after` margin that `a.accno` and the hero credit already use (`theme.css:526-528`) instead of a min-height.

### P9. Minor: "from few records" is explained only by a hover title

**What I saw.**
- On Echinopsis thelegona, the mark's counts ("3 records in 3 grid cells") are in a `title` attribute (`Glance.svelte:83`). A tap does nothing (`tooltipShown: false`).
- The line under the figures does say it in words ("From few records: 3 records in 3 grid cells. The records."). So this is polish: the mark could be a link to that line or to the climate notice.
- "Extremes not used (the weather cell's ground is too far off)" is jargon on the card. W says the same.

## Confirmed working

**Round 81's phone issues, all re-run on the live site:**

| # | Status | Evidence |
|---|---|---|
| P1 | **Fixed** | Search Back kept "90 of 256" and put the 45th hit back at 285 px (`run-J2.out`). A grower's "agave", then "Search the whole catalogue", then the 4th hit and Back stays on `/?q=agave` with the hit at 337 px both times (`r-flows-i13.json`). |
| P2 | **Fixed** | The pill is hidden while the add form's bar is pinned (journey 6; the walk's A16 "Add uncovered"). The Water-all toast stands above the pill (448 to 510 px, `shots/J7-i13-d-toast.png`). |
| P3 | **Fixed** | Gasteria baylissiana, read by a catalogue tile, opens offline by its address and by a tap (`r-offline-i13.json`). |
| P4 / W1 | **Fixed** | `/?q=agave` loads and reloads with "30 of 289 matches" and no page error. Offline it says "The catalogue could not be reached. Try again". |
| P5 / W2 | **Fixed** | The pill, the compare picker, then Echeveria agavoides gives two columns (`shots/J5-i13-c-table.png`). |
| P6 | **Fixed** | The landscape menu is 263 px tall in a 342 px window and scrolls itself; Settings can be reached; the iPad's menu fits both ways. |
| P7 | **Partly fixed** | See P3 above. |
| P8 | **Fixed** | Back closes the viewer, the menu and the Record form, and stays on the page (P6 above is the typed note). |
| P9 | **Fixed** | "IMG_0001.HEIC is a HEIC photograph, which this browser cannot read. On an iPhone, choose it from Photos…" |
| P10 | **Fixed** | Every bar, button and field is at least 44 px at all 11 sizes (search 44 px on the iPad both ways). Left: inline links in sentences, and the credit chip's invisible margin, which counts. |

**Round 82 and 83, at phone size:**
- **Merged pages.** "Echeveria peacockii" lists Echeveria desmetiana first, "…is merged into this page", with Dudleya pulverulenta second. `/species/echeveria-peacockii` answers 302 to `…desmetiana?was=…`, and the notice heads the page above the photograph (`shots/J3-i13-peacockii-old-address.png`).
- **"Not checked" once.** Aloe framesii and Acharagma galeanense: "not checked" 7 times, "not asked" 6 times, and every "none" qualified ("Not a statement that none exist").
- **The few-records mark and the set-aside extremes** (journey 13).
- **The coastline file offline:** `/maps/land50.svg` and `land110.svg` are cached at install, and the close-up map draws offline (`<use>` box 360×174, `shots/offmap-echeveria-elegans.png`).
- **Dark mode on the 360 Android:** correct on 6 pages (apart from P1).
- **Text at 200%:** no sideways scroll on 6 pages.

**Install:** no manifest or installability errors; 152 files cached at install, `/maps/*` among them; `apple-mobile-web-app-capable` "yes"; pinch zoom allowed (no `maximum-scale`).

**Offline** (network cut behind the worker): `/`, a genus row, a species page read in full and one read by a link, `/plants`, a plant, `/places`, `/propagation`, `/labels`, `/backup` and `/settings` open; unread species, Compare and `/about/how` say "No connection". "Haworthia cooperi" was added offline with one press; an unknown name took two, with both services' silences said. A watering survived a reload; with the signal back, an unread page opens.

**Camera:** a 12 MP orientation-6 JPEG stored upright at 1200×1600 (Blob 216 kB, thumbnail 15 kB), shown 358×260 in its 358×260 box; a 48 MP JPEG stored at 1600×1200; the viewer swipes "1 of 2" to "2 of 2".

**Safe areas and keyboard:** in portrait nothing pinned sits in the home-indicator margin; the tab bar is padded 34 px. With the page 300 px shorter the focused field was in view and uncovered in 8 of 8 cases; Add or Start was below the fold in 5 of 8 (under 480 px tall the pinned bar joins the flow, deliberately).

**The race in Chromium:**
- Journey 9 had 2 typed adds, pressed 54 and 63 ms after the last key.
- The two full walk tests made 6 presses at once (filled and left; typed; typed fast) and 2 control presses.
- Offline there were 3 more: 2 in `18-offline.mjs` and 1 in the walk's C04.
- Not one press was lost. Under the finger was "the Add button", enabled, with the field's full value, and the list closed.

## Mobile against PC: the thirteen journeys

Desktop is W's, at 1280 (`review-w.md`). Phone is mine, at iPhone 13.

| # | Journey | Desktop | Phone | What differs | Right? |
|---|---|---|---|---|---|
| 1 | Front, by genus, H, Haworthia, a species, Back | Works; tile back within 1 px | Works: tile at 269 px before and after; the app's ‹ too; ready 1.65 s cold | none | yes |
| 2 | "echeveria", Show more, open, Back | Works; 90 kept | Works: 30 then 90 of 256; Back keeps 90 and the 45th hit at 285 px | none now (round 81's P1 is fixed) | yes |
| 3 | Snake plant, Sansevieria trifasciata, Echeveria peacockii, its old address | Works; the older name is not said (W4) | Same: Dracaena trifasciata first both times, no "older name"; peacockii goes to desmetiana with its line; 302 and notice | the merged notice heads the phone page above the photograph | yes |
| 4 | Aloe framesii, "not checked" | Works | Works; the reason box fills 1.3 screens (P7) | length matters only on a phone | gap (P7) |
| 5 | Compare two | Works | Works; the phone's pill leads into the picker | the pill exists only under 700 px | yes |
| 6 | Add from a species page | Works | Works: 2026-0001, "Seed swap"; the pill steps aside | none | yes |
| 7 | Space, Water all, Undo, water | Works | Works; the toast above the pill; Undo 56×44 | the pill stays on a space page (P4) | gap (P4) |
| 8 | Leaf cuttings ×6, one struck | Works | Works: S2026-001, 17%, linked | Start batch below the fold with the keyboard up | yes (deliberate) |
| 9 | Labels for three, print | Works | Works: 3 labels 2.625×1.000 in printed, 3 QR codes, bars hidden; both typed adds took one press | the screen preview scrolls in its box | yes |
| 10 | Back up, clear, restore | Works; "never" until reload (W8) | Works: 3.3 kB zip; 115 changes before and after | none | yes |
| 11 | Units, reference photographs | Works | Works: 31.5 °F; hero 358×260 | none | yes |
| 12 | Example, leave | Works | Works: 12 plants; Leave goes to `/`, then empty | the example's bar takes 129 px of a 664 px screen and says "kept nowhere" twice | acceptable |
| 13 | Few records, extremes set aside | Works | Works at 390: 46.4 °F "not a floor", the mark, the line, the notice. At 360 the chart is unreadable (P1). The mark's counts are hover only (P9) | chart scale; hover | gap (P1, P9) |

Differences that are deliberate and right:
- the tab bar and the pinned action bars under 700 px;
- the species field not focused on a phone;
- the pill;
- the menu as a sheet;
- the pinned bar joining the flow under 480 px tall.

## The WebKit walk for the owner's PC

**File:** `/tmp/claude-0/rev84r/P-s/round84-webkit-walk.mjs`. It is plain ESM, uses the project's own `@playwright/test`, and has no local proxy.

**What it does:**
- It goes straight out, or through `HTTPS_PROXY` when one is set.
- "No signal" is `context.setOffline(true)`. Step C03 checks that the switch held, by opening an unread species page, which must say "No connection".
- It is read-only. Its profile is deleted at the end unless `--keep`.
- At most `--budget 200` requests to the site. Each step checks the budget first and is skipped, with the reason, if it does not fit.
- At least 0.5 s between steps.
- Output is `webkit-walk-<date>\` beside the file: one PNG a step, `webkit-walk.json`, and one printed line a step.

**Run, from the project's folder:**
- `node <path>\round84-webkit-walk.mjs`: WebKit.
- `--engine chromium`: the same walk in Chromium.
- Other options: `--only A01,R01,…`, `--reuse`, `--keep`, `--no-photos`. `--no-photos` routes requests, and routing turns the HTTP cache off, so it costs more.

**The 24 steps:** A01 cold front page; A02 the Haworthia row and Back; A04 search, Show more, the 45th hit, Back; A05 a common, an older and the merged name; A05b a reloaded search; A06 the example; **R01 to R04, the race**: Add pressed at once after filling and leaving the field (the suite's path, Copiapoa cinerea), after typing (Welwitschia mirabilis), after fast typing (Haworthia cooperi), and a control after the check (Lithops lesliei). Each records what was under the finger, the field's value, whether the button was disabled and the list open, the states every 50 ms for 4 s, and a verdict (added, asked, or **LOST**, with what a second press did). Then M01 the merged address's 302 and line; M02 Echinopsis thelegona's cold card; A08 to A10 add from a species page, two 12 MP orientation-6 photographs as Blobs, the viewer's Back; A16 the compare pill and Add uncovered; A13 export, wipe, restore; C01 the worker and the coastline; C03 offline pages, the link-read page and the coastline offline; C04 watering and an add offline; C05 the signal back; B01 and B02 the iPad both ways; A17 landscape menu and top bar.

**Tested here in Chromium:**
- **First run (cold):** steps up to M01 passed, with all four races "added". It also showed a fault in the script: its route for photograph hosts turned off the browser cache, so a reload cost 57 requests, and the rest was skipped by the budget. The route is gone.
- **Second run** (warm cache, `--reuse`, a local proxy refusing photograph hosts): 22 of 24 steps passed, all four races "added", C03 "offline held", and the link-read page and the coastline offline. A02 and A04 failed: with plants on the device the front page opens on "Your species".
- Those steps now run before any plant is added, and the search falls through to "Search the whole catalogue". A third run with `--only A01,A02,A04,A05,A05b` passed all five ("held", "kept", "the search came back").

**Cost on a cold PC:** about 200 counted requests, including about 60 to 95 estimated for the worker's install (an upper bound). The iPad and landscape steps may be skipped by the budget, and each skip says so. Pass `--budget 260` for every step.

## Not checked, with why

- **Journeys at 320 and 360 px:** my request budget ran out. Those sizes had the six-page audits, the menu, the chart measure, and dark mode and 200% text from the worker's copies.
- **Real devices:** iOS safe areas and notch (P3), the real keyboard, Add to Home Screen and standalone launch, momentum scrolling, the date and select pickers.
- **WebKit:** not on this machine. The walk is for the PC.
- **Photographs on throttled pages:** only Sempervivum tectorum and Echeveria elegans. Commons answered 429 to this machine (W).
- **Medians:** each slow-phone figure is one load, because of the budget.
- **Sync:** by the rules.
- **A cause I could not settle:** on journey 13, a tap on the "from few records" mark was followed by a scroll from 639 to 176 px. I could not repeat it within the budget.

## Needs from the PC

1. **The walk.** From the project's folder, run `node <path>\round84-webkit-walk.mjs`. Send back:
   - the printed lines;
   - `webkit-walk-2026-10-xx\webkit-walk.json`;
   - its PNGs.

   The steps that matter most:
   - **R01 to R04 (the race).** If any says LOST, run `node <path>\round84-webkit-walk.mjs --only A01,R01,R02,R03,R04` three more times and send each JSON. The `at` field tells whether the press met a disabled button, an empty field or something over Add.
   - A02, A04, A05b, A09, C03, C04, A13, A16, A17.
2. **On an iPhone:**
   - in landscape on a species page, is "+" under the notch or the rounded corner (P3)?
   - with one species in the compare tray, does the pill cover anything on a plant page (P4)?
3. **On any 360 px Android, or Chrome's device mode at 360:** Echeveria elegans's climate chart, to confirm P1 on a real screen.
