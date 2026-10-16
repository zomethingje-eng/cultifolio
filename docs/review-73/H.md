# Round 73, agent H: the test harness

Branch `r73` in `/tmp/claude-0/rev73/H`, five commits on `r73base`: 33191db (the split put back), 25feecd (the races), 006c063 (the guard), d8f0673 (the photograph step) and 7fce5bb (a comment). No app code is changed.

## Done

**1. smoke.spec.ts is four files again, and the cause of round 72's failure is fixed.**
- *The split.* Round 72's 6c0efd9 (F) reapplied: `smoke-1.spec.ts` to `smoke-4.spec.ts`, each in order, helpers in `tests/e2e/helpers/smoke.ts`; three unit tests that read smoke by name point at the right part. All 119 tests kept.
- *The cause: two waits that held only when the app was fast, not shared state.* Each test has its own context and every vault-making test its own address; the photograph store, the rate windows and the fixed addresses play no part in the failing steps. What the four files share is the machine, and four smoke workers at once slow every page. "Removing asks twice" (smoke-2:218) failed in two places:
  - *The removal's Undo (the 600 ms rule).* My first run of the four files failed there on both attempts: the toast read "". The plant page raises it as its own `goto('/plants')` begins, and `toast.svelte.ts` `onNavigate` puts away a toast whose navigation lands more than 600 ms after it was raised. In the trace, "Yes, remove" was pressed at 150,073 ms and /plants reached at 151,264 ms.
  - *The photograph line (round 72's reading).* A later run failed at "The reference's photograph did not load." with the card's "Species page" placeholder still drawn: the species' sheet had not answered within the 5 s an assertion waits, and the photograph is asked for only after it.
- *The fixes.*
  - *The Undo.* The test is about what removing asks and what Undo brings back, not time: it holds `Date.now()` still (`page.clock.setFixedTime`; timers run), as round 72's r61l guard does.
  - *The same race in smoke-3's round twenty-three test:* the place removal's "1 plant moved up to Porch" is raised before `goto('/places')`. It holds the clock from just before the removal.
  - *The photograph line.* The test waits for the reference's answer (`#species-link`, drawn when the sheet has answered, up to 20 s) before it reads the photograph's state.
- *Proof by injected delay.*
  - *The Undo.* An 800 ms busy wait in `history.pushState` before the press: the old smoke-2:218 and smoke-3:643 both fail at the toast, the new both pass (retries off). Chromium's CPU slowed fortyfold reproduced it too, for the plant. The proof spec is at `/tmp/claude-0/rev73/H-runs/r73h-proof.spec.ts.kept`, not committed.
  - *The photograph line.* `/api/sheets` held 6 s: the old step fails with the failed run's exact text, the new passes.
- *Comments:* `helpers/smoke.ts` (why withdrawn and put back), `scripts/predeploy.mjs` (the four files).

**2. Races that hold only when the app is fast.** I read every line that reads the toast (96) and every `waitForTimeout` (65) in the base's 59 specs, and every place the app raises a toast beside a navigation (`goto` within the same handler).
- *A toast read after the app's own navigation (the 600 ms rule).*
  - smoke-2 "removing asks twice" and smoke-3 round twenty-three: fixed (above); r61l's Undo guard: fixed in round 72.
  - r61l "your own removed plant's label offers Restore": safe; `restoreRemoved` awaits its `goto` before the toast.
  - r60 14, the persistence toast: safe; GrowLayer waits for the navigation to settle, and the test waits on the answer.
  - The single add's "added" toast and the batch removal's Undo carry the same race in the app; no test reads either after the navigation.
- *A fixed pause before a positive read.*
  - r62a A38: a 300 ms pause, then the second saying of the sentence had to be there; it is now polled (`expect.poll`).
  - r67h places 3 and 5: a 500 ms pause, then the new place had to be in the vault; the vault is now polled for the record at the new place, then checked for one place of that name. Reverted, the poll times out, as the old assertion failed.
- *A read before the state it measures.* r62a A40 read the toast's style straight after the press; the toast's line is always in the page, folded with no animation, so a slow write meant the folded line was measured and the test passed vacuously. It now waits for the raised toast's words.
- *Left as they are.* The other 62 pauses are negatives ("no second write", "no reload") or measuring windows (a layout shift watched for a set time): slow, they can pass when they should not, but cannot fail. The 2.4 s and 8 s toasts are all read straight after the action that raises them.
- *Guard.* `tests/unit/r73h-harness.test.ts` (6 tests) reads the specs:
  - the four smoke files are there, each calling `smokeSetup()`, and smoke.spec.ts is not;
  - each removal the app answers by navigating ("Yes, remove…") whose toast is read before the test loads another page has `clock.setFixedTime` before the press;
  - smoke-2's photograph line comes after the wait for `#species-link`;
  - r62g 3 has its WebKit allowance (below).
  On r73base 5 of the 6 fail; the removal check names the two smoke tests.

**3. WebKit near its timeout (the owner's `--tier=app` run, 1,320 passed, 37.7 min).** I paired each of the 398 WebKit and phone-WebKit lines with its test's timeout: the 60 s project default, a `describe.configure` timeout or the test's own `setTimeout`.
- *Within 30% of the timeout:* r62g 3, 192 s of 240 (80%). Its 6,000 injected changes are 12,000 IndexedDB requests at WebKit's 16 ms each. It now calls `allowWrites(12_000 * WEBKIT_MS_PER_REQUEST)`, as the other bulk writers do: 480 s in WebKit, unchanged elsewhere.
- *Also within it:* r61l's Undo guard (timed out; round 72's fix).
- *Next nearest, made lighter though outside 30%:* smoke round fifty-nine, the keyboard under sticky bars, 36.6 s of 60 (61%). It now makes two calls per key press instead of three (the two frames and the check in one `evaluate`); the check is the same.
- *Then:* r63v V2 (53% at most) and the rest at 41% or below; no phone-WebKit test above 10 s.

## Needs

- **P (`src/lib/ui/toast.svelte.ts`, `src/lib/ui/ToastBar.svelte`): the 600 ms rule loses an Undo on a slow device.**
  - *What happens.* The plant removal (`plants/[acc]` `remove()`), the batch removal (`propagation/[id]`), the place removal (`places/[id]` `remove()`) and a single add (`plants/new`) raise their toast as their own navigation begins. `onNavigate` (run at `afterNavigate`) hides it when the navigation lands more than 600 ms after the toast was raised. So a grower whose phone takes 0.6 s to draw My plants never sees "2026-0001 removed. Undo".
  - *Evidence.* The trace (1.1 s from the press to /plants under load, the toast empty) and the 800 ms injection (gone every time). The tests now hold the clock, so they no longer show it.
  - *Suggested fix.* Measure from when the navigation began, not when it landed. Record `Date.now()` in a `beforeNavigate` in ToastBar, and in `onNavigate` hide only a toast raised more than 600 ms before that moment. A toast raised with or after the navigation's start then rides along however long the page takes. An older toast still goes.
  - *Test for P.* The removal flow with `history.pushState` held 800 ms, and no clock held, reads the toast.
- **K (`docs/DEPLOY.md`, E7): measuring a cold isolate's CPU.** Add at the end of section 3, after "Listings, limits and their words":

> ### A cold start's CPU (round seventy-three)
>
> The first request a fresh copy of the Worker answers reads the species index from R2 (5.8 MB) and builds its name maps; every later request in that copy uses them as built. On the developer's machine that first request cost about 0.4 s of CPU in node; on Cloudflare it has not been measured. Measure it once after a deploy, and again after any round that changes the index or the name maps.
>
> 1. Deploy with `npm run deploy`. A deploy starts fresh copies, so the next requests are cold ones.
> 2. Open a second PowerShell window in the project folder and type `npx wrangler tail cultifolio --format json > tail.json`. It prints nothing; it writes every request to `tail.json`. Leave it running.
> 3. In a private browser window open `https://cultifolio.com/species/copiapoa-cinerea`, then the same page again, then `https://cultifolio.com/`.
> 4. Wait ten seconds, go back to the second window and press Ctrl-C.
> 5. Type `Select-String -Path tail.json -Pattern '"url"|"outcome"|"cpuTime"'`. For each request it lists the address, how it ended and its CPU time in milliseconds.
>
> The first request of a fresh copy has by far the largest `cpuTime`; the second visit to the same page takes a few milliseconds. Requests can reach more than one copy, so there may be more than one large figure.
>
> When to act:
> - Any `"outcome"` other than `"ok"`, and in particular `"exceededCpu"` (the browser shows "Error 1102"): act now. Note the address and tell the developer.
> - On the Workers Free plan, a request may use 10 ms of CPU, which a cold start cannot meet. Move to Workers Paid before the launch: Cloudflare dashboard → Workers & Pages → Plans.
> - On Workers Paid, a request may use 30 s of CPU by default. A cold `cpuTime` under 1,000 ms needs nothing. Over 1,000 ms, more than twice what was measured here, write it in the round's notes: the corpus build should then write the synonym maps and the held names as files, so that a cold start reads them rather than builds them.
>
> If `tail.json` has no `"cpuTime"` lines (an older wrangler), the dashboard shows the same: Workers & Pages → cultifolio → Metrics → CPU time, whose highest percentile is the cold starts.

- **The merge:** none of my files overlap K's, P's or L's, as far as I know; `tests/unit/r62bh-vault-addresses.test.ts`, `r63fs-harness.test.ts` and `r69p-harness.test.ts` now name smoke-1, smoke-4 and smoke-3.

## The corpus step

None: the harness only. After the merge the owner's next `--tier=app` run is the first WebKit run of the split and of r62g 3's allowance.

## Measured

Here: two cores and 8 GB shared by four agents. Every run is strict Chromium plus the Chromium phone at four workers, 479 tests. The machine's load average swung between 2 and 27 through the afternoon, so I give each run's load beside it.

| Run | Tree | Result | Playwright's time | Wall, with the build |
|---|---|---|---|---|
| Before 1 | r73base | 471 passed, 5 skipped, 3 flaky (a page crash, two 30 s waits for hydration) | 21.1 min | 1,266 s (load 12 to 17) |
| After 1 | split and toast fixes, before the photograph fix | 467 passed, 3 failed, 4 flaky | 24.5 min | 1,473 s (load 15 to 27; K's build running) |
| After 2 | the same | 469 passed, 1 failed, 4 flaky; the failure was smoke-2's photograph line | 19.4 min | 1,166 s (load 12 to 16) |
| After 3 | final (7fce5bb) | 474 passed, 5 skipped, 0 flaky, 0 failed | 12.4 min | 747 s (load 6 to 17) |
| After 4 | final | 474 passed, 5 skipped, 0 flaky, 0 failed | 11.8 min | 708 s (load 8 to 16) |
| After 5, the end-of-round run | final | 474 passed, 5 skipped, 0 flaky, 0 failed | 12.6 min | 756 s (load 16 falling to 3) |
| Before 2 | r73base, straight after | 474 passed, 5 skipped, 0 flaky | 15.6 min | 936 s (load 11 to 13) |

- After 3 to 5 are the three clean runs. After 1 and 2 were before the photograph fix; every other failure in them was a 30 s timeout, a page crash or a dropped connection at load 15 to 27, as the base had at that load. Logs: `/tmp/claude-0/rev73/H-runs/full-*.log` (after4 to after6 are After 3 to 5).
- **Wall time:** 15.6 min on the base against 11.8 to 12.6 min split, in similar load: about a fifth saved. On the base smoke ran alone for its last 100 tests; on the owner's sixteen threads the saving should be larger.
- **Unit suite:** 401 files passed and 1 skipped; 3,841 tests passed and 8 skipped, in 363 s.
- **`npx tsc --noEmit -p .`:** clean.
- **`npx svelte-check --threshold error`:** 1,177 files, 0 errors, 0 warnings.
- **The changed specs alone:** 33 passed.

## Not done, with why

- **The app's 600 ms rule** is P's file; it is a need above, with the evidence.
- **The negative pauses and measuring windows** (62) are left: they can only pass when they should not, and making each wait on a counted event is a change per test that this round did not need.
- **WebKit** was not run here (Chromium only, per the brief); the r62g 3 allowance and the lighter keyboard test are checked in Chromium and by the guard.
