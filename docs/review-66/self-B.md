# Round 66 adversarial review, reviewer B: names, search, climate, credits, sitemap

Corpus: `/tmp/rev66/corpus/v2` (manifest `2dc42914f6c3f6f3`, 8,947 species), used in place of the live site. Working copy: `/tmp/rev66/B`. All probe scripts are in `/tmp/rev66/B/rev66b/`. The route harness `tests/unit/rev66b-probe.test.ts` runs the real `GET /api/search` handler (`shape=2&n=5`) over the real corpus served as static files, using the manifest, postings and short answers. Queries come from `rev66b/queries.txt` and answers are written to `rev66b/answers.json`. Run it with `npx vitest run tests/unit/rev66b-probe.test.ts`. The other scripts run with `npx tsx rev66b/<name>.ts` or `python3 rev66b/<name>.py`.

Consistency check first: `rev66b/names-dump.ts` recomputes `englishNames` for every species, as the build does and as the species page does. It gives **0 differences** from `index.json`. Every name finding below is therefore what the code does today, not drift between the code and the live index.

Ranking: first what a skeptical first visitor hits, then data loss, then the rest.

---

## 1. Older names past the sixth cannot be searched. Well-known label names answer "Nothing in the reference matches", or answer the wrong species without a label. CONFIRMED. High.

- **Where:** `scripts/build-dossiers.ts:161`. `syn` keeps six older names, other-genus ones first and then in GBIF's order, so Linnaean names such as "Cactus coronatus" fill the slots. `src/lib/core/search.ts` searches only `syn`. `/about/how` says a typing error is matched against "its name, its common names and its older names", which reads as all of them.
- **What happens:** the dossiers hold 31,439 older names that the index drops, across 2,313 species. Of the 15,782 that are plain binomials, **13,352 do not find their species**. In the succulent families the count is 4,230, and 2,299 of those are in another genus.
- **Through the real route** (`rev66b/answers.json`):
  - `Ferocactus glaucescens` gives no hits and no relaxed reading. The front page then says "Nothing in the reference matches … It holds a fixed list of 8,947 species". Bisnaga glaucescens is in the reference, and this is the name on most labels. The page states an absence where the true answer is "it is here under another name", which breaks rule 2.
  - `Ferocactus histrix`, `Mammillaria conoidea`, `Echinopsis strausii` and `Haworthia spiralis` also give nothing.
  - `Neolloydia conoidea` gives **Cochemiea matehualensis**, the wrong species, with no label. It matches through that species' variety synonym, while the right species, Cochemiea conoidea, lost its own synonym to the cap.
  - `Opuntia longispina` gives Opuntia orbiculata and Cylindropuntia leptocaulis, also unlabelled. The right answer is Airampoa corrugata.
  - In an import, `readSearch` (`src/lib/import/check.ts:85`) gets `[]` and files the name as "missing" ("not in the reference"), with no key.
- **Reproduction:** `npx tsx rev66b/syn.ts` prints `{ speciesWithDroppedSynonyms: 2313, dropped: 31439, droppedBinomials: 15782, binomialSearchMisses: 13352 }`. `rev66b/syn2.ts` lists the succulent cases. Route answers: `queries.txt` (last run) and `answers.json`.
- **Should:** every older name the dossier holds should be searchable, or a binomial that matches nothing should be answered "not checked" or looked up, never "nothing matches".
- **Smallest fix:** keep every canonical species-rank synonym in the postings, even if `syn` on the entry stays at six for size. Alternatively, raise the cap and order by recency rather than by "other genus first". Then correct `/about/how`.

## 2. A common-name query matches words taken from different names and from places. The "whole, against the common names, first" reading that `/about/how` describes does not run. CONFIRMED. High.

- **Where:**
  - `search.ts:230-240`: `wholeReading` returns null unless the botanical reading dropped a word.
  - `search.ts:241` and `:359`: `commonWords` pools the words of every common name.
  - `search.ts:379`: a word may also be taken from the places.
- **What the page says:** `/about/how` (line 40) says "First as a whole, against the common names … When that finds nothing, as a botanical name". `/about/formats` line 57 says the same.
- **What happens:**

  | Query | First hit | Why it matched | Where the right species lands |
  |---|---|---|---|
  | `snake plant` | Achillea millefolium [Yarrow] | "Snake's grass" + "Nosebleed plant" | Dracaena trifasciata 3rd |
  | `coconut palm` | Borassus flabellifer [Toddy palm] | "Sea Coconut" + "… palm" | |
  | `butterfly milkweed` | Asclepias curassavica | | Asclepias tuberosa 3rd |
  | `china aster` | Anaphalis margaritacea | origin "China …" + "aster" | Callistephus 5th |
  | `cape aloe` | Aloe arborescens [Candelabra aloe] | origin "Cape Provinces" | Aloe ferox ("Cape aloe") 3rd |
  | `natal plum` | Plumbago auriculata [Quaker] | "natal" from KwaZulu-Natal, "plum" a prefix of Plumbago | Carissa macrocarpa 6th |
  | `desert rose` | Adenium obesum | (correct) | Eucalyptus leucoxylon 2nd, from "Desert Blue Gum" + an origin word |

- **Quantified:** each of the 3,697 multi-word headlines was searched as typed. **203** put first a species whose single common name (with or without its scientific name) does not hold every query word. **790 of 5,330** top-six hits are such pooled matches.
- **Reproduction:**
  - `npx tsx rev66b/pooled.ts` prints `{ queries: 3697, withJunkTop: 203, junkHits: 790, hitsTotal: 5330 }`, and examples are in `rev66b/pooled.txt`.
  - `npx tsx rev66b/whole-claim.ts` shows that `wholeReading('cape aloe')` is `null`.
  - The route agrees (`answers.json`, "Snake Plant").
- **Should:** run the whole-query reading against each common name separately on every query, as documented. A hit should come from one common name holding every word. Only then should the botanical, place and pooled reading run.
- **Smallest fix:**
  - In `search()`, always try `inCommonOne(p, qs)` first, where `inCommonOne` asks that some single common name's words cover the query, not the pooled list.
  - In `rank()`, require common-name words to come from one name, as is already done for synonyms (`fromSyn`).

## 3. One dataset's `preferred` flag decides the headline over names given by many more sources. This yields "Cherry", "Buttercup", "Quaker", "Poppy" and a Spanish name for Echinocereus pectinatus. CONFIRMED. High (visible on tiles, titles, JSON-LD and link previews).

- **Where:** `src/lib/dossier/index-entry.ts:207`. The rule sorts by tier, then `preferred`, then sources. `/about/how` states this rule, so the rule is at fault, not the code. GBIF's `preferred` is per dataset: 1,436 species carry one or more preferred English names, flagged by 12 datasets (436 carry two to four different preferred names).
- **What happens:** **281** headlines were chosen by `preferred` over a name with more distinct sources. Examples:

  | Species | Headline shown | Name with more sources |
  |---|---|---|
  | Malpighia emarginata | **"Cherry"** | Barbados cherry, 6 sources |
  | Allamanda cathartica | **"Buttercup"** | Golden trumpet, 7 |
  | Plumbago auriculata | **"Quaker"** | Cape leadwort, 6 |
  | Cosmos sulphureus | **"Poppy"** | sulphur cosmos |
  | Asystasia gangetica | **"Primrose"** | |
  | Echinocereus pectinatus | **"Órgano-pequeño Peine"** | Rainbow cactus, 3 sources |
  | Catharanthus roseus | "Churchyard Blossom" | Madagascar periwinkle, 7 |
  | Tamarindus indica | "Tamarind Tree" | Tamarind, 9 |
  | Tillandsia usneoides | "Old Man's Beard" | Spanish moss, 8 |
  | Agave americana | "Centuryplant" | |
  | Tradescantia zebrina | "Inch-plant" | |

  - "Cherry", "Buttercup", "Quaker", "Poppy" and "Primrose" all come from "Checklist Dutch Caribbean Species Register" plus Catalogue of Life's copy of it.
  - The Echinocereus pectinatus name is mistagged `eng`. Searching `rainbow cactus` lists the species third, under its Spanish headline (`answers.json`, first run).
- **Reproduction:**
  - `npx tsx rev66b/names-detail.ts`, then `python3 rev66b/preferred.py`, gives 281 with the worst 30 listed.
  - `npx tsx rev66b/repro-names.ts` gives `pectinatus: {"common":"Órgano-pequeño Peine",…}` and `malpighia: {"common":"Cherry",…}`.
- **Should:** a flag one dataset sets should not outrank names many sources give.
- **Smallest fix:** rank by distinct sources first and use `preferred` only as a tie-break. Alternatively, count `preferred` only when two or more datasets flag the same name. Also add a single bare word that is a generic plant noun ("Cherry", "Cactus") to tier 1 alongside bare genus words. Then update `/about/how`.

## 4. The offline re-derivation records "not asked" as "refused". Forty-four pages tell visitors the distribution source refused, and those species lost their range and climate. CONFIRMED. High (rule 2, and data).

- **Where:**
  - `scripts/build-dossiers.ts:736`: the offline fetcher returns `{ status: 'refused', detail: '<host> not asked: offline re-derivation' }`.
  - `src/lib/dossier/build.ts:301` turns that into the climate detail "the distribution source refused the request when this page was built, so the range could not be verified".
  - The page renders it through `notAnswered()` (`src/lib/ui/ref/upstream.ts:45`): "Not checked: the distribution source refused the request when this page was built" (`species/[slug]/+page.svelte:284`, `:116`, `:379`, `:498`).
- **What happens:** 44 live dossiers have `wcvp.distribution: refused` with detail `api.gbif.org not asked: offline re-derivation`, and `climate: refused`. Examples are Aeonium tabulaeforme, Bisnaga hamatacantha, Melocactus lemairei, Tylecodon cacaliodes, Parodia erinacea, Erythrina caffra and Psidium cattleianum. Their pages:
  - state a refusal by Kew/GBIF that never happened (rule 2: a call the site held back is "not asked");
  - show no native range ("Native to: not verified");
  - have no climate and no sheet.
- **Reproduction:**
  - `python3 rev66b/refused44.py` gives 44, all with that detail and the "refused" climate clause.
  - `/tmp/rev66/corpus/v2/9476326.json` shows Aeonium tabulaeforme.
  - `report.txt` line 41 ("Acharagma aguirreana … climate refused — refused: wcvp.distribution:refused (api.gbif.org not asked: offline re-derivation)").
- **Should:** the status should be `skipped` (not asked), carried from the previous dossier where one exists, as `gbif.species` already is ("carried from build of 2026-09-30").
- **Smallest fix:**
  - In the offline fetcher, return `{ status: 'skipped' }`.
  - In `build.ts`, carry the previous dossier's distribution (and so its climate) when the source was not asked.
  - Give the climate detail a "not asked" wording.

## 5. 120 species lost every photograph in the offline re-derivation that built this corpus. CONFIRMED in the corpus; the cause is SUSPECTED. High (data loss).

- **Evidence:** each of the 120 has `inat.photos.wild` carried as `skipped` with detail "that build: not asked: N wild photographs already from the GBIF download". The earlier build had N photographs: 129 for Leptospermum laevigatum, 97 for Hibiscus sabdariffa, **84 for Sprekelia formosissima**, 58 for Dypsis decaryi, 48 for Echeveria acutifolia, 47 for Oroya peruviana, 24 for Agave scabra. In this corpus `gbif.media` is `none` and `photos` is `[]`.
  - Aeonium tabulaeforme (finding 4) is one of them: 6 photographs before, 0 now.
  - The page now says "Photographs: not checked — iNaturalist was skipped (not asked)". Rule 2 holds, but photographs the site had are gone.
  - Every one of the 120 reached occurrences by the API path. Of the 725 API-path species, 475 have no photograph.
- **Likely cause:** the offline run gets media only from the bulk download, and API-path species have none there. The iNaturalist skip, decided by an older build "because the download already had N", is carried forward without the photographs that justified it.
- **Reproduction:** `python3 rev66b/photoslost.py` gives 120 and the largest losses.
- **Smallest fix:**
  - When a rederive's media source yields nothing, carry the previous dossier's photographs.
  - Never carry a "skipped because we already had them" status when the photographs are not carried too.
  - Fail the build's audit when a species' photo count drops to 0 from more than 0.

## 6. One name is shown several times: apostrophes, closed compounds and accents are not pooled, although `/about/how` says apostrophes are. CONFIRMED. Medium.

- **Where:** `index-entry.ts:56` (`nameKey`) maps ’ to ' but keeps apostrophes. It does not join "Century plant" and "Centuryplant", and does not fold macrons. `/about/how` line 36 says "Spellings of one name (case, hyphens, spaces, apostrophes) count as one name". The code comment at line 53 says the same.
- **What happens:** the line under a species title (the first four names) repeats a name on **302** species. Across `commons` there are 795 such pairs.
  - Cotyledon orbiculata: "Pig's ear; Pig's-ears; Pig Ears; Pigs ears"
  - Agave americana: "Centuryplant; Century-plant; American agave; American-aloe"
  - Aeonium haworthii: "Haworth's aeonium; Haworths Aeonium; Pinwheel"
  - Graptopetalum paraguayense: "Ghostplant; Mother-of-pearl-plant; Ghost-plant"
  - Ipheion uniflorum: "Spring starflower; Spring star; Spring starflower.; Springstar"
  - Metrosideros robusta: "Northern Rātā; Northern rata"
  - Because the spellings are split, their sources are split too. Agave americana's headline is "Centuryplant", not "Century plant".
- **Reproduction:**
  - `npx tsx rev66b/repro-names.ts` gives `apostrophe: {"common":"Bailey's wattle","commons":["Baileys Wattle"]}` and `agave: {"common":"Centuryplant",…}`.
  - `npx tsx rev66b/pool-variant.ts` reports 302 repeating lines. Pooling would change 55 headlines, not all for the better: Euphorbia milii would become "Christplant".
- **Smallest fix:**
  - Make `nameKey` drop apostrophes and trailing full stops, and fold accents.
  - Collapse "X Y" and "XY" into one key only for display deduplication, keeping the most-sourced spelling.
  - Or state the narrower rule on `/about/how`.

## 7. The capitals rule reads "meant" capitals only among spellings with the same hyphenation. It strips proper nouns that a source meant, and keeps Title Case where a lower-case spelling exists. CONFIRMED. Medium.

- **Where:** `index-entry.ts:176-201`. `byCase` groups by `toLowerCase()`, so "star-of-bethlehem" and "star of bethlehem" are different groups. The group with more sources wins, and `formOf` sees only its own case forms.
- **Proper nouns lost:** 9 shown names, 3 of them headlines.
  - Ornithogalum umbellatum "Star of bethlehem": CoL/GRIN/VT wrote "star-of-Bethlehem".
  - Tradescantia zebrina "Wandering jew": GRIN wrote "wandering-Jew", and the same TAXREF row has "Purple wandering Jew".
  - Atocion armeria headline "Sweet-william Catchfly": CoL's preferred spelling is "sweet William catchfly". The rule drops the meant capital and keeps the stray one.
  - Pilea nummulariifolia "Creeping charlie" (the account's known limit has this cause: "creeping-Charlie" exists).
  - Romneya coulteri "Coulter's matilija-poppy".
- **Title Case left where a lower-case spelling exists:** **71 headlines (133 shown names)**. Examples: Choisya ternata "Mexican Orange" (with "Mexican-orange"), Cereus hexagonus "Lady of the Night Cactus" (with "lady-of-the-night cactus"), Amaryllis belladonna "Jersey Lily", Davidia involucrata "Dove Tree", Ceiba speciosa "Silk Floss Tree", Areca catechu "Betel Nut Palm" and Cyrtomium falcatum "House Holly-fern". This contradicts the stated aim at line 173 ("a list in Title Case cannot flip a headline's case by its count").
- **Proper nouns stripped where every source is lower case** (no rule can fix this): Vachellia farnesiana "Prickly moses" and Gazania krebsiana "Tanager african daisy". A corpus-wide lexicon search found only these, so the stripping rule is otherwise sound.
- **Reproduction:**
  - `python3 rev66b/a4.py` prints `LOST meant capital 9 headlines 3` and `STRAY capital … 133 headlines 71`, with examples.
  - `python3 rev66b/a3.py` runs the proper-noun lexicon over every shown name.
  - `npx tsx rev66b/repro-names.ts` gives `star: {"common":"Star of bethlehem"}` and `choisya: {"common":"Mexican Orange"}`.
- **Smallest fix:** compute `meant` and "a lower-case spelling exists" over the whole `nameKey` group (all hyphenations), then apply the chosen spelling's case word by word.

## 8. Two different "a year" rain figures sit in the habitat box on 1,378 pages. Six of those pages show 120 mm or more as "Rain a year" and also "under the rule's 120 mm". CONFIRMED. Medium.

- **Where:**
  - `src/lib/ui/ref/Glance.svelte:99`: the card "Rain a year (median across the range)" shows `annualRain.p50`.
  - The season card's lead (`sheet.ts:344-353`, `plain.lead`) gives "N mm of rain in the median year…".
  - The 120 mm rule reads the median year's sum.
  - The two are reconciled only in the Rain row lower down (`sheet.ts:381`).
- **What happens:**
  - Aloidendron dichotomum (the quiver tree): the card says "Rain a year (median across the range) 133 mm". The season card in the same block says "114 mm of rain in the median year, under the rule's 120 mm, so no rainy season is read".
  - The same pattern holds for Mesembryanthemum gariusanum (202 against 118), Colchicum schimperi (164 against 117), Agave cerulata (125 against 113), Phoenix dactylifera and Verbena lilacina.
  - The "Its year" row's long sentence reads "Rain at the habitat is 114 mm a year (median year across …)", while the top card's "Rain a year" says 133.
  - On 15 pages the two figures differ by more than 20%. Examples are Boswellia sacra (99 against 56), Diospyros ferrea (2,963 against 2,214) and Eucalyptus camaldulensis (506 against 367). These are ranges with offset rainy seasons, where the median year is much drier than the median cell.
  - No single sentence mixes the two figures. Each is labelled, but the threshold is stated against "a year", and the page's "a year" is the other figure.
- **Reproduction:**
  - `npx tsx rev66b/glance-rain.ts` prints `{ seasonLeadsWithAYearFigure: 1476, differFromTopCard: 1378, differBy20pc: 15 }`.
  - `npx tsx rev66b/sheet-rain.ts` lists the 6 pages that cross 120 mm.
  - `npx tsx rev66b/sheet-one.ts "Aloidendron dichotomum"` prints the rows.
- **Smallest fix:** in the Glance season lead, say "in the median year (the rain rule's year; the card's figure is the median across cells)". Alternatively, state the 120 mm threshold as "the median year's months add up to under 120 mm" and drop the second number from the lead. Also make `/about/how` say which year the 120 mm applies to.

## 9. Within a reading, hits are in alphabetical order. A species whose own headline is typed often comes after others. CONFIRMED. Medium.

- **Where:** `search.ts:450`. Sorting is by rank, then `sortKey`. There is no preference for an exact or whole-word match, for the headline, or for a whole name.
- **What happens:** every headline was searched as typed. **526 of 4,082** put another species first, and **58** put the named species below fifth.
  - "Columbine" puts Aquilegia vulgaris 6th.
  - "Fig" puts Ficus carica 16th, behind Colchicum *fig*lalii and Magnolia *fig*o. Name matches outrank common names, and "fig" is a prefix.
  - "Pink" puts Dianthus plumarius 37th, behind Sclerocactus *pink*avanus.
  - "Onion" puts Albuca bracteata [Sea-onion] ahead of Allium cepa [Onion].
  - "Kiwi" puts Actinidia arguta ahead of A. chinensis [Kiwi].
  - "Sundew" puts Drosera schizandra 36th.
  - "Peruvian Lily" puts Scilla peruviana first.
- **Reproduction:** `npx tsx rev66b/headline-rank.ts` prints `{ withHeadline: 4082, missing: 0, notFirst: 526, notTop5: 58 }`. The list is in `rev66b/headline-rank.txt`.
- **Smallest fix:** within a rank, sort first by a whole-word match of every query word, then by headline equality, then alphabetically.

## 10. When a common name matches nothing, it is retried on its first two words, and the answer is labelled with fragments such as "Showing results for Lily of". CONFIRMED. Low to medium.

- **Where:** `relaxedQuery` (`search.ts:328`) applies a botanical rule (the first two words) to any text.
- **What happens:**
  - `Lily of St. James` gives relaxed "Lily of", with African-lily, Parrot-lily and Lily-of-the-valley.
  - `Rose of Jericho` gives relaxed "Rose of", with Anemone coronaria, Fireweed and Pinklady.
  - `/about/how` cites "Lily of St. James" as a query "searched whole". It is, then it is cut to "Lily of".
  - The label is honest, but the results are noise, and a visitor reads them as the site's best guess.
- **Reproduction:** route harness, `answers.json`.
- **Smallest fix:** do not retry when the second word is a small word (of, the, and, de) or when the query reads as a common name (its first word is not a genus of the reference). Answer "nothing matches" instead.

## 11. Junk, generic or foreign single-source names become headlines. The data is at fault, and the rule does not guard against it. CONFIRMED. Low (but visible).

- Copiapoa cinerascens and Copiapoa serpentisulcata: headline **"Cactus"**, from one CoL row.
- Lophophora williamsii: headline **"Indian-dope"**, the first in GBIF's order among eleven names with two sources each. No source gives "Peyote", so `peyote` finds Ariocarpus fissuratus first and never L. williamsii.
- Podocarpus costalis: headline "Podocarpus costalis", its own scientific name.
- Melocactus macracanthos: "ABC Turk's Cap Cactus".
- Kalanchoe laetivirens: "Crenatodaigremontiana".
- Fragments from source lists appear in `commons`: Coleus amboinicus "Country", Lagenaria siceraria "White -fld", Phytolacca americana "Pigeo", Ipheion uniflorum "Spring starflower." (with a trailing full stop).
- **Reproduction:** `python3 rev66b/a6.py` (binomial-like, odd characters, all capitals). The Lophophora rows are in `rev66b/names.json`.
- **Smallest fix:** set back a name equal to the species' own binomial. Set back a single generic noun (a short list such as cactus, cherry, poppy, primrose, buttercup). Strip a trailing ".". Drop list parts under 4 letters or containing " -".

## 12. The similar-spelling pass is loose. A four-letter word matches any word that shares its first three letters, and near hits are in alphabetical order. CONFIRMED. Low (the answers are labelled "similar spelling").

- `Aloe verra Burm.f.` gives Aloe vera, then **Verbena stricta**. "aloe" is one edit from "alop…" (alopecurus) and "verra" one from "verva…" (vervain).
- `paddle plant` gives Sarracenia purpurea, through "Side-saddle flower".
- `Ceropegia pica` puts Ceropegia dicapuae first and C. picta second. `Geissorhiza ovta` puts G. ovalifolia ahead of G. ovata.
- **The battery:** 5,855 epithet typos (substitution, deletion, swap, insertion) over the real index. The right species was first in **5,847 (99.9%)**, and it was in the list in every case. The 8 ordering misses are listed by `npx tsx rev66b/typo.ts`.
- **Smallest fix:** rank near hits by edit distance against the whole word, before the alphabet.

## 13. Sitemap days: every species carries the build day 2026-10-09. A status-only change (an offline run that cannot ask) moves a page's day. Days are CONFIRMED; the movement is SUSPECTED. Low.

- **What happens:**
  - All 8,947 dossiers have `changed.on = 2026-10-09`, and all 8,947 have `built` = 2026-10-09. The first stamp used `lastReading()`, which takes the re-derivation's own `built`. So the first per-species `lastmod` claims every page changed on the build day, including pages unchanged since September.
  - `substanceOf` keeps each upstream row's `status`. An offline rederive that writes `refused` where an online build wrote `ok` (finding 4) changes the fingerprint and moves the day, and the next online build moves it back.
- **Reproduction:** `python3 rev66b/changed_days.py` gives `changed.on {'2026-10-09': 8947} built {'2026-10-09': 8947}`. For the status, read `src/lib/dossier/changed.ts:41`.
- **Smallest fix:** with the fix to finding 4, a not-asked source is carried, so its status does not flip. Optionally, leave statuses carried from a previous build out of the fingerprint.

---

## What I checked and found sound

- **The index and the code agree.** `englishNames` reproduces `index.json` exactly, with zero differences across 8,947 species. The species page computes with the same scope, so its title equals the tile.
- **Comma splitting.**
  - The account's "1,843 of 103,256" counts every language. Only 223 English values hold commas, and I read every one with a short part.
  - None is an inverted form ("Aloe, Barbados") or a qualifier. Every one is a list. Fragments that come from upstream data are listed in finding 11.
  - Slash lists stay whole.
- **Bare genus words.** Only 2 headlines are bare genus words (Dombeya wallichii "Dombeya" and Sorbaria sorbifolia "Sorbaria"), and both have no fuller name. No headline names another genus in the way the set-back rule targets.
- **The proper-noun stripping rule is rarely wrong outside finding 7.** A lexicon search built from the corpus (Christmas, Easter, Cape, Mexican, Saint/St., places, people) found only the 9 shown names in finding 7.
- **Typo pass against places.** "Aloe Verra" gives Aloe vera, "Aloe Juvenna" gives Aloe juvenna, and no place word is near-matched (`rank()` matches places only as written).
- **Author citations.** All 11 author forms in the battery are cut correctly and labelled with "left", including `(Frič & Gürke) Britton & Rose`, `Schönland ex Pillans`, `T.Moore`, `Hook.f.`, `(Lem. ex Salm-Dyck) J.M.Coult.` and `Drake`. Aloe polyphylla and Euphorbia obesa answer nothing only because they are not in the corpus.
- **Cultivars and qualifiers.** Quoted and unquoted cultivars, "cf.", "sp. KK 1234", and hybrid formulas (`Aloe x Gasteria` and `Gasteria x Aloe`, which retry on the first parent) are all labelled correctly. In every relaxed answer in the battery, the words reported were the words the reading used.
- **The picker's key filing.**
  - `pick()` files a key only through `filesKey`.
  - The round-66 late-answer path matches on `sameName(name, parseName(q).scientific)`. That scientific name keeps "cf.", "var." and authors, so a qualified or ranked name is never filed with the species' key.
  - A synonym's GBIF key filed by the name-service check is caught on the plant page by the "key-differs" notice.
- **Rain labels.**
  - Every dossier with climate has `annualRain.p50` (none falls back to the sum).
  - In no page does the count of months with 25 mm or more exceed what the shown year allows.
  - The climograph names its total "the twelve monthly medians added".
  - The sheet's Rain row names both figures (but see finding 8 for the Glance).
- **Tile credits.**
  - The index's `credit` equals `tileCreditOf(heroOf(photos))` for all 4,739 credited tiles.
  - None is cut at 40 characters in this corpus.
  - The licence always comes first (CC BY 3,257, CC BY-SA 1,359, CC0 123).
  - The 779 thumbs with no credit are all CC0 "no rights reserved" lines with no author, and the tile names the host.
  - The tile CSS ellipsis marks any phone cut, so I found no misattribution.
- **Sitemap mechanics.** `stampOnBuild` and `restamp` keep the day when the fingerprint is unchanged. `built`, `builtBy`, `changed` and each row's `at` and `detail` are excluded. A genus row takes the latest of its species' days.
- **Refusal wording on the page.** `notAnswered`, `photoSourceGaps` and the climate pill render `skipped` as "not asked" and `refused` as a refusal. The fault in finding 4 is the status the builder writes, not the page.
