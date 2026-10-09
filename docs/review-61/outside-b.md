# Outside review B of round sixty-one

The independent outside review, received 8 October 2026. Kept as received, less one section on material outside the repository; its links to the reviewer's own checkout are written as repository paths.

---

Independent review of round sixty-one

Reviewed 7 October 2026. Source checkout: **7cb718a**, detached, with no production changes. Live corpus: **8,947 species, 1,321 genera**, manifest **f9598038eaed32cb**, 32 buckets. The live page named build **c124cdRp**; the separately built local checkout named **BP3Pw_Ne**. A live observation below is an observation of that deployed build, not proof of its Git SHA.

I used the triage, round account including its merge and deploy sections, self-review and area reports, engineering log and deployment notes as the checklist. The important departures (the removal of the phone feature cards and the preservation of proper-noun capitals in common names) are disclosed. I do not report those departures, or the acknowledged stalled photo DELETE race, as new defects.

There are **14 findings: 13 confirmed and one suspected**. "Confirmed" includes a reproduction against the real collection/vault over fake IndexedDB, a browser reproduction, or explicitly identified fault injection into the server's storage stand-in. It does not mean every case was reproduced against Cloudflare production. Ordering starts with things a visitor or grower can encounter, then the data and protocol seams.

## Public pages and search

### 1. Confirmed: the real phone landing page still does not show a catalogue row

**Where:** front page, `src/routes/+page.svelte:665`, particularly the welcome, photograph strip and controls before `.grow`; the round account's first-screen claim, `docs/REVIEW-ROUND-61.md:59`. Request: `GET https://cultifolio.com/`.

**Actual:** In a fresh Chrome context at 390×844, the search starts at y=701.5, the first catalogue row at y=1029.7, and the fixed tab bar at y=787. The first screen ends with the grouping controls, without a row. The screenshot agrees with the measurements. Removing the feature cards did not make the claim hold for the real corpus and photograph strip.

**Expected:** The search and at least one usable catalogue row above the tab bar, as the round says. The deliberate removal of the feature cards is reasonable; this is the remaining failure of its stated result.

**Checked:** Installed Chrome, cold context, service workers blocked, 4× CPU and approximately 1.6 Mbps download/750 kbps upload with 150 ms latency. Hydration took 3.42 s in this single run. At 1280 px, the search is visible at y=640; the feature follows it, and the first row is at y=1492. The fixture first-screen test cannot establish the live result.

**Smallest fix:** On phones, shorten the introductory block and cap the strip's total height enough to fit a complete row, including all grouping controls. Add a first-screen assertion against a representative real-corpus response and real strip dimensions. Do not put the four cards back into this space.

### 2. Confirmed: a common-name word is still silently discarded as authorship

**Where:** `cleanQuery`, `src/lib/core/search.ts:108`.

**Actual:** `cleanQuery('Black eyed Susan')` becomes `['Black','eyed']`; `cleanQuery('black eyed susan')` keeps all three words. Live `/api/search?q=Black%20eyed%20Susan` returns Rudbeckia hirta, R. subtomentosa, Thunbergia alata **and Vigna unguiculata, Black-eyed Pea**. The lowercase query returns the first three, without Vigna. Neither answer carries `X-Search-Relaxed`. Four letters prevented "of" from being mistaken for an epithet, but "eyed" still qualifies, so Susan is treated as an author.

**Expected:** Capitalization of the same common name should not change its meaning or silently remove the distinguishing word. If a query is broadened, say which words were used.

**Checked:** Live requests above, and an independent unit assertion. "String of Pearls" is fixed and returns Curio rowleyanus alone.

**Smallest fix:** Try the complete token sequence against common-name postings before applying the botanical-author heuristic. Keep author stripping for a botanical-name interpretation, rather than applying it to every phrase. Return a broadening indication whenever meaningful words were removed.

Additional probes: `Cornus mas Linnaeus` is retried as "Cornus mas"; `St. Johns Wort` finds Hypericum; `×Gasteraloe` gives no hits. `Aloe x spinosissima` gives Rosa spinosissima, and unquoted `Echeveria Lola` gives E. lilacina and E. lozanoi through approximate matching without a retry notice. These demonstrate why a visible distinction between an exact name and a similar spelling would help; I do not treat those search results as taxonomic identifications.

## Plant records, Today and import

### 3. Confirmed: the add picker preserves an unknown variety but assigns its parent's key; qualifier lookup also differs from the promised rule

**Where:** the picker's pick, `src/lib/ui/SpeciesPicker.svelte:121`; `pickedName`, `src/lib/ui/picked-name.ts:12`; the name-service lookup, `src/lib/ui/SpeciesPicker.svelte:95`. The import's contrasting rule is in `checkNames`, `src/lib/import/check.ts:39`.

**Actual:** Type `Copiapoa cinerea var. invented`, then pick a species-rank suggestion "Copiapoa cinerea". The field correctly retains the variety, but `pick` unconditionally assigns the suggestion's key. Adding stores `taxonName: 'Copiapoa cinerea var. invented'` with `taxonKey: 5384013`, the species' key. The import deliberately keeps no key for that below-species name. Separately, typing `Copiapoa cf. cinerea` sends `/api/names?q=Copiapoa%20cf.%20cinerea`, rather than asking about the species part only as the round claims for the add form.

**Expected:** Keeping a qualifier or unmatched variety must preserve its uncertainty. A parent's reference page can be offered without claiming that its key identifies the entire typed name. The import and add form should use the same distinction between "reference has the species" and "this exact name resolved".

**Checked:** Browser against the built app, with a controlled `/api/names` species suggestion; inspected the saved changes directly. The controlled response tests the picker's handling of a valid suggestion, not whether GBIF would return it for this exact request today. The qualifier request was captured from the browser.

**Smallest fix:** Assign a key only when the retained scientific name matches the picked taxon's rank/name. Preserve the typed tail with `null` key otherwise. For qualifiers, look up `speciesOf(value)` while retaining the qualifier and show "compared species is in the reference; no identification key filed".

### 4. Confirmed: a corrected device still gets different photo counts on the home line and its linked list

**Where:** Today's home lines, `src/lib/ui/Today.svelte:44`, and the plants list, `src/routes/plants/+page.svelte:112`.

**Actual:** Today explicitly passes `new Date()` to `photoDueDays`; the list calls `photoDueDays()` and therefore uses `nowMs()`. With a one-year-fast browser and a valid stored negative correction, my fixture has twenty old plants, ten with photo records dated August 2026, and one newly added plant. The home line says **21 of 21** without a photograph in twelve months; its link lists **10 of 21**. It also ages the newly acquired plant into the count. This is a new clock-sensitive counterexample to the shared-rule fix, not the old uncorrected 33/297 case.

**Expected:** Both surfaces use the corrected date, and agree. They should also update across midnight and a clock correction rather than keeping page-construction cutoffs.

**Checked:** Built app in Chrome; injected photo metadata and plants through IndexedDB with arrival rows and a generation invalidation, then installed the clock shift and correction before each load.

**Smallest fix:** Remove the raw `new Date()` override. Derive both cutoffs from the shared corrected day store, including its clock-change notification.

### 5. Confirmed: partial dates make an uncertain six-month age look certain

**Where:** `photoDue`, `src/lib/ui/photo-due.ts:28`; the documented rule, `src/routes/about/formats/+page.svelte:62`.

**Actual:** The acquired value is compared lexically with a full cutoff. With today 7 October 2026, cutoff `2026-04-07`, acquired `2026`, no photo and a record made 1 October, `photoDue` returns true. The plant may have been acquired last week; the input states only the year. Likewise `2026-04` sorts before `2026-04-07`, although it could mean 30 April. This does not erase the input, but derives an age the precision does not establish.

**Expected:** "Had six months or more" only when the recorded precision establishes that threshold; otherwise the age is undecided. Rule 3 rules out silently using the beginning of a partial period.

**Checked:** Independent unit reproduction using the real function and explicit cutoffs. Spending by year correctly uses the stated year; that is a different question and is sound.

**Smallest fix:** Compare the latest possible day in a partial period against the cutoff when determining whether the age is certainly at least six months. Keep the stored partial date unchanged; do not invent an acquisition day. Test both ends of the cutoff month/year.

### 6. Confirmed: restarting a partially written Qty row can skip plants never imported

**Where:** the per-plant import path, `src/lib/import/commit.ts:112`; the partial result, `commit.ts:137`; restart detection, `src/lib/import/plan.ts:117`.

**Actual:** Import `number,species,Qty,acquired` / `2024-0001,Copiapoa cinerea,3,2024`. A year-only date causes this row to use the separate-plant path: `mintYear` recognizes only a year followed by a hyphen. Refuse the second claiming write. One plant lands and `partial.written` is 1. Reread the original file after reload: finding that first number under the same name marks the **whole Qty=3 row** already imported and dropped. Two plants never landed. Retrying without leaving the current page is sound because its in-memory row is reduced to Qty=2; the failure is the promised restart after that memory is gone.

**Expected:** A restart offers the two missing plants, not a skipped row or three more plants. The visible warning provides an override, but "Add them anyway" still cannot reconstruct the missing quantity automatically.

**Checked:** Real collection and fake IndexedDB; second `appendChangesClaiming` fault injected. Asserted one saved plant, a partial result, then the reread row's `drop:true`.

**Smallest fix:** First make `mintYear` recognize `YYYY`, matching the collection's changed minting rule; this specific row should be atomic. For the remaining separate-plant path, retain explicit per-row completion evidence, or offer a quantity reconciliation on restart. A match on the first number is insufficient evidence of a whole row's completion. This is a new reason for an import-operation identity, rather than a generic request for operation IDs.

## Clock, fold and backup

### 7. Confirmed: backup export makes a temporary clock park permanent on restore

**Where:** `prepareBackup`, `src/lib/backup/io.ts:28`; merge restore, `io.ts:128`; the collection's distinction, `src/lib/db/collection.svelte.ts:200`.

**Actual:** Load a peer's file change 2.5 days ahead, with no batch arrival; confirm the clock and rebuild. It is parked for this load, but IndexedDB `meta.parked` remains empty: the new rule works there. `prepareBackup` exports **all `collection.parkedStamps`**, including that temporary verdict. Read the zip and merge into an empty vault: its manifest carries the stamp, and `restoreBackup` calls `markParked`, persisting it in `meta.parked`. It no longer comes due automatically when time catches up. Replace also installs the manifest's parked set.

**Expected:** Only stored arrival/file verdicts go into the backup's authoritative parked set. Clock-only readings remain droppable and are re-evaluated after restore. "No device keeps a verdict of its own clock alone" must also hold through export.

**Checked:** Actual `prepareBackup → zip → openBackup → restoreBackup('merge')`, real vault over fake IndexedDB.

**Smallest fix:** Expose the collection's stored parked set for backup export; export that, not the union used by the current UI. Add merge and replace guards asserting that a clock-only exclusion is not converted into a stored verdict. Do not simply drop all parked stamps, which would discard genuine arrival judgments.

### 8. Confirmed: marked edits are wire-compatible with round sixty but semantically incompatible

**Where:** mark exemptions, `src/lib/core/log.ts:208`; the unchanged log-batch version, `src/lib/sync/limits.ts:24`; round sixty's intake, `src/lib/sync/engine.svelte.ts:766` at round sixty.

**Actual:** Round sixty accepts the same marked change through `readChanges` with no dropped rows. Given an arrival now and a marked year-ahead notes edit, round sixty parks it; round sixty-one applies it. Applying identical before/after changes through the two actual `apply` functions produces **"before" on round sixty and "after" on round sixty-one**. The ciphertext batch remains `v:1`, so the old engine does not set it aside as a newer format. Snapshot rules 5/6 do not protect the wire. An old tab is allowed to remain open while its form is being worked on; the layout postpones reload until navigation, while sync can still run.

**Expected:** Either compatible readers agree, or the old reader recognizes an unsupported semantic version and preserves the bundle without pretending to have applied it. "Every device reads the same flag" is true only of updated devices.

**Checked:** A mixed-build test compares round sixty-one with a sibling checkout at 21257b7. Parsing succeeds on the old build; the folds disagree. I did not simulate a complete mixed-version service-worker rollout in browsers.

**Smallest fix:** Version batches carrying the new semantics so old readers quarantine them, and let current readers accept both versions. Apply the same compatibility policy to backups. Suspend sync while a known incompatible old shell awaits its safe reload. Changing only FOLD_RULES cannot make an old wire reader agree.

### 9. Confirmed: ordinary elapsed time lapses a valid slow-clock correction

**Where:** `overtaken`, `src/lib/core/hlc.ts:100`, and the lapse, `hlc.ts:117`.

**Actual:** Correct a device six minutes slow at true local 23:59. Advance its wall clock and `performance.now()` equally by six minutes. No clock moved relative to the monotonic reference. Nevertheless, its wall clock has reached the *old reading's* server time, so the +6 minute correction is removed and the clock becomes unchecked. True time is 00:05; `localDate()` now returns yesterday, 23:59. A later server reading restores the correction. Sleep on a platform whose performance clock pauses can cause a second unnecessary lapse through the drift check.

**Expected:** An open tab with equal wall/monotonic elapsed time retains its valid correction. Normal time passing does not make an unchanged offset inaccurate. The five-minute exemption merely moves the discontinuity to corrections just above five minutes.

**Checked:** Independent Date/performance-controlled test, including the date across midnight. This is **implemented as triaged**; the problem is the chosen inference, not a missing change. A sync every five minutes normally refreshes a six-minute correction before the threshold; offline periods, backgrounding or failed readings expose it.

**Smallest fix:** Within a tab, use actual drift against the monotonic reference to decide whether the clock moved, rather than the absolute old server timestamp. Across reloads, distinguish "cannot establish that the old correction is still valid" from proof that it is wrong, and document the offline limitation. A paused performance clock also needs a resumption policy before stamps/dates are trusted.

**Other mark probes:** A key-holding peer can set the bit on every far-future change and bypass both holds and arrival parking. I reproduced the exemptions. That peer already has authority to change collection contents; this is not an unauthorized-access finding. It is a trust limitation: the bit asserts how a stamp was made, without proving it. A blind normal-time edit can then lose to the injected far stamp, whereas the unmarked version would be parked. A reader which has seen the far field can still edit past it, so this does **not** make a field uneditable for a year. A separate predecessor/real-time representation would better separate causal ordering from a claimed wall clock. Natural ticking can mathematically reach the bit after 8,388,608 increments at one logical wall; this is not a practical greenhouse rate, and I did not run that many ticks. `hlcAfter`, saturation and `Clock.observe` preserve or isolate the marker as their dedicated tests require.

## Server accounting

### 10. Confirmed by fault injection: an interrupted reclaim permanently loses its decrement

**Where:** the sweep's deletions, `src/lib/server/counters.ts:411`, accumulation at 414, and the total update at 422–432.

**Actual:** Start with `all:1` and one old `f:V`. The sweep deletes `f:V`, then later subtracts its count from `all`. Inject a storage failure before that total write. The durable state is now `all:1`, no `f:V`. Rerunning the sweep cannot find the deleted evidence and leaves `all:1` forever. This is worse than being wrong for one day. Repeated interrupted sweeps can consume capacity with no counted places left to reclaim.

**Expected:** Giving a place back and decrementing the ceiling total happen together, or leave a durable pending decrement that a retry can finish.

**Checked:** Actual Counters class with its paged-storage stand-in; throw on the `all` put after the old entry has been deleted, restore storage, run again. This reproduces the storage-operation sequence, not a live Cloudflare termination. The source does not wrap these operations in an explicit storage transaction.

**Smallest fix:** Reclaim each bounded page in one transaction: delete its selected `f:` keys and update `all` together, with the cursor. Apply the same discipline to an expired lease's deletion and stale-count marking. Paging is sound under a completed run; crash consistency is the missing part.

### 11. Confirmed by fault injection: a reclaimed vault can upload unadmitted when the counter cannot answer

**Where:** `touchVault`, `src/lib/server/sync.ts:1002`, the catch at 1012 and the unavailable return at 1016.

**Actual:** Reclaimed vaults retain `filled:true` in R2. Unlike a first upload, their admission path treats an unavailable `touch` as best-effort and lets the upload proceed. Set `all:2000`, omit this reclaimed vault's `f:` key, and make its touch RPC throw. `storeOnce` returns `stored`; the photograph is in R2 and there is still no place entry. "Already filled" no longer proves it occupies a place after this round's reclaim.

**Expected:** When a vault may have been reclaimed, its next write needs a checked place. An unavailable counter is not evidence that it still has one. Reading existing ciphertext should remain possible.

**Checked:** Real storage path, fake R2 and counter namespace; only the vault-admission touch is fault injected. The byte/hold objects continue to work. This is a controlled server reproduction, not an attempt to fill production's 2,000 places.

**Smallest fix:** Fail closed with VaultUnchecked for an unverified touch, including `unavailable`. If avoiding transient refusals for recently verified vaults is important, retain explicit valid admission evidence; the historical `filled` bit cannot serve that purpose.

## Documentation and harness

### 12. Confirmed: the formats page still states the old restore rule and an incorrect counter-width rule

**Where:** the HLC description, `src/routes/about/formats/+page.svelte:24`, and the record/restore description, `formats/+page.svelte:27`, against restore, `src/lib/db/collection.svelte.ts:1472`.

**Actual:** The first paragraph says the hex counter widens beyond four digits only when a millisecond holds over 65,535 changes. One `hlcPast` already produces a six-digit marked counter. Later text explains the mark, but the earlier exclusive statement is false. Restore is described as yielding only to a record **created after removal**; the new code judges when its first stamp **reached this device**. The adopted test explicitly covers a peer plant made before the removal but arriving after it, and expects the restored plant to yield. Unknown arrival order leaves a shared number, also worth saying in this paragraph.

**Expected:** The format should name both reasons for a wider counter and describe arrival here, not an inference about when another device created the plant.

**Checked:** Actual marker assertions and the adopted restore-skew test in the passing suites, paired with the published source paragraphs. The about seam test checks selected sentences and key presence, not these semantics. Findings 4 and 7 add two further contradictions to the formats promises.

**Smallest fix:** Correct these two sentences and extend the seam guard with semantic fixtures: one marked change, one plant born earlier but received later, and one record without order-store history.

### 13. Suspected: several browser seed helpers still race the first snapshot

**Where:** the public-page inject helper, `tests/e2e/r61w-pages.spec.ts:37`, and the accessibility helper, `tests/e2e/r61a-a11y.spec.ts:25`.

**Actual:** W's helper writes only `changes` and deletes `fold`; it writes no arrival rows and does not increment foldGen. A's helper repeats the delete after 500 ms, still without either protection. If the first load captured an empty fold and its write lands after the final deletion, writeFold can accept it under the unchanged generation/frontier. On reload, the injected changes have no tail arrivals, so a snapshot can omit them. A fixed half-second delay is not a proof that the writer settled. L's newer helper does add order rows; it is not the same omission.

**Expected:** Injected rows follow the same arrival and invalidation contract as real writes; test correctness must not depend on the initial fold winning or losing a timing race.

**Checked:** Source ordering and the real writeFold acceptance conditions. I did not force this exact late-write interleaving in these helpers, so this is suspected. The full run's shared-number test retried, but that alone does not establish this race as its cause.

**Smallest fix:** Share one seed helper using the vault's write contract, including arrival rows and generation invalidation. Better, expose a test-only bridge to `appendChanges`. Remove the timed second delete once there is a transactional invariant.

### 14. Confirmed: the default browser suite does not pass in this Windows environment for two harness assumptions

**Where:** the font-profile test, `tests/e2e/smoke.spec.ts:3554`, its equivalent in `tests/e2e/r61w-pages.spec.ts:165`, and the photo-flow precondition, `tests/e2e/smoke.spec.ts:366`.

**Actual:** The default bundled browser reads 16 px after the tests install a profile preference for 32 px, so both tests fail before checking layout. Both pass with installed Chrome. The photo flow fails twice because it first requires a reference hero image to load; the app instead truthfully says "The reference's photograph did not load", and the own-photo test never reaches its upload steps.

**Expected:** Tests either select a browser that demonstrably supports the preference, or clearly separate unsupported test setup from reflow failure. An own-photo round trip should not depend on an outside reference image being available.

**Checked:** Full default suite and explicit Chrome rerun of both font tests. The failure contexts show the missing hero and the honest fallback. These observations do not establish a production reflow or photo-save bug.

**Smallest fix:** Pin/document the browser for the real preference test and assert its setup separately. Supply a deterministic real-image fixture for the hero expectation, or begin the own-photo test from the already available Add a photo control. Keep separate coverage of the image-failure fallback.

## Triage decisions checked

This is the decision-by-decision result, not a claim that every possible interleaving has been exhausted.

| Decision | Found done | Remaining qualification |
|---|---|---|
| 1 Clock | Own-arrival judgment, removal of staleOwn, marked stamp operations, Apply on a parked restore, in-memory clock parks, FOLD_RULES 6 and guard coverage. Adopted fuzz passes; extended real-engine case passes twenty rounds with a lost push reply. | Findings 7–9. The bit is a trusted assertion, and older clients do not share its meaning. |
| 2 Records | Keyed plant/batch/place layouts, id-first removed labels, id links and parent identity. Arrival-order restore and unknown-order fallback are implemented. | Formats still describes creation order, finding 12. Complete mixed-version rollout/photo-upload navigation was not independently exercised. |
| 3 Import | Unmapped columns, Qty, Genus+Species, received name, preserved notes, partial/unambiguous dates, sheet-wide ambiguity choice, parsing errors, literal place matching, frozen plan, leave guard, caught prelude errors, review filter and sheet watering. | Add-picker seam, finding 3; partial-date downstream age, finding 5; partial Qty restart, finding 6. Same-number/same-name rows can be genuinely different plants; the UI says "looks" and offers an override, so the heuristic is not proof of identity. |
| 4 Labels | Saved stock/options, zero print padding, code-point clipping and direction/control removal, per-code isolation, print-hidden banners. | Three Chrome PDF samples only; no physical printer, Firefox or Safari print run. |
| 5 Photos | Claims alone; matching proof for claims; proof checked first; 409 hourly retry; renewed hold and re-HEAD. Mutation catches restoring R2-uploaded ordering. | The expected-fail stalled DELETE race remains deliberately deferred. I make no new case against it here. |
| 6 Server | Recount retry's generation check, leases, failed-first admission handling, shared service caps and /48 allowance, NWS charging, held wording, persisted 503, paged sweep and redirect headers. | Reclaim crash consistency and unavailable-touch admission, findings 10–11. |
| 7 Search | String of Pearls, hybrid-marker handling, dotted author citations, no retried picker suggestions, typed variety preserved, code-point cuts, common-name rule and alternative search. | Findings 2–3. Case preservation departed from triage openly; it is not an undisclosed omission. |
| 8 Words/about | Own figure labels, record low, CHELSA caption, hero credit, tied months, hemisphere and climate refusal states; key/host seam guards pass. | Findings 4, 7, 8 and 12 keep the documentation from being wholly true. |
| 9 Front page | Desktop photographs/search precede the feature; feature only plain home; phone feature removed for a disclosed reason; sample offer comes first. | Real first-screen result fails, finding 1. Desktop grouping chips still govern rows below an unchanged feature; keeping the chips with those rows would clarify their scope. |
| 10 Sample | Scoped settings/session copies, no setting cookie writes, locked pages with headings, one seed commit, guarded sync/restore/staging, Web Locks/BroadcastChannel lifecycle. The adopted multi-tab tests pass. | Without Web Locks the code deliberately retains an orphan sample rather than risk deleting an active one; "deleted on any outside load" needs that qualification. Shared reference/forecast caches are droppable public data, not a collection-log leak found here. |
| 11 Accessibility/performance | Toast focus/Tab changes, mounted sentence region, direct grow imports, forced colors, static short-height bars, move starts empty, archive Undo and 50-chip paging. | Default harness setup failures, findings 13–14. Axe/DOM checks do not establish spoken screen-reader behavior. |
| 12 Grower | Place filter and Select these, plain sync words, spending per written currency, foreign label heading, calendar restarts/alarms/all-dry exclusion, Also today visibility, settled persistence toast. | Corrected-clock photo count still differs, finding 4. Archive Undo remains two commits; a peer update can appear between them, and failure can leave status restored but its archive line present. I found no new lost-record counterexample requiring the deferred general undo history. |
| 13 Harness | Adopted guards/reproductions, three useful mutations caught, clock-derived year/port, timeouts and many settled-operation waits. Full unit run with a January 2027 clock passes. | Findings 13–14; the bundle guard still needs a post-build gate, below. |

## Other probes found sound, and limits

- **Today walk:** twenty plants across Greenhouse, Bench 1, its Shelf, Bench 2, and No place. Due stops appeared in that depth-first order, No place last. The independent browser seeding honors arrivals and foldGen. The adopted suite covers repeated Water, focus, Undo, archive, move and 50-chip paging; I did not manually reenact every two-stop/Undo/sync permutation.
- **Unavailable sheets:** `sheetsFor` has ten-second request aborts, including the separate corpus read; an unresponsive cold corpus followed by a sheet request can therefore take roughly twenty seconds. Today eventually releases its first-read gate on failure. It does not wait forever in this code path. After failure it cannot know habitat rest; a visible "habitat seasons not checked" beside bulk watering would make that limitation clearer.
- **Accessibility:** twelve axe scans across plant, Today, import and labels, in light/dark/forced colors, plus the sample plants view, returned no selected WCAG A/AA violations. Forty-eight viewport/text cases (390×844, 1280×900, 320×700 at 200% root text, 320×225 as a short reflow proxy) had no sideways overflow. This proxy is not a physical 400% browser-zoom run. The two browser-preference tests passed in Chrome. No NVDA/VoiceOver session was performed; live-region announcement timing remains unverified.
- **Printing:** Chrome PDF at scale 1, CSS paper size, for Avery 5160, 5167 and L7160. Measured paper widths 816, 816 and 793.69 CSS px, left edge 0; label sizes respectively 252×96, 168×48 and 240×144 px. No tested banner printed. This does not certify printer margins or other browser print engines.
- **Calendar:** A generated file with daily rhythm and four dry months: three wet-run series, three DISPLAY alarms, DATE-valued starts/ends/UNTIL, and physical lines no longer than 75 UTF-8 bytes. These agree with RFC 5545 §§3.1, 3.3.10 and 3.8.6.3: a DATE event's relative trigger uses midnight in the user's configured zone, making PT9H a 09:00 local alarm. No UTC conversion of the all-day date is needed. I did not import into Google, Apple or Outlook; accepting the file and honoring its alarm are separate client questions.
- **Dates:** Adopted reader tests cover ambiguous day/month ordering, two-digit years, invalid dates, partial dates, unread text preservation and date-choice changes. The plant edit's touched-field write rule avoids erasing an untouched partial acquired value when the date input renders empty. Spending's year test is compatible with year/month precision. Prices such as `US$12`, `1,200.00` or lowercase `usd 12` remain "not read" under the disclosed narrow grammar, rather than guessed; supporting explicit currency aliases would be a useful extension.
- **Own batches:** Source naming uses the last change of the HLC-sorted batch, so an earlier ordinary far stamp cannot hide behind a later lower-wall stamp. ownMax keeps the greatest unmarked wall; the fallback hour is conservative. The real-engine lost-reply/twenty-round reproduction passed. Old-device once-only listing also passes. I did not exhaust all multi-page interruption or same-browser tab interleavings.
- **Common names:** Live Curio rowleyanus shows String-of-Pearls; Gonialoe variegata shows Partridge Breast Aloe, retaining Aloe alternatives; Curio ficoides shows Blue Chalkstick and retains Flatleaf Senecio. Setting back another genus is a disclosed ranking choice, not proof that the alternative is wrong. In these three stored dossiers, **39 vernacular rows, 15 English, zero with preferred/source-count fields**: the new ranking cannot use metadata the old dossiers lack. That sample is not a corpus-wide percentage. I found no demonstrated page/tile disagreement; the shared function and corpus-genus scope are wired. Rebuilding the index alone cannot recover upstream metadata.
- **Caps:** One IPv6 /48 is limited to 240 calls/service/minute, so the old single-/48 600-call attack is closed. Ten distinct IPv4 addresses, or several /48s, can still exhaust the deliberately finite site share. That is a distributed abuse limit, not evidence that the counter is per-isolate again. Held-state propagation guards pass.
- **Deployment:** The rollover loop has a try/time bound, every fetch has a timeout, and the whole live check has a five-minute deadline. A local fresh build caused the initial live check to reject the actual deployed hash; it did not wait forever or falsely pass. With the observed deployed hash explicitly supplied, all **18 live checks** passed with no skips, including forecast, both thumbnail hosts, corpus manifest and photograph weight.

### Better home for the bundle gate

Run checks/unit tests, build, then a dedicated **post-build verification that cannot skip**, then deploy. For example: `check → test → build → verify-built-layout → wrangler deploy → live-check`. The verifier should fail if the current build manifest is missing or its recorded source hash differs, then inspect the layout dependency closure. Source mtimes and `it.skipIf(!fresh)` are useful for an optional unit diagnostic, not a release gate. No deployment was performed in this review.

## What ran

Windows, PowerShell, Node **24.20.0** and **22.23.3**; isolated checkout, dependency installation with npm ci. The Playwright web server built the app and started Wrangler on port 4178. Independent browser probes used a separate Wrangler server on 4179. Production sources were restored after each mutation; the review leaves only review documents, tests, scripts and evidence.

| Run | Result |
|---|---|
| Original full unit suite, Node 24 | 130 files; **1,096 ordinary passes, 2 expected failures, 2 skips = 1,100 tests**, 54.56 s. |
| Original full unit suite, Node 22 | Same counts, 69.89 s. |
| Full suite with 2 January 2027 clock, Node 24 | At that point 131 files, including the first ten independent probes; **1,106 ordinary passes, 2 expected failures, 2 skips = 1,110**, 48.79 s. Later review tests were run separately. |
| Final independent probes, Node 24 | **19 passed** across three files: eleven probes/guards, seven tests in the copied/extended engine harness, one mixed-build comparison. |
| Final independent probes, Node 22 | **19 passed**, matching the final Node 24 probe set; original full suite also passed. |
| Type check | **0 errors, 0 warnings**. |
| Default full Playwright | **175 passed, 1 flaky, 3 failed; 179 tests**, 4.7 min. See exact retries below. |
| Installed-Chrome rerun of two font-profile failures | **2 passed**, no retries, 6.6 s. |
| Live check pinned to observed deployed build | **18 passed**, no skips. |

**Every browser test which retried in the full run:**

1. `r61w-pages.spec.ts:165`, 320 px/200% refusal pills: failed, failed (profile still 16 px).
2. `smoke.spec.ts:357`, photo flow: failed, failed (outside hero did not load; upload never reached).
3. `smoke.spec.ts:3247`, shared-number/no-read-renumber test: failed, **passed**. This is the one flaky test; no cause is established by its retry.
4. `smoke.spec.ts:3554`, browser-text private-page reflow: failed, failed (profile still 16 px).

**Mutation checks:** disabling marked-stamp exemptions failed 1 of 7 clock tests; restoring the R2 uploaded-time decision failed 2 of 9 photo tests (the acknowledged race stayed expected-fail); removing default unmapped-column preservation failed 1 of 14 import tests. Each mutation was restored before subsequent work. These are targeted checks, not a claim that all author mutations were repeated.
