# Round 84, agent N: names, the index and search

Branch `r84` in `/tmp/claude-0/rev84/N`, eleven commits on `r84base`. Scratch: `/tmp/claude-0/rev84/N-s/`.

## Done

Each item gives what changed, its files, its tests and the step that brings it. Step 1 is the deploy over today's corpus. Step 2 is the re-derivation, then `--index`, then the upload.

**Decision 1, D3, A6c: Kew's accepted name heads every `k` page. Step 2.**

- **The rule** (new `src/lib/dossier/kew-heading.ts`).
  - A page whose id is `k<entry>` is headed by Kew's name and authors for that entry.
  - GBIF's name for the key, where its words differ, is added to `name.synonyms`. It then reaches `syn` and `older`, so its old address moves to the page.
  - It is not added where Kew's file holds it under another plant. On k3313620, Kew files GBIF's "Ceropegia tanzaniensis" under Ceropegia cordiloba. The record row `kew.names` says so.
  - GBIF's name block is kept in `name.gbif`. A page that loses its `k` id gets GBIF's name back.
- **Where it is applied.**
  - The derivation still runs under GBIF's name (`gbifView` on the carried taxon in `build.ts`), so the words of the records and the range source do not move.
  - The heading is put on where the id is known: at the end of `buildDossier`, by `--fill kew-names`, and by the rekey.
  - The fill now stores Kew's row as `name.kew.accepted`. That field is kept out of the page fingerprint (`changed.ts`), so 48,000 sitemap days do not move.
- **No heading is malformed, on any page.** An author made only of a bracketed basionym author ("(Peckover) ") is not shown. A name below species gets its rank word ("Conophytum calculus subsp. vanzylii").
- **Merged pages and `hom` follow the same rules.** The 11 merged names are unchanged; Rebutia fidana's merge is now marked on Weingartia fidana.
- **Files:** `kew-heading.ts` (new), `kew-names.ts`, `scripts/kew-names-load.ts`, `rekey.ts`, `build.ts`, `schema.ts`, `changed.ts`, `corpus-fills.ts` (the range fill reads GBIF's view).
- **Test:** `r84n-kew-heading.test.ts`.

**D5: links from the Kew entry.**

- **Step 1:** `withKewLinks` (`core/hybrids.ts`) adds whichever of POWO and IPNI a hybrid's record lacks. Before, a hybrid that linked IPNI alone (Aesculus × woerlitzensis, Rhododendron × sochadzeae) showed no POWO link.
- **Step 2:** the fill links every `k` page's own Kew entry (`linkKewEntry`). That also covers Malva acerifolia and the pages whose heading changes.

**A8: San Pedro and the rest of that group.**

- **"Trichocereus pachanoi" and "Echinopsis pachanoi". Step 2.**
  - New `infra-names.ts` reads the species-rank names GBIF files under a species' own varieties. It makes two passes over GBIF's backbone export.
  - It runs as `--fill gbif-infra`, and automatically after a `--keys` build when `bulk\backbone\simple.txt.gz` exists.
  - The names go into `name.infra`. The index adds them to the names the search reads only when typed as a name (`kew`). A name that is another page's accepted name is dropped.
  - Kew's side was already read: `name.kew.synonyms` holds the names under Kew's accepted varieties.
  - Proven with GBIF's own API rows for Trichocereus macrogonus. I fetched them myself; the reviews did not give them.
- **Step 1, `search.ts`:**
  - "houseleek" now puts Sempervivum tectorum 1st (it was 2nd).
  - "hens and chicks" now leads with a Sempervivum: a plural typed in a phrase now matches a name exactly.
  - "Notocactus" and "Neoporteria" now list their species best known first, not in the alphabet.

**S2, S10, S11, S12: the search's order.** All in `core/search.ts` and the search route. Step 1, and the stored answers again at step 2.

- **S2.** Two rules no longer set back an exact one-word name when the species' own headline holds the word within a fuller name (`headlineHolds`). Measured on the live index:

  | Query | Rank of the target before → after |
  |---|---|
  | snowdrop | Galanthus nivalis 24 → 1 |
  | saffron | Crocus sativus 34 → 2 |
  | pepper | Capsicum annuum 1st, Piper nigrum 125 → 3 |
  | stonecrop | Sedum acre 116 → 1 |
  | squill | Scilla siberica 54 → 1 |
  | primrose | Primula vulgaris 129 → 1 |
  | daisy | Bellis perennis 262 → 3 |

- **S11 and D9 at query time.** A headline is demoted when another species of the same genus holds the same name and has more photographs.
  - "century plant": Agave americana 6 → 1.
  - Piper ponapense, which has no photographs, no longer leads "pepper".
  - "fig" still gives Ficus carica.
- **S10.**
  - Several genera begun or misspelt are now ordered by their distance from the word typed: "lithop" lists Lithops first, and "mamillaria" lists Mammillaria first, its species by the genus word's order.
  - A query that finds nothing is read again from fewer letters of its last word (`shorterReadings`, in the route). There are at most four readings, and the answer is labelled with the letters read: "lithops lesleyi" gives Lithops lesliei, and "sansiveria" gives the Dracaenas once called Sansevieria.
- **S12.**
  - "aster" no longer offers Easter Is.: a region is read with a typo only when no species answered (`regionsTyped`).
  - A pasted sentence is not retried on "this is".
  - English names in another script are not shown: "Hairy phloxا" becomes "Hairy phlox". 23 live names are affected (`latinName`).
- **Over S's 247 queries and my 42:** 20 better, 1 worse ("poppy": Papaver rhoeas 4 → 5).
- **Tests:** `r84n-search.test.ts`, which runs over 660 live index rows (`fixtures/r84n-search-live.json`) and through the route. Search browser specs: 29 passed in Chromium and phone.

**A4: summaries that stop mid-sentence.**

- A summary that does not end a sentence now ends "…" and is marked `cut`, so the page links Wikipedia (`sentenceCut` in `core/text.ts`).
- **Step 1:** at display, in `safeUrls`. **Step 2:** at the derivation, in `wikipedia.ts`.
- 2 of the 617 live dossiers are affected, plus Euphorbia × martini.
- **Test:** `r84n-summary-cut.test.ts`.

**D9: a one-word name several species of a genus share. Step 2.**

- At `--index`, `sharedHeadlines` lets only the species whose sources give the name most often head with it. On a tie, none does.
- The other species do not show the name, but it stays searchable.
- The decision is written into each changed dossier as `name.shared`, and the species page passes it to `englishNames`, so the page and the index agree.
- **Measured** on round 77's corpus of 8,947 pages: 129 pages lose a shared word, and 10 headlines change ("Dumpling" no longer heads two Conophytum).
- **Test:** `r84n-names-index.test.ts`.

**A6b: Monsonia lheritieri. Step 2.**

- A page whose basionym Kew holds apart from the entry its older names lead to now takes no range: `basionymRecords` in `bulk.ts`.
- **Test:** uses Kew's own rows.

**Decision 4: the front page strip from the Popular genera. Step 2.**

- `featuredPoolOf` now goes through the popular genera, most grown first. In each it takes the species with the most cultivated iNaturalist observations (from `species-list.txt`), then the most photographed. It keeps the eight-photograph and climate rules.
- The build reads both files (`grownRule`).
- **On the live index all 48 species change.** Before: Carex appressa, Eucalyptus resinifera, Euphorbia tannensis, and so on. After: Rosa rugosa, Salvia rosmarinus, Prunus serrulata, Acer palmatum, Hibiscus syriacus, Euphorbia milii, and so on.
- **Test:** `r84n-strip.test.ts`.

**Proof on live data**, in `N-s/c617`, which holds the 617 live dossiers, base against N:

- Exactly 8 headings changed, with their slugs, `syn` and `kew`. They are Hoodia alstonii, Echidnopsis sharpei, Ceropegia dodomaensis, Talinum grevei, Talinum humbertii, Aztekium hintonii, Weingartia fidana and Conophytum calculus subsp. vanzylii.
- 73 pages were linked to their entry.
- A second fill changed 0 files.
- The `older/` files send `ceropegia-alstonii` to k506502.

**Checks.**

- Every new test fails on r84base; I checked by copying the tests onto it.
- `tsc` and `svelte-check` report 0 errors.

## Decisions I took

1. **D9: "heads none" except the clear favourite.** The one species whose sources give the word most often keeps it. Ficus carica has "Fig" from 6 sources against 1, and Zingiber officinale keeps "Ginger"; dropping those headings literally would break "fig". The rule compares species within a genus only, as the brief says. A nickname shared across genera is left to the search.
2. **Kew's authors head the page too.** All 595 sampled pages whose words already agree already cite Kew's authors.
3. **The headline rule also applies to the generic nouns** ("snowdrop" is one), which keeps snowdrop, daisy and primrose right. As a result "cactus" now leads with Acanthocereus tetragonus, which a source calls plain "Cactus"; S left that to the owner.
4. **A6b is narrowed to the basionym.** Kew holds Sarcocaulon lheritieri Sweet as Unplaced, not as an accepted species as the review said. Counting every unplaced older name would cost other pages their climate.
5. **A shared headline is demoted by photographs.** The index carries no source counts, so photographs are the only signal available.

## Measured

| What | Before | After |
|---|---|---|
| `k` headings that are not Kew's (live index) | 501 of 48,343: 467 under another genus, 26 names Kew does not hold, 1 held for another plant | 0 |
| Heading collisions after the change | | 0 |
| Strip species from the popular genera | 0 of 48 | 48 of 48 |
| Rankings above | | 20 better, 1 worse |

## For the owner's PC

- **Nothing new to run.** Decision 2's pass reaches all of this.
- Run `dir bulk\backbone\simple.txt.gz` first. If the file is elsewhere, add `--backbone <path>` to the `--keys` command.
- The expected lines and seven `curl` checks are in `docs/DEPLOY.md`, under "Round eighty-four: names, the index and search (agent N)".

## Touched outside my files (please check at the merge)

**Small edits in other agents' files:**

- `bulk.ts` (G): `viaOlderNames`, `basionymRecords`, and one import.
- `species/[slug]/+page.server.ts` (E): one line, `shared:`.

**Shared files:**

- `schema.ts`: four optional fields and the cut mend in `safeUrls`.
- `changed.ts`, `rekey.ts`, `kew-names.ts`.
- `corpus-fills.ts`.
- `core/hybrids.ts`, `core/regions.ts`, `core/text.ts`.
- `api/search/+server.ts`.

**Older tests I updated** to the new rules: `r72a`, `r81h`, `r81s`, `r82s` and `r60-corpus-mixed`.

**For A:** `/about/how` and `/about/formats` need sentences for each of these:

- decision 1;
- the S2 and shared-headline order;
- the nearest genus;
- the fewer-letters readings;
- D9;
- the Latin-alphabet names;
- the cut summaries;
- the strip rule;
- `name.infra` and `--fill gbif-infra`;
- the new dossier fields.

## Not done, with why

- **"living stones":** the reference holds no genus common names. That needs a new data source.
- **"peyote" and "moth orchid":** the cause is data. GBIF's "Peyote" rows carry no language tag, and no Phalaenopsis has an English name in the index.
- **"Ætihvönn", "Amor platónico":** they are in the Latin alphabet, so their language cannot be read from the letters.
- **"mother of thousands" (5th) and "ponytail palm" (2nd):** fixing them would need source counts, which the index does not carry.
- **k2734813's old address:** it is reached through GBIF's name service. It is the same words with a rank word added, so it is not an older name.
- **The backbone export and the PC's full corpus:** I could not run either here.
- **WebKit and Firefox:** I could only run Chromium here.
