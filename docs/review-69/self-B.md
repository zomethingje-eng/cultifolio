# Self-review of round sixty-nine, reviewer B: matching a species to Wikidata, iNaturalist and Kew

Working copy `/tmp/claude-0/rev69/B` (deployed code, unchanged apart from two untracked files: `tests/unit/zz-revB.test.ts`, my reproductions, and `scratch-revB/live-cross.ts`, which runs the real `crossIds` against the live APIs). Live corpus `540c129738556840`.

**Context that matters for every Wikidata finding.** Of 158 live dossiers I read, 142 carry their Wikidata identifiers as "carried from build of 2026-09-19 (rederive)", read under round sixty-eight's rules. The section 14 label rule has run only on the 277 species rebuilt in step 5. To see what it will do to the rest, I took all 8,947 index entries, asked the Wikidata Query Service which carry no item with their own GBIF key (622), found the taxon items labelled with the name (394 species whose item carries another GBIF key), and read each such key from GBIF (392 answered). That is the population the label proof decides.

## Findings

### 1. A followed iNaturalist id takes another species' photographs (confirmed)

`src/lib/dossier/build.ts:453-456` (`checkedInatId`) and `src/lib/dossier/corpus-fills.ts:103-107` (`fillInatIds`) follow an inactive id to `current_synonymous_taxon_ids[0]` with no check of what that taxon is. M6's rules (the taxon's own name must be the accepted name or a same-type name, and never one the reference holds as another species) apply only to `taxonByOlderNames` and `taxon`. The follow path skips both, and `fillInatIds` is not even given `heldElsewhere`.

- **Pinguicula chilensis** (`/api/dossier/5667820`): `ids.inat` 816267, `upstream['inat.taxon']` = "iNaturalist's taxon 506182 (Pinguicula chilensis) is inactive; followed to its current taxon 816267". `https://api.inaturalist.org/v1/taxa/816267` is *Pinguicula antarctica*, which the reference holds as its own species (`/api/dossier/5667863`, also `inat` 816267). The page shows 33 iNaturalist photographs, `inat.photos.wild` "filled 2026-10-12", and all 33 photo ids are identical to P. antarctica's. The species page shows another species' photographs, and its iNaturalist link goes to that species.
- **Mammillaria karwinskiana** (`7279748`): followed 207131 to 1555516, *Mammillaria geminata*. This is neither its name nor a same-type name, so it is the case that got Reicheocactus famatimensis refused. Today the photographs come from the GBIF download, but `links.inat` points to M. geminata, and the next `--fill inat` for it would take M. geminata's photographs.
- **Tricyrtis formosana** (`2752120`): Wikidata's first P3151 was a variety (452312). It was followed to 452310, *T. formosana* var. *formosana*, a variety's taxon taken as the species'.

Rate: in a random sample of 1,200 species with a Wikidata P3151, 40 ids were inactive and 17 of those had one species-level successor. Of the 17, 2 were wrong as above. On the owner's 120 followed ids that suggests about ten to fifteen pages.

`tests/unit/zz-revB.test.ts`, case B3, reproduces it in the build: Wikidata gives 506182, iNaturalist names 816267 as current, and with `heldElsewhere: (n) => n === 'Pinguicula antarctica'` the dossier gets `ids.inat` 816267 and asks for `observations?taxon_id=816267` twice.

**Fix:** after following, read the current taxon's name (the same `/v1/taxa/<ids>` ask, batched) and apply `taxonByOlderNames`'s rule: take it only when its name is the species' name or a same-type name and `heldElsewhere` is false. Otherwise drop the id and ask by name. Give `fillInatIds` `heldElsewhereIn(...)` and the same-type names from the dossier.

### 2. The label proof accepts a homonym that GBIF files under another plant, and brings that plant's IPNI (confirmed)

`src/lib/dossier/sources/wikimedia.ts:114`: a key proves the item when its record's `canonicalName` equals the name in Plantae. Neither the author nor `acceptedKey` is consulted, so a later homonym that GBIF files as a synonym of a different species is proof. The about page states it ("another author's, or an older record"). That is a guess under rule 3: a homonym is by definition a different name.

Of the 394 label-path species, 86 would be "proved" by a record GBIF files as a synonym of another taxon. About 30 of those are autonyms (benign: "Crassula montana L.f." to "C. montana subsp. montana"). Most of the rest are other plants: "Mammillaria elongata Hemsl." is GBIF's *Ariocarpus retusus*, "Lycoris radiata Miq." is *Ungernia trisphaera*, "Daphne odora D.Don" is *D. bholua*, "Sedum pallidum Ten." is *S. hispanicum*, "Crassula pellucida Jacq." is *C. strigosa*, and "Mesembryanthemum tortuosum Eckl. & Zeyh." is *M. emarcidum*. Usually the item is still the right plant, because the label carries it. Where Wikidata has conflated two homonyms in one item, though, the proof is the wrong half of it, and the wrong half reaches the page:

- **Agave variegata Jacobi** (`7720070`): Q391952 carries P846 2767037, "Agave variegata Steud.", which GBIF files under *Agave americana* subsp. *americana*. Its P961 is 62332-1, and IPNI gives that as "Agave variegata hort. ex Steud. 1821". The live page links IPNI 62332-1 (another plant) beside POWO 62333-1 (Jacobi's). This species also has same-type names (*Manfreda variegata*, Q15523250, P846 2771707), but the label step runs first and returns, so the homonym proof pre-empts the stronger same-type path.
- **Peperomia monticola Miq.** (`7555524`): live `ids.ipni` 679160-1, which IPNI gives as "Peperomia monticola Hook.f. 1864" (GBIF: synonym of *P. vulcanica*). POWO is 679159-1, Miquel's. Running the real `crossIds` live (`NODE_USE_ENV_PROXY=1 npx tsx scratch-revB/live-cross.ts 7555524`) gave `{"status":"ok","detail":"found by its label; its GBIF key 4183999 is GBIF's record of Peperomia monticola Hook.fil., the same name","ids":{"wikidata":"Q15605262","ipni":"679160-1",...}}`.
- **Othonna rosea Harv.** (`8056896`): live `ids.ipni` 236136-1 = "Othonna rosea Klatt", proved by 3094382 "Othonna rosea Klatt ex Schinz", which GBIF files under *Emilia schinzii*.
- The round's own Rosa rubiginosa and Pandanus tectorius are "proved" this way ("Rosa rubiginosa Webb", filed under "R. rubiginosa Webb ex Ball"; "Pandanus tectorius Sol. ex Balf.f.", under *P. odorifer*). Their items are right, but the record on the page says they were proved by the same name, which they were not.

Case B1 in `zz-revB.test.ts` reproduces it with GBIF's real 3707487 ("Mesembryanthemum parviflorum Haw.", synonym of *Ruschia parviflora*): one item is `ok` with "the same name". With the second item Wikidata really holds (Q108737043, P225 only), both qualify and the result is `ambiguous`. So the live page's item for M. parviflorum Jacq. (Q17375709, whose IPNI 363249-1 *is* Jacquin's) will be dropped at the next build.

**Fix (smallest):** in the same-name branch, require `!acceptedKey || acceptedKey === gbifKey`, or that the accepted name is this species' autonym. That rejects Agave variegata, Peperomia, Othonna, Mesembryanthemum, Rosa and Pandanus and keeps Solanum nigrum (DOUBTFUL, no accepted). **Better:** prove a label hit by the item's own P961, which must be the IPNI id of Kew's WCVP row for this name with an agreeing author. The bulk files already carry `ipni_id`, so no new host is needed. Either way, run the label proof after the same-type search, not before.

### 3. The label proof refuses right items: deleted GBIF keys and spellings (confirmed)

`wikimedia.ts:111` skips a record GBIF no longer serves. Because the item has a key, line 157's P225 proof is never tried, and line 169 then writes "GBIF's record of another name".

- **Catalpa speciosa** (`3172612`), live run: `{"status":"none","detail":"not taken: the item labelled Catalpa speciosa, Q159204, carries GBIF key 317261, GBIF's record of another name"}`. But `api.gbif.org/v1/species/317261` answers 404: there is no record. The detail is false, and the page loses Q159204 with its POWO, IPNI and WFO, all correct today. The same applies to Myrica cerifera (106344218, 404) and Drosera magnifica (120701230, 404).
- **Mammillaria grusonii** (`8429321`), live run: refused because 5619964 is GBIF's "Mammillaria grusoni Runge". The same happens to Hatiora salicornoides/salicornioides, Conophytum vanheerdei/vanheerdii, Othonna cakilefolia/cakilifolia, Echinocereus stoloniferus/stolonifer, Raphionacme keayi/keayii, Echeveria scheeri/scheerii, Parodia langsdorfii/langsdorffii, Commiphora angustifoliolata/angustefoliolata and Agave nickelsiae/nickelsii. Each live page carries the right item.

That is 20 of the 394, roughly 15 of them right items that the next rebuild drops. The drops audit would list them as losses, but the rule causes them.

**Fix:** treat a 404 key as no key (fall to P225, and say "its GBIF key N is no longer served"), and compare canonical names with K's `misspelt` (`src/lib/dossier/photo-kind.ts`).

### 4. Kew "holds" a name under another author: Ceropegia macrocarpa lost its range wrongly (confirmed)

`src/lib/dossier/bulk.ts:157` (`accepted`): a single row is picked whatever its author. `holds()` (line 141) ignores authors, and the bulk fetcher (line 534) therefore never asks the older names. `/api/dossier/9263110` (Ceropegia macrocarpa **(Sprenger) Bruyns**) records "Kew holds this name (Ceropegia macrocarpa **J.N.Haage & E.Schmidt**), with no native range". The climate is withheld, and the page says "WCVP lists no native region for this name". GBIF's copy of WCVP (dataset f382f0ce) holds that row as DOUBTFUL (206550604), which is another name. Kew holds this plant under its basionym "Huernia macrocarpa E.Dammann & Sprenger", a synonym of the accepted *Huernia macrocarpa* (A.Rich.) Schweinf. ex K.Schum. (206530201). The previous range (5 regions, via Huernia penzigii) was that entry's. The round's "lost on purpose: Kew holds the name with none" is therefore wrong: Kew does not hold this name. Case B4 reproduces it: `distributions` answers `held: "Ceropegia macrocarpa J.N.Haage & E.Schmidt"`.

**Fix:** apply the older names' author rule to the species' own name as well: a row whose author disagrees with the backbone's (`authorsAgree`) does not count, for `holds` or for `accepted`. With no agreeing row, the result is "not taken" or the older-name search, never "held".

### 5. Cyphostemma congoensis has a Kew entry under the neuter spelling (confirmed)

The round says it "has no Kew entry". GBIF's WCVP copy holds **"Cyphostemma congoense (Anon.) Desc."**, ACCEPTED (207866581), with DR Congo (`/species/207866581/distributions`: TDWG:ZAI). `wcvpKey` (`bulk.ts:69`) does not read Latin gender endings, so the page (`4052649`) says "national checklists via GBIF (… no WCVP entry for this name)" and shows only "Congo [Brazzaville]" as reported. The same will hit any GBIF -ensis name that Kew corrects to -ense under a neuter genus (Cyphostemma, Aeonium, Sedum).

**Fix:** when Kew holds no row, try the gender variants of the epithet (-ensis/-ense, -is/-e, -us/-a/-um) and take the row only when the combining author agrees (here "Desc.").

### 6. A GBIF failure in the label proof is recorded as Wikidata refusing (confirmed)

`crossIds` returns GBIF's refusal as its own result (`wikimedia.ts:166`), and `build.ts:388` marks it on the `wikidata` row. Case B2 gives `upstream.wikidata = {"status":"refused","detail":"api.gbif.org 429; the identifiers of the build of 2026-10-01 are kept"}`. Keeping the identifiers is right and is said, but the Provenance row reads "Wikidata · refused" for a source that answered. **Fix:** prefix the detail with "Wikidata answered; GBIF, asked to check its item, …" (or record it under `gbif.species`).

Related: `wikimedia.ts:109` reads only three keys, but line 169's note names every key as "GBIF's record of another name", including keys never asked.

### 7. Lesser provenance points (confirmed by reading live dossiers)

- When Wikidata gives an active iNaturalist id, `checkedInatId` writes no `inat.taxon` row (Solanum nigrum, Lantana strigocamara: absent), so the page does not say the id was checked.
- After `--fill inat-ids` drops an id and `--fill inat` finds nothing, `inat.taxon` is `none` with no detail, and the inactive id's history is lost (Nepenthes putaiguneung `10795380`). This is harmless: 1129213 has 0 observations.
- Mammillaria gigantea (`7383055`, built 2026-10-10) still reads "the previous build's identifiers are kept", with no day. The new code will not carry those again, but the live page breaks "kept identifiers name their build" until rebuilt.

## Mutation testing

40 mutations of the new paths, each run against the 28 test files that import or read these modules (452 tests; `vitest related` plus the area's own tests). 25 killed by behaviour tests. **Killed only by `r67p-about-seams`'s regex over the source text, not by any behaviour test:**

- W3: the `acceptedKey === gbifKey` branch removed. The Tabernaemontana case passes through the canonical branch anyway.
- W9: canonical equality replaced by a genus-prefix match. Any "Solanum x" record would then prove a Solanum item.

**Survived:**

- W2: a record with no kingdom read as not Plantae.
- W4: only the item's first GBIF key read.
- W5: a 404 key ends the proof.
- W6: `isTaxon` ignored. It is dead for the decision: a print has no key and no P225, so it falls to the P225 branch and is refused anyway.
- I2: a missing `is_active` read as inactive.
- I4: `heldElsewhere` removed from `taxon()`'s matched_term path. M says this was added, but no test covers it.
- I8: a 404 batch of ids read as active.
- B1: an iNaturalist check that is refused drops the id.
- B2: `age <= CARRY_DAYS` changed to `<`.
- B6: a dead id left in `ids.inat` when the name search finds nothing.
- C2: `fillInatIds` dropping an id but keeping its link.
- K8: older names reaching one entry with no range taken as a range.
- G1: `sameTypeNames`'s rank filter. The guard's below-species row also has another basionym.

None of the tests use a homonym record that GBIF files under another species, a 404 key, a spelling variant, or a followed taxon held elsewhere. Those are findings 1 to 3.

## Checked and sound

- **The label proof's showcase cases**, read live from GBIF:
  - 2932865 "Solanum nigrum Forssk." is DOUBTFUL with no accepted name; item Q146400 is right.
  - 2891729 "Oxalis corniculata _ novoeguineensis Lourteig" has rank SPECIES and canonical "Oxalis corniculata". It is the only collapsed infraspecific record among the 392 keys, so section 15's caveat is accurate and rare.
  - 91 of the 394 were proved by a synonym of this species. That branch is sound.
- **Same-type Wikidata path:** Bisnaga glaucescens is "found by the GBIF record of Ferocactus glaucescens", which is right.
- **Kew older-name ranges**, checked against GBIF's WCVP copy:
  - Erythrina caffra to *E. afra* Thunb. via Chirocalyx pubescens Walp. (a synonym of E. afra Thunb. at Kew);
  - Bisnaga glaucescens to *Ferocactus glaucescens* via Echinocactus dietrichianus C.F.Först.;
  - Aeonium tabulaeforme to *A. tabuliforme* via A. berthelotianum Bolle.

  All three are right, and each record names the entry and the older name.
- **Lantana strigocamara:** Kew's "Lantana ×strigocamara R.W.Sanders" is accepted with introduced rows only. The page lists them and says Kew lists no native region. That is right.
- **Active iNaturalist ids:** in a sample of 1,200 species (1,219 ids), every active P3151 is the species itself, an infraspecific taxon of it, or a same-type combination (Soehrensia/Trichocereus tarijensis, Fusifilum depressum/Drimia depressa). None is another species of the reference.
- **Inactive ids with no successor** (Nepenthes putaiguneung, Grahamia kurtzii, Scilla hakkariensis): 0 observations each and no search hit, so no photographs were lost. The matched_term fallback rightly found Talinum dauphinense and Manfreda undulata for Talinella dauphinensis and Agave undulata.
- **`ambiguous` versus `none`:** this is kept apart in `crossIds`, `taxon`, `taxonByOlderNames` and `viaOlderNames`, and the label-path GBIF refusal returns `refused` (killed mutation W7). `idsReadOn` and `CARRY_DAYS` work as described (R1 and B3 killed).

## Not done

- More live `crossIds` runs. Wikidata answered maxlag 5.5 to 12 s for the last half hour, and `wbgetentities` returned 429, so Agave variegata, Othonna rosea and Drosera magnifica rest on the item and record data from the Query Service, IPNI and GBIF plus the fixture reproduction, not a live run of the function.
- WFO identifiers of the conflated items.
- A corpus-wide count for finding 1 (it would need about 250 iNaturalist requests).
- A search for other "held by another author" or gender-spelling ranges beyond the cases named. That needs the WCVP bulk files, which the sandbox does not have.
- The full 114-file suite for each surviving mutation.
