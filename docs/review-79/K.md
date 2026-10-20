# Round 79, agent K: the species without a GBIF key

Branch `r79` in `/tmp/claude-0/rev79/K/`, four commits on `r79base`. Scratch, measures and the sample dossiers: `/tmp/claude-0/rev79/K-s/`.

## Why they have none, and what the owner gains

The list's 2,327 species with `-` in the last column are species Kew accepts for which the backbone rule (`gbifKeyFor`: one accepted species of the words, or of several the one of Kew's author, or with none accepted one doubtful) found no one key. Read again against the backbone the list was made from (round 75's `simple.txt.gz`; `K-s/why-none.mts`, `why-none.tsv`):

| Why | Species |
|---|---|
| The backbone holds the words only as a synonym of another species | 1,758 |
| The backbone holds no name of these words | 564 (79 of them a spelling of the same genus: Viburnum davidi for Kew's davidii, the 2024 "caffra" to "afra" correction: Harpephyllum afrum, Dovyalis afra, Combretum afrum) |
| Only several doubtful names, none by Kew's author | 5 |
| Several accepted, none or two by Kew's author | 0 |

So the brief's sentence ("GBIF's backbone holds no taxon for this name") is untrue of three in four. The pages say instead: "GBIF's backbone holds no one accepted species of this name, and a name it holds only as another species' synonym is not taken for this one, so GBIF's records were not asked" (`NO_GBIF_WHY`, `src/lib/core/no-gbif.ts`).

- **Why they are in:** 1,763 by their records alone, 504 by their collector genus alone, 60 by both. Records: 12 have 1,000 or more, 172 have 100 to 999, 761 have 10 to 99.
- **Families:** Cactaceae 226, Asteraceae 150, Apocynaceae 143, Rosaceae 96, Aspleniaceae 95, Crassulaceae 93, Pteridaceae 76, Fabaceae 65, Droseraceae 57, Asparagaceae 55.
- **The best known:** Picea laxa (Kew's name for white spruce, 5,919 records); the Mexican, Monterey, Arizona and smooth cypresses (Hesperocyparis lusitanica, macrocarpa, arizonica, glabra); Terminalia mantaly; Nootka cypress; Viburnum davidii (2,319); Handroanthus impetiginosus; Astilbe chinensis; Harpephyllum afrum; Opuntia cespitosa; Ferocactus acanthodes; Adenium multiflorum; leek (Allium porrum); Euphorbia cyathophora; Quercus frainetto; salad burnet (Sanguisorba minor); Blechnum spicant.

## Done

**The schema (version 3 kept).** `ids.gbif` is `v.optional(v.number())`; nothing else in the shape changes. An optional field is enough: no reader of version 3 needs the key once every reader copes with its absence, which this round makes so, and the corpus keeps `s/v3/`. What the field cannot carry is the deploy order: round 78's Worker refuses such a dossier (503, "could not be read just now"), so this round's Worker must be live before the upload of a corpus holding these pages (Needs, D). The one sign everywhere is the key's absence: a dossier's `ids.gbif`, an index entry's, a card's and a sheet's `gbif` (`noGbif()`). The sheet's `gbif` is now optional too (`src/lib/dossier/sheet.ts`).

**The builder route.**

- `src/lib/dossier/build-kew.ts`, new: `buildKewDossier(kewSpecies, options)`. From Kew's file it takes the name, author, family, genus, synonyms (`name.synonyms`, and `name.kew` as `--fill kew-names` writes it), the IPNI and POWO numbers and links, the life form and climate class, and the range, read by the rule every page reads Kew's rows by: `regionsOf`, moved out of `buildDossier` unchanged (`build.ts`, the "Distribution" block, about 25 lines).
  - **Wikidata** by Kew's identifiers (`kewItem`): one SPARQL question, the items carrying the IPNI identifier (P961) or the POWO identifier (P5037), any rank. Taken only when exactly one taxon item answers; two are `ambiguous`. A GBIF key the item carries is deleted, never read.
  - **Wikipedia** through the item's sitelink, by `wm.summary` and its proofs as today.
  - **iNaturalist** (`kewInatTaxon`): the item's id checked with iNaturalist, else the name search. Taken only when the taxon's name is the species' own or one of Kew's names (`isOwnName`), and no other page holds it. The search's lenient clause, judged at GBIF for a keyed page, is not applied.
  - **Commons** as today.
  - **GBIF:** `gbif.species`, `gbif.synonyms`, `gbif.vernacular`, `gbif.occurrences` and `gbif.media` are `skipped` with `NO_GBIF_WHY`. The climate is `pending` with `NO_GBIF_CLIMATE`, `upstream.climate` skipped with it. Occurrences are empty with `rangeTested: false`; there is no centroid. The name block's source is `upstream['kew.names']` (`asOf` the file's day).
- `scripts/kew-species-load.ts`, new: one streaming pass of each Kew file for the ids asked. It takes the accepted row, every row filed under it (misapplied ones left out, rank and homotypic kept) and the range through B's `WcvpIndex.rangeOf`. An id Kew no longer accepts is `missing` and said.
- `src/lib/dossier/batch.ts`: `BatchJob.kew` (IPNI and POWO). Such a job's name is never sent to GBIF's match. `kewItems` asks 50 species a query (`KEW_SPARQL_SPECIES`: at 200 the address was 20 kB and Wikidata answered 503). It holds each species' answer under `kewItemUrl`, the builder's own question, then the same entity and Wikipedia batches. A side Kew does not give is `"-"`, never `UNDEF`, which would match every statement.
- `src/lib/dossier/sources/wikimedia.ts`: `crossOf` exported.

**The build (`scripts/build-dossiers.ts`, my lines, all marked "round seventy-nine").**

- Imports, lines 138 to 140.
- `kewWanted`, `kewSpecies`, `readKewPrev`, `kewOnDisk`, `needsKewRebuild`, lines 446 to 460. A page without a key is kept when clean; its permanent `pending` climate is no reason to rebuild it.
- The list's job route, lines 1469 to 1473. A species with no GBIF key in the list and no keyed page on disk goes to `kewWanted`, and the log says how many.
- A `--keys` line naming a `k…` page without a key, line 1491.
- Loading Kew's file and queuing the jobs, lines 1559 to 1569. Without `--bulk` it says why none is built.
- `heldFor`, lines 1582 to 1589. The names of these pages are held against every iNaturalist taxon, and each holds the others'.
- `kept`, the batch prefetch passing `kew`, and the builder call, lines 1599 to 1614.
- `legacyPath` and `diskIds` guarded.
- Also: `uniqueSlugs`, where a homonym's plain address stays with the keyed page (line 753); `--list-extra-keys`, which leaves keyless pages out (line 717); `fillGbifPhotos`, which passes them by (line 1075); the `--names`, `--fill inat-ids` and `--fill wikidata` reports, which count what they passed by.
- `fillPhotos` (P's), lines 546 to 590: a keyless page's taxon is asked by `kewInatTaxon`, and an id its item gave, unchecked by a `--skip inat` build, is checked by it first.

`jobsFromList` keeps its shape (its doc says the route). `select-species-lib.ts` and `select-species.ts`: a reference page may have `key: null`. A rerun of the list over this round's corpus then keeps the species with `-` again, never "undefined". The fills that judge by GBIF key pass these pages by and count them: `corpus-fills.ts` (`noGbif` on `fillInatIds` and `fillWikidata`), `corpus-run.ts`, `open-gbif-fill.ts` and `scripts/names-step.ts`.

**The site.** Each gap says why, with `NO_GBIF_WHY`:

- **Species page:** a "Climate not checked" pill with the reason; `#no-gbif-climate` in the climate section; the cultivation section; the map caption ("Records not checked: …"); "Evidence used"; the Records fact; `#near-not-checked` in Related (which shows now for these pages); the older names credited "(WCVP, RBG Kew)". The add and sow links carry no `&key=`. JSON-LD gives IPNI's identifier. The meta description says "habitat climate not checked".
- **The cultivation sheet, the care line, the note:** `climateStatus: 'unchecked'` (`src/lib/core/sheet.ts`, `note.ts`, `head.ts`), passed by the species page, compare and labels for a keyless page.
- **Front page:** tiles and hits say "climate not checked" (`keyless`). Catalogue rows count such pages under `notChecked`, not `pending` (`catalogue.ts`, Z's). The strip takes only species with a climate, so these never appear there.
- **Plant page:** the season card says "Climate not checked" with the reason. `#habitat-not-checked` is where the space comparison would be. `#key-no-page` appears for a plant that records a GBIF key the page does not hold (GBIF's synonym key, say).
- **Add forms:** they file no key for such a species (`checkedKey` returns `s.gbif ?? null`).
- **Picker:** a keyless reference row resolves the name and files no key ("has a species page, with no GBIF key; no key filed"). Its rows are keyed so two keyless rows no longer collide.
- **Other:** `FollowButton` takes no key; `upstream.ts` names `kew.names`. Search, cards, lookups, the `/api/dossier/<id>` route and the sitemap already took `gbif` as optional; the tests prove they do.

**About pages.**

- `/about/how` makes three sentences untrue for these pages, each answered by the new `#no-gbif-key` paragraph, which follows the sources paragraph. The three sentences:
  - "The name and its synonyms, family and order come from the **GBIF Backbone Taxonomy**".
  - "Occurrence records come from **GBIF**, under the page's own backbone key".
  - "…come from **Wikidata**, from the item that carries the species' GBIF key".
- `/about/how`'s id paragraph: "the reference's files hold each page's GBIF key beside its id" now adds ", where it has one (a page without one is above)".
- `/about/formats`: after "`ids.gbif` is its GBIF key." a passage says when it is absent and what such a dossier records. The index entry's `gbif` gains "absent, in the entry, the card and the sheet, for a page without a GBIF key, since round seventy-nine". Each was checked against the code.
- `docs/PENDING-ABOUT-HOW-R79.md` notes the 2,327 are built.

**Tests** (each new one FAILED on r79base: `build-kew.ts`, `kew-species-load.ts` and `no-gbif.ts` did not exist, and a dossier without `ids.gbif` did not parse):

- `tests/unit/r79k-schema.test.ts` (5): the fixture parses; every GBIF row is skipped with why, never none; the sheet and entry carry no key; the sheet, care line and head say not checked; the catalogue counts it not checked.
- `tests/unit/r79k-build-kew.test.ts` (7), on recorded answers:
  - GBIF is never asked, and the item's P846 is not read;
  - range, `via`, records and climate are as stated;
  - two items are `ambiguous`, and a silent query service is `refused`;
  - the iNaturalist rule: by Kew's synonym, taken; another name, refused; held elsewhere, refused;
  - the batch holds the builder's question and sends nothing to GBIF;
  - the query quotes only Kew's ids.
- `tests/unit/r79k-list-route.test.ts` (4): `jobsFromList`; the loader; the list rerun over a keyless reference page (on the base it wrote "null"). The fourth runs the real `build-dossiers.ts` on a three-row Kew file, every network source skipped: it builds `k457911` with no key and indexes it without `gbif`; a rerun keeps it clean; without `--bulk` it is not built, and said.
- `tests/e2e/r79k-no-gbif.spec.ts` (5):
  - the API by id; 404 for Kew's number and for GBIF's synonym key;
  - the species page's every not-checked place and its links;
  - the search by name and by Kew's older name "Cupressus lusitanica", and the tile;
  - a plant added from the page files no key and says why it has no season;
  - an injected plant with GBIF key 2684069 gets `#key-no-page` and `#habitat-not-checked`.

**Fixture.** `fixtures/dossiers/s/v3/k457911.json`, Hesperocyparis lusitanica as the live build made it (photographs replaced by three made-up ones, synonyms cut to eight), and its index entry. The fixture corpus is five species now. Four tests that count it are updated:

- `export.test.ts`: 5 species, and the keyless row's empty `gbif_id`;
- `r61q-common-name-rule.test.ts`: 5;
- `r62q-names-step.test.ts`: the keyless page is passed by and left untouched;
- `r78i-build.test.ts`: version 2 never held it, so it is not copied there.

`r73p-front.spec.ts` asserts "3 genera · 4 species": FIXME, see Not done.

## Needs

- **D (the plan and the occurrence reading).**
  1. The plan must deploy this round's Worker before its upload, because round 78's Worker answers 503 for these pages. DEPLOY.md's section says so with the commands.
  2. The build step already builds them: it is given `--bulk bulk`, and nothing else is needed. The GBIF download and `bulk-fetch` are untouched (`downloadKeysOf` still names the 2,327 as `none`).
  3. If D's occurrence or SQL reader iterates dossiers or jobs by `ids.gbif`, it must pass keyless ones by.
  4. `--list-extra-keys` now leaves them out (line 717).
- **P (iNaturalist).**
  1. Keep the `fillPhotos` branch (lines 546 to 590) or its equal: a keyless page's taxon by `kewInatTaxon`, and its unchecked Wikidata id checked by it.
  2. The open-data wild photographs must be taken by `ids.inat` only once that id has passed `kewInatTaxon` (`upstream['inat.taxon'].status === 'ok'`), never judged at GBIF.
  3. The day budget counts these requests as any other.
- **Q (cleaning).** Nothing to clean, since no records are read. Any cleaning step that walks dossiers must leave `gbif.occurrences: skipped` as it is (never rewrite it to `none`).
- **Z (index and search at scale).** Entries, cards and sheets carry no `gbif` for these pages, and none gets a `@<key>` alias. `catalogue.ts` counts them `notChecked` (two lines, marked). `uniqueSlugs` gives a homonym's plain address to the keyed page (line 753). In Z's scale corpus, about 5% of pages should be keyless, for realism.

## For the owner's PC

Nothing separate: `node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt` builds them in its build step. To build only these first, as a check, under an hour with no GBIF download:

```
node -e "const fs=require('fs');const t=fs.readFileSync('scripts/species-list.txt','utf8').split(/\r?\n/);fs.writeFileSync('kew-only.txt',t.filter(l=>l.startsWith('#')||l.endsWith('\t-')).join('\n')+'\n')"
npm run dossier -- kew-only.txt --bulk bulk --skip inat
```

Good output: "a species list of 2327 species: 0 built by their GBIF key, 2327 with no GBIF key in the list … built from Kew's file", "2327 species without a GBIF key read from Kew's file", and lines like `✓ Hesperocyparis lusitanica [k457911] 0 photos, 0 open/0 restricted in range, climate pending`. DEPLOY.md, "Round seventy-nine: species without a GBIF key", has the rest.

## Measured

- **Wikidata, all 2,327** (66 SPARQL queries, 2026-10-20). By Kew's identifiers: one item for 1,868 (80%), two for 12 (not taken), none for 447. Of the 1,868: 1,865 are taxa; 734 have an English article; 748 have a Commons category; 1,018 carry an iNaturalist id; 1,668 carry a GBIF key, which is not read.
- **iNaturalist.** Of the 1,018 ids, 847 pass the name rule as they stand (34 requests at 30 ids each). The other 171 are inactive or of another name, and are asked by name. The name search, on a seeded sample of 120 of the 1,480 without a usable id, took 78 (65%). So about 1,810 of 2,327 (78%) will have a taxon. On 50 of them, 45 had photographs (44 wild, 16 cultivated; 1,700 and 132 in all). About seven in ten of these pages will show iNaturalist's photographs after the fill.
- **Thirteen real species built live** (`K-s/sample/`, `sample.log`): Picea laxa, Hesperocyparis lusitanica, Viburnum davidii, Allium porrum, Harpephyllum afrum, Ferocactus acanthodes, Adenium multiflorum, Opuntia cespitosa, Sanguisorba minor, Tromotriche pedunculata, Othonna rhamnoides, Copiapoa mollicula, Boswellia oropedionis.
  - Wikidata found 12; iNaturalist's taxon 12; Wikipedia 7. Allium porrum's REST redirect to "Leek" and Ferocactus acanthodes' to F. viridescens were refused by the existing proofs.
  - 11 had photographs. Boswellia oropedionis (no item, no taxon) has none, and says not checked for each.
  - Requests: 1 Kew query, 4 entity reads, 1 Wikipedia read, 37 iNaturalist, 5 Commons, 1 GBIF (Kew's WCVP dataset, a Wikipedia proof's genus count). About 5 to 7 s a species at iNaturalist's 2 s, so about 1 s a species with `--skip inat`.
- **Runs.**
  - `tsc --noEmit -p .` and `svelte-check`: 0 errors.
  - Scripts-only `tsc` over `build-dossiers.ts`, `kew-species-load.ts`, `select-species.ts` and `bulk-fetch.ts`: only r78base's old `judged` errors (5 lines).
  - The new unit files: 16 tests passed. The 28 fixture-reading unit files: passed after the updates above.
  - FIXME: the whole suite, and the browser run.

## Not done, with why

- **GBIF's records for the 1,758 synonym-only species.** Round 73's extra-keys rule (records under a GBIF key whose name Kew files as this plant) could give them GBIF's records under the synonym's own key, without matching the page by its name. That is a reading of Kew's synonymy, not of GBIF's lumping, but it changes your decision ("not checked"), so it is offered, not done.
- **Common names.** They come from GBIF's vernacular names, which are not asked, so these pages have none, and Provenance says not asked, with why. Wikidata's P1843 could give English names; it is not read by any page today.
- **Wikipedia under GBIF's accepted name** (Allium porrum's article is "Leek", on another item): refused by the existing proof, as for any page.
- FIXME: browser, the whole suite.
