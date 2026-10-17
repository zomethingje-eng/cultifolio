# Round seventy-five: the same catalogue on every device, the flaky tests, and the scaling study

Round 75 has three parts, one agent each:

- **H**, the harness;
- **G**, the catalogue and the range list;
- **S**, the scaling study.

Their reports are `review-75/H.md`, `G.md` and `S.md`. `FOLD_RULES` stays 8, the device database stays at version 4, and nothing in a dossier changed, so there is no corpus step.

## 1. The same catalogue on every device (G, the owner's decision)

The owner saw the live site on his phone and wrote that "the species list is missing a couple of thousand species" and to "make sure that the data on phone matches the web version". Since round 73 a phone opened on the collector genera (6,362 species) while a desktop showed all of them.

- **Every device now draws the same catalogue:** every genus and species, in the same order, with the same chips. The phone-only view is gone.
- **The phone's first visit is lighter.** Measured on round 72's corpus: 79 requests and 379 kB, against 80 and 386 kB. It draws 60 rows of 60 sent, where the subset sent 220 rows to fill 24.
- **"Most grown"** is a chip on every device, off until chosen, and it works without JavaScript (`?chip=grown`).
  - It narrows the catalogue to the fewest genera that together hold half of iNaturalist's observations of plants marked captive or cultivated across the reference's counted genera.
  - Each genus is counted with every taxon under it.
  - Today that is 95 genera and 1,225 species: Rosa, Salvia, Prunus, Acer, Hibiscus and onward.
- **The counts are `scripts/most-grown-genera.txt`** (17 October 2026), made by `scripts/most-grown-genera.ts` in 41 requests. Its notes:
  - A genus is counted only where iNaturalist holds exactly one active plant genus of that name.
  - 30 of 1,321 are refused, none as homonyms. Callistemon and Mahonia are among them: iNaturalist holds them only as old names.
  - A count that does not answer is "not checked", never 0.
  - The file was counted on round 72's index. A rerun of the script counts on the live one.
- **The add form's name hints** name a leafy plant, an orchid and a succulent.
- **/about/how** describes the chip and its rule, checked against the code.

## 2. A long range list (G, the owner's report)

On okra's page the "Native" cell held three native and about 80 introduced regions as one narrow column, with the rest of the row empty. A long list now spans the whole fact grid and flows across it, with every region still shown. `r75g-range-cell.spec.ts` measures it at desktop width; on r75base the cell was a fifth of the grid.

## 3. The flaky tests (H)

- **Firefox now runs at two workers, as WebKit does.** `predeploy` prints each engine's count from the same file the config reads. The strict rule is unchanged: a test that passes only on its retry still fails the run. A failed Firefox test now keeps its trace.
- **r62bg 1 (Firefox), a Leave answered Cancel read as a Leave: an app fault, fixed.**
  - A Cancelled Leave put the example back only after a three-second timer, so a reload before it deleted the example and the visitor's edit.
  - Leave now writes only its one-use token, and the page its address opens does the leaving. A Cancel has nothing to undo, however slow the machine.
  - `r75h-leave.spec.ts` fails on r75base.
- **The 400-plant backup (WebKit):** fixed in the test. It now waits while the database keeps answering, instead of for a time worked out in advance.
- **smoke-2's Water and r60 11 (Firefox):** not reproduced, since there is no Firefox in the workspace.
  - Both tests now wait for the page to be ready.
  - smoke-2 now says why, if Water leaves no line.
  - Firefox's traces will show the rest.
- **Presses before the page is ready:** 14 presses on server-drawn pages are fixed, and a guard (`r75h-harness`) stops new ones.
- **`scripts/flake-check.mjs`** runs the doubtful tests 20 times in Firefox and WebKit and prints a table. It takes about 1 hour 40 minutes. DEPLOY.md says when to use it.
- **Two flakes found at the merge, both fixed in their tests:**
  - `r69x-keep` failed when its random leave token happened to contain "42", a figure the test checks is not in the address. It now reads the address without the token.
  - smoke-2's hover-preload test failed once in the strict run. The tiles are redrawn under a still pointer, so it now hovers again on each poll. It passed 8 of 8 alone before the change and 4 of 4 after.

## 4. The scaling study (S)

`docs/SCALE-STUDY.md`, with its scripts and outputs in `scripts/dev/scale/`. No production code changed. Its findings, measured in node:

- **Which species.**
  - iNaturalist's cultivated counts match 56,497 species Kew accepts; with GBIF's living-collection records, 81,848.
  - **For about 50,000, recommended:** every accepted species with at least 3 cultivated records, plus the collector genera whole. That is 54,212 species.
  - **For about 100,000:** at least 1 record, plus the genera where half the species have one, plus the collector genera. That is 97,184 species.
- **The Worker.**
  - Today's cold start holds the whole index: 43 MB at 8,947 species, 221 MB at 50,000 and 446 MB at 100,000. Cloudflare's limit is 128 MB.
  - Today's design stops fitting between about 25,000 and 40,000 species.
  - The recommended design holds nothing whole: small name shards and per-word search files read from R2.
- **The build.**
  - About 14 upstream requests a species. At 100,000 that is about 28 days of iNaturalist's daily allowance.
  - Bulk files and batched requests bring it to about 2 days.
  - GBIF's download grows from 12.75 GB to about 75 GB.
- **Storage:** about 5.6 GB in R2, inside the free allowance.
- **The plan:** rounds 76 to 80, starting with the Worker reading name shards at today's corpus, proved by identical answers. The study lists seven decisions for the owner.

## 5. Also

`docs/REVIEW-ROUND-74.md`'s last six lines were missing from round 74's commit: a stale copy had overwritten the file on the PC before it was committed. They are back.

## 6. Runs

- **Unit:** the whole suite after the merge, 3,975 passed and 8 skipped once `r69x-keep` was fixed. `tsc` and `svelte-check` are clean.
- **Strict Chromium and the Chromium phone at four workers:** 495 passed, 5 skipped and 1 flaky (the hover test, fixed in its test, as above).
- **WebKit and Firefox:** the owner's run, `--tier=app`, then `flake-check.mjs` if anything is flaky.
