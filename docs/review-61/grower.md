# Round 61 self-review: the grower (300 lines, 382 plants, a spreadsheet moved in)

I played an experienced UK collector of cacti, succulents and rare bulbs moving a 300-line spreadsheet into Cultifolio, against the shared server at 127.0.0.1:4173 (f4ab4f8, fixture corpus), with persistent Playwright profiles so the collection lived between scripts, at 1280 px and 390 x 844 (touch), en-GB, Europe/London. What I ran:

- **Import.** A generated sheet (`shots/grower/collection-300.csv`, generator `gen-collection.py`): Acc No. (27 blank, one in-file duplicate), Genus and Species in two columns, Field number, Locality, Qty ("", 1, 2, 3, "3+", "several"), Date acquired in 22 forms ("2009", "Aug 2017", "17/11/2007", "09/03/2024", "Aug-17", "spring 2019", "c. 2012", "2015?", "45123", "1/2/03", "30/09/09", "2024-13", a future date), Source, Price in nine currency styles, Notes with line breaks, quotes and `=SUM(A1:A3)`, Bench paths with " › " and ">", cf./aff./sp./sp. nov., quoted cultivars, hybrids, a nothogenus, a misspelling, an unmapped Pot size column. Imported once (desktop), again (second run), and a small sheet on a phone; then 14 plant pages read and an edit saved.
- **Labels:** sheet remembered across reload; `page.pdf` for L7160 (A4), 5160 and 5167 (Letter), each also on the other paper; rendered at 300 dpi; QR codes decoded with OpenCV and positions measured; a removed plant's label and five stranger labels (hostile names included) scanned.
- **Sample:** own settings first (°F, a site, label stock 5167), then the sample: units, compare, Today's frost line, label stock, Settings; a second own tab and a second sample tab; Leave; storage, cookies and databases dumped at each step.
- **Today, select mode, places, spending, calendar:** "Select these" from a place page, Tick all, Water, Move with nothing chosen, Move and Undo, Archive and Undo; rhythms and dry months set on three places; Today online and with `/api/sheets` refused; the .ics downloaded and checked with `icalendar` 7.3.0 and `recurring_ical_events` (expanded Oct 2026 to Dec 2028); the spending summary.
- **Sync words:** read `parkedList`, `held-words.ts`, the sync page and the tests (no live sync).

Tests written: `out/tests/grower--import-numbers.test.ts` (2, both FAIL), `grower--names.test.ts` (4, all FAIL), `grower--r61rev.spec.ts` (3 e2e, all FAIL, run with `PW_REUSE=1` against 4173), `grower--parked-words.test.ts` (4, PASS, a guard). One mutation (plan order) was tried in my copy and reverted (md5 checked). Screenshots: `out/shots/grower/`. The machine's load ran from 12 to 43 during the runs; two `page.pdf` calls crashed Chromium under that load and passed on retry (environment).

Timings: "Check names" on 300 lines 3.6 s (second run 1.8 s); "Add 382 plants" 15.8 s at a load of about 30. The leave guard asked ("Leave while the import is adding plants? 13 of 300 lines are in; the rest would not be added.") and kept the page.

## Findings

### 1. P0 (rule 2). Today lists plants in their habitat's rest as plainly due when the species sheets do not answer, and says nothing (confirmed)

`src/routes/today/+page.svelte:102-111` (`restRule` returns null when `sheets` is null), `:94` (a failed `sheetsFor` settles with `sheets = null`), `:276-299`.

Online, five Copiapoa cinerea on a 1-day rhythm are listed apart: "Its habitat's warmer six months now (under 120 mm of rain a year, its year is read by temperature); water only if you want to". With `/api/sheets` failing (offline, or refused), the same five are merged into "Past their 1-day rhythm (Kitchen); untick any to leave it out", with a Water button, and no word anywhere on the page that the habitat was not read. A source that did not answer is said as an absence: the grower is told to water a resting plant. The brief's probe "what does Today show when the sheets never answer" has this answer.

Repro: `grower--r61rev.spec.ts` test 3 (fails: no "not checked" in `#water`); by hand, `today2.mjs` (scratch) printed `ONLINE resting: ["Its habitat's warmer six months now …"]` then `REFUSED resting: null`, cinerea rows 5 in both.

Fix: keep "sheets failed" apart from "no sheet": when `sheetsFor` returns null (or a species is missing because its bucket failed), draw one line per stop, "Habitat seasons not checked: the species sheets did not answer", with `NotChecked`, and keep a "Check again".

### 2. P1. The import gives other numbers than its review showed, and says they were "taken" (confirmed; makes /about/formats false)

`src/lib/import/plan.ts:99` numbers rows in sheet order (`for (const r of live)`); `src/lib/import/commit.ts:169,234-235` writes rows that keep their own number first (`plan.order`) and lets the collection mint the 2nd and later plants of a Qty row itself. When a numbered Qty row comes later in the sheet than an unnumbered row of the same year, the collection mints that row's extra plants first and the unnumbered row is pushed to the next free number.

My sheet: the done screen said "27 numbers were taken, so the next free one was given: line 12, 2026-0001 → 2026-0017; line 23, 2009-0001 → 2009-0002; …". Nothing else took them: this import did. Plants of Qty rows got different numbers from the review too, and those are not reported at all (only `made[0]` is compared). `/about/formats` says "The numbers shown in the review are the numbers given."

The existing unit test (`r61g-import.test.ts`, "each plant gets the planned number") compares sorted sets of numbers, so it cannot see which plant got which.

Repro: `grower--import-numbers.test.ts` test 1: sheet `,Aloe vera,1` then `0002,Copiapoa cinerea,3`. Review: Aloe vera 2026-0001, C. cinerea 0002, 2026-0002, 2026-0003. Given: Aloe vera 2026-0003, C. cinerea 0002, 2026-0001, 2026-0002; `renumbered` holds "line 2, 2026-0001 → 2026-0003".

Smallest fix: plan in write order. In `planNumbers`, iterate `order` (kept rows first) in the second loop (`const byKey = new Map(live.map((r) => [r.key, r])); for (const r of order.map((k) => byKey.get(k)!))`). Tried in my copy: test 1 passes, and `r61g-import`'s "running maximum" guard then needs its expectation built in the same order. The sturdier fix is for the commit to pass every planned number explicitly (a list to `addAccessions`), so the collection never mints inside an import.

### 3. P1. A second run of the same sheet adds 28 lines (42 plants) again (confirmed; makes /about/formats false)

`src/lib/import/plan.ts:117-126` (`markAlreadyImported`) recognises a line only by the number the sheet gives, held here under the same name and cultivar. So these come back as new on a second run:

- every line with no number of its own (sheets with no number column at all are common);
- a line the first run renumbered (an in-file duplicate, or a number used here);
- a line whose name the grower corrected in the review ("Copiapoa cinera", "Use it": filed as C. cinerea, the sheet still says cinera).

Second run of my sheet: "272 lines look already imported … skipped", then "28 lines, 42 plants. Add 42 plants". `/about/formats`: "an import cut off partway keeps the lines before it, and running it again skips them". The case the round set out to fix (round 60 grower 6: a phone import cut off, run again) still duplicates for exactly the sheets that carry no numbers.

Repro: `grower--import-numbers.test.ts` test 2 (lines 2, 4 and 5 of four are not found); browser: `04-import-second-run-desk.png`.

Fix: give each imported plant a durable import key and match on it: for example `sourceRef` (or a new field) set to a hash of the sheet's normalised row cells, which survives renumbering and renaming. Failing that, match unnumbered lines on name + field number + acquired + source and say "probably already imported".

### 4. P1. "Select these" on a place page does not open select mode when tapped (confirmed)

`src/lib/ui/grow/SelectMode.svelte:24` reads `start` once, in its own `onMount`. `src/routes/plants/+page.svelte:72-81` sets `selectStart` in the page's `onMount`, which runs after the child's. When the collection is already open (any in-app navigation, which is how the link is used), `SelectMode` mounts in the same tick and sees `start = false`. A full page load works only because the list is empty until the vault opens, so the child mounts later.

The two tests miss it: `r61l-records.spec.ts:142` checks only the link's `href`, and `r61a-a11y.spec.ts` "r61a 12" uses `page.goto`.

Repro: `grower--r61rev.spec.ts` test 1 (Expected "Done selecting", Received "Select"). By hand: client navigation twice gave `HEAD Select`, then a full load of the same URL gave `HEAD Done selecting | Tick all 46` (`13-select-these-not-selecting-phone.png`). The `select=1` is then dropped from the address, so a reload does not help either.

Fix: `$effect(() => { if (start) on = true; })` in SelectMode, or read `?select` from `page.url` in the page's script body rather than `onMount`.

### 5. P1. The date choice and "Add them to each plant's notes" stay live above the review but no longer apply (confirmed)

`src/routes/plants/import/+page.svelte:139` reads `dateOrder` and `extraToNotes` once, in `review()`. The fieldset (`:341-346`) and checkbox (`:334`) remain on screen and changeable after "Check names", above a review that says on each line "09/03/2024 could be 9 March or 3 September, so it was left as written".

The natural move is to scroll up and pick "Day first". The radio changes, the review does not, and "Add" adds the plant with the date left as written. Unticking "Add them to each plant's notes" also leaves "Locality: …" in the notes.

Repro: `grower--r61rev.spec.ts` test 2; phone screenshot `05-import-choice-after-review-phone.png` shows "Day first" ticked and "This column is then left out" over a review still saying "left as written" and "Locality: Totoral, Chile". The done line: "2 plants added, numbered 2024-0001 and 2007-0001".

Fix: an `$effect` on `dateOrder`, `extraToNotes`, `mapping` and `header` that, when `rows.length`, re-runs `rowsFromSheet` (it is local and fast), or clears the review with "Your choices changed: check names again". The mapping selects have the same problem.

### 6. P2. A real sheet's ">" paths become flat top-level places, out from under their parent's rules (confirmed; the decision R7, argued)

`src/lib/import/plan.ts:133` splits on " › " only, as decided. But no keyboard has "›", so a grower's own sheet writes "Greenhouse > Bench 2" or "Greenhouse/Bench 2". My import made both "Greenhouse › Bench 2" and a top-level place called "Greenhouse > Bench 2" (58 plants). The review's offer reads "Make these 10 places …: Greenhouse, Windowsill, Greenhouse > Bench 2, …, Greenhouse › Bench 2", which looks like a duplicate rather than a decision.

The consequence is not cosmetic. With the Greenhouse set to "every 10 days, dry Nov to Feb", the flat place inherits neither. The calendar file then has "Water Greenhouse > Bench 2 (every 21 days)" with 15 waterings in November to February (expanded), and Today will list those 58 plants as due in winter.

Fix: when a sheet's place cells contain ">" or "/" between words, ask once for the sheet ("Read > and / as a path, as in Greenhouse > Bench 2", default yes when the first part names a place here or another cell's first part). That keeps "Shelf >1 m" safe without making every grower's paths flat.

### 7. P2. An undescribed species with a provisional name ("Copiapoa sp. 'Pan de Azúcar'") is filed as a hybrid (confirmed)

`src/lib/core/names.ts` (the qualifier branch): `kind: … cultivar ? (compared ? 'cultivar' : 'hybrid')`. A quoted part after "sp." or "sp. nov." is taken as a cultivar of a bare genus, hence a cross. The import review says "a cross, filed under its genus"; the plant page says "HYBRID · … A hybrid; parentage not stated. Add it if you know it."; the label code carries no species (`08-plant-sp-provisional-phone.png`, `06-plant-0292-phone.png`). Writing a provisional name or a collector's designation in quotes after "sp." is everyday practice in cacti and bulbs.

Repro: `grower--names.test.ts` (3 cases fail).

Fix: in the qualifier branch, a quoted part after `sp.` stays in `scientific` (as `Lithops sp. C 036` already does unquoted) and `kind` is `species`.

### 8. P2. Spending: the same currency in two totals, common price forms unread, and Qty rows multiplied (confirmed)

`src/lib/ui/grow/spend.ts:12-13`.

From my sheet: "All time: £363.50 on 54 plants, €370.50 on 38 plants, 336 EUR on 28 plants, 182 GBP on 26 plants, $120 on 15 plants, 126 CHF on 14 plants and 76.50 on 17 plants with no currency given. 172 prices could not be read as a number" (`17-spending-desk.png`).

- **Same currency, two totals.** £ and GBP, € and EUR are totalled apart. Saying GBP and £ are one currency is not a conversion.
- **Unread forms.** "US$15", "R85" (rand: South African bulbs are sold in it), "£1,250" (a thousands comma) and "£12.00 each" are not read.
- **Qty rows.** A Qty 3 line's price is given to each of its three plants (`commit.ts` `recordOf`, one `rec` for all), so "£12" for a pot of three counts £36. The review does not say which way it was read.

Fix (tiny): an alias map (GBP→£, EUR→€, USD/US$→$, and A$, NZ$, C$, ZAR/R as their own codes), a thousands separator when followed by exactly three digits, and on Qty rows say "price given to each plant" in the review, or put it on the first plant only.

### 9. P2. A plant's page says "Name not checked" for a name the reference was asked about and did not hold (confirmed)

`src/routes/plants/[acc]/+page.svelte:571`. The import review said for 247 lines "not in the reference; added as typed" (a checked answer), and every one of those plant pages then says "· Name not checked", whose reason reads "it matched no reference name, or the name service did not answer". The record cannot tell the two apart. That breaks rule 2 the other way round: an answer said as a non-answer.

Fix: say "Name not in the reference" when `sheetForName` answered `none` (`ref === 'none'`); keep "not checked" for `unreachable`.

### 10. P2. A Move that empties a place-filtered list closes select mode and drops focus to the page (confirmed)

`src/routes/plants/+page.svelte:261-268`: `SelectMode` is inside `{:else}` of `{#if !list.length}`. "Select these" → Tick all → Move to Bench 3: the list of Bench 2 is now empty, SelectMode unmounts, "No plants match." is shown, and `document.activeElement` is `BODY` (`18-after-move-filtered-list-phone.png`). Agent A's report says focus goes to "Move to a place" after Move. Undo puts the plants back but select mode stays closed.

Fix: render SelectMode (its head and bar) even when the list is empty while `on`, or move focus to the toast's Undo when the list empties.

### 11. P3. Smaller confirmed slips

- **Hybrid parentage while loading.** A hybrid's parentage is shown as "A hybrid; parentage not stated. Add it if you know it." until the index lookup for links answers. That took over 0.9 s under load, at `[acc]/+page.svelte:574`. Parentage stored as "Astrophytum asterias × Astrophytum capricorne" appears at 4 s. Fix: draw the names from `parents(parentage)` at once and add the links when they come.
- **Partial dates on the edit form.** The edit form shows an imported "2017-08" as an empty date field with no hint (G's "Needs" 8, not applied). Saving another field keeps it (sound). Suggest "As imported: 2017-08".
- **`mintYear` in commit.** `commit.ts:61` `mintYear` still uses `/^\d{4}-/` after the lead changed the collection's `yearOf` to `/^\d{4}(?:-|$)/`. Year-only Qty rows are written one plant per commit for no reason, and the comment at `:212-213` is now false.
- **Removed plant's label.** Scanning a removed plant's label says "0013 Haworthia retusa was removed": its cultivar 'King' is dropped (`[acc]/+page.svelte:535`).
- **Stranger labels.**
  - Zero-width spaces, U+2028 and soft hyphens survive in the shown name (`qr.ts` `UNSAFE`): use `\p{Cf}\p{Zl}\p{Zp}`.
  - A "sp." plant's code carries a genus slug (`s=conophytum`), and the page then says "Its species has no page in the reference yet": give no slug for a name without an epithet, as for crosses.
  - A hybrid's code carries only "Astrophytum", not its parentage.
- **The sample.**
  - Today's frost line says "Set your site in Settings" while Settings is shut in the sample (the front page offers "use my location"; Today does not).
  - A compare pick made in the sample stays in the grower's `cultifolio.compare` after Leave. That is harmless, but `/about/formats` says nothing of the sample reaches "settings".
- **Wording.** "Every 1 days" on a place with a 1-day rhythm (place page and the .ics summary "(every 1 days)").
- **Dates left unread.** "Aug-17", which is Excel's default month-year display, and Excel serial numbers ("45123") are left unread and numbered for this year. A sheet with "17/11/2007" and "22/10/2023" (which can only be day first) still asks with no hint which way its own other dates go.
- **Labels.** After a reload the sheet stock is kept but the plants picked with the filter are not ("Print 0 labels").
- **Still open from 60.** The sample is offered only to a grower with no plants. "× Gasteraloe" is filed without its × (`grower--names.test.ts` last case).

## Checked and sound

- **Import, columns and parsing.**
  - Mapping found all ten of my columns automatically (Acc No., Genus, Species, Field number, Qty, Date acquired, Source, Price, Bench, Notes).
  - Locality and Pot size were listed before "Check names" and added to notes as "Locality: Sierra Gorda, Qro." / "Pot size: 7cm".
  - Notes kept line breaks and leading spaces; `=SUM(A1:A3)` stayed text.
  - Qty 2 and 3 made that many plants; "3+" and "several" were said on the line and kept as "Qty: several".
- **Import, dates.** 55 ambiguous dates were asked about once. "2009", "Aug 2017", "Feb 2022", "17-Aug-2016", "12.04.2015", "22/10/2023", "30/09/09" (2009-09-30) and "1/2/03" (day first) were read at their precision. A future date, "2024-13", "?" and "spring 2019" were refused, with the text in the notes and the year used for numbering.
- **Import, names.** cf./aff./sp./nov. were kept in the name and the reference was asked about the species ("filed as written; the reference was asked about Copiapoa cinerea"); "(white flower)" was kept as name as received; "ssp." became "subsp."; "Copiapoa cinera" was offered "did you mean Copiapoa cinerea? Use it".
- **Import, the rest.** The in-file duplicate was said with both lines; "Show only lines that need me"; Last watered was recorded on 382 plants; both leave guards worked; and the speed was fine for 300 lines.
- **Plant pages after the import.** Partial dates show as written ("acquired from eBay 2017-08", log "2017-08 Acquired"); hybrid parentage is stored; a cf. plant links the compared species' page; and a partial date survives an edit of another field.
- **Labels.**
  - The sheet choice survives a reload, and the default is L7160 for en-GB.
  - On A4 L7160 the QR codes sit at a column pitch of 65.9 mm and a row pitch of 38.1 mm (stock 66.0 and 38.1), from 9.2 mm left; Letter 5160 is right too.
  - All detected codes decoded (14 of 14, 12 of 12, 13 of 13); the fragment never reached the server.
  - Hostile names were shown as text, with the bidi override stripped.
  - A removed plant's label offers Restore and restores; a stranger's label is headed "A plant label".
- **Sample.**
  - Own units cookie, site, label stock and `hasMine` are untouched by the sample; the sample's own copies sit under `cultifolio.demo.*` and are cleared on Leave; the demo database is deleted.
  - A second sample tab was sent home with "The sample collection was closed in another tab. This is your own collection."; an own tab open beside it was undisturbed.
  - Settings is locked with its heading; the frost watch in the sample does not read the grower's site.
- **Select mode.** Move opens on "Choose a place…", with focus on the picker; Move with nothing chosen says 'Choose a place first, or "No place".'; Move Undo restores; and Water skips plants already watered today. Archive asks first (focus on Keep), archives 2 and logs them; its Undo gives "Undone: 2 growing again, the archive lines removed." and both rows come back.
- **Calendar file.** CRLF only, longest line 75 octets, unique UIDs, 13 VALARMs (one per event, `TRIGGER:PT9H`), DATE-valued DTSTART and UNTIL. A place dry Nov to Feb has 51 waterings to Oct 2028 with none in a dry month, ending 31 Oct and restarting 1 Mar 2027 and 1 Mar 2028. The all-dry Cold frame was left out and named. A 1-day rhythm expands daily.
- **Sync words (read).** Parked records are named as the grower knows them ("A photograph of 0055 Copiapoa humilis, taken …", "Your notes on …", field words deduplicated); held changes are counted in words. Guard: `grower--parked-words.test.ts` (passes).

## Suggestions for adoption, ranked by impact over effort

1. **Commit the planned numbers (tiny).** Iterate the plan in write order, or pass every planned number to `addAccessions`. The review then never lies about a number (finding 2).
2. **"Select these" opens select mode (tiny).** A reactive `start`, and a test that clicks the link (finding 4).
3. **Review choices that cannot go stale (tiny).** Re-read the sheet when its date choice, notes box or mapping changes after "Check names" (finding 5).
4. **Say "habitat not checked" on Today when the sheets fail (small).** This is rule 2 on the page growers open daily (finding 1).
5. **Import keys for restarts (small).** A per-line key stored on each imported plant makes a second run skip every line, numbered or not, renamed or not (finding 3).
6. **Ask about ">" and "/" in place paths once per sheet (small).** Otherwise real sheets lose their place tree and their dry months (finding 6).
7. **Currency aliases, thousands separators, and the Qty-price question (tiny).** (finding 8)
8. **Provisional names after "sp." are species (tiny).** (finding 7)
9. **"Not in the reference" versus "not checked" on the plant page (tiny).** (finding 9)
10. **Keep select mode through a Move that empties the filtered list (tiny).** (finding 10)
11. **A last calendar event (tiny).** On the two-year horizon, add "Cultifolio: download the watering calendar again", so the reminders do not stop silently in October 2028.
12. **Read Excel's "Aug-17" and serial dates by the same once-per-sheet question (small),** and preselect nothing but show the evidence: "this sheet also has 17/11/2007, which can only be day first".
