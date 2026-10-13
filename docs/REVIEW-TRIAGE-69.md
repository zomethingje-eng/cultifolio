# Triage of the reviews of round sixty-nine

Three reviews of the deployed round (`526ecaf`, corpus `540c129738556840`):

| Short name | What it is | Findings | How it was run |
|---|---|---|---|
| **S** | `REVIEW-SELF-69.md`, six internal reviewers (`review-69/self-A.md` to `self-F.md`) | 53 | Linux; the live site, GBIF, iNaturalist, Wikidata, Wikipedia and Commons sampled; mutation runs; Chromium only |
| **IND** | Independent review (`review-69/outside-ind.md`) | 8 | Windows; the full suite and every engine run; the live site sampled |
| **R47** | Outside review "round forty-seven" (`review-69/outside-r47.md`) | 20 | Linux; every live dossier read; WebKit and Firefox run; 116 reverts |

R47 arrived after the agents had finished their first pass; section 7 holds its decisions, carried out in a second pass by the same agents. A finding is cited by its review and number: S-B1 is the self-review's reviewer B, finding 1, and IND-5 is the independent review's fifth.

**Where the reviews agree and differ.** IND-2, 3, 4 and 7 are S-A1 to A3, S-B2, S-C5 and S-D7a found again; IND-1 is S-C2's class with a new file. IND-5, IND-6 and IND-8 are new. IND-5 is the most serious finding of either review: a reading of the log that cannot be dropped without changing what the grower sees. Two differences are settled here:
- IND reads the Auckland Museum files on Ceropegia radicans as photographs of fresh cut flowers, against S-C3's "herbarium sheets". The rule below decides by what the file shows, and C checks these files by it.
- IND found the index and page counts agreeing for all 576 pages led by Commons, against S-C9 and S-F4. Both hold: the double count comes from an iNaturalist photograph stored again from GBIF's media, which pages led by Commons do not have.

**What the reviews say about the method.** The weak rules are those that read names in free text, and above all the three written during the corpus step. Each was fitted to the cases in front of it, and most mutations of them survive. This round replaces them with rules that read structured identity (a name, an older name, a Wikidata link, an IPNI identifier), and reads spelling through one shared rule. Each rule's tests hold the misreadings the reviews found, as guards.

## The agents and their files

The owner's instruction is to fix everything worth fixing. Each item is owned by one agent of round seventy, and no file is changed by two agents. A change one agent needs in another's file is written as a need and applied at the merge.

Before the round, three changes with no change of behaviour: the Wikipedia half of `sources/wikimedia.ts` moves to `sources/wikipedia.ts`, `--fill summaries` moves from `corpus-fills.ts` to `summary-fill.ts`, and a new `dossier/epithet.ts` holds the one spelling rule (`spellingKey`) that A, B and C read.

| Agent | Area | Files it owns |
|---|---|---|
| **A** | Wikipedia summaries | `sources/wikipedia.ts`, `dossier/summary-fill.ts` |
| **B** | Identifiers and ranges: iNaturalist, Wikidata, Kew | `sources/wikimedia.ts`, `sources/inat.ts`, `sources/gbif.ts`, `dossier/build.ts`, `dossier/bulk.ts`, `dossier/corpus-fills.ts`, `dossier/drops.ts`, `dossier/rederive.ts`, `scripts/build-dossiers.ts` |
| **C** | Every photograph: kind, credit, size, lead, count | `dossier/epithet.ts`, `dossier/photo-kind.ts`, `dossier/photo-credit.ts`, `dossier/photo-size.ts`, `dossier/dedupe.ts`, `dossier/schema.ts`, `dossier/commons-fill.ts`, `sources/commons.ts`, `core/licence.ts`, `scripts/audit-commons-photos.ts` |
| **N** | Names, search and the species page | `core/search.ts`, `core/postings.ts`, `dossier/index-entry.ts`, `server/dossiers.ts`, `server/synonyms.ts`, `routes/species/[slug]/*`, `scripts/audit-common-names.ts` |
| **R** | Records, the clock, the snapshot, import and backups | `core/hlc.ts`, `core/log.ts`, `db/collection.svelte.ts`, `db/vault.ts`, `backup/*`, `import/*`, `routes/backup/*` |
| **X** | The example collection | `db/demo.ts`, `ui/grow/*`, `src/app.html`, `routes/plants/new/*`, `routes/propagation/new/*`, `ui/LocationPicker.svelte`, `tests/e2e/r69x-*.spec.ts` |
| **W** | The server and sync | `server/sync.ts`, `server/counters.ts`, `server/caps.ts`, `routes/api/**`, `routes/sync/*`, `hooks.server.ts`, `sync/*`, the server specs (`tests/e2e/r62s*`, `r62bs*` and the limit spec) |
| **P** | The about pages, the seam tests, engines and the harness | `routes/about/**`, `tests/unit/*about-seams*`, `playwright.config.ts`, `scripts/predeploy.mjs`, `routes/+layout.svelte`, `tests/e2e/**` not named above |

Each agent writes tests for its own fixes, each of which must fail on `526ecaf`, and adds a test for each mutation its reviewer found surviving in its area. Each states, as a need for P, every sentence of `/about/how` or `/about/formats` its change makes untrue, with the replacement.

## 1. Wrong on a species page now

**B1. A followed iNaturalist id brings another species.** S-B1. `checkedInatId` and `fillInatIds` follow an inactive id to its successor only when the successor's name is this species' name or one of its older names, and no other species of the reference holds that name (`taxonByOlderNames`' rule and `heldElsewhere`). Otherwise the id is dropped, saying which taxon it led to. `--fill inat-ids` checks again every id followed in an earlier run (Pinguicula chilensis, Mammillaria karwinskiana, Tricyrtis formosana) and reports what it changed.

**C1. A Commons file that names another plant.** S-C1, S-C3, S-C4, S-C7, IND-1, and the misreadings left from round sixty-nine.
- **Names as pairs.** A title is read for binomials whatever the genus, and each is compared with this species' own names as genus and epithet together. An epithet that matches one of this species' older names counts only with that name's genus: "Euryops abrotanifolius" on Othonna daucifolia is another plant. A run-together name ("Nepentheslamii") is read as two words.
- **Misspellings.** S-C5, S-C11, IND-4. An epithet another spelling of one of this species' is read as the species' (`spellingKey`). An uploader's slip (one letter added, dropped, changed, or two swapped) is read as the species' only when the slip is no name the reference holds, accepted or older, in that genus: "Echinocereus schereri" is another species, "Mammillaria mabudae" and "Aeonium dodantrale" are this one's. The seven-letter floor goes; a floor of five letters stays.
- **Older names below species.** S-C6. An older name at a rank below species ("Babiana stricta var. purpurea") makes only the whole name the species' own, never its first two words.
- **Kinds.** "hybrid" in a title hides the file, as `/about/how` already says. Printed illustrations (Popular Science Monthly, "PSM V"), postage stamps, the Smithsonian's (`-NMNH-`) and other herbarium sheets are hidden by title as well as by category.
- **Group and non-plant files.** A file that Commons files under two or more species is a group photograph and is not shown on either ("Parodia Liberec 1"). A file under an animal's category is not shown (the nymphs on Centaurea americana). A file whose description strikes out the name is not shown.
- **What a museum file shows decides.** A mounted or pressed specimen is hidden; a photograph of a living or fresh plant is shown, whoever took it. C checks the Auckland Museum files on Ceropegia radicans by this, and a category "Specimens in [a garden]" (S-C10) no longer hides living plants.
- **Fruit is the plant.** A pod or fruit on the plant is shown; loose seed is not ("Tecomanthe Speciosa Seed Pod").
- **The title misreadings queued from round sixty-nine** (cones, before, growing, trap2, hyphen suffixes, Azalea branca, hugo schlechterii, "specimen" in a living plant's title) are tested against the same rules, each as a case.

**C2. Stored dossiers keep no categories.** S-C2. A new `--fill commons-kind` asks Commons, fifty files a request, for the categories of every stored Commons photograph, and stores them with the photograph. The read-time rule then applies to them as it does to new answers. A refused request leaves the photograph as it is, counted as not checked.

**B2. The label proof brings a homonym's IPNI.** S-B2, S-B3, IND-3, and the queued Harpephyllum and Oxalis cases.
- **IPNI first.** An item found by its label, or by a GBIF key other than this species' own, is taken when its IPNI identifier (P961) is Kew's for this name and author. This settles homonyms (Agave variegata Jacobi, Peperomia monticola Miq., Othonna rosea Harv.), doubtful records (Solanum nigrum), deleted or variant GBIF keys (Catalpa speciosa, Mammillaria grusonii) and variety records (Oxalis corniculata).
- **Found by IPNI.** With no item by key or label, the item is asked by its IPNI identifier (`haswbstatement:P961=…`), which should find Harpephyllum caffrum's.
- **A contradiction refuses.** A GBIF record whose `acceptedKey` is another species proves nothing, whatever its name. With no IPNI on the item, the GBIF route stands only for a record whose `acceptedKey` is this species or absent, at species rank, in the plant kingdom stated.
- **Refusals.** A GBIF refusal during the proof is recorded as GBIF's (S-B6).

**F1. An older name of two species redirects to one.** S-F1. A name two or more species hold never redirects. Its address gives N1's page naming each holder, with the author under which each holds it where the index has one ("Echeveria farinosa Lindl., now Dudleya farinosa; Echeveria farinosa Van Houtte, now Dudleya pulverulenta"). The `?was=` notice says "the GBIF backbone accepts this species as" only for a name one species holds, as GBIF records it.

**B4. Kew's rows under another author.** S-B4, S-B5. The author rule applies to the species' own name: a WCVP row of the same name by another author is not this species' row, and its absence of a range is not Kew's answer for this species (Ceropegia macrocarpa). An epithet is looked up in Kew under its other gender endings too (`spellingKey`; Cyphostemma congoensis under "congoense").

**C3. Credits.** S-C8. A signature's date and time, "Uploaded by…", a footnote mark, an e-mail address and "The original uploader was X at Y Wikipedia" are cleaned from the author, keeping the person. An unfilled template ("(MiNombre") is no author, so under CC BY or BY-SA the photograph is not shown. `--prune-uncredited` gets the same rule.

**A1. Summaries.** S-A1 to A7, S-F5, IND-2. The lead text is no longer proof. A lead Wikipedia gives under another title is taken only on positive identity:
- the title is this species' name or one of its older names at species rank, the epithet compared by `spellingKey` (gender endings, hyphens, "ae" for "e", "ii" for "i"), with no edit distance;
- or the title's Wikidata item is this species' item (its English sitelink);
- or the title's item names this species' item as the taxon it comes from (P1582, P1672): "Apple", "Date palm";
- or the title's item is a genus that is this species' parent (P171), and Kew holds one accepted species in it: Welwitschia, Fenestraria, Bowiea, Harpephyllum.

Everything else is "none: Wikipedia redirects X to Y", and the record names the proof that was used. The build and the fill read the same rule on the same data, so a summary no longer flips between fills. The 88 restored and the 20 set aside are read again by `--fill summaries`, which reports each change.

## 2. What a first visitor would meet

**N2. Search.** S-F2, S-F6, S-F7.
- An exact older name ranks first, and "shows the name" counts only an exact shown name (F's tested fix: 136 of 162).
- A family is matched from its start only when the typed word is not itself a genus of the reference or a whole word of the entry's name.
- The 404 for three or more holders says "none of them".

**N3. Hyphenated older names.** S-F3. Both maps are keyed by the slug as well, and an address is looked up by its slug directly: `/species/arbutus-uva-ursi` goes to Arctostaphylos uva-ursi.

**N4. Headlines.** S-F8. A tie between spellings of one name takes the commoner spelling across the sources, then lower case. A source outside botany (the World Register of Marine Species) does not decide a tie for a land plant. N measures the change over all 4,082 headlines, lists each changed headline, and fixes no single case: False acacia stays if the rule gives it.

**C4. The index counts what the page shows.** S-C9, S-F4. `shownPhotos` itself drops what the page drops (photographs with no web address, and iNaturalist photographs stored again from GBIF), so the index, the page and the tie-break count the same photographs. `/about/formats` already says so.

**C5. The lead and the sizes.** S-C12, S-C14. Among files of one rank, a lead of at least 500 pixels wide is preferred. The photo strip and the related tiles load the small size (`photoAt(…, 'small')`), a need for N's species page.

## 3. The grower's data

**R1. A snapshot that cannot be dropped.** IND-5. The snapshot's validity includes the fold's clock state (the correction in force and whether it waits), and `FOLD_RULES` rises, so an old snapshot is folded again. A property test folds random logs under random clock states, from the snapshot and from the whole log, and requires the same collection. R runs it against S-D2 and S-D4 too.

**R2. The slow clock across fields and tabs.** S-D2, S-D4. Step 2 places an edit past held stamps of every field of the record that it could hide or revive, not of its own field alone: a removal made while a correction waits is not undone when a held edit folds, and an edit is not hidden by a held removal. A freshly loaded tab does not put out of force a correction another tab has confirmed.

**X1. The example deleted from under a reloading tab.** S-D1. The example tab takes the shared "open" lock in `app.html`'s first script, before anything else runs, and holds it until DemoBar takes it over. Another tab never reads a reloading example tab's collection as left.

**X2. Keep.** S-D7a, IND-6, IND-7.
- The plant and batch forms' Keep carries a new place's containing place.
- When the draft cannot be written, Keep does not leave the example. It says that the draft could not be kept, and the form stays as it was.

**X3. The seed without Web Locks.** S-D6. The seed is written only to an empty log, checked in the same transaction as the write. On a log with anything in it the example is not seeded, and the tab says so.

**R3. Import.** S-D3. A sheet saved again by LibreOffice reads the same: a zero-padded two-digit year is read as the date it was, and a price in a currency format as its number. A line matching one already imported is recognised in either form.

**R4. Replace from an older file.** S-D5. Replace refuses while the device holds changes it cannot read, in the words R3 of round sixty-nine uses for the reverse case.

## 4. Sync and the server

**W1. A configured sync page that never runs.** S-E1. `readInit`'s configured branch ends with `this.schedule(1500)`. The test reaches `/sync` by its own link in a tab opened before another tab set sync up.

**W2. Sync's words and the day's allowance.** S-E2.
- A 429 says the server refused, and why. A bare 5xx says the server did not answer.
- The day's upload allowance is waited out until the time the server gives, not ten minutes, and a photograph is not sent again until then.

**W3. DELETE takes the hold only with the proof.** S-E3.

**W4. The listing budget at the turn of the hour.** S-E7. The budget is counted so that no sixty minutes allow more than the stated pages.

**W5. The harness.** S-E4, S-E5, S-E6. The two server specs take their vault's place from `limitAddress()`. The limit test passes on its own retry. A test guards section 11's fix.

**X4. The example's smaller points.** S-D7b to D7d. The scanned label's "add one to my plants" leads out of the example. The Keep test reads the query without the leave token. The unsettled bar note gets a test.

## 5. Engines and the account

**P1. Two WebKit flakes.** IND-8. The smoke species-change Save and the 400-plant price edit are instrumented first: the Save's promise, the log write and the form's close are timed, and a trace is kept on retry. The owner runs `--browsers=all` and sends the trace; the fix follows what it shows. The sandbox has no WebKit.

**P2. The about pages and their tests.** S-F9 and every agent's needs. The pages are rewritten from the code at the merge, sentence by sentence against the rules as they stand after this round. Each seam test that pins a sentence verbatim and the code's shape is replaced by one that drives the rule with the case the sentence states, so a change of either side is caught.

## Not done, and why

- **S-B7 (provenance).** An active Wikidata iNaturalist id with no `inat.taxon` row, and the "kept identifiers" line with no day, are recorded for B and fixed if they fall within its changes; the rebuild of the species concerned corrects the pages.
- **S-E2's re-sending** is fixed by W2; nothing else of E's is deferred.

## 6. The corpus step after the deploy

In this order, with the corpus backed up first:

1. `--fill inat-ids`, then `--fill inat` (B1).
2. `--fill commons-kind` (C2), then `--prune-uncredited` (C3).
3. `--fill summaries` (A1).
4. The Wikidata items proved by label or by another GBIF key, read again by IPNI (B2), and the Kew rows under another author or gender (B4): B says whether a fill does this or the species go to `--list-rebuild`.
5. `--index`, the two audits, the upload and the live check.

C1, C4, C5, F1 and N2 to N4 need no step beyond the deploy and the index: they act where a dossier or the index is read.

## 7. The second outside review (R47), received during the round

R47 read all 8,947 live dossiers, and most of its findings are S's and IND's found again with more cases. Where it adds a case, the case joins the owning agent's tests; where it adds a finding, the decision is below. Its finding 19's reverts each get the smallest test it names, where the rule still exists.

- **B5. iNaturalist, carried as well as followed.** R47-1. Every id whose iNaturalist name is not this species' (carried, "filed by iNaturalist as", or followed) is matched to GBIF by name, and dropped when GBIF's accepted key is another species of the reference, including across a genus transfer (Echinofossulocactus ochoterenanus is Stenocactus ochoterenanus). The seven pages are the tests: Drimia filifolia, Pinguicula chilensis, Nepenthes angasanensis, Stenocactus boedekerianus, Ceropegia monteiroae, Drimia oliverorum, Cotyledon flanaganii. B.
- **B6. Wikidata.** R47-5. Prunus persica (Amygdalus persica's item) and Oenothera fruticosa (Kneiffia fruticosa's) are re-proved by `--fill wikidata` and go to the rebuild list. The drops audit lists a changed Wikidata id, not only a lost one. P31 is read by its `.id`, so the taxon test runs. Items that share a basionym (P566) are one for "ambiguous". An IPNI identifier that is not the number in the POWO identifier is flagged in the audit. The six homonym IPNIs are tests. B.
- **B7. Replacement names.** R47-8. A synonym GBIF holds under this species, which no species of the reference holds, is this species' own for iNaturalist and Commons, whether or not it shares the type (Ceropegia pulvinata and Stapelia hirsuta; C. mixta and Orbea variegata). B, with C reading the same rule.
- **B8. Provenance words.** R47-10. "Matches neither" is said only when the author matches neither. B.
- **C6. Older names as Commons' "own".** R47-2. A binomial older name counts as the species' own only when no species of the reference holds it as its accepted name; an older name below species counts only with its infraspecific epithet in the title (Pachypodium baronii var. windsorii is not "Pachypodium baronii"). `epithetRank` reads a joined name. Nepenthes dubia/tenuis, N. sumagaya/amabilis, Asclepias curassavica/syriaca, Aloe vera/maculata and Pachypodium windsorii are tests. C.
- **C7. More kinds.** R47-3, R47-10. A credit with "lith." or "del.", a title with a year before 1900, "почта", an abbreviated genus ("N rajah"), a bracketed genus ("Neoporteria(eriosyce)") and another genus of the reference in the title. Commons originals are not used where the slot is smaller than the original (R47-9's 47 tiles): a thumbnail of the slot's size is asked, or the photograph is not used in that slot. GBIF media from a herbarium (PreservedSpecimen) rank below Commons photographs. Credits: "(talk)" anywhere, link marks ("[1]"), and "Photograph by:". C.
- **A2. A sitelink is read too.** R47-4. A sitelink or a carried title that is a binomial of another species is not proof: Drosera montana's item links "Drosera tomentosa", another species, so no summary. A.
- **R5. The slow clock after a reload.** R47-14. A reload waits for a reading only when the time since confirmation could have set the clock right; a tab that has had no reading never writes the correction out; R tests R47's scenarios and decides the threshold by them. R.
- **R6. Unreadable changes in a backup.** R47-15. Readable rows of `unreadable.json` are read back as changes; the rest are appended to the log as they are on Merge and Replace, so a restore loses nothing. R4 stands for the device's own unreadable changes. R.
- **R7. The import key.** R47-16. An ambiguous date cell answered by the grower is keyed in the order answered; the no-column key is stored beside the full one and used when one line of a pair is unmatched. R.
- **X5. Keep when the next page is slow.** R47-17. The draft is kept until the next page reads it, whether or not Leave was called off. X.
- **W6. Sync's minute, the shared cap and the reservation.** R47-11, R47-18. "Not reached" schedules a check a minute later, as the card says. Photographs and log batches are counted apart. A listing reservation lapses after a minute if not settled. W.
- **P3. The keep-data question and the harness.** R47-19, R47-20. The question is asked from the first plant's commit as well as from a load, and the tests wait for the collection rather than a fixed time. `limitAddress` mixes in the retry and repeat index. The two flaky WebKit tests (`r62a-interface:158`, `r67h-disclosure:52`) are examined as P1 was. P.
- **P4. The weather alerts outside the states.** R47-12. Puerto Rico, the US Virgin Islands, Guam and the western Aleutians are asked of the National Weather Service; a place where no alerts service exists, or where it was not asked, never reads "All clear.". P owns `weather/forecast.ts`, `routes/api/forecast` and the place page's alert words for this.

The corpus step (section 6) gains nothing new: B5 and B7 run in `--fill inat-ids`, B6 in `--fill wikidata`, C6 and C7 at read time.
