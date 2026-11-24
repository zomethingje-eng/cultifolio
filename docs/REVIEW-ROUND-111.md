# Round 111: the pages ask the site's own copies of their photographs

The first hand-off's round 6, second half (docs/PLAN-109.md, "Round 111, after the copy is complete"). Round 109 copied
every photograph a page or an index row can ask for to the bucket `cultifolio-img`, served from img.cultifolio.com. This
round points the pages at those copies and narrows the image policy. The owner was away from 24 November 2026, and
had said to commit, push and deploy as needed.

## What changed

- **One conversion, where a page loads a photograph.**
  - `photoAt`, `photoOf`, `srcsetOf` and `shownAt` still give the source's address. The copy step reads the same
    functions for what to copy (`img-wanted.ts`), so the two cannot drift apart.
  - Every place a page loads a photograph hands that address to `imgUrl`, or a srcset to `imgSrcset`
    (`src/lib/core/img.ts`). That covers 12 files: the species page (lead, strip, related tiles, preload, og:image,
    JSON-LD), the front page, browse, region, genus, family, compare, the not-found page's species of the day, the
    plant list's and a plant's species thumbnail, a batch's thumbnail, and the gallery component.
  - `imgHosts` replaces `photoHosts` for the preconnect: one host, img.cultifolio.com.
- **The image policy:** `img-src 'self' data: blob: https://img.cultifolio.com`. No page can load an image from
  iNaturalist, Commons or GBIF any more.
- **The about pages** (rule 5):
  - /about/how's privacy lines say the photographs come from img.cultifolio.com. They say how the copies are made, at
    the sizes shown, from the four sources, each keeping its licence and credit. A photograph with no copy says it did
    not load.
  - The browser asks no host but this site and the copies.
  - /about/formats' line on the reference photographs for your own pages says the same.
  - /about/data no longer says the images "are not copied here".
- **The upload waits for the copy.**
  - `img-copy.ts` writes `bulk/img/last-run.json` at the end of each run: the index's time it read, whether it asked for
    every copy, and how many are left.
  - `corpus-step.mjs`'s upload stops (`img first`) when there is no such run, when the run left copies unasked, or when
    the index was written after it. That holds whatever plan runs, so no page goes live naming copies nobody asked for.
  - `--asked-once` ends the copy as done once every wanted copy has been asked, leaving the few a host did not answer to
    the next run. Without it, a day's run would never upload while one photograph went unanswered.
- **The daily plan** gains `img --asked-once --hours 3` after its review and before its upload. A day's thousand pages
  have about 80,000 photographs to copy: about 20 minutes at the copy's rate.
- **The live check:**
  - It notes whether the front page's photographs come from the copies. This is a note, not a failure, since a corpus
    step's check can run on the Worker before this round's.
  - It also defines `note`, which round 110's share-card line called without a definition. That line would have thrown
    the day the reference grew 5,000 species past the card.

## Commons, still from its own host (decided on 23 November, 19:10)

At 19:00 the copy's done list held 3,829,568 iNaturalist copies and 111,110 GBIF copies, both complete. It held 44,836
of Wikimedia Commons' (about 120,000). Commons makes each size of a thumbnail on request, and the copy asks it two at a
time, as Wikimedia's etiquette expects, so the rest ran at about 50 a minute: more than a day. Waiting would have held
every deploy and daily run, so:

- **`SERVED`** (`src/lib/core/img.ts`) names the hosts whose copies the pages ask: `inat` and `gbif`. A Commons
  photograph keeps its own address, and `upload.wikimedia.org` stays in `img-src` beside img.cultifolio.com.
- **The daily plan's copy** is `img --asked-once --served-only --hours 3`. It copies the day's iNaturalist and GBIF
  photographs, and the upload's guard waits for those alone.
- **The Commons copy** carries on between daily runs (corpus-plan-r109-img.txt), stopped with Ctrl-C when a daily run is
  due; nothing is lost.
- **When it is complete,** a small round adds `commons` to `SERVED` and takes its host out of `img-src`.
- **The about pages** say which photographs still come from Commons, and why. So does the offer of the reference's
  photographs on your own pages.
- **Tests:** r111a checks that a Commons address stays the source's and a GBIF one becomes the copy's. config-r60, r61w
  and r69p hold the two hosts.

## Not done this round, and why

- **The prune of copies no page names** (a photograph dropped, or its licence changed). It deletes from the bucket, so
  it wants its dry run read first. A copy no page names costs a fraction of a cent a month and shows nowhere, since no
  page asks for it. It is left for a later round.
- **RESEARCH's `referencePhotos` default.** With no outside host asked, showing the reference's photographs on a
  grower's own pages tells no one which species they hold. The setting stays as it is, off unless switched on. Turning
  it on by default is a product decision, written down here for the owner.

## Tests

- `tests/unit/r111a-img-pages.test.ts`:
  1. The three helpers.
  2. Every `photoAt`, `photoOf` and `srcsetOf` in src/ goes through `imgUrl` or `imgSrcset`.
  3. Every `<img src>` is a copy, the grower's own, or the site's own file.
  4. The image policy names img.cultifolio.com alone.
  5. The upload's guard in its three cases, and the daily plan's order.
  - On 1764df3 every test FAILED.
- `config-r60`, `r61w` and `r69p` hold the narrower policy. r69p's addresses are each page's copy.

## The gate and the deploy

Gated together as rounds 111 to 116 on 23 to 24 November 2026: svelte-check 0 errors in 1,891 files; 6,535 unit tests and 2,946 browser tests, every test first time in every engine, on the fourth run (WebKit and Firefox at one worker each). Committed as 83c266a, pushed, and deployed with node scripts/deploy.mjs on 24 November 00:25 EST as version e2b68573; live check 24 of 24, the front page's photographs every one from img.cultifolio.com.
