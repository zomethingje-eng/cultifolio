# Round 121: one home for the collection, first part (MYPLANTS 29)

The tracker hand-off's round 29 (myplants-handoff/MYPLANTS.md, screens 7 and 8), its first part. Built in the clone on
25 November 2026 while the Commons photograph copy ran in the project. The Spaces page's walking order (the drag handle)
and the move sheet are round 122.

## Done

- **One switch** (`src/lib/ui/grow/CollectionSwitch.svelte`) at the head of My plants, Spaces and Batches: three links
  with their counts (growing plants, spaces, batches in progress), the one shown marked as the current page. The
  addresses stay /plants, /places and /propagation, so no link breaks.
- **"Spaces" and "Batches"** in headings and the menu (the owner's decision 1: "Spaces"; "Batches" as the switch names
  it), the trail of a space's and a batch's page with them. "My spaces" and "Propagation" are gone from the pages.
- **A chip for each space** holding growing plants of its own, in walking order, after "All", with its count; a parent
  holding only other spaces is not a chip unless the list is held to it. A chip sets the address's `place=` as the
  select did; the select is gone. The row scrolls sideways.
- **"Due" is "To look at".**
- **Three views:** photographs (a grid of tiles: the plant's own photograph, else the reference's marked "ref", else its
  initials; the name; the space and days since water; "look" or "resting" when there is one), today's rows, and a table
  (number, name, when and from whom it came, days since water). The choice is kept on this device
  (`cultifolio.plantsView`, on /about/how and its sample copy on /about/formats).
- **The table** under "All" is grouped by space in walking order, each group with its line and a "Watered" that records
  a watering on each growing plant of that space listed, with Undo. The Number, Name and Since water headings sort it by
  the list's own orders.
- **"CSV of these N"** gives the plants listed in plants.csv's columns, by the backup's own writer (`plantsSheet` now takes
  the ids to keep).

## Decisions

- **The default view stays the rows.** The hand-off opens a phone on the grid and a desktop on the table until the grower
  chooses. The list's tests read the rows in 175 places across 48 files; the defaults wait for a round that moves them,
  so this one adds the views and changes nothing a grower already sees until they press one.
- **"Batches" as the heading** of /propagation, as the switch names it; the decision named "Spaces" only.
- **The Filter control** that would hold the status chips on a phone is not drawn (the mock does not draw it); the chips
  stay as they are.

## Tests

- r121b (browser, 4, two at phone width): the switch and its counts; the chips filter and agree; the three views of the
  same plants, remembered, the grouped table's Watered for one space, a heading's sort; the CSV of the rows shown. FAILED
  on aa450b2.
- Moved: r61a (the chip pressed where the select held its value), r87l, smoke-1, smoke-3 and r80u (the menu's and the
  heading's new words), r74 (the menu says "Spaces"; the plants page's bare `place` uses five, not six).

## Gate and deploy

(Written at the gate.)
