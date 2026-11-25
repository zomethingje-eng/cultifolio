# Round 118: the year panel (SPECIES 19)

The species hand-off's round 19. Built in the clone (Desktop\AI Work\cultifolio-check) on 24 November 2026 while the
Commons photograph copy held the project's lock, and copied into the project between gates.

## Done

- **The year at the habitat** (`src/lib/ui/ref/YearPanel.svelte`), on the species page before the one chart:
  - three charts on one month axis: temperature (days, nights dashed, the 10th to 90th bands, the cold floor dotted where
    the extremes are on file), rain (bars, the span as whiskers), light (the open sky's DLI with its band);
  - four thin rows on fixed scales, so two pages compare by eye: day length 0 to 24 h, RH 40 to 75%, VPD 0 to 2 kPa,
    wind 0 to 6 m/s. The scales are the reference's 1st and 99th percentiles over a sample of 2,463
    pages' months (RH 43 to 72, VPD 0.11 to 1.82, wind 0.9 to 5.9), rounded out; a month outside is drawn at the edge and the table
    holds its figure;
  - this month shaded on every chart, its figure beside each chart's name ("now 22 / 14 °C");
  - Chart | Table. The table is the charts' text: twelve rows, each median with its 10th to 90th span where the span
    differs (the rule of the old "Figures by month"), read by screen readers in either view;
  - CSV made in the browser (`<species>-months.csv`, a first line naming the source) and the page's JSON;
  - My months | Its months where the shift rule applies and the reader's hemisphere is not the habitat's; the habitat's
    month under each of the reader's;
  - the year in two halves under it (`src/lib/climate/year-halves.ts`): the wet and the dry months where the season rule
    reads a rainy season, else the warmer six and the cooler six, in sentences filled by code. SPECIES 19's Welwitschia
    figures: 74 mm in the warmer half, 6 in the cooler.
- **Day length** (`src/lib/climate/day-length.ts`): computed, not read; the sun's centre above −0.833° on the 15th of each
  month at the typical cell's latitude. SPECIES 19's checks hold: Pittsburgh 9.3 h in December and 15.0 in June;
  Welwitschia's cell (20.5° S) 10.9 to 13.4.
- **The one chart** of rounds 61 to 117 is kept, folded under the panel ("The year as one chart"), with its own "Show in my
  months". The "Figures by month" fold is gone: its table is the panel's Table.
- /about/how: "The year panel" (#year-panel) with its rules, "Your months" says the panel's switch; /about/formats: the CSV;
  /changes: round 118.

## Decisions

- The panel opens in the reader's months where the shift applies (SPECIES 19 asks for the grower's calendar first); the
  folded one chart keeps the habitat's months first, as before.
- The thin rows' fixed scales are from the corpus, not from SPECIES 19's sketch (which named none).
- The day length is at the typical cell's latitude, the same cell the extremes are read at.

## Tests

- r118a (unit, 5): day length against SPECIES 19's figures; the halves for Welwitschia and for a rainy season. FAILED on
  19ec7a8 (no module).
- r118b (browser, 4, two at phone width): the charts' names, the table in either months with day length, the CSV, the
  halves. FAILED on 19ec7a8 (no #year-panel).
- Moved to the panel: r61w, r63u U4, r85e 4 and 6, r106b 2 open the one chart's fold; r85e 4 reads the panel's columns;
  smoke-2 reads January in the habitat's months; r80u layout 2 swipes the panel's table.

## Gate and deploy

- svelte-check 0 errors in 1,898 files; hybrids made again before the gate, 518 as before.
- The app gate, WebKit and Firefox at one worker each: the first two runs passed every test but one, which passed on its
  retry (r83a 2, then r83a 1, Firefox): the test's client-side visit to the species page, through its data route, ran past
  Playwright's default 5 s under four engines at once (2.5 s alone; 9 of 9 alone). Its wait is 15 s. The third run: 6,549
  unit tests, 2,962 browser tests, every test first time in every engine.
- Committed as d5db1c0 and pushed on 24 November 2026 at 23:55 UTC. The first `node scripts/deploy.mjs` stopped at its
  unit tests (r85m, which walks the shipped trees, past its 20 s once); the second deployed, live check 24 of 24, at
  00:05 UTC on 25 November. The daily run followed at 00:06.
