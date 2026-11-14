# Round 91: the new icon, and the icon's colours on the site

From the owner's design sessions of 14 November 2026: their handoff (icon files, mocks of the header, the front page in
both modes, a phone and the link-preview card) was read and built on 14 November 2026. The handoff folder is not kept in
the repository; what it held is here and in the files named below.

## What changed

1. **The icon.** `static/app/favicon.svg` (a rounded tile, since browsers do not mask favicons), `icon-192.png`,
   `icon-512.png`, `icon-maskable-512.png` (the figure inside the 80% safe zone, the shadow running to the edge) and a new
   `apple-touch-icon.png` (180 px), linked from `src/app.html` in place of the 192 px icon. `manifest.webmanifest` names
   each PNG with its size, the two standard icons `purpose: "any"` and the maskable one `"maskable"`. The sources,
   `cultifolio-icon-master.svg` (1024, full bleed), `icon-maskable-master.svg` and `icon-1024.png`, are kept in
   `docs/icon/`, not served. The 32 and 64 px raster favicons were not taken: nothing asks for one.
2. **Content Credentials.** Every handoff file carried a C2PA manifest (a `caBX` chunk in each PNG, a `<metadata>` block
   in each SVG) signed by Anthropic: "Claude provided this file at the request of a user and may have created or modified
   the file contents". As round 84 did for the icons before these (the console error, the weight; `r84u-icons`), the
   served copies carry none: the PNGs keep their header and pixel data byte for byte, less the `caBX` chunk and a `bKGD`
   chunk; the SVG is its drawing alone (22,541 bytes to 14,766). The masters in `docs/icon/` keep their manifests, so the
   provenance stays on record. The site says on /about that it is built with Claude.
3. **The mark in the header**, inline beside the wordmark: `fill="currentColor"`, `aria-hidden="true"` (the wordmark's
   text is the link's name), 22 px tall, 8 px before the name, on desktop and phone (`src/routes/+layout.svelte`).
4. **Selected text in sunflower**, `::selection { background: #ffd02e; color: #1b1d1c; }` in both modes (the browser's
   blue before) (`src/lib/ui/theme.css`).
5. **The front page's lead figure marked in sunflower**, the number and its unit only (`.leadfig`): on white a
   highlighter stroke behind it, on the dark ground a 5 px sunflower underline 8 px below (a fill looked muddy there). Two
   tokens, `--lead-mark` and `--lead-line`, are set for the light theme, the dark theme by the system and by the site's
   own switch, and paper (the light theme's, as every colour on paper is). Decoration only: the figure says itself in
   words. Sunflower is never text, a line or a focus ring on white (about 1.4:1): only a ground behind ink, or a mark on
   the dark ground.
6. **The link-preview card** (`static/app/og.png`, 1200 × 630) in the site's own look, as the owner's mock: white, the
   icon's tile at left, "Cultifolio" in Source Sans 3 semibold, "A reference for the plants people grow" in Source Serif 4
   italic, a thin rule, three lines in the muted ink, a sunflower bar along the foot. Drawn by `scripts/dev/og.mjs` from
   `scripts/dev/og.html` with the site's own font files and icon.
7. **A /changes line** for readers: "A new icon, a plant growing from an open book, and the site's mark beside its name",
   and a second on the sunflower, since a round there has two lines at least.

What did not change: the site's colours (the green links, `--link` #1d5c45, the accent, the warm and cool colours, the
dark palette), `theme-color` (white and #141615, matching the page; the manifest's `theme_color` as it was) and the type
(Source Sans 3, Source Serif 4, Source Code Pro).

## The card's words, checked against /about before it was drawn

The mock's words were a draft. Each claim on the card, against what the about pages say:

- "A reference for the plants people grow": the site's own title and description.
- "48,375 species": the index's count (`static/s/v3/index.json`, the corpus the site serves), as the front page says it.
- "every figure with its source": /about, "Every figure has a source and a date".
- "No account", "open source": /about, "There is no account, …", "Cultifolio is open source".
- **Not as drafted:** the mock's "your plants stay on your device" alone is not true once sync is on. /about says they
  stay on the device unless you turn on sync, which encrypts them first; /about/how, "Your plants stay on your device, or
  sync encrypted if you choose". The card says "Your plants stay on your device, or sync encrypted", on a third line
  (the mock's two lines could not hold it at the mock's size).

The count is a figure an image does not update (round 63 kept the card free of figures for that reason). So `og.mjs`
draws the index's count and refuses when `OG_ALT` (`src/lib/ui/ref/head.ts`, the card's alt, which says its words) names
another, and `scripts/live-check.mjs`, after every deploy and upload, fails when the live front page's count is not the
card's alt's, naming what to do: set `OG_ALT`'s count, draw the card again, deploy.

## Tests

- `tests/unit/r91a-icons.test.ts`: the manifest's icons exist at their sizes with their purposes, "any" and "maskable"
  apart; the apple-touch icon is a 180 px PNG; no served icon carries C2PA, the masters do.
- `tests/e2e/r91b-sunflower.spec.ts`: the header's mark is there, hidden from assistive technology, 22 px tall and 8 px
  before the name, in the text's colour in both modes, on desktop and phone; selected text is ink on sunflower in both
  modes; the lead figure's stroke on white and line on the dark ground, and no sunflower on a species page; the
  apple-touch icon linked and served.
- `tests/unit/r90e-og-faces.test.ts` and `r74-growers` hold the card's faces and words; `r84u-icons` the favicon's size;
  `r87rec-changes` round 91 newest on /changes; `r76p strip 2` the front page's new place for the strip ("Changed lately"
  now opens with round 91's two lines).

## The record

- 14 November 2026: built and tested. The first predeploy (`--tier=app`, 21:51 to 22:43 UTC) passed every unit test
  (6,233) and failed three browser tests in every engine: r87rec 1 and 2 and r87p 3 held round 87 as the newest on
  /changes, as their unit twins had, which were updated and these not. Now they hold round 91 first and round 87 after
  it (50 passed in every engine). One Firefox test (smoke-1, the bench path) passed only on its retry; not this round's.
