# Round sixty-seven: N's report (names, search, rain words, the corpus builder)

Working copy: `/tmp/r67/N`. Needs for other agents: `/tmp/r67/N-needs.md`. The list of species to rebuild online: `/tmp/r67/N-rebuild-keys.txt`. Every headline that changes: `/tmp/r67/N-headlines.txt`.

## Owner's steps, and what to read before the upload

### 1. The online rebuild (N4)

The list holds 156 species, not 164: 120 have no photograph left, 44 carry a refusal they never received, and 8 are in both lists. Save `/tmp/r67/N-rebuild-keys.txt` in the checkout as `r67-rebuild-keys.txt`. Each line is a backbone key with the name after it.

In PowerShell, from the checkout, after `npm run deploy`:

```powershell
Compress-Archive -Path static\s\v2 -DestinationPath $env:TEMP\s-v2-before-r67.zip
Copy-Item static\s\v2\index.json $env:TEMP\index-before-r67.json
npm run dossier -- --keys r67-rebuild-keys.txt --grid climate --bulk bulk
```

In cmd, the same three steps:

```bat
powershell -Command "Compress-Archive -Path static\s\v2 -DestinationPath $env:TEMP\s-v2-before-r67.zip"
copy static\s\v2\index.json %TEMP%\index-before-r67.json
npm run dossier -- --keys r67-rebuild-keys.txt --grid climate --bulk bulk
```

- The run asks GBIF, iNaturalist, Commons, Wikidata, Wikipedia and OpenAlex for those 156 species only. It keeps every other dossier.
- It ends with a non-zero exit, and writes `drops.txt`, if any rebuilt species lost every photograph or had a source turn refused.
- Read `drops.txt` before going on. Where it names a refusal (a 429 from a source), run the same command again later.

### 2. The names, then the index (N1, N3, N5 to N7, N9)

```powershell
npx tsx scripts/audit-common-names.ts --dossiers static\s\v2 --sample 40
npm run dossier -- --index
npx tsx scripts/audit-common-names.ts static\s\v2\index.json --before $env:TEMP\index-before-r67.json --sample 40
```

- The first command reports what the new rules change, before `--index` writes anything.
- The last command exits non-zero, and lists the species, if any photograph count dropped to zero or any climate turned `refused` between the two indexes. Do not upload until each one is understood.
- Then do the two-line upload and the live check, as in DEPLOY.md.
- The DEPLOY.md paragraph for this step is in my needs (S, need 5).

### The audit on the real corpus (`/tmp/rev66/corpus/v2`, manifest `2dc42914f6c3f6f3`), before → after

Before this round, the code reproduced `index.json` exactly (0 differences, `rev66b/names-dump.ts`). With this round's rules, from the dossiers (`npx tsx scripts/audit-common-names.ts --dossiers /tmp/rev66/corpus/v2 --sample 40`):

- **411 of 8,947 headlines change.** By cause:

  | Changes | Cause |
  |---|---|
  | 278 | more distinct sources over a dataset's preferred flag (N3) |
  | 66 | capitals read across hyphens (N6) |
  | 34 | sources pooled across spellings (N5) |
  | 26 | another spelling of the same name (N5, N6) |
  | 6 | a generic noun set back (N3) |
  | 1 | the species' own binomial set back (N3) |

  The triage expected "about 280" for N3; 278 are by N3's first rule, and 7 more by its set-backs.
- **The line under the title (the first four names) changes on 806 species.** Of those, 302 had repeated a name before; pooling now removes the repeats.
- **The search reads 15,791 more older names, across 2,125 species (N1).**
  - `index.json` grows from 5,113,599 to 5,534,857 bytes (+8.2%).
  - The 64 postings files grow from 3,408,650 to 3,643,932 bytes (+6.9%).
  - `short.json` grows from 110,273 to 114,857 bytes.
  - The largest `older` on one entry has 42 names.
- **Names the audit flags (N9).** Each is shown exactly as the source spelt it:
  - `bracket`: Cestrum nocturnum "Lady of the night)".
  - `fragment`: Lagenaria siceraria "White -fld"; Plantago lanceolata "Narrow -Eaved Plantain".
  - `trailing-dot`: Veronica spicata "Spiked Speedwell agg.".
  - "Spring starflower." is no longer shown, because it now pools with "Spring starflower". The full stop is not removed from any name.

**40 sampled changes** (evenly spread, as the audit prints them):

```
Acacia auriculiformis: "Ear-leaf acacia" -> "Earleaf acacia" (spelling of the same name (N5, N6))
Adiantum pedatum: "Northern maidenhair fern" -> "Northern maidenhair" (more sources over a preferred flag (N3))
Alstroemeria aurea: "Peruvian Lily" -> "Peruvian lily" (capitals (N6))
Araucaria bidwillii: "Bunya Pine" -> "Bunya bunya" (more sources over a preferred flag (N3))
Asystasia gangetica: "Primrose" -> "Chinese violet" (a generic noun set back (N3))
Betonica officinalis: "European hedge-nettle" -> "Betony" (more sources over a preferred flag (N3))
Capsicum frutescens: "Bird pepper" -> "Spur pepper" (more sources over a preferred flag (N3))
Cereus hexagonus: "Lady of the Night Cactus" -> "Lady of the night cactus" (capitals (N6))
Citrus trifoliata: "Japanese Bitter-orange" -> "Japanese bitter-orange" (capitals (N6))
Cordyline australis: "Cabbage-palm" -> "Cabbage tree" (more sources over a preferred flag (N3))
Cota tinctoria: "Yellow chamomile" -> "Golden chamomile" (more sources over a preferred flag (N3))
Dacrycarpus dacrydioides: "White Pine" -> "White pine" (capitals (N6))
Dillenia indica: "Elephant Apple" -> "Elephant apple" (capitals (N6))
Echinocereus pectinatus: "Órgano-pequeño Peine" -> "Rainbow cactus" (more sources over a preferred flag (N3))
Eriophyllum lanatum: "Woolly sunflower" -> "Common woolly sunflower" (more sources over a preferred flag (N3))
Eucalyptus robusta: "Swamp-mahogany" -> "Swampmahogany" (spelling of the same name (N5, N6))
Fatsia japonica: "Paperplant" -> "Glossy-leaf paperplant" (sources pooled across spellings (N5))
Glebionis coronaria: "Garland Daisy" -> "Crowndaisy" (more sources over a preferred flag (N3))
Helleborus niger: "Black hellebore" -> "Christmas-rose" (more sources over a preferred flag (N3))
Inga edulis: "Ice Cream Bean" -> "Ice cream bean" (capitals (N6))
Kalanchoe blossfeldiana: "Flaming katy" -> "Madagascar widow's-thrill" (more sources over a preferred flag (N3))
Ligustrum lucidum: "Tree privet" -> "Glossy privet" (more sources over a preferred flag (N3))
Magnolia figo: "Banana Magnolia" -> "Banana-shrub" (more sources over a preferred flag (N3))
Malvaviscus arboreus: "Wax mallow" -> "Turk's-cap" (sources pooled across spellings (N5))
Mesembryanthemum cordifolium: "Heart-leaf Ice-Plant" -> "Heart-leaf ice-plant" (capitals (N6))
Morella californica: "Pacific bayberry" -> "California wax-myrtle" (more sources over a preferred flag (N3))
Nerine sarniensis: "Guernsey Lily" -> "Guernsey lily" (capitals (N6))
Opuntia stricta: "Erect Pricklypear" -> "Erect prickly pear" (spelling of the same name (N5, N6))
Pediocactus paradinei: "Park Pincushion-cactus" -> "Park pincushion-cactus" (capitals (N6))
Phlox paniculata: "Garden phlox" -> "Fall phlox" (more sources over a preferred flag (N3))
Polygonatum biflorum: "Giant Solomon's-seal" -> "King Solomon's-seal" (more sources over a preferred flag (N3))
Pycnanthemum muticum: "Blunt mountain-mint" -> "Clustered mountain-mint" (sources pooled across spellings (N5))
Rosa glauca: "Glaucous rose" -> "Red-leaved rose" (more sources over a preferred flag (N3))
Sclerocactus mariposensis: "Lloyd's Mariposa cactus" -> "Golfball cactus" (more sources over a preferred flag (N3))
Solanum betaceum: "Tree Tomato" -> "Tree tomato" (capitals (N6))
Spiraea cantoniensis: "Reeves' meadowsweet" -> "Reeve's spiraea" (sources pooled across spellings (N5))
Symphyotrichum laeve: "Smooth aster" -> "Smooth blue aster" (more sources over a preferred flag (N3))
Tamarix ramosissima: "Odessa tamarisk" -> "Salt cedar" (more sources over a preferred flag (N3))
Tillandsia usneoides: "Old Man's Beard" -> "Spanish moss" (more sources over a preferred flag (N3))
Viburnum dentatum: "Arrow-wood viburnum" -> "Arrow-wood" (sources pooled across spellings (N5))
```

**Changes the owner should look at.** The rule decides these from the data, and some are worse than before:

- **Euphorbia milii, "Crown-of-thorns" → "Christplant".**
  - Once spellings pool, "Christ plant" and "Christplant" have 3 sources, the same as "Crown of thorns".
  - The tie goes to GBIF's order.
- **Kalanchoe daigremontiana, "Mother-of-millions" → "Devil's backbone".** This one is by sources.
- **Bellis perennis, "Daisy" → "Lawndaisy".**
  - "Daisy" is a generic noun, so it is set back.
  - "Lawn daisy" and "Lawndaisy" pool to 7 sources. USDA and GRIIS write it closed, so the closed spelling has the most sources.
- **Agave americana stays "Centuryplant".** The name pools to 6 sources, and the closed spelling has 5 of them against 4 for "Century plant" and "century-plant".
- **Gunnera manicata, "Brazilian Giant rhubarb".** The capitals are mixed, because no source writes "giant" in lower case.

The full list of 411 is in `/tmp/r67/N-headlines.txt`. The headline changes among the succulents are listed in that file too; these are some of them:

| Species | Before | After |
|---|---|---|
| Opuntia ficus-indica | Tuna cactus | Indian-fig |
| Yucca brevifolia | Western Joshua Tree | Joshua tree |
| Ferocactus wislizeni | Fishhook barrel cactus | Candy barrel cactus |
| Euphorbia lactea | Devil's Walking Stick | Mottled spurge |
| Tradescantia zebrina | Inch-plant | Inchplant |

## Files changed (all mine)

**New:**
- `src/lib/dossier/drops.ts`
- `src/lib/dossier/rederive.ts`
- `tests/unit/r67n-names.test.ts`
- `tests/unit/r67n-search.test.ts`
- `tests/unit/r67n-builder.test.ts`
- `tests/unit/r67n-search-route.test.ts`

**Changed:**
- the dossier code: `src/lib/dossier/{index-entry,build,bulk,fetch,changed (a comment only)}.ts` and `src/lib/dossier/sources/gbif.ts`
- search: `src/lib/core/{search,postings,sheet}.ts`
- rain words: `src/lib/climate/climograph.ts`, `src/lib/share/card.ts`, `src/lib/ui/Climograph.svelte`, `src/lib/ui/ref/{Glance.svelte,head.ts}`
- scripts: `scripts/{build-dossiers.ts,audit-common-names.ts,specialist-genera.txt}`
- existing tests of that code: `tests/unit/{climograph,r60x-pages,r61q-common-name-rule,r62q-common-names,r63c-climate,r63n-names,sheet,units}.test.ts` and `tests/e2e/r63c-fallbacks.spec.ts`

## Items

### N1. Older names past the sixth: searched

**What changed:**
- `src/lib/dossier/index-entry.ts`
  - New `olderNamesOf(accepted, synonyms)`. It returns `syn` (the six shown, unchanged) and `older`: every other older name of species rank (binomials only).
  - New optional `IndexEntry.older`.
- `scripts/build-dossiers.ts`: `indexEntry` writes `older`.
- `src/lib/core/search.ts`:
  - `Searchable.older` is new.
  - `prepare` reads `syn` and `older` as older names.
- `src/lib/core/postings.ts`: `entryWords` includes `older`.

**Through the route harness**, the real `GET /api/search` over the real corpus rebuilt with these rules (`tests/unit/r67n-search-route.test.ts`, which adopts B's `rev66b-probe.test.ts`):

| Query | First hit |
|---|---|
| Ferocactus glaucescens | Bisnaga glaucescens |
| Mammillaria conoidea | Cochemiea conoidea |
| Neolloydia conoidea | Cochemiea conoidea (then C. matehualensis) |
| Opuntia longispina | Airampoa corrugata (then Opuntia orbiculata, Cylindropuntia leptocaulis) |

For a sample of queries, the route's answer through the postings equals the whole index's answer. Sizes are above.

**Needs:**
- S: `dossiers.ts` `bySynonym` reads `older`, so `/species/<older name>` is answered from the index.
- S: the edge key becomes `search6`.
- R: `import/check.ts` `readSearch` reads `older`, so an import line under such a name is "older name" with the key, not "not in the reference".

**Tests** (`tests/unit/r67n-search.test.ts`, "N1", 2 cases; `tests/unit/r67n-names.test.ts`, "olderNamesOf"; the route harness): all fail on the base.

### N2. Common names read whole, one name at a time

**What changed** (`src/lib/core/search.ts`):
- `Prepared` keeps each common name's words apart (`commonNames`, the headline first).
- `rank()`: the words that fall to the common names must all sit in one of them, as older names already had to. Place words are matched as written, then a common name, then one older name for what is left.
- `inCommon` (the whole reading, `hasExact`, `droppedLabel`) asks one name to hold every word.
- The query is read whole against each common name on every query, as a group of the order (N8), not only when the botanical reading drops words.

**Pooled-match count** (`rev66b/pooled.ts`; "junk" means a hit whose single common name and scientific name do not hold every typed word):

| | Queries | Junk first | Junk hits / all hits |
|---|---|---|---|
| Base, on the corpus index | 3,697 | 203 | 790 / 5,330 |
| This round, on the rebuilt index | 3,684 | **0** | 481 / 5,067 |

The 481 left are mostly a common name's word with a word of a place or of the scientific name ("china aster" also lists Anaphalis, after Callistephus). The triage leaves those to N8's order.

**Route results:**
- "snake plant" is Dracaena trifasciata first. Yarrow is not in the top 20.
- "cape aloe" is Aloe ferox.
- "natal plum" is Carissa macrocarpa.
- "rainbow cactus" is Echinocereus pectinatus.

**Where I depart from the item.** It says to read the query whole against the common names first, as `/about/how` does: "First as a whole, against the common names … When that finds nothing, as a botanical name". Read literally, a common-name hit would end the search. "aloe", "agave", "mammillaria" or "cop" would then answer only the species whose English names hold the word, and drop every Aloe or Copiapoa that has no such name.

So the common-name reading runs on every query as a group of one order:
1. a name typed as a name (rank 0: every word in the name, the genus first);
2. an older name typed as one (a binomial at least, every word but the last written in full);
3. one common name holding every word;
4. the rest.

"fig", "onion", "snake plant" and "cape aloe" are answered by the common name; "aloe", "cop" and "aloe vera" stay names. P's need rewrites the `/about/how` and `/about/formats` sentences to say this.

**Tests** (`r67n-search.test.ts` "N2", 3 cases; route harness): fail on the base, guards excepted.

### N3. The headline rule

**What changed** (`src/lib/dossier/index-entry.ts` `englishNames`):
- The order is now tier, then distinct sources, then preferred (a tie-break), then GBIF's order.
- Tier 1, after every fuller name, now also holds:
  - a single generic noun (`GENERIC_NOUNS`: bulb, buttercup, cactus, cherry, daisy, fern, flower, grass, herb, lily, orchid, palm, plant, poppy, primrose, shrub, succulent, tree, vine, weed, and each with an "s");
  - a one-word list part (N7).
- Tier 2 (set back) now also holds the species' own binomial.
- I took "fig", "apple", "plum" and "rose" off the generic list after measuring. "Fig" is Ficus carica's true name; on "Fig" → "Edible fig" the list was wrong.
- Copiapoa cinerascens and C. serpentisulcata keep "Cactus", their only name.
- Lophophora williamsii stays "Indian-dope": no source gives "Peyote".

**Counts** are above (278 + 6 + 1).

**Tests** (`r67n-names.test.ts` "N3", 3 cases): fail on the base.

**Existing tests updated** to the triage's decision. Each expectation was flipped with a comment:
- `r61q-common-name-rule.test.ts`: "preferred outranks sources" → "sources outrank preferred"; Aloe vera's own binomial set back.
- `r63n-names.test.ts`: "Aloe vera" after "Aloe".

### N4. The builder

**What changed:**
- `src/lib/dossier/fetch.ts`: a `skipped` (not asked) `FetchResult`.
- `src/lib/dossier/rederive.ts` (new):
  - `offlineFetcher` writes `{ status: 'skipped', detail: '<host> not asked: offline re-derivation' }`, never `refused`.
  - `carryRederivedRows` never carries the core rows one by one, and never carries "not asked: N wild photographs already from the GBIF download" without wild GBIF photographs in the dossier. Without them it writes a `skipped` row whose detail does not start "not asked", so `--fill inat` asks again.
- `src/lib/dossier/build.ts`:
  - `mark` takes `skipped`.
  - A distribution or occurrence source not asked leaves the climate `pending` ("…was not asked when this page was built…"), not `refused`.
- `src/lib/dossier/sources/gbif.ts`: the occurrence pager passes `skipped` through.
- `src/lib/dossier/bulk.ts`: `apiPath` makes the media request of a species the download left to the API path go through to the source. It used to read "no photograph" from a download that never held the species, which is how the 120 lost theirs.
- `scripts/build-dossiers.ts`:
  - It reads `bulk/api-path.txt`.
  - The previous dossier's range, records, marker and climate are carried as one snapshot when this build did not ask (in a rederive too).
  - `fillPhotos` treats a "not asked" wild row as done only while the dossier holds those photographs.
  - **`--keys <file>`**: one key per line, a name optional; it rebuilds those species online and keeps the rest.
  - After each built species it compares with the previous file (`src/lib/dossier/drops.ts`, new, `dropsBetween`). It writes `drops.txt` and sets exit code 1 when photographs dropped to zero or a source or the climate turned refused (or `error`).
- `scripts/audit-common-names.ts --before` fails the same way between two indexes (`indexDrops`).

**Checked end to end** on a sandbox copy of 3 real dossiers (Aeonium tabulaeforme, Copiapoa cinerea, Sprekelia formosissima), offline, no network:
- `wcvp.distribution` is `skipped` with "api.gbif.org not asked: offline re-derivation".
- The inat wild row is reopened.
- Without network the occurrence search failed, and the run listed those losses in `drops.txt` with exit code 1.

**Not done: the online rebuild itself.** There is no network here; the owner runs it (step 1). The list has 156 keys (8 species are in both the 120 and the 44). 129 of the 156 reached occurrences by the API path.

**Tests** (`tests/unit/r67n-builder.test.ts`, "N4", 9 cases): fail on the base; there, the modules do not exist, and with stand-ins the behaviours fail too. The `--keys` and exit-code checks read the script's source; the rest are behavioural.

### N5. Spellings pool

**What changed** (`index-entry.ts`):
- `nameKey` (now exported) folds accents, drops apostrophes and a trailing full stop, and joins open and closed compounds.
- Each source counts once per spelling as well as per name: the spelling choice now uses source sets, not row sums (R45-9).
- Of the spellings, the shown one is chosen in this order: a form without a trailing dot first; then, by sources, open or closed; then the hyphens; then the case variant with the fewest unmeant capitals.

**Counts:** 34 + 26 headlines. The 302 repeating lines under titles are gone.

**Tests** (`r67n-names.test.ts` "N5", 3 cases): fail on the base.

### N6. Capitals across hyphenations

**What changed:** new `casedSpelling` in `index-entry.ts`.
- Capitals are read word by word across every spelling of the name, whatever its hyphens.
- A meant capital is kept or given:
  - "star-of-Bethlehem" makes "Star of Bethlehem";
  - "wandering-Jew" makes "Wandering Jew";
  - "sweet William catchfly" makes "Sweet-William catchfly".
- An unmeant capital is lowered where some source writes the word in lower case:
  - "Mexican orange";
  - "Lady of the night cactus";
  - "Hawai'i birdnest fern" (not "Hawai'I").

**Where I depart from the item: small words are not counted as lower case.** The triage asks for it (R45-9). I measured it on the real corpus: it changes 16 shown names, every one for the worse:
- "Mother of thousands" → "Mother of Thousands"
- "Lily-of-the-valley" → "Lily-of-The-Valley"
- "String of fishhooks" → "String of Fishhooks"
- "Tree of heaven" → "Tree of Heaven"

None changed for the better. R45's examples were built lists; B's lexicon search of the corpus found 9 lost proper nouns, all fixed by the cross-hyphen reading. A guard test pins the decision.

**Counts:** 66 headlines by capitals.

**Tests** (`r67n-names.test.ts` "N6", 3 cases): fail on the base, guards excepted.

**Existing tests updated:**
- `r61q-common-name-rule.test.ts` and `r62q-common-names.test.ts`: "String-of-Pearls" with "String of pearls" now shows "String-of-pearls".
- "Japanese privet" (with a comment).

### N7. Commas in brackets; a one-word list part

**What changed** (`index-entry.ts`):
- `namesOf` splits only at depth 0 of round or square brackets.
- A one-word name that no source gives alone (only as a list part) goes to tier 1.

**Tests** (`r67n-names.test.ts` "N7", 2 cases): fail on the base.

**Existing tests updated** (`r63n-names.test.ts`):
- "Kaki" from a list now follows "Japanese Persimmon".
- The heather cases now use two-word names, so they keep their intent.
- `r61q`: "Iris, flag" now gives "Butterfly iris".

### N8. Search order

**What changed** (`src/lib/core/search.ts`):
- `group()`: the groups as above.
- `closeness()`, within a group:
  1. an exact name, the headline first (headline only within the common group);
  2. every word a whole word;
  3. the headline holding every word (common group);
  4. the alphabet.
- `farness()`: near hits are ordered by edit distance against whole words, before the alphabet.
- `relaxedQuery` never retries two words whose second is a small word (of, the, and, de, la, …).

**Measured** (`rev66b/headline-rank.ts`; each headline searched as typed):

| | Searched | Not first | Not in the top 5 | Missing from the top 60 |
|---|---|---|---|---|
| Base | 4,082 | 526 | 58 | 0 |
| This round | 4,082 | 11 | 0 | 0 |

All 11 left are true ties: two species whose headlines differ only by a hyphen or the case, such as "Fire-Lily" and "Fire lily", or "Bird of paradise" and "Bird-of-paradise".

**Typing errors** (`rev66b/typo.ts`, 5,855 epithet typos): the right species was first in 5,847 of 5,855 on the base, and in 5,852 of 5,854 now. One typo no longer counts as a near case, because it now finds an exact hit. The 2 left are fair answers:
- "Ceropegia leachmi" is one edit from C. leachii and from C. leachiana's older name "Huernia leachii", so the alphabet decides.
- "Echinocereus scherei" is one letter short of E. schereri, but a swap from E. scheeri, and the distance used counts a swap as two edits.

**Route results:**
- "fig" is Ficus carica first.
- "onion" is Allium cepa.
- "kiwi" is Actinidia chinensis.
- "Ceropegia pica" is C. picta.
- "Aloe verra" is Aloe vera.
- "Lily of St. James" and "Rose of Jericho" are not retried as "Lily of" and "Rose of".

**Speed.** I rewrote `rank` without closures created per call: under `tsx`/esbuild, `__name` wrapping made them the hot spot. On a whole-index search with no other load, the rewrite is close to the base; I could not measure it cleanly on this shared machine.

**Tests** (`r67n-search.test.ts` "N8", 6 cases; route harness): fail on the base, guards excepted.

**`search.test.ts` "c":** the first version of the order failed it, putting Copiapoa cinerea, headlined "Silver cactus", before Conophytum. Limiting the headline criterion to the common-name group fixed the code, and the test is unchanged: a name typed as a name is never put after another for its headline.

### N9. The audit flags fragments, trailing dots and unmatched brackets

**What changed:**
- `index-entry.ts`: new `nameFlags(spelling, alone)`.
  - `fragment`: a word under 4 letters that a source gives only inside a list, or a word cut by " -".
  - `trailing-dot`: abbreviations such as "St." apart.
  - `bracket`: a bracket that is not matched.
- `scripts/audit-common-names.ts`: new `--dossiers <dir>` mode (`auditDossiers`). It recomputes every entry's names from the dossiers with this checkout's rules, against the dir's `index.json`, and reports:
  - the changed headlines by cause, with a sample;
  - the changed lines under titles;
  - the older names the search gains;
  - the flagged names, each with a sample.
- No spelling is rewritten. IND's "Lady of the night)" is flagged and shown as WoRMS gives it.
- The audit cannot catch "Pigeo" and "Country": they are 4 letters or more and read as words.

**Tests** (`r67n-names.test.ts` "N9", 3 cases): fail on the base.

### N10. The sitemap fingerprint: what I did instead

**I did not leave carried statuses out of the fingerprint**, and `src/lib/dossier/changed.ts` keeps its rule; it gains only a comment saying why. Read literally, the item would make things worse:
- A row asked by one build and carried by the next would change the fingerprint. Every switch between an online build and an offline one would then move the day of every page.
- That is the churn B13 complained of, and the existing invariant test, "a rebuild that changes only its dates and notes keeps the day" (`r63c-sitemap.test.ts`), fails under it.

B13's flip came from the offline run writing `refused` for a source it never asked. That is fixed at the source by N4:
- The fetcher writes `skipped`.
- The builder carries the previous build's row, with the previous status, so the fingerprint does not change.

The 8,947 dossiers all stamped 2026-10-09 cannot be re-dated from what is on disk.

**Tests** (`r67n-builder.test.ts` "N10"):
- A rebuild that carries its rows keeps the day: a guard.
- The base's offline "refused" moves the day.
- The offline fetcher now writes `skipped`: fails on the base.

### N11. Rain words

**What changed:**
- `src/lib/core/sheet.ts`:
  - The season reading's long sentence says "Rain at the habitat is N mm in the median year (across the grid cells of the range, CHELSA)", in both branches (S-F3).
  - "70% of the year's rain" becomes "70% of the median year's rain" (4 sentences and a comment).
- `src/lib/ui/ref/Glance.svelte`: the sub-line reads "N months of 25 mm or more in the median year".
- `src/lib/share/card.ts`: the same sub-line, "… or more in the median year · CHELSA".
- `src/lib/climate/climograph.ts` and `src/lib/ui/Climograph.svelte`: their descriptions say "N mm of rain in the median year (the twelve monthly medians added)".
- `src/lib/ui/ref/head.ts`: the link preview's fallback (a dossier with no cells' median) says "N mm of rain in the median year (CHELSA)". The longer wording pushed the line past 155 characters, and the rain part was dropped.
- The labels "Rain a year (median across the range)" and "Rain a year (sum of monthly medians)" stay. They name the figure, and compare uses the same label.

**Tests:**
- `r67n-builder.test.ts` "N11": a behavioural sheet case, Aloidendron dichotomum (133 at the top, 114 here), and source checks for the other surfaces. Both fail on the base.
- Existing tests updated to the new words (each with a comment): `sheet.test.ts`, `units.test.ts`, `climograph.test.ts`, `r60x-pages.test.ts`, `r63c-climate.test.ts`, and the e2e `tests/e2e/r63c-fallbacks.spec.ts` line 23. I did not run that e2e spec.
- `r62w-words.test.ts` (line 34) and `r62bw-words.test.ts` (line 263) are P's. Their changes are need 9, and both fail in my copy until it is applied.

**Need:** P's three `/about/how` sentences:
- "how many months of the median year bring 25 mm or more";
- "70% of the median year's rain" (twice);
- "Under 120 mm in the median year (its twelve monthly medians added)".

### N12. Ceropegia

**What changed:**
- `scripts/specialist-genera.txt`: the header no longer lists Ceropegia among the very large genera not taken whole. It says Ceropegia is here and taken whole, with Brachystelma and the stapeliads under it.
- The genus list itself is unchanged, so the count of 173 holds.

**Test:** `r67n-builder.test.ts` "N12" fails on the base.

**Need:** P's `/about/how` sentence (in my needs).

### N13. Tile credits at 200% text

The tile markup is in V's `src/routes/+page.svelte` (`.fcred`, `.cred`) and P's species page (`.rc`), so both changes are needs:
- Two lines, clamped (`-webkit-line-clamp: 2; overflow-wrap: anywhere`), in place of one line with an ellipsis.
- The licence leads the credit, so it is always on the first line.

`tileCredit` in `src/lib/ui/ref/head.ts` (mine) is unchanged; "Photo: " is kept, since "CC BY, Wolfgang …" alone does not say what it credits.

**Not done:**
- No e2e test at 200% text. The markup is not mine, and H owns the root-font-size helper (H3).
- R45-12's hero credit line (the species page) is not in N13.

## Needs (all in `/tmp/r67/N-needs.md`, as diffs against `/tmp/r67base`)

1. **P:** `/about/how`: names, search, Ceropegia, rain. Plus the seam assertion in `tests/unit/r62bw-words.test.ts:194`, which checks the old "preferred first" sentence.
2. **P:** `/about/formats`, the search paragraph.
3. **S:** `src/lib/server/dossiers.ts`, `bySynonym` reads `older`.
4. **S:** `src/routes/api/search/+server.ts`, the edge key `search5` → `search6`.
5. **S:** `docs/DEPLOY.md`, round sixty-seven's corpus step.
6. **R:** `src/lib/import/check.ts`, `readSearch` reads `older`.
7. **V:** `src/routes/+page.svelte`, the tile credit on two lines.
8. **P:** `src/routes/species/[slug]/+page.svelte`, the Related tile credit on two lines.
9. **P:** `tests/unit/r62bw-words.test.ts` line 263 and `tests/unit/r62w-words.test.ts` line 34, the rain words.

## How "fails on the base" was shown

I copied the base (`/tmp/r67base`) to a scratch folder, linked this copy's `node_modules`, and ran the new test files there:

| Test file | Failed on the base | Passed on the base |
|---|---|---|
| `r67n-search.test.ts` | 8 | 3 (the guards) |
| `r67n-names.test.ts` | 13 | 2 (the guards) |
| `r67n-builder.test.ts` | 13 | 1 (the guard) |

- For `r67n-names` and `r67n-builder`, the new exports and modules were replaced by stand-ins that throw. The behavioural cases on base code fail on their assertions.
- `r67n-search-route.test.ts` cannot load on the base (`olderNamesOf`). B's `rev66b/answers.json` records the base's answers to the same queries: "Ferocactus glaucescens" gives nothing; "Neolloydia conoidea" gives Cochemiea matehualensis first.

## Unit tests run (one file at a time) and svelte-check

- **New:**
  - `r67n-names.test.ts`: 15 passed.
  - `r67n-search.test.ts`: 11 passed.
  - `r67n-builder.test.ts`: 14 passed.
  - `r67n-search-route.test.ts`: 6 passed, over the real corpus, in about 30 s.
- **Existing, touching names, search, postings, products, the API search, the builder, bulk, fetch, changed, sheet, card, climograph, Glance, head, the audit, the genera file, the sitemap and the import check** (66 files in the final run):
  - Every one passed: 742 tests, one skipped, as before.
  - That run was before I handed two of P's words tests back as need 9. With the base versions restored, `r62bw-words.test.ts` and `r62w-words.test.ts` each fail one case in my copy until need 9 is applied.
  - The files: build, bulk, climate, climograph, corpus-r60, fetch, hooks-r60, md5, note, openalex, postings, products, r60-corpus-fuzz, r60-proposed-corpus, r60-search-relaxed, r60f-import, r60x-arch, r60x-pages, r61h-near-charge, r61h-search-cache, r61h-search-citation, r61h-sheet-lead, r61q-common-name-rule, r61q-fuzz-grower, r61q-refusal-walk, r61q-search-grower-names, r61q-search, r61q-sitemap, r61w-about-seams, r61w-rules, r61w-words, r62bg-import, r62bq-rev-common-names, r62bq-rev-picked-name, r62bq-rev-readings, r62bq-search, r62bw-lapse-sheet, r62bw-words-species, r62bw-words, r62q-audit-args, r62q-common-names, r62q-fuzz-readings, r62q-names-step, r62q-search-readings, r62w-about-seams, r62w-words, r63c-climate, r63c-credit, r63c-refusal, r63c-sitemap, r63fd-words, r63n-names, r63n-search-near, r63z-name-case, search-api, search-generations, search, sheet, short-path, sitemap, sync-hardening, units, and the four r67n files.
  - Once P applies need 1, `r62bw-words.test.ts` line 194 needs the assertion in that need.
- **svelte-check `--threshold error`:** 957 files, 0 errors, 0 warnings.
  - It ran before the last change to `rank` and `group` in `search.ts`.
  - `tsc` afterwards, on `search.ts`, `postings.ts`, `index-entry.ts`, `rederive.ts`, `drops.ts` and the two scripts, also found no errors.
- **E2E: not run.** No spec of mine needed a build. I edited one e2e assertion: `tests/e2e/r63c-fallbacks.spec.ts`, line 23.
- **`tsc`** on `scripts/build-dossiers.ts` and `scripts/audit-common-names.ts` (`tsconfig.scripts.json`): no errors.
