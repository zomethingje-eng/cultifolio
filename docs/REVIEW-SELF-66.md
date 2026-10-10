# Self-review, rounds sixty-two to sixty-six

This review covers commit `8f2d56c` (Worker `2d82b9bb`, corpus `2dc42914f6c3f6f3`). It was written to the round's review brief. Six reviewers each read one area in a copy of the repository:

| Reviewer | Area |
|---|---|
| A | The example collection and the phone |
| B | Names, search, climate and the corpus |
| C | Records, the clock, backups and the import |
| D | The server |
| E | Safari's engine, Firefox and the harness |
| F | The claims against the code, the about pages, the five rules and the first visit |

Every finding below names its reviewer and number (A1, B4 and so on). Each reviewer's full report, with its reproductions, is in `review-66/self-<letter>.md`. I re-checked the headline findings myself (section 7).

**What this review could not do.**
- It could not reach cultifolio.com: the sandbox and the PC's shell are both refused by their proxies. The live corpus was copied from the PC and read locally instead.
- WebKit and Firefox are not installed here. Their behaviour was emulated in Chromium with init scripts.
- No real iPhone was used. Every Safari timing below is an estimate.
- The review copies had a stray `node_modules` link that broke `playwright test`. That was the copies, not the project; most browser probes ran as plain Playwright scripts.

**Summary.**
- **69 findings:** 11 from A, 13 from B, 6 from C, 10 from D, 15 from E and 14 from F. About 60 remain once the overlaps are merged.
- **Nine should be fixed before the site is shown to the public** (section 1).
- **One is a false privacy claim.** The site logs every request's URL, which `/about/how` denies.
- **Two are corpus faults that predate these rounds:** 120 species with no photographs, and 44 pages stating a refusal that never happened. Both need the corpus rebuilt online for those species. The backup of the corpus from before round 63 does not hold the lost data either (section 7).

## 1. Before the launch

1. **The server logs every URL, and `/about/how` says it does not** (F1). *Corrected in round sixty-seven:* this was read from the repository's copy of `wrangler.jsonc`. The owner's deploy config, never committed, has observability off, so production kept no such log.
   - `wrangler.jsonc` has `"observability": { "enabled": true }`. Workers Logs therefore keeps every request's URL and query: search text, the grower's rounded forecast site, vault ids and `/plants/<number>`.
   - `/about/how` says "The server does not log paths", and that rate counters are the only thing kept about a visitor.
   - Rounds 28 and 29 noted this and meant to turn it off.
   - **Fix:** turn invocation logs off, and add a seam test that reads `wrangler.jsonc`.
2. **The example collection takes in a visitor's real first plants** (A1).
   - Once Today has opened the example, the whole tab is in it until Leave. That includes "Add one to my plants" on a species page, the "+" and the add form, which is headed "My plants · Add a plant".
   - Over that form the bar says "Your own starts when you add a plant."
   - The plant goes into the example and is deleted with it. Leave asks first, but nothing offers to keep it.
   - **Fix:** inside the example, an add form says where the record goes, and offers to leave with what was typed (the form already reads `species` and `key` from its address).
3. **"Empty" ignores a frost site, species notes, a removed plant and a numbering scheme** (A2, confirmed by reading).
   - A visitor who set their site for the frost watch lands in the example on Today in every new tab.
   - The example's frost line then says "No site set".
   - **Fix:** `ownEmpty` reads the whole folded state (`collection.state.size`) and the frost site.
4. **A label name past a species' sixth older name finds nothing, or the wrong species** (B1).
   - The index keeps six older names per species. 13,352 older two-word names in the dossiers do not find their species, 4,230 of them in the succulent families.
   - "Ferocactus glaucescens" answers "Nothing in the reference matches", which states an absence (rule 2).
   - "Neolloydia conoidea" answers Cochemiea matehualensis, the wrong species, with no label saying so.
   - The import files such names as "not in the reference".
   - **Fix:** put every species-rank older name in the postings, even where the entry shows six.
5. **Common-name search pools words from different names and from places, and the documented whole-name reading does not run** (B2).
   - "snake plant" puts Yarrow first, "cape aloe" puts Candelabra aloe first, and "natal plum" puts Plumbago first.
   - 203 of 3,697 headlines, typed as written, put such a pooled match first.
   - `/about/how` says a query is read "first as a whole, against the common names". The code does that only when the botanical reading dropped a word.
   - **Fix:** always try one common name holding every word first.
6. **One dataset's "preferred" flag picks headlines over names many more sources give** (B3).
   - It decides 281 headlines. Examples: Malpighia emarginata "Cherry", Allamanda "Buttercup", Plumbago auriculata "Quaker" and Cosmos sulphureus "Poppy".
   - Echinocereus pectinatus is headed by a Spanish name mistagged as English.
   - These show on tiles, titles and link previews. The rule on `/about/how` is the one at fault.
   - Owner's decision, D2.
7. **A bearer token can replace a live photograph when its pointer fails to read once** (D1).
   - `runPhoto` treats an unreadable pointer as "removed, no proof", where the removal already waits.
   - A one-line fix: `if (ref.unreadable) throw new PhotoBusy(…)`.
   - GET and HEAD then answer 503, not 404.
8. **A Replace from a backup that runs out of space partway loses data** (C1).
   - The tab keeps showing a collection that exists only in its memory. Everything done next is wiped at the next load.
   - A second Replace deletes the only staged copy. A device that stays full never opens its collection again.
   - **Fix:** a failed switch stops writes and says the replacement will finish when there is room. `openStaging` never deletes a staging copy that a pending switch still needs. A copy that cannot finish leaves the collection openable.
9. **The corpus: 120 species with no photographs, and 44 pages that state a refusal that never happened** (B4, B5).
   - The 44 carry `refused` for a distribution source that the offline rebuild never asked, and so have no range, no climate and no sheet. Aeonium tabulaeforme is one.
   - The 120 carry "skipped: N photographs already from the GBIF download" with no photographs. Sprekelia formosissima had 84.
   - Both date from rebuilds of 20 to 29 September and have been carried since. The corpus from before round 63 has the same faults.
   - **Fix, in three parts:**
     - the offline fetcher writes `skipped`, never `refused`;
     - a rebuild never carries "already have them" without the photographs;
     - the build's audit fails when a species drops to zero photographs.

     Then rebuild those 164 species online on the PC.

## 2. Medium

**The example collection.**
- **A3, A4 and A10 share one cause.**
  - `inDemo()` reads the tab's storage live, but the vault fixes its database at page load. A Leave in another tab, or a Leave answered Cancel where the browser does not report it (Safari waits 10 s), leaves a page that draws the example and writes as the grower's own.
  - **What that page does:** it re-creates the deleted example database, asks the browser to keep data from the example, spends the grower's `persistAfterFirst`, and writes Labels picks under the grower's key.
  - **Fix:** read the flag once per page, and refuse to reopen a closed example database.
- **Any address with `?left=sample` deletes an open example in another tab, edits included, without the question** (A5). Delete only under the open lock.
- **The example's snapshot is never written after the seed** (E1). Every later page load re-reads all 431 seed changes one request at a time: about 7 s a page at WebKit's Windows pace, and an estimated 20 to 130 ms on an iPhone.

**Records, the import and backups.**
- **An import run again after the sheet was re-saved in a spreadsheet adds every line again** (C3). The import key is the raw cells, so rewritten dates or an added column change it. The likeliest of these for a first user.
- **In a sheet over 2,000 lines, lines dropped in the first pass come back undropped in the second** (C4).
- **A round-sixty-one backup folds the changes its devices had parked by arrival** over the grower's later edits, and the restoring device then disagrees with its peers (C2).
- **Move, or the edit form's Save, pressed twice writes two moves** (E3). Round 66's `settlePlaces()` widened the window. Add busy flags, as the add form and pot-up already have.
- **One malformed change leaves every private page at "Opening your collection…" for good** (E15, and A in passing). No intake path lets one in, but the fold should skip it and say so.

**Pages and words.**
- **The add form moves when the name check answers** (E2). "Use my own number" and Add jump up to 120 px at 390 px, and a tap that straddles the move does nothing. Round 66 left this as a decision; this is the cause of smoke 901, and the disclosure helper hides it. Owner's decision, D5.
- **Two "a year" rain figures sit in one habitat box on 1,378 pages** (B8, F3).
  - The long season sentence still says "a year" for the median year's total.
  - On 6 pages the top card shows 120 mm or more while the season card says "under the rule's 120 mm".
  - Round 63 claimed this was fixed.
- **`/about/how` says Ceropegia is not taken whole, but the corpus holds 700 of its species** (F4). Eleven of the "173 collector genera" have no species left.
- **Firefox asks "keep data" on every page load while the question stands** (E4, F2). GrowLayer's first-plant ask bypasses the monthly rule, and no test covers that rule.
- **A sheets request refused with 429 is said as "did not answer"** (D6).
- **Names.**
  - **Spellings not pooled:** apostrophes, closed compounds and accents are kept apart. 302 species repeat a name under their title, and Agave americana is headed "Centuryplant" (B6).
  - **Capitals across hyphenation:** the rule compares only spellings with the same hyphenation. 71 headlines stay in Title Case, and 9 names lose a capital a source meant, such as "Star of bethlehem" (B7).
  - **Search order:** results within a reading are alphabetical, so "Fig" puts Ficus carica 16th (B9).

**The server.**
- **One actor can close sync to new growers and keep it closed** (D3). The 200-a-day and 2,000-in-all places are global. Forty IPv4 addresses take a day's places, and a tiny upload every 89 days holds them. Owner's decision, D4.
- **Every pull walks the whole log listing, and nothing caps the total** (D4). A token holder can make that cost about $19 a day per address.
- **The adapter's own cache answers repeated public GETs before the Worker runs** (D5):
  - rate limits are skipped for repeated URLs;
  - old answers outlive a code-only deploy for up to a day;
  - `/about/how` leaves out five of the copies kept.
- **The sweep can delete a revived photograph's new copy** if the revival's pointer write stalls for 10 minutes (D2). Unlikely.

**The service worker.**
- **The worker says it keeps the previous build's cache for old tabs, but never reads it** (E7). An old tab's in-page imports fail.

## 3. Low

**The example and first screens.**
- **A6:** an empty Places with its add form open still shows the example's offer, and pressing it loses a typed place name.
- **A7:** a seed cut off before its mark is never marked, and seeds again once the visitor removes its plants.
- **A8:** "never during a restore" holds only in the tab doing the work.
- **A9:** at 320 px with 200% text, the example's bar fills the first screen.
- **A11:** a places-only grower is given the visitor's words in the bar.
- **F9:** the example's Today warns "no backup yet" and links to the locked backup page.
- **F14:** the example bar's text and "Opening your plants…" are in every public page's HTML, hidden only by CSS.
- **Not numbered (A):** a photograph that failed to load still shows its credit, and species pages shift on phones when their photographs fail.

**Words on the pages.**
- **F5:** missing spaces after `{#if}` blocks: "Use my locationor set your site", "which.Sync may still".
- **F11:** a doubled full stop on the compare page.
- **F10:** the genus summary says a refusal as "did not answer". No live genus is affected today.
- **F8:** Natural Earth and Wikidata are missing from `/about/how`'s sources.

**Privacy wording.**
- **F6:** the compare tray, which sits outside `<main>`, preloads on hover on private pages.
- **F7:** SvelteKit's `sveltekit:snapshot` and `sveltekit:scroll` session keys, and the browser's day-long cache of searches, are not in the "every key" list.

**Layout.**
- **F12:** at 320 px with 200% text, the add form's bars cover half the screen.
- **F13:** italic species names are clipped in Today's chips.

**Search data.**
- **B10:** a common name that matches nothing is retried on its first two words, giving "Showing results for Lily of".
- **B11:** junk single-source headlines: "Cactus" for two Copiapoa, "Indian-dope" for peyote, a species' own binomial as its common name.
- **B12:** the typo pass ranks near hits alphabetically.
- **B13:** every species' sitemap day is the rebuild's day.

**Records and the import.**
- **C5:** a partly added line numbers the rest in the collection's scheme, not the sheet's.
- **C6:** the plant page's death Undo is two writes, the shape the triage fixed for Archive.

**The server and its wording.**
- **D7:** the /48 vault-creation limit is worded as "this address", with an hour's Retry-After on a limit that lasts to midnight.
- **D8:** the "77 networks" figure is the cost of spending a whole share; denying the name picker takes about 15 addresses.
- **D9:** a /48 can be a whole ISP neighbourhood.
- **D10:** photograph ids can be guessed from the sync listing; make new ones random.

**Engines, the worker and the harness.**
- **E5:** a write that mints a number leaves the read frontier behind, so the next write re-reads every change since the page loaded.
- **E6:** the 4-second reload after a deploy can still lose a field just typed.
- **E8:** Labels may not restore its picks when Safari restores a killed app's tab, because the navigation type may not be `reload`.
- **E9:** the WebKit pace allowances cannot tell real slowness from Windows' timer, and nothing budgets request counts.
- **E10:** offline in Safari is untested, and a test message claims an iPhone check that no document records.
- **E11:** several Chromium-only tests matter in Safari.
- **E12 and E13:** `settlePlaces()` settles every picker on the page, and the import's picker is read without it.
- **E14:** a failed place write raises an unhandled rejection.

## 4. The WebKit question

Reviewer E counted IndexedDB requests and traced the mechanism in WebKit's source.

**Round 65's conclusion holds in size.**
- About 16 ms a request is a Windows-port artifact: WebKit gives back one request result per task, and on Windows a zero-delay timer falls to the 15.6 ms system tick.
- On an iPhone, an estimated 0.05 to 0.3 ms a request.

**Changing only the tests' waits was not sound.** Two costs are real on any device, and both are cheap to fix with no format change:
- **The load's tail:** one `get` per change since the snapshot. That is 432 gets on every example page, and 7,811 after an import of 300.
- **The catch-up after a write that mints a number:** 2,204 gets on the first Water tap after an import of 100.

The pace model also undercounts a 300-row import by about 1.9 times.

**In order:**
1. Read the tail with one range `getAll`.
2. Advance the read frontier after a claimed write.
3. Write the snapshot after the seed, an import or a restore.
4. Only if a device shows writes slow: one outbox and one order row per commit, a device-only database change (version 5).
5. Add a Chromium test that budgets request counts.

## 5. Decisions for the owner

- **D1. Logging.** I'd turn invocation logs off rather than reword the privacy page, since the page's promise is the product. The cost is no request log when something breaks; errors could be kept as counters in the counter object instead.
- **D2. The headline rule.** I'd rank by the number of distinct sources and use "preferred" only to break ties, and set back a single generic noun ("Cherry", "Cactus"). About 280 headlines change. The audit shows them before the deploy, as last time.
- **D3. Adding inside the example.** I'd have the add forms in the example lead out with what was typed ("Keep this as your own"), not just warn.
- **D4. Vault places.** I'd count the day's new places per /24 and per /48 as well, have the counter object flag when half the day's ceiling is gone, and write the attack and its remedy into DEPLOY. Raising the ceilings alone only buys time.
- **D5. The add form's moving line.** I'd reserve the name check's line now: the review found it is the real cause of a test flake, and a person's tap meets the same thing.
- **D6. The corpus repair.** I'd fix the builder (B4, B5) and rebuild the 164 affected species online on the PC. A whole online rebuild is not needed.

## 6. Found sound

- **The clock and records.**
  - `w` is never read by a fold, hold or park.
  - The convergence fuzz, extended with these rounds' writes (Archive and its Undo, line removal and restore, death and its Undo, Apply all, plant removal and restore), converged on 240 seeds and lost nothing.
  - Renumber's single note, version-2 batches, the photo-bytes fallback and format-3 round trips all hold.
  - Rule 5 holds: no reading of the log writes to it.
- **The server.**
  - Proof-first removal holds, and vault isolation, private-data caching and the Origin checks hold.
  - Client addresses come only from `CF-Connecting-IP`; IPv6 grouping is correct.
  - Counting is crash-consistent, reclaimed-vault admission is sound, and upload limits hold.
  - Refusal words hold for the forecast, the picker, search and import.
- **Names.**
  - The code reproduces the live index exactly.
  - Every English comma value is a list, and only 2 headlines are bare genus words.
  - The capitals rule strips almost no proper noun outside B7.
  - The typo pass never reads places. Author citations, cultivars, cf./sp. and hybrid formulas are read and labelled correctly.
  - Tile credits all match, licence first. Sitemap days hold when nothing changed.
- **The example and the phone.**
  - Leave's count is right in normal use. Leave with Cancel works in Chromium.
  - No back-forward loop. Reloads during the seed leave one whole seed.
  - Sync is off and the database channels are separate.
  - Five tabs everywhere, with no sideways scroll.
- **Privacy and accessibility.**
  - The CSP and hosts match `/about/how`, and app storage keys match its list.
  - An in-page accessibility audit of 17 pages found no unnamed controls or missing alt text.
- **Engines.**
  - The reload guard holds with two tabs and a frozen tab.
  - `create()` makes one place however it is pressed.
  - The add, pot-up and new-batch forms are guarded against a double press.

## 7. What I checked myself

- **`wrangler.jsonc` line 9:** observability is on.
- **The corpus counts:**
  - Reviewer B's scripts give 120 species with no photographs and 44 with the "not asked" refusal.
  - Comparing with `s-v2-before-r63.zip` (corpus `8a9396b6d10f0d45`): the same 120 had no photographs and the same 44 were refused there too.
  - The notes trace the photographs to a rebuild of 20 September, carried through every rebuild since. The pre-round-63 zip cannot restore them, so the repair needs the online rebuild in D6.
- **`ownEmpty`:** it reads plants, batches, followed species, places, held and parked changes, and the sync key, and nothing else.
- **The round-66 Leave fix:** reviewer E's mutation of it fails its unit test, as it should.
