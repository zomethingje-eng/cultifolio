# Round eighty-two: two independent reviews, and what was put right

Cultifolio is live with round eighty-one's code (Worker `87f265f3`) over corpus `a27e34d376199544`, 48,361 species pages. On 2026-10-23 two independent reviews of the live site and the repository came in from other models: review 1 (`review-82/review-1.md`, issues 1 to 40) and review 2 (`review-82/review-2-gpt.md`, issues 1 to 7 and a script error on its first page). The coordinator checked the main claims, the owner accepted what is below, and five agents fixed it:

- **F**, the build and the reference's data: the Echeveria peacockii merge re-pointed, one Kew entry to one page, the rows with no reason, the hybrid formulas in the index, "answered" rows that show nothing, the Wikipedia cut, two /about/how sentences;
- **S**, search and the index's names: a headline typed comes first, a genus word's order, older names by another author set apart, the picker's rank words;
- **D**, the device and the grower's record: a Replace under a Web Lock, the reminders, a batch's first line, the frost bar, the toast and the pinned bar, sync's refused change, the pixels and the snapshot;
- **U**, the pages: "not checked" said once, the Papers section, the climate chip, the close-up map, the lead photograph, the scroll-spy, Compare, the range's words, desktop text, the phone's first screen, "Popular genera", the few-records mark, "author not stated", the script error;
- **O**, operations, security and the service worker: the caches, the /24 window, the vault GET, /compare's limit, the cookies and the policy, the SYNC_OPEN comment, Peperomia graveolens;
- **M** merges them, settles their needs, adds the owner's second merge (Bisnaga hamatacantha), proves the merged code and the delivery on a copy made like the PC, and writes the owner's walk.

The owner's PC is at step 11 of 15 of the full plan (`scripts/corpus-plan-full.txt`), the cultivated-photograph fill, with about three fill days left. Every change was written to be delivered between two fill days; the plan file is unchanged and the delivery leaves it out. The reports are in `review-82/`: `F.md`, `S.md`, `D.md`, `U.md`, `O.md` and `M.md`.

## 1. The reviews' findings, and what was done

| Finding | Who | Done |
|---|---|---|
| 1 a Replace resumed by two tabs could lose photographs | D | the Replace holds the Web Lock `cultifolio-replace` from staging to the end of its switch; a tab opened meanwhile waits, says so and reads the flag again; the copy is safe run twice (one write for the log, only the photographs the file lacks deleted) |
| 2 "peppermint" put Mentha × piperita 18th; "echeveria" ran alphabetically | S | a species whose headline is the query is exempt from the shared-word rule (1st); a genus word orders by English names, then photographs, then the alphabet (E. elegans 1st) |
| 3 a same-spelled name by another author shown as an older name (1,691 pages) | S | moved at index time to `hom` with its authors; searched only as a name typed, after that page; the row says "older name under another author" |
| 4 Echeveria peacockii on Dudleya pulverulenta's Kew entry; one entry, two pages | F | the merge re-pointed to Echeveria desmetiana (k2781125); no page given an entry another page holds (`heldBy`); `kew-shared.txt` at every index and in the review stop |
| 5 an iNaturalist taxon taken on a GBIF FUZZY match | hotfix, reverted; M | see section 2: the rule kept, and /about/how now says it |
| 6 a Kew-id page matched on Wikidata by its label | F | /about/how says when the label is read and that it is then proved by IPNI or POWO (440 of 442 such pages) |
| 7 rows not ok with no reason | F | the real remainder given reasons at build; `--list-no-reason` lists the pages built before, for (d) |
| 8 the service worker's caches grow | O | the previous build kept only while a tab of it is open; species pages capped at 200, corpus answers at 600. The page-weight half is round 83's |
| 9 no /24 window for IPv4 | O | `/api/index` and the sync routes count the /24 at four times one address |
| 10 "not checked" five times on a page | U | once, under the name card; the sections refer to it |
| 11 "Without climate" lumped none and not checked | U | "No climate", with "920 not checked" apart |
| 12 the close-up map had no names or scale | U | the page's regions named, a scale bar, a graticule; finer coastlines are round 83's (a new static asset) |
| 13 the lead photograph often the weakest | U | the cultivated set's first, then the old order, never an upright one where another is there |
| 14 the Undo toast over a form's buttons | D | the toast lifts above any visible form button |
| 15 three backup reminders at once; none counted after a restore | D | one at a time, none over an empty collection, a restore counted as a backup |
| 16 a batch just sown said "0 entries" | D | its start is the log's first line (M: made to wrap at 320 px with the text at 200%, section 3) |
| 17 the picker showed "Lithops lesliei luteoviridis · variety" | S | "Lithops lesliei var. luteoviridis", key filed |
| 18 a red frost bar for a night nine days out above freezing | D | only a night within 72 hours, or below a space's floor; dated; red only at or below 0 °C |
| 19 the scroll-spy marked the section above | U | the margin no longer counts the bar twice |
| 20 Compare's range without "+N" | U | "+N", with Kew's names (S found it is Compare's own card) |
| 21 a g page's range heading said WCVP with no range | U | the caption says what the page has |
| 22 historical region names raw | U | a note that regions are Kew's level-3 units, some under historical names |
| 23 an empty Papers section | U | no section and no tab while nothing is asked; the record of sources says why |
| 24 13.5 px desktop text | U | 15 px from 701 px wide |
| 25 the pinned bar over the Acquired field | D | the field being filled brought above the bar when the window shrinks under it |
| 26 CC0 photographs credited with no observer | U | "author not stated", never the licence alone, on pages and tiles; the fill already reads iNaturalist's observer |
| 27 the index cut a hybrid formula to its first parent | F | formulas and the species' own name spelt with an x left out of `syn` |
| 28 two inactive iNaturalist ids | none | the fill follows them (round seventy) |
| 29 "ok" rows for things the page does not show | F | the record of sources says what was found (GBIF media, extremes set aside, an empty range), at display time |
| 30 raw NUL bytes in `log.ts` | O | `\0` escapes; esbuild's output byte-identical |
| 31 `GET /api/sync/vault` | O | removed (405); the POST is `no-store` |
| 32 /compare not limited | O | counted under the render bucket |
| 33 cookies without Secure; no `object-src` | O | Secure over HTTPS; `object-src 'none'`; HSTS's `includeSubDomains` left to the owner (it binds every subdomain for a year) |
| 34 the SYNC_OPEN comment | O | the comments in the code true; the line in `wrangler.jsonc` is the owner's to change (walk (a) 3) |
| 35 Peperomia graveolens keyed by genus | O | at species level; a test that a genus sits in one list |
| 36 the Wikipedia extract cut mid-word | F | cut at the last whole sentence within 1,500 characters, marked `cut` |
| 37 sync re-sent a refused change every run | D | sent again after a day; one count of what waits |
| 38 pixels reclaimed only with sync; a snapshot refused after a Merge that parks | D | swept after a load and a Merge; the snapshot written |
| 39 the stale sea-floor sentence | F | /about/how says the sea is masked |
| 40 thin and implausible climates | U, F, M | marked "from few records" under 12 records or 5 cells (U's line, F's and M's figures); the hand review is round 83's |
| R2 1 photographs without an author | U | as 26 |
| R2 2 hybrids without their × in the search | none now | round eighty-one's sign reaches the index with the plan's `--index` and upload |
| R2 3 "Most grown" overstated its measure | U | "Popular genera", everywhere, the measure unchanged |
| R2 4 cuttings announced as seedlings | D | "First cuttings struck" |
| R2 5 two rain totals unexplained | U | each labelled, and how they differ |
| R2 6 the example-collection action under 44 px | U | 44 px on a phone or a coarse pointer |
| R2 7 the phone's first screen | U | one sentence: a species reference and a record of your plants |
| R2 `TypeError: n is not a function` | U | found: Compare's image action passed its key to the failure callback; fixed twice over |

## 2. The hotfix and its revert, plainly

Review 1's 5 read GBIF's FUZZY match in `judgeTaxon` (`src/lib/dossier/sources/inat.ts`) as a breach of the no-guessing rule, and on 23 October a hotfix (`b60206d`) made the function refuse every FUZZY match. It was on the owner's PC and was the base all five agents worked on. It broke the owner's own cases: `tests/unit/r70b2-follow-42.test.ts` failed 32 of its 86 tests, every agent reported it, and the owner's `predeploy` would have stopped on it. Othonna linearifolia, Kew's and iNaturalist's spelling of the page Othonna lineariifolia, is the same plant; GBIF's match corrects the one to the other, and the hotfix refused it, so the page would have lost its iNaturalist taxon and photographs. The hotfix was **reverted the same evening** (`15496d8`, tag `r82pc`), which restored round eighty-one's `inat.ts` and turned `tests/unit/r82f-inat-fuzzy.test.ts` into a guard that a FUZZY match to this very species is taken and one to another species is not. The owner's PC is at that tree; this round's merge starts there, and no agent changed `inat.ts`.

The rule the code keeps: GBIF's correction of a misspelling is taken only where it lands on this very species (`fuzzy === s.key`); a correction to another species is never read as this one's (no line of `judgeTaxon` takes it on that ground). **/about/how now says so** (M), in the list of how an iNaturalist taxon of another name is taken: "or GBIF's backbone holds the name as this species, or corrects it as a misspelling to this very species (GBIF's fuzzy match: Othonna linearifolia, as Kew and iNaturalist spell the page's Othonna lineariifolia), while a correction to another species is never read as this one's". Checked against `judgeTaxon` line by line: the refusals before it (a name held elsewhere, an exact match to another species, GBIF's two readings) are the page's existing sentences; the sentence does not claim a correction to another species is refused, since a name iNaturalist's own search files the species under is then taken by the lenient rule, as /about/how already says. With the revert, the 32 failures are gone: the whole suite passes (section 5).

## 3. The owner's decisions

- **Echeveria peacockii into Echeveria desmetiana** (review 1's 4; F). Kew's file itself files the bare name Echeveria peacockii under Dudleya pulverulenta, so the merge rests on what GBIF's key 7530398 holds (six of its seven names are Kew's E. desmetiana).
- **Bisnaga hamatacantha into Ferocactus hamatacanthus** (taken now; M). g7281739 joins k2808164, as peacockii joins k2781125. One type: Bisnaga hamatacantha (Muehlenpf.) Orcutt is based on Echinocactus hamatacanthus Muehlenpf., which Kew's file files under Ferocactus hamatacanthus (2808164) as its basionym; Kew's file holds no row of the Bisnaga name. GBIF files under 7281739 Ferocactus hamatacanthus itself and Kew's other names of 2808164 and its two subspecies (38 usages, asked of GBIF's species API on 23 October), which is why k2808164 read no key. `mergedExcept` finds no name under 7281739 that Kew holds as another plant, so the line has no fourth column (GBIF's Echinocactus haematacanthus, 7498042, whose words Kew files under Ferocactus haematacanthus, holds no record). What it changes, after (d): `/species/bisnaga-hamatacantha` leads to Ferocactus hamatacanthus; that page reads GBIF's 3,388 records under 7281739 (live, the page has "not checked" for GBIF's records and no climate) and so gains GBIF's map, records, photographs and a habitat climate under Kew's range ("SE. New Mexico to W. Texas and E. & C. Mexico"); the search finds it by the old name; g7281739, which has no range (its "no reason" row was review 1's example) and no climate, leaves at `--prune-followed`. Files: `scripts/merged-pages.txt` (the line and its comment), `scripts/r82-repair-keys.txt` (`k2808164`), /about/how's list of merges, the tests `r78i-merges`, `r78m-list-build` and `r82m-merge`. The species list (of 19 October) still gives 7281739 its line; it is not changed mid-fill, and the build builds no key merged into a page without a GBIF key (`intoKew`).
- **"Most grown" is "Popular genera"** (review 2's 3; U).
- **Thin habitat climates marked, not hidden** (review 1's 40; U): under 12 records or 5 grid cells. On the live corpus, from the 5,825 climate pages of the reviewers' copies read from each dossier's own counts and weighted by the live index's `open`, the line marks about 4,390 of 37,788 pages (11.6%); U's 504-page sample said about 4,880, and F's unweighted sample about 6,400 for a nearby line. /about/how says about 4,400 (M).
- In force from rounds 80 and 81: care groups only where Kew's lifeform agrees; no temperatures for groups; the dependency delivery after the upload; Workers Paid; keyless pages from Kew's file, never matched by name; Wikidata names for keyless pages only; the 1 km institution rule.

## 4. The merge

Five branches on `r82base`, merged into `r82m` at `r82pc` with `--no-ff` in the order F, S, D, U, O, as `M <m@m>`.

- **Clean:** `scripts/build-dossiers.ts` (F's `--list-no-reason`, `KEW_SHARED` and `sayRekey`; S's `recordOf` and `homonymIndex`), `src/lib/dossier/index-entry.ts` (F's `isHybridFormula`, S's `homonymEntries`), the species page (F's line 528, U's blocks), `src/routes/+page.svelte` (S's homonym row with U's chips and welcome), `theme.css` (D's focus rule, U's sizes), `lookups.ts`.
- **Word by word** (round eighty's `wordresolve.py`) and read again: `/about/how` (U against F, S, D; O against those) and `/about/formats` (O against D and F). One text: "Popular genera" throughout; the few-records sentence with M's figure.
- **`docs/DEPLOY.md`:** every agent's section kept; one owner's walk for round eighty-two first; round eighty-one's headed superseded.
- **`tests/unit/fold-rules.test.ts`** (D and O each re-recorded the hash): re-recorded for both under FOLD_RULES 8; no fold changes.

**The needs, settled.**
- **Every agent to the coordinator, `r70b2-follow-42`:** gone with the revert; no agent test leaned on the hotfix (none names FUZZY; the whole suite passes).
- **F to S, "Echeveria peacockii":** a page built from Kew's file does not hold the name of a page merged into it when Kew files that name elsewhere (peacockii, under Dudleya pulverulenta) or not at all (Bisnaga hamatacantha), so after the prune the search found the old name only on Dudleya, or nowhere. Now `indexEntry` gives a kept page the names of the keys merged into it (`occurrences.keys` with an old address) as older names, after its record's own (M). "Bisnaga hamatacantha" then finds Ferocactus hamatacanthus; "Echeveria peacockii" finds both Dudleya pulverulenta (Kew's synonym) and Echeveria desmetiana (the merge), Dudleya first by the alphabet, since both hold the name exactly. Putting the merged page first needs a mark the index and the key files do not carry: section 8.
- **S to U, "Under another author":** the species page now reads the other page's own author and says "Under another author" only of a name the record cites by another (`plainlyAnother`, as `homonymEntries` reads it); one cited by that page's own author is an older name like any other (10 of 283 such names on round seventy-seven's corpus) (M).
- **S and F, one index rule:** S's homonym test expected a formula's first parent still in `syn`; with F's rule it leaves the older names and is never moved to `hom`. The test now says so.
- **U to F, few-records counts on tiles:** not needed; the decision names the card and the section.
- **D to the merge:** the fold hash, above. **O:** no needs; its section's `--tier=app --browsers=all` would be refused by `predeploy` and now reads `--tier=app`.
- **Overlaps, one behaviour each:** Compare's "+N" and its rain labels are U's (S left 20 to U); the climate chip's words are U's ("No climate", "N not checked"); the thin-climate mark is U's display over the counts every dossier already carries (F: no data change), at U's line with M's figure; credits are U's display rule ("author not stated", pages and tiles), with the fill's iNaturalist observer as before.

**Faults found in the merge.**
- **D's batch start line ran 5 px past a 320 px screen at 200% text** (`r67h engines 3`, `smoke-4`, both in the first whole run): "Sown 10 seeds" was held together by non-breaking spaces. Plain spaces now (`propagation/[id]/+page.svelte`); D's own spec still reads the line.
- **/about/how's list of merges was stale:** "Echeveria peacockii into Dudleya pulverulenta" and "Ceropegia nubica into Ceropegia cereiformis" (round eighty sent both Ceropegias to Echidnopsis cereiformis). It now lists the merges as `scripts/merged-pages.txt` holds them.
- **`--list-no-reason` would have listed g7281739 for (d)'s rebuild**, a page that leaves by the merge: it now leaves out every page whose key a merge takes.
- **An empty file S committed at the root** (`proof82-diff.txt`) is removed.
- **The copied review 2 held 27 links to files on the owner's computer** with its user name; `review-82/review-2-gpt.md` keeps the file names only.

The merge's own tests: `tests/unit/r82m-merge.test.ts`, 14 tests (the FUZZY sentence and two guards of the code it states; the Bisnaga merge's line, ids, build line, prune and repair key; /about/how's merge list; the index giving a kept page the merged name, with a guard; `--list-no-reason`; the species page's "Under another author", with a guard).

## 5. What was proved

- **Each agent's new tests fail on the base** (a worktree at `r82pc`, the new files copied in):
  - unit: 20 new files, 80 tests: 70 fail and 10 pass, each a guard (D's snapshot still refused for an ordinary change; F's Wikidata code guard, peacockii's ids, the summary kept whole; O's search counted by address as before; S's key files against the whole index; M's four). `r82o-headers`, `r82o-sw-keep`, `r82s-homonyms` and `r82u-pages` fail as files, their modules missing.
  - browser, Chromium and its phone, no retries: 6 new spec files, 46 tests: 43 fail, 3 pass (O's csp 1 in both projects, that the stricter policy blocks nothing; U's 15, the width guard).
- **The whole unit suite, alone, under `nohup`:** at `7a8f8db`, 528 files, 4,711 passed, 1 failed (the homonym test above), 10 skipped, 591 s; at the final code, **528 files, 4,713 passed, 0 failed, 10 skipped, 593 s**; the seven search-route tests that skip without a corpus of version 2 (as on the PC they run, over `static/s/v2`) then ran over round seventy-seven's real corpus: 7 of 7.
- **Types:** `tsc --noEmit -p .` no errors; `svelte-check --threshold error` 1,398 files, 0 errors, 0 warnings.
- **The whole browser suite, strict, Chromium and its phone** (the lock, port 4806): 675 passed, 2 failed (the batch line above, in two specs), 5 skipped, 0 flaky, 24.2 minutes; after the fix those specs and D's passed (29 of 29); at the final code, the whole run again: **677 passed, 0 failed, 0 flaky, 5 skipped, 23.4 minutes**, no retry needed.
- **The specs read for the ways specs have failed only on the PC.** Every new spec but `r82o-worker` blocks the service worker; `r82o-worker` needs the real worker and makes no failing request and listens for no page error, so WebKit's report of a worker's error answer cannot fail it. No `mouse.wheel` (U scrolls with `window.scrollBy`); D counts distinct photograph files (`id:size:size`); D polls the database for the very line it reads, gives WebKit 1,500 ms a staged photograph and 3 s to see a wipe; U's page-error test (14) runs with the worker blocked and third-party images aborted by a route. Nothing found to fix.
- **The delivery on a copy made like the PC, mid-fill** (`M-s/sim/`): the PC's tree (`r82pc`) and plan file; 44 real pages of round seventy-seven's corpus rekeyed to version 3, among them Bisnaga hamatacantha, the peacockii pair and Sempervivum tectorum, half filled and half left to the fill; the index written by the PC's code; the step 1 backup; `corpus-step.json` at step 11 unfinished. The delivery's 140 files then (the plan file left out, nothing to delete) extracted over it, and `scripts/corpus-step.mjs` run for real:
  - `--status`: 1 to 10 done, 11 unfinished, 12 to 15 to do, no `Note:`; `corpus-step.json` byte-identical after, no log written.
  - **The lock:** held by a live process, a corpus step and a typed `npm run dossier -- --index` each refused (exit 2, "Another run holds corpus-step.lock … Nothing was run"); left by a dead process (pid 999999), taken and said.
  - **A fill day with iNaturalist unreached:** 5 pages unanswered in a row, the run stopped (exit 3, "a source did not answer"), 12 requests failed and none charged, no dossier's content written; its index written once, because the code changed (with `kew-shared.txt`, 1 entry on this copy). **A second such day:** "not written again", no file changed.
  - **A fill day with iNaturalist stubbed:** 44 filled with one batched search, step 12 "not written again", the stop at step 13 (exit 2), whose line now names `kew-shared.txt`.
  - **At the stop, offline:** `--backup filled`, the four listings (`--list-no-reason` "0 pages"), `--prune-followed` saying the two new merges wait for their kept pages ("Echeveria peacockii [7530398] into k2781125; Bisnaga hamatacantha [7281739] into k2808164"), `--index` "not written again", `--compare` 0 differences.
  - One id moved on this copy, Dudleya pulverulenta k2778991 to g2985894, because the copy lacks Echeveria desmetiana (k2781125), so peacockii is not merged away and two pages hold 2778991. On the PC k2781125 is on disk: the ids stay (`r82f-peacockii`'s guard).
  - Not run here: (d)'s online and offline rebuilds, which need the download and the climate grid.
  - Before this run, a first attempt ran a real fill day by mistake (the lock-writing helper failed, so nothing held the lock): 5 paced requests to iNaturalist, with the project's identity, filled 44 pages and went on to the stop as above. The copy was then made again from scratch for the runs above.
- **The index-time changes on round seventy-seven's whole rekeyed corpus** (8,947 pages; `--index` with `r82pc`'s code, then with this delivery's): tile thumbnails change on 2,308 pages (U's lead photograph); tile credits on 2,155, 750 of them now "CC0, author not stated"; S moves 272 names on 240 pages to `hom` and keeps 10 by the other page's own author; F's rule takes out 5 names spelt with an x (Dahlia xpinnata, Malus xdomestica, Paeonia xofficinalis, Pyrus xcommunis, Tulipa xgesneriana), and Nerium indicum, reached only through a formula, is now among Kew's names alone; `kew-shared.txt` lists 9 entries (this copy still holds the merged pairs unpruned; F expects 3 on the live corpus); 8,947 species both times; 77 s and 61 s.
- **Sizes against round eighty-one's** (`r82pc` built and bundled the same way, `wrangler deploy --dry-run`): the Worker 1,969.6 KiB, 503.1 KiB gzipped, against 1,940.3 and 494.2 (29.3 KiB more, 8.9 gzipped); the app's scripts 110 files, 1,390.9 kB (493.7 kB gzipped), against 108 and 1,366.2 kB (485.2) (24.7 kB more, 8.6 gzipped); styles 181.8 kB (44.0) against 179.5 (43.6); the service worker's install 142 build files against 140.
- **Requests:** none to the live site; 15 to GBIF's API for the Bisnaga merge (the species, its children and synonyms, four name matches, four record counts), one a second or slower; the 5 to iNaturalist above.

## 6. The delivery

Every file added or changed since the owner's tree (`r82pc`), as one zip extracted over the project folder; none deleted or renamed, so there is nothing to delete by hand. **Left out: `scripts/corpus-plan-full.txt`**, which did not change and must not. No file under the hard limits changed (`package.json`, `package-lock.json`, `wrangler.jsonc`, `static/s/`, `docs/REVIEW-ROUND-5.md`). The list, one path a line, is the merge's `M-s/delivery-files.txt`; **141 files, 43 added and 98 changed.**

| Where | What runs them on the PC |
|---|---|
| `scripts/build-dossiers.ts`, `scripts/corpus-step.mjs`, `scripts/merged-pages.txt`, `scripts/r82-repair-keys.txt` (new), `src/lib/dossier/` | the fill, `--index`, the review stop and (d); safe mid-fill, as the simulation shows |
| `src/lib/core/`, `src/lib/ui/`, `src/lib/db/`, `src/lib/sync/`, `src/lib/server/`, `src/lib/map/`, `src/lib/backup/`, `src/lib/climate/`, `src/service-worker.ts`, `src/hooks.server.ts`, `src/app.d.ts`, `svelte.config.js`, `src/routes/` | the app and the Worker, with the deploy; `core` and `dossier` also by `--index` (the lead photograph, the tile credit, the care-group table) |
| `tests/unit/`, `tests/e2e/` | `predeploy` and the release gate |
| `.gitignore` | git only (`kew-shared.txt`) |
| `docs/DEPLOY.md`, `docs/REVIEW-ROUND-82.md`, `docs/review-82/` | reading |

**Safe mid-fill, all of it.** The fill runs none of the changed builder code but the index; the index's changes write no dossier but the shared-photograph marks it always writes; the merges change no id on the live corpus until (d) rebuilds their kept pages; `--status` writes nothing; an unchanged index is not written again.

## 7. The owner's walk

`docs/DEPLOY.md`, "Round eighty-two: the owner's walk", is the whole of it, one step at a time and never while `corpus-step.mjs` runs:

- **(a)** the delivery, `--status`, optionally the `wrangler.jsonc` comment, `predeploy --tier=app`, `corpus-ready && npm run deploy`, the checks;
- **(c)** the daily fill to its end, about three days; the first day after the delivery writes the index in full, with `kew-shared.txt` and the `hom` line;
- **(d)** at the review stop: round eighty-one's block with `--list-no-reason` before the online line, which reads `scripts/r82-repair-keys.txt` (Echeveria desmetiana and Ferocactus hamatacanthus) and `rebuild-no-reason.txt` too; `--prune-followed` then deletes four pages (9574874, 9592399, 7530398, 7281739) and `kew-shared.txt` goes; about four and a half hours before the upload, as before, plus a few minutes;
- **(e)** after the upload: the dependency delivery, the prune, the `s/v2` purge on or after 26 October, the WebKit walk.

Delivered before the fill's last day (about 26 October), the index-time changes reach the site with the plan's own upload.

## 8. For the owner to decide

- **"Echeveria peacockii" in the search.** Both Dudleya pulverulenta (Kew's file files the name there) and Echeveria desmetiana (your merge) hold it; the search lists Dudleya first, by the alphabet, while `/species/echeveria-peacockii` goes to E. desmetiana. Recommended: leave it for this upload, both pages being true to their sources, and in round 83 mark a merged name in the index so the merged page comes first.
- **The `wrangler.jsonc` comment** (O): recommended, walk (a) 3.
- **HSTS `includeSubDomains`** (O): left off; recommended to stay off unless every cultifolio.com subdomain serves HTTPS.

## 9. Left for round eighty-three

- **The species page's weight** (review 1's 8, its first half): 238 kB of HTML on Sempervivum tectorum, most of it inline SVG and hydration data.
- **The hand review of the thin and implausible climates** (review 1's 40): Dracaena trifasciata's 1,437 m cell, Cedrus deodara's floor, Haemanthus pumilio's rain, Eulychnia acida's extremes, Echinopsis cuzcoensis against Kew's "desert"; the mark now says where a climate rests on few records, not whether it is right.
- **The 50 most-grown species' climate pages**, read by hand against their sources.
- **The dependency delivery after the upload** (round eighty-one's C4 list; walk (e) 1).
- The merged page first for its old name (section 8); finer coastlines on the close-up map (U); a check of ranges reached through older names that land on another page's entry (F); the Workers' tabs still on round eighty-one's code during the deploy have no lock (D); WebKit and Firefox, which run only on the PC.
