# Round sixty-one: the fixes from the reviews of round sixty

The reviews of round sixty were triaged into `docs/REVIEW-TRIAGE-60.md`: the author's own nine-part review (`docs/REVIEW-SELF-60.md`, reports and tests in `docs/review-60/`) and an independent outside review (B). This round does every decision the triage kept. Seven agents worked in copies of one base, each owning a set of files: the clock and the records (L), the server (S), search and the corpus (Q), the words, public pages and about pages (W), the import, labels and sample collection (G), accessibility, Today, select mode and the calendar (A), and the harness (H). Their copies were merged three-way against the base with no conflicts. The changes each one needed in another's files were then applied at the merge, and the about pages were reconciled against every report. What follows states what a test or a measurement shows; where a claim rests on a check made once by hand, it says so.

Results: 1,100 unit tests in 130 files (1,097 passing, 2 marked as expected failures, 1 skipped), on Node 22 and on Node 24; svelte-check clean on 792 files; 179 end-to-end tests in nine spec files, all 179 passing on the last full run (two earlier full runs found five failures and three flaky tests, each fixed: see section 11). FOLD_RULES is 6, so every device folds its log once on its first load after the deploy.

## 1. Wrong clocks (decision 1)

1. **This device's own changes are judged by arrival, as a peer's are.** When the engine lists the vault, it learns when each of its own batches arrived. A batch that may hold a stamp more than two days past its arrival is fetched again and judged exactly as `takeBatch` judges a peer's (`ownToJudge`, `judgeOwn`). The writer and its peers now park the same stamps, so the "formerly fast device shows its own year-ahead value over every peer edit" divergence is gone (clock review 3, B7). A device that synced before this round lists the vault from the start once.
2. **The edit-time rebase is removed** (`staleOwn`, the `markParked` in `commit`), and its four bugs with it: an older stale stamp taking the field back (clock 1), a removal stripping another field (clock 2), a park stored before a refused edit (clock 5, B8), and the grower's own replaced text offered back with Apply (clock 6).
3. **An edit always wins, by a mark every device reads.** An edit stamped past a far-ahead stamp is itself far ahead, so judged by arrival it would be parked everywhere and vanish. `hlcPast` now sets bit 0x800000 in the stamp's counter, which no clock reaches in one millisecond; a marked stamp means "placed after the field's stamp", and no device holds or parks it. The rule exempts every such edit, not only those made after the clock was put right, because nothing in a stamp tells a peer when it was made; a fast clock's own ticks are never marked, so it lets none of them through. An older build reads the mark as a large counter until it updates.
4. **Apply on a parked restore restores** (clock 4).
5. **A clock correction lapses when the device clock moves.** Each reading keeps the server's time; a correction of more than five minutes for a slow clock lapses once the device clock reaches that time, and within a tab any correction lapses when the device clock drifts from the monotonic clock by more than 30 seconds. A first reading more than two days off unconfirms the clock. This was fuzz seed 1008 (clock 7).
6. **Rule 5:** a load no longer stores the parks it judges by the clock alone; verdicts by arrival (listings, batches, files) are still stored (clock 8, open since 59).
7. **The held count** no longer counts a held change an edit was since stamped past.

Tests: the convergence fuzz now asserts its bound, zero: all 120 skewed seeds converge (26 diverged in round sixty). The five-round two-device test and the other clock reproductions from `docs/review-60/tests/` are adopted as `r61l-clock-*.test.ts`, inverted to assert the fixes; the one guard that tested the removed rebase was replaced by a test of the new rule. The fold-rules hash now covers `stampPast`, `commit` and the engine's clock listener (`clockChanged`), `ownToJudge` and `judgeOwn`.

## 2. Records (decision 2)

1. **A record page is keyed by its address.** New `+layout.svelte` files under `plants/[acc]`, `propagation/[id]` and `places/[id]` wrap the page in `{#key}`, so a navigation from one record to another drops every open form and draft. A `{#key}` in the page's own markup would not have reset its script state. The e2e reproductions of records review 1 (an edit form, a notes draft via Back, a place form) now pass.
2. **Your own removed plant's label offers Restore,** also after another plant took its number; a stranger's label is headed "A plant label", not the internal id (records 2, grower 13).
3. `?parent=` goes by id; the species page's chips and Enter on the front page's search go by id or open the chooser (records 4).
4. **Restore's "while this one was removed"** is read from the order the two records reached this device (the vault's order store), never from two clocks (records 12). This departs from the review's test in one case: a peer plant that arrived after the removal now makes the restored plant take a new number, with a note that says exactly that.
5. Select mode's move Undo removes only the lines of the plants it puts back (records 14).

## 3. The import, labels and the sample (decisions 3, 4, 10)

1. **The import drops nothing unseen.** Columns no field takes are listed before "Check names" and added to the notes as "Column: value" by default; Qty makes that many plants; Genus and Species columns are joined; a bracketed part of a name is kept as received. "cf.", "aff.", "sp." and "nov." stay in the name, in the import and the add form, and the reference is asked about the species part only.
2. **Dates are read at their precision**: a year, a month, a named month with a day, or a day and month where the numbers decide; one choice for the sheet decides the rest, and the default is to leave them. `acquired` can now be `YYYY` or `YYYY-MM` after an import, and the collection mints that year's number for it. Unread date text goes to the notes.
3. **Speed and restarts.** The plan is frozen while adding and numbers by the running maximum: 300 rows add in 7 to 9 s and 600 in 16.5 s, against 11 to 13 s and 54 s on the base (measured on the loaded sandbox; the planner alone, 2,000 rows, under 200 ms against 1.1 s). A guard stops leaving mid-add; lines already imported are skipped by default; a failure before the first plant says which places were made.
4. **Parsing:** an unclosed quote stops the read and names the row; a repeated header is dropped; a place path splits on " › " only, after a whole-name match ("Greenhouse > Bench 2" is now one place, as decided); notes keep their spaces. The backup's sheets wrap 12-digit and longer numbers and year-month and day-month-year text in `="…"`.
5. **Labels:** the sheet choice survives a reload; the printed sheet measures exactly 794 px wide from 0 (it printed at about 98%); the QR name is cut by code point with control and direction characters removed, and one bad code fails only itself.
6. **The sample collection keeps its own settings.** A helper with an explicit scope (`src/lib/ui/stored.ts`) replaces direct storage calls for settings; in the sample every setting goes to the tab's session storage under `cultifolio.demo.`, no cookie is written, and Settings is locked as Sync and Backup are, each keeping its h1. Sync, restore and the staging database refuse to start in the sample in code, not only by CSS, and the staging database is named per collection. The flag is read before paint, so the sample bar no longer shifts the page (CLS under 0.05 against 0.17); the sample is set out in one commit; a leftover sample database is deleted on a load outside it; a second sample tab is told plainly.

## 4. The server (decisions 5, 6)

1. **Photograph removal by claims alone.** The "newer upload" test no longer reads R2's upload time; an upload claims a photograph's name only when it carries the removal proof, and the proof is checked first, so the 409/403 split reveals nothing. The engine treats a 409 as "ask again", at most hourly, so a late first upload is removed once its two-day claim lapses (server 1 to 3, B9).
2. **Hold fencing** renews the hold and reads the object again just before the delete. B10's remaining window, a stalled delete call, is a test marked as an expected failure until photographs are stored by generation (next round), and `/about/formats` states it.
3. **Recounts** keep their generation check on the retry; two crossed listings answer 503 with `Retry-After: 30` (B11). An expired lease marks the count stale (B14).
4. **Admission:** `unadmit` keeps a place while another upload is landing, `filled` is written at the first landing, and the KV fallback counts a vault once. A vault with no upload for 90 days gives its place back at the midnight sweep, which now pages through its keys.
5. **The 503 refusal** of a minute or more is kept in the sync record, so a reload or another tab waits too, capped at the hour.
6. **The outside-call cap** lives in the counter object, with a share of 600 calls a minute each for MET Norway, the NWS and GBIF, and one address may take a tenth of a share. A US forecast counts against both MET's and the NWS's. A held call answers `held: true`, and the forecast, the frost line, the species picker and the species 404 say "not asked: this site's calls are used up for this minute", never that the source did not answer.
7. The `/benches` and `/sowings` redirects carry the security headers.

## 5. Search and common names (decision 7)

1. "String of Pearls" is searched whole: a capitalised word starts an author citation only after an epithet of four letters or more, and a word ending in "." that is not a rank starts one in any case ("orbea humilis l."). After "x" or "×" the name starts again; a capitalised quoted cultivar is left out of the first pass; a hyphenated epithet is one word.
2. The picker offers no retried hit as a match and keeps the typed variety.
3. **Common names by a fixed rule:** English only; names containing another genus, comma lists and binomial-shaped strings last; GBIF's preferred flag; the number of sources; then GBIF's order, length and alphabet. A capital after a hyphen is lowered. Curio rowleyanus now shows "String of pearls". The species page computes its names on the server with the corpus's genera, so page and tile agree. `scripts/audit-common-names.ts` measures the change on an index before the deploy; GBIF's preferred flags and source counts reach a dossier only when a build fetches its names afresh.
4. A request's search passes are charged against one count (corpus 17). The about pages carry no sitemap `lastmod`.

## 6. Words and the front page (decisions 8, 9)

1. **The labels are the figures' own names:** "Cold floor (1 night in 100)" with the record low beside it, "Warmest month, mean day", "Rain a year", "Open-sky light", on the glance row, compare and the share card.
2. The chart's caption names CHELSA; the hero's credit sits where a phone shows it (checked with `elementFromPoint` at three points); a refused or pending climate is said as such; ties name every month, on the plant page too; the share card says its hemisphere; the label line says "convention, no source".
3. **The front page** says "Nothing about a species is written per page by a person or by AI, apart from credited quotations", and `/about/how` says once that the templates were written by the author with Claude. On a desktop the search and photographs come first and the feature sits under them, its chart drawn only on a wide screen. `feature` is sent only for the plain front page.
4. **Changed at the merge: phones show no feature.** Decision 9 gave phones the four cards; placed between the search and the rows, they put the first catalogue row two screens down and parted the search from what it searches, which round fifty's first-screen test caught. The cards are not drawn on a phone, the strip's first photograph is the same species, and the sample's button in the welcome line is styled as a link so the first row stays above the tab bar.
5. Both about pages were corrected against the code, from W's pass and every agent's text. The seam test that every storage key is named is permanent.
6. `docs/SHOW-HN.md` takes title 2 and "re-derived in about an hour; built from the sources over several days"; the `[AUTHOR]` sentences are left for the author.

## 7. Accessibility and the grower (decisions 11, 12)

1. The toast no longer traps Tab, and focus holds it for at most 30 s. New actions use `aria-disabled` and send focus where it belongs. Today waits for its sheets before drawing (CLS 0.30 to 0 with 300 plants). Forced colours, reflow at 320 px with 200% text, and bars under 480 px tall are fixed. The layout no longer imports the grow barrel, nor do the plant pages: JavaScript reachable from `/` went from 157.7 to 136.5 KB gzip.
2. Move starts with no place chosen; it no longer offers "New…" to make a place on the spot, since the shared picker cannot start empty. Archive in select mode has an Undo.
3. My plants filters by place (`/plants?place=<id>`), the place page's "Select these" opens it in select mode, and a search that names a place lists that place. Today's photo count and the list's chip read one rule. Spending totals per currency. The calendar has a 09:00 reminder, restarts after each dry run, leaves out a place dry all year, and says to delete the old events first. The persistence toast waits for the navigation to settle. The sync page names held and parked records as the grower knows them.
4. The Oxalis double listing is settled by keeping it out of the geophyte group: the genus holds shrubs and succulent stems as well as bulbs, and every Oxalis page already read the `none` entry, so no page changes.

## 8. The harness (decision 13)

The unit suite passes with the clock at 2 January 2027 and at 23:59:50 on New Year's Eve; the e2e specs read the year from the clock. The 13 harness files and the reviews' guards are adopted (`r61h-*`, and each agent's own); the reproductions were inverted to assert the fixes, and each agent showed its new tests failing on the base first. Vacuous tests are fixed or renamed, the zip-bomb and multi-page tests have timeouts that hold under load, fixed waits before negative assertions wait for the operation instead, and the port comes from `PW_PORT`.

## 9. Not done, and why

- Generation-addressed photo objects (decision 5's residual race): next round, as decided.
- Per-dossier sitemap dates, the large-collection tail read, the shells' inline CSS, frost web push and author credits on tiles: deferred by the triage, unchanged.
- Following the grower's own numbering scheme for a renumbered import line (grower 10): only the words were fixed.
- The dossier builder's refusal details as full clauses: the page already words both forms, and the change needs a rebuild.

## 10. After the deploy

1. Before the deploy, run the common-name audit on the live index: `npx tsx scripts/audit-common-names.ts https://cultifolio.com/api/index --sample 40`, and read the sample.
2. After the deploy, rebuild the index so the rule applies to the stored dossiers (`npm run dossier -- --index`, then the two rclone lines in `DEPLOY.md` section 5).
3. Then the live check with no skips.

## 11. Found at the merge

- **The phone front page** (section 6, 4): the four cards between the search and the rows broke round fifty's first-screen test.
- **Expectations the agents listed** in the shared e2e specs were applied by their text, since H's edits had moved the lines. Three more surfaced in the first full run: the import's duplicate-number line moved to `#imp-dupes` (H's year test), and the toast's 30-second hold needed a longer test timeout.
- **Two races in the new tests:** the import's "only lines that need me" filter was counted before it rendered, and agent A's seeding helper could lose its rows to the page's own first snapshot (a snapshot's tail is read from the arrival order, which injected rows are not in). Both now wait.
- **The cap's held answer** reached two places no agent owned: the names route now uses the per-address cap (`upstreamCall`) and answers `held: true`, and the species picker and the species 404 say the site held the call back. `synonymOf` returns `'held'` for it.
- **Small cross-file changes,** each from an agent's "Needs from others":
  - the staging database named per collection, refused in the sample, and the sample's closing said plainly (`vault.ts`);
  - a year-only `acquired` mints that year's number;
  - select mode's move Undo;
  - the plant page's ties;
  - the two propagation settings through the storage helper;
  - the plant page's grow import by path;
  - the front page's hint never written from the sample;
  - a search request's passes charged together.

  The fold-rules hash was re-recorded under 6 for the vault change, which alters no fold.
