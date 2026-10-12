# Self-review 68, reviewer A: the corpus builder's matching across sources

Scope: round sixty-eight, sections 9 to 11 of `REVIEW-ROUND-67.md`, and section 1 of `REVIEW-PROMPT-68.md`. Code read at 1609c19 in `/tmp/rv68/A`. Reproductions are in `tests/unit/zz-rv-a-matching.test.ts` in that copy (8 cases, all pass, so every defect they describe is present). The round sixty-eight tests (`r68-builder`, `r68b-range-photos-search`, `r68c-same-type`) pass, 27 of 27.

Live data used: GBIF's backbone record and synonyms (`/species/{key}/synonyms?limit=50`) for all 52 species in `docs/review-68/range-keys.txt`, read on 2026-10-11; GBIF's copy of WCVP (dataset `f382f0ce-323a-4091-bb9f-add557f3a9a2`) for the Kew side; and iNaturalist's `/v1/taxa` search. POWO answered with a Cloudflare challenge, so the WCVP rows are GBIF's copy, not the owner's download.

## Findings

### A1. Kew's range "under an older name" takes another plant's range: Lantana ×strigocamara (launch, confirmed)

**Where.** `src/lib/dossier/bulk.ts`:
- 124 to 137: `accepted`;
- 140 to 146: `distributions`;
- 159 to 174: `viaOlderNames`;
- 463 to 471: the bulk fetcher's fallback.

Also `scripts/build-dossiers.ts:816`, the page's "Range source" row (`src/routes/species/[slug]/+page.svelte:583`), and `/about/how`.

**What happens.** The owner's run gave Lantana ×strigocamara the native range of "Lantana camara subsp. aculeata". The live rows show how. Four separate holes line up:

1. **The hybrid sign hides Kew's own entry.**
   - GBIF's canonicalName is "Lantana strigocamara". WCVP's taxon_name is "Lantana × strigocamara", and WCVP holds it as Accepted.
   - Nothing normalises "×", so the lookup by the page's own name finds nothing.
   - Every nothospecies in the corpus misses Kew this way and falls through to the older names.
2. **The fallback runs even when Kew does hold the name.**
   - `distributions()` returns `null` both when the name is unknown and when the name's accepted entry has no distribution rows (line 145). A garden hybrid like this one has no range at Kew.
   - The fallback then runs in both cases. So the page and `/about/how` are wrong to say "Kew holds no entry under this page's name".
3. **A single WCVP row is taken whatever its author.**
   - GBIF's synonyms are "Lantana ×mutabilis Lippold" and "… Lippold ex Otto & Dietr.". Their canonicalName is "Lantana mutabilis".
   - WCVP's two hybrid rows are keyed "lantana × mutabilis". So the only row under "lantana mutabilis" is Kew's "Lantana mutabilis Salisb.", a homonym that Kew sinks in L. camara subsp. aculeata.
   - `accepted()` checks authorship only when there is more than one row (line 125). "Lippold" against "Salisb." is never compared, and the homonym passes.
4. **The rule counts only accepted entries that have a range, at any rank.**
   - The entry the rule reached is a subspecies of another species: GBIF's backbone puts L. camara subsp. aculeata (6398352) under Lantana camara (2925303).
   - An older name that leads to Kew's own range-less entry for this species is skipped (line 167). It should count as evidence against the match.
   - Infraspecific older names never match anyway, because GBIF's canonicalName drops "var.": "Lantana crocea superba".

`via` is Kew's accepted name, not the older name that led there. So the record "under the name Lantana camara subsp. aculeata" names no name the species ever had, and nobody can audit it.

**A fifth hole, for new species.** `loadWcvp` loads the genera of the previous build's synonyms only (`build-dossiers.ts:816`). For a species with no previous dossier, a synonym in another genus is seen only if Kew accepts it, through `acceptedByName`. A synonym that Kew sinks back into this species is invisible. The "exactly one" count is then taken over a view that favours other species' entries.

**Reproduction.** In `zz-rv-a-matching`, A1 builds a `WcvpIndex` from the six live WCVP rows. It shows three things:
- `distributions('Lantana strigocamara')` is `null`;
- `viaOlderNames(<GBIF's three synonyms>).via` is "Lantana camara subsp. aculeata";
- the same result follows when Kew's entry is found under the page's own name but has no range.

A third case shows the single-row hole. "Huernia penzigii Baker", Ceropegia macrocarpa's synonym, is resolved through Kew's only row, "Huernia penzigii N.E.Br.", to Huernia macrocarpa. That one is probably the same plant, but the rule did not check.

**Is the rule sound, and should it require species rank or the same type?**
- **Species rank:** yes, for the Kew entry reached.
- **Same type:** no, not as a hard rule. Erythrina caffra reaches Kew's "Erythrina afra Thunb." only through heterotypic synonyms (E. fissa, E. viarum, E. constantiana, Chirocalyx pubescens), which all lead to it. Its same-type names are spelt "afrum" and "afra" at Kew, so they do not match. Conophytum tomasii reaches C. hanae only through a heterotypic synonym. Both look right.
- **The defect is the homonym and the hybrid sign,** not heterotypy as such. GBIF also marks pro parte synonyms (`PROPARTE_SYNONYM`, for example Oenothera leptocarpa under O. glazioviana). The fallback reads them like any other synonym, and it should not.

**What it should do.**
- Normalise "× " in both indexes.
- Run the fallback only when Kew has no row at all for the name. It should not run when Kew's entry for the name has no range.
- Require authorship agreement for every older name, with no single-row bypass.
- Skip pro parte synonyms.
- Count every accepted entry reached, with or without a range, and require exactly one, at species rank.
- Record the older name and its author beside Kew's entry: "Kew's entry Erythrina afra Thunb., reached through Erythrina fissa C.Presl".
- Rebuild the 17, and check Lantana ×strigocamara's habitat climate, which was read inside the wrong range.

### A2. The drops audit does not see identifiers, a summary or a range lost (should, confirmed)

**Where.** `src/lib/dossier/drops.ts:15-27`, and `indexDrops` below it.

**What happens.** The audit flags only two things:
- photographs dropping to zero;
- a source turning `refused` or `error` from something else.

It misses all of these:
- Wikidata or Wikipedia going from `ok` to `none` (Bisnaga glaucescens lost its item, its POWO, IPNI and WFO links and its Wikipedia summary in one run, and nothing was flagged);
- a range lost (`wcvp.distribution` going from ok to none, which is what A1's fix will do to some of the 17, and what the next WCVP release can do to any fallback range);
- photographs falling from 25 to 1;
- a second lagged build in a row (error before and error now), which carries the kept identifiers on again in silence.

**Reproduction.** Three cases in `zz-rv-a-matching` under A2 all return `[]`.

**Fix.** Add a line to the audit for each of these:
- an `ok` going to `none` for wikidata, wikipedia, inat.taxon or wcvp.distribution;
- any of `ids.{wikidata,powo,ipni,wfo,inat,wikipedia}` or `summary` going from present to absent;
- `distribution.native` going from non-empty to empty, or `verified` going from true to false;
- photographs falling by more than half;
- identifiers kept for a second build in a row.

`indexDrops` should also compare the index's `origin` and `photos` counts.

### A3. GBIF's synonyms are read 50 at most, so "exactly one" and "same type" are judged on part of the list (should, confirmed)

**Where.** `src/lib/dossier/sources/gbif.ts:64` (`synonyms?limit=50`, with no paging and no truncation mark) and `bulk.ts:465`, which asks the same.

**Evidence.** Two of the 52 have more than 50 synonyms:
- Oenothera glazioviana: 63 (13 more at offset 50, among them Onagra gigas and Onagra rubrinervis);
- Xerochrysum bracteatum: 51.

**Effect.**
- The "exactly one accepted entry" count and `sameTypeNames` run over a partial list, and neither the record nor the page says so.
- The dossier's synonym list, and therefore N1's search of "every older name", is short as well.
- The builder asks for the same synonyms twice for each species that misses Kew: once in `build.ts:177` and once in the bulk fetcher. A refusal of one and an answer from the other would not agree.

**Fix.** Page the request as `vernacular()` does, and mark a truncated list. Treat a truncated list as no answer for both fallbacks. Have the bulk fetcher reuse the builder's answer.

### A4. Same-type names miss the right name when GBIF records no basionym (minor, confirmed)

**Where.** `gbif.ts:77-80`.

**What happens.**
- Of the 52, only 22 accepted records carry `basionymKey`.
- Four are combinations, with a bracketed author, that carry none: Tylecodon cacaliodes, Ceropegia marnierana, Ceropegia ananthapuramensis and Melocactus lemairei. For these, `sameTypeNames` returns only names published on the species itself, which is nothing.
- Tylecodon cacaliodes (GBIF's misspelling) misses "Tylecodon cacalioides (L.f.) Toelken". iNaturalist files it under exactly that name, taxon 595832, while its search finds nothing for "cacaliodes".
- Aeonium tabulaeforme misses "Aeonium tabuliforme". GBIF puts that name on a separate basionym record, "Sempervivum tabuliforme", an orthographic variant. iNaturalist's taxon is "Aeonium tabuliforme", and it is found today only because of matched_term.

**Is it safe?** It fails towards no answer, never towards the wrong plant. In the 52 I found no case where it includes a wrong name:
- basionym groups were correct throughout;
- Sarcocaulon lheritieri (DC.) and Pelargonium lheritieri (Sweet) were told apart correctly;
- autonyms and varieties were excluded by rank.

**Reproduction.** Two cases under A4.

**Fix.**
- Where the accepted record has a bracketed author and no `basionymKey`, take the synonym group whose basionym has that author and the same epithet stem.
- Read GBIF's `HOMOTYPIC_SYNONYM` status as same-type too.

### A5. iNaturalist's search is not limited to plants, and `matched_term` may be a common name (minor, confirmed mechanism)

**Where.** `src/lib/dossier/sources/inat.ts:19, 24, 29`.

**What happens.** The query has no `taxon_id=47126`, so it is not limited to plants. Live answers:
- `q=Iris oratoria` returns the mantis 67437 (Insecta), exactly named.
- `q=Oenanthe pleschanka` returns a wheatear (Aves).
- `q=Golden barrel cactus` returns `matched_term` "golden barrel cactus" (a vernacular) on a species, and "Golden Barrel Cactus" on the subspecies Ferocactus cylindraceus eastwoodiae.

So both the exact-name test and the matched_term test can take an animal, or a taxon reached through a common name. `taxonByOlderNames` widens this to older genera (Huernia, Echinocactus and the like). I found no corpus species that collides. The `t.rank !== 'genus'` test is dead code, because the query already limits rank.

**Fix.** Add `taxon_id=47126` to the query.

### A6. The fallbacks' records do not say enough (minor, read)

1. **Kept identifiers carry no date.**
   - The note "the previous build's identifiers are kept" (`build.ts:345`) does not say which build last read them.
   - Provenance prints "asked <today>" beside the failed row, while the identifiers may come from several lagged builds back.
   - Provenance's own footer says a carried row names the build it came from. This one does not.
   - Fix: write "the identifiers of the build of <date> are kept", taking the date from the earliest build in the chain, as `carry()` does with `unchain`.
2. **iNaturalist's own taxon name is dropped.** `taxonByOlderNames` replaces `taxon()`'s "filed by iNaturalist as X" with "found under Y".
   - The live case is Reicheocactus famatimensis. iNaturalist has no such name; Echinopsis famatimensis and Lobivia famatimensis both lead to 870008, "Reicheocactus pseudoreicheanus". GBIF sinks that name in this species, so the match is right.
   - But the record never names the taxon whose photographs the page shows.
   - Fix: keep both clauses.
3. **A refused synonyms request reads as "nothing to report" (rule 2).**
   - When `gbif.synonyms` is refused or fails, `sameType` is `[]` (`build.ts:331`). The older-name steps for Wikidata and iNaturalist are then never asked.
   - Wikidata and iNaturalist's taxon still record `none`, which the page shows as "nothing to report".
   - Fix: when synonyms were not `ok`, add "older names not asked: GBIF synonyms <status>" to the `none`.

### A7. There is no Worker tail build, and the lag has no circuit breaker (minor, read)

- **No tail build.** No route or server module imports `buildDossier` (searched `src/routes`, `src/lib/server`, `hooks.server.ts`). The Worker serves the corpus and never builds a dossier.
  - `mwWait.tries = 1` therefore only governs tests.
  - The comments about "tail builds" are stale: `build.ts:2-3`, `wikimedia.ts:35`, `fetch.ts:3`.
  - So the brief's question about a Worker tail build has no subject at this commit.
- **The corpus script's request count.**
  - Each species makes at most five Wikidata calls: P846, label search, older keys, P566 entities and the item. Each call has up to five asks.
  - In practice the first call uses up its five asks and returns, which is about 35 s per lagged species, as the owner saw.
  - Older names add at most 5 iNaturalist searches and 1 GBIF synonyms request per species.
  - A full rebuild of 8,947 species during a lag spell would take about 87 hours.
  - Fix: stop retrying, and take the previous build's identifiers at once, after a run of consecutive species that each ended lagged.

## Checked and found sound

- **The maxlag loop** (`mwGet`): it waits the stated lag plus one second, clamped to 5 to 30 s. It returns the error body after the last ask, so the error is recorded as `error`, never as `none`. The script sets `mwWait.tries = MAXLAG_TRIES` (5) at load.
- **The P566 rule** only ever chooses among items that carry one of the same-type GBIF keys, so whichever item it keeps is the same plant.
  - If the basionym link points the wrong way, the basionym's item is kept. That item may lack its iNaturalist id or Wikipedia sitelink: a loss, not a wrong plant.
  - Two live items that do not name each other give no answer.
  - Small gap: `srlimit=3` with up to ten keys. If more than three items carry the keys, the search can return three and leave one standing, with a fourth unseen. It cannot produce a wrong plant, but `srlimit` should be the number of keys plus one.
- **`prevIds`** is used only when Wikidata errs or refuses. It is dropped as soon as Wikidata answers, whether ok or none, so a wrong identifier lasts only through consecutive lagged builds (A2, A6). The offline rederive carries identifiers by design and says so.
- **iNaturalist under older names:**
  - a refusal stops the asking and is the answer;
  - two taxa give no answer;
  - at most five names are asked;
  - the live Reicheocactus famatimensis case resolves correctly.
- **GBIF media** asks for CC0 and CC BY only, and still checks each photograph's own licence.
- **Range provenance:** `distribution.source` names Kew's entry, and the page shows it in a "Range source" row. The wording of that row is wrong (A1).

## Triage and round sixty-eight claims verified as done

- **N4:**
  - the offline fetcher answers `skipped`, never `refused` (`rederive.ts:27`);
  - the core is carried as one snapshot when it was not asked;
  - the audit fails on photographs dropping to none and on a source turning refused (narrow, see A2);
  - `--keys` works as described.
- **Section 9:** maxlag is waited out in the script only; the previous build's identifiers are kept and the record says so; iNaturalist's matched_term is required to be exactly the name asked.
- **Section 10:** the fallback to older names, the "exactly one" guard against two accepted entries, the `via` in `distribution.source`, and the older genera loaded from the previous build (but see A1 on all three).
- **Section 11:** same-type names, Wikidata by the older names' GBIF keys in one search, the P566 set-aside, iNaturalist under up to five names, and the notes in the record.
