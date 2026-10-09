# Self-review of round sixty-one: the harness

**Conclusion.** The round's tests hold up well. I mutated 65 of its behavioural changes, and 50 were caught. The 15 that survived are 3 equivalent mutants and 12 real gaps. I wrote and verified a killing test for each of the 12. Five more mutations went through a rebuilt e2e build, and all five were caught.

The suite also passes with the clock in 2027, across the New Year midnight, and at UTC+14 and UTC−11. I found nothing year-dependent in the specs. The weak points are structural:

- Three e2e helpers still have the snapshot race the round fixed in one place, and that fix is a pause, not a wait.
- The bundle guard can never run on a deploy.
- One smoke test times out on most loaded runs.
- `it.fails` stays green when the code under it crashes.

**What I ran:**

- **The full e2e suite, once,** on port 4295 against my copy's build, at load averages of 20 to 40 on 2 CPUs: 176 tests and 182 executions. 173 passed first time, 3 passed on the configured retry, and 3 failed both tries.
- **The six non-first-time tests again,** twice each, at load 8 to 16. Five passed both times. Smoke 3018 failed again.
- **The unit suite under `CLOCK_AT=2027-01-02T10:00:00`,** all 130 files, in three runs. My one real-clock full run was OOM-killed: the 8 GB is shared by nine reviewers. The 2027 runs and the mutation runs stand in for it.
- **Mutations** were run in separate copies (`/tmp/r61rev/harness-work/mut`, `mut2`). Every edit was reverted and checked by md5. My copy `/tmp/r61rev/harness` matches its starting md5 list.
- **The mutation list, the runner and the logs** are in `/tmp/r61rev/harness-work/` (`muts.mjs`, `mutate.mjs`, `mutations-pass1.log`, `mut-*.txt`).

**Tests delivered** (`/tmp/r61rev/out/tests/`): 15 files. 3 fail on f4ab4f8: inject-order, deploy-bundle and counter-reaches-flag. The other 12 pass, and each was shown to fail under its mutation. Together on clean code they give: 37 tests, 4 failing, all in the three reproduction files.

---

## Findings

### 1. Twelve of the round's fixes can be reverted with every unit test still green (P2, confirmed)

I left `fold-rules.test.ts` out of every mutation run. It hashes the fold's source, so it "kills" any edit to `log.ts`, `hlc.ts` or the collection's fold methods, whatever the edit does. Counting it would hide every survivor in those files.

Each mutation below was run against its area's test files with `--maxWorkers=2`. Three apparent kills turned out to be load timeouts or timing bounds (C15, I9, E2) and one an OOM (C3), so I reran those four at low load. C3 is a real kill; the other three survived.

| Id | File | The fix reverted | Why it matters | Killing test (verified) |
|---|---|---|---|---|
| C16 | `collection.svelte.ts` saveFold | the snapshot inventory `held` without the clock-judged parks | Rule 5's own promise. A peer change parked by a confirmed clock is never judged again on loads from the snapshot: two days later it should be held, then shown, and it stays invisible. | `harness--snapshot-clock-park.test.ts` (fails at `heldWaiting` 0, not 1) |
| I5 | `import/plan.ts` markAlreadyImported | the cultivar left out of "already imported" | On a restart, "0002 Haworthia truncata 'Lime Green'" is skipped as a duplicate of a plain H. truncata numbered 0002, and the plant is silently never added. | `harness--already-imported-cultivar.test.ts` |
| V7 | `server/sync.ts` deleteCounted | the second look after the fence | A removal deletes an upload that replaced the object under its live hold: a stalled delete and a stalled write, each past its own hold. | `harness--removal-reread.test.ts` |
| E2 | `sync/engine.svelte.ts` readRefusal | `Math.min(r.until, now + 1 h)` | A refusal stored an hour ahead by a clock since set back nine hours keeps uploads waiting ten hours. | `harness--r61l-engine-extra.test.ts` (the added refusal test) |
| I1 | `import/rows.ts` | the Qty upper bound of 200 | A cell reading "2009" adds 2,009 plants. | `harness--import-qty-cap.test.ts` |
| I9 | `collection.svelte.ts` yearOf | `^\d{4}(?:-\|$)` back to `^\d{4}-` | A year-only acquisition is numbered for this year by the store's own preview, though the import's plan numbers it for that year. | `harness--own-latest-flag.test.ts`, second case |
| C15 | `collection.svelte.ts` ownLatest | the `!isPastStamp(t)` filter | A device whose clock was always right warns "its clock was set ahead" after editing a field a peer's year-ahead change holds. | `harness--own-latest-flag.test.ts`, first case |
| S5 | `db/vault.ts` openStaging | the vault's own refusal in the sample | Only the higher guard in `backup/replace.ts` is tested; r61g-sample stands the vault in. | `harness--sample-staging.test.ts` |
| R1 | `collection.svelte.ts` removedAccession | the lookup by id | The e2e "your own removed plant's label offers Restore" covers it by reading; no unit test does. | `harness--removed-by-id.test.ts` |
| A2 | `ui/toast.svelte.ts` wayBack | the `entry` branch | Neither the unit tests nor e2e 1b check that the way back is where focus entered the toast. | `harness--toast-wayback.test.ts` |
| C8 | `sync/engine.svelte.ts` push | flagged stamps counted into `ownMax` | An extra GET of the device's own batch per flagged edit; behaviour is otherwise the same. | `harness--r61l-engine-extra.test.ts` (four lines in the year-fast test) |
| C5 | `core/hlc.ts` hlcAfter | the flag kept on counter overflow | Reachable only at 0xffffff. | `harness--hlcafter-overflow.test.ts` |

**Equivalent mutants, no test needed:**

- **I3,** `d > today` for `d > today.slice(0, d.length)` in `readDate`. With `d` a prefix-shaped date, both comparisons decide the same.
- **S4,** the `inDemo()` return in `run()`. `runNow()` has the same guard.
- **S7,** the per-collection staging name. With S5's guard in place, no sample tab reaches staging. It is defence in depth, as the round says.

**Killed (50).** The killing tests are listed in `mutations-pass1.log`. They cover:

- **The clock:** PAST_BIT in `observe`; the `isParked` and `isHeld` exemptions; `hlcPast` in stampPast; judgeOwn, ownToJudge and the kept `ownMax`; the overtaken lapse and its five-minute threshold; the monotonic drift; `lapse()` in `nowMs`; unconfirming on a disagreeing reading; `countHeld`, `stillParked` and Apply on a parked restore.
- **The engine:** the refusal kept in meta, the 409 asked hourly, the 409 not final.
- **The records:** restore by arrival.
- **The import:** year-only dates, dmy order, cf., the path split, the plan's `yearOf`, the formula guard and the unclosed quote.
- **The sample:** both scopes of `stored.ts`, sync setup in the sample, and replace in the sample.
- **The server:** the claim only with proof, the proof first, the recount 503, the generation on the second try, the reclaim, the fence, `markStale`, the address share, and the reclaim boundary.
- **Search:** the four-letter author rule, dotted authors, the relaxed query's two-letter minimum, and `pickedName`.
- **The words:** ties, the card label, the CHELSA key, the Glance label, refused versus "not on file", and the cold-run centre.
- **The toast:** its 30-second cap.

**E2e mutations** were built into `mut2` and served on 4295. Each was run against its spec with `--retries=0`:

| Mutation | Result |
|---|---|
| `{#key}` removed from `plants/[acc]/+layout.svelte` | Killed by r61l-records 39 and 54 |
| `{#key}` removed from `places/[id]/+layout.svelte` | Killed by r61l-records 69 |
| The toast's last-button Tab always swallowed | Killed by r61a 1b, not by a11y-perf 1 (see 6) |
| Select mode's Archive Undo made a no-op | Killed by r61a G8 |
| The picker offering relaxed hits again | Killed by r61q-search 8 |

`propagation/[id]/+layout.svelte`'s `{#key}` has no test at all (read).

**Smallest fix:** adopt the 12 tests.

### 2. Three e2e helpers still race the page's first snapshot, and the round's own fix is a pause (P2, confirmed by reading and by a structural test)

**The race.** A fold snapshot's tail is read from the arrival order: `fromFold` calls `arrivalsAfter(f.seq)` in `vault.ts:719`. Rows put only into `changes` are invisible to any load that starts from a snapshot. When the page's own first load saves its snapshot after the helper's `delete('fold')`, the injected rows vanish from the test.

**Helpers that still write `changes` without `order`:**

- `smoke.spec.ts:3417`, the `inject` used by the round sixty tests at 3439, 3470 and more;
- `smoke.spec.ts:3252`, the inline write in "round fifty-six: two plants under one number";
- `r61w-pages.spec.ts:28`, the `inject` behind the shared-number search test at 85.

**The round's fix.** `r61a-a11y.spec.ts:17` deletes the snapshot a second time after `setTimeout(500)`. That is a pause, not a wait: under load the page's save can still land after it.

**The right fix is already in the tree.** `r61l-records.spec.ts:18` adds an `order` row for each stamp in the same transaction. A snapshot saved before the injection then has a lower `seq`, so its tail includes the rows, and a load after it folds them.

**Reproduction:**

- `harness--inject-order.test.ts` fails on f4ab4f8 with `["r61a-a11y.spec.ts:26", "r61w-pages.spec.ts:37", "smoke.spec.ts:3256", "smoke.spec.ts:3429"]`. It passes for r61l-records.
- I did not catch any of these helpers losing rows in my run. The race needs the page's first save to land late.

**Smallest fix:**

- Copy r61l-records' two lines (the `'order'` store in the transaction, and `for (const t of stamps) tx.objectStore('order').add({ t })`) into the other three helpers.
- Drop r61a's second delete and its 500 ms.
- Better, one shared `tests/e2e/helpers/inject.ts` in place of four copies.

### 3. The bundle guard never guards a deploy (P2, confirmed)

**Where it stands.** `r61g-layout-bundle.test.ts:24` skips its manifest test when the build is older than any file under `src/`, and `npm run deploy` is `check && test && build && wrangler deploy && live-check`. On any checkout whose sources changed since its last build, the guard skips during the deploy that matters. A fresh clone has no build, so it skips there too. The source-level test (no `$lib/ui/grow` barrel import) still runs, but it does not see a backup import that arrives another way.

**Two smaller holes in the freshness check:**

- It looks only at `src/`. `svelte.config.js`, `vite.config.ts` and `node_modules` can change the bundle unnoticed.
- It compares mtimes. Sources restored with their old mtimes (`tar -x`, `rsync -a`, `cp -p`) make an old build look fresh.

**Reproduction:** `harness--deploy-bundle.test.ts` fails on f4ab4f8. It accepts either fix below. In my own copy the guard was skipped in every run after my first source restore (`r61g-layout-bundle.test.ts (2 tests | 1 skipped)` in the 2027 run).

**Proposed place, smallest fix:**

- Move the manifest check into `scripts/check-bundle.mjs`, plain Node and the same closure walk, and chain it at the end of `"build"`: `... && vite build && node scripts/attach-do.mjs && node scripts/check-bundle.mjs`.
- Every build then checks itself: the deploy's, the e2e webServer's and a developer's. It fails rather than skips, and it runs the same on Windows, where `BUNDLE_REQUIRED=1 vitest …` in an npm script would not.
- Keep the unit test's source assertion.

### 4. One smoke test times out on most loaded runs; three more needed the retry (P2, confirmed)

**Needed the retry** (from my run's JSON report, `PLAYWRIGHT_JSON_OUTPUT_NAME`):

| Test | First try | What it is |
|---|---|---|
| smoke 2130 | timed out (30 s) | Load |
| smoke 2781 | failed: `expected < 167.8, received 207.3` | A real flake, below |
| smoke 2877 | timed out (30 s) | Load |

**Smoke 2781's flake** ("a letter tapped on a phone lands…"):

- It clicks `.letters a` right after `goto('/')` with no `html[data-ready]` wait.
- Its poll waits only for the lower bound: the heading below the pinned row.
- So a native anchor jump before hydration, or a scroll still settling, satisfies the poll. The 16 px upper bound then fails.

**Failed both tries:**

| Test | Both tries | On the rerun at load 16 |
|---|---|---|
| smoke 2989 | timed out, the second in page setup | Passed 2 of 2 |
| smoke 3554 | "Target crashed" (OOM), then a timeout | Passed 2 of 2 |
| smoke 3018 | timed out | Failed 1 of 2 |

**Smoke 3018** ("a device a year ahead is corrected by the server's clock…; a change from a clock five years ahead is parked… with Apply"):

- It failed 3 of the 4 times I ran it, each a timeout at the final Apply click.
- When it passed it took 23.3 s against the 30 s default.
- It drives three browser contexts and five sync runs, and has no `test.setTimeout`. H gave r60 4 and r60 5 one; this test was missed.

**Smallest fix:**

- In 3018, `test.setTimeout(90_000)`.
- In 2781, `await ready(page)` before the click, and poll both bounds.

**On `retries: 1`.** It hides a real intermittent fault like 2781's. Set `failOnFlakyTests: !!process.env.CI_STRICT` (Playwright 1.63 has it), or print the flaky list at the end, and run strictly before a deploy.

### 5. `it.fails` stays green on any failure, a crash included (P3, confirmed)

**The two expected fails:**

- `r61q-refusal-walk.test.ts:111`, finding 13, open by choice.
- `r61s-photo-removal.test.ts:156`, the residual race left for round sixty-two.

Both are justified as decisions. Both are vacuous as guards: `it.fails` passes when its body throws for any reason.

**Reproduction.** In a copy, I made `src/routes/api/sheets/+server.ts` throw `TypeError("a crash")` for every bucket but `"00"`. The original refusal-walk file still reported `8 passed | 1 expected fail`, green. The precise version failed with the TypeError.

**Fix:** state the known wrong answer exactly.

- `harness--refusal-walk-known.test.ts`: status 200, and the body does not contain the species.
- `harness--photo-removal-known.test.ts`: `kept` false and the removal reported done.

Each passes now and fails both on a crash and on the fix, which is when it gets inverted.

The `it.skipIf(!process.env.INDEX)` audit in `r61q-common-name-rule.test.ts:143` is justified: it needs a built index that a checkout does not have.

### 6. Two tests claim more than they test (P3, confirmed)

**`r61a-a11y.spec.ts:72`** ("a11y-perf 1: …never a keyboard trap, even when it was raised with focus on the page"):

- It raises the toast with a pointer click, which in Chromium focuses `#sel-water`. The toast then has an origin and a "Back to where you were", so the no-origin path it names is never taken.
- With the last-button Tab made to always `preventDefault()` (a trap whenever there is no way back), this test passed. r61a 1b is the one that caught it.
- **Fix:** rename it to "…raised by a pointer", or drop it as covered by 1b.

**`r61a-select-undo.test.ts:99`** ("archive Undo as select mode does it"):

- It re-types `SelectMode.svelte`'s `unarchive` inside the test: filter the still-archived plants, then `putWith`, then `removeEvents`. It never calls the component.
- With `unarchive` made a no-op, the unit suite passes. Only e2e G8 fails.
- **Fix:** move `unarchive` and the "lines this commit wrote" lookup into a module function (`grow/select-actions.ts`) that both the component and the test call.

### 7. A device's own counter can reach the "made past another" bit (P3, confirmed)

This answers the prompt's question, "can a natural counter ever reach 0x800000?": yes, by following a peer.

**How it happens:**

- `Clock.observe` normalises only counters at or above `PAST_BIT`. A peer stamp with counter 0x7fffff, within `MAX_AHEAD_MS`, is followed, and the next `bump` gives 0x800000.
- Every tick of this device until its wall passes that millisecond is then flagged, so never held or parked.
- `hlcAfter` does the same from 0x7fffff.

**Impact:** small. It needs a crafted or buggy peer stamp, the window is at most `MAX_AHEAD_MS`, and stamps that near now are rarely held anyway.

**Reproduction:** `harness--counter-reaches-flag.test.ts` fails on f4ab4f8 (2 of 2).

**Smallest fix:**

- In `observe`, treat a remote counter at or above `PAST_BIT - 1` (or above any sane burst, such as 0xffff) as a stamp to follow from the next millisecond.
- In `bump` and `hlcAfter`, never step an unflagged counter onto the bit.

### 8. Wall-clock bounds make the unit suite flaky on a busy machine (P3, confirmed)

Under load these failed with the code unchanged, and passed alone at load 3:

| Test | Failure |
|---|---|
| `notes-replaced.test.ts`, "three thousand edits read in one pass, well under a frame budget per hundred" | 185 ms against a bound of 150 |
| `fold-snapshot.test.ts:166`, `trustServerTime(Date.now() + 3_600_000) - 3_600_000 < 50` | 59 ms: the gap between the test's `Date.now()` and the function's |
| `sync-engine.test.ts`, "a batch set aside by one build is read again by the next" | 20 s timeout |
| `postings.test.ts:81` | 20 s timeout, also at 2027 |

`r60-fuzz.test.ts` took 654 s in one run.

`npm run deploy` runs these on the author's PC, so it is a nuisance, not a hazard. It does turn mutation testing into noise, though: four of my first-pass "kills" were these.

**Fix:**

- In fold-snapshot, pass a fixed `localMs` to `trustServerTime` instead of reading the clock twice.
- In notes-replaced, measure against a baseline run in the same test, or raise the bound on an environment flag.
- For the heavy fuzz and postings files, use per-test timeouts.

### 9. Smaller harness points (P3, read)

- **The other-port recipe.** H's documented `PW_PORT=… PW_REUSE=1 npx playwright test` reuses a server without `fresh-state.mjs`. The config's own comment says a third run of a day from one address meets the per-address vault ceiling. **Fix:** say "run `node scripts/dev/fresh-state.mjs` before starting the server" beside the recipe.
- **r61a 1b waits out the real 30-second toast cap** (`toBeHidden({ timeout: 45_000 })`, with `test.setTimeout(90_000)`). `page.clock.install()` and `runFor(31_000)` would test the same in a second.
- **The `year()` helpers read Node's calendar,** while the app numbers by the browser's. In this harness both are the same machine, and only a test straddling midnight on 31 December could disagree. I note it; I would not change it.

---

## Checked and sound

**The year:**

- **2027-01-02:** all 130 unit files pass. The only failure was postings' 20 s timeout under load, and it passes alone at 2027.
- **The clock shift reaches vitest's workers.** I checked with a probe test, which read `2027 2027-01-02T10:00:00Z UTC` inside the worker.
- **Across midnight on 31 December** (`CLOCK_AT=2026-12-31T23:59:45`): the import, commit, calendar, spend, grow and collection-store files pass, 124 of 124.
- **At TZ=Pacific/Kiritimati and TZ=Pacific/Pago_Pago:** the import, csv, calendar, dates, spend and export files pass, 118 of 118 each.
- **E2e date literals.** H's list is accurate for smoke and r60-grow. The round-61 specs H did not list are year-safe:
  - r61a, r61l and r61w write explicit `2026-NNNN` numbers into injected rows, and the app keeps a given number.
  - r61g's "Last watered 2026-10-01" and its sheet dates (2024 and 2017) are past.
  - r61h-year freezes 2027 on purpose.

**The port.** No spec names 4173. `PW_PORT` drives both `baseURL` and `webServer`, and my run on 4295 used no copied config.

**The adopted guards and the round's new tests** caught 50 of 65 mutations across all nine areas. The clock and server areas are particularly solid: every one of the five clock rules in the prompt's section 1 is guarded, except the snapshot inventory (finding 1, C16).

**The e2e side** caught every UI-only mutation I made: the plant and place layout keys, the toast trap (via 1b), Archive Undo, and the picker's relaxed hits.

**r61l-records' `inject`** is right: it writes the arrival order. **H's r60 13 and r60 14 rewrites** wait on causes, not times.

---

## Suggestions (ranked)

1. **Adopt the 12 guards and the two `KNOWN` replacements for `it.fails`.** They are cheap, and each pins a fix the round made.
2. **Move the bundle check into `npm run build`** (finding 3), so the deploy cannot ship an unchecked layout.
3. **Use one shared e2e `inject` helper** that writes the arrival order (finding 2), and delete the 500 ms workaround.
4. **Set a timeout on smoke 3018 and fix 2781's wait,** then turn on `failOnFlakyTests` for the pre-deploy e2e run. Today `npm run deploy` runs no e2e at all; a strict `npm run e2e` before it would catch what retries hide.
5. **Exclude the fold-rules hash from mutation runs** in any future review, as here, and say so. Otherwise it reports every edit to the fold as killed.
6. **Replace wall-clock bounds in unit tests with fixed inputs** (finding 8), so `npm test` is quiet on a busy machine.
