# Round 123: a space's page, and a label for the space (MYPLANTS 30)

The tracker hand-off's round 30 (myplants-handoff/MYPLANTS.md, screen 6). Built in the clone on 25 November 2026 while
rounds 121 and 122's gate ran in the project.

## Done

- **The head:** the name, the kind and the space it sits in with its count (as before), and a "···" menu beside the two
  buttons.
- **Three conditions as figures** (`#space-conds`): the temperature it is held at or bottoms out at, the days between
  waterings, and the months kept dry, each saying "from <space>" when inherited (`collection.conditions`'s `from`). A
  condition set nowhere is not shown. The light and the last watering stay as cards where they are recorded; the last
  audit moved to the audit row.
- **Two buttons:** "Watered <space>", which records a watering on every growing plant in the space and those inside it,
  as Water all did, and "Add a plant here".
- **The menu holds the rest:** Feed all, Move plants here, Start a batch here, Labels, Select, Edit, Remove space. Escape
  closes it and gives focus back to its button. Remove asks under the plants, as before, only once chosen.
- **Two rows under the plants:** "A label for this space" (the Labels page with `?space=`), and "Audit", with when it was
  last done or "never audited".
- **A label for the space** on the Labels page: its name, the space it sits in, and a code that opens its page, in the
  chosen sheet's first cell, printed alone. One scan for a bench, where a plant's label is one scan for a pot.
- **Report if (the iPhone):** the owner's test for round 26 found a scanned code opens Safari. The space label's help on
  the Labels page says so: the page finds the space where the collection is in Safari, or synced into it.

## Decisions

- The frost line and the space's notes stay where they were; the plants' rows are as before (the hand-off's thumbnail and
  word of status per line are round 121's grid and round 120's words, not repeated here).
- The light and last-watered cards are kept where they hold a figure: the hand-off names three conditions, and a figure
  already on the page is not taken away (rule 1).

## Tests

- r123b (browser, 3, two at phone width): own and inherited conditions, none on a space with none; Watered for the space
  and those inside, every other action in the menu, Escape; the audit row and the space's label. FAILED on aa450b2.
- Moved: smoke-1 ("Watered Laundry room"), smoke-3 (Remove and Move plants here through the menu; the head's button),
  r62a (Select through the menu), r81u ("Watered").

## Gate and deploy

- The first gate found Escape not closing the space's menu in WebKit, where a click does not focus the button; Escape now
  closes it from anywhere. The second was stopped at 00:28 UTC on a load flake in an untouched test (r62l-plant, WebKit,
  passing on its retry) so the daily run could start.
- Gated with round 124 after the daily run of 26 November. svelte-check 0 errors in 1,910 files; the hybrid table made
  again, 541. The app gate with Chromium at two workers, WebKit and Firefox at one: 6,574 unit tests, 3,039 browser
  tests, every test first time in every engine.
- Committed as 7ab8194 with round 124 and pushed on 26 November 2026. The first `node scripts/deploy.mjs` stopped at
  two component tests (a module not loaded in time); the second deployed, live check 24 of 24.
