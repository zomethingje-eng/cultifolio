# Round seventy: the merge of the agents' code needs

Commit `33156cc` in `(scratch)`, on `a697904`. Twelve files changed. No `/about/how` or `/about/formats` sentence was touched. Only one seam-adjacent test was touched: `r69k-index-seam`, which is not a seam test of the about pages (see the conflicts below). The seam tests, `tests/about-pages.ts` and `formats-doc` are left for P.

## Needs applied

**A for B, `src/lib/dossier/build.ts`.** `wm.summary` now receives `{ name, synonyms: syn.data (the older names as stored), item: ids.wikidata }`. A's Welwitschia build test in `r70a-summary-proof` now passes.

**A for B, `scripts/build-dossiers.ts`.**
- `fillSummaries` prints A's three lines: the proofs by kind, the records that now name another proof, and those taken back.
- The `--fill summaries` usage line is A's.
- The function's comment names round seventy.

**A, `summary-fill.ts`.** `byLead` has been deleted from `SummaryCounts` and from its initialiser. Nothing reads it now.

**A for C, `spellingKey` (-er adjectives).** C had already done this in its second pass (`epithet.ts`). Nothing more was needed.

**C for N, `src/lib/server/dossiers.ts`.** `getDossier` parses with `heldNamesOf(c.idx)`, for both the R2 and the static read. `heldNamesOf` is memoised by the index array. The function's own parameter is already called `held` (it is the `Loaded` corpus), so the local variable is called `names`.

**C for N, second pass, the species page.**
- The lead's `<link rel="preload">` hrefs, its `<source>` and its `<img src>` now use `photoOf(hero, 'medium' | 'large')`.
- The `srcset` attributes stay on `heroSrc`, as C asked.
- The browser specs below pass.

**C for B, `build.ts`.**
- `BuildOptions.held?: HeldNames | null` is added.
- It is passed to `commonsPhotos`, with `key`, and to the final `parseDossier(dossier, o.held)`.

**C for B, `scripts/build-dossiers.ts`, the index in two phases.**
- The photograph part of `indexEntry` is now its own function, `photoFields(d, held)`.
- `scanDossiers` keeps each dossier's `{ key, name, photos }`. After the loop it sets `const held = heldNamesOf(out)`, then sets each entry's `thumb`, `credit` and `photos` again with it. This happens before the nearest climates are added.
- The build's main loop passes `held: heldNamesOf(onDisk)` to `buildDossier`, and uses the same names for its `thisRun` index entries.

**C for B, the CLI.**
- `--fill commons-kind` is now a step (`fillCommonsKindStep`, which is C's code), with its usage line.
- "commons-kind" is added to the `--fill` error.
- The index's names are read through a small `indexHeld()` helper.

**C, unowned and optional, `corpus-run.ts`.** `fillCommonsAll` takes `held` as an optional fourth argument and passes it to `fillCommons`. `--fill commons` passes the index's names. The change is small, it matches the Worker, and an older caller is unaffected.

**C for B, second pass: `specimen` from basisOfRecord.**
- `gbif.media` sets `specimen: true` on an `OccMedia` whose record's basisOfRecord is `PRESERVED_SPECIMEN`.
- `photosFromMedia` (`build.ts`) carries the flag onto the photograph.
- `bulk.ts` needs no change. Its media are admitted only from `HUMAN_OBSERVATION` records (`OccIndex.add`), and served as such.
- Note: the API request also asks only for observation records, so the flag fires only if GBIF returns a preserved specimen anyway. In practice C's herbarium-host rule (`isSpecimenMedia`) carries the stored dossiers.

**B for C, the B7 hook (`photo-kind.ts`, `olderNameIsOwn`).**
- The body now asks B's `ownNames` (`own-names.ts`, imported as `ownNamesRule`) whether the older name is the species' own.
- `heldElsewhere` is read from `HeldNames.accepted` by `spellingKey`, excluding this species' own key. Below species and without the reference's names, the result is true, as before.
- B's rule and C6 give the same answer: an older name is not the species' own when another species holds it as its accepted name.
- C's tests still pass: `r70c-*` and `r69k-commons-kind`, 156 tests.
- C's departure is what results. Nepenthes tenuis on N. dubia and N. amabilis on N. sumagaya are shown (the guard in `r70c-second-pass`), and N. dubia's lead is "Nepenthesdubia1".

**R, `src/lib/db/types.ts`.** `importKeyBare?: string | null` is added after `importKey` in `Accession`, with a comment. `formats-doc` stays red until P lists the field.

**X for R, `requireEmpty`.** R had already applied it (`vault.ts`, `collection.svelte.ts`). I updated X's comment in `demo-seed.ts`, which said "until it is there", to say it is applied.

**X, the CSP hash.** No other agent changed `app.html`'s first script. `r61h-csp-hash` passes with X's hash.

**W and R, `fold-rules.test.ts`.**
- No merge change touched a hashed file.
- The merged tree's hash, `79f99459c73ea51cf04108ef7a5d313d`, is recorded under R's `FOLD_RULES` 8.
- Both behaviour hashes hold.
- W's need said 7. That was written before R's bump, so I recorded the hash under 8, as the brief says.

**W, `smoke.spec.ts`.** This was already settled in the merged commit. P's `limitAddress` mixes in the retry and the repeat, so W's own lines were dropped and `const ip = limitAddress()` stays, as W said to do in that case.

**P, the plant page (`reserve`, `class="wide"`).** Already in the merged commit from P's diff. **P for X, `reserve` on `propagation/new`:** done by X.

## Needs not applied (not code, or not mine)

- Every `/about/how` and `/about/formats` sentence from A, B, C, N, R, X and W.
- P's F148 sentence.
- B's request to replace `r67p-about-seams`.

All of these are P's next step. N had no code needs.

## Conflicts and how I settled them

1. **`r69k-index-seam.test.ts`**, a round-sixty-nine source-shape test, pinned the exact text of the old `shownPhotos` call in `indexEntry` and the old `commonsPhotos` call in `build.ts`. C's needs change both, so the test failed after the merge.
   - It is not an about-pages seam test.
   - I changed its three expectations to the new text (`key: d.key, held`; `photos: shown.length };`; `key, held: o.held`), and added a check that the index is read with `heldNamesOf(out)`. The test still asserts what it was written for: the index uses the read's rule, and GBIF is asked before Commons.
2. **The index's two phases, against the build's `thisRun` entries.** The final index takes this run's entries over the scan's. Those entries are read with `heldNamesOf(onDisk)`, the index before the run. So only a name new to this run is not yet in the names for a slip. C named this as the acceptable alternative. The next `--index` is exact.

## Runs

- `npx tsc --noEmit -p .`: no errors.
- `npx svelte-check --threshold error`: 1,097 files, 0 errors, 0 warnings.
- **Unit suite, whole:** 339 files, 3,153 passed, 1 skipped, 5 failed. One of the five was the `r69k-index-seam` conflict above (two tests), fixed and rerun: 3 of 3 pass. That leaves three failures, all waiting on P:
  - `formats-doc`, "the limits and the id prefixes…": `Accession` now has `importKeyBare`, which `/about/formats` does not list yet. This is R's need 7 for P, as expected.
  - `r67p-about-seams`, "What comes from where…": it pins `canonicalName ?? '').toLowerCase() === name.toLowerCase()`, which B2 replaced with `sameName` by `spellingKey`. This is B's need for P.
  - `r69p-about-seams`, "a file shown at its own size is said": since C7, an original no wider than 500 pixels gets a thumbnail at 250 or 120, so no Commons address is "own size" for this fixture. It fails the same way on C's own tree. This is C's sizes sentence, a need for P (C's last bullet for P).
- **Browser specs** (the species page was touched), under the lock, port 4310: `r70n-tiles`, `r61w-pages`, `r62w-pages`, `r67p-pages`. 23 passed.

## A note on the docs

`docs/REVIEW-TRIAGE-69.md` in M has 143 lines. The agents' copies have 165, with section 7 (A2, B5 to B8, C6, C7, R5 to R7, W6, X5, P3, P4). Their diffs were taken against `base`, which did not carry it. It is not code, so I did not copy it. P or the owner may want it in the tree.
