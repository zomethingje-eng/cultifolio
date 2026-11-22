# Round 108: a habitat climate where the records are blurred (plan)

The first hand-off's round 5, planned on 22 November 2026 from the count of round 107 (`scripts/dev/r107-coarse-count.ts`,
read-only, the bulk download of the corpus's own GBIF download; `bulk/r107/coarse-count.tsv`, `coarse-by-genus.tsv`,
`coarse-count.log`, not in git). The owner's standing approval (the hand-off queue) is to decide, so the thresholds and
the proof's bar are decided here, with the reasons, before any proof is read.

## The count (step 1)

Of the index's 48,375 pages, 10,104 have no habitat climate; 9,948 of them for want of placed records (the rest for a
range, a cultigen or no records). The bulk download's 146,433,123 rows were read once; 1,767,585 rows were kept for 8,776
of those pages (7 capped at 50,000 rows). Each page's records were read by the builder's own `readRecords` with the 10 km
bound moved:

| Bound | Pages that would have a climate (3 cells or more) | Of them, not from few records (12 places, 5 cells) |
|---|---|---|
| 30 km | 1,093 | 408 |
| 100 km | 2,148 | 822 |

2,703 pages hold in-range records whose own fields (`informationWithheld`, `dataGeneralizations`) say their place was
withheld or generalised.

The collectors' genera (pages with no climate for want of placed records):

| Genus | Pages | At 30 km | not few | At 100 km | not few | Records withheld or generalised |
|---|---|---|---|---|---|---|
| *Lithops* | 38 | 16 | 9 | 18 | 12 | 25 |
| *Conophytum* | 105 | 60 | 33 | 60 | 33 | 83 |
| *Paphiopedilum* | 70 | 1 | 0 | 24 | 4 | 40 |
| *Nepenthes* | 139 | 1 | 1 | 53 | 25 | 92 |
| *Euphorbia* | 136 | 11 | 6 | 37 | 13 | 50 |
| *Aloe* | 89 | 13 | 7 | 24 | 11 | 37 |

Land was not tested in the count; the build tests it, so the build's figures can only be lower.

## The decisions (step 2)

1. **The coarse tier is 30 km.** iNaturalist's obscured cell (0.2°, about 22 km on a side, its uncertainty under 30 km)
   fits inside it, and it gives *Lithops* 16 of 38 pages and *Conophytum* 60 of 105. 100 km is not taken: it doubles the
   pages, but a 100 km circle in the Richtersveld or on Borneo spans sea level to mountain tops, and the cold floor a
   grower reads would be a region's, not a habitat's. *Paphiopedilum* and *Nepenthes* gain almost nothing at 30 km; they
   keep their notice (point 5) and wait.
2. **Only where the 10 km tier gives no climate.** A page with a climate today is not touched. The tiers are never mixed:
   a coarse page's climate is read from its 30 km records alone.
3. **Each coarse record is read over its area, not its point.** The CHELSA cells (30 arc-seconds) within the record's
   stated uncertainty are averaged, so a point iNaturalist moved at random is not read as if exact.
4. **Elevation.** The lapse correction the build applies to the typical spot (`$core/lapse`) is not applied to the coarse
   tier's months, since the plant's own height is not known within the area. Instead the proof measures what the blur
   does to the cold floor and the warmest month, and the label says the figures are an area's.

## The proof (step 3), with its bar set now

- Species with at least 30 records placed to within 1 km, in the same regions and biomes: southern African succulents
  (Aizoaceae, Crassulaceae, Euphorbia, Aloe in the Succulent Karoo and Nama Karoo) and South-East Asian orchids and
  pitcher plants (Borneo, Sumatra, the Malay peninsula).
- Each record blurred as iNaturalist does: moved to a uniformly random point in its 0.2° cell, its uncertainty that
  cell's half-diagonal.
- Each climate computed twice, from the exact records by today's rule and from the blurred ones by the coarse rule.
- **The bar, set before any result is read:**
  - the cold floor and the warmest month's mean high: median absolute difference 1.0 °C or less, and 90% of species
    within 2.5 °C;
  - the rain a year: median difference 15% or less, and 90% within 30%;
  - the daily light (DLI): median difference 10% or less.
  A region that fails the bar is left out of the coarse tier, and the record says which.
- The proof is a script under `scripts/dev/`, offline and read-only, run on the PC (about an hour), its result in the
  round's record.
- Two things settled on a trial of the script on the bulk file's first 3 million rows, which reads no figure of the round
  (a part of the records; the run on every row is the proof):
  - South-East Asia's orchids and pitcher plants gave 15 candidate pages, too few to judge (the bar asks for 10 species
    a region, which the trial showed so few pages would not reach); the region's group is every family, since the
    question is the blur in steep wet tropical ground. Southern Africa keeps its four groups (372 candidates).
  - The cold floor is NASA POWER's at the typical spot, read from the build's POWER cache only (nothing fetched); a
    species whose blurred typical spot falls in a POWER cell not in the cache is left out of that one figure and counted.
    The coldest month's mean nightly low (CHELSA) is measured beside it, by the same bar.
- `scripts/dev/r108-blur-proof.ts`, seed 108; it writes `bulk/r108/blur-proof.tsv` and `blur-proof.log`.

## The label (step 4)

- Every coarse figure says so: "from records placed only to within 30 km" in the strip, the chart's caption and the
  record, and the few-records mark on today's terms.
- /about/how gives the rule; /about/formats the dossier's new field (the tier).

## Until then (step 5)

Where a page has no climate and its in-range records say they were withheld or generalised, the notice counts them: "N of
its M in-range records have their place withheld or blurred by their publishers." Said only where the records' own
fields say so (rule 3). This needs the count in the dossier, so it rides with the builder change.

## Order

1. The proof script and its run (no corpus change).
2. If the bar holds: the builder change with its tests, the label, /about/how, a dry run on the 1,093 pages.
3. The corpus step (`node scripts\corpus-step.mjs --plan scripts\corpus-plan-r108.txt`) in the owner's CMD: backup,
   `dossier` of those pages offline, a review stop with `expect` lines, upload, live check.

## The proof's first run (22 November 2026), and the amended tier

`bulk/r108/blur-proof.log`, seed 108: 146,433,123 rows in 22 minutes; 146,967 records placed to within 1 km kept for 483
pages; 422 species compared (62 pages had fewer than 30 such records in the download).

| Figure | Southern Africa (346 species) | South-East Asia (76 species) | Bar |
|---|---|---|---|
| Cold floor (NASA POWER) | median 0.76 °C, 90th 2.72 °C: FAIL | median 0.48 °C, 90th 2.67 °C: FAIL | 1.0 / 2.5 °C |
| Coldest month's mean nightly low | 0.38 / 1.30 °C | 0.61 / 2.00 °C | 1.0 / 2.5 °C |
| Warmest month's mean high | 0.38 / 1.08 °C | 0.31 / 1.13 °C | 1.0 / 2.5 °C |
| Rain a year | 4.7% / 17.5% | 3.0% / 9.5% | 15% / 30% |
| Daily light | 0.5% | 0.7% | 10% |

By the bar as set, both regions fail, on the cold floor alone, and the tier as planned is not built. The cold floor is the
one figure read at a single point (the typical spot's NASA POWER cell, 0.5°), not across the range: a blur that moves the
typical spot across a POWER cell's edge moves the floor, which no median smooths.

**The amended tier, decided after reading this run (so it is held to a fresh run, not to this one):** a page whose climate
comes from records placed only to within 30 km carries the CHELSA figures (the months, the rain, the light, the coldest
month's mean nightly low) and no cold floor, no record low and no hardiness band from NASA POWER, each said as not derived
and why ("its records are placed only to within 30 km; the cold floor is read at one point"), never as none. The payoff and
any figure that reads the cold floor fall back as they do today where it is absent.

The confirmation: the same script with `--no-floor` and a fresh seed, 2108, the bar unchanged for the four CHELSA figures
(`bulk/r108/blur-proof-seed2108.log`). If any fails there, no coarse tier is built this round.

## The confirmation (22 November 2026)

`bulk/r108/blur-proof-seed2108.log`, `--no-floor`, seed 2108, the same 422 species blurred afresh: both regions pass.

| Figure | Southern Africa (346) | South-East Asia (76) |
|---|---|---|
| Coldest month's mean nightly low | 0.36 / 1.28 °C | 0.61 / 1.94 °C |
| Warmest month's mean high | 0.34 / 1.18 °C | 0.29 / 1.11 °C |
| Rain a year | 4.6% / 17.2% | 3.4% / 10.7% |
| Daily light | 0.5% | 0.9% |
| Cold floor (not judged) | 0.77 / 2.73 °C | 0.96 / 2.95 °C |

The cold floor fails again on the fresh blur, as the first run said: leaving it out is right.

**Where the tier applies.** The proof read two regions, so the tier reads coarse records only inside them (the boxes the
proof used: southern Africa 17° to 35° S, 11° to 33° E; South-East Asia 6.5° S to 7.5° N, 95° to 119.5° E). A coarse
record elsewhere is not read, and a page whose coarse records all lie elsewhere keeps its "no climate" with its reason.
Another region joins only by its own proof.

**Left for a later round:** the notice counting records withheld or blurred by their publishers (step 5), which needs a
count in every dossier and is a walk of its own.

## The count before the build (22 November 2026)

`scripts/dev/r108-coarse-dry.ts` (read-only; bulk/r108/coarse-dry.log, coarse-dry.tsv): of the 776 pages of
`scripts/rebuild-r108-coarse.txt`, 378 gain a coarse climate, every one in southern Africa (198 of them also from few
records; Conophytum 61, Tylecodon 20, Lithops 16, Encephalartos 16), 390 have no coarse record in a tested region (South-East
Asia gains none: its pages' blurred records lie outside the box or are placed worse than 30 km), and 8 have a 10 km climate
from records added since their build. The corpus step is `scripts/corpus-plan-r108.txt`.
