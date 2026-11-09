# Round 87, stage 2: the derived agent's figures

Branch `r87-s2derived`. Every figure here is worked out by stated arithmetic from figures the page already holds, each
with its source. What the walk prints, the plan's lines, what the dry run should show, and the sentences for /about/how
(rule 5), exact and HTML-ready, with where each goes. The species agent mounts the three sections and places the sentences.

## The three sections (for the species agent)

| Component | Props | Where (the owner's mockup, LookSpecies) |
|---|---|---|
| `src/lib/ui/ref/AtHome.svelte` | `climate={d.climate}` `units={u}` | "At home, aim for", after "Where it grows wild, in figures" |
| `src/lib/ui/ref/Hardiness.svelte` | `hardiness={d.hardiness}` `extremesShown={d.climate.status === 'ok' && !!d.climate.extremes}` `units={u}` | with the cold figures (after the extremes) |
| `src/lib/ui/ref/Koppen.svelte` | `koppen={d.climate.status === 'ok' ? d.koppen : null}` `months={d.climate.status === 'ok' ? d.climate.months : null}` `cells={d.climate.status === 'ok' ? d.climate.cells : 0}` | after "Climate by month" (the climograph) |

Each renders nothing where its figures cannot exist (no habitat climate; no shown extremes). A page whose record predates
the walk says "Not worked out for this page yet", never "none" (rule 2). The page's `d` is the parsed dossier
(`parseDossier`, so `setAsideExtremes` has run: extremes read at sea or beyond a lapse correction are not shown and give
no hardiness).

## 1. Hardiness (`hardiness`)

What is stored: the walk keeps each calendar year's lowest night at the typical cell (`climate.extremes.lows`: the first
year and a low a year, null for a year with fewer than 347 of its days), read from the cached NASA POWER series by the same
lapse correction as the record low (`src/lib/climate/year-lows.ts`). The dossier held only the record low and the 1-in-100
night before; the daily series is in the PC's POWER cache (`climate/power-cache`), so the offline walk reads it there.
`hardiness` is then written by every build and the walk (`src/lib/dossier/hardiness.ts`, `habitat-figures.ts`):

- `usda`: the mean of the complete years' lows, in °F (× 9 ÷ 5 + 32), and USDA's zone of it (10 °F zones from −60 °F, 5 °F
  halves, "a" the colder), with the number of years and the first and last; absent with `usdaWhy` where the lows are not
  held (extremes carried from a build before) or fewer than 20 years are complete.
- `rhs`: the record low and the RHS band it falls in (H1a warmer than 15 °C … H7 colder than −20 °C; an edge is the warmer
  band's, as the RHS's table gives each edge to both).

Sources cited in the code and on the page: USDA ARS Plant Hardiness Zone Map (https://planthardiness.ars.usda.gov/; the
2023 map is the 30-year average, 1991–2020, of the lowest annual winter temperatures, 10 °F zones and 5 °F half-zones,
per USDA ARS's 2023 release (ars.usda.gov, "USDA Unveils Updated Plant Hardiness Zone Map") and PRISM, https://prism.oregonstate.edu/phzm/); RHS hardiness rating
(https://www.rhs.org.uk/plants/trials-awards/award-of-garden-merit/rhs-hardiness-rating). Our mean is of the years the
series holds (1981–2024, up to 44), not USDA's 1991–2020, and the page says so.

## 2. Köppen–Geiger (`koppen`) and Walter–Lieth

`koppen` (`src/lib/dossier/koppen.ts`): the class of the median year by Peel, Finlayson and McMahon (2007), HESS 11,
1633–1644, https://doi.org/10.5194/hess-11-1633-2007, Table 1 (B tested first; the Cs/Cw tie broken by the halves' rain, as
their section 2 does for Herberton, which a test reproduces), with the figures it came from (MAT, MAP, Thot, Tcold, Tmon10,
Pdry, the summer half and the four seasonal months, Pthreshold). A warmest month of exactly 10 °C is on the paper's own
boundary (E is "< 10", C and D "> 10"): no class, and the page says why.

Walter–Lieth: a reading only (`src/lib/climate/walter-lieth.ts`), the months whose rain in mm is under twice their mean
temperature in °C, shown in the Köppen section. Drawing it in the climograph is not cheap: the chart has two panels on
separate scales, and the diagram's one shared scale (10 °C to 20 mm) would be a second chart. Climograph.svelte is unchanged.

## 3. At home, aim for (`atHome`, computed in the UI)

`src/lib/ui/ref/at-home.ts`, no stored field. Winter nights: the coldest month's mean nightly low, 10th to 90th percentile
across the cells (CHELSA V2.1, 1981–2010), with its median and the record low (NASA POWER) where shown. Summer days: the
warmest month's mean daily high, the same way. Grow light: PPFD = DLI × 1,000,000 ÷ (hours × 3,600), the DLI the mean of
the twelve monthly medians, 14 h with 12 h and 16 h buttons. Humidity: the lowest and highest monthly median relative
humidity (CHELSA hurs) where every month holds one, else "the habitat figures hold no humidity, so none is worked out".
(The mockup's "not shown" was a placeholder: the corpus's months do hold CHELSA's humidity, as the sheet's Humidity card
already shows.) Under it, the owner's sentence as given.

## 4. Index additions (C5)

- `low`: `climate.extremes.minAbs` as shown, one decimal; absent without shown extremes.
- `first`: a day number like `changed`. A dossier keeps no first build, so `first` is the earliest day the dossier records
  (its build, `changed.on`, each source's `at`, each carried row's "carried from build of" day, a photograph's or the
  summary's `read`), or the day the index before gave, whichever is earlier: from this round each `--index` carries it
  forward from `static/s/v3/index.json`. For a page built before round 87 it is no later than its first build, not that day.
- The browse table carries `low` as a column (number or null; optional, a table written before still parses; `lowAt`).
  It carried `first` too (day or 0, `firstAt`) until the review of stage 2: nothing read it there, so it was dropped,
  and the index keeps it.
- The country table: already the browse pages' (`tdwg-levels.json` `countries`, from `scripts/tdwg3-shapes.json`), so not
  carried again; `src/lib/browse/table-countries.ts` is the one rule, and a test holds the committed table equal to it.

Size, measured on the live index of 5 November (48,375 entries, 37,667 with a habitat climate), `low` on every one of
those and `first` on all: index.json 40,115,665 → about 41.55 MB, +1.43 MB (+3.6%) as written (one-space indent); gzip
7.68 MB → +255 to +347 kB (+3.3 to 4.5%, by how many distinct days `first` has). browse.json: +526 kB, gzip +99 kB
with both columns; `first` no longer in it (the review of stage 2).

## 5. Older data items

- **D13** (`--fill kew-names`, which the walk runs on every page it builds with `--bulk`): `name.kew.by`, each Kew name's
  authors in the plant. `homonymEntries` reads it: a name GBIF writes by another page's own author, which Kew's rows file
  in this plant only by other authors, moves to `hom`, said by Kew's authors; Kew's own names spelt as another heading
  carry Kew's authors in `homBy`. Expected: the 12 of review D (Cordia collococca on Bourreria succulenta and others).
- **B17**: `src/lib/dossier/older-kinds.ts`, `scripts/dev/r87-older-kinds.ts` (a report; writes older-kinds-other.txt).
- **D8** (open sea inside a mainland region's box): not changed. Every test by drawn land also drops real islands the
  drawing lacks (Heron I., the Tuamotus' atolls: about 60 of the 293 island records review D sampled), which is why round
  86 left `islandBox: 'whole'` for the owner (REVIEW-ROUND-86 section 2). The records at sea reach no climate (a cell the
  elevation layer reads as sea is left out), only the map's ring and the "on an island" count. The policy's
  `'beyond-drawing'` setting exists; the ranges dry run (`--shapes-before`) measures it if the owner wants it.
- **D2** (Xeronema's typical spot): held open, as round 86 said. Stage 2 chose the typical cell among the cells holding
  an iNaturalist research-grade record, where at least three did; the review of stage 2 (S4) took it out: research grade
  is "not marked captive", not "marked wild", so the rule chose by what no source states, and it did not move Xeronema
  callistemon's spot (read from GBIF on 9 November, its iNaturalist records are obscured to about 28 km, so none is placed
  to within 10 km and none reaches the climate; its Auckland records are Auckland Museum herbarium sheets of garden plants
  that state nothing). The typical cell is every cell's again, and `--typical-every-cell` is gone with the rule.

## The walk's printed lines

At the end of a build or the walk (with `--grid`), and of the dry run (with "would be"):

    N pages written: K given a Köppen–Geiger class (A a, B b, C c, D d, E e)[, j on Peel and others' 10 °C boundary, given none]; R given an RHS band of the record low, U of them a USDA zone of the mean yearly low[ (n without the yearly lows held: extremes carried from a build before)][ (s with fewer than 20 complete years)]

`--index`: `L of the E entries with a record low (low); first seen (first): C as the index before gave it, F the earliest
day the dossier records[ (no index before held one)]`, and the homonym line gains `, B of them said by Kew's author
(name.kew.by)`. The B17 script: `P pages, S shown older names: a one of Kew's names for the plant as written, b the same
by its citation form, c a name below species of the plant, d other (not Kew's for the plant), e on pages whose Kew names
are not read; the d of kind other, one a line → older-kinds-other.txt`.

## The plan's lines

    dossier --dry-run --offline --grid climate --bulk bulk
    review Read the dry run's two lines of the habitat figures: "K would be given a Köppen–Geiger class", "R would be given an RHS band of the record low, U of them a USDA zone" (K about the pages with a habitat climate, 37,667 in the index of 5 November; U close to R, less the pages whose range an offline run carries).
    dossier --walk --offline --grid climate --bulk bulk
    dossier --index
    review Read --index's line "… with a record low (low); first seen (first): …" (on this first index, C is 0 and "no index before held one"), and the homonym line's "… said by Kew's author" (about 12, review D's D13). Then by hand: npx tsx scripts/dev/r87-older-kinds.ts static/s/v3 older-kinds-other.txt, and paste its line.

The walk moves every page's `changed` day once that gains `hardiness` or `koppen` (they are what the page shows), and
`name.kew.by` moves it on pages with Kew names (see the report: `changed.ts` could leave `by` out of the fingerprint).

## /about/how sentences

1. **Withdrawn** by the review of stage 2 (S4): the first rule of "The extremes at a typical spot" (`#extremes`) is as it
   was, `<li>The typical spot is the grid cell whose coldest month's mean nightly low is nearest the median of that figure across the range.</li>`;
   the stated-wild sentence went with the rule.

2. **New** h3 after "When extremes are set aside" (`#set-aside`), in the same section:

```html
<h3 id="hardiness">Hardiness of the habitat</h3>
<p class="sum">From the typical spot's nights, the page works out the USDA hardiness zone and the RHS hardiness band of the habitat. They are the habitat's, read from where the plant grows wild, not a tested hardiness of the plant.</p>
<details class="full in-full"><summary>The rules in full<span class="sr">: hardiness of the habitat</span></summary>
<ul class="rules">
  <li>USDA's zones are the 30-year mean of each year's lowest temperature, in 10 °F zones from −60 °F, each split into 5 °F halves, "a" the colder (<a href="https://planthardiness.ars.usda.gov/">USDA Plant Hardiness Zone Map</a>).</li>
  <li>The app takes the lowest night of each calendar year from NASA POWER's daily series at the typical spot, corrected for height as the record low is. A year counts only with 347 of its days. It averages the years, turns the mean into °F (× 9 ÷ 5 + 32), and names the zone it falls in. The mean is of the years the series holds, up to 44 from 1981 to 2024, not USDA's 1991 to 2020, and the page says how many. Fewer than 20 complete years give no zone.</li>
  <li>The RHS rates a plant H1a to H7 by the coldest it takes (<a href="https://www.rhs.org.uk/plants/trials-awards/award-of-garden-merit/rhs-hardiness-rating">RHS hardiness rating</a>). The page says which band the record low falls in. A figure on a band's edge is in the warmer band, but for 15.0 °C, which is H1b, since H1a is warmer than 15 °C.</li>
  <li>A page whose extremes are set aside shows neither.</li>
</ul>
</details>
```

3. **New** h3 at the end of "The climate across the range" (`#climate`), before "From few records" (`#few`):

```html
<h3 id="koppen">Climate class</h3>
<p class="sum">The page gives the habitat's Köppen–Geiger class, worked out from the median year's months by the thresholds of Peel, Finlayson and McMahon (2007), each letter with the test that gave it.</p>
<details class="full in-full"><summary>The rules in full<span class="sr">: climate class</span></summary>
<ul class="rules">
  <li>The thresholds are those of Table 1 of <a href="https://doi.org/10.5194/hess-11-1633-2007">Peel, Finlayson and McMahon (2007)</a>. The arid class B is tested first; summer is the warmer of October to March and April to September. Where both the dry-summer and the dry-winter test hold, the half with more rain is summer's rain, as the paper decides it.</li>
  <li>The months read are the median year, each month's median across the range's cells. The class is that year's, not each cell's.</li>
  <li>A warmest month of exactly 10 °C is on the paper's boundary between the polar class and the others, and the page gives no class there.</li>
  <li>The same section names the months Walter and Lieth's climate diagrams draw as arid: those whose rain in millimetres is under twice the mean temperature in °C.</li>
</ul>
</details>
```

4. **New** h2 after "The figures at the top" (`#notes`):

```html
<h2 id="at-home">At home, aim for</h2>
<p class="sum">A species page with a habitat climate gives a starting point for growing it: winter nights, summer days, grow light and humidity, each worked out from the page's own figures with its arithmetic beside it. It is not tested in cultivation.</p>
<details class="full in-full"><summary>The rules in full<span class="sr">: at home, aim for</span></summary>
<ul class="rules">
  <li>Winter nights: the coldest month's mean nightly low, from the 10th to the 90th percentile across the range's cells, with the record low where the page shows one.</li>
  <li>Summer days: the warmest month's mean daily high, the same way.</li>
  <li>Grow light: the light that gives the year's mean daily light integral (DLI) in 14 hours, or 12 or 16 as the reader chooses: PPFD = DLI × 1,000,000 ÷ (hours × 3,600). The DLI is the open sky's; a plant among rocks or shrubs gets less.</li>
  <li>Humidity: the lowest and highest of the twelve monthly relative humidities, only where the habitat figures hold one for every month. Otherwise the page says none is worked out.</li>
</ul>
</details>
```

5. **New** sentences in "How the reference is stored" (`#corpus`), after the sentence on the index:

`<li>The index carries each page's record low (<code>low</code>, °C to one decimal, where the page shows one) and the day it was first seen (<code>first</code>). A page's record keeps no first build of its own, so the first day is the earliest day the record still notes, or the day an earlier index gave. For a page built before November 2026 that is no later than its first build, not that day.</li>`

## /about/formats (rule 5)

- The index fields list gains: `<li><code>low</code>: the record low at the typical spot, °C to one decimal, where the page shows one. <code>first</code>: the day the page was first seen, as days since 1970-01-01, the earliest day its record notes or an earlier index's.</li>`
- `homBy` old: `<code>homBy</code>: for each of them, the authors the record writes after it, as written.`
  new: `<code>homBy</code>: for each of them, the authors the record writes after it, as written; or Kew's authors for the name in this plant, where the record writes none or Kew files the name here by another author than the other page's.`

## NOTICE

The USDA zone table, the RHS hardiness table, Peel and others' thresholds and Walter and Lieth's scale are cited as
definitions, not read as data; if NOTICE is to name them, the coordinator adds one line for each.
