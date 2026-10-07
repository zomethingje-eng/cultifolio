# Self-review of `4598c5f`: round fifty-eight

Six reviews ran in parallel on 2026-10-04, each against a written brief. The most serious findings were then checked again by hand.

| Review | Covered |
|---|---|
| Sync server | The origin check, the counter object, byte accounting, `fillVault`, `storeOnce`, body reads, rate limits. Checked against Cloudflare's R2 documentation and workerd's binding. Reproduced with tests in a copy. |
| Corpus and search | One corpus per request, `short.json`, the strict manifest, the home window, every cache key, the prune, the service worker. Fuzzed against a generated 9,000-species index. |
| Collection and rule 5 | Every path that writes to the log, the number repair, `notes.ts`, the sync lock, the rollback rule, the fold-rules hash, and whether the new check on the grower's writes refuses anything a current form writes. |
| Test harness | 45 mutations of round fifty-eight's fixes on Node 22 and 24. The full suite five times on each, and again under load. |
| Interface | A seeded collection (a nested greenhouse, rhythms, dry months, nine plants, a batch through pot-up and labels), and the visitor pages at 390 and 1280, light and dark. |
| Accessibility and words | axe on every route in both themes (58 scans), each of section 6's claims measured, the network capture of every page, every sentence pattern on the species page and compare against rules 1 and 3, `/about/how` and `/about/formats` against the code. |

Limits:
- The local build serves the four-species fixture corpus, the sandbox loads no outside photographs, and the live site is not reachable from the sandbox.
- "Confirmed" means reproduced. "Read" means found by reading the code.
- Every P0 and several P1s below were checked again by hand after the reviews: the vault count (the code), the encoded path (curl: `/api/%73ync/vault` from another site answers 400, not 403), the manifest fallthrough (the code), the species title (curl), Today's resting line (the code), and the held stamps lost in the lock's reload (the code).

The headline: round fifty-eight's own account overstated it. Several of its claims are false as written (section 6's accessibility list, "refused with the reason", "nothing written by a pull that brings nothing", "the corpus held before stays"). Its tests passed partly because the harness could not see what it was meant to guard. Thirteen of the 45 mutations were caught by no test.

---

## P0: before launch

### Abuse

1. **One vault can lock everyone out of sync for good (confirmed).**
   - **Where:** `fillVault`, `src/lib/server/sync.ts:699`; `Counters.fill`, `src/lib/server/counters.ts:105`.
   - **What happens:** "taken once" is judged on the copy of the meta each request read in `authed`, and `fill()` takes no vault id and adds one on every call. Two ways to count one vault many times:
     - Twenty first uploads at once, each with its own read of the meta, leave `all` at 20.
     - Any request holding a meta read from before the fill (`deleteCounted`, `recount`, `flushMeta`) writes `filled: false` back, and the next upload counts the vault again.
   - **The abuse:** make one vault, open about 2,000 photo uploads (within the 3,000 `syncobj` allowance), hold every body until all are open, then send them. `all` passes `MAX_VAULTS`, every visitor's creation is refused with "not taking new vaults", and nothing lowers it. Before this round the same lockout took 2,000 real creations.
   - **The test missed it** because `sync-hardening.test.ts` reuses one shared meta object across uploads.
   - **Fix:** decide it once, atomically, in the vault's own counter object (`markFilled()` returning true only the first time); call `vaults.fill()` only then.

2. **Rewordings of "a" still rank most of the index (confirmed).**
   - **Where:** `searchAnswer`, `src/lib/server/dossiers.ts:389-390`.
   - **What happens:** the short path is chosen from raw `words(q)`, but the search drops a leading rank marker and repeated words first. "f a", "var a", "ssp a", "a a" and "a,a" give the same answer as "a" and skip `short.json`: 224 to 309 ms each, against 0.01 ms for "a". Two short words ("a e") narrow nothing either (127 ms).
   - **Why it matters:** these run under `search` (3,000 per 10 minutes), and `search`, `searchmiss` and `reference` are counted per /64 only, so a /48 has 65,536 allowances. Each spelling is its own edge-cache key. The round's P0-4 fix is incomplete.
   - **Fix:**
     - Choose the path from the words the search ranks.
     - Charge `mayWhole()` when the exact candidates exceed a bound.
     - Add `search` and `searchmiss` to `UPSTREAM` (the /48 count).

### Words a reader could quote (rules 1, 3 and 4)

3. **The site's first sentence says every species has a habitat climate (confirmed).**
   - **Where:** `src/routes/+page.svelte:569`, and the meta description at :420.
   - **What it says:** "each with its native range, habitat climate and cold nights worked out from public data".
   - **What is true:** the count beside it says how many have one; on the live corpus some are pending or not checked.
   - **Fix:** "and, where the sources answered, its habitat climate and cold nights".

4. **An archetype minimum is called "this habitat's cold floor" (read).**
   - **Where:** `src/routes/species/[slug]/+page.svelte:193,206`.
   - **What happens:** when the archetype table raised the floor, the place line still says "under this habitat's cold floor of X". This affects every orchid, epiphyte, fern and tropical foliage plant.
   - **Fix:** "this species' cold floor (the archetype table's minimum for {group})".

5. **Readings that say more than their rule (confirmed).**
   - **Light rows:** compare's light row says "winter to summer" (`compare/+page.svelte:155`). The figures are the lowest and highest month, which in a cloudy wet summer or near the equator are not winter and summer. Say "lowest to highest month".
   - **The evidence line:** it gives a cause (`species/[slug]/+page.svelte:85`): "10 records outside the range (gardens, roadsides, misidentifications) ignored". No rule establishes the cause. Drop the bracket.
   - **In short, "Almost rainless (2.8 in a year)"** (`sheet.ts:276,280`): two lines later the same list says "2 months almost dry", and the rule says only "no rainy season to read". Say "Under 120 mm of rain a year".
   - **In short, "Rain through the year"** (`sheet.ts:284`): the rule is 70% of the rain over eight or more months, so up to four may be dry. Say "70% of the rain over N months".
   - **In short, "Cold nights reach X"** (`sheet.ts:237`, and unqualified at :231): the absolute minimum is lower than X. Say "1 night in 100 is colder than X".
   - **"Wild records"** (`species/[slug]/+page.svelte:568`) heads a count the page's own evidence line says includes garden and roadside records when the range was not tested. Say "Records" then.

6. **Today calls the cooler-half rule "the habitat's dry season", and hides the Water button for the plants it applies to (confirmed).**
   - **Where:** `isResting`, `src/routes/today/+page.svelte:82`, and the label at :266.
   - **What happens:** for a habitat under 120 mm a year (`fog`), the growing half is the cooler six months, so from May to October in the north every fog-belt cactus is "resting". It shows under "Not watered, and in the habitat's dry season by the species sheet", which contradicts the species page's own "no rainy season to read". Its chips cannot be ticked, and its button is "Water these too" with no main button for "too" to follow.
   - **Not covered by tests:** the e2e suite uses a species with no climate, so this path never runs.
   - **Fix:**
     - Word it as the rule reads ("outside the cooler six months the temperature rule names").
     - Make these chips tickable like the rest.
     - Rename the button "Water these N".

7. **`/about/formats` still describes byte counting in KV (read).**
   - **Where:** `src/routes/about/formats/+page.svelte:51`.
   - **What it says:** "The byte counts live in KV, kept per object… two uploads in the same instant can overshoot the allowance by at most one object".
   - **What is true:** round fifty-eight moved the totals into the counter object. The paragraph also leaves out the /48 count for vault creation. `/about/how` already says "counter object".

8. **`/about/how` leaves out two pages that load outside photographs (confirmed by network capture).**
   - **What it says:** its privacy list says species pages load photographs from iNaturalist.
   - **What else does:** the front page requests `inaturalist-open-data.s3.amazonaws.com` on every visit (genus heads and tiles), and compare loads each column's photograph.
   - **Fix:** name all three. Private pages also call `/api/corpus`, which is the site's own server, but the list says "this list and nothing else".

---

## P1: correctness and the first impression

### Server and corpus

9. **Byte totals are still not exact under concurrency (confirmed).**
   - **Concurrent deletes:** ten DELETEs of one photo give its bytes back ten times (`deleteCounted`, `sync.ts:64-86`; R2's `delete` returns nothing to say who removed it). The counter read 2,000,000 with 9,000,000 stored. Anyone with the key can repeat it daily to store past the cap. The per-address daily cap is per /64 with no /48 total.
   - **The day's first uploads:** each lists R2 and calls `take(base)`, and `base` replaces whatever an earlier racer stored for today (`counters.ts:64`, `sync.ts:414`). Ten concurrent 1 MB uploads left 8,000,000 counted with 10,000,000 stored. `setBytes` from a forced recount wipes in-flight takes the same way.
   - **Fix:**
     - Make `give` idempotent per object (record `g:<key>` for the day).
     - In `take`, use today's row and ignore `base` when one exists; the same in `setBytes`.
     - Add a /48 to `ipbytes`.

10. **A rejected manifest does not keep the corpus held before (confirmed).**
    - **Where:** `src/lib/server/dossiers.ts:131-145`.
    - **What happens:** a manifest that fails `isManifest` only logs, then the load falls through to the top-level `s/v2/index.json` under a new id: every cache turns over, no products, the whole search prepared in memory. It also reloads every minute, because the head check sees a manifest present.
    - **Likely trigger:** a Worker deployed with a longer `need` list than the build on the PC, which is what the deploy-then-corpus order produces for any future required product. The round's 1.9 and DEPLOY section 5 both claim the opposite.
    - **Fix:** restore `previous` as the missing-index branch does, and remember the rejected manifest's etag.

11. **The prune's `--min-age 24h` reads the file's local date, not the upload date (read).**
    - **What happens:** for S3-type remotes rclone takes ModTime from the stored `X-Amz-Meta-Mtime` (the local file's mtime) unless `--use-server-modtime` is passed. `writeProducts` never rewrites a file already on disk, and `--index` can run days before the copy.
    - **The sequence:** build `keep.txt` from the live manifest, then upload a corpus whose `--index` ran over a day earlier, then run the delete. Its new products are not in `keep.txt`, look old, and are deleted while the live manifest names them.
    - **Today's prune is safe:** today's corpus was built and uploaded the same day, and the live manifest names it. But the procedure is not.
    - **Fix:** add `--use-server-modtime` to both `rclone delete` lines, and have `--keep-list` also keep what the local `manifest.json` and `manifest.prev.json` name.

12. **Every species page's server-rendered title is "Cultifolio" (confirmed by curl).**
    - **What happens:** only the layout's `<title>` (`+layout.svelte:189`) reaches the server render of `/species/*`; the page's own `<title>` appears only after hydration. Crawlers, link previews and readers without JavaScript see one title for 8,947 pages. Compare's title does render, so the cause is specific to the species page's head (it carries an `{@html}` JSON-LD block) and needs isolating.
    - **Fix:** drop the layout's static title in favour of each page's, or find what suppresses the species page's.

13. **The origin check is skipped for a percent-encoded path (confirmed).**
    - **Where:** `src/hooks.server.ts:80`.
    - **What happens:** it tests the raw pathname, while SvelteKit decodes before routing. `/api/%73ync/vault` from another site answers 400 (the hook was passed), against 403 for the plain path. The JSON check and the bearer token still stop a write, but the claim "every write naming another site is refused in the hook" is false, and the visitor's `sync` allowance is spent before the 415.
    - **Fix:** test `event.route.id`, or refuse every cross-site non-GET on any path; the app has no cross-site write endpoint.

### Accessibility claims that are false as written (section 6 of the round)

14. **Focus is still hidden under the sticky bars (confirmed by hit-testing).**
    - **Where it happens:**
      - On a phone, tabbing through `/about/how`'s contents goes under the tab bar.
      - On `/plants`, Shift+Tab puts rows and Water under the sticky tool row at both widths.
      - On the species page, the °C button goes under the section tabs.
    - **Why:** `:focus { scroll-margin }` acts only when the browser scrolls, and Chrome does not scroll for an element already in the viewport.
    - **The fix and its cost:** `html { scroll-padding-top: 112px; scroll-padding-bottom: … }` takes `/about/how` from 4 hidden stops to 0, and `/plants` from 18 to 1. This round removed exactly that because it moved anchor and letter jumps in the e2e tests. Those tests need adjusting for it instead.

15. **"3:1 field edges" is false for every select and textarea (measured 1.28:1 and 1.59:1).**
    - **Why:** the global rule (`theme.css:396`) loses to `.field select` and the pages' scoped rules on specificity.
    - **Fix:** `:is(input:not(...), select, textarea) { border-color: var(--field-edge) }`.

16. **The DLI and cold-floor links go to a glossary that defines neither.**
    - **Where:** `species/[slug]/+page.svelte:332,342` link `/about/how#glossary`.
    - **Fix:** add both terms there, or link `#climate` and `#floor`.

### Harness (the tests that should have caught the above)

17. **The sync tests' vault stand-in hands out the stored object itself, so two tabs share one sync record.**
    - **Where:** `tests/unit/sync-engine.test.ts:60`.
    - **What it hides:** the lock's reload of the record (`Object.assign(m, stored)`) does nothing in every test. With copies, as IndexedDB gives, two tests fail, and one of them is a real bug (finding 23).
    - **Fix:** return `structuredClone` copies, and fix the test that edits `D.sync['meta']` to reach the store.

18. **Thirteen of 45 mutations of this round's fixes are caught by no test, on either Node.** The ones that matter:
    - Deleting the call to `_foreignWrite` in `handle` (only the function is tested).
    - Disabling the `short.json` path (the answers are the same either way).
    - The notice naming a different record from the one the repair keeps (every fixture makes id order agree with stamp order).
    - A restore that repairs every number.
    - A load that writes "Notes replaced": `rule5.test.ts` takes its "before" after the reload's load.
    - The tab-shared sets written as each tab's own copy (the stand-ins define `updateMeta` themselves).
    - The backup's parked set not passed, not merged, not replaced (`backup-replace.test.ts` has a `setParked` that does nothing).
    - No reload inside the lock.
    - The photo body read before its proof.
    - The decoded page-cache key.

    Each has a proposed test, checked to pass on the shipped code and fail under its mutation, in `/tmp/cf-exp/tests/unit/zz-proposed.test.ts` and the `proposed` blocks in that copy.

---

## P2: daily use and robustness

### The collection and sync

19. **A tab that finds the lock taken skips, and its edit is pushed by nobody (confirmed).**
    - **Where:** `engine.svelte.ts:438`.
    - **What happens:** the other tab's run read the outbox before the edit and nothing reschedules it. It waits for the next focus, visibility change or five-minute tick in a visible tab, and until the app is next opened if the grower closes it. The skipping tab shows nothing.
    - **Also:** no sync `fetch` has a timeout, so a hung request, or a frozen tab holding the lock, makes every other tab skip without a word.
    - **The existing test missed it:** it calls `tab2.sync.run()` by hand, which nothing in the app does.
    - **Fix:** `if (!lock) { this.schedule(5000); return; }`, plus an `AbortSignal.timeout` on the sync requests.

20. **"Notes replaced" lists text that was not replaced (confirmed).**
    - **Held and parked edits:** `notes.ts:27-41` reads held and parked notes changes too, so a peer's parked edit lists the text still on screen.
    - **Device-id ordering:** the base search is bounded by the next notes change from any writer, so an edit stamped past a held one (same wall and count) can make a peer's sighted edit read as blind.
    - **Fix:** drop held and parked stamps before reading, and bound by the same writer's next change.

21. **The place form refuses bad numbers without a reason, or drops them in silence (confirmed).**
    - **Where:** `places/[id]/+page.svelte:88-105`. `save()` has no catch and the page never shows `lastWriteError`.
    - **What happens:**
      - "1e999" on an empty floor writes nothing and closes as if saved (`diff` reads Infinity as null).
      - On a floor that had a value it throws "must be a number, not null", which then shows on the plant page with "Free space or back up now".
      - "Water about every" set to "7d", "400" or "0" writes null over the place's rhythm, where the plant form refuses the same input with a sentence.
    - **Fix:** show the notice on the place page, catch in `save()`, reuse the plant form's rhythm check, say "a finite number", and keep the storage advice for storage errors.

22. **The fold-rules hash still misses code that shapes the snapshot (confirmed by mutation).** These changes all left `fold-rules.test.ts` green:
    - The `lastArrival` cursor direction.
    - `dropFoldIn` not moving the counter.
    - `NEWER_FOLD_KEPT_MS` set to 0.
    - `rebuild()` reading `lastArrival()` after `allChanges()`, which would lose a change landing between them from every snapshot load.

    **Fix:** add `rebuild`, `load`, `catchUp`, `dropFoldIn`, `lastArrival`, `foldGen`, `changesByKeys`, `parkStamps` and the meta constants to the hash.

23. **The lock's reload of the sync record loses held stamps kept only in memory (confirmed with copy semantics; checked in the code).**
    - **What happens:** `noteAhead` and `scanClock` add held stamps to the in-memory record without saving it. `Object.assign(m, stored)` inside the lock then puts back the stored list. A change stamped ahead that came in through a restore is never applied when due in that page's life, and "1 held" stays until a reload.
    - **Also:** the reload is a merge, not a replace, so a stale `vaultFull` survives another tab clearing it, and the page's own copies (`quarantined`, `refused`, `lastSync`) are not refreshed.
    - **Fix:** save `held` where it is added, replace the record whole on reload, and refresh the page's fields.

24. **Cost and caching on the server (read; one confirmed).**
    - **`readBody`:** it allocates the declared length before a byte arrives (`sync.ts:522`). About eight stalled 16 MB uploads can push an isolate out of memory. Allocate on the first chunk or grow as data arrives.
    - **The page-cache key:** its corpus and query come from different loads than the page (`hooks.server.ts:46,114`). Across a refresh, one corpus's page can be stored under the other's key for a minute. The species page reads the dossier as the bucket holds it now, not from the corpus the request began with. Take `corpusNow` once in the hook and pass it down in `locals`.
    - **Opening a row:** it slugifies the whole index on every render (`rowItems`, 11 to 22 ms at 9,000; confirmed), and the home page has no rate limit. Keep a map per index.
    - **Smaller items:**
      - `sheetsIn`'s fallback reads dossiers from the bucket as it is now.
      - `/api/dossier` ignores `c` and is public for an hour.
      - The comment at `dossiers.ts:197` is stale.
      - DEPLOY says postings change only with species added, removed or renamed; any searchable field changes them.

### The interface

25. **Today:**
    - **The place count:** it includes places with nothing due ("6 plants … across 4 places" with 3 places of work; the dry Windowsill is counted). Count stops with work at `today/+page.svelte:235`.
    - **After a partial watering:** it shows a disabled "Water 0 of 1 here". Show the watered mark when nothing is left ticked.
    - **On the front page:** "Water these 1" (`Today.svelte:165`); say "Water this one" or "Water 1".

26. **The place page.** It says "No … watering … recorded here yet" directly above its Watering card, because the condition at `places/[id]/+page.svelte:350` ignores `waterDays` and `dryMonths`. Altitude saved without coordinates shows nowhere except the edit form.

27. **Compare at 1280.**
    - The overlaid chart scales to about 960 px wide, with tick labels near 25 px.
    - The per-species charts under it render text near 4 px.
    - Images with no fallback show the browser's broken-image icon and misalign the header row.
    - The empty page's "Compare A, B, C…" button overflows its card at 390.
    - The shaded rows are colour only (about 1.1:1, WCAG 1.4.1), and their footnote says "a quarter of the rain" where the code is `max > 1.25 × min + 10`.

28. **The species page's "In short" sits flush against the card edge** (`.notelist { padding: 0 }`, `species/[slug]/+page.svelte:673`). There is no space between a fact and its grey source, so it reads "genus.archetype table" to a screen reader and when copied.

29. **The 404:**
    - "Not found" is followed by SvelteKit's "Not Found".
    - Its search box is the browser's unstyled field, as is compare's `#cmp-q`.
    - A misspelt species still says "No dossier for …" (`species/[slug]/+page.server.ts:53,61`), the internal word the round removed.

30. **More of section 6 that is not true:**
    - **Sizes under 11 px:** chart labels are 10 px, compare's overlay ticks 8.4 px on a phone, and edit-form labels 10.5 px.
    - **Tap targets:** Today's Hide, the toast's Undo, the compare tray, the top bar icons, the plant page's set-up row, the list's Water button and "Show it" ignore `--tap`, though all are above WCAG's 24 px.
    - **Underlines in dark mode:** two link groups fail `link-in-text-block` (the photograph's "its page is here", and the place page's empty-state links).

31. **The harness:**
    - **"Full vault":** the test's last part proves nothing, because `boot()` replaces the server's KV for every device (`sync-engine.test.ts:173`). Give each bucket one KV.
    - **Leaked channels:** collections from earlier tests write snapshots into later ones through unclosed `BroadcastChannel`s (25 writes in two fold-snapshot tests). Close them in `afterEach`.
    - **Fixed waits:** the new lock tests wait a fixed 50 ms, which round forty-four replaced with `gated()`; a 60 ms slowdown hangs one to its timeout.
    - **Timeouts under load:**
      - `search-generations` "wider" takes 11 to 15 s unloaded and timed out under load.
      - The backup zip test's 3,000 ms limit times its own 80 MB fixture; drop the limit.

---

## P3: polish

32. **Restoring an older removed plant renumbers the growing plant that has held its number since** (`restore`, `collection.svelte.ts:1326`), with no word on the page. A record coming back should yield the number. "Created earlier" states clock order, which a minute's skew can reverse.

33. **The species-notes writer kept by design should become a reading.**
    - **Where:** `plants/[acc]/+page.svelte:407-415`.
    - **What it does wrong:**
      - It copies into a plant event a text the log already holds.
      - It catches only an edit that arrived while the editor was open.
      - It writes on whichever plant's page was used.
      - The species page's own save writes no line at all.
    - **Fix:** add `myNotesBase`, generalise `replacedNotes(changes, field)`, show it on the species page, and drop the line.

34. **Smaller collection and server items.**
    - **Values inside `measures`:** they are not checked, so a length of 1e308 in inches is stored as Infinity and sent as null.
    - **`replacedNotes`:** it is quadratic (1,000 edits take 165 ms, 3,000 take 1,081 ms).
    - **A run that brings nothing:** it can still write a deferred repair when a held whole record comes due across a reload. That defends as a merge, but the round says it no longer happens.
    - **A plant created across two batches:** it is never queued for repair, only noticed.
    - **Two creations of one vault at once:** both answer `created: true` and neither is refunded (`ensureVault`); write the meta with `onlyIf`.
    - **The service worker:** it keys home and species copies by path alone, so `/?by=genus&open=aloe` offline shows whichever home was fetched last.

35. **Interface and copy.**
    - **Truncated text at 390:** the home count, the plants list's counts and placeholders, and the place and plant edit forms (single column under 420 px).
    - **Separators:**
      - "Bench 1BENCH" and "Greenhouse·0 plants": flex drops the spaces.
      - "10/ 20" and "50%· first at day 0".
      - "2026-0010,2026-0011".
    - **Wording:** "0 d ago" for today, and "batchs" in code.
    - **Charts:** the frost line strikes through "COLD QUARTER".
    - **Titles:** `/about/how` and `/about/formats` break "Name · Cultifolio".
    - **The Welwitschia tile:** it shows its genus where others show the family.
    - **The front page's "Free and open source":** not linked (AGPL-3.0, with `scripts/` MIT).
    - **The footer's source list:** it omits Wikidata.
    - **The skip link on a private page loaded directly:** focus starts on `#main`, so the first Tab skips it.
    - **The climograph's description:** it names no source.
    - **200% text on a phone:** `/about/formats`, `/propagation` and compare's picker scroll sideways. That is beyond WCAG's requirement.
    - **Stale comment:** the engine's header comment still says held changes are written straight to the log.

---

## Checked and sound

- **R2's conditional put:** `onlyIf: { etagDoesNotMatch: '*' }` stores only when absent, and returns `null` when the precondition fails. That is Cloudflare's Workers API reference, and workerd's binding agreed: 1 of 20 concurrent puts stored. `storeOnce` handles the `null`. Whether the condition is atomic under concurrent writers in production is not documented.
- **The origin check, apart from the encoded path:** it refuses `Origin: null`, same-site and cross-site requests, and other workers.dev origins. The app's own requests pass despite `no-referrer`.
- **The vault POST and the /48 count:** the POST's JSON-only 415 works. The /48 count for forecast, names and match applies on a cache miss only, as designed. Day rollover uses one captured day per upload. The `recount` floor holds.
- **`short.json`:** it equals the whole index by construction. 40 spellings × five values of n, plus n of 101, gave zero differences in answer or order: uppercase, spaces, leading markers, accents, digits, the Kelvin and Ångström signs, ß, ﬁ, combining marks, İ.
- **Answers under one corpus:** the API routes give an id and content from one load, and are public only when asked under that id. `homeWindow` stays bounded for every combination of `at`, `open`, `from`, `part`, `by` and `chip`.
- **The strict manifest and the keep list:** the counts and names check works, and `--keep-list` refuses anything but an accepted manifest.
- **Writers to the log:** none is triggered by a page opening, a load, a catch-up or a rebuild. The new check on the grower's writes refuses nothing any current form writes (rhythms, dry months, pot size, "In the pot now", lengths, bottom heat).
- **The repair:** the notice and the repair choose the same record. Two devices with clocks a minute apart agree. Held changes go through `ingest`, and a later edit is stamped past them.
- **The rollback rule:** it does not ping-pong. A shell under older rules folds the whole log at most once an hour.
- **Watering rhythms:** Today, the plants list, the place page and the plant page agreed at every step: inherited, overridden, per plant, back-dated, dry months. Altitude in feet stores metres. Settings persist across a reload.
- **Propagation and labels:** the "In the pot now" summary, pot-up to "Print 3 labels", and the labels preview with QR all work.
- **The phone chrome:** the tab bar hides and returns, the compare pill works, and the top bar's "+" goes to the section's own add form.
- **Accessibility, apart from the findings above:**
  - axe reports nothing else on 58 scans.
  - The skip link is first on public pages.
  - `aria-current` is set, and `aria-haspopup` sits only on the real menu.
  - The lightbox's focus handling works, and a plant can be added with the keyboard alone.
  - There is no horizontal scroll at 320 px, or at 1280 px with 200% text, and the type scale doubles with the root.
  - The tokens hold their contrast: `--field-edge` is 3.0 to 3.6:1 in light and 4.6 to 5.2:1 in dark, and `--warm-ink` is 5.05:1.
- **The grower's pages:** with reference photographs off, they make no outside requests. The frost watch rounds the site. `/about/formats`' field lists match `FIELD_TYPES`, `db/types.ts` and the backup manifest. `og.png` and the front page's tags are complete.

## Suggested order

1. Findings 1 and 2: the vault count and the search path. They are small, and they are the two a hostile reader would find.
2. Findings 3 to 8: words that are false.
3. Findings 9 to 13: server correctness, the manifest fallthrough, the prune flag, the species title.
4. Findings 17 and 18 before any further fix to sync or the collection: tests that can see.
5. The rest.

Round fifty-nine should state only what its tests or measurements show, and each accessibility claim should come with the measurement that backs it.
