# Round 72, fixes by A: names, authors, identifiers

Branch `r72` in `/tmp/claude-0/rev72/A/`, two commits on `r72base` (6170861 and the one after it). Tests: `tests/unit/r72a-names.test.ts` (the Kew fill, 16 cases) and `tests/unit/r72a-links.test.ts` (links, authors, the page note, the spelling pin, 16 cases), plus two existing files updated. Run on a worktree of `r72base` (`/tmp/claude-0/rev72/A-base`), `r72a-links` fails 7 cases and passes 9 (the seven spelling pins, which are pins, and two guards); `r72a-names` fails whole, since `kew-names.ts` does not exist there.

## Done

**The Kew fill, `--fill kew-names --bulk <dir>` (A1, A2, A5, A8; takes in the trial `kew-author` fill).** New module `src/lib/dossier/kew-names.ts` (pure) and loader `scripts/kew-names-load.ts` (node). The loader streams `wcvp_names.csv` three times so the file is never held in memory: first the rows of the pages' names, older names, binomial common names and linked numbers; then the entries those rows are filed under, with their parents and the varieties and subspecies Kew accepts under them; then every row filed under any of those. `fillKewNames` then writes, for every dossier:

- `name.kew` to the brief's shape. `entry` is the accepted entry of Kew's row for the number the page links, else the entry the name and author read to by `ownByAuthor`, else ''. `synonyms` holds Kew's other names for the plant, species rank only, misapplied names never, in words only. Those are the names filed under the entry, under its accepted varieties and subspecies, and under its species where the entry is below species (Fragaria virginiana Duchesne is filed under subsp. virginiana). The entry's own name is included where it is other words than the page's (Ferocactus glaucescens on Bisnaga glaucescens). `acceptedElsewhere` holds the stored older names (as in `name.synonyms`, author included) whose words and author are a species Kew accepts outside that plant. `file` is the day of Kew's file.
- `name.cited` and `name.authorship` (A1). Where Kew's row for the linked number is the page's own words by another citation, the page cites Kew's (`kewCitation`). `cited` keeps the backbone's citation and Kew's `plant_name_id`, and the record says "GBIF's key K is X A; the page links Kew's X B, and the name is cited as Kew cites it". A homonym key cited by round 71's `kewName` gets its `cited` from its record.
- Common names that are a binomial Kew or the reference holds are dropped, and the vernacular record says which (A8).
- Ceropegia macrocarpa's record (A5): where the links are none and Kew holds the words only by a plainly other author, the Wikidata row says "Kew holds this name only under another author (Ceropegia macrocarpa J.N.Haage & E.Schmidt); no POWO link". `gbif.kewLinksNote` now writes these words for the build and `--fill kew-links` too.

A `--keys` build given `--bulk` runs the same fill over the dossiers it built before writing the index (`fillKewNamesStep(keys, false)` at the end of the build in `build-dossiers.ts`). A re-derivation carries `name.kew` and `name.cited`. The schema (`NameBlock` in `schema.ts`) keeps both fields; without that, `parseDossier` drops them. That is a small hunk in a file the triage gives no one this round.

**The build cites the name it links (A1).** In `build.ts`, Kew's row for the linked number (`kewIpni` now returns `labels` and `plantIds`, the WCVP `taxonID` of GBIF's copy) is cited when it is the page's words by another citation, with `name.cited`. This is tested through the round 71 homonym-key world in `r71b-homonym-key.test.ts`. That file's round 71 guard ("keeps the backbone's author", Diospyros kaki) is now inverted: the non-orphan key borrows nothing but cites the linked name, with `name.cited` `{ gbif: 'Kük.', kew: '42' }`.

**Kew's number without an item number (A3).** The build asks Kew whenever Wikidata answered with no number or no item, and links Kew's number. The same test world shows it, since its item carries no POWO: `ids.powo` is now 1-1, where r72base had none. `fillKewLinks` no longer skips a dossier with no number (`r72a-links`: "--fill kew-links reads a dossier whose item gave no IPNI or POWO").

**IPNI never a "-4" number (A6).** `kewLinks` treats Kew's own "-4" numbers as POWO addresses only (`WCVP_ONLY`). Echinocereus marksianus keeps its item's IPNI 87937-2.

**A4 with B6, in `authors.ts`.**
- `ownByAuthor` has a fifth reading: the basionym's author either side of an "ex" inside one citation's brackets and not the other's. This makes Cochemiea matehualensis "(Backeb. ex Spine)" Kew's "(Backeb.) M.H.J.van der Meer", so its range row, its POWO link and its record agree. Over the whole corpus it changes the rows taken for two species only (Cochemiea matehualensis, and Gymnocalycium hossei, whose link was already Kew's).
- B's case is taken into `plainlyAnother`: a citation with no one outside its brackets compares the basionym's people, and B's Peckover guard is tested ("(Peckover)" stays plainly another than "Peckover").
- My `bulk.ts` wording is reverted from my tree. B's diff has its own form of it (see Needs).

**The page note (F13 with A).** `kewCitedNote(upstream, name)` in `ui/ref/head.ts` reads `name.cited` first ("GBIF's backbone cites this name as Ixora coccinea Comm. ex Lam.; the page cites it as Kew's World Checklist cites the entry it links."), and the old record sentence only without it. One argument is added at the call in `+page.svelte` (line 404, one hunk).

**The spellingKey pin.** `r72a-links`: the seven joins across all of Kew (lancea/lanceum, itacolomiensis/-e, bectauatensis/-e, aequatorialis/equatorialis, coelestis/caelestis, lacer/lacerus, aemulans/emulans) are pinned. The key is unchanged.

**For C, the reader.** `kewSynonyms(name)` in `$dossier/kew-names` returns `string[]` or `undefined`, and `undefined` means not read, never none. `kewAcceptedElsewhere(name)` is the same for F. The module imports only `authors.ts`, so a photograph rule can import it without loading the builder.

## Needs

- **B (bulk.ts):** the triage gives you my "another name" wording. Your diff already writes it, as "Kew holds X only under another author (…), which is another name" only where `plainlyAnother`, and the shared-author case otherwise. Please keep it. With my reading 5, Cochemiea matehualensis no longer reaches that branch at all.
- **B (merge note):** your diff edits `sources/gbif.ts` (`kewEntryWords`, `kewEntry` on `DistributionAnswer`) and `ui/ref/head.ts` (`rangeSourceNote`), both mine now. My hunks there are elsewhere in each file, but your `head.ts` hunk's context includes the old `kewCitedNote` body, which I changed: apply `rangeSourceNote` after my `kewCitedNote` by hand. Your `kewEntryWords` says "the name is cited <authorship>"; after A1 that is Kew's citation on 697 pages, so it fires only where the cited name and Kew's entry still differ, as the triage says for B2.
- **C:** read `kewSynonyms(d.name)` for `ownNames` and the iNaturalist filter. It is a list of binomials, species rank, Kew's spelling with any hybrid sign ("Parodia × erubescens"); compare with `words()` from the same module.
- **F, page:** list `kewAcceptedElsewhere(d.name)` apart from the older names, as "Kew accepts as a species of its own" (278 pages after the fill; absent before it). On those pages the "Also known as" list should not show those names without the label.
- **F, /about/how**, each checked against the code:
  1. Replace "where the backbone's key is a usage with no synonyms whose author is plainly not that of the one entry Kew accepts by the name, and GBIF holds the name by Kew's author under another key (GBIF's "Rubus parviflorus Kük." for the thimbleberry, Rubus parviflorus Nutt.), the name is cited with Kew's author, and the synonyms and common names …" with: "the name is cited as Kew's World Checklist cites the entry whose number the page links, wherever that entry is the page's own name by another citation (GBIF cites Ixora coccinea "Comm. ex Lam."; the page links and cites Kew's Ixora coccinea L.), and the page says so under the name; where, besides, the backbone's key is a usage with no synonyms and GBIF holds the name by Kew's author under another key (GBIF's "Rubus parviflorus Kük." for the thimbleberry, Rubus parviflorus Nutt.), the synonyms and common names …" (the rest as it is).
  2. After "then, where both cite one, the basionym's author ("(Engelm.) Lem." and "(Engelm.) Britton &amp; Rose" are one name)", add: ", with or without an author before "ex" inside the brackets ("(Backeb. ex Spine)" and "(Backeb.)")".
  3. Replace "the IPNI and POWO links are Kew's number for the name and author wherever Kew holds one, and an item's number Kew holds for another author's name is never linked" with: "the IPNI and POWO links are Kew's number for the name and author wherever Kew holds one, whether or not the Wikidata item gives a number, and an item's number Kew holds for another author's name is never linked; a number Kew gives a name IPNI does not hold (one ending "-4") links POWO only, and where Kew holds the name only under another author the page says so and links no POWO page".
  4. In the common names passage, add: "A common name that is a scientific name the reference or Kew's World Checklist holds ("Babiana odorata" for Babiana villosula) is not shown, and the record says so."
  5. New: "Kew's own names for each page's plant (its accepted entry, the names Kew files under it, and those of the older names GBIF gives that Kew accepts as species of their own) are read from Kew's files, of the day the page states."

## The corpus step

Offline; it reads `bulk/wcvp_names.csv` and the dossiers on disk, and writes the dossiers and the index. Run it after `--fill kew-links` (which takes Cochemiea matehualensis's POWO link back and links the pages with no number):

    npx tsx scripts/build-dossiers.ts --fill kew-names --bulk bulk

The run prints "Reading Kew's names for 8947 dossiers…", then "8947 dossiers read, 8947 changed: 697 cite Kew's author, 278 list older names Kew accepts as species of their own, 31 common names dropped as scientific names", one line per page changed in substance, and then the index. A second run prints "0 changed". Without `--bulk`, or with no `wcvp_names.csv`, it says so and exits 2 having written nothing. A dossier it cannot read is passed by. It asks no source, so an interruption is undone by running it again. A `--keys … --bulk bulk` build runs it for the keys it built. D's one command should run it after `kew-links` and before `--index`.

## Measured

Dry run on a fresh copy of the live corpus (`/tmp/claude-0/rev72/A-s2`, logs `run1.log` and `run2.log`): 68 seconds and under 3 GB of heap; 8,947 dossiers written (every one gains `name.kew`). Of those, 683 change their citation and 14 homonym keys gain `name.cited`; 278 have older names Kew accepts apart; 31 common names are dropped on 30 pages; Ceropegia macrocarpa's record changes. The second run changed 0. Examples, before and after:

- Ixora coccinea: authorship "Comm. ex Lam." becomes "L."; `cited` {gbif "Comm. ex Lam.", kew 103356}; `kew.entry` 103356 with 23 synonyms.
- Allium ampeloprasum: `kew.entry` 294972, with `acceptedElsewhere` [Allium leucanthum K.Koch, Allium polyanthum Schult. & Schult.f., Allium porrum L.].
- Babiana villosula: four common names become three ("Babiana odorata" dropped, recorded).
- Ceropegia macrocarpa: `kew.entry` ''; the Wikidata row says "Kew holds this name only under another author (…); no POWO link".
- Bisnaga glaucescens: `kew.entry` 2808156 (Ferocactus glaucescens), synonyms including Ferocactus and Echinocactus glaucescens.

Two of the 31 dropped common names are Spanish vernaculars that happen to be binomials Kew holds ("Rosa mexicana" on Salvia involucrata, "Cactus rosa" on Pereskia grandifolia). The rule as decided drops them. If the owner wants them kept, restrict the rule to binomials Kew holds in the page's family.

Checks: `tsc --noEmit -p .` and `-p tsconfig.scripts.json` show nothing new; `svelte-check --threshold error` gives 0 errors. Full unit suite (`A-work/full-unit-fix.log`): 3,674 passed, 8 skipped, 1 failed; the failure, `r69x-keep.test.ts` (the device's keep form, untouched), passes alone (8 of 8) and passed in my earlier full run, so it is the shared machine's timing.

## Not done or departed from

- The `--keys` build writes `name.kew` by running the offline fill after it, not inside `buildDossier`. The bulk loader loads only the names it needs, so the build has no Kew synonymy of entries. With `--upload` per dossier, the uploaded copy is the one before the fill; the corpus step uploads after `--index` anyway.
- `name.kew.file` is the modification day of `wcvp_names.csv` (2026-06-04), not B's README day; the merge should use B's loader helper when it lands (the same file, the same day).
- The homonym keys and the two pages for one plant are left for the owner, as triaged. A9 is later.
- No browser run: the only markup change is one argument to an existing call, and svelte-check is clean.
