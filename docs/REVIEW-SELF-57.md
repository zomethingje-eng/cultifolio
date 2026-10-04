# Self-review of `3dfd361`: user experience, code, copy, accessibility

Six reviews run in parallel on 2026-10-04, then checked against the live site in a phone-sized browser:

| Review | Covered |
|---|---|
| Reference UX | A first-time visitor and a grower researching species, at 390 and 1280 px, light and dark. |
| Grower UX | A seeded collection (26 plants, 8 nested places, waterings, photos, a seed batch through pot-up), walked as a collector's daily and occasional jobs. |
| Accessibility and visual consistency | axe-core on 22 routes in both themes, keyboard walks, contrast from the tokens, zoom and reflow. |
| Client code | The collection, vault, fold snapshot and sync engine. Findings were reproduced with tests in a copy of the repo. |
| Server code | Routes, search, products, sync storage, rate limits, the service worker. Findings were reproduced with tests and timings. |
| Copy and positioning | Every user-facing string, the home page, README, and a Show HN title and first comment. |

Limits of the local test run:
- The local build serves the four-species fixture corpus, and the sandbox could not load outside photographs.
- Photo-dependent layout was checked on the live site instead.
- Findings marked "confirmed" were reproduced. "Read" means found by reading the code, not run.

The rest is grouped by when it should land. P0 is before Show HN, because a hostile visitor or a real user would hit it in the first days. P1 is the first impression. P2 is the grower's daily use. P3 is accessibility and the design system.

---

## P0: correctness, abuse and data integrity (before launch)

### Server

1. **Anyone can exhaust vault creation, including from visitors' browsers (confirmed).**
   - **Where:** `routes/api/sync/vault/+server.ts`.
   - **What happens:** A `fetch(..., { mode: 'no-cors', method: 'POST', body: Blob })` sends no Content-Type, passes SvelteKit's origin check, and creates a vault. Any page an HN reader opens can spend that reader's five creations a day.
     - 40 visitors use up the day's 200.
     - 400 visitors use up the lifetime 2,000.
     - IPv6 /48s multiply the per-address limit.
   - **Fix:**
     - Require `content-type: application/json`.
     - Refuse a foreign `Origin` or `Sec-Fetch-Site: cross-site` on every sync route.
     - Count a vault against the total only when it stores its first batch, or expire empty vaults.
     - Also count `/48` windows for the buckets that call upstream services (forecast, names, match).
2. **The 2 GB vault cap can be reset (confirmed).**
   - **Where:** `recount` in `server/sync.ts`.
   - **What happens:** `recount` trusts a listing truncated at 50 pages. Fifty thousand tiny photos that sort first make it write a near-zero total.
   - **Fix:** Never write a smaller figure from a truncated walk.
3. **Concurrent uploads are counted as one (confirmed).**
   - **What happens:** Both byte counters are read-modify-write in KV, and failed KV writes are swallowed.
   - **Fix:** Move reserve and release into the `Counters` Durable Object beside `create`.
4. **Search CPU is open to crafted queries (confirmed by timing).**
   - **What happens:** A 16-word nonsense query costs about 140 ms on the live path. `a a a …` costs 60 to 110 ms. Nothing is cached, although the comments say the edge cache absorbs repeats; the Worker never calls the Cache API.
   - **Fix (diffs exist in the review's working copy):**
     - Return early in `rank` when a query word matches nothing.
     - Deduplicate the query's words.
     - Cache answers in `caches.default` under corpus, query and n.
     - Cap `?open=` row windows on the home page; `?by=origin&open=<region>` sends a whole region.
     - Raise the product cache from 24 entries to about 160 (the byte cap still bounds it).
5. **A refresh landing mid-request mixes two corpora (confirmed).**
   - **Where:** `product()` reloads the index.
   - **What happens:** Postings of the new manifest are applied to the old index's positions, and the result is cached for a day under the old id.
   - **Fix:** Pass the one load into `product()`, `entriesIn` and `sheetsIn`.
6. **Smaller server items.**
   - Upload bodies are held twice in memory; stream them.
   - A photo PUT reads 12 MB before checking its required header.
   - `storeOnce` checks then puts; use `onlyIf`.
   - The first-refresh instruction in DEPLOY.md can expose a half-uploaded corpus. Moot now that a manifest is live, but the top-level index is still written.

### Client

7. **The FOLD_RULES guard misses what the snapshot depends on (confirmed).**
   - **What happens:** Changing `key()`, `PARK_MS`, `MAX_AHEAD_MS`, `hlcCompare` or `hold()` passes the test while old snapshots stay in use. A `key()` change would silently undo newer values on every device.
   - **Fix:**
     - Hash the whole of `log.ts` and `hlc.ts`.
     - Add the collection's hold and park methods and the vault's `storeIn`, `readFold`, `writeFold` and `arrivalsAfter`.
     - A false alarm costs a hash update; a miss corrupts data.
8. **A peer's held change skips the grower's protections (confirmed, two tests).**
   - **What happens:**
     - A notes edit from a fast clock that comes due across a page load overwrites the grower's text with no "Notes replaced" line.
     - A batch whose every change is held never reaches the fold's held list, so the grower's next edit to that field is stamped below it and loses when it comes due.
   - **Fix:** Send held changes through `collection.ingest` in `takeBatch`, as the fold already holds them.
9. **Rule 5: every sync run writes the number repair, even an empty one (confirmed).**
   - **What happens:** The layout starts a run 1.5 s after every load, so on a synced device the repair is a load-time writer again. The formats page and the "Renumber now" notice say different things.
   - **Fix:** Repair only when the pull folded a batch, and pass `{ repair: false }` from `refold`.
10. **A sync failure shows as "This change was not saved … free space" on record pages (confirmed).**
    - **Fix:** Set `lastWriteError` only for local and import writes.
11. **The "Renumber now" toast claims success when the repair failed or was held (read).**
    - **Fix:** Re-check `sharesNumber` after the repair.
12. **After a rollback, `writeFold` refuses every snapshot (read).**
    - **What happens:** A higher-rules snapshot blocks writes forever.
    - **Fix:** A build that found the snapshot unusable for its rules may replace it.
13. **Smaller client items.**
    - With sync on, `scanClock` reads the whole log on every open, which cancels the snapshot. Derive the latest own stamp from the fold.
    - Backups carry no parked set, so a restored backup can fold a change another device parked.
    - Tabs overwrite each other's sync and photo meta. Merge in a transaction, and hold a Web Lock around `run()`.
    - Local writes are never type-checked; the place form turns "1e999" into `Infinity`.
    - Leftover `'location'` key in the plant edit form.
    - `ChangeRow` still accepts `m`.
14. **The species-key write on view (the one round 56 left).**
    - **What happens:** The plant page and the labels page write `taxonKey` when the reference disagrees. The labels page does not check that the name is unchanged, so it can write the old name's key onto a plant renamed meanwhile.
    - **Recommendation:** Make it a "Link to the reference" button, or at least add the same-name guard.

### The Today tab's warnings are wrong

15. **"Missed at the last audit, or not seen for ninety days" flags plants watered last week (Grower UX).**
    - **What happens:** Waterings started from Today or "Water all" are saved as `auto`, and `auto` lines never count as a sighting. So the app's own recommended way to water makes plants go "unseen". The label also names an audit that never happened, and one plant can appear twice in a stop.
    - **Fix:**
      - Count a place-wide watering the grower started as a sighting; keep `auto` for lines the app writes by itself.
      - Show the 90-day rule only after a place's first audit.
      - List a plant once per stop.

### Accuracy (rule 1 and rule 3)

16. **Welwitschia is labelled "cactus or succulent".** Check the care-group fallback for genera outside the table.
17. **Copy that no longer matches the code:**
    - Sync page: "nothing on the server is ever deleted" (removed photographs are).
    - Photos: "offer it to the gallery" (there is no gallery).
    - Home: "bring in a collection" (there is no import).
    - Batch page: provenance `f1` is shown as "seed from ex-habitat plants".
    - Species page: "Your Bench 1 has no floor set" names whichever place is first.
    - Labels: print "12 cutting" for vegetative batches.
    - Photo-host disclosure: omits Wikimedia Commons.
    - Formats page: says a park always drops the snapshot.
    - README: says "three-species fixture".
18. **The species not-found page is wrong for a case or typo URL.**
    - **What happens:** `/species/Copiapoa-cinerea` says Kew does not accept the name.
    - **Fix:**
      - Redirect to the lowercase URL.
      - Send a bare genus URL to its catalogue row.
      - Run the fuzzy search and say "Did you mean …".
      - Only say "Kew does not accept" when the source said so.

---

## P1: the first impression

1. **Say what this is on the first phone screen.**
   - **What happens:** Under 700 px the page header hides the product name and the one descriptive sentence. A phone visitor sees "SPECIES / Species / 4 species" and an invitation to add a plant.
   - **Fix:**
     - For visitors, make the heading "Cultifolio" and show the sentence at every width.
     - Name the plants (cacti, succulents, bulbs), and say no account, free, open source.
     - Make the home title "Cultifolio: cactus, succulent and bulb reference, and a private plant record".
   - **Drafted intro (recommended):** "A reference for people who grow cacti, succulents and bulbs. 8,947 species, each with its native range, habitat climate and cold nights worked out from public data, every figure with its source. Keep your own plants here too: they stay on your device, with no account."
   - Add `og:title`, `og:description` and `og:image` to the home page, so the HN link previews.
2. **Write the top of the species page in a grower's words.** No invented advice: the same facts in plain words, in a better order.
   - **What happens now:**
     - The first paragraph reads: "Grouped as a cactus or succulent by the genus Copiapoa, which is reliably one kind of plant (archetype table). Rain rule: no rainy season to read…"
     - Months switch hemisphere within one paragraph.
     - The cold-floor card caption runs to six lines on a phone (confirmed on the live site).
   - **Fix:**
     - Lead each line with the fact ("Almost rainless habitat: 72 mm a year, no wet season."), with the rule and source in grey after it.
     - Give months in the reader's hemisphere, with the habitat's once in brackets.
     - Cut captions to one line ("1 night in 100, NASA POWER").
     - Link DLI and "cold floor" to the glossary.
     - Retitle the card "Its year" as "Seasons".
3. **Put photographs and the section menu near the top of the species page on a phone.**
   - **What happens:** The photo grid is about 3,700 px down, and the section menu appears only after the Wikipedia summary.
   - **Fix:** Add a strip of six photo thumbnails under the name card, and move the menu directly under the card.
4. **Remove `content-visibility: auto` with a 480 px placeholder** (`species/[slug]/+page.svelte:552`).
   - **What happens:** The page reports 12,900 px tall and shrinks to 6,600 px as you scroll, so the scrollbar jumps.
5. **Make /privacy readable.**
   - **What happens:** The section is one paragraph of about 1,000 words, and its heading lands under the sticky bar.
   - **Fix:**
     - Lead with an eight-line list (the copy review drafted it).
     - Put the prose under "Full detail".
     - Add `scroll-margin-top` to headings with ids.
   - **Also:** give /about/how an "In brief" paragraph and a table of contents. Delete "since round fifty-three" and the "(round thirty-one, 4…)" and "dossier v2 · node" notes on public pages.
6. **Fix dark-mode maps.**
   - **What happens:** The SVG land fill is written in the file, so the theme tokens never apply. In dark mode the land is bright cream and the range box vanishes.
   - **Fix:** Remove `fill` and `stroke` from `static/maps/land*.svg` and style them with tokens.
7. **Give dead ends a way forward.**
   - Empty search: say the reference covers a fixed list and offer "add it as a plant".
   - The generic 404 needs a search box, a link, and the title "Not found · Cultifolio".
8. **Shorten the footer.**
   - **What happens:** It is eight lines on every phone page and about the server rather than the reader. Its source list omits iNaturalist, Commons, OpenAlex and ETOPO.
   - **Fix:** One line of sources, one line of privacy, the links.
9. **Remove em dashes from every page title (17 routes) and a few strings.** Use "Name · Cultifolio".
10. **Compare on a phone.**
    - **What happens:** The second column is cut off, and the charts are dropped. You cannot pick species on the compare page itself.
    - **Fix:**
      - Add the species picker to /compare.
      - Use two 50% columns on a phone.
      - Draw one overlaid climate chart.
      - Shade rows whose values differ.

---

## P2: the grower's daily use

1. **Today names plants by number only.**
   - **Fix:**
     - Show "0012 *Boophone disticha* · 160 d".
     - Make each plant a chip, ticked by default; unticking one changes the button to "Water 5 of 6 here".
     - Show names on the "Watered just now" row too.
2. **One fixed 21-day rule makes Today and the "Not watered 21+ days" chip noise for a seasonal collection.**
   - **What happens:** Dormant bulbs and plants kept dry on purpose all show red.
   - **Fix:**
     - Add "Water about every N days" and "Kept dry: months" to a place, inherited down the tree, with a per-plant override.
     - A place in its dry months shows one quiet line instead of six warnings.
     - 21 days stays the default.
3. **The place picker shows "› Tray B" with no path, and fills the last place used silently.**
   - **Fix:** Use the full path as each option's text, and say "last used" under the field.
4. **Labels after adding or potting up.**
   - **Fix:**
     - Add a Labels action to the "10 plants added" toast.
     - Add "Print 8 labels" to the pot-up notice.
     - On /labels, list picked plants first.
5. **Plant page order.**
   - **What happens:** The log starts about 1,150 px down on a phone, below climate analysis and a "Set your site" step on every plant.
   - **Fix:**
     - Order the page: card, actions, the last five log lines, photographs.
     - Then one collapsed "Habitat vs this place" line.
     - Move "Set your site" to first-visit setup.
     - Add the unit to the growth figure.
6. **Propagation on a phone.**
   - The list is a ten-column table cut off at "Date"; show cards below 640 px.
   - The germination count wants "total up so far" while growers count what is in the pot. Add an "In the pot now" mode that works out the total and shows it before saving.
7. **List density.**
   - **What happens:** Names break mid-word ("Astrophytu m"; also seen on the live home page). The Inside list prints "Bench 1BENCH". Rows are about 95 px with an empty photo tile.
   - **Fix:**
     - Use `overflow-wrap: break-word`.
     - Use two-line rows of about 56 px.
     - Drop the photo column when nothing in view has one.
     - On the live home page, the "reference photograph off" placeholders dominate the "You grow" tiles; use a compact tile when photos are off.
8. **Toasts cover the next form's buttons.**
   - **Fix:**
     - Show the toast at the top while a log form is open, or dismiss it on the next action.
     - Shorten the Today toast.
9. **Frost.**
   - **What happens:** The device location is set in Settings and asked for again per place, and an empty frost card leads Today.
   - **Fix:**
     - An outdoor or unheated place with no coordinates uses the device location, and says so.
     - Shrink an empty or no-risk watch to one line.
     - Rename the "And" heading.
10. **First visit.**
    - **What happens:** The empty plant list shows a sort menu, four zero chips and "0 numbers given".
    - **Fix:**
      - Replace it with three steps: where you grow, the first plant, your location.
      - Hide controls until there are two plants.
      - Say "No plants yet" on empty Labels.
11. **Fixed bars on a phone.**
    - **What happens:** A species page with two compared species has about 212 of 844 px fixed (top bar, section menu, compare tray, tab bar).
    - **Fix:** Hide the tab bar on scroll down, and fold the compare tray into a small pill.
12. **Smaller grower items.**
    - Batch add with an unknown name loses its count ("Add as typed"); keep "Add 10 as typed".
    - The Sow form has no pinned buttons, and "Start batch" is disabled with no reason given.
    - "From which plant" is a flat list of 32 numbers.
    - Settings checkboxes run together, and the Today option sits under Photographs.
    - The latitude placeholders look like a set value.
    - Altitude is in metres on an imperial device.
    - Avery 5167 shows the disabled QR option as ticked.
    - A bad zip shows "invalid zip data".
    - The sync page shows a debugging line.
    - A dead plant's page still offers Move and "Since watered".
    - "+" always adds a plant, even on Places and Propagation.
    - Deleting a log line has no Undo.
    - Measurement units follow the temperature setting.
    - Repot is free text only.
    - "has a dossier" should say "has a species page".

---

## P3: accessibility and the design system

1. **Sticky and fixed bars hide keyboard focus on most pages** (WCAG 2.4.11).
   - **Fix:**
     - Set `scroll-padding-top` on `html`, plus a bottom value on phones.
     - Add a larger top value when the section menu is present.
     - Publish the compare tray's height as a variable.
2. **Browser text-size settings do nothing**, because every size is in px.
   - **Fix:** Use `html { font-size: 100% }` and a seven-step rem scale. Nothing below 11 px.
3. **Field and chip borders are 1.2:1, and field focus is a 1 px colour change.**
   - **Fix:** Add a `--field-edge` token (3:1 or better in both themes), and let the global 2 px focus outline show on fields.
4. **Warm text on warm backgrounds is 3.6:1 in the light theme.**
   - **Fix:** Add a `--warm-ink: #8a5a1c` token for text.
5. **The lightbox and the audit drop focus to the page body, and the lightbox then ignores Escape.**
   - **Fix:**
     - Focus the new control after each swap.
     - Return focus on Cancel.
     - Handle Escape on the window while the lightbox is open.
6. **Your own photos have no text alternative.** Give the lightbox image alt text built from the plant and date, and label the thumbnails.
7. **Skip link and landmarks.**
   - **Fix:**
     - Make the skip link the first focusable element.
     - Wrap the top bar in `<header>`, and make the breadcrumb a labelled `nav`.
     - Add `aria-current` on navigation, and remove `aria-haspopup` from the menu button.
8. **Tap targets.**
   - **What happens:** Primary actions are 36 to 40 px. Toggles are 33 px, disclosure headings 28 px, and checkboxes 13 px. The only way into a batch on /propagation is a 13 px-tall link.
   - **Fix:** Add a `--tap: 44px` token under `pointer: coarse`.
9. **Short forms use placeholders as their only labels.** Three identical unlabelled date fields sit on the batch page. Use visible labels.
10. **Three toggle patterns.**
    - **What happens:** A `nav` with `aria-current` on buttons, `aria-pressed` buttons, and links with `aria-current="true"`. The cold-floor card is a button containing divs, with a 200-character name.
    - **Fix:** One toggle-group component, and a small °C/°F button.
11. **Design tokens.**
    - 26 font sizes in use, plus 12 corner radii, 10 card paddings, 5 button heights and 5 disclosure styles.
    - Two grey inks that cannot be told apart.
    - Seven classes for the same small uppercase label, and two meanings for the selected colour.
    - Undefined `--line` and `--warn`.
    - Consolidate them per the accessibility review's tables.

---

## Glossary (one user-facing word per concept)

| Use | Instead of |
|---|---|
| plant | accession |
| plant number | numbers given |
| batch | sowing, a propagation |
| place | location, stop, Where |
| your location | site |
| the reference | catalogue, corpus, dossier |
| care group | archetype |
| across the range | envelope |
| a typical spot in the range | typical cell |
| cold floor | 1st-percentile night, except in the "how" note |
| log entry | line, verb, timeline |
| your collection | change log, fold, snapshot |
| encrypted copy | vault, except on /formats |
| sync key | vault key |
| update | batch, for sync units, which collides with propagation batches |
| from a newer version of the app | this build |
| edits from a wrong clock | held, parked |
| not checked | refused, upstream |

Avoid "fold", "HLC", "dossier", "build", "bucket" and "set aside" in the interface.

---

## For the Show HN post (drafts in the copy review)

- **Title (recommended):** "Show HN: Habitat climate for 8,947 cacti and succulents, from open data". Link one winter-rainfall species page in the first comment, so the hemisphere shift shows.
- **First comment (about 285 words):** plain, first person.
  - What the reference derives and from where.
  - That no text on a species page is generated.
  - The hemisphere shift.
  - The tracker and its privacy.
  - Licences, and known gaps: Aloe is thin, and a cold floor describes a place, not a tested limit.
- **Answer before HN asks:**
  - Does anything cost money, now or later?
  - Was the code written with an AI assistant? One plain sentence, and the fact that species pages contain no generated text.
  - Why is Aloe capped at 9 species?

---

## What every review found sound

- **Search:** the postings give exactly the whole index's answer. Re-derived by proof, and over 2,800 adversarial queries across four alphabets.
- **Collection:**
  - The round-55 frontier.
  - `parkStamps`.
  - The snapshot's counter-with-the-tail.
  - `storeIn`.
- **Sync:**
  - The engine always sends what the server now requires.
  - Seals open only under their binding.
- **Server:**
  - CSP and headers.
  - The held-page cache key.
  - Manifest adoption.
  - The 409 path.
  - Errors are plain JSON with Retry-After.
- **Performance:** first paint about 270 ms locally, layout shift 0, no sideways scroll at 390 or 320 px.
- **Keyboard and screen reader:** the main menu and the plant card menu are fully keyboard-operable. Focus rings show on all of roughly 400 stops. Toasts and refusals are announced.
- **Day-to-day use:**
  - Watering is one tap with Undo.
  - The add form, "Save and add another", Move-here, audit and pot-up suit real benches.
  - Restore previews before it changes anything.
  - The site is consistently honest about what is missing.
