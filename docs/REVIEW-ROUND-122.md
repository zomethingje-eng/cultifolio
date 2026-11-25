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

(Written at the gate.)
