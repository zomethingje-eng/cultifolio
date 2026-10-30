# Round 84, agent M: the merge

Copy `/tmp/claude-0/rev84/M/`, branch `r84m` at tag `r84r` (= `r84base`, `ba78fb9`). Scratch `/tmp/claude-0/rev84/M-s/`: every log (`unit-*.log`, `e2e-*.log`, `base-*.log`, `walk/*.log`, `live/*.tsv`), the coast-rule measure (`coast/`), `delivery-files.txt`, `delivery-deleted-renamed.txt`, `round84-msg.txt`. The copies the checks ran on (the base worktree, the live-corpus tree, the walk's tree, round 77's corpus) were deleted after, about 3.4 GB.

**Against `r84base`: 225 files, 69 added and 156 changed, none deleted or renamed.** No file under the hard limits changed (`wrangler.jsonc`, `static/s/`, `docs/REVIEW-ROUND-5.md`, `package.json`, `package-lock.json`, `scripts/corpus-plan-full.txt`).

## Done

### 1. The six merges

G, N, E, K, U, A, each `--no-ff`, as `M <m@m>`. Every shared file merged cleanly but `docs/DEPLOY.md` (N and K each conflicted with G's section; both sides kept). I read the merged passages again: `bulk.ts`, `build.ts`, `build-dossiers.ts`, the species page and its server file, the plant page, `theme.css`, `sheet.ts`, `extra-keys.ts`, `+layout.svelte`, `search.ts`, the about pages. `tsc` was clean straight after.

### 2. What the reports asked of the merge

- **A's 55 marked sentences**, each read against the merged code, the marks then removed. Wrong and corrected:
  - a plant under the old heading: the old name leads to the page *except where Kew's file holds it for another plant* (k3313620);
  - "Is it an older name?" is a press (K), not a look the page makes;
  - D5's links come wherever the record lacks *either*;
  - a name still holding a letter of another script is not shown (`latinName`);
  - the record-low check worded as two sources disagreeing; "Habitat in short" as E heads it;
  - the coast rule's reach: 0.15° is about 17 km, not 16 (the code's comment too);
  - `occurrences.rangeRule` added to /about/formats;
  - "In brief" says a page follows the rules of its build day and names the rules that wait for the walk;
  - a "Log log" typo in /about/formats.
- **E's `details.unchecked-why`** added to `disclosure-list.ts`, with a setup on Hesperocyparis lusitanica.
- **U's sentences:** "within the next 72 hours"; the compare tray out of the private pages' preload list. The `numbers-kept`, restore and 120-character sentences were already right.
- **K's privacy sentence**, in the privacy list and in "what is sent".
- **G's coast rule, judged and kept.** On the 617 live dossiers it recovers 386 open records; only 10 had a second region's coast within reach, 9 of those both native, and the tenth (Capparis spinosa, Princes' Islands) went to the nearer Asian shore, where TDWG puts them. It is narrower than the box it replaces and never moves a record off land. I would defend it to a botanist; /about/how states it.
- **N's edits in `bulk.ts` and `+page.server.ts`:** read; right over today's corpus (`name.shared` absent: the call as before).
- **E's note:** a page whose only keys are merged pages' (Ferocactus hamatacanthus) said Kew's file holds them as this plant. `kewKeysWords` (`build-kew.ts`) says whose keys were read. Step 2.
- **One behaviour each:** the extremes' words are E's `lapseCause` everywhere (A's page follows, no other agent wrote any; the builder's comments too). The lead photograph: N picks the strip's species, E's `heroOf` the photograph, page and tile alike. The picker's words are K's; the about pages say K's rules.

### 3. Faults found in the merge, fixed and tested

- **200% text at 320 px scrolled the species page sideways** (`r62ba N10`, `r67h engines 3`): E's season-card link kept on one line. It wraps under 641 px.
- **Eleven unit tests failed only together:**
  - G's no-build-without-shapes stopped four older builder tests (their folders now get the file);
  - N's stored Kew row was not in the fixtures test;
  - U's meta write was read as raw by the harness guard (marked `raw-ok:` with its reason);
  - /about/how's geographic "place" words were unknown to the spaces guard;
  - an older test guarded a 300 px lead against E's 640 px floor (the floor wins);
  - r70p and r79f read sentences A rewrote.
- **`smoke-3`'s frost night was fixed on 2 November.** That is outside U's 72 hours from now until about 10:00 UTC on 30 October. It is now tomorrow.
- **E's print test** asserted that a style sheet alone opens `<details>`, which Firefox cannot do. It is now guarded by `CSS.supports('selector(::details-content)')`.
- **The walk's plan headed only the last run's pages.** The builder reads Kew's names and the varieties' names at the end of each run, for that run's pages. The plan now runs `--fill kew-names` and `--fill gbif-infra` over every page after the walk. On round 77's 8,940 pages the Kew fill needed a second pass for 2 pages (Berberis repens's heading, Yucca luminosa's citation); a third changed 0. So the walk's own fill plus the plan's is exactly enough.
- **`--check-ranges` advised an offline re-derivation that cannot work.** On my walk of the 617 live pages, 2 were carried (their range comes through GBIF's older names, which offline does not ask: Monsonia lheritieri, Conophytum tomasii), so the check stopped the upload. Re-derived offline, they would be carried again. Online with `--skip inat`, both were tested by r84, and Monsonia lost Sarcocaulon spinosum's range (N's A6b) as intended. The check then read 0/0/0. The advice, G's DEPLOY lines and the walk now say "online". Expect about 150 such pages of 48,357.
- **A repository path on every page with records:** the default points' words ("…no year: scripts/default-points.txt; …"). Fixed where written (`defaultWords`) and where shown (`readerWords`).
- **W4 (unassigned):** "Sansevieria trifasciata" listed Dracaena trifasciata without "older name"; a common name now takes the words alone.
- **A13's storage toast** in a grower's words: "This browser may clear your plants to free space: take a backup now and then."
- The Kew fill holds only the names it reads, not whole dossiers (memory; the peak is the index's anyway: 1.41 GB at 8,940 pages).

Tests: `tests/unit/r84m-merge.test.ts` (17), plus G's walk-check (the plan's fills, the online advice).

## Checked

- **New tests on `r84base`** (worktree, the new files copied in):
  - unit: 20 new files. 11 ran: 112 tests, 100 fail and 12 pass, the guards. 9 fail at import, their modules absent (A's about test, E's words, G's maps and records, K's names, N's heading and index, U's live check and predeploy).
  - Per agent, behavioural failures: G (`r84g-shapes` 49/51, `walk-check` 11/11), N (`search` 11/16, `strip` 3/5, `summary-cut` 3/3), U (`ledger`, `sync`, `instants` 4/5, `icons`, `frame-notes`), M (9/11).
  - browser, Chromium and its phone, no retries: **all 48 tests of the six new specs fail**, which samples E, K and A behaviourally (`base-e2e.log`).
- **The whole unit suite, alone, `nohup`:**
  - first: 554 files, 5,011 passed, 11 failed (section 3), 10 skipped, 529 s;
  - final: 554 files, 5,026 passed, 0 failed, 10 skipped, 542 s.
- **Types:** `tsc --noEmit -p .` 0 errors. `svelte-check --threshold error`: 1,453 files, 0 errors, 0 warnings, run alone, 33 s. The builder under `tsconfig.scripts.json` has the 8 errors base has.
- **The whole browser suite, strict, Chromium and phone, no retries:**
  - first: 740 passed, 3 failed (section 3), 5 skipped, 25.4 min;
  - rerun of those specs: 125 passed, and 1 test failed once (`smoke-3` round 59's 2.4.11 walk on /about/how). It passed 4 of 4 repeated and 6 of 6 with `/api/counts` delayed by 0.3 to 2.5 s; not reproduced;
  - final: 742 passed, 1 failed, 5 skipped, 25.5 minutes; the one, `r60 14`, read the storage toast's old words (the merge's A13 rewording), and with its pattern updated it and `r82d-record` passed 24 of 24, no retry.
- **Specs read for the PC's ways of failing:** every new spec blocks the service worker; there is no `mouse.wheel`; CDP is used only in `@chromium`-tagged tests (U's CLS and notch). The fixed waits are U's negatives (800, 200 ms) and K's 400 ms past the page's own leave timer, each commented. K's IndexedDB reads poll the very line. Fixed: E's print guard and smoke-3's date.

## Step 1, the deploy over today's corpus

The 617 live dossiers and a live-index subset (18,335 entries of their 400 genera), served by the merged app:
- **under `vite dev`: 617 of 617 species pages 200.** None holds "undefined", "NaN" or "[object Object]". The old extremes words are gone; 46 say "extremes set aside", 617 have the phone's habitat line and the maps' captions tied, and 613 draw the regions' shapes. Search answers snowdrop, "Sansevieria trifasciata", "lithops lesleyi" and houseleek right. `/api/counts` answers.
- **under `wrangler dev`, production builds of merge and base, the same corpus:** 617 × 200 each.

| Page | Base | Merge |
|---|---|---|
| Sempervivum tectorum | 169,046 B (37,832 gz) | 174,446 B (38,834 gz) |
| Echeveria elegans | 128,875 B (27,065 gz) | 135,144 B (28,368 gz) |
| all 617 pages | 73.23 MB | 76.18 MB (+4.0%) |
| /about/how | 148,553 B | 173,310 B |
| /about/formats | 132,900 B | 162,081 B |
| the front page | 102,749 B | 102,076 B |

Live: 174,671 and 130,546 B.

- **Sizes** (`wrangler deploy --dry-run`, the same way):
  - the Worker: 2,033.98 KiB, 519.37 gzipped, against 1,960.73 and 503.51 (+73.3, +15.9);
  - client JS: 112 files, 1,474.3 kB (518.4 gz), against 111 files and 1,379.1 kB (494.2), so +95.2 kB (+24.2 gz). The about pages' nodes grew by 29.5 and 24.5 kB, and the species page's by 25.2 kB;
  - CSS: 174.5 kB (44.7 gz) against 168.9 (43.6).

## Step 2, the walk, as far as it runs here

- **The walk itself.** `--list-walk` then `--walk --offline --bulk <Kew's files>` on the 617 live dossiers, with no grid (so climates pending) and no download. Records were therefore read from GBIF's API: 1,709 requests at the builder's own pace, about 0.7 a second, plus 12 for the online re-derivation. That took 40 minutes at a peak RSS of 1.72 GB.
  - 617 built; 8 headings and 8 slugs changed, N's eight exactly; 73 pages linked to their Kew entry.
  - the fills: Kew's 0 changed; `gbif-infra` stops (exit 2) with no export, as the plan must.
  - `--index`, then `--check-ranges`: 2 carried, as above. Online, then 0 / 0 / 0, and Aloe vera, Galanthus nivalis and Melissa officinalis `fixed:` (Ficus and Indigofera are not in the sample).
- **The Kew fill on round 77's 8,940 pages:** 1 min 47 s, 1.43 GB, 482 headed.
- **Not provable here:** the climate grid, the download, and GBIF's backbone export (N's `infra-names` is tested on GBIF's own rows). The backbone of 2023-08-28 is read only for the names under a species' varieties. A name GBIF filed so after that day is not searched; nothing shown comes from it.

## The delivery and the documents

- **`M-s/delivery-files.txt`:** 225 paths. No deletions or renames (`M-s/delivery-deleted-renamed.txt` says so).
- **`M-s/round84-msg.txt`:** the commit message, ending in the two lines asked for.
- **`docs/REVIEW-ROUND-84.md`:** the three reviews' findings, each with its fix or why not; the owner's decisions; the merge; the decisions taken; the measurements; what is left.
- **`docs/review-84/`:** K, E, G, N, U, A and M, `outside-a.md`, and the reviews as in `/mnt/user-data/outputs/`. `docs/REVIEW-SELF-84.md` and `docs/REVIEW-TRIAGE-84.md` are included as they are.
- **`docs/DEPLOY.md`:** "Round eighty-four: the owner's walk" comes first, with (a) to (f). The round's agent sections follow it together.

## Decisions taken for the owner

1. **The coast rule kept** (above).
2. **The walk's plan reads both fills for every page,** and stops if GBIF's backbone export is missing rather than skip San Pedro silently. The walk's first command checks the file.
3. **E's 640 px floor outranks the Commons title rank:** a lead blown past its pixels is the fault the reviews named.
4. **Carried pages are re-derived online** (`--skip inat`), not offline.
5. **U's tray on species pages only, K's old hybrids read as written, N's "Fig" kept:** each agent's own reasoned decision, accepted.
6. **"Yugoslavia" left** (A6d): WGSRPD's own unit name.

## Not done, with why

- **WebKit and Firefox:** Chromium only here. The walk's (a) 2 names the four specs most at risk.
- **The climate, the download and the backbone export** are not here.
- **P5's cut:** it needs an iPhone timeline.
- **W11's remainder, A6g, A13's ArrowDown and letter jump, A21's default-points listing:** listed in REVIEW-ROUND-84 section 8.
- **The rare `smoke-3` 2.4.11 failure:** seen once, not reproduced in 10 runs.

## Requests

None to the live site (the comparison sizes are the reviews'). GBIF's API: 1,721 requests by the builder in the walk and the re-derivation, at its own pace, with the project's identity. Nothing else outside.
