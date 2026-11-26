# Round 125: a plant page's actions and figures (MYPLANTS 31, second part)

The tracker hand-off's round 31, its buttons, menu, figures and log. Built in the clone on 26 November 2026 while the
Commons photograph copy ran in the project. The page's new order (the photographs first, "First beside latest"), the
comparison card and the one-line folds wait for SPECIES 20's lens, which the comparison card is.

## Done

- **Two buttons and a menu.** Water and Record… lead (Photo stays where the cover tile is not drawn). The "More ▾" row
  of verbs is gone. The "···" menu, which already held Edit, Label, Died…, Propagate, Split off an item and Add an offset
  or cutting, now opens on Move… and holds Archive… (its question in the bar, as before). An archived plant's bar keeps
  "Mark growing".
- **Record… as a grid** (`#ev-kinds`): the kinds as one-tap tiles (radios), then the day and a note, where the select was.
  "Looked at, left dry" is one of them (round 120).
- **Two figures.** Since watered says "you average N d" from three gaps or more (round 120's `wateringGap`); beside it the
  latest size, or "Measure it", which opens Record… on Measured. The first-measurement step does the same.
- **The log** shows its latest three lines, then "All N entries".

## Decisions

- **"Water", not "Watered",** on the plant's button: a verb on one plant, as since round forty-nine, where a space's
  button says "Watered <space>" of what it records. 21 tests press it by name; the word was not worth their churn.
- **No longer held** keeps its row at the foot; the hand-off's quiet link and "Remove this plant" in the menu come with
  the page's reorder.

## Tests

- r125b (browser, 2, one at phone width): the grid of kinds and a line recorded from it, Move and Archive in the menu;
  the average, "Measure it" and the log's three. FAILED on 7ab8194.
- Moved: the verbs behind "More" (r60-grow, r61a, smoke-1, smoke-2, smoke-3) to Record…'s tiles; the kind select
  (smoke-1, smoke-3, r87t2) to the tiles; Move (r66y, r67h, r67r, smoke-1, smoke-3) and Archive (smoke-3) through the
  menu; r63u's More name to the menu button's; smoke-1's keyboard walk of the menu one step further to Edit.

## Gate and deploy

- svelte-check 0 errors in 1,911 files. The app gate, Chromium at two workers, WebKit and Firefox at one, three runs: the
  first found r125b 2's press on "Measure it" meeting the figures row as it was drawn again (Firefox, once; the test now
  presses until the form opens, 12 of 12 in three engines); the second stopped at its unit tests on r85q-behaviour 2, a
  component harness test that cannot load its stub module under the full suite's load (3 of 3 alone; it failed a deploy
  today too, and the harness wants a look); the third: 6,577 unit tests, 3,047 browser tests, every test first time in
  every engine.
- Committed as b1760eb and pushed on 26 November 2026; `node scripts/deploy.mjs` deployed on its first try, live check 24
  of 24.
