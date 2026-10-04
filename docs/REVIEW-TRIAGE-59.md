# Round 59: three reviews, one plan for round 60

This file combines three reviews of `741180f`, with each finding tagged by where it came from:

- **S:** the self-review, `docs/REVIEW-SELF-59.md`, with its full reports in `docs/review-59/`.
- **A:** the "round forty-two" outside review.
- **B:** the independent outside review, which ran on Windows with Chrome.

I checked the new items from A and B against the code before listing them. Items marked "checked" were confirmed by reading the code at `741180f`.

## Where the three agree

All three found these independently, which makes them the most solid findings:

- The clock's negative age (S1, A2).
- An edit stored and never shown under a wrong clock (S7, A1, B2).
- Links by number opening the wrong plant (S2, A13, B1).
- In-flight bytes that never expire (S P2, A18, B6).
- The vault-ceiling 503 losing its sentence and its backoff (S11, A20, B9).
- Fail-open admission (S, A19, B8).
- The stale DELETE (S P3, A12, B5).
- The snapshot ignoring whether the clock was checked (S P3, A15, B4).
- Commons originals at full size (S13, A7).
- The genus meta and my fallback description claiming a climate (S14, A5).
- Tests that do not guard their fix (S16, A31, B12).
- The e2e steps that still navigate mid-write (S, A34).

A's and B's full suites passed: 533 unit tests on Node 22 and 24, and 103 e2e on Linux; B got 102 plus 1 flaky on Windows. Neither earlier Windows failure came back on B's Windows run.

## New in the outside reviews (checked)

**Reference and words**
- **A24, fixture species served in production.** A manifest whose index is refused, on a fresh isolate with nothing held, sets `parsed = []` and falls through to the fixture index. Production would then serve the three test species (`dossiers.ts:168-171`, checked). It needs a bad upload, but on launch day it would be the first thing anyone sees.
- **A25, a corrected corpus stays blocked.** A remembered refused etag blocks the corrected corpus when the identical manifest is re-put, so warm and fresh isolates serve different corpora.
- **A6, a dossier that fails to load is called absent.** The page answers 404 "No species page", and the error page says the name is not on the list (`species/[slug]/+page.server.ts:67`, checked). Compare does the same. It should be a 503 saying the page could not be read, not cached (rule 2).
- **B11, mutable dossiers cached publicly.** `/api/dossier` reads the mutable `s/v2/<key>.json` and caches it publicly for an hour under the held corpus id, so a mid-refresh dossier is stored under the old id.
- **A27, synonym 404s and compare load their own corpus.**
- **A28, `_clean` slices before normalising.** It cuts at 80 UTF-16 units and then applies NFC, so two spellings of one long query can get different answers.
- **A29, `clip` edge cases.** It can leave a lone surrogate, and it drops a word that fitted when the 155th character is a space.
- **A30, page cache bypass.** `/%73pecies/x` is not held, because the test reads the raw path.
- **A9, extremes with no source.** The climograph's extremes caption, edge labels and description sentence don't name NASA POWER (rule 1).
- **A G, uncredited photographs.** Front-page, Related and compare photographs show no author or licence, though `/about/how` says each carries both (rule 1).
- **A G, cached requests missing from the privacy list.** `/about/how`'s "what the server keeps" omits the edge cache: forecasts by coordinates for an hour, searches for a day.
- **A G, "No rainy season: 70% of the rain takes N months".** Eight wet months can be a long rainy season; the rule reads "no short season".
- **A G, smaller wording:**
  - "N species with their native range" overclaims.
  - Today says "growing months the species sheet names", "the habitat's rest" and "dry season" under the cooler-half rule.
  - POWER cells are 0.5° × 0.625°, not 0.5°.
- **A3, two requests missing from the privacy list.** SvelteKit's `/_app/version.json` poll every 5 minutes (`svelte.config.js:15`, checked) and the service worker's update fetch. `/about/how` says its list is "this list and nothing else".
- **B10, a fourth photo host.** `static.inaturalist.org` is a supported host that `shownAt` passes through, and `/about/how` names three.
- **A23, `/about/formats` on the vault ceiling.** It says a 503 answers only "a creation", that "joining an existing vault is never refused", and that the sync page shows the sentence as it is. All three are false for `VaultsClosed`.

**Collection**
- **A14, Undo renumbers the wrong plant.** Undoing a removal renumbers the restored plant even when the other plant held the number before the removal (`collection.svelte.ts:1355`, checked). It reverses the "recorded first keeps it" plan in two writes. It should yield only when the other plant was born after the removal stamp.
- **B3, the clock policy and its account disagree.** On an unchecked clock, `isHeld` still holds peer changes; only parking is gated. The round's "before that, everything folds" is false. The decision below keeps holding and says so.
- **A16, notes after a parked base.** A notes edit whose base is a parked stamp lists the wrong text as replaced unseen.
- **A17, the clock line is late and can be wrong.**
  - It runs only after load, catch-up and rebuild.
  - After a fast clock is corrected, it tells the grower to fix a clock that is right.
  - "Nothing is lost" is false.
  - The unchecked state is never shown.

**Server**
- **B7, a stale listing erases a landed upload's charge.** A listing taken before an upload lands, committed through `setBytes` after `release`, wipes that upload's charge.
- **B8, an admitted vault whose first write fails holds a slot for good.** This is the other half of fail-open admission.
- **A22, a counter object that never sleeps.** Every vault object re-arms its alarm at midnight forever, because `v` always exists.
- **A26, the near pass is never charged.** Same as the self-review's item.

**Interface**
- **A35, Undo focus goes to the heading.** After Undo on Today, focus goes to the heading, not Water: one `querySelector` over a comma list returns the first match in page order (`today/+page.svelte:188`, checked).
- **A36, "Water these 0".** A resting row can end at a disabled "Water these 0".
- **A39, `focus.ts` scrolls after a tap.** Text fields always match `:focus-visible`, so a tap on a field partly under the bar scrolls under the finger. It also reads `innerHeight`, not `visualViewport`.
- **A40, 200% text breaks names.** "C / opiapoa" breaks mid-name in rows.

**Harness**
- **A32, a flaky test.** The "take uses today's row" test passes or fails by timing, 8 times in 10.
- **A31, the engine is not in the fold-rules hash.** A change to its listener passes the hash and every test, and produces A15.

## Decisions for round 60

1. **Wrong clocks: an edit always wins, and this device's own stamps are never parked by its own clock.**
   - **Stamping:** an edit is stamped past the field's current stamp however far ahead it is. That closes S7/A1/B2: the edit is never stored and lost.
   - **Parking:** this device's own stamps are parked only by arrival judgement, never by its clock. That closes S1/A2 at the root, and makes the sign fix belt and braces.
   - **The confirmed check:** it also fails when `Date.now() < confirmedAt`.
   - **The snapshot:** its key gains the checked flag (S, A15, B4).
   - **FOLD_RULES** goes to 5.
2. **Unchecked peer changes stay held,** because folding them would be the riskier choice. Held records are shown wherever records are listed, not only on the sync page, and the account says so (B3, S8).
3. **Duplicate numbers: links by id everywhere a record is in hand.**
   - A bare number shared by two live records opens a chooser.
   - The shared-number notice links the other record.
   - CSVs gain an id column.
   - Restore yields only to a record born after the removal (S2, A13, A14, B1).
4. **The archetype table never raises a habitat floor.**
   - Its minimum is shown as a labelled convention without a source.
   - Terrestrial bromeliads and terrestrial or temperate orchids leave the epiphyte and orchid groups.
   - A family that splits assigns no group (S3).
5. **Counters: reservations become leases with expiry** (`p:<id>` with a time). A listing is committed only if no landing or removal crossed it. Admission fails closed: 503 and Retry-After on a throw or an `unavailable`. A failed first write gives its slot back (S, A18, A19, B6 to B8).
6. **Stale DELETE: serialise per photo.** Delete and put for one name go through the vault's counter object, and receipts use R2's `version` (S, A12, B5).
7. **Corpus: a refused index never falls to the fixture.** A remembered refusal expires after 10 minutes. A dossier that is in the index but unreadable answers 503, not 404. `/api/dossier` is `no-store` until dossiers are content-addressed. Synonyms and compare take the held corpus (A6, A24, A25, A27, B11).
8. **Deferred, with reasons:**
   - **B13, the prune race across two checkouts:** there is one operator and one checkout; documented in DEPLOY.
   - **The /48 total for daily upload bytes:** decided last round.
   - **`sheetsIn`'s fallback:** decided last round.

## Round 60 order

1. **Data integrity:** decisions 1 to 3, with their tests. These are the self-review's data and harness tests and A's and B's reproductions, each written to fail first.
2. **Credibility:** decision 4.
   - The climate claims: genus meta, fallback description, and A9's NASA POWER source.
   - Photo credits on the front page, Related and compare.
   - The `/about/how` list (the version poll, the service worker, `static.inaturalist.org`, the edge cache) and its stale corpus paragraph.
   - `/about/formats` (A23).
   - The share card wording.
   - Commons thumbnails.
   - "No rainy season" and the Today wording.
3. **User-facing breakage:**
   - The quota message.
   - Label print rules.
   - The backup preview.
   - Today's hemisphere, the Undo focus, "Water these 0" and "Watered ✓".
   - The 503 path and its backoff.
   - Settings losing choices made before the load.
   - The search markers and citations.
   - Odd species addresses.
4. **Server consistency:** decisions 5 to 7.
5. **Tests:** adopt the 31 proposed tests, plus A's table. Replace the fake R2's etag with content hashes and real upload times, and fix the fuzz generator's random numbers. Add the engine to the guard, or give its classifiers their own behavioural tests.
6. **Accessibility and interface P2s:**
   - Keyboard watering focus and the toast.
   - Layout shift on the private pages.
   - Date-input focus; `focus.ts` after a tap and with `visualViewport`.
   - Forced colours.
   - The tab bar at large text sizes.
   - Tap targets.
7. **Then the experience work** in REVIEW-SELF-59: front page, species page density, season card, grower wording, paste import, sample collection.
