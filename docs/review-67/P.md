# P's report, round sixty-seven

Working copy: `/tmp/r67/P`. Needs for other owners: `/tmp/r67/P-needs.md`.

## Items

### P1. "Keep data" asked on every load (S-E4, S-F2, R45-6, IND-2); contract C4

- **New `src/lib/ui/keep-ask.ts`:** `askToKeep(reason: 'load' | 'first'): Promise<boolean | null>`.
  - It writes `cultifolio.persistAskedAt` before calling `navigator.storage.persist()`.
  - The month applies whichever reason asks. A page asks at most once: a page flag covers storage that throws, and a second ask on the same load.
  - A stored time more than a day ahead of now (a clock that was set back since) is not honoured (IND-2).
  - Nothing is asked in the example or where the browser has no `persist()`. Null means "not asked".
  - It reads `inDemo()`, because V's `PAGE_IN_DEMO` is not in my copy. The line is marked, and the swap is in P-needs §6.
- **`src/lib/ui/grow/GrowLayer.svelte`:** the first-plant ask goes through `askToKeep('first')`. `persistAfterFirst` still means "answer said" and is written only when the toast is shown, so "asked" and "answer shown" are kept apart.
- **R's side (C4):** `collection.load()` calls `askToKeep('load')`, per R-needs P-1. R's copy has a shim, to be replaced with my file.
  - Warning, in P-needs §1: `askDue()` must be removed, not chained. It writes the same key, so the two together would never ask.
- **Tests:**
  - `tests/unit/r67p-keep-ask.test.ts` (9 tests): the never-answering `persist()` asked once over six loads; the time written before the call; the month (29 d 23 h no, 30 d yes); one ask per page; storage throwing; the example; a time from a clock that was ahead; no `persist()`; GrowLayer calls the gate and no other file calls `persist()`. It fails on the base: 9 of 9, with the base GrowLayer and no keep-ask.ts.
  - `tests/e2e/r67p-pages.spec.ts` "P1": Firefox's never-settling `persist()` over six full loads gives 1 ask. On a base build it gave 7 (`/plants /plants /today / /plants /places /plants/rQ1`).
  - `tests/e2e/r64f-firefox.spec.ts` r64f 5 (mine: it tests GrowLayer's ask) asserted the old behaviour ("every load after it" asks). It now asserts that a load after the first plant does not ask within the month. Passes.

### P2. Text lost to the post-deploy reload (R45-5, S-E6, S-E7)

- **New `src/lib/ui/take-over.ts`:** `onTakeOver(...)`, the rule as a pure function:
  - no older worker served the page → nothing;
  - the worker says no build (`null`), or the same build → nothing;
  - the page did not send `skip` → `reloadOnNext`;
  - it did send `skip` → reload at once only under 4 s, with nothing typed and no vault write in flight; otherwise at the next navigation.
- **`src/routes/+layout.svelte`:**
  - A capture-phase `input`/`change` listener sets `typedHere`, and a focused typing field also counts.
  - `vaultWritesInFlight()` is read from the vault.
  - `controllerchange` no longer returns for a tab that did not send `skip`.
- **`src/service-worker.ts`:** an `/_app/immutable/` path that is not this build's is answered from any `cultifolio-*` cache the worker keeps (never the corpus cache), and only then from the network. The previous build's cache is now read, as its comment claimed.
- **Test:** `tests/unit/r67p-takeover.test.ts` (10 tests): the rule's cases; the layout wiring; the worker loaded with a fake `self`/`caches`, where an old chunk offline is served from the previous build's cache and the corpus cache is not read for it. On the base (base SW and layout) the layout test and the old-chunk test fail (2 of 10). The rule's own tests need the new file.
- **Not done:** an end-to-end test of the takeover across two builds. The triage defers it (R45-28); the unit tests cover the logic.

### P3. Hover preloading on private pages, the tray included (S-F6, R45-7)

- **`+layout.svelte`:** a `$effect.pre` sets `data-sveltekit-preload-data` on `<body>` to `off` on private routes and `hover` elsewhere. This covers the top bar, the frost and clock lines, the footer and the tray, all outside `<main>`.
- **`CompareBar.svelte`:** takes `preload` from the layout and puts it on the tray and the pill too.
- **Test:** e2e "P3" puts two species in the tray, opens `/plants` at 1280 and at 390 and hovers the tray link: no `__data.json` request. It also checks that `/` still says `hover`. It fails on the base build.

### P4. `/about/how` and `/about/formats` drift (S-F7, S-F8, R45-13), and the seam tests

- **`/about/how`:**
  - The brief's sources now include Natural Earth and Wikidata, and "What comes from where" says what each supplies:
    - Wikidata gives the identifiers in POWO, IPNI, WFO and iNaturalist, the links and the en-Wikipedia title, by the item carrying the GBIF key, else an exact label;
    - Natural Earth gives the maps' coastlines, public domain, served by the site.
  - The framework's session keys, `sveltekit:scroll` and `sveltekit:snapshot`, are listed under session storage, with what each holds. No page exports a snapshot, and a test checks that.
  - A new clause covers the browser's own HTTP cache: search, picker name and its species part, entries, sheets and rows for a day; a forecast for an hour (five minutes for NWS-refused alerts); a page for a minute.
  - `labelsPicked` (written when hidden or left, forgotten on a move in the app, read back on a reload or a history return).
  - The `/service-worker.js` request after a failed navigation finds a new version (`reg.update`), in both the short list and the full detail.
  - The reload rule (four seconds, nothing typed, nothing writing, else the next move; a worker that does not say is never reloaded under).
  - Hover preloading is "anywhere on the page, the compare tray, the top bar and the footer included".
  - The persist keys (P1 wording).
- **The seed's words (formats:51):** V's sentence, from V's need (one change that also marks it and notes its last arrival number; the no-locks claim; repair of missing marks).
- **Seam tests:**
  - `tests/unit/r62w-about-seams.test.ts`: the IndexedDB, cache, lock and channel test now finds each name whole (a regex word boundary), in the part of the key list for its kind of store. A substring anywhere no longer passes.
    - The skip of any argument holding `name` or `n` is removed. No call needed it.
    - The one read-back name (`caches.open(k)` over `caches.keys()` in the worker) is named in an explicit allow-list.
    - Mutation check: with the cache-storage names removed from the page, the new test fails (`cache: cultifolio-`, `cache: cultifolio-corpus`).
  - New `tests/unit/r67p-about-seams.test.ts` (15 tests). Each checks whole sentences or clauses, exactly, beside the code that makes them true:
    - cookies both ways (exactly `cultifolio.units` on `/` and `cultifolio.hemi` on `/species` and `/compare`; the server sets none), against the short list and the full detail;
    - the framework's two session keys, read from kit's constants and its two `storage.set` calls;
    - the browser-cache clause, against each route's `public, max-age` and hooks' `private, max-age=60`;
    - the hover-preload sentence, against the layout's body attribute and CompareBar;
    - the reload clause, against `EARLY_MS` 4000, and the failed-navigation sentence, against the layout's `reg.update`;
    - the persist clause, against `ASK_EVERY_MS`;
    - the sources both ways, footer against brief, and the Wikidata and Natural Earth sentences, against `wikimedia.ts` (P846, exact label) and `still.ts`;
    - the `labelsPicked` clause, against the labels page's `reload || back_forward`.
    - On the base: 10 of 15 fail.
  - **Asserted only absence (R45-13):**
    - `r62bw-words` now asserts the Wikipedia and OpenAlex "Not asked / Not checked" lines whole, plus `notAnswered`'s three words.
    - `r62bw-words-species` asserts the archetype line and the Climograph's sentence whole.
    - `r63fd-words`'s check on code comments is replaced by `/about/how`'s median sentence, whole.
    - `r63fd-words` 52 and 71 already had positive assertions beside them, so they are unchanged.

### P5. The missing spaces, the doubled full stop, the genus summary

- **`today/+page.svelte`:** `{#if !inDemo()}{' '}or` ("Use my locationor").
  - `r62ba-words.test.ts`'s regex is updated with it.
  - The backup page ("which.Sync") is R's file: P-needs §3.
- **`compare/+page.svelte`:** `ended()` adds a full stop only when the words have none ("built..").
- **`species/[slug]/+page.svelte`:** the genus notice reads the record:
  - `error` status, or `detail` starting `error` → "did not answer";
  - `skipped` → "Not asked." and "was not asked";
  - otherwise "refused the request", through `notAnswered`.
  - The fixture's `refused: en.wikipedia.org 503` now reads "Wikipedia refused the request for the genus when this page was built."
- **Tests:** the source assertions above. No separate e2e.

### P6. Accessibility (R45-25, S-F12, S-F13)

- **Today's place headings:** a hidden `,` (`.sr`) after the place name. Chromium names the heading "Greenhouse , 2 growing".
- **Chip names:** `ToggleGroup.svelte` drops the `aria-label` and puts a hidden `, ` between label and count, so the name comes from the content (axe's label-content-name-mismatch). This covers My plants and Propagation. The front page's own chips are V's: P-needs §5.
- **The menu:** `aria-current="page"` on the current item; items and the example button are 44 px.
- **The add form's bars:** the pinned bar goes static, and `stickyacts` comes off, when it would take more than a quarter of the screen. The bar's own height decides, so this works whether the 200% comes from the browser's text size, a root font size or wrapping. The theme's `max-height: 30em` rule stays.
- **Italic names:** `padding-inline-end: .15em` on Today's chip names.
- **"Check names" says why it waits:** the import page is R's (P-needs §4).
- **Test:** e2e "P6": the menu's `aria-current`, item heights ≥ 44, and Today's heading named `Greenhouse ?, 2 growing`. It fails on the base build. The bar rule and the italic padding have no automated test (CSS).

### P7. Species page photo strip and failed-photograph credit (R45-8, S-A incidental)

- **`species/[slug]/+page.svelte`:**
  - Each strip photograph sits in a 72 px `.tb` box. On failure the image is hidden and its title (the credit) removed, via `failedBeforeHydration`, so a failure before hydration counts too.
  - The failed hero shows "The photograph's own page", no author or licence.
  - A Related tile's failed photograph hides its credit with it.
- **Test:** e2e "P7": all photograph hosts fail a second late, at 390 px.
  - The section menu has one position per frame for 2.5 s.
  - The strip keeps as many photographs as the server sent (6), each 72 px wide.
  - The failed hero's credit is the plain link.
  - On the base build: "Expected: 6, Received: 0".

### P8. The picker's answer in flight after "Add another" (R45-25)

- **`SpeciesPicker.svelte`:** an `ownValue` records what the picker itself put in the field (typed, picked, or its check's rewrite). A value set from outside bumps `reqGen` and clears the suggestions, the menu and the resolution, so a late answer for the previous name is dropped.
- **Test:** e2e "P8": `/api/names` answers 2.5 s late for "Notacactus ignotus"; Enter arms, then "Save and add another". After the late answer, no GBIF pill and no menu. It fails on the base: the pill appeared.

### P9. Labels restores its picks on a `back_forward` load too (S-E8)

- **`labels/+page.svelte`:** `nav.type === 'reload' || 'back_forward'`. The key is per tab and is cleared on a move inside the app.
- **Test:** source and sentence check in `r67p-about-seams`. No e2e: Playwright cannot produce Safari's restore of a discarded tab, and a Chromium history return is served from the back-forward cache.
- The owner's iPhone check stays.

### P10. The add form keeps the name check's room (S-E2, decision D5)

- **`SpeciesPicker.svelte`:**
  - The input row holds the menu, so the menu hangs from the field.
  - The pills and the line flow together in a `.status` block under the field.
  - `reserve` keeps three lines for it (`min-height: calc(1.4em * 3 + .5em)`). Only the add form passes `reserve`.
  - The service hints drop the trailing "a name typed in full is kept as typed and checked later" when a key was found or the pill already says "kept as typed", and the pill drops ", kept as typed" when the "Did you mean" line says it. With that, a pill and its line fit three lines at 390 px.
- **A pre-existing fault found on the way:** a name the reference's own search resolved while the name service failed showed "Not a reference name. Did you mean <the same name>?" under its GBIF pill. `checkExact` no longer unresolves a key it did not find, and `nearest` needs no key.
- **Tests:**
  - e2e "P10" for a known and an unknown name: the name check is held 1.2 and 1.5 s at 390×664. Every frame for 4 s, "Use my own number", Add and "More" each have one position.
  - On the base build the summary moved 585 → 615 → 705, and 585 → 686.
  - H's `tests/e2e/r67h-disclosure.spec.ts` disclosure 4 waits on this change.

### S8, client side: refusals said as refusals (S-D6, IND-7, R45-11)

- **`src/lib/ui/index.svelte.ts`:**
  - `sheetsOr`, `entriesOr` and `sheetForNameOr` return the map (or sheet, or `'none'`) or an `Unreached`: `{ failed: true, kind: 'refused' | 'limited' | 'unreachable', status, reason, retryAfter, at }`.
    - A 429 is `limited`. Any other non-ok status is `refused`, with the server's `error` sentence (cleaned, at most 160 characters) and `Retry-After`.
    - No answer, or a 409 twice, is `unreachable`.
    - Of several failed buckets, the worst is said, with the longest wait.
  - `waitLeft(u)` gives the seconds left.
  - `sheetsFor`, `entriesFor` and `sheetForName` keep their `null` contract as thin wrappers, for the pages that only need "reached or not", which belong to V and R.
  - This departs slightly from the letter of the triage ("sheetsFor/entriesFor return a typed failure"). Changing those two signatures would break callers in five files I do not own; the typed functions sit beside them under new names.
- **New `src/lib/ui/reach-words.ts`:** `unreachedClause(u, what)`, `againWords`, `waitWords`.
  - "the server refused the species sheets for now: this address has asked too often; it can be asked again in 30 s"
  - "the server refused the species sheets just now (the species sheets could not all be read just now)"
  - Only no answer is "did not answer".
- **Today (`today/+page.svelte`):** the stops' "not checked" line and its pill reason say why. "Check again" is `aria-disabled`, and does nothing, until the Retry-After is over, with a ticking label: "Check again in 30 s".
- **The home summary (`Today.svelte`):** "resting months not checked: <clause>".
- **Labels:** the notice's reason, the preview cell ("care line not checked: the server refused the sheets for now"), and "Try again" waiting out the Retry-After.
- **The plant page:** R's file; the diff is P-needs §2. No answer keeps its present words, so smoke 1099 stands.
- **Tests:**
  - `tests/unit/r67p-reach.test.ts` (8 tests): the kinds, reasons and waits from stubbed answers; the failed bucket let go; the wrappers' null; the words; the pages' wiring. 8 of 8 fail on the base.
  - `tests/e2e/r62a-interface.spec.ts` (its Today part is mine): the 503 case now expects "the server refused the species sheets just now".
  - smoke 1642 (a 429 on the labels) is H's: P-needs §7.

## Needs from others, applied in my copy

### S

- **`index.svelte.ts`:** `&v=<version>` on every reference request (S7). `corpus-client.test.ts` (mine) now strips `v` before its URL comparisons, and `r67p-reach` asserts that `v` is there.
- **`SpeciesPicker.svelte`:** `v=` on `/api/names`; GBIF's refusal (`refused: true`) said as "GBIF refused this site's request for names".
- **`service-worker.ts`:** the corpus cache keyed without `v`.
- **`frost.svelte.ts`:** `unanswered` alerts read again after five minutes.
- **`today/+page.svelte`:** NWS `refused` and `unanswered` worded apart.
- **`src/lib/weather/client.ts`:** `v=`, MET's refusal, five minutes for `unanswered`.
- **About pages, all nine:**
  - what Cloudflare keeps, with the version in the address, both lists;
  - the reserve felt sooner;
  - the places per network and the half-day record;
  - the fault counts, with Workers Logs off;
  - the /48 creation limit;
  - a network's share of the day's places;
  - the listing budget;
  - the unreadable pointer;
  - the sweep and the stalled revival;
  - photograph ids.
  - Wording adjusted in three places to pass the seam tests:
    - "a new site's forecast" (S's "a forecast for a new site" read as a forecast lifetime item);
    - "log batches" (a bare "batches" fails r62bw);
    - the 16 KB note moved to its own sentence after the limits (the parenthesis broke formats-doc's limits regex).
  - "since round sixty-seven" became "since October 2026", since the pages name no rounds.

**Not applied:** S's `species/[slug]/+page.server.ts` change. It imports `synonymAsk`, which only S's copy has, so my copy would not compile. Apply it at the merge, after S's `synonyms.ts` (P-needs §8).

### N

- **`/about/how`:** the common-name rule, search order, Ceropegia and the median-year rain lines, all of N's diff. The sources paragraph is merged with my Wikidata and Natural Earth sentences.
- **`/about/formats`:** the search paragraph.
- **`species/[slug]`:** the Related tile credit on two lines.
- **`r62bw-words.test.ts`:** the names-order sentence.

### R

- **`/about/formats`, all ten:**
  - the clock (two sentences);
  - the import key;
  - "already here";
  - the 2,000 lines;
  - the unsafe integer;
  - the import's place made at Check names;
  - older backups' parks;
  - Renumber;
  - `w` bounds;
  - the snapshot, the example's outbox and "(none in the example)";
  - a malformed change and a refused database;
  - Replace cut off;
  - the price with a space.
- **Not applied, because each needs R's code to compile:**
  - P-2, `settlePlaces('f-loc')` on the add form: `places-pending.ts` takes no argument in my copy. One line, at the merge.
  - P-3, Today showing `collection.failed`: the field is not in my copy. At the merge:

    ```svelte
    {#if collection.failed}<div class="notice err" role="alert" id="today-failed">{collection.failed}</div>{:else if !collection.ready}…{/if}
    ```

    This goes where Today says "Opening the collection…" (`today/+page.svelte`, line ~356).

### H and V

- H: no needs for me. H's `r67h-disclosure` disclosure 4 depends on my P10.
- V (read at the end):
  - **About pages (V §14):** all applied by hand. The seed's sentence is V's (I had first written one from the triage, then replaced it with V's). `cultifolio.demo.own` is added to the key list.
  - **V's code diffs for my files:** not applied, since they import V's new exports (`PAGE_IN_DEMO`, `addLeavesExample`, `CLOSED_WORDS`), which my copy lacks.
    - Applying cleanly on my copy (dry-run): `P-GrowLayer`, `P-IosFirst`, `P-Today`, `P-layout`, `P-plants-new`, `P-plants`, `P-species`, `P-sync`.
    - `P-today` and its test conflict with my P5 line. I rebased both into `/tmp/r67/P-needs/P-today.rebased.diff` and `/tmp/r67/P-needs/P-test-r62ba-words.rebased.diff`; V's version drops the `{#if}` before "or" altogether. Details are in P-needs.md, last section.
  - **keep-ask.ts:** switch `inDemo()` to `PAGE_IN_DEMO` at the merge.
  - **The scratchpad:** P's and V's scratchpad directory is the same path, and I wrote a `needs/` folder there around 18:05 (see P-needs.md).

## About-page changes others need from me

None: I own the about pages and made each change above.

## What I ran

### Unit tests, one file at a time

All pass, on the final state unless noted:

- **Mine:** r67p-keep-ask 9/9, r67p-takeover 10/10, r67p-reach 8/8, r67p-about-seams 15/15.
- **About and words:** r62w-about-seams 33/33, r61w-about-seams 9/9, r62bw-words 41/41, r62bw-words-species 6/6, r63fd-words 9/9, r62ba-words 6/6, r62w-words 32/32, r61w-words 16/16, formats-doc 6/6.
- **The rest:** corpus-client 3/3, r64f-persist 2/2, plus about 45 files touching the files I changed: config-r60, corpus-r60, forecast, frost-watch, hooks, hooks-r60, page-corpus, r60-*, r61*, r62bg-labels, r62bq-*, r62bs-*, r62g-labels, r62h-*, r62l-clock-marks, r62q-sheets-retry, r62s-*, r63c-climate, r63fv-example, r63u-csv-readings, sitemap and others. The full list is in my scratchpad `units.txt`; each passed.

### End to end

All in Chromium, port 4215, my own build, PW_REUSE.

- **`r67p-pages.spec.ts`:** 7 passed.
  - On a build of a base copy (in my scratchpad), all fail: P1 (7 asks), P3, P6, P8, P10 ×2, and P7 ("Expected: 6, Received: 0").
  - The last build predates the final about-page text edits and the needs applied after it. Those are text and CSS, checked by the unit seam tests.
- **Existing specs touching my code:** `r62a-interface`, `r62bq-picker`, `r62q-picker`, `r62ba-interface`, `r66y-engines` and `r64f-firefox` gave 79 passed and 1 failed. The failure was r64f 5, which asserted the old every-load ask; updated, it now passes.
- **smoke subset** (labels, Today, picker, species page, compare, menu, add form, unreachable reference; 42 tests): 40 passed. The 2 failures are expected and each has a need:
  - 582/623: exact `/api/sheets` URLs, now with `&v=`. S's need for H covers it.
  - 1633/1642: a 429 on the labels is now said as a refusal. P-needs §7 for H.

### svelte-check (`--threshold error`)

0 errors, 0 warnings (959 files).

My SW unit test first imported `src/service-worker.ts` statically. That pulled the worker's `no-default-lib` and `webworker` references into the whole program and gave 36 `Symbol.iterator` errors in the e2e specs. It now imports by a path the checker does not follow. The base also has 0.
