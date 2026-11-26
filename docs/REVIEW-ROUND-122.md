# Round 122: one home for the collection, second part (MYPLANTS 29)

The tracker hand-off's round 29, screens 8 and 9: the Spaces page in walking order, and moving several plants. Built in
the clone on 25 November 2026 after round 121, while the Commons photograph copy ran in the project.

## Done

- **The walking order.** Each space on Spaces has a handle that moves it among its siblings, by dragging (pointer
  events, so touch and mouse alike) or by the arrow keys on the focused handle, and the page says where it went
  ("Cold frame: 2 of 3 in walking order."). The order is kept as each sibling's `sort` (1, 2, 3 …, written only where it
  changes; `src/lib/core/walk-order.ts`). The collection has sorted spaces by `sort`, then name, since round fifty-eight,
  so Today, the plant list's chips and every space picker follow it with no new field.
- **Each space's row** shows three of its own plants' photographs where it has some, and what is to look at there, in
  words ("3 to look at"), beside its kind and counts as before.
- **"New space"** says that a space takes the temperature, watering and dry months of the space it is inside until it is
  given its own.
- **The move sheet.** Move to a space opens a list of spaces in walking order, one tap each, with "No space" and "+ New
  space"; the space every ticked plant is in now is shown ("where they are now") and cannot be chosen. One tap moves them
  (`movePlantsUndoable`: a log line on each, one Undo for all). The select and its "Move N" button are gone.

## Decisions

- **`sort`, not a new `order` field.** docs/PLAN-RECORD-FORMAT.md planned a field `order`; the tree has been sorted by
  `sort` since round fifty-eight, so the handle writes that. An older build reads the same field, so it shows the new order
  too. Two devices reordering at once merge per field by the greatest stamp; a tie sorts by name.
- **Press and hold a tile to select,** and the sheet's foot carrying Labels and Watered, are left: Select and its bar
  already offer both, beside the sheet. The grid and table as the defaults wait as round 121 says.

## Tests

- r122a (unit, 2): moving one sibling; the writes only where a sort changes. FAILED on aa450b2.
- r122b (browser, 2, one at phone width): the arrow keys move a space, and Today and the chips follow; the row's words;
  three plants moved with one tap, their space not offered, a log line, the plants where they went. FAILED on aa450b2.
- Moved to the sheet: r60-grow, r61a 9 (the sheet's first space focused, one tap moves), r62a (Escape closes the sheet; a
  move that empties a filtered list), r62ba.

## Gate and deploy

- Gated with round 121. svelte-check 0 errors in 1,908 files; the hybrid table made again, 523 as before.
- The app gate, five runs. The first: r76p strip 2 in Firefox and WebKit (the strip measured in Chromium alone, which
  wrapped round 122's longer line once more at 1024 px; the lines shortened, the three engines within 2 px) and r80u
  offline 2 in WebKit (193 files against 192; 198 now). The second, third and fourth each failed on one or two different
  timeouts that passed on their retries (r62bg 1, r69p P4, now 60 s, r83a 2 and smoke-1's photographs), none in a file
  these rounds touch. The fifth, with Chromium at two workers as well as WebKit and Firefox at one: 6,568 unit tests,
  3,018 browser tests, every test first time in every engine (the commit message says 6,567: the count is 6,568).
- Committed as 589c330 with round 121 and pushed on 25 November 2026. The first `node scripts/deploy.mjs` stopped at
  one unit test (search-api's rate limit, a timing test); the second deployed, live check 24 of 24.
