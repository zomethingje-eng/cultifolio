# Round 105: header and browse tidies (plan)

The first hand-off's round 3, less its search items, which round 104 built. Planned against the code on 21 November
2026, after round 104.

## The build

1. **The static label beside the wordmark goes.**
   - `+layout.svelte` draws the crumb at all times. With no crumb set (a list page), its one part is the section's name
     ("Species", "Today", "Cultifolio"), which repeats the active tab.
   - Decision: draw the crumb only where it is a trail (two parts or more). Two pages set one part, About and Settings,
     which is the same label; the back link stays where `isDetail` gives it somewhere to go.
2. **Sync and Add say their names on desktop.**
   - "⟳ Sync" and "+ Add …" from 901 px. The visible word is the start of the accessible name, so speech and sight
     agree (WCAG 2.5.3).
   - Sync is shown only once sync is set up or the collection holds a plant. A first visit sees no sync control for an
     empty collection; /sync stays in the menu.
3. **Settings and Labels shown directly on a wide desktop** (1200 px and over), after About in the main nav. "More"
   keeps the rest, and the phone keeps everything in "More".
4. **The default browse order: most grown, with a habitat climate first.**
   - A new `Sort`, `grownc`, is the default (no `sort=` in the address). Species with a habitat climate come first, then
     most grown, then A to Z.
   - "Most grown" alone stays as `sort=grown`.
   - The order line reads "Order: most grown, habitat climate first · most grown · A–Z · coldest record low first".
   - /about/how says the rule (rule 5). A pin keeps filters, not the order, so no pin changes.
5. **Fonts.** Measure what the home page and a species page load (the Latin Extended file, italics, weights), and say
   it in the record. Change the CSS only where a file loads that no glyph on the page needs.

## Tests

- **r105a (unit):** `grownc`'s order, the address round trip, and `sortOf` when nothing is counted.
- **r105b (browser):**
  - no section label on a list page, and the trail kept on a species page;
  - Sync and Add words on desktop, and no Sync on a fresh device with no plants;
  - Settings and Labels in the bar at 1280, not at 1024 or on a phone.
- The fixture corpus counts nothing as grown, so its /browse is in A to Z order; the default order is proved in units.
