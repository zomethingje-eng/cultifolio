# Round 106: the species page in the grower's order (plan)

The first hand-off's round 4, planned against the code on 21 November 2026, after round 105.

A grower asks, in order: what is this plant, can I grow it where I live, how should I keep it, and why should I believe
you. The page answered in the reverse order: four views of one climate (the glance table, the year strip, the
Walter–Lieth diagram, the combined chart), then "At home, aim for" about 2,000 px down, then the summary.

## The build

1. **The order.**
   - the header, with round 103's "Habitat in short";
   - the section row;
   - **What it is** (the quoted summary, its heading renamed from "Summary") and the genus;
   - **At home, aim for**, then the cultivation cards under it;
   - **Hardiness**, with the grower's own place against the cold floor under it;
   - **Climate across the habitat**;
   - **Where it grows wild** (renamed from "Natural habitat"), with Flowering;
   - Photographs, Papers, Related, Names and registers, the record, where the page came from.
2. **The section row** in the grower's words: What it is · At home · Hardiness · Climate · Where it grows · Photographs ·
   (Papers) · Related · Names.
3. **The cultivation cards:** the first is open at rest, since closed titles read as empty. The hand-off offers this or
   a summary line under each title. Decision: open the first. A summary line would repeat the card's sentence, which
   round sixty removed.
4. **The climate is one chart.**
   - The glance table and its year strip go. "Habitat in short" carries the four figures, and its "Figures" link goes
     to the Climate section.
   - The chart gains **"Show in my months"**. It uses the season card's own shift rule (`$climate/my-months`): six
     months, only where the year can be moved and the reader's hemisphere is not the habitat's. It is off at first, so
     the chart opens in the habitat's months. It is a button with `aria-pressed`, hidden until scripts run.
   - Under the chart go the season's reading in words with its rule and source, the months of 25 mm or more, and which
     hemisphere is the reader's (the year strip's lines).
   - Closed folds under it: the climate class with the Walter–Lieth diagram, the figures by month, and "How this
     section is made".
   - The °C | °F switch moves from the glance row's head to the Climate section's head (`UnitSwitch.svelte`), so the
     page keeps it.
5. **Flowering.**
   - Under 12 observations, a sentence in place of the chart: "2 flowering records: September and December", with
     each month's count where any month has more than one.
   - At 0, the source's own sentence, kept: it names what was counted. The mock's wording fits only GBIF's download.
   - 12 is the habitat climate's own threshold, said on /about/how as a judgment.
6. **Related:** tiles with a photograph first, the rest after in their order, none hidden.
7. **Provenance one tap away:** each figure keeps its short source; the long sentences stay in each section's "How".

## Rule check (rule 1)

`tests/e2e/r106c-figures.spec.ts` captured every figure (a number with its unit) and every source named on the five
fixture pages on dd6265c, before any change (`tests/e2e/fixtures/r106-figures-before.json`). After the reorder it
requires each one still in the page's text, in a section, a fold or a "How".

## Tests

- **r106a (unit):**
  - "Show in my months" in both hemispheres, and the months moved;
  - flowering at 0, 11 and 12 observations.
- **r106b (browser):**
  - the order and the row;
  - the switch for a northern reader, there and back, and none for a southern reader;
  - the related tiles' sort;
  - the page with every fold open: ids once, controls and images named, no heading level skipped.
- **r106c (browser):** the figures and sources.
- The page's length on *Echeveria elegans* and *Welwitschia mirabilis*, before (live, dd6265c) and after, in the
  record.
- The slow phone (CPU 4× slower, slow 4G) on the live page after the deploy: LCP, INP and CLS in the record.
