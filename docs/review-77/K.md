# Round 77, agent K: the search from key files

Branch `r77` in `/tmp/claude-0/rev77/K`, on `r77base` (`3aad821`). Commits by K, finished by K2 (agent K's session ended at `0cb0647` with four files changed and not committed). The last commit is `babdfc5`. Scratch: `/tmp/claude-0/rev77/K2-s` (the corpus copies, the dry run, the logs).

## Done

**What the Worker now does.** Under a manifest that names the search's files and round 76's lookup files, nothing on the Worker reads or holds the index: `indexOf` and `entriesIn`'s fallback refuse with a 503, said in the log as a fault. Every caller of the search (`/api/search` in both shapes, its retry, the 404's suggestions, so the front page, catalogue, Compare, both pickers and the import check) goes through `searchFromFiles`. Under a manifest without the search files (round 76's live corpus) the search reads the postings and the index as before, and the build still writes them, so deploy and upload can come in either order.

**The design, as committed in `0cb0647` and finished here.**

- **Keys** are beginnings of words, one character a level, in an exact tree (every word of the names, family and regions) and a near tree (`~`: name words with one of their first L characters taken out; coverage proved in `nearKeysOf`'s comment). A key of at most 2,000 species (`SEARCH_CAP`) has a file; one of more than 200 (`SEARCH_SPLIT`), or of one or two characters, also has children; one of more than 2,000 has only children and the whole index's best 100 answers to the word alone.
- **A key file holds only what the ranking reads**: `[position, [name, family, origin, common, commons, spellings, syn, older]]`, with the family and regions as numbers into `search/tables.json` (`{ families, regions }`). Photograph counts are in blocks of 4,096 by position and the hits' entries in blocks of 16 by position (`search/blocks.json` names both), read only for the matches. So a photograph or thumbnail change rewrites no key file.
- **Bounds on the near pass:** a near pass whose files hold more than 12,000 species (`NEAR_CAP`, read from the directories before any file) or that would rank more than 2,000 different ones (`RANK_CAP`) answers `narrow`. Key files are fetched as text by `storedText`, parsed as they come, let go, and never cached.
- **Directories:** the manifest names `search/top.json` (keys of one or two characters), `search/<n>.json` (by FNV of a key's first three characters; 64 at today's size, 512 at 50,000), `search/genera.json`, `search/tables.json` and `search/blocks.json`: 68 names more than round 76's manifest. Key, answer and block files are stored under `p/<md5>.json` like every product, named only by the directories and `blocks.json`.
- A query ranks, with the unchanged `search`, the species of the lightest word every hit must hold. Where every such word is heavy, a word alone is answered from the kept answers; otherwise `narrow` (no hits, `X-Search-Narrow: 1`), which the front page, Compare, the add form's picker and the import check ("not checked") each say.

**What K2 did.** The four uncommitted files were a nearly finished fix, not a half-done redesign: `0cb0647` broke two tests of the whole suite (`unit-full2.log` in K's scratch), and the four files repair both. I completed them (kept, not reverted) and committed them as `897ad7d`:

- `r74-spaces` failed because `/about/formats` said "the places" and `{ families, places }`. `Tables.places` became `regions` in `search-files.ts`, `dossiers.ts` (the shape check) and the formats page. I finished the rename in the module's comments, removed `placeWordsOf` (dead since `0cb0647`), and corrected `searchDirsFor`'s comment ("sixteen" → "sixty-four").
- `r61h-near-charge` failed because it measures the postings path's charge, which a corpus with key files no longer takes. It now runs on a manifest built before round 77 (`before77`), with a comment.

The last commit adds the remeasured results, the `manifest.ts` header (it now lists `tables.json` and `blocks.json`), and one stale test comment ("32 a block": `SHOW_BLOCK` is 16).

**Files.** New: `src/lib/core/search-files.ts`; the scale scripts `r77-proof.ts`, `r77-queries.ts` (and `.txt`, 69,021 queries), `r77-sizes.ts`, `r77-churn.ts`, `r77-near.ts` and their results; `tests/unit/r77k-search-files.test.ts`, `r77k-prune.test.ts`, `helpers/before-r77.ts`, `tests/e2e/r77k-narrow.spec.ts`. Changed: `search.ts`, `products.ts`, `manifest.ts`, `dossiers.ts`, the search route and its callers (front page, Compare, `SpeciesPicker.svelte`, `import/check.ts`), `build-dossiers.ts`, `corpus-step.mjs` (the prune fetches the live directories and `blocks.json`), `synth-corpus.ts`, `corpus-plan.txt`, `DEPLOY.md`, both about pages.

**Tests.** Each fails on `r77base`: `r77k-search-files` (9 tests: no `$core/search-files`), `r77k-prune` (2: the prune keeps no key file) and `r77k-narrow` (3, Chromium and phone: the message is never shown). On 2,300 synthetic species all from the Cape Provinces, the unit test proves:

- the route equals the whole index on more than 900 queries but five designed `narrow` ones;
- no caller reads the index or the postings under the files, and the index is never held;
- a corpus built before is searched as before;
- a missing key file is a 503;
- a photograph fill rewrites no key file;
- the about pages' figures match the code;
- two builds are identical, and `corpusHashes` names every stored file.

Twenty-one harnesses that build a bucket from `buildProducts` also put its `stored` files in it; seven tests of the postings path's own mechanics (now with `r61h-near-charge`) run on a `before77` manifest.

## Needs

**For the merge with C (do not merge here).** Six files are changed by both branches:

- **`src/lib/server/dossiers.ts`.** Keep C's `PRODUCTS_HELD = 1024`, `PRODUCTS_BYTES = 12 MB`, `_productsHeld`, the lazy fixtures and `generaHold`'s size. Keep all of K's: `stored` (split out of `product`, at the place where C added `_productsHeld`), `storedText`, `keyReader`, `searchedFromFiles`, the refusals in `indexOf` and `entriesIn`, and `narrow` in `searchAnswer`. `stored` writes into the same `products` map, so C's bound and `_productsHeld` cover the search's held files with no change. `searchedFromFiles` is `fromFiles(c) && hasSearchFiles(m)`, so with C's `hasLookups` (cards and older) the index is refused only where both sets are named.
- **`src/lib/dossier/manifest.ts`.** Take C's `hasLookups` (kept per manifest) and K's `hasSearchFiles` and `corpusHashes`, and merge the header comment: `names/` becomes `cards/` and `older/`, and the search lines stay.
- **`src/lib/dossier/products.ts`.** Take C's `cards/` and `older/` lines in place of `names/`, and K's `sink` argument, `stored`, `storedHashes` and search files. The hunks are next to each other, not the same lines.
- **`tests/unit/r76w-lookups.test.ts`.** Take both sides: C's `cardFilesFor`/`olderFilesFor` counts and its 503 case, and K's `...p.stored` in the bucket and "the search reads the index 0 times".
- **`tests/unit/r77c-page-cpu.test.ts` (C's).** `corpus()` must also put `p.stored` in its map, or any request that reaches the search (a 404's suggestions) answers 503.
- **`scripts/corpus-plan.txt`** (K's review line):
  - Merged, the manifest names 690 files (366 before): `names/` (128) gone; `cards/` (256), `older/` (128) and the search's 68 added.
  - The files-written figure must come from a dry run of the merged branch. K alone wrote 13,278 and C alone 384, and they are not simply additive.
- **`docs/DEPLOY.md`**, round 77's corpus step, "The order: either":
  - Replace "The Worker live now, if the upload comes first, reads the new manifest as before and passes by the new files" with C's sentence: round 76's Worker finds no `names/` and reads the corpus through its index, as before round 76.
  - Likewise "A Worker of this round, deployed before the upload, finds a manifest without the search files and searches the live corpus through its index as before": with C, it reads the whole round 76 corpus through its index, not only the search.
  - The review line's "68 files more than before and none fewer" becomes "324 more (452 added, 128 `names/` gone)".
- **About pages.** Both branches rewrote the same two paragraphs, `/about/formats#corpus-files` and the `#corpus` paragraph of `/about/how`, so hand-merge them: C's `cards/` and `older/` sentences in place of `names/`, and K's search-file sentences after them. `r77k-search-files`' about test pins K's phrases, and C's tests pin C's.

**A search's working set of parsed files**, for one cache bound. This is what one search puts in the product cache: directories, `genera`, `tables`, `blocks`, answers, photograph-count blocks and show blocks. The key files are read as text, parsed, let go and never cached. Measured over all 69,021 queries of the proof (characters of text, as the cache counts):

| | median | 99th percentile | most |
|---|---|---|---|
| held by the cache, 8,947 species | 10 files, 122 KB | 72 files, 788 KB | 98 files, 1.2 MB |
| held by the cache, 50,000 species | 20 files, 316 KB | 111 files, 1.3 MB | 127 files, 1.7 MB |
| key files read and let go, 8,947 | 17 KB | 366 KB | 1.1 MB |
| key files read and let go, 50,000 | 41 KB | 653 KB | 2.7 MB |

So C's 12 MB and 1,024 files hold a crawl's 7 to 8 MB and a search at once, and the bound can be one for both, not raised back to 24 MB. Across many searches the show blocks (560 files, 4.5 MB at 8,947; 3,125, 25 MB at 50,000) come and go by the cache's order like any product.

**For C or F's new tests:** any bucket built from `buildProducts` must hold `stored` too.

## For the owner's PC

DEPLOY.md, "Round seventy-seven's corpus step": `npm run deploy`, then `node scripts/corpus-step.mjs`, read the review, then `node scripts/corpus-step.mjs --go-on`. Either order is safe. The upload is larger this once: the search's files, about 280 MB in about 13,200 files (13,278 files written on the dry run). In the 50,000-species memory test (DEPLOY.md), a typing error is the search to watch (at most 52 MB taken here).

## Measured

All on the final code.

**The proof.** The corpus is round 72's as round 76's corpus step left it (`/tmp/claude-0/rev77/real-s/v2`, copied), after this branch's `--index` through the real corpus step: corpus `d8cc8e29840651e4`, 8,947 species. Results are in `results/r77-proof.txt`; whole 773 s, files 754 s.

- Of 69,021 queries, 68,921 answer identically: hits in order, every field, `relaxed`, `near`. 100 answer `narrow`, with 0 other differences.
- Through the files, the index was read 0 times, and the postings and `short.json` 0 times.
- The 100 `narrow` queries are exactly K's list: 67 constructed pairs of heavy words, and 33 others ("Cape Provinces", "Cape D", "north south", eight "… L." forms, "south's", "var's", "a e", "c a", "s.l.", "xcap" and their like), listed in the results file.
- No name, genus, family, place, common name, older name or typing error is narrow.
- Every section of the comparison equals the committed one, line for line; only the byte counts moved, by one byte (`regions`).

`/home/claude/r73data/s/v2` (round 72 as it was) gives the same search files and directories through the same `--index`; its manifest differs in six names, only by three species' `changed` day.

**Bucket reads per query, cold** (all 69,021):

- reads: median 11, 90th percentile 28, 99th 76, most 122;
- bytes: median 146 KB, 90th percentile 372 KB, 99th 1.0 MB, most 2.1 MB;
- the 8,751 typing errors: a median of 25 reads (90th percentile 37) and 306 KB; every other query a median of 11 (90th percentile 16) and 144 KB.

**Search files** (`results/r77-sizes.jsonl`; the same as `0cb0647`'s, rerun):

- At 8,947: 13,210 files, 278.0 MB, median 5.1 KB, 99th percentile 240 KB, largest 794 KB. That is 4,578 exact (159.6 MB), 8,027 near (113.9 MB), 42 answers, 3 photograph-count blocks and 560 show blocks (4.5 MB), plus 65 directories (711 KB, largest 24.5 KB). Heavy keys: 45 exact and 660 near. The first step had 9,181 files and 391.9 MB.
- At 50,000: 66,233 files, 2,250 MB, median 6.3 KB, largest 1.1 MB, and 513 directories (4.2 MB, largest 27 KB). The first step had 14,008 files and 2,008 MB, median 32 KB.

**Churn** (`results/r77-churn.jsonl`, rerun, the same). The test is a photograph fill: one species, or 1 per cent, gains a photograph and a new thumbnail.

| | one species | 1 per cent |
|---|---|---|
| 8,947 | 10 files, 6.8 MB (3 search files, 0.04 MB) | 276 files, 28.6 MB (99, 0.8 MB) |
| 50,000 | 9 files, 33 MB (3, 0.1 MB) | 1,412 files, 161 MB (593, 4.6 MB) |
| 50,000, the first step | | 5,978 search files, 1.8 GB |

**The near pass, uncapped** (`r77-near.ts`, the proof's 8,751 typing errors). At 8,947, none passes either cap; the most read is 1.46 MB. At 50,000, 40 would pass a cap (5 `NEAR_CAP`, 36 `RANK_CAP`) and so answer `narrow`. Within the caps, the most read is 2.2 MB, and the most of key files 1.4 MB.

**Cold first search, node** (`results/r77-cold-routes.jsonl`, median of three; before is `r77base`, unchanged):

| Query | 8,947 before | 8,947 after | 50,000 before | 50,000 after |
|---|---|---|---|---|
| aloe | 218 ms, 12.1 MB | 87 ms, 3.6 MB | 929 ms, 53.8 MB | 134 ms, 4.3 MB |
| cape | 351 ms, 12.1 MB | 72 ms, 3.8 MB | 1,281 ms, 53.9 MB | 94 ms, 4.8 MB |
| aloe verra | 266 ms, 12.7 MB | 140 ms, 3.8 MB | 1,020 ms, 54.6 MB | 322 ms, 5.3 MB |
| cape provinces | 307 ms, 12.2 MB | 60 ms, 2.8 MB | 1,190 ms, 54.1 MB | 76 ms, 3.2 MB |

Reads fell from 5.6 to 31.8 MB to 0.1 to 1.4 MB. A species page is unchanged (8,947: 77 ms, 5.5 MB; 50,000: 92 ms, 6.9 MB).

**Cold first search, workerd** (heap in use / taken; `results/r77-workerd-heap.txt`). Every answer's bytes are the same before and after.

- At 8,947: aloe 26.9/36.1 → 8.1/11.8 MB; cape 35.1/44.1 → 7.6/11.8; aloe verra 27.7/42.4 → 11.1/18.0; a species page then aloe → 11.9/18.3.
- At 50,000: aloe 64.4/97.7 MB, 536 ms → 10.5/17.5 MB, 140 ms; cape 80.9/126.4 → 7.9/13.5; aloe verra 66.3/113.3 → 14.4/28.8 (85.7 taken at the first step); a species page then aloe 68.1/101.4 → 12.3/28.3; cape provinces → 6.8/10.8.
- **The worst near reads at 50,000** (`results/r77-workerd-worst.txt`): the 200 typing errors that read most under the final files, 21 of them rank-capped. All answered 200. Heap taken: median 28.5 MB, 99th percentile 51.3, most 52.0 ("& ) “Ruby” Agave manantlanicola"); in use at most 30.1 MB. That is well under 128 MB. The first step's worst 200 took a median of 101 and at most 122.

**The corpus step, dry run** (the real `corpus-step.mjs`, rclone and the live check said but not run, on a fresh copy of `real-s/v2`, live corpus `09c9d8a08dd40d89`): `--index` said "0 dossiers written anew", "13210 search key files (278.0 MB)", "13278 files written, 366 already on disk"; the manifest went from 366 to 434 names (68 added, none removed or changed); the review found 0 dossiers differing and no `drops.txt`; `--go-on` finished. A second `--index` wrote 0 files, said "unchanged", and all 23,915 files under `s/v2` were identical by md5.

**Runs.** `tsc` and `svelte-check`: 0 errors. Strict, Chromium and phone: K's 16 affected specs (front page, strip, pickers, three import specs, page specs, four smoke specs, `r77k-narrow`), 180 passed; the five other specs that open Compare or a 404 (`r61w-pages`, `r62w-pages`, `r72f-pages`, `r63v-visitor`, `r63c-fallbacks`), 30 passed. The whole unit suite once, alone, on the final tree: 4,001 passed, 8 skipped, 0 failed.

## About pages

Checked against `search-files.ts` and `dossiers.ts`, every figure pinned by `r77k-search-files`' about test (2,000, 200, 12,000, the hundred, 4,096, 16, sixty-four and the `narrow` sentence). `/about/how`: the search's files (beginnings of one, two or three letters and longer past 200 species, holding "what the order reads of it … and nothing else"), the photograph counts "4,096 to a file" and the entries "from files of 16 species each", "the server never reads or holds the whole index", the older-corpus sentences, "from the reference's own files" in the privacy lists, and the `narrow` cases including the 12,000 and 2,000 caps. `/about/formats`: `X-Search-Narrow: 1`, `narrow?: true`, and in `#corpus-files` every search file's shape; this round's last change there is `{ families, regions }` for `{ families, places }`.

## Not done, with why

- **The postings, `short.json` and the index are still written**, for the Worker deployed now. A later round can drop the postings and `short.json`; `/api/index` still streams the stored index, never parsed.
- **`narrow` grows with the reference.** At 8,947 only constructed pairs of heavy words and a few punctuation forms are narrow. At 50,000 synthetic species, 523 of the 69,021 queries are, and 40 typing errors pass the near caps. The synthetic reference repeats real entries' common names and regions, so how a real one of that size fares is not measured; the owner should see this before the reference grows.
- **A refresh still rewrites the show blocks** of every species whose entry changes, and the photograph-count blocks: 6.8 MB for one species at 8,947, most of it the other products, not the search's.
- Cloudflare's own figures need the owner's account (the memory test in DEPLOY.md).
