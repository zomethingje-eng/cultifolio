# H's report: the harness (round sixty-seven)

Working copy: `/tmp/r67/H`. No file under `src/` is changed: `diff -rq /tmp/r67base/src /tmp/r67/H/src` is empty.

How "red on the base" was shown:
- For the specs and scripts I changed: the base copy of the file was swapped in, the test was run, and the file was put back.
- For app fixes: the fix was reverted in my copy only, the test was run (after a rebuild, for e2e), and the file was restored. Every reverted file was checked identical to `/tmp/r67base` afterwards.

E2E ran on port 4216 against my own build, with `--project chromium` (and `phone` where tagged), `--retries 0 --workers 1`.

## Read first: three tests wait on other agents, and one incident

**Tests that pass only once another agent's change is merged.** Each is red on the base on purpose. None is skipped in code; the lead should confirm each after the merge.

| Test | Waits on | Base result |
|---|---|---|
| `r67h-budget.spec.ts` budget 2: the example's next page load ≤ 60 requests | R: a snapshot after the seed, or the tail read in one range | 449 |
| `r67h-budget.spec.ts` budget 4: one Water after an import of 100 ≤ 60 | R: the frontier moved after a claimed write | 2,217 |
| `r67h-budget.spec.ts` budget 5: a load with 45 changes since the snapshot ≤ 40 | R: the tail read in one range | 63 |
| `r67h-places.spec.ts` places 7: Move settles its own picker only | R: per-form `settlePlaces` (IND-5) | the Edit form's place is made too |
| `r67h-disclosure.spec.ts` disclosure 4: "Use my own number" and Add stay put while the name check answers late | P: P10 | the summary moves 585 → 615 → 705 px |

**Incident: shared `/tmp/claude-0`.** Early on I wrote backup copies to `/tmp/claude-0`, which every agent shares. The files were `col.bak`, `io.bak`, `hlc.bak`, `plan.bak`, `counters.bak` and `layout.bak`, written between 17:14 and 17:36 UTC, all base content.
- Another agent has `/tmp/claude-0/hlc.new` from 17:10, so it may also have used `hlc.bak`.
- I told the lead by message, and I have deleted those six files. A restore from them now fails loudly instead of putting a base file back silently.
- Please check `hlc.ts`, `collection.svelte.ts`, `plan.ts`, `counters.ts`, `io.ts` and `+layout.svelte` at the merge.
- Everything after that went to my own scratchpad.

## The items

### H1. Request budgets (S-E9, R45-D)
**Files:**
- `tests/e2e/helpers/idb-count.ts` (new). It is reviewer E's counter, made a helper:
  - `countRequests(context)`;
  - `markCount`;
  - `idbQuiet`, which waits until every transaction has ended and none has started for 1 s;
  - `countSince`, which returns the requests, the transactions, the counts by method and the big transactions.
- `tests/e2e/helpers/inject.ts`:
  - `injectTail` writes changes as a sync pull stores them: the arrival rows and the ledger are written, and the snapshot is kept;
  - `snapshotSaved` waits for a snapshot.
- `tests/e2e/r67h-budget.spec.ts` (new, `@chromium`).

**Budgets and base measurements** (they match E's table):

| # | Step | Budget | Base | Base result |
|---|---|---|---|---|
| 1 | The seed's page life | ≤ 1,400 | 1,319 | pass |
| 2 | The example's next page load | ≤ 60 | 449 | **red, waits on R** |
| 3 | One Water on a fresh page | ≤ 20 | 9 | pass |
| 4 | An import of 100 | ≤ 70 a plant (the triage's "an imported plant") | 6,643 (66 a plant) | pass |
| 4 | One Water after that import, same page life | ≤ 60 | 2,217 | **red, waits on R** |
| 5 | A load with 45 changes since the snapshot | ≤ 40 | 63 | **red, waits on R** |

Not done: E also suggested tightening r61g 4's time bound to about 3× its measurement. The triage does not list it, and the file is not mine.

### H2. Offline in WebKit (S-E10)
**Files:**
- `tests/e2e/helpers/cut.ts` (new): `cuttableNetwork`, a Node proxy in front of the test server, on its own port and so its own origin.
  - While it is up it passes requests through and notes each path.
  - `cut()` drops every connection, so the worker's own `fetch` meets a real network error. Nothing stands in front of the worker, which `setOffline` and `route` do in Playwright's WebKit.
- `tests/e2e/r67h-offline.spec.ts` (new). These tests run in every engine:
  - 1 (`@phone`): a plant page never opened opens from the section shell with the network cut.
  - 2: smoke's offline-whatever-the-units check.
  - 3: smoke 924's redirect map. Online it is checked by "the proxy never saw the old address" instead of a route; then it is checked again with the network cut.
- `tests/e2e/smoke.spec.ts`: "and by hand on an iPhone" is gone from `WEBKIT_OFFLINE`, which now points to r67h-offline. Smoke 924's WebKit early return names r67h-offline 3.

**Results:**
- 4 passed in Chromium and the phone.
- WebKit is not installed here, so these were written against Playwright's API and not run in WebKit.
- These are new coverage, so there is no base failure to show.

**Need:** an airplane-mode step on the iPhone in DEPLOY's manual checks (`H-needs.md`, for S).

### H3. The Chromium-only tests in a portable form (S-E11, R45-28)
**Helpers:**
- `tests/e2e/helpers/positions.ts` (new): element positions read on every animation frame. Each selector is read as its first visible match. A move counts only on screen, which is the Layout Instability API's own rule.
- `tests/e2e/helpers/text-size.ts`: `rootText(ctx, 200)` sets the root's font size through an adopted stylesheet with `!important`. Its limit is said in the comment: a media query in em still reads 16 px.
- `tests/e2e/helpers/engines.ts`: a comment pointing each Chromium-only kind to its portable form.

**`tests/e2e/r67h-engines.spec.ts` (new).** These run in every engine; no `@chromium` tag:
1. `toMatchAriaSnapshot('- status')` for the toast region (r62a 61-8).
2. The dark theme on paper with `emulateMedia` alone (r63fv front 2).
3. 320 px at 200% root text across 14 pages: no sideways scroll, and Today stays on screen.
4. The web fonts 1.5 s late at 390 px on `/` and on a species page: h1, h2, p and the tab bar do not move (r62ba N10).
5. An example page drawn with its bar from the first frame, and nothing moving (r61g 6).

**The CPU race.** It needs no new test: smoke's "round sixty: with the collection slow to open…" is already its `slowOpen` form and already runs in every engine.

**Results:** all six pass, twice each (`--repeat-each 2`), in Chromium. A probe confirmed the position recorder sees a forced 30 px shift.

**Observation, not a fault.** On a species page a visually hidden h2 and a heading below the fold move up 21 px about 2 s after load, fonts or not. A reader does not meet it, and the recorder now ignores both cases, as CLS does.

### H4. The seven reverts that stayed green (R45-26)
Each test below is red with its fix reverted. These are unit tests, in `tests/unit/r67h-reverts.test.ts` (new):

| # | Fix | Revert | The test |
|---|---|---|---|
| 1 | `adoptStored` does not re-measure | `follow()` added at the top, or after `was` | The clock moves between tab A's write and tab B's storage event; B is told once. Reverted, B gets `[0]` or `[0, 0]`. The existing r62bl case stays green under both reverts. |
| 2 | `observe` guards at `PAST_BIT - 1` | guard at `PAST_BIT` | A spy on `bump`: `observe` never hands it `0x7fffff`. |
| 3 | `bump` never lands on the flag | the `count + 1 >= PAST_BIT` arm dropped | After observing `0x7ffffe`, the next tick is unmarked at the next millisecond. |
| 4 | `plan.mixed` only when a line is renumbered | the condition dropped | A mixed sheet with no repeats is not called mixed. |
| 5 | The sweep's hold is dated by `clock()` | `hold(name, now)` | Two marked photographs, the first one's listing two minutes long: the upload's hold is asked during the second one's listing, before any renew, and is refused. r63fs-sweep stays green under this revert. |

These are e2e tests, in `tests/e2e/r67h-places.spec.ts` (new). Every outcome is read from the vault itself:

| Places test | What it checks | Revert used | Reverted result |
|---|---|---|---|
| 1 | "Add place" pressed twice while every write completes 800 ms late: one place | `if (making) return making` | 2 places |
| 2 | Round sixty-six's race: Move pressed while "Add place" is still writing; the plant is at the new place, and one place is made | `settlePlaces` | red |
| 3 | Start batch | `settlePlaces` | no place made |
| 4 | Pot up | `settlePlaces` | no place made |
| 5 | The batch's Save | `settlePlaces` | no place made |
| 6 | The plant's Save | `settlePlaces` | no place made |
| 7 | IND-5, by behaviour: Move's place is made, the Edit form's is not | (red on the base) | waits on R |

Tests 1 to 6 pass on the base. Two builds proved the reverts: one with the `making` guard removed (places 1 red), and one with all five `settlePlaces` calls removed (places 2 to 6 each red).

### H5. A single-click check (R45-27, IND)
**Files:**
- `tests/e2e/helpers/disclosure.ts`:
  - `pressOnce` records one press: where the summary was at pointerdown and pointerup, the clicks and toggles that followed, the focus, and the scroll before and after.
  - `openDisclosure` now presses once through it. Every second press adds a `second-press` annotation to the test, with that record, and prints a line.
- `tests/e2e/r67h-disclosure.spec.ts` (new). One press each, which must open with 1 click, 1 toggle and no move between the press and the release:
  - 1: the import's CSV paste box;
  - 2 (`@phone`): the add form's "Use my own number" after the name is typed and left, smoke 901's steps;
  - 3 (`@phone`): "More details";
  - 4 (`@phone`): frame-by-frame positions across a late name check. **Waits on P10**; red on the base, as E found.

**Results:**
- 1 to 3 pass in Chromium and the phone.
- 1 failed once, at its first page load after a server restart: `data-ready` never came in 30 s. Its repeat passed. I read it as the loaded machine, not the test.
- Smoke 901 and r62bg, which use the helper, passed with no second press recorded.

### H6. The bundle gate bans by module path (R45-13)
**`scripts/check-bundle.mjs`** bans by module path in two ways:
- **In the sources.** It walks the layout's static import closure (`+layout.svelte`/`.ts`) through src/ and Kit's aliases. Type-only imports and dynamic `import()` are not followed. The stamp proves the build was made from these same sources. Anything under `src/lib/backup/` fails. Anything under `src/lib/ui/grow/` fails too, except `LAYOUT_GROW`: GrowLayer, DemoBar, example.svelte.ts, IosFirst and ios.ts, each with its reason.
- **In the build.** A chunk the layout reaches whose `src` is a banned module fails.

The chunk-name check is gone.

**Shown red on deliberate violations, with real builds:**
- The layout importing `readPrice` from `$lib/ui/grow/spend`: the build fails with the module's path. The base gate passed the same build ("hold neither backup nor grow").
- The layout importing `$lib/backup/format`: the same result, and the base gate passed that build too.
- The clean build passes: 27 chunks and 42 modules.

**Tests:** `tests/unit/r62h-bundle-gate.test.ts` has three new cases: direct, through another module, and through an allowed grow module; on-demand and type-only imports pass; a banned entry in the manifest fails. On the base script, 3 fail.

**Need:** DEPLOY wording, for S.

### H7. Smoke's raw database writes go through `inject.ts` (R45-29)
**Files:**
- `tests/e2e/helpers/inject.ts`: `wipe(page)`. It does what `replaceFromStaging`'s wipe does, in one transaction: changes, photos, outbox and order are cleared, the snapshot is dropped and `foldGen` is moved.
- `tests/e2e/smoke.spec.ts`: both raw writes use it, in "backup: export a zip…" and "round twenty-eight…". Both pass.

**Guard:** `tests/unit/r67h-harness.test.ts` (new) fails on any raw read-write transaction or store write in a spec. It is red on base smoke.

### H8. The fold guard covers the parks (R45-29)
**File:** `tests/unit/fold-rules.test.ts`.
- A second behaviour hash, `RECORDED_PARKS = '1dc4b4c11bcc41f981aa40e86c35b5bd'`, under FOLD_RULES 7. The first hash is unchanged.
- It covers:
  - a held change that an edit was stamped past, and one still waiting, through `heldWaiting` and so `stillWaiting`;
  - two parked values of one field, through `parkedFor`;
  - a parked restore applied with `applyParked`, and a field applied;
  - `fileParks` over five manifests.
- Each record is read as text when shown, and this tab's random tag is masked.

**Red under each of R45's four mutations:**
- `fileParks` keeps old parks;
- `stillWaiting` is always true;
- the restore branch is removed;
- `parkedFor` offers the earliest value.

Only the new test fails in each case. FOLD_RULES is not changed.

### H9. The server specs use `docAddress()` (IND-9)
**Files:**
- `tests/e2e/r62s-server.spec.ts` and `r62bs-server.spec.ts`: both use `docAddress()`.
- `tests/e2e/helpers/address.ts`: the `RESERVED` gap for .62 and .63 is gone.
- `tests/unit/r62bh-vault-addresses.test.ts`: `KNOWN` is gone, and a new case says no spec writes a documentation address by hand.

**Results:**
- On the base specs, 3 cases fail.
- Both server specs pass in e2e.

### H10. A plain `npx playwright test` is strict (R45-29)
**Files:**
- `playwright.config.ts`: `failOnFlakyTests: true` always. `retries: 1` is kept, so a flake is told apart from a failure, and it fails the run. predeploy is unchanged and still sets `CI_STRICT` and `--fail-on-flaky-tests`.
- `tests/unit/r62bh-predeploy.test.ts`: a new case runs a plain `playwright test` with the project's own config, with its server and projects taken out and CI_STRICT empty, on a test that passes only on its retry.

**Results:**
- The new case exits non-zero.
- On the base config it exits 0, so the case is red there.

## Needs and about pages
- `/tmp/r67/H-needs.md` lists:
  - three DEPLOY.md changes for S: the bundle gate's words, the plain run being strict, and the iPhone airplane-mode check;
  - notes for the lead on `LAYOUT_GROW` and the parks hash.
- No about-page sentence changes: nothing here changes what `/about/how` or `/about/formats` describe.

## Unit files run, and svelte-check
Each file was run on its own with `npx vitest run <file>`, after all changes:

| File | Tests |
|---|---|
| `r62bh-vault-addresses` | 45 passed |
| `r62bh-predeploy` | 4 passed |
| `fold-rules` | 3 passed |
| `r62h-bundle-gate` | 9 passed |
| `r67h-reverts` | 5 passed |
| `r67h-harness` | 44 passed |
| `r63h-engines` | 11 passed |
| `r62h-inject-order` | 5 passed |
| `r61g-layout-bundle` | 1 passed |
| `r63h-qa-removed` | 4 passed |

`npx svelte-check --threshold error`: 961 files, 0 errors, 0 warnings. It includes `tests/**`.

## E2E run (Chromium on port 4216)

| Spec | Result |
|---|---|
| r67h-budget | 2 of 5 pass; 3 red, waiting on R |
| r67h-places | 6 of 7 pass; 1 red, waiting on R |
| r67h-disclosure | 3 of 4 pass, in Chromium and the phone; 1 red, waiting on P10 |
| r67h-offline | 4 of 4 pass, in Chromium and the phone |
| r67h-engines | 6 of 6 pass, ×2 |
| smoke's backup round trip, round twenty-eight, and both "number already in use" tests | pass |
| r62s-server, r62bs-server | pass |
| r62bg-import | pass |
