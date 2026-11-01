# Round 85, agent K: the add form and the plants' names

Copy `/tmp/claude-0/rev85/K/`, branch `r85` on `r85base`. Scratch `/tmp/claude-0/rev85/K-s/` (base worktree at `K-s/base`). No forbidden file touched; no remote-device tool used; the live site not asked.

## Done

Steps: **1** = the deploy over today's corpus; **2** = the walk's `--index` (new corpus).

### S1, P2 (the blocker): no accepted name, no `hom`, ever draws "An older name of" (step 1)
- New `src/lib/ui/picker-rows.ts`: `localRow` (a search hit as a picker row) and `olderLine` (the row the line names). The line is drawn only when **no reference row is headed by the name typed** and a row holds it as an older name (`older`), never from `hom` (another author's same spelling). A merged row wins ("Its page was merged into Echeveria desmetiana", not Dudleya). A page whose own species is the name typed (its variety or autonym) is never named (A9b).
- `SpeciesPicker.svelte` uses them; `olderFirst` (the first-press arming) follows the same rule, so Aloe vera, Crassula ovata 'Gollum', Echeveria elegans file on one press.
- **Tests:** `tests/unit/r85k-older-line.test.ts` (11) over `fixtures/r85k-held-headings.json` (1,093 real entries, 700 holdings in the grower's families plus every named case, made by `scripts/dev/r85k-held-fixture.py` from the live index): every heading another entry holds as `syn`, `older`, `kew` or `hom`, with the real `search()`'s six rows, with the holder first, and `hom`-only: no line. 500+ true older names still draw it. Round 84's rule is restated in the test and shown to fire on Aloe vera, Crassula ovata, Echeveria elegans. e2e `r85k 1`, `1b`.

### C2: the reference's key wins (step 1)
- `keyFrom` records where the key came from. The leave's check, Enter and Add each await the reference's search for the text (`searchNow`) before the name service; a key the name service gave is replaced when the reference's exact row arrives. Enter on a GBIF-only exact row waits for the search first.
- e2e `r85k 2` (leave, Enter, straight from the field; names answer at once with 5525665, search 600 ms later): 9269454 filed, no amber notice.

### C3: one plant per Add (step 1)
- `plants/new`: `saved` guards `save()` and both buttons; `goto` awaited. e2e `r85k 3` taps twice 120 ms apart (and a third), the plant page's code held 1.5 s: one plant.

### C4, S2, W9, A16a, W2, A11: a plant finds its page, and says so
- **Step 2, by key:** the build files a copy of each Kew-headed page's sheet under GBIF's name for its key (`src/lib/dossier/gbif-alias.ts`; `scripts/build-dossiers.ts` `scanDossiers`/`sheetBuckets`), marked `via: 'gbif'` with the page's own address in `page`. Sheets only, never entries (`products.ts`). `sheetForNameOr` takes such a copy only for a plant of the page's own key. Same hash group as any plant: the server learns nothing new.
- **Step 1, the form's answer carried:** a name kept as typed after the line is filed with `olderOf` (the page's name); the import does the same for a line its review called an older name. New optional field in `Accession` and `FIELD_TYPES` (older builds pass it through). The plant page asks that page's hash group and shows its habitat.
- **The plant page** (`plants/[acc]`): `foundBy` says "Filed under GBIF's name for its key; the reference heads its page X", "Its page was merged into X" (round 73's merged copies, which said nothing) or "An older name of X", links X, offers "File it under X" (logged, old name as received, `olderOf` cleared). No "key differs" notice for such a page. An edit of the name clears `olderOf`.
- **W2/A11:** `readSearch` answers `why: 'infra'` when a page holds a variety or form of the name typed ("Trichocereus pachanoi f. peruvianus"); the plant page and the import say "a name below it, …, is an older name of Echinopsis macrogona". (`held` from binomials is N's `infra-names.ts`.)
- **W9's tile:** the front page's missing tile says "no page under this name" (was "not in the reference", false for an older name).
- **Tests:** `r85k-by-key.test.ts` (4), `r85k-names.test.ts` (W2, alias rules), e2e `r85k-plant` 1–4 and `r85k 10`.

### A10: `isPlantNumber` everywhere; the loop guarded (step 1)
- `core/accession.ts`: `isPlantNumber`/`plantNumberProblem` (≤ 32 characters, ≤ 15 digits in a row, no control character). `nextAccession` counts only ≤ 15-digit numbers and its loop is bounded. The form (`maxlength`, a said refusal), `addAccessions` (given numbers), the import (a bad number goes to the notes, said, next free number given) and `planNumbers`' own loop use it.
- Unit: 309 digits → `2026-0003` at once (base: hangs).

### A12: exact words first in the label (step 1)
- `olderNameOf` returns the older name that is the typed words exactly, before prefix matches and before the hit's own words (Sedum rubens' family began "crassula"); word for word, so "Opuntia opuntia" works.

### A13: the name service's 10 s; the reference awaited apart (step 1)
- `namesFor` aborts at 10 s; `/api/names` aborts GBIF at 8 s and says "backbone did not answer within 8 seconds". `current` holds `ref` and `names` apart; Add's check awaits the reference only, the name service only for a name the reference does not settle.
- e2e `r85k 4` (names never answer: added in < 4 s), `r85k 5` (names 502, search held 800 ms).

### A16b, P5: the list (step 1)
- The list's height is measured against the visual viewport and every pinned bottom bar (`data-cover="bottom"`, now on the add form's bar), at least one row. A name typed in full that heads the first row narrows the list to the rows of that name.
- e2e `r85k 6` (375 × 500: list foot ≤ bar top), `r85k 7` (one row; a tap on Acquired focuses it).

### S7 (step 1)
- `QUOTES` gains „ ‚ « » ‹ › (names, paste, commit, `cultivarRest`). `offeredReading` accepts the genus and an epithet's start ("lithops lesle"). "Under another genus" only when not found by a common name (`byCommonName`). A keyless page's own row says "with no GBIF key" whenever a pick files its own name. Unit + e2e `r85k 8`.

### A16g (step 1)
- Rows under headings "Species pages" / "GBIF's names"; "has a species page" kept for screen readers only. e2e `r85k 9`.

### W10 (step 1)
- A paste's lines matched as imported before can be added with one press ("They are new plants: add all 26"); `freshKeys` gives each the next free `#n`. Unit test of `freshKeys`; the button itself was not run in a browser (the import specs r62bg and r62g pass beside it).

### C8's tests for C2 and C3: `r85k 2` and `r85k 3`.

**Fails on the base, how checked:** the three unit files were run in `K-s/base` (r85base + the files): `r85k-by-key` 2 of 4 fail (the copy taken for any key; entries carry GBIF's name), the other two fail to import their new modules (and `older-line` restates round 84's rule and shows it firing). The e2e specs were run against a build of `K-s/base`: see Measured.

## Decisions I took
1. **No name service in the line's rule.** GBIF's "accepted" is not Kew's; the reference's own rows decide (decision 6).
2. **A plant's page by key needs a build product,** since the device asks only by its name's hash group. A copy of the sheet under GBIF's name (as merged addresses already have) keeps one request and no correlation; a pointer to the page's bucket would make the second request reveal the species. Only GBIF's name of the page's own key, and only for that key: about 500 copies.
3. **`olderOf` is a record field**, not inferred on open: the plant page must not send a name unasked (rule 4).
4. **P5:** narrowing the list on an exact name rather than closing it; partial names keep every row.
5. **A16g:** headings instead of per-row words; the words stay for screen readers.
6. **W10:** an explicit press, not a date in the key: a re-paste of the same list (no date) must still find its plants.
7. **W9:** no automatic "Is it an older name?" (it sends the name); the tile and page say "no page under this name".
8. **A10's digit limit is 15, not the review's 12:** every run of 15 digits is counted exactly (2^53 has 16), and a nursery's 13-digit barcode fits.
9. **Bulk readers** (Today, the labels' batch) take a GBIF-name copy by the name, as they take every sheet; it is the same plant under GBIF's own name. Only the plant page's lookup, which shows and files a key, tests the key.
10. **Old headings in the entries:** not copied (only sheets), so the import's hash-group check and the tiles still say "no page under this name" for them; the search and "Is it an older name?" find the page.

## Measured
- **The line over the whole live index** (31 October copy, the code's own `search()`, six rows, `K-s/measure/`): 3,056 headings are another entry's `syn`, `older`, `kew` or `hom`; every one is among its own six rows. Round 84's rule draws "An older name of" on **2,872** of them; this round's on **0**.
- **The 501 old headings typed** (review-s's list): the line names the new page for 496, as before (the five left are N's data: Ceropegia tanzaniensis, Erythrina caffra, Rhododendron roseum, a rank-less Conophytum, a case difference).
- **GBIF-name copies (step 2):** 74 among the 1,523 dossiers the reviewers saved carry `name.gbif` of another address (Hoodia alstonii ← Ceropegia alstonii, Chrysalidocarpus lutescens ← Dypsis lutescens, Ferocactus histrix ← Bisnaga histrix …); about 500 over the corpus, each one sheet (about 1.5 kB) in its bucket.
- **Browser, Chromium and the phone** (`K-s/e2e1.log`, 149 tests with r84k, r83k, r62q, r62bq, r61q, r82s, r81h, r62l, r80u, r71d, r81s and smoke-3): every r85k test passed in both; all neighbours passed except smoke-3's front-page Enter test (390), which failed twice in that run under a load average of 40. Rerun at a lower load with the import specs (`K-s/e2e2.log`): 42 of 42 passed, smoke-3 390 and 415, r62bg and r62g included.
- **Base build** (`K-s/base`, `K-s/e2e-base.log`, Chromium, no retries): 15 of my 17 fail as each spec's header says. `r85k 5` (names 502, search held) passes there too: it is a guard of A13's other half, which round 84 already did.
- **Unit:** my 3 files, 33 tests; 153 nearby files in four runs, all pass but `search-generations`, `r70r-snapshot-clock` and `r69w-server` cases that timed out at a load of 40; run alone, 38 of 38 pass. `r67r-import` 1 updated (sixteen digits are no plant number now). `tsc -p .`: 0 errors. `svelte-check` (run once, at the end): 2 errors, both `typeof foundBy` read as `null` on the plant page; fixed with a named type (`FoundBy`), not re-run (the brief's once).

## For the owner's PC
None beyond `docs/DEPLOY.md` "Round eighty-five: the add form and the plants' names (agent K)": WebKit and Firefox run of `r85k-add`, `r85k-plant`, `r84k-*`; after step 2, `--index` prints the count of GBIF-name copies.

## Touched outside my files
- `src/lib/core/log.ts` (`olderOf` in `FIELD_TYPES`), `src/lib/db/types.ts` (the field) — U.
- `src/lib/dossier/sheet.ts` (`via`, `page` on the type), `src/lib/dossier/products.ts` (`Alias.via`; entries skip GBIF aliases) — N.
- `scripts/build-dossiers.ts` (`scanDossiers` pushes GBIF aliases; `sheetBuckets` marks copies; the `--index` line) — G/N.
- `src/routes/+page.svelte` (the missing tile's caption), `tests/e2e/r81h-hybrid-tiles.spec.ts` lines 43, 47 — U, Q.
- `src/routes/about/how/+page.svelte` (names: six rules; collection: three), `src/routes/about/formats/+page.svelte` (`olderOf`), each `<!-- r85 K -->` — A.
- `docs/DEPLOY.md` (my section).

## Not done, with why
Nothing. One note for the merge: `svelte-check` should be run again after the merge (my one run found the two type errors fixed since).
