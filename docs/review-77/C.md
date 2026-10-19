# Round 77, agent C: the CPU of a species page the cache does not hold

Branch `r77` in `/tmp/claude-0/rev77/C`, on `r77base` (`3aad821`). Commits by C. Corpus copies: `/tmp/claude-0/rev77/C-s` (round 76's products, untouched) and `/tmp/claude-0/rev77/C-s2` (the same after this round's `--index`).

## Done

### Where the CPU went (before)

Measured through the built Worker in node (`scripts/dev/scale/page-cpu.mjs`: Kit's `Server` over a bucket on disk) and in workerd (`page-cpu-workerd.mjs`: `wrangler dev`, a local R2 holding the whole corpus, each request profiled by V8 through the inspector and sorted by `page-cpu-agg.mjs`). A crawl is 250 different real species in one isolate; a cold page is a fresh isolate's first.

- **A warm isolate (the crawler case), workerd, mean 27 ms a page:** the route load and the library 5.2 ms, Kit's own work 3.6, devalue (the page data) 2.9, native 2.7, the adapter and dev middleware 2.2, GC 2.0, the render 1.8, Kit's SHA-256 of the inline script for the CSP 1.3, JSON.parse of products 1.2, Kit's djb2 etag over the whole page 0.9, valibot 0.6.
- **What grows with the page:** devalue, the SHA-256, the etag, the escaping and GC scale with what the page carries (median data 24 KB, largest 279 KB). The two maps were in it as markup (12.6 KB on average, 125 KB at most), beside the open records they are drawn from (7.4 KB, 75 KB at most; six fields a record, the map reads two): each map was in the HTML twice.
- **The heap is the larger risk.** Every product read stays in the isolate (bound: 24 MB of text). Parsed, a name file holds 3.2 times its text in node's heap, a row file 2.0. Over the crawl node held 58 MB after collection, and workerd's heap in use reached 126.5 MB with 166 MB taken: Cloudflare allows 128.
- **A cold isolate's first page, workerd, 151 ms median:** every stage costs 5 to 15 times its warm cost (code running for the first time), and that is most of it. The part that depends on the data: JSON.parse of the name files (11.2 ms in workerd, 8.8 ms in node: up to eight files of 113 KB, two thirds of each older names the page never reads), devalue 10.5, SHA-256 8.6, the etag 5.7, GC 9.1.

### What the code now does

1. **Card files and files of names** (`src/lib/dossier/lookups.ts`, `products.ts`, `manifest.ts`; `src/lib/server/lookup.ts`). Round 76's `names/<h>.json` is split in two products:
   - `cards/<h>.json` (`buildCardFiles`, `CardFile`): each page's address to its key, and `#<key>` to the species' card, exactly the round 76 card. `cardFilesFor` = the power of two at or above species/64, at least 64: 256 files at 8,947, 3.43 MB, median 13.3 KB, largest 19.7 KB.
   - `older/<h>.json` (`buildOlderFiles`, `NameRecord` now `{ n, o }`): accepted names in lower case and older names, as before. `olderFilesFor` keeps round 76's count: 128 files, 10.9 MB, median 85 KB, largest 92.5 KB. Read only for an address that is no page's (the redirect, the shared-name 404, the GBIF ask) and for `?was=`.
   - `filesLookup` reads `slug` and `species` (and `elsewhere`, from the card) from the cards, `accepted` and `older` from the names. A species page reads its address's card file, its own card's, and one per near species, about 14 KB each, and never `older/` (tested). The `Lookup` interface and every caller are unchanged, so round 76's proof runs as it was.
2. **The page carries what it shows** (`src/routes/species/[slug]/+page.server.ts`, `+page.svelte`, `src/lib/ui/Provenance.svelte`):
   - `d.occurrences.open` and `d.occurrences.datasets` are taken out of the page's dossier. The type the load returns has no such fields, so svelte-check proves no part of the page reads them. It found the one reader: Provenance's "Records came from N datasets", which now gets the count (`datasets`).
   - `points`, each open record's latitude and longitude in order, is all the regional map reads of the records.
   - `worldSvg` and `regionSvg` are no longer data. The page draws both from `d.distribution.boxes`, `d.centroid` and `points` with the same functions (`$lib/map/still`), on the server and in the browser after a client-side visit.
3. **The parsed products held** (`src/lib/server/dossiers.ts`): 12 MB of text (was 24) and 1,024 files (was 480; the card files are small). A crawl's working set fits: cards 3.4 MB, genus rows 3.6 MB, the genera, catalogues and strip.
4. **Smaller things the profile showed:** `hasLookups` is kept per manifest (every page asked it several times, each listing every file); the genera's words for `englishNames` are kept per genera read (every page folded 1,321 genera); the genera file is weighed by its text, not written out again (8.6 ms of a cold page in workerd, now 0.4); the fixture's four dossiers are parsed when the fixture corpus is first read, not as the module loads in every live isolate.

**Either order of deploy and upload stays safe.** A manifest of round 76's layout (`names/`, no `cards/`) fails this round's `hasLookups`, so this Worker reads that corpus through its index, as any corpus before round 76 (tested: same page either way). Round 76's Worker meeting this round's manifest finds no `names/` files, so it too reads through the index. Nothing reads a file of the other layout. In between, a fresh isolate reads the whole index as it did before round 76 (0.5 s, 43 MB in node at 8,947): deploy, then upload soon after.

### Tests

- `tests/unit/r77c-page-cpu.test.ts`, all four fail on `r77base`:
  - a species page reads `cards/` files and no `older/`, `names/` or index file, and an older name's address reads `older/` (base: `cardFilesFor is not a function`);
  - a manifest of round 76's layout is read through the index and gives the same page (base reads it through `names/`: `fromFiles` true);
  - the page has `points` and `datasets` and no `worldSvg`, `regionSvg`, `open` or `datasets` list (base: it has `worldSvg`);
  - 30 products of 1 MB leave at most 12 MB held (base: no such hook; its bound was 24 MB).
- `tests/e2e/r77c-maps.spec.ts` (`@phone`): the two maps as the server sent them (scripts off) equal the hydrated page's, after a client-side visit to Copiapoa humilis and after going back; the region map has its 52 points; the provenance line counts 2 datasets; no console error. It passes on base too: it guards the move.
- Changed: `tests/unit/r76w-lookups.test.ts` counts `cards/` and `older/` files where it counted `names/`, and its 503 case deletes the card files, the files a page now cannot do without. Its intent is kept: every key and address the same through the files and the index.

### Runs

- `npx tsc --noEmit -p .` and `npx svelte-check --threshold error`: 0 errors.
- The whole unit suite once: 3,994 passed, 8 skipped.
- The 33 affected specs (every spec that opens a species page or an about page, and the new one), strict, Chromium and phone: 335 passed, none flaky (12.5 min).
- `check-bundle` passes.

## Needs

- **For K, the round's corpus plan:**
  - The review line gains: "The manifest names 622 files (366 before): `names/` (128 files) is gone, and in its place `cards/` (256 files, 3.4 MB, largest 20 KB) and `older/` (128 files, 10.9 MB, largest 93 KB). Every other product is the same by hash, and no dossier is written anew by this."
  - The `--index` line on the dry run of this copy: "384 files written, 238 already on disk under their hash, 16 of older corpora deleted".
  - A second run: "0 dossiers written anew", "0 files written, 622 already on disk", manifest "unchanged", and all 11,021 files under `s/v2` the same by md5. K's own files change these totals; the merge adds them.
- **Merge, `src/lib/dossier/manifest.ts` and `lookups.ts`:** `hasLookups` (now kept per manifest) requires `lookupFileNames`, which lists `cards/` and `older/` in place of `names/`. If K adds a check for its key files, both must hold for the files path.
- **Merge, `src/lib/server/dossiers.ts`:** K's search key files will be held by `product` too, under the new 12 MB. If a search's working set is larger, K should say how much, and the bound should be set for both together, not raised back to 24.
- **DEPLOY.md, round 77's section (whoever writes it):** "Deploy first, then the corpus step. Either order is safe: a Worker of this round meeting round 76's corpus, or round 76's Worker meeting this round's, finds no lookup files of its own layout and reads the corpus through its index, as before round 76, until the other half lands."
- `docs/SCALE-STUDY.md` 2.4, item 1 ("Name shards") could gain: "Round 77 split them: `cards/` for a page, `older/` for the rest."

## For the owner's PC

No extra steps: the round's `--index` writes the new files. After the deploy and the upload, the cold-start measure in DEPLOY.md section 3 (`wrangler tail`, then `node scripts/tail-summary.mjs tail.json`) gives Cloudflare's own CPU for the same pages. To measure locally on the PC as here, from the project folder after `npm run build`:

```
node --single-threaded --expose-gc scripts/dev/scale/page-cpu.mjs . <folder holding s\v2> <list of paths, one a line>
node scripts/dev/scale/page-cpu-workerd.mjs . <folder holding s\v2> <list of paths> out.jsonl
python scripts/dev/scale/page-cpu-stats.py out.jsonl
```

## Measured

Before: `r77base`'s build over round 76's products. After: this branch's build over the same corpus re-indexed. Median / 90th percentile / maximum. Workerd CPU is the profile's time not idle (profiling adds to it); node CPU is this thread's CPU less the disk reads.

**A species page in a warm isolate, 250 different real species in one isolate (`results/r77c/m-before`, `m-after`):**

| | before | after |
|---|---|---|
| node CPU, ms | 11.0 / 28.4 / 237.7 | 7.8 / 19.3 / 194.5 |
| node heap taken by the request, MB | 3.8 / 9.3 / 21.4 | 2.8 / 6.3 / 9.3 |
| node heap held after it (collected), MB | 57.8 / 58.8 / 59.3 | 21.5 / 23.0 / 23.5 |
| workerd CPU, ms | 22.9 / 42.1 / 176.4 | 17.1 / 31.3 / 102.7 |
| workerd heap in use, MB | 78.8 / 106.5 / 126.5 | 46.6 / 64.7 / 79.5 |
| workerd heap taken, MB | 124.2 / 157.3 / 165.6 | 93.8 / 109.0 / 115.3 |
| HTML, KB | 117 / 251 / 479 | 114 / 184 / 289 |
| page data, KB | 23.8 / 125.5 / 272.2 | 19.7 / 57.5 / 85.2 |

**A cold isolate's first species page, before and after taken in turn for each species (`results/r77c/cold-pairs`):**

| | before | after |
|---|---|---|
| node, 50 species, CPU ms | 185.1 / 233.2 / 268.8 | 165.4 / 226.4 / 239.9 |
| node heap taken / held, MB (median) | 14.2 / 10.1 | 9.7 / 6.5 |
| workerd, 20 species, CPU ms | 151.0 / 188.2 / 201.9 | 127.4 / 173.3 / 200.3 |
| workerd heap in use, MB | 10.3 / 11.9 / 14.9 | 9.1 / 10.7 / 11.2 |

Paired, the median change is minus 9 ms in node (36 of 50 lower) and minus 15 ms in workerd (14 of 20 lower). In workerd, cold, JSON.parse of products went from 11.2 to 5.0 ms, devalue from 10.5 to 8.4, GC from 9.1 to 6.9. Valibot rose from 2.0 to 5.5 ms: the fixture parse that used to warm it now never runs. That parse ran as the hooks loaded, which the adapter starts before the first request, so it was a cost of each new isolate's start, not of its first page.

**Where a warm page's time now goes (workerd, mean ms, before → after):** route load and library 5.2 → 3.0; Kit's own work 3.6 → 2.6; devalue 2.9 → 1.7; GC 2.0 → 0.9; SHA-256 1.3 → 0.6; etag 0.9 → 0.6; render 1.8 → 1.3; JSON.parse of products 1.2 → 0.9; native 2.7 → 2.7. Node JSON.parse a cold page: names 8.8 ms → cards 1.0 ms; rows 1.9 → 0.7.

**The front page and a catalogue page** (unchanged by this round but for the cold load; 62 catalogue pages, `/?by=genus&open=<genus>` for 60 genera, `/?by=family` and `/?by=origin`, in one isolate; cold: 10 fresh isolates each):

| | before | after |
|---|---|---|
| catalogue, warm, node CPU ms | 20.8 / 29.2 / 49.7 | 19.0 / 28.6 / 46.9 |
| catalogue, warm, workerd CPU ms | 20.6 / 49.7 / 71.7 | 15.7 / 24.9 / 45.5 |
| catalogue, warm, workerd heap in use MB | 18.4 / 26.8 / 33.1 | 18.2 / 28.2 / 31.8 |
| catalogue, cold, node CPU ms | 139.1 / 179.2 / 180.4 | 137.1 / 142.5 / 146.0 |
| front page, cold, node CPU ms | 135.1 / 159.1 / 172.9 | 139.4 / 146.2 / 155.2 |
| front page and catalogue, cold, node heap held MB | 5.6 to 5.8 | 5.6 to 5.8 |

Their HTML and data are the same. The machine was shared (load 4 to 5 on two cores): differences under about 10% are noise.

**Round 76's proof on the new products** (`scripts/dev/scale/r76-proof.ts` unchanged, output `results/r77c-proof.txt`, 244 s), on `C-s2`:
- 251,023 keys and 85,360 addresses: 0 different;
- 8,951 species, 8,947 `namedElsewhere`, 1,564 rows, 6,244 opened rows, 12 catalogues, the strip and the sitemap: 0 different;
- 8,947 dossiers' photographs: 0 different;
- with round 73's merges: all 0 different again.
- It made 120,526 bucket reads (307 in round 76), since the proof's walk over every key no longer fits in what an isolate holds. Never the index.

**Every page shows the same** (`scripts/dev/scale/r77c-page-proof.mjs`, `results/r77c-page-proof.txt`): all 8,947 species pages, the front page twice, `/?by=family`, `/?by=origin` and 60 opened genus rows, through both builds, each request from its own address: 9,011 answered 200 in both.
- The HTML without Kit's hydration script is the same byte for byte on 9,011.
- The page data is the same on 9,011, but for exactly `open` (now `points`, the same places in order), `datasets` (now its count) and the two maps.
- Drawn from the new data by the page's own functions, both maps equal the old strings on all 8,947.
- (A first run from one address met the render rate limit on one page; the proof now gives each request its own address and fails on anything but a 200.)

**The corpus step, dry run** (`--index` on `C-s2`, 74 s): as in Needs; a second run changed nothing (md5 of all 11,021 files).

## Not done, with why

- **Kit's SHA-256 and etag** (cold: 7.4 and 5.5 ms; warm: 0.6 and 0.6). Kit hashes the inline script for the CSP's `hash` mode, and the whole page for its etag, in JavaScript. Trimming the data cut both. Removing the SHA-256 needs the CSP in nonce mode for rendered pages. The Worker's page cache hands one rendering to every reader for a minute, so a nonce would be shared: that is the owner's security decision, not a CPU fix. The etag is Kit's, on every page not streamed.
- **The rest of a cold page** (about 110 of 127 ms) is code running for the first time in a new isolate: Kit, the render, devalue, the route. Only fewer requests reaching new isolates, or less code, would cut it.
- **Finer shards.** `older/` (85 KB) is still read by every redirect and 404, and `rows/genus` (57 KB median) by every page. Each finer split adds manifest entries, and every new isolate checks each with a regular expression (`isManifest`: 2.6 ms cold for 622). I left both.
- **The cache counts characters, not heap.** The bound assumes two to three times the text, as measured here in node; workerd compresses pointers, so it holds less.
- **Cloudflare's own figures** need the owner's account (DEPLOY.md section 3). The workerd figures include `wrangler dev`'s own middleware (about 1 ms warm, 8 ms cold), which production does not run.
