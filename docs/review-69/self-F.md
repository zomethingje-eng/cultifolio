# Self-review of round sixty-nine: reviewer F (the account against the code, names and search, the about pages)

Working copy `/tmp/claude-0/rev69/F` at the deployed code; live site `cultifolio.com`, corpus `540c129738556840`, index fetched from `/api/index` on 12 October (8,947 entries, 569 with `spellings`). Searches over the whole index were run with the repository's own `prepare`/`search` (`src/lib/core/search.ts`) under `tsx`, and spot-checked against `/api/search`. Every source change made to test a mutation or a fix was reverted (`git status` clean).

## Findings

### 1. An older name of two species redirects to one, and the page says GBIF accepts it as that one (confirmed)

`src/lib/server/dossiers.ts:438-447` (`synonymMaps`) sends a name one species shows and another holds only for the search to the one that shows it. "Shown" is an accident of `olderNamesOf` (the first six, other genera first), not of taxonomy. The page then reads `src/routes/species/[slug]/+page.svelte:351`: "*X* is a synonym: the GBIF backbone accepts this species as *Y*". For a homonym, GBIF accepts it as two species, so the sentence is untrue (rules 1 and 3).

On the live index, 215 shared names redirect this way. In 11 of them the species that keeps the epithet, usually the homotypic one, is the other holder, and the site's own search puts that other species first:

| Address | Goes to | Search's first hit (GBIF's homotypic record) |
|---|---|---|
| `/species/echeveria-farinosa` | Dudleya pulverulenta | Dudleya farinosa (*E. farinosa* Lindl. → *D. farinosa* (Lindl.) Britton & Rose) |
| `/species/cissus-quinquefolia` | Parthenocissus inserta | Parthenocissus quinquefolia |
| `/species/hessea-spiralis` | Strumaria pygmaea | Strumaria spiralis (*H. spiralis* (L'Hér.) → *S. spiralis*) |
| `/species/aloe-obliqua` | Gasteria pulchra | Gasteria obliqua (*A. obliqua* (Aiton) Haw. → *G. obliqua*) |
| also | Drimia revoluta, Pyrus hybrida, Ceropegia tuberosa, Colchicum parvulum, Nepenthes rubra, Pinguicula variegata, Solidago glabra | |

Reproduction: `curl -sI https://cultifolio.com/species/echeveria-farinosa` gives `302` to `/species/dudleya-pulverulenta?was=Echeveria%20farinosa` with `cache-control: public, max-age=86400`. That page says "Echeveria farinosa is a synonym: the GBIF backbone accepts this species as Dudleya pulverulenta". `/api/search?q=Echeveria%20farinosa&n=5` gives Dudleya farinosa first. GBIF `species?name=Echeveria farinosa` lists 4201930 (Lindl., synonym of Dudleya farinosa) and 11280935 (Van Houtte, synonym of D. pulverulenta).

Fix: in `synonymMaps`, a name held by two species is ambiguous unless exactly one holder keeps its epithet stem, and then it goes to that one, as the search does. At the least, the `?was=` sentence should not say "accepts this species as" when the index has two holders.

### 2. The search ranks a species showing a *variety* above the species holding the exact older name (confirmed; a regression of N1)

`src/lib/core/search.ts:531-536` (`olderOrder`) counts a species as "showing the name" when any shown older name holds the typed words (`olderTyped`), and `collect` (line 658) sorts by `o` before `c`, which is exact before whole words. So a shown variety beats an exact search-only name. Typed exactly, 162 of the live index's 36,804 binomial older names put first a species that holds no such name:

- "Opuntia longispina": O. orbiculata, then **Cylindropuntia leptocaulis** (shows "Opuntia frutescens var. longispina"), then Airampoa corrugata, which holds the name exactly. The code comment at line 529 says this case was meant to be prevented.
- "Cornus mascula": **Cornus officinalis** ("Cornus mascula var. japonica") before Cornus mas. `/species/cornus-mascula` goes to Cornus mas, so the search and the address disagree.
- "Crataegus oxyacantha": C. laevigata ("C. oxyacantha f. …") before C. monogyna. "Huernia scabra": Ceropegia quinta before C. thuretii. "Amaryllis pallida": Ammocharis coranica before Amaryllis belladonna.

`/about/how` says "Within each, a name that is exactly the query comes first" and "then the one that shows the name among its six". The code keeps neither for these names.

Reproduction: `/api/search?q=Cornus%20mascula&n=3` gives `Cornus officinalis ; Cornus mas`. Script: `scratchpad/scripts/older.mts` over `/api/index`.

Fix (tested): in `olderOrder`, rank an exact match of the typed name first, and count "shown" only for an exact shown name:
```ts
const typedAt = olderTyped(p, qs, match);
const exact = typedAt.some((at) => same(p.synWords[at], qs));
const shown = typedAt.some((at) => at < p.shownSyn && same(p.synWords[at], qs));
return (exact ? 0 : 4) + (keeps ? 0 : 2) + (shown ? 0 : 1);
```
This fixes 136 of the 162. The other 26 are tautonyms and prefixes answered by the name group, which is right. `r69n-older-names`, `r69n-search-ties` and `r67n-search-route` stay green (46 of 46).

### 3. Older names with a hyphenated epithet never redirect (confirmed)

`nameFromSlug` (`src/lib/server/synonyms.ts:26-33`) splits on every hyphen, so `arbutus-uva-ursi` becomes "Arbutus uva ursi". `bySynonym` and `ambiguous` are keyed "arbutus uva-ursi", so neither matches, and GBIF is asked a name it does not hold. `/species/arbutus-uva-ursi` is a 404 ("No species page … Did you mean Arctostaphylos uva-ursi?"), although the index holds "Arbutus uva-ursi" for that one species and the search finds it. The live index has 230 such names that only one species holds (`sempervivum-castello-paivae`, `cotyledon-montium-klinghardtii`, `coilonox-bruce-bayeri`, …), and no shared hyphenated name can reach the N1 404. Fix: key both maps by `slugify(name)` as well, and look the address's slug up directly.

### 4. The index's photograph count is not the page's (confirmed)

`scripts/build-dossiers.ts:194` counts `shownPhotos(d.photos, …)`, but the page reads `shownPhotos(dedupePhotos(d.photos.filter(webUrl…)))` (`src/lib/dossier/schema.ts:294`). An iNaturalist photograph stored twice (once from GBIF's media, once from iNaturalist) is counted twice in the index. In 5 of 14 dossiers sampled the counts differ: Polyscias guilfoylei shows 9 photographs and the index says 13; Pelargonium graveolens 45 and 53; Eucalyptus robusta 126 and 129; Vitex rotundifolia 49 and 52; Opuntia orbiculata 48 and 51. Reproduction: compare `len(/api/dossier/<key>.photos)` with the entry's `photos` in `/api/index`.

This breaks two claims. Triage K1 and section 1 say the rule applies "in the index's lead and count", and `/about/formats` says "`photos`, which counts the photographs the species page shows". The inflated count also feeds N2's photograph tie-break: "rose geranium" puts P. capitatum (56) before P. graveolens (53 in the index, 45 on its page). Fix: build the index entry from the same `dedupePhotos` and `webUrl` filtering as `safeUrls`, or from `safeUrls` itself.

### 5. The summary rule quotes another species of the genus, and genus pages the regex misses (rule confirmed; page impact suspected)

`/about/how` says: "Another species of the species' own genus is never quoted, and neither is a genus whose opening does not name the species." The code does both.

- `redirectIsThisSpecies` (`src/lib/dossier/sources/wikimedia.ts:287`) takes any two-word title whose epithet passes `sameEpithet` before it checks the genus. `sameEpithet` (line 256-265) allows **two** edits at six letters or more. So `redirectIsThisSpecies('Conophytum minutum', '…', 'Conophytum minimum', [])` returns `true`. Section 15 and `photo-kind.ts` treat two letters as another species, and use that same pair as the example. The reference holds 178 same-genus pairs within this distance (Acer saccharinum and saccharum, Agave involuta and revoluta, Albuca bifolia and unifolia, …), so any lumping redirect between them would quote the wrong plant.
- The genus test is `/\b(is|was|are) an? (small |large |monotypic )?genus\b|\bgenus of\b|…/`. Wikipedia's real lead for Peperomia, "Peperomia is one of the two large genera of the family Piperaceae…", passes it. So does Mammillaria's "one of the largest genera in the cactus family", and so does "is a plant genus". With these leads `redirectIsThisSpecies('Peperomia', lead, 'Peperomia rotundifolia', [])` returns `true` (`scratchpad/scripts/redir2.mts`).

I could not check which live dossiers are affected: Wikipedia and Commons answered 429 to the shared address. Fix: require the same genus to pass `stem` equality only, not two edits; add `genera\b` and `\bgenus\b` anywhere in the first sentence to the regex. Neither the seam tests nor `r69-summary-leads.test.ts` hold a near-epithet or a "genera" lead.

### 6. "A family from its start" also matches a whole genus name (confirmed)

`familyMatch` (`src/lib/core/search.ts:406`) matches any typed word of six letters or more against the start of a family. Seventeen genera of the reference begin their family's name (Crassula, Euphorbia, Protea, Bursera, Strelitzia, Commelina, Dioscorea, Verbena, Zingiber, …). Typing the genus therefore matches the whole family. Of 681 queries made of these genera and their species, 64 change against `FAMILY_START = 99`. Live: `/api/search?q=Crassula%20elegans&n=5` gives Crassula elegans, then Echeveria elegans, Echeveria harmsii, Echeveria simulans and Sedum acre. Without the rule, Crassula elegans is the only hit. "Bursera" adds three Boswellia; "Protea" adds Adenanthos and Banksia; the headline "Giant Crassula" adds Aeonium undulatum and Dudleya brittonii. Fix: match a family from its start only when the word is not itself a whole word of the entry's name or a genus of the reference.

### 7. The 404 for three or more holders says "neither" (confirmed)

`src/routes/species/[slug]/+page.server.ts:51`. `/species/eugenia-malaccensis`: "Eugenia malaccensis is an older name of three species of the reference, Syzygium aqueum, Syzygium malaccense and Syzygium jambos, so this address leads to neither." The live index has 22 such names. Fix: "none of them" when there are more than two.

### 8. The 39 headline changes: four regressions besides False acacia (confirmed against the dossiers)

I read each changed headline's English rows in `/api/dossier/<key>`.

- **Regressions:**
  - **Madia elegans, "Showy tar weed".** "showy tarweed" (Catalogue of Life) and "Showy tar weed" (the World Register of Marine Species) tie, and the open-on-tie rule picks the marine register's misspelling.
  - **Ruellia simplex, "Softseed wild petunia".** Petunia's admission lets this name lead "Mexican blue-bells" by sources, while "Mexican petunia" (1 source) stays fourth.
  - **Pelargonium graveolens, "Sweet scented geranium".** This now leads "Rose geranium".
  - **Eriocapitella hupehensis, "Hubei Anemone".** This wins a tie by GBIF's order, keeping a Title Case capital that no lower-case spelling corrects.
- **Improvements or neutral:** the other 33 (Canada anemone, Tree anemone, Sweet acacia, Rue-anemone, Ming aralia, Swamp-mahogany, Wax gourd, the Pelargonium "geranium" names and the hyphenation changes).

The English-noun list caused no headline changes beyond the 39. Typing every headline, 4,027 of 4,082 find their own species first, as the account says. All 55 misses are headlines that two species share, decided by photographs, some of them inflated (finding 4).

### 9. Sentences on the about pages the code does not keep, and rules the code has that the pages do not state

Each item says whether the seam tests would catch it.

- **a. The Commons misspelling clause** ("an epithet one letter or a hyphen away … is read as the species'"). The code (`photo-kind.ts:83-92`) reads one letter only at seven letters or more (line 88), reads "ae" as "e", and ignores any number of hyphens. The page states none of the three. No seam test reads the clause.
- **b. The Wikidata label sentence.** It omits the plant-kingdom condition (`wikimedia.ts:114`). A GBIF record with no kingdom passes as Plantae. It also does not say that only an item's first three GBIF keys are read (line 109), or that only five label hits are read (line 140). `r67p-about-seams` pins the sentence verbatim and the code's shape, so it would not notice either side's omission.
- **c. The summary sentence.** Finding 5. No seam test reads it.
- **d. "One whose page holds no such version is not shown."** No code does this. `commonsPhoto` keeps the original when Commons gives no thumbnail (`sources/commons.ts:86`), and `shownAt` (`photo-size.ts`) returns `p.url` for an original, at any width, when the width is unknown and the thumb is an original. 47 index tiles are Commons originals. I could not read their widths: Commons answered 429. `r69p-about-seams` ("a file shown at its own size is said") checks only that the page mentions it.
- **e. "then the alphabet, as GBIF lists a species' names"** (N3's text). `englishNames` uses the dossier's row order, which is not always alphabetical: Eucalyptus robusta's IUCN row "Swamp Mahogany" comes after the lower-case rows. Suspected; it decides only ties. Not caught.
- **f. The search paragraph's "the one that shows the name among its six".** Finding 2. Not caught.
- **g. `/about/formats`: "`photos`, which counts the photographs the species page shows".** Finding 4. Not caught.
- **h. Commons categories.** `CATEGORY_KINDS` (`photo-kind.ts:37`) hides any file in a category matching "media from gbif" or "hybrids". The page's list of kinds has no "media from GBIF". Not caught.

### 10. Rule 1 on a species page

Two full pages, Astrophytum myriostigma and Lantana strigocamara, held no unlabelled factual sentence beyond the template notices `/about/how` declares. The one sentence that states an unsourced fact as GBIF's is the `?was=` notice of finding 1. It is wrong for the 11 names listed and incomplete for the other 204 shared names.

## Checked and found done

| Decision or claim | How checked | Found |
|---|---|---|
| K1 kinds, JPEG/WebP only, 50 read, epithet-first, read time | `photo-kind.ts`, `commons.ts` (`COMMONS_READ = 50`), `safeUrls` | Done; index count differs (4) |
| K2 Artist only, cleaning, prune rule | `photo-credit.ts`, `uncreditedPhoto` | Done |
| K3 `pd`, short names only, "attribution" | `commonsLicence`, `licence.ts:25-28`, `NOTICE`, export table | Done |
| K4 sizes 120/250/500/960, srcset, 501-960 at own width | `photo-size.ts` | Done |
| K5 lead order, GBIF before Commons, six | `dedupe.ts` `leadRank`, `build.ts:475-490` | Done (Commons asked under twelve, unstated) |
| M1, M4, M5, M6, M7, M9, M10 | `gbif.ts` media and `--fill gbif-licence`, `endOfRecords`, `IDS_PER_ASK = 30`, `CARRY_DAYS = 90`, `PLANTAE`, `srlimit=${older.length + 1}`, `drops.ts`, `LAG_SPELL = 10` | Done |
| M3 and section 13 | Live dossiers: Weingartia pulchra and Kopsia fruticosa have no summary and record the redirect; Malus domestica's "Apple" is restored with "whose lead is this species'" | Done as described; rule faults in 5 |
| M8 "older names not asked", "not taken: two items answered" | `build.ts:222-225`, `upstream.ts` | Done |
| Section 14 | `crossIds`, `sameNameRecord` against the account | Done; page omits kingdom (9b) |
| Section 15 `misspelt` | Code against the account | Done; page incomplete (9a) |
| N1 redirects, 404, search | Live `aloe-variegata` goes to Gonialoe; `cotyledon-mammillaris` is a 404 naming both, `max-age=300`; 397 ambiguous and 215 redirecting shared names now (522 before the rebuild) | Done; faults 1, 2, 3, 7 |
| N2 ties, apostrophes, spellings, families, nouns | Live: jade plant, hen and chicks, bleeding heart, devils backbone, St Johns wort, bishops cap, blue mink, corn cockle, velvet leaf, aizoac, asparagac, cactace, snake plant; 4,027 of 4,082 headlines first; 756 spellings on 569 species | Done; faults 6, 8 |
| N3 and the merged about text | Live pages against N's needs | Applied |
| W2, W3, W5, W6 | `MAX_LIST_PAGES = 50`, `workerKey` in search, sheets, names, forecast, match; `VAULT_WRITES_PER_HOUR = 3600`; network wording `sync.ts:1315` | Done |
| About: limits, shares, 77 networks, storage keys, locks, channels, caches | Constants in `sync.ts`, `caps.ts`, `counters.ts`; every `cultifolio.*` key, lock, channel and database name in `src` against the list | All stated and all kept |
| P1, P2, X1, X2, X8, R3, sections 11 and 12 | `alert-words.ts`; `afterNavigate` in the layout; `app.html` token and generation; `ExampleChip.svelte`; `db/Opening.svelte`; `tests/e2e/helpers/address.ts`; `engine.init` | Present as described |
| Round-69 unit tests for my area | `vitest run` on r69n ×2, r69p-species-ambiguous, r69-summary-leads, r69p and r67p about seams | 76 of 76 pass; none covers findings 1 to 7 |

## Not done

- The widths of the 47 Commons originals used as tiles, and a live sample of summaries kept through a near-epithet or a "genera" lead. Commons and Wikipedia answered 429 to the shared address.
- X, R and W behaviour beyond the claims above. P4 and P5 engine runs: no Playwright run.
- The 17 Kew ranges taken under older names (M2): not sampled.
