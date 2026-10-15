# Round seventy-one: the merge of the agents' code needs

Branch `r71` in ``. Commit `a48726b` sits on `b235cfa`. No `/about/how` or `/about/formats` sentence changed, and no about seam test's expected sentence changed. Three test pins changed because the code moved; each is marked "round seventy-one (merge…)" and listed below.

## Each need

### A for B
1. **`--again`, and the fill's printing (`scripts/build-dossiers.ts`, `fillSummaries`): applied.**
   - `checkSummaries(…, undefined, { again: args.includes('--again') })`.
   - It prints "N settled, not asked again", adding "(--again asks them)" when the flag is absent.
   - It prints each of `c.uncheckedLines` under "not checked (run again)", then "N taken off until read".
   - The usage header names `--again`.
2. **IPNI and author passed to the build's summary call (`build.ts`): applied.** The call is now `wm.summary(…, { name, synonyms, item: ids.wikidata, ipni: ids.ipni, authorship })`.
   - Departure: A wrote `u(s.authorship)`. I pass `authorship`, which is the author the page cites: Kew's where B's `kewName` applies, otherwise GBIF's.
   - Reason: the fill's `whoOf(d)` reads the stored `d.name.authorship`, and that field holds the same value. The build and the fill then prove a title the same way.
3. **`carry('wikipedia')` guard: applied as A wrote it.** `proofByName` is imported from `summary-proof`, and `recordedProof` through `corpus-fills`.
   - A previous summary is carried only when its title is the name or an older name, or when its record names a proof. Otherwise this build's own refusal row stands.
   - `keepPrevIds` is unchanged, as A says: `summary()` now proves a carried title itself.
   - Not applied: A's optional cost note (passing `pre: { species }`). It was a suggestion, not a need.

### B and C: the slip rule (S-B7, S-C9, S-F13)
**Settled with C's rule. Every test of B and C passes.**

1. **The rule.** `judgeTaxon` (`inat.ts`) now decides a slip by C's `slipStanding`.
   - It uses the Kew rows `kewSays` already read (now returned as `rows`) and GBIF's exact match `judgeTaxon` already holds.
   - I did not use `askSlip`. C's report allows this: "code that already holds Kew's rows and GBIF's exact match can call `slipStanding`".
   - Reasons for not calling `askSlip`:
     - It would repeat the WCVP request.
     - It would add a `strict=true` match request. The recorded fixtures (`r70c-slip.json`, `r70b-follow-42.json`) have no answer for that request, so every follow test would have read it as a refusal.
     - Inventing those answers was not acceptable.
   - A non-strict EXACT match with the same canonical name is the record that a strict match returns.
2. **What moved.**
   - B's `kewOurs` request (needed only by `slipTaken`) is gone.
   - `NameWord`, `slipTaken` and `transferTaken` moved to `photo-kind.ts`, and `inat.ts` re-exports them. `r71b-inat-sister` imports them unchanged.
   - `transferTaken` (the genus transfer, which C's rule does not cover) is still used.
3. **Leftover to remove later:** `slipTaken` is no longer called by any code. It stays only because B's tests pin it, and its doc says so. Remove it and its pinned cases when B agrees.
4. **The author is now passed.**
   - `JudgeFor` gains `authorship`.
   - The build passes its cited `authorship`.
   - `fillInatIds` passes `d.name.authorship ?? ` the author from GBIF's species record. `sameTypeOfRows` now returns that author: it already fetched the record.
5. **A wording pin, kept.** The record still ends "…: this species' epithet, spelt one letter otherwise".
   - C's wording put "(why)" after that phrase. That would have broken `r70c-inat-slip`'s pin, which expects the phrase at the end.
   - So C's reason now goes before it: "`<where> (<why>): this species' epithet, spelt one letter otherwise`". A refusal reads "`<why>: not taken`".
6. **Where the two rules differ: a GBIF-accepted name by another author.**
   - B's rule takes it when Kew holds no row of it and accepts this species. C's rule refuses it.
   - Othonna cakilifolia DC. and Echinocereus chisosensis W.T.Marshall are the same author, so both are still taken under C's rule.
   - The new test `tests/unit/r71m-merge.test.ts` pins both sides of the difference.
7. **Proof the author matters.** With the author dropped from `fillInatIds`, `r70c-inat-slip` (both cases) and F's chisosensis case fail. So C's rule is what these tests now drive.
8. **Tests that pass with C's rule:**
   - the 42 follows (`r70b2-follow-42`);
   - the sister pairs and guards (`r71b-inat-sister`);
   - the R47 family guard (`r70b-r47-inat`);
   - `r70b-inat-follow`, `r69m-inat-ids`, `r70c-inat-slip`;
   - all of C's tests (`r71c-*`, `r70c-photo-kind`, `r70c-second-pass`, `r70c-commons-kind-fill`).

### C's other needs
- **`build.ts` passes `authorship` to `commonsPhotos`: applied.** This broke a source-text pin in `r69k-index-seam` ("passes Commons the species' names"). I updated the pin to the new call because the code moved.
- **The fill's print line in `fillCommonsKindStep`: applied**, as C wrote it.
- **`specimen` on records that are not observations: already met by B.**
  - `gbif.media` asks for HUMAN_OBSERVATION only and marks `specimen` on any other basis.
  - The bulk path admits HUMAN_OBSERVATION only.
  - This is stricter than C's "not HUMAN_OBSERVATION or OBSERVATION". No change.
- **`r69p-about-seams` fixture host: applied.** `images.example-herbarium.org` became `images.example-dataset.org`, at both the photograph and the check, because the herbarium-host rule now drops it. This is a code pin, not a sentence.

### F for B
1. **`fillInatIds` records a carried id it checked and kept: applied, with two departures.**
   - It writes F's row: "iNaturalist's taxon N (Name), kept from an earlier build, checked DAY: active and this species' own". With no name it says only "active".
   - **Departure 1: a row the build already wrote as `ok` is left alone.** That row is not the false "not asked". Overwriting it would rewrite every dossier (and re-upload it) on every run, and would lose the build's own detail.
   - **Departure 2: a third site is covered.** `carried && !moved` (a carried id of another name that the rule takes) is recorded as "active, and taken: <why>". It has the same false banner.
   - Test: `r71m-merge` covers a "not asked" row written once, and an `ok` row untouched with no write.
2. **`r71f-about-70bc` Ixora case: done.** It is now `it` and passes. Its header comment says the merge made it so.

### E
- **Need 1, the shape half: applied.** In `r70p-about-rules`, "the hour of uploads" now expects `{ m: [[minute, 1]] }`. This is a code pin, so I applied it.
- **Need 1, the sentence half, and Needs 2 to 7:** these are sentences, left to F.
- No code need for any other agent.

### D
- **Fold hash:** `fold-rules.test.ts` passes on the merged tree with D's hash `b854e376…`. No hashed block changed after D (E changed none, and neither did I), so nothing was re-recorded.
- D's other needs are sentences for F.

### Needs for F, not applied (sentences)
Left to F's second pass: A's three, B's 1 to 9, C's `/about/how` and `/about/formats` sentences, D's 2 to 4, and E's 1 (the sentence) and 2 to 7.

## Runs
- **`npx tsc --noEmit -p .`:** clean.
- **`tsconfig.scripts.json`:** nothing in the files I touched.
- **`npx svelte-check --threshold error`:** 1,139 files, 0 errors.
- **Whole unit suite** (`merge-unit.log`): 3,612 passed, 3 failed and 8 skipped, in 379 files.
  - The fourth failure there, `r69k-index-seam` "passes Commons the species' names", was the source pin above. I fixed it after the run and re-ran it green with `r71m-merge` and `r69p-about-seams` (19 passed).
- **Still red, waiting on F's second pass** (both are C's need "drive the new sentences"):
  1. `r70p-about-rules` › "an uploader's slip is the species' where the reference holds no such name: the sentence's own two cases". The sentence still says a slip is shown where the reference holds no such name. C's S-C9 now hides a slip until Kew and GBIF have been asked (`Photo.slips`).
  2. `r70p-about-rules` › "a year from 1500 to 1899 in the name marks a printed work". The sentence still says a year alone marks a printed work. C's S-C8 needs other print evidence, so "Dasylirion graminifolium Zuccarini 1843" with no evidence is now shown.
