# Review round four: the method, the data path, and a full QA pass

19 September 2026. Inputs: an outside model's review of commit `bd35e09` (18 findings, 17 with executed reproductions), three adversarial passes run over this checkout on the same day (derivations and pipeline; collection, sync and server; user-facing routes), and a look at how the same problem is solved elsewhere. Everything below was checked against the code; where a claim could not be verified without the corpus it says so.

## The verdict, first

The architecture is right and the data path is mostly the efficient one: one GBIF download instead of nine thousand API calls, Kew's WCVP files instead of GBIF's distribution endpoint, a local CHELSA grid instead of a climate API. Nothing found argues for tearing any of that up.

The method has one design weakness worth changing before launch rather than after: a species' habitat climate is read at a single point, the centre of its densest population. Ecologists who summarise a species' climate from occurrence records do not do this; they take the distribution of climate across the records. Moving to that, a climate envelope, removes the disjunct-population problem outright, makes three of the clustering bugs irrelevant, and gives the plant page a range to compare a bench against instead of a point. It is the one recommendation in this document that changes what the pages say; the rest are bugs, honesty leaks and hardening.

The code has more real faults than the last three rounds found, and two of them are serious: a sync path that silently drops a device's changes, and dossiers that publish horticultural opinion in the method's own voice. Both are fixable in days. The list is long because four reviewers looked hard; it is not a sign the design is failing.

## Part one: is the method the right one?

### What the build does

For each species: the backbone name; WCVP's native regions as TDWG level-3 boxes; every georeferenced GBIF record inside those boxes (open-licensed ones published, all of them used); records binned at 1°, 2°, 4° until one window holds half of them or twice the runner-up; the record nearest that window's middle becomes the habitat centre; CHELSA's twelve months are read at that one 0.05° cell; NASA POWER daily extremes at the containing 0.5° cell; a growing year read from the rain and temperature curves; a cultivation sheet derived from those figures.

### What the field does

Summarising a species' climate from occurrence records is a standard task in ecology, and there is a settled practice. Which Plant Where, the Macquarie University tool behind Australia's urban-planting guidance, built suitability for 1,800 species from GBIF and ALA records against CHELSA: species with thirty or more cleaned records get a MaxEnt species-distribution model; those with fewer get what they call the niche method, the 5th and 95th percentiles of each climate variable across the records ([Which Plant Where, Arboriculture & Urban Forestry 2023](https://auf.isa-arbor.com/content/49/4/190)). The niche method is the older BIOCLIM envelope: for each variable, the range the species has been recorded in, trimmed at the tails. The literature on climatic niches of plants (the recent [global niche study across 40,000 species](https://www.mdpi.com/1999-4907/17/9/1058), the [range-size work in PNAS](https://www.pnas.org/doi/10.1073/pnas.2517585122)) is built on the same envelope idea, with two cleaning steps first: remove records at country centroids, institutions and 0/0 (the CoordinateCleaner checks), and thin to one record per grid cell so a heavily visited site does not dominate.

Nobody in that literature reads the climate at one point. The reasons apply here with force. Survey density is not population density: the densest 1° cell of Copiapoa records is where the road runs along the coast, and the species may sit mostly on the slopes above it. A single cell is fragile: one misplaced cluster of herbarium records moves the whole page. And a species with two populations has two climates; choosing one and refusing the other (558 species today) discards evidence the records contain.

### What to change

Replace the single centre with an envelope, computed from the same records under the same rules:

- Take every in-range record (open and restricted, as now), drop those with `coordinateUncertaintyInMeters` above 10 km (the grid is 5 km) or flagged by the centroid/institution checks, and thin to one record per 0.05° cell so each cell of the grid counts once.
- Read CHELSA's twelve months at every remaining cell (a local lookup; 2,000 records is 2,000 array reads, not 2,000 requests).
- For each monthly variable keep the median and the 10th and 90th percentiles across cells. The median twelve months is the species' typical year; the 10th and 90th are the range it is recorded in.
- Require, as now, a verified WCVP range and at least three cells. Below that, no envelope; the page says so.
- Keep a habitat centre only as the map marker and as the place the POWER extremes are read (extremes at the median cell, or at the coldest 10th-percentile cell, which is what a grower wants to know).

What this buys. The disjunct rule and the dominance test disappear; a species with two populations has a wider envelope and the page shows it. The plant page compares a bench against a range ("your winter nights sit inside the recorded 10th to 90th percentile" or "below anything on record"), which is a comparison, not a verdict, and truer than a single figure. The growing-year reading runs on the median year and is no less sourced than now. The DEVLOG's "records nearest the middle" wording goes; the About page states the envelope rule instead, which is easier to defend because it is the published one.

What it costs. A rederive of the corpus (hours, not days). A schema version bump: `climate.months` becomes `climate.median` plus `p10` and `p90` arrays, with `climate.cells` recording how many cells the envelope rests on; `s/v2/` so old clients refuse it. The sheet and plant-page code reads `median` where it read `months` and gains range comparisons. The cluster code stays for the map marker but no longer decides anything.

Two cheaper improvements sit alongside this whichever way the decision goes. WCVP's names file carries Kew's own `lifeform_description` ("succulent subshrub", "tuberous geophyte") and `climate_description` ("desert or dry shrubland", "seasonally dry tropical") for every species; the build already parses both fields and uses neither. They are a source we are entitled to quote, they cross-check the derived climate, and they are free. And `coordinateUncertaintyInMeters` is in the download already and is not read.

### Where the data path could be leaner

The download should be `DWCA`, not `SIMPLE_CSV`. The archive then carries `multimedia.txt`: for every record with images, the image URL, its licence and its creator ([GBIF download formats](https://techdocs.gbif.org/en/data-use/download-formats)). iNaturalist publishes research-grade wild observations to GBIF with per-photo licences, so the wild photographs the build now fetches at three iNat calls a species (10,000 calls a day, four days for the corpus) are already in the file, licence and credit included, at zero calls. iNat's API remains the only source for cultivated photographs (captive observations do not go to GBIF) and for a few taxa GBIF lacks. This also fixes the "observed growing wild" claim at the root: a GBIF record is a wild observation by definition.

Wikidata should be matched by GBIF taxon id, not by name search. The property P846 holds the GBIF key; one SPARQL query with 200 keys in a `VALUES` block returns their items, so the corpus is 50 queries instead of 9,000 and the match is exact. This is also the correct fix for the outside review's first finding (a name search returning another species): there is nothing to fall back to when the id is the key.

The occurrence archive is also where the download DOI lives, and the bundle's README promises each dossier names it; the build never writes it (finding D9 below). One line on the bulk path.

Everything else in the pipeline is already the right shape: one WCVP read for all distributions, the climate grid local, POWER cached per 0.5° cell across runs, OpenAlex one call a species with a key, the fills resumable and quota-aware.

## Part two: the QA findings, consolidated

Sources: R = the outside review (numbered as in its report), D = the derivations pass, S = the sync and server pass, U = the user-facing pass. Duplicates across reviewers are merged. Reproductions for D, S and U are in `tests/qa/` (28 failing probes on current code, run with `QA_PROBES=1 npx vitest run`, and `tests/qa/ui.probe.spec.ts` for Playwright); R's 17 are in the reviewer's own checkout.

### A. Data loss and security (fix first)

1. **Sync drops a device's changes after a merge-restore.** A batch is named by its last HLC; the server answers "already there" for any existing name; the client acks the whole batch. After restoring another device's backup, the outbox holds local edits plus already-synced changes; the last element is a name the server has, the batch is "already there", and the local edits are acked and gone. Executed. `src/routes/api/sync/log/+server.ts:22`, `src/lib/sync/engine.svelte.ts:166`. Fix: name batches by a content hash; ack only on a byte match. (S1)
2. **A token holder can wedge every device for good.** Sixty-four random bytes posted under a valid batch name make `openJson` throw on every pull, nothing behind it is ever pulled, and nothing is ever deleted. A change naming a reserved field does the same with the key. Executed. `engine.svelte.ts:207`, `log.ts:38`. Fix: quarantine a batch that fails to open or apply, record it in `have`, surface it; validate before applying. (S2)
3. **Any 4xx on push stops receiving too.** `run()` pushes then pulls; a 400 from an oversize restored photo (no size or MIME check on restore, `backup/io.ts:71`) or an over-16 MB batch throws every run. Executed. Fix: on 4xx, skip or split and continue to pull; validate restores. (S3)
4. **HLC clock and counter.** Any peer's future wall time is adopted forever; the counter overflows its four hex digits at 65,536 ticks (a v2 import reaches it), after which decode throws on load and the server rejects the batch name. Executed. `hlc.ts:16,47`. Fix: refuse remote walls more than a few minutes ahead; widen the counter; validate in the importer. (S4)
5. **Storage allowance and the daily vault cap race** under concurrent requests. Executed. Fix properly with a Durable Object per vault; until sync has paying users, document the limit. (R14)
6. **`SYNC_OPEN` absent means open.** `api/sync/vault/+server.ts:14`. One line. (R18)
7. **Service-worker cache poisoning**: a captive portal's 200 becomes `/plants/<id>` until the next deploy. `service-worker.ts:59`. Check `content-type` and `r.type`. (S6)
8. **Record ids keep 16 bits of device identity.** `collection.svelte.ts:366`. Use the full id for new records. (R16)
9. Lower: photo bytes are not bound to their photo id in AAD and `sha` is never verified on pull (the server can swap photos within a vault); `t` unvalidated on restore; body read before size check; `wrangler.jsonc` declares a cron with no handler. (S8)

### B. Derivation correctness (change what pages say)

10. **Coastal cells get seabed depth as elevation.** `pack-climate.py:239` averages ETOPO over the cell without a land mask; a coastal Atacama or Namaqualand cell comes out negative, and the provider lapse-warms every extreme by it (a −900 m "elevation" is +5.9 °C on `minP01` and fewer frost nights). Executed. Fix: mask ETOPO to CHELSA land pixels in the packer; refuse the lapse when elevation is below zero. Requires repacking the elevation layer and a rederive. (D1)
11. **Three records anywhere in range suffice**, not three in the winning population. `build.ts:183`. (R2)
12. **The runner-up can be the winner counted again.** Overlapping 3×3 windows share points; `grown !== best` compares array identity. A coherent range can be called disjunct. `geo.ts:65`. Some unknown share of the 558 is this. (R10) Moot under the envelope; must be fixed if the centre stays.
13. **No wrap at ±180°**: Fiji, Chatham, Aleutian populations split; a mixed cluster's median lands in the Atlantic. `geo.ts:62`. (D4)
14. **The "grid point" centre can be a restricted record's coordinates** when the median of 0.1°-precision points is a point. `geo.ts:149`. Snap to cell centre and reject candidates equal to a restricted point. (D5)
15. **Dedupe drops open records behind restricted ones** at the same 3-decimal coordinate. `build.ts:149`. (D6)
16. **Front-page regions misfile the Pacific**: Fiji to West Africa, Hawaii to Central America, Antarctica to Southern Africa. `regions.ts:29`. Unwrap antimeridian boxes; add an Oceania rule. (D3)
17. **Refusal leaks** (a refusal is not an absence): a refused WCVP call reported as "no WCVP distribution" (R6); a refused second occurrence page reported as success (R6); MediaWiki HTTP-200 error bodies read as none (R6); a synonym whose accepted lookup fails kept as the synonym (R6); `--fill` writing `none` on an `error` for both literature and iNat (D2); carry() stamping "carried" when nothing was copied and replacing the whole photo array (D8); carry not covering range, occurrences or climate (R6).
18. **WCVP "extinct" regions become plain native range** with a box. `bulk.ts:104`. (D11)
19. **Wikidata first-result fallback** attaches another species' identity. `wikimedia.ts:25`. Match by GBIF id (Part one). (R1)
20. **Bulk WCVP index lacks accepted names of cross-genus synonyms**, so followed species fell to the API. `bulk.ts:70`. (R11)
21. **Homonyms in WCVP collapse to one row** by name; range can be the other homonym's. `bulk.ts:65`, `reconcile-names-lib.ts:40`. Keep ambiguous rows distinct; refuse the range when ambiguous. (R5)
22. **Season formatting drops one run of a bimodal season**; sheet and label choose opposite halves. `sheet.ts:75`, `note.ts:18`. (R8)
23. **Rainfall wording under a flat temperature curve** says "no sharp season" when three months carry 70% of the rain; the even-year card prints habitat months with no hemisphere. `sheet.ts:122,200`. (R9, D7)
24. **Forecast claims "no frost" from a noon reading**; six-hour minima assigned to the interval's start date. `forecast.ts:63,139`. (R12)
25. **Cold floor**: monthly-mean fallback and a 4 °C clamp undisclosed. `sheet.ts:221`. (R13)
26. **Schema gaps**: a one-month climate, a restricted tag in `occurrences.open`, a centroid at latitude 200 all parse. `schema.ts`. (D10)
27. **parseName**: `cv.` becomes an unclosed quote; `Aloe vera × Gasteria` invents "Aloe gasteria"; `xGraptoveria` → genus "Xgraptoveria"; apostrophes inside cultivar names. `names.ts:24,84`. (D12)
28. **Slug collisions** between a nothospecies and its species, and between accepted and doubtful homonyms. `names.ts:6`. (D14)
29. Lower: long-form "Attribution-Share Alike" tagged `by` (D13); CR unquoted in CSV, whitespace-only coordinate parses as 0, a point on a grid line reads the northern cell (D15); the bundle README cites a download DOI the build never writes (D9); fetch caps Retry-After at 30 s, `pace()` reserves after awaiting, "quota for the day is spent" is a guess (R17).

### C. Honesty of the pages (policy, then code)

30. **Horticultural opinion in the method's voice.** The sheet and plant page carry sentences no source supports and the About page says nobody wrote: "It grows in the open" from a defaulted exposure; "a dry plant will take a few degrees below that; a wet one will not"; "growth stalls long before anything looks wrong, which is why heat gets blamed on watering"; "one of the standard ways to kill this group"; the archetype water strings ("More die of a wet winter than a dry summer"); and the plant page's tiles "Rest expected / Dry, bright, moving air. Water when it wakes, not before." with no source. `sheet.ts:155–270`, `arch.ts`, `plants/[acc]/+page.svelte:99,297,305`. (R3, U-H2, U-M1) This is the one policy question in the list. Two honest options: strip to figures and the labelled reading of the curves (plainer, fully defensible); or keep the archetype advice in a card labelled "conventional practice for this growth form" with its own source line and no claim of derivation. Either is consistent with the rules; mixing them, as now, is not.
31. **Refusals rendered as absences on pages**: "No openly licensed photograph yet" for a refused media source; summary and papers sections vanish on refusal; "Nothing can be derived yet" for `climate: refused`; the front page counts refused as "no climate"; the plant tile says "No habitat climate" for refused and pending; `/frost` never renders a refused alerts feed. `species/[slug]:111,154,239,268`, `+page.svelte:110,145`, `plants/[acc]:297`, `frost/+page.svelte`. (U-H3)
32. **Unreachable index rendered as "not in the reference"**: `/api/index` failure becomes an empty index, so offline every plant says "Not in the reference yet". `lib/ui/index.svelte.ts:7`. (U-H4)
33. Text claims that are not true of the app: "Add it as a plant and one will be prepared" (nothing prepares one); "Check back shortly"; a dead branch that says "Written by a language model". (U-low)

### D. Offline and user-facing

34. **Offline plant, bench and sowing pages are blank.** The shell fallback serves `/plants` HTML for `/plants/<id>`; with relative asset paths every chunk resolves under `/plants/_app/` and 404s. `service-worker.ts:66`; fix is `paths.relative: false` in `svelte.config.js`. (U-H1)
35. **Third-party requests from the browser**: the species picker sends every keystroke to api.gbif.org; photos load from iNaturalist's S3. Neither is stated on the About page, which says "no tracking". Proxy the picker through the Worker (edge-cached); name the photo hosts. (U-M2)
36. **Layout**: the name slides under the top bar on phones when the hero photo fails; the add-photo button collapses to an empty pill at 1280. (U-M3)
37. **Contrast**: `--ink3` on white is 3.0:1, and it is the colour of every source line. (U-M4)
38. **Colour-only meaning** on bench and plant lists at narrow widths; unlabelled controls on eight forms; heading levels jump. (U-M6, U-M7)
39. `µmol` uppercased to `ΜMOL`; `/plants` search ignores cultivar and parentage; no confirmation on remove; labels preview clipped to one column at 360. (U-M5, U-M8, U-low)
40. **Locations**: removing a place orphans its sowings; a plant moved into a place by an offline device after that place was removed vanishes from every bench; two devices moving places into each other make a rootless loop (R15). `collection.svelte.ts:173`. (S5)
41. **Old-tab IDB upgrade** waits forever with no message. `vault.ts:29`. (S7)
42. **Playwright flakiness** is `wrangler dev`'s: workerd drops the pipe and whichever test is in flight times out (three runs, three different victims). The sowings and hybrid tests the outside reviewer saw fail pass here every time. Run e2e against the Vite preview, or retry once on `ERR_ABORTED`. (U1)
43. Performance is fine at 600 plants (list 0.7 s, search 0.1 s); the species page with 200 owned plants takes 3.9 s and wants a look. (U)

### E. Checked and found sound, across all four reviewers

The fold is order-independent across delete/edit/restore with clock skew; identical batches land once; every route authenticates, and the id regexes stop R2 key traversal; a fresh IV per seal, cross-vault and cross-kind AAD, version byte checked; photos are re-encoded through canvas so EXIF and GPS are stripped; unknown licences are never published as open; only open photographs are republished; the range filter, living-specimen and introduced exclusions hold; `licenceTag` on every GBIF, iNat and Commons form but one; TDWG boxes and codes; `inBox` at the poles; `OccIndex` sampling is deterministic and exactly the cap; `growingYear` month indexing and southern-hemisphere labels; DLI and the 0.0864 radiation factor; POWER percentiles and lapse sign; the packer's scaling logic; midnight-split rain; export column counts; focus rings and keyboard paths; no page errors; no horizontal overflow on standard pages; dark scheme.

## Part three: the plan

Order chosen so that each rederive carries every derivation change made before it, and so that data loss is closed before anything else.

**Phase 0, today, no rederive.** Publish `src/lib/climate` (done: the ignore rule was unanchored). Sync: content-hashed batch names with byte-match acks (1); quarantine unopenable or unapplyable batches (2); continue pulling after a 4xx and validate restores (3); HLC drift guard and counter width (4); `SYNC_OPEN` explicit (6); service-worker response checks (7); full device id in new record ids (8); `paths.relative: false` (34). Tests for each from `tests/qa/`. This is a day.

**Phase 1, derivation, then one rederive.** Decide centre versus envelope (Part one). Either way: mask ETOPO and repack elevation (10); refusal leaks (17); extinct regions (18); Wikidata by GBIF id (19); bulk index of accepted names (20); homonym handling (21); dedupe order (15); antimeridian (13, 16); schema tightening (26); parseName and slugs (27, 28); the small ones (29). If the centre stays: population support (11), runner-up (12), cell-centre snap (14). If the envelope: schema v2, the sheet on the median year, range comparisons on the plant page. Then `--rederive` over the corpus and recount the no-climate species. Two to four days of code, an afternoon of rederive.

**Phase 2, the pages.** The prose decision (30) and its implementation across `sheet.ts`, `arch.ts` and the plant page; refused states on every section (31, 32, 33); seasons and cold floor (22–25); the About page rewritten to match whatever Phase 1 decided. Then contrast, labels, headings, layout, search, confirmations (35–39). Two days.

**Phase 3, collection and data path.** Location semantics (40, 41); the DWCA download with `multimedia.txt` feeding photographs (a bulk-fetch change and a new adapter); Kew's lifeform and climate descriptions on the page; the download DOI into upstream; the species picker through the Worker. A rederive is not needed for these except the photographs, which the fill mechanism already covers. Two days.

**Deferred, documented**: the storage-allowance race (5) until sync has paying users; the species-page cost at 200 owned plants (43).

Three decisions are yours: envelope or centre; strip the horticultural prose or label it; whether to fund a Durable Object now for the quota race. Everything else has one right answer and is scheduled above.
