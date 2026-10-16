# Round 72, fix phase: C (photographs)

Branch `r72` in `/tmp/claude-0/rev72/C`, six commits on `r72base` (f6fad74 to e515797). The full diff is `/tmp/claude-0/rev72/C-fix.diff`; scripts and outputs are in `/tmp/claude-0/rev72/C-work/`.

The whole unit suite passes: 381 files, 3,676 tests, 8 skipped, none failing. Three source-shape tests were widened to accept the new lines (`r63c-sitemap`, `r67n-builder`, `r69k-index-seam`). `npx tsc --noEmit -p .` and `tsc` over `tsconfig.scripts.json` for `build-dossiers.ts` show nothing. In strict Chromium, `r61w-pages`, `r62w-pages` and `r71f-species-words` pass (16 tests).

The new tests are in `tests/unit/r72c-photographs.test.ts` (14) and `tests/unit/r72c-fixes.test.ts` (19). Run against `r72base` sources (in a worktree, with a stub `kew-infra.ts`), 35 fail and 7 guards pass on both.

## Done

**C1. iNaturalist subspecies that Kew accepts as other species, read from Kew's file.**
- `src/lib/dossier/kew-infra.ts` (new) streams Kew's names file into `KewInfra`, keyed by genus, epithet and last epithet, whatever the rank word. iNaturalist writes "Eriosyce crispa huascensis" where Kew writes "var." or "subsp.".
- `placedElsewhere(taxon, page)` names the species Kew places the taxon under. It answers null when any of Kew's rows for the name is under the page's own species, or when the taxon is the species or its autonym.
- The page's own species are: its accepted name; its older names of species rank (an older name below species does not make its first two words the page's); Kew's synonyms from the Kew fill, less the older names Kew accepts apart; and Kew's entry, by `name.kew.entry` or else by the page's IPNI number.
- `sources/inat.ts` `photos()` takes `PhotoOwner.kew` and leaves out an observation whose own taxon Kew places elsewhere. The index-based `observedAsAnother` stays, as a second reading.
- `build.ts` passes the predicate when the build is given `--bulk`; `scripts/kew-infra-load.ts` (new) loads it.
- `--fill inat --bulk` runs `inatKewFill` (new, `src/lib/dossier/inat-kew-fill.ts`) over every dossier. Kew's file says which pages can be touched (1,875 of the corpus). Each such page holding an iNaturalist photograph is asked for its taxon's children (one request). Where a child is one of Kew's names placed elsewhere, the iNaturalist sets the page holds are asked again (one request each); a set never held is not asked.
- The wild row's detail gains "descendants read against Kew's file of <day>", so a rerun passes the page by. A refusal stops the fill; an unanswered page is asked by the next one.
- Tests: Eriosyce crispa (huascensis, real Kew rows), Copiapoa megarhiza, Yucca filamentosa, Crassula exilis, the fill end to end, and guards (Rhipsalis baccifera subsp. mauritiana, autonym, the species itself, a name Kew does not hold).

**C2.** The bare-genus rule and the run-on rule, as in the trial ("Pariette Cactus", "Bahia Brasil", "Chinese Croton", "Autumn Crocus", "Mesembryanthemum eurystigmatum"). File: `photo-kind.ts` (`acceptedGenus`, `bareCounts`, `used`).

**C3.** `slipStanding` now reads GBIF's record as the species' own when it is the species' name or one of its older names, by the same author, spelt otherwise. That covers "A ex B" cited as "A" (`sameAuthor`, `speltOtherwise`), and a GBIF synonym of such a record through one more request (`askSlip`). `--fill commons-kind` asks again any file whose title still holds an unresolved slip (`needsAsking`). The dry run shows all six files (Parodia lenninghausii's five, Ceropegia barberae's one).

**C4.** `KindNames.kew` is read from `name.kew`, in the brief's shape. `ownNames` adds Kew's synonyms and drops the older names Kew accepts as species of their own. An absent `name.kew` adds and removes nothing. `kindNamesOf(d, held)` is the one constructor, used by `safeUrls`, the index (`photoFields`), the drops and `commons-kind`. I added `kew` to `NameBlock` in `schema.ts` so a parse keeps it (see Needs). Tests: Pelecyphora missouriensis' "Coryphantha missouriensis" files, the guard for an absent `kew`, and an older name accepted apart.

**C5.** `--index` first runs `markSharedPhotos`. It reads every dossier's photographs as its page shows them, ignoring the mark (`shownPhotos(…, { shared: false })`), and finds each photograph two species' pages would both show: iNaturalist photo id, else the Commons title, else the address. It writes `shared` (the other keys) on each such photograph and removes a mark that is no longer true. It writes only the files whose marks change, and lists the pages in `shared-photos.txt`. `shownPhotos` leaves a marked photograph out, and `Photo.shared` is in the schema. Tests: Sassafras albidum and Cornus amomum, a second `--index` changing nothing, the mark removed, and one page's two copies not counted as shared.

**C7.** `dropsBetween(prev, next, held)` counts the photographs the page shows (trial, test C-4).

**C8.** `sourceKind`: "specimen in/from/of the … museum" makes a herbarium sheet only with "pressed", "mounted", "dried", "preserved", "herbarium" or "natural history" in the description; the herbarium branch is unchanged. `--fill commons-kind` reads again any file left out only by its description (`kindToReadAgain`), and now writes a dossier only when it changed. Against Commons' real description (dry run), Agave titanota's file is shown again. Tests: the sentence, the Smithsonian guard, a pressed museum specimen, and the fill end to end.

**C10.** `creditWithoutMail` takes an address out of an iNaturalist or GBIF credit. A CC BY or CC BY-SA photograph with no author left is not shown (`shownPhotos`) and not taken (`inat.photos`); a CC0 one says "author not stated". Tests: Trillium cuneatum, Pinguicula lutea, a name beside an address, and the builder.

**F8.** `placeholderPhoto` (`/attachment_defaults/`) is left out by `shownPhotos` and never stored by `inat.photos`. It is F's hunk under a public name. Tests: Pseudophoenix sargentii, and the builder.

## Needs

- **A**: `name.kew` in `schema.ts`. I added `kew: v.optional(v.object({ entry, synonyms, acceptedElsewhere, file }))` to `NameBlock`; keep one copy at the merge. `acceptedElsewhere` entries are read as names (author allowed) and compared by genus and spelling key. The real fill must run before `--fill inat --bulk` and `--index`.
- **B**: the Kew file's day. `scripts/kew-infra-load.ts` uses the file's modification date (`statSync(...).mtime`) until B's loader is merged; replace it with B's day.
- **D**: in the step, `--fill inat --bulk` comes after A's Kew fill and before `--fill commons-kind` and `--index`. When `fillInatDescendants` returns `'refused'`, or reports any page "not answered", the step should exit 3 (D7). Today it only prints and returns. `markSharedPhotos` and `fillInatDescendants` write dossiers with `writeFileSync`: please route them through D's write-then-rename.
- **F**: drop F's `photo-kind.ts` hunk (the same rule is in mine as `placeholderPhoto`). `tests/unit/r72f-pages.test.ts` still passes on my tree. The about sentences:
  - `/about/how`, Photographs. "a pressed, mounted or museum specimen (…) or one whose source is a herbarium's or museum's specimen record, or whose description calls it one" becomes "a pressed, mounted or museum specimen (…) or one whose source is a herbarium's or museum's specimen record, or whose description calls it a herbarium, pressed, mounted, dried or preserved specimen, or a specimen of a natural-history museum (a plant on show in another museum is shown)".
  - "…; or another plant." becomes "…; or another plant. A genus named alone is another plant only where a species of the reference is accepted under it and it is not the last word of an English name before it ("Pariette Cactus", "Autumn Crocus" name no other plant). The species' own names are its accepted name, its older names from GBIF and, once Kew's file has been read for the page, Kew's synonyms of its entry, less the older names Kew accepts as species of their own; a name one letter from the species' is the species' where Kew and GBIF hold no such species, or where GBIF's record of it is one of the species' names by the same author, spelt otherwise."
  - After "is shown once.", add: "A photograph that two species' pages would both show (one iNaturalist photograph on two observations of different plants, a survey photograph filed under several species) is shown on neither."
  - After "then from iNaturalist directly for the cultivated set and for species the download gave few of", add: ", leaving out an observation of a taxon below the species that Kew's file places under another species".
  - After "under CC BY and CC BY-SA a photograph without an author is not published", add: "; an e-mail address is never published as an author, and a photograph whose credit names only one is treated as having none. iNaturalist's grey stand-in for a photograph it has not yet processed is not a photograph."
  - `/about/formats`, after "…and `sourceRead` (set once the fill has read them)", add: "; any photograph may carry `shared`, the keys of the other species' pages that hold it, written by `--index`, and is then not shown".

## The corpus step (my part, in order)

1. A's `--fill kew-names --bulk bulk` (A's step): writes `name.kew`.
2. `npx tsx scripts/build-dossiers.ts --fill inat --bulk bulk`.
   - Reads `bulk/wcvp_names.csv` (about 30 s, no request) and every dossier.
   - Asks iNaturalist, one request a second: on the first run about 1,460 children lists plus two requests for each page that took in a misplaced taxon (about 35 minutes).
   - Writes the pages it re-asks, the mark on every page it read, `inat-descendants.txt` (key, name, taxon and Kew's species, photographs before and after) and the index.
   - It should print "N pages hold a name below species…; M asked iNaturalist now; K took in such a taxon and were asked again".
   - Fails safe: a refusal stops it with the count, a page not answered is asked next time, and nothing is removed from a page whose sets were not answered.
3. `npx tsx scripts/build-dossiers.ts --fill commons-kind`: about 10 Commons files in one request, plus GBIF for the slips; it lists every file it now shows or hides.
4. `npx tsx scripts/build-dossiers.ts --index`: marks shared photographs (about 40 dossiers on the first run, then only changes), prints "N photographs on M pages are held by another species' page too", writes `shared-photos.txt`, then the index.

## Measured (dry run on `/tmp/claude-0/rev72/C-run/static/s`, a copy of the live corpus)

On the copy, `name.kew` was written by a stand-in (`C-work/kew-standin.py`: Kew's synonym binomials of the entry found by IPNI number, and older names Kew accepts as species), not by A's fill. It rewrote every file, which is why one index run restamped all 8,947.

- **C1**: first run 85 pages re-asked, second run (after a fix to candidate detection) 12 more, third run 0 requests and identical files (md5 of all dossiers unchanged). That is **97 pages** in all, listed with before and after counts in `C-work/c1-pages.txt`:

  Matteuccia struthiopteris, Tillandsia ionantha, Trillium erectum, Agave vivipara, Agave horrida, Scilla bifolia, Dasylirion longissimum, Gasteria disticha, Haworthia mirabilis, Hippeastrum puniceum, Allium schoenoprasum, Narcissus pseudonarcissus, Arctostaphylos uva-ursi, Papaver dubium, Viburnum opulus, Plectritis congesta, Centranthus ruber, Coprosma repens, Lantana depressa, Vitex negundo, Monardella odoratissima, Acacia longifolia, Prunus serrulata, Cotoneaster glaucophyllus, Aquilegia chrysantha, Aconitum napellus, Ceanothus thyrsiflorus, Euphorbia milii, Cornus sericea, Echinocereus engelmannii, Echinocereus triglochidiatus, Echinocereus russanthus, Coryphantha recurvata, Portulaca oleracea, Carpobrotus edulis, Silphium perfoliatum, Silphium asteriscus, Achillea millefolium, Leptospermum scoparium, Hypericum perforatum, Camellia japonica, Phellodendron amurense, Citrus medica, Epithelantha greggii, Rhododendron indicum, Pteridium aquilinum, Athyrium filix-femina, Lapeirousia dolomitica, Dracaena draco, Aloysia gratissima, Thymus pulegioides, Nepeta racemosa, Lotus corniculatus, Cotyledon orbiculata, Crassula multicava, Aruncus dioicus, Opuntia polyacantha, Echinops ritro, Ilex opaca, Cylindropuntia imbricata, Thymus serpyllum, Chamaenerion angustifolium, Citrus hystrix, Cistus creticus, Euonymus japonicus, Ceropegia linearis, Eriosyce odieri, Eriosyce napina, Eriosyce crispa, Parodia schumanniana, Thelocactus rinconensis, Echinocereus parkeri, Copiapoa megarhiza, Ferocactus peninsulae, Mammillaria melanocentra, Banksia robur, Lithops pseudotruncatella, Lithops karasmontana, Rudbeckia fulgida, Senna artemisioides, Rebutia fidana, Prunus domestica, Echeveria elegans, Capsicum frutescens, Leucanthemum vulgare, Mammillaria pennispinosa, Dipcadi ursulae, Yucca filamentosa, Narcissus papyraceus, Phlox pilosa, Pittosporum tenuifolium, Trichocereus macrogonus, Phaseolus coccineus, Pereskia grandifolia, Anacampseros filamentosa, Rhododendron arboreum, Crassula exilis.

  Of the 97, 43 now hold fewer iNaturalist photographs, 16 hold more (a re-asked set fills up to 24 or 12) and 38 hold the same.

  Shown photographs: Eriosyce crispa 66 to 22, Copiapoa megarhiza 84 to 49, Epithelantha greggii 50 to 37, Echinocereus engelmannii 66 to 52, Trichocereus macrogonus 58 to 24 (Kew's Echinopsis pachanoi), Parodia schumanniana 9 to 3, Ferocactus peninsulae 50 to 39, Crassula exilis 19 to 10. **The six wrong leads change** (Eriosyce crispa, E. odieri, Copiapoa megarhiza, Epithelantha greggii, Conophytum jucundum, and Sassafras albidum by C5). Coryphantha macromeris keeps its lead, rightly: Kew's entry for that page is Pelecyphora macromeris, under which "runyonii" sits, so my review's count of six there was one too many by Kew's reading.
- **C2 and C4 at read time**: 63 photographs newly shown on 19 pages. Two pages that had none now have one: Cheiridopsis angustifolia and Ceropegia spathulata.
- **C3 and C8** (`--fill commons-kind`): 9 photographs shown again on 4 pages (Parodia lenninghausii 5, Agave titanota 1, Aeonium dodrantale 2 as a slip of Kew's "Greenovia dodrantalis", Ceropegia barberae 1). A second run asks 1 file (Boswellia papyrifera, still a sheet) and changes nothing.
- **C5** (after C1): 120 photographs on 38 pages are marked (`C-work/c5-shared-photos.txt`). Costs to note:
  - Rebutia fidana is left with no photograph: its 13 are Weingartia fidaiana's, one plant on two pages (A7, owner).
  - Adenia gummifera loses 7 correct photographs that GBIF also files under Adenia cissampeloides.
  - Conophytum jucundum and C. wettsteinii share 5.
  - Before C1, Crassula exilis and C. cooperi shared 7; the order of the step matters.
- **C10 and F8**: 4 photographs on 3 pages (Pinguicula lutea 2, Trillium cuneatum 1, Pseudophoenix sargentii 1).
- **In all** (live corpus against the copy after every step): shown 228,548 to 228,167; leads changed on 16 pages; pages with no photograph 2,629 to 2,628.

## Not done or departed from

- **Natural history.** "Natural history" counts as a sheet word beside the triage's pressed words and "herbarium". It keeps the pinned Commiphora myrrha description ("specimen from the Smithsonian National Museum of Natural History") a sheet; that file is also caught by its source.
- **Older names Kew accepts apart.** `ownNames` also drops the older names Kew accepts as species of their own (`acceptedElsewhere`). The triage asked only that Kew's synonyms be read, but A2 marks these names for exactly this. On the copy it hid nothing.
- **C1's coverage stops where Kew's file has no row of the iNaturalist name.** Conophytum jucundum's "fragile" is Kew's C. wettsteinii subsp. fragile, and Kew holds no "C. jucundum subsp. fragile". C5 hides those five shared photographs from both pages instead.
- **C5 hides the photographs of the one-plant pairs from both pages** until the owner merges them (A7). Rebutia fidana is the one page this leaves empty.
- **C9** is listed and not done, as the triage says.
