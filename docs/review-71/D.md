# Round seventy-one, agent D: records, import, backups, the example

Working copy `(scratch)`, branch `r71`, one commit `3bd59dc` on `r71base` (`cb05efd`). Port 4404. The finding numbers are my report's (`review-70/self-D.md`), which the triage names S-D1 to S-D7.

## Done

**S-D1. A new plain line was taken for an imported plant (`src/lib/import/plan.ts`, `markSheet`).**
- A plant is found by its `importKeyBare` only when the sheet no longer finds it by its own key. While its own line, column and all, is in the sheet, a new line with that column empty is a new plant.
- Unit tests (`r71d-import-bare.test.ts`, "a plain line added beside…" and "…before it"). On the base: `expected [ 'done', 'done' ] to deeply equal [ 'done', 'NEW' ]`, and the same for the other order.
- Browser test (`r71d-import.spec.ts`, "r71d 1"). On the base: Expected "Add 1 plant", Received "Add 0 plants". Here the second plant is added and two plants are stored.

**S-D2. A column deleted re-offered a plant silently (`plan.ts`, `keySheet`).**
- A line's key without the extra columns is now numbered after the plants of the plain lines that share the hash, not among all the lines. So a plain line's own key and another plant's bare key are never one string.
- Unit tests: one line with and one without a locality, in either order, and a Qty of 2. On the base: `expected [ 'done', 'NEW' ] to deeply equal [ 'done', 'done' ]`.
- Browser test ("r71d 2"). On the base: Expected "Add 0 plants", Received "Add 1 plant".

**S-D5. Two plants made four when a column came to tell their lines apart (`plan.ts`, `markImported`).**
- Lines that share the key without the column take plants filed under it when there are at least as many free plants under that hash as such lines still need. Before, they took them only when every other sharing line was found by its own key.
- One plant and two such lines are still neither line's, so the MR1e guard of `r70r-import-resave` holds.
- On the base: `expected [ 'changed', 'changed' ] to deeply equal [ 'done', 'done' ]`.

**S-D4. Year-first short dates (`import/csv.ts`, `import/rows.ts`, `routes/plants/import/+page.svelte`).**
- `DateOrder` gains `'ymd'`. With it, a cell that could be written with a two-digit year first is read so (10-04-15 is 2010-04-15). Nothing else is read differently: 09/03/2024 stays ambiguous, and 31-12-23 is left.
- `ambiguousDates` returns `yearFirst` (how many cells could be read year first, and the first).
- The question offers "Year first, with two digits (15 April 2010)" when there is one. Every choice now names its year: "Day first (10 April 2015)", "Month first (4 October 2015)".
- A cell read year first is keyed by that day, and the round-sixty-nine text key is tried too. So a plant of 15 April 2010 is not found by a line of 10 April 2015.
- Day first and month first still read LibreOffice's 05/01/24 with the year last (round seventy's R3, guarded).
- Unit tests: `r71d-import-dates.test.ts`. On the base: `expected null to be '2010-04-15'`, `expected '2023-12-31' to be null`, `expected undefined to deeply equal { n: +0, first: null }`, among others.
- Browser test ("r71d 3"). On the base: Expected substring "Day first (10 April 2015)", Received "… Day first (10 April) Month first (4 October) …". Here the two plants are filed 2010-04-15 and 2011-06-20.
- `r62bg-import.test.ts` pinned `ambiguousDates`' whole shape, so `yearFirst: { n: 0, first: null }` is added to it.

**S-D3. A restored change this version cannot read never reached sync (`db/vault.ts`, `db/collection.svelte.ts`).**
- Such a change is now kept apart from the outbox, under the meta key `unsentUnreadable`, wherever this device should send it:
  - appended by a Merge (`keepUnreadable` now stores it as the device's own, not as from the server);
  - staged by a Replace (the promotion's `storeIn`);
  - held in the log when sync is set up (`outboxFill`).
- `storeIn` puts a change in the outbox only when this version reads it.
- `queueReadable()` runs once at each load, after the fold. It moves into the outbox every waiting change this version now reads, forgets any stamp no longer in the log, and tells the collection's local-change listeners, so sync pushes.
- Nothing is put in the outbox before a version reads the change. So the push never sets aside a batch for it, and the Sync page never counts it as waiting.
- The load calls it through `import('./vault')`, so a test's stand-in for the vault that lacks the export queues nothing. Nine sync test files mock the vault that way.
- No sync file is touched, so there is no need for E.
- Tests (`r71d-backup-unsent.test.ts`): Merge keeps the change apart, out of the outbox, and a version that reads it queues it; a second Merge appends and notes nothing twice; Replace keeps it apart; a sync set up over such a log keeps it apart; the first load that reads a waiting change queues it and tells sync. On the base: `expected [] to deeply equal [ '…-0001-bbbbbbbbbbbb' ]`, `expected [ …(3) ] to not include '…-0004-…'`, `expected undefined to deeply equal [ '…-0004-…' ]`, `a.vault.queueReadable is not a function`.
- A later version is stood in for by adding the kind to the module's `KINDS`.

**S-D6** is a limitation: a sentence for F, under Needs.

**S-D7. The mutation survivors.** Each now has a test, and each test kills its mutation (re-run with my runner; all 31 targeted mutants killed, listed below). Except where noted, the cases are guards: they pass on the base too.
- `r71d-clock.test.ts`:
  - MH2 and MH5 (`loaded`): two tabs loaded after the clock was set right; one's record leaves the other waiting.
  - MH8: a move of 1.6 days past a 1.5-day correction waits.
  - MH7b: a 1.2-day correction set right while closed waits at the load.
  - MH3b: a load 10 minutes short of the correction keeps it in force.
- `r71d-snapshot-edge.test.ts`:
  - MC3 and MC4: a peer's stamp 7 minutes and 14 hours past a waiting load's clock, folded with three days in force. The load folds the log and holds the change.
  - MC9: a removal follows a held edit to a field this build does not know, and the plant stays removed when that edit comes due.
- `r71d-import-bare.test.ts`:
  - MI13: a plant found by its bare key marks no other line changed.
  - MI18: a line found only in part is not "whole".
  - MI7: a one-reading short date finds a plant filed under "~".
  - MI8: a round-sixty-seven plant keyed by the short date's text is found by an answered line.
- `r71d-import-commit.test.ts`, MI15: `commitImport` stores `importKeyBare`, and a sheet without the column then finds both plants.
- `r71d-example-lock.test.ts`:
  - MD2: closing before the bar lets the first script's hold go.
  - MD3: a bar drawn again holds its own hold.
  - MD5: a refused first request leaves the bar to ask.
  - MD6: a hold let go before its grant is let go when granted.
- `r71d-example-seed.test.ts`, MD10: a seed refused by another tab's mark does not say "not set out".
- My new code's own mutants are killed too: the D1 filter, the D2 numbering, the D5 count (and a count of one), the year-first reading, its count, its key, and S-D3's five places (outbox filter, note, `outboxFill`, `keepUnreadable`, the load's call). A missing row kept waiting is also killed.
- Equivalent or conservative survivors, not tested:
  - MH10: `clearClockOffset` leaves `loadWaits`, which does nothing with no offset, and any reading resets it.
  - MH11: a move-wait in the record implies the clock moved past the correction since the reading, so the load waits anyway.
  - MC1, MC4b, MC11: they only narrow when the snapshot is read, or what `keepUnreadable` keeps of rows that are all unreadable.
  - MB1, MB2: the vault keeps one change per stamp.
  - MD7: the same-transaction `requireEmpty` refuses, and says so, anyway.

**Fold guard.** `fold-rules.test.ts` is re-recorded under 8 (`b854e376f8c508ad172f1af8ef65a411`) for the vault's and the load's changes. No fold changes, and the behaviour hashes hold.

## Needs

1. **The merge: `tests/unit/fold-rules.test.ts`.** The hash takes in E's engine methods too. If E or anyone changes a hashed block, re-record it after the merge (under 8, unless a fold changes).

2. **F, `/about/formats`, the Import paragraph.** Each was checked against my code.
   - (a) Replace "and not in three numbers joined by dashes, or when the first number could be a year too (24/03/09, 24.03.09, 05/01/24), which could be written year first, unless the sheet's dates are said to be written day first or month first, both of which put the year last (LibreOffice saves a date as 05/01/24 or 01/05/24, by its language)." with: "and not in three numbers joined by dashes, or when the first number could be a year too (24/03/09, 24.03.09, 05/01/24), which could be written year first, unless the sheet's dates are said to be written day first or month first, both of which put the year last (LibreOffice saves a date as 05/01/24 or 01/05/24, by its language), or year first, offered when the sheet holds a date that could be read so, which reads such a date with its two-digit year first (10-04-15 is 15 April 2010) and no other date differently."
   - (b) Replace "the question says what the sheet's other dates show (a first number over 12 can only be day first, a second over 12 only month first), and chooses nothing for you." with: "the question names the day each answer reads, with its year, says what the sheet's other dates show (a first number over 12 can only be day first, a second over 12 only month first), and chooses nothing for you."
   - (c) Replace "a date whose two-digit year could come first or last (05/01/24) is keyed as such a cell is, by its readings with the year last;" with: "a date whose two-digit year could come first or last (05/01/24) is keyed as such a cell is, by its readings with the year last, or, read year first, by the day it reads;"
   - (d) Replace "a column added to the sheet leaves a line found when no other line of the sheet differs from it only there, or each that does is found by its own key;" with: "a column added to the sheet leaves a line found when no other line of the sheet differs from it only there, or each that does is found by its own key, or the plants filed under the line without the column are as many as the lines sharing it that still lack a plant;"
   - (e) Replace "a plant filed from a line with columns no field takes keeps the line's key without them too, so a sheet that has lost those columns finds it;" with: "a plant filed from a line with columns no field takes keeps the line's key without them too, numbered after the plants of lines that had none, so a sheet that has lost those columns finds it; while the plant's own line, those columns and all, is still in the sheet, that key finds it for no other line, so a line beside it with those columns empty is a new plant;"

3. **F, `/about/formats`, the backup paragraph.** After "one it cannot read but with a stamp is kept as it is, appended to the log on a merge or a replace, where the fold skips it and a later backup carries it again;" insert: "sync does not send it, since a device that cannot read it would set aside the bundle it came in, until a version that reads it opens here, which sends it;". The same holds for such a change in the log when sync is set up.

4. **F, `/about/formats`, the clock paragraph (S-D6).** After "…so an edit made offline after a slow clock was set right lands behind, which parks nothing." add: "A page loaded that long after the reading waits even while another tab of this browser holds the correction in force, since that tab writes the correction only at a reading or a move of the clock and so cannot vouch for it; until its own reading such a page stamps by the device's clock, and an edit made in it offline can lose to another device's edit made before it and not yet seen."

No sentence of `/about/how` is made untrue. It does not list the vault's meta keys.

## The corpus step

None. My changes touch no dossier.

On a device, the first load of this build runs `queueReadable`. It reads one meta key and does nothing unless a backup restored changes the device could not read, which no build so far has written apart.

Plants imported before this round keep their keys. A plant whose `importKeyBare` was numbered among all the lines (S-D2) may still be offered once, by a sheet that lost its column, when a plain line shared its hash. Such a line is said as "changed" or new, and nothing is lost. A run that adds it files the new numbering.

## Measured

- Unit, whole suite on the commit: 3,390 passed, 8 skipped, 0 failed (359 files).
- `tsc --noEmit -p .` clean. `svelte-check --threshold error`: 0 errors over 1,118 files.
- Chromium, strict:
  - `r71d-import`, `r62bg-import`, `r62g-import`, `r61g-import-labels`: 24 passed.
  - `r70x-example`, `r69x-example`, `r67v-example`: 31 passed.
  - `smoke` and `r70w-sync`, filtered to backup, restore, merge and sync: 7 passed.
  - `r60-grow`: 16 passed.
- On `r71base`: the three browser tests fail (lines above). In the unit files, 16 cases fail on the base; the rest are guards.

## Not done or departed from

- **S-D3's design.** The triage's "queued for sync when a later version reads it" is done by a waiting list in the vault and a step at each load, not by outbox entries made at once. Entries made at once would sit in the outbox, held back by `toPush`, counted on the Sync page as waiting.
- **The load writes the outbox, never the log** (rule 6): it only queues what an earlier write should have.
- **WebKit and Firefox** were not run.
- **The example's two-tab Leave during a slow reload,** a not-done item of my review, is still not run in a browser. Its lock takeover now has the four unit guards above.
