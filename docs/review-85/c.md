# Review C (code, server, security, races and the suites), round eighty-five

**Verdict: works with faults.** Round 84's Worker (`63ab1f88`) over corpus `8520c2875b2699ba` answers every route I tried correctly. Every answer carries the security headers. Old headings and merged names redirect to the right pages. The privacy lists on /about/how match what a visit requests and stores. I found no security fault.

Round 84's two picker fixes hold:
- **The list never opens without focus.** It never did in 72 runs on desktop and phone, sampled every 50 ms. In 16 of 16 runs, a tap on the next field picked nothing.
- **No press is lost or armed wrongly.** Every first press was taken, in 50 runs with `/api/search` delayed and `/api/names` failing or answering other names.

**But the add form still has two faults that file the wrong thing:**
1. **The wrong key (C2).** A stapeliad typed by its new Kew name is filed under GBIF's synonym key whenever the reference's search is slower than the field's leave check. This is proved live: the new plant opens with an amber "this plant records key 5525665" notice.
2. **Duplicate plants (C3).** A double tap on Add files two or three plants: 6 of 6 runs, desktop and phone.

**And round 84's renaming of 501 pages broke two promises:**
- **The old address's line is untrue (C1).** It says "the GBIF backbone accepts this species as Hoodia alstonii", which is untrue on all 501 old addresses.
- **Plants under the old headings lose their species page (C4).** A plant recorded under an old heading, with the page's own key, now says "No species page under this name" on its own page. Proved live with Ceropegia alstonii. /about/how says the key still leads to the page.

The owner grows stapeliads, which is the group this hits hardest.

**Scores (my areas)**

| Area | Score | Why | What makes it a 10 |
|---|---|---|---|
| Server and Worker | 8 | Routes, errors, redirects and headers are right. The zone still turns 5-minute answers into 4 hours on an edge hit (C5). The old-address line is untrue on 501 pages (C1). | Zone setting fixed and checked on a hit; the line worded from Kew. |
| Security and privacy | 9 | No fault. Hosts, storage keys and cookies match /about/how. Audit: 0 production advisories. | The 5 low dev advisories cleared with Kit 3. |
| Races and the device | 5 | C1 and C2 of round 84 are fixed. Two new faults that write wrong records: the key race (C2) and duplicate plants (C3). Database at 2,000 plants is good. | Keys from the reference first; the form held until it has left. |
| Service worker | 8 | The 83→84 update is clean, and the old build is swept. A page read under 84 opens offline with its region shapes. Pages read before a deploy are gone offline (C6, by design). | Read species kept across deploys. |
| Build code (next walk) | 8 | The index-ready gate, the carry rule and the listings' stop each fail a test when reverted. Read, not run at full size. | Manifest's named products checked on disk before upload. |
| Suites | 8 | Unit: 5,028 passed. Browser strict, Chromium and phone: 743 passed, 5 skipped, 0 failed, 0 flaky. 3 of 16 round-84 fixes I reverted fail no test, and nothing tests C2 or C3. | Tests for the key race and the double tap; the three gaps covered. |

**What I covered**
- **Live site:** about 557 requests to cultifolio.com, under the 800 allowed (`C-s/reqlog.txt`):
  - 43 by `curl`: headers, every API's caching and errors, redirects, the zone cache;
  - one Chromium privacy visit of 424 requests, most of them the service worker's install, counted as the browser saw them;
  - one live add-form check of about 90 requests (iPhone 13 profile, service worker blocked, two plants in the browser's own storage).

  I made no third-party request of my own; the privacy visit loaded 31 photographs. No vault, no POST.
- **Local, port 4791 under the lock:**
  - the race harness (`C-s/race/race.mjs`): 72 valid runs: 40 desktop and 26 phone, plus 6 runs of repeated taps;
  - the reverted build's specs;
  - the 83→84 service-worker update (`C-s/sw/update.mjs`, twice);
  - the database at 2,000 plants and 20,000 log entries (`C-s/db/scale.mjs`), desktop and a 4×-slowed Pixel 7;
  - the strict browser suite.
- **Unit suite:** once, whole, under `nohup`: 554 files passed and 1 skipped; 5,028 tests passed and 10 skipped; 797 s. The PC reported 5,030 passed. The 2 that differ are among the 10 skipped here (two by design in `r79f`, one audit in `r61q`, and environment skips); I did not list them one by one.
- **Browser suite, strict** (`CI_STRICT=1`, `--workers=2`, port 4791, Chromium and the phone, once): 743 passed, 5 skipped, 0 failed, 0 flaky, 20.0 min of tests (`C-s/e2e/e2e.log`).
- **Revert sweep:** 13 round-84 fixes taken back one at a time against their unit tests (`C-s/revert/sweep.json`), and 3 more taken back in a build against their browser specs (`C-s/revert/e2e-rv.log`).
- **Audit:** `npm audit --omit=dev` found 0. The full audit found 5 low, all waiting on Kit 3. Neither Kit advisory applies: there is no `use:enhance` and no prerendered page reads `cache-control`.

---

## Issues

### C1. Major: on all 501 pages whose heading became Kew's name, the old address's line says GBIF accepts the species under Kew's name, which is untrue

**What I did.** Fetched `/species/ceropegia-alstonii`. It answers `302` to `/species/hoodia-alstonii?was=Ceropegia%20alstonii`, `public, max-age=86400`. Then I fetched that page.

**What I saw.** The page opens with:

> "**Ceropegia alstonii** is a synonym: the GBIF backbone accepts this species as *Hoodia alstonii*, and the reference files it under that name."

GBIF's backbone does the opposite. Its key 9269454, the page's own key, is *Ceropegia alstonii*, accepted. That is why the page carried that heading until round 84. GBIF's name service gives *Hoodia alstonii* as a **SYNONYM**, key 5525665 (`/api/names?q=Hoodia%20alstonii`, live).

It is Kew that holds Ceropegia alstonii as a synonym. The page's own record of sources says so a few lines lower: "Kew holds Ceropegia alstonii (N.E.Br.) Bruyns as a synonym of Hoodia alstonii (N.E.Br.) Plowes".

**How many pages.** The live index (saved by D at `inputs/index.json`) against the copy of 29 October gives 501 headings changed, all on pages with a GBIF key. Every old address of these pages lands on this sentence. This breaks rule 1 (a claim not true of its source) and rule 5.

**Where.** `src/routes/species/[slug]/+page.svelte:473`, the last `{:else}` of the `was` line. It is written for an older name the GBIF backbone resolved, and the Kew-headed `k` page falls into it.

**Should.** Where the old name is GBIF's name for this page's key, or one of Kew's synonyms of the heading, say whose verdict it is: "Ceropegia alstonii is an older name: Kew's World Checklist accepts this species as *Hoodia alstonii*, and GBIF's backbone still files it under the older name."

**Smallest fix.** Take the existing `gbifless` wording (line 470) whenever the old name is in `d.name.kew?.synonyms` or is GBIF's own name for `d.ids.gbif`. Add a test over one renamed page reached by its old address.

### C2. Major: a name typed by Kew's new heading is filed under GBIF's synonym key whenever the reference's search is slower than the leave check, and the new plant opens with an amber "key differs" notice

**What I did**
1. **Live**, `C-s/race/live.mjs`: iPhone 13 profile on https://cultifolio.com/plants/new.
   - Typed "Hoodia alstonii" at 90 ms a key.
   - Tapped the heading to put the keyboard away, as a grower does.
   - Waited 1.2 s, then tapped Add.
2. **Locally**, `C-s/race/race.mjs`, 18 runs:
   - `/api/names` answered with GBIF's synonym row (key 5525665) in 50 ms;
   - `/api/search` answered the reference's row (gbif 9269454) after 0, 600 or 1,500 ms;
   - the grower left the field then pressed Add, or pressed Enter, or pressed Add straight from the field.

**What I saw**
- **Live.** The pill read "GBIF 5525665" before the press. The plant was stored with `taxonKey 5525665`. Its page opened with an amber notice (`C-s/race/live-hoodia-plant.png`):

  > "The reference files Hoodia alstonii under GBIF key 9269454; this plant records key 5525665, which the reference does not hold under that name. … Use the reference's key."

  The grower typed exactly the name the reference heads the page with, and is asked to repair it at once.
- **Locally.** GBIF's key was filed in 13 of 18 runs:
  - in all 12 runs where the search took 600 or 1,500 ms, whether by Add, by Enter or after a leave, on desktop and phone;
  - in 1 of the 6 runs where the search answered at once.

  Pressing Add straight from the field does not help. The press itself blurs the field, and the leave check runs 150 ms later, before the search has answered.

**Where it comes from** (read, then proved as above)
- `SpeciesPicker.svelte`, `onBlur` (line 435), runs `checkExact()` (line 309) 150 ms after any leave. `checkExact` prefers a reference row only if one is already in `suggestions`. Otherwise it takes the name service's exact row and sets `taxonKey = m.key` (line 332).
- `check()` (line 358) then awaits the reference's search, as round 84 made it. But `checkExact()` returns at once because `taxonKey` is set. The form's `save()` skips `check()` entirely once `taxonKey` is set (`plants/new/+page.svelte:203`).
- When the reference answers, the late resolution (lines 233 to 238) acts only `if (!taxonKey …)`, so it never replaces a key the name service gave.

**How many names.** Every name the reference heads with one GBIF key while GBIF's suggest returns it under another:
- most of the 501 renamed pages (Hoodia, Huernia, Anacampseros and the rest of round 84's changes);
- reference headings that GBIF holds as synonyms.

I proved one live and did not count the rest, to keep within the request limit.

**Should.** The reference's own key wins for a name the reference heads. The name service's key is used only for a name the reference does not hold.

**Smallest fix.** In `checkExact()`, await the current search (`current.done`, as `check()` does) before asking the name service. In the late resolution, replace a key that came from the name service (mark it, e.g. `keyFrom = 'names'`) when the reference's exact row carries another one. A browser test: names answer at once with another key, search delayed 600 ms, leave, Add; expect the reference's key.

### C3. Major: a double tap on Add files two or three plants with consecutive numbers

**What I did.** In `race.mjs`, scenario `H-hammer`, I typed "Copiapoa humilis". Then I tapped Add by its coordinates, with no wait for the button, at 0, 120, 250, 400 ms and onward, as a grower tapping again would. I ran it on desktop and the iPhone 13 profile, with the search at 0, 600 and 1,500 ms.

**What I saw.** Every run filed more than one plant: 6 of 6.

| Search delay | Plants filed |
|---|---|
| 0 ms | 3 (2026-0001 to 0003), from taps at 0, 120 and 250 ms |
| 600 ms | 2 |
| 1,500 ms | 2 |

The ordinary run met it too, without the coordinate taps (`C2-blur-s1500`, desktop):
- After the plant was added, the form showed "Add" again for over 300 ms, still on /plants/new with the name filled.
- The next press filed 2026-0002.

The toast offers Undo for the last plant only.

**Where it comes from.**
- `src/routes/plants/new/+page.svelte`, `save()`: `saved = true` (line 260), then `goto(…)` **not awaited** (line 263), then `finally { busy = false; }` (line 268).
- The buttons' `disabled` (lines 354 and 356) reads `busy || checking`, not `saved`.

So from the commit until the plant page has loaded, the form is live again with the same name. Round 51's fix covered only a second tap during the name check.

**Should.** One press, one plant. The form stays disabled from the press until it has left.

**Smallest fix.**
- Return early in `save()` when `saved`, and add `|| saved` to both buttons' `disabled`.
- Or `await goto(…)` inside the `try`, so `busy` holds until the navigation ends.
- A browser test: tap Add twice 120 ms apart and expect one plant.

### C4. Major: a plant recorded under one of the 501 old headings loses its species page, habitat card and care line, although it carries the page's own GBIF key

**What I did.** Live, in the same session as C2, I typed "Ceropegia alstonii", the heading the page had until round 84. The form now asks "An older name of Hoodia alstonii … pick it, or Add keeps exactly what you typed", which is round 84's W6 working. I pressed "Add as typed", as a grower did before round 84. The plant was stored with `taxonName "Ceropegia alstonii"` and `taxonKey 9269454`, the page's own key.

**What I saw.** The plant's page reads "Added 2026-10-31 · No species page under this name · Is it an older name?". There is no Species page button and no habitat comparison (`C-s/race/live-ceropegia-plant.png`).

That is what every stapeliad, Anacampseros and other grower's plant filed under a heading round 84 replaced now shows, one plant at a time, until the grower presses the button and then "File it under …" for each.

/about/how line 82 says: "A plant you recorded under the old heading keeps its name and its GBIF key, and **the key still leads to the page**." On the plant's own page it does not.

**Where it comes from.** `src/lib/ui/index.svelte.ts`, `sheetForNameOr` (lines 331 to 349), finds the sheet by the name's slug only. The key is used only when the slug answers with another key, and a slug that misses returns `'none'` (line 348). The plant page, labels and propagation all read it (`plants/[acc]/+page.svelte:196`, `labels/+page.svelte:176`). Labels and the propagation form were read, not run.

**Should.** A plant whose key is a page's own GBIF key finds that page, whatever its name. The server must still never learn which species.

**Smallest fix.** Write an alias line into the sheet buckets for every older name that exactly one page holds (here, the 501 old headings at least), under the old name's slug and pointing at the page's slug. `sheetForNameOr` follows it when the plant's key equals the target's `gbif`. That stays a hash-group request. Until then, correct /about/how line 82.

### C5. Minor (operations; rule 5): the zone still serves `public, max-age=300` answers as `max-age=14400` on an edge hit, and the round-84 live check passes on a miss

**What I did.** Fetched each route twice with `curl` (`C-s/live/`).

**What I saw.**

| Route | First answer | Second answer |
|---|---|---|
| `/api/counts` | `cf-cache-status: HIT`, `public, max-age=14400` | the same (age 90) |
| `/sitemap.xml` | `public, max-age=300` (miss) | `HIT`, `public, max-age=14400` |
| `HEAD /api/index` | `HIT`, `public, max-age=14400` | (one request) |

D's GET of `/api/index` at 13:37 was a miss with `public, max-age=300` (`inputs/index.headers.txt`).

So outside review B9 is not fixed. The new live check reads one GET of `/api/index`, which right after an upload is a miss, and passed. On a hit it would fail. A browser now keeps the about pages' counts for four hours after a corpus change, against /about/how line 829's five minutes. The 404s (`public, max-age=300`) were not held at the edge and kept their header.

**Where.** The Cloudflare zone's Browser Cache TTL, as DEPLOY.md lines 578 and 819 say; not the Worker.

**Should.** Five minutes in the browser, as the routes say.

**Smallest fix.**
- The dashboard setting (Needs, 1).
- Make the live check GET `/api/counts` twice and require the second to be a HIT that says 300, so the check cannot pass on a miss.

### C6. Minor (works as designed, but not what the brief asks): a species page read before a deploy is gone offline after it

**What I did.** `C-s/sw/update.mjs`, run twice, one persistent Chromium profile:
1. Under round 83's build (`ba78fb9`), read `/species/copiapoa-cinerea` (in round 83's cache) and added a plant.
2. Started round 84's build (`08094db`) on the same port and opened `/`.
3. Stopped the server and cleared the browser's HTTP cache, so only the worker answers.

**What I saw** (`C-s/sw/out/log.txt`, `update.out`)
- **The update.** The new worker controlled the page within 1 s. After a reload, round 83's cache was gone.
- **Size.** 153 entries and 1.46 MB after the update; 162 entries and 2.5 MB after one species page, `regions50.svg` (436 kB) being the largest new file.
- **Offline after the update:**
  - `/species/copiapoa-cinerea`: "No connection";
  - `/plants`, the plant's page and `/` opened.
- **Read again under round 84, then offline:**
  - `/species/copiapoa-humilis` opened with both region-shape maps (`regions50.svg`, `regions110.svg`, `land50`, `land110` in the build cache).

  The new static files work offline once a page has used them.
- **The first run's note.** Without clearing the HTTP cache, cinerea did open offline, from the browser's `private, max-age=60` copy. A short trip after a read can hide this.

**Where.** `src/service-worker.ts`: species pages live in `cultifolio-${version}`, which `pruneOnActivate` and `sweepPrevious` (`src/lib/core/sw-keep.ts`) delete. The offline page says so truthfully.

**Should.** A grower who reads their species before going to the greenhouse can still read them after a deploy.

**Smallest fix.** Keep `/species/<slug>/__data.json` in a cache keyed by corpus and a data-format version, not by build. The offline page can already open that data.

### C7. Minor: photographs a sync run could not fetch (a 5xx) are counted but never told to the grower

**What I did.** Read `src/lib/sync/engine.svelte.ts` lines 1402 to 1440. The reverted run below shows the counting itself is tested.

**What I saw.**
- `photosLater` is counted and stored on the engine (line 235), and a `console.warn` says it.
- No page reads `sync.photosLater` (a grep finds no other use).
- A photograph whose bucket object always answers 500 is skipped silently on every run, while the status card says "Synced".

Round 84's comment says "Said, not thrown". It is said only to the console.

**Should.** The status card says "2 photographs were not received this run; asked again next time."

**Smallest fix.** One line on `/sync`'s status card when `sync.photosLater > 0`.

### C8. Minor: three round-84 fixes that no test fails when reverted, and no test for C2 or C3

**What I did.** Took each fix back alone in `C-s/rv`:
- the unit tests named for it: `revert/sweep.py`, 13 cases;
- the browser specs: a build with three reverts, running `r84k-picker` and `r84u-frame` in Chromium and the phone, with no retries.

**What I saw.** 13 of 16 reverts fail at least one test:
- the sync errors (three);
- the other tab's rebuild;
- the ledger (two);
- the site name;
- the frost window;
- the index gate;
- the carry rule;
- `/api/counts`' lifetime;
- the restore counted as a backup (unit tests pass; `r84u-frame` W8 fails).

**These pass reverted:**
1. **The gap catch-up's report.** `collection.svelte.ts:1683`, `followOther` put back to `.catch(() => {})`: 2 of 2 passed.
2. **The press outside the picker closes the list.** `SpeciesPicker.svelte:458-459` (`open = false; hi = -1;` in the `pointerdown` handler): all 12 runs of `r84k-picker` (6 tests, Chromium and phone) passed. Test 1 leaves by a heading, and the 150 ms blur timer closes the list anyway.
3. **`armed = false` when the late answer resolves the name.** `SpeciesPicker.svelte:238`: `r84k 2` passed. Nothing arms before that answer in the test.

And no test exercises C2 (names first with another key) or C3 (two taps).

**Should.** Each fix has a test that fails without it.

**Smallest fix.**
- (2): tap a non-focusable line while the list is open, and expect it closed within one frame.
- (3): Enter (arms) with the search held, release it, and expect "Add".
- (1): a unit test with the order gap and a failing catch-up, expecting `readBehind`.
- Plus the C2 and C3 tests above.

### C9. Minor (polish): the service worker's header and index comments say dossiers are cached; the route sends `no-store`, so none ever is

`src/service-worker.ts` says:
- line 10: "dossiers are network-first with a cache fallback";
- line 176: "a plant's page asks for its one dossier by key, which is cached below".

`/api/dossier/<id>` answers `no-store` (live, `C-s/live/e4.hdr`; the route's own comment explains why). The worker's corpus branch skips `no-store` answers, and no page asks for a dossier any more: plant pages read sheet buckets.

**Fix.** Correct the two comments, or drop `/api/dossier/` from the branch.

---

## The round-84 reviews' findings in my area

| Finding | Status | One line |
|---|---|---|
| C1 (review-c), the list over the form after a leave | **fixed** | 0 of 16 tap-on-Space runs changed the name. The list was never visible without focus in any of 72 runs, sampled every 50 ms. |
| C2, armed wrongly with the search out | **fixed** | Each of 8 runs (names answering other rows, search at 0 to 1,500 ms) added on the first press with the reference's key. A new key fault sits beside it (my C2). |
| C3, species pages gone offline after a deploy | **left** (by design) | Reproved 83→84 (my C6). |
| C4, what the suites cannot see | **half** | Round-84 specs test behaviour. 3 of 16 reverts fail nothing (my C8). |
| A22, Add moving under a press | **fixed** | `r84k 3` passes; it was not run in WebKit here. |
| A16, sync's TypeError, a 5xx photograph, the frost window, the site name, silent catches | **fixed** | Each revert fails its test. The 5xx count is unseen (my C7). |
| A14, one date rule | **fixed** | Unit tests pass. |
| A15, the `offline-tried` key | **fixed** | Listed. The privacy visit's keys all match /about/how. |
| A21, upload over a stale index | **fixed** | The gate's revert fails `r84g-walk-check`. Read, not run on a real corpus. |
| A23, simplification (`NotReached`, one time rule) | **fixed** | |
| B5, the number ledger in the log | **fixed** | Two reverts fail `r84u-ledger` and `r60-review-backup`. |
| B9, `/api/index` four hours | **left on the live site** | My C5. |
| B11, listings skip unreadable dossiers | **fixed** | Unit tests pass. |
| B12, predeploy's closing line | **fixed** | Unit test passes. |
| W8, restore counted at once | **fixed** | Its revert fails `r84u-frame` W8. |
| W13, the icons' console error | **fixed** | The live visit's console was clean. |
| B6, NEL undisclosed | still refuted | /about/how names it. |

## Confirmed working

**Headers**

| Answer | What it carries |
|---|---|
| Every answer, redirects included (the `301` from `/species/Ceropegia-Alstonii`, the `302`s) | HSTS, nosniff, `X-Frame-Options: DENY`, `no-referrer` |
| `/` and species pages | `private, max-age=60`, held (`x-cultifolio-page: held`) |
| The CSP | `object-src 'none'`, `frame-ancestors 'none'` |

**Redirects.** `ceropegia-alstonii`, `weingartia-fidaiana`, `trichocereus-pachanoi` and the merged `echeveria-peacockii` each answer a `302` to the right page, `public, max-age=86400`, not held at the edge.

**The APIs and their caching**

| Route | Answer |
|---|---|
| `/api/corpus` | `no-store`, id `8520c2875b2699ba`, 256 buckets |
| `/api/counts` | 48,357 / 6,493 / 37,648, matching the index |
| `/api/search` | `no-store` without `c=`; a day under it. Invalid UTF-8 gives `[]`; out-of-range `n`/`at` are clamped. |
| `/api/dossier/zzz` | 400 |
| An unknown key | 404 |
| `/api/sheets` without `n` | 400 |
| `/api/sync/vault` GET | 405 `allow: POST` |
| `/maps/regions50.svg`, `/maps/regions110.svg` | `image/svg+xml`, a day |
| `service-worker.js` | `max-age=0, must-revalidate` |

No 500 anywhere.

**Privacy** (`C-s/privacy/privacy.json`)
- **Hosts:** cultifolio.com, inaturalist-open-data and upload.wikimedia.org only (photographs).
- **localStorage:** `visits`, `views`, `lastVisit`, `corpus`.
- **sessionStorage:** SvelteKit's two keys, listed on /about/how line 898.
- **Elsewhere:** one IndexedDB, one cache, no cookie.
- **Requests:** `/api/counts`, `/api/corpus`, `/api/names` and `/api/search` only where /about/how says.

**Sync and Replace** (read; the server is unchanged since round 83)
- A Replace's wipe and copy run in one transaction under `cultifolio-replace`.
- A second tab's pull is refused inside its own write: `storeIn` checks `STAGING_PENDING` and the run's key, so a vault left or replaced cannot leak into the new log. This closes the last review's "not traced".

**The device database at 2,000 plants and 72,877 changes**

| Step | Desktop | Pixel 7, CPU 4× | Round 84 review (desktop / phone) |
|---|---|---|---|
| My plants, first open | 2.4 s | 4.6 s | 2.3 / 4.7 s |
| My plants, after | 0.56 s | 1.8 s | 0.70 / 2.5 s |
| Search | 0.18 s | 0.61 s | 0.12 / 0.44 s |
| A plant page | 0.30 s | 0.74 s | 0.33 / 0.91 s |
| Today | 0.54 s | 1.4 s | 0.73 / 1.3 s |
| Backup (662 kB) | 2.0 s | 5.8 s | 1.4 / 5.2 s |
| Two tabs: a new plant seen | 82 ms | 295 ms | 75 / 31 ms |

Nothing was lost. Storage was 10 to 23 MB, not persisted.

**The build code for the next walk** (read, with the reverts)
- `--index-ready` fingerprints every dossier, genus file, index, manifest and the builder's code.
- The upload sends the manifest last, after `rclone check`.
- The carry rule refuses another key's snapshot.
- Every listing stops at an unreadable dossier.
- The plan resumes the walk and reads Kew's names and the varieties' names for every page after it.

One gap (read): nothing checks that the products the manifest names (`p/…`) exist on disk before the upload. A product deleted locally would be named by a manifest the bucket cannot serve. The Worker checks only the index and genera before adopting a manifest.

**Dependencies.** `npm audit --omit=dev`: 0.

## Simplification: the three changes that would most cut the next bug's risk

1. **One way a typed name gets its key.** The reference's search first, the name service only for names the reference lacks. Today four paths set `taxonKey`: a pick, the leave check, Enter and the late answer. Each has its own ordering rule, and C2 is their seam.
2. **One state for a form that saves and leaves:** idle, checking, adding, left. Today it is three booleans (`checking`, `busy`, `saved`), with `busy` cleared before the navigation; C3 is that gap. The same shape is on the propagation and import forms (not checked).
3. **One lookup from a plant to its page, by key as well as name, through the hash groups** (C4's alias lines). That retires the "Is it an older name?" special case for renamed headings and most "key differs" notices, and makes the next renaming round safe for growers' records.

## Not checked, with why

- **Worker CPU and memory at 48,357 pages.** That needs the dashboard or `wrangler tail`. Timings here include the proxy: 0.15 to 0.8 s an API answer.
- **WebKit and a real iPhone.** Not installed or available. C2 and C3 are proved in Chromium (desktop and the iPhone 13 profile) and C2 live.
- **The live sync server and E2EE.** Forbidden to create a vault; the code is unchanged since round 83.
- **How many of the 501 renamed names GBIF's suggest keys differently (C2).** Not counted, to keep under the request limit.
- **The build at full size.** No corpus here. Read and unit-tested only.
- **The propagation and plant-edit pickers' key race and double tap.** Same component and same `save` shape, read only.

## Needs from the PC

1. **Cloudflare dashboard** (C5): zone `cultifolio.com` → Caching → Configuration → Browser Cache TTL → "Respect Existing Headers". Then purge `/api/index`, `/api/counts` and `/sitemap.xml`. Then run `curl -sI https://cultifolio.com/api/counts` twice: the second should say `cf-cache-status: HIT` and `max-age=300`.
2. **On the iPhone, Safari** (C2, one minute, nothing sent):
   1. Open https://cultifolio.com/plants/new.
   2. Type `Hoodia alstonii`.
   3. Tap the page heading, wait two seconds, tap Add.
   4. Say whether the plant's page shows "this plant records key 5525665".
3. **On the iPhone** (C3): type `Haworthia cooperi` and double-tap Add quickly. Say how many plants My plants lists, and their numbers. Remove them after.
4. **WebKit:** `npx playwright test tests/e2e/r84k-picker.spec.ts --project webkit --project phone-webkit --repeat-each 5 --retries 0`, and paste the summary.

## Files

All in `/tmp/claude-0/rev85r/C-s/`:
- `reqlog.txt` and `live/`: the live requests, with headers and bodies;
- `privacy/`;
- `race/`: `race.mjs` and `live.mjs`; `run1.log`, `run3.log` and `run4.log`; `out*/results.json` and screenshots; `live-*.png`;
- `sw/`: `update.mjs`, `update.out` and `update1.out`;
- `db/`: `scale.mjs`, `desktop.json` and `phone.json`;
- `revert/`: `sweep.py`, `sweep.json` and `e2e-rv.log`;
- `unit.log`;
- `e2e/e2e.log`;
- `audit-*.json`.

The copies: `code/` (r85r), `r83/` (`ba78fb9`) and `rv/` (the revert copy, its three reverts still applied). `/tmp/claude-0/rev85r/code` was not changed.
