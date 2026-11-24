# Round 113: how cold it gets (SPECIES 21)

The species hand-off's round 21. The owner was away from 24 November 2026 and had said to commit, push and deploy as
needed. Written on 23 November while the photograph copy held the lock, and gated with rounds 111 and 112.

## What changed

- **The hardiness section is "How cold it gets"** (`src/lib/ui/ref/Hardiness.svelte`).
  - Its tab in the page's nav reads "How cold"; its address stays `#hardiness`.
- **The yearly lows, drawn** (`YearLows.svelte`, `year-lows.ts`).
  - The chart:
    - one bar for each year's lowest night, from `climate.extremes.lows`;
    - a year with too few days is a gap, never a zero;
    - a dashed line at the bars' mean, with the USDA zone it gives;
    - a dotted line at the cold floor, labelled "1 night in 100 is colder";
    - the coldest year's bar darker, with its figure.
  - The caption names the years, the coldest and its year, the warmest, the mean and the floor. It is the chart's text
    for a screen reader.
  - The bars use the hand-off's #2d73a3, with a lighter blue in the dark theme.
- **Four tiles beside it:** the USDA zone, the RHS band, the frost over the series (the page's existing words, "no frost
  in 44 years"), and the hottest day in 100.
- **The derivation table** stays under them, unchanged: the sums, the sources, and "neither is a tested hardiness of the
  plant".
- /about/how says what the chart draws (rule 5), and /changes has the round.

## Not this round

- **The site's own yearly lowest night beside the chart.** That needs SPECIES 20's Outdoors view, and option A gives no
  daily lows (docs/PLAN-SITE-CLIMATE.md).
- **Snow cover days and freeze–thaw.** Those wait for SPECIES 24.

## Tests

- `tests/unit/r113a-year-lows.test.ts`. Over *Welwitschia mirabilis*'s fixture (k339841) it checks:
  - 44 bars, 1981 to 2024;
  - the coldest 2.1 °C in 1991, the mean 4.0 °C, zone 10b, band H2;
  - no frost, and 41.2 °C.
  - It also checks the gap rule, the scale, and the section's heading and tiles.
  - On 1764df3 every test FAILED.
- `r106b` and `r87s2` read the nav's "How cold".

## The gate and the deploy

(Written when they have run.)
