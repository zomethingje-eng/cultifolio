# Triage of the self-review of round seventy-one (for round seventy-two)

Six reviewers audited the deployed round seventy-one (`c290e0f`, corpus `4c784c5dc7ca2448`) against the real corpus and Kew's real files in the workspace: `review-71/self-A.md` (names, authors, identifiers, summaries), `self-B.md` (ranges, records, climate), `self-C.md` (photographs), `self-D.md` (the corpus step and the process changes), `self-E.md` (the device, sync and the server), `self-F.md` (pages, the about pages, the harness). This is what round seventy-two does with them. "Do" means fix this round, with a test that fails on `r72base`; "owner" means a decision for the owner, with a recommendation; "later" means not this round, with why.

## Decisions of principle

- **A page cites the name it links.** Where Kew's number the page links is the page's own words by another author, the name is cited as Kew cites it, and the page says GBIF's key carries another author (A1). This settles Ixora coccinea and 226 others. B's note on a range by another author's entry (B2) stays for the pages A1 does not change.
- **Behaviour no longer hangs on a sentence.** The page's notes under the name and beside the range read structured fields (`name.cited`, `distribution.via`), with the old sentence read only for dossiers built before (F13).
- **A day the page states is the source's day.** A range read from Kew's file of 4 June 2026 says so, not "asked" on the build day; GBIF's records say the day of the download (B1).
- **Kew's synonymy is read once, offline.** One fill from Kew's files stores, for each page, Kew's synonym binomials of its entry and which of GBIF's older names Kew accepts as species of their own. The page, the Commons rules and the iNaturalist filter read it (A2, C1, C4).
- **The corpus step is one command** (`node scripts/corpus-step.mjs`), resumable, with a log in the project folder, review stops and an upload check; Wikidata item reads no longer wait on the query service's lag; the day's answers are cached (D).

## A: names, authors, identifiers

| # | Finding | Decision |
|---|---|---|
| A1 | 227 pages cite an author other than the name they link (Ixora coccinea, Fragaria virginiana, Diospyros kaki, Durio zibethinus) | Do: A's `kewCitation`, written by the new Kew fill; the build does the same |
| A2 | 275 pages list 379 older names Kew accepts as species | Do: the Kew fill marks them; F lists them apart ("Kew accepts as a species of its own") |
| A3 | 138 pages link no POWO or IPNI though Kew holds the name and author | Do: Kew's number by name and author whenever the item gives none; `kew-links` reads every dossier |
| A4, B6 | "another name" said of the page's own name (5 records); Cochemiea matehualensis's right POWO link dropped | Do, one rule: A owns `authors.ts` and takes B's no-author-outside-the-brackets case and its Peckover guard; B takes A's `bulk.ts` wording |
| A5 | Ceropegia macrocarpa: drop was right | Do: the registers say "Kew holds this name only under another author; no POWO link" |
| A6 | Echinocereus marksianus links a dead IPNI number ("-4") | Do |
| A7, C6 | Seven pairs of pages are one plant by Kew's synonymy; Weingartia fidaiana and Rebutia fidana an eighth | Owner. Recommend merging the two homotypic pairs (Coryphantha and Pelecyphora macromeris; Rebutia fidana into Weingartia fidaiana) by redirect in round 73, and keeping the heterotypic ones with the range note shown beside the map this round (B3) |
| A8 | Three common names are another species' scientific name | Do: a vernacular name that is a binomial the reference or Kew holds is dropped |
| A9 | Spelling-only IPNI records, items under another name | Later: each proved by the rules |
| Homonym keys | About 14 pages | Owner. Recommend keeping every key and name now (ranges, records and climate are already the familiar plant's); reading records from both GBIF keys where Kew holds the target as a synonym is round 73 work, since it needs a `--keys` rebuild of each |
| spellingKey | Seven pairs across all of Kew, none in the reference | Do: a test that pins the seven; the key is not changed |

## B: ranges, records, climate

| # | Finding | Decision |
|---|---|---|
| B1 | About 8,450 ranges say "via GBIF" and "asked" on the build day; read from Kew's file of 4 June 2026. 7,593 GBIF record rows likewise | Do: the bulk loader passes the file's day; the source names Kew's files and their day; Provenance says "as of" for a file |
| B2 | 143 ranges are Kew's entry by another author, unsaid | Do, after A1: the note where the cited name and the entry still differ |
| B3 | 476 range-source notes shown only in the folded record; six take another reference page's range | Do: shown beside the range (`distribution.via`) |
| B4 | 912 pages' "only N land cells hold an in-range record" is false when records are vague | Do, on the species page and the plant page |
| B5 | 53 pages drop Kew's doubtful regions unsaid | Do: "Doubtfully present in", and the about sentence |
| B7 | Three names Kew spells one letter otherwise, same author and basionym, no other row: no range | Do, held to those conditions; the three are listed for `--keys` |
| B8 | Delphinium cultorum (an artificial hybrid's synonym), Agave calodonta (a nameless region), Aphelandra squarrosa (unplaced, unsaid) | Do |
| B9, D4 | `--list-rebuild` lists 55 finished pages, every round | Do: compare the page with the rule only; a homonym key checked is recorded |
| B10 | One stray record called a disagreement (31 pages); the log prints only 20 or more | Do |

## C: photographs

| # | Finding | Decision |
|---|---|---|
| C1 | iNaturalist includes subspecies Kew accepts as other species: about 170 photographs on 11+ pages, six wrong leads | Do with Kew's rows (`--bulk`), not the index's six synonyms; `--fill inat` re-asks the pages it finds |
| C2 | 46 false hides from the bare-genus and run-on rules | Do |
| C3 | The slip guard refuses GBIF's second spelling by the same author (open issue 5); `commons-kind` never re-asks | Do |
| C4 | Kew's synonyms unread: about 21 files hidden, two pages left with none | Do: `ownNames` reads the Kew fill's synonyms |
| C5 | One photograph on two species' pages (Sassafras albidum's lead, survey plots) | Do: `--index` marks a photograph two dossiers hold; neither shows it |
| C7 | Drops count stored, not shown, photographs (Adenia tisserantii: right to drop) | Do |
| C8 | "specimen in the … Museum" read as a herbarium sheet (Agave titanota) | Do: a museum specimen is a sheet only with a pressed word or "herbarium"; the kind is read again |
| C9 | Weak Commons leads (Heliamphora purpurascens, Boswellia papyrifera) | Later; listed |
| C10 | Three credits publish an e-mail address | Do: every source's credit drops an address; a CC BY or CC BY-SA photograph with nothing left is not shown |
| F8 | iNaturalist's "processing" placeholder stored as a photograph | Do, in the builder and the page (C's files) |

## D: the corpus step

| # | Finding | Decision |
|---|---|---|
| D1 | `--fill wikidata` writes the item's IPNI and POWO over Kew's | Do |
| D2 | Nothing re-asks a Wikidata row that did not answer (19 dossiers, nine of the ten changes) | Do |
| D3 | A truncated dossier silently leaves the index | Do, and dossier writes become write-then-rename |
| D5, D6, D7 | `kew-links` restarts from zero; `gbif-open` re-asks eight forever; messages misname sources; unfinished fills exit 0 | Do; an unfinished fill exits 3 |
| D8 | A half upload passes the live check | Do: the step checks the bucket before the manifest and waits for the site to serve the new corpus |
| D9, E-prune | Three prune gaps; dossiers of species no longer listed stay in the bucket | Do: the guarded prune in the one command, with its dry run a stop of its own; the top-level listing against the index is reported, not deleted, this round |
| maxlag | The lag is the query service's | Do: removed from Wikidata reads; Commons keeps it; the 53 fixtures read through a helper |
| One command, day cache | | Do, as in D's trial; `svelte-kit sync` runs first (B11) |
| Ten Wikidata changes | Nine remain (Rubus parviflorus done) | `--fill wikidata` lists them; `--keys` rebuilds them, now with no lag wait |

## E: the device, sync, the server

| # | Finding | Decision |
|---|---|---|
| E1 | Year-first dates from 2013 on, and day-first past the twelfth, never asked | Do |
| E2 | A photograph timing out stops the device receiving | Do |
| E3 | The doubled photograph wait does not hold | Do |
| E4 | `/api/dossier/<key>` serves a key the index no longer lists | Do |
| E5 | A shorter refusal under the day's refusal is retried every five minutes | Do |
| E6 | New-vault ceilings: 200 a day site-wide by default | Owner: set `SYNC_VAULTS_PER_DAY` and `SYNC_VAULTS_MAX` before the launch |
| E7 | About 0.4 s CPU per cold isolate (node, not Workers) | Owner: confirm the plan and measure with `wrangler tail`; products for the maps if near a limit |
| Gaps | The 16-minute cap, the unsent list's deletion, the free count under a whole line | Do: three tests |

## F: pages, the about pages, the harness

| # | Finding | Decision |
|---|---|---|
| F1 | A frozen wet season read as "a winter growing season" (72 pages) | Do: no growing season read when a wet month's mean nightly low is below 0 °C (check `FOLD_RULES`) |
| F2 | /about/how says Kew counts the stapeliads as Ceropegia | Do: F's sentence, checked against the merged code |
| F3, F5, F6 | The POWO sentence; "Kew holds no entry" false on six pages; 51 summaries' proof unsaid | Do |
| F4 | 19 pages' register links short with no "not checked" | Do |
| F9 | "Cactus" ranks two Copiapoa first | Do: no headline from a generic noun alone; an exact match on one does not outrank |
| F10 | First visit 1 to 1.7 MB, half the service worker's precache | Owner. Recommend registering the worker at the second page or the first plant, in round 73 with every engine run |
| F11 | The phone's catalogue opens on Abelia | Owner. Recommend opening on the collector genera |
| F12 | "The reference has no Not" | Do |
| F13 | Notes hang on free-text sentences | Do (with A and B) |
| F14 | About pages' lag clause | Do (D's sentence) |
| Harness | Tiers; workers; smoke runs alone for a third of the run | Do: `--tier=corpus|app|launch`; four workers for Chromium, two for WebKit and for the launch run; smoke split into four serial files along its sections |

## Ownership for the fixes

Each agent works from its trial diff on `r72base`. Files shared by necessity (`scripts/build-dossiers.ts`, `src/lib/dossier/build.ts`, `corpus-fills.ts`, `src/routes/species/[slug]/+page.svelte`): keep hunks small and in your own functions; the merge applies them in the order D, A, B, C, E, F. `authors.ts`, `sources/gbif.ts` and `ui/ref/head.ts` are A's; `bulk.ts`, `climate/provider.ts` and Provenance are B's; `photo-kind.ts`, `commons-fill.ts`, `sources/inat.ts` and `drops.ts` are C's; `fetch.ts`, `day-cache.ts`, `corpus-run.ts`, `corpus-step.mjs`, `wikimedia.ts` and `DEPLOY.md` are D's; `lib/import`, `lib/sync`, `routes/api` are E's; `/about/*`, the search, `core/sheet.ts`, `ui/ref/upstream.ts`, `predeploy.mjs`, `playwright.config.ts` and `tests/e2e` are F's. The about pages are written by F after the merge, from every agent's sentences.
