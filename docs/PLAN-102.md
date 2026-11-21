# Round 102: the home page leads with what the site is

20 November 2026. Round 1 of the launch review's hand-off (the owner's review of 20 November, the mock-ups of 21 November),
planned against the code. The hand-off folder is not in the repo and is not named in a commit.

## 1. What the hand-off says that does not hold against the code

1. **The day's figure is not a rain figure.** The mock's proof block reads "*Welwitschia mirabilis* grows wild on 80 mm of
   rain a year", with a CHELSA "From" row. The lead rule (`lead-figure.ts`, `leadOf`), which the hand-off keeps, gives
   the coldest night on record where the plant grows wild: NASA POWER's lowest daily minimum at a typical record's cell,
   with the trail rows Records, From (the GBIF download and its day), Temperatures (NASA POWER, the years, the place, the
   lapse correction) and Counted only. The round keeps the rule and its rows; the mock's rows are not copied.
2. **The sunflower mark already covers only the number and its unit.** `.leadfig` wraps `temp(...)` alone ("−3.2 °C").
   Nothing to change; a test holds it.
3. **The home route is four pages, not one.** `src/routes/+page.svelte` is (a) the visitor's front page with the lead,
   (b) a grower's own list (You grow, Following, pinned views) once the device holds plants, (c) the search results,
   `/?q=`, where the header search's "Every species matching…" row and its no-script form land, and (d) the catalogue,
   `/?by=…&open=…&chip=…&from=…`. The hand-off describes (a) and the removal of (d). (b) and (c) are kept as they are.
4. **The catalogue's addresses run deeper than bookmarks.**
   - The sitemap lists `/?by=genus&open=<genus>` for every genus (`src/lib/server/sitemap.ts`), about 3,756 addresses
     search engines hold.
   - `/species/<a genus>` redirects there (`species/[slug]/+page.server.ts`); the species page links its family and genus
     there in four places.
   - The Worker's page cache keys the front page by its query (`hooks.server.ts`, `homeQuery`).
   - 25 browser test files drive the catalogue on `/`.

   The browse pages of round 87 already cover most of its views (`/genus/<slug>`, `/family/<slug>`, `/region/<slug>`,
   `/browse?climate=…&grown=…`), but not all one to one: the origin grouping's ids, the "No climate" chip's not-checked and
   not-asked counts, the letter index, and a grower's "Your species / All" switch. **Decision for this round:** the bare
   `/` drops the catalogue; any catalogue parameter renders it as today, so every address, the sitemap, the page cache and
   the tests hold unchanged. Moving the links and the sitemap to the browse pages, with 301s from `/?by=`, is a later
   round, once each view is shown equal. That is the hand-off's second option, and the one that fits a day.
5. **One search box per screen already holds on `/`.** The header hides its box on the front page (`ownSearch` in
   `+layout.svelte`). The large box is the header's own component (`SiteSearch`) in a large form; its "Every species
   matching…" row keeps opening `/?q=`.
6. **Place search is partly there.** `SiteSearch` already suggests regions and countries beside species (`/api/suggest`).
   The "Try" links can include a region now, as a link to its region page, not a typed search: "plants native to
   Namibia" goes to `/region/namibia`. Whether typing "mexico" offers Mexico first is round 3's.
7. **The strip already follows the most-grown rule** (`featuredPoolOf` with the popular genera), and the lead takes the
   day's first three of it. The Ficus carica tile does show a bird eating figs (iNaturalist photo 428867887, checked 20
   November). But "fix it in the rule, for example prefer the cultivated or leading photograph" cannot work: the tile is
   already the page's lead photograph by rule (`heroOf`: wild before captive, an observation's first photograph,
   landscape, at least 640 px), and nothing in the record says what a photograph shows (rule 3). One rule that can help:
   for the strip only, prefer a Commons photograph that passes `photo-kind`'s test (its categories are the species'),
   where the page holds one. Measured first on the 48 species of the pool, then put to the owner; until then the strip
   is as it is.
8. **The pitch's words, against /about.**
   - "No account, no tracking, no analytics and no advertising" and "sync, which encrypts them" are /about's. Hold.
   - "Cited to the file and the day" is not; /about says "a named source, and the day it was read". Use that.
   - "Sourced, not written": the mock's "No care sheet is written for a page by a person or by AI… by a published rule"
     is not /about's sentence. Use /about's: "No text about a species is generated… a quotation, a figure with its
     source, or a template filled in by a fixed rule".
   - "Open source under the AGPL" is true of the app only; the tooling is MIT. Say "the app is open source (GNU AGPL 3.0)".
9. **"Changed lately".** `src/lib/changes/rounds.ts` lines are already meant for a reader, but long. Each round gets a
   `reader` line (one plain sentence); the front page shows the latest three, /changes keeps every line. Rounds 100 and
   101 have no entry: the test r87p holds every entry to a `docs/REVIEW-ROUND-<n>.md`, and they kept PLAN files. Round
   100's /backup fix is a reader's change; it gets an entry with a REVIEW-ROUND-100.md that points to PLAN-100. Round 102
   writes REVIEW-ROUND-102.md.
10. **/about/how describes the front page** (its "Popular genera" lines, "the front page's catalogue is the same on every
    device", the photographs and the lead, lines 501 to 520). Rewritten to say what the front page now holds (rule 5).

## 2. The change

The bare `/`, to a visitor (no plants on the device), top to bottom:

1. The pitch: kicker "A plant reference"; H1 "{total} species, and every figure says where it came from."; one paragraph
   from /about's own sentences, every count read from the index (`data.total`, `data.withClimate`).
2. The large search box (`SiteSearch`, large), and a "Try" line: a species, a common name, a genus page, a region page,
   each checked to land on a good page (a test opens each).
3. The lead, as today's rule and trail, retitled as the proof ("Today's figure, and where it came from"); its H1 becomes
   an H2. The photograph beside it on a desktop, under it on a phone. The `leadwhat` sentence and the facts line go: the
   pitch says it.
4. Three short columns, each sentence /about's.
5. Browse with its counts, and "All {total} species →" (to `/browse`), beside "Changed lately" with the latest three
   `reader` lines and "Every change, round by round →".
6. The strip, six tiles, by the rule as now.
7. The tracker invitation, in place of the welcome card and the quiet line: "Add your first plant" and "See an example",
   the same actions they hold today.
8. No catalogue, no second search box, no letters.

A grower's `/` and every address with a query are unchanged.

## 3. Tests

- At 1280×800 and 390×844, the H1 and the search box are in the first screen; one search box in view.
- The H1's and the paragraph's counts equal the index's (`data.total`, `data.withClimate`).
- Each sentence of the pitch and the three columns is found on /about (read from the page source, as r87p reads /changes).
- Every `/?by=`, `/?q=`, `/?open=`, `/?at=` form still reaches the catalogue or the results; the sitemap's genus addresses
  answer 200 with the opened group.
- The lead's mark covers only the number and its unit.
- Each "Try" link answers 200 and is not a no-result search.
- axe finds no violations on `/` in both modes.
- The existing 25 catalogue test files pass unchanged.
- /about/how's front-page lines read against the page.

Gate: `--tier=app` (every engine), with svelte-check before the commit (`--tier=launch`).

## 4. Measured, then put to the owner (not built in this round)

- The strip's photograph rule (1.7): of the 48 pool species, how many hold a Commons photograph that passes `photo-kind`,
  and the six tiles it would give today.
