# Review prompt, round fifty-seven

Paste everything below the line to the reviewing model. Give it the repository (`https://github.com/zomethingje-eng/cultifolio`, commit `3dfd361` or later), a checkout with `npm install` done if it can run code, and the live site `https://cultifolio.com` (the real corpus, 8,947 species, now served from the build's products under manifest `3fb9a56012291d4d`; a checkout serves a four-species fixture corpus with no manifest). The rounds' own accounts are `docs/REVIEW-ROUND-55.md`, `-56.md` and `-57.md`; the engineering log is `docs/DEVLOG.md`, last three paragraphs; `docs/DEPLOY.md` section 5 is the corpus refresh.

---

You are reviewing Cultifolio, a SvelteKit 2 / Svelte 5 (runes) application on Cloudflare Workers: a species reference for cactus, succulent and bulb growers (8,947 species, each page derived from public data: GBIF, Kew's WCVP, CHELSA, NASA POWER, iNaturalist, Wikipedia) and a private collection tracker that lives in the browser as an append-only change log, synced end-to-end encrypted when the grower chooses. It is heading for Show HN. Nobody uses it yet, the author included.

Three rounds have landed since the last outside review. Round fifty-five answered two reviews of round fifty-four. Round fifty-six did the work fifty-five deferred: the search moved from first-letter shards to postings, the reference's product files are stored under their content hash, the two load-time writers left in the collection were removed, and the collection's load and the Worker's heap were measured and left as they were. Round fifty-seven removed every path that existed only to read what an earlier build wrote (the v2 importer, the JSON backup, `importedOn`, the free-text location, value mending, old sync batch names and unbound seals, bucket requests without a count, the sheet files beside the index), and keyed the fold snapshot to the fold rules instead of the build, with a test that holds the fold's source to the rules number. None of this has had an outside reader. Your job is to find what is wrong with it. Reproductions, not impressions: a finding names a file and line, or a request and its answer, or a sequence of steps and what appeared.

## The rules the project holds itself to

A claim the code does not keep is a finding.

1. Every figure on a species page states its source. Nothing on a species page is written by a person or a language model: every sentence is a quoted passage, marked and credited, a figure with its source, or a labelled reading of a fixed rule. No AI images.
2. A refusal is not an absence. A source that did not answer is "not checked", never "none"; a refused request is said as a refusal, never as "nothing matches".
3. Nothing derived is smoothed, guessed or inferred beyond what the rule states.
4. The collection is the grower's alone: on the device, synced only if they set it up, encrypted so the server never reads it. No accounts, no analytics, no third-party scripts. `/about/how` lists every request the grower's own pages make; `/about/formats` states every format and rule. Both must be true of the code at this commit, and `tests/unit/formats-doc.test.ts` checks some of it.
5. The log is the collection. Anything else the device keeps (a snapshot, an index, a cache) is a reading of the log and must be droppable without loss; and no reading of the log may write to the log.

## What changed (look here hardest)

### 1. The search: postings (`src/lib/core/postings.ts`, `src/lib/server/dossiers.ts` `searchAnswer`, `src/routes/api/search/+server.ts`, `tests/unit/postings.test.ts`, `tests/unit/products.test.ts`)

Every word of every entry (name, common names, family, origins, older names) is posted under its one-, two- and three-letter prefixes and, for a word of three letters or more, the first three letters after deleting its first, second or third letter. The exact pass ranks the entries under every query word's exact key, intersected over the words; when it finds nothing exactly, the near pass ranks the entries under the near keys of each word of four letters or more. The module carries a proof that every one-edit near match (as `nearPrefix` in `src/lib/core/search.ts` forgives) shares a key with its query word. The author reports 0 differences from the whole-index answer over 1,521 queries on the real index. A missing posting file falls back to the whole index prepared for the request, under the `searchmiss` rate, and past the rate the answer is a 429.

- Break the proof. Find a query and an entry the whole index returns and the postings miss, or a difference in order. Consider: rank markers (`var`, `subsp`, `ssp`, `f`) in the query and in older names; a query whose only long word is a trailing marker; words of exactly three letters; non-ASCII names after `fold`; a query word that matches only an older name's word; two query words that match the same entry word.
- `queryPlan` chooses which words narrow the candidates. Is there a query where intersecting over every word excludes a true hit (a word that `search` would drop or treat as optional)?
- One-letter and two-letter queries produce candidate sets near the whole index, prepared per request. What does `/api/search?q=a` cost on the live Worker, uncached, and is the edge cache the only thing that bounds it?
- The postings refer to entries by their place in the index. Can a Worker ever hold an index from one manifest and posting files from another (a refresh between the index load and the posting reads, the product cache keyed by hash, the manifest re-read each minute)? What does a query answer then?

### 2. Product files under their hash (`src/lib/dossier/products.ts`, `src/lib/dossier/manifest.ts`, `scripts/build-dossiers.ts` `writeProducts`, `docs/DEPLOY.md` section 5)

Each product is `s/v2/p/<md5 of its body>.json`; the manifest maps names to hashes; the corpus id is a hash of the sorted name=hash lines. `--index` writes only files not already on disk, keeps the previous manifest as `manifest.prev.json`, and deletes from `static/s/v2/p` what neither manifest names; `rclone sync` of `p/` prunes the bucket a day later. A manifest whose file values are not hex is not a manifest.

- The live corpus switched to this layout on 2026-10-03. Check `/api/corpus`, then read a few products through the routes and confirm what is served is what the manifest names. Is any answer cacheable under the wrong corpus id for any length of time across a refresh?
- The upload order is everything but the manifest, then the manifest. Walk a refresh where the copy is interrupted after some `p/` files and before the manifest; then one where the manifest lands and one product does not (the Worker checks only the index). What does each route answer, and for how long?
- The prune: `--index` deletes local files named by neither the current nor the previous manifest; `rclone sync` then deletes them from the bucket. Is there a sequence of two refreshes within a day, or a refresh run from a second checkout, after which the bucket lacks a file the live manifest names?

### 3. The collection (`src/lib/db/collection.svelte.ts`, `src/lib/db/vault.ts`, `src/lib/core/log.ts`, `tests/unit/fold-snapshot.test.ts`, `tests/unit/fold-rules.test.ts`, `tests/unit/vault-store.test.ts`)

Round fifty-five: an own write moves the catch-up frontier only when the write's first arrival row follows it with no gap (`storeIn` returns `first`); a snapshot refreshed from a long tail is written under the tail's number; parked stamps are stored and the snapshot dropped in one transaction; a snapshot holding an unknown kind is not read. Round fifty-six: a load writes nothing; two records under one number are repaired after a merge, on restore, or when the grower asks ("Renumber now" on the record's page, which says the number is shared). Round fifty-seven: FOLD_RULES 3; the snapshot is keyed to the rules, the device and the clock correction, not the build; `writeFold` refuses to overwrite a snapshot folded under a higher rules number; `fold-rules.test.ts` hashes the fold's source as written and fails when it changes and FOLD_RULES does not.

- Rule 5, everywhere. List every path that writes to the log, and for each say what triggers it. Any write triggered by opening a page, a load, a catch-up, a rebuild or a sync pull that the grower did not ask for is a finding unless it is a merge of what arrived. The author knows one: the plant page and the labels page set `taxonKey` when the reference resolves the name to a different key. Say whether that should stand.
- The frontier. Find an interleaving of two tabs' writes, a notice that arrives late, a `catchUp` and a `rebuild` that leaves a row folded twice or never.
- The snapshot keyed to the rules. Which code paths shape what a snapshot holds or how it is read and are not covered by the hash in `fold-rules.test.ts` (it covers `apply`, `isHeld`, `isParked`, `REQUIRED_FIELDS`, `KINDS`, and ten collection methods)? Name a change to one of them that would leave a stale snapshot readable after a deploy.
- Two shells during a deploy: an old shell on FOLD_RULES 2 and a new on 3, both open. What does each load, what does each write, and does either fold the whole log on every load until the old one closes?
- Shared numbers. `sharesNumber` and the page notice: a plant and a removed plant under one number; a number shared by three plants; renumbering from the earlier plant's page; a shared number on a batch. Does the repair ever choose differently from what the notice says?

### 4. What round fifty-seven removed

`docs/REVIEW-ROUND-57.md` lists it. Check two things. First, that nothing still reads or writes what was removed: grep for `importedOn`, `location` (the free text), `removed` on a taxon, `cultifolio-changes`, the manifest's `scheme`, `meta` key `scheme`, unbound seals, batch names without a fingerprint. Second, that the removals did not take something current with them: `readChanges` no longer mends, so a value of the wrong type in a backup or a batch is left out and named; is there a current writer that produces such a value (a form that stores a number as text, a count from an input)? `accNo`/`sowNo` still fall back to the id; is any record a current build makes without its number field?

Sync specifically (`src/lib/sync/crypto.ts`, `src/lib/sync/limits.ts`, `src/lib/server/sync.ts`, `src/routes/api/sync/`): batch names must be `<hour>-0000-<device>-<fingerprint>`; `X-Batch-Plain` and `X-Device` are required; a photo upload must carry its removal proof; a seal opens only under its own binding. Confirm the engine always sends what the server now requires (a device id of fewer than twelve characters, an empty device, a resplit batch), and that `/about/formats` describes exactly this.

### 5. The Today tab and the frost watch (round fifty-five)

The watered stop keeps its plants and its height and carries its own Undo; a toast without an action lets taps through; the date is read at the tap; the frost watch re-reads every five minutes while a page is visible, and only the current read publishes. At 390×844, water two stops in turn and undo the first; leave the tab for an hour and come back; change the site in Settings mid-read. What appears, and is it right?

## What is not in scope

The data-model list (operation ids, an undo history, a `base` on every field edit, a move operation for places, per-device sequence numbers) is future work. The index off the Worker's heap was measured and declined in `REVIEW-ROUND-56.md` (27 MB at 8,947 species, about 11 MB with postings); a plain `Map` for the collection's state and a slimmer snapshot were measured and declined there too. Argue with the measurements if you think they are wrong.

## How to report

Number your findings. For each: the file and line (or route and request), what the code does, what it should do, a reproduction or the reasoning that stands in for one, and the smallest fix. Mark each confirmed (reproduced) or suspected (read, not run). Rank by what a reviewer on Show HN would find first, then by data loss, then by everything else. Say briefly what you checked and found sound. If you can run code, run `npx vitest run` and `npx playwright test` (the e2e suite builds and starts its own server; `PW_REUSE=1` reuses one already running on port 4173), and say what you ran.
