# V's report, round sixty-seven: the visitor and the example collection

Working copy `/tmp/r67/V`. It now holds only V's own files (and V's tests). Every change needed in another owner's file is in `/tmp/r67/V-needs.md`, with a unified diff for each in `/tmp/r67/V-needs/*.diff`. Each diff was checked with `patch --dry-run` against `/tmp/r67base`. Each was also applied in V's copy while V's tests ran, then taken out again.

## The design in one paragraph (contract C3)

`demo.ts` exports `PAGE_IN_DEMO`, read once as the page loads, the same reading the vault uses for its database. Every "which collection is this page" reading now uses it: settings (`stored.ts`, so the unit and hemisphere cookies too), the persist ask, sync, the hint, the bar, the seed, the leftover sweep and the restore refusals. `inDemo()` stays only for "where does the tab's next page go".

The closed state works like this:
- `markExampleClosed()` puts the page in it. The vault's `blocking` calls it for the example's database (need R-vault), and so does the channel's "closed" (`sampleClosedHere`).
- From then on the page lets go of the open lock and `openVault` refuses with `CLOSED_WORDS`. The page never re-creates the database.
- The bar says "The example collection was closed in another tab. Nothing more is saved on this page; what you typed is still here to copy." with "Go to my own collection". The tab is asked to go home once, not twice.
- The tab's flag and the example's settings go only when the page really goes. That happens at `pagehide`, through the address `?left=sample`, or through the note `cultifolio.sampleClosed`, which app.html's first script now reads. The first page outside also clears any example copies that a page wrote as it went (Labels).
- A Leave called off where the browser does not say so can no longer write as the grower's own, because the page's scope never changed.

## Items

### V1. A visitor's first plant goes into the example (S-A1, R45-1)
- **Changed (V's files):**
  - `src/lib/ui/grow/example.svelte.ts`: `leaveExample(to)`, Leave's question and navigation shared by the bar and every add; `addLeavesExample(event, href)` for any link's `onclick`, which does nothing outside the example.
  - `src/lib/ui/grow/ExampleAddLine.svelte` (new): "A plant / A batch / A place added here joins the example collection and is deleted with it." and "Keep it as my own".
  - `src/lib/ui/grow/DemoBar.svelte`, the words: "…so you can see what this page does. Nothing added here is kept: leaving deletes it." plus "Your own collection is kept apart, as you left it." for a grower.
  - `src/routes/places/+page.svelte`:
    - "New place" leads out.
    - The add form shows the line.
    - `?name=` is read so "Keep it as my own" carries the name.
    - The `#add` capture handler stands aside in the example.
    - A refused add is said under the form.
  - `src/routes/propagation/+page.svelte`: "New batch" and "Start one." lead out.
  - `src/routes/propagation/new/+page.svelte`: the line, and a closed example is not told to free space.
  - `PlantsMenu.svelte` and `PlantsEmpty.svelte`: Import leads out.
  - `src/routes/+page.svelte`: "Add a plant" and the welcome's links lead out.
  - `demo.ts` `leftAddress()`: `/places#add` becomes `/places?left=sample#add`. Before, the parameter landed after the hash.
- **Needs:** P-layout (the top bar's "+"), P-species ("Add one to my plants"), P-plants-new (the line and the button), P-plants (My plants' adds).
- **Decision:** the line shows on every add form in the example, not only once something is typed. Showing it on the first keystroke would move the form under the finger, and the button works either way.
- **Tests:**
  - e2e `r67v V1: inside the example the top bar's "+", "Add one to my plants" and "New place" lead out of it first`.
  - e2e `r67v V1: an add form reached inside the example says so, and "Keep it as my own" leaves with the species typed`.
  - unit `r67v-example` (addLeavesExample, leaveExample's question) and `r67v-scope` (leftAddress).
  - All fail on the base.

### V2. Closing an example tab deletes what the visitor added (R45-2)
- **Changed:**
  - `demo.ts` `dropLeftoverSample(offer)` reads the leftover's own database, read-only and never creating it. It counts the records that arrived after the seed's mark, or after the boundary found from the seed's own changes when the mark is missing.
  - With records, the database is kept and offered once. The offer is noted in that database as `demoOfferedSeq` and is made again only when more has arrived. With none, it is deleted as before.
  - `deleteLeftoverSample()` is the "Delete it".
  - `DemoBar.svelte` draws the offer on the next page outside: "You left an example collection with N records you added or changed there." with Open it and Delete it.
- **Tests:**
  - unit `r67v-leftover` (kept and offered once, counted when the marks were cut off, deleted when empty, Delete it).
  - e2e `r67v V2: an example left by closing its tab…` and `r67v V2: "Delete it"…`.
  - Fail on the base.
- **Known edge:** a Leave whose delete could not run, because the leaving tab's next page went away before another example tab let go, is later offered back. It is a question too many, never a delete without one.

### V3. A page's collection is decided once (IND-1, S-A3, S-A4, S-A10, R45-17)
- **Changed:**
  - `demo.ts`: `PAGE_IN_DEMO`, the closed state, `sampleClosedHere` (flag cleared at `pagehide`, asked once, address `/?left=sample`), `keepSampleOpen` letting go on close, `clearExampleCopies`.
  - `stored.ts`: the page's scope.
  - `app.html`: reads `cultifolio.sampleClosed`.
  - `DemoBar.svelte`: the closed bar.
  - `TrySample.svelte` and `ExampleOffer.svelte`: the page's scope.
  - `+page.svelte`: the hint.
- **Needs:** R-vault (`blocking`, `openVault`, `DB_NAME`), R-collection, R-io, R-replace, S-engine with its test, P-layout, P-GrowLayer, P-IosFirst, P-sync, P-today, and X-svelte-config (app.html's CSP hash). The table of every live `inDemo()` use and its decision is at the head of V-needs.md.
- **Tests:**
  - unit `r67v-scope`: a cancelled Leave without the Navigation API writes no grower setting; Labels' picks are the example's; a database deleted under the page closes it, refuses writes with the sentence and is not re-created; asked once; the lock is let go.
  - unit `r67v-leftover`: app.html's script, run against a stood-in page.
  - e2e `r67v V3: a second example tab told of another tab's Leave…`: IND-1's sequence. The draft stays, Add is refused in words, and `lastLocation`, the persist probe and `persistAfterFirst` are untouched. The database is not re-created. The next page is the grower's own and says why.
  - e2e `r67v V3: a Leave answered Cancel where the browser does not say so…` (S-A4 and R45-17, Navigation API removed).
  - All fail on the base. The IND-1 e2e test fails on the base at its first V1 assertion, earlier than its V3 ones, so the closed state is shown failing on the base by the unit test.
- **Existing tests (V's) brought to the page-scope design:**
  - `r60f-demo`, `r61g-sample`, `r61h-demo-isolation`, `r62g-sample`, `r63fv-example`, `r63fv-seed`, `r63v-example`, and e2e `r63v-visitor` (the bar's words).
  - These tests flipped the flag under an already-loaded module. They now load a page in the example or out of it.

### V4. "Empty" means the whole log and the frost site (S-A2, S-A11, R45-20, IND-3)
- **Changed:**
  - `example.svelte.ts` `ownEmpty()`: no record in the fold (live or removed) and no frost site, plus the held, parked and sync terms as before.
  - `enterExample` notes the same test as `cultifolio.demo.own`, which Leave clears.
  - The bar words come from `hadOwn()`.
- **Need:** R-collection `recordCount`. Until it lands, the count falls back to the changes the page's load folded, which is never smaller.
- **About need:** `/about/how` must list `cultifolio.demo.own`. Without it `r62h-storage-keys-by-store` fails.
- **Tests:**
  - unit `r67v-example` (removed plant, notes or scheme as a record; frost site; the bar's note).
  - e2e `r67v V4` ×4 (frost site, species notes, removed plant, numbering scheme) and the places-only grower's bar (S-A11).
  - All fail on the base.

### V5. The seed is one atomic thing (S-A7, IND-6, R45-16, S-E1)
- **Changed in `demo-seed.ts`:**
  - The commit carries `{ meta: { demoSeeded: true }, markLast: 'demoSeedSeq' }` (C1).
  - `seedState` reads the log. A seed whose mark is missing is marked from its own changes. A seeded flag over an empty log (a commit that failed after the flag) is seeded again. All plants removed is never seeded twice.
  - Without Web Locks, the seed is claimed in one `updateMeta` transaction. The claim lapses after a minute and is given back on failure, so a failed seed stays retryable.
  - `collection.rebuild()` after the seed writes the fold snapshot (S-E1).
- **Changed in `demo.ts`:**
  - `seedLast`: the end of the seed's pot-up line as its commit wrote it, the one pot-up whose plants all carry the seed's tag.
  - `sampleEdits` counts records by arrival number above the mark, whatever their stamps.
- **C1 status:** R's `putWith` does not take the sixth argument in V's copy yet. `svelte-check` reports that one error. Until C1 lands, `seedState` writes the mark right after the commit, from the seed's own last change. The number is the same, but the write is not atomic until C1.
- **Tests:**
  - unit `r67v-seed`: `seedLast`; repair; an edit with an older stamp still counted; K2; a flag over an empty log; the C1 argument and the rebuild through a stood-in collection; no-locks failure retryable; no-locks claim.
  - e2e `r67v V5`: mark and seeded flag present after the seed, the snapshot at or past the mark, marks deleted then repaired to the same number, not seeded twice, Leave asks after one watering.
  - Fail on the base.

### V6. `?left=sample` (S-A5)
- **Changed:**
  - `app.html`: the address takes the tab out of the example (`sampleOut`) and no longer marks the example for deletion. Only Leave's own `sampleLeft` does.
  - `finishLeaving` deletes under the open lock. It waits for the told tabs to let go and says "held up" after 10 s while it goes on waiting.
- **Tests:**
  - unit `r67v-leftover`: app.html's script; finishLeaving waits for the lock, then deletes.
  - e2e `r67v V6: a copied "?left=sample" link opened beside an example tab deletes nothing`.
  - Fail on the base.

### V7. No calendar, no spreadsheet, no backup state in the example (R45-3, S-F9)
- **Changed:** `CalendarExport.svelte` is not drawn in the example. `PlantsMenu.svelte` offers no spreadsheet there, and the import item says it leaves the example.
- **Needs:** P-Today, where "Kept on this device…" becomes "The example collection is kept nowhere: it is deleted when you leave it.", with no link. P-plants does the same for My plants' keep line.
- **Test:** e2e `r67v V7, V8…` fails on the base.

### V8. The example's frost line
- **Needs:** P-today (Today's frost section) and P-Today (the front page's line). The example says it has no site of its own and where yours is set once you leave, with no "Use my location". `r62ba-words` is updated in P-test-r62ba-words.
- **Test:** the same e2e test.

### V9. The welcome's lead on a phone (R45-4)
- **Changed:** `+page.svelte`: "Grow cacti, succulents or bulbs?".
- **Need:** H-smoke, the line in smoke's first-run test.
- **Test:** e2e `r67v V9` checks the words, and that a whole catalogue row stays above the tab bar at 375×548, 390×664 and 360×640. It fails on the base (the words).

### V10. A returning visitor's own line from the server (R45-8)
- **Changed:** `+page.svelte`. "Keep a record of your plants…" is drawn for every visitor from the server and shown before first paint by `html[data-welcomed]`.
- **Test:** e2e `r67v V10`. The line is in the server's HTML and the layout shift is under 0.01. It fails on the base (not in the HTML).

## How the base failures were shown
- **Unit:** V's sources were set back to `/tmp/r67base` in V's copy, with the tests kept. All 33 tests in the four `r67v-*` files were run: 29 fail.
  - The 4 that pass on the base: three by design (`r67v-leftover`'s empty leftover, the address-only `finishLeaving` and the ordinary load; the base was already right there) and the immediate delete with no other tab open.
  - The failures that are not missing exports are assertion failures on the behaviour: the example's place written as the grower's `lastLocation`; the grower's `labelsPicked`; asked twice; the leftover deleted with the visitor's plant; `sampleLeft` set from the address; the delete not waiting for the lock; and so on.
- **E2e:** the base was built in V's copy and `tests/e2e/r67v-example.spec.ts` run against it: 16 of 16 fail. V's version was then restored from a tar taken just before.

## Runs (2 cores, shared)
- **Unit, with every need applied (one file at a time):** r67v-scope 7/7, r67v-seed 9/9, r67v-leftover 10/10, r67v-example 7/7, r60f-demo 4/4, r61g-sample 8/8, r61h-demo-isolation 2/2, r62bg-sample 7/7, r62g-sample 7/7, r62h-a41-sample-lock 1/1, r62h-storage-keys-by-store 5/5, r63fv-example 12/12, r63fv-seed 2/2, r63v-example 5/5, r64w-leave 2/2, r61h-csp-hash 1/1, r62ba-words 6/6, r62bw-words 41/41, formats-doc 6/6, r62w-about-seams 32/32, r61w-about-seams 9/9, vault-store 13/13, collection-store 28/28, r61g-layout-bundle 1/1, r60x-pages 13/13, r62h-a41-collection 4/4, r61l-engine 8/8, r62h-sample-staging 2/2.
- **Unit, in V's copy as left (other owners' files at the base), checked:** three tests fail until their needs are applied, as expected:
  - `r61h-csp-hash`, until X-svelte-config;
  - `r62h-storage-keys-by-store` (the new `cultifolio.demo.own`), until P-about-how;
  - `r67v-scope`'s "another tab's Leave deletes the database…", until R-vault, the vault half of C3.
  The rest of the `r67v-*` files, and `r60f-demo`, `r61g-sample`, `r63fv-seed` and `r62g-sample`, pass.
- **svelte-check `--threshold error`, with the needs applied:** 958 files, 1 error, `src/lib/ui/grow/demo-seed.ts:156` "Expected 3-5 arguments, but got 6": the C1 call. It goes once R's `putWith` takes `opts`.
- **E2e (Chromium, port 4211, PW_REUSE), with the needs applied:**
  - r67v-example.spec.ts: 16/16.
  - Regression set, all pass: r63v-visitor (11), r63fv-guard (4), r60 11 and 12, r61g 6 and 7, r62bg 1, r62g 7 and 8, r62h-harness's sample test, r62a's "grower in the sample" test, and smoke's first-run test.
  - r63v "on a desktop" timed out once under load and passed alone.
- **E2e change made in this round:** r61g 6 failed until the first page outside cleared the example copies that Labels writes as it goes (now `clearExampleCopies`).

## Notes for the lead
- The about-page sentence changes are in V-needs.md section 14 (P's to apply). Both diffs apply to the base, and the seam and words tests pass with them.
- The scratchpad directory is shared by the six agents. Another agent's files appeared in `scratchpad/needs/`, so V's working files were moved to `scratchpad/V67/`. The diffs in `/tmp/r67/V-needs/` are V's own.
- **Not V's items, not done:**
  - S-A6: the offer beside an open Places form; Places' `hold` still draws it.
  - S-A8: "busy" across tabs.
  - S-A9: the bar at 320 px with 200% text.
