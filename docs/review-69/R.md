# Round sixty-nine, agent R: records, the clock, the import, backups and the vault

Copy: `/tmp/r69/R`. Every "fails on the base" below was checked by running the same test file in a copy of `/tmp/r69/base` (with `node_modules` linked), not by reasoning.

## 1. The items

### R1. The import key (S-D1, IND-5, R46-20)

Changed: `src/lib/import/rows.ts` (`dateKey`, `dateKey67`, `priceKey`, `keyCells`, `keyCells67`, `keyCellsOf`, `rowsFromSheet`), `src/lib/import/plan.ts` (`lineHash` and `keyLines` take a version, new `keySheet`, `KeyAlt`, `AltCells`, `HasKey`, `markImported` rewritten, `markAlreadyImported`, new `markSheet`, new row fields `keyAlts`, `matchedKeys`, `alreadyAs`), and the unowned `src/routes/plants/import/+page.svelte` (calls `markSheet`, passes the plant itself by its key, and says the other name on an "already" row).

- **A date is keyed by its exact day.** 2024-01-05 and 2024-05-01 are two keys. Only a cell that is itself ambiguous (09/03/2024, 5/1/24: both parts 12 or under, not ISO) is keyed by its year with day and month in either order, marked `~` so no exact day can take that key. Its answer (day first, month first, left as written) no longer changes its key.
- **Swaps only for an ambiguous cell.** An ambiguous line also tries each exact reading; an exact day whose day and month could swap also tries the `~` form, which only an ambiguous cell ever filed. So a sheet re-saved by a spreadsheet (09/03/2024 to 2024-03-09, or 2024-05-01 to 5/1/24) still finds its plants, and two unambiguous days never meet.
- **The notes are keyed as the plant gets them,** the columns no field takes included ("locality: Totoral"), less the lines that restate a keyed field ("Acquired (as written)", an unread Kind). To keep round sixty-seven's guarantee that a column added to tick lines done makes no line new, the line without those columns is tried too, but only when no other line of the sheet shares it (Totoral above Paposo is then not taken for Paposo).
- **Price as a number:** `readPrice` (the Spend reading), so 12.50 and 12.5 key alike; text that is not a plain amount is keyed as text.
- **A numbered line matches on its number alone** when the plant holding the number was filed by an import (it has an import key): "0007 Lithops lesleii" corrected to "lesliei" looks already imported, and the row names the plant here ("its number is held here by Lithops lesleii"). A hand-added plant of another name still does not match: round sixty-two's guard (`r62h-already-imported-cultivar`, `r62g` "a line the first run renumbered") holds that a sheet's 0010 held by a hand-added Aloe vera is another plant, renumbered and said. Taken literally ("number alone" for every plant), that guard and r62g failed, and every line colliding with an unrelated number would start dropped; I took the nearest sound reading. "Add anyway" still overrides.
- **Each plant here explains one line at most.** Other keys are matched over every `#n` filed under their hash (lines above may have moved), each stored key taken once, after the line's own keys; a plant found by another key counts as made by this sheet, so `markChanged` does not use it to call a second line "changed".

**Compatibility with round sixty-seven's stored keys, and why they cannot collapse two days.** Keys are versioned by their first letter: `j` for this round's sheet keys, `i` for round sixty-seven's sheet keys and for paste keys (unchanged). Each sheet line also computes round sixty-seven's exact key (`keyCells67` with `dateKey67`) as one of its other keys. A plant found by an `i` key is taken only when the plant itself agrees where that key could not tell: when the line's date could be confused with its swap (an exact day with both parts 12 or under, day not equal to month), the plant's own `acquired` must be the line's day; when another line of the sheet shares the old key, each of the line's unmapped-column lines must be in the plant's notes. The page passes the plant by its key (`has: (k) => here.get(k)`); a caller that passes only `true` never gets such an old key taken. So the May plant a round-sixty-seven import filed is found by the May line and never by the January line above it, and Paposo's by Paposo's line, not Totoral's.

Tests: `tests/unit/r69r-import-key.test.ts` (15 cases; every case marked "base" fails on the base, including S-D1's two reproductions, IND-5, the round-sixty-seven keys, 12.50 and 5/1/24). `r67r-import.test.ts`'s date case now asserts that each form finds the other's plant (the keys differ by design).

### R2. The slow clock (S-D2, R46-17)

Changed: `src/lib/core/hlc.ts` (new `awaiting` state, `inForce`, `checkedNow`, new exports `clockStored` and `latestNowMs`, `follow`, `trustServerTime`, `readStored`, `store`, comments), `src/lib/db/collection.svelte.ts` (`stampPast`, `foldFromVault`, `saveFold`).

R46's four steps:
1. **Held, not parked.** While a positive correction past two days waits out of force, the clock in force is not a checked one (`checkedNow` also requires the stored correction to be the one in force). The fold's and the engine's holds read `clockChecked()`, so a peer's change far past the raw clock is held for the load, never parked by the clock alone. Parks by arrival are unchanged.
2. **Stamped past held ones.** `stampPast` follows a held stamp within `FOLLOW_HELD_MS` (a day) of `latestNowMs()`, the device clock plus the stored correction when that is larger than the one in force. So the grower's move made while out of force is stamped past the peer's held move (marked) and wins once the correction comes into force. The round-fifty-one rule against following a stamp years ahead stands (`vault-store` test).
3. **Never out of force on one reading.** The wait is its own state (`awaiting`), set only at a load and by a move of the device clock forward past the correction (perhaps the clock set right during a sleep); a disagreeing reading (45 s off, or a proxy's ten days) leaves a confirmed correction in force, and so does a sleep shorter than the correction. The stored record says `out` so other tabs take this tab's clock in force; a record from round sixty-seven has its `unsure` read for it.
4. **Snapshot keyed by the stored correction:** `clockStored()` gives the stored offset and whether a reading under a week old confirms it, in or out of force. A snapshot written once the three days were confirmed is read by the next load, which holds the correction out of force.

The suspected photo removal (R46-17): checked. A removal stamped while out of force is dated days back, and once the correction comes into force (on this device) and on every peer, `dropRemoved` asks the server to drop the bytes at once rather than ten minutes on. This is real, but the Undo is not lost: `removePhoto`'s Undo puts the pixels back from the tab's memory, and the next run sends them again because the photograph is live after being seen removed (`noteRevived`, round fifty-one, 2; `sync-engine.test.ts` "a photograph brought back after a peer had the server drop its bytes is sent again"). The cost is one upload again. A server claim newer than the backdated removal answers 409 and the bytes stay until the claim lapses. I tried a fix (a ten-minute wait from each device's first sighting): it changed four engine tests' decided behaviour for every late-arriving removal, for no saving of data, so I took it out. No change.

Tests: `tests/unit/r69r-clock-slow.test.ts` (9 cases; the 7 marked "base" fail on the base): D2b's 45 s reading, a ten-day proxy reading, a two-hour sleep, the clock not checked while out of force, R46-17's plant from six hours ago and move from twelve held not parked, D2's move to bench C winning after confirmation, the snapshot read at the next load. `r62bl-clock-tabs.test.ts` changed: after one wrong reading the tabs stay on the three days (round sixty-seven put them back on the raw clock); a reload still waits for its own reading.

The fold: `FOLD_RULES` stays 7 and the database version 4. A fold of a given log, parked set and clock is unchanged (both behaviour hashes in `fold-rules.test.ts` hold). The source hash moved and is re-recorded under 7 (`24041dc249ce98bea4503d4ad820884c`). The snapshot's key changed meaning without a bump because an older snapshot matches the new key only where it was written with the stored correction in force (its `offset` was the clock in force, its `checked` the same formula as `clockStored().checked`), which is exactly what a new snapshot under that key is; one written out of force by round sixty-seven (offset 0 with three days stored) no longer matches and the log is folded.

### R3. A malformed change (S-D3, S-D4, R46-18)

Changed: `src/lib/db/vault.ts` (`outboxFill`), `src/lib/sync/engine.svelte.ts` (`toPush`), `src/lib/db/collection.svelte.ts` (`exportChanges`, new `exportLog`), `src/lib/backup/backup.ts` (`checkRows`, new `unreadableRows`, `foldable`, `summarise`, `buildBackup`, `readBackup`, `previewMerge`, `ReadBackup.skipped`), `src/lib/backup/io.ts` (`prepareBackup`); new `src/lib/db/Opening.svelte`; the unowned pages `plants/+page.svelte`, `plants/[acc]/+page.svelte`, `propagation/+page.svelte`, `propagation/[id]/+page.svelte`.

- One predicate everywhere, `changeError(c, true)`, as the fold's `applyHere` skips. `exportChanges`, `summarise`, `previewMerge` and the outbox fill leave such changes out, and `toPush` does not send one already in the outbox (it stays in the outbox and the log, for a build that reads it).
- A backup carries them apart, as they are, in `unreadable.json` (absent when none). `readBackup` reads each row of `changes.json` on its own: a row whose shape cannot be read is left out and named ("change 23: bad timestamp"), as are `unreadable.json`'s rows; a list none of whose rows can be read is still refused. Merge leaves them in the file; Replace is refused, naming the first, as for an unreadable value. `BACKUP_V` stays 3: an older build ignores the entry and restores the readable changes.
- A refused database: every page's waiting line is now `<Opening />`, which shows `collection.failed` as an alert, or "Opening your collection…". I changed the four unowned pages; Places, a place's page and Labels are patches below.
- `backup.test.ts`'s "refused with its position" now asserts the change is left out and named, and that an all-unreadable list is still refused. `sync-engine.test.ts`'s 400-halving test used a malformed stamp to make the server refuse; that change is no longer sent, so the test now wedges a valid far-ahead change and has the fake server refuse batches named by its hour, and a new case asserts a malformed change is not sent and nothing is refused.

Tests: `tests/unit/r69r-malformed.test.ts` (7 cases, all fail on the base: the three kinds of malformed change each make a backup that reads back and opens on this device; another backup previews its merge; Replace is refused naming `unreadable.json row 1`; the outbox fill and the push leave it out) and `tests/unit/r69r-opening.test.ts` (3 cases, all fail on the base; the third accepts the three pages whose patches are pending, listed in `AT_MERGE`).

### R4. A resumed Replace is announced (R46-21)

`openVault` announces 'replaced' after `replaceFromStaging` finishes a cut-off replacement, so other tabs reload onto it; one that cannot finish yet is not announced. Test: `r69r-vault.test.ts` "the open that finishes it tells the other tabs" (fails on the base: nothing heard), and the not-finished case.

### R5. A non-string `t` in the tail read (R46-29)

`tailAfter` leaves out rows whose stamp is not a string before building its key range. Test: `r69r-vault.test.ts` "a stamp that is not a string" (fails on the base with IndexedDB's DataError).

### R6. Renumber's notes after a hand change (S-D5)

`collection.events` groups sibling repair notes by their "from"; in a group where no note's "to" is the number now, it shows the repair whose number change won the field before the hand change, found as the note with the latest first stamp (`born`): a repair writes its number change and its note in one commit under one writer and wall, the change first, so the notes' first stamps order as the changes do. Test: `tests/unit/r69r-renumber-notes.test.ts` (fails on the base: `[]`).

### For X: `putWith` with `requireMeta`, and `replacePending()`

Both implemented and tested in `r69r-vault.test.ts` (the `putWith` cases fail on the base).

- **`collection.putWith(kind, id, fields, events, also, { meta?, markLast?, requireMeta })`** resolves to `PutResult`: `{ ok: true }`, or `{ ok: false, refused: '<meta key>' }` when a condition failed. Each condition is `{ key: string; equals?: unknown; absent?: true }` (`MetaCondition`, exported from `$lib/db/vault`): `absent` means the record is missing or null; `equals` means it holds that value, compared as JSON; with neither, the record must be present. They are read in the same IndexedDB transaction that appends the changes and writes `meta` and `markLast`; when one fails the transaction is aborted, nothing is written or folded, and `lastWriteError` is not set (it is the caller's answer, not a failure). Without `requireMeta`, `putWith` is typed as before (`Promise<void>`), so `select-actions.ts`'s `ArchiveStore` still fits. The vault throws `MetaRefusedError` (exported) to the collection, which turns it into the result.
  For X6 the seed would be: `const r = await collection.putWith(first.kind, first.id, first.fields, events, rest, { meta: { [SEEDED]: true }, markLast: SEED_MARK, requireMeta: [{ key: CLAIM, equals: me }, { key: SEEDED, absent: true }] }); if (!r.ok) return false;` (with Web Locks, where there is no claim, only the `SEEDED` condition). `appendChanges(changes, fromServer, strict, requireKey, { requireMeta })` takes the same option for a direct vault write.
- **`replacePending(): Promise<boolean>`**, exported from `$lib/db/vault`: true while a replacement from a backup has begun and is not finished (the open that finishes it runs first, so it is true only when the copy still cannot finish). For X4: a pending replacement is not an empty collection.

## 2. Needs

### For X (`places/+page.svelte`, `labels/+page.svelte`) and P (`places/[id]/+page.svelte`): the refused database (R3)

Each page's waiting line becomes `Opening.svelte`, which says `collection.failed` as an alert when the browser refused the storage, and "Opening your collection…" otherwise. Checked: the patch applies to the base files and `svelte-check` passes with it. After it is applied, `AT_MERGE` in `tests/unit/r69r-opening.test.ts` may be emptied.

```diff
--- a/src/routes/places/+page.svelte
+++ b/src/routes/places/+page.svelte
@@ -6,6 +6,7 @@
   import { focusNext } from '$lib/ui/focus';
   import PageHead from '$lib/ui/PageHead.svelte';
   import { collection } from '$lib/db/collection.svelte';
+  import Opening from '$lib/db/Opening.svelte';
   import { LOCATION_KINDS, accNo, type LocationKind, type Location, type Accession } from '$lib/db/types';
   import { plantHref } from '$lib/db/links';
   import { plantLabel } from '$lib/ui/plant-label';
@@ -128,7 +129,7 @@
 {/if}
 
 {#if !collection.ready}
-  <p class="muted">Opening your collection…</p>
+  <Opening />
 {:else}
   {#if !rows.length}
     <!-- Held while the add form is open or asked for (`#add`, read before the page's own mount takes it off the address): a
--- a/src/routes/places/[id]/+page.svelte
+++ b/src/routes/places/[id]/+page.svelte
@@ -12,6 +12,7 @@
   import { goto, beforeNavigate } from '$app/navigation';
   import { onMount } from 'svelte';
   import { collection } from '$lib/db/collection.svelte';
+  import Opening from '$lib/db/Opening.svelte';
   import WaitingRecord from '$lib/ui/WaitingRecord.svelte';
   import SpeciesName from '$lib/ui/SpeciesName.svelte';
   import { LOCATION_KINDS, type LocationKind } from '$lib/db/types';
@@ -354,7 +355,7 @@
 <svelte:window onbeforeunload={guardUnload} />
 
 {#if !collection.ready}
-  <p class="muted">Opening your collection…</p>
+  <Opening />
 {:else if !loc}
   {#if waiting}<h1 class="q" style="margin-top: 24px">Not whole</h1><WaitingRecord kind="location" label="This place" {waiting} /><p class="muted"><a href="/places">All places</a>.</p>{:else}<h1 class="q" style="margin-top: 24px">Not here</h1><p class="muted">No place with that id on this device. <a href="/places">All places</a>.</p>{/if}
 {:else}
--- a/src/routes/labels/+page.svelte
+++ b/src/routes/labels/+page.svelte
@@ -17,6 +17,7 @@
   import { page } from '$app/state';
   import QRCode from 'qrcode';
   import { collection } from '$lib/db/collection.svelte';
+  import Opening from '$lib/db/Opening.svelte';
   import { kindOf, sowNo, type Accession, type Sowing } from '$lib/db/types';
   /**
    * What a label is printed for: a plant, or a propagation batch (round forty-one, R10). A seed sower labels trays
@@ -313,7 +314,7 @@
     <!-- Until the collection has opened, the page says so: it said "No plant is growing" and "0 of 0 picked", and "Pick
          all shown" picked nothing, then the list arrived and the pick was gone (round sixty-six; the all-engines run,
          r62g 9, where Safari's engine on the PC opened the collection after the grower had picked; rule 2). -->
-    <div class="cult picklist" id="lb-opening"><p class="none">Opening your collection…</p></div>
+    <div class="cult picklist" id="lb-opening"><Opening cls="none" /></div>
   {:else if noPlants}
     <!-- Nothing on file is said, with the way to fix it, not shown as an empty filter and an empty list (round fifty-eight; the grower review). -->
     <div class="cult picklist" id="lb-noplants"><p class="none">No plants yet. <a href="/plants/new">Add a plant</a> and its label can be printed here.</p></div>
```

### For P: `/about/formats` and `/about/how`

On `/about/formats` (`src/routes/about/formats/+page.svelte`):

1. Line 27, after "...is skipped and counted, and the Backup page says how many; while there are any, no snapshot is written.", add: "It stays in the log: a backup carries it apart, as it is, in <code>unreadable.json</code>, and the restore preview, the sheets and sync's push leave it out, so a backup made or opened on the device, and every batch it sends, holds every change that can be read."
2. The backup file block (line 33), after the `changes.json` line, add: `unreadable.json      the changes in the log this version cannot fold (a kind it does not know, a broken stamp, a field the record owns), as they are; absent when none`. After "This version reads all three." add: "A change in either file that this version cannot read is left out and named; a merge leaves it in the file, and a replace is refused, as it would lose it. A file none of whose changes can be read is refused."
3. Line 45, after "...finishes at a later load when there is room.", add: "The other open tabs are then told, and reload onto it."
4. Line 49, the clock. Replace:
   - "While unconfirmed, a positive correction of more than two days is not in force: the device stamps by its own clock until the first reading confirms it (one refold then), so an edit made offline after a slow clock was set right lands behind, which parks nothing."
     with: "At a page load, and after a move of the device clock forward past it, a positive correction of more than two days is not in force until a reading confirms it: the device stamps by its own clock (one refold when the reading comes), so an edit made offline after a slow clock was set right lands behind, which parks nothing. Meanwhile the clock does not count as confirmed, so another device's change far past it is held, never parked, and an edit made in sight of a field is placed past the field's newest stamp, a held change included, up to a day past the device's clock plus the stored correction. A reading that disagrees, or a move of the clock shorter than the correction (a sleep), never takes a confirmed correction out of force."
   - "(a device still slow then stamps behind until the reading, and an edit made in sight of a field is placed past the field's stamp as always)."
     with: "(a device still slow then stamps behind until the reading, and an edit made in sight of a field is placed past the field's newest stamp, another device's held change included, so it still wins once the reading comes)."
   - "the correction stays in force and stored meanwhile, so every tab and the next page load stamp alike."
     with: "the correction stays in force and stored meanwhile, so every open tab stamps alike (a page loaded meanwhile holds a positive correction of more than two days out of force until its own reading, as every load does)."
5. Line 50, the snapshot. Replace "or under another clock correction or with the clock confirmed where it is now not, or the reverse (every hold was judged by the old clock, and whether it was confirmed decided which verdicts were kept)."
   with: "or under another stored clock correction, or with that correction confirmed by a reading where it is now not, or the reverse (the stored correction, not the one in force: a snapshot written once a large correction was confirmed is read by the next page load, which holds that correction out of force until a reading, and what that load holds it judges afresh by its own clock)."
6. Line 61, the import. Replace "each plant an import adds carries its line's import key, and running the same sheet again, or the sheet saved again by a spreadsheet or given a column, leaves out every line whose plants are all here, removed plants included, and offers only the missing plants of a line partly added, numbered on in the sheet's pattern; a line whose number a plant here holds under the same name (the number compared without its leading zeros) looks already imported, and is skipped unless you add it anyway;"
   with: "each plant an import adds carries its line's import key, and running the same sheet again, or the sheet saved again by a spreadsheet or given a column, leaves out every line whose plants are all here, removed plants included, and offers only the missing plants of a line partly added, numbered on in the sheet's pattern; the key reads a date by its exact day (2024-01-05 and 2024-05-01 are two lines), and a date cell that reads either way round (09/03/2024) by its year with day and month in either order, which also finds a plant filed under either reading; it reads the notes as the plant gets them, the columns no field takes included, and a price as its amount (12.50 and 12.5 are one); a column added to the sheet leaves a line found when no other line of the sheet differs from it only there; a plant an earlier version's import filed is found by that version's key only when its own date acquired and notes agree with the line; a line whose number a plant here holds (the number compared without its leading zeros) under the same name, or under any name when an import filed that plant (a name corrected since), looks already imported, the line naming that plant when its name differs, and is skipped unless you add it anyway;"

On `/about/how`: no sentence changes for R. (The photo removal's "once the removal is ten minutes old (past any Undo)" stays true: see R2's photo paragraph.)

## 3. Not done, and why

- **The photo removal dated back by a slow clock** (R46-17, suspected): checked, not changed. The early DELETE is real, but the Undo restores the pixels from the tab and the next run sends them again; a fix would delay every late-arriving removal by ten minutes for no data saved (R2 above).
- **Local dates read three days behind while a large correction waits** (S-D2's "wrong local dates offline"): not in R46's four steps, and the triage adopted those. Not changed.
- **"A numbered line matches on its number alone"** is applied to plants an import filed, not to hand-added ones (R1 above, with the reason).
- **Round sixty-two's paste keys and pre-round-sixty-seven sheet keys** are not looked up. Round sixty-seven did not keep them either; paste keys are unchanged (`i`), so pastes still find their plants.
- **The Example offer** (`ExampleOffer.svelte`, X's) does not read `collection.failed`; it shows its own "Opening the example collection…" for an example being set out, which is not the collection's waiting line. Left to X.

## 4. The corpus step

None: R's items need no corpus step.

## 5. Runs

- Unit suite, whole, in `/tmp/r69/R` (after the last change): 280 files, 2,381 passed, 1 skipped, 0 failed (266 s).
- `npx svelte-check --threshold error`: 1,008 files, 0 errors, 0 warnings (also 0 errors with the Needs patch applied, then taken out).
- Checked to fail on the base (run in a copy of `/tmp/r69/base`): every case marked "base" in `r69r-import-key` (11 of 15 fail on the base), `r69r-clock-slow` (7 of 9), `r69r-malformed` (7 of 7), `r69r-opening` (3 of 3), `r69r-vault` (all 6), `r69r-renumber-notes` (1 of 1). The cases not marked "base" are guards that pass on both.
- The guards of my files, run as I went: `r67r-*`, `r62l-clock-*`, `r61l-*`, `r63l-*`, `r62bl-clock-*`, `fold-rules`, `fold-snapshot`, every `*import*` test, `backup*`, `vault-store`, `sync-engine`, `r62s-engine-refusal`, `r63fd-removal`.
- No Playwright (P's).
