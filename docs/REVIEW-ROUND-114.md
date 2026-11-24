# Round 114: the six answers and "Habitat in brief" (SPECIES 18, c and d)

The species hand-off's round 18, its part c: six fixed answers under the name, in place of the four figures of "Habitat
in short". Parts a (the photographs' wild and cultivated switch) and b (the header's chips and its "What it is") follow
as round 115. Written on 23 November 2026 while the photograph copy held the lock. It was checked in a clone beside the
project (docs/AWAY-2026-11.md), then gated with rounds 111 to 113.

## What changed

- **`six-answers.ts`:** the six answers' figures, from what the page held already. Nothing new is worked out.
  - **Cold:** the cold floor; the coolest month's nights, 10th to 90th percentile; the range of the yearly lows, with the
    frost words.
  - **Heat:** the warmest month's mean daily high and its range; the hottest day in 100.
  - **Rain:** the year's rain and its range across the range; the season, in its existing words; the months under 5 mm
    (the Rain fold's rule); "Fog and dew are not measured" under the rain rule's 120 mm.
  - **Light:** the lowest to the highest month's DLI, under open sky.
  - **Air:** humidity, dryness (VPD) and wind, lowest to highest month; how much cooler the nights are than the days.
  - **Ground:** the typical cell's elevation.
- **`HabitatLine.svelte`** draws them.
  - Each answer is a label, a figure, its lines, its source, and a sparkline. The sparkline is hidden from assistive
    technology; the figures are in the Climate section.
  - The layout is two across on a phone, three from 641 px, and one row from 1,100 px.
  - A page without a habitat climate keeps the row, a dash in each slot, and the page's reason (rule 2).
- **On a phone** each answer is its label, figure and source, so the six stay on the first screen, as the owner's
  decision 3 of round 84 holds. At 320 × 568 the full six ran 534 px, past the pinned bar.
- /about/how says the six (rule 5). /changes has the round.

## Where the hand-off did not hold, and what was done instead

- **Elevation as a number.** The hand-off asks for a numeric field written by the next build. Until a build writes one,
  the figure is read from the record's sentence ("ETOPO 2022, 777 m (cell mean)", `elevationOf`). The figure is the same
  either way.
- **A page whose extremes were set aside.** The hand-off asks for a dash in Cold with the status's reason. Cold instead
  shows the coldest month's mean nightly low, "not a floor", as the strip did. That figure is sourced and named, and the
  set-aside reason stays in the Climate section.
- **The current month on each sparkline** waits for round 19, which decides which month that is.
- **The records behind the climate** ("521 in 202 cells") stay as the line under the six on a wide screen. They become
  a chip in round 115.

## Part d: "Habitat in brief", and the title (SPECIES-18D.md, 23 November 2026)

The addition says "with round 18 if round 18 is not yet committed". Round 114 was not, so part d is in it.

- **`brief.ts`:** six fixed sentences filled from the page's figures. Each sentence appears only when its figures are
  held. "In habitat, *Name*" opens the first sentence present.
  - The figures, their rounding and units are the six answers' own. The USDA zone is `usdaOfShown`, as the "How cold
    it gets" section shows it.
  - The source line names each sentence's source once, in order.
  - The block sits in the header's text column under the name's facts, a real `<h2>` ("Habitat in brief"). It is in
    the HTML the server sends, in the main text colour with figures at 600 (option B).
  - It is absent on a page without a habitat climate.
- **The title** reads "*Name* (*common*): hardiness zone, minimum temperature, habitat climate".
  - "hardiness zone" only where a zone or band is held.
  - "minimum temperature" only where the daily extremes are shown.
  - A page with neither keeps round 103's title.
- **The description** is from the same figures, under 160 characters. `og:` and Twitter follow it.
- **The `Taxon` block** gains `description`, the paragraph as plain text.
- /about/how says the sentences are fixed and filled by code, never written by a person or a model (rule 5).

**Calls made for the owner (SPECIES-18D's three; the owner kept all three on 23 November, and the paragraph before the six answers on a phone):**
1. **The common name stays in the title**, so the title gets longer and a search result cuts it part-way. This
   overrides round 103's 60-character room for these pages.
2. **"hardiness zone" in the title** means the habitat's zone; the paragraph says "places its habitat in".
3. **The paragraph and the six answers repeat each other** on purpose.

**Where it differs from the addition:**
- **Rain with no median across the range.** A page whose year's rain is the monthly medians added (an older record)
  says "its monthly medians added", not "at the median across its range". The words must say which figure it is.
- **More than three native regions** read "A, B and N more regions". The header's line shows two and a count.
- **"What it is" gaining a matching label** waits for part b, which moves "What it is" into the header (round 115).
- **The first screen.** The paragraph comes before the six answers, as the addition places it. So on a phone, and at
  1024 × 768 and 1280 × 800, the six answers start below the first screen. Rounds 84 and 103 held them there.
  - The habitat's figures are still on the first screen: the paragraph states them, and its first three lines are
    there at every size tested (r85e, r103d).
  - The owner accepted the mock with the paragraph first.
- **The description's length** is at most 160 characters, the addition's "under about 160". Its own *Welwitschia* line
  is 157, so round 59's test moves from 155 to 160. Where the rain said as the median year's (an older record, round 63)
  would push it past, the USDA zone is left out of the description first; the paragraph and the chips still give it.
- **The house rule against "place"** (r74) now allows these sentences' verb ("That places its habitat in", "Kew places
  it in"). The rule is about a grower's spaces.

## Tests

- `tests/unit/r114a-six-answers.test.ts`: SPECIES 18's own figures for *Welwitschia mirabilis*, from
  tests/unit/fixtures/r114a-k339841.json.
  - Cold 5.5 °C, coolest month's nights 11–14 °C, yearly lows 2.1–6.3 °C.
  - Heat 31 °C, 28–34 °C, 41.2 °C.
  - Rain 80 mm, 30–196 mm, 7 months under 5 mm, fog.
  - Light 30–53 DLI. Air 44–56%, 1.14–1.52 kPa, nights 12–15 °C cooler. Ground 777 m.
  - Also: a page with no extremes, and the elevation's sentence read.
  - Every one held on the first run.
- r103c, r84e, r103d, r84e, r61w and r82u read the six answers' words, counts and labels. r85e holds the phone's first
  screen.
- `tests/unit/r114b-brief.test.ts` (10 tests):
  - the addition's own paragraph, source line, title and description for *Welwitschia mirabilis*, word for word;
  - no climate, extremes failed, frost, a zone without a band and the reverse, no dry month, °F;
  - a paragraph about a place never uses "hardy to", "tolerates", "survives" or "needs".
- `tests/e2e/r114c-brief.spec.ts`: the label and paragraph in the HTML a request without script gets, the title, the
  description and the `Taxon` description; a real heading; none on a page without a climate.
- On 1764df3, r114a, r114b and r114c FAILED, since there were no six answers and no paragraph.

## The gate and the deploy

(Written when they have run.)
