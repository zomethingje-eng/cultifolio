# Round sixty-two: the fixes from the reviews of round sixty-one

Three reviews of round sixty-one were triaged into `docs/REVIEW-TRIAGE-61.md`: the author's nine-part self-review (`docs/REVIEW-SELF-61.md`, reports and tests in `docs/review-61/`) and two outside reviews (`docs/review-61/outside-a.md`, findings A1 to A44; `docs/review-61/outside-b.md`, findings B1 to B14). The round was done in two passes.

- **The first pass** did every decision of the triage. Seven agents worked in copies of one base, each owning a set of files: the clock and records (L), the server (S), search and common names (Q), words and public pages (W), the import, labels and sample (G), the interface and Today (A), and the harness (H). Their copies merged three-way with one conflict (an import line), and each change one agent needed in another's files was applied at the merge.
- **A verification review** then read the merged code as the next outside reviewer would: seven reviewers (the self-review's findings walked one by one, the outside reviews' findings walked one by one, the data layer, the server, search, a grower's flows in the browser, and the words). They found about eighty further items, most with a failing test, including two regressions of the first pass.
- **The second pass** fixed them, with the same seven owners, merged with no conflicts. Both about pages were reconciled against the merged code after each pass.

What follows states what a test or a measurement shows; where a claim rests on a check made once by hand, it says so.

**Results, on the merged tree after the second pass:** svelte-check clean on 901 files; 1,827 unit tests in 211 files (1,826 passing, 1 skipped), on Node 22; the browser suite as given in section 10. `FOLD_RULES` is 7 and the device database is version 4, so every device folds its log once on its first load after the deploy, and an open tab of an older build lets go and reloads.

## 1. Records keep what was typed

- **The species page's notes** (A13, data loss): the page is keyed by its slug (`species/[slug]/+layout.svelte`) and has the plant page's leave guard, so a draft never follows a related-species link and Save never writes it over another species' notes.
- **The sample collection** (A9): Leave navigates first and the next page deletes the sample, so a cancelled "Leave site?" keeps a working tab; a cancelled Leave is called off at once where the browser reports it (the second pass: the first pass left its `pagehide` listener armed, so the next reload deleted the sample). Leave counts the visitor's edits and asks; a blocked delete is said; the compare tray stays in the sample.
- **Archive's Undo** is one commit (A25): `putWith` writes `{ _deleted: true }` entries, so a failure or a sync in between cannot leave half an Undo.
- **Two tabs importing one sheet** (second pass; the verification review's data 4): one import writes at a time under a Web Lock (`cultifolio-import`), catches up with what other tabs stored, and leaves out plants whose import key is already here, saying which lines were imported elsewhere.

## 2. Rule 2

- **Today** says "Resting months not checked: the species sheets did not answer" on every stop when the sheets fail, hang (five seconds: "Still reading the species sheets…") or are refused, and "Check again" asks again for every failed bucket, not one (`sheetsFor` and `entriesFor` let every failed bucket go). Focus stays on the stop when they answer.
- **A bucket of sheets with a species whose dossier cannot be read** is answered 503, never an answer without that species (the corpus review of round sixty, 13, open until now; fixed at the first merge).
- **The picker** says "was not asked" for a 400, a 429 or a held call, with the server's reason, and says when the reference's own search did not answer (second pass; corpus 10g).
- **The species page** says "refused" for a refusal and "did not answer" only for silence, in the idcard, the notices, the photo sources and Provenance (second pass; the grower review's 2). The 404 says "was not asked" for a held call.
- **The plant page** says "Name not in the reference" when the reference answered without it.
- **Alerts** a NWS refusal left unchecked are kept five minutes, not an hour, at the edge and on the device.

## 3. Search and the picker

- **The order of readings:** the whole query against the common names; then the botanical reading with authors stripped; then a typo-tolerant species match; and only for a genus of the reference followed by capitalised words, the genus with the rest as a cultivar. "Black eyed Susan" answers as "black eyed susan" does (B2); "Aloe Verra" is Aloe vera by a similar spelling, whatever its capitals (second pass; the first pass had made a capital switch typo tolerance off); "St Johns Wort" stays whole. `X-Search-Relaxed`, `X-Search-Left` and `X-Search-Near` say which words were used, which left out, and when the hits came by a similar spelling, and the front page says each.
- **Hybrids, dotted words, quotes, qualifiers** ("cf.", "aff.", "nr.", "near", "cfr.", "vel aff." skipped; "sp.", "spp.", "nov." ending the name), NFKC with format characters removed, on the server and in the picker.
- **The picker** asks GBIF about the species part only, with a capitalised epithet lowered, never a field number or an unquoted cultivar; it sends the whole text to the catalogue's search. It says "similar spelling", offers the genus with a cultivar kept, and files a key only when the name filed is the picked taxon's: a kept qualifier, a form, a variety (also under an older genus or a misspelt epithet) is filed as typed with no key (B3).
- **Common names:** each exact spelling keeps its own sources; names are ranked by distinct sources; a name is set back for another genus when that genus is its last word, in any case, unless English uses the genus as a noun (agave, aloe, amaryllis, cereus, crocus, haworthia, iris, yucca). A `--names` build step asks GBIF again for every species so the preferred flags and source counts exist; `audit-common-names.ts --before` shows what it changed.
- The search's edge cache key is `search4`.

## 4. The import

Numbers given explicitly; an `importKey` on every imported plant, so a second run adds only what is missing, including part of a Qty row (B6); one year rule in `$core/year`; passes of 2,000 lines; lines written in groups of up to 50 plants (2,000 rows in 28 s against 179 s, measured once in Chromium; the vault's issued-number ledger is now read once per write and rewritten only when a number is new); choices changed after "Check names" re-read the sheet; "Use it" keeps the qualifier, rank, cultivar and aside and is named for its line; the new qualifiers; cf., aff. and sp. plants filed with no key and shown as "Compare:"; name cells cleaned of invisible characters, keeping the text as received; "/" a path step only when it is one; the date fixes (two-digit years, year-first, a 0 day, "2019.5", "Aug-17" and day counts said as unread, with the sheet's date order explained); spending in one total per currency, with "free" and "gift" counted apart.

## 5. The clock

- **Stored verdicts only:** what `takeBatch` and `judgeOwn` judge against, what the engine re-fetches, and what a backup exports, is the parks kept in `meta.parked`, never a clock-only park (A14, A16, B7).
- **Batches with marked or parked stamps are version 2** (B8): a round-sixty-one reader sets them aside until it updates; a backup holding a marked stamp is version 2, which a round-sixty-one build refuses with a sentence. A new vault is sent parked changes with their verdict, so every device parks them alike and offers Apply (second pass; the first pass left them out, and a joining device showed a record "waiting for a newer version").
- **The correction** no longer lapses with time (B9, A17). A move back of the device clock undoes the forward moves kept since the last reading, then follows only as far as a negative correction says the clock was fast; any other move keeps the offset, unconfirmed, and asks for a reading at once. The kept moves and the unconfirmed state are stored with the correction, so a reload and other tabs share them (second pass: the first pass followed any move back, so a clock set right by hand while a page was open stayed a year ahead, and its undo was forgotten on reload). A reading that disagrees replaces the offset and folds once; one that agrees folds nothing.
- **Restore** with no arrival order, and after a Replace from a backup, says the order is not known and keeps the live plant as the keeper.
- **Marks:** a stored park of a marked stamp is ignored; "Renumber now" past a marked stamp; a refold when a stored park meets a folded change; a marked removal dated by its first sighting; no counter steps onto the mark.
- **The fold guard** hashes the blocks A42 named and folds a fixed set of logs and clocks; each of A42's five mutations fails it. The convergence fuzz gives each device its own storage and reloads, settles over seven days, and passes on every seed tried, including the five the verification review found held past three days.

## 6. The server

- **Crash consistency** (A24, B10): each page of the midnight sweep is one storage transaction, re-reading its places so an upload that touched one meanwhile keeps it; a removal holds a zero-byte lease; a listing is neither made nor written while any lease is live.
- **Admission on evidence** (B11): `reclaimedAt` in the vault's meta and an `r:` note in the counter object; a write to a reclaimed vault needs a checked place; round-fifty-eight and older vaults are adopted once.
- **Photographs by generation** (decision 7): `photo/<id>.bin` and `.g<digits>`, named by a `photoref` pointer moved by R2's conditional write; a removal deletes only the generation it saw; an upload with the proof that finds the photograph there moves the pointer too, so a stalled removal cannot take a revival (second pass); the receipt names its generation, so a removal cut off halfway is finished by the device's retry; unnamed bytes over ten minutes old go at the photograph's next touch; a removed name is stored again only with the removal's proof (A23).
- **One busy photograph** waits 10 s, not a minute for the vault (A30). `Origin: null` from a browser without `Sec-Fetch-Site` passes only with `X-Cultifolio-Sync: 1` (A31). The old-name check counts to the reader's address (A29). The cap constants are in `caps.ts`.

## 7. The interface

The front page's first screen: on a phone the strip's photographs no longer draw at their attribute height (the cause B1 measured live), the introduction is one sentence and the letter index one scrolling line, so the search, the grouping and a row are above the tab bar at 390 × 844 with a live-shaped response (first row's foot at 751 against the tab bar at 787, measured in the e2e harness, not on the live site). On a desktop the feature is drawn after the first three catalogue rows, so the search, the chips and a whole row are on the first screen at 1280 × 800, 1440 × 900 and 1024 × 768, and a chip click moves no row (second pass; the first pass's feature above the search pushed the search to y 1,224). The tab bar shrinks its labels a step before it shows icons, so 360 px phones keep their words (second pass); at 320 px with 200% text it shows icons named by their labels. The hero credit is two lines on a phone. Select mode, Today's focus, the toast (a repeated sentence is said again; its cap is the pointer's), the labels (5167 margins; the QR name cleaned and cut by grapheme; picks kept across a reload of the page only), the calendar (whole rhythms, `SEQUENCE`, stable UIDs, a "download again" event), the font fallbacks (the Linux layout shift from 0.148 to 0.000 on the front page, measured once), and the rest of decision 8.

## 8. Words

Every item of decision 9 and of the verification review's words report: the title and metas say "and the plants most grown alongside them"; no "in the wild" on any species figure; "typical spot", "floor … (1 in 100, NASA POWER)", "mean daily high", "mean nightly low", "sum of monthly medians"; the groups and their why text; disagreeing licences said only when they disagree; the about pages reconciled twice against the code, and their seam tests now exact (lifetimes per item, keys matched whole, every key resolved). The link-preview image (`static/og.png`) still reads "growers of cacti, succulents and bulbs"; its alt says what it shows, and redrawing it is left to the author.

## 9. The harness

One seed helper for every browser spec, writing arrival rows and moving the fold counter in one transaction (`tests/e2e/helpers/inject.ts`); every spec that makes a sync vault does so from its own documentation address (`helpers/address.ts`), and one smoke test checks the per-address limit itself; the bundle gate runs after every build (`scripts/check-bundle.mjs`, from `attach-do.mjs`) and fails a stale or wrong build; `scripts/predeploy.mjs` runs the browser suite strict; the font-preference tests check the preference took; the CLS tests wait for the page's own signs; A41's reverts each have a test; the reviewers' tests are adopted. Retired at the merge: `r62h-removal-reread.test.ts`, which guarded a second look the generation design removed (the stall tests in `r62s-photos` and `r62bs-*` guard the replacement).

## 10. The browser suite

The full run after the second pass's merge (one worker, wrangler dev on a fresh state, Chromium 141): 293 tests, 289 passing first time, 2 failing and 2 flaky. The two failures were expectations the merge had left stale, not faults: a test of the place page's "held" alerts, a state the forecast route no longer sends (removed), and the front page's similar-spelling sentence, which the merge took from W in other words than Q's test expected (the test now reads W's). Both specs then passed three runs of three. The two flaky tests passed on their retry: r61g 7 (a second sample tab told within ten seconds that the sample closed) and r62g 3 (a 2,003-line import); both are timing under load on this two-CPU machine, and r61g 7 passed three runs of three alone. Under `node scripts/predeploy.mjs` (strict) a flake fails the run, so run it on a quiet machine before the deploy.

The first pass's full runs, for the record, each of 237 tests: the first had 233 passing and 4 failing (a service worker answering a request the test had mocked; the labels page's remembered pick, in two tests; a hover preload that passed alone); the second, 235 passing and 2 failing, both met by the five-new-vaults-a-day limit from 127.0.0.1. Each was fixed at that merge.

### The first strict run on the author's PC, and what it found

The first `node scripts/predeploy.mjs` on the author's Windows PC (Node 24, Playwright's default eight workers): 292 tests, 279 passing, 2 failing, 9 flaky, 2 skipped; and `npm run deploy` stopped at its unit tests, with 5 failures that only Windows shows. Nothing was deployed. What each was, and what was done:

- **Unit tests that assumed `/` in paths** (the about seam tests' file walks and the strict run's own test, whose spec path Playwright read as a pattern): the walks write forward slashes and the spec is named alone.
- **The suite met GBIF.** The browser suite was written where GBIF, MET Norway and the NWS cannot be reached; the PC can reach them, and a test met GBIF's live suggestion ("Did you mean Welwitschia mirabilis?") where it asserts silence, twice. The suite's local server now asks no outside service (`E2E_OFFLINE`, a variable only `playwright.config.ts` sets, read by a `handleFetch` hook; never set in production; `tests/unit/r62x-e2e-offline.test.ts`).
- **Eight workers on one local server:** seven of the nine flaky tests timed out loading a page. The strict run now uses two workers unless told otherwise (`PW_WORKERS`).
- **A real fault, found by the flake:** leaving the sample collection kept the sample one time in five in Chromium (r62g 8, flaky on both machines). The next page committed and read the tab's storage before the old page's `pagehide` had cleared the flag. The flag is now cleared, and the next page told, before the navigation is asked for, and put back if the Leave is called off; and the address says it too (`?left=sample`), read by the page's first script (`app.html`, whose CSP hash changed with it). 20 runs of 20 pass.
- **Windows' font swap:** with the web fonts held back, the front page shifted 0.107 at 390 px. The fallback faces this round tuned are Linux's (Liberation, DejaVu); the Segoe UI and Georgia faces were not measured. The test now runs on Linux only and says why elsewhere: an open item below.

The run after those fixes, here (two workers, strict, `E2E_OFFLINE`): 292 tests, 292 passing first time, no retries (the one flake of the run before, the grower's placeholder read before the grower's box was drawn, now waits for it, and passed ten runs of ten).

### The corpus step, done before the deploy

The `--names` step ran on the PC while the deploy was still stopped: 8,947 dossiers asked again, none refused, and the corpus `e0cac43aa4c41ce5` uploaded and served by round sixty-one's Worker (the live check passed 18 of 18, against that Worker). The audit against the index before it: 1,613 of 8,947 species show another common name. In its sample of 40 most are the commoner name ("Okra" for Lady's-Finger, "Peanut", "Quince", "Asparagus Fern" for a botanical string GBIF had listed as a name); some are another spelling of the same name, the one more sources give ("Red-Hot-Poker", "Mock-orange"); one was wrong by the rule's own aim: "Osteospermum", another genus named alone, for Dimorphotheca jucunda. The set-back now takes another genus named alone, as it takes one at the end of a longer name; the live index has three such names, and the two that are English nouns ("Lotus" for Nelumbo nucifera, "Mimosa" for Leucaena leucocephala) join the list of genera English uses as nouns. An index rebuild after the deploy (no GBIF calls) puts it right.

## 11. Not done, and why

- **Windows' layout shift when the web fonts arrive late:** 0.107 on the front page at 390 px in the PC's strict run (the species page passed). Tuning the Segoe UI and Georgia fallback faces needs a measurement on Windows.

- **The link-preview image** is not redrawn (section 8).
- **A daily sweep of every vault's unnamed photograph bytes** is not built: it would cost a read per photograph a day. Such bytes go at that photograph's next touch, and count until then (stated on `/about/formats`).
- **Two devices of different builds each pressing "Renumber now"** can leave two notes; the record is right, and the second note says the same thing.
- **Deferred in the triage, still deferred:** a median of annual rain totals; LibreOffice's `12.50`; a distributed attack on the outside-call shares; a record of real time beside the stamp; printers, Firefox, Safari and screen readers; sitemap dates; the sample offered only to a grower with no plants; full dates in `plants.csv` shown short by Excel.
- **QA probes** (`tests/qa`, run with `QA_PROBES`) were stale before this round (14 failures on the base) and are not maintained.

## 12. After the deploy

1. The `--names` step is done (above). After the deploy, `npm run dossier -- --index` and the two-line upload, for the set-back of a genus named alone.
2. The live commands in `docs/review-61/corpus.md`, B1's first screen on a phone, and B2's queries.
3. `npm run live-check` with no skips.
4. Update every device soon: a round-sixty-one device sets version-2 batches aside until it does.
