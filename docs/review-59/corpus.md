# Round 59 review: corpus, search, caching, SEO

Reviewer area: corpus. Copy: /tmp/cf-r59-corpus (Node 24.21, Linux). Shared server http://127.0.0.1:4180 (four-species fixture, no manifest, GBIF not reachable from it). The live site is not reachable from this machine, so nothing here is measured on the real 8,947-species corpus. Instead I used a synthetic index of 9,000 species: real genera weighted by size, real and generated epithets, 8% var./subsp./f., 3% hybrids ("Aloe × x", "× Gasteraloe y"), 1% cultivars, synonyms on a third, common names, and origins with accents. The index is 3.7 MB, against about 4 MB live.

New test files, all in the copy's tests/unit/: `r59c-synth.ts` (the generator), `r59c-fuzz.test.ts`, `r59c-refresh.test.ts`, `r59c-cost.test.ts`, `r59c-ux.test.ts`, `r59c-mixed.test.ts`. Their outputs are in /tmp/review59/corpus/: `fuzz-*.json`, `near.json`, `refresh.log`, `cost.json`, `ux.txt`.

## Findings

### 1. P1. A species whose lead photograph is from Commons loads the full-size original, and so does its link preview
- Confirmed in code and by evaluating `shownAt`. How many live species are affected was not measured, because the live site is unreachable.
- Where: `src/lib/dossier/sources/wikimedia.ts:131` stores `url: ii.url`. That is the original upload, with the 800 px `thumburl` kept only as `thumb`. `src/lib/dossier/photo-size.ts:52` `shownAt` keeps `p.url` for any `upload.wikimedia.org` address. On the species page (`+page.svelte:36`, `:260`, `:265-266`, `:286`), `photoAt(heroSrc, 'medium'|'large')` returns that original unchanged, since Commons has no sizes in `photoAt`.
- What happens: for a Commons hero, the phone preload, the `<img>`, `og:image` and the JSON-LD `image` all name the original. Commons originals are often 3 to 20 MB. Link-preview crawlers (Facebook, X) drop an og:image over their size limit, so the preview has no picture.
- What should happen: show the 800 px thumbnail, or a sized Commons thumb URL (`/thumb/.../1024px-...`), as `shownAt` already does for unknown hosts.
- Smallest fix: in `shownAt`, return `p.thumb` for COMMONS when it is a `/thumb/` URL. Better, teach `photoAt` the Commons thumb form and keep the original only for the link.

### 2. P1. The genus, family and origin row pages claim a habitat climate for every species
- Confirmed over HTTP against 4180.
- Where: `src/routes/+page.svelte:422`.
- `GET /?by=genus&open=refusia` returns `<meta name="description" content="Refusia: 1 species in the reference, each with its native range, habitat climate and sources."/>`. Refusia testii's climate was refused, and `/?by=genus&open=welwitschia` says the same while Welwitschia's climate is pending.
- These are the 1,300 or so genus URLs the sitemap submits. It is the same fault the round fixed on the front page and the species description.
- What should happen: say only what holds for every species in the row. The row already carries `withClimate` and `notChecked`.
- Smallest fix: "N species, M with a habitat climate" from `openRow.withClimate`, or drop "habitat climate".

### 3. P1. Search fails the commonest ways a grower writes a name
- Confirmed against `/api/search` on 4180 and with `search()` in `r59c-ux.test.ts` (results in ux.txt).
- These return nothing:
  - an author citation pasted from POWO or a label: "Copiapoa cinerea (Phil.) Britton & Rose", "Lithops lesliei N.E.Br.", "Copiapoa cinerea L.";
  - an infraspecific name the reference files under its species: "Copiapoa cinerea var. columna-alba", "Copiapoa cinerea subsp. haseltoniana", "Haworthiopsis attenuata f. clariperla";
  - a hybrid written with x: "Aloe x nobilis", "x Gasteraloe beguinii". Yet "Aloe × nobilis" and "Aloe nobilis" find it, so two spellings of one query get different answers;
  - a cultivar: "Echeveria 'Perle von Nurnberg'", "Echeveria elegans ‘Rainbow’", "Echeveria cv. Perle";
  - other rank spellings: "v.", "fo.", "subspecies";
  - a run-together common name: "livingstones".
- The species 404's "Did you mean" uses the same search, so `/species/copiapoa-cinerea-var-columna-alba` offers nothing (seen at 4180).
- What works: misspellings of four or more letters ("litops", "mammilaria", "welwitchia", "gymnocalicium"), "C. cinerea", "ssp."/"subsp" forms of a name that is in the index, common names in the index ("living stones", "snake plant"), and older names in `syn`.
- What should happen: a query that finds nothing is retried on its plausible name, and the page says it did.
- Smallest fix: add `x`, `cv`, `v`, `fo`, `forma`, `subspecies`, `variety`, `nothosubsp`, `aff`, `cf` to the ignored markers (in both `search.ts:59` and `postings.ts:81`). On zero hits, retry with the first two words, minus anything in brackets, any word containing "." or "&", and anything after a rank marker or a quote. Label the retry as "showing matches for Copiapoa cinerea".

### 4. P2. A rejected manifest keeps the old corpus only in isolates that were already running; every new isolate serves the bare top-level index under a third id
- Confirmed in `r59c-refresh.test.ts`, scenarios S2 and S4.
- Where: `dossiers.ts:146`. `if (previous?.fromStore) ...` holds only when the isolate already has a corpus. A cold isolate falls through to `store.get('s/v2/index.json')` (line 158), as before round 59.
- This happens after every deploy (all isolates start cold), when traffic starts a new isolate, and in each colo. The code comment's own first case, "a Worker deployed before the build that wrote it", is exactly the cold case.
- Measured:
  - S4, a Worker that requires a product the live manifest lacks: every cold isolate serves `e08c1cde60c45dfd (no manifest)` for as long as that manifest is live, while warm isolates serve the manifest id `7c52...`.
  - S2, manifest uploaded before its index: warm isolates keep A, cold isolates serve the top-level index under its etag, then B once the files land.
- Effects:
  - Two corpus ids are answered at once, so devices flip between them and every id-keyed cache splits.
  - The service worker prunes its corpus cache on each new id (`service-worker.ts:166`).
  - `/api/corpus` says `manifest:false` on some requests only.
  - Each such isolate holds the whole prepared index: 15.4 MB, and 302 ms cold load at 9,000, measured.
  - Each such isolate derives sheets by reading about 280 dossiers per bucket (`sheets.ts:23-29`).
- What should happen: one rule for all isolates.
- Smallest fix: when `s/v2/manifest.json` exists but is refused, do not adopt the top-level index. Serve the last manifest this build accepted: write `manifest.prev.json` to the bucket, or keep an accepted-manifest pointer in KV. Or fail `/api/corpus` loudly so `live-check` catches it every time. At the least, correct the round's claim.

### 5. P2. One failed R2 call during the minute's check turns every reference page into a 500, and can drop a good corpus
- Confirmed in `r59c-refresh.test.ts`, S5 and S6.
- Where: `dossiers.ts:122`. `await store.head(watched)` is not caught. Only the second head (line 123) is.
- S5: with R2 failing for the check, `corpusNow` throws on every request after the minute (`THROWS R2 down`), although the isolate holds a good corpus. The hook catches it (`hooks.server.ts:117`), but the page's own `corpusNow` (`+page.server.ts:18`, `+page.server.ts:26`) throws again, giving a 500.
- S6: when the head sees a new manifest and the following `get` fails, `cached` was already set to null (line 133), so the held corpus is gone and the next request is a cold load.
- Smallest fix: wrap the head and the reload in try/catch. On error, keep `previous`, set `previous.at = Date.now() - CACHE_MS + 10_000` so it retries in ten seconds, and return it.

### 6. P2. The near pass is never charged, and costs what the charged queries cost
- Confirmed in `near.json`, the fuzz files and `cost.json`.
- Where: `dossiers.ts:434` applies `WHOLE_LIKE` to the exact candidates only. Lines 438-439 prepare and rank the near candidates with no check.
- At 9,000 species, a typo whose deletion keys hit the family or an origin produces near-candidate sets close to the threshold:
  - "xact" 1,883 candidates, 78 ms median;
  - "cactaceea" 1,956 candidates, 66 ms (and 1,956 exact candidates first, also uncharged);
  - "xasp" 1,933 candidates, 142 ms;
  - "mexcio" 44 ms.
- For comparison, the charged "c m" took 102 ms and "a f" 191 ms. Preparing the whole-index fallback takes 101 ms.
- If Cactaceae passes 2,000 in the real index, "xact" goes over the charge threshold and is still billed to the ordinary 3,000-per-10-minute search allowance.
- Smallest fix: check `exact candidates + near candidates > WHOLE_LIKE` before preparing the near set, and charge once per request (today a charged exact pass followed by a missing posting file charges twice, lines 434 then 438).

### 7. P2. The round's "one corpus per request" fix has no test: three reverts all pass
- Confirmed by mutation in /tmp/review59/corpus/mut.
- I changed three lines, each to ignore `locals.corpus`:
  - `species/[slug]/+page.server.ts:18` to `await corpusNow(...)`;
  - `+page.server.ts:26` the same;
  - `hooks.server.ts:46` dropped the `event.locals.corpus` argument.
- All five test files that mention `locals`, `page.server` or `hooks.server` still pass (33 tests).
- `page-corpus.test.ts` passes a `resolve` stand-in that reads `e.locals.corpus` itself, so it tests the hook, not the pages. The round lists it as the test for this fix.
- Smallest fix: in that test, call the real home and species `load` from inside `resolve`.

### 8. P2. A species page held under corpus A still renders the bucket's current dossier and genus record, and its 404 path reads the current index
- Confirmed in `r59c-mixed.test.ts`. The log says `page keyed under corpus 82fd6401a3bb3dc6 rendered summary "CORPUS B TEXT"`.
- Where: `getDossier` and `getGenus` read fixed, overwritten paths (`s/v2/<key>.json`, `s/v2/g/<slug>.json`). These are uploaded in the same copy as the products, before the manifest.
- The 404 branch's `synonymInIndex` and `synonymOf` call `getIndex` (`synonyms.ts:45`, `:85`), not the held `c`.
- Window: from the dossier upload until each isolate reads the new manifest, up to 60 s after it lands. Pages in that window carry A's siblings and near cards with B's dossier, stored under A's key for 60 s. A rollback by re-uploading the old manifest leaves B's dossiers under A's id indefinitely.
- Harm is small, but "one corpus per request, all the way down" (REVIEW-ROUND-59 1.7) is not what the code does.
- Smallest fix: pass `c` to the synonym helpers, and word the claim as "one index per request".

### 9. P2. Species addresses with a space, underscore, encoded "?" or CR/LF misroute
- Confirmed over HTTP.
- `/species/Copiapoa%20cinerea` returns `301 Location: /species/copiapoa cinerea`, with a raw space in the header (`species/[slug]/+page.server.ts:16` interpolates the decoded slug). The lowercase form then returns 404 "No species page for “copiapoa cinerea”" for a species the reference holds.
- `/species/Copiapoa%3Fx` returns 301 to `/species/copiapoa?x`, a different page.
- `/species/A%0D%0AX-Evil:%201` returns a 500 rather than a 404.
- `/species/copiapoa_cinerea` returns a 404 that says "The reference has no Copiapoa_cinerea: it is built from a fixed list of names, and none of this genus is on it". That is false: `nameFromSlug` splits on "-" only (`synonyms.ts:25`), and the text is in `+error.svelte:23`.
- Smallest fix: when the decoded slug differs from `slugify(slug)` and the slugified one resolves, return a 301 to `/species/${slugify(slug)}`. Otherwise use `encodeURIComponent` in the Location. Split `nameFromSlug` on `[-_\s]+`.

### 10. P2. Link previews of species and genus pages are thin
- Confirmed over HTTP against all four fixture species and the genus rows.
- Species pages have `og:title`, `og:description` and, only when there is a photograph, `og:image`. They have no `twitter:card`, `og:type`, `og:url`, `og:site_name` or `og:image:alt`.
- Copiapoa humilis and Refusia testii have no photograph, so they have no `og:image` at all; `/og.png` is not used as a fallback.
- Genus, family and origin row pages (`/?by=genus&open=copiapoa`) have a title, description and canonical, but no og or twitter tags.
- Suspected, not checked live: X uses `twitter:card` to choose the large-image card, so a species link on X is likely to show small or with no image.
- Smallest fix: copy the front page's block (`+page.svelte:428-436`) into the species head with `og:url` set to the canonical, `og:image` set to the hero or `/og.png`, and `twitter:card` set to `summary_large_image`. Add the same to the row branch.

### 11. P2. /about/how still describes the round-53 corpus layout (rule 4)
- Confirmed by reading.
- Where: `src/routes/about/how/+page.svelte:73` (`#corpus`). It says the products are "uploaded beside it under a directory named by the corpus id (a hash of the index)", "the search split by first letter", and "a refresh is a new directory".
- The code since round 56 stores each product under its own md5 in `s/v2/p/` (`manifest.ts:40`). The search is postings by short keys plus `short.json`, and the id is a hash of every product's hash (`products.ts:124`).
- Smallest fix: rewrite the paragraph from `manifest.ts`'s header comment.

### 12. P2. The repo's adversarial search generators produce very little variety
- Confirmed with gen-variety.mjs.
- Where: `search-generations.test.ts:17`, `short-path.test.ts:14` and `postings.test.ts:12` use `seed = (seed * 1103515245 + 12345) & 0x7fffffff`. The product passes 2^53, so the low bits are lost: from seed 7, `rnd(2)` and `rnd(4)` return 0 sixteen times running, and `(rnd(64), rnd(64))` gives 15 distinct pairs out of 4,096.
- Re-run with the file's own code, the "wider" case (16-letter alphabet, 1,500 species) yields:
  - 356 distinct names, most made of "a" ("a aaaa var. aa");
  - 1,480 of 1,500 names with a rank marker (about 25% intended);
  - an origin on 14 of 1,500 (about half intended).
- The round-58/59 claim that the postings equal the whole index "adversarially" therefore rests on a much narrower corpus than described. My own fuzz, with a proper PRNG, found no mismatch (see the sound list), so the claim holds, but the test would not catch much.
- Smallest fix: `Math.imul` or mulberry32 in all three files.

### 13. P3. Collection shells and /offline are indexable and have no title in the served HTML
- Confirmed over HTTP.
- `/plants`, `/today`, `/labels`, `/backup`, `/sync`, `/places` and `/propagation` serve HTML with no `<title>`, no description and no robots meta. A shared `/plants/12` link previews as a bare URL.
- `/settings` and `/offline` have titles but no `noindex`. robots.txt allows all of them.
- Fix: a static `<title>` and `<meta name="robots" content="noindex">` in those layouts.

### 14. P3. The sitemap has no `lastmod`
- Confirmed: `sitemap.ts:33` writes `loc` only.
- The manifest's `built` (or the dossier's build date) would let crawlers re-fetch only what changed after a refresh.

### 15. P3. The fallback species description is not clipped
- Confirmed by arithmetic.
- Where: `+page.svelte:41`. The fixed tail is 99 characters, so any name plus family over 54 characters passes 155. For example, "Turbinicarpus pseudomacrochele subsp. krainzianus, Cactaceae: native range, ..." is 162 characters.
- `clip` can also end ".…" when the cut falls just after a full stop.
- Fix: `clip(fallback, 155)`, and strip a trailing period before adding the ellipsis.

### 16. P3. The refusal memo for an index of the wrong length is untested
- Confirmed by mutation: deleting `dossiers.ts:168` (`if (manifest) rejectedManifest = mEtag;`) leaves `manifest-refused`, `search-generations` and `index-cache` passing.
- Without that line, each isolate re-reads and re-parses the 4 MB index every minute for as long as that manifest is live.
- Fix: in test 2, count gets over five minutes, as test 1 does.

### 17. P3. The search route's edge-cache assumption
- Suspected. I could not check live `cf-cache-status`.
- `RATE.search` (`sync.ts:796`) and the search, dossier and sitemap routes say answers are "cached at the edge, so only unique queries reach here".
- A Worker's own response is not stored in Cloudflare's cache without the Cache API or a Cache Rule. Neither appears in the code, wrangler.jsonc or DEPLOY.md.
- If that holds, every keystroke of every reader reaches the Worker and counts against the address's 3,000 per 10 minutes, and a campus behind one /48 shares that allowance.
- Fix: check `cf-cache-status` live. Either add a Cache Rule and document it in DEPLOY.md, or `caches.default` the search answers under `q` and `c`, as `/api/sheets` does.

### 18. P3. Smaller items
- JSON-LD `parentTaxon` names the family as the species' direct parent, skipping the genus, and `alternateName` is `[]` when there is no common name. Valid JSON-LD, but imprecise.
- Index before postings (S3, operator error only): every search takes the whole-index fallback under `searchmiss` (60 per 10 min), so a typing user is refused with 429 within a few searches. The miss is remembered for 60 s after the files land (S3: refused 30 s after landing, answered after 61 s).
- Suspected, from reading: the front page appends `/api/rows` from the corpus `/api/corpus` names now to HTML rendered up to 60 s earlier, possibly from the other corpus, so rows can repeat or skip across a refresh.

## The refresh sequence (fake R2, `r59c-refresh.test.ts`)

| Case | Warm isolate | Cold isolate | How long |
|---|---|---|---|
| S1: documented order (products and top index, then manifest) | A until its minute check, then B | B | at most 60 s of A after the manifest lands |
| S2: manifest before its index | A | top-level index under its etag (third id), no manifest | until the index product lands |
| S3: index product before the postings | B; searches go whole and are charged as `searchmiss` | same | gap plus 60 s of remembered miss |
| S4: Worker needs a product the manifest lacks | A, if any isolate is still alive | top-level index, no manifest | as long as that manifest is live |
| S5: R2 head fails | 500 on every request | 500 | as long as R2 fails |
| S6: get fails after a new manifest was seen | 500, and the held corpus is dropped | — | one request, then a cold load |
| S7: same manifest uploaded twice | same id, one re-parse | same | none |

The page cache (`c=` in the key) and the API `Cache-Control` decisions always take the id of the corpus the isolate holds, so no index-derived content is stored under another index's id. The exception is the dossier and genus content in finding 8. The service worker caches only `c=`-keyed answers the server marked public; with two ids live at once (cases S2 and S4), it prunes its corpus cache at each switch.

## Cost at 9,000 species (Node 24, a 2-CPU machine shared with eight other agents; medians of 5 runs)
- Building the products takes 3.3 s on the PC. Sizes: index 3.7 MB, postings 2.0 MB, entries 2.9 MB, `short.json` 82 KB, catalogues 351 KB.
- Cold corpus load under a manifest: 47 ms, 7.4 MB held. Without a manifest: 302 ms, 15.4 MB held (the prepared index).
- Search, warm:

| Query type | Examples | Time |
|---|---|---|
| short path | "a", "co" | 0.1 ms |
| two specific words | "aloe vera", "cop cin" | under 1 ms |
| genus | "aloe" | 12 ms |
| family | "cactaceae" | 12 ms |
| charged | "c m" | 102 ms |
| uncharged typo | "xact" 78 ms, "cactaceea" 66 ms, "mexcio" 44 ms | 44 to 78 ms |

- Whole-index fallback: 101 ms to prepare, plus 16 MB while it runs.
- Front page load: under 1 ms warm, 152 ms on the first request, which builds the per-index maps. Opened rows return 82 to 91 KB of data.
- Species page load: under 1 ms on the server side, 23 KB of data.
- Rendering a species page on 4180 (wrangler dev, not production, under load) takes 60 to 170 ms.
- Sitemap: 12.6 ms, 682 KB, 9,123 URLs.

## Checked and sound
- `searchAnswer` equals the whole index over 9,628 queries (four seeds, 9,000 synthetic species, with markers, accents, punctuation, slips and author strings): 0 mismatches. The short path reads `short.json` for "f a", "a a" and "var co". I found no query where the path chosen and the words ranked disagree.
- The `WHOLE_LIKE` charge on the exact pass works ("c m" was charged every time).
- The page cache key decodes the path: `%63opiapoa` and `%2D` hit the held copy. Mixed case gets a 301 and a trailing slash a 308, and neither is stored. `?was=` is not held, and an unknown query shares the plain copy. I found no way to mint unbounded keys.
- `/api/search` and `/api/dossier` are public only under the current id (`fixture`), and `no-store` under any other or none.
- The service worker keeps only query-less navigations, and only `c=`-keyed corpus answers that are not `no-store`.
- Species heads: title "Name · Cultifolio", self canonical, `lang="en"`, valid JSON-LD with `<` escaped. Descriptions are 155 characters or fewer and cut at a word for the fixture (Welwitschia 152, ending "Namib desert…"). The iNaturalist hero's og:image is the 1024 px "large", not the original.
- The sitemap index and chunk are well formed, with `&` escaped. Genus rows are self-canonical. robots.txt names the sitemap and blocks `/api/`. `/compare` is noindex.
- With GBIF unreachable, the species 404 says "Whether it is an older name ... was not checked" and is `no-store`. A misspelt address offers "Did you mean".
- The prune: `--keep-list` refuses a non-manifest and adds the local `manifest.json` and `manifest.prev.json`. DEPLOY.md section 5 re-reads the live manifest before the delete.
- The existing tests in this area pass on Node 24.21: 14 files, 68 tests (search-generations, short-path, manifest-refused, page-corpus, products, catalogue, hooks, photo-size, text-clip, synonyms, sitemap, search, postings, search-api). I did not run the e2e suite.
