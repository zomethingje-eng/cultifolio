# Review round fifty-one: time, photographs, and what grows with n

One review (the reviewer's round thirty-six, against `9f3f80e`, read against `a5ef2bf`), checked in source finding by finding; everything taken is below with its test, and what was not taken, or waits, is at the end with the reason. The reviewer's three "before launch" items lead: the clock correction that partly backfired, the photograph that could come back without pixels anywhere, and the Worker's memory at fifty thousand species. Numbers group the work by layer: 1 is time, 2 the photographs, 3 the writes, 4 the flows, 5 the collection's speed and its files, 6 the server and the reference.

## 1. Time

The reviewer's principle, taken whole: time is one persisted, bounded thing, and "when it happened" is not "which edit wins".

1. **The correction is kept across loads** (E3). The server-clock offset was a module variable: every tab started at zero, the first edit (the one-tap Water in the first seconds) was stamped by the wrong clock, and the next load adopted those stamps. It is in `localStorage` now, read before anything is stamped; a device that never syncs keeps its own clock. Test.
2. **It is bounded, and does not flap** (E4). A correction of two days or more is taken only when two readings in a row agree on it to within the threshold, so one wrong `Date` (a captive portal, a proxy) moves nothing; a correction in force is dropped only once the clocks agree to within half the threshold, so a device thirty seconds off no longer flips between corrected and not; an answer without a `Date` header (a dev server) leaves the correction as it was rather than resetting it mid-run. Tests.
3. **A changed correction re-judges the holds** (E3). A device hours behind held its peers' latest changes at load, and nothing re-checked them after the pull put the clock right; the engine re-folds the collection and re-scans the holds when the offset changes. 
4. **Event dates come from the corrected clock** (U1). `localDate()` read the device clock, so the phone set to 2031 dated its waterings 2031 while its stamps were being corrected. Test.
5. **A correct device no longer stamps into the future to beat a wrong one** (E2, U1). An edit to a field whose held change was stamped years ahead was bumped past that stamp, so the correct device's edit was held everywhere else and that device was told its clock had jumped back. The bump now applies only to a held stamp within a day of the corrected clock (a clock a few hours wrong, where the edit keeping its field is worth a short delay); past that the edit is stamped at real time and shows everywhere at once, and the held change is the last word when it comes due. `FOLLOW_HELD_MS`; test in `vault-store.test.ts` alongside the round-forty-nine one.

Not changed: the fold is still last-writer-wins by stamp, and a change stamped years ahead still applies when it comes due. The reviewer's further step, two dates per event and an `auto` rank in the fold, is noted under "later".

## 2. Photographs

1. **A revived photograph is sent again from the device that kept the pixels** (E1). B removed a photograph and pushed; D folded the removal and dropped its pixels; ten minutes on D had the server drop the bytes; B, offline meanwhile, tapped Undo and pushed the revival, but `photosPushed` on B still listed the photograph, so no device ever uploaded it again and the record showed blank everywhere but B, for good. The engine notes which photographs were removed at the last run; one of them live again, with pixels here, leaves `photosPushed` and is sent on the next push. The two-device harness walks the scenario in `sync-engine.test.ts`.
2. **A removal needs a proof the token cannot make** (E1). The DELETE route let anyone holding the bearer token, but not the key, destroy photograph ciphertext. The upload now leaves `X-Photo-Drop`, the HMAC of `drop:<id>` under the vault's naming key, which the server keeps with the object; the DELETE must repeat it or is refused with 403, and an object stored before proofs were kept cannot be deleted (the device notes it once and leaves the bytes). Server tests; the formats page says so.
3. **A failed removal is a note, not a failed run** (E7). A 500 or a 405 from an older Worker threw after the pull, so `lastSync` stopped advancing although the pull had succeeded. The run reports it and asks again next time.

## 3. The writes

**The pairs that were still two commits** (E5). The plant edit form wrote the fields, then the rename note, then the move line, then the acquired line; the notes editor wrote the text, then "Notes replaced"; the place form wrote the fields, then the parent. `putWith(kind, id, fields, events, also)` writes a record edit, its lines and the other records it restates in one commit, and the three forms use it (the place form checks the move first and writes the parent with the rest). Test: one commit heard, a refused vault keeps all of it out.

## 4. The flows

1. **Move has an Undo and cannot double-write** (U2). `movePlantsUndoable` returns the way back (each plant's place as it was, the lines written) and one Undo puts the plants back and removes exactly those lines, in one commit; a plant moved on since the move is left where it is. The place page's Move and the plant page's Move both offer it, and the place page's Move is guarded while it commits. e2e.
2. **Replace says what it loses** (U3). The confirm counts the plants and batches that exist only on this device, names the first six, and offers to back up first.
3. **Merge says what it renumbers** (U4). The preview applies the repair's own rule (the earlier creation keeps the number) to the merged state and names this device's plants that get new numbers, with a warning about printed labels, and the file's plants that get new numbers here. The repair's note no longer blames "a device that was offline". Test.
4. **Every field is 16 px on a phone** (U5). The theme's rule lost to the pages' scoped sizes (the Add form's 14 px, the labels page's 13.5 px); it is `!important` now, for every input but a checkbox, radio, range or file.
5. **The toast is above the Add form's pinned buttons** (U6). After "Save and add another" it covered them for eight seconds.
6. **The Add form** (E9, U9). `busy` covered only the write; a second tap during a slow name check made a second plant, so the check guards too. The unload guard the comment promised is there (`beforeunload`), and `dirty` counts the price, the count, the provenance and a changed date. Enter is Add: the primary button is first in the markup and the order on screen is CSS. e2e.
7. **Words** (U9). "no watering recorded; the record is 0 days old" reads "no watering recorded yet; added today"; "Potted up 3" is said once, by the notice; a failed photograph's credit is a sentence, not doubled parentheses.
8. **Docs** (the reviewer's "docs that disagree"). The formats page's privacy paragraph now carries the search exceptions and the row requests; the how page says photographs are removed from the server and how the removal is proved.

## 5. The collection's speed and its files

1. **A restore reads the store once, not once per change** (P2). `appendChanges` read the store for each change in sequence to find collisions; a batch past sixty-four changes now reads the keys in its range in one call and reads in full only the stamps among them. Restore and replace share the path.
2. **Labels** (U7). The QR codes are made in one batch and assigned once (each assignment copied the whole map); the care lines are set by key; preview pages off screen are not laid out (`content-visibility: auto`, screen only, so print lays out every page).
3. **My plants** (P4, U8). Each plant's searchable text is folded once per change to the collection, not per plant per keystroke; days-since-watered is read once per plant per list, not per comparison; the list is drawn in pages of two hundred as the reader scrolls, with a More button as the fallback.
4. **`events.csv`** (E8). Measurements are written as the label and the unit ("height 42 mm"), and an entry on a removed record is marked in its own column. Test.

## 6. The server and the reference

1. **One row list per index** (P1). Nine catalogues (three groupings by three chips) each held their own copy of every row; the items are made once per index and shared, and a genus is appended to rather than copied per species (the same quadratic copy was in the featured-strip grouping). 
2. **One load per isolate** (P1). Concurrent requests after an upload each parsed their own index; one loading promise is shared.
3. **An older corpus's sheet buckets are dropped** (P1) when a new corpus's first bucket is kept.
4. **No self-fetches under a bucket corpus** (P9). When the index came from R2, a dossier or genus record the bucket lacks is absent, and the Worker no longer asks its own origin for it (a subrequest that always answered 404).
5. **Maps once per index** (P6). By key, by genus (sorted) and by synonym, built on first use and kept with the index: the species page no longer builds a key map and sorts the genus per render, the unknown-address path no longer scans every synonym and counts the genus, and the featured pool is chosen once per index.
6. **`/api/index` is rate-limited** (P8): six per address per ten minutes. No page reads it; the live check and scripts do.
7. **The service worker** (P10). The reference's answers (a dossier, an entries bucket, a sheet bucket), keyed by corpus id, live in a cache of their own that a deploy leaves alone, so a device does not download its species again after every deploy, and the first answer under a new corpus id drops the old corpus's; a navigation is held under its path alone, so `/?by=origin&chip=climate` and `/species/x?was=y` no longer mint copies.

## Not taken, or later

- **The local snapshot of the folded state** (P3, the reviewer's top-three #2): the right next step for the 6 s load at 450k changes, and a round of its own; the per-device sequence numbers on the wire come after it.
- **Buckets scaling with n** (P5): a protocol change that `/api/corpus` must announce and every client must read; with the reference at 9k it is not yet the bottleneck. With the catalogue and search shards (the reviewer's #3).
- **Compact search structure and build-time catalogue windows** (P1 remainder, the reviewer's #3): the shared row list takes the nine copies to one; the search's prepared structure is still per isolate. Next round, with the scaling work.
- **The origin view's map per row sent twice** (P7): the coastline is already a `<use>` reference, so each row's map is a few hundred bytes; the 1.2 MB measured is the hydration data of sixty rows and is not reproduced with the fixture corpus. Measured on the live site next round before anything is changed.
- **Two concurrent DELETEs undercounting** (E6): clamped at zero and corrected by the daily recount; left.
- **Two dates per event, an `auto` rank in the fold, operation ids, an undo history, a selection mode, a scan button, Today by place, "Can I grow it here?"**: the reviewer's design list, each noted for a round of its own.

## Counts

443 unit tests on 44 files (six new), 93 e2e (one new), local live check 10 of 10.
