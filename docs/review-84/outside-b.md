Cultifolio: independent review of ba78fb9

**Not ready for an unrestricted public launch under the promises in the brief.** First repair the habitat climates that still use records outside the published native range, replace the scientifically unjustified explanation in the new extremes rule, and reconcile the log-only and network-disclosure claims with the implementation. The collection is usable and several previous faults are substantially improved, but this review is **incomplete**, especially primary-source verification of every photograph and cold-load performance on physical phones.

Reviewed 29 October 2026, America/New_York. Source: `ba78fb9`. Live `/api/corpus` answered `e8885155673882ba`, 256 buckets, manifest present. The source checkout is separate from the live corpus; fixture results below do not establish the quality of the production data.

The three review inputs:

1. [Repository at ba78fb9](https://github.com/zomethingje-eng/cultifolio/tree/ba78fb9).
2. [Live site](https://cultifolio.com/), with [corpus identity](https://cultifolio.com/api/corpus).
3. Repository documents: [round 82](https://github.com/zomethingje-eng/cultifolio/blob/ba78fb9/docs/REVIEW-ROUND-82.md), [outside reviews and fixes](https://github.com/zomethingje-eng/cultifolio/tree/ba78fb9/docs/review-82), [deployment notes](https://github.com/zomethingje-eng/cultifolio/blob/ba78fb9/docs/DEPLOY.md), [devlog](https://github.com/zomethingje-eng/cultifolio/blob/ba78fb9/docs/DEVLOG.md); live [How it is made](https://cultifolio.com/about/how) and [Formats](https://cultifolio.com/about/formats).

## Scorecard

These are judgments about the evidence examined, not certification. “Provisional” means a material part of the requested assessment was not completed.

| Area | /10 | Reason and movement from the previous two reviews |
|---|---:|---|
| User experience | 7 | Search and explanation fixes are real; the phone still prioritizes actions and photographs over the requested quick habitat reading. Broadly unchanged from 7/7. |
| Appearance | 7 | Coherent typography, cards, colour and spacing; the crowded species introduction and technical reading burden remain. Unchanged from 7/7. |
| Mobile | 7 | The inspected widths fit, and real coarse-pointer controls improve on narrow desktop emulation; inline targets and the unresolved Add timing concern remain. Same as the second review, below the first review's 8. |
| Data quality | 5, provisional | Better credits and hybrid notation, but two popular plants still publish a typical climate outside their own native-region shapes. No basis to raise the second review's 5 toward the first review's 7. |
| Code quality | 8 | Strong recovery machinery and a passing unit suite; repair selection and authoritative metadata still contradict broad invariants. Same as the second review's 8. |
| Performance | 6, provisional | Local cold 400-plant CLS reached 0.387 and the phone-profile LCP median was 2.816 s; the rich live page is 174.7 kB. The full live matrix remains missing. No demonstrated improvement over the earlier 6. |
| Accessibility | 7, provisional | Keyboard and cross-engine tests provide useful coverage; maps lack associated descriptions and not every touch target meets the requested 44 px. No evidence for the first review's 9. |
| Honesty of claims | 6 | Authorless-credit handling and search disclosures improved; current range-filter, log-only and exhaustive-host claims still fail. Up from the second review's 5, below the first review's 7. |

## Findings, ranked in the requested order

### 1. Habitat climates still come from outside the page's own native range — confirmed

**Where:** [Aloe vera dossier](https://cultifolio.com/api/dossier/k298116), [Ficus elastica dossier](https://cultifolio.com/api/dossier/k2810307); `src/lib/dossier/tdwg-shapes.ts:120`, `scripts/build-dossiers.ts:2034–2048`, and `src/lib/dossier/repair-r83.ts:24–31`. Local evidence: `shape-proof.json`, `proof-results.txt`, and `primary/k298116-typical-records.json` / `primary/k2810307-typical-records.json`.

**What happens:** Aloe vera publishes eight climate records/eight cells and a typical spot at **25.425, 56.175**, with a 1st-percentile night of **12.1 °C**. Its only native-region code is `OMA`. That spot fails the repository's current Oman polygon test **including its 0.05° buffer**. Ficus elastica publishes 196 records/139 cells and **22.125, 88.575**, also outside every native region it lists, even with the buffer. This is not a tiny cell-centre displacement across a border.

GBIF independently supplies records in the actual cells: Aloe records **3398657448, 3398877447 and 3399171466** at 25.437721, 56.168707 are explicitly **AE**, with 4,459 m uncertainty. The Ficus record **4172272287** at 22.13183, 88.5994 is **IN**, with 1,032 m uncertainty. These are corroborating present-day records, not a claim that a current API response proves every input of the October 21 download. [Kew's Aloe account](https://powo.science.kew.org/taxon/530017-1) places its native range in northern Oman.

**Why the repair can miss it:** both dossiers contain **zero stored open points outside the current shapes**. Their occurrence provenance does not say the shape test was applied. The old repair selector inspects only `occurrences.open`; restricted records can contribute to the climate without their positions being stored in that array. The UAE records above are CC BY-NC. The source explicitly acknowledges that restricted-only failures are not found by `outsideShapes`. The round-83 selector then looks for regained open points or a default-point exclusion, rather than proving that every old climate used the current filtering rules. The explanation is strongly supported, but only a replay of the original bulk download would establish its entire history.

**Expected:** every contributing record must pass the currently advertised filter, regardless of whether its coordinates may be published.

**Reproduction:** run `node --import tsx ../round83/proofs.ts` from the checked-out source. It reads the saved live dossiers and committed shapes, calls the actual `regionTester` and `outsideShapes`, and records the two failures. Fetch the linked dossiers to compare with current production.

**Smallest fix:** include all pages that used the former range-test rule in an offline re-derivation from the original bulk records. At minimum, explicitly include a climate whose typical cell fails all buffered native shapes; do not assume that criterion finds every contaminated envelope. Persist a range-filter rule version so publication can reject an incomplete migration. Apply this globally, with no hand-edited climate values.

### 2. The new cold-extreme rule calls a valid temperature series impossible — confirmed by executable counterexample

**Where:** `src/lib/core/lapse.ts:25–32`, `tests/unit/r83c-climate.test.ts`, `/about/how#floor`; evidence `extremes-proof.json` and `proofs.ts`.

**What happens:** the rule discards extremes when the annual 1st-percentile nightly low is warmer than the coldest month's mean nightly low across the range. Its explanation assumes approximately half that month's nights fall below its **mean**, yielding about four per cent of the year. A mean is not a median. The comparison also mixes a typical cell's daily series with a spatially aggregated monthly figure, and periods that need not agree exactly.

**Reproduction:** a 365-night series with one cold-month night at −10 °C, 30 at 5 °C, and the other 334 at 15 °C has a cold-month mean of **4.516 °C**, a minimum of −10 °C and an annual 1st percentile of **5 °C**. The actual function rejects it and emits the “four nights in a hundred” explanation. Every night is present and the arithmetic is consistent. Repeat the same year to make a multi-year series; the counterexample remains.

**Expected:** an inconsistency screen should distinguish evidence of different terrain/climates from a mathematical impossibility. This test cannot establish impossibility.

**Smallest fix:** immediately change the explanation to a labelled cross-source consistency screen. Before restoring/rejecting the 422 affected sets, define a rule on comparable quantities and validate it against complete daily series, with the aggregation, periods and tolerance stated. Keep the discarded values and reason available. The existing test asserts that the condition triggers, not that the scientific inference is sound.

This finding does **not** prove that Eulychnia acida's discarded series is correct, or that all 422 decisions are wrong.

### 3. The first phone screen still does not answer the requested ten-second habitat question — confirmed presentation gap

**Where:** `/species/echeveria-elegans`, screenshots `phone-echeveria-elegans.png`, `width-320-sempervivum-tectorum.png`, and `ui-metrics.jsonl`; species page `+page.svelte:537` begins the glance section after the identity/actions/gallery/tab material.

**What happens:** at 390×844, the name card, actions and photo strip consume the first approximately 580 px. The cold card begins around y=648; rain, light and the season are below the first screen. At 320 px, the glance heading starts near y=690. A visitor can identify the plant immediately but must scroll to assemble the four requested habitat facts. The prominent DLI figure also needs its open-sky qualification to avoid being read as a shade plant's lighting instruction.

**Expected:** a compact, plainly labelled habitat reading available before the optional gallery/actions dominate the introduction. This should preserve the distinction between habitat measurements and cultivation instructions.

**Reproduction:** open the route at the stated sizes, with no clicks. One vertical scroll is needed to reach the remaining habitat cards; no hidden menu is involved. The screenshots are from narrow Chromium layouts; separate touch checks are described below.

**Smallest fix:** move a compact cold/rain/open-sky-light/season strip ahead of the photo thumbnails, retaining the source and statistical qualification next to each figure. Keep the expanded explanations below.

### 4. A cold 400-plant phone load shifts the page substantially — confirmed locally

**Where:** `/plants`, `src/routes/plants/+page.svelte:136,234–242,274–303`; `performance-local.jsonl`, `performance-cost.jsonl`, `performance-shift.jsonl`.

**What happens:** in a 390×844 Chromium touch profile at 4× CPU and 1.6 Mbps/150 ms network emulation, the first load after seeding 400 plants with no valid snapshot produces **CLS 0.38674**. Two separate fresh-profile confirmation probes reproduced the same value. The following loads of the original three-run series were about 0.0874. The first view's largest painted element was the source-credit footer, not a plant.

The attributed shifts are explicit: at about 2.782 s the footer moves from a 360×266 px rectangle at y=424 out of the viewport (shift 0.29092); at about 2.955 s the rows and Select controls move down roughly 67 px as the later notice appears (shift 0.08738). All measured shifts fit within one 505 ms session, so their sum is also the largest-session CLS. No input occurred during this measurement.

**Expected:** the loading state, first list and notices should preserve the visible layout. The 300-plant Today test does not cover a cold 400-plant My plants fold.

**Reproduction:** start the built local app at port 4184 with `E2E_OFFLINE:1`, then run `performance-local.ts` and `performance-shift.ts` from the source directory, under Node 24. The scripts seed minimal valid records through the repository's existing test helper, which drops the snapshot and maintains arrival-order metadata. They make no production requests. This is a reproducible local cold-fold case, not a claim that every live 400-plant visit behaves this way or that a physical iPhone was measured.

**Smallest fix:** keep the footer below the visible loading area; reserve the controls/list and notice slots, or resolve the notice state before revealing the first list. Consider drawing fewer than the current initial 200 rows to reduce the cold render's blocking work. Preserve the existing snapshot optimization.

### 5. The number ledger is authoritative data outside the log — confirmed

**Where:** `src/lib/db/vault.ts:315–321,419–427`, the persistent `issued:accession` metadata; `/about/formats#snapshot` and supplied claim 6. Evidence: `ledger-seed.jsonl`, final run in `ledger-seed-results-final.txt`.

**What happens:** add plant 0001, back up, add 0002, then Replace from that older file. The live log now holds only 0001, but the metadata remembers both issued numbers and the next preview is **2026-0003**. Delete only `meta['issued:accession']` in this isolated test profile, leaving the log and snapshot otherwise unchanged; reload. The next preview becomes **2026-0002**. The log has not changed, yet a previously issued number becomes available again.

**Expected:** under the supplied invariant, reservations must be derivable from the retained log. The implementation's decision to preserve reservations across Replace is reasonable, but it is not a disposable reading of that replacement log.

**Smallest fix:** retain number-reservation events as part of the authoritative log, including through Replace, or explicitly narrow the promise and document/export the separate authoritative ledger. Do not “fix” this by deleting the reservations. This is a demonstrated invariant/identity risk, not evidence of ordinary snapshot deletion losing plants.

### 6. The exhaustive network disclosure omits Cloudflare's error-reporting endpoint — confirmed headers; transmission not reproduced

**Where:** live response headers in `requests.jsonl` and `extra-requests.jsonl`; `/about/how#privacy`, particularly the exhaustive request/host list.

**What happens:** responses carry `NEL` with `report_to: cf-nel`, a seven-day policy, and `Report-To` naming **https://a.nel.cloudflare.com/report/v4?...**. Success sampling is zero; this does not disable error reporting. The advertised host/request inventory does not mention this endpoint. “Workers Logs off” does not remove these browser reporting instructions.

**Expected:** an exhaustive host list must include reporting configured at the edge, as well as application JavaScript. The [NEL specification](https://www.w3.org/TR/network-error-logging/) describes the reporting mechanism and treats HTTP error responses as failures too.

**Reproduction:** inspect the captured `/api/index`, species-page or API headers. Search the about source for `NEL`, `a.nel.cloudflare.com` or network error reporting; no corresponding disclosure is present. An actual queued report/upload was **not** captured, so no claim is made that every tested browser transmitted one.

**Smallest fix:** disable edge NEL if the intended contract is no such requests, or disclose the endpoint, purpose and metadata accurately. This is a disclosure fault; it is not evidence that collection contents are being decrypted or uploaded.

### 7. Phone and desktop surfaces differ sensibly, but not every touch target meets the brief — confirmed

**Where:** actual coarse-pointer Chromium/WebKit at 390×844 on the local species page; `journeys.jsonl`; live narrow-layout metrics in `ui-metrics.jsonl`; `theme.css:523–533`.

**What happens:** the touch-specific rules correctly enlarge buttons and give some small visible links expanded pseudo-element hit areas. After excluding those expanded number chips and photo credits, inline links such as **DLI** (about 19×22 px), **set your site** (about 68×22 px), and **The chart** (about 53×22 px) still fall below the requested 44 px. Similar small explanatory/source links remain further down. The raw metrics list every inspected small rectangle; it is not a complete hit-area certification of every route.

**Expected:** meet the owner's stronger 44 px brief, or explicitly exempt inline prose links. This finding is not presented as a claim that every small inline link violates WCAG, which has exceptions.

**Reproduction:** use a coarse pointer, inspect the named links' bounds and check for an expanded `::after` target. Narrowing a desktop window alone is not a touch test: many 40 px controls seen in the first width sweep become 44 px with a real coarse-pointer profile.

**Smallest fix:** give the standalone explanatory links their own 44 px action rows, and decide/document how inline prose links are treated. Avoid overlapping invisible targets in dense prose.

### 8. Maps have names but no associated accessible description — confirmed DOM inspection

**Where:** `src/lib/map/still.ts:31,169`; species page `+page.svelte:705–706`; saved SVG metrics.

**What happens:** both maps have `role="img"` and a useful `aria-label`, but no `<desc>` or `aria-describedby`. Their explanatory captions are neighbouring plain `div` elements, not associated figure captions. The climate chart does have a title and description. A screen-reader user reading linearly can encounter the map captions, but asking for the image's description does not expose them.

**Expected:** the explicit name-and-description requirement applies to maps too. This is not evidence that the maps disappeared or that the adjacent text is unavailable.

**Smallest fix:** give the regional caption an id and associate each SVG with its existing caption. Include what the shaded regions/dots/marker mean, without duplicating the whole section in the image name.

### 9. The live index cache lasts four hours, not the documented five minutes — confirmed

**Where:** the one `/api/index` GET, saved first line of `requests.jsonl`; `src/routes/api/index/+server.ts:17`; `/about/how#privacy`.

**What happens:** source sets `public, max-age=300` and the method page says five minutes. The live response instead says **public, max-age=14400**, with `CF-Cache-Status: HIT` and `Age: 1`. Thus the actual delivery does not keep the documented cache contract. I did not fetch the index again to investigate, respecting the one-fetch limit.

**Expected:** published headers and documentation agree. The ordinary UI no longer downloads this index, so this does not establish a four-hour delay in every catalogue update.

**Smallest fix:** inspect the Cloudflare cache rule that can override the origin lifetime, align it with the intended policy, and assert the deployed response header in the live check. Merely changing the route's already-correct constant is insufficient.

### 10. The reported rich-page weight is not reproduced — confirmed measurement mismatch

**Where:** `/species/sempervivum-tectorum`; `requests.jsonl`, `compression.json`, `extra-results.txt`; deployment notes around `docs/DEPLOY.md:616`.

**What happens:** the saved decoded HTML is **174,671 bytes**, not approximately 126 kB as the review brief states. A separate `Accept-Encoding: gzip` request transferred **39,250 bytes**. It contains one regional SVG, both static coastline references, no `points:[` hydration member, and a roughly **51.6 kB** main inline initialization/data script. The implementation of the optimization is visible; the total-size claim is not reproduced on this corpus. The deployment note's earlier approximately 162 kB example also needs its measurement context retained.

**Expected:** state decoded HTML and wire-compressed sizes separately, with route, units, corpus, language and build. Do not read a smaller fixture page as a production size.

**Smallest fix:** update the release measurement and add a reproducible live size budget. The largest further opportunity is to profile remaining serialized page data and the stylesheet/first-image critical path; no measured LCP gain is claimed here.

### 11. Repair-list commands silently omit unreadable dossiers — suspected operational fault, source inspected

**Where:** `scripts/build-dossiers.ts:2041` and `:2065`. The first listing catches JSON/read errors and continues; the round-83 generator does the same with a “half-written” comment.

**What happens:** an unreadable page vanishes from the work list while the command can still finish with a normal summary. By contrast, the index builder has a specific fail-closed unreadable-dossier test. Atomic writes reduce the likelihood, but the recovery command should not treat an unreadable input as evidence that no repair is needed.

**Expected:** name the unreadable file and stop or report an explicitly incomplete list before an operator proceeds with a corpus repair.

**Reasoning instead of reproduction:** the listing loops are directly readable catch-and-continue paths. No production file was corrupted and no full bulk rebuild was run in this audit.

**Smallest fix:** count/name read failures and exit non-zero before writing a supposedly complete repair list. Add that behaviour to the listing-command tests.

### 12. A filtered test run still prints permission to deploy — confirmed

**Where:** `scripts/predeploy.mjs:126`; `flowering-repeat-results.txt` and `webkit-clock-repeat-results.txt`.

**What happens:** an isolated run of ten repetitions of one Chromium test ends “the deploy may go ahead”, although the preceding full strict suite failed. The script correctly warns earlier that only selected projects ran, but its final green sentence overstates what was proved. The same sentence follows the two isolated WebKit repetitions.

**Expected:** a filtered diagnostic run should report only that the selected tests passed; it must not appear to clear the full release gate.

**Reproduction:** the saved filtered command/output is sufficient; the application source was unchanged between the failed full run and these passing subsets.

**Smallest fix:** make the concluding message conditional on run scope. Preserve the failing full-run result and require the appropriate complete gate for launch. This is an operator-message fault, not evidence of an automatic deployment.

### Known Add press issue: unresolved, not a new confirmed finding

The owner reports an occasionally lost WebKit Add press. My independent quantity-form journey needed one Add in Chromium/Firefox and two in WebKit. That observation alone does not distinguish a lost pointer event from the intentional second confirmation for a name not yet resolved: the first press's intermediate state was not captured. `plants/new/+page.svelte:185–203` guards and awaits checking, but the observation does not prove a new cause. Retain this in the launch checklist and capture pointer-down/up, button position/disabled state and name-check completion in a dedicated reproduction. Do not present this review as clearing it.

## Mobile against desktop

These are every substantive surface difference observed in this audit, not an inventory of every responsive rule in the repository.

| Same page/function | Phone | Desktop | Verdict |
|---|---|---|---|
| Main navigation | Five fixed bottom destinations; shorter top bar | Destinations in the top navigation | Deliberate-and-right; equivalent destinations |
| Species identity and actions | Stacked card, more wrapping | Wider composition | Deliberate-and-right; first-screen priority remains finding 3 |
| Species section tabs | Horizontal scrolling with edge fade | More tabs fit | Deliberate-and-right; some sections need a sideways gesture, no lost function established |
| Photo strip | Fewer thumbnails visible at once, horizontal scrolling | More visible | Deliberate-and-right |
| Habitat cards and forms | Columns stack as width falls | More columns | Deliberate-and-right; inspected pages did not overflow horizontally |
| Catalogue chips and A–Z | Horizontally scrollable rows | More visible without scrolling | Deliberate-and-right; this is local control scrolling, not page overflow |
| Add field focus | No automatic mobile keyboard opening | Species field receives initial focus with fine pointer | Deliberate-and-right |
| Add actions | Sticky above bottom tabs when there is room | In normal flow | Deliberate-and-right in the tested layouts; a physical on-screen keyboard was not tested |
| Touch controls | Coarse-pointer buttons grow to 44 px, some chips have larger hit areas | Smaller mouse targets | Deliberate-and-right; remaining inline links are gap 7 |
| Introductory wording | Shorter framing, some secondary copy suppressed | More explanatory text | Deliberate-and-right in the pages inspected; exhaustive route parity not established |
| Print | Shared print rules remove navigation, toast and app bars | Same | Deliberate-and-right; physical printer output not tested |
| Name-check/Add timing | WebKit journey required an extra Add | Chromium/Firefox journeys required one | Unresolved gap, not attributed to a proven new defect |

Visual width sweep: 320, 375, 390 and 414 portrait, 812×375 landscape, 768×1024, 1024×768, 1280×900 and 1920×1080. Front page, rich species page and empty My plants were swept; eight named species and an obscure species were inspected at desktop and narrow widths. No document-level horizontal overflow appeared in that sweep. Root text at 200% and dark mode were inspected on the three sweep routes. Narrow layouts initially used a mouse profile; separate 390 px Chromium/WebKit journeys used actual emulated touch/coarse-pointer profiles. These are not physical iPhone or Android tests. Native browser zoom at 200%, safe-area hardware, actual software keyboards and iOS home-screen/storage eviction were not independently exercised.

## What works well

- **Search repairs are visible in production:** peppermint returns Mentha × piperita first; Echeveria peacockii returns E. desmetiana ahead of Dudleya; Bisnaga hamatacantha returns Ferocactus hamatacanthus. The stored hybrid names keep their signs.
- **All eleven merged addresses answered 302** to the intended kept pages. The peacockii destination explains the merge and links the other author's name to Dudleya. Keep this separation between a horticultural merge and a botanical homonym.
- The live index, its climate categories and the displayed homepage categories agree: **48,357 = 37,727 climate known + 9,711 no climate + 919 not checked**. One unlisted old dossier tested (`g2695104`) answered 404.
- The source-status vocabulary is materially better. Avoid turning a lack of data into “none”, and retain the single prominent unchecked explanation. Lithops lesliei's missing climate has an explicit precision reason, not an invented growing climate.
- All **1,531 raw photograph records in the 61-dossier sample** use one of the allowed licence tags and contain an attribution string. This verifies stored metadata shape, not every image's identity, actual licence or missing-author provenance. The old bare-CC0 display handling has a real fix and tested fallback.
- The maps survive in HTML, the chart has a meaningful description, and coastline geometry is referenced as static assets. The page-weight work is real even though the total-size claim differs.
- The new batch's sowing appears as its first log entry. A manual seed journey produced 20 sown, 12 germinated (60%), five numbered plants and seven remaining, with linked labels. The first cuttings wording is addressed in the round-82 tests.
- Adding 30 same-species plants via quantity completed in all three engines. This is useful for batches; it is not a substitute for a timed exercise entering 30 distinct mixed names.
- Local sync transferred a plant and its photograph between two isolated browser profiles. The page showed Synced/zero waiting changes; a second plant transferred back. An old backup correctly offered no merge because its contents were already present; Replace warned about the newer plant and returned to the earlier one-plant collection with syncing off.
- The staged Replace/Web Lock tests are substantially stronger than the prior implementation, and the log/snapshot recovery tests are extensive. Keep those safeguards while resolving the authoritative-ledger claim.
- Fonts are self-hosted; no third-party script was found in the inspected network trace. Live vault GET returned 405, malformed null POST 400, and a foreign-origin null POST 403, without creating a vault. Species CSP contains `object-src 'none'`, with constrained image origins.

The strongest visual improvement to make first is the species introduction. In `phone-haworthia-cooperi.png`, the identification card covers the lower part of the habitat photograph while the dark credit panel covers its upper part; the main subject is confined to the strip between them. The Echeveria lead shows several nursery rosettes and background clutter rather than a clear single specimen. Neither observation establishes a wrong identification, and no claim is made that every alternative photo is better. The dark Sempervivum capture keeps a consistent green/charcoal palette and legible card hierarchy. Preserve the serif species names and restrained palette; reduce overlapping image furniture, keep credits readable outside the crop where possible, and prioritize the compact habitat reading from finding 3. A formal contrast audit of every state was not completed.

## What you checked

### Round 82 follow-up

“Tested” below distinguishes running the repository's tests from an independent live reproduction. A passing implementation test is not a field audit of the entire corpus.

| Prior finding(s) | Result in this audit |
|---|---|
| 1 Replace concurrency | Source inspected; the staged-copy browser tests ran in Chromium/phone and remain in the full engine run. Local Replace recovered the earlier collection. No independent two-tab kill-at-every-copy-point campaign. |
| 2 search ranking | Independently confirmed live for peppermint, genus search and named merges. |
| 3 homonyms | `hom` exists in the live index; Annona query spot-checked; unit/browser regression coverage ran. Not all 1,691 affected pages independently reconciled. |
| 4 shared Kew entry/peacockii | Correct kept page/search/redirect/other-author explanation verified live. No whole-corpus Kew-entry uniqueness scan of 48,357 full dossiers. |
| 5 FUZZY hotfix and revert | Read the round-82 explanation and source; passing unit suite includes the restored same-species-match rules. No independent re-identification of all 42 taxa. |
| 6 Wikidata wording | Source/about explanation inspected; no exhaustive reread of source identifiers. |
| 7 rows with no reason | Reasons inspected in sample; not a full-corpus scan. |
| 8 service-worker caches | Source caps and browser coverage inspected; source test run includes offline paths. Not a long-lived 200/600-entry physical-device eviction test. |
| 9 IPv4 /24 | Unit suite covers limits; no abusive live load used to exhaust an address/network quota. |
| 10 unchecked repeated; 11 climate categories | Display/source tests ran; live category arithmetic confirmed. |
| 12 map labels/scale | Present in live map/source; accessible description association still finding 8. |
| 13 hero selection | New cultivated/landscape rule exists; live Echeveria hero inspected. “Best photograph” not proved by the rule. |
| 14 Undo toast; 15 reminders | Regression tests ran; no independent every-layout/every-error campaign. |
| 16 batch starts at zero entries | Confirmed fixed in manual sowing journey. |
| 17 picker rank words | Live rank search and picker regression coverage inspected. |
| 18 frost bar | Fixed rule/date/red threshold inspected and tested with fixtures. No physical greenhouse forecast journey. |
| 19 scroll-spy; 20 Compare +N; 21 range caption; 22 historical regions | Source and browser regressions checked; exhaustive live cross-species comparison not completed. |
| 23 Papers section | Unasked state and conditional rendering inspected; no claim that absent OpenAlex data became a real negative search. |
| 24 desktop size | The 15 px token is present; captured desktop/narrow typography inspected. |
| 25 keyboard/bar overlap | Regression tests cover viewport/focus handling; real software keyboard not run. |
| 26 / R2-1 author not stated | Display fallback and live metadata materially improved. All-photo primary attribution verification remains incomplete. |
| 27 / R2-2 hybrid names | Live index signs confirmed; formula exclusion code/tests read. |
| 28 inactive iNaturalist ids | Existing follow behaviour covered by the unit suite; not independently queried for every affected taxon. |
| 29 answered source rows | Sample records and source rendering inspected; no whole-corpus display-vs-record reconciliation. |
| 30 NUL; 31 vault GET; 32 compare limits; 33 cookies/CSP; 34 SYNC_OPEN | Source/unit checks; live GET 405 and CSP confirmed. No exploit established. Edge NEL disclosure remains separate finding 6. |
| 35 Peperomia; 36 sentence cut | Unit regressions passed; no primary Wikipedia revision-by-revision audit. |
| 37 sync refusals; 38 pixels/snapshot | Unit/browser regressions and local sync/photo/restore journey; long-running live refusal/retry not tested. |
| 39 sea-floor sentence | Current source/method statement inspected. |
| 40 few-record climates | Ten genuinely thin climates sampled plus a non-thin control. The label exists; it cannot detect the geographically wrong, well-populated Ficus envelope. |
| R2-3 Popular genera | Confirmed live terminology. |
| R2-4 first cuttings; R2-5 rain labels; R2-6 example action; R2-7 phone intro | Source/browser regressions and width inspection. Not every example-keep/leave journey manually repeated on both device classes. |
| R2 TypeError on image failure | The non-function handler guard exists; unit/browser tests ran; no such error observed in the live trace. |

### Round 83 follow-up

| Claim | Evidence and limit |
|---|---|
| Lighter page/static coastlines/reduced hydration | Confirmed one map, static coastline refs and omitted point member on the live rich page; 174,671 decoded HTML bytes measured. Full CWV matrix not obtained. |
| Script-off, hand-over, print, dark and offline parity | Repository `r83w-weight` exercises these paths; independent live visual sweep covered light/dark layouts. No physical printer/iPhone. Final engine results recorded below. |
| Eleven merges and other-author explanation | All eleven redirects independently fetched; search and peacockii explanation confirmed. |
| Shapes | Picea omorika now has a seven-record/five-cell climate; current typical spot passes YUG. Unit suite includes Somalia, Sudan, Palestine, Cyprus and islets. No independent field verification of all 570 islets; old-filter pages can still escape repair (finding 1). |
| Default-point exemption | The actual Queensland survey-plot records queried at −17.872,145.617 state 20 m uncertainty and are eligible for the new exemption. A precision-only input still drops, as the stated rule specifies. No further real, securely located botanical record wrongly dropped by this rule was established. |
| Extremes | Eulychnia's page displays the set-aside state. The rule's mathematical explanation fails the executable counterexample (finding 2). No recount of all 422 affected pages. |
| 18,407 repaired / 34 recovered climates / 8,472 records recovered | Deployment account read. Not independently replayed: the original full bulk download, climate grid and before-corpus backup were not available in this checkout. |
| iNaturalist extensionless URLs | Corrected parser/size code and tests examined. No malformed thumbnail path found among the 41,099 index entries with thumbnails. No independently confirmed additional breaking address shape found; this is not proof against every URL supported by iNaturalist. |
| Dependency delivery | `npm ci` completed; installed lock versions and all unit tests passed, including dependency floors. Five low-severity advisories reported. No production exploit of the deferred cookie dependency established. |

### Tests, systems and limits

Windows **10.0.26200**, Node **24.20.0**, npm **11.19.0**. Playwright engines used independently: Chromium **153.0.8010.12**, Windows WebKit **26.6**, Firefox **155.0**. WebKit on Windows is not Safari running on an iPhone; Chromium touch emulation is not Chrome on a physical Android phone.

`npm ci` succeeded. The first unit attempt preceded a fresh generated build and ran in the restricted environment; it produced widespread failures and a stalled builder child. That attempt was stopped and was not counted as a product regression. After the fresh build and corrected execution environment, **533 unit files passed, one skipped; 4,788 tests passed, 11 skipped** (217.34 s).

`node scripts/predeploy.mjs --browsers=all` built and started its own server on port 4173, using the explicitly installed browser directory. It scheduled **1,909 tests on four workers**. **1,890 passed, 17 skipped, one failed and one flaky (45.4 minutes), strict exit 1**. The early part overlapped the corrected unit run, and independent local journeys also used the server in separate browser profiles; therefore this is not an otherwise idle-machine performance run. The Chromium flowering test failed at its initial Add/navigation assertion, before any flower was recorded, then passed on retry. Ten isolated Chromium repetitions with one worker and no retries subsequently passed (1.2 minutes). WebKit’s clock-correction test failed on both attempts at the initial vault setup, waiting for the Status card, before the clock-shift assertions; an isolated rerun is recorded separately below. The full strict gate remains failed. The first run’s trace folders were cleared when the queued isolated run started before they could be copied; its full textual diagnostics remain. Do not infer a demonstrated clock-math defect from a failure before the clock check. Logs are `browser-results-all.txt`.

Tests that intentionally pass on the old implementation are identifiable: `r83w-weight.spec.ts` **weight 2** explicitly guards map hand-over and accepts either circles or new paths, so it passes if the weight optimization is reverted; weight 1/3/4 are the actual regression tests for the changed behaviour. Likewise unchanged dependency ranges are a guard, not evidence the lockfile was upgraded. This distinction matters, but the presence of a guard is not itself a defective suite.

Some tests assert implementation details: short scoping-class syntax, literal `points:[` absence, exact metadata region count `244`, and exact explanatory strings. Keep a smaller set of such checks beside behavioural tests. The cold-extreme example shows why a test repeating a rule's threshold cannot validate the rule's scientific meaning. Chromium-only cases are explicitly listed in `tests/e2e/helpers/engines.ts`, including CDP throttling/layout-shift and Chrome-profile text sizing; `page.pdf` tests cannot establish Safari printer output. Cross-engine root-font tests do not reproduce native zoom's media-query behaviour.

No reliable complete live LCP/CLS/INP/TBT matrix is supplied. The live browser trace was deliberately serialized at at least 650 ms between outgoing requests, with saved-resource reuse. Those timings would measure the auditor's request pacing as well as the site. The reference fixture is too small to stand in for the production catalogue. Physical mobile hardware, native 200% browser zoom, real software keyboards, persistence eviction, hardware safe areas and home-screen installation remain unchecked. The controlled local collection matrix below is separate from the production reference and does not substitute for the missing live reference measurements.

Live requests used an honest `CultifolioIndependentReview/83` client, at no more than two direct outgoing requests per second. The current index was fetched **once**. **No live sync vaults were created**. Two local test vaults were created across the independent sync attempts; the second run corrected mistaken audit-script expectations around a disabled no-op Merge and Replace's navigation. Those script errors are not product findings. No email, issue, public comment or deployment was made.

### About-page consistency audit

The following are the concrete mismatches established, rather than a claim that every remaining sentence has been certified:

| Statement family | Result |
|---|---|
| Every habitat record passes the advertised native-shape filter | Fails in published output: finding 1. Current builder capability does not prove every dossier was migrated. |
| New percentile-vs-mean test proves inconsistent habitat nights | False inference: finding 2; reword as a labelled screen pending validation. |
| Entire collection state can be recovered from the log alone | Number reservations survive outside the replacement log: finding 5. The snapshot-specific disposable-cache claim is a narrower and well-tested statement. |
| Exhaustive list of outgoing requests/hosts | Omits edge NEL: finding 6. |
| Whole-index caching for five minutes | Live header is four hours: finding 9. |
| Sources, quoted passages, no third-party scripts | Mechanisms and sampled rendering support this; not every quote/source record independently verified. |
| Encrypted sync, bearer-token visibility and lack of revocation | Source and local transfer agree with the disclosure; no cryptographic break found. Server-list completeness remains explicitly a trust assumption. |
| Photographs only from listed image hosts | The inspected trace and index thumbnail hosts agree; NEL is a different request category. |
| Backup/snapshot/Replace formats | Mechanisms and local recovery agree in the exercised cases; the separate reservation ledger needs documentation/invariant work. |

The very long method paragraphs are also hard for a grower to consult. For example, the name-selection paragraph at `about/how/+page.svelte:36` combines common-name ranking, botanical authors, range matching, hybrids and source identifiers. Retain the full rules, but expose a short grower-facing explanation with separate anchored technical rules. This is an evidenced readability concern, not a substitute for a factual finding.

### Owner decisions and simplification

Keep thin climates visible with their sample counts. A small sample is a limitation, not automatic evidence of a wrong climate; a large sample is not proof of a correct one. Add rule/version provenance and mechanical quality checks so the label is not mistaken for the only quality warning.

Darjeeling as India's and omitted islands need to be judged against the scheme and published geometry, not patched by a species anecdote; this audit did not establish another specific error there. A deferred valley-lapse measurement is acceptable only while the page accurately states its present method. Showing contributing/available record counts would help explain cases like Lithops, but it does not repair a wrong contributing set. “Another author” is plainer than a nomenclatural term, and displaying the actual author alongside it is valuable.

The six doubtful popular climates should not receive invented corrections. They also should not be treated as cleared by the absence of a bespoke fix: finding 1 supplies a **general rule violation** that can be repaired uniformly. Old bucket files are not a launch blocker merely because they exist: the tested unlisted id is inaccessible through the dossier API. Prune them after the normal safeguards. No launch blocker was established for the deferred cookie package, omitted HSTS subdomain binding or disabled Workers Logs. Edge NEL is a separate setting/disclosure issue.

Three changes would most reduce the risk of the next bug:

1. **Version the data rules and enforce complete migrations.** Store range/default/precision/extreme rule versions and structured filter counts, rather than deciding repair eligibility from published open points or parsing human prose such as `defaultLeftOut`. A manifest should reject a corpus that purports to use the new rule while retaining old eligible dossiers.
2. **Make authoritative collection state explicit.** Separate disposable snapshots from durable reservations/clock decisions/pixels, then either express the latter in the log or include them in the authoritative format and backup contract. Keep one well-tested Replace state machine and Web Lock boundary.
3. **Test deployment contracts at the boundary.** Check deployed cache/reporting/CSP headers, known merged routes, and representative full-corpus data invariants. Keep realistic behaviour tests for the picker and cross-source climate calculations alongside implementation guards. These catch edge configuration and migration faults that thousands of fixture tests cannot see.

### Isolated reruns and controlled collection performance

The isolated WebKit sync/clock journey passed **2/2 with no retries**, about 24.3 s each (1.3 minutes including build/setup). The isolated Chromium Add/flowering journey passed **10/10 with no retries**. This supports neither a repeatable clock-arithmetic defect nor a clean full launch gate. Independent local sync exercises shared the first full run's server, so cumulative local quotas and workload are possible confounders for its initial-vault failure; that cause was not proved. The traces from the isolated WebKit rerun are retained under `webkit-clock-artifacts/`.

After those runs ended, an otherwise isolated local benchmark used the built app, Chromium touch/desktop profiles, service worker blocked and HTTP resource cache disabled. The phone was 390×844, CPU 4×, network 1.6 Mbps down/750 kbps up with 150 ms latency; desktop was 1280×900 without throttling. Thirty or 400 minimal valid plants were seeded through the existing repository helper; the first measured load had no valid fold snapshot, and later loads could use the snapshot it created. No reference photographs or plant histories were added. Three loads were measured per row. Values are lab observations of this local fixture-backed app, not production CWV or physical-device results.

| My plants | Median LCP | Median CLS | Worst CLS | Median approximate blocking time |
|---|---:|---:|---:|---:|
| Desktop, 30 | 0.364 s | 0.0371 | 0.0382 | 0 ms |
| Desktop, 400 | 0.388 s | 0.0371 | 0.0371 | 0 ms |
| Phone profile, 30 | 2.640 s | 0.0874 | 0.0874 | 0 ms (35 ms maximum) |
| Phone profile, 400 | 2.816 s | 0.0874 | **0.3867** | 136 ms (208 ms maximum) |

LCP and layout shifts were read with buffered PerformanceObservers. Blocking time is the sum of each long task's excess over 50 ms after first contentful paint until the measurement ended, two seconds after network-idle/list arrival. It is an explicit approximation, not Lighthouse's TTI-bounded TBT; INP was not measured. The two extra cold-fold probes produced CLS 0.3867 and approximately 250–278 ms blocking. See finding 4 for the actual shifted elements. The local LCP's footer candidate is another reason not to equate a good LCP number with the useful collection being ready.

In the resource probe the two Newsreader fonts were the largest individual transfers, about **64.8 kB and 58.4 kB**, followed by an app chunk at 33.1 kB compressed/99.9 kB decoded, Public Sans at 27.1 kB, and another app chunk at 21.8 kB. Font delivery and the script critical path dominate this local network sample; cold folding/initial rendering of 200 list rows adds main-thread work. The immediate biggest improvement is stable opening/notice geometry; assess font payload/critical loading and initial row count next, measuring the effect rather than removing the existing fallback-metric safeguards blindly.

Front-page/catalogue, rich-species and not-checked-species production LCP/CLS/INP/TBT remain **unmeasured** under a valid unrestricted browser load. The audit's two-requests-per-second live pacing cannot be silently treated as ordinary user performance.


## Species sample and per-field verdicts

**61 distinct dossiers:** 20 popular/grower-relevant candidates, 15 obscure, ten named hybrids, ten actually thin climates plus one non-thin control, and five kept pages representing merged names. The 20 candidates were chosen by familiar/popular genera and the requested landing pages; their exact rank in the full cultivated-iNaturalist-count ordering was **not independently established**, so this does not meet that stricter selection requirement in full.

The ledger is `species-field-verdicts.csv` / `.json`, with authors, native regions, climate counts/coordinates/elevation/cold/rain, photo counts, source URLs and separate verification limits. Of the initial 60 dossiers, 54 had POWO destinations; all **54 direct requests returned 403**. Six dossiers did not publish a POWO destination; selected accepted names and primary descriptions were checked through web-accessible Kew results instead. The 61st thin-climate supplement was not directly fetched from POWO. No refusal is marked as absence.

**N** = accepted name/author matched a current primary Kew result, not a full June-4 WCVP reconciliation. **I** = internal metadata/rule check only; it is **not** external botanical validation. **U** = unverified against the primary source. **—** = no such content in the dossier. Climate `I (records/cells)` checks the typical cell against the committed shapes; **†** is actually below 12 records or five cells. Licence/author `I / U` means allowed stored licence tags/credit fields, with the actual source licence and author identity still unverified. All 1,531 raw photo records are accounted for, including records the display may exclude; their identity was not individually certified.

This is an honest audit ledger, **not completion of the requested all-fields primary-source validation of 60 species**. That remaining work, especially identification of each displayed photograph, is material to launch confidence.

| Species | Stratum | Name/author | Range | Climate | Photo identity | Licence/author | Links/summary |
|---|---|---|---|---|---|---|---|
| [Aloe vera](https://cultifolio.com/api/dossier/k298116) | grown | N | U | **FAIL** | U (76) | I / U | U / U |
| [Ficus elastica](https://cultifolio.com/api/dossier/k2810307) | grown | U | U | **FAIL** | U (88) | I / U | U / U |
| [Echeveria elegans](https://cultifolio.com/api/dossier/k2781134) | grown | N | U | I (46/29) | U (46) | I / U | U / U |
| [Haworthia cooperi](https://cultifolio.com/api/dossier/k277069) | grown | N | U | I (62/43) | U (51) | I / U | U / U |
| [Lithops lesliei](https://cultifolio.com/api/dossier/k2341111) | grown | N | U | none; U | U (36) | I / U | U / U |
| [Sempervivum tectorum](https://cultifolio.com/api/dossier/k2490030) | grown | U | U | I (1212/982) | U (76) | I / U | U / U |
| [Picea omorika](https://cultifolio.com/api/dossier/k380733) | grown | N | U | I (7/5) † | U (57) | I / U | U / U |
| [Monstera deliciosa](https://cultifolio.com/api/dossier/k129588) | grown | U | U | I (199/139) | U (84) | I / U | U / U |
| [Ferocactus hamatacanthus](https://cultifolio.com/api/dossier/k2808164) | grown | U | U | I (1246/688) | U (63) | I / U | U / U |
| [Crassula ovata](https://cultifolio.com/api/dossier/k2741970) | grown | U | U | I (571/259) | U (94) | I / U | U / U |
| [Dracaena trifasciata](https://cultifolio.com/api/dossier/k525228) | grown | U | U | I (11/10) † | U (74) | I / U | U / U |
| [Mammillaria elongata](https://cultifolio.com/api/dossier/k2360947) | grown | U | U | I (208/87) | U (46) | I / U | U / U |
| [Opuntia ficus-indica](https://cultifolio.com/api/dossier/k2391911) | grown | U | U | I (48/48) | U (119) | I / U | U / U |
| [Schlumbergera truncata](https://cultifolio.com/api/dossier/k2486321) | grown | N | U | I (10/10) † | U (52) | I / U | U / U |
| [Agave americana](https://cultifolio.com/api/dossier/k293578) | grown | U | U | I (116/107) | U (88) | I / U | U / U |
| [Hoya carnosa](https://cultifolio.com/api/dossier/k506676) | grown | U | U | I (828/279) | U (94) | I / U | U / U |
| [Phalaenopsis amabilis](https://cultifolio.com/api/dossier/k151132) | grown | U | U | I (48/45) | U (17) | I / U | U / U |
| [Nepenthes alata](https://cultifolio.com/api/dossier/k2384939) | grown | U | U | I (26/19) | U (17) | I / U | U / U |
| [Zamioculcas zamiifolia](https://cultifolio.com/api/dossier/k215525) | grown | U | U | I (58/42) | U (30) | I / U | U / U |
| [Ceropegia nigra](https://cultifolio.com/api/dossier/k502875) | merged | U | U | I (7/7) † | — | — | U / — |
| [Copiapoa calderana](https://cultifolio.com/api/dossier/k2735922) | merged | U | U | none; U | U (66) | I / U | U / — |
| [Drosera paleacea](https://cultifolio.com/api/dossier/k64497) | merged | U | U | I (557/326) | U (39) | I / U | U / U |
| [Echeveria desmetiana](https://cultifolio.com/api/dossier/k2781125) | merged | U | U | I (26/20) | U (3) | I / U | U / U |
| [Echeveria pinetorum](https://cultifolio.com/api/dossier/k2781299) | merged | U | U | I (6/6) † | U (4) | I / U | U / — |
| [Mentha × dalmatica](https://cultifolio.com/api/dossier/k124605) | hybrid | U | U | I (134/127) | U (1) | I / U | U / — |
| [Nuphar × rubrodisca](https://cultifolio.com/api/dossier/k2383341) | hybrid | U | U | I (128/114) | U (20) | I / U | U / U |
| [Fuchsia × bacillaris](https://cultifolio.com/api/dossier/k2814836) | hybrid | U | U | I (6/6) † | U (6) | I / U | U / U |
| [Aloe × schimperi](https://cultifolio.com/api/dossier/k297951) | hybrid | U | U | I (27/23) | U (9) | I / U | U / — |
| [Robinia × ambigua](https://cultifolio.com/api/dossier/k2428552) | hybrid | U | U | none; U | U (23) | I / U | U / — |
| [Deutzia × wilsonii](https://cultifolio.com/api/dossier/k2763378) | hybrid | U | U | none; U | — | — | U / — |
| [Potentilla × collina](https://cultifolio.com/api/dossier/k2954209) | hybrid | U | U | I (115/98) | U (22) | I / U | U / — |
| [× Butyagrus nabonnandii](https://cultifolio.com/api/dossier/k28180) | hybrid | U | U | none; U | — | — | U / — |
| [Plagianthus × cymosus](https://cultifolio.com/api/dossier/k2546982) | hybrid | U | U | pending; U | — | — | U / — |
| [Euphorbia × curvirama](https://cultifolio.com/api/dossier/k79211) | hybrid | U | U | none; U | U (2) | I / U | U / — |
| [Homalomena pendula](https://cultifolio.com/api/dossier/k100035) | few | U | U | I (3/3) † | — | — | U / — |
| [Huntleya wallisii](https://cultifolio.com/api/dossier/k100847) | few | U | U | I (6/5) † | U (1) | I / U | U / — |
| [Acalypha pendula](https://cultifolio.com/api/dossier/k1013) | few | U | U | I (3/3) † | U (6) | I / U | U / U |
| [Jatropha nudicaulis](https://cultifolio.com/api/dossier/k104784) | few | U | U | I (3/3) † | U (13) | I / U | U / U |
| [Kadua littoralis](https://cultifolio.com/api/dossier/k105470) | few | U | U | I (8/7) † | U (12) | I / U | U / — |
| [Karomia tettensis](https://cultifolio.com/api/dossier/k105596) | few | U | U | I (6/6) † | U (3) | I / U | U / — |
| [Kefersteinia ocellata](https://cultifolio.com/api/dossier/k105750) | few | U | U | I (3/3) † | — | — | U / — |
| [Kefersteinia tolimensis](https://cultifolio.com/api/dossier/k105769) | few | U | U | I (29/23) | U (25) | I / U | U / — |
| [Anthurium acaule](https://cultifolio.com/api/dossier/k10582) | few | U | U | I (3/3) † | U (5) | I / U | U / U |
| [Kerriodoxa elegans](https://cultifolio.com/api/dossier/k105915) | few | U | U | I (9/5) † | U (22) | I / U | U / U |
| [Ceropegia ananthapuramensis](https://cultifolio.com/api/dossier/g11144626) | obscure | U | U | none; U | — | — | U / — |
| [Conophytum tomasii](https://cultifolio.com/api/dossier/g3702919) | obscure | U | U | none; U | — | — | U / — |
| [Cyphostemma degraerii](https://cultifolio.com/api/dossier/g4052359) | obscure | U | U | none; U | — | — | U / — |
| [Albuca longifolia](https://cultifolio.com/api/dossier/g7570556) | obscure | U | U | none; U | — | — | U / — |
| [Ceropegia marnierana](https://cultifolio.com/api/dossier/g9449818) | obscure | U | U | none; U | — | — | U / — |
| [Kopsia teoi](https://cultifolio.com/api/dossier/k106358) | obscure | U | U | none; U | — | — | U / — |
| [Lagenandra lancifolia](https://cultifolio.com/api/dossier/k107214) | obscure | U | U | none; U | — | — | U / — |
| [Lavandula × heterophylla](https://cultifolio.com/api/dossier/k109025) | obscure | U | U | none; U | — | — | U / — |
| [Lepanthes chelonion](https://cultifolio.com/api/dossier/k109777) | obscure | U | U | none; U | — | — | U / — |
| [Lepanthes domingensis](https://cultifolio.com/api/dossier/k109906) | obscure | U | U | none; U | — | — | U / — |
| [Licuala rumphii](https://cultifolio.com/api/dossier/k112254) | obscure | U | U | none; U | — | — | U / — |
| [Licuala sallehana](https://cultifolio.com/api/dossier/k112256) | obscure | U | U | none; U | — | — | U / — |
| [Lycaste × michelii](https://cultifolio.com/api/dossier/k115805) | obscure | U | U | none; U | — | — | U / — |
| [Magnolia annamensis](https://cultifolio.com/api/dossier/k117445) | obscure | U | U | none; U | — | — | U / — |
| [Magnolia wolfii](https://cultifolio.com/api/dossier/k117901) | obscure | U | U | I (5/4) † | — | — | U / U |
| [Kroenleinia grusonii](https://cultifolio.com/api/dossier/k3015166) | grown | U | U | I (13/12) | U (29) | I / U | U / U |
| [Acharagma roseanum](https://cultifolio.com/api/dossier/k2617227) | few | U | U | I (3/3) † | U (12) | I / U | U / U |
