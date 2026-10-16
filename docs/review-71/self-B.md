# Round 72 self-review, B: native ranges, records, centroid and climate

Working copy `/tmp/claude-0/rev72/B` (branch `r72`, trial fix applied); a clean worktree of `r72base` at `/tmp/claude-0/rev72/B-base` for the runs. Evidence and scripts are in `/tmp/claude-0/rev72/B-work/`. Trial fix: `/tmp/claude-0/rev72/B-fix.diff` (9 source files, one new test file `tests/unit/r72b-ranges.test.ts`, 10 tests: 9 fail on `r72base`, 1 is a guard). With the fix, the whole unit suite passes (3,652 passed, 8 skipped), and `tsc` and `svelte-check` are clean. I ran no browser spec.

How the audit was done. `extract.py` reads all 8,947 dossiers into `corpus.json`. `kewload.py` reads Kew's two files on its own terms, following the README: the rows under every dossier name and synonym binomial, every Accepted row, and their distribution rows. `derive.py` and `derive2.py` re-derive each range from scratch. They find the row of the name by the backbone's author (whole citation, then publishing author, then surnames), or else the one Accepted species row of the words. They take that row's `accepted_plant_name_id`. Native means introduced=0, extinct=0 and location_doubtful=0; introduced means introduced=1 and not doubtful. Spellings, older names and Unplaced rows are handled in a second pass. None of this was taken from `bulk.ts`.

## Findings

**1. About 8,450 pages say their range came "via GBIF" and was "asked" on the build day. It was read from Kew's file of 4 June 2026 (confirmed).**
- `build.ts:153` `rangeSource` writes "WCVP (Govaerts, RBG Kew) via GBIF" whichever path built the page. The bulk path reads Kew's own `wcvp_names.csv` (Version 16, extracted 04/06/2026).
- All 8,447 such pages match Kew's June file exactly (task 1). `/about/how` says the range is "read from Kew's files", so the page contradicts the about page.
- `Provenance.svelte:19` shows "asked 2026-10-09" (or another October day) on every `wcvp.distribution` row, under the footnote "the figures are as the source held them that day". Neither the June file nor its version is named anywhere.
- The same goes for 7,593 `gbif.occurrences` rows: they show "asked" on a re-derivation day, but the records come from the download of 19 September (`bulk/download.json`). The DOI is named; its date is not.
- Fix: the bulk loader passes the file's version (README "Extracted", or `download.json` `fetched`). The build writes "WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04" and puts that day in the row's detail. Provenance shows "as of" that day instead of "asked". Not in the diff.

**2. 143 pages show the range of Kew's entry by an author other than the one they cite, and do not say so (confirmed).** My stricter reading counts 303 (`B-work/other-author-ranges.txt`). The 143 come from the project's own author rule (`B-work/fix-rs1-changed.txt`).
- `bulk.ts:281` returns the range without a note when the entry's words are the species' own. That holds whether the entry was reached by the backbone's author or by a fallback: the "one entry Kew accepts" fallback, the family rule or the species rule.
- Ixora coccinea cites "Comm. ex Lam." and shows Kew's Ixora coccinea L. Fragaria virginiana cites "Duchesne" and shows Miller's species. In both, `wcvp.distribution` has no detail and the source reads "via GBIF".
- Several are true author differences, not just spellings:
  - Crassula corallina Thunb. shows Kew's L.f.
  - Ferocactus haematacanthus (Muehlenpf.) Britton & Rose shows Kew's (Monv. ex Salm-Dyck) Bravo ex Backeb. & F.M.Knuth.
  - Durio zibethinus Murray shows L.; Diospyros kaki L.f. shows Thunb.
  - Stephanotis floribunda Brongn. shows Jacques; Hedera algeriensis Hibberd shows Rantonnet ex C.Morren.
- Most of the rest are St.Hil. against A.St.-Hil. and the like.
- Fix (in the diff): `WcvpIndex.distributions` returns `kewEntry` when no own row by the backbone's author leads to the entry. The source then reads "WCVP (Govaerts, RBG Kew): Kew's entry Ixora coccinea L." and the record reads "the range is Kew's entry Ixora coccinea L.; the name is cited Comm. ex Lam.". `--fill range-source` writes it to stored pages, offline. On a copy of the live corpus it wrote 143 pages, and a second run wrote none.

**3. The 476 range-source notes are true, but the page shows them only in the folded "Where this page came from" (confirmed).** Six of them show another reference species' range with no visible word.
- `species/[slug]/+page.svelte:609` shows the "Range source" row only when the source matches /under the name |, reached by/, which means older names alone. The synonym wording added in round 71 never matches it.
- Ceropegia melanops shows Ceropegia nigra's 14 countries, captioned "Native range as published by WCVP", the same as C. nigra's own page.
- Fix (in the diff): `rangeSourceNote()` in `head.ts` gives the row and a note for older names, synonym rows ("Kew files this page's name under another entry, and the range shown is that entry's") and Kew-entry ranges. The page uses it.

**4. On 912 pages the climate reason says "only N distinct land cells of the climate grid hold an in-range record", which is false (confirmed).**
- `climate/provider.ts:178`. The envelope receives only the records placed to within 10 km.
- Pachypodium succulentum has 468 in-range records, 467 of them vague. The page says one cell holds an in-range record. The species page then contradicts itself with "467 of the 468 ... cannot place a climate cell". The plant page (`plants/[acc]/+page.svelte:842`) shows the false sentence alone.
- 912 of the 1,073 pages with this reason have vague records (`B-work/climate-wording.txt`).
- Fix (in the diff): the provider says "an in-range record placed to within 10 km". `climateDetail` mends stored dossiers at read time, and the species page reads it (line 597). The plant page still reads the raw detail.

**5. 53 pages drop regions Kew records as doubtfully present, and neither the page nor the about pages say so (confirmed).**
- `bulk.ts:264` filters out `location_doubtful` rows. For example, Dipcadi viride in Angola, Cistus creticus in Algeria and Libya, and Hoya carnosa in the East Himalaya.
- Leaving them out of the range is right, but rule 5 requires the rule to be stated.
- Fix: list them as extinct regions are listed ("Doubtfully present in"), and add one sentence to `/about/how`.

**6. Four pages say their own name is "another name", and one of them lost its POWO and IPNI links (confirmed; open issue 3).**
- `bulk.ts:649` writes "Kew holds X only under another author (...), which is another name" for every row `ownByAuthor` does not take. The link rule `plainlyAnother` reads three of these rows as the same name:
  - Hibiscus acetosella: "Welw. ex Ficalho" against Kew's "Welw. ex Hiern".
  - Monsonia mossamedensis: "Welw." against "Welw. ex Oliv.". Its range is then taken "reached by" that very row.
  - Echeveria peacockii: "Croucher" against "Croucher ex T.Moore & Mast.".
- The fourth is Cochemiea matehualensis. GBIF's authorship is "(Backeb. ex Spine)" with nothing outside the brackets ("Spine" is the journal Neolloydia matehualensis was published in). `plainlyAnother` (`authors.ts:123`) then finds no person outside the brackets, so every row is "plainly another". `kewIpni` counted Kew's 77320739-1 as a homonym's, and `kewLinks` dropped the item's correct POWO.
- Ranges are unaffected: the older-name path reached the same entries.
- Fix (in the diff), in two parts:
  - With no author outside the brackets, `plainlyAnother` compares the basionym's people, so "(Peckover)" stays another than "Peckover".
  - The record says "another name" only of rows that are plainly another, and "Kew cites X otherwise (...), and its row is not read as this species' own" of the rest.
- Cochemiea's stored ids are now empty, so `--fill kew-links` cannot restore them: rebuild 11641002.

**7. Three to five pages have no range although Kew holds the plant (confirmed facts; the rule is the owner's call).**
- Three names Kew holds under a spelling one letter different, by the same author:
  - Reicheocactus famatimensis (Speg.) Schlumpb., Kew's famatinensis (AGW).
  - Weingartia fidaiana (Backeb.) Werderm., Kew's fidana (BOL).
  - Melocactus lemairei, Kew's lemarii (DOM, HAI).
- Bisnaga hamatacantha (Muehlenpf.) Orcutt: GBIF lists no synonym, and Kew holds Ferocactus hamatacanthus by the basionym Echinocactus hamatacanthus Muehlenpf. The page has 674 records, all untested.
- Ceropegia hadramautica: Kew spells it hadhramautica. Its older names reach two entries because Huernia rubra is among them. The stored page, built 11 October, says "not available" where the rule now says "not taken".
- Rule 3 forbids guessing. A one-letter rule held to the same author and the same basionym, with no other row in the genus, would be unambiguous for the first three.

**8. Three single pages are wrong in small ways (confirmed).**
- Delphinium cultorum says "no WCVP entry for this name". Kew holds Delphinium × cultorum Voss as a synonym of D. × barlowii, whose status is "Artificial Hybrid" and which has no range. `byId` keeps only Accepted rows, so `rangeOf` returns null and the API path's checklists stand.
- Agave calodonta lists one native region with an empty name. Kew's only row (361445) is level 2 "Mexico" with no level-3 code, so `region.name` becomes `''`. The page then calls the range "country level only".
- Aphelandra squarrosa Nees shows the range Kew gives an Unplaced name and does not say the name is unplaced.

**9. `--list-rebuild` names 55 species, all rebuilt on 15 October and none stale, and it would name them again after every rebuild (confirmed; task 4).**
- 24 are named because round 69's rule differs from today's. My derivation shows every one already holds today's range.
- 12 are named for "range taken under an older name" and 6 for "50 synonyms stored". Both are lasting conditions, not staleness.
- 13 are named as "on a homonym key". These are mostly one person spelt two ways: Denham and Dehnh., Morr. and Morrison, Claverie and Clavaud, A.Fern. and Kew's "A.Fernald". A rebuild changes nothing for them.
- The stored-range check, the only one that finds staleness, finds none.
- Rebuilding them costs a `--keys` run each round (Nerine sarniensis took 612 s in report-71).
- Fix:
  - Drop the round-69 comparison, now that the stored-range check covers it.
  - Name "older name" and "50 synonyms" only for pages built before the rule's day.
  - Have the build record "homonym key checked" so the list skips it.

**10. The "range disagrees with every record" notice is right on all 64 pages that should show it and on no others (confirmed); two remarks.**
- The run log prints it only at 20 or more records outside (`build-dossiers.ts:1239`), so 49 of the 64 never appear in the owner's log.
- On 31 pages the "disagreement" is a single record. "The range and the records disagree" overstates one stray record. Say "the one record lies outside it" without the verdict.

**11. Process (confirmed).**
- In a fresh clone, `npm run dossier` fails with `ERR_MODULE_NOT_FOUND '$core'` until `npx svelte-kit sync` has run. The one-command corpus step should run it first.
- Each step loads 694,494 Kew rows and peaks at 2.2 to 2.6 GB of resident memory.

## Task 1: every range re-derived from Kew's files

Of 8,947 dossiers, 8,925 have native and introduced regions identical to my reading:
- 8,891 by the author rule;
- 22 through another spelling of the epithet;
- 11 through older names, checked against the entry the page names;
- 1 through the Unplaced row's own range.

Rule-driven differences from the README-naive reading, where the stored page is right:
- Ixora coccinea: the family rule.
- Fragaria virginiana: an own row filed under a subspecies.

The 476 synonym ranges all agree. Extinct and doubtful rows give no mismatch: 60 pages have extinct regions, all listed, and 53 have doubtful regions, all dropped (finding 5). Introduced and native are never swapped, and no page holds a row both introduced and extinct.

No Kew range derivable, 20 pages:
- Ceropegia juttae and C. angustilobulata: Kew lists each twice by one author under two entries. "Homonyms, unresolved" is right.
- Albuca longifolia and Ceropegia macrocarpa: another author. Right.
- The cases in findings 7 and 8.
- Pseudofumaria lutea (Kew writes Pseudo-fumaria) and Conophytum calculus vanzylii: GBIF's copy through the API path. Both equal Kew's own rows.

Five ranges come from an infraspecific entry under another species (Ceropegia keithii, Orbea carnosa subsp. keithii and others), each said in its note. Full table: `B-work/task1-classification.txt`.

## Task 2: the 476 range-source notes

`notes.py` checked each against Kew's names file. All 476 are true: the row exists with that name and author and that status (469 synonyms, 5 illegitimate, 2 invalid), it is filed under that entry, and the stored range equals the entry's. 443 are homotypic and 33 heterotypic.

Six take another reference species' range:
- Ceropegia melanops → C. nigra.
- Weingartia pulchra → W. canigueralii.
- Drosera parvula → D. paleacea.
- Echeveria sessiliflora → E. pinetorum.
- Coryphantha macromeris → Pelecyphora macromeris.
- Copiapoa boliviana → C. calderana. Both of these pages show the disagreement notice: Kew says CLC, while all 117 and 73 records lie in the CLN box.

Only Coryphantha and Pelecyphora macromeris is homotypic, so those two are one plant. They split its records between two keys (180 open and 547 restricted against 39 and 50), so neither page shows the whole population.

My recommendation:
- Merge that pair under one page with a redirect.
- Keep the five heterotypic pages, which are GBIF's taxonomy against Kew's, but show the note beside the map (finding 3).

## Task 3: records, centroid, climate

`records.py` checked every dossier.
- 5,565 climates are "ok", and none rests on fewer than 3 cells.
- No page has a centroid without a verified range with region boxes, or one with n above its in-range count.
- `thin` agrees with fewer than 12 in-range records on all 8,947 pages.

Of the 140 pages with no climate despite 50 or more in-range records:
- 58 have none placed within 10 km (iNaturalist-obscured cacti such as Pachycereus schottii, 892 records, all vague);
- 74 have fewer than 3 cells;
- 8 have no verified range: Lantana strigocamara, Xerochrysum bracteatum and others where Kew states no native range, and Bisnaga hamatacantha.

All follow the rule. The notice is covered in finding 10.

## Task 4: the two commands on a copy

The builder writes under `static/` relative to its working directory (`build-dossiers.ts:149`). I linked `B-base/static/s` to `/tmp/claude-0/rev72/B-s`, a fresh `cp -r` of the corpus. Under the shared load, `npm run dossier` was killed for memory twice, so `B-work/runwatch.sh` runs the npm script's own command, `node --max-old-space-size=8192 --import tsx scripts/build-dossiers.ts <args>`, from `/tmp/claude-0/rev72/B-base` (r72base), recording wall time and peak memory. I took md5 snapshots of every corpus file before and after each run.

- `--list-rebuild --bulk /home/claude/r72data/bulk`:
  - Output: "43 species whose Kew entry the author and spelling rule reads differently; 55 species to rebuild → rebuild-keys.txt".
  - 97.4 s, then 102.1 s, under heavy shared load (29.6 s on a quieter machine); peak 2.19 GB.
  - The second run gives an identical list, and the corpus is unchanged. It is a no-op, but the list is not the stale pages (finding 9).
- `--fill range-source --bulk /home/claude/r72data/bulk`:
  - Output: "0 ranges now say whose entry they are ...; 476 said so already", "corpus 4c784c5dc7ca2448 ... 0 files written ...; unchanged".
  - 169.3 s, then 109.0 s; peak 2.45 to 2.60 GB.
  - The second run gives the same output, and every file is byte-identical. It is a no-op.

With the trial fix on a second copy, the fill said 143 ranges, and the run after it said none (finding 2).

## Task 5: carried values

Today is 2026-10-15. No upstream row of any dossier is older than 30 days: the oldest is a Commons and iNaturalist read of 2026-09-15. Nothing is near the 90-day limit, and no identifier is kept "of a day not known".

Nine Wikidata rows keep "the identifiers of the build of 2026-10-14". These are `rebuild-wd.txt` less Agave variegata, lagged on 15 October; each names its day, and `idsReadOn` reads it.

7,985 carried Wikidata rows still say "carried from build of D" with D after their own read. `idsReadOn` takes the earlier of the two, so the limit runs from the read.

The clean index run reports no dossier changed since its stamp, so every `changed` fingerprint holds.

What is shown as fresh and is not: finding 1.

## The open issues in my area

- **2, Ixora's author.** The range has been Kew's Ixora coccinea L. since round 71. "Comm. ex Lam." stays because `kewName` requires a key with no GBIF synonyms (this key has "Ixora coccinea Comm.") and GBIF holds L. as DOUBTFUL. I recommend keeping the backbone's author and adding finding 2's note rather than widening `kewName`.
- **3, Lost POWO links.** The premise is wrong: Kew's file holds both numbers. 77320739-1 is Kew's Cochemiea matehualensis (Backeb.) M.H.J.van der Meer, a synonym of Neolloydia matehualensis. 77238679-1 is Kew's Unplaced Ceropegia macrocarpa J.N.Haage & E.Schmidt. Dropping Ceropegia macrocarpa's link was right, because it is another author's name. Dropping Cochemiea matehualensis's was wrong (finding 6). Rebuild 11641002 after the fix.
- **7, Homonym keys.** 14 pages cite Kew's author through `kewName`, and the range is Kew's for the familiar plant on every one. Seven of the 14 are one person spelt otherwise: Tylecodon kritzingeri (E.J.van Jaarsweld), Stapelia gettliffei (Pott-Leend.), Drosera collinsiae (Brown ex Burtt Davy) and others. I recommend no remap before launch, since ranges, records and climate are already the familiar plant's.
- **8, Two pages for one plant.** See task 2. Merge the homotypic pair; for the five heterotypic pairs, show the range-source note visibly.
- **9, `spellingKey`.** No effect on any range: Anthurium lanceum is neither in the corpus nor in Kew's file.
- **1, The ten Wikidata changes.** The range and climate do not depend on the item. A `--keys` run for ten species is cheap apart from the `maxlag` waits, which process change 3 removes. A fill that writes the item and its IDs, then chains `kew-links`, `inat-ids` and `summaries` for those keys, would avoid re-reading records.

## Checked and sound

- The family rule changes Ixora coccinea only, and the subspecies rule Fragaria virginiana only, both rightly.
- Extinct and introduced handling matches Kew on all 8,947 pages.
- Every centroid and climate gate holds.
- The 64 disagreement notices sit exactly where the rule puts them.
- `--fill range-source` is idempotent.
- `changed` stamps are current.
- Carried dates are within limits.

## Not done

- No browser spec was run for the page change (`svelte-check` is clean).
- No `--keys` rebuild, since `occurrence.zip` and `climate/` are not here.
- I made one GBIF request (Cochemiea's WCVP row for the test fixture). POWO was not consulted.
- The plant page's climate sentence is not mended.
- The `--list-rebuild` fix and the provenance fix (finding 1) are recommended, not in the diff.
