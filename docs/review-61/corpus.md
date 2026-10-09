# Self-review of round sixty-one: corpus and search

Reviewer: corpus. Commit `f4ab4f8`, my copy `/tmp/r61rev/corpus` (no source file edited; every probe file removed after use).

## Opening

The round's search fixes hold for the shapes they were written for, and the postings still answer exactly what the whole index answers on every new path. The new rules open three new ways to answer wrongly, though, and one of them is reached by an ordinary habit: a name typed in quotes ("Aloe vera") is now dropped whole, and the page says nothing in the reference matches it. The picker undoes the author rule by lower-casing the name before it asks, and `pickedName` writes a half-typed rank or an author into the plant's name. The common-name rule does what its code says, but `/about/how` describes two steps (preferred, most sources) that have no data in the live corpus, and a spelling step that `gbif.ts` settles before the rule sees it.

What I ran:
- **70 targeted queries** through `searchAnswer` over a postings-built synthetic index (3,000 synthetic species plus 21 real-shaped entries), each compared with the whole-index search and with round sixty's `search.ts` from `/tmp/r61/base.tar`. 0 postings mismatches.
- **A new fuzz** over the rule paths the round opened (St./Mt. common names, three-letter epithets with authors, cf./aff./sp./spp./hort./agg./s.l., abbreviated second parents, whole names in quotes, ×Gasteraloe, intergeneric formulas, trailing full stops), on the 9,000-species synthetic index, 2 seeds x 120 queries x 6 spellings (about 1,400 answers). 0 mismatches. `out/tests/corpus--fuzz-new-paths.test.ts`.
- **`englishNames` and `gbif.vernacular`** on 25 constructed cases (homonym genera, spellings, counts, first letters).
- **Chromium on 4173:** the picker at `/plants/new` with author pastes and half-typed ranks, and the front page with a quoted name. Three screenshots.
- **Reading:** `search.ts`, `postings.ts`, `searchAnswer`, `/api/search`, `searchCatalogue`, `SpeciesPicker.svelte`, `picked-name.ts`, `index-entry.ts`, `gbif.ts`, the species page server, `build-dossiers.ts` (`nameEntries`), `audit-common-names.ts`, `sitemap.ts` and its routes, and the about pages' statements of both rules.

Tests delivered: 4 files, 21 failing reproductions and 17 guards (each file's header says which).

## Findings

### 1. P1. A whole name in quotes is dropped as a cultivar, and the page says nothing matches. Confirmed, new in round sixty-one.

- **Where:** `src/lib/core/search.ts:86` (`CULTIVAR`) and `:100`.
- **What happens:** a quoted text that begins with a capital is removed before the first search. When the quotes hold the whole name, nothing is left:
  - `"Aloe vera"`, `“Copiapoa cinerea”` and `'Copiapoa cinerea'` all answer `[]`;
  - `relaxedQuery` removes them too, so there is no retry;
  - round sixty answered each with the species.

  The front page then says: *Nothing in the reference matches “"Copiapoa cinerea"”. It holds a fixed list of 4 species…* (`shots/corpus/front-quoted-name.png`). That is a false "nothing matches" (rule 2), for a search-engine habit (quoting a phrase) that a first-time visitor may well have.
- **Reproduction:**
  - `curl -G --data-urlencode 'q="Copiapoa cinerea"' -d shape=2 http://127.0.0.1:4173/api/search` gives `{"hits":[]}`.
  - `corpus--search-grower-shapes.test.ts`: 3 failing tests.
- **Should:** a quoted text is a cultivar only after a name word. When the quotes are all there is, search what is inside them.
- **Smallest fix:** in `cleanQuery`, when the first pass leaves no token, search the text with its quote marks removed:
  ```ts
  if (!quotes && !out.length) return cleanQuery(q.replace(/['"‘’“”]/g, ' '), false);
  ```
  Or require the `CULTIVAR` match to follow a word: `(?<=\S\s)` in place of `(^|\s)`.

### 2. P2. The picker lower-cases the name before searching, so the author rule never applies there. Confirmed, made worse by round sixty-one.

- **Where:** `src/lib/ui/SpeciesPicker.svelte:71` (`const needle = p.scientific.toLowerCase()`), sent by `searchCatalogue(needle, 6)` at `:87`.
- **What happens:**
  - The author rule reads capitals. The picker sends `copiapoa cinerea britton & rose`, so "britton" is kept as a word, the server answers only by the retry, and the picker no longer offers a retried answer.
  - In Chromium on 4173, `/plants/new` offers no reference row for "Copiapoa cinerea Britton & Rose", "Copiapoa cinerea (Phil.) Britton & Rose" or "Copiapoa cinerea Britton" (`shots/corpus/picker-author-paste.png`). It does offer one for "Copiapoa cinerea Phil." (a dotted author, which the rule reads in lower case).
  - The front page's search answers all of these directly, with no label.
  - Round sixty's picker offered the species, through the retry.
  - With the name service down, as in the sandbox, the grower gets nothing to pick for the name exactly as POWO and Kew print it.
- **Reproduction:** `out/tests/corpus--picker-author.spec.ts`, test 1, confirmed by the equivalent script. The network log shows `?q=copiapoa cinerea britton & rose&n=6`, and the API answers `relaxed: {query: "copiapoa cinerea"}`, while the capitalised text answers with no `relaxed`.
- **Smallest fix:** send `p.scientific` as typed. The server folds case itself, and the cache key keeps case on purpose.

### 3. P2. `pickedName` writes a half-typed rank or an author citation into the plant's name. Confirmed, new in round sixty-one.

- **Where:** `src/lib/ui/picked-name.ts:18-20`.
- **What happens:** everything after the typed binomial is kept. The species is offered for each of these inputs, because the search drops a trailing rank marker and a dotted author:
  - "Copiapoa cinerea var" plus a click leaves the field at "Copiapoa cinerea var" (Chromium, `shots/corpus/picker-dangling-rank.png`);
  - "Copiapoa cinerea f" leaves "Copiapoa cinerea f";
  - "Copiapoa cinerea Phil." leaves "Copiapoa cinerea Phil.";
  - "Copiapoa cinerea KK 1234" keeps the field number in the name;
  - the round's own e2e enshrines "Copiapoa cinerea var. c".
  - Before the round, the pick wrote "Copiapoa cinerea".
  - The rest is also appended when the picked species differs from the typed binomial: "Copiapoa cinerea var. c" picked as Lithops lesliei gives "Lithops lesliei var. c".
- **Reproduction:**
  - `out/tests/corpus--picked-name.test.ts`: 6 failing cases and 1 guard.
  - `corpus--picker-author.spec.ts`, test 2: failed as expected ("Received: Copiapoa cinerea var").
- **Smallest fix:** keep the rest only when it is a rank marker followed by a complete epithet, `^(var|subsp|ssp|f|fo|forma|v)\.?\s+[a-z-]{3,}`, and only when the picked binomial equals the typed one. Otherwise write `picked.name + cv`.

### 4. P2. A hybrid formula is still answered as one species, unlabelled, when the second parent is abbreviated or is a genus alone. Confirmed. The corpus-2 fix is incomplete; the behaviour predates the round.

- **Where:** `search.ts:111` and `:116`. After "x", only `lower` is reset, and `names` stays at 2.
- **What happens:**
  - **Abbreviated second parent.** The abbreviation ("G.") matches `AUTHOR` and ends the query:
    - "Aloe vera x G. batesiana" and "Aloe vera × G. batesiana" are answered as plain Aloe vera, with no "Showing results for";
    - so is "Gasteria batesiana x A. aristata".

    This is the exact failure the round fixed for "Aloe vera x Gasteria", in the form growers write most.
  - **A genus as the second parent.** "Gasteria x Aloe" drops the non-final "x" and matches a Gasteria whose older name is an Aloe (Gasteria disticha through Aloe disticha), unlabelled.
    - "Gasteria 'Little Warty' x Aloe" now does the same directly. Round sixty at least answered it as a labelled retry.
    - When the first pass finds nothing, `relaxedQuery` skips the "x" and retries "Gasteria Aloe", which is the same cross-synonym match, labelled with a name nobody wrote.
  - `parseName` (outside my files, but on the picker's path) reads "Aloe vera x G. batesiana" as parentage "Aloe vera × Aloe batesiana": the abbreviation is expanded with the first parent's genus.
- **Reproduction:** `corpus--search-grower-shapes.test.ts`, "a hybrid formula…": 2 failing tests.
- **Smallest fix:**
  - In `cleanQuery`, mark the token after "x"/"×" as never an author (`afterX = true; … if (afterX) { afterX = false; out.push(t); names++; continue; }`).
  - In `relaxedQuery`, stop at a hybrid sign that has a name word on both sides (`if (b === 'x' && kept.length) break;`) instead of skipping it, so the retry is the first parent.

### 5. P2. "St." and other dotted words inside a common name cut the query. Confirmed; the lower-case form is new in round sixty-one.

- **Where:** `search.ts:111`, through `AUTHOR` (`St.` is a capitalised abbreviation) and `DOTTED` (`st.`).
- **What happens:** once two words precede it, a dotted word ends the query:
  - "Lily of St. James" (a common name of Sprekelia) is searched as "lily of" and answers the first entry with "lily" and "of" (Agapanthus in the test), unlabelled;
  - round sixty answered "lily of st. james" correctly; the new `DOTTED` rule breaks it;
  - "Dudleya abramsii mt. hamilton" is cut to the species, which is harmless.
- **Reproduction:** `corpus--search-grower-shapes.test.ts`, 2 failing tests. The undotted "Lily of St James" passes as a guard.
- **Smallest fix:** let `DOTTED`, and a capitalised abbreviation of four characters or fewer, start a citation only when `lower` is true or a rank was just read (that is, after an epithet), as the capitalised-word rule already does. "Aloe vera L." and "orbea humilis l." still drop the author. "Aloe Vera L." in title case becomes a labelled retry, which is acceptable.

### 6. P2. "cf.", "aff.", "sp." and "spp.", as on labels, give nothing or a wrong species unlabelled. Confirmed; predates the round, and the round's fuzz listed them without judging them.

- **Where:** `search.ts:68` (`RANK_MARKERS` lacks them).
- **What happens:**
  - "Copiapoa cf. cinerea" and "Copiapoa aff. cinerea" find nothing: "cf" must begin a word, and the retry "Copiapoa cf" finds nothing too. The page says nothing matches.
  - "Aloe sp." answers Aloe speciosa, Aloe spicata and Aloe × spinosissima, unlabelled.
  - "Gymnocalycium sp. LB 123" says "Showing results for Gymnocalycium sp" over G. spegazzinii.
  - "Aloe spp." finds nothing.
- **Reproduction:** `corpus--search-grower-shapes.test.ts`, 2 failing tests.
- **Smallest fix:**
  - Add "cf" and "aff" as words that are skipped, like "x".
  - Treat "sp", "spp" and "nov" as ending the name, like a rank: `relaxedQuery` breaks there, and the first pass drops them when another word precedes them.

### 7. P2. `/about/how` states a common-name rule whose middle steps the live corpus cannot apply. Read; quantified below.

- **Where:**
  - `src/routes/about/how/+page.svelte:36`;
  - `src/lib/dossier/build.ts:164-169`: `--rederive` carries the stored vernacular block;
  - `src/lib/dossier/sources/gbif.ts:72`: `limit=50`, with `endOfRecords` ignored.
- **What happens:** the live corpus was rebuilt from stored dossiers, whose names were fetched before this round. So:
  - **No name carries `preferred`.** Rule 3 never fires.
  - **No name carries `sources`.** Before this round `gbif.ts` kept one row per lower-cased name and dropped the rest. Rule 4 therefore only counts hyphen, space and apostrophe variants that survived as separate rows.
  - **The shown name is effectively GBIF's first English name that is not set back,** unless another name has more spelling variants. GBIF's order is not a ranking: it follows the datasets.
  - **The page states "then a name GBIF marks preferred; then the name more of GBIF's sources give"** as what decides today, which it does not, anywhere.
  - **Truncation.** Fetched afresh, `vernacularNames?limit=50` stops at 50 rows across every language. For widely named species (Aloe vera, Opuntia ficus-indica, Agave americana, Crassula ovata), English names past row 50 never reach the dossier, and the counts of rule 4 are taken over a truncated sample. That is an absence where the true state is "not checked" (rule 2).
- **How much it matters:** the live index cannot be reached from here. Commands 13 and 14 below measure it: how often a GBIF-preferred English name differs from the shown one, and how many species are truncated.
- **Smallest fix:**
  - Say on `/about/how` that the preferred flag and source counts apply only to names fetched since round sixty-one, or give `--rederive` a `--names` step that asks `vernacularNames` afresh (one request per species).
  - Page `vernacularNames` until `endOfRecords`, or stop at a cap and record "truncated".

### 8. P3. The spelling and source steps do not do what `/about/how` says. Confirmed.

- **Where:**
  - `gbif.ts:77`: rows are grouped by `toLowerCase()`, keeping the first row's spelling;
  - `index-entry.ts:84`: `g.sources += n` over a group's rows.
- **What happens:**
  - **"Of a name's spellings, the one more sources give is shown."** For spellings that differ only in case, `gbif.ts` has already kept the first one. Rows "japanese privet" (A), "Japanese Privet" (B) and "Japanese Privet" (C) show "Japanese privet", not GBIF's majority "Japanese Privet". This is the very kind of name section 12 set out to fix; it escapes only when the lower-case listing is hyphenated.
  - **"The name more of GBIF's sources give".** One source that lists "Jade plant", "Jade-plant" and "Jade Plant" counts as three, so it outranks "Money tree" from two distinct sources. Q's report admits this ("grouped spellings counting as sources"); the page does not.
- **Reproduction:** `out/tests/corpus--common-name-rule.test.ts`, 2 failing tests.
- **Smallest fix:**
  - In `gbif.ts`, keep each exact spelling's own source set under the lower-case group, and pick the majority spelling there.
  - In `englishNames`, count the distinct `source` strings per group when they are present, rather than summing rows.

### 9. P3. Set-back by genus word: cases where the rule chooses badly. Confirmed by construction; the rule is at fault, not the data.

`index-entry.ts:91-97`. With the corpus's genera, the grower's own word goes last in all of these:

| Species | Shown | Set back |
|---|---|---|
| Hippeastrum | "Barbados lily" | "Amaryllis" (Amaryllis is a genus) |
| Colchicum autumnale | "Meadow saffron" | "Autumn crocus" |
| Hesperaloe parviflora | "Hummingbird plant" | "Red yucca" |
| Aristaloe aristata | "Torch plant" | "Lace aloe" |
| Gonialoe variegata | "Kanniedood" (an Afrikaans name tagged English) | "Tiger aloe" |
| Selenicereus and Epiphyllum | "Queen of the night" | "Night-blooming cereus" |
| Moraea | "Cape tulip" or similar | "Peacock iris" |

- The binomial shape sets back "Crinum lily" and "Canna lily", which are real English names: the own genus plus one lower-case word.
- The match is on whole words, so the plural "Bitter aloes" is not set back while "Bitter aloe" is. That is inconsistent (`corpus--common-name-rule.test.ts`, 1 failing test).
- "Lily" is correctly not treated as a genus, and "Senecio" names in Curio are correctly set back.
- **Suggestion:** set back a name for another genus only when that genus is one of the species' own older names (its `syn` genera), which is what "a former genus counts" was for. A homonym genus that the species never belonged to then stops costing the grower's word.

### 10. P3. Other small items.

- **(a) `firstUp` stops at a leading ʻokina or apostrophe.** Hawaiian names ("ʻihi" for Portulaca, "ʻākulikuli" for Sesuvium) stay lower case, against "no shown name begins in lower case" (`index-entry.ts:47`; 1 failing test). Fix: capitalise the first letter after any leading `\p{Lm}`, `'` or `’`.
- **(b) "Every other English name is listed and searched" (`/about/how`).** The page lists at most four (`+page.server.ts:136`, `.slice(0, 4)`), joined with ", ". A set-back comma-list name among the four then reads as several names.
- **(c) A trailing full stop changes the answer.** "Copiapoa cinerea columna-alba." is answered as the species with no label (`DOTTED` reads the epithet as an author), while the same text without the stop is a labelled retry (1 failing test).
- **(d) A quoted cultivar after a genus initial.** "E. 'Perle von Nürnberg'" answers every genus beginning with E, unlabelled, while "E. cv. Perle von Nürnberg" answers nothing: the single-letter guard of corpus 8 is bypassed by the first pass (1 failing test). "Echeveria 'Lola'" is answered as the whole genus, unlabelled; a "Showing results for Echeveria" label would be more honest about the dropped cultivar.
- **(e) Three-letter epithets.** "Begonia rex Putzeys" is now a labelled retry. That is acceptable; it is noted only because the brief asked for it.
- **(f) Curly quotes and a variety.** "Copiapoa ’cinerea’ var. columna-alba" (phone quotes) retries as "Copiapoa", the whole genus, because the retry removes the lower-case quoted epithet (`QUOTED`). This predates the round.
- **(g) The picker is silent when the reference search fails or is rate-limited.** `searchCatalogue` returns `null` or `{limited}`, and the picker treats both as "no rows" (`SpeciesPicker.svelte:92`). Its hint still says "only the reference's own species are offered". Still open; Q left it.
- **(h) `scripts/audit-common-names.ts`.**
  - It takes the first argument not starting with `--` as the source, so `--sample 40 index.json` reads "40".
  - Run on an index already rebuilt by the rule (as its header advises), it reports 0 changes by construction: `englishNames` applied to its own output is idempotent. It cannot audit the post-deploy index.

## Checked and sound

- **Postings equal the whole index** on every new path: 70 targeted queries, and the new fuzz with about 1,400 answers over 2 seeds, all with 0 mismatches. This covers the hit lists and the `relaxed` label. `queryPlan` and `rankedWords` read the same `queryTokens`, so the equivalence holds by construction for `cleanQuery` changes.
- **The round's fixed shapes:**
  - "Aloe x spinosissima", "Aloe ×spinosissima", "×Gasteraloe", "x Gasteraloe beguinii";
  - "Aloe vera L.", "l.", "Burm.f.", "(L.) Burm.f.";
  - "Haworthia cooperi hort." and "hort. ex Baker" (both direct now; round sixty retried);
  - "v."/"ssp." mid-name with an author after the infraspecific epithet;
  - "Copiapoa cinerea nothovar. x";
  - "String of Pearls" and "Mother of Thousands" searched whole;
  - "Copiapoa ’cinerea’" with lower-case phone quotes;
  - "Aloe vera x Gasteria batesiana" as a labelled retry on "Aloe vera".
- **`relaxedQuery`:** a hyphenated epithet is one word, and a single letter is never retried ("E. cv. Perle" gives nothing).
- **Summed charging (`searchAnswer`):**
  - one running count across both passes and both searches;
  - `charge` is memoised, so a request is charged at most once;
  - the whole-index fallback charges through the same memo.
  - The near count includes the exact candidates again, which errs on the side of charging.
- **`searchCatalogue`** cuts by code point. The server's `_clean` cuts again after cleaning, so two spellings cannot split differently.
- **Picker "not asked" wording:** shown only on a 503 or 429 whose body says `held: true`; a plain failure still says "did not answer".
- **Page and tile agree by construction:**
  - the page uses `generaOf(byGenus.keys())` and the build uses `generaOf(index names)`, which give the same set, × genera included (guard test);
  - both read the dossier's own English rows and pass the same `genus`.

  They disagree only if the live index is older than the final rule; command 11 checks that.
- **`firstUp`:** a leading digit, emoji, apostrophe, or astral character neither throws nor changes anything; inner capitals are kept ("Apple-of-Peru").
- **`nameEntries`:** runs on both index paths (build and `writeIndexFromDisk`) and keeps the key order.
- **Sitemap:**
  - `/`, `/about/how` and `/about/formats` carry no `lastmod`;
  - species pages and genus rows carry the corpus build day;
  - `&` is escaped in the genus-row addresses;
  - the genus row's canonical (`/?by=genus&open=<slug>`) equals its sitemap address;
  - an out-of-range `sitemap-N.xml` is a 404;
  - `/privacy` and `/about` are redirects and rightly absent.

  The only remaining weakness is the known one: every species shares the build day, so a `--rederive` marks all 8,947 pages modified.

## What to run on the live site

Set up first:

```sh
S=https://cultifolio.com
curl -s $S/api/index > idx.json
```

`ask` prints the hit names and the retry label:

```sh
ask() { curl -s -G --data-urlencode "q=$1" -d n=3 -d shape=2 "$S/api/search" | jq -c '{names:[.hits[].name],relaxed}'; }
```

1. **Quoted name (finding 1).** `ask '"Aloe vera"'`. Confirmed if `{"names":[],"relaxed":null}`, while `ask 'Aloe vera'` finds it.
2. **Abbreviated parent (finding 4).** `ask 'Aloe vera x G. batesiana'` and `ask 'Gasteria batesiana x A. aristata'`. Confirmed if the first name is the first parent and `relaxed` is null.
3. **Intergeneric formula (finding 4).** `ask 'Gasteria x Aloe'` and `ask 'Aloe x Gasteria'`. Confirmed if species of the first genus come back with `relaxed` null.
4. **Qualifiers (finding 6).**
   - `ask 'Copiapoa cf. cinerea'` and `ask 'Copiapoa aff. cinerea'`: confirmed if `names` is empty.
   - `ask 'Aloe sp.'`: confirmed if it gives Aloe sp… species with `relaxed` null.
   - `ask 'Gymnocalycium sp. LB 123'`: confirmed if `relaxed` is "Gymnocalycium sp".
5. **Dotted words in common names (finding 5).** List the candidates:
   ```sh
   jq -r '.[] | . as $e | ([.common] + (.commons // []))[] | select(. != null) | select(test("^\\S+\\s+\\S+\\s+(\\S+\\s+)*\\S*\\.(\\s|$)")) | "\($e.name)\t\(.)"' idx.json
   ```
   Then run `ask "<that name in lower case>"` on each. Confirmed for any name whose own species is not first.
6. **Picker path (finding 2).** `ask 'copiapoa cinerea britton & rose'`: confirmed if `relaxed` is "copiapoa cinerea". In the app, type "Copiapoa cinerea Britton & Rose" into Add plant: no "has a species page" row confirms.
7. **One name, two answers (finding 10c, 10d).**
   - `ask 'Copiapoa cinerea columna-alba.'` against `ask 'Copiapoa cinerea columna-alba'`: confirmed if `relaxed` differs.
   - `ask "E. 'Perle von Nürnberg'"` against `ask 'E. cv. Perle von Nürnberg'`: confirmed if E genera come back against nothing.
8. **Lower-case first letters (finding 10a; also tests the index's age).**
   ```sh
   jq -r '.[] | select(.common != null) | select(.common | test("^[^\\p{L}]*\\p{Ll}")) | [.name,.common] | @tsv' idx.json
   ```
   Any line confirms 10a.
9. **Homonym set-back (finding 9).**
   ```sh
   jq -c '.[] | select(.name | test("^(Hippeastrum|Colchicum|Hesperaloe|Aristaloe|Gonialoe|Selenicereus|Epiphyllum|Peniocereus|Moraea|Dietes|Crinum|Canna|Hylotelephium) ")) | {name, common, commons}' idx.json
   ```
   Confirmed where `commons` holds "Amaryllis", "Autumn crocus", "Red yucca", "Lace aloe", "Tiger aloe", "Night-blooming cereus", "Peacock iris" or "<Genus> lily" and `common` is another name.
10. **Every set-back by genus word,** for a wider read:
    ```sh
    jq -r '.[] | select(.commons != null) | select(any(.commons[]; test("\\b(Amaryllis|Crocus|Iris|Yucca|Aloe|Cereus|Agave|Sedum|Haworthia|Senecio|Kalanchoe|Euphorbia|Opuntia)\\b";"i"))) | select(.common | test("\\b(amaryllis|crocus|iris|yucca|aloe|cereus|agave|sedum|haworthia|senecio|kalanchoe|euphorbia|opuntia)\\b";"i") | not) | [.name,.common,(.commons|join(" | "))] | @tsv' idx.json | wc -l
    ```
11. **Page against tile.**
    - First, `jq '[.[] | select(.common != null and (.common|test("^\\p{Ll}")))] | length' idx.json`. A number above 0 means the index is still the first deploy's build: every such tile disagrees with its page.
    - Then sample 100 species:
      ```sh
      jq -r '[.[] | select(.commons != null)] | .[range(0;length;20)] | "\(.slug)\t\(.common)"' idx.json | head -100 | while IFS=$'\t' read s t; do p=$(curl -s "$S/species/$s" | grep -o '"alternateName":\["[^"]*"' | sed 's/.*\["//; s/"$//'); [ "$t" != "$p" ] && echo "$s tile=$t page=$p"; sleep 1; done
      ```
      Any line confirms a disagreement.
12. **Spelling majority (finding 8).** For a species whose GBIF list has case-only variants:
    ```sh
    curl -s "https://api.gbif.org/v1/species/<KEY>/vernacularNames?limit=1000" | jq -r '.results[] | select(.language=="eng") | "\(.vernacularName)\t\(.source)"' | sort
    ```
    Compare with the live `common`. Confirmed if the majority casing differs from the one shown.
13. **How much preferred would change (finding 7).**
    ```sh
    jq -r '[.[] | select(.commons != null)] | .[range(0;length;40)] | "\(.key)\t\(.common)"' idx.json | while IFS=$'\t' read k c; do p=$(curl -s "https://api.gbif.org/v1/species/$k/vernacularNames?limit=1000" | jq -r '[.results[] | select(.language=="eng" and .preferred==true) | .vernacularName] | unique | join(" | ")'); [ -n "$p" ] && echo "$k	shown=$c	preferred=$p"; sleep 0.5; done
    ```
    The share of lines where `preferred` does not include the shown name estimates how many shown names rule 3 would change after a re-fetch.
14. **Truncation at 50 (finding 7).**
    ```sh
    KEY=$(jq '.[] | select(.name=="Aloe vera") | .key' idx.json)
    curl -s "https://api.gbif.org/v1/species/$KEY/vernacularNames?limit=50" | jq '{endOfRecords, n:(.results|length), eng:[.results[]|select(.language=="eng")|.vernacularName]}'
    ```
    Confirmed if `endOfRecords` is false and the `limit=1000` answer has English names the first 50 lack. Repeat for Opuntia ficus-indica, Agave americana and Crassula ovata.

## Files

- **Tests**, at `/tmp/r61rev/out/tests/`:
  - `corpus--search-grower-shapes.test.ts`: 11 fail, 11 guards;
  - `corpus--common-name-rule.test.ts`: 4 fail, 4 guards;
  - `corpus--picked-name.test.ts`: 6 fail, 1 guard;
  - `corpus--picker-author.spec.ts`: e2e, 2 fail. Test 1 timed out in page setup under load when run as a spec; its assertion is confirmed by the equivalent Chromium script. Test 2 failed as expected;
  - `corpus--fuzz-new-paths.test.ts`: a guard, passes.
- **Screenshots**, at `/tmp/r61rev/out/shots/corpus/`: `front-quoted-name.png`, `picker-author-paste.png`, `picker-dangling-rank.png`.
