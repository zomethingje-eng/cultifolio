# Round 81, agent S: search and names typed

Copy `/tmp/claude-0/rev81/S/`, branch `r81`. Base checks: a `git worktree` of `r81base` at `/tmp/claude-0/rev81/S-s/base`, where each new test was run.

## Done

### W1 and P4: a reloaded or shared `/?q=` threw and search stopped (the most common grower-facing fault)

- **Cause.** `src/routes/+page.svelte` wrote the address in an `$effect` at the first render. SvelteKit's router was not up yet, so `replaceState` threw "reading '$set'". The effects never ran again, and `html[data-ready]` was never set. While the collection opened, `keepLocal` also deleted `?q=`.
- **Fix** (`+page.svelte`, the head of the script and the search effect):
  - `routerUp` is set in the existing `afterNavigate`, and the address effect waits for it.
  - While the collection is still opening, the address keeps what it has.
  - `sent`: the text sent to the catalogue on purpose, either a `?q=` the page opened with or text taken there by "Search the whole catalogue". It is searched whatever the collection holds, and a `?q=` makes the catalogue the view (`browsing`).
  - `answered`: until the server answers the text in the box, the page says "Searching…", never "Nothing in the reference matches" (rule 2).
  - Text kept on the device on the catalogue view (it matches one of the grower's plants, or is shaped like a plant number) now says so: "The catalogue was not searched for …" with a button to search it. Before, it said "Nothing in the reference matches".
- **Tests.** `tests/e2e/r81s-search.spec.ts` 1 and 2 (desktop and phone):
  - 1: `/?q=echeveria` opened fresh lists 30 of 75 matches, keeps `?q=`, searches "aloe" when it is typed next, and throws no page error.
  - 2: a reloaded search is answered again.
  - On r81base both time out: the page never sets `html[data-ready]`, which is the throw.
- **Safe mid-fill:** yes. App only.

### P1: Back from a species page lost the search, the "Show more" and the place

- **Fix** (`+page.svelte`): the page's `snapshot` now also keeps a search's place: the text, how many hits were shown, and the hit at the top of the screen with its offset (`searchPlaceNow`). On Back (and on a reload, through Kit's stored snapshots) `restoreSearch` and `putBack` ask for the same pages again, as "Show more" asked for them, and put the hit back where it was (`holdPlace`, round 80's). Hits carry `data-slug`.
- The grower's case (Back went to `/` and the own-plants view) is fixed by `sent` and `browsing` above.
- **Tests.** `r81s-search.spec.ts`:
  - 3: Show more to 90, open the 41st hit, Back: 90 hits, the hit within 4 px of where it was. On r81base there are 30 hits.
  - 4: a grower's whole-catalogue search, a hit opened, Back: `?q=agave` and "30 of 289 matches". On r81base the "30 of 289" line is not there.
- **Safe mid-fill:** yes.

### W4: the import called older names "ambiguous"

- **Fix** (`src/routes/plants/import/+page.svelte`):
  - A line says "an older name: the reference has this species as Aristaloe aristata" (a near spelling says "not under this name; did you mean …").
  - The summary counts the two apart: "an older name, the reference's name for it suggested: N" and "not under this name, a near spelling suggested: N".
  - New: "Use the reference's name on all N lines with an older name" (`#imp-use-older`), and per line "on all N lines of this name". Each plant keeps the sheet's name as received, as "Use it" always did.
- A suggestion is still not taken on its own: round 62's rule, the grower's record. I kept it.
- The plant page's "Name not in the reference" now reads "No species page under this name" (`src/routes/plants/[acc]/+page.svelte:669`, one span; U's page, one line), which is true of an older name too. That page cannot say "an older name of X": it finds a sheet by hash bucket, and the name never goes to the server.
- **Tests.** `tests/e2e/r81s-import.spec.ts` 1 and 2:
  - 1: five lines, four of them older names; one press, then Add. Every plant is filed under Aristaloe aristata or Kroenleinia grusonii with its key, and `nameAsReceived` is the sheet's name.
  - 2: one name's lines only.
  - On r81base the summary says "ambiguous" and neither button exists.
- Updated to the new words: `r60-grow.spec.ts` r60 1 and 2, `r62l-plant.spec.ts`, `smoke-3.spec.ts:672`.
- **Safe mid-fill:** yes.

### W5: a hit found by an older name now says so

- `olderNameOf` in `src/lib/ui/ref/searched.ts` reads the words as the search reads them, against the hit's `syn`, `older` and `kew`. It is null when the hit's own name, a common name, its family or a region takes the words.
- The hit row shows "older name: Sansevieria trifasciata" and links `/species/<slug>?was=<name>`. The species page already checks `?was=` against the record.
- **Tests.**
  - `tests/unit/r81s-older-hit.test.ts`: on r81base the function does not exist.
  - `r81s-search.spec.ts` 5: the row's text and `href`. On r81base neither is there.

### C2: "hens and chicks" and "rose" (`src/lib/core/search.ts`, `search-files.ts`)

- **Plurals.** `singularStart` reads a plural as its singular: "hens" as "hen", "bushes" as "bush", "lilies" as "lil". Never a word under four letters, and never one ending in -ss, -us or -is.
  - It applies in common names only, and only in a phrase of two words or more. A word alone is answered as typed, as a heavy word's kept answers are.
  - The singular is always a start of the word typed, so the key files read each phrase word under `readStart` (its singular), whose candidates hold every hit.
  - A singular counts as a whole word in the order.
- **"rose".**
  - A Name-group hit whose genus only begins with the word typed comes after the common names that hold that word whole, unless the genus is typed whole ("rosa", "aloe ver" keep their place) or there is no such common name ("rosen", "echev").
  - A one-word common name equal to the query that species of two genera share ("Rose" on two Cotoneasters and on Rosa mollis) is treated like a generic noun (closeness 3.5).
- **Tests.** `tests/unit/r81s-search.test.ts`, 7 tests:
  - plural reading;
  - "hens and chicks" through the key files equal to the whole index, the plural's own key holding no Sempervivum;
  - "rose" order;
  - genus typed whole or still being typed;
  - "rose" through the key files equal to the whole index.
  - Three fail on r81base: no `singularStart`, Echeveria lilacina alone, Rosenbergiodendron first.
- **Safe mid-fill:** yes. `--index` uses these only for the best hundred it keeps of a word too common to list, and their new order arrives with step 12 if this is delivered before the fill's last day.

### D6: the slow searches (found from the code and workerd)

- **The cause.** `stored()` and `loadIndex()` in `src/lib/server/dossiers.ts` kept every read in flight in isolate-wide promises (`products`, `loading`), shared across requests.
  - On Cloudflare a read belongs to the request that began it, and is cancelled when that request ends. The workerd binary in `node_modules` carries the runtime's message for this: "A promise was resolved or rejected from a different request context … Continuations for that request … have been canceled".
  - `warmSearch` begins about 15 reads (tables, genera, blocks, 12 photograph blocks, directories) and awaits none of them. A search that answers before they settle ends its request, and a later search that meets one of those entries waits for ever.
  - This fits D6: no response header, one wait of 4.5 minutes, and each search answered in under 2 s when asked again (a new isolate, or the entry gone).
  - It is not the client: the front page gives up at 10 s and says "could not be reached".
- **Fix.**
  - A held read records its request (`platform.context`) and whether it has settled. Another request's read still in flight is not waited on: the request reads for itself, and its read replaces the entry.
  - `warmSearch` hands its reads to `waitUntil`.
  - `loadIndex` follows the same rule.
  - Within one request nothing changes, and a settled read is everyone's.
- **Tests.** `tests/unit/r81s-shared-reads.test.ts`: request A's read never settles, and request B is answered. Also: the warm reads go to `waitUntil`, and a second request's corpus load is not held. All three fail on r81base (the read "hung", 0 kept, the load "hung").
- **Safe mid-fill:** yes. Worker only.

### Hybrids' × (with H)

- H's names (`/tmp/claude-0/rev81/H/src/lib/core/hybrids.ts`, read only) carry U+00D7 as Kew writes it: "Mentha × piperita" and "× Astrolista bicarinata".
- The search's tokeniser drops "×"; "x" is a skipped marker unless it is typed last; `genusOf` and `searchGenera` read past a leading sign. So "×", "x", "X", "×piperita" and nothing all read `mentha piperita`, and the hybrid comes first, through the key files too. `r81s-search.test.ts`'s third part proves it. No change was needed in search; it holds on the base too.
- `olderNameOf` and the front page's genus row read past the sign as well.

### About pages

- `/about/how` (the search paragraph):
  - a genus only begun comes after whole common-name words;
  - the shared one-word name;
  - plurals in a phrase;
  - a hybrid found with "×", "x" or neither;
  - the "older name" line on a hit;
  - the address bringing a search back on a reload, a shared link or Back.
- `/about/formats`: the import's older-name wording and the bulk choices.
- DEPLOY.md: `### Round eighty-one: search and names typed (agent S)`, before round 80's U section.

## Repairs for the live site

None. The app applies everything. The only index-time effect is the order of a heavy word's kept hundred, which step 12's own `--index` writes if this is delivered before the fill's last day.

## Needs

- **H:** none from search. Keep "×" as a character in `name` (never the letter x), with a space after it as Kew writes it; the search reads either. `slug` and the matching stay unsigned, as in your `unsigned`.
- **U:** `src/routes/plants/[acc]/+page.svelte:669` now reads "No species page under this name" (one span, mine for W4). W7's hit-link name now also carries "older name: …" when there is one.
- **B:** the skipped `r67n-search-route` (C3) is yours. My own equivalence proof is below.

## For the owner's PC

- Run the new specs in every engine:

  ```
  npx playwright test tests/e2e/r81s-search.spec.ts tests/e2e/r81s-import.spec.ts tests/e2e/r60-grow.spec.ts tests/e2e/r62l-plant.spec.ts --project webkit --project phone-webkit --project firefox
  ```

  - They block the service worker, scroll with `window.scrollTo`, count distinct queries, and wait only on what the page shows.
  - r81s 3 depends on Kit's snapshot restore after `goBack`, which is the same code path in every engine.
- After the deploy, run DEPLOY's three checks.

## Measured

- **Live index** (`/tmp/claude-0/rev81r/B-s/live/index.json`, 48,361 species, whole-index ranking in node):
  - "hens and chicks": 2 hits became 9; Sempervivum tectorum is 2nd and S. marmoreum 3rd (before: none).
  - "rose": the first three are now Rosa sherardii, laevigata and setigera, where they were the three Rosenbergiodendron. Rosa canina moved from 60th to 51st of 868. Photo counts, capped near 100, decide the ties among the "… rose" headlines, so it is not in the first thirty.
  - "mint", "pine", "fern" and "sage" now list mints, pines, ferns and sages first, where Minthostachys, Pinellia, Fernandezia and Sageretia led.
  - Each query takes 45 to 360 ms with the machine at load 13, the same as the base.
- **Key files against the whole index**, in memory over round 77's real index (8,947 species), using `buildSearchFiles` and `searchFromFiles` of this code:
  - 5,512 queries: 2,500 plural phrases made from the index's own common names, 12 words, and 3,000 of round 77's proof queries.
  - 5,508 are the same, rank for rank; 4 are "narrow" by design; 0 differ. 2,399 of the plural queries have hits.
  - The script is `/tmp/claude-0/rev81/S-s/proof81.mts`.
- **Tests.**
  - Unit: the new files pass (7 + 2 + 3); 69 search and import files pass (807 tests).
  - The whole suite (`npx vitest run`, alone): 4,474 passed, 10 skipped, and 2 failed: `r72f-about` and `r74-spaces`, which read my first `/about/how` words. After rewording, both pass (14 of 14).
  - e2e on Chromium, desktop and phone: r81s-search, r81s-import, r60-grow, r62l-plant, r62g-import, r80s-search, r80u-back, r73p-front, r63fv-front, r61q-search, r77f-enter and r77k-narrow all pass, 79 tests plus r60-grow's 16 rerun.
  - On r81base all 13 new e2e tests fail, at the lines named above.
  - `tsc` and `svelte-check` find no errors.

## Not done, with why

- Taking an older name automatically on import: round 62's rule keeps the grower's choice. One press now does every line.
- The plant page naming the accepted species for an older name: the page never sends a plant's name to the server, and its sheets are found by hash.
- The postings path (corpora built before round 77) reads no plurals. It gives fewer hits, never wrong ones, and the live corpus does not use it.
- The other isolate-wide promise caches (`lazyIndex`, the whole-index preparation) are used only by corpora without key files, so they are not live. They are left as they were.
