# Round 59 review: the visitor (first contact, design and UX)

Reviewer area: a stranger arriving from Show HN or Reddit. Server: shared build at http://127.0.0.1:4180, four-species fixture corpus. Chromium 1194 via Playwright, 390x844 (isMobile, touch) and 1280x800, light and dark, locale en-GB (the dark batch ran with the default en-US locale and came up in °F, which is the intended default). Every screenshot named below is in /tmp/review59/visitor/ and I looked at each one. Scripts: shots.mjs, walk.mjs (viewport-by-viewport scroll), sp1/sp2.mjs (species tabs and cards), home.mjs/home2.mjs (search, grouping, chips, letters), cmp*.mjs, priv.mjs, anch.mjs, back.mjs, misc.mjs, cls.mjs, share.mjs, today.mjs.

Limits: https://cultifolio.com is not reachable from here, and no outside photo host loads, so every photograph is a placeholder. Where the live site would look different I say so. The fixture has 4 species, so the catalogue's density, the featured strip (six-up on desktop, a sideways strip on a phone) and the genus rows' real thumbnails could not be judged as a stranger would see them.

## The short answer

1. **Five-second test.** Mostly a fail on a phone, a weak pass on desktop. The first screen is a heading, a 6-line run-on sentence and a row of controls. It never shows what a species page gives you: the four glance cards (cold floor, warmest month, rain, light) are the product, and they appear nowhere on the front page. The live site's featured photographs would help (on a phone they start at y≈430, so roughly one and a half tiles show). Still, what a stranger sees is "a catalogue with a search box", which iNaturalist and Llifle already are. What would make them bounce: the paragraph's hedging ("where the sources answered", "worked out from public data, every figure with its source") reads like a disclaimer before it reads like a promise.
2. **Visual design.** The type system (serif display, a grotesque body, mono figures), the palette and the dark theme are coherent and look deliberate, more finished than Llifle and close to POWO. What looks amateur: grey boxes of monospace error text where a photograph should be, the same figure repeated nine times on a page, a grey-on-grey "by rule · not written by a person" voice on almost every block, and some small craft slips (a notched card corner, a clipped legend, a missing space).
3. **Species page.** The phone's first screen does answer "how cold, how warm, how wet, how bright" (the glance cards start at y=505). It does not answer "when does it grow or rest", which sits two screens down and is phrased as a rule's output. The provenance machinery is drowning the content: 2,077 words on a page whose quoted summary is two sentences; "72 mm" appears 9 times, "CHELSA" 22 times, "NASA POWER" 7 times.
4. **Interaction.** Mostly solid: search is instant and typo-tolerant, Esc clears, Back restores the query, deep links open the right row. Faults: Back from a species page loses the list position, anchors land under the sticky bar, the desktop section tabs mark the wrong section near the end, and the compare page shows broken-image icons.
5. **Mobile.** No horizontal page scroll on any page (scrollWidth 390 everywhere). The sticky chrome takes 161 of 844 px on a species page (bar 49, section tabs 55, bottom nav 57), and the compare pill adds 44 more. Several targets are under 44 px. Text is 11 px at the smallest.

## Findings

### 1. P1, confirmed. The front page never shows the product
- Steps: open `/` at 390 and at 1280. Screenshots: home-m-fold.png, home-d-fold.png.
- What happens: the first screen is the H1 "Cultifolio", "4 species · 2 with habitat climate", then a 62-word sentence ("A reference for people who grow cacti, succulents and bulbs: 4 species with their native range and, where the sources answered, habitat climate and cold nights, worked out from public data, every figure with its source. Keep your own plants here too…"), the welcome line, the search box and the grouping control. On a phone the top bar's brand slot says "SPECIES", not the name. The clearest pitch on the site is the "In brief" box on /about/how (how-d-fold.png): five bullets, plainly worded. A stranger only reaches it through a footer link.
- What should happen: within one screen a stranger should see one species' glance row (cold floor 6.5 °C, warmest 22 °C, rain 72 mm, light 30 to 65 DLI, each with its source) and one line saying what that buys them: "how cold, how wet, how bright it is where this plant grows wild, for 8,947 species". Rules 1 to 3 cover species pages only, and the figures would be quoted from a page with their sources, so this is allowed.
- Smallest fix: under the H1, render the featured species' existing `.glance` component (already built for the species page), linked to its page. Replace the paragraph with three of the "In brief" bullets. Cheap.

### 2. P1, confirmed. The species page repeats itself until the content is hard to find
- Steps: `/species/copiapoa-cinerea`, walked at 390 (w-cin-m-00 to 09) and 1280 (w-cin-d-00 to 06). Counted on the server HTML: 2,077 words; "72 mm" 9 times, "CHELSA" 22, "NASA POWER" 7, "November to April" 3, "6.5" 6.
- What happens: the rain figure appears in the glance card, twice in In short ("Under 120 mm of rain a year (72 mm)…" and "72 mm of rain a year, 2 months under 5 mm."), in the Seasons summary, the Seasons body, the Rain card summary, the Rain card body, the chart and the month table. Nearly every block carries a meta line in grey: "by rule, from the cards · not written by a person", "Each line restates a figure or a rule from the cards below…", "Text from Wikipedia… quoted as written. Kept separate from everything derived here.", "The figures the cards read from are in Climate below…", and at the foot "Every figure here is derived from public data by a stated rule…". Each one is true. Together they read as the page arguing for itself, and a grower scrolls past four explanations of method for every fact.
- What should happen: each figure is stated once, where it is first useful, with its source as a small superscript-style tag. The method sentences sit in one "How this page is made" disclosure and link to /about/how.
- Smallest fix (cheap, no new words): drop the In short line that only restates the glance cards ("72 mm of rain a year, 2 months under 5 mm"). Drop the In short subtitle (the In short footnote already says it). Collapse the Seasons, Rain, Light and Warmth cards by default (Rain, Light and Warmth already are; Seasons is open). Keep one "How this is read" link per section instead of three meta paragraphs.

### 3. P1, confirmed. "When does it grow" is not on the first screen, and when it comes it reads as a rule
- Screens: w-cin-m-00 (first screen: photo, title card, 4 glance cards), w-cin-m-01 to 03.
- What happens: the season is the question a cactus or bulb grower asks first (when to water, when to keep dry). It first appears as In short's second line ("…so no rainy season is read; the cooler six months are November to April (May to October at the habitat)") at about y=900 on a phone. The Seasons card follows at y≈1700. The chart beneath it is drawn in the habitat's months (the shaded "COLD QUARTER" is May to July), while the In short line leads with the grower's months (November to April). Nothing on the chart says which calendar it uses.
- What should happen: a fifth glance card, "Season", showing the existing rule outputs as a 12-month strip in the grower's months (cool half shaded, dry months marked). The chart gets a caption chip: "habitat months (southern hemisphere)".
- Smallest fix: put the In short's season line into the glance row as a card. Add "habitat months" to the climograph's top label. Cheap for the label; moderate for the card.

### 4. P2, confirmed. Compare shows broken-image icons
- Steps: `/compare?s=copiapoa-cinerea,copiapoa-humilis,welwitschia-mirabilis` at 390 and 1280. Screenshots: w-cmp3-m-00.png, w-cmp3-d-00.png, crop-cmp-broken.png (zoomed).
- What happens: `src/routes/compare/+page.svelte:134` hides the image in `onerror`, but the server-rendered `<img>` fails before hydration attaches the handler, so Chromium draws its broken-image glyph inside the hero box. Round 59 section 3.6 claims "a photograph that fails leaves an empty box"; that holds only when the failure comes after hydration. On the live site this shows whenever a host is slow to refuse, blocked by an extension, or the visitor is offline. The front page's server-rendered featured tile shows the same glyph before hydration (nojs-home-m.png).
- Smallest fix: on mount, `if (img.complete && img.naturalWidth === 0) img.hidden = true`, as the species page's photos already do (they show "did not load").

### 5. P2, confirmed. Every in-page anchor on /about/how lands under the sticky bar, including /privacy
- Steps: `/privacy` (301 to `/about/how#privacy`) at 390. Screenshot: privacy2-m.png. anch.mjs measured all 15 heading anchors: each one's top is at 0 after the jump and `scroll-margin-top` is `0px`.
- What happens: the footer's "Privacy" link drops a stranger into the middle of a bulleted list. The heading "What the site knows about you" is under the 49 px top bar. The same applies to the species page's links into /about/how (#glossary, #floor and the rest).
- Smallest fix: `h2[id], h3[id] { scroll-margin-top: calc(var(--bar-h) + 12px) }` on the about pages, as the species page's sections already have. Cheap.

### 6. P2, confirmed. Back from a species page loses the grower's place in an open genus
- Steps (back.mjs): open `/`, open Copiapoa, scroll to y=824, tap Copiapoa humilis, press Back. Result: URL `/?by=genus&open=copiapoa`, scrollY 238, not 824 (back-2-m.png).
- What happens: the `open=` deep-link handler scrolls the open row to the top and overrides the browser's scroll restoration. With the live site's 40-species genera, every Back sends the grower to the top of the genus.
- Smallest fix: run the scroll-to-row only on a fresh navigation (`navigation.type !== 'popstate'` in `afterNavigate`), and let SvelteKit restore the saved scroll on Back.

### 7. P2, confirmed. The count under the list ignores the chip, and says "1 genera"
- Steps: `/?by=origin&chip=noclimate` shows "1 regions · 4 species". `/?by=genus&chip=climate` shows "1 genera · 4 species". `/?by=family&chip=climate` shows "1 families · 4 species". Screenshot: h-group-Origin-m.png.
- Code: `src/routes/+page.svelte:674` prints `data.rowCount` with a fixed plural and `data.total`, the whole catalogue's species count.
- What should happen: "1 region · 2 species" (the filtered count).
- Smallest fix: singular/plural on `rowCount`, and the species count summed over the filtered rows. Cheap.

### 8. P2, confirmed. The share card says more than its rule, and its legend is cut off
The share card (sharecard.png) is the best-looking thing the site makes and the thing most likely to be posted on Reddit, so its words matter most.
- `src/lib/share/card.ts:45`: Light is labelled "mol/m²/day, winter to summer". Round 59 changed compare's light row to "lowest to highest month" because the darkest month is not always winter (a cloudy rainy summer can be darker). The card was not changed. This breaks rule 3.
- `card.ts:35` counts months with `precipMm >= 25`, but line 44 says "no month over 25 mm". The species page says "no month of 25 mm or more", which is what the rule does.
- `card.ts:93`: the legend's last item "RH, own scales" runs off the 2400 px canvas. The PNG shows "RH, own scale", clipped at the right edge.
- Fix: use the page's wording in both lines. Move the legend start left, or wrap it onto two lines. Cheap.

### 9. P2, confirmed. Desktop section tabs mark the wrong section near the foot of the page
- Steps (sp1.mjs, 1280): click "Registers". The page scrolls to #s-registers, but the tab marked `on` is "Related" (tab-d-Registers.png). Earlier in the walk (w-cin-d-05.png) "Photographs" is lit while Related fills the screen.
- Code: `src/routes/species/[slug]/+page.svelte:110` to 119 marks the last heading above a fixed 110 px line. The last section's heading can never reach that line, because the page ends first.
- Fix: when `scrollY + innerHeight >= scrollHeight - 2`, mark the last tab. When a tab is clicked, mark its section directly. Cheap.

### 10. P2, confirmed. Compare on a phone loses its column headings and hides the third column
- Screens: w-cmp3-m-00 to 04.
- What happens: the species names and photographs are only at the top. By the Rain row nothing says which column is which. The third column is a sliver about 6 px wide at the right edge. The page says so ("on a narrow screen the table swipes sideways for the third"), but the sliver gives no visual hint. The "The year" row repeats a link per column in body-sized green text ("The full chart, with its bands and extremes, on its page"), which reads like content.
- Better: a sticky mini-header holding the column names, a visible "1 of 3 ›" pager or a peeking 40 px third column, and the year row as one small link per column ("chart ›").

### 11. P2, confirmed. Opening a genus row near the foot of a phone screen shows nothing
- Steps: on `/` at 390, tap the Copiapoa row (at y≈750). The URL becomes `?by=genus&open=copiapoa` and scrollY stays at 0 (h-row-open-m.png). The species tiles open below the bottom nav. The only visible change is the "+" turning into "−".
- Fix: after opening, scroll the row to just under the sticky search bar when its tiles would start below the fold. Cheap.

### 12. P3, confirmed. Placeholders: a big grey error box where the photograph goes, and four different fallbacks
- Copiapoa humilis (w-copiapoa-m-00.png): about 180 px of the first screen is a grey box saying, in monospace, "No openly licensed photograph on file. If you grow this plant, add your own photo to your record."
- Refusia testii (w-refusia-m-00.png): the hero is "Photographs: GBIF media did not answer when this page was built. Not a statement that none exist." The title card stacks "Climate not checked" and "Photographs not checked" with 40 px gaps between them.
- A photograph that fails has four different fallbacks: a letter placeholder with "photograph did not load" (featured tile), a blank grey square (genus rows, related tiles, w-cin-m-07.png), a lowercase sans "c" (desktop search row, h-srch-cop-d.png), and a broken icon (finding 4).
- On the live site most photos load, so the hero case affects species without photographs (humilis-like ones), which are likely many among the 8,947.
- Better: when there is no photograph, drop the hero box and let the title card take the full width with the `Placeholder` letter as a small thumbnail. Put the refusal sentence in the Photographs section, where rule 2 needs it. Use the one `Placeholder` component for every failed or missing image.

### 13. P3, confirmed. The units toggle shows the unit it will switch to, inside the Cold floor card
- Screens: w-cin-m-00 ("°F" circle, page in °C), units-f-m.png (page in °F, circle now says "°C").
- A badge reading "°F" next to a figure in °C reads as a contradiction. It also overlaps the Cold floor card's label line.
- Better: a small segmented "°C | °F" control in the glance row's header, with the current unit filled. The setting already persists (cookie `cultifolio.units`).

### 14. P3, confirmed. Small craft slips
- Share card status: "Saved to your downloads as copiapoa-cinerea-climate.png.Open it." with no space (share-m.png). `src/lib/ui/ShareCard.svelte:41`: Svelte trims the leading space inside `{#if saved} <a…>`. Move the space before the `{#if`.
- "Where this page came from" (`src/lib/ui/Provenance.svelte:16`, `summary { display: flex }`): flex removes the disclosure marker, so a card with a label, a date and empty padding gives no sign it opens (w-cin-m-08.png). Add a "›" like the page's other disclosures.
- The Record card's bottom-left cell ends 1 to 2 px short, leaving a visible notch at the corner (crop-record-notch.png; w-cin-m-08 and w-refusia-m-03 as well).
- Species 404 sentence has no full stop and is hard to parse: "Whether it is an older name for a species that is here was not checked: GBIF's name service did not answer" (404sp-m.png). The species 404 also lacks the search box the generic 404 has (404-d.png).
- Today for a visitor (frost-m-fold.png, today-bottom-m.png): the heading "Also today" sits over nothing (`src/routes/today/+page.svelte:307` renders `<Today>` even when it is empty).
- The offline page says twice that species pages are kept once opened (offline-m.png).

### 15. P3, confirmed. The genus row calls a pending climate "not checked"
- `/` shows Welwitschia's row as "1 species · 0 with climate · 1 not checked" (home-m.png). Its species page and search row say "Climate pending" (w-welwitschia-m-00.png). `src/lib/dossier/catalogue.ts:174` counts `refused || pending` as `notChecked`. Per /about/how, "not checked" means a source refused. Two words for two states, mixed on one screen.
- Fix: count the two separately ("1 pending"). Cheap.

### 16. P3, confirmed. The toolbar changes shape between states
- With a chip on, or in the Origin view, the A–Z button disappears (h-chip-Climate-m.png, h-group-Origin-m.png). After A–Z, the featured strip is gone (h-group-AZ-m.png). The filter chips sit below the featured strip, so they look detached from the grouping control they work with.
- Better: one toolbar row (search, then Group by, then filter chips, then A–Z) with the strip above it.

### 17. P3, confirmed. Tap targets under 44 px on a phone (misc.mjs)
- Front page: letter index C/R/W 30x30, welcome dismiss "×" 26x26.
- Species page: section tabs 40 px tall, register chips (GBIF, Wikidata…) 31 px, "20 photographs ›" 358x21, "Follow" 42x44.
- The letter index is the worst: three 30 px letters set close together.

### 18. P3, confirmed. Search on a phone
- Tapping the box scrolls the page 255 px before a letter is typed (h-srch-focus-m.png). The intro disappears at the moment of first engagement.
- The results header reads "2 matches of 4 · Enter opens the first", but phones have no Enter key labelled as such.
- In search mode the footer floats mid-screen under two results (h-srch-cop-m.png).
- Desktop: ArrowDown leaves focus in the box, so results cannot be walked with the keyboard. Enter opens the first and Esc clears, both correctly.

### 19. P3, confirmed. Each section-tab tap adds a history entry
- Clicking all six tabs, then Back, gives `#s-related` and so on (sp1.mjs). A visitor who used the tabs needs up to six Backs to leave the page.
- Fix: `history.replaceState` for in-page tab jumps. Cheap.

### 20. P3, suspected (read). Link previews
- Species pages set `og:title`, `og:description` and `og:image` (an iNaturalist "large", 1024 px, not an original) but no `og:url`, `og:type`, `og:image:alt` or `twitter:card`. No page sets `twitter:card`, so X shows the small summary card.
- The share card PNG would make a far better `og:image` for species with climate than a photograph whose crop is unknown. This is a judgement call, not a defect.

### 21. P3, confirmed, mostly a fixture effect. The front page shifts on a phone
- cls.mjs, run twice alone: the phone's front page measured CLS 0.197 both times. Desktop measured 0.02. Species page: 0.057 to 0.069 on a phone, 0.03 on desktop.
- Most of the phone figure comes from the featured tile's failed photograph. The server-rendered tile is about 240 px tall (nojs-home-m.png) and the "did not load" placeholder is about 115 px, so everything below moves up. On the live site this happens only when a featured photograph fails, but then the whole list jumps about 120 px.
- Fix: give the placeholder the photo's aspect box.

### 22. P3, confirmed (fixture data, live mechanism). The map marker sits away from every visible dot
- Copiapoa cinerea's zoomed map (w-cin-m-05.png): every green dot is in the north of the box, and the orange marker sits alone in the south. The explanation is in the "Evidence used" text further down: the map shows 52 open records, and the marker rests on all 352, which "alone would put the marker 414 km away".
- A stranger sees a map that contradicts itself before reading why.
- Better: on the map itself, a caption chip "52 of 352 records shown; marker from all 352".

## Ranked changes for mass appeal

1. **Show the product on the front page** (finding 1). The featured species' glance row and its photo sit under the H1, with three "In brief" bullets in place of the paragraph. *Cheap.*
2. **Say each figure once on a species page** (finding 2). Cut the In short line that repeats the cards, cut the subtitles and meta paragraphs to one "How this page is made" disclosure per section, and close Seasons by default. The sources stay on every figure, as small tags. *Cheap.*
3. **Promote the season to the glance row** (finding 3). A 12-month strip in the grower's months, built from the rule outputs that already exist, plus "habitat months" on the chart. *Moderate.*
4. **Fix the broken things a first visitor clicks** (findings 4 to 9). Broken images on compare, anchors under the bar (including Privacy), Back losing the list position, "1 genera · 4 species", the share card's words and clipped legend, and the desktop tab highlight. *All cheap.*
5. **No grey error box as a hero** (finding 12). With no photograph, the title card takes the full width with a letter thumbnail, and the refusal sentence moves to the Photographs section. One placeholder component everywhere. *Cheap to moderate.*
6. **Compare on a phone** (finding 10). A sticky column-name header and a visible way to reach the third column. *Moderate.*
7. **Units as "°C | °F"** in the glance header (finding 13). *Cheap.*
8. **One toolbar row on the front page, 44 px letters** (findings 16, 17). *Cheap.*
9. **Give visitors a lighter bottom nav.** For a visitor, four of the five bottom tabs (My plants, Places, Propagation, Today) open empty private pages; Today shows an empty "Also today". Until a first plant exists, show Species, Compare, My plants and About, with Today appearing once there is something on it. *Moderate.*
10. **Link previews**: `twitter:card=summary_large_image`, `og:url`, and possibly the share card as `og:image` (finding 20). *Cheap.*

What to keep exactly as it is: the glance cards, the climograph (it is clear in both themes), the share card's layout, the search's speed and typo tolerance, the "Not checked" boxes' tone (one per section is right), and /about/how's "In brief".

## Checked and sound

- No horizontal page scroll on any page at 390, in light or dark (scrollWidth = 390 for /, all four species, compare with 2 and 3, /about/how, /about/formats, /privacy, 404s, /offline).
- Dark mode is consistent across every page shot. Chart colours, chips, cards and the compare overlay all hold contrast (home-m-dark-fold, sp-cinerea-d-dark-fold, w-cind-m-dark-04, w-cmpd-d-dark-01).
- Search tolerates typos: "cinera", "copiapo cineria" and "welwitchia" each find the right species. "chile", "namibia" and "cactaceae" match by origin and family. The no-results text names the list's size, links to it, and offers "add it as a plant" (h-srch-none-m.png). Esc clears the box. Enter opens the first result, and Back restores `?q=copiapoa` with the text in the box.
- Deep links: `/?by=genus&open=copiapoa` opens the row and scrolls to it. `/?by=origin`, `/?by=family` and `&chip=` all render on the server.
- Letter jump works (`#l-W`, h-letter-m.png).
- Compare tray: "Compare" turns into "In compare ✓"; the tray pill on a phone and the bar on desktop both reach `/compare?s=…`. The empty compare page explains how to add species.
- Units persist across reloads (cookie `cultifolio.units=us`). The °F page converts every glance figure, In short and the rain thresholds ("0.98 in (25 mm)").
- The header icons have labels (Menu, Sync, Add a plant; 44x44). The skip link is the first Tab. The menu is clear (menu-m.png).
- Refusals read as refusals on Refusia testii: the hero, the pills, "About the genus", the climate and the record count all say "not checked" or "did not answer" (w-refusia-m-00 to 03). Welwitschia's "Pending" is worded as pending on its own page.
- The share card PNG (2400x1260) and og.png (1200x630) are well composed apart from finding 8.
