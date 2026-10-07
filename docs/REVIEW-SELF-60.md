# Self-review of `21257b7`: round sixty

Nine reviews ran in parallel on 2026-10-05 against a written brief. Each worked in its own copy or against one shared local server, and every reproduction test they wrote was run again in a clean copy (193 tests: 109 guards pass, 82 reproductions fail as written). The serious findings were then checked by hand. The full reports are in `docs/review-60/`, and their tests in `docs/review-60/tests/`. Two outside reviews arrived while this one ran; how they compare is in the last section.

| Review | Covered |
|---|---|
| Clock | The four clock decisions, rule 5, notes. 16 tests. The convergence fuzz instrumented to classify all 26 diverged seeds, then to press Apply on every peer. 14 mutations. |
| Records | Shared numbers on every surface, restore, the CSV both ways (LibreOffice run), the import under attack, the sample's isolation across four tabs, the label code. 74 tests. |
| Server | Every round-sixty server change. 18 mutations, about 45 routes by curl, Chromium's real sync headers. 30 tests and a prototype fix. |
| Corpus | 13,200 grower-shaped queries over five seeds (0 mismatches between the two search paths), 32 real names, the picker in a browser, a refusal walk of twelve routes, the front-page feature's cost. |
| Harness | 129 mutations of round sixty's fixes (99 caught), 12 UI mutations, the unit suite on Node 22 in Auckland time and Node 24 in Los Angeles time (770 of 770 each), clock-shifted runs, the e2e suite (127 of 134 under load; causes below). |
| Visitor and words | 16 public addresses at two widths in four theme modes (128 shots), every sentence template on 27 synthetic dossiers in both units and hemispheres, both about pages, the README and the launch post against the code. |
| Grower | A 300-row real-looking spreadsheet imported, a season of use, two phones on sync, label PDFs measured at 300 dpi with the QR codes decoded, the calendar file expanded. |
| Accessibility and performance | 242 axe runs, a keyboard walk of every new control, 320 px at 200% and 400% zoom on 65 states, forced colours, throttled loads at 300 and 3,000 plants, bytes per route. |
| Triage | All 196 items of `REVIEW-TRIAGE-59.md` and the self-review's lists, each with a verdict and evidence; the round's own account sentence by sentence; seams between the agents' work; merge leftovers. |

**Limits.** As before, the local build serves the four-species fixture, photographs from outside hosts do not load, and the live site is not reachable from the sandbox; the second outside review queried it and supplies the live figures used below. The machine ran at a load of 11 to 48 on 2 CPUs for most of the review, so timings are compared within a run, never across rounds. "Confirmed" means reproduced; "read" means found in the code.

**Withdrawn or corrected on checking.**
- The triage review said the account's "770 unit tests" was false, counting 767 with `vitest list`. The deploy you ran printed 770 passed: `vitest list` undercounts. Withdrawn.
- The server review called the recount's second try "sound: at most two listings". It is bounded, but the second listing is committed without its generation check, so a landing that crosses it is overwritten. The second outside review is right (B11 below).
- The round's account said the one divergent fuzz seed it traced (1008) was "a plant made 30 hours fast", parked by its arrival. Two reviews traced it: it is a correction that outlived the clock change it corrected (finding 21). The account was wrong about the cause.

**The headline.** The round fixed most of what it set out to fix: 137 of 196 triage items are done as decided, both search paths agree on 13,200 queries, every refused route answers 503, the tab bar no longer flips, and axe is clean apart from the new UI. But the round added a great deal of new surface in one pass, and the new surface is where the problems are:

- An edit form open on one plant follows the app's own links to another plant, and Save writes it there.
- "String of Pearls" typed in title case answers String of hearts first, on the round's own example of what the search now does (confirmed on the live site).
- The new grower labels ("Coldest nights in the wild", "Warmest days in the wild") say more than their figures, next to a chart that prints the figure contradicting them.
- `/about/formats` now states three rules the code breaks, one of them the clock rule this round changed.
- The sample collection changes the real collection's units and frost site.
- The import loses data quietly: unmapped columns, quantities, most dates, and "cf." in names.
- "An edit always wins" holds for one stale stamp per field, not two, and the device that was fast still freezes a field against everyone else (decision 1 was implemented only on the writer's side).

---

## P0: before launch

1. **An open edit form or notes draft follows a link to another record, and Save writes it there.** SvelteKit keeps the page component when only the route parameter changes, so `editing`, the form fields and the notes draft survive a move from one plant to another. The leave guard says "What you typed here will be lost", then leaves the form open on the new record. Confirmed on plants (the round's own shared-number link wrote one plant's price and field number into the other, with a false "Renamed" log line), notes (Back carried a draft onto another plant) and places (a place edit renamed the bench inside it). Batches have the same code. Records review 1; fix `{#key id}` around each record page.
2. **Title-case common names lose their last words.** `search.ts:102` reads a capitalised word after "of", "the" or "and" as the start of an author citation. "String of Pearls" is searched as "String of" and answers Ceropegia woodii first; "string of pearls" answers Curio rowleyanus alone. "Mother of Thousands" answers three species. Confirmed in the corpus review and on the live site by outside review B (B2). Fix: treat a word as an epithet only at four letters or more.
3. **The grower labels overclaim, beside the figure that contradicts them.** "Coldest nights in the wild 6.5 °C" is the 1st-percentile night at one NASA POWER cell; the chart beside it prints "4.0° lowest night". "Warmest days in the wild 22 °C" is the warmest month's mean day; the chart prints a 29.0° 99th-percentile day. On the front page, the species page, compare and the share card. `/about/how` says the labels are "names for what each figure is". Visitor 1, B15.
4. **`/about/formats` states three rules the code breaks** (rule 4):
   - "This device never parks its own changes by its own clock … only ever held". An edit under a confirmed clock parks this device's stale stamp, and own changes are never held.
   - "A listing of the vault puts its total right on every open". Since round sixty it is at most hourly.
   - "A device given that answer … sends nothing more until the Retry-After has passed". The refusal lives in one tab's memory and is capped at an hour.
   Triage 1, 2, 4; B14 for the second.
5. **The sample collection changes the real collection's settings.** Units, the frost site and the hemisphere cookie are device-wide (localStorage and cookies), and Settings stays open in the sample. Confirmed by the grower review (units changed to °F) and by B1 (a frost site saved in the sample replaced the real one). The demo bar says "Nothing here is yours or saved with your plants". Records 17 adds that these settings then travel in the grower's next backup.
6. **On a phone, every species page's hero photograph hides its credit and licence.** The name card's -30 px margin covers the credit completely (`theme.css:190, 358`). Measured with `elementFromPoint` at three points. Rule 1, on the first thing a phone visitor sees. Visitor 2.

## P1: the first weeks

**Clock (decision 1 is half implemented).**
7. **A field written twice while the clock was fast takes back the older text** after the first edit on a confirmed clock. The rebase parks only the field's newest stale stamp; the older one of the device's own wins. Clock 1.
8. **Removing a plant made while fast strips one of its fields instead.** For a removal, `prev` is the record's latest edit to any field, so that other field is parked and the plant stays, without its number, offering "Apply" for it. Clock 2.
9. **The formerly fast device freezes the field against every other device** for as long as its clock was wrong. Five rounds of edits from a correct device showed on that device not once. Apply on the peers converges them only until the next edit. Clock 3 and B7, independently. The triage decided "this device's own stamps are parked only by arrival judgement"; the writer never learned its arrivals, so only the peers apply that rule.
10. **Apply on a parked restore writes nothing and dismisses the notice.** The plant stays removed on the peers and shown on the writer for good. The only one of 26 diverged fuzz seeds that does not converge after every Apply. Clock 4.

**The import (new this round).**
11. **It is too slow for a real collection.** 300 rows took 62 s to add; the page's own cap of 2,000 ran at about 3 s a plant. `planNumbers` is quadratic and the plan is re-derived after every row's commit. Records 16.
12. **It drops data without saying so.** Unmapped columns ("Locality", the most valuable field on a field-numbered plant) vanish; "Qty 3" becomes one plant; separate Genus and Species columns name every plant by its epithet; "(white flower)" is cut from names while the review still shows it. Grower 3.
13. **Most dates are thrown away, and their text is kept nowhere.** Only year-first dates are read, so "2009", "August 2017" and "17.11.2007" are refused along with the ambiguous ones. About 250 of 300 rows lost the date; plants without their own number were then numbered for this year. Grower 4.
14. **"cf.", "aff." and "sp." are silently removed from names,** in the import and in the add form. "Mammillaria cf. bombycina" becomes a firm M. bombycina on the label and in what its QR code tells a stranger. Grower 5.
15. **An interrupted import is half done and a second run duplicates what got in.** No guard against leaving while adding; the second review offers to file those plants again under new numbers. Grower 6. Related: a failure while making places escapes uncaught and the page still says nothing was added (records 8, B4); an unbalanced quote swallows the rest of the sheet (records 9); a place named "Shelf >1 m" splits into two places (records 7, B5); notes lose their leading and trailing whitespace (records 6, B6).

**Labels.**
16. **The labels page forgets the sheet and options on every visit.** The saving effect writes the defaults before `onMount` reads the stored choice. Grower 1.
17. **Every label sheet prints at about 98%,** because the body's 16 px side padding is not zeroed in print and the browser shrinks the page to fit. On Avery 5167 the bottom row prints onto the row above. Predates this round. Grower 2.
18. **One emoji at the 60th character of a printed name removes every QR code from the sheet,** silently. Records 3.
19. **Your own removed plant's label says it is from someone else's collection,** with no Restore; and once another plant holds its number, it cannot be restored at all after the 8-second Undo. Records 2.

**The rest.**
20. **A photograph whose upload lands after its removal is never removed from the server.** The new "newer upload" rule compares R2's upload time with the removal time, and a phone sends its batches before its photographs, so a late first upload looks like a revival. The engine takes the 409 as final. Breaks "a photograph you remove is removed from the server too". Server 1 and B9, independently; the S agent had asked for the engine half, and the merge did the opposite.
21. **The unit suite fails from 1 January 2027, and `npm run deploy` runs it first.** `collection-store.test.ts:549` dates a plant 2026 and expects this year's number. The e2e suites hard-code 2026 in about 15 places. Harness 1 and 2.
22. **A toast with an action traps Tab** when it was raised with focus on the page: `onKey` swallows Tab with nowhere to send it, and focus holds the toast's timer. The storage-persistence toast does this on the first load with a plant. WCAG 2.1.2. A11y 1.
23. **A refused or pending climate is told "No habitat figure is on file"** on every epiphyte, orchid, tropical or fern species with an archetype convention (`sheet.ts:248, 370`). Rule 2. Visitor 4.
24. **The chart never names CHELSA where a reader can see it,** only in the SVG's `<desc>`. On the front page's feature, two lines under "Every figure names its source", there is no disclosure to open. Visitor 3.
25. **Bulk Archive has no Undo,** though the round's account says every select action has one. Grower 8, a11y 9, B3.

## P2: worth fixing

**Clock and rule 5.**
- The rebase parks before the edit is stored, in its own transaction; a refused edit still parks the old value (clock 5, B8). The rebase also offers the grower's own replaced text back as "an edit from a device whose clock was wrong" (clock 6).
- A stored correction outlives the clock change it corrected: a slow clock set right by hand stays "confirmed" with a correction days off, and stamps and dates its edits ahead until the next sync reading (clock 7). This is fuzz seed 1008.
- Still open from 59: a load stores the parked set, which cannot be dropped without changing what the collection shows (clock 8).

**Server.**
- The recount's second listing is committed with no generation check, so a landing that crosses it is overwritten (B11; `sync.ts:438`, and the same in `take`'s retry at `:537`). Confirmed by reading.
- A photo hold lapses at 60 s while the old holder's R2 delete can still complete, removing a replacement stored meanwhile (B10; reproduced at function level with a stalled R2 call; frequency not measured).
- One host can spend the site's whole minute of outside calls in a second (420 calls per ten minutes per address), and every other visitor is then told the source "did not answer" (rule 2). The cap is also counted per isolate (two isolates pass 1,200), and a US forecast spends one unit for two calls (server 4, B13).
- `unadmit` can give a vault's place back while another first upload is landing; a Worker killed after admission keeps a place for an empty vault; the KV fallback counts a vault twice (server 5 to 7, B12).
- Vault places are never reclaimed once a vault stores anything, so ten days of cheap first uploads still close sync for good; the account presented this as solved (triage 3).
- The 503 refusal lives in one tab's memory and is capped at an hour (triage 4).
- An expired lease leaves its bytes counted until a recount, up to an hour later (B14).
- The removal's proof is checked after the "newer" test, so the 409/403 split reveals a photo's upload time; the bearer token alone can veto a removal by re-uploading identical bytes (server 2, 3).

**Search and the corpus.**
- A hybrid formula ("Aloe vera x Gasteria") is answered as one parent, unlabelled; a quoted cultivar ("Echeveria 'Lola'") picks a species by spelling and the retry never fires; a lowercase author ("orbea humilis l.") answers another species (corpus 2 to 4).
- The add form's picker offers a retried species as a match, and picking it replaces the variety the grower typed (corpus 5, confirmed in a browser).
- The common name shown is GBIF's first English name, unnormalised ("String-Of-Beads Senecio"). On the live index, 4,075 of 8,947 entries show a common name and 583 of those contain a genus name (B, measured); the species page reads a different list from the tile (corpus 9).
- Every genus row page carries the day's featured species ahead of its own content (about 1,300 sitemap addresses), and phones download the hidden block (corpus 10).

**Words and credibility.**
- Ties in temperature still name one month on every surface, though the round says ties were fixed; the share card never says which hemisphere its months belong to (visitor 5, 6).
- The label line prints the convention minimum as a bare "group min 10 °C" (visitor 7).
- `/about/how`'s "every key" misses three keys the grower features added; `/about/formats` and `/about/how` disagree on how imported names are checked; the glossary says "Sync batch" where the sync page says "sync bundle" (visitor 8, 12; triage 10, 12; B16).
- On a desktop the first screen has no search box and no photographs at any size: the feature fills it (visitor 9).
- The launch post: title 1's "8,900 cacti and succulents", "rebuilt from the sources in about an hour", "the record low printed beside it", two `[AUTHOR]` markers (visitor 10).
- "Nothing on a species page is written by a person or by AI" drops the exception for quotations on the front page, and the templates were written once by the author and Claude (visitor 11).
- A page with a climate but no extremes is still titled "… cold nights" (visitor 13).

**Records.**
- The CSV's `="…"` form misses `2026-01`, `2024-03`, `3-12-2024` and 12-to-15-digit runs, and LibreOffice's default import shows the form literally (records 5, LibreOffice run).
- Still by number while shared: the species page's "your plants" chips, Enter in the front-page search, `/propagation/new?parent=` (records 4, triage 9).
- Select by search ticked 168 plants on five benches for "bench 2"; the sync page lists a held record as "photo pmwh0iune… (acc, sowing, d, …)"; Today's photo count and its chip disagree (33 against 297); "Spent this year" never totals mixed price styles; a stranger scanning a label sees the internal id as the heading (grower 7, 9, 11 to 13).

**Interface.**
- "Also today" hides First flowers and the calendar whenever Today shows no line: a second CSS rule (`today/+page.svelte:369`) the lead added on top of the right one (harness 3).
- Focus drops to `<body>` after select mode's actions, import's Check and Add, the menu's Download, Wanted Save and Today's "Water N here" (a11y 2; the last still open from 59).
- The layout imports the grow barrel, so every page, public ones included, ships about 30 KB gzip of grower code and 8 KB of CSS it never draws. JS on `/` went from 129 to 181 KB (a11y 3).
- The sample's bar shifts every page it is shown on (CLS 0.17 to 0.54) and the sample sets itself out one plant at a time; Today shifts 0.25 while it opens (a11y 4, 5).
- Forced colours: the current tab is about 1.5:1, and the toast has no edge. At 320 px with 200% text four new views scroll sideways, including the refusal pills on a refused species. At 400% zoom the select bar and toast cover 213 of 256 px. Move defaults to "no place" (a11y 6 to 9).
- The sample's locked Sync and Backup pages have no visible h1 (a11y 10). The sample banner prints on label sheets (triage 8).

**Harness.**
- Five survivors around the 503 refusal (the cap, the expiry, receiving while refused, a photo 503), three in the import's commit (which no unit test imports), three in the search's Worker cache (whose test passes with the cache never read), and nine more; 13 test files written that catch them (harness 4 to 15).
- The persistence toast is lost on a slow device: shown on the add form, hidden by the navigation, and a flag stops it ever showing again. This is why "r60 14" failed in 3 of 4 runs under load (harness 18).

## P3

About 60 smaller items across the reports, among them:
- Clock: the held notice counts a held change already overridden; the engine's clock listener is still unhashed and untested.
- Records: restore's "born after" compares unrelated clocks; select mode's move Undo removes a line it should keep; bidi controls in a label's name; the sample's leftover database when a tab closes without Leave.
- Server: DO sweep unpaged under abuse; `/benches` redirects without security headers.
- Corpus: hyphenated epithets cut in "Showing results for"; `searchCatalogue` cuts an emoji in half; the sitemap's lastmod.
- Words: "undated", "The 1 nearest", refusal sentences missing their article, a southern visitor's front page in northern months.
- Accessibility: label-in-name, live regions created with their text, contrast on import examples, Today at 3,000 plants (18,200 nodes).
- Calendar: no VALARM, no series restart after a dry run, an all-dry place.
- Harness: tests whose names claim more than they assert; timeouts under load; a hard-coded port.
- Merge leftovers: two plural helpers, four readerLat copies, dead `generatedNote` and `photoCredit`, an unused exported header constant, stale comments.

## Checked and sound

- **Search.** Postings equal the whole index with the retry on 13,200 grower-shaped queries (corpus) and 6,000 respellings (A, round 59). The search cache key cannot be poisoned; the import never mistakes a retried hit for a match.
- **Refusals.** Under a refused corpus and under R2 errors, twelve routes answer 503, never the fixture or "not found". Refusia says "not checked" everywhere; Welwitschia says "pending".
- **Clock.** A far-future stamp never moves another device's clock; one stale stamp per field is handled; the negative-age check and the snapshot key fail their tests when reverted; all 26 skewed divergences are the writer-and-peers case (now a P1, item 9), 25 of them converge after Apply.
- **Server.** The lease and hold are taken after the body is read, so a slow phone holds neither during transfer; no address is kept past 48 hours; the origin rule handles every real browser case tried, Safari 15 included; the species 301 cannot loop or point off-site; headers on every route and status.
- **Records.** The chooser, labels with a shared number, list links, Undo of a removal after navigating, the id column; the label fragment never reaches the server; the sample's database and channel are separate, and nothing of its log reaches the grower's.
- **Accessibility and performance.** The tab bar no longer flips; the footer hold (CLS 0.02 or less on most private pages, was 0.29); reduced motion; memory flat over 120 navigations; the "···" menu is a real menu.
- **The calendar file** is valid RFC 5545 and expands exactly as intended (grower, with `recurring_ical_events`; B).
- **Suites.** 770 of 770 on Node 22 and 24 in two time zones; the round-sixty e2e tests passed 4 of 4 apart from the persistence-toast race.

## Experience and adoption

The grower review's ranked suggestions, which the other reviews support:

1. **Make import lossless** (small): unmapped columns into notes by default and listed before "Check names"; Qty and Genus+Species; keep the unread date text; keep "(…)" and cf./aff./sp.
2. **Fix label printing** (tiny): body padding in print and the remembered sheet.
3. **One date choice per sheet, and unambiguous dates read** (small): ends 250 manual edits for every UK, EU and Australian grower.
4. **"Show only rows that need me" and "skip rows already imported"** in the import's review (small).
5. **A place filter on My plants and "Select these" on a place page** (small): benches are how growers work.
6. **Last watered for the whole import** (tiny): Today then works from day one.
7. **Per-currency spending** (tiny).
8. **Plain words on the sync page's held and parked items** (small).
9. **VALARM in the calendar file and a series restart after each dry run** (small).

And the visitor review's, for the first minute:

1. **On a desktop, search and photographs first,** the feature beside or under them, kept to one screen.
2. **One headline that is the product:** "How cold, wet and bright it is where 8,947 cacti, succulents and bulbs grow wild, every number with its source."
3. **True labels:** "Cold floor, 1 night in 100" with the record low beside it.
4. **Say the AI part precisely and first:** templates written once, filled with sourced figures, no text generated per species, code written with AI agents under review.
5. **On a phone, the four figure cards as a 2×2 block** under the pitch rather than only a link.

---

## The two outside reviews

**Review A is round fifty-nine's** ("Review, round forty-two: 741180f"). It was triaged as "A" in `REVIEW-TRIAGE-59.md` and round sixty worked through it. The triage review checked each of its items at `21257b7`: almost all are done; still partial are A23 (the formats page, now with new contradictions, P0 item 4), A31 (the guard still misses the edit-time park), A17 (the unchecked clock is shown only through the clock line) and A7/S13 (a Commons original is still loaded when the dossier has no thumb).

**Review B is new** (21257b7, Windows and Chrome, 770 unit tests on Node 22 and 24 and 134 e2e passed, live queries). Its sixteen findings against this review:

| B | This review | Note |
|---|---|---|
| 1 sample changes the real frost site | grower 14, records 17 | P0 item 5 |
| 2 title case in common names | corpus 1 | P0 item 2; confirmed live |
| 3 Archive has no Undo | grower 8, a11y 9 | P1 item 25 |
| 4 import prelude failure | records 8 | P1 item 15 |
| 5 place name with the separator | records 7 | P1 item 15 |
| 6 notes trimmed | records 6 | P1 item 15 |
| 7 Apply does not restore convergence | clock 3 | P1 item 9 |
| 8 failed edit already parked | clock 5 | P2 |
| 9 delayed upload taken for an Undo | server 1 | P1 item 20 |
| 10 hold expiry lets an old DELETE erase a replacement | new | P2 |
| 11 the recount's retry drops the guard | new; the server review called it sound | P2 |
| 12 refund while another first upload is landing | server 5 | P2 |
| 13 the cap per isolate; a forecast spends one unit for two calls | server 4; the forecast part is new | P2 |
| 14 an expired lease keeps its headroom up to an hour | new; the server review called the over-count bounded | P2 |
| 15 the labels suggest stronger extremes | visitor 1 | P0 item 3 |
| 16 storage keys missing | visitor 8, triage 12 | P2 |

B found nothing this review missed in the data layer, and this review found much that B did not look at (the edit form carried across records, the import's losses, label printing, the year bomb, the keyboard trap, the bundle, the photo credit, the formats page). B adds four server findings, three of them about the round's own new mechanisms (holds, the recount retry, lease expiry), and live measurements of the common names. Its triage table agrees with the triage review's.
