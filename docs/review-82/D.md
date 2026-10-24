# Round 82, agent D: the device and the grower's record

Copy `/tmp/claude-0/rev82/D/`, branch `r82` from `r82base`, commits by D. Every change is in the app (no dossier, corpus file, plan file or step script touched): **safe mid-fill, reaches the site with the next `npm run deploy`, any day.** No new database version, `FOLD_RULES` unchanged (hash re-recorded under 8).

## Done

**Review 1's 1: a Replace resumed by two tabs lost photographs.** `src/lib/db/vault.ts`, `src/lib/backup/io.ts`.
- `underReplaceLock()`: a Web Lock `cultifolio-replace`. `restoreBackup('replace')` holds it from `openStaging` to the end of `promote`; `promote` takes it itself if not held; the resume in `openVault()` takes it and **re-reads the flag inside it** (the holder has usually finished: nothing to do). A tab that must wait says so (`.vaultnote`: "A replacement from a backup is being copied in another tab of this browser. This page opens when it is done.") and opens on the finished copy. Re-entrant within a tab. Two Replaces in two tabs also queue now (each used to delete the other's staging database).
- The copy itself is now safe twice at once: the wipe of the log, the snapshot's drop and the copy of the file's log are **one transaction** (`storeIn` with `markLast: ORDER_FROM` and the parked set as meta); photographs: the live ones the file does not hold are deleted first, then the file's put one by one, so no run deletes a photograph another copied; a run that finds the staging database gone (its open made it) touches nothing and clears the flag (base: it wiped the collection for an empty file).
- `replaced` is posted as the wipe lands (from `promote`); a resume says it only once finished (posting at a failing resume made two tabs reload each other for good).
- **Without Web Locks** (none of the supported engines: Chromium 69, Firefox 96, Safari 15.4 have them; the spec asserts `navigator.locks` is there): the work runs unlocked and the copy's own safety holds: two tabs copy the same photographs twice, none is lost (unit test, node has no `navigator.locks`). Two simultaneous Replaces are then not queued.
- Tests: `tests/unit/r82d-replace-tabs.test.ts` (two module instances over one fake IndexedDB; B opened from inside A's copy at its second photograph, B's writes after its first refused as a closed tab's): with a stand-in LockManager, without one, and the staging-gone case; all three fail on r82base (10 of 12 photographs; the collection emptied). `tests/e2e/r82d-replace-tabs.spec.ts`: six photographs, a backup, a Replace with the staged reads slowed by an init script (500 ms, 1,500 in WebKit); test 1 opens a second tab once two photographs are in and closes it the moment the device holds fewer (or after a while): ends with the backup's six distinct files and every record (r82base, Chromium: 3 of 6); test 2 checks the waiting tab says so and then shows the six (r82base: never said). Both `serviceWorkers: 'block'`, polling the database itself.

**Review 1's 15: reminders.** `src/lib/ui/backup-reminder.svelte.ts` (new), `GrowLayer.svelte`, `plants/+page.svelte`, `backup/+page.svelte`, `backup/io.ts`. One at a time: the layer's "N plants and no backup yet" line only on My plants (Today has its own line), the plants list's "Kept in this browser only" line gives way to it and to the storage notice, the browser's refusal toast asks for a backup only off My plants, Today and Backup and only with no backup and no sync. None over an empty collection (the list's line and the backup page's card). A Replace, or a Merge into a device that held nothing, sets `lastBackup` and `lastBackupFrom: 'restore'`; /backup reads "last today, restored from a file". e2e `r82d-record` test 1 (fails on base at the empty list).

**Review 1's 16: a batch just sown.** `propagation/[id]/+page.svelte`: the batch's start is the log's first line (`#log-start`, "Started 6 cuttings" / "Sown 24 seeds", "the batch's own record", no remove), counted ("1 entry"); a line dated before the start stays below it. Rows through one snippet. e2e test 2.

**Review 2's 4: cuttings announced as seedlings.** `grow/firsts.ts` `firstUpWords(method)`, `Firsts.svelte`: "First cuttings struck", "First leaf cuttings struck", … ; seed keeps "First seedlings up"; an unknown method "First count". e2e test 2, unit `r82d-frost-bar`.

**Review 1's 18: the frost bar.** `src/lib/ui/frost.svelte.ts`, `+layout.svelte`. The line keeps the forecast's nights; its bracket gains the date in words ("(Sunday 1 November, 2026-11-01 in the table, MET Norway)"); red only at or below 0 °C, amber above; `near` when the night is within `NEAR_H` = 72 h of the forecast's own time. `frost.bar(floors)`: the line when near, else the first night below the floor of a space of the grower's that the site's forecast covers (floor not held by a heater, not indoors, no coordinates of its own), said with the space. The bar has an amber style. Alerts and answers without nights behave as before. Unit `tests/unit/r82d-frost-bar.test.ts`; e2e test 5 (base: a red bar for a night nine days out).

**Review 1's 14: the Undo toast over a form's buttons.** `ToastBar.svelte`: while a toast is up its box is checked against every visible form button (on raise, DOM change, scroll, resize) and lifted (`translate`) just above the highest it would cover, never above 56 px. e2e test 3 at 489 by 627 and on the phone (base fails both).

**Review 1's 25: the pinned bar over a field.** Measured: at 489 by 627 the bar covers 2 px of Acquired and both "More" summaries at rest; at the page's end nothing (main's 88 px padding); at 812 by 375 the bar is not pinned (the 30em rule). Keyboard focus was already scrolled clear (`keepFocusClear`) and a tap is deliberately never scrolled after (round 60, A39), so the fix is the case nothing covered: `src/lib/ui/clear-of-bar.ts` brings the field being filled above the bar (and the tab bar) when the window or the visual viewport shrinks under it, as a phone's keyboard does; used by `plants/new` and `propagation/new`. `theme.css` (2 lines after the `:focus` rules): the focus scroll margin of a `body.stickyacts` page includes the bar's measured height. e2e test 4 (base fails in both projects).

**Review 1's 37: sync's refused change and two counts.** `engine.svelte.ts`: a refused batch's stamps go in `meta.refusedAt` and wait `REFUSED_AGAIN_MS` (a day) before they are sent again; taken later, they leave it and the `refused` notes. `outboxSplit()` is the one count: `countPending` (at init) and the push both use it; `refusedWaiting` counts the refused apart; the Sync page's "Waiting to send" says them. Unit `tests/unit/r82d-sync-refused.test.ts` (harness copied from sync-engine.test.ts): fails on base (posted again; pending 1; init counted an unsendable change).

**Review 1's 38.** `collection.sweepPixels()`: five seconds after each load (browser only) and after a Merge, sync or not, deletes the pixels of a photograph whose record is removed (checked in the log too) and pixels with no change at all under their id made two days ago or more by the id's time; nothing while a replacement is pending. `markParked` + `parkStamps(…, moved)`: a fold that already reads the park and was built against the counter before it takes the new counter, so the snapshot after a Merge that parks is written. Unit `tests/unit/r82d-pixels-snapshot.test.ts` (fails on base).

**About pages.** /about/how: the frost line sentence (72 hours, a space's floor, red only at freezing, dated); the lock `cultifolio-replace` in the list of names the browser holds. /about/formats: refused log batches sent again after a day; one tab copies a Replace, the switch's one write, the photographs it deletes, a restore counted as a backup; pixels nothing names swept. DEPLOY.md: `### Round eighty-two: the device and the grower's record (agent D)`.

## Repairs for the live site

None: the app applies it.

## Needs

- **U** (shared files, my lines): `src/routes/+layout.svelte` (the `frostFloors`/`frostBar` derivations after `vaultNote`, the `#frostbar` line, two `.frostbar.warn` rules); `src/lib/ui/theme.css` (the `body.stickyacts :focus` rule after the two `:focus` rules); `/about/how` (the frost sentence in the privacy list, the `cultifolio-replace` lock); `/about/formats` (three sentences: after "vault full", after "reload onto it", after the snapshot paragraph's first sentence).
- **Merge:** `tests/unit/fold-rules.test.ts` is re-recorded for my vault and engine changes (`d5db7e02…`); anyone else touching those files re-records after the merge.

## For the owner's PC

`PW_BROWSERS=webkit,firefox npx playwright test tests/e2e/r82d-replace-tabs.spec.ts tests/e2e/r82d-record.spec.ts --project webkit --project firefox --project phone-webkit --reporter=line`. Both specs block the service worker, poll the database for the line they read and count distinct photograph files; WebKit's slower switch is given 1,500 ms a staged photograph. If test 2 of `r82d-replace-tabs` ever finds no waiting notice in WebKit (the second tab opened after the switch), send its trace.

## Measured

- Chromium here, chromium and phone projects: `r82d-*` with smoke-1, -2, -3, r60-grow, r62a, r62ba, r63h, r67h-places, r67v, r69p/r70p-alerts, r70p-save-moves, r70w-sync, r73p-toast, r81u-a11y, r81u-phone: 245 passed; after the last changes `r82d-*`, r60-grow, r62ba, r62h, r67h/r67r-places, r69x, smoke-2: 93 passed; `r82d-*` at `--repeat-each=2`: all passed.
- Unit, the whole suite: 4,574 passed, 32 failed, all in `tests/unit/r70b2-follow-42.test.ts`, which fails the same 32 on r82base ("no fixture: https://api.gbif.org/v1/species?datasetKey=…&name=Othonna linearifolia": the fixtures predate the FUZZY hotfix's requests; not mine, for F or the coordinator). `tsc --noEmit` and `svelte-check --threshold error`: clean.
- Base failures (r82base, Chromium): replace-tabs e2e test 1 ended with 3 of 6 photographs, test 2 never said it waited; the unit two-tab copy 10 of 12 and an emptied collection; reminders failed at the empty list; the log line, the firsts, the toast (489 by 627 and the phone), the pinned bar (both projects) and the frost bar each failed at the line their comments name; the sync unit test posted the refused change again and counted 1 waiting.
- The add form at 489 by 627: the pinned bar (507 to 571) covers 2 px of Acquired (463 to 509) and both summaries below it at rest; at the page's end nothing; at 812 by 375 the bar is not pinned.

## Not done, with why

- Tabs still running round 81's code during the deploy have no lock: one that loads during another tab's switch runs the old copy. Transient, until they reload.
- A field wholly under the pinned bar at rest cannot be tapped (the bar is on top); reached by scrolling or the keyboard, as before. A pointer focus is not scrolled after, by round 60's decision (A39).
- No WebKit or Firefox here: those runs are the owner's (above).
