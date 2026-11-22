# Round 107: the record

The tracker's payoff, built on 22 November 2026. The plan is `docs/PLAN-107.md`, the first hand-off's round 7.

## What changed

- **The payoff.** One plant added from the add form opens its page with "Your plant against its habitat" at the top:
  one comparison, two figures, each named with its source, no advice (`src/lib/ui/grow/payoff.ts`,
  `AddedPayoff.svelte`). In order, the first the records hold:
  - the space's floor against the habitat's cold floor (NASA POWER);
  - the floor against the coldest month's mean nightly low (CHELSA);
  - the space's light against the open sky over the habitat (CHELSA).
  A plant with no space is asked for one there; a space with neither figure, for its floor, saved to the space. The card
  shows on the visit the save opened (the router's page state), not on a reload or from the address, until Close.
- **Today with no plants:** "No growing plants yet." and one button, "Add your first plant" ("Add a plant" where the
  collection holds plants none of which grows).
- **The frost watch's location.** Before the browser is asked, one sentence says why: the forecast for your nights,
  kept on this device, only its position rounded to about a kilometre sent to MET Norway, through this site. A town can
  be typed instead, on Today and in Settings: `/api/place` asks OpenStreetMap's Nominatim from the server, on a press,
  never as one types, five places to choose from, credited under the ODbL; answers kept a week in the Worker's cache;
  30 calls a minute for the whole site (Nominatim's one a second). The front page's line no longer asks for the location
  itself: it goes to Today, where the reason is said.
- **The backup line:** once, at the tenth plant (the fifth before), with no backup and no sync; "Not now" puts it away
  on this device for good (`cultifolio.backupNudgeDone`), not only for the tab.
- /about/how says the payoff, the line, the town search, its host and share, and the reason; /changes has round 107.

## The record

- Tests: r107a (unit, 14: the payoff's four kinds and its words, the line at ten and "Not now" on the device, the town
  query, Nominatim's address, the answer read, the credit, the reason) and r107b (browser, three: the payoff with a
  space's floor and no card on a reload; no space, then a floor, then Close; Today empty and a town typed becoming the
  site, at phone width), every one FAILED on c92f117.
- Tests that read the old words or counts: r62ba (the reason before "No site set." and the town), r62w and r70p (the
  place route's cache put, a week), r74 (the town search's "place" is a geographic place, listed), r82d and r84u (the
  backup line at ten plants), r87p and r87rec (round 107 at the top), r87s2u 2 given 90 s.
- The card's buttons are "Use this space" and "Use this floor" (Playwright's name "Save" matched them on the plant
  page); the reason's line is its own class (`whyline`), not the frost strip's.
- r76p strip 2's desktop base measured again (round 107's "Changed lately" lines): 1280 {1047, 1251, 1265, 1406}, 1024
  {1070, 1262, 1276, 1417}, WebKit and Firefox within 2 px.
- The launch gate: svelte-check 0 errors in 1,867 files, 6,461 unit tests in 716 files (11 skipped), 2,877 browser tests
  (25 skipped), every test first time in every engine, on the first full run.

## The deploy

- 191e13e pushed and deployed on 22 November 2026 with `node scripts/deploy.mjs` (svelte-check 0 errors in 1,867 files,
  the record's edit after the gate having moved the stamp; the unit tests left out as the stamp allows) as version
  679418f6; the live check passed, 23 of 23, GBIF still serving the backbone.
