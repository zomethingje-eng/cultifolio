# The new records of MYPLANTS 28 and 31, and how older devices carry them

The tracker hand-off asks before rounds 28 and 31: how does a device on the old code treat a change it does not know,
in sync and in a restored backup? And can the existing rule carry each new record safely, or does it need a format
version? Written on 23 November 2026 from the code (`src/lib/core/log.ts`, `src/lib/db/types.ts`,
`src/lib/backup/backup.ts`).

## The existing rule

The collection is an append-only log of field-level changes `{ t, kind, id, field, value }`. Sync and a restored
backup both pass every change through `readChanges` and `changeError` before the fold.

| What arrives | What an older build does |
|---|---|
| a kind it does not know (`KINDS`: accession, sowing, location, event, photo, taxon, setting) | refuses the list whole: "unknown kind" |
| a field it does not know | folds and keeps it (`changeError` checks only the fields it types); the record carries it on, and it reaches the newer device again |
| a word it does not know in a field it does know (an event's type, a status) | folds it as it is and shows the word (`FIELD_ENUMS` guards the forms only, never a pulled or restored change; round thirty) |
| a value of the wrong type for a field it does know | leaves that one change out and names it; the rest fold |

## The three new records

1. **"Looked at, left dry"** (MYPLANTS 28): an `event` with a new type, `dry`. Its date and note are the event's own
   fields.
   - **An older build** folds it and shows it in the plant's log by its word.
   - It does not reset "since watered" there, because only `water` does, so the older build's Today is unchanged.
   - It may list the plant again before the newer rule would. That is a reminder too many, never a record lost.
   - The event's label needs a word an older build shows plainly. The type is `dry`, and the label "Looked at, left dry"
     lives in the newer build's `EVENT_LABELS`.
   - **Sync and backup:** carried whole. **No format version.**
2. **The walking order of spaces** (MYPLANTS 29, used by 28): a field `order` (a number) on each `location`.
   - **An older build** keeps it as an unknown field and shows its spaces in its own order.
   - Two devices reordering at once merge per field by the greatest stamp, as every field does. A tie of two orders
     sorts by name.
   - **No format version.**
3. **A plant's identity check** (MYPLANTS 31): fields on the `accession`.
   - `idStatus` holds one of `received` (the default, when absent), `checked` or `verified`.
   - `idOn` holds a date, `idAgainst` what it was checked against, and `idBy` who verified it.
   - **An older build** keeps them as unknown fields. Round 87's t1 identity fields (`src/lib/core/identity.ts`) already
     ride this way.
   - **No format version.**

## The spreadsheets (rule 5)

- `events.csv` gains the `dry` type in its type column, with no new column.
- `plants.csv` gains the identity columns (`identity`, `identity on`, `identity against`, `identity by`).
- The backup holds no spreadsheet of spaces (its three are `plants.csv`, `events.csv` and `batches.csv`). The walking
  order is in the log, which the backup holds whole, so no spreadsheet changes for it.
- /about/formats lists each, as it lists the other columns.

## The hand-off's "Report if"

The existing rule carries all three safely, so nothing is reported, and neither a format version nor leaving a feature
out is needed.
