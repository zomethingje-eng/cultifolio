# Round fifty-six: what round fifty-five left

No new review. This round takes the four items round fifty-five put off ("Not taken, or later"), measures each against the real corpus or a collection of a realistic size, and does what the measurement supports. Numbers group the work: 1 the search, 2 the product files, 3 the data model, 4 the collection's load, 5 the index on the Worker's heap.

## 1. The search: postings instead of shards (R1-21, R2-6)

Round fifty-three's search shards held whole prepared entries, filed under the first letter of every word an entry has. Built from the real index (8,947 species), they came to 63 MB across 25 files; `search/c.json` alone was 5.3 MB, larger than the index (4.3 MB), since nearly every species has some word beginning with c (Cactaceae, Chile, Cape). A query read and parsed one of them, and a miss prepared the whole index for the request. No `--index` has been run since round fifty-three, so none of this ever reached the bucket; the live Worker still holds the whole prepared index (no manifest).

The build now writes postings (`src/lib/core/postings.ts`): for every word of every entry, its one-, two- and three-letter prefixes, and for a word of three letters or more the first three letters after deleting its first, second or third letter. Each key lists the entries under it, by their place in the index. The exact pass ranks the entries under every query word's prefix key, prepared for the request; when that finds nothing, the near pass ranks the entries under the near keys of each word of four letters or more. Every near match (one insertion, deletion, substitution or adjacent swap against the start of a word, the search's own rule) shares a key with its query word: the proof is by the position of the first difference, written out in the module. The candidates are the intersection over the query's words, so "cop cin" ranks the handful under both.

Measured on the real index: 64 posting files, 3.1 MB in all, the largest 86 KB. Over 1,521 queries (names, slips at every position of the name and the genus, prefixes of one to five letters, origins, families, older names, rank markers) the answer from the postings was identical to the whole index's, key for key and in order. The postings answer in 10 ms a query against 23 ms for the whole index prepared and held. The whole-index pass, round fifty-five's bounded fallback, is now reached only when a posting file is missing from the bucket, under the `searchmiss` rate, and past that rate the answer is a 429 with a Retry-After, not "nothing matches".

Tests: the keys are shared over every one-edit variant of 300 random words with and without tails; the candidates' answer equals the whole's for 600 generated slips and prefixes over a 2,500-species synthetic corpus; the route answers through the postings (a tampered posting is believed) and falls back under the rate when a file is missing. Mutation check: dropping the third deletion key fails both property tests.

R1-21's name-word shards are not taken: they change what a search by origin or family finds, and the postings make them unnecessary.

## 2. Product files under their hash (R1-23)

Each product is written to `s/v2/p/<md5 of its content>.json`, and the manifest maps names to hashes. A file under a hash never changes, so nothing is ever cached under the wrong content, and a refresh uploads only files whose content changed: the index, the buckets of the species that changed, and the postings only when a species was added, removed or renamed. Round fifty-three's layout (every file under a directory per corpus id) would have uploaded 72 MB on every refresh at nine thousand species; the products other than the sheets are 11.7 MB in all now, and a typical refresh carries the 4.3 MB index and a few buckets. `--index` keeps the manifest before the current one as `manifest.prev.json`, deletes from `static/s/v2/p` what neither names, and says what it wrote; DEPLOY.md gives the `rclone sync` that prunes the bucket's `p/` a day later. A manifest naming anything but hex hashes is not a manifest (a hash is a file name and nothing else). Tried end to end on a copy of the fixture corpus: a second run writes nothing, a changed corpus writes only its new files, a third prunes the first corpus's files and keeps the second's.

## 3. The data model: no reading of the log writes to it (rule 5)

Two load-time writers were left after round fifty-five retired the revival repair.

1. **The one-shape pass** wrote `acc`/`no` onto plants and batches of the oldest shape, whose number is their id. Its purpose was to let the readers that take either shape go; they cannot go, since files in flight carry the old shape, and every page already reads through `accNo`/`sowNo`. The pass is gone; the three lookups that read the field directly (find by number, find a removed plant by number, find a batch by number) read through `accNo`/`sowNo`. The formats page says nothing rewrites an old record into the newer shape.
2. **The duplicate-number repair at load** (round thirty-eight, R2-1) is gone from the load. A repaired number must be written to be stable on labels, so it is not a fold rule; it is written where the log is written anyway: after a merge (import, sync), when a removed plant comes back, and now when the grower asks. A plant or batch whose number another live record shares says so on its page and offers "Renumber now", which runs the same deterministic repair (the record created later takes the next free number, with the note). The page that "answered to the first of the two for good" now says why.

Tests: a load over two plants under one number writes nothing, both are listed and reachable, each knows the other shares its number, and the repair renumbers the later one with its note; an old-shape plant and batch are found by number and the log is unchanged; e2e: the notice on the later plant, nothing written by opening the collection, the button renumbers it to the next free number and the notice goes.

One writer of the same kind remains, found by this round's e2e test and left as it is: the plant page and the labels page set a plant's `taxonKey` when the reference resolves its name to another key (a key that would have put another species' habitat under the plant). That is a page writing what it read from the reference, not the load writing what it read from the log; it is said here so a later round can decide whether it should be a button too. Two devices on different corpora during a refresh could each write their own key once; nothing writes it again while the corpus agrees.

## 4. The collection's load: measured, not changed (R1-13)

Measured on the real vault over an in-memory IndexedDB, in Node:

| changes | whole fold | from the snapshot | snapshot size |
|---|---|---|---|
| 10,200 (300 plants, 10 events each) | 0.13 s | 0.02 s | 1.3 MB |
| 56,400 (600 plants, 30 events each) | 0.64 s | 0.15 s | 7.3 MB |

The fold itself is linear and small: at 56,400 changes `apply` took 0.15 s, the maps 0.01 s, the indexes 0.02 s. The CPU profile of a snapshot load puts the time in reading the snapshot out of IndexedDB (the structured clone), not in the `SvelteMap` sets: `fromFold` was 35 ms of self time. A plain `Map` for `state` would change every page's reactivity to save a few per cent of a load that already takes a fifth of a second at a size few collections reach, so it is not done. The snapshot's stamp map is its largest part (4.1 of 7.3 MB); grouping it by record would save perhaps a fifth of the snapshot, against a format change and a migration; not done either. R1's figure (5.3 to 6.1 s from a snapshot at 450,000 changes on a throttled phone) is the scale at which this returns: three thousand plants with fifty events each.

What does cost a heavy collection, and is not changed here because it was a deliberate safety choice: the snapshot is keyed to the build, so every deploy makes every device fold the whole log once. At 56,400 changes that is about two-thirds of a second in Node, a few seconds on a slow phone. Keying it to `FOLD_RULES` alone would remove that, at the price of trusting every round to bump the rules when the fold changes.

## 5. The index on the Worker's heap: measured, kept

Measured from the real index: parsed, 7.0 MB of heap; the prepared search 13.7 MB; the maps by key, genus and older name 3.4 MB; the nine catalogues 2.9 MB; 27 MB in all of the isolate's 128 MB. Under a manifest the prepared search is no longer held (the postings replace it) and the catalogues come from files, which leaves about 11 MB, plus the product cache's cap of 24 MB. By the same measure fifty thousand species would hold about 60 MB plus the cache. Moving the index off the heap means every route that reads it (slugs, genus pages, synonyms, the sitemap, the compare page) reading files instead; it is not needed below about seventy thousand species, and is not done.

## Counts

486 unit tests on 49 files (two new files: postings, and the round's additions to products, vault-store and the rest), 99 e2e (one new), local live check 10 of 10.
