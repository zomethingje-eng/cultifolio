# Agent R, round sixty-seven: report

Working copy `/tmp/r67/R`. Needs for other owners are in `/tmp/r67/R-needs.md` (H: the fold-rules hash; P: the
keep-ask shim, a picker id, Today's failed state and the about-page sentences; V: C1 as built, a picker id, the offer's
failed state, and a note on `openVault`).

**FOLD_RULES stays 7.** No fold rule changed. The source hash in `tests/unit/fold-rules.test.ts` (H's) must be
re-recorded under 7; the behavioural hash in the same file passes unchanged. See H-1 in the needs for why.

"Failed on the base" below was shown by running the new test files against the base sources (`/tmp/r67base/src` copied
to a scratch directory with R's `node_modules`), unless said otherwise.

---

## Contracts

### C1 (R provides, V uses)

- **Files:** `src/lib/db/vault.ts` (`storeIn` gains `StoreOpts { copying?, meta?, markLast? }`; `appendChanges` passes
  `meta`/`markLast`; new `arrivalSeqsAfter`), `src/lib/db/collection.svelte.ts` (`putWith(..., opts)`, `commit(..., opts)`,
  and a public `saveSnapshot()`).
- **Shape:**
  - `collection.putWith(kind, id, fields, events = [], also = [], opts = {})`, `opts: { meta?: Record<string, unknown>; markLast?: string }`.
  - `meta` entries and `markLast`'s value (the `order` store key of the last change stored; the vault's last arrival when
    the commit stored none) are written in the same read-write transaction as the changes. A refused commit writes none.
  - `arrivalSeqsAfter(seq: number): Promise<Array<{ seq: number; t: string; kind: string; id: string; field: string; value: unknown }>>`,
    every change with an arrival number above `seq`, in arrival order.
  - `collection.saveSnapshot(): Promise<boolean>`: for V5's snapshot after the seed.
- **Test:** `tests/unit/r67r-vault.test.ts`, "C1" (2 cases, both failed on the base).

### C2 (R provides)

- **File:** `vault.ts`: `NO_OUTBOX = DB_NAME === DEMO_DB`; `storeIn` writes no outbox row there.
- **Test:** `r67r-vault.test.ts`, "C2" (failed on the base: 6 outbox rows).

### C4 (P provides; R's call site)

- **Files:** `collection.svelte.ts` `load()` now reads `persisted()` without asking and, with records, calls
  `askToKeep('load')` from `$lib/ui/keep-ask`; `askDue` and its key are gone from the collection.
- **Shim:** `src/lib/ui/keep-ask.ts` in R's copy is a minimal stand-in with C4's exact signature. **The lead replaces it
  with P's file** (need P-1).
- **Test:** `tests/unit/r64f-persist.test.ts` (R's: it tests the load) now mocks `$lib/ui/keep-ask`; passes.

---

## Items

### R1. A Replace that runs out of space (S-C1)

- **Files:**
  - `vault.ts`:
    - `storeIn` reads `staging-pending` in its own transaction and refuses with `ReplacePendingError` while it is set
      (the copy itself passes `copying`).
    - `openStaging` refuses while a switch needs the staging copy, instead of deleting it.
    - `openVault`'s resume of the copy no longer rejects the open: it says why (`onVaultNotice`, which now replays the
      current notice to a late listener) and returns the database; writes stay refused until a later load finishes it.
  - `src/lib/backup/replace.ts`: a failure after the switch began is thrown as `ReplaceBegunError`.
  - `src/routes/backup/+page.svelte`: on `ReplaceBegunError` it says the replacement had begun and finishes when there is
    room, then reloads after 2.5 s.
- **Test:** `tests/unit/r67r-replace-pending.test.ts`, adopted from the self-review's probe and inverted (3 cases, all
  failed on the base: the write was stored and lost, the second Replace emptied the collection, every load rejected).
- **Note:** `openVault`'s change is inside its `.then` only; `blocking` and the example handling are untouched (V-4).

### R2. A slow clock fixed while closed (R45-14)

- **File:** `src/lib/core/hlc.ts`. New `inForce()`: a positive correction over `TRUST_SERVER_TWICE_PAST_MS` (two days)
  is not in force while `unsure`; the device stamps by its raw clock until a reading.
  - `nowMs`, `clockOffsetMs` (the warning and the snapshot's key) and `trustServerTime`'s return read it.
  - Listeners are told when the clock in force changes: a reading that confirms a large stored correction now tells
    them once (one refold).
  - The stored record is unchanged: the correction is kept for the reading to confirm.
  - A negative correction, or one of two days or less, behaves as before.
- **Note, as decided:** this applies whenever the correction is unconfirmed, so it also covers:
  - a tab opened beside a confirmed one;
  - a tab after one disagreeing reading.

  Those stamp by the raw clock (behind, on a slow device) until their own reading. Behind parks nothing, and an edit in
  sight of a field is still placed past the field's stamp.
- **Tests:**
  - `tests/unit/r67r-clock-unsure.test.ts` (6 cases). 3 failed on the base: after the reload, the three days were in
    force; and within a tab, an unaccounted move forward kept them.
  - Updated, since they asserted the old behaviour (R owns `hlc.ts`):
    - `r61l-clock-offset.test.ts`, case 2: now asserts the stored three days, the raw clock in force, and an offline
      edit that parks nothing;
    - `r62bl-clock-tabs.test.ts`, "the stored correction is not dropped…": now asserts it stays stored, every tab
      stamps alike, and a confirming reading brings it into force in every tab.
- **Convergence:**
  - Passed: `r60-fuzz`, `r61l-clock-fuzz-classify`, `r61l-clock-devices`, `r61l-clock-rules`, `r61l-clock-rebase`,
    `r61l-engine`, `r62l-clock-correction`, `r62l-clock-engine`, `r62l-clock-marks`, `r62l-clock-snapshot`,
    `r62bl-clock-set-right`, `clock-park`, `log-hold`, `r60-clock-review` and the rest listed under "Unit runs".
  - The behaviour hash holds.

### R3. Import duplicates (S-C3, R45-15)

- **Files:**
  - `src/lib/import/rows.ts`: a sheet line's key is `keyCells`. These are the mapped fields as read, in a fixed order:
    - the name as read, Genus and Species joined;
    - a date as `readDate` reads it, or its text when it is not read;
    - the number with its digits' leading zeros dropped;
    - no unmapped column.
  - `src/lib/import/plan.ts`:
    - `markAlreadyImported`: a numbered line whose number and name match a plant here starts dropped, whatever the
      plant's key ("Add anyway" keeps it).
    - `numberKey`: numbers are compared without their zeros.
    - New `markChanged`: an unnumbered line whose name, date acquired and source match a plant carrying an import key
      that this sheet no longer makes is marked `changed`. It is said and kept. Each plant explains one line at most.
    - `nextInSheet` stops at `!Number.isSafeInteger`.
  - `collection.svelte.ts`: new `allAccessions()` (removed plants included).
  - `src/routes/plants/import/+page.svelte`:
    - removed plants' keys and numbers count;
    - the "looks already imported, changed" notice with "Drop them";
    - the old "from another line" notice is gone, since such lines now start dropped.
  - `src/lib/import/commit.ts`: `stillToWrite` counts removed plants' keys.
- **Tests:**
  - `tests/unit/r67r-import.test.ts` (14 cases): the self-review's key, pass and part-done probes, inverted, plus cases
    for removed plants, zeros, unnumbered lines changed since, and the safe integer.
  - This file imports the new exports, so it cannot run against the base. The probes it adopts failed on the base (C's
    report, and the import-keys probe's 3 cases). Run unmodified against R's tree, `rev66c-import-keys` and
    `rev66c-import-partdone` pass.
  - The "removed plants" and "safe integer" cases are new. The second hung on the base (R45-15: killed after 40 s).
  - Updated `r62g-import.test.ts` (R's): "7 Lithops lesliei" now starts dropped and is added by "Add anyway", and a part
    done line keeps its number marked `numberUsed`.
- **Dates in the key:** a whole date is keyed by its year and its day and month in either order (`dateKey`), so neither
  a spreadsheet's rewrite (2024-05-01 to 01/05/2024) nor the day-first answer, which a later run may not give, changes
  the key. A case was added for this.
- **Compatibility:** plants imported by rounds 62 to 66 carry raw-cell keys. A rerun of their sheet then matches:
  - numbered lines, by number and name (dropped);
  - unnumbered lines, by name, date and source ("changed", said).

### R4. Dropped lines stay dropped in later passes (S-C4)

- **Files:**
  - `plan.ts`: `markDroppedBefore`; `passOf` leaves such lines out and counts them (`droppedBefore`).
  - Import page: `droppedKeys` keeps the dropped lines' import keys for the open file when a pass is added, and the
    review says how many stay dropped.
- **Test:** `r67r-import.test.ts`, "passes" (the self-review's probe, inverted; it failed on the base).

### R5. A partly added line keeps the sheet's pattern (S-C5)

- **Files:**
  - `plan.ts`: `markImported` keeps the number and sets `numberUsed`.
  - `planNumbers` numbers such a line on in the sheet's pattern and does not list it as renumbered.
  - The page's "is taken" note skips it.
- **Test:** `r67r-import.test.ts`, "partly added" (the probe's second case failed on the base with `2026-0001`).

### R6. A round-61 backup's parks (S-C2)

- **File:** `src/lib/backup/io.ts`: `fileParks` returns the list whichever build wrote it.
- **Tests:**
  - `tests/unit/r67r-old-backup-parks.test.ts`: the self-review's probe. It failed on the base (`bench-OLD`).
  - `r62bl-records.test.ts` (R's) is updated to the reversed decision: an old file's merge and replace now store its
    park.

### R7. The death Undo is one commit (S-C6)

- **File:** `src/routes/plants/[acc]/+page.svelte`. The Undo is one `putWith` of the status and the line's removal, run
  only while the plant is still dead. A failure is said in a toast.
- **Test:** `tests/e2e/r67r-places.spec.ts`, "R7": counts the read-write transactions over the log during the Undo, and
  expects 1. Passed. The base wrote two commits (by reading); the base was not built.

### R8. Renumber (R45-19)

- **File:** `collection.svelte.ts`:
  - `resolveDuplicateNumbers` adds every number the log ever gave (`numbersInLog`, one read of the log, only on
    "Renumber now");
  - `events()` hides a renumber note that shares its "from" with another and whose "to" is neither the record's number
    now nor the "from" of another note (`renumberSiblings`, cached per list).
- **Tests:** `tests/unit/r67r-records.test.ts`, "R8" (3 cases). Two failed on the base: it gave `2026-0009` again, and it
  showed both notes. The chain case is a guard.

### R9. `w` within sane bounds (R45-22)

- **Files:**
  - `src/lib/core/when.ts`: `isRecordedTime(w, t?)` takes a whole number from 2020-01-01 (`W_MIN`) to 8.64e15 and, given
    its stamp, not more than a day past the stamp's wall. Earlier than the wall is allowed, since a marked stamp sits
    ahead.
  - `shownTime`, `readChanges` (`log.ts`) and `recordedTimes` (collection) pass the stamp.
- **Test:** `r67r-records.test.ts`, "R9" (4 cases, all failed on the base).

### R10. A malformed change; a refused database (S-E15, R45-23)

- **File:** `collection.svelte.ts`:
  - `applyHere` skips a change `changeError(c, true)` refuses and counts it (`malformed`, by the change's text, reset
    with the fold);
  - while any are present, no snapshot is written, so every load counts them;
  - `load()` sets `failed` (a sentence) when the load rejects, and still rejects.
  - The Backup page shows both. Today and the offer need P-3 and V-3.
- **Test:** `r67r-records.test.ts`, "R10" (2 cases, both failed on the base: it threw `"id" is a reserved record field`,
  and `failed` was undefined).

### R11. Busy guards (S-E3, IND-4, R45-18)

- **Files:**
  - `src/routes/plants/[acc]/+page.svelte`: `doMove` (`moveBusy`) and `saveEdit` (`saveBusy`), each with
    `aria-disabled` while busy.
  - `src/routes/propagation/[id]/+page.svelte`: the batch Edit's Save (`saveBusy`).
  - All three catch a refused write; the page's write-error notice says why.
- **Test:** `r67r-places.spec.ts`:
  - E places 1, 2 and 4 (inverted);
  - the batch Save.

  All pass. On the base, the self-review's probe measured two moves in each of 1, 2 and 4.

### R12. settlePlaces (S-E12, E13, E14, IND-5, R45-18)

- **Files:**
  - `src/lib/ui/places-pending.ts`: pickers register by id; `settlePlaces(...ids)` settles only those (with no id,
    every one, for pages with one picker).
  - `src/lib/ui/LocationPicker.svelte`: registers by its `id`. A place that cannot be made shows "The place was not
    made. …" in the picker (`#<id>-err`, `role="alert"`) and rejects to the waiting form. "Add place" catches its own
    rejection.
  - `addLocation`'s parent-gone message is now a sentence the picker can show.
  - Plant page: `settlePlaces('mv-loc')` and `settlePlaces('ed-loc')`. Batch page: `'p-loc'` and `'se-loc'`. Each is
    caught.
  - Import page: `await settlePlaces('imp-loc')` at "Check names".
  - `vault.ts` `storeIn` marks `tx.done` handled. A transaction aborted before the write awaited it left an unhandled
    AbortError: E places 3's `pageerror`.
- **Tests:**
  - `tests/unit/r67r-places-pending.test.ts` (3 cases; the first failed on the base, settling both pickers).
  - `r67r-places.spec.ts`:
    - "R12: Move settles only its own picker" (IND-5's two forms);
    - "a place that cannot be made…" (E places 3: the error shows in the picker, there is no page error, and a second
      press works);
    - "the import's place picker is settled at Check names".

    All pass.
- **Needs:** P-2 and V-2 pass the picker ids in `plants/new` and `propagation/new`. Their pages have one picker each,
  so they behave correctly without the needs.

### R13. The cost of each change (S-E1, S-E5, IND, R45-D)

- **Files:**
  - `vault.ts`: `arrivalsAfter` and `arrivalSeqsAfter` share `tailAfter`. It makes one `count` of the stamps' key range,
    then one `getAll` over that range filtered by the tail's set and returned in arrival order.
    - Fallback: when the range holds more than 4× the tail plus 64, a tail under 200 is read one `get` per change, as
      before.
    - About 5 requests for any contiguous tail. The example's reload was 432 `get`s.
  - `appendChangesClaiming` reports what it stored. `claimNow` moves the frontier as `commit` does (`advanceOver`).
    In `commit`, the frontier now moves after the fold, so a snapshot written meanwhile never claims a row its records
    do not hold yet.
  - `collection.saveSnapshot()` (public).
    - `commitImport` calls it after an import that added plants.
    - `restoreBackup`'s merge calls it.
    - A replace drops the snapshot, and its reload folds and writes one.
  - Example outbox: C2.
  - One row per commit: deferred, as the triage says.
- **Tests:** `r67r-vault.test.ts`, "R13" (5 cases, with request counts on `IDBObjectStore`):
  - the 431-change tail: base 431 `get`s, now at most 2 and one `getAll`;
  - a write after a claim: base 1 `getAll` of `order`, now 0;
  - `saveSnapshot`: missing on the base;
  - scattered stamps: guard;
  - arrival order: guard.

  H's Chromium budgets cover the browser side.

### R14. "1 200 €" (R45-25)

- **File:** `src/lib/ui/grow/spend.ts`: a space, a no-break space, a narrow no-break space or a thin space is a
  thousands separator where exactly three digits follow it.
- **Test:** `tests/unit/r67r-spend.test.ts` (4 cases, all failed on the base).

---

## About-page sentence changes

All are needs for P, given in full in `R-needs.md` P-4: the clock (R2), the import key and the import's
"already here" (R3, R4, R5), older backups' parks (R6), Renumber (R8), `w` (R9), the snapshot and the example's outbox
(R13), a malformed change and a refused database (R10), a replace cut off (R1), and the price (R14).

---

## Runs

### Unit (one file at a time, `npx vitest run <file>`)

Every unit file that imports a module R changed was run: 106 files, each with its result, in `/tmp/r67/R-unit-results.txt`. All pass except:

- `fold-rules.test.ts` (H's): the source-hash case. Re-record under 7 (need H-1); the behaviour case passes.
- `sowing.test.ts` failed once on the new wording of `addLocation`'s parent-gone error. R updated its regex (R owns the
  collection), and it passes.

After the last edits, these were run again and pass: `r67r-import`, `r67r-records`, `sowing`, `r62g-import`,
`r61g-import`, `r62bg-import`, `r63fd-import`, `r60f-import`, `r61g-import-attack`, `r61g-import-loss`,
`r62bg-import-tabs` and `r63l-import-numbering`.

New files, all passing:

| File | Cases |
|---|---|
| `r67r-clock-unsure` | 6 |
| `r67r-import` | 14 |
| `r67r-vault` | 8 |
| `r67r-replace-pending` | 3 |
| `r67r-records` | 9 |
| `r67r-places-pending` | 3 |
| `r67r-spend` | 4 |
| `r67r-old-backup-parks` | 1 |

Existing files R updated, because they asserted the old behaviour of R's code:

- `r61l-clock-offset`
- `r62bl-clock-tabs`
- `r62g-import`
- `r62bl-records`
- `r64f-persist`
- `sowing`

### E2E (`PW_PORT=4212`, Chromium, `--retries 0 --workers 1`)

- `tests/e2e/r67r-places.spec.ts`: 8 of 8 passed on the final tree.
- `r62bg-import.spec.ts`, `r62g-import.spec.ts`, `r61g-import-labels.spec.ts`: all pass.
  - r61g 4 failed once: the date key first followed the day-first answer, which its second run does not give.
  - Fixed by `dateKey`, which keys a whole date by its year and its day and month in either order. It passes since.

### svelte-check

`npx svelte-check --threshold error` reports 961 files, 0 errors, 0 warnings, on the final tree.

### Left undone, and why

- **One outbox row and one order row per commit:** deferred by the triage until measured on a device.
- **e2e base runs:** not built. E2E base failures are cited from the self-review's probe outputs (E places 1 to 4) and
  from reading (the death Undo's two commits).
- **`r67r-import.test.ts` against the base:** it imports exports that are new this round, so it cannot run there. The
  probes it adopts failed on the base.

