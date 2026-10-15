# Round seventy-one, B: identifiers, ranges, the builder

Branch `r71` in `(scratch)`, three commits on `r71base` (`00b9ed3`, `2252e48`, `d5bda19`). Unit suite: 3,409 passed, 8 skipped, 0 failed. `npx tsc --noEmit -p .` is clean, and `tsconfig.scripts.json` shows nothing new in `src/lib/dossier` or `scripts`. No page or Svelte file changed, so I ran no browser spec. The new tests are `tests/unit/r71b-*.test.ts` (7 files, 63 tests). Run on `r71base`, 47 of them fail. The 16 that pass there are marked as guards: most pin an existing guard that a mutation survived; the guards on new functions cannot run on the base at all, since those functions do not exist there.

## Done

**S-B1, S-F1: Ixora coccinea and Kew's families.** `inFamily` (`authors.ts`) now takes a `familyOf` argument. `WcvpIndex.ownRows` (`bulk.ts`) passes the family of the entry each row is filed under, not the row's own family column, which Kew fills with the genus's family. Test `r71b-kew-family`, using Kew's rows verbatim. On the base it fails with "expected [ 'Chile South' ] to deeply equal [ 'India' ]". Over all 8,947 species this changes Ixora coccinea and nothing else. F's trial change to `bulk.ts` is not needed.

**S-B3: Fragaria virginiana.** In `WcvpIndex.accepted`, an own row that Kew files under an infraspecific entry of the same words now gives way to the one species entry Kew accepts by those words in the family. The page then shows 66 regions instead of 45. This changes Fragaria virginiana and no other species. Test `r71b-kew-family`.

**S-B4: a range from another Kew entry now says so.** `WcvpIndex.distributions` returns `synonymOf` (the own row, its status, and the entry it is filed under). The bulk fetcher and `gbif.distributions` pass it on. The range source and the record now read: "WCVP (Govaerts, RBG Kew): Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's". The wording is `gbif.synonymOfWords`.

The new fill `--fill range-source --bulk <dir>` (`fillRangeSource`, `corpus-fills.ts`) writes the same words onto stored pages whose regions match Kew's, without a rebuild. A page whose regions do not match is listed, not changed. Test `r71b-kew-family`; on the base the source read "WCVP (Govaerts, RBG Kew) via GBIF".

**S-B8: `--list-rebuild`.** `kewRebuildList` now compares a page's stored native regions with the regions the rule gives today, so a stale page is listed whatever rule made it. It also lists orphan keys whose author is plainly not Kew's (see S-B2). Tests in `r71b-kew-family` and `r71b-homonym-key`; on the base Ixora's case returns `[]`.

**S-B2: species on a homonym key.** The keys stay. A new `kewName` in `build.ts` applies only when all of these hold:
- the key has no synonyms at GBIF;
- its author is plainly not that of the one entry Kew accepts for the words;
- GBIF holds the words by Kew's author once, under another key.

When it applies:
- `name.authorship` becomes Kew's author.
- `borrowNames` reads the synonyms and common names of that usage, and of the taxon GBIF files it under. The taxon's own name joins the synonyms; a row of the species' own words does not.
- The `gbif.species` record says so: "GBIF's key 7872219 is Rubus parviflorus Kük.; Kew accepts Rubus parviflorus Nutt., and the name is cited as Kew accepts it; its synonyms and common names are read from GBIF's Rubus parviflorus Nutt. (2989557), which GBIF files under Rubus nutkanus Moc. ex Ser. (2994229) too".
- If the taxon GBIF files it under is another species of the reference, Kew's author is cited and nothing is read from it (Adenia gummifera, whose Harms usage GBIF files under A. cissampeloides).
- A re-derivation keeps the record's words (`taxon.species` in `BuildOptions`; the script passes it).

Test `r71b-homonym-key` uses GBIF's real answers for Rubus parviflorus, Ranunculus ficaria, Myrica cerifera and Adenia gummifera, plus a whole-build case. On the base, `kewName` does not exist and the build cites "Kük.".

**S-B5: IPNI and POWO links from Kew's number.** `gbif.kewLinks` picks Kew's number for the name and author: the item's own number if Kew holds it, else the entry Kew accepts (`kewIpni` now returns `acceptedId`), else the first. Where Kew holds no number for the name, the item's numbers stand, except a number Kew holds for another author, which is dropped.
- The build applies this after Wikidata answers. `crossIds` shares its Kew answer through `opts.kew`, so there is no second request. The record names both numbers when they change.
- The new `--fill kew-links` (`fillKewLinks`) does the same for stored pages, one GBIF request per dossier. It is resumable through `fill-kew-links-progress.json`.

Test `r71b-kew-links` covers Colchicum neapolitanum, Mammillaria magnifica's Sencke POWO and Kalanchoe pinnata's suppressed duplicate. On the base the build linked the item's 9-9.

**S-B6: the eight refusals reversed by the POWO proof.** In `crossIds`, an item whose POWO (P5037) number is Kew's for this name and author is now proved. This check comes after Kew's IPNI and before the refusals on another author's IPNI or GBIF key. Albuca longifolia stays refused, because its item's POWO is Baker's.
- Test `r71b-wikidata-powo` covers Gunnera manicata and Peperomia monticola, plus the Albuca guard.
- With the day's real answers, `r70c-wikidata-86` now takes Raphionacme linearis. Six of its cases are now proved by POWO rather than by IPNI at IPNI; I changed only the expected wording.

**S-B7, S-C9, S-F13: slips and sisters.** `judgeTaxon` (`inat.ts`) reads a new `NameWord`: what Kew and GBIF say of the name, from `kewSays` and GBIF's match. Two rules use it:
- `slipTaken`: never when Kew accepts the name as a species, and never when GBIF does, unless Kew holds no row of it and accepts this species' own name (GBIF's spelling duplicate).
- `transferTaken`: refuses a genus transfer when Kew accepts both names.

The `kewOurs` request is made only when a slip GBIF accepts depends on it. Tests in `r71b-inat-sister`: Salvia aurea is refused for S. azurea, and Lupinus longifolius for Acacia longifolia. I added Kew's real answers for the two 70c cases to `fixtures/r70c-slip.json`; Echinocereus chisosensis and Othonna cakilifolia still pass.

**S-B9: identifiers kept on an unknown day.**
- `keptIds` (`drops.ts`) now reads the 70c wording, so the drops audit and `rebuildList` see these rows.
- The build writes "…of a day not known, are kept since D", where D is the day the build first kept them. `idsReadOn` and `prevIdsFor` (`corpus-run.ts`) read D, with `prevIdsDayUnknown`, so the 90 days run from D.
- Test `r71b-lag-kept`. On the base, `prevIdsOn` is undefined and the identifiers were kept with no limit.
- Two older tests now expect the "since" wording.

**S-B10: the day a carried row names.** `carriedOrigin` (`rederive.ts`) names the row's own read time, and the script uses it on both carry paths. `idsReadOn` takes the earlier of the row's time and the day its note names. Test: Lilium lancifolium now reads 2026-09-18 (the base read 2026-09-19).

**S-B12: the stem rule.** A new `genitivesAgree` (`own-names.ts`) joins only genitive endings (burbidgei and burbidgeae). Wikidata's label rule and its key rule (`sameName`) use it, so the adjective forms (ritteriana, formosanum) are no longer joined. `epithetsAgree` keeps the adjective for iNaturalist, where `transferTaken` lets Kew decide; Furcraea selloa is unchanged.

**C4: GBIF media.** `gbif.media` now asks for HUMAN_OBSERVATION only, and marks `specimen` on any record of another basis that GBIF still returns. The new `--fill gbif-basis` (`fillGbifBasisAll`) reads the record of each stored GBIF photograph not hosted by iNaturalist, drops the photograph unless the record is a human observation, and lists each drop. It is resumable. Test `r71b-gbif-basis`. I left `bulk-fetch.ts` unchanged: the download is read for human observations only already.

**S-B11: mutation survivors.** Now killed: `kewIpni`'s hybrid filter, `idsReadOn`'s date, both slip guards and the genus-transfer family guard. Of 24 mutations of the new code, only `plainlyAnother`'s "ex-author alone" line survives: its "same person" rule decides every case first, so the line is redundant. A test pins the behaviour.

## Needs

**For C (`photo-kind.ts`).** The triage wants one slip rule. Move `NameWord`, `slipTaken` and `transferTaken` from `src/lib/dossier/sources/inat.ts` (the block beginning "What Kew and GBIF say of a name as a species of its own") into `photo-kind.ts`, unchanged. Then `inat.ts` imports them with `import { slipTaken, transferTaken, type NameWord } from '../photo-kind';` and re-exports them, since `r71b-inat-sister` imports them from `$dossier/sources/inat`. For Commons, C supplies a `NameWord` for each title's binomial; the rule is the same.

**For F (the species page).**
1. Where `upstream['gbif.species'].detail` matches /is cited as Kew accepts it/, show that detail beside the name, so a visitor sees why the author is not GBIF's.
2. The range source row already shows `distribution.source`. Check that the new words fit it.

**For F (`/about/how`, paragraph at line 36).** Each replacement has been checked against my code.
1. Replace "Kew's rows are read in the species' family, so where the backbone's author leads to a row Kew files in another family and Kew has a row of the name in the species' own, that row is the species' (GBIF's Ixora coccinea "Comm. ex Lam." is Kew's synonym of Embothrium coccineum; Kew's Ixora coccinea L. is the plant)" with:
   > Kew's rows are read by the family of the entry Kew files each under, so where the backbone's author leads to a row Kew files under an entry in another family and Kew has a row of the name in the species' own, that row is the species' (GBIF's Ixora coccinea "Comm. ex Lam." is a name Kew files under Embothrium coccineum, a Proteaceae; Kew's Ixora coccinea L. is the plant); and a row Kew files under a subspecies or variety of the name itself gives way to the species Kew accepts by the name (Fragaria virginiana Duchesne, filed under F. virginiana subsp. virginiana, takes the range of Miller's species)
2. After "(Kew's unplaced Ceropegia macrocarpa J.N.Haage &amp; E.Schmidt is not Ceropegia macrocarpa (Sprenger) Bruyns).", add:
   > Where the species' own row is one Kew holds as a synonym of another entry, the range is that entry's, and the page says so ("Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's").
3. After "come from the <b>GBIF Backbone Taxonomy</b>;", add:
   > where the backbone's key is a usage with no synonyms whose author is plainly not that of the one entry Kew accepts by the name, and GBIF holds the name by Kew's author under another key (GBIF's "Rubus parviflorus Kük." for the thimbleberry, Rubus parviflorus Nutt.), the name is cited with Kew's author, and the synonyms and common names of GBIF's usage by Kew's author, and of the taxon GBIF files it under unless that is another species of the reference, are read too, and the page's record says so;
4. Replace "The species' identifiers in other databases (POWO, IPNI, World Flora Online and iNaturalist), the links to them, and the title of its English Wikipedia article come from <b>Wikidata</b>, from the item that carries the species' GBIF key." with:
   > The species' identifiers in other databases (POWO, IPNI, World Flora Online and iNaturalist), the links to them, and the title of its English Wikipedia article come from <b>Wikidata</b>, from the item that carries the species' GBIF key; the IPNI and POWO links are Kew's number for the name and author wherever Kew holds one, and an item's number Kew holds for another author's name is never linked.
5. In the Wikidata proof list, before "or its IPNI identifier is Kew's for this name", insert "or its POWO identifier is Kew's for this name by the backbone's author;". After "as does a GBIF key of another author's name", add ", unless its POWO identifier proves it".
6. After "as "Nepenthes burbidgeae" for Nepenthes burbidgei", add "(a genitive ending only, never the adjective: an item labelled "Parodia ritteriana" is not Parodia ritteri)".
7. Replace "and in either case no other species of the family here has that epithet." with:
   > and in either case no other species of the family here has that epithet; a name Kew accepts as a species is never a slip, nor one GBIF accepts unless Kew holds no row of it and accepts this species' name (GBIF's spelling Othonna cakilifolia, which Kew spells cakilefolia), and a name in another genus is never taken when Kew accepts both (Lupinus longifolius is not Acacia longifolia).
8. Replace "where that build's day is not known, they are kept and the page says so." with:
   > where that build's day is not known, they are kept for at most 90 days from the build that first kept them, and the page says so.
9. In "asked of GBIF instead;", insert after "instead": ", human observations only, as the download is read".

## The corpus step

Back up the corpus first. Then run these in order:

1. **`npm run dossier -- --fill gbif-basis`**
   - Reads `occurrence/<key>` for each stored GBIF photograph not hosted by iNaturalist: about one request per record, at 250 ms each.
   - Drops photographs from records that are not human observations, and prints each species with the record types dropped. Expect the Meise sheets (about 18 species seen among GBIF-led tiles), Adenia lobata's drawing and Talinella grevei's micrographs to go.
   - Writes "each photograph's record read for its basis" on the `gbif.media` row, then the index.
   - On a refusal it stops and leaves the dossier unchanged; a rerun skips what it has read.
   - Then run `--fill gbif-open` and `--fill commons` for any species left with none.
2. **`npm run dossier -- --fill range-source --bulk bulk`**
   - Offline: reads Kew's files only and writes `distribution.source` and the `wcvp.distribution` detail.
   - Expect "476 ranges now say whose entry they are" and none listed as different (my measurement on the live corpus). Six of them show another reference species: Ceropegia melanops, Copiapoa boliviana, Coryphantha macromeris, Drosera parvula, Echeveria sessiliflora, Weingartia pulchra.
3. **`npm run dossier -- --fill wikidata`**
   - Re-proves the refusals by the POWO rule. Expect the eight to be taken and written to `rebuild-wd.txt`; Albuca longifolia stays refused.
4. **`npm run dossier -- --list-rebuild --bulk bulk`**
   - Expect about 59 species:
     - 31 entry changes, including Ixora coccinea, Fragaria virginiana and the 29 that 70c already lists;
     - about 28 orphan keys whose author differs from Kew's.
   - The rebuild cites Kew's author only where GBIF holds the name by that author elsewhere (Rubus parviflorus, Myrica cerifera, Myrica rubra, Stapelia grandiflora, Piaranthus punctatus, Weingartia steinbachii and others). For the rest, Kew merely writes the author otherwise (St.Hil. and A.St.-Hil.), and the rebuild changes nothing.
5. **`--keys rebuild-wd.txt --grid climate --bulk bulk`**, then **`--keys rebuild-keys.txt --grid climate --bulk bulk`.**
   - Builds now make one extra GBIF request per species (`kewIpni`, shared with Wikidata), and two or three more on an orphan homonym key.
6. **`npm run dossier -- --fill kew-links`**
   - One request per dossier with an IPNI or POWO number (about 8,400, about 35 minutes).
   - Prints each change. Expect about 600, most of them the 568 IPNI duplicates.
   - Resumable through `fill-kew-links-progress.json`.
7. **`--index`**, then read `drops.txt`.

## Measured

On Kew's real files over all 8,947 species: the fixed rules change Ixora coccinea (3 regions to 7) and Fragaria virginiana (45 to 66) only; `--fill range-source` would say 476 ranges and list none; `--list-rebuild` gives 59 lines. 17 sister pairs and 6,884 same-epithet pairs in a family are no longer open to a wrong iNaturalist id where Kew accepts the name.

## Not done or departed from

- **The slip rule for GBIF-accepted names.** The triage says "a name Kew or GBIF accepts as a species is never a slip". I keep one exception: GBIF accepting a name Kew holds no row of, where Kew accepts this species. That case is GBIF's spelling duplicate, and without the exception Othonna cakilifolia (40 photographs, restored by 70c) would be refused again.
- **Homonym keys, narrowed.** The rule is held to orphan keys with a usage by Kew's author elsewhere at GBIF. Applied to every key whose author differs from Kew's, it would re-cite 63 species, mostly Kew writing the same author otherwise, and would borrow names onto keys that have synonyms of their own (Diospyros kaki has 26).
- **The reference-level remap** is left to the owner, as decided. Pages for one plant under two names (Coryphantha macromeris and Pelecyphora macromeris, S-A1) are recorded, not changed.
- **`fillWikidata`'s "stands" path** still writes the item's numbers. Running `--fill kew-links` after it, as in step 6, puts Kew's back.
- **Not checked live:** that POWO resolves its own suppressed numbers. POWO answered 403 from here.