# Review round fifty: the first screen

One question asked of every page on a phone: what is on the first screen? On the catalogue, My plants, a place and a plant the answer was controls, notices and a band of nothing, with the first record below the fold; on the species page the answer was the facts grid, the disclaimer and five equal buttons before the figures the page exists for. The round is the mock-ups walked through with the author (a Design canvas: the species page as it was and as proposed, two front pages and the search as a mode; the author chose front page A, kept the pinned section bar and the Photographs and Papers sections) and the cheap fixes from the deep dive that preceded them. Nothing is derived that was not derived before; the same figures, reordered, and the chrome made to step aside.

## 1. The front page

1. **One line of head** (own; the author's phone). `PageHead` has a `compact` form: on a phone the kicker and the sentence under the title go, the count sits beside the title, and an action beside the title that the phone has elsewhere (`.wideonly`; the + in the top bar adds a plant) is hidden, so the head is one line; where the action stays (Places, Propagation) the count goes under it, small.
2. **The search above the sampler** (author's choice, front page A). The photographed species of the day sit under the search as a row of 112 px tiles, the lead tile double width with a 2:1 crop, scrolled sideways, rather than a grid that was the whole first screen. The welcome is one line with its × beside it. The grouping segment and the A–Z button are in the toolrow at every width. e2e: the strip under the search, under 200 px tall, the lead tile over 200 px wide and the next 112; the first genus row begins above the tab bar.
3. **The grower's front page**: the toolrow under the head, Today under it, the own tiles three to a row on a phone; the reference-photograph offer beside them is one line with its disclosure behind a tap (the `link` form of `RefPhotoOffer`, as the plant page already had). e2e: the second tile is side by side with the first and on the first screen.

## 2. The search as a mode

Typing in the catalogue box on a phone is a mode (`searchMode`, a non-empty query): focus scrolls the toolrow under the top bar and pins it; the head, the strip, the view segment, the grouping, the chips, the letters and the welcome step aside; the matches draw as rows (`hitrow`: a 40 px thumbnail or the initial, the name, one line of common name · family · climate word) with the count above them, so five or six fit above the keyboard; Cancel, or clearing the box, puts the page back as it was; Enter opens the first match, as before. The head steps aside too, so a page too short to scroll still has the box under the bar. On the grower's view the same mode searches the device, as before. e2e: the chrome gone while typing, two rows for "Copia", Enter opens the first, Cancel restores the strip and the chips with the box empty. The earlier search tests read `.hitrow` where they read `a.tile`.

## 3. The species page

1. **The id card is the name, the common names and one line**: family · the first two native regions · the archetype word. The facts grid (family, author, native range, wild records) and the sentence about derivation move to a last section, **Where this page came from**, before Provenance, where someone checking the page looks. The hidden "At a glance" heading stays for the section bar and screen readers; the four cards follow the card directly.
2. **One primary action.** Add one to my plants leads, with the grower's own numbers beside it (the first three and a count; the old row of six overflowed a phone). Sow seed, Follow, Compare and Share card are a row of words under it, 40 px tall for a thumb.
3. **In short** is a plain card with a shorter summary line ("by rule, from the cards · not written by a person"); the `placeLine` under the figures compares the species' cold floor with the first place of the grower's that has a floor set, linked to the place, in the warning colour when the place is colder.
4. **The failed-photograph line is one centred run of text**: the sentence and its link were two flex columns, the link's words stacked; the text is one span now, and the flex box centres that. The In short summary clamps to two lines on a phone (with the standard `line-clamp` beside the prefixed one, which svelte-check asked for).
5. Tests: the reference-order test reads the facts from `#s-facts + .facts`, checks the id card has no "Described by", the primary button's text and the first word of the second row; the round-seventeen six-plants test expects three numbers and "+3".

## 4. My plants, a place, a plant, Today, toasts

1. **My plants**: compact head; the search and the sort share a row (the sort at most 44 % wide); the chips are one row scrolled sideways; "Kept in this browser only: back up or install the app." is one line; the reference-photograph offer is one line until opened. e2e: the head's button hidden, the inline count, the search and the sort on one line, both plants on the first screen, the offer closed.
2. **A place**: the grey band above the card is gone (it carried only the kind, which the line under the name says; the path to the place is in that line now: "Shelf inside Laundry room · 2 growing plants"); the empty pills row is not rendered; Water all, Feed all and Audit are the row of buttons, and Add a plant here, Move plants here, Start a batch here, Labels and Edit a row of words under it (Add a plant here is the button when the place is empty); the "no floor, light, watering or audit" line and the "add coordinates for frost watch" line are one line when both apply. e2e.
3. **A plant**: the Set it up checklist is one row of steps scrolled sideways on a phone, the next step outlined in the accent; four stacked rows stood between the name and the plant's first figures. e2e.
4. **Today** is tighter on a phone (13 px lines, 32 px buttons). **Toasts** rest 2.4 s instead of 3.2: the page says the same thing in full; a toast with an action keeps its 8 s.
5. **Places and Propagation** wear the compact head too.

## Not taken, or later

- Front page B (a photograph as the hero with the search over it): the author chose A; B's board stays on the canvas.
- The Today tab in place of Frost, build-time catalogue and search shards for a much larger corpus, a cross-tab sync leader that leaves same-tab pre-emption alone, and a two-column catalogue on wide screens: noted in the deep dive, each a round of its own.
- The plant page's sections (Photographs, Log, Notes, species notes, Provenance) keep their order; the timeline-first order from the deep dive waits on a look at how the log reads with a photograph grid above it.

## Counts

437 unit tests on 44 files (unchanged), 92 e2e (two new, several re-pointed), local live check 10 of 10.
