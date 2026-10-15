# Round seventy-one: the fixes from the self-review of round seventy

Round seventy-one acts on the self-review of the deployed round seventy (`76dcd55`, corpus `0c2959d95b5883d2`): six internal reviewers, `REVIEW-TRIAGE-70.md` and `review-70/self-A.md` to `self-F.md`, together with the issues the round's corpus step left open. The same six reviewers then fixed their own areas, each owning its files; the merge applied their needs to one another (`review-71/merge.md`), and F rewrote the about pages from every agent's sentences, checked against the merged code. The agents' reports are `review-71/A.md` to `F.md`.

`FOLD_RULES` stays 8 and the device database stays at version 4.

## 1. Ranges and identifiers (B)

- **Kew's families.** Round 70c's family rule compared a row's own `family` column, and Kew files a synonym or invalid row under its genus's family, not its accepted entry's; the 70c test had been built from GBIF's copy of WCVP, which does the opposite. The rule now reads the family of the entry a row is filed under. Over all 8,947 species on Kew's real files, this changes Ixora coccinea (Embothrium coccineum's three Chilean and Argentine regions become Kew's seven for Ixora coccinea L.) and nothing else.
- **An own row filed under a subspecies** gives way to the species entry Kew accepts: Fragaria virginiana's range goes from 45 regions to 66.
- **Where a range comes from.** A range taken from Kew's entry for another name now says so ("Kew holds X as a synonym of Y; the range is Y's"): 476 pages, six of them another reference species' range (Ceropegia melanops, Copiapoa boliviana, Coryphantha macromeris, Drosera parvula, Echeveria sessiliflora, Weingartia pulchra). A new offline `--fill range-source` writes it, since the range itself does not change.
- **`--list-rebuild`** compares the stored native regions with the rule's, as well as the rule's entry with round sixty-nine's, so a stale page is listed whatever made it.
- **Species on a homonym key.** The reference keeps its keys (a remap to other keys is the owner's decision for later). Where the key's author is plainly not Kew's accepted entry for the words and GBIF holds the name by Kew's author elsewhere (Rubus parviflorus, Myrica cerifera, Myrica rubra, Stapelia grandiflora, Piaranthus punctatus, Weingartia steinbachii and others), the page shows Kew's author and reads synonyms and common names from GBIF's usage by that author, and says so.
- **IPNI and POWO links** are Kew's number for the name and author, read through GBIF's copy of WCVP (`--fill kew-links`), never an item's number Kew holds for another author.
- **Wikidata.** An item whose POWO number is Kew's for this name and author is proved. The eight refusals of round 70c on another author's name are reversed (Raphionacme linearis, Convolvulus cneorum, Gunnera manicata, Salvia azurea, Agave ghiesbreghtii, Tulipa clusiana, Peperomia monticola, Othonna rosea); Albuca longifolia, whose item carries Baker's POWO, stays refused.
- **The lag.** Identifiers kept "of a day not known" are now seen by the drops audit and the rebuild list, and kept no longer than the 90 days; a carried row names the day it was read.
- **GBIF's media** are taken only from human observations; `--fill gbif-basis` reads each stored GBIF photograph's record and drops the rest (herbarium scans, a drawing, pollen micrographs).

## 2. Summaries (A)

- Under a title other than the name, a summary is published only when this run read its proof or its record names one, and the build no longer carries one forward without it. Drosera montana's "Drosera tomentosa" and Coryphantha macromeris's "Pelecyphora macromeris" go.
- The basionym proof needs another item (the "basionym of Q278283 and Q278283" records). A binomial is another species only when GBIF holds it as one and Kew holds a row of it, so five right articles GBIF holds under a second spelling come back. The product and genus proofs need the species itself. An IPNI proof restores Rosa luciae ("Rosa lucieae") and proves Ariocarpus scaphirostrus.
- **`--fill summaries` can finish.** It reads Wikidata without `maxlag` (the lag Wikidata reports is its query service's, which has nothing to do with reading items), names each species it could not check with the source that did not answer, asks again at 10, 30 and 70 minutes, and does not ask again what a run has settled unless given `--again`. On 228 live dossiers it left none not checked.
- **`spellingKey`** reads gender only within one declension, so Euphorbia peplus and peplis are two names.

## 3. Photographs (C)

- Maps in any language ("Areale"), herbarium sheets by category, comparisons of two plants, and GBIF media flagged `specimen` (from B's basis of record) are not shown or do not lead.
- A year in a title hides a file only with other evidence of print, so living-plant series that cite a description's year are shown.
- A Commons copy of an iNaturalist photograph the page already holds is shown once.
- **The slip rule** asks the world, not the reference alone: a name Kew accepts, or files under another plant, is never a slip; one GBIF accepts is a slip only if GBIF files it under this species or it is the same name and author spelt otherwise. One rule (`slipStanding`, `askSlip`) for iNaturalist and Commons. A slip not yet asked is not shown until the build or `--fill commons-kind` asks, so about 3% of Commons files are hidden from the deploy until the fill runs.
- The group rule's two faults (a group whose title holds the epithet's stem; Commons' diffused categories) and derivative-work credits are fixed; the fill's count includes the credit rules.

## 4. The grower's data (D)

- **Import.** A new line with an extra column left empty is offered as a new plant again (a regression of round seventy); deleting a column no longer re-offers a plant without a word; two like plants told apart by an added column are both found. A sheet of year-first short dates is asked with a "Year first" choice, and every choice shows the year it reads.
- **Restored changes this version cannot read** are queued for sync at the first load of a version that reads them, after Merge, Replace or setting up sync.
- **Mutation survivors** in the clock, the snapshot and the import key each have a test.
- A tab opened while another holds the clock correction in force still waits for its own reading; `/about/formats` says so.

## 5. The server and sync (E)

- St Lawrence Island (Gambell, Savoonga) and St Paul Island are asked of the National Weather Service.
- The log listing runs under `waitUntil`, so a listing the client leaves is still counted; a vault's writes are counted over any sixty minutes, as listings are.
- The sync page's refusal notice says what each kind of refusal holds back; a shorter refusal no longer replaces the day's allowance; the minute retry runs only while the page is in view and backs off after timed-out photographs; the keep-data answer is shown.

## 6. Pages and the account (F)

- An older name that is another species' accepted name is shown with its author, under "Under another author", and the `?was=` notice no longer says GBIF accepts this species as it.
- A range that disagrees with every record shows the records and says so.
- The false "iNaturalist taxon: not asked" banner goes (`fillInatIds` records what it checks and keeps).
- 807 tiles of "no rights reserved" photographs carry "CC0"; the group chip is labelled; a redirect from a variety's name says why; a name held pro parte reads so on its 404.
- The about pages are rewritten for every change above, each sentence checked against the merged code; the seam method now drives the sentences written in 70b, 70c and this round (`r71f-about-70bc`, `r71f-about-71`).

## 7. Not done

- **A remap of the species on homonym keys** to the familiar plants' keys (Rubus parviflorus to Rubus nutkanus, Ranunculus ficaria to Ficaria verna, Myrica cerifera to Morella cerifera) is the owner's decision; this round shows Kew's author instead. The reference also holds two pages for one plant, Coryphantha macromeris and Pelecyphora macromeris.
- `spellingKey` still joins Anthurium lanceum and lancea, which Kew accepts apart.
- Generic headlines in search ("Cactus") are left as they are.

## 8. Runs

Unit 3,643 passed, none failed; `tsc` and `svelte-check` clean; about-page browser specs 45 passed. Strict Chromium and phone: 472 passed, 5 skipped, every test first time. WebKit and Firefox are the owner's run.

## 9. The corpus step after the deploy

Back up the corpus first. In order:

1. `--fill gbif-basis`, then `--fill gbif-open` and `--fill commons` for any species left with no photograph.
2. `--fill commons-kind` (about 90 Commons requests and two GBIF requests for each slip name).
3. `--fill range-source --bulk bulk` (offline; about 476 ranges say whose entry they are).
4. `--fill wikidata` (the eight refusals taken; `rebuild-wd.txt`).
5. `--list-rebuild --bulk bulk` (about 59 species, Ixora coccinea and Fragaria virginiana among them).
6. `--keys rebuild-wd.txt` and `--keys rebuild-keys.txt`, each with `--grid climate --bulk bulk`.
7. `--fill kew-links` (about 8,400 requests, 35 minutes, resumable).
8. `--fill summaries --again`, then `--fill summaries` until it names none.
9. `--index`, read `drops.txt`, upload, live check.
