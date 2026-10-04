# Review prompt, round fifty-eight

Paste everything below the line to the reviewing model. Give it the repository (`https://github.com/zomethingje-eng/cultifolio`, commit `4598c5f` or later), a checkout with `npm install` done if it can run code, and the live site `https://cultifolio.com` (the real corpus, 8,947 species, manifest `a3c8836c03981617`, which now carries `short.json`; a checkout serves a four-species fixture corpus with no manifest). The round's own account is `docs/REVIEW-ROUND-58.md`; the three reviews it answered are `docs/REVIEW-SELF-57.md` and the two summarised there; the engineering log is `docs/DEVLOG.md`, last paragraph; `docs/DEPLOY.md` section 5 is the corpus refresh and the prune.

---

You are reviewing Cultifolio, a SvelteKit 2 / Svelte 5 (runes) application on Cloudflare Workers: a species reference for cactus, succulent and bulb growers (8,947 species, each page derived from public data: GBIF, Kew's WCVP, CHELSA, NASA POWER, iNaturalist, Wikipedia) and a private collection tracker that lives in the browser as an append-only change log, synced end-to-end encrypted when the grower chooses. It is heading for Show HN. Nobody uses it yet, the author included.

Round fifty-eight is the largest round in the project's history: 121 files, about 4,600 lines added and 1,800 removed, answering three reviews at once. It hardened the sync server, made every request read one corpus, answered the first keystrokes of a search from a new product, reworked how a sync pull reaches the fold, removed two writers that broke the project's fifth rule, and then rebuilt much of the interface: Today, the front page, the species page, compare on a phone, watering rhythms per place, propagation, labels, settings, and an accessibility pass over every page. Parts of the interface were written by separate agents working in files of their own and checked only by the type check and the test suites. One defect already escaped: the sync lock was never taken in the build sandbox (Node 22 has no `navigator.locks`) and failed 22 tests on the author's Node 24, which exposed a real bug and a leaking test harness (the last section of `REVIEW-ROUND-58.md`). Assume there are more. Your job is to find what is wrong. Reproductions, not impressions: a finding names a file and line, or a request and its answer, or a sequence of steps and what appeared.

## The rules the project holds itself to

A claim the code does not keep is a finding.

1. Every figure on a species page states its source. Nothing on a species page is written by a person or a language model: every sentence is a quoted passage, marked and credited, a figure with its source, or a labelled reading of a fixed rule. No AI images.
2. A refusal is not an absence. A source that did not answer is "not checked", never "none"; a refused request is said as a refusal, never as "nothing matches".
3. Nothing derived is smoothed, guessed or inferred beyond what the rule states.
4. The collection is the grower's alone: on the device, synced only if they set it up, encrypted so the server never reads it. No accounts, no analytics, no third-party scripts. `/about/how` lists every request the grower's own pages make; `/about/formats` states every format and rule. Both must be true of the code at this commit, and `tests/unit/formats-doc.test.ts` checks some of it.
5. The log is the collection. Anything else the device keeps (a snapshot, an index, a cache) is a reading of the log and must be droppable without loss; and no reading of the log may write to the log.

## What changed (look here hardest)

### 1. The sync server (`src/hooks.server.ts` `_foreignWrite`, `src/lib/server/sync.ts`, `src/lib/server/counters.ts`, `src/routes/api/sync/`, `tests/unit/sync-hardening.test.ts`, `tests/unit/sync-server.test.ts`, `tests/unit/counters.test.ts`)

Writes to `/api/sync/*` naming another site in `Origin` or `Sec-Fetch-Site` are refused, and the vault POST takes only `application/json`. A vault counts toward the ceiling in all at its first stored object (`fillVault`, `filled` in its meta), not at creation. Byte totals moved into the counter Durable Object (`bytes:<vault>`, `ipbytes:<address>`; `take`, `give`, `setBytes`, `bytesToday`, `fill`), with KV read-then-write as the fallback when the binding is absent. `recount` treats a listing cut short as a floor. `storeOnce` writes with `onlyIf: { etagDoesNotMatch: '*' }`. Forecast, names and match count an IPv6 /48 at four times one address's allowance.

- The origin check. What does it accept from `cultifolio.jefarn.workers.dev`, from `Sec-Fetch-Site: same-site`, from a request with neither header, and from a browser that sends `Origin: null`? Is there a browser-reachable cross-site write it still lets through?
- Confirm against Cloudflare's R2 documentation that `onlyIf: { etagDoesNotMatch: '*' }` on `put` means "only if absent", and say what the Worker does when R2 answers the conditional put with a failed precondition. If the semantics differ, two concurrent uploads of one name are back to the bug this was meant to fix.
- The counter object. Walk two uploads to one vault from two addresses at once, an upload that fails after `take`, a day rollover mid-upload, and the binding absent. Can the DO's figure and the vault's meta disagree in a way that lets a vault exceed its cap, or locks a vault that has room? What keeps the DO's storage from growing without bound (the `d:` sweep, the alarm that re-arms only while storage is non-empty)?
- `fillVault`. Two first uploads at once; a vault filled and then emptied by photo removals; a vault created, filled, and abandoned. Does the ceiling in all ever count a vault twice or never?

### 2. One corpus per request and the short answers (`src/lib/server/dossiers.ts` `corpusNow`, `product`, `searchAnswer`; `src/lib/server/catalogue.ts` `homeWindow`; `src/lib/dossier/manifest.ts` `isManifest`, `SHORT_HITS`; `src/lib/dossier/products.ts`; `scripts/build-dossiers.ts` `--keep-list`; `tests/unit/search-generations.test.ts`)

Every route takes one `Loaded` at the start of the request and reads every product through it, keyed by hash. A one-word query of one or two letters, with `n` at most 100, is answered from `short.json`. The manifest is adopted only if its counts are the ones the build would choose and it names every product they call for. The adversarial generator now runs in the suite and finds no difference from the whole index.

- `short.json` against the whole index. The short path is taken when `words(q)` gives one word of at most two letters. Try uppercase, a trailing space, a leading marker (`f`, `ssp`), a single accented letter, a digit, two letters that fold to one, and `n` at exactly 100 and 101. Does any answer, or its order, differ from what the postings path gives for the same query?
- Can any response be cached at the edge under one corpus id while carrying products of another, across a refresh? The page cache's key, the adapter's `caches.default` entry for `/api/search`, and the service worker's copy each have their own key; check all three.
- The prune. `--keep-list` writes what the live manifest names, and section 5 pairs it with `rclone delete --exclude-from keep.txt --min-age 24h`. Is there a sequence (two refreshes in a day, a second checkout, a manifest uploaded before its products) after which the bucket lacks a file the live manifest names?
- `homeWindow` and `?part=`. Is any combination of `?at=`, `?open=`, `?part=` and `?by=` still able to send the whole catalogue, or to put two different pages under one page-cache key?

### 3. The collection and rule 5 (`src/lib/db/collection.svelte.ts`, `src/lib/db/vault.ts`, `src/lib/sync/engine.svelte.ts`, `src/lib/core/notes.ts`, `src/lib/core/log.ts`, `tests/unit/rule5.test.ts`, `tests/unit/fold-rules.test.ts`, `tests/unit/sync-engine.test.ts`)

Every pulled change now goes through `collection.ingest`, which folds the due ones and holds the rest. The number repair runs over the numbers that merged changes touched, once at the end of a pull; a run that folds nothing writes nothing; the record made first by its first stamp keeps the number. "Notes replaced" is read from the log by `notes.ts` (by each edit's `notesBase`) instead of being written. The plant and labels pages no longer write `taxonKey` on view. Grower writes are validated as a pull is. The fold-rules guard hashes the whole of `log.ts` and `hlc.ts` plus the collection's and vault's snapshot methods (recorded hash `6227043202392025063dc89e5fb06bd0`, FOLD_RULES 3). A snapshot under rules no build reads is replaced once no newer shell has written it for an hour (`savedAt`). Tabs share the parked-done and photographs-to-check sets through `updateMeta`. A sync run takes a Web Lock named by the vault (`ifAvailable`) and starts from the stored sync record.

- Rule 5, again, everywhere. List every path that writes to the log and what triggers it. A write triggered by opening a page, a load, a catch-up, a rebuild or a sync pull is a finding unless it is a merge of what arrived. Round fifty-eight claims there are none left. Prove it wrong. One write of the old kind remains by design: saving "My notes on" a species over a text that changed since the page read it writes a log line on that plant holding the text it replaced (`src/routes/plants/[acc]/+page.svelte`, near line 413). It is written at the grower's own save, not on a reading, and species notes carry no `notesBase` for `notes.ts` to read. Say whether it should stand, or move to a reading as the plant notes did.
- The repair. Two plants under one number made on two devices with clocks a minute apart; a number shared by a growing plant and a removed one; a shared number touched by a pull that brings only an edit to one of them; a restore of a record whose number another record now holds. Does the repair ever choose a different record from the one the notice names?
- `notes.ts`. A blind edit made while a held change was pending; two blind edits from two devices; an edit whose `notesBase` names a stamp the device never saw; a very long notes history. Does the list ever show a text the grower saw, or miss one they did not?
- The lock. `ifAvailable` means a tab that finds the lock taken skips its run instead of waiting. Can an edit in that tab wait indefinitely for a push (the other tab's run started before the edit and its next run never comes)? What does the skipping tab show? What happens when the tab holding the lock is frozen by the browser?
- The rollback rule. An old shell and a new shell open at once across a deploy, and a rollback within the hour. Does either fold the whole log on every load, or overwrite the other's snapshot back and forth?
- The fold-rules guard. Name a change to the code that shapes a snapshot that the hash still does not cover.

### 4. The test harness

`tests/unit/sync-engine.test.ts` simulates several devices in one process. Its vault stand-in reads a single global `mem`, set by the last `boot`, so a device acting after another has booted reads and writes the other's store unless the test puts `mem` back. Round fifty-eight's deploy run found three tests that passed only because of this, and a scheduled run that leaked from one test into the next. Find the others: a test in this file, `rule5.test.ts`, `fold-snapshot.test.ts` or `vault-store.test.ts` that passes for a reason other than the one its name gives, or that would still pass with the fix it guards reverted. Run the unit suite on Node 24 or later as well as on Node 22: Node 24 exposes `navigator.locks`, which the browser code uses.

### 5. The interface (largely new; much of it written by agents)

At 390×844 and at 1280 wide, in light and dark, walk these and say what is wrong:

- Today: water a stop with one plant unticked; undo; water the next stop; a place in its dry months; a place with a 7-day rhythm whose child overrides it with 30; a plant with its own rhythm in a place that has none. Are Today, the plant list, the place page and the plant page always agreed on what is due (`collection.isDue`)?
- The front page as a stranger sees it, and its Open Graph card. The species page's "In short" list, the "Seasons" card, the one-line captions, and compare with three species. Check every sentence on the species page and on compare against rule 1: a plain-language rewrite that became advice or an inference is a finding.
- Add a plant, a place (with altitude in feet on a US locale), a seed batch with the "In the pot now" count, a pot-up and its labels. Settings: change units, lengths and the site, then reload.
- Accessibility: keyboard only through the add-plant form, the lightbox and the audit; browser text at 200%; a 320 px width (reflow); axe or a screen reader on the plant page and the species page. The round claims WCAG 2.4.11 for focus under the sticky bars, 3:1 field edges, nothing under 11 px, and `aria-current` on the tab bar. Verify each.

### 6. Copy and claims

The front page says the site is free and open source; `/about/how` says what each page requests; `/about/formats` describes the backup's `parked` set, the location's `waterDays` and `dryMonths`, and the plant's `waterDays`. Check that each is true of the code at this commit, and that nothing on a public page still says something round fifty-eight removed ("bring in a collection", "Kew does not accept", the plant notes' "replaced by this edit" line; the species notes' line in section 3 is the one kept).

## What is not in scope

The data-model list (operation ids, an undo history, a `base` on every field edit, a move operation for places, per-device sequence numbers) is future work. The index off the Worker's heap, a plain `Map` for the collection's state and a slimmer snapshot were measured and declined in `REVIEW-ROUND-56.md`; argue with the measurements if you think they are wrong. A shell left open across the round fifty-seven deploy is noted, not handled.

## How to report

Number your findings. For each: the file and line (or route and request), what the code does, what it should do, a reproduction or the reasoning that stands in for one, and the smallest fix. Mark each confirmed (reproduced) or suspected (read, not run). Rank by what a reviewer on Show HN would find first, then by data loss, then by everything else. Say briefly what you checked and found sound. If you can run code, run `npx vitest run` (on Node 24 if you have it) and `npx playwright test` (the e2e suite builds and starts its own server; `PW_REUSE=1` reuses one already running on port 4173), and say what you ran and on which Node.
