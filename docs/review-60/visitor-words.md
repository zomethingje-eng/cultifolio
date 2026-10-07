# Round 60 review: visitor and words

The public pages hold up well. One thing is broken, though: the new grower labels say more than their figures, and they do it on the front page, the species page, compare and the share card. On a phone, the credit on a species page's hero photograph is completely hidden. Two of round sixty's "fixed" claims do not hold: ties and the share card's hemisphere. Below are 22 findings: four at P1, the rest P2 and P3. There is no P0.

**What I covered and how**

- **Screenshots.** 16 public addresses at 390×844 (isMobile, touch) and 1280×900, in four theme modes. `prefers-color-scheme` light and dark: 64 first-screen shots and 64 full-page shots. `localStorage cultifolio.theme` dark over a light system, and light over a dark one: 12 shots on `/`, a species page and `/about/how`. They are all in `/tmp/r60rev/out/shots/visitor/` and I looked at each one I cite.
- **Test script.** `shots.mjs`, with the page text saved to `/tmp/r60rev/vw/txt/`.
- **Generated sentences.** I generated every template, using the real functions under tsx (`/tmp/r60rev/vw/gen.ts`, 1,902 lines of output in `gen.out`). The functions: `cultivationSheet`, `generatedNote`, `careLine`, `seasonStrip`, `speciesTitle`, `speciesDescription`, `climograph().alt` and its edge labels, and the text of `climateCardSvg`. There were 27 synthetic dossiers, each in metric and US units, for a northern and a southern reader. The cases:
  - south and north habitats, and equatorial;
  - fog, a flat curve, spread rain, monsoon, an "even" year, and frost every night;
  - zero rain, and every month at 3 mm;
  - a tie in temperature (the fixture's own Copiapoa cinerea figures);
  - extremes that are refused, missing, sea or not asked;
  - climate refused, pending or none, each with and without an archetype convention (Tillandsia, Phalaenopsis);
  - the convention minimum, and a null latitude.
- **Checks by script.** Three Playwright scripts:
  - `cred.mjs` fakes a loaded photograph and asks what sits on top of the credit.
  - `vis.mjs` reads the chart's visible text.
  - `fold.mjs` measures the front page at six viewports.
- **Docs against the code.** I read `/about/how` and `/about/formats` against `svelte.config.js` (CSP), every `localStorage` and `sessionStorage` key in `src`, `counters.ts`, `sync.ts`, the import, and the label code. I read the launch draft and `README.md` claim by claim.
- **Tests written.**
  - `/tmp/r60rev/out/tests/visitor-words--rules.test.ts` has seven assertions, all failing today. I ran them with tsx and a minimal harness rather than vitest, so nothing was written into the checkout.
  - `visitor-words--pages.spec.ts` has two e2e tests, both failing today. I reproduced both by script.

**Limits.**
- **Fixture effects.** Photographs and the live site cannot be reached from here. The fixture has four species, and its Copiapoa humilis hemisphere counts do not add up (31 + 6 ≠ 40 cells). That is a fixture inconsistency, not code: `provider.ts:189` makes `cells` = side + equatorial.

## Findings

### 1. P1, confirmed. The grower labels say more than their figures, and the figure that contradicts them sits on the same screen
- **Where:**
  - `src/lib/ui/ref/Glance.svelte:68` and `:77`: the species page's glance row and the front page's "This is what every species page shows".
  - `src/routes/compare/+page.svelte:186` and `:190`.
  - `src/lib/share/card.ts:43-44`.
  - `/about/how` line 41: "The labels over the figures ("Coldest nights in the wild", "Rain in the wild") are names for what each figure is, not readings of it."
- **What a visitor sees.**
  - The front page at 1280 (`home-d-light-fold.png`) shows "COLDEST NIGHTS IN THE WILD 6.5 °C · Cold floor: 1 night in 100 is colder · NASA POWER". Next to it, the chart prints "4.0° lowest night in 40 years, NASA POWER".
  - "WARMEST DAYS IN THE WILD 22 °C · Jan mean day at the habitat" sits beside the chart's "29.0° 99th-percentile day".
  - Compare puts both in one cell: "COLDEST NIGHTS IN THE WILD / 6.5 °C / cold floor: 1 night in 100 colder over 40 years; lowest 4.0 °C".
  - The share card says "COLDEST NIGHTS 6.5 °C" and "WARMEST DAYS 22 °C" over a chart whose edge says 29.0°.
- **Why it breaks rules 1 and 3.**
  - "Warmest days" is the warmest month's mean of daily maxima from CHELSA. That is not the warmest days. The page's own 99th-percentile day is 7 °C higher.
  - "Coldest nights in the wild" is the 1st-percentile night at one NASA POWER cell of 0.5° × 0.625° (a reanalysis cell about 50 km across) at "a typical spot". It is neither the coldest nights nor a figure "in the wild" at a plant.
  - The label states a fact that the figure under it does not hold, and `/about/how` says the labels are "names for what each figure is". A climate-literate first-time reader will notice 6.5 against 4.0 inside a minute.
- **Smallest fix.**
  - Labels that are the figure's own name: "Cold floor (1 night in 100)", "Warmest month, mean day", "Rain a year", "Open-sky light".
  - Or keep the plain words and make them true: "Cold nights at a typical spot" with the figure, and the record low beside it. the launch draft already says the record low is "printed beside it". On the glance card it is not.
  - Change Glance, compare and card.ts together.

### 2. P1, confirmed. On a phone, every species page's hero photograph hides its credit and licence under the name card
- **Where:** `src/lib/ui/theme.css:190` (`.hero .cred { position:absolute; right:12px; bottom:10px }`) and `:358` (`.idcard { margin: -30px 15px 0 }` at phone width).
- **Reproduction:** `cred.mjs` makes photographs load by serving a PNG for the photo hosts, then calls `elementFromPoint` at the left, middle and right of `.hero .cred`.
  - At 390 wide, all three hits are `idcard` on both Copiapoa cinerea and Welwitschia.
  - At 1280 wide, all three are the credit.
  - Screenshot: `hero-loaded-copiapoa-cinerea-m.png`. The photograph has no visible author or licence, and the link to its source page cannot be tapped.
- **Why it matters:** rule 1. `/about/how` says "On a species page ... each photograph shows its author and licence". This is the first thing on every species page on a phone. The failed-photo state has the same problem (`.hero.failed .cred`, bottom 6px).
- **Fix:** on phones, put the credit at the top of the hero (`top: 8px; bottom: auto`), or make it a line inside the name card.
- **Test:** `visitor-words--pages.spec.ts`, the phone test.

### 3. P1, confirmed. The front page's chart, under "Every figure names its source", never names CHELSA where a reader can see it
- **Where:** `src/lib/ui/Climograph.svelte:21` names CHELSA only inside the SVG's `<desc>`. The figcaption (`:89-97`) names NASA POWER alone.
- **Reproduction:** `vis.mjs`. The chart's visible text on `/` and on `/species/copiapoa-cinerea` contains "NASA POWER" twice and "CHELSA" zero times. "RH 78%", the rain bars and the day and night lines carry no visible source.
- **Context:**
  - On the species page, the source is one tap away in "How this section is made".
  - On the front page's feature there is no such disclosure. The bullet two lines above reads "Every figure names its source" (`src/routes/+page.svelte:653`).
- **Fix:** one figcaption key: "medians and 10th–90th percentile across N habitat cells, CHELSA".
- **Test:** `visitor-words--pages.spec.ts`, the desktop test.

### 4. P1, confirmed. A refused or pending climate is told "No habitat figure is on file" (rule 2)
- **Where:** `src/lib/core/sheet.ts:248` and `:370` (the "why"). The species page renders this through `sheetCards` (`species/[slug]/+page.svelte:452`) whenever the archetype gives a convention.
- **Reproduction:** `gen.out`, the cases `tillandsia_refused`, `tillandsia_pending` and `arch_only` (Phalaenopsis, refused). The Warmth and air card reads:
  > "No habitat figure is on file for this species, so no cold floor is read. Apart from the habitat, the convention for epiphytes grown indoors is 10 °C; no source is given for it ..."
- **The contradiction:**
  - The note's own first item says "The habitat climate was not checked (a source did not answer)". Its second says "No habitat cold figure on file".
  - On the page, the pill says "Climate not checked" and the card says "not on file". This hits every epiphyte, orchid, tropical or fern species whose climate refused or is pending.
- **Fix:** pass `climateStatus` into `coldFloor` and say "The habitat climate was not checked ..." or "... is pending ...". Keep "on file" for 'none' only.
- **Test:** `visitor-words--rules.test.ts`, "rule 2".

### 5. P2, confirmed. Ties in temperature still name one month, on the fixture's own front-page species
Round sixty fixed ties for rain only. Copiapoa cinerea's tmax is 22 in both January and February, and every surface names January alone:

| Surface | Where | What it says |
|---|---|---|
| Glance card, species page | `Glance.svelte:77`, `MON3[hot]` | "22 °C · Jan mean day at the habitat" |
| Same card on the front page | `Glance.svelte:77` | "Jan mean day at the habitat" |
| Compare | compare page | "Jan mean day" (Copiapoa humilis: 23 in both months, the same) |
| Share card | `card.ts:44` | "Jan mean day · CHELSA" |
| Sheet | `sheet.ts:352/359` | "warmest day 22.0 °C in January" |
| Chart, screen readers | `climograph.ts` alt; `Climograph.svelte:21` desc | "to 22 °C in Jan"; "Warmest month January" |

The coldest-night month and the cold quarter (`climograph.ts`, `coldest`) pick the first month in the same way.
- **Fix:** the `extremeMonths` pattern for temperatures. On a tie, name the months or "N months at 22 °C". For the cold quarter, centre the shading on the run.
- **Test:** `visitor-words--rules.test.ts`, "ties".

### 6. P2, confirmed. The share card never says which hemisphere its months belong to
- **Where:** `species/[slug]/+page.svelte:367`.
- **What happens:** the card's `input` carries no `south`, so `card.ts:96` draws "habitat months" with no hemisphere. Round sixty's account (X item 4) claims the card has "habitat months, southern hemisphere".
- **Why it matters:** a northern grower sees the cold quarter in June to August, with nothing saying those are southern months. The card is the one artifact that travels without the page.
- **Fix:** add `south: sheet.year?.south` to the input.
- **Test:** `visitor-words--rules.test.ts`, "share card".

### 7. P2, confirmed. The label line prints the convention minimum as a bare figure
- **Where:** `src/lib/core/note.ts:94`.
- **What happens:**
  - `careLine` gives "group min 10 °C" for a species with no habitat climate (case `tillandsia_none`). The labels page does not explain it either (no "convention" or "no source" anywhere in `labels/+page.svelte`).
  - A label stays in a pot for years.
  - This is the one place the convention is shown without "no source", and `/about/how` #archetypes says it is shown "only as that".
- **Fix:** "group conv. 10 °C (no source)", or leave it off labels.
- **Test:** `visitor-words--rules.test.ts`.

### 8. P2, confirmed. `/about/how` says it lists "every key"; three are missing
- **Where:** `/about/how` line 92 ("What the device keeps outside the collection, every key").
- **The missing keys:**
  - `cultifolio.persistAfterFirst` (localStorage, `src/lib/ui/grow/GrowLayer.svelte:16`);
  - `cultifolio.backupNudgeHidden` (sessionStorage, `GrowLayer.svelte:17`);
  - `cultifolio.iosFirstHidden` (sessionStorage, `src/lib/ui/grow/IosFirst.svelte:13`).

  All three are new grower-feature keys that did not reach the reconciled list. That is a seam between agents.
- **Fix:** add the three keys. Adopt the test, which greps `src` for keys and checks `/about/how` names each one.
- **Test:** `visitor-words--rules.test.ts`, the last case.

### 9. P2, confirmed. On a desktop the first screen has no search box, no photographs and no sample-collection offer, at any size
- **Measured by `fold.mjs`:**
  - At 1280×900, 1366×768, 1440×900 and 1920×1080, the search input's top is at y = 1222.
  - The photo strip is at 988 and the welcome line at 940.
  - The feature (y 236, 694 px tall) fills the first screen.
  - On a phone, the search is at 541 of 844, which is as intended.
- **Why it matters:** first-time readers are mostly on desktops. They get a chart of a species they did not choose, and must scroll to find out whether their own plant is here.
- **Fix:** put the search row and the strip above the feature. Or set the feature beside the search: glance cards left, chart right, at most about 420 px tall, with the season card collapsed.

### 10. P2, read. the launch draft: the claims a skeptical reader challenges first
- **Title 1, "the climate where 8,900 cacti and succulents grow wild" (line 9).**
  - `/about/how` says the list is 172 collector genera *plus the 2,500 species most often recorded as cultivated on iNaturalist across every kind of grower*. So many of the 8,947 are not cacti or succulents.
  - Many species have no climate.
  - Use title 2.
- **"can be rebuilt from the sources in about an hour" (line 60).** The README's hour is the offline re-derive from files already built (`--offline --grid climate --bulk bulk`, "asking no upstream"). A build from the sources takes:
  - a CHELSA pack (`scripts/pack-climate.py`);
  - a GBIF bulk download;
  - OpenAlex at about 1,000 species a day and iNaturalist at about 3,000 a day.

  Say "re-derived from the built files in about an hour; built from the sources over several days".
- **"with the record low printed beside it" (lines 23 and 54).** On the glance row, which is the place a reader looks, it is not printed. See finding 1.
- **"`/about/how` lists every request the site makes" (line 29).** Its "this list and nothing else" covers "the pages about your own plants". The public pages' requests (`/api/rows`, `/api/search`, `__data.json`) are described in passing, and finding 8 shows the storage list was not whole. Say "every request your own pages make, and every host any page loads from".
- **`[AUTHOR: confirm the price sentence]`** is still in the post (line 31) and in the prepared replies (line 62).

### 11. P2, confirmed. "Nothing on a species page is written by a person or by AI" is false as worded, on the front page and in the pitch
- **Where:**
  - `src/routes/+page.svelte:653`. Unlike `/about/how`, it drops "except credited quotations". The Wikipedia summary on the page beneath was written by people.
  - The same claim on `/about/how` line 41, in the launch draft and in the README. Every sentence template in `sheet.ts`, every label ("Coldest nights in the wild") and every notice was written once, by the author and by Claude agents (the README and the launch draft say the code was).
  - The pages also carry ordinary written sentences that are none of the three kinds: "No openly licensed photograph on file. If you grow this plant, add your own photograph to your record.", "Your notes: none yet. Write what you know", and the map caption.
- **Why it matters:** the first reply at launch will be "the templates were written by an LLM".
- **Fix:** keep the claim, and make it precise:
  - "No sentence is written for a species: each is a credited quotation, a figure with its source, or a fixed rule's reading. The templates, written once, are in `sheet.ts`."
  - On the front page: "Nothing about a species is written per page by a person or by AI, apart from credited quotations."

### 12. P2, read. `/about/formats` says imported names are "checked as the Add form checks them"; `/about/how` says the opposite
- **What the pages say:**
  - Formats (`about/formats/+page.svelte:60`): "Names are checked as the Add form checks them."
  - How: import names go to "the catalogue's search as the front page asks it (never of GBIF's name service)".
- **What the code does:**
  - The Add form's picker asks `/api/names`, which goes on to GBIF (`SpeciesPicker.svelte`).
  - Import uses `entriesFor`, then `searchCatalogue` (`plants/import/+page.svelte:92`; `import/check.ts`), and never asks GBIF.
- **Verdict:** how is right; formats is wrong.
- **Fix:** "Names are checked against the reference: by hash group first, then by the catalogue's search; never sent to GBIF's name service."

### 13. P2, read. A species with a climate but no extremes is still titled "habitat rain, cold nights"
- **Where:** `src/lib/ui/ref/head.ts` `speciesTitle`.
- **What happens:**
  - A page whose extremes refused, fell on a sea cell or were not asked has no night figure, only the CHELSA mean of a month's lows, which the page itself says is "not a floor". Its title still promises cold nights. Cases `sea`, `ex_refused` and `arch_raised_noex`.
  - With no DLI, the title reads "Copiapoa x: habitat rain, cold nights", a list missing its "and".
- **Fix:** `cold nights` only when `extremes`; join the parts with `and`.

### 14. P3, confirmed. "undated" on the chart reads as an error to a stranger
- **What the chart says:** "29.0° 99th-percentile day, NASA POWER (undated)", and the legend "marked at the edge: undated" (`climograph.ts`, `Climograph.svelte:95`).
- **Fix:** say what is meant: "(any month)", or drop the word. The edge position already says it.

### 15. P3, confirmed. "The 1 nearest"
- **Where:** `species/[slug]/+page.svelte:602`.
- **What it says:** "Similar habitat climate The 1 nearest by mean day, mean night and rain".
- **Fix:** "The nearest", or "The N nearest" only when N > 1.

### 16. P3, confirmed. Refusal sentences built from a source's detail lose their article
- **What Refusia shows:**
  - Cultivation: "Not checked: Occurrence source did not answer."
  - Climate: "Not checked. Occurrence source did not answer."
- **Where:** `sentence(d.climate.detail)` (`species/[slug]/+page.svelte:467,528`) capitalises the dossier's bare detail.
- **Fix:** "The occurrence source did not answer when this page was built." Write the detail in the builder as a full clause.

### 17. P3, confirmed. Still open from 59: the offline page says twice that species pages are kept
- **What it says (`/offline`):** "Species pages you have opened before are kept; one you have not opened needs the network once." Then: "A species page is fetched the first time you open it and kept after that, so the ones you grow are usually here already."

### 18. P3, confirmed. The plain 404 says nothing but "Not found"
- **Where:** `+error.svelte`.
- **What happens:** `/no-such-page` shows the heading and a search box, and no sentence. X's report mentions a message ending `”.`, which does not appear.
- **Fix:** "No page at /no-such-page." Then the search.

### 19. P3, confirmed. A southern visitor's front-page feature renders northern months first
- **What happens:**
  - The hemisphere cookie is set only for `/species` and `/compare` (`site.svelte.ts:35`), and the front page reads none.
  - The feature's season card is therefore server-rendered "in your months, northern hemisphere" for everyone.
  - It flips after hydration for a visitor with a site.
- **Fix:** set the cookie on path `/` as well, and read it in `+page.server.ts`.

### 20. P3, read. `/about/how` #notes: "A plant's printed label carries the same figures in one line"
- **What the label carries:** the season, the 1st-percentile night (when extremes exist) and the open-sky DLI range (`careLine`). It does not carry the warmest month or the rain.
- **Fix:** "carries the season, the cold floor and the light".

### 21. P3, read. `/about/how` lists what the server keeps per vault, but not the photograph claims
- **What it omits:** `c:` keys in the counter object (`counters.ts`, `Claim = { at, day }`) record when an upload last claimed each photograph's name. They are kept until the two-day sweep.
- **How serious:** small, but the paragraph lists the other per-vault keys (sizes, removal notes, the vault count).
- **Fix:** add "and when each photograph's name was last claimed, for two days".

### 22. P3, confirmed. Small things a first visitor sees
- **Front page, both widths:**
  - The count is said twice: "4 species · 2 with habitat climate" (mono line), then bullet one "4 species, 2 with the climate where they grow wild".
  - At 1280, the Light card sits alone on a second row beside an empty space (`home-d-light-fold.png`). Four cards in one row at desktop width, or the season card beside it, would fix this.
- **Charts on a phone:**
  - On a species page at 390, the extreme's edge label sits on top of "COLD QUARTER" and close to the "0°" tick (`crop-cinerea-m-chart.png`).
  - On the share card, with no DLI the fourth figure is "CELLS 1 · habitat grid cells read" (plural for one), and its legend always shows "10th–90th percentile across cells", even with one cell and no band.
- **Hemisphere coverage:** on the season strip, with no site set, the visitor is told "Northern hemisphere unless you set your site". That is fine. But the link goes to `/settings#site`, a private page, which a visitor reaches with an empty collection.

## Checked and sound

**Rule 2 wording**
- **Refusia (every source refused):** the pills, Summary, Cultivation, Climate, the map caption, Evidence, Photographs and the Record ("Wild records: not checked") all say not checked. The description says "habitat climate not checked".
- **Welwitschia:** "pending" throughout. The genus row says "1 pending", not "not checked" (round 59's finding is fixed).
- **Compare** uses "Climate pending" and a NotChecked pill.
- **Label line:** "climate not checked" and "climate pending".
- **Extremes:** `extremesWhy` gives a separate sentence for refused, skipped and sea.

**Sheet sentences against their rules** (every case in `gen.out`)
- Fog/cool, none, spread ("no short rainy season"), flat, even and winter/summer.
- The 10° equatorial wording, with no doubled "there".
- Months said once when reader and habitat agree.
- Bimodal runs, ties in rain ("driest months (4 at 0 mm)"), zero rain ("the same in every month, 0 mm") and all-dry ("every month under 5 mm").
- Frost counts with separators.
- US units throughout, with rule thresholds as "4.7 in (120 mm)".
- The cold floor without extremes keeps its verb.
- The convention appears only as "the convention for … is N; no source is given for it" in the sheet, the note and the species page's archline. It never raises a floor: a Puya at −3 °C stays −3.

**Season strip:** shading and dry dots shift together for the other hemisphere, nothing is shaded for spread or none, and an equatorial habitat says "not shifted" (checked north and south).

**Head:** descriptions with and without a climate stay at or under 155 characters and contain no advice. og:url, og:type, og:image:alt and twitter:card are present.

**Layout and theme**
- No sideways scroll at 390 on any of the 16 addresses, in light and dark.
- The `data-theme` override works both ways (checked after load only; I did not measure a flash before paint).
- Dark mode is coherent on all pages, chart included.

**404s:** the misspelt species gets "Did you mean Copiapoa cinerea?" and a search box. The synonym case says not checked, with a full stop.

**Sample collection:** "try a sample collection" on the front page opens 12 sample plants with a "Leave the sample" banner.

**Privacy plumbing**
- CSP `img-src` is the four hosts `/about/how` names.
- The cookies match: `cultifolio.units` on `/`, and `cultifolio.hemi` on `/species` and `/compare` only.
- No version poll (`pollInterval: 0`).
- `no-referrer` is set in both the meta tag and the header.
- Hover preloading is off on private routes and on the front page's own tiles and hits.
- The counter sweep keeps today and yesterday only, as stated. KV keys expire at the end of the next day.

**README:** the claims I checked hold. "One in about 280" is 8,947 / 32. POWER is 1981–2024. The licences (AGPL in `LICENSE`, MIT in `scripts/LICENSE`) and the NOTICE's CHELSA CC0 are consistent with the card.

## Suggestions for the first minute, ranked (none breaks a rule)

1. **Desktop: search and photographs first.** The search row and the day's strip go at the top, and the feature beside or under them, kept to one screen (finding 9). Today a first-time reader on a laptop sees neither the search nor a single photograph.
2. **One headline that is the product.** "How cold, wet and bright it is where 8,947 cacti, succulents and bulbs grow wild, every number with its source." Then one line: "Keep your own plants here too: no sign-up, on your device." The three bullets currently spend their words on what the site is not.
3. **True labels.** "Cold floor, 1 night in 100", with "record low 4.0 °C" beside it, and "Warmest month, mean day" (finding 1). An honest label costs nothing and wins the climate-literate commenter.
4. **Make the AI claim precise and say it first** (finding 11). "Templates written once, filled with sourced figures; no text generated per species; code written with AI agents under review." Said up front, it disarms the thread. Found by a commenter, it derails it.
5. **Phone: show the figures, not just a link.** The four glance cards fit as a 2×2 block of about 220 px under the pitch, with the featured species' name. That keeps the search on the first screen at 390×844 (it is at 541 today, and the strip could follow the cards).
6. **Credit on the hero, visible on phones** (finding 2), and CHELSA on the chart (finding 3). These are the two rule-1 gaps a reader can see without opening anything.
7. **Drop "undated" and "The 1 nearest"** (findings 14 and 15). They are small, but they read as bugs.
8. **On the welcome line, put the sample collection first** ("See a sample collection" as a button). It is the fastest way to show the second half of the product to someone who will not type a plant.

Tests: `/tmp/r60rev/out/tests/visitor-words--rules.test.ts` (7 failing) and `/tmp/r60rev/out/tests/visitor-words--pages.spec.ts` (2 failing). Scripts and outputs: `/tmp/r60rev/vw/`.
