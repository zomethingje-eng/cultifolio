# Round 124: a plant's identity check (MYPLANTS 31, first part)

The tracker hand-off's round 31 asks for a plant's page in a new order and, new in what a collection records, the name's
state. This round is that state; the page's order, the Record… grid, the two figures, the comparison and the folds
follow in rounds of their own. Built in the clone on 26 November 2026 during the day's daily run.

## Done

- **Three states,** read from the ITF2 identification fields round eighty-seven keeps (`idStateOf` in
  `src/lib/core/identity.ts`), so nothing is stored twice:
  - **as received:** no verification level, U or 0;
  - **checked by me:** level 1 ("compared with other named plants"), its day (`idOn`) and what it was checked against
    (`idAgainst`, new: a plain text field, as `idBy` is);
  - **verified by someone:** level 2, 3 or 4, their name (`idBy`) and the day.
- **On the plant's page,** an Identity line ("As received", "Checked by you, 2026-11-20, against Cole's Lithops key",
  "Verified by S. Hammer, 2026-10") with Change: three choices, the day and the who or what, written for every plant of
  the accession (`idStateFields`: a state writes its own fields and clears the others, so the three never mix). Escape
  and Cancel close it.
- **The plants sheet** gains "checked against" after vdat (the backup's `plants.csv`, My plants' sheet, and the import,
  which reads it back as "checked against" or "idagainst").
- /about/how (#identity), /about/formats (the column and what it holds), /changes.

## Decisions

- **ITF2's fields, not `idStatus`.** docs/PLAN-RECORD-FORMAT.md planned `idStatus`, `idOn`, `idAgainst`, `idBy`. The
  verification level already says received, checked or verified in a garden's own terms, so the state is read from it;
  only `idAgainst` is new.
- **`idAgainst` is not typed in the log's field types.** Typing it moves the fold rules' number, and every device would
  fold its log again for one optional text field. An untyped field is kept and carried as the plan says (an older
  build keeps it too), and the page reads it as text, capped.
- **Verified by someone writes level 2** ("by a competent person"); a level of 3 or 4 set in the edit form is kept when
  the state is not changed.

## Tests

- r124b (browser, 2, one at phone width): as received, then checked by me with its day and against what, kept over a
  reload; verified needs a name, then back to as received. FAILED on 589c330.
- Moved: backup's plants.csv header and row, r87t1 7's columns.

## Gate and deploy

- Gated with round 123 after the daily run of 26 November. svelte-check 0 errors in 1,910 files; the hybrid table made
  again, 541. The app gate with Chromium at two workers, WebKit and Firefox at one: 6,574 unit tests, 3,039 browser
  tests, every test first time in every engine.
- Committed as 7ab8194 with round 123 and pushed on 26 November 2026. The first `node scripts/deploy.mjs` stopped at
  two component tests (a module not loaded in time); the second deployed, live check 24 of 24.
