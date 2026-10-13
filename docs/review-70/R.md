# Round seventy, agent R: records, the clock, the snapshot, import and backups

Working copy `(scratch)`, committed on `base`. Items R1 to R4 of `REVIEW-TRIAGE-69.md`, and the two mutation survivors in my area (MR3c, MR1e). Every new test was run against the base copy: each case named "base:" fails there, and each "guard:" passes on both.

## Done

### R1. A snapshot that can be dropped (IND-5)

**The fault.** The snapshot was read by its stored correction, while the fold holds by the correction in force, which is nothing while a load waits for a reading. A snapshot written with three days in force showed a peer's plant added six hours before. After the reload, a fold of the whole log under the same clock held the plant back.

**The rule now** (`collection.svelte.ts`: `foldReach`, `foldFromVault`; `vault.ts`: `FoldSnapshot.reach`).
- The snapshot records `reach`, the wall of the latest stamp it folded that a clock could hold. That is a stamp from another device, not marked as placed past another, read from the fold's per-field and removal stamps. A stamp that lost its field changes nothing, held or not.
- A load reads the snapshot only when `reach <= nowMs() + MAX_AHEAD_MS`: the clock in force now holds nothing the snapshot folded. What it did not fold is in its inventory and judged again at each load, as before.
- So a load from the snapshot and a fold of the whole log agree under any clock.
- The stored-offset and checked keys stay. `FOLD_RULES` is 8, and the source hash is recorded under 8. Both behaviour hashes hold unchanged.

**Departure.** The triage says to key the snapshot by "the correction in force and whether it waits". Done literally, a snapshot written in force never matches a load, which waits, so every load on a slow device folds the whole log again. That undoes round sixty-nine's step 4. The rule above compares the fold's clock with what the snapshot actually folded. It is exact, where the literal key is only sufficient, and it keeps step 4 wherever step 4 was sound.

**A round-sixty-nine test changed.** `r69r-clock-slow`'s step-4 case asserted IND-5 itself. Its plant was a day old, which the waiting clock holds, and it expected the snapshot to be read and the plant shown. The plant is now four days old, as the case meant. Every other round-sixty-nine test is unchanged and green.

**Tests:** `tests/unit/r70r-snapshot-clock.test.ts`.
- **IND-5.** On base: `expected 'snapshot' to be 'log'`, and `IND-5: the load from the snapshot and the whole log's fold differ: … held: +0 … to deeply equal … held: 2`.
- **Step 4 kept.** A snapshot holding only old peer stamps and this device's own stamps is still read by a waiting load.
- **The property test.**
  - The logs are seeded random: five plants, with changes from a peer and from this device from 30 days back to 10 days ahead, some of them marked stamps.
  - The device clock is right, two minutes off, 20 hours slow, three or five days slow, or three days fast, with readings or without.
  - Each trial makes three loads, through reloads, sleeps, a reading and the engine's refold, another tab's record taken (S-D4), days passing, and sync stopped. The grower's edits, removals and restores come in between (S-D2).
  - At each load, the records, the held count, the parked lists and the incomplete count must equal `rebuild()`'s under the same clock.
  - It runs 24 seeds by default (`R70_SEEDS` for more), in groups of four. On base it fails at seed 17: `step 1 (reading, skew 120 h, in force 0 h): the load from the snapshot and the whole log's fold differ`. With the fix, 80 seeds (240 loads) passed.
  - A last case requires at least a quarter of the loads to read the snapshot.

### R2. The slow clock across fields and tabs (S-D2, S-D4)

**S-D2** (`collection.svelte.ts`: `stampPast`, `fieldsOf`). A removal is now placed past the newest held stamp of any field of its record, and an edit past a held removal of its record. Each is held to the same one-day reach. This departs from the reviewer's single `held\0*` key in `apply`, which keeps only the newest held stamp. When that stamp was a broken clock's, a month ahead, the removal was no longer placed past a peer's move from twelve hours before. `apply` is unchanged.

**S-D4** (`hlc.ts`).
- A tab's wait from its own load (`loadWaits`) is now kept apart from the wait from a move (`awaiting`), which every tab shares.
- The record carries the move-wait as `out`, as before, and the load-wait as `loaded`, which no other tab takes as its own wait.
- A tab that takes another's record ends its own load-wait when the writer is in force, as round sixty-nine's tabs did (`r62bl-clock-tabs`), and keeps it when the writer also waits from its load.
- So a freshly loaded tab no longer puts a confirmed correction out of force elsewhere. A move past the correction still does.

**Tests.**
- `r70r-clock-slow.test.ts`, the reviewer's cases. On base: `expected { id: 'p1', … } to be undefined` and `expected undefined to be 'repotted today'`. Guards: a held move folds once the reading comes; a removal is not placed past a change a month ahead.
- `r70r-clock-tabs.test.ts`, both orders. On base: `expected +0 to be 259200000`. Guards: a reading in the confirmed tab brings the loaded tab into force; a move past the correction still takes the other tab out of force.

### R3. LibreOffice re-saved sheets (S-D3)

**Dates** (`import/csv.ts`, `import/rows.ts`).
- With no choice made, a short date whose two-digit year could come first or last (05/01/24) is still not read. `readDate` now gives its readings with the year last (`yearLast`).
- The key reads such a cell by those readings, whatever the sheet's choice:
  - when it reads two ways, by its year with day and month in either order, trying each reading, as an ambiguous 09/03/2024 already was;
  - when it reads one way, by that day.

  Its text, round sixty-nine's key for it, is tried as well. Round sixty-seven's key for it stays the text.
- With day first or month first chosen, the cell is read with the year last, since either answer puts it there.
- `ambiguousDates` counts such a cell when it reads two ways, so the question is asked.

**Prices** (`rows.ts`: `bareKey`). A price with a currency is also tried as its amount alone, with every form of the date.

**Tests:** `r70r-import-resave.test.ts`.
- The reviewer's 4 forms × 3 orders, and the currency case. On base: `expected { done: false, acq: null } to deeply equal { done: true, acq: null }` and `expected undefined to be true`.
- New: date and price together; a reading by the choice (`expected null to be '2024-01-05'`); the question asked; the readings given.
- Guards: another day or another price is still a new plant; round sixty-nine's text key still finds its plant; the six forms that already passed.

### R4. Replace with unreadable changes on the device (S-D5)

- `backup/io.ts`: `openBackup` names the device's unreadable rows (`Opened.unreadableHere`).
- `replaceFromBackup` reads them again and refuses before staging, after the file's own refusal, so `r69r-malformed` holds. The words are: "1 change on this device cannot be read by this version (unknown kind "harvest"), and a replacement would lose it for good. Merge instead, which keeps it here; this device is unchanged."
- The Backup page then offers no Replace: "Replacing is not offered while this device holds a change this version cannot read: a replacement would lose it for good. Merge keeps it here."

**Tests:** `r70r-replace-unreadable.test.ts`. On base: `expected undefined to deeply equal [ 'unknown kind "harvest"' ]`. It also checks that every kind of unreadable row counts, and that a merge keeps the change (a guard).

### Mutation survivors

- **MR3c.** A guard makes My plants' spreadsheet from a log holding a reserved-field change and checks `exportLog`'s two parts. It fails with the mutation.
- **MR1e.** Two guards. A Locality column that tells apart two lines takes neither line for the one plant filed from the line without it, while one such line alone is taken. The first fails with `onlyIfUnique` removed.

## Needs

1. **For the merge (fold guard).** X's `requireEmpty` in `vault.ts`, and any change W makes to the engine's hashed methods, move `fold-rules.test.ts`'s source hash. If no fold changes, re-record it under `rules: 8`.
2. **For P, `/about/formats`, the `#snapshot` paragraph.**
   - Replace: "and it is not read when it was built under other fold rules (a deploy that leaves the rules as they were keeps it), by another device, or under another stored clock correction, or with that correction confirmed by a reading where it is now not, or the reverse (the stored correction, not the one in force: a snapshot written once a large correction was confirmed is read by the next page load, which holds that correction out of force until a reading, and what that load holds it judges afresh by its own clock)."
   - With: "and it is not read when it was built under other fold rules (a deploy that leaves the rules as they were keeps it), by another device, or under another stored clock correction, or with that correction confirmed by a reading where it is now not, or the reverse, or when it folded a change from another device that the clock in force now would hold: a page load holds a correction of more than two days out of force until a reading, so a snapshot written while it was in force is read by that load only when nothing it folded is past that load's clock. Dropping the snapshot never changes what a page shows."
3. **For P, `/about/formats`, the paragraph on sync and the clock.**
   - Replace "and an edit made in sight of a field is placed past the field's newest stamp, a held change included, up to a day past the device's clock plus the stored correction." with "and an edit made in sight of a field is placed past the field's newest stamp, a held change included, a removal past the newest held edit to any field of its record, and an edit past a held removal of its record, each up to a day past the device's clock plus the stored correction."
   - Replace "(a device still slow then stamps behind until the reading, and an edit made in sight of a field is placed past the field's newest stamp, another device's held change included, so it still wins once the reading comes)" with "(a device still slow then stamps behind until the reading, and an edit made in sight of a field is placed past the field's newest stamp, another device's held change included, and a removal past another device's held edit to the record, so each still wins once the reading comes)".
   - After "never takes a confirmed correction out of force.", add: "A page's wait from its own load is its own: it never takes the correction out of force in another tab, and it ends at a reading, or when another tab with the correction in force writes it."
4. **For P, `/about/formats`, the Import paragraph.**
   - Replace "and not in three numbers joined by dashes, or when the first number could be a year too (24/03/09, 24.03.09), which could be written year first." with "and not in three numbers joined by dashes, or when the first number could be a year too (24/03/09, 24.03.09, 05/01/24), which could be written year first, unless the sheet's dates are said to be written day first or month first, both of which put the year last (LibreOffice saves a date as 05/01/24 or 01/05/24, by its language)."
   - Replace "A date like 09/03/2024 is read day first or month first only by one choice for the whole sheet" with "A date like 09/03/2024 or 05/01/24 is read day first or month first only by one choice for the whole sheet".
   - After "which also finds a plant filed under either reading;", add: "a date whose two-digit year could come first or last (05/01/24) is keyed by its readings with the year last, whatever the sheet's choice, so a sheet saved again by LibreOffice finds the plants its first run filed;".
   - Replace "and a price as its amount (12.50 and 12.5 are one);" with "and a price as its amount (12.50 and 12.5 are one, and £12.50 also finds a plant filed at 12.50);".
5. **For P, `/about/formats`, the backup paragraph.** After "A change in either file that this version cannot read is left out and named; a merge leaves it in the file, and a replace is refused, as it would lose it.", add: "A replace is refused too while this device holds a change this version cannot read, since a replacement clears the device's log; a merge keeps it."

No sentence of `/about/how` is made untrue.

## Measured

The owner's collection is not reachable, so the property test is the measure. After the fix, 80 seeds (240 loads) agree; on base, seed 17 is the first to differ. All 12 of the reviewer's re-saved date cases, and the currency case, now find their plant under all three choices.

## Not done, and the decisions departed from

- **R1's key.** Read by what the snapshot folded against the clock in force, as above, not by an exact match of the correction in force and the wait.
- **S-D2's form.** Held stamps are read per field of the record, not as one `*` key.
- **Runs.** The machine ran at a load average of 30 to 60, with out-of-memory kills.
  - `tsc --noEmit` is clean, and `svelte-check` gives 0 errors over 1,059 files.
  - The full unit suite: 2,764 passed, 1 skipped and 3 failed.
    - `r62bh-predeploy` timed out on the load, and passes alone.
    - A hook in my replace test timed out at ten seconds. My vault-backed files now set longer timeouts.
    - `r69r-malformed`: the file's refusal came second to mine, and now comes first.

    All three files, and the rest of my area, were run again and are green.
  - No browser run: the Backup page's new branch shows only on a device holding an unreadable change, which no e2e spec reaches.

## Second pass (R47: triage-69 R5, R6, R7, R47-19, and X's need)

Every new case was run against the base copy: "base:" cases fail there, guards pass.

### R5. The slow clock after a reload (R47-14)

Each of R47's scenarios was first run against the first pass (`tests/unit/r70r-clock-reload.test.ts`, and one case in `r70r-clock-tabs.test.ts`).
- **Scenarios 1 and 3 failed after the first pass.** A device three days slow, reloaded offline twenty hours on, lost the grower's move to a peer's unseen move. A reload a minute after the reading also dropped the correction.
- **Scenario 4 was already fixed by the first pass.** A new tab's first disagreeing reading no longer takes the other tabs out of force. It fails on base.
- **Scenario 5 failed.** A correction of 1.9 days stayed in force after the clock was set right while closed.
- **Scenario 2 cannot be fixed without a reading** (a clock three days fast, set right while closed for over three days). After that long, a fast clock left fast and a fast clock set right read alike. Holding the correction out of force would stamp three days ahead, which parks. It is kept as a guard of what holds.

**The rule now** (`hlc.ts`). A load waits only when the device clock has moved at least the correction since the reading that confirmed it (`Date.now() − confirmedAt ≥ offset − 30 s`), which is what a slow clock set right does. A load with no confirming reading still waits. The threshold is now a day (`WAIT_PAST_MS`), not two:
- under a day, a stamp ahead is held by peers no longer than the day the edit reach already covers;
- at 1.9 days, the scenario shows edits held and then coming due over peers' edits.

R47's "a tab that has had no reading never writes the correction out" holds for a load. Such a tab still writes `out` after a move of the device clock past the correction: every tab of the device would follow that move itself, and tabs that take a record do not measure the move again.

**Base failures:**
- `expected +0 to be 259200000` (scenarios 1 and 3);
- `expected 164160000 to be 0` (scenario 5);
- scenario 4: `expected +0 to be 259200000`.

**Round-sixty-nine and first-pass tests changed** (fixtures only): `r69r-clock-slow`, `r70r-clock-slow`, `r70r-snapshot-clock`, `r70r-clock-tabs`, `r67r-clock-unsure` and `r62bl-clock-tabs`.
- Their slow devices were reloaded within the correction and expected the load to wait. They now confirm four days before the reload, so the wait they test still happens.
- `r62bl`'s tab opened a minute after the reading now expects the three days in force.

### R6. Unreadable changes in a backup (R47-15)

**How a file is read** (`backup/backup.ts`):
- Each row of `unreadable.json` goes through the same check as `changes.json`. A row this version reads becomes a change.
- A row it cannot read but that has a stamp (`keepable`) goes into `skipped`, as it is.
- A row with no stamp, or with a value its field never takes, is `leftOut`. Every such row is named.

**Restoring:**
- **Merge** appends the skipped rows to the log (`collection.keepUnreadable`). Rows go in with no outbox entry, and none under a stamp the log already holds, which they would displace. The fold skips and counts them; the next backup carries them.
- **Replace** stages them with the file's changes. It is refused only for `leftOut` rows, in round sixty-nine's words.
- **R4 stands** for a device's unreadable row the file does not carry.
- The Backup page says which rows are kept as they are and which are left out.

**Tests:** `r70r-backup-unreadable.test.ts`. On base:
- the readable row is not read back (`expected [ … ] to include …`);
- Merge keeps nothing (`expected [] to deeply equal [ { … } ]`);
- Replace is refused.

The guards are a row with no stamp, and no displacement. `r69r-malformed`'s Replace case now expects the row kept, not refused, as R6 decides.

### R7. The import key (R47-16)

**Answered cells** (`rows.ts`). A cell that reads either way round, answered by the sheet's choice, is keyed by the day the answer reads. The "~" form is tried only for a plant dated that day or with no date: one an unanswered run filed. A short date is treated the same way when answered.

**Beside the key.** A line with columns no field takes has its key without them stored beside the import key (`importKeyBare`, written by `commit.ts`). `markSheet` finds a plant by it, so a sheet that has lost the column finds the plant.

**Lines sharing a key.** The key without the column, shared by two lines, is now taken by one of them when every other line holding it is found by its own key (`KeyAlt.others`). Before, it was dropped.

**Tests:** `r70r-import-resave.test.ts`.
- On base:
  - `expected [ true, true ] to deeply equal [ false, true ]` (two days, one key);
  - `expected true to be false` (01/05/2024 against 2024-01-05);
  - the lost column, `expected undefined to be true`;
  - the pair, `expected [ false, true ] …`.
- The first-pass re-save cases now expect a cell answered as another day to be another plant: `2024-05-01` saved as `05/01/24` and answered day first is 5 January.
- Three round-sixty-nine and round-sixty-seven tests that required "either way, whatever the answer" were changed to the new rule (`r69r-import-key`, `r67r-import`).
- **R47-19's revert** (`onlyIfUnique` removed) is caught by the MR1e guard: two lines sharing the alternate cells take neither plant.

### X's need applied

`requireEmpty` is in `vault.ts` (`StoreOpts`, `storeIn`, `appendChanges`) and in `collection.svelte.ts` (`commit`, `putWith`). X's `r70x-seed` "nor over a place the visitor made" passes with X's `demo-seed.ts` and `demo.ts` copied in, and fails without the change (`expected true to be false`). The copies were then removed.

### Fold guard

The source hash is re-recorded under 8 (`900c6a4ada001e24fc10c63ba280b832`); both behaviour hashes hold.

### Runs

- `tsc` is clean. `svelte-check` gives 0 errors over 1,061 files.
- The full unit suite gives 2,789 passed and 2 failed:
  - `formats-doc`, which needs the two needs below; checked to pass with them, but for the page listing;
  - `r61g-sample`, fixed since (a partial file without `leftOut`).
- The Chromium import specs (`r61g-import-labels`, `r62g-import`, `r62bg-import`): 21 passed.

### Needs (second pass)

6. **Nobody's file, `src/lib/db/types.ts`.** In `Accession`, after `importKey?: string | null;`, add `importKeyBare?: string | null;`. `FIELD_TYPES` now names it, and `formats-doc` requires the interface to match.
7. **For P, `/about/formats`.**
   - In the accession field list, after `importKey`'s parenthesis, add: "<code>importKeyBare</code> (on a plant whose line had columns no field takes: the same key read without them, so a run of the sheet that has lost those columns finds the plant; absent otherwise)". `formats-doc` requires the field to be listed.
   - In my need 2 (the snapshot), read "more than a day" for "more than two days".
   - Replace "At a page load, and after a move of the device clock forward past it, a positive correction of more than two days is not in force until a reading confirms it" with "At a page load after the device clock has moved at least the correction since the reading that confirmed it, as a slow clock set right does, and after a move of the device clock forward past it, a positive correction of more than a day is not in force until a reading confirms it; a load before that keeps it in force".
   - Replace "when that correction was two days or less; one of more than two days is not in force until a reading" with "when that correction was a day or less; one of more than a day is not in force until a reading".
   - Replace "(a page loaded meanwhile holds a positive correction of more than two days out of force until its own reading, as every load does)" with "(a page loaded meanwhile holds a positive correction of more than a day out of force until its own reading, since no reading confirms it then)".
   - Replace "A change in either file that this version cannot read is left out and named; a merge leaves it in the file, and a replace is refused, as it would lose it." with "A change in either file that this version cannot read is named. One of <code>unreadable.json</code> that this version reads is read as any other change; one it cannot read but with a stamp is kept as it is, appended to the log on a merge or a replace, where the fold skips it and a later backup carries it again; one with no stamp, or with a value its field never takes, is left out, and a replace is refused, as it would lose it."
   - My need 5 becomes: "A replace is refused too while this device holds a change this version cannot read that the file does not carry, since a replacement clears the device's log; a merge keeps it."
   - In the Import paragraph, replace "and a date cell that reads either way round (09/03/2024) by its year with day and month in either order, which also finds a plant filed under either reading;" with "and a date cell that reads either way round (09/03/2024), left as written, by its year with day and month in either order, which also finds a plant filed under either reading, but answered by the sheet's choice by the day the answer reads, which finds a plant of that day, or one an unanswered run filed with no date;".
   - My need 4's added clause about 05/01/24 becomes "a date whose two-digit year could come first or last (05/01/24) is keyed as such a cell is, by its readings with the year last".
   - Replace "a column added to the sheet leaves a line found when no other line of the sheet differs from it only there;" with "a column added to the sheet leaves a line found when no other line of the sheet differs from it only there, or each that does is found by its own key; a plant filed from a line with columns no field takes keeps the line's key without them too, so a sheet that has lost those columns finds it;".
