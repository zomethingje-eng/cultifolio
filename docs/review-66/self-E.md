# Reviewer E: Safari's engine, Firefox and the harness (round 66 outside review)

Scope: brief sections 7 and 9. Working copy `/tmp/rev66/E`. Every probe ran in Chromium (`/opt/pw-browsers/chromium`) against the shared server on 127.0.0.1:4173. The service-worker probes ran through a small proxy on :4290 that can serve the same worker script under another version string. WebKit and Firefox were not installed, so their behaviour is emulated with init scripts.

**Environment note for the other reviewers.** `/tmp/rev66/*/node_modules/node_modules` is a symlink to `/tmp/r62rev/search/node_modules`. Through it, Node's ESM resolver loads `/home/claude/cultifolio`'s `playwright/test.js` for `@playwright/test`, and every spec then fails with "did not expect test() to be called here". I removed that symlink in E only. It was never part of the app.

Probe specs I added (none of the app's code was changed):
- `tests/e2e/zz-e-count.spec.ts`: counts IndexedDB requests and transactions.
- `tests/e2e/zz-e-places.spec.ts`: double presses, and a place write that fails.
- `tests/e2e/zz-e-persist.spec.ts`: the "keep data" question.
- `tests/e2e/zz-e-sw.spec.ts`: the reload guard (needs `PW_PORT=4290` and the proxy at `scratchpad/rev66E/proxy.mjs`).
- `tests/e2e/zz-e-disclosure.spec.ts`: what moves the disclosures.

---

## The request-count table (CONFIRMED, Chromium, instrumented `IDBObjectStore`/`IDBIndex`/`IDBCursor`)

Every count below is measured, not estimated.

| Step | Changes stored | Requests | Transactions | Biggest transaction | Chromium time | At WebKit-on-Windows pace (16 ms) |
|---|---|---|---|---|---|---|
| Example seed: the page life that sets it out | 431 | 1,319 (1,297 in the commit: 862 add, 433 put, 2 get) | 20 (5 rw) | 1,297 requests, 188 ms | under 1 s | ≈ 21 s |
| **Every later full page load in the example** | – | **449 (432 single `get`s for the tail)** | 15 | 434 requests, 49 ms | – | **≈ 7 s per page load** |
| Import of 300 rows with "Last watered" | 7,810 | 23,448 rw (6 groups × 3,303, plus 3,600 for the waterings) **+ 7,803 catch-up `get`s** = 31,262 | 18 | 3,600 | 5.5 s | ≈ 8.3 min |
| First page load after that import | – | 7,831 (7,811 single `get`s, then the snapshot rewritten) | 16 | 7,813 | 862 ms | ≈ 125 s |
| One Water tap (on a fresh page) | 3 | 9 (6 add, 3 put) | 1 | 9 | ms | 0.15 s |
| **One Water tap after an import of 100, same page life** | 3 | **2,217 (2,204 catch-up `get`s)** | 4 | 2,206 | 220 ms | ≈ 35 s |
| Opening 1,000 plants (26,002 changes), no snapshot | – | 18 (one `getAll` of the whole log) | 15 | – | 1.8 s to first row | 0.3 s of requests (the fold's CPU dominates) |
| Opening 1,000 plants, with snapshot | – | 18 | 15 | – | 0.38 s | 0.3 s |
| Opening 1,000 plants, snapshot plus a 300-change tail | – | 318 (301 single `get`s) | 15 | 303 | 73 ms | ≈ 5 s |

Reproduce with `PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/zz-e-count.spec.ts --project chromium --retries 0 --workers 1`. Set `E_N=` to change the count 3 and count 4 sizes. Every `COUNT` line is printed.

Headline:
- **Writes cost 3.0 requests per change**: the change, its `order` row and its `outbox` row, plus a ledger get/put per commit.
- **Reads after writes cost a fourth and a fifth request per change.**
  - The catch-up after a claimed write (finding 5) is the fourth.
  - The snapshot's tail on the next load (finding 1) is the fifth.
  - Neither is in `helpers/pace.ts`'s model, which undercounts a 300-row import by about 1.9× and does not model page loads at all.

### Is the round-65 diagnosis sound? (item 1)

The magnitude is sound; the mechanism is better than "the Windows timer tick is likely".

- In current WebKit, `IDBTransaction::handleOperationsCompletedOnServer` delivers one request's result per event-loop task. `completeRequestAndDispatchEvent` queues the event, and the next result waits for `finishedDispatchEventForRequest`.
- `WindowEventLoop::scheduleToRun()` arms a zero-delay WebCore `Timer` (`m_timer.startOneShot(0_s)`, `Source/WebCore/dom/WindowEventLoop.cpp:112`).
- On the Windows port, `MainThreadSharedTimer::setFireInterval` (`platform/win/MainThreadSharedTimerWin.cpp`) uses `PostMessage` only when no paint or input is queued. Otherwise it falls to `CreateTimerQueueTimer`/`SetTimer`, whose floor is `USER_TIMER_MINIMUM` (10 ms) on a 15.6 ms tick.
- One request per task at one tick per task is the measured "about 16 ms, however many are asked for at once".

So the 16 ms is a Windows-port artifact. On iOS the same zero-delay timer is a CFRunLoop timer and fires on the next run-loop pass.

**Real-device estimate (SUSPECTED, not measured):**
- Per request: about 0.05–0.3 ms on a mid-range iPhone. That is IPC to the network process, a SQLite step, and one main-thread task per result. Chromium here measured 0.11 ms per read and 0.18 ms per write.
- The seed: about 0.1–0.4 s.
- A 300-row import: 31,000 requests, about 2–9 s, plus about 0.4–2.3 s for the first load after it.
- 1,000 plants with a snapshot: 18 requests, so the time is the clone of the snapshot and the fold.
- The 432 extra gets on every example page: about 20–130 ms.

**The round-65 decision.** Keeping the app and changing the waits was sound for the seed's write. It was not sound as a whole, for three reasons:
- The design costs that matter on a phone are the per-load tail and the catch-up (findings 1 and 5), and both are cheap to fix with no format change.
- The pace allowance makes WebKit runs unable to see any real Safari slowness (finding 9).
- Nothing in Chromium budgets request counts. The one time bound, r61g 4, allows 90 s for 300 rows against a measured 5.5 s.

**What to batch, in order:**
1. `arrivalsAfter` (`vault.ts:807-816`): read the tail's changes with one `getAll(IDBKeyRange.bound(minT, maxT))` filtered by the set of stamps, or one `getAll()` when the tail is a large share of the log, instead of one `get` per row. No format change.
2. `claimNow` (`collection.svelte.ts:1707-1726`): return `Stored.seq/first` from `appendChangesClaiming` and move `lastSeq` as `commit` does (`:1417`). The next commit then no longer re-reads every claimed change. No format change.
3. Write the snapshot after the seed, an import and a restore, off the page's path, or lower `FOLD_REFRESH` (1,000) to about 100–200. No format change.
4. Only if a device measurement shows writes slow: one `outbox` row and one `order` row per commit (`{ts:[…]}`) instead of per change. This takes writes from 3 to about 1 request per change.
   - It is a device-local format change: DB_V 5, migrating rows.
   - Not a sync or backup format change.
   - Readers to change: `arrivalsAfter`, `arrivalsOf`, `ORDER_FROM`, the `outbox*` functions, and `tests/e2e/helpers/inject.ts`.

---

## Findings, ranked (first visitor on iPhone Safari first, then data loss, then the rest)

### 1. The example's snapshot is never refreshed after the seed, so every full page load in the example re-reads all 431 seed changes one request at a time — CONFIRMED
- **Where:**
  - `src/lib/db/collection.svelte.ts:567` (`if (tail.changes.length >= FOLD_REFRESH) … else void touchFold`, with `FOLD_REFRESH = 1000`, `:14`).
  - `src/lib/ui/grow/demo-seed.ts:118-128`: the seed writes no snapshot.
  - `vault.ts:814`: one `get` per tail row.
- **What happens:**
  - The page that opens the example loads an empty collection and saves a snapshot at seq 0.
  - The seed then adds 431 changes.
  - Every later full load (the visitor's Today → My plants → a plant page, each a full load from the tab bar or a reload) reads the 431-row tail as 432 `get`s and does not rewrite the snapshot, because 431 < 1,000.
  - The same holds for any grower with fewer than 1,000 changes since their last snapshot.
- **Repro:** `zz-e-count.spec.ts` "E count 1". On the example's reload: `{"requests":449,"byM":{"store.get":446,…},"big":["cultifolio-demo readonly [order,changes,meta] 434 req 49ms"]}`.
- **What should happen:** a load whose tail is all of the seed reads from a snapshot taken after it.
- **Cost:**
  - On WebKit-on-Windows, about 7 s per page load in the example. That is the "collection still opening" state behind r66's Labels, My plants and menu faults, and the 10 s expect timeout barely covers it.
  - On an iPhone, an estimated 20–130 ms per load.
- **Fix:** `seedOnce` awaits `collection.rebuild()`, or a `saveFold` call made public, after `SEED_TOP`. Separately, batch-item 1 above.

### 2. When the name check answers after the species field is left, "Use my own number" (and Add) jump up to 120 px; a tap that straddles the jump does nothing. This is the cause of smoke 901, and the disclosure helper hides it — CONFIRMED
- **Where:** `src/routes/plants/new/+page.svelte:271` (`details.own`), below the picker's status lines.
- **Repro:** `zz-e-disclosure.spec.ts`.
  - "E disclosure 2" (390×664, `/api/search` and `/api/names` 1.2–1.5 s late): the summary sits at y=585, moves to 615 at 1,429 ms after blur, then to 686 at 1,699 ms.
  - "E disclosure 4": press on the summary, release after the answer. Result: `{"open":false}`, summary moved from y=585 to y=705.
  - smoke 901 does exactly this: fill, blur, then `openDisclosure(page,'details.own')`.
  - With the collection opened 2.5 s late (r62bg 5's shape) and on the import's CSV box (r62bg 3), nothing moved. Those two stay unexplained, but they belong to the same class: a press whose release lands after a layout move.
- **What a person meets:** they leave the name field, tap "Use my own number" a second later, and the tap opens nothing or lands on whatever moved under the finger.
- **The helper** (`tests/e2e/helpers/disclosure.ts`) presses again for up to 15 s, so the suite now passes over the shift instead of measuring it.
- **Fix:** reserve the status line's height under the picker (the decision the round left as "Add moves as the name check answers"). Add a test that samples the summary's top across the answer, as `zz-e-disclosure` does. Keep `openDisclosure` but fail when the first press does not open, at least in Chromium.

### 3. Move or Save pressed twice writes two moves (two "Moved to …" lines); round 66's `settlePlaces()` widens the window to a whole place write — CONFIRMED
- **Where:** `src/routes/plants/[acc]/+page.svelte:213-219` (`doMove`, no busy flag, button at `:684` never disabled), `:358-411` (`saveEdit`, no busy flag), and `src/routes/propagation/[id]/+page.svelte:296` (batch edit, same shape).
- **Repro:** `zz-e-places.spec.ts`, with every read-write transaction's completion held 600 ms (`slowIdb`).
  - "E places 1": new place typed, Move pressed twice → `{"places":1,"moveEvents":2,"locWrites":2}`.
  - "E places 2": the Edit form's Save pressed twice → `{"places":1,"moveEvents":2,"locWrites":2}`.
  - "E places 4": an existing place, Move pressed twice → `moveEvents 2`. This is older than round 66.
  - `create()`'s own guard holds: one place is made in every case.
- **What should happen:** one move, one line.
- **Fix:** a `busy` flag on `doMove`, `saveEdit` and the batch edit, set before `settlePlaces()` and checked on entry, as `save` on `/plants/new` and `potUp` already do. Disable the button while it is set.

### 4. Firefox: a grower who dismisses the "keep data" question is asked again on every page load; even "Don't allow" is asked twice on the first load — CONFIRMED (emulated)
- **Where:** `src/lib/ui/grow/GrowLayer.svelte:26-36`. It asks once per page life whenever `cultifolio.persistAfterFirst` is unset, and that key is written only after an answer is shown (`:45`). A dismissed Firefox question never answers, so the key is never written. This path ignores `cultifolio.persistAskedAt` (`collection.svelte.ts:57-67`), so the monthly rule binds only the load's own ask.
- **Repro:** `zz-e-persist.spec.ts`. `persist()` is replaced by one that never settles ("never") or resolves false ("deny"). Results over six full page loads of a grower with one plant:
  - "never": 7 questions: `persist@/plants;persist@/plants;persist@/today;persist@/;persist@/plants;persist@/places;persist@/plants/rQ1`.
  - "deny": 2, both on the first load (the load's and GrowLayer's).
  - In the example and for a visitor: 0 (sound).
- **What should happen:** at most once a month, as `/about/how` says ("a page asks at most once a month").
- **Fix:** have GrowLayer's ask go through `askDue()`, and write `persistAfterFirst` when it asks rather than when the answer is shown. Or drop GrowLayer's ask when the load has just asked.
- **Harness:** no test covers the monthly rule. `grep persistAskedAt tests` finds nothing, so removing `askDue()` survives every test. The unit test `r64f-persist` runs where `localStorage` throws, and there `askDue` returns true.

### 5. After any write that mints a number (add plant, "How many", import groups, pot-up), the next ordinary write in the same page life re-reads every change since the page loaded — CONFIRMED
- **Where:** `collection.svelte.ts:1707-1726` (`claimNow`) calls `appendChangesClaiming`. That function (`vault.ts:457-478`) drops `storeIn`'s `seq/first`, so `lastSeq` stays where the load left it. The next `commit` sees `stored.first > lastSeq + 1` (`:1418`) and queues `catchUp()`, which calls `arrivalsAfter(lastSeq)` and re-reads them all one `get` each, only to filter them out as already applied.
- **Repro:** "E count 4" (`E_N=100`). After an import of 100 rows, the first Water tap in the same tab costs `{"requests":2217, "store.get":2204}`. The second costs 9. During the 300-row import itself there is a 7,803-get catch-up after the waterings' commit.
- **Cost:** the read-only transaction on `order/changes/meta` delays the next read-write transaction until it ends. That is about 35 s at the Windows WebKit pace, and an estimated 0.1–0.7 s on an iPhone.
- **Fix:** batch-item 2 (return and apply `seq/first`). No format change.

### 6. A page reload just after a deploy: the first 4 s still reload a page under the grower — SUSPECTED (by design; not reproduced deterministically)
- **Where:** `src/routes/+layout.svelte:224-231` (`if (performance.now() < 4000) location.reload()`).
- **What I tested:**
  - "E sw 1" (two tabs) and "E sw 2" (tab A frozen with `Page.setWebLifecycleState` through the deploy): every tab registers `updatefound`, sends `skip`, gets `takingOver`, and at its next navigation does a full load.
  - Tab B, opened within 4 s of the takeover, reloaded at once. Output: `tab B after the takeover: reloaded`, then `tab A after a client-side navigation to /places: full load`.
  - "E sw 3" (typing at 488 ms on the first page after a deploy) did not lose the text here, because the takeover landed before the page's own start.
- **Risk:** on a phone the new worker's precache usually takes longer than 4 s, but on a fast connection a name typed or a box ticked in those 4 s is lost, and the reload does not wait for an in-flight vault write (`whenVaultIdle`, which the vault's own `blocking` reload uses).
- **Fix:** reload at once only when no field has been focused and no vault write is in flight (`vaultWritesInFlight()`); otherwise set `reloadOnNext`.

### 7. The worker keeps the previous build's cache "so a tab still on the old build finds its chunks", but its fetch handler never reads that cache — CONFIRMED (by reading)
- **Where:**
  - `src/service-worker.ts:53-55` and `:72-74` say the old cache is kept.
  - `:111-119`: `caches.open(CACHE)` is the new build's cache only, and `BUILD` holds the new build's files only.
  - An old chunk's path falls through to `return fetch(request)` at `:218`. It never goes to `caches.match()` across caches.
- **What happens:** an old-build tab after a takeover, before its next navigation, loses its in-page dynamic imports:
  - `PlantsMenu.svelte:33`: "Download as a spreadsheet" fails with a toast.
  - `DemoBar.svelte:52`: `import('./demo-seed')…catch(() => false)` swallows the failure and the example is never set out.
  - `ShareCard`.
  - These fail offline always, and online once Cloudflare no longer serves the old hashed files.
- **Fix:** in the build-asset branch, fall back to `caches.match(request)` across all caches before the network. Or drop the claim.

### 8. Labels: a pick saved on `visibilitychange` is read back only when the navigation type is `reload`; a tab Safari restores after the app itself was terminated may come back with another type — SUSPECTED
- **Where:** `src/routes/labels/+page.svelte:119-127` (`nav?.type === 'reload' && …`).
- **Concern:**
  - r66y 5 fakes the restore with `page.reload()`, which is always `reload`.
  - A tab restored from Safari's saved session after the app was killed is a session-state load. In WebKit that is commonly `back_forward` or `navigate`, and then the picks are dropped, which is the case the fix was for.
  - The account already says "inferred from WebKit's page lifecycle, not seen on a phone".
- **Fix:** accept `back_forward` too (the key is per tab and per address, and is cleared on in-app leave). Check it once on the iPhone.

### 9. The WebKit allowances cannot tell real Safari slowness from the Windows artifact, and nothing in Chromium budgets the requests — CONFIRMED (by reading; table above)
- **Where:**
  - `playwright.config.ts:55`: 60 s per test and 10 s per assertion in WebKit.
  - `tests/e2e/helpers/pace.ts`: 20 ms a request.
  - `seedWait()`: 46 s.
  - smoke 2535/2560/2578: up to 120 s.
  - `r61g-import-labels.spec.ts:71`: 60 rows in WebKit instead of 300.
  - `:99`: `expect(ms).toBeLessThan(writeWait(90_000, N*70))`.
- **Examples a person would call broken but that pass:**
  - Today in the example showing "Setting it out…" for 45 s (`r63v-visitor`, `seedWait()`).
  - A 26-plant import taking 34 s (`r62g-import.spec.ts:189`).
  - A 300-row import taking 89 s in Chromium (r61g 4; measured 5.5 s, so 16× headroom).
  - Any page that answers within 10 s in WebKit.
- **The model undercounts:**
  - It predicts 21,000 requests for 300 rows; the measurement is 31,262 in the import's page life plus 7,831 on the next load.
  - It has no term for a load's tail, which is what slowed r66's "opening" faults.
- **Fix:**
  - Add a request-count budget test in Chromium, deterministic, from `zz-e-count`'s counter. For example: seed ≤ 1,400 requests; one Water ≤ 20 in any page life; a load with fewer than 50 changes since its snapshot ≤ 30.
  - Tighten r61g 4 to about 3× the measurement.
  - Run the timing-sensitive WebKit tests on macOS or on Linux WebKit, where the zero-delay timer is not a 15.6 ms tick, rather than allowing for Windows' pace.

### 10. Offline in Safari is untested, and a test message says it was "checked by hand on an iPhone" with no record — CONFIRMED (by reading)
- **Where:**
  - `tests/e2e/smoke.spec.ts:1340` (`WEBKIT_OFFLINE`: "Checked in Chromium and Firefox, and by hand on an iPhone").
  - Skips at `:1342` and `:1988`.
  - smoke 924's redirect-map check returns early in WebKit (`:973`).
  - `REVIEW-ROUND-64.md:82` says an airplane-mode check "replaces them". No document records that it was done. `REVIEW-ROUND-63.md` §11 (the owner's manual checks) and `DEPLOY.md` list no offline step.
- **Why it matters:** the greenhouse with no signal is this app's iPhone case, and the worker's navigate branch (`Response.redirect`, `ignoreSearch` shell match, section fallback) runs in no WebKit test.
- **Fix:**
  - Add an offline step to the owner's manual list: airplane mode, open a plant page never opened, then `/benches/x`.
  - Run a WebKit test that goes offline from the worker's side: `context.setOffline` before the page loads, with routes off.
  - Until then, take "and by hand on an iPhone" out of the message.

### 11. Chromium-only tests that matter in Safari (item 7) — CONFIRMED (by reading `engines.ts:303-318`)
- **Layout shift** (r61a a11y-perf 5, r62a 61-5, r61g 6, r62ba N10 at 390): the iPhone is where shifts are met (finding 2). In WebKit, sample `getBoundingClientRect().top` of the watched elements across the late answers, as `zz-e-disclosure` does, instead of the Layout Instability API.
- **200% text** (seven tests): Safari's own control is the aA menu's page zoom. In phone-webkit, emulate it with `document.documentElement.style.webkitTextSizeAdjust = '200%'` or a root `font-size: 200%` and run the same no-sideways-scroll checks.
- **"round sixty: a numbering choice … at a 6x CPU throttle":** emulate a slow phone in WebKit by opening the collection late (`slowOpen`, as r66y does) instead of a CDP throttle.
- **r62a 61-8 (the accessibility tree through CDP):** `locator.ariaSnapshot()` works in every engine.

### 12. `settlePlaces()` settles every open picker on the page, not only the form's own — SUSPECTED
- **Where:** `src/lib/ui/places-pending.ts:15-17`.
- **What happens:** on a plant page with the Edit form open and a new place typed in its picker (`ed-loc`), pressing the Move panel's Move also creates the Edit form's place and sets the Edit form's value.
- **Fix:** let the form pass its own picker's settle function, or settle by picker id.

### 13. The import's place picker is read at "Check names" without `settlePlaces()` — CONFIRMED (by reading)
- **Where:** `src/routes/plants/import/+page.svelte:155`. `rowsFromPaste(lines, { placeId, … })` reads `placeId` when a new place is named and "Add place" was never pressed.
- **What happens:** the rows get no place, and the review does not say so. Round 66 left this on purpose ("read when the pasted rows are").
- **Fix:** `await settlePlaces()` at the top of `review()`.

### 14. A failed place write on Move leaves an unhandled rejection; the panel recovers — CONFIRMED
- **Repro:** "E places 3", with the next read-write transaction aborted.
- **What happens:** the panel stays open, the alert says "This change was not saved: … Free space or back up now.", and a second press works (one place, one move). But `pageerror: AbortError` comes up, because `doMove` has no try/catch around `settlePlaces()`.
- **Fix:** `try { await settlePlaces() } catch { return }` in `doMove` and `saveEdit`.

### 15. One malformed change in the log leaves every page at "Opening your collection…" forever — CONFIRMED (by injection; no intake path lets one in)
- **Repro:** inject an `event` change with field `id`. The load throws `"id" is a reserved record field and cannot be set by a change` as a page error, and the page never leaves "Opening your collection…".
- **Intake:** sync, backup and the merge all validate (`readChanges`), so only a bug or a hand edit gets one in.
- **Fix:** catch in the fold, skip the change, and show the count, as the snapshot path already does for a damaged snapshot.

---

## Mutation checks (item 7)

- **`r62g-sample`, the new case** (CONFIRMED). I reverted `sampleEdits`' `ofSeed` skip in `src/lib/db/demo.ts:131`. The case fails: "expected 2 to be +0". I restored the file afterwards.
- **`r66y-engines`** (reasoned, since a build is needed to run them):
  - r66y 1–4, 6 and 7 each assert the base's exact symptom ("No plant is growing", `seccount`, "no plants yet", no GBIF pill, the panel closing on nothing, no place), so each fails when its fix is reverted.
  - r66y 5's second half ("forgotten when the grower leaves") does catch a revert of the effect's cleanup. That works only because the document's navigation entry stays `reload` from the earlier `page.reload()` (see finding 8).
  - r66y 5 cannot catch finding 8.
- **No test** for the monthly persist rule (finding 4), for request counts (finding 9), or for double presses on Move and Save (finding 3).
- **Tests that can never fail:** r64w-probe and r65x-trace skip without `PW_PROBE` (by design). Every 200%-text test is excluded from WebKit and Firefox, so Safari has no large-text coverage at all.

## Checked and found sound

- **Persist:**
  - The load asks only with records, never in the example, never for a visitor (`zz-e-persist` "3": 0 asks), and never waits (r64f-persist).
  - `persisted()` is read without asking.
- **Reload guard:**
  - Two tabs, and a tab frozen through the deploy (`zz-e-sw` 1 and 2): every live tab sends `skip`, gets `takingOver`, and full-loads at its next navigation.
  - A first visit is never reloaded (r64w 3's emulation).
  - A second copy of the same build is not reloaded (`v === version`).
  - `buildOf`'s 1 s timeout gives null and therefore a reload, which is the safe side.
- **settlePlaces:**
  - `create()`'s single `making` promise: "Add place" twice, or Add place then Move, makes one place in every probe.
  - Add-plant (`busy`), pot-up (`pottingBusy`) and new batch (`busy`) are guarded against double submit.
- **Labels:** saving on `visibilitychange` and clearing on in-app leave behave as described.
- **Blob refusal:**
  - The bytes fallback (`vault.ts:646-655`) also covers WebKit's real asynchronous error (the request fails and the transaction aborts), since `db.put` rejects either way.
  - Staging copies bytes as stored.
- **"No plants" while opening** (Labels, My plants, the menu) is gated on `collection.ready`.
- **Opening 1,000 plants is 18 requests** with or without a snapshot. The request count is not the problem there; the fold's CPU and the snapshot's clone are.
- **Leave's no-stamp count:** the unit case kills the base mutant, and a visitor's own plant and line are still counted.
