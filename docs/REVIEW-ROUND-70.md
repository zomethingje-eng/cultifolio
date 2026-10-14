# Round seventy: the fixes from the reviews of round sixty-nine

Round seventy acts on three reviews of the deployed round sixty-nine (`526ecaf`, corpus `540c129738556840`):

| Review | Kept as | Findings |
|---|---|---|
| The self-review, by six internal reviewers | `REVIEW-SELF-69.md`, `review-69/self-*.md` | 53 |
| An independent review, Windows, every engine | `review-69/outside-ind.md` | 8 |
| An outside review, round forty-seven, every live dossier read | `review-69/outside-r47.md` | 20 |

`REVIEW-TRIAGE-69.md` decides each finding and gives it to one of eight agents (A summaries; B identifiers and ranges; C photographs; N names, search and the species page; R records; X the example; W the server and sync; P the about pages, engines and the harness). R47 arrived after the first pass; its decisions are the triage's section 7, carried out by the same agents in a second pass. Each agent's report is `review-70/<letter>.md`; the merge's is `review-70/merge.md`.

**How the work was split.** Before the round, three moves with no change of behaviour gave each rule one owner: the Wikipedia half of `sources/wikimedia.ts` became `sources/wikipedia.ts`, `--fill summaries` moved to `dossier/summary-fill.ts`, and a new `dossier/epithet.ts` holds the one spelling rule, `spellingKey`, that A, B and C read. No file was changed by two agents except the per-address limit test in `smoke.spec.ts`, where W and P fixed the same fault; P's fix (in `limitAddress`) is kept. Needs were applied at the merge, then P rewrote the about pages from every agent's sentences, checked against the merged code.

**The method change.** The weak rules of round sixty-nine read names in free text: a Wikipedia lead, a Wikidata label, a Commons title's near spelling. This round replaces each with a proof from structured identity (an older name, a Wikidata link, an IPNI identifier, a GBIF acceptance), and every spelling question goes through `spellingKey`, which reads gender endings, hyphens, "ae" for "e" and "ii" for "i", and no edit distance.

`FOLD_RULES` rises to 8 (R1), so every device folds its log again once; the device database stays at version 4.

## 1. Species pages: matching across sources

**Followed and carried iNaturalist ids (B1, B5; S-B1, R47-1).** An inactive id is followed only to a taxon whose name is one of the species' own (its name, a same-type older name, or another synonym GBIF holds under it that no species here holds), and no other species of the reference holds it. Every id whose iNaturalist name is not one of the species' own, however it arrived, is matched to GBIF and dropped when GBIF holds it as another species here, across genus transfers (Echinofossulocactus ochoterenanus is our Stenocactus ochoterenanus). One rule (`inat.successorRefused`, `inat.taxonFor`) serves the build and the fills. All seven pages of R47-1 and S-B1's three are tests.

**Own names (B7; R47-8).** `dossier/own-names.ts` says which names are a species' own, for iNaturalist and Commons alike: its name, its same-type names, and every other synonym GBIF holds under it unless GBIF marks it pro parte or a species here holds it as accepted. Ceropegia pulvinata and C. mixta get their photographs back through Stapelia hirsuta and Orbea variegata.

**Wikidata (B2, B6; S-B2, S-B3, S-B6, IND-3, R47-5).** An item found by its label or another key is taken first by its IPNI identifier against Kew's for the name and author, read from GBIF's copy of WCVP. An IPNI that is Kew's for another author's name refuses it, which settles the homonyms (Agave variegata, Peperomia monticola, Othonna rosea, Albuca longifolia, Convolvulus cneorum, Raphionacme linearis). With no item at all, Wikidata is searched by Kew's IPNI. A GBIF record filed under another species refuses; a key GBIF no longer serves counts as no key. P31 is read by its `.id`, so the taxon test runs, and a print or a duplicated page is refused. Items sharing a basionym are one answer. A GBIF refusal is recorded as GBIF's. The drops audit lists a changed item, and `--fill wikidata` writes disagreeing IPNI and POWO numbers to `ipni-powo.txt`.

**Kew (B4, B8; S-B4, S-B5, R47-6).** A WCVP entry is the species' own only by the backbone's author, read loosely, or, where Kew cites the author otherwise, when it is the one entry Kew accepts under the name. An entry by another author that Kew does not accept is another name: Ceropegia macrocarpa (Sprenger) Bruyns is not Kew's unplaced J.N.Haage & E.Schmidt. Another gender of the epithet is read (Cyphostemma congoensis is Kew's congoense). "Matches neither" is said only when true.

**Departures accepted.** Read strictly, B4 would have dropped Kew's range for about one species in twenty, each wrongly, so Kew's accepted entry stands in where the author is cited otherwise. Harpephyllum caffrum cannot be found by IPNI: Kew holds only Harpephyllum afrum.

## 2. Species pages: summaries

**Positive identity only (A1, A2; S-A1 to A7, S-F5, IND-2, R47-4, R47-7).** What an article's opening says is never proof. A title Wikipedia gives under another name is quoted only when: the title, or the taxon its Wikidata item names, is the species' name or an older name at species rank by `spellingKey`; the title is the English article of the species' item, and is not another species' binomial (Drosera montana's item links "Drosera tomentosa", so no summary); the title's item shares the species' basionym; the title's item is a product of this species and no other plant ("Apple"); or the title is a genus in which Kew holds one accepted species, this one. The record names the proof, and the build and the fill decide through one `summary()` call, so a summary no longer flips between fills.

**Measured on the 108 of round sixty-nine.** Of the 88 restored, 77 keep a proof and 11 are dropped, each named in `review-70/A.md`. Of the 20 set aside, Fenestraria, Bowiea, Harpephyllum and Jeffersonia come back. Jeffersonia is no longer a guard: Kew holds one species in the genus (it puts J. dubia in Plagiorhegma), and the triage's own rule takes it.

## 3. Species pages: photographs

**Commons (C1, C6, C7; S-C1 to C7, S-C10, S-C11, IND-1, IND-4, R47-2, R47-3).**
- Titles are read as genus and epithet pairs, over the species' genera and the 1,321 genera of the reference. An older name's epithet counts only with that name's genus; an older name below species counts only whole; a binomial older name another species here holds as accepted is that species'.
- An uploader's slip of five letters or more counts as the species' only where the reference holds no such name in the genus: "Mammillaria mabudae" is matudae's, "Echinocereus schereri" is its own species.
- Hidden as well: "hybrid" in a title; printed illustrations (Popular Science Monthly, "lith.", "del.", a year before 1900); stamps ("почта"); NMNH and other mounted specimens; a file Commons files under two or more species; an animal; a struck name; another genus of the reference in the title; abbreviated and bracketed genera; run-together names. Shown again: a pod on the plant, and a living plant in a garden whatever its category says. The Auckland Museum files on Ceropegia radicans are fresh cut stems and stay shown.
- **`--fill commons-kind` (C2)** stores Commons' categories with each stored Commons photograph, so the category rules reach stored dossiers.
- GBIF media from a herbarium rank below Commons photographs; among Commons files of one rank, one at least 500 pixels wide leads; an original is never loaded into a smaller slot.

**Credits (C3, C7; S-C8, R47-10).** Signatures and their times, "Uploaded by", footnote marks, "(talk)" anywhere, "Photograph by:", e-mail addresses and "The original uploader was X at … Wikipedia" are cleaned; an unfilled template is no author, so the photograph is not published under CC BY or BY-SA. `--prune-uncredited` reads the same rule.

**The count (C4; S-C9, S-F4, R47-9).** `shownPhotos` drops what the page drops, so the index, the page and the search's tie-break count the same photographs. The index is built in two phases, so it reads the reference's names as the Worker does.

**Measured.** Over 198 live dossiers and the round-sixty-nine audit, 47 shown files are now hidden, 31 of them rightly (the reviews' cases and eleven more); the cost is 16 good photographs (eight "Greenovia dodrantalis" on Aeonium dodrantale, eight "Morella cerifera" on Myrica cerifera), older combinations GBIF's synonyms lack. 29 good files hidden before are shown. C6 with B7 shows Nepenthes tenuis on N. dubia and N. amabilis on N. sumagaya, against R47-2: GBIF holds both as synonyms and no species here holds either.

## 4. Names, search and the species page (N)

- **Shared older names (F1).** A name two or more species hold never redirects; its address names each holder, with the author from that species' stored synonyms ("Echeveria farinosa Lindl., now Dudleya farinosa"). 207 such redirects become pages naming every holder. The `?was=` notice says GBIF accepts this species as the name only when one species holds it.
- **Search (N2).** An exact older name ranks first (136 of 162 fixed; the 26 left are tautonyms and prefixes answered by the name group). A typed genus no longer matches its family's start. Three holders or more read "none of them".
- **Hyphenated older names (N3).** All 232 held by one species now redirect.
- **Headlines (N4).** 11 of 4,082 change, all to the spelling the sources favour (Showy tarweed, Selfheal, Pigeonberry). "Then lower case" as a general rule changed 44 more, some for the worse, and was not kept. False acacia stays: the rule gives it.
- The photo strip and Related tiles load the small size.

## 5. The grower's data

- **The snapshot (R1; IND-5).** A load reads the snapshot only if the clock in force would hold nothing the snapshot folded, so dropping it never changes what a page shows. A property test folds random logs under random clock states, from the snapshot and from the whole log. R did not key the snapshot by the exact correction and wait, which would have undone round sixty-nine's step 4.
- **The slow clock (R2, R5; S-D2, S-D4, R47-14).** A removal is placed past held edits to any field of its record, and an edit past a held removal. A tab's wait after its own load never takes another tab's correction out of force. A reload waits for a reading only if the clock could have been set right since the correction was confirmed, and only for a correction of more than a day. Four of R47's scenarios are fixed; a fast clock set right while the device was closed cannot be told without a reading.
- **Import (R3, R7; S-D3, R47-16).** LibreOffice's short dates (05/01/24) and currency prices find plants already imported. A date the grower answered is keyed by its answer; a line's key without unmapped columns is kept beside the full one.
- **Backups (R4, R6; S-D5, R47-15).** Replace is refused while the device holds changes it cannot read and the file does not carry. A backup's unreadable rows are read back when this version can read them, and otherwise appended to the log as they are on Merge and Replace, so a restore loses nothing.
- **The example (X1 to X5; S-D1, S-D6, S-D7, IND-6, IND-7, R47-17).** The example tab takes the shared lock in `app.html`'s first script, so a reloading tab is never read as left. The seed is written only into an empty log, checked in its own transaction (`requireEmpty`). Keep carries the containing place, stays in the example when the draft cannot be written, and keeps the draft when the next page is slow. The scanned label's link leads out of the example.

## 6. Sync and the server (W)

- A configured sync page reached by a link schedules its first check (W1); "not reached" checks again a minute later, as the card says (W6).
- A 429 is said as a refusal with the server's reason; a bare 5xx as "did not answer". The day's upload allowance is kept until the server's time, a day at most; meanwhile no photograph or log batch over 16 KB is resent, while small batches still sync (W2).
- A DELETE of a removed photograph takes the name's hold only with the proof (W3).
- The listing budget is counted over any sixty minutes; an unsettled reservation lapses after a minute (W4, W6). Photographs and log batches each have 3,600 an hour (W6).
- The two server specs send a documentation address on every request; `limitAddress` mixes in the retry and repeat (W5, P3).

## 7. Engines and the about pages (P)

- **The WebKit flakes (P1; IND-8).** Leaving the edit form's species field sends a name check whose words, 150 to 300 ms later, push Save down by up to 68 px; Playwright's click is decided where its press lands, so a press started on Save was released elsewhere. A grower's tap at that moment is lost the same way. The species field now takes a full-width row with reserved space (and the batch form's picker reserves its space too); `r70p-save-moves` reproduces the race in Chromium every time and fails on the base. A recording of the Save's steps is attached to smoke's two tests on failure, and WebKit keeps traces of failed tests.
- **The keep-data question (P3; R47-20)** is asked from the first plant's commit as well as from a load, and its tests wait for the collection rather than a fixed time. `r62a-interface:158` now waits for the app's scroll; `r67h-disclosure:52` could not be reproduced and records its cause on failure.
- **Weather alerts (P4; R47-12).** Puerto Rico, the US Virgin Islands, Guam, the Northern Marianas, American Samoa and the western Aleutians are asked of the National Weather Service; "All clear." is said only where alerts were read.
- **The about pages (P2; S-F9, R47-13).** 46 sentences changed (21 on `/about/how`, 25 on `/about/formats`), each checked against the merged code; several supplied by agents were corrected. The seam tests that pinned sentences verbatim and the code's shape are replaced by tests that find a sentence by its opening words, read its figure or example, and run the code on that case (`tests/about-pages.ts`, `r70p-about-seams`, `r70p-about-rules`).

## 8. Found at the merge

- W and P both fixed the limit test's address on a retry; P's fix in `limitAddress` is kept and W's lines in `smoke.spec.ts` now call it.
- `r69k-index-seam` pinned the index's old call text; its expectations follow the two-phase index.
- `r62s-server` expected "All clear." for a place no alerts service reads (above).

## 9. Not done

- **The vault's writes an hour** is still the fixed clock hour that W4 replaced for listings, so 7,200 objects can land across a turn (found by W).
- **iNaturalist's matched-term name search** still takes iNaturalist's synonymy on another type when no inactive id is involved (round sixty-eight's rule); holding it to the same-type rule would cost right matches where GBIF records no basionym.
- **The provenance pill** for a GBIF refusal during the Wikidata proof still reads "Wikidata · refused"; the detail says GBIF's.
- **Callistemon lanceolatus and Ranunculus ficaria** stay without summaries: no structured proof ties them to Melaleuca citrina and Ficaria verna.
- **The Greenovia and Morella photographs** wait for older names from Kew.

## 10. Runs

- Unit: 3,180 passed, 0 failed (the merged tree, after P2). `tsc --noEmit` and `svelte-check` clean.
- Strict Chromium and phone (`node scripts/predeploy.mjs`): 468 passed, 5 skipped, every test first time, on the second run. The first run failed one test: `r62s-server`'s held forecast expected "All clear." for London, which P4 rightly makes "Forecast clear."; its expectation was changed at the merge.
- WebKit and Firefox are not installed in the sandbox; the owner's `--browsers=all` run is the check of P1 and P3.

## 11. The corpus step after the deploy

With the corpus backed up first, in this order:

1. `--fill inat-ids`, then `--fill inat` (B1, B5, B7). Ids refused by the new rules lose their id, link and photographs; each change is printed.
2. `--fill commons-kind`, then `--prune-uncredited` (C2, C3). About 90 Commons requests; a 429 stops it safely and a rerun resumes.
3. `--fill summaries` (A1, A2). Expect 77 records to change their proof's wording, 11 dropped and 4 taken back among the 108, plus Drosera montana dropped.
4. `--fill wikidata` (B2, B6), then `--list-rebuild --bulk bulk`, then rebuild `rebuild-wd.txt` and `rebuild-keys.txt` with `--keys <file> --grid climate --bulk bulk`. Expect Peperomia monticola and Othonna rosea to lose their items, Agave variegata to move to Q15523250, and Prunus persica and Oenothera fruticosa to be rebuilt.
5. `--index`, the two audits, the upload and the live check.

## 12. Round seventy-b: the owner's corpus step, and rules that reached too far

The owner deployed round seventy (its live check passed) and ran the corpus step on his corpus. Nothing was uploaded: the run showed four of the round's rules taking away what was right, and the corpus is restored from the backup taken before the step and the step run again on round seventy-b. The agents' reports are `review-70/{A,B,C,P}-70b.md`.

**iNaturalist (B).** `--fill inat-ids` refused 42 ids, and only 7 rightly (Drimia filifolia, Nepenthes angasanensis, Pinguicula chilensis, Ceropegia monteiroae, Cotyledon flanaganii, Drimia oliverorum, Stenocactus boedekerianus). The other 35 were this plant under iNaturalist's genus or spelling (Sprekelia formosissima as Zephyranthes formosissima, Psidium cattleyanum, Parodia erinaceus, Myrica as Morella), many losing 30 to 70 photographs. The triage's B1 had said to follow only to the species' own names; that was the triager's wording, and too strict. The rule is now R47's, with Kew after GBIF: a name that is not one of the species' own (compared by genus and `spellingKey`) is matched to GBIF's backbone and taken when GBIF holds it as this species, refused when GBIF holds it as another species here; where GBIF does not place it, Kew's WCVP decides by its synonymy; last, a genus transfer with this species' epithet is taken when no other species of the family here has that epithet. Over the 42: 7 refused, 34 kept, Tricyrtis formosana moved to its species' own taxon. Every one is a test.

**Ranges (B).** The rebuild of 118 lost thirteen native ranges to the Kew author rule (Datura metel among them, through a duplicate Kew row by the same author; Chionodoxa salbacus through Kew's "Yıldırım"). All thirteen are back; Ceropegia macrocarpa and Albuca longifolia stay without one, as intended. Ten species lost photographs in the rebuild, because media of species outside the bulk download were read as "none" from the files and NC records crowded the photo sample; both are fixed.

**Wikidata (B).** Scilla siberica had moved to another item, Hibiscus acetosella and Parrycactus flavovirens had lost theirs; all three are fixed, and the other changed items checked right. `--fill wikidata` now waits out Wikidata's lag and resumes, where it stopped at the first; a `--keys` file that does not exist is said so.

**Summaries (A).** The A2 rule refused any binomial in the species' genus; it now refuses only one GBIF holds as another species, or under a variety of this one (Drosera tomentosa stays out). Erythrina caffra ("Erythrina afra"), Rhododendron kanehirae ("kanehirai") and Sprekelia formosissima ("Zephyranthes formosissima", proved by Kew holding both as combinations of one basionym) are taken back. Matteuccia stays out: Kew sinks the genus into Onoclea. `--fill summaries` counted 234 "not checked" because one failed Wikidata batch marked every species with an item; a batch now fails alone, and the fill retries before counting. Of the 88 restored in round sixty-nine, 80 now keep a proof.

**Spelling (merge).** `spellingKey` reads a genitive in -ai after a consonant as -ae (kanehirai, shimadai; not bihai) and "caffr-" as "afr-", joining no two accepted species of the reference. Grouping the reference's names by key found one pair the rule had joined since the round began, Ceropegia ciliatior and Ceropegia ciliatioris: a comparative's genitive (-ioris) is no longer read as its gender.

**Commons (C).** `--fill commons-kind` left out 140 photographs; 88 of them wrongly. "Media from GBIF" says where a file came from, not what it shows, and is no longer a kind (numbered iNaturalist copies the dossier already holds count once). A "group" counts species of the reference through each species' own names and varieties, so two names of one plant are one, and a title naming only this species is no group. An animal's category hides a file only when its title does not name the species, so a flower with its visiting insect is shown. "Unidentified" is read only of a plant group or genus. The 52 still left out are each listed in `review-70/C-70b.md` with the rule.

**Engines (P).** The owner's every-engine run had 1,300 passed, 1 failed and 2 flaky, all in WebKit, and none of IND's Save flakes. All three are test faults, by P's reading: `r67p-pages:21` set its stand-in for the storage API on `navigator.storage` itself, where WebKit can drop it (it now sits on the prototype, as `r60`'s, which passes in WebKit, does); `smoke:791` waited 10 s for about 8 s of database work in WebKit and now waits 22 s there; `smoke:1377` passed by catching a passing state and now waits for the field's settled answer. The owner's next run is the check.

**Runs.** Unit 3,324 passed; `tsc` and `svelte-check` clean; strict Chromium and phone 468 passed, 5 skipped, every test first time.

## 13. Round seventy-c: the owner's second corpus run

The owner deployed round seventy-b (every engine passed first time: 1,303 tests), restored the corpus and ran the step again. It did what 70b meant: `--fill inat-ids` refused 9 ids where 70a refused 42, `--fill commons-kind` left out 52 photographs where 70a left out 140, the 13 ranges and the summaries 70a lost came back, and the photographs lost in 70a's rebuild came back. Nothing was uploaded, because the run found four more faults (`review-70/B-70c.md`):

- **Two spellings refused as other plants.** Echinocereus chisoensis (iNaturalist's "chisosensis", 78 photographs) and Othonna cakilefolia ("cakilifolia") were refused in the follow rule's last step. That step now reads the uploader's-slip rule the Commons code uses (one letter added, dropped, changed or moved, five letters or more, where no species of the reference holds the name and no other species of the family has the epithet), and `--fill inat-ids` gives back refusals of 70b's wording as of 70a's.
- **`--fill wikidata` would have taken right items away.** It listed 86 changes, most of them items refused because their IPNI identifier was not Kew's number for the name (Fragaria chiloensis, Leucanthemum vulgare, Salvia splendens and dozens more): IPNI holds duplicate records of one name. An item's IPNI now refuses it only when Kew holds that identifier for another author's name; one Kew does not hold is checked at IPNI itself, where a duplicate or isonym of this name proves the item. An IPNI written as a web address is read as its number, and an item's aliases count as labels (Fragaria virginiana's item is labelled "Virginia strawberry"). Over the 86 with the day's answers: 44 keep their item, 17 move (each to the species' own item; 70b's moves to a basionym's item are undone), 25 have none, 21 of those rightly (earlier items that were papers, homonyms, and Rubus parviflorus, whose backbone key is Kükenthal's homonym, not Nuttall's thimbleberry: worth a look in a later round). Four (Gunnera manicata, Salvia azurea, Agave ghiesbreghtii, Tulipa clusiana) are refused on the evidence that refuses Raphionacme linearis and Convolvulus cneorum, the item's own IPNI and GBIF record naming another author; by rule 3 all six stay refused.
- **Ixora coccinea showed Embothrium coccineum's range.** GBIF's backbone cites the species as "Comm. ex Lam.", which Kew holds as a synonym of Embothrium coccineum (Proteaceae); the live page shows Chile's range. Kew's rows are now read within the species' family, for the range and for IPNI.
- **Wikidata's lag dropped identifiers.** Four species of the rebuild lost item, POWO, IPNI and WFO when Wikidata lagged and the previous build's day was not known. The build now waits the lag out in rounds, and keeps identifiers of an unknown day, saying so.

The builder now asks IPNI itself (`www.ipni.org`, once a second), and `/about/how` says so. Talinella dauphinensis's nine photographs, dropped again, are pollen micrographs; the drop is right.

**Runs.** Unit 3,356 passed; `svelte-check` clean; strict Chromium and phone 468 passed, 5 skipped, every test first time.
