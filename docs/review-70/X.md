# Round seventy, agent X: the example collection

Items X1 to X4 of `docs/REVIEW-TRIAGE-69.md` (S-D1, S-D6, S-D7a to D7d, IND-6, IND-7), and tests for the survivors of S-D's mutation run in my area (MX6, MX20, MX21, MX23, MX25; MX18 and MX35 through the mended r69x Keep test).

## Done

**X1. The example tab takes the "open" lock in its first script (S-D1).** `app.html`'s first script, when it sets `data-demo`, asks for `cultifolio-sample-open` in shared mode before anything else runs, and keeps the hold in `window.__sampleOpen` (`{ r, done, failed }`). `keepSampleOpen` (`db/demo.ts`) now takes that hold over rather than asking for a second; `markExampleClosed` lets it go when the example closes before the bar is drawn. Only a page whose first script took nothing (no Web Locks, a refused request) asks as before. Two departures from the letter of the decision, both to keep it correct:
- Taken over, not "let go once the bar holds its own": a second shared request queues behind an exclusive one already waiting (`finishLeaving` after another tab's Leave), which waits behind the first hold, so neither would ever be granted.
- At the bar's mount the tab also compares its generation, as the first script does: a Leave in another tab between the first script and the mount sent its word on the channel before this page listened, and the page would have held the lock for good in an example already left. It now goes into the closed state and lets go.

The CSP hash in `svelte.config.js` changes with the script (see Needs).

Tests: `tests/unit/r70x-lock.test.ts` runs app.html's script from the file over a shared lock manager and fake IndexedDB, with a session storage per tab. On the base:
- "another tab's page neither offers nor deletes it…": `expected undefined to be 'shared'`.
- "with nothing of the visitor's in it…": `expected true to be false` (deleted under the loading tab).
- "the bar takes the hold over, asking for no second one…": `expected "request" to not be called at all, but actually been called 1 times`.
- "a delete already queued … waits for the loading tab": `expected 'deleted' to be undefined`.
- Guards: "without Web Locks the first script asks nothing", and MX6 ("Delete it" writes a new generation; fails with the `newGeneration()` taken out of `deleteLeftoverSample`).

`tests/e2e/r70x-example.spec.ts` X1 (the reviewer's reproduction: scripts held 8 s, the other tab reloaded in the gap). On the base: `#example-left` Expected 0, Received 1; and `databases` Received `["cultifolio"]`.

**X2. Keep (S-D7a, IND-6, IND-7).**
- *The containing place.* `CarriedPlace` gains `inside: { name, kind } | null`. `carriedPlace()` (keep-draft) builds it from the place picked (its parent read by id) or from the picker's new place, whose `typed` now names `inside` (`LocationPicker.svelte`). Both add forms' `draftOf` use it. On the grower's side `startPlace()` resolves it: "New…" opens inside the grower's own place of that name (`parentId`). When they have none, it opens at the top level and the picker says "In the example it was inside Greenhouse, which is not one of your places, so it goes at the top level unless you choose one." (`#<id>-was-inside`). A draft is read, never trusted: a non-string name or kind is dropped. One level, by name, as Places already matches its parent.
- *A draft the tab refuses.* `keepAsOwn` returns `'unkept'` when the draft cannot be written, and does nothing else: no hold, no Leave, no navigation. `ExampleAddLine` shows `UNKEPT_WORDS` ("What you typed could not be kept: this browser refused to store it in this tab (a private window, or its storage full). Nothing has changed, and it is all still here.") as an alert under the button.

Tests: `tests/unit/r70x-keep.test.ts`. On the base:
- "stays in the example…": `expected true to be 'unkept'`.
- "the form's line says it": no match.
- "carried with the place it sits inside" and "named in the picker": `carriedPlace is not a function`.
- "opens New… inside…": `startPlace is not a function`.
- "both add forms carry it…": no match.

e2e (r70x-example.spec.ts):
- "Keep carries a new place's containing place" (the grower has their own Greenhouse) fails on the base: Expected "Greenhouse", Received "Top level".
- "the batch form carries its place, and says where it was": `#s-loc-was-inside` not found. Its `#s-loc-new-name` check kills MX20.
- "Keep does not leave the example when the tab's storage refuses the draft": `#example-keep-refused` not found.
- "Places carries the place it goes inside" is a guard for MX21 and passes on both.

**X3. The seed only into an empty log (S-D6).** `seedOnce` (`demo-seed.ts`):
- The early read (`seedState`) now refuses any log that holds changes and none of the seed's (`'other'`). It used to set the seed out over a log holding places or followed species only. It calls the bar's `held` callback.
- The seed's commit carries, in its own transaction, `requireMeta` on `issued:accession` and `issued:sowing` being absent. Every numbered record (a plant, a batch) writes the numbers ledger in its own commit, so a log with neither holds no plant or batch. This works on my side now.
- The commit also passes `requireEmpty: true`, the vault's own test of an empty log, which is R's to add (Needs). Until then, a visitor's place or species alone, added in the claim's window, is still not caught in the transaction.
- A refusal on any key other than the seed's mark or the claim calls `held`.
- `DemoBar` says, after "Nothing added here is kept…": "Its own plants and places were not set out, because something had already been added to it." (`#demo-unseeded`, a status).

Tests: `tests/unit/r70x-seed.test.ts`, the reviewer's two-tab gate harness. On the base, four fail with `expected true to be false` (lines 78, 92, 105, 117): the plant, the batch, the place in the claim's window, and a place read before the commit. "Nor over a place the visitor made" fails in my copy until R's need is applied. I applied the need temporarily and all five passed, with r69x-seed and r69r-vault, then reverted it. The empty example is a guard.

Two older tests changed with the rule:
- `r67v-seed` pins the commit's options; the new conditions are added.
- `r60f-demo`'s "fills an empty sample once" ran on a log holding a plant added and removed by its previous case. It now starts from an empty log, which is what it names.

**X4. The smaller points (S-D7b to D7d).**
- *b.* `ForeignLabel`'s "add one to my plants" goes through `addLeavesExample` to the same address (`id="foreign-add"`). Unit source check in r70x-keep (fails on the base, no match). e2e: on the base, `html[data-demo]` stays attached after the click.
- *c.* r69x's Keep test now checks each address's path, query and fragment with `left` taken off, and types the price "42.50", which no base-36 token can hold. On port 4306 the base test cannot be made to fail by the port, which holds no "42". The failure the reviewer saw at 4204 is the one this removes.
- *d.* MX25 guard in r70x-keep: a press made while the collection never settles, after the 10 s time-out, notes "?" and `hadOwn()` is null. With the hint set, it notes "1". Under the mutation (`'?'` to `'0'`) it fails. MX23's guard (an unreadable change is "not empty") is there too, and fails under its mutation.

**Runs.**
- Full unit suite, one worker: 310 files passed, one test failing (the place case above, pending R).
- `tsc` and `svelte-check`: nothing.
- Chromium, `--retries=0`: r70x and r69x specs, 13 passed; the X1 browser tests passed three times over (6 of 6); r67v-example, r63v-visitor, r63fv-guard and r60-grow, 46 passed; smoke, r62h-harness and r61g-import-labels, 129 passed.
- Runs at the machine's peak load (under 1 GB free) crashed Chromium before my code was reached, and are not counted.

## Needs

**R, `src/lib/db/vault.ts` and `src/lib/db/collection.svelte.ts`: `requireEmpty`** (for X3). Tested in my copy, then reverted.
- In `StoreOpts`, after `requireMeta`:
  ```ts
  /** The log must hold no change for the write to be made, read in its own transaction (round seventy, for triage-69 X3; S-D6: the example's seed is set out only into an empty log). One that holds any: nothing is written, and the write throws `MetaRefusedError('changes')`. */
  requireEmpty?: boolean;
  ```
- In `storeIn`, after the `requireMeta` loop:
  ```ts
  if (opts.requireEmpty && (await ch.count()) > 0) { tx.abort(); await tx.done.catch(() => {}); throw new MetaRefusedError('changes'); }
  ```
- `appendChanges`' `opts` is `Pick<StoreOpts, 'meta' | 'markLast' | 'requireMeta' | 'requireEmpty'>`.
- In `collection.svelte.ts`, `commit`'s `opts` type, `putWith`'s second overload and its implementation each gain `requireEmpty?: boolean`. The object is already passed through unchanged.
- Why: without it the seed's own transaction cannot see a log holding only a place, a followed species or a setting. `demo-seed.ts` passes the flag already, in a spread, so it compiles before and after.

**Nobody's file, `svelte.config.js`.** The `script-src` hash of app.html's inline script is now `sha256-YOt0n8CuKithg1X+myLwz3MwiMBeb22whkraRJOLvoY=`, in place of `sha256-j0AYh1lXu4y705OyWj72fNCvjAN5a9vP0JQCj6kb1ms=`. It is in my diff: no row owns the file, the hash follows `app.html`, which is mine, and the browser refuses the script without it (`r61h-csp-hash` checks the pair). If another agent changes app.html's script, the hash must be recomputed after both.

**P, `/about/formats` (`#sample`).**
1. Untrue now: "Each tab in the example holds a browser lock named `cultifolio-sample-open`; a page outside the example deletes an example database that no tab holds and that holds nothing you added or changed, so one left by a tab closed without leaving does not come back stale."
   Replace with: "Each tab in the example holds a browser lock named `cultifolio-sample-open`, taken by the first script of each of its pages before anything else runs, so a tab that is only reloading still holds it; a page outside the example deletes an example database that no tab holds and that holds nothing you added or changed, so one left by a tab closed without leaving does not come back stale."
2. Untrue now: "…and the commit is refused, setting out nothing, when the example already holds a seed's mark or, without the locks, when the claim is no longer that tab's;"
   Replace with (once R's need is applied): "…and the commit is refused, setting out nothing, when the example already holds a seed's mark, when its log already holds anything of yours (read in that same transaction), or, without the locks, when the claim is no longer that tab's; an example that already holds records of yours is not set out over, and its bar says so;"
   Without R's need, write "when its log already holds a plant or a batch of yours" instead.
3. Untrue now: "…and the place by its name and kind (your own place of that name is picked, or the place picker's New… opens with it filled in); the form's own "Leave site?" is not asked."
   Replace with: "…and the place by its name and kind, with the name and kind of the place it sits inside (your own place of that name is picked; otherwise the place picker's New… opens with it filled in, inside your own place of the containing place's name, or at the top level with a line saying where it was in the example); the form's own "Leave site?" is not asked. When the tab's storage refuses to keep what was typed, Keep it as my own does not leave the example: it says so, and the form stays as it was."

**P, `/about/how`.** Untrue now: "`cultifolio.keepDraft` (what an add form inside the example held when Keep it as my own was pressed, every field and the place's name and kind, read once by the same form in your own collection and taken off)".
Replace with: "`cultifolio.keepDraft` (what an add form inside the example held when Keep it as my own was pressed, every field, the place's name and kind and the name and kind of the place it sits inside, read once by the same form in your own collection and taken off)".

## The corpus step

None in this area.

## Measured

Nothing over real data: the example reads no source. The reviewer's slow-phone reproduction (scripts held 8 s) no longer offers or deletes a reloading tab's example. WebKit and Firefox were not run (neither is here).

## Not done, and the decisions I departed from

- **X1:** the hold is taken over rather than let go once the bar holds its own, and the bar's mount reads the generation (reasons above).
- **X3:** the same-transaction test of an empty log is complete only with R's `requireEmpty`. Until then, my side covers plants and batches through the numbers ledger, which relies on the vault's key names `issued:accession` and `issued:sowing` (not exported). The early read now refuses any log that is not the seed's, so a log holding only places is no longer set out over. Round sixty-seven allowed that, and the triage's "anything in it" overrides it.
- **X2:** the containing place is carried one level, by name. When the grower has no place of that name, Keep does not make one: it would write a record nobody asked for. The picker says where it was.
- **Mutation survivors not mine:** MX30 (the vault's `absent`) and the MR ones are R's.
- **Old tests edited:** `r60f-demo.test.ts` and `r67v-seed.test.ts` are in no row. Both test the seed, and their changes are the rule's (above).

## Second pass (R47)

**X5. Keep when the next page is slow (R47-17).** `keepAsOwn` no longer drops the draft when the Leave is called off. Leave's 10-second fallback decides the tab stayed while a slow next page is still coming; that page then loaded at `/plants/new?kept=1` with an empty form, and the example was deleted. Now the called-off path only puts the form's guard back. The draft stays in the tab, where only its own form reads it, at an address saying one is waiting, once; a later Keep writes over it. A Leave the visitor declines still drops it, since no page follows. R47-17's second point (a containing place the grower lacks, dropped without a word) was already done in X2: the picker says where it was.

Tests:
- `r70x-keep` "a Leave the page decides was called off … keeps the draft". On the base: `SyntaxError: "undefined" is not valid JSON` (the draft is gone). The declined Leave is a guard.
- e2e "Keep while the next page takes 12 s carries the form all the same", with the document held 12 s. On the base: `#species-name` Expected "Copiapoa cinerea", Received "".

**R47-19's reverts in my area.**
- *X2, an edit after an answered offer:* `r70x-lock` "a leftover answered Not now is offered again once the visitor has changed it since". A guard: it passes on the base and fails with `offered >= last` taken out.
- *X5, `ownEmpty` with malformed > 0:* this was already in `r70x-keep` as the MX23 guard.

**P's need 2: `reserve` on the batch form's species field.** Needed, and done in `propagation/new` (my file). In a desktop window, where the bar is in the page's flow, the name check's words moved "Start batch" down 49.5 px on the base. The e2e test "the batch form's Start batch does not move" fails there (`Received: 49.53125`) and passes with `reserve`.

**Runs.** The r70x and r69x specs, 15 of 15 with `--retries=0`. The changed unit files pass.

**Needs, P, `/about/how`.** This replaces my first-pass replacement for `cultifolio.keepDraft`: "(what an add form inside the example held when Keep it as my own was pressed, every field, the place's name and kind and the name and kind of the place it sits inside, read once by the same form in your own collection, opened by Keep, and taken off)". The old "taken off" read as if a Keep called off took it off too, which it no longer does.
