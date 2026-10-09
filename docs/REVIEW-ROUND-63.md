# Round sixty-three

Round sixty-three closes every item left open after round sixty-two: the owner's findings on his phone after the deploy, round sixty-two's "Not done" list, and the "Deferred, with reasons" list of `docs/REVIEW-TRIAGE-61.md`. Each item is either built or closed as a decision whose reason is stated on the about pages. Seven agents worked in copies of one base, each owning its files: V (the visitor's first experience), N (names and search), C (climate, sitemap and credits), L (records and the clock), S (the server), U (fonts, print, accessibility and exports) and H (the harness). Their work was merged three-way with no conflicts. A reconciliation pass then brought the about pages into line with the merged code, and a backlog audit read every older parked item against the code (section 10). `FOLD_RULES` stays 7 and the device database stays version 4.

## 1. What the owner found on his phone

After round sixty-two's deploy the owner opened cultifolio.com in Safari on his iPhone, a browser that held no collection. He found three things:

- No catalogue row above the tab bar. Round sixty-two had measured its first-screen fix at 390 × 844, which is the iPhone's whole screen. Safari's page is about 390 × 664, as Playwright's own iPhone profiles say.
- A visitor's tab bar showed Species, Compare, My plants and About. The grower's Places, Propagation and Today were hidden from visitors in round sixty, because they opened on empty pages. A visitor therefore never learned what the app does, and could only find out by adding a plant first.
- A Compare tab that nobody uses.

His decisions:

- One tab bar for everyone.
- Compare and About move to the menu and the footer.
- An empty grower page shows itself working, on the example collection.
- The phone's first screen holds a whole row at Safari's real height.

## 2. The visitor's first experience (V)

- **The tab bar** is Species, My plants, Places, Propagation and Today on every device, with or without a collection, in or out of the example. Compare and About are in the menu and the footer on every page. Compare is also reached from the compare pill, as before.
- **The example collection.** "Sample" is now "example" in every word a person reads; code names, storage keys and `?left=sample` are unchanged.
  - **When it opens by itself.** Today, Places and Propagation, reached by a tab, a link or their address on a device whose own collection is empty, open the example collection on that same page. Empty means no plant, batch, followed species or place, no change held for this device's date or parked, and no sync key, read once the collection and the sync key have been read. Nothing opens the example while a restore, a merge, an import or a sync run is in progress.
  - **The bar says** "An example collection, so you can see what this page does. Your own starts when you add a plant." with "Add your first plant" and "Leave the example". For a grower with plants it says their own plants are kept apart, as they left them.
  - **The page decides once it has arrived.** A tab tap is the app's ordinary move, so a page with something typed on it asks first; the page it lands on opens the example, saying "Opening the example collection" meanwhile. The menu's "See the example collection" moves to Today first for the same reason. A load the page calls off leaves the tab outside the example.
  - **Leave** goes to the front page, never back to the page that opened the example (that would loop). It sets `cultifolio.sampleOut` for the tab.
  - **After a Leave, or where storage refuses the flag,** Today, Places and Propagation show their own empty state instead. That is one sentence on what the page does, then "See the example collection" and "Add your first plant".
  - **"Add your first plant"** leaves the example the same way, with the existing question when the visitor changed records in it, and lands on the add form in the visitor's own collection.
  - **Anyone can open the example from the menu,** a grower with plants too. Their own collection is untouched, and Leave returns them to it. This closes the deferred "sample offered only to a grower with no plants".
- **The welcome line** names what the app keeps: "Keep their record on this device: watering read against each species' habitat season, places, seed batches, frost warnings, labels." Its links are "See the example collection", "add your first plant" and "restore a backup".
- **The phone's first screen.**
  - **The photo strip** is drawn after the first three catalogue rows on a phone, as the feature already was on a desktop.
  - **Two more changes were needed.** On a phone, the pitch sentence waits while the welcome line is shown (the welcome line is the introduction then). The first letter heading, which sits right under the letter index naming it, is kept for screen readers but not drawn.
  - **Measured** in the harness with the live-shaped front page. "Row foot / tab bar" is the bottom of the first catalogue row against the top of the tab bar, in CSS pixels; a smaller first number means the row fits.

    | Page size | Row foot / tab bar, welcome shown | Row foot / tab bar, welcome dismissed |
    |---|---|---|
    | 390 × 664 | 469 / 607 | 467 / 607 |
    | 375 × 548 (iPhone SE) | 481 / 491 | 467 / 491 |
    | 360 × 640 | 489 / 583 | 487 / 583 |

    Six of the eight tests failed on the base. At 390 × 664, for example, the base's row foot was at 751 against a tab bar at 607.
- **Tests:** `r63v-first-screen` (8, tagged `@phone-only`), `r63v-visitor` (10), `r63v-example` (6 unit). Existing specs were updated where they asserted the visitor's four tabs or the sample's words.

## 3. Names and search (N)

- **A source's list of names is several names.** In the live corpus, 1,843 of 103,256 vernacular names contain a comma. Every one read was a list of alternatives, not an inverted form. Thunbergia alata's "Black eyed Susan vine, Black-eyed Susan, Black-eyed Susan clock vine, Bright eyes, Winged clockvine" is one example.
  - `englishNames` now splits on commas. Each part keeps the source's credit, and a source counts once per name.
  - Slash lists ("Horse/wild tamarind") are not split, because a slash often joins two adjectives. The audit after `--index` will show them.
- **A bare genus word is the headline only when there is nothing fuller** (the owner's decision). A single word that is the species' own genus, another genus of the corpus, or a word on `ENGLISH_USE` goes after every longer name. Aloe vera's headline becomes a longer name (in the fixture, "Barbados aloe"), and "Aloe" stays in `commons`. A bare word still outranks a set-back name (another genus's name or an older binomial).
- **"Aloe Verra" answered Drimia noctiflora.** The cause was not the hyphen. The typo pass read a species' places as well as its names: "aloe" is one letter from "Algeria" (Drimia's range), and "verra" is one letter from "vera" (in "Vera-duthiea"). A typo is now read against names only. Family and places match only as written. The two search paths still agree. The cache key moves from `search4` to `search5`.
- **Tests:** `r63n-names`, `r63n-search-near`. Three existing expectations changed, each because of a decision: two comma cases, and the round fifty-four near-pass query "hile", which became "ilver" since places are no longer typo-matched.

## 4. Climate, sitemap, credits and the builder's words (C)

- **The year's rain** is now the median of the range's cells' own yearly totals (`climate.annualRain.p50`), labelled "Rain a year (median across the range)". This closes the deferred "median of annual rain totals".
  - A dossier built before this keeps "Rain a year (sum of monthly medians)".
  - The rain rule, the growing-season rules and the sheet's rain row still read the median year's twelve months. "70% of the year's rain" has to be a share of the months it adds up. The sheet's row now names both figures.
  - It applies on the species page, the link preview, the compare page (like with like across columns), the share card, the front page's feature and the export (three new columns at the end of `species.csv`).
- **Sitemap dates per species.** Each dossier keeps `changed: { on, h }`: the day its substance last changed, and a fingerprint without the build's own times. A rebuild that changes nothing keeps the day. The index carries the day as a number, and the sitemap dates each species by it. A genus row takes the latest of its species' days.
- **Credits on tiles.** The index entry carries the thumbnail's credit, so a tile reads "Photo: CC BY, Jane Doe". The licence comes first because a phone's one-line credit is cut at about 25 characters, and the licence must survive the cut. Where the credit cannot be said short and true, the tile names the host as before.
  - The sheets carry the same credit. So the species photograph on a plant's page and on a batch's page now says whose it is: before, they said only "species photograph".
  - The index grows by about 0.5 MB raw (about 130 KB gzipped).
- **The builder's refusal details** are full clauses ("the occurrence source refused the request when this page was built"). Pages built from older dossiers read as before. The plant page's refusal sentence no longer repeats itself.
- **Tests:** `r63c-climate`, `r63c-sitemap`, `r63c-credit`, `r63c-refusal`, and `r63c-fallbacks` (e2e: every new field falls back on an old dossier).

## 5. Records and the clock (L)

- **A record of real time beside the stamp** (outside review B9). This closes the deferred item.
  - **The field.** Every change this device writes carries `w`, its corrected clock at writing. No fold, hold or park reads it, and the behaviour hash holds. The source hash is re-recorded under 7.
  - **Where it is read.** Wherever the app shows a change's time and the change is marked (placed past another stamp), it shows `w`. That covers the dates of notes replaced unseen, the number repair's note on a plant's and a batch's timeline, and the time a photograph's removal is sent to the server with (for a removal, the earlier of `w` and when this device first saw it, so a `w` from a peer whose clock ran ahead does not hold the server's bytes until that time).
  - **Two copies of one change** keep the earlier `w`.
  - **Backups.** A backup holding any `w` is format 3. Round sixty-two's restore would drop the field (valibot strips unknown keys), so it refuses a format-3 file with its "written by a newer Cultifolio" sentence. A round-sixty-two device's own backups may hold times it received by sync, and its restore leaves them off; only `w` is lost, and a later pull from a round-sixty-three device brings it back.
  - **Sync.** Batches need no new version: older builds keep the field on the wire and in their log.
  - **The trust limitation is closed as stated.** A key holder can mark any change, but already holds the whole collection.
- **"Renumber now" on two devices writes one note.** The repair's note id is derived from the record, the old number and the new number. Identical "Renumbered from" notes, such as one from an older build, are shown once. Removing the line removes its twins, and Undo brings them back.
- **The import follows the grower's own numbering** (round sixty's grower review, 10). When a sheet's numbers share one pattern (0001 to 0300, A001 to A095), a renumbered line takes the next number in that pattern. Otherwise it takes the collection's scheme, as before. The review says which.
  - **"Newest first" now orders numbers as numbers** (A95, A94, A77, A9).
  - **A search that is a plant's whole number lists that plant first.**
  - The finding's other two bullets were already fixed in round sixty-one, and are kept as guards.
- **Tests:** `r63l-records`, `r63l-vault-time`, `r63l-import-numbering`, `r63l-numbering` (e2e). 17 of the 22 unit tests failed on the base; the other 5 are guards.

## 6. The server (S)

- **A sweep of unnamed photograph bytes.** This closes round sixty-two's open item, with no `wrangler.jsonc` change.
  - **The mark.** Before a removal moves a photograph's pointer, or an upload stores a new generation of a removed photograph, the Worker writes a mark in the vault's counter object. If the mark cannot be written, the step waits.
  - **The sweep.** The vault object's midnight alarm looks at marked photographs only, 100 a run. It removes generations the pointer does not name once they are ten minutes old, with the same lease and give-once receipt as a removal.
  - **Cost.** Nothing for a vault with no removal or re-store since its last sweep. Otherwise, one read and one listing per marked photograph, once.
  - **What the sweep cannot see.** Bytes left before this deploy have no mark, so they still go at the photograph's next touch.
- **Many addresses spending a share.** This closes the deferred "distributed attack on the outside-call shares".
  - For the outside calls, an IPv4 /24 counts as one network, as an IPv6 /48 already did.
  - The last quarter of each share is kept each minute for networks new to it.
  - Spending a whole share in a minute now takes at least 77 networks, not ten addresses.
  - Refusals are still said as refusals: 503 "not asked", and a 429 naming the network.
- **An IPv6 /48 has a daily upload total of 12 GB,** four times one address's allowance.
- **Under a published corpus, an unreadable sheet file is refused (503).** On the base it was rebuilt from the live dossiers, and that path answered an empty bucket, which a device reads as "not in the reference".
- **Frost notifications: closed as a decision** (the owner's). The server would have to keep a push address and a location for each device. `/about/how` says so, and frost stays on Today and the frost line.
- **Two concurrent DELETEs undercounting** (round fifty-one): not reproduced with the counter object; ten concurrent removals keep the total exact. Checking it found a double take-off in the KV fallback, which production does not use; that is fixed.
- **Tests:** `r63s-unnamed-sweep`, `r63s-shares`, `r63s-net-bytes`, `r63s-concurrent-deletes`, `r63s-sheets-manifest`.

## 7. Fonts, print, accessibility and exports (U)

- **Windows' layout shift (0.107)** came from the monospace figures beside the front page's title, not from Segoe UI. Consolas is about 8% narrower than DM Mono, so the count fitted beside "Cultifolio" and wrapped under it when DM Mono arrived.
  - **The fix.** Fallback faces are now generated for Consolas, Menlo, Liberation and DejaVu (`scripts/dev/fallback-faces.mjs`, arithmetic in `theme.css`). Each sans and serif family also gets its own bold and italic faces.
  - **Measured.** With metric-identical open fonts under the Windows names, the front page went from 0.1066 to 0.0000.
  - **On the PC.** The font-swap test now runs on Windows and macOS too, and `r63u-fonts` checks every fallback face the machine has.
- **The link-preview image** is redrawn with the site's current words (`scripts/dev/og.html`, `og.mjs`), and `OG_ALT` matches it.
- **Printing.**
  - Every printable page was printed to PDF in Chromium in both themes and looked at. The label sheets were the paper's size and one page each.
  - **Fixed:** the dark theme printed near-white text on white paper, so paper now always takes the light theme. Sticky bars are static on paper. Cards have an outline instead of a shadow, since Firefox and Safari drop shadows. Cards and headings avoid page breaks.
  - The owner's manual check is in section 11.
- **A screen reader.** The accessibility tree of the main pages was read as VoiceOver would say it, and nine faults were fixed with attributes only:
  - chips' counts ran into their labels ("Due3");
  - each QR code was an unnamed image;
  - the climate chart was named by its whole key;
  - Today had a second "Today" region inside "Also today";
  - the "›" arrow and the "▾" triangle were spoken;
  - the front page's strip tiles said the species name twice;
  - the catalogue chips' counts ran into their labels too;
  - the page's language is now `en-GB`.

  The owner's VoiceOver check is in section 11.
- **Spreadsheet readings: closed as a decision.** LibreOffice shows a price of 12.50 as 12.5, and a spreadsheet shows a full date in its own short form. Both are the spreadsheet's reading of a plain CSV, and `/about/formats` says both. A month (`2017-08`) is written as `="2017-08"` and shows as written.
- **The large collection, re-measured: closed as acceptable.** 3,000 plants list in 1.2 s on the first load and 0.23 s after. The shells' inline CSS is 3 to 24.5 KB per page.

## 8. The harness (H)

- **The QA probes are removed** (the owner's decision). `tests/qa` had been stale since before round sixty-two.
- **Phones, Safari's engine and Firefox.**
  - A `phone` project (Chromium at Safari's iPhone page size, touch, Safari's user agent) runs the tests tagged `@phone` and `@phone-only` in the default run.
  - `webkit`, `phone-webkit` (the real iPhone profile) and `firefox` run when named: `node scripts/predeploy.mjs --browsers=all`, after a one-time `npx playwright install webkit firefox`.
  - Tests that need Chromium (CDP, a Chrome profile's text size, a layout-shift reading, `page.pdf`) are listed in `tests/e2e/helpers/engines.ts` or tagged `@chromium`. A guard unit test keeps the list true.
- **The watched flake (r61a a11y-perf 2).**
  - **Cause.** The run started at wrangler's open port, before the Worker could answer, and r61a has no warm-up of its own.
  - **Fix.** The config now waits for the front page's answer. Shown failing on the base with a 45 s held start, then 20 of 20.
- **The 200%-text tests on Windows.** Windows' bundled Chromium ignores the profile's text size, so those tests now set it through CDP when the profile did not take (`helpers/text-size.ts`). r61a a11y-perf 7 had most likely passed at 16 px on the PC and tested nothing.

## 9. Found at the merge

- **Undo of a removal was broken by the merge.**
  - **Symptom.** Undo, pressed after opening another plant, restored a record named by the plant's number, which is no record, so the plant stayed removed. Two e2e tests caught it.
  - **Cause.** The page's `id` is derived from the plant and falls back to the address once the plant is removed. The toast's Undo read it lazily. A new effect on the page made Svelte re-read the derived after removal.
  - **Fix.** The plant page and the batch page now read the record's id at the moment of removal.
- **The merge preview counted a removed plant's log entries as added timeline entries** (backlog audit, item 20, built here). They are now counted apart: "N timeline entries on removed plants or batches: kept, and shown on their pages only if they come back".
- **The replace's preview folds the device log once,** not twice: about 0.5 s saved at 5,000 plants. The confirm screen reuses the file's fold for the photographs without pixels: about 0.8 s more.
- **The replace itself is unchanged.** It writes four times per change, and each write guards stop-and-resume or another rule. The fake IndexedDB timing grows with the square of the log, so round fifty-two's "four minutes at 5,000 plants" can only be checked in a real browser (section 12).

## 10. The older backlog

Agent B read every item parked from round fifty to round sixty-two against the current code: 57 items.

- **20 were done since.** Examples: the fold snapshot, the build-time products and postings, buckets that scale, select mode, the Web Lock sync leader, the climate chart's "cold quarter" label and the concurrent-DELETE undercount.
- **6 are obsolete.** The code they were about is gone.
- **3 are closed by decisions that still hold.**
- **28 were open.**
  - **Built in this round:** the merge preview (section 9) and the replace's preview measurement.
  - **Build when a trigger happens:**

    | Item | Trigger |
    |---|---|
    | Per-device sequence numbers on the wire | A vault passes 10,000 batches, or R2 list operations show on the bill |
    | Pruning `order` | A grower's log passes about 200,000 changes |
    | `state` as a plain Map, with a slimmer snapshot | About 150,000 changes, or a load over two seconds on a mid-range phone |
    | The index off the Worker's heap | 50,000 species |
    | Content-addressed dossiers | The corpus is refreshed more than monthly |
    | The prune guard across two checkouts | A second operator or a CI job publishes |
    | A `base` on every field edit | A grower reports losing an edit to a field other than notes |
    | "Can I grow it here?" for a visitor | A site climate grid can be shipped to the device |
    | GBIF's title case in common names | The next `--index`, if the audit shows no proper noun touched |

  - **Closed:** the rest of the data-model list carried since round fifty-one. The `auto` rank, operation ids, an undo history, Kleppmann's move for places, atomic create, a photo inventory on the wire and propagation as reconciled operations are each covered, for every case they were meant for, by the smaller means built since, and none would change what a grower sees. Also closed: verifying product bytes, a scan button and a two-column catalogue.
  - **The origin view's maps.** Measure the live origin page's transfer size after the deploy (section 12). Build only if the maps are more than about a tenth of it; otherwise close.

## 11. The owner's manual checks (about 20 minutes)

**The phone's first screen.** On the iPhone in Safari, open cultifolio.com in a private tab:

- the search, the grouping controls and one whole catalogue row should be above the tab bar;
- the tab bar should read Species, My plants, Places, Propagation, Today;
- tapping Today should open the example collection on Today, with its bar;
- "Leave the example" goes to the front page, and Today then offers the example rather than opening it.

**Printing.**

- **iPhone, Safari.** Open Labels and pick three plants. Choose sheet Avery 5160 and Print 3 labels, then pinch the print preview open (that makes a PDF). Check that:
  - the paper is Letter (A4 for L7160);
  - there is one page, with no blank second one;
  - no web address or date is printed at the top or foot;
  - each QR code is a sharp black square;
  - the first label's top edge is 12.7 mm from the paper's top, and its left edge 4.8 mm from the left (L7160: 15.1 mm and 7.2 mm).

  Then print a species page with the dark theme on. Check that:
  - the text is black on white;
  - cards have a thin grey edge;
  - no tab bar shows at the foot of any page;
  - the climate chart is whole on one page.

  Open the sections you want on paper first: a closed section prints closed.
- **Windows, Firefox.** Print the same two pages with Ctrl+P, at Scale 100%, with "Print headers and footers" off and "Print backgrounds" off. Look for the same things.
- **A physical printer.** Print the 5160 sheet on plain paper at "Actual size" (never "Fit"). Lay it on an Avery 5160 sheet and hold both to the light: every label should be inside its outline, and the bottom row within 1 mm of its cell.

**VoiceOver on the iPhone.** Turn it on under Settings, Accessibility, VoiceOver, or with a triple-click of the side button. Swipe right for the next item, and double-tap to press. For headings, twist two fingers to choose Headings, then swipe down.

- **Front page:** "Skip to content, link" comes first. By heading, "Cultifolio, heading level 1". In the tab bar, "Species" says it is the current page.
- **My plants:** the chips say "Due, 3", not "Due3".
- **A plant:** double-tap Water and hear "Watering recorded". The button after Move is "More", with no triangle.
- **Labels:** each label is its number and name, with no "image".
- **A species page:** the chart is "Habitat climate of … through the year", said once.
- **Today:** under "Also today" there is no second "Today" landmark.
- **In the example:** "Example collection, landmark", then "Leave the example, button".

## 12. After the deploy

The round's code goes first: `npm run deploy`. Then the corpus, once, on the PC:

1. Zip `static\s\v2` somewhere safe (DEPLOY section 6).
2. `Copy-Item static\s\v2\index.json $env:TEMP\index-before-r63.json`
3. `npm run dossier -- static\s\v2\index.json --offline --grid climate --bulk bulk` (the rederive: the year's rain median, the full refusal clauses and the first sitemap stamps; one to two hours).
4. `npm run dossier -- --index` (a few minutes: the split common names, the headline rule, tile credits, sitemap days, the sheets with credits).
5. `npx tsx scripts/audit-common-names.ts static\s\v2\index.json --before $env:TEMP\index-before-r63.json --sample 40` (expect a few hundred changed headlines; read the sample).
6. The two `rclone copy` lines (DEPLOY section 2). Every dossier changes this once, so the upload carries the whole corpus.
7. `npm run live-check`

Then the live checks:

- `/api/search?q=Aloe%20Verra&n=3`: Aloe vera, without Drimia noctiflora.
- `/api/search?q=aloe%20vera&n=1`: a longer headline, with "Aloe" in `commons`.
- `/api/search?q=sago%20cycad&n=1`: Cycas revoluta.
- `/api/search?q=thunbergia%20alata&n=1`: its `commons` holds "Black-eyed Susan" on its own.
- A species page: "Rain a year (median across the range)".
- A front page tile: "Photo: CC BY, …".
- Per-species days: `curl.exe -s https://cultifolio.com/api/corpus` gives `id` and `buckets`; then `curl.exe -s "https://cultifolio.com/api/entries?b=00&n=<buckets>&c=<id>"` shows a `"changed":` number on each entry. After the rederive every species carries the same day, so `/sitemap-1.xml` cannot tell the new build from the old until a later fill changes some species.
- The origin view's size. In cmd, run `curl.exe -s -o NUL -w "%{size_download}" "https://cultifolio.com/?by=origin"`, then the same with `?by=genus`. If the origin page is more than about 10% larger than the genus page, the maps are worth moving out of the row data; otherwise that item closes.
- Optional, once: install WebKit and Firefox (`npx playwright install webkit firefox`) and run `node scripts/predeploy.mjs --browsers=all`. It is a survey, not a gate: these engines have never run the suite, so expect some test-side differences to sort through.
- The replace at 5,000 plants in a real browser can wait for a real collection that size.

A backup taken on this build carries format 3 once the device has written anything since the deploy, and a tab still running round sixty-two refuses it with "written by a newer Cultifolio" until it updates.

## 13. The verification review and the fix pass

Three fresh reviewers read the merged round as the next outside review would (R1 the visitor's experience and pages, R2 records, clock and corpus, R3 server and harness). Three fixers then closed every finding in the main checkout, each with a test that failed before its fix.

**R1, the visitor's experience.**
- **The one-load tab tap is dropped.** It was a full page load, so it skipped the pages' "you have unsaved work" questions: on an iPhone a half-typed first plant was lost without a word, and an import's review list in any browser. A tap is now the app's ordinary move, and the page decides when it arrives. A load into the example that a page calls off takes its flag back.
- **The example never opens while work is in progress.** A restore, merge or import holds it off, and so does a sync run. A device with sync set up, or with records held for its date or parked, is not empty. The backup page asks before an unload while it is storing.
- **Safari's back button.** A page restored from the back-forward cache into a tab whose mode changed reloads.
- **Smaller fixes:**
  - the menu's and the welcome's buttons say why they did not open the example;
  - the grower's own tiles carry the photograph's credit;
  - the hidden desktop strip fetches nothing on a phone;
  - the placeholder prints dark on paper;
  - the example is seeded under a Web Lock, with its "seeded" mark written after the seed.
- **Found on the way.** A full load of `/places#add` did not hydrate (older than this round), and is fixed.

**R2, records, clock and corpus.** Nothing in this area lost records or changed the fold.
- **The rain words.** The sheet and the plant page say "in the median year" wherever they give the median year's rain. The median's wording no longer claims a total some cell has: with an even number of cells it is the halfway point.
- **The import's numbering.**
  - An unpadded sheet (1 to 300, A9 to A95) is a pattern.
  - A Cultifolio export spanning several years is the collection's own scheme.
  - The review names the number the import truly carried on from.
  - A Qty line's further plants follow their line's scheme.
- **Removal timing.** A marked removal is dated by the earlier of its `w` and its first sighting, as round sixty-two dated it by its stamp.
- **The batch page** orders its lines by the dates it shows.

**R3, server and harness.**
- **Data loss, reproduced.** A pointer whose body failed to read once was taken as naming nothing, so the sweep would delete a revived photograph's live copy. An unreadable pointer is now never read as empty: the sweep keeps the mark and removes nothing, and a removal meeting one is asked to wait.
- **The reserve's refusal** has its own words, and the species page's GBIF line says only that the site held its call back.
- **A sheets refusal** is kept exactly the thirty seconds its Retry-After says.
- **`--project webkit`** brings the WebKit phone tests, and the script says it is not the full run.
- **The 200%-text tests** check the size on every page they measure.
- **The sweep** dates each hold when it is taken, and drops a mark it could not act on for seven nights (logged; nothing removed).
- **Shared networks.** `/about/how` says a grower on a carrier's or a university's network can be held back for others' calls, and is told so.

## 14. Runs

All runs were in the sandbox, on the merged code after the fix pass.

- **Type check:** 938 files, 0 errors, 0 warnings.
- **Unit tests:** 2,019 passing and 1 skipped, on 242 files.
- **The build** passes its bundle check: the layout's 27 chunks hold neither backup nor grow.
- **The strict browser run** (`CI_STRICT=1`, two workers, Chromium and the Chromium phone): 333 tests, 332 passing and 1 flaky.
  - The flaky test was r60 3, the tenth test of the run, on a cold server. A tick on the import review's place box did not take.
  - **Cause.** The review drew its rows, then read the number ledger across an await, then drew the numbering sentence above the place box, so the box moved.
  - **Fix.** The ledger is now read before the rows are set, so both are drawn together. After the fix the five import specs passed 38 of 38, and r60 3 passed 10 of 10 repeated.
- **Not run here:** WebKit and Firefox (not installed), and the PC's own strict run on Windows. The latter is the gate before the deploy.

Before the fix pass, the strict run had passed 325 of 326 with one flaky test: the new r63h phone test, which opened `/places` on an empty device and was carried into the example. It now opens with the device's own collection.

## 15. The deploy

Round sixty-three went up on 9 October 2026, commit `1cd6390`.
- **The strict run on the PC** (Chromium and the Chromium phone, two workers) passed 333 of 333 first time, with nothing flaky and nothing skipped. It ran the font-swap tests on Windows for the first time: the front page and the species page shift by less than 0.05 there now, against the 0.107 round sixty-two measured. The 200%-text tests ran too, where round sixty-two skipped two of them.
- **The deploy's own checks:** svelte-check found 0 errors, and the unit suite passed 2,019 with 1 skipped. The Worker is version `2a9cb93a-ec5b-4507-a272-0349989544e1`, and the live check passed 18 of 18.

**The corpus step.**
- **The offline rederive** built 8,947 species.
  - It made 2,103 requests to GBIF, which is by design: the download held occurrence sets for 7,540 species, and the rest go to the API path. One 429 was retried.
- **`--index`** wrote corpus `4208359789dbd5e6`: 32 buckets and 64 posting files.
- **The audit** against the index from before the round found 49 shown names changed, not the few hundred estimated.
  - **What the rules did:** a bare genus gave way to a fuller name (Aloe vera "Barbados aloe", Ficus benjamina "Weeping fig", Camellia japonica "Common camellia"), Dracaena trifasciata's seven-name string became "Snake plant", and Fraxinus pennsylvanica became "Green ash".
  - **What went wrong:** about a dozen were case flips the other way ("China Aster", "Red-osier Dogwood", "Sensitive Fern"). Splitting the lists had given Title Case spellings more sources, and a name's spelling was chosen by count.
- **The upload** carried 9,013 files (290 MB), and the live check passed 18 of 18.

**The case fix, in two passes.**
- **The first pass** (commit `4e9e65e`, Worker `e4da8e00-c3c4-45c7-bccc-144a18018193`, corpus `c35211b17e4ea414`) counted spellings that differ only in capitals together and showed the one with the fewest capitals. It set a spelling all in lower case aside whenever another had a capital, meaning to protect proper nouns. Its audit changed 539 headlines, and about half went the wrong way ("Butterfly Milkweed", "Snow-On-The-Mountain", "Desert-Rose"): the lower-case spelling was often the one most sources gave, and setting it aside handed the name to a Title Case list. That corpus went live and is replaced by the second pass.
- **The second pass.**
  - **The rule.** Spellings that differ only in capitals still count together. The one shown keeps the capitals some source gave on purpose and no others. A capital counts as meant when its spelling leaves another word in lower case ("herb Robert"); Title Case and all-lower-case spellings say nothing either way. Hyphenated words count as one word for that test, so "Red-osier Dogwood" is Title Case.
  - **Between other spellings.** Where spellings differ otherwise (a hyphen, a space), the one more sources give is still shown, now with its capital variants' sources pooled.
  - **Checked on the real names before the deploy.** Every dossier's names were extracted on the PC and run through round sixty-two's rule, this round's first rule, the first pass and the second pass in the sandbox. The harness reproduced the PC's audit exactly (539 between the first rule and the first pass). Against round sixty-two, the second pass changes 555 headlines:
    - 449 in capitals only. 447 of those have fewer capitals ("Common Milkweed" becomes "Common milkweed", "Large-Leaved Lime" becomes "Large-leaved lime"), and 2 keep a proper noun a source meant ("White Egyptian lotus", "Cape Province pygmyweed").
    - 72 between a hyphen and a space, by pooled sources ("Maidenhair tree", "Spider plant", "Swiss cheese plant").
    - 34 from the round's two rules (a bare genus giving way, the lists split).
  - **What it does not change.** Where no source gives a name in lower case, it stays as written ("Tenerife Aeonium"), since nothing is invented. A source's misspelling winning on count ("Raffle's Pitcher") is beyond any rule.
  - **Tests.** `r63z-name-case` has 8 cases; the second pass's 3 new ones failed on the first pass. `r62q-common-names` now expects "Japanese privet" where round sixty-two showed "Japanese Privet" by count.
