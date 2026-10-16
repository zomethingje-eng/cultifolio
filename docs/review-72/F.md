# Round 72 fix phase, reviewer F

Branch `r72` in `/tmp/claude-0/rev72/F`, eleven commits on `r72base`: 763325a, f841a16, 092e9c9, db6186d, 7dcb251, 6c0efd9, 47eb2f2, fcb191f, 644d44f, 69226a9, ff82775. Two of them cancel out: 6c0efd9 splits smoke.spec.ts and 644d44f withdraws the split; see "Not done or departed from". The trial placeholder fix in `photo-kind.ts` was taken out of my tree; it is C's (triage F8). Every new unit test below was run against r72base, in the clone at `/tmp/claude-0/rev72/F-work/app`, and fails there.

## Done

**F1: no growing season from a frozen wet winter.**
- *Code.* `src/lib/core/sheet.ts` `growingYear` now returns two new fields: `frozen`, and `frozenMonths` (the wet months whose mean nightly low is below 0 °C). This applies only when the rain rule would say "winter".
  - The Seasons card reads "The rain rule reads a rainy season and no growing season: … the mean nightly low is below freezing in …". Its lead is "Wet winters: …, with nights below freezing; no growing season read."
  - The season strip (`ui/ref/season.ts`) reads "the rainy season (no growing season read: nights below freezing)".
  - Today (`ui/Today.svelte`, `routes/today/+page.svelte`) reads no resting months from such a season, as it already does for "even".
  - Labels and the plant page still say "winter rain": that is a fact about when the rain falls.
- *Departure from the triage wording.* The rule is held to winter. A summer wet season keeps its reading when one month at its edge dips below freezing; Echinocereus coccineus has a December at −0.5 °C beside a May to October monsoon. Applying the rule to summer as well would have taken a true reading off 40 pages.
- *Pages changed:* 68 of 5,565 (`F-work/frozen-count.py`). Examples: Rubus parviflorus, Camassia quamash, Colchicum kurdicum.
- *Test:* `tests/unit/r72f-season.test.ts`, built on the live dossiers' monthly figures. 4 tests; all fail on the base.
- *FOLD_RULES:* untouched, and none of the device's hashed blocks change. `sheet.ts`, `season.ts`, Today and the plant page are outside the hash in `tests/unit/fold-rules.test.ts`, and nothing they compute is stored on the device. The hash test passes as recorded (`b854e376…`, rules 8).

**F4: register links "not checked" when Wikidata failed.**
- *Code.* `registersNotChecked()` in `ui/ref/upstream.ts`. The species page shows a "Registers not checked" pill in Names & registers when the `wikidata` row is `error` or `refused`. 19 pages show it.
- *Test:* `r72f-pages.test.ts`; fails on the base.

**F13 page side and F5: the notes read structured fields.**
- *New module:* `src/lib/ui/ref/notes.ts`.
  - `citedNote` reads `name.cited` and otherwise the old "is cited as Kew accepts it" sentence, through A's `kewCitedNote`.
  - `rangeNote` reads `distribution.via` (own, older-name, synonym-of, kew-entry, spelling). Otherwise it reads the old `/under the name |, reached by /` sentence, and now also "Kew holds … as a synonym of …".
- *Behaviour now.* The 469 range notes that showed only in the folded record now show beside the range, before B's fill runs (triage B3).
- *F5.* The fixed clause reads "Kew holds no entry of this page's name by its author". The old wording was false on 6 of the 12 pages that show it.
- *Other page.* When `via.page` names another page of the reference, `+page.server.ts` links it ("a page of its own here").
- *Absent fields.* An absent `name.cited` or `distribution.via` is "not read": the page falls back to the old sentence and never says "none".
- *Test:* `r72f-notes.test.ts`; on the base it fails because the module is missing.

**A2 page side.**
- *Code.* `olderNames()`. Where the dossier has `name.kew`, the older names Kew accepts as species of their own are left out of "Also known as" and listed on a line of their own: "Kew accepts as species of their own …", credited to WCVP, RBG Kew, with the file's day.
- *Absent `name.kew`.* Nothing moves and nothing is said of Kew.
- *Test:* `r72f-notes.test.ts`.

**F6: a summary's older-name proof.**
- *Code.* `summaryOlderName()` checks the same rule as `summaryTitleFits`. Where the article's title is one of the species' older names, the quotation's credit adds "its title is one of this species' older names (GBIF Backbone), which is the proof that the article is this species'".
- *Pages:* 54 show it, covering all 51 with no proof in the record, plus 3 whose record already names this proof.
- *Placement.* It sits beside the quotation, not in Provenance (B's file).
- *Test:* `r72f-notes.test.ts` pins `summaryOlderName` to `summaryTitleFits` on four cases.

**F9: generic headlines.**
- *Code.* `englishNames` (`dossier/index-entry.ts`) no longer gives a headline that is a generic noun alone. Where nothing fuller is given, no English name is shown, and `indexNames` keeps the noun as a searchable spelling.
- *Search.* `$core/search` ranks an exact match on a generic noun alone after every whole-word match, so "cactus" lists the named cacti first.
- *Moved list.* `GENERIC_NOUNS` now lives in `core/search.ts`; `index-entry.ts` re-exports it.
- *Superseded guard.* `r67n-names.test.ts` pinned the old rule (Copiapoa cinerascens headed "Cactus"); I changed that line, with a comment.
- *Pages and rows:* 2 pages, and their two index rows after `--index`.
- *Test:* `r72f-search.test.ts`; 2 of its 4 tests fail on the base.

**F12: "The reference has no Not".**
- *Code.* `addressGenus()` gives the 404 a genus only when the address is shaped as a name: a binomial, a trinomial, or a binomial with a rank and its epithet. The epithet may run to two words, since a slug's hyphen is a space by then: `copiapoa-cinerea-var-columna-alba` keeps its suggestions, as `corpus-r60.test.ts` requires.
- *Related wording fix.* The whole-genus clause no longer says "as Kew's WCVP lists its accepted species", which was untrue for the stapeliads. It now reads "a genus the list takes whole", and smoke's expectation is updated.
- *Tests:* unit in `r72f-notes.test.ts`; e2e in `tests/e2e/r72f-pages.spec.ts`, which passes in the full run. On the base its page says "The reference has no Not".

**/about/how, my own items.** Pinned by `r72f-about.test.ts`.
- F2: the stapeliads sentence.
- F3: A's POWO and IPNI sentence, checked against A's report.
- F14: D's lag clause, quoted from D's report.
- The F1 rule sentence.
- The F9 generic-noun sentences, in the names rule and in the search order.
- The F6 proof sentence.

The F3 and F14 sentences are true only once A's `kew-links` and D's unlagged reads are merged. To keep the suite green before the merge, I changed `r71f-about-70bc.test.ts` so that its assertion on the old lag words now matches D's words. The rest of that test still checks the old lag behaviour; it must become D's "no Wikidata URL carries maxlag" check at the merge.

**The harness.**
- *Tiers* (`scripts/predeploy.mjs`):
  - `--tier=corpus`: the unit tests, then strict Chromium and the Chromium phone.
  - `--tier=app`: the unit tests, then every engine.
  - `--tier=launch`: svelte-check, the unit tests, then every engine at 2 workers.
  - Each tier stops at its first failing step with one sentence.
  - An unknown tier, or a tier given beside `--browsers=` or `--project`, is refused with what to type.
  - Every step runs under `process.execPath`, so `cmd.exe` needs no `npx`.
  - Test: `r72f-predeploy.test.ts`; 2 tests, both fail on the base.
- *Workers:*
  - The default is 4 (`PW_WORKERS` still overrides).
  - `playwright.config.ts` holds each WebKit project to 2 (`PW_WEBKIT_WORKERS`).
  - Launch runs at 2.

## Needs

- **A:**
  - Add `name.cited` and `name.kew` to `NameBlock` in `src/lib/dossier/schema.ts`, as the brief's shapes. `v.object` drops unknown keys, so until then the page never sees them. My page reads them through casts and falls back to the old sentences.
  - `citedNote` imports your `kewCitedNote` and wraps it; keep its name and signature.
  - A5's registers line ("Kew holds this name only under another author; no POWO link") comes from your Wikidata row. If you want it under the registers rather than in the record, give me a field and I will place it.
- **B:**
  - Add `distribution.via` to the schema.
  - Check my five wordings for `via.kind` in `notes.ts` `rangeNote` against your meanings. "kew-entry" reads "the range is that of Kew's entry of these words by another author than the one this page cites".
  - `via.page` is read as a reference key (a string of digits).
- **C:** the iNaturalist placeholder fix (F8) is yours, as my trial did it (`placeholder()` in `shownPhotos`, with a test of Pseudophoenix sargentii's photograph 8).
- **D:**
  - `docs/DEPLOY.md` is yours. Please replace "on two workers (`PW_WORKERS` to change it)" with: "on four workers (`PW_WORKERS` to change it; WebKit is held to two of its own, `PW_WEBKIT_WORKERS`)". Then add: "A round names its tier: `node scripts/predeploy.mjs --tier=corpus` after a round that changed only the corpus builder (the unit tests, then Chromium and the Chromium phone), `--tier=app` after a round that changed pages or the app (the unit tests, then every engine), and `--tier=launch` once before the public launch (svelte-check, the unit tests, then every engine on two workers). Each stops at its first failing step and says which."
  - `corpus-step.mjs` may call `predeploy.mjs --tier=corpus` at its stop before the upload.

## About pages: what I will write after the merge, in one pass

- Every sentence in fix-A.md (five, including A2's new "Kew's own names" sentence), fix-B.md, fix-C.md, fix-D.md and fix-E.md.
- /about/how's sentence on the range note: it now shows beside the range.
- The Names & registers sentences for the "Registers not checked" pill and the "Kew accepts as species of their own" line.
- The F12 404 is not described on the about pages; nothing to write.
- /about/formats: `name.cited`, `name.kew` and `distribution.via` as formats, with "absent means not read". This also settles my review's finding 13: the page no longer hangs on a sentence.

## The corpus step

My part needs no fill.
- F1, F4, F5, F6, F12 and F13 take effect at the deploy: each is computed when a page renders, from the dossier as stored.
- F9's two index headlines change at the next `--index`. Until then the two catalogue rows still show "Cactus", but the search ranks them last at once.
- After the merge, the owner runs `node scripts/predeploy.mjs --tier=app`, since this round changes pages.

## Measured

Here (2 cores, shared, Chromium plus the Chromium phone, strict):

| Run | Workers | Result | Time |
|---|---|---|---|
| r72base, earlier, heavy load | 2 | 2 failed, 10 flaky (crashes) | 28.6 min |
| r72base | 4 | 1 flaky ("Target crashed") | 15.6 min |
| Final, this tree (478 tests) | 4 | 473 passed, 5 skipped, 0 flaky, 0 failed | 17.3 min |
| smoke split alone | 4 | 119 passed, smoke-2:218 failed both attempts | 6.8 to 7.6 min |

- In each split run, three of three, smoke-2:218 failed both attempts.
- The four smoke parts alone took about as long as smoke did serially (404 s). On two cores four workers only contend, so this machine cannot show what the split saves on the PC.
- Unit suite: see the last line below.

## Not done or departed from

- **The smoke split is withdrawn** (644d44f). I split smoke.spec.ts into four serial files along its three section markers, keeping all 119 tests and moving the shared helpers to `helpers/smoke.ts`.
  - In three runs of the four files at 4 workers, the photograph test ("removing asks twice; a species photograph that fails to load…") failed every time, on both attempts.
  - It passes alone, and in its own file run serially (17 of 17).
  - Its trace shows the image failing and the plant page drawing no "did not load" line and no reference tile. I could not find the shared state in time: routing the image host from the test's first page did not fix it, and neither did a 20 s wait.
  - Rather than land a split that is not clean, I restored the single file. The split commit is in the history (6c0efd9) to reapply once that test is understood.
  - Without the split, smoke still runs alone for the last third of a 4-worker run.
- **F1 is held to winter** (see Done).
- **F10 and F11 are owner items:** no change.

Checks on the final tree (ff82775):
- The whole unit suite: 385 files passed and 1 skipped; 3,673 tests passed and 8 skipped (3,681), in 6 min 8 s. An earlier run caught one failure, `corpus-r60` (a variety's two-word epithet lost its 404 suggestions); ff82775 fixed it.
- `npx tsc --noEmit -p .`: clean.
- `npx svelte-check --threshold error`: 0 errors and 0 warnings.
- Strict Chromium on the specs touched after the full run (r72f-pages, smoke's 404 test, r61w-pages): 10 passed.


## After the merge: the about pages


The pass is commit e6d2a5a on `r72m`, in `/tmp/claude-0/rev72/F`, on top of the merge (51d1976). It changes /about/how, /about/formats and three seam tests.

## What changed

I applied every "for F" sentence in fix-A.md to fix-E.md, after reading the merged code each one describes. All of them went in, two with changes (see "Sentences changed from the report").

**/about/how, A's sentences.**
- The name cited as Kew cites the entry the page links (`kewCitation`).
- The basionym's author with or without an "ex" inside the brackets (`basionymAuthors`, reading 5 of `ownByAuthor`).
- The POWO and IPNI sentence (`kewLinks`, `WCVP_ONLY`, `onlyAnotherAuthor`). It was already in from my fix phase.
- Common names that are a binomial Kew or the reference holds are not shown, and the record says so (`scientificVernacular`; the note goes in the `gbif.vernacular` row).
- A new sentence on `name.kew`. I extended it with my page's behaviour: the older names Kew accepts as species are listed apart, and a page not yet read says nothing of them.

**/about/how, B's sentences.**
- Kew's file day, said "as of" in the record (Provenance reads `asOf`).
- Doubtfully present regions.
- One stray record is no disagreement (`outsideOnly`).
- The Aeonium example moved to the spelling rule.
- The near-spelling rule (`nearSpellings`), with the unplaced, artificial-hybrid and broad-region cases.
- The range note shown beside the map, with a link.
- The three cells placed to within 10 km.
- The day of GBIF's download.

**/about/how, C's sentences.**
- Museum specimens.
- The bare-genus rule and Kew's synonyms among the species' own names.
- A photograph two pages would share is shown on neither.
- Kew's subspecies left out of iNaturalist's cultivated set.
- E-mail credits.
- iNaturalist's grey stand-in.

**/about/how, D's lag clause.** It was in from my fix phase. I added one clause of my own (F4): when Wikidata does not answer, the page says beside its register links that they were not checked.

**/about/formats.**
- `shared` on a photograph (C).
- `asOf` on a source row.
- One new passage for `name.cited`, `name.kew`, `distribution.via` (kind, entry, page, unplaced, file) and `distribution.doubtful`, each checked against `schema.ts`. Each, where absent, means not read, never none; for a dossier built before them, the page reads the old sentences.
- E's three replacements (the date question, the 404 for an unlisted key, the kept refusal).
- E's optional sentence on the photograph wait, checked against `engine.svelte.ts`: `NOT_REACHED_MS × 2^min(n, 4)`, two minutes up to sixteen.

**Seam tests.**
- `r71f-about-71.test.ts`: three assertions pinned the old words (the museum specimen, the kept 429, the records disagreeing). They now pin the new ones.
- `r71f-about-70bc.test.ts`: D's lag test was replaced with a check of the merged reads. The sentence is D's; no Wikidata URL in `wikimedia.ts` or `corpus-fills.ts` carries maxlag; `fetch.ts` retries 5 times. The unused lag imports were dropped. The behaviour itself is tested by D's `r72d-wikidata-unlagged`.
- `r72f-about.test.ts` gains four tests pinning the new sentences of A, B and C and the new formats.

## Checks

- **tsc:** clean.
- **svelte-check:** 0 errors, 0 warnings (1,172 files).
- **About-page unit and seam tests:** every unit test that reads either page, 30 files, 395 tests, all pass. With `r72f-about`, 9 tests.
- **Browser, strict Chromium plus the phone, 4 workers:** 54 passed in 1.3 min. The run covered:
  - r62bw-pages, r62w-pages, r69p-disclosure (each disclosure on /about/how and the other pages), r67h-engines (320 px, 200% text) and r63u-fonts;
  - r72f-pages;
  - the six smoke tests that open /about/how or /about/formats.

## Sentences changed from the report, and what is not yet true

- **B's spelling sentence.** The code holds two more conditions than the sentence had: an epithet of six letters or more, and all of Kew's rows of that spelling leading to one entry. I added both.
- **A's `name.kew` sentence.** I added what the page does with it (see above).
- **True of the code, not yet of the live corpus.** The page has been merged, but the stored dossiers change only when the corpus step runs the new fills (`kew-names`, `kew-links`, `range-source`, `inat --bulk`, `--index`). Until then, a page built before them does not show these sentences' effects:
  - "4 June 2026", "as of" and the download's day (B1);
  - the cited name (A1);
  - the dropped common names (A8);
  - the Kew-accepted older names (A2);
  - shared photographs (C5).
  
  Each reads the old sentence or says nothing, as the formats page now states. I could not make these true in the code alone; they become true when the owner's step has run.
- None of the sentences I wrote is untrue of the merged code.
