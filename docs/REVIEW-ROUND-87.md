# Round eighty-seven: the look, browsing, the species page's new figures and the tracker, in three stages

Cultifolio is live with round eighty-six's Worker (of `47f7451`) over corpus `41e65994323067ef`, 48,375 species pages, at
head `r85m`. This round built the plan's sections C (browse), D (the look) and E (from the look at other references and
trackers, 8 November), in `PLAN-86`, in three stages, each reviewed and put right before it ships:

1. **The look, the about pages and browsing** (`r85m..r87s1`, 8 and 9 November): code, and the index written again.
2. **The species page's new figures and pinned views** (`0e89cc6..r87s2`, 9 November): code, then one walk of every
   page on the owner's PC and fills that run for days.
3. **The tracker** (`9311e8b..r87final`, 9 November): code alone.

Agents worked each on its own branch and files: in stage 1 **backbone** (GBIF's move to the Catalogue of Life),
**pages**, **look**, **browse** and **data**; in stage 2 **derived**, **sources**, **links** and **browse**; in stage 3
**t1** (identity and provenance), **t2** (lineage, batches and flowering) and **t3** (Today, papers, labels, the sheet,
the lock). The coordinator merged each stage, mounted the species page's new sections, wrote the plans and this record.
The contracts they built to are `DESIGN-87` (the look), `STAGE2-87` and `STAGE3-87`; their sentences for the about
pages are `docs/about-87/*.md`; GBIF's move is `docs/COLXR-87.md`; the owner's notes are `docs/STAGE2-OWNER-87.md` and
`docs/STAGE3-OWNER-87.md`.

## 1. What was built

| Item | Plan | Who | Stage |
|---|---|---|---|
| GBIF's occurrence searches name the GBIF Backbone (`checklistKey`); an answer keyed by another taxonomy is "did not answer", never read; the build prints the taxonomy its searches named; the download's requests, its counts and the species selection name it too; the backbone's export read from its dated folder (2023-08-28) | E, "verify first" | backbone, coordinator | 1 |
| The look: Source Sans 3, Source Serif 4 italic for scientific names alone and Source Code Pro for keys, vendored with their OFL.txt, metric-matched fallbacks, one font preloaded; the tokens of DESIGN-87 (white paper, warm greys, one green, rules not cards, 4 px corners, tabular figures) and the dark theme by the same mechanism; the top bar and the phone's tab bar | D2–D4, D7, D8 | look | 1 |
| The front page leads a visitor with one figure from the reference and its trail: the coldest night on record where the day's species grows wild, its records and grid cells inside Kew's native range, the GBIF download they came from and NASA POWER's daily temperatures; no counters row | D1 | look, coordinator | 1 |
| /about in the owner's words (who made it, how AI was used, what it costs, the tests, the source); /about/data (what can be downloaded, each part's licence, how to cite it, GBIF's downloads read from the corpus served); /changes (the round records as plain dated lines, read by the front page's "Changed lately"); the not-found page shows the day's first species, credited in full | D5–D7 | pages | 1 |
| A plant filed under another page's name records whether it is GBIF's name or an older one (`olderKind`), read on read (round 86's U3, the deeper fix) | round 86, U3 | pages | 1 |
| Browsing: the TDWG hierarchy from TDWG's own tables, country presets and region aliases; one engine (regions any or all, family, genus, climate known, grown, only here) with counts that are what a click gives; /browse, /region, /family and /genus; breadcrumbs, filtered views noindex, a share image only from a photograph under CC0, CC BY, CC BY-SA or in the public domain; the list view and the CSV | C1, C2, C4 | browse | 1 |
| The search box in the top bar: browse rows (genus, family, country, region and their other names) beside the catalogue's species; a full species name wins Enter; recent searches, in the browser only; the searches Plantistry fails held by a test (older names, common names, GBIF's names, a typing error) | C3, C13 | browse, coordinator | 1 |
| The index writes the browse table (`browse.json`) and its counts (`browse-counts.json`) in the same pass | C1 | coordinator | 1 |
| Rule r87: a record's stated state read by its ISO 3166-2 code and old provinces' names too (round 86's final review M2) | round 86, M2 | data | 1 (code), 2 (the walk applies it) |
| A carried row keeps what the build that asked said; published papers (literature) are off on every path; `--check-summaries`; the drops audit reads each page as written; an offline walk keeps a range it cannot read; Commons asked by the photographs the page will show; the records that came through GBIF's search counted by dataset (`occurrences.api`) and `--list-derived` | round 86, held open; E1 | data | 1 (code), 2 (the walk) |
| Hardiness of the habitat (USDA zone of the mean yearly lowest night, RHS band of the record low; the walk keeps each year's lowest night); Köppen–Geiger class (Peel and others 2007) and a Walter–Lieth reading; "At home, aim for" targets with their arithmetic; the index's record low and first-seen day | E4, E5, C10, C5 | derived | 2 |
| Homonyms said by Kew's authors (`name.kew.by`, round 86's D13); the older names classified (B17, a report) | round 86, D13, B17 | derived | 2 |
| Kew's predicted extinction risk (Bachman and others 2024, CC BY 4.0, IUCN's categories not shown); CITES Appendix status from a hand-transcribed table, applied only once the owner has checked it; ChromoDB's chromosome counts (version 3.1, CC BY 4.0); WFO Plant List's reading of the name (2026-06, CC0); all read offline by identifiers | E2, E3, E8, E9 | sources | 2 |
| Flowering by month from iNaturalist's research-grade wild observations (`--fill flowering`); other registers from the page's own Wikidata item (`--fill elsewhere`); where the name was published (Kew's file) and BHL's page for an exact citation (`--fill bhl`); a named hybrid's parents as Kew states them | E6, E7, C11 | links | 2 |
| Pinned views as setting records of the log (at most fifty) with what changed since; the map picker and the results map from the site's own map files; the collection lens on region, genus and family pages, in the browser; next door on region pages | C6–C8 | browse | 2 |
| Items under an accession (2026-0012/A); deaccession kept with its reason; ITF2 provenance, propagation history, collector, collector's number and identification fields; field numbers read as code and number with a BCSS lookup the grower presses; cf./aff./sp., "ex" chains, clone names, re-identification | F1–F3, F6 | t1 | 3 |
| Lineage: crosses, grafts and the plant an offset was taken from, as fields on existing kinds; a batch sown from a cross; checkpoints and losses by cause; fruit set; flowered this week in past years; the flowering calendar; the photo walk | F4, F5, F8, C12 | t2 | 3 |
| A growing season per plant, suggested from the species page's rain rule and confirmed by the grower, its rest months kept dry on Today and in the watering calendar; papers kept with a plant as photographs are; labels on 12, 18 and 24 mm tape, a backup label, a large number, the code carrying the plant's number, and their room held from the first frame (W12); the plants sheet of every field and a printable report; an app lock for a shared device, a screen and not encryption | F7, F9–F12, W12 | t3 | 3 |

Every new log field is a field on a kind round 86 already reads; no new kind. Round 86's own log module, kept verbatim
in the tests, folds the new records, and the new code folds round 86's (r87b-pins-log, r87t1-log, r87t2-lineage-log,
r87t3-log). The fold rules stay at 8; the fold hash was re-recorded under 8 with all three agents' fields.

From round 86's list (its section 3), this round did: D13; the border allowance's unmatched state (rule r87); B17's
classification (`scripts/dev/r87-older-kinds.ts`, a report); W12; the browse feature set; from the look at Plantistry,
the At home targets, a hybrid's parents side by side, the photo walk and the search tests; the look; and from its
section 5, the Commons count taken after duplicates (Ceropegia elegans), the drops audit before Kew's heading (Delphinium
× barlowii), an offline walk's "none" for a range it cannot read (Conophytum tomasii), a carried summary's proof and a
walk carrying papers.

## 2. The reviews, and what was put right

Each stage was reviewed before it ships, by one reviewer reading the user-facing code and one the data, or for stage 3
the tracker. Each found real faults; each was put right on its own branch, with tests, and merged.

### Stage 1, user-facing (`r85m..r87s1`; put right on `r87-uifix`)

| Finding | Done |
|---|---|
| The browse pages' counts, caches and addresses, the CSV's size and `/api/suggest` (B2, S1, S4, S5, M5) | "Not counted", never 0, and how many are not counted where some are; the counts in one module; every browse page counted under render, its HTML private for a minute, its address moved to its one spelling; the CSV under the index's allowance; `/api/suggest` kept only under its corpus and build, and no rows without a table |
| The search box's browse rows, its note to a screen reader, and "/" over the menu and a dialog (M3, M4, M5) | Asked under the corpus and the build; the note in the live status and the box's description; "/" leaves the menu and a dialog alone |
| The front page's Browse rows, the not-found page's links, the lead's photograph and credit, a grower's first screen, and the phone's first screen (B1, B2, S2, S6, S7, M2) | The Browse rows count what the browse pages list, with no map, and are the catalogue's groupings where the corpus has no browse table; the not-found page links the browse pages only where they answer; the lead's photograph preloaded, never shown without its credit's day; a grower's device never paints the lead; on a phone, one sentence of what this is under the figure |
| A name's kind and the name it was read for (M1) | Filed with the `olderOf` it was read for (`olderKindOf`), read only while that is still the name |
| The shell's theme colours and top bar (M6) | The look's ground, white and #141615, and the new top bar; no comment |
| /about/how's sentences (S3, S5, M2) | It names the browse pages among those that load outside photographs, and says the browse pages' and the CSV's limits and the lead's rule for a credit's day |

The findings are held by tests (r87u), each a test of behaviour, not of source text.

### Stage 1, data (`r85m..r87s1`; put right on `r87-datafix`)

| Finding | Done |
|---|---|
| A carried row's words cut at "; that build: "; a carried taxon's rows did not name the build whose words they are (M3, M2) | Read as the builder writes them, whole; each names its build |
| A current ISO 3166-2 code read by the shape, not as its place's name (S1); China's, Russia's, Ukraine's and Pakistan's codes, and ISO's names with their kind (M1) | Read as the place's name, only an old province left to the shape; the codes put right, the rest by hand against Natural Earth's; /about/how says which codes are not read |
| The pages an offline build did not derive again were not listed (S2, S3) | `--list-offline` writes rebuild-offline.txt from the dossiers on disk, each page whose range source was not asked, carried or not |
| `--check-summaries` said nothing of the summaries it could not check (S5) | Says how many, lists them in check-summaries-unchecked.txt and exits 4, a stop the plan's runner makes |
| The stage had no plan | `scripts/corpus-plan-r87s1.txt`: the index, a review stop, the upload, the live check |

### Stage 2, data (`0e89cc6..r87s2`; put right on `r87-s2fixd`)

| Finding | Done |
|---|---|
| WFO's row of the page's name and authors under another IPNI id not found (B1) | Found and said; of several, the one carrying Kew's id or spelt as the page; other authors only, not decided |
| A Kew synonym spelt as another page's accepted name took that plant's CITES listing (S1) | Read for no listing, and said |
| ChromoDB's records under the page's IPNI id named otherwise taken (S3, M3) | Not decided; the author rule said as it is |
| A file there but not read whole read as none (S5); the CITES check's md5 in capitals refused (S6); a risk row with no figures (M2) | "Not asked" with why, printed as "COULD NOT BE READ"; the md5 in either case; a row of no figures said as one |
| The printed USDA sum not the arithmetic of the figures shown (M1); the Köppen 70% line tested on rounded shares | Worked from the mean as shown, its °F exact and its zone that °F's; the line tested on unrounded shares and printed to the places that show its side |
| The typical cell chosen among stated-wild cells: research grade is "not marked captive", not "marked wild", so the rule chose by what no source states, and it did not move Xeronema's spot (S4) | Taken out, with its flag, tally and plan lines (the owner's decision, section 3); D2 held open |
| /about/how's sentences of the three lines' matching, the typical spot and the RHS edge (S7) | Said exactly, the RHS edge's exception at 15.0 °C among them |
| BHL's page taken for a journal Kew cites with other words, "Bot. Mag. (Tokyo)" (S2); a hybrid formula's words read as a parent (M4) | Taken only where the title is the one Kew abbreviates, word for word in order; "as stabilized hybrids derived from …" not a parent, "Q.muehlenbergii" read |
| browse.json carried a first-seen column nothing read | Dropped; the index keeps it |

### Stage 2, user-facing (`0e89cc6..r87s2`; put right on `r87-s2fixu`)

- A merge counted pinned views as the numbering scheme: counted and said as pinned views; /about/formats and /about/how
  say what an older version and a pin do.
- The stage-2 sections and the browse pages' text set in px: in rem, so they grow with the reader's text size.
- The browse pages' record low: in the reader's units, the pages sent with `Vary` as the species page is.
- At home's hours buttons: a 3:1 edge, their change said politely.
- Species+ linked while the CITES line says "not asked": left out until the page has a CITES status, and /about/how
  says so.
- A pinned view's region the scheme no longer holds: said by its code, on the pin and on the page, the rest of the view
  shown and not followed for changes.
- The older look's chips and tags outside the tracker (register links, sources, the year's months, the unit switch, a
  plant's number, You grow, notices, the browse tips, the map picker's opener), and the backup page, Today's lines,
  the about pages' headings, a page's provenance, the compare tray and the install line: in the round's look.
- Held by tests (r87s2u).

### Stage 3, the tracker (`9311e8b..r87final`; put right on `r87-s3fix`)

| Finding | Done |
|---|---|
| Labels: a number shared by two plants (B1) | Every code carries an identity tag |
| The repair of a number held twice, and items (S1) | Put right, items among it |
| Papers had no limit across the collection; the backup reader copied its entries (S2) | A collection-wide budget for papers; a backup reader that does not copy entries |
| The lock and stopping sync (S3) | Put right |
| Five minor findings (M1–M5) | Put right |

### The final merge (9 November)

The merged tree's sentences were read against it: "No page lists papers" now says species pages and published
papers, since a plant's page lists its own papers; the README's list of what a page sends names a pinned view's query
and the BCSS lookup the grower presses; SECURITY.md says the app lock is a screen, not encryption; NOTICE names the
vendored typefaces and their licence; /about/formats no longer says browse.json carries the first-seen day; /about/how
says the stage-2 fixes' matching.

## 3. Decisions

- **The owner's:**
  - The look as mocked (7 November: desktop, phone and dark), and its type (8 November): Source Sans 3, Source Serif 4
    and Source Code Pro, all SIL OFL 1.1, in place of Public Sans, Newsreader and DM Mono, which read as an AI template.
  - Option A for the front page's first screen: the lead figure, then the catalogue. On a phone, four tabs: Reference,
    My plants, Today and More.
  - On a phone, one line of what this is under the headline ("48,375 plant species, named as Kew names them, …").
  - The new `changed` day the walk gives a page is kept, on every page: the new figures are what a page shows.
  - The stated-wild rule for the typical cell is reverted (stage 2, S4). Xeronema's spot (D2) stays held open.
  - Potting up keeps each plant its own accession, linked to its batch; a batch is not split into items.
  - Every page's CITES line says "not asked" until the owner has checked the transcribed table against the edition in
    force (section 5, step 3).
  - The footer says "Built with Claude; no text about a species is written by it."
- **GBIF's move** (COLXR-87, section 3): name the backbone wherever a request would take GBIF's default; keep the
  download on the backbone's keys while GBIF serves them; do not move during this round's walk.
- **Licences** (docs/about-87/sources.md): IUCN's categories are not shown (CC BY-NC-SA), only whether the Red List has
  assessed a species, linked by the page's Wikidata id; the CITES Checklist and Species+ are not used (their terms
  forbid redistribution), only linked; CCDB states no licence and is not used; ChromoDB 2.0 is withdrawn by its authors
  and not used.
- **/changes:** the round's lines carry their stage, and only a live stage's lines are listed (`R87_LIVE_STAGE` in
  `src/lib/changes/rounds.ts`, now 1), so neither /changes nor the front page's "Changed lately" says a change a reader
  cannot yet see.

## 4. Left for a later round

- Review D's D8 (open sea inside a mainland region's box): unchanged; every test by drawn land also drops real islands
  the drawing lacks.
- D2 (Xeronema's typical spot): held open.
- The Walter–Lieth chart: a reading only; drawing it is a second chart on one shared scale.
- The collection encrypted on the device with a passcode-derived key: proposed in docs/about-87/t3.md, not built.
- The link-preview image (og.png) is still drawn in the old faces (`scripts/dev/og.mjs`).
- The old `@fontsource` packages are still in package.json.
- The BCSS lookup's `FieldNo=` parameter: not proved, since the host answers a script with a browser check; the owner
  confirms it (section 5, step 7).
- Morocco's and Kiribati's state codes, and in all 238 ISO subdivisions not matched to a Natural Earth province: not
  read; /about/how says so.
- Splitting a batch into items: not built, since potting up keeps each plant its own accession (section 3).
- The GBIF derived dataset's DOI: registered by the owner once `--list-derived` has run (section 5, step 6); until
  then /about/data says nothing of one.
- The flowering and BHL fills: about 11 and 10 days within their daily allowances; until a page is read, its lines say
  "not asked".
- The move to the Catalogue of Life: the key map, the dry-run count, the model, a trial build and the owner's decision
  (COLXR-87, section 5), before mid-2027 by GBIF's one estimate.

## 5. The owner's steps, in order

1. **Stage 1** (in progress, 9 November): `node scripts\predeploy.mjs`; commit when it says to deploy (do not deploy
   yet). Then `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r87s1.txt`: `--index`, a review stop ("index: N
   species", then "browse.json written with N species, browse-counts.json written (grown by someone: M species)", N the
   same in both; then `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r87s1.txt --go-on`), the upload and the
   live check. Then `npm run deploy`.
2. **Stage 2's code**: `node scripts\predeploy.mjs`; commit when it says to deploy; `npm run deploy`. Until the walk
   (step 4), the new sections say "Not worked out for this page yet" or "not asked", never "none".
3. **The downloads and the CITES check** (docs/STAGE2-OWNER-87.md, steps 1 to 4), each file's md5 by
   `Get-FileHash -Algorithm MD5 <file>`:
   - `bulk\Angiosperm_extinction_risk_predictions_v1.csv` (55,277,287 bytes, md5 `e6fbee92fe19b783345cda27fc18eddc`);
   - `bulk\IOPB_IAPT_records_v3_1.csv` (5,924,887 bytes, `e5ad7aae7d1ab864d92d7e8ca5b904bd`) and
     `bulk\IOPB_IAPT_biblio_v3_1.csv` (629,998 bytes, `462c7f9b934fa80bd055b741582da51a`);
   - `bulk\wfo_backbone_2026-06.zip` (121,660,019 bytes, `0e4486945cd9f7af548ca87eb9a870ed`), not unzipped;
   - CITES: read the edition in force on cites.org against `src\lib\dossier\cites-appendices.tsv` row by row, set its
     `# checked:` line to the day and the PDF's md5, and commit. Done after step 4, it is applied by
     `npm run dossier -- --fill sources --bulk bulk`, `npm run dossier -- --index`, then
     `node scripts\corpus-step.mjs --plan scripts\corpus-plan-upload.txt`.
4. **The walk**: `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r87s2.txt`: the backup,
   `--list-summaries-left`, the dry run and its review stop, the walk and its review stop, `--list-offline`, the online
   `--keys` build (rebuild-offline.txt, rebuild-summaries-left.txt, scripts/rebuild-r87.txt), `--fill kew-published`
   and `--fill sources` and their review stop, `--fill summaries` and `--fill elsewhere` and theirs, `--index` and its
   (then by hand `npx tsx scripts/dev/r87-older-kinds.ts static\s\v3 older-kinds-other.txt`, its line pasted into the
   round's notes), `--check-summaries`, `--check-ranges` and `--list-derived` and theirs, the upload and the live check.
   Each stop says what to read and when to stop; when it is as expected,
   `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r87s2.txt --go-on`. If `--check-ranges` lists pages:
   `npm run dossier -- --keys check-ranges.txt --grid climate --bulk bulk`, `npm run dossier -- --index`,
   `npm run dossier -- --check-ranges`, then `--go-on`.
5. **Once a day**: `node scripts\corpus-step.mjs --plan scripts\corpus-plan-r87-daily.txt` (`--fill flowering`, about
   11 days; `--fill bhl`, 10 days at the least; then the index, the upload and the live check). On a day it stops at
   `--fill flowering`, also type `npm run dossier -- --fill bhl` once, after it has stopped.
6. **The GBIF derived dataset**: register it at https://www.gbif.org/derived-dataset with `derived-dataset.csv`
   (written by step 4's `--list-derived`), and set `GBIF_DERIVED_DOI` in `src\routes\about\data\reference.ts` to its
   DOI (`10.15468/…`), so /about/data cites it from the next deploy.
7. **Stage 3's code, last and alone**: its code sets `R87_LIVE_STAGE` in `src\lib\changes\rounds.ts` to 3, so /changes
   lists the round's stage-2 and stage-3 lines; then `node scripts\predeploy.mjs`; commit when it says to deploy;
   `npm run deploy`. Then docs/STAGE3-OWNER-87.md: read what changes for your own collection; press the BCSS link once
   for a number you know (SB 829) and check the address reads `https://fieldnos.bcss.org.uk/fieldno.php?FieldNo=SB%20829`
   and opens its entry, else pass the address its own search gives to the next round; know the app lock's way back (the
   sync key or a backup file of the collection); and know what a device still on round 86 shows of the new records.


## The stage 3 fixes, by commit

7f8830e and 6e120e8 (B1 labels with the identity tag, S1 items in the number repair, restore and import, M2, M3, M4), 88b1afd (S2 the backup reader's views, the vault's 64 MB for the log, the papers' 300 MB; S3 the lock and stopping sync; M5 tries kept, the locked title, PBKDF2 at 600,000), ea32c95 (the tag in $core/tag; about pages), 880370b (the owner's notes), 6eb37de (two tests follow the tag). Log format: no new kind and no new field; an item repair writes `acc` and `item` together, a holder's items move with it, the next edit may clear a stale `deacc*` and add an `idHistory` line; labels carry `#i=<tag>`; device storage `cultifolio.lock` may hold `key`, and `cultifolio.lock.tries` is new; FOLD_RULES 8, the fold hash re-recorded (pushBatch only).
