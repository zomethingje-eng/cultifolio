# Round 59 review: the grower (a season with Cultifolio)

Reviewer stance: a serious hobby collector (about 300 plants, a greenhouse with benches and trays, windowsills, a grow tent, spring sowings) living with the app on a phone (390x844, the main device) and at 1280 wide, light and dark. Shared server http://127.0.0.1:4180 (fixture corpus: four species), Playwright Chromium, locale en-GB unless stated. Time was moved with an init script (`Date` shifted by `localStorage.__shift`, as `tests/e2e/smoke.spec.ts` does) through about eight months: day 0 (4 Oct 2026), day 11, day 77 (December, dry months), day 150 to 230 (a sowing from March to May 2027). Scripts and 94 screenshots are in /tmp/review59/grower/ (r1 to r17).

Limits: no outside network from this machine. GBIF's name service answered 502, so every name the fixture lacks needed the second "Add as typed" press, and the plant pages say "Name not checked". The forecast source did not answer, so the frost watch only ever said "Forecast not checked: the forecast source did not answer." Reference photographs did not load. On the live site (not reachable from here) the name picker would offer the 8,947 species and GBIF, so bulk-entry tap counts below are a worst case for names off the reference.

## What a season looked like, measured

| Flow | Steps (taps; typing a field counts 1) | Time | Notes |
|---|---|---|---|
| First run, empty device | `/plants` shows a 3-step card: "Where you grow", "Your first plant", "Your location for the frost watch" | | Clear. Today on an empty device shows an "ALSO TODAY" heading with nothing under it (r1-today.png). |
| First plant from the picker | 4: "Your first plant", type, pick, Add | 0.8 s save | Lands on the plant page with "Set it up 1 Give it a place 2 Add a photograph 3 Measure it". Good. |
| Six nested places | 36 taps, about 6 per place | 4.9 s scripted | The form closes after each Add, so "New place" is tapped again every time. No "Grow tent" kind ("Other"). |
| 30 more plants, "Save and add another" | 158 taps (5.3 per plant), 23 second presses | 113 s scripted with fixed waits | No import from a spreadsheet at all. See 2 and 7. |
| Water a whole place on Today | 1 | under 1 s | Undo on the stop: 1 tap, worked. |
| Feed, repot, measure, flower | 4 each: More ▾, verb, fill, Record | under 1 s each | Repot takes pot size and medium; measure takes six figures. |
| Photograph (generated 2400x1800 JPEG) | 2 | about 3 s to resize and show | Became the cover; date kept. |
| Move | 3 | | Toast with Undo. |
| Died | 4: ···, Died…, cause, Record | | Toast "Death recorded" has no Undo (finding 12). |
| Archive / Mark growing | 3 / 2 | | Both logged as Notes. |
| Remove, then the removed page | 2 | | "Restore this plant" offered. Good. |
| Seed batch: sow, 3 counts, 1 loss, pot up 10 | about 20 taps over 5 visits | | Pot-up made 2027-0001 to 2027-0010 with the batch as provenance and a "Print 10 labels" button. That button is gone after a reload (finding 15). |
| Labels for the 10 seedlings | filter "2027-", Pick all shown, sheet, Print: 5 | | Picked 11, not 10 (the batch matched too). The printed sheet carries the install card (finding 1). |
| Site and frost watch | 4 | | Saved; Today shows "Your site: Mt Lebanon, 40.37, -80.05". Forecast not reachable here. |
| Backup | 1 | 255 ms, 116 kB zip | plants.csv, batches.csv, events.csv inside. Good. |
| Wipe and restore (new empty profile) | 3: Restore a backup, choose file, Merge | 3.2 s | Site and label settings came back. Preview wording is heavy (finding 17). |
| Sync, phone sets up, desktop joins | phone 3 (Set up, type the last five symbols, Start syncing); desktop 3 (I have a key, paste, Join) | 6.5 s and 7.2 s | Edits on both (a watering on the phone, a note and a new plant on the desktop) arrived both ways after two "Sync now" runs. |
| Offline (`context.setOffline`) | | | Today, a plant page and a species page opened from cache; a watering was recorded; Sync said "Offline, 3 field changes kept here, sent when you are back online". Sound. |

## Findings

### 1. P1. The install card prints on the label sheet and shifts every label off its cell
Confirmed. `src/lib/ui/InstallBar.svelte` renders inside `<main>` (`src/routes/+layout.svelte:253`), in the page flow. The labels page's print rules (`src/routes/labels/+page.svelte:334-341`) hide `#topbar`, `#tabbar`, `footer` and `.ui`, not `.install`. The card appears from the second day a grower opens the app, and again 30 days after "Not now", which is exactly when people print labels.
Steps: profile with the card showing (visits on two days), `/labels`, pick the ten seedlings, Avery 5160, print to PDF (`page.pdf`, preferCSSPageSize). With the card: the card is printed at the top and the labels start one row low, running onto a second page (r11pi-1.png, r11pi-2.png). After "Not now": one page, labels in their cells (r11pn-1.png).
What a grower loses: a sheet of labels, every time, and the "print at 100%" promise.
The same rule misses `.frostbar` and `.clockbar` (outside `<main>`, shown on `/labels` when frost is forecast or the clock reads behind). Suspected for those two (no forecast reachable here).
Smallest fix: in the labels print block add `:global(.install), :global(.frostbar), :global(.clockbar), :global(.toast) { display: none !important; }`, or one global `@media print` rule that hides every app-chrome element; a print test that asserts the first `.label`'s top equals the sheet's top margin with the card showing.

### 2. P1 (adoption). No way to bring an existing collection in
Confirmed by search: no CSV, spreadsheet or paste import anywhere in `src` (the only CSV code is the backup's export, `src/lib/backup/backup.ts`). A collector with 300 plants in a spreadsheet must retype them: at the measured 5.3 taps and about 15 to 20 s a plant by hand, that is 1,600 taps and well over an hour, before the app has done anything for them. This is the single largest reason an experienced grower would leave on day one. It also leaves no way to carry over watering history, so Today stays silent for the first rhythm (finding 6).
Fits the rules: a file parsed on the device, merged as ordinary changes; nothing leaves the device.
Smallest fix: "Import from a spreadsheet" on `/plants` (and on the empty-state card): paste or choose a CSV, map columns (name, number, field number, place path, acquired, source, price, notes, last watered), preview with "names the reference does not know: 14" and a count, then one commit. Accept the backup's own `plants.csv` columns so export and import round-trip.

### 3. P2. The toast covers "Save and add another" during rapid entry, and a tap on it leaves the form
Confirmed (r15.mjs, r15-toast-over-bar.png). At 390, once the name is one the reference lacks, the primary button reads "Add as typed", the three buttons wrap to two rows, and "Save and add another" sits at y 682 to 726 while the 8-second toast "2026-0001 added · Open 2026-0001" sits at y 656 to 718. `document.elementFromPoint` at the centre of "Save and add another" returns the toast's "Open 2026-0001" button. A grower adding plants in a rhythm taps "Open 2026-0001", gets "Leave this page? What you typed for this plant will be lost.", and either loses the typed plant or is confused. Round 51 says the toast was moved above the pinned bar; it is above one row of it, not two.
Fix: position the toast from the bar's measured height (or `bottom` above `.actions.sticky`), or shorten the second press's label to "Add anyway" so the bar stays on one row; on this form, make the toast's action "Undo" (remove the plant just added) rather than "Open", which is what a person mid-batch wants.

### 4. P2. Today says a place is done while ticked plants remain under it
Confirmed (r6.mjs, r6-b-watered.png). Day 11, Tray A: five unwatered plants and three Copiapoa in the row "Outside the cooler six months the species sheet names; untick any to leave it out", each pre-ticked, with their own "Water these 3". Tapping "Water 5 here" turns the stop's head into "Watered ✓" (`src/routes/today/+page.svelte:268-273`: `n` counts only overdue and unknown), while three ticked chips and a live "Water these 3" button remain below it. A grower reads the green tick, walks on, and the three Copiapoa are not watered, or are watered and not recorded.
Fix: either the head counts every ticked chip on the stop (one "Water 8 here"), or resting rows start unticked and the done mark only appears when nothing ticked remains anywhere on the stop.

### 5. P2. Today's rules are worded in the app's terms, not the grower's
Confirmed, quoted from the phone at day 11 and day 230:
- "Outside the cooler six months the species sheet names; untick any to leave it out". A grower does not know what "the cooler six months the species sheet names" is, or whether it means "resting, do not water" or "growing, water". Suggest: "Resting now (by its habitat's seasons). Water only if you want to."
- "Past the watering rhythm (21 days unless the plant or its place sets another)" on Tray A, whose Greenhouse I set to 10 days. The sentence quotes 21 for a place running on 10. Say the rhythm actually used: "Past its 10-day rhythm (set on Greenhouse)".
- "23 plants need something across 3 places, in the order the places are kept. A plant with no watering recorded is counted from the day its record was made, and said so." Two sentences of method before the first plant.
- The place page says "kept dry in Jan, Feb, Dec" (calendar order, not the season): "kept dry Dec to Feb".
Fix: the cheap one is the wording above; the method sentences go behind a "How Today decides" disclosure.

### 6. P2. Today's work starts below the fold on a phone, and is empty for the first weeks
Confirmed. At 390x844 with a site set, the first stop's top is at y 574 and its first chip at y 671 (r17.mjs); with the install card showing it is below the tab bar entirely (r6-a-today-d11.png). Above it: kicker, title, "The nights ahead, then what needs you, place by place.", a section rule, the frost card, another rule, the method paragraph. On day 0 with 31 plants, Today says "Nothing needs you today by these checks: no plant past its watering rhythm (21 days unless its place or the plant sets another; a record younger than that is not counted), none missed at an audit or unseen for ninety days." and stays so until each place's rhythm has passed since the plants were added (r5-d-today.png). There is no "last watered" on the add form or in bulk, so a grower who watered yesterday cannot say so without a log entry per plant.
Fix: put "what needs you" first and the frost watch as a one-line strip (expand on tap) unless frost is forecast; collapse the method sentence. Add "Last watered" (date, optional) to the add form's kept fields so "Save and add another" carries it, and a "Watered on…" date on a place's "Water all".

### 7. P2. Cultivar and hybrid names are dropped where plants are told apart
Confirmed. Today's chips render `a.taxonName` only (`src/routes/today/+page.svelte:203, 288, 298`): 2026-0004 *Haworthia truncata* 'Lime Green' is shown as "Haworthia truncata", *Echeveria* 'Blue Curls' as "Echeveria". On `/plants` a hybrid entered as "Ariocarpus retusus × trigonus" is listed as "Ariocarpus" with a "hybrid" tag (`src/routes/plants/+page.svelte:214` shows cultivar, never parentage). Five Ariocarpus hybrids read as five identical rows. Collectors of Haworthia, Echeveria, Astrophytum and Ariocarpus cultivars and crosses are a large part of the audience.
Fix: one `plantLabel(a)` used everywhere a plant is named (species, 'cultivar', or genus with the cross), as the list already does for cultivars.

### 8. P2. The plants list cuts the place from the wrong end
Confirmed (r4-plants.png). At 390 the row shows "no watering recorded Greenhouse › Benc…" for plants on Tray A and on Bench 2 alike; the part that tells them apart is the part cut. `.accrow .fam .where` uses `text-overflow: ellipsis` from the right.
Fix: show the last segment ("Tray A") with the full path in `title`, or ellipsize the start (`direction: rtl` trick, or "… › Bench 1 › Tray A").

### 9. P2. The label stock defaults to US Letter for every locale
Confirmed. `src/routes/labels/+page.svelte:43` `let sheetK = $state('5160')`; under en-GB the page opens on "Avery 5160 · 30 per sheet · 2⅝ × 1 in" (r1-labels.png). A UK or EU grower's first print is on the wrong paper size, and the preview says "215.9 mm wide".
Fix: default to L7160 when the units are metric or the locale is not US/CA; the choice is already remembered once made.

### 10. P2. "Pick all shown" on the labels page picks batches too
Confirmed (r11.mjs). Filter "2027-" to get the ten new seedlings, "Pick all shown": the button reads "Print 11 labels" because S2027-001 also matched. A grower prints a label for the seed pot they already labelled.
Fix: one "Pick all shown" per section (Plants, Batches), or the button counts per section ("10 plants, 1 batch").

### 11. P2. The sync key says "shown once here", which is not true
Confirmed by reading and by the page. `src/routes/sync/+page.svelte:227`: "Your new sync key · shown once here; keep it somewhere safe". After setup, "Add another device" (line 189) shows `sync.key` in full (line 200). Rule 2's spirit: the app should not say something it does not do, even to frighten people into saving. It also makes the grower believe the key is gone if they skipped saving it.
Fix: "Save it somewhere safe: it is the only way into your vault from a new device. You can show it again here while this device is synced."

### 12. P3. Marking a plant dead has no Undo
Confirmed (r8-c-dead.png). The toast reads "Death recorded" with no action; Remove and Move both offer Undo. Undoing means More ▾, Mark growing, then removing the "Died" line by its ×: three steps a grower has to discover.
Fix: the toast's Undo removes the death event and restores the previous status, as Remove's does.

### 13. P3. The place form is two columns at 390 and cuts its own hints
Confirmed (r5-b-edit.png). Placeholders read "the coldest it gets" cut, "21 (the de", and the select "what it bottoms"; the twelve month boxes wrap with Nov and Dec alone on a second line. `src/routes/places/[id]/+page.svelte:361-378`.
Fix: one column under 520 px, as the add-plant form already does (`.two` becomes `1fr`).

### 14. P3. Places are added one form at a time
Confirmed. After "Add", the form closes (r3-a-after-first.png), so six places took 36 taps. A greenhouse with eight benches and twenty trays is a chore.
Fix: keep the form open after Add with the parent kept and the kind kept, as "Save and add another" does for plants; or "Add 8 benches" with a count and a name pattern.

### 15. P3. The "Print 10 labels" offer after a pot-up does not survive a reload
Confirmed. The notice with `#potted-labels` appears right after "Pot up 10" and is gone after a reload of the batch page (r11 first run timed out waiting for it). The grower who pots up on the bench and prints at the desk later has to find the ten plants by hand on `/labels`.
Fix: the "Plants raised from this batch" heading gets its own "Labels for these" link, always.

### 16. P3. Words a grower would stop at
Confirmed, all seen on screen:
- "31 growing · 31 plant numbers" and later "39 growing · 41 plant numbers" (`/plants`). Nobody knows why numbers and plants differ. Say "39 growing (41 numbered, 2 removed or dead)" or drop the second figure.
- "No photo in 12 months 31" as a default chip on a collection made today. Hide it until a plant is a year old.
- "3 field changes kept here" and "field changes made here and not yet up (a note is one; a new plant is several)" on `/sync`. A grower made one watering; say "3 changes waiting (1 watering, …)" or just "waiting to send".
- "Log" as the plant page's second button: it records any event, but reads as "show the log". "Record…" is clearer.
- `/backup` header "40 plants · 1 photos" (`src/routes/backup/+page.svelte:125`, no plural rule).
- Restore preview: "29 species records (the app's own, one per species grown or followed) and 6 deleted records, update 0 records". "6 deleted records" sounds like the restore deletes something.
- "SINCE WATERED 0d" on the plant page while Today now says "today".
- Dates mix "4 Oct 2026" (card) and "2026-10-15" (log, tiles) on the same page.
- "Name not checked" pill on a plant: say "Name not yet matched to the reference".
- "Kind of place" has no grow tent, cold greenhouse, terrarium, or "under lights".

### 17. P3. Empty and first-run details
Confirmed. Empty Today shows the "ALSO TODAY" heading with nothing under it (r1-today.png). `/places` says "1 growing plant has no place." with no link to place it (`src/routes/places/+page.svelte:100`). The plants list shows a grey "–" box per row once any plant has a photograph (r8-f-removed.png), which reads as a missing image 30 times.

### 18. P3. The add form's hint stack under Species
Confirmed (r4-armed.png). With the name service down a grower sees, stacked: the pill "name service not reached, kept as typed", "The name service did not answer, so only the reference's own species are offered; a name typed in full is kept as typed and checked later.", "Pick a name from the list, or press Add to keep exactly what you typed.", and the cultivar/hybrid example paragraph. Four messages for one field. Keep the pill and one line; move the examples behind "How to write cultivars and hybrids".

## (1) Top friction points, ranked by users lost

1. **No spreadsheet import** (2). Anyone with an existing collection, which is the target audience, faces an hour of retyping before any payoff.
2. **Today is quiet, buried and wordy in the first weeks** (5, 6). The daily screen is the habit loop. For two to three weeks it says "Nothing needs you today by these checks…", and when it speaks the work starts 570 to 700 px down, after method sentences.
3. **No reminders** (section 2). The app only helps when opened; growers who forget to open it forget the app.
4. **Wasted label sheets** (1, 9, 10). A printed sheet with every label off its cell is the moment a hobbyist decides the app is not for real use.
5. **Bulk entry is slower than it should be** (3, 14, 18): the toast over the button, one place per form, four hints per name.
6. **Plants that cannot be told apart** (7, 8): cultivars and crosses lose their names on Today; trays lose their names in the list.
7. **Internal or legal-sounding words** (16, 11), each small, together making the app feel like an audit.

## (2) What a mass audience expects on day one

| Feature | Present? | Fits privacy / no accounts? |
|---|---|---|
| Import from a spreadsheet / paste a list | No | Yes: parsed on the device, merged as changes. |
| Reminders / notifications ("Bench 2 is due") | No | Partly. Local notifications need the page open or Periodic Background Sync (Chromium, installed PWA only). Web Push needs a push subscription held by a server: an identifier, though the payload can be empty ("open Cultifolio"). A no-server alternative that fits fully: export the rhythms as a calendar file (.ics) the grower imports into their own calendar. |
| Photo timeline (one plant over the years, side by side) | Partial: a gallery and log thumbnails, no compare | Yes, all local. |
| Share a plant (a card with photo, name, number, provenance) | Species only ("Share card") | Yes, if drawn on the device and handed to the system share sheet, like the species card; no hosted public page. |
| Wishlist | "Follow" on species exists | Yes. Make it a list: "Want" with a note and a price seen. |
| Purchase tracking / price | Free-text "Price" field, no totals | Yes. A numeric price with currency would allow "spent this year" locally. |
| Plant-shop sourcing (who sells it) | No | Poorly. Vendor listings are editorial or commercial data with no public source of the kind rule 1 requires; on private pages, a grower's own "sources" address book (sellers they used, with links) fits. |
| Multiple collections (home and club, or a partner's) | No; one log per device and vault | Yes: a second vault per collection, or a top-level "collection" tag on places. |
| Export | Yes, CSV inside the backup zip | Yes. Offer "Download plants as a spreadsheet" on `/plants` too; few will look in Backup. |
| Bulk actions (move, water, label a selection from the list) | Move-in on a place page; Water per place on Today | Yes. |
| Search by field number / source | Yes (search covers them) | Yes. |
| Scan a label's QR to open the plant | QR printed on labels | Yes. |
| Seed list / exchange list printout | No | Yes, local. |
| Pot size and medium history | Yes, on Repot | Yes. |

## (3) Where honesty reads as cold, and how to keep it while warming the tone

The facts are right; the problem is that the method and the caveats come first, in full sentences, every time. Rule of thumb: say the outcome in the grower's words, keep the exact rule one tap away, and use "we" or "you" instead of the passive.

| Seen | Keeps the honesty, warmer |
|---|---|
| "Nothing needs you today by these checks: no plant past its watering rhythm (21 days unless …; a record younger than that is not counted), none missed at an audit or unseen for ninety days." | "All caught up. Nothing is past its watering rhythm. (How Today decides ›)" |
| "Forecast not checked: the forecast source did not answer." | "Couldn't reach the forecast just now, so no all-clear for tonight. We'll try again shortly." |
| "This browser has not promised to keep your data. Storage for sites you rarely open can be cleared to make room." | "Your plants live only in this browser. Install the app or take a backup so they're safe." |
| Sync key: "There is no account behind it and no way to recover it: if it is lost the vault cannot be opened by anyone, including us" | "This key is the only way in. Not even we can open your vault, so keep it in your password manager or print it." |
| Batch page header: "They come straight from the image host (iNaturalist, Wikimedia Commons or the GBIF image cache), which then sees which species you grow. Nothing is sent to Cultifolio." | Keep it on the switch in Settings, where the choice is made; on the batch page a single "Show a reference photo" with an (i). |
| "A field number alone is not a provenance; say what you know." | "Not sure? Leave it as Not stated; a field number is kept either way." |
| "Removing keeps the number reserved; the record stays in the change log, and the plant's page offers to bring it back." | "You can bring it back later; its number stays its own." |
| "Name not checked" | "Not matched yet" with a tap to retry. |
| Restore: "and 6 deleted records, update 0 records" | "40 plants, 6 places, 1 batch and 1 photo will be added. Nothing here is removed." Details behind "What's in the file". |
| "No watering recorded · no record · 11 d" | "Added 11 days ago, no watering yet". |

Also: celebrate a little. The first plant, the first germination count and the first flowering are moments a grower enjoys; a one-line "First flowers on 2026-0003" in Today's "Also today" costs nothing and is a plain reading of the log.

## (4) Redesigns for the five most-used screens (cheap ones marked)

**Today**
- (cheap) Move "By place" above the frost watch; the frost watch becomes a one-line strip ("Tonight 4 °C, no frost") that expands, and becomes the big card only when frost or cold is forecast.
- (cheap) Drop the method sentence and "in the order the places are kept"; add "How Today decides ›".
- (cheap) Word the rule with the number in use: "Past its 10-day rhythm (Greenhouse)" (5).
- One Water button per stop that counts every ticked chip, resting ones unticked by default (4).
- (cheap) Chips use the full plant label with cultivar or cross (7).
- A "Watered on…" long-press or secondary to back-date a place's watering.

**My plants (list)**
- (cheap) Last place segment, not the cut path (8); cultivar and cross in the name (7).
- (cheap) Hide "No photo in 12 months" until it can be non-zero for a reason; drop "plant numbers" from the count line.
- (cheap) Replace the grey "–" boxes with nothing, or the species' initials, when there is no photo.
- Selection mode: tick rows, then Water, Move, Label, Archive for the selection.
- "Import" and "Download as spreadsheet" in the head's overflow (2).

**Plant page**
- (cheap) "Log" becomes "Record…"; "0d" becomes "today"; one date style on the page.
- (cheap) Undo on "Death recorded" (12).
- A photo timeline strip under the hero: the plant's photos by date, with "Compare" for two side by side.
- Put Notes above Photographs when the plant has notes; growers read their notes more than the method of the Habitat panel.

**Add a plant**
- (cheap) Toast action "Undo" and the toast above the whole bar (3).
- (cheap) One hint line under Species; examples behind a disclosure (18).
- "Last watered" among the fields "Save and add another" keeps (6).
- Paste a list: one name per line, same place and date for all, each checked against the reference with a short review list. This is the cheapest import and covers the common case.

**Place page**
- (cheap) One column under 520 px (13); month boxes in a 6x2 grid.
- (cheap) Keep the "New place" form open with parent and kind kept (14); "Add 8 benches" later.
- "Water all 17" with a date, and the rhythm and dry months shown as a summary line at the top ("Every 10 days · dry Dec to Feb · held at 5 °C").
- Link "1 growing plant has no place" to a picker (17).

## Checked and sound

- First-run card on `/plants`: three steps that are the right three; "Restore a backup" from the empty state.
- The add form: last-used place filled and said ("last used"); the number preview; cultivar and hybrid parsing (the hybrid's parentage field appeared and filled "Ariocarpus retusus × Ariocarpus trigonus"); "Use my own number"; the leave guard.
- Field numbers carried and shown as chips; place picker shows full paths ("Greenhouse › Bench 1 › Tray A").
- Dry months: in December, Today said "Kept dry this month by Greenhouse's rule: 7 plants, not counted as due" for both nested places. Correct and well worded.
- Watering, Undo on a stop, and the done row's chips kept in place so the next stop does not move under the finger.
- Care events: Feed, Repot with pot and medium, Measure with six figures, Flower with note, Move with Undo, photo with resize and date, Archive and Mark growing logged, Remove and Restore.
- Seed batch: germination as total or "in the pot now", loss with cause, pot-up of 10 with provenance and consecutive numbers, 62% and "first at day 10" computed correctly from 31 of 50 and the first count on day 10.
- Backup (255 ms, CSVs inside, settings carried), restore preview and merge on an empty profile; site restored.
- Sync: setup with the type-back check, join from a second context, edits from both sides merged (watering on one, note and new plant on the other); offline: pages from cache, a watering recorded and queued, Sync saying "Offline".
- Tap targets on Today: Water buttons 44 px tall, chips 54 px (r17.mjs).
- Dark mode at 390 and 1280: the five main screens read well; no contrast problem seen (r14-*.png).
- US locale: °F and inches by default, the example cold floor in °F.
