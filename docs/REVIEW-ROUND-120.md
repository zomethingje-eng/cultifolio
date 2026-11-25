# Round 120: Today, space by space (MYPLANTS 28)

The tracker hand-off's round 28 (myplants-handoff/MYPLANTS.md, screen 5 and the desktop mock), with the record's format
as docs/PLAN-RECORD-FORMAT.md set it out. Built in the clone on 24 November 2026, after round 119.

## Done

### The page

- **Spaces, not a list of plants.** Every space with a growing plant is one row, in walking order (the order the spaces
  are kept, spaces inside after their parent); those with something to look at come first, the rest after, set quieter.
  Each row has its name, the space it sits in, its count, a pill ("2 to look at", "next due Sunday", "next due tomorrow",
  "next due in 12 days", "nothing due") and a link to the space's page.
- **One line** over them: how many spaces have something to look at.
- **Frost first** when the watch has something to say (the page's grid order; its section is otherwise after the spaces,
  as since round sixty).
- **One space open:** the first with something to look at, until the grower opens another. It lists its plants to look
  at, one line each: a tick box, the plant's own photograph where it has one, its number and name, a word of why, and the
  days since water.
  - A plant past its rhythm, or with no watering recorded, opens **ticked**; one listed only for a look (its habitat's dry
    season by the sheet's rule, or missed at an audit, or unseen) opens **unticked**.
  - **A row opens its reason** in a sentence, with "You have watered it about every N days" where the log allows, and a
    link to the plant's page.
  - The space's notes (kept dry by its space's months, resting by its own season, a watering dated ahead) stay under it,
    and show under a space with nothing to look at too.
- **One Done records the space:** "Done · 1 watered, 1 left dry", the words following the ticks. Each ticked plant gets a
  watering, each unticked one "Looked at, left dry", dated today, in one write.
- **After Done** the space is one line, "Done · 1 watered, 1 left dry · Undo", and the next space with something to look
  at opens. Undo takes back every line Done wrote and opens the space again. With none left, "All caught up" names the
  next plant due, as before.
- **On a desktop** (1024 px and wider) the spaces are a list at the left and the open space fills the right.

### "Looked at, left dry"

- A new log entry, the event type `dry`, "Looked at, left dry" (`EVENT_LABEL`), recorded from Today's Done and from a
  plant's page under Record….
- It does not reset "since watered" (`lastWatered` reads waterings only).
- It keeps the plant off Today until half the rhythm in force has passed, rounded up, and at least three days
  (`$core/watering` `dryHold`; `collection.leftDry`, read by the due list). The rhythm in force is the plant's, else its
  space's, else 21 days, as Today decided before.
- **An older build** folds the entry and shows it by its word; it does not take the plant off its Today, which then lists
  it again sooner: a reminder too many, never a record lost (PLAN-RECORD-FORMAT 1). Sync and the backup carry it whole.
  `events.csv` writes it as "Looked at, left dry" in its type column.

### "You have watered it about every N days"

- The median gap, in whole days, between the plant's last waterings, up to the last six gaps; shown only with three gaps
  or more (`wateringGap`). It is the grower's record said again and changes nothing Today decides.

## Decisions

- **Walking order** is the order spaces are kept now (`sort`, then the tree); MYPLANTS 29 adds the drag handle that sets it.
- **The pill's next day** is the nearest of: a plant's rhythm running out, a "left dry" lapsing. Within six days it is a
  weekday's name, else a count of days.
- **A batch whose count is due** is not said on Today yet: the collection holds no rule for when a batch's count is due.
  That waits for a rule of its own rather than a guess (rule 3).
- **"Also today" as one line of links** is left: its four parts (firsts, flowered before, the front page's lines, the
  calendar) are components drawn elsewhere too, and each is short or empty on most days. It is noted for MYPLANTS 29.

## Tests

- r120a (unit, 5): half the rhythm, at least three days (14 → 7, 4 → 3); the median gap (15 Oct, 25 Oct, 4 Nov, 14 Nov →
  10; two gaps → none); the entry's words. FAILED on 19ec7a8.
- r120b (browser, 4): the order with those to look at first; ticked and unticked by reason, Done with a mix, Undo, the
  next space opening, the caught-up line, by keyboard; the left-dry hold and "since watered"; the reason with and
  without the median. FAILED on 19ec7a8.
- Moved to the new page: r61a a11y 2 and perf 15, r62a (sheets refused, "Show N more", the pruned done row, 200% text),
  r67v, r87t3 2.1, smoke-3 (the stop's rows, Done, the midnight case, the watering dated ahead, the weekly bench and its
  dry month), smoke-3's round fifty-five test (Done opens the next space; the Undo survives a trip to another tab, where
  it held the next stop still under the finger), smoke-4 (the Undo's focus; nothing ticked is now all left dry).

## Gate and deploy

(Written at the gate.)
