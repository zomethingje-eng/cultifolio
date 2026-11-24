# Round 115: the photographs by kind, the chips, and "What it is" in the header (SPECIES 18, a and b)

The species hand-off's round 18, its parts a and b; round 114 built c and d. Built on 23 November 2026 in the clone
beside the project, kept out of the project folder until rounds 111 to 114 were committed, then copied in and gated.

## What changed

- **The photographs (a).** Under the strip, a switch: All, In the wild and In cultivation, each with its count. It
  changes the lead and the strip, and shows only where a page holds both kinds. The strip is five photographs and a
  sixth tile, "N photographs ›".
- **The chips (b).** Under the name's line:
  - the Köppen–Geiger class, the habitat's USDA zone and RHS band, the CITES Appendix, and the records and cells;
  - each only where the page holds it, never "none";
  - each its glossary tip (round 103's `Term`) and a link to its section.
- **"What it is" (b)** moves into the header under "Habitat in brief".
  - It shows the quotation's first two sentences, cut at a sentence's end by `sentences.ts`. The cut is never inside an
    abbreviation: an author's "Hook.f.", a rank's "var.", "St.", "e.g.".
  - "more" opens the rest in place. The credit line, its id (`s-summary`) and the not-checked notice move with it.
  - It is in the secondary colour, so the page's own figures read first.
- /about/how says the chips, the switch and the cut (rule 5), and /changes has the round.

## Where the hand-off did not hold, and what was done instead

- **"In the wild · 62"** counted every photograph not marked cultivated. Only what a source marks is said (round 30,
  R2-12; rule 3): iNaturalist marks each photograph, and Commons and GBIF photographs carry no mark. *Welwitschia
  mirabilis* holds 42 marked wild, 31 marked cultivated and 24 with no mark.
  - So the switch has a third choice, All, the default, under which every photograph stays.
  - The two counts are the sources' own.
- **"93 photos ›"** reads "photographs", the site's word on every page; r106c holds every figure and word the page gave.
- **The Kew phrases and "also called"** line stays as it was: the header's existing line already gives the family, the
  native range and the other names.

## Tests

- `tests/unit/r115a-header.test.ts`: the cut, at two sentences and at fewer, never inside "Hook.f.", "var.", "St." or
  "e.g.". It FAILED on 1764df3, which had no cut.
- r106b, smoke-3 and r84e read "What it is" in the header and the new order.

## The gate and the deploy

Gated together as rounds 111 to 116 on 23 to 24 November 2026: svelte-check 0 errors in 1,891 files; 6,535 unit tests and 2,946 browser tests, every test first time in every engine, on the fourth run (WebKit and Firefox at one worker each). Committed as 83c266a, pushed, and deployed with node scripts/deploy.mjs on 24 November 00:25 EST as version e2b68573; live check 24 of 24, the front page's photographs every one from img.cultifolio.com.
