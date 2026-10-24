# Round 82, agent M: the merge

Copy `/tmp/claude-0/rev82/M/`, branch `r82m` at `r82pc` (`15496d8`, the revert), head `14d8d7b` and the commit after it, which brings this report into `docs/review-82/M.md`. Scratch `/tmp/claude-0/rev82/M-s/`: the word-merge tools (`tools/`), the base worktree (`base/`, `r82pc`), the simulation (`sim/`), every log.

**Against `r82pc`: 141 files, 43 added and 98 changed, none deleted or renamed.** The delivery is all of them; `scripts/corpus-plan-full.txt` did not change and is not in it. The list is `/tmp/claude-0/rev82/M-s/delivery-files.txt` (deletions and renames apart in `M-s/delivery-deleted-renamed.txt`: none). No file under the hard limits changed.

## Done

### 1. The five merges

F, S, D, U and O, each `--no-ff`, as `M <m@m>`, on `r82pc`. None of them changed `inat.ts`, so `r82pc`'s stays.

- **Clean:** `build-dossiers.ts`, `index-entry.ts`, the species page, `+page.svelte`, `theme.css` and `lookups.ts`.
- **Word by word** (`wordresolve.py`): `/about/how` (U, then O) and `/about/formats` (O). Each merged passage was read again: "Popular genera" throughout, one few-records sentence.
- **`DEPLOY.md`:** both sides kept in each conflict.
- **`fold-rules.test.ts`:** D and O each re-recorded the hash; it is re-recorded once for both (`df77920b…`, FOLD_RULES 8, no fold changes).

### 2. The revert and /about/how

- The 32 `r70b2-follow-42` failures are gone: 86 of 86 pass, and the whole suite passes.
- No agent test leaned on the hotfix: none names FUZZY, and nothing failed for it.
- **/about/how** now lists, among the ways a taxon of another name is taken: "or GBIF's backbone holds the name as this species, or corrects it as a misspelling to this very species (GBIF's fuzzy match: Othonna linearifolia, as Kew and iNaturalist spell the page's Othonna lineariifolia), while a correction to another species is never read as this one's".
- **Checked against `judgeTaxon`, line by line:**
  - `fuzzy === s.key` takes the taxon.
  - No line takes a correction to another species on that ground.
  - The refusals before it are already the page's own sentences.
  - I did not write "refused": in lenient mode, a name iNaturalist's own search files the species under is still taken, and the page already says so.
- Tests in `r82m-merge`: the sentence, plus two guards of the code it states.

### 3. Needs settled

- **F to S, "Echeveria peacockii":** after the prune the old name was searchable only on Dudleya (or, for Bisnaga, nowhere), because a page built from Kew's file does not hold it.
  - `indexEntry` now gives a kept page the names of the keys merged into it (`occurrences.keys` with an old address), after its record's own, for `syn`/`older` and `recordOf`.
  - Index-time and safe mid-fill. Tested on the real builder, with a guard.
  - "Echeveria peacockii" then lists Dudleya first and E. desmetiana second: both hold the name exactly, so the alphabet decides. Putting the merged page first is left for round 83 (For the owner to decide).
- **S to U, "Under another author":** the species page reads the other page's author (`getDossier`, then `plainlyAnother`) and leaves out a name cited by that page's own author. Tested on the page load, with a guard.
- **S and F, one index rule:** in `r82s-homonyms`, a formula's first parent now leaves `syn` under F's rule and never goes to `hom`. This was the first whole run's one failure.
- **O's DEPLOY line:** `--tier=app --browsers=all` is refused by `predeploy`, so it now reads `--tier=app`.
- **Overlaps, one behaviour each:**
  - Compare's "+N" and rain labels: U's (S ceded 20).
  - The climate chip: U's words.
  - The thin-climate mark: U's display and line (12 records / 5 cells) over the counts every dossier already carries (F).
  - Credits: U's "author not stated", with the fill's observer as before.
- **The few-records figure:** U weighted 504 pages by the index's `open`, but `open` is not `climate.records` (they agree on 115 of 5,825 pages).
  - On the 5,825 climate pages of both copies, by their own counts, weighted by `open`: about 4,390 of 37,788 (11.6%).
  - `/about/how` now says about 4,400; `few-records.ts` records the method.

### 4. The owner's decision: Bisnaga hamatacantha into Ferocactus hamatacanthus

- **The line:** `7281739 k2808164 Bisnaga hamatacantha`, with no fourth column.
  - Asked of GBIF's API: 38 usages under 7281739.
  - Read against Kew's file with `mergedExcept`: none is another plant's. Echinocactus haematacanthus (7498042), whose words Kew files under F. haematacanthus, holds 0 records.
  - The comment gives the type: Echinocactus hamatacanthus Muehlenpf., Kew's basionym of 2808164. Kew holds no row of the Bisnaga name.
- **Files:**
  - `scripts/r82-repair-keys.txt` gains `k2808164`.
  - `/about/how`'s list of merges, which was stale: it still had peacockii into Dudleya, and Ceropegia nubica into C. cereiformis.
  - `r78i-merges` and `r78m-list-build`. The species list still gives 7281739 its line; it is not changed mid-fill, and the build skips keys merged into keyless pages.
  - `--list-no-reason` now leaves out pages a merge takes. It would have rebuilt g7281739.
- **What it changes, at (d):**
  - k2808164 reads the 3,388 records under 7281739. It is live with "not checked" and no climate; it gains the map, records and a habitat climate under Kew's range, and answers `/species/bisnaga-hamatacantha` and the old name in the search.
  - g7281739 (no range, no climate) goes at `--prune-followed`.
  - Before (d), on the PC: no id moves, since a merge counts only while its kept page is on disk and is read.
- **Tests (`r82m-merge`):** the line, the ids, the build line, the prune's wait and the repair key.

### 5. Faults found in the merge

- **D's batch start line ran 5 px past 320 px at 200% text.** `r67h engines 3` and `smoke-4` failed in the first whole run because "Sown 10 seeds" used non-breaking spaces. It now uses `{' '}`. A plain space was dropped by Svelte and caught by D's spec.
- **/about/how's merge list was stale** (above).
- **S committed an empty `proof82-diff.txt`** at the root. Removed.
- **The copied review 2 held 27 links to files on the owner's computer**, with his user name. They are reduced to file names.

## Checks

- **New tests on `r82pc`** (worktree, new files copied in):
  - Unit: 20 files and 80 tests; 70 fail and 10 pass, all of them guards.
  - Browser, Chromium and phone, no retries: 6 specs and 46 tests; 43 fail and 3 pass (O's csp 1 ×2, U's 15).
  - On the merge, all pass.
- **The whole unit suite, alone, `nohup`:**
  - First run: 4,711 passed and 1 failed (the homonym test).
  - Final code: **528 files, 4,713 passed, 0 failed, 10 skipped, 593 s.**
  - The 7 search-route tests that skip without a v2 corpus were then run on round 77's: 7 of 7.
- **Types:** `tsc` 0 errors; `svelte-check` 1,398 files, 0 errors, 0 warnings.
- **The whole browser suite, strict, Chromium and phone:**
  - First run: 675 passed, 2 failed (the fault above), 5 skipped, 0 flaky, 24.2 min.
  - Those specs then ran 29 of 29.
  - Final run: **677 passed, 0 failed, 0 flaky, 5 skipped, 23.4 min**.
- **Specs read:**
  - All block the service worker except `r82o-worker`, which needs the real one and makes no failing request and no page-error check.
  - No `mouse.wheel`.
  - D counts distinct files, polls the very line it reads, and gives WebKit more time.
  - Nothing to fix.

## The simulation mid-fill (`M-s/sim/`)

- **The copy:** `r82pc`'s tree and plan file; 44 real round-77 pages (Bisnaga, the peacockii pair and Sempervivum tectorum among them), half left to the fill; the PC's own index; the step-1 backup; `corpus-step.json` at step 11.
- **Then the 140 code and doc files laid over it**, and the following, all run for real:
  - **`--status`:** no `Note:`; `corpus-step.json` byte-identical; no log written.
  - **The lock:**
    - A live holder refused both `corpus-step` and `npm run dossier -- --index` (exit 2).
    - A dead pid's lock was taken, and the run said so.
  - **A fill day with iNaturalist unreached:** exit 3, 0 charged, no dossier content written. The index was written once (the code changed).
  - **A second such day:** "not written again".
  - **A fill day with a stub:** 44 filled, step 12 "not written again", the stop at 13 (exit 2). The review line names `kew-shared.txt`.
  - **At the stop, offline:**
    - `--backup filled` and the four listings ran.
    - `--prune-followed` names the two merges waiting.
    - `--index` was not rewritten, and `--compare` found 0 differences.
- **One id moved on this copy only:** Dudleya k2778991 became g2985894, because the copy lacks k2781125. On the PC the ids stay, as F's guard shows.
- **A first attempt ran a real fill day by mistake.** My lock helper failed, so nothing held the lock. It made 5 paced iNaturalist requests under the project's identity. The copy was rebuilt from scratch.
- **Index-time changes, round 77's whole corpus (8,947 pages), `r82pc`'s code then this delivery's:**
  - Thumbnails changed on 2,308 pages.
  - Tile credits changed on 2,155, 750 of them to "CC0, author not stated".
  - `hom`: 272 names on 240 pages, and 10 kept.
  - Hybrid rule: 5 x-spelt names out, plus Nerium indicum now among Kew's names only.
  - `kew-shared.txt`: 9 entries (the copy is unpruned).
  - 8,947 species both times.
- **Sizes against `r82pc`:**
  - Worker: 1,969.6 KiB / 503.1 gz (+29.3 / +8.9).
  - Client JS: 110 files, 1,390.9 kB / 493.7 gz (+24.7 / +8.6).
  - CSS: 181.8 kB (+2.3).
  - Service-worker install: 142 files (+2).

## Documents

- `docs/REVIEW-ROUND-82.md`: every issue with its fix or why not, the hotfix and revert, the decisions, the merge, the proofs, the delivery, the walk, what is left.
- `docs/review-82/`: the two reviews and F, S, D, U, O and M.
- `docs/DEPLOY.md`: `### Round eighty-two: the owner's walk` first. It has (a) to (e), each step with its cmd command, good output and time, and the rule that nothing runs while `corpus-step.mjs` runs. (d) is round 81's block with F's `--list-no-reason`, both repair keys and four pages pruned. Round 81's walk is now headed "(superseded)".

## Repairs for the live site

(d) as in the walk: F's lines plus `k2808164` in `scripts/r82-repair-keys.txt`. `--prune-followed` should then say `4 dossiers … (9574874, 9592399, 7530398, 7281739)`, about 48,357 species. It adds a few minutes to round 81's four and a half hours.

## For the owner's PC

- Deliver on an evening between fill days, before about 26 October.
- Then `predeploy --tier=app` in every engine. The four specs that lean most on WebKit are named in the walk.
- If one fails only in WebKit, send its trace.

## For the owner to decide

- **"Echeveria peacockii" in the search:** Dudleya first, by the alphabet; E. desmetiana second. Recommended: leave it for this upload, and mark merged names in round 83.
- **The `wrangler.jsonc` comment:** recommended (walk (a) 3).
- **HSTS `includeSubDomains`:** keep it off unless every subdomain serves HTTPS.

## Not done, with why

- **The merged page first for its old name:** this needs a new mark in the index and its key files, too much between fill days.
- **WebKit and Firefox:** not here.
- **(d)'s online and offline rebuilds:** not simulated; they need the download and the grid.
- **Leftover processes:** U's and D's idle `workerd` processes are theirs. I stopped my two by PID.
