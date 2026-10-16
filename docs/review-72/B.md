# Round 72, fixes by B: ranges, records, climate

Branch `r72` in `/tmp/claude-0/rev72/B/`, one commit on `r72base` (4861445). The diff is `/tmp/claude-0/rev72/B-fix.diff`.

New code:
- `src/lib/dossier/range-via.ts`, a new module (mine, and pure, so the page imports it).
- `tests/unit/r72b-ranges.test.ts`, 21 cases.

Five older tests are updated for the decided changes: `bulk`, `r68b-range-photos-search`, `r70b-kew-author`, `r71b-homonym-key`, `r71b-kew-family`.

On `r72base` the new file fails whole, because `range-via.ts` is not there. With only that module copied onto the base, 20 of the 21 cases fail; the one that passes is the pure B2 settle case.

Checks:
- Full unit suite: 3,663 passed, 8 skipped, 1 failed. The failure was `r68b`, whose expectation I then updated; it passes (9 of 9).
- `tsc --noEmit -p .` and the scripts config show nothing new.
- `svelte-check --threshold error`: 0 errors.
- Strict Chromium, `r61w-pages` and `r62w-pages` (both open species pages): 15 passed.

As the triage asked, I reverted my trial edits in `authors.ts`, `ui/ref/head.ts` and `ui/ref/upstream.ts`.

## Done

**B1: the day of Kew's files, and of the download.**
- The loader exposes Kew's day:
  - `wcvpFileDay(dir)` in `scripts/bulk-load.ts` reads README_WCVP.xlsx's shared strings, with the same tar or unzip the occurrence reader uses. `wcvpExtractedDay` in `bulk.ts` reads "Extracted: 04/06/2026" as day first, giving 2026-06-04.
  - Without the README it falls back to the date of `wcvp_names.csv`.
  - `loadWcvp` sets `WcvpIndex.fileDay` and prints "Kew's files of 2026-06-04".
- The download's day: `downloadDay` reads the day GBIF made it from its key ("0006100-260916…" is 2026-09-16), else the `fetched` day. `OccIndex.day` puts it on every record served.
- The build:
  - The range source reads "WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04". "Via GBIF" now remains only on API-path ranges.
  - The `wcvp.distribution` row carries `asOf: 2026-06-04`.
  - The occurrence row reads "GBIF occurrence download https://doi.org/…, of 2026-09-16" and carries `asOf`.
- `Provenance.svelte` shows "as of D" for a row with `asOf` instead of "asked", and its footnote says so.
- Schema: `Upstream.asOf` (optional).

**B2: Kew's entry by another author, said only while the cited name differs (after A1).**
- `WcvpIndex.distributions` returns `rangeVia: { kind: 'kew-entry' }` where no row by the backbone's author leads to the entry.
- `settleVia` and `settleRange` turn it into `own`, and clear the record's clause, once the name the page cites (A's `name.authorship` with `name.cited`) is that entry.
- The build applies `settleRange` to the finished dossier, after A's citation is decided, and so does the fill.
- Without A's fill, 143 pages say it (Ixora coccinea: "Kew's entry Ixora coccinea L."). With it, the pages A re-cites drop to `own`. The test shows Ixora both ways.

**B3: `distribution.via`, shown beside the map.**
- The shape is the brief's `{ kind, entry, page? }`, plus `name`, `row` and `status` for the words, `unplaced`, and `file`.
- `page` is the reference key when the entry is another page's: set in the build from `o.reference`, and in the fill from the corpus' own names.
- `viaSource`, `viaDetail` and `synonymWords` give one set of words for the build and the fill.
- The species page's "Range source" row reads `rangeNote(d.distribution)`. A dossier without `via` falls back to the old sentence.
- Where the entry is another page, the row links it. The link is `slugify` of the entry's words, which the route resolves.
- Of the six pages showing another reference page's range, all six now carry `page`: Ceropegia melanops, Weingartia pulchra, Drosera parvula, Echeveria sessiliflora, Coryphantha macromeris, Copiapoa boliviana.
- Schema: `Distribution.via`.

**B4: the climate's reason.**
- `climate/provider.ts` now says "holds an in-range record placed to within 10 km".
- `climateReason` (in `range-via.ts`, since `ui/ref/upstream.ts` is F's) mends stored dossiers' old words.
- The species page (line 597) and the plant page (`plants/[acc]`, line 842) read it.

**B5: doubtful regions.**
- `rangeOf` serves Kew's `location_doubtful` rows as `establishmentMeans: 'DOUBTFUL'`.
- The build lists them in a new `distribution.doubtful`: never a range box, never native.
- The page shows "Doubtfully present in …, recorded by WCVP as doubtfully present: not part of the range records are tested against".
- A Kew entry whose only rows are doubtful is still "Kew holds X, with no native range", as before.
- Schema: `Distribution.doubtful`.

**B7: a name Kew spells otherwise.**
- This is `nearSpellings` in `WcvpIndex.ownRows`. It runs only where Kew holds no row of the page's words, no gender spelling applies and no single accepted entry stands, and it is held to all of these:
  - one epithet in the genus, of six or more letters, within two letters' edit;
  - its row's author is the page's by `ownByAuthor`;
  - the basionym's author is the same;
  - all its rows lead to one entry;
  - the reference holds no species of that spelling (`setReference`, passed by every Kew-reading step).
- The basionym condition came from the dry run. Without it, Bisnaga hamatacantha (Muehlenpf.) Orcutt took Kew's Bisnaga haematacantha (Monv. ex Salm-Dyck) Orcutt, another plant by the same combining author. A guard test pins it.
- On the corpus this gives the three triaged pages plus one:
  - Reicheocactus famatimensis: Argentina Northwest.
  - Weingartia fidaiana: Bolivia.
  - Melocactus lemairei: Dominican Republic and Haiti.
  - The fourth, Ceropegia hadramautica: Kew's Ceropegia hadhramautica (Lavranos) Bruyns, filed under Huernia hadhramautica, which is in GBIF's own synonym list for the page.
- All four are listed for `--keys`.
- The same rule now reads two pages that went by older names, with the same entry and the same range: Tylecodon cacaliodes and Aeonium tabulaeforme. `r68b` is updated for this.

**B8: three single pages.**
- Delphinium × cultorum: Kew's "Artificial Hybrid" entries are now entries (`hybrids`, `entryOf`). The page reads "Kew holds Delphinium × barlowii Lindl., an artificial hybrid, with no native range", where it said "no WCVP entry for this name". Listed for `--keys`.
- Agave calodonta: a row with no level-3 area names its level-2 region ("Mexico"). The fill writes the name on the stored page.
- Aphelandra squarrosa: `via.unplaced`. The source reads "Kew holds Aphelandra squarrosa Nees as unplaced", with a note beside the map.

**B9 with D4: `--list-rebuild` compares the page with the rule.**
- `kewRebuildList` no longer compares round 69's rule with today's. It lists a page in three cases:
  - its stored native range is not the one Kew's files give, by its name or, failing that, by its stored older names (`olderNameOf`);
  - its range is a national checklist's, or none, where Kew's files hold the name;
  - it is a homonym key no build has read.
- A homonym key counts as read in any of these cases:
  - it carries `name.cited`;
  - its record says "homonym key checked: …", which `kewName` now writes when it leaves the key as it is;
  - it is a Kew-cited record;
  - its `gbif.species` row was asked on or after 2026-10-15, round 71's corpus step, which ran the rule on these keys.
- `rebuildList` without Kew's files lists "under an older name" only for round 68's wording ("under the name"). It lists "50 synonyms" only for a page built before GBIF's synonyms were paged (2026-10-12).

**B10: one stray record.**
- `outsideOnly` replaces the page's call of `noneInRange`. One record outside says so, muted, with no "the range and the records disagree"; two or more say it as before.
- The run log (`outsideLog`) now names every page whose records all lie outside: one or more where the range was tested, no longer only 20 or more.

**A's "another name" wording in `bulk.ts`.** My trial wording is kept, as A asked: "another name" only of rows `plainlyAnother`, and "Kew cites X otherwise (…)" of the rest. `authors.ts` is A's; A has taken the no-one-outside-the-brackets case and the Peckover guard, so there is no need from me.

**`--fill range-source` writes all of it to stored pages**, offline: `via` and the source from it, settled against the cited name; the record's words; doubtful regions; region names; and `asOf` on both rows. The occurrence rows are dated only where their DOI is `bulk/download.json`'s. A page whose stored native range is not Kew's now is left and listed.

## Needs

**For A (`sources/gbif.ts`, yours).** Please take this hunk exactly; it is in my diff only so the tree runs:
- `import type { RangeVia } from '../range-via';`
- `DistributionAnswer` gains `rangeVia?: RangeVia; kewFile?: string;`.
- `distributions()` types them on the fetcher's answer and passes them on: `const syn = { ...(synonymOf), ...(rangeVia), ...(kewFile) }`.
- `GbifOccurrence` gains `downloadDay?: string`.

Without it the build loses `via`, the file day and the download day. `noneInRange` in `ui/ref/head.ts` is no longer called by the page and can go. My `settleVia` reads `name.authorship` against Kew's entry, so it needs your build to set `name.authorship` to Kew's citation before the dossier is assembled, as your diff does.

**For D (the one command).**
1. Run `--fill kew-names` (A) before `--fill range-source`. Range-source settles Kew-entry notes against the cited name, and a later run settles them anyway.
2. Run `--list-rebuild --bulk bulk` after the fills. Its five keys go to `--keys … --grid climate --bulk bulk`.
3. Each of these steps peaks at about 3.1 GB of memory.
4. The fills now print "Kew's files of D" first. A stop could check it against the expected day.

**For F, the page.** The range note's link uses `slugify(via.name)`. If you prefer the index's slug for `via.page`, the page has the key.

**For F, `/about/how`.** Each item is checked against my code.
1. After "The native range comes from the <b>World Checklist of Vascular Plants</b> at Kew, read from Kew's files", insert: "of the day the page states (the "Extracted" day of Kew's README, 4 June 2026 for this corpus; the record of the page's sources says "as of" that day, not the day the page was built)".
2. Replace "Regions where WCVP records the plant as extinct are shown labelled as such and are never part of the range records are tested against." with: "Regions where WCVP records the plant as extinct, or as doubtfully present, are shown labelled as such and are never part of the range records are tested against."
3. Replace "and where every record lies outside the range it says the range and the records disagree." with: "and where every record lies outside the range it says so, and, where two or more do, that the range and the records disagree."
4. Replace "(Kew files GBIF's Bisnaga glaucescens as Ferocactus glaucescens, and spells Aeonium tabulaeforme tabuliforme)" with "(Kew files GBIF's Bisnaga glaucescens as Ferocactus glaucescens)".
5. After "An epithet Kew spells in another gender is read so, by the same author (GBIF's Cyphostemma congoensis is Kew's Cyphostemma congoense).", add: "So is an epithet Kew spells otherwise by at most two letters, where Kew holds no row of the page's own spelling, the author and the basionym's author are the same, only one such spelling is in the genus, and the reference has no page of it (GBIF's Reicheocactus famatimensis is Kew's Reicheocactus famatinensis, and its Aeonium tabulaeforme Kew's tabuliforme; Bisnaga hamatacantha (Muehlenpf.) is not Kew's Bisnaga haematacantha (Monv. ex Salm-Dyck)). Where the range is Kew's entry of the name by another author than the page cites, the page says so beside the map; a name Kew holds as unplaced, or under an artificial hybrid, is said as that; and where Kew gives only a broad region, the region is named and records are not tested against it."
6. In "Where the species' own row is one Kew holds as a synonym of another entry, the range is that entry's, and the page says so", replace "the page says so" with "the page says so beside the map, with a link where that entry is another page here".
7. Replace "Three land cells are the minimum; fewer, and the page says so and derives nothing." with: "Three land cells holding in-range records placed to within 10 km are the minimum; fewer, and the page says so and derives nothing."
8. Where the records' source is described, add: "The records are as GBIF held them on the day it made the download, which the page states."

**For F, `/about/formats`.** If it lists the dossier's fields, add:
- `distribution.via`: where the range comes from: own, older name, synonym of, Kew's entry, spelling; the entry; the reference key when the entry is another page; the day of Kew's files.
- `distribution.doubtful`.
- `asOf` on a source row: the day of the file it was read from.

## The corpus step (my part)

1. **`npx tsx scripts/build-dossiers.ts --fill range-source --bulk bulk`**, after A's `--fill kew-names`.
   - Offline. It reads `bulk/wcvp_names.csv`, `wcvp_distribution.csv`, `README_WCVP.xlsx` and `download.json`, and the dossiers. It writes the dossiers, then the index.
   - On a fresh copy of the live corpus (`/tmp/claude-0/rev72/B-s3`, logs `B-work/f72-rs1.out` and `f72-rs2.out`) it printed: "Kew's files of 2026-06-04: 8939 dossiers written. 8934 ranges now say where they come from; 53 list regions Kew records as doubtfully present; 1 regions named; 7593 record sets dated by their download."
   - The `via` counts:

     | Kind | Pages |
     |---|---|
     | own (one of them unplaced) | 8,278 |
     | synonym-of | 477 (six with a page) |
     | kew-entry | 143 (fewer after A's fill) |
     | spelling | 26 |
     | older-name | 10 |
     | no `via` | 13 (the national-checklist, "not available", API-only and unresolved pages) |

   - The second run printed "0 dossiers written". The md5 of every file was unchanged, and the corpus id stayed bf0b25562c83450f.
   - All 8,947 filled dossiers parse with the app's schema.
   - It fails safe in three ways:
     - Without `--bulk` or Kew's files it exits 2, having written nothing.
     - A page whose stored range is not Kew's is listed, not changed.
     - It asks no source, so a rerun after an interruption completes it.
   - Before and after, in full in `B-work/f72-examples.txt`:
     - Ceropegia melanops: "WCVP (Govaerts, RBG Kew): Kew holds … as a synonym of Ceropegia nigra N.E.Br.; the range is Ceropegia nigra's" becomes the same with "Kew's files of 2026-06-04", plus `via {synonym-of, page 3574112}`.
     - Ixora coccinea (without A): "via GBIF" becomes "…, Kew's files of 2026-06-04: Kew's entry Ixora coccinea L.". The records' row becomes "…, of 2026-09-16" with `asOf`.
     - Dipcadi viride: `doubtful: [Angola]`.
     - Agave calodonta: the native region named "" becomes "Mexico".
     - Aphelandra squarrosa: "Kew holds Aphelandra squarrosa Nees as unplaced".
2. **`npx tsx scripts/build-dossiers.ts --list-rebuild --bulk bulk`**.
   - On the live copy it now lists 5 pages (`B-work/f72-lr1.keys.txt`), where it listed 55 before: Reicheocactus famatimensis, Melocactus lemairei, Weingartia fidaiana, Ceropegia hadramautica and Delphinium cultorum. Every one of them changes on a rebuild.
   - After the fill it lists the same five, and none after their rebuild by the rule. That last part was not run here, since `occurrence.zip` and `climate/` are not in this workspace.
3. **`--keys rebuild-keys.txt --grid climate --bulk bulk`** for those five, then `--index`.

## Measured

- Each fill or list run: 79 to 95 s on this shared machine, peak 3.0 to 3.2 GB resident.
- The near-spelling rule's reach over the corpus:
  - four pages gain a range;
  - two change path (from older names to spelling) with the same range;
  - none take another plant once the basionym condition holds.

## Not done or departed from

- No new browser spec. The page changes are a row's condition, a new row, two function calls and Provenance's label. They are pinned by unit tests reading the files, and the two species-page specs pass. A spec that shows "Doubtfully present in" would need a fixture dossier changed under other specs.
- `via.page` links by `slugify(name)`, not by the index's slug (see Needs).
- The `via` shape adds `name`, `row`, `status`, `unplaced` and `file` to the brief's `{kind, entry, page?}`. All are optional.
- The homonym-key "read" test accepts a `gbif.species` row asked on or after 2026-10-15 as read, so the 13 keys round 71's corpus step already read are not rebuilt for a record alone.
- Pages now say "Kew's files of 2026-06-04" wherever the stored range equals that file's. That includes a few built through GBIF's API path, such as Ceropegia melanops, whose range is identical to the file's.
