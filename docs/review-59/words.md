# Round 59 review: words

Scope: every user-visible sentence, against rules 1 to 4 and against the code. Method: read every template in `sheet.ts`, `note.ts`, `extremes.ts`, `climograph.ts`, `Climograph.svelte`, the species page and compare; generated the text for 21 synthetic dossiers (southern, equatorial, no rain, fog, fog with a flat curve, monsoon, frost every night, never frost, a spread year, an even year, refused, pending and none climates, a sea cell, refused extremes, archetype-raised floors with and without extremes, a null latitude, US units, a southern reader) by calling `cultivationSheet`, `generatedNote`, `careLine` and `climograph` under tsx (`/tmp/review59/words/gen.ts`, output in `gen.out`, edge cases in `edge2.txt`); captured the rendered text of every public page and, with a seeded collection, every private page from the shared server (`pages.mjs`, `txt/`); reproduced two private-page cases in Playwright (`hemi.mjs`, `err.mjs`). The live site is not reachable from here, so which live species carry the archetype findings (1) could not be counted.

## Findings

### 1. P1. The archetype table puts terrestrial, frost-hardy plants in groups with tropical minima, and the sheet then raises their cold floor and calls the genus "reliably one kind of plant" (confirmed by generation)
- **Where:** `src/lib/core/arch-tables.json:262,266` (Dyckia, Puya under `epiphyte`), `:213` (Bletilla under `orchid`), `:462` (all of Bromeliaceae under `epiphyte`); `src/lib/core/arch.ts:27-29` (minima 13, 10, 5 °C); `sheet.ts:229-231`; `/about/how` line 64.
- **What the page says** (generated, metric):
  - Puya with a -3.0 °C coldest mean night: "Cold floor: 10 °C. ... the archetype table's conventional minimum for an other epiphyte (grouped by the genus Puya, which is reliably one kind of plant) is 10 °C, which is higher, and the floor rule takes the higher."
  - Dyckia with a -1.0 °C 1st-percentile night and 30 frost nights: "Cold floor 10 °C, the conventional minimum for an other epiphyte".
  - `archFor('Deuterocohnia brevifolia','Bromeliaceae')` (in `names.txt`) gives "Other epiphyte", 10 °C, "Bromeliaceae, which is usually but not always one kind of plant"; Hechtia the same.
  - Bletilla striata: "Cold floor 13 °C, the conventional minimum for an orchid; at the habitat one night in a hundred is colder than -6.0 °C."
  - With a place floor set, the species page's place line then tells the grower their greenhouse is "under this species' cold floor".
- **What should be true:**
  - `/about/how` says "Where a family splits between archetypes and the genus is not on the table, the app guesses nothing". Bromeliaceae splits (Tillandsia against Dyckia, Puya, Hechtia, Deuterocohnia) and is guessed.
  - The 13/12/10/5 °C minima have no source beyond "conventional", while the species page footer says "Every figure here is derived from public data by a stated rule". Rule 1 asks for a source.
- **Smallest fix:**
  - Move Dyckia, Puya, Hechtia, Deuterocohnia and Encholirium out of `epiphyte`.
  - Drop Bromeliaceae from the family table, so the app guesses nothing there, as `/about/how` says.
  - Take hardy terrestrial orchids (Bletilla, Calanthe) off the orchid list.
  - Cite a source for each minimum on `/about/how`, or say on the page that the table is the author's.

### 2. P1. Today reads the months for the wrong hemisphere for a grower whose places have coordinates but who has set no site (confirmed)
- **Where:** `src/routes/today/+page.svelte:94` uses `forReader(year, site.current?.lat ?? null)`. The species page (`species/[slug]/+page.svelte:154`), the labels (`labels/+page.svelte:164`) and the plant page fall back to the first place with coordinates.
- **Reproduction:** seed a collection, give "Laundry room" lat -33.9, back-date two Copiapoa plants' last watering to 2026-08-01, set no site. On 2026-10-04:
  - Today lists both under "Outside the cooler six months the species sheet names" with "Water these 2".
  - The species page says "the cooler six months are May to October ... Months for the southern hemisphere, from your places".
  - The labels print "cooler six months May–Oct".
  - October is inside the cooler six months. Today puts it outside.
- **Fix:** the same reader latitude everywhere: site, else the first place with coordinates. Better, one exported helper.

### 3. P1. The launch draft's prepared replies contradict the app (read)
- **Where:** the launch draft.
- **Line 47:** "the page says what it is: the habitat's coldest night on record at the typical cell". The cold floor is the 1st-percentile night (`sheet.ts:216`). The coldest night on record is `minAbs`, a different figure the page prints separately.
- **Line 47:** "Cultivation advice is derived by rule from the figures". The sheet's own header says nothing on it says "what to do to it", and `/about/how` says "No row says what a plant does, wants or tolerates". A commenter will quote both.
- **Line 51:** "The record map shows every record used." The map shows only openly licensed records. Copiapoa cinerea's page says "the map shows only the 52 openly licensed ones" of 352.
- **Line 21:** "forty years of frost nights and extremes from NASA POWER". The series is 1981–2024 (`power.ts:11-12`), 44 years.
- **Title candidate 2:** "habitat climate and cultivation sheets for 8,900 species". This is the overclaim the front page fixed in round 59: pending, refused and none species have no climate.
- **Fix:** correct each sentence: "the 1st-percentile night ... the page prints the record low beside it"; "the sheet states the figures and two fixed rules, and no advice"; "the map shows every openly licensed record used; the rest are counted"; "44 years".

### 4. P1. The species page's meta description says the climate suggests cultivation (confirmed)
- **Where:** `species/[slug]/+page.svelte:41`.
- **What the page says:** `/species/copiapoa-humilis` (no Wikipedia summary) has description and og:description "Copiapoa humilis, Cactaceae: native range, habitat climate and the cultivation it suggests, each with its source." On the live corpus this is every species with a climate and no summary. It is the snippet a search engine and a link preview show.
- **What it should say:** rule 1 and the sheet's own principle forbid saying what the plant wants.
- **Fix:** "native range, habitat climate and two rules' reading of it".

### 5. P1. A vault refused past the ceiling in all is told "push failed: 503", and `/about/formats` describes a refusal that no longer happens (read)
- **What the server does:** round 59 moved the ceiling in all to the first stored object (`admitVault`, `sync.ts:739-755`). Creation succeeds; the first upload gets 503 with "Sync is not taking new vaults for now, and this vault holds nothing yet. Your collection stays on this device." and Retry-After 86400.
- **What the device shows:** the engine handles only 429, 400, 409, 413 and 507 on a push. It throws `push failed: 503` (`engine.svelte.ts:682`, or `photo push failed: 503` at :627). The Status card shows "Not synced / push failed: 503" and drops the server's sentence and its Retry-After.
- **What `/about/formats` says:** "past either the answer to a creation is 503 with a sentence saying so ... and the sync page shows the sentence as it is". This is no longer how the ceiling in all is refused.
- **Fix:**
  - On any 503 with a JSON `error`, show that sentence and honour Retry-After.
  - Reword the formats paragraph: "past the ceiling in all, a vault's first upload is refused with 503 and a sentence".

### 6. P2. "an other epiphyte", "an orchid group minimum" (confirmed)
- **Where:** `aLabel` (`arch.ts:62`) prefixes an article. The results:
  - "Grouped as an other epiphyte by the genus Rhipsalis" (In short).
  - "archetype minimum for an other epiphyte, above the 5.0 °C habitat night".
  - The glance card "minimum for an other epiphyte, archetype table".
  - The share card `${fl.group} group minimum` (`share/card.ts:42`), which renders "an orchid group minimum".
- **Fix:** rename the label "Epiphyte (other)", or pass the bare label where an article does not belong.

### 7. P2. The Seasons one-liner repeats the months for every reader on the habitat's side of the equator (confirmed)
- **Where:** `sheet.ts:295` appends `(${at} at the habitat, ${home})` whenever the year is shiftable, even when the months are the same.
- **Generated:** "Rain rule: a summer growing season, July to September in the northern hemisphere (July to September at the habitat, northern)." The southern-reader case reads the same, with southern months.
- **Where it shows:** this short is the Seasons card's summary line (`species/[slug]/+page.svelte:424`), compare's Seasons row and the note's text. `lead` already guards with `reader !== at`.
- **Fix:** the same guard in `short`.

### 8. P2. Habitats within 10° of the equator: a doubled word, and a claim the figures on the same card contradict (confirmed)
- **Where:** `sheet.ts:265`.
- **Generated (lat 5, a curve that moves 8.0 °C):** "Months are the habitat's, northern hemisphere, within 10° of the equator; with no thermal season there there is no season to reverse".
- **What is wrong:**
  - "there there" is a doubled word.
  - "no thermal season" is asserted for an 8 °C curve. The rule only tested the latitude.
- **Related wording:**
  - The card's "How this is read" says "Months are shifted for the other hemisphere only where the temperature curve gives a season to reverse" and omits the 10° condition the code applies (`sheet.ts:193`).
  - The plant page says "not shifted: no thermal season to reverse" (`plants/[acc]/+page.svelte:156`).
- **Fix:**
  - "within 10° of the equator, where the shift rule does not apply, so they are not shifted".
  - Add "or the habitat lies within 10° of the equator" to the why line.

### 9. P2. A raised floor without extremes makes an unreadable sentence (confirmed)
- **Where:** `sheet.ts:222,231`.
- **Generated:** "Cold floor: 10 °C. The habitat figure, the coldest month's mean night, August, in the median year (CHELSA); the daily extremes were not checked (NASA POWER did not answer when this page was built), is -3.0 °C; the archetype table's conventional minimum ...".
- **What is wrong:** the `quantity` string carries its own semicolon clause into an appositive, and the sentence loses its verb.
- **Fix:** put the extremes clause in its own sentence after the figure.

### 10. P2. The front page counts a pending climate as "not checked" (confirmed)
- **Where:** `src/lib/dossier/catalogue.ts:174` counts `refused` and `pending` together; the row prints `{r.notChecked} not checked` (`+page.svelte:654`).
- **What shows:** Welwitschia's genus row reads "1 species · 0 with climate · 1 not checked". Its species page says "Climate pending", and the labels say "climate pending".
- **What should happen:** round fifty-two separated the two, and rule 2 works both ways: pending is not a refusal.
- **Fix:** count them apart: "1 pending", "1 not checked".

### 11. P2. Settings says the server learns nothing when reference photographs are on; the plants list asks it for buckets (read)
- **What Settings says:** "On, the photograph comes straight from iNaturalist ... Cultifolio's server is not involved and learns nothing" (`settings/+page.svelte:200`).
- **What the code does:** with the preference on, `/plants` calls `entriesFor(slugs)` (`plants/+page.svelte:98-100`), which requests `/api/entries?b=…`. The plants list's own offer says so: "This site is asked for the hash groups your species fall in".
- **Fix:** "Cultifolio's server is asked only for the hash groups your species fall in, as your plant pages already ask".

### 12. P2. `/about/formats` does not state round 59's clock rules (read)
- **Where:** formats, the paragraph from "A change stamped more than two days past its batch's arrival" (line 49).
- **What the code does:**
  - Parking by the clock happens only when the clock has been confirmed by the server (`log.ts:199`, `clockChecked`). Before that, a device's own changes fold.
  - The clock test applies to every change without an arrival, including changes restored from another device's file. Formats says "for a change made on this device".
  - The "clock reads earlier than its last change" state, which acts on nothing, is not described either.
- **Rule:** rule 4 says formats states every rule. A second implementation following formats would park what this one folds.
- **Fix:** one sentence each: "without an arrival (a change made here or read from a file), a change is parked by the clock only once the clock has been confirmed by a sync answer within the past week; before that it folds".

### 13. P2. The share card keeps two wordings round 59 fixed elsewhere (read)
- **Where:** `src/lib/share/card.ts:44-45`.
- **The light row:** "mol/m²/day, winter to summer", the wording compare dropped for "lowest to highest month".
- **The rain row:** "no month over 25 mm (1 in)" for a count of months at 25 mm or more (`:35`, `>= 25`). 25 mm is 0.98 in; the species page prints "0.98 in (25 mm)".
- **Fix:** "lowest to highest month"; "of 25 mm or more"; drop "(1 in)" or use `ruleRain(25, u)`.

### 14. P2. The glance cards print habitat months beside In short's reader months, unlabelled (confirmed)
- **What a northern reader sees** on `/species/copiapoa-cinerea`:
  - "WARMEST MONTH 22°C Jan mean day · CHELSA".
  - Directly under it: "the cooler six months are November to April (May to October at the habitat)".
- **Why it misleads:** January sits inside the cooler six months on the same screen. The glance and compare rows ("Jan, mean day (CHELSA)") are habitat calendar months and say nothing of it. The Rain row does say "habitat calendar, southern hemisphere".
- **Fix:** "Jan at the habitat" on the glance cards and compare rows.

### 15. P2. Sync errors reach the grower as internal strings (read)
- **Where:** `engine.svelte.ts:627,682,724,730,883,890,973,822`.
- **What the grower sees:** these become `lastError` or `clockAhead` and are printed as the Status card's sub-line or a paragraph:
  - "push failed: 400"
  - "batch 0001791144…-0000-db19070a10f8-1a2b3c4d5e6f: 404"
  - "photo pmuu…: 404"
  - "pixels do not match the record"
  - "not a batch this version understands"
  - "photo pmuu… removal: 403 (tried again next time)"
  - "the cursor stays before it, so listings are longer until that is sorted out"
- **What they could say instead:**
  - "The server refused a change from this device (400); it is kept here."
  - "A batch listed on the server could not be fetched; tried again next sync."
  - "A photograph arrived damaged and was not kept; tried again next sync."
  - "The server's clock is ahead; syncing works, a little slower, until it is put right."

### 16. P2. "Vault" and "batch" each mean two things on the private pages (read)
- **The local storage called a vault:** "The browser closed the vault; reload the page." (`db/vault.ts:127`) means the device's IndexedDB. The glossary defines a vault as the encrypted copy on the server, so a grower reads this as a server problem. Fix: "The browser closed this page's storage; reload the page."
- **Settings without sync:** "numbering is a setting of your vault and syncs" (`settings/+page.svelte:128`) shows even with sync off. Fix: "numbering is part of your collection and syncs with it".
- **Two batches in one notice:** `WaitingRecord.svelte:27` for a propagation batch reads "A batch from a newer version of the app, which could not be read here ..., may hold it ... Until then the batch is not listed." The first is a sync batch, the second a sowing. Fix: call the sync unit "a sync batch" (the glossary's own term) everywhere on the sync page and in notices.
- **Plant number:** "Accession number 2026-0004 is already used" (`collection.svelte.ts:1398`) where every page says "plant number".

### 17. P2. Three sentences say nothing leaves the device (confirmed text)
- **The sentences:**
  - Front page: "Keep a record of your plants on this device; nothing leaves it." (`+page.svelte:584`).
  - Settings: "Your collection lives in this browser and nowhere else."
  - Sync, not configured: "Your collection is on this device only".
- **What is true:** `/about/how` lists what leaves: hash groups, the frost watch's coordinates, the picker's names. With sync on, the collection is also in the vault.
- **Fix:** "it stays on this device unless you turn on sync" for the first two, which the footer already does.

### 18. P2. `/about/how` calls its list of device-side storage whole; it is not (read)
- **What it says:** "Two more things the device keeps outside the collection, so the list above is whole: a correction to its clock ... and the place you last used on the Add form."
- **What `localStorage` also holds:**
  - `cultifolio.frost.site` (the site's coordinates and name, unrounded)
  - `cultifolio.prefs`, `cultifolio.theme`
  - `cultifolio.compare` (species names)
  - `cultifolio.visits`, `cultifolio.lastVisit`, `cultifolio.installSnoozedUntil`
  - `cultifolio.corpus`, `cultifolio.labels`
  - `cultifolio.lastSowLocation`, `cultifolio.countMode`
  - `cultifolio.clockPending`
- **Fix:** list them, or drop "so the list above is whole".

### 19. P2. The map caption says the climate used every in-range record's cell (read)
- **What the caption says:** "the climate was read across every in-range record's cell, not at the marker" (`species/[slug]/+page.svelte:501`).
- **What the page also says:** the evidence line on the same page says the climate rests on "the N of them placed to within 10 km". Vague records "stay on the map but off the climate", and sea cells are left out.
- **Fix:** "across the cells of the in-range records placed well enough to read one".

### 20. P3. Smaller sentence-level slips (confirmed by generation or capture unless marked)
- **The In short footer** says "Months for the northern hemisphere ..., the habitat's own alongside" for a flat or equatorial year whose lead says "(the habitat's months, not shifted)", and for a "no season to read" year that names no months.
- **"A sharp rainy season"** is said of a seven-month, two-run wet season ("April to June and August to November"). The rule only established fewer than eight months.
- **Ties are named as one month:**
  - "wettest January at 0 mm, driest January at 0 mm" (no rain).
  - "driest January at 0 mm" when seven months are 0.
  - The climograph's "the wettest month Jan" when all months are equal.
  - Say "driest months (n at 0 mm)" or name none on a tie.
- **"16071 frost nights in 44 years, 365.3 a year"**: no thousands separator (rain uses "1,010 mm"), and a rate above 365.
- **US units: "bottom heat is 5 to 45 °C"** is told to a °F grower (`units.ts:85`).
- **Double brackets and a doubled source:**
  - "7 months under 0.20 in (5 mm) (median year ...)".
  - "Under 4.7 in (120 mm) of rain a year (3.2 in)".
  - "CHELSA monthly means, median year across the grid cells of the range, CHELSA."
- **The climograph** says "the three months around the coldest night"; `/about/how` and the rule say "coldest mean night".
- **Today, no site set:** "the places above are watched on their own pages either way" names no places above (`today/+page.svelte:216`).
- **The 404** ends without a full stop: "...was not checked: GBIF's name service did not answer".
- **Refusia's description:** "Refusia testii, Testaceae: native range, each with its source."
- **"Wild records"** heads in-range records the rule did not test for wildness. the launch draft says "every georeferenced wild record".
- **`/about/how`:**
  - "A species page ends with the six species" (Related is followed by Names and The record).
  - The archetype names "epiphyte", "fern" differ from the labels "Other epiphyte", "Fern or moss".
  - The glossary's "Refused" is a word the pages never show (they say "not checked").
- **`/about/formats`:**
  - "two devices that mint the same number offline end up with two plants, one of them renumbered and told so" implies an automatic repair the next sentence says waits for the grower.
  - The /48 counts are not mentioned.
- **README:**
  - "KV for small counters" omits the Durable Object that now holds bytes and vault counts.
  - `src/lib/db/` is "the local vault".
  - "a units cookie and a one-letter hemisphere cookie on species pages" (the units cookie goes with every request).
- **Provenance** prints raw source keys and statuses ("gbif.occurrences ... api.gbif.org 429").

### 21. P3. House style
- **Apostrophes and quotes:** 19 curly ’ against about 150 straight ' in the captured text ("This species’ habitat figures" against "this species' cold floor" on the same page). Quotes mix “nothing to report” with "not checked".
- **One figure, two forms:** "1 night in 100 is colder" (glance) against "one night in a hundred" (In short, place line).
- **"yrs" against "years"** in one compare cell: "1st-percentile night over 40 yrs; ... no frost in 40 years".
- **Percent:** "RH 78 %" (climograph) against "78%" (sheet).
- **Dates:** ISO in logs and Today ("sown 2026-10-04"), "Added 4 Oct 2026" on the plant page, and browser-locale `toLocaleString()` in the clock bar and the sync clock warning (seconds included in the latter).
- **Toasts end with and without a stop:** "Watered 3." against "Watering recorded", "Place cleared", "3 plants added", "Archived, and logged". The same act is worded four ways: "Watered 3.", "2026-0001 watered.", "Watering recorded", "Watered 3 plants."
- **Compare's overlay ticks in °F** are 41°, 50°, 59°, 68°, 77° (5 °C steps converted). Step in °F as the climograph does.
- **Place form errors** inherit the labels' uppercase ("7D IS NOT A WHOLE NUMBER OF DAYS FROM 1 TO 365"), while the summary line under the form is in sentence case.
- **Counts:** sync progress counts have no thousands separator ("Sending 1200 of 3400 changes…").

## Checked and sound

- **Rule 2 wording on the species page:**
  - "Not checked" for refused climate, occurrences, photographs, Wikipedia (species and genus) and OpenAlex, each with "not a statement that none exist".
  - "Pending" kept apart on the page and the labels.
  - The 404's "was not checked: GBIF's name service did not answer".
- **Units:**
  - Every sheet sentence, the place line's difference (`deltaT`) and compare's rule thresholds ("3.6 °F (2 °C)", "0.39 in (10 mm)") convert correctly.
  - "Shown in Fahrenheit and inches; the sources measure in °C and mm" appears in US mode.
- **Hemisphere on the species page and labels:**
  - Months shift for a southern reader and the footer says "from your places".
  - The fog, monsoon, south and spread cases print the right months both ways.
- **The In short rewrites of round 59** read as their rules: "Under 120 mm of rain a year", "No rainy season: 70% of the rain takes N months", "N months under 5 mm", "Cold floor X: one night in a hundred at a typical spot in the range is colder". So do the evidence line without a cause, "Records" when the range is untested, and compare's "lowest to highest month".
- **`frostWording`** for 0, fewer than the years, and more.
- **The climograph's descriptions** in dry and flat years, US ticks, and the plural of cells.
- **`/about/how` checked against code and sound:**
  - The rate buckets and the /48 set (forecast, names, match, search, searchmiss, reference).
  - The two-day sweep, and both cookies with their paths (units on `/`, hemisphere on `/species` and `/compare`).
  - The frost watch's rounding (2 decimals, 10 m), half-hour cache and session storage.
  - The picker's `/api/names` proxy, and the bucket-only plant-page lookups (`sheetForName`).
  - Three land cells minimum, up to eleven further candidates within 2 °C, the climate-distance rule and weights.
- **`/about/formats` checked against code and sound:**
  - The sync limits (5 vaults, 3 GB a day, 600 and 3,000 per ten minutes, 2 GB vault).
  - The clock constants (30 s, two days with two readings a minute apart, a week's lapse, five minutes ahead, two days to park).
  - Every field list against `FIELD_TYPES`.
  - The `zz` repair writer.
- **og.png and the front page's sentence** both qualify climate and sync as round 59 says.
- **Pages loaded:** the public pages load only from the server itself and `inaturalist-open-data.s3.amazonaws.com` on the fixture corpus.
