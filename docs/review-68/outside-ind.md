Independent review of rounds sixty-seven and sixty-eight

Reviewed commit **1609c19**, fetched from origin, in a separate checkout on Windows, Node **24.20.0**. Live checks used cultifolio.com and corpus **333fa1914cd6c00a**: 8,947 species, 32 buckets, manifest present. Review date: 11 October 2026. I read REVIEW-TRIAGE-66 and REVIEW-ROUND-67 before testing. No production data was changed and no fixes were deployed.

The default browser run is green. The source pipeline still publishes misleading gallery material and drops some older names before search can index them. There are also reproducible draft-transfer, import-key, example-loading and seed-lease defects. The optional engines are not green. Findings below distinguish live evidence, controlled boundaries, and source-only risks; a passing fixture is not evidence that an upstream identity is correct.

## Findings: visitor and species reference

### 1. Confirmed — Commons category membership becomes an unqualified species photograph

**Where:** `src/lib/dossier/sources/wikimedia.ts:183–225`; `src/lib/dossier/commons-fill.ts:31–37`. Live species dossiers and their referenced Commons files.

**Actual:** The builder checks extension, licence and credit, then appends category files as species photos without checking the depicted taxon or classifying non-photographic material. Live Uebelmannia buiningii has **Uebelmannia pectinifera Donald.jpg** as its first photograph and index lead. This is a conflicting taxon identification in the source filename, not an independent botanical determination. Heliamphora minor has three explicitly named minor × heterodoxa hybrid photographs; the Commons descriptions also identify hybrids, but Cultifolio supplies no hybrid warning. Nepenthes campanulata, N. boschiana and H. minor galleries contain distribution maps. Drosera elongata's sole lead is a herbarium isotype sheet, without a specimen classification.

**Expected:** A species gallery must not silently imply that a hybrid or a differently identified plant is that species. Maps and specimens can be useful, but need their own source-labelled roles and must not be counted as ordinary photographs.

**Checked:** A deterministic sample of 40 of the 619 Commons-led species produced 187 Commons files. I inspected source metadata for suspect files and an eight-image contact sheet. At least eight files in five sampled species need correction: three hybrids, three maps, one specimen and one conflicting species name. That is 8/187 in this deliberately Commons-led sample, **not** an estimated error rate for the whole corpus. Crassula socialis's “unknown plant” filename alone does not prove a wrong identification, and I do not count it as one.

**Smallest fix:** Immediately remove the demonstrable conflicting/hybrid files from unqualified species galleries. Separate map and specimen assets. For further category fills, check structured depicts/taxon evidence where available and fail closed when identity is unresolved; category membership and a plausible filename are insufficient. Preserve the unresolved source material as explicitly unchecked if desired. No generated imagery is needed.

Evidence: `review68-sample-results.json`, `review68-sample-files.json`, `review68-photo-source-results.json`, `review68-photo-contact.png`.

### 2. Confirmed — older names beyond GBIF's first 50 are never available to the index

**Where:** `src/lib/dossier/sources/gbif.ts:63–68`; also the older-name fallback request in `src/lib/dossier/bulk.ts:465`.

**Actual:** `/species/<key>/synonyms?limit=50` is accepted as a complete result without following pagination. The new postings correctly include species-rank older names held by a dossier, but the dossier does not hold all the upstream rows. Live GBIF accepted key **3084719**, Portulaca oleracea, returned 65 synonym rows when requested with limit 1000. Thirteen later species-rank rows were absent from the live index. Live `/api/search?shape=2&n=5&q=Portulaca%20retusa` and the corresponding P. terraereginae request both returned 200 with `{"hits":[]}`. The upstream rows point to that accepted species.

**Expected:** “Every older name” cannot describe a silently truncated source reading. A source limit must either be paged through or shown as incomplete.

**Checked:** Compared live GBIF rows with live index/search responses. Aloe vera, Opuntia ficus-indica, Sedum album and Crassula ovata did not exceed this boundary in the same check. P. poellnitziana is not a missing-search example: it already resolves through a stored variety.

**Smallest fix:** Page synonyms until endOfRecords, with a bounded, explicitly incomplete result on failure. Use that same complete reading for source fallbacks, rebuild affected dossiers and products, then publish the manifest last. This does not reopen the fixed six-name posting limit; it is an earlier loss in the pipeline.

Evidence: `review68-upstream-results.json`, `review68-missing-search.json`.

### 3. Confirmed — licence normalization asserts CC0 where the source says public domain, and accepts custom Attribution as CC BY

**Where:** `src/lib/dossier/sources/wikimedia.ts:200`; `src/lib/core/licence.ts:23`; `src/lib/ui/ref/head.ts:116,135,144–160`.

**Actual:** Commons “Public domain”/PD labels are rewritten to `cc0`. Eight sampled live files have that discrepancy, including Nepenthes campanulata.jpg and Mammillaria matudae.jpg. The saved attribution can still say Public domain while the tile says CC0. Separately, a controlled Commons response with LicenseShortName `Attribution`, an author and no CC licence is accepted as `by` by the generic `/attribution/` rule. Commons' machine-readable metadata permits custom attribution grants; that word is not proof of CC BY.

**Expected:** Preserve the actual licence/grant. Public-domain status and a CC0 waiver are different source claims. Only the expressly permitted CC licences should pass the project's current allowlist.

**Checked:** Live source metadata against persisted photo metadata, plus a synthetic response through the actual commonsPhotos path. I did not locate a published custom-Attribution file; that part is a confirmed acceptance-boundary defect, not a demonstrated live licence violation. Ordinary NC/ND and missing-author guards worked.

**Smallest fix:** Use a Commons-specific strict allowlist with recognized licence URLs; retain source licence name/version. If public-domain material is intended to be permitted, state and encode it separately rather than inventing a CC0 waiver. Reject custom Attribution under the existing policy.

Reference: [Commons machine-readable data](https://commons.wikimedia.org/wiki/Commons:Machine-readable_data). Evidence: `review68-independent.test.ts` and the photo-source results.

### 4. Confirmed — “Keep it as my own” loses the rest of the plant draft

**Where:** `src/routes/plants/new/+page.svelte:235`; `src/lib/ui/grow/ExampleAddLine.svelte:19`.

**Actual:** The transfer address preserves species and its key, not the complete form. On a phone-profile Chromium example add form, I opened More, entered `Visitor note to retain`, chose Keep it as my own and accepted leaving. The own-collection add form retained the species, cleared the note, and was outside the example. Other draft fields are likewise not serialized by this callback; I reproduced the note loss, not every possible field or a photograph.

**Expected:** The promised transfer keeps what was typed, or explicitly identifies what will be discarded before leaving.

**Smallest fix:** Transfer a structured, one-use draft through private tab/device storage, restoring all editable fields and pending place information. Do not put private notes, purchase details or photo data in the address.

Evidence: `review68-browser.mjs`, `review68-browser-results.json`.

## Findings: collection and concurrency

### 5. Confirmed — two distinct ISO acquisition dates receive the same import identity

**Where:** `src/lib/import/rows.ts:47–51`; `src/lib/import/plan.ts:114–120`.

**Actual:** dateKey sorts the month/day components even for unambiguous parsed ISO dates. Two separate unnumbered imports of Copiapoa cinerea from the same nursery, acquired **2024-05-01** and **2024-01-05**, parse to different dates but produce identical import keys. Once the first key is known, markImported marks the second done, excluding a distinct plant.

**Expected:** An ambiguous spreadsheet reading may require a decision; two already unambiguous dates must remain distinct. This is not LibreOffice's presentation of short dates or 12.50, which the brief defers.

**Checked:** Actual row parsing and import planning in an independent unit reproduction.

**Smallest fix:** Key a successfully parsed date by its exact ISO value. Keep ambiguity handling separate and version any legacy-key compatibility so it cannot collapse genuinely different dates.

Evidence: `tests/unit/review68-independent.test.ts`.

### 6. Confirmed — an expired example seed lease permits a second seed before the first commits

**Where:** `src/lib/ui/grow/demo-seed.ts:123,134–156`; `src/lib/db/vault.ts:478–485`.

**Actual:** In the fallback without Web Locks, a seeder checks empty state and builds its records under a 60-second claim. Pause it before the append, advance time 60,001 ms, allow a second seeder to claim and commit, then resume the first. Both append their independently allocated plants: **24 accession records**. The seed marker is atomic with each append, but ownership/emptiness is not rechecked in that append transaction.

**Expected:** A suspended tab that has lost its claim cannot commit another seed. Atomic marking closes the former partial-write defect but does not fence this stale claimant.

**Checked:** Actual seedDemo module, real vault implementation with fake IndexedDB, and a controlled collection commit boundary. This is not a physical old-Safari/background-tab measurement; the current tested engines expose Web Locks.

**Smallest fix:** Check claim ownership and the unseeded condition in the same transaction that appends the seed and marker. Abort a stale claimant; clear claims only with an owner comparison.

Evidence: `tests/unit/review68-seed-lease.test.ts`, `review68-seed-lease.log`.

### 7. Confirmed — explicit example entry can misclassify a grower who has only places

**Where:** `src/lib/ui/grow/example.svelte.ts:128–137`; `src/lib/ui/grow/DemoBar.svelte:50`.

**Actual:** If example loading has not settled, noteOwn falls back to the plants-only hint. A grower with an existing place but no plants can therefore get “Add your first plant” instead of the own-collection separation message. The banner captures the wrong result. In three standalone WebKit trials, one wrote OWN_NOTE `0` and showed the wrong banner; two wrote `1`. The full suite had the same retry-only pass. A module reproduction with recordCount 1, ready true and example.settled false also records the wrong result.

**Expected:** The whole folded collection, including places and a site, decides ownership. A still-loading state is unknown, not empty.

**Smallest fix:** Wait for the settled ownership check before explicit entry, or accept positive record/site evidence immediately while never using a plants-only hint to prove absence. Show a brief opening state while that decision is pending.

Evidence: `review68-own-banner-results.json`, `tests/unit/review68-example-race.test.ts`.

## Findings: source guards and server

### 8. Confirmed — the Wikidata fallback still accepts ambiguous labels and missing identity proof

**Where:** `src/lib/dossier/sources/wikimedia.ts:77,124`.

**Actual:** The name fallback takes the first exact label match. The GBIF check only runs when the selected entity actually supplies P846. A controlled response with two distinct exact-label entities and no P846 on the chosen Q1 returns Q1 successfully despite a supplied GBIF key.

**Expected:** An exact spelling is not unambiguous identity evidence; missing P846 cannot satisfy a positive identifier comparison.

**Checked:** Actual fetch/selection path with controlled upstream responses. I did not establish a wrong live Wikidata item from this gap. The new P566 exclusion and same-type guards were separately tested and mutation-sensitive.

**Smallest fix:** Collect candidate entities, validate relevant identifier claims against the accepted/same-type identifiers, and refuse ambiguous or unproved fallback identity. Do not silently take the first search result.

Evidence: `tests/unit/review68-independent.test.ts`.

### 9. Confirmed — WCVP fallback discards the authorship that resolved an ambiguous name

**Where:** `src/lib/dossier/bulk.ts:159–175`.

**Actual:** viaOlderNames resolves an older name with its authorship, then stores only the accepted name and looks its distributions up again without authorship. With two accepted homonyms authored Alpha and Beta, distributions(name, Beta) succeeds but viaOlderNames with that same authored name returns null.

**Expected:** Retain the resolved source row/id, rather than make a second, less specific identity decision. Failing closed prevents a wrong range here, but wrongly loses a checked range.

**Checked:** Actual WcvpIndex with a small synthetic homonym dataset; no affected live species was established.

**Smallest fix:** Carry the resolved WCVP id into the distribution lookup, or at minimum keep accepted authorship throughout.

Evidence: `tests/unit/review68-independent.test.ts`.

### 10. Confirmed — the per-vault listing budget does not reserve outstanding walks

**Where:** `src/lib/server/counters.ts:381–394`; `src/lib/server/sync.ts:555–583`.

**Actual:** listAsk reads the charged total; listed charges only after R2 finishes. With 1,199 pages charged, 30 sequential permission RPCs for outstanding walks all succeed. Charging their 50 pages each yields **2,699**, against a 1,200-page allowance. This does not require concurrent execution inside a Durable Object. Request windows bound an address, but neither reserve this vault's allowance nor make the stated page budget true.

**Expected:** Outstanding work consumes/reserves the allowance. A modest single-walk overshoot is different from all outstanding requests sharing the same remaining allowance.

**Checked:** Actual Counters methods with controlled Durable Object storage. The actual listBatches source has this ask/walk/charge ordering; no production load attack was performed.

**Smallest fix:** Atomically reserve a bounded walk allowance before issuing R2 requests, or charge each page through an atomic permit. Return unused reservations; keep cursor/error behavior explicit if the budget stops a walk midway.

Evidence: `tests/unit/review68-list-budget.test.ts` — passed.

## Findings: reload and optional-engine coverage

### 11. Suspected — the deferred takeover reload can outrun a form's navigation decision

**Where:** `src/routes/+layout.svelte:157–159`; add-form guards in `src/routes/plants/new/+page.svelte:103–110`.

**Actual in source:** Once reloadOnNext is set, the layout cancels navigation and immediately assigns location.href from its beforeNavigate callback. That can begin a hard unload before another callback's confirmation/Cancel decision, and it does not newly await an in-flight write at that boundary.

**Checked:** A controlled phone Chromium takeover signal with the actual form and a held name-check request produced both the custom “Leave this page?” prompt and native beforeunload. Dismissing both kept the draft. This confirms conflicting guards; **I did not reproduce lost data, a pending IndexedDB write being aborted, or a real two-build WebKit deployment**. Therefore the data-loss finding remains suspected.

**Expected / smallest fix:** Decide navigation once, then hard-reload only after the route leave is approved and outstanding collection work is safe. Avoid assigning location.href inside a callback that precedes other leave guards. Add a real pending-write/Cancel reproduction, not only pure takeover-state tests.

Evidence: `review68-takeover.mjs`, `review68-takeover-results.json`.

### 12. Confirmed — the Firefox second-example-tab test fails before it tests closure

**Where:** `tests/e2e/r67v-example.spec.ts:56–60`.

**Actual:** The test assumes its popup inherits the example session flag. In the tested Firefox phone-profile example sequence, the parent held the flag while the child had empty session storage and no html[data-demo]. The full run, retry, and isolated no-retry run all stopped at that setup assertion; they never exercised the advertised closure behavior. A simple desktop popup did inherit the flag, so this is not a claim that Firefox never copies session storage.

**Expected / smallest fix:** Establish the second example tab explicitly through the supported UI or a deliberate pre-load fixture, assert that setup, then test closure and unsaved work. Keep a separate test for actual popup inheritance if the product depends on it.

Evidence: `review68-firefox-example-popup-results.json`, `review68-engine-reruns.log`.

### 13. Confirmed — delayed-font layout stability fails in Firefox on the fixture home

**Where:** `src/lib/ui/PageHead.svelte:41–44`; home heading/count layout; `tests/e2e/r67h-engines.spec.ts:93`.

**Actual:** At 390 px, delayed fonts move the fixture home paragraph from y=124 to 99 and back, and the lower heading by 8–25 px. Full run, retry, isolated rerun and standalone measurements reproduced this. The same standalone checks on the live 8,947-species home at 390 and 375 px found no such movement.

**Expected / smallest fix:** Reserve the heading/count wrap height at this boundary, or give the count a stable narrow-screen row, then retain the actual Firefox measurement. This is a confirmed fixture/small-corpus defect, not demonstrated live-home shift.

Evidence: `review68-font-results.json`.

## What was checked and found sound

These are checks of the decisions, not a second retelling of the author's account. “Suite/source” below means exercised by the existing suites and inspected in code; it does not imply a physical iPhone or the owner's complete local corpus was tested.

| Triage decision | Result of this review |
|---|---|
| V1 | Leaving before ordinary own-add actions works. Draft transfer remains incomplete: finding 4. |
| V2 | Unsaved example work has leave guards in Chromium. Firefox closure coverage is incomplete: finding 12. |
| V3 | PAGE_IN_DEMO fixes scope at page load across vault, backup, sync and persistence paths. Closed example DBs refuse reopening. No reproduced own/example write leakage. |
| V4 | Automatic emptiness uses records/site and loading state. Explicit entry's banner still races: finding 7. |
| V5 | Seed marker and changes commit together; no example outbox rows. Stale fallback lease remains: finding 6. |
| V6 | Leaving marker/open-lock restrictions checked in source and suite. |
| V7 | Example exports/backup state are suppressed; private collection operations use fixed scope. |
| V8 | No real location is invented as an example frost site. |
| V9 | Phone introduction identifies the intended growers; phone suite passed. |
| V10 | Returning-visitor line comes from server; no default Chromium shift failure. Firefox fixture fonts are separate: finding 13. |
| R1 | Failed replacement preserves staging and uses a guarded, retriable copy/open path. Known long replacement time is not a new finding. |
| R2 | Large positive correction is withheld until confirmed; small/negative corrections retain their policy. Forget clears the offset; next-reading scheduling is conditional on configured sync. No new elapsed-time lapse was found. |
| R3 | Mapped-field keys, removed-record keys, numbered matches and integer bounds are covered. Date identity is still wrong: finding 5. |
| R4 | Dropped rows remain dropped across passes: suite/source. |
| R5 | Partly added rows retain import pattern: suite/source. |
| R6 | Legacy file parks are read as parks: unit suite. |
| R7 | Death Undo uses one commit: suite/source. |
| R8 | Issued-number frontier and stale sibling-note filtering: suite/source. |
| R9 | Stamp wall bounds: unit suite. |
| R10 | Malformed changes are counted without rewriting the raw log; malformed loads do not save a deceptive snapshot. Sync quarantines a dropped batch as a whole. Failed database states are exposed. |
| R11 | Move/Edit busy guards: default and optional-engine tests did not identify a new double-press write. |
| R12 | Pending places are scoped by picker/form; import settles at Check names; errors are displayed. |
| R13 | Tail uses a bounded range read, claim advances frontier, import/restore snapshot paths present. One-row-per-commit deferral remains reasonable pending real-device measurement. |
| R14 | Spaced price parsing is covered; no new price defect found. |
| S1 | Unreadable photo pointers fail with 503 rather than false absence; upload/removal wait semantics covered. |
| S2 | **This checkout's tracked wrangler.jsonc has observability.enabled=false.** The brief's statement that it is on is no longer true here. Production Cloudflare settings were not available. Anonymous fault counters are used. |
| S3 | Pointer revival/removal use conditional fencing, including a fresh nonce. |
| S4 | Generation listing is paginated with bounded sweep work; incomplete walks retain their mark. |
| S5 | Network creation limits and operator pressure counters: unit/route checks. No production attack performed. |
| S6 | New budget exists but is not a reservation: finding 10. |
| S7 | Build parameters propagate to adapter-cached routes; mismatched builds are no-store. Live check compared live builds consistently. No real rollover was forced. |
| S8 | 429/403 refusal wording and Retry-After propagation are covered. My refused image HEAD requests are explicitly not checked below. |
| S9 | Network/day limit wording and UTC retry are covered. Local 1-byte opaque batches were accepted; zero-byte batch was rejected with 400 “a batch is empty”. Small-batch admission is intentional, not evidence the server can decrypt contents. |
| S10 | New photo identifiers are random rather than content-derived: source/unit checks. |
| N1 | Stored older names past six reach postings; upstream pagination still fails: finding 2. |
| N2 | Common-name query words must occur in one name; family whole-word guard passes and its mutation fails. |
| N3 | Headline spelling rules checked by fixtures; no arbitrary generated species prose found in the inspected paths. |
| N4 | Offline builder skips fetchers, preserves source photos/range data, and exposes key-scoped audit/rebuild paths. I did not independently rebuild all 164 owner-targeted dossiers. |
| N5 | Pooling punctuation/accents/counting fixtures pass. |
| N6 | Inspected the stated capital/small-word decision, including deliberate declined behavior; no new contradiction established. |
| N7 | Bracket-aware splitting and source-backed bare words pass fixtures. |
| N8 | Whole/headline preference and distance ordering pass fixtures. |
| N9 | Suspicious sourced spellings are audited instead of silently rewritten. |
| N10 | Inspected deliberate sitemap decision; no new case requiring its reversal. |
| N11 | Median-year qualification present in inspected display/share rules. |
| N12 | Ceropegia scope is stated in /about/how. |
| N13 | Licence remains visible at enlarged text in suite; licence truth is separate: finding 3. |
| P1 | Shared monthly persistence gate, mark-before-prompt and huge-future timestamp handling inspected and tested. One WebKit case remains unresolved; see runs below. |
| P2 | Dirty/in-flight takeover logic and kept-cache reads have coverage; next-navigation boundary risk remains finding 11. |
| P3 | Private hover preloading is disabled, including tray paths. |
| P4 | Read about pages against storage/request/source paths and seam tests. New licence/search discrepancies are findings 2–3; no unreported blanket endorsement of every source claim. |
| P5 | Spacing/punctuation/genus refusal fixtures pass. |
| P6 | Menu/chips/headings/short-screen forms and waiting explanations pass default phone checks. No physical greenhouse/iPhone inspection performed. |
| P7 | Failed-image placeholders/credit behavior covered. |
| P8 | Previous name request is discarded after Add another: suite/source. |
| P9 | Label selections restore on back/forward: suite/source. |
| P10 | Name-check line is reserved in add form: suite/source. |
| H1 | Strict Chromium request-budget cases passed, including seed and Water. |
| H2 | Proxy-backed WebKit offline tests ran in the full optional suite. |
| H3 | Portable engine tests ran; Firefox fonts and second-tab setup failures remain. |
| H4 | Additional requested builder mutations are caught; counts below. |
| H5 | Single-click disclosure checks ran in default suite. |
| H6 | Bundle gate uses module paths: source/suite. |
| H7 | Smoke injection helper use inspected. |
| H8 | Fold behavior guard covers the named parked/file functions: source/unit suite. |
| H9 | Server specs use docAddress: source/suite. |
| H10 | Plain configuration has failOnFlakyTests=true. Optional suite correctly failed despite one retry pass. |

## Round sixty-eight claims and limits

The four requested temporary mutations were caught: raw URL extension checking **5 failed / 7 passed**; removing P566 exclusion **1 failed / 10 passed**; making sameTypeNames accept every row **3 failed / 8 passed**; prefix matching family names **1 failed / 8 passed**. All mutations were restored; tracked source diff is clean. These tests prove sensitivity to those changes, not correct identity for every upstream entity.

The live Bisnaga example retained Q310510 and iNaturalist 274273 with older-name detail and Mexico range. I did not establish a wrong live homotypic/P566 fallback; finding 8 tests an unclosed boundary. Authored WCVP fallback needs finding 9's fix. The owner-only complete WCVP archive and all rebuilt dossiers were unavailable for a corpus-wide comparison.

The Commons fill is visible in live dossiers. Comparing the older saved index with the current index found **zero previously nonempty leads newly replaced by a Commons lead**, supporting the author's claim about this particular fill. A synthetic cultivated-only lead can be displaced by appended Commons material, but that documented future/full-build edge is not presented here as a current-corpus defect. The fill's exclusion of species already having six photos is deliberate. Extension tests cover PNG/WebP/query-bearing names and GIF rejection; actual image identity and licence are separate defects above.

Image weight checking hit an upstream refusal: of 80 HEAD requests for sampled tile/lead images, **77 returned 429 and are not checked**. Their 1,990-byte error responses are not photo weights. Successful responses included Echeveria skinneri at 55,012/158,793 bytes and Uebelmannia buiningii's lead at 376,678 bytes. The independent live homepage check loaded 72 images totalling about 892 kB, none above 300 KiB. This does not establish a corpus-wide weight guarantee.

The whole index remains resident on the Worker, deliberately outside this round. The listing maximum was tested with a synthetic 50-page/1,000-object-per-page storage shape and refuses oversized whole walks with 503. I did not load-test Cloudflare production or infer isolate memory from the browser suites. No push/location service, account, analytics or third-party script was added by this review. The physical iPhone database-cost and real two-build WebKit takeover checks remain unperformed rather than silently declared passed.

## Runs and reproducibility

Dependencies were installed and the application built. Default Playwright built and launched its own Wrangler server on review port 4192; optional engines reused an independently started Wrangler server on 4193 with E2E_OFFLINE. These fixture servers do not contain the 8,947-species live corpus. Playwright WebKit/Firefox binaries were installed/available. All commands used system Node 24.20.0 on Windows.

| Run | Result |
|---|---|
| `npx vitest run` before adding review tests | **273 files passed, 1 skipped; 2,332 tests passed, 8 skipped; 2,340 total**, 68.08 s. Seven real-corpus tests were skipped without the owner's corpus, explaining the difference from the brief's 2,339/1. |
| `npx playwright test --workers 2` (Chromium and Chromium phone, strict) | **410 passed, 5 skipped**, 8.2 minutes. No failures or retry-only passes. |
| `npx playwright test --project webkit --project phone-webkit --project firefox --workers 2` | **743 passed, 12 skipped, 3 failed, 1 flaky**, 759 total, 30.2 minutes. Strict result failed. |
| Three failing optional cases, one worker, retries 0 | **3 passed, 3 failed** across WebKit/Firefox, same three failures, 56 seconds. |
| `node scripts/live-check.mjs` | **18/18 passed**. Build older than its freshness window meant it checked consistency among live responses, not equality to this local build. |
| Independent unit probes | **10 passed** across seven source/import/list-shape cases, one ownership race, one seed lease, one listing-budget case. |

The three optional failures were WebKit `r67p-pages.spec.ts:21` (persistence ask expected 1, got 0), Firefox `r67h-engines.spec.ts:93` (late fonts), and Firefox `r67v-example.spec.ts:52` (second-tab setup). The flaky case was WebKit `r67v-example.spec.ts:162`, the places-only banner in finding 7.

The persistence failure reproduced in the full run and no-retry rerun. Additional instrumented/standalone runs did ask once and retained the monthly gate; an instrumented final run passed. I could not isolate why the failing WebKit run never incremented its wrapper. **This is an unresolved regression-test failure, not proof that real WebKit growers are universally never asked.** It must remain red/under investigation rather than be counted as a completed engine gate.

Evidence and reproduction scripts are retained in the checkout: `review68-unit.log`, `review68-chromium.log`, `review68-engines.log`, `review68-engine-reruns.log`, `review68-live-check.log`, `review68-mutation-results.json`, the individual JSON files cited above, and `tests/unit/review68-*.test.ts`. No shipping source change is required to read these reproductions.

The strongest part of the app is its explicit source and privacy contract, with extensive tests around difficult collection behavior. A hurried commenter is likely to encounter the misleading Commons gallery or lose a note while keeping an example plant. If only one change can happen before launch, stop publishing unresolved Commons category material as identified species photographs.
