# Review B, round 81: the build and the pipeline

**Verdict: works with faults.** Everything the walk still has to run exists, takes the flags DEPLOY gives it and prints the lines DEPLOY quotes. Ctrl-C, a stopped upload and the day's allowance each stop cleanly, and the same command carries on. Round 80's plan-file fixes hold. Three faults matter before the owner reaches section (d):

- (d)'s offline re-derivation strips the Wikidata English names from the keyless pages it rebuilds. The record still says a name was taken, and drops.txt does not flag it (B1).
- A fill that loses its network marks pages "error" and keeps going. On the last fill day it then passes step 11 and stops at the review saying "Every dossier has been asked for its photographs" (B2).
- Every rebuild that skips iNaturalist rewrites a filled page's cultivated row so that it is no longer settled and its Provenance gives the wrong day. The next fill or refresh asks those pages again (B3).

No page's photographs or iNaturalist ids are lost by any rebuild I ran. Nothing here needs a code change before the owner's next fill day. B1 and B4 need two extra lines typed in (d), and B2 needs the owner to keep the PC awake and look at the fill's counts.

**What I covered.**

- **Corpus copies.** A rekeyed copy of round 77's corpus: 8,947 pages, version 3, corpus `561725a2b5fe66f7`, in `/tmp/claude-0/rev81r/B-s/w`. A 30-page copy of it set at the PC's step 11, made with the PC's plan file, a backup and `corpus-step.json` as `inputs/pc-state.txt` gives it, in `/tmp/claude-0/rev81r/B-s/w2`.
- **Runs of `corpus-step.mjs`.** 9 real runs:
  - a cut fill
  - a resume
  - a last day with no network
  - a Ctrl-C
  - two runs at once
  - an upload cut after 10 files, then its rerun
  - `--status` on a changed plan
  - round 80's plan-switch cases
- **Builder runs.** 17, including the offline listings and `--prune-followed` at measured and scaled heaps, `--index`, `--fill wikidata-names` (for real), three `--keys … --offline` rebuilds, and `--fill inat` at an allowance of 0.
- **Requests.** 102 to cultifolio.com: `/api/corpus`, `/api/index` and 100 random dossiers. About 20 to third parties: 11 to api.inaturalist.org at the builder's 2 s pace, 1 to Wikidata's query service, and GBIF's occurrence search for two pages, under 10.
- **Stand-ins.** A network stub (`B-s/netstub.mjs`) cut or allowed each host and logged every fetch. A fake `rclone` (`B-s/bin/rclone`) worked on a local bucket (`B-s/fakeR2`). There is no rclone here.
- **Unit tests.** 6 unit files of the build passed, 55 tests. DEPLOY's round-eighty walk was read line by line against `scripts/corpus-step.mjs` and `scripts/build-dossiers.ts`.

## Issues

### B1 (major). (d)'s `--offline` line strips Wikidata's English names from the keyless pages it rebuilds, and the record still says "taken"

**What I did.**

1. Built three pages keyless from Kew's file, offline: Crassula ovata `k2741970`, Schlumbergera truncata `k2486321` and Echeveria elegans `k2781134`, each as a `k… -` line.
2. Ran `--fill wikidata-names` for real (1 query). It gave "jade plant" and "false Christmas cactus".
3. Ran `--keys <file> --offline --bulk bulk` with the lines as `--list-range-shapes` writes them (`k2741970 Crassula ovata<TAB>…`).

**What I saw.**

- After the rebuild, `name.vernacular` is `[]` on both pages. The index's `common` went from "Jade plant" and "False Christmas cactus" to none.
- `upstream['wikidata.names']` still says `ok`: "carried from build of 2026-10-23 (rederive); that build: Wikidata's item Q157299; 1 English name taken: "jade plant"".
- A field-by-field diff shows the names are the only thing lost.
- The exit code was 0 and no `drops.txt` was written. DEPLOY (d) tells the owner that drops.txt would list such a loss.
- Logs: `B-s/t1.log`, `t2.log`, `t3.log`. Before: `B-s/keep2/`. After: `B-s/w/static/s/v3/`.

**Why.**

- `buildKewDossier` (`src/lib/dossier/build-kew.ts:281-286`) takes names only from a Wikidata item it asks. Offline it asks none, so `vernacular = []` and the row is "skipped".
- `carryRederivedRows` (`src/lib/dossier/rederive.ts`) then carries the previous row because it is "skipped", but nothing carries the names.
- A keyed page's offline build is given its previous name block (`taxon`, build-dossiers.ts:2170); a keyless page's is not.
- `tests/unit/r80n-names-kept.test.ts` tests only the keyed path, while N's names are only on keyless pages (`--keyed` is off).

**How many.** On round 77's corpus, 29.6% of pages with open records are listed by `--list-range-shapes` (2,300 of 7,776). 1,332 of the live 2,335 keyless pages have open records. That is about 390 keyless pages in `rebuild-shapes.txt`, and an estimated 40 of the 245 pages that show a Wikidata name now. The exact figure needs the PC (below).

**What should happen.** The re-derivation carries the names with their record, or the record goes with the names. Until the code does that, the walk's (d) needs one more line after the `--offline` line and before `--index`: `npm run dossier -- --fill wikidata-names`. It is about 10 queries, then the index. On the next refresh the names are asked again in any case.

### B2 (major). A fill that loses its network marks the rest of its pages "error"; on the last day the plan passes step 11 as if it were done

**What I did.**

1. Ran the daily command on the 30-page copy with iNaturalist really asked and then cut after 2 requests ("fetch failed", as a pulled cable, a sleeping PC or a dropped Wi-Fi gives).
2. Ran it again with the network back.
3. Simulated a last day: six pages left to fill, the network gone, and the Kew-filter pages already read.

**What I saw.**

- **Cut mid-run** (`B-s/A.out`).
  - The fill printed "25 filled; 2 batched searches answered 2 sets, 23 asked alone. Every dossier has been asked for its photographs."
  - 28 of 30 pages hold a cultivated or wild row `error` ("api.inaturalist.org fetch failed; filled 2026-10-23").
  - The day's count rose by 32 for 60 calls that all failed: each first try is charged, the retry is not.
  - The run stopped (exit 3) only because the descendants step afterwards said "1 not answered".
- **Resume** (`B.out`). The next run asked those pages again: 8 requests, done. It then went on to step 12 and stopped at step 13's review. This works.
- **Last day, no network** (`A2.out`).
  - "6 filled; … Every dossier has been asked for its photographs."
  - Exit 0, step 11 recorded `done`, step 12 ran.
  - The review stop asked the owner to check exactly that line ("the fill's last line ("… filled. Every dossier has been asked for its photographs.")").
  - 6 of 30 pages are left `error`, and no later fill step will ask them, since step 11 is done.

**Why.**

- `scripts/build-dossiers.ts:902-904`: a cultivated answer of `error` is written as the row and counted in `done`.
- `:847-852`: a failed name lookup writes `error` and moves on.
- Neither path calls `unfinished()`, so neither makes the run exit 3.
- `src/lib/dossier/day-budget.ts:37` charges the allowance before the request is made.

**What it costs.**

- In the middle of the fill, the day is lost. After the cut, every remaining page is marked in about 5 to 7 s each, and the charged failures run on until the 4,000 allowance stops them. The pages are asked again the next day.
- On the last day, those pages go live as "did not answer" until a later refresh. This keeps to rule 2, but the fill DEPLOY calls finished is not finished, and the review stop gives no count of rows left `error`.

**What should happen.**

- A fill that writes any `error` row (or meets a run of network failures) ends unfinished, saying which source did not answer, so the plan never passes step 11 with pages unasked.
- A connection that fails is not charged to the day.
- The review stop counts `error` rows.
- Until then, the walk should tell the owner to keep the PC from sleeping during a fill day. `B-s/pc-count.mjs` (below) counts these rows.

### B3 (major). Every rebuild that skips iNaturalist leaves a filled page's cultivated row unsettled and gives it the wrong day

**What I did.** Rebuilt offline (`--keys … --offline --bulk bulk`) two pages of the 30-page copy whose cultivated sets the fill had just read from iNaturalist: Agave nizandensis `k294034` with 5 cultivated photographs and Mammillaria compressa `k2361179` with 10. Then I ran `--fill inat --bulk bulk --inat-budget 0`, which asks nothing and counts what it would ask.

**What I saw.**

- Photographs and ids were kept.
- The row went from "observations marked captive or cultivated whose identifications agree; filled 2026-10-23" to "carried from build of 2026-10-09; this build: not asked: this build left iNaturalist to the daily fill …".
- The wild row lost its mark "descendants read against Kew's file of 2026-06-04".
- The fill then counted "30 dossiers on disk; 2 without iNaturalist's photographs": both pages would be asked again.
- Logs: `B-s/t4b.log` and `F.log`; before is in `B-s/keep3/`.

**Why.**

- `carry()` (`scripts/build-dossiers.ts:2221-2228`) replaces a carried row's detail with "`<origin>`; this build: …". That drops the rule's words, which `cultivatedSettled` (`src/lib/dossier/sources/inat.ts:190`) requires, and the Kew mark.
- `carriedOrigin` takes the earlier of the read's day and the page's last build, so the Provenance row (`src/lib/ui/Provenance.svelte` shows the detail) names a build that never read the set.
- `tests/unit/r80i-inat-ids.test.ts` leaves "an ok set" to the photographs' carry and does not test it.

**Where it bites.**

- All three rebuild lines of (d): the 13 repair pages, the Wikidata retry and the roughly 12,000 pages of `rebuild-shapes.txt`. Every one of those pages will say its cultivated set was carried from a build that did not read it.
- (b) 4, if it runs between fill days: its rebuilt pages are asked again the next day.
- The next refresh's `--renew` build: every page with a cultivated set is asked again. In the 30-page sample that is 11 pages with a set, about a third. At day 1's rate of about 0.4 requests a page, that is one to two more fill days a refresh.

The settled "none" rows survive, because `carryInatRows` keeps the old detail.

**What should happen.** The carried row keeps the rule's words, the fill's day and the Kew mark, and names the fill that read it.

### B4 (minor). No copy of the filled corpus before (d)

**What happens.** The only backup is step 1's (`backups/v3-c14b776c7296ad11`, from before the full build). The review stop compares the corpus against that backup, and against it "nearly every dossier differs", so a repair's damage (B1 is one) can be neither seen nor undone without repeating five days of fill.

**What should happen.** (d) begins by copying `static\s\v3` to `backups\v3-<corpus id>-filled`: about 2.0 GB at the live dossiers' mean of 40.7 KB (sampled), and the PC has 87 GB free. The review after the repair then compares against that copy.

### B5 (minor). `--status` is not read-only

**What I did.** Changed one step line in the copy's plan file and ran `--status`.

**What I saw.** It printed every line "to do" and renamed `corpus-step.json` to `corpus-step.2026-10-23.<ms>.json`. With the plan file put back, `--status` still showed every line "to do". The next daily run would have started at step 1 (the backup, then the 19-hour `--renew` build).

**Why.** `scripts/corpus-step.mjs:224-226` runs before the `--status` branch at `:230`. The file's head says `--status` will "change nothing".

DEPLOY (a) 3 does tell the owner how to put the record back, so this is minor. `--status` should neither rename nor write.

### B6 (minor). Nothing stops two runs at once

**What I did.** Started the daily command twice, a second apart, on the same folder.

**What I saw.** Both ran step 11 (PIDs 19050 and 19067). Each asked every page and made 32 calls (`B-s/D1.out`, `D2.out`, `net-D.log`). Each process paces iNaturalist at 2 s on its own, so together they asked about one request a second, the pace at which iNaturalist throttled the owner's first fill.

**Why.** No lock exists for `corpus-step` or for a builder step typed by hand. The walk's rule "never while corpus-step runs" is the owner's to keep.

**What should happen.** A lock file in the project folder makes a second run refuse, saying which run holds it.

### B7 (minor). The upload leaves the site half new for its length, and for as long as a stopped upload is left

**What I saw.** The dossiers are overwritten in place (`s/v3/<id>.json`, read live by `/api/dossier`; `src/routes/api/dossier/[key]/+server.ts` says so). The index, cards, search and manifest stay the old corpus's until the manifest goes up last.

- With the copy cut after 10 files (`B-s/E1.out`), the bucket held 9 of 30 dossiers new under the old manifest, and the step said "it failed (rclone copy exit 1) … To try that step again".
- The rerun finished the copy, the check and the manifest (`E2.out`, `rclone.log`).
- On the PC the copy is about 48,000 dossiers, 2 GB (day 1 alone stamped 40,244 changed), so the half-new window is DEPLOY's "half an hour to an hour".

**Why it stays minor.** Each species page reads only its own new dossier, so it is consistent with itself, and the HTML is held 60 to 300 s at most. Live, the ids the repair moves to (`k327378`, `k327347`) are no page's, so no page shows another species' dossier mid-upload.

**What should happen.** DEPLOY should say: if the upload stops, run the same command again at once.

### B8 (minor). (d) takes longer than the walk says on the PC's download

**What I saw.** The PC's download is the Darwin Core Archive (`inputs/pc-state.txt`). Each of the three rebuild lines reads it again: "an hour" each by DEPLOY's own figure. `--prune-followed` ends with a full index (12 to 17 min), and the typed `--index` repeats it unchanged. Summed from DEPLOY's own figures this is about 6 to 7 hours, against "about four to six hours" in the heading and "three to five hours" in the bullet.

**What should happen.** Putting `scripts/r80-repair-keys.txt` and `rebuild-wd-retry.txt` in one `--keys` file saves one read of the download.

## Confirmed working

- **Ctrl-C mid-fill.** Sent to the process group, it gave "Stopped by Ctrl-C during "dossier --fill inat --bulk bulk". Nothing is lost". The step was recorded `interrupted`, no child process was left and no `.tmp` file. The next run carried on (`B-s/C.out`).
- **Resume after a cut.** The pages left `error` were asked again: 8 requests, step 12, then the review stop. The day's allowance stop and its sentence match the PC's day-1 log, and the count is shared across runs.
- **Upload.**
  - A failed copy never uploads the manifest.
  - The rerun runs copy, check, manifest and the unlisted report in order.
  - The upload gate passes: live `/api/corpus` says `keyless: true`.
- **Carry across rebuilds.** Photographs, the iNaturalist id and the wild set stayed through `--offline` (5 and 10 cultivated photographs kept). The keyless page kept its Wikidata id, iNaturalist id and 52 photographs.
- **Round 80 fixes in my area** (C1, D2, D4):
  - A comment-only plan change keeps the run (V).
  - Running another plan keeps the full plan's run aside, and it carries on afterwards (O).
  - The fill checks ids first: 25 ids in 1 request in the copy, and 39,357 on the PC.
  - Of the 475 lost iNaturalist ids, 473 were given back on the PC.
- **Memory at the PC's size**, scaled from the copy: 296 MB of dossiers here, about 1.97 GB on the PC, ×6.65.

  | Step | Heap used here | Scaled to the PC |
  |---|---|---|
  | `--list-default-points` | fails at 700 MB, works at 900 MB | about 4.7 to 6 GB |
  | `--prune-followed` (holds every dossier) | about 870 MB | about 5.8 GB |

  Both fit `npm run dossier`'s 8,192 MB, with a margin of only about 1.3 to 1.4×. `--list-range-shapes` used 104 MB, `--list-wikidata-retry` 39 MB and `--index` 307 MB.
- **Listing counts.** `--list-default-points` found 18 points on 593 pages, and `--list-range-shapes` 2,300 pages, as round 80 measured. DEPLOY's 12,000 at 48,361 pages is the same rate.
- **DEPLOY's walk against the code.** Every command and flag in (b), (c), (d) and (e) exists. Each "good output" line quoted is printed by the code:
  - the inat-restore, wikidata-names and kew-why lines
  - "0 pages" from `--list-wikidata-retry`
  - the allowance sentence and the throttle wait
  - "3 dossiers of pages merged into another deleted (…)"
  - "Review before going on: …"
  - "the site serves corpus …, the one on disk" and "every step is done"
  - `CULTIFOLIO_INAT_BUDGET`
- **Step 12's `--index`** repeats the index the fill's own run just wrote ("unchanged"), about 15 minutes on the PC: the same kind of fault as the known index item.
- **The `s/v2` purge.** Nothing of round 80's Worker reads `s/v2` except the refusal check when there is no `s/v3`.
- **The prune** keeps the live manifest's files and this folder's two manifests' files, and deletes only files more than a day old.
- **Unit tests.** 6 files and 55 tests passed (`r72d`, `r79m` corpus-step, `r80o` plan-switch, `r80i` inat-ids and gentle, `r80n` names-kept). None tests B1, B2 or B3.

## Not checked, with why

- **The 13-page online repair and the Wikidata retry for real.** There is no GBIF download here, and an online build asks GBIF, Wikidata, Wikipedia and Commons for each page. Read from the code instead: a refusal there makes drops.txt flag "wikidata turned refused".
- **The `--prune-followed` result for 9574874, 9592399 and 7530398.** It needs the kept pages rebuilt from the download.
- **Real rclone and R2.** Neither is here; the fake shows only `corpus-step`'s handling.
- **The live check against a new corpus**, and the upload's real duration.
- **Windows itself**: cmd's Ctrl-C prompt, renames over open files, sleep and wake.
- **The next refresh's full build** (19 hours). Read from the code instead: a finished plan run again says "every step is done", so a refresh needs a new plan or a renamed record, which DEPLOY does not say.

## Needs from the PC

All read-only; any time, even during a fill:

1. Copy `/tmp/claude-0/rev81r/B-s/pc-count.mjs` to the PC and run `node <path>\pc-count.mjs` in the project folder. It prints one line of JSON:
   - the dossiers' count and MB (for the memory margins)
   - cultivated and wild rows `error` (B2: how many day 1 left)
   - cultivated sets settled, and unsettled pages holding cultivated photographs (B3)
   - keyless pages with a Wikidata name
2. At (d), after `--list-range-shapes`, the same command again. `keylessWdNamedInShapes` is the exact number of pages B1 would strip.
