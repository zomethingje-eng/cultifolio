# Review round fifty-two: three reviews of `0b7604c`

Two reviewers' reports (the first's round thirty-seven, the second's independent review) and my own, all against `0b7604c`, read against each other and checked in source. "R1" is the first reviewer, "R2" the second, "own" mine. What was not taken, or waits for round fifty-three, is at the end. Numbers group the work by layer: 1 is time, 2 the photographs, 3 one tap one action, 4 the records and the forms, 5 the collection's speed and the server, 6 the reference's words.

Two decisions were the author's: a change from a broken clock is parked with Apply rather than held until due; and the plant page's address reaching the server on a first visit is disclosed rather than moved behind the fragment.

## 1. Time

The round-fifty-one correction worked when it ran and was wrong around the edges: in memory before the second reading, reset by a reload, counted twice by one pull, outliving a clock set right, unknown to a sibling tab, and defeated by a clock that had already ticked ahead. And the rule that held a far-future change until due let it overwrite real edits years on, while the device that wrote it never converged. All of R1-2 to R1-7, R2-3, R2-4, R2-8, own U3 and U4.

1. **The pending reading is kept** (R1-2). A large correction's first reading lives in `localStorage` beside the offset, so one sync per page load still gets a device corrected on the second load.
2. **One reading per run, a minute apart, within five minutes of each other** (R1-5). The pages of one pull were two readings a second apart; now only the first page of a run reads the clock, the second reading must come at least a minute after the first by the device's clock, and the two must agree to within five minutes (a wrong answer is off by hours or days). A reading just under the two-day bound was taken alone before; it still is, since under two days no single reading can move a stamp past the hold.
3. **Cleared by Stop syncing, lapses after a week** (R1-4). No server, no correction: a device that stops syncing with a correction in force would have stamped by it for good after its clock was set right.
4. **Shared with open tabs** (R1-6, R2-8). A `storage` listener; a tab that learns of a correction re-folds and re-scans its holds.
5. **The clock that mints stamps restarts after a correction** (R2-3). `Clock.tick` carried its last wall forward, so a device a year fast went on minting a year ahead after the correction. Once the corrected time is more than the window behind the last stamp, the clock restarts from it. Test.
6. **No stamping past a stamp from when the clock was wrong** (R1-3). The round-eight bump past this device's own earlier stamp applies only within a day; past that the edit is stamped now and the old stamp is parked on the next rebuild.
7. **Parked, not held** (R1-3, R2-4; the author's decision). A change stamped more than two days past its batch's arrival at the server (or, for a change made here, past the corrected clock) is a broken clock's: appended to the log, never folded on its own, listed on its record with Apply and Leave, and counted on the sync page with the same two buttons per record (a record created under a wrong clock has no page of its own to list it on). Apply writes the same values as an edit made now, so every device takes them; the parked stamps stay parked everywhere, in meta, whatever the clock later says. The arrival is the server's, so every device parks the same changes; this device's own are not exempt, so a device whose clock was wrong parks what it wrote then and converges (R2-4). A clock a day wrong is still held and comes due; two days is past any drift and short of any slip in a year. `PARK_MS`, `isParked`, `Hold.arrival`, the collection's `parkedStamps` / `parkedFor` / `applyParked` / `dismissParked`, the engine's park at `takeBatch`, the `Parked` component on the plant, place and batch pages, the sync page's list. Harness test: peers park by arrival, the fast device converges once corrected and stamps at real time, Apply converges a third device; store test: a device a year fast parks the plant it added, lists it, applies it afresh.
8. **Numbers from the corrected year** (R1-7). `nextAccession` and the batch numbers read the corrected clock: a phone set to 2031 minted 2031-0001 for good.
9. **The warning reads** (own U3): days, months, "about a year". A device a year ahead is no longer told its clock jumped back: its parked stamps are not counted as its last own stamp.
10. **The dev server sends `Date`** (own E4; R1 and R2 both built a proxy for it). The hook sets it on sync answers from the Worker's clock, which is the edge's. The three-device scenario (a year ahead corrected and dated today everywhere; five years ahead parked, applied) is in the e2e suite against the real server.

## 2. Photographs

1. **A removal is noted when it is folded, and verified before trust** (R1-10, R2-5). Round fifty-one's rule compared the removed set between two successful runs, so a removal pushed but never followed by a successful pull, or a revival made on a device that never saw the removal folded (an offline caption edit), escaped it. Every photo `_deleted: true` folded from anywhere (here, a pull, a file) goes into a persisted set; before trusting its upload record the push asks the server (one HEAD each) about any of them that is live with pixels here, and a 404 takes it off `photosPushed` so it is sent. A pull that noted removals pushes again in the same run. Both scenarios in the harness.
2. **Photographs uploaded before the proof** (R1-17) stay undeletable, by design: attaching a proof to an existing object would let a token-holder replay the ciphertext with a proof of its own and then delete. Disclosed on the how page, with the date.

## 3. One tap, one action

R1-9, own U2, R2-1. An early return guards Water all, Feed all, Finish audit, Record count, Record loss, Pot up, Today's Water these and the plant page's Water; the row Water and the plant page's Water refuse a second watering on a day that has one ("already recorded as watered today"). `potUp` reads the pot inside its claim, and claims run one at a time in a tab, so two submits for the last seedling make one plant; a merge that overdraws the pot (two devices potted the same seedlings apart) is said on the batch page with the arithmetic, not clamped to zero (`sowingStats.overdrawn`). Tests.

## 4. The records and the forms

1. **Edit forms write only what the grower changed** (R1-1, the first reviewer's first fix). The plant form and the place form sent every field from the snapshot taken when they opened, so a field changed meanwhile (another tab, a sync) was written back over. Each form remembers how it opened and writes the fields it touched, with what the name decides (key, kind, parentage, name as received) and what the place decides (the free-text place) grouped with their field.
2. **Species notes log a replaced text** (R1-8), as plant notes do, on the plant the edit was made from.
3. **Pot-up lines carry the plants by id** (R2-2) and show their current numbers, so a renumbering after a merge does not leave a line naming the wrong plant. `event.plants`; documented.
4. **Replace counts the records edited here** (R1-15) as well as the ones only here.
5. **A date before 1900 is refused** (R1-16, own U1) on the Add form, the edit form and the batch form, with what the number would have been.
6. **No number migration while a batch is set aside** (R1-11): the batch may hold the number, and a written one stamped below what this build can see would still outrank it.
7. **Loops in the place tree are cut the same way on every device** (R1-12): the walk is in record-id order.
8. **Unsaved edits ask before a navigation** (R1-14) on the plant page (the edit form, the notes, the species notes), the place page (the form, Move plants here, an audit) and the batch form, as the Add form has since round forty-nine.
9. **Fixtures stand in only under the fixture corpus** (R2-10, the second reviewer's third fix). Under a real index, a species or genus record the bucket lacks is absent; it was the synthetic fixture, with its made-up figures and quotation. Test.

## 5. The collection's speed and the server

1. **A colliding merge reads the store once** (own E1). Round fifty-one skipped the stamps not present; a merge of a file of this same collection collides on every stamp, and each was read in full in sequence (47 s for 7,000 on the test IndexedDB). Past two hundred collisions the stored changes in the range come in one read.
2. **`due` is derived** (own E2; R1-26 in part), once per change and per day, not scanned on every read by Today, the chip and the list.
3. **Labels** (R1-24): the asking and no-night sets are reactive sets mutated in place (a copy per answer was quadratic), sheets are asked for once per plant, and Clear shown is a set lookup.
4. **The Worker** (R1-27, R1-28, R2-12): the old index and everything hung on it go before the new one is parsed, so a refresh holds one generation; the search structure and the bucket map are built with the index, not inside the first request that needs them; the entries route reads its buckets from that map rather than hashing every slug per request.
5. **The page cache key carries the corpus id** (R1-33): a page held across an upload showed the old corpus for a minute.
6. **The service worker** (R1-30): it prunes the corpus cache once per worker life, so a restarted worker drops an old corpus's answers too.
7. **The front page's own search** (R1-31) draws at most sixty hits and keeps Today mounted while the box is typed in.
8. **Map coordinates are rounded** to a tenth of a degree (R1-32), under a pixel at any size the maps are drawn.

## 6. The reference's words

1. **A refusal is not an absence in the search rows or the genus counts** (R1-18): a search row says "climate not checked" for a refused species, and a genus row counts "N not checked" apart from "N with climate".
2. **Pending is pending** (R1-19): the care line and the labels page say "climate pending", apart from "not checked".
3. **The figure cards' source lines wrap on a phone** (R1-20): round fifty's two-line clamp ended them in "…" before the source's name, on the one screen where a stranger decides.
4. **A thumbnail the host did not serve says so** (R1-22) in its square, in the photo grid and in a search row (the initial comes back).
5. **Phone rows say "seen today"** after an audit (R2-7).
6. **Words and layout** (R1-34): the plant page's "The record" heading no longer repeats Provenance's; the accession chips on the species card have a gap, not stranded commas; the Move plants here panel is set in the UI face; the Add form's pinned buttons keep the gutter; the labels link on My plants no longer squeezes the search box.
7. **Docs** (R1-23, R2-6, own E9). The formats page: the merge rule's four refinements (the tie, the required fields, removal against later edits, hold and park), what a token-holder can and cannot do, the clock correction and where it is kept, the parking rule, the `plants` field. The how page: photographs uploaded before the proof, the two things kept outside the collection (the clock correction, the last place used), the plant page's address reaching the server on a first visit, and the rate windows as they are pruned.

## Not taken, or later

- **The local snapshot of the folded state** (R1-25, R2-9, own E3), with both reviewers' cautions: fold by arrival, not by stamp; invalidate on a changed hold set, a clock correction, a replace, a displaced change and a fold-rules version. Round fifty-three, with the per-write index rebuilds (R1-26) that it makes cheap to address.
- **Search shards and catalogue windows at build time, buckets that scale, incremental builds, an immutable corpus manifest** (R1, R2): round fifty-three.
- **The Today tab**: round fifty-three, with R1's condition (a frost alert reachable from every tab) and R2's (unknown dates distinct from overdue).
- **Operation ids, an undo history, a `base` on every field edit, Kleppmann's move for places, atomic create, a photo inventory on the wire, propagation as reconciled operations** (R1, R2): the data-model list, each a round of its own; parking and the touched-fields forms take the two most visible cases without them.
- **The replace's four minutes at 5,000 plants** (R1-29): the preview's double fold and the triple write are the snapshot round's.
- **The origin view's size** (R1-32 in part): the rounding is taken; each map sent twice (markup and hydration data) stays until the catalogue windows are built at build time.
- **The climate chart's "cold quarter" label meeting the frost line, a landscape photo's band, the merge preview counting a removed plant's entries, "11 field changes kept here"** (R1-34): noted, not reached.
- **The fixture's double licence** (R1-21): the fixture's attribution names CC BY while its licence field says CC0; the credit function is right to add the field's licence when the text names another, and real data does not disagree with itself.
- **Water all twice within the hour** (own): guarded against a double tap; a deliberate second watering of a bench stays a second line, with Undo.

## Counts

450 unit tests on 44 files (seven new), 94 e2e (one new, the three-device clock scenario against the real server), local live check 10 of 10.
