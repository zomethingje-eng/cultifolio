# Self-review 68, reviewer D: records, the clock, the import, backups and the vault

Copy: `/tmp/rv68/D` at 1609c19. Node 22.22.2, Linux sandbox. Reproductions are throwaway tests in that copy, `tests/unit/zz-rv-d-*.test.ts`, run with `npx vitest run <file> --reporter=verbose --silent=false`. The existing tests in my area pass: `r67r-*`, `r62l-clock-*`, `r61l-*`, `r63l-*`, `fold-rules`, `fold-snapshot` (24 files, 173 tests).

Five findings: none for launch, four that should be fixed soon, one minor. Each R item's status is given after them.

## Findings

### D1. The import key gives two different plants one key, so on a second run one plant is never added and another is added twice (R3, a regression this round). Should. Confirmed.

- **Where:** `src/lib/import/rows.ts:51-57` (`dateKey`) and `:69-72` (`keyCells`), with the occurrence count in `src/lib/import/plan.ts:98-106` (`keyLines`).
- **What the code does:** the key now reads a whole date "by its year and its day and month in either order", so 2024-01-05 and 2024-05-01 key the same. It also leaves out every column no field takes, though `rowsFromSheet` writes those columns into the plant's notes ("Locality: Totoral"). Lines that hash the same are told apart only by their position (`#1`, `#2`). When a new line is inserted above a plant already imported, its key changes:
  - the new line takes the old plant's key and is marked done and dropped, without a word;
  - the old plant's line takes `#2`, is not "changed" (the sheet still makes `#1`), and is offered as new.
- **Reproduction:** `zz-rv-d-import.test.ts`. Both cases fail.
  1. A first run of `Lithops lesliei,2024-05-01,Mesa Garden`. Then the sheet with an older purchase sorted above it: `Lithops lesliei,2024-01-05,Mesa Garden` and the May line. Result: January `done: true, drop: true`; May `done: false, changed: false`.
  2. A first run of `Copiapoa cinerea,Uhlig,Paposo` (an unmapped locality column). Then `Totoral` inserted above it. Result: Totoral dropped as done; Paposo offered again.

  On the round-66 base both cases keyed apart, since raw cells were keyed. Locality columns are common in cactus sheets.
- **What it should do:** never take a plant as already here because of a field the key threw away.
- **Smallest fix:**
  - Key the date as read (YYYY-MM-DD). Only when the cell itself is ambiguous (both parts 12 or under, not ISO), have `markImported` also accept the key with day and month swapped.
  - Keep the unmapped columns that go into the notes in the key. A column added to tick lines done is then answered by `markChanged`, which already says "looks already imported, changed".

### D2. On a device whose clock really is days slow, R2 puts the clock back by days at every load and after every sleep or small drift, until a reading comes. A grower's edit then loses to an older one. Should. Confirmed.

- **Where:** `src/lib/core/hlc.ts:232-234` (`inForce`), `:98` (unsure at every load), `:192` (`follow`) and `:269` (a disagreeing reading).
- **What the code does:** a positive correction over two days is out of force whenever `unsure` is set. That is at every page load, after any move forward that `follow` cannot account for (a sleep on a platform whose monotonic clock pauses), and after any reading that disagrees with the stored correction by more than 30 s.
  - Meanwhile `clockChecked()` stays true, because `confirmedAt` is kept. So the fold judges peers' changes against a clock three days behind:
    - changes from the last day are parked by the clock alone, and listed on Sync with Apply as from "a device whose clock was wrong";
    - the rest of the last three days are held.
  - An edit made then is stamped three days behind. `stampPast` follows a held stamp only within `FOLLOW_HELD_MS` (one day) of the clock in force, so it does not follow these.
- **Reproduction:**
  1. `zz-rv-d-r2.test.ts`:
     - A device three days slow is confirmed by two readings.
     - Its last sync brought a peer's move of plant p1 to bench B, made twelve hours earlier.
     - It is reloaded offline 20 hours later. `clockOffsetMs()` is 0 and `clockChecked()` is true. The device reads 2026-10-02 against a true 2026-10-05. p1 shows bench A, with `heldWaiting` 1.
     - The grower moves p1 to bench C.
     - A reading then confirms the three days, and the collection is rebuilt. p1 shows bench B: the grower's later move has lost, and every peer folds it the same way.
     - The next load folded the whole log (`loaded.from` is 'log'), because the snapshot carries offset 3 days and the load's clock in force is 0 (`collection.svelte.ts:552`). On such a device no load ever uses the snapshot.
  2. `zz-rv-d-r2b.test.ts`: a confirmed three-day correction with the tab open. One reading 45 s off it (ordinary drift) returns 0 and tells listeners `[0]`. The clock in force drops three days, with the clock still counted as checked, until a second run a minute or more later.
- **Does R2 contradict round 62?** Yes, for corrections over two days. Round 62 decided the correction does not lapse ("a slow clock does not catch up by waiting"; B9 was a slow device reading yesterday's date). R2 makes it lapse at every load, which is B9 again, measured in days. Three texts still state the round-62 rule:
  - `hlc.ts:31-35` says "The correction itself stays in force".
  - `/about/formats` says, of a disagreeing reading, "the correction stays in force and stored meanwhile".
  - The same page says "an edit made in sight of a field is placed past the field's stamp as always". Case 1 shows that does not hold for a held change more than a day ahead.

  I found no device that R2 makes stamp ahead into a park. Its costs are all behind: a hidden peer edit, an edit that loses to an older one, wrong local dates offline, and a whole-log fold at every load.
- **What it should do:** while unsure, never stamp ahead of real time, and never fall further behind than the facts require.
- **Smallest fix:** while unsure, put in force the part of the correction that time already proves: `min(offsetMs, max(0, serverAt - Date.now()))`.
  - Real time is at least the confirmed reading's server time, so this is never ahead.
  - The case R2 was written for still holds. A clock set right while closed has `Date.now() > serverAt`, which gives 0.
  - A still-slow device stays within the time since its last reading, not three days.
  - Apply the same bound at `:269` so that a drifting reading does not drop the clock. Correct the three sentences above.

### D3. A malformed change is skipped by the fold only (R10). It still breaks the device's backups, restore previews and sync's first push. Should. Confirmed (the sync half by reading).

- **Where:**
  - `src/lib/backup/backup.ts:66-69` (`summarise`, which calls `materialise`) and `:239-240` with `:28-36` (`readBackup`, `checkRows`);
  - `src/lib/backup/io.ts:88` (`openBackup`, which calls `previewMerge(current)`);
  - `src/lib/db/vault.ts:606-614` (`outboxFill`) with `engine.svelte.ts:1000-1004` (`takeBatch` sets a batch aside whole).
- **What the code does:** `applyHere` skips a change that fails `changeError(c, true)`. Nothing else does. The Backup page tells the grower such changes "stay in the log, and in a backup".
- **Reproduction:** `zz-rv-d-r10.test.ts`. The log holds one plant and one malformed change, and the collection opens with `malformed` 1. Then:
  - **A reserved field (`id`):** `buildBackup` throws `"id" is a reserved record field`, so no backup can be made. `previewMerge` over this device's log throws too, so no backup, the grower's own included, can be opened for Merge or Replace on this device.
  - **An unknown kind:** the backup is made, and `readBackup` refuses it whole: "The change log in that backup does not parse."
  - **A bad stamp:** the backup is made, and `readBackup` refuses it whole: "Change 4 in that backup cannot be read".

  In every case the file looks good when made and holds nothing that can be restored. In every case `outboxFill`, run when sync is started or joined, puts the change in the outbox. `takeBatch` then sets the batch aside whole on every peer, with up to 2,000 good changes in it, waiting for "a later build" that can never read a reserved field.
- **What it should do:** rule 6. A reading of the log may not lose anything, and a backup or a push must carry the readable changes whatever else is in the log.
- **Smallest fix:**
  - Use one predicate (`changeError(c, true)`) in `summarise` and `previewMerge`, and leave such rows out of what they fold.
  - In `readChanges`, report a shape error as `dropped` rather than throwing, when the list is otherwise readable. A file then merges, and Replace refuses it, as it already does for unreadable values.
  - Leave shape-malformed changes out of `outboxFill` and `toPush`. They stay in the log and in the backup.
  - The Backup page's sentence then becomes true.

### D4. A refused database is said on Today and Backup only. My plants, Places, Propagation, a plant's page and Labels still say "Opening your collection…" for good (R10, second half). Should. Confirmed by reading.

- **Where:** `src/routes/plants/+page.svelte:134` (`opened` needs `collection.ready`) and `:269-270`. The same wait is at `places/+page.svelte:131`, `propagation/+page.svelte:44`, `places/[id]:357`, `propagation/[id]:362`, `plants/[acc]:589` and `labels:316`.
- **What the code does:** `load()` sets `failed` and rejects, and `ready` stays false (the R10 test asserts both). Only `today/+page.svelte:372` and `backup/+page.svelte:167` read `failed`. The example offer (`ExampleOffer.svelte`) does not either, though the triage named it (V-3).
- **Reproduction:** as in `r67r-records.test.ts` "a refused database": mock `indexedDB.open` to throw. `collection.ready` is false, and every page above draws its `!opened` branch.
- **Smallest fix:** show `collection.failed` once, in the layout, on every page about the grower's own plants.

### D5. Renumber's sibling-note rule hides both notes once the number has been changed by hand (R8). Minor. Confirmed.

- **Where:** `src/lib/db/collection.svelte.ts:771-776` (`events`).
- **What the code does:** of two repair notes with one "from", a note is kept only if its "to" is the record's number now (or chained). After the grower edits the number (to TOTORAL-1), neither "to" matches, and the plant's history shows no renumber at all.
- **Reproduction:** `zz-rv-d-r8.test.ts`. One note is shown before the edit; `[]` after it.
- **Smallest fix:** when no sibling in a group matches the number now, keep the one whose repair change won the number field (its stamp is in the log), or show the group as before.

## The R items: done as the account says?

- **R1, Replace out of space: done.** I traced each step:
  - staging writes, the count check and `beforeSwitch` all fail before the switch, the staging copy is discarded, and the live vault is as it was;
  - the flag is put before the wipe, and the wipe and the snapshot drop are one transaction;
  - the copy of changes goes through `storeIn` with `copying`, then the photographs one at a time, then the flag is cleared;
  - a resume always wipes first, so nothing is doubled;
  - while the flag is up, `storeIn` refuses inside its own transaction, and `openStaging` refuses;
  - a load opens with what was copied so far and the reason said.

  The r67r tests cover a full device during the photo copy. A cut during the copy of changes leaves an empty log that is said and finished on a later open. Not run: e2e on the Backup page.
- **R2: done as written, and it costs what D2 says.**
- **R3 to R5: R3 done with the regression in D1. R4 and R5 done** (`markDroppedBefore`, `numberUsed`). Keys hold across a resave that writes 0012 as 12, dates as dd/mm/yyyy, CRLF inside a note, and Qty as 3.0. A price resaved as 12.5 for 12.50 keys anew, and `markChanged` then says it (declared out of scope as a reading).
- **R6: done** (`fileParks`).
- **R7:** e2e only, not run.
- **R8: done, with D5.**
- **R9: done.** One small gap: an unmarked repair's `w` (now) is often more than a day past its stamp (the record's `_t` plus 1), so every reader drops it. That is information only, and harmless.
- **R10: the skip is done; what it promises beyond the fold is not (D3); the refused database is half done (D4).**
- **R11: done** (`moveBusy`, `saveBusy` on the plant page and the batch page, each catching a refused write).
- **R12: done.** Every `LocationPicker` has an id (seven), and each form settles its own: mv-loc, ed-loc, p-loc, se-loc, f-loc, s-loc, and imp-loc at "Check names".
- **R13: done.**
  - `tailAfter` reads the order rows and keys in one transaction, with one count and one `getAll`, or gets by key when scattered. A stamp that was displaced appears twice in the tail and folds twice, which is idempotent, and a displacement drops the snapshot anyway.
  - `claimNow` moves the frontier after its fold.
  - In `commit`, the frontier now moves after the fold. A catch-up that runs during `noteUnverified` folds the tab's own rows first and is harmless.
  - The snapshot is written after an import, a merge and the seed (by `rebuild`).
  - `NO_OUTBOX` applies in the example.

  I found no change missed. The one double fold is harmless.
- **R14:** not probed beyond its tests.

## Also checked and sound

- `isParked` and `isHeld`: a marked stamp is never parked or held, and a clock-only park is not stored (`storedParks` feeds the engine, backups and `markParked`).
- `FOLD_RULES` 7 and the device database at version 4, with no shape change.
- The fold-rules hashes pass.
