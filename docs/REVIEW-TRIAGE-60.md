# Triage of the reviews of round sixty

What round sixty-one takes from `docs/REVIEW-SELF-60.md` (nine reviews, reports in `docs/review-60/`) and from outside review B. Outside review A is round fifty-nine's, triaged before; its four partial items are folded in below. Item numbers are the self-review's; B-numbers are review B's.

## Where the reviews agree

- **The clock rule is half implemented** (clock 1 to 5, B7, B8). Peers park a fast device's changes by their arrival; the writer never does, so it shows its own stale value over everyone's edits, and the edit-time rebase added to cover that case has three bugs of its own.
- **Photographs removed before their upload lands stay on the server** (server 1, B9).
- **Title-case common names** (corpus 1, B2, confirmed live).
- **The new labels overclaim** (visitor 1, B15).
- **The sample collection's settings are the device's** (grower 14, records 17, B1).
- **The import loses data and fails partway untidily** (grower 3 to 6, records 6 to 9, B4 to B6).
- **Bulk Archive has no Undo** (grower 8, a11y 9, B3).
- **The about pages are behind the code again** (triage 1, 2, 4, 12; visitor 8, 12; B14, B16).

## Decisions for round sixty-one

1. **Clock: finish decision 1 as it was decided.** When the engine lists the vault, it learns the arrival of every batch, this device's own included. This device's own changes stamped more than two days past their batch's arrival are parked, exactly as `takeBatch` parks a peer's, and listed with Apply. Writer and peers then judge every stamp by the same arrival, so they agree.
   - **Remove the edit-time rebase** (`staleOwn`, the `markParked` in `commit`). It is no longer needed, and its three bugs go with it (items 7, 8, the park before the write, the own text offered back).
   - **Stamp past the field however far ahead,** as now. On the writer before its first listing, an edit to a far-ahead field of its own is stamped past it and shows; the listing then parks the old stamp everywhere alike.
   - **Apply on a parked restore restores** (item 10).
   - **A correction lapses when the device clock moves.** Each reading keeps the server time it was taken at, and a monotonic reference within a tab. A positive correction is not applied once the device clock has itself reached that server time, and a first reading that disagrees by more than two days unconfirms the clock (P2, fuzz seed 1008).
   - **Rule 5:** a load stops storing park verdicts for held changes. Arrival verdicts (from listings and files) stay stored; they are facts about arrival, not readings of the clock.
   - FOLD_RULES 6. The fold-rules hash gains `stampPast`, `commit` and the engine's clock listener. The fuzz asserts its divergence bound, and the five-round two-device test from the clock review is adopted.
2. **Records: a record page is keyed by its id.** `{#key id}` on the plant, batch and place pages, so a navigation drops every open form and draft (P0 item 1).
   - `removedAccession` and the foreign-label check look up by id first, so your own removed plant's label offers Restore (item 19).
   - The remaining number links go by id: the species page chips, Enter in the front-page search when two plants share the typed number, `?parent=`.
3. **The import is lossless and restartable.**
   - **Columns:** unmapped columns are listed before "Check names" and appended to the notes as "Column: value" by default. Qty makes that many plants. Genus and Species columns are joined. "(…)" in a name goes to "name as received".
   - **Names:** cf., aff., sp. and nov. stay in the name, here and in the add form. The reference is checked with the species part only.
   - **Dates:** unambiguous dates are read at their precision: a year, a month and year, or a day over 12. For the ambiguous rest, one choice for the whole sheet: day first, month first, or leave them. Unread date text is kept in the notes.
   - **Speed and restarts:**
     - The plan is frozen while adding, and numbering takes the running maximum.
     - A guard against leaving while adding.
     - Rows whose number is held by a plant of the same name are offered as "already imported", skipped by default.
     - A failure before the first plant is reported with what was made.
   - **Parsing:** an unclosed quote stops the read and says on which row. A repeated header row is dropped. A place path splits on " › " only, after a whole-name match. Notes are not trimmed.
   - **The review:** "Show only rows that need me", and "Last watered" for the whole sheet.
4. **Labels.**
   - The stored sheet choice is read before the collection loads, and the saving effect skips its first run.
   - The body's padding is zeroed in print.
   - The QR name is cut by code point, and one bad code fails only itself.
   - The demo bar, the backup nudge, the iPhone card and the held notice are hidden in print.
5. **Photographs.**
   - The "newer" test decides by claims alone; R2's upload time is dropped from it.
   - A claim is recorded only for an upload that carries the matching drop proof.
   - The proof is checked before anything else.
   - A DELETE 409 is "ask again next run", not final.
   - Hold fencing: the delete re-reads the object's version under a renewed hold just before deleting, and skips it if the version changed. This narrows B10's window to the R2 call itself; B is right that it is not a correctness guarantee, since a second HEAD is still a race. Generation-addressed photo objects with a fenced pointer close it. They are a data-model change and go with that work, now brought forward to the round after this one, and the residual race is stated in `/about/formats` until then. B10's interleaving becomes a test that fails until they land.
6. **Server.**
   - **Recounts:** the retry keeps its generation check. After two crossed listings, a 503 asks the device to try again.
   - **Admission:** `unadmit` keeps the place while another lease is live. `filled:true` is written at the first landing, not at admission. The KV fallback counts per vault and gives back the day.
   - **Places:** a vault's place is reclaimed when it has had no write for 90 days. The daily sweep does it, and a later write admits it again. Stated on `/about/formats` and DEPLOY.
   - **Refusals:** the 503 refusal is kept in the sync meta, so a reload or another tab respects it. The one-hour cap stays, and the page says "or within the hour".
   - **The outside-call cap** moves into the counter object, with separate shares for MET Norway, the NWS and GBIF, and one address may take at most 10% of a share in a minute. The NWS call is counted. A cap refusal says the site held the call back: "not asked: this site's calls are used up for this minute".
   - **Leases:** expiry marks the vault's count stale, so the next request lists.
   - **Smaller fixes:**
     - the sweep pages through its keys;
     - the `/benches` and `/sowings` redirects carry the security headers;
     - the photo route answers "not asked" without timing information.
7. **Search.**
   - **Author citations:** a capitalised word starts a citation only after an epithet of four letters or more. A word ending in "." that is not a rank marker starts one in any case.
   - **Hybrids and cultivars:** after "x" or "×" the name starts again. A quoted text beginning with a capital is a cultivar in the first pass. A hyphenated epithet is one word.
   - **The picker:** it offers no retried hit as a match, and a picked species keeps the typed rank and epithet.
   - **Length cuts:** `searchCatalogue` cuts by code point.
   - **Common names:** `gbif.vernacular` keeps GBIF's `preferred` flag and a count of sources. The build chooses the display name by the corpus review's rule:
     1. English only.
     2. Names containing another genus last, and so are comma lists of several names and strings shaped like a binomial (B).
     3. Preferred first.
     4. Most sources.
     5. GBIF's order last, then the shorter name, then alphabetical order, so the choice never depends on the order of the build.

     Capitals after hyphens are lowered. No source string is split into new names, and every alternative stays searchable. The species page uses the index's rule, and `/about/how` says the shown name is "the English name GBIF reports, chosen by this rule", not the name growers use most (B). Before the deploy, the audit in `docs/review-60/tests/corpus--common-name-rule.test.ts` is run on the live index and a sample of the changed names is read. This needs an index rebuild after the deploy.
8. **Words and credibility.**
   - **Labels** become the figures' own names: "Cold floor (1 night in 100)" with the record low beside it, "Warmest month, mean day", "Rain a year", "Open-sky light". On the glance row, compare and the share card.
   - **Sources:** the chart names CHELSA in its caption. The hero's credit sits where a phone shows it.
   - **Refusals:** a refused or pending climate is said as such, not "on file".
   - **Ties:**
     - ties in temperature name every month;
     - the share card says its hemisphere;
     - the label line says "convention, no source";
     - the title promises cold nights only with extremes.
   - **The about pages:** both are corrected against the code. That covers parking, recounts, refusals, the cap, imported names, the three keys, "Sync bundle", the five-minute slack, the snapshot's checked flag, the label's hash-group check and "variety". The seam test that greps storage keys becomes permanent.
   - **Wording:**
     - "Nothing about a species is written per page by a person or by AI, apart from credited quotations" on the front page;
     - the template disclosure said once and plainly;
     - "undated", "The 1 nearest" and the refusal sentences' article fixed.
   - **The Show HN post:** title 2; "re-derived in about an hour; built from the sources over several days"; the `[AUTHOR]` sentences left for you.
9. **The front page.**
   - **Desktop:** the search and the photographs come first; the feature sits beside or under them within one screen.
   - **Phones:** the four figure cards as a 2×2 block; the chart only on its page.
   - **Where it is sent:** `feature` is sent only for the plain front page.
   - **The sample** comes first in the welcome line.
10. **The sample collection.**
    - Settings, units and the frost site are locked in the sample, as Sync and Backup are, and the label sheet's choices are kept per tab.
    - The flag is read before paint, and the bar is drawn from the server. The sample is set out in one commit.
    - A leftover sample database is deleted on any load outside the sample. A second sample tab is told plainly when the sample closes.
    - Defensive guards in the code, not only CSS: in the sample, the sync engine's setup and run, backup restore and the staging database refuse to start, and the restore staging database is named per collection (B: "the shared staging name and CSS-based hiding").
    - A storage helper with an explicit scope (this collection or this device) replaces direct `localStorage` calls for settings, so the next feature cannot leak across the sample by accident (B's suggestion).
11. **Accessibility and performance.**
    - **Focus:** the toast never swallows Tab without a target. `aria-disabled` replaces `disabled` on the new actions, which move focus where it belongs.
    - **Bundle:** the grow layer is imported by its own path, not the barrel.
    - **Layout shift:** Today holds its frost section until ready.
    - **Forced colours:** the current tab and the toast are fixed.
    - **Reflow and zoom:**
      - the four views that scroll at 320 px and 200% wrap;
      - the select and add bars are static under 480 px tall;
      - Move starts with no place chosen;
      - Archive gets an Undo;
      - the locked sample pages keep their h1.
    - **P3s:** the reports' P3 list (label-in-name, live regions, contrast, Today's chips paged at 50).
12. **Grower.**
    - **Places:** a place filter on My plants, and "Select these" on a place page.
    - **The sync page** words held and parked items plainly.
    - **Counts:** Today's photo count and its chip agree. Spending totals per currency.
    - **Foreign labels:** a scanned stranger's label is headed "A plant label".
    - **The calendar:**
      - a VALARM;
      - the series restarts after each dry run;
      - an all-dry place is left out;
      - the box says to delete the old events first.
    - **"Also today":** the second hiding rule is deleted.
    - **The persistence toast** is shown once the navigation settles.
13. **Harness.**
    - **The calendar:** tests read the year from the clock.
    - **Adopted tests:**
      - the reviews' guards as they are;
      - their reproductions inverted;
      - the 13 harness files.
    - **Vacuous tests:** each one listed is fixed or renamed.
    - **Timeouts** for the zip-bomb and multi-page tests.
    - **Negative assertions:** the e2e tests that wait a fixed time and then assert that something did not appear (`r60-grow.spec.ts:408`, `:449`, and the like in `smoke.spec.ts`) wait instead for the operation that would cause it to settle, then assert (B).
    - **The port** comes from `baseURL`.

## Deferred, with reasons

- Generation-addressed photo objects (decision 5). This is the data-model work; until then, the narrowed window is stated.
- Per-dossier sitemap dates. This needs a date per dossier, which the build does not keep. Until then, the about pages carry no `lastmod`.
- The large-collection tail read (one get per change) and the shells' inline CSS. These are still open from 59 and measured as acceptable at 3,000 plants; they are next after launch.
- Frost-only web push. It is a feature, not a fix, and needs a disclosure design.
- Author credits on tiles. These need a `credit` field in the index (as round sixty said).

## Round sixty-one order

1. **Before anything public** (decisions 2, 8's about pages and labels, and 10's lock):
   - the record pages keyed by id;
   - the about pages true;
   - the labels true;
   - the sample's settings locked;
   - the search's author rule;
   - the hero credit.
2. **Data:** decision 1 with its tests (the five-round test, the fuzz bound, the restore Apply), then decision 5.
3. **The import** (decision 3) and labels (4).
4. **Server** (6) and search (7).
5. **The front page** (9), the sample (10), accessibility (11), grower (12).
6. **Harness** (13): the year first, since the first deploy of 2027 depends on it.
7. **After the deploy:** the index rebuild for the common names, then a live check with no skips.
