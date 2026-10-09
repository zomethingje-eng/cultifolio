# Visitor and words review, round sixty-one (`f4ab4f8`)

**Conclusion.** The visitor-facing pages hold up. The four new glance labels are on every surface. Ties name every month, the hemisphere is stated, the CHELSA caption is there, refusals and pending states are worded right, and the phone hero credit is visible. Every storage key and host on `/about/how` matches the code, in both directions. The about pages are mostly true of the code, but the merge left six sentences that are not:

- two on `/about/formats` about the clock: the HLC counter's length, and what happens to a change with no arrival;
- one on `/about/how` about common names;
- three small factual ones.

The new label "Warmest month, mean day" does not say exactly what its figure is. The printed label line still uses the names the round retired. No P0 or P1 found.

**How.** I read every sentence of the following, from the shared server at 1280×900 and 390×844 (Playwright, every `<details>` opened), and checked them against the code:

- the front page;
- the four fixture species pages;
- compare (four species, then pending + refused + ok);
- the share card (downloaded PNG, two species);
- `/about/how` (rendered, plus the source of its "Full detail" block);
- `/about/formats` (source);
- `/privacy`, `/offline`, `/no-such-page`, and four species 404s;
- the sample collection's plant pages (habitat lines) and its labels page (print media).

Other checks:

- **Phone hero credit:** `elementFromPoint` at three points on two species.
- **Links:** all 69 fragment links on nine pages resolve to an id.
- **Storage keys:** walked in both directions between `/about/how` and `src`.
- **Tests:** one test file with seven tests: six reproductions that fail on this commit and one guard that passes.

Screenshots: `/tmp/r61rev/out/shots/visitor/` (`d_*` desktop, `m_*` phone, `card-*`, `phone-hero-*`, `phone-chart-cinerea.png`, `first-*`, `sample_*`, `labels-print.png`).
Tests: `/tmp/r61rev/out/tests/visitor-words--about-claims.test.ts` (run from the repo root as `npx vitest run tests/unit/visitor-words--about-claims.test.ts`).

## Findings

### 1. P2, confirmed. `/about/formats` says a counter has six digits only past 65,535 changes in a millisecond, but every edit stamped past another has six

- **Where:** `src/routes/about/formats/+page.svelte:25`: "a hex counter of four digits (up to six, only when a millisecond holds more than 65,535 changes)". The same page, at line 77, says a marked stamp carries bit 0x800000 in its counter.
- **What the code does:** `hlcPast` (`src/lib/core/hlc.ts:337-341`) always writes `PAST_BIT | (count + 1)`. So any edit to a field whose stamp is ahead of the clock has a counter like `800002`. Six digits are therefore ordinary for edits made after a fast clock, not a once-in-never overflow. A reader writing their own parser from the first sentence would expect four digits and treat `800002` as corrupt or as an overflow. The page contradicts itself 50 lines apart. The comment at `hlc.ts:6-7` ("four digits, more only past 0xffff") is stale too.
- **Repro:** test 1. `hlcPast('1789520000000-0001-…', dev)` gives counter `800002`, and the sentence is still on the page.
- **Fix:** "a hex counter of four digits, or six: more than 65,535 changes in one millisecond, or an edit placed past another stamp, which sets bit 0x800000 (below)".

### 2. P2, confirmed in code (test). `/about/formats` says a change of this device's that has not been sent yet is held. The code neither holds nor parks it

- **Where:** `formats:76`: "a change with no arrival to judge it by (one read from a file, or not yet sent) is held, or, against a clock a sync server has confirmed, parked for that load only".
- **What the code does:** `isHeld` (`src/lib/core/log.ts:226-233`) returns false for this device's own stamps (`hold.except`). `isParked` (`log.ts:211-217`) returns false for them when there is no arrival. Both hold objects pass `except: this.device` (`collection.svelte.ts:99`, `engine.svelte.ts:419`). So the device's own changes, sent or not, are folded with no hold and no park. The same applies to its own backup file, since a file's changes have no arrival and carry this device's writer.
- **Repro:** test 2. A stamp three days ahead from device `a7f3c2c9d1e4`, with `except` set to it and `clockChecked: true`, gives `isHeld` false and `isParked` false.
- **Why it matters:** this paragraph is the one decision 1 rewrote. A reader concludes that a fast phone's unsent edits are held on that phone, when they show at once and are parked only after the listing.
- **Fix:** restore W's sentence: "A change this device made is never held, and is judged once its batch is listed; a change read from another device's file is held as a peer's is, …".
- **Related, P3, read:** the clock line on private pages (`src/routes/+layout.svelte:309`) still says "They still count" for this device's changes dated ahead. Since round sixty-one those changes are parked on every device, this one included, once their batch is listed more than two days before their stamp. So the line is true only until the next sync. Fix: "They count until they are synced; past that they are kept and offered with Apply."

### 3. P2, read. "Warmest month, mean day" is not the figure's own name; the figure is the month's mean daily high

- **Where:** `src/lib/ui/ref/Glance.svelte:79`, `share/card.ts:46`, compare's row, and `/about/how#top` ("the warmest month's mean day").
- **What the figure is:** the CHELSA `tasmax` monthly mean, the mean of the daily highs (`months[hot].tmax`). The grid also carries `tas`, the true mean temperature (`src/lib/climate/grid.ts:43`), and the season rule reads that one as "mean temperature" (`sheet.ts:193`, `tmean`).
- **The problem:** a climate-literate reader takes "mean day 22 °C" as a daily mean, which for cinerea's January would be about 19 °C (between the 22 °C high and the 16 °C low). Nothing on the site defines "mean day" or "mean night": the glossary has DLI, cold floor and convention, but not these. The chart's legend ("day", "night") and the table ("Day °C") inherit the ambiguity. The round's own rule was that the label is the figure's name, and this one needs a definition to be read right.
- **Fix:** "Warmest month, mean daily high" and "Coldest month, mean nightly low" (or "mean high" and "mean low"). Add one glossary line: "Day and night: CHELSA's monthly means of the daily maximum and minimum."

### 4. P2, confirmed. The printed label calls the cold floor "hab. night" and the open-sky light "sky"

- **Where:** `src/lib/core/note.ts:93` and `:98`. The print screenshot (`labels-print.png`) shows `cooler six months Nov–Apr · hab. night 6.5 °C · sky 30–65 DLI` for Copiapoa cinerea.
- **The problem:** the 6.5 °C is the 1st-percentile night, the figure the species page now names "Cold floor (1 night in 100)". On a label that stays in a pot for years, "hab. night 6.5 °C" reads as a typical habitat night, the very confusion visitor 1 was about. `/about/how#top` says "A plant's printed label carries three of these in one line: the season, the cold floor … and the open-sky light". The line carries them, but under other names.
- **Repro:** test 7 is a guard that documents the current wording.
- **Fix:** `floor 6.5 °C (1 in 100)` and `open sky 30–65 DLI`. Both fit the 6.2 pt two-line clamp at L7160 size.

### 5. P2, read. `/about/how` says every other English name "is listed and searched"; the species page lists at most four. Two of the rule's stated tie-breaks never apply

- **Where:** `how:36`: "The species page and the catalogue use the same rule, and every other English name is listed and searched."
- **Listing:** `src/routes/species/[slug]/+page.server.ts:136` takes `[common, ...commons].slice(0, 4)`, and the page joins those under the name (`+page.svelte:346`). A species with eight English names shows four; the other four are searchable but not listed anywhere a visitor can see.
- **Tie-breaks:** the rule as stated ends "then GBIF's own order, the shorter name and alphabetical order". In `englishNames` (`src/lib/dossier/index-entry.ts:102`), `at` (GBIF's order) is the index of each group's first entry, which is unique. So length and alphabetical order can never decide. That is harmless, but the page states a rule the code cannot apply.
- **Fix:** "every other English name is searched, and the first four are shown under the name". Drop "the shorter name and alphabetical order", or keep them only with "never reached".
- **Live check for the author:**
  ```
  curl -s 'https://cultifolio.com/api/search?q=jade%20plant' | jq '.[0] | {common, n: (.commons|length)}'
  ```
  A species with `n >= 4` shows the gap on its page.

### 6. P2, confirmed (test). The photo rule reads a year-only or month-only acquisition as its first day, a guess the formats page does not state

- **Where:** `src/lib/ui/photo-due.ts:28` compares `a.acquired` as a string with `halfYearAgo`.
- **What happens:** "2026" < "2026-04-07" and "2026-04" < "2026-04-07". So on 7 October 2026, a plant imported as "2026", whose record was made last week, counts as six months old with no photograph. It joins Today's "without a photograph in the last twelve months" and the list's chip.
- **What the page says:** `formats:64`: "a growing plant had six months or more, by its acquisition date". With a partial date, the code assumes the earliest day the date could mean (rule 3). This is the grower area's "Today's photo rule" too. I report it here because the sentence is in my pages.
- **Repro:** test 6.
- **Fix:** read a partial date as its latest day for this rule (`2026` as `2026-12-31`, `2026-04` as `2026-04-30`), or fall back to the record's own date. Say it in the sentence.

### 7. P3, confirmed (test). `/about/how` says 172 collector genera; the file it names lists 173

- **Where:** `how:38`, "of 172 collector genera (… the list is scripts/specialist-genera.txt in the source)".
- **What the file holds:** 173 distinct genus lines, no duplicates and no case variants (checked). The species 404 reads the same file (`+page.server.ts:6`).
- **Repro:** test 3.
- **Fix:** say 173, or have the page read the count from the file at build time.

### 8. P3, confirmed (test). `/about/how`'s short list says the edge keeps "two public answers"; its full detail lists three

- **Where:** `how:89` names a forecast and a catalogue search. The full detail (`how:94`) adds "a species address the backbone was asked about for a day". `synonyms.ts:74` does cache it, `public, max-age=86400`.
- **Repro:** test 4.
- **Fix:** "three public answers: a forecast for an hour, a catalogue search and an old-name check for a day".

### 9. P3, confirmed. "One care line say"

- **Where:** `src/routes/labels/+page.svelte:232`. The sample collection's labels page reads 'One care line say "climate pending"'.
- **Repro:** test 5, and `sample_labels.png`.
- **Fix:** `say` → `{n === 1 ? 'says' : 'say'}`.

### 10. P3, confirmed. The front page says "Chosen by rule" without stating the rule anywhere, and "This is what every species page shows" over a page that refused or pending species do not show

- **Where:** `src/routes/+page.svelte:735` and `:738`.
- **The rule:** it exists in `+page.server.ts:12-20` and `:55` (the most-recorded species of each of the 48 genera with the most species having eight photographs or more and a derived climate, rotated by day). No page states it; `/about/how` mentions the strip only for its photo hosts. A visitor who follows "how" finds nothing about it.
- **The heading:** "every species page shows" this block, but refusia and welwitschia show a refusal and a pending notice instead.
- **Fix:** add one sentence to `/about/how` (for example under "Which species are here") and link "by rule" to it. Make the heading "This is what a species page shows".

### 11. P3, read. The share card's footer names a band the card may not draw, and the card gives no reason when it has no floor

- **Footer:** `src/lib/share/card.ts:102` always prints "(band: 10th–90th percentile)", even when the legend says "one cell, so no spread" or "the cells agree within rounding" (`:98`).
- **No floor:** with no extremes, the card's cold figure says "{months}, not a floor · CHELSA". It drops the reason the glance row gives (`Glance.svelte:58`, "extremes not checked" / "not asked for" / "sea cell"). So a card from a species whose NASA POWER refused says nothing of the refusal (rule 2).
- **Fix:** add `g.hasBand ? ' (band: …)' : ''`, and carry `extremesStatus` into `CardInput` with the same `exWhy` words.

### 12. P3, read. Two held-call sentences

- **The species 404** (`+page.server.ts:77`) says an old-name check the site held back "was not checked: this site's calls to GBIF are used up for this minute". Rule 2's word for a held call is "not asked" (the forecast and the picker both use it).
- **The picker**, on a 429 hold, which means this address's part is used up, says "this site's calls to it are used up for this minute" (`SpeciesPicker.svelte:239-240`). That blames the whole site for one address's limit.
- **Fix:** "was not asked: …". In the picker, use the server's own `HELD_BACK_ADDRESS` text when the status is 429.

### 13. P3, confirmed. Compare drops a fourth species from a shared link without saying so

- **Where:** `src/routes/compare/+page.server.ts:12` (`.slice(0, 3)`).
- **What happens:** `/compare?s=copiapoa-cinerea,copiapoa-humilis,refusia-testii,welwitschia-mirabilis` shows three columns and no word about the fourth (`d_compare_*.png`).
- **Fix:** one line: "Three at a time; *Welwitschia mirabilis* was left out", with a swap link.

### 14. P3, confirmed. The fixture shows a first-time reviewer arithmetic that does not add up, and contradictory credits

- **Hemispheres:** on the checkout's `copiapoa-humilis` page: "These figures are across the 40 cells that remain: the 31 at least 10° south and the 6 within 10° of the equator". 31 + 6 is 37. The fixture (`fixtures/dossiers/s/v2/5384999.json`, `cells: 40`, `hemispheres: {north: 3, south: 31, equatorial: 6}`) also could not be produced by the rule: 3 < 0.2 × 34 (`provider.ts:184`). The real provider sets `cells` to the cells it used, so the live site is not affected.
- **Credits:** photo credits read "(c) grower1, some rights reserved (CC BY) · CC0" (an attribution string with one licence, a licence tag with another).
- Every outside reviewer reads this fixture first, so each of these costs a finding to rule out.
- **Fix:** set `cells: 37` and `north` to at least 7, and give the fixture photos attributions matching their licence.

### 15. P3, read. `/about/formats`: smaller sentences the code does not keep exactly

- **The label code**, "cut to 60 characters, never inside a character" (`formats:65`): `qr.ts:19` cuts by code point. A name typed with combining accents (an NFD paste from macOS) can lose its accent at the cut. Say "60 code points, never inside one".
- **The backup's ="…" rule** (`formats:59`) reads as a general promise ("text a spreadsheet would change into a number or a date"). `backup.ts:326` covers the listed shapes only. "3.12" (a date in many locales), "2026/01", "Aug 2017", "1:30" and "50%" are written bare and change on opening. Either say "these shapes:" or widen the regex.
- **The clock's lapse**, "within an open page any correction lapses when the device clock moves…" (`formats:74`): the code lapses only a non-zero one (`hlc.ts:117`, `offsetMs !== 0 && mono`). A clock confirmed with no correction keeps counting as confirmed after it is moved forward, until the next reading. That is harmless, but "any" is not what the code does.

### 16. P3, read. README

- **`SYNC_OPEN`:** the README says set it to `"0"` "to close new-vault creation". With `"0"`, a new vault is still created and still takes one of the address's five a day (`api/sync/vault/+server.ts:41-56`), with `entitlement: 'none'`. Every later request then gets 402 "this vault has no sync licence" (`sync.ts:244`). Say "new vaults are made but refused sync (402) until a licence is attached; existing vaults keep syncing".
- **The review documents:** the paragraph describes the `REVIEW-ROUND-*` files as "each finding as the reviewer put it". Since about round fifty-seven the findings live in `REVIEW-SELF-*`, `REVIEW-TRIAGE-*` and `docs/review-60/`, and `REVIEW-ROUND-61.md` is the round's account of its fixes. The README does not name those files. After the scrub the paragraph is accurate history but an incomplete map. One added sentence fixes it.
- The rest of the README is true of the code: every `npm run` script, file and path it names exists; the cookie paths, the 32 buckets, the 1981–2024 POWER series (`power.ts:11-12`) and "nothing preloaded on hover" for one's own pages all match. It reads well after the scrub, with no dangling references.

### 17. P3, confirmed or read. Polish

- **Glance gauges:** the rain and light bars are drawn on fixed, unstated scales (`Glance.svelte:80-81`: full at 1,200 mm and 70 DLI). They are `aria-hidden` and carry no axis, so a sighted reader sees "half full" with no meaning. Drop them, or state the scale in the card's sub-line.
- **Offline page:** "the ones you grow are usually here already" (`offline/+page.svelte`). Nothing caches a grown species' page unless it was opened (`service-worker.ts:177`). Say "the ones you have opened are here".
- **Phone search box:** the placeholder is cut at 390 px ("…by name, genus, fam"). A shorter placeholder fixes it: "Search species, genus, family…".
- **Phone chart:** the "lowest night" label and "COLD QUARTER" touch at 390 px (`phone-chart-cinerea.png`). This is W's open V22, still open.

## Checked and sound

- **The labels.**
  - "Cold floor (1 night in 100)" is literally the 1st percentile of every night in the series (`extremes.ts:68`). The record low printed beside it is the same series' minimum, "at a typical spot in the range".
  - "Rain a year" and "Open-sky light" match their figures and sources.
  - All four labels appear on the glance row (species and front page), on compare (with mixed-kind wording in code) and on the card. The card was rendered and read.
- **Ties.** "Jan and Feb" on glance, compare and card, and "January and February" in the chart's `<desc>` and the temperature card.
- **Hemispheres.**
  - The card says "habitat months, southern hemisphere"; the chart header and compare's season line say theirs.
  - The season card says "Northern hemisphere unless you set your site".
  - The plant page says "shifted to the north (no site set)".
- **CHELSA in the chart.** The figcaption reads "medians and 10th–90th percentile across 40 habitat cells, CHELSA".
- **Hero credit on a phone.** `elementFromPoint` at three points of the credit hits it on cinerea and welwitschia (box at y 55–80, 390×844).
- **Refusals and pending (rule 2).**
  - Refusia is "not checked" on every surface: the hero pills, cultivation, climate, habitat, evidence, photos, the genus summary (from the genus record's own `refused` status), the record box, compare's columns, and the provenance table with source and date.
  - Welwitschia is "pending" on the species page, compare, the plant page and the labels page; its provenance row says "not asked".
  - Humilis's "No openly licensed photograph on file" is right: both iNaturalist sources answered.
- **404s.** The plain 404 says "No page at /no-such-page."; the species 404 says GBIF was not checked and that the name is not on the list.
- **`/about/how` against the code.**
  - Every `cultifolio.*` key in `src` is named, and every key named exists, with the right storage (local or session).
  - `cultifolio-staging` is right for the grower's collection (`vault.ts:37`).
  - The cookie paths match: units on `/`, hemisphere on `/species` and `/compare`.
  - CSP `img-src` is the four named hosts and `connect-src` is `'self'`; `Referrer-Policy: no-referrer`; `pollInterval: 0`; hover preload is off on private routes (`+layout.svelte:63,314`).
  - The frost watch matches: 5-minute timer, 30-minute TTL, 10 s timeout, rounding to 0.01° and 10 m.
  - The DLI conversion 0.45 × 4.6 = 2.07; similar climate's weight of 9 is (3 °C)² per factor of e; "under a dozen" thin evidence.
  - The cap (600 a minute, a tenth per address, four tenths per /48) is held in `counters.ts:440-452`.
- **`/about/formats` against the code.**
  - The 503 refusal: kept when Retry-After is 60 s or more, capped at the hour, saved in the sync record (`engine.svelte.ts:603-610`, `:614-617`).
  - The 90-day reclaim's sentence is exact (`sync.ts:911`). The crossed recount answers 503 with `Retry-After: 30`.
  - Per-address limits: 600 and 3,000 per ten minutes, 5 vaults and 3 GB a day, ×4 for the /48.
  - Import dates (`csv.ts:220-270`): two-digit years only after a day and month and never with dashes, "Acquired (as written)", numbered by the year named.
  - Imported names are never sent to GBIF's name service.
  - The calendar: `RRULE` with `UNTIL`, `VALARM TRIGGER:PT9H`, 730 days ahead.
  - Spending is totalled per currency as written (`spend.ts`).
  - The QR name is cut at 60 code points, with controls and direction marks stripped.
  - The parking threshold of two days past arrival, the 0x800000 mark, the five-minute follow limit, the 30 s and two-day correction thresholds, the one-week expiry, and the five-minute slack all match `hlc.ts` and `log.ts`, apart from findings 1, 2 and 15.
- **Desktop front page order.** The grouping and climate chips sit above the 650 px feature, but a chip, a grouping or a typed search drops the feature on the server (`plain` in `+page.server.ts:61`). The first genus row then comes up at y 636 on 1280×800, so the chips do act on what is on screen.
- **Phone front page.** The first screen says what the site is (pitch, the three bullets, the sample offer), and the search box sits at y 541 on 390×844.
- **Links.** All 69 fragment links on the nine pages resolve.
- **The README** after the scrub: true and readable, apart from finding 16.

## Not covered

The 503 "Could not be read" page was read in `+error.svelte` but not triggered, since the fixture has no unreadable dossier. Mixed cold kinds on compare were read but not seen: no fixture species has a climate without extremes. Live common names need the live index (the command is in finding 5).
