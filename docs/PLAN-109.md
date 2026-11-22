# Round 109: the photographs copied to the site's own bucket (plan and record)

The first hand-off's round 6, "Photographs served from cultifolio.com", planned against the code on 22 November 2026.
Round 109 builds the copy. Pages are unchanged until the copy is complete; round 111 switches them over and narrows the
policy (`img-src`).

## Why

A species page asks up to about 90 photographs of three outside hosts:
- iNaturalist's open-data bucket on Amazon (`inaturalist-open-data.s3.amazonaws.com`, `static.inaturalist.org`);
- Wikimedia Commons (`upload.wikimedia.org`);
- GBIF's image cache (`api.gbif.org/v1/image/cache`).

Each request tells that host the reader's address. /about/how says so, but "no tracking" then carries an exception. The
lead photograph is also what the first paint waits on, and it comes from a host the browser has not yet connected to.

## The measure (the hand-off: storage first, with R2's cost, before anything is uploaded)

Read from cultifolio.com on 22 November 2026, not from the disk (the corpus lock was held). The script is in the round's
record.

- **Photographs per page:** the live index gives each page's count of photographs: 1,976,767 on 41,190 pages.
- **Sizes a page shows:**
  - each photograph: its gallery thumbnail as stored (the medium) and the strip's small;
  - each page's lead: large and medium;
  - each index row: square and small.
- **Bytes:** a seeded sample of 150 pages, two photographs each plus each page's lead, fetched at each size: small 33.1 KB,
  medium 119.8 KB, large 370.1 KB, square 6.7 KB. 95% of the sample answered.
  - Commons answered 429 to a client name with no address of the site, and 200 to `Cultifolio/1.0 (https://cultifolio.com/about)`.
    The copy names itself so.
- **The bound** (every size every page can show): 303 GB, about $4.40 a month at R2's $0.015 per GB-month after 10 GB free.
  - The first screen of every page alone is 55.5 GB.
  - The first copy is about 4 million writes: about $13.50 once, at $4.50 a million after a free million a month.
  - Later days copy only what the fills add, within the free million.
  - Serving costs nothing (R2 has no egress charge).

## The owner's decision (22 November 2026)

**A bucket of its own, `cultifolio-img`, on `img.cultifolio.com`, copied ahead.**

Not the Worker copying on first view. That would run the Worker once per photograph, up to about 90 times a page. On the
Workers Free plan, 100,000 requests a day, a launch day could stop the whole site.

A bucket of its own, not a prefix of `STORE`:
- a public domain serves everything in its bucket;
- `cultifolio` holds the sync vaults.

No Worker binding is needed, so `wrangler.jsonc` is not touched.

The owner creates the bucket, connects the domain and makes the `r2img` rclone remote (a token for `cultifolio-img`
alone).

## What round 109 built (22 November 2026)

1. **The address of a copy** (`src/lib/core/img.ts`, `imgKey`): one pure function from a source's address to its copy's
   path, used by the step now and by the pages in round 111.
   - iNaturalist: `inat/<photo id>/<size>.<ext>`, the extension the source's, lower-cased (`jpg` where none).
   - GBIF's cache: `gbif/<width>/<occurrence>/<media hash>.jpg` (another cached address: `gbif/<width>/h/<hash>.jpg`).
   - Commons: `commons/<two hex>/<hash>.<ext>`, the hash FNV-1a 64 of the whole address. Not the file's own name, as
     planned: a Commons name can hold characters a Windows file name cannot, and run past Windows' 260-character path
     when a batch is written to disk. The hash is the same in the browser, the Worker and Node, with no library.
   - Every path ends in an image's extension; any other host, or a kind of file not shown as a photograph, has no copy.
2. **The list of copies** (`src/lib/dossier/img-wanted.ts`): `pageWanted` (each photograph shown at its gallery thumbnail
   and the strip's small; the lead at `photoOf` medium and large and its srcset) and `rowWanted` (an index row's thumb,
   and its square, small and medium), from the functions the pages call. r109a counts those calls in src/ (photoAt 14,
   photoOf 5, srcsetOf 2, shownAt 1) and fails on one more, so a new place is read for the copy.
3. **The step** (`scripts/img-copy.ts`; the corpus step's `img [--hours N]` line): reads the corpus as the site reads it
   (`parseDossier` with the index's held names), fetches what is not up, a few requests at a time per host (iNaturalist's
   S3 bucket 12, Commons 2, GBIF 3, static.inaturalist.org 2), naming itself `Cultifolio/1.0 (https://cultifolio.com/about)`,
   writes batches of 2,000 to `bulk/img/batch-<n>/` and copies each up with `rclone copy … --no-check-dest` and
   `Cache-Control: public, max-age=31536000, immutable`, while the next batch is fetched. A batch's paths go into
   `bulk/img/done.txt` once rclone has copied it; a run asks only what is not there (`--relist` reads the bucket's own
   list). A 404 or 410 goes into `bulk/img/gone.txt` with the day (rule 2: said as gone, not as none; `--retry-gone`);
   any other answer is "not answered", asked again next run; a host silent 20 times running is left for the run, and
   said. `--hours N` stops new fetches after N hours, so the day's fills can take the lock; the stop says what is up
   stays up. `--dry-run` counts.

**Decided, moved to round 111:** the upload's guard and the copies' prune. Both are about pages naming copies, which
starts in round 111. A guard now would stop every daily upload for the days the first copy takes, and there is nothing
to prune until a page stops naming a copy.

## The dry run and the trial (22 November 2026)

- Dry run: 4,035,089 copies wanted, from 48,375 pages and 41,190 index rows. By host: iNaturalist's bucket 3,803,944,
  Commons 120,631, GBIF's cache 110,432, static.inaturalist.org 82. Not one address the step does not copy. The read
  takes 90 seconds.
- A 72-second trial: 5,514 copies, 279 MB, every one answered, none gone. Two read back from img.cultifolio.com:
  `200`, `image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`, `cf-cache-status: MISS` then `HIT`.
- The fetch ran at about 77 a second and the upload at about 45 at 16 transfers, so the upload now runs 48. At about
  70 a second the first copy is about 16 hours of running, in runs of 18 hours or less around the daily plan.

## The run

`node scripts/corpus-step.mjs --plan scripts/corpus-plan-r109-img.txt`, again after each stop, until its line reads
"0 left". Claude runs it in the app's terminal (the owner's decision of 22 November 2026), the daily plan between runs.

## Round 111, after the copy is complete

- The upload's guard: a plan's `upload` stops if the `img` step has not run since the last `--index`, so no page names a
  copy that is not there.
- The prune of copies no page names (a photograph dropped, or its licence changed), with its dry run as a stop.

- The pages ask `img.cultifolio.com`.
- `img-src` becomes `'self' data: blob: https://img.cultifolio.com`.
- /about/how, /about and /privacy say photographs are served from the site's own bucket, the rule for a dropped
  photograph, and the licences: rule check 4. The site shows only CC0, public domain, CC BY and CC BY-SA, never BY-NC
  (`Photo.licence`), so the hand-off's non-commercial condition does not arise. Resizing keeps the licence, and each page
  names it as now.
- RESEARCH's `referencePhotos` setting is read again then: with no outside host asked, a private page's photographs tell
  no one the list.

## Not this round

The pages, the policy and the about pages are unchanged until round 111. Round 110, the daily growth of the species
list, is planned separately.

## The gate (22 November 2026)

`node scripts/predeploy.mjs --tier=corpus`: 6,470 unit tests in 719 files, then 1,079 browser tests in Chromium desktop
and phone, every test first time, on the second run. The first stopped at r84a 2: the comment of img.ts named the bucket
in backticks, which the test reads as a name the site keeps on the device; it is said plainly now. svelte-check before it:
0 errors in 1,873 files. Nothing served changes, so no deploy: the Worker and the pages are as round 108 left them.
