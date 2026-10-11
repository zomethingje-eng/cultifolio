# Round sixty-nine, agent M: matching across sources and the corpus builder

Copy: `/tmp/r69/M`. Base: 1609c19 (`/tmp/r69/base`). New files: `src/lib/dossier/corpus-run.ts`, `src/lib/dossier/corpus-fills.ts`, `tests/unit/r69m-range.test.ts`, `r69m-names.test.ts`, `r69m-inat-ids.test.ts`, `r69m-corpus.test.ts`. I also took `src/lib/dossier/fetch.ts` (offered) and `src/lib/ui/ref/upstream.ts` (unowned; one line added, see M8). Existing tests of my files edited where a rule changed on purpose: `r68-builder`, `r68b-range-photos-search`, `r68c-same-type` (each edit says why in a comment).

"Fails on base" below was checked by copying the test files into a copy of the base (`base` + node_modules) and running them there. For the two new modules the base has no file, so the tests that import them fail at import; to see that each also fails for the right reason I ran them again with the two new modules copied into the base copy (they then fail on the base's `gbif.ts`, `wikimedia.ts`, `inat.ts`, `build.ts`, `drops.ts` and the script). The few tests marked "guard" pass on base by design.

## 1. Per item

### M1. A GBIF photograph takes no licence from its record
- `sources/gbif.ts` `media()`: `licenceTag(m.license)` only, as the bulk path reads it. New `occurrence(f, key)`.
- `corpus-fills.ts`: `fillGbifLicence` (one dossier) and `fillGbifLicenceAll` (the store). Candidates are GBIF photographs not on iNaturalist's hosts (`inaturalist-open-data.s3.amazonaws.com`, `static.inaturalist.org`); each distinct occurrence key (the part of the id before the colon) is asked once; a photograph whose media item (matched by its identifier) states no open licence of its own is dropped. A record GBIF no longer serves (404), or a record that no longer carries the item, also drops it: its own licence can no longer be shown (rule 4). A refusal stops the run and leaves that dossier untouched.
- Resumable: the GBIF media row gets "; each photograph's own licence checked YYYY-MM-DD[: n without one dropped]", and a later run passes such dossiers by.
- Script: `--fill gbif-licence`, then the index. It says how many dossiers were left with no photograph, to be asked again by `--fill gbif-open` (which now reads each photograph's own licence only).
- Tests (`r69m-corpus`): the ALA-shaped record (record CC BY, item silent) publishes only the item with its own licence; the fill drops the silent one, never asks about the iNaturalist one, writes the mark; resume and refusal. All fail on base.

### M2. Kew's range under older names
- `bulk.ts`, `WcvpIndex`:
  - `wcvpKey`: lower case with "×" and the space after it removed, in both indexes (`byName`, `acceptedByName`); `addName` asks `wanted` with the sign removed, so a nothogenus is wanted by its genus.
  - `holds(name)`: Kew has any row under the name. The bulk fetcher runs the older-name fallback only when it has none.
  - `distributions()` now returns the range by the resolved entry (`rangeOf(entry)`), with `rows: []` when Kew holds the entry with no range; the fetcher answers that as `held` ("Kew holds this name, with no native range"), never as a reason to look further. An entry whose range this index never read (outside the loaded ids) is still `null`, as before.
  - `authorsAgree`: both authors stated and equal read loosely, or equal once ex-authors are dropped (ICN Art. 46.4: "Lippold ex Otto & Dietr." is "Otto & Dietr.", but not "Lippold"). No single-row bypass.
  - `viaOlderNames` rewritten: pro parte skipped; every accepted entry reached counts, with or without a range; one older name that leads to two entries ends the lookup; exactly one entry is required, at species rank; its range is read by its id (IND-9); it returns `{ rows, kew, entry, via }` or `{ ambiguous }`.
- `sources/gbif.ts` `distributions()`: reads `held`, `entry`, `via` and `olderAmbiguous` (the last as the new `ambiguous` status).
- `build.ts`: `rangeSource()` gives "WCVP (Govaerts, RBG Kew): Kew's entry Erythrina afra Thunb., reached by Chirocalyx pubescens Walp." (the first of the older names that reached it, in GBIF's order), "…: Kew holds Lantana × strigocamara R.W.Sanders, with no native range", or "…: not taken, the older names lead to more than one entry". The `wcvp.distribution` row says the same. The climate for `held` and `ambiguous` says "native range not verified: …".
- Same-type names are not required (S-A's decision). Erythrina caffra still reaches E. afra Thunb. (real GBIF and WCVP rows).
- The Range source wording is P's: sentence and patch under Needs.
- Tests (`r69m-range`, all real rows from GBIF's copy of WCVP and GBIF's synonyms): Kew's own entry found under "Lantana strigocamara"; held with no range answered as held, with no synonyms request; the single Salisb. row refused for "Lippold"; a subspecies entry refused; pro parte skipped; Erythrina caffra; the IND-9 homonym resolved by author. All fail on base.

### M3. Wikipedia redirects
- `sources/wikimedia.ts` `summary(f, title, accept?)`: with `accept`, a final title outside it is `none` with "Wikipedia redirects X to Y". `build.ts` passes the asked title (the sitelink, or when Wikidata did not answer the previous build's title, itself checked by the pass below) plus the name and the older names of species rank. `mark()` now keeps a "none" detail when a source gives one.
- `--fill summaries` (`checkSummaries`): a stored title that is the name or an older name (binomials only: a subspecies' first two words are another species') stands. The dossier keeps no sitelink, so a title that is neither (Saguaro for Carnegiea gigantea) would be dropped by a purely offline rule. Such titles are checked against the item's own English sitelink, fifty items a Wikidata request; with no item, or a sitelink that is not the title, the summary is dropped ("none: Wikipedia redirects X to Y", `ids.wikipedia` and the link removed). With `--offline`, or when Wikidata does not answer, those are left and counted "not checked". This is the nearest sound form of "an offline pass": the file alone cannot tell a sitelink from a redirect.
- Tests (`r69m-names`, `r69m-corpus`): Weingartia pulchra and Kopsia fruticosa, the build's record, the pass with and without Wikidata. Fail on base except the "stands" guard.

### M4. GBIF synonyms paged
- `gbif.ts` `synonyms()`: pages of 100 (`SYNONYM_--- a/src/routes/species/[slug]/+page.svelte	2026-10-11 17:59:43.504767363 +0000
+++ b/src/routes/species/[slug]/+page.svelte	2026-10-11 17:59:43.626659867 +0000
@@ -283,6 +283,8 @@
     const st = d.upstream['wcvp.distribution']?.status;
     if (st === 'none') return 'No published distribution for this name.';
     if (st === 'refused' || st === 'error' || !st) return `Not checked: the distribution source ${notAnswered(st)} when this page was built.`;
+    // Kew holds no entry under this name and its older names lead to more than one: nothing taken (round sixty-nine; triage-68 M2, M8).
+    if (st === 'ambiguous') return `Not taken: ${d.upstream['wcvp.distribution']?.detail ?? 'Kew holds no entry under this name, and its older names lead to more than one entry'}.`;
     if (d.distribution.ambiguous) return `WCVP holds more than one name spelt this way (${d.distribution.ambiguous}); no native region is read from it.`;
     return d.distribution.introduced.length || d.distribution.extinct?.length ? 'WCVP lists no region where it is native; the regions it does list are named here.' : 'WCVP lists no native region for this name.';
   });
@@ -580,7 +582,7 @@
     <div class:wide={longRange}><b>Native</b>{#if d.distribution.native.length}{d.distribution.native.map((r) => unitName(r.name)).join(', ')}{#if d.distribution.verified === false}<span class="small muted"> · stated native by a national checklist, not by WCVP: unverified</span>{/if}{:else if d.distribution.reported?.length}<span class="muted">Not verified.</span><span class="small muted"> Reported present (native status not stated): {d.distribution.reported.map((r) => r.name).join(', ')}</span>{:else}{distWords}{/if}{#if d.distribution.introduced.length}<span class="small muted"> · introduced: {d.distribution.introduced.map((r) => r.name).join(', ')}</span>{/if}</div>
     {#if d.centroid}<div class:wide={longRange}><b>Map marker</b>{d.centroid.lat}, {d.centroid.lon}<span class="small muted">{' · '}in the densest population, {d.centroid.n} records ({Math.round(d.centroid.share * 100)}% of those in range)</span></div>{/if}
     <!-- A range Kew files under another of the species' names says which (round sixty-eight). -->
-    {#if d.distribution.native.length && /under the name /.test(d.distribution.source)}<div class="wide"><b>Range source</b>{d.distribution.source}<span class="small muted"> · Kew holds no entry under this page's name; the range is its entry for that name, the one the species' older names lead to</span></div>{/if}
+    {#if d.distribution.native.length && /under the name |, reached by /.test(d.distribution.source)}<div class="wide"><b>Range source</b>{d.distribution.source}<span class="small muted"> · Kew holds no entry under this page's name; the range is the one Kew entry the species' older names lead to, reached by the older name named here, whose author agrees with Kew's</span></div>{/if}
     {#if d.distribution.extinct?.length}<div><b>Extinct in</b>{d.distribution.extinct.map((r) => r.name).join(', ')}<span class="small muted"> · recorded as extinct by WCVP: history, not habitat; no records are tested against these regions</span></div>{/if}
     {#if d.distribution.kew?.lifeform || d.distribution.kew?.climate}<div class="wide"><b>Kew's description</b>{[d.distribution.kew.lifeform, d.distribution.kew.climate].filter(Boolean).map((t) => `“${t}”`).join(' · ')}<span class="small muted">{' · '}quoted from WCVP, RBG Kew (CC BY 4.0); not derived here</span></div>{/if}
     {#if d.distribution.ambiguous}<div class="wide"><b>Name not resolved</b>{d.distribution.ambiguous}<span class="small muted"> · WCVP lists this name more than once and authorship did not decide, so no range is attached and nothing is derived from records</span></div>{/if}`) until `endOfRecords`, at most 10 pages; past that `truncated`; a later page refused is a refusal. Rows now carry `authorship` and `status`.
- `build.ts`: records "truncated: the first N rows only"; a truncated, refused or failed list gives no older names to either fallback.
- `bulk.ts`: the bulk fetcher keeps the builder's synonyms pages for the species being built and reads them through the same `synonyms()`; GBIF is asked once.
- `--list-rebuild` writes `rebuild-keys.txt` ("<key> <name>\t<reason>"): every dossier whose range came under an older name ("under the name" or "reached by") and every dossier with exactly 50 stored synonyms. It is usable with `--keys` as it is. (I made one list for both step-5 groups rather than a `--list-synonym-cap` of its own.)
- Tests: Portulaca oleracea's real 65 synonyms (P. retusa at 54, P. terraereginae at 62); truncation; a refused second page; the build's records; the bulk fetcher's single ask; a cut list gives no older-name range. Fail on base.

### M5. Inactive iNaturalist ids
- `inat.ts` `checkIds()`: `/v1/taxa/<ids>`, 30 a request; an id not returned is inactive with no successor.
- `build.ts`: every id from Wikidata or carried is checked (`checkedInatId`). An inactive id is followed when `current_synonymous_taxon_ids` names one taxon ("iNaturalist's taxon 133599 (Dypsis lutescens) is inactive; followed to its current taxon 276548"); otherwise dropped, and the name search runs. A check refused or failed keeps the id and records `inat.taxon` as refused/failed with "not checked".
- Carried identifiers: new `BuildOptions.prevIdsOn` and `CARRY_DAYS = 90`. Kept: "the identifiers of the build of YYYY-MM-DD are kept". Too old, or no day known: not kept, and said. The day comes from `idsReadOn()` (`corpus-run.ts`): the build that asked Wikidata, a "carried from build of" day, or the day a kept-ids row names. Round sixty-eight's "the previous build's identifiers are kept" names no day, so those are not carried again. With no id the iNaturalist name search still runs.
- `--fill inat-ids` (`fillInatIds`): the same over every dossier; a followed or dropped id opens both photograph rows ("skipped: the iNaturalist taxon changed; ask again") so `--fill inat` takes them.
- Tests (`r69m-inat-ids`, iNaturalist's real answers for 133599, 119671, 276548): all fail on base.

### M6. iNaturalist older-name fallback
- `taxonByOlderNames(f, names, { accepted, heldElsewhere })`: a taxon is taken only when its own name is the accepted name or one of the same-type names asked, and the index does not hold it as another species. The answer names the older name and, where it differs, "filed by iNaturalist as X". Two taxa: `ambiguous`. Refusals keep the reasons ("Rebutia pulchra finds Weingartia canigueralii, which is neither…").
- `taxon()` searches carry `taxon_id=47126`. Its matched_term path also refuses a taxon the index holds as another species (same failure, own name; one line).
- Script: `heldElsewhere: heldElsewhereIn(existing, key)` from the corpus on disk; `--fill inat` builds the same map.
- Note: Reicheocactus famatimensis (S-A6.2), right by GBIF's synonymy, is now refused, because iNaturalist's taxon name (R. pseudoreicheanus) is neither its name nor a same-type name. That is the rule as decided.
- Tests: W. pulchra and Rebutia pulchra -> 1576161 refused; held elsewhere refused; plants only. Fail on base.

### M7. Wikidata name fallback
- `crossIds`: by name, the one exact label only (two: `ambiguous`); the item must have P846 equal to the key or a same-type key, or, with no P846, P225 equal to the name. A failed proof falls through to the older-key search. Older-key search `srlimit` = keys + 1. The older-names parameter takes `{ key, name }` (numbers still accepted), so the record names the older name.
- Tests: two labels, P225 proof both ways, a same-type key, srlimit=4 for Bisnaga's three keys. Fail on base.

### M8. Provenance and `ambiguous`
- `fetch.ts`: `SourceResult<T>` adds `ambiguous` and a "none" with a reason. Used by `crossIds`, `taxon`, `taxonByOlderNames`, `distributions`, `summary`.
- Recorded as `ambiguous`: two Wikidata labels, two Wikidata items left by the older keys, two iNaturalist taxa (own name or older names), older names leading to two Kew entries.
- Every older-name answer names the older name (Wikidata, iNaturalist, WCVP). Kept identifiers name their build (M5). A synonyms list refused, failed or cut short writes "older names not asked: GBIF synonyms <status>" on the `none` of Wikidata and iNaturalist's taxon.
- `src/lib/ui/ref/upstream.ts`: `UPSTREAM_WORD.ambiguous = 'not taken: two items answered'`. I took this file (no one listed it); if P also edits it, the one added line merges cleanly. The schema's status list (K's `schema.ts`) and Provenance's tone and footer (unowned, P) are Needs.
- Tests: the pill word and the schema accept the status; the build records `ambiguous`; the refused-synonyms note. Fail on base.

### M9. The drops audit
- `drops.ts`: adds identifiers lost (wikidata, powo, ipni, wfo, inat, wikipedia), the summary lost, the native range lost or no longer verified, `ok` to `none` or `ambiguous` for wikidata, wikipedia, inat.taxon and wcvp.distribution (with the new detail), photographs falling by more than half, and kept identifiers twice running. `indexDrops` adds photographs halved and a range lost (`origin`). `audit-common-names.ts` (N's) needs no change: the index JSON carries `origin`.
- Tests: the Bisnaga-shaped loss gives nine lines (base: none); kept twice; the index. Fail on base.

### M10. Lag spell and stale comments
- `wikimedia.ts` `lagSpell()`, `LAG_SPELL = 10`: after ten species in a row whose Wikidata row ended with maxlag, `mwWait.tries` drops to 1 (one ask, fails at once, the previous identifiers kept); the first species Wikidata answers puts it back to 5; a species that did not ask leaves the count alone. The script calls `lag.after(d.upstream.wikidata)` after each build and says when the spell starts.
- The "tail build" comments are gone from `build.ts`, `wikimedia.ts`, `fetch.ts` and the script's header.
- Tests: the spell; a seam test that none of the four files mentions a tail build. Fail on base.

### M11. Script wiring tests
- `corpus-run.ts`: `startCorpusRun()` (sets `MAXLAG_TRIES`, returns the spell), `prevIdsFor()`/`idsReadOn()`, `heldElsewhereIn()`, `fillOpenGbifAll()` and `fillCommonsAll()` (the loops with their resume skips), over a `DossierStore` the script backs with the files (`diskStore()`).
- Tests (`r69m-corpus`, "the script's wiring"): the mwWait seam (the function sets 5, the script calls it at top level and feeds the spell); prevIds with their day reach the build (script reads `...prevIdsFor(prevOf(j.key))`); both fills' resume skips driven with dossiers in memory and a counting fetcher (removing either `continue` asks again: red); the homonym guard (`r69m-range`, one older name under two entries); the range-only rule (an accepted entry without a range counts). The R46-31 genus revert (`rank !== 'genus'`) has its test too. All fail on base.

### K5 (build order)
- `build.ts`: GBIF media is asked before Commons; it is asked when `mediaFirst` or when fewer than six photographs came from iNaturalist, so Commons' files never count towards the six; Commons is then asked when under twelve, as before. GBIF's photographs come before Commons' in the list.
- Test: three iNaturalist photographs, GBIF's and six Commons files: GBIF's are there and before Commons' (base: Commons first, nine photographs, GBIF not asked).

### Hook points for K (`scripts/build-dossiers.ts`)
- `shownPhotos` (above `type IndexEntry`): an identity today; `indexEntry` computes `const shown = shownPhotos(d.photos)` once and uses it for `heroOf(shown)` and `photos: shown.length`.
- `uncredited` (above `pruneUncredited`): a top-level predicate the prune reads.
- K's patch (`needs/build-dossiers.patch`, `needs/build.patch`, written against the base) touches exactly these lines; its merge-ready form against my files is under Needs (5), with the two lines it changes in `build.ts` (`pd` in `photosFromMedia`, and the Commons call's fourth argument, which already sits in the new order).

## 2. Needs

**(1) K, `src/lib/dossier/schema.ts`: the new status.** Without it every build that records `ambiguous` fails `parseDossier`. Applied in my copy to run the tests.
```diff
--- a/src/lib/dossier/schema.ts	2026-10-11 14:28:14.000000000 +0000
+++ b/src/lib/dossier/schema.ts	2026-10-11 17:35:57.073746067 +0000
@@ -11,7 +11,8 @@
 /** v2 (September 2026): the habitat climate is an envelope across every in-range record's cell, not one point. */
 export const DOSSIER_V = 2 as const;
 
-export const UpstreamStatus = v.picklist(['ok', 'none', 'refused', 'error', 'skipped']);
+/** `ambiguous`: two records answered where one is required, so none was taken (round sixty-nine; triage-68 M8). */
+export const UpstreamStatus = v.picklist(['ok', 'none', 'refused', 'error', 'skipped', 'ambiguous']);
 export type UpstreamStatus = v.InferOutput<typeof UpstreamStatus>;
 
 /** Every upstream answers one of: it gave data (ok), it said there is none
```

**(2) Unowned (P or whoever keeps the fixtures), `fixtures/upstream.ts`: iNaturalist's answer for the ids the fixtures' Wikidata gives**, which the build now checks; without them `r67n-builder`'s offline case reads a refusal. Applied in my copy.
```diff
--- a/fixtures/upstream.ts	2026-10-08 21:26:14.000000000 +0000
+++ b/fixtures/upstream.ts	2026-10-11 17:38:47.283354681 +0000
@@ -79,6 +79,8 @@
       entities: { Q159760: { claims: { P5037: [{ mainsnak: { datavalue: { value: 'urn:lsid:ipni.org:names:30001306-2' } } }], P3151: [{ mainsnak: { datavalue: { value: '75434' } } }], P373: [{ mainsnak: { datavalue: { value: 'Welwitschia mirabilis' } } }] }, sitelinks: { enwiki: { title: 'Welwitschia' } } } }
     },
     'https://en.wikipedia.org/api/rest_v1/page/summary/Welwitschia': { title: 'Welwitschia', type: 'standard', extract: 'Welwitschia is a monotypic genus of gymnosperms, the sole described species being the distinctive Welwitschia mirabilis, endemic to the Namib desert within Namibia and Angola. (Fixture text standing in for the CC BY-SA extract.)', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Welwitschia' } } },
+    // iNaturalist's own word on the id Wikidata gives: active (round sixty-nine; triage-68 M5).
+    [`${INAT}/taxa/75434`]: { results: [{ id: 75434, name: 'Welwitschia mirabilis', rank: 'species', is_active: true }] },
     [`${INAT}/observations?taxon_id=75434&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=false`]: inatObs(75434, 9, 7, false),
     [`${INAT}/observations?taxon_id=75434&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=true`]: inatObs(75434, 3, 8, true),
     'https://commons.wikimedia.org/w/api.php': { query: { pages: { '1': { title: 'File:Welwitschia mirabilis fixture.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/Welwitschia_fixture.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/xx/Welwitschia_fixture.jpg/800px-Welwitschia_fixture.jpg', width: 3000, height: 2000, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Welwitschia_mirabilis_fixture.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 3.0' }, Artist: { value: '<a href="#">Fixture Photographer</a>' } } }] } } } },
@@ -101,6 +103,7 @@
     'https://www.wikidata.org/w/api.php?action=wbsearchentities': { search: [{ id: 'Q5168360', label: 'Copiapoa cinerea' }] },
     'https://www.wikidata.org/w/api.php?action=wbgetentities': { entities: { Q5168360: { claims: { P3151: [{ mainsnak: { datavalue: { value: '135254' } } }] }, sitelinks: { enwiki: { title: 'Copiapoa cinerea' } } } } },
     'https://en.wikipedia.org/api/rest_v1/page/summary/Copiapoa_cinerea': { title: 'Copiapoa cinerea', type: 'standard', extract: 'Copiapoa cinerea is a species of cactus from northern Chile. (Fixture text.)', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Copiapoa_cinerea' } } },
+    [`${INAT}/taxa/135254`]: { results: [{ id: 135254, name: 'Copiapoa cinerea', rank: 'species', is_active: true }] },
     [`${INAT}/observations?taxon_id=135254&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=false`]: inatObs(135254, 14, 9, false),
     [`${INAT}/observations?taxon_id=135254&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=true`]: inatObs(135254, 6, 10, true),
     'https://api.openalex.org/works': { results: [] }
```

**(3) P, `src/routes/species/[slug]/+page.svelte`: the Range source row and the range words.** The row now matches both the old wording and the new ("reached by"), and says what was found; a `wcvp.distribution` of `ambiguous` is said as not taken, not "WCVP lists no native region". (Kew holding the name with no range already reads right: "WCVP lists no native region for this name.")
```diff
--- a/src/routes/species/[slug]/+page.svelte	2026-10-11 17:59:43.504767363 +0000
+++ b/src/routes/species/[slug]/+page.svelte	2026-10-11 17:59:43.626659867 +0000
@@ -283,6 +283,8 @@
     const st = d.upstream['wcvp.distribution']?.status;
     if (st === 'none') return 'No published distribution for this name.';
     if (st === 'refused' || st === 'error' || !st) return `Not checked: the distribution source ${notAnswered(st)} when this page was built.`;
+    // Kew holds no entry under this name and its older names lead to more than one: nothing taken (round sixty-nine; triage-68 M2, M8).
+    if (st === 'ambiguous') return `Not taken: ${d.upstream['wcvp.distribution']?.detail ?? 'Kew holds no entry under this name, and its older names lead to more than one entry'}.`;
     if (d.distribution.ambiguous) return `WCVP holds more than one name spelt this way (${d.distribution.ambiguous}); no native region is read from it.`;
     return d.distribution.introduced.length || d.distribution.extinct?.length ? 'WCVP lists no region where it is native; the regions it does list are named here.' : 'WCVP lists no native region for this name.';
   });
@@ -580,7 +582,7 @@
     <div class:wide={longRange}><b>Native</b>{#if d.distribution.native.length}{d.distribution.native.map((r) => unitName(r.name)).join(', ')}{#if d.distribution.verified === false}<span class="small muted"> · stated native by a national checklist, not by WCVP: unverified</span>{/if}{:else if d.distribution.reported?.length}<span class="muted">Not verified.</span><span class="small muted"> Reported present (native status not stated): {d.distribution.reported.map((r) => r.name).join(', ')}</span>{:else}{distWords}{/if}{#if d.distribution.introduced.length}<span class="small muted"> · introduced: {d.distribution.introduced.map((r) => r.name).join(', ')}</span>{/if}</div>
     {#if d.centroid}<div class:wide={longRange}><b>Map marker</b>{d.centroid.lat}, {d.centroid.lon}<span class="small muted">{' · '}in the densest population, {d.centroid.n} records ({Math.round(d.centroid.share * 100)}% of those in range)</span></div>{/if}
     <!-- A range Kew files under another of the species' names says which (round sixty-eight). -->
-    {#if d.distribution.native.length && /under the name /.test(d.distribution.source)}<div class="wide"><b>Range source</b>{d.distribution.source}<span class="small muted"> · Kew holds no entry under this page's name; the range is its entry for that name, the one the species' older names lead to</span></div>{/if}
+    {#if d.distribution.native.length && /under the name |, reached by /.test(d.distribution.source)}<div class="wide"><b>Range source</b>{d.distribution.source}<span class="small muted"> · Kew holds no entry under this page's name; the range is the one Kew entry the species' older names lead to, reached by the older name named here, whose author agrees with Kew's</span></div>{/if}
     {#if d.distribution.extinct?.length}<div><b>Extinct in</b>{d.distribution.extinct.map((r) => r.name).join(', ')}<span class="small muted"> · recorded as extinct by WCVP: history, not habitat; no records are tested against these regions</span></div>{/if}
     {#if d.distribution.kew?.lifeform || d.distribution.kew?.climate}<div class="wide"><b>Kew's description</b>{[d.distribution.kew.lifeform, d.distribution.kew.climate].filter(Boolean).map((t) => `“${t}”`).join(' · ')}<span class="small muted">{' · '}quoted from WCVP, RBG Kew (CC BY 4.0); not derived here</span></div>{/if}
     {#if d.distribution.ambiguous}<div class="wide"><b>Name not resolved</b>{d.distribution.ambiguous}<span class="small muted"> · WCVP lists this name more than once and authorship did not decide, so no range is attached and nothing is derived from records</span></div>{/if}
```

**(4) P, `src/lib/ui/Provenance.svelte` (unowned; used by the species page): the tone and the footer for the new status.**
```diff
--- a/src/lib/ui/Provenance.svelte	2026-10-11 17:59:43.540009748 +0000
+++ b/src/lib/ui/Provenance.svelte	2026-10-11 17:59:43.626835513 +0000
@@ -7,7 +7,8 @@
   // plain words with its id beside it, and the climate's reason read as its source did (round sixty-two; the grower
   // review's 2, the words review's 12).
   const detail = (src: string, d: string | undefined) => (src === 'climate' ? climateDetail(d, dossier.upstream) : d);
-  const tone = (s: string) => (s === 'ok' ? 'ok' : s === 'none' ? '' : s === 'skipped' ? '' : 'warn');
+  // Two answers where one is taken is a settled answer, not a failure: no warning tone (round sixty-nine; triage-68 M8).
+  const tone = (s: string) => (s === 'ok' ? 'ok' : s === 'none' || s === 'skipped' || s === 'ambiguous' ? '' : 'warn');
 </script>
 
 <details class="prov">
@@ -18,7 +19,7 @@
     {/each}
   </div>
   <!-- Not "this build", which reads as the app's version: the build of this page (round fifty-eight; the accessibility review). -->
-  <p class="faint small">Every source is recorded as having answered, reported nothing, refused, failed, or not been asked, and, for a source asked when this page was built, when: the figures are as the source held them that day; a row carried from an earlier build of the page names that build instead. Only “nothing to report” is ever shown as an absence. {#if dossier.occurrences.datasets.length}Records came from {dossier.occurrences.datasets.length} datasets via GBIF.org; each carries its own licence.{/if}</p>
+  <p class="faint small">Every source is recorded as having answered, reported nothing, refused, failed, not been asked, or answered twice where one answer is taken (“not taken: two items answered”), and, for a source asked when this page was built, when: the figures are as the source held them that day; a row carried from an earlier build of the page names that build instead. Only “nothing to report” is ever shown as an absence. {#if dossier.occurrences.datasets.length}Records came from {dossier.occurrences.datasets.length} datasets via GBIF.org; each carries its own licence.{/if}</p>
 </details>
 
 <style>
```

**(5) K's needs for my files, re-expressed against my versions** (K's own patches are against the base and will not apply over mine). Apply with K's `photo-kind.ts` and `photo-credit.ts` and the `pd` tag.
```diff
--- a/src/lib/dossier/build.ts	2026-10-11 18:00:40.193395948 +0000
+++ b/src/lib/dossier/build.ts	2026-10-11 18:00:40.245357468 +0000
@@ -100,7 +100,7 @@
 export function photosFromMedia(rows: OccMedia[]): Photo[] {
   // A photograph under CC BY or CC BY-SA without an author cannot be credited as its licence requires, so it is not
   // published; CC0 asks for no name (round sixteen, 3).
-  return rows.filter((im) => im.creator || im.rightsHolder || im.licence === 'cc0').slice(0, 24).map((im) => {
+  return rows.filter((im) => im.creator || im.rightsHolder || im.licence === 'cc0' || im.licence === 'pd').slice(0, 24).map((im) => {
     const inat = /^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/original\.(\w+)$/.exec(im.url);
     const thumb = inat ? im.url.replace(/original\.(\w+)$/, 'medium.$1') : gbifThumb(im.id.split(':')[0], im.url);
     return { src: 'gbif', id: im.id, url: im.url, thumb, licence: im.licence as Photo['licence'], attribution: `${im.creator || im.rightsHolder || 'author not stated'}, ${licenceLabel(im.licence as Photo['licence'])}, ${inat ? 'iNaturalist via GBIF' : 'via GBIF'}`, page: im.page };
@@ -481,7 +481,8 @@
   if (skip('commons')) skipped('commons');
   else if (!o.quick && photos.length < 12) {
     const cat = x.status === 'ok' && x.data.commonsCategory ? x.data.commonsCategory : scientific;
-    const c = await commons.commonsPhotos(f, cat, 12);
+    // The species' own and older names, by which a file named as another species is left out (triage-68 K1).
+    const c = await commons.commonsPhotos(f, cat, 12, { scientific, synonyms: syn.status === 'ok' ? syn.data : [] });
     mark('commons', c);
     if (c.status === 'ok') photos.push(...c.data);
   }
```
```diff
--- a/scripts/build-dossiers.ts	2026-10-11 18:00:40.205395949 +0000
+++ b/scripts/build-dossiers.ts	2026-10-11 18:00:40.246176052 +0000
@@ -71,6 +71,8 @@
 import { buildDossier, NETWORK_EXTRAS, photosFromMedia, mergeGbifPhotos, type SkippableSource } from '../src/lib/dossier/build';
 import { mendGbifThumb, mendCommonsThumb } from '../src/lib/dossier/md5';
 import { heroOf } from '../src/lib/dossier/dedupe';
+import { shownPhotos } from '../src/lib/dossier/photo-kind';
+import { uncreditedPhoto } from '../src/lib/dossier/photo-credit';
 import { englishNames, generaOf, olderNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
 import * as gbif from '../src/lib/dossier/sources/gbif';
 import { literature } from '../src/lib/dossier/sources/openalex';
@@ -162,14 +164,8 @@
   };
 }
 
-/**
- * The photographs a page shows, as the index leads and counts them: the hook for the read-time rules of the photographs'
- * kind and credit (round sixty-nine; triage-68 K1, K2, owner K), which replace this identity.
- */
-const shownPhotos = <P,>(photos: P[]): P[] => photos;
-
 type IndexEntry = { key: number; slug: string; name: string; family?: string; common?: string; commons?: string[]; origin: string[]; thumb?: string; credit?: string; photos: number; open: number; climate: string; near?: number[]; syn?: string[]; older?: string[]; changed?: number };
-type Dossierish = { key: number; slug: string; name: { scientific: string; family?: string; status?: string; vernacular: VernacularName[]; synonyms?: string[] }; distribution: { native: Array<{ name: string }> }; photos: Array<{ id: string; url: string; thumb: string; width?: number; captive?: boolean; attribution: string; licence?: string }>; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; nOutsideRange?: number }; climate: { status: string; months?: Array<{ tmax: number; tmin: number; precipMm: number }> }; changed?: Changed };
+type Dossierish = { key: number; slug: string; name: { scientific: string; family?: string; status?: string; vernacular: VernacularName[]; synonyms?: string[] }; distribution: { native: Array<{ name: string }> }; photos: Array<{ src?: string; id: string; url: string; thumb: string; width?: number; captive?: boolean; attribution: string; licence?: string }>; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; nOutsideRange?: number }; climate: { status: string; months?: Array<{ tmax: number; tmin: number; precipMm: number }> }; changed?: Changed };
 /**
  * Each species' English vernacular names, kept from its dossier while the index is made: the common name is chosen by
  * `englishNames`'s rule, which sets back a name naming another genus of the corpus, and the corpus's genera are known
@@ -192,7 +188,9 @@
   });
 }
 function indexEntry(d: Dossierish): IndexEntry & { status?: string } {
-  const shown = shownPhotos(d.photos);
+  // The photographs a page shows, by the Worker's rule: a Commons file that is not a photograph of the species, or whose
+  // licence or author is not read, neither leads a tile nor is counted (round sixty-nine; triage-68 K1-K3, K5).
+  const shown = shownPhotos(d.photos, { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [] });
   const hero = heroOf(shown);
   vernOf.set(d.key, d.name.vernacular.filter((v) => v.lang === 'eng'));
   // Older names: six shown, the rest of species rank searched (`olderNamesOf`; round sixty-seven, N1).
@@ -480,8 +478,12 @@
  * credited "unknown, CC BY, via GBIF" by the build's fallback). They are removed from every dossier on disk, with no
  * upstream call; the build no longer produces them.
  */
-/** A photograph published under a licence that requires an author and naming none: the hook for K2's rule (round sixty-nine; owner K). */
-const uncredited = (p: { licence: string; attribution: string }) => p.licence !== 'cc0' && /^(unknown|Wikimedia Commons|iNaturalist user|no author stated|author not stated),/.test(p.attribution);
+/**
+ * A photograph published under a licence that requires an author and naming none, by the read's own rule
+ * (`uncreditedPhoto`): the build's fallback words, and Commons' "Own work", "See above", "Unknown author", a bare "(talk)"
+ * or an address, under CC BY or CC BY-SA (round sixty-nine; triage-68 K2).
+ */
+const uncredited = uncreditedPhoto;
 function pruneUncredited(): void {
   const dir = `${outDir}/s/v${DOSSIER_V}`;
   const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
@@ -489,7 +491,7 @@
   let touched = 0, dropped = 0, reworded = 0, reopened = 0;
   for (const f of files) {
     const path = `${dir}/${f}`;
-    let d: { photos: Array<{ licence: string; attribution: string }>; upstream?: Up };
+    let d: { photos: Array<{ src?: string; licence: string; attribution: string }>; upstream?: Up };
     try {
       d = JSON.parse(readFileSync(path, 'utf8')) as typeof d;
     } catch {
```

**(6) P, sentences for `/about/how`.**
- Replace "A name Kew holds no entry for is looked up under the species' older names (…); a range found so is taken only when those names lead to exactly one accepted Kew entry, and the page names the entry it came under." with: "Names are compared without the hybrid sign, so GBIF's Lantana strigocamara is Kew's Lantana × strigocamara. A name Kew holds no entry for at all is looked up under the species' older names (Kew files GBIF's Bisnaga glaucescens as Ferocactus glaucescens, and spells Aeonium tabulaeforme tabuliforme); a name Kew holds with no native range is Kew's answer, and is not looked up further. An older name counts only where its author is the author of Kew's entry for it, and a synonym GBIF marks pro parte is not used. A range found so is taken only when the older names lead to exactly one accepted Kew entry, with a range or without, at species rank; the page names that entry and the older name that reached it ("Kew's entry Erythrina afra Thunb., reached by Chirocalyx pubescens Walp."), and older names that lead to more than one entry are said as not taken."
- After "…and the answer is taken only when it is one item or one taxon." add: "From iNaturalist a taxon is taken only when its own name is the species' name or one of those older names, and never one this reference holds as another species; its name search is limited to plants. GBIF's synonyms are read to the end of the list; a list cut short, refused or failed is no answer for these older names, and the page says they were not asked."
- Replace "…from the item that carries the species' GBIF key, or, when no item does, the one whose label is the name exactly." with: "…from the item that carries the species' GBIF key, or, when no item does, the one item whose label is the name exactly and which carries the species' GBIF key or that of an older name with the same type, or, carrying no GBIF key, gives the name as its taxon name. Every iNaturalist taxon id, from Wikidata or kept from the previous build, is checked with iNaturalist; an id iNaturalist has made inactive is followed to the one current taxon it names, and otherwise the name is searched. When Wikidata does not answer, the identifiers of the build that last read them are kept, for at most 90 days, and the page names that build."
- After the summary's sentence add: "An article Wikipedia reaches through a redirect is quoted only when its title is the Wikidata item's own English sitelink, the species' name or one of its older names; otherwise the page records that Wikipedia redirects the one title to the other, and quotes nothing."
- In the photographs sentence: the order is now "…then from iNaturalist directly…, then, for a species the download does not hold and iNaturalist gave fewer than six, from GBIF's records under an open licence (CC0 or CC BY), and last from Wikimedia Commons, whose files are not counted towards the six"; and add "a GBIF photograph whose own media item states no licence is not published under its record's".
- After "…is \"not asked\"." add: "A source that answered with two records where the rule takes one (two Wikidata items, two iNaturalist taxa, two Kew entries reached by older names) is said as \"not taken: two items answered\", and nothing is taken from it."
- Requests and hosts: the corpus build now also asks `api.inaturalist.org/v1/taxa/<ids>` (the id check) and `api.gbif.org/v1/occurrence/<key>` (the licence pass, corpus only), and the summaries pass asks Wikidata's `wbgetentities` for sitelinks. All are hosts the page already names; if the page lists the build's requests by path, add these.

## 3. Not done, and why
- S-A4 (same-type names when GBIF records no basionym) and S-A1's fifth hole (`loadWcvp` loads older genera only from a previous build's synonyms, `scripts/bulk-load.ts`, not mine): not in the triage. For the 17 rebuilt with `--keys` the previous dossiers exist, so their older genera are loaded.
- `--fill summaries` is not wholly offline (see M3): one Wikidata request per fifty titles the file cannot settle; `--offline` leaves those unchecked instead of dropping them.
- `--list-synonym-cap` is `--list-rebuild`, which also lists the older-name ranges.
- The script's `carry()` of iNaturalist photographs on a refusal still copies the previous `ids.inat` back; the next build checks it again.
- The photograph id's counter across records (S-B6 "Also") is unchanged: changing ids would change every stored GBIF photograph's identity.

## 4. The corpus step (M and K), in order, in PowerShell from the checkout
After `npm run deploy`.

0. Back up: zip `static\s\v2` (DEPLOY.md section 6) and `Copy-Item static\s\v2\index.json $env:TEMP\index-before-r69.json`.
1. `npm run dossier -- --fill gbif-licence`
   - Prints "Reading each stored GBIF photograph's own licence from its occurrence record…", a running count, then "  N dossiers read: K photographs carry an open licence of their own, D did not and were dropped (E dossiers left with none: run --fill gbif-open); B read by an earlier run, passed by." and the index lines (`index: 8947 species`, the corpus line).
   - If GBIF refuses: "GBIF did not answer (…); run --fill gbif-licence again: it picks up where it stopped." Run it again.
   - If it printed "E dossiers left with none": `npm run dossier -- --fill gbif-open` ("… dossiers had no photograph: … were given … from GBIF's openly licensed records …").
2. K: `npm run dossier -- --prune-uncredited` (K's rule), then `npm run dossier -- --index`.
3. `npm run dossier -- --fill inat-ids`
   - Prints "Checking every stored iNaturalist taxon id with iNaturalist…", then "  N ids checked: F inactive ids followed to their current taxon, D inactive with no single current taxon dropped (asked by name next). Now run --fill inat." and the index lines. R46 found 6 of 83 inactive; expect a few per cent.
   - Then `npm run dossier -- --fill inat`: "N dossiers on disk; T without iNaturalist photographs…", then "T filled. Every dossier has been asked for its photographs." (or "iNaturalist refused … run this again tomorrow"; it resumes).
4. `npm run dossier -- --fill summaries`
   - Prints "  K summaries are this species' article (C confirmed as the Wikidata item's sitelink); D dropped:" and one line per dropped summary, for example "    Weingartia pulchra: Wikipedia redirects Weingartia pulchra to Weingartia canigueralii" and "    Kopsia fruticosa: Wikipedia redirects Kopsia fruticosa to Kopsia"; "U not checked, Wikidata not answering (run again)" when Wikidata lagged. Then the index lines. Read the list before going on.
5. `npm run dossier -- --list-rebuild`, then `npm run dossier -- --keys rebuild-keys.txt --grid climate --bulk bulk`
   - The first prints "  N species to rebuild → rebuild-keys.txt; …": the 17 ranges taken under older names plus every dossier with exactly 50 synonyms.
   - The rebuild needs `--bulk bulk`: the older-name rule is the bulk path's. Each species prints its usual "✓ … photos, … climate …" line; "Wikidata lagged for ten species in a row: not waiting for it again until it answers…" if a lag spell starts.
   - It ends with "N species lost what the build before had (…) → drops.txt" and exit code 1 when anything was lost. Expected there: Lantana strigocamara's "native range lost (… regions before)" (Kew holds it with no native range), possibly a few of the other 16, and "identifier … lost" or "turned none" lines where a stricter rule now refuses. Read every line before step 6.
6. `npm run dossier -- --index`, then `npx tsx scripts/audit-common-names.ts static\s\v2\index.json --before $env:TEMP\index-before-r69.json --sample 40` (it now also fails on photographs halved and a range lost: expect the dossiers steps 1 and 2 thinned, and Lantana strigocamara), then the two-line upload of DEPLOY.md section 5, and the live check.

## 5. Runs
- My tests and the existing tests of my files (15 files, including `r61g-import-attack`): 217 passed.
- Whole unit suite (`npx vitest run`): 278 files, 2400 passed, 1 skipped, 0 failed. (An earlier run under heavy load had one timing failure, `r61g-import-attack` "10,000 rows parse in well under a second", 1.8 s; it passes alone and in the final run.)
- `npx svelte-check --threshold error`: 1007 files, 0 errors, 0 warnings.
- No Playwright (P's).
