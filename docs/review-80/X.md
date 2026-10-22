# Round 80, agent X: round seventy-nine's build path, reviewed before the build

Branch `r80` in `/tmp/claude-0/rev80/X/`, five commits on `r80base`. Four faults, each with a failing test, its fix and its own commit. **All four must reach the owner before he starts the build**: with round seventy-nine's code the build stops in its first hour (1), or it finishes a reference that is not the one the walk describes (2, 3, 4). The fifth commit is the owner's notes. They apply in order on `r80base` (`git format-patch r80base..r80`), touch nothing in `src/routes`, `static/s/`, `package.json` or `wrangler.jsonc`, and change what round seventy-nine's build writes only as each fix says.

## Done

**1. Memory: the build would stop while reading the download** (`16cb08b`, must reach the owner: it breaks the build). The sample of the download's records (`OccIndex`, up to 2,000 a key, 2,500 while it streams) held each kept record as a 15-element array: 241 bytes of heap, measured. On a random 500 of the list's keys (GBIF's count API, the download's filter, one request a second), a key keeps 726 on average (95% interval 656 to 796), so the full download keeps about 31 to 37 million records at once, for the whole build: 7.0 to 8.4 GiB for the sample alone. Kew's names for the list's 6,484 genera add 1.7 GB and Kew's rows 0.3 GB (measured here at the list's size), against the 8 GB `--max-old-space-size` the corpus step gives the builder. It would have failed with "JavaScript heap out of memory" during the download's read. A kept record is now 80 bytes of a typed array (eight doubles and four 32-bit numbers, its strings numbered once per field), every answer the same. Test `tests/unit/r80x-occ-memory.test.ts`: bytes a row, at most 150 (241 on `r80base`, fails; 82 now, up to 120 measured once with the whole suite beside it) through `scripts/dev/r80x-occ-memory.ts`, and every answer against round seventy-nine's rule, copied into the test, over four seeds with parts, repeats, NaN keys and years, caps of 3 to 2,000. On a synthetic SQL download of 12.06 million rows over 3,420 keys drawn from the same counts: base held 573 MB of heap, peak RSS 1,276 MB, 88 s; now 8 MB of heap and 208 MB of buffers, peak RSS 541 MB, 75 s; every key's records the same (byte for byte once the download's day, fix 4, is set aside).

**2. The other GBIF keys: the list's new pages read none, and 21 records' keys went on two pages** (`90065d2`, must: it spoils about 1,200 pages). The plan's `dossier --list-extra-keys --bulk bulk --backbone …` reads only the dossiers on disk, so it ran over round seventy-eight's 8,945 pages with them as the whole reference. Run here on the real corpus, Kew's file and the backbone export: 338 keys on 311 pages. The rule over the list gives 1,348 keys on 1,206 pages; 1,032 of the missing keys are on pages not yet built. And 21 of the 338 are keys GBIF files under another of the list's species (Melia elegans and Azedarach elegans under 3852095, Crocus neapolitanus under 2747799, Eustoma russellianum under 7696893, and 18 more), whose own download records already hold theirs: one record on two pages, which round seventy-three's rule refuses. `--list-extra-keys scripts/species-list.txt` now adds each listed species with a GBIF key and no page on disk as a page by that key (Kew's entry the list's plant_name_id), and makes the reference every page on disk and every GBIF key of the list, less merged-away pages (as `kew-extra-keys.ts` reads it). The plan names the list. Rerun on the real data: 1,348 keys on 1,206 pages, none of the 21, none a list key, every merge the disk-only step found still found. Their records are not in the download (it was asked before), so the build asks GBIF's API, up to 900 a key: about 4,000 more requests, about 20 minutes. Test `tests/unit/r80x-list-extra-keys.test.ts` runs the real builder offline on a four-name Kew file and a six-usage backbone export: on `r80base` it gives `[[100, 400]]` (the old page reads a key filed under the new page), now `[[100, 500], [200, 300]]` with the merge's slug.

**3. Round seventy-eight's 8,945 pages would not be built again** (`d15ae81`, must: it spoils the 8,945 most-grown pages and the merges). The list's build keeps a page on disk whose climate is settled and no source of which refused. Every one of round seventy-eight's pages is such a page (climate `ok` 5,567, `none` 3,380 on the real corpus here), so they would have stayed as they are: round seventy-two's September records, no institution rule (the owner's decision), not their new other keys, and no merges (`--prune-followed` deletes a merged page only once its keeper is rebuilt with its key). The dry run below showed it: of a sample of 20 of the list's species, all 9 with a page on disk were "kept (clean)", the institution paragraph had nothing before to compare with, and `--prune-followed` deleted none. Round seventy-nine's review expected "nearly every one: every page is built anew". The fix is `--renew`, in the plan's build line: a page built before the day GBIF made the download is built again, and one built since is kept, so after any stop the same command still goes on (not `--force`, which would build all 48,368 again after every stop). With it, the dry run built all 20 and pruned the three merges whose keepers were in the sample. Test `tests/unit/r80x-renew.test.ts`: the real builder, offline, on a page without a GBIF key built "on 2026-10-01" beside a download made on 2026-10-20: kept without `--renew`, built with it, kept on the second `--renew` run; plus the keyed path's rule and the plan line. Fails on `r80base` (the page is kept with `--renew` given).

**4. Every page would state the wrong day for its records** (`54ecd96`, must: it spoils every page's record date). `downloadDay` read the key's second half as the day GBIF made the download. It is the day GBIF's download service last started: GBIF says `0036848-260928105237408` (the owner's SQL download) was made on 2026-10-20 and `0033920-260928105237408` on 2026-10-19; round seventy-two's `0006100-260916113435855` on 2026-09-19, not 09-16. Every page built from the new download would say "GBIF occurrence download …, of 2026-09-28" and `asOf` 2026-09-28. Now the day is GBIF's `created`: `bulk-fetch.ts` keeps it when it fetches, and for a download fetched with round seventy-nine's code (the images' download already is; the SQL download may be) the build asks GBIF once (`addCreated`, one request a download, written into `download.json`), else dates the records by the fetching day. Test `tests/unit/r80x-download-day.test.ts` (fails on `r80base`: 2026-09-28, and no `addCreated`); `r72b-ranges`' expectation follows.

**5. The owner's notes** (`22b0fee`). `docs/DEPLOY.md`, "Round eighty: round seventy-nine's build path, reviewed before the build", says what the four fixes change, what the build's lines now say, the PC's memory, and that one merge waits. The round seventy-nine walk's table rows for `--list-extra-keys`, the build and `--prune-followed`, its second review's count, and the plan's comments on the merges are put right.

**About pages.** No sentence becomes untrue; two become true again: `/about/how`'s "as GBIF held them on the day it made the download, which the page states" (fix 4), and "Where GBIF files the same plant under another key too, that key's records and photographs are read as well, asked of GBIF on the day of the build (up to 900 records a key)" (fix 2, for the list's pages).

**Checked and found sound**, each against the real thing where it exists:

- **GBIF's real SQL_TSV_ZIP form.** Read from six public SQL downloads (one is plants of October 2026, `0033920-260928105237408`, 200,000 rows streamed; `0037540-…`, whose entry is 4.44 GB). The zip holds one entry `<key>.csv`, deflated, written as a stream (flag 0x808, sizes after the data, a zip64 extra for an entry over 4 GB); the header is the aliases in lower case (a bare `"year"` comes out `year`); tab-separated, LF, no quoting (a raw `"` inside a value), empty for null; doubles as Java writes them (`1592.0`); licences as `CC0_1_0`, `CC_BY_4_0`, `CC_BY_NC_4_0`; vocabulary concepts as `Female`, `Adult`, so `Introduced`, `Managed`; `gbif_classification`'s keys are backbone integers, and the table's own keys are Catalogue of Life's (`6YGST`), which the reader refuses, as it should. `unzip -p` and `bsdtar -xOf` (libarchive 3.7.2, installed here as a dev tool, as Windows' `tar`) each read the 4.44 GB entry whole and exit 0 (91 s and 18 s). The reader reads each column by name, so the form is the reader's.
- **The request GBIF holds.** `0036848-260928105237408` (RUNNING at 00:00 UTC on 2026-10-21): the 15 columns of `SQL_SELECT`, the four clauses, 47,116 keys = the list's 46,041 and Kew's synonymy's 1,956, less the 881 of `api-path.txt`. The images' download `0036847-…` (SUCCEEDED, 3,306,852 records, 1.39 GB) asks the same 47,116 keys, still images, human observations, iNaturalist's dataset left out. `downloadShortOf` passes (47,116 + 881 = 47,997).
- **Every record to its page.** A record is filed under its `specieskey`, `taxonkey` and `acceptedtaxonkey` where each is wanted: the list's keys, Kew's synonymy's keys (the dry run: three keyless pages read records under five keys) and the extra keys; this is what GBIF's taxon-key search returns for the same key.
- **The 881 heavy species**: the build asks GBIF's API for up to 900 records and the photographs of each (about 3,500 requests at four a second, about 15 minutes, inside the 19 hours); the dry run's Ligustrum vulgare read 189 open and 442 restricted records in range from the API.
- **The images' download and the wild pass**: the dry run read `media.zip` (a DWCA without iNaturalist's dataset) for the records' photographs, and `--fill inat --wild` read the open data's file by offset (it indexes the 1.1 GB file, it does not hold it).
- **The pages without a GBIF key**, the institution paragraph, `--prune-followed`, `--index`, the review stops and their `--go-on`, resumption from `corpus-step.json`, the live `/api/corpus` (it says `"keyless": true` now, so the upload will go), the upload's three rclone commands, the Windows forms of the commands.

## Needs

- **Every round 80 agent (N, V, R):** `scripts/build-dossiers.ts` changes in `listExtraKeysStep`, `needsRebuild`, `needsKewRebuild` and the `--bulk` branch (`addCreated`, `renewBefore`); `src/lib/dossier/bulk.ts` in `OccIndex` and `downloadDay`; `scripts/bulk-load.ts` (`addCreated`, `DownloadPart.created`); `scripts/bulk-fetch.ts`'s fetch; `scripts/corpus-plan-full.txt`'s two lines. Merge onto them, not over them.
- **Round 80 (X's area, or whoever settles the merges):** the merge of Echeveria peacockii (7530398) into Dudleya pulverulenta (2985894) cannot apply: Kew writes "Echeveria peacockii Croucher ex T.Moore & Mast.", GBIF "Echeveria peacockii Croucher", and the rule finds no usage of the name for the kept page, so `--prune-followed` will say "not yet" for it for ever. An owner's merge should give the kept page the merged key whether or not the rule reaches it.

## For the owner's PC

1. Take the five commits before starting (they change `scripts/corpus-plan-full.txt`, so the plan starts from its top; nothing it did is lost). Then the walk as written, the same command.
2. **Memory**: the builder now holds about 5 to 6 GB at its most. With 16 GB of memory, close other large programs while it runs; with less, say so before starting.
3. What the first review now shows, besides the walk's lines: "the day GBIF made the download, asked of GBIF: 0036848-260928105237408 2026-10-20" (when the download was fetched with round seventy-nine's code), "--renew: every page built before 2026-10-20 …", and "48… built, 0 kept". The extra keys' step says about 1,350 keys; ignore its "run --keys rebuild-extra.txt", which the build does.
4. `--prune-followed` names Echeveria peacockii after "not yet": expected, leave it.
5. Optional: `bulk\inat-open` (34 GB) is read by nothing once `bulk\inat-wild.jsonl` is written.

## Measured

- **The dry run** (`/tmp/claude-0/rev80/X-s/run`, a clone of the branch over a rekeyed copy of round seventy-seven's real corpus, 8,947 pages): the plan's steps to the second review, through `corpus-step.mjs`, with a sample list of 20 of the list's species (9 with pages on disk, among them two merges' keepers, Koelreuteria elegans with the collision keys and k505095, which the list gives no key; 7 new; four without a GBIF key; heavy Ligustrum vulgare), an SQL download in GBIF's form of 4,897 real records (GBIF's search, one request a second) and an images' download of 136 records, P's 50-taxa open-data file, no climate grid (none here). Before the fixes: 11 built, 9 kept, 0 merges pruned. After: 20 built, 0 kept; "Institution rule …: 230 records of 10 species left out" with the pages before compared; 3 merged pages deleted (Coryphantha macromeris, Ceropegia nubica, Ceropegia melanops), their old addresses answered; wild pass and `--index` as expected. The build here was paced at one request a second (a local edit of the clone, not committed).
- `--list-extra-keys` over the list: 3 minutes, 1,348 keys on 1,206 pages.
- Heap per kept record: 241 bytes before, 82 now; the 12-million-row read above.
- **Runs**: `tsc --noEmit -p .` 0 errors; the scripts' `tsc` shows only the base's `judged` kinds; `svelte-check --threshold error` 0 errors, 0 warnings; the whole unit suite alone, under the browser lock: the first run found one failure of mine (`r74-spaces`: the word "places" in a new error message, now "decimals"), the second the memory test at 120 bytes under the suite (vitest's `NODE_OPTIONS` reached the child; it now runs without them, threshold 150), the third 459 files passed and 1 skipped, 4,284 tests passed and 8 skipped, 0 failed (457 s).

## Not done, with why

- **The Echeveria peacockii merge**: a rule change for one page, not needed for the build to go; its page stays as it is live now. Above under Needs.
- **No real 145-million-row download** was read here (the owner's only); the reader was measured at 12 million rows of the same form and the full size estimated from GBIF's counts.
- **No climate grid here**, so the dry run's climates are "pending"; the grid's path is round seventy-eight's, unchanged.
- **Browser tests** not run: no page or Worker code changed.
- **A page in no list line stays as it was written**: on round seventy-seven's corpus here, Conophytum calculus vanzylii (k2734813), whose GBIF key and id no list line holds, so no build rebuilds it (round seventy-eight's list rule, unchanged; the PC's corpus may hold another such page or none).

## Appended: agent R's two findings, put right before the build

Two more faults, both of which **must reach the owner before the build**. Each has a test and a commit of its own, and a doc commit gives the new counts. All eight commits apply in order on `r80base`: `16cb08b 90065d2 54ecd96 d15ae81 22b0fee bfa0784 2e52669 b14eb12`, where `22b0fee` holds the earlier fixes' notes.

**7. Eleven plants were on the list twice** (`bfa0784`). Each was a reference page that matches no species Kew accepts by its own name (listed by GBIF key, "-" for plant_name_id), whose range is read through a Kew entry, plus a line without a GBIF key for that same entry. The build would have made that line a second page from Kew's file. `heldThroughRange` in `select-species-lib.ts` is one rule that the list and the build share:
- the page must have a GBIF key and no Kew entry of its own;
- its `distribution.via.entry` must equal the line's Kew name and author exactly, by any route but its own entry;
- `select-species.ts` leaves such a line out when it writes the list, and the build leaves it out of a list made before (it reads only the `g…` dossiers);
- `scripts/dev/r80x-list-rules.ts --held` applied it to the committed list, read against the corpus the list was made from (`a98be27f26a097fe`).

It found exactly R's eleven pairs. R's two unproven pairs are disproved by Kew's file: it holds no row named Bisnaga hamatacantha, and Ceropegia macrocarpa only by another author. None of the eleven read a key from Kew's synonymy, so the download and the 1,415 / 1,956 figures are unchanged. Test: `tests/unit/r80x-held-range.test.ts` (the rule, the committed list, and the real builder offline). It fails on `r80base`: no `heldThroughRange`.

**8. Twenty GBIF keys were homonyms** (`2e52669`). `gbifKeyFor` took the one accepted usage of a name's words whatever its author. Given Kew's file, it now leaves out a usage that Kew reads, by GBIF's author, as another species' name (`kewReadsElsewhere`: `ownByAuthor` or the abbreviation, as round seventy-three's rule reads a usage, and no row so read leads to this species). `backboneLine` now also reads a hybrid's author.
- **Census:** I checked all 46,041 keyed lines against the backbone export and Kew's file. 20 of the 37,105 lines whose key the list chose by the name were homonyms. `--authors` with the old rule reproduces every other line, 0 differing.
- **Effect:** 19 lines now read no key and say GBIF's records "not checked". These include Gymnosporia acuminata, Rosa virginiana Mill., Ilex myrtifolia Walter and Pelargonium paniculatum Jacq., and Plagianthus × cymosus, which needed the hybrid fix. Prunus glandulosa Thunb. takes the usage by Kew's own author (3022160, doubtful); its records are not in the download, so the build asks GBIF's API for them.
- **Reference pages:** the 8,937 reference lines' keys are the pages' own and were not changed. The census also found 3 of them: Ixora coccinea, handled by citation since round seventy-one, and the two legacy pages Aphelandra squarrosa and Delphinium cultorum.
- **Wording:** the page's existing "not checked" sentence ("GBIF's backbone holds no one accepted species of this name…") holds for a homonym only in the nomenclatural sense, a name being its words with its author.
- **Test:** `tests/unit/r80x-list-authors.test.ts`, which fails on `r80base`.

**Counts now:** 48,357 species, 46,022 with a GBIF key and 2,335 without. Of the 2,335, 1,415 read GBIF's records under Kew's synonymy's 1,956 keys and 920 say not checked. `b14eb12` updates DEPLOY's walk, the plan's expected lines, `docs/PENDING-ABOUT-HOW-R79.md` (the paragraph `about-how-r79.mjs` writes now says 48,357) and the tests that count the list (`r78m-list-build`, `r79f-about-how`, `r79m-kew-keys`, `r79d-full-plan`, `r79d-gbif-requests`).

**The download need not change.** It holds every key the list now gives except 3022160. The build's count check passes (47,978 keys against 47,116 asked plus 881 left to the API), and the 19 homonym keys it holds are simply read by no page.

**Left for round 80:** the 19 newly keyless species read no key from Kew's synonymy yet. Giving them some means regenerating `extra-keys-kew.txt`, and keys outside the download would trip the build's count check. Separately, a homonym key Kew files under another list species may now become that page's extra key at `--list-extra-keys`, which is round seventy-three's rule working as written: Rosa virginiana Herrm. would go to Rosa spinosissima.

**Runs after these:** `tsc` 0 errors; the whole unit suite alone, under the browser lock: 461 files passed and 1 skipped, 4,290 tests passed and 8 skipped, 0 failed (447 s), after one earlier run found `r79d-gbif-requests` still counting 46,041 keys (put right in `2e52669`).

## Appended: the owner's build ran out of memory (the DWCA route)

The owner's full build stopped in step 3 with "JavaScript heap out of memory" at 8 GB. It had read the records (146 M rows, 34.85 M kept) and was reading `multimedia.txt`; no species had been built. **Cause, measured:** a text field kept by an index is a slice of the 64 KB piece of the stream readline cut its line from, and it keeps that whole piece alive. So the photographs' index (30 a species) kept all of `multimedia.txt`'s text alive, the records' dataset names one piece each, and each of Kew's four indexes its own copy of Kew's 300 MB names file. A small check: keeping one field in a hundred lines of a stream kept the whole stream's text.

**Commits** (on `b14eb12`):

| Commit | What it does | Must reach the owner before he reruns |
|---|---|---|
| `cb4213d` | `ownText` copies what is kept: the photographs' and the records' kept strings, and every line of Kew's loaders | yes |
| `2abc5c6` | a build that skips iNaturalist does not load Kew's names below species | yes |
| `ef66bf9` | `corpus-step.mjs` sizes the builder's heap at the larger of 8,192 MB and 70% of the machine's memory, at most 32,768; `CULTIFOLIO_HEAP_MB` overrides it, and the step's first line says which | yes, for the headroom |
| `27bf2ba` | DEPLOY's note, and a test that the same command runs the crashed step again and nothing before it | yes |

**Tests:**
- `r80x-own-text.test.ts`: the kept text measured; the photographs' index chooses the same thirty in the same order as round seventy-nine's.
- `r80x-heap.test.ts`: the heap sizing, and the resumption.

**Measured, the loading phase.** `X-s/heap/load-phase.ts` runs Kew's real files and GBIF's streams, made up at the owner's counts, through readline in 64 KB pieces.

| Stage | Before (MB of heap) | After (MB of heap) |
|---|---|---|
| Kew's names | 1,737 | 1,410 |
| Kew's rows | 295 | 221 |
| Kew's names below species | 930 | not loaded |
| Kew's species | 339 | 11 |
| iNaturalist's index | 69 | 39 |
| **Total before GBIF's records** | **3.37 GB** | **1.71 GB** |
| Records, full size (45,648 species, 34.19 M kept, 1.49 M photographed records marked) | | 376 |
| Photographs' index | 1,198 at a twentieth of the list (about 24 GB at full size) | 355 at half the list (about 710 at full) |

- The records also take 2,608 MB of typed arrays, which sit outside the heap's limit.
- The full-size photographs stage could not finish here: the shared 8 GB machine killed the run.
- **After, in all:** about 2.8 GB of heap, against the 7 GB at which the owner's build stopped, plus 2.6 GB outside the heap.
- **Same results:** on 5,036 real records with 6,224 images (a DWCA), every key's records and photographs give the same SHA-1 by round seventy-nine's reader and by the new one.

**Resumption.** None of these commits touches the plan file, so the PC's `corpus-step.json` stands. Its backup and extra-keys steps are done and kept, and the same command runs step 3 again (tested). The run that stopped wrote no dossier. `download.json` gained only `created`.

**For the owner:** take the commits, then type the same command. `set CULTIFOLIO_HEAP_MB=…` is only needed to choose another heap. The process's memory will be the heap plus about 2.6 GB, so a PC with 16 GB has room.

**Runs:** `tsc` 0 errors; the whole unit suite alone, under the browser lock: 463 files passed and 1 skipped, 4,297 tests passed and 8 skipped, 0 failed (458 s).
