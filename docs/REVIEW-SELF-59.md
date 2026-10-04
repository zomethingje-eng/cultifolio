# Self-review of `741180f`: round fifty-nine

Nine reviews ran in parallel on 2026-10-04 against `docs/REVIEW-PROMPT-59.md`. Each worked in its own copy or against one shared local server. The serious findings were then checked again by hand. The full reports are in `docs/review-59/`, and the tests the reviews wrote are in `docs/review-59/tests/`.

| Review | Covered |
|---|---|
| Server | Counters, accounting, origin check, every public route's cost and failure modes, headers. 14 new tests. |
| Corpus | Search fuzzed against a synthetic 9,000-species index, the refresh sequence with a fake R2, caching, SEO, link previews, cost per request. |
| Data | The clock, rule 5, duplicate numbers, a three-device convergence fuzz (160 seeds), a 400-plant backup round trip, quota failures in Chromium. |
| Harness | 115 mutations of round 58 and 59 fixes. Also the full e2e suite (103 of 103) and the unit suite on Node 22 and 24 (533 of 533). |
| Visitor | Every public page at 390 and 1280, light and dark, as a stranger from Show HN. |
| Grower | Eight simulated months as a 300-plant collector: places, Today, propagation, labels and printing, backup, sync between two devices, offline. |
| Accessibility and performance | axe on 32 routes × 2 themes × 2 widths, every round-59 claim measured, keyboard, forced colours, 200% text. Performance: throttled timings, layout shift, collections of 300 and 3,000 plants. |
| Words | Every sentence template on the species page and compare, generated for edge cases. Both about pages against the code. Every message on the private pages. |
| Product | The market, positioning, the adoption funnel, feature gaps against the rules, Show HN, and a 30/60/90-day plan. Web research cited in `docs/review-59/product.md`. |

**Limits:**
- The local build serves the four-species fixture corpus. Photographs from outside hosts do not load here, and the live site is not reachable from the sandbox.
- "Confirmed" means reproduced; "read" means found in the code.

**One finding was withdrawn on checking.** Two reviews reported that request logging is on and contradicts `/about/how`. They read the sandbox's copy of `wrangler.jsonc`. Your copy on the PC, the one that is deployed, has `"observability": { "enabled": false }`, so the claim holds. The sandbox copy is stale and is never staged.

**The headline.** Round fifty-nine's account holds better than round fifty-eight's did:
- axe finds nothing on 128 scans.
- Search equals the whole index on 9,628 fuzz queries.
- Backups round-trip byte for byte.
- The self-review-58 mutations are all caught now.

But the review found five problems a grower would meet in the first weeks:
- The clock fix has a sign error that hides the grower's own plants.
- Duplicate plant numbers send writes to the wrong plant.
- The archetype table gives hardy bromeliads and orchids a tropical minimum and raises their cold floor to it.
- A full device refuses writes without a word.
- Label sheets print misaligned when the install card is showing.

The UX reviews agree on the bigger picture: the product is careful, consistent and well built, but it doesn't show itself. The front page hides the figures that are the product, the species page buries them under its own provenance, and a collector cannot bring an existing collection in. Those three decide mass adoption more than anything in the code.

---

## P0: before Show HN

1. **A synced device whose clock is set back hides the grower's plants, and they stay hidden after the clock is fixed** (confirmed in the browser and in unit tests; checked by hand).
   - **The bug:** `clockChecked()` (`src/lib/core/hlc.ts:129`) and `readStored` (`:48`) test `Date.now() - confirmedAt < TRUST_EXPIRES_MS`. When the clock goes back, that age is negative and passes, so the old server reading still counts as confirming the wrong clock.
   - **What happens:** the fold parks the recent changes by that clock and `flushParked` stores them. Parked stamps are never re-judged.
   - **Reproduction:** with sync set up, add a plant and set the clock back three days. The plant is gone from `/plants`. Set the clock right and it stays gone, listed on the sync page as "edits from a device whose clock was wrong".
   - **The other direction:** a clock a year ahead, corrected by sync, then put right, keeps a minus-one-year correction as "confirmed". It parks the recent collection, shows no warning, and stamps every edit a year in the past.
   - **Fix:** a reading dated after the device's own clock confirms nothing. Require `age >= -small` in both places and drop the stored offset when that fails. The data review applied this and the fuzz's diverging seeds fell from 6 of 80 to 1. Also consider never storing a park of this device's own stamps that was judged by its clock alone.

2. **Two plants under one number: the list's link opens one of them for both, and a write lands on the wrong plant** (confirmed in the browser; checked by hand).
   - **Reproduction:** two devices each add a plant offline as 2026-0001, then sync. Both rows on `/plants` link to `/plants/2026-0001`. `accession()` falls back to the first match by number (`collection.svelte.ts:245`), so the second plant cannot be opened from the list, and Water on the page that opens waters the other plant.
   - **Same fault elsewhere:** the front-page search, the place page (`:482`), the batch page (`:341, :409, :492`), the Undo after a removal, and `/labels?acc=`.
   - **Already sound:** QR codes and the plant page's Label link use the record id.
   - **Why it's worse now:** round 59 stopped renumbering automatically, so duplicates now live until the grower presses Renumber.
   - **Fix:** link by id wherever the record is in hand. A bare number shared by two live records shows both rather than picking one.

3. **The archetype table gives frost-hardy genera a tropical minimum, and the floor rule takes it** (confirmed by reading the table and generating the sheet; checked by hand).
   - **The table:** `arch-tables.json` files these genera with tropical minimums:
     - as "Other epiphyte" (10 °C): Dyckia and Puya, both terrestrial and frost-hardy;
     - as "Orchid" (13 °C): Bletilla, Pleione, Disa and Habenaria;
     - every other Bromeliaceae by family, Hechtia and Deuterocohnia among them.
   - **What a grower reads:** "Cold floor: 10 °C … the archetype table's conventional minimum for an other epiphyte … the floor rule takes the higher", over a habitat night of −3 °C.
   - **Why this is P0:**
     - A grower will catch this at once on Show HN.
     - It contradicts `/about/how`'s "where a family splits … the app guesses nothing".
     - The 13, 12, 10 and 5 °C minimums cite no source, though the footer says every figure comes from public data.
   - **Fix:**
     - Take terrestrial bromeliads and terrestrial or temperate orchids out of those groups.
     - Stop assigning a group by family where the family splits.
     - Either cite a source for each minimum or present it as a convention with no source and never let it raise the habitat floor.

4. **The Show HN draft is not ready, and its prepared replies contradict the app** (read).
   - **The draft (`docs/SHOW-HN.md`):** it is 603 words against its own 300, the sync price is still a placeholder, and it says nothing about the code being built largely by AI agents (the DEVLOG does).
   - **The prepared replies get facts wrong:**
     - The cold floor is called "the habitat's coldest night on record"; it is the 1st-percentile night.
     - "Cultivation advice is derived by rule"; the sheet says it gives none.
     - "The record map shows every record used"; it shows only the openly licensed ones.
     - "Forty years" of POWER data; it is 44.
     - "For 8,900 species" in the title; not every species has a climate.
   - **Fix:** use the app for real first (see the plan below), then rewrite the post in your own voice under 300 words. The product review has a draft and an attack-and-answer table in `docs/review-59/product.md` §F.

## P1: wrong or broken for a real user

5. **A full device refuses writes with no notice** (confirmed in Chromium with a cut quota).
   - **Cause:** Chromium's `QuotaExceededError` has an empty message. `commit` stores that empty string as `lastWriteError` (`collection.svelte.ts:1223, 1429`), so every `{#if lastWriteError}` notice stays hidden.
   - **What the grower sees:** a note form stays open with nothing said, and a list Water fails silently and is gone after a reload. Only photos say "out of space".
   - **Fix:** `storageErrorText(e) ?? (e.message || e.name)` in all three places, including the engine's `lastError`.

6. **Label sheets print misaligned** (confirmed with printed PDFs). The labels page's print rules (`labels/+page.svelte:334`) hide the top bar, tab bar and footer, but not the install card, frost bar, clock bar or toast. With the install card showing, every label is off its cell and the sheet runs onto a second page.

7. **On an unchecked clock, edits are saved and never shown** (confirmed).
   - **Cause:** `collection.svelte.ts:1269` drops a previous stamp more than a day ahead, so the edit is stamped now and loses to the field's own later stamp. Nothing parks on an unchecked clock, and `commit` never checks whether its change was folded.
   - **What the grower sees:** the clock bar's "Nothing is lost" is false here. The fuzz lost 18 edits this way, all under clock skews of 30 or 72 hours.
   - **Fix:** after a commit, confirm the field took the new value. If it didn't, re-stamp past the field's own stamp, or say so.

8. **A never-synced device that restores a fast-clock backup shows an empty collection while the report says "1 plant added"** (confirmed).
   - The held changes are mentioned only on the sync page, inside `{#if sync.configured}`, and an unchecked clock is never shown to the grower anywhere.
   - The good news: the device's own clock does not follow far-ahead stamps (`Clock.observe` ignores anything more than 5 minutes ahead).

9. **The backup preview still promises renumbering** (confirmed). `backup.ts:290-309` and the backup page say "1 of this device's plants gets a new number … reprint its label". Round 59 removed that renumbering. The preview also picks the keeper by id, where the record page uses the first stamp.

10. **Today uses the wrong hemisphere when no site is set** (confirmed).
    - Today reads only `site.current`. The species page and labels fall back to the first place with coordinates.
    - **Example:** with a place at −33.9 and no site set, Today put Copiapoa under "Outside the cooler six months" in October.

11. **A vault refused at the ceiling shows "push failed: 503" and re-sends its batch every five minutes** (confirmed).
    - The engine handles 429 but not 503 (`engine.svelte.ts:682`, `:627`). It drops the server's sentence and ignores `Retry-After`.
    - The routes read the whole body (up to 16 MB) before checking the ceiling.
    - The server's "holds nothing yet" is false for a vault whose `fill` threw.
    - **Fix:** treat 503 like 429, check the ceiling before the body, and correct the sentence.

12. **About 200 small requests a day block every new grower, and ten days of that closes sync for good** (confirmed).
    - `day:` still counts empty creations.
    - One tiny upload per vault spends a place under `all`, which never goes down.
    - **Fix:** count the day ceiling at a vault's first object, as `all` now is, and reclaim places held by vaults that stay empty.

13. **Commons lead photographs load the full-size original** (confirmed in the code).
    - `wikimedia.ts:131` stores the original upload as the photo's address. `shownAt` keeps any Commons address, and `photoAt` has no Commons sizes.
    - The phone preload, the hero image, `og:image` and the JSON-LD image therefore name a file that can be 3 to 20 MB.
    - **Fix:** use the 800 px `thumb` or the Commons `/thumb/` path.

14. **Claims of a habitat climate that isn't there.**
    - The genus, family and origin row pages say "each with its native range, habitat climate and sources" (`+page.svelte:422`). These are about 1,300 URLs in the sitemap.
    - My own species description fallback from this afternoon says "habitat climate and the cultivation it suggests". The sheet gives no advice, so that's a claim too.
    - The front page counts a pending climate as "not checked" (`catalogue.ts:174`).

15. **Search misses the commonest ways growers write names** (confirmed).
    - These all return nothing:
      - an author citation pasted in ("Copiapoa cinerea (Phil.) Britton & Rose");
      - a variety filed under its species ("… var. columna-alba");
      - "Aloe x nobilis" ("×" works);
      - a cultivar in quotes;
      - "v.", "fo." or "subspecies".
    - The species 404's "Did you mean" uses the same search, so it offers nothing for any of these either.
    - **Fix:** add the markers, and on zero hits retry on the first two words with citations dropped, saying so.

16. **Five tests do not test what they are named for** (confirmed by mutation; 34 survivors of 104).
    - **The named five:**
      - `page-corpus.test.ts` never calls a real `load`, so five `locals.corpus` mutations survive.
      - `manifest-refused.test.ts`' second test is vacuous: same-length manifests give the same fake etag.
      - The byte-counter tests can't tell one object's give-back token from another's, and the round's named fix to `take` survives being reverted.
      - "Notes replaced" is tested in `notes.ts`, not in the collection where it is wired.
      - The clock's engine side, and its expiry, are untested.
    - **Also:**
      - The species page still renders the bucket's current dossier under a held corpus, so "one corpus per request, all the way down" is overstated.
      - The repo's own search fuzz generator has a weak random number generator: the "wider" case yields 356 distinct names out of 1,500.
    - **Fix:** 31 proposed tests in `docs/review-59/tests/`, each checked to fail under its mutation.

17. **The settings page loses choices made before the collection loads** (confirmed under CPU throttling).
    - `onMount` awaits `collection.load()` and then resets the numbering fields from storage.
    - The `data-ready` marker added this round doesn't guard this, so it is the likelier cause of the Windows failure.
    - **Fix:** don't overwrite touched fields; tests wait for "Save numbering" to be enabled.

18. **iPhone growers can lose a collection they never installed** (suspected; no iOS here).
    - Safari clears a site's storage after seven days without a visit, and an installed home-screen app starts with its own empty storage.
    - The install bar appears only from the second day and doesn't warn about this.
    - **Fix:** offer install before the first plant on iOS, call `navigator.storage.persist()`, and say once, plainly, "back up or install".

## P2: robustness, accessibility, friction

**Server**
- **In-flight bytes are never lowered** if a release fails or a Worker dies: a vault can be told "full" weeks later with an empty bucket.
- **Every vault open re-lists the whole vault** (up to 100 R2 list calls), and `sync` has no /48 window. That's about $39 a day of list calls at 50,000 batches from one address.
- **HEAD, `?was=` and `__data.json` render uncached and unlimited.**
- **One R2 error at the minute's check makes every page and API a 500** while the isolate holds a good corpus.
- **`readBody` still allocates the declared length after the first byte.**
- **A rejected manifest keeps the old corpus only in warm isolates.** A new isolate falls to the bare index, at 15 MB and 302 ms cold.
- **The near pass of search is never charged.**
- **Odd species addresses misroute:** a space gives a 301 with a raw space, then a 404; `%3F` goes to a different page; an underscore claims the genus is absent.

**Collection**
- **The device with the wrong clock and its peers park its stamps by different rules**, and disagree for good.
- **The parked set is collection data outside the log, written by a load** (rule 5).
- **A replace restore that runs out of space mid-copy** leaves the vault unable to open on every load (suspected).
- **The CSV writes number-like text bare,** so Excel turns 0012 into 12, and it has no id column to tell duplicates apart.

**Accessibility and performance (measured)**
- **Watering by keyboard loses focus:** Water is disabled while it saves, which drops focus to the body.
  - The Undo is 23 Shift+Tabs away.
  - The toast closes even while it has focus.
  - Its live region is created with its text, so screen readers may not announce it.
- **Layout shift of 0.20 to 0.29 on every load of `/plants` and `/today`:** the footer draws mid-screen, then the list pushes it off.
- **Date inputs can still sit under the top bar:** Chromium reports them as not `:focus-visible`.
- **Forced colours:** selected chips and toggles look the same as unselected ones, and the two add forms remove the focus outline.
- **Larger text:** the phone tab bar loses "Today" from 150 to 175% text, and nine pages scroll sideways at 320 px with 200% text.
- **Tap targets:** Today's tick boxes are 20 px, 6 px from the plant link. The species section row is 40 px, the letter index 30, compare's Remove 32.
- **Private pages are blank until JavaScript runs:** first paint is about 4.5 s on a throttled phone, against 1.2 s for the server-rendered front page.
- **Large collections load slowly:** 3,000 plants take 4.1 s on first load. A snapshot older than the log takes 8.6 s, because the tail is read one change per request.

**Visitor**
- **Compare shows broken-image icons:** the image fails before the error handler is attached.
- **Every anchor on `/about/how` lands under the sticky bar,** and `/privacy` opens with its heading hidden.
- **Back from a species page loses the open genus position.**
- **"1 genera · 4 species", and the count ignores the chip.**
- **The share card:** it still says "winter to summer" and "over 25 mm" (it means 25 mm and above), and its legend is clipped.
- **Desktop section tabs highlight the wrong section near the foot of the page.**
- **Compare on a phone:** no sticky column names, and a 6 px third column.

**Grower**
- **The toast covers "Save and add another"** during rapid entry; a tap opens the plant instead.
- **Today says a place is "Watered ✓"** while three ticked plants remain under it.
- **Today's rules are worded in the app's terms** ("Outside the cooler six months the species sheet names") and quote the 21-day default on a place set to 10.
- **Today's chips drop cultivar and cross names.**
- **The plants list cuts a place path from the wrong end.**
- **Labels default to US Letter for en-GB,** and "Pick all shown" picks batches too.
- **The sync key says "shown once here" but is shown again later.**
- **Marking a plant dead has no Undo.**

**Words** (`docs/review-59/words.md` has all 21)
- **Grammar:**
  - "an other epiphyte";
  - "there there is no season to reverse";
  - a cold-floor sentence that loses its verb when the extremes are missing;
  - "July to September in the northern hemisphere (July to September at the habitat, northern)".
- **Raw sync errors reach the grower:** "push failed: 400", "the cursor stays before it".
- **"Vault" means two things,** and so does "batch".
- **"Nothing leaves it"** on three pages, against `/about/how`'s list.
- **`/about/how` calls its device-storage list "whole"** but omits about a dozen `localStorage` keys, the site's coordinates among them.
- **`/about/formats` is behind round 59** on the server-confirmed clock.

## P3

- Collection pages and `/offline` are indexable.
- The sitemap has no `lastmod`.
- The service worker requests `/.assetsignore` and gets a 404.
- 12 of a first visit's 19 Worker requests are client-only shells that could be static.
- Each page shell repeats about 50 KB of inline CSS.
- The maps are served `max-age=0`.
- Applying a parked notes edit lists the text the grower just saw as replaced.
- Smaller items: fixed waits that encode races in the e2e suite (listed in `docs/review-59/harness.md` 13 and 14), and the house-style slips.

---

## The experience, and what mass adoption needs

The three UX reviews (visitor, grower, product) agree. What's there is careful, quiet and consistent in both themes; nothing looks broken at a glance; search is fast and forgiving; refusals read as refusals. What holds it back is presentation and missing entry points, not correctness. In order of how many users each would win or keep:

1. **Show the product on the front page.**
   - The four glance cards (cold floor, warmest month, rain, light) and the climograph are what nobody else has. A stranger never sees them without opening a species.
   - Put one featured species' glance row and chart under the heading, labelled "This is what every species page shows".
   - Replace the 62-word opening sentence with three short bullets: what it is, every number sourced and not written by AI, and no sign-up.
   - Cheap.
2. **Say each figure once on a species page.**
   - Copiapoa cinerea's page runs to 2,077 words. "72 mm" appears 9 times, "CHELSA" 21 times and "rule" 13; "dormant" appears 0 times.
   - Keep the source on every figure as a small tag, and move the method to one "How this page is made" disclosure per section.
   - Relabel the same figures in growers' words: "coldest nights in the wild", "rain falls in the cool months". That is relabelling, not new text, so rule 1 holds.
   - Cheap to moderate.
3. **Put the growing season in the glance row,** in the grower's months, with "habitat months" written on the chart. Today the chart and the text use different calendars and the chart doesn't say which. Moderate.
4. **Import, starting with paste-a-list.**
   - One name per line, same place and date for all, each checked against the reference with a short review step. CSV import comes next.
   - Retyping 300 plants is about 1,600 taps, and serious collectors are the first audience.
   - Fits every rule: it is parsed on the device.
5. **A sample collection for visitors.** A labelled, throwaway collection in a separate local store, so a stranger can see Today, a plant page and labels without typing anything. Moderate.
6. **Something that brings growers back.**
   - Today is the habit loop, but nothing reaches a grower outside the app.
   - **Fits fully:** an `.ics` export of watering rhythms the grower imports into their own calendar.
   - **Fits with disclosure:** frost-only web push. The server would hold a push address and a rounded cell, and `/about/how` would say so.
   - Also: make Today warmer and shorter. Say "All caught up" instead of the method sentence, put the stops above the frost card, and mark firsts ("First flowers on 2026-0003").
7. **Lose the cold tone, keep the honesty.** The facts come first in full method sentences, every time. Say the outcome in grower words and keep the exact rule one tap away. `docs/review-59/grower.md` §3 has a rewrite for each example.
8. **Win the search result.**
   - Title species pages with what only this site has. Build the description from the figures rather than the Wikipedia lead, which Google already ranks for Wikipedia.
   - Index every English common name, not only the first.
   - Put a plant photograph on the front page's link preview, and add `twitter:card` and `og:url` to species pages.
9. **iPhone:** offer install before the first plant, call `persist()`, and back up early (finding 18).
10. **Smaller things growers expect:**
    - Download the collection as a spreadsheet from `/plants` itself, not only inside Backup.
    - Selection mode on the list (water, move, label, archive).
    - A photo timeline per plant.
    - A numeric price for "spent this year".
    - A wishlist from "Follow".
    - A label QR that shows the species to anyone who scans it, through a URL fragment, which never reaches the server.
    - Visitors see two tabs, not five. The UX review wanted this; it appears to have regressed.

Things the reviews advise against, because they break the rules or dilute the product: plant ID from a photo (it would send photos to a third party; link to iNaturalist or Pl@ntNet instead), accounts or a community feed, and shop sourcing.

**Market facts the product review found (sourced in its report):**
- **Who to reach first:** serious collectors. CSSA has about 2,000 members and BCSS about 3,000, each with 80-plus local groups.
- **Price point:** consumer care apps charge $30 to $45 a year; Pl@ntNet is free.
- **What competes for the search result:** generated care pages now fill the results for rare species, which makes "not written by AI, every number sourced" a selling point to growers, not only to HN.
- **Running cost at Show HN traffic:** 10,000 visitors in a day fits the $5 Workers plan, and 100,000 costs about $10. Cost is not the risk.

---

## Checked and sound

- **Accessibility:**
  - axe on 128 scans: nothing.
  - Field edges at 3:1 in both themes; links underlined.
  - The skip link is first on every private page; one h1 per page.
  - The lightbox is a proper modal.
  - Keyboard: adding a plant and using compare both work.
  - Reduced motion is respected, and nothing scrolls sideways at 320 px with normal text.
- **Search:** answers equal the whole index on 9,628 fuzz queries. The short path and the 2,000-candidate charge both work. Typos, older names and common names are found.
- **Sync server:**
  - Twenty concurrent first uploads count a vault once.
  - Give-back tokens are unique across a re-upload.
  - The origin check holds on every path.
  - No 500 is cached, and no stack trace is ever returned.
  - The retention claims hold for the counters.
- **Collection:**
  - The device's own clock refuses far-ahead stamps.
  - With no clock skew, three devices converge on every fuzz seed.
  - A 400-plant backup round-trips byte for byte through merge and replace, including RTL text, emoji and five-deep places.
  - QR labels carry the record id.
  - Renumber, pressed on two devices, converges.
  - No log write is triggered by a page opening, a load, a catch-up or a rebuild.
- **Pages:**
  - The rule-2 "not checked" wording, unit conversions, and the species page's and labels' hemisphere logic are right.
  - Round 59's In short rewrites hold up.
  - The units choice survives a reload; deep links and the letter jump work; dark mode is consistent.
- **Tests:** the self-review-58 mutation list is caught, and the full e2e suite passes on Linux, 103 of 103.
- **Grower flows:**
  - First plant: 4 taps.
  - Bulk entry: 5.3 taps a plant.
  - One tap waters a whole place on Today.
  - Backup takes 255 ms and restore 3.2 s.
  - Sync between two devices merges both sides' edits, and offline watering queues.

## Suggested order

1. **Findings 1 to 3:** the clock sign, links by id, and the archetype table. Small changes, each with a test from `docs/review-59/tests/`.
2. **Findings 5 to 15:** the user-facing correctness list, cheapest first: the quota message, print rules, preview wording, Today's hemisphere, the 503 path, Commons thumbs, the climate claims, search markers.
3. **Finding 16:** adopt the 31 proposed tests before any further change to the corpus, counters or notes, so the next round's claims are guarded.
4. **The experience list, items 1 to 3 and 7,** which are mostly presentation and cheap. Then paste-a-list import and the sample collection.
5. **Before posting:** use the app with your own collection for two weeks, then rewrite the Show HN post (finding 4).
6. **The P2 list,** server items first.
