# Round 107: the tracker's payoff (plan)

The first hand-off's round 7, planned against the code on 21 November 2026, after round 106. Round 107 was to be the
coarse-locations count (`scripts/dev/r107-coarse-count.ts`); that count runs on the PC alongside this round and the
blurred-locations build (the hand-off's round 5) takes the next corpus round.

The hand-off asks that each point be checked with the example collection first. What the code does today:

- **After "Add one to my plants"** the form saves and opens the plant's page with a toast ("2026-0001 added"). The
  page's comparison with the habitat (light, cold) is a closed fold at its foot, and with no space it draws nothing. The
  plant's space is optional, and a space holds no figures until it is edited on its own page.
- **Today with no plants** says "No growing plants yet. Add one and this page says what it needs." as a muted line in a
  box, with the example's offer under it.
- **The frost watch's "Use my location"** calls the browser's location prompt at once; nothing says why first. No town
  can be typed anywhere: Settings takes a latitude and a longitude.
- **The backup nudge** shows on My plants from the fifth plant, on every visit until "Not now" (which hides it for the
  tab) or a backup.

## The build

1. **The payoff.** A plant added one at a time opens its page with a card at the top, "Your plant against its
   habitat", holding one comparison of two figures, each named with its source, and no advice:
   - the space's floor against the habitat's cold floor, "Your windowsill: floor 15 °C (you set it), 10.6 °C over
     this habitat's cold floor, 4.4 °C (one night in a hundred colder, NASA POWER).";
   - else, with a light figure and no floor, the space's light against the open sky over the habitat (CHELSA), the
     plant page's own sentence;
   - a space with neither: one field there for the floor (the space's own, saved to the space), and the line after it;
   - no space: the space picker there, in one step, then the floor if the space has none;
   - no habitat climate: the card says so with the page's reason and draws no comparison.
   The card shows once, on the visit the save opened (the router's page state, not the address, so a reload or a shared
   link does not show it), and "Close" puts it away. The sentence is `src/lib/grow/payoff.ts`, the species page's
   placeLine and the plant page's coldCompare reading the same figures.
2. **Today with no plants:** one primary button, "Add your first plant", and the example's offer; the frost watch
   under it as before. No paragraph of instructions.
3. **The frost watch's location.** Before the browser asks: "Your location gives the forecast for your nights. It is
   kept on this device; only its position, rounded to about a kilometre, goes to MET Norway through cultifolio.com."
   Then "Use my location" or **a town**: a box that asks OpenStreetMap's Nominatim through cultifolio.com's own
   `/api/place` (asked on submit only, five answers, the name and country shown to choose from; nothing kept by the
   server), credited as its licence asks. Settings' site takes the same town box beside the coordinates. /about/how's
   privacy lines and the sources say so.
4. **The backup.** Once, at the tenth plant, on My plants, while there is no backup and no sync: "Not now" puts it away
   for good on this device (not only for the tab), and a backup or sync ends it. Today's "Kept on this device" line is
   unchanged.

## Tests

- r107a (unit): the payoff's sentence for each case (floor, light, neither, no space, no habitat climate, the units);
  the nudge's rule (9 plants none, 10 one, dismissed none, backup none, sync none); the place answer's reading.
- r107b (browser): add from a species page with a floored space, the card and its two sources; with no space, the
  picker then the line; a reload shows no card; Today with no plants; the reason before the location prompt; a town
  chosen sets the site (Nominatim answered by a route); the nudge at ten and gone after "Not now" across a reload.
