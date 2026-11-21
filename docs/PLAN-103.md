# Round 103: the top of the species page (plan)

Round 2 of the launch review's hand-off (20 November 2026), planned against the code on 21 November 2026 (main at
f7f2867, round 102 live as version 181d6b46). Three parts: the habitat in short on a desktop, a one-line explanation of the
page's terms, and a descriptive title on every species page. Measured on cultifolio.com and in the index
(`static/s/v3/index.json`, 48,375 pages: climate ok 38,007, none 10,104, pending 264).

## What does not hold, or holds differently

1. **The strip is missing on a desktop, and the code says otherwise.** `HabitatLine.svelte` hides itself from 641 px on
   the grounds that "on a wider screen the cards are on the first screen". Measured live, the glance cards begin at y 753
   at 1024 × 768, 1280 × 800 and 1440 × 900: below the first screen at 1024 × 768 and only their top line above it at the
   other two. The hand-off holds; the comment goes.
2. **One source line under the strip drops a source.** The mock's "The wild habitat's figures, from 521 well-placed
   records · how" names no source, and the four figures have two: the cold floor is NASA POWER's, the rest CHELSA's. Each
   figure keeps its source, as the phone's strip has it (rule 1). The line under the strip says the records and cells it
   is read from in the page's own words ("from N records in M cells", the counts the climate section uses), with "How"
   to /about/how#climate. "Well-placed" is not a term the page defines and is not used.
3. **The fallback is already there.** Where no cold floor is read, the phone's strip shows "Coldest month, mean nightly
   low, not a floor" (CHELSA). Desktop takes the same rule.
4. **A page with no habitat climate says so, and why, in the strip.** Today the top of such a page has only a "No habitat
   climate" pill; the reason is in the Climate section (Lithops lesliei: "69 in-range records at 66 places, none placed to
   within 10 km by the climate's rule"). The strip's no-climate form gives the state and that reason in one line, with a
   link to it. Pending and refused say pending and not checked (rule 2), never "none". 10,368 pages take this form; round
   5 of the hand-off (a climate for plants whose locations are blurred) is what would shrink it.
5. **A glossary exists.** /about/how#glossary already defines about 40 words in a hand-written list, among them Cold
   floor, DLI, Cell, Across the range (the 10th to 90th percentile span) and A typical spot in the range. Not there:
   USDA zone, RHS band, Köppen class, Walter–Lieth diagram, research grade, the CITES Appendices, and habitat cell under
   that name (the glossary says "Cell"). The one source of the words becomes a module (`src/lib/ui/ref/terms.ts`); the
   glossary on /about/how is drawn from it, so the tips and the glossary cannot differ, and each term keeps an anchor
   (`#term-dli` and so on) the tip links to.
6. **The mock's DLI tip says more than the figure.** "A plant indoors receives a fraction of them" is a claim about the
   reader's room. The glossary's own definition stands: "the light a day delivers ... says nothing of the shade a plant
   grows in", shortened for the tip.
7. **CITES's words are CITES's.** The mock's "Appendix II means international trade needs an export permit" is a reading.
   The tip quotes the Convention's own Article II, which defines each Appendix, linked to the Convention's text on
   cites.org, the wording checked against that page when the round is built. No legal advice, as `CitesLine` says now.
   Likewise each scale's tip is its publisher's: the USDA zone as USDA's map defines it (the average annual extreme
   minimum temperature), the RHS rating as the RHS publishes it (the page already quotes "H2: tender, cool or frost-free
   glasshouse"), research grade as iNaturalist's help defines it, each linked.
8. **"Who wrote it" on /about.** The definitions are not about any species, so they do not touch "nothing about a species
   is written by a person or by AI". /about says the glossary exists and that its words were written for this site, the
   scales' and CITES's quoted from their publishers. How to name the writer is the owner's (see the end).
9. **The title's cause is as the hand-off guessed, and it is two problems.** `speciesTitle` (src/lib/ui/ref/head.ts)
   returns the bare name when the page has no climate: 10,368 pages, Lithops lesliei among them. And the descriptive form
   is long: by the index, about 23,900 titles run past 60 characters before " · Cultifolio" (Echeveria elegans 73).
10. **"Lithops lesliei (living stones)" is not ours to write.** Lithops lesliei has no English name in the sources this
    page reads; "living stones" is said of the genus. A title takes only the names the page holds (rule 3):
    "Lithops lesliei: native range and photographs".
11. **axe** is not a dependency (adding it changes `package.json`), as in round 102. The browser tests check what axe
    would here: each term a focusable control with a name, `aria-describedby` to its tip, Escape closes it, nothing on
    hover alone (WCAG 1.4.13).

## The change

### a) The habitat in short on a desktop

- `HabitatLine.svelte` shows at every width. On a phone it stays as it is (two columns, small figures; r62w and r63v hold
  its first screen). From 641 px: four columns, each figure large with its short line and its source under it, in the
  name card after the primary action, before the secondary ones, as on the phone.
- Below the strip, one line: "From {records} records in {cells} cells · How". The few-records mark stays where it is.
- Its no-climate form (new): "No habitat climate: {the reason, from the Climate section's sentence}. Not a statement that
  none exists." with a link to `#s-climate`; "Climate pending" and the not-checked form for pending and refused.
- The glance cards stay where they are, with their explanations (they hold more than the strip).

### b) The terms explained

- `src/lib/ui/ref/terms.ts`: each term with a short line (the tip), the full definition (the glossary's), its anchor and,
  where quoted, its source and link. The /about/how glossary renders from it; its existing entries keep their words.
- `Term.svelte`: a toggletip. The term is a `<button>` with `aria-describedby` and `aria-expanded`; a press, Enter or
  Space opens the tip, Escape and a press outside close it; hover only previews what a press opens. The tip ends "More"
  linking to `/about/how#term-…`.
- Used on the species page where each term first appears: the strip and the glance cards (cold floor, DLI), the hardiness
  card (USDA zone, RHS band), the Köppen card, the Walter–Lieth diagram, the climate notes (habitat cell, 10th to 90th
  percentile, typical spot), the photographs (research grade) and the CITES line.

### c) A descriptive title on every page

`speciesTitle` takes the name and the common name (when the page holds one and it is not the genus again), then the
first of these parts that is true of the page and fits within 60 characters:

- with a habitat climate: "habitat rain, cold nights and light" (each part only where the page has it, as now), then
  "habitat climate and photographs", then "habitat climate";
- without one: "native range and photographs", then "native range", then "photographs".

Where none fits, the shortest true part is added anyway: a search result cuts the end of a title, and what it cuts is then
the description, never the name. The scientific and common names are never cut. Modelled on the index: every page gets
a descriptive part, and all but about 4,000 (long names with long common names) are within 60 characters. `og:title`
follows the title, as now.

### Rule 5

/about/how: the strip is said to show at every width; the glossary's head says the tips read it; /about says the glossary
exists and who wrote it. /changes: round 103's entry and reader line.

## The tests

- `tests/unit/r103a-title.test.ts`: the title for pages with and without a climate, with and without a common name, with
  a common name that is the genus; within 60 characters where a part fits; a part always added; the names never cut; on
  the index, no page's title is the bare name. r60x's title expectations move with the rule.
- `tests/unit/r103b-terms.test.ts`: every term has a tip, a definition and an anchor that /about/how renders; the glossary
  on /about/how is drawn from the module (no entry typed twice); CITES's tip is the Convention's words with its link.
- `tests/e2e/r103c-top.spec.ts`: at 1024 × 768, 1280 × 800 and 1440 × 900 the strip is on the first screen with four
  figures, each with its source; a fixture page with no habitat climate (one added to the fixture corpus if it holds none) shows the state
  and its reason, no blank cells; the phone's first screen as r62w and r63v hold it.
- `tests/e2e/r103d-terms.spec.ts` in every engine: Tab reaches each term, Enter opens its tip and it is named by
  `aria-describedby`, Escape closes it, a tap opens it on a phone, its "More" link lands on its glossary entry.
- On f7f2867, r103a, r103c and r103d fail (the bare name; the strip hidden at 1024 px; no terms).

## The gate

`node scripts/predeploy.mjs --tier=launch` from PowerShell (the app and the about pages change), never while
`corpus-step.lock` is held. The live-check fix from round 102's deploy (`scripts/live-check.mjs`) and that deploy's record
are committed with this round.

## For the owner

- How /about names the glossary's writer: "written for this site" alone, or naming the site's maker and that an AI
  assistant drafted the definitions. The recommendation is to say both: it is true, and the site's rule is about species
  text, which this is not.
