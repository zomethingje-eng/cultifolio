# Round 76, agent P: the front page's photograph strip on a phone, and its credits

Working copy `/tmp/claude-0/rev76/P`, branch `r76`, two commits on `r76base`:

- `6e5a767` the code;
- `a3e75ce` the tests.

Scratch files, scripts and screenshots are in `/tmp/claude-0/rev76/P-work/`. The local copy of round 72's corpus, with the twelve strip species' dossiers added, is in `/tmp/claude-0/rev76/P-s/`.

## Done

### 1. One strip, above the search, at every width (the owner's decision)

`src/routes/+page.svelte`:

- **Drawn once.** The `featured` snippet has no `where` argument now. The second copy that round 63 (V4) drew after the first three catalogue rows on a phone is gone, with `STRIP_AFTER`, the `wideonly`/`phoneonly` classes and their CSS.
- **No placeholder images.** The desktop copy's `<picture>` with the inline transparent pixel (`NO_PIXELS`) is gone. That pixel only existed so a phone would not fetch photographs for a hidden copy, and there is no hidden copy now.
- **Placement.** The one strip is rendered where a desktop always had it: between the welcome and the search. A phone's list under the search is unbroken.
- **Image loading.**
  - Every width now loads the strip as the desktop did: the first three photographs eager, the first two at high priority, the rest lazy.
  - The head's `<link rel="preload" as="image" fetchpriority="high">` for the first tile loses its `media="(min-width: 701px)"`, so it applies at every width. The first tile is on a phone's first screen again (see Measured for why).
- **Desktop unchanged.** At 1280 × 800 the first screen is pixel for pixel the same before and after, compared on the real corpus copy with photographs loaded. The test below pins the fixture's geometry, taken from r76base.

### 2. Credits whole

- **Front page strip** (`.ftile .fcred`) and **catalogue tiles** (`.tile .cred`, in an opened row and on a grower's own tiles):
  - The two-line clamp is gone. The credit is a block that wraps (`overflow-wrap: anywhere`) on as many lines as it takes.
  - The cards of a row already share one grid row, so each card takes the tallest one's height.
  - A photograph that fails to load now keeps its credit's words in place, hidden (`visibility: hidden`, `aria-hidden`), not one `&nbsp;` line. A failure therefore never shrinks a card that has three lines of credit (round 65's layout-shift point).
  - On a phone the strip's columns are `max(112px, 7rem)`. At 100% text that is the same 112 px. At 200% text they are 224 px, so a credit is a few lines rather than one word per line.
- **Names.** The species name and English name may still cut to one line with an ellipsis on a phone. Both are whole in the link's accessible name, which the test checks.
- **Species page hero** (`src/lib/ui/theme.css`, `.hero .cred`):
  - The credit wraps where it used to stop at an ellipsis. Before, the desktop gave one line, and a phone cut the author's line alone: "(c) Николай Соболев, some rights res…".
  - On a phone (`src/routes/species/[slug]/+page.svelte`, CSS only) the photograph is laid over the band (`position: absolute; inset: 0`) and the credit sits in the band's flow. The band is 150 px as before, or taller when a credit needs more room. Before, the band's `overflow: hidden` and fixed 150 px height cut a long credit.
  - A 54 px foot margin keeps the credit clear of the name card, which overlaps the band by 44 px.
  - The failed-photograph band keeps its 150 px and its credit link at the top left, as before.
- **Species page related strip** (`.reltile .rc`): the clamp is gone, as on the front page.
- **Compare** (`.head .cred`) already wrapped. I found no clipping there, and the test now pins it.
- **The species page's thumbnail strip** has no visible credit (the credit is in its `title` and `alt`), so there is nothing to clip. The Photographs section's credits are a paragraph.

### Tests

There is one new spec, `tests/e2e/r76p-strip.spec.ts`. Every test in it failed on r76base, all six runs across Chromium and the phone project (log `P-work/e2e-base-final.log`):

- **strip 1** (`@phone`, 390 × 664). On the fixture and on round 62's live-shaped page:
  - one `section.featured` in the page, not inside `.rows`, its foot at or above the search's top;
  - no `.rows .grow` between the strip and the search;
  - the search above the first row, and its foot above the tab bar;
  - no `<picture>`/`<source>` in the strip.

  On the base: "fixture: expected 1, received 2".
- **strip 2** (desktop, 1280 × 800 and 1024 × 768):
  - the strip's top and bottom, the search's top, the first row's top and the first tile's size equal r76base's values exactly (307/496/510/655 and 155 × 179; 654 at 1024);
  - the first photograph eager at high priority, and the preload present;
  - one strip in the page.

  On the base the geometry matched, but the page held two strips, so the test failed.
- **strip 3** (`@phone`). The live-shaped strip has long credits from the live corpus written into its cards (Sandy Wolkenberg, Николай Соболев, Ricard Busquets Reverte, Dilrukshan Priyantha Wijesinghe). It runs at 320, 390 and 1280 px, and at 390 and 1280 px with 200% text. For every drawn card:
  - `scrollHeight <= clientHeight` and `scrollWidth <= clientWidth`, with no line clamp or ellipsis;
  - the credit's box inside the card's box;
  - at least one credit of three lines or more;
  - all cards the same height (within 1 px).

  It also checks that the cut name "Haworthiopsis attenuata" is whole in its link's accessible name. On the base: "320 px, 100% text: 'Photo: CC BY, Sandy Wolkenberg' cut".
- **strip 4.** Runs at 320, 390 and 1280 px, and at 390 px with 200% text:
  - the catalogue's tiles in an opened row;
  - the species page hero's credit: every part whole, inside the band, and its foot not under the name card (checked with `elementFromPoint`);
  - the related strip;
  - Compare.

  On the base the first fault was a catalogue tile's credit cut at 320 px. The hero and related faults on the base are in Measured.

Tests updated, each with a comment saying why:

- **`r63v-first-screen.spec.ts`**, six phone tests. Round 63 asserted the search, every grouping control and one whole row above the tab bar, with the strip after the first row. They now assert:
  - one strip in the page, above the search, and the first row after the search;
  - the search's top above the tab bar at every size;
  - the whole search box above the tab bar at 390 × 664 and 360 × 640;
  - at 375 × 548, the search's foot at most 60 px under the tab bar.

  The owner chose the strip at the top, so the row now comes after a short scroll. The chip-click and desktop tests are unchanged and pass.
- **`r61w-pages.spec.ts`** (phone): the strip is above the search, not below the first row.
- **`r62w-pages.spec.ts`** (phone, 390 × 844):
  - selectors go from `.phoneonly` to the one strip;
  - the 200 px cap on the strip's height becomes "the photograph keeps its 112 px tile shape" plus a 240 px cap on the strip. Whole credits now set the strip's height, and the cap was about the photograph.
- **`r63fv-front.spec.ts`** test 1. "The hidden desktop strip fetches nothing on a phone" has no subject now. It becomes "one strip at every width, and the photographs it fetches are the ones it shows".
- **`smoke-3.spec.ts`**:
  - round 49's letter-W test hides `section.featured`, not `.phoneonly`;
  - round 50's first-screen test asserts the strip above the search;
  - round 50's search-mode test uses the one strip.
- **`tests/unit/r61w-words.test.ts`**: `{@render featured(false)}` before the search box.

Runs, strict (CI_STRICT, `--fail-on-flaky` per the config), Chromium and the phone project:

- the new spec's 6 tests (log `P-work/e2e-2.log`) and 94 tests in these specs (log `P-work/e2e-1.log`), all passed: `r63v-first-screen`, `r61w-pages`, `r62w-pages`, `r63fv-front`, `r62bw-pages`, `r62ba-interface`, `r67h-engines`, `r63v-visitor`, `r73p-front`, `r73p-first-visit`, `r63h-phone` and `r63c-fallbacks`;
- six tests from `smoke-3` and `smoke-1`, all passed: round 49's W, round 50's two, round 42's two, and the plant photograph hero, which uses the same credit CSS.

The whole unit suite passed once: 413 files, 3,978 tests, 8 skipped. `svelte-check --threshold error` and `tsc --noEmit` show nothing.

## Needs

- **`/about/how`, `#feature` (line 39).** This sentence is now untrue:

  > "On a phone the strip of these photographs follows the first rows of the catalogue."

  Replacement, checked against `+page.svelte`, which renders the one strip before `.stickyhead` whenever `visitor && data.featured.length && !searchMode`:

  > "The strip of these photographs sits above the search, on a phone as on a desktop."

  I left the about page alone because W's change to how the pool is chosen probably rewrites the start of the same paragraph. Please make the change at the merge.
- **For W (the featured pool as a build product).** The front page reads these fields of each `data.featured` entry: `slug`, `name`, `family`, `common`, `thumb` and `credit` (through `tileCredit`). The head's preload reads `data.featured[0].thumb`. Please keep those names. The order is the display order: the first entry is the wide, preloaded tile.
- **Files outside `+page.svelte`, for the merge to know.** I changed only CSS, nothing W said it touches:
  - `src/lib/ui/theme.css`: `.hero .cred`;
  - `src/routes/species/[slug]/+page.svelte`: the `<style>` block's `.reltile .rc` and the phone `.hero.photo` rules.

## For the owner's PC

The same specs in every engine (Safari's engine matters most for the hero band and the strip):

```
set PW_BROWSERS=webkit,firefox
set CI_STRICT=1
npx playwright test tests/e2e/r76p-strip.spec.ts tests/e2e/r63v-first-screen.spec.ts tests/e2e/r61w-pages.spec.ts tests/e2e/r62w-pages.spec.ts tests/e2e/r63fv-front.spec.ts --reporter=line
npx playwright test tests/e2e/smoke-3.spec.ts tests/e2e/smoke-1.spec.ts -g "round forty-nine: a letter near the end|round fifty: on a phone the first screen|round fifty: typing a search|round forty-two|photos: taken on the device" --reporter=line
```

After deploying, look at the live front page on the iPhone. It should show the welcome, the strip with whole credits, then the search box, with its top above the tab bar.

## Measured

**How.** I used my own script, `P-work/measure.mjs`, built on round 73's `firstvisit.cjs` and round 75's `firstvisit.mjs`:

- a local `wrangler dev` holding round 72's corpus copy (8,947 species);
- a fresh Chromium context per visit, with the service worker blocked;
- the page's link throttled to 80 ms latency and 9 Mbit/s;
- outside photographs answered after 250 ms as 240 px patterned PNGs (about 50 kB each, so kB mostly counts photographs);
- bytes are bodies plus headers, uncompressed;
- largest contentful paint (LCP) is the last candidate and its element;
- three runs per case; times are medians, with the range.

**First visit to `/`:**

| Case | Requests | kB | Photos | LCP element | LCP ms | Layout shift |
|---|---|---|---|---|---|---|
| Phone 390 × 664, before | 79 | 1,435 | 27 | welcome text (28,032 px²) | 376 (356–392) | 0 |
| Phone 390 × 664, after | 79 | 1,435 | 27 | welcome text (28,032 px²) | 372 (360–372) | 0 |
| Phone 320 × 568, before | 72 | 1,159 | 20 | welcome text (26,335 px²) | 356 (348–384) | 0.0004 |
| Phone 320 × 568, after | 72 | 1,159 | 20 | strip's first photograph (27,271 px²) | 404 (404–432) | 0.0005 |
| Desktop 1280 × 800, before | 75 | 1,278 | 23 | welcome text (33,852 px²) | 392 (376–440) | 0.001 |
| Desktop 1280 × 800, after | 75 | 1,277 | 23 | welcome text (33,852 px²) | 372 (372–404) | 0.001 |

- **Requests and bytes are unchanged.** On the base, the phone's strip at 615 px was lazy, but within Chromium's lazy-load distance, so the same photographs were fetched. What changes is the order and priority:
  - before, a phone fetched all its first photographs at Low;
  - after, the strip's first two are High and the third Medium, as on a desktop.
- **The preload, measured both ways at 320 px.** The strip's first photograph becomes the phone's LCP there.
  - With the preload at every width (chosen): 404 ms (404–432).
  - With the preload kept to wide screens: 412 ms (392–420).

  This is the same within noise locally: the 16 kB HTML names the image early anyway. I kept the preload at every width because the first tile is now on every first screen. It adds no request, since the image is eager regardless, and it starts that fetch with the head, which on a slow phone link comes before the body.
- **Layout shift on load.** Unchanged. The only shift is a 0.0004 to 0.0005 on a 320 px phone from an SVG in the head (`svelte-12qhfyh`), present before and after. The strip is in the server's HTML with sized images, so nothing moves on hydration. At 200% text: 0.0054 (phone) and 0.0141 (desktop), the same before and after.

**Where things sit**, real corpus copy, welcome shown, in pixels from the top of the viewport:

| Phone | Strip | Search | Chips' foot | First row | Tab bar |
|---|---|---|---|---|---|
| 390 × 664, before | 615–823 | 237–282 | | 399–463 | 607 |
| 390 × 664, after | 239–465 | 475–519 | 572 | 636 | 607 |
| 375 × 548, after | 239–465 | 475–519 | 572 | 636 | 491 |
| 360 × 640, after | 259–484 | 494–539 | 592 | 656 | 583 |
| 320 × 568, after | 277–503 | 513–558 | 611 | 675 | 511 |

- **390 × 664, before:** the strip was entirely under the tab bar.
- **The search is reached quickly.** The whole search box is on the first screen on the owner's iPhone and at 360 × 640.
- **Smaller phones.** On an iPhone SE (375 × 548) and at 320 × 568 the box's top is on the first screen and its foot is under the tab bar:
  - by 28 px at the SE with the welcome shown (37 px with it dismissed);
  - by 35 to 47 px at 320 px.
- **The first catalogue row** is no longer on a phone's first screen. That is the owner's trade.

**Credits in the strip.** On the base, the cards whose credit was cut:

- at 320 and 390 px: 4 of 12, the credits for Sandy Wolkenberg, Николай Соболев, Oleksandr Shynder and Ricard Busquets Reverte, as the owner saw;
- at 390 px with 200% text: 9 of 12;
- at the desktop with 200% text: 4 of 6;
- at the desktop at 100%: none.

After: none at any of these. A phone's card is 198 px tall before and 215 px after (three-line credits). The desktop card is 212 px, unchanged at 100%.

**Species page** (`P-work/heroshot.mjs`):

- **Iris ensata's hero at 390 px.** Before: the author's line held 485 px of text in a 316 px box, cut. After: two lines, whole; the band stays 150 px.
- **At 200% text.** Before: 969 px of text in 316 px, cut. After: four lines plus the licence, whole; the band grows to about 222 px and the credit's foot is clear of the name card.
- **Desktop.** The credit now wraps to two lines, 376 px wide.
- **Related tiles.** Cut before: 1 at 100% (村山史世 (Fumiyo MURAYAMA)) and 12 at 200%. None after.

**Screenshots, in words** (`P-work/shot-*.png`, `strip-*.png`, `tiles-*.png`, `hero-*.png`):

- **Before, 390 × 664.** "Cultifolio", the count line, the welcome paragraph, the search box, the Genus/Origin/Family switch and the chips, the letter index, then three rows (Abelia, Abelmoschus, Abutilon), and the tab bar. No photograph on the first screen. Scrolled down, the strip sits under Abutilon.
- **Before, the strip's cards.** "Ficus rubigino…" with "Photo: CC0". "Rhododendro…" with "Photo: CC BY, Sandy…", the top half of "Wolkenberg" showing under it, cut by the card's edge. "Iris ensata" with "Photo: CC BY, Николай…" cut the same way. At 200% text every credit reads "Photo: CC BY,…".
- **After, 390 × 664.** The same head and welcome, then the strip: Acer monspessulanum's wide card ("Montpellier maple", "Photo: CC BY, Golfopolikayak") and Ficus rubiginosa's beside it, both the same height. Then the search box and the chips; the letter index meets the tab bar.
- **After, the strip's cards.** "Photo: CC BY, / Sandy / Wolkenberg" and "Photo: CC BY, / Николай / Соболев" whole on three lines, every card one height. At 200% text the cards are twice as wide and the credits read "Photo: CC BY, Sandy / Wolkenberg".
- **After, the species hero at 390 px and 200% text.** The dark credit box at the top right holds "CC BY", then "(c) Николай Соболев, some rights reserved (CC BY) · observed growing wild · 2020-07-24" on four lines. The band has grown to fit, and the name card starts below the credit.
- **Desktop.** 1280 × 800 before and after are identical, pixel for pixel.

## Not done, with why

- **Other engines.** WebKit and Firefox are not in this workspace. The phone hero band's new layout (an absolute photograph under an in-flow credit) is the part most worth seeing in Safari's engine; the commands above run it.
- **The search's foot on the smallest phones.** It is 28 to 47 px under the tab bar on the iPhone SE and at 320 px. Bringing it up would mean a shorter strip (smaller photographs, or credits on fewer lines) or a shorter welcome. That is a design choice for the owner, not part of this brief. The r63v tests allow 60 px there and say so.
- **Wider species pages.** At 641 to 859 px and at 860 px and above, the species hero's credit is still laid over the photograph. It wraps now, and I found no case where it outgrew the band. At 200% text with a very long credit it could cover more of the photograph than before, but it is never cut.
- **Author names past 40 characters.** `TILE_AUTHOR_MAX` still shortens them to 40 characters with an ellipsis when the index is built. That is the index's own rule, the full credit is on the species page, and none of the owner's examples reached it.
- **`/about/how`.** Not edited: see Needs.
