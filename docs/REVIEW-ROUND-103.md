# Round 103: the record

The top of the species page, built on 21 November 2026. Round 103's plan is `docs/PLAN-103.md` (round 2 of the launch
review's hand-off, planned against the code); this is its record.

## What changed

- **The habitat in short at every width.** `HabitatLine.svelte` was hidden from 641 px on the grounds that the glance
  cards were on a desktop's first screen; on cultifolio.com they began at y 753 at 1024 × 768, 1280 × 800 and 1440 × 900.
  It now shows at every width, in the name card after the primary action: on a phone as before, on a wider screen four
  figures in a row, each large over its line and its source, and under them "The wild habitat's figures, from N records in
  M grid cells · How". Measured on the fixture's Copiapoa cinerea: the strip at y 429 to 563 at 1280 × 800 and 1024 × 768.
- **No habitat climate said at the top, with why.** A page with none says "No habitat climate." and the Climate section's
  own reason ("None can be derived: …"); a pending one "Habitat climate pending. It has not been derived yet; this is not a
  refusal." Their pills at the top are gone, said once in the strip. A refused climate keeps its one not-checked mark in
  the head with its reason on a tap, as before; a page whose records were not asked says so once, under the name.
- **Words explained in place.** `src/lib/ui/ref/terms.ts` holds eleven words, each with the tip a species page opens:
  cold floor, DLI, cell, the 10th to 90th percentile span (across the range), a typical spot, the USDA zone, the RHS band,
  the Köppen–Geiger class, the Walter–Lieth diagram, research grade and the CITES Appendices. `Term.svelte` makes a word a
  button: a press, Enter or Space opens its tip, Escape or a press elsewhere closes it, a resting mouse previews it; the
  tip is a status region, empty until opened, named by `aria-describedby` while open, and ends "More", a link to the
  word's glossary entry. Placed in the strip, the glance cards, Hardiness, the Köppen card, the Walter–Lieth reading, the
  climate notes, the flowering line and the CITES line.
- **The glossary on /about/how** stays written there (fourteen tests read its entries from the source). Each tip word's
  entry has an anchor (`#term-…`), and six entries are new. A test holds each tip to its entry's first words exactly. The
  USDA, RHS, iNaturalist and Köppen–Geiger entries quote their publishers, linked, read 21 November 2026. /about says the
  glossary was written for this site with Claude.
- **A descriptive title on every page.** `speciesTitle` adds to the names the first true description that fits in 60
  characters, or the shortest where none fits. On the live index: all 48,375 pages described (10,368 had only their name),
  44,404 within 60 characters, 3,971 longer where the names and the shortest description together pass it.
- /about/how's figures-at-the-top rules say the strip, the tips and the titles; /changes has round 103's entry.

## What the plan said and the build did otherwise

- **CITES's words are not quoted.** cites.org refused an automated reader on 21 November 2026 (a Cloudflare check, the
  Convention's text and the Appendices page both). The CITES tip says what the page does (a listing as CITES publishes
  it, never what it requires) and links to the Convention's text; it quotes nothing. The owner can paste Article II's
  text from a browser for a later round.
- **Walter–Lieth's tip is the diagram's own description**, from the page's code (10 °C to 20 mm, over 100 mm at a tenth,
  arid where the rain curve is under the temperature curve): no primary text of Walter and Lieth's was found online.
- **The glossary is not drawn from the module** (the plan's 5): its entries are read by fourteen older tests from the
  source; the test holding tip and entry together does the same work.
- **The season, not the warmest month.** The hand-off's four figures name the warmest month; the phone's strip, which it
  calls the right one, shows the season (the owner's decision of round 84). Desktop shows the same four.
- **/about/how's visible words** rose past the 6,000 the summary test allowed (6,320): the cap is 6,500, as the glossary's
  entries are what the tips link to, and a folded entry would be a link to nothing the reader sees.
- **A tip's words are not in the page until opened.** A hidden tip's text would have been in every reading of the line
  (a search engine's, a copy, a test's); the region is empty until a press.

## The record

- **New tests.**
  - r103a: the title rule, and on the live index every page described.
  - r103b: each tip held to its glossary entry, the anchors, and the toggletip's markup.
  - r103c: the strip's figures, its source line and its no-climate forms.
  - r103d: in the browser, the strip on a desktop's first screen at three sizes; the pending form; a tip by keyboard and
    by a tap on a phone; the tips a page holds; the titles.
- **Tests changed for the new markup.** r60x (two titles); r61w, r87v and r92a read a tip's word as the word; r85a's
  cap; r84e 3 (the strip shown on a desktop too); r87p and r87rec (round 103 at the top of /changes).
- **r76p strip 2's desktop base measured again at 1024.** Round 103's "Changed lately" lines wrap a line fewer there,
  so everything under them is 21 px higher. The first launch gate failed on it alone, in the three desktop engines
  (stripTop 1114 for 1135); 1280 unchanged.
- **The launch gate, 21 November 2026, on its second run:**
  - svelte-check: 0 errors and 0 warnings in 1,848 files.
  - Unit tests: 6,401 in 712 files (11 skipped, as before).
  - Browser tests: 2,807, every test passing first time in every engine.
  - It wrote no stamp, because another session wrote files into the untracked hand-off folder while it ran. The code
    did not change, and `node scripts/deploy.mjs` runs everything again.
- **The live-check fix of round 102's deploy** (`scripts/live-check.mjs` reads the count from the H1) and round 102's
  deploy record ship in this commit.
