# Round 105: the record

The top bar and browse's order, built on 21 November 2026. The plan is `docs/PLAN-105.md`. It is the first hand-off's
round 3 less its search items, which round 104 built (one box per screen, places in the search).

## What changed

- **No label beside the wordmark.** A list page's crumb was its section's name ("My plants", "Today", "Cultifolio"),
  and About's and Settings' their own one word: a label that repeated the place lit in the bar and looked like a trail.
  - The crumb is drawn only where it is a trail, two parts or more (`+layout.svelte`, `isDetail`).
  - A detail page keeps its trail and its Back link, as before.
- **Sync and Add say their names on a desktop.** From 901 px the bar reads "⟳ Sync" and "+ Add" ("+ Start" on the
  propagation pages, whose button starts a batch). Each visible word is the start of its accessible name ("Sync", "Add a
  plant"), so speech and sight agree (WCAG 2.5.3). Under 901 px the signs stand alone, as before.
- **Sync shows once there is something to sync:** sync set up on this device, or a record in the collection. A first
  visit sees no sync control for nothing; /sync stays in "More".
- **Labels and Settings in the bar from 1200 px**, after About. "More" keeps them and the rest; a narrower bar and the
  phone have them in "More" alone. On /labels at that width Labels is the current place and My plants is not, so one
  place is current (`MediaQuery`, 1200 px); under it My plants is lit there, as before.
- **Browse opens on the species with a habitat climate.**
  - The default order (no `sort=` in the address) is `grownc`: the species with a habitat climate first, most grown
    within each part, then the alphabet. "Most grown" alone stays as `sort=grown`.
  - The order line reads "Order: most grown, habitat climate first · most grown · A–Z · coldest record low first".
  - Where nothing is counted as grown, both are the alphabet, as most grown was.
  - /about/how#browse-own says the rule (rule 5). A pin keeps filters, not the order, so no pin changes.

## Fonts, measured (no change)

Measured in Chromium against the e2e build on 21 November 2026, at 1280 × 800, the files fetched:

| Page | Files |
| --- | --- |
| The front page (`/`) | Source Sans 3 roman 28.9 kB, Source Serif 4 italic 130.2 kB, Source Code Pro 11.7 kB |
| A catalogue address (`/?by=genus`) | the same three |
| A species page | the same three and Source Sans 3 italic 28.5 kB |

- No Latin Extended file loads on these pages: each face's unicode-range splits Latin from Latin Extended, and a page
  fetches the extended file only when a name on it needs one of its letters.
- Each face is one variable file for every weight, so no weight is a file of its own.
- Source Code Pro is fetched for the "/" key hint in the search box, set in the code face on purpose (the owner's look of
  round 87; r87c holds it). A glyph on the page needs it, so it stays.
- The serif italic is the largest file (its optical-size axis), fetched for the species names. Cutting it down is work of
  its own, not this round's.

## The record

- **New tests.**
  - r105a (unit): the default order against a species with no habitat climate and the most grown, most grown alone, the
    address round trip, and both orders with nothing counted. On a78a3d0's engine: FAILED, all four.
  - r105b (browser): no crumb on six list pages and the trail kept on two detail pages; no Sync on a first visit, Sync
    and Add's words and names on a desktop and the signs alone at 800 px; Labels and Settings at 1280 and not at 1024,
    one place current on /labels. On a78a3d0's layout: FAILED, all three.
- **Tests changed.** r63v V1 and smoke 3's visitor test read the bar's six places at 1280. Smoke 3's batch label presses
  "Label" by its exact name, not the bar's "Labels". r85u's 640 × 400 test finds no crumb on /plants. r87b and r87u read
  the new default order, and r87c a region page's species in it (Hoodia juttae, with no habitat climate, last); r74 counts
  one "My spaces" in the layout, the crumb's section names being gone. r87p and r87rec put round 105 at the top.
- **Measured again.** r76p strip 2's desktop base: "Changed lately" opens on round 105's lines, shorter than round 104's,
  so the strip sits 22 px higher at 1280 and 43 at 1024.
- **The first gate** failed on two unit tests, r74 and r87c (above). **The second:** 2,845 passed, one failed, r84a about
  1 in Firefox: the index step (`scripts/corpus-plan-r104-index.txt`, run by the owner during the gate) wrote
  `about-counts-on.json` anew ("21 November 2026") after the gate's server was built on the old day. Nothing changed.
- **The launch gate, the third run:** svelte-check 0 errors in 1,854 files, 6,428 unit tests in 714 files, 2,846 browser
  tests, every test first time in every engine.

## The deploy

- Committed as dd6265c and pushed on 21 November 2026; deployed with `node scripts/deploy.mjs` as version b23d6214 (the
  record's gate line written after the gate, so the deploy ran svelte-check and the unit tests again: 6,428 passed); the
  live check passed 23 of 23, GBIF still serving the backbone.