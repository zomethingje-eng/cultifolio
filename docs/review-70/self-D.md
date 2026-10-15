# Round seventy self-review, reviewer D: the grower's data

Working copy `(scratch)` at `76dcd55`, port 4404. Base for regressions: `7aa531c` (round sixty-nine). A trial fix with its tests is `D-fix.diff`. Probes left in the copy: `tests/unit/zzd-*.test.ts`, `tests/e2e/zzd-import-bare.spec.ts`. Mutation runner and results: `(scratch)` (`results.tsv`, 69 mutants).

Nothing in my area reaches a species page, so there are no findings of the first rank. The first two findings are data faults a grower meets on a second import.

## Findings

**1. A new plant whose line leaves the extra column empty is never imported: the import says it is already there (confirmed, Chromium; a regression of round seventy).**
`src/lib/import/plan.ts:455` (`markSheet`) finds a plant by its `importKeyBare` for any line of the sheet. That includes a line with no extra cells whose own key is that bare key, even while the plant's own line, column and all, is still in the sheet and found by its full key. So one plant answers for two lines.
Reproduction (`zzd-import-bare.spec.ts`, "zzd 1"):
- Import `species,acquired,source,locality` / `Aloe vera,2024-05-01,Kakteen Haage,Totoral`. One plant is added.
- The grower buys a second Aloe vera the same day from the same nursery, with no locality, and adds its line: `Aloe vera,2024-05-01,Kakteen Haage,` (empty locality).
- The review says "2 lines were imported before (every plant they make is here), so they are left out. Nothing is left to add". The button reads "Add 0 plants", and the collection holds one plant.
- With the plain line first, the result is the same. On `7aa531c` the second line is offered (the unit cases pass there).

What it should do: a plant still found by its own key in this sheet is never offered to another line by its bare key. Smallest fix: in `markSheet`, build the bare map only from plants whose `importKey` is none of the sheet's own line keys (in the diff).

**2. Deleting the extra column re-offers a plant without a word, when one of the lines had the column empty (confirmed, Chromium; R47-16 not fixed for this case).**
`plan.ts:161` numbers the bare keys among all the lines. A line with no extra cells has no bare key, but it is counted. So line A (Totoral) gets bare `H#1`, and the plain line B, whose full key is the bare hash, is filed under importKey `H#1` as well. One string names two plants.
Reproduction ("zzd 2"):
- Import the two lines above. Two plants are added.
- Delete the Locality column and import again.
- The review offers "Add 1 plant" (2024-0003). `H#1` finds B, `H#2` finds nothing, and A's bare key is shadowed.
- `markChanged` (`plan.ts:479`) treats A as found, because its bare key is in the sheet's keys, so the line is not even marked "changed". It is a silent duplicate. The same happens with a Qty of 2 on the Locality line (unit case "qty 2").

Smallest fix: number bare keys after the plain lines that share the hash (in the diff). With both parts of the fix, all six unit cases and the two browser cases pass, along with the 277 existing import unit tests and the import browser specs (16 of 16).

**3. A change restored from a backup that this version cannot read never reaches the server, even after the device updates to a version that reads it (confirmed, unit and code).**
`collection.svelte.ts:2003` appends the kept rows with `fromServer = true`, so no outbox entry is made. `vault.ts:681` (`outboxFill`, the push of everything when sync is set up) also leaves out every row this build cannot read. Nothing re-queues a row once a later build reads it.
So on Merge such a change folds on this device after an update, but no other device ever receives it. The comment on `toPush` (`engine.svelte.ts:428`) says such rows stay "in the log and the outbox, for a build that reads it". That holds only for rows written on this device. Replace is inconsistent with Merge: its switch copies the kept rows into the outbox.
Reproduction: `zzd-backup-outbox.test.ts`. After a Merge of a file whose `unreadable.json` holds a "harvest" row, the file's plant is in the outbox and the harvest row is not. After `outboxClear` and `outboxFill`, it is still not there.
Fix: append the kept rows with outbox entries, as Replace does (`toPush` already holds them back). Count `pending` from what `toPush` would send, so a held-back row is not shown as waiting for ever. Low likelihood: it needs a backup from a newer build restored on an older one (a rollback, or a stale shell on another device).

**4. A sheet of year-first short dates is now asked "day first or month first", and either answer reads every date in the wrong year (confirmed, unit).**
`csv.ts:290` now reads a cell that could be year first by the sheet's answer, with the year last. `ambiguousDates` counts it when it reads two ways. The question's choices (`+page.svelte:106`) give day and month without the year: "Day first (10 April)" or "Month first (4 October)".
Examples (`zzd-date.test.ts`):
- In a YY-MM-DD sheet (`10-04-15`, `11-06-20`, which are 15 April 2010 and 20 June 2011), round sixty-nine asked nothing and kept the text in the notes.
- Now the question is asked, and "Day first" files 2015-04-10 while "Month first" files 2015-10-04.
- `24-03-09` is read as 2009-03-24 under either answer.

Fix: put the year in the choices ("10 April 2015"). Offer the year-first reading when a cell could be written year first, or leave such cells as text unless the sheet also has a cell of the same shape that cannot be year first.

**5. A column added to tell apart two imported plants offers both again (confirmed, unit; the other half of R47-16).**
Import two like lines (`Aloe vera,2024-05-01` twice), then add a Locality column, one line Totoral and one Paposo. Each line's no-column key is shared with the other line, and neither line is found by its own key, so `KeyAlt.others` (`plan.ts:174`) lets neither take a plant. Both are marked "changed" and are added unless dropped, so two plants become four.
When as many plants are filed under the hash as there are sharing lines, all could be taken. Which locality goes with which plant cannot be known, but the count is right. This case is kept in the diff as `it.fails`.

**6. A tab opened while another tab holds the correction in force waits anyway, and offline its edits lose to unseen ones (confirmed in R's own harness; a limitation, not a regression).**
`hlc.ts:151` makes a load wait once the device clock has moved the correction's length since the confirming reading. `r70r-clock-tabs.test.ts` shows it: tab B is open four days, three days slow and in force, and a tab opened then reads 0. That tab stamps three days back until a reading.
Offline, R47-14's scenario 1 then recurs in that tab. The tab that has followed the clock all along cannot vouch for it, because it writes the record only on a move or a reading.
Fix, if wanted: have an in-force tab refresh a "followed up to" time in the record, say each minute while visible. A load then waits only when `Date.now() − max(confirmedAt, followedAt) ≥ offset`.

**7. The round's rules that no test holds (mutation testing; 69 mutants of the round's new code, 42 killed).**
Survivors that matter:
- **H2, H5 (`hlc.ts:151`, `store`).** Ending a load-wait on any record, or never writing `loaded`, passes every test. Yet a tab loaded after the clock was set right would put three days in force on the say-so of another freshly loaded tab, and stamp three days ahead, which parks. `zzd-clock-loaded.test.ts` (in the diff) kills both.
- **C3, C4 (`collection.svelte.ts:569`, R1's margin).** Reading the snapshot a day past the clock passes the default 24 seeds. 160 seeds catch it, at seeds 113 to 116. Five minutes past is never caught. `zzd-snapshot-edge.test.ts` (in the diff: peer stamps 7 minutes and 14 hours past a waiting load's clock) kills both.
- **I15 (`commit.ts`).** Never storing `importKeyBare` passes every test: the only test of R7's stored key builds the plants by hand.
- **H8 (`follow`).** A move-wait threshold left at two days passes every test.
- **D2, D3, D5, D6 (`demo.ts`, the takeover of the early hold).** These also pass `r70x-example` and `r69x-example` in Chromium (15 of 15). D6 matters: if `letGoEarly` stopped marking `done`, a closed tab whose hold was granted late would hold the lock for good.
- **D10.** Saying "not set out" on any refusal passes every test. With Web Locks it cannot happen, so this is near-equivalent.
- **C13.** The outbox choice for kept rows is untested (finding 3).
- **Lesser survivors:** C9, I7, I8, I13, I18.
- **Equivalent or conservative:** H3b and H7b (boundaries), H10, H11, C1, C4b, C11, B1, B2, D7.

## Root causes of the open issues in my area

`inputs/corpus-step-70.md` lists none in the device's data. The one open item naming a vault is the server's: "the vault's writes an hour on the fixed clock hour". `counters.ts:101` counts `w`/`wp` in `Math.floor(now / HOUR_MS)`, so the count restarts at each clock hour, and up to 7,200 writes can land in sixty minutes across a turn. It is also counted at reservation, so failed puts count.
Fix: count writes in the per-minute window W4 gave listings (`listState`: the minutes of the last 61). Set `retryAfter` from the oldest minute still counted, and give a write back when its put fails, as the byte lease is.

## Checked and sound

- **R1, the snapshot (rule 6).**
  - R's property test passes at 160 seeds (480 loads).
  - My edge tests pass at 7 minutes and at 14 hours.
  - By reading: the inventory is judged again at each load, the park needs a checked clock (part of the key), and `born` and the parent history note held and parked changes alike. So a load from the snapshot and the whole log's fold agree whenever `reach` is within the clock.
  - Stale `\0held\0` keys a snapshot carries only place an edit past a stamp already applied, which changes nothing.
- **R2, S-D2.**
  - A removal is placed past held edits to any field, and an edit or restore past a held removal (mutants C6 to C8 are killed).
  - Two tabs, one waiting and one in force: a removal or an edit in the waiting tab wins as real time orders it. A peer's held removal followed by an edit here revives the plant, as the log's rule says it should.
- **R5, the reload.** I worked through R47-14's scenarios 1, 3, 4 and 5 against the rule.
  - A fast clock set right while closed within its correction is caught by `notAfterClock`.
  - Over the correction's length it cannot be told apart, as R says.
  - A correction under a day set right while closed still stamps ahead by up to a day, and a peer edit made before it arrives can still lose. That is the trade the round chose.
- **Backups.** Merge twice appends nothing twice (dedup by stamp; mutant C10 killed). A row the log holds under the same stamp is not displaced. Replace stages kept rows. R4 refuses at the preview and again at the Replace (B5, B6, B10 killed). On a build that reads a row, `unreadable.json` gives it back as a change, which goes to the outbox. Nothing found lost or duplicated in the round trip apart from finding 3.
- **Import.** The reviewer's twelve re-save cases pass, plus German `01.05.24` and Dutch `01-05-24` (both asked, then read). The answered keys find round-sixty-nine plants (`~` key with `acquired`) in either line order. A two-digit year still to come keeps its text key. Currency prices are matched.
- **The example.**
  - `r70x-example.spec.ts` passes 9 of 9 and `r69x` 6 of 6 in Chromium.
  - The CSP hash test passes.
  - `requireEmpty` is read in the seed's own transaction (V1, D8, D9 killed).
  - Keep's draft: refused storage and a called-off Leave (D11, D12 killed). Place carrying (D13 to D15 killed).
  - `PAGE_IN_DEMO` and the first script read the same tab flag, so the early hold is never left untaken by a page outside the example.

## Not done

- WebKit and Firefox, including whether either keeps a page holding the lock in its back-forward cache.
- A two-tab property test at the collection level. Only hand-written two-tab scenarios were run.
- A browser run of two example tabs with Leave in one while the other reloads slowly (finishLeaving's ten seconds against the takeover).
- Whether `pending` on the Sync page would show held-back rows under the fix to finding 3.
- A cross-sheet case where two different sheets give two plants one `importKeyBare`: `markSheet`'s map keeps one of them (suspected, not run).
