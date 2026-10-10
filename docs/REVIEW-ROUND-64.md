# Round sixty-four: Safari's engine and Firefox

Round sixty-four fixes what the first run of the browser suite in WebKit (Safari's engine) and Firefox found. On the owner's PC, `node scripts/predeploy.mjs --browsers=all` ran 946 tests, and 134 first attempts failed: 89 in Firefox, 44 in WebKit and 1 in Chromium. 114 tests failed, 17 of them in both engines. The run never reached its summary, but each failure's `error-context.md` (the error, the call log and the page's accessibility snapshot) was kept in `test-results`, and two agents read every one: W for WebKit, the shared tests and the Chromium flake, F for Firefox. Neither engine can run in the sandbox, so each cause was found from that evidence, the test and the code. Where possible, the engine's behaviour was emulated in Chromium to show the fault on the base build and its absence with the fix.

## 1. Real faults of the site

Ranked by what a person meets.

- **Firefox: every page waited for the "keep data" question (76 failures).**
  - **Cause.** `collection.load()` awaited `navigator.storage.persist()`. Firefox puts "Allow this site to store data in persistent storage?" to the person and answers only when they do; Safari and Chrome answer by themselves. The layout loads the collection on every page, so every visitor was asked on the front page, with nothing of theirs to keep.
  - **What a Firefox user met** until they answered:
    - the add form never took the species it was opened with;
    - a place's Edit link opened nothing;
    - the example collection never opened or was never set out;
    - sync and the frost watch never started;
    - "Kept in this browser only" was never said.
  - **Fix.** The load asks and does not wait. Meanwhile `persisted` is read with `navigator.storage.persisted()`, which asks nothing. The load asks only when there is something to keep, never in the example, and (the lead's decision) at most once a month (`cultifolio.persistAskedAt`), since Firefox asks the person every time.
  - **Shown.** With a `persist()` that never answers, emulated in Chromium, these tests fail on the base build and pass with the fix.
- **WebKit and Firefox: a page reloaded itself in its first seconds, losing what was just typed (27 WebKit failures, 10 Firefox).**
  - **Cause.** The layout reloads a page within its first 4 s when a new service worker takes over. In WebKit this happened on a first visit, which no worker had served. In Firefox it happened on the second page of a first visit, where a second copy of the same build took over.
  - **What a user met.** A place just added vanished, the add form came back empty, and an import's list was lost.
  - **Fix.** A page reloads only when an older worker was serving it and the worker taking over serves a different build. The page asks the new worker its build, inside the browser; nothing is sent. The page asks for an update check only when a worker is in charge and none is installing.
- **WebKit: a photograph could not be added in Safari's Private Browsing.** WebKit refuses a Blob in IndexedDB in an ephemeral session ("Error preparing Blob/File data to be stored in object store"). The vault now keeps the two JPEGs as bytes when a Blob is refused, and reads them back as Blobs.
- **Every browser: an untouched Edit form asked "Leave site?".** The plant page counted an open record form as unsaved, so leaving an Edit that changed nothing asked first. Firefox's navigation showed it; anyone could meet it. The form now asks only when a field differs from how it opened, as the notes editor already did.
- **WebKit: "Leave the example", answered Cancel at "Leave site?", left the button on "Leaving…" for up to 10 s.** The 3 s fallback is now armed in every browser.

## 2. Tests that assumed Chromium, and races

- **Test assumptions:**
  - smoke 871 shared one limit address across every project of a run;
  - smoke 1448 and r62bw's desktop tests relied on `page.route` seeing a service worker's own fetches, which only Chromium allows (the worker is now blocked there);
  - r62g 3 hit Windows' WebKit still holding a temporary folder;
  - r62bg 1's 1.5 s allowance fits only a browser that reports a Cancel;
  - r60 14 needs the person's answer in Firefox, which the test now gives.
- **Races, reading before the page drew:** smoke 1719 (Compare before hydration), r61w "Enter on a number two plants share", and the one Chromium flake, r63l numbering at line 18 (the list read before A95 was drawn). Each now waits for what it reads.

## 3. Not determined: the example collection in WebKit

In WebKit the example collection was never set out in 19 of 20 attempts, even with the service worker blocked. Two imports also stalled ("Adding 150 of 300" for 200 s). The collection had opened, so the hold is after the load: at the seed's Web Lock, at an IndexedDB transaction that never ends, or plain slowness. It passed once, so it depends on timing, and it cannot be reproduced in Chromium. Nothing is changed on a guess. If it still fails after this round's fixes, `PW_PROBE=1 npx playwright test tests/e2e/r64w-probe.spec.ts --project webkit --retries 0` prints the locks held and waiting and whether a read of the database answers.

## 4. Decisions

- **The "keep data" question on a load:** at most once a month (above).
- **The places page's own form check:** unchanged. It still counts an open edit form as unsaved whatever was changed, because no failure pointed at it.

## 5. Tests and runs

**New tests:**
- `r64f-firefox` (7, one engine-neutral for the owner's run) and `r64f-persist` (unit);
- `r64w-engines` and `r64w-probe` (the probe runs only with `PW_PROBE=1`);
- `r64w-leave` and `r64w-photo-bytes` (unit).

The two agents' copies were merged with two overlapping hunks. The persistence fix is F's. The reload guard combines both: an older worker served the page, and the new build differs. `FOLD_RULES` stays 7: the source hash is re-recorded, the behaviour hash holds, and no fold reads either change.

**In the sandbox (Chromium):**
- type check: 945 files, 0 errors;
- unit tests: 2,036 passing and 1 skipped, on 246 files;
- build: passes its bundle check;
- strict browser run (Chromium and the Chromium phone, two workers): 345 tests, 343 passing and 2 skipped, with nothing flaky.

## 6. The second run, and what it settled (round sixty-five)

After the deploy (Worker `8a3fae20-297b-4c1c-a40f-e10f95866014`), the owner ran the suite again on the PC.

- **Chromium strict run:** 343 of 343 first time.
- **WebKit, phone-webkit and Firefox together:** 592 passed, 33 failed (30 WebKit, 3 Firefox) and 6 flaky, in 36 minutes. The first run had 134 failures in two hours. The page reloading itself, the Private Browsing photograph, and Firefox's wait on the "keep data" question did not come up again.

**WebKit's stuck writes were slowness, not a hang.**
- **What failed.** Most of the WebKit failures were writes that seemed never to finish: the example collection at "Setting it out…", an import of 5 plants at "Adding 5 plants…", and a 400-plant backup restore.
- **The diagnosis (agent X).** Playwright's WebKit on Windows answers about one IndexedDB request every 16 ms, against about 0.1 ms in Chromium; the Windows timer tick is the likely cause, though that is unproven. The app spends three requests per change it writes. So the example's one write of 1,297 requests takes about 21 s, against a test budget of 20 s, and an import of 5 plants takes about 310 requests, just over a 5 s budget, while 3 plants pass.
- **The probe confirmed it on the PC.**
  - The example collection set out after 20.9 s, with no lock pending and the database answering.
  - The two imports finished in 4.3 s and 5.4 s.
- **What changed.** Nothing in the app. The tests' waits after a write in WebKit are now set from each write's request count (`tests/e2e/helpers/pace.ts`, at 20 ms a request), the WebKit projects have 60 s per test, and r61g 4 and 5 import 60 rows there instead of 300 and 200.
- **The real-device check.** On the owner's iPhone in Safari, the example collection should set out within a second or two. If it does not, batching the vault's outbox and arrival rows (three requests per change down to one) is the change, and a format change for its own round.

**The rest of the second run.**
- **One real fault, in every engine (smoke 2819).** When a strip tile's photograph failed to load, its credit line went with it, so the strip shrank 21 px and the rows moved under the reader. The line now keeps its height.
- **Test assumptions:**
  - smoke 442's backup dump now reads a photograph kept either as a Blob or as bytes;
  - smoke 924 skips its route check in WebKit, where a route answers before the service worker sees the request;
  - smoke 1324 and 1959 skip in WebKit, whose offline mode under Playwright fails a navigation with "internal error"; a plant page opened in airplane mode on the iPhone replaces them;
  - smoke 1528 blocks the service worker;
  - r60 14 gives Firefox the person's Allow;
  - r62g 7 polls for the example's flag;
  - r62s 63 starts on the grower's own pages.
- **Races:** r60 1 and r61h wait for the name checks to end; smoke 2322 waits for the page and the name check; smoke 901 and r62bg 5 open the "Use my own number" disclosure only while it is shut (`tests/e2e/helpers/disclosure.ts`).
- **Not explained:** two Firefox flakes (an import of 4 plants and a new place, each over 5 s once).

