# Clock review of round sixty-one

The new clock rule holds in the cases the round tested, and the convergence fuzz still converges when its monotonic clock is made faithful. It breaks at the seams around it: the engine treats the clock's in-memory parks as stored verdicts, a backup stores them, an older build's stored park of a marked stamp outlives the update, and the correction's new lapse flaps on slow clocks and on laptops that sleep. The mark also has consequences the round did not state: a marked far edit outranks later edits and removals made elsewhere for as long as the fast stamp was ahead, and two other writers (the number repair, the photo removal) inherit far walls without the mark.

**What I did.**
- Read `hlc.ts`, `log.ts`, the clock and park paths of `collection.svelte.ts` and `engine.svelte.ts`, `backup/io.ts`, `backup/backup.ts`, `vault.ts` (parks, staging), the round's clock tests and agent L's report.
- Wrote 24 tests in six files under `out/tests/clock--*.test.ts`:
  - 12 reproductions, all failing on f4ab4f8;
  - 12 guards, all passing;
  - a faithful-clock copy of the fuzz.
- Six of the reproductions drive the real engine and routes, in scenarios the fuzz does not model: a backup's far change pushed in the device's own batch, a plant made while fast and then edited, a slow clock across tab visits, a lost push answer, and a failed fetch of the device's own batch.
- Ran 40 mutations of the round's fixes against the round's clock tests (11 files, 136 tests); 13 survived. The guards I wrote kill 12 of the 13; the remaining one is equivalent.
- Ran the fuzz with a faithful monotonic clock: 120 skewed seeds, all converged.
- Probed the fold-rules hash with 4 edits.
- Every source mutation was reverted, and the md5 of the four files was checked after each one.

## Findings

### 1. P1, confirmed. The engine reads the clock's in-memory parks as stored verdicts, so the writer of a far change never stores the park its peers store
`src/lib/sync/engine.svelte.ts:419` (`hold()` passes `collection.parkedStamps`), `:866` (judgeOwn) and `:934` (takeBatch).

**The cause.** Since this round, `collection.parkedStamps` also holds the parks the confirmed clock judged alone. These are kept in memory and not stored (rule 5).
- `judgeOwn` skips every stamp already in that set (`&& !collection.parkedStamps.has(c.t)`). A far change that the clock parked in memory is therefore never stored as parked by its batch's arrival, although every peer stores that verdict.
- Three days later the clock has reached the stamp and no longer parks it. The writer folds the change, and every peer keeps it parked for good.

**The reverse also happens.** `takeBatch` calls `isParked(c.t, hold)` with the same set. A clock-only park is therefore stored as an arrival verdict when the change arrives in a batch whose arrival would not park it. That is a clock verdict stored, against rule 5.

**How it happens.** A device whose clock is confirmed merges a backup from an unsynced device that was three days fast, and then syncs.

**Reproduction.** `clock--engine.test.ts`, finding 1, through the real engine:
- "the writer stores the arrival verdict its peer stores" fails with `expected [] to include '…-0000-cccccccccccc0000'`;
- "three days on" fails with `{ a: 'from a file, three days ahead', b: 'mine' }`.

**Fix.** Give arrival verdicts the stored set only. Expose `collection.storedParks` (read-only), and use it both in `hold()` for `takeBatch` and `judgeOwn` and in judgeOwn's filter.

I tried the judgeOwn half by replacing the filter with `storedParked`. Both finding-1 tests then pass, and `r61l-engine.test.ts` stays 7/7.

### 2. P2, confirmed. A backup carries the clock's in-memory parks in its manifest, and a restore stores them (rule 5)
`src/lib/backup/io.ts:28` (`parked: collection.parkedStamps`), `:127-130` (merge: `markParked`), `src/lib/backup/replace.ts:60` (replace: `setParked`).

- The round stopped storing parks judged by the clock alone, but the export still writes the whole in-memory set.
- A restore then stores each such park, by merge or by replace, on this device or another, as a fact.

**Reproduction.** `clock--marks.test.ts`, "FAILS (finding 2)": the manifest built from `collection.parkedStamps` contains the clock-only park.

**Fix.** Export the stored set (`storedParks`, as in finding 1).

### 3. P2, confirmed. A plant made while the clock was fast and edited after it was put right is said to "wait for a field from a newer version of the app"
**Where:** `src/lib/ui/WaitingRecord.svelte` and `src/routes/plants/+page.svelte:240`, both reached through `isComplete` in `log.ts`.

**What happens.**
- Arrival judging parks the plant's creation (name, status, number).
- The later edit carries the mark and is never parked.
- What is left folds as a record with notes and no name. `collection.incomplete` counts it, and the plant leaves the list.
- The plants page says "1 record waits for a field this device does not have (a file that never had it, or a sync bundle from a newer version of the app that has not arrived)". The plant's page shows WaitingRecord: "A change from a newer version of the app may still bring them".
- Neither is true: the fields are parked, and Apply on the Sync page brings them back. This is new this round. In round sixty the later edit was parked too, so the record vanished whole.

**Likely case.** A device used offline while its clock was fast, put right by hand, and then edited a plant it made in that time.

**Reproduction.** `clock--engine.test.ts`, finding 3, real engine: `collection.incomplete` is 1 where it should be 0, and `parkedRecords` is 1.

**Fix.** Leave a record out of `incomplete` when every missing field has a parked change (`parkedFor` lists a value for it). On its page, show the Parked notice with Apply instead of WaitingRecord.

### 4. P2, confirmed. A laptop sleep drops the correction where `performance.now()` stops during sleep, and a fast device's first edits after waking are parked everywhere
**Where:** `src/lib/core/hlc.ts:118-125` (the monotonic rule in `lapse`).

**What happens.**
- During sleep the wall clock moves on and `performance.now()` does not. Browsers on some platforms (macOS in particular) behave this way; the spec leaves it open.
- The drift therefore reads as a moved clock, and a correction in force lapses.
- A device three days fast that syncs (corrected and confirmed) then stamps by its own clock, three days ahead. That lasts until two readings a minute apart confirm the correction again: the run on focus gives the first, and the second comes at the next run at least a minute later, up to five minutes when idle.
- Edits made in that window are parked by their arrival on every device, the writer included, and vanish into the Parked list.
- Before this round the correction stood for its week.

**Reproduction.** `clock--lapse.test.ts` test 1: after a one-hour "sleep" (Date moves, `performance.now` does not), `Clock.tick()` gives a stamp 3 days ahead of the server time.

**Fix.** Lapse only on a backward drift (the device clock jumped back, so a fast clock was put right). On a forward drift, re-anchor `mono`.
- A slow clock set right forward is already caught by `overtaken`.
- A forward jump that is really a clock set wrong is caught by the next reading ("a first reading more than two days off unconfirms").

### 5. P2, confirmed. The correction for a clock more than five minutes slow lapses although no clock moved, so the log is folded again and again and the snapshot is never read
**Where:**
- `hlc.ts:100-102` (`overtaken`) and `:117`;
- `hlc.ts:59` (at load);
- `engine.svelte.ts:980-989` together with the listener at `:236`.

**What happens.**
- `overtaken` lapses a correction once the device clock reaches the reading's server time. On a device ten minutes slow, that happens ten minutes after any reading, whether or not anything moved.
- Each lapse tells the listeners, and the engine refolds the whole log.
- The next reading re-confirms the correction, and the log is folded twice more: once by the listener (`clockChanged`) and once by the pull's own `await collection.rebuild()`.
- At a load more than ten minutes after the last reading, `readStored` drops the stored correction. The snapshot was written under the correction (`f.offset`), so it is refused and the whole log is folded, then folded twice more at the first sync.
- The round's narrowing only exempts corrections of five minutes or less.
- Corrections of 30 s to 5 min still lapse at every sleep (finding 4), which costs three folds per wake.

**Reproduction.**
- `clock--engine.test.ts`, finding 5: three tab returns after 30 minutes away give `{ rebuilds: 9 }`; expected 0.
- `clock--lapse.test.ts` test 2: 16 listener calls in 8 visits.
- The round's own `r61l-clock-rules` test "a positive correction lapses once the device clock reaches the reading's server time" asserts this behaviour as intended.

**Fix.**
- Within a tab, let only the monotonic rule lapse a correction, and keep `overtaken` for `readStored`, where there is no monotonic reference.
- Make the pull's rebuild and the listener's one, not two.

### 6. P2, confirmed. A marked far edit outranks edits and removals made later elsewhere, for as long as the fast stamp is ahead
**Where:** `hlc.ts:333-337` (`hlcPast`) and `collection.svelte.ts:1376`.

**What happens.**
- An edit placed past a year-ahead stamp is itself stamped a year ahead (marked), and it shows everywhere, as intended.
- But it also beats every edit made after it, by true time, on a device that had not yet seen it.
- Example: B, put right, edits at 12:01, and A edits the same field at 13:01, both clocks right. After the sync both devices show B's 12:01 text.
- A removal made an hour later is undone on every device and stays undone: "a later change to any other field revives it", and the marked edit is "later" by a year.
- Round sixty parked B's edit on the peers (the divergence this round fixed), so A's removal held. This round trades that divergence for this ordering.
- `/about/formats` says "a later edit anywhere is placed past it in turn", but says nothing of an edit made concurrently.

**Reproduction.** `clock--marks.test.ts`, "FAILS (finding 6)" and "(finding 6, removal)": `['B at 12:01, clock right', …]` and `['B, clock right', 'B, clock right']` where `'(removed)'` was expected.

**Fix.** None small: under last-writer-wins by stamp, the mark has to sort after the stamp it was placed past. At least say on `/about/formats` that a field (and a record's removal) is ordered by that far stamp until its time, and that concurrent edits and removals there resolve by it, not by when they were made.

### 7. P2, confirmed. "Renumber now" on a record whose last stamp is a marked far one writes a repair that is parked; the note is dated a year ahead
**Where:** `collection.svelte.ts:1778-1790` (`resolveDuplicateNumbers`).

**What happens.**
- The repair is stamped at `rec._t.wall + 1`, unmarked, by a `zz…` writer that is not this device.
- If `_t` is a marked stamp a year ahead (common after finding 6's edits), the repair is parked:
  - here, by the confirmed clock, or held when the clock is unchecked;
  - on every peer, by its arrival.
- The number stays shared, the page keeps offering "Renumber now", and the Sync page lists the repair as a change from a device whose clock was wrong.
- The "Renumbered from…" note is dated `2027-10-04`.

**Reproduction.** `clock--marks.test.ts`, "FAILS (finding 7)": `acc` stays `2026-0001`, and the note's `d` is a year ahead.

**Fix.** Stamp the repair past `rec._t` with the mark (`hlcPast`-style counts, which every device derives alike from the same log). Date the note from the record's latest unmarked stamp.

### 8. P2, confirmed. A marked stamp that an older build parked by arrival and stored stays parked after that device updates
**Where:** `log.ts:209-210`. `isParked` checks `hold.parked` before `isPastStamp`.

**What happens.**
- A device on round sixty's build reads the mark as a large counter, parks the marked edit by its arrival, and stores that verdict.
- After it loads the new build, the stored verdict still wins. It shows the old value while every updated device shows the edit.
- Its own later edits to that field sort below the marked stamp everywhere else, so they never show on the peers.
- REVIEW-ROUND-61 §1.3 says the older build misreads the mark only "until it updates". The same happens with a backup made on an older build (manifest parks).

**Reproduction.** `clock--marks.test.ts`, "FAILS (finding 8)": `['A, clock right', 'made on A']`.

**Fix.** Ignore marked stamps in the stored parked set (filter them in `rereadParked`, or test `isPastStamp` first). No build of this round stores one.

The `r61l-clock-rules` assertion "a stamp parked before stays parked, flagged or not" needs to change with this fix.

### 9. P2, confirmed. A far change of this device's own, parked by `takeBatch` (a lost push answer), stays on screen in this tab until a reload
**Where:** `engine.svelte.ts:934-939`.

**What happens.**
- When a push's answer is lost, the batch is listed later as new and judged by `takeBatch`, as L's report says. It is parked and stored correctly.
- But unlike `judgeOwn`, `takeBatch` does not refold. This device's own change, already folded in this tab, therefore stays on screen while the Sync page lists it with Apply.
- The same holds for any change folded here before its batch arrived, such as one from a file.

**Reproduction.** `clock--engine.test.ts`, finding 9: `{ shownInTab: 'a year fast', afterReload: 'today' }`.

**Fix.** After `markParked` in `takeBatch`, rebuild when any parked stamp is already in this tab's fold, as `judgeOwn` does.

### 10. P3, confirmed. The fuzz's monotonic clock is the real one, so it barely tests a correction in force; it also copies judgeOwn's filter from finding 1
**Where:** `tests/unit/r60-fuzz.test.ts:218, 227`.

**The monotonic clock.**
- The fuzz fakes `Date` only, so `performance.now()` is real. Every step moves the device clock 1 to 120 s and the monotonic clock a few ms, and `lapse` drops each correction within a step.
- A probe over 40 seeds counted the edits made on a skewed device while a correction was in force: 11 of 221 in the fuzz, against 133 of 220 with `performance.now` = true time.
- With the faithful clock, all 120 skewed seeds still converge and nothing is lost (`clock--fuzz-mono.test.ts`, 8.5 min).

**Other gaps in the model.**
- It judges every own change rather than going through `ownMax` and the name hour.
- It skips `parkedStamps` exactly as the engine does (finding 1).
- It has no imports or backups, no snapshot (`readFold` returns undefined, so the inventory of clock parks is never read), no lost answers and no failed fetches. Findings 1, 3 and 9 come from those gaps.

**Fix.** Adopt `clock--fuzz-mono`, and add a backup-merge op to the mix.

### 11. P3, read. `/about/formats` describes the counter as it was before the mark
**Where:** `src/routes/about/formats/+page.svelte:25`.

**What happens.** The page says "a hex counter of four digits (up to six, only when a millisecond holds more than 65,535 changes)". Every marked stamp now has six digits (0x800000 and up). The mark is explained only later on the page, in the sync paragraph.

**Fix.** Add "or when it carries the mark 0x800000 (see Sync)" to that sentence.

### 12. P3, confirmed. 13 of 40 mutations of the round's fixes survive the round's clock tests
The round's clock tests are `r61l-*`, `clock-park`, `r60-clock-review`, `r61h-clock-slack`, `sync-engine` and `collection-store`. These mutations pass all 136 of their tests:

| Mutation | What it changes | Status |
|---|---|---|
| M2 | `hlcAfter` drops the mark when the counter is full | |
| M4 | `isPastStamp` tests `>` instead of `>=` | |
| M9 | a lapse does not tell the listeners, so nothing is refolded | |
| M11 | `readStored` ignores `overtaken` | equivalent: the first `nowMs` lapses it anyway |
| M12 | the pending reading is aged without `trustedAge` | |
| M13 | an old record without `serverAt` is never overtaken | |
| M16 | the snapshot inventory leaves out the clock's parks | |
| M17 | `rebuild` keeps the memory parks of a clock no longer confirmed | |
| M22 | a snapshot load does not read back the held fields | the held count is wrong |
| M23 | `ownLatest` counts marked stamps, giving a false clock line | |
| M25 | `ownMax` counts marked stamps | extra fetches only |
| M33 | `judgeOwn` drops an entry whose fetch failed | |
| M39 | `noteAhead` counts marked stamps | |

The 27 killed include every arrival-judging and mark-placing mutation (M3, M14, M15, M24, M26 to M32), the refusal (M35, M36) and the 409 (M37, M38).

The guards in `clock--guards`, `clock--snapshot`, `clock--marks` (the M17 and M23 guards) and `clock--engine` (M25, M33, M39) kill all of the survivors except M11. Each was checked by re-running the mutation against the guard.

### 13. P3, confirmed. The fold-rules hash covers the fold but not the code its round-61 reasoning names
Four edits pass `fold-rules.test.ts` unchanged:
- `ownMax = 0` in `pushBatch`, which would stop all judging of own changes;
- skipping `listOwnOnce`;
- `FOLLOW_HELD_MS = 0` (the constant `stampPast` reads);
- removing `applyParked`'s restore.

None of them changes what a given log, parked set and clock fold to. A stored park drops the snapshot in its own transaction, so there is no stale-snapshot risk.

But the round hashed `stampPast`, `commit`, `ownToJudge` and `judgeOwn` on the ground that "what an edit is stamped shapes every fold after". By that ground, `pushBatch`'s `ownMax`, `pull`'s queueing, `listOwnOnce` and `FOLLOW_HELD_MS` belong too.

Either add them, or narrow the comment to "what a fold of a given log and parked set comes out as". The second is the true contract.

### 14. P3, read. A peer that marks every stamp escapes holds and parks for good
**Where:** `log.ts:210, 228`.

**What happens.**
- With one bit set, a buggy or third-party writer's stamps are never held or parked.
- With a fast clock it wins every field it touches for as long as it is ahead, as the round-forty-nine phone set to 2031 did.
- Every later edit elsewhere is placed past it (marked, at its wall), so its walls spread through the fields it touched. They do not spread into any clock (`observe` ignores far stamps).
- No clock line names it (`ownLatest` and `noteAhead` skip marked stamps), and nothing lists it as parked.
- Older builds park it by arrival, so the vault diverges by build.

A hostile peer holds the key and can write anything, so this matters mainly for a buggy writer. The format is documented for tools.

**Smallest guard.** Treat a marked stamp as exempt only when the log holds a stamp of the same record and field at the same wall (the one it was placed past). This is order-dependent at arrival, so it needs care. At least name it on `/about/formats`.

### 15. P3, read. A photograph removed under a marked far stamp keeps its bytes on the server for as long as the stamp is ahead
**Where:** `collection.svelte.ts:1039-1046` and `engine.svelte.ts:1153`.

**What happens.**
- `removedPhotos` gives the removal's wall time. A removal placed past a marked far stamp is a year ahead, so `nowMs() - at < DROP_AFTER_MS` holds for a year and the server is never asked.
- When it is asked, `x-photo-removed-at` is a year ahead.

**Fix.** Give the removal's time as `min(hlcWall(t), nowMs())` for a marked stamp.

## Checked and sound

- **The mark survives:**
  - **The backup zip round trip:** the stamp comes back byte for byte (guard in `clock--marks`).
  - **The CSV and the importer:** the CSV carries no stamps, and the importer mints by `tick`.
  - **The regex (4 to 6 hex digits), `isPastStamp`'s parse and `hlcCompare`'s length-then-text order:** all agree; a marked counter sorts after every natural counter at its wall.
- **A natural counter cannot reach 0x800000:**
  - **By ticking:** it would take 8.4 million ticks in one millisecond, and an import of 20,000 plants is about 400,000.
  - **Through `observe`:** it resets a marked counter.
  - **The one route:** a peer's crafted unmarked count of 0x7fffff that `observe` then bumps.
  - **An older build observing a marked stamp near now:** its ticks are marked for at most five minutes, at walls never far ahead. That is harmless.
- **Per-change judging:** `judgeOwn` and `takeBatch` judge each change by `isParked(c.t, hold(at))`. A true-time edit in a batch with a far stamp is never parked (the M25 guard counts fetches).
- **The batch name:** a batch's name carries its maximum wall, because the outbox is sorted by `hlcCompare` and its slices keep that order. So the name-hour fallback cannot miss a far stamp, and a lost `ownMax` (another tab without locks, a prune) falls back to it.
- **Reloads and retries:**
  - A reload during `listOwnOnce` starts it again, because `ownListed` is saved only at the end.
  - A failed fetch in `judgeOwn` is retried (M33 guard).
  - A lost push answer is parked by `takeBatch` and stored, though see finding 9 for this tab.
- **Rule 5:**
  - A load, a rebuild and another tab's refold store no clock park.
  - The snapshot carries them in its inventory and a snapshot load re-judges them (M16 guard).
  - A rebuild after the clock stops counting as confirmed drops them (M17 guard).
  - The exceptions are findings 1 and 2.
- **The held count:** right after an override, on whole-log and snapshot loads alike (M22 guard), and in the engine's `setHeld`.
- **The correction:**
  - A fast clock set right by hand lapses at once, within the tab and at load.
  - A first reading more than two days off unconfirms.
  - The pending reading uses `trustedAge` (M12 guard).
  - An old stored record reads `serverAt` as `confirmedAt + offset` (M13 guard).
  - A clock that jumps an hour at a daylight-saving change, on a device keeping local time in its hardware clock, lapses once and is re-taken at the next reading, which is the right behaviour.
- **The fuzz with a faithful monotonic clock:** 120 of 120 skewed seeds converge, and nothing is lost.
- **Apply on a parked restore restores** (M19 is killed). A parked change replaced by a marked edit is no longer offered (M20 is killed).
- **The refusal and the 409:** the refusal is kept in the sync record and read at init and at each run; a 503 under 60 s is not kept; a 409 is asked again at most hourly per tab. All four mutations are killed.

## Suggestion

- **"Apply all from this device" on the Sync page.** Arrival judging now parks everything a device did while its clock was fast, its own creations included. A month offline at a wrong clock means one Apply per record.

## Files

- **Report:** `/tmp/r61rev/out/clock.md`.
- **Reproductions (FAIL on f4ab4f8):**
  - `/tmp/r61rev/out/tests/clock--engine.test.ts`: findings 1, 3, 5 and 9;
  - `/tmp/r61rev/out/tests/clock--marks.test.ts`: findings 2, 6, 7 and 8;
  - `/tmp/r61rev/out/tests/clock--lapse.test.ts`: findings 4 and 5.
- **Guards (PASS):**
  - `/tmp/r61rev/out/tests/clock--guards.test.ts`;
  - `/tmp/r61rev/out/tests/clock--snapshot.test.ts`;
  - the PASSES tests in `clock--engine` and `clock--marks`;
  - `/tmp/r61rev/out/tests/clock--fuzz-mono.test.ts`.
- **How to run:** each file's header says how. Use `--testTimeout=180000` on a loaded machine.
