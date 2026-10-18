# Round 76, agent W: the Worker without the whole index

Branch `r76` in `/tmp/claude-0/rev76/W`, on `r76base` (`e041950`). Commits by W.

## Done

**What the Worker now does.** Under a manifest that names this round's files, a cold copy reads the manifest, checks the genera file (it must count the manifest's species, as the index's length had to) and that the index is there (a head), and builds nothing over the index. Every name a request asks for is read by key from the build's files:

- `names/<h>.json` (128 at 8,947; FNV-1a of the key, `namesFilesFor` as `design-products.ts`): every key `indexMaps` and the slug map held, each kind in its own field so a slug and an older name of the same spelling stay apart: `s` (slug to key), `n` (accepted name in lower case), `o` (an older name, in lower case and as a slug: its one holder, or its holders in the 404's order with the name as written), and `#<key>` (`k`: the species' card, its older names, its nearest climates, its place in the index, and `x`, its record's older names that are another species' accepted name, so `namedElsewhere` needs no lookups).
- `rows/<by>/<h>.json`: each catalogue row's species under "all", sorted, with each one's place in the index. They give the opened row under every chip, a page's genus siblings, and the "Most grown" catalogue, rebuilt in the index's order.
- `genera.json` (genus and count, in the index's order), `featured.json` (the strip's pool, now chosen by the build: `featuredPoolOf` moved from `+page.server.ts` to `src/lib/dossier/catalogue.ts`) and `sitemap/<n>.json` (addresses and days).

The species route, the dossier API, `resolveSlug` (compare), the older-name redirect, the shared-name 404, `?was=`, `namedElsewhere`, the via page, the near cards, the home page (strip, opened row, "Most grown"), `/api/rows`, both sitemaps and `synonymInIndex`/`synonymAsk` all go through one interface (`src/lib/server/lookup.ts`, `Lookup`), with two implementations: the files (`filesLookup`), and the maps over the index (`indexLookup`, round 75's `indexMaps` moved verbatim to `src/lib/dossier/lookups.ts`). The species route's address logic is one function, `addressOf`, so the proof runs it on every address. A lookup file the bucket cannot give is a 503, never "no species page".

**The photograph judgement.** `--index` now reads every Commons file of every dossier against `heldNamesOf` of the index it has just written and stores `judged: { not?, rank }` on the file (`judgePhotos`; `judgeDossiers` in `scripts/build-dossiers.ts`), only writing files whose judgement changes. `shownPhotos` and `commonsFirstByEpithet` read it where no names are given (the Worker under the files); where names are given (the build, the fills, the fallback) the rules run again. `getDossier` passes no names under the files. `judged` is left out of the substance stamp (`changed.ts`), so it moves no sitemap day. Also fixed: a second `--index` moved bytes of the index (a tile's credit was put back at the end of its entry); it now always follows the thumbnail.

**Which code paths still read the whole index** under a manifest with the new files: only `searchAnswer` (`/api/search`, and the species 404's three suggestions for an address nothing else answers, which runs the search), through `indexOf`, which reads and parses the index product on the first such request and keeps it with that corpus; and `entriesIn`'s fallback when an entries file cannot be read (as before). `/api/index` passes the stored file on as a stream, never parsed. Under a manifest without the new files, or no manifest (the static and fixture corpora), everything reads the index as before.

**Formats and the order (enforced in code).** Either order of deploy and upload is safe. This round's Worker, meeting the live manifest (no new files), reads it through the index exactly as before (`fromFiles`/`hasLookups`; tested). The Worker live now, meeting the new corpus, accepts the manifest (extra names are allowed) and valibot drops `judged`; I ran r76base's build in workerd on the new corpus and every page answered 200. DEPLOY.md recommends deploy first, then the corpus step.

**Tests (each fails on `r76base`, where `lookups.ts`, `lookup.ts` and `judgePhotos` do not exist):**

- `tests/unit/r76w-lookups.test.ts`: a corpus built to hold every case (homonym slug, an older name two species hold, hyphenated spellings an address cannot tell apart, an older name that is another's accepted name, a merged page's alias, genus addresses, misses). Every key and address through the files and the maps alike, and all six address kinds present; the species route (with `?was=`), the home page under every chip and grouping, the dossier API and both sitemaps answer identically under a manifest with the files and under one without them (the fallback); under the files none of them reads the index product, `/api/index` streams it, and two searches read it once; a missing name file is a 503. Mutating `filesLookup`'s holder order or `rowItemsOf`'s chip filter fails it.
- `tests/unit/r76w-judged.test.ts`: a real case (Adromischus mammillaris, Commons title "Adromischus mammilaris"): hidden with no names and no judgement, shown with the names, shown with the stored judgement and no names, same order; a second judgement changes nothing; the stamp is unmoved; the Worker shows it under the files and under the fallback.
- `tests/unit/r76w-tail-summary.test.ts`: `scripts/tail-summary.mjs` reads `wrangler tail`'s file and names an `exceededMemory`.
- Changed to fit the design (their intent kept): `manifest-refused`, `r60-proposed-corpus` and `corpus-r60` (a manifest naming another corpus's index now also names its genera file, which is what an adopted corpus is checked by; the damaged-index case damages the genera file), `r60-review-server`, `r62bs-sheets`, `r63c-sitemap`, `synonyms` (mock `corpusNow`, not `getIndex`), `r70p-about-seams` (reads the pool rule from `catalogue.ts`), `r75g-opening-rule` (the new about sentence), `r72d-corpus-step` (a plan of five steps); `/about/formats` says "position in the index", since `r74-spaces` keeps "place" for a grower's space.

**Runs.** `npx tsc --noEmit -p .` and `npx svelte-check --threshold error`: 0 errors. `scripts/check-bundle.mjs` passes. The 28 affected specs, strict, Chromium and phone: 281 passed. Then the full Chromium and phone suite, strict: 496 passed, 5 skipped, none flaky (15.1 min). The whole unit suite once: 3,981 passed, 1 failed (`r74-spaces`: my formats paragraph said "place in the index"); fixed to "position", and that file and the 34 about-page files rerun: all passed.

**About pages.** `/about/how#corpus`, replaced (checked against `products.ts`, `dossiers.ts`, `lookup.ts`):

- "(the rows under “Most grown” are worked out by the server from the index and the counts' file, once for each index)" is now "…from the genus rows' files and the counts' file, once for each corpus)", and the list of products gains the name files, row files, genera, strip and sitemap.
- "The corpus id is a hash of the index, so the same index is the same id on every build." was already untrue (it hashes every product's hash, since round 54); now "The corpus id is a hash of every product's hash, so the same build is the same id."
- "A search reads only the postings its words need and the entries they point to; the server holds the index in memory and reads the rest by file, which is what lets the reference grow past what one server process could hold." is now: a species page, the front page, a data file and the sitemap read only the few small files they need; the whole index is read only for the search ("the catalogue's search, and the nearest names offered at a species address that names nothing"), on a process's first search, and kept; a reference built before these files is read as before; and the build stores each Commons file's reading against every name, "the rules are those given above for Commons' files, run when the reference is built rather than when a page is read."
- "a manifest whose files are not all there is not adopted" gains ", and nor is one whose genera do not count its species."
- In the full privacy list, the catalogue rows "which the server answers from its index" is now "…from the catalogue's files".

`/about/formats`: `judged` added to the dossier's photograph fields, and to what `changed.h` leaves out; a new paragraph (`#corpus-files`) lists every product of the manifest with its shape, the five new ones in full.

## Needs

- **For P (the strip):** the strip's pool is now a build product. Its rule and fields are `featuredPoolOf` and `featuredOf` in `src/lib/dossier/catalogue.ts` (the build writes `featured.json` with them; the page only rotates it by the day). A change to which species the strip shows, or to what each carries (a credit field, say), belongs there, and reaches the live site only after a re-index; anything the page derives per request belongs in `+page.server.ts` after `featuredOfCorpus`. `r70p-about-seams` now reads the rule's figures from `catalogue.ts`.
- **Merge:** `scripts/corpus-plan.txt` is this round's; if P's change needs a corpus step, its lines join this plan before the review.

## For the owner's PC

All in DEPLOY.md: section 5, "Round seventy-six's corpus step", and section 3, "A cold start's CPU and memory" and "The memory test at 50,000 species".

1. `npm run deploy` (it serves the live corpus through the index, as before).
2. `node scripts/corpus-step.mjs`, read the review, `node scripts/corpus-step.mjs --go-on`.
3. The cold start: `npx wrangler tail cultifolio --format json > tail.json`, open the four addresses given, Ctrl-C, `node scripts/tail-summary.mjs tail.json`.
4. The memory test, on a bucket and Worker of their own (`wrangler.scale.jsonc`, `cultifolio-scale`, never the live bucket): `npx wrangler r2 bucket create cultifolio-scale`; `synth-index.ts` and `synth-corpus.ts` as given; two rclone lines to `r2:cultifolio-scale`; `npm run build` and `npx wrangler deploy --config wrangler.scale.jsonc`; tail, open five addresses, `node scripts/tail-summary.mjs tail-scale.json` (it prints `ok` or `exceededMemory` per request); then delete the Worker, purge and delete the bucket.

## Measured

**The proof on the real corpus** (`scripts/dev/scale/r76-proof.ts`, output `scripts/dev/scale/results/r76-proof.txt`, 29 s), on round 72's copy after this round's `--index`:

- 251,023 keys (every slug, accepted name, older name in lower case, as a slug and as `synonymKey`, the names addresses read as, every dossier synonym's plain form, misses): slug, accepted name and older name each 0 different; 84,306 older names held by one species, 1,224 by two or more. Also 0 different against round 75's own `ambiguousSynonym`, `sharedOlderName`, `bySynonym`, the slug map and `byName`.
- 8,951 keys to species, the genera, 8,947 pages' `namedElsewhere` (283 names), 1,564 rows, 6,244 opened rows under four chips, 12 catalogues ("Most grown" included), the strip and the sitemap: 0 different.
- 85,360 addresses through `addressOf`: 8,947 pages, 8,949 moves, 1,320 genus rows, 41,950 older-name redirects, 582 shared-name 404s, 23,612 asked of GBIF: 0 different. The lookups made 307 bucket reads and never read the index.
- With round 73's merges applied as the live corpus has them (in memory; the copy predates them): all the same again, and `/species/coryphantha-macromeris` and `/species/rebutia-fidana` redirect to Pelecyphora macromeris and Weingartia fidaiana with `?was=`.
- Photographs: 8,947 dossiers, 252,337 photographs, 4,391 from Commons, all judged; 228,213 shown; with the stored judgement and no names against `heldNamesOf` of the index: 8,947 the same, 0 different. Without either, 47 pages (96 files) would show other photographs.

**The corpus step, dry run** (the real `corpus-step.mjs`, with rclone and the live check said but not run) on a copy of round 72's corpus: `--index` took about a minute; 889 dossiers written anew, each only gaining `judged` (98,726 bytes in all), plus 3 changed by round 73 to 75's shared-photograph marks and stamps (11798439, 7281301, 8357296); the manifest went from 139 to 366 files: names 128 files, 14.4 MB, largest 126 KB; `rows/genus` 64, 3.8 MB, largest 234 KB; `rows/family` 16, 3.75 MB, largest 553 KB; `rows/origin` 16, 3.75 MB, largest 977 KB; `genera.json` 21 KB; `featured.json` 10.6 KB; one sitemap file 376 KB. The index, 10 entries files, 4 sheets files and `short.json` changed too (the credit's place, and those 3 dossiers). A second run: "0 dossiers written anew", manifest "unchanged", and every file under `s/v2` the same by md5.

**Cold, in node** (`cold-routes.mjs`, the Worker's own route code, median of three; `results/cold-routes.jsonl`), before and after on the same corpus:

| | 8,947 before | after | 50,000 before | after |
|---|---|---|---|---|
| species page | 550 ms, 45.1 MB | 75 ms, 5.5 MB | 2,630 ms, 216.9 MB | 81 ms, 6.7 MB |
| home page | 379 ms, 26.4 MB | 54 ms, 2.9 MB | 1,540 ms, 118.8 MB | 61 ms, 3.1 MB |
| dossier API | 551 ms, 45.0 MB | 60 ms, 3.0 MB | 2,615 ms, 216.9 MB | 60 ms, 3.3 MB |
| first search | 371 ms, 25.2 MB | 258 ms, 12.1 MB | 1,698 ms, 112.3 MB | 815 ms, 53.7 MB |

**Cold, in workerd** (`wrangler dev`, local R2; `workerd-heap.mjs`, `results/workerd-heap.txt`). workerd's inspector would not collect garbage on request, so these are V8's heap in use two seconds after the answer, with what the heap had taken (a copy starts at about 5.9 and 9.3 MB):

| | 8,947 before | after | 50,000 before | after |
|---|---|---|---|---|
| species page | 56 / 109 MB, 501 ms | 6.5 / 9.3 MB, 36 ms | 132 / 199 MB, 2,532 ms | 10.6 / 19.3 MB, 99 ms |
| home page | 44 / 61 MB | 9.4 / 12.6 MB | 204 / 264 MB | 9.6 / 12.8 MB |
| dossier API | 50 / 107 MB | 7.1 / 9.8 MB | 127 / 199 MB | 7.0 / 10.5 MB |
| first search | 43 / 60 MB | 27 / 36 MB | 222 / 263 MB | 64 / 97 MB |

Four requests in one copy at 50,000 (species, home, a dossier, another species) end at 15.8 MB in use. workerd does not enforce 128 MB locally, so "exceededMemory" or "ok" is the owner's test.

## Not done, with why

- **Cloudflare's own figures** (CPU by `wrangler tail`, the 50,000 memory test) need the owner's account; the steps are written and never touch the live bucket.
- **The search still reads the whole index** (this round's scope). At 50,000 a first search held 64 MB in use and 97 MB taken in workerd, near the 128 MB; any unknown species address also reaches it, through the 404's suggestions. Round 77 (key files) removes it.
- **The name files are larger than the study's** (14.4 MB, largest 126 KB, against 2.9 MB and 37 KB): they carry each species' card and each older name's holders by key, address and name, so a page needs no second read. At 50,000: 512 files, 82 MB, largest 181 KB. A cold page reads its own name files and one per near species (up to six), in parallel.
- **Origin row files are large** (977 KB at 8,947; 5.2 MB on the synthetic 50,000, whose genera do not grow as a real one's would).
- **The browser suites run on the fixture corpus**, which has no manifest, so in the browser they exercise the fallback path through the new interface; the files path is proved in-process (unit tests, the real-corpus proof) and in workerd on the real corpus (every page 200).
- 100,000 was not measured again; the 50,000 figures show the cold pages flat.
