# Self-review 70, reviewer C: every photograph

Copy `(scratch)` at `76dcd55`, live corpus `0c2959d95b5883d2`, read 15 October. Working files are in `(scratch)`. Trial fix: `C-fix.diff` (three rules and a test file whose three cases fail on the base; the 224 photograph tests pass with it). The copy is restored.

What was read: 340 live dossiers (250 random, 90 more with 14 or fewer photographs) and 100 of the 106 GBIF-led tiles. Together these hold 468 shown Commons photographs on 99 pages. All 468 were read by title and categories. I looked at 56 Commons images at 250 px: 43 leads and 13 suspect files. I also looked at 21 photographs in iNaturalist and Commons copy pairs, and at the two NMNH leads. Commons answered 429 for most of the session, from both commons.wikimedia.org and upload.wikimedia.org ("robot policy"). So only 24 category listings (173 candidate files) and 76 thumbnails came through, and 17 of the 60 planned leads were never seen. The rules were run by a harness over the live index's names. Its verdicts agree with the live pages on all 468 shown files.

## Findings

**1. Boswellia papyrifera leads with a distribution map. Confirmed.** The index tile and the page hero are `File:Areale Boswellia papyrifera.jpg`, a map of Ethiopia with dots. "Areale" is Italian for range. The map rule in `photo-kind.ts:99` reads `\bareal\b`, which does not match "Areale". The file's categories name only the species and "Flora of Ethiopia". The probes also show "Mapa", "carte", "kaart", "ареал" and "verspreiding" titles are shown, and so is a category "Maps of <genus>". Fix (in the diff): add `\bmapa\b|\bcarte\b|\bkaart\b|\bareale?\b|\bareali\b|ареал|verspreiding`. Over the 570 Commons tiles and the 468 sampled files, this hides only the Boswellia map.

**2. Commiphora myrrha leads with a herbarium sheet. Confirmed by eye.** `File:Commiphora myrrha.jpg` (W. C. Burger, CC0) is a mounted sheet with a colour bar and a label. Its title and categories say nothing that a rule could read. The same page also shows `Mirra nos Olivais de Quelemem.jpg`, a lilac-flowered herb in Brazil, which is not Commiphora. Commons has misfiled it. No title rule can catch either file. The smallest honest fix is a short list of refused files, kept in the source with the reason for each. `/about/how` would then say that such a list exists, since it is a decision made by a person.

**3. Zanthoxylum beecheyanum leads with a comparison of two plants. Confirmed.** The file is `Comparison between Zanthoxylum beecheyanum var. alatum and Osteomeles anthyllidifolia var. subrotunda.jpg`, and the image shows two shrubs. Osteomeles is not a genus of the reference, so `readings` does not read that binomial (`photo-kind.ts:336`). Fix: in `readings`, treat any capitalised word that is followed by an epithet and then a rank word (var., subsp.) as a name, whether or not the reference holds the genus. Or add "comparison" to the title kinds.

**4. GBIF media let herbarium scans, a drawing and pollen micrographs lead. Confirmed.** Of 100 GBIF-led tiles, 20 come from MACHINE_OBSERVATION records:
- 18 are Meise herbarium sheets (for example Ceropegia achtenii, Pseudobombax maximum, Momordica cabrae).
- Adenia lobata's lead is Alice Tangerini's line drawing from NMNH, and nine Meise sheets follow it.
- Talinella grevei shows two pollen SEM micrographs by J.W. Nowicke as its only photographs.

The cause is in `sources/gbif.ts:363`, which asks for `basisOfRecord=MACHINE_OBSERVATION` although its own comment says a herbarium scan is not a photograph. The bulk path (`bulk.ts:435`) admits only HUMAN_OBSERVATION, so the two paths disagree. This is how Talinella dauphinensis has none of these files while Talinella grevei, rebuilt through the API path by 70b's "covered" fix, got them back. B-70c says the drop is made "by the herbarium-host rule in dedupe.ts", but `dedupe.ts` drops nothing. It only ranks those hosts last (`leadRank` 4). The `specimen` flag is dead code: the query excludes PRESERVED_SPECIMEN, so `o.basisOfRecord === 'PRESERVED_SPECIMEN'` is never true. Fix: drop MACHINE_OBSERVATION from the query, matching the bulk path. At read, drop GBIF media on `collections.nmnh.si.edu` and `oxalis.br.fgov.be`, or at least keep them from leading a tile. The first part of `/about/how`'s lead sentence then needs no change.

**5. The same photograph is shown twice on 5 of 18 mixed pages: 8 duplicates. Confirmed by eye.**
- Echinocereus adustus: "schwarzii 1/2.jpg" are iNaturalist 34674713 and 34674723, at the same size and by the same author.
- Melocactus mazelianus: two crops of 387806539 and 62288434.
- Melocactus azureus: "1.jpg", a crop of 250613376.
- Echinocereus primolanatus: "1.jpg", a crop of 76027886.
- Matucana charlesiorum: a crop of 467467812.
- Othonna cakilefolia: "23242119.jpg" and "23242119 (cropped).jpg", which `commonsInatCopy` cannot pair.

70b's report foresaw the numberless "X 1.jpg" case and left it. The number rule also misreads a camera timestamp: "…20220416_120706.jpg" gives 120706.

Smallest fix: `--fill commons-kind` should also ask for `Credit` and store the iNaturalist photograph id it names (`inaturalist.org/photos/(\d+)`), and `shownPhotos` should compare that id. The diff fixes only the regex: it reads "(cropped)" and refuses a number that follows `digits_`.

**6. A group photograph is shown when its title happens to contain the epithet's stem. Confirmed by harness; no live case found.** The 70b exemption calls `namesThisSpecies`, which accepts `epithetRank < 2`. That test matches the epithet's stem at the start of any word.
- On Aloe vera, "Vertical garden.jpg" and "Verschiedene Sukkulenten.jpg", each filed under Aloe vera, Aloe arborescens and Agave americana, are read as naming the species and shown.
- On Euphorbia milii, "Milk bottle plants.jpg" is read the same way.
- The same stem test ranks such a file 0 in `commonsFirstByEpithet`, so it can lead.

Also confirmed: "Lithops collection lesliei.jpg", filed under four species, and "Mesembs at Kew - lesliei.jpg", filed under three, are shown on L. lesliei. That follows the rule as written, but four species is not "a plant visible beside the subject". The mutant that removes the `epithetRank` half of the exemption survives, so nothing tests it. Fix: use `readings(title, n).includes('own')` for the exemption and limit it to two species. Test "Aizoaceae Gibbaeum Dispar" (capitalised epithet) on its own.

**7. The group rule misses Commons' diffused categories. Confirmed by harness.** `categorySpecies` matches only "Genus epithet [rank x]". "Lithops karasmontana in cultivation", "Lithops karasmontana (flowers)", "Flowers of Lithops karasmontana" and cultivar categories all count as no species. So "Lithops in a pot.jpg", filed under L. lesliei and one of those forms, is shown. I found no live case among the 468, because almost every file carries only its own species category. Fix: strip a trailing " in …" or " (…)" and a leading "Flowers of " before the match.

**8. The year rule hides good photographs: Motohiro Sunouchi's living-bulb series. Mechanism confirmed; count not taken.** His files are named with the protologue: four Commons-led tiles look like "Lachenalia kliprandensis W.F.Barker in S. African J. Bot. 53- 168 (1987)". I looked at all four: each is a living plant. For any species published before 1900, "…Ecklon- 19 (1827)" is read as a printed work (`oldYear`, `photo-kind.ts:122`). Many Cape bulbs fall here (Romulea, Lachenalia, Moraea). Commons refused the search that would have counted them. Fix (in the diff): `NUMBERED` also accepts a number then "(" before the year. "Zuccarini 1843" and "Korthals 1839" stay hidden.

**9. The uploader's slip rule asks the reference, not the world. Suspected (no-guessing).** In 25 large genera, GBIF holds 50 accepted names that sit one slip from a reference species the reference does not hold: Ceropegia maritae against mariae, Conophytum acutum against auctum, Colchicum davisii against davisiae, Agave nickelsiae against nickelsii, and more (`C-work/slipgbif2.log`). Most are GBIF's own spelling duplicates, but some are distinct names. A Commons file "Ceropegia mariae" in C. maritae's category would be shown, and 70c's follow step reads the same `slip` for iNaturalist ids. Fix: refuse a slip that GBIF's backbone matches exactly as an accepted name. The build already asks GBIF.

**10. `/about/how` says something the code does not do. Confirmed.** "an animal, unless the name names the species": `TITLE_KINDS` hides "Bees on Sparaxis pillansii.jpg" and "Sparaxis pillansii with beetles.jpg" whatever the name says. Only the category check is exempted. Either move the title animal test after `readings` with the same exemption, or say "an animal named in the file's name". Separately, "a plant Commons calls unidentified" is true only for "Unidentified <plant group or held genus>". "Unidentified fungi" and a fungus species category pass. Rhinacanthus nasutus shows two Pseudocercospora leaf-spot files: they show the plant, but they are a disease record.

**11. Derivative-work credits. Confirmed on 3 live files.** "N._andamana2.jpg: Marcello Catalano", "Nepenthes_naga.jpg: Alfindra Primaldhi" and "Nepenthes_chang_rosette.jpg: Trongtham Kruetreepradit" put the original's file name in the author line. They drop the derivative's maker (Mgiganteus), whom the Artist field's second line names. Read again today, the same field gives "N._andamana2.jpg : Marcello Catalano", with a space, so a rebuild changes the stored text. Fix: strip a leading `<file>.jpg:` and append "; derivative work: X" from the second `<li>`.

**12. The fill's own count leaves out the credit rules. Confirmed by reading.** In `commons-fill.ts`, `was` and `why` call `commonsKind` without `credit`, so the fill's "now left out" lines do not match what the read hides by credit (a stamp or a plate). Fix: pass `credit: p.attribution` to both calls.

**13. Mutation testing of `photo-kind.ts`: 48 of 109 mutants survive.** The test set was the 11 files that touch photo-kind (224 tests). Likely equivalent: `slip-same`, `narrow-le`. The survivors that matter:

| Survivor | What is untested |
|---|---|
| `held-infra`, `held-acc-infra` | The S-C6 Babiana guard is tested only without the reference's names |
| `rd-bracket` | No test exists for "Neoporteria(eriosyce)", which C's report claims |
| `copy-5`, `copy-7`, `copy-10` | The digit bounds of the copy number |
| `year-1900s`, `numbered-digit`, `numbered-code3` | The year rule's bounds and exceptions |
| `credit-lith`, `pressed-type`, `peerj`, `bugs`, `cat-seeds`, `plantgroups-succ`, `unid-anycase` | Single kind words |
| `cs-genus`, `cs-held-self`, `cs-onekey`, `cs-infra-any`, `cs-infra2` | The 70b group mapping by key and own name |
| `grp-stem-boundary`, `nts-noRank`, `nts-rank0` | The exemption in findings 6 and 7 |
| `older-heldself`, `rb-isheld-epithets`, `rb-twoword-held`, `rb-hyphen-held`, `rb-run-held`, `rb-run-ne` | The guards that check a name is held elsewhere |
| `rd-adjacent`, `rd-x-break`, `rd-owncase`, `rd-run-len`, `rd-run-key`, `rd-initial-run4`, `rd-initial-run-own` | How titles are split into tokens |
| `er-infra`, `ck-credit-tags`, `order-cat-before-read` | Ranking of older names below species, credit tags, check order |
| `english-ing`, `stem-on`, `nameof-hyphen-genus`, `slip-gap2`, `rb-short` | Small spelling guards |

The list and runner are in `C-work/mut/`.

## Root causes of the open issues in my area

- **Greenovia and Morella (16 files; Aeonium dodrantale still shows 4 photographs, its only stored older name Sempervivum dodrantale).** Own names come only from GBIF's synonym list. The build already reads Kew's WCVP from the bulk files. Fix: add Kew's synonyms, the names whose accepted plant_name_id is this species', to the names `ownNames` reads. Keep the rule that a name the reference holds as accepted is not own. This needs no exception per genus.
- **Talinella "pollen, rightly dropped".** Only the bulk path drops them. See finding 4.

## Checked and sound

- **Index against page: 340 species, 0 differences.** The 250 random plus 90 low-count species were checked (well beyond the 80 asked), for photo count, tile address (`heroOf`) and tile credit (`tileCreditOf`).
- **Credits: 219 compared, 0 wrong.**
  - 60 iNaturalist photographs against iNaturalist's observations API: attribution, licence and the captive flag all match.
  - 44 GBIF media against GBIF's occurrence media: creator and licence match. The photograph's own licence, not the record's, is used, as stated.
  - 115 Commons photographs against Commons' Artist and licence fields: all match apart from finding 11.
- **Licences:** every shown photograph in the sample is cc0, pd, by or by-sa.
- **Rules agree with the pages:** every shown Commons file has categories stored, and the harness gives null for all 468.
- **Category candidates:** of 173 live candidates in 24 categories, 13 are hidden by rule. Twelve rightly: resin, a map, the Liberec group, Parodia mairanana (held as its own species) and two-species titles. One is wrongly hidden: "Notocactus wasarii" on Parodia warasii, an uploader's swap of two letters that are not side by side.
- **Sizes:** the lead uses `photoOf`. Originals no wider than 500 px get 250 or 120 px tiles, and srcset never claims widths it does not have.

## Not done

- 17 of the 60 lead images could not be fetched (Commons 429), so 43 leads were seen.
- The Sunouchi count (finding 8) was not taken.
- Category candidates were read for 24 species, not about 80.
- No browser test was run. The /compare page's 250-px tile for small originals was checked by reading the code only.
