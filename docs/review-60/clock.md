# Round 60 self-review: clock

Reviewer area: the round-sixty clock decisions and everything that decides what a fold shows (`hlc.ts`, `log.ts` `isParked`/`isHeld`, `collection.svelte.ts` `stampPast`, `commit`, the snapshot key, `applyParked`, `restore`, `checkClock`; the engine's `hold` and `takeBatch`; `notes.ts`). Copy: `/tmp/r60rev/clock` (identical to `21257b7` by md5 for the four source files; every mutation reverted and re-checked by md5).

How: I read the code paths line by line, then wrote 16 tests (12 reproductions that fail on `21257b7`, 4 guards that pass) in three files, using the real vault over fake-indexeddb (the boot pattern of `r60-clock-review.test.ts`) and the two-device harness of `r60-fuzz.test.ts`. I instrumented the convergence fuzz to classify every diverged seed and to press Apply on every peer afterwards (120 skewed seeds, then the same without the +3 day skew, then the 26 diverged seeds again with each parked stamp attributed to its writer's skew, correction and confirmation). I ran 14 mutations of the round's fixes against the round's clock tests (8 files, 62 tests) and, where those passed, against `collection-store`, `sync-engine` and the engine suites.

The headline: "an edit always wins" does not hold on a confirmed clock. The rebase parks only the field's latest stale stamp, so an older one of the device's own takes the field back (P1); a removal parks a different field and leaves the plant (P1); the formerly fast device shows its own year-ahead value over every edit from a correct device for as long as its clock was wrong, and Apply on the peers does not fix it (P1); Apply on a parked restore writes nothing (P1). The round's traced seed (1008), and both divergent seeds without the three-day skew, are not "a device three days fast": they are a stored correction outliving the clock change it corrected (P2).

## Findings

### 1. P1. On a confirmed clock, an edit to a field this device wrote twice while fast is stored and not shown. Confirmed.

- Where: `src/lib/db/collection.svelte.ts:1308` (stampPast) and `:1222-1224`, `:1244-1248` (commit). The rebase parks only `prev`, the field's current stamp. Any older stamp of this device's own on the same field that is also years ahead is not parked, is never parked by the fold (`log.ts:207`, own stamps are exempt), and after the rebuild it beats the edit, which was stamped now.
- What happens: clock a year fast, add a plant with notes "typed while fast", edit the notes to "edited while fast"; clock put right and confirmed by a sync reading; edit the notes. `lastWriteError` is null and the plant shows "typed while fast", a text the grower replaced a year ago. The next edit shows (the next stale stamp is parked then), so the grower has to type it once per stale stamp. The record page's notes history (`replacedNotes`) then lists the grower's own new edit as replaced unseen by the year-old text. The clock line under the bar says "what you edit now saves and shows" (`src/routes/+layout.svelte:303`).
- Should: the edit shows, as the decision promises.
- Repro: `clock--rebase.test.ts` "the first edit after the clock is confirmed is shown": received `'typed while fast'`.
- It arises naturally across devices too: `clock--devices.test.ts` "two edits while fast": B's first edit after its clock is confirmed shows on A and not on B (diverged).
- The fuzz's "nothing lost" check does not catch this because no seed edits one field twice while three days fast and again within the following day on a confirmed clock.
- Smallest fix: in the rebase, park every stamp of this device's own on that field (and record) that is more than two days past the confirmed clock, read from `changesOf(kind, id)`, not only `prev`. Better: see finding 3's fix, which removes the rebase.

### 2. P1. Removing a plant made while the clock was fast does not remove it; it strips one field (here its number) instead. Confirmed.

- Where: `collection.svelte.ts:1291` and `:1308`. For `_deleted`, `prev` is the record's latest edit to any field (`'*'`). On a confirmed clock that stamp is this device's own and stale, so it is rebased: the change of that OTHER field is parked. The removal is stamped now, the rebuild folds the remaining fields (still a year ahead), and since an edit later than the removal revives the record, the plant stays.
- What happens (`addAccession` while a year fast, confirm, `remove`): the plant is still listed; its `acc` change is parked, so it has no number (pages fall back to the id); the record page shows "An edit from a device whose clock was wrong (dated <next year>: acc) was not applied. Apply it now". Removing a watering line made while fast does the same, and the line then drops out of the timeline as incomplete only if the parked field happens to be a required one.
- Repro: `clock--rebase.test.ts` "a removal of a plant made while fast takes".
- Smallest fix: never rebase for `_deleted` (and `restore`): stamp the removal just past `'*'` (`hlcAfter`), as an unchecked clock already does. The removal then wins here; peers park it by arrival, which is finding 3's divergence.

### 3. P1. The formerly fast device shows its own year-ahead value over every edit a correct device makes, for as long as its clock was wrong; Apply on the peers does not converge them. Confirmed.

- Where: `log.ts:207` (own stamps never parked by this device's clock) against `engine.svelte.ts:785` (peers park by arrival). The writer never judges its own pushed stamps by their arrival.
- Five rounds, one field, two devices (`clock--devices.test.ts`): A makes a plant at true time; B's clock jumps a year ahead, B edits the notes, syncs once (pending), is put right and confirmed. Then A edits the notes five times, syncing both after each:
  - `1: A=A round 1 B=B while fast 0` ... `5: A=A round 5 B=B while fast 0`.
  - A's stamps stay at true time (the far stamp does not move A's HLC: `Clock.observe` refuses it). The field is frozen on B against every other device for a year, until B itself edits it (guard test: then both converge).
  - Apply on A writes B's text as an edit made now; both show it; A's next edit is again invisible on B (test "pressing Apply on the peer does not converge them for good").
- The round calls this the known divergence and says "the parked edit is listed with Apply on every peer". Apply converges them only until the next edit from a peer. The clock line on B says "They still count, and what you edit now saves and shows", which is true of B's own edits and hides that nobody else's edits to those fields count on B.
- Fix (the triage's own decision 1: "this device's own stamps are parked only by arrival judgement, never by its clock", and round 59's data finding 8): when the writer learns the arrival of its pushed batch (the listing carries it), park its own changes stamped more than two days past it, as `takeBatch` does for peers. Writer and peers then agree, and the edit-time rebase (findings 1, 2, 4, 5) is no longer needed.

### 4. P1. Apply on a parked restore writes nothing and dismisses it. Confirmed (fuzz seed 1012 and a test).

- Where: `collection.svelte.ts:143-146`. `applyParked` handles a parked `_deleted: true` (a removal) and ordinary fields; a parked `_deleted: false` (a restore) is in `list` but produces no write. `dismissParked` then hides it.
- What happens: a plant removed on all devices is brought back on a device whose clock is three days fast. The peers park the restore by arrival. Their record notice reads "An edit from a device whose clock was wrong (dated …: restore) was not applied. Apply it now". Pressing it hides the notice and the plant stays removed on the peer, shown on the writer, for good.
- Repro: `clock--devices.test.ts` "Apply on a parked restore". In the fuzz, this is the only one of 26 diverged seeds that stays diverged after every peer presses Apply on everything listed.
- Smallest fix: `if (list.some((c) => c.field === '_deleted' && c.value === false) && this.state.get(recKey(kind, id))?._deleted) await this.restore(kind, id);` (after the field put, before dismissing).

### 5. P2. The rebase parks before the edit is stored, in its own transaction: a refused write still parks, and a plant made while fast can leave the list. Confirmed.

- Where: `collection.svelte.ts:1224` (`markParked` → `parkStamps`, its own transaction, which also drops the snapshot and tells the other tabs to refold) runs before `appendChanges` at `:1229`. If the vault refuses the edit (a full phone), the park is already stored.
- What happens: a plant made while a year fast (one `taxonName` stamp), clock confirmed, the grower renames it and the write fails with the quota error. The old name's stamp is stored as parked. At the next load the plant has no `taxonName`, is incomplete and is no longer listed; the sync page lists it as parked with Apply. Other open tabs refold at once and drop the name before the failure is even reported.
- Repro: `clock--devices.test.ts` "an edit the vault refuses parks nothing" (both the stored park and the vanished plant).
- Answer to the brief: no, `markParked` is not in the edit's transaction. It is triggered only by a grower's edit (rule 5 holds on its face), but it runs even when that edit is not stored.
- Smallest fix: park after `appendChanges` succeeds (or pass the stamps to `appendChanges` and park in its transaction).

### 6. P2. The rebase offers the grower's own replaced text back as "an edit from a device whose clock was wrong … not applied". Confirmed.

- Where: `commit` parks the rebased stamps with `markParked`, which lists them (`notePark`) like a broken peer's change. `Parked.svelte` then shows the grower's previous text, dated a year ahead, with "Apply it now", which would write it over the edit just made.
- Repro: `clock--rebase.test.ts` "the grower's own replaced text is not offered back": `parkedFor` returns the notes and notesBase changes.
- Smallest fix: add the rebased stamps to `parkedDone` in the same write (they were replaced by the grower's own edit, which is an ordinary overwrite).

### 7. P2. A stored correction outlives the clock change it corrected, and still counts as confirmed. The round's traced seed and both divergent seeds without the three-day skew are this, not a fast clock. Confirmed.

- Where: `hlc.ts:48` and `:129`, `trustedAge` (`:137`). Age is measured by the device clock, so a clock set forward is indistinguishable from time passing. A device three days slow gets a +3 day correction (two readings). The grower then sets the clock right. For up to a week, until the next sync reading, `nowMs()` is three days ahead and `clockChecked()` is true.
- What happens (`clock--offset.test.ts`): reopened offline after the fix, an edit is stamped 259,200,000 ms ahead; a watering logged then is dated `2026-10-08` on `2026-10-05` (`localDate` reads `nowMs`); pushed later, every peer parks it by arrival while the writer folds it. The same happens in a tab left open across the fix (nothing compares the wall clock with a monotonic one).
- Real clock changes:
  - Clock slow, corrected, then set right (a phone whose date reset, then fixed by hand): the case above. Online, the next pull (1.5 s after load, on focus, every 5 minutes) puts it right; offline (a greenhouse, a show) it lasts until a pull.
  - Dual-boot machine an hour off (RTC in local time read as UTC): +/-1 h is under the two-day park, so it only shifts stamps by an hour until the next pull; harmless.
  - DST on a device keeping local time as UTC, the grower moving the clock by hand: the same, an hour.
  - A manual set-back of 10 minutes right after a reading: the age goes to about -10 minutes, the clock counts as unchecked (correct), and the stored offset is dropped at the next load. A set-back of 4 minutes stays confirmed (guard test): harmless against a two-day park.
  - The opposite fix (a fast clock set back to true) is handled: the negative age drops the correction at load (guard test). Within an open tab, though, the old negative offset stays in force until a pull, dating edits in the past.
- The fuzz, attributed (`clock--fuzz-classify.skewed.log`): of 291 stamps behind the 26 skewed divergences, 261 are a writer at +72 h (72 of them with a "confirmed" clock: the last reading is still inside the week while the clock is three days fast; a first reading that disagrees by days only sets a pending correction and does not unconfirm, `hlc.ts:107`), 22 are +72 h plus a stale +30 h correction (+102 h), and 8 are a writer only 3 h fast with a stale +72 h correction (+75 h, "checked true"). Those 8 are seed 1008, the seed the round traced as "a plant made 30 hours fast". Without the +3 day skew the 2 divergent seeds are 1008 (+75 h: 3 h fast, +72 h stale correction) and 1090 (+60 h: 30 h fast, +30 h stale correction); neither has a fast clock past the park on its own (`clock--fuzz-classify.no3d.log`).
- Smallest fix: in a tab, note `performance.now()` with each reading and drop the correction and the confirmation when `Date.now()` and the monotonic clock have drifted apart by more than `TRUST_SERVER_PAST_MS` since. Across loads, store the server's time of the reading too, and do not apply a positive correction once the device clock itself has reached that server time (the clock has been moved, or days have passed; either way a new reading is due). A first reading that disagrees by more than two days should also clear the confirmation.

### 8. P2. Rule 5: a load (and the first clock confirmation) still stores the parked set, which is not droppable. Confirmed. Still open from 59 (data review 9; the triage did not take it up).

- Where: `foldFromVault`/`fromFold`/`rebuild` → `flushParked` → `saveParked` → `parkStamps` (`collection.svelte.ts:164-167`, `:328-332`). A peer's change without an arrival (from a backup merged before the device synced) is held while the clock is unchecked; after the first sync reading, the load parks it and stores the verdict.
- Repro: `clock--offset.test.ts` "a load stores no verdict": a peer change 2.5 days ahead from a file; one reading; a plain load; `meta.parked` holds the stamp. Dropped, the change would be held and fold half a day later; stored, it never folds. The same write follows the engine's clock listener (`engine.svelte.ts:191` → `rebuild`).
- Rule-5 inventory for this area (write → trigger): `appendChanges` via `commit` (grower actions, imports, pulls); `appendChanges(parked)` + `markParked` (a pull's batch, `engine.svelte.ts:787`; a merge, `io.ts:126`); `markParked` from the rebase (a grower's edit, finding 5); `parkStamps(…, false)` from `saveParked` (a load, a rebuild, the clock confirmation: this finding); `updateMeta('parkedDone')` (Apply, Leave); `updateMeta('photosUnverified')` (a commit with a photo removal, the engine); `writeFold` (a load, a rebuild: droppable); `touchFold` (every snapshot load: droppable); sync meta `held` (`scanClock` at init, `noteAhead`, `refold`: a reading of the fold, droppable); localStorage offset and pending (a sync reading; `readStored` removes stale ones at load: droppable). Only the parked-set write by a load is not a droppable reading.

### 9. P3. The held notice counts a held change the grower has already overridden and says it "appears when this device's date reaches it". Confirmed.

- Where: `heldWaiting` is `heldStamps.size` (`collection.svelte.ts:351`); an edit stamped past a held change (`FOLLOW_HELD_MS`) does not remove it from the count. `held-words.ts:8`.
- Repro: `clock--rebase.test.ts` "the held notice after an edit stamped past a held change": `heldWaiting` stays 1 after the edit that supersedes it.
- Otherwise the count is right after ingest, rebuild, catch-up, a snapshot load (`fromFold` sets it from the inventory, then folds what is due), and another tab's write or park (catch-up or the refold notice). The words also blame "a device whose clock runs ahead" when it is this device's unchecked clock that runs behind.
- Fix: count only held stamps whose field's current stamp (`seen`) is older; or say "may change these fields" rather than "appears".

### 10. P3. The guard and the tests: what is not covered.

- The fold-rules hash does not include the engine's clock listener (`engine.svelte.ts:191`) or the pull's rebuild on a reading (`:832-839`), which A31 named. Mutation M12 (listener does nothing), M13 (no rebuild on a reading) and both together pass the hash and all 81 tests of `sync-engine`, `sync-hardening`, `r60-review-server-engine`, `r60-guards-client` and `fold-rules`. With the snapshot keyed by `checked` this no longer leaves a stale snapshot (B4 guards that), but nothing tests that a tab re-judges its holds when its clock is corrected or first confirmed.
- Also outside the hash and shaping what `saveFold` writes: `commit` (it folds `stored.kept` and decides the rebuild) and `ingest` (`readChanges`, `observe`). Parkers outside it (`stampPast`/`commit`'s rebase, `io.ts restoreBackup`) are harmless to the snapshot because `parkStamps` drops it, which is also true of `takeBatch`; hashing `takeBatch` for that reason and not the others is inconsistent.
- Mutations of the round's own fixes, against its 8 clock files (62 tests): reverting the negative-age check (2 fail), the snapshot's `checked` key (1, B4), round-59 stamping (3), `readStored`'s age (1), `applyParked`'s base (1), `replacedNotes` skipping parked (2), parking on an unchecked clock (3): each is guarded. Removing the own-stamp exemption (M2) and removing the rebase (M4) pass all 62, but each is caught by `collection-store.test.ts` and `sync-engine.test.ts` (round fifty-two, 1 tests). Zero slack (M9) fails nothing related (one timing test in `notes-replaced` fails under load, flaky).

### 11. P3 (read). `readStored`'s pending reading still allows a negative age (`hlc.ts:52`).

Harmless as far as I can construct: a pending reading dated after the clock can never be confirmed (`localMs - seen.at < TRUST_AGREE_GAP_MS` waits), and any reading that disagrees replaces it, while one that agrees with no correction clears it. Use `trustedAge` there too for one rule.

## Checked and sound

- `Clock.observe` refuses stamps more than five minutes ahead on every path (ingest, `fromFold`'s `last`): a far-future stamp never moves another device's HLC (asserted in the five-round test).
- One stale stamp per field: an edit on a confirmed clock parks it, is stamped now, shows, survives a reload, and converges with peers (guard tests in `clock--rebase` and `clock--devices`).
- Stamp-past per path: `put`, `putWith`, `movePlants`, notes and their base all go through `commit` → `stampPast` per field; `addEvent`/`potUp`/`addAccession` make new records (no `prev`), so nothing to stamp past; `claimNow` calls `stampPast` but never reaches the rebase (only new records). Removal and restore compare with `'*'` (finding 2).
- The notes reading after a rebase: the edit's base is the parked stamp, and `replacedNotes` follows it through the parked text's own base, so a single rebase lists nothing as replaced unseen (r60-notes-review's mutation M8 confirms the skip is guarded).
- The negative-age check in `clockChecked` and `readStored`, and the snapshot's `checked` key, each fail their tests when reverted.
- The fuzz: all 26 diverged skewed seeds are explained by a change parked by arrival on the peers and folded by its writer (0 unexplained); 25 converge once every peer presses Apply on everything listed; seed 1012 does not (finding 4). It does not exercise an edit made after Apply (finding 3).
- `heldWaiting` after ingest, rebuild, catch-up, snapshot load, and another tab's write or park.

## Tests (in `/tmp/r60rev/out/tests/`, for `tests/unit/`)

- `clock--rebase.test.ts`: 4 FAIL (findings 1, 2, 6, 9), 1 GUARD.
- `clock--devices.test.ts`: 5 FAIL (findings 1, 3, 4, 5), 1 GUARD. Harness of `r60-fuzz`.
- `clock--offset.test.ts`: 3 FAIL (findings 7, 8), 2 GUARD (the slack, the opposite fix).
- `clock--fuzz-classify.test.ts`: PASSES; a measurement. Logs: `clock--fuzz-classify.skewed.log`, `clock--fuzz-classify.no3d.log`.
