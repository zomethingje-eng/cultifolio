# Review C (the code, the server, security and the suites), round eighty-six

**Verdict: works with faults.** Round 85's Worker (`ba32fc3e`) over corpus `48c27bf790016ccc` answers every route correctly, carries its security headers everywhere, and the edge now keeps `/api/counts`, `/api/index` and `/sitemap.xml` at `max-age=300` on a HIT. Every round-85 fix in my area that I could run holds: the add form files the reference's key (live, Hoodia alstonii → 9269454), one press files one plant (0 duplicates in 38 hammer, double and "Save and add another" runs), a plant filed under GBIF's name for a renamed page finds its page (live, Ceropegia alstonii), and a species page read before an update now opens offline after it. **But one class of fault from the PC run is still open on the live site, in the Worker rather than the builder:** round 85 removed from a page's addresses the names Kew places in another plant, and the 404 path puts them back by asking GBIF. `/species/anacampseros-schmidtii` lands on *Anacampseros albissima* (Kew files the name under *A. dinteri*, which has its own page), `/species/echinopsis-chalaensis` on *E. macrogona* and `/species/orbea-carnosa` on *Orbea carnosa* subsp. *keithii* (Kew accepts both as their own species), each with a line that says something false about Kew. And a press of Return or Enter in the name field, then Add while the reference's search is still out, files the plant with no key (10 of 10 runs). The first should be fixed before a botanist reads the site.

**Scores (my areas)**

| Area | Score | Why | What makes it a 10 |
|---|---|---|---|
| Server and Worker | 7.5 | Routes, errors, caching, headers and round 85's redirects are right. The 404 path's GBIF fallback undoes the Kew rule for names Kew places elsewhere (C1). The old-address line depends on which data centre answers (C3). | The fallback checks Kew's placement before it redirects; the line read from the page's own record. |
| Security and privacy | 9 | No fault. Hosts, storage keys, cookies (none) and API calls match /about/how. Production audit: 0. | The 5 low dev advisories cleared with Kit 3. |
| Races and the device | 7.5 | Round 85's key and double-press faults are fixed and hold on desktop and phone. The Enter path still arms "Add as typed" before the reference answers (C2). The database at 2,000 plants is as before. | Enter arms only after a concluded check. |
| Service worker | 8.5 | The 84→85 update is clean, the old build swept, and the carried page opens offline. Its maps do not (C4). | The carried pages' map files carried with them. |
| Build code (next walk) | 8.5 | The six PC faults are fixed with behavioural tests; the live sample (758 dossiers) has every credit and summary dated. I found no more of that class in the builder. The Windows-name guard covers the repository, not the corpus the builder writes (C8). | A guard on the corpus's file names; Commons' redirected files checked (not checked here). |
| Suites | 8 | Unit: 5,324 passed. Browser, strict, Chromium and phone: 823 passed, 5 skipped, 0 failed, 0 flaky. 9 of 12 round-85 fixes I took back fail a test; 3 fail none (C7). The source-text ceiling undercounts (C6). Nothing tests C2's Enter path. | A test for each of C7's three and for C2; the ceiling counting helpers. |

**What I covered**

- **Live site** (cultifolio.com):
  - 86 requests by `curl` (`C-s/reqlog.txt`): headers, every API's caching and errors, the redirects, the edge cache, the sheets' `via: 'gbif'` copies, 13 addresses of names Kew places elsewhere and the pages they reach.
  - One Chromium visit (`C-s/privacy/privacy.mjs`): 12 steps, two plants added in the browser's own storage. **Playwright counted 834 requests to cultifolio.com**, which takes my count to 920, over the 800 allowed. Most of them were the pages' own module requests answered by the service worker's cache: 179 were the worker's own fetches (139 of them its install) and 117 the first two pages' before the worker took over, so about 300 reached the site. I made no live request after it.
  - No vault, no POST. Third-party: one request of my own, to Commons' API, refused ("You are making too many requests"); the visit loaded 37 iNaturalist and 8 Commons photographs.
- **Local**, port 4891 under the lock:
  - the race harness (`C-s/race/race.mjs`, round 85's with three new acts): 60 desktop and 29 phone runs (`run1-full.log`, `run2.log`);
  - the 84→85 service-worker update (`C-s/sw/update.mjs`): round 84's build (`r85base`) then this round's (`r86r`), one profile;
  - the database at 2,000 plants and 72,877 changes (`C-s/db/`), desktop and a 4×-slowed Pixel 7;
  - the strict browser suite, Chromium and phone (`C-s/e2e/e2e.log`).
- **Unit suite**, once, whole, under `nohup`: 589 files passed and 1 skipped; 5,324 tests passed and 11 skipped; 818 s (`C-s/unit.log`).
- **Browser suite, strict** (`CI_STRICT=1`, `--workers=2`, port 4891, Chromium and the phone, once): 823 passed, 5 skipped, 0 failed, 0 flaky, 19.7 min of tests on a machine shared with four reviewers (`C-s/e2e/e2e.log`). 12 files hold `chromiumOnly` tests (32 tags, each with its reason). The 6 fixed sleeps each say why.
- **Revert sweep:**
  - 12 round-85 fixes taken back one at a time against their unit tests (`C-s/revert/sweep.json`, `sweep2.json`);
  - two of them taken back in a build against `r85k-add.spec.ts` in Chromium, no retries (`revert/e2e-rv.log`).
- **Audit**: `npm audit --omit=dev` 0; the full audit 5 low (Kit, its adapter and plugin, `cookie`, `deepmerge`), as last round.

---

## Issues

### C1. Major: names round 85 took off a page's addresses (Kew places them in another plant) still lead there by GBIF's match, and the page then says something false about Kew

**What I did.** From the 758 live dossiers D saved (`D-s/dos/`), 39 hold `name.kew.elsewhere`, GBIF's names that Kew's file places only in another plant. I took the ten whose address no index entry holds, read each in Kew's file (`D-s/kew.db`), fetched its address live, then the page it reached (`C-s/live/ke-*`, `was-*`).

**What I saw.**

| Address | Kew's file | Live answer |
|---|---|---|
| `/species/anacampseros-schmidtii` | synonym of *Anacampseros dinteri* (a page here: `/species/anacampseros-dinteri`) | 302 → *Anacampseros albissima* |
| `/species/echinopsis-chalaensis` | accepted, its own species (no page) | 302 → *Echinopsis macrogona* |
| `/species/orbea-carnosa` | accepted, its own species (no page) | 302 → *Orbea carnosa* subsp. *keithii* |
| `/species/acanthocereus-haackeanus` | accepted, its own species (no page) | 302 → *Acanthocereus oaxacensis* |
| `/species/stapelia-reflexa`, `/species/gonostemon-deflexus` | synonyms of *Stapelia deflexa*, unplaced | 302 → *Orbea variegata* |
| `/species/trichocaulon-clavatum` | synonym of *Stapelia clavata*, unplaced | 302 → *Larryleachia cactiformis* |
| `/species/weingartia-vilcayensis` | synonym of *Weingartia westii* | 302 → *Weingartia westii* (right) |
| `/species/echinopsis-santaensis` | synonym of *Echinopsis pachanoi* | 302 → *Echinopsis pachanoi* (right) |
| `/species/hydrangea-lindleyana` | synonym of *Hydrangea serrata* var. *yesoensis* | 404 |

So 9 of 10 redirect, and 7 of them to a page Kew's file does not give the name to. The pages then say (live HTML):

- *A. albissima*: "**Anacampseros schmidtii** is an older name of this species in GBIF's backbone, which files it under *Avonia albissima*, GBIF's name for this plant. Kew's World Checklist accepts the plant as *Anacampseros albissima*, which heads this page, and does not list this name among its synonyms." Kew lists it, under *A. dinteri*, which has its own page. A grower with a label reading "Anacampseros schmidtii" is sent to the wrong species.
- *E. macrogona*: "**Echinopsis chalaensis** is, in GBIF's backbone, a synonym of a subspecies or variety of *Trichocereus macrogonus*, GBIF's name for this plant. Kew's World Checklist accepts the species as *Echinopsis macrogona*". Kew accepts *E. chalaensis* as its own species.
- *O. carnosa* subsp. *keithii*: "**Orbea carnosa** is, in GBIF's backbone, a synonym of a subspecies or variety of *Ceropegia keithii* … Kew's World Checklist accepts the species as *Orbea carnosa* subsp. *keithii*". Kew accepts *Orbea carnosa*, the species, of which the page is one subspecies.

These are stapeliads and cacti, the owner's groups. Each breaks rule 3 (a page matched by GBIF's name where Kew's file says otherwise) and rule 1 (a sentence about a source that the source does not hold). It also undoes round 85's own promise: "a name Kew holds only in another plant leaves the page's older names, search names and addresses". The build keeps it; the Worker does not. Round 85 gave GBIF's other path, an accepted name matched exactly, a Kew check (`gbifNamedPage` refuses where `name.kew.accepted.other` is set), but not this one.

**How many.** 22,718 names on 7,943 pages are `name.kew.elsewhere`. In the sample, most of those whose slug no page holds redirected. I did not count the whole corpus, to stay inside the request limit; "Needs from the PC" 2 gives the count offline.

**Where.**
- `src/lib/server/synonyms.ts:111-127`, `synonymAsk`: GBIF says SYNONYM, so the address goes to the page holding GBIF's accepted key. Kew is not read.
- `src/routes/species/[slug]/+page.server.ts:96-103`: the redirect, `public, max-age=86400`, so a browser keeps it a day.
- `src/lib/ui/ref/was-words.ts:77` (`below`) and `:100` (`inGbif`): the line is written from GBIF's lists and Kew's synonyms of this page alone. The dossier's `name.kew.elsewhere` is never read, though it holds the very name (the *A. albissima* record lists "Anacampseros schmidtii (Berger) Poelln." there).

**Should.** An address of a name Kew places in another plant goes to that plant's page when the reference has one (*A. schmidtii* → *A. dinteri*). Otherwise it answers 404 and says what Kew holds ("Kew's World Checklist accepts *Echinopsis chalaensis* as its own species; the reference has no page for it"). It never leads to the page GBIF lumps it into.

**The index already knows the answer.** The live index's *Anacampseros dinteri* entry lists "Anacampseros schmidtii" under `kew`, Kew's older names for the plant. But that field is "searched, never shown, never an address" (`src/lib/dossier/index-entry.ts:34-39`, round eighty). So Kew's own synonym makes no address, and GBIF's synonym does. Round 85's "Kew everywhere" did not reach this seam.

**Smallest fix.** In the 404 path, before GBIF is asked, take a name the index's `kew` lists hold for exactly one page as that page's address (A. schmidtii → A. dinteri), with a Kew-worded line. In `synonymAsk`'s SYNONYM branch, before returning a slug, read the target's dossier, as `gbifNamedPage` already does, and return null when the name is in its `name.kew.elsewhere`. In `wasLine`, never say "does not list this name among its synonyms" of a name in `kew.elsewhere`. Test: the three addresses above against a fixture with GBIF's three match answers.

### C2. Major: Return or Enter in the name field, then Add while the reference's search is out, files the plant with no key

**What I did.** `C-s/race/race.mjs`, the new act `enter-add`: type "Copiapoa humilis", press Enter in the field, wait 150 or 400 ms, press Add. `/api/search` answered after 900 or 1,500 ms and `/api/names` failed. Then "Hoodia alstonii" with the name service answering after 2.5 s. Desktop and the iPhone 13 profile.

**What I saw.** In 10 of 10 runs the button read "Add as typed" before the press, and the plant was stored with `taxonKey: null` (`race/run2.log`, `out2/I-*.png`). The reference holds the name and answered a moment later. The plant page says nothing about a missing key (`out2/I-enter-add-s1500-g150-desk.png`). Round 84's guard, `G-enter-held`, still passes: the label goes back to "Add" once the search answers. The press inside that window is the one that goes wrong.

On a phone the keyboard's Return is Enter, so this is a phone grower typing a name, tapping Return, then tapping the button on a slow connection. The press is not lost, but it is armed wrongly, which the brief asks to prove cannot happen. For an ordinary name the plant still finds its page by its name. For GBIF's name of a renamed page ("Ceropegia alstonii"), the `via: 'gbif'` copy is taken only for a plant of that key, and no older-name line was shown to fill `olderOf`. So, reading the code, that plant would have no page (`index.svelte.ts:339`; not run).

**Where.** `SpeciesPicker.svelte:646-650`: Enter with no exact row yet sets `armed = true` and starts `checkExact()` without awaiting it. `plants/new/+page.svelte:210`: with `nameArmed` set, `save()` skips `picker.check()`, which is the step that awaits the reference.

**Should.** "Add as typed" appears only after the check has concluded that the reference does not hold the name, as it does for a press.

**Smallest fix.** In the Enter handler, `await checkExact()` and set `armed` only when it leaves the name unresolved. Or have `save()` call `picker.check()` even when armed, if the reference's search for this text has not yet answered. A browser test: names failing, search held 1.5 s, Enter, Add after 200 ms; expect the reference's key.

### C3. Minor: the old-address line for a name GBIF files below the species is shown or not depending on which Cloudflare data centre answers

**What I did.** Fetched `/species/echinopsis-macrogona?was=Echinopsis%20chalaensis` five times, 0.6 s apart (`C-s/live/wchal*`).

**What I saw.** Two answers from IAD had no line, and no visible word of *E. chalaensis*. Three from EWR had it. The line (`wasBelow`) is drawn only when the Worker's cache in that data centre holds GBIF's match from the redirect (`+page.server.ts:205-208`, `cachedMatch`). A redirect answered in one data centre and the page in another, or a cache entry evicted, gives a grower the page with no word why they are there. (For this name the line is also wrong, C1.)

**Should.** The line is read from what the page's own record holds, which includes GBIF's names under the varieties (`name.infra`) and Kew's placements, not from a cache.

**Smallest fix.** Test `was` against `d.name.infra` and `kew.elsewhere` before `cachedMatch`. Or, on a miss, ask GBIF's match as the 404 path does: the same cached call, rate-limited.

### C4. Minor: a species page carried over an update opens offline without its maps

**What I did.** `C-s/sw/update.mjs`, one Chromium profile:
1. Under round 84's build, read `/species/copiapoa-cinerea`.
2. Started round 85's build on the same port and waited 90 s online, for the carry.
3. Stopped the server, cleared the HTTP cache, and opened the page.

**What I saw** (`sw/update.out`, `sw/out/`)
- The update took over in a second. Round 84's cache was gone after a reload, and the carry list was empty (`/species/copiapoa-cinerea/__data.json` in the new cache).
- Offline, the page opened whole: the name, the four habitat figures and the months (`offline-after-_species_copiapoa_cinerea.png`). Round 85's C6 is fixed.
- But none of the four files its maps draw from was in any cache: `/maps/land110.svg`, `/maps/land50.svg`, `/maps/w/w-CLN.svg` and `/maps/r/r-CLN.svg` (`caches.match` false). So both maps draw nothing.
- A page read online under round 85, then offline, had all four.

**Where.** `src/lib/core/sw-keep.ts:170-195`, `carryOver`: it fetches the species page's build files and each page's `__data.json`, not the static files the page draws. The two land files every species page uses are not in the precache either (`service-worker.ts:66`, `OFFLINE_FILES`).

**Should.** A page that opens offline opens with its maps.

**Smallest fix.** Add `/maps/land50.svg` and `/maps/land110.svg` to `OFFLINE_FILES` (they are shared). In `carryOver`, after a page's data, fetch its regions' `w-`/`r-` files (the data names the regions; about 10 kB each at the median).

### C5. Minor (read, not run): a dossier that cannot be read on the 404 path is answered as "no page", kept five minutes

`synonyms.ts:139`, `gbifNamedPage`: `getDossier(...).catch(() => null)`, then `if (!d …) return null`. So for a renamed page's former heading (the case round 85 added, e.g. `/species/conophytum-calculus-vanzylii`), a bucket read that fails is answered "No species page for …" with `public, max-age=300` (`+page.server.ts:107`), not as a check that did not happen. This is a source's failure read as an answer, the class the PC run found. **Fix:** return `'unchecked'` when the read throws, so the 404 says it was not checked and is `no-store`.

### C6. Minor (suites): the source-text ceiling counts 153 assertions, but a test can read the source through a helper and is not counted

`tests/unit/r85q-source-text.test.ts:25-40` counts an assertion only when its `expect()` reads `readFileSync('src/…')` directly, or a variable bound to one. A helper such as `const code = (f) => readFileSync(f, …)` hides it. Reading with the guard's own `CODEY` rule, I found **92 more code-shaped `toContain`/`toMatch` assertions on files under `src/` and `scripts/` in 17 files**, read through such helpers. Examples:
- `r62bw-pages-true.test.ts:17-18` (the dossier route's `no-store` and the worker's skip);
- `r69p-about-seams.test.ts:116-117` (the redirect's and the 404's `cache-control`);
- `r67p-reach.test.ts:112-118` (Today's check-again);
- `r80m-merge.test.ts:31-32`.

Two of these hide behaviour a test should drive: the redirect's lifetime and the 404's `no-store` when GBIF was not asked. A change to them passes as long as the line is spelt the same. And a new test can add assertions of this kind without the ceiling noticing. **Fix:** count any `expect(x)` whose `x` comes from a call that reads a path under `src/` or `scripts/`, helpers included. Set the ceiling at the true count (about 245), and convert the header-value ones first.

### C7. Minor (suites): three round-85 fixes that no test fails when taken back

**What I did.** Took each fix back alone in a copy (`C-s/rv`, deleted after) and ran its tests (`revert/sweep.py`). C2 and C3 were also taken back in a build and run against `r85k-add.spec.ts` in Chromium.

**What I saw.** 9 of 12 fail a test:
- C3 in the browser: `r85k 3` stored three plants;
- C4's `via` rule;
- the island box;
- deleted observations;
- photographs read before;
- the sync card;
- the carry;
- names Kew places elsewhere;
- the live check's HIT.

**These three pass every test, unit and browser, when taken back:**
1. **The reference's row replacing a key the name service gave** (`SpeciesPicker.svelte:256`, `fromNames` set to false). 14 unit tests and `r85k 2` both ways passed. The other half of round 85's C2 fix (`checkExact` awaits the search) covers every case the tests drive, so this line is either unreachable or untested.
2. **`gbifNamedPage`'s Kew guard** (`synonyms.ts:140`, `if (!d || d.name?.kew?.accepted?.other)` reduced to `if (!d)`). 7 files, among them `r85n-addresses`, `r67s-server` and `hooks`, passed. No test drives `synonymAsk`'s accepted branch at all. This is C1's seam.
3. **The names route's 8-second wait for GBIF** (`api/names/+server.ts:71`, the `AbortSignal.timeout` removed). `names-api`, `r62q-names-route`, `r60-review-server`, `r61h-upstream-cap` and `r85k-names` passed. Outside review A13's server half has no test.

**Should.** Each fix has a test that fails without it.

**Smallest fix.**
- (1): drive the case it exists for, or remove it.
- (2): a unit test of `synonymAsk` with GBIF's ACCEPTED answer and a dossier whose `kew.accepted.other` is set; expect null. Extend it to the SYNONYM branch with `kew.elsewhere` (C1).
- (3): a names-route test whose fetch never resolves; expect the 502 "did not answer within 8 seconds".

### C8. Polish: the Windows-name guard walks the repository, not the corpus the builder writes

`tests/unit/r85m-windows-names.test.ts` walks `src`, `static` and the rest of the repository; `static/s/` is not shipped, so it is not walked. The builder names files from the data, such as each genus's `g/<slug>.json`. Today no genus slug is reserved: I checked all 6,493 in the live index against CON, PRN, AUX, NUL, COM1-9 and LPT1-9, and none match. But a genus named "Aux" or "Con" would stop the next `git add` or copy on the owner's PC exactly as `CON.svg` did. **Fix:** test the same rule in `writeAtomic` (or in `--index-ready` over the corpus), so a reserved name stops the build with a sentence.

---

## The round-85 reviews' findings in my area

| Finding | Status | One line |
|---|---|---|
| C1 (review-c), "the GBIF backbone accepts" on old addresses | **fixed** | Live, `/species/ceropegia-alstonii` → "is GBIF's name for this plant … Kew's World Checklist holds it as a synonym of *Hoodia alstonii*". The same class remains for names Kew places elsewhere (my C1). |
| C2, GBIF's synonym key filed for Kew's heading | **fixed** | Live, Hoodia alstonii → 9269454. Locally 9 of 9 desktop and 9 of 9 phone runs (search at 0, 600 and 1,500 ms) filed the reference's key. The Enter path is my C2. |
| C3, a double tap files two or three plants | **fixed** | 6 hammer runs (3 to 11 taps), 6 double taps and 4 "Save and add another" double taps: one plant each. |
| C4, a plant under an old heading loses its page | **fixed** | Live, "Ceropegia alstonii" filed with key 9269454 and `olderOf` "Hoodia alstonii". Its page reads "Filed under GBIF's name for its key; the reference heads its page Hoodia alstonii · File it under Hoodia alstonii", with the Species page button. |
| C5, the zone's 4-hour edge answers | **fixed** | `/api/counts`, `HEAD /api/index` and `/sitemap.xml` are each a HIT with `public, max-age=300` (age 58 to 295). Redirects and 404s are not held at the edge. |
| C6, species pages gone offline after a deploy | **fixed** (half: maps) | 84→85: the page read under 84 opens offline under 85, without its maps (my C4). |
| C7, photographs not received said only in the console | **fixed** | `syncedWords` says it on the status card (`sync-words.ts:80`), and taking it back fails `r85u-frame`. |
| C8, fixes no revert fails; no tests for C2, C3 | **half** | `r85k 2` and `r85k 3` now exist, and the C3 revert fails `r85k 3` in the browser. Three round-85 fixes still fail no test when taken back (my C7). |
| C9, the worker's comments about dossiers | **fixed** | `service-worker.ts:16` and `:215` now say no page asks for a dossier. |
| Outside A10, a 309-digit number hangs the form | **fixed** (read) | `plantNumberProblem` in `addAccessions`; unit tests pass. |
| Outside A13, Add waits for the name service | **fixed** (the server's half untested) | Runs with the name service answering after 2.5 s filed with the reference's answer without waiting for it (the press itself is C2). The route's 8 s timeout can be removed with every test passing (C7). |
| Outside A17, sync photographs | **fixed** | As C7 above. |
| Outside A18 / B5, live check passes on a miss | **fixed** | `live-check-cache.mjs` judges a HIT, and taking `isHit` back fails 4 tests. Live, each second answer was a HIT that said 300. |
| Outside A19, silent catches | **fixed** (as written) | Every bare catch now says why in a comment. The ones I read act rightly, except C5's. |
| Outside A24, every product file checked before upload | **fixed** (read) | `--index-ready` reads each product file the manifest names and checks its MD5 (`build-dossiers.ts:2542`). |
| Outside B, an interrupted upload | **fixed** (read) | `upload-partial.json` and `partialSentence` say it; the prune refuses while it is there. |
| The six PC faults (CON.svg; same-type; island box; credits ×3) | **fixed** | Each has a behavioural test. In D's 758 live dossiers, 419 summaries all have a revision and day, and 21,176 iNaturalist and Commons photographs all have a day read. Taking back each of the island box, deleted observations and photographs read before fails its test. |

## Confirmed working

**Headers.** Every answer carries HSTS, nosniff, `X-Frame-Options: DENY` and `no-referrer`: rendered pages, prerendered pages, redirects, 4xx, the `/benches` 301 and static files. Dynamic pages carry the CSP header (`object-src 'none'`, `frame-ancestors 'none'`). The prerendered about pages carry the same policy in a meta tag, with X-Frame-Options covering framing. Private pages carry `x-robots-tag: noindex`. There are no cookies.

**Caching, live**

| Route | Answer |
|---|---|
| `/`, species pages | `private, max-age=60`, held by the Worker (a `held` copy within a second in one data centre; a `rendered` one after a hop to another) |
| `?was=` pages, `/compare` | `private, max-age=60`, not held |
| Redirects (old headings, merged, `via` names, renamed) | `public, max-age=86400`, not edge-held |
| 404 species | `public, max-age=300`, not edge-held |
| `/api/counts`, `/api/index`, `/sitemap.xml` | edge HIT, `max-age=300` |
| `/api/search`, `/api/sheets`, `/api/entries`, `/api/rows` | a day only under the current corpus (`c=`), else `no-store` |
| `/api/corpus`, `/api/dossier/*` | `no-store` |
| `/maps/w/*`, `/maps/r/*`, `/maps/regions110.svg` | a day, edge HIT. `/maps/regions50.svg` is 404, as it should be. |
| `service-worker.js`, about pages, manifest | `max-age=0, must-revalidate` |

**Errors, live.** Invalid UTF-8, 5,000-letter, `n=99999` and `at=-5` searches are answered and clamped. `/api/names?q=<script>` gives 400; `/api/dossier/zzz` 400; an unknown page id 404; a bare GBIF key a 302 to its page. Sheets without `n` give 400, with the wrong `n` 409, with five buckets 400. The sync routes give 400 on a bad vault id and 405 on GET. The forecast gives 400 out of range. There is no 500 anywhere.

**Redirects, live.** Each of these lands on the right page with the right line:
- `ceropegia-alstonii` → *Hoodia alstonii*;
- `hibiscus-acetosella` → *Sabdariffa acetosella*;
- `trichocereus-pachanoi` → *Echinopsis pachanoi*;
- `echeveria-peacockii` → *E. desmetiana* (merged);
- `stapelia-hirsuta-var-hirsuta` → *Stapelia hirsuta* (former heading);
- `ceropegia-tanzaniensis` → *Ceropegia cordiloba*.

`Ceropegia-Alstonii` answers 301 to lower case. The sheets hold the `via: 'gbif'` copies (`ceropegia-alstonii` in bucket `2a`, filed under `page: hoodia-alstonii`).

**Privacy, live** (`C-s/privacy/privacy.json`)
- **Hosts:** cultifolio.com, inaturalist-open-data.s3.amazonaws.com and upload.wikimedia.org.
- **localStorage:** `visits`, `views`, `lastVisit`, `corpus`, `persistAskedAt`, `persistAfterFirst`, `hasMine`, each named on /about/how.
- **sessionStorage:** SvelteKit's two keys.
- **Elsewhere:** one IndexedDB, two caches, no cookie.
- **APIs:** `/api/counts`, `/api/corpus`, `/api/names`, `/api/search` and `/api/sheets`, each only where /about/how says. The console was clean.

**The device database at 2,000 plants and 72,877 changes**

| Step | Desktop | Pixel 7, CPU 4× | Round 85 review (desktop / phone) |
|---|---|---|---|
| My plants, first open | 2.8 s | 5.0 s | 2.4 / 4.6 s |
| My plants, after | 0.54 s | 1.6 s | 0.56 / 1.8 s |
| Search | 0.13 s | 0.48 s | 0.18 / 0.61 s |
| A plant page | 0.37 s | 0.53 s | 0.30 / 0.74 s |
| Today | 0.56 s | 1.5 s | 0.54 / 1.4 s |
| Backup (663 kB) | 2.0 s | 7.0 s | 2.0 / 5.8 s |
| Two tabs: a new plant seen | 52 ms | 847 ms | 82 / 295 ms |

Nothing was lost. Storage was 12 to 22 MB, not persisted. The machine was shared with four other reviewers; the differences are within its noise.

**Races** (`race/run1-full.log`, `run2.log`)
- The list never showed without focus: 0 samples in 89 runs, every 50 ms.
- A tap on the next field never changed the name: 8 of 8.
- Both sources failing arms, then the second press files as typed: 2 of 2.
- Enter with the search held then released: the button returns to "Add" (`G`, 4 of 4).

**The builder** (read, with the tests)
- The credits fill counts only what it asked, drops a deleted observation's photographs only on a whole answer, stops at the allowance, and an inaccessible Commons answer is "not answered", never "none".
- The revision fill leaves a moved or missing article for `--fill summaries` without stopping the run for ever.
- The fetcher tells a 404 from a refusal and MediaWiki's 200-with-error from an answer.
- The step runner resumes, and `UNFINISHED` reads the fill's lines.
- Sync and Replace are unchanged since round 83 but for comments (diff read): the vault's byte counts, Replace's staging and the second tab's refusal are as round 85's review found them.

## Simplification: the three changes that would most cut the next bug's risk

1. **One resolver from an address to a page, and Kew decides it.** Today an address is resolved by four routes, each with its own Kew rule: the index's older names, the merged holder, GBIF's accepted match (with a Kew guard) and GBIF's synonym match (with none). The index's `kew` list, which holds Kew's answer, is "never an address". C1 lives in that seam. Read the index's Kew placements first; ask GBIF only for a name Kew's file does not hold, and never send it to a page whose record places it elsewhere.
2. **One way a typed name is armed.** "Add as typed" should be set in one place: when the check has concluded that neither the reference nor the name service holds the name. Today a press, a leave and Enter each set it, and Enter does it before the reference answers (C2).
3. **The old-address line read from the page's record, not from a cache.** The line is a claim about sources; it should not depend on which data centre answers (C3). The record already holds what it needs: GBIF's names under the varieties, Kew's synonyms and the names Kew places elsewhere. Drawing the line from them alone also makes C1's false sentences impossible to write.

## Not checked, with why

- **Worker CPU and memory at 48,375 pages.** That needs the dashboard or `wrangler tail`. Answers here, through the proxy, took 0.15 to 1.8 s; a missing species address 1.2 to 1.7 s, which includes GBIF's match.
- **WebKit and a real iPhone.** Not available here. C2 is proved in Chromium (desktop and the iPhone 13 profile).
- **The live sync server and E2EE.** Forbidden to create a vault; the code is unchanged in substance.
- **Commons' answer for a redirected file title** (whether `--fill credits` would drop a renamed file as "no licence stated"). Commons refused this sandbox.
- **C1's full count over the corpus.** Not counted, to keep within the request limit (Needs 2).
- **The C2 consequence for a renamed name** (a plant with no key and no `olderOf` losing its page). Read, not run: the local corpus has no `via` copy.

## Needs from the PC

1. **On the iPhone, Safari** (C2; one minute; nothing sent but the plant's own requests):
   1. Open https://cultifolio.com/plants/new.
   2. Type `Copiapoa humilis` and tap the keyboard's Return.
   3. If the button reads "Add as typed", tap it at once.
   4. On the plant's page, open ··· → Edit and say whether a GBIF key is shown.
   5. Remove the plant after.
2. **C1's count, offline, in the project folder:**

   ```
   node -e "const fs=require('fs'),d='static/s/v3/',idx=require('./'+d+'index.json'),sl=n=>n.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/×/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),held=new Set();for(const e of idx){held.add(e.slug);for(const s of [...(e.syn||[]),...(e.older||[]),...(e.kew||[])])held.add(sl(s))}let n=0,p=0;for(const f of fs.readdirSync(d).filter(f=>/^[kg]\d+\.json$/.test(f))){const x=JSON.parse(fs.readFileSync(d+f));const el=(x.name&&x.name.kew&&x.name.kew.elsewhere)||[];let k=0;for(const s of el){const m=/^([A-Z][a-z]+ [a-z-]+)/.exec(s);if(m&&!held.has(sl(m[1]))){n++;k++}}if(k)p++}console.log(n+' names on '+p+' pages whose address no page holds')"
   ```

   Paste the line back. Each such address goes to GBIF's match today.
