# Round 60 self-review: the grower (300 plants, two phones, a season)

I played an experienced UK grower (cacti, succulents, bulbs; greenhouse benches, cold frame, windowsills; a spreadsheet kept for years) against the shared server at 127.0.0.1:4173, almost all in a 390 x 844 touch viewport, en-GB, Europe/London, with persistent Playwright profiles so the collection lived between scripts. What I ran:

- **Import.** A generated 300-row CSV written the way a real grower's sheet looks (`/tmp/r60rev/grower/gen.py`, `collection.csv`): headers "Acc No., Genus & species, Cultivar, Field No, Locality, Supplier, Date Acq., Cost, Location, Notes, Qty"; numbers with leading zeros, "2019/14" and "A12" styles, three in-file duplicates and an Excel-mangled "1.00E+03"; eleven date formats; prices with £ € $, "swap", "gift", "?"; place paths with ">", "›", "/" and lower case; notes with commas, quotes and line breaks; hybrids, cultivars, cf./aff./sp., misspellings. I imported it, exported it, and compared 20 random rows field by field with the truth file. Then the export was imported into a second (desktop) browser and the two exports diffed. I interrupted a second import mid-way and ran it again.
- **A season.** Rhythms and dry months on four places; select mode (move, water, archive, labels, each Undo); a flower, a repot, two photos (canvas JPEGs) a month apart; Follow plus a Wanted note; Today on day 0, in November (dry months) and in March, by the clock-shift init script; the .ics downloaded and parsed and expanded with `icalendar` + `recurring_ical_events`; labels printed with `page.pdf` at A4 and Letter, rendered at 300 dpi, measured, and the QR codes decoded with OpenCV.
- **Two phones.** Sync set up on A, joined on B, edits on both, the same plant edited offline on both. Backup, preview and merge into a third profile (shared number chooser). The sample collection in two tabs beside the grower's own. iPhone card (Safari UA), a stranger scanning a label, hostile label fragments.

Scripts: `/tmp/r60rev/grower/*.mjs`. Screenshots: `/tmp/r60rev/out/shots/grower/`. Tests: `/tmp/r60rev/out/tests/grower--import-loss.test.ts`, `grower--labels.spec.ts` (both reproductions; expectations checked with tsx and by script against the running build, not run under vitest/playwright test, since the checkout is read-only).

Timing: from opening /plants/import to "300 plants added" took 61.5 s scripted (two columns to map by hand, "Check names" 5.7 s, "Add 300 plants" 32.5 s on the shared, overloaded 2-CPU box; 30.7 s for the desktop re-import). A person would need three to five minutes, most of it scrolling a 16-select mapping block and a review list about 72,000 CSS px long.

## Confirmed bugs

### 1. P1. The labels page forgets the sheet and options the grower picked, on every load (confirmed)
`src/routes/labels/+page.svelte:48`, `:73-99`, `:104-110`. The `$effect` that saves `{sheetK, withQr, withCare, withSource}` runs on mount with the defaults; `onMount` reads localStorage only after `await collection.load()`, by which time the defaults have been written over the grower's choice. The comment at :46 says the choice "is remembered then".
Repro (`lab5.mjs`): /labels shows L7160; pick Avery 5167 and untick Care line; localStorage holds `{"sheetK":"5167",...,"withCare":false}`; reload: the select is L7160 again and storage is back to `{"sheetK":"L7160",...,"withCare":true}`. Same after navigating away and back. A grower on pot-rim stock or strips has to re-pick the stock before every print, and the first time they forget, a sheet is wasted. Test: `grower--labels.spec.ts` test 1.
Fix: read the stored choice before `await collection.load()` (or in the state initialisers), and let the saving effect skip its first run.

### 2. P1. Every printed label sheet is shrunk to about 98%, so labels drift off their cells (confirmed; predates this round)
`src/lib/ui/theme.css:93` gives `body` `padding-inline: max(16px, …)`; the labels print CSS (`labels/+page.svelte:361-371`) zeroes `main.wrap`'s padding but not body's. In print the `.page` (exactly 210 mm or 215.9 mm) starts 16 px in, `scrollWidth` is 810 px for a 794 px A4 page (832 for 816 Letter), and Chrome's default fit-to-page (Safari and Firefox do the same) scales the whole sheet by 794/810 = 0.980.
Measured from `page.pdf` at 300 dpi: on A4 L7160 the column pitch is 64.6 to 64.9 mm (stock: 66.0) and the row pitch 37.4 mm (stock: 38.1); on Letter Avery 5167 (20 rows of 12.7 mm), row 1's text starts 3.6 mm below its cell top and row 20's at 253.0 mm, 1 mm above its cell (254.0 to 266.7): the bottom labels print across the line onto the row above (`34-labels-5167-letter.png`). Last round's install card is gone from the print (sound); this shift is a second, independent one.
Repro: `grower--labels.spec.ts` test 2 (`.page` left is 16, scrollWidth 810). Fix: `:global(body) { padding: 0 !important; }` in the labels print block.

### 3. P1. The import drops columns and parts of names without saying so (confirmed)
`src/lib/import/csv.ts` `FIELDS` / `HEADS`; `rows.ts` `rowsFromSheet`; `commit.ts` `recordOf`.
- A column with no field is ignored and never mentioned: my "Locality" (habitat locality, the most valuable datum on a field-numbered plant) and "Qty" vanished from all 300 plants. The review lists fields and their columns, never "these columns will not be imported". "Qty 3" became one plant: the review rows support `qty`, but no sheet field fills it.
- A sheet with **Genus and Species in separate columns** (very common) maps "Species" to the name and drops Genus: every plant would be named by its epithet ("cinerea"). Test in `grower--import-loss.test.ts`.
- A parenthesised part of a name is dropped: "Mammillaria theresae (white flower)" was filed as "Mammillaria theresae" with `nameAsReceived` empty (`parseName` puts it in `aside`, `recordOf` never reads it). The review row's input still shows "(white flower)", so the grower believes it was kept.
- "Header 'Genus & species'" is not recognised (only `name`, `species`, `taxon`…), so the grower must find the Name select among 16. That part is said ("Name (needed): Not in this sheet").
Fix: list the unmapped columns above "Check names" and, by default, append them to the notes as "Locality: Totoral, Chile"; add Qty (`qty`, `quantity`, `count`, `no. of plants`) and Genus (joined before Species) to the mapping; keep `aside` in `nameAsReceived` (or notes).

### 4. P1. Dates: 16 of my 20 sampled plants lost their acquisition date, and the date is not kept anywhere (confirmed)
`csv.ts:150-164` `readDate` reads only year-first dates. Rule 3 rightly forbids guessing 09/03/2024, but it also refuses dates that are not ambiguous: "2009", "August 2017", "Feb 2022", "17-Feb-2017", "17.11.2007", "30/09/09", "22/10/2023" (a day over 12). About 250 of my 300 rows lost the date. The review says so on each row, but:
- the date cannot be corrected in the review (rows offer only rename and Drop), so the grower must open 250 plant pages afterwards;
- the text is not kept: `acquired` null, notes untouched (sample: line 26 "2009", line 39 "August 2007", line 189 "07-Jan-2015" all simply gone);
- a plant with no number of its own is then numbered for this year (line 39, bought August 2007, became 2026-0001), and "Spent this year" and "No photo in 12 months" read the import day instead;
- the message is false for "2009": "the date "2009" is not written year first".
Fix, in order of size: keep the unread text in the notes ("Acquired (as written): 17/11/2007"); read year-only and named-month dates at their precision and any d/m/y whose day is over 12; offer one choice for the whole sheet when the rest are ambiguous ("Dates like 09/03/2024 in this sheet are: day first / month first / leave them"), defaulted from nothing, which is asking, not guessing. Tests in `grower--import-loss.test.ts`.

### 5. P1. "cf.", "aff." and "sp." are silently removed from names, in the import and the add form (confirmed)
`src/lib/core/names.ts:72-97` `parseName`: when the second word is not an epithet it is skipped, and the rest is kept, so "Mammillaria cf. bombycina" becomes the determined species "Mammillaria bombycina"; "Turbinicarpus aff. alonsoi" becomes "Turbinicarpus alonsoi"; "Lithops sp. C 036" becomes "Lithops C 036"; "Conophytum sp. nov." becomes "Conophytum nov.", and after one export and re-import, "Conophytum" (the parser is not idempotent: the round-trip diff's only change). Reproduced through `/plants/new` too (`cf.mjs`: three plants, each filed without its qualifier). The label then prints "Mammillaria bombycina" and its QR code tells a stranger's phone "This label is from someone's collection: Mammillaria bombycina" (decoded from the printed PDF). A grower's "cf." is a deliberate statement of doubt; dropping it asserts an identification nobody made (rule 3 in spirit, and the kind of thing a collector notices at once).
Fix: keep `cf.`, `aff.`, `sp.`, `nov.` in `scientific` (and roman in `nameParts`), and check the reference with the species part only. Tests in `grower--import-loss.test.ts`.

### 6. P1. An interrupted import is half done, unguarded, and a second run duplicates what got in (confirmed)
`plants/import/+page.svelte:150-163`, `commit.ts:73-105`. Each row is its own commit (by design), so the import is not all-or-nothing; `beforeNavigate` returns early on `willUnload`, and there is no `beforeunload` while adding. Repro (`s14-interrupt.mjs`): start "Add 300 plants", reload at "Adding 47 of 300…": no prompt, 48 plants are in. Load the same file again: the review says "51 numbers given are already used here: those plants get the next free number (0001 → 2026-0001, 0002 → 2026-0002, …)", and Add would file those 48 plants a second time under new numbers. On a phone, leaving the browser mid-import is the normal case. Fix: a `beforeunload` guard while `adding`; in the review, when a row's number is taken by a plant with the same name, say "already imported" and drop those rows by default ("48 rows look already imported: skipped. Keep them").

### 7. P2. Select by search ticks plants on other benches: "bench 2" watered 168 plants on five places (confirmed)
`plants/+page.svelte:80-87` matches every word anywhere in number, name, place, notes and source. Selecting a bench means searching for it: "bench 2" + "Tick all" ticked 168 plants (50 on Greenhouse › Bench 2, 22 on "Greenhouse/Bench 2", 67 on Bench 1, 29 on Bench 3), because "2" is in "0042", "2022" and notes. Water then recorded 168 waterings. "GH bench 1" ticked 44 of which 6 were already on Bench 1 (Ian Wool**n**ou**gh**), and the toast said "38 moved" with no word on the 6. The list does show each row's place, but nobody reads 168 rows. Fix: a place filter on My plants (the "By place" sort exists; a place chip or `?loc=` filter, which /labels already has), and "Select these" on a place page.

### 8. P2. Archive in select mode has no Undo, while the round says each action has one (confirmed)
`SelectMode.svelte:68-83`: toast "2 archived, and logged." with no action. `docs/REVIEW-ROUND-60.md` §6 says "select mode (water, move, labels, archive, each with Undo)"; the brief repeats it. Water and Move Undo removed exactly what they wrote (168 lines; 38 plants back). Fix: Undo that resets status and removes the "Archived" lines, or correct the claim.

### 9. P2. The sync page lists a held record by its raw id and field keys (confirmed)
`collection.svelte.ts:122`: kinds other than plant, batch, place and log line are labelled `${kind} ${id}`, and every kind's fields are shown as keys. Phone B showed (`43-sync-B-joined.png`): "photo pmwh0iune009149b1dd500ccndr (acc, sowing, d, dFrom, caption, w, h, bytes, sha) Apply Leave". Phone A at the same time: "This device's clock appears to have jumped back; edits it made before 14/11/2026, 23:04:09 keep their stamps, and a later edit to the same field is stamped just past them" (`engine.svelte.ts:436`), shown on every visit, with nothing the grower can do. (Both arose from my clock walk; a phone set ahead by hand and put right does the same.) Fix: "A photograph of 0055 Copiapoa humilis, taken 14 Nov" and field names in words ("notes, place"); the clock line as "This phone's date was ahead earlier. Nothing is lost; edits since then still win." or nothing.

### 10. P2. Import numbering words and scheme (confirmed)
- In-file duplicates are said as "3 numbers given are already used here" into an empty collection (`import/+page.svelte:229`): they are used earlier in the same file, and the row does not say by which line.
- A renumbered plant gets "2026-0009" in a collection numbered 0001 to 0300: the grower's own scheme is ignored (`plan.ts` `nextAccession`).
- The done line says "numbered 0001 to A95": a string sort over mixed schemes (`range`, :165).
- My plants "Newest first" lists A95, A94, A9, A77 (lexical number order for plants made in one import), and searching "0001" lists 2026-0001 and 2014-0001 before 0001.

### 11. P2. Today says "33 of 300 plants without a photograph" and its link opens a list of 297 (confirmed)
`src/lib/ui/Today.svelte:50,169` counts only plants older than a year; the chip it links to (`/plants?show=nophoto`, `plants/+page.svelte:96-99`) counts every growing plant once any one is a year old. Same collection, same day: Today 33, chip 297 (phone B). Neither is "300 plants have no photograph at all", which is the truth after an import.

### 12. P2. Spending never shows a total for a real grower (confirmed)
`spend.ts:31`: one bare "12" next to one "£12" counts as mixed currencies, and so does a single € plant among 250 £ ones. My sheet: "Spent this year: nothing counted (2026)", "All time: no total: the prices are in more than one currency", "108 prices could not be read as a number". Fix: total per currency ("£2,310 on 180 plants, €45 on 3; 40 with no currency") rather than none.

### 13. P2. A stranger scanning a label sees the plant's internal id as the page heading (confirmed)
`/plants/rmuvujahh…#s=…&n=…` on a phone without the plant (`71-foreign-label.png`): the h1 is "rmuvujahh009149b1dd500cl0g5", then the (good) card, then "No plant with this number on this device", though the code carried an id, not a number. A a first-time reader who scans one label sees this first. Also U+202E (right-to-left override) in `n` is not stripped (`qr.ts` strips control characters, not format characters), so a label can display reversed text; it is escaped, so no injection. Fix: heading "A plant label" (or the name), drop the "number" line on a foreign label, strip `\p{Cf}`.

### 14. P2. Settings changed inside the sample collection change the grower's own (confirmed for units)
In the sample tab I pressed "°F and inches" in Settings; after leaving, the grower's own collection was in °F (`cultifolio.units=us` cookie). Site and preferences are in localStorage (`site.svelte.ts`, `prefs.svelte.ts`), shared the same way (read, not run), so a visitor who sets a site in the sample sets the grower's frost watch. The bar says "Nothing here is yours or saved with your plants". Fix: lock Settings in the sample as Sync and Backup are, or say "Settings here are your own".

### 15. P3. Smaller confirmed slips
- Backup preview: "Nothing here is removed.The file's label settings is applied, since this device has none." (missing space; "settings … is"); the merge report repeats "the file's was applied". "taken 2026-10-05" is the UTC date (`backup/+page.svelte:179`, `m.exported.slice(0, 10)`) while the file was named `cultifolio-2026-10-06…` by local date; "on device 9149b1" means nothing to a grower.
- "Download as a spreadsheet" toasts "plants.csv made on this device and downloaded." for a file named `cultifolio-plants-2026-10-05.csv`, and nowhere says it holds plants only (no waterings, photos, places' rhythms, Wanted): a grower can take it for a backup.
- Two phones offline that each record a watering of the same plant on the same day end with two "Watered" lines (the one-a-day rule is per device).
- "x Gasteraloe 'Green Ice'" is shown as "Gasteraloe ‘Green Ice’" (the × is gone from the name everywhere).
- After Undo of a select-mode Move, focus is on `body` (the Move button that raised the toast no longer exists).
- My plants rows show only the last place segment ("front", "back row"), which says nothing without its bench.
- Today's first screen on a phone: install card and backup nudge take 560 px, then about 120 px of empty space above "By place" (`13-today-day0.png`).

## The .ics, validated
Sound: CRLF only, no line over 75 octets, folds never split a character, TEXT escaped, `DTSTART;VALUE=DATE`, `UNTIL` as a DATE to match, `EXDATE;VALUE=DATE` in lines of 20, stable UIDs, `TRANSP:TRANSPARENT`, archived plants left out. It parses with `icalendar`, and expanding it with `recurring_ical_events` gives exactly what was intended: Greenhouse › Bench 1 every 10 days on 15 and 25 Oct, nothing in Nov to Feb, then 4, 14, 24 Mar 2027, the second dry season excepted, ending 14 Oct 2028. Points for the author (P3, reasoned):
- **No VALARM.** An all-day event alerts only if the calendar's default for all-day events is on (Apple's is off by default; Google's import keeps its calendar default, Outlook's is 18 hours before). The feature exists to bring the grower back; `BEGIN:VALARM / TRIGGER:PT9H / ACTION:DISPLAY` would make it ring at 09:00 on the day in Apple and Outlook (Google ignores imported alarms).
- **After a dry season the calendar and Today disagree.** The cadence runs through the dry months, so the first event is 4 Mar while Today lists all 298 plants due on 1 Mar. Starting a fresh series on the first day after each dry run would match Today.
- **A place dry in every month** produces an event whose 731 occurrences are all excepted (37 EXDATE lines): some clients show an invisible event, some refuse it. Leave such a place out and say so.
- **Re-import.** UIDs are stable (right), but there is no `SEQUENCE`, and an imported (not subscribed) file is never refreshed: in Google an import of an existing UID is ignored rather than updated, so "download it again" after a rhythm change does not change the old events. The box should say "delete the old Cultifolio events first", or the file should use a new UID per download.
- Wording: the description lists dry months "Jan, Feb, Dec" while the place page says "dry Dec to Feb".

## Checked and sound
- Import: CSV with BOM, CRLF, quoted commas, doubled quotes and line breaks in notes; formula cells stay text (`=HYPERLINK(…)` shown literally; exported with the guard apostrophe and read back without it); cultivars from quotes and from the column; hybrids with parentage ("Ariocarpus retusus × Ariocarpus trigonus"); leading zeros, "2019/14", "A12" and "1.00E+03" kept as written; places made only when ticked, case-insensitive match of "greenhouse > bench 2"; misspelling offered "did you mean Copiapoa cinerea? Use it"; subspecies "matched as Copiapoa humilis"; prices kept as typed.
- Export and re-import into a second browser: 300 of 300 rows, every column identical except the one parser case in finding 5; mapping fully automatic; no renumbering.
- Select mode: Water skips plants already watered today ("Already recorded as watered today."), Undo of Water and Move removes exactly what was written; Archive asks first; labels go to /labels with the ticked plants picked.
- Places: rhythm and dry months saved and inherited; Today in November says "Kept dry this month by Greenhouse's rule: 79 plants, not counted as due"; in March everything is due.
- Flower, repot, Firsts ("First flowers on 0055 Copiapoa humilis, today.", "First photograph of …"), photo timeline ("2 photographs, 6 October 2026 to 14 November 2026", Compare), Follow ("On your Wanted list ›"), Wanted note with price seen.
- Labels: A4 L7160 is the default for en-GB; the install card does not print; QR codes decode to `/plants/<id>#s=<slug>&n=<name>`, and the fragment never reached the server in any request; hostile `n` is shown as text.
- Sync: set up, key typeback, join in 35 s with 300 plants, edits cross both ways, offline notes on both phones converge to the later one with "An earlier text was replaced by an edit made without seeing it", offline counter ("3 changes kept here, sent when you are back online").
- Sample: 12 plants, Firsts, Sync and Backup locked with plain reasons, the grower's tab untouched and its watering not seen in the sample, a tab opened from the sample stays in the sample, leaving lands on / with the grower's own plant; no localStorage key changed.
- Backup preview lists the shared number ("0001: Copiapoa cinerea here and Sedum morganianum from the file") and the chooser after the merge is clear.
- iPhone card text and steps; the persist request's toast is plain ("This browser has not promised to keep your data: take a backup now and then.").

## Words (plain, warm, true?)
Mostly plain and true. The ones that are not: "vault" (sync page head "vault RP5DF5…", "Set up a new vault", sample lock), "stamps", "sealed blobs", "sync bundle", "snapshot" and "log" in "How this page read the collection", "on device 9149b1", the raw parked list (finding 9), "already used here" (10), "is not written year first" for "2009" (4), "the reference did not answer" for a search allowance that was spent (read, not hit in my run: `check.ts` turns a 429 `{limited}` into `unchecked`, and the page then says "did not answer", a refusal said as a non-answer), and "33 of 300" (11). Warm and good: "All caught up.", "Kept dry this month by Greenhouse's rule", the Wanted list, the sample bar, the key card ("keep it with your seed packets").

## Friction log
1. /plants/import, phone: the mapping block is 16 selects, about 3,000 px; the two I needed (Name, Acquired) are 1st and 5th but the "Check names" button is at the bottom; nothing tells me which of my columns are unused.
2. Review list: 300 rows of about 240 px each; the one row that needed me ("Use it" on line 283) is 68,000 px down. Wanted: "Show only rows that need me (251)".
3. Every row repeats "Greenhouse/Bench 2: not a place here, so no place unless made below" until the checkbox at the top is ticked.
4. Dates cannot be fixed in the review; 250 plant pages later.
5. "Make these 11 places" offered "GH bench 1" and "Greenhouse/Bench 2" as new places beside Bench 1 and Bench 2; there is no "this is the same as" and no place merge afterwards. I merged by select mode: search, Select, Tick all, Move, pick, Move 38 (6 taps plus typing), and the empty "GH bench 1" place stayed.
6. No "Last watered" in the import, so the 300 plants start "no watering recorded"; Today's own advice ("give Last watered when you add plants") cannot be followed.
7. Selecting a bench needs the search (finding 7); there is no place filter and no Select on the place page.
8. Plant page: after the first photo the file input moves behind the "Photo" button (two taps for the second photo, fine), but the notes "Edit" is a small link at the end of the notes card.
9. Labels: the sheet must be picked again every visit (finding 1); picking the plants of one bench means typing its leaf name into the filter ("front") and "Pick all shown".
10. Spend shows nothing useful for a sheet of mixed price styles.
11. Sync, phone B: the parked photo with raw keys is the first thing under the status after joining.
12. The sample is offered only while I have no plant; with one plant I could not show it to a friend.

## Suggestions for mass adoption, ranked by impact over effort
1. **Make import lossless (small).** Unmapped columns into notes by default and listed before "Check names"; Qty and Genus+Species mapping; keep the unread date text; keep `(…)` and cf./aff./sp. This turns the first hour from "what did it lose?" into trust. (Findings 3, 4, 5.)
2. **Fix label printing (tiny).** Body padding in print and the remembered sheet: two lines that stop wasted sheets. (1, 2.)
3. **One date choice per sheet and unambiguous dates read (small).** Ends 250 manual edits for every UK, EU and Australian grower. (4.)
4. **"Show only rows that need me" and "skip rows already imported" in the review (small).** Makes a 300-row review a one-screen job and makes an interrupted phone import safe to repeat. (6, friction 2.)
5. **A place filter on My plants and "Select these" on a place page (small).** Benches are how growers work; selection by text search waters the wrong bench. (7.)
6. **Last watered and a date for the whole import (tiny).** Today then works from day one after an import. (friction 6.)
7. **Per-currency spending (tiny).** (12.)
8. **Plain words on the sync page's held/parked items and the clock line (small).** (9.)
9. **VALARM in the calendar file and a series restart after each dry run (small).** (.ics section.)
10. **Undo for Archive, and Today's photo count matching its chip (tiny).** (8, 11.)
