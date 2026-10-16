# Round 72, reviewer C: photographs across the live corpus

Corpus `4c784c5dc7ca2448` (read-only copy at `/home/claude/r72data/s/v2`), code at `r72base` (`c290e0f`). Every number below comes from a script in `/tmp/claude-0/rev72/C-work/`; outputs are in `C-work/out/` (before the fix) and `C-work/out-fix/` (with the trial fix). The audit reads each dossier exactly as the Worker does: `parseDossier(json, heldNamesOf(index.json))`, then the page's own `showable` filter and `heroOf`. I checked that the index's tile and count agree with that reading for all 8,947 pages (0 differences), so the audit is the page.

Population (`audit.ts`, `out/summary.json`): 8,947 pages; 252,641 stored photographs; 228,548 shown; 24,083 stored and hidden; 6,318 pages with a lead (5,109 iNaturalist, 639 GBIF, 570 Commons); 2,629 pages with none.

Trial fix: `/tmp/claude-0/rev72/C-fix.diff` (photo-kind, commons-fill, drops, sources/inat, build, build-dossiers, one source-shape test updated, new `tests/unit/r72c-photographs.test.ts`). The new file has 14 tests: 11 fail on `r72base`, 3 guards pass on both. 35 related unit test files (677 tests) pass with the fix, and `tsc` is clean on the changed files. Re-running the audit with the fix shows 46 more photographs on 15 pages, hides none, and changes no lead (`out-fix/`).

## Findings

### 1. iNaturalist photographs of another species, as Kew counts species, on 11 pages, 6 of which lead with one (confirmed)

`src/lib/dossier/sources/inat.ts`, `photos()`: the request is `observations?taxon_id=<id>`, and iNaturalist includes every descendant taxon. Where iNaturalist keeps as a subspecies a plant that Kew accepts as a species of its own, and that species has its own page here, the parent's page shows the other species' photographs. This breaks rule 3, since the match is taken without the rule saying it is unambiguous.

How I found the pages: `infra-pairs-kew.py` lists, from Kew's WCVP, every name below species whose accepted species is one page of the reference while its first two words are another page's accepted name (1,398 names, 605 parent pages). `infra-check3.py` then asked iNaturalist for each parent's child taxa (one request a parent) and for the matching child's observations, and intersected those photographs with the parent's stored ones. Hits (`out/infra-hits.json`):

- Eriosyce crispa: 44 of 66 shown photographs are Kew's E. eriosyzoides (iNat "crispa huascensis", "crispa carrizalensis"). **The lead is one of them.**
- Copiapoa megarhiza: 35 of 84 are Kew's C. fiedleriana ("megarhiza echinata"). **The lead is one.**
- Epithelantha greggii: 13 of 50 are Kew's E. polycephala. **The lead is one.**
- Eriosyce odieri: 9 of 61 are Kew's E. krausii. **The lead is one.**
- Coryphantha macromeris: 6 of 49 are "runyonii", which Kew places under Pelecyphora macromeris. **The lead is one.**
- Parodia schumanniana: 6 of 9 are Kew's P. claviceps.
- Ferocactus peninsulae: 11 of 50 are Kew's F. gracilis. Crassula exilis: 9 of 19 are Kew's C. cooperi. Yucca filamentosa: 2 of 39 are Kew's Y. flaccida.

The shared-photograph check below adds two more: Echinocereus engelmannii shows 15 photographs of Kew's E. fasciculatus, and Conophytum jucundum leads with "C. jucundum fragile", which Kew puts under C. wettsteinii. That makes at least 11 pages, about 170 photographs and 6 wrong leads. It is a lower bound, because GBIF and iNaturalist reset connections during the survey and a parent whose request failed was passed over.

Smallest fix: drop an observation whose own taxon (`o.taxon.name`, already in iNaturalist's answer) is a name below species that the reference holds under another species. The diff adds `observedAsAnother` and passes `{ key, held }` from `build.ts` and `fillPhotos`, with test C-5. It reads names from the index, whose `syn` keeps only six GBIF synonyms, so it catches just 2 of the 12 cases above (`infra-cover.ts`). The real fix reads Kew's synonym rows (`--bulk`, `loadWcvp`), or asks GBIF's backbone once for each distinct child name. The 11 pages' iNaturalist sets then need asking again (`--keys` on these keys, or `--fill inat` with the two `inat.photos.*` rows cleared).

### 2. False hides from the title rules: 46 photographs on 15 pages (confirmed, fixed in the diff)

I attributed every hidden photograph to the rule that hides it (`audit.ts`, `out/hidden.json`) and worked out which word caused each "named as another species" hide (`explain.ts`, `out/another-explained.txt`). Two code faults account for these 46.

(a) `photo-kind.ts` `readings()`, the bare-genus branch (`BARE_GENUS`). Any capitalised word that is a genus of any name the reference holds, older names included, counts as "another plant" when nothing follows it. "Cactus" is a genus only of older names (Cactus mammillaris), so "Pariette Cactus - Sclerocactus brevispinus" hid 11 of that page's 14 files. The same happened to "Cactus (Mammillaria vetula)", "Balloon Cactus (Parodia horstii)", "Echinopsis chamaecereus (Peanut Cactus)", "… (Rose Pincushion Cactus)", "Melocactus paucispinus Bahia Brasil" (a Brazilian state, and an older genus), "Chinese Croton (Excoecaria cochinchinensis …)", "Autumn Crocus (Meadow Saffron)" on Colchicum neapolitanum, and "Golden Lotus Banana (Ensete lasiocarpum)". In all, 38 files on 14 pages.

Fix: a bare genus counts only when it is the genus of an accepted name of the reference (`HeldNames.acceptedGenus`) and is not preceded by a capitalised word that is no genus, which is how an English name reads ("Autumn Crocus"). Guards kept: "… Yucca carnerosana" on Hesperaloe, "Aloe Dichotoma & Cyphostemma Juttae", "Dinteranthus? Pleiospilos?".

(b) The same function, the run-on branch (`runG`). A word already read as an epithet is read again as one of the species' own genera run on into a word. "eurystigmatum" starts with the older genus "Eurystigma", the rest of the word is not that name's epithet, and so all 8 files titled "Mesembryanthemum eurystigmatum …" were hidden from Mesembryanthemum eurystigmatum's own page, which showed 3. Fix: the token read as an epithet is marked as used (`used`, `after().first`). Guard kept: "Nepentheslamiiplant" on Nepenthes monticola.

Residual for the owner: two of the newly shown files on Sedum morganianum, "Cactus Plant Cactaceae (253854357)" and "La Palma - Santa Cruz - Avenida Marítima 03", name no species. Before the fix they were hidden only by accident. A title naming a family other than the species' own is a possible further rule.

### 3. The slip guard refuses GBIF's second spelling by the same author (open issue 5; confirmed, fixed in the diff)

`photo-kind.ts` `slipStanding`. Both the Parodia lenninghausii and the Ceropegia barberae files are hidden as "slip asked, not the species". These are the only 6 such hides in the corpus.

- "parodia leninghausii": Kew holds no row of it. GBIF's strict match is "Parodia leninghausii (F.Haage) F.H.Brandt", ACCEPTED, key 8565818, kept beside the species' own "Parodia lenninghausii (F.Haage) F.H.Brandt ex Eggli & Hofacker". `authorsAgree` fails because `withoutEx` keeps the author after "ex", while GBIF cites the one before it.
- "notocactus leninghausii": GBIF's synonym of that same 8565818, which is never read.
- "brachystelma barberiae": GBIF matches "Brachystelma barberiae Harv.", a SYNONYM of a DOUBTFUL record (3580949). The species' own older names include "Brachystelma barberae Harv.", but the guard compares only the accepted name's author.

All three answers come from GBIF on 15 October (I asked by hand). Fix: GBIF's record is the species' when it is the species' accepted name or one of its older names, in the same genus, with an epithet equal or one slip away, by the same author. "Same author" now also accepts "A ex B" cited as "A" when the basionym authors agree (`sameAuthor`, `speltOtherwise`). `askSlip` makes one more request (`/species/<acceptedUsageKey>`) only when the match is a synonym of a key that is not this species'. Guard kept: Conophytum auctum Rawé stays another plant.

Second fault: `--fill commons-kind` never asks again. All 4,387 stored Commons files carry `sourceRead: true`, so a corrected rule never reaches them. The diff makes the fill re-ask any file whose title still holds an unresolved slip (`needsAsking`), which is 6 files and a few requests per run. Test C-3 runs the fill end to end and the file is then shown.

### 4. Older names are GBIF's only, so a file under Kew's synonym is "another species": about 21 files on 6 pages, 2 of them left with no photograph (confirmed, not fixed)

`ownNames` reads `d.name.synonyms`, which comes from GBIF's backbone. `kewsyn.py` (`out/kew-synonym-hides.json`) matched each hidden title's binomials against Kew's WCVP rows for the page's own Kew entry:

- Pelecyphora missouriensis: 7 files "Coryphantha missouriensis …" (Kew's synonym). GBIF lists only "? missouriensis Sw.".
- Aeonium dodrantale: 6 files "Greenovia dodrantalis".
- Musella lasiocarpa: 4 files "Ensete lasiocarpum". The diff now shows these, because "Lotus" was what hid them.
- **Cheiridopsis angustifolia**: 2 files "Odontophorus angustifolius". The page shows none.
- **Ceropegia spathulata**: 2 files "Brachystelma tuberosum". The page shows none.
- Chamaecereus silvestrii: "Echinopsis chamaecereus", Kew's accepted name for the plant. The diff shows these too.

Fix (an owner's decision, since it adds stored data): keep Kew's synonym binomials of the species' Kew entry with the dossier. An offline fill from `--bulk` would do it, and `ownNames` would read them.

### 5. Multi-species photographs: a twig comparison leads Sassafras albidum; survey-plot photographs on 7 pages (confirmed)

`dupes.py` (`out/same-image-two-species.json`): 114 images are shown on two or more pages (238 slots), 101 iNaturalist photographs and 13 ALA images. None is shown twice on one page: deduplication works, and no Commons file numbered as an observation sits beside that observation. Besides finding 1, the images fall into these groups:

- The same iNaturalist photograph attached to two observations of different species. The lead of **Sassafras albidum** (photo 475391379, which I viewed) is a bundle of cut twigs of several species, shared with Cornus amomum's observation by the same observer. Ten more such single photographs are shared between tonyrebelo's paired observations (Geissorhiza aspera and Trachyandra ciliata, and others).
- GBIF media from ALA: 13 survey-plot photographs (Bellingen Shire Council; I viewed one, which shows a plot marker and a tape on leaf litter), each filed under occurrences of two or three species. Together they make 36 slots on 7 pages (Eucalyptus robusta, Melia azedarach, Brachychiton discolor, Crinum asiaticum, Alocasia brisbanensis, Stenocarpus sinuatus, Tristaniopsis laurina).

Fix: at `--index`, a photograph (iNaturalist photo id or GBIF media address) held by two species' dossiers is a group photograph. It should lead neither page, and like Commons' "filed under 2 species", be shown on neither. This is the corpus-wide counterpart of `categorySpecies`.

### 6. Two pages for one plant, found through shared photographs (confirmed; for the names reviewer)

Weingartia fidaiana (7281301, POWO 268072-2) and Rebutia fidana (7906297) share 15 photographs and each leads with one. Kew holds Rebutia fidana (Backeb.) D.R.Hunt as a synonym of Weingartia fidana (Backeb.) Werderm. This pair is not in the owner's list, which has only the Coryphantha and Pelecyphora macromeris pair. In a separate case, Adenia cissampeloides shows 7 GBIF photographs of iNaturalist's "Adenia gummifera gummifera", which Kew accepts as A. gummifera var. gummifera, so here GBIF's backbone placed them on the wrong page.

### 7. Rebuild drops count stored photographs, not shown ones (open issue 4; confirmed, fixed in the diff)

`drops.ts` `dropsBetween` compared `photos.length`. Adenia tisserantii's "dropped to none (2 before)" was two Coimbra herbarium sheets (COI00005498, COI00005510; GBIF basis PRESERVED_SPECIMEN, which I checked). The page never showed them: the previous index already said `photos: 0`. Dropping them was right, and the alarm was false. The reverse case went unflagged: a page whose shown photographs all went while hidden ones stayed. Fix: count `shownPhotos` with the index's names, and pass `held` from the build (test C-4).

### 8. Tokyo museum photographs (open issue 6; suspected)

Agave titanota's "… Food and Agriculture Museum - Setagaya, Tokyo … DSC09882" is stored with `kind: "a herbarium sheet (by its description)"`. Of the corpus's 83 stored kinds, it is the only one without a herbarium title, a herbarium category or a herbarium source. Its only special category is "Plants in the Food and Agriculture Museum", and the uploader, Daderot, photographs exhibits and gardens. Root cause: `sourceKind`'s `SPECIMEN_WORDS` alternative `specimens? (from|in|of) … museum` matches "specimen in the Food and Agriculture Museum", the standard wording of such descriptions, with no word saying pressed, mounted, dried or herbarium.

Adenia perrieri has no stored Commons file (`commons: none` after its round-71 rebuild): the build drops files at the source, so nothing is left to read. I could not view either file or its description, because Commons and upload.wikimedia.org answered 429 for over an hour (other reviewers share the address).

Recommended fix: the museum branch takes a file as a sheet only with a PRESSED word or "herbarium". Then `--fill commons-kind` must re-read these files, since `sourceRead` passes them by: clear `kind` and `sourceRead` where the kind is "by its description". For Adenia perrieri, `--fill commons` will ask again (5 photographs, under six, and no `COMMONS_NONE` detail).

### 9. Weak leads by the code's own rules (confirmed or suspected, as marked)

`out/leads.json`: 20 Commons leads hold neither the species' epithet nor an older name's (`epithetRank` 2).

- **Heliamphora purpurascens** leads with its only photograph, "Heterodoxa pt12". It names the epithet of another page of the same genus and shows a green pitcher; purpurascens is purple. Suspected wrong species. No rule reads a bare epithet of a sister species; `bare-epithet.ts` finds 12 such files, mostly cultivar noise.
- **Boswellia papyrifera** leads with "Giba near Gabat outlet", a river-valley landscape (I viewed it): a habitat shot.
- Commiphora myrrha's lead is "Mirra nos Olivais de Quelemem" ("Plantations in Brazil"). Suspected: not viewed (429).

### 10. Rule 4 holds; three credits publish an e-mail address (confirmed, minor)

`rule4.py` over all 228,548 shown photographs found every licence in the allowed set, every credit in a known form, a source link on every one, and an author under every CC BY and CC BY-SA photograph: 0 breaches. However, 3 photographs on 2 pages publish an e-mail address as the author: Trillium cuneatum (an address in place of a name) and Pinguicula lutea (an address in place of a name, twice). `commonsAuthor` strips e-mail addresses from Commons credits; iNaturalist's and GBIF's credits are not read by any such rule. Fix: apply `MAIL` to every source's credit, and leave the photograph out under CC BY and CC BY-SA if nothing else remains.

Also, 32,862 iNaturalist CC0 photographs are credited "no rights reserved" with no name. iNaturalist's own photo record names none either (`attribution_name` is null, which I checked on observation 149491489), so this is not a breach.

## Open issues in my area

- **4, Adenia tisserantii**: right to drop (two herbarium sheets, never shown); the alarm is a counting fault (finding 7).
- **5, GBIF lists a name twice**: root cause and fix in finding 3; 6 files on 2 pages; the fill needs the re-ask.
- **6, Tokyo**: finding 8; suspected.

## Hidden photographs by reason (live corpus, `out/summary.json`)

GBIF copy of an iNaturalist photograph already shown: 23,505. Commons "named as another species": 153, of which 46 are false (finding 2) and about 21 are Kew-synonym hides (finding 4). Herbarium sheet by title: 82. Not JPEG or WebP: 80. Commons copy of an iNaturalist photograph shown: 76. GBIF herbarium host: 68. Filed under two or more species: 22. Unidentified: 23. Map: 18. Hybrid: 11. Not the plant: 11. Plate or drawing: 11. Not determined: 6. Slip asked and refused: 6 (all false). Herbarium by description or source: 5. Animal: 4. Struck-out name: 2. **Slip not yet asked: 0.** Every stored Commons file has `sourceRead`, and `--fill commons-kind` is the fill that asks.

I checked each reason by eye against its titles and categories (listing in the run log). The maps, hybrids, Coimbra and "(GBIF n)" sheets, groups and seeds are right. The false hides are the ones in findings 2 to 4 and 8. These counts are of stored files only: the build drops a rejected file at the source, so earlier false hides never reached the corpus (Adenia perrieri), and `--fill commons` passes by a dossier it has already asked.

## Species with no photograph

There are 2,629 such pages. In a random sample of 40, GBIF (`empty-gbif.py`) held no openly licensed human-observation image for 39. The 40th, Ceropegia mirabilis, has only Meise herbarium scans, rightly excluded. In the iNaturalist sample of the same 40 (`empty-inat.py`, `out/empty-inat.json`), 9 have no iNaturalist taxon of the name and none of the other 31 has a research-grade, openly licensed photograph. Two have one "needs ID" photograph, which the build rightly does not take. Commons was not sampled (429). The empty pages are empty at their sources.

## Checked and sound

The index tile, credit and count equal the page's lead and count on all 8,947 pages. No image is shown twice on one page. Rule 4 holds for licence, author, credit and link (finding 10). There are no "slip not yet asked" files. Of the 1,315 dossiers with GBIF photographs from hosts other than iNaturalist, 1,304 carry the `gbif-basis` mark (1,159 the `gbif-licence` mark as well). The 11 without a basis mark are round-71 `--keys` rebuilds, whose build asks only for human observations.

## Not done

I did not view the Tokyo files, the Commons sample of empty pages, or Commons leads other than three, because Wikimedia rate-limited this address. A Kew-backed version of finding 1's filter is not wired. The 11 pages of finding 1 and the shared-photograph rule of finding 5 need a rebuild or an index rule, which I have not dry-run. Pl@ntNet leads (57) were not looked at.
