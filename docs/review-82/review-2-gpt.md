<!-- Copied for round eighty-two's record; the reviewer's links to files on the owner's computer are replaced by their file names (M). -->
Cultifolio: independent review

Reviewed 23 October 2026. Source commit: [`8f2b495dc10b1b87699c5bc94c1395bde9779633`](https://github.com/zomethingje-eng/cultifolio/tree/8f2b495dc10b1b87699c5bc94c1395bde9779633). The live deployment was not proven to use that commit. Observations below come from live browser use, downloaded data, source inspection or explicitly identified local tests. Interpretations and inferred causes are marked.

This is a substantial but **incomplete** execution of the requested audit. In particular, all-fields external validation of 110 species, every journey on every device, and valid live performance measurements were not completed. The limitations below are part of the verdict, not fine print.

## 1. Verdict

**Works with faults.** The central collection workflow worked: adding 30 plants, assigning a space, watering, recording cuttings, generating three labels, changing settings, clearing browser storage and restoring a backup. All 640 recorded changes survived that round trip exactly. The reference is less reliable in how it presents evidence: authorless photograph credits breach the supplied rule on 46 of 110 sampled dossiers; hybrid names lose their × in catalogue/search data; comparison presents two rainfall totals without explaining the distinction beside them; and “Most grown” overstates a genus-level observation filter. These are demonstrated faults, not evidence that all botanical data are wrong. No collection data-loss defect or sync cryptographic break was established.

## 2. Scorecard

Scores are judgments about the examined evidence, not certification.

| Area | Score | Reason |
|---|---:|---|
| User experience | 7/10 | Recording and recovery work; propagation wording and statistical labels mislead. |
| Appearance | 7/10 | Consistent typography, cards and dark settings; dense explanation and mobile onboarding need work. |
| Mobile | 7/10, provisional | Narrow layouts fit; one important action misses the requested 44 px target. Physical mobile behavior remains unproven. |
| Data quality | 5/10, provisional | Names largely reconcile, but authorless credits are widespread; habitat correctness was only partly validated. |
| Code quality | 8/10, provisional | Recovery safeguards and extensive passing tests; source/live consistency remains a weakness. |
| Performance | **Not scored** | Request pacing and blocked images invalidate live timings. A numerical score would be invented. |
| Accessibility | 7/10, provisional | Automated scans and limited keyboard checks passed; no comprehensive screen-reader audit. |
| Honesty of claims | 5/10 | Explicit unchecked states are useful, but the author promise and hybrid-display claim fail in live output. |

## 3. Ranked issues

### 1. Blocker under the supplied rubric: photographs without the promised author

**Reproduce:** Inspect photograph credits on the [homepage](https://cultifolio.com/) or [Echeveria affinis](https://cultifolio.com/species/echeveria-affinis). The captured homepage gives Ficus rubiginosa merely “Photo: CC0”; affinis includes “no rights reserved” as a credit. [Euphorbia jolkinii's dossier](https://cultifolio.com/api/dossier/k80373) contains 42 such records among 70 photos.

**Observed scope:** 512/4,024 photo records lacked a named author in their credit, affecting 46/110 dossiers: 12.7% of records and 41.8% of sampled species. The full index also contained 5,461 CC0/public-domain-only credits. These are attribution-field checks, not independent verification of every photographer's identity. [Sample ledger](<the reviewer\'s capture species-audit.csv>), [homepage](<the reviewer\'s capture phone-home.png>).

**Expected:** The supplied rule requires an author even for CC0/public-domain photos. This is a breach of that stronger promise, not a finding of copyright infringement: CC0 can legally dispense with attribution.

**Code:** [Tile credits](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/ui/ref/head.ts#L159) explicitly reduce “no rights reserved” to the licence. [Commons normalization](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/dossier/photo-credit.ts#L124) permits absent authors under CC0/PD. The source already contains [an iNaturalist CC0 credit improvement](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/dossier/sources/inat.ts#L164), applied at [line 264](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/dossier/sources/inat.ts#L264). This is partly a live-data/publication fault with a partial source fix, not an allegation that no fix exists.

**Fix:** Backfill verifiable author credits; withhold records whose authors cannot be established under the promise. Validate both published dossiers and thumbnail indexes. Do not substitute observer for photographer without source support.

### 2. Major: hybrid notation disappears from catalogue/search names

**Reproduce:** Search Mentha × piperita. At both widths the result reads “Mentha piperita.” [Captured search](<the reviewer\'s capture search-Mentha___piperita.png>).

**Observed scope:** All 485 index entries identified by the repository's hybrid list lacked × in stored names. Ten separately fetched hybrid pages had correct signed headings, including Mentha × dalmatica, Nuphar × rubrodisca and × Butyagrus nabonnandii. The live [method page](https://cultifolio.com/about/how) promises the sign in headings, titles, tiles and search. The fault is inconsistency across surfaces, not universally broken headings.

**Code:** [Search rendering](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/routes/+page.svelte#L795) uses the index name. Formatting support exists in [hybrids.ts](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/core/hybrids.ts#L40). **Inferred cause:** live derived data and the corrected name-production path are out of step; deployment history was not established.

**Expected/fix:** Publish the same accepted display name everywhere. Regenerate derived products and add a release test comparing published index/search/page names for known hybrids; consider a read-time display safeguard.

### 3. Major presentation fault: “Most grown” overstates its measure

**Reproduce:** Select “Most grown” in the [catalogue](https://cultifolio.com/) and compare its explanation with the implementation.

**Observed:** The code ranks genera by iNaturalist captive/cultivated observations, selects the smallest set cumulatively holding half of counted observations, and includes species belonging to those genera. It does not rank species by the number of people growing them. The method is disclosed in explanatory text; the prominent label overstates it. [Rule](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/ui/ref/most-grown-rule.ts#L1), [threshold](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/ui/ref/most-grown-rule.ts#L17), [species filtering](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/routes/+page.svelte#L594).

**Interpretation:** A grower can reasonably read the label as species popularity. Rarely cultivated members of heavily photographed genera can qualify. Observation effort is not a cultivation census; this is a measure limitation, not proof of wrong source counts.

**Expected/fix:** Use “Frequently observed cultivated genera,” or a shorter label with an explanation beside the control. If species popularity is intended, use and describe a species-level measure.

### 4. Minor: rooted cuttings are announced as seedlings

**Reproduce:** Create six Echeveria affinis cuttings, record four struck, then open Today.

**Observed:** The batch correctly shows four of six struck; Today says “First seedlings up in S2026-001 … 4 counted.” [Batch](<the reviewer\'s capture batch-counted.txt>), [Today](<the reviewer\'s capture phone-today-dark.txt>). The count was retained; this is not observed data loss.

**Code/fix:** [Firsts.svelte:24](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/ui/grow/Firsts.svelte#L24) always uses “First seedlings up” for this event. Use the batch method to produce “First cuttings struck” or suitable neutral wording, and test a non-seed count through to Today.

### 5. Minor: comparison makes two rainfall totals look contradictory

**Reproduce:** [Compare agavoides and affinis](https://cultifolio.com/compare?s=echeveria-agavoides,echeveria-affinis). Read “Rain a year,” then the lower “Rain” section.

**Observed:** Agavoides has 573 mm above and 582 mm below; affinis 1,394 mm above and 1,361 mm below. [Captured text](<the reviewer\'s capture phone-compare.txt>).

These are different aggregations: median annual total across cells versus the total of the monthly median curve. They need not agree. **No arithmetic error was established.** The expanded species explanation distinguishes them, but compact comparison wording leaves the reader to reconcile them.

**Code/fix:** [Comparison line 249](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/routes/compare/+page.svelte#L249) chooses `r.short` over the fuller [sheet explanation](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/core/sheet.ts#L398). Label both quantities where they appear or use one consistently, with the other disclosed in details.

### 6. Minor: the example-collection action is about 20 px tall

**Reproduce:** On the first visit at 390 px, inspect “See the example collection” in the welcome paragraph.

**Observed:** Its button box measured approximately 171 × 19.6 px, below the requested 44 px criterion. [Measurement](<the reviewer\'s capture phone-home-metrics.json>). This is not automatically a WCAG violation: inline controls have relevant exceptions.

**Code/fix:** [Homepage line 1072](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/routes/+page.svelte#L1072) gives it inline display, zero padding and `min-height: 0`. Make this onboarding action a separate 44 px-high control. The settings checkboxes should not be judged from their 20 px input boxes alone: their labels enlarge the interactive area.

### 7. Minor design weakness: the first phone screen under-explains the reference

**Reproduce:** Compare first visits at [desktop](<the reviewer\'s capture desktop-home.png>) and [phone](<the reviewer\'s capture phone-home.png>) widths.

**Observed:** The phone shows species/climate counts and a tracker welcome, while the fuller reference pitch is hidden. The small “SPECIES” navigation label remains; the page is not wholly unidentified.

**Interpretation:** The balance makes the two-part product harder to grasp on first contact. **Code/fix:** [Homepage line 1043](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/routes/+page.svelte#L1043) hides the pitch while the welcome is present on phones. Keep one short sentence covering both purposes, with deeper provenance available progressively. This is a design judgment, not a broken flow.

## 4. Desktop versus phone

Main comparison: 1440 px and 390 px, Chromium. The initial desktop capture used a desktop context; most later width comparisons resized a touch/mobile context. These establish responsive layout, not complete equivalence to physical desktop/mobile devices. The twelve journeys were **not** independently repeated at every size and in every engine.

| Journey | Desktop result | Phone result | Difference; appropriate? |
|---|---|---|---|
| 1. First visit/catalogue by genus | Catalogue and introduction rendered. | Catalogue usable; welcome changes emphasis. | Density change appropriate; issue 7 affects introduction. |
| 2. Echeveria search/species | 259 matches; more-results action. | Same count; species opened. | Appropriate stacking; no observed search failure. |
| 3. Common and older names | Six query results checked at width. | Six queries executed. Snake plant and Sansevieria trifasciata each return Dracaena trifasciata; hens and chicks gives nine choices. | Ambiguity remains visible, appropriately. “echevria” gets similar-spelling notice. Hybrid notation fault affects both. |
| 4. Not checked page | Separate full desktop journey not completed. | Echeveria alpina explains missing accepted GBIF key and consequent unperformed checks. | No phone-only failure observed; desktop completion unproven. |
| 5. Compare two | Figures for both displayed. | Two-species comparison fits without page overflow. | Appropriate compression; rainfall wording issue on both. |
| 6. First plant from species | Form and saved detail inspected. | Followed species → Add → Save; identifier assigned. | Appropriate stacking. Not two independent first-plant runs. |
| 7. Space and water | Water/move executed after restore. | Created greenhouse, moved plant, recorded water. | Both paths worked; records visible. |
| 8. Propagation | Form inspected. | Created six cuttings, counted four. | Layout appropriate; Today wording fault independent of width. Full desktop batch creation not repeated. |
| 9. Three labels/print | Three selected; print-media rendering/PDF generated. | Selection interface inspected. | Dedicated print output appropriate. Physical/mobile OS print preview not tested. |
| 10. Backup/clear/restore | Downloaded backup; repeat import says nothing changes. | Cleared isolated storage; empty collection; imported; 30 plants returned. | One cross-width round trip, not two. All 640 changes identical. |
| 11. Settings/Today/frost | Settings/dark Today inspected. | Changed units, photo preference, theme/site; forecast and frost watch displayed. | No observed lost controls. Forecast accuracy not independently validated. |
| 12. Example/leave | Entered example: 12 plants and one batch. | Inspected and left example; own 30 plants returned. | Isolation worked in this cross-width run; independent replay on each width not done. |

Additional homepage views: 320×700, 430×932, 844×390, 768×1024 and 1024×768. Add/settings/compare were measured at widths 320, 375, 430, 844, 768 and 1024: all 18 states had document width equal to viewport width. [Measurements](<the reviewer\'s capture responsive-extra.json>). This proves no whole-page horizontal overflow in those states, not full usability in every orientation.

Phone captures show bottom navigation. Physical notch/safe areas, virtual-keyboard occlusion and Back in every flow were not established. No physical iPad was used.

## 5. Data audit

**110 dossiers, ten in each of eleven strata.** The few-records stratum uses low openly licensed record counts, not verified biological rarity. This is a diagnostic, unweighted sample; its rates must not be extrapolated as corpus prevalence. Common-name searches and prominent Echeveria pages supplemented it, but no representative sample of the commonest cultivated plants was established. [All names and results](<the reviewer\'s capture species-audit.csv>), [sample identifiers](<the reviewer\'s capture sample.json>).

| Group | Sample | Climate available | No photos | Species with authorless credits | Photo records / authorless |
|---|---:|---:|---:|---:|---:|
| Cacti | 10 | 5 | 1 | 3 | 226 / 21 |
| Other succulents | 10 | 6 | 2 | 2 | 408 / 52 |
| Bulbs | 10 | 10 | 1 | 7 | 546 / 56 |
| Orchids | 10 | 7 | 1 | 4 | 184 / 35 |
| Carnivorous plants | 10 | 6 | 2 | 2 | 264 / 40 |
| Trees | 10 | 9 | 0 | 8 | 658 / 102 |
| Crops/herbs | 10 | 10 | 0 | 8 | 749 / 99 |
| Ferns | 10 | 8 | 2 | 5 | 364 / 47 |
| Aquatics | 10 | 9 | 0 | 6 | 547 / 58 |
| Few records | 10 | 0 | 8 | 0 | 12 / 0 |
| Hybrids | 10 | 5 | 4 | 1 | 66 / 2 |
| **Total** | **110** | **75** | **21** | **46** | **4,024 / 512** |

**Independent reconciliation and internal checks:**

- GBIF canonical names matched in **104/104** checked dossiers. Six authorship strings differed; examined differences include citation abbreviations and documented Kew/GBIF citation differences. They are not six established wrong names. Six dossiers were outside this GBIF denominator.
- 104 GBIF vernacular lists were fetched; **57 dossiers had English names** to compare. Every stored English string in those 57 appeared in current GBIF data, ignoring case. This proves source fidelity, not specificity: upstream names can themselves be ambiguous or genus-wide.
- **94 iNaturalist taxon IDs** were checked: 89 literal name matches, five differing by hybrid notation. This checks linked taxa, not photo identifications.
- **0/4,024** stored licence tags were outside the allowed set. Original image-page licences were not all independently verified. **512/4,024** records lacked a named author in the credit.
- **900 monthly records in 75 dossiers** had no negative rainfall or temperature-ordering error (minimum ≤ mean ≤ maximum). Other climate statuses were 30 “none,” five “pending”; these are not automatically defects.
- NASA daily series were independently fetched for **Mammillaria prolifera, Asplenium nesii and Drosera sessilifolia**. All three stored cold-floor percentiles, absolute minima and frost-night counts reproduced after the stated lapse adjustment, using 16,071 valid days each. [Source-check results](<the reviewer\'s capture power-checks.json>).

Worst attribution examples: Euphorbia jolkinii 42/70, Pinus aristata 40/89, Drosera sessilifolia 32/90 and Betula populifolia 32/85 photo records.

Asplenium nesii's **−33.1 °C cold floor and −44.2 °C absolute minimum** deserved scrutiny. Its NASA calculation reproduced; therefore I cannot call it a numerical error. Whether the selected location/elevation represents the species' habitat remains unproven. Correct arithmetic at an unsuitable point would still mislead, but that is an open question, not a finding here.

**Unfinished source validation:** POWO returned HTTP 403 on attempted pages. After 27 logged attempts, that approach was stopped; no replacement distribution dataset was obtained. There is consequently no defensible “wrong ranges out of 110” rate. Independent Wikidata checks, CHELSA habitat-cell suitability and visual identification of photographs were not completed. The requested all-fields, all-species external audit is incomplete.

## 6. Code, performance and accessibility

### Persistence and recovery

The [database layer](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/db/vault.ts#L231) uses staging and a pending-replacement marker; [promotion/replacement](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/db/vault.ts#L270) supports recovery. The [log model](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/core/log.ts#L1) retains changes and resolves materialized fields. [Backup construction](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/backup/backup.ts#L118) and [reading](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/backup/backup.ts#L233) preserve the log and validate archive contents before mutation.

Observed recovery test: 30 plants, one space, one propagation batch, 33 events, one taxon, 640 changes, **no personal photos**. After clearing origin storage and restoring, the exported change array and device settings were exactly equal. A second import preview reported no changes. [Original archive](<the reviewer\'s capture audit-original-backup.zip>), [restored archive](<the reviewer\'s capture audit-restored-backup.zip>). This supports rule 6 for this case, not quota failure, interrupted restoration, missing photo blobs or live sync.

### Encryption and server visibility

Source generates 30 random symbols from a 30-character alphabet, approximately 147 bits, using rejection sampling. HKDF-SHA-256 separates encryption/authentication/naming keys. AES-256-GCM uses fresh 12-byte IVs and associated data binding vault, object kind and name. [Generation/derivation](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/sync/crypto.ts#L26), [encryption](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/sync/crypto.ts#L99).

HKDF here is not an unstretched human password: its input is generated high-entropy key material. Server storage includes an authentication-token hash and ciphertext. Encryption does not conceal object sizes or request timing. This was source review and local mock testing, not security certification. **No live vault was created/joined; Start sync was never pressed.**

### Architecture and verification

[Worker hooks](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/hooks.server.ts#L1) implement public-page caching and request protections. The [dossier API](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/routes/api/dossier/[key]/+server.ts#L8) distinguishes missing entries from retrieval failure. The [manifest](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/lib/dossier/manifest.ts#L1) separates hashed products from dossier delivery. [build-dossiers.ts](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/scripts/build-dossiers.ts#L1) and [corpus-step.mjs](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/scripts/corpus-step.mjs#L1) include publication/resume controls. The hybrid mismatch illustrates why source tests do not establish consistency of all published products.

**Maintenance judgment:** large collection, sync and species-view modules make recovery and UI changes harder to reason about. That is not proof of a race or dead code. No new exploitable server defect, reproducible sync race or dead-code bug was established. The known dependency advisories are not new findings.

Executed checks:

- Production build completed; type/Svelte checking reported zero errors and zero warnings.
- Unit suite: **4,578 passed, 11 skipped; 506 files passed, one skipped**.
- Selected offline end-to-end tests: **15 passed across Chromium, Firefox and WebKit**, using the repository's local fixture server.

[Build](<the reviewer\'s capture build-results.txt>), [check](<the reviewer\'s capture check-results.txt>), [unit](<the reviewer\'s capture unit-results-clean.txt>), [offline tests](<the reviewer\'s capture offline-e2e.txt>). Passing tests do not independently validate botanical truth.

### Performance and offline

The service worker defines collection shells, selectively precaches build assets/fonts, retains a previous cache generation, separates corpus caching and does not automatically force a waiting worker over an open app. [Cache/install](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/service-worker.ts#L19), [activation](https://github.com/zomethingje-eng/cultifolio/blob/8f2b495dc10b1b87699c5bc94c1395bde9779633/src/service-worker.ts#L67). Local tests exercised offline behavior in three engines. Live browsing disabled service workers to control request pacing, so live installation/offline recovery remain unproven.

No valid live LCP/INP/CLS or normal page-weight measurements were obtained. The proxy serialized requests and later blocked external images; timings would measure the harness. The 37.4 MB complete index fetched for audit is **not evidence that visitors download 37.4 MB**. The 110 saved dossier response bodies total about 4.37 MB; that is not page weight either. The supplied four-second slow-phone issues were neither independently confirmed nor refuted.

### Accessibility and appearance

Axe scans of catalogue, species, My plants, settings and compare at 390 and 1440 px found **zero reported A/AA violations in ten states**. Several contrast checks were incomplete, not passes. [Raw results](<the reviewer\'s capture accessibility.json>). Tab reached “Skip to content” with a visible 2 px outline; Escape closed the menu. Full keyboard completion and screen-reader output were not checked.

**Visual judgment:** scientific-name typography and recurring cards/controls are consistent; dark settings retain a readable hierarchy. Dense numerical explanations often outweigh practical interpretation; issue 5 is a concrete instance. Maps were seen on species pages, but polygon accuracy and touch exploration were not audited. Later screenshots can contain deliberately failed images: those are not proof of production image outages.

## 7. Honesty of the six rules

| Rule | Supported conclusion |
|---|---|
| Every figure sourced; no authored species prose | Examined figures name sources; code produces explanatory templates. Three NASA calculations reproduced. Corpus-wide provenance and absence of manual content not proven. |
| Not checked never becomes none | Echeveria alpina explains unperformed checks and reasons. No contrary case established; not a corpus-wide certification. |
| No ambiguous matching | Tested common-name ambiguity remains visible; 104 GBIF names reconcile. Every matching branch/homonym not revalidated. |
| Allowed photos, always with author | **Fails the supplied author requirement**, issue 1. Stored licence tags passed the metadata check. |
| About agrees with code/data | **Fails for hybrid search/catalogue notation**, issue 2. Examined climate/sync explanations otherwise have implementation support within the stated limits. |
| Log is the record; nothing lost | Exact 640-change recovery passed. No data-loss bug established; photos/fault injection/live sync not covered by that proof. |

The [method](https://cultifolio.com/about/how) and [formats](https://cultifolio.com/about/formats) pages are detailed, but detail does not cure a live-data contradiction. Their long paragraphs also make practical limitations harder to find—an editorial judgment, not a correctness finding.

## 8. Ten changes first

1. **Enforce author credits at publication.** Repair or suppress unverifiable credits and rebuild thumbnails; removes the broadest demonstrated rule breach.
2. **Publish consistent hybrid names.** Check index/search/page agreement before release; restores notation and the About promise.
3. **Rename/explain “Most grown.”** Put the genus-level proxy beside the control; reduces misleading interpretation.
4. **Make propagation summaries method-aware.** Today should describe the event actually recorded.
5. **Distinguish rainfall aggregates.** Removes apparent numerical contradiction without changing valid data.
6. **Put habitat-versus-survival caveats beside cold-floor figures.** Source already contains qualifications; surface them at comparison/label decision points. This addresses an inferred misuse risk, not an observed injury or proven wrong number.
7. **Shorten the two-purpose introduction and enlarge the example action.** Improves comprehension and meets the requested touch target.
8. **Audit published corpus products as a release gate.** Check required attribution, source-status invariants and name consistency; source-only tests missed live discrepancies.
9. **Run a valid performance benchmark.** Normal requests/images, cold/warm caches, fixed collections and low-end hardware; establishes usable LCP/INP/CLS and byte budgets.
10. **Finish physical mobile and failure-recovery testing.** iOS Home Screen, keyboard occlusion, safe areas, photo backups, interrupted restores and multiple tabs are consequential unproven paths. This is a risk-based priority, not a claim they fail.

## 9. Preserve what works

- Explicit reasons for unperformed checks, as on Echeveria alpina.
- Ambiguous common names presented as choices, not silently resolved.
- Comparison's refusal to manufacture a suitability verdict from habitat figures.
- Log-based recovery, no-op import preview, and example/real collection isolation demonstrated here.
- Key separation, staging recovery and existing offline tests. Presentation fixes should preserve these protections.

## 10. Not checked, with why

- **Every journey in every size/orientation:** only the table and extra states above were run.
- **Safari/iOS:** WebKit local tests ran, but that is not Safari on a physical iPhone. OS printing, storage eviction, Home Screen installation, keyboard and safe areas remain unproven.
- **Back in every flow, 200% browser zoom, reduced motion, screen readers:** not comprehensively executed. Width reflow does not substitute for these tests.
- **Live Core Web Vitals/page weight:** harness intervention invalidates timing; no values invented.
- **All ranges, original image licences and photo identities:** POWO refused access; metadata checks do not replace these validations.
- **CHELSA habitat selections and Wikidata names:** not independently recomputed/queried. Three NASA checks do not validate 110 climates.
- **Live sync/failure injection:** sync prohibited. Recovery used an isolated, photo-free collection; no user's existing collection was touched.
- **Known work:** pending photo/keyless-name coverage was encountered and is not new. Future upload completion, supplied Kew-number/126-box counts and advisory remediation were not independently confirmed.
- **Image-error robustness:** blocked-image testing produced `TypeError: n is not a function` from a live image handler. A later direct error-event replay did not reproduce it. Retained as an investigation lead, not a ranked reproducible finding. [Error log](<the reviewer\'s capture page-errors.txt>).

Request accounting: logs contain **422 cultifolio.com requests**, plus a small number of setup/manual fetches, comfortably below 1,500. There were **242 explicit third-party source checks**: 208 GBIF, 27 POWO, four batched iNaturalist and three NASA, plus ordinary browser image/source loads. Requests were paced; later external images were blocked. No sync vault was created and no remote user data was submitted. [API log](<the reviewer\'s capture requests.jsonl>), [browser log](<the reviewer\'s capture browser-requests.jsonl>), [source log](<the reviewer\'s capture source-requests.jsonl>).

## Selected screenshots

First phone visit; note tracker emphasis and the CC0-only credit.

![First visit](<the reviewer\'s capture phone-home.png>)

Phone comparison.

![Comparison](<the reviewer\'s capture phone-compare.png>)

Thirty-plant collection at desktop width.

![Thirty plants](<the reviewer\'s capture desktop-30-plants.png>)

Print-media rendering of three labels; not a physical-printer test.