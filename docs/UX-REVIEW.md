# A presentation review: what a first visit feels like, and what to change

Walked on the live site (cultifolio.com, 25 September 2026) at phone and desktop widths, as a stranger with nothing stored, then as a grower with one plant. Three outright bugs are fixed in the same commit; the rest are recommendations, in the order I would do them. The verdict first: the material is strong and the pages are honest, but the site currently reads as a research instrument that a collection tracker was bolted to. It needs one voice, one page shape, and about half the words.

## Fixed in this commit

**The phone tab bar had no background once a grower had a plant.** The bar's fill, blur and border had been left only on the two-tab visitor variant, so on every collection page the five tabs floated over the page text ("0 d", "Resized on this device", the Remove button) and read as a broken overlay. This is most of what "ragged" meant on a phone.

**A US visitor saw Fahrenheit on the species page and Celsius on their plant.** The species page is rendered on the server and reads the browser language; the collection's pages are rendered in the browser and had no server figure to seed from, so they fell to metric until a cookie was set. The store now falls back to the browser's own language, so the two agree before Settings is ever opened.

**Opening a genus from a link landed at the top of 1,300 rows.** `?open=ariocarpus` rendered the open row 8,000 px down and the page started at the top; a shared link, a bookmark or the back button lost the row. The page now scrolls to the open row on load.

## The first visit, as it is

A stranger lands on: the kick "CULTIFOLIO", a mono line "8947 kinds · 6844 with habitat climate", the title "Species", a green "Add a plant" button, a welcome card with two buttons, a search box, a Genus/Origin/Family switch, three chips, an A–Z, and then an alphabetical wall of genera starting with *Acalypha*, *Acanthocereus*, *Acanthus*, *Acer*. Nothing on that screen says what the site is for or shows a plant. The first plant a visitor sees is a thumbnail of *Acalypha*, which nobody came for. "Add a plant" is the most prominent control on a page that has not yet earned it: the visitor has no plants and does not know what adding one means.

The species page is the site's best surface and it is also the longest: on a phone it is around fifteen screens. The order is right (photograph, name, actions, sourcing line, Summary, About the genus, facts, At a glance, In short, tabs, Cultivation cards, Climate, Habitat, Photographs, Related, Registers). The problem is density and repetition. The same fact appears three times: the cold floor is in the glance card, in the "In short" paragraph, and in the Temperature card; the rain rule's season is in "In short", in "Its year", and in the plant page's "Habitat rain season" tile. Every card carries a methodology paragraph inline ("Read from the median year of CHELSA monthly rainfall … a reading of the curves, not an observation of the plant"), and the climate section's "Figures by month" is followed by a nine-line provenance paragraph in the body text. The reader who wants the figure gets it; the reader who wants to keep reading has to wade.

The collection side is a different product in tone. The plant page opens with a row of ten action chips (Water, Feed, Repot, Measure, Treat, Flower, Note, Photo, Move, Archive) before the reader knows what the page is; four stat tiles follow, of which three read "—" for a new plant; then "Habitat versus here" with two paragraphs of figures and a disclaimer; then photographs, log, notes, notes on the species, provenance, remove. For a plant added thirty seconds ago, that is a page of mostly empty frames.

## What to change, in order

*Items 1 to 4, most of 5 and the two pieces of feedback in 7 were built in the commit after this review; the DEVLOG entry says what landed. The row-fold transition is a fade, not a height animation, since the fold is a navigation.*

### 1. One page head, everywhere

Today each list page composes its own head and they differ: the species page has kick, count line, title, action; the plants page has kick, a two-line description, count line, title, three buttons and a green one; benches and sowings put the description above the title; the frost page's segmented control stretches full width in a pill while the others are compact; settings has no segmented control at all; the frost page's content column is narrower than the rest. The reader feels the difference without being able to name it.

Make `PageHead` the only head and give it one shape: the segmented control (or nothing for a detail page), the title with at most one primary action to its right, one line of description underneath in the small style, and the mono count line only where the count matters (species, plants). Move Labels/Backup/Sync off the plants head into the menu, where they already are. Same column width on every page.

### 2. A front page that shows plants before it lists them

The catalogue is the right thing for a return visit and the wrong first screen. Above the search, for a visitor with no plants, show what the site holds: a strip of eight to twelve photographed species with climate (chosen by rule, e.g. the most-recorded species of the twelve largest genera, rotated daily by date so it is not editorial), each a tile that goes to its page. The welcome card becomes one line above that strip and the "Add a plant" button in the head goes away for a visitor (the welcome card already offers it). The search box is the first control, the A–Z and the rows come after the strip. A grower with plants keeps today's layout with the "Today" strip on top.

Two smaller things on the same page: drop the white pill and the dot in the top-right corner of the species tiles (they encode climate status and photograph count, and read as a UI glitch); replace with the small text line that is already under the name. And a genus row whose hero has no photograph shows a grey square; hide the square and let the text start at the left.

### 3. Halve the species page without losing a figure

Keep the order. Change what is shown at rest:

- **In short** goes. The four glance cards say the same things with the same sources, and the Cultivation cards say them again. The one thing the paragraph added, the archetype sentence, moves to the first line of the Cultivation section (it is already there).
- **Methodology into "Why"** toggles. Every card's second paragraph ("Read from the median year of CHELSA…") becomes a "How this is read" disclosure under the figure, closed by default. The rule is one tap away; the figure stands alone. Same for the climate section's provenance paragraph and the habitat section's "Map marker" explanation.
- **The tab row** sits mid-page and wraps to two lines on a phone. Make it a single horizontal row that scrolls, and make it sticky under the top bar once the reader passes it, so it becomes the page's own navigation. On desktop it can stay static.
- **Synonyms** ("Also known as Anhalonium engelmannii…") appear unlabeled right under the tabs. Give them the "Names" heading in the Registers section, or a closed disclosure under the id card.
- **Photographs** are a three-column grid that goes on for screens; cap the section at six with "All 57 photographs" that expands.
- **Registers** (the papers list) is a long column of cards; show three, then "More".

The sourcing line under the id card is right; leave it.

### 4. The plant page should grow with the plant

A new plant's page shows the tracker's whole vocabulary at once. Collapse it to what a new plant has: the id card, one row of the four commonest actions (Water, Photo, Note, Move) with "More" for the rest, the log, and a single "Set it up" card that says which three things would make the page useful (a place, a photograph, a first measurement) with one link each. The stat tiles appear when there is something to count; "Habitat versus here" appears when the plant has a place with conditions. The disclaimer paragraph under it becomes a "Why" disclosure like the species page's.

The card stack on the plant page also mixes three visual grammars: white cards with headings, a dashed-border box for Remove, and a stat-tile row. Two is enough: cards, and the tile row.

### 5. Words

The site's copy is careful and it is also long, and the length reads as anxiety on a first screen. Three rules would fix most of it:

- A sentence of methodology never sits beside a figure at rest; it sits behind a disclosure.
- A page's description is one line. "Every plant you own, under its own number. Recorded on this device and nowhere else until you choose to sync." is two; "Your plants, each under its own number, kept on this device." is one.
- Counts in the mono style are figures, not sentences: "0 places · 1 plant with no place" is a sentence in a figure's clothes.

Specific lines: the front page's "8947 kinds" should be "8,947 species" (kinds is a term of art nobody else uses); "Wild records 662 in range · 197 open" needs the word "records" not "open"; "provenance not stated · plant 2026-09-25" on the id card should read "Added 25 Sep 2026" until there is a provenance; the plants page's "1 of 1. Backup." footer is a sentence fragment with a link in it.

### 6. Rhythm and type

The type system (Newsreader italic for names, the UI sans, the mono for figures) is good and consistent. What is not consistent is spacing: the species page's sections are separated by 40 px, the plant page's by 28, the settings page's by 32; section labels are 10.5 px tracked caps on some pages and 11 px on others. One `--section-gap` and one `.sec` style. The mono is used for three unrelated things: figures (right), the count line (fine), and the empty-photo message "The photograph did not load ((c) grower0…)" (wrong; that is a sentence). Empty states in the italic serif ("Nothing yet.") are lovely; use that style for every empty state, including the photo panel.

### 7. Motion and feedback

There is almost no motion, which is a choice, but two places need feedback: opening a genus row is a full navigation with no transition, so the row's expansion feels like a page reload (it is one); a 150 ms height transition on the tile grid and a highlight on the opened row would make it feel like a fold. And "Add" on the plant form goes to the new page with no acknowledgement; a one-line toast ("2026-0001 added") at the top of the plant page for three seconds closes the loop.

## The first visit, as it would be

Land: a title, one line saying what this is, a row of photographed species, a search box. Tap a photograph: name, photograph, the four figures with their units, the Wikipedia lead, and a short tab row that sticks. Read down: the cultivation cards one line each, the climate chart, the map, six photographs, similar species. Back: the rows by genus, where the genus just visited is highlighted. Nothing about benches, sowings or frost until there is a plant, and the first plant's page shows three things to do next rather than everything the tracker can do.

## What not to change

The accuracy line under every figure, the refusal-is-not-absence wording, the id card, the climograph, the segmented control and chip style, the tab bar's two-place visitor state, the menu, Settings as it is. The bones are right.
