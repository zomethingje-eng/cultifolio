# Independent review of rounds 62–66 (IND), condensed faithfully

Reviewed `8f2d56c` on Windows, Node 24, fixture and live corpus; WebKit and Firefox run.

1. **Cancelling another tab's closure leaves the example and the real collection in different modes (confirmed).**
   - **Where:** `demo.ts:105` (`sampleClosedHere`), `vault.ts:150` (`blocking`), `stored.ts:49`, `plants/new/+page.svelte:183`.
   - **What happens:**
     - `sampleClosedHere()` removes the mode flag and the example's settings *before* asking for navigation, and has no recovery when that navigation is cancelled.
     - A native "Leave site?" answered Cancel keeps the page and its database choice.
     - The database deletion also reaches `blocking()`, which closes the connection and runs the same uncancellable switch.
     - Later writes can reopen the example DB, but `writeSetting()` now picks the real localStorage.
   - **Reproduction:**
     1. Tab A shows the example's Today. Tab B has the example's Add form open with a draft typed. The real `cultifolio.lastLocation` is set to `private-real-location`.
     2. Leave in A, then dismiss both beforeunload prompts in B. B still shows the banner and the draft, but `cultifolio.demo` is gone.
     3. In B, enter Copiapoa cinerea, name a new place, and press Add. It saves, and the real `cultifolio.lastLocation` is now the ID of the place created in the example.
     4. Reload B. It says "The example collection was closed in another tab. This is your own collection" and "No plant with this number on this device."
   - **Expected:** Cancel must not leave an interactive writer whose database and privacy scope disagree.
   - **Fix:**
     - Add a closed-context state when a peer closes or deletes the DB.
     - Keep the draft available for copying, and disable writes in that context.
     - Clear the mode and settings only when navigation really commits.
     - Handle cancellation on the channel path as well as on `versionchange`.
     - Bind storage scope to the database context this document opened, not to a mutable session flag.
     - Test both the retained draft and the real settings.

2. **The unanswered first-plant persistence request bypasses the monthly limit (confirmed).**
   - **Where:** `GrowLayer.svelte:23–44`, `collection.svelte.ts:58–63,329`.
   - **What happens:** with a `persist()` that never resolves, add the first plant and then reload 3 times. The calls are 1, 3, 4, 5 cumulatively.
   - **Fix:**
     - Share one gate between GrowLayer and the load, and write the request time before calling the browser.
     - Keep "request attempted" separate from "answer announced".
     - Use the corrected clock, or a bounded future-time check, for the gate.

3. **Species notes alone count as an untouched collection (confirmed).**
   - **Where:** `example.svelte.ts:29`, `species-list.ts:17` (`mySpeciesOf` omits an unfollowed taxon that has `myNotes`), `species/[slug]/+page.svelte:205`, `DemoBar.svelte:110`.
   - **What happens:** Today opens the example over the grower's notes, and the bar says "Your own starts when you add a plant."
   - **Fix:** count live taxa with personal notes, a numbering setting and retained removed records, in one shared "empty" predicate.

4. **A double tap on a plant's Move writes two moves (confirmed).**
   - **Where:** `plants/[acc]/+page.svelte:213–220`.
   - **Fix:** set a `movingBusy` guard before the first await, disable the button, and clear it in `finally`. Do the same for the edit-save paths that await `settlePlaces()`.

5. **Move commits the new place in an unrelated, unsaved Edit form (confirmed).**
   - **Where:** `places-pending.ts:15–16`, `LocationPicker.svelte:44–46`.
   - **Reproduction:**
     1. Open Edit and name a new place "Unsaved edit shelf", pressing neither Add place nor Save.
     2. Open Move and name "Move destination", then press Move.
     3. Cancel Edit.
     4. Places lists two places: Move destination (1 plant) and Unsaved edit shelf (0 plants).
   - **Fix:** settle only the pressing form's scope (a scope token per form). Add a test with both forms open.

6. **The seed's metadata is not an atomic boundary of its own commit (confirmed).**
   - **Where:** `demo-seed.ts:123–133`, `demo.ts:121–124`.
   - **What happens:**
     - After the commit, the seed writes `demoSeeded`, then reads ALL change keys and calls their maximum the seed's stamp. A visitor edit that lands in between is folded into the boundary, and Leave then counts 0.
     - Without Web Locks, `demoSeeded` is written *before* the commit. If the commit throws QuotaExceededError, the example is left empty but marked seeded for good.
   - **Fix:**
     - Have the seed commit return its own boundary, and persist the boundary and the seeded mark in the same IndexedDB transaction.
     - Prefer an arrival-number boundary.
     - The no-locks path needs an atomic check-and-seed transaction.

7. **Today describes an explicit refusal as silence (confirmed).**
   - **Where:** `index.svelte.ts:199–211`, `today/+page.svelte:388`, `Today.svelte:164`.
   - **What happens:** a 429 with Retry-After 30 and an error body is shown as "the species sheets did not answer".
   - **Fix:** return a typed failure from the bucket client (kind, safe reason, retry time), and use it on Today and the home summary.

8. **A truncated generation listing drops the sweep mark while stray bytes remain (confirmed).**
   - **Where:** `photogen.ts:64–77` (`unnamedGenerations` reads only the first 100 objects and ignores `truncated` and the cursor), `counters.ts:581,613`.
   - **Reproduction:** 102 old generations, with the pointer at generation 101. The alarm removes 100, leaving 1 stray and the live one, but the `u:<name>` mark is gone.
   - **Fix:** paginate, or return `more` and keep the mark. Also fix the shared R2 stand-in, which slices at the limit but always reports `truncated: false`.

9. **The harness: two server specs spend fixed addresses (confirmed).**
   - **Where:** `tests/e2e/r62s-server.spec.ts:22` and `r62bs-server.spec.ts:17` use `.62` and `.63`, not the helper's per-run addresses. The guard exempts them in `KNOWN` (`tests/unit/r62bh-vault-addresses.test.ts:24`).
   - **What happens:** on a reused server, Firefox gets 429 on creation.
   - **Fix:** use `docAddress()` for both, and remove the `KNOWN` exceptions.

## Other notes from IND

- **Example timing:** the example entry took 21.1 s in Windows WebKit, 1.4 s in Firefox and 2.2 s in Chrome.
- **Tail reads:** first replace the per-key tail reads with bounded bulk reads filtered by the arrival keys, in arrival order, with a range-size fallback.
- **The example's outbox:** the example needs no outbox, since sync is forbidden there. Omitting its outbox puts is a format-preserving reduction.
- **Single clicks:** WebKit's spending test once clicked the More summary and waited 60 s for the hidden price field (`r60-grow.spec.ts:91–92`); it passed on retry. Keep a separate single-click check that records pointer-down/up bounds, focus, scrolling and toggle events.
- **Data quality:** Cestrum nocturnum's live alternate name is "Lady of the night)" (from WoRMS). The audit should flag unmatched punctuation while keeping the sourced spelling.
- **Backup versions:** a nine-way matrix of round 61, 62 and current readers/writers showed no silent field loss.
