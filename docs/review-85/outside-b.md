Cultifolio: repeat independent review

**Not quite ready under the literal launch claims in the brief.** Round 84 materially improves the phone experience, names, maps and collection recovery, and I found no new reproduced loss of collection data or privacy breach. Correct the live cache setting and the remaining attribution drift, and finish the border-record policy at region as well as country level before calling the reference fully checked.

Reviewed 31 October 2026. Source: **08094dbcd34eea3a53647dc8a754a8e5a26357ac**. Live corpus: **8520c2875b2699ba**, manifest present, 256 buckets, 48,357 pages. The checkout serves fixtures; all species-data conclusions below use saved production responses. The Worker binary's exact commit is not independently attested by `/api/corpus`.

Inputs: [repository at the reviewed commit](https://github.com/zomethingje-eng/cultifolio/tree/08094dbcd34eea3a53647dc8a754a8e5a26357ac), [live site](https://cultifolio.com/), [round 84 review and repairs](https://github.com/zomethingje-eng/cultifolio/blob/08094db/docs/REVIEW-ROUND-84.md), [round 82](https://github.com/zomethingje-eng/cultifolio/blob/08094db/docs/REVIEW-ROUND-82.md), [deployment record](https://github.com/zomethingje-eng/cultifolio/blob/08094db/docs/DEPLOY.md), [devlog](https://github.com/zomethingje-eng/cultifolio/blob/08094db/docs/DEVLOG.md), [How](https://cultifolio.com/about/how), [Formats](https://cultifolio.com/about/formats), and the user's updated pasted brief.

**Correction to my previous review:** withdraw its finding 6, which said Cloudflare's NEL endpoint was undisclosed. The previously saved `about--how.html` already names `a.nel.cloudflare.com`, the headers, the failure URLs and the week-long reporting period. That was my reading error, not a new repair. The four-hour index-cache finding, in contrast, remains reproducible.

## Scorecard

Scores are judgments about this evidence, not certification of all 48,357 pages. Performance and expert validation of habitat climates remain qualified below.

| Area | /10 | Reason and movement |
|---|---:|---|
| User experience | 8 | The picker, repeated-entry flow and useful name aliases improve on the earlier 7/7. Short-phone hierarchy and the known San Pedro query remain. |
| Appearance | 8 | Filled desktop figure cards, actual region outlines and a clearer phone summary improve on 7/7. Some small explanatory text and crowded introductions still need editing. |
| Mobile | 8 | Up from my 7 and the second outside 7, matching the first outside 8. The chart and coarse-pointer controls work; the first-screen promise still fails on short/narrow screens. |
| Data quality | 7, provisional | Up from my 5: substantially stronger name/range checks and 3,030 matched photo records. Border admissions, two current credit differences and incomplete independent habitat validation prevent a higher score. |
| Code quality | 8 | Recovery, sync and the picker have meaningful behaviour tests. Unchanged from the previous 8; full-corpus and deployment contracts still need independent checks. |
| Performance | 6, provisional | The collection shift is repaired, but the rich-page phone replay still has a 5.33 s LCP and 473 ms blocking proxy. Live physical-engine CWVs remain unmeasured; no sound basis to raise the earlier 6. |
| Accessibility | 8, provisional | Up from my 7: map captions are associated and narrow charts improve. Remaining undersized links and untested physical-phone/assistive-technology conditions prevent the earlier outside 9. |
| Honesty of claims | 8 | Up from my 6 and the outside 7/5: source-disagreement wording, refusal distinctions and the number-reservation repair are real. Part of the improvement is withdrawing my incorrect NEL finding. The cache claim is still false at the edge. |

## Findings, ranked in the requested order

### 1. A country-only border guard will still admit precisely located records from a non-native region in the same country — confirmed; extension of the disclosed border issue

**Where:** [Cordyline fruticosa dossier](https://cultifolio.com/api/dossier/k303171), [GBIF record 3952972839](https://www.gbif.org/occurrence/3952972839), and [tdwg-shapes.ts:164](https://github.com/zomethingje-eng/cultifolio/blob/08094db/src/lib/dossier/tdwg-shapes.ts#L164). Evidence: `geo-probe.json`, `border-case-results.txt`, `primary/border-cordyline-nsw.json`.

**What happens:** the live dossier keeps the open point **−28.230, 153.473, 2021, AU** as in range. The actual record is **−28.230027, 153.473134**, with **21 m** stated uncertainty; GBIF’s GADM interpretation explicitly says **New South Wales / Tweed**. The committed strict geometry places it in **NSW**; only Queensland is native in the page's Australian range. The normal predicate accepts it through Queensland's 0.05° buffer, even though it is on another region's land. [NSW Flora Online](https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?lvl=gn&name=Cordyline&page=nswfl) describes C. fruticosa sensu stricto as native to northern Queensland, Malesia and Pacific islands.

The proposed country check sees AU on both sides and retains this record. Another precise example is **Ixora coccinea**, **17.948027, 102.621207**, country LA, uncertainty **9 m**, GBIF **5109186270**: the live dossier admits its rounded point through Thailand. That one would be addressed by the country guard. These are additional cases, not a rediscovery of the disclosed Aloe case.

**Expected:** precise evidence that a record is in a different, non-native TDWG region should not be silently treated as native just because it is near a simplified boundary. Keep genuine coastline uncertainty distinct from a known different country/state.

**Reproduction/reasoning:** `geo-probe.mjs` loads the committed predicate twice, normally and with buffer/coast reach zero, and checks the production points. `border-cases.mjs` retrieves the exact source records. This proves the map/admission issue. It does **not** prove how much either record changes the published climate envelope; the complete contributing-cell set is not published.

**Smallest fix:** extend the queued exclusion to reliable source administrative-region evidence mapped to TDWG, retaining uncertainty-aware handling of simplified coastlines. Add the NSW/AU case beside Aloe/AE and Ixora/LA, then re-derive affected pages by the rule. Do not hand-edit these species or simply delete every near-border record. **Priority P2.**

### 2. Two Hibiscus photograph credits differ from the source's current attribution — confirmed current drift; build-time fault unproved

**Where:** [Hibiscus rosa-sinensis dossier](https://cultifolio.com/api/dossier/k2850448), photographs **480095081** and **480095850**; [their iNaturalist observation](https://www.inaturalist.org/observations/d9575432-eacd-408e-803e-95a9e323953f). Evidence: `photo-verdicts.json` and `primary/inat-v2-0.json` through the saved batch files.

**What happens:** the live record credits **Vreni Gem O. Caasi**. The current photo-specific iNaturalist response credits **Casey Clark G. Sumalinog** for both. Both remain CC BY and on the correct taxon. I cannot establish whether the source's attribution changed after the stored fill; this is not evidence the builder invented the original credit or that the licence is invalid.

**Expected:** the site's current credit should agree with the named source, with the source-check date retained. **Reproduction:** match the two photo IDs in the dossier to the same IDs in iNaturalist's v2 observation detail response with `fields=all`. **Smallest fix:** refresh these records through the normal photograph fill and check current photo attribution as well as licence during refresh. **Priority P3.**

### 3. The first-screen habitat repair still fails on short phones — confirmed

**Where:** `/species/sempervivum-tectorum`, Chromium with genuine coarse-pointer/touch emulation; [HabitatLine.svelte:41](https://github.com/zomethingje-eng/cultifolio/blob/08094db/src/lib/ui/ref/HabitatLine.svelte#L41) and the species introduction. Evidence: `phone-edge.jsonl`, `touch-320x700-semp.png`, `touch-320x568-semp.png`, `touch-375x667-semp.png`.

**What happens:** at **320×700**, the light and season rows span **y=679.8–755.5**, while the tab bar begins at **643**. Even the explanations under cold and rain extend behind the bar. At **320×568**, all four rows begin below the bar/first screen. At **375×667**, the light and season explanations extend below the bar's **610 px** top. At **390×844** all four rows fit, so the fix is real but its coverage is narrower than the brief's phone journey.

I first see a large photograph/name/action card; I still have to scroll once to read light and season on the short phones. On the desktop I see all four full figure cards. The long common-name list and the four secondary actions consume space before the compact summary. DLI also remains unexplained in the compact line: its explanation is reached through Figures and then the full card's DLI help.

**Expected:** the essential habitat reading should precede secondary actions and optional name detail at the smallest supported sizes. **Reproduction:** open the route at the three stated touch viewports at the default text size and scroll position zero; compare row rectangles with `#tabbar`. **Smallest fix:** at narrow/short sizes move the habitat summary before secondary actions, and condense optional common names/classification behind a disclosure. Add a 320×568/700 and a 375×667 first-screen assertion, not only 390×844. **Priority P2; partial survival of the previous hierarchy finding.**

### 4. New and existing explanatory links still miss the requested 44 px touch target — confirmed

**Where:** the same phone species page's **Figures ›** link, [HabitatLine.svelte:41,66](https://github.com/zomethingje-eng/cultifolio/blob/08094db/src/lib/ui/ref/HabitatLine.svelte#L41); other examples are the small DLI help control and some inline explanatory links. Evidence: `phone-edge.jsonl`, the Chromium coarse-pointer target list in `journeys.jsonl`.

**What happens:** Figures is **51.06×18.59 px**, with no enlarging pseudo-element. The sampled DLI help control is **18.66×22 px**. These differ from `.linkish` buttons and photo-credit links whose invisible hit areas were enlarged; the raw text box alone would be a false positive for those repaired controls. The desktop's 40 px mouse controls are not counted as phone defects.

**Expected:** meet the brief's explicit 44×44 px target, including the new shortcut. That is a stricter requirement than claiming every inline link violates WCAG. **Reproduction:** use `hasTouch:true, isMobile:true`, inspect rectangles and `::after`, and confirm the surrounding area is not an ancestor activation target. **Smallest fix:** give standalone shortcuts/help controls a real or expanded 44 px hit area and check that adjacent hit areas do not overlap. **Priority P2.**

### 5. The live index still says four hours, despite the five-minute contract and new detector — confirmed, previously reported

**Where:** GET `/api/index`, **2026-10-31 13:36:54 UTC**; [index route:16](https://github.com/zomethingje-eng/cultifolio/blob/08094db/src/routes/api/index/+server.ts#L16), [live-check-cache.mjs](https://github.com/zomethingje-eng/cultifolio/blob/08094db/scripts/live-check-cache.mjs), `/about/how`. Evidence: the first row of `requests.jsonl`.

**What happens:** `cache-control: public, max-age=14400`, `cf-cache-status: HIT`, `age: 271`, while the code and documentation specify 300 seconds. A reader can retain an old index far beyond the documented interval, affecting names, counts and links during a corpus change. The new source correctly recognizes this exact edge override and now checks GET; its existence does not make the observed deployment contract true.

**Expected:** the edge response must honour the route's five minutes. **Reproduction:** the saved full GET is the only index download in this review. Do not substitute a HEAD result for it. **Smallest fix:** the script already gives it: Cloudflare Browser Cache TTL → Respect Existing Headers, purge this route, and verify a browser-style GET at the edge. No application-code rollback is indicated. **Priority P2; cheap pre-launch correction.**

### 6. “San Pedro” still omits the intended reference page — confirmed, disclosed queued work

**Where:** `/api/search?shape=2&n=8&q=San%20Pedro`; `search-San_Pedro.json` and `search-Trichocereus_pachanoi.json`.

**What happens:** the query returns **Desmodium batocaulon**, **Echinopsis cuzcoensis**, and **Echinocereus websterianus**; **Echinopsis macrogona** is absent. Typing **Trichocereus pachanoi** returns macrogona first and its old address redirects correctly. A grower knowing only the common nursery name must already know an older scientific name to reach that page.

**Expected:** a supported common name should find its intended species, with ambiguity explained. **Smallest fix:** complete the queued source-backed common-name join/ranking rule; do not hard-code a one-page search exception. **Priority P2 for discovery, explicitly not a novel finding.**

## Mobile against desktop

These are differences actually observed in the inspected pages, not a claim to have enumerated every conditional surface in the application.

| Surface | Phone | Desktop | Verdict |
|---|---|---|---|
| Main navigation | Fixed bottom tabs; shorter breadcrumb | Top navigation and fuller breadcrumb | deliberate-and-right; 640×400 coverage also passes the suite |
| Species hero | Shallow image with overlaid/stacked name card | Large image beside the name card | deliberate-and-right, except the short-phone space cost in finding 3 |
| Habitat reading | Extra compact summary above the photo strip | Full cards fill the row | deliberate-and-right; short-phone first-screen coverage is a gap |
| Light help | Plain DLI in the compact reading; full-card help lower down | Help beside the full figure | gap in immediate explanation, small but measurable extra navigation |
| Section navigation | Horizontal scrolling row | Fits the row | deliberate-and-right; all sections remain reachable |
| My plants | Compact rows, sort/action disclosures | Wider controls and more context at once | deliberate-and-right; no missing collection operation established |
| Add actions | Pinned above tab bar when space is short | Normal form actions | deliberate-and-right in tested viewports; physical on-screen keyboard not run |
| Inline targets | Some still under 44 px | Mouse-size links | gap for the explicit touch requirement, finding 4 |
| Narrow landscape | Main destinations remain available | Top destinations | deliberate-and-right in the 640×400/568×320 suite cases |
| Print | Same printable records/figures | Same printable records/figures | deliberate-and-right in Chromium PDF; physical Safari printing unverified |

No operation was established as entirely unavailable on a phone. Smaller visual density is not, by itself, a missing feature.

## What works well

* **Names and discovery:** 48,357 unique IDs and slugs, 75 Huernia entries, 501 changed headings. The five sampled changed addresses and all eleven merged addresses return 302 to kept pages. Hoodia alstonii and the scientific San Pedro aliases now work. The tested one-word common-name queries and the two-letter Lithops typo improve the order.
* **The source discipline is visible:** the short summary names each figure's source, the climate section distinguishes a nightly percentile from a monthly low, and thin climates keep their figures with visible counts. “Not checked” and “not asked” remain different states. The new extremes explanation correctly calls the result disagreement between sources, not mathematical impossibility.
* **Photograph provenance:** all 3,030 sampled photos matched their source records/files; all sampled licence categories agreed. For the 2,247 direct iNaturalist photos, the current observation taxon is the site's taxon or a descendant. The two current author differences are specifically listed, rather than turning that otherwise strong result into a blanket failure.
* **Collection entry and recovery:** 30 mixed labels saved using Save and add another, with the space retained; cultivars, crosses, qualifiers and unheld names remain recordable. A quantity of 30 also saves on one initial press in Chromium and Firefox. The independent WebKit quantity script initially retried while a save was still running; that script timing is not evidence of a product fault.
* **Water, death and Undo:** one Water click and one Undo; a death via the plant menu, its Record action and Undo restores the growing state and removes the death line. The log still shows the acquisition. The sample batch sows 20, records 12 germinated and pots up 5, leaving 7 in the pot with five numbered plants and linked provenance.
* **Sync and Replace:** two isolated profiles share a photograph and later edits through one local vault. Replacing from the earlier backup turns sync off and explains that rejoining would merge the newer vault back. Deleting `meta['issued:accession']` and rebuilding still offers **2026-0003**, not the previously issued 0002: the reservation repair is real.
* **Offline:** previously read fixture species and plants open offline; adding a plant succeeds offline. This is evidence about the app and fixture cache, not proof of every production page or an iOS installed app.
* **Presentation:** coherent typography, restrained green/accent palette, more useful desktop figure cards and actual region outlines. Keep the distinction between the compact phone reading and the detailed evidence. Reduce optional introduction text before redesigning the overall visual language.

## What you checked

### Journeys and practical limits

The eight landing pages inspected were Echeveria elegans, Haworthia cooperi, Lithops lesliei, Sempervivum tectorum, Picea omorika, Monstera deliciosa, Ferocactus hamatacanthus and Abies beshanzuensis. Desktop/phone screenshots and text are saved. At 390 px the new summary is useful without scrolling; Lithops honestly lacks a usable climate, so the reader does not get invented care numbers. On the short Sempervivum screens I hesitated at the name/common-name/action block before reaching the habitat reading. DLI still requires explanation; the published climate is a habitat proxy, not an experimentally established cultivation tolerance.

The mixed collection journey used 30 labels through the form, **52 save presses**: 22 required the explicit second confirmation in a fixture environment where the external name service did not answer. That is not an honest estimate of a human's completion time or the production confirmation rate. Automated typing of supplied strings cannot measure how long a grower takes to read labels, choose a name or understand a refusal. The quantity shortcut needs one save for 30 copies, but does not substitute for that mixed-entry test.

The label journey selects all 30 plants and exports the printable sheet. Seed sowing, germination and potting were exercised separately; propagation from a plant created three offsets, with the parent and space linked. A separate rooted-cutting lifecycle was not independently completed outside the suite. Today, Settings, spaces and backup were opened after collection readiness; the first captures taken before readiness are not used to claim an empty-data defect.

Mouse automation, emulated touch, keyboard coverage in the suite, light/dark rendering, 200% root text, portrait widths **320, 360, 375, 390, 414**, landscape **812×375**, tablets **768/1024**, and desktop **1280/1920** were checked. No document-wide horizontal overflow was recorded in that matrix. This does not establish every page at every setting. **Native browser 200% zoom, a physical on-screen keyboard, iPhone Safari, Android Chrome, VoiceOver/TalkBack and physical printing were not run.** Playwright WebKit on Windows is not an iPhone, and root-font enlargement is not native zoom.

### Operations, security, tests and simplification

I found no new reproduced server plaintext disclosure, foreign-origin sync write or collection-loss case. The inspected code keeps ciphertext and derived authentication material on the server, enforces limits and validation, denies framing and objects, uses no-referrer and secure preference cookies over HTTPS. Existing adversarial-file, race, recovery and cross-engine tests are useful evidence; this is not a specialist penetration-test certificate. The five low-severity dependency advisories from installation do not justify an unrequested force upgrade, especially the acknowledged cookie/Kit compatibility decision.

The full-corpus walk is substantially stronger than the old selective repair: restricted and open records follow the same geometry pass, and the r84 provenance is present in the sampled tested pages. However, `--check-ranges` uses the same polygon assumptions as the builder and expands the test by the half-cell diagonal. Its reported zero is a consistency check, not independent evidence that the shapes or every habitat assignment are correct. The source dataset and complete restricted contributing records were not available here to replay the whole repair.

The step runner now refuses an index older than the dossiers before upload and reports unreadable dossiers. An interrupted upload can still leave new dossiers under the old index/manifest until it finishes: the source explicitly documents this. It is not atomic publication. Record that operational limitation, rather than treating “manifest last” as a transaction over every object.

One round-83 test that would still pass if its optimization were reverted is **r83w weight 2**: it deliberately accepts either circles or paths and checks stable server-to-client map handover. That guard is not defective; weight 1/3/4 test the changed representation and rendering. Source-pattern checks such as the literal absence of `points:[`, a short scoping-class spelling and exact explanatory prose assert implementation. Keep them small and separate from behaviour evidence. CDP throttling/layout-shift tests and Chromium PDF checks are explicitly engine-specific; passing them does not prove Safari performance or printing.

The three changes most likely to reduce the next bug are:

1. Preserve a typed admission reason for each contributing point: strict native, boundary-only, coast-only, source administrative conflict. Then one shared pipeline can process both licence classes while an independent validator checks the disputed subset.
2. Make the authoritative collection envelope explicit. The reservation repair is good; arrival order and parked-clock decisions still have semantics beyond an unordered list of field changes. Test reconstruction with disposable caches removed, and distinguish durable log/envelope facts from caches in the format contract. I did not reproduce an additional loss from those facts in this review.
3. Test deployed contracts at their actual boundary: edge GET cache headers, manifest/index/page joins and source provenance. The cache fault is an example thousands of fixture tests cannot fix. Add small boundary fixtures for short phones and source administrative conflicts, rather than another broad layer of source-text assertions.

### What I would keep as owner decisions

Keep thin climates visible with counts; do not convert a sample-size threshold into invented precision. Keep Darjeeling's stated scheme assignment unless a general mapping rule changes it. Keep the source-disagreement screen and its qualified explanation, and do not hand-correct the six doubtful climates. A lack of a rule is not independent clearance of those climates: retained doubtful examples should remain an audit watchlist.

The missing-island/coast policy is now more explicit, but the same-country border case above requires attention beyond the queued country guard. A named default point with no accuracy can still lose a valid habitat record under the disclosed conservative rule; I did not establish another new false positive that the 10 km exception should have retained. A future valley-lapse study and contributing/available record counts remain worthwhile. “Another author” is understandable when the actual author and destination are also supplied.

The cookie compatibility decision, disabled Workers Logs and HSTS without includeSubDomains are not new blockers established by this audit. NEL is disclosed. Pruning old bucket files and the interrupted-upload limitation belong in operations; their mere existence is not proof that an unlisted dossier is public or that private data leaks.

### Execution record

Windows, Node **24.20.0**, Playwright Chromium **153.0.8010.12**, WebKit **26.6**, Firefox **155.0**. Browser binaries were selected explicitly. A clean dependency install completed. Unit run: **554 files passed, 1 skipped; 5,026 tests passed, 12 skipped** (132.36 s). Default strict Chromium desktop/phone run: **743 passed, 5 skipped**, 7.4 min, exit 0. Full strict run: **2,019 passed, 17 skipped**, **49.4 min**, **no retries**, exit 0. The suite built and owned port 4173; independent journeys used a frozen build and independent state on 4184. Measurements began after the suite ended. Logs: [unit-results.txt](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/unit-results.txt>), [chromium-results.txt](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/chromium-results.txt>), [all-browser-results.txt](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/all-browser-results.txt>).

No live sync vault was created. The independent sync journeys created **two local vaults total**, on isolated state and a different port from the suite; suite vaults were also local. `/api/index` was downloaded **once**. Production and primary-source clients identified themselves as `CultifolioIndependentReview/84`; direct requests were paced. No issue, comment, message, deployment or application-source change was made.

The new `How` and `Formats` pages were read against the inspected code and live responses. The live cache lifetime is the remaining demonstrated false sentence; NEL was already disclosed. Exact historical Wikipedia revisions remain a known traceability limitation: 46 sampled Wikipedia summaries resolve, 45 are still verbatim substrings of their current introductory extracts, and Aloe's wording has changed. Without its historical revision I cannot call that a fabricated or wrong-at-build quotation. Source-specific dates and stored text are retained in the evidence.

This review does **not** complete botanical authentication of every photograph, published-habitat/elevation validation of every climate, every external-link destination, the full production performance matrix on physical engines, or line-by-line formal verification of all code against every sentence of the documents. The field ledger makes those limits explicit; a matched source record is never labelled an independently identified plant.

The following appendices contain the measurements, the 81-species field ledger and a finding-by-finding round-82 status ledger. They separate independent reproduction from suite/source evidence.


### Measurement appendix

Three cold HTTP-cache trials per row; medians shown. Phone: 390×844, touch/mobile emulation, 4× CPU, 1.6 Mb/s down / 750 kb/s up / 150 ms latency through CDP. Desktop: 1280×900 without throttling. Local collection rows use real IndexedDB records and the isolated fixture app; injected plants have minimal fields and no photograph/history load.

Reference rows use an **offline HTTPS replay** of saved production HTML/assets/images, preserving URLs and content. Responses originally compressed were recompressed before the run (Brotli quality 5), rather than incorrectly sending decoded bodies at full size. The earlier uncompressed run is retained as discarded evidence. This is a rendering/transfer experiment, **not a measurement of production Cloudflare TTFB, DNS/TLS to the real origins, HTTP/2/3 priorities, real-device CPU or field CWVs**. The local replay uses HTTP/1.1 TLS.

The blocking value sums `max(long-task duration−50 ms,0)` after FCP through two seconds after network idle; it is a **TBT proxy**, not Lighthouse’s exact TTI-bounded TBT, and INP was not measured. The shift value sums non-input layout shifts in the capture: an upper bound on CLS if more than one CLS session is present. These distinctions matter before comparing the numbers with field thresholds.

| Surface | Environment | LCP ms | Shift sum | Blocking proxy ms |
|---|---|---:|---:|---:|
| / | Desktop; captured-response replay | 192 | 0.00000 | 0 |
| /species/sempervivum-tectorum | Desktop; captured-response replay | 256 | 0.00080 | 9 |
| /species/abies-beshanzuensis | Desktop; captured-response replay | 216 | 0.00080 | 0 |
| /?by=genus&from=H | Desktop; captured-response replay | 180 | 0.00000 | 0 |
| / | Phone; captured-response replay | 1128 | 0.00009 | 270 |
| /species/sempervivum-tectorum | Phone; captured-response replay | 5332 | 0.00166 | 473 |
| /species/abies-beshanzuensis | Phone; captured-response replay | 992 | 0.00174 | 255 |
| /?by=genus&from=H | Phone; captured-response replay | 1096 | 0.00006 | 272 |
| /species/abies-marocana | Desktop; captured-response replay | 216 | 0.00080 | 0 |
| /species/abies-marocana | Phone; captured-response replay | 988 | 0.00225 | 260 |
| My plants, 30 | desktop; isolated local app | 304 | 0.00011 | 0 |
| My plants, 400 | desktop; isolated local app | 364 | 0.00011 | 0 |
| My plants, 30 | phone 4x/1.6Mbps/150ms; isolated local app | 2536 | 0.00110 | 6 |
| My plants, 400 | phone 4x/1.6Mbps/150ms; isolated local app | 2784 | 0.00000 | 97 |

The catalogue replay has one uncaptured Commons thumbnail and returns a local 404 for it; treat that row as partial. All other replay rows have no cache misses. Abies **marocana** is the actually not-checked page; Abies **beshanzuensis** is an extra no-climate page and is not mislabeled as a source failure.

The largest transferred rich-page assets in this replay are **regions50.svg ~143 kB**, **land50.svg ~92 kB**, and the three font files together **~150 kB**. The largest-contentful element is the lead photograph. The first changes to investigate are delaying full-resolution below-fold atlas work while preserving named scripts-off/print maps, and reducing initial font/bundle work. A real HTTP/2/3 phone trace must establish how much those changes improve the hero’s arrival before claiming a production gain. The strongest demonstrated performance repair is the local 400-plant phone shift: **0 in all three trials**, versus 0.387 in the previous review.

Raw measurements: [performance-replay.jsonl](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/performance-replay.jsonl>), [performance-unchecked.jsonl](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/performance-unchecked.jsonl>), [performance-local.jsonl](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/performance-local.jsonl>).

### Species field ledger

The sample contains **20 most-grown** by the repository’s dated cultivated iNaturalist counts, **15 obscure**, **10 hybrid**, **5 changed headings**, **11 few-record candidates (10 remain thin)**, and 20 additional probes: **81 unique species** in total, of which 18 have fewer than 12 climate records or 5 climate cells. Cultivated counts are an input to stratification, not an independent survey of growers.

**75 Kew entries have independently matching names and authors; 74 native-range sets agree with the current published Kew mirror.** Potentilla’s additional German range in the current mirror differs from the June file and is a snapshot difference, not a confirmed site error. The six GBIF-only headings do not have their Kew equivalence invented by this audit. This check uses Kew’s published WCVP dataset through GBIF, with a later crawl date than the site’s June 4 file; it is not a comparison against an independently downloaded June bulk file.

For **all 3,030 photos**, the primary record/file and licence category match; 2,247 direct iNaturalist records also match the site’s taxon or a descendant. GBIF media URL matches and Commons file matches are provenance checks, not independent visual species identification. Two Commons apparent author differences were manually cleared as “Photo by David J. Stang” versus “David J. Stang”, and a Kurt Stüber footnote. The two Hibiscus differences remain.

The table deliberately does not turn a successful polygon/source join into published-habitat validation. The CSV/JSON includes the exact native codes, cell counts/coordinates, elevation, rain, reasons, credits and URLs: [species-field-verdicts.csv](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/species-field-verdicts.csv>) / [species-field-verdicts.json](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/species-field-verdicts.json>).

| Species / stratum | Accepted name + author | Native range | Habitat climate | Photos: record / licence / author / identity | Links | Quotation |
|---|---|---|---|---|---|---|
| [Hibiscus × rosa-sinensis](https://cultifolio.com/api/dossier/k2850448) (most-grown) | Match; L. | Match | none: native range not verified: no WCVP distribution with native status for this name, so records cannot be told fr… | 79/79 matched; licences match; 2 credit differences; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Nerium oleander](https://cultifolio.com/api/dossier/k135196) (most-grown) | Match; L. | Match | 341 records/263 cells; shape pass; habitat unverified | 110/110 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Acer palmatum](https://cultifolio.com/api/dossier/k2616153) (most-grown) | Match; Thunb. | Match | 332 records/279 cells; shape pass; habitat unverified | 93/93 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Lagerstroemia indica](https://cultifolio.com/api/dossier/k2354050) (most-grown) | Match; L. | Match | 91 records/80 cells; shape pass; habitat unverified | 90/90 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Ginkgo biloba](https://cultifolio.com/api/dossier/k334053) (most-grown) | Match; L. | Match | none: only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are neede… | 108/108 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Codiaeum variegatum](https://cultifolio.com/api/dossier/k44790) (most-grown) | Match; (L.) Rumph. ex A.Juss. | Match | 297 records/234 cells; shape pass; habitat unverified | 83/83 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Magnolia grandiflora](https://cultifolio.com/api/dossier/k117615) (most-grown) | Match; L. | Match | 1229 records/854 cells; shape pass; habitat unverified | 90/90 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Euphorbia milii](https://cultifolio.com/api/dossier/k80891) (most-grown) | Match; Des Moul. | Match | 86 records/63 cells; shape pass; habitat unverified | 108/108 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Catharanthus roseus](https://cultifolio.com/api/dossier/k35719) (most-grown) | Match; (L.) G.Don | Match | 8 records/7 cells; shape pass; habitat unverified | 79/79 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Hydrangea macrophylla](https://cultifolio.com/api/dossier/k2855720) (most-grown) | Match; (Thunb.) Ser. | Match | 30 records/29 cells; shape pass; habitat unverified | 92/92 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Salvia rosmarinus](https://cultifolio.com/api/dossier/k183733) (most-grown) | Match; Spenn. | Match | 683 records/508 cells; shape pass; habitat unverified | 75/75 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Aloe vera](https://cultifolio.com/api/dossier/k298116) (most-grown) | Match; (L.) Burm.f. | Match | 4 records/4 cells; border centre; habitat unverified | 76/76 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Article resolves; current text differs; historical revision not checked |
| [Prunus serrulata](https://cultifolio.com/api/dossier/k2961630) (most-grown) | Match; Lindl. | Match | 5 records/5 cells; shape pass; habitat unverified | 92/92 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Cordyline fruticosa](https://cultifolio.com/api/dossier/k303171) (most-grown) | Match; (L.) A.Chev. | Match | 110 records/101 cells; shape pass; habitat unverified | 69/69 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Coleus scutellarioides](https://cultifolio.com/api/dossier/k46100) (most-grown) | Match; (L.) Benth. | Match | 600 records/466 cells; shape pass; habitat unverified | 105/105 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Syringa vulgaris](https://cultifolio.com/api/dossier/k356495) (most-grown) | Match; L. | Match | 18 records/17 cells; shape pass; habitat unverified | 79/79 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Picea pungens](https://cultifolio.com/api/dossier/k380719) (most-grown) | Match; Engelm. | Match | 189 records/170 cells; shape pass; habitat unverified | 103/103 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Carnegiea gigantea](https://cultifolio.com/api/dossier/k2701125) (most-grown) | Match; (Engelm.) Britton & Rose | Match | 1687 records/490 cells; shape pass; habitat unverified | 71/71 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Ixora coccinea](https://cultifolio.com/api/dossier/k103356) (most-grown) | Match; L. | Match | 532 records/435 cells; shape pass; habitat unverified | 82/82 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Dracaena trifasciata](https://cultifolio.com/api/dossier/k525228) (most-grown) | Match; (Prain) Mabb. | Match | 11 records/10 cells; border centre; habitat unverified | 74/74 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Acharagma aguirreanum](https://cultifolio.com/api/dossier/k2617226) (renamed) | Match; (Glass & R.A.Foster) Glass | Match | none: only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are neede… | 7/7 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Aeonium tabuliforme](https://cultifolio.com/api/dossier/k2623641) (renamed) | Match; (Haw.) Webb & Berthel. | Match | 255 records/32 cells; shape pass; habitat unverified | 38/38 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Albuca canaliculata](https://cultifolio.com/api/dossier/k3323346) (renamed) | Match; (Medik.) S.S.Ying | Match | 273 records/131 cells; shape pass; habitat unverified | 91/91 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Albuca crispolanata](https://cultifolio.com/api/dossier/k3323799) (renamed) | Match; (Mart.-Azorín, M.B.Crespo, M.Á.Alonso & M.Pinter) S.S.Ying | Match | none: no georeferenced record inside the range | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Albuca grandiflora](https://cultifolio.com/api/dossier/k3301458) (renamed) | Match; (Baker) Mart.-Azorín, M.B.Crespo & M.Á.Alonso | Match | none: no georeferenced record inside the range | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Mentha × dalmatica](https://cultifolio.com/api/dossier/k124605) (hybrid) | Match; Tausch | Match | 93 records/90 cells; shape pass; habitat unverified | 1/1 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Nuphar × rubrodisca](https://cultifolio.com/api/dossier/k2383341) (hybrid) | Match; Morong | Match | 123 records/112 cells; shape pass; habitat unverified | 20/20 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Fuchsia × bacillaris](https://cultifolio.com/api/dossier/k2814836) (hybrid) | Match; Lindl. | Match | 6 records/6 cells; shape pass; habitat unverified | 6/6 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Aloe × schimperi](https://cultifolio.com/api/dossier/k297951) (hybrid) | Match; Tod. | Match | 27 records/23 cells; shape pass; habitat unverified | 9/9 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Robinia × ambigua](https://cultifolio.com/api/dossier/k2428552) (hybrid) | Match; Poir. | Match | none: no georeferenced record inside the range | 23/23 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Deutzia × wilsonii](https://cultifolio.com/api/dossier/k2763378) (hybrid) | Match; Duthie | Match | none: no georeferenced record inside the range | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Potentilla × collina](https://cultifolio.com/api/dossier/k2954209) (hybrid) | Match; Wibel | Snapshot difference: current Kew adds GER | 105 records/88 cells; shape pass; habitat unverified | 22/22 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [× Butyagrus nabonnandii](https://cultifolio.com/api/dossier/k28180) (hybrid) | Match; (Prosch.) Vorster | Match | none: only 2 distinct land cells of the climate grid hold an in-range record placed to within 10 km; three are neede… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Plagianthus × cymosus](https://cultifolio.com/api/dossier/k2546982) (hybrid) | Match; Kirk | Match | pending: GBIF's backbone files this species' own name (Plagianthus cymosus Kirk) under Plagianthus divaricatus J.R.Fors… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Euphorbia × curvirama](https://cultifolio.com/api/dossier/k79211) (hybrid) | Match; R.A.Dyer | Match | none: only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are neede… | 2/2 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Ceropegia ananthapuramensis](https://cultifolio.com/api/dossier/g11144626) (obscure) | Unproved GBIF/Kew join; (K.Prasad, A.Naray. & Meve) Kottaim. | Kew range unproved for this heading | none: no georeferenced record inside the range | 0/0 matched; licences match; credits agree; visual ID pending | Not cleared | No Wikipedia quotation on page; upstream none |
| [Conophytum tomasii](https://cultifolio.com/api/dossier/g3702919) (obscure) | Unproved GBIF/Kew join; Halda | Kew range unproved for this heading | none: 1 in-range record, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bett… | 0/0 matched; licences match; credits agree; visual ID pending | Not cleared | No Wikipedia quotation on page; upstream none |
| [Cyphostemma degraerii](https://cultifolio.com/api/dossier/g4052359) (obscure) | Unproved GBIF/Kew join; (Dewit) Desc. | Kew range unproved for this heading | none: 3 in-range records at 2 places, none placed to within 10 km by the climate's rule (none states an accuracy of … | 0/0 matched; licences match; credits agree; visual ID pending | Not cleared | No Wikipedia quotation on page; upstream none |
| [Albuca longifolia](https://cultifolio.com/api/dossier/g7570556) (obscure) | Unproved GBIF/Kew join; Fisch. ex Steud., 1840 | Kew range unproved for this heading | none: native range not verified: no WCVP distribution with native status for this name, so records cannot be told fr… | 0/0 matched; licences match; credits agree; visual ID pending | Not cleared | No Wikipedia quotation on page; upstream none |
| [Ceropegia marnierana](https://cultifolio.com/api/dossier/g9449818) (obscure) | Unproved GBIF/Kew join; (Lavranos) Bruyns | Kew range unproved for this heading | none: 2 in-range records, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bet… | 0/0 matched; licences match; credits agree; visual ID pending | Not cleared | No Wikipedia quotation on page; upstream none |
| [Kopsia teoi](https://cultifolio.com/api/dossier/k106358) (obscure) | Match; L.Allorge | Match | none: no georeferenced record inside the range | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Lagenandra lancifolia](https://cultifolio.com/api/dossier/k107214) (obscure) | Match; (Schott) Thwaites | Match | none: 1 in-range record, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bett… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Lavandula × heterophylla](https://cultifolio.com/api/dossier/k109025) (obscure) | Match; Viv. | Match | none: only 2 distinct land cells of the climate grid hold an in-range record placed to within 10 km (1 at sea or ice… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Lepanthes chelonion](https://cultifolio.com/api/dossier/k109777) (obscure) | Match; Luer & R.Escobar | Match | none: 1 in-range record, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bett… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Lepanthes domingensis](https://cultifolio.com/api/dossier/k109906) (obscure) | Match; Hespenh. & Dod | Match | none: only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are neede… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Licuala rumphii](https://cultifolio.com/api/dossier/k112254) (obscure) | Match; Blume | Match | none: 1 in-range record, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bett… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Licuala sallehana](https://cultifolio.com/api/dossier/k112256) (obscure) | Match; Saw | Match | none: 1 in-range record, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bett… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Lycaste × michelii](https://cultifolio.com/api/dossier/k115805) (obscure) | Match; Oakeley | Match | none: no georeferenced record inside the range | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Magnolia annamensis](https://cultifolio.com/api/dossier/k117445) (obscure) | Match; Dandy | Match | none: 1 in-range record, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bett… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Magnolia wolfii](https://cultifolio.com/api/dossier/k117901) (obscure) | Match; (Lozano) Govaerts | Match | 5 records/4 cells; shape pass; habitat unverified | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Homalomena pendula](https://cultifolio.com/api/dossier/k100035) (few-candidate) | Match; (Blume) Bakh.f. | Match | 3 records/3 cells; shape pass; habitat unverified | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Huntleya wallisii](https://cultifolio.com/api/dossier/k100847) (few-candidate) | Match; (Rchb.f.) Rolfe | Match | 6 records/5 cells; shape pass; habitat unverified | 1/1 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Acalypha pendula](https://cultifolio.com/api/dossier/k1013) (few-candidate) | Match; C.Wright ex Griseb. | Match | 3 records/3 cells; shape pass; habitat unverified | 6/6 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Jatropha nudicaulis](https://cultifolio.com/api/dossier/k104784) (few-candidate) | Match; Benth. | Match | 3 records/3 cells; shape pass; habitat unverified | 13/13 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Kadua littoralis](https://cultifolio.com/api/dossier/k105470) (few-candidate) | Match; Hillebr. | Match | 8 records/7 cells; shape pass; habitat unverified | 12/12 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Karomia tettensis](https://cultifolio.com/api/dossier/k105596) (few-candidate) | Match; (Klotzsch) R.Fern. | Match | 6 records/6 cells; shape pass; habitat unverified | 3/3 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Kefersteinia ocellata](https://cultifolio.com/api/dossier/k105750) (few-candidate) | Match; Garay | Match | 3 records/3 cells; shape pass; habitat unverified | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Kefersteinia tolimensis](https://cultifolio.com/api/dossier/k105769) (few-candidate) | Match; Schltr. | Match | 29 records/23 cells; shape pass; habitat unverified | 25/25 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Anthurium acaule](https://cultifolio.com/api/dossier/k10582) (few-candidate) | Match; (Jacq.) Schott | Match | 3 records/3 cells; shape pass; habitat unverified | 5/5 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Kerriodoxa elegans](https://cultifolio.com/api/dossier/k105915) (few-candidate) | Match; J.Dransf. | Match | 9 records/5 cells; shape pass; habitat unverified | 22/22 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Acharagma roseanum](https://cultifolio.com/api/dossier/k2617227) (few-candidate) | Match; (Boed.) E.F.Anderson | Match | 3 records/3 cells; shape pass; habitat unverified | 12/12 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Echeveria elegans](https://cultifolio.com/api/dossier/k2781134) (probe) | Match; Rose | Match | 40 records/23 cells; shape pass; habitat unverified | 46/46 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Haworthia cooperi](https://cultifolio.com/api/dossier/k277069) (probe) | Match; Baker | Match | 62 records/43 cells; shape pass; habitat unverified | 51/51 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Lithops lesliei](https://cultifolio.com/api/dossier/k2341111) (probe) | Match; (N.E.Br.) N.E.Br. | Match | none: 69 in-range records at 66 places, none placed to within 10 km by the climate's rule (none states an accuracy o… | 36/36 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Sempervivum tectorum](https://cultifolio.com/api/dossier/k2490030) (probe) | Match; L. | Match | 1185 records/955 cells; shape pass; habitat unverified | 76/76 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Picea omorika](https://cultifolio.com/api/dossier/k380733) (probe) | Match; (Pančić) Purk. | Match | 7 records/5 cells; shape pass; habitat unverified | 57/57 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Monstera deliciosa](https://cultifolio.com/api/dossier/k129588) (probe) | Match; Liebm. | Match | 170 records/119 cells; shape pass; habitat unverified | 84/84 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Hoodia alstonii](https://cultifolio.com/api/dossier/k506502) (probe) | Match; (N.E.Br.) Plowes | Match | 18 records/11 cells; shape pass; habitat unverified | 10/10 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Echinopsis macrogona](https://cultifolio.com/api/dossier/k2783497) (probe) | Match; (Salm-Dyck) H.Friedrich & G.D.Rowley | Match | 191 records/116 cells; shape pass; habitat unverified | 35/35 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Galanthus nivalis](https://cultifolio.com/api/dossier/k307568) (probe) | Match; L. | Match | 148 records/128 cells; shape pass; habitat unverified | 105/105 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Ficus elastica](https://cultifolio.com/api/dossier/k2810307) (probe) | Match; Roxb. ex Hornem. | Match | 116 records/98 cells; shape pass; habitat unverified | 88/88 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Melissa officinalis](https://cultifolio.com/api/dossier/k124103) (probe) | Match; L. | Match | 89 records/73 cells; shape pass; habitat unverified | 96/96 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Indigofera taiwaniana](https://cultifolio.com/api/dossier/k2864797) (probe) | Match; T.C.Huang & M.J.Wu | Match | none: only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are neede… | 6/6 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Monsonia lheritieri](https://cultifolio.com/api/dossier/g8005942) (probe) | Unproved GBIF/Kew join; (Sweet) Steud. | Kew range unproved for this heading | none: native range not verified: Kew holds Monsonia lheritieri only under another author (Monsonia lheritieri DC.), … | 0/0 matched; licences match; credits agree; visual ID pending | Not cleared | No Wikipedia quotation on page; upstream none |
| [Cedrus deodara](https://cultifolio.com/api/dossier/k382693) (probe) | Match; (Roxb. ex D.Don) G.Don | Match | 60 records/52 cells; shape pass; habitat unverified | 109/109 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Haemanthus pumilio](https://cultifolio.com/api/dossier/k276886) (probe) | Match; Jacq. | Match | 9 records/4 cells; shape pass; habitat unverified | 1/1 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Echinopsis cuzcoensis](https://cultifolio.com/api/dossier/k2783360) (probe) | Match; (Britton & Rose) H.Friedrich & G.D.Rowley | Match | 139 records/47 cells; shape pass; habitat unverified | 44/44 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Eulychnia acida](https://cultifolio.com/api/dossier/k2803037) (probe) | Match; Phil. | Match | 1475 records/258 cells; shape pass; habitat unverified | 64/64 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Conophytum calculus](https://cultifolio.com/api/dossier/k2734812) (probe) | Match; (A.Berger) N.E.Br. | Match | none: only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are neede… | 46/46 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | Verbatim in current Wikipedia intro |
| [Conophytum calculus subsp. vanzylii](https://cultifolio.com/api/dossier/k2734813) (probe) | Match; (Lavis) S.A.Hammer | Match | none: 7 in-range records, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or bet… | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |
| [Ceropegia dodomaensis](https://cultifolio.com/api/dossier/k3313620) (probe) | Match; Heiduk & D.Styles | Match | none: no georeferenced record inside the range | 0/0 matched; licences match; credits agree; visual ID pending | POWO row match; others partial | No Wikipedia quotation on page; upstream none |

### Round 82 status ledger

“Suite/source” means the regression suite passed and/or the relevant implementation was inspected; it is **not a claim to have independently reproduced every original failure again**. The detailed original fixes remain in the linked round-82 document.

| Original finding | This repeat review |
|---|---|
| 1 a Replace resumed by two tabs could lose photographs | Lock/recovery suite passed; local Replace and photo sync passed. Two-tab resumption not independently fault-injected. |
| 2 "peppermint" put Mentha × piperita 18th; "echeveria" ran alphabetically | Live peppermint first, Echeveria elegans first; independently confirmed. |
| 3 a same-spelled name by another author shown as an older name (1,691 pages) | Same-spelling handling inspected and suite passed; live Ceropegia tanzaniensis correctly offers both plants. |
| 4 Echeveria peacockii on Dudleya pulverulenta's Kew entry; one entry, two pages | Kept-page-first live search and merged redirects confirmed; no duplicate index IDs/slugs. |
| 5 an iNaturalist taxon taken on a GBIF FUZZY match | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 6 a Kew-id page matched on Wikidata by its label | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 7 rows not ok with no reason | Sample reasons inspected; all-file repair listing replay not run. |
| 8 the service worker's caches grow | Bounded cache code/suite; local offline journey passed. Long-lived production cache churn not independently aged. |
| 9 no /24 window for IPv4 | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 10 "not checked" five times on a page | Per-source refusal deduplication passed the suite; distinct photo/record failures are correctly still named separately. |
| 11 "Without climate" lumped none and not checked | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 12 the close-up map had no names or scale | Named maps/captions and associated descriptions confirmed in production DOM. |
| 13 the lead photograph often the weakest | Lead images inspected on landing pages; not every lead proven best. |
| 14 the Undo toast over a form's buttons | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 15 three backup reminders at once; none counted after a restore | Local restore/backup and reminder flow confirmed. |
| 16 a batch just sown said "0 entries" | Independent sowing/pot-up log shows its starting entry. |
| 17 the picker showed "Lithops lesliei luteoviridis · variety" | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 18 a red frost bar for a night nine days out above freezing | Frost suite passed; no physical forecast/greenhouse event independently observed. |
| 19 the scroll-spy marked the section above | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 20 Compare's range without "+N" | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 21 a g page's range heading said WCVP with no range | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 22 historical region names raw | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 23 an empty Papers section | No empty papers section seen in the inspected pages; suite/source evidence. |
| 24 13.5 px desktop text | Desktop typography inspected; suite passed. |
| 25 the pinned bar over the Acquired field | Pinned-bar/keyboard suite passed; physical keyboard opening not run. |
| 26 CC0 photographs credited with no observer | All photo metadata checked; current Hibiscus credit drift is finding 2; authorless labels covered by suite. |
| 27 the index cut a hybrid formula to its first parent | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 28 two inactive iNaturalist ids | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 29 "ok" rows for things the page does not show | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 30 raw NUL bytes in `log.ts` | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 31 `GET /api/sync/vault` | Server/suite evidence for 405 and no-store; no live vault created. |
| 32 /compare not limited | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 33 cookies without Secure; no `object-src` | Live security headers and source/suite; deliberate HSTS scope retained. |
| 34 the SYNC_OPEN comment | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 35 Peperomia graveolens keyed by genus | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 36 the Wikipedia extract cut mid-word | 46 live Wikipedia quote sources resolve, 45 still verbatim; historical Aloe revision unverified. |
| 37 sync re-sent a refused change every run | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 38 pixels reclaimed only with sync; a snapshot refused after a Merge that parks | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 39 the stale sea-floor sentence | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| 40 thin and implausible climates | 18 sampled thin climates keep their figures/counts; clinical habitat plausibility remains incomplete. |
| R2 1 photographs without an author | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| R2 2 hybrids without their × in the search | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| R2 3 "Most grown" overstated its measure | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| R2 4 cuttings announced as seedlings | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| R2 5 two rain totals unexplained | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| R2 6 the example-collection action under 44 px | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| R2 7 the phone's first screen | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |
| R2 `TypeError: n is not a function` | Full regression suite passed; inspected/source evidence only where discussed above. Not independently replayed finding-by-finding. |

### Round 83/84 claim check

| Claim | Evidence and verdict |
|---|---|
| Lighter page | Current Sempervivum HTML is 181,811 decoded bytes; the previous saved response was 174,671. Static coastline sharing remains real, but the old “about 126 kB” number is not a rich-page measurement. |
| No scripts/print/dark/a11y loss | Production no-JS 390/1280 captures retain content and named SVGs; map captions now resolve through aria-describedby. Chromium print/PDF and dark/root-text captures exist; physical print/AT/native zoom remain unproved. |
| Eleven merges | All 11 live addresses return 302; old-name search for peacockii and Bisnaga puts the kept page first. |
| New Kew headings | 501 heading changes across the index; five sampled old addresses redirect. 75 independently matching Kew entry/name/author checks; Huernia 75. |
| Shapes/re-derivation | 366 shapes in committed metadata; sampled r84 provenance and much stronger full-walk code. No independent replay of 48,357 restricted input datasets; boundary-only admissions remain. |
| Extremes wording | Current source and saved Aloe response say disagreement, not impossibility. The chosen rule is retained and openly qualified. |
| iNaturalist address repair | 2,247 direct photos resolve through their source records and IDs; no new broken address shape was established. Not every binary URL was fetched. |
| Collection log reservation | Independent Replace → drop issued meta → rebuild still offers 0003. Fixed. |
| Cold collection layout | 400 plants: zero phone shift across three new trials. Fixed in this test. |
| Picker race | New held-answer behaviour tests pass every engine first time. Independent basic entry journeys pass; no claim about a physical iPhone finger gesture. |
| Deployment output/repair listings | Source scope-aware output and unreadable-file failure handling inspected; complete strict run ends with the correct every-engine permission. No filtered run advertised as a complete gate. |
| Documentation | Improved explanations and per-source semantics; live cache contract remains false. NEL disclosure was already present. Historical Wiki revision traceability remains queued. |

### Selected visual evidence

[320×700 touch: habitat reading below the bar](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/touch-320x700-semp.png>) · [390 px: useful new short reading](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/phone-haworthia-cooperi.png>) · [Desktop figure row](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/desktop-sempervivum-tectorum.png>) · [Species print PDF](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/sempervivum-print.pdf>) · [30-label print PDF](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/collection-labels.pdf>) · [Death undone](<C:/Users/jefar/Desktop/AI GPT/Invoice Extractor/cultifolio-review/round84/grower-after-undo.png>)

No data fixes were applied. The repository remains a review input. The complete primary responses and reproducible audit scripts are in the evidence directory.