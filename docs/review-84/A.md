# Round 84, agent A: the about pages and NOTICE

Branch `r84` in `/tmp/claude-0/rev84/A/`, 15 commits on `r84base`. All of it arrives with **step 1** (the deploy); nothing needs the corpus, and every page sentence is true over today's corpus and after the re-derivation (where a rule reaches pages only at step 2, the sentence says so, dated).

## Done

- **S5, A19: both pages rewritten for a grower.** Every section opens with a `<p class="sum">` summary of at most three sentences. The rules follow as lists of short sentences. The long technical lists fold into `<details>` (four on sources, six on privacy), and print opens them through `beforeprint`. A glossary (`<dl>`) defines every word of art: reading the log/folding, default point, box, hash group, cell, older name, record and others. The pages contain no "round …" and no em dash. "Hash bucket" is now "hash group" throughout. A sources table gives the licence links (also part of A20). Every mechanism is still stated. Dropped details were restored wherever a seam test showed them gone. Files: `src/routes/about/how/+page.svelte`, `src/routes/about/formats/+page.svelte`.
- **S4, A18, D6: stale sentences.** These are gone: "until that upload", "due at the end of October", round 83 "next derived", "a hybrid gets none at all", the 23 October counts and "15 pages". They are replaced by present-tense rules, plus dated facts where the page cannot read a count. For example: "On the reference of 29 October 2026, 4,839 of the 37,727 pages with a climate were marked so", and "14 on 29 October 2026". The hybrid sentence now says a named hybrid has a climate when its records allow one, and a cross with no page has no habitat. D6: "A page whose record names no test was built before the regions had shapes…; one that names no rule … by the shapes of 244 regions."
- **Live counts (S4/A18).** A new route, `src/routes/api/counts/+server.ts`, returns `{corpus, species, genera, withClimate}` from the catalogue's genus rows (`public, max-age=300`). `src/lib/ui/about-counts.ts` reads it. The page says "now holds …", or the 29 October counts when it gets no answer. The route is disclosed in the privacy list and the edge-cache list.
- **S6: formats.** Corrected: the doc's eleven fields, `Answers {a, b?, t?, x?, n?}`, the index entry's every field (with `hom` and `homBy`), and the file counts by their rule with the live size (cards 1,024; names 512; search directories 512; rows 512/128).
- **A15.** `cultifolio.offline-tried` is listed. The cookies are named. The key regexes take hyphens (`r61w-rules`, `r62w`). The storage walks (`r62w`, `r62h`) now follow a store passed as a parameter, which is how that key is written.
- **A20: NOTICE.** Adds ETOPO 2022, Wikidata (with the gardens list), Natural Earth provinces, TDWG's tables (codes only), IPNI/POWO/iNaturalist identifiers, GBIF dataset descriptions, the frost watch's MET Norway (CC BY 4.0) and NWS, and the CC BY-NC use. It gives the three licence URLs and says how the templates were authored.
- **Decision 5** (default points at a named place left out, said). **Decision 7 / B2** (a check that two sources disagree, not proof; three causes, each in its own words).
- **Tests.**
  - `tests/unit/r84a-about.test.ts` (29 tests): ≤60-word sentences; summaries; no rounds or em dashes; glossary terms; every `cultifolio.*` and `cultifolio-*` literal in `src` listed; every `/about/…#id` link resolves; **every quoted search example** (21, marked `<span class="ex" data-q data-order [data-first]>`) run through `/api/search` over `tests/unit/fixtures/r84a-search-examples.json` (633 live-index entries); counts route, `countsOf` and `liveCounts`; formats fields against the types; stale sentences; NOTICE.
  - `tests/e2e/r84a-about.spec.ts`: counts live or dated; no sideways scroll at 320/375/430; table stacks; summaries first; details open on press and for print.
  - How they fail on base: the new modules are missing; with them, 769-word sentences, `offline-tried`, the doc's eight fields, "sixty-four at the present size", unmarked examples, and NOTICE without ETOPO.
  - About 35 older seam tests were moved to the new sentences. Their claims are still driven against the code; only openings and regexes changed.

## Sentences that depend on another agent (merge: check these)

Each is marked in the source by `<!-- r84 X: … -->`. Verified against a trial merge of all six heads (G 085924a, N 6fea4e9, K a8410a5, E 9efc741, U ed766f2): **all about tests pass there except E's disclosure list** (below).

- **N.**
  - Kew's heading on `k` pages: rank words, GBIF's name as an older name, and "built before 30 October may still be headed by GBIF's name".
  - A plant under the old heading keeps name and key.
  - D9 one-word heading rule; A6b basionym held apart; A4 "…" mark; D5 hybrid links; A8 variety names ("Trichocereus pachanoi" finds "the species GBIF calls Trichocereus macrogonus and Kew Echinopsis macrogona"); Latin-script names.
  - Search: S2 snowdrop, S11/D9 pepper, S10 genus nearness ("lithop") and the shorter readings ("lithops lesleyi"), S12 no sentence retry and no region by a typo.
  - Decision 4 strip, dated for the old reference.
  - formats: `name.kew.accepted`, `name.gbif`, `name.shared`, `name.infra`, and `kew` in the entry holding the variety names.
  - The `snowdrop`, `pepper` and `lithop` examples and the strip seam test fail on A alone and pass merged.
- **G.**
  - 366/369 shapes and the three box regions; the remote-island rule; the box margin; the 16 km coast rule.
  - The record's test words and the shape rule; D4 (no records carried to a page without their key); A6f wording; maps draw shapes; `/maps/*` files kept a day.
- **E.**
  - "Not checked" once, under the name; "The habitat in short" on phones; the rain bar to the next thousand.
  - Print opens the cards; few-records counts written out; the three set-aside causes.
- **K.** A cultivar in any quotes; a genus-only cultivar as "a cultivar, species not stated" (old hybrid records read as written, with "File it as a cultivar…"); a name with no page looks among older names.
- **U.** B5's `numbers-kept` setting record; W8 restore counted at once; A16 site name ≤120 chars; A14 local day.

## Decisions I took

- **Counts.** The page stays prerendered (offline, CSP and caching unchanged). Live counts come from a new tiny route rather than server-rendering the page. The few-records count is not in the index, so it is dated.
- **Detail kept but folded.** "Every mechanism stays stated" conflicts with "a grower reads it at once". The grower reads the summaries and lists, and the deepest rules (Commons filters, Wikidata matching, privacy full detail, every key) sit behind `<details>` that print opens. The total word count is about unchanged. The longest sentence is 60 words, down from 1,280.
- **Examples that change at step 2.** Kew's heading would make two examples false: "Ferocactus glaucescens is Bisnaga glaucescens", and "is Trichocereus macrogonus" (Kew: Echinopsis macrogona). I replaced the first ("Sansevieria trifasciata is Dracaena trifasciata") and named both names in the second. I checked all example species against Kew's file.
- **OpenAlex** is dropped from the brief, the sources table and the layout footer. It stays in NOTICE and in a "Papers" note for the pages built before October that still list papers (one in the 617 sampled). The unimplemented promise "a later fill takes them from OpenAlex's snapshot" is gone.

## Measured

| | Before | After |
|---|---|---|
| /about/how | 22,753 words (S5); longest sentence ≈1,280 words; one paragraph of 38,653 characters | 1,207 sentences; 22,137 words; longest 60; mean 18.3 |
| /about/formats | 18,655 words; longest 769 | 1,024 sentences; 19,651 words; longest 58; mean 19.2 |

- Unit (45 files near the pages): 542 passed; 2 fail on A alone, both N-dependent, and pass on the trial merge.
- Browser (Chromium, desktop and phone, `r84a`, `r62bw`, `r62w`, `r69p-disclosure`, `r75g`, `r76p`, `r81a`, `r82o-csp`, `r63v`, `r63u`, `r82u`, `r80u-*`, `r83w`): all pass. There was one flaky retry in `r80u-layout 2` (species page, unrelated).
- `tsc` and `svelte-check`: 0 errors.

## For the owner's PC

Nothing to run. After step 2's upload, /about/how's counts line should read "now holds …". `docs/DEPLOY.md` has "### Round eighty-four: the about pages and NOTICE (agent A)".

## Touched outside my files

- `src/routes/+layout.svelte`: the footer's sources line, removing ", OpenAlex" (A19). The line is next to U's hunks but merged cleanly in the trial.
- `tests/e2e/helpers/disclosure-list.ts`: ten entries for the how page's `<details>`.
- `tests/e2e/r75g-most-grown.spec.ts` (its text).
- About 35 unit seam tests whose sentences moved (`git diff r84base --stat -- tests/unit`); `r81b-pages-true`'s stale-pinning test now asserts the stale words are gone; `r74-growers`' allowlist follows the new wording.
- New file: `tests/about-pages.ts` gains `sentences()`, which splits at block edges.

## Not done, with why

- **E's new `<details class="why unchecked-why">`** (species page) is not in `disclosure-list.ts`, so `r69p-disclosure-list` fails on the trial merge. It is E's to add, or the merge's. One line: `{ file: 'src/routes/species/[slug]/+page.svelte', cls: 'why unchecked-why', at: 'species', sel: 'details.unchecked-why' }`.
- **Licence links inside each photo credit** (A20's legal reading) belong to the species page (E). Only the about table and NOTICE link them.
- `docs/DEPLOY.md` conflicts with G's, K's and N's sections. All three insert near line 551; mine is at 578 and does not conflict.
