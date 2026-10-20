# Round 79, agent Z: the index, products, search and Worker at the full list's size

Branch `r79` in `/tmp/claude-0/rev79/Z/`, four commits on `r79base` (f8eaad7, 6d8f612, bfba2a5, and the measures). Scratch: `/tmp/claude-0/rev79/Z-s/` (3.0 GB: the full-size corpus in `full/`, the measures in `measure/`, a worktree `merged/` of this branch with K's merged, used for the measures). The branches `k79` and `r79zk` in my clone are scratch, not for the merge.

In short: at 48,368 species the reference builds, indexes and serves. Three things broke or slowed at this size, and each is fixed with a test: the nearest-climates step (30 minutes, now under one), `--index`'s memory (it held every dossier at once), and the bucket's prune (rclone took half an hour to an hour a run). The Worker needed no change.

## Done

**The full-size corpus** (dev only, `scripts/dev/scale/`):

- `r79-full-corpus.ts` makes one dossier for each of the list's 48,368 lines:
  - the 8,932 already in the reference are round seventy-seven's real dossiers, rekeyed to version 3 and linked, not copied;
  - the other 39,436 are copied from a real dossier of the same genus (else of the family). Each copy gets the line's name, author, family, plant_name_id and GBIF key, Kew's synonyms and areas, photographs of its own (no identity shared with another page), common names reworded, its climate shifted by up to half a degree, and its substance stamp taken again.
- `r79-keyless.ts` rewrites the 2,326 pages without a GBIF key in the shape K's builder writes (from K's fixture `k457911.json`): no key, no records, climate pending, every GBIF row skipped with K's reason. That is 4.8% of the pages, as K asked. All of them parse with K's schema.
- `r79-reads.mjs` lists the bucket files the built Worker reads for each address, so the local R2 holds only what the measured requests read.
- `workerd-heap.mjs` and `page-cpu-workerd.mjs` take `V` (the version, default 3) and `ONLY` (a file of bucket keys).
- Every measure was taken on this branch with K's merged (no conflict; `build-dossiers.ts` merged on its own).

**1. Nearest climates** (`src/lib/core/near.ts`, `nearestByClimate`, commit f8eaad7):

- Each species' 36 figures, the rain's logarithm among them, are worked out once, not once a pair.
- A pair is dropped once its first four or eight months already reach both species' sixth nearest so far.
- The lists are the same as before to the bit, ties included.
- At full size: 1,768 s before, 41 s now. On the real corpus: 1.2 s of CPU against 37.4 s.
- Test `tests/unit/r79z-near.test.ts`:
  - "the same lists as pair by pair, ties included" passes on the base as well; it guards the rewrite;
  - "each rain logarithm once a species" FAILED on the base (477,600 `log1p` calls against at most 2,400).

**2. `--index` memory** (`scripts/build-dossiers.ts`, commit 6d8f612):

- `markSharedPhotos` used to hold every dossier parsed; now it holds what the rule reads. That is each page's names, then the ids of the photographs it shows. It reads a file again only to write the marks that change.
- `scanDossiers` used to keep each page's photographs until the reference's names were known; it now keeps the file's path and reads the file again.
- The marks and the index are the same as before.
- Test `tests/unit/r79z-index-memory.test.ts`: 400 dossiers of 250 KB (100 MB) indexed in a 128 MB heap, and the index must be the same bytes as one built in a 2 GB heap. FAILED on the base: out of memory.

**3. The bucket's prune** (`scripts/corpus-step.mjs`, `prune()`, commit bfba2a5):

- **The fault:** `rclone delete --exclude-from keep.txt` tries every line of keep.txt on every file. Measured here with rclone 1.68 on local files:
  - 30,000 files against 15,000 lines: 97 s;
  - 60,000 files against 30,000 lines: 284 s;
  - the same names given as a list: 0.8 s.
- **The size:** a full corpus is about 67,600 files in `p/`, and two corpora in the bucket after a refresh is about 135,000. That is about half an hour to an hour a run, and the prune runs twice (the dry run, then the delete).
- **What it does now:**
  - it lists the bucket with each file's upload time: `rclone lsf … --files-only --format tp --separator ; --time-format RFC3339 --use-server-modtime`;
  - it writes `prune.txt`: the files no manifest names, uploaded more than a day ago;
  - it deletes with `--files-from-raw prune.txt`. rclone refuses that flag with any other filter, so `--min-age 24h` is now read from the listing;
  - a file whose time is not known is never deleted.
- **Other changes:** `prune.txt` is added to `.gitignore`, and the expected arguments in `tests/unit/r72d-corpus-step.test.ts` (one line) are updated.
- Test `tests/unit/r79z-prune.test.ts`:
  - the listing's arguments; `prune.txt` holds exactly the old, unnamed file; the delete is given the list, never `--exclude-from`;
  - two full-size corpora (135,300 files, 67,650 kept) are listed within the time limit.
  - Both FAILED on the base: the run stopped (exit `failed`), since no `prune.txt` was written.

**DEPLOY.md:**

- New section "Round seventy-nine: the index, the upload and the Worker at the full list's size", before round seventy-seven's section in section 5.
- One sentence after section 5's manual prune lines, saying they are slow at this size.

**Checks:**

- `tsc --noEmit` and `svelte-check`: 0 errors.
- The whole unit suite once: 441 files and 4,163 tests passed, 1 file and 8 tests skipped (476 s).

**Lines for the merge** in `scripts/build-dossiers.ts`, all inside two functions:

- `scanDossiers`: line 368 (`forPhotos` becomes paths), line 381 (the push), line 394 (the read again).
- `markSharedPhotos`: lines 1205 to 1250 (the whole body).
- In `scripts/corpus-step.mjs`, `prune()`: lines 351 to 356 (the listing) and 366 to 374 (`prune.txt` and the delete's arguments).

**About pages:** nothing in `/about/how` or `/about/formats` becomes untrue. The near lists, the index and the products are the same bytes as before; only the prune's commands changed.

## Needs

- **F or D (whoever owns `corpus-step.mjs`; it is listed under neither by name):** keep my `prune()` change at the lines above. Any later edit to the prune must not go back to `--exclude-from`, and must not combine `--files-from-raw` with another filter: rclone 1.68 refuses that ("--files-from-raw overrides all other filters"). The prune now needs rclone 1.65 or later; an older one stops at the listing, with nothing deleted.
- **D (full-build plan):** nothing to change. The plan's `--index` runs with `--max-old-space-size=8192`, and the step peaked at 1.8 GB of heap. The first full upload is about 4.4 GB in 117,000 objects. Purge `s/v2/` from the bucket as DEPLOY says, so that two corpora around a refresh (about 7 GB) stay inside R2's free 10 GB.
- **K:** nothing. The 2,326 pages without a key index, search, list and serve at full size with K's branch. The index carries no `gbif` for them, `/api/dossier/k517873` answers 200, and the search finds them by name.
- **SCALE-STUDY.md (whoever edits it):** its estimate for the search key files at 50,000 (about 1.47 GB) is low. Measured at 48,368: 63,791 files, 2.1 GB.

## For the owner's PC

Nothing extra to type: the plan's `--index`, upload, live check and `--prune` steps are the commands. Two checks:

```
rclone version
```

This must say v1.65 or later before the first prune; if not, run `winget upgrade Rclone.Rclone`. After the deploy, the cold-start check of DEPLOY.md section 3 ("A cold start's CPU and memory"), with its limits: a cold species page under 300 ms and a first search under 1,000 ms. What good output looks like and how long each step takes is in DEPLOY.md, "Round seventy-nine: the index, the upload and the Worker at the full list's size".

## Measured

The review machine has two shared cores, loaded by five other agents; its times are an upper bound. Raw figures are in `scripts/dev/scale/results/r79-index.txt` and `r79-workerd.txt`.

**The corpus:**

- 48,368 dossiers, 1,899.5 MB: median 37 KB, 99th percentile 112 KB, largest 166 KB.
- The mean (40 KB) is above the real corpus's 32 KB, because the copies take real, well-recorded pages as templates. So sizes here are on the high side.
- Making it took 281 s and 2 GB.

**`--index`** (heap allowed: 3 GB):

| What | Measured |
|---|---|
| Wall time | 1,046 s (17.4 min) |
| CPU | 512 s user, 33 s system |
| Node's peak | 1,758 MB of heap, 2,502 MB RSS, at the products step |
| Before the products step | at most 900 MB of heap |
| Real corpus (8,947) on the same machine | 257 s; 1,251 MB RSS, 420 MB of heap |

The steps, at the time each finished:

| Step | Finished at |
|---|---|
| Page ids | 20 s |
| Shared photographs | 86 s |
| Scan and nearest climates (41 s, 38,601 species) | 321 s |
| Index written | 330 s |
| Photograph judgement (12,571 Commons files) | 394 s |
| Products | 1,046 s |

**The products:** corpus `d8c473d10ee442d2`, 256 buckets, 512 posting files, 3,859 named files, 63,791 search key files. 109 names share a file with another, so `p/` holds 67,541 files.

| Kind | Files | MB |
|---|---|---|
| Search key files (median 7 KB, 99th percentile 519 KB, largest 983 KB; none over 1 MB) | 63,791 | 2,191 |
| Sheets | 256 | 74.2 |
| Older names | 512 | 52.4 |
| `index.json` | 1 | 37.1 |
| Postings | 512 | 30.9 |
| Entries | 256 | 29.7 |
| Rows (genus 22.3, family 22.1, origin 22.1) | 768 | 66.5 |
| Cards | 1,024 | 21.0 |
| Catalogues | 9 | 4.0 |
| Search directories | 516 | 3.9 |
| Sitemap | 2 | 1.9 |
| `short.json` | 1 | 0.18 |
| `genera.json` | 1 | 0.10 |
| `featured.json` | 1 | 0.01 |

**The sitemap:** 54,901 addresses in two files, 40,000 and 14,901 (the cap is 40,000 a file, under the protocol's 50,000). `/sitemap-1.xml` is 4.16 MB of XML, `/sitemap-2.xml` 1.56 MB, and `/sitemap-3.xml` answers 404.

**The upload:**

- What it carries: 48,368 dossiers, 1,321 genus records (0.7 MB), `index.json`, the manifest and the 67,541 files of `p/`. That is 117,232 objects and about 4.45 GB.
- Estimate, not measured on a real line: about 10 minutes for the objects (32 transfers at about 150 ms each), and 12 minutes at 50 Mbit/s or 30 minutes at 20 Mbit/s for the bytes. So half an hour to an hour.

**The Worker:** workerd through `wrangler dev`, the local R2 holding what the requests read, the build of this branch with K's. "Cold" is a fresh copy for each request; CPU is from the inspector's profile.

| Request, cold | CPU (ms) | Heap in use after (MB) |
|---|---|---|
| 8 random species pages (median 165) | 88 to 229 | 8.8 to 11.3 |
| Front page | 158 | 11.4 |
| `/api/dossier/k2735933` (by Kew id) | 79 | |
| `/api/dossier/7284333`, `/api/dossier/3921611` (by GBIF key; 302 to the page id) | 39 and 47 | |
| `/api/dossier/k517873` (no GBIF key) | 38 | |
| "cactus" | 199 | |
| "rose" (the worst) | 381 | 19.5 |
| "echeveria" | 85 | |
| "aloe" | 209 | |
| "string of pearls" (a common name) | 81 | |
| "hens and chicks" | 96 | |
| "senecio rowleyanus" (an older name: one hit) | 140 | |
| "a" (one letter) | 74 | |
| "ec" | 96 | |
| "aloe verra" (a typing error) | 277 | |
| "red rose" | 302 | |
| "maple" | 124 | |
| "pinguicula hirtiflora" (a page without a key) | 84 | |

- **The narrow answer:** "a e" answers `{"hits":[],"narrow":true}` in 67 ms of wall time. "red rose" is not narrow: it gives 49 KB of hits.
- **One fresh copy for each request:** at most 19.5 MB in use after any one ("rose"); `/sitemap-1.xml` 18.1 MB in use and 32.8 MB allocated.
- **One copy answering 56 requests in a row** (24 species pages, then the front page and catalogue views, the lookups, the sitemaps and 14 searches):
  - at most 66.4 MB in use and 108 MB allocated, both measured after the sitemaps and "rose";
  - CPU: a species page first asked had a median of 32 ms (largest 127); searches 6 to 182 ms.
  - Round seventy-seven measured up to 79.5 MB in use for a crawl at 8,947 species.
- **Against the 128 MB limit:**
  - the products cache is bounded at 12 MB of text, and key files are never held, so the long run stays bounded;
  - workerd does not collect garbage on request, so "in use" includes garbage;
  - Cloudflare's own verdict comes from the memory test in DEPLOY.md.

**Disk:** the full corpus with its products is 4.4 GB. I deleted the 59,800 key files the measured requests do not read, so the scratch stays at 3.0 GB.

## Not done, with why

- **The upload itself and Cloudflare's verdict:** there is no R2 account here, so the upload time is an estimate. Cold CPU on Cloudflare's machines will differ; DEPLOY's cold-start check reads it after the deploy.
- **The base's peak memory at full size:** not run, because the base holds the 1.9 GB of dossiers parsed and would take most of the machine's shared 8 GB. The unit test shows the difference at a size this machine can hold.
- **The products step's 1.8 GB of heap:** not reduced. It is the search's key files being made, inside the 8 GB the command allows. Making it smaller would mean rewriting `buildSearchFiles`, which this round does not need.
- **Corpus contents the copies cannot have:** the copies' records, centroids and climates are their templates', shifted a little. So the measures test the products' size and shape, and the Worker on them, not the occurrence reading or the climate grid, which are on the owner's PC only.
- **No browser run:** nothing on a page changed.
