# Round eighty-one: the live reference reviewed again, and what was put right

Cultifolio is live with round eighty's code (Worker `00830b85`) over corpus `a27e34d376199544`, 48,361 species pages. On 2026-10-23 five reviewers went over it: a grower on a desktop (W) and on a phone (P), the data (D), the build pipeline (B), and the code and server (C). Round eighty-one fixes what they found, and the items the owner had queued: one-word group names shown as a species' name, the hybrid and genus tiles of "your species", and no index written again after a fill run that changed nothing.

The owner's PC is part way through the full plan (`scripts/corpus-plan-full.txt`) while this round is written: step 11 of 15, the cultivated-photograph fill, day 1 of round eighty's code done (6,820 pages filled, 39,528 to do). Every change below was written to be delivered between two fill days and to carry the fill on where it stopped. The plan file is unchanged, and the delivery leaves it out.

- **B**, the build and the pipeline: the repair's rebuilds keep the Wikidata names and the filled photograph sets, a fill that loses its network, a copy before the repair, `--status` read only, one run at a time, the index not written again for nothing, and the about page true until the repair has run.
- **A**, the reference's data on the page: care groups only where Kew's lifeform agrees, the four temperatures removed, one-word group names searched but not shown, the label's care line in whole clauses.
- **H**, hybrids end to end: the sign on all 485 hybrid pages, their Kew links, the "x" addresses, and the device's hybrid and genus tiles, with the reading rule tested on a real backup of 300 plants.
- **S**, search and names typed: a reloaded or shared search, Back to a search, older names said as older names, plurals and "rose", and the searches that hung.
- **U**, the app's pages and the phone: the compare tray and its pill, offline pages read by a link, the share card, the menu in landscape, the notch, Back closing what is open, HEIC, tap targets, names for screen readers; and the WebKit walk, fixed.
- **M** merges them, settles their needs, proves the merged code and the delivery on a copy made like the PC, and writes the owner's walk.

The reviews and the fix reports are in `review-81/`: `review-w.md`, `review-p.md`, `review-d.md`, `review-b.md`, `review-c.md`; `B.md`, `A.md`, `H.md`, `S.md`, `U.md` and `M.md`.

## 1. The reviews' findings, and what was done

| Finding | Who | Done |
|---|---|---|
| W1, P4 a reloaded or shared `/?q=` threw, and search stopped | S | the address is written once SvelteKit's router is up; "Searching…" until the server answers, never "nothing matches" |
| W2, P5 Compare's picker dropped the tray's species | U | the tray's species come first: `?s=<tray>,<picked>` |
| W3, D3 485 hybrid pages without their ×; some without POWO or IPNI | H | Kew's names with the sign (`src/lib/core/hybrids.json`, 485 by Kew's id) on the page, title, JSON-LD, Compare and tiles from the deploy, and in the index from the plan's `--index`; Kew's entry numbers where a record links neither; `mentha-x-piperita` moves to `mentha-piperita` |
| W4 an import called older names "ambiguous" | S, M | "an older name: the reference has this species as …", one press for every such line; a named nothospecies is now checked as a species (M, H's need) |
| W5 a hit found by an older name did not say so | S | "older name: Sansevieria trifasciata" on the row, its page opened with `?was=` |
| W6 the label's care line cut mid-figure | A | whole clauses, the last ones dropped where the label is too small |
| W7 accessibility | U, S, M | the log's "×" named by their lines; search rows named by the species (the letter and "›" hidden); the species fields named "Species"; focus in the add form's field. One behaviour where S's "older name" sits in the same row: the link's name is the species, then "older name: …", then the rest (M) |
| W8 a blank pre-treatment shown as "none" | A | "not stated" |
| W9 a failed photograph's placeholder over half the frame | U | it fills the frame |
| P1 Back from a species page lost the search | S | the search, its "Show more" and the hit at the top of the screen kept in the page's snapshot |
| P2 the compare pill covered Add | U | the pill steps aside while a pinned bar shows; the toast stands above it |
| P3 offline, a page read by a link was not kept | U | kept, and opened from the device's copy by the offline page; the sentence says until the app next updates itself |
| P6 the menu ran off a landscape screen | U | no taller than the window, scrolling itself |
| P7 the notch over the top bar's end buttons | U | the bar padded by the safe area |
| P8 Back closed nothing that was open | U | Back closes the viewer, the menu and the Record form, and stays on the page |
| P9 HEIC refused with no way forward | U | named, with the way forward |
| P10 touch targets under 44 px | U | 44 px under a coarse pointer at every width |
| D1 `/about/how` described the not-yet-run repair as live | B, M | "until …" sentences for the shapes, the default points and Kew's names in the search (B); and for the hybrid sign and the one-word rule in the search and the tiles (M) |
| D2 care groups plainly wrong for hundreds of species | A | the owner's decision: a group only where Kew's lifeform agrees; 13,293 of the 17,589 listed pages keep one, 4,296 state none |
| D4 a Wikidata line over no name shown | B, A, M | one line (M): where none of Wikidata's names is shown, it names them and says the search finds them (B); where one is, "English names as Wikidata spells them … not corrected here" (A) |
| D5 one-word group names shown ("Cycad" on 39 pages) | A | searched, never shown, from GBIF or Wikidata alike; "Fig" stays Ficus carica's |
| D6 three searches of 205 hung | S | the Worker shared reads in flight across requests; a read belongs to its request, so a later request waited for ever on a cancelled one. Now shared only within a request; the warm reads kept to their end with `waitUntil` |
| B1 the `--offline` rebuild stripped keyless pages' Wikidata names | B | carried with their record |
| B2 a fill that lost its network wrote "error" and passed step 11 | B | nothing charged, nothing written, five in a row stop the day (exit 3); the review stop counts rows left "error" |
| B3 a rebuild skipping iNaturalist unsettled filled sets | B | kept settled with their own day and Kew's mark |
| B4 no copy before (d) | B | `--backup filled` and `--compare`, commands in (d), not plan lines |
| B5 `--status` not read only | B | it writes nothing, and says when a run would start again |
| B6 two runs at once | B | `corpus-step.lock`, taken by every run and by every builder step typed by hand |
| B7 the upload's half-new window | B | said plainly as it starts and when it stops; shortening it needs the Worker to read dossiers by corpus (section 8) |
| B8 (d)'s times | B | `--keys a,b` reads the download once; a per-line time table |
| queued: an index written again for nothing | B | a stamp of the dossiers and the builder's code; unchanged, it is not written (8,947 pages: 105 s, then 0.6 s) |
| C1 the share card after the next deploy | U | said in words, with a reload |
| C2 "hens and chicks", "rose" | S | plurals read in a phrase; a whole common-name word before a genus only begun |
| C3 seven search-route tests always skipped | B | they find a corpus by `CULTIFOLIO_TEST_CORPUS`, the old path or `static/s/v2`, and say why when skipped; 7 pass here |
| C4 advisories in the lock | B | the owner's decision: a delivery after the upload; its list is in DEPLOY, "Round eighty-one: the dependency delivery" |
| C5 the sitemap's 0.4 s of CPU | none | the owner's decision: Workers Paid, so not a fault; left |
| C6 "My plants" at 2,000 plants on a slowed phone | U | measured, not changed: the rows are already drawn 200 at a time; the rest is the collection's load (section 8) |
| C7 a species page's largest paint on a slowed phone | U | measured, not changed: the hero is already preloaded at high priority; the time is iNaturalist's |
| queued: the hybrid and genus tiles of "your species" | H | a reading rule, no migration of records: a species record's id is already the page's address; its stored name without the sign is read with it; a plant filed under its genus gets a genus tile |

## 2. The owner's decisions in force

- **Care groups by Kew's lifeform** (review D2): a page's group is the archetype table's listing only where Kew's lifeform for the species (`distribution.kew.lifeform`, WCVP's `lifeform_description`) agrees with it; otherwise the page states no group. **The four group temperatures are removed** (tropical foliage plant 12 °C, orchid 13 °C / 55 °F, epiphyte 10 °C, fern or moss 5 °C): the group and its reason stay, with no number, in `src/lib/core/arch.ts`, the species sheet's sentence and `/about/how`. This settles round eighty's open question on the orchid 55 °F line.
- **The dependency delivery after the upload** (review C4): `package.json` and `package-lock.json` are not touched this round; agent B's list of what that delivery takes is in DEPLOY.
- **Workers Paid** (review C5): the sitemap's CPU is not a fault on Paid, and is left.
- Standing: pages without a GBIF key built from Kew's file and iNaturalist; Wikidata's names only for keyless pages (`--keyed` off); the 1 km institution rule; iNaturalist's wild photographs from the open data, cultivated from the API at 4,000 a day.

## 3. The merge

Five branches, each on `r81base` (the owner's head `0349d13`), merged `--no-ff` in the order B, A, H, S, U.

- **`scripts/build-dossiers.ts`** (B, H): merged cleanly. Read again where they meet: H's signed index (`signEntries`) is what B's `writeIndexFromDisk` writes, after B's stamp check; the stamp covers the builder's code by content, so the first index after this delivery is written, with the sign. H asked that an explicit `--index` still write when the code changed: it does.
- **The species page** (B, A, H, U): one Wikidata line (D4, above); H's parents line beside it; U's placeholder CSS.
- **`src/routes/+page.svelte`** (H, S, U): S's older-name row and U's hidden letter and arrow in one row; H's own-tile search past the sign kept with S's address and snapshot lines.
- **The plant page** (H, S, U): H's `asSpecies` (a named nothospecies asks the reference) with S's words: a plant of a named hybrid the reference does not hold reads "No species page under this name", one behaviour for the plant page's notice. U's log names and Back layer beside them.
- **`/about/how` and `/about/formats`**: merged word by word and each merged passage read again. One sentence added by M: the hybrid sign and the one-word rule reach the search's rows and the tiles with the index uploaded after the fill, while each species page follows both from the deploy.
- **`docs/DEPLOY.md`**: each agent's section kept; one owner's walk for round eighty-one first, round eighty's walk kept below it, headed as superseded; B's section points to the walk for (c) and (d).

**The needs, settled.**
- **H to S, the search's order:** `search.ts`'s `sortKey` reads a name past its "×", so × Sorbaronia arsenii sorts under S as the catalogue's rows do (M).
- **H to S, the import:** `import/check.ts` checks a named nothospecies ("Mentha × piperita", "× Gasteraloe beguinii") as a species: by its page, with its key at species rank, and a hit named with the sign matches the name asked. A cross written out is still filed under its genus, unasked (M).
- **H to S, the front page's own search:** H's lines kept with S's (`ownHits`).
- **A and B, D4's one line:** as above, both conditions in one `{#if}`; A's words where a name is shown, B's where none is.
- **A to U, the labels page:** A's lines kept; the clause rule `.care [hidden]` made `:global`, so svelte-check no longer warns that it is unused (M).
- **B to S:** `r67n-search-route` runs (7 of 7) with S's ranking.
- **B to H:** no (d) rebuild for hybrids; none needed.
- **U to the merge:** the WebKit walk is handed over as `webkit-walk.mjs` (agent U's copy); the walk's step (e) 4.
- **S to U:** the plant page's one span is S's words; W7's hit name carries "older name" (above).
- **Found in the merge:** H's real 300-plant backup (`tests/unit/fixtures/r81h-backup-r80-300.cultifolio.zip`), which its unit test and its browser spec read, was never committed: `.gitignore`'s `*.cultifolio.zip` kept it out. It is tracked now, with one exception line in `.gitignore`, and is in the delivery.
- **Found in the merge, for WebKit:** `r81h-hybrid-tiles.spec.ts` waited for the restore with `whileStoring` but never installed its counter (`watchStorage`), so the wait gave up after its first five seconds; and its 180 s held no room for Safari's engine's pace (about 16,500 IndexedDB requests, about five and a half minutes on the PC). It now watches the database and grows its time as smoke-3's restore does (M).

The merge's own tests: `tests/unit/r81m-merge.test.ts` (5: the sort key, the import's check of a named hybrid three ways, a cross still filed by its genus, the one Wikidata line).

## 4. What was proved

- **Each agent's new tests fail on `r81base`** (a worktree of it, the new files copied in, run there):
  - unit: 15 new files, 80 tests: 70 fail and 10 pass, each a guard of what must not change (A's two: a slip not corrected, a two-word name still shown; B's two: a comment-only plan change, a name shown from Wikidata said as before; H's one: a reference hybrid followed from its page; S's four: a scientific name never read as a plural, a genus typed whole keeps its place, "rose" through the key files, "×", "x" and nothing read alike; M's one: a cross still filed by its genus). `r81h-hybrids` and `r81u-words` fail as files, their modules missing. M's second file, `r81m-fill-unchanged`, fails on B's branch (the page rewritten) and on the base (rewritten with "error").
  - browser, Chromium and its phone, no retries: the 8 new spec files, 44 tests: 42 fail, 2 pass (U's P7 2b in both projects, a guard by design).
- **The whole unit suite, alone, under `nohup`**, with `CULTIFOLIO_TEST_CORPUS` set so the seven search-route tests run: at the final code, 507 files, 4,586 tests passed and 3 skipped, in 632 s (and at `1722bf9`, before the last fill fix, 506 files and 4,585 passed). Each agent had run it on its own branch.
- **Types:** `npx tsc --noEmit -p .` no errors; `npx svelte-check --threshold error` 1,364 files, no errors and no warnings (the merge removed the one warning A's labels page brought).
- **The whole browser suite, strict, Chromium and its phone** (the lock, port 4796): 631 passed, 5 skipped, none failed and none flaky (no retry needed), 24.7 minutes. H's spec, made to hold in WebKit after that run, passed again alone; its restore measured 16,468 IndexedDB requests in Chromium.
- **The specs read for the four ways specs have failed only on the PC:** every new spec blocks the service worker where a route must catch a request (the import's and the search's `/api/search`, the share card's chunk) or routes nothing; none uses `mouse.wheel` (scrolling is `window.scrollTo` or the element's own `scrollBy`); none counts requests but by distinct queries (`Set`); the waits follow what the page shows (`expect.poll`, `whileStoring`). One was found assuming Chromium's timing, H's restore of 300 plants, and is fixed (section 3). U's P7 2a needs Chromium's protocol and is tagged `@chromium`, so WebKit and Firefox leave it out.
- **The delivery on a copy made like the PC, mid-fill** (`M-s/sim/`): the PC's code (`r81base`) and plan file; 40 real pages of round seventy-seven's corpus, rekeyed to version 3, among them its three hybrids, half filled and half left to the fill, every iNaturalist id checked as day 1 checked them; the index written by the PC's code; the step 1 backup; `corpus-step.json` at step 11 unfinished with day 1's words. The delivery's 108 code files extracted over it (the plan file left out, nothing to delete), then `scripts/corpus-step.mjs` run for real:
  - `--status`: 1 to 10 done, 11 unfinished, 12 to 15 to do, no `Note:`; it wrote nothing (no log, no record set aside).
  - A lock left by a dead process (pid 999999, this boot) was taken and said ("left by a run that has ended … taken for this run"); each run released it; no run tripped on its own lock or its builder child.
  - **A fill day with the network gone** (every request failing before an answer): iNaturalist did not answer 5 pages in a row, the run stopped (exit 3, "a source did not answer … Run the same command again in an hour or so"), 0 requests charged to the day, 0 dossiers written, step 11 still unfinished. Its index was written once, because the code had changed: the three hybrids' entries now carry the sign (Lantana × strigocamara, Parodia × erubescens, × Sorbaronia arsenii). **A second such day** wrote no index ("not written again").
  - Found there and fixed: on B's branch the first such day rewrote one page (Mammillaria bocasana), whose wild row "not asked: 18 wild photographs already from the GBIF download" took the run's time, so the index stamp saw a change. Now a page left unanswered keeps that row and is not written when nothing else changed (`scripts/build-dossiers.ts`, `tests/unit/r81m-fill-unchanged.test.ts`).
  - **A fill day with iNaturalist answered by a stub** (every search answering no observation): 40 filled with 1 batched search for 35 sets and 5 name searches, 6 requests charged; "Every dossier has been asked for its photographs."; its index written (22 dossiers changed); step 12's `--index` "not written again" at once; the run stopped at step 13's review (exit 2), whose line counted the dossiers that differ from the backup and no row "error".
  - At the stop: `--backup filled` made `backups/v3-<id>-filled`; `--list-wikidata-retry` "0 pages" wrote no file; the typed `--index` "not written again"; `--compare` "0 dossiers differ". The record was never set aside: the plan carried on at step 11 and nothing restarted.
  - Not run here: the online and `--offline` rebuilds of (d), which need the GBIF download and the climate grid on the PC; B's unit tests run the real builder on them (`r81b-rebuild-carry`).
- **Sizes against round eighty's** (`r81base` built and bundled the same way, `wrangler deploy --dry-run`):
  - the Worker: 1,940.1 KiB, 494.2 KiB gzipped, against 1,864.9 KiB and 472.3 KiB: 75.2 KiB more, 21.9 KiB gzipped. H's table of Kew's hybrid names (`src/lib/core/hybrids.json`) is 59.6 kB, 16.8 kB gzipped, and is in the Worker only;
  - the app's scripts: 108 files, 1,366.2 kB (485.1 kB gzipped), against 106 files, 1,351.0 kB (479.3 kB): 15.2 kB more, 5.8 kB gzipped; its styles 179.5 kB (43.6 kB) against 178.3 kB (43.4 kB);
  - the service worker's install: 140 build files, against 138;
  - the first page (`/` opened cold in Chromium, no service worker, every same-origin response): 53 requests, 701.0 kB (347.5 kB gzipped), against 52 and 698.2 kB (346.4 kB): 2.9 kB more, 1.1 kB gzipped; the same at the phone's size.
- **Requests:** none to the live site or to any source by the merge; the simulation's iNaturalist was a stub or no network.

## 5. The delivery

Every file added or changed since the owner's head (`r81base`, `0349d13`'s tree), as one zip extracted over the project folder: **120 files, 46 added and 74 changed; none deleted or renamed**, so there is nothing to delete by hand. **Left out: `scripts/corpus-plan-full.txt`**, which did not change and must not: the PC's run is keyed to it. No file under the hard limits changed (`package.json`, `package-lock.json`, `wrangler.jsonc`, `static/s/`, `docs/REVIEW-ROUND-5.md`).

| Where | Files | What runs them on the PC |
|---|---|---|
| `scripts/build-dossiers.ts`, `scripts/corpus-step.mjs`, `scripts/run-lock.mjs` (new), `scripts/hybrid-names.ts` (new), `src/lib/dossier/` (8) | 12 | the fill, `--index`, (d) and the runner; each safe mid-fill, as the simulation shows |
| `src/lib/core/` (9, `hybrids.json` and `hybrids.ts` new), `src/lib/db/`, `src/lib/import/` (2), `src/lib/photo/`, `src/lib/server/` (2), `src/lib/ui/` (15), `src/app.d.ts`, `src/service-worker.ts` | 32 | the app and the Worker, with the deploy; `core` and `dossier` also by `--index` |
| `src/routes/` (15 pages and loads) | 15 | the app, with the deploy |
| `fixtures/` (2), `tests/unit/` (33, with H's backup and M's page), `tests/e2e/` (12) | 47 | `predeploy` and the release gate |
| `.gitignore` | 1 | git only |
| `docs/DEPLOY.md`, `docs/REVIEW-ROUND-81.md`, `docs/review-81/` (11) | 13 | reading |

The list, one path a line, is the merge's `M-s/delivery-files.txt`. Handed over beside the zip, not in it: agent U's `webkit-walk.mjs`, for walk (e) 4.

**Safe mid-fill, all of it.** The fill's own code changes (B's network rule, the lock, the stamp, `--keys a,b`, B1 and B3's carries, M's unwritten unanswered pages) were run for real on the copy made like the PC (section 4): the plan went on at step 11, nothing restarted, the lock did not trip on its own state, and an unchanged index was not written again. The index's changes (H's sign, A's one-word rule, S's order of a heavy word's kept hundred, Kew's older names already there) reach the live site with the plan's own step 12 and upload if the delivery comes before the fill's last day.

## 6. The owner's walk

`docs/DEPLOY.md`, "Round eighty-one: the owner's walk", is the whole of it; never while `corpus-step.mjs` runs (and this round's lock refuses a second run).

- **(a) The delivery and the deploy**, one evening between two fill days, before the fill's last day: extract the zip (nothing to delete); `--status` (1 to 10 done, 11 unfinished, no `Note:`); optionally H's `hybrid-names.ts --check`; `predeploy --tier=app`; `corpus-ready && npm run deploy`; then the checks of H, S, A and U.
- **(b) The Wikidata retry**, the one-off step left from round eighty: nothing to type now; it goes into (d)'s first online line, one read of the download for it and the repair.
- **(c) The daily fill** to its end, about four more days; the last run's step 12 `--index` says "not written again" and stops at step 13's review.
- **(d) At the review stop**: `--backup filled` first, the three listings, one online `--keys` line for the 13 repair pages and the retry, the `--offline` line (which now keeps the Wikidata names and the filled sets), `--prune-followed`, `--index`, `--compare`, then `--go-on` for the upload and the live check. About four and a half hours before the upload.
- **(e) After the upload**: the dependency delivery, the prune, the `s/v2` purge on or after 26 October, and the WebKit walk (`node <path>\webkit-walk.mjs --budget 260`).

## 7. For the owner to decide

**Ferns, mosses and carnivorous plants under the care-group rule.** Your decision takes a group only where Kew's lifeform agrees with it. No lifeform in Kew's file names a fern or a carnivorous plant, so a strict reading would give no page either group (602 fern or moss pages and 652 carnivorous pages keep one now). Agent A read "agrees" for these two groups as "a lifeform is on file", and listed Brocchinia and Catopsis, the mixed bromeliad genera, by their carnivorous species alone.

- **Recommended: keep A's reading.** The table lists these two groups by whole families and genera whose every member is a fern or a carnivore (and the two mixed genera by species), so the listing is right for each page; Kew's lifeform adds nothing either way, and a page with no Kew description still states no group. `/about/how` says so: "No lifeform names a fern or a carnivorous plant, so those two need a lifeform on file."
- Or the strict reading: two lines of `AGREE` in `src/lib/core/arch.ts`, deployed with the app; 1,254 pages would then state no group.

## 8. Not done, and what is left

- **The upload's half-new window** (B7) is said, not shortened: shortening it needs the Worker to read dossiers under a corpus-named path, a change to the bucket's layout and the Worker too large between fill days.
- **`carriedOrigin`'s day on other carried rows** (B): it still names the earlier of the read's day and the build on rows such as `inat.taxon` after an offline rebuild; changing it moves every carried row's day across the corpus. B3's sets no longer go through it.
- **C6** (U): no small, safe fix; the remaining time on the slowed phone is the collection's load from IndexedDB. The WebKit figure is the PC's to read (review C's need).
- **C7** (U): nothing in the page's order to fix; the time is iNaturalist's.
- **`/api/dossier/<id>`** keeps the build's unsigned name for a hybrid (H): it is the build's record; the page and the index carry the sign.
- **"mentha xpiperita" in the front page's own-tile search** is not read as a sign (H): reading a leading "x" there made "xe" match everything. The server's search reads it.
- **Taking an older name on its own at import** (S): round sixty-two's rule keeps the grower's choice; one press now does every line.
- **The postings path** (corpora before round seventy-seven) reads no plurals (S): fewer hits, never wrong ones; the live corpus does not use it.
- **"Species Rose"** (Wikidata, Rosa virginiana), two words, stays among the names (A).
- **WebKit and Firefox** were not run here; the owner's `--tier=app` runs every spec in them, and the WebKit walk after the upload.
- **Round eighty's left items** still stand: `g` pages placed by spelling link no Kew number; 126 TDWG regions tested by their box; the 12 keyless pages whose keys the download did not ask.
