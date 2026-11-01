# Round eighty-five, agent U: the collection, the frame, the service worker and operations

Copy `/tmp/claude-0/rev85/U/`, branch `r85`, six commits on `r85base` (`08094db`). Scratch `/tmp/claude-0/rev85/U-s/` (63 MB; the r85base worktree where every new test was run is removed now). No file under the hard limits changed.

One harness note for the coordinator: from about 19:15 to 19:35 UTC my local server held the e2e lock. It was started by a script run under `flock`, inherited the lock's file descriptor, and blocked the other agents' browser runs until I stopped it. From then on every server of mine was started outside the lock, and runs used `flock -o`.

## Done

**A17, C7: photographs not received are said.** `photosLater` was counted and told only to the console. The status card on /sync now reads "the records on the server just now are here; 2 photographs were not received this run; asked for again at the next sync". A 503 (another device storing or removing it) counts too. Files: `src/lib/ui/sync-words.ts` (`photosLaterWords`, `syncedWords`), `src/lib/sync/engine.svelte.ts`, `src/routes/sync/+page.svelte`. Tests: `r85u-frame.test.ts` (words); `r85u-frame.spec.ts` "A17, C7" (device A syncs a photograph; B joins while every photo GET answers 500; the card says it; the next sync brings it and the line goes). On base: "everything on the server just now is here". Step 1.

**A18, B5, C5 (decision 9): the live check on an edge hit.** `scripts/live-check-cache.mjs` gains `edgeHitGet` and `edgeVerdict`. Each of `/api/index` and `/api/counts` is asked until `cf-cache-status: HIT`, at most five GETs a second apart. The hit's header is judged. A route never answered from the edge cache fails, so the check can no longer pass on a miss. A local server (no `cf-ray`) is judged on its own header and says so. `scripts/live-check.mjs` uses it, and the index's hit still feeds the thumbnail check. DEPLOY.md's section puts the dashboard step first: Respect Existing Headers, then purge both routes. Test: `r85u-live-check.test.ts` (miss then a 14,400 hit fails and names the setting; miss then a 300 hit passes; never a hit fails; local; 503). On base the functions do not exist. Step 1, with the owner's dashboard step before it.

**A19: the small points.**
- *Site name bounded on write.* `site.set` passes the name through `siteName`, and Settings' field has `maxlength`. On base a 605-character name was kept whole.
- *`localDateOf('YYYY-MM-DD')`.* A calendar date is now returned as it is when it is a real day, and null when it is not (`2026-02-30`). On base it was the 30th in New York.
- *Unparseable `lastBackup`.* Today and Backup say "a backup of a date this device cannot read", and the line counts it as stale. On base both said "today".
- *The refold after a clock correction.* `clockChanged`'s `.catch(() => {})` now warns, sets `collection.readBehind` to `CLOCK_FOLD_FAILED` (the layout's line with Reload), and marks the next pull to fold again. A later refold that works takes the line down.
- *The catches.* 422 catch sites in `src/`. By the rule "acts, or says why beside it", 52 did neither on base. The refold above now acts. The other 51 now carry their reason, for example "aborted on purpose: the abort's rejection is the expected end" or "the answer is given; a copy not kept at the edge is searched again next time".

Tests: `r85u-frame.test.ts` covers dates, the site name and the refold. `r85u-catches.test.ts` scans `src/` and fails on any handler that neither acts nor says why: 52 on base, 0 now. That test reads source text, and it guards the written promise "a failure is said, or the code says why not", not a behaviour. `r85u-frame.spec.ts` "A19" covers Today in the browser. Step 1.

**A16f: My plants holds still as the fonts arrive.** The backup line was set in the fallback face on a cold phone. When Public Sans arrived it went from 79 px to 58 px at 375 px, and the 421-plant list moved up. It is now set in `--ui-local`, the metric-matched fallback faces without the web font (a new token in theme.css's frame part), so the font's arrival cannot reflow it. Files: `src/lib/ui/theme.css`, `src/routes/plants/+page.svelte`. Test: `r85u-plants-cls.spec.ts` (421 plants, CPU ×4, the woff2 files held until the list is drawn, layout shifts read from the first frame, 320, 375 and 414 px). On base it measured 0.2234 at 375 px; now 0.0000 (320 px: 0.004 from the rows, before and after). Round 84's test served the fonts at once, so it never saw this. Step 1.

**W7: compare from the desktop tray.** With one pick, "pick one more ›" is now a link to `/compare`, as tall as the tray's other controls. The species page's toggle reads "Remove from compare" once the species is in the tray, and drops `aria-pressed`, since the label now says the action. Files: `src/lib/ui/CompareBar.svelte`, `src/lib/ui/CompareButton.svelte`. Test: `r85u-frame.spec.ts` "W7". Step 1.

**W8: the genus tile.** A genus tile gets the placeholder captioned "genus" (`src/routes/+page.svelte`). Test "W8" (desktop and phone). On base it read "loading…". Step 1.

**W14, P7: the crumb.** Each part before the last is now whole, and the last ends in an ellipsis when cut. The ol is a flex row. The section's inline-block link had been cut with no mark ("SPECIE"). At 480 px and below, a detail page's crumb is its name alone, since Back leads up. Where the five places are in the bar (short and narrow, 640 × 400), the crumb is read but not drawn: the places name the section, and only 50 px was left. File: `src/routes/+layout.svelte`. Tests: "W14, P7" at 640×400 (not drawn, still the Breadcrumb's name, Species `aria-current`) and at 320, 390, 768 and 1280 (each part inside the nav, the name at least 60 px). On base, 640×400 drew "My plants" cut, and 320, 390 and 768 ran the name past the nav. Step 1.

**C6: species pages carried over an update.** On activation, before anything is deleted, the new worker lists the species pages the earlier builds held (`carryList`: the last 50 read, queried copies left out). While online, in the background of requests and at most once a minute, it reads each page's `__data.json` again from the new server, along with the species page's code not cached at install (`carryOver`). A 404 drops the page. A network failure or a 5xx stops the round, and the list waits. The offline page then opens the page from this build's cache, in the new build's format, so no old data meets new scripts and no format version is needed. The code list is new: `speciesBuild` in `scripts/offline-files.mjs`, the page node and the `[slug]` layout node with their imports, five files, as `__SPECIES_BUILD__`. Files: `src/lib/core/sw-keep.ts`, `src/service-worker.ts`, `scripts/offline-files.mjs`, `src/routes/offline/+page.svelte`. Tests: `r85u-sw-carry.test.ts` (order, the prune after the list, a round half-done, a 5xx, the cap; a guard shows base keeps no copy) and `r85u-offline-files.test.ts`. Both fail on base. Measured end to end below. Step 1; it works on the first update from round 84's worker.

**C9: the worker's comments.** The header and the index comment now say what happens: dossiers are never cached. `/api/dossier/` joins the never-cached routes, out of the corpus branch, since it answers `no-store` and no page asks for it. Step 1.

**A19, A24's third: products whole and checked.** New `scripts/product-files.ts`:
- `writeProduct` writes through `writeAtomic` and keeps a file already there only when its size is the content's, so a cut-off file is written again.
- `checkProducts` reads every product the manifest names, and the search key files its directories name, and checks each MD5 against its name.

In `build-dossiers.ts`, `writeProducts`' writer uses `writeProduct`, and `--index-ready` runs `checkProducts` after the stamp check, failing with the files named. The genus records (`g/*.json`, uploaded) are now written atomically too. Test: `r85u-products.test.ts` (a corpus of 400 synthetic species, with a product cut off, one missing and a search directory cut off; each refused and named, and `--index`'s writer puts them back). Step 2 (`--index`, then the upload's `--index-ready`).

**B's operations note: an interrupted upload said.** `corpus-step.mjs` writes `upload-partial.json` before the first copy and removes it once the manifest is up. `--status` and every run print "An upload of corpus <id> began copying at <time> and has not finished: …" with the command that finishes it, and `--prune` refuses while it is there. Test: `r85u-upload.test.ts` (copy fails, check fails, refused before copying). Step 2.

**A16h: arrow keys and the letter's busy state.** Down from the search box focuses the first match. Up and Down move between the plant and species matches, and Up from the first or Escape returns to the box. A letter whose rows are being fetched is marked (`a.busy`, a pulse, off under reduced motion), its nav is `aria-busy`, and a status says "Fetching the rows from C…". File: `src/routes/+page.svelte`. Tests: "A16h" ×2 (the second holds `/api/rows` at `/?by=genus&from=W`). On base neither existed. Step 1.

**Performance: the cold front page.** Measured below. The cut: the tab bar no longer measures its labels during hydration, which had laid the page out once more before its first frame. Its ResizeObserver's first call measures after the browser's own layout, and the attributes come off only when present. The trace's "layout forced by script" from the layout chunk is gone. `r62ba-interface` (the tab bar at 200% text) passes. Step 1.

## Decisions I took

- **The catch rule.** A handler "says something" when it acts (rethrows, returns a value its caller reads, sets a state a page shows, logs) or has its reason beside it. I wrote a reason into each of the 51 empty ones rather than adding logs, since each is housekeeping whose failure the next request repairs. The test makes the rule hold for every file in `src/`, other agents' files included.
- **C6 by re-reading, not a format version.** Carrying old data under a format number would need a hand-bumped constant and a shape test, and it would still serve data the new code was not written for. Re-reading from the new server during the update needs no format at all, and it costs one request per page, once per update, for at most 50 pages. The data shows on the offline page's path ("opening it…"), not as HTML, because the old HTML names chunks the update deletes.
- **The crumb at 640 × 400 is not drawn.** I took P7's first option: the five places name the section, Back leads up, and the h1 names the page.
- **The backup line's face.** Reserving height cannot be made exact across fonts and widths. Setting the line in the metric-matched fallback stack removes the cause, and it reads the same width.
- **The upload is said, not made atomic.** Making it safe would mean dossiers addressed by content, and that changes the Worker and the bucket's layout. Copying `p/` first would shorten the window, but it would change five tests in Q's files that assert the command list. I made the window impossible to miss instead: the mark, `--status`, every run, and the prune refusing.
- **"Remove from compare"** without `aria-pressed`: a label that names the action does not also announce a state.
- **TBT.** I made no riskier cut. Deferring the collection module (102 kB, about 45 ms of evaluation unthrottled) for a visitor would mean moving the layout's static imports, which every page reads. I judged that unsafe in a final round. What remains is the browser's own first layout and the scripts' evaluation; see Measured.

## Measured

- **C6, end to end.** I ran review C's `update.mjs`, adapted: `U-s/sw/update.mjs`, log `U-s/sw/update-final.out`.
  - Under r85base: one profile, a plant added, `/species/copiapoa-cinerea` read by its address and held in the old build's cache.
  - Then my build served, the update taken over and `/plants` opened.
  - The new cache then held `/species/copiapoa-cinerea/__data.json`.
  - With the server stopped and the HTTP cache cleared, cinerea opened offline ("Copiapoa cinerea (Phil.) Britton & Rose"). A page never read said "No connection".
  - Review C's run of round 83 to 84 said "No connection" for cinerea.
  - My first run, without the `[slug]` layout node in the carried code, also said "No connection". That is why `SPECIES_NODES` exists.
- **A16f.** CLS on the cold, throttled phone (421 plants, fonts held): 375 px went from 0.2234 to 0.0000; 320 px 0.0041 before and after; 414 px 0.0003 to 0.0000.
- **Front page TBT, local fixture.** Chromium iPhone 13 profile, 150 ms and 1.6 Mbit/s, CPU ×4, five cold loads each, back to back:
  - TBT: r85base median 229 ms (210 to 270), mine 247 ms (223 to 266). The two are within the machine's noise; load averages reached 37 during the round.
  - Inside the long tasks: the first full layout about 200 ms at ×4, and module evaluation about 25 to 45 ms per load.
  - The script-forced layout: 5 ms per load on base, none in mine.
  - The live front page has 757 elements and 60 rows; the fixture's has 211. I could not measure the live page in a browser within the two-requests-a-second limit, so A's 503 ms is not reproduced here.
- **Catches.** 52 of 422 silent on base; 0 of 421 now.
- **Tests.** Unit: 81 files near my changes, 652 tests, all pass; the seven new files fail on base. Browser, Chromium and phone: `r85u-frame` and `r85u-plants-cls`, with `r84u-frame`, `r62ba-interface`, `r81u-compare`, `r67h-offline`, `r80u-offline`, `r81u-offline`, `r70w-sync` and `smoke-3`: 134 passed, none flaky, strict. Against an r85base build, 12 of my 15 new browser tests failed as their comments say; the three that pass on base are guards (the crumb at 1280, CLS at 320 and 414). `tsc --noEmit`: clean. svelte-check (once, 3 GB heap): 1,464 files, 0 errors, 0 warnings.

## For the owner's PC

1. Before the deploy, in the Cloudflare dashboard, zone `cultifolio.com`:
   - Caching, Configuration, Browser Cache TTL: "Respect Existing Headers".
   - Purge Cache, Custom Purge: `https://cultifolio.com/api/index` and `https://cultifolio.com/api/counts`.
2. Then the round's deploy as usual. Its live check should end with `ok  /api/index: an edge hit (after N GETs) says "public, max-age=300", within the 5 minutes promised` and the same for `/api/counts`.

No other command of mine. `--index-ready` now takes a minute or two longer, reading every product file (an estimate).

## Touched outside my files

- **Catch reasons**, one comment inside an empty handler, nothing else changed:
  - `src/hooks.server.ts`;
  - `src/lib/server/{sync,synonyms,dossiers,counters}.ts` (N's for search and catalogue);
  - `src/lib/core/search-files.ts`, `src/lib/ui/LocationPicker.svelte`, `src/lib/ui/keep-ask.ts`, `src/lib/ui/grow/demo-seed.ts`;
  - `src/routes/api/{dossier/[key],names,search,sheets}/+server.ts` (names is K's);
  - `src/routes/plants/new/+page.svelte` (K's, line 199);
  - `src/lib/db/collection.svelte.ts`, two lines of the load and the claim chain, not the number paths.
- **`src/routes/about/how/+page.svelte`**, A's file: line 758, the offline sentence, now says an update reads the last fifty pages again. It is marked `<!-- r85 U -->`.
- **`scripts/build-dossiers.ts`**: the product writer, `--index-ready`, and the genus record and rekey writes made atomic.
- **`src/routes/sync/+page.svelte`**: the card's words.
- **`src/lib/ui/CompareBar.svelte`, `CompareButton.svelte`**: listed for no one; taken as compare's.
- **`tests/unit/fold-rules.test.ts`**, Q's: the hash re-recorded under rules 8, since comments and the refold's handling changed the hashed source and no fold changes. K's number-path edits will move it again at the merge.

## Not done, with why

Nothing.
