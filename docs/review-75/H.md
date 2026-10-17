# Round 75, agent H: the harness and the one-off flakes

Branch `r75` in `/tmp/claude-0/rev75/H`, five commits on `0a7de25`, last `3af687a`.

## Done

### Firefox at two workers, and predeploy says each engine's count

- `playwright.config.ts`: the Firefox project now has `workers: 2` of its own, as WebKit has (`PW_FIREFOX_WORKERS` names another count). A failed Firefox test now keeps its trace (`retain-on-failure`, snapshots only, as WebKit's; `PW_FIREFOX_TRACE`). That trace is the evidence the two Firefox flakes that are still unexplained lacked.
- `scripts/engine-pace.mjs` (new) holds the per-engine counts. The config sets them from it, and predeploy prints from it, so the printed line cannot drift from the counts used. `--tier=app` now prints: "Chromium and the Chromium phone at 4 workers; WebKit and the WebKit phone at 2 workers (PW_WEBKIT_WORKERS); Firefox at 2 workers (PW_FIREFOX_WORKERS), 4 in all at once". On the base it printed "Chromium, the Chromium phone, and webkit, firefox, --workers=4".
- The strict rule is unchanged: `retries: 1`, `failOnFlakyTests: true`, `--fail-on-flaky-tests` in predeploy, and r62bh-predeploy untouched. `r75h-harness.test.ts` checks all three.

### The four open flakes

1. **r62bg 1 (Firefox): a Leave answered Cancel left the example. This was an app fault in a timing rule, now fixed with a rule that does not depend on time.**
   - Before a Leave navigated, `leaveDemo` took the tab's flag off and marked the example for deletion. A `pagehide` listener did the rest.
   - A Cancel had to put the flag and the mark back. Chromium says a Cancel (`navigateerror`); Safari's engine does not, and Firefox may not. Without that signal, only a 3 s timer ("Leave site?" asked and the page still showing) put them back.
   - A reload or any page load before that timer fired opened the grower's own collection, and that page deleted the example with the visitor's edit.
   - The fix: Leave now writes only its one-use token. The page its address opens does all the leaving: app.html's first script takes the flag off and sets the delete mark, and `finishLeaving` writes the new generation and now also tells the other tabs. So a Cancel leaves nothing to undo, however late any timer runs.
   - Timers now decide only when the button comes back from "Leaving…". It also comes back at the first press or key on the page after "Leave site?" (a page cannot be pressed while the question is up). r62bg 1 presses the heading in WebKit and Firefox, and allows 1.5 s everywhere.
   - `tests/e2e/r75h-leave.spec.ts` makes Chromium a browser that does not say a Cancel (its Navigation API taken away) and reloads straight after the Cancel. On the base build, tests 1 and 2 fail: after the reload the flag is null and the delete is marked; the button needs the full 3 s. On the fix, all three pass.
   - `tests/unit/r62bg-sample.test.ts` has two new cases. Four unit tests that encoded the old order are updated (`r62bg-sample`, `r62g-sample`, `r67v-scope`, `r69x-left`), each with its r75base value in a comment. All of them fail on the base `demo.ts`, checked in a worktree.
   - I cannot prove this was the PC's failure: no Firefox here, and no trace was kept. It is the only path I found that turns a Cancel into a Leave, and it is now closed.
2. **smoke-3 "four hundred plants" (WebKit): the restore ran past 125 s. Fixed in the test.**
   - The wait was a time worked out beforehand: 6,000 requests at 20 ms. Under the whole run's load WebKit went slower than that.
   - `tests/e2e/helpers/progress.ts` (new) is a wait that does not depend on the machine's speed. `watchStorage` counts every IndexedDB request answered in the page. `whileStoring` waits in windows of 15 s, starting another window whenever the count moved, and fails after one quiet window with the check's own message.
   - Both restores and the opening of /plants use it. WebKit's test time is now an outer bound at twice the measured pace.
   - `tests/e2e/r75h-progress.spec.ts`, under a 20x CPU throttle, shows the wait carrying on through several 1 s windows where a fixed one-window wait fails. It also shows a quiet page failing in one window.
   - I could not make the old test fail here. CPU throttling slows the merge only to 3.5 to 4.7 s, because IndexedDB runs outside the throttled renderer, and nothing in Chromium stands in for WebKit's 16 ms per request.
3. **smoke-2 "removing asks twice" (Firefox): Water left no line. Not reproduced; the test is hardened and now reports which case it was.**
   - /plants is drawn in the browser alone (`ssr = false`), so a drawn Water button already has its handler. The missing `ready(page)` was not the cause.
   - Chromium runs alone gave a line every time: plain, sheets held 1.5 s, chunks held 2.5 s with the worker blocked, a 6x CPU throttle, 3 runs each.
   - The test now waits for hydration and for the species' sheet (the reference photograph's space comes and goes as it answers) before the tap.
   - If no line comes, it now says which case it was: the write still pending (`aria-disabled`), a refusal (`#write-error`), or no handler reached.
4. **r60 11 (Firefox): `page.goto('/sync')` ended in "<unknown error>". Not reproduced.**
   - The test now waits for Today to hydrate before going on.
   - Playwright's Firefox gives "<unknown error>" for a load status that is not a known Firefox error code. A load of /sync aborted by the page, or by a service worker that failed to answer, would fit. Nothing here shows which.

### The same pattern elsewhere

- The pattern: a press or a value typed on a page straight after `page.goto`, with no `ready(page)` between them.
- A static scan found 75 such places, nearly all on pages drawn in the browser alone, which are not at risk.
- On server-drawn pages (the front page, species pages, about pages, settings), 14 places pressed before hydration. Examples: Menu, a genus row, Not now, °F, Your species, the search box. Each now has `ready(page)` after its `goto` (smoke-1, smoke-2, smoke-3).
- The guard `pressedBeforeHydration` in `r75h-harness.test.ts` enforces it. It skips pages drawn in the browser alone, links, presses retried inside `expect.poll`, and pages with JavaScript off. It is checked against small samples and fails on the base.
- One of my insertions was wrong (smoke-1's front-page test has JavaScript off), which the strict run caught. It is reverted, and the guard now skips such tests.

### `scripts/flake-check.mjs` (new)

- `node scripts/flake-check.mjs` runs six tests in Firefox and WebKit, 20 times each, at two workers, with `--retries=0`, and not strictly. The six are the four open ones, plus r64f 7 and "round forty-nine: a place takes plants in" as checks of round 74's fixes.
- It prints the plan and the expected time first (1 h 39 min for the default). At the end it prints one line per test and engine with passes and failures, and under it each failure's run number and first line.
- `--engine=`, `--repeat=`, `--workers=`, `--dry-run` and test names override the defaults. A name is the start of a title or any part of it ("r60 1" is not r60 11). PowerShell's split of `--engine=firefox,webkit` is handled.
- It exits 0 only when every run passed, and it stops with the install line when an engine is missing.
- `r75h-harness.test.ts` covers the argument handling, the estimate, the plain-text pattern and the absence of retries. It also checks the summary against a real Playwright JSON report from a scratch config (repeat 3, one failure on the second run, skipped tests).
- `docs/DEPLOY.md` has a new section, "A test that passed only on its retry", saying when and how to use it. The predeploy sentence there now names Firefox's count.

## Needs

None. Nothing I changed is G's or S's.

The about pages stay true. `/about/formats#sample` says Leave goes "at an address that says so … and the first page there deletes the example", that a Cancel "stays a working example tab … a later reload or closing the tab keeps the example", and that every Leave not called off writes a new generation and tells the other tabs. The code now does each of these from the first page after the Leave.

## For the owner's PC

1. `node scripts/flake-check.mjs`, about 1 h 40 min. Send back the result lines and any `test-results/*/trace.zip`.
2. If r60 11 or smoke-2 fails, its Firefox trace settles it:
   - r60 11: whether the page or the worker started a navigation before `goto('/sync')`;
   - smoke-2: the new message says whether Water's write was still pending.
3. Then the deploy run as usual: `node scripts/predeploy.mjs --tier=app`. Its first lines now say Firefox at 2 workers.

## Measured

- Strict Chromium and the Chromium phone, fresh server, the 15 affected spec files: 191 passed; one failure, my smoke-1 insertion, fixed. smoke-1 alone after the fix: 25 passed.
- Earlier, the 11 Leave-related spec files: 86 passed.
- No test was flaky in either run.
- On the base build, `r75h-leave`: 2 of 3 fail. `r75h-progress` ×3: 6 passed. The restore under a 20x throttle took 3.5 to 4.7 s, two or more windows.
- Unit suite once: 3,958 passed, 8 skipped. `tsc` and `svelte-check`: 0 errors.
- In a worktree at `0a7de25` with only the new and changed unit tests copied in, 16 fail, as claimed.

## Not done, with why

- **r60 11 and smoke-2 are not reproduced:** there is no Firefox here, and no Chromium handicap reproduced them. The evidence that would settle them is now collected on the PC: Firefox traces, and smoke-2's message.
- **The old 400-plant test was not shown failing here:** nothing in Chromium stands in for WebKit's per-request IndexedDB pace.
- **Not measured:** the flake rate at two Firefox workers. That is the owner's run above.
- **`enterDemo` was left as it is.** It has the same 3 s Cancel guess. Its button is pressed only from pages with nothing typed, so its "Leave site?" is rare. The same address-token remedy would fit it.
