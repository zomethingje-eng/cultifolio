# Round 60 self-review: corpus and search

Reviewer area: corpus. Copy: /tmp/r60rev/corpus (Node 22). Shared server 127.0.0.1:4173 (four-species fixture). The live site and GBIF are not reachable from the sandbox, so nothing here is measured on the real 8,947-species corpus; the search was run on the round-59 synthetic 9,000-species index (`tests/unit/helpers/corpus-synth.ts`, extended with `commons`) and on a hand index of real species and their real English names.

What I ran:
- The area's existing tests: corpus-r60, search, search-api, postings, manifest-refused, page-corpus (51 tests, all pass).
- A new fuzz (`corpus--fuzz-grower.test.ts`): 13,200 grower-shaped queries over five seeds (hybrids in every spelling, cultivars in five quote styles and unclosed, `cv.`, every rank marker plus `aff.`, `cf.`, `nothosubsp.`, trailing and mid-name authors in both cases, abbreviations, misspelt genera, common names in four cases, doubled words, and a heavy random mix of markers, brackets, `&`, `ex`, `et al.` and `×`), each compared between the postings path with its retry and the whole index with its retry, at limits 1 to 100. **0 mismatches.** Every fifth query was also asked in seven other spellings, and the differences were read by hand.
- An exploration of the same generator that tracks the species the query was made from (is it first, in the top three, anywhere; was the answer a retry), 3,000 queries over two seeds.
- 32 grower queries on a hand index of real names (results quoted below).
- The add form's picker in Chromium against 4173.
- A walk of twelve routes under a refused corpus and under R2 throwing (`corpus--refusal-walk.test.ts`).
- curl on 4173 for the head tags, the sitemap and the front page's size with and without the feature.
- One trial of the proposed search fix in the copy: all my reproductions pass with it, and one existing case changes its expectation (see finding 1). It was reverted; md5 checked.

Tests written, in /tmp/r60rev/out/tests/:
- `corpus--search-grower-names.test.ts`: 10 reproductions that FAIL today, and 4 guards that PASS.
- `corpus--fuzz-grower.test.ts`: the equality fuzz above. PASSES.
- `corpus--common-name-rule.test.ts`: 1 reproduction that FAILS, the proposed rule's tests (PASS), and an audit to run on a built index.
- `corpus--refusal-walk.test.ts`: PASSES, with one `it.fails` documenting finding 13.

Screenshots: `/tmp/r60rev/out/shots/corpus/picker-variety.png` and `picker-variety-picked.png`.

## Findings

### 1. P1, confirmed. A common name typed in title case loses its last words as an "author", so "String of Pearls" answers String of hearts first
- **Where:** `src/lib/core/search.ts:102`, `lower = /^\p{Ll}/u.test(t)`, with the author test on the line before it.
- **The mechanism:** once two "name" words are counted, a capitalised word after a word written in lower case is taken as the start of an author citation. Everything from there to the next rank marker is dropped.
- **The effect:** in a common name, the lower-case word is "of", "the" or "and", so the words after it are thrown away.
- **Results on the real-name index:**
  - "String of Pearls" is searched as "String of". It answers Ceropegia woodii, Crassula perforata, Curio radicans, then Curio rowleyanus, in alphabetical order. A grower who clicks the first result lands on String of hearts.
  - "string of pearls", "String Of Pearls" and "String-of-Pearls" each answer Curio rowleyanus alone.
  - "String of Bananas" gives the same four, with Curio radicans third.
  - "Mother of Thousands" and "Mother of Pearl Plant" both answer Graptopetalum paraguayense, Kalanchoe daigremontiana and Kalanchoe delagoensis, Graptopetalum first.
  - Title case is how these names are written in nursery lists, on labels and by phone keyboards that capitalise. "String of pearls" is the round's own example of a name now searched, so a first-time reader is likely to try it.
- **The fix:**
  - Treat the word as an epithet only when it has four letters or more: `lower = b.length >= 4 && …`. Epithets are almost never shorter; "of", "the" and "and" are.
  - Reset `lower` after a hybrid sign (finding 2) and when the word starts with "×" (finding 7).
  - Drop a quoted cultivar that starts with a capital in the first pass too (finding 3).
  - Count a hyphenated token as one word in `relaxedQuery` (finding 6).
- **Tested in the copy:** all 14 cases in `corpus--search-grower-names.test.ts` pass with this change. The existing corpus-r60 and search tests pass except one row: "Echeveria 'Perle von Nurnberg'" is now a direct genus answer, not a labelled retry, so that row needs its expected retry changed to none.

```diff
-  const tokens = (quotes ? q.replace(QUOTED, ' ') : q).split(/\s+/).filter(Boolean);
+  const CULTIVAR = /(^|\s)['"‘’“”]\p{Lu}[^'"‘’“”]*(?:['"‘’“”](?=[\s.,;:)]|$)|$)/gu;
+  const tokens = (quotes ? q.replace(QUOTED, ' ') : q.replace(CULTIVAR, ' ')).split(/\s+/).filter(Boolean);
 ...
-    if (b && b !== 'x') { names++; lower = /^\p{Ll}/u.test(t); }
+    if (!b || b === 'x') { lower = false; continue; }
+    names++; lower = b.length >= 4 && /^\p{Ll}/u.test(t.replace(/^[^\p{L}]+/u, ''));
 ...(relaxedQuery)
-    const ws = words(t);
+    const ws = [words(t).join(' ')];
```

### 2. P2, confirmed. A hybrid formula is answered as one of its parents, with no "Showing results for"
- **Where:** the same rule, `search.ts:102`. A capitalised genus after "x" is read as the author of the epithet before it.
- **Results:**
  - "Aloe vera x Gasteria" is cleaned to `Aloe vera x`. The answer is Aloe vera, direct and unlabelled.
  - "Aloe aristata x Aloe vera" is cleaned to `Aloe aristata x`. The trailing "x" is dropped as a trailing marker, and the answer is Aloe aristata, direct and unlabelled.
  - Because the first search finds something, the retry never fires and the page never says it changed the question. The grower concludes that the cross is the species.
  - In the synthetic fuzz, "parents formula" queries found their first parent 96% of the time, always without a label.
- **Where it shows:** the front page, compare and the species 404's "Did you mean". The add form's picker and the import are not affected, because `parseName` files a cross under its genus and does not search it.
- **The fix:** `lower = false` after an "x" or "×" token (in the diff above). The query then finds nothing as written, and the retry answers "Showing results for 'Aloe vera'", which is at least said.

### 3. P2, confirmed. A quoted cultivar is searched as a name word in the first pass, picks a species by its spelling, and the retry never fires
- **Where:** `search.ts:79-91`. The round chose to drop quoted words only in the retry, because of "Copiapoa ’cinerea’". So in the first pass a cultivar's words are matched like any other word, exactly or within one edit.
- **Results:**
  - "Echeveria 'Lola'" and "Echeveria ‘Lola’" answer Echeveria lilacina alone, unlabelled. In the near pass, "lola" is one edit from "lila", the start of "lilacina".
  - "Aloe 'Variegata'" answers Gonialoe variegata alone, through its older name "Aloe variegata".
  - "Haworthia 'Cooperi'" answers Haworthia cooperi.
  - On 4173, "Copiapoa 'Hum'" answers Copiapoa humilis with no relaxed header.
  - In the synthetic exploration, 46 of 124 "Genus 'Cultivar'" queries were not retried. Some found nothing; others found an unrelated species through the near pass: `Senecio "Lola"` gave Senecio lilacina, Adenium lilacina and Mammillaria lilanata, and `Cyrtanthus "Variegata"` gave a species whose older name is "Cyrtanthus variegata".
  - This is the brief's "retry should fire and does not": the near pass runs before the retry and answers first.
- **The fix:** drop a quoted text that begins with a capital in the first pass (the `CULTIVAR` line above). A phone's quotes around an epithet are lower case ("Copiapoa ’cinerea’"), so that case still holds; the existing test passes.

### 4. P2, confirmed. An author pasted in lower case is searched as words and can answer another species, unlabelled
- **Where:** `search.ts:81`. `AUTHOR` only knows capitalised abbreviations (`\p{Lu}…\.`).
- **The effect:** "l.", "mill.", "phil.", "hort. ex lem." typed on a phone stay in the query as words, and the exact and near passes use them to choose among candidates.
- **Fuzz results (lower-case spelling against the capitalised one):**
  - "orbea humilis l." gave Hechtia humilis alone, where "Orbea humilis L." gave Orbea humilis.
  - "opuntia truncata mill." gave Opuntia pillansii alone ("mill" is one edit from "pill").
  - "echinocereus dinteri hort. ex lem." differed too.
  - When no other species takes the extra words, the answer is a labelled retry: "Nothing matched 'aloe vera l.' as written", which says a correct name failed.
  - In the fuzz, 8 of the 1,100 all-lower-case spellings answered differently from the original query.
- **Reproduction:** `corpus--search-grower-names.test.ts`, finding 4, a two-species index.
- **The fix:** after the name is complete, treat any token that ends in "." and is not a rank marker as the start of a citation, whatever its case (`/^[\p{L}.'’-]+\.$/u` once `names >= need`).

### 5. P2, confirmed in the browser. The add form's picker offers a retried species as a match, and picking it replaces the variety the grower typed
- **Where:** `src/lib/ui/SpeciesPicker.svelte:84-88` and `pick()` at `:109`. `searchCatalogue` returns a list that carries `.relaxed`; the picker ignores it.
- **Seen on 4173:**
  - Typing "Copiapoa cinerea var. columna-alba" offers one suggestion, "*Copiapoa cinerea* Cactaceae · has a species page". Nothing says it is the species and not the variety (screenshot `picker-variety.png`).
  - Clicking it sets the field to "Copiapoa cinerea" (`picker-variety-picked.png`). The variety is gone from the record about to be saved.
  - Before round 60 the picker offered nothing here, and the name was kept as typed.
- **Not affected:**
  - The import (`src/lib/import/check.ts`). It searches `speciesOf(...)`, a binomial, and accepts a hit only on an exact name, an exact older name or a same-genus spelling within two edits, so a retried hit is never taken as found.
  - Compare. It shows retried hits unlabelled, but a click adds a species page, which is what was shown.
- **The fix:** in the picker, drop hits whose answer carries `relaxed`, or show them as "species of …". When one is picked, keep the typed rank and epithet: the same as `value = s.name + rest`, the way a cultivar is kept.

### 6. P3, confirmed. "Showing results for" cuts a hyphenated epithet in half
- **Where:** `search.ts:122`. `relaxedQuery` counts "victoriae-reginae" as two words.
- **Examples:**
  - "Agave victoriae-reginae cv. Compacta" says "Showing results for “Agave victoriae”".
  - "Opuntia ficus-indica var. burbankii" says "Showing results for “Opuntia ficus”".
  - "Mammillaria victoriae-reginae Britton & Rose subsp. …" gave "Mammillaria victoriae" in the fuzz.
  - Each label names a species that does not exist. The hits are right, because the half is a prefix.
- **The fix:** count one token as one word (in the diff above).

### 7. P3, confirmed. Two spellings of one name, two answers
- **"×" against "×epithet":** "Aloe ×nobilis Baker" is a labelled retry ("Nothing matched … as written"), while "Aloe × nobilis Baker" and "Aloe x nobilis Baker" are direct. `lower` tests the first character of "×nobilis".
- **Capitalised epithets:** "Haworthia Cooperi Var. Truncata Schwantes" and the same name in lower case gave different lists in the fuzz (8 title-case cases), for the reasons in findings 1 and 4.
- **A trailing "var.":** "Moraea" and "Moraea var." differ (188 cases). That is by design, since the marker is a word while it is the last thing typed. It is not counted as a finding.
- **The fix:** findings 1 and 4.

### 8. P3, confirmed. Two weak retries
- **"E. 'Perle von Nürnberg'":** it retries on "E" and says "Showing results for “E”". The list is the short path's answer for "e": Echeveria, Echinocactus, Euphorbia milii and so on. Better: do not retry on a single letter, or keep the genus abbreviation only with an epithet.
- **"Echeveria Perle von Nurnberg" (an unquoted cultivar):** it retries on "Echeveria Perle", which finds nothing, so the grower gets nothing. When the two-word retry finds nothing, a third step on the first word alone (when it is a genus of the index) would answer Echeveria.

### 9. P2, confirmed in code. The common name shown is GBIF's first English name, unnormalised, and the species page reads a different list from the tile
- **Where:**
  - `src/lib/dossier/index-entry.ts:26-38` (`englishNames`, called from `scripts/build-dossiers.ts:128`);
  - `src/lib/dossier/sources/gbif.ts:64-76`;
  - `src/routes/species/[slug]/+page.svelte:40`.
- **What the code does:**
  - `gbif.vernacular` drops duplicates by lower case and language before anything counts them, and keeps neither GBIF's `preferred` flag nor `country`.
  - `englishNames` takes the first name tagged `eng` as `common`.
  - Nothing normalises capitalisation anywhere: not the build, not the tile, not the page, and no CSS text-transform. So Curio rowleyanus shows "String-Of-Beads Senecio" on its tile, its row and its species title ("Curio rowleyanus (String-Of-Beads Senecio): habitat rain, cold nights and light · Cultifolio"), while "String-of-Pearls" sits in `commons`.
- **The seam:** the species page builds its own list as names tagged `eng` or untagged (`!v.lang || v.lang === 'eng'`), up to four. Its title, its line of common names and its JSON-LD `alternateName` can therefore lead with an untagged name, possibly not English, that the tile never shows.
- **How widespread:** not measurable here (the live site and GBIF are unreachable). `corpus--common-name-rule.test.ts` has an audit: run with `INDEX=<built index.json>` and it prints the number of species whose `common` names another genus of the corpus, has a capital after a hyphen, or would change under the rule, with forty examples. The index carries `common` and `commons`, which is enough for the genus and spelling parts of the rule.
- **Proposed rule, no hand-picked names** (`displayCommon` in that file, tested):
  1. English names only, grouped by their words: case, hyphens, spaces and apostrophes do not make a different name.
  2. A name containing another genus of the corpus (any genus but the species' own, so a former genus counts) goes after every name that does not.
  3. Then a name GBIF marks `preferred`. This needs the build to keep the flag.
  4. Then the name more sources give. This needs `gbif.vernacular` to count sources before it removes duplicates; until then, the number of spellings in the group stands in.
  5. Then GBIF's order, which is today's rule, kept as the last tie-break.
  - The spelling shown is the group's with the fewest capitals after its first letter, with a capitalised little word between hyphens lowered ("String-Of-Beads" becomes "String-of-Beads"). Other capitals may be proper nouns ("Queen Victoria", "Christmas") and are kept.
- **For Curio rowleyanus:** "String-Of-Beads Senecio" names Senecio and goes last. "String-of-Pearls" and "String of pearls" form one group of two. The rule shows **"String of pearls"**.
- **The page:** use the index's rule for its title too, so the tile, row, title and JSON-LD agree, and keep untagged names out of "common names", or label them.

### 10. P2, confirmed. Every catalogue row page carries the day's featured species, ahead of the row it is about
- **Where:** `src/routes/+page.svelte:659`, `{#if visitor && feature && !searchMode}`. The server sends `feature` for every query of the front page (`+page.server.ts:59-63`).
- **On 4173:**
  - `/?by=genus&open=welwitschia` serves "This is what every species page shows · Copiapoa cinerea" with its figures and chart.
  - In the page's text, Copiapoa cinerea starts at character 513, and Welwitschia mirabilis first appears at character 3,352 of 3,839.
  - The same holds for `/?by=genus&open=copiapoa`, `/?chip=climate` and `/?q=aloe`.
  - These row pages are the roughly 1,300 genus addresses the sitemap submits, each with its own title and canonical. A crawler reads each as mostly about another species, and a different one each day.
- **Size, measured on `/`:**
  - The feature block is 14,020 of 67,603 bytes of HTML, plus about 2 KB of the 4,000-byte `__data.json`.
  - Gzipped, the HTML is 14,865 bytes with the block and 11,936 without it: +2.9 KB, about 25%.
  - On a phone the block is rendered and then hidden by CSS (`:783`), so phones download it too.
- **The fix:** send and draw `feature` only on the plain front page (no `by`, `open`, `chip`, `from` or `at`) and only to wide screens. The first is a server condition; the second can stay CSS.

### 11. P3, confirmed. The feature's other costs
- **The R2 read:** one `getDossier` (an R2 GET plus a schema parse) on every render the page cache does not hold. That includes every client navigation's `/__data.json` for `/`, which the hook never holds and counts under `render`. Memoising `fd` per isolate by corpus id and key for a minute would make it one read per isolate per minute.
- **A failed read is kept:** when the read fails (R2 error, a dossier missing), the page is a 200 with no feature, and the hook keeps that copy for a minute. Harmless, and the code says so.
- **The hemisphere:** the season card in the block is rendered on the server for the northern hemisphere. The home key has `hemi: false`, and /about/how says the hemisphere cookie goes only with species and compare pages. A southern reader sees northern months until hydration.
- **The cache key:** sound. The feature depends on the corpus (in the key) and the UTC day (not in the key, at most 60 s stale across midnight).

### 12. P3, confirmed. `searchCatalogue` can cut a character in half and then say "could not be reached"
- **Where:** `src/lib/ui/index.svelte.ts:115`, `q.trim().slice(0, 80)`, which counts UTF-16 units.
- **The effect:** a query whose 80th unit is the first half of an emoji leaves a lone surrogate, and `encodeURIComponent` throws "URI malformed". The catch returns null, and the page says the reference could not be reached. The search box has no `maxlength`.
- **The fix:** `[...q.trim()].slice(0, 80).join('')`, as `_clean` does.

### 13. P3, confirmed (open by choice: "sheetsIn's fallback"). Without a manifest, a species whose dossier cannot be read is simply absent from its sheet bucket
- `/api/sheets` answers 200 `[]` for its bucket. `sheetForName` then returns `'none'`, which a plant page shows as "not in the reference": a refusal said as an absence (rule 2).
- Under a manifest the sheets come from the build's products, so the live site is not affected while it has one.
- Documented as `it.fails` in `corpus--refusal-walk.test.ts`.

### 14. P3, confirmed by reading. What the search sends and keeps, said in some places and not others
- **/about/formats#privacy:** it says a search "typed on the front page or in the species picker goes to /api/search?q= as typed". It leaves out the import (names the hash groups do not settle) and the compare page. It does not say the answer is kept a day under the text. /about/how says both, in different sentences. Rule 4 asks both pages to be true; the formats page is incomplete.
- **/about/how's counts:** it says "Cloudflare's edge keeps copies of two public answers" in one place and lists three (a forecast, a search, a species address) in another. The text a grower types into the picker or imports is a name from their own list, kept a day in the Worker's cache keyed by that text. It is not linked to an address, which makes the "public answers" wording defensible, but the picker and import sentences should say it.
- **"Anything shaped like a plant number":** the front page's test is `/^\d{2,4}-?\d/` (`+page.svelte:350`). A prefix-scheme number that is not one of the grower's own ("ACC-0012", "KEW-12", a typo) is sent. `isAccessionNumber` (`accession.ts`) is the app's own shape and would match it.

### 15. P3, confirmed by reading. The sitemap's `lastmod` is the corpus build day for every address
- `sitemapChunk` gives /, /about/how and /about/formats the corpus's build day, though they change with deploys, not corpus builds.
- Every species gets the same date on each refresh, whether its page changed or not.
- Search engines discount a `lastmod` that does not track real changes.
- **The fix:** no `lastmod` on the /about pages, and leave species without one until per-dossier dates exist, or use them.

### 16. P3, confirmed. The fuzz harness compares against the wrong index when it runs more than one seed in a process
- `searchAnswer` reads the module's held corpus for a minute (`dossiers.ts:106`).
- A second seed's platform in the same process is never read, unless `_forgetIndex()` is called. My first multi-seed run reported 49% of exact names "not found" for this reason.
- `r60-corpus-fuzz.test.ts` runs one seed per process, so its claim stands. It also computes `twoSpell` without asserting or printing it unless `FUZZ_OUT` is set.
- My fuzz calls `_forgetIndex()` per seed.

### 17. P3, read. The retry's passes are charged separately, not summed
- `searchOnce` checks `WHOLE_LIKE` on each call's own exact and near candidates (`dossiers.ts:506`, `:514`). A query that finds nothing and whose retry also ranks close to 2,000 candidates per pass costs up to four rankings, about two whole-index passes, uncharged.
- Small: the threshold is per pass and is not reached by ordinary queries.
- The fix is to carry the running count through `charge`.

### Still open from 59
- Finding 4: a refused manifest on a cold isolate still serves the top-level index under another id. Decided in the S-report (item 18) and asserted by a corpus-r60 test. Noted only.
- Finding 8: dossiers come from fixed, overwritten paths, so a page held under corpus A can show B's text for a minute. Stated in the S-report's known limits, and the feature inherits it.

## Checked and sound
- **Postings equal the whole index, retry included:** 13,200 grower-shaped queries over five seeds, 0 mismatches, at limits from 1 to 100. That covers the short path (single letters and "x a"-style leading markers), trailing markers, near passes, older names, `commons` and every quote and `×` form. The candidate proofs in `postings.ts` hold for the cleaned query because both sides read `queryTokens`.
- **The retry and the edge cache:**
  - The key is computed once from the cleaned query, so a read and a write cannot be cleaned differently.
  - Only answers from the held corpus are put. A 429 and a `searchmiss` refusal are never stored.
  - A hit is answered in the shape asked, with `x-search-relaxed` set from the stored `relaxed`.
  - Keys are bounded by the 80-character cleaned query and `n` (1 to 100), and every miss is rate-counted.
  - A posting product that cannot be read falls to the charged whole index, whose answer is correct, so a day-long entry is never wrong.
- **The import's handling of retried answers:** a hit counts only as an exact name, an exact older name, or a same-genus spelling within two edits. A retry's hits cannot pass as "found".
- **Refusal walk (`corpus--refusal-walk.test.ts`):** under a refused manifest with no top-level index, and under R2 throwing with nothing held, all twelve routes answer 503: home, species, compare, search, entries, sheets, rows, dossier, corpus, index, sitemap and its chunk. None serves the fixture, none says 404 or returns an empty list. +error.svelte says "could not be read … not a statement that the page does not exist" for any 503.
- **The front page with a broken feature:** with the featured species' dossier missing or its read throwing, the page renders whole with `feature: null`.
- **Species, compare and `/api/dossier` with an unreadable dossier:** 503 and `no-store` (corpus-r60's tests, re-run).
- **Rule 2 in the clients:** `searchCatalogue` maps a 429 to a wait and anything else not ok to "not reached", never "nothing matches". The import maps both to "not checked". One gap: the picker shows no reference suggestions and says nothing when the reference search fails. It only says so when GBIF fails (`SpeciesPicker.svelte:87`).
- **Head tags on 4173:**
  - Species pages have a self canonical, `og:url`, `og:type` article, `og:site_name`, `twitter:card` summary_large_image, and `og:image` from the hero at the iNaturalist "large" size, or `/og.png` when there is no photograph.
  - Descriptions are 155 characters or fewer and name their sources.
  - The front page has og:image with dimensions and alt. Genus rows have their own canonical and og tags.
  - robots.txt names the sitemap and blocks `/api/`. The fixture (no manifest) writes no `lastmod`, as intended.
  - Minor: species pages give no `og:image:width/height`, and titles with a common name run past 70 characters ("… · Cultifolio").
- **`_clean`:** NFC before the cut, cut by code points, and the quote and citation marks the search reads are kept.
- **Odd species addresses:** 301 to the slug with an encoded Location (corpus-r60, re-run).
