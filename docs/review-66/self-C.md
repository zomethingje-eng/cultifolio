# Review 66, reviewer C: records, the clock, backups, the import, data-loss paths

Working copy `/tmp/rev66/C`. Every probe is a unit test under `tests/unit/rev66c-*.test.ts`, run one file at a time with `npx vitest run <file>` (Node, fake-indexeddb). "Fails now" means the test asserts what the code should do, and it fails on this tree. Nothing in the app was changed.

Ranked by data loss first, then by what a first user would meet, then the rest.

---

## 1. A Replace cut off during the switch: what the grower does next is lost, a second Replace empties the collection, and a device that stays full can no longer open its collection. CONFIRMED (data loss)

**Where.** `src/lib/db/vault.ts:237-246` (`promote`), `:258-302` (`replaceFromStaging`, `copyStagingIn`), `:205-207` (`openStaging` begins with `deleteDB(STAGING_NAME)`), `:140-169` (`openVault` resumes the copy before it returns the database). `src/lib/backup/replace.ts:64-70` keeps the staging copy when the switch fails. `src/routes/backup/+page.svelte:83-112` (`doRestore`) catches the error and shows it.

**What the code does.** `promote` sets `staging-pending`, wipes the live stores and copies the staged file in: the changes first, then the photographs one at a time. Suppose the device runs out of space partway. This is likely: the copy has to fit beside the full staging copy, and the file can be larger than the collection it replaces. Then:
- The page shows `storageErrorText`: "This device is out of space for the collection… Free some space, or back up and remove what you can spare." It does not say the switch had begun. The tab keeps showing the old collection, which now exists only in its memory. The live vault holds part of the file, with `staging-pending` still set.
- Nothing stops writes. Every edit, a new plant, or a Merge pressed next (`opened` is still set, so both buttons are still offered) goes into a live vault that the next `openVault` wipes and refills from staging. All of it is lost without a word.
- A backup taken "as told" reads `allChanges()`. That is the partial copy of the file, not what the screen shows.
- If Replace is pressed again, `openStaging` deletes the staging database, which is now the only copy. If that attempt stops before its own switch (the device is still full), it discards what it staged. The next open then "resumes" from an empty staging database, and the collection opens empty.
- If the device stays full, every load runs the resumed copy, meets the same quota error and rejects `openVault`. The collection never opens, and the app gives no way to free the staging database it is holding.

**What it should do.** After a failed switch, the tab should stop writing, say that the replacement has begun and will finish once there is room, and reload. `openStaging` should never delete a staging copy that a pending switch still needs. A copy that cannot finish should leave the collection openable (read the staged copy, or offer to give up the staging database).

**Reproduction.** `tests/unit/rev66c-promote-failure.test.ts`, 3 tests, all failing now. A full device is stood in by refusing the live `photos` put.
- A plant added after the failure is gone at the next open (`expected undefined to be 'Copiapoa cinerea'`).
- A second Replace that stops before its switch leaves `accessions` empty.
- With the device still full, `collection.load()` rejects with `QuotaExceededError`.

**Smallest fix.**
- `openStaging`: if the live meta has `staging-pending`, refuse ("a replacement is still being finished") instead of `deleteDB`.
- `storeIn`: read `staging-pending` inside the write's own transaction and refuse while it is set, as `requireKey` already does.
- `doRestore`: for a replace that failed after `switching`, say "The replacement had begun; it finishes when there is room" and `location.reload()`.
- `openVault`: if the resumed copy fails, keep the database openable and say so, rather than reject every open.

---

## 2. A round-sixty-one backup restored on this build folds the changes its devices had parked by arrival, over the grower's later edits. CONFIRMED (silent wrong record; divergence when synced)

**Where.** `src/lib/backup/io.ts:31-33` (`fileParks`), used by the merge at `io.ts:144-147` and by the replace at `io.ts:165-170`.

**What the code does.** A format-1 file whose app is `cultifolio 3` (every build before round sixty-two) has its `parked` list ignored. The intent is that those changes are "judged here as any change arriving now". A file restore has no arrival, though. Take a change parked by its batch's arrival a month ago, such as a phone three days fast. By the time the file is restored, its stamp is in the past, so no clock parks it again. It folds, and its fast stamp outranks every edit the grower made in the days after it. On a synced device the merged change is pushed. Peers that still store it as parked keep it parked, so the restoring device and its peers disagree for good.

**What it should do.** The plant should be where the file's own device and every peer show it.

**Reproduction.** `tests/unit/rev66c-old-backup-parks.test.ts` fails now. A file as round 61 wrote it (format 1, app `cultifolio 3`, the arrival park listed) is merged into an empty device. The plant's place reads `bench-OLD`, the fast phone's value. The grower's later move, `bench-NOW`, is lost from view.

**Why the old list can be read.** Round sixty-one kept arrival verdicts and clock-only verdicts together, and the clock-only ones were judged only against a server-confirmed clock and never on this device's own changes. A change that came by sync arrived before it was judged, so `stamp > now + 2 days` implies `stamp > arrival + 2 days`: its clock verdict agrees with its arrival verdict. Only a change merged from another file could differ.

**Smallest fix.** Read the list of a format-1 `cultifolio 3` file as parked (each is offered with Apply, which undoes a wrong one), instead of folding it. At least never fold a listed stamp silently: park it, and let the parked list say where it came from.

---

## 3. An import run again after the sheet was saved again, or given a column, adds every line it already added. CONFIRMED (duplicates; the likeliest of these for a first user)

**Where.** `src/lib/import/rows.ts:127-131`. The import keys are `keyLines` over `cellsOf`, the line's raw cells: every column, mapped or not, as the file spells them. `src/lib/import/plan.ts:66-79` (`lineHash`) folds spaces and case only. `plan.ts:286-295` (`markAlreadyImported`) warns only for a line that gives a number.

**What the code does.** The key changes when the line's spelling changes, not when its plant does. A grower whose first import stopped, or who found a mistake, opens the CSV in a spreadsheet and saves it. Excel rewrites `2024-05-01` as `01/05/2024` (or `5/1/2024`) and `0012` as `12`. Ticking a "done" column has the same effect. On the second run:
- every line the first run added is new to the keys;
- an unnumbered line is added again with no warning;
- a numbered line is marked "looks already imported" but kept (the plant here carries an import key) and given the next number;
- a number Excel stripped of its zeros (`12` for `0012`) matches no plant, so it gets no warning at all.

`/about/formats` describes the key as a hash "of the line's cells as the import reads them". The code hashes the cells as written: the `="0012"` form, for one, is not read first.

**What it should do.** "Running the same sheet again leaves out every line whose plants are all here."

**Reproduction.** `tests/unit/rev66c-import-keys.test.ts`, 3 failures now:
- re-saved with dates rewritten: 3 of 3 lines offered again, none marked;
- with a column added: 3 of 3 offered again;
- numbered: written again as `0003` and `0004`.

The sheet reads to the same plants with the same fields both times (the guard test passes).

**Smallest fix.** Hash the line as read through the mapping: the mapped fields after `cellText`, with dates as `readDate` reads them, and numbers as given. Leave out unmapped columns. Then extend "looks already imported" to unnumbered lines whose name, acquired date and source match a plant carrying a different import key.

---

## 4. A sheet over 2,000 lines: a line dropped in the first pass comes back undropped in the second. CONFIRMED (duplicates)

**Where.** `src/routes/plants/import/+page.svelte:344` ("check the next N" calls `review()`, not `review(true)`), `:181` (drops are carried only within one pass, through `before`), `src/lib/import/plan.ts:119-128` (`passOf`).

**What the code does.** A dropped line has no plant here, so its keys are missing, and the second pass reads the file afresh. The dropped lines come first among its 2,000 rows, as ordinary lines to add. A grower who dropped duplicates in pass one adds them in pass two unless they find and drop each one again in a 2,000-line review.

**Reproduction.** `tests/unit/rev66c-import-passes.test.ts` fails now: lines 5 and 6, dropped in pass one, are in pass two with `drop: false`.

**Smallest fix.** Keep the dropped lines' import keys for the open file (beside `laterN`), and start them dropped in later passes. Or count them as settled in `passOf`.

---

## 5. A line partly added (one plant of its Qty removed since) numbers the rest in this collection's scheme, not the sheet's. CONFIRMED (low)

**Where.** `src/lib/import/plan.ts:110`. `markImported` sets `number: null` for a partly added line, so `planNumbers` (`:263`, `plan.given ? nextInSheet() : null`) falls to `next(year)`.

**What the code does.** In a sheet numbered `0001`–`0003` with `0001` at Qty 3, the first run gives `0001`, `0004` and `0005`, as round sixty-three's R2-6 intends. A second run that finds the third plant missing gives it `2026-0001`.

**Reproduction.** `tests/unit/rev66c-import-partdone.test.ts`: the second test fails (`2026-0001` where `0006` is expected).

**Smallest fix.** Keep `given` on a partly added line (for the pattern) while marking the sheet's own number as used, so `nextInSheet` numbers the rest.

Related, by reading: a plant removed (not marked dead) after an import is not "here" to `markImported`, which looks at live plants only. A second run therefore adds it back, as a line partly added. That is the stated rule, but the review does not say why the line reappears.

---

## 6. The plant page's death Undo is two commits and ignores what happened since. SUSPECTED (read; low)

**Where.** `src/routes/plants/[acc]/+page.svelte:434`: `collection.put('accession', id, { status: was }).then(() => collection.removeEvents([line.id]))`, fired with `void`.

**What the code does.** It is the shape the triage removed from Archive's Undo (A25: "two commits left a plant growing with its Archived line"). If the second write fails, or a sync lands between the two, the plant is growing with its death line. The status is put back to `was` without checking that it is still `dead`. The chain has no `catch`, so the toast's "Undone" is skipped and only `lastWriteError` says anything.

**Smallest fix.** One `putWith('accession', id, { status: was }, [], [{ kind: 'event', id: line.id, fields: { _deleted: true } }])`, run only while the status is still `dead`, with a catch that says it failed. This is what `undoArchive` does.

---

## What I checked and found sound

**`w`.** Nothing in a fold, hold or park reads it. The readers are only these:
- `shownTime`, used by the notes replaced unseen;
- `recordedTimes` and `recordedLineDates`, for display;
- the engine's `removedAt`;
- the vault's earliest-`w` merge (`vault.ts:405`);
- `readChanges`, which strips an unreadable `w`;
- the backup's choice of format 3.

`removedAt` uses `w` only for a marked removal, as `min(w ?? wall, first sighting)`, which is the account's "earlier of w and first sighting". A peer's `w` can only make the time earlier. The server then keeps a newer upload rather than losing one. An unmarked removal is dated by its stamp, as before.

**Convergence.** I extended `r60-fuzz` with these rounds' writes (`tests/unit/rev66c-fuzz.test.ts`, `FZ_EXTRA`):
- Archive and its one-commit Undo;
- removing a line and bringing it back (twins included);
- the death and its two-commit Undo;
- "Apply all from this device";
- remove and restore of a plant.

Runs: 120 skewed seeds (3001–3120) and 60 more (2001–2060), plus 60 unskewed seeds. Every one converged and lost nothing. The stock fuzz (15 skewed seeds) passes too.

**"Renumber now" on two devices.** The note id is derived from the record and its old and new numbers (`collection.svelte.ts:1960`), and tag36 is 64-bit. `r63l-records` passes: two logs that differ give one note, and an older build's twin is shown once and removed with it. `renumberTwins` matches the same plant and the same words only, so no real note can be taken with a twin. A repeat of the same (record, old number, new number) would need the number to come back to that record, which the ledger refuses.

**Batches.** Version 2 is written for a marked stamp or a stored park, and readers accept 1 and 2. A set-aside batch is read again with its stored arrival. `judgeOwn` and `takeBatch` judge against stored parks only.

**Photo bytes (round 64).** Every reader goes through `getPhotoBlobs` and `asBlobs`: the backup export, sync upload, Undo, and object URLs. The staging copy moves either form as it is. Replace counts staged photographs either way.

**Backups.** A format-3 file round-trips `w`, partial dates (`2024`, and `2024-05` written as `="2024-05"` and read back) and stored parks only. A file from a newer build is refused with a sentence. Unreadable rows are said on the merge screen and Replace is withheld.

**Rule 5.** Load, rebuild, catch-up and the snapshot never write to the log. The engine's `refold` and `judgeOwn` re-put only identical content: no order row, and `w` unchanged.

**Two tabs importing.** The Web Lock, `catchUp` and `stillToWrite` leave out keys already written, and a number taken meanwhile is renumbered and said.

**Mixed builds in one browser.** Rounds 62 and 63+ share DB 4 and `FOLD_RULES` 7, and the snapshot is read across them. A round-61 tab is told to let go (DB 3 to 4).

**Mixed builds on one vault.**
- Rounds 61 and 62 refuse a format-3 file with the "newer Cultifolio" sentence, so it is not silent. Practically every backup the current build writes is format 3, because every local change carries `w`.
- A round-62 file restored on round 61 loses only `w` (display only).
- A round-61 file loses its parks on every later build (finding 2).
