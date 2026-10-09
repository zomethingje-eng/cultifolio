# Round 61 self-review: accessibility and performance (area "a11y-perf")

Most of what round 60 found is fixed and holds up under test: the toast no longer traps Tab, every new action keeps focus on a named control, Today and the sample bar no longer shift, forced colours draw the current tab and the toast's edge, the 320 px / 200% views no longer scroll sideways, the bars go static at 400% zoom, and the grow layer is out of the shell (about 25 KB gzip off every page). The worst problem left is new and is in select mode: on a phone at 200% text the sticky bars cover 682 to 753 of 700 px, and Tab reaches tick boxes that are entirely hidden; even at 100% text, 3 of 12 focused tick boxes sit fully under the select bar, because the focus helper never sees that bar (P1). After Archive, the Undo toast covers the very button focus was moved to at 320 to 375 px (P2). A returning grower's front page shifts by 0.14 to 0.20 at 1280 (P2), Today's new "Show N more" drops focus to the page body (P2), and Today says nothing when the species sheets are refused or stall, which reads as "no plant is resting" (P1, rule 2).

How I tested. Everything ran against the shared build at 127.0.0.1:4173 with Chromium through Playwright and axe-core 4.11 (from round 60's install), on Node 22. Collections were written straight into IndexedDB (12, 30, 300 or 3,000 plants, three places, a seed batch, a shared number, a followed species; one plant with 30 events and 6 photographs). Scripts and logs are in `/tmp/r61rev/out/a11y-perf-scripts/`; screenshots (89) in `/tmp/r61rev/out/shots/a11y/`.

What ran:
- axe: 65 completed runs on the round's changed views (25 seeded states, 4 public, 6 sample states), light at 390 and dark at 1280, plus public and sample in light at 390. Light 1280 and dark 390 were not run for lack of machine time.
- Reflow: 35 states at 320 px with 200% text (profile font size 32 px) and 35 at 320 x 256 (400% zoom), with sideways scroll, clipped text, small targets and bar coverage.
- Focus under bars: Tab through select mode at 390 x 844 (100%, 150%, 200% text), 320 x 700 (200%) and 1280 x 720, testing five points of each focused row with `elementFromPoint`.
- Keyboard only, end to end at 1280: add a plant, water in select mode with Undo, archive with Undo, Move with no place, import a three-line paste, print labels, Today's Water N here with Undo, the menu's Download, the Wanted note, and the toast's 30 s cap. Every live-region change was logged by a MutationObserver.
- The toast's live region in Chromium's accessibility tree (CDP `getPartialAXTree`) at rest, filled and emptied.
- Forced colours in light and dark at 390 and 1280.
- CLS at 4x CPU, fonts blocked and loaded, photographs served locally so the sandbox's failed photo host does not count: `/`, three species pages, `/plants`, `/today` (300 and 3,000 plants), the sample's first entry and five sample pages.
- JS bytes per route: every script a cold load fetches, gzip -9 of each body.

Limits: the machine ran at load 10 to 44 on 2 CPUs and Chromium crashed about ten times under memory pressure; each crashed state was rerun. No real screen reader: semantics come from the accessibility tree and DOM. Timings are compared within a run, not with round 60's absolute figures.

Tests: `/tmp/r61rev/out/tests/a11y-perf--round61.spec.ts`, 9 e2e tests. Tests 1 to 7 FAIL on current code (run here: all 7 failed for the stated reason), tests 8 and 9 PASS as guards. Run with `PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/a11y-perf--round61.spec.ts --retries=0`.

## Findings

### 1. P1. Select mode hides the focused tick box: under the select bar at any text size, and under all the bars at large text (confirmed)

Two causes, one symptom: a keyboard user Tabs onto a tick box they cannot see (WCAG 2.4.11, AA).

- **The focus helper never counts the select bar.** `keepFocusClear` (`src/lib/ui/focus.ts:56-80`) finds the bottom bars by walking up from the screen's edge with `elementsFromPoint`: the tab bar, then whatever touches it. The select bar sits 8 px above the tab bar (`SelectMode.svelte:207`, `bottom: … var(--tab-h) + 8px`), so the walk finds the gap and stops (`if (!found) break`, line 70). The bar is not marked `data-cover`, so the hand-marked pass misses it too.
  - At 390 x 844, 100% text, 12 plants: rows 2026-0008, 2026-0007 and 2026-0002 were entirely under the select bar when focused, and two more partly (`obscured.mjs`).
- **At large text the bars leave no room.** The round's fix makes the select bar static only under 480 px tall. At 320 x 700 with 200% text, the fixed and sticky layers are: top bar 51, the tool row 214, the select bar 256 to 375, and the tab bar 113. That is 682 to 753 of 700 px (`zoom61-text200` with `COVER=1`), and 696 of 700 with the place filter's extra select. Screenshot `obscured-select-320x700-fs32.png`.

Tick boxes reached by Tab:

| Screen | Text | Fully hidden | Partly | Visible |
|---|---|---|---|---|
| 390 x 844 | 100% | 3 | 2 | 7 |
| 390 x 844 | 150% | 3 | 4 | 5 |
| 390 x 844 | 200% | 8 | 4 | 0 |
| 320 x 700 | 200% | 6 | 6 | 0 |
| 1280 x 720 | 100% | 0 | 2 | 10 |

- Should: a focused tick box is never entirely covered, and at 200% text the list keeps most of the screen.
- Smallest fix, checked by injecting it into the running page:
  - `data-cover="bottom"` on `<div class="selbar">`;
  - the short-screen rule in em, which a media query reads against the browser's own text size: `@media (max-height: 30em) { .selbar, .toolrow { position: static } }` in place of `max-height: 480px` (30em is 480 px at 100% text and 960 px at 200%). Apply the same to `theme.css:395` and `+page.svelte:886`.
  - With both, fully hidden became 0 in all three phone cases (partly: 6, 4, 6, where only the row's edge touches a bar).
- Tests: `a11y-perf 61-1` and `61-2` (FAIL).

### 2. P1. Today says nothing when the species sheets are refused or stall, so a resting plant is listed as due without a word (confirmed; overlaps the grower area)

- `src/routes/today/+page.svelte:103`: `restRule` returns null when `sheets` is null, so every plant whose habitat is in its dry season moves silently into the "Water N here" count. Nothing on the page says the sheets did not answer.
- Measured (`sheetsfail.mjs`, `more.mjs`):
  - `/api/sheets` refused: the stops are drawn at once. The page text has no "not checked", "did not answer" or "resting", and "How Today decides" still promises the rain rule.
  - With 300 plants, the Greenhouse stop read "Water 75 here" with the sheets and "Water 100 here" with them refused.
  - `/api/sheets` and the corpus stalled: "Reading the species sheets…" for at least 10 s and under 30 s (two 10 s timeouts in `index.svelte.ts:77`), then the same silent page.
- Rule 2: a source that did not answer is "not checked", never "none". Here it is counted as "not resting". I rank it P1; by the letter of the rules it could be P0. It predates this round, but §7 asks what Today shows in this case.
- Should: a line in the stop list, as the frost watch's `NotChecked` does: "Resting months not checked: the species sheets did not answer. Every plant past its rhythm is listed."
- Smallest fix: `let sheetsFailed = $state(false)`, set from `m === null` in the effect at line 94, and render a `NotChecked` line under "By place" when it is set.
- Test: `a11y-perf 61-6` (FAILS).

### 3. P2. After Archive in select mode, the Undo toast covers the button focus was moved to (confirmed)

- `SelectMode.svelte:136` moves focus to `#sel-archive` before raising the toast. On a phone the toast sits at `bottom: 66px` (`ToastBar.svelte:89`), which is over the select bar's second row. The toast with an action takes taps (only `.through` toasts pass them on).
- Measured (`overlap.mjs`), share of each bar button under the toast:

| Width | After Water | After Archive |
|---|---|---|
| 320 | Archive 100%, Print labels 54% | Archive 100% (focused), Print labels 92% |
| 360 | Archive 100%, Print labels 34% | Archive 100% (focused), Print labels 73% |
| 375 | Archive 100%, Print labels 27% | Archive 100% (focused), Print labels 65% |
| 390 to 430 | nothing | Archive 21 to 46% |
| 600 | Print labels 100% | Print labels 100%, Archive 79% |

  Screenshot `toast-over-selbar-320-archive.png`.
- The focused control is fully hidden for the toast's 8 s (WCAG 2.4.11). After Water, Tab moves on through Move and Print labels into the covered Archive.
- Should: the toast clears the select bar, as it already clears the add form's pinned bar (`body.stickyacts`).
- Smallest fix:
  - the select bar sets `--sel-h` from a ResizeObserver;
  - add `:global(body.grow-selecting) .toast { bottom: calc(var(--tab-h, 64px) + var(--sel-h, 120px) + 16px + env(safe-area-inset-bottom)); }` inside the 640 px block of `ToastBar.svelte`.
- Test: `a11y-perf 61-3` (FAILS).

### 4. P2. A returning grower's front page at 1280 shifts by 0.14 to 0.20, after painting the visitor's page (confirmed)

- `app.html` sets `data-grower` before paint, but nothing on `/` uses it. The grower first sees the server's visitor page, including "Grow some of these? Try a sample collection, add your first plant" (`grower-front-before-hydration-1280.png`). The page then swaps to the skeleton (`+page.svelte:597`), then to their own page.
- The skeleton is shorter than a desktop screen. When it replaces the long catalogue, the footer jumps up into view, then back down when the grower's page arrives. Attribution (`cls2.mjs`, 4x CPU, 30 or 300 plants):
  - `footer.credits y0->692 h0->155`: 0.125;
  - `footer.credits y692->0`: 0.048 to 0.053;
  - total 0.139, 0.181, 0.201 and 0.202 over four runs.

  At 390 the skeleton (707 px) keeps the footer below the fold and the total is 0.024, of which 0.022 is `main` moving 10 px down and back (the skeleton's `margin-top: 22px`).
- Smallest fix: `.skeleton { min-height: 100vh; }` (line 875). Injected into the page, the total fell to 0.005 to 0.017 over three runs. For the flash of the visitor's head, hide `.headwrap`, `#welcome` and `.featured` under `html[data-grower]` until hydration, as the tab bar already does.
- Test: `a11y-perf 61-5` (FAILS: 0.181).

### 5. P2. Today's "Show N more" drops keyboard focus to the page body (confirmed)

- `src/routes/today/+page.svelte:257`. The button is removed by its own click (`!opened.has(k)`), so focus falls to `<body>`. The next Tab went to the first chip of the first stop (`more.mjs`, 300 plants: "Show 25 more (ticked)", then focus BODY, then Tab to `w-p000001` at y = 512), not to chip 51.
- This is the same class of bug as round 60's finding 2, in a control this round added.
- Smallest fix: in `openRow`, after `await tick()`, focus the first newly drawn chip's tick box. For example, give the row `data-row={k}` and call `focusNext(`[data-row="${k}"] .chip:nth-of-type(${CHIPS + 1}) input, [data-row="${k}"] .chip:nth-of-type(${CHIPS + 1}) a`)`.
- Test: `a11y-perf 61-4` (FAILS).

### 6. P3. Label in name: two more sets of buttons and links, flagged by axe as violations (confirmed)

- **Plant page photo grid** (`src/routes/plants/[acc]/+page.svelte:756`): the visible "2026-09-27" (and "cover") is not in the name "2026-0001 Copiapoa humilis, 27 September 2026". There are 6 nodes on the seeded plant page, in both themes. The round fixed `PhotoTimeline` but not this grid. The same pattern is at `species/[slug]/+page.svelte:561` and `propagation/[id]/+page.svelte:490`.
- **Species page photo strip** (`species/[slug]/+page.svelte:376`): the visible "20 photographs ›" against the name "Photographs of Copiapoa cinerea, with their credits". This is on every species page with photographs, a visitor's page. (The 6 `.ph.failed` nodes axe also lists are the sandbox's failed photo host: their visible "did not load" is not in the name.)
- Fix: start each name with its visible words: `aria-label="{ph.d}: {photoLabel(ph)}{… ' (the cover)'}"`, and `aria-label="{d.photos.length} photographs of {d.name.scientific}, with their credits"`.
- Test: `a11y-perf 61-7` (FAILS).

### 7. P3. The toast repeats a sentence in silence (confirmed)

- `toast.svelte.ts:35`. `show()` with the same sentence while the toast is still up changes no text, so the live region does not fire. Measured (`axtoast.mjs`): pressing select mode's Water a third time ("Already recorded as watered today.", as the second press said) made 0 mutations in the region.
- A screen-reader user who presses again hears nothing.
- Fix: in `show()`, when `text === this.text`, set `this.text = null` and set the sentence on the next frame, or append a zero-width space that alternates.

### 8. P3. The select bar floats 72 px above a desktop window's bottom edge (confirmed)

- `+layout.svelte:168` sets `--tab-h` only when the tab bar has a height. On a desktop the tab bar is `display: none`, so `--tab-h` is unset and the select bar uses the 64 px fallback plus 8. Measured at 1280: the bar's bottom edge is 72 px above the window's, with list rows visible below it.
- Fix: set `--tab-h` to `${Math.round(tab ?? 0)}px` whenever the tab bar is measured, including 0, and use `var(--tab-h, 0px)` in `SelectMode.svelte:207`.

### 9. P3. Smaller items (confirmed)

- **The hold cap moves focus away.** A keyboard user resting on Undo has it taken away after 29.8 s (measured), and focus jumps to the way back. Since Tab can no longer be trapped, the cap protects nothing; consider holding while focus is inside, and capping only the pointer hold.
- **Done-row chips at 200% text.** On `/today` after "Water N here", at 320 px with 200% text, the page scrolls sideways: 324 > 320, from `i "Conophytum minimum"` in a chip. Still open from 60: `/?by=family` 323 and `/plants/2026-0001` 322.
- **`/plants` still ships the backup module.** It loads `BTytV-1u.js` (11.6 KB gzip) for the menu's Download, through the static import in `PlantsMenu.svelte:7`. Use `const { downloadPlantsSheet } = await import('$lib/export/sheet')` inside `sheet()`: 9% of the page's JS.
- **Font swap on Linux** (still open from 60, finding 17): with fonts loaded, the front page shifts 0.208 at 390 (`li` and `p#welcome` rewrap), and a species page 0.145 (`div.acts.acts2 h88->44`; the fallback before swap is DejaVu, wider than Public Sans, since `local('Arial')` does not resolve on Linux).
- **`/plants` residue:** 0.011 to 0.020 from the "Show the reference's photographs" line arriving above the select head (still open from 60).

## Checked and sound

- **The toast (a11y 1, 11).**
  - Tab never sticks:
    - From Undo with a way back, Tab goes to "Back to where you were", and Shift+Tab returns.
    - With no origin, the first focusin records the entry point (the top bar's "Add a plant" in my run), and the way back goes there.
    - When the cap hides the toast with focus inside, focus moves to that entry, not to `<body>`.
  - The cap measured 29.8 s.
  - The live region is one `span[role=status]` with `aria-atomic=true` and relevant "additions text". It is in the accessibility tree and not ignored, empty and 0 x 0 at rest and after the toast goes. It holds only the sentence; Undo and "Back to where you were" are siblings outside it.
  - It fires when it fills ("1 watered."). It empties to "" without an announcement, which is right for `relevant=additions text`.
  - I could not confirm with a real screen reader that a 0 x 0 region is read by every engine. The usual `.sr` 1 px clip is the better-trodden pattern if a report ever says otherwise.
- **Focus after the new actions** (keyboard only, `kb61-1280.log`):
  - Select mode:
    - Water keeps focus on Water, Tab reaches Undo, and Undo returns to Water.
    - Move opens on the picker. "Move 1" pressed with nothing chosen keeps focus on the picker and describes it by the reason.
    - Archive opens on Keep; Keep returns to Archive. "Yes, archive" then focuses Archive, and Tab reaches Undo.
    - Undo puts the plant back to growing and removes the line, and focus stays on Archive.
  - The "···" menu: Home and End work; Download returns focus to "···", and the file downloaded.
  - Wanted: Save returns focus to "Edit the note for Refusia testii".
  - Today's "Water 3 here" focuses the done row's Undo, and that Undo returns to "Water 3 here".
  - Import:
    - "Check names" focuses the review heading, and `#imp-status` (always mounted) says "3 lines read; the review is below."
    - "Add 3 plants" focuses "The import is done", and the status goes "Adding 3 plants…" then "3 plants added."
  - Add a plant by keyboard (combobox, ArrowDown, Enter, Save) lands on the new plant with "2026-0043 added" announced.
  - Print labels: `/labels?acc=…` opens, "Print 2 labels" is 6 Tabs in, and `print()` is called once.
- **axe.** The only violations in 65 runs are finding 6. The demo's locked Sync, Backup and Settings pages now pass `page-has-heading-one` (round 60's finding 10 fixed). The import contrast, refusal link and toast ring items of round 60's finding 12 did not reappear.
- **Forced colours.**
  - The current tab is HighlightText on Highlight in the tab bar and the desktop top nav, light and dark (white on rgba(5,0,73), black on rgba(0,230,255)).
  - The toast and Undo have a 1 px CanvasText edge, and the select bar has its own.
- **Reflow at 320 px with 200% text.** The Wanted form, the calendar button, the Move picker and the refusal pills no longer scroll sideways (round 60's finding 7 fixed). The sort select is not clipped.
- **400% zoom (320 x 256).** No sideways scroll on 35 states. The select bar and the add forms' pinned bar are static. The most covered state is a toast over the list: 103 of 256 px, against round 60's 213.
- **CLS.** At 4x CPU with photographs served locally, fonts blocked:
  - `/today`: 0.000 with 300 and 3,000 plants, at 390 and 1280 (round 60: 0.25 to 0.29).
  - `/plants`: 0.011 to 0.020.
  - A species page with photographs: 0.006 at 1280.
  - `/` for a visitor: 0.013 at 1280 and 0.030 at 390.
  - The sample:
    - The first entry from the front page took 4.4 s to 12 rows, CLS 0.041 (round 60: 0.43 in 4.9 s).
    - Pages inside the sample: `/about/how` 0.002, a species page 0.002, `/today` 0.000, `/plants` 0.016, `/` 0.037.
    - The bar is drawn before paint, with no shift.
- **Today at 3,000 plants.** 2,010 elements (round 60: 18,200), with 200 chips drawn and "Show 700 more (ticked)" lines. Longest task 415 to 870 ms (3.2 s before), and tasks over 50 ms total 1.0 to 1.6 s, at 4x CPU. Every stop's button still counts every plant ticked.
- **JS bytes** (scripts fetched on a cold load, gzip -9 of the bodies):

  | Route | Scripts | KB gzip |
  |---|---|---|
  | `/` | 43 | 141 |
  | `/species/copiapoa-cinerea` | 40 | 145 |
  | `/plants` | 46 | 123 |
  | `/today` | 45 | 121 |
  | `/plants/2026-0001` | 50 | 140 |
  | `/labels` | 41 | 121 |
  | `/about/how` (the shell floor) | 31 | 109 |

  - No page loads the grow barrel or the backup module, apart from `/plants`'s Download (finding 9).
  - Round 60's 181, 185, 147 and 179 were transfer sizes with headers (about 0.3 KB a script). On the same footing, the drop is about 25 KB a page, which is the grow and backup chunks.
  - `/` still loads `Today.svelte` (3.8 KB) for visitors, which only a grower's page draws.
- **The front page.**
  - Desktop: the order is strip, search and grouping, the feature (h2 with four `role=heading aria-level=3` cards), then the rows. The feature's chart space is reserved: CLS 0.013, from the top nav.
  - Phone: no feature. Headings are h1 then the letter groups. Tab order: skip link, top bar, the pitch's links, the welcome line, the strip, search, grouping, chips, letters.
- **Label in name, as changed.** The list's "Water 2026-0012, record watered today", Wanted's "Add a note for …" and "Edit the note for …", the photo timeline's "2026-09: …", and compare's "Compare 1, pick one more: … is picked". The °C and °F buttons are no longer flagged.
- **Today's hold.** While the sheets are read, `#water` keeps 80vh and the footer is drawn below it, with no shift. The sheets are asked for again only for new species: a watering did not make the buttons wait in my runs.

## Suggestions, ranked

1. Fix finding 1 with the two small changes (`data-cover`, `30em`), and add `a11y-perf 61-1` and `61-2` to the suite. The 200% case is the one a low-vision grower meets on their first select.
2. Give Today a "not checked" line for the sheets (finding 2). Every other refused source on the site already has one.
3. Lift the toast above the select bar on phones (finding 3), as it is lifted above the add form's bar.
4. `min-height: 100vh` on the front page's skeleton (finding 4): one line, 0.18 to 0.01.
5. Focus the first new chip after "Show N more" (finding 5).
6. Then the P3s: the two label-in-name names, the repeated sentence, `--tab-h` on desktop, the dynamic import of the sheet download.
