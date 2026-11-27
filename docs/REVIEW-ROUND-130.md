# Round 130: a plant's page, its comparison card (MYPLANTS 31, item 5)

The plant hand-off's round 31 asks for "On Bench 2, against its habitat", open, as SPECIES 20's lens for the plant's
space. Built in the clone on 27 November 2026, during the daily run. The page's order (photographs first), the one-line
folds, "No longer held" as a quiet link and Remove in the menu are round 131.

## Done

- **The card** (`src/lib/ui/grow/CompareCard.svelte`): "On <space>, against its habitat", open under the plant's figures,
  where the space is known and the species page has a habitat climate. A small chart of the habitat's days and nights (or
  its daylight, for a lit space) with the space's own temperature or light drawn across; the lines of the space's view
  (`greenhouseLines`, `windowsillLines`, `lightsLines`, as on the species page); the closing line; "The species page"
  to its year panel. A missing input is its prompt ("Set its light", "Set its temperature"), linking to the space's form,
  never a figure. Nothing leaves the device.
- **A space's view from its path** (`viewOfPath`): a bench, tray, shelf, room or other space with its light and hours
  set is under lights; without them it takes the view of the nearest space above it that has one (a bench in a greenhouse
  is under glass), else Windowsill. The species page's lens reads spaces the same way now.
- **The fold** of rounds fifty-eight to 129 ("Habitat vs this space") is the card's "how", closed under it: "How it
  compares: the habitat and this space", with the rain season, the light and cold figures and "What this compares", so
  every figure and source it held stays one tap away (the hand-off's rule check).
- /about/how (#lens-plant), /changes.

## Decisions

- **No card for a plant without a space.** The hand-off puts round 27's placing card there; the page's setup steps
  (round 119) already lead with "Placed", which opens the move, so a second placing card would say it twice.
- **A bench in a greenhouse is under glass.** The hand-off's table gives a bench with no lamp the Windowsill view; read
  alone it would set a greenhouse bench against a sill's light, so the kind of the space it stands in decides.

## Tests

- r130a (unit, 1): a space's view from its path. FAILED on 9176178.
- r130b (browser, 2, one at phone width): a bench in a greenhouse held at 5 °C, the card's heading, its line, the closing
  line and the species page's link, the fold closed under it with its rain season; a windowsill with no light, its prompt
  and no figure; a plant with no space, no card. FAILED on 9176178.
- Moved: r62l-plant's heading of the fold.
- r87p and r87rec on the new /changes lines (the strip unchanged).

## Gate and deploy

(Written at the gate.)
