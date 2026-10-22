# Round 80, agent I: iNaturalist

Branch `r80f` in `/tmp/claude-0/rev80f/I`, seven commits on the tag `r80f` (bbc8076 to 319df14). Scratch `/tmp/claude-0/rev80f/I-s/` (notes in `NOTES.md`, the proofs in `proofA/`, `proofB/`).

## Done

Everything below is safe to deliver between two fill days. The plan file and `corpus-step.mjs` are unchanged, the dossiers keep their form, and the fill carries on from where it stopped. Each new test failed on `r80f`: I ran all 24 in a detached worktree at the tag, and all 24 failed there.

### 1. A gentler, smarter fill

- **What it sent.** Each page cost one v1 cultivated search (`order_by=votes`, `per_page=12`). v1 returns every identification, taxon and user in full: 313 KB for two observations of Rhododendron austrinum, measured. V's pass adds one 24-observation wild search for each taxon of more than 24. A page without an id adds a name search.
- **iNaturalist's practices** ask for "about 1 per second, and around 10k API requests a day", the highest `per_page`, and "a concatenated list of multiple IDs".
- **Batches** (`src/lib/dossier/inat-batch.ts`, new):
  - One v2 search asks several taxa (`taxon_id=a,b,…`) for 200 observations, with `fields` naming only what `inat.photos` and `agreedCaptive` read. That is 3.5 KB for the same two observations. v1 and v2 gave the same totals and sets on 8 taxa.
  - A page's set is its first 12 (or 24) observations of the answer. That is exactly its own search's set when the answer is whole, or when it holds at least that many of the taxon. Any other taxa are asked again, or halved if none settled. A taxon alone is asked by its page's own search, of v2.
  - Cultivated: up to 50 taxa a search. Most-voted wild: 6 taxa of like size by the open data's counts (in a probe, 29 of 30 settled in one request).
  - `inatBatched` answers a page's unchanged `wildUrl`/`cultivatedUrl` request from the batch fetched ahead (300-page window). Every rule after that (licence, author, agreement, descendants) runs unchanged.
- **Pace and day.** One request every 2 s (`fetch.ts`). At most 4,000 a UTC day (`day-budget.ts`). The owner can lower it with `CULTIFOLIO_INAT_BUDGET` without touching a plan line.
- **Throttle versus allowance.**
  - iNaturalist's 429 is retried once, after a minute or its Retry-After (it was retried five times at 4 to 20 s). Then it is refused as `throttled by the host` (`THROTTLED`, `isThrottle`).
  - The fill waits 30, then 60, then 120 minutes and carries on each time. It stops for the day only if the throttle outlasts that, saying "this is iNaturalist's throttle, not the day's allowance (N of the day's 4000 requests made)".
  - The allowance's stop says "The day's allowance is spent (…); not a throttle". The old stop said "iNaturalist allows about 10,000 calls a day" either way.
- **Fewer reads.** The fill holds paths, not 48,000 parsed dossiers, and loads Kew's file once for both steps.
- **Files:** `inat-batch.ts`, `fetch.ts`, `day-budget.ts`, `scripts/build-dossiers.ts` (`fillPhotos` and `throttleWaits`, lines 642 to 912; the budget at line 194).
- **Tests:** `tests/unit/r80i-inat-gentle.test.ts` (10). V's and P's tests were updated where they read the old forms: V's three fill cases (the ids checked; the v2 address; Copiapoa humilis now asked in the same search) and two source checks in `r79p-inat-open.test.ts`, plus 9,000 to 4,000 in `r78b-inat-day.test.ts`. Each change carries a comment.
- **Days left:** about 16,000 requests, so about five fill days at 4,000, V's pass included. The code before had about 63,000 to 68,000 left, about twelve days at the roughly 5,500 a day iNaturalist allowed. The breakdown is under Measured.

### 2. An inactive taxon said as "nothing to report"

- **The fill.** `--fill inat` first runs `fillInatIds` with a new `unchecked` option: every id with no "ok" `inat.taxon` row, thirty a request. It follows an inactive id to its current taxon (`current_synonymous_taxon_ids`) by the build's rule (`judgeIdTaxon`), which takes it only when that taxon is this species, so nothing is guessed. That reopens the page's sets, and the page is then read again. "None" is now written only from an answer for a checked, active id.
- **An id the check could not reach** gets no set asked. It is counted and left for the next fill (exit 3).
- **`--wild`** never writes "none" for an id not yet checked. It writes "not asked" with the reason instead.
- **The open data's reader** marks an inactive taxon (`"active":false`). `store.active()` says so, and `heldWild` sends such a taxon to the API rather than answering "none" from the file. The PC's current file predates the mark, which is why the fill checks the ids too.
- **Files:** `corpus-fills.ts`, `inat-open.ts`, `build-dossiers.ts`.
- **Tests:** `r80i-inat-ids.test.ts`. One case follows an inactive 135254 to 999001 and reads its set from the open data with the observers named. Another checks `--wild`'s "not asked".

### 3. "Not asked" with no reason

- A build that skips iNaturalist writes on `inat.taxon` either "not asked: this build left iNaturalist to the daily fill (--fill inat), which asks the taxon by name", or, with an item's id, "… which checks taxon N, as Wikidata gives it, …".
- On both photograph rows it writes "… which asks for the photographs once the page's taxon is known".
- This covers pages with and without a GBIF key (`build.ts` `INAT_LEFT_TO_FILL`, `INAT_SETS_LEFT`; `build-kew.ts`).
- The build's log now says how many pages it left without a taxon (`build-dossiers.ts` lines 1994 and 2201).
- These pages' taxa are asked by the fill: it already put them in its to-do list, and its count line now says how many.
- On live pages the fill rewrites every such row when it reaches the page, so no reason is missing after the fill's own upload.
- **Tests:** `r80i-inat-ids.test.ts` (a keyless build with and without the item's id; Welwitschia with a GBIF key).

### 4. The 475 pages that lost their iNaturalist id

- **The cause.** The full build (`--skip inat --renew`) took only Wikidata's id. The photographs' carry restored an id only when the previous build had iNaturalist photographs, and the taxon row was never carried.
- **The fix.** `keptInatId` and `carryInatRows` (`rederive.ts`), called in the builder before the photographs' carry (`build-dossiers.ts` lines 2098 and 2121).
  - The previous id stays where this build has none or the same one, or where the previous was checked and the item's is not.
  - Its taxon row and any "none" set row are carried with it. "ok" sets come with their photographs, as before.
  - It applies only when iNaturalist was skipped and the build is not a re-derivation.
- **The repair.** `--fill inat-restore <backup>` (`src/lib/dossier/inat-restore.ts`), offline. It gives back, unchecked, the id the plan's backup held for a page that has none now, matched by page id or by GBIF key. It never restores an id another page holds, or one the fill's rule refused, and never twice. The fill then checks and fills those pages.
  - Without it, the fill would ask these pages by their accepted name alone (`sameType: []`), so it would not find an id that was found by an older name.
- **Tests:** `r80i-inat-ids.test.ts` (the keep rule, the builder's order, and the restore's six cases).

### 5. API-era wild sets: read again (no requests where the set is whole)

- **Chosen by the rules.**
  - The sets keep observations' numbers and places, and their CC0 credits name no one (rule 4: 364 of the 492).
  - Saying "which source each set is from" would leave `/about/how`'s uuid and observer sentences false on most old pages for good. Reading them again makes every set follow one rule.
  - The cost is small:
    - a taxon of 24 or fewer: read from the open data at no request;
    - more than 24: V's most-voted pass, 6 taxa a search (about 2,750 old pages, about 460 requests), which V's 19,600 already counts by name.
  - A set of a taxon the open data does not hold is the API's by the rule, and stays.
- `--wild` re-reads only the whole sets, from the file.
- A set whose re-read fails keeps what it had and is asked again next fill.
- **`/about/how`** (line 36) now says such a set is read again when the fill reaches the page. Until then it is "the 24 iNaturalist put first by votes the day it was asked, each with the locality iNaturalist names and its page by the observation's number".
- **Tests:** `r80i-inat-sets.test.ts`.

### 6. CC0 photographs naming no author

- `cc0Credit` (`sources/inat.ts`) writes "Alan Weakley, no rights reserved (CC0)": the observer's name, or the login where there is none. The API and the open-data file both carry the user.
- `creditWithoutMail` now reads a line without "(c)". The tile shows "CC0, Alan Weakley".
- The fill reads again any set holding an unnamed CC0 photograph:
  - from the file, at no request, for open-data sets of 24 or fewer;
  - in the cultivated batches for cultivated sets;
  - API-era sets go under 5.
- The PC's `inat-wild.jsonl` need not be rebuilt.
- **`/about/how`:** "an iNaturalist photograph's author is its observer, by name or, where there is none, login, under CC0 too…", and it says a photograph not yet reached may still say "no rights reserved".

### Also

- **Kew's descendants.** The full build dropped the "descendants read against Kew's file" marks, so the descendants step would have asked about one page in five for its taxon's children, about 9,000 requests. The fill now reads such a candidate's sets with Kew's filter (the wild set from the file where it is whole, the cultivated set batched) and marks it (`kewReading` in `inat-kew-fill.ts`).
- **Shared files** (my edits, by line):
  - `build-dossiers.ts`: usage lines 14 to 22 and 70; lines 192 to 194; `fillPhotos` and `fillInatDescendants`, 642 to 950; `fillInatRestoreStep`, about 1258 to 1278; 1994, 2098 to 2121 and 2201.
  - `/about/how`: three clauses in line 36, for wild sets, CC0 authors and id checks.
  - DEPLOY: lines 232, 256, 307 and 497, and the new section at line 595.
  - README: line 33.

## Repairs for the live site

- **The 475 lost ids.** On an evening after a fill day's run has ended and before the next:

  ```
  findstr backupDir corpus-step.json
  npm run dossier -- --fill inat-restore backups\v3-<that id>
  ```

  It takes under a minute, offline, and writes `inat-restored.txt`. The next day's plan step checks the ids (thirty a request) and fills the pages. They reach the live site through the plan's own final `--index` and upload. Pages it will not give back: those whose old id another page now holds, or that the fill's rule refused. Each is listed in `inat-restored.txt` with why.
- **Everything else is repaired by the plan's own `--fill inat` days:** the inactive ids (about 2% of ids), the missing reasons, the API-era sets, the CC0 credits and the Kew marks. Nothing else to type.

## Needs

- **U (optional):** `src/lib/ui/ref/photos.ts`, `photoSourceGaps`, says "iNaturalist … were skipped (not asked)". The rows now carry the reason ("left to the daily fill"), which Provenance shows. The photographs' sentence could add it when the row's detail starts with `INAT_LEFT_TO_FILL` or `INAT_SETS_LEFT` (exported from `build.ts`).
- **The merge:** keep V's rule and words. I changed V's tests, not V's rule: the ids are checked, the address is v2, and Copiapoa humilis is in one search. `fillInatIds` gained a fourth parameter, and `sameTypeOfRows` is exported.

## For the owner's PC

- Deliver at any time between fill days. Then type the restore above once, then carry on with `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt` daily as before.
- On the first day, the count line names the re-reads, and a check line comes first ("first, the … iNaturalist ids no build or fill has checked…", about 1,400 requests).
- Lines saying "waiting 30 minutes, then going on" are the throttle being waited out: leave the run going.
- Keep `bulk\inat-wild.jsonl` until the fill ends.

## Measured

- **Probes** (2026-10-22, 2.2 s apart, as `cultifolio-review/80`):
  - 50-taxon cultivated batches had 418 to 856 results.
  - Grouped wild batches settled 29 of 30 taxa in one request.
  - Among observations with no votes, iNaturalist's order changes from request to request, in v1 and v2 alike.
- **Proof A** (`scripts/dev/scale/results/r80i/`). The real fill on 300 random pages of round 77's corpus, rekeyed, with Kew's file and no open data:
  - 74 iNaturalist requests in 3 min 12 s: 9 checks of 247 ids, 42 name or children requests, 23 observation searches for 269 cultivated sets.
  - The code before asked about 300.
  - 343 of 343 CC0 cultivated credits name the observer.
  - Of 40 pages asked again by their own search, 34 had the same photographs. The other 6 differ only among observations with no votes (checked).
- **Proof B.** V's 50 pages with P's open data: 10 requests where V's run made 70. The sets hold all 78 voted observations of V's answers from the day before, and 457 of their 480 observations (V measured 460 between two of the API's own days).
- **The rest of the fill** (estimates):

  | Work | Requests |
  |---|---|
  | id checks and follows | 1,700 |
  | name searches (13 to 19% of pages without an id) | 6,200 to 9,000 |
  | cultivated | 3,300 |
  | most-voted | 3,500 |
  | other | 400 |

  About 16,000 in all, about five days.
- **Checks.** `tsc` is clean. `svelte-check` reports 0 errors. Script types are the same as the base (only paths differ). The whole unit suite: 467 files passed; 1 test failed, in `r74-spaces` (my "place" on `/about/how`). I reworded that clause to "locality" and reran `r74-spaces` and my sets test, which pass. I did not rerun the whole suite after that.

## Not done, with why

- **Older names in the fill's name search.** Without them, a page found only by an older name (such as Dracaena trifasciata) is missed. Asking them would cost up to five iNaturalist requests per page without an id (about 6,000 pages); the restore covers the 475. This is the owner's call.
- **A local name lookup** from the open data's `taxa.csv` would save most name searches. It needs that file on the PC and misses iNaturalist's synonym matches.
- **No browser test.** No layout changed; the about-page text is covered by a unit test.
- **The real fraction of pages without an id** on the PC is not known here. The count line on the first day gives it.
