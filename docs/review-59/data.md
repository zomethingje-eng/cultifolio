# Round 59 review: data (clock, rule 5, numbering, backup, sync convergence)

Copy: /tmp/cf-r59-data (commit as given). Shared server http://127.0.0.1:4180 driven with Playwright (Chromium 1194). Node 24 for every test run. The live site was not reachable, so nothing below was checked against cultifolio.com.

New tests (in the copy, and copied to /tmp/review59/data/):
- tests/unit/zz-review-clock.test.ts (8 tests: the five-years-ahead questions, clock back / forward / back, writer-vs-peer park)
- tests/unit/zz-review-fuzz.test.ts (convergence fuzz, 3 devices; `FZ_N` seeds per case)
- tests/unit/zz-review-backup.test.ts (400-plant round trip, merge and replace, CSV, preview vs merge)
- tests/unit/zz-review-notes.test.ts (species notes)
Browser scripts: /tmp/review59/data/dup.mjs, clockback.mjs, quota.mjs, quota2.mjs. Logs: fuzz80.log, fuzz80-fixed.log, existing.log.

Existing suites in scope (clock-park, rule5, notes-replaced, fold-snapshot, collection-store, vault-store, sync-engine, backup, backup-parked, backup-replace, fold-rules, log-hold, vault-hold): 13 files, 160 tests, all pass on Node 24.

## Findings

### 1. P0. A synced device whose clock is set back two days or more parks the grower's own plants at the next load, stores the verdict, and keeps them hidden after the clock is put right. Confirmed (browser and unit).

This is the round forty-one finding that round fifty-nine says it fixed (REVIEW-ROUND-59 2.1). It is fixed only for a device that has never synced.

- Where: src/lib/core/hlc.ts:129 `return confirmedAt > 0 && Date.now() - confirmedAt < TRUST_EXPIRES_MS;` and the same test at hlc.ts:48 when the stored correction is read. When the clock goes back, `Date.now() - confirmedAt` is negative, which is "less than seven days", so the old server reading still counts as confirming the wrong clock. The fold then parks by that clock (log.ts:197-201) and `flushParked` writes the stamps to meta `parked` (collection.svelte.ts:384, :415). Parked stamps are "never folded, whatever the clock says now".
- Browser repro (clockback.mjs, a Date shim read from localStorage): add Copiapoa cinerea, set up sync (stored `{"offset":0,"confirmedAt":...}`), add Welwitschia mirabilis, set the clock back 3 days, reload /plants:
  - true clock: `["2026-0002 Welwitschia mirabilis", "2026-0001 Copiapoa cinerea"]`
  - set back 3 d: `["2026-0001 Copiapoa cinerea"]`. The line under the bar reads "This device's date and time read earlier than its last change, 4 Oct 2026, 20:32. Nothing is lost: set the clock right, and changes from other devices dated after it come in then."
  - clock put right: still `["2026-0001 Copiapoa cinerea"]`. The sync page reads "3 records have edits from a device whose clock was wrong, kept but not applied" and lists the plant, its acquire line and its species record.
- Unit: zz-review-clock.test.ts "a device that synced (clock confirmed) and is then set back three days while offline": `{ plantShown: false, parkedStored: 4, afterFix: false }`. Only plants added since the last load's snapshot are parked here. A whole-log fold parks every change made more than two days after the false clock (a FOLD_RULES bump, a refold notice, a displaced stamp, or the snapshot written with another offset).
- The same mechanism parks a peer's changes that arrive in a pull while the clock is back. `ingest` folds with `this.hold()`, which has no arrival, so the clock rule applies even though takeBatch has just cleared them by arrival. That device then diverges for good from every other device (fuzz, finding 8).
- What should happen: a reading dated after the device clock confirms nothing. A clock that went back is unchecked, and nothing it judges is stored.
- Smallest fix: in `clockChecked()` and `readStored()`, require `Date.now() - confirmedAt >= -TRUST_SERVER_PAST_MS`, and drop the stored offset otherwise. I applied exactly this in the copy and re-ran: the two clock tests flip, and the fuzz's diverging seeds fall from 6 of 80 to 1 of 80 (fuzz80-fixed.log). The change is reverted in the copy. Belt and braces: do not store a park of this device's own stamps judged by the clock alone.

### 2. P0. Forward a year, corrected, then put back to true: the device keeps the minus-one-year correction as confirmed. The load parks the recent collection, and every edit until the next sync is stamped a year in the past and loses every field for good. Confirmed (unit).

- Same root as 1: the correction was confirmed at a device time a year ahead (hlc.ts:114), so after the clock is put right its age is negative and readStored keeps it (hlc.ts:48).
- zz-review-clock.test.ts "forward a year ... then back to true":
  - after the reset: `offDays: -365, checked: true`
  - the plant made at true time: hidden (parked at load, 4 stamps stored)
  - `clockBehindAt: null`, so no line says anything
  - an edit made then is stored with a stamp 365 days before true time
- The first sync later sets the offset to 0. The parks stay, and the year-old edits are not parked; they are simply older than what they replaced. No Apply is offered, so they are lost for good.
- Fix: as in 1.

### 3. P1. On a device whose own stamps run ahead of an unchecked clock, an edit is stored, raises no error, and never shows, before or after the clock is fixed. Confirmed (unit and fuzz).

- Where: collection.svelte.ts:1269 `if (prev !== undefined && hlcWall(prev) > nowMs() + FOLLOW_HELD_MS) prev = undefined;`. The edit is then stamped at the clock and loses to the field's own later stamp in `apply`. `commit` never checks whether what it stored was folded.
- The comment at :1266 says "the old stamp is parked on the next rebuild". On an unchecked clock (never synced, or more than seven days since a sync) nothing is ever parked (log.ts:199).
- Repros (zz-review-clock.test.ts):
  - Never synced, clock set back 3 days: `put(notes: 'repotted into pumice')` leaves `lastWriteError` null and the plant still shows 'bought at the show'. After the clock is put right it still shows the old text: the edit is in the log with an older stamp.
  - Clock five years fast, then put right (or the device replace-restores its own backup made then): the edit to notes and taxonName is stored, nothing is said, the old values show, and a reload changes nothing.
  - Fuzz with skews: 18 edits "not shown" over 80 seeds, every one at a skew of -30 h or -72 h.
- The words around it are false:
  - The top bar says "Nothing is lost: set the clock right".
  - The sync page (engine.svelte.ts:429) says "a later edit to the same field is stamped just past them". That holds only within FOLLOW_HELD_MS (one day).
- Fix: when the field's stamp is this device's own, stamp past it whatever the gap (hlcAfter). It is this device's own wrong clock, and its peers park it by arrival anyway. Alternatively, after `appendChanges`, compare each kept change against the fold and set `lastWriteError` when one did not take.

### 4. P1. Two plants under one number: every plants-list row links by number, so the second plant cannot be opened from the list, and a write made from the page it opens lands on the other plant. Confirmed (browser, dup.mjs).

- Setup: A and B each add a plant offline, both 2026-0001 (A: Copiapoa cinerea, B: Welwitschia mirabilis), then sync.
- On A, /plants shows two rows, both `href="/plants/2026-0001"`. Tapping the Welwitschia row opens "2026-0001 Copiapoa cinerea". "Water" on that page waters the Copiapoa.
- The same URL resolves to different plants on the two devices:
  - A /plants/2026-0001: Copiapoa cinerea
  - B /plants/2026-0001: Welwitschia mirabilis
- `accession(idOrNo)` falls back to `live().find` in map insertion order (collection.svelte.ts:248).
- The other number-based links take the same path:
  - the front-page search goes to the first hit (`/plants/2026-0001`, Copiapoa)
  - places/[id]/+page.svelte:482
  - propagation/[id] lines 341, 409, 492
  - the Undo after a removal
  - `/labels?acc=2026-0001` picks one of the two
- Sound under duplicates:
  - the QR code (encodes `/plants/<id>`)
  - the plant page's own "Label" link and the list's Labels button (by id)
  - the record page's notice, which names the other plant and offers "Renumber now"
- The CSV has two identical-looking rows and no id column (finding 12).
- Fix: link by id everywhere a record is in hand (`/plants/${a.id}`). For a bare number that two live records share, show both instead of picking one.

### 5. P1. On Chrome a full device's refusal of an ordinary write says nothing: the edit is not saved and no notice appears. Confirmed (browser, quota.mjs and quota2.mjs, quota cut with CDP Storage.overrideQuotaForOrigin).

- Chromium's IndexedDB QuotaExceededError has an empty message. An init-script listener caught `UNHANDLED name=QuotaExceededError message=""`.
- `commit` stores `e.message` into `lastWriteError` (collection.svelte.ts:1223; also :1429 for claims). The value is `''`, and every page tests `{#if collection.lastWriteError}`, so no notice shows.
- What the grower sees:
  - Plant page Log → Note → Record: the form stays open, no `#write-error`, the note is not on the timeline.
  - Plants list "Water": unhandled rejection, no toast, no notice. After a reload, 0 watering rows.
  - Only PhotoAdd says it: "This device is out of space for the collection…" (it uses `storageErrorText`).
- The sync run has the same flaw (engine.svelte.ts:534: `lastError = e.message` is `''`, and the status card's `sync.lastError ? 'Not synced' : … 'Synced'`), so a pull that fails on quota would read "Synced". That last step is read from the code, not reproduced.
- Fix: `this.lastWriteError = (await storageErrorText(e)) ?? (e.message || e.name)` in both places, and the same for `lastError`.

### 6. P1. A never-synced device that restores a backup from a fast-clock device shows an empty collection; the preview and the report both say the plants came in, and nothing anywhere says they are held. Confirmed (unit).

- The top-priority question, answered:
  - The HLC does not follow stamps five years ahead: `Clock.observe` ignores anything more than 5 min ahead (hlc.ts:194); `ingest` and `fromFold` go through it.
  - A peer's far-ahead change is not folded either: it is held for the load, not parked (log.ts:207-212).
  - So later local edits are stamped now, and nothing is "permanently older" on a correct device.
  - Once the device syncs, the far-ahead changes are parked on every device (the arrival rule, and the clock rule after confirmation) and offered with Apply. zz-review-clock "Q1b" confirms a correct device's later edit then stands.
- But until then (zz-review-backup "previewMerge counts held far-future changes"):
  - `openBackup`'s preview reports `addedByKind.accession: 1`; the report "Merged: 1 plant added … 3 changes … taken in".
  - After the merge and a reload, 0 accessions and 3 held stamps.
- The held notice is only on the sync page, inside `{#if sync.configured}` (sync/+page.svelte:173). `scanClock` returns early without a sync record.
- "Is the not-yet-checked state ever said?" No. `clockChecked()` is used only by the hold rules and never reaches a page.
- Fix: previewMerge should fold with the device's hold and count held records apart ("1 plant dated 2031, held until then"). Show the held count outside the sync page.

### 7. P1. The backup preview still promises a renumbering that round fifty-nine removed. Confirmed (unit).

- backup.ts:290-309 builds `renumbered` with the comment "the other is renumbered after the merge". backup/+page.svelte:165 says "1 of this device's plants gets a new number (2026-0001 Haworthia here): the file holds an earlier plant under the same number, and a label printed for it will need reprinting."
- After `restoreBackup(…, 'merge')` both plants are 2026-0001: `['2026-0001 Haworthia here', '2026-0001 Lithops in the file']`. The renumber happens only if the grower presses "Renumber now".
- The preview also orders the keeper by `id.localeCompare`, while the record page and the repair use the first stamp (`keeperOrder`). They agree here by construction, but they are two rules.
- Fix: word it as "will share a number; each record's page offers the renumber". Use `keeperOrder`'s rule.

### 8. P2. The writer and its peers park a fast clock's stamps by different rules, so devices diverge for good. Confirmed (fuzz and unit).

- A device 3 days fast pushes an edit. Every peer parks it by arrival (takeBatch: stamp > arrival + 2 d).
- The writer never applies the arrival rule to its own changes. If the clock is put right before a second agreeing reading, `trustServerTime` sees no change, nothing is re-judged, and the writer keeps folding its edit while every peer shows the older value.
- zz-review-clock "Q2b": `isParked(..., { arrival: T0 })` is true for the peers, while the writer shows 'typed while three days fast' with `parkedRecords: 0`.
- In the fuzz this is the one diverging seed that remains once finding 1 is fixed (seed 1013).
- Fix: when a push is acknowledged, judge the writer's own batch by its arrival as takeBatch does (the arrival is in the listing), and park it here too.

### 9. P2. Rule 5: the parked set is collection data kept outside the log, and a load writes it. Confirmed (unit: `parkedStored: 4` after a load; browser: finding 1).

- The parked set decides what folds, travels in backups (`manifest.parked`) and is never re-judged. Dropping it would change the collection, so it is not a droppable reading.
- It is written by `foldFromVault` and `fromFold` (load) and by `rebuild` through `flushParked`/`saveParked`. Finding 1 is this write.
- Every write to the log itself is the grower's or a merge's (list below).
- Fix: store a park only when it comes from an arrival (the same on every device), never from a load's clock judgement. Re-judge clock parks on each fold, as holds are.

### 10. P2 (suspected, read). A replace restore that hits quota while copying into the live vault leaves the app unable to open its vault.

- `promote` wipes the live stores and copies from staging (vault.ts:248-251). During the copy, the origin holds both the staging copy and the live copy of the file.
- On a near-empty device restoring a large backup, that is about twice the file. A failure leaves `staging-pending` set.
- Every `openVault` then re-runs `replaceFromStaging`: it clears the live stores and fails again at the same point. `dbp` keeps the rejected promise for the page's life (vault.ts:106-133).
- Nothing is lost (the staging DB holds the file), but no page loads and nothing says why.
- Fix: check `navigator.storage.estimate()` against the staged size before the wipe. Catch a failed recovery, clear `dbp` and say "the restore needs N MB more".

### 11. P2. The restore and sync paths under quota: what holds.

- Merge restore: pixels first; a failed ingest removes them again (io.ts:128-132).
- Replace staging: discarded on failure before the switch (replace.ts).
- A pull whose write fails: the cursor stays and the batch is fetched again (sync-engine.test.ts:448).
- addPhoto: the pixels are removed when the record fails.
- Nothing half-written was found on those paths.
- The gap is what the grower sees (finding 5).
- One ordering flaw (read, not run): in `commit`, `noteUnverified` (meta) runs after `appendChanges` has stored a photo removal. If that meta write fails, the change is stored but not folded, and the page says "This change was not saved". A reload then shows the photo removed.

### 12. P3. The CSV sheets: what Excel will change, and what it cannot tell apart. Confirmed (unit, 400-plant file).

- Correct:
  - BOM (EF BB BF), CRLF, RFC-4180 quoting (every row has 17 columns)
  - multi-line notes with quotes and commas
  - the formula guard on `=`, `+`, `-`, `@`, tab and the full-width forms, including after spaces
  - dates written as `2026-03-01`
- Text that looks like a number is written bare, so Excel converts it on open:
  - field number `0012` becomes 12
  - `1E5` becomes 100000
  - lot `00042` becomes 42
  - `3-12` becomes a date
- No identity column, so two plants under one number are indistinguishable rows in plants.csv and events.csv (`2026-09-01,2026-0001,Lithops,Watered` twice).
- Fix: an `id` column. For text fields, either a leading apostrophe as the formula guard does, or say in /about/formats that those columns are text.

### 13. P3. Apply on a parked notes edit lists the text the grower just saw as "replaced by an edit made without seeing it". Confirmed (zz-review-notes).

- `applyParked` copies the parked change's `myNotesBase`/`notesBase` into the new edit (collection.svelte.ts:126). After Apply, `replacedNotes` returns `['on screen']`.
- The grower pressed Apply with both texts in front of them.
- Fix: leave the base field out of `fields` in `applyParked`, so `putChanges` takes the stamp on screen.

### 14. P3 (suspected, read). The snapshot is keyed by the clock offset, not by whether the clock was checked.

- A fold made under an unchecked clock folds this device's own far-ahead stamps. Read back once the clock is confirmed with the same offset (0), it is not re-judged, unless the engine's listener rebuilds.
- The listener is set only in a tab where `sync.init` ran.
- Fix: put `clockChecked()` in the snapshot's key next to `offset`.

## Answers to the brief's questions

- **Five years ahead, never synced (Q1):**
  - The HLC does not advance.
  - A peer's stamps are held, not folded.
  - This device's own far-ahead stamps are folded, and edits to those fields are silently lost (finding 3).
  - After syncing with a correct device, the far-ahead changes are parked everywhere, and the correct device's edits win. Nothing there is "permanently older", unless this device's clock was confirmed and then went back (findings 1 and 2).
  - The unchecked state is never said to the grower (finding 6).
- **Clock back 3 days / forward a year / back:**

  | Clock | Without sync | With sync |
  |---|---|---|
  | Back 3 days | nothing parked; the line shows; edits to fields written in true time more than a day after the false clock are lost (3) | parks and stores (1) |
  | Forward a year | stamps a year ahead; on its own screen they fold | first run pending; the second corrects and parks this device's own stamps everywhere (by design) |
  | Back to true | the line shows and edits are lost (3) | the stored correction makes the load park the recent collection, the line is absent, and edits are stamped a year back (2) |

- **Duplicate numbers:** finding 4 (the list, search, place and batch links, and `?acc=` misdirect). The QR scan and the record page's own links are by id and sound. The CSV is ambiguous (12).
- **Rule 5, every vault write and its trigger:**
  - `commit`, through `appendChanges`: put, putWith, addEvent, addEvents, addEventsIds, addEventWith, remove, removeEvents, restore, addLocation, removeLocation, moveLocation, movePlants, movePlantsUndoable, setScheme, follow, setCover, removePhoto, applyParked, resolveDuplicateNumbers. All are reached only from buttons and forms:
    - plants/[acc]:179,241,359,379-380,391,396,404,417,422,431,443,457
    - plants list:115
    - plants/new:133,135
    - propagation/new:159-160
    - propagation/[id]:129,150,176,209,220,228,273,301
    - places/[id]:162,182,206,254,319
    - places:58
    - Today:102,115
    - today:167,181
    - species:150
    - settings:121
    - Lightbox:122,136,139
    - PhotoAdd:29
    - LocationPicker:31
    - FollowButton:14
    - WaitingRecord:21
    - Parked/sync Apply
  - The claim write (`appendChangesClaiming`): addAccessions, addSowing and potUp, from forms.
  - `ingest`: a merge restore (io.ts:127) and a pull (engine.svelte.ts:761). A refold re-ingests stamps already in the log with identical content (engine.svelte.ts:452): no new row, an identical re-put.
  - `appendChanges(parked)` and `markParked`: a pull (engine.svelte.ts:751-752) and a merge (io.ts:126).
  - A restore writes the record and its note in two commits (restore, then addEventWith with the new number).
  - Opening a page, a catch-up, a rebuild, or a pull that brings nothing writes nothing to the log. That was checked against rule5.test and by reading.
  - Writes of other state on a reading:
    - the snapshot (writeFold, touchFold): droppable
    - the sync record's `held` (scanClock)
    - the parked set (finding 9): not droppable
- **notes.ts:**
  - Two devices editing species notes blind: the replaced text is listed (zz-review-notes).
  - An edit made in sight of the other's text lists nothing.
  - A parked text is not listed.
  - A held edit that comes due across a reload: covered by rule5.test and passes.
  - The only wrong listing found is after Apply (13).
- **Guard:** nothing in the engine shapes a snapshot's contents. Its parks go through `markParked`, which drops the snapshot in the same transaction. The uncovered input is the clock-checked state (14), not code.
- **Convergence fuzz** (zz-review-fuzz, 3 devices, a server with arrivals, takeBatch's park-by-arrival, trustServerTime on every run, rebuild on a correction):
  - The run covered about 2,500 syncs, 1,560 edits, 1,225 adds, 368 removals, 180 restores, 69 renumbers, 1,266 reloads and 794 skews.
  - No skew, 80 seeds × 50 steps: all converge, 0 lost.
  - Skews of ±10 min, ±30 h, ±3 d, 80 seeds × 60 steps: 6 diverging seeds (5 from finding 1, 1 from finding 8) and 18 lost edits (finding 3).

## Checked and sound

- `Clock.observe` refuses stamps more than 5 min ahead on every path: ingest, fromFold's `last`, the repair. `tick` restarts after a correction.
- The hold and park rules in log.ts. `apply` is order-independent, including the `_deleted` tie: the NUL bookkeeping keys are literal NULs in the source, and they match the `'\0…'` lookups.
- A 400-plant collection round-trips the zip with every change equal (`toEqual`). That includes:
  - five-deep place paths with quotes and Hebrew (`Greenhouse › Bench 2 › Tray A › Row 3, left › Pot "nest" ש`)
  - Arabic, Persian and emoji notes
  - zero-width characters
  - measures `{ heightMm: 14.5, widthMm: 30 }`
  - photos byte for byte
- On that collection, merge and replace end in identical folds. Replace drops the device-only plant, which the preview names in `onlyHere`.
- The existing in-scope suites: 160 of 160 pass on Node 24.
- "Renumber now" pressed on two devices converges (69 renumbers in the fuzz, no divergence without skew).
- The QR label encodes the record id.
- The "notes replaced" pairing by writer, with held and parked stamps skipped.
