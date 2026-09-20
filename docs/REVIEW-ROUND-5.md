# Review round five

20 September 2026, against commit `fb2e8b4`. Method: the round-five prompt (`docs/REVIEW-PROMPT-5.md`) run as three adversarial passes over this checkout, one each on the derivations, the collection/sync/server, and the user-facing flows in a browser at 1000 px and 390 px in both colour schemes. Every finding below has either a probe in `tests/qa/round5-*.probe.test.ts` (run `QA_PROBES=1 npx vitest run tests/qa/round5-`; the derivation probes assert what the page claims and fail where the code does otherwise; the sync and collection probes assert the defect and pass), a Playwright script in `tests/qa/round5-ui-*.spec.ts`, or a line of code. The eight most serious were re-read at source by me after the passes reported them. Nothing under `src/` or `scripts/` was changed for this document.

## The verdict, first

The round-four design holds: envelope, DWCA, honest pages, field-diff sync. Nothing here argues for reopening any of that. But the round-four fixes were shallower than they looked in three places, and each is serious. A restricted record's coordinate still reaches the page, by two routes the last round did not close. The sync quarantine, added to stop one bad batch blocking the rest, now swallows a storage failure and files a good batch as bad, permanently, on exactly the device (a full phone joining a vault) where a storage failure is likeliest. And the clock guard fixed the clock but not the merge: a device an hour fast wins every field it touches, silently, on every device.

Beyond those, the species page prints five figures that are not what their sentence says they are (an annual rain range summed from percentiles of different cells; "no frost in 40 years" beside a sub-zero minimum; a "warmer half" with a cooler mean; an archetype figure the table does not hold; a tile count that contradicts the page). On a site whose whole pitch is that every figure is what it says, those are the findings to fix first, before the launch-day ones (Enter in the species picker files a plant under a half-typed name; "forecast 500" in a red box).

The list is long again, 60 items. Most are an afternoon each. The phased plan at the end puts the ones that decide whether the site keeps its word in the first phase and everything cosmetic last.

## Findings, ranked

Severity classes: **A** a wrong figure or a lost record; **B** a claim the page or the About text makes that the code does not keep; **C** a flow a grower cannot complete or a silent disagreement between devices; **D** abuse surface; **E** quality and polish. Within a class, most consequential first.

### A. Wrong figures and lost data

1. **A restricted record's coordinate is published as `climate.at`.** `src/lib/climate/provider.ts:123` keeps the first record's coordinate for each cell; `:149` publishes it to three decimals; the species page prints it ("read at the typical cell … (−24.912, −70.437)"). `forClimate` is open and restricted in insertion order, so a CC-BY-NC record can be the one. The how page says a restricted record's coordinates are never published. Probe: `round5-derivations` "through buildDossier: a CC BY-NC record's coordinate reaches the dossier". Fix: derive `at` from the cell index (its centre), never from a record, and read POWER there.

2. **The cell-centre snap guard fails for 531 of 1,801 tenth-degree centres.** `src/lib/core/geo.ts:173-176`: `Math.floor(x*10)/10 + 0.05` is `-24.85000000000001`, the equality test fails, no nudge is applied, and `toFixed(3)` lands back on the restricted record. Round-four finding 14's fix was incomplete. Probe: "never returns a restricted record's own coordinate". Fix: compare both sides after `toFixed(3)`.

3. **A storage error during a pull files a good batch as bad, for ever.** `src/lib/sync/engine.svelte.ts:270-276` wraps `collection.ingest` in the quarantine `try`; `src/lib/db/collection.svelte.ts:440-448` applies to memory before `appendChanges`. On `QuotaExceededError` the page shows the plant, the vault never gets it, the batch name goes into `have`, and after reload the plant is gone and the batch is never fetched again. Probe: `round5-sync` "quarantine … QuotaExceededError". Fix: quarantine only decrypt/validate failures; let storage errors abort the run; in `commit()`, write to the vault before mutating state.

4. **A fast clock wins every field it touches; the slow device's edits are stored, pushed and shown nowhere.** `src/lib/core/hlc.ts:56-66` refuses to follow a peer more than five minutes ahead, but `src/lib/core/log.ts:78` still takes the peer's change as latest. The slow device's later edit appends and pushes, then `apply()` skips it on both devices. Both agree; both are wrong; nobody is told. A phone set to 2031 locks every field it touches until 2031. Probe: "two devices, one with a fast clock". Fix: hold (not quarantine) changes stamped beyond `MAX_AHEAD_MS` of the receiving clock until the clock reaches them, and surface them; warn at `load()` when the device's own last HLC is far ahead of `Date.now()`.

5. **Importing the same v2 file twice overwrites every edit older than an hour.** `src/lib/import/v2.ts:77-83` stamps imports one hour before now; a second import of the same file re-stamps every field newer than any real edit older than an hour, and sync carries the reversion everywhere. Probe: "importing the same v2 file twice". Fix: stamp from the file's own `m` timestamps (parsed and ignored today), or refuse ids already in the log.

6. **Every write updates memory before IndexedDB, and no page catches a failed write.** `collection.svelte.ts:442-448`; callers such as `src/routes/plants/[acc]/+page.svelte:165,175`. A quota error shows the watering that was never written. Fix as in 3, plus a visible banner from `commit()` failures.

7. **The Rain card prints an annual total range no cell has.** `src/lib/core/sheet.ts:231` sums the monthly 10th percentiles and the monthly 90th percentiles, which come from different cells; three cells each with exactly 120 mm read "0 mm to 288 mm". Probe: "the Rain row prints an annual total range no cell has". Fix: carry the 10th/90th percentile of per-cell annual totals from the provider, or drop the clause. The Light row (`:239`) has the same shape.

8. **One or two frost nights in 44 years become "no frost recorded" beside a sub-zero minimum.** `provider.ts:112` rounds `frostDaysPerYear` to one decimal (0.045 → 0); `sheet.ts:249` and `+page.svelte:224` then say no frost, while the climograph beside them prints "−0.5° lowest in 44 yrs". `tests/unit/climate.test.ts:41` builds exactly this case and never asserts the figure. Fix: store `frostNights` and `years` as integers and word from the count.

9. **"The warmer half of the year" printed with a wet-season mean below the yearly mean.** `sheet.ts:154` has an undocumented 0.5 °C dead band; the sentence then contradicts its own figures. Fix: document the band and add a third outcome, or drop it.

10. **Every cactus page says the archetype table "supplies one figure"; it holds none for that group.** `src/lib/core/arch.ts:25` `arid.minC` is null (also `carnivore`, `geophyte`, `temperate`); `+page.svelte:199` prints the line whenever `sheet.arch` exists; on Welwitschia the next line denies it. `/about/how:46` repeats the claim. Fix: branch on `minC != null`; reword the how page.

11. **A sowing with the count left blank is recorded as 20 seeds.** `src/routes/sowings/new/+page.svelte:21`. A figure the grower never gave becomes the denominator of every germination percentage. Fix: default empty, require it.

12. **WCVP homonyms: authorship is ignored when exactly one row is Accepted.** `src/lib/dossier/bulk.ts:128-133` filters to Accepted first and consults authorship only if that leaves more than one; the wrong plant's range then verifies the wrong records. Probe: "a homonym with one Accepted row and one Synonym row". Fix: authorship first.

13. **The download path does not read `degreeOfEstablishment`; the API path filters cultivated records by it.** `bulk.ts:178-192` vs `build.ts:192`. A garden record enters the envelope through the files that the API path would have dropped. Fix: parse and carry it.

14. **Marker on a bridging stray record.** `geo.ts:102,160`: two populations joined by one record between them are one cluster and the marker lands on the stray; no refinement runs at 1° scale. Fix: always refine with `densestCluster(points, 1)` when the cluster spans more than one bin.

15. **The front tile's record count contradicts the species page.** `/` tile "52 records" is `c.open`; the page says 352 in range, 52 open. `src/routes/+page.svelte:135`. Fix: "52 open records".

16. **The label's floor rounds the figure the page states.** `/labels` "floor 7 °C", page "6.5 °C"; `sheet.ts` `T` vs `T1`. Fix: one rounding.

### B. Claims the code does not keep

17. **A skipped source is rendered as an absence.** `+page.svelte:75-78,127,139` treat only `refused`/`error` as "not checked"; `--skip inat` (the documented long-run mode) leaves photo upstreams `skipped` and the hero says "No openly licensed photograph on file". `build.ts:285-287` never marks `inat.taxon` skipped, so a rederive drops a previous `inat.taxon: refused` from `upstream` entirely. Round-four finding 31 incomplete. Fix: treat `skipped` as not asked on hero, pill, Summary, Papers; mark `inat.taxon`.

18. **A refused occurrence source is captioned as an absence on the record map.** `+page.svelte:261` "No openly licensed record to show inside the range" on `/species/refusia-testii`, whose source refused. The smoke test asserts the string. Fix: "Records not checked: the occurrence source did not answer."

19. **"Coldest 9 °C … no frost in 40 years"** on the glance tile reads as a 40-year minimum; it is the coldest month's mean night, and the absolute minimum (4.0 °C) is two screens away. `+page.svelte:224`. Fix: "Coldest month, mean night 9 °C (Jul)", extreme on its own line with its source.

20. **The server learns more than "a vault id, a token and ciphertext".** Batch names carry wall-clock milliseconds and the device id in the clear (`engine.svelte.ts:361-363`); photo ids carry wall time and device id and appear in URLs; each sealed photo's size is its resolution; `allowCreation` stores the client IP in KV for two days. Claims at `/sync:175`, `/about/formats:39`, footer. Fix: say so plainly (device count, edit timing, photo count and sizes are visible; nothing about the plants is), or name batches by hash and photos by random id.

21. **"The same batch pushed twice lands on the same key" is false.** `engine.svelte.ts:362-373`: a re-push after a lost reply re-seals with a fresh IV, so name and hash differ and the server stores it twice. Harmless to the merge; wrong on the formats page and counted twice against the allowance. Fix: hash the plaintext into the name.

22. **`/about/how` no longer describes the page.** Photographs "come from iNaturalist and Commons" (GBIF's DWCA is now first); "the climate table prints both" (it is a climograph with the table under a disclosure); the host list at line 56 will be wrong once a non-iNat `identifier` is served; nothing on the four-sentence quote or the followed list. Fix: one paragraph each.

23. **Lapse provenance is silent when POWER gives no elevation; the sheet always says "lapse-corrected".** `provider.ts:111`, `sheet.ts:256`. Fix: a third branch and a conditional `why`.

24. **`firstSentences` cuts mid-citation.** `src/lib/core/text.ts`: "…L. in Sp. Pl. 1753. It grows…" cuts after "Sp."; "Cact. Succ. J. 4: 12" after "Succ."; German "z. B." after "z.". The page promises "never a mid-sentence cut". Fix: a short-token rule (≤4 letters + "." followed by another such token or a digit is not an end) and the botanical abbreviations in `ABBR`.

25. **Equatorial habitat: the hemisphere shift is printed for a curve the sheet calls flat.** `sheet.ts:210,221`: a Kenyan plant at −0.5° gets "shifted six months … September to November" for a reader in London, after the sheet has said there is no thermal season to reverse. Fix: when `year.flat` or |lat| < 10°, print the habitat months with the hemisphere named and no shift.

26. **The climograph's "cold quarter" is defined nowhere** (legend, `<desc>`, how page), while the sheet reads a "cooler half" of different months; the RH/DLI strip reuses the day and night colours with no legend entry; the `<desc>` night clause takes its high from the warmest-day month, not the warmest night. `climograph.ts:60,125,163`, `Climograph.svelte:17,37,54-55`. Fix: legend and `alt` entries for the quarter and the strip, distinct hues, min/max of `tmin`.

27. **Export bundle README vs data.** `scripts/export-corpus-lib.ts:137` lists `summer|winter|even`, the CSV holds `cool`; `:170` LICENSE says `cc0` or `by`, the data admits `by-sa`. Fix the text.

28. **"which alone would put the marker 0 km away."** `+page.svelte:47`. Fix: omit under 1 km.

### C. Flows and silent disagreement

29. **Enter in the species field files a plant under a partial name; the suggestion list is unreachable by keyboard.** `src/lib/ui/SpeciesPicker.svelte` ~103: `onmousedown` only, no keydown, `onblur` closes the menu before Tab reaches it, Enter submits the form. "Copiapoa cin" ⏎ → a plant named "Copiapoa cin". Fix: ArrowUp/Down/Enter/Escape on the input, `onclick`, `role="combobox"`.

30. **"forecast 500" in a red box.** `src/routes/api/forecast/+server.ts:26` fetches outside any try; the bench renders `e.message`. Fix: 502 with a sentence; client shows "not checked".

31. **An open, idle device never pulls.** `engine.svelte.ts:225-236`: sync runs after a local edit, on `online`, and 1.5 s after load. A laptop on `/plants` stays stale while the phone edits. Fix: pull on `visibilitychange` and on a modest interval while visible.

32. **The numbering scheme is device-local and duplicate repair runs independently per device.** `collection.svelte.ts:33-34,510-556`: `scheme` lives in `meta`, not the log; two devices renumber the same duplicate differently and the log ends with two "Renumbered" notes, one wrong. Fix: scheme as a `setting` record; deterministic repair.

33. **A full vault triggers a request storm and no message.** `engine.svelte.ts:375-383`: a 413 for "over allowance" is bisected to single changes, one POST each, every 2.5 s, noted as "refused (413)"; never "your vault is full". Fix: distinguish quota (507) and show it.

34. **Species tab flashes the catalogue and "You grow 0" for ~470 ms on every load for a grower.** `src/routes/+page.svelte:40-44,177`. Fix: skeleton until `collection.ready`, or a `localStorage` hint for the SSR shell.

35. **Location tree edge cases.** `collection.svelte.ts:103-117,231-241`: a 1-cycle is silently rooted, not flagged; in a 2-cycle the cut node loses the parent both had, and `removeLocation` follows the raw `parentId` into the loop. Fix: flag `parent === id`; fall back to the pre-move parent.

36. **`followed` on a taxon record carrying `removed: true` shows "Following ✓" and lists nothing.** `species-list.ts:29`, `FollowButton.svelte:5`. Fix: `follow()` clears `removed`.

37. **Backup merge does not restore the numbering scheme; a photo record without pixels is never explained.** `backup/io.ts:298-303`, `engine.svelte.ts:426`. Fix: restore scheme on merge; surface the missing pixels once.

38. **`/plants` says nothing about eviction.** Photos live only in IndexedDB; the one signal is a sentence when `persisted === false`. Fix: a persistent "not persisted, back up" state and an install nudge.

### D. Abuse surface and robustness

39. **Storage allowance: the race is wider than drift, and the per-IP cap is unbounded.** `server/sync.ts:130-141,198-206`, `routes/api/sync/vault/+server.ts:255-263`: N concurrent 16 MB uploads all read `bytes` before any write; 20 vaults/IP/day with no byte cap; if the KV binding is the placeholder, `allowCreation` returns true for everyone; vault creation binds nothing (any 26-symbol id with any token); no rate limit on push, pull or the whole-prefix `list` per pull. Verdict on deferring the Durable Object: acceptable for launch only with an R2 spend alert, a per-vault KV byte counter written after each put, a per-IP daily byte counter, and `id === derive(token)` checked at creation.

40. **`meta.json` is rewritten twice per stored object.** `server/sync.ts:132-138`. R2 allows about one write per second per key; a first push with photos will exceed it and a refused meta write is a 5xx that aborts the run before the pull. Not reproduced without R2. Fix: counter in KV, or lazy.

41. **`/api/names`.** `src/routes/api/names/+server.ts:117-118`: a 200 with a non-JSON body throws out as a 500 without `no-store`; no rate limit; no character class, so the edge cache fills with junk under the same User-Agent the corpus build uses (a GBIF ban hits the build). Fix: `try` around `res.json()`, `Array.isArray`, a KV token bucket, a `[\p{L}\s.'-]` filter.

42. **Service worker update and install.** `src/service-worker.ts:24-40,58-59`: `skipWaiting`+`clients.claim` under open pages deletes the old cache, so an old page's next lazy chunk 404s and client navigation dies until reload; `addAll(PRECACHE)` fails the whole install on one non-200, and `register().catch(() => {})` hides it. Fix: SvelteKit's `updated` store with a reload prompt; per-file `cache.add` with logging.

43. **Fetch layer.** `src/lib/dossier/fetch.ts:157`: a 403 never strikes or cools (a Cloudflare block on iNat would be hit 3,300 times); `:105` a Retry-After date in the past yields five retries with zero wait. Fix: strike on 403; floor the wait.

### E. Quality and polish

44. Tap targets under 40 px at 390 px: top-bar icons 32×28, breadcrumb 55×12, species section tabs 31 px, log-entry "×" 17×16, footer links 14 px. The smoke test samples only `.btn`, `#tabbar a`, `.chipbtn`. Fix: `min-height: 40px` hit areas.
45. Label care line "floor −8 °C" with no source; a grower reads "floor" as the thermostat setting. `note.ts:65`. Print "habitat night −8 °C".
46. Text: "Phil.." after an authority ending in a period (`+page.svelte:168`); missing space before "·" in four places (Svelte trims `<span> · `; use `{' · '}`); "1 kinds", "1 plants · 1 timeline entries", "0 growing plants"; the card hint "what two fixed rules read from them" on cards no rule reads; the marker sentence's parenthesis splits "nearest … the middle"; tile subtitle is family for one species and vernacular for another; fixture credit "(CC BY) · CC0" doubles the licence on real data; "78 to 78% across the year"; the Light sentence repeats "30 to 65" twice.
47. Layout: the plant hero at 390 px when the photo fails; the sticky nav and top bar are translucent so headings ghost through.
48. `--fill` and rederive: `build-dossiers.ts:499` skips the snapshot carry under `--rederive`, then `:508` replaces each carried refusal's detail with "carried … (rederive)", losing why it refused. `OccIndex.withMedia` keeps the first 40 media-bearing records in file order, not a hash sample, so photographs favour whichever dataset sorts first (`bulk.ts:243`). A wanted subspecies whose species key is not wanted never gets photographs from the download (`bulk.ts:242`).
49. Duplication that will drift: `quantile` (`provider.ts:42`, `extremes.ts:33`), `r1` (`provider.ts:172`, `climograph.ts:86`), `KewDescription` (`bulk.ts:36`, `gbif.ts:88`), the cultivated/introduced regex three times, month-name arrays three times; already drifted: frost wording thresholds (`sheet.ts:249` `>0` vs page `<0.05`), habitat-latitude precedence inverted between `+page.svelte:72` and `export-corpus-lib.ts:74`.
50. Types that lie: `build-dossiers.ts:314` `as never` twice on one line; `:528` `as unknown as Dossierish`; `bulk.ts:390-414` five `as unknown as T`; `collection.svelte.ts` `as unknown as` on every record boundary because `Record_` and the domain types are unrelated.
51. Tests that miss: `envelope()` has no unit test (only `at()`); `climate.test.ts:41` plants a freak frost and never reads it; `sheet.test.ts:146` tests fixed strings, not the label line; the sync-engine vault mock has no failure path, so the quarantine tests only ever see a happy vault (finding 3 is exactly the case they miss); the test harness never calls `engine.init()`.
52. Dead or shim code: `geo.ts:33` `within()`; `log.ts:16` `stock`, `task`, `setting` kinds and `Change.m`; `engine.svelte.ts:206-213` a migration shim for an engine that never shipped; `crypto.ts:4-5` comment says 128 bits/26 letters, the key is 30 symbols.
53. `vault.ts:59` reloads 800 ms after `blocking` regardless of in-flight writes (an `addPhoto` between blob and record write is cut). `engine.svelte.ts:299` the `busy` guard drops a `schedule()` during a long first push. `server/sync.ts:102-118` lists the whole prefix per pull; if more than 500 batches share a 60 s arrival window the `more` loop never advances `since`.

## Looked and found nothing

The envelope with fewer than three cells, identical cells, the antimeridian, sea cells, a typical-cell tie. The climograph at a 400 mm month, all-zero rain, extremes far outside the monthly range, the cold quarter wrapping the year, per-species axes, dark scheme and 390 px legibility. The occurrence hash sample (kept set equals the 100 smallest hashes exactly). `MediaIndex` drops NC and unlicensed rows. Dedupe, the 10 km filter, extinct regions, `ambiguous`, synonym → subspecies → species step-up. Fetch: Retry-After in seconds, the two-minute refusal, host isolation, 502 as an error without retry. Crypto: HKDF, salt, infos, id and token hashes, AAD, photo sha, all as the formats page says; a wrong token learns only that an unguessable id exists; names are regex-bound; 409 on different bytes under a held name; oversize refused twice. `addAccession` refuses a number in use; LWW same-field conflicts resolve identically on both devices apart from findings 4 and 32; restoring the same backup twice changes nothing. Export → wipe → import brings back plants, events, places with coordinates, sowings, followed species, notes and photographs. Offline: a visited species page reloads whole from the worker; an unvisited one falls to "No connection" with a way forward. No third-party request other than the image hosts on any page. No `pageerror` on any page; no horizontal overflow at 390 px; dark contrast held everywhere checked.

## Launch readiness

Most likely to embarrass in the first hour: a keyboard user files a plant called "Astro" (29); the first species page says the archetype table supplies a figure it does not hold (10); "forecast 500" in a red box under a heading that promises refusals are not absences (30).

Most likely to lose a grower's data in the first month: the phone's storage, not the server, with edits shown that were never written (6, 38); the quarantine-on-storage-error during a join (3); a wrong clock or a second v2 import rewriting fields on every device (4, 5).

## The plan

**Phase one, the word the site gives (findings 1, 2, 7, 8, 9, 10, 15, 16, 17, 18, 19, 23, 24, 25, 26, 28).** All in `provider.ts`, `geo.ts`, `sheet.ts`, `text.ts`, `climograph.ts` and the species page; one to two days; the corpus needs a rederive for 1 and 8 (the `at` and the frost count are in the dossier), which can ride with the next one.

**Phase two, the collection keeps what it is given (3, 4, 5, 6, 31, 32, 33, 35, 36, 37, 38).** Write-then-apply, quarantine narrowed, held-ahead changes, v2 stamps from the file, pull on focus, scheme in the log, quota surfaced. Two to three days, with the vault mock given a failure path first so the tests can see it.

**Phase three, the server before strangers (20, 21, 39, 40, 41, 42, 43).** Byte counters in KV, id-from-token at creation, a rate limit, names by plaintext hash, `/api/names` hardened, the service worker's update path, the fetch layer's 403. One to two days.

**Phase four, the flows and the text (11, 12, 13, 14, 22, 27, 29, 30, 34, 44 to 47).** The picker's keyboard, the sowing count, the forecast error, the how page, the tile count, the tap targets, the polish list. One to two days.

**Phase five, the quality list (48 to 53)** when convenient; none of it changes what a grower sees.
