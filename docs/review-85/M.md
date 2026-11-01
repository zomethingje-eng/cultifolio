# Round 85, agent M: the merge

Copy `/tmp/claude-0/rev85/M/`, branch `r85m` at tag `r85r` (= `r85base`, `08094db`). Scratch `/tmp/claude-0/rev85/M-s/`: every log (`unit-*.log`, `e2e-*.log`, `base-*.log`, `walk-*.log`, `crawl-*.tsv`), the new pages' reasons (`nokey/`), `delivery-files.txt`, `delivery-deleted-renamed.txt`, `round85-msg.txt`. Worktrees there: `walk/` (the scratch walk), `live/` and `base/` (step 1's comparison), deleted at the end.

**Against `r85base`: 1,031 files, 819 added (732 of them per-region map files) and 212 changed; 2 deleted (`static/app/maps/regions50.svg`, `tests/unit/fixtures/r84a-search-examples.json`), none renamed.** No file under the hard limits changed.

## Done

### 1. The seven merges

G, N, E, K, U, A, Q, each `--no-ff`, as `M <m@m>`. Conflicts, both intents kept each time:
- `lapse.ts` (E's one-unit elevation sentence, G's 1.5 °C clause on the two checks);
- `build-dossiers.ts` twice (N's and K's index types; U's product writer and A's examples fixture);
- `+page.svelte` (U's genus tile, K's "no page under this name");
- `about/how` four places (A's text, K's name rules, U's offline sentence, N's 486 hybrids);
- `DEPLOY.md` three times;
- Q against E in two tests (Q's behavioural form; E's server-render test kept beside it).

`tsc` was clean straight after.

### 2. What the reports asked

- **A's 55 marked sentences**, each checked, the marks removed. Wrong and corrected:
  - the border rule's country is the admitting region's (G's code), not any native region's;
  - the Snares and Kenting are not "placed": TDWG files the Snares NZS; Kenting counts by the margin;
  - the 1-in-100 night's sentence, to the code's words;
  - the credits' day is each photograph's own, else its source's;
  - the summary has its day and revision;
  - GBIF's search asks "within the box of" each region.
  - One was false in the code, so the code was changed: an extra key read through GBIF's search was not sampled by region. `extraOccurrences` now passes the boxes.
  - "In brief" says a page shows what its sources said on its build day.
- **A's chip.** The catalogue counts `notAsked` beside `notChecked`. `notChecked` keeps its sum for an older server. Over the live index the chip reads "920 not asked"; over a catalogue file written before, "not checked or not asked".
- **N's fields on E's page.** Kew's family is `name.family`. The days and revisions were E's already. `name.kew.elsewhere` was not filtered on the page; now it is (`$core/shown-names.ts`, page and server).
- **Formats, older apps, today's corpus.** /about/formats now names:
  - `grown` (the index) and `blocks.grown`;
  - `older-genera.json`;
  - the sheets' `via`/`page`;
  - `name.gbif.family`.

  `olderOf`, G's counts and N's fields were there. Each is optional, and an older app passes it through or drops it.
- **N's 18 new pages.** Decision 1 below.
- **The plan** runs in one file, `scripts/corpus-plan-r85.txt`, as G and N agreed:
  - backup, the offline walk, `gbif-infra`, `kew-names`;
  - the new pages, `--list-renamed`, `--keys` (all online), summary revisions, credits;
  - index (the about fixture), `--check-ranges`, review, upload, live check.

  The two Kew fills run before the online steps. That is the round-84 merge's reason: every page headed before the renamed list is made. The builds after them read Kew's names for their own pages.
- **One behaviour each:**
  - old-name words: E's `wasLine`, K's `foundBy` and the picker agree;
  - extremes: E's `causeSentence` with G's margin;
  - lead photograph: E's `heroOf` over N's refreshed photographs;
  - "not asked": A's sense everywhere, the builder's own log line included.

### 3. Faults found in the merge, each fixed and tested

- **Thirteen unit and nine browser tests** read the round before's behaviour, among them `r78b-batch`, the disclosure list (48 about-page disclosures, E's phone fold), the fold hash, `r66y 3` (K's C2), `smoke-2` (U's crumb), `smoke-3` and `r78b` (E's words), `r75g` (A's folding), `r82u 3` and `r84u A13` (the chip). Each was brought to this round, keeping its intent.
- **The batched build wrote no revision.** TextExtracts asks `lastrevid` now.
- **The picker offered nothing for "Copiapao cin"** (N's genus reading against K's `offeredReading`): `genusReading`.
- **A former heading lost by any later build** (Stapelia hirsuta var. hirsuta's address would 404 after the renamed pages' rebuild): every build keeps `name.formerly`. Proved on the scratch walk.
- **K's W10 button added 0 plants** (the lines stayed dropped). Found by the merge's first browser test of it.
- **U's CLS spec:** a fixed sleep and a bare `@chromium` written on a loop's line, which Q's guards missed. The guard reads loop lines now.
- **Two waits that waited for nothing:** `waitForFunction` reads an async predicate's promise as truthy and returns at once (checked). `smoke-3`'s End wait was one; it was the whole-run flake of rounds 84 and 85. `snapshotSaved` was the other. Both poll the page now, and a guard refuses the pattern.
- **K's single IndexedDB reads** after navigation: polled.
- **The new pages' reason:** see decision 1.
- **Unassigned review items done here:**
  - W11 in full: counts in words, the flat card's width, a common name set as a name, compare's and the catalogue row's failed photographs said;
  - W12's label line, "sp." roman, the key pill's title, /labels' CLS (0.039 → 0.000006 here);
  - D13's captive marks: the credits' fill reads `captive` again;
  - A9b's autonym author: "no author of its own".

New tests: `tests/unit/r85m-merge.test.ts` (8), `tests/e2e/r85m-merge.spec.ts` (5).

## Decisions taken for the owner

1. **San Pedro's records stay on Echinopsis macrogona, and the page says why by name.** The rule the brief offered is sound in principle (Kew's synonymy decides). But the new pages are the same case as round eighty's 643 "lumped" pages. One rule for 18 would be two rules for one case. All 657 would move records out of about 600 holders' climates, which needs the backbone export and the download to count and check, neither of them here.

   I ran round eighty's own rule (`kew-extra-keys.ts`) for the 18, with GBIF's API answers (225 requests) written as backbone rows:
   - 14 are lumped. Their lines are now in `extra-keys-kew-none.txt`, so each page names the page that holds its records.
   - 4 read a GBIF key of their own name and author: Acaena echinata, Ixia fuscocitrina, Nymphaea amazonum, Viola stipularis. They now get records (scratch: Ixia 10, Viola 351).
   - GBIF holds 410 georeferenced records under var. pachanoi and its synonyms, of macrogona's 639.
2. **The chip's two counts**, compatible both ways.
3. **The captive mark refreshed with credits.**
4. **W11/W12 done in the merge.**
5. **The agents' own judgements accepted** (listed in REVIEW-ROUND-85 §4).

## Checked

- **New tests on `r85base`** (a worktree, the new files copied in):
  - unit: 13 files across all eight agents, 57 tests failing by assertion. The passes are Q's revert tests and guards, by design.
  - browser, Chromium, no retries: 38 of the 40 new tests of A, E, G, K, U and M fail. The two that pass are guards.
- **The whole unit suite, alone, under `nohup`:**
  - first: 584 files, 5,270 passed, 13 failed (section 3), 10 skipped, 668 s;
  - final: **585 files, 5,295 passed, 0 failed, 10 skipped, 622 s**.
- **Types:**
  - `tsc --noEmit -p .`: 0 errors;
  - `svelte-check --threshold error`, alone, with 4 GB: 1,510 files, 0 errors, 0 warnings;
  - `tsconfig.scripts.json`: the base's 8, no more (the merge had made one, fixed).
- **The whole browser suite, strict, Chromium and phone:**
  - first: 803 passed, 9 failed, 1 flaky;
  - second: 820 passed, 1 failed (my first /labels fix pushed the preview off the first screen; replaced), 2 flaky (each now waits for its state);
  - third: 822 passed, 1 flaky (`smoke-3`, the no-op wait above);
  - final: **823 passed, 0 failed, 0 flaky, 5 skipped, 25.3 minutes**, the first try of every test.
- **Specs read for the PC's ways of failing:** the 51 new or changed specs. One fault, K's single IndexedDB reads; polled.

## Step 1, over today's corpus

- **What was served.** Production builds of the merge and of `r85base`, under `wrangler dev`. Data: the live index (48,357) and the reviewers' 908 saved live dossiers, in a local R2.
- **Status.** Merge: 906 × 200 and 2 × 503. The 503s are the reviewers' `x-` files, with no dossier under the key; base gives the same. Base: 905 × 200 and 1 × 404 (ceropegia-tanzaniensis, N's D5).
- **Bad words.** No page holds "undefined", "NaN" or "[object Object]".
- **Read on the pages:**
  - Hoodia alstonii's verdict line;
  - Cedrus deodara's extremes back (0.7 °C);
  - Melocactus radoczii's "GBIF's records not asked … under Melocactus harlowii";
  - the chip "920 not asked".
- **Sizes against base** (raw, then gzip):
  - Worker: 2,034.57 → 2,084.98 KiB (519.46 → 532.03 gz).
  - Client JS: 1,474.6 → 1,521.4 kB (518.6 → 532.1). CSS: 175.1 → 180.4 kB.
  - Sempervivum tectorum: 180,421 → 192,231 B (40,228 → 42,094).
  - Echeveria elegans: 138,868 → 150,832 B.
  - All 908 pages: 109.9 → 118.3 MB (+7.6%). Most of it is the chart drawn twice for a reader without scripts, the gallery's credits and the phone's fold.
  - Map files a page: 554 kB → median 10 kB (G's measure): about 540 kB less on every page.
- **The live site:** not read (0 requests). Its figures are the reviews'.

## Step 2, the walk, as far as it runs here

- **The corpus.** Round 77's corpus (8,947 pages), rekeyed. Then 424 pages kept: 400 by a fixed seed, plus 23 named cases from the live dossiers. No grid, no download, no backbone export, so `gbif-infra` was left out of the scratch plan.
- **The plan, through `corpus-step.mjs`:**
  - backup;
  - the walk: 424 pages in 16 min, 1,375 GBIF API requests;
  - `kew-names`, which stopped: "the index now holds fewer species than before", my subset. The count was set and the same command resumed;
  - the 18 new pages (124 requests). San Pedro: 12 photographs, its Wikipedia revision, "San Pedro Cactus" among its English names, the lumped reason naming Echinopsis macrogona;
  - `--list-renamed`: 24 pages;
  - `--keys`, which stopped at `drops.txt` with 2 lines, both of the expected kinds (a Wikidata item by Kew's name; macrogona's photographs given to San Pedro). Then `--go-on`;
  - summary revisions: 206 read, 10 refreshed;
  - credits: 286 pages, 9,566 read, 1,570 corrected, 13 dropped;
  - the index;
  - `--check-ranges`. All six counts 0. In-range records by reason: 100,164 inside, 4,699 by the margin, 616 off a coast, 443 on an island. 7 `fixed:` lines. 2 `NOT FIXED`: Xeronema and Veronica bollonsii, which need a climate and have no grid here, with their island records in range (37, 56).
- **Not provable here:** the grid, the download, the backbone, the upload. The plan's stops and resumes behave as DEPLOY (c) says.

## For the owner's PC

`docs/DEPLOY.md`, "Round eighty-five: the owner's walk" (a) to (f), with commands, good output and times. The plan takes about three days of sittings, because iNaturalist's allowance is 4,000 requests a day for the credits.

## Not done, with why

Nothing of the reviews' findings. Left to the PC as steps of its walk, not work left: WebKit and Firefox ((a) 2), and the plan at full size with the grid, the download and the backbone ((c) to (e)). Held by rule rather than converted: Q's 153 code-text assertions under a ceiling that only falls (REVIEW-ROUND-85 §8 says why).

## Requests

- **Live site:** none.
- **GBIF API:** 230 by hand, one a second, as `cultifolio-review/85`.
- **The scratch walk's builder,** at its own pace, under the project's identity:
  - GBIF about 1,500;
  - Wikipedia, Wikidata, iNaturalist and Commons for 18 + 24 + 206 + 286 pages.
