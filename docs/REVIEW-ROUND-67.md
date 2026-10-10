# Round sixty-seven: the fixes from the reviews of rounds sixty-two to sixty-six

Round sixty-seven acts on three reviews of commit `8f2d56c`:

| Review | Kept as | Findings |
|---|---|---|
| The self-review, by six internal reviewers with the live corpus read locally | `REVIEW-SELF-66.md` | 69 |
| An outside review (R45) | `review-66/outside-r45.md` | 29 |
| An independent review run on Windows with WebKit and Firefox (IND) | `review-66/outside-ind.md` | 9 |

The self-review's six reports are in `review-66/`. `REVIEW-TRIAGE-66.md` merges the three reviews, decides each finding and gives each to one of six agents:

| Agent | Area |
|---|---|
| V | The visitor and the example collection |
| R | Records, the clock, the import and the vault |
| S | The server |
| N | Names, search and the corpus builder |
| P | Pages, words, privacy, the service worker and accessibility |
| H | The harness |

The owner's instruction was to fix everything worth fixing. The six worked in copies of one base, each owning its files. A change one agent needed in another's file was written as a need and applied at the merge. No file was changed by two agents. Their reports are in `review-67/`.

`FOLD_RULES` stays 7 and the device database stays version 4. Section 7 says why the two fold hashes moved.

## 1. What a first visitor meets

- **The example collection no longer takes in a visitor's real plants (V1).**
  - Inside the example, the top bar's "+", a species page's "Add one to my plants" and the add forms lead out of the example first.
  - An add form reached inside it says the record "joins the example collection and is deleted with it" and offers "Keep it as my own", which leaves with what was typed.
  - The bar says "Nothing added here is kept: leaving deletes it."
- **A page's collection is decided once, when it loads (V3, IND's first finding).**
  - **One reading.** `PAGE_IN_DEMO` is read with the page and used by every scope: settings and cookies, the "keep data" question, sync, the hint, the bar, the seed and the restore refusals.
  - **Closing under the page.** When another tab's Leave, or the deletion of the example's database, closes the example under a page, the page goes into a closed state. It refuses writes with a sentence, keeps what was typed on screen to copy, never reopens the database Leave deleted, and lets go of the lock that holds a delete up.
  - **Leaving.** The tab's flag and the example's settings go only when the page really goes.
  - **What this ends.** Two tabs and a Cancel could make a page draw the example while writing as the grower's own (a place made in the example became the grower's "last place"). That can no longer happen.
- **Closing an example tab no longer deletes what the visitor added without a word (V2).** The leftover sweep counts the visitor's records first. A leftover holding some is kept, and offered back once with "Open it" and "Delete it".
- **"Empty" means the grower's whole folded log is empty and no frost site is set (V4).** Before, species notes, a removed plant, a numbering setting or a frost site still counted as empty, so the example opened over them. The bar's own-plants words follow the same test.
- **The example hands out no calendar file and no spreadsheet, and shows no backup state (V7).** Its frost line says the example has no site of its own (V8).
- **On a phone, the welcome's lead says what the site is:** "Grow cacti, succulents or bulbs?" (V9). The first catalogue row stays above the tab bar at 390 × 664, 375 × 548 and 360 × 640. A returning visitor's line is drawn by the server, so the rows do not move (V10).
- **"Keep data" is asked at most once a month, whoever asks (P1).** One gate (`src/lib/ui/keep-ask.ts`) writes the time before the browser is asked. Before, a Firefox grower who let the question stand was asked on every load.
- **Text typed in the first seconds after a deploy is no longer lost to a reload (P2).**
  - A page reloads at once only when nothing has been typed and no write is in flight; otherwise it reloads at the next navigation.
  - A second tab on the old build moves at its next navigation.
  - A worker that does not say its build causes no reload.
  - The worker reads the previous build's cache for an old tab's chunks.
- **The add form no longer moves when the name check answers (P10, the decision left open in round sixty-six).** The picker keeps three lines' room for the check, so Add and "Use my own number" stay where the finger is. This was the cause of a test flake too.

## 2. Records

- **A slow clock set right while the tab was closed no longer hides the plants added offline (R2, R45-14).**
  - Round sixty-two decided that a clock correction does not lapse with time. A device three days slow therefore kept its +3 days after its clock was fixed. The plants it added offline were then parked on every device after the next sync, the writer included.
  - Now a positive correction of more than two days is not in force until a reading confirms it, and until then the device stamps by its own clock. A stamp behind parks nothing.
- **A Replace that runs out of space no longer loses data (R1).**
  - A pending switch refuses writes.
  - The staging copy is never deleted while a switch needs it.
  - A copy that cannot finish leaves the collection open and says why.
  - The backup page says the replacement had begun, and reloads.
- **The import (R3 to R5).**
  - Its key is taken from the fields as read through the column mapping. A whole date is keyed by its year, with day and month in either order. So a sheet saved again by a spreadsheet, or given a column, is not imported twice.
  - A line whose number (without leading zeros) and name match a plant here starts dropped.
  - Unnumbered lines that look already imported are said and kept.
  - Removed plants count.
  - Numbering stops at an unsafe integer, which used to hang the tab.
  - Lines dropped in one pass of a long sheet stay dropped in the next.
  - A line partly added keeps the sheet's pattern.
- **Smaller fixes (R6 to R14).**
  - **R6:** a round-sixty-one backup's parks are read as parks.
  - **R7:** the death Undo is one commit.
  - **R8:** Renumber takes a number past every number the log ever gave, and hides the false note.
  - **R9:** `w` is accepted only within sane bounds.
  - **R10:** a malformed change is skipped and counted, and a refused database is said, not left "opening".
  - **R11:** Move and the two edit forms are guarded against a double press.
  - **R12:** each form settles only its own place picker, the import's picker is settled at "Check names", and a place that cannot be made says why in the picker.
  - **R14:** "1 200 €" is read.
- **The cost of each change (R13), with no format change.**
  - The changes after the snapshot are read with one range read. The example's page loads went from 432 single reads to two.
  - A write that mints a number moves the frontier, so the next write no longer re-reads the log.
  - A snapshot is written after the seed, an import and a merge.
  - The example keeps no outbox.
  - One outbox and one order row per commit (a database version change) waits for a measurement on a real iPhone.
- **The seed is one atomic thing (V5).**
  - The seed's commit writes its seeded mark and its boundary (the arrival number of its last change) in its own transaction.
  - Leave counts what arrived after that.
  - An example whose marks a reload cut off is repaired from the seed's own changes, never seeded twice.
  - Without Web Locks, a failed seed stays retryable.

## 3. The server

- **Workers Logs (S2): already off where it matters.**
  - The self-review's top finding (S-F1) read `observability: enabled` in the sandbox's copy of `wrangler.jsonc`, which is the repository's.
  - The owner's own `wrangler.jsonc`, which every deploy is made from and which is never committed, has had it off. So production kept no request log, and `/about/how` was true of the site.
  - The repository's copy is stale on this line and is left as it is: the owner does not commit that file.
  - A seam test now reads the `wrangler.jsonc` of the checkout it runs in and fails if observability or its invocation logs are on, so a deploy from a checkout with them on stops at the unit tests.
  - Faults are counted by kind in the counter object, kept a week, so the server still knows when something fails.
- **Photographs (S1, S3, S4, S10).**
  - **Unreadable pointer:** an upload that meets one waits, as a removal does, so a token can no longer replace a live photograph through one. GET and HEAD answer 503 there, not 404.
  - **The sweep:** it re-puts the pointer conditionally before it deletes, so a stalled revival cannot point at deleted bytes.
  - **The generation listing** is paged, and the sweep's mark stays until a complete listing is clean.
  - **New photographs' ids** carry 16 random characters after their date, and old ids are still accepted.
- **Limits.**
  - **New vault places (S5):** a network (/24 or /48) may take 10 a day. At half the day's ceiling a record is kept that the operator can read. DEPLOY says what to do about an attack.
  - **Listing cost (S6):** each vault may make 1,200 R2 list calls an hour.
  - **/48 refusals (S9):** the creation limit is worded "this network", and every creation refusal waits until midnight UTC.
  - **Small batches (S9):** log batches of 16 KB or less do not count against the daily upload totals.
- **The adapter's cache (S7).** Requests to the cached reference routes name the build (`v=`), and an answer is cached only under its own build, so a deploy is no longer answered from the old build's cache for a day. `/about/how` lists every copy Cloudflare keeps.
- **Refusals said as refusals (S8).**
  - MET Norway's and GBIF's 429 and 403 are "refused this site's request".
  - The NWS's refusal and its silence are worded apart.
  - A build-time timeout is not recorded as a refusal.
  - On the client, the sheets and entries readers carry the kind, the reason and Retry-After, so Today, the plant page and Labels say a refusal as one. "Check again" waits out the Retry-After.

## 4. Names and search

Measured against the live corpus (`2dc42914f6c3f6f3`), read locally.

- **Every older name of species rank is searched (N1).**
  - That is 15,791 more, across 2,125 species; the entry still shows six.
  - "Ferocactus glaucescens" is Bisnaga glaucescens, and "Neolloydia conoidea" is Cochemiea conoidea.
  - The index grows about 8%.
- **A common-name query is read whole against each common name before anything else (N2).** "snake plant" is no longer the words of two names. Queries putting such a pooled match first: 203 before, 0 now.
- **Search order (N8).**
  - Within a reading, a name that is exactly the query comes first, then whole words, then the alphabet.
  - A species' own headline typed as written now lists another species first in 11 of 4,082 cases, against 526; all 11 are two species sharing that name.
  - Typing errors put the right species first in 5,852 of 5,854.
- **Headlines (N3, N5 to N7).**
  - **The rule.** The name more sources give comes first, and GBIF's "preferred" (one dataset's flag) only breaks a tie. A single generic noun and a species' own binomial are set back.
  - **Spellings pool** across apostrophes, accents, a trailing full stop and compounds written open or closed. Capitals are read across hyphenations.
  - **At the merge, one more rule:** a compound written open is shown before its closed form wherever a source writes it open. One checklist's closed forms ("Zebraplant", "Lawndaisy", "Camphortree") had outcounted the open ones through the lists that copy it.
  - **Not adopted (N6):** counting small words as lower case. It made 16 names worse on the corpus.
  - **What changes:** 490 headlines and the names under 839 titles. The list is in `review-67/headlines.txt` and is read before the upload. Some trade one good name for another ("Crown-of-thorns" becomes "Christ plant" by count).
- **The corpus builder (N4).**
  - The offline rebuild writes "not asked", never "refused".
  - It carries a previous build's photographs and distribution when it does not ask.
  - It fails when a species drops to no photographs or turns refused.
  - `--keys <file>` rebuilds a list of species online. 156 species need it (120 left with no photographs, 44 with a refusal never received, 8 in both), from rebuilds of late September; the corpus from before round sixty-three had the same faults.
- **Rain words (N11).** Every sentence giving the median year's total says "in the median year". `/about/how` now says Ceropegia is taken whole, with the stapeliads and Brachystelma under it (N12). Tile credits keep the licence at 200% text (N13).
- **N10 (the sitemap fingerprint) was kept as it was.** The flip the review saw came from the offline rebuild's statuses, which N4 fixes at their source.

## 5. Pages, privacy and accessibility (P)

- **Hover preloading is off on private pages, everywhere (P3).** The compare tray had sent the compared species on hover.
- **The about pages, corrected (P4):**
  - Natural Earth and Wikidata are added as sources;
  - SvelteKit's two session keys and the browser's day-long cache of searches are named;
  - the labels key, the worker's second request, the reload rule and every behaviour this round changed are updated.
- **The seam tests** now check whole sentences, cookies, framework keys, preload and the reload rule.
- **Smaller fixes:**
  - **P5:** the missing spaces ("Use my locationor") and a doubled full stop, and the genus summary's refusal words.
  - **P6:** Today's headings read with a separator; chip names match their text; the menu has `aria-current` and 44 px items; the add form's bar sits static on a short screen; italic names are not clipped.
  - **P7:** a species page's photo strip keeps its squares when photographs fail, and no credit sits over a failed photograph.
  - **P8:** the picker drops an answer for the previous name after "Add another".
  - **P9:** Labels restores its picks on a back-forward load too.

## 6. The harness (H)

- **H1, request budgets in Chromium.** The seed stays at 1,400 requests or fewer. One Water costs 20 or fewer on a fresh page, and 60 or fewer right after an import of 100. A load with under 50 changes since its snapshot costs 40 or fewer, and the example's second page load 60 or fewer. A request-count regression now fails whatever the engine's pace.
- **H2, offline in WebKit.** It runs through a proxy the test can cut. The unfounded "checked by hand on an iPhone" message is gone, and DEPLOY's manual checks gain the airplane-mode step.
- **H3, portable forms of the Chromium-only tests:** the accessibility tree, paper in the dark theme, 200% text across 14 pages, and layout shift read from positions per frame.
- **H4.** A test for each of the seven reverts that stayed green.
- **H5.** A single-click check on every disclosure, and the helper records any second press.
- **H6.** The bundle gate bans by module path.
- **H7.** No spec writes the database by hand. A line marked `raw-ok:` may remove a meta mark to stand in for an older build's state.
- **H8.** The fold guard's parks hash.
- **H9.** The server specs use per-run addresses.
- **H10.** A plain `npx playwright test` fails a retry-only pass.

## 7. Found at the merge

- **The fold guard.**
  - The source hash moved, as it does each round: the clock in force, the malformed change skipped, the seed's meta, the range read, the pending-switch refusal, `w`'s bounds and the closed example.
  - The new parks hash moved for R6 alone. A round-sixty-one file's parks are now read as parks, and the `before` and `after` outcomes are as recorded.
  - Both are re-recorded under 7.
- **A chip's hidden ", " widened the front page to 818 px at 320.** P made the chips' names match their text with a visually hidden ", ". That span was positioned against the page, and Svelte trimmed its space, so a chip read "All , 3". It is now an inline separator of no size (`.sep0`).
- **Leave's mark could be lost one run in six (r62g 8), and a confirmed Leave was then offered back as a leftover.** V6 had stopped the address `?left=sample` marking a delete, to protect an example open in another tab from a copied link. The address now marks it again, but only in a tab Leave itself marked as out. The delete still waits for every tab holding the example to let go.
- **Smaller fixes:**
  - two of P's tests read the example flag the old way;
  - a test of V's needed the `@chromium` tag;
  - a words test followed N11.

## 8. Runs

All runs were in the sandbox on the merged tree.

- **svelte-check:** 994 files, 0 errors.
- **Unit tests:** 2,300 passed and 1 skipped, on 270 files.
- **The first strict browser run** (Chromium and the Chromium phone, two workers, no retries) was taken before the merge fixes in section 7.
  - 415 tests: 403 passed, 7 failed and 5 skipped.
  - The seven were the chip width (five tests, two of them because the wide page put the rows over the tab bar), the chip names (one) and the Leave mark (one, r62g 8).
- **The second strict run:** 409 passed, 1 failed and 5 skipped.
  - The failure was H's offline 3. It opened an empty Places, which opens the example by a full load, and that load raced the test's next step under load.
  - It now starts on My plants. Its spec then passed 4 of 4, and 18 of 18 repeated before the change.
  - r62g 8 passed 10 of 10 repeated.
- **The five tests H wrote ahead of other agents' work** (three budgets, places 7, disclosure 4) pass on the merge.
- **Not run here:** WebKit and Firefox.
