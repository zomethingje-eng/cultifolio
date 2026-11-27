# Round 128: the lens, Another species (SPECIES 20, third part)

The species hand-off's round 20 after rounds 126 and 127: "Another species", a second species' habitat set beside this
one. Built in the clone on 27 November 2026, during the daily run.

## Done

- **The row** gains "Another species" (`LENS_VIEWS`). A search box picks the species with the catalogue's own answers
  (`searchCatalogue`, the header search's `/api/search`: the words typed and nothing else); the species picked is read
  from its page's JSON (`/api/dossier/<key>`), as any visitor's browser reads it. Nothing of the reader's is sent.
- **Drawn:** the other species' medians dashed on Temperature (days and nights), Rain, Light and every thin row, without
  bands; the scales take its figures.
- **Months:** each species in its own season. The panel keeps its own months (this view does not hold them on the
  reader's); where the two typical cells lie in different hemispheres the other's months are moved six
  (`otherShift`), and the card says so.
- **The card's lines** (`speciesLines`): the two ranges of average nights, the two cold floors (only where both are on
  file), the two years' rain, the two warmest months' average days, each with both figures; the closing line; "The full
  comparison" to `/compare?s=<this>,<other>`.
- A species whose page holds no habitat climate is said as such, and nothing is compared; a page not reached is said so.
- /about/how (#lens-species, what the search and the pick ask), /changes.

## Decisions

- **Its requests are the reference's, not the reader's.** The hand-off's rule that no view but Outdoors makes a request
  is about the reader's spaces; Another species asks the catalogue's search and a public page's JSON, as the header search
  and the compare page do, and /about/how says so.
- **"At home, aim for" moves in its own round** (129): it moves tests in five files (r87s2, r87s2u, r106b, r87v and the
  tab bar's "At home"), and this round touches nothing that was there.

## Not yet

- "At home, aim for" into the panel (#at-home landing on the panel, its rows to the Cold, Heat and Air slots and the
  table, "Grow light" to Under lights' last row, /about/how's section rewritten).
- The plant page's comparison card (MYPLANTS 31).

## Tests

- r128a (unit, 3): Welwitschia mirabilis against Fenestraria rhopalophylla (its page data of 27 November, climate only, as
  a fixture): nights 10.6 to 16.1 against 12.5 to 18.7 °C, cold floors 5.7 and 5.5 °C, rain 56 against 80 mm, the warmest
  days 22.3 and 30.9 °C; a missing floor's line not drawn; the hemispheres. FAILED on 9176178.
- r128b (browser, 3, one at phone width): on Copiapoa cinerea's page, the picked species' four lines and the full
  comparison's link, its medians drawn; the other hemisphere moved six and said; a page with no climate said so. The test
  corpus holds one climate, so the search answer and the other page's JSON are Fenestraria's page data, served as the
  site serves them. FAILED on 9176178.
- r76p strip 2's baselines, r87p and r87rec on the new /changes lines.

## Gate and deploy

(Written at the gate.)
