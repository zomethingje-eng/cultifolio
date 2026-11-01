# Round 85, agent E: the species page and its words

Copy `/tmp/claude-0/rev85/E/`, branch `r85`, 12 commits on `r85base` (39 files). Scratch `/tmp/claude-0/rev85/E-s/`:
- `view/`: a viewing tree with 25 live dossiers injected;
- `shots/final/`: the screenshots I judged;
- `base/`: a worktree at `r85base`, used for the "fails on base" runs.

Every change below is the Worker's. **Step 1** (the deploy over today's corpus) brings all of it. The only exception is the OpenAlex words the build writes (step 2), and step 1 already shows them.

## Done

**W1, P1, C1, A1: whose verdict the old name is.** New `src/lib/ui/ref/was-words.ts`. `wasLine()` replaces the last `?was=` branches of the species page. It says whose verdict the name is, by the record that holds it:

- **GBIF's own name for the key** (`name.gbif`): "Ceropegia alstonii is GBIF's name for this plant, and GBIF's backbone accepts it. Kew's World Checklist holds it as a synonym of *Hoodia alstonii*, which heads this page: the reference takes its names from Kew."
- **A spelling** ("Aeonium tabulaeforme is GBIF's spelling of this plant's name. Kew's World Checklist spells it *Aeonium tabuliforme*").
- **The heading written without its rank** (Conophytum calculus vanzylii).
- **A Kew synonym**, also noting where GBIF lists it.
- **A GBIF-only synonym**: GBIF's verdict, about GBIF's name.
- **A keyless page**: Kew's, as before.

The page never says "the GBIF backbone accepts this species as". `gbifNameLine()` puts GBIF's accepted name on its own "GBIF's name" line under Names, and takes it out of "Also known as … (GBIF Backbone)".

- Unit test: all 77 renamed dossiers the reviewers saved (`fixtures/r85e-renamed.json`).
- Browser test: `?was=Echinocactus%20cinereus` on Copiapoa cinerea.

**D2, A2: the range note.** `rangeNote` (`notes.ts`) names the name the range was reached by (`via.row`, else `name.gbif`). It returns no note where Kew's entry is the heading's own: words, plus author for `kew-entry`. The 77 renamed pages now carry no note; on r85base they said "Kew holds Hoodia alstonii as a synonym of Hoodia alstonii (N.E.Br.) Plowes".

**A8, S8: the register at display.**
- `registerRow()` (`upstream.ts`) shows NASA POWER's extremes, which the build set aside and wrote as "nothing to report", as "answered". It drops the build's "; not used: …" clause.
- `foundNotShown` then says "read, and set aside, so no cold floor is shown: <why>". This is Cedrus deodara's, checked on its live dossier.
- `Provenance.svelte` reads it, and no longer prints a status word twice ("not asked not asked: …").

**D10, A9f, A16d, A22, W13: a reader's words** (`words.ts` `readerWords`):
- The shapes file's metadata becomes "(Natural Earth's provinces, placed in TDWG's regions; shapes rule r84)".
- "carried from build of D (rederive); that build: X" becomes "X (kept from this page's build of D)".
- Build flags in parentheses go: "(--fill inat)" was on 170 of 528 saved pages.
- OpenAlex's promise becomes "the reference does not ask OpenAlex for papers". `LITERATURE_OFF` in `sources/openalex.ts` now writes those words, and `literatureOff` still reads the old ones.
- Two Wikidata items are said plainly. Abies marocana's names line reads "English names not taken: two Wikidata items carry Kew's identifier for this plant (Q14952100, Q95967444), so neither was taken (kept from this page's build of 2026-10-22)". `namesSource` returns the glossary word.

**W13, S9: a page without GBIF's records.**
- The notice reads "GBIF's records not asked." The record reads "not asked · see under the name" (was "none read").
- Related reads "Not compared: this page has no habitat climate, as GBIF's records were not asked" (was "None to compare").
- The sheet's floor reads "Cold floor: set aside / not checked / not asked / none on file" (was "none read").

**A16g: one word for one state.** `NotChecked` takes a `word`, so the mark says "Photographs not asked" where every source was skipped. The sections say what follows instead of a second state word: "No photograph shown.", "No habitat climate shown.", "No sheet: there is no habitat climate to read one from".

**P8, W12: the elevation cause** (`lapse.ts` `causeSentence`, elevation branch only). It is now in one unit system, said once, with no "lapse rate". In °F: "the weather cell's ground is 4,124 ft higher than the typical spot's, more than the 3,281 ft (1,000 m) over which a correction for height is applied".

**W12, other species-page words.**
- The rain bar ends at a round figure in inches ("bar 0 to 48 in", was 47.2).
- The hero credit's date does not break.
- The month table uses a true minus sign ("−15–−1", was "-15--1").

**B3, P3: the phone's first screen.** On phones, the order is now:
- the name;
- the first English name;
- one folded line (`details.pmore`, "Crassulaceae · Austria +8 · MORE") holding the other names, family, native range and group;
- Add;
- the habitat line, now inside the name card;
- Sow seed, Follow, Compare and Share card.

The photograph band is 96 px on phones under 740 px tall. A wider screen is unchanged.

**P4, B4: 44 px.**
- "Figures ›" and the few-records mark (now a link to `#few-records`) get an invisible 44 by 44 margin under a coarse pointer, and the line keeps its height.
- So do the DLI help and the page's 12 help links (`a.help`: "How", "which records count", "What each licence allows", …), through the species-page part of `theme.css`.
- The folded line's summary is 44 px tall.

**W5, A16e: figures by month and print.**
- The table has months as rows and figures as columns. It fits a desktop (640 px, not 1,430 px in 980) and A4.
- `beforeprint` also asks for every lazy gallery photograph.
- On paper the scroll box does not clip, the folded names print whole, and the related strips wrap. Checked on a 6-page PDF.

**P6: the chart at 200% text.** `Climograph.svelte` reads the reader's label size and draws at the shown width divided by that scale (down to 260). Its words are 11 units. At 200% text no tick meets another, none is cut at the left, and labels are at least 12 px.

**A20: the chart with scripts off.** Before the width is measured, two drawings are made, for a phone (340) and for wider (720). CSS shows one; once measured, one is drawn.

**A9g, A16c, W6: the lead photograph** (`dedupe.ts` `heroOf`). The tiers, in order:
1. a stated size at the floor, not upright, and the first photograph of its observation;
2. a stated size at the floor, not upright;
3. a stated size at the floor, first of its observation;
4. a stated size at the floor;
5. only then GBIF's unsized media, as before.

Echeveria elegans now leads with the first photograph of an observation (186526029), not the seventh of pmallard's eight (the hand and label).

New `lead-shape.ts`: a lead that loads upright, such as GBIF's unsized Hoodia stem, is shown whole over a blurred fill of itself, not as its middle third. The phone still loads the 500 px file.

**P9.** Under 860 px the failed placeholder's words sit in the part of the band the card leaves clear (screenshot at 810 px).

**P10.** The lines above Add can no longer re-wrap when the fonts arrive (one English name, one ellipsised line), and the secondary actions now sit below the habitat line. Measured below.

**Decision 7: credits' days.** New `credit-days.ts`. The gallery's credits end "Credits as read from iNaturalist on 2026-10-27 and from Wikimedia Commons on 2026-10-22". The day is a photograph's own `read` (N's field) where present, else its source row's day. The lead's full credit, with its state and day, is now in the gallery's credits, since the phone's band carries only the licence and the author.

**Decision 8: revision and route.**
- The summary line reads "Quoted from Wikipedia, "…", revision N (linked to `?oldid=`), read D, CC BY-SA 4.0 (linked)". The genus quote does the same. The fields are N's `summary.revision` and `summary.read`, else the day of the Wikipedia row.
- **A9h:** an article under another title states its route from the row ("Wikipedia redirects X to Y, …"). Where the row was kept from an earlier build, it says the proof rule, with a link to /about/how#summary.
- **A22:** the gallery links "What each licence allows".

**Tests.**
- **`tests/unit/r85e-species-words.test.ts`** (17 tests). All 17 fail on `r85base`: I ran them in `E-s/base`.
- **`tests/e2e/r85e-species.spec.ts`** (10 in Chromium and phone):
  - first screen at 320×568, 320×700, 375×667 and 390×664;
  - 44 px, checked by an `elementFromPoint` tap 18 px off the word;
  - the old-name line;
  - 12 rows that fit on desktop and paper;
  - 200% text;
  - scripts off.

  All 10 fail on `r85base`. Test 3 first passed there because its fixture page has no GBIF key, so I moved it to Copiapoa cinerea; it now fails on base with "the GBIF backbone accepts this species as Copiapoa cinerea".
- **Nearby runs.**
  - 72 nearby unit files pass.
  - These browser specs pass in Chromium and phone: r84e, r79k-no-gbif, r82u-pages, r80u-layout, r63u-print, r81a-reference, smoke-2, r61w-pages, r73p-other-keys. The last run of r85e, r84e, smoke-2 and r63u-print was 38 of 38.
  - `tsc` is clean, and so is `svelte-check` (0 errors, 0 warnings).

## Decisions I took

1. **Kew is named as the authority on the line.** It reads "the reference takes its names from Kew", so a reader sees why GBIF's accepted name is not the heading.
2. **Range note on renamed pages.** Where Kew's entry is the heading's own, there is no range note: the range is the page's own entry.
3. **The phone's fold.** The fold holds the extra English names and the classification, with family and native range as its summary. The first English name stays: it is the name a grower knows.
4. **The lead's observation rule.** "First of its observation" is the rule W6 asked for: it applies to every page, and the observer's own choice is the observation's lead. No hand edit.
5. **"The phone gets a smaller image."** I read this as: the phone keeps the 500 px file (it never got the 1,024), and an upright lead is drawn whole and smaller, not cropped.
6. **One state word per state.** The state word is the mark's; sections say what follows. "Not asked" is used for a skip, as the glossary defines it.
7. **The license links.** The Wikipedia quote links CC BY-SA 4.0's deed. Photographs link Creative Commons' page on all licences, because their versions vary (a Commons file may be 2.0 to 4.0).

## Measured

| What | Before (r85base or the reviews) | After |
|---|---|---|
| Habitat line, 320×568 | top 572 under the 511 bar (P) | 322–506 |
| Habitat line, 320×700 | rows to 755 under the 643 bar (B) | 322–506 |
| Habitat line, 375×667 | below the 610 bar (B) | 293–463 |
| "Figures ›" | 51×19 | 51×44 hit area |
| DLI help | 18.7×22 | 44×44 hit area |
| Month table | 1,430 px in 980, Sep–Dec hidden, Jul–Dec off A4 | 640 px, twelve rows, whole on A4 |
| Cold phone CLS, Echeveria elegans | 0.026, 0.023 of it the actions row (P) | 0.003: crumb 0.0027 (U's), "more" 0.0001 |
| Scripts-off chart on a phone | 4.6 px text | 340-unit drawing, about 12 px |
| 200% text | ticks overlapping, labels cut | none overlapping, none cut, at least 12 px |

Cold phone CLS was measured at CPU ×4, 1.6 Mbps and 150 ms.

## For the owner's PC

No commands of my own. The PC's WebKit and Firefox runs include `r85e-species.spec.ts`:
- r85e 1 and 2 are `@phone-only` and need a coarse pointer;
- r85e 5 is `@phone`;
- no fixed sleeps; the waits are on states.

## Touched outside my files

- `src/lib/core/lapse.ts` (G's): `causeSentence`'s elevation line, and a `feetOrMetres` helper.
- `src/lib/dossier/sources/openalex.ts`: `LITERATURE_OFF`'s words, `LITERATURE_OFF_BEFORE` and `literatureOff`.
- `src/lib/ui/Photos.svelte` and `src/lib/ui/NotChecked.svelte`: the gallery and the mark's word.
- `docs/DEPLOY.md`: "### Round eighty-five: the species page and its words (agent E)".
- Existing tests (Q's), changed only where my behaviour changed them:
  - unit: r78b-literature, r80a-lapse, r82f-found-not-shown, r84e-species-words, r80r-no-key, r62bw-words, r62w-words, r80n-wikidata-names, r70c-photo-kind, r70c-second-pass, sheet;
  - browser: r79k-no-gbif, r82u-pages, smoke-2, r80u-layout, r84e-species.

## Not done, with why

- These W12 items are not on the species page, so not in my item: the label's "(1 in 100" break (`core/note.ts`), Today's frost date, the roman "sp.", "GBIF 8315197" on the add form, and /labels' CLS.
