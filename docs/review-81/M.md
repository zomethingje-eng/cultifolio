# Round 81, agent M: the merge

Copy `/tmp/claude-0/rev81/M/`, branch `r81m` on `r81base` (the owner's head `0349d13`'s tree), head: the commit after **0686f35**, which brings this report into `docs/review-81/M.md`. Scratch `/tmp/claude-0/rev81/M-s/`: the tools (`tools/`, round eighty's word merge), the simulation (`sim/`), the base worktree (`base/`), every log.

**Against the base: 120 files (46 added, 74 changed), +7,135 / −364.** The delivery is every file added or changed since `r81base` but `scripts/corpus-plan-full.txt`: 120 files, none deleted or renamed, listed in `/tmp/claude-0/rev81/M-s/delivery-files.txt`. No file under the hard limits changed (`package.json`, `package-lock.json`, `wrangler.jsonc`, `static/s/`, `docs/REVIEW-ROUND-5.md`, the plan file). Beside the zip, hand over U's `/tmp/claude-0/rev81/U-s/webkit-walk.mjs`.

## Done

### 1. The five merges

In the order B, A, H, S and U, each `--no-ff`, as `M <m@m>`.

- **The species page**:
  - A against B: one Wikidata line (D4, below);
  - H against that: H's parents line put beside it;
  - U's CSS merged cleanly.
- **`src/routes/+page.svelte`**, U against S: one hit row, with S's `?was=` link and `data-slug`, and U's `aria-hidden` letter and arrow.
- **`/about/how`** (H, then S) and **the plant page** (S): merged word by word with round eighty's `wordresolve.py`, then each merged passage read again.
- **`scripts/build-dossiers.ts`** (B, H) and **`docs/DEPLOY.md`**: clean merges, or both sides kept. The B and H lines were read where they meet: H's `signEntries` sits after B's stamp check.

### 2. Needs settled

- **H to S, the sort:** `search.ts` `sortKey` reads past "×", written inline because `search.ts` imports nothing.
- **H to S, the import:** `import/check.ts` checks a named nothospecies as a species is checked:
  - by its slug;
  - at species rank, read without the sign, so it takes its key;
  - a hit named with the sign counts as the exact match, or as the near match for a misspelling.

  A cross written out is still filed `hybrid`, unasked.
- **A and B, D4:** one `{#if}`.
  - Where none of Wikidata's names is shown, B's sentence: "which the search finds and this page does not show".
  - Otherwise, A's sentence: "English names as Wikidata spells them … not corrected here".
  - "The search finds" is true: `pooledSpellings` keeps every English name.
- **Overlaps, one behaviour each:**
  - W7's hit row: the link is named by the species, then "older name: …", then the rest.
  - The plant page's notice: a named hybrid asks the reference (H). Without a page it reads "No species page under this name" (S).
- **About pages:** one sentence added to `/about/how`. The hybrid sign and the one-word rule reach the search's rows and the tiles with the upload after the fill, while each species page follows both from the deploy. It is said as B's D1 sentences are.
- **A's labels:** `.care [hidden]` was made `:global`, which removes A's one svelte-check warning.
- **B's C3 to S:** 7 of 7 pass.
- **U:** the walk goes in DEPLOY (e) 4. U's section points there.
- **Test:** `tests/unit/r81m-merge.test.ts`, 5 tests. 4 fail on the base; 1 is a guard.

### 3. Faults found in the merge

- **H's real backup was never committed.** `tests/unit/fixtures/r81h-backup-r80-300.cultifolio.zip` was kept out by `.gitignore`'s `*.cultifolio.zip`.
  - Both of H's tiles tests read it, so on the PC they would have failed for want of the file.
  - It is now tracked, with one `!` line in `.gitignore`. I checked it holds no e-mail address.
- **H's tiles spec assumed Chromium's timing.**
  - It called `whileStoring` without `watchStorage`, so the wait gave up after 5 s.
  - Its 180 s also left no time for WebKit.
  - The restore makes 16,468 IndexedDB requests, measured in Chromium: about 5.5 minutes at the PC's WebKit pace.
  - Fix: it now watches the database, with windows of 45 s, and `allowWrites(2 × 16,500 × 20 ms)`, as smoke-3 does.
- **B2 left one kind of page rewritten** (found on the simulation).
  - A no-network day wrote a page again when its wild row read "not asked: N wild photographs already from the GBIF download". Only that row's `at` changed.
  - So the stamp saw a change and the index was written for nothing.
  - Fix: a page left unanswered keeps that row, and is not written when its text is unchanged (`build-dossiers.ts`, in `fillPhotos`).
  - Test: `tests/unit/r81m-fill-unchanged.test.ts`, on the real page. It fails on B's branch.
  - **Safe mid-fill:** it writes less, never differently.

### 4. Checks

- **The new tests on `r81base`** (worktree `M-s/base`):
  - Unit: 80 tests in 15 files. 70 fail and 10 pass, all of them guards (named in REVIEW-ROUND-81 §4). `r81h-hybrids` and `r81u-words` fail to import.
  - Browser, Chromium and phone, no retries: 44 tests. 42 fail and 2 pass (U's P7 2b, a guard).
- **The whole unit suite**, alone, under nohup:
  - First, at `1722bf9`: 506 files, 4,585 passed, 3 skipped, 643 s.
  - At the final code: 507 files, 4,586 passed, 3 skipped, 632 s.
- **Types:** `tsc` reports no errors; `svelte-check --threshold error` checks 1,364 files with 0 errors and 0 warnings.
- **The whole browser suite, strict, Chromium and phone:** 631 passed, 5 skipped, 0 failed, 0 flaky, 24.7 min.
  - H's spec was then rerun alone after its fix and passed.
  - App code was unchanged after that run.
- **The specs read:**
  - A service worker is blocked wherever a route must catch a request.
  - No `mouse.wheel`.
  - Only distinct requests are counted.
  - Waits are on the page.
  - One timing fault, above.

### 5. The simulation of the PC mid-fill (`M-s/sim/`)

The copy was built with `setup.py`, `state.mjs`, `deliver.sh` and two `fetch` stand-ins:
- the code of `r81base`, with its plan file;
- 40 real pages from B's rekeyed copy of round seventy-seven, including its 3 hybrids;
- the index written by the base code;
- the step-1 backup;
- `corpus-step.json` at step 11, with day 1's words.

Then the 108 code files were delivered over it. The results:

- **`--status`:** clean, with no `Note:`, and it wrote nothing.
- **A stale lock** (a dead pid) was taken and said so. No run tripped on its own lock.
- **Two days with no network:**
  - each ran 5 unanswered pages, then stopped with exit 3;
  - 0 requests were charged and 0 dossiers written;
  - the first day wrote the index, now signed, because the code had changed;
  - the second said "not written again".
- **A day with the stub:**
  - 40 pages filled with 6 requests;
  - its index was written;
  - step 12 said "not written again";
  - the run stopped at step 13 with exit 2.
- **At the stop:**
  - `--backup filled` made its copy;
  - the retry listing found 0 pages and wrote no file;
  - `--index` said "not written again";
  - `--compare` found 0 differences.
- **Nothing restarted:** no record was set aside.
- **Not run here:** the online and offline `--keys` lines need the download and the grid.

### 6. Measured

| What | Round 80 | Round 81 | Change |
|---|---|---|---|
| Worker (`wrangler --dry-run`) | 1,864.9 KiB, 472.3 KiB gzipped | 1,940.1 KiB, 494.2 KiB gzipped | +75.2 KiB, +21.9 KiB gzipped |
| H's `hybrids.json` | none | 59.6 kB, 16.8 kB gzipped | in the Worker only |
| Client JS | 1,351.0 kB, 479.3 kB gzipped | 1,366.2 kB, 485.1 kB gzipped | +15.2 kB, +5.8 kB gzipped |
| Service worker install | 138 files | 140 files | +2 |
| First page | 52 requests, 698.2 kB, 346.4 kB gzipped | 53 requests, 701.0 kB, 347.5 kB gzipped | +1 request, +1.1 kB gzipped |

No requests were made to the live site or to any source.

### 7. Documents

- **`docs/REVIEW-ROUND-81.md`:** the findings table, the decisions, the merge, the proofs, the delivery, the walk, the decision, what is left.
- **`docs/review-81/`:** the five reviews, and the reports of B, A, H, S, U and M.
- **`docs/DEPLOY.md`:**
  - `### Round eighty-one: the owner's walk`, steps (a) to (e) as the brief orders them;
  - then `### Round eighty-one: the dependency delivery, after the upload (review C4)`, B's versions;
  - B's section now points to the walk, and its walk (c) and (d) moved into it;
  - round eighty's walk is headed "(superseded)".

## Repairs for the live site

None of the merge's own. (d) is B's, typed at the review stop, with the retry joined into its first online line. Everything else arrives with the deploy or with the plan's `--index` and upload.

## For the owner's PC

The walk, in DEPLOY. Hand over `webkit-walk.mjs`.

## For the owner to decide

Ferns, mosses and carnivores under the lifeform rule. My recommendation: keep A's reading, under which a lifeform on file is enough, because the table lists these groups by whole families. The other choice is two lines in `AGREE`, which would take a group from 1,254 pages. See REVIEW-ROUND-81 §7.

## Not done, with why

- **B7:** the window was not shortened.
- **`carriedOrigin`:** left as it was.
- **C6 and C7:** no fix; see U.
- **WebKit and Firefox** were not run here.
- **(d)'s online and offline rebuilds** were not simulated: they need the PC's download and climate grid.
- **Four idle `workerd` processes** from my `wrangler --dry-run` and dev runs (PIDs 3749, 4018, 4669 and 5233, parent 1) are still running: stopping them was refused here. My two measurement dev servers were stopped by PID.
