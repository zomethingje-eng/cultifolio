# Round 81, agent U: the app's pages and the phone

Copy `/tmp/claude-0/rev81/U/`, branch `r81` from `r81base`, 19 commits (last `c8dc895`). Scratch `/tmp/claude-0/rev81/U-s/`. The walk to hand over: `/tmp/claude-0/rev81/U-s/webkit-walk.mjs`.

Every change is in the app (pages, the service worker, CSS) and its tests. None touches `scripts/`, `src/lib/dossier/`, `scripts/build-dossiers.ts`, `scripts/corpus-step.mjs`, `scripts/export-corpus*.ts`, the plan files, `package.json`, `package-lock.json`, `wrangler.jsonc` or `static/s/`. **All of it is safe to deliver mid-fill, any day**: it reaches the site with `npm run deploy`, and the fill and the index never run it.

## Done

On the base: the four new specs, run on a build of `r81base` in `chromium` and `phone`, gave 25 failed and 2 passed (P7's all-engine guard, by design; `U-s/base-run-r81base.log`).

**W2 / P5. Compare's picker drops the tray's species.**
- `src/routes/compare/+page.svelte`, `withSlug`: with no columns, the tray's species come first.
- Test `r81u compare 1` (both projects). On the base the link was `?s=copiapoa-humilis` and gave one column.

**P2. The compare pill covers Add and the other pinned bars.**
- `src/lib/ui/CompareBar.svelte`: the pill steps aside while `body.stickyacts` (the add and batch forms' pinned bars) or `body.grow-selecting` (select mode) is set. The tray is kept, and the pill is back on the next page.
- `src/lib/ui/ToastBar.svelte`: up to 700 px, the toast stands above the pill when the pill is shown.
- Tests `r81u compare 2` and `3` (phone only). On the base, the pill's link was what lay at the centre of Add, and the Water all toast overlapped the pill (536–598 against 554–598).

**P3. Offline, a species page read by a link is not kept.** I chose to keep it rather than change the sentence.
- `src/routes/offline/+page.svelte` with `src/lib/ui/offline-kept.ts`: when the worker answers an address with the offline page, the page opens the real page from what the device holds, once.
  - It checks that this build's cache (`cultifolio-<version>`) holds the page's `__data.json`, loads the route's scripts first (`preloadCode`, so a page whose scripts are not kept stays here rather than reaching the error page), then calls `goto` with `replaceState`.
  - One try per address per minute (session storage); none without session storage.
- `src/service-worker.ts` (`dataCopy`): with the network gone, a page's `__data.json` is answered from the copy kept under any `x-sveltekit-invalidated` bits, as long as the rest of the query matches.
- The offline page's sentence and `/about/how` (line 91) now say: kept once opened, by its address or by a link, until the app next updates itself. That is true of the code, because each build's cache starts afresh.
- Tests `r81u offline 1` (both projects; network cut behind the worker by `helpers/cut.ts`, so it holds in WebKit) and `tests/unit/r81u-words.test.ts`. On the base the address opened "No connection".

**C1. The share card after the next deploy.**
- `src/lib/ui/ShareCard.svelte` and `src/lib/ui/share-words.ts`: a failed import of the drawing code is said in words, never as the browser's message.
- Which case it is gets read, not guessed: `navigator.onLine`, then `updated.check()` (the site's `version.json`). The three cases are no connection, a newer version, or not reached. All but no connection offer "Reload the page".
- Test `r81u share 1` (worker blocked, so the routes catch the chunk in every engine). On the base it printed "Failed to fetch dynamically imported module: http://…/_app/immutable/chunks/….js".

**P6. The menu in landscape.**
- `src/routes/+layout.svelte` lines 541–544: `#menu` is at most the window's height less its top, scrolls itself, and has `overscroll-behavior: contain`.
- Line 554: the phone sheet keeps its full height (`max-height: none`).
- Test `r81u phone 1` (740 × 360). On the base the menu was 656 px tall from y 48, and Settings could not be reached.

**P7. The notch.**
- `+layout.svelte` lines 518–521: `#topbar` pads itself by `max(16px, env(safe-area-inset-left/right))`, as the body does.
- Tests: `r81u phone 2a` (tagged `@chromium`: it emulates the insets through CDP's `Emulation.setSafeAreaInsetsOverride`, which only Chromium has; it failed on the base with the menu button at x 16, inside the 47 px margin) and `2b` (every engine: the bar's padding equals the body's).

**P8. Back closes what is open.**
- New `src/lib/ui/back-layer.svelte.ts`. It uses SvelteKit's shallow routing (`pushState`, `page.state.layers`, declared in `src/app.d.ts`), so Back closes the layer and the page stays.
  - Closed by its own button, Escape or Record, it takes its entry away at once (`history.back()` in the same turn), keeping the scroll, so the next Back leaves the page as before.
  - While one is open, the body carries `data-sveltekit-replacestate`: a link in the menu replaces the menu's entry. Layers stack; a close by a move to another page takes no step back.
- Used by `Lightbox.svelte` (the viewer on plant, batch and species pages), the menu (`+layout.svelte` line 121), and the Record form (`plants/[acc]`).
- The menu's "See the example collection" awaits `settle()` (`+layout.svelte` line 78), so the step back cannot land after the move into the example. Found by r63v, r67v and r70x on the first full run.
- Test `r81u phone 3` (both projects). On the base, Back left the plant.

**P9. HEIC.**
- `src/lib/photo/process.ts`, `unreadableWords`: a file that cannot be drawn is named. A HEIC (by type or name) reads: "IMG_0001.HEIC is a HEIC photograph, which this browser cannot read. On an iPhone, choose it from Photos, which hands it over as a JPEG; elsewhere, save it as a JPEG first and choose that."
- `PhotoAdd.svelte` says each failed file, not only the last.
- Tests `r81u phone 4` and the unit test. On the base the message named no file.

**P10. Tap targets.**
- `src/lib/ui/theme.css`: a `(pointer: coarse)` block applies at every width.
  - `.btn`, `.chipbtn`, `.linkish` and `.searchbar` take the 44 px token.
  - `.btn` takes a minimum width, so Follow is 44 px wide.
  - A plant's number chip and the photograph's credit keep their look and take a 44 px invisible hit area (`::after`).
- `compare/+page.svelte`: the column names and "Chart on its page" are 44 px tall under touch.
- Test `r81u phone 5` (phone, 750 × 342). It checks Follow, the search box and "Show all", and that a finger 18 px above and below each chip's middle presses it. On the base Follow was 42 px wide.

**W7. Accessibility.**
- Log "×" (`plants/[acc]` lines 816 and 820, `propagation/[id]` line 538): named "Remove this entry: Watered, <date>", and its confirmation "Remove? Watered, <date>: press again to remove it". The old words stay at the front, so `smoke-2` and voice control still match them.
- Search rows (`src/routes/+page.svelte` lines 711–712 and 717): the thumbnail's letter and the "›" are `aria-hidden`.
- `SpeciesPicker.svelte` takes `labelledby` and `describedby`: the batch form's and the add form's species fields are named "Species", and the batch form's hint describes it.
- `/plants/new` puts focus in the species field as the page arrives (its own `afterNavigate`, after the layout's), on a desktop with a fine pointer, when no species came with the link and nothing is typed. A first version focused it after the collection opened, and took focus back from a field typed into and left; the first full run's r60 8 caught that.
- Tests `r81u a11y 1` to `4`, using Playwright's own accessible-name rules, which are the same in every engine. Test 4 covers a load, a link inside the app and a field typed into, and skips, saying so, where an engine reports no fine pointer.

**W9. A failed photograph.**
- `species/[slug]/+page.svelte` lines 915–917: the placeholder fills the frame (absolute, inset 0).
- Test `r81u a11y 5`, at 1280 and 390. On the base it was 200 of 300 px.

**The WebKit walk** (`U-s/webkit-walk.mjs`), re-tested in Chromium against the live site and fixed:
1. **A13 always failed:** `backupFile` was declared after A13, which then stopped on it. It is now declared before A13.
2. **The worker's install went uncounted.** A01w waited 30 s for a worker before loading the second page, which is the one that installs it (live result: `ready=false`, 0 files). The worker then installed later and its roughly 93 fetches were never counted. A01w now loads the second page first. Every tally also counts the site's addresses in the caches that no page loaded.
3. **Moves waited for page loads.** Moves after a tap now wait for the address (`commit`) for up to 60 s, and `nav` falls back after 20 s. Live, A02 and A16 timed out at 30 s on a slow link: A02's move did land, after the wait.
4. **Steps that need the plant:** A09 to A12 say "no plant" when A08 did not run (budget), instead of failing on a 30 s wait.
5. **Verdicts for round 81's fixes:** A10 "Back closed the viewer", C03 "the species page read by links opened offline", A16 "two side by side" and "Add uncovered" (the pill over the add form), and a new A17 (iPhone landscape: "menu fits", "Back closed the menu").

## Repairs for the live site

None. Everything is the app's, and arrives with the next `npm run deploy`.

## Needs

- **S** (`src/routes/+page.svelte`): my edit is only lines 711–712 and 717 in the `hit` snippet (`aria-hidden` on `.im` and `.fig`). P1 and P4 are S's.
- **Merge, shared files:**
  - `+layout.svelte`: lines 2, 78, 121–122, 518–521, 541–544 and 554.
  - `species/[slug]/+page.svelte`: lines 915–917 (CSS only).
  - `/about/how`: line 91, the sentence ending "so a species page opened online … is readable offline after"; it now reads "…, by its address or by a link inside the app, is readable offline after, until the app next updates itself: an update starts these copies afresh."
  - `src/app.d.ts`: `App.PageState.layers`.
  - `DEPLOY.md`: my section `### Round eighty-one: the app's pages and the phone (agent U)` sits after round eighty's U section. B owns the owner's walk list; the walk command there is `node <path>\webkit-walk.mjs --budget 260`, after the deploy.
- **H:** I did not touch the device database; the offline page opens only this build's copies, never an old build's page against a newer database.
- **The coordinator:** copy `U-s/webkit-walk.mjs` to the PC. The reviewer's copy has the A13 fault and undercounts.

## For the owner's PC

1. Predeploy in WebKit, the WebKit phone and Firefox runs the four new specs (2a is Chromium-only by tag). They were written for those engines (the network cut behind the worker, the worker blocked where a route must catch a request, no `mouse.wheel`, `history.back()` in the page, distinct files counted, each skip saying why), but have not run in them here.
2. After the deploy, run `node <path>\webkit-walk.mjs --budget 260` from the project's folder. Send back the console lines and `webkit-walk-<date>\webkit-walk.json` with its PNGs. A verdict in capitals is a fault, or the deploy not yet live.
3. With an iPhone at hand, check P7: in landscape, the ✳ menu button and "+" should be clear of the notch.
4. C's need: open `/plants` at 2,000 plants and 20,000 log entries in WebKit, with the iPhone 13 descriptor. That is where C6's remaining time would be pinned.

## Measured

- **New specs, on the fix, in Chromium and the Chromium phone:** 27 of 27 pass. On `r81base`: 25 fail and 2 pass (2b, the guard).
- **Unit test:** `r81u-words` has 6 tests.
- **Whole unit suite**, once, alone, under the lock: 4,472 passed, 4 failed, 10 skipped. The 4 failures were mine:
  - two about-seam checks (the offline page's cache name was a variable; now written as the seam test reads it);
  - the offline page's guarded words "the ones you have opened are here" (kept);
  - r80m's `addLabel` order (restored).
  All four pass after the fix (74 of 74 in those files).
- **Types:** `tsc --noEmit` exit 0; `svelte-check --threshold error`: 0 errors, 0 warnings.
- **First full browser run** (load average 8 to 28): 604 passed, 7 failed, 3 flaky. Five failures were the menu's example race (now `settle`), one was smoke-2 finding the "×" by its old name (old words kept at the front), and one was a sync timeout under load. The flaky tests were loads under load and a crashed page. Reruns on newer builds: 114 of 115 passed, 1 flaky (smoke-1's reload meeting a step back taken on a timer; now taken at once); then 93 of 93.
- **Final full browser run on `c8dc895`** (chromium and phone, `--workers=2`): 614 passed, 0 failed, 0 flaky, 5 skipped (17.3 min).
- **C6** (C's script against my local build, 2,000 plants, 20,000 entries, 77,040 changes; each open of `/plants` after the snapshot, three runs):
  - Desktop: 845 to 893 ms, of which script 320 to 329 ms, layout 86 to 103 ms, style 40 to 50 ms.
  - Pixel 7 at 4× CPU: 3.47 to 3.93 s, of which script 1.17 to 1.25 s, layout 0.39 to 0.55 s, style 0.21 to 0.31 s, and about 1.7 s of task time outside script, layout and style (most likely reading the snapshot out of IndexedDB).
  - The list already draws 200 rows, not 1,920 (`src/routes/plants/+page.svelte:207`; C's "renders every row" is not so).
- **C7:** not measured; the hero is already preloaded at `fetchpriority="high"`, phone-sized, its host preconnected (`species/[slug]/+page.svelte:394–396`).
- **Live site requests:**
  - The reviewer's walk in Chromium: 22 of 25 ok; A02, A03 and A16 failed on 30 s waits. It counted 137, plus the worker's install, which its count missed (93 by the fixed walk). So about 230, over the walk's 200. That was the fault fixed above, and I found it by running it.
  - One probe of the pill: 60. It showed the tap works when the link is quick.
  - The fixed walk in Chromium, cold, `--budget 190 --no-photos`: 185 counted (92 by the pages, 93 for the install). A01w ready (146 files), A02 held (0 px off), and A03 to A05 and A07 were ok. The rest were skipped by the budget, each saying so. The two failures (A09 and A10, with no plant after A08 was skipped) led to the "no plant" guard.
  - In all, about 475 of my 600. The first walk's pages also loaded 370 photographs from other hosts over its 40-tunnel cap, in about 12 minutes; the second loaded none. The tests made none.
- **The fixed walk against my local build** (the species names swapped for the fixture's, no proxy, so C03 was not really offline): 22 of 25 steps ok. A02 to A04 failed only on the fixture's missing genera and searches. The verdicts on round 81's code: A10 "Back closed the viewer", A16 "two side by side" and "Add uncovered", A17 "menu fits" (bottom 334 of 342, scrollable) and "Back closed the menu". A01w: ready, 147 files, 93 counted for the install.

## Not done, with why

- **C6:** no small, safe fix. The rows are already paged at 200. A smaller first page would trim layout and style by about 0.5 s on the slowed phone, but Back to a plant beyond it would lose its place, because `/plants` keeps no snapshot of how far it was drawn. The rest is the collection's load (IndexedDB), and H is migrating that this round. Measured above; the WebKit figure is the PC's.
- **C7:** nothing in the page's order to fix: the time is iNaturalist's.
- **P7 on a real iPhone, and every engine other than Chromium:** not available here.
- **The fixed walk in full, live:** a cold run with the install counted is about 240 requests, over the 200 the brief allows for it. It ran in full against my local build, and live up to its budget. The last guard (A09 to A12) was syntax-checked only.
