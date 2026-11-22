# Round 106: the record

The species page in the grower's order, built on 21 November 2026. The plan is `docs/PLAN-106.md`, the first
hand-off's round 4.

## What changed

- **The order.** What it is (the summary, moved up from under the figures), then "At home, aim for" with the
  cultivation cards under it (the first card open), then Hardiness with the grower's place against the cold floor.
  Then the Climate section, "Where it grows wild" with Flowering, Photographs, Papers, Related, Names and registers,
  the record and its sources.
- **The section row:** What it is · At home · Hardiness · Climate · Where it grows · Photographs · Related · Names.
- **One chart for the climate.**
  - The glance table and the year strip are gone. "Habitat in short" holds the four figures, and its "Figures ›"
    goes to the Climate section.
  - The chart's **"Show in my months"** redraws it six months on for a reader in the other hemisphere, by the season
    card's own rule (`src/lib/climate/my-months.ts`). Its calendar line says whose months it shows.
  - Under the chart are the season's reading with its rule and source, the months of 25 mm or more, and which
    hemisphere is the reader's.
  - The climate class with the Walter–Lieth diagram is a closed fold beside the figures by month.
  - The °C | °F switch moved to the Climate section's head (`src/lib/ui/ref/UnitSwitch.svelte`).
- **Flowering:** under 12 observations the months are named in a sentence, with each month's count where any has more
  than one. At 12 or more, the chart.
- **Related:** in each strip, the tiles with a photograph come first.
- /about/how says the page's order, the chart's switch, the twelve as a judgment and the related order. /changes has
  round 106.

## What the plan said and the build did otherwise

- **The unit switch.** The glance row held the species page's °C | °F switch, so removing the row would have removed
  the switch. It moved to the Climate section's head.
- **"A typical spot in the range"** was a tip word only in the glance card. It is now a tip in the Climate section's
  "How", so all eleven words of round 103 still have their tip.
- **axe.** The hand-off asks that axe find no violations. axe is not among the project's packages, and package.json
  is not changed by these rounds. So r106b 5 makes the checks a reorder could break by hand, with every fold open:
  every id once, every control and image named, no heading level skipped.
- **`Glance.svelte` stays in the tree, drawn by no page.** About twenty unit tests read its source for rules that held
  of the row. Removing it and those tests is a tidy round of its own; until then it changes nothing a reader sees.

## The record

- **The rule check:** on the five fixture pages, every figure and source the page held on dd6265c is still on it
  (r106c), with or without a space before the unit.
- **The page's length** (px, `scrollHeight`, desktop at 1280 × 800 and phone at 375 × 812):

  | Page | Desktop before (live, dd6265c) | Desktop after | Phone before | Phone after |
  |---|---|---|---|---|
  | *Echeveria elegans* | 8,041 | 5,923 | 9,762 | 8,742 |
  | *Welwitschia mirabilis* | 6,269 | 5,489 | 9,225 | 8,387 |

  On the fixture, Copiapoa cinerea was 6,429 on desktop and 8,992 on a phone before.
- **New tests:**
  - r106a (unit), FAILED on dd6265c: its modules did not exist, and under 12 observations the strip drew twelve bars.
  - r106b (browser), FAILED on dd6265c: the order, the row and the switch.
  - r106c (browser): the rule check.
- **Tests changed** for the new page:
  - the order and row: r87s2 1 and 2, smoke 3's reference order;
  - "Habitat in short" in place of the glance cards: r61w, r62bw, r63c, r82u 9 and 12, r84e 2 and 6, r87l look 9,
    r87s2u, smoke 1, smoke 3 (four tests);
  - the first card open: r79f, r84e 4, r85q, the disclosure list;
  - the climate class's fold: r85e 4, the disclosure list;
  - "Where it grows": r82u 6;
  - flowering under 12: r87l-flowering;
  - "Figures ›": r85e (unit), r85e 2;
  - r74's count of a bare "places" (the hemisphere line moved into the page);
  - r62bw (unit): the gauges' line on /about/how is gone with the gauges;
  - r87p and r87rec: round 106 at the top.
- **Measured again:** r76p strip 2's desktop base. Round 106's "Changed lately" lines are 22 px shorter at 1280 and
  the same height at 1024. The second gate found Chromium's column there 7 px narrower than WebKit's and Firefox's
  (343 against 350), so the third line wrapped to three lines in Chromium alone; it was shortened ("Under 12 flowering
  records, a sentence names the months; …") to wrap in two in all three.
- **Paper:** r87s2 5 fires `beforeprint` before it emulates print, as a print does. Round 106 folded the climate class,
  and WebKit has no `::details-content`, so only the page's own `beforeprint` opens the fold there (it does, on a print).
- **r85u-products:** two of its tests read every product of a 400-species corpus; 5 s alone, they passed the default
  20 s in two of round 106's three launch gates with every unit file running at once. They have a minute, as the
  file's setup has. Nothing in round 106 touches what they test.
- **r75g range 2:** the fourth gate's one fault, in WebKit, passed on its retry: the press on a list tile was lost while
  the list settled. The helper presses again until the species page opens.
- **The slow phone** (`scratchpad` script, Playwright's Chromium as an iPhone 13, CPU 4× slower, 150 ms and 1.6 Mbit/s
  down, a cold cache, three runs each, 22 November 2026 on version 76417a2d):

  | Page | LCP | CLS | INP (a fold, the hours, the months switch) | Loaded |
  |---|---|---|---|---|
  | *Echeveria elegans* | 3.9 to 4.3 s | 0.001 | 72 to 96 ms | 11.8 to 12.2 s |
  | *Welwitschia mirabilis* | 4.3 to 4.4 s | 0.001 | 112 ms | 10.1 to 10.3 s |

  The layout holds still and the presses answer within 200 ms. The largest paint takes about four seconds on this link,
  over the 2.5 s Google calls good; no measure was taken before, so this is the base for a later round on the first
  paint (the fonts and the hero photograph), not a change round 106 made.
- **The page is shorter:** 26% on desktop and 10% on a phone for *Echeveria elegans*, 12% and 9% for *Welwitschia*.
- **The gate:** the launch gate, on the fifth run: svelte-check 0 errors in 1,859 files, 6,443 unit tests in 715 files,
  2,866 browser tests, every test first time in every engine. The four before it each failed on one thing, each fixed
  and said above: the r85u-products timeout (first and third), the "Changed lately" wrap at 1024 with WebKit's paper
  (second), r75g range 2 (fourth).

## The deploy

Committed as c92f117 and pushed on 22 November 2026; `node scripts/deploy.mjs` deployed version 76417a2d, the live check
23 of 23 (GBIF still serves the backbone).
