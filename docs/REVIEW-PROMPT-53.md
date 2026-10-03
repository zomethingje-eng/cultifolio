# Review prompt, round fifty-three

Paste everything below the line to the reviewing model. Give it the repository (`https://github.com/zomethingje-eng/cultifolio`, commit `8f272a4` or later), a checkout with `npm install` done if it can run code, and the live site `https://cultifolio.com` (the real corpus, 8,947 species; a checkout serves a four-species fixture corpus). The round's own account of itself is `docs/REVIEW-ROUND-53.md`; the two before it are `docs/REVIEW-ROUND-52.md` and `docs/REVIEW-ROUND-51.md`; the engineering log is `docs/DEVLOG.md`, last paragraph. The deploy notes are `docs/DEPLOY.md` (section 5 for the corpus).

---

You are reviewing Cultifolio, a SvelteKit 5 (Svelte 5 runes) application on Cloudflare Workers: a species reference for cactus, succulent and bulb growers (8,947 species, each page derived from public data: GBIF, Kew's WCVP, CHELSA, NASA POWER, iNaturalist, Wikipedia) and a private collection tracker that lives in the browser as an append-only change log, synced end-to-end encrypted when the grower chooses. It is heading for Show HN.

This is round fifty-three. Rounds forty-nine to fifty-two were adversarial reviews of time (hybrid logical clocks, a server-clock correction, held and parked changes), photographs, the write paths and the server's memory; their findings are closed and `docs/REVIEW-ROUND-52.md` lists what was deferred. Round fifty-three built three of the deferred things and they have had no eyes but the author's. Review as a systems engineer who distrusts caches, then as a QA engineer, then as a grower with a phone in a greenhouse. Reproductions, not impressions: a finding names a file and line, or a request and its answer, or a sequence of steps and what appeared.

## The rules the project holds itself to

A claim the code does not keep is a finding.

1. Every figure on a species page states its source. Nothing on a species page is written by a person or a language model: every sentence is a quoted passage, marked and credited, a figure with its source, or a labelled reading of a fixed rule. No AI images.
2. A refusal is not an absence. A source that did not answer is "not checked", never "none".
3. Nothing derived is smoothed, guessed or inferred beyond what the rule states.
4. The collection is the grower's alone: on the device, synced only if they set it up, encrypted so the server never reads it. No accounts, no analytics, no third-party scripts. `/about/how` lists every request the grower's own pages make; `/about/formats` states every format and rule. Both must be true of the code at this commit.
5. The log is the collection. Anything else the device keeps (a snapshot, an index, a cache) is a reading of the log and must be droppable without loss.

## What changed in this round (look here hardest)

### 1. The fold is kept as a snapshot (`src/lib/db/vault.ts`, `src/lib/db/collection.svelte.ts`, `src/lib/core/log.ts`)

The collection used to fold the whole change log on every page load. Now the vault (IndexedDB, version 3) has an `order` store, one numbered row per change stored (new, or displacing another under its stamp; a re-send writes no row), and the collection keeps the last fold as a snapshot in meta (`fold`): the records, the fold's stamp map (`seen`, with the per-field stamps and the held keys), each record's first stamp, the place parent history, the latest stamp, the rules version (`FOLD_RULES`), the device, the clock correction in force, and the arrival number read before anything was read. A load reads the snapshot, folds what arrived after that number in arrival order, and looks through the held keys for changes that came due since (fetched by key, folded too).

The snapshot is dropped, in the same transaction, when the log is replaced from a file (`replaceFromStaging`), wiped, or a stored change is displaced under its stamp (`storeIn`); a counter (`foldGen`) moves with every drop and `writeFold` refuses a snapshot built against an older counter. It is not read when the rules version, the device, or the clock correction differ from what it was built under.

Questions to answer with code or a reproduction:

- Is there any sequence of two tabs, a sync pull, a held change coming due, a clock correction, a replace, a merge from a backup, and a displaced change, in any interleaving, after which a load from the snapshot differs from a fold of the whole log? `tests/unit/fold-snapshot.test.ts` covers some; find the one it does not. The `arrivalsAfter`/`lastArrival` read ordering and the "folded twice is harmless" argument in `foldFromVault` are the places to push.
- Is `FOLD_RULES` bumped by every change that would make an old snapshot wrong? Look at what `apply`, `isHeld`, `isParked`, `REQUIRED_FIELDS`, `mendChange` and `readChanges` do and whether anything else the fold's outcome depends on is outside that list (the per-kind maps, `noteParents`, `born`, the parked set in meta).
- The one-time repairs that used to scan every change at load (`revivedByImport`, the one-shape number pass) now see only the tail or the stamp map. State the exact case in which that is wrong, if there is one.
- `catchUp` (another tab wrote) now reads arrivals after this tab's last number and filters by `applied`. `applied` is every stamp in the log, read with `getAllKeys` on a snapshot load. Memory and time at 450k changes: measure or estimate, and say whether the `order` store's growth (never pruned) matters.
- The state is partitioned by kind into reactive maps (`kinds`) beside `state`; `eventsByAcc` and `photosByAcc` are kept incrementally (`reindex`). Find a write path that touches a record without going through `touched()`, or a reader that still scans every record per render.
- The vault upgrade from v2 to v3 with a tab of the old build open, and a snapshot written by a newer build read by an older one (rules version only? what about a field the older build does not know?).

### 2. The reference is built into products (`scripts/build-dossiers.ts --index`, `src/lib/dossier/{manifest,products,catalogue,index-entry}.ts`, `src/lib/server/{dossiers,catalogue,sheets}.ts`, `src/lib/core/bucket.ts`, the four `/api/*` routes, `src/lib/ui/index.svelte.ts`)

The Worker used to hold the index in memory and derive the search structure, the entries of each bucket and nine catalogues from it per isolate. The build now writes, under `s/v2/b/<id>/` where `<id>` is a content hash of the index: the index, the entries and sheets of each bucket, the search in shards by first character (an entry is in every shard one of its words begins), and the nine catalogues' rows; `s/v2/manifest.json` names the id, the bucket count and the hash of every file. The Worker reads the manifest first, takes the id and the count and the index from under the id, revalidates by the manifest's etag, reads products by file (a few held per isolate), and falls back to deriving from the index when there is no manifest or a file is missing. The bucket count scales (`bucketsFor`: 32 to about ten thousand species, doubling past that), `/api/corpus` announces it, and the client hashes by it. `docs/DEPLOY.md` section 5 gives the upload order: everything, then the manifest.

Questions:

- The live bucket at this moment has no manifest (the corpus has not been re-uploaded since the deploy): confirm from the live site that every route still behaves as round fifty-two's did, and that `/api/corpus` reports `buckets: 32`.
- Build the products for the fixture corpus (`npm run dossier -- --index` against a scratch tree, or `buildProducts` directly) and serve them from a mocked R2 (see `tests/unit/products.test.ts` for the harness). Then: a manifest that names a file the bucket lacks; a manifest whose index differs from `s/v2/index.json` at the top; a manifest for id A with files for id B; an upload that lands the manifest first. Which of these are handled, which produce a wrong answer, and for how long (the index cache's minute, the edge's day)?
- Sharded search: the exact pass is complete by construction (every query word must prefix a word of the entry, so the entry is in the first word's shard). The near pass (one edit) is not: a slip in the first letter of the first word is not found. Is that the only loss? Consider rank markers (`var`, `subsp`, `f`), a first word that is a marker, folded diacritics, digits.
- The bucket count read by a device is remembered in `localStorage` with the id. A device that last saw `{id: A, buckets: 32}` is offline when the corpus becomes `{B, 64}`; it comes online mid-session. Walk `entriesFor` and `sheetsFor` and the service worker's cache keys: is any bucket asked for under the wrong count, and does the answer get cached under a key that will be read again?
- Memory on the Worker with a manifest: what is still held per isolate (the index, `indexMaps`, `catalogueItems`, the product LRU, `sheets.ts`'s ten-minute cache), and is `preparedSearch` really never built? Look for any route that still calls `searchIndex(idx)` or `catalogueOf(idx, …)` under a manifest.
- `--index` is incremental by file hash and the previous manifest. A dossier changed but its index entry unchanged: which products change, and does the manifest's id change? Is a product that depends on dossier content but not on the index entry (the sheets) rewritten?

### 3. The Today tab (`src/routes/today/+page.svelte`, `src/lib/ui/Today.svelte`, `src/lib/ui/frost.svelte.ts`, `src/routes/+layout.svelte`, `src/routes/frost/+page.ts`)

The Frost tab is the Today tab: the nine nights first, then what needs you place by place in walking order (the place tree, depth first), each stop with the plants not watered for three weeks or more, the plants with no watering recorded (counted from the day the record was made, and said so), the plants missed at an audit or unseen for ninety days, and a "Water N here" that writes one dated line per plant with Undo. The front page's short lines are unchanged and link to the tab's two sections. A frost risk at the site is a bar under the top bar on every page but the Today tab. `/frost` is a 301.

Questions:

- Walk it on a phone (or a 390-px viewport) with twenty plants across four nested places, half of them due: is the order the order the places are kept in, is the stop for "No place" last, do the buttons stay reachable with the tab bar and a toast present, and is anything said twice?
- "No watering recorded" versus "not watered": find a plant that is said under the wrong heading (a watering dated in the future; a watering line removed; a plant whose record is younger than three weeks but whose `acquired` is older; a plant imported from v2 with `importedOn`).
- The frost watch is now asked for from every page once a site is set (`frost.check()` in the layout). Is that consistent with `/about/how`'s list of requests, and does any page ask twice (the layout and `Today.svelte` both call `check()`; the Today page also calls `getForecast` for the full payload)? Count requests.
- "Water N here" and Undo against the one-tap-one-action rule of round fifty-two: double tap, tap during Undo, two stops tapped in turn.

### 4. The deploy

`scripts/live-check.mjs` now reads which build a page came from and waits out a rollover. Check that it cannot wait forever and cannot pass a genuinely wrong deploy by mistaking it for a rollover.

## What is not in scope

The data-model list carried from round fifty-two (operation ids, an undo history, a `base` on every field edit, Kleppmann's move for places, atomic create, a photo inventory on the wire, per-device sequence numbers) is known and deferred; name a new reason it must come sooner, or leave it. The replace's four minutes at 5,000 plants is known. The index itself is still held whole on the Worker; that is the next round's target, not this one's.

## How to report

Number your findings. For each: the file and line (or route and request), what the code does, what it should do, a reproduction or the reasoning that stands in for one, and the smallest fix. Rank by what a reviewer on Show HN would find first, then by data loss, then by everything else. Say what you checked and found sound, briefly, so the author knows what has been looked at. Do not restate the round's own write-up back; `docs/REVIEW-ROUND-53.md` is the author's account and you are checking it. If you can run code, run `npx vitest run` and `npx playwright test` (the e2e suite builds and starts its own server; `PW_REUSE=1` reuses one already running on port 4173), and say what you ran.
