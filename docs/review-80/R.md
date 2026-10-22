# Round 80, agent R: the not-checked pages and the institution references

Branch `r80` in `/tmp/claude-0/rev80/R/`, six commits on `r80base` (7853574 to 431765b). Scratch is `/tmp/claude-0/rev80/R-s/`; `NOTES.md` there records the steps.

## Done

**1. Why the 912 read no key, classified.** I traced the rule (`scripts/dev/scale/r80r-why-unkeyed.ts`) on Kew's file, the list and round 75's backbone export (`/tmp/claude-0/rev75/S-s/backbone/simple.txt.gz`). For each page it records every GBIF usage of every name Kew gives the plant: taken, refused (with the rule's own why), or passed over in silence. That gives 47,000 usage lines in `R-s/why/why-unkeyed.tsv`. The rerun gives none of the 912 a key, as round 79 found. The classes are under Measured. In short:

- **647 lumped.** Example: Echinocereus canus under E. viridiflorus.
- **211 none.** The backbone holds none of Kew's names for the plant.
- **45 other-type.** Only heterotypic names, sometimes with pro parte ones.
- **8 other-author.**
- **1 other.**

**2. A route to records for each class: none found.** I found no route that is unambiguous under the rule as it stands:

- **Lumped.** The records are on the other page already. GBIF's taxonKey filter on the holder's key includes them: Echinocereus viridiflorus gives 6,898 records alone and 6,898 together with E. canus's key. Reading them here as well would put one record on two pages.
- **None.** There is no key at all, and a name match is refused.
- **Other-type and pro parte.** These are refused by the owner's round 73 decision and by GBIF's own status.
- **Other-author.** Taking these would need an author equivalence that Kew's file does not state ("St.Hil." for "A.St.-Hil.", "van Keppel" for "Keppel"). Six of the 8 are lumped under another page anyway.

There is one real route, but it needs an owner's decision, so it is offered and not built. A lumped page could take its own-type names' records, and the other page would leave them out record by record, as `except` already does. That is measured under Measured: 509 pages would gain records, and the download would not grow.

**3. Each of the 912 now says why, in plain words.** The general sentence is replaced by the page's own reason:

- **The reason:** `noKeyFor` (`src/lib/dossier/extra-keys.ts`) reads it by the rule's own steps (it calls `extraKeysFor`); `noKeyWhy` (`src/lib/core/no-gbif.ts`) words it, naming every reason a page has, never "only" one.
- **The words, for example:**
  - Echinocereus canus: "GBIF's backbone files this species' own names (Echinocereus canus (A.M.Powell & Weedin) D.Felix & H.Bauer; Echinocereus viridiflorus var. canus A.M.Powell & Weedin) under Echinocereus viridiflorus Engelm., a species with its own page here, which Kew's World Checklist accepts apart from this one: GBIF lumps what Kew splits; GBIF's records under those names are on that page, and a record is shown on one page only, so they were not asked for this one".
  - Where the other page has no Kew id, the "Kew accepts … lumps what Kew splits" clause is left out, since it would not be sourced.
  - "none": "GBIF's backbone holds none of the N names Kew's World Checklist gives this species, so there is no GBIF key to ask its records by, and no name is matched to GBIF".
- **The file.** `scripts/kew-extra-keys.ts` now also writes `scripts/extra-keys-kew-none.txt` (committed, 912 lines). Each line gives the page id, the kind, and as JSON: Kew's names counted, GBIF's names, and each holder page's key, list name and whether Kew accepts it. I reran the script; `scripts/extra-keys-kew.txt` came out the same apart from its date line, so I restored it unchanged.
- **The dossier.** It gains an optional `occurrences.unread` field (`{ kind, why, under: [{ key, name, page }] }`) in version 3's schema.
  - `buildKewDossier` takes `noKey` (`unreadOf`) and writes the reason into `gbif.occurrences`, the climate's detail and `occurrences.unread`.
  - Without the file it writes exactly what round 79's build writes (tested).
- **The build** (`scripts/build-dossiers.ts`):
  - it reads the file (`--kew-no-keys` names another) and passes `noKey` with `idOfGbif`;
  - `--fill kew-why` (`fillKewWhy`) writes the same words into stored pages offline. It passes by any page that reads keys or has a GBIF key, and a second run changes nothing.
- **The site:**
  - The species page says `uncheckedWhy(d)` in all six not-checked places: the evidence line, the climate pill, the cultivation box, `#no-gbif-climate`, the map caption and `#near-not-checked`.
  - A new `#kew-held-under` line links the pages GBIF files the names under. The server resolves their ids to slugs (`heldUnder`).
  - Compare says the page's own reason too.
  - The plant page still says the general sentence, because it holds a sheet, which has no `occurrences` (Not done).
- **About pages** (each checked against the code):
  - `/about/how` `#no-gbif-key` gains one sentence after "…with why, never "none".", beginning "The why is the page's own, read by the same rule from what GBIF's backbone holds of Kew's names for it", naming the five reasons and the link. No existing sentence became untrue.
  - `/about/formats` gains the `occurrences.unread` sentence after the keyless dossier's "…never none."
- **The owner's plan.** `scripts/corpus-plan-r80r.txt` runs a backup, `dossier --fill kew-why`, a review, the upload and the live check.
- **Round 79's build is unchanged.** Its code reads none of this. The new file is read only by round 80's code, and the reasons reach the corpus only through the fill or a later build.

**4. A fault in round 79's build path, sent to X at once (through main).** The list holds 11 plants twice. Each is a legacy page (Kew id "-", "already in the reference") whose own range reads a Kew entry, plus a keyless line for the same entry. The legacy page's `name.kew.entry` is "", so the page-id rule gives it `g<key>` and never sees the pair. Round 79's build will publish both pages, one with GBIF's records and one "not checked": Harpephyllum caffrum and afrum, Tylecodon cacaliodes and cacalioides, Monsonia lheritieri and Sarcocaulon spinosum, and eight more. Two more are likely but not proven (Bisnaga hamatacantha and Ferocactus hamatacanthus; Ceropegia macrocarpa and Huernia macrocarpa). All the keys and ids are in `scripts/dev/scale/results/r80r-not-checked.txt`.

I sent one more finding with it. The list page "Gymnosporia acuminata Hook.f. ex M.A.Lawson" holds key 3791985, GBIF's "Gymnosporia acuminata (L.fil.) Szyszyl.". Kew files that name as a homotypic synonym of the keyless Maytenus acuminata (k2360109), so that page reads the other species' records.

**5. Licences of the institution lists, from the publishers' own pages:**

- **GBIF's GRSciColl:** no licence stated, on scientific-collections.gbif.org's About and FAQ pages (only their photographs carry one), gbif.org/terms (occurrence datasets only), the GRSciColl paper or the API's answers. Unused; a letter is below.
- **Index Herbariorum (NYBG):** no licence for the data on the IH page or the API's README and wiki. The footer's NYBG Terms and Conditions, which cover the site's "data feeds", allow use "solely for your personal, non-commercial, educational use" and forbid copying or systematic download without "NYBG's express prior written consent". Not usable; a letter is below.
- **BGCI GardenSearch:** terms are stated and exclude us: the Data User Agreement says "Data Users will not use data obtained from BGCI Data Tools for commercial purposes" and "will not copy and/or share any data obtained with anyone else". No letter.
- **Others:**
  - GeoNames is CC BY 4.0 (its about page and dump readme). It is measured below.
  - ROR is CC0, but its coordinates are GeoNames' city points, not the institutions' own sites.
  - OpenStreetMap is ODbL, which is not CC0, CC BY or public domain.
  - CoordinateCleaner's list is GPL, as Q found.
  - Wikidata's herbaria that state no coordinates of their own but are "part of", "parent organisation" or "location" of an item that has coordinates: CC0, measured below.

**6. Nothing implemented for the institution rule.** No list that is CC0, CC BY or public domain holds herbaria with coordinates of their own. The CC BY and CC0 candidates measured either catch little or catch wild records (Measured), and taking a university's point for its herbarium is the inference Q refused. `scripts/institutions.txt` and `/about/how` are unchanged. The measure is `scripts/dev/r80r-places-measure.ts`.

**Tests.** `tests/unit/r80r-no-key.test.ts` (14 tests):

- the five kinds, on rows;
- null when the rule gives a key;
- several reasons named together;
- the words, including no "lumps" for a holder without a Kew id;
- the file read back;
- the committed file's 912 lines and their kinds;
- the builder's words, and the guard that without the file it writes round 79's words;
- the fill (writes, passes keyed pages by, changes nothing on a second run, reverts when a page leaves the file);
- `unreadOf`;
- the pages' and build's wiring, the about pages and the plan.

On `r80base` all 14 failed ("noKeyFor is not a function"), in a worktree of r80base (since removed). `r79m-kew-keys.test.ts` has two expectations updated to the changed source (the map caption's `${noWhy}`, and the builder call's `noKey`).

**A real build** of four species (one each of lumped, none, other-type and other-author), asking Wikidata, Wikipedia and Commons live, wrote each page's own reason (`R-s/live/`).

## Needs

- **X (round 79's build path):** the 11 duplicate pairs and the Gymnosporia homonym above, sent through main. The smallest fix is to drop the 11 keyless lines from `scripts/species-list.txt`, since the live legacy page already holds the plant, GBIF's records and Kew's range. The other way is to give the legacy pages their Kew entry. Both are for X and the owner to decide; I changed nothing.
- **The merge:** `scripts/corpus-plan-r80r.txt` can be folded into one round 80 plan with N's and V's fills. Its review line's counts are mine. `scripts/build-dossiers.ts` changes are three small blocks (the reader of `KEW_NO_KEYS` after `kewExtra`, `noKey` in the Kew builder call, and `--fill kew-why` with its step).
- **N, V:** nothing.

## For the owner's PC

After round 79's upload and live check:

1. Deploy round 80's Worker (`node scripts/predeploy.mjs --tier=app`, then `node scripts/corpus-ready.mjs && npm run deploy`). Round 79's Worker drops the unknown field and shows the general sentence, so either order is safe.
2. Run `node scripts/corpus-step.mjs --plan scripts/corpus-plan-r80r.txt`, and the same with `--go-on` at its review. It takes seconds of fill, then `--index`, the upload and the live check.
3. Good output: "912 pages without a GBIF key read no key; 912 changed: 647 lumped, 211 none, 45 other-type, 8 other-author, 1 other say why for themselves", about 912 dossiers differing from the backup (all `k` pages), and the index count unchanged.
4. On the site, `/species/echinocereus-canus` names and links Echinocereus viridiflorus.

DEPLOY.md, "Round eighty: the not-checked pages and the institution references", has this. No GBIF download changes.

**Letters to send** (addresses left for you to fill in):

> Subject: Licence of GRSciColl's institution and collection data
>
> Dear GRSciColl team,
>
> I run Cultifolio, a free reference of cultivated plant species built only from openly licensed data, GBIF's occurrences among them. Before a species' wild range and habitat climate are derived, we leave out records within 1 km of botanic gardens, herbaria and zoos, since such records are mostly planted plants or specimens placed at the herbarium that keeps them. Our list of those places is Wikidata's (CC0), which misses many university herbaria; GRSciColl holds them.
>
> We could not find a licence for GRSciColl's data on scientific-collections.gbif.org (its About and FAQ pages), on gbif.org/terms, or in the API's answers. Could you tell us under what licence the institution and collection records, in particular their codes, names and coordinates as the API and its export give them, may be reused? We can use them only under CC0, CC BY or a public-domain dedication, and would credit GRSciColl and GBIF on our methods page. If entries whose master source is Index Herbariorum carry its terms instead, it would help to know that too.
>
> With thanks,
> [your name], Cultifolio, [your address]

> Subject: Reusing Index Herbariorum's herbarium coordinates under an open licence
>
> Dear Index Herbariorum editors,
>
> I run Cultifolio, a free reference of cultivated plant species built only from openly licensed data. Before a species' wild range and habitat climate are derived from GBIF's occurrence records, we leave out records within 1 km of herbaria, botanic gardens and zoos, since a specimen is often placed at the herbarium that keeps it. Index Herbariorum's herbaria export would let us place the herbaria that our current list (Wikidata) misses.
>
> We would use only each herbarium's code, institution name and coordinates, keep them in our openly published code, and credit "Index Herbariorum, New York Botanical Garden" with the citation you give. We found no licence for Index Herbariorum's data on its pages or in the API's documentation, and NYBG's site terms allow only personal, non-commercial use. Would NYBG release the herbaria export, or those three fields of it, under CC0 or CC BY 4.0, or give us permission to reuse them under one of those terms?
>
> With thanks,
> [your name], Cultifolio, [your address]

## Measured

**The 912, by `noKeyFor`** (`scripts/dev/scale/results/r80r-not-checked.txt`; `R-s/why/` has the usage-level trace):

- **Lumped, 647:**
  - 638 by the plant's own name or a name of its type; 9 by names of another type only;
  - examples: Echinocereus canus under E. viridiflorus, Allium burdickii under A. tricoccum, Dactylorhiza fuchsii under D. maculata (as a subspecies);
  - 18 of the 647 are filed under a legacy page with no Kew id, 11 of those being the duplicates above.
- **None, 211:** examples are Aeonium calderense, and Boswellia oropedionis from K's sample.
- **Other-type, 45:** 39 heterotypic only, 5 with pro parte synonyms, 1 read to two plants. Example: Aristolochia vaginans.
- **Other-author, 8:** for example Drosera ascendens, "St.Hil." against Kew's "A.St.-Hil.". GBIF's API (8 requests) shows 6 of the 8 filed under another page here anyway.
- **Other, 1:** Dinteranthus wilmotianus, an autonym GBIF does not place.

Round 79's split (633, 42, 17, 220) differs because a page with any lumped usage is "lumped" here, and silent author mismatches are not "no usage".

**Pages given records by this round's change: none. Growth of GBIF's download: none.**

**The option not taken** (a lumped page reads its own-type names' records, which the other page then leaves out), by GBIF's count API with the download's filter, one request a second, 2026-10-21, about 30 minutes:

- 1,565 keys on 638 pages, 884 of them holding records;
- 509 pages would gain records, 118 with 1,000 or more and 387 with 12 or more; the median page would gain 33;
- 958,969 records in all, 287,988 of them human observations with images, all taken off the other pages;
- the download grows by nothing, since the other page's key already holds them;
- the largest: Dactylorhiza fuchsii, 311,790 records under "D. maculata subsp. fuchsii" and 121,298 under "D. fuchsii (Druce) Soó"; Heracleum sibiricum, 48,828 and 22,919.

It is a taxonomic change to about 640 keyed pages, which the owner's decision of 2026-10-20 kept as it is.

**Institution lists on round 77's 1,128,880 kept points.** Wikidata's places catch 20,701. CoordinateCleaner's 1 km institution test flags 12,514 that Wikidata misses (`R-s/gn/measure.txt`). Beyond Wikidata's:

| List | Licence | Places | Points | Share of CoordinateCleaner's 12,514 |
|---|---|---|---|---|
| GeoNames zoos (S.ZOO) | CC BY 4.0 | 489 | 258 | 0.2% |
| GeoNames gardens (S.GDN) | CC BY 4.0 | 2,547 | 2,059 | 2.7% |
| GeoNames universities (S.UNIV) | CC BY 4.0 | 1,531 | 3,457 | 12.5% |
| GeoNames colleges (S.SCHC) | CC BY 4.0 | 3,632 | 4,548 | 9.3% |
| Wikidata herbaria at their parent item's point | CC0 | 269 | 916 | 6.3% |

Why none is used:

- **GeoNames zoos.** Tierpark Biel-Bözingen's 74 points are wild Swiss woodland plants (Lilium martagon, Galium odoratum).
- **GeoNames gardens.** 884 of the 2,547 are Armenian orchards and plots, many more are Iranian bāghs and Italian public gardens, and one is a garden shop. The points they catch are mostly at Sydney's suburban bush gardens (631 in Australia).
- **GeoNames universities and colleges.** Campuses, not herbaria.
- **Wikidata's parent items.** The point is the parent's: the Russian Academy of Sciences in Moscow, a city such as Berlin or Kassel, a university's central building.

Only 592 Wikidata items carry an Index Herbariorum code, and 240 of them have coordinates. GRSciColl, measured by Q, would add 10,898 points.

**Runs.**

- `tsc --noEmit -p .`: 0 errors.
- `svelte-check --threshold error`: 0 errors, 0 warnings.
- The scripts' `tsc`: only the base's `judged` errors in my files.
- The new unit file and `r79m-kew-keys`: 23 passed.
- The whole unit suite, once, alone: 456 files passed and 1 skipped; 4,288 tests passed and 8 skipped, 0 failed (533 s).

## Not done, with why

- **The option of moving the lumped pages' records.** Not built: it changes about 640 keyed pages, and the owner kept the rule on 2026-10-20. It is measured above, for him to decide.
- **The plant page's reason.** It holds a sheet, not the dossier, and the sheet carries no `occurrences`. Saying the page's own reason there needs a field in the sheet product, which is Z's format, so it says the general sentence as before.
- **No browser test.** A keyless lumped fixture would add a sixth species to the fixture corpus, which a dozen tests count, and the existing keyless fixture reads keys under round 79's rule, so giving it a reason would be untrue. The wiring is checked in the unit file, and the real build above wrote the words; the rendered page was not seen in a browser.
- **GRSciColl and Index Herbariorum.** Not used until a licence is stated (letters above).
- **The duplicates and the homonym.** Not fixed here: they are X's.
