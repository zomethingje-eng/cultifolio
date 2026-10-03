# Review round fifty-four: two reviews of `8f272a4`

Two reviewers' reports of round fifty-three ("R1", the independent review; "R2", the second reviewer's round thirty-eight), read against each other and checked in source. Nearly everything they confirmed is real, and the two agree on the ones that matter. Numbers group the work: 1 the segment that could not be read on a phone (shipped before the reviews), 2 the snapshot, 3 the reference's products, 4 the Today tab, 5 the deploy. What was not taken is at the end with the reason.

## 1. The selected segment (shipped first)

A tapped button stays hovered on a phone, and `.seg > button:hover` outranked `.seg > .on`: the selected segment of "Your species / All" was ink on ink. One rule; an e2e test hovers the selected button and checks its colours differ.

## 2. The snapshot

The round's guarantee is rule 5, that the snapshot is a reading of the log and droppable without loss. Both reviewers found cases where it was not, and one where a cache of the log wrote to the log.

1. **The revival repair judges a record whole** (R2-5, R1-7; the one finding that rewrote the log). Over the tail of a snapshot load the repair saw a tombstone and an `importedOn` and not the real edit folded before them, removed a plant the grower had revived, and the removal synced. For records the tail touches with an `importedOn` or a removal, every change of the record is read from the vault (`changesOfRecord`, by the `byRecord` index) and the repair runs on those. Test: the real edit in the snapshot, the tombstone and the import stamp arriving after it, the plant kept; a removal in the snapshot and an import stamp arriving after it, the plant removed again.
2. **Every held stamp is in the snapshot** (R2-7, R1-5). The stamp map keeps one held stamp per field, the greatest, so an earlier held change to the same field could never come due from a snapshot. The fold keeps an inventory of every held stamp (`heldStamps`, from what `apply` returns, less what is later folded), the snapshot carries it, and each load re-judges all of them. Test: twenty and forty minutes ahead on one field; the twenty comes due and folds while the forty stays held.
3. **Parked changes are read back** (R2-9, R1-4). `parkedByRecord` was built only as changes were parked, so a snapshot load had none and the Apply disappeared from every record and from the sync page. The parked stamps (few, in meta) are fetched by key after every load and noted. Test.
4. **The one-shape pass sees a parked number** (R2-8, R1-8; a regression of round fifty-three on the whole-log path too). A parked change never reaches the stamp map, so "already numbered" was false and a second number was written over a legacy record whose real number change was parked. The parked changes count. Test.
5. **A stamp parked after the snapshot drops it** (R1-6). `markParked` writes the parked set and drops the fold in the vault; the next load folds the log. The parked set is also saved and awaited by the load or commit that parked, not let go of (R2-11). Test.
6. **The counter is read with the tail** (R2-6). `arrivalsAfter` returns the fold counter from the same transaction as the rows; a load that finds it moved since it read the snapshot throws the snapshot away and folds the log, since a replace numbers the new log's rows after the old snapshot's number and the numbers alone could not tell. The replace and the wipe are one transaction, as the round-fifty-three doc wrongly said they already were. The other tabs' notices are listened for before the load reads anything, and one heard during the load is acted on after it. Test: the rows after a replace carry the replacement's changes and another counter.
7. **A snapshot the build cannot read is a slower load, never a lost collection** (R2-10): every field is checked, the restore is in a try, a record of a kind this build does not know is left to the whole-log fold.
8. **The snapshot is keyed to the build** as well as `FOLD_RULES` (R2-11): the thresholds, the mending tables and the stamp format are the build's; a deploy costs one whole fold per device and removes the class of mistake of forgetting to bump.
9. **No set of every stamp in the log** (R2-26, R1 scale notes): the tab's own writes move its catch-up frontier (the vault returns the arrival number a write took), so `getAllKeys` over the log, forty megabytes and a second or two at four hundred and fifty thousand changes, is gone from the snapshot load. `incomplete` is a derived over the per-kind maps, not a scan per render (R2-27).

The sync page's account of the load is unchanged. DEPLOY.md says that rollback below round fifty-three is not possible on a device that has opened it, and that `order` is not pruned (R2-12, R2-28).

## 3. The reference's products

1. **The id names every product** (R1-9, R2-14). It hashed the index alone, so a dossier change that left its index entry as it was rewrote a sheet under an unchanged id, which every cache held for a day. The id is now a hash of the sorted file hashes, computed after the products are built. Test: two builds of one index with different sheets have the same index hash and different ids.
2. **A manifest is adopted only with the index it names** (R1-10, R2-13). When `b/<id>/index.json` was not there the loader took the top-level index, served it under the manifest's id with a day's lifetime, and never looked again because the manifest's etag had not changed. Now the corpus held before stands (the manifest is logged as not yet whole) until the files are there; without a corpus held, the legacy path answers under the index's own etag, never under the manifest's id. Test: the manifest landing first, the files after, the old isolate finding the manifest.
3. **An isolate holding no manifest looks for one each minute** (R2-16): the first manifest ever uploaded changed nothing such an isolate watched, so two ids were live for the isolate's life.
4. **No legacy sheet file under a manifest** (R2-17, R1-10): the thirty-two-bucket sheet files beside the index are another corpus's layout.
5. **The bucket count is on the wire** (R1-11, R2-15). A two-digit name is valid under thirty-two buckets and under sixty-four, so a device on the old count took half a bucket's species for the reference lacking them. The device names the count it hashed by (`&n=`), a count that is not the one served is a 409 (`no-store`), the device forgets the corpus, reads it again and hashes again once; a second refusal is "not reached". A corpus read that did not come (offline) is no longer kept for the page's life. The manifest's `files` map is required by `isManifest`, and a product the bucket lacks is remembered as lacking for a minute (R2-18).
6. **The front page's cache key reads the product** (R2-18, R1-12): the hook called `catalogueOf` for any `?at=`, `?from=` or `?open=` and so built the in-memory catalogues the products retired. A query with no words prepares nothing (R1-12).
7. **A shard that finds nothing exactly asks the whole** (R2-19). "hile" for Chile found fifty h-species and stopped, where the whole index found five hundred. When the exact pass over the shard finds nothing, the query runs over the whole index prepared for that request and let go; the ordinary path stays on the shard. Test.

Not done, with the reason: verifying each product's bytes against the manifest's hash on every read (R1-10) costs a hash of every file read; the id-named directory and the index-first adoption are the guard, and a tampered file in a private bucket is not a threat this project defends against.

## 4. The Today tab

1. **A watered stop stays where it was** (R1-1, R2-3, R2-24): marked "Watered N ✓" with its own Undo, for ten minutes, so the stop below never slides under the finger and a tap meant for it cannot reach the toast's Undo; two stops in turn each keep their Undo. The toast still names the place, "no place" included.
2. **The day is the day store's** (R1-2): a page open across midnight dates the morning's watering today. e2e, by a shifted clock.
3. **The empty state says what is true** (R1-3): no record meets the checks, not that every plant was watered.
4. **The frost watch re-reads** (R2-2): when the site changed, when the answer is older than the forecast's half hour, on every navigation and every return to the tab. A site set in Settings is watched on the next tap; a frost that appears overnight shows on a page left open. e2e.
5. **The forecast is read once** (R1-13, R2-22): the client coalesces requests in flight by their key, so the watch and the Today tab share one. e2e counts.
6. **Said once** (R2-4): the bar is not on the front page, which has the line; the risk card is the sentence, not "FROST Frost"; the count is plants, each once.
7. **A watering dated ahead of today is its own row** (R2-21), not "no watering recorded"; the front page's line counts it apart.
8. **The habitat's dry season is on the stop** (R2-23): plants in their rest are their own row with "Water these too"; the stop's button waters the rest.
9. **As a grower at six in the morning** (R2-25): the forecast is one line with the nights folded under it (open when there is a frost); plants run in label order; "N growing" counts the whole place; "no record · 24 d"; plant links are tap targets.

Not changed: the photograph line counts from the acquisition date (R2-25's last point), on purpose since round forty-nine; a plant the grower says they have had since 2015 and never photographed is the plant the line is for.

## 5. The deploy

The live check bounds every request (twenty seconds), reads the build it is checking for from the output on disk when it runs beside one, and fails when the pages name another build after a minute of waiting; two pages agreeing is no longer taken for the deploy having taken (R1-14, R2-20). The old `/frost` address being seen live by R2 was a fetch tool's cache, not the site.

## Not taken, or later

- **Per-device sequence numbers on the wire, operation ids, the `auto` rank, the rest of the data-model list.** R2's argument stands: the snapshot makes every repair that reads "all the changes" partial by construction. This round reads a record whole where a repair needs it; retiring the repairs into versioned fold rules is the next step and a round of its own.
- **The index off the Worker's heap**: still the target after this; the products took everything else out.
- **Pruning `order`**: needs a frontier every open tab agrees on.
- **Verifying product bytes against the manifest's hashes**: see 3.

## Counts

469 unit tests on 46 files, 97 e2e, local live check 10 of 10.
