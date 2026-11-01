# Round eighty-five, agent Q: the tests themselves

Copy `/tmp/claude-0/rev85/Q/`, branch `r85`, nine commits on `r85base`. Every change is in `tests/`. Nothing in the app changed, so nothing waits on a deploy or a walk. Each step's live check is untouched.

## Done

### A component harness: unit guards for what only a browser spec guarded

**`tests/unit/helpers/mount.ts`** (new), with `mount-entry.svelte.ts` and `Nothing.svelte`.
- It mounts any component, a route page included, in Playwright's Chromium, with no server and no build. Vite serves `src/` with the app's aliases; `$app/*` are stand-ins.
- The test answers every `/api/` request itself (held, failed or slow). IndexedDB is real, so `helpers/inject.ts` works unchanged.
- The first mount in a file takes 5 to 8 s here, later ones about 1 s. Without Chromium the test fails and says how to install it; it never skips.

### C8 and A23: the round-84 fixes a revert did not fail

I took each fix back alone in the copy, ran its new test, then restored the source with `git checkout src`.

| Fix | Test | What the revert does |
|---|---|---|
| C8 1, the gap catch-up's report (`advanceOver`) | `r85q-reverts` 1. Another tab's rows are stored without a notice, this tab writes, and the catch-up fails | `readBehind` stays null. r84u-frame-notes still passes with the revert |
| C8 2, a press outside the picker closes the list | `r85q-picker` 2. The page's clock is paused, so no timer can close the list, and the list must be shut while the finger is still down | open |
| C8 3, `armed = false` on the late answer | `r85q-picker` 4. Enter arms the name with the search held, then the search resolves it | still "Add as typed" |
| A23, the site name bounded on restore | `r85q-reverts` 2. A `device.json` with a 3.3 MB name goes through `applyDeviceSettings` | a name of 3,300,000 characters is kept |
| A23, Today's caller (`split('T')[0]`) | `r85q-guards` 4. Today is mounted in New York with the backup taken at 21:00: "today" at 21:30, "1 d ago" at 10:00 the next morning | "today" the next morning. The browser spec's evening case passes with the revert, which is why the revert went unseen |

C2 and C3 are K's to test, as the brief assigns.

### A23: unit guards for the e2e-only fixes

**The picker's five behaviours** (`r85q-picker`, on the real add form): a late answer never opens the list after a leave (the page clock is run past the 150 ms close, not slept through); a press outside closes it at once; Add waits for the search still out and files key 5384999 on one press; the late answer clears "Add as typed"; the room under the field holds under a press. All five fail with their fix taken out.

**Print's `beforeprint`** (`r85q-guards` 1):
- On the species page, the care sections and Figures open. "How this section is made" stays shut. `afterprint` closes only what print opened, so one the reader opened stays open.
- On /about/how, all ten lists of rules open, then close again.

**The maps' `aria-describedby`** (`r85q-guards` 2): the page is mounted with its own load's data over the fixture corpus.
- The range map and the records map name `range-caption` and `records-caption`.
- No `aria-describedby` on the page names a missing element.
- This holds whether the map is drawn in the browser or by the server, with the server's markup put where its mark is, as `placeDrawn` does.

**The footer hold** (`r85q-guards` 3): `frame`'s holds are tokens; My plants never releases the footer over an empty list; Today holds it while `/api/sheets` is out.

All seven of these fail on revert. The two that pass on revert are guards: the token test, and the evening case of 4.

### Source-text tests

**The two named ones are now behavioural** (`r85q-behaviour`):
- `r84e-species-words:115`: the Climograph is mounted at 420, 300, 200 and 1,400 px and draws at 400, 280, 260 and 960. The server render draws at 720. It fails with the clamp removed (180 at 200 px).
- `r84m-merge:52-54`: a plant page whose hash group has no page sends no `/api/search` as it opens. Pressing "Is it an older name?" sends one. It fails with the lookup run on open (`['Aloe aristata']`).
- The /about/how sentence stays as a source-text test, because it is a written promise.

**The species page's ones** (r83a, r83w, r82f ×2, r81a) are replaced by `r85q-species-page`, which mounts the page and reads the merged and shared older-name line, "More on Wikipedia ›" for a cut summary, "Kew's entry lists no native region", and the care line quoting Kew. Each fails on revert: the merged branch's condition made false, `|| d.summary.cut` dropped, the `foundNotShown` call dropped, and `kew:` left out of the sheet's input.

**The rest of the class is held by a rule** (`r85q-source-text` and `tests/unit/fixtures/r85q-source-text.json`):
- The test finds every `toContain` or `toMatch` on the text of a code file under `src/` or `scripts/`, outside the about pages, whose expected text reads as code.
- It counts them per file against a ceiling that can only fall. Today that is 153 assertions in 53 files.
- No new test of this kind can be written. Each one made behavioural must lower its ceiling, or the test fails and prints the new counts.
- Tests of page words and about-page seams are not counted: they guard written promises.

### Fixed sleeps: 88 in 30 files on the base, 6 now

Each sleep became a wait for the state it stood for: a positive (r62bq's pill); the page gone quiet (`goneQuiet` in `helpers/settled.ts`: no request in flight for a span, then two frames; a page that never goes quiet fails there, saying so); the database gone quiet (`idbQuiet`, r67r and r67h places); frames drawn; the reload begun (`framenavigated`, r70x); the page's clock run on (r84k-picker 1).

Six are left, each a timer the page gives no sign of ending: the app's 4-second takeover rule (r64f, r69p-takeover), the tab mark's 1.2 s (r82u), the toast's 600 ms (r73p-toast), the browser's preload warning (r80u-layout), and a rate read over a second (r75h).

Each says why on its line. `r85q-sleeps` fails on any sleep without a reason; on the base, 63 had none.

### Chromium-only specs: tagged and guarded

- **The marker.** `chromiumOnly(reason)` in `helpers/engines.ts` tags a test `@chromium` and adds a `chromium-only` annotation with the reason to the report.
- **The 18 tests that carried a bare tag now say why.** Where an every-engine form exists, the reason names it: r84u P2's is the per-frame "P2, A12, B4" above it, and r63v V2's and r67v V10's are r67h engines. r84u P3 and r81u 2a cannot have one, because only Chromium's protocol emulates a notch's safe areas.
- **The guard** (`r63h-engines`) refuses a bare tag, an empty reason, or a named reason with no sentence behind it, and now also counts `chromium.launch`, `page.coverage` and the long-task, largest-paint and first-input entries. It fails on the base: 18 bare tags.

### The WebKit-on-Windows tap quirk (r69p P5)

`helpers/press-kind.ts` (new) reads what the page saw of a press and classifies it. `helpers/disclosure.ts` now records, from window-level capture listeners, every release and cancel the page received, and the summary's position after the press.

- **A lost release** (the engine's quirk): the finger went down on the summary, but no `pointerup` or `pointercancel` reached the window. No click or toggle followed, and the summary is where it was. A page cannot cause this: if a page moves, covers or captures the summary, it still receives a release somewhere, or a cancel.
- **A real missed tap** (the app's fault): the release reached the page with no toggle, or the summary moved, or the browser cancelled the press, or the press never reached the summary.

A lost release is pressed once more, only in WebKit on `win32`, and the first press is kept (`lostRelease`, a `lost-release` annotation, a log line). A press whose click came without its release is one tap, annotated `release-not-delivered`. A real missed tap is never pressed again, and `expectOneTap` fails on it in every engine. Before, `oneTap` read any missing release as "moved".

Tests: `r85q-press-kind` (every case, unit); `r85q-press` makes each happen in Chromium. A lost release (`pointerup`, `mouseup` and `click` stopped before the page) is pressed again and recorded when retries are allowed, and fails when not; a real missed tap (the click alone stopped) is never retried and fails.

## Decisions I took

1. **A unit guard for an e2e-only fix is the component mounted in a real browser, with no server or build.** No DOM library may be added, and moving logic out of K's, E's and U's components would collide with their edits. Behavioural tests survive those rewrites.
2. **A negative waits for the page to go quiet,** so its span starts when the page stops asking, and slow WebKit gets the time it needs. Only timers the page gives no sign of are still waited out.
3. **The rest of the source-text class is held by a ceiling that only falls,** not converted this round (see "Not done").
4. **A lost release is retried only in WebKit on Windows,** where it has been seen. Anywhere else it fails like any other miss, so a new engine's fault gets read, not retried.

## Measured

- **Fixed sleeps:** 88 → 6.
- **Chromium-only tests:** 18 marked with a reason, 0 bare.
- **Source-text assertions on code** (the ceiling's count): 153 in 53 files, after 12 were made behavioural.
- **New unit tests:** 33 in eight new files, all passing (guards 9, picker 5, reverts 2, behaviour 3, species-page 4, press-kind 5, sleeps 2, source-text 3); `r63h-engines` 15 of 15.
- **Revert checks:** every new test above fails on revert. Under memory pressure, the shared cgroup's OOM killer took Chromium's renderer twice ("Target crashed"); each of those checks was rerun when memory allowed, and each failed at its own assertion.
- **Types:** `npx tsc --noEmit -p .` reports 0 errors. `svelte-check` checked 1,467 files: 0 errors, 0 warnings.
- **Nearby unit tests:** the 27 files that read the browser harness or the tests I changed pass, 493 of 493.
- **Browser run, strict, Chromium and the phone:** the 32 specs I changed, 290 tests in all. 289 passed. One was flaky, `r85q press 2` on the desktop: the import page moved 24 px under the press, so the classifier rightly read a missed tap and not a lost release. Its setup now waits for the page to go quiet (`goneQuiet`) before pressing. `r85q-press` then passed 24 of 24, four runs each in both projects.
- **On the base:** the guards for sleeps and Chromium tags fail on r85base's specs (63 sleeps with no reason, 18 bare tags), and the press classifier did not exist.

## For the owner's PC

The unit suite now launches Playwright's Chromium for the `r85q-*` mount tests. It is already installed for the browser suite.

```
npx vitest run tests/unit/r85q-guards.test.ts tests/unit/r85q-picker.test.ts tests/unit/r85q-behaviour.test.ts tests/unit/r85q-species-page.test.ts tests/unit/r85q-reverts.test.ts
npx playwright test tests/e2e/r85q-press.spec.ts tests/e2e/r69p-disclosure.spec.ts tests/e2e/r67h-disclosure.spec.ts --project webkit --project phone-webkit --project firefox
```

The second command runs the tap helper in WebKit on Windows. Any `lost-release` annotation in its report is the quirk, recorded. A failure that names `missed` is a real missed tap.

The specs whose sleeps changed should get their usual all-engine run (`node scripts/predeploy.mjs --browsers=webkit,firefox`).

## Touched outside my files

Nothing in `src/`, `scripts/` or `docs/`. I took the app's code back temporarily to check that the tests fail on revert, and restored it each time with `git checkout src`. `git status` is clean outside `tests/`.

## Not done, with why

- **153 source-text assertions on code in 53 files** are under the ceiling, not converted. Each guards a different behaviour: the builder's steps, the service worker, the walk check. Finishing means one behavioural test per assertion, lowering the ceiling file by file. The harness and the fixture corpus load make that possible for the pages and components. The builder's ones need its commands run on fixtures, as `r78i-build` already does.
- WebKit and Firefox runs of the changed specs are the owner's PC's (above); this machine has Chromium only.
