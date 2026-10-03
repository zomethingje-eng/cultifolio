# Review round fifty-five: two reviews of `010d530`

Two reviewers' reports of round fifty-four ("R1", the round thirty-nine review; "R2", the independent review), checked in source finding by finding. Both found the same first thing, an own write that carried the catch-up frontier over another tab's unread row, and both found that round fifty-four's Today fix had not closed the case it claimed to. Numbers group the work: 1 the frontier, 2 the snapshot, 3 the client's buckets, 4 the reference on the server, 5 the Today tab and the frost watch, 6 the deploy.

## 1. The frontier (R1-8, R2-1; both reviewers' first priority)

`commit` moved `lastSeq` to the arrival number of its own write, so a row another tab had stored just before was skipped by every later catch-up until a reload. The vault now returns the first arrival number a write took as well as the last; the frontier moves over the write only when its first row follows the frontier with no gap, and a gap starts a catch-up, which folds the other tab's rows and skips this tab's own. Test on the real vault: a peer's plant stored, an own edit stored after it before the notice, both plants on screen.

## 2. The snapshot

1. **The frontier of a refreshed snapshot** (R1-12, R2-2). A tail past a thousand changes was folded into a fresh snapshot written under the old snapshot's number, so every later load folded the same tail and rewrote the whole snapshot. It is written under the tail's number, with the count folded. Test: the snapshot's number moves by the tail, and the next load reads a tail of nothing.
2. **The import stamp is not an edit, in the fold** (R1-10, R1-11; FOLD_RULES 2). The revival repair wrote removals at load, so a reading of the log wrote to the log, and a repair interrupted between the snapshot and the commit was lost on the snapshot path and done on the whole one. R1's rule is taken: in `apply`, an `importedOn` change does not move the record's latest-edit stamp, so a removal followed only by an import stamp stays a removal on every device and path, by maxima alone. The load's repair, `revivedAmong` and `changesOfRecord`'s use for it are gone; the removals earlier builds wrote stay in the log, harmlessly. The formats page states the exception. The round-sixteen test now expects no removal written.
3. **A dismissed parked number** (R1-9). `readParked` read back only the parked stamps not dismissed, so a dismissed parked number left the one-shape pass free to write a second number on a snapshot load. Every parked stamp is read back; the lists filter the dismissed out themselves. Test.
4. **The parked set between tabs** (R1-7). Another tab could fold a just-parked change as ordinary and write a snapshot with it. The stamps are stored and the snapshot dropped in one transaction (`parkStamps`, a union with what is stored), the other tabs are told to fold again, a rebuild and a load read the parked set after the counter, so a park between them refuses whatever snapshot they write.
5. **A snapshot holding an unknown kind is not read** (R2-3). The round-fifty-four account said it fell back to the log; the code skipped the record. It throws, and the load folds the log. The stamp map's arrays are checked as pairs of strings. Test.
6. **An older build does not overwrite a newer build's snapshot** (R1-14): after a deploy the old shell and the new folded and overwrote each other's snapshot in turn. Test.
7. **Smaller** (R1-11, R1-15): the number repair counts a repair already restored by a snapshot (the stamp map, the held inventory) as present; the snapshot's newest stamp excludes held ones; the records are copied when the snapshot is taken, since the store clones them after an await.

Not taken, with the reason: a plain `Map` for `state` and a slimmer stamp map (R1-13). The measurement is real (5.3 to 6.1 s from a snapshot at 450,000 changes on a throttled phone, against 23 to 24 s whole); `state` is what the record pages read reactively, and changing it is a change to every page's reactivity, which wants its own round and its own measurement. The `order` store's pruning stays where DEPLOY.md puts it.

## 3. The client's buckets (R1-16, R1-17, R1-18, R2-4)

1. **One captured corpus read per batch.** `entriesFor` and `sheetsFor` hashed by one read and `withCorpus` named the count from a second; after a failed read the second could be a newer corpus, and the server, seeing its own count, answered a 64-bucket bucket for names hashed by 32. A species present read as absent. The bucket names, the id and the count a request carries now come from one read, passed to the request.
2. **The page's caches are keyed by corpus, count and bucket**, so a bucket of one layout is never read as a bucket of another.
3. **A 409 forgets only the read it was made under**, so a slow refusal from one call no longer wipes another call's fresh read or its caches.
4. **`n` is a bucket count only on bucket requests**; the search and the rows, where `n` is a limit, no longer carry it.
5. **A request that names no count is taken as thirty-two** (R1-19), so a shell from before round fifty-four meeting a larger corpus is refused rather than answered half.

Tests: the failed-then-fresh read sends the 32-bucket name with `n=32`, is refused, and asks again under 64 and finds the species; a page opened offline on B/64 asks again under A/32 when online; a failed read is not kept.

## 4. The reference on the server

1. **A missing product's minute runs from the miss** (R2-5, R1-22). Every hit renewed it, so under steady traffic an uploaded file was never seen; a thrown read was cached as a miss. The miss carries the moment it may be asked for again; a thrown read is not remembered. Test with fake time: busy for forty-five seconds, still one read; at sixty-one, read again.
2. **The product cache is bounded by size** as well as count (R1-21): twenty-four megabytes, most recently used kept.
3. **The whole-index pass is bounded** (R1-20, R2-6). A query with no word returns at once; the pass runs only for a first word of four letters or more (the near pass forgives nothing shorter); concurrent misses share one preparation, let go when the last is answered; and it has a rate bucket of its own, sixty an address per ten minutes. Test: three queries that prepared the whole index before prepare nothing. The candidate-shard design both reviewers sketch is the right end state and goes with the index off the heap.
4. **A manifest the Worker cannot read is said in the log** (R1-24) rather than falling back in silence.
5. **DEPLOY.md says what a refresh uploads** (R1-23): the whole directory under the new id, about 36 MB at nine thousand species.

Not taken: sharding the search by name words only (R1-21), which changes what a search by origin or family finds; it goes with the candidate-shard design.

## 5. The Today tab and the frost watch

1. **The toast has no Undo, and lets taps through** (R1-1). The stop carries its own; the toast sat where the next stop's button was, and a tap meant for that button undid the stop just watered. A toast with no action no longer catches taps at all.
2. **The stop keeps its height** (R1-2). The header kept its place but the plant rows came from the live due list, which the watering emptied, and the stop below rose under the finger. The plants just watered stay on the stop as a done row, the Undo takes the Water button's place in the header, and the stop keeps the height it had when watered. e2e at 390 px: the next stop moves under 24 px, and what is under its button is its button.
3. **The date at the tap** (R1-3, R2-8): read from the corrected clock when the tap is handled, and the day store set from it.
4. **The watch reads again on a timer** (R1-4): every five minutes while a page is in view, and the Today tab's full forecast follows each re-read, so the card and the bar agree. `/about/how` says when the watch asks.
5. **Only the current read publishes** (R2-7). A slow answer for the site before it was changed overwrote the new site's risk; each read carries a generation and an earlier one publishes nothing, and the old site's reading is cleared when the site changes. The Today page's own load has the same guard. Test.
6. **One reading of a watering dated ahead** (R1-5): it is not due anywhere (the collection's due list leaves it out), and the plant page, the plants list and Today say "watering dated …, ahead of today". Today lists it as a fact, with no button.
7. **The four slips of R1-6**: the stop's Water button stays when the dry-season row is watered first; the marks and their Undo live in a store for the app's life, so a trip to another tab keeps them (e2e); the Water buttons wait until the sheets have answered or failed, so their count does not change under a reading eye; the front page's "Water these" leaves the plants in their habitat's rest, as the stop does.
8. **Tap targets and scroll margins** (R1-25, R2): Water buttons 44 px, plant links 40 px, stops clear of the tab bar when scrolled to.

## 6. The deploy

Every request in the live check has a twenty-second deadline, the thumbnail and HEAD requests included (R1-25); the rollover wait is ninety seconds by the clock and the whole check five minutes (R2). The build to expect is `LIVE_CHECK_BUILD` when given, else the output on disk only when it was built in the last fifteen minutes, so a check after a test run does not fail a good deploy.

## Not taken, or later

- `state` as a plain `Map` and a slimmer snapshot (R1-13): its own round, with a measurement.
- The candidate-shard near pass and name-word shards (R1-21, R2-6): with the index off the heap.
- Content-addressed product files (R1-23): the same round.
- `repairNumbers` and the one-shape pass as fold rules: the data-model round. The revival repair was the one whose two paths could disagree in what they wrote; it went first.

## Counts

481 unit tests on 48 files (three new), 98 e2e (one new), local live check 10 of 10.
