# Round 131: a plant's page, its foot (MYPLANTS 31, item 8)

The plant hand-off's round 31, item 8: "No longer held…" last, as a quiet link, and "Remove this plant" into the menu.
Built in the clone on 27 November 2026, during the daily run. The page's order (photographs first) and the one-line folds
with their state are the next round.

## Done

- **The foot** is one quiet line: "No longer held…" (a link-styled button, `#deacc-open`, as before) and "Died, given
  away, lost? The page stays, listed under No longer held." The row of a grey button and a red "Remove this plant" on
  every plant is gone.
- **The "···" menu** holds "No longer held…" (`#menu-deacc`, while the plant is held) and "Remove…" (`#menu-remove`)
  after the propagation lines. Remove… opens the same question at the foot as before ("Remove is for a record made by
  mistake…", "Yes, remove <number>", "Keep"), focused on its button.
- /changes.

## The sample's numbers crossed a year (found by this round's suite)

- The clone's whole suite, run after local midnight on 27 November, found the example's 2025-0003 gone: a sample plant's
  number takes the year of its acquired day, N days before today, and Lithops lesliei at 330 days crossed from 2025 into
  2026 that day, moving every 2026 number after it by one (Ariocarpus retusus at 700 days would have crossed on 2
  December). The site was right; the tests name the sample's plants by number, in some forty files.
- `src/lib/ui/grow/demo-seed.ts`: Lithops at 360 days and Ariocarpus at 725, so no sample plant crosses a year between 27
  November and 26 December and the numbers stay those the tests read, with a note on SAMPLE saying so.
- **Open, for the owner:** the lasting fix is tests that look a sample plant up by name (a helper reading
  `sampleRecords`), so no day of the year moves them; until then the next crossing is 27 December (360 days).

## Tests

- r131b (browser, 1, at phone width too): no "Remove this plant" button and no question until the menu's Remove… is
  pressed; Keep puts it away; the menu's "No longer held…" opens its form. FAILED on 9176178.
- Moved: r61l-records 5, r73p-toast 1 and 2 and smoke-2's removal press Remove through the menu; the menu helper
  (`more`, tests/e2e/helpers/smoke.ts) matches an item by its exact name, as "Move…" is inside "Remove…".
- r87p and r87rec on the new /changes lines (the strip unchanged).

## Gate and deploy

- svelte-check 0 errors in 1,925 files. The app gate for rounds 128 to 131 together, Chromium at two workers, WebKit and
  Firefox at one: 6,608 unit tests, 3,095 browser tests, every test first time in every engine, on its first run.
- Committed as 8d52011 with rounds 128 to 131 and pushed on 27 November 2026; `node scripts/deploy.mjs` deployed version
  0c62d19b on its first try, live check 24 of 24.
