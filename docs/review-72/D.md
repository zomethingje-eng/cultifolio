# Round 72, fixes by D: the corpus step

Branch `r72` in `/tmp/claude-0/rev72/D/`, six commits on `r72base` (`38ab05d` to the last). `/tmp/claude-0/rev72/D-fix.diff` is the same work as one diff (28 files). Checks on the final tree:
- whole unit suite: 3,687 passed, 8 skipped (`D-work/vitest-all3.log`);
- `tsc --noEmit -p .`: 0 errors;
- `svelte-check --threshold error`: 0 errors.

Every new case fails on `r72base` unless it is marked guard. I checked this by running the new files on a clean `r72base` worktree.

## Done

**maxlag.** `maxlag=5` is gone from all seven Wikidata read URLs (`sources/wikimedia.ts`, `corpus-fills.ts`):
- `entityOf`;
- the P846 search, `wbsearchentities` and the P961 search;
- the older names' search and their `wbgetentities`;
- the fill's batch read.

Commons keeps it, because there the lag is its own database's. The fetch layer's 429/503 back-off is unchanged, and the dry run met it many times on the shared address.

The 53 tests that the removal broke now read their recorded answers through `tests/unit/helpers/recorded.ts`, which ignores `maxlag` on both sides, so the recorded JSON is untouched. Five regexes take `(&|$)`. Test: `r72d-wikidata-unlagged.test.ts`, covering every Wikidata read of the 86 recorded cases and the fill's batch read, plus two guards for the back-off.

**D1.** When an item stands, `--fill wikidata` now links IPNI and POWO by Kew's numbers for the name and author, as a build does: it shares `kewAsk` with `crossIds`, then applies `kewLinks`, and the record keeps the "IPNI and POWO linked by Kew's number" line. Test: `r72d-corpus-fills.test.ts`. The case is Ceropegia penduliflora's older-name path: on base the item's 1-1 replaces Kew's 2-2.

One existing expectation changes in `r70b-corpus-step.test.ts`: Solanum nigrum's POWO is now Kew's number, which is what a build gives.

**D2.** The fill also asks again every dossier whose Wikidata row is `error` or `refused`.
- If an item is found, the species is listed in `rebuild-wd.txt`.
- If there is still none, the row becomes Wikidata's answer (`none` or `ambiguous`), marked re-proved, and nothing else changes.
- A finished run with nothing to rebuild deletes an earlier run's `rebuild-wd.txt`.

Tests: two cases in `r72d-corpus-fills.test.ts`.

**D3.**
- **Unreadable dossiers.** The scan collects the dossiers it cannot read. `--index` names them, exits 1, and leaves the index, products and manifest as they were. A build run names them too.
- **Write-then-rename.** New `scripts/write-atomic.ts` writes to `<file>.<pid>.tmp`, then renames it over the file. On Windows it retries a refused rename up to six times on EPERM, EACCES or EBUSY. It is used by every dossier writer in `build-dossiers.ts` (the store, the restamp, the literature, iNaturalist, prune, `--fill gbif` and build writes), by `names-step.ts`, and for the index and the manifest.
- **Leftovers.** `--index` deletes any `*.tmp` a stopped run left, and the upload excludes `*.tmp`.

Tests:
- `r72d-index-unreadable.test.ts` runs the script on fixture dossiers with one truncated: exit 1, the file named, the manifest unchanged, and a leftover `.tmp` deleted.
- `r72d-write-atomic.test.ts` checks the replacement, a failed write that leaves the old file whole, a refused rename that is retried, and a seam that no dossier is written in place.

**D5.** `--fill kew-links` saves what it has read every 50 dossiers. Test: a run cut off after 75 has saved 50, and the next run passes them by.

**D6.**
- `--fill gbif-open` records "GBIF records under an open licence have photographs, none naming the author its licence requires" as `none`, counts it, and passes it by next time.
- `--fill wikidata` names the source that did not answer ("GBIF, checking an item: …: not answered"), not always Wikidata.

Test: in `r72d-corpus-fills.test.ts`.

**D7.** A fill that stops unfinished exits 3, through `unfinished()` in `build-dossiers.ts`, which never overwrites an exit 1. This covers openalex, inat, gbif-open, commons, commons-kind (unchecked files or slips), gbif-licence, gbif-basis, kew-links, inat-ids, wikidata, summaries (any not checked), `--names` and `--fill genus`. Test: `r72d-exit-codes.test.ts` runs `--fill kew-links` with every request failing: base exits 0; now it exits 3 with its sentence.

**D8.** The command's upload runs:
1. `rclone copy` of everything but the manifest;
2. `rclone check --one-way` of the same files, sending no manifest if the bucket is short;
3. the manifest;
4. `live-check`, then waits up to three minutes for `/api/corpus` to serve the local manifest's id, and fails if it does not.

**D9 and the bucket's unlisted dossiers.** `--prune` does the following:
1. Deletes any earlier `live-manifest.json`, then copies the live one down. It stops if that copy fails.
2. Makes `keep.txt`.
3. Stops if the site serves another corpus than the bucket's manifest.
4. Stops if the bucket lacks a file the live manifest names.
5. Makes its dry run a review stop, with counts.

Only `--prune --go-on` deletes.

After every upload, the command also writes the bucket's top-level `<key>.json` files that the index does not list to `bucket-unlisted.txt`. That is a report only: nothing is deleted.

Tests: in `r72d-corpus-step.test.ts`.

**The one command:** `node scripts/corpus-step.mjs`, with the plan in `scripts/corpus-plan.txt`.
- Steps are recorded in `corpus-step.json`, written atomically. The output goes to `corpus-step.log` in the project folder, with progress lines collapsed.
- It runs `svelte-kit sync` once, before the first builder step or the prune, and stops if that fails.
- Exit codes: 3 for "run again later", 2 for a review, 1 for a failure, 130 for Ctrl-C. A second Ctrl-C exits at once, with the state saved.
- Drops and the plan's reviews pass with `--go-on`. An unreadable dossier or a shrunken index never pass: the step runs again once it is put right.
- `--status` lists the steps and changes nothing.

There are 23 tests (`r72d-corpus-step.test.ts`), and it ran end to end on a 174-dossier copy in round 72's review (`D-work/e2e-corpus-step.log`).

**The day cache.** `src/lib/dossier/day-cache.ts` keeps `ok` answers and 404s by exact URL in `cache/upstream/<UTC day>/`, for that day only. It never keeps refusals, failures or MediaWiki errors sent with HTTP 200. Earlier days are deleted at the start of a run, and `--no-cache` asks everything. Every builder fetcher goes through it except NASA POWER's, which has its own cache. Test: `r72d-day-cache.test.ts`.

`--fill wikidata`'s batches of fifty now hold every answered item, asked or not, so a batch is the same URL on every run of a day; only a batch with an item to ask is sent. Test: it fails on base, where the batch held only the items to ask.

**DEPLOY.md.** Section 5 opens with round seventy-two's corpus step for a novice, in seven steps, with commands in blocks:
1. `cd /d` into the folder, quoted for "AI Work".
2. Start the command. Every kind of stop and what to type after it is explained here.
3. Review the rebuild lists, with what good looks like.
4. Review `drops.txt`.
5. Review before the upload.
6. The upload and live check, which need no review.
7. The prune a day later, with its dry run as a review.

It ends with how to go back to the backup.

`/about/how` is F's, so my trial's sentence change is withdrawn; it is listed under Needs.

## Needs

**F, `/about/how`.** The lag clause is now untrue. Replace:
"When Wikidata does not answer (while it lags it is asked again: the first species of a run to find it lagging waits the lag out, and one after a species that stayed lagged does not)"
with
"When Wikidata does not answer (its items are read without waiting on the lag of its query service, which no read of an item depends on, and a refusal or a busy answer is asked again after the wait it names, up to five times)".

I checked the replacement against `fetch.ts` (`RETRIES = 5`, Retry-After honoured up to 120 s) and against the URLs. The seam test `r71f-about-70bc.test.ts` ("the lag, waited out once in a run") asserts the old words and should become a test that every Wikidata URL lacks `maxlag` (as in `r72d-wikidata-unlagged.test.ts`). That file's fixture lookup already goes through `recordedFetcher`; keep that line.

**C.**
- `markSharedPhotos` and `fillInatDescendants` write dossiers with `writeFileSync`. Route them through `writeAtomic` from `scripts/write-atomic.ts`. Since `src/` modules should not import `scripts/`, take a write function or a `DossierStore` from the script.
- In `--fill inat --bulk`, call `unfinished()` (defined beside `today` in `build-dossiers.ts`) when `fillInatDescendants` is refused or leaves a page not answered.
- Make its fetcher `upstream()`, not `makeFetcher()`. The day-cache seam test counts exactly two `makeFetcher()` calls in the script, so a new one fails the merge on purpose.

**A and B.**
- If `--fill kew-names` or `--fill range-source` write dossiers other than through `diskStore()`, use `writeAtomic` the same way.
- Any networked call should take `upstream()`.
- An offline fill that cannot finish should call `unfinished()`.

**E.** `bucket-unlisted.txt` lists the keys E4 should answer as not found.

**Merge.**
- My hunks in `build-dossiers.ts`:
  - `makeFetcher()` becomes `upstream()` in thirteen fill and build call sites;
  - `writeFileSync` becomes `writeAtomic` at the dossier, index and manifest writes;
  - `unfinished()` is added before each "run again" sentence;
  - the unreadable-dossier block sits right after `const index = …` in `writeIndexFromDisk`, which keeps that function's seam in `r63c-sitemap`.
- In `corpus-fills.ts`, my hunks are inside `fillKewLinks` and `fillWikidata`.
- `.gitignore` gains `/backups/`, `/cache/`, `/corpus-step*` and the run's lists.

## The corpus step

**The plan.** `scripts/corpus-plan.txt` holds round 72's step, 19 steps in order:
1. backup
2. `dossier --fill wikidata`
3. `dossier --fill kew-links`
4. `dossier --fill kew-names --bulk bulk`
5. `dossier --list-rebuild --bulk bulk`
6. a review of `rebuild-wd.txt` and `rebuild-keys.txt`
7. `if-exists rebuild-wd.txt dossier --keys rebuild-wd.txt --grid climate --bulk bulk`
8. the same for `rebuild-keys.txt`
9. `dossier --fill range-source --bulk bulk`
10. `dossier --fill inat --bulk bulk`
11. `gbif-basis`
12. `gbif-open`
13. `commons`
14. `commons-kind`
15. `summaries`
16. `--index`
17. a review
18. `upload`
19. `live-check`

The flags are as A's, B's and C's reports give them. One departure from the coordinator's order: `kew-names` comes after `kew-links`, because A's report says to run it after `kew-links`, "which takes Cochemiea matehualensis's POWO link back". The file carries a MERGE marker on it. B's `--list-rebuild` and C's `--fill inat --bulk` are in the places their reports ask.

**What my steps print and change, on a fresh copy of the live corpus (`D-s2`).**

- **`--fill wikidata`.** It asked 8,349 items in 167 batches, re-proved 21 items and 19 "not answered" rows, and listed 16 species in `rebuild-wd.txt`:
  - the nine of round 71: Raphionacme linearis, Peperomia monticola, Agave variegata Q15523250 → Q391952, Tulipa clusiana, Othonna rosea, Convolvulus cneorum, Gunnera manicata, Salvia azurea, Agave ghiesbreghtii;
  - seven rows long "not answered" that now find an item: Reicheocactus famatimensis Q309663, Vera-duthiea zebrina, Manfreda arceliensis, Othonna divaricata, Urginea grandiflora, Cissus wilmsii, Agave wendtii.

  It changed 24 dossiers. 21 gained only the "re-proved" record, and none of them changed its identifiers or links: Ceropegia penduliflora keeps Kew's 77357237-1, which base would have replaced. Three doubtful names' rows went from a carried "error" to Wikidata's "none": Brachystelma bilobatum, Trimelopter crispolanatum, Drimia obstii.

  Before and after, in `D-work/f72wd-examples.txt`:
  - Ceropegia penduliflora;
  - Ixora coccinea;
  - Rubus parviflorus;
  - Fragaria virginiana;
  - Brachystelma bilobatum ("carried from build of 2026-09-19 (rederive)" becomes "none: no taxon item carries its GBIF key …; re-proved by --fill wikidata 2026-10-15").

  On the shared address it stopped three times with exit 3: two Wikidata 429s and one GBIF connection drop. Each time it resumed from its progress file. Later complete runs changed 0 files.

- **`--fill gbif-open`.** It asked 85: 2 were given 48 photographs (Ceropegia mixta, Ceropegia pulvinata) and 83 have none. Eight of those were settled as "none naming the author": Ceropegia cereiformis, macrocarpa, scutellata, variegata, arabica, sprengeri, Colchicum schimperi, Kedrostis gijef. The counts now add up. The second run asked 0 and changed 0 files.

**How it fails safe.**
- A source not answering is exit 3, and the same command picks up where it stopped.
- A truncated dossier can no longer be left by a stopped write. If one is there, the index is refused.
- The manifest goes up only after the bucket checks out, and the site must then serve it.
- The prune deletes nothing until its dry run has been read, and never while the site serves another corpus.

## Measured

Requests to Wikidata were throttled to one a second in the dry runs and met many 429s from the shared address:

| Run | Wall time | Requests |
|---|---|---|
| `--fill wikidata`, first stretch | 2,417 s | 334 |
| `--fill wikidata`, resumed | 1,046 s | 191 |
| `--fill wikidata`, a later complete run | 197 s | 19 |
| `--fill gbif-open` | 112 s | 85 |
| `--fill gbif-open`, second run | 27 s | 0 |

The later complete wikidata run's 19 requests were batches its resumed predecessor had skipped. The resumed run asked none of the first stretch's URLs again: the day cache served them. Peak memory was about 0.5 GB for these fills.

The day cache: a second `kew-links` on the subset went from 144 requests to 0; an answer is about 4 KB.

## Not done or departed from

- **Not run here.** No `--keys`, upload, prune or `live-check` was run against R2 or the site; their logic is tested with fakes, and `--keys` needs `occurrence.zip` and the climate grid. Nothing was run on Windows.
- **Not proved on a rerun.** The fully cached `--fill wikidata` rerun (0 requests) was not shown, because the UTC day turned between the runs and a new day starts a new cache.
- **Kept, now inert.** `patiently` and `lagSpell` no longer meet a lag from Wikidata. They are kept so this round's hunks stay small and Commons' `mwGet` waits keep working; they can be removed in round 73.
- **Order.** The plan's `kew-names` follows A's order, not the coordinator's (see above).
- **Writing the items by a fill.** I did not make the fill write a changed item whose identifiers agree, which would spare the `--keys` run for 8 of the 9. With the lag gone, `--keys rebuild-wd.txt` rebuilds the 16 species without waiting.
