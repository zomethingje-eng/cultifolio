# Triage review of round sixty (area "triage")

Round sixty did almost all of what the triage kept. The table below has 196 rows:
- about 137 done as decided or asked;
- 28 partial;
- 8 done differently from the decision;
- 15 not done, most of them P2 and P3 items the triage never picked up (marked "kept: no");
- 4 deferred with a reason;
- 3 I could not check from here. The account (`docs/REVIEW-ROUND-60.md`) mostly holds. Three of its claims are false as written: the unit test count, the "end-to-end test" behind the phone first-screen claim, and the account of the remaining fuzz divergence. The worst problems sit at the seams. `/about/formats` now states three rules the code breaks: devices "never park" their own changes, a vault is "listed on every open", and a refused device "sends nothing more until Retry-After". `/about/how` calls its storage list "every key" and leaves out three keys the grower features added. The sync glossary still says "Sync batch" where the sync page now says "sync bundle". One P1-class item from round fifty-nine is only half done: places held by vaults that stored one tiny object are never given back, so ten days of cheap uploads still close sync for good.

**How I checked:**
- I read `REVIEW-TRIAGE-59.md`, `REVIEW-SELF-59.md`, all nine `docs/review-59/*.md`, the six agent reports and `REVIEW-ROUND-60.md` line by line, and checked each item against the code at `21257b7`.
- I ran these in a scratch copy (`/tmp/r60rev/triage/repo`, node_modules linked):
  - `vitest list`: 767 tests in 83 files.
  - `svelte-check`: 729 files and 0 errors; the one other error comes from `playwright.config.ts`, which I did not copy.
  - The skewed convergence fuzz, twice: once as committed, and once with the +3-day skew replaced by 0, reverted afterwards (md5 checked).
  - `scripts/live-check.mjs` against 4173, with the local skips.
  - One Playwright script (`/tmp/r60rev/triage/pw1.mjs`):
    - the front page at 390×844;
    - printing labels inside the sample collection;
    - nine pages at 320 px with 200% root text.
- I used curl on about 25 routes for headers, redirects, search and meta.
- I grepped every storage key, plural helper, readerLat copy, unused export, TODO, `console.log` and `[AUTHOR]` marker.
- I read the e2e logs in `/tmp/r60`.

---

## 1. The table

Verdicts:
- **done**: as decided, with the evidence.
- **partial**: what is missing is named.
- **not done**.
- **different**: done another way than decided; I say whether that matters.
- **deferred**: with the reason and where it is stated.

The `kept` column says whether the triage (`REVIEW-TRIAGE-59.md`) kept the item for round sixty. Rows where it says "no" are self-review or file-level items the triage never named. The account's claim covers only "every item the triage kept, plus the experience list", so those rows are listed for completeness.

### 1a. "Where the three agree"

| Item | Kept | Verdict | Evidence |
|---|---|---|---|
| Clock negative age (S1, A2) | yes | done | `hlc.ts:137-139` `trustedAge` (age > −5 min); used in `readStored` :48 and `clockChecked` :129; `r60-clock-review.test.ts:130,158` |
| Edit stored and never shown under a wrong clock (S7, A1, B2) | yes | done | `collection.svelte.ts:1285-1318` `stampPast`; tests `r60-clock-review.test.ts:74,97`; fuzz: 0 lost of 120 skewed seeds (I re-ran it) |
| Links by number open the wrong plant (S2, A13, B1) | yes | partial | `links.ts` `plantHref`/`batchHref` used on 11 surfaces. **Missed:** the species page's "your plants" chips, `species/[slug]/+page.svelte:360` `href="/plants/{accNo(a)}"`. The chooser catches it, so nothing opens the wrong plant, but the record is in hand there (finding 9) |
| In-flight bytes never expire (S P2, A18, B6) | yes | done | `counters.ts:114-124,306,322` (`LEASE_MS` 10 min) |
| Vault-ceiling 503 loses its sentence and backoff (S11, A20, B9) | yes | partial | `engine.svelte.ts:561-577` `refusedBy`/`waitRefusal`; sync page `#sync-refusal` (:180). **Missing:** the refusal lives only in memory (`refusal = $state`, :146), so a reload or another tab sends again at once. The wait is also capped at 1 h while a day refusal runs to midnight (finding 4) |
| Fail-open admission (S, A19, B8) | yes | done | `VaultUnchecked` 503 Retry-After 60; `r60-proposed-server` S05, `r60-review-server` test 7 |
| Stale DELETE (S P3, A12, B5) | yes | done | `withHold`, receipts `key:v:<version>`, 409 "newer"; engine sends `x-photo-removed-at` (`engine.svelte.ts:1003`) |
| Snapshot ignores checked clock (S P3, A15, B4) | yes | done | `collection.svelte.ts:397` (`f.checked === clockChecked()`), :476; test `r60-clock-review.test.ts:236` |
| Commons originals at full size (S13, A7) | yes | partial | `photo-size.ts:57-61` `shownAt` returns the dossier's 800 px thumb, but **keeps the original when the dossier has no thumb on Commons or GBIF**. How many live dossiers that leaves is unknown |
| Genus meta and fallback description claim a climate (S14, A5) | yes | done | Row meta now reads "N species in the reference, M with habitat climate where the sources answered" (curl of `/?by=genus&open=welwitschia`); `head.ts` `speciesDescription` |
| Tests that do not guard their fix (S16, A31, B12) | yes | done | See 1e "Tests" |
| e2e steps that navigate mid-write (S, A34) | yes | done | U report item 27 (2857, 730/734, 1107, round-52 `syncRun`) |

### 1b. Outside-review items (A, B)

| Item | Kept | Verdict | Evidence |
|---|---|---|---|
| A24 fixture species in production | yes | different | A refused or unreadable corpus with nothing held is a 503 (`dossiers.ts:129-133`). A bucket holding **no corpus at all** still serves the static corpus, then the fixture (:136-150), because the e2e suite runs on an empty bucket. `live-check` fails a deploy whose `/api/corpus` is `fixture`. Acceptable; documented in the S report, not in DEPLOY |
| A25 corrected corpus stays blocked | yes | done | `REFUSAL_MS` 10 min (`dossiers.ts:102`) |
| A6 unreadable dossier said as absent | yes | done | 503 `unreadable`; `+error.svelte:7-26`; compare notice (`compare/+page.svelte:144`) |
| B11 mutable dossiers cached publicly | yes | done | curl `/api/dossier/5384013` gives `Cache-Control: no-store` |
| A27 synonym 404s and compare load their own corpus | yes | done | S item 27 |
| A28 `_clean` slices before NFC | yes | done | `api/search/+server.ts:38` |
| A29 `clip` edge cases | yes | done | `text.ts:44-53`; `corpus-r60` tests |
| A30 page-cache bypass `/%73pecies` | yes | done | `hooks.server.ts:59,117` `pathKey` |
| A9 extremes with no source | yes | done | X item 3; NASA POWER named in the climograph |
| A G uncredited photographs | yes | partial / deferred | Compare shows author and licence. Tiles credit the source site only; author on tiles deferred (account §7: the index has no `credit` field) |
| A G edge cache missing from privacy list | yes | done | `/about/how` "Cloudflare's edge … a forecast for an hour … a catalogue search for a day …" |
| A G "No rainy season" for 8 wet months | yes | done | "Rain spread over N months: no short rainy season" (X item 2) |
| A G "N species with their native range" | yes | done | grep finds the phrase nowhere in `src` |
| A G Today's "growing months the species sheet names" etc. | yes | done | `today-words.ts`; `Today.svelte:155-158` |
| A G POWER cells 0.5° × 0.625° | yes | done | X item 2 |
| A3 version poll and SW update fetch unlisted | yes | done | `svelte.config.js:17` `pollInterval: 0`; `/about/how:87,92` "once each time a page is loaded in full" |
| B10 fourth photo host | yes | done | CSP `img-src` and `/about/how` both name exactly four hosts (my guard test passes) |
| A23 `/about/formats` on the vault ceiling | yes | partial | Ceiling text rewritten. The same paragraph still says "A listing of the vault puts its total right **on every open**", which round sixty made false (`RECOUNT_MS` 1 h, `sync.ts:434-450`). Finding 2 |
| A14 Undo renumbers the wrong plant | yes | done | `collection.svelte.ts:1404` `madeSince` compares `born` with `removedAt` |
| B3 clock policy and its account disagree | yes | done | Account §1.5 says peers stay held; `log.ts:216-222` |
| A16 notes after a parked base | yes | done | `r60-notes-review.test.ts:46`; `notes-replaced.test.ts` |
| A17 clock line late and wrong | yes | partial | Now also runs after a write (`collection.svelte.ts:1260`); two wordings by `clockTrusted` (`+layout.svelte:303`); "Nothing is lost" gone. **Missing:** an unchecked clock is still shown nowhere unless the device's own last change is ahead of it. Two stale comments still describe the old line (`collection.svelte.ts:57,62`) |
| B7 stale listing erases a landed upload | yes | done | Generation counter; `setBytes(..., gen)` refuses |
| B8 failed first write holds a slot | yes | done | `unadmit` / `Counters.unfill` |
| A22 counter object never sleeps | yes | done | `counters.ts:291-294` re-arms only while a sweepable key exists |
| A26 near pass never charged | yes | different | Charged as "exact + near > WHOLE_LIKE", memoised per request (S item 21). Matches the corpus review's proposal; fine |
| A35 Undo focus goes to the heading | yes | done | e2e `smoke.spec.ts:3486` |
| A36 "Water these 0" | yes | done | `Today.svelte:183` renders the button only when `toWater.length`; e2e :3518 |
| A39 `focus.ts` scrolls after a tap; `innerHeight` | yes | done | U item 13 |
| A40 200% text breaks names | yes | done | U item 19 (`overflow-wrap`) |
| A32 flaky "take uses today's row" | yes | different | S found no test by that name and made the S15 logic deterministic with explicit times. Fine |
| A31 engine not in the fold-rules hash | yes | partial | `fold-rules.test.ts:46-48` adds the engine's `hold` and `takeBatch`. **Not hashed:** `stampPast`, `isOwnStamp` and the `staleOwn` park in `commit`, which since round sixty write park records that shape every later fold (finding 7) |
| B13 prune race across two checkouts | yes | deferred | `DEPLOY.md:96` "One operator, one checkout" |

### 1c. Self-review P0 and P1 (S1 to S18)

| Item | Kept | Verdict | Evidence |
|---|---|---|---|
| S1 set-back clock hides plants | yes | done | as 1a |
| S2 two plants under one number | yes | partial | as 1a; species page chip link missed |
| S3 archetype table raises cold floors | yes | done | `arch-tables.json` `none` list (24 genera); split families assign none; `sheet.ts:211-244` convention apart; `r60x-arch.test.ts` |
| S4 launch draft | yes | partial | 274 words; AI disclosure; replies corrected. Still has two `[AUTHOR]` markers (the launch draft). Written by an agent, not "in your own voice after two weeks of use". States "1981 to 2024, 44 years", which the sheet stopped hard-coding. See §5 |
| S5 full device refuses writes silently | yes | done | `collection.svelte.ts:23-25` `writeErrorText`, used at :1254 and :1478; engine :541. No test with an empty-message `QuotaExceededError` on the commit path (the tests throw `new Error('QuotaExceededError…')` with text) |
| S6 label sheets print misaligned | yes | partial | `theme.css:430-432` and `labels/+page.svelte:361-366` hide the install card, bars and toast. **Not hidden:** the sample collection's `.demobar`. In the sample, a printed label sheet starts 54 px low (reproduced; finding 8) |
| S7 unchecked-clock edits never shown | yes | done | as 1a |
| S8 never-synced restore shows nothing | yes | done | `HeldNote` on `/plants` and `/today`; `/sync` `#held` outside `sync.configured` (:320); backup report (:93-95) |
| S9 backup preview promises renumbering | yes | done | `backup.ts:290-292`; `r60-review-backup.test.ts:134` |
| S10 Today's hemisphere | yes | done | `site.svelte.ts:62` `readerLat` used by Today, labels and the plant page |
| S11 503 path | yes | partial | as A20/B9. "Check the ceiling before the body" done (S item 5) |
| S12 200 requests a day close sync | yes | partial | Day ceiling counted at the first object (done). "**Reclaim places held by vaults that stay empty**" decided against: only a failed first write gives a place back. A vault that stores one small batch keeps its place forever, so 200 tiny first uploads a day for ten days still fill the 2,000 for good (finding 3) |
| S13 Commons originals | yes | partial | as 1a |
| S14 climate claims | yes | done | as 1a; catalogue `pending` apart from `notChecked` (curl: "1 pending" for Welwitschia) |
| S15 search misses growers' names | yes | done | curl: `…var. columna-alba` answers with `x-search-relaxed: copiapoa%20cinerea`; the citation query answers directly |
| S16 five tests that don't test | yes | done | `page-corpus` calls real loads; `manifest-refused` uses content etags; counters S15/S16/S18; notes in the collection; clock C03/C05. The mixed-corpus dossier read is pinned as decided (`r60-corpus-mixed.test.ts:11`) |
| S17 settings loses choices | yes | done | e2e :3584 (6× throttle), :3602 |
| S18 iPhone storage | yes | done | `IosFirst.svelte`; persist once (`GrowLayer.svelte:23-34`); e2e r60-grow 13 and 14 |

### 1d. Decisions for round 60

| Decision | Verdict | Evidence and difference |
|---|---|---|
| 1 Stamping past however far ahead | done | `stampPast`, `collection.svelte.ts:1308-1309` |
| 1 Parking "only by arrival judgement, never by its clock" | different | `isParked` exempts own stamps (`log.ts:199-209`). But an edit under a **confirmed clock** parks this device's own stamp more than 2 days ahead, judged by that clock (`collection.svelte.ts:1308`, :1222-1225). The account describes this; `/about/formats` denies it. It runs `markParked` **before** `appendChanges`, so a write that then fails (a full phone) still parks the old value. The field shows its older value; Apply brings the parked one back (findings 1 and 6) |
| 1 Confirmed check fails when `Date.now() < confirmedAt` | different | Implemented as "age > −5 min". Explained in the account §1.3 (the e2e reload loses 61 s). Fine, but `/about/formats` does not state the 5-minute slack |
| 1 Snapshot key gains the checked flag | done | :397, :476; test :236. Not stated on `/about/formats`, which still lists only "rules, device, clock correction" |
| 1 FOLD_RULES 5 | done | `log.ts:43` |
| 2 Unchecked peer changes stay held, shown wherever records are listed | partial | Shown on the plants list, Today, sync and the backup report. **Not** on `/propagation` or `/places`, which also list records |
| 3 Bare shared number opens a chooser | done | `plants/[acc]/+page.svelte:521-524`, `propagation/[id]:338-341`; e2e :3422 |
| 3 Shared-number notice links the other record | done | `plants/[acc]:508` (by id) |
| 3 CSVs gain an id column | done | `backup.ts:344,359,376` |
| 3 Restore yields only to a later-born record | done | :1404 |
| 4 Archetype table never raises a floor; convention labelled unsourced; groups out; split family none | done | as S3 |
| 5 Leases with expiry | done | `LEASE_MS` |
| 5 Listing committed only if nothing crossed it | done | generation counter |
| 5 Admission fails closed | done | `VaultUnchecked` |
| 5 Failed first write gives its slot back | done | `unadmit` |
| 6 Serialise per photo; receipts use `version` | done | `withHold`, `HOLD_MS` 60 s |
| 7 Refused index never falls to the fixture | different | see A24 |
| 7 Remembered refusal expires (10 min) | done | `REFUSAL_MS` |
| 7 Listed but unreadable dossier gives 503 | done | S item 25 |
| 7 `/api/dossier` no-store | done | curl |
| 7 Synonyms and compare take the held corpus | done | S item 27 |
| 8 B13, /48 byte total, `sheetsIn` fallback | deferred | account §7; DEPLOY:96 |

### 1e. Round 60 order

| Step and item | Verdict | Evidence |
|---|---|---|
| 1 Data integrity: decisions 1 to 3, each written to fail first | done / unverifiable | Tests exist (`r60-clock-review`, `r60-review-backup`, e2e :3422). "Fail first" cannot be checked from the tree |
| 2 Climate claims (genus meta, fallback, A9) | done | above |
| 2 Photo credits (front page, Related, compare) | partial | source site on tiles; author deferred |
| 2 `/about/how` list (version poll, SW, static.inaturalist, edge cache, corpus paragraph) | done | above |
| 2 `/about/formats` (A23) | partial | the rewrite left three new contradictions (findings 1, 2, 4) |
| 2 Share card wording | done | X item 4 |
| 2 Commons thumbnails | partial | original kept when no thumb |
| 2 "No rainy season" and Today wording | done | |
| 3 Quota message | done | |
| 3 Label print rules | partial | `.demobar` prints |
| 3 Backup preview | done | |
| 3 Today's hemisphere, Undo focus, "Water these 0", "Watered ✓" | done | U items 8 to 10 |
| 3 503 path and backoff | partial | not persisted; 1 h cap |
| 3 Settings losing choices | done | |
| 3 Search markers and citations | done | |
| 3 Odd species addresses | done | curl: `Copiapoa%20cinerea` and `copiapoa_cinerea` both 301 to `/species/copiapoa-cinerea` |
| 4 Decisions 5 to 7 | done (7 different in part) | above |
| 5 Adopt the 31 proposed tests | partial | Every unit ID is in the tree (S05–S27, S37–S58, C03–C46). Two of three proposed e2e tests (E03, E08) and the settings race are adopted. **Not adopted:** "PROPOSED: html[data-ready] is set only once the page can take input" (`docs/review-59/tests/mut--zz-proposed.spec.ts`) |
| 5 "Plus A's table" | unverifiable | There is no list of A's reproductions in the repo to check against. Tests name A1–A30, A35 and B1–B11; nothing names A13–A17, A23, A31–A34, A36–A40, B3, B10 or B12, though several are covered under other names |
| 5 Fake R2 etag as content hashes, real upload times | done | `tests/unit/helpers/fake-sync.ts` (S item 37) |
| 5 Fuzz generator RNG | done | mulberry32 in search-generations, short-path, postings |
| 5 Engine in the guard | partial | `stampPast` and the edit-time park not hashed |
| 6 Keyboard watering focus and toast | done | e2e :3486 |
| 6 Layout shift on private pages | done (unmeasured) | Footer held until `collection.ready` (U item 17); the account quotes no CLS figure |
| 6 Date-input focus; `focus.ts` after tap; `visualViewport` | done | U item 13 |
| 6 Forced colours | done | `theme.css:434-` |
| 6 Tab bar at large text | done | e2e :3540 |
| 6 Tap targets | done | U item 16 |
| 7 Experience work | see 1g | |

### 1f. Self-review P2 and P3 lists (`REVIEW-SELF-59.md` 158-229)

| Item | Kept | Verdict | Evidence |
|---|---|---|---|
| Server: in-flight bytes | yes | done | |
| Server: every vault open re-lists; `sync` no /48 | no | done | `RECOUNT_MS`; `sync` in the /48 set (`sync.ts:1094`) |
| Server: HEAD, `?was=`, `__data.json` uncached | no | done | `render` bucket (S item 9) |
| Server: one R2 error, every page 500 | no | done | `RETRY_MS` 10 s |
| Server: `readBody` allocates declared length | no | done | S item 7 |
| Server: rejected manifest only in warm isolates | no | **not done** (still open from 59) | `dossiers.ts:199,229`: with nothing held, a refused manifest still serves the top-level index under its own etag, so warm and fresh isolates serve different corpora for up to `REFUSAL_MS` |
| Server: near pass charged | yes | different | as A26 |
| Server: odd species addresses | yes | done | |
| Collection: writer and peers park by different rules | no | deferred | account §1.7 "Known divergence, kept" (but see finding 5) |
| Collection: parked set outside the log, written by a load | no | not done (still open from 59) | `flushParked()` on load (`collection.svelte.ts:408,440`). The B4 test itself expects a load to park and store |
| Collection: replace restore out of space mid-copy | no | not done (still open from 59) | No change to `promote`/`replaceFromStaging`; no estimate before the wipe |
| Collection: CSV writes number-like text bare; no id | yes | done | `backup.ts:311-321` |
| A11y: keyboard watering, toast | yes | done | |
| A11y: layout shift | yes | done | |
| A11y: date inputs under the bar | yes | done | |
| A11y: forced colours | yes | done | |
| A11y: larger text | yes | done | My script: 9 more pages (import, labels, plants, today, both about pages, front, species, compare) at 320 px with 200% root text: `scrollWidth == clientWidth` on all. The breadcrumb overflows inside its own box |
| A11y: tap targets | yes | done | |
| A11y: private pages blank until JS | no | partial | `app.html` shell "Opening your plants…" (U item 18) |
| A11y: large collections load slowly | no | not done | `vault.ts:716-724` `arrivalsAfter` still does one `get` per change |
| Visitor: compare broken images | no | done | X item 8 |
| Visitor: anchors under the sticky bar | no | done | `scroll-padding-top` (U item 13) |
| Visitor: Back loses genus position | no | done | X item 5 |
| Visitor: "1 genera", count ignores the chip | no | done | curl: "1 genus" plural logic in X |
| Visitor: share card | yes | done | |
| Visitor: desktop section tabs | no | done | X item 7 |
| Visitor: compare on a phone | no | done | X item 8 |
| Grower: toast covers "Save and add another" | no | done | e2e :3714 |
| Grower: "Watered ✓" | yes | done | |
| Grower: Today's rules wording | yes | done | |
| Grower: chips drop cultivar | no | done | `PlantName` |
| Grower: place path cut from wrong end | no | done | U item 22 |
| Grower: labels default to US Letter; "Pick all" picks batches | no | done | U item 7 |
| Grower: sync key "shown once here" | no | done | `sync/+page.svelte:254` |
| Grower: dead has no Undo | no | done | e2e :3664 |
| Words: grammar slips | no | done | X item 2; `r60x-arch` |
| Words: raw sync errors | no | done | `sync-words.ts` |
| Words: "vault" and "batch" two meanings | no | partial | "Vault" fixed (`vault.ts:132`). "Batch" not: `/about/how` glossary still defines "**Sync batch**" while the sync page and `sync-words.ts` say "sync bundle" (finding 10) |
| Words: "Nothing leaves it" on three pages | no | partial | Gone as a phrase. The front page welcome says "Add your first plant; **it stays on this device**" with no "unless you turn on sync" (`+page.svelte:671`), though the X report says it was changed to that |
| Words: `/about/how` storage list "whole" | no | partial | "whole" gone, but the page now says "every key" and omits `cultifolio.persistAfterFirst` (localStorage), `cultifolio.iosFirstHidden` and `cultifolio.backupNudgeHidden` (sessionStorage) (finding 1) |
| Words: `/about/formats` behind on the clock | yes | partial | Rewritten. "Never parks its own" is false (finding 1); the −5 min slack and the snapshot's checked flag are not stated |
| P3: private pages indexable | no | done | curl: `x-robots-tag: noindex` on `/plants/…` and `/offline` |
| P3: sitemap `lastmod` | no | done | S item 33 |
| P3: `/.assetsignore` 404 | no | done | `service-worker.ts:32` |
| P3: 12 of 19 requests are shells | no | not done | |
| P3: 50 KB inline CSS per shell | no | not done | |
| P3: maps `max-age=0` | no | done | curl `/maps/land50.svg`: `public, max-age=86400` |
| P3: Apply on a parked note lists seen text | no | done | `r60-notes-review.test.ts:46` |
| P3: fixed waits | no | done | U item 27 (replaced or commented) |

### 1g. Experience list (`REVIEW-SELF-59.md` 233-271; triage step 7)

| Item | Verdict | Evidence |
|---|---|---|
| 1 Product on the front page; three bullets | done | SSR HTML of `/`: three bullets, "This is what every species page shows · Copiapoa cinerea" with the Glance cards and chart; e2e :3731 |
| 2 Say each figure once | partial | Closed cards and one "How this section is made" per section (3 on the page). But the served text of `/species/copiapoa-cinerea` is **2,002 words (was 2,077)**. "72 mm" appears 6 times (was 9), "CHELSA" 17 (was 21), "rule" 10 (was 13), and "NASA POWER" went from 7 to **10**. Most of the repetition is still in the page, now inside closed `<details>` (finding 11) |
| 3 Season in the glance row; "habitat months" on the chart | done | `ui/ref/Glance.svelte`, `season.ts` |
| 4 Paste import, then CSV | done | `src/lib/import/*`; r60-grow 1 to 4 |
| 5 Sample collection | done | `demo.ts`, `DemoBar`, `TrySample`; r60-grow 11 and 12 |
| 6 Bring growers back: `.ics` | done | `export/ics.ts`; r60-grow 10 |
| 6 Frost-only web push (fits with disclosure) | not done | Not mentioned in the account's "not done" |
| 6 Today warmer: "All caught up", stops above frost, firsts | done | `today/+page.svelte:253`; `Firsts.svelte` |
| 7 Lose the cold tone (grower.md §3 table, 10 rows) | done (9 of 10) | Today, forecast, storage, sync key, batch photo, provenance hint (`plants/new:242`), removal (`plants/[acc]:817`), restore, "Added 11 days ago". "Name not checked" kept on purpose (rule 2): different, and right |
| 8 Titles from figures; description from figures | done | curl: title "Copiapoa cinerea: habitat rain, cold nights and light"; description from figures, 155 chars max |
| 8 Every English common name | done (needs corpus rebuild) | `index-entry.ts:26-39`; account §8 |
| 8 Plant photo on the front page's link preview | not done (reason given) | `og.png` unchanged; account §5. Row pages do get a photo `og:image` |
| 8 `twitter:card`, `og:url` on species pages | done | X item 7 |
| 9 iPhone | done | as S18 |
| 10 Spreadsheet download from `/plants` | done | `export/sheet.ts` |
| 10 Selection mode | done | `SelectMode.svelte`; r60-grow 5 |
| 10 Photo timeline | done | r60-grow 6 |
| 10 Numeric price for "spent this year" | different | Parsed from the free-text price (`grow/spend.ts`); no numeric field. Fine; unreadable prices are counted and said |
| 10 Wishlist from Follow | done | `PlantsFoot` `#wanted`; species page "On your Wanted list ›" |
| 10 Label QR shows the species to anyone | done | `grow/qr.ts`; r60-grow 15 and 16 |
| 10 Visitors see fewer tabs | done | `+layout.svelte:404`; e2e :1865 |

### 1h. File-level items in `docs/review-59/*.md` not covered above

Only items whose state differs from "done" are listed. Everything else in those files maps to a row above or to an agent report item I spot-checked.

| File, item | Kept | Verdict | Evidence |
|---|---|---|---|
| a11y-perf 10: desktop front page autofocuses the search when there is a collection | no | not done | `+page.svelte:81,588` `focusOnDesktop` |
| a11y-perf 13: DM Mono has no fallback metrics | no | not done | `theme.css:11-17,33` |
| a11y-perf 15: SW install fetches 825 KB | no | not done | `service-worker.ts:41` precache unchanged |
| corpus 4 | no | not done | as 1f |
| corpus 8: held page renders the bucket's current dossier | no | deferred | pinned as decided (`r60-corpus-mixed.test.ts:11`); account §4 says nothing of it, S report "Known limits" does |
| grower 15: "Print 10 labels" after a pot-up lost on reload | no | not done | |
| harness 11: four e2e claims untested | no | partial | E08 is adopted; the Today rain-rule wording and the species hero's `shownAt` with an unnamed host are still untested |
| product 11: link preview shows no plant | no | not done (reason given) | as 1g 8 |
| product 13: shells could be static | no | not done | |
| visitor 18: search on a phone scrolls 255 px; "Enter opens the first" | no | not checked | |
| visitor 21: front page shifts on a phone | no | not checked | |
| visitor 22: map marker away from every dot | no | not done | No caption chip on the map |

---

## 2. Everything not "done", most important first

1. **`/about/formats` states three rules the code breaks** (rule 4). These are findings 1, 2 and 4: "never parks its own changes", "total right on every open", and "sends nothing more until Retry-After".
2. **S12: vault places are never reclaimed.** Sync can still be closed for good by about 2,000 cheap first uploads over ten days (finding 3).
3. **A20/B9/S11: the 503 backoff lives in one tab's memory** (finding 4).
4. **The account's explanation of the remaining fuzz divergence** does not hold for seed 1008 (finding 5).
5. **Decision 1's edit-time park** runs before the write and is not in the fold-rules hash (findings 6 and 7).
6. **S6: the sample's banner prints on the label sheet** (finding 8).
7. **S2: the species page's plant chips link by number** (finding 9).
8. **Decision 2: no held notice on the propagation and places lists.**
9. **Words:** "Sync batch" against "sync bundle"; "it stays on this device"; three storage keys missing from `/about/how`.
10. **Experience 2: the species page is 4% shorter, not de-duplicated** (finding 11).
11. **S13: a Commons original is still loaded when the dossier has no thumb.**
12. **S4: launch** still has two `[AUTHOR]` markers and an agent's voice.
13. **Step 5:** one proposed e2e test not adopted; "A's table" cannot be matched.
14. **A17:** the unchecked state is shown only through the clock line's case.
15. **Not kept by the triage and still open from 59:**
    - the rejected manifest on fresh isolates;
    - the parked set written by a load;
    - a replace restore out of space;
    - large-collection tail reads;
    - the shells and inline CSS;
    - the desktop autofocus;
    - the font fallback;
    - the 825 KB install;
    - the pot-up label offer;
    - the map marker caption.
16. **Different but acceptable:**
    - the fixture on an empty bucket;
    - the −5 min slack;
    - the near-pass rule;
    - the price parsing;
    - "Name not checked" kept.
17. **Deferred with reasons:** B13, the /48 byte total, `sheetsIn`, tile author credits.

---

## 3. Findings

### 1. P1, confirmed by test. `/about/formats` says the device never parks its own changes, but an edit under a confirmed clock does

- **Where:**
  - `src/routes/about/formats/+page.svelte` (the parking paragraph): "This device never parks its own changes by its own clock, checked or not: a change it made, or read from a file, with no arrival to judge it by, is only ever held, as above, never parked."
  - `src/lib/db/collection.svelte.ts:1308` and :1222-1225: under `clockChecked()`, an own stamp more than `PARK_MS` ahead goes into `staleOwn`, and `commit` calls `markParked` on it. The account's §1.2 says so.
- **Also false in the same sentence:** "a change it made … is only ever held". `isHeld` returns false for this device's own writer (`log.ts:220-222`), so own changes are never held either.
- **Why it matters:** this is the page first-time readers are invited to check. It is wrong on the exact rule round sixty changed.
- **Reproduction:** `/tmp/r60rev/out/tests/triage--about-seams.test.ts`, test 3 (fails).
- **Fix:** "A change this device made is never held, and is parked by its own clock in one case only: when the clock is confirmed by a sync server and the grower edits a field whose stamp, made here, is more than two days ahead. That old stamp is parked with the edit, and Apply brings it back."

### 2. P2, confirmed by test. `/about/formats` says a vault is recounted on every open; since round sixty it is at most hourly

- **Where:**
  - `about/formats` (the counters paragraph): "A listing of the vault puts its total right on every open and once a day".
  - `sync.ts:434,444,450`: `RECOUNT_MS = 3_600_000`; an open lists again only when the last listing is over an hour old.
- **Reproduction:** seam test 2 (fails).
- **Fix:** "on an open when the last listing is over an hour old, and once a day".

### 3. P2, read. Places held by vaults that stored something are never reclaimed, so S12's "closes sync for good" still holds

- **Where:**
  - `counters.ts` `fill`/`unfill`;
  - S report item 4 ("not released when a vault 'becomes empty'");
  - `DEPLOY.md:66` ("vaults abandoned for good are not reclaimed by the code").
- **What happens:** the self-review asked for two things. It asked for the day ceiling to be counted at the first object, which is done. It also asked to "reclaim places held by vaults that stay empty". A vault that stores one 1 KB batch takes a place under `all` forever. That costs 5 per IPv4 address and 20 per /48 a day. About ten /48s a day for ten days fill the 2,000, and every new grower is then refused until the operator redeploys with a larger `SYNC_VAULTS_MAX`.
- **What changed:** the attack now needs an upload, not an empty creation. The account §4 presents S12 as solved.
- **Smallest fix:** count a place only once a vault has stored, say, a second batch on a later day, or 64 KB. Or reclaim places of vaults with no write in 90 days. At the least, list this under "Not done, and why" and add the redeploy step to DEPLOY's launch checklist.

### 4. P2, read. The 503 refusal is kept in one tab's memory and capped at an hour; `/about/formats` promises more

- **Where:**
  - `engine.svelte.ts:146`: `refusal = $state(...)`, never written to the vault meta or storage.
  - :564: `Math.min(3600, Retry-After)`.
  - :565: stored only when Retry-After ≥ 60.
  - `/about/formats`: "A device given that answer keeps receiving, sends nothing more until the Retry-After has passed".
- **What happens:** a reload, a second tab, or the next app launch starts a fresh engine with `refusal = null`, and the first run sends its batch (up to the batch cap) and is refused again. A day refusal (Retry-After until UTC midnight) is retried hourly by design. So the page's promise holds only within one page's lifetime, and never for more than an hour.
- **Fix:** store `{ text, until }` in the sync meta beside `vaultFull`, read it in `waitRefusal`, and say "or within the hour" on formats.

### 5. P2, confirmed. The account's explanation of the remaining fuzz divergence does not hold for the one seed it traced

- **The claim** (account §1.7): with skews up to three days, 120 seeds lose nothing and 26 diverge; "with the three-day-ahead skew taken out, 2 do. The one traced (seed 1008) is this case: the peers parked a plant made 30 hours fast by its arrival".
- **I ran it** (`r60-fuzz.test.ts`, verbose):
  - As committed: `"seeds": 120, "lost": 0, "diverged": 26`. The first four diverged seeds are 1005, 1008, 1010 and 1012.
  - With `3 * DAY` replaced by `0` in the skew pick (`r60-fuzz.test.ts:181`, same number of draws): `"lost": 0, "diverged": 1`, and that seed is **1008**.
- **So:** seed 1008 diverges with no device ever three days fast. It is therefore not "this case" (a device three days fast whose own edit it keeps folded), which is what the account calls a known divergence that is kept. The account's own description, "a plant made 30 hours fast", points at another mechanism. 30 hours is under `PARK_MS`, so being parked "by its arrival" needs something else: an HLC carried forward, or the −72 h skew on device c in that seed.
- **Not found:** the "2" (I get 1, with what I take to be the author's method).
- **Fix:** trace seed 1008 to its cause before calling the divergence known. Add a test that pins seed 1008's state after every device presses Apply.

### 6. P2, read. The edit-time park of a stale own stamp is written before the edit, and stays when the edit fails

- **Where:** `collection.svelte.ts:1222-1225`. `if (rebase.length) await this.markParked(await changesByKeys(rebase))` runs before `appendChanges`, inside no transaction with it.
- **What happens:** on a confirmed clock, a grower edits a field whose current value carries this device's own stamp more than two days ahead. If the vault then refuses the write (a full phone, or the browser closing storage), the error is shown and the edit is not stored. But the old value is already parked: the field drops to its previous older value (or empty), and only Apply on the record brings it back. Nothing is lost, but the screen changes for an edit that was refused.
- **Fix:** park after the append succeeds, or in the same transaction. The `staleOwn` set is already cleared and rebuilt per commit.

### 7. P3, read. The fold-rules guard does not hash round sixty's own fold-shaping code

- **Where:** `fold-rules.test.ts:42-48` hashes the collection's fold methods and the engine's `hold` and `takeBatch`.
- **Not hashed:** `stampPast`, `isOwnStamp`, and the `rebase` park in `commit`. These decide which stamps get parked, so they change what every later fold and snapshot holds.
- **Fix:** add `'private stampPast('`, `'private isOwnStamp('` and `'private async commit('` to the list.

### 8. P3, confirmed. In the sample collection, the banner prints on the label sheet

- **Where:**
  - `DemoBar.svelte` has no print rule;
  - `theme.css:431` and `labels/+page.svelte:365` hide `.install`, `.frostbar`, `.clockbar`, `.vaultnote`, toasts, `.tray` and `.cmppill`, not `.demobar`.
- **Reproduction:** `/tmp/r60rev/triage/pw1.mjs`, part 2. The steps:
  1. On an empty `/plants`, press "Try it with a sample collection".
  2. Open `/labels`, pick all, and emulate print media.
  3. `.demobar` is `display:flex`, 54 px tall at top 12, and the first sheet starts at 66 px.
  4. The PDF is at `/tmp/r60rev/out/shots/triage/sample-labels.pdf`.
- **Why it matters:** this is the same fault class as S6. A visitor trying the sample and printing labels gets the misaligned sheet the self-review called "the moment a hobbyist decides the app is not for real use".
- **Fix:** add `.demobar, .demolock, .backupnudge, .iosfirst, .heldnote` to the global print rule.

### 9. P3, read. The species page links "your plants" by number

- **Where:** `species/[slug]/+page.svelte:360`: `href="/plants/{accNo(a)}"`.
- **What happens:** decision 3 asked for links by id wherever a record is in hand. With a shared number this opens the chooser rather than the plant, so nothing is written to the wrong plant, but it is the one surface the sweep missed.
- **Fix:** `href={plantHref(a)}`.

### 10. P3, confirmed by test. One word, two names: "Sync batch" in the glossary, "sync bundle" on the sync page

- **Where:**
  - `about/how/+page.svelte:96` defines "**Sync batch**: a sealed bundle of changes one device sends".
  - U renamed the unit "sync bundle" on the sync page, in `sync-words.ts:19-21` and in `WaitingRecord.svelte`.
- **Reproduction:** seam test 4.
- **Fix:** rename the glossary entry "Sync bundle".

### 11. P3, measured. The species page is barely shorter: the repetition moved into closed cards

- **Measured** on the served text of `/species/copiapoa-cinerea` (fixture): 2,002 words; "72 mm" ×6, "CHELSA" ×17, "rule" ×10, "NASA POWER" ×10, "How this section is made" ×3. Experience item 2 measured 2,077 words, 9, 21, 13 and 7.
- **What it means:** the first screen is cleaner (closed cards, the season card). A screen reader, a search engine reading the page, and a visitor who opens the cards still meet the same figure many times. "Say each figure once" is not yet true.
- **Fix:** per card, keep the figure and its source tag; move the repeated method sentences into the one per-section disclosure, and say each figure once there.

### 12. P3, read. Three storage keys added this round are missing from `/about/how`'s "every key" list

- **Missing keys:**
  - `cultifolio.persistAfterFirst` (localStorage, `GrowLayer.svelte:16`);
  - `cultifolio.iosFirstHidden` (sessionStorage, `IosFirst.svelte:13`);
  - `cultifolio.backupNudgeHidden` (sessionStorage, `GrowLayer.svelte:17`).
- **Why it matters:** the page says "What the device keeps outside the collection, every key". Rule 4.
- **Reproduction:** seam test 1 (fails, listing exactly these three).
- **Fix:** add them, and make the seam test permanent.

### 13. P3, read. Smaller seams

- **The global upstream cap is blamed on the source.**
  - Past 600 calls a minute (`sync.ts:1101`), `/api/forecast` answers `notAnswered()` (502), and the page says "the forecast could not be reached just now".
  - `forecastRefusal`'s own comment (`client.ts:134-136`) says "a refusal of ours … is said as ours".
  - Neither about page states the cap. (The 600 on `/about/formats` is the per-address limit.)
- **The scanned-label check is unlisted.** The QR fragment's species is checked with `/api/entries` (a hash group). `/about/how`'s request list covers hash groups only "of each species you grow". `/about/formats` says the fragment "is never sent to the server": true of the slug, but its hash group is.
- **Formats' rank-marker list omits "variety",** which `RANK_MARKERS` (`search.ts:68`) skips.
- **The snapshot's checked flag and the −5 min slack** are not on `/about/formats`.
- **"accession number" survives in `README.md:7`;** the app says "plant number" everywhere else.
- **the launch draft hard-codes "1981 to 2024, 44 years".** X removed the fixed period from the sheet in favour of the series' own length.

### 14. P3, read. Leftovers of the merge

- **Two plural helpers:**
  - `src/lib/core/words.ts:4` `plural(n, word, words)`, with no thousands separator, used by five pages;
  - `src/lib/ui/words.ts:7` `plural(n, one, many)`, with an en-US separator, used by `backup/+page.svelte`.
  - Plus dozens of inline `=== 1 ? '' : 's'`.
  - Pick one.
- **Four `readerLat` implementations:**
  - the helper `site.svelte.ts:62`;
  - inline copies at `species/[slug]/+page.svelte:185`, `compare/+page.svelte:26` and `+page.svelte:45`.
  - The front page's copy ignores `data.hemiLat`, and the hemisphere cookie is only sent on `/species` and `/compare`. So the front page's featured season card renders northern months on the server for a southern reader, then flips after hydration.
- **Duplicated photo credit:**
  - `photoCredit` (`ui/ref/head.ts:67`) is used only by `r60x-pages.test.ts`;
  - compare has its own `creditOf` (`compare/+page.svelte:105`). The test guards a helper no page calls.
- **Dead after the In short removal:**
  - `generatedNote` (`core/note.ts:37`) is used only by tests (`r60x-arch`, `note`, `units`). `careLine` is the only `note.ts` export a page uses.
- **The header name `x-photo-removed-at`** is a literal in the engine (`engine.svelte.ts:1003`) while `sync.ts:168` exports `PHOTO_REMOVED_AT_HEADER`, used nowhere.
- **Other exports used by nothing, not even tests:**
  - `getIndexWithCorpus` (`dossiers.ts`);
  - `creationDay` (`sync.ts`);
  - `corpusId` (`ui/index.svelte.ts`);
  - `hlcBefore` (`hlc.ts`);
  - `isAccessionNumber` (`core/accession.ts`);
  - `r2GridSource` and `httpGridSource` (`climate/source.ts`).
  - Some predate round sixty.
- **Stale comments:**
  - `collection.svelte.ts:57`: "the line says to set the clock right and that nothing is lost" (removed this round).
  - :62: "after a load, a catch-up or a rebuild" (now also after a write).
- **Date arithmetic outside `$core/dates`:**
  - `export/ics.ts:30` `addDays`, by UTC;
  - `grow/demo-seed.ts:36` and `Firsts.svelte:13`, by `new Date()` (the raw device clock, not `nowMs()`).
- **No `TODO`, `FIXME` or `console.log` in `src`.** `[AUTHOR]` appears only in the launch draft (two).
- **Debug leftovers in the checkout root:** `dbg-proxy.mjs` (a logging proxy to 4173) and `names.txt` (gitignored). Check that `dbg-proxy.mjs` is not tracked.

---

## 4. The round's account, claim by claim (`docs/REVIEW-ROUND-60.md`)

| Line | Claim | Verdict | Evidence |
|---|---|---|---|
| 3 | Every item the triage kept, plus the experience list | false as stated | Tables 1a to 1g: among kept and experience items, about 20 partial, 2 not done (web push; the front-page link preview, with a reason) and one proposed test not adopted |
| 3 | Four agents in copies, three-way merge; two more adopted tests and wrote e2e | verified (from the reports) | `/tmp/r60/*-report.md` |
| 5 | 770 unit tests in 83 files | **false (767)** | `vitest list`: 767 entries, 83 files |
| 5 | Node 22 and Node 24 | unverifiable | Not run here (brief: no full suite) |
| 5 | svelte-check clean on 730 files | verified | 729 files and 0 errors in my copy, plus `playwright.config.ts`, which I did not copy |
| 5 | 134 e2e (118 + 16), all passing on the last full run | verified | Count by grep; `/tmp/r60/e2e3.log` "134 passed (6.0m)"; no `src` file is newer than that log |
| 5 | Local live check 11 of 11 | verified, with a note | It passed 11 checks against 4173 with `LIVE_CHECK_SKIP=names,forecast,thumbs,weight`: four check groups are skipped locally |
| 5 | FOLD_RULES 5, every device refolds once | verified | `log.ts:43`; snapshot key `rules` (:397) |
| 9 | `stampPast`; tests assert the edit shows and survives reload and the clock being put right | verified | `r60-clock-review.test.ts:74,97,158` |
| 10 | Own changes never parked by own clock; with a confirmed clock an edit parks an own stamp >2 days ahead | verified (code) | `log.ts:199-209`, `collection.svelte.ts:1308` (see findings 1 and 6) |
| 11 | Age between −5 min and a week, in both places | verified | `hlc.ts:48,129,137-139` |
| 12 | Snapshot keyed by confirmation; with the key removed the change stays held | partly verified | Test exists (:236); the mutation was not re-run |
| 13 | Held counts on the plants list, Today, sync page, backup report | verified | `HeldNote`, `sync/+page.svelte:190,320`, `backup/+page.svelte:93-95` (not propagation or places) |
| 14 | Engine hold and batch intake in the hash; C03, C21, C22/23, C27, C41, C46 in `sync-engine.test.ts` | verified | grep |
| 15 | 120 seeds lose nothing; 26 diverge | **verified** | My run: `lost 0, diverged 26` |
| 15 | Without the 3-day-ahead skew, 2 diverge; seed 1008 is "this case" | **false / unsupported** | My run: 1 diverges, and it is 1008 (finding 5) |
| 19 | Links by id; chooser; notice links; `/labels?acc=` ambiguous | verified, one miss | e2e :3422, :3447; species page :360 |
| 20 | Restore yields only to a record born later; mutation-checked | partly verified | code :1404; mutation not re-run |
| 21 | Preview lists both plants; CSV `id` / `record id`; `="…"` for 0012, 3-12, 1E5, 00042; import reads it back | verified | `backup.ts:321,344,359`; `csv.ts:110-112` |
| 25 | "Replaced unseen" follows the base through held or parked texts; tests mutation-checked | partly verified | tests exist; mutations not re-run |
| 31 | Leases lapse after ten minutes; recount committed only if nothing crossed | verified | `counters.ts:322`; S item 2 |
| 32 | Fails closed; 200 and 2,000 at the first stored object; failed first write gives the place back | verified | `sync.ts:744-746,783`; S items 3 and 4 |
| 33 | Hold; R2 version receipts; 409; engine sends the header, retries 503 silently, takes 409 as done | verified | `engine.svelte.ts:1003-1012` |
| 34 | 503 shown in the server's words; device keeps receiving and sends nothing until Retry-After | partly true | Within one tab's life, and for at most an hour (finding 4) |
| 35 | Corpus refusal, expiry, R2 error, 503 never 404, `/api/dossier` no-store; compare says "Could not be read just now" | verified | curl; `compare/+page.svelte:144` (a notice listing the slugs, not a per-column cell) |
| 36 | Markers, hybrid marks, citations skipped; relaxed retry and "Showing results for"; every common name; near pass charged once | verified | curl search with `x-search-relaxed`; e2e :3731; common names need the index rebuild |
| 37 | nosniff, Permissions-Policy, HSTS; noindex on private pages; CSP four hosts; upstream cap; odd addresses | verified | curl of `/`, the species page, `/offline`, `/plants/…`, `/about/how`, `/og.png` |
| 38 | SW update check once per full page load; docs now say so | verified | `+layout.svelte:180`; `/about/how:87` |
| 40 | 11 rewritten, 3 ported, 1 split, 21 reverts each failed | consistent with the T report | count matches (11 / 3 / 1; 19 to 22 mutations listed); not re-run |
| 44 | Archetype table never raises a floor; convention apart; groups out; split family none | verified | `arch-tables.json`, `sheet.ts:211-244` |
| 45 | Words findings fixed across the sheet, climograph, share card, front page, species page, `/about/how`, `/about/formats` | partly true | Most hold; `/about/formats` now carries new false statements (findings 1, 2, 4); `/about/how` misses three keys |
| 45 | Map marker sentence said once | verified | rendered text has one "The map marker:" (the second is in the hydration JSON) |
| 46 | `og.png` unchanged, with the reason | verified | reason in the X report |
| 50 | Desktop feature block; on a phone a link; the search, photographs and first catalogue row on the first screen at 390×844 "(end-to-end test)" | **false as cited** | The e2e (:3731) checks only that the feature is hidden and the link shown. My run at 390×844 on the fixture: search at 541–586 px, the first row's letter heading at 725 px, the tab bar from 787 px, so the first row is cut by the tab bar. With the live strip of several photographs the first row is very likely below the fold |
| 51 | Species page: In short removed, closed cards, one disclosure per section, season card, grower labels, no grey box | verified | served HTML; "How this section is made" ×3 |
| 52 | Private-page list; 320 px with 200% checked by script on ten pages; empty plants page scrolled 58 px until the button wrapped | partly verified | The e2e covers 9 routes (:3540). My script found no sideways scroll on 9 more pages |
| 53 | Grower features list; 16 e2e passed twice | verified | `/tmp/r60/T-run2.log`, `T-run3.log` |
| 54 | "Also today" drawn only when something is under it | verified | e2e :3752 |
| 55 | Two flakes answered; forecast refusal text | verified (text) | `client.ts:141` (the account's quote omits the last sentence, "It is asked again when this page is next opened.") |
| 56 | Tab bar pre-paint from `cultifolio.hasMine`; CSP hash updated | verified | the `app.html` script hashes to `I1wC1…` = CSP; `+layout.svelte:404` |
| 60-63 | Not done: B13, /48, `sheetsIn`, tile credits, corpus harnesses kept as measurements; fuzz and mixed adopted | verified | DEPLOY:96; `r60-corpus-fuzz.test.ts:1,73` |
| 67 | Common names need a rebuild; check the launch draft slugs; settle the price sentence | verified | two `[AUTHOR]` markers remain |

---

## 5. Seams checked (the brief's list)

| Pair | Result |
|---|---|
| Clock rules: `/about/formats` vs `hlc.ts` / `log.ts` / collection | **Mismatch:** finding 1; −5 min slack and checked snapshot key not stated |
| "Held" / "parked" wording | Consistent. `held-words.ts` is used by `HeldNote`, the sync page and the backup report. `Parked.svelte` and the sync page say "a device whose clock was wrong". The glossary defines both |
| Forecast refusal wording | One copy (`client.ts:141`), the e2e expectations match. The cap path is mislabelled (finding 13) |
| "Plant number" vs "Accession number" | App consistent; `README.md:7` says "accession number" |
| Vault ceilings 200 / 2,000 | Consistent across `sync.ts:744-746`, `wrangler.jsonc:11`, `/about/formats` and `DEPLOY.md:64-66`. `/about/how` gives no figures. Formats omits the "20 per /48" creation limit DEPLOY states |
| Sample collection text | `TrySample` ("Twelve plants … leaving deletes it"), `DemoBar`, the front-page button ("try a sample collection") and the `#sample` paragraph on formats agree. `/about/how` names the `cultifolio-demo` database. Two separate buttons with their own markup (`TrySample` and `+page.svelte:671`) |
| Search rules: formats vs `search.ts` | Consistent except "variety" |
| Label QR: formats vs `qr.ts` | Consistent; the hash-group check is unlisted (finding 13) |
| Import: formats vs `paste.ts` / `csv.ts` | Consistent (separators, BOM, `="…"`, year-first dates, next free number) |
| CSP hosts vs `/about/how` hosts | Consistent, four and four (guard test passes) |
| Storage keys: code vs `/about/how` | **Three missing** (finding 12) |
| Counter recount: formats vs `sync.ts` | **Mismatch** (finding 2) |
| 503 backoff: formats vs engine | **Mismatch** (finding 4) |
| Print rules: theme vs new layout-level bars | **Gap** (finding 8) |

---

## 6. Launch readiness: what still blocks a launch, in order

1. **Make the two about pages true again.** Fix findings 1, 2, 4 and 12 and add the seam test to `tests/unit`. A commenter checking "`/about/formats` states every rule" will check the clock rule first, since the post invites it.
2. **Settle the sync price sentence** (the launch draft, both `[AUTHOR: …]`). The reply and the post must say the same thing.
3. **Decide on S12 before launch day.** Either reclaim places, or raise `SYNC_VAULTS_MAX` and write in DEPLOY how to raise it quickly. Launch-day traffic plus one script could otherwise fill the 2,000.
4. **Deploy, then rebuild the index with `commons`** (`npm run dossier -- --index`, upload, DEPLOY §5). Then check on the live index that `ariocarpus-fissuratus` and `haworthia-truncata` exist, since the post's compare link names them.
5. **The common-name display rule.** The page shows GBIF's first English name ("String-Of-Beads Senecio"). Pick a rule with no hand-picked names before readers see the catalogue (for example: prefer a name that is not the genus in title case, then the shortest).
6. **Run the full live check against the real site** with no skips (names, forecast, thumbs, weight were skipped in the local 11 of 11). Confirm that the deployed `wrangler.jsonc` has observability off, and that the R2 spend alert is set.
7. **Phone first screen on the live site.** At 390×844 with real photographs, check that the search and at least one catalogue row are visible. On the fixture the first row is already cut by the tab bar.
8. **Use the app with your own plants and rewrite the post in your own voice.** The post is agent-written and says so. The self-review asked for two weeks of real use first, and the draft's own checklist repeats it. Also replace "1981 to 2024, 44 years" with the figure the index reports.
9. **Small fixes worth making before posting:**
   - the demobar on printed labels (finding 8);
   - "Sync bundle" in the glossary (finding 10);
   - the species page plant-chip link (finding 9);
   - the front page's "it stays on this device".

---

## 7. Checked and sound

- **The clock:**
  - `trustedAge` is applied in both places;
  - FOLD_RULES 5;
  - the snapshot key includes `checked`;
  - nothing is lost across 120 skewed fuzz seeds (re-run).
- **The CSP inline-script hash** matches `app.html`. The `data-grower` pre-paint rule is wired.
- **Headers:**
  - HSTS, nosniff and Permissions-Policy on every route tried;
  - noindex on private pages and `/offline`;
  - `/api/dossier` is `no-store`;
  - maps are cached a day.
- **Search:**
  - rank markers, citations and the relaxed retry all work;
  - the `x-search-relaxed` header is read by `searchCatalogue`;
  - the import's name check never takes a relaxed answer as "found" (it requires an exact name, a synonym or an edit distance of 2).
- **Redirects:** a space, an underscore and capitals in a species address each give a 301 to the slug.
- **Front page:**
  - row meta and pending counts are right ("1 pending" for Welwitschia, "1 not checked" for Refusia);
  - the feature block is in the SSR HTML on desktop.
- **The backup CSV's `="…"` guard and the import reading it back.** The `.ics` two-year horizon matches formats (`DRY_HORIZON_DAYS` 730).
- **No sideways scroll at 320 px with 200% text** on import, labels, plants, Today, both about pages, front, species and compare.
- **The account's e2e, svelte-check and live-check counts.**
- **Every adopted unit test ID** from the 59 reviews is in the tree. The deferrals are written down in DEPLOY and the account.

**Tests written:** `/tmp/r60rev/out/tests/triage--about-seams.test.ts`. It FAILS on current code (4 of 5; the CSP-hosts guard passes). Copy it to `tests/unit/` and run `npx vitest run tests/unit/triage--about-seams.test.ts`.

**Artifacts:**
- `/tmp/r60rev/out/shots/triage/front-390.png`;
- `/tmp/r60rev/out/shots/triage/sample-labels.pdf`;
- the script `/tmp/r60rev/triage/pw1.mjs`;
- the fuzz logs `/tmp/r60rev/triage/fuzz2.log`.
