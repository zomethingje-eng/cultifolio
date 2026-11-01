# Round 85, agent A: the about pages, NOTICE and the glossary

Copy `/tmp/claude-0/rev85/A/`, branch `r85`, six commits `536df74..aede8b3` over `r85base`. Every change is step 1 (the deploy) unless it says otherwise. 55 sentences on the two pages depend on another agent's change and carry `<!-- r85 X -->` (45 on how, 10 on formats). I re-read G's, N's, E's, U's and K's copies at about 17:55 and reworded those sentences to match what each had written.

## Done

**S4, A21: stale passages, and examples tested against the index that goes live.**
- New `scripts/about-examples.ts` reads every `<span class="ex">` example on both pages and runs it over an index: the search, then the retry, then the shorter readings, as the route does for an index-only reference. It writes two files:
  - `tests/unit/fixtures/about-search-examples.json`: for each example, every entry ranked at or above the furthest name the example names, plus 20; the queries; the counts.
  - `src/lib/ui/about-counts-on.json`: species, genera (counted with `genusOf`, as `/api/counts` does), pages with a climate, `g` pages and the day.
- It prints `NOT TRUE of this index: …` for any example the index answers otherwise.
- `scripts/build-dossiers.ts --index` calls it right after writing `index.json`, in the folder the index is written in (step 2). A run in a folder with no about pages is said and writes nothing; a failure is said and never stops the index.
- I made the fixture from the live index copy: 20 queries, 951 entries, 48,357 / 6,493 / 37,648 / 14. The old `r84a-search-examples.json` is gone.
- `COUNTS_ON` now comes from the counts file. The prerendered page says "held, on 31 October 2026, 48,357 … 6,493 … 37,648".
- On the live index, "Trichocereus pachanoi" answers Echinopsis macrogona, so that example is gone; the rule stays without one.
- Reworded "Black eyed Susan" so it does not read as an order. Took the false "headed 'Pepper'" clause off the pepper example.
- Took out the examples that leaned on old headings: Huernia zebrina, Zephyranthes, Othonna lineariifolia, Parrycactus, Bisnaga glaucescens (twice) and `/species/echinopsis-pachanoi`.
- Took out all six "built before" sentences (Rules of 30 October, GBIF's heading, OpenAlex papers, the front strip, tests before the shapes, the rain median) and the dated count "4,839 of 37,727".
- The `g` pages are said from the counts file: "There were 14 such pages on 31 October 2026."
- Tests (`tests/unit/r85a-about.test.ts` §1):
  - every marked query is in the fixture;
  - each example is answered as said, through the search route;
  - renaming Dracaena trifasciata in the fixture makes "snake plant" fail;
  - the script's selection, its counts and its NOT TRUE lines;
  - `--index`'s writer in a temp tree: both files written; "no about pages" said; a missing folder leaves both files as they were;
  - `COUNTS_ON` equals the fixture's counts and day.
- Fails on base: there is no script and no fixture.

**S11, A22: a grower's page, with the full rules one tap away.**
- /about/how: every heading (h2 and h3, 39 of them) opens with a plain summary. I wrote 14 new ones: climate data, summary, identifiers, iNaturalist, papers, popular genera, front photographs, how a query is read, default points, the shapes, few records, set aside, your months, and the name's.
- Each of the 34 lists of rules is folded under "The rules in full". The existing "more" lists stay as their own taps.
- /about/formats: each section is its summary plus "The format in full".
- New `src/lib/ui/about-fold.ts`, used by both pages:
  - `revealHash` opens the lists around an address's target (#set-aside, #islands, #sample, a formats #clock), on load and on hashchange;
  - `printOpens` opens every list for print, then closes only the ones that were closed.
- Visible words: how 14,880 to 4,156; formats about 20,300 to 746.
- Unit tests (§2): a summary after every heading; no unfolded `ul.rules`; under 6,000 and 1,500 visible words; `revealHash` and `printOpens` driven on a fake DOM.
- Browser test `tests/e2e/r85a-about.spec.ts`, Chromium and phone:
  - lists folded, and a tap opens and closes them; the summary meets the site's `--tap` height, 44 px on the phone;
  - `#set-aside`, `#islands`, `/about/formats#clock` and the in-page `#sample` link open their list and land in view;
  - no sideways scroll at 320 px with every list open.
- Fails on base: 1 and 2 fail; 3 is a guard. Run with r84a-about and r79k-no-gbif: 17 passed.

**A22: no paths, flags or hedges.**
- The 16 repository paths on how are now plain-named GitHub links ("the list of merged pages").
- `--names`, `--fill wikidata-names`, `--check-ranges`, `--fill commons-kind`, `--fill gbif-infra`, `--index` and `npm run export` are now plain words.
- The source section links NOTICE (`#notice`).
- Test §3: no `scripts/`, `src/`, `--flag`, `npm run`, "built before", "may still" or "reach a page when it is next" in either page's text.

**The glossary.**
- Added Backbone, Epithet, Basionym, Homotypic, Autonym, Pro parte, Buffer, Coast reach, KV and "/24, /48, /64".
- Cell now says 5.6 km north to south.
- Test §4: each term is defined, and each such word the pages use is in the glossary.

**The numbers.**
- The buffer is "0.05° … (about 5.6 km)" and the coast reach "0.15° (about 16.7 km)". Both are worked out from `SHAPE_BUFFER_DEG` and `COAST_DEG`; `near()` measures a scaled degree of latitude.
- The island rule says "0.5° (about 55 km)".
- Test §5.

**NOTICE.**
- Adds the national checklists through GBIF, the GBIF living-collection counts, iNaturalist's cultivated counts, Natural Earth's minor islands, and IPNI's records read to prove an identifier.
- Drops OpenAlex: no page lists papers, so "No other data is used" is now true.
- The how page's sources table has the same rows.
- Test §7.

**S9.** "Not checked" means refused or failed; "not asked" means skipped or held back. That matches E's species page, which now says "GBIF's records not asked".
- How and the glossary say a no-key page's records are "not asked".
- The same word everywhere else such a page is named:
  - front tiles and their title: `src/routes/+page.svelte`;
  - compare: `src/routes/compare/+page.svelte`;
  - the plant page: `src/routes/plants/[acc]/+page.svelte`;
  - the label's care line: `src/lib/core/note.ts`, plus `labels/+page.svelte`'s comparison;
  - the meta description: `src/lib/ui/ref/head.ts`.
- Tests updated: `r79k-schema`, `r80r-no-key`, `r79k-no-gbif.spec`. Test §4 checks the definitions against how's sentences.

**S10.** The merged list names all eleven lines of `scripts/merged-pages.txt`, Rebutia fidana and Coryphantha macromeris included. Test §6 reads the file.

**Every rule this round changes, said, with marks.**
- **G:**
  - the border rule (strictly inside another shape means that region's; buffer, coast and island only in no shape and with the stated country), with Aloe vera at Khor Fakkan as the example;
  - minor islands, or the stated country within 0.5° or inside the box, with the Poor Knights lily;
  - Western Sahara and Tarfaya, Darjeeling as EHM-DJ, Kermadec, Los Roques, Aru, Cocos I., the Snares, Kenting;
  - admissions counted (strict, buffer, coast, island);
  - the 1.5 °C margin on both checks;
  - sampling (2,000 from the download, every distinct 0.05° cell first; on GBIF's search, up to five native regions' first 300 each);
  - extra keys "from the download where it holds them" (D11);
  - "all the well-placed wild records read";
  - the typical cell's place;
  - formats names `occurrences.admitted` and `edge`, and `climate.admitted`, `edge` and `place`.
- **N:**
  - Kew's family;
  - Kew the authority for search names;
  - autonyms;
  - Echinopsis pachanoi's own page (the rule is N's);
  - asked again under Kew's name;
  - `name.formerly`, `name.kew.elsewhere` and `accepted.family`;
  - `summary.revision` and `read`, and photo `read`.
- **E:**
  - whose verdict a `?was=` name is;
  - no papers;
  - the register says read and set aside;
  - credits' days and the summary's revision shown.
- **K:**
  - a plant finds its page by its key;
  - „…“ and «…» quotes;
  - the name service waits 8 s at the server and 10 s at the picker.
- **U:**
  - species pages carried over an update;
  - the index and counts kept 5 minutes, and the live check judges an edge hit;
  - photographs not received said on the sync card.

## Decisions I took

1. **"One tap away" means one disclosure per list.**
   - On /about/how I fold each list under its own heading, not into a separate "Method in full" page. A grower stays on one page and the anchors still work; `revealHash` keeps any link into a folded list working in every browser.
   - /about/formats is a reference, so each section folds whole.
2. **The few-records count is dropped.** No index holds it, and a dated figure goes stale with the next walk, which is S4's complaint. The rule is still stated.
3. **Where a page's heading changed, the example went with it.** I did not hunt for new real examples I could not test. Examples that still hold were kept: Ixora, Rubus, Fragaria, Ceropegia mixta, Cyphostemma, Erythrina afra, Monsonia and others, each checked against the live index.
4. **The species-list count is no longer said.** N's new pages change it, and the counts line gives the reference's. `r79f`'s test now checks the count only if the page states one.
5. **No examples that need N's search code.** "tulip" first and the like would fail on my branch's code. The merge can add them, and the fixture will test them.
6. **The fixture is written in the folder the index is written in (`process.cwd()`), never next to the script.** My first version used the script's folder. A test that spawns `--index` in a scratch folder then overwrote the repository's fixture with a one-entry index. I caught and fixed it, and all 12 tests that spawn `--index` pass with the tree left clean.
7. **0.05° is "about 5.6 km"** (5.56 km is a twentieth of a degree of latitude), not the brief's "5.5". G's code comment also says 5.5.

## Measured

| | base | now |
|---|---|---|
| /about/how visible words (folded lists closed) | 14,880 | 4,156 |
| /about/formats visible words | ~20,300 | 746 |
| how: paths and flags in the text | 16 + 3 | 0 |
| how: "built before" sentences | 6 | 0 |
| examples true of the live index | 20 of 21 | 20 of 20 |
| prerendered counts | 29 Oct: 6,529 genera, 37,727 with a climate | 31 Oct: 6,493 genera, 37,648 with a climate |

Test runs:
- Unit: 55 files, 642 passed, nearby files included. The 12 `--index`-spawning files: 89 passed.
- `tsc --noEmit`: 0 errors.
- svelte-check was **killed for memory** (exit 137, at 3 GB with seven agents on the machine). That run is left to the merge.

## For the owner's PC

Step 2 runs as before:

```
npm run dossier -- --index
```

It now also writes `tests\unit\fixtures\about-search-examples.json` and `src\lib\ui\about-counts-on.json`, and prints any `NOT TRUE of this index:` line. Then:

```
npx vitest run tests/unit/r85a-about.test.ts
git add tests/unit/fixtures/about-search-examples.json src/lib/ui/about-counts-on.json
git commit -m "The about pages' examples and counts, from the index of <day>"
```

Reword any example it lists before the next deploy. `docs/DEPLOY.md` has this under "### Round eighty-five: the about pages, NOTICE and the glossary (agent A)".

## Touched outside my files

- `scripts/build-dossiers.ts` (G and N): one import and three lines after the index is written.
- S9's words for a no-key page:
  - U: `src/routes/+page.svelte` (three strings), `src/routes/compare/+page.svelte` (one);
  - K: `src/routes/plants/[acc]/+page.svelte` (one);
  - E: `src/lib/ui/ref/head.ts` (one);
  - unowned: `src/lib/core/note.ts` (two), `src/routes/labels/+page.svelte` (one comparison).
- Q's existing tests: I updated only the lines that pin about-page text or the S9 words:
  - `r62bw-words`, `r62w-words`, `r70p-about-rules`, `r70p-about-seams`, `r71f-about-70bc`, `r74-growers`, `r74-spaces`, `r75g-opening-rule`, `r78b-literature`, `r79f-about-how`, `r79k-schema`, `r79m-kew-keys`, `r80r-no-key`, `r82m-merge`, `r82u-pages`, `r84a-about` (unit and e2e), `r84m-merge` (lines 37 to 45 only), `r79k-no-gbif.spec`.
  - The tests that read a renamed example from the page now drive the same code case directly.
- `docs/DEPLOY.md`: my section only.

## Not done, with why

- **svelte-check: killed for memory.** Left to the merge, as the brief says.
- **A merge check.**
  - The front page's chip "N not checked" still counts refused climates and pages with no GBIF key together. That count comes from `catalogue.ts` (N's file, an index-time product). The live corpus has 0 refused, so all 920 are "not asked".
  - Splitting it means N writes `notAsked` beside `notChecked` and U shows both. I left it rather than change an index product in another agent's file. The merge should decide whether to do that this round.
  - Separately, the merge should recheck each `<!-- r85 X -->` sentence against the merged code: Echinopsis pachanoi's page and its rule (N), and the exact words of the `?was=` line (E).
