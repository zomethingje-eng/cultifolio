# Agent walk 1: six personas against the real corpus

Six subagents each walked the build as one kind of person, in a fresh Playwright context, with the base URL and a persona brief and nothing else. They reported what they saw; every report was then checked against the running build and the source before it was accepted. This file records the setup, the baseline, the findings that were confirmed (ranked, with the file that caused each and what was done), and the ones set aside with the reason.

## Setup

The sandbox checkout was built from the working tree at commit `59f217d` ("Places in the top bar; stable scrollbar gutter") plus the presentation-pass files that were staged but not yet committed. The real corpus (`corpus.zip`, a `Compress-Archive` of `static\s\v2`: `index.json`, 8,947 dossiers, 1,321 genus files) was unzipped to `static/s/v2/` and `static/.assetsignore` was emptied for the duration so `wrangler dev` served it; the server reads that folder before the four-species fixtures (`src/lib/server/dossiers.ts`). `npm run build`, then `npx wrangler dev --port 4173`. Photographs, iNaturalist, GBIF and the forecast source are unreachable from the sandbox; a refusal from any of them was ruled out as a finding in the brief. After the walk the corpus was moved out and `.assetsignore` restored so the e2e suite ran against the fixtures it was written for.

Personas: A, a stranger arriving from a comment link at a species page on a phone; B, a collector on a desktop adding fifteen plants, benches, labels; C, a seed raiser on a phone; D, a grower who goes offline mid-session; E, a keyboard and screen-reader user; F, a settings and units person on a phone, `en-US`, later with a southern site.

## Baseline

Before the walk: `npx vitest run` 30 files, 267 tests, all passing; `npx svelte-check --threshold warning` clean; `npx playwright test tests/e2e/smoke.spec.ts --workers=1` 46 tests, all passing (the two sync tests are slow under load and were run alone once to confirm). After the fixes below: 267 unit tests, 50 e2e tests, svelte-check clean.

## Confirmed findings, ranked

Severity is the brief's scale: wrong figure or lost data first, then a blocked or silent flow, then confusion, then cosmetic. "Fixed" means the change is in this commit with a test where the brief asked for one.

### Wrong figures and lost data

1. **A germination count above the seeds sown, a loss above what is up, a potting beyond what is in the pot: all accepted.** (C1, C2, C3.) The batch page believed any number; potting fifty from an empty pot minted fifty permanent accession numbers. `src/routes/sowings/[id]/+page.svelte`: each form now refuses with a sentence naming the limit ("15 is more than the 10 that went in", "Only 5 in the pot; each potted plant gets a number that is never reused"), the count may not fall below the last count (losses are losses), and Pot up is disabled until something has been counted. The inputs' native `max` was dropped so the page's own sentence is what the user reads. Fixed; e2e "the batch page checks what it is told".
2. **Dates in the future, and a propagation dated before the parent was acquired, accepted.** (C4, C5, C9.) A batch sown "2027-03-01" was numbered S2027-001 and read "day −157". `dateProblem()` on the batch page and `max={localDate()}` plus `#s-date-bad` on `src/routes/sowings/new/+page.svelte`; a cutting's date must be on or after the parent's acquisition. Fixed; same test.
3. **A count of zero after twelve was logged but the headline stayed twelve.** (C6.) Covered by the not-below-the-last-count rule above. Fixed.
4. **Settings previewed "next plant: 2026-0001" whatever had been issued.** (D2.) `src/routes/settings/+page.svelte` passed internal record ids to `nextAccession` instead of the numbers taken. It now calls `collection.nextAccessionNumber(scheme)` (new on `src/lib/db/collection.svelte.ts`, with `numbersIssued`). Fixed; e2e "settings previews the next number".
5. **Editing a plant's acquisition date and source left the old ones in the log.** (B3.) The Acquired event was written once and never touched. `src/routes/plants/[acc]/+page.svelte` now updates it on save (`collection.put('event', acq.id, { d, note })`). Fixed; same test.
6. **The plant page said "no coordinates set" with a site set, and never followed the site's hemisphere; the species page's cards and the compare page disagreed with the In-short note under a southern site.** (F1, F2, F3.) The plant page used only the plant's own place; `cultivationSheet` was called without the reader's latitude on the species and compare pages. `readerLat` (site, then benches) now reaches the sheet on all three, and the plant page falls back to the site. Fixed; e2e updated.
7. **"21 numbered" after a removal though 22 numbers were issued.** (B10.) The count was of growing plants. `collection.numbersIssued` counts numbers taken; the plants page reads "N numbers given". Fixed.
8. **The front page offline fetched `/api/index` in a tight loop, hundreds of times a second.** (D1.) The `$effect` read `loadingFull`, which `finally` reset, so it re-ran at once. `src/routes/+page.svelte`: a failed load sets `fullFailed` and is retried only by the "Try again" button, which now also appears above the grower's own tiles. Fixed; e2e "the front page offline asks for the catalogue once".
9. **"4 present, 2 not seen" while every plant on the bench read "seen today".** (B5.) The audit wrote a Seen event only for ticked plants and the page had nothing to say about the others. `src/routes/benches/[id]/+page.svelte` marks the unticked ones as missed at the last audit. Fixed.
10. **The 4 × 2 in label cut the name to "Haworthia truncata ‘Lime Gre…" with half the label blank.** (B4.) The QR code took the whole 50 mm height. `src/routes/labels/+page.svelte`: the code is capped at 22 mm and the name wraps to a second line rather than being cut. Fixed.
11. **Rain in inches printed "0.1 / 0.0–0.2" in the monthly table, losing the driest month.** (F4.) `src/lib/core/units.ts`: two decimals below one inch. Fixed.

### Blocked or silent flows

12. **Enter in the species field filed a plant.** (E2.) `src/lib/ui/SpeciesPicker.svelte`: Enter never submits the form; it picks the highlighted suggestion or, pressed twice, keeps the typed name. Fixed; e2e "keyboard".
13. **Tabbing past a partial name filed "Lithops auc" as an unlinked plant.** (E3.) The picker now offers "Did you mean Lithops aucampiae?" as a button when the field is left on a near miss. Fixed.
14. **The picker offered "Lupinus polyphyllus" as the only suggestion for "Aloe polyphylla".** (B1.) Local suggestions from another genus carry a "similar spelling, another genus" flag so they are not mistaken for the name typed. Fixed. (Aloe polyphylla itself is not in the reference; see rejected.)
15. **An unresolved name was not flagged when the name service was down**, against the form's own promise. (B2.) An `unreached` pill: "name service not reached — kept as typed". Fixed.
16. **A slip in the batch log could not be removed.** (C7.) Log rows have a two-step remove; potting rows are kept because their plants exist. Fixed; same batch test.
17. **"Mark failed" was offered on a batch with potted plants**; the entry forms stayed live on a done batch. (C8, C15.) Mark failed only when nothing was raised; forms hidden once the batch is done. Fixed.
18. **Tab did not stay inside the menu and stuck on its last item**; Shift+Tab left to `body`. (E1.) `src/routes/+layout.svelte` traps Tab among the visible items. Fixed; e2e "keyboard".
19. **Focus fell to `body` after More ▾ and after every Record; nothing was announced.** (E4, E5.) Focus moves to Feed after More expands; `closeLog(recorded)` returns focus to the verb bar and a `role=status` toast says "Watered recorded". The Measure form focuses the first figure, not the note. Fixed.
20. **Escape did not close a quick-verb form.** (E6.) Fixed.
21. **No skip link; focus never moved after navigation.** (E8.) A "Skip to content" link and `#main` focused after each client navigation. Fixed.
22. **Search results not announced; filter chips colour-only.** (E7.) Counts are `role=status`, chips carry `aria-pressed`, Enter opens the first match. Fixed. (Arrow keys into the results: not done; see rejected.)
23. **Six photograph links with one identical name.** (E9.) Each is "Name: photograph i of n, credit". Fixed.
24. **The root URL offline fell to the "No connection" page once the HTTP cache lapsed.** (D3.) `/` added to the service worker's precache. Fixed.

### Confusing

25. **Back in the top bar went to the front page, and the search was lost on return.** (A2, A3.) Back uses `history.back()` when there is a client navigation to go back to; the search lives in `?q=` via `replaceState`. Fixed.
26. **Section-row jumps landed under the sticky bars; the active chip scrolled out of view; Related and Registers were off the edge with no hint.** (A1, A8.) `scroll-margin-top` on the section headings; the row scrolls its active chip into view; the phone tab row has a right-edge fade. Fixed.
27. **Compare on a phone hid the third species with no hint; row labels scrolled away; the year chart was unreadable at 220 px.** (A4, A5.) A swipe hint line, sticky row labels with a background, and the climographs replaced by "The chart is on the species page." on phones. Fixed.
28. **"Share card" gave nothing to see.** (A9.) `src/lib/ui/ShareCard.svelte`: "Saved to your downloads as <file>. Open it". Fixed.
29. **"In short" named a card that did not exist ("Temperature") and said "set your site in Settings" without a link.** (A10.) Fixed, with the e2e updated to "Warmth and air".
30. **The photographs footnote said the sources "did not answer" under fifty-seven credited photographs.** (A11.) The footnote appears only when a source refused or errored, and not at all when there are no photographs. Fixed.
31. **Price could not be entered when adding a plant.** (B6.) A price field on the add form. Fixed.
32. **The batch-add line named one number for two plants.** (B8.) "They will be numbered from …". Fixed; e2e.
33. **A removed plant's number page said only "No plant with this number".** (B11.) It now says the number is reserved and why. Fixed.
34. **Sowings list defaulted to "In progress" and a just-finished batch vanished.** (C10.) Defaults to All when nothing is in progress. Fixed.
35. **Provenance vocabulary differed between the sowing form and the plant.** (C11.) The form's options and `provLabel` on the plant page use one wording ("F1, raised from wild-collected seed"; "cultivated seed (Fn)"). Fixed; e2e updated.
36. **Cuttings batch headed "How it was sown".** (C13.) "How it was started" for vegetative batches. Fixed.
37. **A toast from the previous page persisted onto the next.** (C14.) `toast.onNavigate()` hides a toast older than 600 ms. Fixed.
38. **"Gambia, The" read as two places.** (A13.) `unitName()` in `src/lib/core/regions.ts`. Fixed.
39. **Footer links sat under the phone tab bar.** (A7.) Bottom padding on phones. Fixed.

### Cosmetic

40. **Thousands separators missing in rain figures; no space before units on glance cards; "in range· open" and "credit.Show all" without spaces; extreme-day label colliding with "cold quarter".** (A6, A12, A14, B12, C12, F5, F6.) `rain()` separates thousands, glance values carry a space, the middle dots and "Show all" have their spaces, the cold-quarter label sits at the foot of the temperature band, the monthly table no longer wraps and its first column is sticky. Fixed.
41. **Bench edit field showed "4.44" for a floor the page showed as "4 °C"; the plant page rounded the coldest night differently from the species page.** (F7, F9.) One decimal in both places. Fixed; e2e regex updated.
42. **Numbering preview showed "ACC-0001" with the prefix field empty while the button said "ABC-0001".** (F8.) Fixed.

## Set aside, with the reason

`/species/aloe-polyphylla` is a 404 (B1, D5): the species is not in the reference; the brief named it as an example, not the app. Hybrid parentage expanded to "Ariocarpus retusus × Ariocarpus trigonus" (B9): by design, the abbreviated form is a convention of writing, the record holds the full names. No multi-select move from a bench page (B13) and no species picker on the plant's Edit form (B7): features, not defects; noted for later. The "Water" verb highlighted by colour only (E, snapshot): it is the most-used verb and its filled style is emphasis, not state; left. Compare tray additions not announced (E10): the button's own `aria-pressed` changes, which a screen reader reads; left. Arrow keys from the search box into the results (E7): Enter opens the first match instead; a listbox over the tiles is a larger change than this pass. Enter in the Acquired date field submitting the form (E2, second half): standard form behaviour on a text-like field; left. The Origin grouping's oddities such as Yukon under "Eastern North America" (A13, first half): the grouping follows the region table's own units for the widest-ranging species; not changed here. The picker offering nothing offline with no cached index (D4): the "name service not reached" pill covers the resolution side; a message for the empty suggestion list is a recommendation. The labels page arriving with every plant pre-picked (B, "more steps"): a preference, not a defect.

## What the six said in one line each

A: a careful climate reference whose unit toggle is flawless, but the phone's Back and Compare needed work. B: numbering, batches, moves, audits and the CSV round trip were accurate; read the species suggestion before clicking. C: the seed-to-numbered-plant chain is coherent and links both ways; the batch page believed any figure. D: every write made offline was there exactly once after reconnecting; the front page offline needed a guard. E: everything is native HTML, so once a control is reached it behaves; the two silent submits were the real hazards. F: every setting stuck and the unit switch propagated everywhere including labels; the hemisphere disagreed between pages.
