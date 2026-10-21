# Pending text for /about/how, round seventy-nine (the species list)

Written in round seventy-eight by agent S. **Not live.** `src/routes/about/how/+page.svelte` keeps its derivation
paragraph until round seventy-nine ships a corpus built from `scripts/species-list.txt`, because until then the live
reference is still today's 8,945 species and that paragraph is true of it.

## What it replaces

In the paragraph that opens "The species list was derived, not chosen by hand", everything from that sentence up to and
including "So a species that is not here is not a statement about the species, only about the list, and the list can be
extended by rebuilding with more names (the README says how)." The rest of that paragraph, from "The front page's
catalogue is the same on every device" on (the "Most grown" chip), is not about the list and stays as it is.

## The replacement

```html
<p>The species list was derived, not chosen by hand. It is the file <code>scripts/species-list.txt</code> in the source, written by <code>scripts/select-species.ts</code> on 19 October 2026, and it holds every species Kew's World Checklist of Vascular Plants accepts with at least three records of cultivated plants, plus every species Kew accepts of 173 collector genera taken whole (the cacti, the mesembs, the stapeliads and caudiciforms, the winter-growing bulbs and their like, less their hybrids; the list is <code>scripts/specialist-genera.txt</code> in the source), plus every species that was already in the reference, so that no page falls out: 48,357 species. Each page of the reference is the species of the Kew entry it cites, or of its name where Kew holds that name for one species alone; 26 species are here for that reason alone, and 15 pages whose names Kew's checklist does not place stay as they were, under their own names and GBIF's keys. The records are iNaturalist's observations marked captive or cultivated and GBIF's living-specimen records from living collections, counted together. GBIF's are counted only from datasets that a stated rule on each dataset's own description finds to be living collections: a dataset whose title, keywords, publisher or description names a genebank (a genebank, germplasm, a seed bank or seed collection, plant genetic resources or passport data, in the words of FAO's genebank standards) is left out; one whose title, keywords or publisher names a botanic garden, an arboretum, a garden or a living collection is counted; and any other, such as a register of street trees or a field survey, is not counted. The three lists are <code>scripts/counted-datasets.txt</code>, <code>scripts/excluded-datasets.txt</code> and <code>scripts/undecided-datasets.txt</code>. So the genebanks' 1.9 million records, most of them wheat, rice, barley and the other crops, count for nothing, and a crop is here by its growers' own records. No family is left out. Each name is matched to a species Kew accepts only where the match is unambiguous: every name of Kew's of those words leads to the same species; or GBIF's name and author lead to one; or, for iNaturalist, whose names of vascular plants follow Kew's Plants of the World Online, Kew accepts exactly one species of those words. iNaturalist lists where its names depart from Kew's, but that list could not be read, so those departures are not applied. Every name refused, and why, is in <code>scripts/species-refused.txt</code>, and each species' line in the list says why it is there: its two counts, or its collector genus. The very large genera are not taken whole, and their species are here by their own records: Aloe has 199 of the 611 species Kew accepts, Euphorbia 401 of 2,118. So a species that is not here is not a statement about the species, only about the list.</p>
```

## Why each claim is true of the code

- "every species Kew … accepts with at least three records": `select()` in `scripts/select-species-lib.ts` takes an id
  when `inat + gbif >= MIN_RECORDS` (3), every id being Kew's accepted species (`speciesOf` returns only rows of status
  Accepted and rank Species, an artificial hybrid never).
- "173 collector genera taken whole … less their hybrids": `collectorSpecies()`, Kew's accepted species of the genera in
  `scripts/specialist-genera.txt` (173 lines), a row with a hybrid sign left out, as `derive-names.ts` did.
- "every species that was already in the reference": `referenceSpecies()` maps each page of the corpus on disk
  (`--reference`, the pages of `scripts/merged-pages.txt` left out) to Kew's species by its cited entry, else its name
  by the strict rule; `select()` adds every species so reached, and each page reaching none as an entry with no Kew id
  (`-`, its own GBIF key, page id `g<GBIF key>`). "26 … for that reason alone" and "15 pages": the header's `Selected:`
  and `The reference:` lines.
- "48,357 species", "19 October 2026": the list's header (`Selected:` line, and the day it was written). If round
  seventy-nine runs `scripts/select-species.ts` again, every figure is read from the new header. A rerun against round
  seventy-nine's corpus keeps every page of it, by the same clause.
- The dataset rule: `classifyDataset()`; its sentence is `DATASET_RULE`; the word lists `GENEBANK_WORDS` and
  `LIVING_COLLECTION_WORDS` ("garden" is among the latter). The three files are written by `scripts/select-species.ts`.
- "the genebanks' 1.9 million records": `scripts/excluded-datasets.txt`, "This side: 52 datasets, 1,872,568 records";
  wheat 228,642, rice 191,369, barley 154,709 of them (`bulk/select/scores.tsv`).
- "No family is left out": `scripts/excluded-families.txt` is not read by `select-species.ts`.
- The matching: `matchStrict()` (rule 3, and "author" for GBIF) and `matchInat()` (the framework clause); the
  deviations are not applied because `--deviations` was not given (the list's header says so).
- "Aloe has 199 of the 611 … Euphorbia 401 of 2,118": counted from `scripts/species-list.txt` and Kew's accepted
  species in `wcvp_names.csv` of 2026-06-04, nothospecies counted on both sides (round seventy-nine: the text of round
  seventy-eight gave 593 and 2,077, Kew's species without a hybrid sign, against the list's 199 and 401, which count
  Aloe's 3 and Euphorbia's 5 nothospecies; Kew accepts 18 and 41).

## Other sentences of /about/how this makes untrue in round seventy-nine

- "The very large genera are not taken whole, and only the species of theirs that reached the cultivated count are here:
  Aloe (9 species, of the several hundred WCVP accepts), Euphorbia, …": replaced above.
- "Ceropegia is taken whole, and since the names the list was derived from counted Brachystelma and the stapeliads … as
  Ceropegia, most of their species are here under that name. Kew's checklist now accepts most of the stapeliads in their
  own genera again: about 280 pages here carry a Ceropegia name …": the list names each species by Kew's accepted name,
  so the stapeliads are listed under Huernia (77), Orbea (60), Stapelia (31), Caralluma (30) and the rest. Whether a
  page still carries a Ceropegia name depends on how round seventy-nine names pages (agent I's ids); the sentence must be
  rewritten with that, or dropped.

## Added at the merge of round seventy-eight (agent M)

- **The build's route, as merged.** `scripts/build-dossiers.ts` builds each species of the list by the GBIF key on its
  line and `--index` names its page by Kew's id (agent I's rule). A species the list gives no GBIF key (2,316 of 48,357, since round eighty left out 11 that a reference page holds through its range)
  is built only where a page on disk already has its id (`k<plant_name_id>`); otherwise it is left out and the build says
  how many, never matching its name (rule 3), since every page today needs a GBIF key (`ids.gbif`). So round
  seventy-nine's reference holds at most about 46,000 of the list's species unless it first makes `ids.gbif` optional.
  The paragraph above is true of the list; if it is put live while those species are not built, a sentence must say
  how many species the reference holds and why the rest of the list is not there yet, read from the build's line
  "… with no GBIF key in the list and no page on disk under their id are not built".
- **Ceropegia.** A page is named by the GBIF key it is built from: today's pages keep their own keys (the list gives a
  species held by one page that page's key), so the pages that carry a Ceropegia name today keep it, and a new species
  takes the backbone's name for the key the list gives it.

## Added in round seventy-nine (agent K)

- **The 2,316 are built now.** `ids.gbif` is optional (dossier version 3 still), and a species the list gives no GBIF key
  is built from Kew's file by its plant_name_id (`src/lib/dossier/build-kew.ts`), GBIF's records not asked. The build
  says "… with no GBIF key in the list … built from Kew's file by their plant_name_id, GBIF's records not checked", so
  the sentence the merge note above asks for is not needed: the reference holds the whole list, less any plant_name_id
  the build reports Kew's file no longer accepts. `/about/how` says what such a page holds in its own paragraph
  (`#no-gbif-key`), live since this round, which the paragraph above need not repeat.

## Round seventy-nine: ready for the merge (agent F)

The paragraph is not put live by hand. `scripts/about-how-r79.mjs` writes it with the figures the build reached:

- `node scripts/about-how-r79.mjs` says what it would write and changes nothing: the list's species, how many of them
  the corpus on disk holds (`static/s/v3/index.json`: a species is held when a page has its Kew id, or for a line with no
  Kew id its GBIF key), and Aloe's and Euphorbia's held species.
- `node scripts/about-how-r79.mjs --write` writes it into `src/routes/about/how/+page.svelte`, replacing exactly the part
  named above with the block above, a paragraph of its own, and keeping the "Most grown" part as it is, as the next
  paragraph. Where the reference holds fewer of the list's species than the list,
  it refuses unless `--why "<words>"` gives the reason, as the build's own line says it; the paragraph then says "The
  reference holds N of them; the other M are not here yet: <words>." Aloe's and Euphorbia's counts are then the held
  ones.
- Every figure but Kew's two totals is read from the list's header and the index; the totals are of `wcvp_names.csv` of
  2026-06-04, and the script refuses a list selected from another day of Kew's file.
- It refuses, writing nothing, with no index, with an index holding none of the list's species (the fixture corpus, or
  round seventy-eight's), or when the page's paragraph has changed since round seventy-eight.

The block above says "the list is `scripts/specialist-genera.txt` in the source", as the live sentence does, since
`tests/unit/r70p-about-seams.test.ts` reads the file's name from those words; `tests/unit/r74-growers.test.ts` accepts
either paragraph. With every species of the list held, it writes exactly the block above (`tests/unit/r79f-about-how.test.ts`). The
merge runs it after the build's `--index`, on the corpus to be uploaded, and commits the page with the deploy that
serves that corpus; the Ceropegia sentence goes with the replaced part.
