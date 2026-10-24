# Round 82, agent F: the build and the reference's data

Copy `/tmp/claude-0/rev82/F/`, branch `r82`, 9 commits on `r82base` (head `6e5d9ab`). Scratch `/tmp/claude-0/rev82/F-s/`: notes, the census tools (`tools/`), the suite log (`suite.log`), and a worktree of `r82base` (`base/`), where every new test was run.

No file under the hard limits changed. That covers `scripts/corpus-plan-full.txt`, `package*.json`, `wrangler.jsonc` and `static/s/`. Figures marked "sample" are from the reviewers' copies of live dossiers (`rev81r/D-s`, `rev81r/B-s`): 9,463 live pages, all 21 live `g` pages among them.

## Done

**F1. Echeveria peacockii and one Kew entry, one page** (review 1's 4)

- **The merge.** `scripts/merged-pages.txt` now reads `7530398 k2781125 Echeveria peacockii except:5690759`. GBIF lists seven names under 7530398 (asked of GBIF's API today). Kew's file puts six of them under Echeveria desmetiana 2781125. Only Cotyledon peacockii is left out: GBIF calls it a pro parte synonym, and Kew files it under Dudleya. The comments say why.
  - **A fact for the owner:** Kew's file of 2026-06-04 itself files the bare name *Echeveria peacockii* Croucher ex T.Moore & Mast. under Dudleya pulverulenta (2781292 under 2778991). So the merge rests on what GBIF's key holds, not on that row.
  - POWO's website could not be checked from here: it answers with a Cloudflare challenge.
  - New file `scripts/r82-repair-keys.txt` (`k2781125 Echeveria desmetiana`) is for (d).
- **Refusal at build.** `fillKewNames` (`kew-names.ts`) gives no page a Kew entry whose page `k<entry>.json` is on disk. Every build given `--bulk` runs it, and so does `--fill kew-names`.
  - The page gets `entry: ''`, no Kew synonyms and `heldBy: 'k…'`, which is a new optional field in `schema.ts`.
  - Its record says so in a `kew.names` row.
  - Its id stays its GBIF key, with the new reason `kew-held` in `page-ids.ts` and `rekey.ts`, written to `ids-gbif.txt`.
- **The check.** `sharedKewEntries` (`page-ids.ts`) runs at every rekey, so at every `--index`. It writes `kew-shared.txt` and prints a line. The review stop's `facts()` in `corpus-step.mjs` counts the file's lines, and says nothing when the file is absent, so its output is unchanged then.
  - On the live corpus it will list 3 entries: 505095, 2778991 and 327347.
  - (d) settles all three, so after (d) the file should be gone.
- **`viaOlderNames`: kept as it is.** In the sample, 8 pages read their range through older names. Only g7530398's lands on another page's entry, and it leaves with the merge. A narrower rule would take a correct range from the other 7 (Bisnaga glaucescens, Ceropegia sociarum and others). The duplicate is caught by the entry check instead.
- **Tests:** `r82f-peacockii` (10 tests, including the real builder on Kew's rows). 9 fail on the base; 1 is a guard. `r78i-merges` and `r80a-merges` were updated to the decision.
- **Mid-fill:** safe. The fill runs neither the merge nor the refusal. The index's id rule gives the same ids, because k2781125 is on disk, so g7530398 is still "merged away" and k2778991 keeps its id.

**F2. The Wikidata label sentence** (review 1's 6)

- I fixed the sentence, which was the smaller true fix; the code is unchanged.
- In the sample, 442 of 9,442 `k` pages say "found by its label or alias". 440 of them were proved by an IPNI or POWO number.
- The label is read only in two cases: where Kew gives the name no identifier (hybrids, whose rows GBIF's copy of Kew writes with ×), or where the record predates round 80 and was carried forward.
- `/about/how` now says this, with k2781134's own words as the example.
- **Test:** `r82f-pages-true`. The sentence test fails on the base; the code guard passes.

**F3. The real remainder of non-ok rows with no reason** (review 1's 7)

- **Rule** (`no-reason.ts`): leave out iNaturalist "skipped" rows (they await the fill) and the "none" rows the page already words as an absence.
- **Sample count:** 10 pages. Two are ranges (Bisnaga hamatacantha, and Soehrensia tarijensis, which is already on round 80's repair list). Eight are Wikidata rows built on 21 and 22 October.
- **The build now gives reasons:**
  - `bulk.ts` and `gbif.ts` say Kew's file holds no row of the name, and what GBIF's older names gave, or that the build did not read the entry's range.
  - `wikidataSaid` (`build.ts`) writes `NO_ITEM`, the words `--fill wikidata` already writes.
  - `wikimedia.ts` gives its one detail-less "none" a reason.
- **New listing:** `--list-no-reason` writes `rebuild-no-reason.txt`.
- **Tests:** `r82f-no-reason`, 6 tests, all fail on the base.
- **Mid-fill:** builds only, so safe.

**F4. A hybrid formula in the index's `syn`** (review 1's 27)

- `olderNamesOf` (`index-entry.ts`, lines 63-85, plus the new `isHybridFormula`) now leaves out:
  - formulas, such as "Mentha aquatica × spicata";
  - the species' own name spelt with an x, such as "Fragaria xananassa".
- **Sample:** 12 pages lose a name this way.
- **Test:** `r82f-hybrid-syn`, 3 tests, all fail on the base.
- **Mid-fill:** index-time and safe. It also narrows the photograph held-names of those few pages at the index.

**F5. "Answered" rows the page shows none of** (review 1's 29)

- `foundNotShown` (`ui/ref/upstream.ts`) and `Provenance.svelte` (its lines 3, 5 and 10, and the detail condition) add words in three cases, read from the dossier when the page is shown:

| Row | Sample pages | What it now says |
|---|---|---|
| GBIF media | 196 | no photograph on the page is GBIF's |
| Daily extremes | 128 (117 sea, 11 lapse) | set aside: the cell is mostly sea, or the lapse rule's own words |
| Kew's range | 37 | no native region |

- Because it is worked out at display time, every page shows it with the app deploy, with no rebuild.
- **Test:** `r82f-found-not-shown`, 4 tests, all fail on the base.

**F6. The Wikipedia cut** (review 1's 36)

- New `upToSentence` (`core/text.ts`), used in `wikipedia.ts`, keeps the last whole sentence within 1,500 characters and marks the summary `cut`.
- The `cut` flag goes in `schema.ts`, `build.ts`, `build-kew.ts`, `summary-fill.ts` and the genus fill.
- The species page (line 528) links "More on Wikipedia" for a cut text.
- None of the 4,767 summaries in the sample reached 1,500 characters; the longest is 1,465.
- **Test:** `r82f-wikipedia-cut`. 3 tests fail on the base; 1 is a guard.

**F7. The sea-floor sentence** (review 1's 39)

- `/about/how` now says what `pack-climate.py` does: it has masked the sea since round four. I also updated the comments in `provider.ts`.
- **Test:** `r82f-pages-true`, which fails on the base.

**F8. The thin-climate mark: no data change needed.**

- Every climate-ok dossier already carries `records` and `cells`. The lowest values in the sample are 3 records and 3 cells.
- Candidate lines, measured on the sample of 5,906 climate-ok pages and scaled to the live 37,788:

| Line | Sample pages | Share | Live pages (est.) |
|---|---|---|---|
| records < 5 | 371 | 6.3% | ~2,370 |
| records < 10 | 980 | 16.6% | ~6,270 |
| records < 20 | 1,612 | 27.3% | ~10,310 |
| cells < 4 | 316 | 5.4% | ~2,020 |
| cells < 5 | 551 | 9.3% | ~3,530 |
| records < 10 or cells < 5 | 1,004 | 17.0% | ~6,420 |

**About pages and DEPLOY.**

- `/about/how`: the two sentences above, plus one clause on the summary's cut.
- `/about/formats`: `heldBy` and `cut`.
- DEPLOY.md: `### Round eighty-two: the build and the reference's data (agent F)`.

**Checks.** `tsc` and `svelte-check` both report 0 errors. Whole unit suite: 4,586 passed, 32 failed, 3 skipped. All 32 failures are in `r70b2-follow-42`, and they fail the same way on `r82base`; see Needs.

## Repairs for the live site

In (d), with this round's code on the PC, add one line before the online line, and that line reads two more files:

```
npm run dossier -- --list-no-reason
npm run dossier -- --keys scripts/r80-repair-keys.txt,scripts/r82-repair-keys.txt,rebuild-wd-retry.txt,rebuild-no-reason.txt --grid climate --bulk bulk --skip inat
```

- **Pages:** k2781125, plus about 50 no-reason pages (estimated from the sample).
- **Sources:** GBIF, Wikidata, Wikipedia and Commons are asked once a page; iNaturalist is carried.
- **Time:** a minute or two for the listing, and a few minutes more for the online line.
- **Expected after `--prune-followed`:** the same `(9574874, 9592399, 7530398)`.
- **Expected after (d)'s `--index`:** there is no `kew-shared.txt`.
- Everything else in this report reaches the site through the plan's own `--index` or the app deploy.

## Needs

- **Coordinator, urgent.** The hotfix `b60206d` (judgeTaxon takes no FUZZY match) breaks 32 tests in `tests/unit/r70b2-follow-42.test.ts`.
  - At `dc222be` all 86 pass; on `r82base` 32 fail.
  - Its recorded GBIF answers include FUZZY matches it expects taken ("GBIF holds Psidium cattleyanum as this species").
  - The owner's `predeploy --tier=app` will stop on it. Its expectations need updating to the new rule; that is the hotfix author's call.
- **Coordinator, shared files I edited:**
  - `build-dossiers.ts`: lines 104, 190-191, 655, 1349-1354, 1808-1819 (`sayRekey`, `KEW_SHARED`), and the `--list-no-reason` block at 2006-2016.
  - `index-entry.ts`: `olderNamesOf` and `isHybridFormula`, lines 63-85. S also edits this file.
  - `/about/how`: the Wikidata, elevation and summary sentences.
  - The species page, line 528.
  - `/about/formats`: the `name.kew` and summary clauses.
  - DEPLOY.md: my new section.
- **S.** Kew's file keeps "Echeveria peacockii" among Dudleya pulverulenta's names (`syn` on k2778991), while the old address and the merge go to k2781125. So a search for "Echeveria peacockii" will show both pages; the merged page should come first.
- **U.** The thin-climate figures are in F8. `Provenance.svelte` changed at its lines 3, 5 and 10 and its detail condition. The species page changed at line 528.
- **Owner's decision.** Bisnaga hamatacantha (g7281739) and Ferocactus hamatacanthus (k2808164, keyless) look like one plant on two pages, with the same type: the Bisnaga name is a combination based on Echinocactus hamatacanthus Muehlenpf., which Kew files under Ferocactus hamatacanthus as a homotypic synonym. Kew's file holds no Bisnaga row. Should they be merged, as with peacockii?

## For the owner's PC

- Deliver before the fill's last day, on an evening between two fill days. `--status` should then show steps 1-10 done and 11 unfinished, with no `Note:`.
- The next fill day's index is written in full, about 12 minutes, because the code changed. It writes `kew-shared.txt` with three lines; that is expected.
- At step 13, the review line names `kew-shared.txt 3 Kew entries …`. After (d) it should name none.

## Measured

- Rekeying round 77's real corpus (8,947 pages) with this code took 256 s.
  - `kew-shared.txt` lists 9 entries: that corpus still holds the merged pairs.
  - No errors. The scratch copy has been deleted.
- The other figures (442 of 9,442; 10 of 9,463; 12 of 9,463; 196, 128 and 37; 0 of 4,767) are in Done.

## Not done, with why

- **A narrower `viaOlderNames` rule.** The figures above argue against it.
- **A check on ranges reached through older names that land on another page's entry.** `via.entry` is a label, not an id, so it needs more than the entry check; this should wait for a later round.
- **Rewriting the `/api/dossier` rows in place for F5.** They are fixed at display time on the page, not in the stored rows.
- **The Bisnaga merge.** It is the owner's decision.
