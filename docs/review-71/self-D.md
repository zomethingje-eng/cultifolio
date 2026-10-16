# Round 72, reviewer D: the corpus step as the owner runs it

Area: `scripts/build-dossiers.ts`, `src/lib/dossier/corpus-fills.ts`, `fetch.ts`, `sources/*`, `live-check.mjs`, `DEPLOY.md`, and the process changes. Evidence is in `/tmp/claude-0/rev72/D-work/` (outputs `out-<tag>.log`, request logs `fetch-<tag>.log`, timings `time-<tag>.txt`). The trial fix is `/tmp/claude-0/rev72/D-fix.diff` (25 files, applies cleanly to `r72base`); with it the whole unit suite passes (3,678 passed, 8 skipped; `vitest-all.log`), `svelte-check` reports 0 errors, and every new case fails on `r72base` except those marked guard.

How I ran things: a copy of the live corpus at `D-s/` (linked as the working copy's `static/s`), Kew's files linked read-only. Offline steps ran on all 8,947 dossiers. Networked fills ran on a 174-dossier subset (`D-work/sub/`, chosen by `scripts/pick-subset.mts` with the fills' own predicates: every dossier a rerun would ask, the ten of `rebuild-wd.txt`, and 60 others), through a preload (`fetch-log.mjs`) that logs every request and holds each host to one request a second.

## Findings

**1. `--fill wikidata` writes an item's own IPNI and POWO numbers over Kew's (confirmed).** `corpus-fills.ts` line 443, in the branch where a re-proved item stands, copies `x.data.powo` and `x.data.ipni` from the item. A build passes the same numbers through `gbif.kewLinks` first (`build.ts` 450-455). The fill also rewrites the Wikidata record and drops its "IPNI and POWO linked by Kew's number" line. On the subset's second run, Ceropegia penduliflora went from Kew's 77357237-1 to the item's 77211853-1 (`out-wd3.log`), and `--fill kew-links` then put it back (`out-kew2.log`). Live pages are right today only because §9 ran `kew-links` after `wikidata`. Exposure: 49 live dossiers whose Kew numbers differ from their item's carry no re-proved mark, and their records do not say they were found by their own GBIF key (counted offline from the records). Any later rerun of the fill, or a plan that runs it last, would put wrong links on those pages. Fix (in the diff): share `kewAsk` with `crossIds`, apply `kewLinks` and keep the note, as a build does. Test: `r72d-corpus-fills.test.ts`. Side effect: Solanum nigrum's POWO now also takes Kew's number, which is what a build gives, so one expectation in `r70b-corpus-step.test.ts` changes.

**2. Nothing asks Wikidata again about a species whose row says it did not answer (confirmed).** `fillWikidata` re-proves only items with an `ok` row and items refused by the label rule. `rebuildList` lists kept identifiers only when no build is named. The nine species of `rebuild-wd.txt` that still need changing were rebuilt while Wikidata lagged (built 15:28 to 15:34 on 2026-10-15). Their rows now say "wikidata maxlag …; the identifiers of the build of 2026-10-14 are kept", so no fill and no list will name them again; only the stale `rebuild-wd.txt` remembers them. In the corpus as a whole, 19 dossiers have a Wikidata row of `error`: those nine, Reicheocactus famatimensis (lagged since 2026-10-11), and nine doubtful names carried as "error" since a September rederive. Rule 2 holds (each page says "not answered"), but none of them would ever be asked again. Fix (diff): the fill also re-proves `error`/`refused` rows. A found item is listed for `--keys`. "Still none" is written as Wikidata's answer. End to end on the subset, the fill listed all nine (`e2e-rebuild-wd.txt`).

**3. A dossier cut off mid-write disappears from the index and the manifest without a word (confirmed).** `scanDossiers` catches the parse error and goes on. In `D-work/trunc/` (four dossiers, one truncated), `--index` exited 0 and wrote an index of three, with new products and a new manifest, ready to upload. A Ctrl-C or a crash during any fill's `writeFileSync`, or during `--index`'s restamp, can do this. `diskStore.write` is not atomic. Fix (diff): the scan collects unreadable files, and `--index` names them, exits 1 and leaves the index, products and manifest as they were. A build run names them too. Test: `r72d-index-unreadable.test.ts`, which runs the script. Still to do: make `diskStore.write` write a temporary file and rename it.

**4. `--list-rebuild` lists work already done (confirmed).** On the live corpus it lists 55 species (`list-rebuild-now.txt`), and every one of them is among the 69 the owner has just rebuilt (`comm`, 0 new). The reasons compare two rules, not the page against the rule. "Kew's entry … was X, is now Y" (24) is `legacyAccepted` against `accepted` and never changes. "Homonym key" (13), "range taken under an older name" (12) and "50 synonyms" (6) stay true after a correct rebuild. A novice who runs "list, then rebuild" goes round forever, and a one-command step cannot use "the list is not empty" as a stop. Recommendation (not in the diff): stamp each dossier with the rules round that built it (`rules: 72`) and list only older stamps, or compare the stored field with what the rule would give, as the native-range check already does.

**5. `--fill kew-links` cannot resume after Ctrl-C (confirmed).** It saves its progress only when GBIF refuses. Stopped by SIGINT after 51 requests, it left no progress file, and the rerun asked all 145 again (`fetch-kew1/2.log`). On the corpus that is 8,795 requests, about 37 minutes at the builder's pace, every time. A completed run also asks everything again: no mark is kept in the dossier. Fix (diff): save every 50 reads (test), plus the day cache (item 4 below).

**6. `--fill gbif-open` asks some species again on every run, and its count leaves them out (confirmed).** When GBIF's openly licensed photographs all lack the author their licence needs, `photosFromMedia` returns none. The fill then writes `gbif.media: ok` with no photograph and returns `{ added: 0 }`, which is counted neither as filled nor as none. The subset run said "85 dossiers had no photograph: 2 were given 48 …, 75 have none there, 0 not answered" (77 of 85). The second run asked the same 8 again (`out-open1/2.log`): Ceropegia macrocarpa, variegata, arabica, scutellata, sprengeri, cereiformis, Colchicum schimperi, Kedrostis gijef. Fix (diff): record it as `none` ("… none naming the author its licence requires") and count it. `--fill commons` has the same counting gap (68 asked: 0 given, 63 none, 5 uncounted, which were files already held), but it does not ask them again.

**7. The script misreports and leaves stale lists (confirmed).** When `--fill wikidata` stopped because GBIF failed, it printed "GBIF: api.gbif.org fetch failed: Wikidata was waited for and did not answer" (`out-wd1.log`). A finished run with nothing to rebuild leaves last round's `rebuild-wd.txt` behind, where `--keys rebuild-wd.txt` would rebuild it again. The fills exit 0 when they stop unfinished, so the owner can tell only by reading. Fix (diff): name the source as it is, and delete a stale `rebuild-wd.txt` once a run finishes. This is safe only together with fix 2, which re-finds the nine. The one-command step reads the builder's own "run … again" sentences, which a seam test pins. A distinct exit code (3) would be better.

**8. The upload can leave a mixed corpus, and the live check would pass (confirmed by reading; not run against R2).** Dossiers are served from fixed paths (`no-store`), so each one goes live as `rclone copy` line 1 lands it, under the old manifest. If line 1 is cut off, old and new dossiers are mixed until it is rerun. If line 2 (the manifest) never runs or fails, `live-check` still passes: it checks `manifest:true`, not which corpus. Fix (in the one-command step): `rclone check --one-way` between the lines, with the manifest sent only when the bucket holds every file as it is on disk; then poll `/api/corpus` until it serves the local manifest's id (up to three minutes), else fail.

**9. Prune failure modes (confirmed by reading and by the staged manifests).** The `--keep-list` logic is right: it keeps the live manifest's and this folder's two manifests' files, and the delete applies only under `p/`. The `/hash.json` filter lines are anchored to `p/`, and `--use-server-modtime` makes `--min-age` mean "uploaded more than a day ago". Three gaps:
- If `rclone copyto` fails, an older `live-manifest.json` from an earlier prune is used without a word.
- `manifest.prev.json` is not "the corpus before the live one". Every fill rewrites the index, so it is the previous fill's corpus. The staged one is `2c9074e5a909eb26` (14:03 today), which was probably never uploaded, and round 70's live `0c2959d95b5883d2` is named by nothing local.
- If the Worker refuses the bucket's manifest (an older Worker, a manifest it cannot read), isolates keep serving the corpus before. The prune keeps only the bucket manifest's files and deletes the files the site is serving.

The diff's `--prune` deletes `live-manifest.json` before `copyto` and stops if `copyto` fails. It stops if the site serves another corpus than the bucket's manifest, or if the bucket lacks a file the live manifest names. Its dry run is a stop of its own, with counts. On the "about 3,000 files replaced by round 71": those are overwritten dossiers, and R2 keeps no old versions, so there is nothing to prune. Only `p/` gathers about 117 new products for each corpus uploaded.

**10. Smaller ones.** A fresh clone cannot run `npm run dossier` until `svelte-kit sync` has made `.svelte-kit/tsconfig.json` (`$core` is not found; confirmed). The owner's checkout has it. `DEPLOY.md` has no round 70 or 71 corpus steps, so the owner followed `REVIEW-ROUND-71` §9. The fetch layer's "waiting N s" lines print only on a TTY, so they disappear when output is piped; the diff adds `CORPUS_STEP`.

## Open issues in my area

**The ten Wikidata changes, and whether a fill can write them.** Rubus parviflorus already has Q2614003: a later `--keys rebuild-keys.txt` (16:02) found it. Nine remain. I read the eleven items once:
- **The eight "none → item" species.** Wherever the item names an iNaturalist taxon, it is the one already stored (7 of 7; Raphionacme's item names none and keeps its 920218). Wherever the item has an English sitelink, it is the stored summary title (6 of 6; Raphionacme and Othonna rosea have neither). P373 is the name, which is the build's default Commons category anyway. So a rebuild would change only `ids.wikidata`, `links.wikidata`, WFO, the POWO and IPNI links (now absent on all eight, because the item was refused) and the Wikidata record. A fill can write exactly that.
- **Agave variegata.** It differs: its iNaturalist id 165135 (Manfreda variegata) came from the old item Q15523250, and the new Q391952 gives none. That needs a build.

The cheapest safe route: `--fill wikidata` writes a changed item when everything the item feeds a build agrees with the dossier (iNaturalist id, sitelink against the summary, Commons category). It links by Kew's numbers and lists the rest for `--keys`. That is not in the diff. With the diff, the fill lists all nine, and `--keys rebuild-wd.txt` rebuilds them with no lag wait. The rebuild costs mainly the load of `occurrence.zip`, which I could not time here. Reading round 71's `report-71.txt`, Nerine sarniensis took 612 s and Bisnaga 109 s, consistent with the lag waits that fix 2 below removes.

**maxlag (process change 3).** The builder sent `maxlag=5` on every Wikidata read:
- `wikimedia.ts`: `entityOf`, and in `crossIds` the P846 search, `wbsearchentities`, the P961 search, the older names' search and their `wbgetentities`;
- `corpus-fills.ts` 422.

The waits are `mwGet` (five asks once `startCorpusRun` sets them), `patiently` (rounds of 60, 120 and 300 s, about 40 minutes), `lagSpell` in the build path and the two `patiently` calls in the fill. Behaviour, read live with `maxlag=-1` (`maxlag-probe.txt`):
- Wikidata's `api.php` answers HTTP 200 `{"error":{"code":"maxlag",…,"type":"wikibase-queryservice","queryserviceLag":409}}`, with `Retry-After: 5`. The lag is the query service's.
- `Special:EntityData` ignores the parameter.
- Commons answers `"type":"db"`, its own replicas.

MediaWiki's manual says maxlag applies to every `api.php` module and that non-interactive clients "should always use it". On Wikidata, though, the figure it waits on is the query service, which no read of an item, label or `haswbstatement` search depends on. The diff therefore removes it from Wikidata reads only. It keeps Commons' (a database lag, which is real there) and every 429/503 back-off. The subset runs met real 429s from Wikidata on our shared address: they were waited for and retried, and the fill stopped as "not answered" (`out-e2e4.log`).

The 53 failures that a naive removal causes are in 7 files. Exact lookups in recorded JSON are keyed with `&maxlag=5`: 65 keys in `r70c-wikidata-86.json` and `r70b-wikidata-items.json`. Five regexes used `&` as the end of a parameter (`P846%3D<key>&`, `P961%3D1-1&`, `props=claims&`). The least invasive rework, done: a helper `tests/unit/helpers/recorded.ts` looks answers up with `maxlag` removed from both sides, so the recorded files are untouched and pass before and after, and `(&|$)` goes in the five regexes. `/about/how`'s "while it lags … waits the lag out" sentence was no longer true, so it is rewritten, with its seam test (`r71f-about-70bc`); F should read it. `patiently` and `lagSpell` are now dead for Wikidata and can go in a later round.

**One command (process change 2), trial in the diff: `scripts/corpus-step.mjs`, plan `scripts/corpus-plan.txt`.** The command is `node scripts/corpus-step.mjs`. Under `npm run`, Ctrl-C asks "Terminate batch job (Y/N)?"; either answer is safe, but the prompt confuses. The plan lines are `backup`, `dossier <args>`, `if-exists <file> …`, `review <what to read>`, `upload` and `live-check`.
- **State and log.** Each step's state goes to `corpus-step.json`, written atomically. All output goes to `corpus-step.log` in the project folder, with each `\r` progress line kept in its last form.
- **Resuming.** A finished step is never rerun, and a stopped one is rerun next time.
- **Stops.** Each prints one sentence and the command to type:
  - a source did not answer (exit 3; "run the same command again in an hour or so");
  - drops (exit 2; read `drops.txt`, then `--go-on`);
  - a dossier that cannot be read, or an index smaller than at the backup: never passed by `--go-on`, and the step reruns once put right;
  - the plan's review before upload, which states the corpus id, the species count and the dossiers that differ from the backup;
  - a failed upload check, or the site not serving the new id;
  - Ctrl-C (exit 130). A second Ctrl-C exits at once with the state written.
- **cmd.exe.** It spawns `process.execPath` and `rclone` with argument arrays and no shell, so "AI Work" in the path needs no quoting. On Windows, Ctrl-C reaches the child as well; the step is marked "interrupted".

Run end to end on the subset (`e2e-corpus-step.log`): two GBIF connection failures and three Wikidata 429 stops each stopped with the right sentence, a Ctrl-C mid-`kew-links` was recorded, and the rerun carried on, reached the `rebuild-wd.txt` review with nine species, then `--index`, then the final review. There are 21 tests (`r72d-corpus-step.test.ts`), including the prune.

**Caching the day's answers (process change 5), trial in the diff: `src/lib/dossier/day-cache.ts`.**
- **What is kept.** It keeps `ok` and 404 answers by exact URL in `cache/upstream/<UTC day>/<sha1>.json` (written atomically, gitignored, outside `static/`).
- **What is not.** It never keeps refusals, failures, timeouts, or MediaWiki errors sent with HTTP 200. Those are asked again and said "not checked" (rule 2).
- **How long.** A run serves only the same day's entries, so a day a page states is the day the source said it. Earlier days are deleted when a run starts. Deleting the folder changes nothing but what the next run asks (rule 6). `--no-cache` asks everything.
- **What it covers.** Every fill's and build's fetcher goes through it except NASA POWER, which has its own cache.
- **Measured.** The second `kew-links` made 144 requests without the cache and 0 with it (`time-kewc1/2.txt`), at about 4 KB an answer, about 37 MB a day for the corpus.

What a rerun asks without the cache, counted on the live corpus by the fills' own predicates (`rerun-count.out`):

| Fill | What a rerun asks |
|---|---|
| `kew-links` | 8,795 requests, every time |
| `wikidata` | 167 batches of 50, every time, plus every item re-proved |
| `gbif-basis` | 53 |
| `gbif-open` | 85 |
| `commons` | 70 |
| `commons-kind` | 0 |
| `summaries` | 0, or 233 with `--again` |

A `--keys` run restarted after drops asks all of its species' sources again. Those three (`kew-links`, `wikidata`, `--keys`) gain most.

**Dry runs (process change 1).** All on the full corpus unless stated; times are on two shared cores:
- `--index`: 132 s, peak 436 MB, a no-op that reproduced corpus `4c784c5dc7ca2448` with 0 files changed (`snap.py`).
- `--fill range-source`: 71 s, peak 2.4 GB (Kew's files), a no-op ("476 said so already").
- `--list-rebuild --bulk`: 30 s, 2.2 GB; see finding 4.
- Subset networked fills (1 request/s/host):
  - `gbif-basis`: 53 requests in 26 s, then a no-op;
  - `gbif-open`: 85 requests in 41 s, then 9 again (finding 6);
  - `commons`: 68 requests in 465 s, through 25 × 429, then a no-op;
  - `commons-kind`: 0;
  - `summaries`: 0, or 11 with `--again`;
  - `wikidata` and `kew-links`: as above.

The subset's index has 174 names, so Commons slip rules read fewer held names than on the full corpus: the subset gives timings and resumability, not the full corpus's outcomes. **`--keys` cannot be dry-run here.** Without `occurrence.zip` the build takes records from GBIF's API instead, and without `climate/` the climate stays pending. Both its drops and its timing would therefore differ from the owner's. A dry run here can cover the argument and file handling, Kew's rows, the online identifier, photo and summary steps, the drops audit, and `--index` after it.

**Tiered tests (process change 4).** I did not change Playwright workers (not my area). The corpus-builder files above need only the unit tests plus strict Chromium.

## Recommended corpus step for the owner (with the diff)

`node scripts/corpus-step.mjs`, with the plan:
1. backup;
2. `--fill wikidata` (lists the nine);
3. `--keys rebuild-wd.txt --grid climate --bulk bulk`;
4. `--fill kew-links` (always after any Wikidata change);
5. `gbif-basis`, `gbif-open`, `commons`, `commons-kind`, `summaries`;
6. `--index`;
7. review;
8. upload and live check.

A day later, `node scripts/corpus-step.mjs --prune`, read the dry-run counts, then `--prune --go-on`. Without the script, the manual prune needs one added line: delete `live-manifest.json` before `rclone copyto`, and check that `npm run live-check`'s corpus id equals that file's id.

## Checked and sound

- `--index` on the staged corpus reproduces the live id. The live `/api/corpus` serves `4c784c5dc7ca2448` (one request).
- `commons-kind`, `gbif-basis` and `summaries` resume and are idempotent (second runs ask nothing).
- `--keep-list` refuses a non-manifest and anchors its filter lines correctly.
- The Worker reads products only through the one manifest it holds (`server/dossiers.ts`), so deleting other corpora's files is safe once isolates have moved on, given the site check above.
- The fetch layer's 429 and 503 retries and cooling work against real Wikidata 429s.
- `kewLinks` in builds is correct.

## Not done

- No `--keys` run.
- No upload or prune against R2.
- No full-corpus networked reruns: the subset only, to stay polite.
- Nothing run on Windows; the `cmd.exe` behaviour is reasoned from Node's and npm's documented behaviour.
- No browser specs for the one-sentence about-page change.
- The full count of item 1's exposure from Wikidata was cut short by Wikidata's 429s on the shared address. The 49 is an offline upper bound from the records.
