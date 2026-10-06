# Records review of round sixty: numbers, links, restore, CSV, import, the sample, the label code

The number work holds where it was aimed (the chooser, labels `?acc=`, links in lists, Undo after navigation, the `id` column), but the round's surfaces leak in places nobody looked: an edit form or notes draft opened on one record follows the app's own links (including the round's new shared-number link) to another record, and Save writes it there; your own removed plant's label says it is "from someone's collection"; one emoji in a printed name removes every QR code on the label sheet; and the import's planner makes a 2,000-row import (its own cap) take on the order of an hour. The CSV `="…"` form is right where it is applied and the formula guard is intact, but it misses common date-like and number-like shapes, and LibreOffice's default import shows it literally.

How I covered it. Read every file in the brief's list and grepped every `goto(`, `href=`, `/plants/`, `/propagation/`, `accNo(`, `sowNo(`, `collection.accession(`/`sowing(` in `src`. In the browser (Playwright, Chromium, the shared server at 4173): two plants injected under one number and walked through the plant page, chooser, list, species page, labels, front-page search, `/propagation/new?parent=`; removal, Undo and restore paths; the label code with a removed plant and with a long Unicode name; the sample collection across four tabs; a 10,000-line paste (capped to 2,000) and timed adds of 100 and 300 rows; edit and notes drafts across plant, batch and place navigation. LibreOffice 24.2 headless read the exported sheet under its default and its dialog settings, and openpyxl read the cells back. Tests written: 5 unit files (63 tests: 24 fail on current code as reproductions, 39 pass as guards) and 1 e2e spec (11 tests: 9 fail as reproductions, 2 pass as guards), all run on Node 22 against my copy and the shared server. No source file in my copy was changed (checked with `diff -rq` against the main checkout).

## Findings

### 1. P1, confirmed. An edit form or a notes draft follows the app's own links to another record, and Save writes it there

- Where: `src/routes/plants/[acc]/+page.svelte:297` (`editing`, `f`, `fOpen`), `:290` (`notesDraft`, `editingNotes`), `:319` (`beforeNavigate`); the same pattern in `src/routes/places/[id]/+page.svelte:57,76` (confirmed) and `src/routes/propagation/[id]/+page.svelte:241` (read).
- What happens: SvelteKit keeps the page component when only the route parameter changes, so `editing`, the draft and `fOpen` survive a plant-to-plant, place-to-place or batch-to-batch navigation. The guard asks "Leave this page? What you typed here will be lost." and, on OK, the form stays open on the new record with the old record's text.
  - Plant: Edit on 2026-0042 Copiapoa (price 5 → 7.50, field number typed), then the round's own shared-number notice link to the other 2026-0042 (Welwitschia, price 40), OK, Save. The Welwitschia now has price 7.50, field number KK 1234, and a false log line "Renamed from Welwitschia mirabilis to Copiapoa cinerea" (the name itself was not written, since it was not "touched" against the first plant's form).
  - Notes: notes editor open on plant B (opened from A by the notice link), browser Back to A: the editor is open on A showing B's draft; Save replaces A's notes with B's text.
  - Place: Edit on Greenhouse, type "Glasshouse", click its "Bench 1" row inside the page, OK, Save: Bench 1 is renamed "Glasshouse".
- Should: a navigation that the grower confirms drops the draft (as the dialog says), or the page is keyed by the record so a new record gets a fresh component.
- Reproduction: `tests/e2e/records--r60.spec.ts` tests 1 to 3 (FAIL). Screenshot `shots/records/edit-carried-to-other-plant.png`.
- Smallest fix: wrap the page body in `{#key id}…{/key}` (plants, batches, places), or an `$effect` on `id` that sets `editing = editingNotes = editingMy = false` and clears the drafts. Also `deathUndo` and the log form's fields.

### 2. P1, confirmed. Your own removed plant's label says it is someone else's, and a removed plant whose number another plant now holds cannot be brought back

- Where: `src/routes/plants/[acc]/+page.svelte:529-536`; `collection.removedAccession` (`src/lib/db/collection.svelte.ts:518`) matches by number only.
- What happens: the label code is `/plants/<id>#…`. For a plant you removed, `withNumber(id)` is empty and `removedAccession(id)` looks for a number equal to the id, so the page shows the raw id as its heading, "This label is from someone's collection: Copiapoa cinerea. Their plant is kept on their own device, not here." and "No plant with this number on this device.", with no Restore. Every label printed since round sixty, and every older code (which carried the id), lands here.
- Also: when another live plant holds the removed plant's number, `/plants/<number>` opens that plant with no mention of the removed one, and `/plants/<id>` says "No plant with this number". After the 8-second Undo toast the removed plant can no longer be restored at all; so the round's "yield to a record born after the removal" branch is reachable only through that toast.
- Should: by id, a removed record shows "removed, can be brought back" with Restore; ForeignLabel only when the id is not in the log at all (`!collection.exists('accession', param)`).
- Reproduction: `records--r60.spec.ts` test 4 (FAILS); `shots/records/own-removed-label-scan.png`. Script: inject plant `r-a` with `_deleted: true`, open `/plants/r-a#s=copiapoa-cinerea&n=Copiapoa%20cinerea`.
- Fix: `removedAccession(x)` matches `r.id === x || accNo(r) === x`; guard `<ForeignLabel />` with `!collection.exists('accession', param)`.

### 3. P2, confirmed. One printed name with a character outside the BMP at the 60th place removes every QR code from the label sheet

- Where: `src/lib/ui/grow/qr.ts:18` slices the name at 60 UTF-16 units, then `encodeURIComponent` throws `URIError: URI malformed` on the lone high surrogate; `src/routes/labels/+page.svelte:171` calls `plantQrUrl` synchronously inside the `map`, so the throw escapes the effect before `Promise.all` is made.
- What happens: three plants, one with cultivar `Snow xxxx…🌵 Queen` (emoji at units 59 to 60): 0 QR codes on the sheet, a page error, nothing said. The labels still print, without codes.
- Should: cut by code point (or by `Intl.Segmenter` grapheme), and make one bad code fail only itself.
- Reproduction: `records--label-code.test.ts` (FAILS), `records--r60.spec.ts` test 5 (FAILS), `shots/records/labels-qr-surrogate.png`.
- Fix: `Array.from(name).slice(0, QR_NAME_MAX).join('')`, and in labels wrap the URL build: `Promise.resolve().then(() => QRCode.toString(url(a), …))`.

### 4. P2, confirmed. Places that still act by a number two plants share

- `/about/formats` (#records) says "While a number is shared, every link the app makes to either record is by its record id". Not kept:
  - Species page "yours" chips: `src/routes/species/[slug]/+page.svelte:360` links `/plants/{accNo(a)}` always (both chips are `/plants/2026-0042`). They open the chooser, so no wrong record, but the claim is false.
  - Front-page search: typing a shared number and pressing Enter goes to `plantHref(plantHits[0])` (`src/routes/+page.svelte:61`), which is `/plants/r-two-a`: one of the two, by list order, not the chooser. The page it opens shows the shared notice, so the grower can recover. Test 6 (FAILS).
  - `/propagation/new?parent=2026-0042` (the documented form, `src/routes/propagation/new/+page.svelte:117-119`) picks `r-two-a` by load order and prefills its species and place; a batch started there records that parent. Test 7 (FAILS). Labels refuse the same case; this should too.
  - `/plants/new` "already used by" link (`src/routes/plants/new/+page.svelte:268`): for a number held only by a removed plant the link is `/plants/` (the attribute is `undefined`), not the removed plant's page.
- Checked and right: list rows, Today chips and "watered just now", Firsts, places, batch page links, the chooser, the notice's links, labels `?acc=` (picks neither, says so), the add form's goto, the toast Undo of a removal (by id, and still right after opening another plant first: test 8 PASSES), the QR code (id), the share card (species only), the sync page (no record links).
- Fix: species chips use `plantHref(a)`; the search's Enter goes to `/plants/<no>` when two hits have that exact number; `?parent=` uses `withNumber` and picks none when there are two.

### 5. P2, confirmed (LibreOffice run; Excel and Sheets from their documented parsing, not run). The `="…"` form misses shapes spreadsheets change, and LibreOffice's default import shows it literally

- Where: `src/lib/backup/backup.ts:321`.
- Right: `0012`, `00042`, `3-12`, `1/2`, `1E5`, `1e-3`, 16+ digits are wrapped and read back exactly; `=`, `+`, `-`, `@`, full-width forms keep the apostrophe guard and read back; `FR 1234`, `2026-0001`, `S2026-001`, `12`, `0` stay bare.
- Missed (written bare, which Excel and Google Sheets turn into a date or number): `2026-01` (a plant number under a two-digit scheme, which Settings allows: 2026-01 to 2026-12 become months), `2024-03` (year and month), `3-12-2024`, `1/2/24`, and 12 to 15 digit runs (Excel's General format shows `1.23457E+11` and saves it back that way).
- LibreOffice 24.2 (its registry `CSVImport` defaults: EvaluateFormulas false, DetectSpecialNumbers false): every wrapped cell shows as the text `="0012"`; bare `3-12` and `1/2` would have stayed as typed there, so the wrap makes those worse in LibreOffice; with Evaluate formulas on (the headless filter default) it shows `0012`. All modes also turned `12.50` into 12.5 and `1,200` into 1200; with special numbers on, `1/2/24` became a date, `TRUE` a boolean, `(5)` -5, `5%` 0.05. Apple Numbers: not run, no documented behaviour found for `="…"` in CSV.
- Reproduction: `records--csv-roundtrip.test.ts`, "csvCell misses…" (7 FAIL); with `RECORDS_CSV_OUT=dir` it writes the sheet that was converted with `soffice --headless --infilter="CSV:44,34,76,1,,1033,false,false,false,false,false,-1,false"`.
- Fix: add `^\d{4}-\d{1,2}$`, `^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$`, `^\d{12,}$`; say in `/about/formats` that a LibreOffice reader should tick "Evaluate formulas".

### 6. P3, confirmed. The app's own plants.csv does not read back exactly

- `cellText` (`src/lib/import/csv.ts:109-113`) trims every cell (a note's trailing line break, a cultivar's spaces), strips an apostrophe the grower typed before a formula sign (`'=not a formula` comes back `=not a formula`), and a note that is literally `="0012"` comes back `0012` (guard removed, then unwrapped).
- The import page's hint says "A Cultifolio backup's plants.csv reads back as it is", while `/about/formats` lists plants.csv as "for a spreadsheet (not for import)". The batch link (`sowing`), the timeline, photos and the record id are not imported, so importing your own sheet into the same collection makes a second copy of every plant under new numbers.
- Reproduction: `records--csv-roundtrip.test.ts`, three "finding 6" tests (FAIL). Fix: strip the guard only when the rest would have been guarded by `csvCell`, unwrap before unguarding, trim only around the name; align the two sentences.

### 7. P2, confirmed. A place name containing "›" or ">" splits into a path

- `splitPath` (`src/lib/import/plan.ts:83`) splits on both. A place named `Shelf >1 m` exports as `Shelf >1 m` and imports as Shelf › 1 m, two new places; a place here named `Shelf > 1 m` is never found by its own path. Tests: `records--csv-roundtrip` and `records--import-attack` "finding 7" (FAIL). Fix: split on " › " only (the app's own separator, with its spaces), and match the whole string against existing names before splitting.

### 8. P2, confirmed. The import commit is not all-or-nothing, and a failure before the first plant is not reported by the page

- `commitImport` (`src/lib/import/commit.ts:64,81,92`) writes each place, then all species records, then one commit per row.
- With the vault refusing (QuotaExceededError) at the fourth write: two places and three species records stay, no plant, and the page is told "Stopped at line 2: … The lines before it were added".
- At the fifth: the first plant stays.
- At the first: `addLocation` throws out of `commitImport`, and the page's `add()` (`+page.svelte:161`) has no `catch`: an unhandled rejection, only the generic "This change was not saved" banner, and the leave-guard still says "nothing has been added yet" while a place exists.
- A second try after a mid-row failure is right: no duplicate places, numbers as planned (guard test PASSES).
- Nothing is written before Add: reading, checking and planning are pure, and `review()` only reads the ledger (guard test PASSES).
- Fix: catch around places and taxa, said as "Stopped before any plant: N places made". For all-or-nothing, the rows could go in one `claim` (they are already planned), or in chunks of 200 with the report saying which.

### 9. P2, confirmed. An unbalanced quote swallows the rest of the sheet without a word

`parseCsv` (`src/lib/import/csv.ts:94,102`): `Copiapoa cinerea,"5 inch pot` followed by two more rows gives one plant whose notes hold the other two rows. The count line shows fewer rows, but nothing says why. Test "finding 9" (FAILS). Fix: at end of input still inside quotes, report "an opening quote on row N is never closed" and refuse to read on.

### 10. P3, confirmed. Two sheets pasted together file the second header as a plant named "species"

A repeated header row (the BOM is harmlessly trimmed) is read as data. Test "finding 10" (FAILS). Fix: drop a row equal to the header.

### 11. P3, confirmed. A pasted line with no name is dropped silently

`; ; 2026-0009; club; a note` vanishes (`src/lib/import/paste.ts:39`); the sheet path counts such rows, the paste path does not. Test "finding 11" (FAILS).

### 12. P3, confirmed. "Born after the removal" compares two devices' clocks, so it can judge either way, and the note can then be false

- Where: `collection.svelte.ts:1404` compares the other plant's first stamp with this device's removal stamp.
- A peer four minutes fast (inside the five minutes a peer may run ahead before it is held) made its plant two minutes before the removal. Undo then renumbers the restored plant, and writes "Renumbered from 2026-0007 to 2026-0008 when it was brought back: another plant was given 2026-0007 while this one was removed.", which is false.
- The other direction: a peer three minutes slow, plant made after the removal, is judged "before". The number is left shared, and the record pages offer Renumber, keeper by first stamp: the restored plant keeps it and the plant made later is renumbered.
- A peer more than five minutes fast is held, so it is invisible to the judgement until it comes due.
- In practice the window is the 8-second Undo (finding 2). A device that had received the removal could not have minted the number at all (it is reserved), so every real duplicate comes from a device that never saw the original: the stamps compared are unrelated clocks.
- Tests: `records--restore-skew.test.ts` (1 FAILS, 1 PASSES and pins the other direction).
- Fix: word the note without "while this one was removed" ("another plant has 2026-0007 now"), or drop the judgement and always keep both under the number for the grower's Renumber.

### 13. P3, confirmed. The sample collection: leaving does not always delete it, and a second sample tab is told something false

- **A tab opened from the sample is in the sample too.** `window.open` and Duplicate tab copy sessionStorage, and the new tab shows the banner. Leaving the sample in the first tab sends `versionchange` to the second, whose `blocking` handler (`src/lib/db/vault.ts:121`) says "Cultifolio has been updated in another tab. Reloading…" (false), reloads into the sample, finds the database gone and seeds a fresh one: the visitor's waterings vanish, and `cultifolio-demo` is still on the device afterwards.
- **A sample tab closed without "Leave", or an installed app closed in the sample, keeps `cultifolio-demo` for good.** The next "Try it" opens that old sample unseeded: in the test, 11 plants after one was removed. It never reseeds, so it is stale ("first flowers yesterday" is gone). `/about/how`, `/about/formats` and TrySample all say "leaving deletes it".
- **Leave lands on whatever page you were on, sometimes.** Leave's own `deleteDatabase` fires the same handler in its own tab, which schedules `location.reload()` 800 ms later. Under load the reload won the race against `location.href = '/'` in two of my runs: it landed on `/plants` instead of `/`. It is still the grower's own collection, so the grower is never stranded.
- **A middle-clicked link from the sample opens the grower's collection.** It is a `noopener` tab and gets no flag, so `/plants/2026-0001` there is the grower's own plant of that number, with no banner.
- Tests: `records--r60.spec.ts` tests 9 and 10 (FAIL).
- Fix: in `blocking`, when `DB_NAME` is the sample's, close and go to `/` with the flag cleared, saying "The sample was closed in another tab". Delete a leftover `cultifolio-demo` (no flag in this tab) on any load that is not in the sample. Have `leaveDemo` close the vault itself (`dbp = null`, no reload).

### 14. P3, confirmed. Select mode's move Undo removes the move line of a plant it leaves where it is

`movePlantsUndoable` (`collection.svelte.ts:1542`) skips plants moved on since, but deletes every "to X" line, so a plant moved to X and then to Y keeps Y while its log loses X. Test: `records--select-undo.test.ts` (FAILS). Fix: delete a line only for a plant that is put back.

### 15. P3, confirmed. The label's name keeps bidi and C1 controls, and its cut can leave half an emoji

`labelFromHash` (`qr.ts:37`) strips only U+0000-001F and U+007F. A forged code can show 60 characters of reversed or isolated text on cultifolio.com as "the label's name". The 60-unit cut can leave a lone surrogate. It is shown as text, never markup (guard test PASSES: `<img onerror>`, `javascript:` slugs, traversal slugs, 5,000-character names and broken escapes are all handled). Fix: also strip `\u0080-\u009f‎‏‪-‮⁦-⁩`, and cut by code point.

### 16. P1, confirmed. Importing hundreds of plants takes minutes, and the page's own cap of 2,000 takes about an hour

- Measured on the shared server (2 CPUs, shared with other reviewers, so the absolute times are high):
  - 100 rows add in 7.4 s (75 ms a plant).
  - 300 rows add in 62 s (207 ms a plant).
  - 2,000 rows (a 10,000-line paste, capped with a message) take 20 s to check; adding then ran at about 3 s a plant (19 in 54 s) before I stopped it.
- Heap went from 6 to 56 MB for the review.
- Cause, by code and a Node benchmark: `planNumbers` is quadratic (`nextAccession` scans every taken number for each new one: 2,000 rows against 2,000 numbers is 2.5 to 3 s in Node), and the page's `plan` is `$derived` from `collection.accessions` (`+page.svelte:130-131`), so it is planned again after each of the 2,000 commits, along with the 2,000-row review list.
- Test: `records--label-code.test.ts` "the import planner's cost" (FAILS at 2.5 s against 200 ms).
- Fix:
  - Freeze the plan while adding (the commit already uses the object it was given).
  - Make `nextAccession` take the running maximum instead of rescanning.
  - Commit rows in chunks.

### 17. P3, read. Settings changed inside the sample are the device's, and go into the grower's next backup

The sample does not lock Settings or the label sheet's choices. Site, units, label sheet and preferences live in localStorage, survive Leave, and `readDeviceSettings` puts them in `device.json` of the grower's next backup. `cultifolio.hasMine` is set to 1 by the sample's twelve plants, so a visitor's other tabs flip to the grower's tab bar until a page opens their own (empty) collection. `/about/formats` says "Nothing of the sample reaches … a backup". Fix: say it ("settings you change here are this device's"), or keep the sample's settings in sessionStorage.

### 18. P3, read. Smaller things

- `restore` mints its new number outside the vault's claiming transaction (`collection.svelte.ts:1408`), so two tabs, one restoring and one adding, can give out the same number. Narrow.
- The import's renumbering line says "already used here" for a number used earlier in the same file. "Only the first 2000 lines are read" shows when exactly 2,000 were given.
- The add form's mid-batch Undo removes its plants in one commit each (`plants/new/+page.svelte:178`), so a failure partway undoes some.
- A stranger scanning a label sends `/plants/<record id>` to the server on first visit. The id carries the grower's writer tag and the plant's creation time. `/about/how` describes only the grower's own first visit after install.

## Checked and sound

- **Links by id while a number is shared:** the plants list, Today (due, watered just now, ahead, unseen), Firsts, places, batch pages and the parent links, the potted-up notice, the add form and the new-batch form's `goto`, and the shared notice's links. A bare shared number opens the chooser, with no Water until one is chosen; labels `?acc=<shared>` picks neither and says so; QR codes carry the id.
- **Undo after a removal:** pressed after navigating to another plant, it restores the right plant. The Svelte derived `id` keeps its value after the component is destroyed (e2e test PASSES).
- **The CSV:**
  - The `="…"` form appears only on the five documented shapes, and every one reads back exactly.
  - The formula guard is intact on all its prefixes.
  - CRLF inside a note round-trips, and quotes and commas round-trip.
  - The `id` column tells two rows under one number apart (guard tests PASS).
  - In LibreOffice the guard apostrophe shows literally, as in Excel: the known round-26 trade-off.
- **The import:**
  - Mixed CR/LF/CRLF, quoted line breaks, doubled quotes, and a BOM at the start or mid-file in a name are all read right.
  - Formula cells stay text; only a bare quoted constant is unwrapped (`="1"&"2"` stays).
  - `09/03/2024`, two-digit years and 30 February are refused and said.
  - A number duplicated inside the file or against the collection (removed plants included) is kept once and renumbered, and said.
  - "Greenhouse › Bench 1" resolves to that Bench 1.
  - Hybrids, quoted cultivars and genus-only names file as the add form files them.
  - 10,000 rows parse in Node well under a second.
  - Nothing is written before Add, and a retry after a failure is clean.
- **The sample:**
  - The BroadcastChannel is per database, so a sample tab and the grower's tab never hear each other.
  - A write in the sample leaves the grower's log byte-for-byte unchanged (3 changes before and after; e2e test PASSES).
  - Sync and backup are shut: sync config lives in the database's meta, so the sample has none.
  - `persist()` and the backup nudge are guarded.
  - Leaving clears the flag before anything else, so the grower is never stranded in the sample.
  - A reload stays in the sample.
  - A `noopener` tab is the grower's own.
- **The label code:**
  - The fragment never reaches the server (`Referrer-Policy: no-referrer` in `_headers`, the hooks and `app.html`).
  - The service worker caches navigations under `origin + pathname`, and Cache API matching ignores fragments.
  - `s` is restricted to slug characters; `n` is rendered as text, never markup.
- **Select mode:**
  - Water is one commit, and its Undo removes exactly those lines in one commit.
  - Archive is one commit, all or nothing under a full disk.
  - Move's Undo skips a plant removed on another device meanwhile (guard tests PASS).
  - What is ticked but filtered out of view is not acted on.

## Files

- Report: `/tmp/r60rev/out/records.md`.
- Tests, in `/tmp/r60rev/out/tests/`:
  - `records--r60.spec.ts` (e2e; run with `PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/records--r60.spec.ts`).
  - Unit tests, each `npx vitest run tests/unit/<file>`:
    - `records--csv-roundtrip.test.ts`
    - `records--import-attack.test.ts`
    - `records--restore-skew.test.ts`
    - `records--select-undo.test.ts`
    - `records--label-code.test.ts`
- Screenshots, in `/tmp/r60rev/out/shots/records/`:
  - `edit-carried-to-other-plant.png`
  - `own-removed-label-scan.png`
  - `labels-qr-surrogate.png`
