# Round 126: the lens, its Outdoors view (SPECIES 20, first part)

The species hand-off's round 20, "the lens": the reader's own conditions laid over the habitat's figures, compared and
never predicted. This round is the control and its Outdoors view, on the site's own climate tiles
(docs/PLAN-SITE-CLIMATE.md, option A). Greenhouse, Windowsill, Under lights and Another species, which read the reader's
spaces, follow, and the plant page's comparison card (MYPLANTS 31) is this lens for a plant's space. Built in the clone on
26 November 2026.

## Done

- **The site's tiles** (`scripts/site-tiles.ts`): from `climate/climate.grid`, the grid the habitat climates are read from
  (CHELSA V2.1 1981–2010, CC0, 0.05°), one file per one-degree square holding land: 20 × 20 cells × the twelve months of
  the daily high, the nightly low and the rain, int16, gzipped. Land is where the grid holds an elevation: over the sea
  CHELSA's fields carry values and the elevation is NODATA, so the first dry run counted 62,640 "land" squares; with the
  elevation, **26,151 squares, 753 MB raw, 199 MB gzipped**, about **$0.003 a month** on R2 (the hand-off's bar is $1).
  Kew's cell reads 7.1 °C in January's days, 21.3 °C in July's, 663 mm a year, as the grid holds them.
- **The route** `/api/site-climate?sq=<lat>,<lon>`: the square's south-west corner in whole degrees, its bytes from the
  corpus bucket (`STORE`, `climate/v1/`) as stored, cached for a year; 400 for a square not in whole degrees, 404 "no land
  climate for this square". No new binding.
- **On the device** (`$climate/site-climate`): the square of the site, the cell within it, the cell's months; a cell of sea
  is said as such.
- **The lines** (`$climate/lens-outdoors`): the months your average night is below the habitat's cold floor, as runs
  ("November to April"), or none; your rain a year against its, with "Your driest month … is wetter than its wettest" (or
  the reverse) only where true; your day length's range against its. Each line names two figures; none says what a plant
  will do. A line whose input is missing (no cold floor on file) is not drawn. The site's yearly lowest night is not
  compared (the tiles are monthly normals), as the hand-off allows for option A.
- **The panel:** "Compare with: Nothing | Outdoors". Outdoors draws your days and nights dashed on Temperature, your rain as
  dashed marks on Rain, your day length dashed on its row, and a mark under each month whose average night is below the
  cold floor; its card above the charts holds the lines and "It compares. It does not say what the plant will do.", with
  where your figures come from. While comparing the months are held on yours ("Its months" says why). With no site set:
  "Set your site in Settings to compare", and nothing is asked.
- /about/how (#lens, and #site-square in what the site is asked), /changes.

## Not yet

- **The tiles' upload** to `cultifolio/climate/v1/` (rclone, as the corpus's upload): once, after this round's gate, so
  the route has them when the code goes live. Until then the route answers 404 and the card says the cell holds no land
  climate; the upload is the step that closes that.
- **The other views** and "which view opens" (a plant of the species opens its space's view; the view used last; else
  Nothing): they read the reader's spaces, and come with the plant page's comparison card.

## Tests

- r126a (unit, 8): the square and the cell, across the antimeridian; a cell's months at the grid's scales and a cell of
  sea; the route's 400 and 404; the lines' months as runs, two figures each, no prediction, the floor's line left out
  without a floor. FAILED on b1760eb.
- r126b (browser, 2, one at phone width; 7 runs across Chromium, Firefox and WebKit): no site, a prompt and nothing asked;
  a site, one square asked by its corner, the lines and the closing line, the months held. FAILED on b1760eb.

## Gate and deploy

- In the clone, the whole Chromium suite found the new "Compare with" row 30 px past a 320 px screen at 200% text on the
  species page (r62ba N10, r67h 3): the panel's control rows now wrap (101 of 101 in four engines after).
- The tiles uploaded to `cultifolio/climate/v1` with rclone and checked one way: 26,151 matching files.
- svelte-check 0 errors in 1,917 files (after `svelte-kit sync` made the new route's types). The app gate, Chromium at two
  workers, WebKit and Firefox at one, two runs: the first found two tests that passed on their retry (r62l-plant clock 3
  in WebKit, as in round 123's gate; smoke-1's bench path in Firefox at its 30 s limit); the second: 6,588 unit tests,
  3,055 browser tests, every test first time in every engine.
- Committed as 1486d7c and pushed on 26 November 2026; `node scripts/deploy.mjs` deployed version 84282bf9 on its first
  try, live check 24 of 24. The live route: `?sq=51,-1` 200 (8,058 bytes, gzip), `?sq=0,-160` 404, `?sq=x` 400.
