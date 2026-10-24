# Round 82, agent S: search and the index's names

Copy `/tmp/claude-0/rev82/S/`, branch `r82`, four commits on `r82base` (head `5efe91a`). The base was checked out at `/tmp/claude-0/rev82/S-s/base`, and every new test was run there.

## Done

### Review 1's 2a: an exact headline match ranks first ("peppermint")

- **Cause.** Round 81's rule for a one-word name that two genera share set back every species called by that word, its headline included.
  - Eucalyptus dives has "Peppermint" among its other names, so Mentha × piperita, whose headline is "Peppermint", fell to closeness 3.5. It came 18th of 19.
  - The same rule put Salvia rosmarinus 28th for "rosemary": a Strumpfia is also called "Rosemary".
- **Fix.** `src/lib/core/search.ts` `collect`: a species whose own headline is the query is exempt from that rule. The shared name that is nobody's headline is still set back, so round 81's "rose" order holds.
- **Tests.** `tests/unit/r82s-search.test.ts` 1 and 2.
  - On r82base they fail: the first hit is Eucalyptus radiata for "peppermint" and Westringia rigida for "rosemary".
- **Safe mid-fill:** yes. This is query-time code, so it reaches the site with the app deploy.

### Review 1's 2b: a bare genus word ("echeveria")

- **Fix** (`search.ts` `collect`, `known`). The species are ordered in this way:
  - For a genus word alone, the genus's species come first, ordered by how many English names they show (`common` plus `commons`), then by photographs, then by the alphabet.
  - The same order applies to a genus still being typed or misspelt, when only one genus answers ("echev", "echevaria").
  - Another genus that begins with the word comes next ("aloe" puts Aloe before Aloestrela).
  - When the word begins several genera ("c"), the alphabet is kept.
- **Why names before photographs.** I measured it. Over 71 species growers keep, across 17 genera of the live index, this many were in their genus's first 30:

  | Order | Species in the first 30 (of 71) |
  |---|---|
  | Alphabet | 26 |
  | Photographs alone | 45 |
  | Names, then photographs | 61 |

  Most pages' photograph counts sit near their cap, so photographs alone separate the species poorly. With names first, "echeveria", "crassula" and "sempervivum" give E. elegans, C. ovata and S. tectorum first. With photographs alone, E. elegans came 17th and C. ovata was not in the first 30.
  - The popular genera list counts by genus, so it cannot order the species inside a genus.
  - Taking names out of `known` gives the brief's literal "by photographs" in one line.
- **Tests.** `r82s-search.test.ts` 3 and 4: the order, the near and begun forms, Aloestrela, and "e" keeping the alphabet.
  - On r82base they fail: the alphabet's E. acutifolia is first.
- **One test changed to match.** `r62bq-rev-readings` now compares the set of the Echeveria answer, because the order is now this round's.
- **Safe mid-fill:** yes. The app applies it, except for the two genus words too common to list (heavy keys: "aster" and "argentina"). Their best hundred is written by step 12.

### Review 1's 3: a same-spelled name by another author shown as an older name

- **Index time.** `homonymEntries` (new, at the end of `src/lib/dossier/index-entry.ts`) handles each `syn` or `older` name that is another page's accepted name:
  - It moves the name to a new field, `hom`, with the record's authors in `homBy`. "Sempervivum montanum Sibth. & Sm." is one.
  - It keeps the name as an older name when an author in the record agrees with that page's own author (`plainlyAnother` says it is not another's). That is one name, which GBIF files under both pages.
  - It leaves alone a name that the record holds only as the first parent of a hybrid formula. That case is F's issue 27.
- **Where it runs.** `scripts/build-dossiers.ts` collects `recordOf` in `indexEntry`, adds a pass `homonymIndex`, and applies it:
  - to `shownIndex` in `writeIndexFromDisk`;
  - to the full build's `index.json`.
  - The index that `judgeDossiers` reads is not changed.
- **The search** (`search.ts`) reads `hom` only as a typed name:
  - It uses kew's rule (`homTyped`), never a single word and never a near spelling.
  - Such a match sorts after the page of that name and after every species that holds the name as an older name of its own (`olderOrder` 8).
- **The row.** `homonymOf` in `src/lib/ui/ref/searched.ts`, used in `src/routes/+page.svelte`'s hit snippet:
  - It says "older name under another author: Sempervivum montanum Sibth. & Sm.", the species page's own wording.
  - Where the record gives no author, it says "…, with no author in the record".
  - The link carries `?was=`.
- **Nothing else changes.** `hom` is read wherever `syn` and `older` were read before:
  - `heldNamesOf`, the photograph rules (`photo-kind.ts`);
  - `indexMaps`, the addresses and `?was=` (`lookups.ts`);
  - the key trees (`postings.ts` `entryWords`, `search-files.ts` `nameWordsOf`).
- **The key files.** A key file's `Doc` carries `hom` as field 9, after kew's place.
  - A species with nothing moved writes the same doc as before.
  - The new Worker reads today's key files as before.
- **Tests.** `tests/unit/r82s-homonyms.test.ts`, 5 tests: the moves, the kept cases and the formula; photo rules and lookups unchanged; the order; the row's words; key files equal to the whole index; docs and keys unchanged.
  - On r82base: `homonymEntries is not a function`.
- **Browser test.** `tests/e2e/r82s-search.spec.ts` r82s 1, desktop and phone.
  - On r82base it fails twice: the row says nothing about the name, and the link has no `?was=`.
- **Safe mid-fill:** yes.
  - A fill day's own index write after this code carries `hom`, and the next fill day's `indexHeld()` reads the same names.
  - No dossier is written by it.

### Review 1's 17: the picker writes var., subsp., f.

- **Fix.**
  - `rankedName` (`src/lib/ui/picked-name.ts`) adds the rank word: var., subsp., f., and the notho- forms.
  - `SpeciesPicker.svelte` uses it in `toRows`, so the row shows and the pick writes "Lithops lesliei var. luteoviridis" and files the key. The check on leaving the field compares the ranked name too, and the " · variety" suffix is dropped once the name carries the word.
  - `nameParts` sets the notho- words in roman.
- **Tests.** `tests/unit/r82s-picker.test.ts` and e2e r82s 2.
  - On r82base: there is no `rankedName`, and the row reads "Lithops lesliei luteoviridis · variety".
- **Safe mid-fill:** yes. App only.

### Review 1's 20

Compare's native range comes from Compare's own card (`src/routes/compare/+page.svelte:203`), not from the search card, so it is U's.

### The about pages

- `/about/how`'s search paragraph now covers:
  - the headline exemption ("peppermint");
  - the genus word's order;
  - names by another author and their row;
  - that the upload brings `hom` and the heavy genus words' order.
- `docs/DEPLOY.md` has a new section, `### Round eighty-two: search and the index's names (agent S)`.

## Repairs for the live site

None. The app applies the ranking and the rows. Step 12's own `--index` writes `hom`, provided this code is on the PC before the fill's last day (about 2026-10-26).

## Needs

- **U:**
  - `src/routes/+page.svelte`, the hit snippet (around lines 789-797), now has my `homonym` and `was` lines.
  - Review 1's 20 is yours.
  - The species page's `namedElsewhere` says "Under another author" even where the record writes the other page's own author. That was 10 of 283 such names on round 77's corpus, and the index now keeps them as older names. Reading them with `plainlyAnother`, as `homonymEntries` does, would make the page true of them.
- **F:**
  - In `index-entry.ts` I added `hom`/`homBy` to `IndexEntry`, an import of `./authors`, and `homonymEntries` at the end of the file.
  - In `build-dossiers.ts` I added `recordOf` and `homonymIndex` after `olderOf`, one line in `indexEntry`, and the two `signEntries(homonymIndex(index))` calls.
  - Your issue 27 needs nothing from me: a name held only through a formula is left alone.

## For the owner's PC

- Run in every engine:

  ```
  npx playwright test tests/e2e/r82s-search.spec.ts tests/e2e/r81s-search.spec.ts tests/e2e/r62q-picker.spec.ts --project webkit --project phone-webkit --project firefox
  ```

  - The specs block the service worker, use routes only, and wait on the very line they read.
- Step 12 should print `… older names on … pages spelt as another page's accepted name, by another author …`. Expect about 3,400 to 3,500 names on about 2,900 to 3,000 pages.

## Measured

- **60 grower queries** (round 81 reviewer C's 61, whole-index ranking over the live index, r82base against r82). The table is `/tmp/claude-0/rev82/S-s/run/measure-table.tsv`.

  | | r82base | r82 |
  |---|---|---|
  | First | 49 | 50 |
  | In the first three | 55 | 56 |
  | Found in the first 30 | 57 | 57 |

  - No query that was first fell. "rosemary" went from 28th to 1st.
  - The genus queries stay first, now led by E. elegans, Haworthia arachnoidea, Mammillaria heyderi, G. mihanovichii and Ariocarpus fissuratus.
- **Extra queries.**

  | Query | r82base | r82 |
  |---|---|---|
  | peppermint | 18 | 1 |
  | echeveria, for E. elegans | not in the first 30 | 1 |
  | crassula, for C. ovata | not in the first 30 | 1 |
  | sempervivum, for S. tectorum | not in the first 30 | 1 |
  | haworthia, for H. cooperi | 13 | 3 |
  | lithops, for L. lesliei | 23 | 6 |
  | agave, for A. americana | 11 | 5 |
  | mammillaria, for M. elongata | not in the first 30 | 3 |

- **Live index.** The review's figures reproduce: 1,691 pages and 1,802 `syn` pairs, plus 1,413 pages in `older`. Together that is 3,520 names on 2,980 pages, an upper bound, since the live index carries no authors. On round 77's corpus with its records, 273 names were moved and 10 were kept by the other page's own author.
- **Key files against the whole index** (`/tmp/claude-0/rev82/S-s/proof/proof82.mts`, round 77's index with `hom` from its own dossiers):
  - 11,310 queries: round 81's 5,512, plus every genus, begun and misspelt, every one-word headline, every `hom` name typed and begun, and 822 older names.
  - 11,306 gave the same answer and 4 said "narrow"; none differed.
- **Checks.** `tsc` and `svelte-check` show 0 errors.
  - The e2e specs r82s, r81s and r62q pass on Chromium desktop and phone: 20 of 20.
  - On r82base all 4 r82s tests fail.
  - Whole suite, alone (`npx vitest run`, 934 s): 4,564 passed, 10 skipped, and 32 failed, all in `r70b2-follow-42`, which fails the same 32 on r82base.

## Not done, with why

- **The popular genera list as an order:** it counts by genus, and it is read on the server only, so it cannot order a genus's species. English names, then photographs, measured better.
- **Prefixes of several genera ("c", "mam") keep the alphabet,** as round 69 decided.
- **Kew's `kew` names spelt as another page's accepted name:** there are 0 on the live index, so there was nothing to move.
- **Pre-existing failures, the same on r82base:**
  - `r70b2-follow-42`: 32 tests.
  - `r79z-prune`'s 5-second timing, under this machine's load of 8 to 15.
