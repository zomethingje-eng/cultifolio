# Round seventy, agent B: identifiers and ranges (iNaturalist, Wikidata, Kew)

Working copy `(scratch)`, one commit on `base`. Items: B1, B2 and B4 of `REVIEW-TRIAGE-69.md`, the S-B7 points within them, the mutation survivors of `review-69/self-B.md`, and step 4 of the corpus step.

## Done

**B1. A followed iNaturalist id.** One rule, `inat.successorRefused`: the current taxon an inactive id names is taken only when no other species of the reference holds its name and the name is the species' own or a same-type older name (`taxonByOlderNames`' rule). The build (`checkedInatId`) now asks iNaturalist for that taxon too. On refusal it drops the id, saying which taxon it named and why. The name search that follows never takes the refused taxon. That matters because iNaturalist's search answers "Mammillaria karwinskiana" with M. geminata by its own synonymy, so dropping the follow alone would have brought it back.

`--fill inat-ids` reads the same rule on the same data: GBIF's same-type names (two requests a candidate) and `heldElsewhere` from the corpus. It reads again every id an earlier run followed (the old words, "followed to its current taxon N", with nothing after). A refused taxon loses its id, its link and the iNaturalist photographs it gave. The name is then searched without that taxon. If nothing is found, the photograph rows are settled as "none", so `--fill inat` cannot find the taxon again. Each change is a line of the report. The build no longer carries a previous build's iNaturalist photographs when it took a different taxon.

Tests: `r70b-inat-follow.test.ts` (19), with iNaturalist's and GBIF's answers of 2026-10-12. Base failures:
- Pinguicula chilensis: "expected 816267 to be undefined";
- Mammillaria karwinskiana: "expected 1555516 to be undefined";
- Tricyrtis formosana: "expected 452310 to be 452309";
- the fill: "expected { checked: 5, followed: +0, … } to match object { checked: 5, refused: 3, … }".

Dypsis lutescens, followed to Chrysalidocarpus lutescens (its basionym), is the guard that a right follow stands. In `r69m-inat-ids.test.ts`, three non-guard tests followed Copiapoa cinerea to a taxon of another name. B1 now refuses that, so they use stand-in ids that name Copiapoa cinerea. Its guards are untouched.

**S-B7.**
- An active id is now recorded: "iNaturalist's taxon 452309 (Tricyrtis formosana), as Wikidata gives it, is active". Base: no row.
- `--fill inat` keeps what `--fill inat-ids` said of a dropped id (`inatTaxonRow`; Nepenthes putaiguneung).
- `--list-rebuild` lists identifiers kept under round sixty-eight's undated words (Mammillaria gigantea).

**B2. The label proof** (`crossIds`):
- **IPNI first.** A label item carrying an IPNI identifier is taken when the identifier is Kew's for this name and author, and refused when Kew's is another. Kew's identifier is read from GBIF's copy of WCVP (`gbif.kewIpni`, one request `/species?datasetKey=…&name=`, asked only when needed). No new host.
- **Found by IPNI.** With no item by key, label or same-type name, Wikidata is asked `haswbstatement:P961=` for Kew's identifier.
- **A contradiction refuses.** With no IPNI on the item, a GBIF key proves it only as a synonym of the species, or as this name at species rank with `kingdom: Plantae` stated. Up to five keys are read, and the epithet is compared by `spellingKey`. A record GBIF files under another species (`acceptedKey` neither this species nor below it) refuses the item. A key GBIF no longer serves is no key. An item proved only by its taxon name gives way to one proved more strongly.
- **Refusals.** A GBIF refusal while an item is checked is marked `by: 'gbif'`. The build records "Wikidata answered; GBIF, asked to check the item it gave, refused the request (…); the identifiers of the build of … are kept".

Tests: `r70b-wikidata-ipni.test.ts` (26), with Wikidata's, GBIF's and Kew's answers of 2026-10-12.
- Agave variegata Jacobi now takes Q15523250 by its same-type name. Base: Q391952, which carries IPNI 62332-1, "hort. ex Steud.".
- Peperomia monticola Miq. and Othonna rosea Harv. are refused. Base: ok.
- Solanum nigrum and Oxalis corniculata are taken by Kew's IPNI. Base: by a doubtful record and by a variety's record.
- Mammillaria grusonii and Catalpa speciosa are taken. Base: none.
- Mesembryanthemum parviflorum Jacq. is taken. Base: ambiguous.
- The file also covers contradiction, kingdom, rank, found-by-IPNI and S-B6, with guards for mutations W3, W4, W5, W6 and W9.

**B4. Kew's rows by author and spelling.** `WcvpIndex.ownRows` reads the species' own name in three steps:
1. the rows of its words whose publishing author is the backbone's (`sameNameAuthor`, new `dossier/authors.ts`: outside the parentheses, after any "ex"; read loosely, so "Ruenge" is "Runge" and "fil." is "f.");
2. otherwise, another spelling of the epithet (`spellingKey`) by that author;
3. otherwise, the one entry Kew accepts under the words.

A row by another author that Kew does not accept is another name. The record says so: "Kew holds Ceropegia macrocarpa only under another author (Ceropegia macrocarpa J.N.Haage & E.Schmidt), which is another name". The WCVP rows GBIF's API attaches to the key are dropped, and misapplied names never count.

Tests: `r70b-kew-author.test.ts` (9).
- Ceropegia macrocarpa. Base: "ok, held".
- Cyphostemma congoensis now gets ZAI from WCVP. Base: "expected false to be true".
- The build's record. Base: "none, no reason".

Two tests of `bulk.test.ts` pinned the old reading and are updated.

## Needs

**P, `/about/how`, "What comes from where".** Each sentence below is untrue after this round.

1. Replace "The species' identifiers in other databases … and two taxa that qualify are no answer." with:
   "The species' identifiers in other databases (POWO, IPNI, World Flora Online and iNaturalist), the links to them, and the title of its English Wikipedia article come from <b>Wikidata</b>, from the item that carries the species' GBIF key. When Wikidata finds no item that does, the items in the first five answers to the name whose label is the name exactly are read, each a taxon (a print of the plant is passed over), and one is taken only when it shows it is this plant: it carries the species' GBIF key or that of an older name with the same type; or its IPNI identifier is Kew's for this name by the backbone's author, or, where Kew cites the author otherwise, for the one entry Kew accepts under the name, while an IPNI identifier that is Kew's for another author's name refuses it; or, with no IPNI identifier, one of its GBIF keys (up to five are read) is GBIF's record of a synonym of the species, or of this name at species rank in the plant kingdom, as the record states it, and none is a record GBIF files under another species; or, carrying no GBIF key that GBIF still serves, it gives the name as its taxon name, which counts only when no other item shows more. Failing these, and the older names with the same type, the item that carries Kew's IPNI identifier for the name is taken. Two items that qualify are no answer, and the page's record of its sources says which rule took the item. GBIF or Kew not answering while an item is checked is said as theirs, and the previous identifiers are kept as when Wikidata does not answer."
2. Replace "Every iNaturalist taxon id … and otherwise the name is searched." with:
   "Every iNaturalist taxon id, from Wikidata or kept from the previous build, is checked with iNaturalist; an id iNaturalist has made inactive is followed to the one current taxon it names only when that taxon's name is the species' name or one of its older names with the same type, and no other species of this reference holds it. Otherwise the name is searched, and the taxon the inactive id named is not taken from the search either."
3. Replace "a name WCVP lists more than once (a homonym) is told apart by authorship, and when authorship does not decide, the page says the name is unresolved and attaches no range." with:
   "an entry of WCVP is the species' own only when the author who published the name is the backbone's, read loosely ("Hook.f." is "Hook.fil."), or, where Kew cites the author otherwise, when it is the one entry Kew accepts under the name; an entry of the name by another author that Kew does not accept is another name, and the page says so (Kew's unplaced Ceropegia macrocarpa J.N.Haage & E.Schmidt is not Ceropegia macrocarpa (Sprenger) Bruyns). An epithet Kew spells in another gender is read so, by the same author (GBIF's Cyphostemma congoensis is Kew's Cyphostemma congoense). Two entries that are the name by these rules leave it unresolved, and no range is attached."
4. Replace "A name Kew holds no entry for at all is looked up under…" with "A name Kew holds no entry for, by those rules, is looked up under…".

**P, `tests/unit/r67p-about-seams.test.ts`.** It pins the code shape `canonicalName ?? '').toLowerCase() === name.toLowerCase()`, which is no longer the rule (`sameName`, by `spellingKey`). It is the one failing test in the suite. Per P2, replace it, and the sentence it pins, with a test that drives `crossIds` on a case the sentence states (Agave variegata, as in `r70b-wikidata-ipni.test.ts`).

## The corpus step (section 6, step 4)

Run after steps 1 to 3, with the corpus backed up.

1. **`npx tsx scripts/build-dossiers.ts --fill wikidata`.**
   - It reads every dossier's item from Wikidata, fifty a request (about 180 requests). Items carrying their species' GBIF key are left alone.
   - It proves again those that do not, about 620 by S-B's count. These were found by label, by another key, or carried from round sixty-eight's first-label rule. It also proves again every species whose record shows an item refused by the label rule (Catalpa speciosa, Mammillaria grusonii, Myrica cerifera, Drosera magnifica). That costs two GBIF requests for same-type names, then the rule.
   - An item that stands keeps its place. Its record says how it was proved, marked "re-proved by --fill wikidata <day>", and its POWO, IPNI and WFO identifiers are read again.
   - An item refused, replaced or newly found is left as it is, printed, and listed in `rebuild-wd.txt`, because the item also gives the iNaturalist id, the Commons category and the Wikipedia title, which a build derives with it.
   - **Fails safe:** a refusal stops the fill and says whose it was. What was proved stands, nothing else is touched, and a rerun passes by dossiers already re-proved.
   - Expect Peperomia monticola and Othonna rosea to lose their items, since no item carries Kew's IPNI for them, and Agave variegata to move to Q15523250.
2. **`npx tsx scripts/build-dossiers.ts --list-rebuild --bulk bulk`.** It reads Kew's files and adds each species whose Kew entry the new rule reads differently from round sixty-nine's (`kewRebuildList`: Ceropegia macrocarpa, Cyphostemma congoensis), and each with undated kept identifiers. A range feeds the records and the climate, which only a build reads again with the grid, so these species are rebuilt rather than filled. It writes only `rebuild-keys.txt`.
3. **`--keys rebuild-wd.txt --grid climate --bulk bulk`, then `--keys rebuild-keys.txt --grid climate --bulk bulk`**, and read `drops.txt`. The refused homonyms' lost identifiers are expected there.

## Measured

- **Kew authors.** I took 200 random species of the live index and read them against GBIF's copy of WCVP (2026-10-12). All 200 have Kew rows under their words.
  - For 10 (5%), no row's publishing author is the backbone's. Each is the same plant cited differently: "(N.E.Br.) Walther" against "E.Walther", "Hochst." against "Hochst. ex C.Krauss", "(L.) Stokes" against "(L.) Batsch", and two backbone authors cut off after the parenthesis.
  - With the accepted-entry step, all 200 keep the row round sixty-nine read.
- **Kew's IPNI.** I read the items for eight of the named cases.
  - Q146400, Q162795, Q1354228, Q159204 and Q14862280 carry Kew's IPNI for the name. The last two match by the accepted step: Kew writes "Warder ex Teas" and "Poir." where the backbone writes "Warder ex Engelm." and "Lam.".
  - Q391952, Q15605262 and Q15578453 carry the homonym's IPNI, and no item carries Kew's for Agave variegata Jacobi, Peperomia monticola Miq. or Othonna rosea Harv.

## Not done, and decisions departed from

- **B4, read strictly,** would drop Kew's range for about one species in twenty, each wrongly (above). So the author refuses a row only among rows and when Kew does not accept it, which is Ceropegia's case. A spelling variant still needs the author. Round sixty-nine's "the ex-author is not the author" applies to the species' name too, and Pandanus tectorius ("Parkinson ex Du Roi" against Kew's "Parkinson") passes by the accepted step.
- **Harpephyllum caffrum** cannot be found by IPNI. Kew holds only Harpephyllum afrum Bernh. (the ICN's 2024 replacement of "caffr-" epithets), and Wikidata has no item of that taxon name.
- **Found by IPNI asks GBIF once more** for a species with no item. Seven existing tests (in r68c, r69m-names and r69-wikidata-label, two of them guards) gained one fixture line answering GBIF's copy of WCVP with no row. Their expectations are unchanged.
- **The matched-term name search** still takes iNaturalist's synonymy on another type when no inactive id is involved (round sixty-eight). Holding it to the same-type rule would cost right matches where GBIF records no basionym. That is for the next triage.
- **S-B6's pill.** Provenance still reads "Wikidata · refused", because `idsReadOn`, `keptIds` and the rebuild trigger read that status. The detail says GBIF refused. A separate row would need a name in `ui/ref/upstream.ts`, which no agent owns.

## Runs

- **New tests:** 59 in four files. All 43 that are not guards fail on the base (`(scratch)`). The 16 guards pass on both.
- **Types:** `tsc` over the dossier code, the script and the touched tests shows nothing new against the base. No Svelte file changed.
- **Full unit suite:** 312 files, run in chunks on one worker because the shared machine ran out of memory twice. One test fails: `r67p-about-seams`, the need above. Two chunks that timed out under load passed when rerun.

## Second pass (R47; triage-69 section 7)

Commit `8003e75`, on top of the first pass. Two new test files with 19 tests, live data of 2026-10-12. On the base, 17 fail and the 2 guards pass.

**B5. iNaturalist ids however they came.** Any iNaturalist taxon whose name is not one of the species' own names is now matched to GBIF's backbone (`inat.heldAtGbifElsewhere`, one request): an id carried from an earlier build, given by Wikidata, followed, or found "filed by iNaturalist as". It is dropped when GBIF's species for that name, through synonymy or from a rank below species, is another species of the reference. GBIF cannot express a genus transfer: it answers "Echinofossulocactus ochoterenanus" with a doubtful record of its own, and holds the genus under Echinocactus and Ferocactus. So when the reference holds no species of iNaturalist's genus, the name is read as the one species of the same family with its epithet (by `spellingKey`); two such species, or none, decide nothing.

The build, `--fill inat-ids` and `--fill inat` share one function for asking by name (`inat.taxonFor`). The fill now also checks active ids whose name differs, at one GBIF request each. A species' reference comes from the new `dossier/reference.ts`, built from the index or the dossiers on disk. All seven pages of R47-1 are tests: Drimia filifolia, Pinguicula chilensis, Nepenthes angasanensis, Stenocactus boedekerianus, Ceropegia monteiroae, Drimia oliverorum and Cotyledon flanaganii each lose their id and photographs (base: "expected undefined to be 7"). The build cases for Ceropegia monteiroae and Stenocactus boedekerianus fail on the base with "expected 430812 to be undefined" and "expected 870796 to be undefined".

**B7. Replaced names.** `dossier/own-names.ts` holds the rule (`ownNames`, `canonicalOf`). A species' own names are its name, its same-type names, and every other synonym GBIF holds under it, at any rank, unless GBIF marks it pro parte or a species of the reference holds it as its accepted name. The iNaturalist rules read it, for follows and for older-name answers. One more step: when iNaturalist files an older name under a variety whose species is an own name, the species is asked for by name and taken. "Stapelia pulvinata" finds Stapelia hirsuta var. hirsuta, so Stapelia hirsuta is taken. Ceropegia pulvinata now takes 366290 Stapelia hirsuta (base: "expected undefined to be 366290") and C. mixta 431387 Orbea variegata (base: "expected undefined to be 431387").

I did not ask iNaturalist under the replaced names themselves. Over C. pulvinata's 73 real synonyms no rule put "Stapelia hirsuta" among the first five, and the lumped heterotypic names before it would bring ambiguity. Pinguicula antarctica, held as a page, stays refused.

**B6. Wikidata.**
- **The taxon test** now reads P31's `.id`, with a taxon, monotypic, fossil or extinct taxon as the accepted values. An item with no P31 is judged by its taxon name or GBIF key. A print or a "Wikimedia duplicated page" carrying the plant's taxon name is refused. This is R47-19's §14 revert test (base: "ok"). §14's acceptedKey revert already has its test (W3 in `r70b-wikidata-ipni`).
- **Shared basionym.** Items that name one basionym are one answer, in the label step and the older-names step; the one Wikidata links to iNaturalist is taken. Ceropegia sociarum takes Q18079039 (base: ambiguous).
- **IPNI first, extended.** An item carrying the IPNI of Kew's row of the name by another author is refused even when Kew has no row by the backbone's author. Of the six homonyms, Albuca longifolia, Convolvulus cneorum and Raphionacme linearis are new tests; the other three were already tests (base: all taken).
- **The drops audit** lists "identifier wikidata changed (X before, Y now)", and newly disagreeing IPNI and POWO numbers. `--fill wikidata` also writes every disagreeing dossier to `ipni-powo.txt` for reading by hand (Convolvulus cneorum: 266048-1 against 266046-1).
- **Prunus persica and Oenothera fruticosa.** `--fill wikidata` finds Q13189 and Q7078662 by Kew's IPNI. Prunus persica needs the accepted step: the backbone writes "Stokes" where Kew writes "Batsch". Both go to `rebuild-wd.txt` (test, base: no fill).

**B8.** A WCVP homonym record now says "the backbone's authorship (L.) matches 2 of them, under different entries" where it matched more than one, and "matches neither" only when it matched none (base: "matches neither").

**R47-6.** Closed by the first pass's B4, and tested in `r70b-kew-author.test.ts`: the Unplaced lone row is read through `parseWcvpName`, which makes it its own accepted id, and `holds()` is false for "(Sprenger) Bruyns".

**Needs (C).** Commons reads the same rule: `import { ownNames } from '$lib/dossier/own-names'` and use `ownNames({ scientific, synonyms: d.name.synonyms, heldElsewhere }).own`. It returns canonical, lower-case names, infraspecific ones included without a rank word ("pachypodium baronii windsorii"). `heldElsewhere(name)` is true when a species of the reference other than this one holds the name as its accepted name. C6's infraspecific condition (the title must hold the infraspecific epithet) stays C's.

**Needs (P), replacing my first-pass sentences 1 and 2, and one more:**
1. In sentence 1:
   - replace "each a taxon (a print of the plant is passed over)" with "each a taxon by what Wikidata says it is (a print of the plant is passed over)";
   - replace "while an IPNI identifier that is Kew's for another author's name refuses it" with "while an IPNI identifier that is Kew's for another author's name of these words refuses it";
   - replace "Two items that qualify are no answer," with "Two items that qualify are no answer, unless both name one basionym, when they are one plant and the one Wikidata links to iNaturalist is taken;".
2. Sentence 2 becomes:
   "Every iNaturalist taxon id, from Wikidata or kept from the previous build, is checked with iNaturalist. An id iNaturalist has made inactive is followed to the one current taxon it names only when that taxon's name is one of the species' own: its name, an older name with the same type, or another name GBIF holds as its synonym that no species of this reference holds as its own. A taxon of any other name, however it was found, is matched to GBIF's backbone and not taken when GBIF holds it as another species of this reference, or, in a genus this reference does not hold, when it has the epithet of one other species of the family here; the taxon an inactive id named is not taken from the name search either."
3. Replace "From iNaturalist a taxon is taken only when its own name is the species' name or one of those older names, and never one this reference holds as another species;" with "From iNaturalist a taxon is taken only when its own name is one of the species' own names, as below, and never one this reference holds as another species; a variety it files an older name under, whose species is one of them, is read as that species;".

**Runs.** The 70 unit files that read the dossier code: 823 passed, 1 skipped. The one failure is `r67p-about-seams`, P's known need. `tsc` over the dossier code, the script and these tests shows nothing new against the base.

**Cost.** `--fill inat-ids` now asks GBIF once for each stored id whose iNaturalist name is not one of the species' own, and twice more (species and synonyms) for each candidate. It fails safe as before: a refusal stops it before the dossier in hand is written.
