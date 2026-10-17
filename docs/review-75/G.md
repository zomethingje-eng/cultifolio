# Round 75, agent G: one catalogue on every device, "Most grown" as a chip, and a long range list

Branch `r75` in `/tmp/claude-0/rev75/G`, on `0a7de25`: four commits, the rework in `b3415ed`. No corpus step.

The owner saw the phone open on a subset (round 73's "Collector genera 6,362" chip, on by default) and read it as missing data. So in the rework:

- the phone-only opening view is gone;
- the sourced ranking below is now an opt-in chip on every device;
- the Habitat card's long region list is fixed.

## Done

### 1. A sourced ranking: `scripts/most-grown-genera.ts`

- **The query.** I tested the brief's first candidate, and it is not the measure.
  - `/v1/observations/species_counts?captive=true&iconic_taxa=Plantae&hrank=genus&lrank=genus` does answer per genus (5,874 genera over 12 pages).
  - But it counts only observations identified to the genus itself. Rosa gives 198,852, the same as `observations?captive=true&taxon_id=53438&rank=genus`.
  - Rosa with every taxon under it is 232,507 (`observations?captive=true&taxon_id=53438&per_page=0`).
- **What the script asks instead.** The cheapest correct query is `/v1/observations/taxonomy?captive=true&taxon_id=47126`.
  - It is one request (about 3 s, 15.8 MB) that answers the whole tree of Plantae's captive observations: 79,734 taxa.
  - Each taxon carries `descendant_obs_count`, the observations of the taxon and every taxon under it. Rosa gives 232,508.
  - Its `size` field says how many taxa it holds, so a cut answer is refused.
  - A genus of the reference that the tree does not name is asked on its own (`observations?captive=true&taxon_id=<id>&per_page=0`, `total_results`). So a zero is an answer, never an absence. If the tree fails, every genus is asked this way (about 45 minutes).
- **Names, by rule 3.** The script reads every active genus in Plantae: `/v1/taxa?taxon_id=47126&rank=genus&is_active=true&per_page=500&order_by=id&id_above=<last>`. That is 16,535 genera in 34 requests, and the pages must add up to the first page's `total_results`.
  - A genus of the reference is taken only when exactly one active Plantae genus has exactly its name.
  - Two such genera are a homonym. None is no match.
  - Both are refused with their reason. When the tree names an inactive taxon of that name, the reason says so.
  - An animal genus of the same name is outside Plantae, so it is not counted as a homonym.
- **The whole run** was 41 requests, one every two seconds (its own gate, on top of `makeFetcher`'s backoff on 429 and 503), under the project's `USER_AGENT`.
- **The file, `scripts/most-grown-genera.txt`.** It holds:
  - `day`;
  - `index`;
  - the `query` and `names` lines;
  - `terms`: iNaturalist's API under its Terms of Use and API Recommended Practices. The counts are facts, credited to iNaturalist and its observers;
  - `genus<TAB>name<TAB>taxon id<TAB>count`, most observed first;
  - `genus<TAB>name<TAB>id or -<TAB>not checked<TAB>why`, never 0;
  - `refused<TAB>name<TAB>reason`.

  The file is written whole or not at all. A run with genera not checked exits 1.
- **Files:** `scripts/most-grown-genera.ts`, `scripts/most-grown-genera-lib.ts`, `scripts/most-grown-genera.txt`.

### 2. The rule behind "Most grown"

**The rule:** the fewest genera of the reference that, taken from the most observed down, together hold half of the captive observations of all the reference's counted genera. A genus refused, not checked or absent from the file is not counted, and is not under the chip. Ties are broken by name. It lives in `src/lib/ui/ref/most-grown-rule.ts` (`SHARE = 0.5`, `parseMostGrown`, `openingGenera`).

**Why half, and why a share rather than a fixed N** (the numbers are under Measured):

- **Half gives 95 genera today** (1,225 species).
- **The bound as the reference grows.** Over every active genus iNaturalist has a captive observation of (8,464; a genus without one adds nothing), half is 119.
- **Four fifths would be 315 genera now and 414 then**: most of the catalogue rather than its head.
- **A fixed top 100 would be a number chosen by hand.** Its share falls as the reference widens (51 per cent today, 46 wide). A share keeps its meaning: a cultivated plant observed in the reference's genera is as likely to be under the chip as not.

### 3. The code

- **The same catalogue on every device.** Round 73's phone-only view is removed from `+page.svelte` and `+page.server.ts`:
  - the `collector` data;
  - the phone-only chips and the `.cgonly`/`.wideonly` rules;
  - the `/?open=` link rewriting;
  - the strip's placement after the third shown row.

  A phone draws exactly the desktop's rows, counts, letters, chips and order, with "All" on. The catalogue's existing window (60 rows, then `/api/rows` as the reader scrolls) keeps the budget, so no subset is needed (see Measured).
- **"Most grown", a filter chip like the others.** It is off by default and the same on every device.
  - It sits after "All" in the existing chip row (`nav.chiprow`, now labelled "Filter the catalogue").
  - It reads "Most grown, 1,225", with the title "The species of the 95 genera most observed in cultivation on iNaturalist".
  - Its address is `?by=<grouping>&chip=grown`, a plain link, so it works without JavaScript and in every grouping.
  - When it is on, the count line adds "in the most-grown genera, by iNaturalist's records of cultivated plants (how they are chosen)", linking `/about/how#list`.
  - As under the climate chips, the search's matches are filtered by it, and the page says how many more there are without it.
- **How the chip is served.**
  - In `$dossier/catalogue`, `Chip` gains `'grown'` and `chipOf` reads it.
  - `catalogueOf` and `rowItems` take the set of genera. Kept catalogues are keyed by grouping, chip and set.
  - `CHIPS`, the files the corpus build writes, is unchanged. `$lib/server/catalogue` derives "grown" from the index and `grownGenera` (`src/lib/ui/ref/most-grown.ts`, server only, kept once per index).
  - `hooks.server.ts` and `/api/rows` take it through `chipOf`. The corpus and the manifest do not change.
  - The page is sent the chip's counts always, and the 95 genus names only while the chip is on, for its search.
- **The collector genera are retired from the front page.**
  - `collector.ts` is now `whole-genera.ts` (`WHOLE_GENERA`), read only by the species page's 404.
  - `specialist-genera.txt` and /about/how's derivation paragraph ("173 collector genera") are unchanged, as they are true until the corpus is rebuilt.
- **The range list on the Habitat card** (`src/routes/species/[slug]/+page.svelte`).
  - **Before:** the "Native" cell spanned the grid only when the native regions alone were more than four. So okra (3 native, about 80 introduced) ran as a column a fifth of the grid wide beside "Map marker".
  - **Now:** every region the cell lists counts (native and introduced, and reported when no native is stated). Past four, the cell and the marker's take the full row, and the list flows across it.
  - "Doubtfully present in" and "Extinct in" do the same past four.
  - Every region is still shown, and the words and "not checked" are unchanged. On a phone the grid is one column, as before.
- **Words.**
  - The add form's and the seed batch's name hints now name *Monstera deliciosa* 'Thai Constellation', *Paphiopedilum rothschildianum* × *philippinense* and *Echeveria* 'Blue Curls'.
  - The import's placeholder starts with *Monstera deliciosa*.
  - `r74-growers` passes, and all its allowed entries are still found.

### 4. /about/how (mine; checked against the code)

- **Replaced:** "On a phone the front page's catalogue opens on the genera of that list, and every other genus is under its chip “All”; a wider screen shows every genus at once."
- **With:** "The front page's catalogue is the same on every device, every genus and every species, and its chip “Most grown”, off until chosen, narrows it to the species of the most-grown genera: the fewest genera of the reference that, taken from the most observed down, together hold half of iNaturalist's observations of plants marked captive or cultivated across all the reference's genera that were counted, each genus counted with every taxon under it, on 17 October 2026 (<code>scripts/most-grown-genera.txt</code> in the source holds every count, the query and iNaturalist's terms). A genus is counted only where iNaturalist holds exactly one active genus of plants of exactly that name; one it does not, such as Callistemon or Mahonia, which it holds only as an old name, or one whose count did not answer, is not counted and is not under the chip."
- **Replaced (the corpus paragraph):** "the catalogue's rows for each grouping and chip."
- **With:** "the catalogue's rows for each grouping, unfiltered and under each climate chip (the rows under “Most grown” are worked out by the server from the index and the counts' file, once for each index)."
- **Checked against:**
  - `SHARE`, `openingGenera`, `resolveGenus` and `grownChip` (no chip when nothing is counted);
  - `CHIPS` and `catalogueRows`;
  - the file's `day` and its refusals of Callistemon and Mahonia.

  The rule test holds these to the code.

### Tests

- **`tests/unit/r75g-most-grown-loader.test.ts`** (5 tests) runs on recorded answers: rows trimmed from iNaturalist's real answers in `tests/unit/fixtures/r75g-inat.json`, plus filler rows and one constructed homonym. It checks:
  - resolution: an animal homonym and an inactive Allium are ignored, a Plantae homonym and no match are refused, and an inactive-only name gives its reason;
  - the tree's counts, a genus asked on its own, and exactly which URLs are asked;
  - a refused tree with one timeout: "not checked", while an answered 0 is kept as 0;
  - a listing that does not add up, or a failed page: every genus "not checked";
  - a cut tree.
- **`tests/unit/r75g-opening-rule.test.ts`** (6 tests), on the real file:
  - the file's form;
  - the minimal prefix reaching half;
  - `grownGenera` and `grownChip`;
  - ties and "not checked" on a made-up file;
  - the "grown" catalogue by genus and by family, with the whole counts kept and no build file;
  - the about sentences against the file's day;
  - no collector, opening or phone-only code on the front page.

  On r75base the modules and the file do not exist.
- **`tests/e2e/r75g-most-grown.spec.ts`** (4 tests). The expected set is worked out from the real file by the app's rule.
  - **1, desktop and phone:** the chip is off by default with every genus drawn, and reads "Most grown, 1" with its title. On, it shows exactly Welwitschia, the count line says so, and the search is filtered.
  - **2, without JavaScript:** the chip is a link, and its address draws the set, by family too.
  - **3:** the served /about/how sentences.

  All four fail on r75base: there is no chip, and Refusia is hidden on the phone.
- **`tests/e2e/r75g-range-cell.spec.ts`** (2 tests). Okra's shape is put into Copiapoa cinerea's data on a client-side visit.
  - **1, desktop at 1280:** the Native cell is over 90 per cent of the grid's width and under 260 px tall, and all 80 introduced regions are present. On r75base: `Expected: > 0.9, Received: 0.2`.
  - **2, phone:** no sideways scroll. This is a guard and passes on the base.
- **`tests/e2e/r73p-front.spec.ts`**, rewritten for the reversal:
  - **1:** a phone and a desktop show the same rows, letters, chips, chip on and count line, and a phone's row opens at the desktop's address.
  - **2:** the same without JavaScript.
  - **3:** the desktop guard.

  1 and 2 fail on r75base.
- **Restored to their base text:** `r61w-pages`, `smoke-3` and `r62w-shapes`. The first pass had changed them for the subset; the shapes helper's dead `d.collector` line is removed.

## Needs

None for H or S.

- `hooks.server.ts` and `/api/rows` are untouched; they take the new chip through `chipOf`. `src/lib/server/catalogue.ts` gains the derived "grown" catalogue.
- **For the merge:** DEPLOY.md could gain one line after the corpus section: "After a corpus rebuild, `npx tsx scripts/most-grown-genera.ts --index static/s/v2/index.json`, then commit `scripts/most-grown-genera.txt` and deploy". I did not edit DEPLOY.md, to keep clear of H and S.

## For the owner's PC

The committed file was counted over round 72's index copy (8,947 species, 1,321 genera). The live corpus has 8,945 species. The server applies the rule to the live index on each request, so the file works with the live corpus as it stands. A recount on the live index keeps the file exact:

```
npx tsx scripts/most-grown-genera.ts --index static\s\v2\index.json
npx vitest run tests/unit/r75g-opening-rule.test.ts tests/unit/r75g-most-grown-loader.test.ts
```

If the day changes, the about sentence's "17 October 2026" must change with it; the rule test fails until it does. The run is 41 requests, about 1.5 minutes.

## Measured

**First visit to `/`, before (r75base) and after.** This ran on a local `wrangler dev` holding round 72's real corpus (manifest, index and 144 products put into a local R2), in Chromium. Every request is counted, and outside photographs are answered locally so they count. Bytes are bodies plus headers, uncompressed (`/tmp/claude-0/rev75/G-s/firstvisit.mjs`).

| `/` | Requests | kB | HTML kB | `/api/rows` | Rows drawn / in page |
|---|---|---|---|---|---|
| Phone, before | 80 | 386 | 17.2 | 2 | 24 / 220 |
| Phone, after | 79 | 379 | 16.1 | 0 | 60 / 60 |
| Desktop, before | 75 | 379 | 17.2 | 0 | 60 / 60 |
| Desktop, after | 75 | 378 | 16.1 | 0 | 60 / 60 |
| Phone, after, `?chip=grown` | 77 | 379 | 16.9 | 0 | 60 / 60 |

- **The phone and the desktop now show the same.** Both draw the same 60 rows (Abelia, Abelmoschus, Abutilon…) and the same chips: "All, 8,947", "Most grown, 1,225", "Climate known, 5,567" and "Without climate, 3,380".
- **The phone's first visit is lighter.** The subset fetched two more windows (220 rows in the page) to fill 24 visible rows, and its HTML carried 162 ids.

**The ranking, 17 October 2026, round 72's index.** Of 1,321 genera:

- **1,291 counted.** Six of these were asked on their own and answered 0: Aquarius, Didymaotus, Namaquanula, Nicoteba, Reicheocactus, Zanha.
- **0 not checked.**
- **30 refused, all as no match; no homonyms.**
  - iNaturalist holds six only as inactive taxa: Callistemon, Macropiper, Mahonia, Marginatocereus, Pseudofumaria, Tarenaya.
  - Others: Stenocactus, Sprekelia, Chionodoxa, Mespilus, Bisnaga, Avonia, Chamaecereus, Urginea, Dodecatheon, Kalimeris, Talipariti, Sechium.

**The top 30 (iNaturalist taxon id: captive observations, the genus with every taxon under it):**

1. Rosa (53438): 232,508
2. Salvia (50644): 223,779
3. Prunus (47351): 200,370
4. Acer (47727): 186,981
5. Hibiscus (48891): 180,858
6. Euphorbia (51822): 150,527
7. Rhododendron (49487): 146,705
8. Bougainvillea (53804): 141,656
9. Magnolia (82096): 137,559
10. Hydrangea (83157): 128,728
11. Ficus (50999): 126,258
12. Aloe (71956): 106,893
13. Pelargonium (72281): 104,343
14. Lagerstroemia (68717): 87,158
15. Citrus (54297): 84,243
16. Agave (50822): 83,871
17. Lantana (50334): 78,389
18. Cornus (47193): 76,095
19. Ixora (133310): 75,258
20. Kalanchoe (59379): 72,745
21. Iris (47780): 71,109
22. Nerium (47564): 68,265
23. Melaleuca (72232): 67,631
24. Begonia (126405): 65,295
25. Dracaena (124826): 65,221
26. Viburnum (54774): 63,882
27. Solanum (50641): 62,789
28. Coleus (1069166): 62,538
29. Opuntia (47902): 62,231
30. Tradescantia (49145): 60,592

**The share against the size of the set.** The reference's counted genera hold 11,998,881 captive observations: 85 per cent of the 14,134,029 for all 8,464 active genera that have any.

| Share | Genera today | Species today | Genera, all 8,464 cultivated genera |
|---|---|---|---|
| 25% | 26 | 565 | |
| **50%** | **95** | **1,225** | **119** |
| 60% | 143 | 1,578 | |
| 75% | 256 | 2,091 | |
| 80% | 315 | 2,438 | 414 |
| 90% | 508 | 3,241 | |

- **A fixed top N:** 50 genera hold 36 per cent today, 100 hold 51 per cent and 200 hold 69 per cent.
- **The 95** run from Acer, Aeonium, Aesculus, Agapanthus and Agave to Viburnum, Viola, Yucca and Zinnia. They include Begonia, Dracaena, Epipremnum, Ficus, Hosta, Kalanchoe, Pelargonium, Rosa, Tradescantia and Tulipa.
- **Four of them were among round 73's 162 collector genera:** Aeonium, Agave, Crassula and Yucca.
- **The wider set's 119 includes 15 genera the reference does not hold,** among them Quercus, Pinus, Sansevieria, Phalaenopsis and Brassica. Phalaenopsis, the most-grown orchid genus, has no page, which is a corpus question for the owner.

**Runs, strict Chromium and the Chromium phone:**

- **The rework's three specs:** 9 passed. On r75base, 7 failed as quoted; r75g range 2 and r73p-front 3, the guards, passed.
- **The affected set,** at two workers: 241 passed. It covered smoke-1/2/3, r62w-pages, r63v-first-screen, r62bw-pages, r61a-a11y, r60-grow, r63u-print, r63h-phone, r63fv-front and -guard, r73p-front, r73p-first-visit, r73p-other-keys, r61w-pages, r62ba-interface, r63v-visitor, r67p-pages and the two r75g specs.
- **Unit:** the whole suite once, holding the browser lock: 412 files passed and 1 skipped; 3,944 tests passed, 8 skipped, none failed.
- `tsc --noEmit` is clean, and `svelte-check --threshold error` shows 0 errors in 1,201 files.

## Not done, with why

- **Firefox and WebKit were not run.** They are not in this workspace. The rework removes CSS and adds a link chip, so I expect no engine difference.
- **The ranking includes garden trees and shrubs** (Acer, Prunus, Magnolia, Cornus, Tilia, Fraxinus), because the measure counts them. Nothing is hand-picked. If the owner wants indoor and patio plants first, that is another measure, and the about page would have to say which.
- **The "Name as received" example ("Copiapoa cinerea v. albispina") is kept.** It shows the form of an older varietal name.
- **The live index was not counted** (see "For the owner's PC").
- **The region list is not set in columns.** Full width reads as a paragraph of about seven lines for okra. Columns would add CSS with no test that it reads better.
