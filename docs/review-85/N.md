# Round eighty-five, agent N: names, the index, search and the online fills

Branch `r85` in `/tmp/claude-0/rev85/N`, commits on `r85base`. Scratch `/tmp/claude-0/rev85/N-s/`.
Step 1 means the deploy over today's corpus. Step 2 means the walk, then the online steps, then `--index`.

## Done

**Decision 6, D1, A11: Kew places every name.**

- **The rule.** `kewPlace` and `plantOf`, in `kew-names.ts`.
  - A stored name is read by Kew's rows of its words at its rank. Misapplied rows are left out.
  - Where Kew holds the words by the record's author, only those rows count (`ownByAuthor`).
  - Each row leads to an entry. An unplaced row leads nowhere.
  - The name is `here`, `elsewhere` or `unread`.
- **The fill.** `--fill kew-names` stores GBIF's synonyms and infra names that are `elsewhere` as `name.kew.elsewhere`.
- **The index.** `keptNames` (`index-entry.ts`) leaves those names out. They are no longer searched, shown as older
  names, or addresses. A merged page's name is the owner's and stays.
  - Echinopsis pachanoi and its Kew synonyms leave Echinopsis macrogona.
  - Dypsis lutescens leaves Hyophorbe indica.
  - Aloe vera Mill. stays on Aloe succotrina, by its author.
- **A11.** `InfraNames.of` holds a name only as a binomial, so "Trichocereus pachanoi f. peruvianus" no longer hides
  "Trichocereus pachanoi".
- **Order.** The infra fill runs before Kew's names, in the build and in the plan. A standalone `--fill gbif-infra`
  runs Kew's names again on the pages it wrote.
- **Files:** `kew-names.ts`, `infra-names.ts`, `extra-keys.ts` (`plantOf` moved), `index-entry.ts`,
  `scripts/kew-names-load.ts`, `build-dossiers.ts`, `schema.ts`.
- **Step:** 2.

**Decision 6: new pages.** A Kew-accepted species that GBIF folds into another reference species, and that growers
name, gets a page.

- **The rule** (`scripts/folded-species-lib.ts`, `scripts/folded-species.ts`), three tests, each a source's fact:
  1. Kew accepts it as a species, and there is no `k` page for it.
  2. A page holds its own name among GBIF's names (`syn`, `older`, `hom`, or the infra names in `kew`).
  3. iNaturalist holds a taxon of that name with at least 3 observations marked captive or cultivated. This is the
     species list's own threshold. The taxon is the species itself, or below it with its epithet ("Trichocereus
     macrogonus pachanoi", the variety iNaturalist files San Pedro as). A complex or another species' taxon does not
     count.
- **The pages.** Added to `scripts/species-list.txt` in the list's order. `scripts/species-new-r85.txt` holds those
  lines for the plan's build.
- **Step:** 2, online.
- **Counted.**
  - Kew accepts 365,813 species.
  - Test 2 keeps 2,917: no page, and a page holds the name.
  - Test 3 keeps 18. These are Echinopsis pachanoi (1,009 cultivated observations), Acacia sophorae, Asarum acuminatum,
    Astartea scoparia, Begonia corallina, Coffea dewevrei, Cotoneaster sternianus and C. wilsonii, Crataegus pringlei,
    Ixia fuscocitrina, Juniperus davurica, Nymphaea amazonum, Opuntia nicholii, Silphium connatum and S. simpsonii,
    Solanum wallacei, Viola stipularis and Acaena echinata.
  - Stapelia hirsuta and Huernia barbata passed too. They were left out because the autonym rule makes the existing
    pages theirs (k512041 to k512033, k507290 to k507289).
- **The answers.** 2,915 iNaturalist taxon searches and their cultivated counts (about 3,400 requests at 1.1 s), cached
  in `N-s/an/inat.jsonl`. The script reads the cache and asks only what is missing.
- **The list.** The 18 lines are in `species-list.txt` in its own order (`localeCompare`), with a header line saying the
  rule. The "Selected:" counts (48,375; 2,354 without a GBIF key) still add up. `docs/PENDING-ABOUT-HOW-R79.md` was
  regenerated from them.

**D3, decision 7's refresh: renamed pages asked by Kew's name.** `BuildOptions.kewHeading`, set from the page on disk
(`kewHeadingOf`).

- Wikidata is asked by the IPNI and POWO numbers of Kew's name.
- Wikipedia is asked by Kew's title first, iNaturalist by Kew's name first, and Commons by Kew's category.
- `--list-renamed` writes `rebuild-renamed.txt`. A page built so says it in its Wikipedia row, so the list resumes.
- **Step:** 2, online.

**A9a: Kew's family.** `KewRow.family` and `KewAccepted.family`. `headWithKew` puts Kew's family on a `k` page and keeps
GBIF's in `name.gbif.family`, which comes back on an un-heading. **Step:** 2.

**A9b, D7: autonyms and subspecies.**

- An autonym entry is its species' entry (`speciesEntry`), so k512041 becomes k512033, Stapelia hirsuta L., and
  k507290 becomes k507289, Huernia barbata. The rekey gives the ids.
- A subspecies' parent is no longer part of its plant (`plantOf`), so Conophytum calculus is not an older name of subsp.
  vanzylii.
- Orbea carnosa subsp. keithii and O. maculata subsp. rangeana stay subspecies.
- **Step:** 2.

**A9c: Kew's homonyms.** A Kew older name spelt as another page's accepted name moves from `kew` to `hom`, so it is said
as another author's name (`homonymEntries`). There are 173 such names on the live index. **Step:** 2.

**D5, A15, S10: every old address resolves.**

- **Step 1** (`lookup.ts`, `synonyms.ts`):
  - An address two pages hold goes to the page whose own heading it was (`name.gbif.slug`, `name.formerly`). This covers
    ceropegia-edulis, ceropegia-penduliflora and erythrina-caffra.
  - A name GBIF accepts goes to the page whose own GBIF key it is, unless Kew holds the name for another plant. This
    covers conophytum-calculus-vanzylii.
- **Step 2:**
  - The Kew filter leaves one holder for dypsis-lutescens and ceropegia-triebneri.
  - Former headings are kept (`name.formerly`, written by the fill when Kew's entry changes) and held as older names
    (`formerHeadings`).
  - A former heading Kew files under another plant goes to that plant's page: ceropegia-tanzaniensis to C. cordiloba.
- Of the 501 old headings, 7 did not lead to their page on the live index. All 7 now do, by the rules above.
- Rebutia fidana in the merged list is A's sentence. It is listed under "For A" below.

**D6: g pages under Kew's names.**

- A page with no Kew row of its own words, whose range note is `spelling` or `synonym-of`, takes that note's entry
  (`viaEntry`). It is then `k<entry>` and headed by Kew. On the 906 live dossiers, 11 pages were re-keyed, Tylecodon
  cacalioides among them.
- Delphinium × barlowii shows its sign: `hybrid-names.ts --index` adds the index's signed Kew entries, artificial
  hybrids included. `hybrids.json` gains 1 row.
- **Step:** 1 for the sign, 2 for the headings.

**A14, S5, S6, S12: search** (`core/search.ts`, the search route, `search-files.ts`, the Worker's reader).

- **"tulip":** a Name-group hit that holds the word in a common name of its own is ranked among the common names'
  hits. Tulipa gesneriana is first.
- **Growers' counts.** The index's `grown` field (the list's cultivated count) breaks ties before photographs, and a
  shared headline is weighed by it. It reaches the Worker through new key-file blocks, and a Worker built before reads
  none. Results: "saffron" gives Crocus sativus, "baobab" Adansonia digitata, "houseleek" and "hens and chicks"
  Sempervivum tectorum.
- **"Sulcorebutia":** an older genus typed alone lists the genus most of its hits belong to first, so the Weingartia
  come before Copiapoa.
- **Misspelt genera:** `nearestGenus` takes the one genus within 2 letters (1 under 7 letters). It reads the reference's
  genera and `older-genera.json`, a new product. A tie goes to the genus the word is a subsequence of. "mamilaria" →
  Mammillaria, "euforbia obesa" → Euphorbia obesa, "sansiveria" and "sansevera" → the Sansevieria Dracaenas, snake plant
  first.
- **Shorter readings** must answer exactly. A nothogenus ("x Gasteraloe") gets none.
- **S12:** `latinName` drops names with ð, þ or æ ("Ætihvönn", "Garðabrúða") and a trailing modifier letter ("Wild Bell
  Appleˌ").
- **Step:** 1 for the order, the route and the names. 2 for `grown` and `older-genera.json`.

**D13.**

- **"Beet":** `sharedHeadlines` now also compares across genera. A species loses a one-word name only when another
  genus's species is given it by more sources **and** grown more, with both counted. Patellifolia procumbens drops
  "Beet" and Beta vulgaris keeps it.
- **Hereroa incurva:** an accepted name's genus is its first word, so it no longer reads "Schwantes". This is done in
  the fill.
- **Step:** 2.

**A9d: Kalanchoe × houghtonii. Found why.** GBIF holds 6,149 georeferenced records. The build read the download's first
2,000 rows, and the four CC BY-NC iNaturalist records in Madagascar (5062593810, 3058833832, 3059119639, 4137589312)
were past them. G's decision 5 (every distinct cell first) brings them in at the walk. No naming fault.

**A23: un-heading said.** `fillKewNames` counts and lists every page Kew headed and no longer heads, with why. On the
906 live dossiers that is 2: the two autonyms, until their re-key.

**Decision 7: credits carry their day** (`photo-read.ts`, `photos[].read`).

- A build that asked its sources stamps its photographs. Any write stamps photographs the page did not hold before. A
  carried photograph keeps its own day, or none.
- `--fill credits` reads every iNaturalist credit again (v2 observations, 200 a request, by number or by uuid) and every
  Commons credit (50 files a request). A changed credit is corrected, a closed or missing file is dropped, and each is
  stamped. It runs under iNaturalist's day budget.
- **B2:** run live on two dossiers. Hibiscus rosa-sinensis's 480095081 and 480095850 were corrected to "Casey Clark G.
  Sumalinog".
- **Step:** 2.

**Decision 8: summaries carry their revision.**

- `summary.revision` and `summary.read` come from Wikipedia's REST answer, in every build and fill.
- `--fill summary-revisions` (`revision-fill.ts`) records the revision, refreshes a lead that changed, and leaves a moved
  article to `--fill summaries`.
- Run live on two dossiers: Hibiscus's lead had changed and was refreshed; Aloe vera's revision was recorded.
- **Step:** 2.

**Decision 4 of round 84: the strip.** It reads the same counts. A new page joins when it meets the strip's photograph
and climate rules.

**Tests.** Every new test fails on `r85base`: I copied the files into a worktree of `r85base` and ran them there. All
33 failed. A second file of the same behaviours through APIs the base has failed by assertion.

| File | Tests | What it covers |
|---|---|---|
| `r85n-kew-names.test.ts` | 13 | Kew placement, the autonym and subspecies plants, D6, A9a, the genus repair, former headings, A23, D3's helpers |
| `r85n-search.test.ts` | 9 | tulip, baobab, saffron, Sulcorebutia, `nearestGenus`, older genera, nothogenera, the key-file blocks, S12 |
| `r85n-credits.test.ts` | 5 | stamping, B2 with the live answer, drops, revisions |
| `r85n-addresses.test.ts` | 4 | D5's holders, former-heading addresses, Beet, A9c |
| `r85n-folded.test.ts` | 3 | the new pages' rule |

## Decisions I took

1. **"Every Kew row leads here" was too strict for names without authors.** D1 suggested it, but the decision says
   "never a search name of a page it does not lead to". So a name with any row leading into the page's plant stays.
   Where the record gives an author Kew holds, that author's rows decide.
2. **A page Kew gives no entry is not filtered.** Rule 3: Kew says nothing about it.
3. **Merged names stay.** They are the owner's decisions.
4. **New pages read no GBIF records this round.** GBIF files San Pedro's records under E. macrogona's key. Telling
   them apart needs the backbone export and G's record reader. Rule 3 says no guessing, so the page says "not checked"
   with the reason, as the other keyless pages do.
5. **The new-pages rule uses iNaturalist alone.** GBIF has no key of its own for a folded species, so a living
   collection's record of it cannot be counted.
6. **Only the two autonyms are re-headed as species.** Real subspecies keep their entry.
7. **D13 across genera needs both counts to agree.** Taking names on sources alone took "Almond" and "Pawpaw" on round
   77's corpus. Both counts also measured 2 changed headlines on that corpus.
8. **"Chestnut" stays on Pochota fendleri.** It is the Catalogue of Life's name, given twice. No genus's species is
   given "Chestnut" alone, so no rule takes it without also taking legitimate names. "Guiana" is the same source's
   fragment.
9. **A misspelt genus reading wins over a similar-spelling answer.** It applies only when the first word is no genus.
10. **The genus repair belongs to the fill.** The rekey must change ids only (r78i).

## Measured

| What | Before | After |
|---|---|---|
| GBIF names Kew places only in another plant (live index, Python over Kew's file) | 14,936 searched (syn 4,574; older 5,427; kew 3,516; hom 1,419) | left out at step 2 |
| The same, by the code on the 906 live dossiers | 562 / 184 pages | 554 left out on 184 pages |
| Kew-accepted species no page has, whose name a page held among GBIF's (D1) | 2,917 | 0 held; 18 growers name get pages |
| Old headings not leading to their page (live index) | 7 of 501 | 0 by rule |
| Search ("tulip", "baobab", "saffron", "Sulcorebutia", "mamilaria", "sansiveria", "euforbia obesa", "x Gasteraloe"), with `grown` | wrong first or nothing | right first, or nothing |
| Kew's homonyms said as older names (A9c) | 173 | 0 |

## For the owner's PC

- Run the plan `scripts\corpus-plan-r85.txt` (G writes it with N's lines). The lines are in DEPLOY's "Round
  eighty-five: names, the index, search and the online fills (agent N)".
- After `--index`, regenerate the hybrid table. Its row count goes on /about/how:

  ```
  npx tsx scripts/hybrid-names.ts --bulk bulk --index static/s/v3/index.json
  ```

## Touched outside my files

- `src/lib/dossier/schema.ts`: `kew.elsewhere`, `kew.accepted.family`, `gbif.family`, `formerly`, `photos[].read`,
  `summary.revision` and `summary.read`.
- `src/lib/dossier/lookups.ts`: none.
- `src/lib/server/lookup.ts` and `synonyms.ts`: the D5 address rules.
- `src/routes/api/search/+server.ts`: the genus reading and exact shorter readings.
- `src/lib/core/search-files.ts`: the growers' blocks.
- `src/lib/server/dossiers.ts`: the reader's `grown`.
- `src/lib/dossier/build.ts` and `build-kew.ts`: `kewHeading` and the revision.
- `sources/wikipedia.ts`: the revision.
- `summary-fill.ts`: the revision.
- `scripts/hybrid-names.ts` and `src/lib/core/hybrids.json`: +1 row.
- **Older tests brought to this round's rules:**
  - `r81h-hybrids` (the index's signed entries);
  - `r84n-search` ("lithops lesl");
  - `products.test` ("oldnmae" read as "Oldname");
  - `r84n-names-index` ("Ætihvönn" now dropped);
  - `r78m-list-build`, `r80x-held-range`, `r78s-species-list`, `r79m-kew-keys`, `r79f-about-how` (the list's counts:
    48,375, and 2,354 without a key; and the new reason form);
  - `src/routes/about/how/+page.svelte` (A's): "48,357 species" → "48,375", and "(485 hybrids" → "(486 hybrids";
  - `docs/PENDING-ABOUT-HOW-R79.md`, regenerated.
- **For E.** Show `photos[].read` and `summary.revision`/`read`. Filter shown older names by `name.kew.elsewhere`. The
  field list is in `/tmp/claude-0/rev85/fields-n.md`.
- **For A** (`<!-- r85 N -->`):
  - Kew places every name (decision 6), the new-pages rule and its count;
  - autonyms as species, g pages by their range entry, Kew's family;
  - former headings as addresses; Kew's homonyms said as another author's;
  - growers' counts as the tie-break, the nearest genus, exact shorter readings;
  - the Icelandic-letter rule, the across-genera one-word rule;
  - credits' days and `--fill credits`; revisions and `--fill summary-revisions`;
  - the merged list's Rebutia fidana;
  - /about/how's "(485 hybrids …)" is now 486, and the list is 48,375 species: I changed both figures in place.

## Not done, with why

Empty.

- Two cases are judgements, under "Decisions I took" with their evidence:
  - the new pages read no GBIF records this round (decision 4);
  - "Chestnut" on Pochota fendleri stays (decision 8).
- Two things only the PC can run:
  - the online steps (the new pages, the renamed pages, revisions and credits): plan and DEPLOY;
  - WebKit and Firefox.
- **Checks here:**
  - `tsc` (both configs): no new error. The scripts config's errors are the base's own (`judged`, `merged`, `Upstream`).
  - `svelte-check`: 0 errors.
  - Unit tests near my changes: all pass, `search-generations` among them. It timed out once at load 33 and passed when
    run again.
  - Chromium and phone: `r82s-search` and `r83a-merged-address` pass, 9 of 9.
