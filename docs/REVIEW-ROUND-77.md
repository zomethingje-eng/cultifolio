# Round seventy-seven: the search from key files, an uncached species page's CPU, and small fixes

Round 77 has three parts, one agent each, and a merge:

- **K** carries out round 77 of `SCALE-STUDY.md`'s plan: the search from key files.
- **C** cuts the CPU and memory of a species page the Worker's cache does not hold.
- **F** makes three small fixes.
- **M** merges them, in that order, and proves the merged code.

Their reports are `review-77/K.md`, `C.md` and `F.md`. `FOLD_RULES` stays 8, the device database stays at version 4 and the dossier format at version 2. This round has a corpus step, and asks nothing of any source.

## 1. What changed for the reader

- **The search answers as before, from a few small files** (K). Every caller goes through it: the front page and catalogue, Compare, both species pickers, the import check, and the suggestions on a species address that names nothing. The answers are the whole index's, rank for rank, but in one case.
- **That case: a query too common to list** (K; the scaling study's decision 6, which the owner approved in principle). The search lists nothing and says "Too many species match … to list them all. Type another letter or another word to narrow it." when:
  - every word of a query of two or more words begins the words of more than 2,000 species ("cape provinces", "a e");
  - or a word with a typing error does;
  - or a typing error would have the search read more than 12,000 species or rank more than 2,000.
  
  On the real corpus 100 of the proof's 69,021 queries do so, all constructed pairs of heavy words or punctuation forms; no name, genus, family, region, common name, older name or typing error does. The front page, Compare, the add form's picker and the import check ("not checked") each say it.
- **A species page looks and reads the same** (C). Its two maps are now drawn by the page from the points it carries, on the server and after a client-side visit, and equal the old maps on every page.
- **Entering the example collection is safe against a Cancel and a reload** (F). The button writes only a one-use token, and the page its address opens sets the flag only when the token matches the one written in that tab. A Cancel, a reload or a closed tab leaves nothing to undo, and the button's words come back on `navigateerror`, the first press or key after "Leave site?", or a timer.

## 2. What changed for the site

- **The Worker holds no index under a manifest that names the search's files** (K). `indexOf` and `entriesIn`'s fallback refuse with a 503, said in the log as a fault.
  - The search reads `search/top.json` and sixty-four `search/<n>.json` (the directories), `search/genera.json`, `search/tables.json` (families and regions by number), `search/blocks.json` (photograph counts in blocks of 4,096, entries in blocks of 16), and key files named by hash under `p/`.
  - A key file holds only what the ranking reads, so a photograph or thumbnail change rewrites none. Key files are read as text, parsed as they come and never cached.
  - Under a manifest without them, the search reads the postings and the index as before, and the build still writes those.
- **A species page reads small card files** (C). Round 76's `names/` (128 files of about 113 KB) is split:
  - `cards/` (256 files, median 13 KB): each page's address to its key, and each species' card;
  - `older/` (128 files, median 85 KB): accepted and older names, read only for an address that is no page's and for `?was=`.
- **The page carries its map points, not the maps drawn** (C): `points` and the count of datasets, never the open records, the dataset list, `worldSvg` or `regionSvg`. svelte-check proves no part of the page reads what was taken out.
- **An isolate holds at most 12 MB of parsed products, and 1,024 files** (C; it was 24 MB and 480). K measured one search's working set, at most 98 files and 1.2 MB of text at 8,947 species and 127 files and 1.7 MB at 50,000, so one bound serves both.
- **`hasLookups` and `hasSearchFiles` are kept per manifest** (C, and M for the second): every page asked the first several times, and each asking listed every file.
- **`scripts/tail-summary.mjs` reads Windows PowerShell's files** (F): UTF-16 either way round, with or without a mark, UTF-8, wrangler's own output and NDJSON. It sums them up by kind of page, names crawlers, lists the slowest five and says what to do next.
- **`--fill commons-kind` no longer asks the same file on every run** (F): each file read records `kindRule`, the version of the description rules, and is asked again only when the rules are newer.
- **The corpus step's prune** fetches the live manifest's search directories before it makes `keep.txt`, so the key files they name are kept (K).

## 3. The merge

- **Textual conflicts**, each resolved to keep both sides' intent:
  - `src/lib/server/dossiers.ts`: K's `storedText` beside C's `_productsHeld`;
  - `/about/formats#corpus-files` and `/about/how#corpus`: C's `cards/` and `older/` sentences in place of `names/`, and K's search-file sentences after them;
  - with F, `docs/DEPLOY.md`'s cold-start paragraph and the memory test's first steps, and the about pages' paragraphs next to F's (`kindRule`, `cultifolio.sampleEntering`).
- **What the textual merge missed:**
  - C's `r77c-page-cpu` built its bucket without K's `stored`. It now carries the stored files, its round-76 layout names no search files, and a new check proves an unknown address's 404 takes its suggestions from the search's files (it fails without them).
  - `/about/formats` said "a corpus whose manifest names none of these is read through its index"; round 76's manifest names most of them and is read through its index all the same. It now says "lacks any of these".
  - `/about/how` said a reference "built before the name files" is read whole; it now says before this round's two sets of name files, round 76's own included.
  - `manifest.ts`'s header named `names/`, `hasSearchFiles` was not kept as `hasLookups` now is, and the product bound's comment did not say it holds the search's parsed files too.
  - C's page proof against r77base found every page's HTML different: F's first script in `app.html`, which every page carries. Against F's branch built alone, every page is the same (below).
  - F's change to entering the example touches none of K's or C's tests.
- **Two e2e tests the merged code's first whole strict run failed**, each also failing on r77base under the same load, and each fixed in the test:
  - **r76p strip 4** timed out twice. It makes sixteen page loads in four contexts: 10 to 11 s alone on r77base and on the merge alike (timed step by step), and past its default 30 s beside three other workers on two cores on both (2 runs in 3 on r77base, 3 in 3 merged). It has 90 s now.
  - **r75h progress 1** was flaky: it counted one window of 1 s for a whole restore of 6 to 7 s. Under the 20x throttle the check's own look at the page waits behind the merge's longer tasks in the renderer, so one window can stretch to the whole restore (1 restore in 4 on r77base, alone; the restore's time is the same on both). It now takes the best of up to three restores, each in a fresh context and each waited for to its end.

## 4. The proofs, on the merged code

- **The search** (`scripts/dev/scale/r77-proof.ts`, `results/r77m-proof.txt`), on a copy of round 72's corpus as it was (`/home/claude/r73data/s/v2`) after the merged `--index` (corpus `a98be27f26a097fe`, 8,947 species):
  - 69,021 queries: 68,921 the same (hits in order, every field, `relaxed`, `near`), 100 `narrow`, exactly K's list, 0 other differences;
  - through the files, the index was read 0 times, and the postings and `short.json` 0 times;
  - every section equals K's committed result line for line.
- **Round 76's lookups** (`r76-proof.ts`, unchanged, `results/r77m-r76-proof.txt`): 251,023 keys, 85,360 addresses, every row, catalogue, the strip, the sitemap and 8,947 dossiers' photographs, with and without round 73's merges: 29 comparisons, 0 different, the index never read by the lookups.
- **Every page shows the same** (C's `r77c-page-proof.mjs`, `results/r77m-page-proof.txt`): F's branch built alone over round 76's products against the merged build over the same corpus re-indexed. 9,011 pages (every species page, the front page twice, two groupings and 60 opened genus rows) answered 200 in both; the HTML without the hydration script is the same on all 9,011; the page data is the same on all but for exactly `open`, `datasets` and the maps; both maps drawn from the new data equal the old strings on all 8,947 species.
- **The real corpus step, dry run** (`scripts/corpus-step.mjs`, rclone and the live check said but not run), on a fresh copy of round 76's products (`real-s`, corpus `09c9d8a08dd40d89`):
  - `--index`: "0 dossiers written anew", "13210 search key files (278.0 MB)", "13662 files written, 238 already on disk under their hash, 16 of older corpora deleted" (307 MB of new files);
  - the manifest named 690 files where it named 366: 452 added (256 `cards/`, 128 `older/`, the search's 68), the 128 `names/` gone, 0 changed;
  - the review said 0 dossiers differ from the backup, and no `drops.txt`; `--go-on` finished;
  - a second `--index` wrote 0 files and said "unchanged", and all 24,299 files under `s/v2` were the same by md5.

## 5. The measures, before and after

In node, the machine otherwise idle (`results/r77m-cold.txt` and `results/r77m/`). Before is r77base over round 76's products; after is the merged code over the same corpus re-indexed. At 50,000, each code's own build of K's made-up index, with the crawl's 250 dossiers. A cold request is a fresh process, median of three.

| A cold request | 8,947 before | 8,947 after | 50,000 before | 50,000 after |
|---|---|---|---|---|
| species page | 86 ms, 5.5 MB | 67 ms, 3.2 MB | 99 ms, 6.7 MB | 80 ms, 3.7 MB |
| front page | 65 ms, 2.9 MB | 61 ms, 2.9 MB | 73 ms, 3.1 MB | 76 ms, 3.3 MB |
| dossier API | 79 ms, 3.0 MB | 60 ms, 2.7 MB | 75 ms, 3.3 MB | 81 ms, 3.1 MB |
| search "aloe" | 240 ms, 12.1 MB | 132 ms, 3.6 MB | 959 ms, 53.7 MB | 144 ms, 4.4 MB |
| search "aloe verra" | 270 ms, 12.7 MB | 179 ms, 3.8 MB | 1,151 ms, 54.6 MB | 382 ms, 5.4 MB |
| search "cape provinces" | 339 ms, 12.2 MB | 70 ms, 2.9 MB (narrow) | 1,430 ms, 54.1 MB | 71 ms, 3.3 MB |

A first search read 5.6 to 31.8 MB from the bucket before and 0.1 to 1.5 MB after. The front page and the dossier API read the same files before and after; their differences are noise.

**A crawl**: 250 different real species pages in one process, through each build's own server (CPU without forced collection; heap with it):

| A crawl's page | 8,947 before | 8,947 after | 50,000 before | 50,000 after |
|---|---|---|---|---|
| CPU, median / 90th / most, ms | 10.9 / 26.0 / 220 | 8.0 / 18.2 / 209 | 26.1 / 46.6 / 224 | 10.4 / 23.3 / 208 |
| heap taken by the page, median / most, MB | 3.8 / 21.4 | 2.9 / 9.4 | 9.4 / 20.8 | 4.0 / 11.4 |
| heap held after it, median, MB | 57.8 | 21.6 | 75.1 | 33.0 |
| HTML, median / most, KB | 120 / 491 | 118 / 297 | 119 / 488 | 117 / 295 |
| page data, median / most, KB | 24 / 279 | 20 / 87 | 24 / 278 | 20 / 87 |

The most CPU is each process's first page, a cold one. At 50,000 a page parsed 7.3 ms of name files before and 1.0 ms of card files after.

The branches' own measures stand: C's in workerd (a crawl's heap in use from at most 126.5 MB to 79.5 MB; a cold page 151 to 127 ms, median), and K's (the 200 typing errors that read most at 50,000 took at most 52 MB of heap in workerd, where a first search took 97 MB before).

## 6. Runs

- **Types:** `tsc` and `svelte-check --threshold error`, 0 errors.
- **Unit:** the whole suite once, alone: 4,030 passed, 8 skipped, 0 failed. After the two e2e fixes and the last edits, again: 4,030 passed, 8 skipped, 0 failed.
- **Strict Chromium and the Chromium phone at four workers** (`CI_STRICT=1`, `--fail-on-flaky-tests`):
  - first: 513 passed, 5 skipped, 1 failed (r76p strip 4) and 1 flaky (r75h progress 1), both load-bound and both failing on r77base under the same load (section 3);
  - the two specs, three times each at four workers, after the fixes: 24 passed;
  - the whole run again: 515 passed, 5 skipped, none failed or flaky (13.6 min).
- **The branches' own runs** stand beside these: K's 16 affected specs and five more (210 passed), C's 33 (335 passed), F's 32 (333 passed, 5 skipped), each strict on Chromium and the phone.

## 6b. The owner's first all-engines run

1,429 passed, 17 skipped; 2 failed and 2 flaky, all in WebKit, all tests rather than the app:

- **r77c maps (WebKit and the WebKit phone):** the console held six "Failed to load resource … 404" lines. They were the fixture's made-up photograph addresses on iNaturalist's real host, which a machine with the internet reaches; WebKit logs each one. The test now answers photographs with a pixel, so its console holds the page's own faults only.
- **r73p keys 1 and r75g range 1 (WebKit, flaky):** both rewrite a species page's data on its way to the browser. They kept only its first line, so a value the server streamed after it was lost, and they kept the old length and transfer headers for a new body. The client-side visit sometimes never landed. Every line is kept now, and those headers are dropped.
- **r67h disclosure 3 (WebKit, flaky):** the link's key is checked against the reference after the add form is drawn, and the answer redrew the name's line between the press and the release. The test now waits for that answer; a late answer is disclosure 4's subject.
- The four specs, twice each, strictly in Chromium and the phone: 26 passed. The unit suite passes.

## 7. The owner's steps

1. The test run (`node scripts/predeploy.mjs --tier=app`), then the commit and `npm run deploy`.
2. The corpus step soon after (DEPLOY.md, "Round seventy-seven's corpus step"):
   - `node scripts/corpus-step.mjs`;
   - a review stop at `--index`: "index: 8945 species", "0 dossiers written anew", about 13,200 search key files of about 280 MB, 0 dossiers differing from the backup, and the manifest naming 690 files or so (452 added, the 128 `names/` gone);
   - `node scripts/corpus-step.mjs --go-on`: the upload (about 13,700 new files, 307 MB, this once) and the live check.
3. The cold start's CPU with `wrangler tail`, then `node scripts/tail-summary.mjs tail.json`, in cmd or PowerShell (DEPLOY.md section 3). Round 76's `tail.json` that read as "holds no requests" can be read again now.
4. **The order:** deploy first, then the corpus step. Either order is safe: this round's Worker meeting round 76's corpus finds no card files and reads it through its index, and round 76's Worker meeting this round's manifest finds no `names/` and reads it through its index, both as before round 76, until the other half lands. In between, a fresh copy's first request reads the whole index again (about 0.5 s and 43 MB in node).
5. **Optional, later:** the 50,000-species memory test (DEPLOY.md), now with a typing error among the searches.
6. **A later round's `--fill commons-kind`** asks `File:Boswellia papyrifera.jpg` one last time and records `kindRule` in its dossier; after that the fill asks nothing until the rules change (F).

## 8. Not done

- **The postings, `short.json` and the index are still written and uploaded**, for a Worker deployed before this round. A later round can drop the postings and `short.json`; `/api/index` still streams the stored index, never parsed.
- **`narrow` grows with the reference.** At 50,000 made-up species, 523 of the 69,021 queries are narrow and 40 typing errors pass the near caps. The made-up reference repeats real entries' common names and regions, so how a real one of that size fares is not measured.
- **A refresh still rewrites the show blocks** of every species whose entry changes, and the photograph-count blocks.
- **Kit's SHA-256 of the inline script and its etag** (cold, about 7 and 5 ms of a species page): removing the first needs the CSP in nonce mode, which the shared page cache makes the owner's security decision.
- **The rest of a cold page** (about 110 of 127 ms in workerd) is code running for the first time in a new isolate.
- **The real Commons description of `File:Boswellia papyrifera.jpg`** was not recorded: Commons refused this workspace twice.
- **Firefox and WebKit** are not in this workspace; the owner's all-engines run checks them. Cloudflare's own figures need the owner's account.
