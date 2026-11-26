# Round 127: the lens on your spaces (SPECIES 20, second part)

The species hand-off's round 20 after round 126's Outdoors: the views that read the reader's own spaces, Greenhouse,
Windowsill and Under lights, and which view the panel opens on. Built in the clone on 26 November 2026.

## Done

- **The row** "Compare with: Nothing, Outdoors, Greenhouse, Windowsill, Under lights" (`$climate/lens-spaces`'s
  `LENS_VIEWS`). It wraps, as round 126's did, so a phone at 200% text does not scroll sideways.
- **A space's kind chooses its view** (`viewOfKind`): garden bed and outdoors open Outdoors; greenhouse and cold frame
  Greenhouse; windowsill Windowsill; room, shelf, bench, tray and other Under lights when the space's light and hours are
  set, else Windowsill. A space's kind is its own or the nearest above it that sets one; its temperature and light are
  inherited as everywhere (`collection.conditions`). Where several spaces fit the view, "Your space" picks one.
- **Which view opens** (`openingView`): the space of the reader's plant of this species whose log was written last (the
  day it was acquired where its log is empty); else the view used last on this device (`cultifolio.lensView`, named on
  /about/how, its sample copy on /about/formats); else Nothing. A last-used Outdoors with no site set opens Nothing, so
  nothing is asked.
- **Greenhouse:** the temperature the space is held at, or bottoms out at, drawn solid across Temperature, against the
  habitat's cold floor and its coolest month's average night ("Held at 5.0 °C: 0.5 °C under its cold floor (5.5 °C).");
  "Light under glass is not estimated." It asks nothing: the site's nights and the line on the months below the floor are
  drawn only when Outdoors has read the square on the same page.
- **Windowsill:** the space's light and hours as mol a day, drawn solid across Light, as a share of the habitat's darkest
  and brightest months; its coldest temperature against the coolest month's average night.
- **Under lights:** the table of µmol/m²/s at the plant for 25, 50, 75 and 100% of the darkest month at 12, 14 and 16 h,
  and the year's mean last (the figure "Grow light" shows today); the space's lamp marked where it is within 5% of a
  cell; its mol a day as a share of the darkest month; the day length's range and how much cooler the nights are.
- **Lux at entry:** the space form's "Light typed in" (µmol/m²/s or lux); lux is saved as µmol/m²/s × 0.0185 (Apogee
  Instruments' factor for sunlight, credited to Thimijan and Heins, 1983; daylight through glass taken as sunlight). What
  is stored stays µmol/m²/s, so nothing else reads a new field.
- A view whose space lacks its input names the input and links to the space's page; a view with no space of its kind
  links to Spaces. Every line names two figures; none says what the plant will do.
- /about/how (#lens-spaces, the sums and the factor; `cultifolio.lensView`), /about/formats (the sample's copy), /changes.

## Decisions

- **Greenhouse asks nothing of the site.** The hand-off draws the site's nights in Greenhouse "with a site set" and also
  asks that no request leave the device in any view but Outdoors. The second rule wins: Greenhouse uses the square only
  when Outdoors has read it on the page.
- **"Changed most recently"** is the plant's newest log line (no record carries an edit time); the day acquired where it
  has none.
- **"At home, aim for" stays** until the round of Another species, which takes the rest of SPECIES 20 (the table's rows,
  #at-home landing on the panel, /about/how's section rewritten).

## Not yet

- Another species, and "At home, aim for" moved into the panel (SPECIES 20's last part).
- The plant page's comparison card (MYPLANTS 31): this lens for the plant's space.

## Tests

- r127a (unit, 6): the hand-off's figures on Welwitschia mirabilis's page data: Greenhouse held at 5.0 °C, 0.5 °C under
  the floor and 7.5 °C under the coolest nights; Windowsill at 16,000 lux over 8 h, 296 µmol/m²/s, 8.5 mol a day, 28% and
  16%, 2.5 °C warmer; Under lights 176, 151, 132; 352, 302, 264; 528, 452, 396; 704, 603, 528; the kinds; the view that
  opens with a plant in a greenhouse, plants in two kinds of space, a last-used view and neither; the forbidden words.
  FAILED on 1486d7c.
- r127b (browser, 3, one at phone width): a plant in a greenhouse opens Greenhouse and nothing is asked; with no plant
  Nothing, then the view used last after a reload, Windowsill's and Under lights' lines from the page's own figures, a
  space without light named with its link; lux saved as µmol/m²/s. FAILED on 1486d7c.
- r76p strip 2's baselines, r87p and r87rec on the new /changes lines (the lux line shortened: it wrapped at 1024 px in
  Chromium alone).

## Gate and deploy

(Written at the gate.)
