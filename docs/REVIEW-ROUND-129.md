# Round 129: "At home, aim for" goes into the lens (SPECIES 20, last part)

The species hand-off's round 20 ends with its table "At home, aim for goes": the section's four figures are where they
are read with the rest, and the section is gone. Built in the clone on 27 November 2026, during the daily run.

## Done

- **The section is gone** from the species page (`AtHome.svelte` and `at-home.ts` removed). Its figures, as the
  hand-off's table puts them:
  - winter nights (the coolest month's mean nightly low, 10th to 90th percentile): the Cold answer under the name (round
    114), and the panel table's Nights row;
  - summer days (the warmest month's mean daily high): the Heat answer, and the table's Days row;
  - grow light (at 12, 14 or 16 hours): Under lights' table, its last row the year's mean (round 127);
  - humidity (the lowest to the highest month): the Air answer, and the table's RH row.
- **The year's mean light** (the figure the grow light was worked from, Copiapoa's 48.4 mol a day) is said beside the
  Light chart's name, so the page still prints it (r106c, every figure the page held before round 106, found it gone).
- **`#at-home` lands on the year panel**: an anchor at the panel's head, so a link to the old section still lands
  somewhere sensible.
- **The "At home" tab** takes the reader to the cultivation cards (`#s-cultivation`), which the section stood over; the
  tabs keep their order and names.
- **/about/how's "At home"** is rewritten for the lens: each of the four figures and where it now is, the sums
  (µmol/m²/s from mol a day, mol a day from µmol/m²/s and hours, lux × 0.0185), links to #lens and #lens-spaces.
- /changes.

## Tests

- r129b (browser, 1, at phone width too): no "At home, aim for" heading; `#at-home` lands on the panel; Under lights'
  last row is the year's mean. FAILED on 9176178.
- Moved: r87s2 1 (the section's sources and its hours switch: now that the section is gone and its address is on the
  panel), r87s2 2 (the tab lands on the cultivation cards), r87s2 3 and 5 (the section's width at 320 px and its buttons
  on paper), r87s2u's sweep and r106b 1's order (the section's selectors); r87s2u-review's unit test 5 (the hours'
  buttons and live region) and r87v's atHomeRows and AtHome tests go with the section (Under lights' table is r127a's).
- r76p strip 2's 1024 baseline, r87p and r87rec on the new /changes lines.

svelte-check found the mean's sum untyped once it was written (the panel's light values may be missing in its type); it
reads them as numbers, as the chart that draws them does.

## Gate and deploy

(Written at the gate.)
