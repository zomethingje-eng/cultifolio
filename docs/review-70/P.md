# Round seventy, agent P: the WebKit flakes, the seam tests' method, and the audit of the about pages

This is the first pass: P1, the method of P2, the seam tests converted for sentences no agent changes this round, and the audit the second pass works from. The other agents' sentences are applied at the merge, in my second pass.

## Done

### P1. The two WebKit flakes (IND-8): the cause, found in Chromium

**What both flakes have in common.** Each leaves the plant form's species field just before Save is pressed. The species test types "Welwitschia mirabilis" and leaves the field. The 400-plant test fills the price, and that also leaves the species field: the form opens with focus in `#ed-name` (`focusNext`), and the backup's plants carry no `taxonKey`. In both cases the field's check (`SpeciesPicker`'s `onBlur`, 150 ms, then `checkExact`) answers 150 to 300 ms later, and its words appear under the field. The edit form's picker is not given `reserve`; the add form's has been since round sixty-seven (triage-66 P10). So in the edit form those words push everything below them down.

**Measured in Chromium.** Save is 36 px high.
- For the 400-plant case, with no key and a 502 from `/api/names` under `E2E_OFFLINE`, the words are the pill "name service not reached, kept as typed". Save moved 30.6 px.
- For the species case, the words are the pill "GBIF 5411106" and "The name service did not answer, so only the reference's own species are offered." Save moved 68.4 px.

**Why the press is lost without any error.** Playwright 1.63 checks only the first event of a click against its target. In `node_modules/playwright-core/lib/coreBundle.js`, the hit-target interceptor sets `result` once (`if (result === void 0 && point) result = this.expectHitTarget(...)`) and lets the later events through. So a press that lands on Save before the words arrive, and is released after them, is released on something else (the Place row). No click reaches Save, nothing is saved, the form stays open, and the assertion times out at WebKit's 10 s (`WEBKIT_PACE`). A retry with different timing passes. Chromium's clicks finish before the answer. On a scrolled phone page Chromium's scroll anchoring holds Save in place. As far as I know, Safari's engine does not anchor scrolling by default.

**It is a fault for a grower too.** A tap on Save as the check answers saves nothing. This is the add form's P10 fault, on the edit form.

**Tests.** `tests/e2e/r70p-save-moves.spec.ts` (3 tests, `@phone`) makes the race happen every time. It holds the answers from `/api/names` and `/api/search`, presses Save, releases the answers, waits for the words, then releases the press.

Failures on the base, Chromium desktop, all three:
- the price case: "expect(locator('.editform')).toHaveCount(0) … Received: 1";
- the species case: "h1.sci … Received string: "2026-0001 Copiapoa cinerea"";
- the measure: "Save moved from y=582.140625 to y=650.5625 … Received: 68.421875".

On the Chromium phone the measure fails ("Received: 87.3125"). The two press tests pass there because of scroll anchoring; phone-webkit is where they count.

With the need below applied, all six passed (desktop and phone). With `reserve` alone, the desktop's three passed three runs over, and the phone's measure still failed (18.3 px).

**Recording the Save in the test.** This is for the owner's `--browsers=all` run.
- `tests/e2e/helpers/save-trace.ts` records, in the page:
  - each pointerdown, mousedown, mouseup and click, with where it landed and where Save was at that moment;
  - each change of the check's words, and each move of Save, with its cause;
  - the submit, with the IndexedDB transactions open at that moment;
  - the Save's promise (Save's `aria-disabled` is true from the press until the write settles);
  - every IndexedDB write: its stores, when it was asked for, when it ended and its request count;
  - the timings of the check's requests;
  - the form closing.
- Smoke's two tests now call `traceSave` and `markSave`. An `afterEach` in smoke attaches the record as `save-trace.json`, with a one-line reading as an annotation, only when a test fails or is a retry. A passing first run adds nothing, and nothing is printed to the console.
- I checked it on a failure forced in Chromium. The annotation read: "pressed on Save at 2828 ms; released at 3106 ms on div.wide "PlaceNo place New…", not Save (Save then at y=650.6, pressed at y=600); the click went to form.cult.editform …; Save moved 62.3 px at 2961 ms (the check's words: "The name service did not answer…"); never submitted; the form did not close".
- `playwright.config.ts`: the webkit and phone-webkit projects keep a trace of each failed test (`retain-on-failure`, with snapshots and no screencast, since a screencast slows the engine being timed). `PW_WEBKIT_TRACE` names another mode.
- `scripts/predeploy.mjs` says where the traces are when a run that included WebKit fails.
- Smoke's two tests still pass in Chromium with the recorder in place.

### P2, first pass: the method, and the seam tests converted

**The method.** `tests/about-pages.ts` reads a page as a visitor reads it: no markup, entities read, and each character tied to its source line.
- `said(page, opening)` returns the one sentence that begins with those words, and fails if they begin none or more than one.
- `claim`, `numberWord` and `spanWords` read the figure, the example or the span out of that sentence.
- The test then runs the code on that case.

So a changed figure on either side fails the test, and rewording the rest of the sentence does not.

**`tests/unit/r70p-about-seams.test.ts`** has 26 tests:
- The cookies, run through `units.set` and `site.set` with a stub document. The count "Two" and the paths ("species and compare") are read from the sentences.
- The framework's session keys.
- The browser's HTTP cache. Each item and its lifetime are parsed from the clause and compared with each route's lifetime.
- The reload under a new version: `onTakeOver` and `onArrival` run at the sentence's "four seconds" and either side of it, with something typed and with a write in flight.
- The "keep data" month: `askToKeep` run against the month the sentence gives, and once per page.
- Hover preloading.
- The requests after a failed move between pages.
- Natural Earth.
- The labels page's picks.
- The front page's 48 genera, eight photographs and twelve a day.
- The 173 genera.

The restore fixtures in `r62w-about-seams` now read their sentences the same way. The converted tests left `r67p-about-seams` (15 tests down to 2) and `r62w` (the genera). All five seam files pass: 83 tests. So do all 24 unit files that read the about pages: 256 tests.

**What the old tests missed.** Each of seven mutations failed the new file:
- "first four seconds" changed to "five";
- the units cookie's path changed;
- "Two small cookies" changed to "Three";
- "waits a month" changed to "a week";
- 48 genera changed to 40;
- the early reload no longer checking for writes in flight;
- the rows route's lifetime changed to an hour.

The old files had no check for two of them, the writes in flight and the front page's figures.

**Two sentences corrected in this pass.** The audit found both, and no other agent changes them. Both new tests failed on the base and pass now.
- H115, the map marker. The page said "the centre of the nearest tenth-of-a-degree cell". `habitatCentre` takes the cell that holds the population's middle, and moves 0.01° north when a restricted record lies exactly there (`geo.ts:178-184`). The page now says so. The test runs `habitatCentre` with the sentence's "a hundredth of a degree north".
  - Failures on the base: "the sentence no longer says /moved (a hundredth…) of a degree…/" and "expected 'When no openly licensed record lies i…' to match /the centre of the tenth-of-a-degree cell that holds the population's middle/".
- H173, Related's rain distance. `climateDistance` takes the log of the rain plus 1 mm (`Math.log1p`). So "a factor of 2.7 in a month's rain counts as three degrees" holds only in a wet month: 1 mm against 2.7 mm counts 1.85. The page now says that, with both cases. The test runs `climateDistance` on the factor and the two cases the sentence gives.
  - Failures on the base: "the sentence no longer says /each month's rain plus (\w+) mm/" and "expected null not to be null".

**Left for the second pass.** These tests stay as they were, because their sentences change this round:
- `r61w`: the recount hour (W), parking by arrival and the clock's slack and snapshot key (R), "sync bundle" (W2), the rank markers (N2), imported names (R3).
- `r62w`: 600 calls, a tenth, four tenths, 90 days, 30 s and an hour (W); two days, five minutes and the waiting counts (R2); the marked change and own-change fixtures (R2).
- `r67p`: the Wikidata sentence (B2).
- `r69p`: the photographs' addresses and the Commons sizes (C5); the cached 404 and 302 (N, F1); the sweep and listings (W4); the example's one commit (X3).

These read code and page both ways and stay as they are: the storage keys, IndexedDB, lock and channel names, the hosts, the `/api` requests, the edge-cache table, the Worker's cache keys and `persist()`.

### P2, the audit

The appendix lists every sentence of both pages, grouped where neighbours share a status. A sentence is numbered H*n* or F*n*, counted in the page source with its line. For each, it gives the code that keeps it (marked "checked" where I read the code against it this pass, and "not re-read" otherwise), or "not kept" with the evidence, or the agent and item that change it this round.

**Faults found besides S-F9 a to h:**
- H115 and H173, corrected above.
- F148: "A fresh snapshot is written after a load that folded more than 1,000 changes". The code writes one at 1,000 or more (`>= FOLD_REFRESH`), and after every load that read the whole log. This is R's area, for the second pass.
- `routes/propagation/new` also has a `SpeciesPicker` with no `reserve` above "Start batch". It is suspected of the same fault and was not measured.

S-F9's eight faults are in the appendix at H46 (a, h), H61 (b), H57 to H60 (c), H55 (d), H15 (e), H75 (f) and F337 (g). Each is in an area another agent changes this round.

## Needs

1. **`src/routes/plants/[acc]/+page.svelte`**, line 676. No agent owns this file this round, so the change is for the merge:
   ```
   -      <label><span>Species</span><SpeciesPicker bind:value={f.taxonName} bind:taxonKey={edKey} id="ed-name" /></label>
   +      <label class="wide"><span>Species</span><SpeciesPicker reserve bind:value={f.taxonName} bind:taxonKey={edKey} id="ed-name" /></label>
   ```
   Why: `reserve` alone kept Save still on the desktop (a third of the row), but on the phone the words took more than three lines of a half-width column and still moved Save 18 px (measured). With the full row and the room kept, Save moved 0 px on both.
   - Effect in Chromium: the species field spans the form's first row, with the room for its words kept under it.
   - Tested: `r70p-save-moves` passed 6 of 6 with the need applied.
   - A run of the edit-form specs with the need applied: 31 passed, among them `r62l`, `r67r`'s "the Edit form's Save pressed twice … saves once" and "the Edit form's unsaved new place is not made", and smoke's keyboard-menu and "every control has a name" tests.
   - The 11 that failed did so in setup or before any edit form: "Target crashed", "Page crashed", a 110 s warm-up GET, and "setting up "page"". Eight agents share one 8 GB machine. Four of smoke's edit-form tests did not run after a warm-up failure.
   - To run at the merge: smoke's eight edit-form tests, `r61l`, `r67h-places` and `r70p-save-moves` on the phone.
2. **X, `src/routes/propagation/new/+page.svelte:268`:** consider `reserve` on its `SpeciesPicker`. This is suspected of the same fault and was not measured.
3. **For the second pass, R's area**, F148:
   - Replace "A fresh snapshot is written after a load that folded more than 1,000 changes on top of it, after an import, …"
   - with "A fresh snapshot is written after a load that read the whole log, after a load that folded 1,000 changes or more on top of it, after an import, …"

## Measured

- The movement of Save when the check answers, measured in Chromium: 30.6 px for a pill, 68.4 px for a pill and a line on the desktop, and 87.3 px on the phone.
- With `reserve` alone the phone still moved 18.3 px. With the full row and `reserve`, it moved 0 px.

## Not done, and the decision departed from

- The triage says "the fix follows what it shows": the owner's trace. I found the cause in Chromium instead, and wrote the fix as a need, because the file is not mine. The recording stays in place so that the owner's next WebKit run can confirm it.
- In the first pass, whole-project `tsc`, `svelte-check` and the full unit suite could not run for lack of memory. They ran in the second pass (see its Checks).

## Second pass: P3 and P4 (R47), and the need applied

### The need for the plant page, applied in this copy

`src/routes/plants/[acc]/+page.svelte:676` now has the species field across the form's first row, with the room for its words kept (`class="wide"`, `reserve`). With memory to spare this time, `r70p-save-moves` passed on desktop and phone. So did smoke's eight edit-form tests and `r62a`, `r67h`, `r67p`, `r60 14` and `r69p-alerts`: 38 passed and 26 passed in two runs, with nothing failing.

### P3. The "keep data" question and the harness (R47-19, R47-20)

**Asked from the first plant's commit.**
- `keep-ask.ts` has a new `keepOnFirstPlant(collection, answerSaid)`. It listens to the collection's commits (`onLocalChange`). A commit that writes a plant asks the browser, on the page that wrote it, through the same door and within the same month as every other ask. It does not ask once GrowLayer has said an answer on the device.
- Before, the question waited for a page to finish reading the collection (the load's ask) or for the plant's page to be drawn (GrowLayer's ask). A grower who moved on within a second was never asked, and neither was a loaded WebKit or Firefox run.
- A second ask for the first plant on the same page is now handed the first ask's answer rather than null. So GrowLayer, which says the answer, still says it, and still nothing is asked twice.
- The layout registers the listener. It also sets `data-collection="open"` on the page once the collection is read, which the tests can wait for.
- `tests/unit/r70p-keep-ask.test.ts` (3 tests). On the base all three fail with "keep.keepOnFirstPlant is not a function". They pass now.

**The tests wait for the collection, not a fixed time.**
- `r67p-pages:21` waited a fixed 1.2 s on each page. It now waits for `data-collection` on each of its six pages.
- `r60-grow:465` already waited by polling. Its failure was the missing ask, which the commit now makes.
- Both pass in Chromium.

**`limitAddress`** (`tests/e2e/helpers/address.ts`) now mixes in the retry and the repeat index (`p + 8 × retry + 64 × repeatEachIndex`). A retry no longer comes back to an address whose five new vaults the failed attempt spent. `tests/unit/r70p-limit-address.test.ts`, on the base: "expected '2001:db8:cbc3::1' not to be '2001:db8:cbc3::1'" for a retry, and "expected 5 to be 45" for 5 projects × 3 attempts × 3 repeats. Both pass now.

**The two flaky WebKit tests, examined.**
- `r62a-interface:158` (select mode at 390). After each Tab the test waited a fixed 150 ms, then checked whether the focused tick box was under the select bar. The app moves the page one animation frame after the focus (`keepFocusClear`). Under load a frame can take longer than 150 ms, and then the tick was measured before the move. The test now waits two animation frames from the press, which always comes after the move, however slow the engine. This is likely the cause; I could not run WebKit to confirm it.
- `r67h-disclosure:52` ("Use my own number" while the name check answers late, phone-WebKit). In Chromium at 390 × 664 nothing moved with the two answers in all four orders, nor with the typeface delayed by 2.5 s. I found no cause. Two candidates, both specific to WebKit:
  - a typeface landing during the recorded window;
  - the check's words taking more than the three lines kept for them under WebKit's text metrics.

  The test now waits for `document.fonts.ready` before it starts recording. If it still fails, the failure message and an annotation record the moves, the words, the room kept and the room taken, and the state of the typefaces when recording began. That reading is the owner's next all-engines run.

### P4. The weather alerts outside the states (R47-12)

**Who is asked.** `weather/forecast.ts` `isUS` now asks the National Weather Service for Puerto Rico and the US Virgin Islands, Guam and the Northern Mariana Islands, American Samoa, and the Aleutians west of 170° W across the antimeridian to Attu.
- The NWS answered 200 on 2026-10-12 for San Juan, Charlotte Amalie, Hagåtña, Saipan, Pago Pago, Amchitka (173.2° E) and Atka (173.18° W).
- The triage named four places. I added the Northern Mariana Islands and American Samoa because the NWS covers them too.
- Adak answered 500 twice that day; it is inside the new box.

**A point the NWS does not cover.** A point inside a box but outside the NWS's area (Toronto 43.7, −79.4; Chukotka's tip at 66.0, −169.8, which the Alaska box already held) gets 400 "out of bounds" from the NWS.
- The route read that as "the National Weather Service did not answer".
- It now reads it as no alerts service for that point (`n/a`), through a new `nwsOutOfBounds`, and does not credit the NWS.

**What the place page says.**
- The place page says "All clear." and "frost: clear" only when the alerts were read (`alertsRead`: `ok` or `none`, in `ui/alert-words.ts`).
- When no service was asked (`n/a`, or a forecast carrying no status), a clear forecast says "Forecast clear." with the pill "forecast clear", and the sentence "No weather alerts are read for this place: this site reads them only from the US National Weather Service, which does not cover it."
- Today never said "All clear." and is unchanged.
- `/about/how` H229 now names the territories and says that a place the NWS does not cover reads "Forecast clear.", never "All clear.". That sentence is mine, and its test drives `isUS` with each place it names.

**Tests.**
- `tests/unit/r70p-alerts.test.ts` (17 tests: the places, the "out of bounds" reading, the route for San Juan and for Toronto, the words, the sentence). On the base, 14 of the first 16 failed, for example: "expected 'unanswered' to be 'n/a'", "expected [ 'api.met.no' ] to include 'api.weather.gov'", and "nwsOutOfBounds is not a function". The other two are guards and pass on both. The seventeenth, the H229 sentence, was added after the base run.
- `tests/e2e/r70p-alerts.spec.ts` (2 tests, `@phone`). On the base: "Expected substring: "Forecast clear." Received string: "All clear. No frost in the next 48 hours…"". It passes now.

### Checks

- `svelte-check --threshold error`: 0 errors over 1,062 files.
- `tsc` over the changed TypeScript files: clean.
- The 27 unit files that touch these modules and the about pages: 341 passed.
- The full unit suite: 312 files, 2,747 passed and 1 skipped.

### Needs from this pass

None in other agents' files. The H229 sentence above is already applied.

## P2: the about pages at the merge (in `(scratch)`)

All seven agents' sentence needs are applied (the second pass winning where it replaced the first), with my F148 and audit findings. I checked each replacement against the merged code. Sixty-six sentences or clauses changed: 21 on `/about/how` and 25 on `/about/formats` by replacement, plus H115, H173 and H229 from my own passes, which the merge already carried.

### `/about/how`, every sentence changed

Each is named by its opening words, with the agent and item behind it.

**Names (N, B).**
- "The name and its synonyms…": gains "a name other species of the reference hold too is said as that, and never as a name the backbone accepts as this species" (N, F1).
- "Names are put in order…": "then the alphabet, as GBIF lists a species' names (capitalised spellings before lower-case ones)" becomes "then the order in which GBIF's list gives the names, which is not always the alphabet". This is mine, S-F9e. `englishNames` sorts by place in GBIF's list, never by letter.
- "Of a name's spellings…": the spelling ties (N4).
- "The native range comes from…": the author rule and gender endings (B4). "A name Kew holds no entry for, by those rules…" (B4).
- "Wikidata and iNaturalist are asked the same way…": the answer is "one item (or items that name one basionym, which are one plant: the one Wikidata links to iNaturalist is taken) or one taxon". This is mine: B6 applies the basionym rule in the older-names step too (`wikimedia.ts`), and B's need named only the label step.
- "From iNaturalist a taxon is taken only…": B7.

**Photographs (C, N).**
- "A Commons file's author is…": C3, with C7's additions.
- "A Commons file is shown only as…": now three sentences (C1, C6, C7), with C's second-pass kinds sentence and its older-name clause put in place.
- "Of the rest…": C5.
- "The lead photograph…": C7.
- "A Commons photograph is loaded at…": the sizes, now two sentences (C5, C7, N).

**Summaries, identifiers and search (A, B, N).**
- "An article Wikipedia reaches through a redirect…": A1, with A2's clause.
- "The species' identifiers in other databases…": B2, with B6's three changes.
- "Every iNaturalist taxon id…": B1, B5, B7.
- The search's older-name order and family rule (N2).
- "A species address under an older name…": F1, N3.
- The "not found" lifetime, in both cache lists: "not at all (not kept) when GBIF could not be asked or a species' record could not be read" (N). The full-detail list was not in N's need; the code (`records.every(Boolean)`) keeps it true in both.

**The example's key (X).** `cultifolio.keepDraft`, from X's second pass.

### `/about/formats`, every sentence changed

**Records, backups and the snapshot (R, P).**
- `importKeyBare` is listed (R7). `formats-doc` is green again.
- The unreadable changes of a backup, and Replace's refusal (R4, R6).
- "A fresh snapshot is written after a load that read the whole log, after a load that folded 1,000 changes or more on top of it…" (mine, F148).
- The snapshot's validity (R1), with R's second-pass "more than a day".

**The clock (R).**
- "At a page load after the device clock has moved at least the correction…" (R5).
- The removal and edit past held stamps, in both places (R2).
- A page's wait is its own (R2).
- "a day or less / more than a day" in both places (R5).

**The example (X).**
- The open lock taken by the first script (X1).
- The commit refused over anything of yours (X3).
- Keep and the containing place (X2).

**Sync (W).**
- The 429 sentence (W2).
- The listing hour in any sixty minutes, with the reservation's lapse (W4, W6).
- The hour of uploads, counted apart and when the upload is taken (W6). This also settles R47-13's "writes an hour".
- "its next removal by a device holding its proof" (W3).

**Search and dossiers (N, C).**
- The search's older-name order and family rule (N2).
- The dossier's `categories`, `struck` and `specimen` (C2, C7).

**The import (R).**
- 05/01/24, the year last (R3).
- "A date like 09/03/2024 or 05/01/24…" (R3).
- An answered cell keyed by the day it reads, and the short year (R7).
- £12.50 (R3).
- The lost column and `importKeyBare` (R7).

### Supplied sentences I corrected, and why

1. **C's sizes sentence.**
   - "500 on a gallery tile": no gallery tile asks for 500. The compare page loads the 500 the dossier keeps (`c.hero.thumb`). It now reads "500 on the compare page".
   - C's first-pass "…or Commons gave no smaller version of it, when it is shown as uploaded", and its second-pass "…loaded at Commons' 250 or 120 where the place needs no more", did not fit together, and the second is untrue. A 400-pixel original is loaded at 250 in a 500-pixel slot too (`commonsTileOf`, then `shownAt` and `photoAt` of that tile). The text now says:
     - 501 to 960 pixels: shown at its own width;
     - 500 or narrower: at Commons' largest version below its own width, 250 or 120;
     - whole only at 120 pixels or less, or when its width is not known (`commonsTileOf`);
     - no smaller version from Commons: shown as uploaded.
2. **A's summary sentence.**
   - "one of its older names" becomes "one of its older names at species rank": `nameMatch` skips an older name below species.
   - "a product of this species and of no other plant" becomes "naming no other plant but its genus": `proofByItem` lets the species' parent through, as "Apple" names Malus.
3. **C's lead sentence.** It ends "…no photograph of a living plant from iNaturalist or GBIF": GBIF's specimens now rank below Commons.
4. **C's credit sentence.** C7 made "(talk)" count anywhere, not only bare, and added "Photo by X", "Photograph by: X" and "[1]" link marks. Its first-pass text said "a bare "(talk)"", and it now names all three.
5. **B's older-names sentence (H31).** It needed B6's basionym exception, which B named only for the label step.
6. **C's dossier sentence.** It now sits inside the `licence` parenthesis, where C asked for it, and names C7's `specimen`, which C's sentence predates.
7. **R's snapshot sentence** reads "more than a day", by R's own second pass. **W's listing sentence** carries W's second-pass lapse clause.

### R47-13

- **"Writes an hour".** W's sentence now says each kind is counted when the upload is taken, a failed upload included. `r70p-about-rules` drives `Counters.take` with 'photo' and 'log':
  - `wp` is 1 at the take;
  - `w` is untouched;
  - at 3,600 photographs the next photograph is `spent` and a log batch still `ok`.
- **"Instance of taxon".** B6 made the test real (`isTaxonItem` reads P31's `.id`). The sentence says "each a taxon by what Wikidata says it is", and the test drives a taxon and a print.
- **Which slot gets which size.** Each slot the sentence names is read with its width, and checked two ways: the call that loads it in that file (`photoOf(hero, 'large' | 'medium')`, `photoAt(c.thumb | p.thumb, 'small')`, `photoAt(r.thumb, 'square')`), and `photoAt`'s Commons width for that size.
- **`workerKey`.** The test reads every `cache.put` and `edge.put` in the server's code: six files, found by walking for `caches.default`, not named in advance. For each, it reads the key's own definition and requires `workerKey(`. The page cache in `hooks.server.ts` builds its own key; the test requires that key to carry `?v=${encodeURIComponent(version)}`, which the page's sentence states.

### The seam tests

**New: `tests/unit/r70p-about-rules.test.ts`, 25 tests.** Each reads a sentence's claim and drives the rule with its case:
- Wikidata: the five answers, the five keys, the print, and Peperomia monticola Miq. refused by Hooker's IPNI.
- Summaries: Huernia zebrina by basionym, Apple against Plum, Welwitschia at one species and at two, Drosera tomentosa refused as a sitelink, Venus flytrap taken. "What the article's opening says is never taken as proof" is checked against `summary-proof.ts`, which reads no extract.
- Commons: "Mammillaria mabudae" shown on M. matudae, "Echinocereus schereri" not, Babiana whole and cut, and the year and hybrid rules.
- The slots and the original's widths.
- The cache keys.
- The upload hour.
- iNaturalist's own names.
- GBIF's order of English names.
- The clock's day and two days.

These sentences did not exist on the base, so every claim there fails, for example "the sentence no longer says /the items in the first (\w+) answers to the name/".

**Converted to the method in place.**
- `r61w`: the recount hour, parking by arrival (driven through `isParked` either side of the span), "sync bundle", the clock's slack and the snapshot's key, the rank markers both ways against `RANK_MARKERS`, and imported names.
- `r62w`: 600 calls, a tenth and four tenths; 90 days; 30 s; the hours; two days; five minutes and half a minute; and, from the first pass, the restore fixtures.
- `r69p`: the 404 and 302 lifetimes in both lists, the sweep's five thousand and seven nights, and the example's one commit.
- `r67p`'s Wikidata pin and `r69p`'s Commons sizes and "own size" tests are removed; `r70p-about-rules` reads both now.

**The three red tests.** All pass: `formats-doc` (by listing `importKeyBare`), `r67p-about-seams` and `r69p-about-seams`.

### Runs (M)

- `svelte-check --threshold error`: 0 errors over 1,098 files.
- The whole unit suite: 340 files, 3,180 passed, 1 skipped, none failed.
- The about-page browser specs under the lock (port 4308), Chromium and the phone (r62bw, r62w, r63v, r63u, r63fv, r67h engines, r69p disclosures, and the about, privacy and source tests in smoke, r62a and r61g): 74 passed.

### Not done

- `docs/REVIEW-TRIAGE-69.md` in M still lacks section 7; that is the merger's or the owner's.
- Sentences on the pages that no agent named, and that the first-pass audit marked "not re-read", were not read again this pass.

## Appendix: the audit of `/about/how` (H) and `/about/formats` (F)

The pages' sentences are numbered as they fall in the page source (H0 to H273, F0 to F338; headings, the navigation and the style sheet are left out). Neighbours with one status are grouped; each group gives its first and last sentence's opening words and its lines. "Checked" means read against the code this pass; "not re-read" means the code named was not read against the sentence this pass. A long sentence of the full detail (H225, H233, H235, H237, H244) is one entry; its clauses' tests are named.

- H3 (line 25; “Each species page is built ahead…”): kept: the footer's source list (+layout.svelte) and the build's sources; r67p-about-seams reads both lists both ways.
- H4 (line 26; “Nothing about a species is written…”): kept: rule 1; the templates are src/lib/core/sheet.ts and the page files (H89 to H93); not re-read this pass.
- H5 (line 27; “A source that did not answer…”): kept: NotChecked.svelte and the upstream statuses (refused, unanswered, not asked); not re-read.
- H6 (line 28; “Your own plants are kept in…”): kept: the log leaves only by sync (sync/*) or a backup (backup/*); the catalogue lookups are H200 to H203.
- H7 (line 29; “No accounts, no analytics, no third-party…”): kept: CSP connect-src 'self' (r61w-about-seams), no analytics script in src; the code is open (H271).
- H10 (line 36; “A species page is assembled from…”): kept: each section credits its source; not re-read.
- H11 (line 36; “The name and its synonyms, family…”): kept: sources/gbif.ts (B's file; B1 and B2 do not change the follow to the accepted name); not re-read.
- H12 to H14 (line 36; “The common name shown is one…” to “Spellings of one name (case, hyphens…”): kept (N's area: dossier/index-entry.ts, core names): one GBIF row read as a list, spellings counted once; N4 may reword; not re-read.
- H15 (line 36; “Names are put in order by…”): not kept (S-F9e): englishNames keeps the dossier's row order, not the alphabet; changing in round seventy: N (N4).
- H16 to H17 (line 36; “"Lace aloe", "Autumn crocus", "Zebra haworthia"…” to “Capitals are not read, so a…”): kept (N's area): the genus-word rules of index-entry.ts; not re-read.
- H18 to H21 (line 36; “Of a name's spellings, one without…” to “So "Butterfly milkweed" is shown over…”): changing in round seventy: N (N4, a tie between spellings takes the commoner spelling, then lower case).
- H22 to H25 (line 36; “The first letter is shown as…” to “The species page shows the first…”): kept (N's area); not re-read.
- H26 to H27 (line 36; “The native range comes from the…” to “Names are compared without the hybrid…”): kept: sources/gbif.ts and the WCVP reader (B's area; B4 reads the author rule on the species' own name); not re-read.
- H28 to H30 (line 36; “A name Kew holds no entry…” to “A range found so is taken…”): changing in round seventy: B (B4: the author rule on the species' own name, gender endings through spellingKey).
- H31 (line 36; “Wikidata and iNaturalist are asked the…”): changing in round seventy: B (B2: an item proved by its IPNI identifier, found by IPNI).
- H32 (line 36; “From iNaturalist a taxon is taken…”): changing in round seventy: B (B1: a followed iNaturalist id is taken only under the name rule and heldElsewhere).
- H33 (line 36; “GBIF's synonyms are read to the…”): kept: GBIF synonyms read to endOfRecords (gbif.ts; S-F checked M4); not re-read.
- H34 to H36 (line 36; “Regions where WCVP records the plant…” to “Kew's own one-line descriptions of a…”): kept: build.ts (extinct regions, national checklists, Kew descriptions quoted); not re-read.
- H37 to H40 (line 36; “Occurrence records come from GBIF.…” to “Daily temperature extremes come from NASA…”): kept: the build's sources (climate/grid.ts 0.05° grid, ETOPO, power.ts); not re-read.
- H41 (line 36; “Photographs come first from the media…”): changing in round seventy: C (C1 kinds, C3 credits, C5 lead width); the licence list is core/licence.ts.
- H42 to H43 (line 36; “A photograph in the public domain…” to “Commons' licence is read only from…”): changing in round seventy: C (C3; core/licence.ts and commons.ts licence names).
- H44 to H45 (line 36; “A Commons file's author is its…” to “X assumed" names X.…”): changing in round seventy: C (C3: signatures, "Uploaded by", unfilled templates).
- H46 to H47 (line 36; “A Commons file is shown only…” to “"Othonna cakilifolia" for Othonna cakilefolia).…”): not kept (S-F9a: the one-letter clause reads a slip only at seven letters, "ae" as "e" and any hyphens; S-F9h: "media from GBIF" hides a file and is not in the list); changing in round seventy: C (C1).
- H48 (line 36; “Of the rest, files whose name…”): changing in round seventy: C (C1, names read as pairs).
- H49 (line 36; “The lead photograph is iNaturalist's wild…”): changing in round seventy: C (C5: a lead of at least 500 pixels preferred within a rank).
- H50 to H51 (line 36; “On a species page and on…” to “CC BY, Jane Doe"), and names…”): changing in round seventy: C (C3, C4: the tile credit and the index count).
- H52 to H54 (line 36; “A Commons photograph is loaded at…” to “It is never loaded as the…”): changing in round seventy: C (C5: the strip and the related tiles load the small size); r69p-about-seams reads the widths.
- H55 (line 36; “One whose page holds no such…”): not kept (S-F9d): commonsPhoto keeps the original when Commons gives no thumbnail, and shownAt returns it at any width when the width is unknown; changing in round seventy: C.
- H56 (line 36; “A credit whose author's line names…”): changing in round seventy: C (C3).
- H57 to H60 (line 36; “The summary is the opening of…” to “A summary quoted from under another…”): not kept (S-F9c; IND-2); changing in round seventy: A (A1, positive identity only).
- H61 (line 36; “The species' identifiers in other databases…”): not kept (S-F9b: the plant-kingdom condition, the first three GBIF keys, five label hits unstated); changing in round seventy: B (B2).
- H62 (line 36; “Every iNaturalist taxon id, from Wikidata…”): changing in round seventy: B (B1).
- H63 (line 36; “When Wikidata does not answer, the…”): kept: CARRY_DAYS = 90 (S-F checked M7); not re-read.
- H64 (line 36; “The coastlines of the maps on…”): kept: map/still.ts, static/maps; driven in r70p-about-seams.
- H65 (line 36; “Recent literature comes from OpenAlex.…”): kept: OpenAlex is the literature source; not re-read.
- H67 (line 38; “The species list was derived, not…”): kept: scripts/specialist-genera.txt holds 173 (r70p-about-seams reads the figure from the sentence); the 2,500 cultivated species not re-read.
- H68 to H71 (line 38; “The very large genera are not…” to “So a species that is not…”): kept: the build's species list; the "9 species" of Aloe is a corpus figure, not re-counted.
- H72 (line 39; “The front page's photographs and its…”): kept: routes/+page.server.ts featuredPool (48 genera, eight photographs, twelve a day; r70p-about-seams reads each figure); the photograph count is the index's, which C4 changes.
- H73 (line 39; “On a phone the strip of…”): kept: FEATURE_AFTER in routes/+page.svelte; not re-read.
- H74 (line 40; “The catalogue's search puts a query's…”): kept (N's area: core/search.ts).
- H75 to H76 (line 40; “First a name typed as a…” to “Within each, a name that is…”): not kept (S-F9f: "the one that shows the name among its six" ranks a variety first; the family rule, S-F6); changing in round seventy: N (N2).
- H77 to H78 (line 40; “Apostrophes are taken out of a…” to “Every older name the backbone gives…”): kept (N's area: core/search.ts, postings.ts); not re-read.
- H79 (line 40; “A species address under an older…”): changing in round seventy: N (F1: a name two species hold never redirects; N3 hyphenated older names).
- H80 to H88 (line 40; “When the reading as a botanical…” to “Showing results for …" when the…”): kept (N's area: core/search.ts readings, X-Search headers); not re-read.
- H89 to H93 (line 43; “Nothing about a species is written…” to “No row says what a plant…”): kept: rule 1; sheet.ts templates and the species page; not re-read.
- H95 to H98 (line 46; “Sources rate-limit, time out and go…” to “A source that refused is said…”): kept: NotChecked.svelte, the statuses refused / unanswered / not asked; not re-read.
- H99 (line 46; “A source that answered with two…”): kept: upstream.ts "not taken: two items answered" (S-F checked M8).
- H100 to H101 (line 46; “The corpus build keeps what a…” to “What is carried is exact: literature…”): kept: the build's carry rule (build.ts, rederive.ts); not re-read.
- H102 (line 46; “A species page whose stored data…”): kept: routes/api/dossier and the species page answer 503 with no-store for a listed key that cannot be read (checked).
- H103 (line 46; “On Today, when the species sheets…”): kept: routes/today SHEETS_WAIT_MS = 15_000 (checked).
- H104 (line 46; “The same rule applies in the…”): kept: sheet.ts derives nothing without a habitat climate; not re-read.
- H106 to H109 (line 49; “A species' records on GBIF include…” to “Restricted-licence records (CC BY-NC) inform the…”): kept: build.ts record filters; not re-read.
- H110 (line 49; “Three agreeing records are enough for…”): kept: thin is fewer than 12 records (build.ts:538, checked); "three agreeing records" is the three-cell minimum of H122.
- H112 to H114 (line 52; “The marker on the map is…” to “Inside the winning cluster the densest…”): kept: core/geo.ts densestCluster (half the records or twice the runner-up, 1° then 2° and 4°) and habitatCentre (checked).
- H115 (line 52; “When no openly licensed record lies…”): not kept on the base: the marker is the centre of the tenth-degree cell holding the population's middle, moved 0.01° north when a restricted record lies on it (geo.ts:178-184); corrected in this pass, tested in r70p-about-seams.
- H116 (line 52; “The climate is not read at…”): kept: the climate is read across the cells (provider.ts).
- H118 to H122 (line 56; “The habitat climate is read across…” to “Three land cells are the minimum…”): kept: climate/provider.ts (10 km or a person's observation to three decimals, build.ts:319; land by the elevation layer; three or more cells and a fifth for a split; three land cells; checked).
- H123 to H128 (lines 56 to 57; “For each month and each variable…” to “Extremes need daily data, which CHELSA…”): kept: provider.ts and climograph.ts (median and 10th to 90th percentiles; per-cell annual totals; DLI at 2.07; checked the DLI factor).
- H129 (line 57; “That typical spot is the cell…”): kept: provider.ts, up to eleven further candidates within 2 °C (byNearness.slice(1, 12), checked).
- H130 to H134 (line 57; “The position printed for that cell…” to “A series is used only if…”): kept: core/extremes.ts (1st and 99th percentiles, LAPSE 0.0065, twenty years at 95%, checked).
- H136 to H142 (line 60; “Two fixed rules read the median…” to “None of this says when the…”): kept: core/sheet.ts yearOf (70%, half a degree, eight months, 4 °C, 120 mm, a degree; checked).
- H143 to H146 (line 61; “Wherever habitat months are printed the…” to “The reader's hemisphere is their site's…”): kept: sheet.ts shiftable (4 °C and 10°, checked); the season card under 5 mm; the reader's hemisphere (site.svelte.ts readerLat).
- H148 to H151 (line 64; “The floor on a sheet is…” to “A floor is a figure about…”): kept: sheet.ts and the species page's floor; not re-read.
- H153 to H160 (line 67; “The app keeps a small table…” to “A family that splits between groups…”): kept: core/arch.ts (12, 13, 10 and 5 °C, checked) and arch-tables.json; the genus lists not re-read.
- H162 to H170 (lines 70 to 71; “The top of a species page…” to “The papers listed on a species…”): kept: ui/ref/Glance.svelte (25 mm, full at 1,200 mm and 70 DLI, checked) and the species page; not every clause re-read.
- H171 to H172 (lines 73 to 74; “Similar habitat climate…” to “Near the foot of a species…”): kept: core/near.ts nearestByClimate, six.
- H173 (line 74; “The distance is one number: the…”): not kept on the base: the log is of the rain plus 1 mm (Math.log1p), so a factor of 2.7 counts three degrees only in a wet month; corrected in this pass, tested in r70p-about-seams.
- H174 to H176 (line 74; “Months are compared in calendar order…” to “It is a statement about climates…”): kept: near.ts (calendar order; months and nothing else); not re-read.
- H177 to H182 (line 76; “The reference is built on a…” to “The sitemap dates each species page…”): kept: the build's products, manifest and sitemap (products.ts, manifest.ts, sitemap.ts); not re-read.
- H184 (line 79; “Everything you record lives in your…”): kept: core/log.ts, core/hlc.ts.
- H185 (line 79; “What the app shows is the…”): changing in round seventy: R (R1: the snapshot's validity includes the fold's clock state).
- H186 (line 79; “That one rule is what backup…”): kept: the merge rule (log.ts); not re-read.
- H187 to H192 (line 79; “Sync encrypts every sync bundle (a…” to “The formats page has the details.…”): kept: sync/* and server/sync.ts (W's area; W1 to W5 do not change these); not re-read.
- H194 to H199 (lines 83 to 87; “No accounts, no analytics, no tracking…” to “A search typed in the catalogue…”): kept: no accounts or analytics; bucket.ts hash groups; weather/client.ts rounding; frost.svelte.ts; not every clause re-read.
- H200 to H201 (line 87; “The species picker sends the name…” to “When that species is not found…”): kept: ui/picked-name.ts requestName and the genus ask; not re-read.
- H202 (line 87; “A search of your own plants…”): kept: the "Your species" search is on the device.
- H203 (line 87; “The names in a list you…”): kept: import/check.ts (r61w-about-seams); R3 does not change it.
- H204 (line 88; “Two small cookies: your units, and…”): kept: units.svelte.ts and site.svelte.ts; driven in r70p-about-seams.
- H205 (line 89; “When a page loads, the app's…”): kept: +layout.svelte registers the worker and calls reg.update() once a load when a worker is active (checked).
- H206 (line 89; “When a move between pages fails…”): kept: +layout.svelte and the framework (r70p-about-seams).
- H207 (line 90; “The server keeps short-lived rate counters…”): kept: server/counters.ts drops address keys within two days (r62w-about-seams).
- H208 to H209 (line 90; “Cloudflare's edge keeps copies of public…” to “It keeps a forecast for a…”): kept: the edge and worker caches (r62w-about-seams table, r69p-about-seams keys); the "not found" answer for three or more holders changes with N (F1, N2).
- H210 to H219 (line 91; “The server also caps how often…” to “The reserve is kept by the…”): kept: server/caps.ts and counters.ts (W's area, not in W's items; r62w-about-seams reads 600, a tenth, four tenths); the reserve figures not re-read.
- H220 (line 92; “Species pages, the front page and…”): kept: CSP img-src (r61w-about-seams, r69p-about-seams).
- H222 to H224 (line 95; “There are no accounts, no analytics…” to “Your collection, meaning its records (names…”): kept; not re-read.
- H225 (line 95; “What the pages about your own…”): kept, clause by clause where tested: the reload (driven), the cookies (driven), preloading, the forecast lifetimes (r62w), the hash groups (32), the picker; the import clause changes with R3 only if its lookups change (they do not).
- H226 to H230 (line 95; “No page address is sent as…” to “Those three are the only hosts…”): kept: no-referrer (hooks.server.ts), the hosts (r61w-about-seams).
- H231 to H232 (line 95; “The site's three typefaces are among…” to “Using a device's own font is…”): kept: the typefaces are the site's files with metric fallbacks; not re-read.
- H233 to H237 (line 95; “The one thing the server keeps…” to “With sync on, the server also…”): kept: server/sync.ts, counters.ts, caps.ts (W's area); the photograph removal clauses may change with W3; not re-read clause by clause.
- H238 to H240 (line 95; “A write to a vault from…” to “1, which a page on another…”): kept: hooks.server.ts _foreignWrite and X-Cultifolio-Sync (checked).
- H241 to H243 (line 95; “A photograph you remove is removed…” to “A photograph brought back after the…”): changing in round seventy: W (W3: DELETE takes the hold only with the proof).
- H244 (line 95; “What the device keeps outside the…”): kept: every key both ways (r62w-about-seams, r61w-about-seams); the example's keys change with X (X2 keepDraft carries the containing place).
- H245 to H246 (line 95; “And one path does reach the…” to “The server does not log paths…”): kept: the shell serves /plants/<n> from the cache; Workers Logs off (r69p-about-seams).
- H248 to H252 (line 99; “Plant: one plant (or one pot…” to “Sync key: the thirty symbols that…”): kept; glossary definitions.
- H253 (line 99; “Sync bundle: a sealed bundle of…”): kept: "sync bundle" (r61w-about-seams); W2 changes sync's words, not this one.
- H254 to H258 (line 99; “Could not be read here: a…” to “Pending: the habitat climate has not…”): kept; glossary definitions.
- H259 to H260 (line 99; “Held: a change dated more than…” to “Parked: a change from a clock…”): kept: hlc.ts MAX_AHEAD_MS, log.ts PARK_MS (r62w-about-seams); R2 changes the hold's placement, not these definitions.
- H261 to H269 (line 99; “Not reached: this site could not…” to “DLI (daily light integral): the light…”): kept; glossary definitions.
- H270 to H273 (lines 101 to 102; “The source…” to “Problems and corrections are welcome there.…”): kept: the licence files and the repository.
- F3 to F10 (lines 21 to 24; “A collection is a list of…” to “"sulked all summer" }`}…”): kept: core/log.ts Change shape.
- F11 to F15 (line 25; “t is a hybrid logical clock…” to “A device follows a peer's clock…”): kept: core/hlc.ts (four or six hex digits, 0x800000, 16-character writer, zz repair writer; follows a peer only five minutes ahead; r62w-about-seams drives the mark).
- F16 to F25 (lines 25 to 26; “A delete is a change setting…” to “That is the merge rule; backup…”): kept: log.ts fold and merge rules; not re-read.
- F26 to F35 (line 27; “Record shapes are plain JSON with…” to “A replace from a backup is…”): kept: ids and numbers (collection.svelte.ts); the restore's yielding is driven in r62w-about-seams (read by the new method).
- F36 (line 27; “Opening the collection, or a sync…”): kept: rule 6; R1 makes the snapshot droppable, which this sentence already claims (IND-5).
- F37 to F42 (line 27; “A change in the log that…” to “To list a plant's events, take…”): kept: changeError, unreadable.json, the vault refusing storage; not re-read.
- F43 (line 28; “The fields, by kind. accession: acc…”): kept except importKey, which changes in round seventy: R (R3 reads a re-saved sheet's date and price as before).
- F44 to F60 (lines 30 to 45; “The backup file…” to “device.json the exporting device's settings {…”): kept: backup/* file layout; not re-read.
- F61 to F63 (line 46; “The manifest's v is 3 when…” to “This version reads all three.…”): kept: the manifest's v rule (backup/*); not re-read.
- F64 (line 46; “A change in either file that…”): changing in round seventy: R (R4: Replace refuses while the device holds changes it cannot read).
- F65 to F72 (line 46; “A file none of whose changes…” to “Only the zip is read.…”): kept: backup/* restore, staging and parks; not re-read.
- F73 to F95 (lines 48 to 50; “Sync on the wire…” to “A log batch the device cannot…”): kept: sync/* crypto, naming and wire (W's area, not in W's items); not re-read.
- F96 to F108 (line 50; “A change stamped more than five…” to “At a page load, and after…”): kept (R's area: hlc.ts readings, MAX_AHEAD, half a minute, two days; r62w-about-seams reads the figures); R2 may reword.
- F109 to F113 (line 50; “Meanwhile the clock does not count…” to “A first reading that disagrees with…”): changing in round seventy: R (R2: an edit is placed past held stamps of every field of the record; a fresh tab does not unconfirm another tab's correction).
- F114 to F120 (line 50; “What is kept is the correction…” to “No device keeps a verdict of…”): kept (R's area: hlc.ts trust, a week, five minutes of slack; log.ts parking); r61w and r62w read the figures.
- F121 to F123 (line 50; “An edit always wins: it is…” to “A field, and a record's removal…”): changing in round seventy: R (R2: the marked edit's placement across fields).
- F124 to F141 (line 50; “The mark says how a stamp…” to “A device whose clock reads earlier…”): kept (R's area: the mark, held and parked, Apply); not re-read.
- F142 to F145 (line 50; “Log batches are handed out in…” to “No log batch or photograph is…”): kept: the listing by arrival (server/sync.ts, sync/engine); not re-read.
- F146 to F147 (line 51; “On the device, the log is…” to “The merged state the pages read…”): kept: vault.ts stores and the snapshot.
- F148 (line 51; “A fresh snapshot is written after…”): not kept: a fresh snapshot is written after a load that folded 1,000 changes or more on top of it (FOLD_REFRESH, >=), and after every load that read the whole log (foldFromVault always saves); R's area, for the second pass.
- F149 (line 51; “The example collection's database keeps no…”): kept: the example keeps no outbox.
- F150 to F151 (line 51; “The snapshot is only ever a…” to “What the snapshot did not fold…”): changing in round seventy: R (R1: the fold's clock state is part of the snapshot's validity; FOLD_RULES rises).
- F152 to F153 (line 51; “A backup carries the log, never…” to “The database is at version 4…”): kept: DB_V = 4 and the blocking handler (vault.ts, checked).
- F154 to F181 (line 52; “The example collection (the sample, in…” to “From that moment such a tab…”): changing in round seventy: X (X1 the open lock in app.html's first script, X2 Keep, X3 the seed only into an empty log, X4); not read sentence by sentence.
- F182 to F213 (line 53; “The endpoints…” to “Joining a vault never takes a…”): kept: the endpoints and limits (server/sync.ts, caps.ts, counters.ts; r62w and r69p read the figures); not re-read clause by clause.
- F214 to F215 (line 53; “A device given that answer keeps…” to “A 503 asking for less than…”): changing in round seventy: W (W2: the day's allowance waited out until the server's time; a 429 said as a refusal).
- F216 to F220 (line 53; “A photograph another device is storing…” to “60, when the counters cannot be…”): kept: server/sync.ts 503 handling; not re-read.
- F221 (line 53; “A listing of a vault holding…”): changing in round seventy: W (W4: no sixty minutes allow more than the stated pages).
- F222 (line 53; “A vault that has stored 3,600…”): kept: VAULT_WRITES_PER_HOUR = 3600 (S-F checked).
- F223 to F227 (line 53; “The byte counts live in a…” to “A device answered 409 does not…”): changing in round seventy: W (W3: DELETE takes the hold only with the proof).
- F228 to F255 (line 53; “A photograph is stored by generation.…” to “Without the counter object bound, KV…”): kept: generations, the sweep and the recount (counters.ts, photogen.ts; r69p-about-seams reads five pages and seven nights); not re-read clause by clause.
- F256 to F262 (line 54; “What the server can see.…” to “Anyone holding the bearer token (which…”): kept: what the server sees; not re-read.
- F263 to F269 (line 55; “The reference lookups your own pages…” to “The reference's photographs are not fetched…”): kept: bucket.ts (FNV-1a, 32 groups), /api/sheets and /api/entries 409 and 503 (W's area); the device-only search shapes not re-read.
- F271 to F272 (line 58; “Search puts a name typed as…” to “Apostrophes are taken out before a…”): not kept (S-F9f, S-F6); changing in round seventy: N (N2).
- F273 to F280 (line 58; “Every older name of species rank…” to “/api/names?q= takes letters, marks, spaces, "."…”): kept (N's area: core/search.ts readings, /api/search headers, /api/names 400); not re-read.
- F281 to F283 (line 59; “A name picked in the Add…” to “A nothogenus keeps its sign (×…”): kept: ui/picked-name.ts; not re-read.
- F285 to F289 (line 62; “Import (My plants, Import) reads a…” to “A Status or Kind the import…”): kept (R's area: import/*); not re-read.
- F290 (line 62; “Dates are read at the precision…”): changing in round seventy: R (R3: a zero-padded two-digit year read as the date it was).
- F291 to F299 (line 62; “A time after a date (09/03/2024…” to “Nothing in brackets is a step…”): kept (R's area: import/*); not re-read.
- F300 (line 62; “A number already used here is…”): changing in round seventy: R (R3: a price in a currency format read as its number in the import key).
- F301 to F313 (line 62; “My plants' Newest first orders numbers…” to “A price is written as typed…”): kept (R's area: import/*, backup sheets); not re-read.
- F314 to F316 (line 62; “A full date (2017-08-14) is written…” to “In LibreOffice, tick "Evaluate formulas" when…”): changing in round seventy: R (R3: a sheet saved again by LibreOffice reads the same).
- F317 to F323 (line 63; “The watering calendar is an iCalendar…” to “A calendar keeps an imported event…”): kept: ui/grow calendar (X's directory; X's items do not touch it); not re-read.
- F324 to F328 (line 64; “Spent this year is read from…” to “Both read today's date from the…”): kept: the spent and photograph rules (ui/photo-due.ts and the money reader); not re-read.
- F329 to F332 (line 65; “The label's QR code is the…” to “A cross has no species page…”): kept: ui/grow/qr.ts (60 code points by grapheme, format characters out, two marks; checked).
- F334 (line 68; “Each species page is rendered from…”): kept: routes/api/dossier (no-store, 503 for a listed key, checked); the pd licence is C's (C3).
- F335 (line 68; “GBIF's vernacular names are one row…”): kept (N's area: the vernacular rows, the changed fingerprint); not re-read.
- F336 to F337 (line 68; “Each species' index entry (as /api/entries?b=…” to “" (absent when they cannot be…”): not kept (S-F9g: "photos counts the photographs the species page shows"); changing in round seventy: C (C4, C3).
- F338 (line 68; “The corpus is built from public…”): kept: npm run export columns; not re-read.
