# Review P (the phone grower), before round 81

Reviewer P, 2026-10-23. Live site https://cultifolio.com, Worker `00830b85`, corpus `a27e34d376199544`. Everything ran in Playwright's Chromium 141 (`/opt/pw-browsers/chromium`) with Playwright 1.63's device descriptors: `isMobile`, `hasTouch` and real touch taps. iOS safe-area insets were emulated through CDP (`Emulation.setSafeAreaInsetsOverride`): 34 px at the bottom in portrait; 47 px left and right plus 21 px at the bottom in landscape (59 px on the 15 Pro Max).

Scripts, logs and results are in `/tmp/claude-0/rev81r/P-s/`:
- scripts: `NN-*.mjs`, with `lib.mjs`;
- results: `r-*.json`;
- logs: `log-*.json`;
- screenshots: `P-s/shots/*.png` (192 of them; each one cited below I looked at);
- the WebKit walk's test run: `P-s/walk-test/`.

## Verdict

**Works with faults.** On every phone size I tried, a grower can browse, search and read species pages; add plants, including from the camera; make a space, water it and undo; start a batch; print labels at true size; back up, wipe and restore with nothing lost; switch units; enter and leave the example; install the app and use the collection with no signal.

Round 80's ten phone fixes all hold on the live site.

Five faults matter on a phone:
1. Back from a species page loses the search the grower came from.
2. The compare tray's pill sits on top of the add form's Add button.
3. A species page read by tapping a link is not there offline, though the offline page says it is.
4. A reloaded or shared search says "Nothing in the reference matches". This is W1, seen here at phone size, with a collection and offline. Pull-to-refresh is a phone's reload.
5. The compare page's picker drops the tray's species. This is W2. On the phone, the pill sends the grower straight into it.

The landscape faults (P6, P7) and the rest (P8 to P10) are minor.

## What I covered

**Sizes (11):** iPhone SE 1st generation (320 x 568, the floor); iPhone SE 2/3 (375 x 667); iPhone 13 (390 x 664) and its landscape (750 x 342); iPhone 15 Pro Max (430 x 739) and its landscape (814 x 380); Pixel 7 (412 x 839); Galaxy S8 (360 x 740) and its landscape (740 x 360); iPad 7th generation, portrait (810 x 1080) and landscape (1080 x 810). Also dark mode on the 360 Android, and an iPhone 13 300 px shorter for the keyboard.

**Journeys:** all twelve at iPhone 13. The WebKit walk's test also ran 23 steps in Chromium, which repeats journeys 1 to 3, 5 to 8, 10, 11 and 12.

**Pages:** six pages at each of the 11 sizes, audited for tap targets, sideways overflow and the safe areas. The pages were the front page, a species page, the plant page, `/plants`, `/settings` and Compare, plus the menu sheet at each size.

**Flows:**
- Back in 9 flows;
- 8 keyboard cases;
- offline: 17 addresses with the network cut behind the service worker, a record made offline, and coming back;
- a cold load over a 3G-like link;
- three camera files: a 12 MP JPEG with EXIF orientation 6, a 48 MP JPEG and a HEIC.

**Requests:**
- cultifolio.com: 1,431 counted. This is an upper bound. It counts every fetch the service worker made, most of which the disk cache answered, and the walk test's estimate for the worker's install. Page loads fetch their own assets at once (about 54 on a cold front page). My own steps were at least 0.5 s apart.
- Third-party hosts: 0. Every run refused them at the proxy, which is why photographs show "did not load" in the screenshots.

## Issues

### P1. Major: Back from a species page loses the search the grower came from

**What I did**, in three runs at iPhone 13, typing on the phone keyboard:
- **A visitor** typed `echeveria`, pressed "Show 60 more" (90 of 259 shown), scrolled to Echeveria elegans at scrollY 3,613, opened it, then pressed the browser's Back.
- **A visitor** typed `echeveria`, opened the 20th hit (`/species/echeveria-barbosae`, at scrollY 1,044 and 285 px from the top), then pressed Back.
- **A grower with plants on the device** typed `agave`, tapped "Search the whole catalogue" (30 of 289), opened the 4th hit (`/species/agave-acicularis`), then pressed Back.

**What I saw:**
- **First run:** the query was kept, but the list was back to "30 of 259 matches" at scrollY 0, and Echeveria elegans was no longer listed (`r-J-i13-2.json`; `shots/J2-i13-d-back.png`).
- **Second run:** the list was there at scrollY 0, and the hit the grower left sat at 1,329 px instead of 285 px (`r-back3-visitor-i13.json`; `shots/back-i13-search20-visitor-after.png`).
- **Third run:** Back went to `/`, not `/?q=agave`. It showed the own-plants view ("None of your plants or species matches. Search the whole catalogue for “agave”"), and the catalogue list was gone (`r-mineback.json`; `shots/mineback-2-after-back.png`). With a genus the grower does grow, the screen showed one own-plant row and the footer, scrolled part way (`shots/back-i13-search hit 20 (no Show more), Back-ERR.png`).
- The walk test's step A04 repeats the first run (`walk-test/04-A04.png`).

On a phone, "search, open, Back, open the next" is the common way through a genus. Here each Back costs a scroll, and "Show more" has to be pressed again; for a grower, the catalogue search has to be run again.

**What should happen:** Back returns to the same list, as long as it was, at the same place. Round 80's fix does this for the catalogue rows.

**Where:** `src/routes/+page.svelte:291`. `placeNow()` returns `null` when `flat`, so the snapshot keeps nothing for a search. `showMore` keeps no state, and the "whole catalogue" choice is not in the address. This is my reading of the code.

The back-forward cache plays no part. The species page is reached by the app's own router, so Back is a same-document history step: navigation type `navigate`, `persisted` false, with the cache turned on (`r-bfcache.json`).

W rated journey 2 as working on the desktop. W checked that the query is kept, which it is.

### P2. Major: the compare tray's pill covers the add form's Add button

**What I did:**
- Pressed Compare on `/species/echeveria-elegans`. One species in the tray is the ordinary state after anyone tries Compare.
- Then "Add one to my plants".

**What I saw:**
- The phone's pill, "Compare 1, pick one more ›", stands at 141 to 378 px across and 520 to 564 px down.
- That is on top of the form's pinned bar (510 to 574 px). It covers "Save and add another" and all but the last letters of the green Add button (`shots/J6-i13-a-form.png`, `shots/J6-i13-b-form-filled.png`).
- The bar is pinned, so scrolling never uncovers it.
- The same pill sits over the propagation form's fields while typing (`shots/J8-i13-a-keyboard.png`).
- After Water all, the toast "Watered 1 plant. Undo" lands on top of the pill (`shots/J7-i13-d-toast.png`: toast 502 to 564, pill 520 to 564).
- The tray is kept on the device, so the pill stays until the grower clears it.

**What should happen:** the pill stands above a pinned action bar, or steps aside while one is shown, as the toast already does.

**Where:**
- `src/lib/ui/CompareBar.svelte:43` and `:52` place the pill at `bottom: 66px + inset` and know nothing of `body.stickyacts`.
- `src/lib/ui/ToastBar.svelte:96` lifts the toast for the same bar.
- `src/routes/plants/new/+page.svelte:362` and `propagation/new/+page.svelte:336` give the bars `z-index: 5`, against the pill's 58.

### P3. Major: offline, a species page read by tapping a link is not there, while the offline page says it is

**What I did:** this was the WebKit walk's test, in Chromium at iPhone 13, with the service worker installed:
- opened `/species/echeveria-elegans` three times by in-app links (the search hit, the "Add" path, and C02);
- cut the network behind the worker (a local proxy that drops every tunnel);
- opened the same address.

**What I saw:**
- The app's "No connection" page. It reads: "A species page is kept once you have opened it, so the ones you have opened are here" (`walk-test/14-C03-_species_echeveria_elegans.png`; `walk-test/webkit-walk.json`, step C03).
- In my own offline run, the species page loaded in full (`page.goto`) before the cut did open offline (`r-offline-i13.json`).
- So only pages loaded as documents are kept for opening by address.

**Where:**
- `src/service-worker.ts:230-234` keeps a navigation's HTML under its path only when the request was a navigation.
- An in-app move fetches `__data.json`, which is kept under its own address.
- The offline page's sentence is `src/routes/offline/+page.svelte`. `/about/how` ("a species page opened online is readable offline after") says the same.

**Not proven, for lack of requests:** whether tapping into the page again offline, from a page already open, works from that `__data.json`. My run for that stopped at its budget (`23-offline-read.mjs`).

What fails is a reload, a Back after the installed app was closed, or Safari reopening its tabs: all of them open by address. For the owner's greenhouse with no signal, the sentence promises more than the worker keeps.

### P4. Major (W1, at phone size): a reloaded or shared search says nothing in the reference matches

**What I saw:**
- At iPhone 13, with plants on the device, loading `/?q=agave` threw "Cannot read properties of undefined (reading '$set')" (`log-minesearch.json`).
- The page then said "Nothing in the reference matches “agave”. It holds a fixed list of 48,361 species…" (`r-minesearch.json`; `shots/mine-address-agave.png`). The reference has 289 Agave matches (`r-mineback.json`).
- Offline, `/?q=aloe` gave the same sentence and the same page error (`shots/off-i13-_q_aloe.png`, `log-offline-i13.json`). Typing in the box offline correctly says "The catalogue could not be reached. Try again".
- So "not checked" is said as "none" (rule 2).

**Why it matters on a phone:** the address of a search result is `/?q=…`. Pull-to-refresh reloads it, and Safari reloads tabs it put away. W's report has the cause (`src/routes/+page.svelte:38`).

### P5. Major (W2, with a phone-only path into it): Compare with one species in the tray

**What I did:** tapped the pill "Compare 1, pick one more ›" on the phone. It goes to `/compare` with no columns. The page shows "In the tray: Echeveria elegans. One more to compare." Then I picked Echeveria agavoides in the page's own box.

**What I saw:** `/compare?s=echeveria-agavoides`, one column, and the tray's species dropped (`shots/J5-i13-b-picker.png`, `shots/J5-i13-c-table.png`; walk test step A16: "ONE COLUMN").

**What differs from the desktop:** the desktop's tray with one species has no link, only "pick one more" (`CompareBar.svelte:20`). The phone's pill links to `/compare` (`:26`), so on a phone this fault is the main way in.

**Where:** `withSlug`, `src/routes/compare/+page.svelte:147`, as W found.

### P6. Minor: in landscape on a phone, the menu runs off the screen and its lower half cannot be reached

**What I saw:**
- In landscape, wider than 700 px, the menu is the desktop's drop-down: 656 px tall, starting at 48 px.
- The screens are 342 px (iPhone 13), 380 px (15 Pro Max) and 360 px (Galaxy S8) tall (`r-dev-i13L.json`, `r-dev-pmL.json`, `r-dev-s8L.json`; `shots/dev-i13L-menu.png`).
- On the Galaxy S8 in landscape, Compare species is cut off and seven links are below the screen: Labels, Settings, Backup, Sync, How it is made, Formats and Source.
- A finger drag on the menu scrolls the page under it (scrollY 333; the menu's scrollTop stays 0).
- A tap on Settings fails (`r-menuL-s8L.json`, `shots/menuL-s8L-after-drag.png`).
- The tab bar is hidden under 480 px tall, and the top bar shows only the five sections. So in landscape these pages can be reached only by rotating the phone.

**Where:** `src/routes/+layout.svelte:533` (the menu, fixed, with no `max-height` or overflow). The phone sheet's rule (`:543`) applies only up to 700 px wide.

### P7. Minor: in landscape on a notched iPhone, the top bar's two end buttons sit under the notch and the rounded corner

**What I saw:**
- With the insets emulated, the top bar spans the full width, but its padding is 16 px.
- The Menu button starts at x = 16, inside the 47 px margin on the iPhone 13 and the 59 px margin on the 15 Pro Max.
- "Add a plant" ends at 734 of 750 (798 of 814) on the other side (`r-dev-i13L.json`, `r-dev-pmL.json`, field `unsafe`; the same on every page).
- The page content is correctly inset (`body` uses `max(16px, env(safe-area-inset-left))`).

**Where:** `src/routes/+layout.svelte:514`. `#topbar` takes the body's safe padding back with negative margins, but pads itself only 16 px. `padding-inline: max(16px, env(safe-area-inset-left)) …` would follow the body.

The insets are emulated, so this is to confirm on a real iPhone. The WebKit walk cannot, because Playwright's WebKit reports no insets.

### P8. Minor: Back closes nothing that is open on a page

- **Photo viewer:** with the viewer open on a plant page ("1 of 2"; the swipe to "2 of 2" works), the browser's Back left the plant page for the previous page (`/today`). On the walk test it went back to the add form (`r-viewer-i13.json`; `shots/viewer-i13-after-back.png`; walk A10).
- **Menu sheet:** Back with the sheet open also leaves the page.
- **Record form:** Back with the Record form open leaves the page, and anything typed in it is lost (`r-back-i13.json`).

On Android, the back gesture is how a phone closes a full-screen photograph or a sheet. The × buttons work and are 44 px.

**Where:** `src/lib/ui/Lightbox.svelte` adds no history entry. Nor do the menu and the forms.

### P9. Minor: a HEIC photograph is refused with no way forward

**What I did:** chose a 48 MP JPEG and a `.HEIC` together with "Choose photos".

**What I saw:**
- The JPEG was stored at 1600 x 1200 (160 kB, 8.7 s on this loaded machine, with "Storing 1 of 2…" shown meanwhile).
- The HEIC gave "That file is not an image this browser can read.", shown beside "Added" (`r-photos-i13.json`). The message does not say which file failed or what to do.
- An iPhone's own picker converts HEIC with `accept="image/*"`, so this mostly meets Android and desktop growers with photographs from an iPhone.

**Where:** `src/lib/photo/process.ts:64`. A line such as "IMG_0001.HEIC is a HEIC photograph this browser cannot read; on an iPhone choose it from Photos, or export it as JPEG" would give the way forward.

### P10. Minor: a few standalone touch targets under 44 px

Everything in the bars, menus, forms, toasts and verbs measured at least 44 px at every size. Inline links in sentences were not counted. What is left:
- **Species page:** "Follow" (42 x 44), the photograph's credit chip "The photograph's own page" (166 x 23, over the hero), the "2026-0001" chip linking your plant (75 x 25), and "Show all 26" (65 x 17).
- **Compare:** "Chart on its page ›" (113 x 16) and the column names (36 to 38 px tall).
- **Search box:** the catalogue and plants search boxes are 41 px tall wherever the screen is wider than 700 px with a touch screen. That covers the iPad both ways and every phone in landscape (`r-dev-ipad.json`, `r-dev-i13L.json`). `--tap` is 44 there, but `.searchbar` does not use it.

## Confirmed working

**Round 80's phone fixes, all holding on the live site:**

| Fix | What I saw |
|---|---|
| **P1** Back to the catalogue row | Within 0 to 2 px in four runs: via the letter H, and from a deep link `/?by=genus&open=haworthia` with tiles 2 and 6. 60 rows; no runaway (`r-J-i13-1_2_3.json`, `r-rowback-nobf.json`, walk A02). |
| **P2** card below the photo strip | Strip 319 to 479 px, card from 489 px. |
| **P4** hero fills its box | 358 x 260 in a 358 x 260 box (`r-photos-i13.json`; `shots/ph-i13-2-plant-top.png`). |
| **P3** search count | "30 of 259 matches", then "Show 60 more" to 90. "Lithops" 30 of 43. |
| **P5** offline pages | `/compare`, `/compare?s=…`, `/privacy`, `/frost`, `/about/how` and an unread species page open the app's "No connection" page (`r-offline-i13.json`). |
| **P6** month table | The first column stays put while the table scrolls 300 px (`r-wx.json`). |
| **P7** section tabs | No mask; an `::after` gradient in the bar's colour, light and dark. |
| **P8** the app's Back | After a browser Forward, it goes to `/?by=genus&open=haworthia`. |
| **P9** layout and wording | "Pakistan · introduced" spaced; no font-preload warnings on `/plants` and `/places`; no undersized field on the add form at any size. |
| **P10** install | 146 files cached, 147 worker fetches with `service-worker.js`. |

**Install:** the manifest has no errors and Chromium reports no installability errors. `apple-mobile-web-app-capable` is "yes" and the apple-touch-icon is present. Pinch zoom is allowed (`width=device-width, initial-scale=1, viewport-fit=cover`, no `maximum-scale`).

**Offline**, with the network cut behind the worker:
- These open: `/`, `/?by=genus&open=haworthia`, a species page loaded in full, `/plants`, a plant page, `/places`, `/propagation`, `/labels`, `/backup` and `/settings`.
- Water recorded offline survives a reload. The tab bar moves between pages.
- With the signal back, an unread species page opens.

**Camera:**
- A 12 MP portrait JPEG with EXIF orientation 6 is stored upright at 1200 x 1600, dated 2026-10-20 from its EXIF (`dFrom: exif`), with a 320 px thumbnail, both as Blobs.
- The viewer opens, and swipes from "1 of 2" to "2 of 2".

**Back elsewhere:**
- A saved plant goes back to an empty add form, with no duplicate.
- A saved batch goes back to its form.
- The section tabs add no history.

**Safe areas in portrait:** the tab bar is padded by the 34 px inset (91 px tall on the iPhones). The toast, the selection bar and the pill add the inset. Nothing pinned sits in the home-indicator margin.

**The rest:**
- **Overflow and scroll traps:** no sideways overflow at any of the 11 sizes; a vertical drag starting on the month table or the photo strip scrolls the page.
- **Keyboard** (page 300 px shorter): the focused field stayed in view and uncovered in 8 of 8 cases; the pinned action bar joins the page's flow under 480 px tall (deliberate), so the form's own button is below the fold in 5 of 8. Enter as submit not tried.
- **Slow network**, cold cache, a proxy adding a 2 s round trip at 400 kb/s, no photographs: the front page took 58 requests and about 380 kB; first byte 5.4 s, first paint 8.7 s (server-drawn and complete), load 24.7 s. A search showed "Searching…" until its answer at about 7 s. Nothing blank after the first paint (`r-slowcold.json`). CDP throttling did not hold back the worker's fetches, so `r-slowwarm.json` and `r-slow-i13.json` are not used.
- **Journeys 7 to 12:** space from Move, Water all, Undo, water; leaf cuttings ×6 linked, one struck (17%); three labels at 2.625 x 1.000 in when printed, QR codes, bars hidden; backup, wipe, restore with 115 changes before and after; °F (31.5 °F); the example's 12 plants, Leave, `/plants` empty.
- **Console:** no page errors other than P4's `$set`.

## Mobile against PC: the twelve journeys

W's desktop column is from `review-w.md`.

| # | Journey | Desktop (W, 1280) | Phone (P, iPhone 13) | What differs | Right? |
|---|---|---|---|---|---|
| 1 | First visit, by genus, H, Haworthia, a species, Back | Works | Works: Back within 0 to 2 px; the app's ‹ too | none | yes |
| 2 | "echeveria", Show more, open, Back | Works; reload fails (W1) | **Faults:** Back drops "Show more" and the place (P1); a grower lands on "/" and the own-plants view | the cost of the lost place is far larger on a phone | no (P1) |
| 3 | "snake plant", "Sansevieria trifasciata" | Works (W5) | Works: Dracaena trifasciata first both times | none | yes |
| 4 | Keyless page | Works | Works: 9 "not checked", 6 "not asked", no "none" for unchecked | none | yes |
| 5 | Compare two | Fails (W2) | **Fails** (W2), and the phone's pill leads into it (P5) | the pill links to `/compare` with one species | no |
| 6 | Add a first plant from a species page | Works | Works: 2026-0001, "Seed swap". The tray's pill covers Add (P2) | the pill exists only on a phone | no (P2) |
| 7 | Space, Water all, Undo, water | Works | Works: toast and Undo 56 x 44; the toast sits on the pill (P2) | the toast is at the foot on both | the overlap, no |
| 8 | Propagation batch | Works | Works: S2026-001, linked to the plant | none | yes |
| 9 | Labels for three, print | Works (W6) | Works: 3 labels, QR, 2.625 x 1 in when printed | the screen preview scrolls inside its box | yes |
| 10 | Back up, clear, restore | Works | Works: 115 changes before and after; a 3.3 kB zip | none | yes |
| 11 | Units, reference photographs | Works | Works: °F everywhere; the switch is 44 px | none | yes |
| 12 | Example, leave | Works | Works: 12 plants, Leave 131 x 44, then empty | the example bar takes 133 px at the top of a 664 px screen | acceptable |
| — | `/?q=…` loaded or reloaded | Fails (W1) | **Fails**, also with a collection and offline (P4) | pull-to-refresh makes it common on a phone | no |

## The WebKit walk for the owner's PC

**File:** `/tmp/claude-0/rev81r/P-s/webkit-walk.mjs`. It is plain ESM. It finds `@playwright/test` from the folder it is run in, so it works wherever the file is kept.

**Commands:** run from the project's folder:
- `node <path>\webkit-walk.mjs` runs WebKit, headless.
- `--engine chromium` checks the script itself in Chromium.
- Other options: `--budget 200` (the default), `--no-photos`, `--keep`, `--reuse`, `--base`, `--out`.

**Output:** `webkit-walk-<date>\` beside the file, with one PNG a step, `webkit-walk.json`, the backup zip, and one printed line a step.

**Safety:**
- Read-only: no vault, no sync, no POST beyond what a page does.
- The collection lives in a profile inside the output folder, deleted at the end.
- At most 200 requests to the site. Each step checks the budget first and is skipped with a reason if it cannot fit.
- At least 0.5 s between steps.
- Photograph hosts are capped at 40 tunnels by its own small proxy. The same proxy cuts the network for the offline steps.

**What it walks** (step ids in the JSON):
- **A01 to A10, iPhone 13 with the worker:** the cold front page, the worker's install, Back to the Haworthia row (round 80's P1, decisive in Safari, which has no scroll anchoring), round 80's P8, search Back (P1), the common and older names, the example (`navigator.locks`), a keyless page, adding a plant, two 12 MP orientation-6 photographs made in the page (upright, Blob or bytes in IndexedDB, kept after a reload, card and strip, hero size), and the viewer's Back (P8).
- **C02 to C05, no signal and back** (P3, round 80's P5): nine addresses offline, water recorded offline and kept after a reload, the tab bar, an unread species page once the signal is back.
- **A13:** export, wipe, restore (Safari's zip and Blob handling).
- **B01, B02:** iPad both ways: front page, species page, plant page, whether the menu fits.
- **A11, A12, A14 to A16, as the budget allows:** space and water with Undo, propagation, labels in print media, °F, the compare pill (P5).

**Tested here, in Chromium:**
- A first run (cold): A01 to A10 passed. It exposed three faults in the script, all fixed: in-app navigation from the add form was cancelled by its "Leave this page?" guard, now confirmed and with a fallback; an unhandled download wait; and the viewer's Back leaving the plant page, so the walk now goes forward again.
- A second run, with the cache warm (`--reuse --budget 150`): 23 of 23 steps passed, with nothing skipped (`walk-test/webkit-walk.json`, 47 screenshots).
- Since then the steps were reordered, so the offline part and the backup come before the iPad and the low-priority steps. The request count was also made more careful: anything that passed through the worker, other than the build's hashed files, is counted. Both changes were checked for syntax only: one more live run did not fit my request budget.
- On a cold PC, expect about 150 counted requests by step C05. The last steps may be skipped by the budget, and each skip is said in the output.

**What WebKit cannot settle here:**
- the safe areas (Playwright's WebKit reports no insets, so P7 needs a real iPhone);
- the keyboard;
- native pickers;
- Add to Home Screen.

## Not checked, with why

**Not run at all:**
- **Real devices:** iOS safe areas, the keyboard (iOS overlays it rather than resizing, so I used the brief's 300 px model), Add to Home Screen and standalone launch, momentum scrolling, and long-press menus. The WebKit walk settles what headless WebKit can.
- **Enter on the phone keyboard as a submit,** and the date and select pickers.
- **Photographs from third-party hosts:** blocked, to keep within the third-party allowance. Their loaded look, and "the reference's photographs on" with real images, were not judged. W counted 0 requests with them off.
- **Sync:** by the rules.

**Started but not completed:**
- **A true cold 3G figure for a species page:** the budget ran out.
- **The second half of P3,** offline tapping into a species page: the budget ran out.
- **Horizontal swipes by synthetic touch:** they do not scroll Chromium's overflow boxes, so the month table was checked by setting its scroll position, not by a swipe.

**Checked only in part:**
- **Round 80's P9:** the "You grow" chip over the placeholder and the failed related tile were not re-checked. Third-party hosts were blocked and the related list came back empty.

## Needs from the PC

1. **Run the walk:** from the project's folder, `node <path>\webkit-walk.mjs`, and send back the console lines plus `webkit-walk-2026-10-2x\webkit-walk.json` and its PNGs. The steps that matter most are:
   - A02 (row Back in Safari);
   - A04 (search Back in Safari);
   - A09 (photo stored as Blob or bytes, orientation);
   - C03 and C04 (offline in Safari);
   - A13 (restore);
   - A16.
2. **If an iPhone is at hand:**
   - the top bar in landscape (P7): is the ✳ menu button under the notch?
   - pull-to-refresh on a search result (P4);
   - with one species in the compare tray, open "Add a plant": is Add covered (P2)?
