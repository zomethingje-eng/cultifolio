# Records review of round sixty-one: numbers, dates and names in and out

The round's record-page work holds: the `{#key}` layouts drop forms between records without losing anything that should stay (scroll on Back, an upload in progress, an Undo), the mark bit survives every backup path byte for byte, and a partial date survives the plant page's edit form and every reader but one. The import is where the round's claims break. "Running it again skips them" is true only for a numbered line whose name nobody changed: a sheet without a number column, or a line fixed with "Use it", is filed twice on the second run. "Use it" itself throws away the sheet's "cf.", subspecies and bracketed note and files the plant with the species' key, and "nr." or "cfr." are dropped without even that. A Status or Kind the import cannot read is said on the row and then lost. A sheet over 2,000 lines can never be finished. The sheet options stay live after "Check names" and are ignored. Two seams: a backup carries this load's clock-only parks into the manifest, and a replace then stores them (rule 5); and `/about/formats` still states the restore rule the round replaced.

**How I covered it.** I read every file in the brief's list, the two agents' reports, REVIEW-ROUND-61 sections 2, 3, 11 and 12, and last round's records review. In Chromium (Playwright, the shared server at 4173, a fresh context each run) I ran 9 probe scripts: the edit form on a `2009` and a `2017-08` plant (save untouched, Backspace in the empty-looking field, partial typing); four 4000×3000 photos added on one plant while navigating to another; scroll and Back across two keyed plant pages; a cf. and an sp. plant through the plant page, species page and labels; the import with "Use it" and a re-run; the date choice changed after review; a 2,003-line sheet over 2,000 plants already here. In Node I fed `readDate` 45 date strings, the Qty reader 13 values, `parseName` 20 open names, timed a 500, 2,000 and 10,000-row read, and sent `plants.csv` through LibreOffice 24 headless and back. Tests written: 5 unit files (16 tests: 9 fail on f4ab4f8 as reproductions, 7 pass as guards) and 1 e2e spec (3 tests, all fail as reproductions), each run on Node 22. No source file in my copy was changed; only test files were added there. The machine ran at a load of 30 to 43 throughout, so timings are slow and a few runs were repeated after an out-of-memory kill.

## Findings

### 1. P1, confirmed. Running an interrupted import again files the same plants twice, unless each line carried its own number and kept its name

- **Where:** `src/lib/import/plan.ts:155` (`markAlreadyImported`, the only "already imported" test); the claim is on `/about/formats` (Import paragraph): "Each line is its own change, so an import cut off partway keeps the lines before it, and running it again skips them".
- **What happens:** a line counts as already imported only when the sheet gives it a number and a live plant here holds that number under the same scientific name and cultivar. So:
  - a grower's sheet with no number column (the common case: numbers are what the app gives) is filed again from the top on the second run, every line the first run added becoming a second plant under the next number;
  - a numbered line whose name the review changed ("Use it", or an edit of the name box) is not recognised, is renumbered as "already used here", and is filed twice;
  - a multi-plant year-only row written one plant at a time (finding 10) and cut off between plants is skipped whole on the second run, so the plants it had not yet written are never added.
- **Should:** what the page promises: a second run of the same sheet adds only what the first did not.
- **Reproduction:** `tests/records--r61-import-restart.test.ts`, both FAIL. The first: a 4-line sheet with no numbers, the vault refusing the third plant (the tab closed), then the same sheet again: `Copiapoa cinerea` 2019-0001 and 2019-0002, `Copiapoa humilis` 2020-0001 and 2020-0002. In the browser (probe p5): lines 2024-0001 and 2024-0002 fixed with "Use it" and added; the same sheet read again says "2 numbers given are already used here: those plants get the next free number (2024-0001 → 2024-0004, 2024-0002 → 2024-0005)".
- **Smallest fix:** record what the sheet said on the plant (`nameAsReceived` = the sheet's name whenever the filed name differs, see finding 2), and match a line as already imported by (number, sheet name) against `taxonName` or `nameAsReceived`. For unnumbered lines, either stamp each import line's identity into the record (a hidden `importKey` = hash of the sheet's row text) or say plainly on the page and on `/about/formats` that a re-run skips only numbered lines.

### 2. P1, confirmed. "Use it" replaces the whole name with the suggestion: the sheet's "cf.", subspecies and bracketed note are lost, and the plant is filed at species rank with the key

- **Where:** `src/routes/plants/import/+page.svelte:192` (`useSuggestion`: keeps only a quoted cultivar), with `recordOf` (`src/lib/import/commit.ts:37`), which sets `nameAsReceived` only from the row's current name.
- **What happens:** the review offers "ambiguous: not under this name; did you mean Copiapoa cinerea? Use it" for a misspelt species part. Pressing it on "Copiapoa cf. cinera" files "Copiapoa cinerea" with key 5384013; on "Copiapoa cinera subsp. haseltoniana (white spines)" it files "Copiapoa cinerea", key 5384013, `nameAsReceived` null. Nothing of the sheet's text survives: the doubt the round promised to keep ("cf." … "stay in the name … filed with no reference key"), the subspecies, and the note in brackets that the round promised to keep "with the name as received". A grower reads "did you mean" as a spelling fix.
- **Should:** the suggestion replaces the species part only: "Copiapoa cf. cinerea", "Copiapoa cinerea subsp. haseltoniana", with the aside kept as received; the original text goes to `nameAsReceived`.
- **Reproduction:** `tests/records--r61-import.spec.ts` test 1 (FAILS: `Expected substring: "cf." Received string: "Copiapoa cinerea"`).
- **Smallest fix:** in `useSuggestion`, rebuild the name from `parseName(r.name)`: put the suggestion's genus and epithet in place of the species part and keep `qualifier`, the infraspecific rest, the cultivar and the aside; and keep `r.originalName` (the sheet's text) on the row, which `recordOf` writes to `nameAsReceived` whenever it differs from what is filed.

### 3. P2, confirmed. "nr." and "cfr." are dropped without a word, and the plant is filed as the species with its key

- **Where:** `src/lib/core/names.ts:117` (`QUALIFIER` knows cf, aff, sp, spp) and `:126` (a second word that is not an epithet is left out of `scientific`).
- **What happens:** "Mammillaria nr. bombycina" and "Mammillaria cfr. bombycina" parse to "Mammillaria bombycina" at species rank. In the browser, "Copiapoa nr. cinerea" shows "matched" in the review and is filed as Copiapoa cinerea with key 5384013 and no name as received. The same path drops any dotted word in second place ("Mammillaria ssp. bombycina"). "The import drops nothing unseen" (REVIEW-ROUND-61 3.1) does not hold for the two other common ways of writing the same doubt.
- **Should:** "nr.", "near", "cfr." and "vel aff." are qualifiers like "cf."; any second word that is dropped goes to `nameAsReceived`.
- **Reproduction:** `tests/records--r61-names-dates.test.ts`, "Mammillaria nr. bombycina keeps its qualifier" and the cfr. case (FAIL).
- **Smallest fix:** `QUALIFIER = /^(cf|cfr|aff|nr|near|sp|spp)\.?$/i`, written one way ("cfr." → "cf.", "near" → "nr."); and in `recordOf`, `nameAsReceived` = the typed name whenever `parseName(typed).scientific` plus cultivar is not the typed text minus spacing.

### 4. P2, confirmed. A Status or Kind the import cannot read is said on the row, then dropped: a sold or dead plant arrives as growing

- **Where:** `src/lib/import/rows.ts:94-99`. Provenance's unread text is added to the notes; Kind's and Status's are not.
- **What happens:** a sheet with Status "sold" or "Died 2023", or Kind "Cactus", gives `status: 'growing'`, `nameKind: null`, notes null; the words survive only in the review's problem line, which is gone after Add. The plant then shows as due for water on Today. The file's own comment says "a value a field cannot take is left empty and said on the row, and its text kept in the notes, never guessed and never dropped"; "added as growing" is a guess, and the word is dropped.
- **Reproduction:** `tests/records--r61-names-dates.test.ts`, 'Status "sold" and "Died 2023", and Kind "Cactus", reach the notes' (FAILS).
- **Smallest fix:** `addNote(r, \`Status: ${v.status}\`)` and `addNote(r, \`Kind: ${v.kind}\`)` beside the two problems, as Provenance does; and read the obvious words ("died", "dead", "lost" → dead; "sold", "given away", "gone" → archived) only if the page says so.

### 5. P2, confirmed. A sheet of more than 2,000 lines can never be finished

- **Where:** `src/routes/plants/import/+page.svelte:144-147`: the list is cut to `MAX_ROWS` before `markAlreadyImported`.
- **What happens:** the page says "Only the first 2000 lines are read at once; import the rest after." Read again, the same file gives the same first 2,000 lines, now all "already imported: skipped", and "Add 0 plants". Lines 2,001 on are never reached unless the grower splits the file by hand, which the page does not say.
- **Reproduction:** `tests/records--r61-import.spec.ts` test 3 (FAILS: `Expected substring: "Add 3 plants" Received string: "Add 0 plants"`). Screenshot `shots/records/import-truncated.png`: "0 lines (2000 dropped), 0 plants".
- **Smallest fix:** mark already-imported lines first, then take the first 2,000 lines that are not already here; or say "save the rows after line 2,001 as a second CSV".

### 6. P2, confirmed. The date choice, the notes box and the column mapping can be changed after "Check names", and are then ignored

- **Where:** `src/routes/plants/import/+page.svelte`: `dateOrder`, `extraToNotes`, `mapping` and `header` are read only in `review()`; the controls stay live above the review.
- **What happens:** a sheet with 09/03/2024, Day first, Check names; the grower then picks Month first and unticks "Add them to each plant's notes". The page shows Month first and the box unticked; Add files `acquired: 2024-03-09` and `notes: "locality: Taltal"`. This is the brief's "answers day first and then edits".
- **Reproduction:** `tests/records--r61-import.spec.ts` test 2 (FAILS: `Expected: "2024-09-03" Received: "2024-03-09"`). Screenshot `shots/records/import-stale.png`.
- **Smallest fix:** an `$effect` on those four values that clears `rows` and `plan` once a review exists (status: "The choice changed: check the names again"), or disable the controls while a review is open.

### 7. P2, confirmed. A backup made while a park judged by the clock alone is in memory turns it into a stored park on restore (rule 5)

- **Where:** `src/lib/backup/io.ts:27` (`parked: collection.parkedStamps`); `parkedStamps` holds this load's clock-only parks as well as the stored ones (`collection.svelte.ts:101`, `notePark`). A replace stores the manifest's list (`replace.ts`, `stage.setParked`), and a merge stores it too (`io.ts`, `collection.markParked(toPark)`).
- **What happens:** round sixty-one stopped storing clock-only verdicts ("No device keeps a verdict of its own clock alone", `/about/formats`). The backup writes them into `manifest.parked` as if they were verdicts by arrival, and a restore of that file, here or on a new phone, stores them for good. A park that would have lapsed at the next load once the clock was found wrong is then permanent.
- **Reproduction:** `tests/records--r61-backup-rule5.test.ts` (FAILS): a peer change 2.5 days ahead from a file, the clock confirmed, a reload (parked for the load, `meta.parked` empty), `prepareBackup()`: `manifest parked: [ '1791632453987-0000-bbbbbbbbbbbbq0q0' ]`; after `replaceThroughStaging`, `meta.parked` holds that stamp.
- **Smallest fix:** expose the stored set (`storedParked`) and pass only it to `buildBackup`; the clock-only parks are judged again by whoever loads the file.

### 8. P2, confirmed. `/about/formats` still states the restore rule the round replaced

- **Where:** `src/routes/about/formats/+page.svelte`, the numbers paragraph: "A removed plant or batch brought back (Undo) yields its number only to a record created after the removal … a record that already held the number before the removal is not displaced". The code (`collection.svelte.ts:1479-1490`) now yields to a record whose first change reached this device after the removal, whenever it was created; REVIEW-ROUND-61 2.4 says so and calls it a departure. Rule 4: `/about/formats` states every rule.
- **Reproduction:** `tests/records--r61-about-restore.test.ts` (FAILS on the old sentence). The seam test `r61w-about-seams.test.ts` does not check this paragraph.
- **Smallest fix:** "… yields its number only to a record that reached this device while it was removed (by the order in which changes arrived here, never by two devices' clocks), and says so in a note on it; when that order is not known (changes stored before round sixty-one), both keep the number and the pages offer to renumber." Also drop "(Undo)": the removed plant's page restores too.

### 9. P3, confirmed. Today's and the list's "no photograph in twelve months" read a year-only date as 1 January

- **Where:** `src/lib/ui/photo-due.ts:28-29`: `since = a.acquired ?? …`, compared as a string with the date six months ago.
- **What happens:** a plant imported today with "2026" counts as kept six months or more ("2026" < "2026-04-07"), and so does "2026-04" (which may be 30 April). Rule 3: the period's first day is a guess. G's report says the readers "treat them as the first of the year or month"; neither about page says so.
- **Reproduction:** `tests/records--r61-names-dates.test.ts`, 'the photo rule does not read "2026" or "2026-04" …' (FAILS); its guard (a period that ended six months ago counts) passes.
- **Smallest fix:** compare the period's last day: `const end = a.acquired.length === 4 ? \`${a.acquired}-12-31\` : a.acquired.length === 7 ? \`${a.acquired}-31\` : a.acquired;`.

### 10. P3, confirmed. A year-only row of several plants is still written one plant at a time

- **Where:** `src/lib/import/commit.ts:67` (`mintYear` keeps the old `/^\d{4}-/`); the merge changed `yearOf` in `collection.svelte.ts:15` (REVIEW-ROUND-61 11, "a year-only `acquired` mints that year's number") but not this copy.
- **What happens:** "Copiapoa cinerea, 2009, Qty 3" is three commits instead of one. Numbers are right; atomicity is not, and with finding 1 a stop between them leaves plants a re-run never adds. G's own test pins the per-plant behaviour (`r61g-import.test.ts:162`, "the year-only row of two is written a plant at a time").
- **Reproduction:** `tests/records--r61-names-dates.test.ts`, 'a row "Copiapoa cinerea, 2009, Qty 3" is three plants in one commit' (FAILS: 4 appends, not 2).
- **Smallest fix:** `/^\d{4}(?:-|$)/` in `mintYear` (or import `yearOf`), and update `r61g-import.test.ts:162` to `1 + 1 + 1 + 1 + 1`.

### 11. P3, confirmed. The plant page's date field shows a partial date as empty, with no word

- **Where:** `src/routes/plants/[acc]/+page.svelte:611`.
- **What happens:** the card says "acquired 2017-08"; Edit shows the Acquired field empty. Saving keeps the stored value (checked: untouched, Backspace in the field and typing part of a day all leave `2017-08`; Chromium fires no input event). But a grower who thinks the date is missing and fills it in replaces "2017-08" with whatever day they guess. G's "needs from others" item 8 (a hint under the field) was not applied.
- **Smallest fix:** under the field, when `a.acquired` is not a full date: "As imported: {a.acquired}. Pick a day only if you know it."

### 12. P3, read. After a replace from a backup, "reached this device while removed" is judged by the stamps again

- **Where:** `src/lib/db/vault.ts` `copyStagingIn`: the staged changes are read with `getAll('changes')`, in key (stamp) order, and stored through `storeIn`, which writes the order store in that order.
- **What happens:** after a Replace, every change's arrival is its stamp order, so `restore`'s `arrivalsOf` compares two devices' clocks once more, the thing round sixty-one removed. The note "another plant numbered X reached this device while this one was removed" can then be false.
- **Smallest fix:** carry the exporting device's arrival order in the backup (the order store's sequence of stamps) and write the staged changes in it; or, after a replace, treat arrival as unknown for changes the file brought (`restore` then leaves the number shared, as it does for older changes).

### 13. P3, confirmed. Open names on the surfaces around them

- **The review** says "not in the reference; added as typed" for "Copiapoa sp." or "Lithops sp. C 036" (the genus is asked as if it were a species, `check.ts`), and "filed as written; the reference was asked about …" for cf. and aff.; `/about/formats` says "filed with no reference key". Neither line says the key is left off, and the sp. line suggests the name is wrong.
- **The plant page** of "Lithops sp. C 036" says "Name not checked" with "Edit the plant and pick the name from the list to check it": advice to replace the open name with a species. Rule 2: the reference answered; nothing was left unchecked.
- **"My notes on Copiapoa cf. cinerea, shared by every plant of this species"** writes to Copiapoa cinerea's notes (`saveMyNotes`, `speciesSlug`), shown on that species' page; for "Lithops sp. C 036" it writes to a taxon record named "Lithops" shared with every Lithops hybrid.
- **A scanned label** of "Lithops sp. C 036" carries `s=lithops`; a stranger's device says "Its species has no page in the reference yet" (`ForeignLabel.svelte`), wrong for a genus. (Read; the slug is `speciesSlug("Lithops sp. C 036")` = `lithops`, checked in Node.)
- **What is right:** for cf. the species link, the care line ("cooler six months Nov–Apr · hab. night 6.5 °C …" on the label), the habitat panel and the QR's `s=` are the compared species', as decided; `nameParts` sets "cf." and everything after "sp." roman. Screenshot `shots/records/labels-cf.png`.
- **Smallest fix:** one sentence per surface: review "filed as written, with no reference key"; plant page for a qualifier: no NotChecked, "an open name: filed with no reference key"; My notes heading names `speciesOf(a.taxonName)`; QR omits `s=` when `speciesOf` has no epithet.

### 14. P3, confirmed. Smaller edges of the date and name readers

- "1/1/27" is read as 1927-01-01: a two-digit year can never be in the future, so a typo for 2027 becomes a 1920s plant with a 1927 number, for good.
- "09/03/2024 10:15" and "9/3/2024 0:00" (a date cell with a time, as Excel writes a date-time) are not read, and are not counted as ambiguous, so the day-first choice does not reach them.
- "Lithops sp. v 036" becomes "Lithops sp. var. 036" (`tidyName` rewrites "v " after "sp."); "cf. Aloe vera" becomes "Cf. aloe vera" with slug `cf-aloe`.
- Qty "3.0" (a number cell exported with decimals) is not read: one plant, and "Qty: 3.0" in the notes. It is said on the row, so this is polish.
- **Fix:** a two-digit year is read only when 20YY is not to come, else left with its year; strip a trailing ` \d{1,2}:\d{2}(:\d{2})?` before the three-number rule; `tidyName` does not rewrite ranks after "sp."; a leading qualifier is moved after the genus; Qty accepts `^\d+(\.0+)?$`.

## Checked and sound

- **The `{#key}` layouts** (`plants/[acc]`, `propagation/[id]`, `places/[id]`):
  - an upload in progress survives the page being remade: four 4000×3000 JPEGs added on plant A, then the shared-number link to B before the first was stored; all four photo records name A (the destroyed component's `id` keeps its last value);
  - scroll: plant A scrolled to 1500 px, link to B (top, 0), Back: A at 1500 with A's heading;
  - the toast lives in the root layout; L's guard "Undo of a removal, pressed after opening another plant" holds for the same reason as the upload; the death Undo and the batch-failed Undo close over the same kind of `id` and so act on the record they were made on;
  - the leave guard runs on the old page before it is destroyed, and no record page navigates between a number and an id of the same record with a form open (the renumber `goto` runs with nothing open).
- **A partial date through its readers:** spending (`startsWith(year)`), `daysBetween` ("2009" is 1 January; only reached after `madeOn`, which every app-made id has), Today's and the calendar's start day (`lastWatered ?? madeOn ?? acquired`), the batch form's "before the parent arrived" (string order is right at every precision), the label's source line (text), the plant card ("acquired 2009"), sorting (by number), the acquire line in `events.csv`, numbering (`yearOf` takes "2009"), and sync (`changeError` checks types only, so older builds take it).
- **The edit form keeps a partial date** when untouched, after Backspace in the empty-looking field, and after typing part of a day: three saves, `acquired` stayed `2009` / `2017-08`.
- **The backup round trip:** marked stamps (`hlcPast`, 6 hex digits) pass `isHlc`, sort after the stamp they were placed past, come back from `changes.json` byte for byte, fold to the marked edit, stay in a merge's `fresh`, and `manifest.parked` lists exactly what it was given. Guard: `tests/records--r61-backup-mark.test.ts` (PASSES).
- **`plants.csv`** writes "2009" bare and "2017-08", "0012", "3-12", "1E5", "1/2/24" and 12 digits as `="…"`; the import reads all back as they were, notes with a leading apostrophe too. Through LibreOffice 24 headless (default CSV filter, opened and saved): every value came back the same.
- **The date reader** on 45 strings: "2024-13", "29/02/2023", "2027", "2026-11" (future), "45123" (an Excel serial), "Spring 2019" (numbered 2019), "c. 2015", "2019-20", "24-03-09" (dashes), "1899", full-width digits: each refused with its reason and its text kept in the notes; "1/2/03", "09.03.2024" ambiguous with their year; timestamps with offsets read by their written date.
- **Qty:** 0, 201, -1, 1e2, "３", "3 plants", "1,000" and a 19-digit run each give one plant, said on the row and kept as "Qty: …"; " 3 " and "00003" are three. A Qty of 200 on 2,000 lines is 400,000 plants, said in the review's count before Add.
- **Formula cells** stay text (`=SUM(A1)` is a note), and the export guards them.
- **10,000 rows:** read, ambiguous-date count, unmapped columns, rows, already-imported and plan in about 3.6 s together at a load of 35 (linear: 500 rows 0.4 s); the page then keeps 2,000.
- **A number given twice in one sheet** keeps it on the first line and says so (`#imp-dupes`); a backup's own `plants.csv` re-imported into its own collection is skipped whole as already imported.
- **`removedAccession` by id**, ForeignLabel only for an id the log never had, and `?parent=` by id with a shared number filtered for the grower (read, and L's e2e).
- **Restore with an unknown arrival** (changes stored before the order store) judges nothing: both plants keep the number and the pages offer Renumber, as the round says.
- **`movePlantsUndoable`** removes only the lines of plants it puts back (R14; read).
- **The staging database** refuses in the sample twice over (`openStaging` by `DB_NAME`, `replaceThroughStaging` and `restoreBackup` by `inDemo()`); `DB_NAME` is fixed per page life, and entering or leaving the sample is a full page load.
- **The QR name** of a cf. plant keeps "cf."; hostile names were G's (`r61g-label-code`), not re-run.

## Suggestions (not bugs), ranked

1. Give each import line a stable identity (a hash of the sheet's row text, kept in a hidden field) so "already imported" works for any sheet, numbered or not. It fixes finding 1 and the 2,000-line limit (finding 5) together.
2. Write full dates in `plants.csv` and `events.csv` as `="2024-03-09"` too, or say on `/about/formats` that a sheet saved back from Excel turns them into the locale's short date: in a day-first locale every date up to the 12th then lands in the import's "could be either" choice, which defaults to leaving them.
3. Lock the sheet controls once a review is drawn (finding 6), and keep the sheet's own name text on every imported plant that was filed under another (findings 2 and 3).

## Files

- Report: `/tmp/r61rev/out/records.md`
- Tests (`/tmp/r61rev/out/tests/`), each with a header saying whether it fails or passes and how to run it:
  - `records--r61-import-restart.test.ts` (2 FAIL)
  - `records--r61-names-dates.test.ts` (5 FAIL, 6 PASS as guards)
  - `records--r61-backup-rule5.test.ts` (1 FAIL)
  - `records--r61-about-restore.test.ts` (1 FAIL)
  - `records--r61-backup-mark.test.ts` (1 PASS, a guard)
  - `records--r61-import.spec.ts` (e2e, 3 FAIL; run with `PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/records--r61-import.spec.ts --retries=0`)
- Screenshots (`/tmp/r61rev/out/shots/records/`): `import-truncated.png`, `import-stale.png`, `labels-cf.png`.
