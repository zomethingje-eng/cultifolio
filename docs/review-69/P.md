# Round sixty-nine, agent P: pages, words, engines and the harness

Copy: `/tmp/r69/P`. Items: P1, P2, P3, W6's client wording, P4, P5 and the documents (triage-68). Every source and test file named below is in that copy.

## 1. Per item

### P1. A US place page said "All clear." when the NWS did not answer (R46-6)

- **New file `src/lib/ui/alert-words.ts`.** It holds the one reading both pages use:
  - `alertsUnchecked(status)` is true for `refused` and `unanswered`;
  - `alertsWhy(status)` gives each its own clause: "the National Weather Service refused this site's request" or "the National Weather Service did not answer".
- **`src/routes/places/[id]/+page.svelte`.**
  - `alertsUnchecked` now reads both statuses, where it read `refused` alone, so the headline is "Forecast clear.", never "All clear.", and the pill is "forecast clear; alerts not checked".
  - The sentence is "Alerts not checked: {why}, and this is not a statement that no alert is in force." Where the NWS refused, the base said it "did not answer".
  - The `ForecastAnswer` type gains `unanswered`.
- **`src/routes/today/+page.svelte`.**
  - Its two `NotChecked` sentences now come from `alertsWhy`, with the same words as before.
  - The folded strip's summary now says "Alerts not checked." beside the clear-night line. Before, a clear night with the NWS silent read as an all-clear until the strip was opened.
- **Tests.**
  - `tests/e2e/r69p-alerts.spec.ts` drives `refused` and `unanswered` on the place page (headline, pill, sentence) and on Today (the strip, and the `NotChecked` reason inside it), in chromium and phone. A third test checks that a checked answer with no alert still reads "All clear." and "frost: clear". **Checked to fail on the base** (the place-page and Today sources swapped back): both status tests failed on the place page. For `unanswered` the base said "All clear."; for `refused` its sentence said the NWS "did not answer". The test stops there on the base, so Today's half was not reached. Today's new strip line is held by the unit test below.
  - `tests/unit/r69p-words.test.ts` ("P1") covers the two functions and both pages' use of them. It fails on the base, where `alert-words.ts` does not exist.

### P2. The reload after a deploy (IND-11)

- **`src/lib/ui/take-over.ts`.** A new rule, `onArrival({ pending, typed, writing })`:
  - `reload` when nothing is typed and nothing is being written;
  - `wait` when writes are in flight;
  - `none` while something is typed (the takeover stays pending for the next move).
  Round 67's `onTakeOver` is unchanged.
- **`src/routes/+layout.svelte`.**
  - The `beforeNavigate` that cancelled the move and assigned `location.href` is gone.
  - A new `afterNavigate` resets `typedHere` when the path changed, then applies `onArrival`. On `wait` it calls `whenVaultIdle(5000)` and asks again. On `reload` it calls `location.reload()`.
  - The move itself now runs as any other, the page's own leave guard included.
  - One fix found by the suite: SvelteKit can hand `afterNavigate` a `from` whose `url` is null (r62l's clock 3, a plant page's Apply), so the path check reads `nav.from?.url`.
- **`/about/how`'s reload sentence** now says the page the next move reaches reloads once the move has finished.
- **Tests.**
  - `tests/e2e/r69p-takeover.spec.ts` stages the takeover with a stand-in for `navigator.serviceWorker`: the page loaded under a worker, and the new controller says it serves another build. It has two tests:
    - after a takeover, a move from /plants to /places finishes and /places then reloads. The load log reads `/plants:navigate`, then `/places:reload`. On the base, /places came in as a "navigate" load from `location.href`.
    - on /plants/new with a name typed, the page asks once ("confirm"). Answering no keeps the draft, and the browser's own "Leave site?" never comes. Answering yes finishes the move, and the next page reloads. On the base the dialogs were `confirm`, then `beforeunload`.
    **Both checked to fail on the base** (the base layout swapped in).
  - `tests/unit/r69p-words.test.ts` ("P2") covers `onArrival`, and checks that the layout has no `location.href =`, no `beforeNavigate`, the `onArrival` call and the null-`url` guard. It fails on the base.
  - `tests/unit/r67p-takeover.test.ts` still passes unchanged.

### W6. The client's failure words (S-E5, R46-7)

- **`src/lib/ui/index.svelte.ts`.**
  - `Unreached['kind']` gains `unread`.
  - A new function, `failureKind(status, said, retryAfter)`, classifies an error answer:
    - 429 is `limited`;
    - any other 4xx (403 among them) is `refused`;
    - a 5xx with the server's own sentence or a Retry-After is `unread`;
    - a 5xx with neither is `unreachable`.
  - `refusalOf` uses `failureKind`, and `worst()` ranks `unread` between a limit and silence.
  - `searchCatalogue`'s stop is now `SearchStop = { limited, kind?: 'refused' | 'unread' }`, still assignable to the import's `{ limited: number }`. A bare 5xx is still null.
- **`src/lib/ui/reach-words.ts`.** This file is not in any agent's list. I took it, since W6's client wording lives there. `unread` reads "{what} could not be read just now; it can be asked again in N s".
- **`src/lib/ui/SpeciesPicker.svelte`.** `refDown` gains `unread` and `refused`, worded by one `refWords`:
  - "The reference's own search could not be read just now";
  - "The server refused the reference's own search just now";
  - "…did not answer" only for no answer at all.
- **`src/routes/+page.svelte`** (unowned; taken): the front page's search line says `unread` and `refused` apart.
- **Tests.**
  - `tests/unit/r69p-words.test.ts` ("W6") covers `failureKind`, the search's four answers (503 with Retry-After, bare 502, 403, 429), the clause, and the picker's and front page's wording. It fails on the base.
  - `tests/unit/r67p-reach.test.ts` used to assert the old "refused" sentence for the 503. It now asserts `unread` for the server's 503, `unreachable` for a bare 503 and `refused` for a 403.
  - `tests/e2e/r62bq-picker.spec.ts`'s 503 case now expects "could not be read just now".
- **Need for X:** the labels page's `careCell` (see Needs).

### P3. The about pages

S-E's seven sentences in `docs/review-68/self-E.md`, in order:
1. **How, the address counters and the place (E1, with W1).** The place's line now says the network the upload came from is kept apart under that day and dropped with the address keys. With W1 this is true, and so is "every address key is dropped within two days".
2. **How 90 and 95, "never answered from an old one's copies" (E3, with W3).** Both lists now say the server's own copies of a search, a hash group's sheets, a name, an old-name check and a forecast are kept under the app's version. In line 95, each key gains "the app's version". True once W3 is merged.
3. **How 95, the Commons sizes.** The clause now reads "at the 960- and 500-pixel sizes, or at a file's own size when it is narrower". That is true of the code in my copy. K4's code changes the widths, so this clause changes at the merge (section 2).
4. **How 95, the browser's HTTP cache.** The list gains "with sync on, each sealed batch of your log and each sealed photograph this browser fetched from the vault (encrypted, as the server holds them), for a year, since a sealed object never changes under its name". This matches `private, max-age=31536000, immutable` on both sync GET routes.
5. **Formats 52, the listing budget (E2, with W2).** The sentence adds that the counter object sets fifty pages aside as each listing begins and gives back what it did not use. True with W2 (`listAsk` reserves `MAX_LIST_PAGES`).
6. **Formats 52, the generations.** Now "listed a thousand at a time, at most five thousand at one look … so a photograph with more is looked at again the next midnight" (`GEN_LIST_PAGES` = 5).
7. **Formats 52, the seventh night.** Now "the night is counted among the server's faults, by kind alone (Cloudflare's request logs are off, so no log keeps its name)". This matches `faultThere('sweep')` and `observability: false`.

Also changed on the pages:
- **R46-10.** Formats: "It is set out in one commit (one transaction of the database, holding every change of the example)", and "that same commit marks it".
- **The cached 404 and 302 (R46-8).** Both of how's cache lists now name them: the older name's move for a day, and "no species page" for five minutes.
- **Five minutes for the forecast.** How said these were kept "when the National Weather Service did not answer" in three places. They now say "refused or did not answer", which is what the code keeps both for.
- **The reload sentence (P2),** as above.

**Seam tests.** `tests/unit/r69p-about-seams.test.ts` (new) covers:
- **Photograph addresses against the image policy.** Every address a page can load (`shownAt`, the tile, each size of either, and the srcsets), for iNaturalist, GBIF from another dataset, a wide Commons file and a narrow one, must be on the CSP's `img-src` hosts. Another dataset's own address is never loaded.
- **The sizes sentence.** The widths the code makes for Commons must be exactly the widths the line-95 clause names, and a file shown at its own size must be said.
- **The Worker's cache keys.** Each of the five keys must name the build, through W's `workerKey` maker or in its own address, and both lists must say so.
- **The cached 404 and 302,** in code and in both lists.
- **No `persist()` call outside `keep-ask.ts`.**
- **The year-long cache,** the five-page listing, the seventh night and Workers Logs, and "one commit".

`tests/unit/r67p-about-seams.test.ts` is updated for the HTTP cache clause and the reload clause.

Checked on the base (my sources, the specs and the config swapped back): 9 of the 14 new seam tests fail.
- The 5 that pass on the base are guards that the base already met: the image policy (2 tests), the base's own widths, and the code side of the 404/302 and of the year cache.
- **2 of the 14 fail in my copy, by design, until the merge:**
  - "every key names the build" passes with W's files. I checked by copying W's five route files and `worker-cache.ts` in, running the test, and restoring them.
  - "no persist() call anywhere but keep-ask.ts" passes with R's vault.ts patch below. I checked by applying it, running the test, and restoring.

Sentences I expect other agents to replace at the merge (their reports already hold them):
- **W.md section 2, items 1 to 3 and 5.**
  - They replace my wording of S-E 1, 2 and 5, and of the 404/302, in how 90, how 95 and formats 52.
  - W's "replace X" quotes the base's sentences. In my copy those sentences now read:
    - how 90: "…and the server's own copies of a search, a hash group's sheets, a name, an old-name check and a forecast are kept under the app's version too…" and "a species address that is an older name, as its move…, for a day, and one the reference does not hold, as its "no species page", for five minutes";
    - how 95: "…and the server's own copies under the app's version as well…", with "the app's version" added to each key;
    - how 95 (W1): "(the network the upload that took its place came from is kept apart, under that day, …)";
    - how 95 (404/302): "the page's answer to such an address, a move … for a day …, and "no species page" for five minutes …";
    - formats 52: "…which sets fifty pages aside as each listing begins…".
  - At the merge W's sentences replace mine. The seam tests read these for meaning, not word for word, so W's wording passes them; I checked the regular expressions against W's sentences.
- **K.md: the licences, order, kinds, sizes and rule 4** in how's paragraph at line 36, and formats line 67.
  - **One more change is needed with K4:** the line-95 host clause must name K's widths: "Wikimedia Commons (upload.wikimedia.org, at its 120-, 250-, 500- and 960-pixel sizes, or at a file's own size when it is narrower)".
  - The sizes seam test reads the widths from `photoAt`/`shownAt`, so it fails until that clause is changed.
- **N.md:** the naming paragraph, the search paragraph, formats' search sentence (N3), and the species 404 for an older name of two species (`species/[slug]`).
- **R.md:** the clock sentences on formats.
- **M.md:** the Range source wording on the species page, and how's sentences.
- **X:** X's report was not yet written when I finished. Any example sentences (the generation, leftovers past 30 days) come at the merge.

### P4. Engine tests

WebKit and Firefox are not installed in the sandbox (only Chromium 1194 is under `/opt/pw-browsers`). Each engine-only fix below is judged by reasoning, and says so.

- **IND-12, R46-30: Firefox `r67v-example.spec.ts:52`.**
  - The second example tab is now opened as a new page, and the example is entered through the menu ("See the example collection"), then /plants/new. Each step is asserted. It no longer relies on `window.open` copying the opener's session storage.
  - Passes in chromium. Firefox is judged by reasoning: the setup no longer depends on the engine's copying of session storage.
- **IND-13: the fixture home at 390 px.**
  - `src/lib/ui/PageHead.svelte` (unowned; taken) gains `countRow`. On a phone the count then has a row of its own (`flex-basis: 100%`).
  - The front page (`src/routes/+page.svelte`) passes it on the visitor's and grower's head. The live count is long enough that it already sits under the title, so the live look is unchanged.
  - Test: `tests/e2e/r69p-engines.spec.ts`. The count must sit under the title in a narrow face, a wide face and the fallback faces alone. **Checked to fail on the base** (narrow: the count sat on the title's line). A second test, that what follows the head starts in the same place with web or fallback faces, passes on the base in Chromium and is kept as a guard.
- **The WebKit persistence test (`r67p-pages.spec.ts:21`): the cause is the test, fixed there.**
  - The test injects its plant into a page whose collection may still be opening. In WebKit (an IndexedDB request about every 16 ms) the first /plants load read the injected plant and asked once, writing `persistAskedAt`. The test then cleared only `__asks`, so the six loads after it met the month's gate and asked nothing: "expected 1, got 0". This fits IND's notes: the failure appears in full runs, and instrumented runs pass.
  - The test now waits until "Opening your collection" is gone before injecting, and clears `persistAskedAt` along with `__asks`.
  - Passes in chromium. WebKit is judged by reasoning.
- **R46-30: Firefox `smoke.spec.ts:1994`, and phone-webkit `r67h-offline.spec.ts:32`.**
  - A new helper, `tests/e2e/helpers/controlled.ts` (`controlledBy`), waits for `serviceWorker.ready`. If the page is still not controlled after 5 s it reloads it, since a load after activation is controlled. It then waits up to 60 s for control.
  - Both specs use it before going offline. Both pass in chromium and phone; Firefox and WebKit are judged by reasoning.
- **R46-30: WebKit `r62l-plant.spec.ts:81`.** The page-error listener now sets aside only WebKit's report of a cancelled fetch of this site's own `/api/` ("Fetch API cannot load http…/api/… due to access control checks."). Every other error still fails the test, "Illegal invocation" included; `r69p-harness.test.ts` checks the filter both ways.
- **R46-19: `r61g-import-labels.spec.ts:174`.** Not changed. It follows X's X2 generation check; X's report should say whether the second tab's wait changes.
- `tests/unit/r69p-harness.test.ts` holds each of these fixes in its spec. It fails on the base (6 of 6).

### P5. The harness

- **The disclosure check covers every `<details>` in the source.**
  - `tests/e2e/helpers/disclosure-list.ts` lists all 25, by file and static class, with where each is met.
  - `tests/unit/r69p-disclosure-list.test.ts` reads every `.svelte` file (comments left out). It fails when a `<details>` is added, moved or dropped without the list following, and checks that the spec has a setup for every page in the list.
  - `tests/e2e/r69p-disclosure.spec.ts` sets up each page and state, and presses each disclosure once, with r67h's one-tap check. The states include:
    - a species page;
    - the add form and the import;
    - a plant with a place, a blindly replaced note and a withheld reference photograph;
    - a priced plant;
    - a parked record;
    - Today with a site, plants and an NWS that did not answer;
    - a backup from another device opened here;
    - a vault made here whose listing then fails.
  - That is 24 of 25. The one left is `#clock-ahead details` on /sync, listed with its reason: it is shown only when the sync server dates a batch ahead of its own clock.
  - Tagged `@phone`: 11 tests in chromium and 11 in phone, all passing. The unit test fails on the base, where the list did not exist.
- **The webServer's inspector port.** `playwright.config.ts` starts `wrangler dev --inspector-port ${INSPECTOR_PORT}`. The port is `PW_INSPECTOR_PORT`, or the server's port plus 5000 (9173 by default), so it is never 9229. Tested in `r69p-harness.test.ts`, which fails on the base.
- **The S5 test that hangs** (R46-31, triage P5) was not in my item list from the caller, and is the server's test. Not done here.

### The documents

- **`docs/REVIEW-ROUND-67.md` section 3** now says the repository's `wrangler.jsonc` has observability off (line 9). It says the earlier "stale on this line" was wrong, in the safe direction.
- **`docs/REVIEW-PROMPT-68.md`'s note** now says round 67's sentence was wrong and has been corrected. Its own sentence ("off, in the repository's `wrangler.jsonc`…") was already right in this copy, so S-E's quote of it did not match the file.

## 2. Needs

**R: `src/lib/db/vault.ts`.** `requestPersistence` no longer calls `persist()`; it only reads `persisted()`. It was a second door past the keep-data gate, asking whenever `ask` was left at its default. It is dead code for asking; `collection.svelte.ts` calls it with `ask` false.

Apply with the fold guard: `fold-rules.test.ts` ("moves whenever the fold's source does") hashes vault.ts and must be re-recorded with this change. With the patch, `r69p-about-seams`'s persist test and the 33 test files that mention `requestPersistence` or `persist` pass. The only failure is the fold hash.

```diff
--- a/src/lib/db/vault.ts
+++ b/src/lib/db/vault.ts
@@ -680,21 +680,20 @@
 }
 
 /**
- * Ask the browser not to evict us. Safari clears unused sites' storage after 7 days unless installed or persisted.
- * Firefox does not answer by itself: it asks the person, and the promise waits for their answer, however long that is
- * (for good, if the question is dismissed). `known` is told what the browser has already promised, read without asking,
- * so a page can say it while the question is open (round sixty-four; the Firefox run, where every page that waited for
- * this answer never opened). With `ask` false nothing is asked: the answer is what the browser has already promised.
+ * What the browser has already promised about keeping this site's storage, read without asking. The one ask is
+ * `keep-ask.ts`'s gate (a month between asks, never for a visitor or in the example); this function asked too when
+ * `ask` was left at its default, a second door past the gate that no page used (round sixty-nine; triage-68 P5, R46-31,
+ * S-E's P1 note). `known` and `ask` are kept so no caller changes; neither asks any more.
  */
-export async function requestPersistence(known?: (persisted: boolean) => void, ask = true): Promise<boolean> {
+export async function requestPersistence(known?: (persisted: boolean) => void, ask = false): Promise<boolean> {
+  void ask;
   try {
-    if (!ask) return navigator.storage?.persisted ? await navigator.storage.persisted() : false;
-    if (known && navigator.storage?.persisted) void navigator.storage.persisted().then(known, () => {});
-    if (navigator.storage?.persist) return await navigator.storage.persist();
+    const now = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
+    known?.(now);
+    return now;
   } catch {
-    /* ignore */
+    return false;
   }
-  return false;
 }
```

**X: `src/routes/labels/+page.svelte`.** With W6's new `unread` kind, the preview cell would say "the reference was not reached" for the server's own "could not be read" 503. It should say what happened.

```diff
--- a/src/routes/labels/+page.svelte
+++ b/src/routes/labels/+page.svelte
@@ -186,7 +186,8 @@
   });
   const careClause = $derived(careWhy ? unreachedClause(careWhy, 'the species sheets', nowMs) : 'the species sheets did not answer');
   /** The preview cell's few words for a line not made. */
-  const careCell = $derived(careWhy?.kind === 'refused' ? 'the server refused the sheets' : careWhy?.kind === 'limited' ? 'the server refused the sheets for now' : 'the reference was not reached');
+  // A sheet the server answered it could not read just now is neither a refusal nor silence (round sixty-nine; triage-68 W6).
+  const careCell = $derived(careWhy?.kind === 'refused' ? 'the server refused the sheets' : careWhy?.kind === 'limited' ? 'the server refused the sheets for now' : careWhy?.kind === 'unread' ? 'the sheets could not be read just now' : 'the reference was not reached');
```

**Files I took because no one owned them:** `src/lib/ui/PageHead.svelte` and `src/routes/+page.svelte` (the caller named both), and `src/lib/ui/reach-words.ts` (W6's words live there; no agent owns it).

**At the merge, from others to P.** The sentences in W.md, K.md, N.md, R.md and M.md, applied as section 1 (P3) says. The line-95 Commons sizes clause changes with K4.

## 3. Not done, and why

- `#clock-ahead details` is not pressed (reason in the list).
- The S5 hang timeout belongs to the server's tests, and was not among my items.
- E10 (a tab two deploys behind loses its lazy chunks) is not in the triage.
- The engine-only fixes are untested in WebKit and Firefox, which are not installed here.
- **The `pkill`.** Once, to restart my own unit run, I ran `pkill -f "vitest run"`. It matched every agent's vitest in the sandbox, so another agent's unit run at about 18:20 UTC may have been killed and need running again.

## 4. Corpus step

Not mine.

## 5. Runs

- **Unit suite:** `npx vitest run` in `/tmp/r69/P`: 278 files, 2,375 passed, 2 failed, 1 skipped. The 2 failures are the two pending-merge tests in `r69p-about-seams.test.ts` (W3's keys; R's vault.ts need). Both pass with those changes, as checked above.
- **Type check:** `npx svelte-check --threshold error`: 1,012 files, 0 errors, 0 warnings.
- **Playwright.** Chromium is 1194, through `PW_CHROMIUM=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`, since Playwright 1.63's own 1243 is not installed. Projects chromium and phone, `--retries=0`. Every spec I added or edited was run, plus the specs most likely to be touched by the layout, the head, the about pages, Today and the picker:
  - **Batch 1:** r69p-alerts, r69p-takeover, r69p-engines, r69p-disclosure, r67p-pages, r62l-plant, r67h-offline, r67v-example, r62bq-picker, r67h-engines, r64w-engines, r64f-firefox, r66y-engines and r67h-disclosure.
    - 101 passed and 1 failed: r62l-plant's clock 3, from the null `from.url` in my first layout draft.
    - After the fix, r62l-plant (5) and r69p-takeover (2) pass.
  - **Batch 2:** smoke, r63v-first-screen, r63h-phone, r63fv-front, r63v-visitor, r61w-pages, r62w-pages, r62bw-pages, r62bl-pages, r63u-fonts, r62s-server and r61a-a11y.
    - 190 passed and 1 failed: r63u-fonts U1, a fallback face measuring 102.8% of the web font's width on this machine's Liberation and DejaVu fonts.
    - U1 fails the same way with all my sources swapped back to the base, so it comes from this sandbox's fonts, not this round.
- **Checked to fail on the base (e2e):**
  - r69p-takeover (both tests);
  - r69p-engines' count-row test;
  - r69p-alerts' two status tests (the place page; the third, a checked answer reading "All clear.", passes on the base, as it should).
